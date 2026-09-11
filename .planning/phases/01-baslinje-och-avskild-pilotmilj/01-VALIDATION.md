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
| Runtime på denna dator | Lägg `/opt/homebrew/opt/node@25/bin` (v25.9.0, verifierad 2026-09-11) först i PATH; Codex-runtimens Node 24 fungerar också. Standard-PATH:s Node 20 uppfyller inte paketkravet. |
| Databasförutsättning | Docker finns men daemon svarade inte under research. Lokal start/preflight krävs vid exekvering. Avsaknad av databas ger blockerad kontroll, aldrig tyst PASS eller molnfallback. |

## Sampling Rate

- Efter varje koduppgift: relevanta snabba modell-/transportprov. Dokumentuppgifter granskas direkt mot källbeslut; inga tester som bara speglar rubriker behövs.
- Efter varje våg: berörda browser-/SQL-prov samt typkontroll, riktad lint och bygge när kod ändrats. Ingen upprepning av oförändrade dyra kontroller utan anledning.
- Snabb återkoppling: mål under 30 sekunder efter start, faktisk tid dokumenteras. Installation, kallstart, full replay och bygge är separata längre kontroller.
- Före fasverifiering: alla säkerhetskontroller ska vara gröna, baslinjens faktiska resultat ska vara fullständigt redovisade och pilotprofilen granskad.
- En äldre sparningsreproducerare med rätt förväntan får redovisas som `FAIL/KNOWN-ISSUE` med namngiven ägare och villkor före beständig aktivering. Den får inte räknas som passerad verksamhetsfunktion eller döljas av en lyckad säkerhetsgrind.

## Per-Task Verification Map

Slutlig karta från planeringen 2026-09-11 (plan 01-01–01-09). Kommandon i `web/` förutsätter `export PATH="/opt/homebrew/opt/node@25/bin:$PATH"`; kommandon i `work/pilot/` körs från projektroten. Status fylls i av plan 01-09 efter körning.

