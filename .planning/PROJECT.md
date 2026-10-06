# Skolplattformen

## What This Is

En skolplattform för svenska huvudmän, rektorer, skoladministratörer och lärare med tydlig administration av elever, studieplaner, grupper, schema, utbildningar och undervisningstid. Produkten ska vara modern, lätt att arbeta i på dator och telefon och kunna anslutas till olika kommuners system och säkerhetskrav. Detta GSD-projekt vidareutvecklar den befintliga arbetsversionen; det börjar inte om från en tom kodbas.

## Core Value

Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.

**Aktuellt delresultat 2026-10-06:** Programplanen behåller blockramar och terminsfördelning men saknar nu blockhantering, enligt användarens förtydligande. Den genomförda övergången från komplett sparad högskoleförberedande programram till skolans timutkast består: exakt programversion/revision och poängterminer fryses; skolans timmar planeras separat och ändrad källa tas in uttryckligt i en ny timversion. Paket är borttagna från programplanerna. Vanlig 3012 kör `a7c78e1`; färsk kontroll visar 14 hela verksamhetstabeller och 18 befintliga scenarier bevarade. Rättningens 20 dator-/telefonfall PASS; se [avgränsad rättning](debug/programplan-block-controls.md). Föregående övergång har egna 60 browserfall och Worker 11/157 i [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md). Full 05-23/E, ADMIN-02/03/04, formella beslut, yrkesram 05-17, garanterad tid och separat skolutbud/elevval/grupporganisation/bemanning är fortsatt öppna. Äldre audit-FAIL och 05-22 metadata PARTIAL kvarstår.

## Current Milestone

**v1.0 — Säker administration inför en pilot.** Användaren valde den 2026-09-10 inloggning, behörigheter, elevregister och en kommunintegration som första milstolpe. Hela produktvisionen finns kvar, men undervisning, fullständiga ärendeprocesser och alla leverantörsanslutningar ska inte färdigställas samtidigt.

De 42 detaljkraven i `.planning/REQUIREMENTS.md` och färdplanens åtta faser i `.planning/ROADMAP.md` godkändes av användaren 2026-09-11. Fas 1–3 är genomförda och verifierade lokalt med syntetiska uppgifter. Fas 4 har 24 av 25 planer genomförda till och med våg 14: registret är enda elevdatavägen i skyddat läge. Plan 04-16 prövade 18/18 register-API-fall och riktad CSV-nedladdning; 04-18 portade äldre fas 3-gränser med mandat-API 26/26, access-API 16/16 och browser 63/63 PASS; 04-19 prövade hela elevflödet i 39/39 dator-/telefon-/byggda browserfall samt separat WebKit 13/13. Plan 04-20 samlade bevis i kravgrinden; 04-21 uppdaterade handboken, byggde dokumentationen och körde om hela grinden med PASS på `8923529` (SQL 17/17, access 16/16, mandat 26/26, register-API 18/18, lås 6/6 och browser 39/39). Mänskligt användarprov och separat fasverifiering återstår i 04-22. Ingen verklig kommunanslutning eller pilotdrift är godkänd.

Fas 5 har på användarens instruktion förberetts med 05-01:s kontrakt och verifieringskarta samt 05-02:s rättning av lokal sparordning/databas-ID. Den ordinarie modell-/lagersviten passerar 346/346 på arbetskopiekod committad i `174f6d8`; typkontroll, lint och exempelbygge passerade. 05-03 har därefter byggt stängd mandatavgränsad timplans-SQL med revision och atomisk DB-audit (77/77 SQL-prov och 4/4 verkliga låsprov, 2026-09-30). 05-04 har kopplat faktisk session till DB-/Worker-audit och timplans-API med MFA, strikt kontrakt och revisionskonflikt; preflight/final 29/29, SQL 104/104, regression 281/281 och modell/server 416/416 PASS. Exakt två Worker-entrypoints öppnade efter återställd preflight-ACL. 05-05 har därefter verifierat list-/kolumnunderlag med API preflight/final 39/39 (135 kontroller), SQL 59/77/27 och lås 4/4 PASS; exakt tre Worker-entrypoints. 05-06 öppnar skyddad lista/läsvy för befintliga GR/IM-planer och rektorns uttryckliga celländring med MFA, osparat skydd, konflikt och säker rensning. Aktuellt skyddat bygge 7776f41, dator-/telefonbrowser 18/18, modell/server 430/430, typ/lint och handbok PASS. Skapande, beslut, fullmatris/totalram, kullkopiering och klasskoppling återstår; gymnasieskrivning inväntar verifierad programplansgrund. Fas 4:s partiella användarprov, datumanmärkning och separat fasverifiering är fortsatt öppna.

