---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-03
type: execute
status: implemented-awaiting-integrated-verification
wave: 2
depends_on: [PLANNING-FLOW-UX-02]
autonomous: true
files_modified:
  - supabase/migrations/20261018100000_separate_apl_workflow.sql
  - work/pilot/verify-separate-apl-workflow.mjs
  - work/pilot/verify-separate-apl-workflow.mjs
must_haves:
  truths:
    - En komplett timtabell kan godkännas utan APL-perioder
    - APL kan ändras efter timplansgodkännande utan att tabellbeslut eller timrevision ändras
    - Endast egen rektor kan bekräfta APL och befintliga skolmandat består
  artifacts:
    - supabase/migrations/20261018100000_separate_apl_workflow.sql
    - work/pilot/verify-separate-apl-workflow.mjs
  key_links:
    - Aktuellt skolmandat och exakt planversion följer genom hela arbetsflödet.
    - Samma kontrakt prövas i modell, skyddad server och faktisk lokal kandidat.
---
<objective>
Separera databasens timplansbeslut och APL-livscykel additivt, med faktiskt SQL-bevis och orörda historiska beslut.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-PLAN.md
@work/pilot/verify-separate-apl-workflow.mjs
@work/pilot/verify-separate-apl-workflow.mjs
</context>
<tasks>
<task type="auto">
<name>1. Inför separat APL-revisionsspår och korrekt beslutsscope</name>
<files>supabase/migrations/20261018100000_separate_apl_workflow.sql</files>
<action>Skapa additiv migration med egen privat APL-revisionsrad. Initiera från tydligt definierad befintlig revisionsbaslinje utan att skriva om gamla kvitton/händelser. Behåll nuvarande stabila plan-ID:n. APL-spara, rektorsbekräfta och huvudmannagranska tillåts endast efter fastställd timplan; utkast, återsänd, submitted, ersatt och arkiverad förblir läsbara utan dessa skrivåtgärder. Separat APL-revision ökar vid relevanta skrivningar, godkänd timplansrevision/status/timmar/klasskopplingar ändras inte. Kontrollera båda CAS samt exakt aktuellt planbasis under lås. Nya timplansbeslut ska inte inkludera APL-förläggning i blockerare/basis/checklista; årsram/GUT/ämnesval/ursprung och beslutmandat kvarstår. Rektors APL-bekräftelse och HMgranskning är separata från tabellbeslutet. Rektors APL-bekräftelse binder aktuell APL+timram; HM får endast egen rollbunden granska-händelse efter aktuell rektorsbekräftelse. Händelsen binder APL-contentHash, rektorsbekräftelse-ID och godkänd timplansrevision, med eget audit/replay; inga periodändringar av HM. Senare APLändring gör både rektorsbekräftelse och HMgranskning inaktuella. Äldre receipt returneras före ny livscykelvalidering endast efter full scope/requestmatch. Ingen gammal migration redigeras.</action>
<verify>SQL-rollprov inom isolerad schema-only snapshot; ACL-grants är minsta nödvändiga och inga hjälpare blir publika.</verify>
<done>Separat APL-process fungerar efter godkänt tabellbeslut med korrekt mandat och historik.</done>
</task>
<task type="auto">
<name>2. Bevisa commit, bevarande och samtidighet</name>
<files>work/pilot/verify-separate-apl-workflow.mjs, work/pilot/verify-separate-apl-workflow.mjs</files>
<action>Bygg avgränsad verifierare med egna syntetiska V1/V2-fall och riktiga Worker-grants. Pröva faktiskt COMMIT och återläsning samt SET CONSTRAINTS ALL IMMEDIATE före rollbackprov. Spara första fel, käll-/migrationshashar och cleanup. Gammal approved/replaced historik/receipts och skol-/klassrelationer ska bevaras byte-/betydelsemässigt.</action>
<verify>Fall: tabell utan perioder submit/approve; därefter save/confirm; HM save/confirm nekas; HM review utan aktuell rektorsbekräftelse nekas och med aktuell bekräftelse bevaras egen händelse; rektor/administratör review nekas; ändring gör båda händelser inaktuella; annan/revoked skola/MFA nekas; annualcapacity; stale båda revisioner; APLsave mot timramändring och två samtidiga APLsave; exakt replay; auditfel rullar tillbaka hela skrivningen; archived/replaced nekas.</verify>
<done>FLOW-03–06 har aktuell SQL-evidens och full egen cleanup.</done>
</task>
</tasks>
<verification>Migrationens exakta filnamn får justeras vid tidsstämpelkollision och dokumenteras. Inga aktiva lokala DB-skrivningar i denna plan.</verification>
<success_criteria>En komplett timtabell kan godkännas utan APL-perioder; APL kan ändras efter timplansgodkännande utan att tabellbeslut eller timrevision ändras; Endast egen rektor kan bekräfta APL och befintliga skolmandat består. Bevis och kvarstående begränsningar redovisas, inte antas.</success_criteria>
<output>Skapa 05-PLANNING-FLOW-UX-03-SUMMARY.md med ändringar, verifiering och avvikelser. Avgränsad commit/push görs av ansvarig implementerare efter kontroller; root samordnar delad arbetskopia.</output>