| Plan | Task | Område | Requirement | Threat Ref / Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|--------|-------------|-----------------------------|-----------|-------------------|-------------|--------|
| 01-01 | 1 | Git-baslinje med tagg, ignoreregler, hemlighetsskanning | BASE-01 | V13: inga nycklar/miljöfiler i Git | git/grep | `git rev-parse --verify fas1-baslinje^{commit}`; `git ls-tree -r --name-only fas1-baslinje \| grep -E '\.env\.local\|node_modules'` (tom) | Nej — skapas i 01-01 | pending |
| 01-01 | 2 | Källbaslinje återställs utan arbetskopians hemligheter | BASE-01 | V13: arkiv från granskad revision, tom Supabase-miljö | restore/smoke | `node work/pilot/verify-baseline.mjs` → `work/pilot/results/baseline-restore.json` status PASS | Nej — 01-01 | pending |
| 01-02 | 1–2 | Daterad anslutningsprofil | PILOT-01 | Bekräftat/syntetiskt/förslag/öppet hålls isär | dokumentgranskning | grep på rubriker/status (`grep -c '\| Öppet \|' docs/pilot/connection-profile.md` ≥ 9) + manuell källspårning | Nej — 01-02 | pending |
| 01-03 | 1 | Lägeskontrakt stängt som standard | BASE-02 | V2/V13: nycklar i miljön öppnar inget | unit | `node --test lib/runtime-mode.test.mjs` | Nej — 01-03 | pending |
| 01-03 | 2 | Verkliga laddare utan anonym inloggning, bootstrap, seed eller delete | BASE-02 | V6/V8: ingen `signInAnonymously`, ingen `bootstrap_demo_profile`, inga skrivningar | unit/transport | `node --test lib/store-isolation.test.mjs`; `grep -rn signInDemo web/lib web/app` (tom) | Nej — 01-03 | pending |
| 01-03 | 3 | Exempelbygge med tom Supabase-miljö och byggmärkning | BASE-02 | V13: `.env.local` kan inte fylla tillbaka värden | build | `npm run build:example` + `grep -rl 'supabase\.co' dist/ \| wc -l` = 0 | Nej — 01-03 | pending |
| 01-04 | 1–2 | Sammanhängande provmaterial: två skolor, 24 elever, konsekventa referenser | BASE-01, BASE-02 | Syntetiska uppgifter; kullkopia rör inte elever | unit (TDD) | `node --test lib/pilot-fixtures.test.mjs` | Nej — 01-04 | pending |
| 01-05 | 1 | Disponibla lokala mål med manifest och målskydd | BASE-01, BASE-02 | Loopback + projekt-ID + manifest före skrivning; `--linked`/fjärr vägras | tooling | `node work/pilot/prepare-local.mjs --target baseline`; `node work/pilot/verify-target.mjs --target baseline` (exit 0; exit 1 med `SUPABASE_ACCESS_TOKEN` satt) | Nej — 01-05 | pending |
| 01-05 | 2 | Karantänmigration installerad utan dataförlust | BASE-02 | V8: revoke tabeller/sekvenser/funktioner/schema, defaultprivilegier, Storage-policyer | migration | `node work/pilot/prepare-local.mjs --target protected` (db reset OK) + `obj_description('public'::regnamespace,'pg_namespace')` = `fas1-karantan…` | Nej — 01-05 | pending |
| 01-05 | 3 | Effektiva rättigheter för PUBLIC/anon/authenticated, gamla profiler, framtida objekt, Storage | BASE-02 | V8/V7: `has_*_privilege` = false; rader bevarade | SQL (pgTAP) | `supabase --workdir <abs work/pilot/targets/protected> test db --local` → `work/pilot/results/sql-isolation.txt` | Nej — 01-05 | pending |
| 01-06 | 1 | Samma nekande via API (REST/RPC/Auth/Storage/GraphQL), tre identiteter, rader oförändrade | BASE-02 | V6/V8/V9: anonym inloggning av; mintad gammal token nekas | API integration | `node work/pilot/verify-isolation.mjs` → `work/pilot/results/isolation.json` PASS | Nej — 01-06 | pending |
| 01-06 | 2 | Positiva lokala baslinjeflöden (utbildning+nivå, kull, klassversion, grundskola) | BASE-01 | Endast baseline-mål; egna fixturer städas | integration | `node work/pilot/verify-baseline-db.mjs` → `work/pilot/results/baseline-db.json` | Nej — 01-06 | pending |
| 01-07 | 1–3 | Blockerad start, provmiljötexter, skolväljare, sann lagringsstatus, pekytor/fokus, gatad telefonstart | BASE-02, BASE-01 | V2: roll-/skolval öppnar ingen åtkomst; ingen falsk "Sparat" | typ/lint/build + SSR-curl | `npx tsc --noEmit && npx oxlint app lib scripts && npm run build:example`; `curl -s http://127.0.0.1:5192/ \| grep -c 'Arbetsytan är inte tillgänglig ännu'` ≥ 1 | Nej — 01-07 | pending |
| 01-08 | 2 | Fyra uppskattade flöden + GR-planflöde, skolbyte bevarar, omläsning börjar om, 44 px, 320 px, tangentbord | BASE-01 | Bevarade verksamhetsregler i browsern | e2e | `npx playwright test --project=desktop --project=phone` (`web/e2e/phase1-baseline.spec.ts`) | Nej — 01-08 | pending |
| 01-08 | 2 | Byggd exempelvy och blockerad start gör inga Supabase/Auth/RPC-anrop, ingen `sb-`-session | BASE-02 | V7/V13: miljörest och syntetiska molnvärden ignoreras | built e2e | `npx playwright test --project=blocked --project=built` (`web/e2e/phase1-isolation.spec.ts`) | Nej — 01-08 | pending |
| 01-08 | 3 | Konkurrerande sparningar: senaste avsikt ska nå lagret | BASE-01 | Tampering/dataförlust; ägare fas 5 | async regression (transport) | `node --test lib/save-order.repro.mjs` — förväntat röd; rapporteras `KNOWN-ISSUE`, aldrig PASS | Nej — 01-08 | pending |
| 01-08 | 3 | Sammanställare som bevarar delresultat och aldrig gör saknade säkerhetsprov gröna | BASE-01, BASE-02 | Phase gate: BLOCKED ≠ PASS | aggregator | `npm run verify:phase1` → `work/pilot/results/phase1-summary.json` (exit 0 PASS / 3 BLOCKED / 1 FAIL) | Nej — 01-08 | pending |
| 01-09 | 1–2 | Baslinjerapport med historik åtskild och kända fel med ägare; valideringskarta uppdaterad | BASE-01 | Kända fel döljs inte | dokumentgranskning | grep på rubriker i `docs/pilot/baseline.md`; `Konkurrerande sparningar`-raden innehåller inte `\| PASS \|` | Nej — 01-09 | pending |
| 01-09 | 3 | Fysisk telefon, läslighet/tangentbord, dokumentgranskning | BASE-01, BASE-02, PILOT-01 | Enhetsemulering bevisar inte LAN | checkpoint:human-verify | Manuell; resultat antecknas i tabellen nedan | — | pending |

