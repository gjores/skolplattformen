---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: PLANNING-FLOW-UX-02
type: execute
status: implemented-awaiting-integrated-verification
wave: 1
depends_on: []
autonomous: true
files_modified:
  - web/lib/apl-plan.ts
  - web/lib/apl-plan.test.mjs
  - web/lib/plan-decision.ts
  - web/lib/plan-decision.test.mjs
  - web/lib/apl-plan-journal.ts
  - web/lib/apl-plan-journal.test.mjs
must_haves:
  truths:
    - Tabellbeslut och APL-förläggning har tydligt olika innebörd
    - Gamla kommandokvitton kan återspelas exakt
    - Två revisioner kan inte förväxlas vid samtidiga ändringar
  artifacts:
    - web/lib/apl-plan.ts
    - web/lib/apl-plan.test.mjs
  key_links:
    - Aktuellt skolmandat och exakt planversion följer genom hela arbetsflödet.
    - Samma kontrakt prövas i modell, skyddad server och faktisk lokal kandidat.
---
<objective>
Definiera separat APL-revision och timtabellsbeslut med strikt kompatibilitet för äldre frysta svar.
</objective>
<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-FLOW-UX-PLAN.md
@web/lib/apl-plan.ts
@web/lib/apl-plan.test.mjs
@web/lib/plan-decision.ts
@web/lib/plan-decision.test.mjs
@web/lib/apl-plan-journal.ts
@web/lib/apl-plan-journal.test.mjs
</context>
<tasks>
<task type="auto">
<name>1. Versionera APL- och beslutskontrakten</name>
<files>web/lib/apl-plan.ts, web/lib/apl-plan.test.mjs, web/lib/plan-decision.ts, web/lib/plan-decision.test.mjs</files>
<action>Förbered timetable_decision_v2 där nytt timplansbeslut har apl:null och inte kräver periodförläggning, med bibehållen parsing av apl_decision_v1 och legacy för historiskt replay. Ny APL-läsning märks revisionScope=apl och timplanRevision; lägg rollbundet review-kommando samt historisk/current huvudmannagranskning bunden till rektorsbekräftelse och samma innehåll; revision är separat APL-CAS. Kommandot binder expectedRevision samt expectedTimplanRevision. Behåll rena årsram-/innehålls-/veckokontroller för APL-bekräftelse. Skriv först negativa kontraktsfall för felaktig korsning av version/revisionsscope; acceptera inte en blandning genom permissiva optionalfält.</action>
<verify>Node kontraktprov för nya och gamla svar, exakt gamla receipts, falsk ready, saknade fält, fel revision scope och extra/felaktiga nycklar.</verify>
<done>Gamla och nya protokoll går att skilja entydigt; årsram utan perioder kan vara komplett timtabell men aldrig komplett APL.</done>
</task>
<task type="auto">
<name>2. Bind journalen till båda revisionsunderlagen</name>
<files>web/lib/apl-plan-journal.ts, web/lib/apl-plan-journal.test.mjs</files>
<action>Lagra exakt nytt kommando före skrivning med båda revisionsunderlagen. Återhämta okänt utfall med samma commandId/status; äldre pågående kommandon får bara återspelas i äldre kontrakt, inte översättas och skickas som nytt. Behåll identity/customer/assignment/plan-scope och maskerad privat lokal lagring.</action>
<verify>Node journalprov: reload/status, ändrat kommando, annan aktör/skola, ändrad timram och nätverksokänt svar.</verify>
<done>APL-journalen kan återhämtas utan dubbelskrivning eller förlorad samtidighetskontroll.</done>
</task>
</tasks>
<verification>Modelländringar är inte installationsbevis. Understryk SS12000-gränsen: egen revisionsidentitet är intern planering, inte Attendance/Placement.</verification>
<success_criteria>Tabellbeslut och APL-förläggning har tydligt olika innebörd; Gamla kommandokvitton kan återspelas exakt; Två revisioner kan inte förväxlas vid samtidiga ändringar. Bevis och kvarstående begränsningar redovisas, inte antas.</success_criteria>
<output>Skapa 05-PLANNING-FLOW-UX-02-SUMMARY.md med ändringar, verifiering och avvikelser. Avgränsad commit/push görs av ansvarig implementerare efter kontroller; root samordnar delad arbetskopia.</output>
