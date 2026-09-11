# Architecture

**Analysis Date:** 2026-09-11

## Pattern Overview

**Overall:** Klientcentrerad React-app med domänmodeller, separata Supabase-datalager och SQL-regler. Vinext kör App Router-strukturen genom Vite. Se `web/vite.config.ts`, `web/app/page.tsx`, `web/lib/organisation-store.ts` och `supabase/migrations/`.

**Key Characteristics:**
- Arbetsytorna delar URL `/`. Huvudnavigationen och exempelrollen väljs med React-tillstånd i `web/app/page.tsx`; arbetsytornas filnamn är inte separata sidrutter.
- Modellerna i `web/lib/*-model.ts` validerar ändringar och returnerar nya tillstånd. UI och databasadaptrar anropar modellerna; modellerna importerar inte React eller Supabase.
- Organisation, utbildningar, planer, läsår och klasskopplingar har beständiga datavägar. Elevadministration, individuella studieplaner och schemaslots ligger i sidans minne. Se `web/app/page.tsx`, `web/app/organisation-workspace.tsx` och `web/lib/*-store.ts`.
- Webbläsaren skriver direkt till Supabase-tabeller eller SQL-funktioner. Något generellt serverlager för administrationskommandon finns inte; enda API-routen är `web/app/api/skolenhet/route.ts`.
- `web/lib/supabase.ts` och `supabase/migrations/20260905130000_demo_bootstrap.sql` implementerar gemensam demoåtkomst. Gränssnittets rollval och databasens profilroll är separata värden.
- Kartan beskriver implementationen i `web/` och `supabase/migrations/`. `.planning/research/ARCHITECTURE.md` ska inte användas som belägg för implementerade datavägar. Driftsatta migrationer och aktuell extern miljö har inte kontrollerats vid denna källkartläggning.

## Layers

**Applikationsram och navigation:**
- Purpose: Montera arbetsytorna, välja exempelroll och dela administrationens exempeldata.
- Location: `web/app/layout.tsx`, `web/app/page.tsx`.
- Contains: Metadata, typsnitt, CSS, sidomeny, `View`, `roleNavigation`, dialoger och `AdminState`.
- Depends on: Arbetsytorna i `web/app/`, modellerna i `web/lib/` och UI-primitiver i `web/components/ui/`.
- Used by: Rotadressen `/` genom Vinext-konfigurationen i `web/vite.config.ts`.

**Verksamhetsvyer och samordning:**
- Purpose: Visa formulär och arbetsflöden samt anropa modeller och datalager.
- Location: `web/app/organisation-workspace.tsx`, `web/app/admin-workspace.tsx`, `web/app/timplan-view.tsx`, `web/app/lasar-view.tsx`, `web/app/timplan-classes.tsx`, `web/app/workspace-views.tsx`.
- Contains: Urval, formulärutkast, laddning, felmeddelanden och återläsning efter skrivning. `OrganisationWorkspace` samordnar de beständiga domänerna.
- Depends on: Funktioner och typer i `web/lib/`, grundkomponenter i `web/components/ui/`.
- Used by: `web/app/page.tsx`; timplans-, läsårs- och klassvyerna används av `web/app/organisation-workspace.tsx`.

**Domänmodell och beräkningar:**
- Purpose: Hålla regler, beslutsflöden, härledningar och kontrollresultat oberoende av UI och databas.
- Location: `web/lib/organisation-model.ts`, `web/lib/admin-model.ts`, `web/lib/timplan-model.ts`, `web/lib/lasar-model.ts`, `web/lib/cohort-model.ts`, `web/lib/school-model.ts`.
- Contains: Organisation, utbud, studieplansutkast, grupp-/schemakonflikter, timfördelning, kalender och kullkopiering. `create*State` skapar syntetiska startdata.
- Depends on: Andra domänmodeller där en härledning behövs, `web/lib/syllabus.ts` och `web/lib/common.ts`.
- Used by: Vyer, datalagrets typmappning och `web/lib/*.test.mjs`.
- Pattern: Lägg ändringsregler i modellen och låt vyn skicka tillstånd och indata samt hantera resultat eller kastat fel.

