# Coding Conventions

**Analysis Date:** 2026-09-11

## Naming Patterns

**Files:**
- Använd bindestreck och gemener: `web/lib/organisation-model.ts`, `web/lib/cohort-model.ts` och `web/lib/registry-address.ts`.
- Lägg regler i `*-model.ts`, Supabase-anrop i `*-store.ts` och modelltester i `*.test.mjs`; se `web/lib/cohort-model.ts`, `web/lib/cohort-store.ts` och `web/lib/cohort-model.test.mjs`.
- Namnge vyer efter ansvar: `web/app/admin-workspace.tsx`, `web/app/timplan-view.tsx` och `web/app/principal-picker.tsx`.
- Följ ramverkets ingångar: `web/app/page.tsx`, `web/app/layout.tsx` och `web/app/api/skolenhet/route.ts`.

**Functions:**
- Använd camelCase och verb: `createOrganisationState`, `applyGroup`, `approvePointPlan`, `copyCohort` och `normalizeClassBinding` i `web/lib/organisation-model.ts`, `web/lib/admin-model.ts` och `web/lib/cohort-model.ts`.
- Separera förhandskontroll och verkställande där konsekvenser behöver granskas: `groupPreview`/`applyGroup` och `slotPreview`/`applySlot` i `web/lib/admin-model.ts`.
- Använd PascalCase för React-komponenter och `use` för hooks: `OrganisationWorkspace`, `Button` och `useIsMobile` i `web/app/organisation-workspace.tsx`, `web/components/ui/button.tsx` och `web/hooks/use-mobile.ts`.

**Variables:**
- Använd camelCase i TypeScript och översätt databasens snake_case i lagret: `startYear`/`start_year`, `decidedOn`/`decided_on`, `educationId`/`offering_id` i `web/lib/planning-store.ts`.
- Behåll verksamhetsvärden som `huvudman`, `rektor`, `administrator`, `larare`, `utkast`, `förslag`, `fastställd` och `återsänd` i `web/lib/organisation-model.ts`, `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts`.
- Översätt databasens värden utan diakriter på ett ställe: `faststalld` ↔ `fastställd` och `forslag` ↔ `förslag` i `web/lib/planning-store.ts`.
- Skriv användartext, fel och testnamn på svenska. Funktions- och typnamn är huvudsakligen engelska, med domänord som `lasar` och `timplan`; se `web/app/lasar-view.tsx` och `web/lib/lasar-model.test.mjs`.

**Types:**
- Använd namngivna `type`-alias och strängunioner: `Pupil`, `PlanItem`, `OrganisationState`, `Role` och `ClassTimplan` i `web/lib/admin-model.ts`, `web/lib/organisation-model.ts` och `web/lib/cohort-model.ts`.
- Återanvänd databasens rad- och enumtyper via `Database['public']['Tables'][T]['Row']`; se `web/lib/database.types.ts` och `web/lib/planning-store.ts`.
- Använd `unknown` vid externa datagränser och smala av fälten. `Raw`, `obj` och `str` i `web/app/api/skolenhet/route.ts` visar mönstret.

## Code Style

**Formatting:**
- Oxfmt 0.61.0 körs via `npm run format` i `web/package.json`; inställningarna finns i `web/.oxfmtrc.json`.
- Konfigurerade val: enkla citattecken, radbredd 80, ingen sortering av `package.json` och undantagna låsfiler i `web/.oxfmtrc.json`.
- Handkodade moduler använder normalt två blanksteg, semikolon och avslutande kommatecken; se `web/lib/cohort-model.ts` och `web/lib/registry-address.test.mjs`.
- Formateringen är inte genomgående: `web/lib/organisation-store.ts` och `web/app/organisation-workspace.tsx` har även täta enradiga avsnitt. Håll formattering avgränsad till berörd kod.
- TypeScript har `strict`, `noEmit`, `isolatedModules` och `allowImportingTsExtensions` i `web/tsconfig.json`. Kör typkontroll från `web/` med `npx tsc --noEmit`.

**Linting:**
- Oxlint 1.76.0 är lintverktyget enligt `web/package.json`. `typeAware` och `typeCheck` är aktiverade i `web/.oxlintrc.json`.
- Korrekthetskategorin ger fel. Konfigurationen laddar bland annat TypeScript-, React-, import-, tillgänglighets- och Next.js-regler i `web/.oxlintrc.json`.
- Följ `prefer-const`, `no-var`, `prefer-rest-params`, `prefer-spread`, `react/rules-of-hooks` och `react/react-compiler`. Explicit `any`, `require`-importer och otillåtna TypeScript-kommentarer är fel enligt `web/.oxlintrc.json`.
- Anonyma default-exporter ger varning. Genererade kataloger, `next-env.d.ts` och `lib/database.types.ts` är undantagna i `web/.oxlintrc.json`.
- Riktad kontroll är `npx oxlint app lib` från `web/` enligt `AGENTS.md`; detta omfattar inte alla mallkomponenter i `web/components/ui/`.
- Inga projektskills påträffas i `.claude/skills/` eller `.agents/skills/`. Projektets uttryckliga vägledning finns i `AGENTS.md`.

