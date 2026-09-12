---
phase: 01-baslinje-och-avskild-pilotmilj
verified: 2026-09-12T16:32:26Z
status: passed
score: 3/3 framgångskriterier verifierade (36/36 artefakter, 26/26 nyckellänkar)
requirements:
  - id: BASE-01
    status: satisfied
  - id: BASE-02
    status: satisfied
  - id: PILOT-01
    status: satisfied
human_verification_completed:
  - test: "Checkpoint 01-09 task 3 — dator 1440 px, fysisk telefon över LAN, blockerad start, dokumentgranskning"
    result: "Godkänt av användaren 2026-09-12 utan avvikelser (01-VALIDATION.md § Manual-Only Verifications)"
warnings:
  - "Hårdkodade texter Testskolan/Alex Lind i sidomeny (web/app/page.tsx:175,219) och Elever-vyns kontextrad (web/app/admin-workspace.tsx:318) — uppskjutet UI-fynd med ägare, blockerar inte fasmålet"
  - "Sparordning i persistTimplans — KNOWN-ISSUE med ägare fas 5, aldrig räknad som PASS"
---

# Fas 1: Baslinje och avskild pilotmiljö — verifieringsrapport

**Fasmål:** Projektansvarig kan bedöma och återställa den befintliga appen, medan pilotens provdata och öppna kundbeslut hålls tydligt avgränsade.
**Verifierad:** 2026-09-12T16:32:26Z (HEAD 30878c5; baslinjetagg `fas1-baslinje` = 917313b)
**Status:** passed
**Omverifiering:** Nej — första verifiering

Verifieringen utgår från ROADMAP:s tre framgångskriterier och must_haves i alla tio planer. Inget påstående i SUMMARY-filerna har tagits för givet; varje rad nedan bygger på kod, resultatfiler, git-tillstånd eller egna körningar. Inga appkodsändringar gjordes. Snabbkörningen `verify:phase1 --skip-browser` skrevs till scratchpad; delskripten skrev om `isolation.json` och `baseline-db.json` (PASS på HEAD 30878c5), som återställdes till committat tillstånd med `git checkout`.

## Måluppfyllelse

### Observerbara sanningar (framgångskriterier)

| # | Sanning | Status | Belägg |
|---|---------|--------|--------|
| 1 | Projektansvarig kan återgå till en versionshanterad baslinje och läsa aktuella regressionsresultat för gymnasieutbildning, kurs-/nivåtillägg, kullkopiering och klass–timplanskoppling; tidigare tester identifierade som historik (BASE-01) | VERIFIERAD | Annoterad tagg `fas1-baslinje` → 917313b; `git ls-tree` innehåller sex migrationer, inga `.env.local`/`node_modules`/`dist`/`supabase/.temp`; `git grep` efter JWT-/servicenycklar tom. `baseline-restore.json` PASS (85/0, tsc 0, build 0). `docs/pilot/baseline.md` har resultatmatris med raderna 1a–4c (modell/databas/browser per flöde, revision 7d289d5, kommando och belägg), avsnittet "Historik (inte aktuella bevis)" som skiljer ut 2026-09-07/08 och kodkartans 85 tester, samt "Kända fel och ägarskap". `baseline-db.json` 4/4 flöden PASS; Playwright 12+3 prov PASS i den committade fulla körningen. |
| 2 | Pilotansvarig kan använda en avskild testmiljö där demoinloggning, installerad demoetablering och automatisk exempeldata inte ger åtkomst till skyddade driftvägar (BASE-02) | VERIFIERAD | `runtime-mode.ts`: allt utom uttryckligt `example` → `blocked`; URL/nyckel öppnar inget. `supabase.ts`: ingen klient skapas, `hasBackend = false`, `signInDemo` borttagen (`grep signInDemo web/lib web/app` tom; `signInAnonymously`/`bootstrap_demo_profile` förekommer bara i `database.types.ts`). `seedExample*` finns kvar som exporter men har inga anropare i `web/`. Karantänmigration revoke:ar tabeller/sekvenser/funktioner/schema + defaultprivilegier + Storage-policyer, 0 destruktiva satser. pgTAP 52/52 mot installerade rättigheter (`sql-isolation.txt`). API-prov: 58 nekade, 0 tillåtna, rader oförändrade (`isolation.json`, reproducerat på HEAD). Målskydd: `SUPABASE_ACCESS_TOKEN`, `--linked`, okänt mål → exit 1 (körd nu). `page.tsx:249` blockerad start; e2e `phase1-isolation.spec.ts` 3 prov utan Supabase/Auth/RPC-anrop. |
| 3 | Pilotansvarig kan granska en daterad anslutningsprofil med organisation, elevfält, originalkälla, skrivansvar och volym; ej valda kund- och leverantörsuppgifter framgår som öppna beroenden (PILOT-01) | VERIFIERAD | `docs/pilot/connection-profile.md` (94 rader): **Datum 2026-09-11**; 15 profilrader med status Bekräftat (2) / Syntetiskt exempel (2) / Förslag (9) / Öppet (13); rader för Organisation, Elev- och placeringsfält, Originalkälla, Skrivansvar, Verklig pilotvolym ("Ej fastställd; 24 är ett provförslag"). § Öppna beroenden OB-01–OB-08 med beslutsägare, blockerad fas och stängningsvillkor (pilotpartner, IdP, kontokälla, registerleverantör, drift/avtal, acceptansprov). Hänvisar D-01–D-10 och IAM-02/INT-07/OPS-01. Avsnittet "Vad profilen inte påstår" täcker D-06/D-09. |