05-07 har därefter levererat en separat versionsbunden programplansgrund: reproducerbart katalogartefakt, strikt program-/inriktnings-/ämnes-/nivåresolver och integritetskontrollerad serverintern validator. Katalogen bygger oförändrat på snapshot 2026-09-05. Samtliga 451 modell-/server-/generatorprov, typ/lint och skyddat bygge 6922ce7 PASS; oberoende strukturell granskning 5/5. Språkval, nivåupplösta alternativ och fullständiga nationella ram-/beslutsregler kvarstår uttryckligen. Referenslösning ger inga skriv-/beslutsrättigheter. Efterföljande SQL-del beskrivs nedan; separat skyddad API/UI återstår. ADMIN-02 och hela fas 5 är fortsatt öppna.

05-08 har levererat samma katalog som oföränderligt SQL-underlag och fem stängda kommandon för sessions-/mandatbunden läsning, uttrycklig legacy-bindning, utkaständring, skapande och versionskloning. 632 riktade SQL-prov, 455 modell/server/generator + 5 harnessprov, 42 TS/SQL-paritetsfall samt 6 verkliga låsväntansfall och yttre rollback PASS. Tidigare plan-/utbildnings-/historikfält är oförändrade; egna provrader städade, 3 säkerhetshändelser och 1 identitetsankare bevarade. Vid 05-08 var samtliga nya Worker-grants, routes, UI och beslut stängda. Nationella alternativ/ram-/beslutsregler och ADMIN-02:s slutbevis kvarstår. Se 05-08-SUMMARY och phase5-08-foundation.json.

05-09 har därefter verifierat fem skyddade programplanskommandon genom byggd Worker och verklig databas. Preflight/final 48/48, SQL 663, tidigare timplans-API 39, paritet 42, sex observerade låsväntan + rollback och oberoende granskning 6/6 PASS. Exakt fem nya Worker-entrypoints har öppnats efter återställd preflight, totalt åtta i fas 5. Ursprungliga verksamhetsrader är hashidentiska efter proven; egna provgrafer städade och säkerhetsloggar/ankare bevarade. 05-10 har verifierat urvals-/versions-/källunderlag med API preflight/final 38/118, SQL 443 och tidigare API 48/278 samt timplan 39/135 PASS. Två exakta ytterligare läsgrants ger totalt tio fas 5-entrypoints. 05-11 har därefter levererat skyddad programplansvy med skapa/binda/ändra/klona utkast. Programbrowser 30/30 och timplan 20/20 på samma c320041bygge, modell/server/generator 502, typ/lint, handbok och oberoende kodgranskning 6/6 PASS. Fyra beständiga syntetiska exempel är lästa genom aktuell Worker på 3012 för rektor/HM med 16 auditpar. Användaren underkände programplansvyns begriplighet 2026-10-02. 05-13 har rättat vyn med direkt aktuell plan, ämnen/nivåer/sparade val, tydlig nästa handling och guidad källbindning. Färska 30/30 programbrowser och 20/20 timplansregression PASS på samma 0f18e9bbygge, cleanup 50/50, riktade 25+4 Node-prov, typ/lint/bygge, oförändrad byggd handbok och oberoende granskning 6/6 PASS. Vanlig 3012 är frisk; current-Worker-provet läser alla fyra bevarade exempel för rektor/HM med 16 auditpar. Nytt mänskligt begriplighetsprov väntar. Lokal Fyll i provkod-knapp har separat 4/4 verkliga OIDC/MFA-prov PASS och ändrar inga servermandat. Två tidigare previewavbrott har öppen rotorsaksdiagnos; lyckade slutomgångar innebär ingen verifierad orsaksfix. 05-12 har redan levererat synlig GR/IM-regelhandledning med 20/20 dator-/telefonbrowserprov och handbok PASS. Mänsklig förståelsebedömning återstår tillsammans med programplansvyn. Fullständiga nationella regler, fastställande, nya utbildningar, kullkopiering, klasskoppling och fasverifiering är fortsatt öppna.

