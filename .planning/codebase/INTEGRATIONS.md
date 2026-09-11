# External Integrations

**Analysis Date:** 2026-09-11

Underlaget är lokal kod och konfiguration: `web/lib/`, `web/app/api/`, `web/scripts/`, `web/vite.config.ts` och `supabase/migrations/`. Inga externa system har anropats i kartläggningen. En lokal inställning eller migrationsfil är inte bevis för motsvarande tillstånd i molnet.

## APIs & External Services

**Skolverket — Skolenhetsregistret:**
- Användning: uppslag av skolenheter, kommuner och huvudmän inför import och uppdatering av skolgrund i `web/app/organisation-workspace.tsx`.
  - SDK/Client: inbyggd `fetch` via serverrutten `web/app/api/skolenhet/route.ts`.
  - Auth: ingen nyckel eller autentisering skickas till registret i `web/app/api/skolenhet/route.ts`; anropen sätter `Accept: application/json`.
  - Basadress i koden: `https://api.skolverket.se/skolenhetsregistret/v2`, definierad i `web/app/api/skolenhet/route.ts`.
- Webbläsaren anropar den egna rutten med `kod`, `kommun` eller `huvudman`; `web/app/api/skolenhet/route.ts` validerar åtta, fyra respektive tio siffror före externa anrop.
- Externa läsvägar byggda av `web/app/api/skolenhet/route.ts`: `/school-units/{kod}`, `/school-units?municipality_code={kommun}`, `/school-units?organization_number={huvudman}` och `/organizers/{huvudman}`. Huvudmannaanropet används också vid behov för kommunnamn.
- `reduceUnit()` i `web/app/api/skolenhet/route.ts` begränsar svaret till kod, namn, status, skolformer, program, adress, huvudman och källmetadata. Rektorsnamnet `headMaster` förs vidare; rektors e-post och telefon tas inte med.
- `web/lib/registry-address.ts` väljer och normaliserar adressuppgifterna. Modell och gränssnitt förhandsvisar importen i `web/lib/organisation-model.ts` och `web/app/organisation-workspace.tsx`.
- `saveUnitFromRegistry()` i `web/lib/organisation-store.ts` anropar RPC:n `import_school_unit` i `supabase/migrations/20260908150000_school_import.sql`. Den sparar skolenhet, skolformer, eventuellt rektorsuppdrag, registerunderlag och verksamhetshändelse i samma databasfunktion.
- `updateUnitFromRegistry()` i `web/lib/organisation-store.ts` skriver uppdaterade skoluppgifter, skolformer och registerögonblicksbild genom flera tabellanrop. `registry_snapshots` får payloaden från appflödet; serverrutten har redan reducerat Skolverkets originalsvar i `web/app/api/skolenhet/route.ts`.
- Uppslaget verifierar registeruppgifter. Behörighet att företräda huvudmannen hämtas inte från registret; lokalt utsedd rektor hålls separat från `headMaster` genom `appoint_school_principal` i `supabase/migrations/20260908150000_school_import.sql`.

**Skolverket — Syllabus:**
- Användning: ämnen, kurser/nivåer, program och poängplansblock för grundskola och gymnasium i `web/lib/syllabus.ts`, `web/lib/organisation-model.ts` och `web/lib/timplan-model.ts`.
  - SDK/Client: Nodes inbyggda `fetch` i `web/scripts/fetch-syllabus.mjs`.
  - Auth: ingen nyckel används av `web/scripts/fetch-syllabus.mjs`.
  - Basadress i koden: `https://api.skolverket.se/syllabus/v1`, definierad i `web/scripts/fetch-syllabus.mjs`.
