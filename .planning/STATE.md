---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 05
current_phase_name: Bevarade utbildnings- och klassflöden
current_plan: 05-23
status: in_progress
stopped_at: 05-23 A/B/C genomförda och verifierade lokalt; nästa ny executorsession D för generella ämnespaket. Mänskligt prov väntar; äldre auditfall FAIL och 05-22 metadata PARTIAL. 05-25 väntar på hela 05-23
last_updated: "2026-10-05"
last_activity: 2026-10-05
last_activity_desc: "05-23 C: skolvisa språkpaket, analysmål, autospar och paketkopiering verifierade. Node 629, C-API 16, paketbrowser 16 PASS. Full SQL 2411/2412 FAIL endast äldre auditfall. 3012 kör 9790c54; nästa D."
state_head: 9790c54
worker_build_revision: 9790c540059a22b9bb01c55090123b5634294319
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 88
  completed_plans: 75
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-05)

**Core value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.
**Current focus:** 05-23 A/B/C genomförda och automatiskt verifierade lokalt. Skolans språkpaket kan väljas och fördelas av huvudman/rektor/skoladministratör inom mandatet. Nästa D för generella ämnespaket, därefter E och fullplansprov. 05-25 väntar på hela 05-23; yrkesfastställande kräver dessutom 05-17. Mänskliga prov och full fasverifiering är fortsatt öppna.

## Current Position

**05-23 steg C, 2026-10-05:** Skolvisa språkpaket och terminsram, analysåtgärd för rätt skola, autospar med samtidighets-/osparatskydd och paketkopiering till ny version/elevkull verifierade lokalt. Skoladministratör läser planen och ändrar egna paket men får inte ändra planen. Arkiv låser paket; fastställd/ersatt och passerad start tillåter paketarbete. Migration 154000/155000 tillämpade utan reset, exakt 19 Worker-entrypoints. Se SUMMARY/C-VERIFICATION/C-FUNCTION-INVENTORY. Node 629, paritet 534, SQL 986+86, C-API 16, regression 11/48/31/39/43 och paketbrowser 16 PASS. Block 6/program 40/terminer 25(+1 avsiktligt skip)/livscykel 20 över bas 18 + riktat omprov 2 PASS; 142 browserstädningsbilagor noll egna verksamhetsrader. Full SQL 2411/2412 FAIL endast äldre phase2_audit#13. Vanlig 3012 kör 9790c54 (produkt byteidentisk med 8c719ee); C-API 16 och 18 bevarade scenarier/44 auditpar före/efter samt 11 helradstabeller PASS. Exportkoder ej verifierade, inga verkliga kommunbevis eller mänskligt godkännande. **Hela 05-23 in_progress, ADMIN-02/ADMIN-03 Pending.** Nästa ny executorsession D, sedan E. 05-22 metadata förblir PARTIAL.

**05-23 steg A/B, 2026-10-05:** Nya planer och 13 uppgraderade legacyutkast har Svenska/SvA 1–3 och blockramar. Huvudman/rektor kan dela IV (200 p) och lägga till fördjupningsblock, med CAS/MFA/CSRF/audit. Äldre fastställda/ersatta helrader och tidsstämplar bevarade. Terminsbaserad nivåordning ersätter årsordning. Migration 151000/152000, separat historisk klonrättning 152100 och blockgrant 153000 tillämpade; exakt 17 Worker-entrypoints. Se 05-23-SUMMARY/B-VERIFICATION/B-FUNCTION-INVENTORY. Node 609, SQL 912, paritet 210, block-API 11, program-API 48, termins-API 31, livscykel-API 39 och utbildnings-API 43 PASS. Blockbrowser 6, livscykel 20 och slutlig program 40/terminer 25 (+1 avsiktligt hoppat fall) över bas+omprov PASS; första felomgångar bevarade, 96 cleanupbilagor noll egna kvarvarande verksamhetsrader. Verklig mobilklippning rättad och visuellt återprovad. Typkontroll, lint, skyddat bygge och handbok PASS. Full SQL 2337/2338 FAIL endast känt phase2_audit#13; 05-22:s historiska updated_at är fortsatt PARTIAL. Vanlig 3012 kör 2b45237, befintliga användarplaner återlästa före/efter serverbyte utan ändring. Mänskligt prov awaiting_user. **Hela 05-23 är in_progress**, ADMIN-02/ADMIN-03 är Pending. Nästa nya executorsession C för skolans språkpaket, därefter D/E och 05-25.