Historik före senaste mänskliga FAIL: 05-14 utökad enligt användaren med visuell karta över sex programdelar och vad som går att välja här. Skolgemensamma programfördjupningspaket över flera programplaner är en pending todo. Färska 32+20 browser, 27 Node-prov, typ/lint/skyddat bygge och handbok PASS på b4c26f3. Nio bevarade exempel lästa för rektor/HM genom 26 auditpar på vanlig 3012. Ny mänsklig begriplighetsbedömning väntar. Den separat granskade dialogen och fem extra syntetiska utbildningarna finns kvar. Paket-todon innebär ett användarbeställt framtida behov; generellt utbildningsskapande/extern uppladdning och paket/elevval är inte levererade.

Användaren underkänner 05-14:s mänskliga begriplighet 2026-10-02: rörigt och osammanhängande jämfört med förra UI:t. **Program → inriktning → programfördjupning** och samma UI för nya/befintliga utbildningar är nu beslutad arbetsordning. Den bevarade frontendvyn och Git-baslinjen har jämförts i 05-PROGRAMFLOW-HISTORICAL-REVIEW. 05-15/05-16 genomför faktiskt skyddat atomiskt huvudmannaskapande av utbildning och första utkast samt gemensam ämnesgrupperad arbetsyta för befintligt rektorsarbete. Tidigare servermandat och planidentiteter bevaras; program/inriktning i en öppnad befintlig utbildning skrivs inte om. Tidigare automatiska PASS är historik och ersätter inte nytt begriplighetsprov. 05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

05-18 har 2026-10-03 genomfört poäng per årskurs och termin i skyddad programplansversion: tre årskurskort, sex terminsfält, delad nivå, tydlig kvarvarande poäng och explicit spara/avbryt. Terminer 16/16, program 40/40, kompletterat API 31/31 och SQL 236/236 PASS. Timplanens 20 beteenden har passerat över full 19 + riktat 1, med externa setupfel särredovisade. Produktkällor oförändrade mellan d1f34ca och slutbygget d37f566 på vanlig 3012. Mänskligt prov väntar; admin-delegation och skapande av timplan från godkänd/fastställd programplan har egna todos. Ingen full nationell regelkontroll eller verklig drift godkänns här. Läs 05-18-SUMMARY/REVIEW.

Målet är en avgränsad och prövbar pilot för en huvudman, med syntetiska uppgifter tills kommunen har beslutat om verklig användning. Val av pilotkommun, identitetsleverantör, externt elevregister, avtal och drift är öppna beroenden. Dessa får inte ersättas med påhittade integrationsbesked.

## Requirements

### Validated

Här avses befintliga funktioner i arbetsversionen, inte validering i kommunal produktion. Äldre användar-, databas- och byggprov är historik. Kodkartläggningen 2026-09-11 verifierade 85 lokala modelltester; omfattning och testluckor finns i `.planning/codebase/TESTING.md`.

- ✓ Utbildningar och tillägg av kurser för gymnasiet — användaren är nöjd med detta arbetsflöde och det ska bevaras.
- ✓ Skolenheter kan hämtas ur Skolverkets register med organisationsnummer eller skolenhetskod; adress och skolform förs in och huvudmannen utser rektor — befintlig implementation, se `docs/skolimport-och-rektor.md`.
- ✓ Programplaner, timplaner och läsår har beständig lagring och versionsflöden — befintlig Supabase-implementation med demoinloggning.
- ✓ Utbildningsupplägg kan kopieras till nästa elevkull och fastställda timplaner kan kopplas till klasser — befintlig implementation, se `docs/elevkullar-och-klasskopplingar.md`.
- ✓ Rektorns arbetsflöde tilldelar läraruppdrag medan huvudmannens vy visar tilldelningen — funktion prövad 2026-09-08; databasens fullständiga uppdragsavgränsning återstår.
- ✓ Mobilanpassade vyer och lokal telefonförhandsvisning finns — ingen separat mobilapp behövs för pilotens grundflöden.
- ✓ Versionshanterad baslinje (`fas1-baslinje`) med återställningsprov, avskild provmiljö utan demoinloggning eller Supabase-klient (karantän bevisad med pgTAP 52/52 och 58 nekade API-anrop), syntetiska exempelskolor för grundskola och gymnasium, samt daterad anslutningsprofil med öppna beroenden — validerat i fas 1: Baslinje och avskild pilotmiljö (2026-09-12, `01-VERIFICATION.md`).

