---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-14
type: execute
wave: 10
depends_on: ["TJANST-12"]
files_modified: ["web/app/tjanst-uppfoljning.tsx", "web/app/tjanst-uppfoljning.css", "web/e2e/fixtures/tjanst-uppfoljning-preview.tsx", "web/e2e/tjanst-uppfoljning.spec.ts"]
autonomous: true
status: planned
local_acceptance: [TJ1-02, TJ1-06, TJ1-09, TJ1-10]
must_haves:
  truths: ["Huvudmannen ser vilka skolor som saknar aktuella bedömningar, har resursbrister eller använder ofullständigt avtalsunderlag utan att godkänna tjänsterna.", "Samma anställningsram räknas en gång även när en person arbetar på flera skolor; olika avtal och ofullständiga nämnare döljs inte av totalsiffror.", "En resursåtgärd kan tilldelas ansvarig, följas upp och avslutas med historik utan att ändra rektors individuella beslut.", "Huvudmannens sammanställning visar bara tillåtna individuppgifter och inga privata bedömningstexter."]
  artifacts: ["web/app/tjanst-uppfoljning.tsx", "web/e2e/tjanst-uppfoljning.spec.ts"]
  key_links: ["plan/lasa med HMscope → dataminimerad skolöversikt → rätt nämnare och täckning", "Resursåtgärd → plan/kommando → beständigt ansvar/datum/status → ny uppföljningsläsning", "Individens avvikelse inom rektorsscope → skolans åtgärdsbehov; känslig motivering följer inte med HMprojektionen"]
---

<objective>
Ge huvudmannen uppföljning av bemanning, avtal, bedömningsstatus och resursåtgärder. Detta är T2:s uppföljning av planerat underlag; faktisk tidrapportering och utfallsanalys hör tillT4. Huvudmannen har ingen godkännanderoll i rektors tjänstefördelning.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-12-SUMMARY.md
@web/lib/tjanst-plan.ts
@web/lib/tjanst-journal.ts
@web/app/tjanst-workspace.tsx
</context>

<tasks>
<task type="auto">
<name>1. Visa skolornas bedömningsläge, avvikelser och täckning</name>
<files>web/app/tjanst-uppfoljning.tsx; web/app/tjanst-uppfoljning.css</files>
<action>Bygg huvudmannens översikt från plan/lasa med uttrycklig period och skolurval. Visa antal tjänster, aktuella/saknade/omprövningsbehövande bedömningar, obemannat undervisningsbehov, överfördelad känd budget, kvarstående planeringsbrist och avtalsgiltighet som separata mått. Varje tal har nämnare, täckning och uppdateringstid; blanda inte olika heltidsramar eller summera samma anställningsårsram en gång per skola. Personer kan räknas unikt på huvudmannanivå men personantal, anställningsantal och skoluppdrag ska ha olika rubriker. Använd serverns dataminimerade projektion och visa inte privata bedömningstexter, stödbehov, elevuppgifter eller initiativinnehåll i listor, browsercache eller rapporter. Relevant avvikelse får inte döljas av skolans medelvärde. Rektor kan läsa och hantera egna skolors tillåtna åtgärder genom samma komponent med begränsade capabilities; aldrig välja främmande skola. Länka till exakt tillåten tjänst/åtgärd eller ge aggregerad förklaring när individåtkomst saknas. Använd orden avsatt och planerat; schemaandel/rapporterat utfall visas som Underlag saknas, inte som T4-funktion.</action>
<verify>Prova samma person vid två skolor, två anställningar, två avtalsramar, delvis känd årsram, noll tjänster, saknat underlag och en överbelastad person trots rimligt skolgenomsnitt. Kontrollera totalsummor mot serverns fixtures. Pröva fel skol-/kundurval och att UI inte laddar en full privat payload för att sedan bara gömma kolumner. Från web/: npx tsc --noEmit och npx oxlint app lib.</verify>
<done>Huvudmannen kan se var åtgärder behövs och hur tillförlitligt underlaget är utan falska totalsummor eller otillåten individinsyn.</done>
</task>

<task type="auto">
<name>2. Gör resursåtgärder spårbara och pröva rollskillnaderna</name>
<files>web/app/tjanst-uppfoljning.tsx; web/e2e/fixtures/tjanst-uppfoljning-preview.tsx; web/e2e/tjanst-uppfoljning.spec.ts</files>
<action>Bygg skapa/ändra/avsluta resursåtgärd med vald skola/period, konkret behov, föreslagen/beslutad insats, ansvarig med giltigt tillåtet uppdrag, nästa uppföljningsdatum och status enligt kontraktet. Begränsa text till resursåtgärdens sakuppgifter, inte den personliga bedömningens känsliga innehåll. Historik skiljer huvudmannens resursbeslut från rektors tjänstebeslut. En avslutad åtgärd stänger inte automatiskt en bedömningsavvikelse; visa om underlaget fortfarande visar bristen. Spara genom plan/{kommando,status} och gemensam journal. Ge inga knappar Godkänn tjänstefördelning/Återsänd rektors beslut. Bygg syntetiska browserfall med HM, rektor och otillåten roll; inga e-post-/meddelandeutskick till personer ingår.</action>
<verify>Från web/: npx playwright test -c playwright.tjanst-preview.config.ts tjanst-uppfoljning.spec.ts. Dator/telefon: öppna avvikelse, skapa åtgärd, spara, lämna/återöppna, ändra ansvar/datum/status och avsluta medan ursprunglig brist består. Prova CAS, tappat svar, MFA, reload, återkallat mandat, utgången ansvarig och fel kund. Kontrollera skärmbilder/fokus/minst44×44 samt att gamla individuella beslut förblir oförändrade.</verify>
<done>Huvudmannen och rektor kan följa konkreta tillåtna åtgärder med ansvar och datum utan att tillskrivas varandras beslutsrätt.</done>
</task>
</tasks>

<verification>
Pröva gemensam individuell undervisnings-/PU-ram över skolor enligt SharedAssessmentBasis: tak500 och300+300undervisning ska neka trots tillräcklig totalbudget;300+200 kräver minst600PU utan dubbel förtroendetidsallokering.03A definierar modellen,06 lagrar/prövar gemensam grund och12 låter berörda rektorer bekräfta sina delar. Huvudmannen fastställer inte.
TID-07 och TJANST-04:s uppföljningsdel. SS12000:2024/OpenAPI2.1.0 Organisation/Person/Duty ligger bakom stabilt urval och giltighet. Avtalsaggregat/resursåtgärder är lokala objekt; denna översikt bevisar varken faktisk arbetstid eller kommunanslutning. Produktinkoppling i16 och verklig dataminimerings-/mandatverifiering i17.
</verification>

<success_criteria>
- Huvudmannen ser spårbara brister och underlagstäckning per skola utan nytt godkännandesteg.
- Resursåtgärder kan sparas, återläsas och följas upp utan att skriva om rektors beslut.
- Blandade avtal, delade tjänster och saknade värden ger inga vilseledande totalsummor.
</success_criteria>

<output>
Skriv 05-TJANST-14-SUMMARY.md med HMprojektionens datagräns, provade åtgärder och uttrycklig gräns motT4. Samordnaren hanterar commit/push.
</output>
