---
phase: 1
slug: baslinje-och-avskild-pilotmilj
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-09-11
---

# Phase 1 — Validation Strategy

Kontrakt för kommande exekvering av BASE-01, BASE-02 och PILOT-01. Utgår från `01-RESEARCH.md` och `01-UI-SPEC.md`. Inga nya app-, browser- eller databasprov har körts när detta underlag skrivs. Planeraren ska ersätta den preliminära kartan nedan med exakta plan-/uppgifts-ID:n och kommandon innan plangranskning.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Befintlig Node 24 `node:test`; planerad Playwright 1.63.0 och pgTAP genom lokal Supabase CLI. |
| Config file | `web/playwright.config.ts` och separata lokala mål skapas under fasen. |
| Quick run command | Från `web/`: `node --test lib/*.test.mjs`. Kör med verifierad Node 24 i PATH. |
| Full suite command | Planerad `npm run verify:phase1` från `web/`, efter att dess script och beroenden skapats. |
| Estimated runtime | Modellsviten tog cirka en sekund vid kartläggningen. Ny fullsvit är ännu inte uppmätt. |
| Runtime på denna dator | Lägg `/Users/petter.gjores/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin` först i PATH. Standard-PATH:s Node 20 uppfyller inte paketkravet. |
| Databasförutsättning | Docker finns men daemon svarade inte under research. Lokal start/preflight krävs vid exekvering. Avsaknad av databas ger blockerad kontroll, aldrig tyst PASS eller molnfallback. |

## Sampling Rate

- Efter varje koduppgift: relevanta snabba modell-/transportprov. Dokumentuppgifter granskas direkt mot källbeslut; inga tester som bara speglar rubriker behövs.
- Efter varje våg: berörda browser-/SQL-prov samt typkontroll, riktad lint och bygge när kod ändrats. Ingen upprepning av oförändrade dyra kontroller utan anledning.
- Snabb återkoppling: mål under 30 sekunder efter start, faktisk tid dokumenteras. Installation, kallstart, full replay och bygge är separata längre kontroller.
- Före fasverifiering: alla säkerhetskontroller ska vara gröna, baslinjens faktiska resultat ska vara fullständigt redovisade och pilotprofilen granskad.
- En äldre sparningsreproducerare med rätt förväntan får redovisas som `FAIL/KNOWN-ISSUE` med namngiven ägare och villkor före beständig aktivering. Den får inte räknas som passerad verksamhetsfunktion eller döljas av en lyckad säkerhetsgrind.

## Per-Task Verification Map

Preliminär ansvarskarta. Planeraren fyller slutliga Task ID, Plan och Wave när arbetet delas upp; varje rad ska ha verkligt test eller en uttrycklig manuell kontroll.

| Område | Requirement | Threat Ref / Secure Behavior | Test Type | Automated Command | File Exists | Status |
|--------|-------------|-----------------------------|-----------|-------------------|-------------|--------|
| Källbaslinje och återställning | BASE-01 | Hemligheter och befintlig arbetskopia bevaras | restore/smoke | Planerad `node work/pilot/verify-baseline.mjs` | Nej — måste skapas före användning | pending |
| Miljö/start och verkliga laddare | BASE-02 | Ingen klient, anonym inloggning, bootstrap eller seed från vanlig laddning | unit/transport | Planerad `node --test lib/runtime-mode.test.mjs lib/store-isolation.test.mjs` i web | Nej | pending |
| Sammanhängande provmaterial | BASE-01, BASE-02 | Två egna skolor, konsekventa elev-/klassreferenser, syntetiska uppgifter | unit | Planerad `node --test lib/pilot-fixtures.test.mjs` i web | Nej | pending |
| Disponibla lokala provmål | BASE-01, BASE-02 | Manifest/projekt-ID/loopback måste stämma före varje skrivning | tooling/unit | Målskyddstest skapas med `work/pilot/verify-target.mjs` | Nej | pending |
| Installerad karantän | BASE-02 | PUBLIC/anon/authenticated nekas även genom gamla profiler, RPC, Storage och framtida objekt | SQL/API | `supabase --workdir <manifestets skyddade mål> test db --local`; planerad `node work/pilot/verify-isolation.mjs` | Nej | pending |
| Positiva lokala baslinjeflöden | BASE-01 | Kullkopior oberoende, fasta klassversioner; separat mål före karantän | integration | Planerad `node work/pilot/verify-baseline-db.mjs` | Nej | pending |
| Utbildning, kurs/nivå, kull, klass–timplan och GR | BASE-01 | Befintliga verksamhetsregler bevaras | e2e | Planerad `npx playwright test e2e/phase1-baseline.spec.ts --project=desktop --project=phone` i web | Nej | pending |
| Byggd klient och telefon | BASE-02 | Ingen Supabase/Auth/RPC-trafik trots gamla miljövärden/session; rätt byggläge | built e2e | Planerad `npx playwright test e2e/phase1-isolation.spec.ts --project=desktop` i web | Nej | pending |
| Konkurrerande sparningar | BASE-01 | Senaste avsikt ska finnas i UI och lagring; faktiskt fel synliggörs | async regression | Planerad `npx playwright test e2e/phase1-save-order.spec.ts --project=desktop` i web | Nej | pending |
| Daterad anslutningsprofil | PILOT-01 | Bekräftat, syntetiskt, förslag och öppet hålls isär | dokumentgranskning | Manuell källspårning; se nedan | Nej | pending |

