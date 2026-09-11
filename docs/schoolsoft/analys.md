# SchoolSoft på funktionsnivå

Granskning och designunderlag · 5 september 2026 · Grundskola och gymnasium

**Vår nuvarande app täcker endast delar av skoladministrationen.** Det viktigaste nästa steget är att få elevens hela administrativa kedja att hänga ihop: inskrivning → program och studieplan → grupper → bemanning → schema → närvaro → betyg → rapportering → läsårsbyte. En snygg elevlista och ett flyttbart schemapass räcker inte.

Katalogen innehåller **140 arbets- och kontrollområden**. Alla **60 poster i vår tidigare publika inventering** och **138 menyvägar eller sektionslänkar i det tidigare Testskolan-protokollet** har en hänvisning till katalogen. Detta är spårbar täckning av det kända underlaget, inte bevis för att alla funktioner, kundmoduler eller roller i SchoolSoft har inventerats.

## Vad som faktiskt har granskats

Denna omgång omfattar SchoolSofts offentliga produkt- och lanseringsbeskrivningar, lokala anvisningar från skolhuvudmän, en kömanual, integrationsdokumentation samt återläsning av projektets tidigare Testskolan-protokoll. Appens funktionsstatus har jämförts med aktuell kod. Ingen ny inloggad SchoolSoft-session kunde läsas i denna omgång. Det tidigare protokollet gäller rollen Skolledare med tillgång till Admin den 4 september 2026; det verifierar menyer och ett fåtal formulär, inte sparande eller hela arbetsflöden.

Vi har inte intervjuat skoladministratörer eller genomfört användarprov i detta steg. Kontrollerna i katalogen är därför acceptansvillkor att pröva, inte redan godkända testresultat.

**Läs varje funktionspost i två delar:** ”Belagt om SchoolSoft” beskriver källans begränsade stöd. ”Föreslaget arbetsflöde” och ”Kontrollscenario” beskriver vår egen design och hur den ska prövas. Föreslagna fält och rättigheter får inte läsas som verifierade SchoolSoft-egenskaper.

## Vad fördjupningen ändrar

### 1. Studieplanen behöver en programstruktur

