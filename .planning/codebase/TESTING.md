# Testing Patterns

**Analysis Date:** 2026-09-11

## Test Framework

**Runner:**
- Node.js inbyggda `node:test`; ESM-tester importerar TypeScript direkt, exempelvis `web/lib/admin-model.test.mjs` → `web/lib/admin-model.ts`.
- Aktuell körning vid kartläggningen: Node **v24.19.0**, `node --test lib/*.test.mjs` från `web/`, **85 passerade, 0 fel, 0 överhoppade, 0 todo**. Testkörarens rapporterade tid är cirka 964 ms.
- `web/package.json` kräver Node `>=22.13.0`; separat testkörarversion, konfigurationsfil och `test`-script saknas. Direktkörningen ovan är verifierad med Node 24 och kräver stöd för projektets `.ts`-importer.
- Jest-, Vitest-, Cypress- och Playwright-konfiguration påträffas inte i projektets källor; sådana testverktyg deklareras inte i `web/package.json`.

**Assertion Library:**
- `node:assert/strict` i alla åtta testfiler i `web/lib/`, exempelvis `web/lib/cohort-model.test.mjs`.
- Vanliga assertions: `assert.equal`, `assert.deepEqual`, `assert.notEqual`, `assert(...)`, `assert.throws`; databasprov använder `assert.rejects` i `work/supabase/verify-cohorts.mjs`.

**Run Commands:**

Kör från `web/`; testmönstret finns i `web/lib/*.test.mjs` och kontrollvägledningen i `AGENTS.md`.

```bash
node --test lib/*.test.mjs                # Hela lokala modellsviten
node --test lib/cohort-model.test.mjs     # En berörd modell
node --watch --test lib/*.test.mjs        # Valfri watch, inget npm-script
node --experimental-test-coverage --test lib/*.test.mjs # Valfri täckning
npx tsc --noEmit                         # Typkontroll
npx oxlint app lib                       # Riktad lint
npm run build                           # Produktionsbygge via Vinext
```

- Endast modellsviten är körd i kartläggningen. Watch, täckning, typkontroll, lint, bygge, browserflöden och databasprov är inte utförda för dokumentändringen. Övriga kontrollkommandon följer `web/package.json` och `AGENTS.md`.
- `npm run lint` kör utan avgränsningen `app lib`; riktad lint omfattar därför inte hela `web/components/ui/`, enligt `web/package.json` och `web/.oxlintrc.json`.

## Test File Organization

**Location:**
- Tester ligger intill modellerna i `web/lib/`. Datalager saknar egna `*-store.test.*`-filer; databasprov ligger i `work/supabase/`.
- Importerna i `web/lib/admin-model.test.mjs`, `web/lib/organisation-model.test.mjs` och `web/lib/syllabus.test.mjs` laddar modeller/katalog utan React, webbläsare eller Supabase.

**Naming:**
- Använd `<modulnamn>.test.mjs`, som `web/lib/cohort-model.test.mjs` och `web/lib/registry-address.test.mjs`.
- Beskriv verksamhetsbeteendet på svenska i `test('...', () => { ... })`; se `web/lib/lasar-model.test.mjs`.

**Structure:**

```text
web/lib/
├── admin-model.ts / admin-model.test.mjs
├── cohort-model.ts / cohort-model.test.mjs
├── lasar-model.ts / lasar-model.test.mjs
├── organisation-model.ts / organisation-model.test.mjs
├── registry-address.ts / registry-address.test.mjs
├── school-model.ts / school-model.test.mjs
├── syllabus.ts / syllabus.test.mjs
└── timplan-model.ts / timplan-model.test.mjs
work/supabase/
├── verify.mjs
├── verify-cohorts.mjs
├── verify-school-import.mjs
└── reset.mjs                  # Raderar demodata; inte ett test
```

## Test Structure

**Suite Organization:**

Fristående toppnivåtester utan `describe`-sviter. Befintligt fall från `web/lib/school-model.test.mjs`:

```javascript
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { closureReasons, initialTasks, weekDates } from './school-model.ts';

test('slutförda uppgifter utan dokumenterad grund räcker inte för avslut', () => {
  const tasks = initialTasks.map((t) => ({ ...t, done: true }));
  assert.equal(closureReasons(tasks, '  ').length, 1);
  assert.deepEqual(
    closureReasons(tasks, 'Uppföljt; fortsatt ansvar dokumenterat.'),
    [],
  );
});
```

**Patterns:**
- Skapa nytt tillstånd i varje test med `createAdminState`, `createOrganisationState`, `createTimplanState` eller `createLasarState`; se motsvarande `web/lib/*-model.test.mjs`.
- Kontrollera både ändringen och bevarade relationer. Gruppbytestestet bevarar klass/program och originalets medlemskap i `web/lib/admin-model.test.mjs`.
- Mutera kopian efter en kopieringsoperation och jämför originalet mot en djup kopia, som i `web/lib/cohort-model.test.mjs`.
- Pröva flera beslutsteg: rektor skickar, huvudman fastställer, föregående version blir ersatt i `web/lib/timplan-model.test.mjs` och `web/lib/lasar-model.test.mjs`.
- Kontrollera stoppande fel och varningar separat. Hjälpare filtrerar `level === 'error'` i `web/lib/timplan-model.test.mjs` och `web/lib/organisation-model.test.mjs`.
- Inga `beforeEach`-/`afterEach`-hooks används i modellsviten. Databasstädning finns separat i `work/supabase/verify-cohorts.mjs` och `work/supabase/verify-school-import.mjs`.

## Mocking

**Framework:** Mockbibliotek eller användning av Nodes mock-API påträffas inte i `web/lib/*.test.mjs`; testmockverktyg deklareras inte i `web/package.json`.

**Patterns:**

Testerna bygger värden och ändrar lokala kopior. Utdrag ur `web/lib/admin-model.test.mjs`:

```javascript
const state = createAdminState();
const s = state.slots.find((s) => s.id === 's2');
assert.equal(
  slotPreview(state, { ...s, day: 0, start: 600, room: 'B301' }).errors.length,
  0,
);
assert(slotPreview(state, { ...s, start: NaN }).errors.length > 0);
```

**What to Mock:**
- Något etablerat mönster för nätverks-, Supabase- eller browsermockar finns inte. `web/app/api/skolenhet/route.ts`, `web/lib/organisation-store.ts`, `web/lib/planning-store.ts` och `web/lib/cohort-store.ts` saknar isolerade transporttester.
- Registerdata skickas som objekt till modellerna i `web/lib/registry-address.test.mjs` och `web/lib/organisation-model.test.mjs`; dessa fall anropar inte Skolverket.

**What NOT to Mock:**
- Använd faktiska modellfunktioner när reglerna prövas: `copyCohort`, `deriveEducations` och `studentGroups` i `web/lib/cohort-model.test.mjs`.
- Använd den lokala katalogögonblicksbilden via `web/lib/syllabus.ts` och `web/lib/syllabus-snapshot.ts`. Katalogtesterna i `web/lib/syllabus.test.mjs` gäller den lokala ögonblicksbilden, inte ett aktuellt externt svar.

## Fixtures and Factories

**Test Data:**

Fabrikerna är samma exempelmodeller som gränssnittet använder. Utdrag ur `web/lib/cohort-model.test.mjs`:

```javascript
const org = createOrganisationState(),
  tp = createTimplanState(org);
const snapshot = structuredClone({ org, tp });
const next = copyCohort(org, tp.plans, 'huvudman', 'sa25', 2027);
const copied = next.plans.find((p) => p.educationId === next.offering.id);
copied.cells[Object.keys(copied.cells)[0]][0] = 999;
next.offering.pointPlans[0].specialization.push('LOCAL');
assert.deepEqual({ org, tp }, snapshot);
```