**05-22, 2026-10-05:** Tillagda skolor har egna elevplaceringar, klasser och timplansversioner genom befintliga skyddade vägar. Klasskoppling kräver samma skola/fastställd version och flyttas inte av ny version. Skolborttagning nekar befintliga beroenden med konkret besked. Se 05-22-SUMMARY/VERIFICATION och FUNCTION-INVENTORY. Riktad SQL 46/46, timplan/livscykel/register-API 39/39, 39/39 och 18/18, Node 577/577, typ/lint/skyddat bygge/handbok PASS. Browser: 137 beteenden och ett avsiktligt hoppat fall, 112 städningsbilagor: första program 39/40 FAIL följt av oförändrat phone14-omprov 1/1; första elevkort 0/12 med uppsättningsfel bevaras, slutligt 12/12 PASS. Lista 13/13, rolläsningar 5/5, timplan 22/22, livscykel 20/20, terminer 25/25 och ett hoppat fall PASS. Full SQL 1963/1964 FAIL endast äldre phase2_audit#13. Första backfillen ändrade fyra timplans updated_at; gamla tidsstämplar inte återställda, historiskt bevarande PARTIAL. Korrigerad migration helradsprovad med rollback; övriga verksamhetsvärden/ACL bevarade, även efter regressionen. Vanlig 3012 kör ce88748 med äldre klientfiler bevarade; 18 aktuella användarscenarier återlästa utan ändring före/efter serverbytet. Mänskligt prov awaiting_user. ADMIN-04 Pending; skapa klass/timplan/koppla klass ingår ännu inte. Nästa 05-23 steg A för felaktig poängmängd/valblock.

**Följdprov/förenkling, 2026-10-05:** Användaren säger att vyn ser bättre ut men har för många informationsrutor. Analys-/klarstatus-/åtgärdsrutorna har tagits bort; status står vid namnet och Analys visar antal fel/risker. Radmarkeringen försvinner när samma rad är rättad. Terminsprov 25/25 (+1 avsiktligt hoppat), utbildningsurval 2/2 och delad skrivskyddad plan 2/2 PASS, 30 fixturer städade. 8 riktade Node-prov, typ/lint/skyddat bygge/handbok PASS. Dator- och telefonbilder granskade. Vanlig 3012 kör `4b1addc`; endast testanpassning skiljer från terminsprovets `197e5b9`. Öppna flikar laddas inte om automatiskt. Se programplan-compact-ui.json och debug/programplan-analysis-actions.md. Ny mänsklig bedömning väntar; nästa plan förblir 05-22.

**Användarfynd/rättning, 2026-10-05:** Analysens gemensamma åtgärdslänk öppnade ett låst fördjupningsformulär med tom visningsfördelning. Varje åtgärd går nu till rätt rad, sökfält, årskurskort eller datum; skrivskydd förklaras. En sista radändring medan tidigare sparning pågick kunde bli osparad och köas nu korrekt. På `db5fb9b`: 25 körda dator-/telefonprov PASS (+1 avsiktligt hoppat datorfall), nya åtgärdsfall 10/10, cleanup 26/26, Node 571/571, typ/lint/skyddat bygge/handbok PASS. Första misslyckade provomgången bevaras. Vanlig 3012 kör det nya bygget; befintliga användarplaner bevaras och öppna flikar laddas inte om automatiskt. Se debug/programplan-analysis-actions.md och användarprovet. Mänskligt prov efter rättning är awaiting_user, nästa genomförandeplan förblir 05-22.

**05-21, 2026-10-05:** Huvudmannen väljer programplanens skolor; alla kopplade skolor läser samma versioner. Skrivning kräver mandat för alla skolor, och kullkopiering tar med skolvalet. Se 05-21-SUMMARY/VERIFICATION. Riktad SQL 54/54, API 39/39, verkliga lås 3/3, browser livscykel 18/18, program 39/40 + 1/1 omprov, terminer 14/15 + 1/1 omprov (+1 hoppat) och timplan 20/20 PASS; Node 571/571, typ/lint/skyddat bygge/handbok PASS. Full SQL 1917/1918 är FAIL på det äldre phase2_audit-fallet 13. Vid skolprovet körde vanlig 3012 9f80719; det aktuella bygget är db5fb9b enligt följdrättningen ovan. Tidigare syntetiska provdata är bevarade. Mänsklig begriplighet är awaiting_user. Klasser, elevplaceringar och timplaner på tillagda skolor återstår i 05-22.

**Planeringspaketet 2026-10-04–05:** [05-24–05-35](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md) omfattar sammanhållen timtabell och analys. Endast 05-24:s rena GR/IM-analys är genomförd i paketet. 05-19–05-21 har genomförandesammanfattningar; 05-22 och 05-23 har planer. 05-22 och 05-23 A/B/C är därefter genomförda; nästa steg är 05-23 D → E; därefter återgår arbetet till 05-25:s grind. 05-17 saknar PLAN och behöver yrkesregler levererade inför yrkesfastställande. Inga äldre wave-nummer ersätter dessa faktiska beroenden.

**Aktuellt läge 2026-10-04:** 05-18 automatiskt verifierad: poäng per årskurs och termin i skyddad programplansversion, 16 browser / 31 API / 236 SQL. Mänskligt prov väntar på vanlig 3012; ADMIN-02/full fas 5 och fas 4:s checkpoint kvarstår. Delegation och timplansskapande har egna todos.

**Användarprov 2026-10-01:** användaren rapporterar att alla tidigare timplansprov fungerar, registrerat i 05-TIMPLAN-USER-TRIAL.md. Ny regelhandledning och programplansvyn kräver fortfarande mänsklig förståelsebedömning; deras automatiska prov är separata. Fas 4:s checkpoint kvarstår.

