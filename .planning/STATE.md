---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 03
current_phase_name: Mandat och skyddade datavägar
current_plan: 07
status: executed-awaiting-phase-verification
stopped_at: Fas 3 verifierad med status human_needed (03-VERIFICATION.md, 5d63a5f) — väntar på användarens bekräftelse av elevhälsans avgränsning, IT:s pausa/aktivera och loggfelssituationen. Fas 4 kontext insamlad (04-CONTEXT.md, d51aaee).
last_updated: "2026-09-27T21:26:25.847Z"
last_activity: 2026-09-27
last_activity_desc: "03-07 slutförd: förnyat användarprov godkänt 2026-09-27 (syntetiskt användarprov, dator; telefon i enhetsläge/automatiskt WebKit) efter rättning av tre avvikelser (verifiering inifrån dialogen 43c6b79, engångskod vid inloggning d9499dc, support för grupper 2d17d4c). Färsk verify:phase3 PASS på 278f235, alla sex fas 3-krav PASS lokalt och syntetiskt (föregående körning på 4fb5773 FAIL: access-Workern stannade, oförklarat). Fas 3: 7/7 planer genomförda, väntar fasverifiering. Inga krav markerade verifierade."
state_head: d51aaee5b89671d164d1f81cecb3dac94998a872
progress:
  total_phases: 8
  completed_phases: 2
  total_plans: 29
  completed_plans: 29
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-13)

**Core value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.
**Current focus:** Fas 3 — alla sju planer genomförda; fasverifiering (gsd-verify-work) är nästa steg

## Current Position

Phase: 03 (Mandat och skyddade datavägar) — EXECUTED, väntar fasverifiering
Plan: 7 av 7 genomförda (03-07 genomförd 2026-09-27)
Fas 1: 10 av 10 planer genomförda och verifierade 2026-09-12 (`01-VERIFICATION.md`, status passed).
Fas 2: 12 av 12 planer genomförda och verifierade 2026-09-21 (`02-VERIFICATION.md`, status passed).
**Current Phase:** 03
**Current Phase Name:** Mandat och skyddade datavägar
**Total Phases:** 8
**Current Plan:** 03-07
**Total Plans in Phase:** 7
**Status:** Phase 03 executed — awaiting phase verification (gsd-verify-work)
**Detailed scope:** Approved — användaren godkände 42 detaljkrav och färdplanens åtta faser 2026-09-11.
**Last Activity:** 2026-09-27
**Last Activity Description:** 03-07 slutförd: förnyat användarprov godkänt 2026-09-27 (syntetiskt användarprov, dator; telefon i enhetsläge/automatiskt WebKit) efter rättning av tre avvikelser (verifiering inifrån dialogen 43c6b79, engångskod vid inloggning d9499dc, support för grupper 2d17d4c). Färsk verify:phase3 PASS på 278f235, alla sex fas 3-krav PASS lokalt och syntetiskt (föregående körning på 4fb5773 FAIL: access-Workern stannade, oförklarat). Fas 3: 7/7 planer genomförda, väntar fasverifiering. Inga krav markerade verifierade.

**Tidigare verifiering:** SQL-policy, personbundna tilldelningar, inbjudningar, återkallelse och lokal IT-konfiguration inkopplade. 510 SQL-prov och verkligt samtidighetsprov PASS; 277 modell-/serverprov och 15/15 isolerade API-fall PASS, mandat-/auditfallet utökat till 24 kontroller; giltig verksamhetsinbjudan rättad. Läs 03-04-SUMMARY: Worker-audit/gallring prövade (Worker-API i föregående miljö); källrapporten är sedan 2026-09-26 PASS lokalt på återskapad stack.

Progress: [██████████] 100%
Planprogress: 29 av 29 hittills skrivna planer genomförda. Detta är inte procent färdig produkt; 2 av 8 faser är verifierade.
Phases executed: 3 of 8 (fas 1–2 verifierade; fas 3 genomförd, väntar fasverifiering)

## Performance Metrics

**Velocity:**

- Total plans completed: 29
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
| Phase 03 P07 | ca 3h exkl. användarprov | 2 tasks | 43 files |

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
- [Phase 03]: 03-07: engångskod anges vid inloggning för den som har registrerad kod; övriga loggar in med lösenord; beviset gäller 8 h och step-up är reserv (användarbeslut 2026-09-27)
- [Phase 03]: 03-07: tidsbegränsad support kan gälla en namngiven elev eller en eller flera grupper på en skola; högst 60 minuter, syfte, rektorsgodkännande och ingen export oförändrat (användarbeslut 2026-09-27)
- [Phase 03]: 03-07: användarprovet 2026-09-27 godkänt som syntetiskt användarprov (dator; telefon i enhetsläge/WebKit); det godkänner inte verklig drift, IdP eller kommunanslutning

## Pending Todos

- Nästa steg: fasverifiering av fas 3 med gsd-verify-work (gsd-verifier). Kraven ACL-02–05 och AUDIT-02–03 markeras verifierade först där. Öppna verksamhetsbeslut från 03-07 finns i 03-07-SUMMARY.md.
- 5 todos under .planning/todos/pending/: API för lärares behörigheter (api, 09-12); Läsårslins som i Plan Digital (ui, 09-12); Planera stark identitetskontroll och BankID (auth, 09-13); RACI-matris för kommun-/organisationsadmin (auth, 09-13); Leverantörens systemadministration i gränssnittet (auth, 09-27).

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

**Last Date:** 2026-09-27T21:26:25.543Z
**Stopped At:** Fas 3 verifierad med status human_needed (03-VERIFICATION.md, 5d63a5f) — väntar på användarens bekräftelse av elevhälsans avgränsning, IT:s pausa/aktivera och loggfelssituationen. Fas 4 kontext insamlad (04-CONTEXT.md, d51aaee).
**Resume File:** .planning/phases/04-best-ndigt-och-skyddat-elevregister/04-CONTEXT.md

**Planned Phase:** 3 (Mandat och skyddade datavägar) — 7 planer — 2026-09-22
