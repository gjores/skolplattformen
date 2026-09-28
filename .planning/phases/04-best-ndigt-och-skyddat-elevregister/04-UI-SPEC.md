---
phase: 4
slug: best-ndigt-och-skyddat-elevregister
status: approved
reviewed_at: 2026-09-28
shadcn_initialized: true
preset: base-nova (b2fA)
created: 2026-09-28
---

# Phase 4 — UI Design Contract

> Visuellt kontrakt och beteendekontrakt för elevregistret i den skyddade provmiljön. Avser fasens nya och ändrade ytor: vyn **Elever** (elevlista och elevkort), läsårsväljaren i sidhuvudet, ändringsdialoger, konflikt- och avvikelsevyer samt export. Befintliga utbildnings-, kurs-, kull- och timplansflöden, exempelläget från fas 1 och fas 3:s mandat-, logg- och kundvyer behåller form och navigation.

## Omfattning och källor

Fas 4 omfattar STU-01–STU-06, DATA-01 och DATA-02. UI-arbetet gör registret användbart från sökning till sparad ändring och omläsning, med skyddade uppgifter som inte syns för den som saknar behörighet. Endast syntetiska uppgifter; ingen verklig registerkälla ansluts. Servern är säkerhetsgränsen. Menyer, dolda knappar och klientfilter är bekvämlighet.

| Källa | Beslut som används |
|-------|--------------------|
| `04-CONTEXT.md` D-01–D-03 | Minimala basuppgifter. Personnummer visas bara i elevkortet på uttrycklig begäran och loggas. Skyddad elev: namn/personnummer bara för behörig administratör på placeringsskolan, annars anonymt visningsnamn och inga sökträffar. |
| `04-CONTEXT.md` D-04–D-07 | En aktiv placering per datum, framtida och avslutade placeringar som historik. Klassbyte bevarar historik och byter inte utbildning. Hemkommun är daterad. Läsårsväljare `‹ 26/27 ›` i sidhuvudet, årskurs `läsår − startår + 1`. |
| `04-CONTEXT.md` D-08–D-11 | Ursprung per fält, synlig avvikelse mot källa, nekad sparning vid samtidig ändring med val per fält, historik per fält för administratör. |
| `04-CONTEXT.md` D-12–D-15 | Serverstyrd lista, åtskillnad med födelsedatum + klass + skola, urvalet i adressen men **inte** sökordet, export med uttryckligt fält- och elevval. |
| `03-UI-SPEC.md`, `01-UI-SPEC.md` | Befintlig arbetsyta, Sidebar/Button/Dialog, typografi, färger, 44 px pekytor, tillståndstexter och loggfelstext. |
| Kod läst 2026-09-28 | `web/app/{protected-home,pupil-probe-workspace,mandate-workspace,mandate-grant-dialog,context-switch,mfa-step-up,admin-workspace}.tsx`, `web/app/globals.css`, `web/components.json`, `web/lib/{admin-model,pupil-probe-model}.ts`, `docs/pilot/mandatmatris.md`. |

Ingen `CLAUDE.md` och inga projektskills under `.claude/skills/` eller `.agents/skills/`. Projektets `AGENTS.md` följs. Inga frågor ställdes till användaren: alla designfrågor besvaras av `04-CONTEXT.md` eller av tidigare fasers kontrakt. De val som är förval märks **(förval)** och kan ändras innan planering.

## Design System

| Property | Value |
|----------|-------|
| Tool | shadcn, befintlig installation i `web/`. Ingen initiering eller uppgradering. |
| Preset | `base-nova`, presetkod `b2fA` (`shadcn info`), `baseColor: neutral`, CSS-variabler, `menuColor: default`, `menuAccent: subtle`, `registries: {}`. |
| Component library | Base UI genom lokala omslag i `web/components/ui/`; `@base-ui/react@1.7.0` installerad. |
| Icon library | `lucide-react@1.31.0`. |
| Font | Geist Sans via `--font-geist-sans`. Ingen ny font. |

## Component Inventory

Enumerated by `cd web && ./node_modules/.bin/shadcn info` — 60 components — shadcn@4.18.0 (komponentbas @base-ui/react@1.7.0) — 2026-09-28.

Tabellen är en icke uttömmande lista över komponenter som passar fasen. Andra installerade komponenter (t.ex. `combobox`, `tabs`, `sheet`, `tooltip`) får användas om de uppfyller tillgänglighets- och pekytekraven nedan. Befintliga skyddade vyer använder native `<select>`, `<input>` och `<fieldset>` i `.protected-form`/`.protected-filter`; fortsätt med det mönstret för formulärfält.

| Component | Import path | Notes |
|-----------|-------------|-------|
| Button | `@/components/ui/button` | Alla knappar. Standardhöjden är mindre än 44 px; lägg vyns omslagsklass (se nedan) så att `min-height:44px` gäller, som `.probe-workspace`/`.mandate-workspace`. |
| Dialog, DialogTitle, DialogDescription, DialogClose, DialogContent | `@/components/ui/dialog` | Ändrings-, konflikt-, avslut- och exportdialoger. Följ `mandate-grant-dialog.tsx`: `initialFocus` på dialogytan, `showCloseButton={!saving}`, klasserna `mandate-dialog pupil-register-dialog` (90dvh, intern rullning; den andra klassen bär fasens avstånds- och kontrastregler, eftersom dialogen renderas utanför vyns omslag). |
| Sidebar, SidebarMenuButton m.fl. | `@/components/ui/sidebar` | Befintlig navigation i `protected-home.tsx`. Ingen ny ram. |
| Table, TableHeader, TableBody, TableRow, TableHead, TableCell, TableCaption | `@/components/ui/table` | Elevlistan på dator (> 800 px) med klasserna `admin-table protected-table`. |
| Checkbox | `@/components/ui/checkbox` | Markering för export. Ligger i en `<label>` med minst 44 px höjd (mönster `.mandate-check`). |
| Badge | `@/components/ui/badge` | Neutrala statusmärken: Aktiv/Kommande/Avslutad, Aktuell/Framtida/Avslutad, Skyddade personuppgifter, Avvikelse. Variant `outline`; alltid med text. |
| Collapsible, CollapsibleTrigger, CollapsibleContent | `@/components/ui/collapsible` | Historik i elevkortet, stängd som standard. |
| NativeSelect, NativeSelectOption | `@/components/ui/native-select` | Får ersätta rå `<select>` om 44 px höjd och fokusring behålls. Annars rå `<select>` som i fas 3. |
| MfaStepUpNotice | `web/app/mfa-step-up.tsx` (projektkomponent) | Visas i dialogen eller elevkortet när servern svarar `mfa_required`. |
| ContextSwitch | `web/app/context-switch.tsx` (projektkomponent) | Oförändrad. Läsårsväljaren placeras intill den. |

Omslagsklass för vyn: `admin-workspace protected-admin pupil-register` (ny klass `pupil-register` bär 44 px-, fokus- och kontrastreglerna i detta kontrakt). Undvik de befintliga klassnamnen `register-layout`/`register-surface`/`register-toolbar`, som tillhör exempelläget.

## Informationsarkitektur och skärmar

### Navigation och sidhuvud

- **Menypost Elever** (`Users`, 19 px) ersätter den stängda posten ”Elever” för funktioner som har elevläsning enligt servern (rektor, skoladministratör, lärare, elevhälsa, support). Posten **Syntetiskt elevprov** tas bort ur navigationen när registret ersätter elevprovet som datakälla. Startvy för dessa funktioner blir Elever i stället för elevprov. Övriga stängda poster (Utbildningar, Poängplaner, Timplaner, Klasser och läsår) är oförändrade.
- Sidhuvudets brödsmula visar `Arbetsyta › Elever`. I elevkortet: `Arbetsyta › Elever › Elevkort`.
- **Läsårsväljare** i `.top-actions`, före uppdragsväljaren: `‹ 26/27 ›`. Den består av en grupp (`role="group"`, `aria-label="Läsår"`) med knappen *Föregående läsår* (`ChevronLeft` 20 px, 44 × 44), en synlig etikett **Läsår** och native `<select id="lasar">` med alternativen `25/26`, `26/27` … samt knappen *Nästa läsår* (`ChevronRight`, 44 × 44). Värdet är läsårets startår. Aktuellt läsår märks `26/27 (nu)` i listan. Servern anger vilka läsår som finns och vilket som är aktuellt. Vid första eller sista läsåret är motsvarande pilknapp inaktiv (`disabled`) och får sin tillgängliga text utan läsårsnamn.
- Läsårsväljaren visas för funktioner som har vyn Elever, på alla deras vyer **(förval)**. Den visas inte för kundadministratör, granskare, IT, huvudman eller elevhälsoansvarig, eftersom den inte styr något i deras vyer i fas 4. I fas 4 styr den bara elevlistan. Hjälpdialogen *Om den skyddade provmiljön* får en mening om läsåret (se copy).