Phase: 05 (Bevarade utbildnings- och klassflöden) — 05-01–05-16, 05-18–05-21 och 05-24 automatiskt genomförda; mänskliga prov och full fasverifiering kvarstår. Fas 4 kvarstår på 24 av 25 planer.
Fas 4: 04-01–04-21, 04-23, 04-24 och 04-25 klara; mänsklig checkpoint 04-22 kvarstår separat.
Fas 1: 10 av 10 planer genomförda och verifierade 2026-09-12 (`01-VERIFICATION.md`, status passed).
Fas 2: 12 av 12 planer genomförda och verifierade 2026-09-21 (`02-VERIFICATION.md`, status passed).
**Current Phase:** 05
**Current Phase Name:** Bevarade utbildnings- och klassflöden
**Total Phases:** 8
**Current Plan:** 05-23 — A/B/C genomförda; nästa D i ny executorsession. Hela planen och D/E är öppna.
**Total Plans in Phase:** 34 PLAN-filer: 22 genomförda planer har SUMMARY (05-01–05-16, 05-18–05-22, 05-24); 05-23 har en partiell SUMMARY för steg A/B/C. 05-25–05-35 saknar SUMMARY. 05-17 saknar PLAN. Mänskliga prov och slutverifiering är separata.
**Status:** 05-23 A/B/C automatiskt verifierat lokalt; D/E återstår. Äldre SQL-/metadataavvikelser kvarstår. Mänskligt prov awaiting_user; ADMIN-02/ADMIN-03 och full fas 5 inte slutgodkända.
**Detailed scope:** Approved — användaren godkände 42 detaljkrav och färdplanens åtta faser 2026-09-11.
**Last Activity:** 2026-10-05
**Last Activity Description:** 05-23 C genomförd med skolans språkpaket, terminsanalys och tvåskolekopiering. Nästa D för generella ämnespaket.

**Senaste förtydligande:** Jev och liknande AI ska utvärderas för schemamodulen, inte specificeras som obligatorisk produktfunktion. SCHEMA-05 och S2 anger jämförelse mot samma motor utan AI och dokumenterad rekommendation; att avstå är ett giltigt utfall. Kunden ska kunna köpa moduler var för sig. MODUL-01–04 tillagda för separat modultillgång/personmandat, externa databeroenden och tillägg/avslut med bevarade ID:n/historik. S1/S4 utökade med kontrakt och provmål; modulkatalog, priser och beställnings-/betalningsprocess återstår.

**Historiska genomförandebevis, 2026-10-04:** Terminer 16/16, programplaner 40/40 och kompletterat API 31/31 PASS; SQL 236/236 och Node 417/417 PASS. Timplan 20 beteenden PASS över 19+1, externa setupfel bevarade separat. Typ/lint/skyddat bygge/handbok PASS, fyra terminsbilder granskade. Vanlig 3012 kör d37f566; inga produktkälldifferenser från d1f34ca där terms/program prövades. Läs 05-18-SUMMARY/REVIEW. Mänskligt prov väntar.

**Tidigare genomförandebevis, 2026-10-02:** 05-15/05-16 har samma program → inriktning → programfördjupning för nya och befintliga utbildningar. På `023e68b`: programbrowser 38/38, timplan 20/20, nya utbildnings-API 43/43, 128 riktade Node-prov, typ/lint/bygge/handbok PASS. Tio bilder granskade. Vanlig 3012, nio bevarade utbildningar och fyra lokala inloggningar verifierade. Ny mänsklig begriplighetsbedömning väntar; gemensamma paket är en pending todo.

**Tidigare verifiering:** SQL-policy, personbundna tilldelningar, inbjudningar, återkallelse och lokal IT-konfiguration inkopplade. 510 SQL-prov och verkligt samtidighetsprov PASS; 277 modell-/serverprov och 15/15 isolerade API-fall PASS, mandat-/auditfallet utökat till 24 kontroller; giltig verksamhetsinbjudan rättad. Läs 03-04-SUMMARY: Worker-audit/gallring prövade (Worker-API i föregående miljö); källrapporten är sedan 2026-09-26 PASS lokalt på återskapad stack.

Progress: [████░░░░░░] 38%
Planinventering 2026-10-05: 88 skrivna PLAN-filer, 75 genomförda planer och en partiell SUMMARY för 05-23 A/B/C. 12 saknar SUMMARY: 04-22 och 05-25–05-35. En SUMMARY innebär inte att mänskligt prov eller full fas är godkänt. Detta är inte procent färdig produkt; 3 av 8 faser är verifierade.
Phases executed: 3 of 8 (fas 1–3 verifierade lokalt med syntetiska uppgifter)

## Performance Metrics

**Velocity:**

- Completed plans with execution summary: 75
- Partial plan summary: 05-23 (steg A/B/C)
- Average duration: Ej tillämpligt
- Total execution time: Ej sammanräknad; registrerade uppgiftstider finns nedan.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | 0 | - | - |
| 3 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: 05-18, 05-19, 05-20, 05-24 och 05-21 automatiskt genomförda; nytt mänskligt begriplighetsprov återstår.
- Trend: Ej tillämpligt

