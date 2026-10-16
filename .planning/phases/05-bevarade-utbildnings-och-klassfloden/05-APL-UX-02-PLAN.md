---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-UX-02
type: execute
wave: 2
depends_on: [APL-UX-01]
status: complete
autonomous: true
files_modified:
  - web/app/protected-apl-plan.tsx
  - web/app/protected-apl-plan.css
  - web/e2e/apl-plan.spec.ts
  - web/e2e/fixtures/apl-plan-preview.tsx
  - docs/handbok/timplaner.md
must_haves:
  truths:
    - Årskurs och termin väljs en gång och läsåret visas automatiskt.
    - Preliminär terminsplan kan sparas före ämnen, datum och omfattning.
    - Gamla flerminperioder och allokeringar förblir synliga och bevarade.
  artifacts:
    - web/app/protected-apl-plan.tsx
    - docs/handbok/timplaner.md
  key_links:
    - uttryckligt terminsval till befintlig journalbundna save-command
    - fryst timplanskälla till härlett läsår
---

<objective>
Gör första planeringssteget litet och begripligt, med senare precisering och bevarat äldre underlag. APLUX-01–03 och 05.
</objective>
<context>
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-01-SUMMARY.md
@web/app/protected-apl-plan.tsx
@web/lib/planning-year-model.ts
@web/e2e/apl-plan.spec.ts
</context>
<tasks>
<task type="auto">
<name>Årskurs och termin först, detaljer senare</name>
<files>web/app/protected-apl-plan.tsx, web/app/protected-apl-plan.css</files>
<action>Första rendern visar namn, årskurs/termin och härlett läsår. Återanvänd projectGymTimplanYear; vårstart får samma index som tidigare, okänd källa får inget påhittat läsår. Lägg datum, omfattning, granskning och ämnesinnehåll i tydliga utfällbara delar. Spara terminsutkast genom befintlig granska/spara-kedja utan ämneskrav; visa tydligt sparbesked och nästa steg. Bekräftelseblockerare ska inte dominera första steget som sparfel. Vald termin visas en gång i normalfallet, med möjlighet till fler terminer. Sparade värden i andra terminer måste alltid synas och ingå i payload. Äldre flerminperioder tvingas inte till ett terminsval. Inga datum/minuter flyttas eller raderas när avsikt ändras; gammalt underlag får ingen tyst ny nyckel. Bevara journal/återhämtning, fokus/scroll, dirty-skydd, rektorsbekräftelse och huvudmannabeslut.</action>
<verify>Riktad typ/lint samt inspektion av verkliga preview-payloads för tomt utkast och äldre flerminperiod. Inga syntetiska namn/datum/0-allokeringar eller tappade andra terminsvärden.</verify>
<done>Normalfallet väljer årskurs/termin en gång, kan sparas direkt och preciseras senare.</done>
</task>
<task type="auto">
<name>Prova dator, telefon och tangentbord</name>
<files>web/e2e/apl-plan.spec.ts, web/e2e/fixtures/apl-plan-preview.tsx</files>
<action>Prova terminsutkast→granska→spara→återläs, datumprecisering, vårstart, okänd källa, gammal period utan nytt fält, flerminallokering, terminsbyte utan dataförlust, oförändrad omsparning, ändring efter bekräftelse samt befintliga scope-/journal-/MFA-fall. Pröva tangentbord, dialogscroll och att sticky planeringsbar inte döljer rubrik/fokus. Granska skärmbilder på båda enheterna. Preview är simulerad API och ska redovisas som det.</action>
<verify>Kör relevant Playwright-spec i befintliga dator-/telefonprojekt med retries 0 och relevanta APL-beslutsregressioner. Bevara första fel och granska nya bilder.</verify>
<done>Båda enheter och äldre bevarandefall passerar; faktisk databas/HTTP hävdas inte av preview.</done>
</task>
<task type="auto">
<name>Uppdatera användarhandboken</name>
<files>docs/handbok/timplaner.md</files>
<action>Beskriv välj årskurs/termin, spara preliminärt och precisera senare med kort exempel. Behåll skillnaden mellan sparande, rektorsbekräftelse, huvudmannabeslut och faktiskt genomförande. Datum krävs fortfarande inför bekräftelse. Visa läsårsautomatik och flerterminsfördelning utan tekniska detaljer.</action>
<verify>Kör npm run docs:build från roten och jämför texten med provat UI.</verify>
<done>Handboken beskriver verifierat beteende och bygger.</done>
</task>
</tasks>
<verification>Terminsavsikt är inte faktisk kalenderhändelse enligt SS 12000; inga falska datum eller nya objektrelationer skapas. Relevant Node, typkontroll och app/lib lint passerar.</verification>
<success_criteria>APLUX-01–03/05 har UI- och handboksbevis. Ny mänsklig begriplighetsbedömning återstår.</success_criteria>
<output>Skriv 05-APL-UX-02-SUMMARY.md med dator/telefon, bildgranskning och handboksbygge. Scoped commit/push enligt AGENTS.</output>