### Adress och återgång (D-14)

- Urvalet ligger i adressen: `?vy=elever&lasar=2026&skola={skol-ID}&klass={klass-ID}&utbildning={utbildnings-ID}&ak={n}&status={aktiv|kommande|avslutad}&sida={n}`. Parametrar med standardvärde utelämnas. Varje ändring av läsår, skola, filter eller sida skapar en ny historikpost (`pushState`), så att bakåtknappen går till föregående urval. Omladdning ger samma lista.
- **Sökordet ligger aldrig i adressen.** Det hålls i flikens `sessionStorage` under en nyckel som är knuten till uppdrag och epok. Sökningen skickas i anropets kropp (POST), inte som frågesträng, så att namn och personnummer inte hamnar i webbläsarhistorik eller åtkomstloggar.
- Öppet elevkort läggs **inte** i adressen **(förval)**. Att öppna elevkortet skapar en historikpost med samma adress och ett tillstånd i `history.state`. Bakåtknappen stänger elevkortet och återgår till samma lista, sida och fokus. Omladdning i elevkortet visar listan med samma urval.
- Vid byte av uppdrag, utloggning eller spärr tas registerparametrarna bort ur adressen (`replaceState` till `/`). Sökordet, exportmarkeringen och visat personnummer rensas också.
- Servern prövar varje parameter. En skola, klass eller utbildning som inte ingår i uppdraget ger samma svar som ett okänt värde. Då visas hela läsårets lista för uppdragets första skola och en allmän text (se copy). Texten avslöjar inte om värdet finns.
- Verifiering med engångskod (`startStepUp(returnTo)`) får `returnTo` = aktuell adress med urvalet, men utan sökord.

### Skärm 1 — Elevlista

Ordning uppifrån:

1. **Rubrikblock** (`.admin-heading`): kicker **SKYDDAD PROVMILJÖ · SYNTETISKA UPPGIFTER**, h1 **Elever**, underrad `{kundnamn} · {uppdragsetikett}`.
2. **Ingress** (en mening, se copy).
3. **Omfattning** (`dl.mandate-facts.probe-scope`): Uppdrag, Omfattning (`Skola`/`Tilldelade grupper`/`Tilldelade elever`/`Tilldelade ärenden` · skolnamn), för support även Godkänt av, Syfte och Upphör. Samma innehåll som elevprovet.
4. **Status- och felregion**: `output.admin-notice` (bekräftelser, `role="status"`) och `output.validation-warning` med `role="alert"` (fel). En felruta åt gången. Ingen automatisk stängning.
5. **Sök och filter** (`form.protected-filter`, 3 kolumner på dator, 1 kolumn ≤ 800 px):
   - **Skola** (select) om uppdraget har fler än en skola. Med en skola visas skolnamnet som text i omfattningen.
   - **Sökord** (text, 16 px, `autocomplete="off"`, `spellcheck="false"`). Hjälptext under fältet anger vad man kan söka på för funktionen. Knapparna **Sök elever** (primär) och **Rensa sökningen** (outline, bara när ett sökord gäller).
   - **Klass**, **Utbildning**, **Årskurs**, **Status** (select, första alternativet ”Alla …”). Ett ändrat filter hämtar listan direkt. Fritext hämtas först vid **Sök elever** eller Enter.
   - **Rensa filter** (outline) visas när minst ett filter är aktivt.
   - Elevhälsa med ärendeomfattning får i stället fas 3:s mönster: select **Tilldelat ärende** och knappen **Visa ärendets elev**.
6. **Åtgärdsrad** (`.mandate-actions`): **Hämta aktuellt läge** (outline) och, när servern anger exporträtt, **Exportera urval…** (outline, `Download` 16 px). Vid markering visas även en rad `{n} elever markerade` med **Avmarkera alla**.
7. **Resultatrubrik**: h2 `Elever läsåret {26/27}` och en statusrad `{n} elever · sida {s} av {m}` (`role="status"`, `aria-live="polite"`).
8. **Lista**:
   - **Dator (> 800 px)**: tabell med kolumnerna [Markera] (bara med exporträtt), **Elev**, **Klass**, **Utbildning**, **Åk**, **Status**. Cellen Elev innehåller en knapp med elevens visningsnamn (500, 16 px) och en särskiljande rad (14 px, `--muted-foreground`). Hela namnknappen öppnar elevkortet. Ingen radklickyta utöver knappen. Tabellen ryms utan sidledsrullning från 801 px; texten bryter rad.
   - **Telefon (≤ 800 px)**: `ul` med ett kort per elev (`.protected-card`, 16 px padding): markering (vid exporträtt) till vänster, namnknapp och särskiljande rad, därefter `Klass · Utbildning · åk {n}` och statusmärket. Ingen tabell och ingen sidledsrullning.
   - **Särskiljande rad (D-13)**: administratör `Född {ÅÅÅÅ-MM-DD} · {klass} · {skola}`. Lärare och andra utan födelsedatum: `{klass} · {skola}`. Raden visas alltid, inte bara vid namnlikhet.
   - Märken i listan: **Avvikelse** (bara för administratör, när en uppgift avviker från källan) och **Skyddade personuppgifter** (bara för behörig administratör). Utan behörighet visas inget märke och inget annat som skiljer raden från andra.
   - Sortering: efternamn, förnamn, födelsedatum. Servern sorterar. Ingen sorteringskontroll i fas 4.
9. **Sidindelning**: 50 elever per sida **(förval)**. Knapparna **Föregående sida** och **Nästa sida** (outline, 44 px) med texten `Sida {s} av {m}`. Antal och sidor räknas på servern efter behörighetsfiltrering.

### Skärm 2 — Elevkort

Elevkortet ersätter listan i samma `main` på alla skärmstorlekar. Det öppnas inte som sidopanel. Enspalt, `max-width: 960px`, 24 px mellan kort.

1. **Tillbaka**: knapp **Tillbaka till elevlistan** (`ArrowLeft` 16 px, outline) överst.
2. **Rubrikblock**: kicker **SKYDDAD PROVMILJÖ · SYNTETISK ELEV**, h1 = visningsnamn (`tabIndex=-1`, får fokus när kortet öppnas), statusmärke, och för behörig administratör märket **Skyddade personuppgifter** (`ShieldAlert` 16 px). Under rubriken: `Elev-ID {internt ID}`.
3. **Skyddsruta** (bara för behörig administratör och bara för skyddad elev): neutral ruta med text om hantering (se copy).
4. **Avvikelsesammanfattning** (bara administratör, när minst en avvikelse finns): `.validation-warning` med antal och knappen **Gå till avvikelsen**, som flyttar fokus till första avvikelsepanelen.
5. **Kort Basuppgifter** (h2): `dl.mandate-facts` med Namn, Födelsedatum, Personnummer, Hemkommun, Elev-ID. Under varje värde en ursprungsrad (14 px, `--muted-foreground`). Personnummer visas maskerat `ÅÅÅÅMMDD-••••` med knappen **Visa personnummer**. Efter visning står hela numret där och knappen blir **Dölj personnummer**. Åtgärder: **Ändra basuppgifter**, **Registrera ny hemkommun**. Hemkommunens perioder visas som lista under faktarutan: `{kommun} ({kommunkod}) · {från} – {till | tills vidare}`.
6. **Kort Skolplacering** (h2): tre grupper med h3 **Aktuell**, **Framtida**, **Avslutade**. Varje placering är en rad (`.protected-assignment`): `{skola} · {utbildning}` och `{från} – {till | tills vidare}`. En tom grupp visar en kort text (se copy). Åtgärder: **Registrera skolbyte**, **Byt utbildning**, **Avsluta placering**.
7. **Kort Klasstillhörighet** (h2): aktuell klass överst (`{klass} · från {datum}`), därefter h3 **Tidigare klasser** med rader `{klass} · {utbildning} · {från} – {till}`. Åtgärd: **Byt klass**.
8. **Kort Historik** (h2, administratör): `CollapsibleTrigger` **Visa ändringshistorik** / **Dölj ändringshistorik** (`History` 16 px). Innehållet hämtas först vid öppning, som egen loggad läsning. Lista med nyaste först, 20 poster och **Visa fler ändringar**. Varje post: `{uppgift}: {från} → {till}` samt `{aktör} · {tid} · Källa: {källa}`. Rader om skyddade uppgifter tas bort av servern för den som inte får se dem; UI:t visar ingen ersättningsrad.

