---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "13"
subsystem: register-card-ui
status: complete
completed: 2026-09-28
tags: [react, dialog, konflikt, export, mfa, playwright]
requires: [04-10, 04-12, 04-23]
provides:
  - Elevkort i samma main med bas-/ursprungsrader, placeringar, klass- och kommunhistorik och historik på begäran
  - Ändringsdialoger (basuppgifter, hemkommun, skolbyte, utbildning, avslut, klass) med sann sparstatus
  - Konfliktvy per uppgift (409 fields/identity) och periodkonflikt med Hämta aktuellt läge
  - Källavvikelsepaneler med Behåll lokal rättelse / Använd källans värde
  - Exportdialog med serverns förhandsprövning, nedladdning efter prövning och återkallad blob-URL
  - Engångskodsverifiering inuti öppen dialog med returadress utan sökord
affects: [04-16, 04-19, 04-21]
requirements: [STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02]
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
tech-stack:
  added: []
  patterns:
    - "Fokus sätts i effekt efter commit (inte requestAnimationFrame) – WebKit körde ramen före React-renderingen"
    - "Dialogfält: <label for> + kontroll + hjälptext/fältfel via aria-describedby"
key-files:
  created:
    - web/app/pupil-card.tsx
    - web/app/pupil-dialogs.tsx
    - web/e2e/phase4-card.spec.ts
    - web/playwright.phase4-card.config.ts
  modified:
    - web/app/pupil-register-workspace.tsx
    - web/app/mfa-step-up.tsx
    - web/app/globals.css
    - web/lib/pupil-register-model.ts
    - web/lib/pupil-register-model.test.mjs
    - web/e2e/phase4-list.spec.ts
key-decisions:
  - "Elevkortet hålls i arbetsytans minne och history.state {pupilCard:true}; elev-ID läggs aldrig i adressen, protected-home ändrades inte"
  - "Konfliktval: en uppgift i konflikten skickas bara vid uttryckligt val av eget värde; sparat värde är förvalt och skickas inte. Tomt resultat skriver inget"
  - "Identitetskonflikt (personnummer) läser om kortet och gör även andra ändrade uppgifter till val, så att inget skrivs över tyst"
  - "Periodkonflikt med oförändrad version tolkas som datumfel (överlapp/utanför placering), inte som någon annans ändring"
  - "Exporten skickar alltid protectedIds=[] eftersom listan saknar skyddsflagga per rad; skyddade elever utelämnas"
  - "Klarbeskedets antal i exporten räknas ur den levererade CSV-filen, inte ur förhandsprövningen"
actuals:
  tokens: 28000
  tasks: 2
  commits: 4
plan_head_before: 21ba4ef4f53ad0d6aa1bd84977ae02fe14b14fa4
duration: 22min
---

# Fas 4 plan 13: elevkort, ändringsdialoger, konflikt och export

**Administratören kan öppna elevkortet från listan och där se basuppgifter med ursprung, placeringar, klass- och kommunhistorik samt ändringshistorik på begäran. Från kortet kan hen starta alla sex ändringar, lösa konflikter per uppgift, välja värde vid källavvikelse och exportera ett serverprövat urval. Kortet, dialogerna och exportens förhandsprövning är provade i webbläsare mot byggd Worker på dator och telefon. En lyckad sparning, konfliktvyn och en nedladdad fil är däremot inte browserprovade, eftersom provkontot saknar engångskod (se Verifiering).**

## Genomfört

