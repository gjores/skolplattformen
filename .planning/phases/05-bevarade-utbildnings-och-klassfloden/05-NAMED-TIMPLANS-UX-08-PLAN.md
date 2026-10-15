---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-08
type: execute
wave: 7
depends_on: ["NAMED-TIMPLANS-UX-07", "NAMED-TIMPLANS-UX-01"]
files_modified: ["web/app/protected-gym-timplan-workspace.tsx", "web/app/protected-gym-timplan.css", "web/app/plan-decision-panel.tsx", "web/app/plan-decision.css", "web/app/protected-programplan-workspace.tsx", "web/e2e/named-timplans.spec.ts"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Varje namngiven plan har tydligt namn, version och beslutsstatus.", "Programplanens utkast ser inte fastställt ut.", "Övergångar behåller skola, läsår och exakt vald plan."]
  artifacts: ["web/app/protected-gym-timplan-workspace.tsx", "web/app/protected-gym-timplan.css", "web/app/plan-decision-panel.tsx", "web/app/plan-decision.css", "web/app/protected-programplan-workspace.tsx", "web/e2e/named-timplans.spec.ts"]
  key_links: ["Ny timplan, ny version och namnbyte som olika åtgärder", "Knyt ihop programplan, klasser, timplan och beslut"]
---

<objective>
Gör namngivna planer, egen versionshistorik och nästa steg begripliga i arbetsytan.

Resultatet ingår i det avgränsade gapet, inte i ett automatiskt godkännande av hela fas 5.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
</context>

<tasks>

<task type="auto">
<name>1. Ny timplan, ny version och namnbyte som olika åtgärder</name>
<files>web/app/protected-gym-timplan-workspace.tsx, web/app/protected-gym-timplan.css, web/e2e/named-timplans.spec.ts</files>
<action>Utgå från v2-klasser/timplan, bygg på befintlig gymworkspace. Visa aktuellt plannamn tydligt, version/status/källa separat och flera namngivna planer i samma skolas lista. Skapa ny timplan kräver namn och kan välja verifierad befintlig fördelning som kopia; granskningen anger vad som kopieras/resetas och att originalet består. Ny version behåller serie; Byt namn ändrar bara benämning. Gör en huvudåtgärd per aktuellt läge, flytta metadata/historik till sekundär yta. Requestjournal bindas till kund/uppdrag/skola/källa; nätavbrott/MFA/reload får aldrig nyttcommandId eller påstådd framgång. GYhoursEditor och dess radvisa autospar/spärrar bevaras. Vid namnkonflikt behåll inmatning, visa begripligt råd och kräv ny granskning för ändrad request.</action>
<verify>Mockade UIprov på dator/telefon: tvåplaner båda v1, skapa frånkopierat/Aextra matematik, omdöpning, egen nyversion, samma-/annankälla, namnkonflikt, osäkert svar/reload/MFA och navigationsspärr. Granska kompakt telefonlayout och tangentbordsfokus.</verify>
<done>Användaren ser skillnad på separat plan, version och namn utan teknisk förklaring.</done>
</task>

<task type="auto">
<name>2. Knyt ihop programplan, klasser, timplan och beslut</name>
<files>web/app/plan-decision-panel.tsx, web/app/plan-decision.css, web/app/protected-programplan-workspace.tsx, web/e2e/named-timplans.spec.ts</files>
<action>Återanvänd befintliga navigationscallbacks/planlocation där möjligt och bevara skola/läsår/utbildning/valdexaktversion. Visa programplan → klasser → timplaner → klasskopplingar som arbetsmoment med verkliga statusord, inte en obligatorisk wizard som spärrar frivilligt klasssteg. Programplansutkast visar Utkast/Sparad utan grön godkändbock. Beslutspanel och historik visar namngivenserie/version och namn vid beslut när känt; legacy okänd namnhistorik märks tydligt. Flera skolplaner gör genvägen till ett val av timplan, inte automatöppning av första arrayposten. Slutförd klassskapning visar nästa relevanttimplansåtgärd men skapar ingen koppling automatiskt.</action>
<verify>UIprov från befintligprogramplan och frånnyutbildning, återöppning/Back/reload, huvudmanläsläge, ändrad skola/år och draft/fastställdskillnad på dator/telefon. Typ/lint; inga påståenden om ofullständigmockregel kring automatiskt lås vidkullstart.</verify>
<done>Arbetsmomenten hänger ihop och rätt scope/version följer användaren utan automatisk mutation.</done>
</task>

</tasks>

<verification>
Mockade UIprov på dator/telefon: tvåplaner båda v1, skapa frånkopierat/Aextra matematik, omdöpning, egen nyversion, samma-/annankälla, namnkonflikt, osäkert svar/reload/MFA och navigationsspärr. Granska kompakt telefonlayout och tangentbordsfokus. UIprov från befintligprogramplan och frånnyutbildning, återöppning/Back/reload, huvudmanläsläge, ändrad skola/år och draft/fastställdskillnad på dator/telefon. Typ/lint; inga påståenden om ofullständigmockregel kring automatiskt lås vidkullstart.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Varje namngiven plan har tydligt namn, version och beslutsstatus.
- Programplanens utkast ser inte fastställt ut.
- Övergångar behåller skola, läsår och exakt vald plan.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-08-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