**Fält som servern inte returnerar visas inte alls.** Det blir ingen tom rad, inget ”dolt” och inget streck. Undantaget är personnumrets maskering för administratör som får visa numret. Lärare, elevhälsa, support och rektor ser därför ett kortare elevkort med Namn/visningsnamn, Skola, Klass, Utbildning, Årskurs och Status, utan åtgärder och historik, om servern inte anger annat.

Varje åtgärd visas bara när serverns svar anger rättigheten (t.ex. `capabilities.edit`, `capabilities.export`, `capabilities.revealPersonnummer`). Servern prövar ändå varje anrop.

### Dialoger

Alla dialoger: titel, beskrivning, fält med synliga etiketter, fältfel direkt under fältet (`.field-error`, `aria-invalid`, `aria-describedby`), en sammanfattande felregion överst (`role="alert"`), en primär sparknapp och en avbrytknapp (outline) med verb + objekt. I ändringsdialogerna och konfliktvyn heter den **Stäng utan att spara**, i exportdialogen **Avbryt exporten** och i bekräftelsen Avsluta placering **Behåll placeringen**. Ingen knapp heter bara ”Avbryt”. Inmatningen bevaras vid serverfel. Dialogen registrerar osparade ändringar (`useUnsavedChanges`), så att uppdragsbyte och utloggning frågar först. Stängning är spärrad bara medan sparningen pågår.

| Dialog | Fält | Primär knapp | Särskilt |
|--------|------|--------------|----------|
| Ändra basuppgifter | Förnamn, Efternamn, Nytt personnummer (tomt = oförändrat) | **Spara ändringarna** | Personnumret förifylls inte, så att dialogen inte visar hela numret. Status redigeras inte; den följer skolplaceringen **(förval)**. |
| Registrera ny hemkommun | Kommun (select, sorterad på namn, kommunkod i alternativet), Gäller från | **Spara hemkommunen** | Beskrivning: den tidigare perioden avslutas dagen före. |
| Registrera skolbyte | Ny skola (bara skolor i uppdraget), Utbildning (utbud på vald skola), Startdatum, Klass på nya skolan (valfri) | **Spara skolbytet** | Text om att nuvarande placering avslutas dagen före startdatum. Båda ändringarna sparas i en transaktion. |
| Byt utbildning | Ny utbildning (samma skola), Gäller från | **Spara utbildningsbytet** | Det uttryckliga beslutet enligt D-05. Text: klasstillhörigheten ändras inte. |
| Avsluta placering | Slutdatum (sista dag) | **Avsluta placeringen** | Bekräftelse med konsekvens (se copy). Ingen röd färg; historiken bevaras. |
| Byt klass | Ny klass (klasser på placeringsskolan), Gäller från | **Spara klassbytet** | Tillhör klassen en annan utbildning visas en varning i dialogen före sparning. Sparning är tillåten; utbildningen ändras inte. |
| Exportera elevurval | Urval (radio: Markerade elever / Alla elever i urvalet), Fält (kryssrutor), Personnummer (egen kryssruta), Skyddade elever (egen kryssruta, bara för behörig) | **Exportera {n} elever (CSV)** | Se beteendekontrakt 6. |

## Spacing Scale

Skalan gäller fasens nya ytor: läsårsväljare, filterrad, lista, elevkort, dialoger, konflikt- och avvikelsepaneler.

| Token | Value | Usage |
|-------|-------|-------|
| xs | 4px | Mellan värde och dess ursprungsrad; mellan etikett och hjälptext. |
| sm | 8px | Ikon och text; mellan läsårsväljarens knappar och select; mellan märken. |
| md | 16px | Standardgap i filterrad och faktarutor; kortpadding på telefon; minsta avstånd mellan fristående knappar i en rad. |
| lg | 24px | Mellan kort i elevkortet; kortpadding på dator för nya kortklasser; avstånd till resultatrubrik. |
| xl | 32px | Före sidindelningen; före en fristående tom- eller feltext i innehållsytan. |
| 2xl | 48px | Vertikal luft i tomt tillstånd för hela listan. |
| 3xl | 64px | Används inte i fas 4. |

**Exceptions:** Kontrollhöjd och minsta pekyta är 44 px (multipel av 4). Kantlinjer, fokusringar och hörnradie är inte avståndstoken. Inga andra undantag.

**Överstyrning av återanvända klasser.** Flera återanvända klasser har befintliga mått utanför skalan. Inom `.pupil-register` och `.pupil-register-dialog` överstyrs de till skalan. Samma klasser i fas 3:s vyer (Mandat, Säkerhetslogg, Kundadministration) ändras inte.

| Klass | Befintligt | I `.pupil-register` / `.pupil-register-dialog` |
|-------|-----------|-----------------------------------------------|
| `.protected-admin` | gap 20 px | gap 24 px (lg) |
| `.admin-heading` | margin-bottom 23 px | margin-bottom 24 px (lg) |
| `.protected-card` | padding 22/24 px; ≤ 800 px 18/14 px | padding 24 px; ≤ 800 px 16 px (md) |
| `.protected-card>h2` | margin-bottom 18 px | margin-bottom 16 px (md) |
| `.protected-filter`, `.protected-form` | margin-top 22 px, padding-top 20 px, gap 16 px | margin-top 24 px, padding-top 24 px, gap 16 px |
| `.protected-form label`, `.protected-filter label` | gap 7 px | gap 8 px (sm) |
| `.mandate-actions` | gap 12 px, margin-top 16 px | gap 16 px (md), margin-top 16 px |
| `.mandate-facts` | gap 16 px, margin 16 px 0 | oförändrat (redan på skalan) |
| `.probe-scope` | margin 12 px 0 18 px | margin 16 px 0 |
| `.protected-assignment` (placerings-, klass- och historikrader) | gap 6/12 px, padding 7 px 0 | gap 8/16 px, padding 8 px 0 |
| `.validation-warning` | padding 15/17 px | padding 16 px (md) |
| `.admin-notice` | padding 13/16 px, gap 10 px, margin-bottom 20 px | padding 16 px, gap 8 px, margin-bottom 0 (vyns gap på 24 px ger avståndet) |
| `.mandate-check` | gap 12 px | gap 16 px (md) |
| `.mandate-choice` (fieldset) | padding 12/14 px | padding 16 px (md) |

Nya klasser (`.pupil-register` och läsårsväljaren) använder bara skalans värden.

## Typography

Fyra storlekar och två vikter gäller fasens nya ytor.

| Role | Size | Weight | Line Height |
|------|------|--------|-------------|
| Body | 16px / 1rem | 400 | 1.5 |
| Label | 14px / 0.875rem | 400 (metadata, ursprung, hjälptext) · 500 (fältetiketter, knappar, märken) | 1.5 |
| Heading | 20px / 1.25rem | 500 | 1.2 |
| Display | Befintlig `.admin-heading h1`: 2.65rem, 2.3rem ≤ 1350 px, 2rem ≤ 700 px | 500 | 1.2 |

- Display är den befintliga sidrubriken i skyddade vyer och används för h1 **Elever** och elevens namn i elevkortet, så att vyn har samma storlek som Mandat och Säkerhetslogg. De tre storlekarna är sidrubrikens befintliga responsiva steg för en och samma roll, inte nya storlekar. Vikten överstyrs scoped: `.pupil-register .admin-heading h1{font-weight:500}`. Den befintliga vikten 550 finns därför inte på fasens ytor, och bara vikterna 400 och 500 renderas där. Fas 3:s vyer ändras inte. Långa namn bryter rad (`overflow-wrap:anywhere` finns redan ≤ 800 px) och förkortas aldrig med ellips.
- Heading används för korttitlar (h2, befintlig `.protected-card>h2`). h3 inom kort använder Body med vikt 500.
- Faktarutornas `dt` i `.pupil-register` får vikt 500 (scoped överstyrning av `.mandate-facts dt{font-weight:600}`).
- Kickern `.admin-kicker` i `.pupil-register` överstyrs till 14 px och `--muted-foreground`. Den befintliga storleken 12 px och färgen `#7a879b` (3,43:1) används inte i fasens nya ytor.
- Personnummer och elev-ID visas i Body med `font-variant-numeric: tabular-nums`. Ingen monospace.
- Inmatningsfält är 16 px även på telefon.

