---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "10"
subsystem: register-write-api
status: complete
completed: 2026-09-28
tags: [typescript, audit, mfa, csv, server-api]
requires: [04-05, 04-06, 04-09]
provides:
  - POST /api/elever/andra för den stängda ändringsunionen inklusive källbeslut
  - POST /api/elever/personnummer med MFA och egen visningshändelse per anrop
  - POST /api/elever/export med separat preview och buffrad CSV efter loggcommit
affects: [04-13, 04-16, 04-19, 04-21]
requirements: [STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02]
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
key-files:
  created:
    - web/app/api/elever/andra/route.ts
    - web/app/api/elever/personnummer/route.ts
    - web/app/api/elever/export/route.ts
  modified:
    - web/lib/server/pupil-register.ts
    - web/lib/server/pupil-register.test.mjs
key-decisions:
  - "Exportanropets kropp är {mode:'preview'|'download', export: ExportSelection}; preview kräver inte MFA och lämnar bara antal, nedladdning kräver MFA och räknar om urvalet"
  - "Tomt exporturval ger 400 bad_request med details.reason='empty-selection' i både preview och nedladdning, utan andra antal"
  - "Worker-EXECUTE för phase4_change_pupil, phase4_resolve_source, phase4_reveal_personal_number och phase4_export_pupils öppnas inte i denna plan; SQL-fixturerna kräver fortfarande stängt läge"
actuals:
  tokens: 8900
  tasks: 2
  commits: 3
plan_head_before: d279deab65d71381a79c3307bc467701422b0e3f
duration: 25min
---

# Fas 4 plan 10: skyddade API:er för ändring, personnummer och export

**Worker-API:erna för elevändring, uttrycklig personnummervisning och export finns nu. De kräver administratör, MFA och samma ursprung där det behövs, och loggen skrivs innan svaret lämnas. Hela kedjan är provad med simulerad databas- och sessionsgräns. Databasens EXECUTE-rätt för Worker är fortfarande stängd, så vägarna ger ännu ingen verklig funktion mot den lokala databasen (se Kvarstående).**

## Genomfört

- **`POST /api/elever/andra`** tar emot `ChangeRequest` via den befintliga stängda parsern: `basics`, `municipality`, `transfer`, `education`, `end-placement`, `class` och `resolve-source`. Routen kräver `mutating:true` (same-origin), `mfa:true`, obligatorisk loggning och funktionen administratör. Skapande har ingen SQL-ingång och nekas av parsern.
- `changePupil` skickar `resolve-source` till `phase4_resolve_source` (04-06) och övriga typer till `phase4_change_pupil` (04-05). SQL:en tar fram aktören, låser kund och elev och prövar levande mandat, spärr, skydd, D-20 och `expectedVersion` i samma transaktion. Vid lyckad sparning innehåller svaret bara `{pupilId,version,warnings}`, aldrig personnummer eller andra elevvärden. Klienten läser om elevkortet efter commit.
- **Versionskonflikt:** Ett typat SQL-resultat av sorten `conflict` returneras, det kastas inte. `auditPupilRegisterResult` projicerar tillåtna detaljer och skriver den nekade skrivningen med `outcome=denied` samt eventuella skyddade visningar. Huvudhändelsen heter `pupil_conflict_read`. Svaret är `409 {code:'conflict',details}` och kommer från `protectedRoute`, så händelserna committas tillsammans. `pupil_updated` eller `pupil_source_resolved` loggas aldrig som `ok` vid 409. Konflikter från systemkällan (`changedBy:'Simulerad källa'`) går igenom parsern.
- **Loggfel:** Om en objekt- eller huvudhändelse fallerar kastas `AuditUnavailable` och hela transaktionen rullas tillbaka. Det gäller mutation, ursprung, historik och version. Svaret blir `500 audit_unavailable` utan elevinnehåll.
- **`POST /api/elever/personnummer`** tar `{pupilId,schoolYear,caseId}` via stängd parser. Anropet kräver MFA, same-origin (kontrolleras först i handlern) och administratör. Varje anrop skriver en egen objekthändelse `pupil_personal_number_read` utöver huvudhändelsen. Helpern kräver en `personal-number`-referens för just den eleven, annars lämnas inget nummer. Elevkortets GET hämtar aldrig personnummer, och kortparsern stoppar ett sådant fält.
- **`POST /api/elever/export`** har kroppen `{mode:'preview'|'download', export: ExportSelection}`. Både preview och nedladdning anropar `phase4_export_pupils`, som räknar om urvalet. Nedladdning kräver `requireMfa`, preview gör det inte. Preview lämnar `{count,fields,includePersonalNumber}`. Om SQL-svaret innehåller rader eller personnummerreferenser i preview stoppas det.
- Vid nedladdning valideras raderna mot exakt de begärda kolumnerna och det omräknade antalet. CSV-filen byggs med `registerCsv` → `csvRow`/`csvCell`, vilket ger formelskydd, citering, BOM och CRLF. Filnamnet är `syntetiskt-elevurval-{ÅÅ}-{ÅÅ}-{ÅÅÅÅ-MM-DD}.csv` enligt UI-SPEC, och svaret har `text/csv`, `nosniff` och `no-store`. Filen ligger i minnet som `Response` tills `protectedRoute` har skrivit huvudhändelsen och committat. Ingen streaming och ingen tempfil.
- Export loggas med egna händelsetyper: `pupil_export_preview`, `pupil_exported` och `pupil_personal_number_exported` per elev. Skyddade rader får `pupil_protected_read`. Huvudhändelsens `fields` tar med `personalNumber` när det valts, och `count` anges.
- Ett tomt urval ger generiskt `400 bad_request` med `details.reason='empty-selection'` i båda lägena. Främmande eller otillåtna ID ger SQL `P0002`, alltså `404 not_found`, och fel funktion ger 403. Inget svar anger något skyddat antal.

