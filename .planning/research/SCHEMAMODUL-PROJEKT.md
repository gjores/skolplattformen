# Delprojekt: sammanhängande planering och modulär schemaläggning

Datum: 2026-10-01. Status: användarbeställd projektinriktning och planeringsunderlag. Kraven ska utformas tillsammans redan nu; ingen ny schemamotor, Rusttjänst, AI-koppling eller behörighetsfunktion är implementerad genom detta dokument. Detaljerade genomförandeplaner och verifiering återstår. Delprojektet ligger i befintligt GSD-projekt; uppdelning i paket, tjänster eller ett separat kodrepo avgörs av integrationskontraktet.

## Användarens beslut

- Schemaläggning ska utvecklas tillsammans med programplaner, timplaner, individuella studieplaner och övriga relevanta planeringsmoduler.
- Specifika roller och regler behöver hanteras redan i grundarbetet, före öppnande av nya datavägar.
- Rust ska ingå som ett uttryckligt teknikspår med en körbar prototyp. Placeringen i arkitekturen och val av beräkningsmotor behöver prövas; en full backendomskrivning är inte beslutad.
- Jev eller liknande AI-verktyg ska ingå i själva schemamodulen och provas som stöd för konfliktprioritering, val av åtgärder och värdering av alternativ. Detta avser inte enbart källgranskning i researchprocessen.
- Det ska gå att använda valda delar av olika interna eller externa moduler. Ett val av schemamotor får inte tvinga fram ett byte av programplan, studieplan, redigeringsvy eller hela plattformen.
- Kunden ska kunna köpa moduler var för sig och senare lägga till eller avsluta valda moduler. Detta är ett kommersiellt produktkrav utöver den tekniska möjligheten att kombinera komponenter.

## Mål

Behörig personal kan skapa, jämföra, ändra och publicera scheman utifrån rätt planversioner, elev-/lärarrelationer och kalender. Det går att följa undervisningsbehovet från program och individuell studieplan till timfördelning, undervisningsgrupp och faktiskt schematillfälle. Det går att byta eller kombinera avgränsade komponenter med bibehållet informationsansvar, behörighet, regler och historik.

## Kodförankrat utgångsläge

Den äldre kodkartan i `.planning/codebase/ARCHITECTURE.md` beskriver 2026-09-11, före senare server- och skyddsarbete. Följande kod har lästs 2026-10-01; inga körprov har gjorts i denna dokumentuppdatering:

- `web/lib/admin-model.ts`: studieplansrader och utkast, gruppmedlemskap, schemaslots och konfliktkontroll. Flera resurser uttrycks med lärarnamn, rumsnamn och veckodag/minuter. Dessa exempelobjekt är inte ett färdigt kontrakt för beständig schemaläggning.
- `web/lib/cohort-model.ts`: kullkopiering och äldre klassnamnsbaserade timplanskopplingar. Fas 5:s beslutade mål använder beständigt klass-ID och exakt timplansversion; namn får inte bli integrationsnyckel.
- `web/lib/timplan-model.ts` och `web/lib/lasar-model.ts`: undervisningstimmar, årskolumner, kalender, perioder och beräkning av schematid. En återkommande normalvecka och faktiskt undervisningsutfall behöver hållas isär.
- `web/lib/access-rules.ts` och `web/lib/server/db.ts`: tidsbundna uppdrag, skol-/kundkontext och skyddade transaktioner. Ingen särskild schemaläggarfunktion finns i den lästa funktionsunionen.
- `docs/programplansgrund-kontrakt.md`: exakt versionsbundet katalogunderlag och stängda programplansutkast i 05-07–05-08. Ett löst kataloguppslag är inte ett fastställandebeslut och öppnar inga nya rättigheter.

## Gemensam informationsgrund

Detta är avsedda ansvarsgränser att precisera i kontraktssteget, inte redan implementerade datamodeller.