**Datalager och typmappning:**
- Purpose: Översätta modellobjekt till databasrader och utföra nätverksanrop.
- Location: `web/lib/organisation-store.ts`, `web/lib/planning-store.ts`, `web/lib/cohort-store.ts`, `web/lib/supabase.ts`, `web/lib/database.types.ts`.
- Contains: `loadOrganisation`, `save*`, `loadTimplans`, `persistTimplans`, `loadSchoolYears`, `persistSchoolYears` och RPC-anrop.
- Depends on: `@supabase/supabase-js`, databastyperna och modellerna i `web/lib/`.
- Used by: `web/app/organisation-workspace.tsx` och uttryckliga databasverktyg i `work/supabase/`.
- Pattern: Håll `snake_case`, databas-ID:n och statusöversättning här. Exempelvis översätter `web/lib/planning-store.ts` mellan modellens `fastställd` och databasens `faststalld`.

**Databasregler och transaktioner:**
- Purpose: Lagra organisationens uppgifter och kontrollera relationer, åtkomst och vissa beslutslås.
- Location: `supabase/migrations/20260905120000_huvudman.sql`, `supabase/migrations/20260905170000_timplan_lasar.sql`, `supabase/migrations/20260908120000_cohorts_classes.sql`, `supabase/migrations/20260908150000_school_import.sql`, `supabase/migrations/20260908170000_principal_teacher_assignments.sql`.
- Contains: Tabeller, främmande nycklar, unika index, radnivåskydd, triggers och SQL-funktioner.
- Depends on: `auth.uid()`, profilkopplingen och funktionerna `current_organizer_id()` och `current_app_role()`.
- Used by: Direkta tabellanrop och RPC från `web/lib/*-store.ts`.
- Pattern: Kontrollera faktisk SQL-behörighet separat från modellens exempelroll. Rektorspolicyerna för läraruppdrag i `supabase/migrations/20260908170000_principal_teacher_assignments.sql` avgränsar till samma huvudman, inte rektorns personliga skolenhetsuppdrag.

**Extern referensdata:**
- Purpose: Hämta skoluppgifter och slå upp nationella program, ämnen, kurser och nivåer.
- Location: `web/app/api/skolenhet/route.ts`, `web/lib/registry-address.ts`, `web/lib/syllabus.ts`, `web/lib/syllabus-snapshot.ts`, `web/scripts/fetch-syllabus.mjs`.
- Contains: Registerproxy, adressnormalisering och lokal katalogögonblicksbild.
- Depends on: Serverns `fetch` för registeruppslag och uppdateringsskriptets `fetch` för katalogdata.
- Used by: Organisationsvyn samt organisations-, administrations- och timplansmodellerna.
- Pattern: Referensdata är skild från elever och uppdrag. `web/lib/syllabus.ts` gör inget nätanrop när ett ämne visas.

## Data Flow

**Start och demoinloggning:**

1. `web/app/layout.tsx` sätter svensk dokumentrot, typsnitt och CSS. `web/app/page.tsx` monterar arbetsytorna och skapar `AdminState` med `createAdminState()`.
2. `web/app/organisation-workspace.tsx` beräknar `backend = hasBackend && !groundExample`. Utan backend används modellernas exempeldata; med backend anropas `loadOrganisation(20)`.
3. `web/lib/organisation-store.ts` anropar `signInDemo()` i `web/lib/supabase.ts`, som återanvänder en session eller loggar in anonymt och anropar `bootstrap_demo_profile`.
4. `supabase/migrations/20260905130000_demo_bootstrap.sql` ger nya profiler rollen `huvudman` hos demohuvudmannen. För en befintlig profil uppdateras namnet. Rollväljaren i `web/app/page.tsx` ändrar inte profilen.
5. `web/lib/organisation-store.ts` läser organisationens tabeller. Saknas skolenheter seedar läsningen syntetiska uppgifter; `loadOrganisation()` är därmed inte en ren läsoperation.
6. `web/app/organisation-workspace.tsx` laddar timplaner, skolenhetens läsår och klasskopplingar. `web/lib/planning-store.ts` seedar första timplaner när inga finns och exempelläsår när en skolenhet saknar dem.