**Location:**
- Elev-/grupp-/schemadata finns i `createAdminState` i `web/lib/admin-model.ts`; andra fabriker finns i `web/lib/organisation-model.ts`, `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts`.
- Registerfixturer ligger direkt i `web/lib/registry-address.test.mjs` och `web/lib/organisation-model.test.mjs`; gemensam `fixtures/`-katalog påträffas inte.
- `web/lib/syllabus-snapshot.ts` är katalogunderlaget. `web/lib/syllabus.test.mjs` binder kurskoder, versioner, giltighetsdatum och poäng till dess innehåll.
- `today` är fast i `web/lib/common.ts`; `uid` och `clock` använder slump och aktuell tid. `web/lib/syllabus.test.mjs` skickar explicita `today` och `startedOn`.
- Undvik exakta slump-ID:n/klockslag i assertions, som i `web/lib/cohort-model.test.mjs`. Det fasta beslutsdatumet i `web/lib/timplan-model.test.mjs` gäller exempelkonstanten och inte systemets kalenderdatum.

## Coverage

**Requirements:**
- Ingen procentuell gräns eller täckningskonfiguration finns i `web/package.json`; någon `.github/`-pipeline påträffas inte. `coverage/` ignoreras i `.gitignore` och `web/.gitignore`.
- Ingen täckningsrapport har skapats. Räkning med `^test\(` ger 85 deklarationer i åtta filer; detta är separat från körningen, som också rapporterar 85 passerade tester.

| Testfil | Deklarationer | Kontrollerade områden |
| --- | ---: | --- |
| `web/lib/admin-model.test.mjs` | 17 | Gruppbyte, kapacitet, schemakrockar, utkast, katalogsamband, elevens skolenhet |
| `web/lib/cohort-model.test.mjs` | 5 | Ny kull, oberoende kopior, roll/år/dubbletter, klasskopplingar |
| `web/lib/lasar-model.test.mjs` | 24 | Kalender, terminsramar, dagtyper, gruppavvikelser, beslut, undervisning |
| `web/lib/organisation-model.test.mjs` | 11 | Utbildningar, poängplaner, tillstånd, register, enheter, uppdragsroller |
| `web/lib/registry-address.test.mjs` | 4 | Adressval, skoltyper, lokalt rektorsuppdrag och registeruppdatering |
| `web/lib/school-model.test.mjs` | 4 | Avslut av uppföljning, veckonavigation över datumgränser |
| `web/lib/syllabus.test.mjs` | 6 | Styrdokumentsordning, namn, koder, versioner, giltighet, poäng |
| `web/lib/timplan-model.test.mjs` | 14 | Timramar, poänggrund, undervisningstid, beslut/versioner, bemanning |

**View Coverage:**

Incheckad rapport och paketscript saknas i `web/package.json`. Valfri lokal mätning från `web/`:

```bash
node --experimental-test-coverage --test lib/*.test.mjs
```

**Gränser i testunderlaget:**
- Automatiska komponent-/browserflödestester saknas för `web/app/organisation-workspace.tsx`, `web/app/admin-workspace.tsx`, `web/app/lasar-view.tsx` och `web/app/timplan-classes.tsx`.
- Statuskoder, felaktiga uppströmssvar och avbrutna anrop saknar direkta tester för `web/app/api/skolenhet/route.ts`.
- Optimistisk sparning, återläsning efter fel och konkurrerande svar i `web/app/organisation-workspace.tsx` täcks inte av modellsviten; lagrens felvägar saknar isolerade tester i `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`.
- Roll-/uppdragstester i `web/lib/organisation-model.test.mjs` är klientmodelltester. De prövar inte separata autentiserade identiteter, utgångna uppdrag eller spärrad åtkomst med gammal session i `web/lib/supabase.ts` och `supabase/migrations/`.
- Databasprov har vissa negativa kontroller för annan huvudman/skola men använder demoinloggning. Detta är ingen komplett åtkomstmatris eller godkänd verklig kommunanslutning; se `work/supabase/verify.mjs`, `work/supabase/verify-cohorts.mjs` och `AGENTS.md`.

## Test Types

