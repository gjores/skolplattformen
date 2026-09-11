# Backend: Supabase för huvudmannadelen

5 september 2026. Huvudmannadelen ligger i molnprojektet `skolplattform-dev` (North EU, Stockholm) och gränssnittet läser och skriver mot den. Ingen lokal Supabase — all utveckling sker mot molnprojekt, och appen fortsätter köra som Cloudflare Worker (vinext).

## Läget

| Del | Status |
|---|---|
| Migrationer, tabeller, radnivåskydd | Körda mot `skolplattform-dev` |
| Exempelinloggning och demohuvudman | Körd |
| Datalager `web/lib/organisation-store.ts` | Byggt och verifierat |
| Genererade typer `web/lib/database.types.ts` | Genererade |
| Skolenheter, utbildningar, tillstånd, poängplaner i gränssnittet | Kopplade och prövade i webbläsaren |
| Uppladdning av tillståndsfiler | **Återstår** |
| Timplaner och läsår i gränssnittet | Kopplade och prövade i webbläsaren |
| Elevregister | **Återstår** (kör vidare på sessionsdata) |

## Varför Supabase passar just den här delen

Huvudmannadelen är beslut och register: skolenheter, uppdrag, utbildningar, tillstånd, poängplaner. Det är relationsdata med tydligt ägarskap (allt hör till en huvudman), få skrivare (huvudman, rektor) och krav på spårbarhet. Postgres med radnivåskydd, versionerade rader och en händelselogg täcker det utan egen API-server. Fillagring för tillståndsbeslut och autentisering ingår.

Det som *inte* ska in i Supabase i första steget: elevregistret. Elever är personuppgifter med särskilda krav (SS 12000, sekretess, gallring); den delen behöver ett eget beslut om originalkälla och avtal innan lagring, se `docs/produktunderlag/12`.

## Arkitektur

```
Webbläsare (React)  ──supabase-js + användarens JWT──►  Supabase (Postgres + RLS, Auth, Storage)
        │
        └──fetch /api/skolenhet──►  Cloudflare Worker  ──►  Skolverkets Skolenhetsregister (ingen CORS)
```

- **Läsning och skrivning av huvudmannadata** går direkt från webbläsaren till Supabase med användarens token. Radnivåskyddet i databasen är behörighetsmodellen; det finns ingen andra kopia av reglerna i en API-server.
- **Skolenhetsregistret** hämtas fortsatt via appens läsväg i workern (registret saknar CORS). Svaret sparas oförändrat i `registry_snapshots` som proveniens när huvudmannen tar in en skolenhet.
- **Katalogen från Syllabus-API:et** ligger kvar som ögonblicksbild i appen. Poängplaner sparar bara koder plus vilket katalogdatum de kom ur (`catalog_fetched`).
- **Tillståndsfiler** läggs i en privat bucket `tillstand`, sökväg `<huvudman>/<utbildning>/<fil>`, med samma radnivåskydd. Tabellen bär filens namn, storlek och typ; själva uppladdningen är inte byggd än.

## Datamodell

Migrationen [`supabase/migrations/20260905120000_huvudman.sql`](../supabase/migrations/20260905120000_huvudman.sql) speglar `web/lib/organisation-model.ts`:

| Tabell | Motsvarar | Anmärkning |
|---|---|---|
| `organizers` | `Organizer` | Organisationsnummer unikt |
| `profiles` | inloggad användare | Roll + huvudman; grunden för RLS |
| `school_units`, `school_unit_types` | `SchoolUnit`, `SchoolType` | Skolenhetskod unik per huvudman; årskurser sätts av huvudmannen |
| `registry_snapshots` | — | Registrets råsvar vid hämtning |
| `assignments`, `assignment_units` | `Assignment` | Rektor ≥ 1 skolenhet, lärare flera; elever ligger inte här |
| `offerings` | `Offering` | Studieväg med lokalt namn och kod |
| `permits` | `Permit` | Fil i bucket, metadata i raden |
| `point_plans`, `point_plan_events` | `PointPlan` | Högst ett utkast och en fastställd per utbildning (partiella unika index); fastställd rad kan inte ändras (trigger) |
| `organisation_events` | `log` | Huvudmannens händelselogg |

Timplaner och läsår ligger i migrationen [`20260905170000_timplan_lasar.sql`](../supabase/migrations/20260905170000_timplan_lasar.sql):

