# Skolplattformen

## Projektbeskrivning och designkoncept

Version 2.0 · 4 september 2026 · Grundskola och gymnasium

**Mindre administration. Mer tid för undervisning. Rätt hantering från början.**

Detta är ett sammanhållet produktförslag, kravunderlag och designkoncept. Det beskriver vad plattformen ska åstadkomma, hur arbetet ska fungera och vad som behöver verifieras innan införande. Ingen färdig app ingår i leveransen.

## 1. Projektets inriktning

Plattformen ska förena skoladministration, undervisning, planering, schema, bemanning, elevstöd, utredningar, prov och informationsförvaltning. Den ska fungera för både grundskola och gymnasium, med regler som anpassas efter huvudman, skolform, verksamhetsgren, utbildning och tidpunkt.

Undervisning och administration är likvärdiga kärnor. Lärarens planering, elevens arbete, återkoppling och bearbetning ska ha samma omsorg som handlingar, schema och beslut. Den viktigaste produktidén är att varje arbetsmoment ska skapa nästa användbara underlag. En frånvarorapport ska kunna bidra till en korrekt uppföljning. En beslutad stödinsats ska kunna omsättas i lärarens undervisning och schemats resurser. Ett fastställt beslut ska få dokumenthantering och uppföljning utan att någon registrerar samma information igen.

**Regelefterlevnad ska byggas in i arbetsflödena.** En kontrollpanel som visar grönt räcker inte. Systemet måste hjälpa personalen att upptäcka vad som saknas, förstå varför det behövs och utföra rätt åtgärd. Samtidigt måste det vara synligt vad systemet faktiskt har kontrollerat och vad som fortfarande kräver professionell eller juridisk bedömning.

### 1.1 Vad som ska göra plattformen bättre

1. Elevens lärande stöds genom sammanhängande planering, återkoppling och bearbetning. Uppgifter registreras vid källan och återanvänds där det finns behörighet och rättsligt stöd.
2. Personal får ett hanterbart antal tydliga uppgifter med ansvarig och nästa steg.
3. Handlingar blir sökbara och möjliga att förvalta redan när de uppstår.
4. Schemaläggning visar vilka regler som gäller och förklarar konflikter och ändringsförslag.
5. Stödbehov leder till ansvar och insatser, inte bara varningar.
6. Prov fungerar även när nätverk eller en enhet krånglar, med tydlig skillnad mellan lokalt sparat, mottaget och inlämnat.
7. Insyn, sekretess, dataskydd och arkivering hanteras tillsammans utan att blandas ihop.

”Sveriges bästa” är en ambition som ska prövas med användare och mätbara arbetsflöden. Projektet ska inte påstå att konkurrenter har överträffats innan jämförande tester visar det.

### 1.2 Underlag och säkerhet i slutsatserna

Underlaget består av offentlig leverantörsdokumentation, en läsande granskning av SchoolSoft **endast i Testskolan**, en läsande granskning av den tillåtna Plan Digital-miljön samt offentliga rättskällor. Inga elevuppgifter behöver återges i projektbeskrivningen. Alla personer, tider och ärenden i designexemplen är påhittade.

Funktionskatalogerna innehåller 60 identifierade SchoolSoft-förmågor, 22 Plan Digital-förmågor och 36 Classroom-förmågor. Dessa är våra katalogposter, inte leverantörernas officiella funktionsantal. De utgör inte bevis för en fullständig inventering av alla licenser, roller och specialfunktioner.

SchoolSofts granskade miljö visade bland annat skoladministration, närvaro, betyg, dokumentmallar, schemaimport och både GY11- och GY25-relaterade menyval. Plan Digital visade timplaner, tjänsterader, kontrollvyer och ett menyval för export till Royal Schedule. Ett exportval bevisar inte automatisk synkronisering. Fullständiga rollflöden, låst provläge och samtliga utredningstyper verifierades inte.

**Läsordning:** detta dokument är den samlade projektbeskrivningen. Dokument 01–06 i underlagspaketet ger funktionsinventering, observationsprotokoll och fördjupningar. Vid skillnad i projektinriktning gäller detta dokument: arbetet avser nu beskrivning och design, inte apputveckling.

## 2. Produktprinciper och tydliga gränser

### 2.1 Enkelhet ska betyda mindre arbete

Systemet ska känna till användarens roll och aktuella sammanhang. En lärare som registrerar frånvaro ska inte samtidigt behöva välja arkivserie eller sekretessparagraf. Informationen ska få förslag till hantering från verksamhetens godkända regler. Registrator eller annan utsedd funktion hanterar avvikelser och bedömningar.

Varje nytt obligatoriskt fält måste ha ett dokumenterat ändamål: lagkrav, nödvändig verksamhetsinformation eller beslutad lokal rutin. Projektets regel är att ett nytt fält inte införs bara för att informationen kan vara intressant.

### 2.2 Professionellt ansvar ska gå att utöva

Systemet får förbereda, påminna, sammanställa och kontrollera. Beslut om betyg, stöd, disciplinära åtgärder, sekretess eller utlämnande får inte bli en oreflekterad bekräftelse av ett maskinförslag. Den ansvarige ska kunna se källor, rätta fel, begära komplettering och dokumentera en annan bedömning.

### 2.3 Sammanhängande arbete med avgränsad information

”En plattform” innebär en sammanhängande upplevelse och gemensamma identiteter. Det innebär inte att alla användare ser en fullständig elevakt. Den medicinska elevhälsan, elevstöd, personalärenden och vanliga undervisningsuppgifter ska ha skilda åtkomstregler. Även förekomsten av ett känsligt ärende kan behöva skyddas.

### 2.4 Avgränsningar

Första produktomfattningen gäller grundskola och gymnasium. Anpassade skolformer behöver egna validerade regelpaket; stöd för att bereda ett mottagandeärende betyder inte att hela den skolformen är implementerad. Förskola, vuxenutbildning, komplett lönesystem, bokföring och fullständig patientjournal är framtida eller integrerade områden.

Det ska finnas en första klassens koppling till journal- och ekonomisystem när de behövs. En ytlig kopia av dessa verksamheter skulle skapa både dubbelarbete och oklart ansvar.

## 3. Prioriterade förbättringar

| Förbättring | Värde i vardagen | Viktig kontroll |
|---|---|---|
| Automatisk informationshantering | Handlingen får sammanhang och ägare utan extra blankett | Undantag går till ansvarig, inte till tyst standardval |
| Gemensam uppgiftskö | Färre mejl och tappade överlämningar | Frånvaro hos ansvarig får inte stoppa ärendet |
| Samlat utlämnandeflöde | Mindre letande, kopiering och manuell maskning | Ny prövning vid varje begäran |
| Regelversion per tidpunkt | Rätt regel för elevens utbildning och ärendets datum | Framtida regler aktiveras inte för tidigt |
| Beslut kopplas till genomförande | Stöd och resurser blir faktiskt utförda | Utebliven insats blir synlig |
| Konsekvensvisning före schemaändring | Planeraren ser vilka som påverkas | Giltiga hårda regler får inte tyst brytas |
| Vikariebokning med begränsad åtkomst | Vikarien får rätt lektion och instruktion | Behörigheten upphör när uppdraget slutar |
| Sammanhållen undervisningsyta | Uppgift, återkoppling och bedömning hör ihop | Bedömningsunderlag förväxlas inte med beslutat betyg |
| Verifierat provläge | Eleven och provvakten vet om låsningen fungerar | Okänd eller förlorad låsning visas tydligt |
| Kontrollerad avveckling | Skolan kan byta leverantör utan att förlora handlingar | Export kan återläsas och användas utan abonnemang |

De tre första ska finnas tidigt. Annars riskerar plattformen att digitalisera samma administrativa problem som redan finns.

## 4. Juridisk grund och övergången 2027–2029

### 4.1 Reglerna måste ha datum och tillämpningsområde

Riksdagen beslutade den 26 maj 2026 om offentlighetsprincipen för enskilda juridiska personer som är godkända skolhuvudmän. Reglerna börjar gälla den 1 januari 2027 för handlingar inom den godkända verksamheten. Det är en beslutad reform, inte bara ett utredningsförslag. [Riksdagens beslut, UbU20](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/offentlighetsprincipen-med-lattnadsregler-for_hd01ubu20/).

