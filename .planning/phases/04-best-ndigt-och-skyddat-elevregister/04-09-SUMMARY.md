---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "09"
subsystem: register-read-api
status: complete
completed: 2026-09-28
tags: [typescript, postgres, audit, projection, server-api]
requires: [04-04, 04-07, 04-08]
provides:
  - Slutna request- och responsekontrakt för elevregistret
  - Auditerade lista-, kort- och historikroutes
  - Förberedda adaptrar för installerade ändrings-, reveal- och exportfunktioner
affects: [04-10, 04-12, 04-13, 04-21]
requirements-addressed: [STU-01, STU-02, STU-05, DATA-01]
requirements-finally-verified: []
---

# Fas 4 plan 09: auditerade registerläsningar

Registerläsning går genom levande session och SQL-mandat, sluten fältprojektion samt objekthändelser och huvudlogg i samma transaktion före HTTP-svaret.

## Genomfört

- `POST /api/elever/lista` tar `{selection,search,caseId}` enligt modellen. Same-origin krävs även om det är en läsning. Sökord ligger enbart i request-body. Identitets-/datumformad sökning avvisas för andra funktioner än administratör; SQL avgränsar därefter varje träff.
- `GET /api/elever/elev` tar `pupilId`, `schoolYear` och valfritt `caseId`; `GET /api/elever/historik` kräver dessutom `page`. Andra eller upprepade querynycklar avvisas. Ärendescope prövas i SQL med uttryckligt case-ID. Historik kräver administratörsfunktion; känd men otillåten respektive okänd elev ger samma generiska 404 från SQL.
- Alla tre routes använder `protectedRoute` med obligatorisk audit, aktuell epoch och `no-store`. Parametriserad SQL går genom `mandateOperation` och dess isolerade lokala målskydd. `auditPupilRegisterResult` skriver extra skyddade objekthändelser före huvudloggen; huvudloggen sker innan transaktionen committas och svaret skapas.
- Serveradaptern accepterar bara exakta requestnycklar, riktiga kalenderdatum, UUID, heltalsgränser, slutna unioner och syntetiskt personnummerformat med datum/Luhn. Databasen behåller auktoritet över syntetisk allowlist och mandat. Aktör, kund och loggreferenser kan inte väljas av klienten.
- Responsen byggs om rekursivt från slutna fältscheman. Extra eller feltypade SQL-fält stoppas utan partiell body. Personnummer tillåts aldrig i lista, kort, historik eller källkonflikt. Personnummerhistorik kräver uttryckliga `null`-värden; källkonflikt för identitet har inga före-/eftervärden. Ursprungsfält och perioder kopieras separat, inklusive ärligt `null` för kommunproveniens som saknas. `auditRefs` lämnar aldrig servern.
- Adaptrar för `phase4_change_pupil`, separat nummerläsning och export/preview finns inför 04-10. Endast de tre läsvägarna öppnas för Worker av migration 141; ändring/reveal/export har inga routes här och behåller stängda SQL-privilegier. Create saknar SQL-dispatch och `resolve-source` stoppas före SQL tills 04-06 implementerats. Versionskonflikt returneras som validerad `details` och loggas som nekad ändring plus tillåten konfliktläsning, inte rått SQL-undantag.

## Verifiering

| Kontroll | Faktiskt resultat |
|---|---|
| RED adapter/route | Saknad adapter stoppade den nya testfilen före implementation |
| `node --test lib/server/pupil-register.test.mjs` | PASS 10/10 |
| Befintlig `pupil-register-audit.test.mjs` | PASS 9/9 |
| `pupil-register-model.test.mjs` | PASS 18/18, inklusive RED→GREEN för 240 teckens konfliktnamn |
| `npx tsc --noEmit` | PASS |
| `npx oxlint app lib` | PASS |
| Verklig lokal Worker/API (`web/test-results/phase4-reads.json`) | PASS 5/5, byggd Worker med riktig OIDC och PostgreSQL |
| Migration 141 efter API-grinden | Tillämpad lokalt efter `assertTarget`, CLI exit 0 |
| Uppdaterad projektions-/ACL-fixtur | PASS 146/146, exakt källfixtur via målskyddad intern Docker/psql |

Node-proven kör de riktiga routes, `protectedRoute`, audithelper och metadatafilter. Session-/databasgränsen är simulerad. Fel på första och andra extra objekthändelsen samt huvudloggen återställer simulerade händelser och lämnar inget elevinnehåll. Orkestratorns verkliga prov belägger dessutom att lista, kort och historik har committad huvudlogg innan svar, och att verkliga databasloggfel ger inget elevinnehåll. Skyddad läsning kräver skolbundet beslut och separat committad objekthändelse; fel även på den händelsen stoppar svaret. Huvudman/IT nekas, lärare får begränsad klassprojektion. Första OIDC-försöket misslyckades före registeranrop; omkörningen passerade 5/5 utan appkodändring (`/tmp/skolplattform-wave5-api-retry.log`). Tillfälliga API-provprivilegier återställdes före permanent migration 141.

SQL-provets första CLI-försök fick lokal TCP-timeout före några testfall. Omkörningen nådde 145/146 och visade att den nya Worker-kontrollen försökte använda en testhjälpare utan EXECUTE-rätt. Requesten förberäknas nu före rollbytet; inga rättigheter gavs till testhjälparen. Därefter kördes exakt samma källfixtur via intern Docker/psql efter `assertTarget`: exit 0, 146 `ok`, slutplan `1..146`, inga `not ok`. Minimerad rapport finns i `work/pilot/results/phase4-projection.json`, full TAP i `/tmp/phase4-09-docker-sql.log`. Ingen reset eller omstart gjordes.

## Avvikelser

1. **Rule 2 — smal öppning först med audit:** 04-04 lämnade alla nya läsfunktioner stängda. Den nya migrationen `20260929141000_phase4_read_worker.sql` öppnar endast list/card/history och tillämpades först efter riktiga API-bevis. Gamla tillämpade migrationer ändras inte. Anon/authenticated och interna SQL-hjälpare förblir stängda.
2. **Rule 1 — namnkontrakt:** Databasen tillåter visningsnamn på 240 tecken men konfliktdetaljparsern hade 200. Modellen och ett gränsprov är korrigerade till 240; SQL-ändringsagenten använder samma gräns. Responsnamn/etiketter tillåter upp till 10 000 tecken för att inte avvisa längre befintliga skol-/klass-/utbildningsnamn.
3. Handbok/global planstatus och riktiga API-fixturer ägs av orkestratorn. Ingen registervy införs här. Full fasgrind och senare UI-prov återstår; syntetiska lokala prov godkänner ingen verklig kommunanslutning eller drift.

## Kravspårning och commits

- STU-01/STU-02/STU-05: slutna lista/kort/historik, stabila elev-ID, versionskontrakt och kalenderperioder prövas i `pupil-register.test.mjs`; SQL-projektionen ägs av 04-04.
- DATA-01: projektion, maskerad identitet/historik/källkonflikt, same-origin, roll/epoch, auditRefs och stopp vid loggfel prövas i samma fil och audithelperns prov.
- `72f1efd` — RED-kontrakt och routes.
- `e710c79` — serveradapter, maskering, förberedda stängda åtgärder och modellens namngräns.
- `0149ea0` — tre auditerade läsroutes och avgränsad GRANT-migration.
- Uppföljande test-/dokumentcommit omfattar ACL-matris för de tre läsfunktionerna över Worker/anon/authenticated samt faktiskt Worker-anrop.
