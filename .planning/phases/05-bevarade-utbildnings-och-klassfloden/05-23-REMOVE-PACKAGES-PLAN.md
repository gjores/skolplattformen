---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "23-remove-packages"
type: execute
wave: 1
depends_on: ["05-23-A", "05-23-B", "05-23-C", "05-23-D"]
requirements: [ADMIN-02, ADMIN-03]
autonomous: true
status: in_progress
approved_by: "Användarbeställning 2026-10-05: Ändra appen så att det inte finns i programplanerna."
files_modified:
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan-board.tsx
  - web/lib/programplan-analysis.ts
  - web/lib/programplan-analysis.test.mjs
  - web/lib/session-channel.ts
  - web/e2e/phase5-blocks.spec.ts
  - web/e2e/phase5-packages.spec.ts
  - web/e2e/phase5-lifecycle.spec.ts
  - web/e2e/phase5-terms.spec.ts
  - web/e2e/phase5-programplan-frame.spec.ts
  - web/playwright.phase5-programplan-frame.config.ts
  - work/pilot/phase5-programplan-browser-fixtures.mjs
  - docs/handbok/programplaner.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-23-SUMMARY.md
  - .planning/STATE.md
  - .planning/ROADMAP.md
  - .planning/research/PAKETENS-PLATS-I-UTBILDNINGSFLODET-2026-10-05.md
must_haves:
  truths:
    - "Programplanen visar fasta nivåer samt valbara blocks poäng och terminsram, utan kommandon för språkpaket eller valpaket."
    - "Programplanen öppnas och analyseras utan att läsa skolans paketval eller paketbibliotek; frånvaro av paket stoppar inte Klar för beslut."
    - "Kopiera till ny elevkull tar med programram, terminer och skolval utan att läsa eller skriva paketval. Källans sparade utbud bevaras."
    - "Befintliga paket, versioner och skolvisa val raderas eller skrivs inte om. Äldre beroenden förklaras utan uppmaning att använda borttagna kommandon."
    - "En separat arbetsyta för skolutbud, elevval och undervisningsorganisation är inte levererad genom denna ändring."
    - "Ändringen provas på dator och telefon, och handboken beskriver den nya avgränsningen."
  artifacts:
    - path: web/app/protected-programplan-workspace.tsx
      provides: "Programplansarbete utan aktiv paketladdning, paketanalys eller paketkopiering till ny elevkull."
    - path: web/app/protected-programplan-board.tsx
      provides: "En rad per blockram, utan paketexpansion och paketkommandon."
    - path: docs/handbok/programplaner.md
      provides: "Användarinstruktioner för fasta nivåer och blockramar samt aktuell begränsning för skolutbud."
  key_links:
    - "Programplanens blockrader → befintlig terminsfördelning och poängsumma."
    - "Programplansanalys → fasta nivåer och blockramar, utan skolvis paketanalys."
    - "Kopiera → nytt utkast med bevarad ram och skolval, utan paketkommandon."
---

# 05-23 — ta bort pakethanteringen från programplanerna

<objective>
Genomför användarens senare beslut om arbetsytans ansvar. Programplanen beskriver utbildningens fasta innehåll och valbara utrymme. Skolans konkreta utbud och hur språkgrupper organiseras utifrån lärarresurser ska få en separat plats senare i flödet.

Behåll den korrigerade poängmängden, blocktyperna, terminsramarna, fasta fördjupningsnivåer och befintliga versions-/mandatskydd. Ta bort paketfunktionerna från programplansvyn. Det här är en avgränsad ombyggnad av placeringen, inte hela den framtida utbuds-/elevvals-/bemanningsfunktionen.
</objective>

## Beslut och förhållande till tidigare plan

Beställningen ersätter tidigare 05-23:s C/D-placering i programplanen och E:s tidigare paketbaserade användarprov. D-05:s tidigare antagande att ett block automatiskt är ett gemensamt schemafönster gäller inte: samma programram ska kunna organiseras olika per skola, exempelvis språkgrupper på olika dagar med en enda språklärare.