SFS 2026:714 undantar handlingar som kommit in eller upprättats före ikraftträdandet från den nya bestämmelsens tillämpning. Under 2027 och 2028 gäller angivna lättnadsregler för samtliga berörda enskilda juridiska huvudmän. Plattformen måste därför bevara verkliga händelsedatum och historisk huvudmannatillhörighet. Ett importdatum får inte ersätta ett äldre inkomstdatum. [Utfärdad lag, SFS 2026:714](https://svenskforfattningssamling.se/sites/default/files/sfs/2026-05/SFS2026-714.pdf).

### 4.2 Tre regelprofiler

| Profil | Vad projektet behöver stödja |
|---|---|
| Kommunal huvudman | TF, OSL och arkivregler med lokal organisation, registratur och arkivmyndighet |
| Berörd enskild huvudman 2027–2028 | Reformens offentlighet och sekretess samt övergångens särskilda hanterings- och bevaranderegler |
| Enskild huvudman från 2029 | Skillnad mellan mindre huvudmän med lättnader och övriga, med historik när storlek eller organisation ändras |

Mindre huvudmän definieras i den antagna ändringen utifrån högst 450 barn eller elever, med koncernregler; för endast förskola gäller en särskild 100-gräns. Lättnaderna omfattar bland annat handläggningstid, ordnande av handlingar och elektroniska sammanställningar. Bevarande och vård ska som utgångspunkt möjliggöra insyn i minst sju år, med angivet utrymme för tidigare gallring enligt motsvarande kommunala föreskrifter. **Detta är inte en generell regel att radera allt efter sju år.** [SFS 2026:716, 29 kap. 15–16 f §§ och övergångsbestämmelser](https://svenskforfattningssamling.se/sites/default/files/sfs/2026-05/SFS2026-716.pdf).

Ändringen av arkivlagen enligt SFS 2026:715 träder i kraft den 1 januari 2029. Den anger också hur kommunal arkivtillsyn ska fördelas när verksamhet finns i flera kommuner. Ett koncernkonto får därför inte ersätta information om var ett arkiv bildas och vilken organisation som ansvarar. [SFS 2026:715](https://svenskforfattningssamling.se/sites/default/files/sfs/2026-05/SFS2026-715.pdf).

**Produktbeslut:** bygg samma välordnade informationsgrund för alla huvudmän. Låt rätt regelprofil styra skyldigheter, inte en förenklad inställning ”friskola: offentlighet av/på”. Enskilda fysiska huvudmän och andra särskilda organisationsfall måste prövas separat.

### 4.3 Ett förvaltat regelregister

Varje regel ska ha namn, rättskälla, paragraf eller avsnitt, status, giltighetsperiod, tillämpningsvillkor, ansvarig granskare och datum för senaste granskning. Lagkrav, myndighetsvägledning, kollektivavtal och lokal rutin ska visas som olika typer.

En regeländring ska kunna förhandsvisas: vilka mallar, ärenden, elevkullar, tidsberäkningar och integrationer påverkas? Verksamheten ska kunna prova ändringen på testfall innan aktivering. Avslutade beslut ska behålla den regelversion som användes. Rättelser ska vara spårbara.

Automatisk omvärldsbevakning kan föreslå en ändring. En ansvarig juridisk och verksamhetsmässig granskning ska fastställa dess innebörd innan den används som bindande produktregel. Ett nytt pressmeddelande får inte automatiskt ändra beslutsflöden.

## 5. Offentlighetsprincipen som ett fungerande arbetsflöde

### 5.1 Fem frågor som systemet måste hålla isär

1. Vilken organisation förvarar handlingen och ansvarar för prövningen?
2. Är handlingen allmän enligt tillämpliga regler?
3. Vilka uppgifter får lämnas ut i det aktuella fallet?
4. Vem får behandla uppgifterna internt och för vilket ändamål?
5. Hur ska handlingen ordnas, bevaras eller gallras?

En sekretessmarkering ska fungera som uppmärksamhetssignal. Den ska inte låsa ett framtida utlämnandebeslut. En fil som heter ”utkast” är inte automatiskt undantagen. Allmänna handlingar kan finnas i meddelanden, ärenden, databaser och bilagor, inte bara i signerade PDF-filer. Grundregler om förvaring, inkommande och upprättade handlingar, utkast och utlämnande finns i TF 2 kap. [Tryckfrihetsförordningen](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/tryckfrihetsforordning-1949105_sfs-1949-105/).

### 5.2 Ta emot en begäran utan att skapa hinder

Den publika ingången ska heta **Begär en handling**. Besökaren beskriver det som efterfrågas med egna ord och väljer hur hen önskar ta del av materialet. Det ska inte krävas BankID, personnummer, organisation eller motivering som standard. Kontaktuppgift ska kunna lämnas för svar; besök eller annan tillgänglig kanal ska förklaras.

Personal ska kunna lägga in en begäran som kommit via telefon, brev, besök eller e-post. Mottagandetiden ska vara den verkliga tidpunkten. Vid vidarebefordran behålls ursprunglig ankomst och historik. Ett ärende får inte förlora tid bara för att det kom till fel intern mottagare.

Utforma anonymitetsinformationen ärligt: ett vanligt webbformulär kan ge tekniska loggar. Minimera loggningen, separera säkerhetsloggar från handläggningsvyn och lova inte att en digital kontakt saknar alla tekniska spår. Samla inte mer identitets- eller ändamålsinformation än prövningen kräver. [Polismyndighetens information om begäran och anonymitet](https://polisen.se/tjanster-tillstand/ta-del-av-allman-handling/).

### 5.3 Hitta materialet och redovisa sökningens omfattning

Handläggaren ska kunna söka i de system och handlingstyper som omfattas av behörigheten: diarium, meddelanden, fastställda dokument, beslutsversioner, register och levererade arkiv. Resultatet ska ange sökta källor, tidsintervall och eventuella fel.

”Inga träffar” får aldrig betyda ”alla källor är genomsökta” när en anslutning saknas. Systemet ska visa **Två källor återstår att söka**. Externa system kräver en uppgift till respektive informationsägare och en spårbar återkoppling.

För en begäran om en elektronisk sammanställning ska underlaget beskriva vilka uppgifter och tekniska åtgärder som krävs. Bedömningen av vad som ska tas fram måste följa tillämplig regelprofil, inklusive reformens lättnader. Systemet får varken neka enbart för att en färdig PDF saknas eller lova att varje specialrapport måste skapas.

### 5.4 Granska och maskera på uppgiftsnivå

Granskningsvyn visar originalet, föreslagna maskningar och den exakta utlämnandekopian. För varje maskning finns en ansvarig bedömare, rättsligt stöd och ärendespecifik motivering. Liknande tidigare ärenden kan ge vägledning, men tidigare maskningar får inte återanvändas som nya beslut utan prövning.

Den slutliga kopian ska kontrolleras för dold text, kommentarer, ändringshistorik, metadata, inbäddade filer, OCR-lager och kalkylbladsflikar. En svart ruta ovanpå läsbar text är inte godkänd maskering. Originalet ska förbli intakt, medan utlämnandekopian får egen identitet och kontrollsumma.

Möjligheten att lämna ut delar ska finnas genom hela flödet. Systemet ska stödja leverans av redan prövade delar när det är lämpligt, med kvarstående delar tydligt angivna. Det ska inte skapa en obligatorisk godkännandekedja för enkla offentliga handlingar.

### 5.5 Beslut, leverans och överklagande

Vid helt eller delvis nekad tillgång ska systemet hjälpa handläggaren att lämna korrekt information om möjligheten till formellt beslut och överklagande. Beslutsbehörighet, instans, motivering och överklagandehänvisning ska hämtas från rätt ärendetyp. Leveransen ska dokumentera vad som lämnades ut, i vilken version och hur.

Ordinarie skyndsamhetskrav och reformens särskilda tidsregel ska skiljas åt. En intern måltid är en arbetsledningshjälp, aldrig en lagstadgad frist om en sådan inte finns. Köer ska därför visa faktisk väntan och ansvar, inte ge intryck av att personalen får vänta till ett godtyckligt slutdatum. OSL 4–6 kap. reglerar bland annat sökbarhet, registrering och utlämnande. [Offentlighets- och sekretesslagen](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/offentlighets-och-sekretesslag-2009400_sfs-2009-400/).

Avgifter måste ha stöd i tillämpliga bestämmelser eller beslut. Systemet ska kunna skilja läsning på plats, papperskopior och elektronisk leverans. Ingen nationell standardavgift ska hittas på av leverantören.

### 5.6 Offentlig information som redan kan hittas

En separat publik yta bör kunna visa beslutade rutiner, kontaktvägar, kvalitetsrapporter och andra granskade handlingar. Publicering ska ha ett eget ändamål och en egen kontroll. Att en handling kan lämnas ut vid en begäran innebär inte automatiskt att hela handlingen bör publiceras öppet på internet.

Ett publikt diarium ska byggas som en särskild säker vy med granskade metadata. Det ska inte vara en direkt spegling av interna ärendetitlar, sökindex eller elevrelationer.

### 5.7 Kommunikation är en del av informationsförvaltningen

Intern och inkommande kommunikation ska vara ett förstklassigt informationsslag. Plattformen behöver hantera e-post, interna meddelanden, chatt, formulärsvar, kommentarer, bilagor och dokumentation av muntliga uppgifter i samma genomtänkta livscykel som andra handlingar. Även utgående svar måste följa med, så att skolan kan visa vad som faktiskt kommunicerats.

Det räcker inte med en knapp som sparar ett meddelande som PDF. Sammanhang, tidpunkter, deltagare, bilagor och relationer måste följa med. Ett mottaget klagomål ska kunna bli ett ärende, ett svar ska hamna i rätt akt och ett internt ställningstagande ska kunna hittas när beslutet granskas.

JO har kritiserat hanteringen av ett utkast som en extern konsult skickade till tjänstemäns privata e-postadresser. Benämningen utkast och valet av brevlåda undanröjde inte kraven på hantering av allmänna handlingar. Klassificeringen måste alltså utgå från omständigheterna, inte kanalens namn. [JO om utkast och privata e-postadresser i tjänsten](https://www.jo.se/besluten/kritik-mot-kommunstyrelsen-i-arvika-kommun-for-hanteringen-av-ett-utkast-till-rapport-och-anvandningen-av-privata-e-postadresser-i-tjansten/).

### 5.8 Gemensam inkorg med rätt ansvar

Skolans funktionsbrevlådor och plattformens egna meddelanden ska kunna visas i en arbetskö med mottagare, status, ansvarig och nästa åtgärd. Personliga tjänstebrevlådor kan anslutas inom en tydligt avgränsad och beslutad omfattning. Privata och fackliga meddelanden ska inte rutinmässigt kopieras till en gemensam elevakt. Meddelanden som ändå har kommit till en olämplig kanal ska kunna tas om hand genom en dokumenterad rutin.

Användaren ska kunna välja **Koppla till ärende**, **Starta ärende**, **Fördela** eller **Svara**. Systemet föreslår matchning utifrån befintliga relationer och ärendenummer, men får inte lägga känslig information på en elev enbart på grund av ett liknande namn. Osäkra matchningar kräver kontroll.

Brådskande innehåll, till exempel uppgift om kränkning eller oro, ska kunna eskaleras direkt. En automatisk mottagningsbekräftelse är inte detsamma som att någon har handlagt anmälan. Frånvaro, avslutad anställning eller stängd skola får inte göra att verksamhetens inkommande handlingar blir oåtkomliga.

### 5.9 Bevara original och sammanhang

E-post bör bevaras i ett format som behåller relevanta originaluppgifter, exempelvis EML eller motsvarande, tillsammans med en läsbar återgivning. För meddelanden ska plattformen kunna lagra meddelande-ID, tråd-ID, svar-relation, kanal, avsändare, mottagare, skickad och mottagen tid med tidszon samt bilagornas identitet. Kopior till flera mottagare får inte bli flera konkurrerande original.

En tråd är ett sammanhang, inte automatiskt en enda juridiskt enhetlig handling. Nya meddelanden, nya mottagare eller en extern deltagare kan ändra bedömningen. Kommunikation mellan olika myndigheter eller självständiga verksamhetsgrenar får inte behandlas som intern bara för att alla använder samma plattform.

Delade länkar behöver särskild hantering. Systemet ska tydligt skilja mellan en länk och den dokumentversion som faktiskt har fångats. Där rättigheter och informationshanteringsbeslut medger det ska den relevanta versionen säkras, så att ett senare ändrat eller borttaget molndokument inte gör beslutsunderlaget omöjligt att återskapa.

### 5.10 Redigering, radering och tillfälliga meddelanden

Ett redigerat meddelande ska kunna visa ändringstid och versionshistorik enligt beslutad hantering. Att en användare tar bort något ur sin inkorg får inte automatiskt förstöra en handling som verksamheten ska bevara. Samtidigt ska historik inte lagras obegränsat av slentrian. Kommunikationsklasser behöver egna hanteringsbeslut.

En kanal med försvinnande meddelanden ska inte användas för kommunikation som behöver bevaras om den inte har verifierad fångst och rättsligt beslutad hantering. En extern leverantörs standardinställning om 30 eller 90 dagars radering får inte fungera som skolans gallringsbeslut.

Reaktioner, ändringsloggar och leveransstatus ska värderas efter informationsvärde och ändamål. Ett gilla-tecken är inte ett formellt beslut. ”Skickat”, ”levererat”, ”öppnat” och ”delgivet” är skilda tillstånd; läskvitto ska inte automatiskt bevisa delgivning.

### 5.11 Telefonsamtal och muntlig information

Plattformen ska ge en snabb väg att dokumentera uppgifter från ett telefonsamtal eller möte: vem som lämnade uppgiften, när, vem som dokumenterade och sakligt innehåll. Det ska framgå att detta är en tjänsteanteckning, inte ett ordagrant transkript. Ljudinspelning ska inte vara standard för att lösa dokumentationsbehovet.

Dokumentationsskyldighet och omfattning följer den aktuella processen. Där muntliga uppgifter kan ha betydelse för ett beslut ska flödet hjälpa handläggaren att säkra relevant underlag. Om en inspelning redan finns behöver även den egen prövning och hantering; en automatisk sammanfattning ersätter inte utan vidare originalet.

### 5.12 Sekretess, sökning och utlämnande av kommunikation

En lång tråd kan handla om flera elever och innehålla både offentliga och skyddade uppgifter. Koppla relevanta delar till rätt ärenden utan att dela hela tråden med varje deltagare. Ett utdrag ska hänvisa till ursprunget och ge tillräckligt sammanhang, medan originalet ligger kvar under sin behörighet.

Sökning ska omfatta innehåll, relevanta deltagare, tid och bilagor där det är tillåtet. Utlämnande ska kunna göras per meddelande, bilaga eller prövat utdrag, med dolda lager och citerad historik kontrollerade. Vidarebefordran som svarssätt ska varna om den drar med tidigare känslig korrespondens.

En anslutning som inte har hämtat alla meddelanden ska visa ett tidsmässigt glapp. Systemet ska kunna stämma av fångade meddelanden mot källsystemet och rapportera saknade bilagor, misslyckade hämtningar och dubbletter. Meddelanden måste gå att söka även när en medarbetares konto har avslutats, i den utsträckning de ska finnas kvar hos verksamheten.

### 5.13 Ett vardagsexempel från början till slut

En vårdnadshavare mejlar att en elev känner sig utsatt. Meddelandet når skolans funktionsbrevlåda, får ett bevarat inkomstdatum och föreslås som en anmälan till rätt process. Ansvarig kan starta ärendet med meddelandet och bilagan redan länkade. Intern samordning sker i en begränsad ärendetråd. Relevanta muntliga uppgifter dokumenteras separat.

Svaret till vårdnadshavaren skickas från ärendet och kopplas till samma tidslinje, med mottagarkontroll. Om någon senare begär handlingarna kan skolan söka fram anmälan, interna meddelanden, bilagor och svar och pröva deras status och innehåll. Varken läraren eller registratorn behöver rekonstruera förloppet från skärmbilder.


## 6. Diarium, informationshantering och arkiv

### 6.1 Ett informationskort bakom varje handling

Informationskortet ska följa handlingen utan att belasta varje användare med ett nytt formulär. Det innehåller:

- ansvarig huvudman, myndighet eller verksamhetsgren och arkivbildare;
- stabilt handlings-ID, ärenderelation, handlingstyp och ursprung;
- inkomstdatum, upprättandehändelse och versionshistorik där tillämpligt;
- förvaringsplats och vilket system som har original eller auktoritativ version;
- åtkomstregler, skyddsbehov och eventuell sekretessmarkering;
- beslutad hanteringsregel, giltig version, bevarande eller gallringsvillkor;
- relationer till beslut, expedieringar, utlämnandekopior och arkivleveranser.

Samma dokument kan beröra flera ärenden. Länkar mellan ärenden ska minska kopior men får inte utvidga åtkomsten. Systemet behöver kunna återge exakt det beslutsunderlag som fanns vid en viss tidpunkt.

### 6.2 Registrera där det behövs, håll ordning överallt

Lösningen ska stödja både diarieföring och annan ordnad förvaring enligt tillämpliga regler. Varje närvaropost eller elevuppgift ska inte automatiskt bli ett manuellt registratorsärende. Godkända informationsklasser ska styra hanteringen.

Vid ofullständig klassificering ska en konkret uppgift skapas till informationsansvarig. Uppgiften visar vad som saknas och föreslår rätt befintlig kategori. Nya kategorier ska granskas centralt så att hundratals nästan likadana mappar inte uppstår.

### 6.3 Bevarande, gallring och radering

Arkivregler ska knytas till informationsslag, organisation och beslut. Riksarkivets generella föreskrifter ska inte antas gälla varje kommun direkt. Den tillämpliga lokala arkivorganisationen och dess beslut måste dokumenteras. Arkivlagen behandlar bland annat ordnande, vård, bevarande och gallring. [Arkivlagen](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arkivlag-1990782_sfs-1990-782/).

Föreslagen gallring ska först bli en granskningsbar körning: vilka handlingar berörs, vilket beslut stöder åtgärden och finns ett pågående utlämnande, överklagande, tillsynsärende eller annat skäl att stoppa den? Saknat stöd ska blockera automatisk förstöring och skapa en ansvarig bedömning. Det ska inte bli en ursäkt att behålla alla personuppgifter obegränsat.

Rensning av arbetsmaterial, gallring av allmänna handlingar och radering enligt dataskyddsregler ska ha olika flöden. Gallringsprotokollet ska beskriva åtgärden utan att återskapa den information som skulle förstöras.

### 6.4 Arkivleverans och leverantörsbyte

Arkivexporten ska innehålla läsbara handlingar, nödvändiga metadata, relationer, versionsuppgifter och kontrollsummor enligt mottagande arkivs specifikation. PDF/A kan vara relevant för vissa dokument, men ersätter inte strukturerade register, relationer eller originalformat där de behövs.

En leverans är klar först när mottagaren har validerat och kvitterat paketet. Misslyckad leverans ska ge en åtgärd och inte utlösa radering. Avtalet ska säkra att skolan kan få en komplett, dokumenterad export och fortsätta söka och lämna ut handlingar under övergången till nästa system.

## 7. Dataskydd, sekretess och behörighet

### 7.1 Behörighet som följer uppdraget

Behörighet ska avgöras av roll, konkret uppdrag, elev- eller grupprelation, organisation, verksamhetsgren och tid. Samma person kan vara lärare på en skola och skolledare på en annan. Användaren ska se vilken roll som är aktiv, och byte ska inte blanda information från de två sammanhangen.

En systemadministratör behöver kunna sköta konton utan att läsa alla elevärenden. Leverantörens support ska använda tidsbegränsad, godkänd åtkomst där innehållstillgång kan undvikas. Åtkomst till känsliga delar ska loggas och kunna granskas av utsedd funktion.

En akut åtkomstfunktion får bara finnas där verksamhetens rättsliga analys medger den. Den måste kräva skäl, begränsas och följas upp. Den får inte bli en generell genväg genom sekretessgränser.

### 7.2 Särskilt viktiga gränser

Vårdnadshavarens tillgång kan inte vara samma sak som elevens tillgång. Skyddade personuppgifter, elevens ålder och mognad, ändrat vårdnadsförhållande och myndighetsdag behöver särskild hantering. Utökad tillgång ska aldrig följa automatiskt av en gammal kontaktrelation.

Den medicinska elevhälsan är en självständig verksamhetsgren inom hälso- och sjukvård. IMY framhåller också att samtycke vanligtvis inte är rätt grund för skolans ordinarie personuppgiftsbehandling. [IMY:s vägledning för personuppgiftsansvariga i skolan](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/skola-och-forskola/for-personuppgiftsansvariga-inom-skola-och-forskola/).

**Produktförslag:** läraren ser en beslutad pedagogisk anpassning som behövs för undervisningen, inte en bakomliggande journalanteckning. Överföring mellan verksamheter ska ange mottagare, ändamål, rättsligt stöd och minsta nödvändiga uppgifter. Samtycke till viss informationsdelning ska inte förväxlas med samtycke som GDPR-grund för hela plattformen.

### 7.3 Fyra olika vägar till insyn

| Begäran | Föreslagen hantering |
|---|---|
| Allmän handling | Offentlighetsprövning, anonymitet som utgångspunkt, rätt tidsregel |
| Tillgång till egna personuppgifter | Dataskyddsärende, lämplig identitetskontroll, särskilt svarsunderlag |
| Partsinsyn | Prövning utifrån partsställning, aktuellt ärende och tillämpliga begränsningar |
| Vårdnadshavares information | Prövad relation och rätt till just den information som efterfrågas |

En begäran kan behöva behandlas i mer än ett spår. Användaren ska få hjälp, inte behöva känna till rätt paragraf. Identitetskontroll är relevant vid tillgång till egna personuppgifter, och svar ska normalt ges utan onödigt dröjsmål senast inom en månad; detta får inte kopieras till fristen för allmänna handlingar. [IMY om identifiering](https://www.imy.se/vanliga-fragor-och-svar/jag-har-gjort-en-begaran-om-tillgangraderingrattelse-men-de-kraver-att-jag-identifierar-mig.-far-de-gora-det), [IMY om svarstid](https://www.imy.se/vanliga-fragor-och-svar/har-jag-ratt-att-ta-del-av-en-ljudinspelning-dar-min-rost-forekommer/).

### 7.4 Dataskydd som löpande arbete

Plattformen ska ge underlag för behandlingsregister, konsekvensbedömningar, biträdesavtal, underbiträden, lagringsplatser, överföringar, incidenter och rättighetsbegäranden. Bedömningar ska vara knutna till verkliga funktioner och informationsflöden.

Föreslaget krav är att EWS, AI-stöd, omfattande elevanalys och provövervakning bedöms innan pilot med personuppgifter. Välj lagring och leverantörer utifrån sekretess, dataskydd, säkerhet och avtal; en etikett ”EU-moln” är inte en fullständig bedömning.

Tekniska säkerhetsloggar ska ha eget ändamål, åtkomst och lagringstid. De ska inte användas för att efterforska skyddade meddelare. Felaktig spridning ska gå att stoppa, utreda och rapportera med tidsstämplar från när organisationen fick kännedom om incidenten.

## 8. Utredningar, beredning och beslut

### 8.1 En gemensam ärendekärna med skilda processer

Alla utredningar behöver inte samma frågor, instanser eller formkrav. Plattformen ska ha en gemensam kärna för händelser, uppgifter, dokument, kommunikation, ansvar och uppföljning. Varje ärendetyp ska däremot ha ett eget godkänt processpaket.

Ett processpaket beskriver utlösande händelse, behörig mottagare, utredningsfrågor, underlag, elevdelaktighet, kommunicering, beslutsmandat, dokumentation, eventuell överklagandeväg och uppföljning. Det ska också ange vilka delar som saknar stöd för automatisering.

### 8.2 Ärendekatalog

| Familj | Ärendetyper som ska beskrivas och valideras |
|---|---|
| Elevens stöd | Särskilt stöd, åtgärdsprogram, uppföljning eller avslut av insatser, särskilda stödformer |
| Närvaro och skolgång | Upprepad eller längre frånvaro, skolpliktsbevakning, skolbyte och överlämning, studieavbrott |
| Trygghet och rättigheter | Kränkande behandling, trakasserier, sexuella trakasserier, klagomål och tillgänglighetsbrister |
| Ordning och säkerhet | Disciplinära åtgärder, misstänkt brott, hot och våld, beredskap, olyckor och tillbud |
| Bedömning och utbildningsväg | Pedagogisk kartläggning, mottagande i anpassad skolform, studieplan, betygsrättelse och särskilda utbildningsbeslut |
| Omsorg och samverkan | Oro för barn, samverkan med socialtjänst, överlämning till annan behörig aktör |
| Huvudmannabeslut | Placering, skolskjuts, tilläggsbelopp och andra ansökningar där ansvar ligger utanför den enskilda skolan |
| Informationsrätt och styrning | Utlämnande, dataskyddsrättigheter, personuppgiftsincidenter, arkiv- och gallringsärenden, tillsyn och kvalitetsbrister |

Katalogen utvidgar de 16 inledande kategorierna i dokument 03. Ambitionen är täckning av alla relevanta ärendetyper för vald skolform och huvudman. En typ räknas som täckt först när process, mandat, underlag och acceptansfall är granskade. Det ska inte finnas en vilseledande universalmall för ”alla utredningar”.

### 8.3 Från signal till faktisk insats

Exempel: en elev får återkommande frånvaro och missar undervisning. Mentorn ser en signal med källdata och kontrollerar att frånvaron inte beror på felaktigt schema. Eleven får möjlighet att beskriva situationen. En ansvarig tar ställning till fortsatt utredning och rätt process. Befintliga relevanta uppgifter följer med genom tydliga hänvisningar.

Vid beslutad insats anges vad som ska göras, av vem, från när och när effekten följs upp. Resursbehov blir en uppgift i planeringen. Läraren får en begriplig undervisningsinstruktion. Om insatsen inte genomförs ska systemet fråga efter hinder och nästa åtgärd, inte bara stänga uppgiften vid passerat datum.

### 8.4 Beslut som håller ihop

Beslutsvyn ska samla fastställda omständigheter, bedömning, rättsligt stöd, elevens synpunkter, eventuell kommunicering, beslutsfattare och mandat. Den ska också visa om ett beslut kan överklagas och hur. Förvaltningslagens tillämpning skiljer sig mellan situationer; skollagen gör vissa bestämmelser tillämpliga även hos enskilda huvudmän. [Skolverkets vägledning om förvaltningslagen](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/stod-for-gymnasieantagning/forvaltningslagen).

Ett utgånget delegationsbeslut ska inte ge fortsatt signeringsrätt. Digital signering ska identifiera beslutsfattaren och låsa den fastställda versionen, men signaturtypen måste väljas efter kravbild; avancerad e-signatur ska inte krävas slentrianmässigt för varje anteckning.

Akuta skyldigheter får inte stoppas av ofullständiga formulär. Det ska gå att registrera och eskalera en brådskande händelse med komplettering senare. Anmälningar om oro, kränkningar och brott är skilda processer och kan behöva löpa parallellt.

### 8.5 Säkerhetsarbete och brottsanmälan

Skollagens kapitel om säkerhetsarbete i brottsförebyggande syfte gäller sedan den 1 juli 2025. Skolverkets vägledning beskriver bland annat beredskap och rektors skyldighet att polisanmäla misstänkta elevbrott i samband med verksamheten, med lagens undantag. [Skolverket om säkerhetsarbete](https://www.skolverket.se/larande-och-trygghet/trygghet-vardegrund-och-arbetsmiljo/brottsforebyggande-arbete/sakerhetsarbete-i-brottsforebyggande-syfte).

Produktförslaget är en särskild beredningsväg för rektor: verifiera händelse, dokumentera bedömning, skilj polisanmälan från annan uppgiftsskyldighet och säkra fortsatt stöd till eleven. Systemet ska inte automatiskt anmäla en elev utifrån en EWS-signal. Krisinformation ska vara rollanpassad; detaljerade säkerhetsplaner får inte spridas som vanliga nyheter.

### 8.6 Ärendet är en process med ett syfte

Ett ärende ska öppnas därför att något behöver utredas, prövas, beslutas, genomföras eller följas upp av verksamheten. Ett inkommande mejl är en möjlig utlösande händelse och en handling bland flera. En iakttagelse i undervisningen, ett formulär, ett samtal, en avvikelse eller en ansökan kan vara lika relevant. Kommunikation är underlag och samordning inom processen; ett besvarat meddelande betyder inte att processen är färdig.

Varje ärende ska ha en tydlig fråga, önskat verksamhetsresultat, utlösande händelse med verklig tidpunkt, ansvarig funktion, utsedd handläggare och ersättare. Processpaketet anger vad som måste klarläggas, vilka uppgifter som kan göras parallellt, vilka beslut som krävs och hur effekten ska följas upp. För en informationsbegäran kan resultatet vara prövad tillgång och korrekt besked. För ett stödärende behöver resultatet omfatta faktisk insats och uppföljning enligt den specifika processen.

Processen måste kunna ändras när nya omständigheter framkommer. Om en klassificering var fel ska historiken bevaras och ansvarig pröva rätt process utan ny mottagningstid. Ärendet får inte döljas genom att flyttas mellan inkorgar. Det ska framgå vilken skyldighet som fortfarande återstår och vem som kan agera.

### 8.7 Tillstånd ska beskriva vad som händer

Den gemensamma modellen nedan är ett produktförslag. Varje processpaket väljer tillämpliga steg och regler. Ett ärende som inte kräver formellt beslut ska inte tvingas skapa ett konstlat beslut för att gå vidare.

| Tillstånd | Innebörd och nästa kontroll |
|---|---|
| Mottaget | Händelsen är registrerad och ska nå behörig funktion; brådskande skyldigheter aktiveras direkt |
| Ansvar fördelat | Handläggare och ersättare finns; syfte, omfattning och process är preliminärt klarlagda |
| Utredning pågår | Underlag samlas, sakuppgifter kontrolleras och berördas perspektiv hanteras |
| Väntar på underlag | Specificerat underlag saknas; ansvar, bevakning och fortsatt möjliga aktiviteter är synliga |
| Klart för ställningstagande | Tillämpliga beredningskontroller är genomförda och kvarvarande osäkerhet synlig |
| Beslut fattat | Giltig beslutsversion finns där beslut krävs; genomförande och kommunikation kan återstå |
| Genomförande pågår | Insats eller annan åtgärd utförs; hinder och avvikelser har ansvarig |
| Effekt följd upp | Utförande och resultat har bedömts mot syftet; fortsatt åtgärd kan behövas |
| Avslutsprövning | Behörig funktion granskar återstående skyldigheter och dokumenthantering |
| Avslutat | Avslutsgrund, kvarvarande externa samband och hanteringsregler är dokumenterade |
| Återöppnat | Nya omständigheter eller bristande effekt har krävt fortsatt arbete med bibehållen historik |

Väntan är också ett tillstånd på enskilda uppgifter. Ett ärende kan fortsätta utredas medan ett underlag väntas in. Hela processen ska inte frysa för att en extern aktör inte svarar. Ingen väntemarkering stoppar automatiskt en lagstadgad tidsregel. Lokal planering, rättslig frist och faktisk förfluten tid visas separat.

### 8.8 Uppgifter och ansvar med kontrollerad överlämning

En uppgift ska säga vad som ska åstadkommas och vad som räknas som utfört, med ansvarig, tidpunkt, beroenden och nödvändigt underlag. ”Läs mejlet” kan vara en aktivitet men är sällan ett tillräckligt resultat. ”Kontrollera att beslutade lektionstillfällen faktiskt har genomförts och redovisa avvikelse” går att följa upp.

Vid överlämning utses en mottagande funktion och det framgår om ansvaret accepterats. Tills dess finns en ansvarig funktion kvar som kan bevaka arbetet. Sjukfrånvaro, personalbyte och utgången delegation får inte skapa ägarlösa processer. Tillfällig ersättare får relevant åtkomst under uppdraget, inte automatiskt allt tidigare material från den frånvarande personen.

En väntan ska innehålla vad som saknas, vem som ska bidra, när efterfrågan gjordes, nästa bevakning och vad skolan gör om underlaget uteblir. En påminnelse är inte en överföring av rättsligt ansvar. Systemet kan föreslå eskalering till processägare men ska inte själv avgöra att en skyldighet har upphört.

### 8.9 Parallella skyldigheter utan obegränsad delning

En händelse kan aktualisera flera processer. En uppgift om kränkning i samband med frånvaro kan kräva hantering av trygghet, närvaro och stöd; vid ytterligare omständigheter kan andra anmälningsskyldigheter behöva bedömas. Varje process har eget syfte, ansvar, tidsregel och avslut. Ett färdigt stödärende stänger inte automatiskt en utredning om kränkning.

Gemensamt ursprung kan länkas genom en begränsad händelsereferens. Varje informationsöverföring måste ändå följa åtkomst och rättslig prövning. Koppling mellan ärenden får inte ge en mentor insyn i hela trygghetsutredningen eller medicinsk journal. Den som saknar åtkomst kan vid behov se en begränsad uppgift om att behörig funktion hanterar en relaterad fråga, om även den uppgiften får delas.

Processöversikten visar parallella spår med egna statusar. En akut uppgift kan fortsätta trots att en planerad uppföljning ligger långt fram. Bevakningen ska gå till ansvarig roll med minsta nödvändiga information. Notiser med känsliga rubriker ska inte spridas till en stor grupp bara för att flera processer är länkade.

### 8.10 Underlag och bedömning får inte flyta ihop

Ärendets underlagslista skiljer uppgiftslämnarens påstående, kontrollerad sakuppgift, professionell bedömning och fastställt beslut. En tjänsteanteckning ska visa vem som dokumenterade vad någon annan sa. Motstridiga uppgifter ska kunna stå kvar med källor; de får inte skrivas över till en skenbar gemensam sanning.

Underlag som används i beslut ska knytas till en bestämd version. Det gäller e-post, intern chatt, formulär, bilagor, kommentarer, tjänsteanteckningar och utgående svar. Förändringar efteråt behöver ett nytt spår eller en rättelse, inte en tyst förändring av den historiska akten. Original, delningskopia och eventuell utlämnandekopia ska kunna särskiljas.

Fångst av kommunikation måste ha beslutad omfattning och ändamål. Plattformen ska stödja verksamhetskommunikation i godkända kanaler och kontrollerad tillförsel av relevant material från andra kanaler. Den ska inte massinsamla privat eller facklig kommunikation. Intern etikett, en viss kanal eller PDF-export avgör inte om innehållet är allmän handling, sekretessbelagt eller bevarandepliktigt. Kapitel 5–7 styr denna bedömning.

### 8.11 Beslut måste följas av genomförande

Inför ett beslut kontrolleras tillämpligt mandat, beslutsversion, nödvändiga underlag, berördas möjlighet att komma till tals och aktuell beslutsväg. Kontrollen ska skilja obligatoriska rättsliga förutsättningar från lokala kvalitetsönskemål. Systemet får inte fördröja en akut skyldighet därför att en rekommenderad bilaga saknas.

När beslut fattats skapas de genomförandeuppgifter som beslutet faktiskt kräver. Varje insats har utförare, start, omfattning, resurs och uppföljning. Ett schemalagt stödpass är ännu inte ett genomfört stödpass. Om resurs saknas ska hindret föras till den som kan lösa det, och eleven ska inte felaktigt anges ha fått insatsen.

Kommunicering före beslut, information om beslut, expediering, leveransstatus och eventuell delgivning är skilda händelser. Ett öppnat meddelande får inte ersätta särskilda rättsliga krav. Samtidigt ska det vara möjligt att se vilka mottagare som fått den relevanta beslutsversionen och vad som behöver göras vid misslyckad leverans.

### 8.12 Uppföljning och avslut med belägg

Uppföljningen ska skilja mellan planerad, påbörjad och utförd insats, och därefter mellan utförande och effekt. Den ansvarige kan ange vad som faktiskt hände, elevens perspektiv, relevant underlag och vad resultatet innebär. Ett uteblivet resultat behöver analyseras: insatsen kanske inte genomfördes, prövades för kort tid eller behöver ändras.

Avslutskriterier väljs för ärendetypen. Föreslagna gemensamma kontroller är att obligatoriska uppgifter och beslut är hanterade, nödvändigt genomförande är verifierat, uppföljning är gjord när processen kräver det, kvarvarande risker eller skyldigheter har ansvarig och handlingarnas fortsatta hantering är bestämd. Avslut kan ske av olika skäl, exempelvis färdigbehandlat, avvisat, återtaget eller överlämnat, men rätt skäl och rätt beslutsgrund måste användas. Samtliga processer kräver inte uppnådd positiv effekt som juridiskt avslutsvillkor.

Om effekten inte är tillräcklig ska systemet föreslå fortsatt arbete eller ett nytt ställningstagande. Det ska inte kräva att handläggaren hittar på ett lyckat resultat för att kunna arbeta vidare. Ett avslutat ärende kan återöppnas med orsak, ansvar och ny arbetsperiod, eller kopplas till ett nytt ärende när verksamhetsreglerna kräver det. Tidigare beslut och historik består; ett överklagande eller rättelse hanteras i sin korrekta process.

### 8.13 Ett stödärende genom alla steg

I ett syntetiskt exempel har rektor initierat utredning om stödbehov efter lärarens observationer och elevens uppgifter. Processvyn visar syftet ”säkerställa fungerande stöd i undervisningen”, ansvarig funktion och underlag från elev, lärare och relevant elevhälsokompetens. Ett mejl från vårdnadshavare kopplas till underlagslistan med original och bilaga. Att svara på mejlet ändrar inte ärendets status.

Utredningen kan fortsätta medan ett underlag väntas in. Väntan har ansvarig och bevakningsdatum. När beredningen är klar fattas det beslut som utredningens resultat och tillämpliga regler kräver. Designexemplet förutsätter att ett åtgärdsprogram har beslutats; det är inte en generell mall som avgör stödform. Därefter visas ”beslut fattat”, medan genomförandet fortfarande har öppna uppgifter.

Två planerade stödtillfällen ställs in eftersom resurs saknas. Utföraren markerar hinder och rektor får ansvar att lösa det. Ärendet visar ”genomförande pågår” och faktiskt utförande, inte grönt bara för att beslutet är signerat. Vid uppföljning framgår att insatsen efter ändringen genomförts men att effekten ännu behöver bedömas tillsammans med eleven.

När uppföljningen finns gör behörig funktion ett ställningstagande om fortsatt stöd, ändring eller avslut enligt rätt process. Om ett separat närvaroärende pågår syns dess ansvar och tillåtna status, men det stängs inte av stödärendets avslut. Designen ska kunna visa försök till för tidigt avslut, en motiverad ändring och återöppning. Acceptans: A42–A45 samt A48–A50.


## 9. EWS som stöd för tidiga insatser

Arbetsantagandet är att EWS betyder tidig upptäckt och uppföljning av elever som kan behöva stöd. Modellen ska börja med begripliga signaler: frånvaromönster, förändring över tid, saknade bedömningsunderlag och personalens dokumenterade oro. En utebliven inlämning ska inte automatiskt räknas som misslyckande eller otillräckliga kunskaper.

Varje signal visar ursprung, aktualitet, datakvalitet, vad som förändrats och ansvarig uppföljare. Det ska gå att rätta fel, markera att en känd situation redan hanteras och ange när signalen ska omprövas. Saknade uppgifter ska beskrivas som saknade, inte som låg risk.

**Rekommenderad första modell:** transparenta regler och mänsklig bedömning, utan en sammanvägd riskpoäng som etikett på eleven. Systemet ska också visa grupp- och organisationsmönster, exempelvis undervisning som faller bort eller många elever som saknar samma underlag. Problem ska inte automatiskt förklaras med eleven.

EWS ska följas upp med både falska signaler och missade behov, samt om stödet nådde eleven. Personuppgifter för analys får inte bli en generell datakälla för framtida ändamål. Eleven ska kunna få begriplig information och felaktiga sakuppgifter ska kunna rättas.

## 10. Planering, schema och vikariebank

### 10.1 En obruten kedja

Utbildningsutbud och timplan → undervisningsgrupper → tjänstefördelning → schemaförslag → publicerat schema → genomförande → uppföljning.

Varje steg ska återanvända stabila identiteter. Planerad, schemalagd och genomförd tid ska skiljas åt. Inställda lektioner får inte räknas som genomförd undervisning. Gruppbyten och alternativa studieplaner ska ha giltighetsdatum.

Plan Digital är referens för timplaner, tjänsterader, budget och kontrollvyer. Royal Schedule är huvudreferens för schemaläggning. Förslaget behöver både kunna samverka med dessa system och på sikt ersätta valda arbetsmoment. En upptäckt exportmöjlighet ska hanteras som filöverföring tills annat är verifierat. [Royal Schedules funktionsbeskrivning](https://www.royalschedule.com/education/features).

### 10.2 Schemaläggning som går att förstå

Planeraren ska kunna låsa det som redan är bra och be systemet lösa en avgränsad konflikt. Förslagen ska visa berörda elever, lärare, rum, undervisningstid, förflyttningar och arbetsbelastning. Vid olösbarhet ska systemet ange vilka villkor som krockar och vilka verksamhetsbeslut som kan öppna en lösning.

Hårda villkor kan gälla dubbelbokning, nödvändig lokal, tillgänglighet och tillämpliga tidsregler. Mjuka önskemål kan gälla håltimmar, ämnesfördelning över veckan och personliga preferenser. Vad som är hårt avgörs av verksamhet och rättsligt eller avtalsmässigt stöd; lärarpreferenser får inte presenteras som lag.

Ändringsvyn ska visa alternativ A och B med konkret effekt, exempelvis ”två lektioner flyttas” och ”samma lärare behålls”. Ett procenttal som ”97 % optimalt” är otillräckligt utan definition. Publicering ska ske till ett tydligt giltighetsdatum, med förhandsvisning av mottagare och begriplig ändringsavisering.

### 10.3 Gymnasiets och grundskolans behov

Gymnasiet behöver parallella regelverk för utbildningskullar, GY11/GY25, ämnesnivåer eller kurser, program, individuella val, APL och studievägar. Grundskolan behöver årskurser, ämnestid, gruppdelning, språkval, praktisk-estetiska lokaler och stödinsatser. Samläsning får inte dölja att elever har olika utbildningsmål eller tidskrav.

Planeringen ska kunna modellera deltid, flera skolor, restid, tillfälliga grupper, lov, studiedagar, växelvisa veckor och lokala arbetstidsavtal. Kontroll av behörighet och registerkontroll ska bygga på behörig HR-funktions verifierade uppgifter, inte fritt tolkade fritextfält.

### 10.4 Vikariebanken

När en lärare blir frånvarande ska berörda lektioner identifieras och lämpliga tillgängliga ersättare föreslås. Behörighet, introduktion, avtal, tillgänglighet och uppdragets krav ska vara synliga för rätt roll. Den valda vikarien får ett sammanhållet lektionspaket med schema, lokal, material, nödvändiga anpassningar och kontaktväg.

Bokningen ska tåla att två personer försöker boka samma vikarie samtidigt. En förfrågan är inte en bokning. Ett accepterat uppdrag ska skapa tidsbegränsad åtkomst och en tydlig bekräftelse. När uppdraget avslutas stängs åtkomsten, genomförandet följs upp och rätt underlag går till ersättningshantering.

## 11. Undervisning och lärande

### 11.1 Pedagogiken är en likvärdig kärna

Plattformen ska hjälpa lärare att planera och genomföra undervisning och elever att förstå, pröva, få respons och utveckla sitt kunnande. Administrationens kvalitet ska frigöra utrymme för detta arbete. Den pedagogiska delen är därför en egen kärna med samma produktmässiga vikt som schema, informationsförvaltning och ärenden. En lyckad pilot måste visa båda delarna.

Arbetskedjan är arbetsområde → lektion → aktivitet → elevens arbete → återkoppling → bearbetning → professionell bedömning → nästa undervisning. Kedjan behöver kunna gå tillbaka och förgrena sig. Alla aktiviteter ger inte en inlämning, alla inlämningar ska inte bedömas och varje bedömning är inte ett betyg. Samtal, muntliga prestationer, laborationer, läsning, praktiskt arbete och samarbete ska kunna ingå utan påhittade filer eller onödiga registreringar.

Vanlig undervisning ska inte behandlas som ett formellt ärende. Läraren ska kunna ändra sin nästa lektion utan att skapa beslut, beredning och avslutsprövning. Verksamhetens informationshanteringsregler arbetar i bakgrunden. När ett verkligt utredningsbehov uppstår ska relevanta observationer kunna hänvisas till ett avgränsat ärende med annan behörighet och ansvarskedja.

Forskningsanknuten myndighetsvägledning ger en viktig utgångspunkt: bedömning i formativt syfte ska ge information som används för att stödja elevens fortsatta lärande och utveckla undervisningen. Återkoppling som eleven aldrig får möjlighet att använda är därför otillräcklig som produktmål. [Skolverket om bedömning i formativt syfte](https://www.skolverket.se/prov-och-bedomning/bedomning/bedomning-i-formativt-syfte).

### 11.2 Planera ett arbetsområde med tydligt innehåll

Läraren börjar med skolform, grupp, ämne och aktuell kurs eller ämnesnivå. Plattformen visar den styrdokumentsversion som gäller för elevernas utbildning. Läraren väljer relevant syfte och centralt innehåll och beskriver vad eleverna ska få möjlighet att lära sig. Systemet ska bevara källhänvisningen och skilja lärarens begripliga elevtext från styrdokumentets original. Förslag på kopplingar får inte bli automatiskt fastställd läroplanstäckning.

Arbetsområdet ska innehålla en undervisningsidé, förkunskaper att undersöka, centrala begrepp, förväntade svårigheter, aktiviteter, material, planerade möjligheter att visa kunnande och tid för återkoppling. Fält kan döljas och återanvändas; de är stöd för planeringen, inte en obligatorisk lång blankett för varje lektion. Läraren ska kunna göra en enkel planering först och komplettera bara där det behövs.

En översikt över terminen visar vad som planerats och faktiskt undervisats om. En markerad innehållspunkt är inte bevis för att eleverna behärskar den. En inställd lektion lämnar ett synligt undervisningsbehov. Systemet föreslår omplanering med hänsyn till verkligt schema, material och gruppens arbetsbelastning. Lärare kan dela ett arbetsområde och anpassa det till sin grupp utan att ändra kollegans version.

Återanvändning ska ha en förhandskontroll: gamla elever tas bort, datum flyttas som förslag, externa materialrättigheter kontrolleras och ändrade styrdokument markeras. Elevlösningar och personliga kommentarer följer inte med i en mall. Kollegial planering skiljer gemensamt innehåll från gruppspecifika anpassningar och enskilda elevers uppgifter.

### 11.3 Lektionen binder samman planering och genomförande

Lektionsvyn ska svara på vad gruppen ska göra nu, varför det görs, vilket material som behövs och hur läraren kan få syn på förståelsen. Läraren kan lägga en inledning, modellering, egen eller gemensam övning, avstämning och avslutning i en enkel följd. Tidsangivelser är stöd och går att ändra; de ska inte skapa prestationsövervakning av läraren.

En aktivitet kan kopplas till flera lektioner och en lektion kan rymma flera aktiviteter. Schemat anger när gruppen möts. Planeringen anger vad undervisningen ska innehålla. Vid schemaflytt följer lektionskopplingen med, medan inlämningsdatum bara flyttas efter ett medvetet val. Detta undviker att ett flyttat pass tyst ändrar elevers deadlines.

Genomförandevyn bör ha en presentationsvy som bara visar gruppens material. Individuella anpassningar, privata noteringar och elevlistor ska inte råka projiceras. När läraren öppnar närvaro eller stöd lämnar systemet presentationsläget tydligt. En vikarie får lektionsmål, material, kontaktväg och nödvändiga instruktioner för sitt uppdrag. Vikariens återrapportering kan visa vad gruppen hann och vad ordinarie lärare behöver återkomma till.

### 11.4 Aktivitet och uppgift med olika vägar till samma lärande

Uppgiften ska samla elevinstruktion, mål, material, arbetsform, tidsram, redovisningsform och tillåtet stöd. Läraren kan tilldela en hel grupp, mindre grupper eller individer. Differentiering får inte innebära att elever exponeras för andra elevers stödbehov. Elevens vy visar bara den egna relevanta varianten och gemensamma instruktioner.

Grundfunktionerna ska omfatta materialbibliotek, uppgifter, utkast och schemalagd publicering, individuella kopior, frågor, kommentarer, återlämning, komplettering och bedömningsunderlag. Detta motsvarar den funktionella bredd som undersökts i Classroom-katalogen. Googles tilldelnings- och återlämningsfunktioner är leverantörsbeskrivna; vår föreslagna koppling till svenska styrdokument och stödprocesser är egen produktdesign. Se dokument 05 samt [Googles uppgiftsbeskrivning](https://support.google.com/edu/classroom/answer/6020265?hl=en) och [bedömning och återlämning](https://support.google.com/edu/classroom/answer/6020294?hl=en). Källstatus och återstående integrationsverifiering finns i researchmatrisen.

En elev ska kunna lämna text, fil, bild, ljud eller video när uppgiften medger det, eller få en muntlig eller praktisk prestation dokumenterad av läraren. Stora mediefiler behöver avbrottstålig uppladdning och tydlig mottagningsstatus. Uppladdad fil är inte samma sak som inlämnat arbete. För externa dokument måste länkrättighet, aktuell version och en överenskommen bevarandestrategi kunna kontrolleras.

Läraren ska kunna ändra en uppgift utan att elevens påbörjade arbete blir oförståeligt. Ändringsvyn visar vad som ändrats, vilka elever som berörs och om tidigare version fortfarande gäller för någon elev. Ändrat mål eller redovisningssätt efter inlämning kräver ett uttryckligt ställningstagande. Systemet ska inte retroaktivt presentera en ny instruktion som den eleven ursprungligen fick.

### 11.5 Elevens arbetsyta och begriplig status

Elevens start ska prioritera pågående arbete och nästa meningsfulla handling: fortsätt skriva, prova igen, använd återkoppling, förbered samtal eller lämna in. En lista med röda förseningar får inte dominera. Eleven behöver kunna se hela veckans belastning med större uppgifter, prov och APL, samtidigt som läraren kan upptäcka krockar utan att få obegränsad insyn i andra ämnens elevarbeten.

Föreslagna tillstånd är inte påbörjat, arbete pågår, redo att lämna in, mottaget, återkoppling finns, bearbetning pågår och färdigt för denna omgång. Undantag som befriad, annan redovisningsform, väntar på material eller tekniskt problem ska vara möjliga. Utebliven fil ska aldrig automatiskt bli F eller ett påstående om otillräckliga kunskaper.

Eleven ser vilken version som lämnats in och när den mottogs, kan jämföra den med sin bearbetning och får ett tydligt besked om återlämning. Vid nätavbrott ska systemet visa vad som bara finns på enheten. Planerad kontinuitet kan vara utskrivbart material, lokalt arbete eller alternativ redovisning; inget generellt löfte om full offlinefunktion görs före enhetsprov.

Elevens reflektion ska kunna hållas privat tills den delas. Den får inte vara ett dolt EWS-underlag. Data för att förstå nästa steg ska vara proportionerliga. Plattformen ska inte samla tangenttryckningar, skärmbilder eller ständig aktivitet för att bedöma flit.

### 11.6 Återkoppling ska bli användbar handling

Återkopplingsvyn ska knyta en konkret observation till en begriplig uppgift för eleven. Exempel: ”Din tes är tydlig. Lägg till ett belägg för det andra argumentet och förklara varför det stödjer tesen.” Eleven får en plats att bearbeta, möjlighet att fråga och tid i planeringen för att använda rådet. Kommentaren ska vara kopplad till rätt arbetsversion; efter en ändring ska läraren se vad kommentaren avsåg.

Läraren kan skilja respons för fortsatt arbete från sammanfattande bedömning. Eleven kan markera att en kommentar behöver förklaras eller visa var den har använts. En läskvittens räknas inte som förståelse. ”Återkoppling använd” ska kunna underbyggas av ändrat arbete eller ett samtal, utan att varje elev tvingas skriva en separat redogörelse för varje kommentar.

Skolverkets material om öppna laborationer lyfter bland annat kamratbedömning och att elever behöver få använda återkoppling. Produktförslaget är därför att en återkopplingsomgång kan reservera bearbetningstid och skapa en ny jämförbar version. Det ska gå att genomföra muntligt också. [Skolverket om formativt arbete med öppna laborationer](https://www.skolverket.se/kompetensutveckling/stod-i-arbetet/arbeta-formativt-med-oppna-laborationer).

På gruppnivå samlar läraren vanliga missförstånd och väljer vad som ska ändras i nästa undervisning. Plattformen kan visa att flera elever behöver en ny förklaring av samma begrepp, men ska inte automatiskt diagnostisera orsaken. Ett missförstånd kan bero på uppgiftens formulering, materialet, förkunskaper eller hur undervisningen genomfördes.

Skolforskningsinstitutets systematiska översikt ger ytterligare stöd för att låta eleven använda feedback under skrivförloppet. Den avser skrivundervisning och är en äldre översikt, inte ett effektbevis för denna plattform. Produktvalet är att prioritera bearbetning i samma arbetsflöde, med läraren som ansvarig för innehållet. [Feedback i skrivundervisningen](https://www.skolfi.se/forskningssammanstallningar/systematiska-forskningssammanstallningar/feedback-i-skrivundervisningen/).

### 11.7 Övning med återkoppling och stöd

Övningsläget ska vara tydligt skilt från examination. En elev kan få ledtrådar, förklaringar, exempel och nya försök. Läraren bestämmer när ett svar ska avslöjas och vilka hjälpmedel som är tillgängliga. Rätt svar efter fem ledtrådar ska inte presenteras som samma underlag som självständig problemlösning. Däremot kan det vara värdefull information om elevens lärande och vilket stöd som hjälper.

Google beskriver practice sets med interaktiva uppgifter och möjlighet att lägga till stödresurser; funktionen kräver Education Plus eller Teaching and Learning Upgrade enligt den granskade hjälpsidan. Det bevisar inte att samma funktion kan användas via ett eget integrationsgränssnitt. [Google om practice sets](https://support.google.com/edu/classroom/answer/13455315?hl=en).

Eget övningsstöd behöver en innehållsgranskning som testar fler korrekta svar, språkvarianter, enheter och matematiskt ekvivalenta uttryck. Felaktig automatisk respons ska gå att rapportera och rätta, och läraren ska kunna se vilka elever som kan ha fått den. Elevens försök ska inte göras till betyg genom en generell poängformel. Adaptiva förslag är ett framtida separat produktval, med dataskydds- och AI-prövning när användningen kräver det.

Skolforskningsinstitutets översikt om digitala lärresurser i matematik lyfter betydelsen av avgränsat ämnesinnehåll och integration med övrig undervisning. Det motiverar ett produktförslag där en digital övning kan leda till en lärarledd aktivitet med konkreta material eller samtal. Allt lärande behöver inte ske på skärmen. Översiktens publiceringsår och studiernas avgränsning ska skiljas från webbsidans uppdateringsdatum; resultaten garanterar ingen effekt av vår design. [Digitala lärresurser i matematikundervisningen](https://www.skolfi.se/forskningssammanstallningar/systematiska-forskningssammanstallningar/digitala-larresurser-i-matematikundervisningen/).

### 11.8 Samarbete och ämnesövergripande undervisning

Gruppuppgifter ska ange gemensamt mål, roller, arbetsmaterial och hur varje elev får visa sitt kunnande. Gemensam produkt och individuell bedömning hålls isär. Versionshistorik kan hjälpa till att förstå arbetet, men antal redigeringar får inte automatiskt avgöra betyg eller arbetsinsats. Eleven som sammanfattar muntligt eller bygger en modell kan bidra utan många digitala ändringar.

Kamratrespons behöver tydligt syfte, avgränsade kriterier och lärarens val av grupper och synlighet. Eleven ser det arbete och den respons som delats för aktiviteten. Privata lärarkommentarer och stödanteckningar ingår inte. Kränkande respons ska kunna rapporteras och hanteras; undervisningsaktiviteten behöver inte göras om till ett ärende för samtliga elever.

Vid ett ämnesövergripande projekt kan flera lärare använda samma arbetsområde, kalender och slutprodukt men ange olika ämnesmål och bedömningsunderlag. Exempelvis kan ett vattenprojekt förena naturvetenskaplig undersökning, matematisk bearbetning och argumenterande text. Gemensam deadline ska inte bli ett gemensamt betyg. Ämnesläraren kan välja vilka delar som är relevanta och komplettera med individuellt samtal.

Ämneslag ska kunna göra sambedömning på ett avgränsat underlag, med avidentifiering när den är lämplig och genomförbar. Kollegans återkoppling är rådgivande underlag. Plattformen visar vem som ansvarar för den slutliga professionella bedömningen. Att flera lärare har öppnat ett arbete är inte ett kvalitetsmått.

### 11.9 Progression och sammantagen bedömning

Progressionsvyn ska visa ett urval av belägg över tid: vilken prestation, i vilket sammanhang, med vilket stöd och hur aktuell den är. Läraren behöver kunna skilja mellan att innehåll behandlats, att ett underlag finns och vad eleven faktiskt har visat. Osäkerhet och saknat underlag ska synas utan att fyllas med nollvärden. Eleven får en begriplig berättelse om vad som utvecklats och nästa steg, inte en permanent färgprofil.

I Gy25 sätts betyg efter avslutad nivå utifrån en sammantagen bedömning vid betygssättningstillfället. Ett godkänt betyg på högre nivå ersätter tidigare betyg, medan F eller streck på högre nivå inte tar bort godkända lägre betyg. Plattformen måste därför känna till utbildningskull och nivå och får inte använda ett medelvärde av tidigare uppgiftspoäng som betyg. [Skolverket om betygssättning i ämnen](https://www.skolverket.se/prov-och-bedomning/betyg/fran-bedomningar-till-betyg/betygssattning-i-amnen-gy25).

Gy11 och Gy25 ska finnas parallellt för berörda elevkullar. Övergången innebär att uppgifter inte bara kan kopieras mellan kurser och nivåer med samma namn. [Skolverket om Gy25](https://www.skolverket.se/styrning-och-ansvar/forandringar-inom-skolomradet/gy25----amnesbetyg-pa-gymnasial-niva). För grundskolan ska motsvarande vy följa rätt kursplan och årskursens bedömningssammanhang. Bedömningsmatriser kan vara ett frivilligt stöd, men rutkryss får inte mekaniskt beräkna betyg.

Inför betygssättning ska läraren se underlagens bredd, aktualitet och eventuella motsägelser. Systemet hjälper till att hitta underlag och dokumentera relevanta överväganden. Beslut, låsning, publicering och rättelse av formellt betyg ska följa ett särskilt kontrollerat flöde med behörighet och historik. En rättning av en uppgift ändrar inte ett redan fastställt betyg i bakgrunden.

Kunskaper kan visas utanför en i förväg konstruerad matris. Underlag ska därför kunna tillföras från ett oväntat men relevant tillfälle och beskrivas i fri form. Ingen lektion ska kräva klick på varje betygskriterium för att kunna avslutas. [Skolverket om vägen från bedömningar till betyg](https://www.skolverket.se/prov-och-bedomning/betyg/fran-bedomningar-till-betyg).

### 11.10 Anpassningar i den faktiska undervisningen

Läraren behöver handlingsbara instruktioner: dela upp uppgiften, erbjud uppläst text, gör begreppen tillgängliga, använd alternativ redovisning eller säkerställ lugn arbetsplats. Instruktionen anger omfattning, ansvar och tidpunkt för uppföljning. Den ska kunna följa med till relevant lektion, vikarie och provkonfiguration utan att elevens diagnos eller hela utredning kopieras.

SPSM beskriver tillgänglighet genom social, pedagogisk och fysisk lärmiljö. Designen måste därför kunna fånga hinder i undervisning och miljö, utöver individuella egenskaper. [SPSM om tillgänglighetsmodellen](https://www.spsm.se/stodmaterial-for-tillganglig-utbildning/tillganglig-utbildning/tillganglighetsmodellen-fran-spsm/). Ett gruppgemensamt tydligare upplägg kan vara bättre än många separata individuella uppgifter.

Extra anpassningar och särskilt stöd ska särskiljas. Plattformen ska hjälpa till att initiera rätt utredning när den behövs och får inte kräva att läraren först genomför ett visst antal misslyckade anpassningsomgångar. Lagens tillämpning behöver bedömas för situationen. [Skolverket om stöd och åtgärdsprogram](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/extra-anpassningar-sarskilt-stod-och-atgardsprogram).

Uppföljningen ska fråga både om instruktionen genomfördes och om den hjälpte eleven. Om en uppläst text inte gick att öppna är utebliven effekt inte belägg för att anpassningen saknar värde. Om en resurs saknas ska rektor få ett genomförandehinder att lösa; läraren ska inte behöva skriva samma information i flera moduler.

### 11.11 IUP och utvecklingssamtal

Samtalsvyn ska samla relevanta aktuella lärarunderlag, elevens egen röst, frågor och framåtsyftande överenskommelser. Varje lärare behöver kunna lämna ett kort men användbart underlag utifrån undervisningen. Sammanställningen ska visa källa och datum så att gamla omdömen inte presenteras som aktuella. Eleven ska kunna välja arbetsexempel som visar utveckling och förbereda frågor med stöd anpassat till ålder.

Skolverkets vägledning skiljer utvecklingssamtal från skyldigheten att upprätta skriftlig IUP. Kravet på IUP gäller berörda årskurser där betyg inte sätts, och får inte läggas som universellt krav på alla grundskole- och gymnasieelever. [Skolverket om utvecklingssamtal och IUP](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/utvecklingssamtal-och-skriftlig-individuell-utvecklingsplan-iup).

Efter samtalet ska valda överenskommelser bli konkreta nästa steg med ansvar och uppföljning. En lärare kan exempelvis ändra material, eleven pröva en studierutin och mentor följa upp hur det fungerar. Samtalet skapar inte automatiskt ett åtgärdsprogram. Om nya uppgifter aktualiserar ett stödärende ska behörig person kunna initiera det och hänvisa till relevant del av underlaget.

Vårdnadshavarens vy måste prövas separat. Den ska inte spegla all elevens privata arbetsyta eller lärarnas interna material. För myndig gymnasieelev ändras tillgången enligt beslutad rättslig hantering. En gammal kalenderinbjudan eller delad länk får inte ge fortsatt åtkomst till nya uppgifter.

Dokumentationskraven ska vara skolforms- och årskursstyrda. Det finns inget generellt krav att dokumentera själva utvecklingssamtalet eller upprätta skriftliga underlag inför det i alla årskurser. För extra anpassningar saknas ett generellt dokumentationskrav där IUP inte behöver upprättas; en lokal rutin ska märkas som lokal. Ett kort användbart stöd kan erbjudas utan obligatoriska formulär, kriterieklick eller nya dubbla omdömen. Samma Skolverketskällor ovan beskriver dessa gränser.

### 11.12 APL som planerat lärande på arbetsplatsen

APL ska ha ett sammanhållet förlopp före, under och efter placeringen. Skolverkets stöd beskriver ansvarsfördelning, kvalitetssäkring, uppföljning och bedömning av lärande. [Skolverkets APL-lathund](https://www.skolverket.se/sok-publikationer/publikationsserier/ovrigt-material/2025/planera-genomfor-och-folj-upp-arbetsplatsforlagt-larande). Den konkreta utformningen nedan är ett produktförslag för gymnasiet; komvuxregler används inte som generell grund.

Före start väljer ansvarig vilka delar av utbildningen som ska genomföras på arbetsplatsen. Placeringen kopplas till elev, period, handledare, ansvarig lärare, lärandemål, lämplighetskontroll och planerade uppföljningar. Arbetsmiljö- och säkerhetsbedömningar behöver ett eget granskat ansvar och underlag. Plattformen ska inte förklara en plats godkänd enbart för att adress och kontaktperson är ifyllda.

Under APL får eleven en lättanvänd mobil vy med veckans fokus, reflektion och kontaktväg. Handledaren kan lämna avgränsade observationer om arbetsuppgifter och utveckling. Handledaren behöver inte se betyg, elevhälsouppgifter eller andra placeringar. Läraren följer upp om eleven faktiskt fått möjlighet att arbeta med planerat innehåll och bokar trepartssamtal vid behov.

Om en arbetsplats bara erbjuder repetitiva uppgifter ska systemet synliggöra saknade lärandemöjligheter. Läraren kan ändra planeringen eller begära annan lösning. Frånvaro, säkerhetshändelse och otillräckligt lärande är olika frågor och kan kräva parallella åtgärder. Timmar på arbetsplatsen är inte i sig ett kunskapsbelägg.

Efter APL sammanställer läraren relevant underlag och bedömer kunskaper i rätt ämne eller kurs. Handledarens observationer är underlag, inte ett självständigt ämnesbetyg. Kvarvarande undervisningsbehov återförs till skolans planering. Placeringens kvalitet följs upp utan att skapa offentliga elev- eller handledarrankningar. Handledarens tillfälliga åtkomst upphör enligt uppdraget och handlingarna hanteras enligt fastställd regel.

### 11.13 En genomgående resa i grundskolan

I ett syntetiskt exempel planerar läraren ett arbetsområde om argumenterande text i 8A. Målet i elevspråk är att formulera en tes, underbygga argument och bemöta en invändning. Läraren planerar en modelltext, ett första utkast, kamratrespons, en läraravstämning och tid för bearbetning. De konkreta styrdokumentskopplingarna ska läraren välja i pilotens aktuella ämnesplanering; exemplet är inte en färdig nationell bedömningsanvisning.

Första lektionen börjar med att eleverna jämför två argument. Flera kan hitta tesen men blandar ihop påstående och belägg. Läraren gör en kort gruppnotering och lägger in en extra gemensam övning. Ingen individuell riskprofil behövs. Testelev 014 får uppgiften i delsteg och tillgång till uppläst modelltext; klasskamraterna ser inte den individuella instruktionen.

Eleven lämnar utkast 1. Läraren pekar på det andra argumentet och ber eleven lägga till belägg och förklara sambandet. I elevens arbetsyta finns den kommenterade versionen bredvid en bearbetningsyta. Eleven frågar vad som kan räknas som belägg, får ett förtydligande och använder ett exempel i utkast 2. Plattformen visar båda versionerna och eleven markerar den ändrade delen. Detta är ett konkret belägg för att responsen använts; läskvittot hade inte räckt.

Läraren ser att flera elever gjort samma förbättring men fortfarande har svårt att bemöta invändningar. Nästa lektion ändras till gemensam modellering och kort muntlig prövning i par, innan eleverna återgår till texten. Läraren kan återanvända en väl vald anonymiserad exempelmening först efter kontroll av innehåll och delning. En elev som varit frånvarande får ett sammanhållet sätt att komma in i arbetet, inte en automatisk underkänd markering.

När arbetet avslutas väljer läraren relevanta belägg till sin bedömningsöversikt. Elevens nästa steg följer med till kommande skrivarbete och kan vara samtalsunderlag. Om det finns kvarstående stödbehov gör läraren en avgränsad hänvisning till ansvarig process. Den vanliga undervisningskedjan är avslutad för denna omgång även om ett separat stödärende fortsätter. Acceptans: A32, A33, A34, A38, A39 och A46.

### 11.14 En genomgående resa i gymnasiet

Ett syntetiskt yrkesprogram planerar en APL-period. Eleven och läraren går igenom vilka arbetsuppgifter som kan ge möjlighet att utveckla det valda innehållet. Handledaren bekräftar vilka moment arbetsplatsen kan erbjuda. Ett moment saknas och behöver planeras i skolans undervisning. Schemat och studieplaneringen visar detta behov utan att registrera APL-tid som bevis på uppnått mål.

Under första veckan beskriver eleven hur en uppgift genomförts och handledaren lämnar en konkret observation. Läraren upptäcker att eleven kan följa rutinen men behöver förklara sina val. Nästa uppgift får därför en kort muntlig avstämning. Underlaget från avstämningen och ett senare självständigt arbete visar utvecklingen. Läraren bedömer vad som är relevant i rätt ämnesnivå, med hänsyn till vilket stöd som använts.

Vid ett ändrat arbetspass får eleven uppdaterad planering. Ett uteblivet handledarsvar ger uppföljningsuppgift till skolan; eleven får inte automatiskt registrerad frånvaro. Efter perioden planeras det saknade momentet i skolan och handledarens åtkomst avvecklas. Läraren ser fortsatt progression i ämnet och gör vid nivåns slut sin sammantagna bedömning. Acceptans: A35, A37, A41 och A47.

### 11.15 Pedagogiska mått och pilotkriterier

Den pedagogiska piloten ska följa hela resor, inte bara räkna publicerade uppgifter. Undersök om elever kan hitta nästa steg, förstå återkopplingen och använda den; om lärare kan ändra undervisning utifrån underlagen; och om bedömningsarbetet blir tydligare utan större dokumentationsbörda. Jämför före och efter med samma typ av uppgift och redovisa deltagare och osäkerhet.

Föreslagna mått är aktiv tid för planering och återkoppling, andel undersökta elever som kan förklara nästa steg, antal oavsiktliga versionsfel, genomförd bearbetning när sådan planerats, samt tillgängliga genomföranden med valda hjälpmedel. Antal kommentarer, klick och uppladdade filer är inte mått på lärande. Inga löften om högre betyg eller dokumenterad effekt ges innan en utvärdering har stöd för dem.

Elev- och lärarintervjuer ska omfatta både grundskola och gymnasium, praktiska och teoretiska ämnen, grupparbete, frånvaro och behov av tillgängliga arbetssätt. Pilotens godkännande ska kräva att minst en fullständig pedagogisk resa och en fullständig administrativ resa fungerar för berörda roller, inklusive fel och reservvägar.

### 11.16 Studieplan och introduktionsprogram

Gymnasiets individuella studieplan behöver vara en separat, versionshanterad plan med rätt innehåll för program, utbildningskull och elev. Introduktionsprogram kräver särskild uppmärksamhet på mål, innehåll, omfattning och progression mot elevens fortsatta utbildning. Studieplanen ska kunna ligga till grund för grupp- och schemaplanering utan att förväxlas med en IUP eller en elevs att göra-lista. [Skolverket om individuell studieplan](https://www.skolverket.se/styrning-och-ansvar/anordna-utbildning/anordna-gymnasieutbildning/individuell-studieplan-inom-gymnasieskolan-anpassade-gymnasieskolan-och-gymnasieskolans-introduktionsprogram).

Produktförslaget är att ändringar först jämförs med gällande plan: vilka ämnen, nivåer, tider, grupper och mål berörs, vem ansvarar för ändringen och när ska den gälla? Läraren ser undervisningsrelevanta delar. Eleven ser en begriplig väg framåt. Samläsning får inte sudda ut olika mål. Val av regelprofil och obligatoriskt innehåll ska granskas för pilotens faktiska elevgrupper, inklusive övergångar mellan Gy11 och Gy25. Acceptans: A51.

### 11.17 Integration eller egen pedagogisk funktion

Valet mellan Google-integration och egen ersättning är öppet inför genomförande. I båda fallen ska elev och lärare möta en sammanhängande status för uppgift, arbete och återkoppling. Varje informationstyp har en fastställd originalkälla och konfliktregel; en deadline får inte ändras fram och tillbaka mellan två system. En integrationsbeskrivning ska omfatta behörigheter, licens, ägarskap, versioner, radering, export och felhantering, inte bara lyckad inloggning.

Katalogen i dokument 05 är en baslinje för funktionell bredd. Ingen API-motsvarighet, automatisk synkronisering eller licensrätt antas för att en funktion finns i Googles gränssnitt. Vid licensbortfall ska ett berört moment visa sin begränsning och ge en beslutad reservväg. Elevens redan inlämnade underlag får inte bli tyst otillgängligt. Acceptans: A40 och A52.

## 12. Provplattform med låsbart läge

### 12.1 Ett helt provförlopp

Läraren skapar prov och frågebank, väljer mål, material, uppgiftstyper, hjälpmedel och bedömningsstöd. Versioner och individuella anpassningar ska finnas före provstart. Eleven gör en kontroll av enhet och hjälpmedel i god tid. Provvakten ser teknisk status utan att behöva öppna elevens svar.

Låst provläge ska använda en verklig säker klient eller ett hanterat enhetsläge. Safe Exam Browser och hanterade Chromebook-lösningar är kandidater som behöver valideras mot skolans faktiska enheter. Fullskärmsläge i en vanlig webbsida ska inte märkas som säker låsning. [Safe Exam Browser](https://safeexambrowser.org/download/index.html), [Googles stöd för hanterade provmiljöer](https://support.google.com/chrome/a/answer/3273084?hl=en).

### 12.2 Status som inte lurar eleven

Provvyn ska skilja **Låsning verifierad**, **Låsning okänd**, **Låsning förlorad**, **Sparat på enheten**, **Mottaget av servern** och **Inlämnat med kvitto**. Vid avbrott ska eleven få tydlig instruktion och provvakten rätt åtgärd. Tyst misslyckad autosparning är ett kritiskt fel.

Det ska finnas kontrollerad återupptagning, byte av enhet, förlängd tid och manuell reservrutin. Extra tid och godkända hjälpmedel ska följa provtillfället. Den låsta klienten får inte automatiskt blockera nödvändigt tillgänglighetsstöd.

### 12.3 Bedömning och integritet

Anonymiserad rättning där det är lämpligt, sambedömning, motivering och återkoppling ska ingå. Tekniska avvikelser är underlag för utredning, inte automatiska bevis på fusk. Ansiktsanalys, känsloanalys och generell kameraövervakning ingår inte i rekommenderad basprodukt.

Provfrågor, elevsvar och resultat behöver skilda åtkomst- och bevaranderegler. Återanvändbara prov kan kräva särskild sekretessprövning, medan bedömningsunderlag behöver vara tillgängligt för rätt personer. Nationella prov ska hanteras som ett separat verifieringsområde; plattformen ska inte marknadsföras som godkänd för dem utan sådan grund.

## 13. Roller och informationsstruktur

| Roll | Första vyn | Viktigaste avgränsning |
|---|---|---|
| Elev | Min dag, uppgifter, återkoppling, prov | Endast eget material och uttryckligen delat grupparbete |
| Vårdnadshavare | Barnets praktiska skolinformation | Prövad relation och rätt till innehållet |
| Lärare | Dagens lektioner och nästa åtgärder | Undervisningsuppdraget styr tillgång |
| Mentor | Uppföljning, kontakt och stöd | Ingen automatisk journalåtkomst |
| Elevstöd | Tilldelade utredningar och insatser | Funktion och ärende avgör tillgång |
| Rektor | Beslut, hinder och genomförande | Rektorsrollen ger inte obegränsad åtkomst överallt |
| Planerare | Tjänstefördelning och schema | Behöver resursvillkor, sällan känsliga elevorsaker |
| Vikariesamordnare | Luckor, förfrågningar och bokningar | Begränsade personal- och elevuppgifter |
| Registrator/handläggare | Handlingar och begäranden | Prövningsuppdrag och beslutsmandat |
| Arkivansvarig | Hanteringsregler och leveranser | Bevarandeuppdrag, inte vardaglig elevuppföljning |
| Huvudman | Kvalitet, ansvar och uppföljning | Aggregering och avgränsad individåtkomst |
| Teknisk administratör | Konton, integrationer och drift | Innehållstillgång ska kunna undvikas |

Organisation, person, relation, utbildning, undervisningsgrupp, lektion, uppgift, provtillfälle, observation, ärende, beslut och handling ska vara tydliga grundbegrepp. En personpost ska inte användas som en gemensam behållare för allt som någon vet om eleven.

## 14. Gränssnittets form och språk

### 14.1 En lugn arbetsyta

Föreslagen form är en ljus eller mörk, återhållsam arbetsyta med tydlig typografi, gott om luft och en stabil navigering. En djup grönblå accent markerar vald funktion och huvudsaklig handling. Färg ska kompletteras med text och symbol, aldrig ensam bära betydelse.

Den globala navigeringen består av **Min dag, Undervisning, Kommunikation, Planering, Elevstöd, Ärenden och handlingar, Uppföljning**. Administrativa inställningar ligger separat och visas bara för rätt roller. En användare ska kunna slutföra sin vanligaste uppgift utan att förstå hela modulstrukturen.

En fast placering för ansvarig, status och nästa steg ska återkomma i arbetsflödena. Juridisk fördjupning öppnas vid behov. Den vanliga texten säger ”Du behöver ange vem som fattar beslutet”, inte ”Valideringsfel i beslutsobjekt”.

### 14.2 Designregler

- En tydlig huvudsaklig åtgärd per arbetssteg.
- Visa skillnaden mellan utkast, fastställt, skickat och mottaget.
- Beskriv hindret och hur användaren kan lösa det.
- Återanvänd befintliga uppgifter med källa och aktualitet synliga.
- Låt användaren lämna en uppgift vidare med ansvar och sammanhang.
- Dämpa rutinaviseringar; akuta eller tidskritiska händelser måste fortfarande nå fram.
- Visa inte känsliga titlar i pushnotiser, sökförslag eller kalendertexter.
- Erbjud tangentbord och listalternativ till dragning i schemat.

### 14.3 Tillgänglighet som krav

Diggs aktuella vägledning pekar på EN 301 549 V3.2.1, som bland annat innehåller WCAG 2.1-krav. Projektets föreslagna designmål är WCAG 2.2 AA tillsammans med tillämpliga EN-krav; det högre designmålet ska inte felaktigt beskrivas som identiskt med dagens laghänvisning. [Digg om digital tillgänglighet](https://www.digg.se/kunskap-och-stod/digital-tillganglighet).

Skärmförstoring, skärmläsare, tydlig fokusmarkering, omflöde och motorisk tillgänglighet ska verifieras i verkliga flöden. Dokument och exportfiler behöver också tillgänglighet. Låst provläge ska testas med de hjälpmedel som faktiskt ska användas.

## 15. Skärmförslag och beteende

Skärmarna nedan är ett sammanhängande designkoncept med syntetiska exempel. De interaktiva skisserna som hör till projektbeskrivningen visar centrala vyer och lokala tillstånd; de skickar inga uppgifter eller fattar verkliga beslut.

### S01. Min dag – lärarens start

Överst visas nästa lektion med tid, lokal och grupp. Huvudåtgärderna är Öppna lektion och Registrera närvaro. Därefter visas högst ett fåtal uppgifter som verkligen kräver handling: återkoppling, insats att genomföra eller underlag att komplettera. Övrig information kan öppnas separat.

Lektionskortet visar om schemat ändrats och när. En stödinsats presenteras som en konkret undervisningsinstruktion med rätt åtkomst. Läraren ska inte behöva navigera till en fullständig elevutredning för att förstå vad hen ska göra.

### S02. Ärenden och handlingar – processöversikten

Huvudytan är en lista med ärende, mottagningstid, ansvarig, nästa steg och eventuell väntan. Utlämnandebegäranden kan prioriteras utan att andra ärendetyper försvinner. Saknad ägare och ej genomsökta källor visas som konkreta hinder.

Ett ärende öppnas med en kort sammanfattning och en tidslinje. Datumet ”mottaget” får inte döljas bakom en senare intern registrering. Reglernas ursprung kan visas som ”Lagkrav”, ”Lokal rutin” eller ”Arbetsmål”.

### S03. Begär en handling – den publika ingången

Ett tydligt fält: Vilken handling vill du ta del av? Kort hjälptext ger exempel utan att kräva diarienummer. Därefter väljs önskat sätt att ta del av handlingen. Kontaktuppgifter efterfrågas bara när de behövs för valt svarssätt eller en motiverad prövning.

Besökaren ska se alternativa kontaktvägar, information om eventuell avgift och hur begäran hanteras. Ingen inloggningsvägg. En eventuell anonym ärendekod får inte ensam ge tillgång till känsliga uppgifter utan lämplig säkerhetsbedömning.

### S04. Utlämnande – granska kopian

På bred skärm: dokumentlista till vänster, läsvy i mitten och bedömningsunderlag till höger. På smal skärm visas delarna i följd. Original och utlämnandekopia har tydliga etiketter. En markerad uppgift visar skäl, rättsligt stöd och om prövningen är klar.

Huvudåtgärden heter Granska utlämnandekopia tills prövningen och kopiekontrollen är färdig. Därefter kan en behörig person välja leverans. En synlig restlista visar vilka delar som ännu inte är avgjorda.

### S05. Elevstöd – signal till genomförd insats

Vyn visar sakliga observationer, elevens perspektiv, ansvarig och nästa steg. Den ska inte ha en röd riskmätare över elevens namn. Det går att öppna källan, rätta fel eller koppla signalen till en pågående utredning.

En beslutad insats visas med genomförande och uppföljning. ”Genomförd” och ”Hade avsedd effekt” är olika frågor. Elevens situation får inte anses löst bara för att personalen markerat uppgiften som klar.

### S06. Planering – jämför schemaändringar

Planeraren väljer berört problem, exempelvis saknad lärare på två lektioner. Vyn visar veckoschema och två lösningsförslag med konsekvenser. Låsta lektioner markeras tydligt. Ett listläge erbjuder samma beslut utan dragning.

Före publicering visas ändrade pass, giltighetsdatum, mottagare och eventuella olösta hinder. Systemet ska inte skicka ett helt nytt schema till alla om bara en avgränsad grupp påverkas.

### S07. Prov – elev och provvakt

Elevens skärm är avskalad: uppgift, tillåtna hjälpmedel, återstående tid där relevant, sparstatus och lämna in. En störning ger begriplig instruktion utan att dölja elevens arbete. Inlämning avslutas med ett tydligt kvitto.

Provvakten ser deltagare, verifierad låsning, anslutning, senaste mottagning och behov av hjälp. Vyn ska inte visa ”fusk” när det som upptäckts är ett tekniskt avbrott. Återupptagning kräver rätt behörighet och lämnar spår.

### S08. Beslut – klart för ställningstagande

Beslutsfattaren ser förslag, källor, vad eleven har framfört, kvarstående frågor och mandat. Beslutsförslaget går att ändra. Saknad kommunicering visas när den krävs, med hantering av eventuella tillämpliga undantag.

Efter fastställande skapas uppgifter för expediering, genomförande, eventuell överklagandehantering och uppföljning. Fastställande får inte automatiskt markera hela ärendet som avslutat.

### S09. Informationshantering – före gallring och arkivleverans

Arkivansvarig ser grupper av handlingar, tillämpligt beslut, beräknad åtgärd och stopporsaker. En handling med pågående begäran visas som stoppad. Körningens resultat ska gå att stämma av, med kvittenser från mottagande arkiv.

Vyn ska även visa informationsslag som saknar beslut. Den ska inte göra en osäker klassificering till en nedräkning mot automatisk radering.

### S10. Kommunikation – meddelandet och handlingen tillsammans

Kommunikationsvyn visar inkorg, öppet meddelande och dess ärendesammanhang. Inkommande, intern och utgående kommunikation har tydliga etiketter. Avsändare, mottagare, tid och bilagor finns nära innehållet. Till höger visas ansvarig, kopplat ärende och hanteringsstatus, med möjlighet till fördjupning.

Läraren kan välja Koppla till ärende utan att skriva om meddelandet. En skyddad ärendetråd öppnar inte hela inkorgen för andra deltagare. Ett svar visar rätt mottagare och varnar för känslig citerad historik. Om meddelandet har ändrats eller en bilaga inte har hämtats syns det direkt.

### S11. Undervisning och bearbetning

Starta i ett arbetsområde med mål, planerade lektioner och elevens nästa aktivitet. Läraren växlar mellan planering, underlag och nästa lektion; eleven mellan instruktion, sitt arbete och respons. Visa utkast 1 och utkast 2 med kommentaren i rätt version. En demonstration ska låta läsaren visa hur eleven använder responsen och hur läraren ändrar nästa lektion. Skilj pedagogisk status från betyg och visa anpassning utan diagnos. Ingen ärendeblankett behövs. A32–A39 och A46.

### S12. Ärende från syfte till uppföljd effekt

Visa ärendets fråga, utlösande händelse, ansvarig och parallella spår överst. Under processen finns arbetsuppgifter med utförare, underlag och hinder. Beslutets giltiga version finns separat. Väntan, beslut fattat, genomförande pågår och effekt följd upp ska vara olika synliga tillstånd. Ett försök till avslut visar kvarvarande skyldighet. Kommunikation visas som underlag, och besvarat mejl påverkar inte avslutsgrinden. Demonstrationen låter läsaren följa händelsekedjan, se otillräcklig effekt och återöppning. A42–A45 och A48–A50.

### S13. APL och elevens utbildningsväg

Visa placeringens period, lärandemål, ansvarig lärare, handledare och planerade uppföljningar. Skilj genomförd tid från visat kunnande. Saknade lärandemöjligheter blir en planeringsåtgärd. Handledarens vy är avgränsad till uppdraget och lärarens bedömning behåller sin självständighet. Individuell studieplan visas med version och giltighet, med särskilda kontroller för introduktionsprogram. A37, A41, A47 och A51. Denna skärm är beskriven men inte interaktivt illustrerad i denna version.

## 16. Automatisering och AI

### 16.1 Prioritera stabil automatisering

Först automatiseras sådant som har tydliga regler: återanvändning av grunduppgifter, uppgiftsfördelning, datumkontroll, versionshantering, leveransstatus och upptäckt av schemaöverlapp. Dessa funktioner kan ge stor tidsvinst utan att formulera egna bedömningar.

AI kan föreslås för källhänvisade sammanfattningar, språkstöd, utkast och förslag till klassificering eller maskning. Användaren ska kunna se var varje väsentlig sakuppgift kommer ifrån. Saknade uppgifter ska stå som saknade. AI får inte fylla ut en utredning med påhittade samtal eller slutsatser.

### 16.2 Separat prövning av varje användning

EU:s AI-regler behöver bedömas per funktion, avsett ändamål och aktörsroll. Utbildningsbedömning, provövervakning och viss arbetsfördelning kan aktualisera högriskregler. Att en människa trycker på Godkänn räcker inte i sig för att undanröja klassificeringen.

Kommissionens uppdaterade information anger att AI Omnibus trädde i kraft den 27 juli 2026 och att reglerna för högriskområden i bilaga III ska tillämpas från den 2 december 2027. Produktplanen ska därför inte utgå från den äldre generella tidslinjen. För berörda högrisksystem enligt bilaga I anger tidslinjen den 2 augusti 2028. Övriga bestämmelser måste bedömas separat. [EU-kommissionens aktuella AI-tidslinje](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai), [AI Omnibus och ikraftträdande](https://digital-strategy.ec.europa.eu/en/news/ai-omnibus-enters-force).

**Produktkrav:** innan en AI-funktion används med skoldata ska ändamål, riskklassning, datakällor, leverantörsroll, mänsklig kontroll, testresultat och avstängningsmöjlighet vara dokumenterade. Grundfunktionerna ska fungera även om AI stängs av. Kunddata ska inte användas för modellträning utan ett särskilt prövat och avtalat upplägg.

## 17. Integrationer och informationsansvar

Plattformen ska kunna börja som ett sammanhängande stöd runt befintliga system och stegvis ta över utvalda originaldata. För varje integration ska det stå vilket system som bestämmer, vad som kopieras, när ändringar ska slå igenom och vem som åtgärdar fel.

| Informationsområde | Rekommenderat ansvar |
|---|---|
| Identitet, organisation och uppdrag | Utsedd katalog eller personalsystem, med tidsatta relationer |
| Elevplacering och utbildning | Vald elevadministrativ huvudkälla |
| Timplan och tjänstefördelning | Ett utpekat planeringssystem åt gången |
| Publicerat schema | En auktoritativ version per giltighetsperiod |
| Dokument och elevarbeten | Utpekad originalplats med åtkomst- och arkivhantering |
| Ärenden och beslut | Ärendesystemets fastställda versioner och mandat |
| Journal | Separat behörig vårdmiljö |
| Arkiv | Mottagande arkivs kvitterade leverans och sökväg |

Integrationsfel ska skapa en ansvarig uppgift och kunna återförsökas utan dubbletter. Elevbyte, ändrade vårdnadsrelationer och avslutade personaluppdrag ska prioriteras eftersom gamla behörigheter kan få stor konsekvens. Import ska först förhandsgranskas med antal, fel och relationer innan den används i skarp verksamhet.

SS 12000 och relevanta branschstandarder bör utvärderas i integrationsarbetet, men exakt version och stödomfattning ska verifieras med respektive leverantör. Ett allmänt påstående om ”öppet API” är inte ett tillräckligt integrationsavtal.

## 18. Drift, säkerhet och kontinuitet

Plattformen behöver avskiljning mellan huvudmän, kryptering, stark autentisering för personal, fungerande kontohantering, säkerhetskopior och återställningsövningar. Sökindex, export, loggar och supportverktyg ska omfattas av samma skydd som ordinarie vyer.

Skolan behöver tydliga reservrutiner för närvaro, prov, schema och akuta ärenden. Vid återställning ska nya uppgifter från reservrutinen kunna föras in utan att gamla data skriver över dem. Låsta prov kräver särskild avbrottsanalys och kontrollerad återupptagning.

Tillgänglighet, återställningstid och tillåten dataförlust ska fastställas per arbetsflöde och testas under representativ belastning. En generell driftsiffra säger för lite om ett prov som startar samtidigt på många skolor.

En publiceringsändring i en integration ska kunna stoppas och återställas med bibehållen historik. Återställning får inte osynliggöra expedierade beslut eller inlämnade prov. Redan genomförda externa händelser behöver korrigerande åtgärder, inte bara teknisk återgång.

## 19. Krav som ska styra prioriteringen

P0 betyder att den berörda funktionen inte får tas i skarp drift utan kravet. P1 är centralt för första sammanhängande produktversionen. P2 är en senare förbättring. Prioritet anger inte att allt P0 måste utvecklas samtidigt; en modul kan hållas utanför driftsatt omfattning tills den är redo.

| ID | Krav | Prioritet | Verifierbart resultat |
|---|---|---|---|
| R01 | Tidsatt regelprofil per organisation och handling | P0 | 2026-, 2027- och 2029-fall får rätt profil |
| R02 | Separat åtkomst, allmän-status och utlämnandeprövning | P0 | En åtkomstetikett avgör inte utlämnandet |
| R03 | Begäran utan obligatorisk inloggning | P0 | Anonym kontakt kan tas emot |
| R04 | Verklig mottagningstid och kontinuitet vid överlämning | P0 | Omfördelning nollställer inte väntan |
| R05 | Sökning visar fullständighet och fel | P0 | Avbruten källa syns i resultatet |
| R06 | Maskerad kopia utan återvinningsbara skyddade uppgifter | P0 | Oberoende kontroll kan inte återskapa texten |
| R07 | Formellt beslut och rätt överklagandeväg | P0 | Delavslag får korrekt dokumentation |
| R08 | Beslutad informationshanteringsregel | P0 | Gallring saknar ingen beslutsgrund |
| R09 | Stopp för gallring under relevant pågående ärende | P0 | Körningen hoppar över stoppad handling |
| R10 | Validerad och kvitterad arkivexport | P0 | Återläsning bevarar samband och innehåll |
| R11 | Uppdragsstyrd och tidsbegränsad behörighet | P0 | Avslutat uppdrag stänger åtkomst |
| R12 | Skyddade personuppgifter i alla kanaler | P0 | Sökförslag och notiser röjer inte uppgifter |
| R13 | Avgränsad medicinsk elevhälsa | P0 | Undervisningskonto når inte journal |
| R14 | Giltigt beslutsmandat | P0 | Utgången delegation blockerar beslut |
| R15 | Akut anmälan utan onödiga formulärhinder | P0 | Kan registreras och nå rätt mottagare direkt |
| R16 | Elevdelaktighet och kommunicering enligt ärendetyp | P0 | Saknat obligatoriskt steg blir synligt |
| R17 | Insatser kopplas till utförande och uppföljning | P1 | Beslut kan följas till faktisk aktivitet |
| R18 | EWS visar källor och datakvalitet | P0 | Felaktig signal kan rättas och omprövas |
| R19 | Ingen automatisk elevpåföljd från riskindikator | P0 | Signal skapar bedömningsuppgift |
| R20 | En gång registrerade grunduppgifter återanvänds | P1 | Klassbyte behöver inte skrivas i tre moduler |
| R21 | Planerad, schemalagd och genomförd tid hålls isär | P0 | Inställt pass räknas inte som utfört |
| R22 | Hårda schemavillkor och förklarad konflikt | P0 | Olösbarhet ger begriplig orsak |
| R23 | Jämförbara schemaförslag med ändringsomfattning | P1 | Planeraren kan välja med känd påverkan |
| R24 | Publicering med giltighet och mottagarkontroll | P0 | Bara beslutad version blir gällande |
| R25 | Vikariebokning tål samtidiga försök | P0 | En person dubbelbokas inte |
| R26 | Samlat lektionspaket för vikarie | P1 | Material och nödvändiga instruktioner finns |
| R27 | Uppgift, inlämning och återkoppling hänger ihop | P1 | Elev och lärare ser samma versionsstatus |
| R28 | Betyg skiljs från poäng och bedömningsutkast | P0 | Inget betyg fastställs av en poängformel |
| R29 | Provlåsning verifieras på stödd enhet | P0 | Okänd låsning kan inte visas som verifierad |
| R30 | Provsvar har tydlig spar- och kvittensstatus | P0 | Nätavbrott ger ingen falsk inlämning |
| R31 | Återupptagning och tillgängliga hjälpmedel | P0 | Testelev kan fortsätta enligt rätt villkor |
| R32 | Integrationer visar fel och undviker dubbletter | P0 | Upprepat meddelande skapar inte extra post |
| R33 | Komplett leverantörsexport | P0 | Skolan kan fortsätta hantera sina handlingar |
| R34 | Tangentbord, skärmläsare och responsivt omflöde | P0 | Kritiska uppgifter kan utföras tillgängligt |
| R35 | Mätning av faktisk administrationsminskning | P1 | Före/efter-mätning omfattar även felarbete |
| R36 | Källhänvisat AI-stöd som kan stängas av | P2 | Arbetsflödet fungerar utan AI |
| R37 | Kommunikation fångas med originalmetadata och bilagor | P0 | Händelseförlopp och innehåll kan återskapas |
| R38 | Ett meddelande kan kopplas till ett ärende utan kopiering | P1 | Ursprung och åtkomst bevaras |
| R39 | Intern kommunikation bedöms utifrån sammanhang | P0 | Kanalnamnet avgör inte handlingens status |
| R40 | Meddelandets version och relevant länkat underlag säkras | P0 | Senare redigering ändrar inte historiskt beslutsunderlag |
| R41 | Leveransstatus skiljs från handläggning och delgivning | P0 | Läskvitto blir inte formell delgivning automatiskt |
| R42 | Borttagning ur inkorgen respekterar hanteringsbeslut | P0 | Bevarandepliktig handling försvinner inte |
| R43 | Svar och vidarebefordran har mottagar- och innehållskontroll | P0 | Skyddad citathistorik följer inte med oavsiktligt |
| R44 | Avslutat konto bryter inte verksamhetens tillgång till handlingar | P0 | Behörig funktion kan söka bevarad kommunikation |
| R45 | Samtal kan dokumenteras som tydlig tjänsteanteckning | P1 | Uppgiftskälla och dokumenterare kan särskiljas |
| R46 | Kommunikationsanslutningar har avstämning och felkö | P0 | Saknat meddelande eller bilaga blir synligt |
| R47 | Arbetsområde med rätt styrdokumentsversion | P0 | Grupp, skolform, kurs eller nivå och källversion följer planeringen |
| R48 | Lektion och aktivitet skilda från formellt ärende | P1 | Vanlig undervisning kan genomföras utan ärende eller beslut |
| R49 | Återkoppling knyts till arbete och bearbetning | P1 | Elev kan jämföra utkast och använda respons i en ny version |
| R50 | Återkoppling kan förändra nästa undervisning | P1 | Läraren kan omsätta gruppobservation i ändrad lektion |
| R51 | Saknat underlag skiljs från otillräckliga kunskaper | P0 | Saknad inlämning ger inte automatiskt noll eller F |
| R52 | Individuell tilldelning och stöd utan exponering | P0 | Andra elever ser inte privat variant eller stöduppgift |
| R53 | Muntliga och praktiska underlag kan användas | P1 | Bedömning kräver inte fil eller kriterieklick vid varje lektion |
| R54 | Gy11 och Gy25 hanteras parallellt | P0 | Utbildningskull och nivå styr betygslogik utan poängmedelvärde |
| R55 | IUP och dokumentationskrav styrs av tillämpning | P0 | IUP och samtalsdokumentation krävs inte generellt av alla |
| R56 | Gemensamt arbete och individuell bedömning skiljs | P0 | Gruppens produkt kan ge olika relevanta individuella underlag |
| R57 | APL kopplar mål, observation, uppföljning och lärarbedömning | P1 | Saknat lärandemoment syns trots genomförd tid |
| R58 | Versionshanterad uppgift med kontrollerade ändringar | P0 | Ny instruktion ersätter inte tyst elevens tidigare villkor |
| R59 | Återanvändning rensar elevdata och markerar gamla datum | P0 | Kopierat arbetsområde innehåller inga gamla elevlösningar |
| R60 | Pedagogisk integration anger originalkälla och konflikt | P0 | Motstridiga deadlines och statusar visas och löses kontrollerat |
| R61 | Övningsstöd skiljs från examination | P0 | Ledtrådar och försök blir inte automatiskt betyg |
| R62 | Ärende har syfte, utlösande händelse och avslutsvillkor | P0 | Inget skickat svar eller passerat datum stänger ensamt ärendet |
| R63 | Väntan har ansvar och bevakning | P0 | Väntemarkering nollställer eller pausar inte automatiskt rättslig tid |
| R64 | Parallella processer har separata skyldigheter | P0 | Ett avslut stänger inte andra spår eller utökar åtkomst |
| R65 | Beslut, genomförande och effekt är separata tillstånd | P0 | Signerat beslut kan visas med pågående eller hindrad insats |
| R66 | Återöppning bevarar historik och tidigare beslut | P0 | Ny arbetsperiod har orsak och ansvar utan att historik skrivs över |
| R67 | Kontrollerad ansvarsöverlämning med ersättare | P0 | Ärende kan inte försvinna mellan två funktioner |
| R68 | Underlag skiljer påstående, sakuppgift och bedömning | P0 | Motstridiga uppgifter och använda versioner kan granskas |
| R69 | Pedagogisk nytta prövas i första sammanhängande pilot | P1 | Elevbearbetning och lärarens ändring av undervisning demonstreras |
| R70 | Studieplan med giltighet och IM-anpassad struktur | P0 | Ändring visar påverkan på innehåll, grupper och tid före fastställande |
| R71 | Licens- och anslutningsbortfall har reservväg | P0 | Elevens mottagna underlag blir inte tyst otillgängligt |
| R72 | Presentationsvy skyddar individuella uppgifter | P0 | Projicerat material innehåller inga privata stödanteckningar |
| R73 | Kommunikation begränsas till beslutad verksamhetsomfattning | P0 | Privat eller fackligt material massinsamlas inte |
| R74 | Övningsresultat kan leda till aktivitet utanför plattformen | P1 | Läraren kan välja samtal eller praktisk övning som nästa steg |

## 20. Acceptansscenarier före pilot

Testerna ska använda syntetiska data med både normala och svåra fall. En demonstration där all information är korrekt från början är inte tillräcklig.

| Test | Scenario och förväntat beteende |
|---|---|
| A01 | En anonym begäran kommer per telefon. Den tas emot utan krav på e-legitimation och får rätt mottagningstid. |
| A02 | En begäran innehåller både offentliga och skyddade uppgifter. Prövade delar kan hanteras separat och avslag får rätt beslutsväg. |
| A03 | En maskerad fil innehåller OCR-text och kommentarer. Kopiekontrollen upptäcker risken; slutkopian röjer inte innehållet. |
| A04 | Ett externt arkiv svarar inte. Sökningen visar ofullständighet och skapar en ansvarig åtgärd. |
| A05 | Handläggaren blir sjuk. Ärendet övertas utan ny starttid eller onödig spridning av sökandens kontaktuppgifter. |
| A06 | En äldre friskolehandling importeras under 2027. Ursprungliga datum bevaras och den nya offentlighetsregeln tillämpas inte enbart på grund av importen. |
| A07 | Huvudmannen växer över storleksgränsen. Historiska handlingar och nya handlingar bedöms enligt rätt övergång och regelprofil. |
| A08 | En handling ska gallras men omfattas av en pågående begäran. Gallringen stoppas, med synlig orsak. |
| A09 | Arkivleveransen avvisas. Originalen finns kvar, felet blir en uppgift och exporten kan göras om. |
| A10 | En elev fyller 18 år eller vårdnaden ändras. Åtkomst omprövas och äldre relation ger inte fortsatt automatisk insyn. |
| A11 | En vikaries uppdrag avslutas. Tillgången upphör även till tidigare direktlänkar och sökresultat. |
| A12 | En uppgift om skyddad elev förekommer i en notis eller export. Samma skyddsregler tillämpas utanför huvudvyn. |
| A13 | En elevs frånvaro beror på fel schema. Rättningen uppdaterar signalen och lämnar spår utan att eleven får en varaktig risketikett. |
| A14 | En kränkningsanmälan saknar flera detaljer. Akut registrering och överlämning fungerar ändå. |
| A15 | En beslutsfattare har utgången delegation. Fastställande stoppas och rätt beslutsfattare kan ta över. |
| A16 | En beslutad stödinsats saknar tillgänglig resurs. Hindret når ansvarig; ärendet blir inte automatiskt klart. |
| A17 | Ett schemaförslag bryter ett hårt villkor. Det kan inte publiceras som giltigt utan rättelse eller ett tillåtet, dokumenterat verksamhetsbeslut. |
| A18 | Två samordnare bokar samma vikarie. En får bokningen; den andra får aktuell status och nya alternativ. |
| A19 | Ett prov tappar nät och klienten startas om. Svar återställs enligt verifierad rutin och kvittensstatus är sanningsenlig. |
| A20 | Provlåsningen kan inte bekräftas. Elev och provvakt ser detta och använder beslutad reservväg. |
| A21 | Eleven använder skärmläsare eller annan godkänd anpassning. Prov och inlämning kan genomföras utan att skyddet kringgås oavsiktligt. |
| A22 | En integration skickar samma ändring två gånger. Ingen extra elevplacering eller lektion skapas. |
| A23 | Ett AI-utkast saknar källa för en slutsats. Det kan inte presenteras som verifierat beslutsunderlag. |
| A24 | Systemet avvecklas. Ett komplett paket kan återläsas och en testbegäran om handling kan hanteras i mottagande miljö. |
| A25 | Ett mejl med bilaga blir ett ärende. Originalmetadata, bilaga och mottagningstid följer med utan manuell kopiering. |
| A26 | En intern tråd får extern mottagare. Bedömningen tar hänsyn till ändrat sammanhang; ingen blankettrutin undantar allt internt. |
| A27 | Ett meddelande redigeras och tas bort ur inkorgen. Tidigare beslutsunderlag finns kvar enligt beslutad hantering. |
| A28 | En tråd gäller två elever. Koppling till respektive akt ger inte oavsiktlig tillgång till hela tråden. |
| A29 | Ett molndokument ändras efter att det använts som underlag. Den säkrade relevanta versionen kan fortfarande återges. |
| A30 | Medarbetaren slutar. Verksamhetens bevarade kommunikation kan sökas av behörig ersättare. |
| A31 | En meddelandeanslutning tappar en bilaga. Felet visas och kan återhämtas utan dubbletter. |
| A32 | Läraren ger respons på utkast 1. Eleven använder den i utkast 2; båda versionerna och responsens ursprung kan jämföras. |
| A33 | Flera elever missförstår samma begrepp. Läraren ändrar nästa lektion utan att skapa elevärenden. |
| A34 | Elev saknar uppladdad fil men har visat kunnande muntligt. Underlaget kan användas och frånvaron av fil blir inte F. |
| A35 | Två utbildningskullar läser enligt Gy11 respektive Gy25. Rätt kurs eller nivå gäller och F på högre nivå raderar inte lägre godkända Gy25-betyg. |
| A36 | Ett utvecklingssamtal genomförs för elev där IUP inte krävs. Plattformen kräver inte generell IUP eller protokoll som lagkrav; lokal rutin är märkt lokal. |
| A37 | Handledaren bekräftar APL-tid men ett planerat lärandemoment saknas. Läraren ser behovet och beslutar nästa undervisning; tid blir inte ämnesbetyg. |
| A38 | En individuell uppgiftsvariant har tillgänglighetsstöd. Klasskamrat och presentationsvy ser inte privat information. |
| A39 | Två elever gör en gemensam produkt. Läraren kan använda olika individuella belägg utan att redigeringsantal avgör bedömningen. |
| A40 | Classroom och plattformen har motstridiga deadlines. Konflikten visas med originalkälla och kan lösas utan tyst överskrivning. |
| A41 | Handledarens APL-uppdrag upphör. Äldre direktlänk ger inte fortsatt elevåtkomst; bevarade underlag finns kvar för behörig lärare. |
| A42 | Ett meddelande i stödärende besvaras. Ärendet kvarstår i genomförande och en öppen insats hindrar för tidigt avslut. |
| A43 | Ärendet väntar på underlag. Annan uppgift kan fortsätta; mottagningstid och rättslig tidsregel är oförändrade. |
| A44 | Samma händelse har stöd- och trygghetsspår. Avslut av stödspår påverkar inte trygghetsskyldigheter eller dess åtkomst. |
| A45 | Beslut finns men två stödtillfällen ställdes in. Faktiskt utförande och hinder visas; rektor får åtgärd och effekt anges inte som verifierad. |
| A46 | Uppgift ändras efter elevens första inlämning. Tidigare instruktion och responsversion består; eleven får begriplig ändringsinformation. |
| A47 | APL-underlag visar att eleven behöver förklara arbetsval. Läraren planerar muntlig avstämning och återför saknat moment till skolundervisningen. |
| A48 | Handläggare lämnar uppdraget innan överlämning accepterats. Ansvarig funktion och ersättare syns; ärendet blir inte ägarlöst. |
| A49 | Effekten är otillräcklig vid uppföljning. Processen kan fortsätta eller återöppnas med orsak, ansvar och bibehållen beslutshistorik. |
| A50 | Två uppgiftslämnare beskriver samma händelse olika. Påståenden, kontrollerade uppgifter och bedömning förblir åtskilda i beslutsunderlaget. |
| A51 | En IM-elev får ändrad studieplan. Giltighet, mål, innehåll och konsekvens för grupper och schema visas före ändringen. |
| A52 | En pedagogisk tilläggslicens försvinner. Funktionen visar begränsning och reservväg; tidigare mottaget arbete försvinner inte tyst. |
| A53 | Ett arbetsområde återanvänds nästa läsår. Gamla elevarbeten följer inte med och datum samt styrdokumentsändring behöver kontrolleras. |
| A54 | Ett övningsverktyg underkänner ett korrekt alternativt svar. Läraren kan rätta responsen och se berörda försök utan automatisk betygseffekt. |
| A55 | En matematisk övning visar missförstånd. Nästa aktivitet kan vara lärarlett samtal med konkret material, utan digital inlämning. |
| A56 | En anslutning innehåller verksamhetsmeddelanden och material utanför beslutad omfattning. Fångsten följer avgränsningen och avvikelse hanteras utan massinsamling. |

Varje test ska ha en ansvarig granskare, förväntat resultat, faktiskt resultat och bevis. Jurist, registrator, arkivansvarig och verksamhetsrepresentanter behöver granska sina respektive delar. Leverantörens egen testmarkering ersätter inte huvudmannens införandebeslut.

## 21. Mål, mätning och verksamhetsnytta

Före pilot mäts pedagogiska flöden enligt 11.15 och fem administrativa flöden: frånvarouppföljning, vikarietillsättning, schemaändring, beslutsberedning och utlämnande. Mät både aktiv arbetstid, kalenderledtid, antal överlämningar och återarbete. Separera enkla och komplexa fall.

Föreslaget produktmål är minst 30 procent lägre median för aktiv administration i de utvalda rutinflödena, utan fler fel eller sämre tillgänglighet. Det är ett mål att pröva, inte en uppmätt effekt. Svåra ärenden ska få bättre kvalitet och överblick även om de fortfarande kräver tid.

| Mått | Vad det ska avslöja |
|---|---|
| Dubbelregistrering per flöde | Om systemet verkligen återanvänder information |
| Tid till ansvarig | Om ärenden fastnar mellan personer |
| Saknade obligatoriska underlag | Om beredningen blir bättre |
| Genomförda stödinsatser och uppföljd effekt | Om dokumentation leder till hjälp |
| Felaktiga eller missade EWS-signaler | Om modellen behöver ändras |
| Schemaändringens omfattning | Om lösningen skapar onödig oro |
| Provsvar med verifierat mottagningskvitto | Om provets kontinuitet fungerar |
| Utlämnande med komplett sök- och prövningsspår | Om insyn kan hanteras korrekt |
| Tid att åtgärda integrationsfel | Om dataproblem blir kvar i verksamheten |

Undvik prestationsrankning av enskilda lärare utifrån klick eller svarstid. Mätningen ska förbättra processen och visa arbetsbelastning, inte skapa nya incitament att stänga ärenden för tidigt.

## 22. Genomförande i tydliga etapper

### Etapp 0 – besluts- och designunderlag

Leverera projektbeskrivning, informationsmodell, processkatalog, rättskälleförteckning, skärmförslag, krav och acceptansfall. Genomför arbetsflödesintervjuer med grundskola och gymnasium samt både kommunal och enskild huvudman. Detta dokument är grunden för den etappen, med kvarvarande val uttryckligen angivna.

### Etapp 1 – gemensam grund och två kompletta arbetsflöden

Fastställ organisation, identiteter, behörigheter, regelprofiler, informationshanteringsplan och ärendekärna. Prova samtidigt undervisningsresan från arbetsområde till bearbetat elevarbete och ändrad nästa lektion. Pedagogiken får inte vänta till en sen restetapp. Prova ett helt utlämnandeflöde och ett stödärende på syntetiska data, inklusive export och svåra fel. Godkänn inte bara en startsida.

### Etapp 2 – planering och skolvardag

Koppla timplan, tjänstefördelning, schema, vikarie och närvaro. Genomför parallell jämförelse mot nuvarande arbetssätt. Publicerat schema och personalbehörighet måste kunna avstämmas innan fler funktioner kopplas in.

### Etapp 3 – pedagogisk bredd, APL, elevstöd och prov

Bredda det redan prövade undervisningsflödet till fler ämnen, bedömning, samtal och APL samt valda utredningstyper. Prova låst provläge på en uttryckligen vald enhetskombination. Bredda först när reservrutiner, hjälpmedel och återställning är verifierade.

### Etapp 4 – fler processer och kontrollerad skalning

Utöka ärendekatalog, integrationer och huvudmän. Inför eventuellt AI-stöd efter separat prövning och jämförande tester. Genomför full avvecklingsövning och arkivöverlämning innan plattformen betraktas som långsiktigt förvaltningsbar.

Tids- och kostnadsplan ska göras när integrationsgränser, bemanning och pilotomfattning är fastställda. Att ange en exakt byggtid redan nu skulle ge falsk precision. Varje etapp ska ha en slutpunkt med verifierbara arbetsflöden och beslut om fortsatt omfattning.

## 23. Organisation och ansvar för projektet

Produktägaren ansvarar för prioritering och verksamhetsnytta. Lärare, elever, vårdnadshavare, rektorer och administratörer behöver delta i återkommande användbarhetsprov. Registrator och arkivansvarig ska vara med från början, eftersom sökbarhet och bevarande inte går att lägga till genom enbart en exportknapp i efterhand.

Jurist granskar rättslig tillämpning och beslutsprocesser. Dataskyddsombudet ger oberoende råd och följer upp dataskyddsfrågorna; ansvaret för behandlingen ligger kvar hos personuppgiftsansvarig. Informationssäkerhetsansvarig granskar skydd och kontinuitet. Medicinsk verksamhetsföreträdare ansvarar för journalgränser och vårdrelaterade flöden.

För varje modul ska det finnas en namngiven verksamhetsägare, systemförvaltare och ersättare. Varje regelpaket ska ha en underhållsbudget. Juridisk kvalitet är en löpande förvaltningsuppgift, inte en engångsgranskning före lansering.

## 24. Risker och produktbeslut som återstår

| Risk | Föreslagen hantering |
|---|---|
| För bred första version | Inför kompletta prioriterade flöden etappvis |
| Felaktiga regelantaganden | Tidsatta källor, lokal tillämpning och expertgranskade testfall |
| Överdriven insamling av elevdata | Ändamål per fält och begränsade informationsflöden |
| Falsk trygghet från automatisk kontroll | Visa kontrollens omfattning och kvarvarande bedömningar |
| För mycket dokumentation | Automatisk metadata och aktiv uppföljning av dubbelarbete |
| Leverantörsinlåsning | Dokumenterad export, avtalad exit och återläsningsprov |
| Dålig schemakvalitet trots tekniskt giltigt schema | Jämför elev- och lärarvardag med validerade mått |
| Provlåsning fungerar bara i demonstration | Matris över riktiga enheter, versioner, hjälpmedel och avbrott |
| För många aviseringar | Sammanställ rutinärenden, behåll skarpa eskaleringar |

Följande val behöver fastställas inför genomförande, men hindrar inte det här designförslaget:

1. Första pilotens huvudmän, skolor och exakta ansvarsfördelning.
2. Om Google främst ska integreras eller ersättas i de första undervisningsflödena.
3. Vilka elevdatorer och surfplattor som först ska stödja låst provläge.
4. Vilken EWS-modell som ska användas och vilka uppgifter som får ingå.
5. Vilka befintliga system som ska vara originalkälla under varje etapp.
6. Vilka lokala dokumenthanteringsbeslut, delegationer och avtal som ska gälla.

## 25. Fördjupningsunderlag och källstatus

Rättsläget har kontrollerats mot offentliga källor den 4 september 2026. En produktionssättning kräver kontroll av då gällande lydelser, föreskrifter och lokala beslut. Konsoliderade lagtexter kan samtidigt visa nuvarande och framtida lydelser; produktens regelregister måste skilja dem åt.

De konkreta arbetsflödena, skärmförslagen och acceptanskraven i detta dokument är produktförslag. De ska inte läsas som påståenden om att lagstiftningen föreskriver just dessa knappar, skärmar eller tekniska lösningar.

### Underlag i projektpaketet

- **01 Funktionskartläggning:** SchoolSoft och Plan Digital med källor och inventeringsluckor.
- **02 Produktkrav:** fördjupad funktionsstruktur, planering, schema, vikarier och EWS.
- **03 Utredningar och beredning:** inledande processfamiljer, källor och kontrollfrågor.
- **04 Granskning av Testskolan och Plan Digital:** observerade menyer och formulär, med tydliga granskningsgränser.
- **05 Google Classroom:** funktionskatalog, licensberoenden och integrationsfrågor.
- **06 Provplattform:** frågetyper, provförlopp, låsning och återupptagning.

### Kompletterande rättskällor för processpaketen

- [Skolverket: särskilt stöd och åtgärdsprogram](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/extra-anpassningar-sarskilt-stod-och-atgardsprogram).
- [Skolverket: frånvaro i skolan](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/franvaro-i-skolan).
- [Skolverket: kränkande behandling och diskriminering](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/krankande-behandling-mobbning-och-diskriminering).
- [Skolverket: trygghet, studiero och disciplinära åtgärder](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/trygghet-studiero-och-disciplinara-atgarder).
- [Skolverket: anmäla oro för barn](https://www.skolverket.se/larande-och-trygghet/elevhalsa-och-stodinsatser/stod-och-tidiga-insatser/anmala-oro-for-ett-barn-till-socialtjansten).
- [Skolverket: GY25 och ämnesbetyg](https://www.skolverket.se/styrning-och-ansvar/forandringar-inom-skolomradet/gy25----amnesbetyg-pa-gymnasial-niva).
- [IMY: när konsekvensbedömning ska genomföras](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/konsekvensbedomning/nar-ska-en-konsekvensbedomning-genomforas/).
- [Riksarkivet: informationsvärdering och gallring](https://riksarkivet.se/arkivera-och-forvalta/informationsvardering-och-gallring).

Projektets nästa beslut bör gälla vilka arbetsflöden som först ska användarprövas och juridiskt valideras. Den gemensamma riktningen är redan tydlig: en plattform som gör rätt hantering lättare i det dagliga arbetet och som kan visa hur den har kommit fram till sitt resultat.

Den kompletterande researchmatrisen i dokument 10 binder samman 44 områden med samtliga 74 krav och 56 acceptansfall. Dokument 11 bevarar inriktning och ändringar, dokument 12 beskriver informationsmodellen, och dokument 13 redovisar leveransens kvalitetskontroll och återstående införandeprov.