### Uppgift 1: elevkort och dialoger (cf658c9)
- `pupil-card.tsx`: elevkortet ersätter listan i samma `main`. Fokus flyttas till h1. **Tillbaka till elevlistan** och webbläsarens bakåtknapp för tillbaka fokus till samma elevs namnknapp. Adressen får ingen elev-ID, och `history.state` innehåller bara `pupilCard:true`.
- Kortet visar bara fält som servern returnerar. Administratörens projektion har basuppgifter med ursprungsrader (`Källa: manuell i appen · tid` eller `simulerad källa (syntetisk) · levererad tid`). Fält som källan äger visar ansvarig källa i stället för ändringsknapp. Placeringar grupperas som Aktuell, Framtida och Avslutade mot läsårets referensdatum. Klassgrupperna är aktuell klass, kommande klasser och tidigare klasser. Hemkommun visas över tid. Lärare och motsvarande får bara basraden: skola, klass, utbildning, årskurs och Elev-ID.
- Personnumret visas maskerat (`ÅÅÅÅMMDD-••••` med skärmläsartext). Det hämtas med ett separat POST först vid **Visa personnummer** och finns bara i kortets tillstånd. Det rensas vid Dölj, ny kortläsning, stängt kort, läsårsbyte (kortet stängs) och epokbyte (arbetsytan avmonteras).
- Historiken är en Collapsible som hämtas först när den öppnas, 20 poster per sida med **Visa fler ändringar**. Posterna töms när den stängs.
- `pupil-dialogs.tsx`: dialogerna **Ändra basuppgifter** (namn och nytt personnummer, aldrig förifyllt), **Registrera ny hemkommun**, **Registrera skolbyte**, **Byt utbildning**, **Avsluta placeringen?** (där **Behåll placeringen** får fokus) och **Byt klass** (med varning när klassen hör till en annan utbildning). Klientvalidering ger fältfel och en sammanfattning. Inmatningen bevaras vid serverfel. `useUnsavedChanges` är registrerad. Stängning spärras bara under pågående sparning.
- **Sann sparstatus:** bekräftelsen visas först när servern svarat 200 och elevkortet har lästs om. Om omläsningen misslyckas står det `…, men elevkortet kunde inte uppdateras. Uppgifterna nedan kan vara inaktuella.` med **Hämta aktuellt läge**, och åtgärderna är avstängda tills kortet lästs om.
- **Konflikt (409):** vid `fields` visas ett val per uppgift, **Ditt värde** eller **Sparat värde** (förvalt), med vem och när. Övriga ändringar listas. **Spara valda värden** skickar `currentVersion`. En ny 409 visar `Eleven har ändrats igen…`. Vid `identity` visas personnumret maskerat. Vid `period` visas vem/när och **Hämta aktuellt läge**, som läser om utan att skriva och behåller giltig inmatning.
- **Källavvikelse:** en sammanfattning med **Gå till avvikelsen**, och en panel per fält med lokal rättelse och `Simulerad källa (syntetisk)` samt **Behåll lokal rättelse** och **Använd källans värde** (`resolve-source`). Vid 409 sparas inget och **Hämta aktuellt läge** erbjuds.
- Klientmodellen har `PupilExportPost` (speglar 04-10:s `{mode, export}`), `exportPost`, `DEFAULT_EXPORT_FIELDS`, `groupPlacements`, `maskedPersonalNumber` och `resolvedBasics`. `MfaStepUpNotice` och `startStepUp` tar en `returnTo`, som begränsas till intern sökväg.

### Uppgift 2: export, MFA i dialog och layout (0bbb130)
- **Exportera urval…** visas bara när listan ger `canExport` och har elever. Dialogen visar **Markerade elever (n)** och **Alla elever i urvalet (n)**. Förvalda fält är bara Elev-ID och Namn. Personnummer är en egen kryssruta som aldrig är förvald. Förhandsprövningen (`mode:'preview'`) ger antalet i knappen. Sidan skickas inte vidare; filtret går med `page:1`.
- Nedladdning (`api.downloadPost`, `mode:'download'`) går först efter godkänd förhandsprövning. Blob-URL:en återkallas efter klick. Klarbeskedet räknar raderna i den levererade filen med `csvDataRowCount`, som hanterar citerade celler.
- Fel ger egna texter: tomt fältval (fältfel, inget anrop), tomt urval, 403, 404, loggfel och `mfa_required`. Engångskodsrutan visas inuti dialogen.
- Stilreglerna gäller bara `.pupil-register`, `.pupil-card` och `.pupil-register-dialog` och följer skalan 4/8/16/24. Varningar har `--foreground`-text, märken är neutrala 14/500 och skyddsrutan och historikposterna ligger på `--muted`. Dialogfält, knappar och etiketter är minst 44 px.

### Rättning efter browserprov (2b83572) och listprov (7a36d96)
- Fokus till h1, felsammanfattning och konfliktrubrik sätts nu i effekt efter commit. Telefonprovet i WebKit var rött eftersom `requestAnimationFrame` kördes före React-renderingen.
- Varje dialogfält har egen `<label for>`, och hjälptext och fältfel kopplas med `aria-describedby`. Tidigare låg de inuti etiketten och blev en del av det tillgängliga namnet.
- 04-12:s listprov krävde att en anonym rad saknade knappar, vilket bara gällde så länge kortet inte var inkopplat. Provet kräver nu exakt namnknappen och ingen markering eller annan åtgärd.

