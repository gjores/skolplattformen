# Codebase Structure

**Analysis Date:** 2026-09-11

## Directory Layout

```text
skolplattform/
├── .planning/                  # GSD-kontext, kodbaskarta och research
│   ├── codebase/               # Sju dokument om aktuell implementation
│   └── research/               # Research och föreslagen inriktning
├── docs/                       # Produktunderlag och verksamhets-/designreferenser
│   ├── produktunderlag/        # Kravregister, acceptansscenarier och informationsmodell
│   └── schoolsoft/             # Funktionsregister och observationer
├── supabase/
│   ├── config.toml             # Supabase-konfiguration
│   └── migrations/             # Tabeller, policyer, triggers och RPC
├── web/                        # Appens paketrot och körkatalog för npm
│   ├── .openai/                # Hostingkonfiguration som importeras av Vite
│   ├── app/
│   │   ├── api/skolenhet/route.ts  # Läsproxy till Skolverket
│   │   ├── layout.tsx          # Dokumentrot, metadata och typsnitt
│   │   ├── page.tsx            # Appskal, navigation och delat sessionstillstånd
│   │   ├── admin-workspace.tsx # Elever, studieplaner, grupper och schema
│   │   ├── organisation-workspace.tsx # Skolor, utbildningar och beständig samordning
│   │   ├── workspace-views.tsx # Pedagogiska exempelvyer
│   │   ├── timplan-view.tsx    # Timplansmatris och beslutsflöde
│   │   ├── timplan-classes.tsx # Klasskoppling till timplansversion
│   │   ├── lasar-view.tsx      # Kalender och undervisningstid
│   │   ├── principal-picker.tsx # Val av utsedd rektor
│   │   └── globals.css         # Globala stilar och verksamhetsytornas layout
│   ├── components/ui/          # Delade UI-primitiver
│   ├── hooks/use-mobile.ts    # Mobilbrytpunkt för bland annat sidomenyn
│   ├── lib/
│   │   ├── *-model.ts         # Domänmodeller och ändringsregler
│   │   ├── *-store.ts         # Supabase-läsning, skrivning och typmappning
│   │   ├── *.test.mjs         # Modell- och hjälpfunktionstester
│   │   ├── supabase.ts        # Klient, backendflagga och demoinloggning
│   │   ├── database.types.ts  # Supabase-tabell- och RPC-typer
│   │   ├── syllabus.ts        # Läslager för styrdokumentskatalogen
│   │   ├── syllabus-snapshot.ts # Genererade katalogdata
│   │   ├── registry-address.ts # Adressnormalisering
│   │   ├── common.ts          # Gemensamma ID-, tids- och datumhjälpare
│   │   └── utils.ts           # UI-hjälparen cn()
│   ├── public/favicon.svg     # Statisk appikon
│   ├── scripts/               # Kataloghämtning och telefonförhandsvisning
│   ├── package.json           # Beroenden och körkommandon
│   ├── package-lock.json      # npm-låsfil
│   ├── vite.config.ts         # Vinext, Sites, Cloudflare och Tailwind
│   ├── next.config.ts         # Tom kompatibilitetskonfiguration
│   ├── tsconfig.json          # TypeScript och aliaset @/*
│   ├── components.json        # UI-konfiguration och alias
│   ├── .oxlintrc.json          # Lintkonfiguration
│   └── .oxfmtrc.json           # Formatteringskonfiguration
├── work/
│   ├── supabase/              # Databasverifiering och demoåterställning
│   ├── skolverket-api/         # API-probning
│   └── schoolsoft-research/    # Verktyg för funktionskartläggning
├── .gitignore                 # Lokal konfiguration och genererade filer
├── AGENTS.md                  # Projektvägledning
└── README.md                  # Ingångsdokument
```

## Directory Purposes

**`web/`:**
- Purpose: Appens paketrot; kör npm-, TypeScript- och modelltestkommandon här.
- Contains: App, komponenter, modeller, datalager, byggkonfiguration och hjälpskript.
- Key files: `web/package.json`, `web/vite.config.ts`, `web/tsconfig.json`, `web/.gitignore`.
- Boundary: GSD- och Git-rot är katalogen ovanför; `web/` har ingen separat Git-rot i den granskade arbetskopian.

**`web/app/`:**
- Purpose: Sidram, verksamhetsvyer och serverroute.
- Contains: En `page.tsx`, en `layout.tsx`, arbetsytekomponenter och CSS. Arbetsytornas filnamn är inte egna URL-rutter.
- Key files: `web/app/page.tsx`, `web/app/organisation-workspace.tsx`, `web/app/admin-workspace.tsx`, `web/app/api/skolenhet/route.ts`.
- Boundary: `OrganisationWorkspace` samordnar databasrelaterade flöden; `AdminWorkspace` får sessionsdata och setter från `Home`.

