---
phase: 03-mandat-och-skyddade-datavagar
plan: "06"
subsystem: API-prov och fasgrind
tags: [mandat, audit, api-prov, kallbevis, fasgrind, lokal-syntetisk]
status: complete
completed: true
requirements_completed: []
updated: 2026-09-26
requires: ["03-05"]
provides: ["25 namngivna API-/kringgående-/loggfelsfall med källbevis (verify-mandates.mjs)", "fail-closed verify:phase3 med färskhetskontroll och kravtabell", "färska resultat från återskapad stack"]
affects: ["03-07"]
key-files:
  created: [work/pilot/verify-mandates.mjs, web/scripts/verify-phase3.mjs, web/scripts/verify-phase3.test.mjs, work/pilot/results/phase3-api.json, work/pilot/results/phase3-summary.json, work/pilot/results/phase3-sql-all.json, .planning/phases/03-mandat-och-skyddade-datavagar/deferred-items.md]
  modified: [work/pilot/verify-access.mjs, web/package.json, web/playwright.protected.config.ts, work/pilot/results/access.json, work/pilot/results/isolation.json, work/pilot/results/phase3-denials.json]
decisions:
  - "verify-mandates kör källprovet (collect-denials med avbrott för Kong, Storage och Postgres) före Worker-fallen, så att Workern inte ärver brutna anslutningar; rapporten skrivs till phase3-denials.json endast vid full körning"
  - "Ett delurval (--case) ger status PARTIAL och kan aldrig bli PASS; grinden kräver complete=true och exakt de 25 fallen"
  - "Fas 3-mandatbrowsern (03-07) får fasta titlar i verify-phase3 (MANDATE_BROWSER); saknas specen blir steget BLOCKED"
  - "Upptagna portar och kvarlämnade preview-lås redovisas som BLOCKED med orsak; grinden stoppar aldrig andras servrar"
  - "Fas 2-regressionernas kundadmin→rektor och logg-flod följde redan fas 3:s regler (03-03/03-04); endast dokumenterat och omkört, inte ändrat"
metrics:
  duration: "ca 50 min (12:48–13:38 UTC 2026-09-26)"
  completed: 2026-09-26
actuals:
  tasks: 2
  commits: 4
plan_head_before: 9fa3baed312d676dbc89b4ed7101bc9f88a3e92d
---

# 03-06 — negativa API-prov och färsk fasgrind

Alla 25 namngivna fall i exekveringskontraktet har körts mot byggd protected-Worker på den återskapade syntetiska stacken och gett PASS med serverbevis. Det gäller även nekandefloden och loggfelsinjektionen, som tidigare bara hade körts i den gamla miljön. Den samlade grinden `npm run verify:phase3` finns och vägrar PASS. I den färska körningen är alla sex fas 3-krav BLOCKED, eftersom fas 3-mandatbrowsern (03-07) saknas och två regressionsmiljöer inte är klara.

Sessionsbevisen mintas lokalt i målet. Proven visar alltså inte en verklig IdP- eller kommunanslutning. Den riktiga OIDC-kedjan visas i stället av 03-05:s browserprov, som körts om här.

## Uppgift 1 — matris, kringgående och loggbortfall (6a730c3)

`node work/pilot/verify-mandates.mjs --out work/pilot/results/phase3-api.json` gav 25/25 PASS och 130 kontroller.

**Mandat och scope**

