---
phase: 1
slug: baslinje-och-avskild-pilotmilj
status: executed
nyquist_compliant: true
wave_0_complete: true
created: 2026-09-11
---

# Phase 1 — Validation Strategy

Kontrakt för BASE-01, BASE-02 och PILOT-01. Utgår från `01-RESEARCH.md` och `01-UI-SPEC.md`. Kartan nedan är den slutliga från planeringen; kolumnen Status fylldes i av plan 01-09 (2026-09-12) efter den fulla körningen `npm run verify:phase1` (revision 7d289d5 med CSS-rättningen i arbetsträdet, committad som 564d067; totalstatus PASS) och resultatfilerna under `work/pilot/results/`. Sammanställning med belägg per rad: `docs/pilot/baseline.md`.

## Test Infrastructure

| Property | Value |
|----------|-------|
| Framework | Befintlig `node:test` under Node 25 (`/opt/homebrew/opt/node@25/bin`); Playwright 1.63.0 (exakt låst, plan 01-08) och pgTAP genom lokal Supabase CLI 2.78.1. |
| Config file | `web/playwright.config.ts` och separata lokala mål skapas under fasen. |
| Quick run command | Från `web/`: `export PATH="/opt/homebrew/opt/node@25/bin:$PATH" && node --test lib/*.test.mjs`. |
| Full suite command | `npm run verify:phase1` från `web/` (skriptet skapas i plan 01-10; `--skip-browser` för snabb återkörning utan Playwright, `--with-restore` för fullt återställningsprov). |
| Estimated runtime | Modellsviten 0,9 s (108 prov, 11 filer). Full `verify:phase1` 52,9 s (browsersteget 42 s); snabbkörning `--skip-browser` 7,3 s. Återställningsprovet 27,9 s (fristående). |
| Runtime på denna dator | Lägg `/opt/homebrew/opt/node@25/bin` (v25.9.0, verifierad 2026-09-11) först i PATH; Codex-runtimens Node 24 fungerar också. Standard-PATH:s Node 20 uppfyller inte paketkravet. |
| Databasförutsättning | Docker svarade vid exekveringen (01-05, 01-06, 01-10); båda lokala målen var igång vid den fulla körningen. Utan Docker ger sammanställaren BLOCKED (exit 3), aldrig tyst PASS eller molnfallback — kontrollerat i 01-10 genom att flytta protected-manifestet. |

## Sampling Rate

- Efter varje koduppgift: relevanta snabba modell-/transportprov. Dokumentuppgifter granskas direkt mot källbeslut; inga tester som bara speglar rubriker behövs.
- Efter varje våg: berörda browser-/SQL-prov samt typkontroll, riktad lint och bygge när kod ändrats. Ingen upprepning av oförändrade dyra kontroller utan anledning.
- Snabb återkoppling: mål under 30 sekunder efter start, faktisk tid dokumenteras. Installation, kallstart, full replay och bygge är separata längre kontroller.
- Före fasverifiering: alla säkerhetskontroller ska vara gröna, baslinjens faktiska resultat ska vara fullständigt redovisade och pilotprofilen granskad.
- En äldre sparningsreproducerare med rätt förväntan får redovisas som `FAIL/KNOWN-ISSUE` med namngiven ägare och villkor före beständig aktivering. Den får inte räknas som passerad verksamhetsfunktion eller döljas av en lyckad säkerhetsgrind.

## Per-Task Verification Map

Slutlig karta från planeringen 2026-09-11, reviderad efter plangranskning (plan 01-01–01-10; 01-08 delades i 01-08 e2e och 01-10 reproducerare/sammanställare). Kommandon i `web/` förutsätter `export PATH="/opt/homebrew/opt/node@25/bin:$PATH"`; kommandon i `work/pilot/` körs från projektroten. Status ifylld av plan 01-09 efter körning: `PASS` = grönt i `phase1-summary.json`/resultatfil, `KNOWN-ISSUE` = röd reproducerare med ägare, `BLOCKED` = kunde inte köras eller väntar på manuellt steg. Inget automatiserat steg var BLOCKED; checkpointen 01-09 task 3 godkändes av användaren 2026-09-12.

