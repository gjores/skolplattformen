---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-06
type: execute
wave: 5
depends_on: ["APL-04", "APL-04A"]
files_modified: ["web/app/plan-decision-panel.tsx", "web/app/plan-decision-context.tsx", "web/e2e/apl-decision.spec.ts", "web/playwright.apl-decision.config.ts", "web/e2e/fixtures/apl-decision-preview.tsx", "web/e2e/fixtures/apl-decision-preview.html", "docs/handbok/timplaner.md", "docs/handbok/programplaner.md"]
autonomous: true
status: complete
gap: APL-01
must_haves:
  truths: ["Rektor ser ett eget förläggningsbeslut och huvudmannen ett separat fastställande.", "Gamla ärenden visar en begriplig väg till komplettering.", "Handboken beskriver exakt vad APL-planeringen visar och ännu inte följer upp."]
  artifacts: ["web/app/plan-decision-panel.tsx", "web/e2e/apl-decision.spec.ts", "web/playwright.apl-decision.config.ts", "web/e2e/fixtures/apl-decision-preview.tsx", "web/e2e/fixtures/apl-decision-preview.html", "docs/handbok/timplaner.md"]
  key_links: ["Beslutets aktuella innehåll → rätt rektors-/huvudmannaåtgärd", "Legacy submitted → return/withdraw → komplettering → nytt inskick", "Beslutsunderlag → användarinstruktioner och begränsningar"]
---

<objective>
Gör ansvarshändelser och kompletteringsbehov begripliga i befintligt beslutsflöde och dokumentera det nya användarbeteendet. Ändra inte årsöverblickens generiska totalsummor till ett APL- eller genomförandemått. Ingen ny APL-aggregering i planning-year SQL ingår.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@web/app/plan-decision-panel.tsx
@web/app/plan-decision-context.tsx
@web/lib/plan-decision.ts
@docs/handbok/timplaner.md
@docs/handbok/programplaner.md
</context>

<tasks>

<task type="auto">
<name>1. Visa aktuellt APL-underlag och rätt beslutsåtgärd</name>
<files>web/app/plan-decision-panel.tsx; web/app/plan-decision-context.tsx; web/e2e/apl-decision.spec.ts; web/playwright.apl-decision.config.ts; web/e2e/fixtures/apl-decision-preview.tsx; web/e2e/fixtures/apl-decision-preview.html</files>
<action>Visa planerad omfattning, granskning av timmar/innehåll samt rektorsbeslutets aktör/datum och om det fortfarande gäller innehållet. Förläggningsknappen och APL-kommandot ägs05:s APL-komponent; denna panel visar det sparade resultatet och leder till samma underlag. Ingen annan granskningsalgoritm eller separat APL-journal införs här. Behåll befintlig disabled-prop för samordnarens spärr av tim-/APL dirty/inflight/unknown; alla normala beslutsåtgärder och bekräftelsedialoger måste respektera den. Beredare kan spara men inte imitera rektorsbeslut. Huvudman ser underlaget inför befintligt fastställande och kan återsända. Underlaget måste visas även när ärendet öppnas från beslutsinkorgen, inte bara från timplanseditorn. Befintligt inskickat legacyärende förklarar APL-underlag behöver kompletteras och erbjuder endast tillåtna return/withdraw-vägar. Gamla fastställda beslut visas historiskt utan ny grön strukturerad APL-status. Programplanens nuvarande kontroller får ingen oavsiktlig skolvis APL-spärr. Använd hash-/revisionskonflikter för begriplig omläsning, inte råa tekniska fel.</action>
<verify>Dator/telefon med simuleradAPI i egen playwright.apl-decision.config.ts som matchar apl-decision.spec.ts och separat previewfixtur (ingen aktiv 3012): beredare sparar, rektor beslutar och skickar, huvudman ser samma plan och fastställer/återsänder. Tim-/APL-innehåll ändras och gör rektorsbeslut inaktuellt; ren submitrevision gör det inte. Prova legacy inbox/detail och gamla receiptpresentationer. Neka approve genom doldknapp och direkt routeprov i 04/08, inte bara UI.</verify>
<done>Ansvarsfördelningen syns utan extra tekniska knappar eller påståenden om utförd APL.</done>
</task>

<task type="auto">
<name>2. Uppdatera användarhandboken och bygg dokumentationen</name>
<files>docs/handbok/timplaner.md; docs/handbok/programplaner.md</files>
<action>Beskriv ett sammanhängande flöde: öppna rätt namngivna timplan, välj utbildningsform, planera perioder/innehåll, granska total/varav, spara, rektorsbeslut och huvudmannens prövning. Förklara 23-timmarsomräkningen, delveckors granskningsbehov, äldre timplaners komplettering och att platser/närvaro/lärande ännu inte verifieras. Bevara skillnaden mellan gemensam programplan och skolans timplansvariant. Endast verifierat användarbeteende får presenteras som färdigt; justera efter08 innan release om faktisk implementation avviker. Tekniska migrations- och driftuppgifter stannar i interna dokument.</action>
<verify>Från projektroten npm run docs:build. Läs renderade berörda sidor och kontrollera att länkar, steg och roller överensstämmer medUI. Kör relevanta besluts-UI-prov samt npx tsc --noEmit och npx oxlint app lib vid kodändringar.</verify>
<done>Handboken ger ett begripligt APL-planeringsflöde och bygger utan fel.</done>
</task>

</tasks>

<verification>
APL1-04/07 kan prövas i UI och handbok. Den vanliga planeringsöverblicken bevarar samma kontext och mått; ingen ny huvudmannadashboard för etapp2/3 ingår.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Rektor ser ett eget förläggningsbeslut och huvudmannen ett separat fastställande.
- Gamla ärenden visar en begriplig väg till komplettering.
- Handboken beskriver exakt vad APL-planeringen visar och ännu inte följer upp.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-06-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