**`web/lib/`:**
- Purpose: Domänregler, databasanpassning och nationell referensdata.
- Contains: Modell- och store-filer samt samlokaliserade `.test.mjs`-filer.
- Key files: `web/lib/organisation-model.ts`, `web/lib/organisation-store.ts`, `web/lib/admin-model.ts`, `web/lib/planning-store.ts`, `web/lib/cohort-model.ts`, `web/lib/syllabus.ts`.
- Boundary: `web/lib/admin-model.ts` har inget beständigt admin-store. `web/lib/planning-store.ts` delas av timplans- och läsårsdomänen.

**`web/components/ui/` och `web/hooks/`:**
- Purpose: Återanvändbara UI-primitiver och presentationshjälpare.
- Contains: Knappar, formulär, dialoger, tabeller, paneler och sidomeny med Base UI och Tailwind-klasser.
- Key files: `web/components/ui/button.tsx`, `web/components/ui/dialog.tsx`, `web/components/ui/sidebar.tsx`, `web/hooks/use-mobile.ts`, `web/lib/utils.ts`.
- Boundary: Domänspecifika formulär hör hemma i `web/app/`; grundkomponenterna ska inte behöva skolans datamodell.

**`supabase/migrations/`:**
- Purpose: Beständig datamodell och databasens åtkomstregler.
- Contains: Sex SQL-migrationer för organisationsgrund, demoidentitet, timplan/läsår, kullar/klasskopplingar, skolimport och läraruppdrag.
- Key files: `supabase/migrations/20260905120000_huvudman.sql`, `supabase/migrations/20260905130000_demo_bootstrap.sql`, `supabase/migrations/20260905170000_timplan_lasar.sql`, `supabase/migrations/20260908120000_cohorts_classes.sql`, `supabase/migrations/20260908150000_school_import.sql`, `supabase/migrations/20260908170000_principal_teacher_assignments.sql`.
- Boundary: `web/lib/database.types.ts` är klientens typkontrakt och ersätter inte SQL-policyer.

**`web/scripts/` och `work/`:**
- Purpose: Avgränsade utvecklings-, verifierings- och researchverktyg.
- Contains: Kataloggenerator, telefonproxy, databasverifieringar, demoåterställning och Python-skript.
- Key files: `web/scripts/fetch-syllabus.mjs`, `web/scripts/phone-preview.mjs`, `work/supabase/verify.mjs`, `work/supabase/verify-cohorts.mjs`, `work/supabase/verify-school-import.mjs`, `work/supabase/reset.mjs`, `work/skolverket-api/probe.py`.
- Boundary: Databasverktygen är inte rena modelltester. Granska skrivningar och välj avsedd testmiljö före körning; `work/supabase/reset.mjs` raderar demodata.

**`.planning/` och `docs/`:**
- Purpose: Planering, krav, kartläggning och produktunderlag.
- Contains: GSD-kontext i `.planning/`, aktuell kodkarta i `.planning/codebase/`, research i `.planning/research/` samt verksamhets- och designreferenser i `docs/`.
- Key files: `.planning/PROJECT.md`, `.planning/STATE.md`, `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md`, `docs/arbeta-med-gsd.md`, `docs/produktunderlag/12-informationsmodell-och-designkontrakt.md`.
- Boundary: Använd `web/` och `supabase/migrations/` som belägg för implementation. Förslag i `.planning/research/` och `docs/` är inte i sig implementerade funktioner.

## Key File Locations

**Entry Points:**
- `web/app/page.tsx`: URL `/`, exempelroller, navigation och delat sessionstillstånd.
- `web/app/layout.tsx`: Dokumentram, metadata, stilar och typsnitt.
- `web/app/api/skolenhet/route.ts`: `GET /api/skolenhet` med kod, kommun eller huvudman.
- `web/package.json`: Kommandon för Vinext, Wrangler, lint, format och telefonvisning.
- `web/scripts/phone-preview.mjs`: Serverbygge och separat HTTP-proxy för telefonvisning.

**Configuration:**
- `web/vite.config.ts`: Aktiv bygg- och serverkonfiguration samt lokal verktygsstate.
- `web/.openai/hosting.json`: Fil som importeras av Vite; deklarerade bindings bevisar inte användning i verksamhetskoden.
- `web/next.config.ts`: Kompatibilitetsfil med tomt konfigurationsobjekt.
- `web/tsconfig.json`: Strikt TypeScript, import av `.ts`-filer och `@/* → web/*`.
- `web/components.json`: UI-alias och komponentstil.
- `web/.oxlintrc.json`, `web/.oxfmtrc.json`: Kodkontroller och formatering.
- `supabase/config.toml`: Supabase-konfiguration.
- `.gitignore`, `web/.gitignore`: Olika rotregler för lokal konfiguration och genererade filer.

