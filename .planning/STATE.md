---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 05
current_phase_name: Bevarade utbildnings- och klassflöden
current_plan: 05-13
status: executing
stopped_at: Human programplan trial found major UX gap; preparing 05-13 correction and local OTP button; Phase 4 checkpoint open
last_updated: "2026-10-02"
last_activity: 2026-10-02
last_activity_desc: "Användaren underkände programplansvyns begriplighet. 05-13 genomförs med ämnen och tydliga åtgärder först. Lokal provkodsknapp verifieras separat; fas 4 och fasverifiering kvarstår."
state_head: 81a9fdc
worker_build_revision: c3200412f24a5ca797b47bcc2bfcf714d56e5697
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 67
  completed_plans: 65
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-02)

**Core value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.
**Current focus:** Fas 5: tolv tidigare planer genomförda automatiskt. Användaren har därefter rapporterat att programplansvyn är obegriplig; 05-13 planerar och rättar denna UX-lucka före nytt mänskligt prov. Exakt tio avgränsade Worker-entrypoints; klientroller och helpers stängda. Nationella regler, fastställande, nya utbildningar, kullkopiering och klasskoppling återstår. Fas 4:s checkpoint kvarstår separat.

## Current Position

**Aktuellt läge 2026-10-02:** 05-11:s programplansbrowser 30/30 och timplansregression 20/20 PASS mot samma bygge c320041, inga retries/skips. Samtliga 50 fixturer städade med audit/ankare bevarade. Modell/server/generator 502, typ/lint och handbok PASS; oberoende kodgranskning 6/6. Vanlig skyddad 3012 utan diagnostisk preload har frisk startsida och Worker-hälsa. Fyra beständiga syntetiska exempel är lästa av befintliga rektors-/HM-mandat med 16 DB-/Worker-auditpar; egna sessioner städade. Förberedelsens omkörning bevarade sju rader och en ändrad kulltext. Ingen hel fas eller ADMIN-krav slutverifierat.

**Användarprov 2026-10-01:** användaren rapporterar att alla tidigare timplansprov fungerar, registrerat i 05-TIMPLAN-USER-TRIAL.md. Ny regelhandledning och programplansvyn kräver fortfarande mänsklig förståelsebedömning; deras automatiska prov är separata. Fas 4:s checkpoint kvarstår.

Phase: 05 (Bevarade utbildnings- och klassflöden) — 05-01–05-12 genomförda till konkret mänskligt prov. Fas 4 kvarstår på 24 av 25 planer.
Fas 4: 04-01–04-21, 04-23, 04-24 och 04-25 klara; mänsklig checkpoint 04-22 kvarstår separat.
Fas 1: 10 av 10 planer genomförda och verifierade 2026-09-12 (`01-VERIFICATION.md`, status passed).
Fas 2: 12 av 12 planer genomförda och verifierade 2026-09-21 (`02-VERIFICATION.md`, status passed).
**Current Phase:** 05
**Current Phase Name:** Bevarade utbildnings- och klassflöden
**Total Phases:** 8
**Current Plan:** 05-13 genomförs efter användarens misslyckade begriplighetsprov av programplansvyn. Lokalt provkodsstöd genomförs parallellt på användarens begäran. Ingen fas eller mänsklig UX-grind godkänd.
**Total Plans in Phase:** 13 skrivna, 12 automatiskt genomförda; mänskligt 05-11/05-12-prov och återstående utbildnings-/beslutsflöden är öppna.
**Status:** 05-13 genomförs efter underkänt mänskligt begriplighetsprov. Tidigare mekaniska browserprov är historiska bevis; rättningen kräver färska prov och ny mänsklig bedömning. Fas 4 och previewavbrottsdiagnosen kvarstår.
**Detailed scope:** Approved — användaren godkände 42 detaljkrav och färdplanens åtta faser 2026-09-11.
**Last Activity:** 2026-10-02
**Last Activity Description:** Skyddad programplansvy och timplanshandledning genomförda till mänskligt prov. 30+20 browser, 502 modell/server/generator, oberoende kodgranskning 6/6 och fyra beständiga exempel via aktuell 3012 PASS. Inga nya grants i UI-planen; totalt tio fas 5-entrypoints efter 05-10.

**Senaste förtydligande:** Jev och liknande AI ska utvärderas för schemamodulen, inte specificeras som obligatorisk produktfunktion. SCHEMA-05 och S2 anger jämförelse mot samma motor utan AI och dokumenterad rekommendation; att avstå är ett giltigt utfall. Kunden ska kunna köpa moduler var för sig. MODUL-01–04 tillagda för separat modultillgång/personmandat, externa databeroenden och tillägg/avslut med bevarade ID:n/historik. S1/S4 utökade med kontrakt och provmål; modulkatalog, priser och beställnings-/betalningsprocess återstår.