## Color

Återanvänd befintliga token i `web/app/globals.css`. Inga nya färger. Fördelningen är en kompositionsregel.

| Role | Value | Usage |
|------|-------|-------|
| Dominant (60%) | `#f7f8fa` — `--background` | Arbetsytans bakgrund och mellanrum. |
| Secondary (30%) | `#ffffff` — `--card`; `#152237` — `--sidebar`; `#f0f2f6` — `--muted` | Kort, tabell, dialoger; bevarad mörk sidomeny; neutral skyddsruta och historikposter. |
| Accent (10%) | `#365ce6` — `--primary` | Se reserverad lista nedan. |
| Destructive | `#b83737` — `--destructive` | Används inte av fasens nya ytor. Fasen har ingen radering. |

**Accent reserved for:**
1. Den enda primära knappen i en handlingsgrupp: **Sök elever** i sökformuläret och sparknappen i varje dialog (**Spara ändringarna**, **Spara klassbytet**, **Spara valda värden**, **Exportera {n} elever (CSV)** osv.).
2. Vald menypost **Elever** i sidomenyn (befintligt tokenpar).
3. Fokusmarkering: `--ring: #4469ee`, 3 px, offset 3–4 px.
4. Markerade kryssrutor och radioknappar (komponentens befintliga token).

Alla andra knappar i listan och elevkortet är outline: Tillbaka, Hämta aktuellt läge, Exportera urval…, Ändra basuppgifter, Byt klass, Registrera skolbyte, Byt utbildning, Avsluta placering, Registrera ny hemkommun, Visa personnummer, Behåll lokal rättelse, Använd källans värde. Statusmärken, skyddsmärke, avvikelsemärke och läsårsväljare är neutrala (`--foreground` på `--card`, kant `--muted-foreground`).

**Varnings- och felytor:** Återanvänd `.validation-warning` (bakgrund `#fff8e9`, kant `#efdfba`) för fel, konflikt och avvikelse, men sätt textfärgen till `--foreground` inom `.pupil-register` och dess dialoger. Den befintliga textfärgen `#987335` ger 4,10:1 och underkänns. Fel och varningar har alltid `AlertTriangle` 16 px och ord. Färg ensam bär aldrig betydelse. Bekräftelser använder `.admin-notice` (`#3d7058` på `#eaf4ef`, 5,11:1) med `CheckCheck` 16 px. Fältfel: `.field-error` (`#8a3b12`, 7,73:1) och `aria-invalid`-kant `#b45309` (5,02:1 mot vitt).

**Skyddad elev:** märket **Skyddade personuppgifter** är neutralt, inte rött eller gult, så att det inte drar blickar på en delad skärm. Skyddsrutan använder `--muted`-bakgrund och `--foreground`-text.

Uppmätta kontraster (beräknade 2026-09-28): `--foreground` på `--background` > 13:1; `--muted-foreground` på vitt 4,94:1 och på `--background` 4,65:1; `--primary` på vitt 5,48:1. `--muted-foreground` på `--muted` ger 4,40:1. Därför får sekundärtext inte ligga på `--muted`; skyddsruta och historikposter använder `--foreground`. Kontrollgränser använder `--muted-foreground` (≥ 3:1), inte `--border`.

## Copywriting Contract

Text inom klamrar hämtas från serverns svar. Datum skrivs `ÅÅÅÅ-MM-DD`, tidpunkter `ÅÅÅÅ-MM-DD tt:mm` (sv-SE, Europe/Stockholm). Läsår skrivs `26/27`. Tekniska koder, SQL-fel, tabellnamn och interna fältnamn visas aldrig. Korrelations-ID visas som `Referens: {id}` sist i felrutor.

### Kärntexter

| Element | Copy |
|---------|------|
| Primary CTA | **Spara ändringarna** (dialogen Ändra basuppgifter). Andra sparknappar har verb + objekt enligt dialogtabellen. |
| Menypost och h1 | **Elever** |
| Kicker, lista | **SKYDDAD PROVMILJÖ · SYNTETISKA UPPGIFTER** |
| Kicker, elevkort | **SKYDDAD PROVMILJÖ · SYNTETISK ELEV** |
| Ingress | **Elever som ditt aktuella uppdrag får se och som är placerade under valt läsår. Varje läsning, ändring och export registreras i säkerhetsloggen.** |
| Läsårsväljarens etikett | **Läsår** |
| Läsårsknappar, tillgängligt namn | **Föregående läsår, {25/26}** · **Nästa läsår, {27/28}**. Vid gräns: **Föregående läsår** / **Nästa läsår** (inaktiv). |
| Tillägg i hjälpdialogen | **Läsåret i sidhuvudet styr vilka elever som visas i elevlistan.** |
| Sökfält, etikett | **Sökord** |
| Sökfält, hjälptext administratör | **Namn, födelsedatum (ÅÅÅÅMMDD) eller personnummer.** |
| Sökfält, hjälptext övriga | **Namn.** |
| Sökknappar | **Sök elever** · **Rensa sökningen** |
| Avbrytknappar | Ändringsdialoger och konfliktvy: **Stäng utan att spara**. Exportdialog: **Avbryt exporten**. Bekräftelsen Avsluta placering: **Behåll placeringen**. |
| Filteretiketter | **Skola** · **Klass** · **Utbildning** · **Årskurs** · **Status**. Första alternativ: **Alla klasser** · **Alla utbildningar** · **Alla årskurser** · **Alla statusar**. |
| Statusvärden | **Aktiv** · **Kommande** · **Avslutad** |
| Rensa filter | **Rensa filter** |
| Uppdatera | **Hämta aktuellt läge** |
| Resultatrubrik | **Elever läsåret {26/27}** |
| Resultatstatus | **{n} elever · sida {s} av {m}**. En elev: **1 elev · sida 1 av 1**. |
| Sidindelning | **Föregående sida** · **Nästa sida** · **Sida {s} av {m}** |
| Kolumnrubriker | **Markera** (skärmläsartext) · **Elev** · **Klass** · **Utbildning** · **Åk** · **Status** |
| Namnknapp, tillgängligt namn | **{visningsnamn}, öppna elevkortet** |
| Särskiljande rad | Administratör: **Född {ÅÅÅÅ-MM-DD} · {klass} · {skola}**. Övriga: **{klass} · {skola}**. Saknad klass: **Ingen klass** i stället för `{klass}`. |
| Årskurs | **åk {n}**. Saknat startår: **Uppgift saknas**. |
| Märken | **Skyddade personuppgifter** · **Avvikelse** |
| Tillbaka | **Tillbaka till elevlistan** |
| Elev-ID | Etikett **Elev-ID**. Hjälptext: **Elevens ID i registret. Det ändras inte vid namnbyte, skolbyte eller nytt inloggningskonto.** |
| Personnummer, maskerat | **{ÅÅÅÅMMDD}-••••** med skärmläsartext **de fyra sista siffrorna är dolda** |
| Personnummerknappar | **Visa personnummer** · **Dölj personnummer** |
| Personnummer, hjälptext | **Visningen registreras i säkerhetsloggen.** |
| Ursprungsrad, appen | **Källa: manuell i appen · {aktör} · {tid}** |
| Ursprungsrad, simulerad källa | **Källa: simulerad källa (syntetisk) · levererad {tid}** |
| Registerägd uppgift | **Uppgiften ägs av {källa}. Rätta den där; ändringen syns här efter nästa leverans.** |
| Skyddsruta | **Eleven har skyddade personuppgifter. Visa inte uppgifterna för andra och lämna inte ut dem utan särskild prövning. Varje visning registreras.** |
| Placeringsgrupper | **Aktuell** · **Framtida** · **Avslutade**. Tom grupp: **Ingen aktuell placering.** · **Inga framtida placeringar.** · **Inga avslutade placeringar.** |
| Placeringsrad | **{skola} · {utbildning}** / **{från} – {till}** eller **{från} – tills vidare** |
| Klasstillhörighet | **{klass} · från {datum}** · rubrik **Tidigare klasser** · tomt: **Inga tidigare klasser.** · ingen klass: **Eleven har ingen klass just nu.** |
| Hemkommun | **{kommun} ({kommunkod}) · {från} – {till / tills vidare}** |
| Historik | **Visa ändringshistorik** · **Dölj ändringshistorik** · **Visa fler ändringar** · post: **{uppgift}: {från} → {till}** / **{aktör} · {tid} · Källa: {källa}** · tomt: **Inga ändringar ännu.** |

