---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 08
subsystem: web/e2e browserprov (Playwright)
tags: [playwright, e2e, browser, isolation, accessibility, BASE-01, BASE-02]
requires:
  - 01-03 (run-mode.mjs: dev:example:test 5191, dev:blocked:test 5192, build:example, preview:example 3011, dist/build-mode.json)
  - 01-04 (pilotfixtur: 99999902 Björkhagens grundskola 4A/7B, 99999903 Exempelstads gymnasium SA26A/EK26A, 24 elever)
  - 01-07 (provmiljöns texter och DOM: Provmiljö, Exempelskola, Prova som, Om provmiljön, blockerad start)
provides:
  - "web/playwright.config.ts: projekten desktop/phone/blocked/built med egna webServer-poster (reuseExistingServer: false), locale sv-SE, JSON-rapport test-results/phase1-e2e.json"
  - "web/e2e/phase1-baseline.spec.ts: 12 browserprov av bevarade flöden, skolbyte, omläsning, tangentbord, pekytor, 320 px och skolföljande Elever-vy"
  - "web/e2e/phase1-isolation.spec.ts: 3 prov av blockerad start och byggd exempelvy utan backend-trafik eller sb-session"
  - "npm-script e2e och verify:phase1 (skriptet skapas i 01-10)"
affects:
  - 01-09 (checkpoint på dator och telefon; pekytefyndet på WebKit-select)
  - 01-10 (verify-phase1.mjs kör build:example före npx playwright test)
tech-stack:
  added:
    - "@playwright/test 1.63.0 (exakt), chromium + webkit"
  patterns:
    - "Egen deterministisk server per projekt; aldrig reuseExistingServer"
    - "Vänta in Reacts hydrering (__reactProps på #exempelskola) innan browsern interagerar med den SSR-renderade sidan"
    - "getByRole/getByLabel med exakta svenska texter; .first() bara med kommentar; inga .nth()"
    - "Isolering mäts som: förbjudna sökvägar (59999, /auth/v1/, /rest/v1/, /rpc/) + inga främmande värdar + inga sb-nycklar"
key-files:
  created:
    - web/playwright.config.ts
    - web/e2e/phase1-baseline.spec.ts
    - web/e2e/phase1-isolation.spec.ts
  modified:
    - web/package.json
    - web/package-lock.json
    - web/.gitignore
decisions:
  - "Dev-servrarna startas med VINEXT_NO_DEV_LOCK=1 via webServer.env eftersom Vinext annars bara tillåter en dev-server per projektkatalog"
  - "Substrängen 'supabase' räknas bara som brott på främmande värd: dev-servern levererar källmodulen /lib/supabase.ts från sin egen värd, vilket är modulladdning och inte ett backend-anrop; det byggda paketet får inte hämta något med 'supabase' alls"
  - "Klass–timplansprovet fastställer först SA-timplanens förslag (v1) som huvudman med den befintliga kontrollen, eftersom fixturen inte har någon fastställd gymnasietimplan"
  - "Pekyteprovet lämnas rött i phone: felet är i appens CSS (WebKit-select), inte i provet"
metrics:
  duration: "~20 min"
  completed: "2026-09-11"
  tasks: 2
  files: 6
---

# Phase 01 Plan 08: Browserprov av bevarade flöden, skolbyte, omläsning och isolering Summary

Playwright 1.63.0 kör 27 prov i fyra projekt (Chrome 1440×900, iPhone 13/WebKit, blockerad start, byggt paket) mot egna deterministiska servrar; 25 gröna, 1 avsiktligt överhoppat (pekytor mäts bara på telefon) och 1 rött som avslöjar ett appfel: skolväljaren är 26 px hög i WebKit på telefon.

## Vad som byggdes

### Task 1 — Playwright låst och konfigurerat (`7976cdb`, `a02acaf`)

