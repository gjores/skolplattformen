---
phase: 01-baslinje-och-avskild-pilotmilj
plan: 07
subsystem: web/app provmiljöns vyer och telefonväg
tags: [ui, runtime-mode, pilot-fixtures, accessibility, phone-preview, BASE-01, BASE-02]
requires:
  - 01-03 (runtime.mode, supabase() utan klient, run-mode.mjs med dist/build-mode.json)
  - 01-04 (createPilotFixture, schoolLabel, PILOT_UNIT_GR, deriveClasses(Pick<AdminState,'pupils'>))
provides:
  - "web/app/page.tsx: Home() grindar på runtime.mode; BlockedStart utan sidomeny/rollval; ExampleHome äger fixtur, admin-state och activeUnitId"
  - "web/app/organisation-workspace.tsx: props initial/pupils/onUnitChange; native select Exempelskola; klasser per vald skola; sann lagringsstatus; skilda laddnings-/fel-/tomtillstånd"
  - "web/app/admin-workspace.tsx: prop unitId + unitPupils; ny elev får vald skolas unitId och klass"
  - "web/app/globals.css: block /* Fas 1: provmiljö */ med 44 px pekytor, 16 px text, 3 px fokusring, .blocked-start"
  - "web/scripts/phone-preview.mjs: vägrar bygge utan dist/build-mode.json med mode example (exit 2)"
affects:
  - 01-08 (browserprov mot texterna Provmiljö/Exempelskola/Om provmiljön och blockerad start)
  - 01-09 (checkpoint på dator och telefon; markerar BASE-01/BASE-02)
tech-stack:
  added: []
  patterns:
    - "Startgrind före hooks: Home() returnerar BlockedStart eller ExampleHome så att hooks-ordningen är stabil"
    - "Vald skola ägs av sidan: OrganisationWorkspace rapporterar onUnitChange, AdminWorkspace filtrerar på unitId"
    - "Databasvägen är kvar men stängd: backend = supabase() !== null är alltid false i fas 1"
key-files:
  created: []
  modified:
    - web/app/page.tsx
    - web/app/organisation-workspace.tsx
    - web/app/admin-workspace.tsx
    - web/app/globals.css
    - web/scripts/phone-preview.mjs
decisions:
  - "Laddnings- och sparstatus använder <output> (implicit role=status) i stället för role=\"status\" på div/span, enligt lintregeln jsx-a11y/prefer-tag-over-role och den befintliga .admin-notice-konventionen"
  - "Ny elev: klassen måste finnas vid vald skola (pupilClass faller tillbaka på skolans första klass; basis söks i unitPupils) så att en grundskoleelev aldrig får en gymnasieklass"
  - "Återförsöksknappen Försök igen renderas bara när backend är sant; i minnesläget hjälper inget återförsök"
metrics:
  duration: "~48 min inklusive avbrott och återupptagning"
  completed: "2026-09-11"
  tasks: 3
  files: 5
---

# Phase 01 Plan 07: Provmiljö med blockerad start, skolväljare för två skolformer och sann lagringsstatus Summary

Appen startar bara i det uttryckliga exempelläget och visar då en märkt provmiljö med båda exempelskolorna i en etiketterad native väljare; elev-, klass- och timplansunderlag följer vald skola, lagringstexten säger sanningen om sidans minne, och telefonvägen vägrar starta ett bygge som inte är märkt som exempelläge.

## Vad som byggdes

### Task 1 — page.tsx (`eead387`, tillsammans med task 2)

- `Home()` returnerar `<BlockedStart />` när `runtime.mode !== 'example'`; annars `<ExampleHome />`. Den blockerade grenen är `main#workspace.blocked-start` med `h1` och `p`, utan `SidebarProvider`, rollval, hjälpknapp eller skoldata. Ingen teknisk orsak, adress eller nyckel visas.
- `ExampleHome` skapar `createPilotFixture()` en gång per öppnad sida (`useState`), initierar `admin` från `fixture.admin` och äger `activeUnitId` (start `PILOT_UNIT_GR`). `previewGrundskola`, `createAdminState` och `deriveClasses` är borta ur sidan.
- `<OrganisationWorkspace>` får `initial={{ organisation, plans }}`, `pupils={admin.pupils}`, `onUnitChange={setActiveUnitId}` och `schedule={{ groups, slots }}` — ingen `key`, ingen remount vid skolbyte. `<AdminWorkspace>` får `unitId={activeUnitId}`.