| Fall | Vad som visades |
|---|---|
| principal-chain | Huvudman utser rektor, med committad händelse. Rektor och kundadmin nekas utnämning, även av sig själva. Andra huvudmäns skolor nekas. Rektor ger lärare inom egen skola men inte utanför. Huvudman kan inte tilldela lärare. Direkt RPC med rektorskontext ger 42501. `appoint_school_principal` och direkt INSERT är stängda. Avslut gäller omedelbart. |
| teacher-group | Undervisningslärare ser bara egen grupp, inte en annan grupp i samma skola. Mentor ser bara sin mentorsgrupp. Annan grupp, annan skola och okänd elev ger samma 404, och nekandet loggas. Lärare saknar export och tilldelning. |
| school-admin | Ser hela egna skolan men inte andra skolor eller kunder. CSV innehåller bara egen skola, och händelsen har antal. Kan inte tilldela eller ändra anslutning. |
| health-school / -pupil / -case | Skolscope ger skolans elever. Elevscope ger exakt den tilldelade eleven. Ärendescope ger tom lista och elev bara via exakt ärende. Annat ärende i samma skola, annan skola eller annan kund nekas lika. Elevhälsa har ingen export eller delegering. Elevhälsoansvarig delegerar bara inom sina skolor och har ingen egen elevläsning. |
| support-boundary | Syfte krävs, högst 60 minuter och exakt en skola. Bara rektor godkänner, och servern sätter godkännaren. Före start, vid sluttid (halvöppet intervall) och efter slut nekas utan innehåll. Under giltig tid syns en elev med syfte, godkännare och sluttid. Support har ingen export, delegering eller skrivrätt. |
| it-admin | IT ser egna skolor, pausar/aktiverar och provar lokal anslutning (händelser committade). Gammal version ger 409, som loggas. Främmande och okänd skola ger samma 404. IT har ingen elevinsyn, export eller delegering. |
| self-escalation | Rektor kan inte ge sig själv uppdrag eller ge större skolmängd än sin egen. Klientangiven överordning ger 400. Rollhuvud ignoreras. Lärare kan inte utöka sig eller byta till annans uppdrag. Elevhälsoansvarig kan inte ge sig själv uppdrag. Nekandena loggas. |
| parent-revoked | Huvudmannens avslut av rektor nekar lärarens och elevhälsans befintliga sessioner direkt, utan bakgrundsjobb. Nekandet loggas på det underordnade uppdraget. |
| invitation-recheck | Inlösen ger mandat under utfärdaren och kan bara göras en gång. Om utfärdaren avslutats nekas inlösen. En ny rektorsutnämning av samma person återupplivar inte en gammal inbjudan. |
| foreign-object | Främmande elev, ärende, uppdrag och medlemskap ger samma svar som okända, utan antal. Urval och mandatlista innehåller inga främmande ID:n. |
| concurrent-revoke | 16 samtidiga läsningar och två samtidiga avslut gav inga 500-svar. Varje lyckad läsning har en ok-händelse och varje nekad en nekandehändelse. Efter avslutet nekas allt, och ingen lyckad läsning har tid efter avslutet. `verify-mandate-locks.mjs` visar tre låsordningar. |

**Direktvägar** (källbevis från Kong, Storage och Postgres)

| Fall | Vad som visades |
|---|---|
| direct-rest | Elev-, mandat- och loggtabeller gav 401 utan antal (`count=exact`) och utan innehåll. Varje försök har en egen Kong-händelse med servergenererat id. |
| direct-rpc | `phase3_read_pupils`, `appoint_school_principal`, `phase3_grant_mandate`, `phase3_revoke_mandate` och `purge_synthetic_audit` nekas för anon, med en Kong-händelse per försök. |
| direct-storage | Anropet nekas i både Kong och Storage med samma id. Storage verifierade rollen `anon` själv. Ingen bucket skapades. |
| direct-sql | Rollerna authenticator, anon och authenticated ger 42501 i exakt den session som servern rapporterar (3 försök, 3 källhändelser). Klientroller saknar elevfunktion och ärendetabell. Workern kan inte radera eller ändra audit, gallra eller använda gammal utnämningsväg. |

**Audit och loggfel**

| Fall | Vad som visades |
|---|---|
| audit-read-fail | Vid loggfel ger lista, elev-ID, ärende, mandatlista och urval `audit_unavailable`, utan elevbytes och utan ok-händelse. Läsningen återhämtar sig. |
| audit-export-fail | Elev- och loggexport stoppas utan CSV. Exporten fungerar igen när loggen är åter. |
| audit-write-rollback | Tilldelning, avslut, utnämning, anslutningsändring, anslutningsprov och inbjudan ger 500. Ingen mutation committas. |
| audit-deny-fail | Nekande utan beständig logg ger generiskt `audit_unavailable`, utan orsak och utan data. |
| audit-flood | 28 nekanden (ogiltig session, förbjuden export, främmande elev, IT-läsning) har vardera exakt en händelse med samma kod och korrelation. Ingen undertryckning sker. Granskaren ser alla 18 autentiserade nekanden. |
| audit-source-outage | Avbrott, omstart och återhämtning gav PASS för Kong, Storage och Postgres. Kongs minimerade format är aktivt efteråt, och Workern läser auditerat efter Postgres-omstarten. |
| audit-minimization | Namn i frågan och fritext i kroppen nekas. Körningens drygt 200 Worker-händelser saknar namn och anteckningar, och detaljnycklarna följer allowlistan. Granskaren ser läsningen utan namn (JSON och CSV) och bara sin egen kund. Annan kunds granskare ser ingenting. Källhändelserna har bara allowlistade fält. |
| audit-retention | Gallringen tar bort bara händelser äldre än 30 dygn. Händelser vid och efter gränsen finns kvar. En kund utan profil kan inte gallras. Worker, klientroll och underhållsroll kan inte ändra eller radera direkt. Provet körs i en transaktion som rullas tillbaka. |

