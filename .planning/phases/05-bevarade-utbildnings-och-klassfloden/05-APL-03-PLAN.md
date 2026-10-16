---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-03
type: execute
wave: 3
depends_on: ["APL-02"]
files_modified: ["supabase/migrations/20261016121000_apl_plan_decisions.sql", "work/pilot/verify-apl-plan-decisions.mjs"]
autonomous: true
status: planned
gap: APL-01
must_haves:
  truths: ["Huvudmannen kan bedöma ett aktuellt APL-underlag och rektors förläggningsbeslut separat.", "Gamla fastställda planer, beslut och kvitton behåller sin historiska innebörd.", "En ny plan eller version får ingen kopierad godkännandestatus."]
  artifacts: ["supabase/migrations/20261016121000_apl_plan_decisions.sql", "work/pilot/verify-apl-plan-decisions.mjs"]
  key_links: ["APL-innehåll → decision basis/hash/blockers → huvudmannens befintliga fastställande", "Tim-/APL-/källändring → innehållsaktualitet för rektorshändelse", "Båda timplansskapvägar → explicit strukturkopia → nytt granskningsbehov"]
---

<objective>
Koppla APL till timplanens verkliga beslutskedja och versionslivscykel med tydlig, bevarande legacyövergång. Inga APL-krav på skolvisa perioder införs i programplanens godkännande.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@supabase/migrations/20261015202000_named_timplan_decisions.sql
@supabase/migrations/20261015201000_named_timplan_commands.sql
@supabase/migrations/20261012230000_gym_source_content.sql
@supabase/migrations/20261014100000_phase5_atomic_cohort_copy.sql
@web/lib/server/plan-decision.ts
</context>

<tasks>

<task type="auto">
<name>1. Versionsbind beslutsunderlag och bevara legacykvitton</name>
<files>supabase/migrations/20261016121000_apl_plan_decisions.sql; work/pilot/verify-apl-plan-decisions.mjs</files>
<action>Inför kontraktets uttryckliga legacy/structured_v1 utan att skriva om gamla beslut, kvitton eller inlämningsstatus. Strukturerad kontroll gäller stödd vocational-timplan; programplansgrenens befintliga apl-check och övriga profiler bevaras. Ny submit/approve av legacy yrkestimplan stoppas med kompletteringsbesked. Befintligt submitted legacyärende kan return/withdraw; strukturerat underlag aktiveras först i utkast/återsänd. Ny submit kräver aktuell faktisk rektorshändelse, explicit stödd form, full granskad omfattning, giltiga innehållskopplingar och exakt varav-fördelning. Decision detail/basis/items/page måste beskriva samma status utan falskt redo. Historiska receipt.result/hashar replayas oförändrat med kontraktsversion; applicera inte dagens nya checks på ett gammalt redan utfört kommando. Bevara huvudmannens exklusiva approve och seriens oberoende beslut.</action>
<verify>Installera isolerat och prova draft/returned/submitted/approved/replaced legacyfall, gammalt submit/approve-replay, return/withdraw, strukturerad ny submit/approve, ändrad APL mellan submit/approve och felaktig rektorsroll. Kontrollera gamla receipt.result och decision_history byteidentiskt samt att programplan och högskoleförberedande timplan fungerar som tidigare.</verify>
<done>Historiken är intakt och nya beslut använder aktuellt APL-underlag utan att klient eller gammalt kvitto kan kringgå kraven.</done>
</task>

<task type="auto">
<name>2. Bevara kopieringsgränser och innehållsaktualitet</name>
<files>supabase/migrations/20261016121000_apl_plan_decisions.sql; work/pilot/verify-apl-plan-decisions.mjs</files>
<action>Koppla både phase5_named_timplan_create och phase5_create_gym_timplan till kontraktets uttryckliga APL-strukturkopia. Källplanens befintliga timmar lämnas orörda; nya planens timmar följer nuvarande copy_rows-kompatibilitet för exakt matchad rad och terminsfördelning. Kopian får egna period-ID:n och nytt granskningsbehov, inga gamla rektorsbeslut eller huvudmannagodkännanden. Ogiltiga rowKey-/terminskopplingar efter källändring får tydligt bortfalls-/granskningsunderlag, aldrig tyst ommappning. Omatchat kopieringsunderlag bevaras i en separat granskningsprojektion, inte som ogiltiga aktiva rowKey-relationer. Skyddad kullkopiering fortsätter kopiera programram enligt dagens omfattning, inte timplaner. Radtimskrivning får aldrig lämna varav APL över totalen; neka motsägelsen med rättningsbesked. En verklig tim-/APL-/källändring gör tidigare rektorshändelse inaktuell, men submit/approve som endast flyttar revision gör det inte. Fastställda versioner ändras inte på plats. Bevara namngivna serier, andra seriers beslut och klassens exakta plan/läsårslänk.</action>
<verify>Faktisk SQL: ny namedplan utan kopiering, explicit kopia och ny version; källrad försvinner, inaktiv termin, timcell under allokerad APL och annan giltig timändring. Submit/approve utan innehållsändring behåller aktuell rektorshändelse. Två serier och två klasslänkar förblir oberoende. Prova copy/save samt approve/save i verkligt överlappande sessioner; originalets timmar och klasslänkar är oförändrade.</verify>
<done>Nya utkast kräver egen granskning, beslut följer innehållet och befintliga klass-/kopieringsflöden bevaras.</done>
</task>

</tasks>

<verification>
APL1-03/04/05/06 stöds i SQL. ADMIN-02/04 och PLANERING-01 bevaras; ingen full krav- eller fasacceptans följer av planen.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Huvudmannen kan bedöma ett aktuellt APL-underlag och rektors förläggningsbeslut separat.
- Gamla fastställda planer, beslut och kvitton behåller sin historiska innebörd.
- En ny plan eller version får ingen kopierad godkännandestatus.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-03-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