- `@playwright/test` installerad exakt `1.63.0` (`npx playwright --version` → `Version 1.63.0`); Chromium och WebKit 26.6 (v2359) hämtade.
- `web/playwright.config.ts`: `testDir ./e2e`, timeout 60 s, seriellt, inga omkörningar, reporter `list` + `json` (`test-results/phase1-e2e.json`), `trace: retain-on-failure`, `locale: sv-SE`. Projekt `desktop` (Desktop Chrome, 1440×900, 5191), `phone` (iPhone 13, 5191), `blocked` (grep `/blockerad/`, 5192), `built` (grep `/byggd/`, 3011). Tre `webServer`-poster med `reuseExistingServer: false`: `dev:example:test`, `dev:blocked:test`, `preview:example`. Kommentar om att `preview:example` kräver `npm run build:example` först.
- `web/package.json`: scripts `e2e` och `verify:phase1`. `web/.gitignore`: `/test-results/`, `/playwright-report/`, `/blob-report/` (`git check-ignore -q web/test-results` exit 0).
- `a02acaf`: `webServer.env = { VINEXT_NO_DEV_LOCK: '1' }` för de två dev-servrarna (se avvikelser).

### Task 2 — Spec-filer (`85312c9`)

**`web/e2e/phase1-baseline.spec.ts`** (331 rader, 12 `test(`), körs i `desktop` och `phone`:

| # | Prov | Vad browsern bevisar |
|---|------|----------------------|
| 1 | provmiljön är märkt och förklarad utan att öppna sidomenyn | `Provmiljö`, `Fiktiva skolor och elever.` och `Ändringar gäller tills sidan laddas om` i `main#workspace`; på telefon är sidomenyn stängd (`Utbildningar` dold, `Visa eller dölj navigation` synlig) |
| 2 | båda exempelskolorna kan väljas och skolkontexten följer valet | `select#exempelskola` har exakt alternativen `Björkhagens grundskola — Grundskola`, `Exempelstads gymnasium — Gymnasium`; skolformstext, utbildningslista och tabellsummering (`… utbildningar · <skolnamn>`) följer valet; `Visa Samhällsvetenskap` försvinner med grundskolan |
| 3 | gymnasium: ny utbildning kan skapas med befintlig kontroll | `Lägg till utbildning` → Slag gymnasium, SA25/SASAP, `Provutbildning E2E`, kull `Elever som börjar HT 2027` → `Lägg till` → raden listas som `Planerad` |
| 4 | gymnasium: kurs/nivå kan läggas till i poängplanens utkast | `Poängplaner` → `Foto och rörlig bild` (utkast) → första kryssrutan i programfördjupningen växlas → raden `Summa` ändras |
| 5 | gymnasium: kopia till ny elevkull är ett fristående utkast | `Kopiera till ny elevkull` → 2027 → `Skapa ny elevkull` → rad `Samhällsvetenskap` + `Elever som börjar HT 2027` + `Planerad` + `Utkast v1`; originalraden `HT 2026` är kvar som `Aktiv` |
| 6 | gymnasium: klass kopplas till fastställd timplansversion och flyttas inte av ny version | Huvudman fastställer SA-förslaget (dialog `Fastställ timplanen`, beslutstext) → `Klasser och läsår` → `SA26A`, 2026, `År 1` → `Koppla klass` → `2026/27 · År 1 · Version 1`; som rektor `Ny version` (Version 2) → kopplingen visar fortfarande `Version 1` |
| 7 | grundskola: timplanens stadie-timmar kan ändras och skolbyte bevarar ändringen | Rektor → Timplaner → grundskolans utkast v2 → första `Matematik, Åk …`-cellen = 123 → gymnasiet (inga Matematik-celler) → grundskolan → 123 kvar |
| 8 | omläsning börjar om exemplet | samma ändring → `page.reload()` → cellen ≠ 123; lagringstexten synlig; varken `Sparat i databasen` eller `Sparar…` |
| 9 | hjälpen öppnas och stängs med tangentbord och återför fokus | Tab till `Om provmiljön` → Enter → dialog med rubrik `Om provmiljön`, `Vid omläsning börjar exemplet om.`, knapp `Stäng hjälpen` → Escape → fokus tillbaka på hjälpknappen |
| 10 | pekytor är minst 44 px på telefon (bara `phone`) | `boundingBox()` för skolväljaren, hjälpknappen och de fyra rollknapparna; rapporterar alla för små ytor |
| 11 | 320 px bredd kräver ingen sidledsrullning för miljötext och väljare | `setViewportSize(320×740)` → `scrollWidth ≤ 321` med väljare och miljötext synliga |
| 12 | Elever visar 4A/7B för grundskolan och SA26A/EK26A för gymnasiet | Rektor → Elever: `Alla elever 12`, `12 av 12 elever`, klassfiltrets alternativ exakt `Alla klasser, 4A, 7B`, inga SA26A/EK26A; via Timplaner byts skola → Elever: `Alla klasser, SA26A, EK26A`, inga 4A/7B |