Tillfälliga provrader (en elev, grupp och ett ärende i skola 11, med fasta ID:n) skapas vid start och tas bort i `finally`. Resultatet innehåller inga tokens, cookies, nycklar eller elevnamn (kontrollerat med mönster i både skriptet och grinden).

**Fas 2-regressionerna** (kundadmin→rektor nekas, logg-flod med en händelse per nekande) följde redan fas 3:s regler sedan 03-03 och 03-04. Detta är nu dokumenterat i huvudet av `verify-access.mjs`. Hela `verify-access` gav 16/16 PASS (117 kontroller).

## Uppgift 2 — fail-closed grind (93296ec, c7a113d)

- `npm run verify:phase3` (`web/scripts/verify-phase3.mjs`) omfattar:
  - Node 25 och målen protected och baseline
  - preview-lås
  - modell- och serverprov
  - grindens egna enhetsprov och `collect-denials`-prov
  - tsc, lint för app och för `work/pilot`
  - normalt och skyddat bygge (revisionskontroll) samt `docs:build`
  - alla 10 SQL-filer
  - API-isolering, baslinje-db, access-regression, mandat-API och källbevis
  - fas 1- och fas 2-browser, fas 3-fixturer, fas 3-arbetsyta (riktig OIDC) och fas 3-mandatbrowser
  - källstabilitet
- Fingeravtrycket omfattar `web`, `supabase`, `work/pilot`, `docs/handbok`, `docs-site` och rotens `package.json`, men inte resultat och byggen. Revision och fingeravtryck måste vara oförändrade under körningen. Varje resultatfil måste vara skriven under körningen.
- Saknat steg, gammal rapport, delurval, källa utan bevis, hoppade eller saknade browserfall, saknat projekt eller byggd Worker ger aldrig PASS. Ett miljöhinder (stoppat mål, upptagen port, kvarlämnat lås) ger BLOCKED med orsak. Kravtabellen per krav blir PASS först när både kravets egna steg och hela grinden är PASS.
- `node --test scripts/verify-phase3.test.mjs` gav 12 PASS. Proven täcker saknade, gamla, falskt gröna och delvisa rapporter, saknad fas 3-mandatspec, gröna fas 2-fall som försöker ersätta fas 3-specen, saknad byggd Worker samt krav som blir BLOCKED utan browser.

## Färsk grindkörning (440bcb0, rapport `work/pilot/results/phase3-summary.json`)

Körd vid c7a113d, 13:27–13:35 UTC. Totalstatus **FAIL**. Inget krav är PASS.

| Krav | Egna bevissteg i denna körning | Status |
|---|---|---|
| ACL-02 | sql, access-api, mandat-api, fas3-arbetsyta-browser = PASS; fas3-mandat-browser = BLOCKED | BLOCKED |
| ACL-03 | som ACL-02 | BLOCKED |
| ACL-04 | modeller, sql, mandat-api, fas3-arbetsyta-browser = PASS; fas3-mandat-browser = BLOCKED | BLOCKED |
| ACL-05 | som ACL-04 | BLOCKED |
| AUDIT-02 | sql, access-api, mandat-api, källbevis, fas3-arbetsyta-browser = PASS; fas3-mandat-browser = BLOCKED | BLOCKED |
| AUDIT-03 | sql, mandat-api, källbevis = PASS; fas3-mandat-browser = BLOCKED | BLOCKED |

**Steg med PASS:**
- node25, mål-protected, preview-lås
- modeller (281), grind-unit (38), typkontroll, lint, lint-pilot
- normalt bygge, protected-bygge, docs-bygge
- sql (10 filer, 540 prov)
- api-isolering, access-api (16 fall), mandat-api (25 fall, 130 kontroller)
- källbevis (4 prov, 3 avbrott, 10 källhändelser)
- fas3-fixturer, fas3-arbetsyta-browser (9 flöden × dator och telefon = 18)
- källstabilitet