**Core Logic:**

| Område | Modell/adapter | Vy |
|---|---|---|
| Skolenheter, rektor, läraruppdrag och utbildningar | `web/lib/organisation-model.ts`, `web/lib/organisation-store.ts` | `web/app/organisation-workspace.tsx`, `web/app/principal-picker.tsx` |
| Poängplaner och programfördjupning | `web/lib/organisation-model.ts`, `web/lib/syllabus.ts`, `web/lib/organisation-store.ts` | `web/app/organisation-workspace.tsx` |
| Timplansram, timmar och beslut | `web/lib/timplan-model.ts`, `web/lib/planning-store.ts` | `web/app/timplan-view.tsx` |
| Läsår, lov och undervisningstid | `web/lib/lasar-model.ts`, `web/lib/planning-store.ts` | `web/app/lasar-view.tsx` |
| Kullkopiering och klasskoppling | `web/lib/cohort-model.ts`, `web/lib/cohort-store.ts` | `web/app/organisation-workspace.tsx`, `web/app/timplan-classes.tsx` |
| Elever, studieplansutkast, grupper och schemaslots | `web/lib/admin-model.ts` | `web/app/admin-workspace.tsx`, state i `web/app/page.tsx` |
| Pedagogiska exempel och ärenden | `web/lib/school-model.ts` | `web/app/workspace-views.tsx` |
| Registeradress | `web/lib/registry-address.ts` | `web/app/api/skolenhet/route.ts`, `web/app/organisation-workspace.tsx` |
| Katalogreferenser och versioner | `web/lib/syllabus.ts`, `web/lib/syllabus-snapshot.ts` | Organisations-, timplans- och administrationsvyerna i `web/app/` |

**Testing:**
- `web/lib/organisation-model.test.mjs`: Skolenheter, uppdrag, utbildningar och poängplaner.
- `web/lib/admin-model.test.mjs`: Elev- och gruppändringar, studieplaner och schemakontroller.
- `web/lib/timplan-model.test.mjs`, `web/lib/lasar-model.test.mjs`: Timfördelning, beslut, kalender och lärotider.
- `web/lib/cohort-model.test.mjs`: Kullkopiering, oberoende kopior och explicita klasskopplingar.
- `web/lib/syllabus.test.mjs`, `web/lib/school-model.test.mjs`, `web/lib/registry-address.test.mjs`: Katalogreferenser, pedagogiska hjälpfunktioner och adressnormalisering.
- `work/supabase/verify.mjs`, `work/supabase/verify-cohorts.mjs`, `work/supabase/verify-school-import.mjs`: Separata verifieringsskript mot konfigurerad databas.
- `web/package.json` saknar testscript; kör `node --test lib/*.test.mjs` från `web/`.

## Naming Conventions

**Files:**
- Använd gemener och bindestreck enligt `web/app/organisation-workspace.tsx`, `web/app/timplan-classes.tsx` och `web/lib/cohort-model.ts`.
- Behåll `-model.ts` för domänfunktioner, `-store.ts` för databasadaptrar och `.test.mjs` för modelltester, enligt `web/lib/organisation-model.ts`, `web/lib/organisation-store.ts` och `web/lib/organisation-model.test.mjs`.
- Använd ramverkets namn `page.tsx`, `layout.tsx` och `route.ts` för faktiska rutter och dokumentram, enligt `web/app/page.tsx`, `web/app/layout.tsx` och `web/app/api/skolenhet/route.ts`.
- SQL använder tidsstämpel och beskrivning, exempelvis `supabase/migrations/20260908120000_cohorts_classes.sql`.
- GSD-kartan använder dokumentnamn med versaler, exempelvis `.planning/codebase/ARCHITECTURE.md`.

**Directories:**
- Använd ansvarskatalogerna `web/app/`, `web/lib/`, `web/components/ui/`, `web/hooks/` och `web/scripts/`.
- Serverendpointen ligger under `web/app/api/`, exemplifierat av `web/app/api/skolenhet/route.ts`.
- Domänerna har inte egna featurekataloger; vyerna ligger tillsammans i `web/app/` och modellerna i `web/lib/`.
- Lägg planering under `.planning/`, produktreferenser under `docs/` och databasverktyg under `work/supabase/`.

## Where to Add New Code