## Import Organization

**Order:**
1. Sätt `'use client';` före importerna i interaktiva vyer, som `web/app/organisation-workspace.tsx` och `web/app/admin-workspace.tsx`.
2. Importera React och externa paket före den huvudsakliga gruppen lokala komponenter och modeller; se `web/app/organisation-workspace.tsx` och `web/components/ui/button.tsx`. En strikt automatisk importordning är inte konfigurerad i `web/.oxlintrc.json`.
3. Markera rena typimporter med `import type` eller inline `type`, såsom i `web/lib/cohort-model.ts` och `web/lib/planning-store.ts`.

**Path Aliases:**
- `@/*` pekar på paketrotens `./*` i `web/tsconfig.json`; vyer använder exempelvis `@/components/ui/button` och `@/lib/organisation-model.ts`.
- Använd relativa importer med `.ts` mellan modeller och datalager när koden också laddas direkt av Node; se `web/lib/cohort-model.ts`, `web/lib/planning-store.ts` och `web/lib/admin-model.test.mjs`.
- Testfiler importerar `node:test` och `node:assert/strict` först, sedan modulen och modellfabrikerna; se `web/lib/cohort-model.test.mjs`.

## Error Handling

**Patterns:**
- Pröva verksamhetsvillkor före ändring och kasta `Error` med ett svenskt skäl. `copyCohort` och `normalizeClassBinding` stoppar fel roll, år, dubbletter och planval i `web/lib/cohort-model.ts`.
- Returnera avvikelser som data när flera fel ska visas: `groupPreview` ger `errors`, `changes`, `next`; `timplanIssues` och läsårets sammanfattning ger nivåindelade avvikelser. Se `web/lib/admin-model.ts`, `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts`.
- Modellens rollparameter är en klientkontroll. Verkliga mandat måste kontrolleras på servern och relevanta datavägar enligt `AGENTS.md`; `signInDemo` i `web/lib/supabase.ts` är en demofunktion.
- Kontrollera Supabase-svarets `error` och kasta kontextuella fel. `web/lib/cohort-store.ts` använder exempelvis `Kunde inte läsa klasskopplingarna: ...`; `web/lib/planning-store.ts` har hjälparna `client()` och `fail()`.
- Hantera kända databasfel uttryckligen, exempelvis `23505` för dubbletter i `saveUnitFromRegistry` och `savePointPlanDraft` i `web/lib/organisation-store.ts`.
- Visa fel via React-state med `e instanceof Error ? e.message : '<svenskt reservmeddelande>'` i `web/app/organisation-workspace.tsx` och `web/app/admin-workspace.tsx`.
- Organisationsändringar följer modellvalidering → optimistisk vy → skrivning → omläsning med bevarad skolenhet. Om skrivning misslyckas försöker `persist` läsa tillbaka, annars återställs föregående state i `web/app/organisation-workspace.tsx`.
- `runTimplan` och `runLasar` försöker också läsa tillbaka efter skrivning men kan behålla lokalt state om omläsningen misslyckas. Beskriv inte samtliga sparflöden som identiska; se `web/app/organisation-workspace.tsx`.
- Effekter använder `alive` och rensningsfunktion; uppslag använder `lookupGeneration` mot inaktuella svar. Import och kullkopiering har spärrar i refs i `web/app/organisation-workspace.tsx`.
- HTTP-fel returneras som JSON med `error` och status 400, 404 eller 502 i `web/app/api/skolenhet/route.ts`. Registeruppslaget är inte ett bevis på mandat enligt `AGENTS.md`.

## Logging

**Framework:** Något gemensamt loggningsbibliotek påträffas inte i `web/package.json`. Verksamhetshistorik ligger i modeller och databastabeller; kontrollskript använder `console`.

**Patterns:**
- Lägg verksamhetshändelser först i `history`, `log` eller `changes`, med ID, tid, roll, åtgärd och kommentar; se `web/lib/timplan-model.ts`, `web/lib/cohort-model.ts` och `web/lib/admin-model.ts`.
- `logChange` ökar även `revision` och registrerar berörda elev-ID:n i `web/lib/admin-model.ts`.
- Beständig historik skrivs till exempelvis `organisation_events`, `point_plan_events`, `timplan_events` och läsårshändelser i `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`.
- Händelseskrivningarna har olika felhantering: `logEvent` kontrollerar inte sitt insert-svar. Befintlig historik är inte därmed en verifierad revisionslogg; se `web/lib/organisation-store.ts`.
- Kontrollskript använder `console.log`/`console.error`, felräkning eller assertions i `work/supabase/verify.mjs` och `work/supabase/verify-cohorts.mjs`.
- Skriv inte hemligheter eller personuppgifter i Git, planering eller felsökningsutdata. Databasskript ska riktas mot avsedd isolerad testmiljö enligt `AGENTS.md`.