| Tabell | Motsvarar | Anmärkning |
|---|---|---|
| `timplans`, `timplan_cells`, `timplan_events` | `Timplan` | Timmarna ligger som en rad per ämne med kolumnordningens värden. Högst en öppen och en fastställd version per utbildning; en fastställd timplans celler är låsta av en trigger |
| `school_years`, `school_year_days` | `SchoolYear` | Ett läsår per skolenhet och startår. Bara avvikelserna lagras: varje annan vardag inom en termin är skoldag. Terminernas ordning och kalenderår prövas av villkor i tabellen |
| `school_year_group_days` | `groupExceptions` | Skoldagar då en årskurs eller klass saknar undervisning. Orsaken `annat` kräver anteckning |
| `school_year_short_weeks` | `shortWeeks` | Fyra skoldagar i veckan; `column_id` begränsas till `ak1` och `ak2` (Skolförordningen 3 kap. 4 § andra stycket) |
| `school_year_events` | läsårets historik | Samma mönster som poängplanens händelser |

Årskurser och klasser är inte egna tabeller. Årskursen kommer ur timplanens kolumner och klassen ur elevregistret, som inte ligger i databasen. Gruppens nyckel är därför en text (`utbildningsid:kolumn` eller `klass:namn`) och inte en främmande nyckel. Det databasen ändå kan skydda skyddas: en förkortad vecka bär årskursen, så villkoret om årskurs 1 och 2 prövas i tabellen.

## Behörighet

- Radnivåskydd på varje tabell. Läsning: den egna huvudmannen. Skrivning i grunden (skolenheter, uppdrag, utbildningar, tillstånd): rollen huvudman. Poängplansutkast: huvudman och rektor; status fastställd/ersatt: bara huvudman.
- Rollen ligger i `profiles.role` och sätts av huvudmannen tills verklig identitet finns. Nästa steg är Skolfederation (SAML), som Supabase Auth stöder på Pro-planen.
- **Förhandsversionens inloggning är en demokonstruktion.** Migrationen `20260905130000_demo_bootstrap.sql` loggar in varje besökare anonymt och knyter dem till samma demohuvudman med rollen huvudman, så att ändringar blir gemensamma i stället för sessionsbundna. Det betyder att var och en med anon-nyckeln kan skriva i demoprojektet. Det är avsiktligt för syntetiska exempeldata i ett utvecklingsprojekt, och migrationen ska tas bort innan produktion.
- Rektorns "sina skolenheter" härleds ur `assignment_units`; en senare policy kan begränsa rektorns läsning till dem.
- Servicerollen används inte från appen alls.

## Region, plan och ansvar

- Region **North EU (Stockholm)** för dataresidens.
- Free-planen räcker för att bygga; **Pro** behövs för dagliga säkerhetskopior, SAML och pausfria projekt. Personuppgiftsbiträdesavtal tecknas med Supabase innan verkliga uppgifter läggs in.
- Ett projekt per miljö (`skolplattform-dev`, senare `skolplattform-prod`), migrationer i repot, aldrig ändringar i dashboardens SQL-editor utan migration.

## Så här kopplas appen

- `web/lib/supabase.ts` skapar klienten bara när `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` finns; `hasBackend` säger om backend är på.
- `web/lib/planning-store.ts` gör samma sak för timplaner och läsår, men skillnadsbaserat: vyn räknar fram ett nytt tillstånd med modellen, och `persistTimplans` respektive `persistSchoolYears` jämför med det förra och skriver bara det som ändrats. Att måla en hel vecka blir därför en handfull rader, inte en skrivning per klick. `loadTimplans` och `loadSchoolYears` seedar exempeldata i en tom databas på samma sätt som huvudmannens grund.
- `web/lib/organisation-store.ts` översätter mellan modellens typer och tabellraderna: `loadOrganisation` läser hela huvudmannens grund (och seedar exempeldata i en tom databas), `saveUnitFromRegistry`, `saveGrades`, `deleteUnit`, `saveOffering`, `updateOfferingRow`, `deleteOffering`, `savePermit`, `deletePermit` och `saveAssignmentUnit` skriver.
- Modellens kontroller (tillståndsstatus, poängsummor, fördjupningslista) körs kvar i klienten. Databasen skyddar invarianterna: unika index, triggers och radnivåskydd.
- `OrganisationWorkspace` laddar tillståndet med `loadOrganisation` när `hasBackend` är sant och visar ett laddningsläge under tiden. Varje bestående ändring går genom hjälparen `persist`: modellen prövar den, gränssnittet visar den direkt, databasen skriver den, och resultatet läses tillbaka. Misslyckas skrivningen visas felet och tillståndet läses om från databasen, så att gränssnittet aldrig visar något som inte står där.
- Textfälten för en utbildning uppdateras medan man skriver men sparas när fältet lämnas, så att varje tangenttryckning inte blir en skrivning.
- Utan `.env.local` fungerar appen precis som förut, på sessionsdata, inklusive timplaner och läsår.

