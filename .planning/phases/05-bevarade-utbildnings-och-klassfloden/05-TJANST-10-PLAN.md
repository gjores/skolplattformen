---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-10
type: execute
wave: 7
depends_on: ["TJANST-09"]
files_modified: ["web/lib/tjanst-journal.ts", "web/lib/tjanst-journal.test.mjs", "web/app/tjanst-personal.tsx", "web/app/tjanst-personal.css", "web/app/tjanst-workspace.tsx", "web/e2e/fixtures/tjanst-preview.tsx", "web/e2e/fixtures/tjanst-preview.html", "web/e2e/tjanst-personal.spec.ts", "web/playwright.tjanst-preview.config.ts"]
autonomous: true
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
local_acceptance: [TJ1-02, TJ1-09, TJ1-10]
must_haves:
  truths: ["Rektor ser rätt persons anställningar och tidsbegränsade skoluppdrag utan att skapa en ny helårsram per skola.", "En person kan finnas utan inloggningskonto; detta ger inga automatiska åtkomsträttigheter.", "Sparat betyder verifierat serverresultat; borttappat svar, omladdning och uppdragsbyte kan inte ge dubbelregistrering eller visa en annan persons uppgifter."]
  artifacts: ["web/lib/tjanst-journal.ts", "web/app/tjanst-personal.tsx", "web/app/tjanst-workspace.tsx", "web/e2e/tjanst-personal.spec.ts"]
  key_links: ["Vald kund/skola/person/period → personal/lasa → rätt anställning och skoluppdrag", "Oförändrad kommandobegäran → personal/kommando → status → verifierad omläsning", "Kontokopplingens verifierade person-ID → egen åtkomst; namn och lokal rollväljare ger inget mandat"]
---

<objective>
Ge rektor en begriplig person- och tjänstegrund samt ett återhämtningsbart gemensamt arbetssätt för paketets UI. Huvudmannen ser endast sina tillåtna personal-/avtalsåtgärder. Skyddad API/SQL från 09 ska redan vara faktiskt prövad. Komponenten kopplas till produktnavigationen samlat i 16; inga ofärdiga flikar aktiveras här.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-09-SUMMARY.md
@web/app/protected-home.tsx
@web/app/protected-class-cohorts.tsx
@web/lib/unsaved-changes.tsx
@web/lib/server-client.ts
@web/lib/tjanst-personal.ts
</context>

<tasks>
<task type="auto">
<name>1. Bygg gemensam scopebunden återhämtning för tjänstekommandon</name>
<files>web/lib/tjanst-journal.ts; web/lib/tjanst-journal.test.mjs</files>
<action>Implementera en snäv journaladapter för paketets personal/avtal/plan/bedömning/egen och senare överföring. Följ de färdiga kommandotyperna, samma commandId, exakt payload, expectedRevision och serverns statuskontrakt. Särskilj oskickat utkast, MFA-nekat, okänt utfall och kvitto som väntar omläsning. Bind journalen till session/tenant/mandat/operation/objekt och rensa eller isolera den vid scope-/identitetsbyte; gör aldrig namnmatchning. Återanvänd serverbaserad status där den finns; lagra inga motiveringar, synpunkter eller personuppgifter i URL/localStorage. Eventuell minimal sessionStorage-referens följer kontraktets dataminimering. Osparad känslig payload hålls endast i minne; efter reload återhämtas serverkvittot genom minimal referens. Om servern definitivt inte mottagit en begäran vars lokala text har förlorats måste användaren skapa ett nytt granskat utkast, inte återspela rekonstruerat innehåll som samma kommando. Om säker journal inte kan skapas skickas inget. Alla nya writes, byte av person/period och beslut är spärrade under okänt utfall. En egen statusåterläsning återställer bara samma begäran och får aldrig bli blind retry med nytt ID.</action>
<verify>Från web/: node --test lib/tjanst-journal.test.mjs. Pröva förlorat svar före/efter commit, MFA-retur, reload, receiptNeedsRead, ändrat payload med samma ID, två personer, två sessioner/kunder, återkallat mandat och otillgänglig lagring. Journalen får varken visa främmande uppgifter eller återspela som ny aktör.</verify>
<done>Ett entydigt journalgränssnitt och meningsfulla fel-/återhämtningsprov finns för alla UI-komponenter; inga tjänstespecifika kopior av återspelsalgoritmen behövs.</done>
</task>

