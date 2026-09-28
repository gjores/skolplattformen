---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 04
current_phase_name: Beständigt och skyddat elevregister
current_plan: 04-17
status: executing
stopped_at: Completed 04-24-PLAN.md
last_updated: "2026-09-28T19:41:07.181Z"
last_activity: 2026-09-28
last_activity_desc: "04-24 genomförd: migration 20260929180000 (tillämpad efter 170000, före 04-17:s 20260930100000) ger listan protectedIdentity:true och protectedIds för hela urvalet bara för administratör med skyddsbehörighet på skolan; auditRefs ur hela urvalet (en committad pupil_protected_read per utlämnat ID); obehörigas svar oförändrat. Adaptern stoppar avvikande skyddsform (audit_unavailable). Märket Skyddade personuppgifter i listan och kryssrutan Ta med elever med skyddade personuppgifter ({p}) i exporten, aldrig förvald, återställs vid målbyte, serverprövat antal. SQL 16/16 filer 1224 PASS, nod 399/399, tsc/lint/build PASS, browserprov 3/3 (dator, iPhone 13 WebKit, 320 px) + regression kort 9/9 och lista 13/13; nedladdning ej browserprovad (p3.admin saknar engångskod). Lokalt syntetiskt. Nästa i våg 9: 04-17."
state_head: 4b67e59349cdb4f03ad179962e46e80b34025299
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 54
  completed_plans: 47
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-28)

**Core value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.
**Current focus:** Fas 4 — våg 9 pågår. 04-25 och 04-24 klara: nekade anrop fäller inte längre den lokala Workern, och behörig administratör ser skyddsmärke och kan uttryckligen ta med skyddade elever i exporten (lokalt syntetiskt). Nästa: 04-17 (avveckla elevprovet).

## Current Position

Phase: 04 (Beständigt och skyddat elevregister) — genomförande pågår, 18 av 25 planer klara
Plan: 04-01–04-15, 04-23, 04-24 och 04-25 klara; våg 9 pågår; nästa 04-17
Fas 1: 10 av 10 planer genomförda och verifierade 2026-09-12 (`01-VERIFICATION.md`, status passed).
Fas 2: 12 av 12 planer genomförda och verifierade 2026-09-21 (`02-VERIFICATION.md`, status passed).
**Current Phase:** 04
**Current Phase Name:** Beständigt och skyddat elevregister
**Total Phases:** 8
**Current Plan:** 04-17 (våg 9)
**Total Plans in Phase:** 25
**Status:** Executing (våg 9: 04-25 och 04-24 klara; nästa 04-17)
**Detailed scope:** Approved — användaren godkände 42 detaljkrav och färdplanens åtta faser 2026-09-11.
**Last Activity:** 2026-09-28
**Last Activity Description:** 04-24 genomförd: migration 20260929180000 (tillämpad efter 170000, före 04-17:s 20260930100000) ger listan protectedIdentity:true och protectedIds för hela urvalet bara för administratör med skyddsbehörighet på skolan; auditRefs ur hela urvalet (en committad pupil_protected_read per utlämnat ID); obehörigas svar oförändrat. Adaptern stoppar avvikande skyddsform (audit_unavailable). Märket Skyddade personuppgifter i listan och kryssrutan Ta med elever med skyddade personuppgifter ({p}) i exporten, aldrig förvald, återställs vid målbyte, serverprövat antal. SQL 16/16 filer 1224 PASS, nod 399/399, tsc/lint/build PASS, browserprov 3/3 (dator, iPhone 13 WebKit, 320 px) + regression kort 9/9 och lista 13/13; nedladdning ej browserprovad (p3.admin saknar engångskod). Lokalt syntetiskt. Nästa i våg 9: 04-17. Tidigare: 04-25 genomförd: Worker-avbrotten på nekade anrop orsakades av att nekandet svarade med oläst begärandekropp, så att wranglers lokala proxy tappade nästa anrop och avslutades (A/B: med kropp 5/5 avbrott, utan kropp 0/5, läst kropp 0/10). denyResponse loggar nu först, läser kroppen till slut (högst 1 MiB, ingen buffring) och svarar sist (ee00e31). Stabilitet: baslinje 16/25 avbrott, efter rättningen 25/25 PASS (20 prov à 9/9, 5 nekandeflöden à 200), 0 avbrott; nod 394/394, tsc/lint/build PASS; lokalt syntetiskt. Separat fynd: ett ohanterat avslag per postgres-klient (deferred-items). Nästa i våg 9: 04-24, 04-17. Tidigare: 04-24 och 04-25 planerade för luckorna från våg 8: 04-24 ger behörig administratör skyddsmärke och uttryckligt skyddsval i exporten (migration 20260929180000, obehörigas listsvar oförändrat); 04-25 utreder och åtgärdar Worker-avbrott på nekade anrop. 04-16 beror nu på båda. Tidigare: 04-15 genomförd: phase3_boundaries (41), phase3_connections (19) och phase3_audit (19) portade till registret med nya fas 4-gränser (elevhälsoansvarig/IT utan registerläsning, support bara namngiven elev, underhållsrollen utan registeråtkomst, gallring rör inte registerhistorik); full SQL 16/16 filer, 1161 assertions PASS. phase3-fixtures.sql och phase3-browser-fixtures.mjs skriver till registret med samma ID, läser referensdata efter assertTarget och gav identiska antal i två körningar utan ny skyddsbehörighet. Inga kontraktsändringar. Tidigare: 04-13 genomförd: elevkort i samma main, sex ändringsdialoger med sann sparstatus, konfliktval per uppgift, periodkonflikt, källavvikelse och exportdialog med serverns förhandsprövning; node 389/389, tsc/lint/build PASS, riktat browserprov 9/9 (dator, telefon 390 och 320 px) och listregression 13/13 mot byggd Worker. Lyckad sparning, verklig 409 och nedladdad fil ej browserprovade (p3.admin saknar engångskod) — 04-16/04-19. Skyddade elever utelämnas alltid ur exporten tills listan får skyddsflagga per rad. Tidigare: 04-23 genomförd: migration 20260929170000 ger Worker EXECUTE på exakt de fyra registerfunktionerna; ACL-fixturer register 162, periods 101, export 22 PASS; full SQL 14/16 filer ok (kvar phase3_boundaries/connections, 04-15); verkligt Worker-prov 9/9 PASS (lokalt mintade sessioner, testrealmens bevisprofil). Icke-deterministiskt Wrangler-avbrott på nekade anrop (5 av 11 körningar) står i fasens deferred-items. Tidigare: 04-14 genomförd: fas 3-fixturerna mandates 279, matrix 56, policy 105 och temporal 34 assertions PASS mot registret (lokalt, syntetiskt). Full SQL 1081 passerade men FAIL på phase3_boundaries/phase3_connections (04-15). Worker-EXECUTE för ändring/källa/personnummer/export öppnades därefter i 04-23.