### Tomma tillstånd och laddning

| Element | Copy |
|---------|------|
| Empty state heading (läsåret) | **Inga elever läsåret {26/27}** |
| Empty state body (läsåret) | **Ingen elev i ditt uppdrag är placerad under det här läsåret. Välj ett annat läsår i sidhuvudet.** |
| Tom sökning/filtrering, rubrik | **Inga elever matchar urvalet** |
| Tom sökning/filtrering, text | **Kontrollera stavningen eller rensa sökningen och filtren.** Knappar: **Rensa sökningen**, **Rensa filter** (bara de som gäller). |
| Tomt uppdrag (lärare utan grupper m.fl.) | **Ditt uppdrag omfattar inga elever just nu.** |
| Ärendeomfattning utan val | **Välj ett tilldelat ärende för att se den elev ärendet gäller.** |
| Laddning, lista | **Hämtar elever…** |
| Laddning, elevkort | **Hämtar elevkortet…** |
| Laddning, historik | **Hämtar ändringshistorik…** |
| Pågående sparning | **Sparar…** (i knappen och som status) |
| Urval i adressen gäller inte | **Urvalet i adressen gäller inte ditt uppdrag. Listan visar läsåret för din första skola.** |

### Fel

| Element | Copy |
|---------|------|
| Error state, tjänsten nås inte | **Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.** + knapp **Försök igen** |
| 403, lista | **Ditt aktuella uppdrag tillåter inte att läsa elever. Uppdraget kan ha upphört.** |
| 403, åtgärd | **Ditt aktuella uppdrag tillåter inte ändringen.** |
| 403, export | **Ditt aktuella uppdrag tillåter inte export av elevuppgifter.** |
| 404, elev | **Eleven finns inte eller ingår inte i ditt uppdrag.** + **Tillbaka till elevlistan** |
| Loggfel | **Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.** I dialog tillägg: **Dina uppgifter finns kvar i formuläret.** |
| Uppdraget ändrat (`context_changed`) | **Uppdraget har ändrats. Ladda om arbetsytan.** (befintlig spärrdialog tar över vid epokbyte) |
| Supportuppdrag upphört | **Uppdraget har upphört vid sin sluttid. Elevuppgifterna har tagits bort från vyn och kan inte läsas längre.** |
| Formulär med fel | **Formuläret innehåller fel. Rätta de markerade fälten.** |
| 400 från servern | **Ändringen godtogs inte. Kontrollera uppgifterna och försök igen.** |
| Obligatoriskt fält | **Ange förnamn.** · **Ange efternamn.** · **Välj kommun.** · **Välj skola.** · **Välj utbildning.** · **Välj klass.** · **Ange datum.** |
| Personnummerformat | **Ange personnummer som ÅÅÅÅMMDD-NNNN.** |
| Ej syntetiskt nummer | **I provmiljön får bara syntetiska testpersonnummer användas.** |
| Överlappande placering | **Eleven har redan en placering {datum}. En elev kan bara ha en aktiv placering per dag.** |
| Klassdatum före nuvarande | **Klassbytet kan gälla tidigast {datum}.** |
| Datum utanför placering | **Datumet ligger utanför elevens placering ({från} – {till}).** |
| Slutdatum före start | **Slutdatum kan inte vara före startdatum ({datum}).** |
| Engångskod krävs, ändring | **Att ändra elevuppgifter kräver verifiering med engångskod.** Detalj: **Efter verifieringen kommer du tillbaka till elevlistan och gör ändringen igen. Det du fyllt i här sparas inte.** |
| Engångskod krävs, personnummer | **Att visa personnummer kräver verifiering med engångskod.** |
| Engångskod krävs, export | **Export kräver verifiering med engångskod.** |

### Konflikt, avvikelse och klassvarning

| Element | Copy |
|---------|------|
| Konflikt, basuppgifter, titel | **Eleven har ändrats av någon annan** |
| Konflikt, beskrivning | **{namn} sparade en ändring {tid}. Inget av det du fyllt i har sparats. Välj för varje uppgift vilket värde som ska gälla.** |
| Konflikt, val per uppgift | legend **{uppgift}** · radio **Ditt värde: {värde}** · radio **Sparat värde: {värde}** (förvalt) |
| Konflikt, övriga ändringar | **Dina övriga ändringar sparas som du fyllde i dem: {uppgifter}.** |
| Konflikt, knappar | **Spara valda värden** · **Stäng utan att spara** (stänger dialogen och läser om elevkortet) |
| Ny konflikt under val | **Eleven har ändrats igen, av {namn} {tid}. Välj på nytt.** |
| Konflikt, perioder | **{namn} ändrade elevens {placeringar/klasstillhörighet/hemkommun} {tid}. Din ändring har inte sparats. Hämta aktuellt läge och gör om ändringen.** + knapp **Hämta aktuellt läge** |
| Avvikelsesammanfattning | **{n} uppgift avviker från källan.** / **{n} uppgifter avviker från källan.** + **Välj vilket värde som ska gälla.** + knapp **Gå till avvikelsen** |
| Avvikelsepanel, rubrik | **Avvikelse från källan: {uppgift}** |
| Avvikelsepanel, värden | **Lokal rättelse: {värde} ({aktör}, {tid})** · **Simulerad källa (syntetisk): {värde} (levererad {tid})** |
| Avvikelsepanel, förklaring | **Den lokala rättelsen gäller tills du väljer. Källans värde skriver inte över den.** |
| Avvikelse, knappar | **Behåll lokal rättelse** · **Använd källans värde** |
| Avvikelse, resultat | **Den lokala rättelsen gäller för {uppgift}.** · **Källans värde gäller nu för {uppgift}.** |
| Klassvarning | **Klassen {klass} hör till utbildningen {utbildning}. Elevens utbildning är {nuvarande} och ändras inte av klassbytet. Byt utbildning separat om det är beslutat.** |

### Bekräftelser

| Element | Copy |
|---------|------|
| Basuppgifter sparade | **Elevens uppgifter är sparade.** |
| Hemkommun | **Hemkommunen {kommun} gäller från {datum}.** |
| Skolbyte | **{namn} är placerad på {skola} från {datum}.** Om skolan ligger utanför uppdraget efter datumet: tillägg **Efter {datum} ingår eleven inte i ditt uppdrag.** |
| Utbildningsbyte | **Utbildningen är {utbildning} från {datum}. Klassen är oförändrad.** |
| Avslutad placering | **Placeringen på {skola} gäller till och med {datum}. Den finns kvar i historiken.** |
| Klassbyte | **{namn} tillhör {klass} från {datum}. Den tidigare klasstillhörigheten finns kvar i historiken.** |
| Export klar | **Exporten är klar: {n} elever och {f} fält. Exporten är registrerad i säkerhetsloggen.** |
| Markering rensad | **Markeringen togs bort eftersom urvalet ändrades.** |

### Export och avslut

| Element | Copy |
|---------|------|
| Exportdialog, titel | **Exportera elevurval** |
| Exportdialog, beskrivning | **Välj elever och uppgifter. Du kan bara välja uppgifter som ditt uppdrag tillåter. Servern prövar exporten igen och registrerar den i säkerhetsloggen.** |
| Urvalsval | legend **Elever** · **Markerade elever ({n})** · **Alla elever i urvalet ({n})** |
| Fältval | legend **Uppgifter** · kryssrutor med serverns tillåtna fält: **Elev-ID**, **Namn**, **Födelsedatum**, **Skola**, **Utbildning**, **Klass**, **Årskurs**, **Hemkommun**, **Status**, **Placering från**, **Placering till** |
| Personnummerval | **Ta med personnummer** · hjälptext **Personnummer exporteras bara om du väljer det. Exporten registreras som personnummerexport.** |
| Skyddade elever (bara behörig) | **Ta med elever med skyddade personuppgifter ({p})** · hjälptext **Utan detta val utelämnas de ur exporten.** |
| Exportfel, inget fält | **Välj minst en uppgift att exportera.** |
| Exportfel, inga elever | **Urvalet innehåller inga elever att exportera.** |
| Filnamn | `syntetiskt-elevurval-{26-27}-{ÅÅÅÅ-MM-DD}.csv` |
| Destructive confirmation | Fasen har ingen radering. **Avsluta placering**: titel **Avsluta placeringen?**, text **{namn} är placerad på {skola} till och med {datum}. Placeringen finns kvar i historiken. Efter slutdatumet visas eleven inte i listan för den skolan.**, knappar **Behåll placeringen** (outline, får fokus när bekräftelsen öppnas) och **Avsluta placeringen** (primär). Skolbyte och utbildningsbyte bekräftas genom dialogens beskrivning och sparknapp, utan extra steg. |