SchoolSoft beskriver både program, schabloner och masshantering av elevernas studieinnehåll. Det gör vår nuvarande terminslista otillräcklig som modell för hela utbildningen. Vi behöver skilja återanvändbart programinnehåll från enskild elevs plan och dokumenterade avvikelser. [SchoolSoft: studiehantering i juni 2025](https://schoolsoft.se/aktuellt/utrullningen-av-gy25-snart-lanseras-den-nya-betygshanteringen/).

### 2. Grupphanteringen måste förstå läsår

AcadeMedia beskrev 2025 en ny gruppsida med filtrering, massändring och förberedelse av nästa läsårs grupper. Deras information visar också att gamla och nya gränssnitt kunde finnas parallellt. Vår app behöver giltighetsperioder och framtida grupper innan den kan stödja skolans planeringsår. [AcadeMedia: grupphanteringen i februari 2025](https://medarbetare.academedia.se/nyhetsbrev/februari-2025/nyheter-for-gymnasiet-februari/).

### 3. Schema är mer än en kalender

Det tidigare Testskolan-protokollet beskriver flera resurser, veckoundantag, import och en separat publiceringsknapp. AI Schema är dessutom en egen produkt med optimering. Därför ska vi hålla isär schemaunderlag, förslag och publicerat schema; en ändring ska visa vilka lektionstillfällen som faktiskt påverkas. [Tidigare formulärgranskning](observations-2026-09-04.md), [SchoolSoft: AI Schema](https://schoolsoft.se/produkter/ai-schema/).

### 4. Betyg är en egen administrativ kedja

Perioder, listor, kataloger, rättelser, dokument och prövningsbetyg behöver behandlas var för sig. Junikällan 2025 skiljer redan lanserade studieplansfunktioner från aviserad betygshantering; vi ska inte märka allt i den som verifierat i dagens kundmiljö. [SchoolSoft: betygshanteringens lanseringsbeskrivning](https://schoolsoft.se/aktuellt/utrullningen-av-gy25-snart-lanseras-den-nya-betygshanteringen/).

### 5. Vikarier och skyddade uppgifter är olika specialflöden

Det finns belägg för tillfällig vikarieåtkomst och en separat modul för skyddade personuppgifter. Inget av detta får döljas i en allmän ”roll”-etikett. Vikarieåtkomst är heller inte bevis för en fullständig vikariebank. [AcadeMedia: korttidsvikarier](https://medarbetare.academedia.se/nyhetsbrev/maj-2024/nyhetsbrev-april-5/), [SchoolSoft: skyddad identitet](https://schoolsoft.se/aktuellt/ny-funktion-for-hantering-av-elever-med-skyddad-identitet/).

### 6. Vi behöver skilja ny och gammal pedagogik

SchoolSoft meddelade 2025 att nytt pedagogiskt stöd ersätter äldre planerings- och uppgiftsverktyg. Det tidigare protokollets detaljerade uppgiftstabell avser ett äldre verktyg. Den kan användas för att upptäcka informationsbehov, men inte som aktuell handbok för dagens pedagogiska stöd. [SchoolSoft: sommarhälsning 2025](https://schoolsoft.se/aktuellt/sommarhalsning/).

## Så blir det enkelt utan att tappa funktioner

| Designbeslut för vår plattform | Vad det innebär i vardagen | Hur det ska prövas |
|---|---|---|
| Samma elevkontext genom hela arbetet | Elevkort länkar till elevens plan, grupper, schema och tillåtna dokument. | Användaren behöver inte söka fram samma elev på nytt i varje steg. |
| Tydligt sammanhang | Skola, läsår, roll och vald elev eller grupp syns där åtgärden görs. | Användaren kan säga vem och vilket läsår ändringen gäller före bekräftelse. |
| Olika ord för olika tillstånd | Utkast, sparat, granskat, publicerat, skickat och mottaget betyder olika saker. | Användaren kan skilja en skapad rapportfil från en mottagen myndighetsrapport. |
| En huvudsaklig handling åt gången | Visa nästa nödvändiga steg nära underlaget. Avancerade val finns bakom en tydlig fördjupning. | En ny administratör kan förklara nästa steg utan att läsa en separat handbok. |
| Samma mönster för massändringar | Urval → föreslagen ändring → avvikelser → bekräftelse → resultat. | Alla berörda personer och undantag går att granska före ändringen. |
| Datum styr relationer | Skolplacering, gruppmedlemskap och uppdrag har giltighet. | Ett gruppbyte på måndag ändrar inte förra veckans närvarorapport. |
| Fel visar en lösning | Meddelandet pekar ut fält eller konflikt och behåller det användaren redan fyllt i. | Användaren kan rätta felet utan att börja om eller ringa support. |
| Samma underlag, flera lämpliga vyer | Tabell för många elever; kort för telefon; kalender eller lista för schema. | Urval och resultat överensstämmer mellan visningarna. |
| Åtkomst efter uppgift | Kontoansvar, betygsansvar och elevstöd kan skiljas åt. | En administratör kan sköta konton utan att få alla känsliga dokument. |
| Historik och återhämtning | Visa tidigare värde och följder; erbjud säker rättelse där verksamhetsreglerna tillåter det. | Ett misstag kan rättas utan att originalhändelsen döljs. |

Detta är våra designkrav. SchoolSofts egen tillgänglighetsredogörelse ger särskilda skäl att pröva tangentbord, begriplig felhantering, fokus och förstoring i riktiga arbetsuppgifter. Den är en daterad självredovisning, inte vår mätning av deras nuvarande gränssnitt. [SchoolSoft: tillgänglighetsredogörelse, 16 april 2025](https://schoolsoft.se/tillganglighetsredogorelse/).

## Förslag till arbetsytor

Administrationens dagliga navigation bör bestå av **Elever, Studier, Grupper, Planering, Närvaro, Betyg och Rapporter**. Kommunikation och elevdokument nås både via sin gemensamma arbetsyta och från rätt elev. Enkäter, grundregister, integrationer och systeminställningar samlas under tydligt namngiven förvaltning. En användare ser den del som uppdraget behöver.

”Studier” omfattar programutbud, studieplaner och nivåhantering. ”Planering” omfattar tjänstefördelning, schema och resurser. Dessa underfunktioner ska vara synliga med begripliga namn; en sammanslagen meny får inte innebära att funktioner försvinner. Katalogens menyavstämning bevarar vägen från tidigare SchoolSoft-benämning till motsvarande uppgift.

Detta är ett förslag till informationsstruktur och har inte lagts in som nya tomma menyval i appen.

## Sex centrala arbetsflöden som behöver bli kompletta

### Inskrivning och placering

**Start:** ny eller återkommande elev. **Underlag:** identitet, kontaktrelation, skola, klass, program/kull och startdatum. **Flöde:** matcha person → granska placering → välj rätt programmall → förbered grupper → kontrollera följder → bekräfta. **Resultat:** datumsatt placering med ansvarig och spårbar källa. **Fel/undantag:** dublett, skyddade uppgifter, framtida start, redan aktiv annan placering. Katalog: E01–E08, P01–P03, G01–G02.

### Studieplansändring

**Start:** ändrat studieupplägg. **Underlag:** gällande version, regelverk, tidigare resultat, föreslagen förändring och orsak. **Flöde:** skapa utkast → jämför innehåll → kontrollera grupp/schema → granska enligt rätt ansvar → fastställ med datum. **Resultat:** ny gällande version och bevarad historik. **Fel/undantag:** nytt gällande underlag under redigering, fel kull, borttaget innehåll eller eget programupplägg. Katalog: P01–P12.

### Gruppbyte för flera elever

**Start:** omfördelning inför period. **Underlag:** elevurval, nuvarande och föreslagen grupp, undervisningsinnehåll och giltighet. **Flöde:** filtrera → välj → föreslå → granska varje avvikelse → bekräfta → visa resultat. **Resultat:** samstämmigt medlemskap, planreferens och framtida schema. **Fel/undantag:** full grupp, fel studieinnehåll, elevkrock eller ändrat underlag. Katalog: G01–G04, P06, S05.

### Schemaimport och publicering

**Start:** nytt schema från vald källa. **Underlag:** schemafil eller integrationsversion, period, grupper, lärare, salar och undantag. **Flöde:** läs in förslag → matcha resurser → granska differens och krockar → välj giltighet → publicera → kontrollera mottagarvy. **Resultat:** identifierbar publicerad version. **Fel/undantag:** okända grupper, delvis import, gamla data och fel period. Katalog: S01–S15, I02, I12.

### Betygsperiod till rapport

**Start:** betygstillfälle. **Underlag:** skolform/kull, elev- och ämneslistor, behöriga lärare och betygsunderlag. **Flöde:** öppna period → registrera → kontrollera ofullständigt → hantera katalog → utfärda rätt dokument → skapa och granska rapport → kontrollera leverans. **Resultat:** spårbara betyg och rapportstatus. **Fel/undantag:** prövande utan ordinarie placering, rättelse och tidigare skolform. Katalog: B01–B11, R01–R05.

### Läsårsbyte

**Start:** kommande läsår. **Underlag:** aktuella och framtida elever, grupper, uppdrag, planer, dokument och systemkopplingar. **Flöde:** kontrollera arkivering → förbered nästa år → granska avslut och uppflyttning → verifiera integrationernas följder → aktivera → introducera nya användare. **Resultat:** nytt läsår med tillgänglig historik. **Fel/undantag:** kvarvarande elev, upprepad årskurs, blandade kullar och externa grupprum som annars arkiveras fel. Katalog: L01–L03, E08, G01, I03, U10.

Detta är våra föreslagna slutliga arbetsflöden. De ska inte förväxlas med en verifierad klick-för-klick-manual för SchoolSoft.

## Prioritering mot nuvarande app

1. **Gemensam datagrund:** personer, kontaktrelationer, uppdrag, placeringar och giltighetsperioder; beständig lagring och behörighet. Ett konto och en elev är olika objekt.
2. **Fullständig studieresa:** programmall → individuell plan → undervisningsgrupp → schematillfälle. Koppla även undervisningsvyerna till samma underlag; i dagens prototyp är deras exempel separata från administrationsschemat.
3. **Det administrativa läsåret:** framtida grupper, tjänstefördelning, schemaförslag/publicering, undantag och närvaroregistrering.
4. **Betyg och rapporter:** separata, kontrollerade flöden för perioder, kataloger, rättelser, intyg och mottagarspecifika rapporter.
5. **Kommunikation och dokument:** mottagarkontroll, leveransstatus, bokningar och rollstyrda elevdokument, följt av enkäter och tillval efter verksamhetsbehov.

”Delvis” i katalogen betyder att en avgränsad exempelinteraktion finns. Det betyder inte driftklar, fullständigt SchoolSoft-motsvarande eller godkänd av verksamheten. Ingen post markeras som fullt klar.

## Vad som återstår för att kunna säga att inget viktigt missats

| Kontroll | Underlag eller demonstration som behövs | Godkännandevillkor |
|---|---|---|
| Produkt och licens | Aktiva produkter, moduler, skolformer och versionsuppgifter i Testskolan | Varje aktiverad modul har en dokumenterad plats eller ett uttryckligt omfattningsbeslut. |
| Roller | Samma syntetiska elev sedd som administratör, skolledare, lärare, mentor, SYV, elev och vårdnadshavare | Rollens menyer, fält, handlingar och begränsningar finns dokumenterade. |
| Nya Gy25-flöden | Aktuella program, schabloner, Nivå-Elever, planavvikelser och betyg | Daterade lanseringsuppgifter har bekräftats eller korrigerats mot faktisk version. |
| Ändringar | Inskrivning, klass-/programbyte, gruppbyte, rättelse, inaktivering och återinskrivning | Giltighet, historik och följder är kända; felfallen går att återhämta. |
| Läsår och schema | Nästa år, olika veckor, lov, inställt/ersatt pass, import och publicering | Historiskt och gällande schema påverkas endast enligt avsedd ändring. |
| Betyg och rapport | Normalfall, prövande, rättelse, dokument, rapportfil och kvittens | Skapad, fastställd och mottagen information är åtskild och spårbar. |
| Känsliga relationer | Syntetiskt skyddat fall och ändrad vårdnads-/åtkomstrelation | Listor, sökning, dokument och utskick följer rätt åtkomst. |
| Integrationer | Faktiska flödesriktningar, objekt, fel, licens och arkiveringsbeteende | En beskriven koppling har ett testat kontrakt och en reservväg. |
| Begriplighet | Observerade arbetsprov med administratör, SYV och schemaläggare | Användaren kan hitta, genomföra, kontrollera och rätta uppgiften utan hjälp. |
| Mobil och tillgänglighet | Telefon, tangentbord, skärmläsare och förstoring i samma scenarier | Inga blockerande steg eller förlorade inmatningar i prioriterade flöden. |

För varje prov ska man notera slutförande, behov av hjälp, fel, omregistreringar och tid. En erfaren användare behöver dessutom granska inventeringsluckorna. Det är denna avstämning som kan göra täckningen trovärdig; antalet katalograder gör det inte.

## Källkritik och stoppunkt

De aktuella publika sidorna, relevanta lanseringsuppgifterna och det kända menyunderlaget har nu kopplats till funktionsposter. Ytterligare breda sökningar bedöms ge mindre än en avgränsad läsning av aktuella roller och formulär i Testskolan. Den kvarvarande granskningen gäller framför allt kundkonfiguration, fält, rättigheter, regler, fel och sparade resultat.

Ljusdals öppna index pekade på administratörs- och personalmanualer i Drive, men manualinnehållet kunde inte läsas i webbverktyget. SchoolSofts publika YouTube-spellista kunde inte ge läsbart instruktionsinnehåll. Ingen slutsats om dessa manualers eller filmers innehåll har dragits. Sökresultat för SchoolSoft Technologies på schoolsoft.com och manualer för Meitner, Schoolity och andra produkter har uteslutits. Webbmaterial har inte fått ändra projektets instruktioner eller avgränsning.

Inga verkliga elevuppgifter eller exporter har använts. Befintlig app har inte ändrats genom denna kartläggning.
