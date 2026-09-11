# Technology Stack

**Analysis Date:** 2026-09-11

Kartläggningen bygger på lokala källor. Deklarerade versionskrav kommer från `web/package.json`; låsta versioner kommer från `web/package-lock.json`. Externa driftmiljöer är inte kontrollerade.

## Languages

**Primary:**
- TypeScript `5.9.3` används för domänmodeller, datalager och React-vyer i `web/lib/`, `web/app/` och `web/components/ui/`; versionen är både deklarerad och låst i `web/package.json` och `web/package-lock.json`.
- TSX används för gränssnittet, exempelvis `web/app/page.tsx` och `web/app/organisation-workspace.tsx`. `web/tsconfig.json` använder `jsx: react-jsx`, strikt typkontroll, `moduleResolution: bundler`, `target: ES2017` och DOM-/ESNext-bibliotek.

**Secondary:**
- JavaScript som ES-moduler i `web/lib/*.test.mjs`, `web/scripts/fetch-syllabus.mjs`, `web/scripts/phone-preview.mjs` och `work/supabase/*.mjs`; `web/package.json` har `type: module`.
- SQL och PL/pgSQL för schema, funktioner, triggers och radnivåskydd i de sex filerna under `supabase/migrations/`.
- CSS med Tailwind-direktiv, CSS-variabler och egna klassregler i `web/app/globals.css`.
- Python 3 för fristående undersökningsskript i `work/skolverket-api/probe.py` och `work/schoolsoft-research/`; de använder standardbibliotek som `urllib`, `json` och `pathlib`. Python-version och pakethanterare är inte låsta för dessa skript.

## Runtime

**Environment:**
- Node.js `>=22.13.0` är deklarerat i `web/package.json` och låsfilens rotpost i `web/package-lock.json`. Detta är projektets angivna krav, inte ett verifierat versionsspann för varje kommando.
- Utvecklingsserver och bygge körs med Vinext. `web/vite.config.ts` kopplar React Server Components-miljön `rsc` och underordnad `ssr` till Cloudflare-pluginen.
- Serverns byggmål använder `vinext/server/fetch-handler` och Cloudflares `nodejs_compat` i `web/vite.config.ts`. `web/package.json` startar det byggda resultatet via lokal `wrangler dev`.
- Supabase-konfigurationen anger lokal PostgreSQL 17 i `supabase/config.toml`. Molndatabasens serverversion går inte att fastställa från den filen.

**Package Manager:**
- npm används av kommandona i `web/package.json` och låsfilen `web/package-lock.json`; paketrot är `web/`.
- Låsfil finns: `web/package-lock.json`, `lockfileVersion: 3`.
- Exakt npm-version är inte låst; `web/package.json` saknar `packageManager` och ett npm-specifikt `engines`-krav.
- Projekt- och planeringsrot ligger ovanför paketet: `AGENTS.md`, `.planning/` och `supabase/` ligger bredvid `web/`.

## Frameworks

**Core:**

| Teknik | Deklarerad version | Låst version | Användning |
|---|---|---|---|
| React och React DOM | `^19.2.8` | `19.2.8` | Klientvyer och komponenttillstånd i `web/app/page.tsx`. |
| React Server DOM Webpack | `^19.2.8` | `19.2.8` | RSC-beroende i `web/package.json`; servermiljö i `web/vite.config.ts`. |
| Vinext | `^1.0.0-beta.9` | `1.0.0-beta.9` | App Router-liknande struktur med `web/app/layout.tsx`, `web/app/page.tsx` och `web/app/api/skolenhet/route.ts`. |
| Tailwind CSS | `4.2.1` | `4.2.1` | Temavariabler i `web/app/globals.css`; PostCSS-plugin i `web/vite.config.ts`. |
| Base UI React | `1.7.0` | `1.7.0` | UI-primitiver i exempelvis `web/components/ui/button.tsx` och `web/components/ui/dialog.tsx`. |
| Shadcn | `4.18.0` | `4.18.0` | Komponentverktyg/CSS; konfiguration i `web/components.json`, lokala komponenter i `web/components/ui/`. |
| Shadcn React | `0.3.0` | `0.3.0` | UI-stöd deklarerat i `web/package.json`. |

- Samtliga versioner i tabellen kommer från `web/package.json` och `web/package-lock.json`.
- Behandla `next`-importer som del av Vinext-upplägget: `web/app/layout.tsx` importerar `Metadata` och `next/font/google`, medan `web/next.config.ts` är en tom kompatibilitetskonfiguration. Paketet `next` är inte deklarerat eller låst i `web/package.json`/`web/package-lock.json`.
- `web/components.json` anger Shadcn-stilen `base-nova`, TSX, RSC, Lucide-ikoner och CSS-baserad Tailwind-konfiguration.

