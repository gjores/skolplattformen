# Timplaner — arbetsyta och analys efter programplanernas ombyggnad

Datum: 2026-10-04. Status: kodförankrat planeringsunderlag, inte genomförd timplansleverans. Bas: Git `2178933` och den aktuella arbetskopian, inklusive Claudes pågående 05-20-ändringar. Inga app-, databas- eller browserprov har körts för denna planering.

## Beställning och aktuell förlaga

Användaren vill ha en liknande plan för timplanerna som för de ombyggda programplanerna, med bra analysstöd. Tidigare beslut kvarstår: från en godkänd och fastställd programplansversion ska rektor eller skoladministratör kunna skapa och redigera sin skolas timplan. Poäng och undervisningstid är olika mått.

05-19:s genomförda programplan är förlagan. `protected-programplan-board.tsx` samlar ämnen, nivåer, programfördjupning och sex terminer i en tabell. Årskurskort, återstående poäng, filtrering, förslag och autospar när en rad lämnas hör till samma arbetsyta. `protected-programplan-workspace.tsx` håller ihop startlista, plan, analys, kopiering och underlag/versioner. `programplan-analysis.ts` ger kategorier, förklaring, regel och åtgärd samt framräknad beslutsklarhet. Detta är det senast lästa produktbeteendet; 05-18:s separata fördelningsdialog är en äldre förlaga.

## Kodfynd som påverkar genomförandet

| Källa | Nuläge och betydelse |
|---|---|
| `web/app/protected-timplan-workspace.tsx` | Befintlig GR/IM-lista, läsvy och dialog för en cell. Inget skyddat skapande eller analysflöde. |
| `web/lib/protected-timplan.ts` | Listkontraktet utesluter gymnasium. Endast rektor får ändra; tabellkolumnerna följer sparade GR-årskurser eller IM-vecka. Saknade celler är inte noll. |
| `web/lib/server/timplan-planning.ts` | Slutna kontrakt för lista/läs/cell. Nya svar får inte öppnas genom att låta gamla kontrakt godta godtyckliga fält. |
| `supabase/migrations/20260930110000_phase5_timplan_draft.sql` och `20260930140000_phase5_timplan_selection.sql` | Nuvarande scope tillåter HM/rektor, och skrivning bara rektor. Admin behöver faktisk mandatkontroll, inte klientrollbyte. Revision, session, lås och audit ska bevaras. |
| `web/lib/timplan-model.ts` och `web/app/timplan-view.tsx` | Rikare modell/demovy har analys, förslag/beslut och bemanningsriktvärden. Gymnasiegrund härleds från aktuell programplan med årskolumner. Förslag om 0,9 timmar/poäng och 36 veckor är modellantaganden; de är ingen skyddad källbindning eller nationell regel. |
| `05-20-CONTEXT.md`, aktiva livscykelfiler | Livscykeln gäller programplaner. Pågående/avslutade program låses och skolor kan läggas till. Detta innebär inte automatiskt samma datumlås för timplansrevisioner. Ändringarna saknar ännu slutlig SUMMARY. |
| `05-21-PLAN.md`, `05-22-PLAN.md` | Planerad delad utbildning och timplan per skola, med `offering_units` och `timplans.unit_id`. Klassen ska fortfarande peka på sin egen skolas uttryckligen fastställda version. Inte genomfört enligt tillgängliga sammanfattningar. |
| `05-23-CONTEXT.md` | Beslutad modell för fasta Svenska/SvA-rader och valbara block. En timplansrad per block. Skolans paketutbud kan ändras utan ny programplansversion. Kräver därför fryst skolpaketsunderlag för varje timplansversion, även när programplans-ID är oförändrat. PLAN/genomförande saknas. |
| `05-19-SUMMARY.md`, analysluckornas todo | Framräknat ”Klar för beslut” är inte ett serverbeslut. Alternativa/olösta rader kan saknas, nivåordning prövas per år och vissa lagrum är ännu obestyrkta. Dessa brister får inte godkännas genom att kopiera analysen. |

Äldre kodkartan i `.planning/codebase/ARCHITECTURE.md` och `CONCERNS.md` har lästs som riskhistorik. Aktuella skyddade servervägar går före kartans uppgifter om direkt Supabase-åtkomst. Ingen ansluten databas har inventerats i denna planering; genomförandet måste jämföra faktiskt tillämpade funktioner och migrationer.

## Kontrollerat regelunderlag

Primärkällor lästa 2026-10-04. En regelprofil måste ange skolform, elevkull/giltighet och exakt källa; en obestämd profil ger **Att kontrollera**, aldrig automatiskt grönt beslut.