| Plan | Task | Område | Requirement | Threat Ref / Secure Behavior | Test Type | Automated Command | File Exists | Status |
|------|------|--------|-------------|-----------------------------|-----------|-------------------|-------------|--------|
| 01-01 | 1 | Git-baslinje med tagg, ignoreregler, hemlighetsskanning | BASE-01 | V13: inga nycklar/miljöfiler i Git | git/grep | `git rev-parse --verify fas1-baslinje^{commit}`; `git ls-tree -r --name-only fas1-baslinje \| grep -E '\.env\.local\|node_modules'` (tom) | Ja | PASS — tagg `fas1-baslinje` = 917313b; ls-tree/grep tomma (01-01) |
| 01-01 | 2 | Källbaslinje återställs utan arbetskopians hemligheter | BASE-01 | V13: arkiv från granskad revision, tom Supabase-miljö | restore/smoke | `node work/pilot/verify-baseline.mjs` → `work/pilot/results/baseline-restore.json` status PASS | Ja | PASS — `baseline-restore.json` 85/0, tsc 0, build 0 (2026-09-11T10:16Z) |
| 01-02 | 1–2 | Daterad anslutningsprofil | PILOT-01 | Bekräftat/syntetiskt/förslag/öppet hålls isär | dokumentgranskning | grep på rubriker/status (`grep -c '\| Öppet \|' docs/pilot/connection-profile.md` ≥ 9) + manuell källspårning | Ja | PASS — 15 Öppet, OB-01–OB-08; källspårning: 24 elever = Syntetiskt exempel |
| 01-03 | 1 | Lägeskontrakt stängt som standard | BASE-02 | V2/V13: nycklar i miljön öppnar inget | unit | `node --test lib/runtime-mode.test.mjs` | Ja | PASS — 7 prov (steget `modeller`) |
| 01-03 | 2 | Verkliga laddare utan anonym inloggning, bootstrap, seed eller delete | BASE-02 | V6/V8: ingen `signInAnonymously`, ingen `bootstrap_demo_profile`, inga skrivningar | unit/transport | `node --test lib/store-isolation.test.mjs`; `grep -rn signInDemo web/lib web/app` (tom) | Ja | PASS — 4 prov; `grep signInDemo` tom |
| 01-03 | 3 | Exempelbygge med tom Supabase-miljö och byggmärkning | BASE-02 | V13: `.env.local` kan inte fylla tillbaka värden | build | `npm run build:example` + `grep -rl 'supabase\.co' dist/ \| wc -l` = 0 | Ja | PASS — steget `exempelbygge`, 0 träffar `supabase.co` i dist/ |
| 01-04 | 1–2 | Sammanhängande provmaterial: två skolor, 24 elever, konsekventa referenser | BASE-01, BASE-02 | Syntetiska uppgifter; kullkopia rör inte elever | unit (TDD) | `node --test lib/pilot-fixtures.test.mjs` | Ja | PASS — 12 prov (steget `modeller`) |
| 01-05 | 1 | Disponibla lokala mål med manifest och målskydd | BASE-02 | Loopback + projekt-ID + manifest före skrivning; `--linked`/fjärr vägras | tooling | `node work/pilot/prepare-local.mjs --target baseline`; `node work/pilot/verify-target.mjs --target baseline` (exit 0; exit 1 med `SUPABASE_ACCESS_TOKEN` satt) | Ja | PASS — steget `mål-baseline` (exit 0); token/--linked/okänt mål → exit 1 (01-05) |
| 01-05 | 2 | Karantänmigration installerad utan dataförlust | BASE-02 | V8: revoke tabeller/sekvenser/funktioner/schema, defaultprivilegier, Storage-policyer | migration | `node work/pilot/prepare-local.mjs --target protected` (db reset OK) + `obj_description('public'::regnamespace,'pg_namespace')` = `fas1-karantan…` | Ja | PASS — steget `mål-protected`, 7 migrationer, karantänmarkör (pgTAP A) |
| 01-05 | 3 | Effektiva rättigheter för PUBLIC/anon/authenticated, gamla profiler, framtida objekt, Storage | BASE-02 | V8/V7: `has_*_privilege` = false; rader bevarade | SQL (pgTAP) | `supabase --workdir <abs work/pilot/targets/protected> test db --local` → `work/pilot/results/sql-isolation.txt` | Ja | PASS — `sql-isolation.txt` + steget `sql-karantän`: Tests=52, All tests successful |
| 01-06 | 1 | Samma nekande via API (REST/RPC/Auth/Storage/GraphQL), tre identiteter, rader oförändrade | BASE-02 | V6/V8/V9: anonym inloggning av; mintad gammal token nekas | API integration | `node work/pilot/verify-isolation.mjs` → `work/pilot/results/isolation.json` PASS | Ja | PASS — `isolation.json` 58 nekade, 0 tillåtna, unchanged |
| 01-06 | 2 | Positiva lokala baslinjeflöden (utbildning+nivå, kull, klassversion, grundskola) | BASE-01 | Endast baseline-mål; egna fixturer städas | integration | `node work/pilot/verify-baseline-db.mjs` → `work/pilot/results/baseline-db.json` | Ja | PASS — `baseline-db.json` 4/4 flöden |
| 01-07 | 1–3 | Blockerad start, provmiljötexter, skolväljare med `onUnitChange`, Elever-vy filtrerad på vald skola (`unitId`-prop), sann lagringsstatus, pekytor/fokus, gatad telefonstart | BASE-02, BASE-01 | V2: roll-/skolval öppnar ingen åtkomst; ingen falsk "Sparat" | typ/lint/build + SSR-curl | `npx tsc --noEmit && npx oxlint app lib scripts && npm run build:example`; `curl -s http://127.0.0.1:5192/ \| grep -c 'Arbetsytan är inte tillgänglig ännu'` ≥ 1; `grep -c 'state\\.pupils' app/admin-workspace.tsx` ≤ 12 | Ja | PASS — stegen `typkontroll`/`lint`/`exempelbygge`; blockerad start 1 träff; `state.pupils` = 11 |
| 01-08 | 1 | Playwright 1.63.0 låst, fyra projekt (desktop/phone/blocked/built) med egna servrar, `reuseExistingServer: false` | BASE-01, BASE-02 | V13: ingen främmande server återanvänds | config | `npx playwright --version` (1.63) + `grep -q 'reuseExistingServer: false' playwright.config.ts` | Ja | PASS — Playwright 1.63.0, `reuseExistingServer: false` |
| 01-08 | 2 | Fyra uppskattade flöden + GR-planflöde, Elever-vy följer vald skola (4A/7B vs SA26A/EK26A), skolbyte bevarar, omläsning börjar om, 44 px, 320 px, tangentbord | BASE-01 | Bevarade verksamhetsregler i browsern | e2e (projekt desktop + phone) | `npm run build:example && npx playwright test` (`web/e2e/phase1-baseline.spec.ts`, 12 tester) | Ja | PASS — 12 prov desktop + phone; pekyteprovet rött till 564d067 (`appearance:none`), därefter grönt; fysisk telefon godkänd av användaren 2026-09-12 (01-09 task 3) |
| 01-08 | 2 | Byggd exempelvy och blockerad start gör inga Supabase/Auth/RPC-anrop, ingen `sb-`-session | BASE-02 | V7/V13: miljörest och syntetiska molnvärden ignoreras | built e2e (projekt blocked + built) | samma kommando (`web/e2e/phase1-isolation.spec.ts`, 3 tester) | Ja | PASS — 3/3 (`blocked` + `built`) |
| 01-10 | 1 | Konkurrerande sparningar: senaste avsikt ska nå lagret | BASE-01 | Tampering/dataförlust; ägare fas 5 | async regression (transport) | `node --test lib/save-order.repro.mjs` — förväntat röd; rapporteras `KNOWN-ISSUE`, aldrig PASS | Ja | KNOWN-ISSUE — 2/2 scenarier röda som väntat, ägare fas 5 (aldrig PASS) |
| 01-10 | 2 | Sammanställare som bevarar delresultat, kopierar pgTAP-filer till protected-målet och aldrig gör saknade säkerhetsprov gröna | BASE-01, BASE-02 | Phase gate: BLOCKED ≠ PASS | aggregator | `npm run verify:phase1` → `work/pilot/results/phase1-summary.json` (exit 0 PASS/PASS-PARTIAL / 3 BLOCKED / 1 FAIL); snabb: `node scripts/verify-phase1.mjs --skip-browser --out <sökväg utanför arbetsträdet>` så att den committade fulla körningen inte skrivs över | Ja | PASS — `phase1-summary.json` totalstatus PASS (11 PASS, 1 KNOWN-ISSUE, 1 SKIPPED); BLOCKED-vägen kontrollerad (exit 3) |
| 01-09 | 1–2 | Baslinjerapport med historik åtskild och kända fel med ägare; valideringskarta uppdaterad (REQUIREMENTS rörs inte här) | BASE-01 | Kända fel döljs inte | dokumentgranskning | `! grep -qE 'Konkurrerande sparningar.*\| *PASS *\|' docs/pilot/baseline.md` + grep på rubriker | Ja | PASS — rubriker, 23 matrisrader, Konkurrerande sparningar ≠ PASS; REQUIREMENTS orörd |
| 01-09 | 3 | Fysisk telefon, läslighet/tangentbord, dokumentgranskning; därefter REQUIREMENTS → "Genomförd — väntar verifiering" | BASE-01, BASE-02, PILOT-01 | Enhetsemulering bevisar inte LAN; kravstatus sätts aldrig till Verifierad av planen | checkpoint:human-verify | Manuell; resultat antecknas i tabellen nedan | — | PASS — godkänt 2026-09-12 av användaren (steg 3–14: dator 1440 px, fysisk telefon, blockerad start, dokument); inga avvikelser; REQUIREMENTS → Genomförd — väntar verifiering |