| Phase 01 P01 | 5min | 2 tasks | 3 files |
| Phase 01 P02 | 6min | 2 tasks | 1 files |
| Phase 01 P04 | 5min | 2 tasks | 3 files |
| Phase 01 P03 | 6min | 3 tasks | 10 files |
| Phase 01 P05 | 18min | 3 tasks | 7 files |
| Phase 01 P06 | 25min | 2 tasks | 4 files |
| Phase 01 P07 | 48min | 3 tasks | 5 files |
| Phase 01 P08 | 20min | 2 tasks | 6 files |
| Phase 01 P10 | 8min | 2 tasks | 3 files |
| Phase 01 P09 | 10min | 3 tasks | 4 files |
| Phase 03 P04 (fortsättning 2026-09-26) | 20min | 2 tasks | 6 files |
| Phase 03 P05 (fortsättning 2026-09-26) | 27min | 2 tasks | 26 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P06 | 50min | 2 tasks | 11 files |
| Phase 03 P07 | ca 3h exkl. användarprov | 2 tasks | 43 files |
| Phase 04 P10 | 25min | 2 tasks | 5 files |
| Phase 04 P14 | ca 35min | 2 tasks | 4 files |
| Phase 04 P23 | ca 35min | 2 tasks | 5 files |
| Phase 04 P13 | 22min | 2 tasks | 10 files |
| Phase 04 P15 | 20min | 2 tasks | 5 files |
| Phase 04 P25 | 50min | 3 tasks | 6 files |
| Phase 04 P24 | ca 30min | 3 tasks | 11 files |
| Phase 04 P17 | 20min | 2 tasks | 14 files |
| Phase 04 P19 | ca 2h inklusive fulla browseromprov | 2 tasks | 5 kod-/provfiler |
| Phase 04 P20 | flera fulla lokala omprov | 2 tasks | fasgrind, provhjälp, intern beviskarta och miljöskript |

## Accumulated Context

## Decisions Made

Fullständiga beslut finns i PROJECT.md.

| Phase | Summary | Rationale |
|-------|---------|-----------|
| Init | 42 detaljkrav och åtta faser godkända 2026-09-11 | Användarens uttryckliga ja till kravförslaget och färdplanen |
| 05 | Valbara block 2026-10-04 (05-23, D-01–D-19): svenska/SvA som egna rader per nivå; valbara block med exakt ett paket och gemensam terminsram för moderna språk, HU/NA-val, programfördjupning och individuellt val; planen bestämmer blocken och skolan väljer paketen; huvudman, rektor och skoladministratör får skapa valpaket; utbudet får ändras när som helst; nivåordning är fel om den högre nivån börjar före den lägre och risk vid överlapp. 2026-10-05: paketstorlek efter blockets poäng (D-16), paketval även i ersatt version men inte i arkiverad (D-17), läsrätt för skoladministratör (D-18), saknade rättigheter i individuellt val är risk (D-19) | Användarens svar på frågor i chatten; se `phases/05-…/05-23-CONTEXT.md` |
| Init | Säker administration inför pilot är första milstolpen | Användarval 2026-09-10: inloggning, behörigheter, elevregister och en kommunintegration |
| 1–5 | Bevara gymnasieutbildningar, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar | Uppskattade befintliga arbetsflöden |
| 3 | Huvudmannen utser rektor; rektor tilldelar läraruppdrag inom sitt mandat | Användarens ansvarsfördelning |
| 3 | Syntetisk elevläsning öppnas för Workern först efter API-bevis för committad händelse per läsform och stopp vid loggfel (03-05) | Användarens loggpolicy: obligatorisk loggning, annars stoppas åtgärden |
| 3 | Elev-/ärendeurval i tilldelningsformuläret endast för rektor; elevhälsoansvarigs elevinsyn är öppet beslut | Ingen roll får mer elevinsyn än dess mandat ger |
| 7–8 | Syntetiska prov ersätter inte faktisk kommunanslutning eller beslut om verklig användning | Godkänd färdplans avgränsningar; etablerad informationshantering kan användas utan egen publik diarietjänst |

