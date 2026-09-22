# Skolplattformen

En lokal arbetsversion med elevregister, studieplaner, undervisningsgrupper, schemaadministration och timplaner för huvudman och rektor, samt lärarens dag, undervisning, återkoppling och ärenden. Utvecklingen har inletts; detta är inte en färdig eller driftklar skolplattform.

## Aktiv projektplanering

GSD-initieringen slutfördes den 11 september 2026 när användaren godkände kraven och färdplanen för vidareutveckling av den befintliga appen. Första milstolpen är **säker administration inför en pilot**: verklig inloggning, uppdragsbaserad behörighet, beständigt elevregister och en kommunintegration. Projektkontext finns i [.planning/PROJECT.md](.planning/PROJECT.md), nulägeskartan i [.planning/codebase/](.planning/codebase/) och detaljerade krav i [.planning/REQUIREMENTS.md](.planning/REQUIREMENTS.md).

[Den godkända färdplanen](.planning/ROADMAP.md) har åtta faser och 42 krav. Fas 1–2 är verifierade med syntetiska data; fas 3 planeras. [Arbeta med GSD](docs/arbeta-med-gsd.md) beskriver arbetssättet; [STATE.md](.planning/STATE.md) anger aktuell status.

## Handbok med Docusaurus

Kör från projektroten `npm run docs:install` och sedan `npm run docs:dev`. Handboken finns på http://127.0.0.1:3003. `npm run docs:build` kontrollerar bygget och interna länkar; `npm run docs:serve` visar det byggda resultatet.

Redigera [handboken](docs/handbok/intro.md) i `docs/handbok/`. Konfigurationen finns i `docs-site/`. Handboken uppdateras tillsammans med funktionerna i GSD. Dokumentationen är lokal; extern publicering är inte konfigurerad.

## Källor och app

- `web/` – React/TypeScript-gränssnitt med Vinext, Base UI/Shadcn och Lucide.
- `docs/huvudman-design-research.md` – författningstext och myndighetsvägledning bakom huvudmannens och rektorns arbetsytor: skolenhet, tillstånd, poängplan, timplan, läsårets skoldagar och studieplan.
- `docs/admin-design-research.md` – primärkällor och designbeslut för administrationen.
- `docs/design-research.md` – research, källor, designbeslut och plan för användarprövning.
- `docs/produktunderlag/` – kopior av tidigare huvudtext, krav, acceptansscenarier och informationsmodell. Originalen ligger kvar oförändrade i den tidigare arbetsytan.
- `docs/oppna-api-skolverket.md` – beslutsunderlag för Skolverkets öppna API:er, med kontrollskript i `work/skolverket-api/`.
- `docs/backend-supabase.md` – backend i Supabase för huvudmannadelen: migrationer i `supabase/migrations/`, datalager i `web/lib/organisation-store.ts`, kontroll i `work/supabase/verify.mjs`. Skolenheter, utbildningar och planer är kopplade till gränssnittet med demoinloggning.
- `docs/kommunintegration-och-sakerhet.md` – arkitektur- och informationshanteringsförslag. Kompletterad research och rättsliga preciseringar finns i `.planning/research/`; dokumentförslag är inte genomförda skydd eller automatiskt beslutade krav.
- `docs/kommunintegration-och-sakerhet.md` – identitet, behörighet, kundisolering, integrationer, registret över allmänna handlingar och driftval.
- `docs/medicinska-uppdraget-och-kansliga-delar.md` – research om DF RESPONS, klassning av känsliga uppgifter och vad en modul för elevhälsans medicinska insats skulle kräva.
- `docs/byggstatus.md` – genomfört, verifierat och återstående.

## Köra lokalt

Använd Node 25 för appens skyddade fasgrind. För miljöval, lokal identitetsleverantör och skyddad start, följ [pilotens aktuella startanvisning](docs/pilot/account-access.md).

```sh
cd web
npm install
npm run dev:example
```

Om datorn har en global libvips-installation som stör sharp: `SHARP_IGNORE_GLOBAL_LIBVIPS=1 npm install`.

Kontroller:

```sh
npx tsc --noEmit
npx oxlint app lib
node --test lib/*.test.mjs
npm run build
```

Den byggda versionen kan köras lokalt med `npm run start -- --port 3001`. Servern läser in bygget vid start: efter ett nytt `npm run build` behöver `npm run start` eller `npm run phone` startas om, annars visas den gamla versionen.

Ämnes- och nivåkatalogen hämtas från Skolverkets Syllabus-API och versioneras i projektet som en daterad ögonblicksbild. Hämta om den med:

```sh
cd web
node scripts/fetch-syllabus.mjs
```

## Omfattning

Följande beskrivning är historik från arbetsversionen före fas 1. Den beskriver inte dagens skyddade datavägar. Aktuella användarflöden och begränsningar beskrivs i [handboken](docs/handbok/intro.md) och [pilotens kontoåtkomst](docs/pilot/account-access.md).

Appen har fyra exempelroller som växlas i sidomenyns fot: huvudman, rektor, administratör och lärare. Rollerna styr arbetsflödena, men databasens demoinloggning ger fortfarande huvudmannarollen. Huvudmannen kan ha flera skolenheter och lägga till nya ur Skolverkets Skolenhetsregister med organisationsnummer eller skolenhetskod via appens egen läsväg `/api/skolenhet`; adress och skolform hämtas och registrets program blir förslag till utbildningar. Skolgrund och utbildningar sparas i Supabase när backend är konfigurerad. Huvudmannen utser rektor och rektorns arbetsflöde tilldelar läraruppdrag; fullständig kontroll av den inloggades skoluppdrag återstår.

Rektorn planerar läsårets skoldagar i vyn Läsår & skoldagar: en årskalender med veckorader där ett förslag räknas fram ur allmänna helgdagar och vanliga lov. Ett klick sätter dagen till valt slag, skift-klick markerar ett intervall och kommando- eller ctrl-klick markerar flera dagar; markeringen ändras med högerklick eller med knapparna under kalendern. Skoldagarna behöver inte vara lika för alla: varje årskurs och klass kan sakna undervisning enskilda dagar med angiven orsak, en klass ärver sin årskurs avvikelser, och en grupp i årskurs 1 eller 2 kan läsa fyra dagar i veckan om skälen anges. Antalet skoldagar, lovdagar och studiedagar prövas mot Skolförordningen och Gymnasieförordningen, och skoldagarna används för att räkna om timplanens timmar till minuter per vecka och timmar per skoldag samt för att räkna hur mycket undervisning schemats veckopass lägger ut under läsåret.

Huvudmannens grund, timplanerna och läsåren sparas i en Supabase-databas och överlever omladdning; elevregistret ligger kvar i sessionen. Utan databasnycklar kör appen vidare på sessionsdata.

Alla elevexempel är syntetiska. Elevändringar, gruppmedlemskap, schemapass, pedagogiska utkast, respons, lektionsupplägg och ärendestatus finns i minnet under aktuell session och återställs vid omladdning. Ingen kommunal identitets-/elevregisteranslutning eller verkligt utskick ingår. Navigationen växlar vy inom samma sida; delbara undersidesadresser och webbläsarhistorik är ett senare byggsteg.

Inga delar är publicerade externt. Arbetet fortsätter i den lokala projektytan.

## Öppna från telefonen

Anvisningen nedan avser den äldre förhandsvisningen. Skyddad telefonåtkomst med lokal identitetsleverantör är ännu inte verifierad på fysisk telefon; WebKit i telefonstorlek är provat separat. Följ aktuell pilotanvisning innan nätverksåtkomst öppnas.

Anslut telefonen och datorn till samma wifi. Kör `npm run phone` i `web/` efter ett lyckat bygge. Öppna den nätverksadress som skrivs ut, med port 3002. Datorn måste vara vaken och processen igång.

Telefonförhandsvisningen visar samma app som datorn. Den separata nätverksingången släpper igenom appens läsningar men håller utvecklingsverktygets administrationssidor lokala. Utkast och respons ändras i telefonens egen session och synkroniseras inte till datorn. Ingen routerinställning eller extern publicering behövs.