**Poäng:** 3/3 sanningar verifierade

### Must-haves per plan (sanningar i PLAN-frontmatter)

| Plan | Sanningar | Status | Belägg |
|------|-----------|--------|--------|
| 01-01 | Tagg utan hemligheter; ett kommando återställer/testar/bygger; inga förbjudna filer | 3/3 | `git rev-parse fas1-baslinje^{commit}`; `verify-baseline.mjs` (258 rader, `git archive` + `node --test`); `baseline-restore.json` `forbiddenPresent: []` |
| 01-02 | Daterad profil med fyra statusar; obestämda värden synliga; öppna beroenden med ägare | 3/3 | Se sanning 3 |
| 01-03 | Stängt utan `NEXT_PUBLIC_APP_MODE=example`; laddare utan inloggning/bootstrap/seed/delete; exempelbygge med tomma Supabase-värden | 3/3 | `runtime-mode.test.mjs` 7 prov; `store-isolation.test.mjs` 4 prov (inspelad transport); `run-mode.mjs` innehåller `NEXT_PUBLIC_SUPABASE_URL: ''` och `build-mode.json`; `.env.example` finns |
| 01-04 | Sammanhängande syntetisk skolvärld GR+GY; konsekventa referenser; kullkopia rör inte elever | 3/3 | `pilot-fixtures.ts` 379 rader: Exempelstads kommun, enheter 99999902/99999903, klasser 4A/7B/SA26A/EK26A; `pilot-fixtures.test.mjs` 12 prov med `copyCohort` |
| 01-05 | Två separata lokala mål; inget skript skriver utan manifest/loopback/prefix; PUBLIC/anon/authenticated nekas allt; rader bevaras | 4/4 | `prepare-local.mjs` 370 rader (`db reset`, `fas1-baslinje`); `verify-target.mjs` exit 1 i tre negativa fall; pgTAP 52/52 inkl. gammal HM-profil bevarad |
| 01-06 | API-nekande för tre identiteter med rader oförändrade; anonym inloggning av; positiva databasflöden i baseline-målet | 3/3 | `isolation.json` unchanged=true, `profiles_md5` lika före/efter; `baseline-db.json` flöden utbildning+nivå / kullkopia HT 2027 / klassversion / grundskola PASS |
| 01-07 | Blockerad start; Provmiljö-märkning; skolväljare med bevarade ändringar; Elever-vy per skola; sann lagringsstatus; gatad telefonstart | 6/6 | `page.tsx:249,255,372,212`; `organisation-workspace.tsx:624–650` (`Exempelskola`, `schoolLabel`, "Ändringar gäller tills sidan laddas om"); `admin-workspace.tsx:203 unitPupils`; `globals.css` `.og-unit-switch` min-height 44 px + `appearance:none`; `phone-preview.mjs:16` exit 2 utan `mode: example` |
| 01-08 | Fem flöden i browser dator+telefon; Elever-vy följer skola; byggd vy/blockerad start utan Supabase-anrop | 3/3 | `playwright.config.ts` `reuseExistingServer: false`, projekt via `dev:example:test`; 12 + 3 tester; steget `browser` PASS i committad körning |
| 01-09 | Daterad baslinjerapport per flöde; historik åtskild; kända fel som KNOWN-ISSUE med ägare; användaren har provat på dator och fysisk telefon | 4/4 | `baseline.md` 99 rader, 26 hänvisningar till `work/pilot/results/`; `! grep 'Konkurrerande sparningar.*PASS'` OK; README med `npm run dev:example`/`phone`/`verify:phase1`; VALIDATION `wave_0_complete: true`; checkpoint godkänd 2026-09-12 |
| 01-10 | Sparordningsfel reproducerat som KNOWN-ISSUE, aldrig PASS; sammanställare bevarar delresultat och gör aldrig saknad säkerhetskontroll grön | 2/2 | `save-order.repro.mjs` 290 rader mot riktiga `persistTimplans`; `verify-phase1.mjs:225–244`: grön reproducerare → fortfarande KNOWN-ISSUE "grön — utred"; saknat mål → BLOCKED exit 3; `phase1-summary.json` PASS med 11 PASS / 1 KNOWN-ISSUE / 1 SKIPPED |