**Ändring mot den preliminära kartan:** sparordningsreproduceraren körs som Node-transportprov (`web/lib/save-order.repro.mjs`) mot de riktiga lagerfunktionerna `persistTimplans`/`loadTimplans` med kontrollerad fördröjning, i stället för ett Playwright-spec. Skälet är determinism och att fas 1 inte skapar någon Supabase-klient i appen (ingen ansluten browservy att reproducera i). React-sidans ovillkorliga omläsning (`runTimplan`) dokumenteras som kvarstående risk i baslinjerapporten med samma ägare (fas 5).

## Wave 0 Requirements

”Wave 0” anger saknad provinfrastruktur, inte en extra leveransfas. Varje punkt får en uttrycklig ägaruppgift och måste finnas före sitt första beroende. Alla sex punkter är byggda och körda (01-01, 01-03/01-04, 01-05, 01-05/01-06, 01-08/01-10, 01-10); därför `wave_0_complete: true`.

- [x] Granskad appkällbaslinje, runtimeval, återställningsverktyg och bevisformat.
- [x] Läges-/transportprov av verkliga loaders och sammanhängande fixturtester.
- [x] Lokal målpreflight, manifest, migrationsreplay, syntetisk etablering och avgränsad städning.
- [x] SQL/API-kontroller av installerade rättigheter, gamla anonymprofiler, RPC, defaultprivilegier och privat Storage.
- [x] Playwright, versionsmatchade Chromium/WebKit, deterministisk server utan återanvändning, byggt exempelprov och felreproducerare.
- [x] Sammanställare som behåller delresultat och aldrig gör saknade/felande säkerhetsprov gröna.

