---
date: 2026-10-15
phase: 05
requirements: [ADMIN-03, ADMIN-04, PLANERING-04]
status: research_complete_proposal
implementation: not_started
---

# Klasser, elevkullar och planversioner

## Beställning och slutsats

Användaren observerar att tidigare läsår går att välja vid klasskoppling och vill utreda ett tidigare klassval när en programplan skapas: välj befintliga klasser eller skapa nya när kullen saknar klasser. Detta är ett researchuppdrag och en föreslagen riktning, inte ett beslut om automatisk klassbildning eller utökade huvudmannamandat.

**Rekommendation:** lägg ett valbart steg **Klasser för utbildningen** efter att skola, utbildning/kull och startdatum är bestämda. Erbjud **Välj befintliga**, **Skapa tomma klasser** och **Gör senare**. Klassen hör till utbildningen/kullen, inte till varje programplansversion. Behåll en separat, uttrycklig koppling till fastställd timplansversion och läsår. Tomt sökresultat ska inte i sig skapa en klass.

## Vad bilden och nuläget faktiskt visar

ROOT läste endast den timplan/skola/utbildning som finns i användarens angivna URL, utan elevuppgifter eller skrivningar. Version 3 är fastställd, fryst startdatum **2027-08-01**, utbildningens kalenderstart **2027**, kulltext **27/28**, beräknat första läsår **2027/28**. Inga klasskopplingar finns på denna version. Därför är 2027/28 i just denna dropdown giltigt trots valt planeringsår 2028/29. Bilden bevisar inte en sparad koppling före kullstart. Eventuellt annat utbildningsval/tidigare försök är inte reproducerat här.

Läsresultatets SHA256 är `f98dce5a13d147f5c5ad2aad2adf4e5bad4419a8acc8f9d11af0b7afc7c0a81c`. Läsresultatet finns privat i `/private/tmp/class-cohort-research-20261015.json`; det innehåller startuppgifter, räknare och funktionshashar, inga elevuppgifter. Ingen ny negativ skrivtest har körts. SQL-spärrarna nedan är kodgranskade; tidigare funktionella bevis finns i OPERATIONAL-verifieringen.

Två verkliga förbättringsbehov kvarstår: gränssnittet skiljer dåligt mellan valt planeringsår, kullens start och klassens tillämpningsår; klassbildning är i dag bunden till en redan fastställd timplan och kommer därmed sent i planeringsarbetet.

## Kodförankrade fynd

| Del | Nuläge och konsekvens |
| --- | --- |
| Läsårsval | `web/app/protected-class-timplans.tsx:76` förenar aktuellt valt år med timplanens tre år. Ett tidigare valt år kan visas även utanför intervallet. `column` beräknas separat på rad 28–29 och skrivkontroller visas först för giltig kolumn. |
| Serverns årsspärr | `20261012210000_class_timplan_flow.sql:102` ger blockerande besked för läsår utanför intervallet. Kommando rad 150–156 och trigger rad 72–75 kontrollerar start/läsår/årskolumn. Dropdownval är inte ett bevis på tillåten sparning. |
| Vårstart | `phase5_class_start_year` räknar läsårets startår med appens juli-gräns. Start januari 2028 hör därför till 2027/28. Migration `20261012240000_class_start_calendar.sql` skiljer detta från utbildningens kalenderår. Föreslagen UI måste visa datum och läsår var för sig. |
| Klassens start | `school_classes` har bara startår, inte klassens exakta startdatum/giltighetsintervall. Två starter inom samma läsår kan därför inte skiljas med klassens egna fält. Elevmedlemskapens datum löser inte detta. |
| Klassens ägare | `school_classes.offering_id` är obligatoriskt i `20260929100000_phase4_register_schema.sql`. En klass har redan en utbildning; det finns inte något generellt register av oanknutna klasser att bara välja från. |
| Kandidatval | Underlag rad 103–107 och skrivkommando rad 154 väljer samma kund, huvudman, skola och `offering_id`. Samma startår räcker inte. Detta ska bevaras eller ersättas med ett uttryckligt nytt relationskontrakt. |
| Tidig klassbildning | `phase5_class_scope` rad 47 kräver fastställd timplan även när dagens kommando bara skapar en tom klass. Nytt tidigt steg kräver ett eget klasskommando oberoende av timplansbeslutet. |
| Mandat | Huvudmannen kan skapa programplan. Klassunderlag rad 113 och timplanens skrivscope ger klassarbete till rektor/administratör med rätt skolmandat. Ett gemensamt UI får inte tyst ge huvudmannen dessa skrivrättigheter. |
| Identitet och namn | `school_classes` har stabilt ID, medan äldre `class_timplans` även har namn/läsår i primärnyckeln. Namnåteranvändning och namnbyte måste granskas före större ombyggnad. Namn får inte bli nytt integrations-ID. |