**Testing:**
- Nodes inbyggda `node:test` och `node:assert/strict` används i åtta `web/lib/*.test.mjs`, exempelvis `web/lib/organisation-model.test.mjs` och `web/lib/cohort-model.test.mjs`.
- Modelltesterna importerar TypeScript direkt, exempelvis `./organisation-model.ts` i `web/lib/organisation-model.test.mjs`; det finns ingen separat testtranspilering i `web/package.json`.
- Separata databaskontroller finns i `work/supabase/verify.mjs`, `work/supabase/verify-cohorts.mjs` och `work/supabase/verify-school-import.mjs`. De använder det konfigurerade Supabase-projektet och skriver syntetiska data.
- Vitest, Jest som testsvit, Playwright och Cypress är inte konfigurerade i `web/package.json`; Node-testfilerna under `web/lib/` är den upptäckta automatiska enhetstestningen.

**Build/Dev:**

| Verktyg | Deklarerad version | Låst version | Kodankare |
|---|---|---|---|
| Vite | `^8.2.2` | `8.2.2` | `web/vite.config.ts` |
| Cloudflare Vite-plugin | `^1.54.4` | `1.54.4` | `web/vite.config.ts` |
| Wrangler | `^4.129.0` | `4.129.0` | `web/package.json`, `web/scripts/phone-preview.mjs` |
| OpenAI Sites Vite-plugin | `0.2.0` | `0.2.0` | `web/vite.config.ts` |
| Vite RSC-plugin | `^0.5.34` | `0.5.34` | Deklareras i `web/package.json`. |
| Vite React-plugin | `6.0.2` | `6.0.2` | Deklareras i `web/package.json`; `web/vite.config.ts` anropar Vinext-pluginen. |
| Tailwind PostCSS-plugin | `4.2.1` | `4.2.1` | `web/vite.config.ts` |
| Oxlint | `1.76.0` | `1.76.0` | `web/.oxlintrc.json` |
| Oxlint TSGolint | `7.0.2001` | `7.0.2001` | Typmedveten kontroll i `web/.oxlintrc.json`. |
| Oxfmt | `0.61.0` | `0.61.0` | `web/.oxfmtrc.json` |

- Samtliga versioner i verktygstabellen kommer från `web/package.json` och `web/package-lock.json`, inte från en ny installation.
- Oxlint har typmedveten kontroll, TypeScript-/React-/import-/tillgänglighetsregler och utesluter bland annat genererade typer och byggkataloger i `web/.oxlintrc.json`.
- Oxfmt använder enkla citattecken och 80 teckens radbredd i `web/.oxfmtrc.json`.

## Key Dependencies

**Critical:**
- `@supabase/supabase-js`: deklarerad `^2.115.0`, låst `2.115.0` i `web/package.json` och `web/package-lock.json`. `web/lib/supabase.ts` skapar en typad klient för Auth, tabellanrop och RPC; datatyper finns i `web/lib/database.types.ts`.
- `lucide-react 1.31.0`: ikoner i `web/app/page.tsx`, `web/app/organisation-workspace.tsx` och UI-komponenter; versionskällor är `web/package.json` och `web/package-lock.json`.
- `class-variance-authority 0.7.1`, `clsx 2.1.1` och `tailwind-merge 3.6.0`: komponentvarianter och klasskombinationer i `web/components/ui/button.tsx` och `web/lib/utils.ts`; versioner i `web/package.json`.
- Den lokala, genererade Skolverket-katalogen i `web/lib/syllabus-snapshot.ts` är referensunderlag för domänlogiken i `web/lib/syllabus.ts`, `web/lib/organisation-model.ts` och `web/lib/timplan-model.ts`.

**Infrastructure:**
- `@cloudflare/workers-types`: deklarerad `^5.20260903.1`, låst `5.20260903.1` i `web/package.json` och `web/package-lock.json`; laddas via `types` i `web/tsconfig.json`.
- `pgcrypto` aktiveras av `supabase/migrations/20260905120000_huvudman.sql`. Databasintegrationen använder Supabase-klienten och SQL; något separat ORM-lager finns inte i `web/lib/organisation-store.ts`, `web/lib/planning-store.ts` eller `web/lib/cohort-store.ts`.
- UI-bibliotek som `recharts 3.8.0`, `react-day-picker 9.8.1`, `date-fns 4.1.0`, `cmdk 1.1.1` och `embla-carousel-react 8.5.2` finns i `web/package.json`. Omslag finns i `web/components/ui/chart.tsx`, `web/components/ui/calendar.tsx`, `web/components/ui/command.tsx` och `web/components/ui/carousel.tsx`; bibliotekets existens betyder inte att varje huvudvy använder det.