**Unit Tests:**
- Huvudsviten kör modeller utan databas/nätverk. Vissa fall kopplar faktiska modeller: organisation → timplan → studieplan i `web/lib/admin-model.test.mjs` och organisation → kull → klassgrupp i `web/lib/cohort-model.test.mjs`.
- Tim- och kalenderassertions prövar implementerade regler och befintligt underlag; de är inte oberoende verifiering av aktuella författningar. Se `web/lib/timplan-model.test.mjs`, `web/lib/lasar-model.test.mjs` och deras modeller.

**Integration Tests:**
- `work/supabase/verify.mjs` prövar datalager, constraints, vissa åtkomstgränser, låsta beslut och återläsning. Laddning kan skapa exempeldata; skriptet ändrar befintliga utkast och skapar/raderar kontrollposter.
- `work/supabase/verify-cohorts.mjs` skapar egna skolor/utbildningar, kopierar via RPC och prövar klasskoppling, fel år/kolumn/skola samt historisk planreferens. Egna skolor/klasskopplingar städas i `finally`.
- `work/supabase/verify-school-import.mjs` använder syntetiskt registerunderlag med faktiska databasoperationer: import, rektorsval, ogiltigt uppdrag, adress, dubblett och rektorsbyte. Skola och namngivna uppdrag städas i `finally`.
- Proven använder `signInDemo` direkt eller via laddning. Funktionen anropar `bootstrap_demo_profile` och ger huvudmannakontext i `web/lib/supabase.ts`. Att sätta `role: 'rektor'` i modellen byter inte autentiserad databasanvändare.
- Granska skript och välj isolerad testmiljö före körning enligt `AGENTS.md`. Databasproven har inte körts vid kartläggningen.
- `work/supabase/reset.mjs` raderar tillgängliga demoposter i flera tabeller. Det är ett destruktivt demoverktyg, inte ett ordinarie teststeg.

**E2E Tests:**
- Ingen automatiserad E2E-svit påträffas i projektets testfiler eller `web/package.json`.
- `docs/byggstatus.md`, `docs/elevkullar-och-klasskopplingar.md` och `docs/skolimport-och-rektor.md` innehåller historiska browser-/databasresultat som inte ersätter aktuell verifiering av ändrad kod.
- `npm run phone` i `web/package.json` kör `web/scripts/phone-preview.mjs`, som startar den byggda appen och en nätverksproxy för manuell telefonprovning. Det är inte en automatiserad testsuite.
- UI-ändringar ska prövas på dator och telefon enligt `AGENTS.md`. Ingen ny sådan prövning ingår i kartläggningen.

## Common Patterns

**Async Testing:**

Modellsviten använder synkrona callbacks. Asynkrona assertions finns i databasprovet `work/supabase/verify-cohorts.mjs`:

```javascript
await assert.rejects(() => copyCohortInDatabase(source.id, 2027), /redan/);
await assert.rejects(() => copyCohortInDatabase(source.id, 2026), /efter/);
await assert.rejects(() => saveClassTimplan(b), /fastställd/);
```

- Behåll skriptets egna fixturer och `try`/`finally`-städning i `work/supabase/verify-cohorts.mjs`.
- `work/supabase/verify.mjs` använder `check`, felräknare och exitkod. Städningen ligger i kontrollflödet och är inte genomgående skyddad av `finally`.

**Error Testing:**

Utdrag från `web/lib/cohort-model.test.mjs`:

```javascript
assert.throws(() => copyCohort(org, tp.plans, 'rektor', 'sa25', 2027));
assert.throws(() => copyCohort(org, tp.plans, 'huvudman', 'sa25', NaN));
const next = copyCohort(org, tp.plans, 'huvudman', 'sa25', 2027);
assert.throws(
  () => copyCohort(next.org, next.plans, 'huvudman', 'sa25', 2027),
  /redan/,
);
```

- Kontrollera specifika verksamhetsskäl via del av meddelandet: `/fastställd/`, `/årskurs/` och `/huvudmannen/` i `web/lib/cohort-model.test.mjs` och `web/lib/registry-address.test.mjs`.
- Pröva att fel inte ger delvis genomförd batch eller muterat original, som i `web/lib/admin-model.test.mjs` och `web/lib/cohort-model.test.mjs`.

---

*Testing analysis: 2026-09-11*