Textändringar (före → efter):

| Plats | Före | Efter |
|-------|------|-------|
| `span.demo-pill` i sidhuvudet | Förhandsversion | Provmiljö |
| Hjälpknappens `aria-label` | Om förhandsversionen | Om provmiljön |
| `.nav-note` i sidomenyn | Demo med exempeldata | Fiktiva skolor och elever. |
| `fieldset.role-switch legend` | Arbeta som | Prova som |
| Hjälpdialogens titel | En första arbetsversion | Om provmiljön |
| Hjälpdialogens text | Alla namn, texter och scheman är syntetiska exempel… | Inledning + tre stycken om lagring, sessionsdata och rollval enligt UI-SPEC |
| Dialogstängning | Jag förstår | Stäng hjälpen |
| modelContext-verktygets beskrivning | …förhandsversionens arbetsområden | …provmiljöns arbetsområden |

Profilens `{roleLabel[role]} · Exempelroll`, `lang="sv"`, `main#workspace` och länken **Till innehållet** är oförändrade.

### Task 2 — organisation-workspace.tsx och admin-workspace.tsx (`eead387`)

**organisation-workspace.tsx**

- Props: `preview`/`onPreview` borttagna; `initial`, `pupils`, `onUnitChange` tillagda; `schedule?: Omit<ScheduleSource,'classes'>`.
- `const backend = supabase() !== null;` (alltid false i fas 1; databaskoden lämnas kvar med kommentaren "Öppnas i fas 2 bakom verifierad kontoåtkomst"). `initialOrganisation()`, `groundExample`, importerna `createOrganisationState`, `createTimplanState`, `hasBackend`, `Database` och `GraduationCap` är borta.
- `org`/`tp` initieras ur `initial`; `offeringId` ur `unitOfferings(initial.organisation, activeUnitId)[0]?.id ?? ''` (inte `'sa25'`).
- `unitClasses = useMemo(() => deriveClasses({ pupils: pupils.filter(p => p.unitId === lasarUnitId) }), …)` ersätter `schedule?.classes` för TimplanClasses (`classNames`) och LasarView (`classes` och `schedule.classes`).
- Skolväljaren: `<label htmlFor="exempelskola">Exempelskola</label>` + `<select id="exempelskola" className="og-unit-switch">` med `schoolLabel(u)` (`Björkhagens grundskola — Grundskola`, `Exempelstads gymnasium — Gymnasium`), renderas alltid; `onChange` väljer skola, sätter skolans första utbildning, nollställer `planId` och anropar `onUnitChange`. Ikonen är `School` med `aria-hidden`.
- Borttagen knapp: **Visa grundskoleexempel** / **Tillbaka till mina skolor**. Borttagen rad `{unit.organizer.type} huvudman`.
- `.context-demo`: `Info`-ikon + **Fiktiva skolor och elever.** + **Ändringar gäller tills sidan laddas om** (backend-grenen: `<output>Sparar…</output>` eller "Ändringar sparas i den anslutna provdatabasen"; körs aldrig i fas 1). Borttagna texter: `Exempelroll utan behörighetskontroll`, `ändringar sparas i databasen`, `Grundskoleexempel · sparas inte i databasen`, `ändringar gäller denna session`.
- Tre skilda tillstånd före arbetsytan: laddning `<output className="admin-empty og-loading" aria-busy="true"><h2>Hämtar provmaterial…</h2>`; läsfel `div.admin-empty[role="alert"]` med `AlertTriangle`, **Provmaterialet kunde inte hämtas. Kontrollera anslutningen och försök igen.** och knappen **Försök igen** (endast när `backend`, kör bara `loadOrganisation` om via `loadAttempt`); tomt `org.units.length === 0` → **Inga exempelskolor att visa** / **Provmaterialet saknas. Kontrollera att provmiljön är förberedd och försök igen.** utan knapp. Borttagna texter: `Läser huvudmannens uppgifter…`, `Kunde inte läsa från databasen`, `Skolenheter, utbildningar och beslut hämtas från databasen.`