## Verifiering

| Kontroll | Resultat |
|---|---|
| `npx tsc --noEmit && npx oxlint app lib` (04-13-01) | PASS på slutrevision 7a36d96 |
| `node --test lib/server-client.test.mjs lib/pupil-register-model.test.mjs && npx tsc --noEmit` (04-13-02) | PASS 41/41 + typkontroll |
| `node --test lib/*.test.mjs lib/server/*.test.mjs` | PASS 389/389 |
| `npm run build` | PASS |
| `npm run build:protected` | PASS, bygge märkt 2b83572 (UI-koden i 7a36d96 är identisk) |
| Riktat browserprov `playwright.phase4-card.config.ts` mot lokal protected-Worker, lokal OIDC och syntetiska data | **PASS 9/9**: dator 1440×900, iPhone 13 (WebKit, 390 px) och 320×740, 3 fall per projekt |
| Listregression `playwright.phase4-list.config.ts` | Först 2 röda (anonym rad, se ovan), sedan **PASS 13/13** |
| Worker-avbrott (deferred-items 04-23) | Inga `[ERROR]` i förhandsvisningens logg under körningarna. Alla nekade anrop gav 403 med kod |

Browserproven visar följande:
- Kortet ersätter listan, och h1 har fokus. Adress och `history.state` saknar elev-ID. Svaret har `no-store` och saknar `personalNumber`.
- Personnumret är maskerat och inget personnummeranrop görs utan klick.
- Historiken hämtas vid öppning (page=1) och töms när den stängs.
- Både Tillbaka och webbläsarens bakåtknapp för tillbaka fokus till namnknappen.
- Ingen sidledsrullning. Alla knappar i kortet och dialogerna är minst 44 px.
- Tomt namn ger fältfel utan anrop.
- Sparning av ändrat namn skickar `expectedVersion` och ger `mfa_required`. Då visas engångskodsrutan i dialogen och inmatningen står kvar. Escape stänger dialogen och fokus går tillbaka till knappen.
- I **Avsluta placering** får **Behåll placeringen** fokus.
- **Visa personnummer** ger `mfa_required`, och rutan visas i kortet.
- Export: förhandsprövningens kropp är `{mode, export}` med `search` och `page:1`. Knappens antal kommer från servern. Förvalen är korrekta. Tomt fältval stoppas utan anrop. Nedladdning ger `mfa_required` i dialogen.
- **Verifiera med engångskod** leder till `/api/auth/login?step_up=1&till=/?vy=elever&…`, utan sökord.

Minimerad rapport: `work/pilot/results/phase4-13-browser.json` (gitignorerad, utan elevvärden).

### Krav → prov
- **STU-01/02/03** (sparad ändring, placering/klass/utbildning): dialogerna och kraven på sann status är byggda. Typ-, modell- och placeringsgruppering är provade, och dialogerna är browserprovade fram till serverns MFA-spärr. **En lyckad sparning med omläsning är inte browserprovad.**
- **STU-04** (ursprung och avvikelse): ursprungsrader och källägda fält syns i kortet. Avvikelsepanelen är byggd men inte browserprovad, eftersom provdatan inte hade någon öppen avvikelse för p3.admin.
- **STU-06** (samtidighet): konfliktvyn och `resolvedBasics` är modellprovade (4 fall). En verklig 409 i webbläsaren återstår för 04-16/04-19 med två administratörer.
- **DATA-01** (skydd och personnummer): personnumret hämtas bara på begäran, är aldrig förifyllt och ligger inte i adress eller `history.state`. MFA-spärren är browserprovad.
- **DATA-02** (export): förhandsprövning, förval, tomt urval och MFA-spärr är browserprovade. **En nedladdad fil är inte browserprovad** (serverdelen är Worker-provad i 04-23).

Inga krav är slutverifierade här.

## Avvikelser från planen