**Ändring mot den preliminära kartan:** sparordningsreproduceraren körs som Node-transportprov (`web/lib/save-order.repro.mjs`) mot de riktiga lagerfunktionerna `persistTimplans`/`loadTimplans` med kontrollerad fördröjning, i stället för ett Playwright-spec. Skälet är determinism och att fas 1 inte skapar någon Supabase-klient i appen (ingen ansluten browservy att reproducera i). React-sidans ovillkorliga omläsning (`runTimplan`) dokumenteras som kvarstående risk i baslinjerapporten med samma ägare (fas 5).

## Wave 0 Requirements

”Wave 0” anger saknad provinfrastruktur, inte en extra leveransfas. Varje punkt får en uttrycklig ägaruppgift och måste finnas före sitt första beroende.

- [ ] Granskad appkällbaslinje, runtimeval, återställningsverktyg och bevisformat.
- [ ] Läges-/transportprov av verkliga loaders och sammanhängande fixturtester.
- [ ] Lokal målpreflight, manifest, migrationsreplay, syntetisk etablering och avgränsad städning.
- [ ] SQL/API-kontroller av installerade rättigheter, gamla anonymprofiler, RPC, defaultprivilegier och privat Storage.
- [ ] Playwright, versionsmatchade Chromium/WebKit, deterministisk server utan återanvändning, byggt exempelprov och felreproducerare.
- [ ] Sammanställare som behåller delresultat och aldrig gör saknade/felande säkerhetsprov gröna.

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions | Resultat |
|----------|-------------|------------|-------------------|----------|
| Pilotprofilens sakliga status | PILOT-01 | Källansvar och ännu ej fattade kundbeslut kräver innehållsgranskning | Läs mot D-01–D-10. Datum, organisation, elev-/placeringsfält, originalkälla, skrivansvar, faktisk volym och öppna part-/leverantörsval ska framgå. 24 föreslagna exempel får inte bli verklig pilotvolym. | väntar på checkpoint (01-09 task 3) |
| Användning på faktisk telefon | BASE-01, BASE-02 | Enhetsemulering bevisar inte LAN-tillgänglighet på användarens telefon | Öppna den verifierade exempelbyggnaden via dokumenterad lokal adress. Välj båda skolorna, prova berörda flöden, läs minnesstatus, ladda om. Om fysisk enhet saknas anges ej utfört, inte PASS. | väntar på checkpoint (01-09 task 3) |
| Läslighet och tangentbord | BASE-01, BASE-02 | Skärmbilder och automatkontroller räcker inte ensamma | Följ UI-SPEC: 1440/390/320 CSS px, 200 % text, fokus, hjälpdialog, avgränsad tabellrullning och minst 44 px pekytor på ändrade kontroller. Dokumentera observation och revision. | väntar på checkpoint (01-09 task 3) |

## Validation Sign-Off

- [ ] Alla uppgifter har `<automated>`-kontroll eller uttrycklig manuell dokumentkontroll.
- [ ] Inga tre koduppgifter i följd utan automatiserad återkoppling.
- [ ] Alla saknade provreferenser får ägaruppgift före första användning.
- [ ] Slutlig uppgiftskarta, vågor och hotreferenser överensstämmer med PLAN-filerna.
- [ ] Inga watch-lägen; snabb återkoppling har ett mätbart tidsmål.
- [ ] `nyquist_compliant: true` sätts först efter godkänd granskning av plankontraktet. `wave_0_complete` förblir false tills infrastrukturen faktiskt byggts och prövats.

**Approval:** pending — plankartan ovan är slutlig från plan-phase 2026-09-11; granskarens resultat och `nyquist_compliant` fylls i före exekvering.