**admin-workspace.tsx**

- Prop `unitId: string`; `const unitPupils = useMemo(() => state.pupils.filter((p) => p.unitId === unitId), [state.pupils, unitId])`.
- `unitPupils` används i alla listande/filtrerande/räknande ställen: `attention`, `classNames`, `visible`, fallbacken för `planPupil`, räknarna "Alla elever"/"Inskrivning"/"av … elever", planutkast och ogrupperade kurser i sidoraden, terminsutdraget, gruppmedlemmars klasser och lista samt "Lägg till elever i urvalet". `state.pupils` finns kvar på 11 ställen: id-uppslag, CSV-export av valda id:n, mall för studieplan, id-generering och skrivningen `pupils: [...state.pupils, p]` (andra skolans elever bevaras).
- Ny elev: `unitId,` (vald skola) ersätter `state.pupils[0]?.unitId ?? '99999901'`. Klassen kommer ur `pupilClass` (vald klass om den finns vid skolan, annars skolans första) och `basis` söks i `unitPupils` med felet "Välj en klass vid den valda exempelskolan." om den saknas.
- `classNames` blir `['4A','7B']` för grundskolan och `['SA26A','EK26A']` för gymnasiet (ordning enligt fixturen).

### Task 3 — globals.css och phone-preview.mjs (`0a10c16`)

CSS som tillkom eller ändrades:

- `.og-unit-switch` — `border:0;background:transparent;padding:0 2px` ersatt av `min-height:44px;font-size:1rem;line-height:1.5;padding:0 12px;border:1px solid var(--muted-foreground);border-radius:var(--radius);background:var(--card);color:var(--foreground);max-width:100%`.
- Nytt block `/* Fas 1: provmiljö */` i slutet: `.og-unit-label`, `.context-school{overflow:visible}`, fokusring `outline:3px solid var(--ring);outline-offset:4px` på `.og-unit-switch`, `.role-switch button` och `.top-actions button`; `min-height/min-width:44px` på rollknappar och sidhuvudets knappar; `.admin-context{gap:16px;flex-wrap:wrap;row-gap:8px}`; `.context-demo` som flexrad i `--muted-foreground`; `.blocked-start` (640 px, `--card`/`--border`/`--radius`, h1 1.75rem/500/1.2, p 1rem/1.5); `.admin-empty h2/p/button` (1.25rem rubrik i `--foreground`, 1rem text i `--muted-foreground`, 44 px knapp); `@media(max-width:600px)` med full bredd på väljaren och `.blocked-start{margin:32px 16px}`.
- `.demo-pill` döljs inte under 768 px (regeln minskar bara storleken) — oförändrad. `.tp-grid-scroll`, `.class-plan-form` och övriga verksamhetsytor orörda.

`phone-preview.mjs`: läser `dist/build-mode.json` före spawn; saknad fil eller `mode !== 'example'` ger **Bygget saknar exempelläge. Kör npm run build:example först.** och exit 2; annars loggas `Telefonförhandsvisning: läge example, revision …`. Proxyn (`['GET','HEAD']`, blockerade `/cdn-cgi/` och `/__debug`) är oförändrad.

## Kontrollresultat