1. **[Rule 1] WebKit-fokus** (2b83572): se ovan. Hittades i telefonprovet, rättades och provades om 9/9.
2. **[Rule 2] Fältetiketter** (2b83572): se ovan.
3. **[Rule 1] Förlegad assertion i 04-12:s listprov** (7a36d96): provet speglade läget utan kort. Det kräver nu namnknapp men ingen markering eller åtgärd. 04-19 bör bekräfta tolkningen mot D-19, alltså att en anonym rad får öppna ett skrivskyddat kort vars innehåll servern avgör.
4. **Filer utanför `files_modified`:** klientmodellen och dess prov (exportkroppen enligt 04-10:s anvisning), `e2e/phase4-card.spec.ts`, `playwright.phase4-card.config.ts` och `e2e/phase4-list.spec.ts`. `protected-home.tsx` ändrades inte, så brödsmulan visar fortfarande `Arbetsyta › Elever` även i kortet.
5. **Uppdelning av commits:** konfliktvyn ligger i uppgift 1:s commit eftersom den ingår i samma dialogkomponent. Uppgift 2:s commit innehåller export, layout och fokusåtergång.
6. **Avvikelser från UI-kontraktet** som API:et kräver:
   - **Namn** är ett fält, eftersom API:et bara har `displayName`. UI-SPEC har Förnamn och Efternamn.
   - Hemkommun anges som **kommunkod** (fyra siffror) och visas som `Kommunkod NNNN`. Det finns inget API för kommunnamn.
   - Aktörens namn saknas i ursprungs- och historikrader, eftersom servern bara ger ett ID. Konfliktvyn visar namn, eftersom konfliktdetaljerna innehåller det.
   - Skolbytet saknar det valfria klassvalet, eftersom `transfer` inte har något klassfält. Klass väljs efteråt med Byt klass.
   - Utbudet på en ny skola hämtas med listanropet för den skolan. Bara `options` används och elevraderna sparas inte. Anropet loggas som en listläsning.
7. **HEAD-skyddet:** protokollets kontroll klassar `master` som skyddad gren. Projektet kör sekventiellt på huvudarbetskopian med `branching_strategy: none`, och alla tidigare plancommits ligger på `master`. Därför gjordes vanliga commits där. Ingen force eller omskrivning.

## Kvarstående begränsningar

- **Skyddade elever i export:** listsvaret saknar skyddsflagga per rad, så dialogen kan inte erbjuda **Ta med elever med skyddade personuppgifter** och skickar alltid `protectedIds: []`. Skyddade elever utelämnas därför alltid, och dialogen säger det. Märket **Skyddade personuppgifter** i listan kräver samma serverfält. Båda kräver en ändring i SQL-projektionen och adaptern (utanför UI-planen).
- **Ej browserprovat:** lyckad sparning med omläsning (STU-01), konfliktvyn med två administratörer (STU-06), avvikelsepanelens två val (STU-04) och en nedladdad CSV med innehållskontroll (DATA-02). Provkontot p3.admin har ingen engångskod, så alla MFA-krävande anrop nekas före SQL. Dessa fall ingår i 04-16 (fixturer) och 04-19 (samlad UI-grind).
- Uppgifter om `Skola` och kommunnamn beror på serverns referensurval. Om en utbildning eller klass inte finns i urvalet står `Utbildningens namn saknas` eller `Klassens namn saknas`.
- Handboken (04-21), den fulla fasgrinden (04-21), gsd-verify-work och en verklig kommunanslutning återstår. Syntetiska prov godkänner ingen drift.

## Known Stubs

Inga.

## Threat Flags

Inga nya ytor. Alla anrop går till befintliga, prövade routes (04-09, 04-10 och 04-23).

## Commits

- `cf658c9` feat: elevkort, historik och ändringsdialoger med sann sparstatus
- `0bbb130` feat: exportdialog med serverprövat antal, MFA i dialog och skalanpassad layout
- `2b83572` fix: fokus efter commit i WebKit och fält med egen etikett; riktat browserprov
- `7a36d96` test: anonym listrad får bara namnknappen som öppnar elevkortet

## Self-Check: PASSED

- FOUND: web/app/pupil-card.tsx, web/app/pupil-dialogs.tsx, web/e2e/phase4-card.spec.ts, web/playwright.phase4-card.config.ts
- FOUND: cf658c9, 0bbb130, 2b83572, 7a36d96
