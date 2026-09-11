---
phase: 1
slug: baslinje-och-avskild-pilotmilj
status: approved
reviewed_at: "2026-09-11T07:03:49Z"
shadcn_initialized: true
preset: base-nova
created: 2026-09-11
---

# Phase 1 — UI Design Contract

> Visuellt kontrakt och beteendekontrakt för den avskilda provmiljön. Avser fasens nya och ändrade ytor. Befintliga utbildnings-, kurs-, kull- och timplansflöden behåller sin form och navigation.

## Scope and Sources

Fas 1 omfattar BASE-01, BASE-02 och PILOT-01. UI-arbetet gör provmiljön begriplig och låter användaren hitta både grundskola och gymnasium på dator och telefon. Baslinjerapport och daterad anslutningsprofil är dokument; de kräver inga nya administrationssidor. Kontoetablering, fullständiga skolmandat och beständiga elever hör till senare faser.

| Källa | Beslut som används |
|-------|--------------------|
| `01-CONTEXT.md`, D-01–D-04 | Fristående provmiljö, två skolformer med egna exempelskolor, några klasser per skola, användaren själv på dator och telefon. |
| `01-CONTEXT.md`, D-06–D-10 | Syntetiska uppgifter, bevarade gymnasieflöden, skydd av befintligt material, avskild åtkomst och ärlig status för öppna kundbeslut. |
| `01-CONTEXT.md`, Codex discretion | Återanvänd responsiv webb; rutinval av presentation och fixturer är delegerade. |
| `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `AGENTS.md` | Godkänd omfattning och fasordning; planering är inte verifierad pilotdrift. |
| `.planning/codebase/{STACK,ARCHITECTURE,INTEGRATIONS,TESTING,CONCERNS,CONVENTIONS}.md` | Befintliga komponenter, skilda lagringslivslängder, demoidentitet och testluckor. |
| `docs/elevkullar-och-klasskopplingar.md`, `docs/skolimport-och-rektor.md` | Befintliga användarflöden och ansvarsfördelning; äldre prov är historik. |
| `.planning/research/PITFALLS.md` | Exempelroll och registeruppslag bevisar inte verklig behörighet eller kommunanslutning. |
| Aktuell lokal kod, läst 2026-09-11 | `web/components.json`, `web/app/{layout,page,organisation-workspace}.tsx`, `web/app/globals.css`, `web/components/ui/{button,dialog}.tsx`, `web/hooks/use-mobile.ts`. |

Ingen `CLAUDE.md` eller projektskill under `.claude/skills/` respektive `.agents/skills/` påträffades. Det befintliga designsystemet bevaras enligt användarens tidigare positiva omdöme och fasens delegerade rutinval. Ingen ny designbekräftelse behövs.

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn, befintlig installation i `web/`. |
| Preset | Detekterad stil `base-nova`; `baseColor: neutral`, CSS-variabler, `menuColor: default`, `menuAccent: subtle`. Någon ursprunglig kodad presetsträng finns inte i konfigurationen. |
| Component library | Base UI genom befintliga omslag i `web/components/ui/`; `@base-ui/react` 1.7.0 i paketmanifestet. |
| Icon library | `lucide-react`, befintlig installation. |
| Font | Geist Sans via `--font-geist-sans`; befintlig systemfontreserv behålls. Ingen ny font. |

`./node_modules/.bin/shadcn info` kördes från `web/` 2026-09-11. Kommandot avbröts när `https://ui.shadcn.com/r/index.json` inte kunde DNS-upplösas (`ENOTFOUND`). Ovanstående värden är verifierade direkt i `components.json`, CSS och installerade komponentkällor; inget lyckat registry-anrop påstås. Ingen initiering, uppgradering eller ny komponenthämtning ingår.

### Component inventory and visual composition

