# Ersättning och fakturering till elevens hemkommun

Researchdatum: 2026-09-29. Status: underlag för framtida GSD-planering. Användaren har begärt research och todos; skolformer, pilotmotpart och genomförandefas är ännu inte beslutade. Befintliga 42 krav och pågående fas 4 ändras inte av detta underlag.

## Verifierat i projektet

Elevregistret har daterade hemkommunperioder och skolplaceringar samt ändringshistorik. Dialogen i `web/app/pupil-dialogs.tsx` begär idag fyra siffrors kommunkod i fritext. `web/lib/pupil-register-model.ts` använder municipalityCode som kod. Dessa uppgifter kan bli indata till ersättningsunderlag, men kodläsningen belägger ingen byggd faktureringsfunktion. Elevregistrets utbildning och klass är inte i sig bevis för betalningsansvar eller beviljad ersättning.

## Regler som påverkar utformningen

### Hemkommun och betalningsansvar

Hemkommun är som huvudregel folkbokföringskommunen. För bland annat personer som inte är folkbokförda här och personer med skyddad folkbokföring finns särskilda vistelsebaserade regler i 29 kap. 6 §. Grundskolans interkommunala ersättning och bidrag till fristående grundskola regleras i 10 kap. 34–39 §§; gymnasieskolans motsvarigheter i 16 kap. 50–55 §§. Regeln måste kopplas till skolform, mottagningsgrund och huvudmannatyp. Undvik automatisk härledning från adress eller enbart den senast registrerade kommunkoden. Kontrollera den lydelse som gäller vid ersättningsperioden, eftersom lagtexten också innehåller framtida bestämmelser. [Skollagen, Riksdagen](https://www.riksdagen.se/sv/dokument-och-lagar/dokument/svensk-forfattningssamling/skollag-2010800_sfs-2010-800/).

### Offentlig huvudman: interkommunal ersättning

För nationella gymnasieprogram är avtalad ersättning central; utan annan överenskommelse är utgångspunkten anordnarens självkostnad. Andrahandsmottagande och vissa särskilda utbildningar har egna regler. Utbildningens startdatum spelar roll för övergången efter 30 juni 2025. Avstämningsdag, ersättning efter avbrott och retroaktivitet har ingen generell detaljregel i skollagen enligt Skolverkets stöd. Därför ska dessa villkor dokumenteras per beslut/avtal, inte hårdkodas till exempelvis den 15:e. Introduktionsprogram och förlängd utbildning behöver egna villkor. [Skolverket: interkommunal ersättning](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/stod-for-gymnasieantagning/interkommunal-ersattning).

### Enskild huvudman: bidrag

Bidrag och interkommunal ersättning är skilda regelverk. För gymnasieskolans nationella program kan bidrag bestå av grundbelopp och tilläggsbelopp. Bidrag beslutas per kalenderår; riksprislistan används i vissa fall. Skolverkets stöd anger även särskild periodregel för elever som påbörjar utbildning i augusti. Läsår räcker alltså inte som prisversion. Avstämningsdatum för bidrag är inte generellt reglerat i skolförfattningarna. [Skolverket: bidrag till enskilda huvudmän](https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/stod-for-gymnasieantagning/bidrag-till-enskilda-huvudman).

Tilläggsbelopp för extraordinära stödåtgärder kräver egen prövning; vanliga stödinsatser bekostas normalt inom grundbeloppet. Modellera därför beslutad ersättning och dess giltighet separat från elevens stödbehov. [Skolverket: ansöka om tilläggsbelopp](https://www.skolverket.se/larande-och-trygghet/elevhalsa-och-stodinsatser/stod-och-tidiga-insatser/ansoka-om-tillaggsbelopp).

### Kommunernas processer varierar

Stockholms stad anger registrering av gymnasieelever i UEDB som väg för bidrag och ersättning, och publicerar skilda prisunderlag för interkommunal ersättning och fristående huvudmän. Det belägger att mottagarens elevrapportering måste undersökas före val av integration; sidan fastställer inte fakturakrav för alla kommuner. [Stockholms stad: gymnasiebidrag](https://leverantor.stockholm/fristaende-forskola-skola/gymnasieskola/bidrag/).

Som exempel från en annan skolform skapar Stockholms ersättningshandläggare månatliga utbetalningsunderlag för fristående förskolor. Detta är ett exempel på utbetalningsprocess, inte ett gymnasieregelverk. Vår slutsats för systemdesignen är att även utbetalning utan egen faktura behöver kunna stämmas av. [Stockholms stad: förskoleersättning](https://leverantor.stockholm/fristaende-forskola-skola/forskola-pedagogisk-omsorg/ersattning/).

### E-faktura och moms

E-fakturalagens omfattning knyts till offentlig upphandling, inte enbart till att betalaren är en kommun. Upphandlingsmyndigheten rekommenderar Peppol BIS Billing 3 enligt EN 16931 och Peppolnätverket; PDF är inte en strukturerad e-faktura. För just skolersättningen behöver ekonomiansvarig fastställa transaktionens klassning och mottagarens krav. [Upphandlingsmyndigheten: regler för e-faktura](https://www.upphandlingsmyndigheten.se/digitalisering-och-e-handel/e-handel/regler-for-e-handel-och-e-faktura/).

Skatteverket beskriver villkor för momsfri utbildning under eget ansvar. Detta är inte stöd för att sätta samma momskod på alla ersättningar och tillägg. Skilj momsfri utbildning, bidragets momskompensation och eventuella andra tjänster; låt ekonomiansvarig besluta kontering och skattebehandling. [Skatteverket: momssatser och undantag](https://www.skatteverket.se/foretag/moms/saljavarorochtjanster/momssatspavarorochtjanster.4.58d555751259e4d66168000409.html).

### Kommunförteckning

SCB förtecknar kommuner och regionala koder. Använd officiell, daterad förteckning som grund för sökbart kommunval och lagra fyrsiffrig kod som text så inledande nollor bevaras. En kommunförteckning är inte ett register över fakturamottagare. [SCB: län och kommuner](https://www.scb.se/hitta-statistik/regional-statistik-och-kartor/regionala-indelningar/lan-och-kommuner/).

## Föreslagen lösning

Förslaget är en ersättningsprocess ovanpå registret:

1. Registrera betalande motpart och ett daterat beslut/avtal: ersättningstyp, utbildningskod, tariff, periodregler, avstämningsdag och betalningssätt.
2. Skapa ett reproducerbart underlag från giltiga hemkommun- och placeringsperioder. Saknat beslut, oklar betalare, överlapp eller saknad tariff ger avvikelse som måste lösas.
3. Låt behörig personal granska och attestera underlaget. Frys registerversioner, prisversion och beräkningsregel så att senare elevändringar inte ändrar ett redan godkänt belopp.
4. För fakturaflöde: överför godkänt underlag till ekonomisystem som hanterar fakturanummer, e-faktura och bokföring. För utbetalningsflöde: stäm av beslutad ersättning mot mottagen utbetalning. Teknisk leveranskvittens betyder inte betalning.
5. Hantera sena kommunbyten, avbrott och tariffändringar som spårbara differenser, rättelser eller kreditunderlag kopplade till ursprunget. Förhindra dubbelt underlag vid omkörning.

Detta är en produktrekommendation, inte ett fattat integrationsbeslut. Första leveransen bör vara underlag med granskning för en beslutad skolform och motpart. Direkt Peppol-sändning är ett möjligt senare steg efter ekonomisystemets ansvarsgräns har fastställts.

Ekonomibehörighet och elevbehörighet måste utredas tillsammans. Föreslagen princip: skicka minsta nödvändiga information till ekonomi; håll elevspecifikation och skyddade ärenden i en särskilt behörighetsstyrd kanal. Låt inte tilläggsbeloppsrader bära diagnoser eller stödutredningar. Fastställ personuppgiftsansvar, gallring/arkiv och mottagarens matchningskrav före verklig överföring.

## Planeringsordning och öppna beslut

Kommunvalet kan planeras som en avgränsad förbättring av elevregistret. För ersättningen: besluta först skolform/huvudmannatyp och kommunprocess; därefter modellera tariff och betalningsansvar, säkerhet samt underlag; sist attest/rättelser och ekonomiöverföring. Gymnasiets mottagningsgrund, programkod och utbildningens start kan kräva nya uppgifter utöver dagens registermodell.

Öppet: första kommun och skolform, beslutsägare för priser och betalningsansvar, faktura kontra utbetalning, ekonomi-/elevrapporteringssystem, behörighetsroller, skattebehandling och vilka elevuppgifter mottagaren faktiskt behöver. Dessa fångas i sex ersättningstodos. Ingen kontakt med kommun eller ekonomisystem har gjorts och ingen faktisk anslutning har verifierats.