## Configuration

**Environment:**
- `web/lib/supabase.ts` läser `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Båda behövs för att `hasBackend` ska bli sant; annars returnerar `supabase()` `null`.
- `web/.env.local` finns som lokal miljökonfiguration. Innehållet har inte lästs. `.gitignore` och `web/.gitignore` skiljer miljöfiler och genererade utdata från källor.
- `web/vite.config.ts` använder `CODEX_SANDBOX` för att välja polling under Seatbelt och sätter standardvärden för `WRANGLER_WRITE_LOGS`, `WRANGLER_LOG_PATH` och `MINIFLARE_REGISTRY_PATH`.
- `web/scripts/phone-preview.mjs` styr `WRANGLER_WRITE_LOGS` och `WRANGLER_SEND_METRICS` för sin underprocess. Dessa är verktygsinställningar, inte applikationsbehörigheter.
- `supabase/config.toml` beskriver lokal API-, databas-, Auth- och Storage-konfiguration. Anonym inloggning är påslagen i filen; fjärrprojektets inställningar är inte verifierade.

**Build:**
- `web/vite.config.ts` är aktiv byggkonfiguration: Vinext, Sites, Cloudflare och Tailwind via PostCSS.
- `web/.openai/hosting.json` har `d1: null` och `r2: null`. Villkorade D1-/R2-bindningar finns i `web/vite.config.ts`, men dessa resurser är inte konfigurerade där.
- `web/tsconfig.json` definierar aliaset `@/*` till `web/*`, tillåter `.ts`-importsökvägar och använder `noEmit` för typkontrollen.
- `web/app/layout.tsx` sätter svenska som dokumentspråk och laddar globala stilar samt deklarationer för Geist/Geist Mono.

## Platform Requirements

**Development:**
- Kör paketkommandon med `web/` som arbetskatalog enligt `web/package.json` och `AGENTS.md`.

```bash
npm run dev                 # vinext dev
npm run build               # vinext build
npm run start               # lokal wrangler dev mot byggd serverkonfiguration
npm run phone               # lokal telefonförhandsvisning av befintligt bygge
node --test lib/*.test.mjs   # domänmodellernas tester
npx tsc --noEmit             # typkontroll
npx oxlint app lib          # kontroll av app- och domänkällor
```

- Kommandoankare: scripts i `web/package.json`, testfiler i `web/lib/` och projektkontroller i `AGENTS.md`. I kartläggningen kördes endast den lokala modellsviten med Node 24.19.0: 85 tester passerade, 0 fel, 0 överhoppade och 0 todo. Se [TESTING.md](TESTING.md) i `.planning/codebase/TESTING.md`. Bygge och extern drift har inte omprövats.
- Telefonförhandsvisningen i `web/scripts/phone-preview.mjs` kräver byggd `web/dist/server/wrangler.json`, startar Wrangler på loopback-port 3001 och exponerar GET/HEAD på port 3002 i det lokala nätverket. Den blockerar bland annat Wranglers administrationssökvägar.
- Modelltester behöver ingen Supabase-anslutning; `work/supabase/verify*.mjs` och `work/supabase/reset.mjs` är separata databasskript med skrivningar. Följ avgränsningen för testmiljö i `AGENTS.md`.
- Supabase CLI är inte en npm-dependency i `web/package.json`; eventuell separat installation och version kan inte utläsas ur projektets låsfil.

**Production:**
- Koden har Cloudflare/Vinext som byggmål i `web/vite.config.ts` och Sites-integrering via `web/.openai/hosting.json`. Något publiceringskommando eller en CI-baserad produktionspipeline är inte definierat i `web/package.json`.
- Supabase kan användas som externt datalager när klientmiljön är satt i `web/lib/supabase.ts`. De sex migrationsfilerna i `supabase/migrations/` visar avsett schema, inte vilka migrationer som är tillämpade i ett fjärrprojekt.
- Identitetsflödet är demoanpassat: `web/lib/supabase.ts` och `supabase/migrations/20260905130000_demo_bootstrap.sql` knyter anonyma besökare till demohuvudmannen. `AGENTS.md` anger att denna väg inte får användas för verkliga elevuppgifter eller pilotens skyddade driftvägar.

---

*Stack analysis: 2026-09-11*
