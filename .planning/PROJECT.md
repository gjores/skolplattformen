# Skolplattformen

## What This Is

En skolplattform för svenska huvudmän, rektorer, skoladministratörer och lärare med tydlig administration av elever, studieplaner, grupper, schema, utbildningar och undervisningstid. Produkten ska vara modern, lätt att arbeta i på dator och telefon och kunna anslutas till olika kommuners system och säkerhetskrav. Detta GSD-projekt vidareutvecklar den befintliga arbetsversionen; det börjar inte om från en tom kodbas.

## Core Value

Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.

## Current Milestone

**v1.0 — Säker administration inför en pilot.** Användaren valde den 2026-09-10 inloggning, behörigheter, elevregister och en kommunintegration som första milstolpe. Hela produktvisionen finns kvar, men undervisning, fullständiga ärendeprocesser och alla leverantörsanslutningar ska inte färdigställas samtidigt.

De 42 detaljkraven i `.planning/REQUIREMENTS.md` och färdplanens åtta faser i `.planning/ROADMAP.md` godkändes av användaren 2026-09-11. Fas 1 är genomförd och verifierad 2026-09-12. Fas 2:s tolv planer är genomförda och verifierade 2026-09-21 (02-VERIFICATION.md). Fas 3:s sju planer granskades 2026-09-22 och genomförandet inleddes 2026-09-23. Verifieringen gäller den lokala syntetiska provmiljön, inte verklig pilotdrift.

Målet är en avgränsad och prövbar pilot för en huvudman, med syntetiska uppgifter tills kommunen har beslutat om verklig användning. Val av pilotkommun, identitetsleverantör, externt elevregister, avtal och drift är öppna beroenden. Dessa får inte ersättas med påhittade integrationsbesked.

## Requirements

### Validated

Här avses befintliga funktioner i arbetsversionen, inte validering i kommunal produktion. Äldre användar-, databas- och byggprov är historik. Kodkartläggningen 2026-09-11 verifierade 85 lokala modelltester; omfattning och testluckor finns i `.planning/codebase/TESTING.md`.

- ✓ Utbildningar och tillägg av kurser för gymnasiet — användaren är nöjd med detta arbetsflöde och det ska bevaras.
- ✓ Skolenheter kan hämtas ur Skolverkets register med organisationsnummer eller skolenhetskod; adress och skolform förs in och huvudmannen utser rektor — befintlig implementation, se `docs/skolimport-och-rektor.md`.
- ✓ Poängplaner, timplaner och läsår har beständig lagring och versionsflöden — befintlig Supabase-implementation med demoinloggning.
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

## Evolution

Vid fasövergångar: flytta verifierade krav till Validated med fasreferens, dokumentera ändrade eller borttagna krav med skäl och uppdatera beslut och nuläge. Vid milstolpens slut: granska hela projektbeskrivningen, kärnvärdet, senarelagd omfattning och driftläget. Ett förslag blir inte beslutat enbart för att det står i filen.

---
*Last updated: 2026-09-28 — fas 3 (Mandat och skyddade datavägar) verifierad och stängd; nästa fas 4 Beständigt och skyddat elevregister.*