- Skriptet hämtar `/subjects?schooltype=gy`, `/subjects?schooltype=gr`, `/programs?schooltype=gy` och `/programs/{code}`. Programlistan filtreras till `PROGRAM25` i `web/scripts/fetch-syllabus.mjs`.
- Körvägen är ett separat underhållsskript, `node scripts/fetch-syllabus.mjs` från `web/`. Det är inte ett steg i `build` och har ingen schemaläggning i `web/package.json`.
- Appen läser den lokala, genererade katalogögonblicksbilden `web/lib/syllabus-snapshot.ts` via `web/lib/syllabus.ts`; den gör inte Syllabus-anrop vid varje sidvisning.
- Ögonblicksbildens egna metadata är `fetched: 2026-09-05`, `apiVersion: 1.16.2-SNAPSHOT` och skolformerna `gy`/`gr` i `web/lib/syllabus-snapshot.ts`. Detta beskriver filens underlag, inte tjänstens aktuella version.
- Fulltext för centralt innehåll och betygskriterier ingår inte i extraheringen som `web/scripts/fetch-syllabus.mjs` gör.

**Supabase:**
- Användning: Auth, PostgreSQL-tabeller och databasfunktioner för organisations- och planeringsdata i `web/lib/supabase.ts`, `web/lib/organisation-store.ts`, `web/lib/planning-store.ts` och `web/lib/cohort-store.ts`.
  - SDK/Client: `@supabase/supabase-js`, deklarerad `^2.115.0` i `web/package.json`, låst `2.115.0` i `web/package-lock.json`.
  - Auth: `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` konfigurerar klienten; därefter används Supabase Auth-sessionen i `web/lib/supabase.ts`.
- Datalagren gör direkta `.from(...).select/insert/update/upsert/delete`-anrop samt `.rpc(...)`; det finns ingen egen generell databasproxy bland serverrutterna i `web/app/api/`.
- `supabase/config.toml` aktiverar lokalt bland annat Realtime och Edge Runtime. Någon appprenumeration på Realtime eller egen Supabase Edge Function är inte upptäckt i `web/lib/`, `web/app/` eller `supabase/`.

**Övriga tjänster och avgränsningar:**
- `web/app/layout.tsx` använder `next/font/google` för Geist/Geist Mono inom Vinext. Nätverksbeteendet för denna fontdeklaration vid bygge/drift är inte verifierat genom körning.
- `web/app/lasar-view.tsx` och `web/lib/timplan-model.ts` innehåller källänkar till `lagen.nu`; de utgör inte en API-integration.
- Kommunal identitetsanslutning, elev-/personal-/schemasynk, SS 12000, diarium och säkerhetsövervakning är inte implementerade som externa klienter i `web/lib/` eller serverrutter i `web/app/api/`. Elev-, grupp- och schemadata skapas i `web/lib/admin-model.ts`, medan identitetsvägen finns i `web/lib/supabase.ts`.
- Forskningsskripten i `work/skolverket-api/probe.py` och `work/schoolsoft-research/` ligger utanför appens körväg i `web/package.json`; deras existens innebär ingen verksamhetsanslutning till dessa system.

## Data Storage

**Databases:**
- Supabase PostgreSQL är det implementerade externa datalagret. Lokal konfiguration anger PostgreSQL 17 och API-scheman `public`/`graphql_public` i `supabase/config.toml`; verklig molnversion och driftsättning är inte kontrollerade.
  - Connection: webbadress och publik klientnyckel från `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` i `web/lib/supabase.ts`, inte en direkt PostgreSQL-anslutningssträng i appen.
  - Client: typad `SupabaseClient<Database>` i `web/lib/supabase.ts`, med schemaformat i `web/lib/database.types.ts`.
  - Schemaförändringar: SQL-filer i `supabase/migrations/`; inget separat ORM är konfigurerat i `web/package.json`.

