---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 03
current_phase_name: Mandat och skyddade datavägar
current_plan: 07
status: executing
stopped_at: 03-01–06 genomförda. 03-06 klar 2026-09-26 (25/25 API-fall med källbevis; verify:phase3 vägrar PASS, krav BLOCKED tills 03-07); nästa 03-07.
last_updated: "2026-09-26T13:36:48.938Z"
last_activity: 2026-09-26
last_activity_desc: "03-06 slutförd: verify-mandates.mjs kör 25 namngivna API-/kringgående-/loggfelsfall mot byggd Worker på återskapad stack, 25/25 PASS (130 kontroller) inklusive 28 avstämda nekanden, loggfel vid läsning/export/mutation/nekande och källavbrott Kong/Storage/Postgres; access-regression 16/16. verify:phase3 (fail-closed, färskhet, kravtabell) kördes vid c7a113d: totalstatus FAIL, alla sex fas 3-krav BLOCKED (fas 3-mandatbrowser saknas till 03-07; baseline ej startat; port 5192 upptagen; fas 2-browserns OTP-inloggning FAIL). Byggd preview omstartad på localhost:3000 (c7a113d). Inga fas 3-krav markerade verifierade."
state_head: 440bcb0616588b9fa7a5f84fc3bde5cf31f8aa28
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 29
  completed_plans: 28
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-13)

**Core value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.
**Current focus:** Fas 3 — 03-01–06 genomförda; 03-07 (mandatbrowser, fasgrind, användarprov, handbok) är nästa steg

## Current Position

Phase: 03 (Mandat och skyddade datavägar) — IN PROGRESS
Plan: 03-07 nästa (03-06 genomförd 2026-09-26)
Fas 1: 10 av 10 planer genomförda och verifierade 2026-09-12 (`01-VERIFICATION.md`, status passed).
Fas 2: 12 av 12 planer genomförda och verifierade 2026-09-21 (`02-VERIFICATION.md`, status passed).
**Current Phase:** 03
**Current Phase Name:** Mandat och skyddade datavägar
**Total Phases:** 8
**Current Plan:** 03-07
**Total Plans in Phase:** 7
**Status:** Executing Phase 03 — SQL/server cutover applied; verification incomplete
**Detailed scope:** Approved — användaren godkände 42 detaljkrav och färdplanens åtta faser 2026-09-11.
**Last Activity:** 2026-09-26
**Last Activity Description:** 03-06 slutförd: verify-mandates.mjs kör 25 namngivna API-/kringgående-/loggfelsfall mot byggd Worker på återskapad stack, 25/25 PASS (130 kontroller) inklusive 28 avstämda nekanden, loggfel vid läsning/export/mutation/nekande och källavbrott Kong/Storage/Postgres; access-regression 16/16. verify:phase3 (fail-closed, färskhet, kravtabell) kördes vid c7a113d: totalstatus FAIL, alla sex fas 3-krav BLOCKED (fas 3-mandatbrowser saknas till 03-07; baseline ej startat; port 5192 upptagen; fas 2-browserns OTP-inloggning FAIL). Byggd preview omstartad på localhost:3000 (c7a113d). Inga fas 3-krav markerade verifierade.

**Tidigare verifiering:** SQL-policy, personbundna tilldelningar, inbjudningar, återkallelse och lokal IT-konfiguration inkopplade. 510 SQL-prov och verkligt samtidighetsprov PASS; 277 modell-/serverprov och 15/15 isolerade API-fall PASS, mandat-/auditfallet utökat till 24 kontroller; giltig verksamhetsinbjudan rättad. Läs 03-04-SUMMARY: Worker-audit/gallring prövade (Worker-API i föregående miljö); källrapporten är sedan 2026-09-26 PASS lokalt på återskapad stack.

Progress: [█████████░] 90%
Planprogress: 28 av 29 hittills skrivna planer genomförda. Detta är inte procent färdig produkt; 2 av 8 faser är verifierade.
Phases executed: 2 of 8 (fas 1–2 verifierade)

## Performance Metrics

**Velocity:**

- Total plans completed: 26
- Average duration: Ej tillämpligt
- Total execution time: Ej sammanräknad; registrerade uppgiftstider finns nedan.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | 0 | - | - |

**Recent Trend:**

- Last 5 plans: Se fas 1:s SUMMARY-filer; samtliga tio planer genomförda.
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

## Accumulated Context

## Decisions Made

Fullständiga beslut finns i PROJECT.md.

| Phase | Summary | Rationale |
|-------|---------|-----------|
| Init | 42 detaljkrav och åtta faser godkända 2026-09-11 | Användarens uttryckliga ja till kravförslaget och färdplanen |
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

## Pending Todos

- Nästa steg: fortsätt `gsd-execute-phase 3` med 03-06 (kör om samlad Worker-audit/API inkl. nekandeflod och loggfelsinjektion på nya stacken; phase3-pupils ingår), sedan 03-07 (fasgrind, användarprov, handbok). Browserkonton: `node work/pilot/phase3-browser-fixtures.mjs --target protected`; prov: `npx playwright test -c playwright.phase3.config.ts` i web/.
- 7 todos under .planning/todos/pending/: API för lärares behörigheter (api, 09-12); Läsårslins som i Plan Digital (ui, 09-12); Planera stark identitetskontroll och BankID (auth, 09-13); RACI-matris för kommun-/organisationsadmin (auth, 09-13); SPAR-synk för elever och vårdnadshavare (integration, 09-14); Docusaurus endast instruktioner och regler i systemen (docs, 09-23); Utred Sverige-id och integration i appen (auth, 09-26).

## Blockers

- Pilotkund, IdP, kontokälla, registerleverantör, åtkomst och acceptansvillkor är öppna; IAM-02, IAM-06 och INT-07 kräver faktiska anslutningsprov.
- Elevfält, skrivansvar, rättighetsmatris, skyddsfall, volym samt spärr-/återställningsmål måste fastställas för piloten.
- Drift, avtal, informationshantering och pilotbeslut krävs före verkliga elevuppgifter. Dessa externa beroenden hindrar inte planering eller avgränsade syntetiska utvecklingsprov.
- Demoetablering, direkta datavägar och loggning måste verifieras tillsammans innan elevregistret öppnas.
- Kodkartan 2026-09-11 belägger risker med överlappande sparningar, flerstegsskrivningar och breda databasmandat; ta med .planning/codebase/CONCERNS.md i berörd fasplanering.
- Git-baslinjen är verifierad: taggen fas1-baslinje (917313b). Kodkartläggningen i 1a8e1e0 är historik före fas 1.
- Senaste sparade fasverifiering 2026-09-21 redovisar 175 riktade tester utan fel och binder fas 2 till den fulla PASS-grinden: 137 pgTAP-prov, 39 nekade direkta datavägar, 14/14 API-fall och 37 skyddade browserprov.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Produktvision | Studieplaner, schema, undervisning, ärenden, vårdnadshavare, fler anslutningar, egen drift och eventuell diarietjänst | Se v2 Requirements | 2026-09-10 |

## Session

**Last Date:** 2026-09-26T13:36:48.832Z
**Stopped At:** Completed 03-06-PLAN.md (2026-09-26). Nästa: 03-07.
**Resume File:** .planning/phases/03-mandat-och-skyddade-datavagar/.continue-here.md

**Planned Phase:** 3 (Mandat och skyddade datavägar) — 7 planer — 2026-09-22