**Skoluppslag, import och rektor:**

1. `lookup()` i `web/app/organisation-workspace.tsx` anropar `/api/skolenhet`. Ett generationsnummer hindrar äldre svar från att ersätta ett nyare sökresultat.
2. `GET` i `web/app/api/skolenhet/route.ts` validerar `kod`, `kommun` eller `huvudman`, hämtar Skolverkets svar och reducerar det till skoluppgifter. `web/lib/registry-address.ts` normaliserar adressen.
3. `addUnitFromRegistry()` och vid behov `appointPrincipal()` i `web/lib/organisation-model.ts` prövar importen lokalt. Registerfältet `headMaster` är källuppgift; rektorsuppdrag hanteras separat.
4. `saveUnitFromRegistry()` i `web/lib/organisation-store.ts` anropar `import_school_unit`. Funktionen i `supabase/migrations/20260908150000_school_import.sql` sparar skola, skolformer, valfri rektor, registerunderlag och händelser i en transaktion.
5. `web/app/organisation-workspace.tsx` läser tillbaka organisationen och kan föreslå utbildningar utifrån programkoder. Utbildningarna sparas därefter med separata anrop och ingår inte i importtransaktionen.
6. Uppdatering av en befintlig skola använder `updateUnitFromRegistry()` i `web/lib/organisation-store.ts`, med separata skrivningar av skola, skolformer, registerunderlag och logg.

**Utbildning, poängplan och timplan:**

1. `Offering` i `web/lib/organisation-model.ts` hör till skolenhet och kull och innehåller program/inriktning, tillstånd och poängplansversioner.
2. `pointPlanBlocks()` och `specializationOptions()` kombinerar lokala val med program i `web/lib/syllabus.ts`. Nationella koder kommer från `web/lib/syllabus-snapshot.ts`.
3. `approvePointPlan()` prövar beslutet i `web/lib/organisation-model.ts`. `decidePointPlan()` i `web/lib/organisation-store.ts` ersätter föregående version, fastställer vald version och skriver historik genom flera anrop.
4. `deriveEducations()` i `web/lib/timplan-model.ts` skapar rader och kolumner. Gymnasiet kräver en fastställd poängplan; grundskolan använder årskurser och introduktionsprogrammet en veckokolumn.
5. `web/app/timplan-view.tsx` anropar modellen via `apply`. `runTimplan()` i `web/app/organisation-workspace.tsx` visar resultatet direkt, anropar `persistTimplans()` och läser tillbaka uppgifterna.
6. `web/lib/planning-store.ts` skriver skillnaden mellan tillstånden som planrader, timmar och händelser. Triggers i `supabase/migrations/20260905170000_timplan_lasar.sql` skyddar celler i fastställda och ersatta timplaner.

**Kopiering till nästa elevkull:**

1. `copyCohort()` i `web/lib/cohort-model.ts` kontrollerar roll, målår och dubbletter samt bygger fristående kopior av utbildning, senaste ej ersatta poängplan och timplan.
2. `web/app/organisation-workspace.tsx` använder modellresultatet i sessionsläge eller `copyCohortInDatabase()` i `web/lib/cohort-store.ts` i databasläge.
3. `copy_offering_cohort()` i `supabase/migrations/20260908120000_cohorts_classes.sql` kopierar utbildning, planval, timmar och händelser transaktionellt. Nya planer är version 1 och utkast; tillstånd, beslutsdatum och elever ingår inte.
4. `web/app/organisation-workspace.tsx` laddar organisation och timplaner igen med databasens nya ID:n.

**Klasskoppling, läsår och undervisningstid:**