### Artefakter

`gsd-tools verify artifacts` för alla tio planer: **36/36 godkända** (finns, uppfyller `min_lines`/`contains`/`exports`). Nivå 3 (kopplade) kontrollerad manuellt för kodartefakter:

| Artefakt | Förväntat | Status | Detalj |
|----------|-----------|--------|--------|
| `work/pilot/verify-baseline.mjs` | Återställningsprov från taggen | VERIFIERAD | 258 rader; anropas av `verify-phase1.mjs` (`--with-restore`) och README |
| `work/pilot/results/baseline-restore.json` | Daterat resultat | VERIFIERAD | sha 917313b, node v25.9.0, 85/0, status PASS |
| `docs/pilot/connection-profile.md` | Daterad profil | VERIFIERAD | Se sanning 3 |
| `web/lib/runtime-mode.ts` | Lägeskontrakt | VERIFIERAD | Importerad av `supabase.ts` och `page.tsx` |
| `web/lib/supabase.ts` | Klientgräns utan klient | VERIFIERAD | `installClientForTests` används av `store-isolation.test.mjs` och `save-order.repro.mjs`; `supabase()` läses i `organisation-workspace.tsx:175` |
| `web/lib/store-isolation.test.mjs` | Transportprov | VERIFIERAD | 94 rader, 4 prov mot `loadOrganisation`/`loadTimplans`/`loadSchoolYears` |
| `web/scripts/run-mode.mjs` | Deterministisk dev/build | VERIFIERAD | Refereras av `package.json`-skript och Playwright webServer |
| `web/lib/pilot-fixtures.ts` | Syntetisk skolvärld | VERIFIERAD | Importerad i `page.tsx`, `organisation-workspace.tsx`, e2e |
| `work/pilot/prepare-local.mjs`, `verify-target.mjs` | Lokala mål + målskydd | VERIFIERAD | `assertTarget` importeras i `verify-isolation.mjs:28`, `verify-baseline-db.mjs:29` |
| `supabase/migrations/20260911120000_quarantine_demo_access.sql` | Karantän | VERIFIERAD | 52 rader, revoke + defaultprivilegier + Storage; inga delete/truncate/drop table |
| `supabase/tests/phase1_isolation.test.sql` | pgTAP | VERIFIERAD | `plan(52)`, 30 `has_*_privilege`-anrop, Storage och bevarad HM-profil |
| `work/pilot/verify-isolation.mjs`, `verify-baseline-db.mjs` | API-prov / positiva flöden | VERIFIERAD | 324 / 273 rader; körda nu med PASS |
| `web/app/page.tsx`, `organisation-workspace.tsx`, `admin-workspace.tsx`, `globals.css`, `scripts/phone-preview.mjs` | UI-grind, väljare, filtrering, pekytor, gatad telefon | VERIFIERAD | Se plan 01-07 ovan |
| `web/playwright.config.ts`, `e2e/phase1-baseline.spec.ts`, `e2e/phase1-isolation.spec.ts` | Browserprov | VERIFIERAD | 12 + 3 tester, 333 / 105 rader |
| `docs/pilot/baseline.md`, `docs/pilot/README.md`, `01-VALIDATION.md` | Rapport, startanvisning, karta | VERIFIERAD | Se plan 01-09 ovan |
| `web/lib/save-order.repro.mjs`, `web/scripts/verify-phase1.mjs`, `work/pilot/results/phase1-summary.json` | Reproducerare, sammanställare, resultat | VERIFIERAD | Se plan 01-10 ovan |