- [Phase 03]: Storage-källan korreleras via Kong-tvingad X-Client-Trace-Id (Storage allowlistar headern); Postgres-källan konfigureras lokalt med ALTER SYSTEM (SQLSTATE/PID/session/rad/roll, ingen statementtext); Kong-konfigurationsförlust efter omstart rapporteras som lucka men förhindras inte
- [Phase 01]: Docs committades separat (383b3e0) före appbaslinjen; taggen fas1-baslinje (917313b) omfattar bara web/, supabase/config.toml, sex migrationer och work/
- [Phase 01]: web/.openai/hosting.json spåras (importeras av vite.config.ts, endast null-värden); resultatfilen från verify-baseline.mjs har extra fält errors[]
- [Phase 01]: Provmiljöns organisation och 24 elever står som Syntetiskt exempel i anslutningsprofilen; partner, volym, källa, IdP, kontokälla, leverantör och drift är öppna beroenden OB-01–OB-08 med beslutsägare
- [Phase 01]: Pilotfixturens tillstånd anges som 'Huvudmannens beslut' (kommunal huvudman); likhetstestet jämför timplaner strukturellt eftersom timplan-model sätter ID:n med uid()
- [Phase 01]: Klientgränsen skapar ingen Supabase-klient i fas 1; hasBackend är konstant false och laddarna är rena läsningar utan demoinloggning eller seedning (seedExample* är den uttryckliga vägen)
- [Phase 01]: Exempelläget startas/byggs via run-mode.mjs med tomma Supabase-strängar i miljön så att .env.local aldrig läcker in; bygget märks i dist/build-mode.json
- [Phase 01]: Lokala provmål: CLI:ns .temp-cache tas bort ur målens workdir; supabase_admins defaultprivilegier i public kan inte ändras av postgres och lämnas (gäller ej migrationsskapade objekt)
- [Phase 01]: Karantänen 20260911120000 stänger anon/authenticated/PUBLIC i public och Storage-policyerna tillstand_* utan att radera rader; bevisad med 52 pgTAP-prov (All tests successful) mot protected-målet
- [Phase 01]: API-provet tar bort sin egen signup-provanvändare som postgres före ögonblicksbilden; baseline-provets anonyma sessionsanvändare lämnas (refereras av organisation_events, loggrader raderas inte av prov)
- [Phase 01]: Karantänen bevisad via API-vägen: 58 nekade/0 tillåtna för anon, gammal anonym HM-profil (mintad JWT) och provkonto; fyra baslinjeflöden PASS i baseline-målet
- [Phase 01]: Laddnings- och sparstatus i provvyn använder <output> (implicit role=status) enligt lintregeln och .admin-notice-konventionen; ny elev måste få en klass vid vald exempelskola
- [Phase 01]: Vald exempelskola ägs av sidan (activeUnitId); organisationsvyn rapporterar skolbyte uppåt och elevvyn filtrerar på unitId — ingen remount, ändringar bevaras vid byte
- [Phase 01]: Playwright 1.63.0 med egna servrar per projekt (reuseExistingServer false) och VINEXT_NO_DEV_LOCK=1 för dev-servrarna; browserproven väntar in Reacts hydrering innan de interagerar
- [Phase 01]: Isolering mäts som förbjudna sökvägar + inga främmande värdar + inga sb-nycklar; 'supabase' räknas bara på främmande värd i dev (modulen /lib/supabase.ts laddas från egen värd) men förbjuds helt i det byggda paketet
- [Phase 01]: Pekyteprovet i phone lämnas rött: skolväljaren är 26 px i WebKit (appearance:auto på select); rättning i globals.css är uppskjuten till UI-arbete, prövas på fysisk telefon i 01-09
- [Phase 01]: Sparordningsfelet reproduceras i save-order.repro.mjs (utanför testglobben) mot riktiga persistTimplans/loadTimplans med fake-PostgREST, fördröjd första upsert och FK-emulering; 2/2 scenarier röda, KNOWN-ISSUE med ägare fas 5
- [Phase 01]: verify:phase1 committas med totalstatus FAIL: browsersteget är obligatoriskt och det kända pekyteprovet är rött; ingen filtrering eller KNOWN-ISSUE-väg för Playwright infördes — 01-09 avgör hanteringen
- [Phase 01]: Pekytefelet i WebKit rättades i globals.css (564d067) i stället för en KNOWN-ISSUE-väg för Playwright; verify:phase1 omkörd i sin helhet → PASS
- [Phase 01]: Kravstatus går Pending → 'Genomförd — väntar verifiering' först efter användarens godkända checkpoint; Verifierad sätts bara av gsd-verifier
- [Phase 01]: Konkurrerande sparningar och redigering efter skapande står som KNOWN-ISSUE med ägare fas 5 och stoppvillkor; grön fasgrind gör dem inte till godkänd funktion
- [Phase 03]: 03-06: verify-mandates kör exakt 25 namngivna fall med källbevis; delurval ger PARTIAL, aldrig PASS
- [Phase 03]: 03-06: verify:phase3 är fail-closed; miljöhinder (stoppat mål, upptagen port, kvarlämnat lås) ger BLOCKED, fas 3-mandatspecen i 03-07 måste ha titlarna i MANDATE_BROWSER
- [Phase 03]: 03-07: engångskod anges vid inloggning för den som har registrerad kod; övriga loggar in med lösenord; beviset gäller 8 h och step-up är reserv (användarbeslut 2026-09-27)
- [Phase 03]: 03-07: tidsbegränsad support kan gälla en namngiven elev eller en eller flera grupper på en skola; högst 60 minuter, syfte, rektorsgodkännande och ingen export oförändrat (användarbeslut 2026-09-27)
- [Phase 03]: 03-07: användarprovet 2026-09-27 godkänt som syntetiskt användarprov (dator; telefon i enhetsläge/WebKit); det godkänner inte verklig drift, IdP eller kommunanslutning
- [Phase 04]: 04-10: Exportkropp {mode:'preview'|'download', export}; preview utan MFA lämnar bara antal, nedladdning kräver MFA och räknar om urvalet
- [Phase 04]: 04-10: Worker-EXECUTE för change/resolve/reveal/export förblir stängd; separat grant-migration med ACL-fixturer och verkligt API-prov krävs före 04-13/04-16
- [Phase 04]: 04-14: Äldre fas 3-fixturer skapar samma elev-/grupp-/ärende-ID i registret (inga phase3_probe-elevrader); elevläsning prövas via phase4_list_pupils/pupil_card/exportpreview
- [Phase 04]: 04-14: Fallet 'phase3_read_pupils öppen för Worker' vändes avsiktligt till stängd; positivt Worker-fall via phase4_list_pupils. Dubbel samtidig klass ersatt av tidigare klassperiod (registret tillåter en klass åt gången)
- [Phase 04]: 04-23: Worker får EXECUTE på exakt phase4_change_pupil, phase4_resolve_source, phase4_reveal_personal_number och phase4_export_pupils (migration 20260929170000, tidsstämpel efter 163000 i stället för planens 090000); PUBLIC/anon/authenticated stängda, ACL-kontraktet prövar exakt Worker-mängd för phase4_*
- [Phase 04]: 04-23: Verkligt Worker-prov 9/9 PASS med lokalt mintade sessioner och testrealmens bevisprofil (ingen interaktiv IdP); icke-deterministiskt Wrangler-avbrott på nekade anrop uppskjutet till deferred-items
- [Phase 04]: 04-13: Elevkortet hålls i arbetsytans minne; elev-ID aldrig i adressen
- [Phase 04]: 04-13: Konfliktval skickar bara uttryckligt valt eget värde; sparat värde förvalt och skrivs inte
- [Phase 04]: 04-13: Export skickar protectedIds=[] tills listan får skyddsflagga per rad; skyddade elever utelämnas
- [Phase 04]: 04-15: phase3_boundaries/-connections/-audit portade utan kontraktsändringar; nya fas 4-gränsprov är tillägg
- [Phase 04]: 04-15: phase3-fixtures.sql skriver inte i phase3_probe_pupils/-groups/-group_members; placering/klassmedlemskap skapas bara för elev utan sådan rad, inget raderas
- [Phase 04]: 04-25: Worker-avbrotten orsakades av nekande med oläst begärandekropp; denyResponse loggar först, läser sedan kroppen till slut (högst 1 MiB, ingen buffring) och svarar sist. Grindar klassar avbrott med phase4-worker-stability.mjs; avbrott blir aldrig PASS.
- [Phase 04]: Listan ger skyddsflagga och protectedIds (hela urvalet) bara till administratör med skyddsbehörighet på skolan; obehörigas svar oförändrat (04-24, migration 20260929180000)
- [Phase 04]: Exportens skyddsval är aldrig förvalt, återställs vid målbyte och prövas om av servern (användarbeslut 2026-09-28)
- [Phase 04]: 04-17: Elevprovet avvecklat (migration 20260930100000); phase3_probe_cases, phase3_probe_scope och phase3_pupil_in_scope behålls och läser bara registret; /api/prov borttagen men kvar som loggklass