## Arbeta med databasen

Projektet är länkat (`supabase/.temp/project-ref`). Efter en ny migration:

```sh
supabase db push
supabase gen types typescript --linked > web/lib/database.types.ts
```

Adress och anon-nyckel ligger i `web/.env.local` som `NEXT_PUBLIC_SUPABASE_URL` och `NEXT_PUBLIC_SUPABASE_ANON_KEY` (ignorerad av git; vinext inlinar `NEXT_PUBLIC_*` i klienten). Utan dem kör appen vidare på sessionsdata.

## Kontroll

`work/supabase/verify.mjs` går samma väg som appen ska gå: exempelinloggning, laddning av huvudmannens grund, seedning av exempeldata i tom databas, och prövning av att databasen stoppar det som ska stoppas.

```sh
node --env-file=web/.env.local work/supabase/verify.mjs
```

Trettionio kontroller, alla passerar den 5 september 2026, och kontrollen kan köras om utan att bero på eller störa demodatan: timplansdelen utgår från den öppna version som finns, och läsårsdelen lägger upp ett eget kontrolläsår som tas bort efteråt. Tjugotre av dem gäller timplaner och läsår: att timplanerna seedas och läses tillbaka med sina timmar, att en ändrad cell sparas, att flödet förslag → fastställd fungerar och att en fastställd timplans timmar sedan är låsta, att läsåren seedas per skolenhet med sina lov- och studiedagar och gruppernas avvikande lärotider, samt att databasen stoppar orsaken `annat` utan anteckning, fyra dagar i veckan utanför årskurs 1 och 2, terminer i fel ordning och ändring av ett fastställt läsårs dagar. Utöver dem är hela vägen prövad i webbläsaren mot den byggda appen: sök upp en skolenhet i registret, lägg till den, bekräfta utbildningarna ur registrets program, ladda om sidan och se att allt finns kvar. Bland dem: skolenhetskod måste vara åtta siffror, samma kod kan inte läggas upp två gånger, skrivning till en annan huvudman stoppas av radnivåskyddet, en fastställd poängplan kan inte ändras, högst ett utkast per utbildning, och hela vägen lägg till skolenhet ur registret → läs tillbaka → ta bort. Kontrollen använder anon-nyckeln, aldrig servicerollen.

`work/supabase/reset.mjs` tömmer demohuvudmannens data så att exempeldata kan seedas om.

Två saker som radnivåskyddet visade under bygget och som fick styra utformningen: en fastställd poängplan kan inte läggas in direkt utan uppstår genom att huvudmannen fastställer ett utkast, och en händelse måste ha den inloggade som `actor`. Seedningen går därför samma väg som gränssnittet, och städar efter sig om den avbryts.

## Nästa steg

1. Koppla Skolenheter och Utbildningar i gränssnittet till datalagret bakom flaggan `hasBackend`, med laddnings- och feltillstånd.
2. Ladda upp tillståndsfiler till bucketen och visa dem med tidsbegränsade länkar.
3. Elevregistret, efter beslut om originalkälla och avtal (SS 12000).
4. Riktig inloggning innan något annat än syntetiska exempel läggs in.

## Vad som återstår att bestämma

- Hur en huvudman skapas första gången i verklig drift (självregistrering mot organisationsnummer i registret, eller inbjudan). I förhandsversionen finns bara demohuvudmannen.
- Om appen ska läsa från databasen så snart nyckeln finns, eller bakom ett synligt val i gränssnittet. Det avgör om förhandsversionen visar gemensam eller sessionsbunden data.
- Om rektorns läsning ska begränsas till egna skolenheter redan nu eller när verklig identitet finns.
- Gallring av `registry_snapshots` och händelseloggar.