Tidigare C/D-resultat bevaras som historiska verifieringsbevis för den då beställda funktionen. De är inte aktuella UI-bevis efter ändringen. Hela 05-23, ADMIN-02/ADMIN-03, mänskligt begriplighetsprov och full fasverifiering förblir öppna tills deras återstående arbete faktiskt är utfört. Äldre audit-FAIL och 05-22:s metadata-PARTIAL påverkas inte av denna UI-rättning.

<context>
@AGENTS.md
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-23-SUMMARY.md
@.planning/research/PAKETENS-PLATS-I-UTBILDNINGSFLODET-2026-10-05.md
@web/app/protected-programplan-workspace.tsx
@web/app/protected-programplan-board.tsx
@docs/handbok/programplaner.md
</context>

<tasks>

<task type="auto">
  <name>1. Begränsa programplansarbetet till fasta nivåer och blockramar</name>
  <files>web/app/protected-programplan-workspace.tsx, web/app/protected-programplan-board.tsx, web/lib/programplan-analysis.ts, web/lib/programplan-analysis.test.mjs, web/lib/session-channel.ts</files>
  <action>
  Ta bort paketexpansion, paketdialoger och skolans paketutbud från den aktiva programplansvyn. Knapparna Visa paket, Föreslå språkpaket, Lägg till språkpaket, Nytt valpaket och Ny version av paket ska inte finnas där. Frikoppla paketkomponenterna från board/workspace; oanvända UI-komponenter kan tas bort utan att domänbibliotek, API eller databas ändras.

  Ta bort automatisk läsning av paketval och bibliotek, laddningsspärren för paket samt skolvis paketanalys och dess åtgärdslänkar. Planens analys och Klar för beslut ska använda fasta rader, blockens ram och planens övriga befintliga regler. Skoladministratörens skrivskydd får inte längre lova paketval i denna vy.

  Vid Kopiera till ny elevkull ska klienten kopiera program/inriktning, fasta fördjupningsval, blockramar, terminsfördelning och skolval utan att läsa eller skriva paketval. Befintliga källpaket bevaras. Backendens kloning till ny planversion och samtliga paketAPI förblir oförändrade.

  Ta inte bort paketdata, tabeller, versioner, grants eller audit. Befintliga serverkontroller kan fortsatt neka ram-/skoländring som skulle förstöra äldre referenser. Ändra deras användarbesked till att äldre utbud bevaras och att ändringen därför inte kan göras här; uppmana inte användaren att öppna eller rensa paket med borttagna kommandon. Behåll blockredigering, autospar, osparatskydd, telefonens årskursväxling och fasta nivåers analysåtgärder.
  </action>
  <verify>
  Kör riktade modell-/meddelandeprov, TypeScript och oxlint. Kontrollera den aktiva komponentkopplingen och inspelade nätverksanrop vid öppning, analys, Läs om och kopiering: inga paketval-/valpaketanrop från dessa flöden. Läs tillbaka kopians underlag/terminer/skolor och jämför källans tidigare paketval/versioner före/efter.
  </verify>
  <done>Programplanen har blockramar och fasta nivåer utan aktiva paketkontroller, paketladdning eller paketanalys. Kopiering kräver inte ett paketunderlag. Befintligt utbud och servermandat består.</done>
</task>