| Dataområde | Tabeller/funktioner | Kodankare |
|---|---|---|
| Huvudman och profil | `organizers`, `profiles`, `current_organizer_id`, `current_app_role` | `supabase/migrations/20260905120000_huvudman.sql`, `web/lib/supabase.ts` |
| Skolenheter och uppdrag | `school_units`, `school_unit_types`, `assignments`, `assignment_units` | `supabase/migrations/20260905120000_huvudman.sql`, `web/lib/organisation-store.ts` |
| Registerunderlag | `registry_snapshots` | `supabase/migrations/20260908150000_school_import.sql`, `web/lib/organisation-store.ts` |
| Utbildningar och beslut | `offerings`, `permits`, `point_plans`, `point_plan_events`, `organisation_events` | `supabase/migrations/20260905120000_huvudman.sql`, `web/lib/organisation-store.ts` |
| Timplaner | `timplans`, `timplan_cells`, `timplan_events` | `supabase/migrations/20260905170000_timplan_lasar.sql`, `web/lib/planning-store.ts` |
| Läsår och undantag | `school_years`, `school_year_days`, `school_year_group_days`, `school_year_short_weeks`, `school_year_events` | `supabase/migrations/20260905170000_timplan_lasar.sql`, `web/lib/planning-store.ts` |
| Elevkullar och klasskopplingar | `copy_offering_cohort`, `class_timplans`, `validate_class_timplan` | `supabase/migrations/20260908120000_cohorts_classes.sql`, `web/lib/cohort-store.ts` |
| Skolimport och rektorsbeslut | `import_school_unit`, `appoint_school_principal` | `supabase/migrations/20260908150000_school_import.sql`, `web/lib/organisation-store.ts` |

- RLS, `auth.uid()`, profilens huvudman/roll och databasens triggers avgör datavägarna i `supabase/migrations/20260905120000_huvudman.sql`, `supabase/migrations/20260905170000_timplan_lasar.sql` och uppdragsreglerna i `supabase/migrations/20260908170000_principal_teacher_assignments.sql`.
- `loadOrganisation()`, `loadTimplans()` och `loadSchoolYears()` kan skapa exempeldata när relevanta data saknas, genom `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`. Dessa funktioner är därför inte alltid enbart läsande.
- Utan backend använder organisationsvyn React-tillstånd med exempeldata. Grundskoleexemplet väljer också denna väg via `groundExample` i `web/app/organisation-workspace.tsx`.
- Elever, individuella studieplaner, undervisningsgrupper och schema ligger i `AdminState` från `web/lib/admin-model.ts` och hålls i `web/app/page.tsx`. Någon motsvarande elevregistertabell finns inte i `supabase/migrations/`.

**File Storage:**
- `supabase/migrations/20260905120000_huvudman.sql` definierar den privata Storage-bucketen `tillstand`, PDF som tillåten filtyp och en gräns på 20 MiB. Policyerna använder huvudmannens id som första mappsegment; detta är deklarerade migrationsregler.
- Appens `savePermit()` i `web/lib/organisation-store.ts` sparar filnamn, storlek och typ. Någon uppladdning av filinnehåll, signerad nedladdningslänk eller `.storage`-användning finns inte i det flödet.
- `web/.openai/hosting.json` konfigurerar ingen R2-bucket; R2-stödet i `web/vite.config.ts` är villkorat och saknar aktiv bindning i filen.
- `web/lib/syllabus-snapshot.ts` är en lokal, genererad referensfil, skapad av `web/scripts/fetch-syllabus.mjs`.

**Caching:**
- `web/lib/syllabus.ts` bygger ett `Map`-index över `web/lib/syllabus-snapshot.ts`; referensdata ligger i applikationens bundle.
- `web/lib/supabase.ts` återanvänder en klientinstans och aktiverar sessionslagring/automatisk tokenförnyelse. Detta är ingen cache över verksamhetsdata.
- `web/app/organisation-workspace.tsx` håller skolunderlag, timplaner, läsår och registerförhandsvisningar i React-tillstånd och läser om databasen efter skrivningar. Ingen Redis-, KV- eller TanStack Query-cache är konfigurerad i `web/package.json`.
- `web/app/api/skolenhet/route.ts` saknar uttrycklig cache, TTL och återförsök för registeranropen. Extern CDN-cachepolicy går inte att fastställa ur rutten.
- `web/components/ui/sidebar.tsx` skriver en cookie för sidomenyns tillstånd; den är en gränssnittsinställning, inte autentiseringsbevis.