## Manual-Only Verifications

Kolumnen Resultat fylldes i av plan 01-09 task 3 efter användarens svar (`godkänt <datum>` eller `Avvikelse: <steg>`). Ingen rad får PASS utan användarens bekräftelse. Användaren svarade "godkänt" 2026-09-12 för samtliga steg 3–14 i checkpointen (dator 1440 px, fysisk telefon på samma wifi, blockerad start, dokumenten baseline.md och connection-profile.md); steget "Kopiera till ny elevkull" bekräftades dessutom uttryckligen. Inga avvikelser rapporterades.

| Behavior | Requirement | Why Manual | Test Instructions | Resultat |
|----------|-------------|------------|-------------------|----------|
| Pilotprofilens sakliga status | PILOT-01 | Källansvar och ännu ej fattade kundbeslut kräver innehållsgranskning | Läs mot D-01–D-10. Datum, organisation, elev-/placeringsfält, originalkälla, skrivansvar, faktisk volym och öppna part-/leverantörsval ska framgå. 24 föreslagna exempel får inte bli verklig pilotvolym. | godkänt 2026-09-12 (steg 14: inget påstår verklig kommunanslutning, verklig pilotvolym eller "säker pilot") |
| Användning på faktisk telefon | BASE-01, BASE-02 | Enhetsemulering bevisar inte LAN-tillgänglighet på användarens telefon | Öppna den verifierade exempelbyggnaden via dokumenterad lokal adress. Välj båda skolorna, prova berörda flöden, läs minnesstatus, ladda om. Om fysisk enhet saknas anges ej utfört, inte PASS. | godkänt 2026-09-12 (steg 10–12 på fysisk telefon via `npm run phone`, revision 564d067: Provmiljö-märkning utan sidomeny, skolväljare i full bredd utan sidledsrullning, avgränsad tabellrullning, pekytor ≥ 44 px) |
| Läslighet och tangentbord | BASE-01, BASE-02 | Skärmbilder och automatkontroller räcker inte ensamma | Följ UI-SPEC: 1440/390/320 CSS px, 200 % text, fokus, hjälpdialog, avgränsad tabellrullning och minst 44 px pekytor på ändrade kontroller. Dokumentera observation och revision. | godkänt 2026-09-12 (steg 3–9 och 13 på dator 1440 px, revision 564d067: miljötexter, skolbyte bevarar 123, kullkopia HT 2027, klass–timplanskoppling fast vid ny version, Rektor-vyn 12 elever per skola, omläsning börjar om, fokusring/Enter/Escape i hjälpdialogen, 200 % zoom utan klippning, blockerad start visar bara "Arbetsytan är inte tillgänglig ännu") |

## Validation Sign-Off

- [x] Alla uppgifter har `<automated>`-kontroll eller uttrycklig manuell dokumentkontroll.
- [x] Inga tre koduppgifter i följd utan automatiserad återkoppling.
- [x] Alla saknade provreferenser får ägaruppgift före första användning.
- [x] Slutlig uppgiftskarta, vågor och hotreferenser överensstämmer med PLAN-filerna.
- [x] Inga watch-lägen; snabb återkoppling har ett mätbart tidsmål.
- [x] `nyquist_compliant: true` sattes av granskaren före exekvering (fältet rörs inte av 01-09). `wave_0_complete: true` satt 2026-09-12 när infrastrukturen faktiskt byggts och körts.

**Approval:** plankartan är slutlig från plan-phase 2026-09-11; `nyquist_compliant` sattes av granskaren. Körstatus ifylld 2026-09-12 av plan 01-09; checkpointen (task 3) godkändes av användaren 2026-09-12. Fasverifieringen slutfördes 2026-09-12 med status passed i `01-VERIFICATION.md`; BASE-01, BASE-02 och PILOT-01 är markerade Verifierad i REQUIREMENTS.md. Uppgiftsraderna ovan bevarar status vid respektive genomförande.