## Verifiering

| Kontroll | Faktiskt resultat |
|---|---|
| RED, uppgift 1 | Testfilen stoppade före implementation (saknade routes `andra`/`personnummer`) |
| RED, uppgift 2 | Testfilen stoppade före implementation (saknad route `export`) |
| `node --test lib/server/pupil-register.test.mjs` (efter uppgift 1) | PASS 20/20 |
| `node --test lib/server/pupil-register.test.mjs lib/server/pupil-register-audit.test.mjs` | PASS 33/33 |
| `node --test lib/*.test.mjs lib/server/*.test.mjs` | PASS 383/383 (`/tmp/04-10-node.log`) |
| `npx tsc --noEmit` | PASS |
| `npx oxlint app lib` | PASS (en lintanmärkning i nytt test rättad före commit) |
| `npm run build` | PASS; `/api/elever/andra`, `/export`, `/personnummer` finns i byggets routelista (`/tmp/04-10-build.log`) |
| SQL/databas, verklig Worker, browser | **Ej kört i denna plan.** Se Kvarstående. |

Node-proven kör de riktiga routes, `protectedRoute`, `requireMfa`, `requireSameOrigin`, `mandateOperation`, audithjälparen och CSV-byggaren. Session-, databas- och loggtabellgränsen är simulerad. Den simulerade transaktionen återställer både loggade händelser och registrerade mutationer vid fel.

### Krav → prov (syntetiskt, simulerad DB-gräns)

- **STU-01/02/03** (ändring av basuppgifter, placering/klass/utbildning, periodtyper): unionen dispatchas oförändrad till SQL. Varje typ ger sin egen ändringshändelse. Varningen `class-education-mismatch` följer med i svaret. Periodreglerna prövas av 04-05:s SQL-fixturer, inte här.
- **STU-04** (källbeslut): `resolve-source` går enbart till `phase4_resolve_source` och loggas som `pupil_source_resolved`. En konflikt från systemkällan returneras som 409.
- **STU-06** (versionskonflikt, atomicitet): 409 med code och details, en nekad skrivning och en tillåten konfliktläsning. Loggfel vid händelse 1–3 ger 500 utan details. Loggfel efter sparning återställer den simulerade mutationen.
- **DATA-01** (skydd, personnummer): MFA, same-origin och funktion prövas innan SQL anropas. Personnumret lämnas bara med egen händelse per anrop. Fel referens, fel format eller loggfel ger inget nummer. SQL-feldetaljer med värden läcker inte.
- **DATA-02** (export): preview och nedladdning prövas separat, MFA krävs vid nedladdning, kolumnerna är slutna, antalet stäms av, formelskydd och filnamn prövas. Personnummerexport och skyddad visning loggas som egna händelser. Loggfel ger inga bytes.

Inga krav är slutverifierade här.

## Avvikelser

1. **Rule 1: källbeslut.** Adaptern från 04-09 nekade `resolve-source` eftersom SQL saknades. Funktionen finns sedan 04-06, så det befintliga provet skrevs om så att det kräver dispatch till `phase4_resolve_source` och aldrig till `phase4_change_pupil`.
2. **Rule 2: kontroll av antal i export.** Nedladdningen kräver nu att antalet rader är lika med SQL:s `count`. Huvudhändelsen tar med `personalNumber` i `fields` när det valts. Tomt urval kontrolleras innan någon logg skrivs.
3. Exportkroppens form (`mode` + `export`) definierades här eftersom `ExportSelection.mode` redan betyder `ids`/`filter`. Typen `PupilExportPost` exporteras från serveradaptern. 04-13 kan spegla den i klientmodellen.
4. En samtidig commit av användaren (`cf3106a`, AGENTS.md om löpande push) ligger mellan planens två commits. Den ingår inte i planen men räknas i det uppmätta antalet commits (3).

## Kvarstående begränsningar

- **Worker-EXECUTE är stängd (blockerar verklig användning).** `phase4_change_pupil`, `phase4_resolve_source`, `phase4_reveal_personal_number` och `phase4_export_pupils` är fortfarande revokerade för `skolplattform_worker`. SQL-fixturerna `phase4_periods`, `phase4_export` och `phase4_register` kräver uttryckligen detta stängda läge. Mot den lokala databasen ger de nya routes därför 403 tills en separat grant-migration finns. Den ska följa mönstret från 141000/131000: öppna endast de fyra funktionerna, uppdatera ACL-assertionerna och bevisa med verklig Worker/OIDC/PostgreSQL innan migrationen tillämpas. Detta ingick inte i planens filer och provades inte här. Det måste göras före 04-13:s browserprov och 04-16:s E2E-fall.
- Ingen verklig databaskörning, inget tvåanslutningsprov via API, ingen browserverifiering och ingen handbok (skrivvägen är inte användarsynlig förrän 04-13).
- Äldre fas 3-fixturer är fortfarande övergångsröda enligt våg 6; portningen ägs av 04-14/15.
- Samlad UI-grind (04-19), full fasgrind (04-21), användar-/fasverifiering och verklig kommunanslutning återstår. Syntetiska prov godkänner ingen drift.

## Commits

- `6a17c4a`: ändrings- och personnummerroutes, dispatch av källbeslut och prov.
- `e81f771`: buffrad export med separat preview, CSV-fil och prov.

## Self-Check: PASSED

- FOUND: web/app/api/elever/andra/route.ts, web/app/api/elever/personnummer/route.ts, web/app/api/elever/export/route.ts
- FOUND: 6a17c4a, e81f771