## Beteendekontrakt

1. **Servern avgör vad som finns.** Listan, antalet, sidorna, filtervalen (klasser, utbildningar, årskurser, skolor), exportens fältlista och elevkortets fält kommer från serverns svar efter behörighetsprövning. Klienten hämtar aldrig en större lista för att filtrera den. Menypost, knappar och fält som saknas i svaret visas inte. Detta ersätter inte serverns prövning av varje anrop.
2. **Skyddade uppgifter röjs inte (DATA-01).** För den som inte får se en skyddad elev saknas eleven i sökträffar, antal, filteralternativ, sidantal, tomma tillstånd, fel och bekräftelser. Direktanrop mot eleven ger samma 404-text som en okänd elev. Den som har mandat men inte skyddsbehörighet, t.ex. lärare i gruppen, ser serverns anonyma visningsnamn utan märke och utan födelsedatum. UI:t lägger aldrig till ord som ”skyddad”, ”dold” eller ”anonym” för den användaren. Skyddade värden skrivs aldrig till `title`, `data-*`, `aria-*`, konsolen, `sessionStorage` eller adressen. Nätverkssvaret innehåller dem inte heller för obehöriga.
3. **Personnummer på begäran (D-02).** Listor visar bara födelsedatum, och bara för administratör. Hela numret hämtas i ett separat anrop när användaren väljer **Visa personnummer**. Anropet loggas före svaret. Numret döljs igen när användaren väljer **Dölj personnummer**, lämnar elevkortet, byter läsår, byter uppdrag eller loggas ut. En ny visning är en ny loggad händelse. Numret läggs inte i komponenttillstånd utanför elevkortet.
4. **Samtidig ändring (STU-06, D-10).** Varje sparning skickar den version eleven hade när dialogen öppnades. Vid 409 byter dialogen till konfliktvyn: den visar vem och när, och för varje uppgift ditt värde och det sparade värdet, med **Sparat värde** förvalt. Inget sparas förrän användaren väljer **Spara valda värden**. Den nya sparningen skickar den nya versionen. För placeringar, klasser och hemkommun visas i stället periodkonflikten med **Hämta aktuellt läge**. Den hämtar aktuellt läge utan att skriva, och inmatningen bevaras där den fortfarande är giltig. Ingen väg skriver över tyst.
5. **Ursprung och avvikelse (STU-04, D-08, D-09).** Varje fält i elevkortet visar sin källa. I fas 4 är källan normalt ”manuell i appen”. Fält som den simulerade källan äger visar texten om registerägd uppgift i stället för en ändringsknapp. När källan levererar ett annat värde än en lokal rättelse visas avvikelsen i listan (märke, bara för administratör), i elevkortets sammanfattning och i en panel vid fältet. Båda valen loggas och syns i historiken. Den simulerade källan märks alltid **(syntetisk)**.
6. **Export (DATA-02, D-15).** Exporten gäller ett uttryckligt urval: markerade elever eller alla elever i det aktuella serverurvalet. Dialogen visar bara fält som servern tillåter. Inget fält är förvalt utom **Elev-ID** och **Namn** **(förval)**. Personnummer och skyddade elever är aldrig förvalda. Antalet i knappen kommer från servern. Servern prövar mandat, spärr, skydd och fält igen, också vid direktanrop, och loggar innan filen lämnas. Exportknappen och dialogen visas bara vid exporträtt. Markeringen gäller bara aktuellt urval och töms när läsår, skola, filter eller sökning ändras.
7. **Epok, kontextbyte och spärr.** Registret följer fas 3:s mönster: vyn nycklas på `{epoch}-{assignmentId}`, varje begäran bär en generation och svar från en äldre generation ignoreras. Vid kontextbyte, utloggning, spärr i annan flik eller upphört supportuppdrag töms lista, elevkort, visat personnummer, sökord, markering och öppna dialoger innan spärrdialogen eller meddelandet visas. Inget elevinnehåll ligger kvar i DOM.
8. **Läsår och årskurs (D-07).** Byte av läsår hämtar listan för det läsåret och återställer sidan till 1. Sökord och filter behålls om de fortfarande gäller; annars tas de bort och texten om rensad markering visas. Byte av läsår i elevkortet stänger kortet och visar listan för det nya läsåret. Årskursen i listan räknas för valt läsår (`läsår − startår + 1`). Den är ett härlett värde och kan inte ändras i UI:t.
9. **Placering och klass (STU-02, STU-03, D-04, D-05).** En elev har högst en aktiv placering per datum. Skolbyte sparar avslut och ny placering tillsammans eller inte alls. Klassbyte ger ny daterad tillhörighet och slutdatum för den förra. Utbildningen ändras bara genom **Byt utbildning**. Avslutade placeringar och tidigare klasser tas aldrig bort i UI:t.
10. **Engångskod.** Ändringar kräver giltigt verifieringsbevis (8 h). Vid `mfa_required` visas `MfaStepUpNotice` där åtgärden gjordes, i dialogen eller i elevkortet. Återkomsten öppnar samma listurval. Formulärets inmatning sparas inte över verifieringen, och texten säger det.
11. **Sann status.** **Sparat**-bekräftelse visas först när servern har bekräftat sparningen, och kortet läses om efter sparning. Ett avbrutet eller oklart svar visas som fel med inmatningen kvar. Omladdning efter sparning visar samma värde (STU-01).
12. **Cachning.** Svar med elevuppgifter hämtas med `cache: 'no-store'`, och servern svarar `Cache-Control: no-store`. Bakåtnavigering från en annan sida eller `pageshow` från bfcache läser om sessionen innan elevinnehåll visas (befintligt `pageshow`-mönster).

## UI Considerations

> Fylld av ui-phase-kontrollen av tillstånd per yta (steg 9.5) 2026-09-28, efter godkänd granskning. Ytorna klassades och klassningen bekräftades av användaren: Elevlista och Elevkort = lista + formulär, Läsårsväljare = navigering/kontroll, Ändringsdialoger, Konfliktvy och Exportdialog = formulär, Status-/felregion = statisk text. Texter för tomma tillstånd och fel står i Copywriting Contract; här anges bara tillståndstäckningen.

Applicable state considerations resolved: 29 covered, 7 backstop, 1 dismissed, 0 unresolved (37 applicable).