1. `deriveClasses()` i `web/lib/admin-model.ts` grupperar exemplelever efter klassnamn och härleder årskurs och kullår. `web/app/page.tsx` skickar klasser, grupper och schemaslots vidare som `ScheduleSource`.
2. `web/app/timplan-classes.tsx` tar klassnamn, läsårets startår och kolumn. `normalizeClassBinding()` i `web/lib/cohort-model.ts` kräver fastställd timplan och giltig kolumn.
3. `web/lib/cohort-store.ts` sparar `class_timplans`. Nyckeln är skolenhet, klassnamn och startår; `timplan_id` binder till en specifik version. SQL-triggern i `supabase/migrations/20260908120000_cohorts_classes.sql` kontrollerar skolenhet och kolumn.
4. `classesWithBindings()` i `web/lib/cohort-model.ts` låter explicita kopplingar överstyra härledning ur klassnamn för valt år. Kopplingen kräver inte en motsvarande post i sessionsregistret.
5. `web/app/lasar-view.tsx` använder `studentGroups()`, `groupYearDays()` och `groupSummary()` i `web/lib/lasar-model.ts` för grundkalender och avvikelser per årskurs och klass.
6. Vyn jämför timplanstimmar med skoldagar och inkommande exempelschema. Kalenderändringar går via `runLasar()` och `persistSchoolYears()` i `web/app/organisation-workspace.tsx` respektive `web/lib/planning-store.ts`.

**Elevadministration och pedagogik:**

1. `createAdminState()` i `web/lib/admin-model.ts` skapar syntetiska elever, grupper och schema. Den kan ta `AdminSource`, men `web/app/page.tsx` anropar den utan databasladdad organisation.
2. `web/app/admin-workspace.tsx` anropar bland annat `groupPreview()`, `applyGroup()`, `slotPreview()`, `applySlot()` och `savePlanDraft()` och uppdaterar sidans `setAdmin` via props.
3. Ändringslista och revision finns i `AdminState` i minnet. CSV-export skapas som lokal `Blob` i `web/app/admin-workspace.tsx`; ingen beständig elevskrivning görs.
4. `web/app/workspace-views.tsx` använder `web/lib/school-model.ts` och React-tillstånd för undervisning, återkoppling, schema och ärenden. Lärarens schema är separat från administrationens `AdminState.slots`.

**State Management:**

| Tillstånd | Ägare | Livslängd och lagring |
|---|---|---|
| Exempelroll, huvudvy och valt arbetsområde | `web/app/page.tsx` | Sidans minne; ingen URL-lagring |
| Elever, individuella planer, grupper, schemaslots och ändringar | `AdminState` i `web/app/page.tsx` | Sidans minne även med Supabase konfigurerat |
| Lektionsplan, arbetsområdesutkast och återkoppling | `web/app/page.tsx` | Sidans minne |
| Ärendetillstånd och lokala formulär | `web/app/workspace-views.tsx` | Komponentminne |
| Organisation och vald skolenhet | `org` i `web/app/organisation-workspace.tsx` | Organisationsdata i Supabase i backendläge; aktiv skolenhet är UI-tillstånd |
| Timplaner, läsår per skolenhet och klasskopplingar | `tp`, `lyByUnit`, `bindings` i `web/app/organisation-workspace.tsx` | Supabase i backendläge; minne i sessions-/grundskoleexempel |
| Inloggningssession | `web/lib/supabase.ts` | SDK:n använder `persistSession: true` och automatisk tokenförnyelse |
| Sidomenyns öppningsläge | `web/components/ui/sidebar.tsx` | Lokal UI-state samt skrivning av separat UI-cookie |

- Arbetsytorna på högsta nivån döljs med `hidden` och fortsätter vara monterade vid navigation i `web/app/page.tsx`.
- Timplans- och läsårsvyerna byts genom villkorliga returer i `web/app/organisation-workspace.tsx`. Lokala urval kan återställas vid avmontering medan förälderns domändata finns kvar.
- Grundskoleexemplet byter `key` på `OrganisationWorkspace` i `web/app/page.tsx`, skapar nytt komponenttillstånd och stänger av backend i `web/app/organisation-workspace.tsx`.
- Modellerna använder bland annat det fasta exempeldatumet i `web/lib/common.ts`; alla visade datum representerar inte dagens datum.