<task type="auto">
  <name>2. Pröva programramen och bevarandet på dator och telefon</name>
  <files>web/e2e/phase5-programplan-frame.spec.ts, web/playwright.phase5-programplan-frame.config.ts, work/pilot/phase5-programplan-browser-fixtures.mjs, web/e2e/phase5-blocks.spec.ts, web/e2e/phase5-packages.spec.ts, web/e2e/phase5-lifecycle.spec.ts, web/e2e/phase5-terms.spec.ts</files>
  <action>
  Anpassa aktuella browserprov till det senare användarbeslutet. Paketbaserade C/D-UI-prov får inte redovisas som aktuell PASS; markera dem uttryckligen historiska/ersatta eller flytta dem ur den aktiva programplansmatrisen. Behåll backendens meningsfulla paketprov utan att tolka dem som levererad utbudsvy.

  Prova minst SA25 med full ram (2 500 p), nationellt språkblock och IV delat i två block om 100 p. Fördela blockpoäng och läs om; lägg till/ändra eget fördjupningsblock med korrekt revisionskontroll och skyddad sparning. Prova även HM/rektor respektive skoladministratörens läsning, en delad plan samt befintligt utkast/fastställd version med tidigare paketval. Paketens frånvaro får inte låsa läsning eller göra en färdig ram ofullständig. Kopiering ska ge rätt ram/terminer/skolor utan paketnätverk. Kontrollera att äldre data inte raderas när paketUI avlägsnas och att beroendebesked inte leder till en saknad arbetsyta.
  </action>
  <verify>
  Kör riktade blocks-/programplans-/termindelprov mot samma skyddade bygge på dator och iPhone. Granska skärmbilder med full poängsumma, blockramar, skrivskydd och analys. Gör bevarandeprov med read-only före/efter-hash av ursprungliga verksamhetsrader; muterande syntetiska fixturer ska vara ägda och städade. Bygg i egen kopia medan vanlig 3012 är aktiv och byt först efter godkända prov, utan reset av användarplaner.
  </verify>
  <done>Berörda programplansflöden fungerar på dator och telefon, paketkommandon/anrop saknas i dem och ursprungliga paket-/planrader är bevarade. Misslyckade prov eller historiska luckor redovisas utan att räknas som PASS.</done>
</task>

<task type="auto">
  <name>3. Uppdatera handbok och GSD med den beslutade avgränsningen</name>
  <files>docs/handbok/programplaner.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-23-SUMMARY.md, .planning/STATE.md, .planning/ROADMAP.md, .planning/research/PAKETENS-PLATS-I-UTBILDNINGSFLODET-2026-10-05.md</files>
  <action>
  Handboken beskriver fasta nivåer, blockpoäng och terminsram samt att ramen inte bestämmer gemensamma schemadagar/grupper. Ta bort paketkommandon, paketanalys och det tidigare operativa utbudsflödet från användarinstruktionerna. Ange kort att separat skolutbud/elevval/undervisningsorganisation ännu saknas och att äldre sparade uppgifter bevaras; ingen teknisk API/GSD-detalj i handboken.

  Dokumentera senare beslut och faktiska nya prov i SUMMARY/STATE/ROADMAP/research. C/D-placeringen anges som historisk, och E:s kvarvarande fullplansverifiering anpassas till programramen. Låt ADMIN-02/ADMIN-03 och hela 05-23 vara öppna; definiera inte en ny komplett skolutbud-/studieplans-/schemafunktion inom denna rättning. Commita bara de avgränsade ändringarna och kontrollerade resultat, pusha aktuell gren enligt AGENTS och kontrollera avsedd fjärrcommit.
  </action>
  <verify>npm run docs:build; git diff --check; kontrollera handboken mot det faktiskt prövade UI:t och att GSD skiljer aktuella, historiska och väntande prov.</verify>
  <done>Handboken bygger och beskriver aktuell arbetsyta. Senare användarbeslut och bevarandegränser kan följas i GSD utan obestyrkta verifierings- eller integrationsbesked.</done>
</task>

</tasks>

<success_criteria>
Programplanerna saknar språkpakets- och valpaketshantering, men behåller korrekt programram, fasta nivåer och blockens terminsfördelning. Öppning, analys och kullkopiering använder inga paketkommandon. Befintliga paketuppgifter/versioner och tidigare verksamhetsrader är bevarade. Dator-/telefonprov och handboksbygge är dokumenterade. En separat utbuds-/elevvals-/organisationsarbetsyta är uttryckligen kvarstående arbete.
</success_criteria>

<output>
Faktiska verifieringsresultat och källrevision förs in som nytt avgränsat avsnitt i 05-23-SUMMARY.md. Den här planen innehåller avsikt och godkännandekriterier, inte påståenden om redan utförda prov. Mänsklig begriplighetsbedömning förblir awaiting_user.
</output>
