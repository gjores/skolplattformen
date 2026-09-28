---
phase: 04-best-ndigt-och-skyddat-elevregister
type: plan-quality-review
status: passed
reviewed: 2026-09-28
plans_reviewed: 22
waves: 15
implementation_verified: false
---

# Fas 4 — granskning av genomförandeplaner

**Resultat: PASS för planernas genomförbarhet efter rättelser.** Inga kvarstående blockerande eller större fynd. Detta är plangranskning, inte bevis för implementerat elevregister, godkänd verklig anslutning eller avslutad fas.

Granskningen omfattar 04-01–04-22-PLAN.md i arbetskatalogen 2026-09-28, med aktuell kod vid basrevision `796a934`. Underlag: plan-checker-skill, PROJECT, REQUIREMENTS, ROADMAP, CONTEXT D-01–D-20, UI-SPEC, VALIDATION samt berörd server-, mandat-, SQL-, logg- och browserkonfiguration. Senare beslut D-17–D-20 har företräde framför äldre research och UI-formuleringar. PATTERNS är valfri lokal läshjälp och inget obligatoriskt versionshanterat beroende.

## Kontroller

| Område | Resultat och grund |
|---|---|
| Uppgifternas fullständighet | Samtliga automatiska uppgifter har namn, exakta filer, åtgärd, verifiering och mätbart klartvillkor. Sista planen är en separat mänsklig checkpoint med provväg och återupptagningssignal. |
| Beroenden | 22 planer i 15 vågor. Alla beroenden finns och ligger i tidigare våg; inga cykler. 04-16:s fullständiga API-prov ligger nu efter 04-17:s avveckling. |
| Filägande | Inga överlappande deklarerade filer i samma våg. Återkommande test-/integrationsfiler hanteras sekventiellt. Migrationsprovet i 04-03 är uttryckligen deklarerat. |
| Storlek | Två uppgifter per genomförandeplan, en i checkpointen. 04-17:s sju filer godtas som ett sammanhållet borttagningspaket över samma gamla elevdataväg; ingen separat ombyggnad göms där. |
| Must-haves | Alla planer innehåller observerbara mål, artefakter och kopplingar. |
| Körbara kontroller | Alla automatiska kommandoblock passerar statisk shellsyntaxkontroll. Korrekt befintlig browserkonfiguration används för respektive fas 3-spec. Nya tester och skript skapas i sina ägarplaner. Kommandona har inte körts mot ännu ej implementerad funktion. |
| Bevisgräns | Planerna skiljer implementation, syntetiska prov, mänskligt användarprov och separat fasverifiering. BLOCKED/saknade eller gamla bevis får inte räknas som PASS. |

## Kravtäckning

| Krav | Huvudsakliga genomförandeplaner | Planerade bevis |
|---|---|---|
| STU-01 | 01–03, 09–10, 12–13 | Stabilt ID/migrering, API-omläsning efter ny inloggning, browser 19 och grind 20–21. |
| STU-02 | 01–02, 04–05, 13 | Periodgränser, aktuell/framtida/avslutad placering och bevarad historik; SQL, API och browser. |
| STU-03 | 02, 05, 13 | Daterat klassbyte, skolanknytning och separat utbildningsbyte; periodprov och genomgående browserfall. |
| STU-04 | 02, 05–06, 13 | Ursprung per fält, skrivägare och båda besluten vid simulerad källavvikelse; ingen verklig registeranslutning påstås. |
| STU-05 | 01, 04, 09, 12 | Serverurval, läsårsgränser, namnlika elever och säkra URL-filter; SQL/API/browser. |
| STU-06 | 05, 07–10, 13 | Riktiga tvåanslutningsprov, versions-/periodkonflikt och två administratörer i skilda browserkontexter. |
| DATA-01 | 03–04, 07–12, 16–19 | Skolbunden skyddstilldelning, anonym projektion, direkta vägar, sök/count/sortering, loggfel och sena svar. |
| DATA-02 | 04, 08, 10, 13, 16–19 | Explicit urval/fält/skyddade elever/personnummer; ny prövning vid download, spärr mellan preview/download och logg före bytes. |

04-20 binder alla åtta krav till färska namngivna fall. 04-21 uppdaterar endast handbokens användarinstruktioner/regler och bygger dokumentationen; 04-22 begär granskning av färdigt beteende, inte förnyat godkännande av redan beslutade krav.

## Säkerhets- och beteendekedjan

- D-17: huvudmannen tilldelar/återkallar skolbunden skyddsbehörighet till giltigt administratörsmandat; tilldelningen ger inte huvudmannen elevinsyn. Både SQL, API, UI och återkallelseprov omfattas.
- D-18–D-20: läsår 1 juli–30 juni, statusens referensdatum, anonym administratör utan åtgärder och historiska elever utan skrivrätt står uttryckligen i planerna. Skrivprövningen kan inte kringgås med valt läsår.
- Gamla elevprovet stängs tidigt genom indragen worker-läsning i 04-03; relationer och mandatvalslistor förs till samma register/projektion. Full avveckling i 04-17 följs av portade äldre prov utan tappade säkerhetsfall.
- Personnummer lämnas bara via uttrycklig visning/export. Historik, källavvikelse och konflikter maskerar numret. Fältvärden hålls utanför säkerhetsloggen, SQL-fel och rapporter.
- Konflikter returneras som typade resultat i den levande transaktionen. Nekad skrivning och eventuell skyddad visning loggas före HTTP 409; wrapperns lyckade huvudhändelse betecknar konfliktläsning, inte lyckad elevändring. Loggfel ger inga detaljer.
- Fritext hålls i flikminne, aldrig URL eller webbläsarlagring. Omladdning behåller säkra filter men rensar sökord; begränsningen dokumenteras i tekniskt kontrakt och handbok. Det löser motsägelsen mellan äldre sessionStorage-förslag och skyddskraven.
- Befintliga gymnasie-/kurs-/kull-/klass–timplansflöden och exempellägets backendfrihet har uttryckliga bevarandekrav och regressionsprov.

## Fynd som rättades under granskningen

| Fynd | Rättelse verifierad i plantext |
|---|---|
| Större: SQL-exception/Deny med skyddat konfliktvärde kunde kringgå visningslogg och lämna elevvärden i felkanalen. | 04-05, 07, 08 och 10 använder typat resultat och transaktionell projektion/logg före 409. 04-16 provar skyddat konfliktnamn, loggfel och frånvaro av fältvärden i rå logg. |
| Större: 04-18 körde phase3-workspace med en konfiguration vars testMatch utesluter filen. | 04-18:74 kör workspace med playwright.phase3.config.ts och mandates med playwright.protected.config.ts, inklusive discovery. |
| Större: fullständigt retired-probe-fall i 04-16 berodde på en parallell plans borttagning. | 04-16 har nu 04-17 som beroende; efterföljande vågor flyttade, totalt 15. |
| Större: svensk förklarande prosa inne i automatiska kommandon gav ogiltig shellsyntax. | Förklaringar ligger utanför automatiska kommandoblock; samtliga block syntaxkontrollerade. |
| Mindre: 04-03 föreslog villkorlig ändring av testfil utanför fildeklarationen. | Testfilen finns nu i files_modified och uppgiften; faktiskt före/efter-migrationsprov krävs. |

## Kvarstående begränsning

Inga implementations-, databas- eller browserprov har utförts av denna granskare. Riktig FK-migrering, direktvägsnekanden, loggfel, samtidighet, UI och handboksbygge måste genomföras och styrkas under exekveringen. Planernas verifieringskommandon är avsedda för den isolerade syntetiska miljön och ger inga besked om verklig pilotdrift.