## Key Abstractions

**`OrganisationState` och `Offering`:**
- Purpose: Samla huvudman, skolenheter, uppdrag och utbildningar med beslut.
- Examples: `web/lib/organisation-model.ts`, `web/lib/organisation-store.ts`.
- Pattern: Relaterade rader hydreras till nästlade modellobjekt. Utbildningen avgränsas till skolenhet och kull; poängplansversioner hör till utbildningen.

**`Education` och `Timplan`:**
- Purpose: Skilja härledd ram med rader/kolumner från versionerade timvärden och beslut.
- Examples: `web/lib/timplan-model.ts`, `web/lib/planning-store.ts`, `web/app/timplan-view.tsx`.
- Pattern: `Education.id` motsvarar utbildningen. `Timplan.educationId` pekar dit; `cells` lagrar timmar per rad-ID och kolumnposition.

**`SchoolYear`, `StudentGroup` och `ClassTimplan`:**
- Purpose: Representera grundkalender, gruppavvikelser och klassens valda timplansversion.
- Examples: `web/lib/lasar-model.ts`, `web/lib/cohort-model.ts`, `web/app/lasar-view.tsx`.
- Pattern: Kombinera terminsgränser, helgdagar, skol- och gruppavvikelser samt förkortade veckor. Klasskopplingen gäller ett uttryckligt läsår.

**`SyllabusRef`:**
- Purpose: Hänvisa till nationell styrdokumentsversion från plan eller grupp.
- Examples: `web/lib/syllabus.ts`, `web/lib/admin-model.ts`.
- Pattern: Behåll ämneskod, valfri kurs-/nivåkod och version. Lokal modulidentitet är ett separat begrepp; lokalt innehåll kan sakna katalogreferens.

**Beständiga relationer:**

| Relation | Representation | Källfil |
|---|---|---|
| Användare → profil → huvudman | `profiles.id → auth.users.id`, `profiles.organizer_id → organizers.id` | `supabase/migrations/20260905120000_huvudman.sql` |
| Huvudman → skolenheter → utbildningar | `school_units`, `offerings.unit_id`; flera tabeller har även `organizer_id` | `supabase/migrations/20260905120000_huvudman.sql` |
| Uppdrag ↔ skolenheter | `assignments`, `assignment_units`; uppdragets `profile_id` är valfritt | `supabase/migrations/20260905120000_huvudman.sql` |
| Utbildning → tillstånd och poängplaner | `permits.offering_id`, `point_plans.offering_id`, `point_plan_events` | `supabase/migrations/20260905120000_huvudman.sql` |
| Utbildning → timplaner → timmar/händelser | `timplans.offering_id`, `timplan_cells`, `timplan_events` | `supabase/migrations/20260905170000_timplan_lasar.sql` |
| Skolenhet → läsår → avvikelser/händelser | `school_years` och dess dag-, gruppdag-, kortvecko- och händelsetabeller | `supabase/migrations/20260905170000_timplan_lasar.sql` |
| Klassnamn och läsår → timplansversion | `class_timplans`; ingen elev- eller klasstabell ligger bakom klassnamnet | `supabase/migrations/20260908120000_cohorts_classes.sql` |

## Entry Points

**Webbsida `/`:**
- Location: `web/app/page.tsx`, dokumentram i `web/app/layout.tsx`.
- Triggers: Sidbesök och klienthydrering genom `web/vite.config.ts`.
- Responsibilities: Skapa tillstånd, montera arbetsytor och samordna navigation.

**`GET /api/skolenhet`:**
- Location: `web/app/api/skolenhet/route.ts`.
- Triggers: Registeruppslag med `kod`, `kommun` eller `huvudman`.
- Responsibilities: Validera söknyckel och returnera reducerade skoluppgifter. Ingen databasimport eller användarautentisering görs i routen.