**New Feature:**
- Primary code: Utgå från domäntabellen ovan. Utöka regler i `web/lib/*-model.ts`, beständiga anrop i `web/lib/*-store.ts` och vyer i `web/app/`.
- Tests: Lägg regeltester bredvid modellen i `web/lib/`; följ `web/lib/cohort-model.test.mjs` för oföränderlighet, rollkontroller och explicita kopplingar.
- Navigation: Lägg vy-ID och synlighet i `View`, `navItems` och `roleNavigation` i `web/app/page.tsx`. Navigation ersätter inte SQL-behörighet.
- State ownership: Data som delas mellan administration och läsår ägs i `web/app/page.tsx`; organisationens beständiga domäner ägs i `web/app/organisation-workspace.tsx`. Lägg urval och formulär i närmaste berörda vy.

**New Component/Module:**
- Implementation: Lägg domänformulär eller paneler nära arbetsytorna i `web/app/`, enligt `web/app/principal-picker.tsx` och `web/app/timplan-classes.tsx`.
- Reusable UI: Lägg generiska grundkomponenter i `web/components/ui/` med befintliga props- och stylingmönster.
- Presentation: Samordna verksamhetsstilar i `web/app/globals.css`; generella hooks hör hemma i `web/hooks/`.

**Persistence and Server Code:**
- Database shape: Lägg schema- och policyändringar i `supabase/migrations/`; håll `web/lib/database.types.ts` och berört `*-store.ts` i samklang.
- Atomic operations: Följ RPC-gränsen i `supabase/migrations/20260908150000_school_import.sql` och `web/lib/organisation-store.ts` när relaterade rader måste ändras tillsammans.
- External reads: Följ validering och svarsreducering i `web/app/api/skolenhet/route.ts`; lägg återanvändbar normalisering i `web/lib/` enligt `web/lib/registry-address.ts`.
- Reference data: Använd `web/lib/syllabus.ts` för kataloguppslag. Ändra generatorn `web/scripts/fetch-syllabus.mjs` när urval eller format ändras; handredigera inte `web/lib/syllabus-snapshot.ts`.
- Boundary: UI i `web/app/admin-workspace.tsx` och funktioner i `web/lib/admin-model.ts` ger inte beständig elevlagring utan en implementerad dataväg.

**Utilities:**
- Shared helpers: `web/lib/common.ts` för små modellgemensamma funktioner, `web/lib/utils.ts` för klassammanslagning.
- Calendar helpers: Lägg datum- och kalenderberäkningar med befintliga funktioner i `web/lib/lasar-model.ts`.
- Domain validation: Lägg kontroller där modellen ägs, exempelvis `web/lib/organisation-model.ts` eller `web/lib/admin-model.ts`, så att de kan testas utan UI.

## Special Directories

**`.planning/codebase/`:**
- Purpose: Aktuell navigerings- och arkitekturgrund för GSD-kommandon.
- Generated: Ja, dokument som skrivs av kartläggningsflödet och granskas mot koden.
- Committed: Ja, dokumenten spåras av Git. Se `.planning/codebase/ARCHITECTURE.md` och `.planning/codebase/STRUCTURE.md`.

**`web/`, `supabase/` och `work/`:**
- Purpose: Appkällor, databasdefinitioner och utvecklingsverktyg.
- Generated: Blandat, huvudsakligen källkod. `web/lib/syllabus-snapshot.ts` skapas av `web/scripts/fetch-syllabus.mjs`; `web/lib/database.types.ts` har Supabase-typformat.
- Committed: Nej i den granskade arbetskopian; `git status` visar rotkatalogerna som ospårade. Förekomst på disk ska inte beskrivas som befintlig Git-spårning.

**`web/node_modules/`, `web/dist/`, `web/.wrangler/`, `web/.vinext/`, `web/.next/`:**
- Purpose: Beroenden, byggutdata och lokal runtime-/ramverksstate.
- Generated: Ja; lägg inte verksamhetskod här. `web/package.json` använder serverkonfigurationen som byggs under `web/dist/server/`.
- Committed: Nej; ignoreras av `.gitignore` och/eller `web/.gitignore`.

**`supabase/.temp/` och `supabase/.branches/`:**
- Purpose: Lokal Supabase-CLI-state och branchstate.
- Generated: Ja; behövs inte som källa till verksamhetsmodellerna.
- Committed: Nej; ignoreras av `.gitignore`. Anslutningsmetadata hör till lokal konfiguration.

**`web/.openai/`:**
- Purpose: Hostingkonfiguration i `web/.openai/hosting.json`.
- Generated: Genereringsflödet är inte fastställt genom källinspektionen; `web/vite.config.ts` importerar filen.
- Committed: Nej i den granskade arbetskopian, eftersom `web/` är ospårad.

**Projektfärdigheter:**
- Purpose: Lokala instruktioner skulle ligga under `.claude/skills/` eller `.agents/skills/`.
- Generated: Inte tillämpligt; inga sådana projektkataloger hittades.
- Committed: Inte tillämpligt. Projektvägledningen finns i `AGENTS.md`.

---

*Structure analysis: 2026-09-11*