## Authentication & Identity

**Auth Provider:**
- Supabase Auth via `web/lib/supabase.ts`.
  - Implementation: `signInDemo()` läser befintlig session, använder `signInAnonymously()` om session saknas och anropar sedan `bootstrap_demo_profile`.
  - `bootstrap_demo_profile` i `supabase/migrations/20260905130000_demo_bootstrap.sql` knyter en ny profil till samma demohuvudman och ger rollen `huvudman`; RPC:n kräver en autentiserad Supabase-session.
  - `persistSession: true` och `autoRefreshToken: true` är satta på klienten i `web/lib/supabase.ts`.
- `supabase/config.toml` tillåter lokalt anonym inloggning. Samma inställning i det anslutna molnprojektet är inte verifierad.
- Rollväljaren i `web/app/page.tsx` styr klientens navigering och domänåtgärder; den ändrar inte Supabase-profilen. Serverbehörighet hämtas av `current_app_role()` från `profiles` i `supabase/migrations/20260905120000_huvudman.sql`.
- Skolfederation, SAML/OIDC, BankID och kundanknuten kontoprovisionering är inte implementerade i `web/lib/supabase.ts` eller `web/app/api/`. `AGENTS.md` anger att demoinloggningen inte är tillåten för verkliga elevuppgifter eller pilotens skyddade driftvägar.
- `assignments` och `assignment_units` lagrar lokala uppdrag. SQL-schemat har en valfri `assignments.profile_id → profiles.id → auth.users.id` i `supabase/migrations/20260905120000_huvudman.sql`. Demoseedningen sätter inte `profile_id`, och modellmappningen tar inte med fältet i `web/lib/organisation-store.ts`. Tolka därför inte ett registrerat rektorsnamn som en verifierad inloggningsidentitet.

## Monitoring & Observability

**Error Tracking:**
- Ingen extern felinsamling, Sentry-, OpenTelemetry- eller motsvarande klient är konfigurerad i `web/package.json`, `web/lib/supabase.ts` eller `web/vite.config.ts`.
- Datalagren översätter många SDK-fel till svenska `Error`-meddelanden i `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`; vyerna visar felen från lokalt tillstånd i `web/app/organisation-workspace.tsx`.
- Registerrutten returnerar strukturerade JSON-fel med HTTP 400, 404 eller 502 i `web/app/api/skolenhet/route.ts`.

**Logs:**
- Verksamhetshändelser sparas i `organisation_events`, `point_plan_events`, `timplan_events` och `school_year_events` från `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`; schema finns i `supabase/migrations/20260905120000_huvudman.sql` och `supabase/migrations/20260905170000_timplan_lasar.sql`.
- Händelserna innehåller bland annat aktör, roll, handling, kommentar och tid. De är verksamhetshistorik; någon extern revisions- eller säkerhetsloggexport finns inte i `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`.
- `work/supabase/verify*.mjs` och `work/supabase/reset.mjs` skriver konsolutdata. `web/scripts/fetch-syllabus.mjs` skriver framsteg till stderr.
- Wrangler-loggar och Miniflare-register styrs till projektlokala kataloger via `web/vite.config.ts`; `web/scripts/phone-preview.mjs` håller dessutom en begränsad diagnostikbuffert för sin underprocess.
- Lokal Supabase Analytics är aktiverad i `supabase/config.toml`; detta visar inte att en övervakningsintegration används av appen eller i fjärrdriften.

## CI/CD & Deployment