| Category | Element(s) | Status | Resolution / Reason |
|----------|------------|--------|---------------------|
| empty | Elevlista | ✅ covered | Läsår utan elever visar ”Inga elever läsåret {26/27}”, sökning/filter utan träff visar ”Inga elever matchar urvalet” med gällande rensningsknappar, och uppdrag utan elever visar ”Ditt uppdrag omfattar inga elever just nu.” utan antal eller annan metadata (Copywriting: Tomma tillstånd). |
| loading | Elevlista | ✅ covered | Regionen får `aria-busy` och textstatus ”Hämtar elever…” i `role="status"`; knappar är inaktiva medan anropet pågår och föregående innehåll ersätts inte av tomt tillstånd under laddning. |
| error | Elevlista | ✅ covered | Nätverksfel, 403, 404, loggfel och `context_changed` har separata texter (Copywriting: Fel); 403/404/loggfel tömmer elevinnehållet innan texten visas; ogiltigt urval i adressen ger en allmän text utan besked om att värdet finns och listan faller tillbaka till uppdragets första skola. |
| populated | Elevlista | ✅ covered | 50 elever per sida från servern, tabell på dator (> 800 px) och kort på telefon (≤ 800 px), särskiljande rad på varje elev och sidindelning med ”Sida {s} av {m}”. |
| partial | Elevlista | ✅ covered | Märket Avvikelse visas bara för administratör och bara på elever med avvikande uppgift; saknade uppgifter visas som ”Ingen klass”/”Uppgift saknas” och fält som servern inte returnerar visas inte. |
| overflow | Elevlista | 🧪 backstop | Tabellen ryms utan sidledsrullning med radbrytning i celler; prövas med skärmbild och `document.documentElement.scrollWidth <= clientWidth` vid 801 px och 1024 px. |
| zero-one-many | Elevlista | ✅ covered | Status och exportknapp böjs ”1 elev”/”{n} elever” och ”Exportera 1 elev (CSV)”/”Exportera {n} elever (CSV)”; namnlika elever skiljs åt av den särskiljande raden, som alltid visas. |
| long-text | Elevlista | ✅ covered | Långa namn, skolnamn och utbildningsnamn bryts med `overflow-wrap:anywhere`; ingen ellips på namn, skola, utbildning eller feltext. |
| empty | Elevkort | ✅ covered | Tomma placeringsgrupper, tidigare klasser och historik visar sin korta text; korten döljs inte. |
| loading | Elevkort | ✅ covered | Elevkortet och den på begäran hämtade historiken visar textstatus i `role="status"` med `aria-busy`; åtgärdsknappar är inaktiva medan anropet pågår. |
| error | Elevkort | ✅ covered | 403, 404, loggfel och `context_changed` har samma separata texter som listan; direktanrop mot skyddad elev utan behörighet ger samma 404-text som okänd elev (Beteendekontrakt 2). |
| populated | Elevkort | ✅ covered | Administratören ser fyra kort (Basuppgifter, Skolplacering, Klasstillhörighet, Historik) med åtgärder; övriga funktioner ser bara de fält servern returnerar, utan åtgärder och historik. |
| partial | Elevkort | ✅ covered | Fält som servern inte returnerar visas inte alls (ingen tom rad, inget ”dolt”); elev utan klass visar ”Ingen klass”, utan hemkommun ”Uppgift saknas”; avvikelsepanel bara vid avvikande fält. |
| overflow | Elevkort | 🧪 backstop | Elevkortet med alla fyra kort och öppen historik ryms utan sidledsrullning; prövas med skärmbild och `scrollWidth <= clientWidth` vid 320 × 740 och 390 × 844. |
| zero-one-many | Elevkort | ✅ covered | Alla placeringar (aktuell, framtida, avslutade) och alla tidigare klasser visas som rader utan sidindelning; bara ändringshistoriken visas 20 poster åt gången med ”Visa fler ändringar”. |
| long-text | Elevkort | 🧪 backstop | Långa historikvärden (före/efter) bryts inom posten utan att tidsraden hamnar utanför; prövas med syntetiskt namn på 60+ tecken vid 320 px. |
| loading | Läsårsväljare | ✅ covered | Väljaren och pilknapparna är inaktiva tills listan har svarat; senaste valet gäller och svar från äldre generation ignoreras. |
| error | Läsårsväljare | ✅ covered | Misslyckas hämtningen efter läsårsbyte återgår väljaren till senast laddade läsår, listan för det läsåret står kvar och felrutan visas med felets text (Copywriting: Fel). |
| overflow | Läsårsväljare | 🧪 backstop | Sidhuvudet med läsårsväljare, uppdragsväljare, Logga ut och hjälp bryts enligt befintlig ≤ 600 px-regel med läsårsväljaren på egen rad; prövas vid 320 × 740 och 390 × 844 att ingen kontroll klipps. |
| long-text | Läsårsväljare | dismissed | Inte aktuellt: etiketterna är korta och fasta (”Läsår”, ”26/27”, ”26/27 (nu)”) och pilknapparnas tillgängliga text är fast. |
| empty | Ändringsdialoger | ✅ covered | Sparning med tomma obligatoriska fält skickas inte; varje tomt obligatoriskt fält får fältfel direkt under fältet och felsammanfattningen överst i dialogen får fokus. |
| loading | Ändringsdialoger | ✅ covered | Sparknappen visar ”Sparar…”, fälten är inaktiva och stängning är spärrad medan sparningen pågår. |
| error | Ändringsdialoger | ✅ covered | Fältfel vid fältet och sammanfattning överst (`role="alert"`); 400, loggfel och `mfa_required` har egna texter; inmatningen bevaras vid serverfel och 409 byter till konfliktvyn. |
| partial | Ändringsdialoger | ✅ covered | Valfria fält får vara tomma: ”Nytt personnummer” tomt betyder oförändrat och ”Klass på nya skolan” i skolbytet är valfri; klassbyte till klass i annan utbildning visar varning men tillåter sparning. |
| long-text | Ändringsdialoger | 🧪 backstop | Långa fältfel och långa alternativtexter (skol-, utbildnings- och kommunnamn) bryts inom dialogen utan att klippas; prövas vid 320 px med syntetiska namn på 60+ tecken. |
| empty | Konfliktvy | ✅ covered | Konfliktvyn är aldrig utan val: för varje krockande uppgift är **Sparat värde** förvalt, så **Spara valda värden** skriver aldrig ett tomt val. |
| loading | Konfliktvy | ✅ covered | **Spara valda värden** och **Hämta aktuellt läge** visar ”Sparar…”/”Hämtar…”, är inaktiva under anropet och stängning är spärrad under sparning. |
| error | Konfliktvy | ✅ covered | En ny 409 under sparning av valda värden visar konfliktvyn igen med den nya versionen och vem/när; periodkonflikter för placering, klass och hemkommun visas med **Hämta aktuellt läge**; inget skrivs över tyst (Beteendekontrakt 4). |
| partial | Konfliktvy | ✅ covered | Konfliktvyn visar bara de uppgifter som krockar; övriga ändringar i dialogen sparas enligt användarens inmatning utan att visas som konflikt. |
| long-text | Konfliktvy | 🧪 backstop | Ditt värde och sparat värde bryts inom sin rad utan sidledsrullning; prövas vid 320 px med syntetiskt värde på 60+ tecken. |
| empty | Exportdialog | ✅ covered | Utan valda fält eller utan elever i urvalet blockeras exporten med fältfel ”Välj minst en uppgift…” respektive ”Urvalet innehåller inga elever…”. |
| loading | Exportdialog | ✅ covered | Exportknappen visar pågående text och är inaktiv, fälten är inaktiva och stängning är spärrad tills servern har svarat. |
| error | Exportdialog | ✅ covered | 403, loggfel och `mfa_required` visas i dialogens felregion; urvalet och fältvalen bevaras; ingen fil lämnas förrän servern har loggat exporten. |
| partial | Exportdialog | ✅ covered | Dialogen visar bara fält som servern tillåter; personnummer och skyddade elever är egna kryssrutor, aldrig förvalda och skyddade elever visas bara för behörig. |
| long-text | Exportdialog | 🧪 backstop | Långa fältnamn och antalstexten i exportknappen bryts utan att klippas; prövas vid 320 px. |
| overflow | Status-/felregion | ✅ covered | En felruta åt gången, ingen automatisk stängning; dialoger använder `mandate-dialog` med `max-height:90dvh`, intern rullning och minst 16 px marginal till skärmkant. |
| long-text | Status-/felregion | ✅ covered | Korrelations-ID och långa feltexter bryts med `overflow-wrap:anywhere` sist i rutan. |

## Responsive and Accessibility Contract