- ✓ Mandat och skyddade datavägar: huvudman utser rektor, rektor tilldelar lärare/administratör/elevhälsa/tidsbegränsad support (elev eller grupper, högst 60 min) inom egna skolenheter, IT utan elevinsyn, engångskod vid inloggning för konton med registrerad kod, varje läsning/export/ändring/nekande loggas före svar och stoppas vid loggfel — validerat i fas 3 (2026-09-28, `03-VERIFICATION.md`, lokal syntetisk miljö).

### Active

- [ ] Ersätta demoinloggning med verifierade konton, kommunanslutning och avslutbar åtkomst.
- [ ] Knyta varje behörighet till kund, organisation, skolenhet, relevant relation och giltigt uppdrag; pröva skydd även med direkta anrop.
- [ ] Ge administrationen ett beständigt, avgränsat elevregister med spårbart informationsursprung.
- [ ] Bevara fungerande utbildnings-, planerings-, klass- och mobilflöden när riktig identitet införs.
- [ ] Ansluta ett överenskommet skoladministrativt registerflöde med tydligt skrivansvar, avstämning och felhantering.
- [ ] Ge pilotkunden spårbarhet, hantering av skyddsvärda uppgifter och provad återställning och avveckling.
- [ ] Fastställa pilotens informationshantering och eventuella diariekoppling utan att göra obestyrkta rättsliga påståenden till automatiska produktregler.

### Out of Scope

Avgränsningarna nedan avser första milstolpen och ska kunna omprövas; de tar inte bort den långsiktiga visionen.

- Fullständig ersättare för varje SchoolSoft-funktion i första pilot — funktionsregistret ska användas för att spåra luckor, inte lova leverans av allt samtidigt.
- Fullständig undervisningsplattform, återkoppling och ärendehantering — befintliga exempel bevaras; fortsatt produktutveckling planeras senare.
- Medicinska elevhälsojournaler — kräver ett separat utrett informations- och åtkomstområde.
- Vårdnadshavarportal och e-legitimering för allmänheten — senare målgrupp och separat relationstilldelning.
- Alla kommuners leverantörer samtidigt, generell tvåvägssynk och färdig kommunal egen drift — piloten bevisar en anslutning; ytterligare leveranser följer egna avtal och prov.
- Egen komplett publik diarietjänst i första milstolpen — ett nytillkommet dokumentförslag ska granskas och nödvändiga pilotflöden lösas med fastställd hantering eller befintligt diarium. Krav på registrering är inte automatiskt ett krav på offentlig webbpublicering.
- Offlinekopior av känsligt elevinnehåll, verkliga utskick och automatiska myndighetsbeslut — ingår inte i den avgränsade piloten.

## Context

### Användarens mål och beslut

- Administration av elever, studieplaner, grupper och schema är produktens tyngdpunkt.
- Modern och enkel design är ett krav; granska konkreta arbetsflöden och användbarhet, inte bara utseende.
- Grundskola och gymnasium ska stödjas. Gymnasiets utbildningsskapande är positivt utvärderat; grundskolans arbetsflöden behöver egen prövning.
- Kopiera år framåt betyder kopiera utbildningsupplägget till nästa elevkull, inte flytta elever mellan läsår.
- Att lägga till skola börjar med registeruppslag. Registret ger skolans fakta; huvudmannen tillsätter rektor och rektor hanterar läraruppdrag.
- Kommunintegration är ett produktkrav. Säkerhet behöver genomsyra identitet, behörighet, data, anslutningar och drift.

### Delprojekt för sammanhängande schemamoduler — 2026-10-01

Användaren vill utveckla schemaläggning tillsammans med programplaner, timplaner, individuella studieplaner, tjänstefördelning, grupper och kalender. Roller, regler och gemensamma informations-/modulkontrakt ska beaktas redan i återstående planeringsarbete. Rust ska ingå i en avgränsad körbar prototyp och Jev eller liknande AI ska utvärderas för möjlig konfliktprioritering, åtgärdsval och alternativvärdering i schemamodulen. AI-införande är inte beslutat; en lösning utan AI är ett giltigt utvärderingsutfall. Valda delar av olika interna och externa moduler ska kunna kombineras och bytas utan att hela plattformen byts.