| Yta | Närmaste befintliga analog | Kontrakt |
|-----|--------------------------|----------|
| Alltid synlig miljömärkning | `.topbar`, `.demo-pill` i `page.tsx` | Visa texten **Provmiljö** i sidhuvudet. Märkningen ligger utanför den fällbara sidomenyn och syns även vid 320 px bredd. |
| Förklaring av provmaterial | `.admin-context`, `.context-demo` i `organisation-workspace.tsx` | En lugn textrad ovanför arbetsytans data: **Fiktiva skolor och elever.** Lägg aktuell lagringsförklaring intill eller på nästa rad. |
| Val av exempelskola | `.og-unit-switch`, befintligt `<select>` för skolenhet | En tydligt etiketterad väljare för båda skolorna. Visa skolnamn och skolform; bevara befintliga administrationsvyer efter valet. |
| Uppgift om exempelroll | `.profile-roles`, `.role-switch` i `page.tsx` | Använd **Prova som** som legend och **Exempelroll** i profilen. Rollval är tillgängligt bara i den uttryckliga provvägen. |
| Laddning, saknat underlag, nekad start | `.admin-empty`, `.og-loading`, `.og-card` | Ett sammanhållet tillstånd i innehållsytan med rubrik, förklaring och högst en huvudsaklig återförsöksknapp. Behåll miljömärkningen. |
| Hjälp om lagring | Befintlig hjälpdialog i `page.tsx` och `Dialog`-omslag | Återanvänd hjälpen. Titel **Om provmiljön**; visa vilken data som finns kvar efter omläsning. |
| Svar på användarhandling | `.admin-notice`, befintliga felrader | Textnära status med ikon. Återanvänd struktur, men visa endast bekräftad status. Fel försvinner inte automatiskt innan de åtgärdats eller stängts. |

Behåll ljus arbetsyta, mörkblå sidomeny, befintliga tabeller och kort, samt sidomenyns bredd `15.5rem`. Nya statuspaneler använder `var(--card)`, `var(--border)` och `var(--radius)`. Ingen ny översikt med mätkort, introduktionsguide eller dekorativ illustration behövs för denna fas. Den synliga informationen ska hjälpa användaren välja skola och förstå vad som händer med ändringarna.

**Visuell fokusordning:** Den aktiva skolans arbetsyta och dess huvudsakliga verksamhetshandling är blickfång. Skolväljaren är nästa orienteringspunkt. Provmiljömärkning och lagringsförklaring ska vara lätta att hitta men använder neutral, mindre framträdande form så att de inte konkurrerar med arbetsuppgiften. Vid blockerad start är panelens rubrik och förklaring det enda blickfånget.

**Visual assets:** Ingen ny bild, logotyp, fotografi, emoji eller bildgenerering. Återanvänd `School`/`GraduationCap` för skola, `Info` för förklaring, `AlertTriangle` för fel och `CheckCheck` för bekräftat resultat. Ikoner är 16 eller 20 px med befintlig Lucide-stil; dekorativa ikoner har `aria-hidden="true"`. Ikoner ersätter inte synliga ord.

## Spacing Scale

Följande skala gäller endast fasens nya eller ändrade miljömärkning, väljare och tillståndspaneler. Befintliga verksamhetsytor får ingen generell omformatering.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Mellan etikett och kort hjälprad. |
| sm | 8px | Ikon/text och avstånd mellan intilliggande kontroller. |
| md | 16px | Standardgap, mobilpanelens inre avstånd och sidmarginal. |
| lg | 24px | Panelpadding på dator och avstånd mellan innehållsgrupper. |
| xl | 32px | Avstånd före en fristående start-/felpanel. |
| 2xl | 48px | Större vertikalt tomrum vid blockerad start. |
| 3xl | 64px | Högsta inre vertikala luft i ett fristående tomt tillstånd. |

**Exceptions:** Kontrollhöjd och minsta pekyta är 44 px, en multipel av fyra. Kantlinjer, fokuslinjer, ikonstreck och befintlig hörnradie är inte avståndstoken. Inga ytterligare avstånd införs för nya ytor.

## Typography

