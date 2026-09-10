# Risker i svensk skoladministration

**Projekt:** Skolplattformen, v1.0 — säker administration inför en pilot  
**Undersökt:** 2026-09-10  
**Samlad tillförlitlighet:** HÖG för citerade lagtexter och myndighetsvägledning; MEDEL för föreslagen produktutformning, eftersom pilotkund, informationsägare och anslutningsprofil inte är valda.

Pilotens största risk är att ett fungerande demonstrationsflöde uppfattas som en säker verksamhetstjänst. Identitet, aktuella uppdrag, avgränsad elevåtkomst och kontrollerbar import måste prövas tillsammans. Informationshantering och återställning hör till pilotberedskapen, men kräver inte att ett eget publikt diarium byggs i första milstolpen.

Underlaget är `.planning/PROJECT.md` och `docs/kommunintegration-och-sakerhet.md`. Kodobservationer nedan är dokumenterade nulägesuppgifter från dessa filer, inte en ny kodrevision eller nya testresultat. Det nytillkomna avsnittet om offentlighetsregister har behandlats som ett förslag och granskats mot primärkällor. Originaldokumentet har inte ändrats.

## Kritiska risker

### 1. Inloggning eller vald arbetsroll ersätter behörighetsbeslut

**Vad går fel:** En inloggad rektor får läsa eller ändra en annan skolas elever; huvudmannarollen öppnar alla elevärenden; ett gissat objekt-ID passerar API:t trots att knappen är dold. Gemensam kunddatabas gör ett sådant fel större, men en separat databas per kund löser inte skolgränserna inom kunden.

**Varför:** Demonstrationen har anonym etablering av huvudmannaprofil, klientvald roll och flera policyer som enligt projektunderlaget bara avgränsar till `organizer_id`. Organisation, personuppgiftsansvarig, kundmiljö och skolenhet sammanblandas. Ett skolregisteruppslag förväxlas med verifiering av en behörig företrädare.

**Förebygg:** Etablera första kundföreträdaren genom en verifierad process. Ta bort produktionsvägen till demoetablering. Modellera flera medlemskap och tidsbegränsade uppdrag. Pröva varje handling mot kund, ansvarig organisation, skolenhet, uppdrag och relevant relation. Kontroller måste omfatta databasanrop, filer, exporter, sökning, räknare och integrationsjobb. Servern härleder säkerhetskontexten från verifierad identitet; ett inkommande kund-ID väljer inte rättighet. OWASP rekommenderar nekande grundläge och kontroll vid varje begäran. [OWASP: Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html)

**Varningssignaler:** Testerna använder bara huvudmannakonton; samma konto används för två rektorer; ”RLS finns” används som bevis; tjänsteidentiteten kringgår alla policyer utan egen objektskontroll.

**Fas och bevis:** Säkerhetsgrund före beständiga elever. Kör negativa prov mellan två kunder och två skolor inom samma kund, med kända ID:n och direkta anrop. Bevisa också den avsedda ansvarsfördelningen: huvudman tillsätter rektor, rektor tilldelar läraruppdrag.

**Tillförlitlighet:** HÖG för principerna, MEDEL för exakt implementation tills kod och alla åtkomstvägar granskats.

### 2. Avslutat uppdrag lever vidare i sessioner och filer

**Vad går fel:** En vikarie vars uppdrag löpt ut fortsätter läsa elever med sin gamla session. Spärr i kommunens katalog når aldrig appen. En gammal exportlänk fungerar efter att medlemskapet avslutats.

**Varför:** SSO betraktas som hela kontolivscykeln. Inloggning, kontoprovisionering, anställning och verksamhetsuppdrag får samma giltighet. Rättigheter sparas som långlivade klientuppgifter och kontrolleras endast vid inloggning.

**Förebygg:** Använd utfärdare och stabilt subjekt-ID för extern identitet, med särskild hantering av identitetsbyte. Låt appens aktuella medlemskap och uppdrag avgöra nästa skyddade anrop. Mät separat fördröjningen mellan källspärr och appspärr. Dokumentera vad som händer när identitetskällan inte går att nå. Pröva utloggning, återkallning, uppdragsutgång, cachning och filhämtning som en kedja. Sessioners avslut och förnyelse behöver serverkontroll. [OWASP: Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)