**`web/e2e/phase1-isolation.spec.ts`** (105 rader, 3 `test(`):

- A (`blocked`): `h1` `Arbetsytan är inte tillgänglig ännu`, ingen `Exempelskola`, `Prova som`, `Provmiljö` eller hjälpknapp; efter 2 s: inga request-URL:er till främmande värd, inga med `59999`, `/auth/v1/`, `/rest/v1/`, `/rpc/` eller `supabase.co`; inga `sb-`-nycklar i localStorage.
- B (`built`): välj gymnasiet, öppna Utbildningar, öppna och stäng hjälpen; efter 2 s: alla anrop till `127.0.0.1:3011`, inga förbjudna sökvägar, ingen URL innehåller `supabase`, inga `sb-`-nycklar, `Provmiljö` kvar.
- C (`built`): `dist/build-mode.json` har `mode === 'example'` och en `revision`-sträng.

## Kontrollresultat

Slutkörning `npm run build:example && npx playwright test` (Node 25.9.0), tre körningar i rad med samma utfall:

| Projekt | Prov | Godkända | Överhoppade | Röda | Tid |
|---------|------|----------|-------------|------|-----|
| desktop (Chrome 1440×900) | 12 | 11 | 1 (pekytor, avsiktligt `test.skip`) | 0 | ~18 s |
| phone (iPhone 13/WebKit) | 12 | 11 | 0 | 1 (pekytor) | ~27 s |
| blocked | 1 | 1 | 0 | 0 | 2,8 s |
| built | 2 | 2 | 0 | 0 | 3,4 s |
| **Summa** | **27** | **25** | **1** | **1** | 42 s (inkl. serverstart) |

`test-results/phase1-e2e.json`: `{"expected":25,"skipped":1,"unexpected":1,"flaky":0}`.

| Kontroll | Resultat |
|----------|----------|
| Planens `<automated>` för task 1 | exit 0 |
| Planens `<automated>` för task 2 | alla grep-villkor uppfyllda och bygget exit 0; `npx playwright test` exit 1 på grund av det dokumenterade appfelet nedan |
| `npx tsc --noEmit` (tsconfig inkluderar `e2e/`) | exit 0 |
| `npx oxlint e2e playwright.config.ts` | exit 0 |
| `git check-ignore -q web/test-results` | exit 0 |
| `page.waitForTimeout` | två förekomster à 2000 ms (isoleringsprovens väntan på fördröjda anrop) |
| `.nth(` | inga; `.first()` sex gånger, alla med kommentar |

### Appfel som proven avslöjade (inte rättade)

**Skolväljaren är 26 px hög i WebKit på telefon.** `select#exempelskola` (`.og-unit-switch`) har `min-height:44px;padding:0 12px` i `globals.css`, men WebKit med iPhone 13-emulering bortser från författarens höjd/padding på en `<select>` med native `appearance:auto` (beräknad `min-height: 18px`, `padding: 0`). Uppmätt `358×26`; Chromium ger `44`. Hjälpknappen och de fyra rollknapparna klarar 44 px. Verifierat i sidan att `appearance:none` på elementet ger 44 px. Provet **pekytor är minst 44 px på telefon** lämnas rött i `phone` enligt planens instruktion; rättningen (`appearance:none` + egen pil i `.og-unit-switch`) hör till UI-koden och är loggad i `deferred-items.md`. Bör provas på fysisk telefon i 01-09.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Vinext tillåter bara en dev-server per projektkatalog**
- **Found during:** Task 2 (första körningen)
- **Issue:** Playwright startar `dev:example:test` och `dev:blocked:test` samtidigt; Vinext 1.0.0-beta.9 skriver `.vinext/dev/lock.json` och den andra servern avbröt med `Another vinext dev server is already running`.
- **Fix:** `webServer.env = { VINEXT_NO_DEV_LOCK: '1' }` för de två dev-posterna i `playwright.config.ts` (CLI:n stöder flaggan). Portarna är redan skilda. `run-mode.mjs` rördes inte.
- **Files modified:** `web/playwright.config.ts`
- **Commit:** `a02acaf`

