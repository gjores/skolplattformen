---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-02
type: execute
wave: 1
depends_on: []
files_modified: ["supabase/migrations/20261015200000_named_timplan_series.sql", "supabase/tests/phase5_named_timplan_series.test.sql", "work/pilot/verify-named-timplan-series.mjs"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Befintliga länkar och beslut öppnar exakt samma planversion efter migreringen.", "Gamla skrivvägar kan inte skapa oavsiktliga parallella kedjor.", "Alla nya metadata är kund-/skolavgränsade och gamla tidsstämplar bevaras."]
  artifacts: ["supabase/migrations/20261015200000_named_timplan_series.sql", "supabase/tests/phase5_named_timplan_series.test.sql", "work/pilot/verify-named-timplan-series.mjs"]
  key_links: ["Backfilla en stabil serie per befintlig utbildning/skola", "Gör mellanläget säkert för befintliga skrivvägar"]
---

<objective>
Inför additiv serieidentitet utan att aktivera parallella kedjor eller ändra befintliga beslut.

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
<name>1. Backfilla en stabil serie per befintlig utbildning/skola</name>
<files>supabase/migrations/20261015200000_named_timplan_series.sql, supabase/tests/phase5_named_timplan_series.test.sql</files>
<action>Skapa public.timplan_series(id,organizer_id,offering_id,unit_id,name,normalized_name,revision,legacy_default,created_at,updated_at). Namnkontrakt: btrim endast U+0020, 1–80 Unicodekodpunkter, förbjud Unicode Cc/Cf/Cs, ingen NFC eller kollaps av inre blanksteg. normalized_name=lower(name), unik inom offering/unit. En legacy_default per offering/unit. Lägg timplans.series_id och nullable name_at_creation; befintliga namnögonblicksbilder förblir NULL. Backfilla EN serie Grundfördelning per gammal offering/unit, alla skolformer, med exakt samma timplan-ID:n och versionsnummer. Bevara varenda gammal kolumn inklusive updated_at; inventera timplans_touch och gym-guards, använd endast transaktionsbegränsad exakt triggerhantering för egna tillägg och återställ exakta definitioner/aktivering. Validera sammansatt kund/utbildning/skola-FK och serieversioners tillhörighet. Behåll gamla timplans_offering_unit_version_unique, timplans_one_open och timplans_one_decided under denna plan; inget parallellt flöde aktiveras.</action>
<verify>Kör migrationsfil och SQL-prov i rollback mot assertTarget(protected): fulla gamla projektioner exakt lika, tomma/singel/multiversionskedjor och GY/GR/IM. Kontrollera inga nya grants/RLSöppningar, inga ändrade plan-/klass-/elev-/besluts-ID:n.</verify>
<done>Alla gamla kedjor har en stabil serie, alla gamla värden och historiska begränsningar består.</done>
</task>

<task type="auto">
<name>2. Gör mellanläget säkert för befintliga skrivvägar</name>
<files>supabase/migrations/20261015200000_named_timplan_series.sql, supabase/tests/phase5_named_timplan_series.test.sql, work/pilot/verify-named-timplan-series.mjs</files>
<action>Lägg kontrollerad insert-default som för en gammal timplaninsert utan series_id finner eller atomiskt skapar dess legacy_default-serie och sätter nya versionens name_at_creation. Den får aldrig välja en godtycklig icke-defaultserie; explicit fel kund/utbildning/skola nekas. Nya serieobjekt är stängda för direkta klient- och Workerwrites; säkerhetsdefinerare har smal fast search_path och råACL inventeras. Gamla RPC kan fortfarande skapa första timplan eller nästa version i samma kedja. Behåll gamla unika index tills plan04 samtidigt aktiverar säkra nya create-/decisionvägar. Ingen bred audit-/guardbypass får överleva migrationstransaktionen. Skriv återanvändbar rollback-runner med privata råresultat och källa/DDL/ACL/journal/före-efterfingeravtryck; förbered inga permanenta mutationer av användardata.</action>
<verify>Kör Node-runnern med ingen permanent apply, negativa FK/namn/behörighetsprov och gamla skapande-/beslutsvägar efter additiv migration. Prova gammalt dublett-/öppen-version-skydd och att samma gamla defaultserie återanvänds. Redovisa faktisk SQL, inte flersessionskonkurrens före installerad DDL.</verify>
<done>Schema02 är fristående säkert och bakåtkompatibelt; parallella serier är ännu ej tillgängliga i runtime.</done>
</task>

</tasks>

<verification>
Kör migrationsfil och SQL-prov i rollback mot assertTarget(protected): fulla gamla projektioner exakt lika, tomma/singel/multiversionskedjor och GY/GR/IM. Kontrollera inga nya grants/RLSöppningar, inga ändrade plan-/klass-/elev-/besluts-ID:n. Kör Node-runnern med ingen permanent apply, negativa FK/namn/behörighetsprov och gamla skapande-/beslutsvägar efter additiv migration. Prova gammalt dublett-/öppen-version-skydd och att samma gamla defaultserie återanvänds. Redovisa faktisk SQL, inte flersessionskonkurrens före installerad DDL.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Befintliga länkar och beslut öppnar exakt samma planversion efter migreringen.
- Gamla skrivvägar kan inte skapa oavsiktliga parallella kedjor.
- Alla nya metadata är kund-/skolavgränsade och gamla tidsstämplar bevaras.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-02-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
