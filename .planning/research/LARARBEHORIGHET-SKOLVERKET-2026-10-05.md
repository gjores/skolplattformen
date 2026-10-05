# Lärarlegitimation och undervisningsbehörighet från Skolverket

Datum: 2026-10-05. Status: användarbeställd research och översyn av planeringen. Integrationsförslaget nedan är inte genomfört eller ett godkänt verkligt anslutningsprov. Genomförandeplacering, verksamhetsregler och leveransomfattning ska preciseras före implementation. Pilotens 42 v1-krav och åtta faser behålls.

## Slutsats och belagt underlag

Skolverket för lärar- och förskollärarregistret. Myndighetens publicerade utlämnandeväg är registerutdrag via säkra meddelanden. Något offentligt dokumenterat personuppslags-API har inte kunnat verifieras i researchen; eventuell särskild maskinåtkomst behöver bekräftas med Skolverket. Se [registerutdrag och behörighetslista](https://www.skolverket.se/kompetensutveckling/legitimation/utdrag-ur-larar--och-forskollararregistret) och [öppna API:er](https://www.skolverket.se/om-skolverket/oppna-data). Att uppgifter kan begäras ut avgör inte automatiskt villkoren för vår löpande behandling.

Den lästa [tekniska specifikationen v5.0, 2025-11-19](https://www.skolverket.se/download/18.2c47e40319a768a10c533e45/1763655859659/Schema%20f%C3%B6r%20registerutdrag%20LLEG%20v5.0%202025-11-19.pdf) beskriver XML-uttag för efterfrågade personnummer, med legitimationstyp och utfärdandedatum, skolform, behörighetstyp, ämnes-/studievägskod, språkunderkod, årskurser och specialisering. Det finns utdragsdatum, identifierare, fel och särskilda poster för saknade personer. Dokumentet anger ACTIVE/REVOKED i värdemängderna, men tabellen LicenseType anger inte ett motsvarande statusfält. Aktuellt XSD, faktiska exempel och transport av återkallelse ska därför bekräftas före statuskontroll. Ingen riktig XML-leverans har prövats.

För gymnasiet behöver [Gy25-behörigheterna](https://www.skolverket.se/kompetensutveckling/legitimation/behorigheter-enligt-gy25) beaktas. Behörighetslistans koder och programplanens katalogreferenser behöver ett verifierat samband; samma namn eller liknande kod är inget tillräckligt matchningsbevis.

## Vad som saknas i dagens planering och kod

Kodkartan i `.planning/codebase/` är historik från 2026-09-11. Följande aktuella kodankare har lästs som underlag; detta är statisk granskning, inte nya körprov:

- `supabase/migrations/20260922120000_phase3_staff_bindings.sql`: `staff_assignment_bindings` kopplar ett verksamhetsuppdrag till ett medlemskap inom kunden.
- `supabase/migrations/20260913100000_phase2_worker_core.sql` och `web/lib/server/db.ts`: inloggningsidentitet använder utfärdare och subject. Denna identitet är inte ett verifierat lärarpersonnummer för registeruppslag.
- `web/lib/access-rules.ts` och fas 3:s mandatflöden kontrollerar aktuella lokala rättigheter. Ingen läst modell innehåller Skolverkets lärarlegitimation och ämnes-/årskursbehörigheter.
- `web/app/api/kund/mandat/route.ts` har en skyddad, auditerad GET. `web/lib/server/mandate-route.ts` avgränsar den till lokal syntetisk miljö; `supabase/migrations/20260926110000_phase3_list_current_mandates.sql` visar giltiga/kommande direkta underuppdrag, inte full historisk statistik eller verklig kommunanslutning.
- `web/lib/admin-model.ts`: grupp- och schemaexempel använder lärarnamn. En beständig lärarresurs och personmatchning behöver definieras före integration.
- `web/lib/timplan-model.ts`: underlag för tjänstefördelning finns, men det belägger ingen kontroll mot lärarregistret.

Den äldre [API-todon från 2026-09-12](../todos/pending/2026-09-12-api-f-r-l-rares-beh-righeter-med-statistisk-uppf-ljning.md) gäller lokala uppdrag och statistik. Den ska hållas skild från detta spår; fas 3:s skyddade uppdragsvägar har tillkommit sedan dess. Varken denna todo eller ACL-02 belägger ämnesbehörighet från Skolverket.

## Avsedd informationsmodell och användarflöde

Tre separata kontroller behövs: Skolverkets undervisningsbehörighet, rektorns aktuella läraruppdrag samt personens operationsbundna systemåtkomst. Ett positivt registerutdrag ger inte anställning, skoluppdrag, inloggningskonto eller elevinsyn. Ett ändrat utdrag ska ge en spårbar verksamhetsavvikelse utan att automatiskt skriva om uppdragen eller historiska planbeslut.

Föreslagen kedja: skyddad personmatchning → mottaget myndighetsutdrag → validerad och granskad behörighetsversion → tjänstefördelning/undervisningsgrupp → regelkontroll av schemaförslag. Programplanens innehåll och timplanens timmar behöver kunna planeras före lärartilldelningen; saknat bemanningsunderlag ska inte felaktigt göra dessa planer ogiltiga.

1. **Personmatchning:** definiera en stabil intern lärar-/personresurs inom kunden, skild från konto och uppdrag, som kan ha flera uppdrag och finnas utan användarkonto. Koppla personnummer genom en kontrollerad källa eller explicit granskning. Matcha aldrig automatiskt på namn, e-post eller OIDC-subject. Omatchade och tvetydiga personer får avvikelser, inte nya rättigheter. Åtkomst över kundgränser kräver egna relationer; en gemensam offentlig personuppgift ger ingen sådan åtkomst.
2. **Källa och version:** lagra minsta nödvändiga uppgifter, myndighetskälla, leverans-/utdragsreferens, mottagningstid, utdragsdatum, kontrakts-/kodlisteversion och granskning. Tidpunkterna visar vilket underlag som använts; de garanterar inte att beslutet är aktuellt idag. Ställ krav på verifierbart ursprung: korrekt XML-format ensamt bevisar inte att filen kommer från myndigheten. Manuell registrering hålls skild från ett kontrollerat myndighetsutdrag.
3. **Import:** börja med en separat XML-adapter efter bekräftat leveranskontrakt. Låt en senare bekräftad API-adapter lämna samma interna format. Följ servermandat, kundurval, förhandsgranskning, revision, atomisk audit, omkörning och avstämning; återanvänd säkerhetsmönster, inte elevtabeller eller elevens personuppgiftsgrant. Begränsa XML-storlek och komplexitet och stäng extern entitets-/nätverksupplösning. Saknad person, utelämnad rad, tom leverans, transportfel, inaktuellt utdrag och bekräftad återkallelse är olika utfall. Inget av dessa får tyst radera en lärare, historik eller uppdrag.
4. **Kontroll och presentation:** jämför rätt skolform, ämne, årskurs, språk och eventuell specialisering med undervisningsuppdraget. Skilj verifierad matchning, avvikelse och okänt/ofullständigt underlag. Rektor ser konkreta åtgärder och datum, exempelvis kontrollera utdrag eller ändra bemanning. Lokal registrering får inte skriva över myndighetsfakta. Eventuella tillåtna undantag behöver separat regelprofil, ansvarig, grund, omfattning och giltighet; exakt blockering/granskning beslutas utifrån tillämpliga verksamhetsregler före implementation. Importstatus är inget automatiskt rättsligt godkännande.
5. **Schema:** bind kontrollresultat till lärarresurs, undervisningsuppdrag, regel-/kodlisteversion och exakt behörighetsrevision. Nytt underlag gör berörda utkast/körresultat inaktuella och visar konsekvenser för publicerade scheman. Vid godkännande/publicering kontrolleras aktuella revisioner och mandat på nytt; ett gammalt resultat får inte få ett nytt giltighetsbesked. Historiken bevarar det underlag som användes vid tidigare beslut. Beräkningsmotor och eventuell AI får resurs-ID:n och nödvändiga begränsningar, inte personnummer eller fullständiga myndighetsutdrag.

## Föreslagen placering och spårbarhet

L1–L4 är ett avgränsat förslag till planeringsordning. De är inga nya numrerade pilotfaser och inga körbara PLAN-filer. LLEG-01–04 är föreslagna planeringsmål i REQUIREMENTS, inte fastställda leveranskrav. Varje mål har ett ansvarigt steg nedan och väntande verifiering.

| Mål | Ansvarigt steg | Koppling till befintliga planer | Bevis som ska tas fram |
| --- | --- | --- | --- |
| LLEG-01: rätt person och källa | L1 — kontrakt/personmatchning | S1; bevara fas 3:s mandat | Kontrollerad intern personbindning, separat källa/åtkomst, namnlika/omatchade personer och annan kund. |
| LLEG-02: avstämd behörighetsimport | L2 — skyddad XML-import | Återanvänd fas 6:s importmönster efter dess kontraktsarbete | Förhandsgranskning, radfel, omkörning, ordning/konflikt, tom leverans, auditrollback och bevarad historik. |
| LLEG-03: användning i bemanning/schema | L3 — tjänstefördelning och kontroll | S1:s regelkontrakt och S3:s grupp-/schemaflöden; för in syntetiska begränsningar i S2 | Matchning per skolform/ämne/årskurs, okänt underlag, reglerade undantag, ändrad revision och nytt publiceringsbesked. |
| LLEG-04: verklig anslutning och förvaltning | L4 — extern verifiering/drift | S4; samordna extern acceptans med fas 7 och informationshantering med fas 8 | Bevis för faktiskt vald XML- eller API-leverans, godkänt ändamål/åtkomst, färskhetsregler, avbrott, återställning, export/avslut. |

**Avgränsningar i pilotfaserna:**

- Fas 3:s ACL-02 fortsätter avse lokala läraruppdrag. Nya lärarregisteroperationer får egen mandatmatris och nya negativa prov; gamla PASS används inte som bevis för dem.
- Fas 5 ska bevara ämnes-/nivå-/katalogreferenser för framtida matchning. Bygg inte lärarregisterkontroll i 05-22 eller de kommande timplansplanerna; deras innehålls-/tidsanalys är ingen bemanningskontroll.
- Fas 6:s INT-02 avser elever och placeringar. Lärarimport är en egen adapter och får inte räknas som uppfyllande av INT-02–06 eller utvidga deras godkända omfattning tyst. Särskilt maskinmandat utreds även om XML levereras manuellt.
- Fas 7:s INT-07 gäller vald elevregisterleverantör. Ett prov av Skolverkets lärarutdrag ersätter inte detta. L4 behöver eget anslutningsbevis, även om testorganisationen och processen återanvänds.
- Fas 8:s informations-/driftunderlag kompletteras när lärarspåret införs i avsedd drift. Ändamål för kontroll vid anställning respektive löpande bemannings-/schemaplanering, åtkomst, bevarande/gallring och eventuella underleverantörer behöver hanteras uttryckligt. Detta är en öppen planeringsfråga, inte en juridisk slutsats.

En kund som bara använder schemamodulen ska kunna tillföra motsvarande kontrollerat behörighetsunderlag från en kompatibel personalmodul/import. Modultillgång, lokalt mandat och datakvalitet är separata kontroller enligt MODUL-02/03. Skolverkets anslutning blir inte ett nytt automatiskt hinder för den avgränsade elevregisterpiloten.

## Verifieringsmatris för kommande planer

Samtliga fall är mål, ännu inte genomförda:

- L1: två namnlika lärare, en tvetydig personmatchning, flera skoluppdrag och lärare utan konto; personnummer läcker inte till lista, URL, logg, fel eller annan kund. Ett positivt utdrag skapar inga uppdrag/rättigheter.
- L2: samma och äldre leverans, avbruten import, samtidiga granskningar, okända kodvärden, felaktig XML och förbjuden extern entitet. Befintliga data och historik består vid fel/auditbortfall. Tom leverans och saknad person ger separata avvikelser.
- L3: läraren matchar matematik för angiven skolform/årskurs, men får avvikelse för annan årskurs eller ett annat ämne; språk, specialisering och Gy11/Gy25 provas separat. Saknad eller okänd kodmappning ger inget grönt besked. Exakt regelprofil avgör tillåtet nästa steg.
- L3: förändrad eller bekräftat återkallad behörighet under en beräkning gör resultatet inaktuellt inför nytt beslut. Publicerad historik bevaras med synlig konsekvens. Ingen automatisk återkallelse av systemkonto följer av importen. Undantag kan inte användas utanför dokumenterad omfattning/giltighet.
- L3/S2: motorbyte eller AI-förslag kan inte försvaga obligatoriska regler; pseudonymt underlag räcker för beräkning. Rektor kan förstå och åtgärda avvikelser på dator/telefon och med tangentbord. Berörd handbok och dokumentationsbygge ingår i genomförandeplanen.
- L4: faktiskt leverans-/anslutningsprov skiljs från syntetiskt test. Utdragsdatum, mottagningstid och senaste avstämning visas separat; utebliven uppdatering blir synligt inaktuellt underlag. Återställning får inte åter presentera föråldrat underlag som aktuellt.

## Nästa konkreta planeringssteg

Ta fram L1 som avgränsad GSD-plan tillsammans med S1: personresurs/bindning, mandatmatris, kodmappning, datakontrakt, färskhet och regelansvar. Utred samtidigt med Skolverket om det finns API/särskild maskinåtkomst, aktuellt XSD och syntetiska exempel, leverans-/återkallelseformat, villkor för huvudman/systemleverantör samt möjlig testmiljö. Skicka inga verkliga personnummer i research eller provskript. Ingen kontakt har skickats genom denna planeringsöversyn.

L2 kan utvecklas med syntetiskt kontrakt först när detta är preciserat; verklig transport och L4 förblir öppna tills de faktiskt bekräftats och prövats. Den aktuella ordningen 05-22 → 05-23 → 05-25 och väntande användarprov behålls. [Registrerad uppgift](../todos/pending/2026-10-05-integrera-skolverkets-lararbehorigheter.md) håller samman fortsatt arbete.
