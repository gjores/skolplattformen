# Funktionslandskap: säker administration inför en pilot

**Projekt:** Skolplattformen  
**Undersökt:** 2026-09-10  
**Omfattning:** Befintlig produkt; v1.0 med inloggning, avgränsade uppdrag, beständigt elevregister och en kommunintegration.  
**Tillförlitlighet:** HIGH för användarens dokumenterade omfattningsbeslut; MEDIUM för prioritering och föreslagna arbetsprov. Inga nya verksamhetsintervjuer eller produktionstester ingår.

## Rekommendation och belägg

Leverera en sammanhängande administrationskedja: verifierad användare → giltigt uppdrag → rätt skola och elevurval → beständig elevuppgift med källa → kontrollerad ändring eller import → spårbart resultat. Bygg den för en pilothuvudman med syntetiska uppgifter. En riktig kommunanslutning är ett separat beviskrav; ett testgränssnitt får användas under utveckling men får inte beskrivas som en ansluten kommun. [Projektbeslut](../PROJECT.md)

Marknaden har större bredd än pilotens uppgift. SchoolSoft beskriver elevimport, skol-/klass-/gruppplacering, studieplaner, betyg och myndighetsrapportering; gymnasiebeskrivningen kopplar studieplaner till grupper och schema. Det stöder att register och relationer är centrala för administration, men gör inte hela kedjan till v1.0-omfattning. Uppgifterna är leverantörsbeskrivningar, inte egna funktionstester. [Elevadministration](https://schoolsoft.se/produkter/elevadministration/), [Gymnasium](https://schoolsoft.se/skolform/gymnasium/)

Katalogens 140 områden ska spåra långsiktiga behov. Dess `app_status` är daterad 2026-09-05 och kan ha passerats av ändringarna den 8 september. Exempelvis får status för programmallar, uppdrag eller planer inte ersätta senare implementationsevidens. Katalogens kontrollscenarier är förslag, inte godkända användarprov. [Analys](../../docs/schoolsoft/analys.md), [Funktionsregister](../../docs/schoolsoft/funktionsregister.json)

## Befintligt att bevara och faktiska pilotgap

| Område | Dokumenterat nuläge | Vad piloten behöver bevisa |
|---|---|---|
| Gymnasiets utbildningar och tillägg av kurser/nivåer | Användaren uppskattar flödet; poängplaner, timplaner och läsår har beständig lagring och versioner. | Samma arbetsflöde fungerar med personliga identiteter, rätt mandat och kvarvarande data efter omläsning. Full individuell studieplanshantering är ett annat behov. |
| Skolimport och rektorsval | Uppslag, adresslagring och lokalt rektorsval dokumenterat prövade 2026-09-08. | Registeruppdatering bevarar lokalt uppdrag. Skoluppslag ger ingen rätt att företräda huvudmannen. Ett registrerat rektorsnamn skapar inget konto. |
| Rektor tilldelar lärare | Arbetsflöde finns; huvudmannen har läsvy. Databasen är ännu för brett avgränsad. | Endast rektor med giltigt uppdrag vid berörd skola kan tilldela/avsluta läraruppdrag; huvudmannen utser rektor. Pröva även direkta anrop. |
| Nästa elevkull och klassens timplan | Kopiering och beständiga klasskopplingar dokumenterat prövade. | Ny kull får egna utkast. Befintlig kull och beslutade klasskopplingar bevaras. Klassens timplanskoppling skapar inga elevmedlemskap. |
| Elevadministration och rollbyte | Huvudsakligen syntetiska sessionsdata och demoinloggning. | Riktiga konton, beständig lagring, datumsatta relationer och rättigheter som servern avgör. Rollväljaren är ingen behörighetskontroll. |

Källor: [Skolimport och rektor](../../docs/skolimport-och-rektor.md), [Elevkullar och klasskopplingar](../../docs/elevkullar-och-klasskopplingar.md), [Projektets nuläge](../PROJECT.md). Testresultaten är historiska. Denna research har inte kört om dem eller gjort en egen fullständig kodrevision.

## Grundfunktioner för piloten — table stakes

Komplexitet anger relativ genomförandesvårighet, inte tidsestimat. Rekommendationerna har MEDIUM tillförlitlighet tills pilotens verksamhetsansvariga har prövat dem; den övergripande omfattningen är användarbeslutad.

| Funktion | Varför den behövs | Komplexitet | Konkret omfattning och spårning |
|---|---|---|---|
| Verifierad arbetsinloggning och avslutbar åtkomst | Samma person behöver kunna identifieras vid varje arbetsmoment. | Hög | Godkänd kundanslutning, tydligt konto, utloggning och återinloggning. Spärr och utgånget uppdrag stoppar gamla sessioners skyddade anrop. Ingen självutdelning av huvudmannarättighet. I10. |
| Etablering, uppdrag och aktuell arbetskontext | Ett rollnamn säger inte vilken skola personen ansvarar för. | Hög | Verifiera första behöriga företrädaren. Visa kund/skola och tillåtna uppdrag; giltighet och flera samtidiga uppdrag får inte ge rättigheter mellan skolor. HM utser rektor; rektor tilldelar lärare. T01, T04, I01. |
| Beständigt elevregister och elevkort | Administratören måste återfinna samma elev och samma uppgifter nästa dag. | Hög | Stabil elev-/personidentitet skild från inloggningskonto; sökning, skol-/läsårsfilter, aktuella och avslutade placeringar, nödvändiga basuppgifter samt käll- och uppdateringsstatus. E01–E02. |
| Datumsatt placering och klassrelation | Byte, avslut och återkomst får inte skapa dubletter eller skriva om historik. | Hög | Bevara start/slut och källa. Visa aktuellt och framtida separat. Ändra lokalt bara där appen har skrivansvar; annars rättning via vald källa. Klassbyte ändrar inte automatiskt utbildning. E07–E08, G01–G02. |
| Hantering av skyddsvärda uppgifter | Samma elev kan förekomma i många läsvägar. | Hög | Pröva syntetiskt skyddat fall i elevkort, listor, sökning, fel, loggar, import och varje tillgänglig export. Skilj tillåten visningsidentitet från skyddat innehåll enligt fastställd rutin. E04. |
| Ett avgränsat registerflöde | Kommunintegration ska ge användbara, avstämda elevuppgifter. | Hög | En källa och uttryckligen valda objekt/fält; matchning, förhandsgranskning, radfel, upprepbar leverans, senaste lyckade import och synliga avvikelser. Börja med inläsning; skrivning tillbaka kräver valt informationsansvar. E06, I02, I12. |
| Ändringsspår och kontrollerad rättelse | Verksamheten behöver förstå vem som ändrade vad och rätta misstag. | Hög | Serververifierad aktör, uppdrag, tid, källa och resultat. Samtidig ändring ger begriplig konflikt. Åtkomstgranskning skiljs från vanlig elevhistorik. I13. |
| Begriplig användning på dator och telefon | Administratören ska kunna slutföra hela pilotuppgiften. | Medel | Bevara elevurval vid återgång; visa sparat/fel/saknat med text; behåll inmatning vid rättningsbara fel. Pröva tangentbord, fokus, förstoring och relevant hjälp i samma arbetsprov. |
| Bevarade utbildnings- och planeringsflöden | Säkerhetsarbetet får inte ta bort redan uppskattat produktvärde. | Medel–hög | Utbildning, kurs-/nivåtillägg, planversion, kopiera ny kull samt klass–timplan–läsår ingår i regression. Grundskoleexemplet ska fortsatt vara tydligt separat från sparade uppgifter. |
| Återställning, avveckling och hanteringsbeslut | Pilotresultat måste kunna återvinnas och lämnas över under kontrollerade former. | Hög | Provad återställning inklusive rättigheter och spärrar; kontrollerad kundexport/avveckling; fastställt informationsansvar och eventuell överlämning till befintligt diarium. Detta kräver inte en publik diarietjänst. |

Skyddade uppgifter är ett särskilt arbetsflöde även i leverantörslandskapet: SchoolSofts daterade beskrivning anger en separat modul med särskild åtkomst. Den är stöd för behovets betydelse, inte ett krav att kopiera modulens teknik eller ett besked om dagens kundkonfiguration. [SchoolSoft, 2024-02-01](https://schoolsoft.se/aktuellt/ny-funktion-for-hantering-av-elever-med-skyddad-identitet/)

**Elevregistrets minsta modell:** person/elev, skolenhet, datumsatt skolplacering, klass och datumsatt klasstillhörighet, källreferens samt aktuell visnings-/åtkomstregel. Utbildningskull, läsår och årskurs är skilda begrepp. Ta med kontaktrelationer endast om pilotuppgiften kräver dem, med relation och giltighet; importerad kontakt skapar aldrig vårdnadshavarkonto eller åtkomst. Fulla undervisningsgrupps- och individuella studieplansflöden får egna senare krav. [Informationsmodellens gränser](../../docs/produktunderlag/12-informationsmodell-och-designkontrakt.md)

## Senare mervärden — differentiators

Detta är produktmöjligheter med MEDIUM tillförlitlighet, inte belagda konkurrensfördelar. Enkelhet måste visas i arbetsprov.

| Funktion | Värde för användaren | Komplexitet | När den bör prioriteras |
|---|---|---|---|
| Samma elevkontext från plan till grupp och schema | Mindre upprepad sökning och omregistrering. | Hög | När elevgrund, individuella planer och datumsatta undervisningsrelationer fungerar tillsammans. |
| Gemensam granskning av massändringar | Administratören ser urval, före/efter och undantag innan ändringen genomförs. | Hög | Efter att motsvarande ändring för en elev och konflikter är prövade. Pilotens importförhandsgranskning ger ett återanvändbart mönster. |
| Begriplig planjämförelse och kullåterbruk | Ett nytt utbildningsupplägg kan förberedas utan att förlora tidigare beslut. | Medel | Befintlig kullkopiering bevaras nu; utökad jämförelse och hjälp utvecklas efter observerade behov. |
| Tydlig avvikelsehantering mellan kommunens system | Mindre felsökning och lättare att hitta den som kan rätta originalet. | Hög | En minimal importstatus behövs nu; samlad hantering för flera anslutningar först efter fungerande pilotflöde. |

## Uttryckliga icke-mål — anti-features

| Avgränsning | Skäl | Gör i stället |
|---|---|---|
| Full SchoolSoft-paritet, full betygs-/närvaro-/rapporteringskedja i v1.0 | Katalogbredden är större än den valda milstolpen. | Behåll katalog-ID:n och placera ej valda funktioner efter piloten. |
| Generell tvåvägssynk och alla kommunleverantörer | Skapar olösta konflikter om vem som äger uppgiften. | Bevisa ett konkret flöde och dess felhantering. Ett Skolverket-uppslag ersätter inte kommunens elevregisteranslutning. |
| Flytta elever eller ärva beslut när en utbildning kopieras | Strider mot användarens innebörd av nästa elevkull. | Kopiera upplägget; nya planer blir egna utkast utan elever, klasser, tillstånd eller beslut. |
| Verkliga vårdnadshavarutskick, portal och allmän e-legitimering | Tillför nya målgrupper, relationer och leveransansvar. | Avgränsa piloten till personal och nödvändiga administrativa relationer. |
| Medicinska journaler, heltäckande elevärenden, provklient och AI-beslut | Kräver egna informationsområden och acceptansunderlag. | Behåll befintliga demonstrationer tydligt avskilda; planera separat efter pilot. |
| Egen komplett publik diarietjänst och automatiskt inbyggda rättsliga tidsregler | Nytillkomna förslag är inte användarbeslutade pilotkrav. | Fastställ informationshantering och nödvändig diariekoppling med ansvarig funktion. Rättsliga påståenden granskas separat. |
| Ny mobilapp eller offlinekopior av elevinnehåll | Webbflödet finns; detta tillför distribution och fler datakopior. | Pröva den befintliga responsiva webben för pilotens uppgifter. |
| Dold knapp som säkerhetsgräns eller rollväljare som tilldelning | Tillåter att klientvägen kringgås. | Visa bara verifierade uppdrag och pröva samma regel direkt mot skyddade data och funktioner. |

## Beroenden och föreslagen leveransordning

```text
Pilotens aktörer, uppgifter, källansvar och syntetiska provdata
  → Verifierad identitet + kund/skola/uppdrag + kontolivscykel
    → Beständigt elevregister + datumsatta relationer + skyddade uppgifter
      → Ett registerflöde med matchning, avstämning och återhämtning
        → Samlade arbetsprov, återställning och pilotbeslut

Befintliga utbildnings-/kull-/klassflöden → regression vid varje berörd ändring
Spårbarhet och åtkomstprov → ingår från första skyddade arbetsflödet
Kontakt med pilotkommun och anslutningsunderlag → kan löpa parallellt från start
```

Bygg registerlivscykeln före en bred importfunktion så att importen använder samma kontroller som administrationen. Slutför inte flera alternativa anslutningar medan vald kommuns faktiska fält och åtkomst ännu är okända. En syntetisk andra kund och minst två skolor behövs i behörighetsproven även om första piloten har en huvudman.

## Acceptansscenarier och förväntat användarbeteende

Scenarierna är förslag till krav och prov, inte genomförda resultat. Vid arbetsprov ska användaren kunna förklara **vilken elev/skola, vilket datum, vad ändras, varifrån uppgiften kommer och vad som faktiskt sparats**. Notera slutförande, hjälpbehov, fel, omregistrering och tid; sätt eventuella tidsmål efter en första mätning.

| Scenario | Förväntat resultat |
|---|---|
| Behörig person loggar in och väljer sitt andra skoluppdrag. | Endast tillåtna arbetsytor och elevurval visas. Tidigare skolkontext läcker inte genom länkar, sökning eller tillstånd i webbläsaren. |
| Rektor på A tilldelar lärare på A och försöker samma sak på B; HM gör samma försök. | Rektorns giltiga uppdrag på A fungerar; B nekas utan mandat. HM får se tilldelning och utse rektor men saknar lärartilldelning. Direkt anrop ger samma beslut. |
| Ett uppdrag avslutas eller konto spärras medan en elevvy är öppen. | Nästa skyddade anrop efter lokal spärr nekas. Fördröjningen från extern källa till lokal spärr mäts mot överenskommen gräns. Återinloggning eller gammal länk återger ingen obehörig elevinformation. |
| Administratören söker två namnlika elever, öppnar en och återgår. | Elever kan skiljas åt med tillåtna uppgifter; samma urval finns kvar. Ett sparat värde finns kvar efter ut-/inloggning och omläsning. |
| Samma elev återkommer eller byter klass med framtida datum. | Matchning använder stabil identitet, inte bara namn. Historiken består; rätt klass blir aktuell på startdatumet. Rättning görs i den källa som har skrivansvar. |
| Två behöriga administratörer ändrar samma uppgift. | Den senare sparningen hanterar versionskonflikten synligt och skriver inte tyst över nyare data. |
| En skyddad syntetisk elev och ett känt objekt-ID från annan kund används. | Inga otillåtna uppgifter eller röjande metadata lämnas ut genom de tillgängliga läsvägarna. Behörig roll kan utföra sin avsedda uppgift. |
| Elevleveransen körs två gånger, innehåller felaktig rad eller blir oväntat tom. | Inga dubbla elever eller tysta massraderingar. Användaren ser vad som införts, stoppats och behöver rättas, samt kan göra kontrollerat omförsök. |
| Integrationens inläsning stannar efter tidigare lyckad körning. | Senaste kända uppgifter och tidpunkt redovisas sanningsenligt; fel visas separat. Ett tekniskt lyckat anrop märks inte som avstämt om innehållet underkänts. |
| HM uppdaterar importerad skola efter att ha valt rektor lokalt. | Skolfakta uppdateras enligt källa; rektorsvalet bevaras. Registerpostens namn skapar inget konto eller mandat. |
| HM skapar gymnasieutbildning, lägger till innehåll och kopierar till ny kull. | Uppskattat flöde fungerar. Ny kull får egna utkast; elever, klasser och beslut kopieras inte. Ursprungliga planer och klasskopplingar består. |
| Klass kopplas till fastställd timplan och nästa version fastställs. | Klassen behåller den valda fastställda versionen tills kopplingen ändras uttryckligen; inga fiktiva elevmedlemskap uppstår. |
| Samma pilotuppgift utförs på telefon, med tangentbord och förstoring. | Alla nödvändiga steg går att slutföra; fokus, status och fel är begripliga och ingen nödvändig information försvinner. |
| Pilotkundens data återställs och därefter lämnas över vid avveckling. | Registrets relationer och historik kan avstämmas; avslutade rättigheter öppnas inte igen. Exportens innehåll och fortsatt hantering följer kundens beslut. |

## Öppna frågor inför fasplanering

- Vilken pilothuvudman, skolform, identitetsanslutning och registerkälla ska bevisas? Grundskola och gymnasium behöver olika elevexempel även om säkerhetsgrunden delas.
- Vilka elevfält, kontaktrelationer och placeringsändringar ingår, och var ska varje uppgift rättas? Undvik två konkurrerande skrivvägar.
- Vilken uppgiftstilldelning får skoladministratör och lärare? Detaljerad rättighetsmatris återstår; rollerna ger inte generell elevåtkomst.
- Vilket skyddat arbetsfall, avstämningsintervall, spärrfördröjning och återställningsmål godtar pilotkunden?
- Vilket befintligt diarium eller vilken annan fastställd hantering behöver piloten ansluta till? Inget antagande om publik webbpublicering ska ärvas från förslagsdokument.

## Källor och tillförlitlighet

| Källa | Datering och användning | Tillförlitlighet |
|---|---|---|
| [PROJECT.md](../PROJECT.md) | Användarbeslut och milstolpe 2026-09-10. Styr omfattning framför äldre förslag. | HIGH för dokumenterade beslut. |
| [SchoolSoft-analys](../../docs/schoolsoft/analys.md) och [funktionsregister](../../docs/schoolsoft/funktionsregister.json) | 2026-09-05; behov, katalog-ID och acceptansidéer. Byggstatus kan vara föråldrad. | MEDIUM för behov, LOW för obevisade detaljflöden och aktuell kundfunktion. |
| [Skolimport och rektor](../../docs/skolimport-och-rektor.md), [elevkullar och klasskopplingar](../../docs/elevkullar-och-klasskopplingar.md) | 2026-09-08; dokumenterad funktion och historiska prov. Inte nya provresultat. | MEDIUM för nuläge; regression krävs. |
| [Informationsmodell](../../docs/produktunderlag/12-informationsmodell-och-designkontrakt.md) | Version 2.0; användarflöden, giltighet, källa och informationsgränser. Produktförslag. | MEDIUM som designunderlag. |
| [Kommunintegration och säkerhet](../../docs/kommunintegration-och-sakerhet.md) | 2026-09-10; konto-, uppdrags- och integrationsscenarier. Rättsliga slutsatser och offentlighetsregisterförslag antas inte beslutade. | MEDIUM för rekommendationer; juridiska slutsatser ej bedömda här. |
| [SchoolSoft elevadministration](https://schoolsoft.se/produkter/elevadministration/) och [gymnasium](https://schoolsoft.se/skolform/gymnasium/) | Odaterade leverantörssidor lästa 2026-09-10. Belägger beskriven produktbredd. | HIGH för vad leverantören beskriver; MEDIUM som signal om förväntade behov. |
| [SchoolSoft skyddad identitet](https://schoolsoft.se/aktuellt/ny-funktion-for-hantering-av-elever-med-skyddad-identitet/) | Publicerad 2024-02-01, återläst 2026-09-10. Daterat exempel på särskilt arbetsflöde. | HIGH för den daterade beskrivningen; aktuell konfiguration ej verifierad. |

Ingen ny biblioteksteknik eller API-/standardversion rekommenderas i denna dimension. Kvarvarande osäkerhet gäller framför allt pilotkundens verkliga arbete, valda datakällor och fullständiga arbetsprov, snarare än fler generella funktionslistor.