Exakt fyra storlekar och två vikter används i fasens nya/ändrade hjälpyta. Befintliga verksamhetsrubriker och tabellers typografi ligger kvar utanför denna avgränsning.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px / 1rem | 400 | 1.5 |
| Label | 14px / 0.875rem | 500 | 1.5 |
| Heading | 20px / 1.25rem | 500 | 1.2 |
| Display | 28px / 1.75rem | 500 | 1.2 |

Display används endast som sidans huvudrubrik när starten är blockerad. Hjälp- och felpaneler använder Heading. Korta metadata- och statusrader får använda Label-storlek med vikt 400; knappar och miljömärkning använder vikt 500. Fälts inmatade värden är 16 px även på telefon. Rubriker och skolnamn får bryta rad; viktig text får inte förkortas med ellips. Inga versaler, glesade bokstäver eller extra små bokstäver tillförs i miljöförklaringen.

## Color

Återanvänd exakta befintliga token i `web/app/globals.css`. Fördelningen är en kompositionsregel för neutrala ytor och liten accentandel, inte ett krav på pixelmätning av varje skärm.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f7f8fa` — `--background` | Ljus arbetsbakgrund och mellanrum. |
| Secondary (30%) | `#ffffff` — `--card`; `#152237` — `--sidebar` | Vita arbetskort och bevarad mörk sidomeny. Neutralt stödunderlag: `#edf0f6` — `--secondary`. |
| Accent (10%) | `#365ce6` — `--primary` | Befintlig huvudsaklig verksamhetsknapp och återförsöksknapp där ett säkert återförsök finns. |
| Destructive | `#b83737` — `--destructive` | Uttrycklig destruktiv bekräftelse i befintliga borttagningsflöden. Ingen ny återställningsåtgärd läggs till. |

**Accent reserved for:** En primär knapp i aktuell handlingsgrupp, befintlig vald navigation/valt alternativ med dess tokenpar samt tangentbordsfokus med `--ring: #4469ee`. Befintlig vald diskret yta får använda `--accent: #edf1ff` och `--accent-foreground: #2d4cc1`. Miljömärkning, lagringsförklaring, skolformer, räknare och vanliga kort är neutrala. Ingen separat färgkod för grundskola respektive gymnasium.

Brödtext använder `--foreground: #202b3b`; sekundärtext `--muted-foreground: #657185` på vit eller ljus bakgrund. Sidomenyn behåller `--sidebar-foreground: #c8d1df`. Ny feltext använder tydliga ord och `AlertTriangle` på neutral yta, inte enbart färg. Ett synligt kontrollområde måste gå att urskilja; använd `--muted-foreground` för en nödvändig kontrollgräns när den bleka dekorativa `--border` inte räcker.

Krav för ändrade ytor: minst 4,5:1 mellan all text och dess faktiska bakgrund, även hjälptext; minst 3:1 för nödvändiga kontrollgränser och fokusmarkering. Detta är ett verifieringskrav, inte en uppgift om att alla äldre appfärger redan klarar kontrastprov. W3C beskriver trösklarna för text i [Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html).

## Copywriting Contract

Text inom klamrar hämtas ur det aktuella syntetiska underlaget. Visade namn och antal ska motsvara innehållet. Tekniska lägesnamn, anslutningsnycklar, databashostar och åtkomsttoken visas inte i arbetsflödet.

