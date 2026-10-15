---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-03
type: execute
wave: 2
depends_on: ["NAMED-TIMPLANS-UX-02"]
files_modified: ["supabase/migrations/20261015201000_named_timplan_commands.sql", "supabase/tests/phase5_named_timplan_commands.test.sql", "work/pilot/verify-named-timplan-commands.mjs"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["En ny separat timplan har eget namn och version1 utan att ändra originalet.", "Omdöpning bevarar plan-ID, beslut, timceller och klasskopplingar.", "En ny version räknas inom samma serie."]
  artifacts: ["supabase/migrations/20261015201000_named_timplan_commands.sql", "supabase/tests/phase5_named_timplan_commands.test.sql", "work/pilot/verify-named-timplan-commands.mjs"]
  key_links: ["Ny separat plan och namnbyte med requestbundna kvitton", "Gör nästa-version-kommandot serieavgränsat"]
---

<objective>
Inför separat skapande av namngiven timplan, säker kopia och omdöpning.

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
<name>1. Ny separat plan och namnbyte med requestbundna kvitton</name>
<files>supabase/migrations/20261015201000_named_timplan_commands.sql, supabase/tests/phase5_named_timplan_commands.test.sql</files>
<action>Implementera phase5_named_timplan_create(q jsonb) och phase5_named_timplan_rename(q jsonb) enligt06:s frysta separata kontrakt, med oförändrat rektor/administrator-mandat, aktuell skol-/kund-/källkontroll, MFA/audit och requestbundna kvitton. Ny serie får nytt UUID och version1; copyFromPlanId kopierar verifierade timmar från samma offering/unit utan att ersätta kopieoriginalet eller ta dess beslut. Kräv exakt förväntad käll-/utbildnings-/kopierevision; samma källrad och terminsfördelning krävs för bibehållna timmar, reset redovisas uttryckligt. Namnbyte ändrar endast series name/revision plus append-only namnhistorik/kvitto, aldrig timplansrader, beslut eller klasslänkar. Lås deterministiskt session/kund/källor före serie, kopieplan och kvitto; namnunikhet i samma offering/unit hanteras i SQL. Samma commandId med samma request replayar, förändrad request/aktör/mandat nekas. Ingen delskrivning vid auditfel.</action>
<verify>Rollback-SQL: nya förstaplaner på egna offerings, kopie-/namn-/scope-/MFA-/audit-/replayfall och SQL/TSnamnparitet. Med02:s gamla index ska andra parallella serien ännu nekas atomiskt; det positiva tvåserieprovet aktiveras i04 efter att beslutskedjan är säker. Inga publika/Worker EXECUTE-grants ännu.</verify>
<done>Nya funktioner är skrivna och stängda, gamla runtimevägar fortfarande säkra; inget permanent parallellt stöd påstås.</done>
</task>

<task type="auto">
<name>2. Gör nästa-version-kommandot serieavgränsat</name>
<files>supabase/migrations/20261015201000_named_timplan_commands.sql, supabase/tests/phase5_named_timplan_commands.test.sql, work/pilot/verify-named-timplan-commands.mjs</files>
<action>Utgå från senaste phase5_create_gym_timplan i20261012180000_plan_decision_flow.sql, inte första versionen i20261005110000. Med predecessor härleds series_id och max(version)/öppen-versionkontroll begränsas till den serien; predecessor måste tillhöra rätt offering/unit och följa befintlig tillåten livscykel. Ny version får aktuell series name_at_creation; ingen ny serie skapas. Null-predecessor får bara äldre initial-default-beteende och ska neka tvetydigt flerseriescope. Skriv aldrig om gamla kvitton. Befintliga endpointen replayar gamla kvittensfält exakt enligt gammalt kontrakt; adapter får hämta ny serieinfo från verifierad plan separat, inte ändra historisk kvittens eller återköra mutation. Nya endpointen använder egna requestbundna kvitton med series; dess nya commandId får inte återanvända äldre receipt. Båda vägarna kontrollerar aktuellt mandat innan replay. Inventera även direkta legacyinsertvägar, copy_offering_cohort och skyddad phase5_copy_programplan_education; bevara redan godkänd kullkopieringsregel och inga gamla klasslänkar.</action>
<verify>Prova nästa version inom en serie, fel serie/källrevision, gammalt commandId, kopieoriginalets fulla bevarande och kopiering till ny kull utan gamla klass-/elev-/medlemslänkar. Faktisk parallellitet/fastställande provas i04+11.</verify>
<done>Nytt planobjekt och ny version är skilda serveroperationer; äldre kvitton och copyvägar kan inte förväxla kedjor.</done>
</task>

</tasks>

<verification>
Rollback-SQL: nya förstaplaner på egna offerings, kopie-/namn-/scope-/MFA-/audit-/replayfall och SQL/TSnamnparitet. Med02:s gamla index ska andra parallella serien ännu nekas atomiskt; det positiva tvåserieprovet aktiveras i04 efter att beslutskedjan är säker. Inga publika/Worker EXECUTE-grants ännu. Prova nästa version inom en serie, fel serie/källrevision, gammalt commandId, kopieoriginalets fulla bevarande och kopiering till ny kull utan gamla klass-/elev-/medlemslänkar. Faktisk parallellitet/fastställande provas i04+11.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- En ny separat timplan har eget namn och version1 utan att ändra originalet.
- Omdöpning bevarar plan-ID, beslut, timceller och klasskopplingar.
- En ny version räknas inom samma serie.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-03-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