[Delprojektets underlag](research/SCHEMAMODUL-PROJEKT.md) anger gemensam grund, föreslagna mandat, krav SCHEMA-01–08, planeringssteg S1–S4 och verifieringsmål. Projektinriktningen är användarbeställd; exakt rolltilldelning, motor, AI-alternativ, driftgräns och genomförandeplacering är öppna. Inga nya schemavägar, Rust-/AI-komponenter eller rättigheter är byggda. Fas 5:s planering ska redovisa kompatibilitet för berörda planversioner, ID:n, enheter och ändringsansvar. Pilotens v1-krav och åtta faser behålls; en hel backendomskrivning är inte beslutad.

Användaren har också beslutat att kunden ska kunna köpa moduler var för sig. MODUL-01–04 anger separat kundbunden modultillgång, personbundna mandat, öppna databeroenden och kontrollerat tillägg/avslut. En kund ska exempelvis kunna köpa schema och tillföra planunderlag från ett befintligt system utan att köpa alla våra planeringsmoduler. Säljbar modulkatalog, tillval, priser och beställnings-/betalningsprocess återstår; ingen licens- eller betalningsfunktion är byggd.

### Lärarregister — planeringsöversyn 2026-10-05

Planeringsöversyn 2026-10-05: användaren vill se hur Skolverkets lärarlegitimation och undervisningsbehörigheter kan integreras. [Researchunderlaget](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) och schemadelprojektet anger ett separat föreslaget L1–L4-spår för personmatchning, XML-import, tjänstefördelning/schema och verkligt anslutnings-/driftprov. LLEG-01–04 är planeringsmål som behöver avgränsas före implementation. Myndighetsbehörighet, lokalt uppdrag och systemåtkomst hålls isär; pilotens 42 krav och pågående planordning behålls. XML-format är dokumenterat, men offentlig API-åtkomst för personuppslag och faktisk leverans är inte verifierade.

### Befintlig teknik och begränsningar

Arbetskatalog: `/Users/petter.gjores/dev/skolplattform`. Webbappen finns i `web/` och bygger på React, TypeScript, Vinext/Vite och Supabase/Postgres. Lokal förhandsvisning har använt port 5188; telefonförhandsvisningen har separat startkommando. `web/package.json` och låsfilen är källor för exakta beroenden.

Före fas 1 loggade `signInDemo` in anonymt och kopplade kontot till samma demohuvudman med rollen huvudman. I aktuell app är den vägen borttagen: provläget använder minnesdata utan Supabase-klient och skyddat läge använder den i fas 2 verifierade lokala identitetsleverantören och serverstyrda kontoåtkomsten. Rollväljaren i gränssnittet utgör inte verklig autentisering. Radnivåskydd finns, men flera policyer avgränsar till hela huvudmannen och rektorsuppdrag kontrolleras ännu inte mot den inloggades egna skolenheter. Elevadministrationen använder huvudsakligen syntetiska sessionsdata.

Historiskt passerade 85 modelltester, typkontroll, riktad lint, bygge och roll-/layoutkontroller den 2026-09-08. Kodkartläggningen 2026-09-11 körde modellsviten på nytt: 85 tester passerade med Node 24.19.0. Typkontroll, lint, bygge, webbläsare och databas prövades inte på nytt i kartläggningen.

Den aktuella kodkartan i `.planning/codebase/` är sparad i Git som `1a8e1e0`. `.planning/codebase/CONCERNS.md` belägger kvarvarande risker med konkurrerande timplans-/läsårssparningar, flerstegsskrivningar, demoåtkomst, breda databasmandat och klientstyrd historik. Appkällorna är nu versionshanterade; taggen `fas1-baslinje` (`917313b`) och återställningsprovet verifierades i fas 1. Kodkartan beskriver nuläget före dessa ändringar; aktuell fasrapport och kod går före äldre fynd. Dessa fynd ska tas med när berörda faser planeras; kodläsning ersätter inte körprov av driftens beteende.

### Underlag och källordning

1. Användarens uttryckliga beslut i samtalet och senare korrigeringar.
2. Verifierad aktuell kod och provresultat för påståenden om vad som är byggt.
3. Aktuella primärkällor för lag, standarder och leverantörsfunktioner.
4. Projektets analys- och produktdokument som beslutsunderlag; rekommendationer är inte automatiskt fattade beslut.

Viktiga dokument: `docs/kommunintegration-och-sakerhet.md`, `docs/schoolsoft/funktionsregister.json`, `docs/schoolsoft/analys.md`, `docs/admin-design-research.md`, `docs/huvudman-design-research.md`, `docs/produktunderlag/12-informationsmodell-och-designkontrakt.md`, `docs/backend-supabase.md`, `docs/byggstatus.md`.

