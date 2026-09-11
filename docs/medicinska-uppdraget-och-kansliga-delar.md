# Det medicinska uppdraget och andra känsliga delar

2026-09-10. Research och arkitekturbedömning inför ett eventuellt beslut om en modul för elevhälsans medicinska insats. Underlaget bygger på primärkällor och på leverantörernas egen publika dokumentation. Ingen kod och inga inställningar har ändrats. Detta är inte en juridisk granskning; de rättsliga bedömningarna behöver stämmas av med jurist innan de blir krav.

Fortsätter [Kommunintegration och säkerhet](kommunintegration-och-sakerhet.md), särskilt avsnitt 5 och 6.

## Kort svar

Bygg gränsen först och journalen sist, om alls. Journalen inom elevhälsans medicinska insats är inte en känsligare del av skolplattformen — den ligger under ett annat regelverk, hos en annan ansvarig, med en sekretessgräns som går rakt igenom huvudmannens egen organisation och som gäller även mot rektor. Marknaden är dessutom i praktiken delad mellan två system som nyligen gjort det lättare att byta mellan just dem.

Rekommendationen är tre steg, där bara det första är ett rimligt nästa beslut:

1. Bygg den täta gränsen och det som inte är journal: vårdgivarens ledningsdel, avvikelser, elevunderlaget som den medicinska insatsen läser, och åtskillnaden i behörighetsmodellen.
2. Integrera mot befintligt journalsystem när en kund kräver det.
3. Bygg journalen bara efter ett uttryckligt beslut om att bli ett vårdgivarsystem, med egen driftmiljö, egen granskning och egen försäljning.

## 1. DF RESPONS — hur det fungerar och vad det säger oss