**Varningssignaler:** ”Spärras vid nästa inloggning”; ingen ägare för avveckling; konton matchas enbart via e-post; signerat fil-URL saknar analyserad livslängd; appen visar annan skolas data under byte av arbetskontext.

**Fas och bevis:** Identitet och uppdrag. Prova spärr och utgång mitt i en öppen session samt redan köad export. Redovisa uppmätt återkallningstid. Nedladdade kopior kan inte återkallas genom att en session stängs; minimera därför distributionen.

**Tillförlitlighet:** HÖG för riskmönstret, MEDEL för pilotens möjliga fördröjning tills faktisk identitetsleverantör prövats.

### 3. Skyddade uppgifter röjs genom metadata och sidoflöden

**Vad går fel:** Elevkortet maskeras men elevens skola, klass, adress eller relationer avslöjas i sökförslag, export, felrapport, filnamn, logg eller avisering. En offentlig beskrivning kan indirekt identifiera eleven även utan namn.

**Varför:** Skyddet implementeras som en symbol och ett dolt fält. Integrationens markeringar tolkas olika eller tappas vid import. Vanlig skoladministration blandas med medicinska elevhälsojournaler.

**Förebygg:** Gör en informationsklassning tillsammans med pilotens ansvariga och definiera minsta användbara uppgiftsmängd för varje uppdrag. IMY framhåller både barns särskilda skyddsbehov och den höga skaderisken vid röjande av skyddade personuppgifter. Tekniska skydd behöver kompletteras med verksamhetsrutiner. [IMY: Personuppgifter i skola och förskola](https://www.imy.se/verksamhet/dataskydd/dataskydd-pa-olika-omraden/skola-och-forskola/)

**Produktrekommendation:** Bevara skyddsklassning och dess källa. Stoppa en osäker mappning för granskning. Begränsa innehåll i övervakning och supportärenden. Pilotens telefonflöde bör sakna offlinekopior av elevinnehåll och röjande aviseringar. Medicinska journaler ingår inte i pilotens elevregister.

**Varningssignaler:** Skydd kontrolleras bara i en React-komponent; personnummer används som URL eller loggnyckel; full importpayload skickas till felloggning; en skyddad elev får samma CSV-export som övriga.

**Fas och bevis:** Elevmodell och import, återprövat inför pilot. Använd syntetiska skyddsfall i lista, detalj, sökning, antal, export, filer, support och felloggar. Testa även att felaktiga skyddsmarkeringar inte försvinner tyst.

**Tillförlitlighet:** HÖG för skyddsbehov; MEDEL för valda fält och arbetsrutiner tills kunden har klassat informationen.

### 4. Synk gör källfel till massändringar eller nya rättigheter

**Vad går fel:** Ett svar med noll elever raderar hela registret. En avbruten paginering tolkas som full leverans. Omförsök skapar dubbla elever. Importerade kataloggrupper ger administratörsrättigheter. Lokal korrigering skrivs över utan synlig källa.

**Varför:** HTTP-framgång förväxlas med en komplett och auktoritativ leverans. ”Senast vinner” ersätter ett beslutat informationsansvar. Personnummer eller e-post används som enda systemidentitet. Borttagen placering likställs med radering av person och historik.

**Förebygg — produktrekommendation:** Börja med en läsande anslutning. Dokumentera källa och skrivansvar per objekt och fält, externa ID:n med källsystemets namnrymd, giltighet, skyddsklassning, borttagningssignal och konfliktregel. Separera mottagning, validering, jämförelse och verkställande. Spara körnings-ID, fullständighetsmarkör och senaste lyckade avstämning. En tom, ofullständig eller ovanligt stor ändring går till avvikelsehantering. Inga destruktiva massändringar utan kontrollerad bedömning. Legitima borttagningar måste samtidigt kunna hanteras efter avstämning.

**Varningssignaler:** Importen tar först bort alla befintliga rader; API-kontraktet saknar paginering och borttagningssemantik; det finns ingen mottagningskvittens eller omkörningsstrategi; gruppnamn mappas direkt till höga rättigheter.

**Fas och bevis:** Informationsansvar före integrationsimplementation. Prova samma leverans två gånger, avbrott mellan sidor, äldre data efter nyare data, tomt resultat, okänt ID, skolbyte, avslutad placering och återstart efter partiellt fel. Validera betydelsen med leverantören; standardnamnet SS 12000 är inte ett integrationsbesked.

**Tillförlitlighet:** HÖG för att riktighet, tillgänglighet och konfidentialitet måste skyddas enligt IMY; MEDEL för mekanismerna ovan, som är projektrekommendationer och behöver kontraktsprov. [IMY: Säkerhetsåtgärder](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/informationssakerhet/sakerhetsatgarder/)

### 5. Ett juridiskt förslag blir automatisk produktregel

**Vad går fel:** Plattformen publicerar elevärendemetadata, diarieför varje fastställande eller raderar identitetsuppgifter därför att analysdokumentet beskriver det som lagkrav. En kundstorlek eller ett årsskifte omklassificerar historik utan bedömning. En ny diarietjänst tränger undan den valda säkerhetspiloten.

**Varför:** Allmän handling, offentlig uppgift, registrering, ordnande, arkivering och webbpublicering behandlas som samma sak. Förarbeten blandas med lagtext och produktval.

**Förebygg:** Använd granskningen nedan som korrigerande forskningsunderlag. För piloten ska kunden fastställa ansvar, handlingstyper, bevarande, gallring och fungerande utlämnandeväg. Anslut eller överlämna till befintlig hantering där sådan finns. Ett framtida eget diarium behöver ett separat, beslutat behov och rättsligt granskat flöde.

**Varningssignaler:** Acceptansfall kräver publik databasåtkomst; en `faststalld`-trigger tilldelar alltid diarienummer; ”utkast” får aldrig lämnas ut; 450 elever växlar automatiskt alla regler; 2027 blir ett påhittat leveransdatum.

**Fas och bevis:** Pilotprofil och informationshantering innan dataimportens slutliga utformning. Namngiven kundfunktion prövar exempel på handlingar och en begäran från en anonym sökande. Fungerande återfinning, bedömning och överlämning är beviset; en ny registervy är inte beviset.

**Tillförlitlighet:** HÖG för kontrollerad författningstext; MEDEL för enskilda handlingars klassning och lokala processval.

## Granskning av offentlighetsavsnittet

**Rättsläge kontrollerat 2026-09-10.** Hänvisningarna avser beslutade ändringar SFS 2026:714, 2026:715 och 2026:716, inklusive ännu inte ikraftträdda bestämmelser. Framtida ikraftträdande anges uttryckligen. Bedömningarna nedan ersätter inte pilotens beslut om hantering av konkreta handlingar.

| Påstående i underlaget | Verifiering och korrigering | Följd för produkten |
|---|---|---|
| Offentlighetsprincipen gäller enskilda huvudmän från 2027. | **I huvudsak rätt, men avgränsning saknas.** Beslut 26 maj 2026; ikraftträdande 1 januari 2027. OSL 2:3a omfattar godkända enskilda juridiska personer och handlingar i den godkända verksamheten. Handlingar inkomna/upprättade före ikraftträdandet undantas från den nya paragrafen. [Beslut UbU20][lagbeslut], [OSL][osl]. | Dokumentera huvudmannens juridiska form, verksamhet och handlingstidpunkt. Inför inte retroaktiv massklassning. Lagdatum är inte projektdeadline. |
| Varje kund behöver ett register över allmänna handlingar. | **Fel som generell slutsats.** Under 2027–2028 ersätts OSL 5:1–2 för berörda enskilda huvudmän av skollagens lättnadsregler. Därefter omfattas mindre huvudmän. Skollagen 29:16e anger ordnande i stället för dessa registreringskrav. [OSL, övergång 2026:714][osl], [skollagen][skollag]. | Kräv fungerande informationshantering; välj register eller ordnat bestånd efter tillämpliga regler och kundens process. |
| Ett publikt webbregister och anonyma databaspolicyer är nödvändiga. | **Saknar stöd i de åberopade bestämmelserna.** OSL 5:2 behandlar registrets uppgifter och särskiljande, inte obligatorisk webbpublicering. TF 2:15–16 behandlar tillhandahållande och kopior. [OSL][osl], [TF][tf]. | Behåll skyddade läsvägar i piloten. Eventuell webbpublicering blir separat ändamål och designbeslut, med granskning även av indirekt röjande. |
| Varje fastställd plan och varje fastställt läsår ska automatiskt registreras. | **För kategoriskt.** TF 2:4 och 9–10 knyter handlingens status till förvaring, ankomst, expediering och färdigställande. OSL 5:1 medger bland annat ordnande av icke sekretessbelagda handlingar. Appstatusen ensam avgör inte saken. [TF][tf], [OSL][osl]. | Spara verkliga händelser och versioner. Huvudmannens handlingstypsregler kan föreslå ett nästa steg; automatisering kräver verifierad klassning och undantag. |
| Utkast registreras aldrig; interna kommentarer behöver aldrig bedömas. | **Fel som absolut regel.** TF 2:12 undantar vissa oexpedierade utkast och minnesanteckningar, men arkivering och anteckningar som tillför sakuppgifter påverkar bedömningen. Etiketten ”utkast” ger inget generellt undantag för inkommet material. [TF][tf]. | Behåll möjlighet till individuell bedömning. Testfall ska omfatta inkommet material märkt utkast, expedierat material och omhändertagande för arkivering. |
| Anonymitet innebär att sökandens identitet aldrig får lagras eller efterfrågas. | **För långtgående.** TF 2:18 begränsar efterforskning; det är inte ett generellt lagringsförbud. Skollagen 29:16c medger dessutom kontaktfråga i det angivna alternativa utlämnandefallet. [TF][tf], [skollagen][skollag]. IMY beskriver hur inkommande meddelanden hanteras som allmänna handlingar. [IMY: behandling av personuppgifter][imyperson]. | Erbjud en fungerande väg utan obligatoriskt konto eller identitetskrav. Minimera kontaktuppgifter, åtkomst och loggning; ändra inte inkomna original godtyckligt. Bedöm tekniska loggar särskilt, utan löfte om total anonymitet. |
| En vecka är lämplig automatisk rättslig frist. | **Inte en fast lagfrist.** Skollagen 29:16a anger rimlig tid efter omständigheterna. Propositionen beskriver en vecka som normal utgångspunkt med kortare och längre fall och avvisar en sådan gräns i lagtexten. [Skollagen][skollag], [proposition avsnitt 7.1.4][prop]. | Visa mottagningstid, ansvarig och behov av uppföljning. Rättsligt handläggningskrav och intern bevakningsdag ska vara skilda uppgifter. |
| Appens elevantal kan automatiskt byta profil vid 450 elever eller 2029. | **Ofullständig modell.** Skollagen 29:15 omfattar också koncern och en särskild förskolegräns. Enligt 29:16 får äldre handlingar inte retroaktivt de angivna registrerings- och arkivkraven när huvudmannen växer. [Skollagen][skollag]. | Lokalt elevantal är en signal, inte beslutsunderlag för hela koncernen. Spara beslutad profil, underlag och giltighet; bevara historisk regelkontext. |
| Alla enskilda huvudmän följer arkivlagen 2029; allt bevaras minst sju år. | **Undantag saknas.** Arkivlagens utvidgning från 2029 undantar de mindre huvudmännen. Skollagen 29:16f har sju år som huvudregel men tillåter tidigare gallring enligt motsvarande kommunala föreskrifter. [Arkivlagen][arkiv], [skollagen][skollag]. | Varken generell sjuårsradering eller obegränsad lagring. Kräv dokumenterat bevarande-/gallringsbeslut och hantering av pågående begäran. |
| Ett eget diarium måste finnas för en privat pilot efter januari 2027. | **Saknar stöd.** Propositionen räknar uttryckligen med att många mindre och medelstora huvudmän kan hålla handlingarna ordnade utan särskilt administrativt system. [Proposition, konsekvensanalys][prop]. | Pröva kundens befintliga diarium, ordnade hantering eller kontrollerad överlämning först. Pilotberedskap kräver att helheten fungerar. |
| Diarienummerserien måste vara obruten utan luckor. | **Obestyrkt som generellt lagkrav.** OSL 5:2 tillåter diarienummer eller annan beteckning. [OSL][osl]. | Kräv unika, beständiga referenser och spårbara rättelser. Uppfinn inte en sekvensgaranti som försvårar samtidighet och återställning utan kundkrav. |

Två ytterligare preciseringar behövs om funktionerna senare byggs. Bestämmelsen om överlämnande av betyg i skollagen 29:18 får ändrad personkrets 2027 och bör inte kopieras som oförändrad regel för alla huvudmän. Sekretessmarkering ska stödja prövning, aldrig vara ett automatiskt avslagsbeslut. En laglig registeruppgift är inte heller automatiskt lämplig för obegränsad webbpublicering; IMY:s äldre tillsyn av internetdiarier illustrerar risken med indirekt identifiering, men den källan används här som historiskt riskexempel, inte som självständig aktuell lagregel. [Skollagen][skollag], [IMY: publicering i internetdiarium][imydiarie].

**Rekommenderad pilotlösning:** Besluta en begränsad informationshanteringsbeskrivning med ansvarig funktion, källor, lagring, återfinning, bevarande/gallring och utlämnandeväg. Bevara stabila referenser och nödvändiga händelsetider. Prova en begäran hela vägen genom kundens process. Håll frågan om en framtida publik tjänst öppen för separat produktbeslut.

## Drift- och förvaltningsrisker

### 6. Händelsehistorik kan förfalskas eller kan inte förklara incidenten

**Vad går fel:** En klient väljer en annan `actor_role`, säkerhetsloggen visar bara lyckade skrivningar och en masshämtning av elever lämnar inga användbara spår. Rutinmässig loggning skapar samtidigt nya kopior av skyddade uppgifter.

**Förebygg:** Skapa säkerhetshändelser i en betrodd exekveringsväg från faktiskt verifierad identitet och uppdrag. Skilj verksamhetshistorik från säkerhetslogg och integrationsavstämning. Koppla händelser till tid, resultat, objekt och korrelations-ID. Begränsa ändringsrätt och åtkomst till loggarna; övervaka bortfall, avvikande läsning och export. IMY:s Vklass-beslut visar den konkreta risken när leverantören varken upptäcker eller kan utreda en incident tillräckligt. [IMY: Vklass måste skärpa säkerheten](https://www.imy.se/nyheter/vklass-maste-skarpa-sakerheten/), [OWASP: Logging](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html)

**Varningssignaler och prov:** Klientens aktörsfält återges okontrollerat; inga läshändelser eller larm; ingen ansvarig bevakar loggar. Försök förfalska aktören och spåra sedan en syntetisk obehörig export. Fastställ beteendet när loggmottagningen är nere. **Fas:** säkerhetsgrund och pilotdrift. **Tillförlitlighet:** HÖG för behovet, MEDEL för exakt loggomfattning.

### 7. Säkerhetskopia återställer även gamla rättigheter och fel

**Vad går fel:** Databasen återställs men filer saknas; en tidigare spärrad användare blir aktiv; integrationsjobbet kör om gamla ändringar; kund A:s återställning påverkar kund B.

**Förebygg:** Specificera vilka data, filer, inställningar och nyckelberoenden som ingår samt accepterad dataförlust och återställningstid. Prova återläsning i avskild miljö. Återställ aktuell spärrstatus, avstäm integrationernas position och prova kund-/skolisolering före öppning. IMY betonar att även kopior ska skyddas och återläsning regelbundet testas. [IMY: Säkerhetskopiering](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/informationssakerhet/sakerhetskopiering/)

**Varningssignaler och prov:** Leverantörens backupfunktion används som enda bevis; återställning har aldrig körts; kundexport saknar filer eller relationer. Genomför ett syntetiskt återställningsprov med en spärr utförd efter kopians tidpunkt. **Fas:** driftval tidigt, fullständigt prov före verklig användning. **Tillförlitlighet:** HÖG för behovet, MEDEL för vald driftforms möjligheter.

### 8. Support och EU-region betraktas som färdig dataskyddslösning

**Vad går fel:** Supportkontot har permanent elevåtkomst; råa elevdata kopieras till felsökningsärenden; extern drift och underbiträden saknar tydligt ansvar. Kunden bedömer behandlingens konsekvenser först efter introduktionen.

**Förebygg:** Dokumentera faktiska behandlingar och åtkomst hos appdrift, databas, filer, backup, övervakning och support. EU-lagring avgör inte ensam frågan om tredjelandsöverföring; även åtkomst till en mottagare utanför EU/EES behöver bedömas. [IMY: Överföring till tredjeland](https://www.imy.se/verksamhet/dataskydd/det-har-galler-enligt-gdpr/overforing-till-tredje-land/)

**Produktrekommendation:** Support börjar med syntetiska reproduktioner och minimerade tekniska data. Elevåtkomst kräver namngivet, tidsbegränsat och spårbart uppdrag enligt avtalad rutin. Kunden behöver besluta informationsklassning, bedöma behovet av konsekvensbedömning och fastställa biträdes- och incidentansvar före verkliga data. IMY:s tillsyn av Östersunds skolplattform visar att en konsekvensbedömning som behövs ska göras före införandet. Det avgör inte automatiskt exakt kravbild för denna mindre pilot. [IMY: Östersund och konsekvensbedömning](https://www.imy.se/nyheter/sanktionsavgift-mot-kommun-som-inte-bedomt-konsekvenser-innan-google-workspace-infordes/)

**Varningssignaler och prov:** Alla supportärenden kräver databasadministratör; avveckling är bara ”radera kunden”; ingen incidentkontakt. Prova tidsbegränsad support, återkallning, fullständig kundexport och avveckling med bevarandekrav. **Fas:** pilotprofil och pilotberedskap. **Tillförlitlighet:** HÖG för grundprinciper, MEDEL för leveransens bedömning tills avtal och drift är valda.

## Måttliga risker och onödig teknisk skuld

| Genväg | Konsekvens | Förebyggande beslut |
|---|---|---|
| Gemensam profil med en roll och en huvudman per person | Flera skoluppdrag leder till specialfall eller överbehörighet. | Inför medlemskap och uppdrag före elevmigreringen. |
| Översätta alla externa fält direkt till interna rättigheter | Källändringar kan höja privilegier. | Separera registerdata från granskad behörighetsmappning. |
| Konstruera generell tvåvägssynk före första kunden | Konflikter och ägarfrågor byggs in utan verifierade behov. | En avgränsad läsande anslutning, senare skrivning efter beslutat ansvar. |
| Behålla känsliga råimporter och loggar för alltid | Fler svårkontrollerade kopior och oklar gallring. | Separata ändamål, rättigheter och beslutade livscykler. |
| ”Senast sparat” betyder ”senast verifierat” | Administratören arbetar vidare med inaktuella källuppgifter. | Visa ursprung, senaste lyckade synk, avvikelse och pågående ändring tydligt. |
| Samtidiga fastställanden eller överskrivna ändringar | Planernas giltiga version blir oklar. | Transaktionell statusändring, konfliktbesked och bevarade versioner. Pröva befintliga utbildningsflöden vid identitetsbytet. |
| Årskopia flyttar elevplaceringar automatiskt | Användarens önskade kopia av utbildningsupplägg blandas ihop med elevhistorik. | Skilj utbildningskull, läsår, placering och kopierat upplägg enligt projektbeslutet. |
| Utloggning lämnar personuppgifter i lokal cache | Delad telefon eller dator visar tidigare användares information. | Rensa relevant klienttillstånd vid sessions- och kontextbyte; prova bakåtnavigering och flera flikar. |

Tabellen anger produkt- och konstruktionsrisker med **MEDEL tillförlitlighet**. Kundens faktiska flöden och riktade prov avgör vilka mekanismer som krävs. Inga godtyckliga skalgränser anges; mät sökning, export och avstämning mot överenskommen pilotvolym.

## Koppling till färdplan och verifiering

Fasnamnen är rekommenderade arbetsområden, inte antagna fasnummer eller leveransdatum.

| Arbetsområde | Risk som måste hanteras | Konkret bevis före nästa steg |
|---|---|---|
| Pilotprofil och informationsansvar | Fel huvudman, obestämd källauktoritet, felaktiga lagantaganden | Dokumenterad ansvarig organisation, godkända anslutningar, skrivansvar, informationshantering och öppna kundberoenden. |
| Identitet och uppdrag | Demoåtkomst, överbehörighet och utebliven spärr | Negativa tester över kund- och skolgräns; avslutat uppdrag nekas med gammal session; ingen anonym produktionsetablering. |
| Beständigt elevregister | Skyddade uppgifter, fel historik och UI-läckage | Syntetiska skyddsfall genom alla läsvägar; ursprung och giltighet; bevarade utbildnings- och mobilflöden. |
| En registerintegration | Tom leverans, dubbletter, fel borttagning och delvis misslyckad körning | Avstämning, omkörning och stopp efter avvikelse demonstrerade mot syntetiskt kontrakt; verklig API-behörighet kvar som eget beroende. |
| Pilotberedskap | Oupptäckt incident, supportläcka, återställningsfel och avveckling | Spårbart incidentprov, tidsbegränsad support, återställning inklusive spärrar/filer, kundexport och fungerande utlämnandeväg. |

**Fördjupad fasresearch behövs:** faktisk identitetsleverantör och spärrsignal; första registerleverantörens kontrakt; kundens informationsklassning och diarierutin; rättslig profil vid framtida enskild kund; driftens återställnings- och supportvillkor.

**Ser färdigt ut men kräver fortfarande bevis:** inloggning utan avveckling, elevkort utan skydd i export, synk utan avstämning, logg utan incidentutredning, backup utan återställning och en registervy utan bemannad utlämnandeprocess.

## Källor och tillförlitlighet

Samtliga länkar kontrollerades 2026-09-10. Lagtexter och officiella beslut ger **HÖG** säkerhet för vad de uttryckligen anger. Tillämpning på en bestämd handling eller organisation och föreslagen implementation har **MEDEL** säkerhet tills ansvariga granskat faktaunderlaget. Inga obekräftade leverantörsfunktioner eller enbart sökträffar används som faktagrund.

- Riksdagen: TF 2 kap.; OSL 2:3a, 5 kap. och övergång SFS 2026:714; skollagen 29:15–16f och 18 samt SFS 2026:716; arkivlagen 2a och SFS 2026:715. Konsoliderade lagtexter innehåller också framtida lydelser; relevanta ikraftträdanden redovisas ovan.
- Riksdagen: beslut 2025/26:UbU20, 2026-05-26; proposition 2025/26:191, 2026, särskilt avsnitt 7.1.4 och konsekvensanalysen. Propositionen används för motiv, aldrig som ersättning för beslutad lag.
- IMY: skolvägledning uppdaterad 2026-06-15; säkerhetsåtgärder uppdaterad 2026-06-15; tredjelandsvägledning uppdaterad 2025-08-21; säkerhetskopiering uppdaterad 2023-03-31.
- IMY: Vklass-beslut 2023-08-24 och nyhet 2023-08-25; Östersundsbeslut 2023-11-28 och nyhet 2023-11-30. Historiska tillsynsfall stödjer riskmönster, inte påståenden om leverantörernas nuvarande säkerhetsnivå.
- OWASP: Authorization, Session Management och Logging Cheat Sheets; levande vägledningar kontrollerade på undersökningsdagen.

[lagbeslut]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/betankande/offentlighetsprincipen-med-lattnadsregler-for_hd01ubu20/
[osl]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/offentlighets-och-sekretesslag-2009400_sfs-2009-400/
[tf]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/tryckfrihetsforordning-1949105_sfs-1949-105/
[skollag]: https://data.riksdagen.se/dokument/sfs-2010-800.html
[arkiv]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/arkivlag-1990782_sfs-1990-782/
[prop]: https://www.riksdagen.se/sv/dokument-och-lagar/dokument/proposition/offentlighetsprincipen-med-lattnadsregler-for_hd03191/html/
[imyperson]: https://www.imy.se/om-oss/behandling-av-personuppgifter/
[imydiarie]: https://www.imy.se/om-oss/arkiv/nyhetsarkiv/lansstyrelse-maste-begransa-tillgangen-till-personuppgifter/