## Externa primärkällor

1. [SIS information om SS 12000](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/) listar 2024 års utgåva och anger att den tillför en informativ användarstödsbilaga. Standarden beskriver informationsutbyte; den bestämmer inte vår arbetsgång eller kundens skrivansvar. Lästa uppgifter 2026-10-15.
2. [SIS officiella OpenAPI 2.1.0](https://www.sis.se/globalassets/standardutveckling/tksidor/tk-450/openapi_ss12000_version2_1_0.yaml), hämtad via SIS länk: `GroupTypesEnum` skiljer klass från undervisningsgrupp. `GroupFragment` medger tom grupp, har stabilt ID och giltighetsdatum. `GroupMembership` har medlemskapets egna datum. Detta stödjer tomma planerade klasser och separat elevtillhörighet, men kräver inte automatisk klassbildning. Den tekniska specifikationens version ska inte blandas ihop med standardens utgivningsår. Kopia privat: `/private/tmp/class-cohort-ss12000.yaml`.
3. [Skolverkets information om individuell studieplan](https://www.skolverket.se/styrning-och-ansvar/anordna-utbildning/anordna-gymnasieutbildning/individuell-studieplan-inom-gymnasieskolan-anpassade-gymnasieskolan-och-gymnasieskolans-introduktionsprogram) beskriver elevens individuella plan och rektorns ansvar. Arkitekturslutsats: en klass-/programmall får inte ersätta elevens individuella innehåll eller hantering av avvikelser. Detta är inte en ny implementerad studieplansfunktion.

Den hämtade YAML-filens SHA256 är `aee9a95a4c5bd25cebaf357d266592f94e9388ae785ee9ac3b58e1992acccd28`.

Källorna motiverar begreppsseparationen. Ingen av dem beslutar våra standardnamn, automatiska antal klasser, mandat eller exakt intern databasmodell. Ingen anslutning till extern elevregisterleverantör har verifierats i researchen.

## Föreslaget arbetsflöde

1. **Skapa utbildning för en kull:** ange skola/skolor, startdatum och utbildning. Visa både ”Utbildningsstart 1 augusti 2028” och ”Första läsår 2028/29”. Kullnamnet är en etikett, inte datumauktoritet.
2. **Klasser för utbildningen:** visa befintliga klasser för samma skola och utbildning/kull. Är detta en ny programplansversion visas befintlig klasstruktur utan duplicering. Saknas klasser erbjuds namn och antal för tomma klasser; användaren bekräftar vad som skapas. Ett separat ”Gör senare” gör att planarbete kan börja innan klassorganisationen är bestämd.
3. **Respektera uppdrag:** behörig rektor/administratör kan i föreslagen första etapp skapa klass. Huvudmannen får se att klassorganisation återstår och gå vidare med sitt planarbete. En överlämningsuppgift till rektor är ett möjligt separat plansteg. Huvudmannens eventuella rätt att skapa klasser kräver ett uttryckligt produkt-/mandatbeslut.
4. **Fastställ och tillämpa timplan:** välj exakt timplansversion och klassens läsår. Visa exempelvis ”Åk 1 · 2028/29”, ”Åk 2 · 2029/30”. Tidig klassbildning ska inte fastställa en timplan eller automatiskt aktivera en framtida version.
5. **Kopiera till nästa kull:** kopiera utbildningsinnehållet enligt befintligt kontrakt. Klasser följer inte automatiskt med. Det nya klasssteget kan föreslå nya namn, men användaren måste välja och bekräfta dem. Gamla elever, klass-ID:n, medlemskap och beslut flyttas inte.

En framtida kull kan förberedas redan i dag. Det är skillnad mellan när klassobjektet registreras, när klassen börjar gälla och vilket läsår timplanen tillämpas på. Rekommendationen spärrar fel tillämpningsår utan att blockera förberedelsearbetet.

## Modell och avgränsning

Behåll i första etappen nuvarande enkla gymnasieklass med en utbildning/kull och ett stabilt klass-ID. Lägg till tydlig livscykel/giltighet och tidig skapandeoperation där den behövs. Skola plus startår är inte tillräcklig identitet: flera utbildningar och klasser kan börja samma år. Koppling till timplan förblir klass-ID + tillämpningsläsår + exakt version + årskolumn.

”Välj befintliga” får först avse klasser som redan tillhör samma utbildning/kull. Att välja en klass från annan utbildning är en annan operation med konsekvenser för elever och historik; gör aldrig en tyst omskrivning av `offering_id`. Oanknutna/importerade klasser, blandade utbildningar i samma organisatoriska klass, byte, sammanslagning och delning behöver senare en tydlig tidsbunden relation och källa. Skapa inte dubbla klassmodeller i planerings- och elevregistermodulen.

Extern registerägare måste vara känd innan en lokal planerad klass kan matchas mot importerad klass. Namnmatchning ensam räcker inte. Tom behörig lista kan också betyda fel urval, saknat mandat eller att import ännu inte skett; det betyder inte alltid att kullen saknar klasser.

## Föreslagen genomförandeordning och verifiering

- **A: Begripligt start-/läsårsval.** Visa kullstart, första läsår och årskurs; skilj läsning av äldre år från tillåten koppling. Behåll serverspärrarna. Kontrollera URL-år utanför intervallet, höst-/vårstart, saknat eller motsägande underlag samt mobilvy.
- **B: Tidig klassorganisation.** Eget mandatkontrollerat kommando för tom klass utan krav på fastställd timplan. Granska namn/antal innan sparande, säkra atomär gruppskapning och requestbundet kvitto/återhämtning. Prova dubbla klick, konflikter, auditfel och uppdragsbyte. Ingen automatisk timplanskoppling eller elevplacering.
- **C: Befintliga/importerade klasser.** Bestäm informationsägare, extern ID-mappning, namnbyten och historik innan korskoppling/flytt stöds. Detta kan behöva samordnas med elevregisterfasen och S1/S3.

Befintligt `work/pilot/verify-class-timplans.mjs` har flera år-/mandat-/versionsfall men saknar i sin negativa årsmatris ett uttryckligt år-före-start-fall. Lägg till detta som färskt direkt API/SQL-prov inför ändringen; forskningsläsningen ersätter inte det provet.

Testmatrisen ska också täcka två klasser samma kull, två utbildningar samma startår, samma namn i olika kullar med överlappande läsår, ny program-/timplansversion utan nya klasser, kopiering till ny kull utan gamla klass-ID:n, saknat klassmandat, befintliga elever och gammal versionslänk. Klassens nya tidiga tillhörighet och fastställd timplanskoppling ska visas som olika statusar. Berörda handbokssidor och dator-/telefonprov ingår när beteendet implementeras.

Före implementation återstår att precisera hur mycket ”välj befintliga” ska omfatta och om huvudmannen endast initierar klassarbetet eller också får ett nytt klassmandat. Rekommenderad första etapp ändrar inte mandat och flyttar inte klasser mellan utbildningar. Detta är ett förslag inför GSD-planering. Ingen produktkod, databas eller ordinarie plan är ändrad av researchen; senaste användarmeddelandet är ingen kopieacceptans.