| Element | Copy |
|---------|------|
| Primary CTA | **Lägg till utbildning** — bevarad verksamhetsknapp på Utbildningar. Ingen extra global primärknapp läggs till för fasen. |
| Miljömärkning | **Provmiljö** |
| Miljöförklaring | **Fiktiva skolor och elever.** |
| Skolväljarens synliga etikett | **Exempelskola** |
| Skolväljarens alternativ | **{skolnamn} — Grundskola** och **{skolnamn} — Gymnasium** |
| Exempelroll | Legend **Prova som**. Profil **{rollnamn} · Exempelroll**. |
| Rollförklaring i hjälpen | **Du kan prova olika arbetsroller. Rollvalet är ett exempel och ger ingen åtkomst till en verklig skola.** |
| Lagring i sidans minne | **Ändringar gäller medan sidan är öppen. Vid omläsning börjar exemplet om.** |
| Omfattning av sessionsdata | **Elever, studieplaner, grupper, schema och planeringsunderlag är exempel. Ändringar försvinner vid omläsning.** |
| Kort lagringsstatus utan pågående skrivning | **Ändringar gäller tills sidan laddas om** |
| Pågående laddning | **Hämtar provmaterial…** |
| Pågående skrivning | Ej tillämpligt i den klientbaserade provvyn. Minnesändring får ingen indikator som antyder databaslagring. |
| Empty state heading | **Inga exempelskolor att visa** |
| Empty state body | **Provmaterialet saknas. Kontrollera att provmiljön är förberedd och försök igen.** |
| Tomt skolurval i befintligt filter | **Inga träffar för ditt urval. Välj en annan skola eller rensa filtret.** |
| Error state, misslyckad läsning | **Provmaterialet kunde inte hämtas. Kontrollera anslutningen och försök igen.** |
| Återförsöksknapp för läsning | **Försök igen** |
| Error state, osäker lagring | **Ändringen kunde inte bekräftas. Ditt utkast finns kvar här. Kontrollera anslutningen innan du försöker spara igen.** — används bara när utkastet faktiskt behålls. |
| Error state, återläst tidigare värde | **Ändringen kunde inte sparas. Det tidigare värdet visas. Kontrollera anslutningen och försök igen.** — används endast när återläsningen bekräftar det tidigare värdet. |
| Blockerad start, rubrik | **Arbetsytan är inte tillgänglig ännu** |
| Blockerad start, text | **Den här miljön är inte klar för åtkomst. Följ projektets startanvisning för att öppna provmiljön.** |
| Hjälpknappens tillgängliga namn | **Om provmiljön** |
| Hjälpdialog | Titel **Om provmiljön**. Inledning **Här kan du prova administration med fiktiva skolor och elever. Grundskola och gymnasium har varsin exempelskola.** Följ med aktuell lagringsförklaring och rollförklaring ovan. |
| Dialogstängning | **Stäng hjälpen**; befintlig hjälpdialogs ikon får också detta tillgängliga namn. |
| Destructive confirmation | **Ej tillämpligt som ny funktion:** fasen tillför ingen knapp som tömmer databas, återställer kunddata eller raderar provmiljön. Befintliga borttagningsflöden behåller objektets namn och konsekvens i sin bekräftelse. |

### Behavioral contract

1. **Miljö före innehåll:** Miljömärkning och förklaring ska finnas när innehållet först visas, även i laddnings-, fel- och tomt tillstånd. En misslyckad kontroll får inte visa en kort glimt av skyddad arbetsyta. Miljötexten hämtas från den faktiska startvägens tillstånd; användaren kan inte öppna skyddad åtkomst genom ett roll- eller skolval.
2. **Båda skolformerna:** Väljaren visar en egen exempelskola för grundskola och en för gymnasium. Efter ett val stämmer skolnamn, skolform, tillgängliga utbildningar och timplansunderlag överens. I elev-, grupp- och klassförslag används samma skolkontext; byt inte bara rubriken ovanför oförändrade gymnasiedata. Exakt antal fixturer bestäms i fasplanen inom D-03.
3. **Begripligt skolbyte:** Välj skola i befintlig arbetsyta, utan att tvingas hitta en återknapp som heter ”mina skolor”. Byte mellan exempelskolor bevarar redan gjorda exempeländringar under den öppna sidans livslängd. Ett skolbyte ska inte i sig återskapa fixturer eller tömma en skolas utkast. En aktiv modal stängs eller bekräftas innan skolväljaren kan nås.
4. **Sann lagringsstatus:** Fasens användbara provvy håller data i sidans minne. Använd minnestexten ovan och visa inte ”Sparat i databasen”. Befintliga databasflöden kan undersökas i separata regressionsprov; där räcker en konfigurerad anslutning inte för ”Sparat”, och ett av flera avslutade anrop bekräftar inte hela ändringen. Obekräftad eller delvis misslyckad skrivning ska redovisas som fel. Sparningsrisker får ägarskap i regressionsrapporten; denna fas behöver ingen ny allmän sparningsdialog för en minnesbaserad vy.
5. **Tomt, misslyckat och spärrat hålls isär:** En tom läsning är ett tomt tillstånd. En nekad start är en blockerad arbetsyta. Ingendera skapar automatiskt exempeldata, startar anonym inloggning eller byter till en annan anslutning. ”Försök igen” får bara återförsöka den avsedda, tillåtna läs-/startkontrollen. Visa knappen bara om ett återförsök kan hjälpa.
6. **Inga påhittade produktionsbesked:** Använd inte ”Inloggad”, ”Behörig rektor”, ”Kommun ansluten” eller ”Säker pilot” som status för denna fas. Ingen verklig elevdata, pilotkund, integration eller driftacceptans antyds av fiktiva namn och exempelroller. Arbetsytan som ännu saknar säker kontoåtkomst stannar i blockerad status.
7. **Bevarade verksamhetsflöden:** Utbildning, kurs-/nivåtillägg, ny elevkull och koppling till fastställd timplansversion använder befintliga kontroller och beslutsordning. Ny kull är en fristående kopia av upplägget; klasskopplingen byter inte version när en ny plan fastställs. Dessa flöden är provfall för baslinjen och byggs inte om som en ny produktdel i fas 1.