| Område | Eget ansvar | Vad schemamodulen behöver |
| --- | --- | --- |
| Utbildning och programplan | Utbildning/kull, ämnen, kurser/nivåer, innehåll, poäng, katalogreferenser och beslutade versioner. | Exakta innehålls- och versionsreferenser; inte en automatisk omräkning från poäng till minuter. |
| Timplan | Beslutad undervisningstid och fördelning på relevant år/period/innehåll. | Undervisningsbehov med enhet, period, källa och exakt version. Fastställda timmar ändras genom rätt planflöde. |
| Individuell studieplan | Elevens valda utbildningsinnehåll, giltighet, avvikelser och egna versioner. | Vilka aktiviteter eleven behöver delta i under perioden, för att upptäcka individkonflikter även över klassgränser. |
| Tjänstefördelning och undervisningsgrupper | Läraruppdrag, undervisningsrelationer, daterat medlemskap och kapacitet. | Aktuella resurs-ID:n och begränsningar. En lärartilldelning är inte ensam bevis för rätt att ändra schemat. |
| Läsår och kalender | Perioder, lov, studiedagar och gruppspecifika avvikelser. | Faktiska datum och tillfällen, tidszon och undantag utöver normalveckan. |
| Schemaläggning | Placeringar, resursbokningar, fixeringar, förslag, godkända/publicerade versioner och avvikelser. | Underlag från ovanstående ägare; återrapportering av planerade, inställda och faktiskt genomförda minuter som skilda uppgifter. |

Alla korskopplingar ska använda stabila ID:n, kund/skolenhet, giltighetsperiod och versions-/revisionsreferenser. Definiera en gemensam aktivitet för undervisningsbehov och ett separat konkret schematillfälle. Lokala aktivitets-ID:n och nationella kurs-/nivåkoder är olika identiteter. Byte av benämning får inte ändra relationen.

För varje utbytt fält ska kontraktet ange originalkälla, tillåten skrivare, enhet, giltighet, ändrings-/borttagsregel och konflikthantering. Beräknat schemaunderlag är en härledning; det får inte bli en konkurrerande huvudkälla för studieplan eller timplan.

## Roller och regler från början

Behörigheter delas upp per operation: läsa underlag, ändra regler, lämna egna önskemål, skapa utkast, köra/avbryta beräkning, redigera placeringar, granska, godkänna, publicera, exportera och administrera anslutningar. Åtkomst begränsas av aktuellt uppdrag, skolenhet, relevant relation och giltighet. Kontrollen gäller API, databas, bakgrundsjobb och resultatvyer.

Följande är ett förslag att precisera inför implementation:

| Funktion | Avsett mandat att utreda |
| --- | --- |
| Huvudman | Gemensamma ramar och befintliga planbeslut inom eget mandat. Ska inte automatiskt vara den som sköter varje schemaoperation. |
| Rektor | Ansvar för skolenhetens planering och uttrycklig tilldelning av schemaläggningsuppdrag. Granskning/publicering och eventuell delegation måste beskrivas separat från timplansbeslut. |
| Schemaläggare | Avgränsat uppdrag för valda skolenheter/perioder: arbeta med underlag, köra beräkning och ändra utkast. Rollen ger inte automatisk rätt att ändra elevens studieplan eller fastställd timplan. |
| Lärare | Egna tillgängligheter/önskemål och läsning inom uppdraget; utökad redigering kräver uttryckligt separat mandat. |
| Planadministratör | Behöriga ändringar i den planmodul personen förvaltar. En sådan ändring får skapa en schemaavvikelse, men inte tyst publicera ett nytt schema. |
| Integration/beräkning/AI | Tekniskt avgränsad åtkomst till avsett underlag och resultat. Ingen allmän elevinsyn eller självutdelning av verksamhetsmandat. |

Dokumentera vem som tillsätter och återkallar varje uppdrag och om granskare/godkännare ska vara skilda. Exakta nya funktioner och delegationsregler är öppna; befintliga HM-/rektors-/lärarmandat och fastställandeflöden ändras inte automatiskt. Ett återkallat mandat ska även stoppa senare hämtning eller publicering av resultat från redan startade jobb.

Regler ska ha ID, ursprung, version, giltighet, omfattning, ansvarig och typ: obligatorisk begränsning eller prioriterat önskemål. Prioritet/vikt är uttrycklig. Juridiska regler, lokala beslut, resursfakta och personliga önskemål ska kunna skiljas åt. En beräkningsmotor eller AI får inte tyst försvaga obligatoriska regler. Saknat eller motstridigt underlag ska ge en begriplig avvikelse.

## Delar som ska gå att kombinera

Utforma separata kontrakt för planunderlag, regelvalidering, beräkning, AI-bedömning, schemaredigering, granskning/publicering samt import/export och uppföljning. Exempel på avsedda kombinationer:

- Våra program-/tim-/studieplaner och vår redigeringsvy med en extern beräkningsmotor.
- Vår Rusttjänst med en vald optimeringsmotor och Jev som utbytbar bedömare.
- En extern schemastruktur som importeras för lokal validering och uppföljning utan att dess plan- eller elevregister används.
- Vår regelkontroll och publicering med AI-stödet avstängt eller ersatt.

Varje adapter måste beskriva vilka förmågor, regler, datatyper och riktningar den stöder. Det går inte att anta att ett SS12000-API omfattar beräkning eller alla interna regler. En delvis stödjande modul får inte tyst tappa individkonflikter, låsningar, planversioner eller undervisningsminuter. Otillräckligt stöd ska rapporteras före körning eller import. Delar får användas tillsammans bara när deras faktiska kontrakt är kompatibla.

Urval ska också kunna göras inom en modul, exempelvis valda utbildningar, ämnen/nivåer, grupper eller perioder. Kontraktet måste redovisa urvalets omfattning och vilka beroenden eller undervisningsbehov som ligger utanför det. Ett delschema får inte redovisas som en fullständigt kontrollerad elevplan. Samplanering över flera skolenheter behöver uttryckliga mandat för hela berörda urvalet och gemensamma resurser; en adapter eller AI får inte vidga urvalet på egen hand.

## Moduler som kunden kan köpa separat

Användarbeslut 2026-10-01. Kunden ska kunna välja exempelvis schemaläggning, programplanering, timplanering eller individuella studieplaner och kombinera vårt erbjudande med sina befintliga system. Den slutliga säljbara modulkatalogen, tillvalen och prisformen behöver definieras; ovanstående är avsedda köpscenarier att prova, inte färdiga produkter eller beslutade priser. En intern teknisk komponent är inte automatiskt en separat försäljningsprodukt.

Gemensam identitet, kundgräns, mandat och loggning ska kunna återanvändas av alla moduler utan att kunden måste köpa hela verksamhetssviten. Varje modul ska ange sitt minsta underlag och vilka beroenden som kan uppfyllas via vår egen modul, ett externt system eller en uttrycklig import. Exempel: en kund som bara köper schemaläggning ska kunna tillföra undervisningsbehov, lärare, grupper och kalender genom ett godkänt kontrakt utan att behöva köpa våra studieplans- och timplansvyer. Om underlaget inte räcker ska bristen förklaras före aktivering/körning. Importen måste fortfarande bevara nödvändiga versioner, regler och datakvalitet.

Kundens avtalsbundna modultillgång hålls skild från personens uppdrag. För en verksamhetsoperation behöver både rätt modul/funktion vara aktiv för kunden och användaren ha ett giltigt mandat för operationen och urvalet. Ett köp ger ingen användare automatiskt breda rättigheter; ett rektors- eller kundadministratörsuppdrag ger inte automatiskt tillgång till en modul som saknar avtalad aktivering. Kontrollera detta på servern, i datavägar och i bakgrundsjobb, inklusive resultat som skapats före avaktivering. Att dölja navigation räcker inte.

Definiera kundbunden modulidentitet, funktioner/tillval, avtalsreferens, giltighet, status och revision samt vem som får ändra tillgången och hur ändringen loggas. Modultillgång kan till en början administreras genom en uttrycklig avtalsprocess; betalningsleverantör, självbetjänad beställning, avgiftsmodell och automatiserad fakturering är öppna val. Ingen allmän leverantörs- eller elevåtkomst följer av detta produktbeslut.

Aktivering ska kontrollera beroenden och anslutningar. Tillägg av en modul ska återanvända kundens stabila identiteter och historik. Avslut/avaktivering ska stoppa berörda nya operationer och jobb och visa konsekvenser för kvarvarande moduler. Planera övergång till extern källa eller avtalad läs-/exportväg när en kvarvarande modul behöver data från en avslutad modul. Ingen automatisk radering av planer eller elevuppgifter följer av avslutet; fortsatt åtkomst och bevarande/avveckling kräver egna definierade regler och rättigheter. AI-tillvalets bortfall ska kunna ge den tidigare beskrivna vanliga beräkningsvägen om kontraktet medger det.

Krav MODUL-01–04 finns i `../REQUIREMENTS.md`. De är gemensamma produktkrav med första kontraktsarbete i S1 och integrationsprov i S4; de är inte nya v1-krav eller implementerade betalnings-/licensfunktioner.