## Pending Todos

- 2026-10-05: [integration av Skolverkets lärarlegitimation och undervisningsbehörighet](todos/pending/2026-10-05-integrera-skolverkets-lararbehorigheter.md) genomgången i [researchunderlaget](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md). Föreslagna mål LLEG-01–04 följs till L1 kontrakt/personmatchning, L2 XML-import, L3 tjänstefördelning/schema och L4 faktiskt anslutnings-/driftprov, med koppling till S1–S4. Lokala uppdrag och systemåtkomst hålls skilda från myndighetsbehörighet. API-åtkomst, omfattning, genomförandeplaner och alla integrationsprov återstår. Pilotens krav och nästa 05-22 behålls.

- 2026-10-05: [sammanhållen analys för programplan, timplan och schema samt APL-genomgång](todos/pending/2026-10-05-samordna-plananalys-schema-och-apl.md) beställd. Gemensam analys och åtgärdslänkar kopplas till fas 5; schemakorrelation till S1/S4. APL:s regelprofiler, tidsberäkning, placering och uppföljning behöver utredas och avgränsas. Planerad, schemalagd och genomförd tid samt lärande hålls isär. Genomförande och prov återstår; aktuell planordning behålls.

- 2026-10-04: [valbara paket i programfördjupning och individuellt val](research/VALPAKET-PROGRAMFORDJUPNING-IV-2026-10-04.md) utrett. Förslaget har tre lager (skolans valpaket, programplanens valblock, elevens val) och kopplar till paket-todon från 2026-10-02. Benämning, omfattning av första leveransen, mandat och nivåordningens kategori väntar på användarbeslut.

- 2026-10-04: gap – [komplettera programplanens analys](todos/pending/2026-10-04-komplettera-programplanens-analys.md): Svenska/SvA och Moderna språk saknar terminer, överlappande nivåer i fördjupningen, nivåordning per termin, fel regelhänvisning för gymnasiearbetet samt kontrollpunkter för individuellt val, APL och moderna språk. Underlag: `research/PROGRAMPLAN-ANALYS-LUCKOR-2026-10-04.md`.

- 2026-10-04: gap – [inriktningens nivåer före tillåten start](todos/pending/2026-10-04-inriktningens-amnen-fore-tillaten-start.md). Analysen ska fånga inriktningsnivåer i åk 1 utom på ES/FR/IN/NB (gymnasieförordningen 4 kap. 2 §). Planering, genomförande och prov återstår.

- 2026-10-03: gap – [bakåtknapp efter inloggning visar rå JSON-koden login_state_invalid](todos/pending/2026-10-03-baktknapp-efter-inloggning-ger-login-state-invalid.md). Avvisningen är korrekt men ska skicka användaren vidare till en sida med begripligt besked. Fasplacering, rättning och prov återstår.

