---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-04
type: execute
status: implemented-awaiting-integrated-verification
wave: 3
depends_on: [PLANNING-FLOW-UX-03]
autonomous: true
files_modified:
  - web/lib/server/apl-plan.ts
  - web/lib/server/apl-plan.test.mjs
  - web/lib/server/plan-decision.ts
  - web/lib/server/plan-decision.test.mjs
  - web/lib/server/named-timplan.test.mjs
must_haves:
  truths:
    - Servern verifierar separata tabell- och APL-villkor
    - Godkänd timplan förblir låst medan rätt APL-process är redigerbar
    - Gamla beslutsresultat visas med sin historiska innebörd
  artifacts:
    - web/lib/server/apl-plan.ts
    - web/lib/server/apl-plan.test.mjs
  key_links:
    - Aktuellt skolmandat och exakt planversion följer genom hela arbetsflödet.
    - Samma kontrakt prövas i modell, skyddad server och faktisk lokal kandidat.
---
<objective>
Koppla nya kontrakt till skyddade API-vägar med oberoende omräkning och säkert gammalt replay.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-PLAN.md
@web/lib/server/apl-plan.ts
@web/lib/server/apl-plan.test.mjs
@web/lib/server/plan-decision.ts
@web/lib/server/plan-decision.test.mjs
@web/lib/server/named-timplan.test.mjs
</context>
<tasks>
<task type="auto">
<name>1. Projektionskontroll för separat APL</name>
<files>web/lib/server/apl-plan.ts, web/lib/server/apl-plan.test.mjs</files>
<action>Anpassa serverprojektion till revisionScope/timplanRevision och capabilities från separat process. Kontrollera oberoende scope, innehållshash, årsram/allokering och aktuell rektorsbekräftelse. Blanda inte p.canPlan för låst timtabell med APL canSave. Läs/status/kommando behåller nuvarande origin/MFA/uppdragsskydd. Äldre kommandon är replay-only; okänd gammal request får tydligt konfliktbesked, inte ny implicit skrivning.</action>
<verify>Server Node: ny/äldre envelope, roll/scope, båda revisioner, falska capabilities, falsk currentConfirmationId, falsk aktuell HMgranskning, granska utan aktuell rektorsbekräftelse, exact replay och felstatus.</verify>
<done>API kan läsa/spara/bekräfta efter timbeslut enligt separat lifecycle utan att försvaga mandat.</done>
</task>
<task type="auto">
<name>2. Verifiera timtabellsbeslut och historiska gränser</name>
<files>web/lib/server/plan-decision.ts, web/lib/server/plan-decision.test.mjs, web/lib/server/named-timplan.test.mjs</files>
<action>Uppdatera omräkning till nytt timbeslutskontrakt utan APLperiod-grind; behåll GUT, full matris, fastställt programunderlag, valvägar, skolmandat och HM-beslut. Inkomna gamla receipts väljer historisk parser/omräkning. Skilj nya beslutshashar/checklistor från gamla; oändrat commandId med nytt kontrakt ska nekas. Lägg named/newversion/copieringsregression som bevarar APL-processens exakta planrelation.</action>
<verify>Node: inga perioder tillåtet för nya timbeslut, samma underlag nekas i gammalt kontraktsfall där historiska regler gällde, falska servermatriser nekas, gammalt receipt exakt, named-version/copy bevarad.</verify>
<done>Ingen väg kan kringgå timtabellskrav eller göra gammalt beslut mer omfattande än det var.</done>
</task>
</tasks>
<verification>Rutter behöver bara ändras om konkret parserkoppling kräver det; bevara befintliga endpoints och rate/permissionkontroller. Integrerad typkontroll krävs före UI.</verification>
<success_criteria>Servern verifierar separata tabell- och APL-villkor; Godkänd timplan förblir låst medan rätt APL-process är redigerbar; Gamla beslutsresultat visas med sin historiska innebörd. Bevis och kvarstående begränsningar redovisas, inte antas.</success_criteria>
<output>Skapa 05-PLANNING-FLOW-UX-04-SUMMARY.md med ändringar, verifiering och avvikelser. Avgränsad commit/push görs av ansvarig implementerare efter kontroller; root samordnar delad arbetskopia.</output>
