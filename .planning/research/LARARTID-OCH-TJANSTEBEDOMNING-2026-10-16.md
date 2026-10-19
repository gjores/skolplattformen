---
title: Stöd för rektors bedömning och uppföljning av lärares arbetstid
date: 2026-10-16
status: research_complete_proposal_not_implemented
related_requirements: [PLANERING-05, GROUP-01, SCHEMA-01, SCHEMA-03, SCHEMA-07, SCHEMA-08, LLEG-03, ACL-02, ACL-04]
proposed_requirements: [TID-01, TID-02, TID-03, TID-04, TID-05, TID-06, TID-07, TID-08, TID-09, TID-10, TID-11, TID-12]
code_revision: 42fa2517a93e354bb76dfbf5834c091286a98a94
---

**Utflyttad 2026-10-19.** Tjänstebedömningen hör inte längre till Skolplattformen. Den aktuella kopian av researchen finns i repot `tjanstebedomning` (`docs/research/`). Filen ligger kvar här som historik; se [beslutsdokumentet](../phases/05.1-tjanstefordelning/05.1-SPLIT-DECISION.md).

# Stöd för rektors bedömning och uppföljning av lärares arbetstid

## Rekommendation

**Bygg en sammanhängande tjänsteplanering där rektor kan förklara varje tjänsts förutsättningar, avsätta tid för hela uppdraget och följa vad som faktiskt händer.** Kollektivavtal, förordning, individuell bedömning och schema behöver använda samma underlag. Huvudmannen behöver se vilka resurser och åtgärder som krävs, inte bara ett genomsnitt av undervisningstimmar.

Användaren beställde 2026-10-16 research om avtal, individuell tjänstebedömning och motivering, lärarkategorier, arbetstid/förtroendetid, mentorskap, tidsuppföljning, dubbelräkning och schemaandel. Detta utvecklar det tidigare beställda stödet för Plan Digital-ersättningen. Nedan är ett **produktförslag**, inte en genomförandeplan eller godkänd leverans. Researchen ändrar inte fasordningen eller pågående APL-arbete. Pilotens 42 krav och åtta faser behålls.

Två genomgående principer:

1. **Vad tiden används till och vem som förfogar över tiden är olika dimensioner.** Undervisning, planering/uppföljning och mentorskap beskriver uppgifter. Reglerad tid och förtroendearbetstid beskriver arbetstidsformer.
2. **Planerad, schemalagd och genomförd tid är olika lägen för samma arbete.** De ska jämföras, aldrig adderas till ett gemensamt arbetstidsuttag.

## Regelgrund och rättelser av äldre underlag