DF RESPONS kommer från Digital Fox AB, som utvecklat systemet sedan 2006 för ärendehantering i offentlig sektor. Det är modulbyggt och säljs per verksamhetsområde: medborgardialog, vård och omsorg, personal, samt skola och förskola. [Digital Fox](https://digitalfox.se/vara-system/df-respons/)

För skola och förskola består erbjudandet av ett drygt tiotal moduler: digital elevakt som nav, kränkande behandling, olycksfall och tillbud, frånvaroutredning, särskilt stöd i skola respektive förskola, tilläggsbelopp, elevanteckningar, rektorsbeslut, klagomålshantering och diarium. Arbetsflödet är genomgående detsamma — rapportör lämnar en anmälan, den tas emot och fördelas, utreds, leder till åtgärd, följs upp och sammanställs i statistik — med spårbarhet på vem som tagit del av ett ärende. [Digital Fox skola och förskola](https://digitalfox.se/verksamhetsomraden/skola-forskola/)

Integrationsmodellen är publikt dokumenterad men tunn. DF RESPONS anropar REST-API:er hos tredjepartssystem och gör svaren till variabler och ärendetaggar som regelflödet sedan fattar beslut på. Dokumentationen anger själv att bara REST stöds i dag. Autentiseringsmodell, objektomfång, SS 12000-stöd och eventuella nätkrav framgår inte av det publika materialet och behöver frågas efter. [DF RESPONS integrationsdokumentation](https://docs.digitalfox.se/head/integration/)

Fyra slutsatser för vår del:

- **Det är ärendehalvan av vår egen produktmodell.** Ärendeprocess, kommunikation, utlämnande och begäran om handling finns redan beskrivna i `docs/produktunderlag/12-informationsmodell-och-designkontrakt.md`. Vi bygger alltså inte i ett tomrum, och en kund som redan har DF RESPONS kommer att ställa frågan vem som äger elevakten.
- **Diarium säljs som en egen modul.** Det bekräftar bedömningen i avsnitt 6 i kommunintegrationsdokumentet: registret över allmänna handlingar är en efterfrågad produktdel, inte en efterlevnadsdetalj.
- **De håller sig utanför journalen.** DF RESPONS stödjer elevhälsoteamets arbete men inte den medicinska journalen. Den gränsdragningen är gjord av någon som känner marknaden, och den är värd att ta på allvar.
- **Regelflöde som anropar REST är en annan filosofi än registersynk.** Det är enklare att komma igång med och svårare att göra informationsansvaret tydligt i. Vår linje i avsnitt 4 — originalkälla, skrivansvar, konfliktregel — är ett argument vi kan använda, inte en självklarhet för köparen.

## 2. Vad som faktiskt kräver strängare hantering

| Uppgiftsslag | Regelverk | Vad som skiljer det från vanlig skoladministration |
|---|---|---|
| Journal inom elevhälsans medicinska insats | HSL, patientdatalagen, HSLF-FS 2016:40, OSL 25 kap. 1 § | Annan ansvarig, egen verksamhetsgren, egen journal, egna krav på autentisering, logg och bevarande |
| Elevhälsans psykologiska insats | Samma hälso- och sjukvårdsregim | Egen journal; en psykologutredning är en vårdhandling, inte en skolhandling |
| Kurator och psykosociala insatser | OSL 23 kap. 2 § | Omvänt skaderekvisit; normalt inte hälso- och sjukvård, men gränsen behöver bestämmas per huvudman |
| Anmälan till socialnämnden | SoL 14 kap. 1 § | Att en anmälan finns är i sig en känslig uppgift, och anmälaren kan behöva skyddas |
| Kränkande behandling | Skollagen 6 kap. | Berör både utsatt och utpekad elev; anmälningskedjan lärare → rektor → huvudman ska kunna visas |
| Särskilt stöd och åtgärdsprogram | Skollagen 3 kap. | Röjer funktionsnedsättning; besluten överklagas och behöver därför en fastställd version |
| Skyddade personuppgifter | OSL 21 kap. 3 §, folkbokföringen | Röjande kan ske genom metadata, sökträffar och listor, inte bara genom innehållet |
| Nationella prov | OSL 17 kap. 4 § | Rent tekniskt läckageskydd med tidsgräns; skiljer sig från all annan åtkomstkontroll i produkten |

Den största praktiska risken ligger inte i tabellen ovan utan strax under den. Flera helt vanliga administrativa fält röjer uppgifter som hör till de särskilda kategorierna i dataskyddsförordningen, utan att vara märkta som känsliga någonstans i ett skoladministrativt system:

- Modersmålsundervisning och studiehandledning på modersmål röjer etniskt ursprung.
- Specialkost röjer religiös övertygelse eller hälsa.
- Anpassad studiegång, reducerat program och frånvaromönster röjer hälsa.
- Skolskjuts beviljad på medicinsk grund röjer hälsa.
- Närvarolistan på ett elevhälsomöte röjer att eleven är föremål för elevhälsoarbete.

De här uppgifterna hamnar i dag i elevregistret, i grupplistor och i exporter tillsammans med namn och klass. En modul för det medicinska uppdraget löser inget av det. Klassificeringen av dessa fält är ett billigare och mer verkningsfullt arbete än en journalmodul, och den behöver göras oavsett vilket beslut som fattas om elevhälsan.

En egen gränsdragning behövs också för läkemedel och hälso- och sjukvårdsåtgärder i skolan. Om skolan utför en åtgärd som är hälso- och sjukvård hör dokumentationen till journalen, inte till elevakten. Om den är egenvård gäller något annat. Gränsen avgörs i det enskilda fallet och behöver vara ett stöd i produkten snarare än ett fält som personalen gissar sig till.

## 3. Vad en modul för det medicinska uppdraget faktiskt innebär

### Huvudmannen blir vårdgivare

Med en medicinsk insats följer verksamhetschef enligt hälso- och sjukvårdslagen, medicinskt ledningsansvarig skolsköterska, ledningssystem, patientsäkerhetsberättelse och anmälningsskyldighet vid allvarlig vårdskada. Det är kundens ansvar, inte vårt, men det ändrar vem vi säljer till. Köparen är då inte skolchefen utan vårdgivaren, och upphandlingen ställer krav som en skoladministrativ produkt normalt inte möter.

### Gränsen är en verksamhetsgren, inte en behörighetsnivå

Den medicinska insatsen är en självständig verksamhetsgren i förhållande till skolans övriga elevstödjande verksamhet. Sekretessen gäller i båda riktningar, och rektor har inte rätt att ta del av journalen enbart i kraft av rektorsuppdraget — undantaget är om rektor uttryckligen utsetts att leda den medicinska insatsen, vilket är ett särskilt beslut. [Kunskapsguiden, Vägledning för elevhälsa](https://kunskapsguiden.se/omraden-och-teman/barn-och-unga/vagledning-for-elevhalsa/dokumentation-journalforing-och-sekretess/sekretess-och-tystnadsplikt/)

Det får en direkt arkitektonisk följd. Gränsen kan inte vara ännu en policy i samma tabellrymd som allt annat. Om ett misstag i en gemensam policy kan öppna journalen är gränsen inte trovärdig, oavsett hur policyn är skriven. Förslaget är eget schema med egen databasroll, eller ett eget databasprojekt, utan delad läsväg. Kopplingen till eleven sker genom ett stabilt elev-ID: den medicinska insatsen läser skolans elevlista, aldrig tvärtom. Detsamma gäller vår egen drift — leverantörens supportväg får inte nå journalmiljön genom samma dörr som allt annat.

### Krav som produkten måste bära

Enligt patientdatalagen och Socialstyrelsens konsoliderade föreskrifter. Paragrafhänvisningarna nedan är hämtade ur den konsoliderade versionen och behöver kontrolleras mot författningstexten innan de blir kravformuleringar, särskilt efter ändringen 2025.

| Krav | Följd för produkten |
|---|---|
| Stark autentisering vid åtkomst över öppet nät, minst två faktorer | Kommunens vanliga arbetsinloggning räcker inte automatiskt; SITHS eID eller motsvarande behöver kunna användas |
| Behörighet efter behovs- och riskanalys, med dokumenterade villkor och regelbunden uppföljning (HSLF-FS 2016:40 4 kap.) | Behörighetsvillkoren är ett förvaltat objekt i produkten, inte en installationsinställning |
| Inre sekretess: bara den som deltar i vården av just den eleven (PDL 4 kap. 1 §) | En skolsköterska får inte ha läsrätt till alla elever hos huvudmannen; åtkomst utanför den egna elevkretsen kräver ett aktivt, loggat val |
| Åtkomst loggas per användare, loggar bevaras minst fem år, systematiska stickprovskontroller som själva dokumenteras (4 kap. 9 och 9 b §§) | Logguppföljning är en funktion med eget gränssnitt, inte en tabell någon kan fråga ut vid behov |
| Spärr av uppgifter mellan vårdenheter hos samma vårdgivare (PDL 4 kap. 4 §) | Spärren måste slå igenom i sökning, listor och sammanställningar, inte bara i journalvyn |
| Journalhandling bevaras minst tio år efter sista anteckningen (PDL 3 kap. 17 §) | Krockar med skolans gallringsregler; journalen kan inte följa elevaktens livslängd |
| Rapportering av vaccinationer i det nationella programmet till Folkhälsomyndigheten | En obligatorisk integration, inte en tillvalsfunktion |
| Journalöverföring vid skolbyte | Sker mellan vårdgivare och kräver eget stöd |

### Marknaden

Prorenata Journal och PMO Journal försörjer enligt leverantörerna själva i praktiken hela den svenska elevhälsan med systemstöd, och de två har öppnat digital journalöverföring mellan sig. Prorenata anger samarbete med ett sjuttiotal kommuner och omkring 300 fristående skolor. [Prorenata](https://prorenata.se/digital-journaloverforing-nu-mojlig-mellan-prorenata-journal-och-pmo-journal/), [CGM om PMO för elevhälsa](https://www.cgm.com/swe_se/vierbjuder/pmo/pmo-for-elevhalsa.html)

Det är värt att läsa noga. Journalöverföringen mellan de två sänker tröskeln att byta mellan dem och höjer den mot en tredje. Att gå in där är inte att lägga till en modul; det är att ta upp konkurrensen med två etablerade produkter under ett regelverk som vår övriga produkt inte lyder under.

## 4. Vad som är värt att bygga i stället, nu

- **Klassificera de känsliga fälten i elevregistret.** Modersmål, specialkost, anpassad studiegång, skolskjutsgrund. Klassningen ska följa med i sökträffar, listor och exporter. Detta är den enda punkten i hela underlaget som ger tydlig nytta oavsett vilka andra beslut som fattas.
- **Bygg den täta gränsen redan innan det finns något att skydda bakom den.** Ett eget schema med egen roll, en elevkoppling som bara går åt ett håll, och ett acceptansfall som visar att rektor inte når igenom. Gränsen är billig att bygga nu och mycket dyr att bygga in i efterhand.
- **Bygg vårdgivarens ledningsdel utan journalinnehåll.** Uppdrag och behörighetsvillkor, avvikelser och anmälningar, patientsäkerhetsberättelsens underlag, statistik på aggregerad nivå. Det är arbete som i dag görs i dokument och som ingen av de två journalleverantörerna gör särskilt väl.
- **Bygg avvikelse- och klagomålsflödet.** Det är där kunderna redan har budget, det är DF RESPONS kärna, och det hänger ihop med registret över allmänna handlingar i avsnitt 6.

## 5. Acceptansfall

| Försök eller händelse | Förväntat resultat |
|---|---|
| Rektor med giltigt uppdrag försöker nå en journalpost via ett direkt API-anrop. | Nekas; försöket loggas och syns i logguppföljningen. |
| Skolsköterska söker en elev vid en annan skolenhet än den egna. | Kräver ett aktivt val som registreras som en särskild åtkomst, inte en tyst träff. |
| Åtkomstloggen tas ut för stickprovskontroll. | Loggen kan läsas och kontrolleras utan att journalinnehåll följer med, och kontrollen dokumenteras. |
| En uppgift spärras av vårdnadshavaren. | Uppgiften uteblir i sökning, listor och sammanställningar, inte bara i journalvyn. |
| Eleven slutar och elevakten gallras enligt skolans regler. | Journalen bevaras enligt sitt eget krav och påverkas inte. |
| En vaccination registreras men rapporteringen misslyckas. | Avvikelsen blir synlig och köas för omförsök; den försvinner inte tyst. |
| Modersmål eller specialkost ingår i en export. | Uppgiften behandlas som känslig och följer exportens skyddsregler. |
| Leverantörens support öppnar ett ärende. | Journalmiljön nås inte via supportvägen; åtkomst dit kräver en egen, motiverad och spårad rutin. |

## 6. Vad jag inte har kunnat verifiera

- DF RESPONS autentiserings- och behörighetsmodell, objektomfång och eventuellt SS 12000-stöd. Den publika dokumentationen beskriver bara att systemet anropar REST-API:er.
- Exakt lydelse och numrering i HSLF-FS 2016:40 efter ändringen 2025. Underlaget här bygger på Socialstyrelsens konsoliderade sammanställning.
- Gränsen mellan hälso- och sjukvård och egenvård vid läkemedelshantering i skolan.
- Om ett journalsystem med beslutsstöd kan omfattas av regelverket för medicintekniska produkter. Ett rent dokumentationssystem gör det normalt inte, men gränsen behöver bedömas om beslutsstöd blir aktuellt.