Samordning med fasresearch 2026-09-11: användbar syntetisk klientvy utan Supabase-klient och en separat stängd skyddad målmiljö fram till senare kontoarbete. Befintliga molnvariabler får inte utlösa en reservanslutning. Exakta tekniska lägesnamn och byggvägar fastställs i RESEARCH/PLAN; detta UI-kontrakt inför inga egna miljövariabler eller driftval.

## Responsive and Accessibility Contract

| Område | Mätbart krav för fasens ändrade ytor |
|--------|------------------------------------|
| Dator | Pröva 1440 × 900 CSS px. Bevara befintlig sidomeny och arbetsyta. Miljömärkning, aktiv skola och lagringsförklaring får inte överlappa navigeringen eller huvudsaklig handling. |
| Telefon | Pröva 390 × 844 och 320 × 740 CSS px. Miljömärkning syns även med stängd sidomeny. Väljaren använder tillgänglig bredd; namn och hjälptext bryter rad. Vid behov går sidhuvudets innehåll över på fler rader i stället för att förminska texten. |
| Brytpunkter | Behåll mobil sidomeny under 768 px enligt `use-mobile.ts`; återanvänd befintliga 1050/700 px-brytpunkter för administrativa ytor. Skapa ingen separat mobilapp. |
| Förstoring | Vid 200 % textförstoring får inga etiketter eller kontroller klippas. Vid motsvarande 320 CSS px bredd får fasens text och kontroller inte kräva sidledsrullning. |
| Timplanstabell | Bevara ett eget avgränsat horisontellt rullområde. Tabellen får rulla utan att hela arbetsytan blir bredare. En fokuserad redigerbar cell ska kunna rullas fram och får inte täckas av den låsta ämneskolumnen. |
| Pekytor | Alla nya/ändrade fristående knappar, skolval, rollval och dialogstängningar är minst 44 × 44 CSS px. Minst 8 px mellan fristående kontroller. Använd inte komponenternas 24/28/32 px ikonvarianter oförändrade i dessa ytor. |
| Tangentbord | Tab/Shift+Tab når allt i logisk visuell ordning. Native select behåller tangentbordsfunktion; knappar fungerar med Enter/Space. Ingen automatisk fokusflytt vid laddning eller lagringsstatus. |
| Fokus | Synligt fokus med 3 px `--ring` och 4 px offset på fasens kontroller, inklusive native select. I mörk sidomeny används `--sidebar-ring`. Förälders overflow får inte klippa fokusringen. |
| Dialog | Återanvänd Base UI-dialogens fokusfälla och Escape-stängning. Ge titel och beskrivning, håll innehållet inom `90dvh` med intern rullning och minst 16 px skärmmarginal. Stängning återför fokus till öppnande kontroll. Inga engelska ”Close” i den berörda dialogen. |
| Landmärken | Bevara `lang="sv"`, `main#workspace` och länken **Till innehållet**. Startblockering har en h1; en arbetsyta har sin befintliga h1 och paneler h2. |
| Status | Ny laddnings-/resultatstatus använder `role="status"`/`aria-live="polite"`; laddande region använder `aria-busy`. Ett nytt handlingsfel använder `role="alert"`. Statisk provmiljöförklaring är vanlig text, inte en återkommande avisering. |
| Minskad rörelse | Bevara befintlig `prefers-reduced-motion: reduce`. Ingen ny animation behövs; laddning ska vara begriplig även utan en roterande ikon. |