**Hosting:**
- `web/vite.config.ts` använder Vinext, `@openai/sites-vite-plugin` och `@cloudflare/vite-plugin`; serverns entry point är `vinext/server/fetch-handler` med `nodejs_compat`.
- D1 och R2 är `null` i `web/.openai/hosting.json`. När de saknas bygger `web/vite.config.ts` tomma bindningslistor. Supabase-lagret ligger separat i `web/lib/supabase.ts`.
- `npm run build` bygger appen och `npm run start` startar lokal Wrangler mot `dist/server/wrangler.json` enligt `web/package.json`. Startkommandot bevisar inte att webbplatsen är publicerad.
- `web/scripts/phone-preview.mjs` startar en lokal Wrangler-process och en proxy för telefonförhandsvisning; detta är ett lokalt utvecklingsflöde.
- Aktiv publiceringsadress, driftsregion, kontoinställningar och tillämpade SQL-migrationer går inte att verifiera från `web/vite.config.ts`, `web/.openai/hosting.json` eller `supabase/config.toml`.

**CI Pipeline:**
- Ingen pipeline är upptäckt under `.github/`; `web/package.json` innehåller lokala `dev`, `build`, `start`, `lint`, `format` och `phone`, men inget `deploy`- eller CI-script.
- Kontroller anges i `AGENTS.md` och testkod finns i `web/lib/*.test.mjs`. Skripten under `work/supabase/` anropar databasen som miljövariablerna pekar ut; deras existens är inget aktuellt verifieringsresultat för en kommunanslutning.

## Environment Configuration

**Required env vars:**

| Variabel | Funktion | Kodankare |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase-endpoint; behövs för backend-läget. | `web/lib/supabase.ts`, `work/supabase/verify.mjs` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Publik klientnyckel; används tillsammans med session och RLS. | `web/lib/supabase.ts`, `work/supabase/verify.mjs` |
| `CODEX_SANDBOX` | Valfri styrning av filbevakning under Seatbelt. | `web/vite.config.ts` |
| `WRANGLER_WRITE_LOGS` | Valfri lokal loggstyrning. | `web/vite.config.ts`, `web/scripts/phone-preview.mjs` |
| `WRANGLER_LOG_PATH` | Lokal loggkatalog. | `web/vite.config.ts` |
| `MINIFLARE_REGISTRY_PATH` | Lokal katalog för Miniflare-registret. | `web/vite.config.ts` |
| `WRANGLER_SEND_METRICS` | Styrs i telefonförhandsvisningens underprocess. | `web/scripts/phone-preview.mjs` |

- Endast de två Supabase-variablerna krävs för databasläget. Utan dem kan appen visa sessionsbundna exempeldata enligt `web/lib/supabase.ts` och `web/app/organisation-workspace.tsx`.
- Skolverket-rutten och katalogskriptet kräver inga API-nycklar i `web/app/api/skolenhet/route.ts` och `web/scripts/fetch-syllabus.mjs`.

**Secrets location:**
- `web/.env.local` finns; endast existensen är konstaterad. Inga miljövärden har lästs eller kopierats till kartläggningen.
- `.gitignore` och `web/.gitignore` ignorerar miljöfiler, privata nycklar och lokala runtime-utdata. Hantera konfigurationen enligt `AGENTS.md`.
- Något service-rollsanrop finns inte i `web/lib/supabase.ts` eller `work/supabase/verify.mjs`; kontrollskriptet använder samma publika klientväg och demoinloggning som appen.

## Webhooks & Callbacks

**Incoming:**
- Inga webhook-mottagare, IdP-callbacks eller bakgrundsjobb är upptäckta i `web/app/api/`. Den befintliga rutten `web/app/api/skolenhet/route.ts` exporterar endast `GET` för registeruppslag.
- `supabase/migrations/` definierar databasfunktioner och triggers, men ingen mottagare för externa verksamhetshändelser.

**Outgoing:**
- Inga utgående webhooks, mejl-/SMS-utsändningar eller meddelandeköer är implementerade i `web/lib/`, `web/app/api/` eller `web/package.json`.
- Upptäckt nättrafik i appens integrationskod är register-GET i `web/app/api/skolenhet/route.ts` och Supabase SDK-anrop i `web/lib/organisation-store.ts`, `web/lib/planning-store.ts` och `web/lib/cohort-store.ts`. Det separata katalogskriptet anropar Syllabus via `web/scripts/fetch-syllabus.mjs`.

---

*Integration audit: 2026-09-11*
