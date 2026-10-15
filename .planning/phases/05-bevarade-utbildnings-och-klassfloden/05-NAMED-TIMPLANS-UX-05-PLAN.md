---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-05
type: execute
wave: 4
depends_on: ["NAMED-TIMPLANS-UX-04"]
files_modified: ["supabase/migrations/20261015203000_named_timplan_reads.sql", "supabase/tests/phase5_named_timplan_reads.test.sql", "work/pilot/verify-named-timplan-reads.mjs"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Användaren hittar båda namngivna timplanerna under samma utbildning/skola.", "Klassbundna äldre versioner försvinner inte när en annan serie uppdateras.", "Årsöverblickens timmar och klassantal är tydliga utan falsk gemensam summa."]
  artifacts: ["supabase/migrations/20261015203000_named_timplan_reads.sql", "supabase/tests/phase5_named_timplan_reads.test.sql", "work/pilot/verify-named-timplan-reads.mjs"]
  key_links: ["Gym-, klass- och programplansläsning får exakt serieinfo", "Planeringsrader, sökning, skolgenväg och totalsummor"]
---

<objective>
Läs alla namngivna planer och visa årsunderlag utan godtyckligt senastval.

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
<name>1. Gym-, klass- och programplansläsning får exakt serieinfo</name>
<files>supabase/migrations/20261015203000_named_timplan_reads.sql, supabase/tests/phase5_named_timplan_reads.test.sql</files>
<action>Utgå från senaste phase5_gym_timplan_result i20261012230000_gym_source_content.sql, underlag/read/source i20261005110000 samt phase5_class_underlag/command i20261015101000. Utöka plan/summary/classlink med nested series:{id,name,revision}; gymdetalj nameAtCreation nullable. Ingen serie tillåts passera med fel organizer/offering/unit. Klassunderlag ska visa aktuell annan namedplan/version men bevara klass-ID, giltighetskontroll och en plan per klass/läsår. Klasskommandots resultat/replay behöver förbli strikt bindningsbart, utan förändrad skrivsemantik. När källan är gammal visar planen frozen source plus currentSource; ingen ny uppslagning får omtolka frysta poäng som aktuella.</action>
<verify>SQL/TSparitet med faktiska svar för två series version1, äldre snapshotnull, annan klasslänk, ersattversion och ny source. Verifiera fulla oförändrade gamla originalrader efter rollback.</verify>
<done>Varje timplan och klasskoppling identifieras med namn, egen serie och exakt version.</done>
</task>

<task type="auto">
<name>2. Planeringsrader, sökning, skolgenväg och totalsummor</name>
<files>supabase/migrations/20261015203000_named_timplan_reads.sql, supabase/tests/phase5_named_timplan_reads.test.sql, work/pilot/verify-named-timplan-reads.mjs</files>
<action>Uppdatera senaste phase5_planning_year_rows i20261012160000_programplan_school_timplan.sql samt sorted/revision/totals/list/overview i20261006120000. För timplansvy: ta alla explicit klassbundna versioner per serie för valt år plus aktuell planversion per annan serie enligt befintlig statusprioritering; undertryck inte B för att A har klasslänk. Programplansvy behåller en programram men schoolTimplans-lista istället för en godtycklig schoolTimplan limit1. Sök omfattar plannamn och stabil sortordning får serie/planID som tiebreaker. Fingeravtryck tar namnrevision och alla relevanta refs så namnbyte/samtida ändring ger konflikt över paginering. Överblick visar timmar per namedplan; deduplicera samma planversion/år/kolumn och samma klass-ID. Gemensamma programpoäng räknas en gång, alternativ planerad tid får aldrig presenteras som sammanlagd bemanning eller en enda kulls timplan. Behåll saknad/okänd/prognos och GY/GR/IM semantik.</action>
<verify>SQLfall över flera sidor (>50rader), filter/sort/query, tvåserier plus äldre klassbunden version, Aår1/Bår2, saknade timmar/klasser och gemensam programram. Kontraktsparitet jämför SQLtotals med TypeScriptberäkning; inget >10000-resultat kringgår skyddsgränser.</verify>
<done>Alla relevanta namedplanvarianter går att hitta, rätt version öppnas och överblicken döljer inte olika timfördelningar.</done>
</task>

</tasks>

<verification>
SQL/TSparitet med faktiska svar för två series version1, äldre snapshotnull, annan klasslänk, ersattversion och ny source. Verifiera fulla oförändrade gamla originalrader efter rollback. SQLfall över flera sidor (>50rader), filter/sort/query, tvåserier plus äldre klassbunden version, Aår1/Bår2, saknade timmar/klasser och gemensam programram. Kontraktsparitet jämför SQLtotals med TypeScriptberäkning; inget >10000-resultat kringgår skyddsgränser.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Användaren hittar båda namngivna timplanerna under samma utbildning/skola.
- Klassbundna äldre versioner försvinner inte när en annan serie uppdateras.
- Årsöverblickens timmar och klassantal är tydliga utan falsk gemensam summa.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-05-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