### Nyckellänkar

`gsd-tools verify key-links`: 21/26 automatiskt bekräftade. De fem som föll bort gjorde det på verktygets regex-escape (`\\(` och `\\'`), inte i koden — alla fem bekräftade manuellt med grep:

| Från | Till | Via | Status | Detalj |
|------|------|-----|--------|--------|
| `pilot-fixtures.ts` | `timplan-model.ts` | `createTimplanState(organisation)` | KOPPLAD | rad 283 |
| `verify-isolation.mjs` | `verify-target.mjs` | `assertTarget('protected')` | KOPPLAD | rad 55, före första API-anrop |
| `verify-baseline-db.mjs` | `verify-target.mjs` | `assertTarget('baseline')` | KOPPLAD | rad 43 |
| `page.tsx` | `runtime-mode.ts` | `runtime.mode !== 'example'` → `BlockedStart` | KOPPLAD | rad 10 import, rad 249 |
| `organisation-workspace.tsx` | `admin-model.ts` | `deriveClasses({ pupils: pupils.filter(... unitId ...) })` | KOPPLAD | rad 249 |
| Övriga 21 länkar (01-01, 01-02, 01-03, 01-05, 01-06 psql, 01-07 fixture/onUnitChange, 01-08, 01-09, 01-10) | | | KOPPLAD | Verktygsutfall "Pattern found in source" |

### Dataflöde (nivå 4)

| Artefakt | Datavariabel | Källa | Verklig data | Status |
|----------|--------------|-------|--------------|--------|
| `page.tsx` (`ExampleHome`) | `fixture`, `activeUnitId` | `useState(createPilotFixture)`; `PILOT_UNIT_GR` | Ja — 2 skolor, 4 klasser, 24 elever ur `pilot-fixtures.ts` | FLÖDAR |
| `admin-workspace.tsx` | `unitPupils` | `state.pupils.filter(p => p.unitId === unitId)` med `unitId`-prop från `ExampleHome` | Ja — filtrerad på vald skola; ingen hårdkodad `99999901`-fallback | FLÖDAR |
| `organisation-workspace.tsx` | skolväljare, lagringsstatus | `organisation.units` + `schoolLabel`; `supabase() !== null` → alltid minnesläge i fas 1 | Ja; statusen "Ändringar gäller tills sidan laddas om" är den sanna | FLÖDAR |
| `docs/pilot/baseline.md` | resultatmatris | `work/pilot/results/*.json`, `phase1-summary.json` | Ja — revision, tid och utfall stämmer med filerna | FLÖDAR |

### Beteendekontroller

| Beteende | Kommando | Resultat | Status |
|----------|----------|----------|--------|
| Modellsviten grön under Node 25 | `node --test lib/*.test.mjs` | 108 pass / 0 fail (11 filer, 0,99 s) | PASS |
| Fasgrind utan browser | `npm run verify:phase1 -- --skip-browser --out <scratchpad>` | PASS-PARTIAL på HEAD 30878c5: modeller/tsc/lint/mål-protected/sql-karantän/api-isolering/mål-baseline/baslinje-db PASS; exempelbygge+browser SKIPPED (flaggan); sparordning KNOWN-ISSUE; 9,3 s | PASS |
| Målskydd nekar molnkonfiguration | `SUPABASE_ACCESS_TOKEN=dummy node work/pilot/verify-target.mjs --target baseline` | REFUSED, exit 1 | PASS |
| Målskydd nekar okänt mål och `--linked` | `--target cloud`; `--target baseline --linked` | REFUSED, exit 1 båda | PASS |
| Baslinjetagg återställbar och ren | `git rev-parse --verify fas1-baslinje^{commit}`; `git ls-tree -r fas1-baslinje \| grep -E '\.env\.local\|node_modules'` | 917313b; 0 träffar | PASS |
| Kända fel aldrig PASS i rapporten | `! grep -qE 'Konkurrerande sparningar.*\| *PASS *\|' docs/pilot/baseline.md` | OK | PASS |
| Fullt Playwright-steg | — | Inte omkört (42 s, startar servrar); committad körning 2026-09-11T22:08Z PASS 12+3 och användarens checkpoint på revision 564d067 | Ej omkört, belagt |

### Kravtäckning