Säkerhetsdokumentet har efter det första underlaget utökats med ett förslag om allmänna handlingar och offentlighetsregister. Bevara texten som underlag men kontrollera rättsliga påståenden och skilj skyldigheter från föreslagen systemdesign. Gamla README/statusuppgifter motsäger delvis aktuell kod och får inte ensamma användas som verifiering.

Det nytillkomna `docs/medicinska-uppdraget-och-kansliga-delar.md` är ett separat researchförslag inför eventuellt senare modulbeslut. Det är inte verifierat i denna initiering och ändrar inte pilotens valda omfattning. Rättsliga och marknadsmässiga påståenden där behöver egen granskning före kravställning.

## Constraints

- **Befintlig produkt:** Vidareutveckla och bevara användarens uppskattade utbildningsflöden; motivera större ombyggnader.
- **Säkerhet:** Inga verkliga elevuppgifter i demoprojektet. Produktionsvägar får inte ha anonym självutdelning av huvudmannarättigheter.
- **Informationsansvar:** Verifiera originalkälla och skrivansvar per integrationsobjekt före import; kataloguppslag bevisar inte rätt att företräda en huvudman.
- **Pilotberoenden:** Kund, system, API-behörigheter, drift och avtal är ännu inte valda. Arbeta med syntetiska testgränssnitt tills riktiga anslutningar finns.
- **Driftval:** Supabase är dagens teknik, inte ett slutligt besked om kommunal lämplighet. Separat databas per kund och egen drift är alternativ som behöver bedömas.
- **Arbetssätt:** Svensk, tydlig kommunikation; ta rutinbeslut själv, återanvänd kända svar och be om beslut om konkreta förslag.
- **Tid och budget:** Inga bindande leveransdatum eller budgettak är angivna. Datum i lagunderlag ska inte omvandlas till påhittade projektdeadlines.

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Första milstolpen är säker administration inför en pilot | Uttryckligt användarval 2026-09-10 | Confirmed |
| 42 detaljkrav och åtta faser fastställs för v1.0 | Användaren godkände kravförslaget och färdplanen 2026-09-11 | Confirmed; genomförande återstår |
| Bygg vidare i befintlig arbetsyta | Användaren har redan arbetat fram uppskattade funktioner | Confirmed |
| HM utser rektor; rektor tilldelar läraruppdrag | Uttrycklig korrigering av ansvarsfördelning | Confirmed; produktionsbehörighet återstår |
| Nästa elevkull får kopia av utbildningsupplägg | Uttryckligt svar om betydelsen av kopiera år | Confirmed; befintlig funktion |
| Verifierad kontoåtkomst och avgränsade uppdrag före beständigt elevregister | Godkänd fasordning 2026-09-11; faktisk kommunanslutning slutverifieras i fas 7 | Confirmed; val av IdP återstår |
| En begränsad registerintegration först | Gör anslutning, felhantering och informationsansvar prövbara | Confirmed scope; leverantör öppen |
| Gemensam app, konfigurerbara kundanslutningar | Flera kommuner ska kunna anslutas utan kundspecifika kodkopior | Proposed; driftgräns återstår |
| Återanvänd befintlig research och komplettera identifierade luckor | Undvik att börja om; verifiera föränderliga och rättsliga antaganden | Working default |
| Sammanhängande schemamoduler, Rustprototyp och AI-utvärdering för schemaarbetet | Uttrycklig användarinriktning 2026-10-01: planmoduler ska hållas samstämmiga och valda moduldelar kunna kombineras | Confirmed direction; AI ska utvärderas, införande ej beslutat; kontrakt, specifika mandat och genomförande återstår |
| Kunden kan köpa moduler var för sig | Uttryckligt användarbeslut 2026-10-01; egna och externa moduler ska kunna kombineras med separata kund- och personrättigheter | Confirmed; modulkatalog, kommersiella villkor och genomförande återstår |

## Evolution

Vid fasövergångar: flytta verifierade krav till Validated med fasreferens, dokumentera ändrade eller borttagna krav med skäl och uppdatera beslut och nuläge. Vid milstolpens slut: granska hela projektbeskrivningen, kärnvärdet, senarelagd omfattning och driftläget. Ett förslag blir inte beslutat enbart för att det står i filen.

---
*Last updated: 2026-10-04 — 05-18 terminsfördelning automatiskt verifierad; mänskligt prov, återstående fas 5 och fas 4:s checkpoint kvarstår.*