**Tidigare verifiering:** SQL-policy, personbundna tilldelningar, inbjudningar, återkallelse och lokal IT-konfiguration inkopplade. 510 SQL-prov och verkligt samtidighetsprov PASS; 277 modell-/serverprov och 15/15 isolerade API-fall PASS, mandat-/auditfallet utökat till 24 kontroller; giltig verksamhetsinbjudan rättad. Läs 03-04-SUMMARY: Worker-audit/gallring prövade (Worker-API i föregående miljö); källrapporten är sedan 2026-09-26 PASS lokalt på återskapad stack.

Progress: [████░░░░░░] 38%
Planprogress: 47 av 54 hittills skrivna planer genomförda; fas 4 har 18 av 25. Detta är inte procent färdig produkt; 3 av 8 faser är verifierade.
Phases executed: 3 of 8 (fas 1–3 verifierade lokalt med syntetiska uppgifter)

## Performance Metrics

**Velocity:**

- Total plans completed: 44
- Average duration: Ej tillämpligt
- Total execution time: Ej sammanräknad; registrerade uppgiftstider finns nedan.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | 0 | - | - |
| 3 | 7 | - | - |

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
| Phase 04 P10 | 25min | 2 tasks | 5 files |
| Phase 04 P14 | ca 35min | 2 tasks | 4 files |
| Phase 04 P23 | ca 35min | 2 tasks | 5 files |
| Phase 04 P13 | 22min | 2 tasks | 10 files |
| Phase 04 P15 | 20min | 2 tasks | 5 files |
| Phase 04 P25 | 50min | 3 tasks | 6 files |
| Phase 04 P24 | ca 30min | 3 tasks | 11 files |

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

## Pending Todos

- Nästa steg: våg 9 i ordningen `04-25` (utred och åtgärda Worker-avbrott på nekade anrop), `04-24` (skyddade elever i lista och export för behörig; migrationen 20260929180000 ska tillämpas före 04-17:s) och `04-17` (avveckla elevprovet utan alternativa datavägar). Våg 1–8 är genomförda och ska inte göras om; se `04-WAVE-07-SUMMARY.md`, `04-13-SUMMARY.md`, `04-15-SUMMARY.md` och `04-23-SUMMARY.md` (Wrangler-avbrott på nekade anrop i `deferred-items.md`). 04-15: full SQL-regression PASS 16/16 filer, 1161 assertions; fas 3-fixturerna återkörbara mot registret. `verify-mandates.mjs` lägger fortfarande egna tillfälliga rader i elevprovet (`setupTemporary`) och dess API-fall ägs av 04-18. Full fasgrind (04-21), E2E (04-16), UI-grind (04-19) och samlad användarverifiering återstår. Fas 3 är stängd med `03-VERIFICATION.md` och `03-HUMAN-UAT.md` (2026-09-28); ACL-02–05 och AUDIT-02–03 är verifierade lokalt syntetiskt. Öppna externa beroenden kvarstår.
- 8 todos under `.planning/todos/pending/`. Läsårslinsen ingår bara i den avgränsade omfattning som anges i fas 4:s CONTEXT; övrigt kvarstår.

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

## Session

**Last Date:** 2026-09-28T19:41:07.057Z
**Stopped At:** Completed 04-24-PLAN.md
**Resume File:** None

**Planned Phase:** 4 (Beständigt och skyddat elevregister) — 25 planer i 15 vågor — 2026-09-28