[SFS 2026:1487](https://svenskforfattningssamling.se/sites/default/files/sfs/2026-06/SFS2026-1487.pdf) är utfärdad 25 juni 2026 och träder i kraft **1 juli 2027**. Originaltextens tre sidor och [Regeringskansliets fulltext](https://rkrattsbaser.gov.se/sfst?bet=2026:1487) har kontrollerats 2026-10-16. Det är en beslutad framtida regel; kontroll av dagens tjänster och simulering av 2027/28 behöver skiljas åt. Författningen och avtal måste kontrolleras på nytt före produktens regelprofil fastställs.

| Område | Vad underlaget ska stödja |
| --- | --- |
| Undervisningens omfattning, 3 § | För gymnasiets lärare i karaktärsämnen med yrkesinriktad profil anges intervallet 450–650 timmar vid heltid; för övriga gymnasielärare 450–550. Detta avser placeringen av det individuella taket. 450 är inte en minsta undervisningsmängd. |
| Planering och uppföljning, 4–7 §§ | Grundskola 1–6 m.fl. minst 100 procent; grundskola 7–9 och anpassat gymnasium m.fl. minst 110 procent; gymnasieskolan minst **120 procent** av undervisningstiden. Komvux har ett separat intervall 50–120 procent. |
| Individuell bedömning, 8 § | Gruppstorlek, antal elever läraren regelbundet möter, antal elever i behov av särskilt stöd samt andra relevanta omständigheter måste beaktas. Mindre goda förutsättningar innebär mindre undervisning och mer planering/uppföljning. |
| Förskola och fritidshem, 9–10 §§ | Separat miniminivå om fem timmar per vecka vid heltid och egen behovsbedömning. Gymnasiets årsmodell får inte återanvändas som allmän regel. |
| Deltid | Förhållandet till arbetstiden ska motsvara heltid. Beräkningen måste följa faktisk sysselsättningsgrad och rätt period. |
| Undantag, 11 § | Tre olika grunder och restriktiv helhetsbedömning, enbart avseende 3–8 §§. Endast första stycket punkt 1 har uttryckligt krav på lärarens eget initiativ. Undantag får inte bli en generell överbeläggningsknapp eller sänka miniminivåerna i 9–10 §§. |

Den tidigare [researchen 2026-10-07](LARARES-TID-SFS-2026-1487-2026-10-07.md) innehöll felaktigt **20 procent** som gymnasiets hela miniminivå och gav samtliga undantag krav på lärarinitiativ. De uppgifterna är rättade. Vid 500 undervisningstimmar blir grundnivån **600 timmar planering och uppföljning**, inte 100. Detta stöds av 4 och 6 §§ samt [regeringens uttryckliga förklaring om 120 procent](https://www.regeringen.se/pressmeddelanden/2026/06/nu-regleras-lararnas-undervisningsuppdrag/). Den äldre automatiken ”yrkesprogram = yrkeslärare” är också olämplig: bedömningen måste utgå från lärarens faktiska undervisning.

[Förordningsmotiven Fm 2026:1, s. 4–7 och 10–12](https://www.regeringen.se/contentassets/19981f5cf0024a11a41c8bafb05aa347/forordning-om-omfattning-av-tiden-for-larares-och-forskollarares-undervisningsuppdrag.docx.pdf) förklarar bedömningen och undantagen. Förordningen anger ingen särskild blankett eller periodisk digital rapport. Vårt dokumentationsflöde är ett sätt att stödja ansvar och uppföljning, inte ett nytt formkrav som ska tillskrivas förordningen. Huvudmannens ansvar och rektors organisation av arbetet behandlas i [proposition 2025/26:196, s. 47–48](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/tid-for-undervisningsuppdraget_hd03196/html/).

### Frågor som inte ska lösas med en dold schablon

- **Blandade uppdrag:** kombinationer av skolformer, stadier och allmänna/yrkesinriktade ämnen behöver en dokumenterad tillämpning. Källorna ovan ger inte en färdig generell viktformel för alla kombinationer. Visa deluppdrag och bedömningsbehov; välj inte automatiskt det högsta taket.
- **Planering inom förtroendetid:** förordningens kvoter och kollektivavtalens tidsformer måste stämmas av tillsammans. Propositionen s. 48 diskuterar förtroendetid, men ger ingen komplett avräkningsmodell. Räkna inte automatiskt hela förtroendepotten som redan avsatt planeringstid. En produktionsprofil behöver granskad tillämpning och synligt underlag; oklar tillämpning får inte ge ett grönt efterlevnadsbesked.
- **Frånvaro, delår och byte av omfattning:** behövs periodiserade beräkningar med avtalets kalender och frånvaroregler. Multiplicera inte årets alla mått med en och samma aktuell procent. Deltidsanpassad undervisning ska inte deltidsanpassas en gång till vid beräkning av planeringskvoten.

## Avtal som valbara och versionsbundna underlag

Huvudmannen eller behörig HR-funktion registrerar de avtal som faktiskt gäller. Rektor väljer bland dessa för rätt anställning och giltighetsperiod. Avtalsvalet får inte fungera som en meny för att välja den mest fördelaktiga arbetstidsramen.

Varje profil behöver avtalsparter, version, giltighet, källa, ferie-/semestertjänst, beräkningsperiod, arbetstidsram och tidsformer, förläggningsregler, avstämningar samt tillåtna lokala avvikelser. Årsgenomsnitt, individuellt antal timmar, veckomått och högsta gräns måste vara olika slags värden. En lokal överenskommelse behöver egen omfattning, dokumentreferens och giltighet; den ersätter inte automatiskt nationella regler.

### Skillnader som visar varför flera profiler behövs

Avtalstexter kontrollerade 2026-10-16. Tabellen är ett urval för modellering, inte en fullständig tillämpningsanvisning.

| Avtalsfamilj och källa | Verifierat exempel | Konsekvens för systemet |
| --- | --- | --- |
| HÖK 25, [Bilaga M i lydelse 2025-04-01, punkt 6](https://skr.se/download/18.4d2a888c19913a970f86c663/1757404111873/Bilaga%20M-25.pdf) | 1 360 reglerade timmar på 194 A-dagar. 1 767 är kollektivets genomsnitt, inte universellt individuellt årsantal. Minst fyra avstämningsperioder om lokala parter inte avtalat annat. | Beräkna individuell ram och perioder. Riktmärket 104 timmar kompetensutveckling avser en gemensam pott inom reglerad tid, inget extra tillägg. |
| Almega Friskoleavtalet, [2025–2027, uppdaterat 2026-09-30, 4:2–4:3](https://www.sverigeslarare.se/siteassets/1.-rad-och-stod/kollektivavtal/almega/friskoleavtalet-2025-2027/kollektivavtal_almega_friskoleavtalet_250901-270831_uppdaterad_260930.pdf) | Grundmodell för ferietjänst utan annan lokal överenskommelse: 1 807 timmar, varav 1 360 förläggs av arbetsgivaren på 194 dagar. Reglerad tid högst 35 timmar/vecka i genomsnitt under sex månader. Semestertjänst har egen veckoregel. | Återanvänd inte HÖK:s totalram eller perioder. Avtalet löper 2025-09-01–2027-08-31; senare perioder kräver verifierat fortsatt avtalsunderlag. |
| Fremia Skolor, förskolor och fritidshem, [2025–2027, uppdaterat 2026-08-27, §4](https://www.sverigeslarare.se/siteassets/1.-rad-och-stod/kollektivavtal/fremia/skola-forskola-fritidshem/kollektivavtal_fremia_skola_forskola_fritids_25-27_uppdaterad_260827.pdf) | Ferie: 1 767 som kollektivgenomsnitt, 1 360 reglerade timmar, 194 dagar och återstoden förtroendetid. Aktuell avtalstext anger sex månaders beräkningsperiod för ordinarie veckotid. | Spara den faktiska avtalsversionen. En äldre webbsammanfattnings fyra veckor får inte övertrumfa den granskade texten. |
| Arbetsgivaralliansen Skola/utbildning, [2025–2027, §7 mom. 4](https://www.sverigeslarare.se/siteassets/1.-rad-och-stod/kollektivavtal/arbetsgivaralliansen/skolautbildning/kollektivavtal_arbetsgivaralliansen_skola-utbildning_25-27.pdf) | Från 2026/27 anges 1 360 reglerade + 400 förtroendetimmar, samtidigt som en anmärkning sänker totalen till 1 752. | Fördelningen av de åtta timmarna behöver verifierad parts-/lokaltillämpning. En motsägande total och delram får inte aktiveras genom tyst korrigering. |

För statliga arbetsgivare och andra avtal krävs egna granskade profiler. Högskolans årsarbetstider är ingen generell mall för skolans lärare.

Angivna avtalsperioder är HÖK 25 **2025-04-01–2027-03-31**, Almega och Fremia **2025-09-01–2027-08-31** samt Arbetsgivaralliansen **2025-05-01–2027-04-30**. De sträcker sig alltså inte uttryckligen över hela reformens första läsår. Fortsatt giltighet eller ersättande avtal måste verifieras; ett angivet slutdatum betyder inte alltid automatiskt upphörande. [HÖK 25 §7](https://skr.se/download/18.4d2a888c19913a970f86d2cf/1757406957810/HOK-25-OFRs-Larare.pdf) innehåller exempelvis en förlängningsregel.

**Rekommendation:** stöd flera profiler i modellen från början, men fastställ bara avtalsmallar som är granskade. Börja med den verkliga pilotens avtal och en andra verifierad profil för att pröva att modellen inte är hårdkodad. Huvudmannens avtalsval för LBS är inte verifierat av denna research. Ett avtal för 2025–2027 får inte automatiskt förlängas till hela 2027/28.

Arbetsgivaren kan förlägga reglerad tid enligt tillämpliga regler. Förtroendearbetstid ska visas begripligt och följas upp på ett sätt som bevarar lärarens dispositionsrätt. Ett frivilligt eget kalenderblock får inte ändra tidens juridiska karaktär till arbetsgivarstyrd tid. Semester, ferie, rast, paus, resa, övertid och mertid behöver egna avtalsregler; de kan inte hanteras som en godtycklig restpost.

## Rektors arbetsflöde

### 1. Kontrollera tjänstens förutsättningar

Visa person, anställning, skola/skolor, läsår och datumperioder, sysselsättningsgrad, avtalsprofil och källa. Utgå från stabil personidentitet även när läraren saknar systemkonto. Flera anställningar och flera skoluppdrag får inte skapa flera kopior av en hel årsbudget.

Tre separata kategoriseringar behövs:

- **Regeltillhörighet:** skolform, stadium och undervisningens karaktär, med datum och motivering. En matematiklärare blir inte yrkeslärare enbart för att eleverna läser ett yrkesprogram.
- **Funktion:** undervisande lärare, mentor för elever, mentor för ny kollega, förstelärare, programansvar, specialpedagogiskt uppdrag och APL-uppföljning. Samma person kan ha flera funktioner.
- **Förutsättningar:** erfarenhet av aktuellt ämne, antal olika förberedelser, gruppstorlekar och annan belastning. Dessa är underlag för uppdragsbedömning, inte en permanent A/B/C-gradering av lärarens kvalitet.

Lärarlegitimation och ämnesbehörighet är en fjärde, separat kontroll från LLEG-spåret. Avtalskategori eller förordningskategori bevisar inte behörighet att undervisa eller rätt att läsa personuppgifter.

### 2. Bedöm hela uppdraget

Ge rektor en kort guidad bedömning. Förifyll belagda gruppstorlekar och antal unika elever, men visa källans datum och vilka grupper som saknas. Samma elev i flera ämnen räknas en gång i måttet unika elever; antal grupper och olika undervisningsupplägg redovisas separat.

Bedömningen omfattar de fyra faktorerna i 8 § och relevanta preciseringar: nya ämnesnivåer, bedömningsintensitet, nationella prov, mentorskap, APL-besök, resor mellan skolor, introduktionsbehov och andra uppdrag. Använd sammanfattade stödbehov och nödvändiga verksamhetsuppgifter, inte elevdiagnoser, elevlistor eller privata HR-anteckningar i motiveringstexten.

Rektor anger **bedömt undervisningstak**, **avsatt planerings-/uppföljningstid**, övriga uppdrag och motivering som förklarar sambandet mellan förutsättningar och tid. Systemet kan föreslå underlag och visa konsekvenser, men en poängmodell eller AI-text ska inte fatta bedömningen. Högsta möjliga undervisningstid och lägsta möjliga planeringstid får inte vara förval för alla.

### 3. Dokumentera, samråd och fatta beslut

Spara period, käll-/avtals-/regelversion, faktaunderlag, bedömning, motivering, aktör, tidpunkt och nästa avstämning som ett sammanhängande beslutsunderlag. Läraren kan läsa sin plan och lämna synpunkter. **Mottaget**, **diskuterat**, **lärarens synpunkt**, **rektors beslut** och **facklig samverkan/förhandling** är olika händelser; en läskvittens är inget godkännande av ett undantag eller avtal.

Detta behöver både en gemensam nivå för fördelningsprinciper och en individuell nivå. [HÖK 25, bilaga 3, punkt 1](https://skr.se/download/18.4d2a888c19913a970f86d2cf/1757406957810/HOK-25-OFRs-Larare.pdf) beskriver tjänsteplaneringens normala koppling till primär förhandlingsskyldighet enligt MBL. Produktens kvittensflöde ska därför inte framställas som att det ensamt fullgör samverkan eller förhandling.

Förslag: rektor beslutar den individuella fördelningen inom sitt mandat; huvudmannen beslutar avtalsprofiler och resurser samt följer kvarstående brister. Huvudmannens eventuella godkännande av tjänstefördelningen ska preciseras separat och inte ersätta rektors bedömning. En administratör kan få beredningsrätt utan beslutsrätt. Servern ska kontrollera aktuell skola, personuppdrag och operation.

Ändrat elevunderlag, nya uppgifter, ändrad tjänstegrad eller nytt schema visar **Detta har ändrats sedan bedömningen** och leder till omprövning när det påverkar tjänsten. Kopiering till nästa läsår kan föra över strukturen, men inte gamla bedömningar, undantag, lärarinitiativ eller beslut som nya gällande fakta.

### 4. Planera mentorskap och övriga uppgifter uttryckligt

Mentorskap behöver en egen tidsbudget och innehåll: gemensam mentorstid, individuella samtal, förberedelser, vårdnadshavarkontakter, samordning och uppföljning. Visa elevantal, delat mentorsansvar och period. Varken en schablon per elev eller en viss årsvolym är ett generellt krav i den undersökta förordningen; lokala normer ska vara märkta som lokala och kunna motiveras individuellt.

Skilj **mentor för elever** från **mentor för en ny lärare**. Den senare kan behöva både handledarens och den nya lärarens tid. Mentorskap ska inte automatiskt fylla kvoten för undervisning eller dess planering. Klassificera det konkreta momentet utifrån innehåll och tillämplig definition; samma minut kan inte samtidigt räknas fullt som mentorskap och undervisning.

För APT och studiedagar avgör innehållet. Skolgemensam administration räknas inte som planering av egen undervisning, medan gemensam lektionsplanering eller bedömningssamråd kan göra det. Dela ett blandat möte i tidsandelar vars summa är mötets längd. [Propositionen, avsnitt 6 och författningskommentar till 2 kap. 12 a §](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/tid-for-undervisningsuppdraget_hd03196/html/).

APL ska ge tid för lärarens egna besök, resa, undervisning och uppföljning. Elevens 23-timmarsomräkning för en APL-vecka får inte bli lärarens arbetstid. Samordna med [APL-underlaget](APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md).

## Beräkning utan dubbelräkning

Varje tidsrad behöver en identifierad person/tjänst, period, arbetsuppgift, arbetstidsform och källa. Kalenderhändelser och genomföranderapporter länkar till samma uppdrag. Behåll både budget, planerad förläggning och rapporterat utfall; en källrevision får inte skriva om historiskt utfall.

| Situation | Föreslagen räkneregel |
| --- | --- |
| Budget 100 timmar, schema 80, rapporterat genomfört 70 | Tre jämförelsevärden: 100/80/70. Aldrig 250 arbetstimmar. |
| Samma lärare undervisar två samlästa klasser i 60 minuter | 60 lärarminuter totalt, även med två gruppkopplingar. Varje elevs undervisning redovisas i sitt eget mått. |
| Två lärare undervisar tillsammans i 60 minuter | 60 minuter per deltagande lärare, 120 personminuter totalt. Ett 60-minuterstillfälle för elevgruppen. |
| Ett möte är 30 minuter lektionsplanering och 30 minuter administration | Två räknade delar som tillsammans är 60 minuter. Flera etiketter på samma del skapar inte extra tid. |
| 80 timmar mentorsbudget och 60 timmar mentorspass | 60 av 80 förlagda; 20 återstår. Relation till mentorsgrupp ger ingen ytterligare tidskostnad. |
| Samma kalenderhändelse kommer från två importer eller importeras igen | Samma källidentitet/version avstäms; ingen extra tid. Namnmatchning eller tidslikhet räcker inte för säker sammanslagning. |
| Två olika pass överlappar för samma lärare | Visa konflikt och hindra ett okontrollerat fastställande. Tyst bortdeduplicering skulle dölja ett verkligt planeringsfel. |
| Vikarie ersätter ordinarie lärare | Varje persons faktiska deltagande följs separat. Det ordinarie passet får inte både ligga kvar som genomfört av ordinarie och ersättas utan avvikelsespår. |
| Inställt/flyttat tillfälle | Bevara ursprunget och ändringen. Flytt skapar inte ett extra genomfört tillfälle. Inställt är inte frånvaro eller genomförd undervisning. |
| Förtroendepott och uppgifter inom potten | Uppgifter är delar av potten, inga tillägg till årsarbetstiden. Okänt innehåll är okänt, inte automatiskt planering/uppföljning. |

Lagra tid i minuter med definierad precision och beräkna kvoter utan tidig avrundning. 45 minuter är 0,75 timmar. Om en minimitilldelning måste anges i hela minuter avrundas den uppåt: 65 × 110 procent = 71,5 kräver då 72 minuter. Ett tak får inte avrundas uppåt så att det överskrids. Skolans verkliga kalender, lov, studiedagar, helgdagar och ändringar styr årsutfallet. En typvecka multiplicerad med ett hårdkodat veckotal är bara ett uttryckligt scenario. Timplanens elevtimmar, lärarens timmar och gymnasiepoäng hålls åtskilda.

En heldagsmarkering får inte automatiskt bli åtta räknade timmar. Lunchrast, arbetspaus, förflyttning och väntetid behöver avtalad klassificering. Övertid/mertid ska vara separata mått med rätt beslut och avtalsregel; underskott i planeringen får inte döpas om till godkänd övertid.

## Visa schemaandel med tydliga nämnare

**Primärt mått:** arbetsgivarens förlagda reglerade arbetstid / tillgänglig reglerad arbetstid för samma person och period. Täljaren omfattar förlagda arbetsuppgifter, inte bara lektioner, och hämtas ur en vald gällande schemaversion. Personliga förtroendeblock och arbetsfria raster ingår inte i denna täljare.

Använd personens räknade förläggning efter deltagandeundantag och raster. Klockintervall, lärarens undervisningsminuter och elevens undervisningsminuter kan skilja sig. SS 12000-fältet `teachingLengthTeacher` får därför inte ensamt bli täljaren för hela kalenderandelen. Oklara överlapp visas som konflikt och gör måttet preliminärt.

Komplettera med undervisning / reglerad tid, förlagd tid / total arbetstidsram samt planerings-/uppföljningstid / undervisningstid. Visa alltid timmarna bredvid procenten. Vid saknad avtalsram eller ofullständigt schema visas **Underlag saknas** eller **Delvis underlag**, inte 0 procent. En nollnämnare ger inget andelstal.

### Räkneexempel med antagna individuella ramar

Anta för illustrationen en heltidstjänst med 1 767 timmar totalt, varav 1 360 reglerade och 407 förtroendetid. Dessa är **exempelvärden**, inte generell årsarbetstid för alla lärare. Exemplet lägger hela sin planeringsbudget i reglerad tid; det avgör inte frågan om hur förtroendetid får tillgodoräknas enligt en viss avtals-/regelprofil.

| Arbete inom reglerad tid | Avsatt i tjänsten | Förlagt i kalendern | Avsatt men ännu inte förlagt |
| --- | ---: | ---: | ---: |
| Undervisning | 500 h | 500 h | 0 h |
| Planering och uppföljning | 600 h | 300 h | 300 h |
| Mentorskap | 80 h | 60 h | 20 h |
| Andra arbetsuppgifter | 180 h | 120 h | 60 h |
| **Summa reglerad tid** | **1 360 h** | **980 h** | **380 h** |

Förtroendetiden 407 timmar visas separat som lärardisponerad ram. Den är inte en extra arbetsgivarstyrd schemapott.

- **72,1 procent av den reglerade tiden är förlagd:** 980 / 1 360.
- **36,8 procent av den reglerade tiden är undervisning:** 500 / 1 360.
- **55,5 procent av den totala ramen är arbetsgivarens förlagda tid:** 980 / 1 767. Detta är inte ett mått på hur mycket läraren arbetar.
- **120 procent är avsatt för planering/uppföljning i förhållande till undervisning:** 600 / 500. Grundkvoten är uppnådd i exemplet; individuell rimlighet och förläggning behöver fortfarande bedömas.

De 380 timmarna utan kalenderplacering är redan avsatta till uppgifter. Visa därför **380 timmar återstår att förlägga**, inte **380 timmar ledig kapacitet**. En årsbalans kan dessutom dölja ohållbara veckor; visa arbetsbelastning och användbar planeringstid över terminen.

## Uppföljning som leder till åtgärder

Låt läraren enkelt rapportera ändringar och avvikelser: extra vikariepass, planering som fått lämna plats åt annat, fler mentorsärenden eller arbete som inte hinns med. Återanvänd schemat som underlag utan att märka varje schemapass som faktiskt genomfört. Full minutrapportering av varje aktivitet ska inte vara standardkrav.

Regelbunden avstämning jämför tjänsteplan, gällande schema, rapporterat utfall och prognos för återstoden. **Årsprognos = rapporterat utfall hittills + återstående planerat arbete**, utan att redan rapporterade pass finns kvar i återstoden. Visa hur stor del av perioden som är avstämd; saknade rapporter är inte noll arbete. Frivillig uppskattning av förtroendetid ska märkas som uppskattning och inte omvandlas till arbetsgivarstyrd närvarokontroll.

Rektors startsida bör prioritera en åtgärdslista: bedömning saknas, avtal behöver granskas, undervisning över individuellt tak, planering under avsatt behov, tät belastning, schemaöverlapp, ny avvikelse eller försenad uppföljning. Varje rad ska visa orsak, berörd period, ansvarig och nästa åtgärd. Åtgärder kan vara ändrat undervisningsuppdrag, omfördelat mentorskap, administrativa stödfunktioner eller ytterligare personal.

Arbetsmiljöperspektivet behövs även när timsummorna ryms: resurser ska motsvara kraven och arbetstagaren behöver veta vad som ska prioriteras när tiden inte räcker. Koppla därför varje kvarstående brist till prioritering, ansvar och nästa uppföljning. [Arbetsmiljöverket, AFS 2023:2, 2 kap. 6–7 §§](https://www.av.se/arbetsmiljoarbete-och-inspektioner/publikationer/foreskrifter/afs-20232/).

Huvudmannens översikt visar samma underlag per skola: täckning av bedömningar, avtalens aktualitet, kvarstående tidsbrister per tidsslag, återkommande orsaker, beslutade resurser och åtgärdernas effekt. Ett skolgenomsnitt får inte dölja enskilda orimliga tjänster. Summerade bristtimmar ska inte utan vidare omvandlas till en enda tjänsteprocent när lärare har olika avtal eller arbetsuppgifter.

Visa separata besked: **Beräknade gränser klaras**, **Bedömning saknas**, **Schema ofullständigt**, **Utfall ej avstämt**. Undvik en enda etikett ”Följer lagen”. Tjänster över flera skolor kräver en gemensam kapacitetsbild och utsedd samordning; rektor får inte därigenom fri tillgång till andra skolors elev- eller personalärenden.

### Hantering av undantag

Registrera grund enligt 11 §, berörda tider/uppgifter, giltighet, helhetsbedömning, ansvarig och uppföljning. Flödet gäller enbart 3–8 §§ och får inte användas för att sänka förskolans eller fritidshemmets minimum enligt 9–10 §§. För punkt 1 ska initiativet komma från läraren och kunna styrkas; föreslaget produktflöde är att läraren själv initierar ärendet med sin inloggning. Rektor ska inte kunna skapa ett lärarinitiativ genom direkt anrop eller förifylld kryssruta. För punkterna 2 och 3 behövs egna arbetsflöden och underlag; de får inte felaktigt beskrivas som lagkrav på lärarinitiativ. Läraren ska kunna se och kommentera även dessa.

Upprepade vikariepass eller en liten grupp ska inte automatiskt öppna ett obegränsat undantag. Behåll både beräkning före undantag och bedömd påverkan; godkänt undantag raderar inte arbetstimmarna.

## Befintligt system och integrationsgräns

Kodkartan i `.planning/codebase/` är daterad 2026-09-11 och har stämts av mot aktuell kod vid revisionen ovan. Skyddad app har program-/timplaner, läsår, klasskopplingar och mandat. Nu finns också beslutskedja för program-/timplaner i `web/lib/plan-decision.ts` och `web/app/api/planbeslut/andra/route.ts`; äldre research som säger att den kedjan saknas är inaktuell.

Någon skyddad modell för kollektivavtal, individuell arbetstidsbudget, tjänstebedömning, förtroendetid eller arbetstidsuppföljning har inte hittats. Äldre schema-/mentorvyer i `web/app/page.tsx` och `web/lib/admin-model.ts` är exempeldata och får inte bli grund för ett påstående om färdig personalplanering. Läsårs- och beslutsmönster kan återanvändas; nya personalobjekt, servermandat, databasregler och granskade datakällor måste byggas.

| Kod som granskats | Vad som kan återanvändas eller måste hållas isär |
| --- | --- |
| `web/lib/planning-year-contract.ts:9–49`, `web/lib/server/planning-year.ts:73–110` | Exakta plan-/klass-/årsreferenser, okänt kontra noll och skolmandat. IM:s veckoram är inte automatiskt lärartid. |
| `web/lib/plan-decision.ts:3–10`, `web/app/api/planbeslut/andra/route.ts:5–9` | Beslutsrevision, underlagshash och skyddad ändring; nya tjänstebeslut kräver eget kontrakt. |
| `web/lib/mandate-policy.ts:11–32` | Giltiga åtkomstuppdrag och mentor-/undervisningsrelation. Detta är inte en anställnings- eller tidsbudgetmodell. |
| `web/lib/class-cohort.ts:4–12`, `web/lib/class-timplan.ts:6–17` | Stabil klassidentitet och uttrycklig bindning till planversion/läsår; använd dessa i tjänsterader. |
| `web/lib/timplan-model.ts:315–332` | Ämnestimmar är inte faktisk tjänstefördelning. |
| `web/lib/admin-model.ts:64–85,511–561`, `web/app/page.tsx:249–272` | Schemaexempel använder lärarnamn/veckopass; skyddad app är en separat väg. Ingen års- eller personaluppföljning bevisas här. |

Föreslagen kärna: **person → anställning/avtal → tidsbegränsat skoluppdrag → tjänsteplan och bedömning → uppgiftsbudget → schema → rapporterat utfall och åtgärd**. Lagprofilen är separat från avtalsprofilen. Varje beslut binder exakt underlag och revision. Källansvar för personaldata, lokal tidsbudget, kalender och utfall bestäms per fält; importer får inte tyst skriva över ett rektorsbeslut.

### SS 12000

Avstämning 2026-10-16: [SS 12000:2024, utgåva 4](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/), [officiell OpenAPI 2.1.0](https://www.sis.se/globalassets/standardutveckling/tksidor/tk-450/openapi_ss12000_version2_1_0.yaml), format 3.0.2. Hämtningens SHA-256: `aee9a95a4c5bd25cebaf357d266592f94e9388ae785ee9ac3b58e1992acccd28`.

| Intern information | Standardens möjliga representation och gräns |
| --- | --- |
| Person och skola | `Person`, `externalIdentifiers`, `Organisation`; interna ID:n, externa käll-ID:n och giltigheter bevaras. |
| Lärartjänst/skoluppdrag | `Duty.person`, `dutyAt`, `dutyPercent`, `hoursPerYear`, `startDate/endDate`. Årstimmar saknar vår fulla avtals- och förtroendetidsmodell. |
| Uppdragsbudget | `Activity.minutesPlanned` och `teachers[].minutesPlanned` via `DutyAssignment`. Aktivitetens totalt planerade tid och lärarens minuter får inte likställas. |
| Schema | `CalendarEvent` har klockintervall, `teachingLengthTeacher`, `teachingLengthStudent`, `cancelled` och `teacherExceptions`. De skiljer deltagande och tider men bevisar inte genomförande. |
| Mentorskap | `Duty.assignmentRole[]` med typ `Mentor`, grupp och datum. Relationens tidsbudget behöver vårt eget uppdrag. |
| Konferenstid | `Activity.activityType = Läraraktivitet` kan användas. `groups` kräver minst en faktisk grupp, exempelvis personalgrupp; konstruera inte en falsk undervisningsgrupp. |
| Avtalsprofil, motivering, rättsligt undantag, personalrapport | Egna domänobjekt. Kalenderns `TeacherException` är inte ett beslut om undantag enligt 11 § eller en generell arbetstidsrapport. |

Detta är verifierad schemaanalys och avsedd mappning, inte verifierad informationsöverföring. Motpartens stöd, enheter, borttag/rättelser, återimport och skrivansvar måste provas innan en anslutning beskrivs som fungerande. En SS 12000-roll ger inga lokala åtkomsträttigheter. `activityType = Undervisning` är inte i sig bevis för klassificering enligt skollagen/förordningen.

## Föreslagna etapper och verifieringsmål

| Etapp | Resultat | Koppling |
| --- | --- | --- |
| **T1 Avtal och tidsgrund** | Person/anställning/skoluppdrag, versionerade avtal och lagprofiler, perioder, klassificering och beräkningsregler. | TJANST-grunden och SCHEMA S1; SS 12000-kontrakt från början. |
| **T2 Rektors tjänstebedömning** | Hela tjänsten inklusive mentorskap, dokumenterad motivering, lärardialog, beslut och huvudmannens åtgärdsbild. | Tjänstefördelning och LLEG-03; kan ge nytta innan fullt schema finns. |
| **T3 Schema och tidsavstämning** | Uppdragskopplad kalender, rätt schemaandel, samläsning, lärardeltagande, revisionshantering och konflikter. | SCHEMA S3, särskilt SCHEMA-01/03/07/08. |
| **T4 Utfall och resursuppföljning** | Avvikelser, prognoser, åtgärder och huvudmannens uppföljning; eventuell extern adapter provas separat. | SCHEMA S4 och kundens faktiska informationsansvar. |

Etapperna är föreslagen ordning, inga nya beslutade pilotfaser. T1–T2 ska planeras ihop med den redan beställda tjänstefördelningen; tidsmodellen bör inte läggas på efter att en förenklad tjänstemodell redan byggts. Avtal för 2027/28 och blandade uppdrag kräver avstämning före deras regelprofiler kan få produktionsstatus. Existerande APL-planering behöver bevara dessa framtida kopplingar men utökas inte automatiskt till hela personalmodulen.

| Mål | Ansvarig etapp | Konkret verifiering som återstår |
| --- | --- | --- |
| TID-01 Tidslägen | T1 | Budget 100, schema 80, utfall 70 hålls skilda; delunderlag synligt. |
| TID-02 Regelprofiler | T1 | 2026/27 kontra framtidsscenario 2027/28; ny version ändrar inte gammalt beslut. Gymnasiet 500 → 600, aldrig 100. |
| TID-03 Klassificering | T1 | Uppgift × tidsform, blandat möte 30+30, oklassificerad tid och saknad avtalsram. |
| TID-04 Gränser och deltid | T1 | Individuellt tak 500 med 520 planerat ger avvikelse även om nationella intervallet slutar på 550. Vid 60 procent och heltidsbedömt tak 500 blir taket 300; 300 undervisning ger grundgolv 360. Byte mitt i året får ingen dubbel proportionering. |
| TID-05 Bedömning och motivering | T2 | Förändrade grupper/uppdrag markerar gammal bedömning för omprövning; historik bevaras. Läskvittens är inte godkännande. |
| TID-06 Undantag | T2 | Punkt 1 kräver belagt lärarinitiativ och nekar rektors imitation även via API. Punkterna 2/3 har egna villkor; alla bevarar faktisk tidsmängd. Undantag från 9–10 §§ nekas. |
| TID-07 Huvudmannens översikt | T2 | Samma person vid två skolor, blandade avtal och saknat underlag utan falska totalsummor eller läckta individärenden. |
| TID-08 Avtalsval | T1 | Minst två granskade profiler med olika tidsram, lokalt tillägg, versionsbyte, utgånget avtal och ferie/semester. |
| TID-09 Hela uppdraget | T2 | Mentorsbudget och pass räknas en gång; elevmentor/kollegamentor skilda; APL:s elevtid ger inte lärartid. |
| TID-10 Dubbelräkning | T3 | Samläsning, två lärare, skilda lärarminuter, överlapp, vikarie, inställt/flyttat, återimport och källkonflikt. |
| TID-11 Schemaandel | T3 | Exemplet 980/1360 = 72,1 procent; oförlagda 380 är avsatt arbete; nollnämnare, raster och personliga förtroendeblock. Skilda klock-, lärar- och elevminuter hålls isär. |
| TID-12 Uppföljning | T4 | Utfall + återstående prognos utan överlapp; rapportlucka är okänt; åtgärd och ny avstämning kan följas. |

Varje genomförandeplan behöver också direkta server-/databasprov för kundgräns, skolmandat, egen läraråtkomst, återkallelse, konkurrerande beslut och audit. Pröva användarflödet på dator och telefon samt uppdatera och bygg berörd handbok när beteendet är implementerat. Dagens research ändrar inget användarbeteende; ingen app- eller handboksbyggnad behövs för detta dokumentsteg.

**Verifieringsstatus:** primärkällor och aktuell kod är granskade. Dokumentlänkar och räkneexemplets summor/procent är kontrollerade. Oberoende genomgång har lett till preciseringar om undantagens omfattning, avrundning och SS 12000:s tidsmått. Tabellens produktfall är föreslagna, inte genomförda. Ingen personalfunktion, produktionsavtalsprofil, verklig integration eller full rättslig efterlevnad har verifierats.