## Comments

**When to Comment:**
- Förklara verksamhetsgränser och ägarskap: kurskodernas nationella källa i `web/lib/admin-model.ts` och prioriteten för explicita klasskopplingar i `web/lib/cohort-model.ts`.
- Beskriv sidoeffekter vid modulens ingång. `web/lib/planning-store.ts` förklarar skillnadsbaserad lagring; `web/lib/organisation-store.ts` beskriver att laddning kan skapa exempeldata.
- Testkommentarer förklarar gränsfall, exempelvis kopians oberoende, ersatta beslut och minsta timtal i `web/lib/cohort-model.test.mjs` och `web/lib/timplan-model.test.mjs`.

**JSDoc/TSDoc:**
- Använd korta `/** ... */`-beskrivningar där domänfält behöver förklaras: `PlanItem.syllabus`, `Pupil.unitId` och `loadTimplans` i `web/lib/admin-model.ts` och `web/lib/planning-store.ts`.
- Något generellt krav på `@param`/`@returns` finns inte i `web/.oxlintrc.json`; följ korta förklarande kommentarer såsom i `web/lib/cohort-model.ts`.

## Function Design

**Size:**
- Separera domänberäkning från React och databasåtkomst: `web/lib/cohort-model.ts`, `web/lib/cohort-store.ts` och `web/app/organisation-workspace.tsx` visar uppdelningen.
- Maximal funktionslängd är inte konfigurerad i `web/.oxlintrc.json`. Arbetsytorna `web/app/admin-workspace.tsx` och `web/app/organisation-workspace.tsx` innehåller stora komponenter med lokala hjälpfunktioner.

**Parameters:**
- Skicka state först i modelloperationer: `copyCohort(org, plans, role, sourceId, year)` i `web/lib/cohort-model.ts` och `applyGroup(state, ids, targetId)` i `web/lib/admin-model.ts`.
- Använd typade objekt för sammanhängande indata, som `ClassTimplan` i `web/lib/cohort-model.ts` och `Slot` i `web/lib/admin-model.ts`.
- Destrukturera props och deklarera typer nära komponenten; se `web/app/organisation-workspace.tsx` och `web/components/ui/button.tsx`.

**Return Values:**
- Returnera nytt state utan att mutera anroparens tillstånd. Använd objekt-/arraykopior och `structuredClone` för nästlade celler/utkast i `web/lib/cohort-model.ts` och `web/lib/admin-model.ts`.
- Kopiors oberoende är testat: ändring av kopierade celler och kursval får inte ändra ursprunget enligt `web/lib/cohort-model.test.mjs`.
- Låt urvals- och beräkningsfunktioner returnera härledda värden: `unitOfferings`, `currentPointPlan`, `deriveEducations` och `summarize` i `web/lib/organisation-model.ts`, `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts`.
- Exempeldatum och aktuell tid är skilda: `today` är konstant, medan `uid()` och `clock()` varierar i `web/lib/common.ts`. Exempelkonstanten representerar inte driftens kalenderdatum.

## Module Design

**Exports:**
- Använd namngivna exporter för modeller, typer och datalager; se `web/lib/admin-model.ts`, `web/lib/cohort-model.ts` och `web/lib/cohort-store.ts`.
- Arbetsytor använder ofta namngivna komponentfunktioner med default-export; UI-primitiver använder namngivna exporter. Se `web/app/organisation-workspace.tsx`, `web/app/timplan-view.tsx` och `web/components/ui/button.tsx`.
- Behåll formulär/navigering i vyn, verksamhetsregler i modellen och formatöversättning/Supabase i lagret: `web/app/organisation-workspace.tsx`, `web/lib/organisation-model.ts`, `web/lib/organisation-store.ts`.
- Återanvänd `Button`, `Input` och `Dialog` från `web/components/ui/` och `cn` från `web/lib/utils.ts`. Varianter uttrycks med `cva`; verksamhetsvyer använder också namngivna klasser i `web/app/globals.css`.

**Barrel Files:**
- Någon central `web/lib/index.ts` eller `web/components/ui/index.ts` påträffas inte. Importera modulen direkt såsom i `web/app/organisation-workspace.tsx`.
- Enstaka vidareexporter finns, exempelvis `today`/`uid` i `web/lib/admin-model.ts`. Använd `web/lib/common.ts` för gemensamma småhjälpare utan onödiga modellberoenden.

---

*Convention analysis: 2026-09-11*