- 2026-10-03: [ange årskurser och terminer för programplanens poäng](todos/pending/2026-10-03-fordela-programplanens-poang-pa-arskurser-och-terminer.md) genomfört och automatiskt verifierat i 05-18. Mänskligt begriplighetsprov väntar. Koppling till framtida timplansskapande och administratörsdelegation ligger i egna todos.

- 2026-10-03: [skapa timplaner direkt från programplaner](todos/pending/2026-10-03-skapa-timplaner-fran-programplaner.md) beställt som nästa flöde efter programplansarbetet. Användaren har preciserat att vald programplansversion ska vara godkänd och fastställd. Timplanen ska kunna redigeras av rektor och skoladministratör inom respektive skola. Genomförande och verifiering återstår.

- 2026-10-03: [huvudmannen ska kunna delegera programplansarbete till rektor och skoladministratör](todos/pending/2026-10-03-huvudmannen-delegerar-programplansarbete-till-skolorna.md) beställt. Skolavgränsad tilldelning/återkallelse och serverkontroller ska planeras i fas 5; arbetsmoment och eventuell beslutsrätt behöver preciseras. Genomförande och verifiering återstår.

- 2026-10-02: [skolgemensamma programfördjupningspaket över flera programplaner](todos/pending/2026-10-02-gemensamma-programfordjupningspaket-over-flera-programplaner.md) beställt. Gemensamt utbud, explicit plan-/paketversion och elevval ska skiljas åt; regler prövas för varje målprogram. Funktionen är inte implementerad.

- Användartermen ska vara programplan/programplaner, inte poängplan/poängplaner (beslut 2026-09-29). Skyddad navigation rättad i 05-06; bredare namnbyte i äldre vyer kvarstår som separat UI-todo, länkat till den samlade UI-genomgången.

- 2026-09-29: kommunval från sökbar lista samt sex uppgifter för ersättning/fakturering mot hemkommun tillagda. Se `.planning/research/HEMKOMMUN-ERSATTNING.md` för primärkällor, rekommenderad ordning och öppna beslut. Detta är framtida planeringsunderlag; fas 4:s öppna checkpoint och fastställd milstolpe kvarstår.

- 04-22: första provdelen och källavvikelse bekräftade av användaren. Klasstillhörighetens datum/presentation har anmärkning; samtidiga ändringar, skyddsbehörighet och separat personnummervisning återstår. Samlad UI-genomgång tillagd som todo 2026-09-29.

- SPAR-synk för elever och vårdnadshavare: befintlig todo kompletterad 2026-09-29 med möjlig Skatteverkskälla, utredning av faktisk anslutningsväg och uttrycklig hantering av källavvikelse mot lokal rättelse. Ingen ny anslutning eller utökning av fas 4 beslutad genom todo-posten.

- 04-22: användarprovet förberett i lokal skyddad app på 3012. Se `04-HUMAN-UAT.md`; mänskliga resultat och godkännande väntar. Planen är inte slutförd.

- Fas 4:s nästa steg: våg 15, 04-22, genomför mänskligt användarprov och redovisar fasens gräns. Våg 14:s handbok och förnyade fulla grind passerade lokalt syntetiskt; se `04-21-SUMMARY.md` och `04-WAVE-14-SUMMARY.md`. Därefter återstår separat `gsd-verify-work`/fasverifiering. Ingen kommunal anslutning eller verklig pilotdrift har verifierats.
- 29 todos under `.planning/todos/pending/` (inventerat 2026-10-05; lärarregisterspåret tillagt). Läsårslinsen ingår bara i den avgränsade omfattning som anges i fas 4:s CONTEXT; övrigt kvarstår.
- 2026-10-01: [rektors handledning om timplanens regelverk](todos/pending/2026-10-01-handledning-for-rektor-om-timplanens-regelverk.md) beställd. Vägledning i vyn och vid ändring ska förklara tillämpliga ramar, konsekvenser och beslutsansvar med daterade primärkällor. Planering och användarverifiering återstår.
- 2026-10-01: befintlig schematodo utökad till [sammanhängande schemadelprojekt](research/SCHEMAMODUL-PROJEKT.md). SCHEMA-01–08 har ansvar i S1–S4 och ännu ej provade verifieringsmål. Program-/tim-/studieplaner, grupper och kalender ska samverka; roller/regler och valbara moduldelar utreds från början, med Rustprototyp och utvärdering av Jev/liknande AI för möjlig användning i schemaarbetet. AI-införande är inte beslutat. Delprojektets första steg är S1 kontrakt/mandat; dess genomförandeplacering är öppen. Fas 5 ska beakta gemensamma ID:n, versioner, enheter och ändringsansvar nu. Ingen ny numrerad pilotfas eller ny rättighet införd.

## Blockers

Inga kända blockerare för fas 4:s planering och lokala syntetiska genomförande. Externa pilotbeslut nedan hindrar verklig anslutning/drift, inte denna fas.

## Externa beroenden och verifieringsramar