**Värdfunktion `open_teaching_area`:**
- Location: `useEffect` i `web/app/page.tsx`.
- Triggers: Valfri värdmiljö med `document.modelContext.registerTool`.
- Responsibilities: Validera kurs-ID mot fördefinierade arbetsområden och byta lokal vy med `flushSync`. Registreringen avbryts vid avmontering.

**Utvecklings- och databasverktyg:**
- Location: `web/package.json`, `web/scripts/fetch-syllabus.mjs`, `web/scripts/phone-preview.mjs`, `work/supabase/`.
- Triggers: Uttryckliga kommandon för utveckling, byggnad, kataloghämtning, telefonvisning eller verifiering.
- Responsibilities: Hantera sitt avgränsade verktygsflöde. Databasskripten ingår inte i sidans livscykel.

## Error Handling

**Strategy:** Modeller kastar `Error` med svenska meddelanden; vyer fångar dem och visar lokala fel. Datalagren översätter databasfel och följs ofta av återläsning. Se `web/lib/organisation-model.ts`, `web/lib/planning-store.ts` och `web/app/organisation-workspace.tsx`.

**Patterns:**
- Strukturerade avvikelser används för att visa flera problem samtidigt, exempelvis `pointPlanIssues()`, `timplanIssues()` och `allIssues()` i `web/lib/organisation-model.ts`, `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts`.
- `persist()` i `web/app/organisation-workspace.tsx` validerar, uppdaterar UI, skriver och laddar om. Vid skrivfel försöker den återläsa databasen och återställer tidigare lokalt tillstånd om även läsningen misslyckas.
- `runTimplan()` och `runLasar()` i `web/app/organisation-workspace.tsx` startar asynkron sparning efter lokal uppdatering. Deras booleska returvärde bekräftar modellens godkännande, inte färdig lagring.
- Import, kullkopiering och klasskoppling använder spärrar via `useRef` och vänteläge i `web/app/organisation-workspace.tsx` och `web/app/timplan-classes.tsx`.
- `web/app/api/skolenhet/route.ts` returnerar 400 vid ogiltig nyckel, 404 för saknad skola/huvudman och 502 för externa fel. Klienten kontrollerar HTTP-status och `payload.error`.
- Vanliga flerstegsskrivningar i `web/lib/organisation-store.ts` och `web/lib/planning-store.ts` delar ingen generell transaktion. Explicita transaktioner finns i `supabase/migrations/20260908120000_cohorts_classes.sql` och `supabase/migrations/20260908150000_school_import.sql`.

## Cross-Cutting Concerns

**Logging:** Organisation och planer har egna händelsetabeller genom `web/lib/organisation-store.ts` och `web/lib/planning-store.ts`. `AdminState.changes` i `web/lib/admin-model.ts` är lokal historik. Detta är verksamhetshistorik med delvis klientangivna roller och kommentarer, inte en generell serverstyrd säkerhetslogg.

**Validation:** Modellkontroller i `web/lib/*-model.ts` kompletteras av formatvalidering i `web/app/api/skolenhet/route.ts`, SQL-villkor, RLS och triggers i `supabase/migrations/`. Verifiera varje faktisk dataväg när en regel ändras; lagren kontrollerar inte automatiskt samma saker.

**Authentication:** `web/lib/supabase.ts` skapar en singleton-klient om publik URL och klientnyckel finns. `signInDemo()` och `supabase/migrations/20260905130000_demo_bootstrap.sql` ger demoåtkomst. Exempelrollen i `web/app/page.tsx` styr presentation och modellregler och bevisar inte en persons mandat.

**UI och responsivitet:** Återanvänd `web/components/ui/` och klassammanslagningen i `web/lib/utils.ts`. Verksamhetsytornas layout finns i `web/app/globals.css`; mobil sidomeny använder `web/hooks/use-mobile.ts`.

---

*Architecture analysis: 2026-09-11*