| Krav | Steg | Verifieringsmål, ännu inte provat |
| --- | --- | --- |
| MODUL-01: köpbara moduler | S1 och S4 | Kund A använder bara schema med externt planunderlag, kund B kombinerar våra planmoduler och schema. Båda kan lägga till en modul utan byte av kund eller dubbletter. |
| MODUL-02: modultillgång och personmandat | S1, genomdrivs i S3/S4 | Aktivt uppdrag med inaktiv modul nekas på direkt anrop; aktiv modul med saknat uppdrag nekas. Annan kunds modulaktivering ger ingen tillgång. Avaktivering under ett jobb stoppar senare användning som kräver aktiv modul. |
| MODUL-03: öppna beroenden | S1 och S4 | Schemat accepterar kontraktsriktigt externt underlag utan köpt egen planmodul och redovisar saknat stöd. Bara verkligt nödvändiga funktionella beroenden krävs. |
| MODUL-04: tillägg och avslut | S4 | Modultillägg bevarar ID:n och historik. Avslut stoppar avtalade funktioner, ger begriplig konsekvens för beroenden och hanterar beslutad dataåtkomst/export utan oavsiktlig radering. |

## Rust och AI i schemamodulen

Rustspåret ska omfatta en avgränsad körbar beräkningstjänst eller komponent med ett versionsbundet indata-/utdatakontrakt. Pröva jobbstatus, avbrott, tids-/resursgränser, återförsök och isolering mellan kunder. Körmiljö, native kontra Wasm, motorkoppling och slutlig driftplats avgörs efter verifierad prototyp. Nuvarande API och Postgres-regler kan bevaras och kopplas stegvis.

AI-gränssnittet ska kunna fråga Jev eller motsvarande modell om avgränsade val: vilken konflikt som bör behandlas först, vilken av motorns tillåtna åtgärder som bör prövas och hur giltiga schemaförslag bedöms mot verksamhetens uttryckliga mål. Tillåt även svaret osäkert/inget lämpligt alternativ. En separat kodbaserad kontroll prövar obligatoriska regler efter varje föreslagen ändring. Förklaringar måste gå att härleda till givna regler och konsekvenser.

Spara modellversion, bedömningskriterier, nödvändiga indatareferenser, utfall och osäkerhet för reproducerbar utvärdering utan att kopiera känsliga uppgifter till vanliga loggar. Skicka minsta nödvändiga resurs-/konsekvensunderlag; ett faktiskt externt dataflöde kräver eget drift- och informationshanteringsunderlag. Modellfel, låg säkerhet eller tjänstebortfall ska ge vanlig sökprioritering eller manuell granskning. Hög confidence ger inte skrivmandat eller bevis för ett regelriktigt schema.