- Pilotkund, IdP, kontokälla, registerleverantör, åtkomst och acceptansvillkor är öppna; IAM-02, IAM-06 och INT-07 kräver faktiska anslutningsprov.
- Elevfält, skrivansvar, skyddsfall och rättigheter för fas 4:s syntetiska arbete är beslutade i `04-CONTEXT.md` (D-01–D-20). Verklig pilotvolym samt spärr-/återställningsmål återstår.
- Drift, avtal, informationshantering och pilotbeslut krävs före verkliga elevuppgifter. Dessa externa beroenden hindrar inte planering eller avgränsade syntetiska utvecklingsprov.
- Fas 1–3 har verifierat demoavskiljning, direkta datavägar och loggning lokalt syntetiskt. Fas 4 måste bevara och pröva dessa skydd på registrets nya vägar.
- Kodkartan 2026-09-11 belägger risker med överlappande sparningar, flerstegsskrivningar och breda databasmandat; ta med .planning/codebase/CONCERNS.md i berörd fasplanering.
- Git-baslinjen är verifierad: taggen fas1-baslinje (917313b). Kodkartläggningen i 1a8e1e0 är historik före fas 1.
- Senaste sparade fasverifiering: fas 3 `passed`, kompletterad med mänskligt prov 2026-09-28. Rapporten redovisar 565 SQL-prov och 337 modell-/server-/grindprov; detta är sparade bevis, inte omkörningar vid återupptagen planering. Worker-avbrottets reproducerbarhet och externa beroenden kvarstår enligt rapporten.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Produktvision | Studieplaner, schema, undervisning, ärenden, vårdnadshavare, fler anslutningar, egen drift och eventuell diarietjänst | Se v2 Requirements | 2026-09-10 |
| Schemadelprojekt | Sammanhängande planmoduler, specifika mandat/regler, Rustprototyp, AI-utvärdering för schemat och valbara moduldelar | SCHEMA-01–08 och S1–S4 dokumenterade; kompatibilitet beaktas i fas 5, detaljerat genomförande återstår | 2026-10-01 |

## Session

**Last Date:** 2026-10-05
**Stopped At:** 05-23 A/B/C automatiskt verifierade; nästa D i ny executorsession. Mänskligt prov väntar på vanlig 3012. Full fas 5, yrkesregler 05-17 och fas 4:s checkpoint kvarstår.
**Resume File:** None

**Planned Phase:** 5 — genomför 05-23 D → E före 05-25; mänskligt prov av programplanerna är separat och väntande. 05-17 saknar fortfarande genomförandeplan och ska levereras inför yrkesfastställande. Delegation och full fasverifiering kvarstår — 2026-10-05

### Senaste användarfynd, 2026-10-02

Programplansvyn fick ett misslyckat mänskligt begriplighetsresultat: ”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.” 05-13 ska visa ämnen, nivåer och poäng först och ge tydlig nästa åtgärd; historik och tekniska källuppgifter blir sekundära. Verifierad explicit käll-/startbindning, servermandat, MFA, revisionskonflikter, osäkra sparsvar och användarens lagrade data bevaras. Kodknapp för tre syntetiska MFA-provkonton är färdig och verifierad separat, bara i den lokala test-IdP:n. 05-13 är nu automatiskt genomförd; ny mänsklig bedömning väntar.

**Senaste användarstyrning:** ”måste vara extremt pedagigisk”. Genomfört som hjälp vid första läsningen och vid varje uppgift, med numrerat start–val–spara-flöde. Detta är inget mänskligt begriplighetsgodkännande.

Historik före senaste underkännande: ännu mer pedagogik och fler gymnasieprogram genomförd i 05-14 med separat granskning och additiva exempel. Tidigare tre samtidiga dialogdelar ersätts av två användarsteg. Mänskligt godkännande väntar.

## Aktiv användarrättning — 2026-10-02

05-14:s mänskliga prov är underkänt som rörigt och osammanhängande. Användaren vill ha program → inriktning → programfördjupning och samma UI för nya/befintliga utbildningar. Historisk frontend läst och visuellt jämförd; se 05-PROGRAMFLOW-HISTORICAL-REVIEW och 05-15-FLOW-CONTEXT. 05-15 har verifierat atomiskt skapande för huvudmannen och säkert kvitto; 05-16 använder samma arbetsyta och ämnesgrupperade fördjupningsval. Ingen rektorsbehörighet eller nationell beslutsrätt utvidgas. Tidigare automatiska prov ovan är historik.


## Historiska automatiska bevis och överlämning — 2026-10-02

05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

Tidigare 05-14-introduktion/dialog/kort ovan är historik. 05-16-SUMMARY är aktuellt användarbeteende. Den generella Wrangler-proxyfrågan är öppen; vanlig lokal preview använder direkt workerd utan denna proxy.


## Telefonprov på samma wifi — 2026-10-02

2026-10-02: Användaren vill prova på fysisk telefon och bekräftar samma wifi. Separat tidsbegränsad, åtkomstlänkavgränsad LAN-ingång på port 3013 är implementerad och kör. App/IdP/kodhjälp behåller loopback och befintligt skyddat bygge 023e68b. Tio HTTP-gränsprov och tre verkliga OIDC/MFA-/programvals-/utloggningsfall genom wifi-adressen PASS (dator rektor, WebKit rektor/huvudman); inga utbildningar eller planer skrevs av dessa prov. QR-kod genererad och avkodningskontrollerad; länk/QR är privata och ignorerade. Fysisk telefonåtkomst och mänsklig begriplighet är fortsatt awaiting_user. Se work/pilot/MOBILE-PREVIEW.md och results/mobile-preview.json.