| Krav | Planer | Beskrivning (REQUIREMENTS.md) | Status | Belägg |
|------|--------|-------------------------------|--------|--------|
| BASE-01 | 01-01, 01-04, 01-06, 01-07, 01-08, 01-09, 01-10 | Återgå till versionshanterad baslinje och se vilka uppskattade arbetsflöden som passerar dokumenterade regressionsprov | UPPFYLLT | Sanning 1; tagg + återställningsprov + resultatmatris med modell/databas/browser-belägg per flöde; historik åtskild; kända fel med ägare |
| BASE-02 | 01-03, 01-04, 01-05, 01-06, 01-07, 01-08, 01-10 | Avskild miljö där anonym demoetablering och automatisk exempeldata inte ger åtkomst till skyddade driftvägar | UPPFYLLT | Sanning 2; kod (läge, klientgräns, laddare), databas (karantän, pgTAP), API (58 nekade), browser (inga anrop), målskydd |
| PILOT-01 | 01-02, 01-09 | Daterad anslutningsprofil med organisation, elevuppgifter, originalkälla, skrivansvar, pilotvolym, öppna beroenden | UPPFYLLT | Sanning 3; profil daterad 2026-09-11 med OB-01–OB-08 |

REQUIREMENTS.md mappar exakt BASE-01, BASE-02 och PILOT-01 till fas 1; alla tre är deklarerade i planernas `requirements`. **Inga föräldralösa krav.** Kravstatus står som "Genomförd — väntar verifiering" och ändras inte av denna rapport.

### Antimönster

| Fil | Rad | Mönster | Allvar | Påverkan |
|-----|-----|---------|--------|----------|
| `web/app/page.tsx` | 175, 219 | Hårdkodade `Testskolan` / `Alex Lind` i sidomenyn oberoende av fixturen (Exempelstads kommun) | Varning | Kosmetisk inkonsekvens i syntetisk märkning. Påstår ingen verklig kund och rör ingen skyddsgräns. Ägs i `deferred-items.md` och `baseline.md` § Kända fel (UPPSKJUTET UI-FYND, nästa UI-plan). Blockerar inte fasmålet. |
| `web/app/admin-workspace.tsx` | 318 | Kontextrad `Testskolan` oavsett vald skola | Varning | Samma bedömning; elevlistan själv följer vald skola (`unitPupils`), vilket är det som prövas. |
| `web/lib/planning-store.ts` | 106, 257 | `persistTimplans` upsert utan versionsvillkor / lokalt id (sparordning) | Info | Reproducerat rött i `save-order.repro.mjs`, redovisas KNOWN-ISSUE med ägare fas 5, aldrig PASS; beständig redigering öppnas inte i skyddat läge före rättning. Korrekt hanterad som bedömningsfynd, inte dold. |
| `web/lib/organisation-store.ts`, `planning-store.ts` | 114, 106, 257 | `seedExample*` finns kvar som exporter | Info | Inga anropare i `web/`; laddningsvägarna anropar dem inte (bekräftat av `store-isolation.test.mjs` med inspelad transport). Kan städas i senare fas. |
| Kodfiler från fasen (16 filer) | — | TODO/FIXME/PLACEHOLDER | Inga träffar | — |

### Mänsklig verifiering

Fasens manuella kontroller ingick i plan 01-09 task 3 och är redan utförda: användaren godkände 2026-09-12 stegen 3–14 (dator 1440 px, fysisk telefon via `npm run phone` på revision 564d067, blockerad start, `baseline.md` och `connection-profile.md`) utan avvikelser; kullkopiering bekräftades uttryckligen. Inga ytterligare mänskliga kontroller krävs för att bedöma fasmålet.

### Luckor

Inga. Fasmålet är uppnått: baslinjen är versionshanterad, återställbar och bedömd med aktuella belägg per flöde; provmiljön är avskild i kod, databas, API och browser med målskydd mot molnet; pilotens syntetiska provdata och öppna kundbeslut är tydligt åtskilda i en daterad profil. De två kända fynden (sparordning; hårdkodade Testskolan/Alex Lind) är korrekt bedömda som ägda uppskjutna poster och gör inget känt fel till godkänd funktion.

**Avgränsning som kvarstår (inte luckor i fas 1, dokumenterat i `baseline.md` § Vad som inte är verifierat):** molndemons installerade tillstånd har inte inspekterats eller ändrats; skyddad kontoåtkomst, mandat och verklig kommunanslutning hör till fas 2–3 respektive 7–8.

---

_Verifierad: 2026-09-12T16:32:26Z_
_Verifierare: Claude (gsd-verifier)_