<task type="auto">
<name>2. Gör person, anställning, avtal och skoluppdrag begripliga</name>
<files>web/app/tjanst-personal.tsx; web/app/tjanst-personal.css</files>
<action>Bygg sökbar personlista och en sammanhängande detaljvy med interna person-ID:n, visningsnamn, konto saknas/kopplat, anställning, avtalsversion, tjänsteform, datum, sysselsättningsgrad och egna skoluppdrag. Skapa/ändra/avsluta tillåtna objekt via personal/{lasa,kommando,status}; aktuella capabilities från servern styr knappar och tydlig aktörsetikett visar Huvudmannens uppgift respektive Rektors uppgift. Huvudmannen skapar/ändrar den gemensamma person-/anställningsgrunden och tilldelar exakt avtalsprofil till rätt anställningsperiod. Rektor skapar/ändrar skoluppdrag inom egna skolor, läser tillåten anställningsgrund och kan föreslå komplettering till huvudmannen, men ändrar inte anställningens centrala avtal eller gemensamma personuppgifter. Använd nya perioder vid ändrad omfattning; visa samlad anställningsram och skolans andel, källansvar och obekräftad källa. Skilda anställningar hålls separata. Visa förklarande enheter för heltidsmått kontra individuellt mått och redan proportionerad tid. Inga löner/personnummer efterfrågas. Konto-/identitetskoppling använder endast kontraktets verifierade flöde; registrering av en person ger inte lärarbehörighet eller nytt skolmandat. Visa kvarvarande uppdrag före avslut, utan att radera historiska beslut. Saknat underlag visas som saknat, inte noll timmar.</action>
<verify>Pröva två avtal, heltid/deltid, byte mitt i året, samma anställning vid två skolor, flera anställningar och person utan konto. Spara, lämna och återöppna samma version. Kontrollera nyhet/ändring/avslut, förbjuden skola, förlorat mandat, konflikt mellan två flikar och saknad individuell årsram. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Huvudmannen kan spara person-/anställningsgrunden och rektor egna skoluppdrag med begripliga förutsättningar; skolfördelning skapar inte flera fulla budgetar och historiken förblir läsbar.</done>
</task>

<task type="auto">
<name>3. Bygg gemensamt skal och pröva personalflödet på dator och telefon</name>
<files>web/app/tjanst-workspace.tsx; web/e2e/fixtures/tjanst-preview.tsx; web/e2e/fixtures/tjanst-preview.html; web/e2e/tjanst-personal.spec.ts; web/playwright.tjanst-preview.config.ts</files>
<action>Skapa ett skal med explicit kontrollerad skola, läsår, person och vald vy samt slot-props för avtal/fördelning/bedömning/egenplan/uppföljning/årsrutiner. Skalet samlar dirty/busy/unknown, fel och fokus; 16 kopplar det till skyddad navigation och rätt planeringskontext. Lärare får ett separat eget scope enligt serverläst scopeKind från07A, inte administrativ planning-context genom ändrad rollsträng. UI visar bara levererade tillåtna slots. Sätt upp en gemensam syntetisk browserharness med verkliga produktkomponenter, syntetiska svar och både dator-/telefonprojekt på egen port; inga aktiva data/3012. Använd tydliga fältnamn, korta förklaringar, sammanfattning före spara och synliga statusord. Lista på dator blir läsbara kort på telefon, tangentbord/fokus fungerar och primära kontroller har minst 44×44 px. Förbered harnessens registrering av senare komponenter genom små separat ägda fixturemoduler i respektive plan, utan samtidiga ändringar av gemensam fixturefil.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-personal.spec.ts. Verifiera inläsning/tomt/fel/omläsning, lyckad sparning, 409, MFA, osäkert utfall, Back/reload och scopebyte på båda skärmar. Granska faktiska skärmbilder och kontrollernas geometri. Märk beviset simulerad API; faktisk helkedja sker i 17.</verify>
<done>Personaldelen går att prova i ett realistiskt gränssnitt med tydlig kontext och säkra övergångar; senare delar kan anslutas utan att byta dess tillståndsmodell.</done>
</task>
</tasks>

<verification>
Statuskontraktet kräver commandId+requestHash+operation+targetRef med färskt mandat, inte originalpayload. Endast replay av mutationen kräver identiskt payload. Verifiera reload efter förlorat svar med raderad minnespayload och minimal sessionStorage-referens; status och behörig omläsning återställer verifierat utfall utan ny blind skrivning.
Stöd för TID-01/03/04/07/08 och personförutsättningar för TJANST-01/05. SS 12000:2024/OpenAPI 2.1.0: stabil Person/Organisation/Duty, externa identifierare, giltighet och källansvar bevaras. Avtals-/kontoobjekt är separata; ingen informationsöverföring eller lärarlegitimation verifieras. Motiveringar och fulla personuppgifter skrivs inte i browserrapporter eller Git. Nio filer hålls i denna plan eftersom journal, personalvy och en gemensam syntetisk UIharness är samma kontrollerbara sparflöde; varje uppgift berör högst fem filer och separata avtals-/fördelnings-/beslutsflöden ligger i egna planer.
</verification>

<success_criteria>
- Alla tillåtna personalåtgärder kan sparas och återläsas med korrekt person, period och skolmandat.
- Delat skoluppdrag ger en gemensam anställningsram och tydligt avgränsad skolandel.
- Simulerade dator-/telefonprov visar begriplig sparning och återhämtning utan falsk framgång.
</success_criteria>

<output>
Skriv 05-TJANST-10-SUMMARY.md med exakt journalgränssnitt, komponentgränssnitt, provnivåer, begränsningar och underlag till 16. Samordnaren gör avgränsad commit/push och uppdaterar paketstatus.
</output>