| Kontroll | Resultat |
|----------|----------|
| `npx tsc --noEmit` | exit 0 |
| `npx oxlint app lib scripts` | exit 0 (efter rättning av fem fynd, se avvikelser) |
| `node --test lib/*.test.mjs` | 108/108 passerade |
| `npm run build:example` | exit 0; `dist/build-mode.json` med `"mode": "example"` |
| `curl -s http://localhost:3000/` (dev:example) | innehåller `Provmiljö` (1), `Exempelskola` (1), `Fiktiva skolor och elever.` (2: sidomeny + arbetsyta), `Prova som` (1) |
| `curl -s http://127.0.0.1:5192/` (dev:blocked:test) | `Arbetsytan är inte tillgänglig ännu` 1 träff; `<main id="workspace" class="blocked-start">`; 0 träffar för `Exempelskola`, `Prova som`, `Provmiljö`, `SidebarProvider` |
| `rm dist/build-mode.json && node scripts/phone-preview.mjs` | skriver `Bygget saknar exempelläge. Kör npm run build:example först.`, exit 2 |
| `npm run phone` mot exempelbygge | `GET http://127.0.0.1:3002/` → 200 med `Provmiljö` och `Exempelskola` i svaret; `POST` → 404 |
| Planens `<automated>`-kommandon för task 1, 2 och 3 | alla exit 0 |
| `grep -c 'state\.pupils' app/admin-workspace.tsx` | 11 (≤ 12) |

Browserflöden, 320 px, 200 % text, tangentbord och fysisk telefon provas i 01-08 och 01-09 enligt planen; de är inte verifierade här.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Ny elev kunde få en annan skolas klass**
- **Found during:** Task 2
- **Issue:** `newClass` startar som `'SA26A'`. Med grundskolan vald hade formuläret skickat en gymnasieklass och `basis` hämtats ur hela registret, så en elev med `unitId` 99999902 och klass SA26A hade skapats.
- **Fix:** `pupilClass` väljer vald klass bara om den finns bland skolans `classNames`, annars skolans första klass; `basis` söks i `unitPupils` och saknad träff ger ett formulärfel i stället för en krasch (`!` borttaget).
- **Files modified:** `web/app/admin-workspace.tsx`
- **Commit:** `eead387`

**2. [Rule 3 - Blocking] Lintfynd i den nya koden**
- **Found during:** Task 2
- **Issue:** `oxlint` rapporterade oanvända importer (`GraduationCap`, `createTimplanState`), `setLoading(true)` synkront i effekten (react-compiler) och `role="status"` på `div`/`span` (jsx-a11y/prefer-tag-over-role).
- **Fix:** Importerna borttagna; `setLoading(true)` flyttad till `retry`; laddningsrutan och `Sparar…` använder `<output>` (implicit `role=status`), samma konvention som befintliga `.admin-notice`. Acceptanskriteriets literal `role="status"` finns därför inte i filen; semantiken och `aria-busy` finns.
- **Files modified:** `web/app/organisation-workspace.tsx`
- **Commit:** `eead387`

**3. [Rule 2 - Kontrast] Läsbar text i tillståndspanelerna**
- **Found during:** Task 3
- **Issue:** `.admin-empty` ärver `color:#7e8da2` (≈3,4:1 mot vitt), under UI-SPEC:s krav på 4,5:1 för text i ändrade ytor.
- **Fix:** `.admin-empty h2{color:var(--foreground)}` och `.admin-empty p{color:var(--muted-foreground)}` i det nya CSS-blocket.
- **Files modified:** `web/app/globals.css`
- **Commit:** `0a10c16`

### Noterat, inte ändrat

- Sidomenyns hårdkodade **Testskolan** / **Alex Lind** ligger utanför planen; loggat i `deferred-items.md`.
- Genomförandet avbröts efter task 2:s första lintkörning och återupptogs från arbetsträdet utan att något gjordes om; inga commits gick förlorade.

## Known Stubs

Inga. Backend-grenen (`backend === true`) är ett avsiktligt stängt fas 1-kontrakt, inte en platshållare: `supabase()` returnerar aldrig en klient i appen.

## Commits

- `eead387` feat(01-07): provmiljö med blockerad start, skolväljare för två skolformer och sann lagringsstatus
- `0a10c16` feat(01-07): pekytor, fokus och blockerad start i CSS; telefonförhandsvisning kräver exempelbygge

## Self-Check: PASSED

Alla fem ändrade filer och SUMMARY finns; commits eead387 och 0a10c16 finns i historiken.