320 px-kravet och undantaget för tabeller följer [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html). 44 px är projektets val för lättanvända telefonkontroller; det är strängare än det generella 24 px-minimum med undantag i [W3C Target Size (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html). Maskinläsbar status utan fokusflytt stöds av [W3C Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). Dessa är design- och provkrav; dokumentet påstår inte att hela appen redan är WCAG-granskad.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Inga nya block. Återanvänd lokala Button, Dialog, Input och Sidebar samt befintligt native select. | Nyhämtning inte tillämplig. 2026-09-11: `components.json`, Button- och Dialog-källor lästa; befintligt komponentlager identifierat. |
| Tredjepartsregister | Inga. | 2026-09-11: `components.json` har `registries: {}`; inga externa block införs av kontraktet. Vetting av nytt block är därför inte tillämplig. |

Detta är belägg för fasens registry-användning, inte en säkerhetsrevision av samtliga äldre beroenden. Om en senare implementation vill införa ett nytt externt block krävs separat källgranskning innan det läggs till kontraktet.

## Acceptance Evidence for Execution

Efter implementation dokumenteras skärmbild/observation, revision, läge och resultat för varje prov. En skärmbild bevisar layout; nätverks- och databasprov bevisar skyddsgränsen separat.

1. Öppna provmiljön på dator och telefon. Läs miljömärkning och lagringsförklaring utan att öppna sidomenyn.
2. Välj grundskolan, öppna utbildning och timplan, gör en exempeländring, välj gymnasiet och återvänd. Skolkontexten stämmer och ändringen finns kvar i den öppna sidan. Pröva elev-/klassförslag i båda skolorna med exempelrollen rektor.
3. Gör tillämpligt kull- och klasskopplingsprov. Dokumentera gymnasiets kurs-/nivåflöde och grundskolans motsvarande tillämpliga planflöde var för sig. En fungerande skolväxlare bevisar inte hela verksamhetsflödet.
4. Ladda om och kontrollera att exempeländringarna börjar om enligt lagringsförklaringen. Den gamla arbetsversionens eventuellt beständiga data får inte läsas, ändras eller tömmas av provvyn.
5. Visa tomt underlag, misslyckad läsning och blockerad start utan dold seedning eller tyst anslutningsbyte. Avvisad start ska aldrig visa skyddat innehåll eller exempelroll som behörighetsväg.
6. Genomför skolval och hjälpdialog med tangentbord, synligt fokus, 200 % text och 320 px bredd. Kontrollera telefonens pekytor och tabellens avgränsade rullning.
7. Kontrollera att minnesändringar inte visar ”Sparar”/”Sparat i databasen” eller orsakar databastrafik. Fördröjda och avvisade skrivningar i den äldre databasvägen hör till separata baslinjeprov; deras fel får inte redovisas som godkänd lagring genom enbart UI-text.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS

**Approval:** approved 2026-09-11 — GSD:s UI-granskare godkände samtliga sex dimensioner efter precisering av fokusordning och ”Stäng hjälpen”. Ingen UI-implementation eller körverifiering utförd av denna research.
