---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-10
type: execute
wave: 8
depends_on: ["NAMED-TIMPLANS-UX-08", "NAMED-TIMPLANS-UX-09"]
files_modified: ["web/app/planning-context.tsx", "web/app/planning-context.css", "web/app/protected-plan-list.tsx", "web/app/protected-plan-list.css", "web/app/protected-planning-overview.tsx", "web/lib/protected-plan-location.ts", "web/e2e/named-planning-overview.spec.ts"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Skol-/läsårsvalet är synligt och gemensamt genom planeringsflödet.", "A- och B-klassens olika timfördelningar syns var för sig.", "Telefonflödet ger snabb åtkomst till klassåtgärden."]
  artifacts: ["web/app/planning-context.tsx", "web/app/planning-context.css", "web/app/protected-plan-list.tsx", "web/app/protected-plan-list.css", "web/app/protected-planning-overview.tsx", "web/lib/protected-plan-location.ts", "web/e2e/named-planning-overview.spec.ts"]
  key_links: ["Fast synlig kontext och namngivna planrader", "Årskursöverblick med variantspecifik tid och kompakt mobil"]
---

<objective>
Samla skol-/läsårskontext och visa årets kullar med sina namngivna planvarianter.

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
<name>1. Fast synlig kontext och namngivna planrader</name>
<files>web/app/planning-context.tsx, web/app/planning-context.css, web/app/protected-plan-list.tsx, web/app/protected-plan-list.css, web/lib/protected-plan-location.ts</files>
<action>Anpassa befintlig PlanningContextBar till mockupens gemensamma skol-/läsårsram, men återanvänd current provider/requestChange och navigationsspärrar. Ingen separat konkurrerande årsstate, elevregisterår oförändrat. Planlistan visar plannamn separat från utbildning/version/status, tydliga skol-/kulluppgifter och klassantal för valtår. Programplanraden kan erbjuda flera schoolTimplans att välja; inga index0-/maxversionantaganden. Exakta planID-länkar består över Back/reload och returnpaths; seriesnamn är aldrig URLidentitet. Samordna ny/plandetail/listnavigation med08, ge tomma/okända/behörighetsfel begriplig huvudåtgärd.</action>
<verify>Relevanta planning-context/list-regressioner plus namedlistfall: sökning över >50rader, sort/filter/kull, äldre klassbunden version, tvåplaner v1, Back/reload, uppdragsbyte och pending/unknownwriteblock på dator/telefon.</verify>
<done>Skola och läsår följer arbetet, och rätt namngiven plan går att öppna utan förväxling.</done>
</task>

<task type="auto">
<name>2. Årskursöverblick med variantspecifik tid och kompakt mobil</name>
<files>web/app/protected-planning-overview.tsx, web/app/protected-plan-list.css, web/e2e/named-planning-overview.spec.ts</files>
<action>Utveckla årsöverblicken enligt mockupC med utbildning/kull och relativ årskurs som grupper, inom varjegrupp alla namngivna planvarianter och deras klassanvändning. Visa timmar pervariant och källa/status; använd inte enda aggregate som gör A:s extra matematik osynlig. Programramspoäng en gång och klasser utanverifierad länk/prognos uttryckligt. Handlingslänkar går tillrätt plan/klassflöde medbevaratår. Påtelefon kompaktsammanfattning, expanderbarsekundärinformation och kortväg tillklassåtgärd; inga långa metadatablock först. Saknade eller okända värden förblir okända.</action>
<verify>Mockad+därefter11faktisk desktop/WebKitmobile: A och B olika matematik och total, flerklassersammaplan inte dubbla timmar, årsbyte, tomtår, vårstart, källkonflikt, okänddata, GR/IM regression. Visuell granskning med keyboard/zoom/44px/ingen sidöverströmning.</verify>
<done>Årsöverblicken visar vilka kullar/klasser som använder vilka fördelningar och hur timmarna skiljer sig.</done>
</task>

</tasks>

<verification>
Relevanta planning-context/list-regressioner plus namedlistfall: sökning över >50rader, sort/filter/kull, äldre klassbunden version, tvåplaner v1, Back/reload, uppdragsbyte och pending/unknownwriteblock på dator/telefon. Mockad+därefter11faktisk desktop/WebKitmobile: A och B olika matematik och total, flerklassersammaplan inte dubbla timmar, årsbyte, tomtår, vårstart, källkonflikt, okänddata, GR/IM regression. Visuell granskning med keyboard/zoom/44px/ingen sidöverströmning.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Skol-/läsårsvalet är synligt och gemensamt genom planeringsflödet.
- A- och B-klassens olika timfördelningar syns var för sig.
- Telefonflödet ger snabb åtkomst till klassåtgärden.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-10-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