**Steg som inte är PASS:**
- **BLOCKED:**
  - mål-baseline och baslinje-db: baseline-målet är inte startat.
  - fas1-browser: port 5192 är upptagen av en annan sessions `blocked-probe`-server.
  - fas3-mandat-browser: `e2e/phase3-mandates.spec.ts` saknas. Den skapas i 03-07.
- **FAIL:**
  - fas2-browser: inloggningen med engångskod i fas 2 fastnar på Keycloaks OTP-sida. Felet återkommer även när testet körs ensamt.

## Avvikelser

1. **[Regel 1 – fel] Kvarlämnade inbjudningar gav SQL-fel.** Första grindkörningen fick FAIL på `phase2_access` test 47 ("inga inbjudningar utanför kunden syns"). Webbinbjudan som `verify-access` gör i kund A togs aldrig bort, och mina fulla körningar lämnade 5 sådana rader. Inbjudan tas nu bort i `finally` (c7a113d), och de 5 syntetiska raderna är raderade. Därefter: SQL 540/540 PASS.
2. **[Regel 3 – blockerande] Kvarlämnade `.dev.vars`-lås.** Playwrights protected-servrar dödades utan ordnat avslut. `web/.dev.vars` och `dist-protected/server/.dev.vars` blev kvar med lås (skapade av min körning). Restfilerna är borttagna, och `playwright.protected.config.ts` har fått `gracefulShutdown`. Den filen hör till 03-07, men felet blockerade grinden.
3. **[Regel 2] Miljöhinder klassas som BLOCKED.** Grinden prövar upptagna portar och lås före API- och browsersteg och redovisar dem som BLOCKED i stället för FAIL.
4. **Previewn på port 3000:**
   - En samtidig protected-preview kan inte köras, eftersom `dist-protected`-låset delas. `verify-mandates` kördes därför först med `--base-url http://127.0.0.1:3000`.
   - Previewn stannade oväntat under en senare access-körning. Den startades om och stoppades sedan avsiktligt inför grinden.
   - Efter grinden är den omstartad på port 3000 med bygget från c7a113d (hälsokontroll OK).
5. **Planen tillät att hela grinden väntar till 03-07.** Uppdraget begärde en färsk fasgrind, så den kördes två gånger. Den andra körningen är den som rapporteras.
6. **Filer utöver planens lista:**
   - `web/playwright.protected.config.ts` (avvikelse 2)
   - resultatfiler
   - `deferred-items.md`
7. **Commits på master** enligt projektets praxis.

## Kvarstående gränser och beslut

- **03-07:**
  - `e2e/phase3-mandates.spec.ts` ska ha titlarna i `MANDATE_BROWSER` i `verify-phase3.mjs` (eller en ändrad lista med motivering), i protected-desktop, protected-phone och minst ett fall i protected-built.
  - Fas 2:s OTP-inloggning behöver lagas (`deferred-items.md` punkt 3).
  - Baseline-målet behöver startas, och port 5192 behöver vara ledig.
- **Felkoden för support före start** är `assignment_expired` (deferred punkt 1). Behörigheten är korrekt, men meddelandet är missvisande.
- **Oförklarat:** `fetch failed` i access-regressionen i första grindkörningen och att previewn på 3000 stannade (deferred punkt 2 och 6). Felen gick inte att återskapa.
- **Räckvidd:** allt är lokalt och syntetiskt. Kollektorn är asynkron och ger ingen driftsgaranti. Ingen verklig IdP, lagringstid eller kommunanslutning är prövad.
- **Kravstatus:** inga fas 3-krav är markerade som verifierade. Det avgörs efter 03-07:s användarprov och gsd-verifier.

## Self-Check: PASSED

- Filerna finns:
  - `work/pilot/verify-mandates.mjs`
  - `web/scripts/verify-phase3.mjs` och `web/scripts/verify-phase3.test.mjs`
  - `work/pilot/results/phase3-api.json`, `phase3-summary.json`, `phase3-sql-all.json` och `phase3-denials.json`
  - `deferred-items.md`
- Commits 6a730c3, 93296ec, c7a113d och 440bcb0 finns i git log. Uppmätt `git rev-list --count 9fa3bae..HEAD` = 4 före SUMMARY-commit.
- Resultatfilerna innehåller inga elevnamn, tokens, cookies eller databas-URL:er (kontrollerat med grep).