## Wave 0 Requirements

”Wave 0” anger saknad provinfrastruktur, inte en extra leveransfas. Varje punkt får en uttrycklig ägaruppgift och måste finnas före sitt första beroende.

- [ ] Granskad appkällbaslinje, runtimeval, återställningsverktyg och bevisformat.
- [ ] Läges-/transportprov av verkliga loaders och sammanhängande fixturtester.
- [ ] Lokal målpreflight, manifest, migrationsreplay, syntetisk etablering och avgränsad städning.
- [ ] SQL/API-kontroller av installerade rättigheter, gamla anonymprofiler, RPC, defaultprivilegier och privat Storage.
- [ ] Playwright, versionsmatchade Chromium/WebKit, deterministisk server utan återanvändning, byggt exempelprov och felreproducerare.
- [ ] Sammanställare som behåller delresultat och aldrig gör saknade/felande säkerhetsprov gröna.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Pilotprofilens sakliga status | PILOT-01 | Källansvar och ännu ej fattade kundbeslut kräver innehållsgranskning | Läs mot D-01–D-10. Datum, organisation, elev-/placeringsfält, originalkälla, skrivansvar, faktisk volym och öppna part-/leverantörsval ska framgå. 24 föreslagna exempel får inte bli verklig pilotvolym. |
| Användning på faktisk telefon | BASE-01, BASE-02 | Enhetsemulering bevisar inte LAN-tillgänglighet på användarens telefon | Öppna den verifierade exempelbyggnaden via dokumenterad lokal adress. Välj båda skolorna, prova berörda flöden, läs minnesstatus, ladda om. Om fysisk enhet saknas anges ej utfört, inte PASS. |
| Läslighet och tangentbord | BASE-01, BASE-02 | Skärmbilder och automatkontroller räcker inte ensamma | Följ UI-SPEC: 1440/390/320 CSS px, 200 % text, fokus, hjälpdialog, avgränsad tabellrullning och minst 44 px pekytor på ändrade kontroller. Dokumentera observation och revision. |

## Validation Sign-Off

- [ ] Alla uppgifter har `<automated>`-kontroll eller uttrycklig manuell dokumentkontroll.
- [ ] Inga tre koduppgifter i följd utan automatiserad återkoppling.
- [ ] Alla saknade provreferenser får ägaruppgift före första användning.
- [ ] Slutlig uppgiftskarta, vågor och hotreferenser överensstämmer med PLAN-filerna.
- [ ] Inga watch-lägen; snabb återkoppling har ett mätbart tidsmål.
- [ ] `nyquist_compliant: true` sätts först efter godkänd granskning av plankontraktet. `wave_0_complete` förblir false tills infrastrukturen faktiskt byggts och prövats.

**Approval:** pending — planernas granskningsresultat fylls i före exekvering.
