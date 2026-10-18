---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-06
type: execute
status: completed
wave: 5
depends_on: [PLANNING-FLOW-UX-05]
autonomous: true
files_modified:
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
  - docs/handbok/apl-planering.md
  - work/pilot/verify-planning-flow-api.mjs
  - work/pilot/planning-flow-browser-scenarios.mjs
  - work/pilot/deliver-planning-flow.mjs
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-VERIFICATION.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-RELEASE.md
must_haves:
  truths:
    - Den kompletta arbetsgången fungerar med verklig lokal OIDC/Worker
    - Historiska data/mandat och godkända tabeller bevaras vid installation
    - Handbok och användarinstruktion beskriver faktisk separat APL-process
  artifacts:
    - docs/handbok/programplaner.md
    - docs/handbok/timplaner.md
  key_links:
    - Aktuellt skolmandat och exakt planversion följer genom hela arbetsflödet.
    - Samma kontrakt prövas i modell, skyddad server och faktisk lokal kandidat.
---
<objective>
Verifiera verkligt skyddat flöde på dator/telefon, uppdatera handboken och överför exakt prövad kandidat lokalt.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-PLAN.md
@docs/handbok/programplaner.md
@docs/handbok/timplaner.md
@docs/handbok/apl-planering.md
@work/pilot/verify-planning-flow-api.mjs
@work/pilot/planning-flow-browser-scenarios.mjs
@work/pilot/deliver-planning-flow.mjs
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-VERIFICATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-RELEASE.md
</context>
<tasks>
<task type="auto">
<name>1. Uppdatera handbokens arbetsgång</name>
<files>docs/handbok/programplaner.md, docs/handbok/timplaner.md, docs/handbok/apl-planering.md</files>
<action>Beskriv programplan, timtabell och senare APL som separata steg. Förklara sparning, årsramar, godkännande utan perioder, rektors bekräftelse och huvudmannens granskning. Bevara datum/veckovägledning och befintliga regelkällor; nya rättsliga påståenden kräver egen aktuell primärkällkontroll.</action>
<verify>Kör npm run docs:build från projektroten. Kontrollera att texter och knappar stämmer mot faktisk UI.</verify>
<done>Handboken förklarar det implementerade flödet och skiljer planering från genomförande.</done>
</task>
<task type="auto">
<name>2. Faktisk slutverifiering</name>
<files>work/pilot/verify-planning-flow-api.mjs, work/pilot/planning-flow-browser-scenarios.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-VERIFICATION.md</files>
<action>Bygg skyddad kandidat i privat separat checkout; kör isolerad schema-only snapshot med egna syntetiska skolor/identiteter och riktig OIDC på dator/telefon, retries0. Bind källa/migration/artefakt/rapporter/bilder, granska skärmbilder separat.</action>
<verify>Relevant Node, tsc, oxlint, skyddat bygge; faktisk skapa programplan/rektorsmandat/HMgodkännande→namngiven timplan/klasskoppling→årsAPL utan period→HMgodkänd timtabell→senare APLsave/rektorsconfirm/HMgranska, ändra APL och se att granskningen behöver förnyas utan ändrad timtabell. Högskoleförberedande negativt UIprov ska vänta på synlig redigerbar skoltimtabell. Bekräfta gamla receipts, samtidighet och komplett cleanup.</verify>
<done>FLOW-01–07 har tydliga aktuella bevis; ingen syntetisk körning påstås vara verklig kommunanslutning.</done>
</task>
<task type="auto">
<name>3. Exakt lokal installation, byte och resultatuppdatering</name>
<files>work/pilot/deliver-planning-flow.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-RELEASE.md</files>
<action>Återanvänd granskade install-/deliverymönster med nya exakta migreringshashar och bevis; förkontroll av aktiv schema/kandidat/runtime och hela originaltabellers bevarande. Installera verifierat paket och byt till samma testade artefakt inom aktuell auktorisering. Bygg aldrig aktiv dist. Läsande verkligt OIDC-efterprov och kontroll att historiska tabeller/beslut/relationer/rättigheter inte ändrats. Stoppa med sann återhämtningsstatus vid fel; aldrig legacyapp efter nya inkompatibla writes. Root uppdaterar STATE/PROJECT/ROADMAP, begränsad kravspårning och användarprov, commit/push med remoteSHA.</action>
<verify>Installations-/leveransproof matchar frysta källor och aktiva bytes; schema-/rad-/rättighetsbevarande och read-only efterprov PASS.</verify>
<done>Endast efter godkänd leverans kan3012 sägas vara uppdaterad; mänsklig begriplighet och full fasacceptans särredovisas.</done>
</task>
</tasks>
<verification>Ursprungliga pilotantal88/100 och3/8 ändras inte av lokala delkriterier. Bevara alla första felrapporter och dokumentera verkliga begränsningar.</verification>
<success_criteria>Den kompletta arbetsgången fungerar med verklig lokal OIDC/Worker; Historiska data/mandat och godkända tabeller bevaras vid installation; Handbok och användarinstruktion beskriver faktisk separat APL-process. Bevis och kvarstående begränsningar redovisas, inte antas.</success_criteria>
<output>Skapa 05-PLANNING-FLOW-UX-06-SUMMARY.md med ändringar, verifiering och avvikelser. Avgränsad commit/push görs av ansvarig implementerare efter kontroller; root samordnar delad arbetskopia.</output>