| Område | Mätbart krav för fasens ändrade ytor |
|--------|------------------------------------|
| Dator | Pröva 1440 × 900 och 1024 × 768 CSS px. Befintlig sidomeny (15.5rem) och arbetsyta bevaras. Tabell > 800 px utan sidledsrullning. |
| Telefon | Pröva 390 × 844 och 320 × 740 CSS px. Enspalt: filter, kortlista, elevkort och dialoger. Ingen horisontell sidrullning (`document.documentElement.scrollWidth ≤ innerWidth`). Knapparna i `.mandate-actions` blir fullbredd ≤ 700 px (befintlig regel). |
| Brytpunkter | Lista: tabell > 800 px, kort ≤ 800 px. Filter: 3 kolumner > 800 px, 1 kolumn ≤ 800 px (befintlig `.protected-filter`). Faktarutor: 2 kolumner > 700 px, 1 kolumn ≤ 700 px (befintlig `.mandate-facts`). Sidhuvud: befintlig staplad topprad ≤ 600 px; läsårsväljaren på egen rad före uppdragsväljaren. |
| Förstoring | Vid 200 % text klipps inga etiketter, märken eller knappar. |
| Pekytor | Alla knappar, pilknappar, select, sökfält, kryss- och radioetiketter samt namnknappar är minst 44 × 44 CSS px; minst 8 px mellan fristående kontroller. Kryssrutor i tabellen har en 44 px klickbar etikett runt 22 px-rutan. |
| Tangentbord | Tab-ordning: läsårsväljare → uppdragsväljare → Logga ut → hjälp → innehåll (sök, filter, åtgärder, lista, sidindelning). Enter i sökfältet söker. Pilknapparna fungerar med Enter/Space. Ingen tangentbordsfälla utanför dialoger. |
| Fokus | Synlig fokusring 3 px `--ring`, offset 3 px, på alla nya kontroller inklusive namnknappar, kryssrutor, radioknappar och select. Att öppna elevkortet flyttar fokus till dess h1. **Tillbaka** eller bakåtknappen återför fokus till samma elevs namnknapp; saknas den, till resultatrubriken. Byte av läsår eller sida flyttar fokus till resultatrubriken (`tabIndex=-1`). **Gå till avvikelsen** flyttar fokus till panelens rubrik. |
| Dialog | Base UI-dialog med fokusfälla, Escape (utom under sparning), titel och beskrivning. Fokus till dialogytan vid öppning (`initialFocus`), tillbaka till öppnande knapp vid stängning. I konfliktvyn flyttas fokus till konfliktrubriken. |
| Etiketter | Alla fält har synlig `<label>`; grupper har `<fieldset>`/`<legend>` (exportens elev- och fältval, konfliktval per uppgift). Tabellen har `<caption class="sr-only">Elever läsåret {26/27}</caption>` och `scope="col"`. Märken är text, inte bara ikon; ikoner har `aria-hidden="true"`. |
| Meddelanden | Resultatstatus och bekräftelser: `role="status"`/`aria-live="polite"`. Fel, konflikt, MFA och upphört uppdrag: `role="alert"`. Laddande region: `aria-busy="true"`. Visat personnummer annonseras inte; det står i fokus vid knappen. |
| Landmärken | `lang="sv"`, länken **Till innehållet**, `main#workspace`, en h1 per vy (Elever eller elevens namn), h2 för kort och resultatrubrik, h3 inom kort. |
| Minskad rörelse | Ingen ny animation. Laddning förstås av text, inte bara av en snurra. |

Kraven följer [W3C Reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html), [Contrast (Minimum)](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) och [Status Messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html). 44 px är projektets val och strängare än WCAG 2.2:s minimum. Kontraktet påstår inte att appen redan är WCAG-granskad.

## Registry Safety

| Registry | Blocks Used | Safety Gate |
|----------|-------------|-------------|
| shadcn official | Inga nya block. Befintliga lokala komponenter: Button, Dialog, Table, Checkbox, Badge, Collapsible, (valfritt) NativeSelect, Sidebar. | Nyhämtning inte tillämplig. 2026-09-28: `shadcn info` kördes lokalt och listade 60 installerade komponenter, `registries: {}`. |
| Tredjepartsregister | Inga. | 2026-09-28: `components.json` har `registries: {}`. Kontraktet inför inga externa block, så vetting är inte tillämplig. |

Om en senare plan vill hämta en ny komponent från ett register krävs separat källgranskning innan den läggs till i kontraktet.

## Acceptance Evidence for Execution

Varje prov dokumenteras med revision, mål (lokal skyddad stack eller byggd Worker), projekt (dator/telefon) och resultat. Skärmbilder bevisar layout. Nätverks-, DOM- och loggprov bevisar skyddsgränsen separat. Endast syntetiska elever; fixturen ska innehålla minst två namnlika elever, en skyddad elev, en elev med framtida placering, en med avslutad placering, en med klassbyte till en klass i en annan utbildning, en med hemkommunsbyte och en med avvikelse från den simulerade källan.

1. **Återfinna och ladda om (STU-01, STU-05):** Som skoladministratör: välj läsår, skola och filter, sök en elev, öppna elevkortet, ändra namnet och spara. Logga ut och in igen. Samma elev har samma elev-ID och det sparade namnet. Bakåtknappen och omladdning ger samma listurval. Sökordet finns inte i adressen, i webbläsarhistoriken eller i någon frågesträng i nätverksloggen.
2. **Namnlika elever:** Båda syns med olika särskiljande rad, för administratör med födelsedatum och för lärare med klass och skola.
3. **Placering och klass (STU-02, STU-03):** Aktuell, framtida och avslutad placering visas i rätt grupp. Klassbyte till en klass i annan utbildning visar varningen, sparar ny tillhörighet och bevarar den tidigare. Utbildningen är oförändrad tills **Byt utbildning** sparas.
4. **Ursprung och avvikelse (STU-04):** Ursprungsraden visas per fält. Den simulerade källan levererar ett annat värde än en lokal rättelse. Rättelsen står kvar, avvikelsen visas på tre ställen och båda valen fungerar och syns i historiken.
5. **Samtidig ändring (STU-06):** Två flikar med olika administratörer ändrar samma uppgift. Den andra sparningen nekas, konfliktvyn visar namn, tid och båda värdena, och inget skrivs förrän valet sparas. Upprepa för klassbyte (periodkonflikt).
6. **Skyddad elev (DATA-01):** Behörig administratör kan söka, öppna, ändra och exportera den skyddade eleven, och varje visning loggas. Lärare i gruppen ser serverns anonyma namn utan märke. Administratör utan skyddsbehörighet, lärare och support får ingen sökträff och ingen skillnad i antal eller sidantal; direkt-URL/API ger samma 404-text. Kontrollera DOM, `sessionStorage` och nätverkssvar efter namn, personnummer och skyddsflagga.
7. **Personnummer:** Listan visar bara födelsedatum. **Visa personnummer** loggas som egen händelse. Numret försvinner vid Dölj, Tillbaka, läsårsbyte och kontextbyte. Lärare har ingen knapp, och ett direktanrop nekas.
8. **Export (DATA-02):** Exportera markerade elever med valda fält. Filen innehåller bara de fälten och eleverna, utan personnummer och skyddade elever om de inte valts. Direktanrop med otillåtet fält, främmande elev eller utan mandat nekas och loggas. Exporten loggas, och personnummerexport loggas som egen typ.
9. **Tillstånd:** Visa laddning, tomt läsår, tom sökning, 403, 404, loggfel (logg avstängd, inget innehåll och ingen ändring), `context_changed`/epokbyte i annan flik och upphört supportuppdrag. Varje tillstånd har sin egen text.
10. **Dator och telefon:** Genomför prov 1, 3 och 5 vid 1440 × 900 och 390 × 844 samt listan och en dialog vid 320 × 740. Ingen sidledsrullning, 44 px pekytor, tangentbordsväg, synligt fokus, fokusåterställning efter elevkort och dialog, och annonserade meddelanden (kontrollera med tillgänglighetsträdet).
11. **Handbok:** Berörda sidor i `docs/handbok/` (`anvandning.md`, `mandat.md`, `regler.md`, `sakerhetslogg.md`) beskriver det verifierade elevregisterbeteendet och dess begränsningar. `npm run docs:build` passerar.

## Utanför kontraktet

- Ny elev/inskrivning och radering av elev. Syntetiska elever läggs in med fixtur. Om planen lägger till inskrivning följer den dialogmönstret ovan och kräver en revision av kontraktet.
- Vårdnadshavare, adresser och kontaktuppgifter (D-01).
- Läsårsstatus och lås, flikarna Aktuella/Framtida/Arkiverade, terminskolumner och automatisk klass–timplan-koppling (D-07).
- Fakturering till hemkommuner (D-16). Fas 4 visar bara hemkommuns- och placeringsperioderna.
- Sparade namngivna urval, sorteringskontroller, massändring och verklig registerkälla (fas 7).
- Exempelläget från fas 1 (`admin-workspace.tsx`) ändras inte och får ingen backend.

## Checker Sign-Off

- [x] Dimension 1 Copywriting: PASS
- [x] Dimension 2 Visuals: PASS
- [x] Dimension 3 Color: PASS
- [x] Dimension 4 Typography: PASS
- [x] Dimension 5 Spacing: PASS
- [x] Dimension 6 Registry Safety: PASS
- [x] Dimension 7 Inventory Provenance: PASS

**Approval:** approved 2026-09-28 (gsd-ui-checker, revision 1)