**Senaste genomförandebevis, 2026-10-02:** 05-11/05-12:s gemensamma bygge c320041: programplan 30/30, timplan 20/20, cleanup 50/50 och full kontrollerad fallmatris PASS. Programprov bevarar 679 audithändelser/36 ankare, timplan 300/26. Roots färska modell/server 386+105 och oförändrade generatorprov 11 PASS. Källor matchar bygget; typ/lint, handbok och oberoende kodgranskning 6/6 PASS. Usertrial-Worker läser fyra exempel för två befintliga mandat, 16 auditerade läsningar. Äldre avbrutna omgångar hålls som FAIL och .planning/debug/phase5-preview-exit.md förblir awaiting_evidence. Se 05-11-SUMMARY/REVIEW och phase5-11-root-verification.json. Ingen mänsklig förståelsebedömning eller fasverifiering ersätts av dessa prov.

**Tidigare verifiering:** SQL-policy, personbundna tilldelningar, inbjudningar, återkallelse och lokal IT-konfiguration inkopplade. 510 SQL-prov och verkligt samtidighetsprov PASS; 277 modell-/serverprov och 15/15 isolerade API-fall PASS, mandat-/auditfallet utökat till 24 kontroller; giltig verksamhetsinbjudan rättad. Läs 03-04-SUMMARY: Worker-audit/gallring prövade (Worker-API i föregående miljö); källrapporten är sedan 2026-09-26 PASS lokalt på återskapad stack.

Progress: [████░░░░░░] 38%
Planprogress: 65 av 67 hittills skrivna planer genomförda; fas 4 har 24 av 25. Detta är inte procent färdig produkt; 3 av 8 faser är verifierade.
Phases executed: 3 of 8 (fas 1–3 verifierade lokalt med syntetiska uppgifter)

## Performance Metrics

**Velocity:**

- Total plans completed: 65
- Average duration: Ej tillämpligt
- Total execution time: Ej sammanräknad; registrerade uppgiftstider finns nedan.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | 0 | - | - |
| 3 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: 05-08, 05-09, 05-12, 05-10 och 05-11 automatiskt genomförda; mänskligt samlat prov återstår.
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

- Användartermen ska vara programplan/programplaner, inte poängplan/poängplaner (beslut 2026-09-29). Skyddad navigation rättad i 05-06; bredare namnbyte i äldre vyer kvarstår som separat UI-todo, länkat till den samlade UI-genomgången.

- 2026-09-29: kommunval från sökbar lista samt sex uppgifter för ersättning/fakturering mot hemkommun tillagda. Se `.planning/research/HEMKOMMUN-ERSATTNING.md` för primärkällor, rekommenderad ordning och öppna beslut. Detta är framtida planeringsunderlag; fas 4:s öppna checkpoint och fastställd milstolpe kvarstår.

- 04-22: första provdelen och källavvikelse bekräftade av användaren. Klasstillhörighetens datum/presentation har anmärkning; samtidiga ändringar, skyddsbehörighet och separat personnummervisning återstår. Samlad UI-genomgång tillagd som todo 2026-09-29.

- SPAR-synk för elever och vårdnadshavare: befintlig todo kompletterad 2026-09-29 med möjlig Skatteverkskälla, utredning av faktisk anslutningsväg och uttrycklig hantering av källavvikelse mot lokal rättelse. Ingen ny anslutning eller utökning av fas 4 beslutad genom todo-posten.

- 04-22: användarprovet förberett i lokal skyddad app på 3012. Se `04-HUMAN-UAT.md`; mänskliga resultat och godkännande väntar. Planen är inte slutförd.

- Fas 4:s nästa steg: våg 15, 04-22, genomför mänskligt användarprov och redovisar fasens gräns. Våg 14:s handbok och förnyade fulla grind passerade lokalt syntetiskt; se `04-21-SUMMARY.md` och `04-WAVE-14-SUMMARY.md`. Därefter återstår separat `gsd-verify-work`/fasverifiering. Ingen kommunal anslutning eller verklig pilotdrift har verifierats.
- 19 todos under `.planning/todos/pending/`. Läsårslinsen ingår bara i den avgränsade omfattning som anges i fas 4:s CONTEXT; övrigt kvarstår.
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

**Last Date:** 2026-10-02
**Stopped At:** 05-13 genomförs efter underkänd programplans-UX. Befintliga fyra användarexempel bevaras. Lokala OTP-knappens fulla inloggningsprov felsöks parallellt. Fas 4 och tidigare previewavbrotts rotorsak är öppna.
**Resume File:** None

**Planned Phase:** 5 (Bevarade utbildnings- och klassflöden) — genomför 05-13, pröva begriplighet på nytt och registrera timplanshandledning; därefter planera återstående nationella beslut, utbildningsskapande, kullkopiering och klasskoppling — 2026-10-02

### Senaste användarfynd, 2026-10-02

Programplansvyn fick ett misslyckat mänskligt begriplighetsresultat: ”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.” 05-13 ska visa ämnen, nivåer och poäng först och ge tydlig nästa åtgärd; historik och tekniska källuppgifter blir sekundära. Verifierad explicit käll-/startbindning, servermandat, MFA, revisionskonflikter, osäkra sparsvar och användarens lagrade data bevaras. Kodknapp för tre syntetiska MFA-provkonton förbereds separat, bara i den lokala test-IdP:n.