- [Skolverket: undervisningstid, lärotider och schema](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema): högskoleförberedande program har minst 2 180 timmar. För yrkesprogram från HT 2023 är ramarna 2 625 respektive 2 720 timmar beroende på omfattning; äldre kullar och individuella avvikelser kräver rätt profil. IM gäller i genomsnitt minst 23 timmars undervisning per vecka. Elevens individuella beslut och faktiskt genomförd tid kan inte bevisas av en gemensam plan. Programtid ska därför inte förklaras uppfylld bara genom att summera praktik/mentorstid.
- [Gymnasieförordningen 4 kap. 22 §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/gymnasieforordning-20102039_sfs-2010-2039/): huvudmannen beslutar timmar och fördelning för nationella program; rektor beslutar den individuella IM-fördelningen. Planerad undervisning är inte huvudmannens redovisning av genomförd undervisning. För yrkesprogrammets APL behövs även kontroll av 4 kap. 12 § och fördelning över nivåer innan den kan räknas utan dubbelräkning.
- [Skolverket: timplan för grundskolan från 2024/2025](https://www.skolverket.se/undervisning/grundskolan/timplan-for-grundskolan): totalen är 6 890 timmar. NO/SO har grupp- och ämnesramar. Skolans val omfördelar högst 600 timmar med högst 20 procents minskning per stadium; svenska/SvA, engelska, matematik och språkval är skyddade. HKK:s 40 timmar gäller **låg- och mellanstadiet tillsammans**. Källan anger 1 882 låg, 2 334 mellan, 40 gemensamt och 2 634 hög. Modellens `mellan: 2374` och HKK `låg: 0, mellan: 40` får inte bli ett lagkrav på fördelning enbart i mellanstadiet.

## Analys som hjälper till att göra rätt

Resultatet ska visa **Fel**, **Risk**, **Att kontrollera** och **Uppfyllt**, med antal och filtrering. Varje kontroll får stabilt ID, berörd rad/termin/skola, faktiskt och förväntat värde, begriplig förklaring, regelkälla/giltighet och konkret åtgärd. ”Visa raden” ska återföra användaren till exakt rätt cell med fokus utan att förlora osparade värden.

| Område | Planerad kontroll | Bevisgräns |
|---|---|---|
| Gymnasiets källplan | Fastställd exakt version, kompletta fasta rader/block, skolkoppling och frysta paket | Utkast eller ofullständig källa får inte bli skenbart komplett timplan. |
| Gymnasiets undervisning | Timmar per nivå/block, total/marginal, terminsfördelning jämförd med källplanen | Ingen generell timkvot per poäng. Programplanens poäng ska inte räknas som timmar. |
| Valbara block | Blocket räknas en gång i elevens tidsväg; alternativ jämförs inom samma ram | Summering av alla valpaket överskattar tiden för en elev. Ändrat skolutbud visas som ändrat underlag. |
| Grundskola | Ämnen, NO/SO utan dubbelräkning, stadium, HKK:s gemensamma ram och skolans val | Delat stadium/okänt kompletterande underlag ska ge ofullständig kontroll. |
| Introduktionsprogram | Bekräftad undervisningstid skiljs från praktik och annan tid | En korrekt radsumma får inte innebära att varje elev får 23 timmar. |
| Arbetsbörda | Översikt över tid per termin/år och marginal mot tillämplig ram | 2- eller 15-procentströsklar är uttryckliga lokala riskantaganden, inga lagregler. |
| Plan och beslut | Sparad revision, analysversion, rätt profil, oförändrad källa och faktisk beslutsrätt | Ett beslut måste läsa och kontrollera färskt serverunderlag. |

Delvis färdiga utkast får sparas. ”Klar att lämna för beslut” räknas från färdig, **sparad** och kontrollerbar plan; blockerande fel och saknad obligatorisk kontroll hindrar förslag/beslut. Risker och andra manuella kontrollpunkter redovisas utan automatisk juridisk uppfyllelse. Visa separat ”Analys av dina osparade ändringar” när tabellen avviker från sparat underlag.

## Design och integrationskontrakt

- Samma rytm som programplanerna: startlista → en plan med skol-/kull-/versionsrubrik → summeringskort → tabell → analys. Underlag och historik öppnas vid behov.
- Gymnasium: sex terminskolumner, källpoäng som läsinformation och undervisningstimmar som egna värden. Mobilen visar vald årskurs med HT/VT. Grundskolan behåller sina årskurser och IM sin veckovy.
- Rektor och skoladministratör arbetar i skolans utkast. HM granskar och beslutar; UI-rättigheter härleds från serverkontrollerat mandat. Admin får inte HM:s beslutanderätt.
- Autospar per rad kräver revisionskonflikt, synlig sparstatus och återläsning vid okänt svar. Förslag/beslut får aldrig springa före pågående eller misslyckad sparning. Saknas underlag visas ”Saknas”, inte 0.
- Timplansversionen fryser källplanens ID/revision/katalog, rader, poäng/terminer och skolans paketrevision. En ny källversion eller paketändring visas för jämförelse men skriver inte över timmar.
- Existerande klasskopplingars `ar1/ar2/ar3` behålls som stabila årreferenser. Terminerna behöver en uttrycklig adapter till läsårsunderlag. Inga klasser får automatiskt flyttas till en ny version.
- Genomförandet väljer en dokumenterad exakt lagringsenhet och provar konvertering/avrundning. Nuvarande heltalskontrakt för befintliga GR/IM-celler kan inte ändras tyst.

## Förutsättningar och verifiering

05-20–05-22 behöver bli genomförda och verifierade för full skolavgränsning. 05-23 behöver en genomförbar plan och verklig leverans innan kompletta gymnasiekällor kan fastställas. 05-17 krävs för de yrkesprofiler den äger. Skyddat HM-fastställande av programplan saknas och ska få ett eget konkret steg. Tidig GR/IM-analys kan utvecklas före gymnasiegrindarna. Programplansdelegation, elevval, schemamotor, nya klasskommandon och kommunanslutning är egna leveranser.

Prov ska gå genom riktig lokal Worker/SQL med egna syntetiska fixturer: två skolor på samma plan, olika skolpaket, R/admin/HM, fel kund/skola, återkallat mandat under låsväntan, CAS, replay, auditfel och borttappat svar. Testa HKK i lågstadiet, NO/SO utan dubbelräkning, alternativ i block utan översummering, IM med hög totalsumma men låg bekräftad undervisning, okänd profil och gammal klasskoppling efter ny version. Kör dator/telefon och granska bilder samt åtgärdsfokus. Handboken uppdateras först med faktiskt levererat beteende. Tidigare 05-19:s kända utloggningsfel ska synliggöras, inte förvandlas till grönt resultat. Mänskligt prov och full fasverifiering redovisas separat från automatiska prov.