**2. [Rule 1 - Bug i provet] Interaktion före hydrering**
- **Found during:** Task 2
- **Issue:** Sidan är SSR-renderad; i dev-läget dröjer Reacts hydrering några sekunder. `selectOption`/klick före dess ändrade DOM men inte appens tillstånd (skolvalet visade gymnasiet i väljaren medan vyn stod kvar på grundskolan; rollknappen förblev `aria-pressed=false`).
- **Fix:** `awaitHydration(page)` i `beforeEach` (och efter `reload`/`goto`) väntar på att `#exempelskola` har en `__reactProps`-nyckel. Motsvarande väntan i det byggda provet.
- **Files modified:** `web/e2e/phase1-baseline.spec.ts`, `web/e2e/phase1-isolation.spec.ts`
- **Commit:** `85312c9`

**3. [Rule 1 - Bug i provet] `supabase` som förbjuden substräng träffade dev-serverns modulladdning**
- **Found during:** Task 2
- **Issue:** I `blocked` laddar Vite källmodulen `http://127.0.0.1:5192/lib/supabase.ts` från sin egen värd — modulladdning, inte ett backend-anrop.
- **Fix:** Förbjudna sökvägar (`59999`, `/auth/v1/`, `/rest/v1/`, `/rpc/`) gäller alla URL:er; `supabase` gäller på främmande värd; dessutom krävs att inga anrop går till annan värd än provservern. I `built` krävs därutöver att ingen URL innehåller `supabase` alls.
- **Files modified:** `web/e2e/phase1-isolation.spec.ts`
- **Commit:** `85312c9`

### Selektorer anpassade till den faktiska DOM:en (inga UI-ändringar)

- Timplanens utbildningsnamn är programtiteln `Samhällsvetenskapsprogrammet, samhällsvetenskap · Samhällsvetenskap`; katalogknapp och bekräftelsetext matchas med reguljära uttryck.
- Fixturens SA-timplan är ett **förslag** (v1), inte fastställd; provet fastställer den först som huvudman (dialogen `Fastställ timplanen` kräver beslutstext) innan `Klasser och läsår`/`Koppla klass`. `Ny version` kräver rollen Rektor.
- Programvalet i `Lägg till utbildning` nollställer inriktningen till programmets första (`SABEP`); provet väljer `SASAP` uttryckligen.
- `Fiktiva skolor och elever.` finns både i sidomenyn och i arbetsytan; provet avgränsar till `main#workspace`. `Prova som` matchas via rollknapparnas exakta namn (WebKit exponerar inte alltid `fieldset` som `group`).
- Elever-vyn på telefon visar klassen i elevkortet (`E-2001 · 4A`), inte som klasschip; provet läser klassfiltrets alternativ (Base UI-select) och första synliga texten.
- På telefon stänger sidomenyn sig efter roll-/navigeringsval; hjälparna väntar in det innan nästa steg.

### Noterat, inte ändrat

- Elever-vyns kontextrad visar `Testskolan · Grundskola & gymnasium · Syntetiska exempel · ändringar gäller denna session` oavsett vald skola (hårdkodat i `admin-workspace.tsx`, samma familj som 01-07:s Testskolan-fynd). Loggat i `deferred-items.md`; proven asserterar inte på den raden.

## Known Stubs

Inga. `verify:phase1` pekar på `scripts/verify-phase1.mjs` som skapas i plan 01-10, enligt planen.

## Commits

- `7976cdb` chore(01-08): Playwright 1.63.0 med separata projekt och deterministiska servrar
- `a02acaf` fix(01-08): låt exempel- och blockerad-servern starta samtidigt trots Vinexts dev-lås
- `85312c9` test(01-08): browserprov av bevarade flöden, skolbyte, omläsning och isolering

## Self-Check: PASSED

Alla tre skapade filer och SUMMARY finns; commits 7976cdb, a02acaf och 85312c9 finns i historiken.