Jevs strukturerade val och confidence beskrivs i [TypeSafes Choice-dokumentation](https://docs.typesafe.ai/primitives/choice) och [confidence-dokumentation](https://docs.typesafe.ai/confidence). Användningen inne i schemaberäkningen är vår hypotes att prova; ingen förbättring i skolmiljö är verifierad. Jämför samma motor utan AI, med Jev och med minst ett relevant alternativ utifrån kvalitet, ändringsmängd, total tid, kostnad och felbeteende.

## Hur modulerna hålls samstämmiga

1. Skapa ett oföränderligt beräkningsunderlag med exakta plan-, kalender-, medlemskaps-, resurs- och regelrevisioner.
2. En ändring i en källmodul ger en versionsbunden förändring och en synlig konsekvens/avvikelse i berörda schemautkast. Upprepade leveranser får inte skapa dubbletter; ordning, borttag och återförsök måste kunna stämmas av.
3. En ny fastställd plan får inte automatiskt flytta äldre klasskopplingar, elevplaner eller publicerade scheman. Behörig personal väljer när en ny version ska tillämpas och får se konsekvenserna.
4. Resultat från ett äldre underlag markeras inaktuellt. Kontrollera revisioner och levande mandat igen vid granskning/publicering; en gammal körning får inte skriva över en nyare ändring.
5. Redovisning skiljer undervisningsbehov, schemalagd tid, inställd tid och genomförd tid. En återrapportering får inte tyst ändra ett tidigare planbeslut.

## Krav, planeringssteg och verifieringsmål

SCHEMA-01–08 registreras som senare produktkrav i `../REQUIREMENTS.md`. Tabellen nedan ger dem ansvar inom delprojektet. Stegen är planeringsordning, inte tillagda eller genomförda faser i pilotens åttafasfärdplan.

| Krav | Steg | Verifieringsmål, ännu inte provat |
| --- | --- | --- |
| SCHEMA-01: gemensamma planreferenser | S1: kontrakt och mandat | En elevs valda nivå kan följas via grupp och timplansversion till schema; ändrat klassnamn eller ny katalogversion bryter inte kopplingen. |
| SCHEMA-02: operationsbundna mandat | S1, genomdrivs i S3 | Tilldelad schemaläggare kan arbeta inom sitt uppdrag; annan skola, saknad publiceringsrätt och återkallat mandat nekas även på direkta anrop och gamla jobb. |
| SCHEMA-03: uttryckliga regler | S1, prövas i S2 | Obligatoriska regler består efter automatisk och manuell ändring; olöslighet, timeout och bristande indata skiljs åt. |
| SCHEMA-04: Rustprototyp | S2: avskilda beräknings- och AI-prov | Körbar Rustkomponent behandlar versionsbunden syntetisk indata, avbryts kontrollerat och lämnar verifierbart resultat utan generellt skrivmandat. |
| SCHEMA-05: AI i schemaarbetet | S2 | Samma motor jämförs med/utan Jev och med annat relevant AI-alternativ; kvalitet och total kostnad/tid mäts, obligatoriska regelbrott accepteras aldrig. |
| SCHEMA-06: valbara moduldelar | S1, prövas i S4 | Minst två komponentkombinationer använder samma kontrakt; saknat stöd upptäcks och motor/AI kan bytas utan att planmodulerna byts. |
| SCHEMA-07: avstämd synk | S3: plan till grupp till schema | Ändrad studieplan, timplan och kalender ger spårbar avvikelse; dubbelleverans, fel ordning och samtidiga ändringar tappar inga giltiga kopplingar. |
| SCHEMA-08: granskning och uppföljning | S3 och S4: arbetsflöde och extern adapter | Förslag kan jämföras, låsas och publiceras med korrekt mandat och revision; minuter stäms av mot faktiskt kalenderutfall och mottagaren får rätt version. |

S1 ska resultera i ett konkret informations-/modulkontrakt, operation-/mandatmatris, regelmodell, modulkatalog med köpbara gränser/beroenden och syntetiska acceptansfall. S2 är en avskild Rust-/motor-/AI-prototyp utan skyddade verksamhetsskrivningar. S3 kopplar befintliga planflöden till grupper och schema med granskning, audit och dator-/telefonprov. S4 provar komponentbyte, vald extern adapter, kundens köpta modulurval, aktivering/avslut och uppföljning. Varje steg får egna GSD-genomförandeplaner och verifieringsresultat innan det markeras klart.

## Vad som behöver beaktas redan i fas 5

Innan berörda återstående planflöden byggs ska planen redovisa hur stabila ID:n, exakta planversioner, kurs-/nivåreferenser, undervisningstidens enheter, giltighet och klasskopplingar kan användas i delprojektet. Visa ägare för ändringar och vilka konsekvenser en ny version ger. Registrera luckor för S1 i stället för att införa en konkurrerande planmodell eller breda schemagrants som genväg.

Fas 5 behåller ADMIN-01–04 och befintliga fastställanderegler. Kontrollen ovan är en planerings- och bevarandegräns; den innebär inte att schemamotor, studieplansmodul eller nya roller ska byggas in i nästa programplans-API-plan. Hela schemaarbetets genomförandeplacering och detaljerade mandat avgörs vid S1.

## Underlag och nästa arbete

- [Produktresearch och Royal-provfall](SCHEMALAGGNING-2026-10-01.md).
- [GSD-punkt](../todos/pending/2026-10-01-utvardera-automatisk-schemalaggning.md).
- `../../docs/programplansgrund-kontrakt.md` och `../../docs/produktunderlag/12-informationsmodell-och-designkontrakt.md` som källor med sina uttryckliga statusgränser.
- Första nästa projektsteg är S1: ta fram gemensamma kontrakt, behörighetsoperationer och testunderlag. Royal-provningen kan ge information till motor-/adapterval, men får inte ensam bestämma vår informationsmodell eller interna behörigheter.

Öppna val: exakt delegation/publiceringsansvar, första sammanhängande skolformsfall, driftgräns för Rust, motor, AI-alternativ, externa komponenters kontrakt/licenser, slutlig säljbar modulkatalog/tillval, pris-/beställningsform, modulaktiveringsansvar och när S1–S4 genomförs i förhållande till piloten. Användarens projektinriktning och beslut om separat köp av moduler ovan behöver inte återgodkännas.
