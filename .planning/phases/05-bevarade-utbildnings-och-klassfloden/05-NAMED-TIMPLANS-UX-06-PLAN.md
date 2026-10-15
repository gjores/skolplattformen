---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-06
type: tdd
wave: 5
depends_on: ["NAMED-TIMPLANS-UX-05"]
files_modified: ["web/lib/named-timplan.ts", "web/lib/named-timplan.test.mjs", "web/lib/gym-timplan.ts", "web/lib/gym-timplan.test.mjs", "web/lib/class-timplan.ts", "web/lib/class-timplan.test.mjs", "web/lib/plan-decision.ts", "web/lib/plan-decision.test.mjs", "web/lib/planning-year-contract.ts", "web/lib/planning-year-contract.test.mjs"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Två separata timplaner kan båda heta version1 utan identitetskonflikt.", "Namnändring ändrar varken planversions-ID eller klass-ID.", "Felaktig eller tvetydig scope/namn/version nekas före användning."]
  artifacts: ["web/lib/named-timplan.ts", "web/lib/named-timplan.test.mjs", "web/lib/gym-timplan.ts", "web/lib/gym-timplan.test.mjs", "web/lib/class-timplan.ts", "web/lib/class-timplan.test.mjs", "web/lib/plan-decision.ts", "web/lib/plan-decision.test.mjs", "web/lib/planning-year-contract.ts", "web/lib/planning-year-contract.test.mjs"]
  key_links: ["Ny ren namn-/kommandodomän med negativa prov", "Tråda serie genom befintliga strikta läsparsers"]
---

<objective>
Definiera strikt namngiven serie och bevara exakt identitet genom alla läskontrakt.

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
<name>1. Ny ren namn-/kommandodomän med negativa prov</name>
<files>web/lib/named-timplan.ts, web/lib/named-timplan.test.mjs</files>
<action>Denna första uppgift kan göras parallellt med02 eftersom frysta kontrakt finns här. Skriv parseTimplanSeries({id,name,revision}); normalizeTimplanName trimmar endast U+0020 i kanterna, 1–80 Unicodekodpunkter, förbjud Unicode Cc/Cf/Cs inklusive ensamma surrogater, ingen NFC/collapse. Strikt parseTimplanName nekar icke-kanonisk indata. SQL äger lower-baserad namnunikhet, ingen JS-localegissning. NamedTimplanCreateRequest={commandId,sourcePlanId,expectedSourceRevision,expectedEducationRevision,unitId,name,copyFromPlanId:null|uuid,expectedCopyFromRevision:null|int}; kopieparet måste vara båda null eller båda satta. NamedTimplanRenameRequest={commandId,planId,seriesId,expectedSeriesRevision,name}. Befintlig GymTimplanCreateRequest är fortsatt versionskommandot: predecessor härleder serie; ingen modeflagga eller namnparameter läggs i detta kontrakt. Nekande parser ska hantera extra fält, accessor/prototype/symbol/sparsearray, dåliga UUID/revisioner och gränsfall.</action>
<verify>RED → GREEN: node --test lib/named-timplan.test.mjs från web. Testa 80/81 kodpunkter, astral Unicode, Cc/Cf/Cs, vanliga blanksteg kontra andra separators, nullpar och otillåtna extra nycklar. SQLparitet provas senare mot02/03.</verify>
<done>Publicerade typer är entydiga: ny separat plan är inte ny version, och server/klient kan pröva exakt samma namn.</done>
</task>

<task type="auto">
<name>2. Tråda serie genom befintliga strikta läsparsers</name>
<files>web/lib/gym-timplan.ts, web/lib/gym-timplan.test.mjs, web/lib/class-timplan.ts, web/lib/class-timplan.test.mjs, web/lib/plan-decision.ts, web/lib/plan-decision.test.mjs, web/lib/planning-year-contract.ts, web/lib/planning-year-contract.test.mjs</files>
<action>Utöka gymplan och summary med series:{id,name,revision} samt nullable nameAtCreation på detalj. Byt unika versionsnummer per skola till unik serieID+version; planID ska alltjämt vara globalt unikt och seriescope följa parentoffering/unit. Klasslänk får serieinfo för aktuell/annan plan; planbeslutets detalj/lista får nullable series för programplan och verifierad series för GYtimplan. PlanningRow och PlanningSchoolTimplan bär series, programplanens schoolTimplans blir lista så flera planer inte tappas. Hantera eventuell övergång explicit och testad; acceptera inte godtyckliga extranycklar. Samordna parserintegration mot03–05:s frysta SQLkontrakt. Ren domän och parserkod får förberedas parallellt men hela06 avslutas först efter05:s faktiska SQL/TSparitet; ren TypeScriptframgång bevisar inte SQLprojektion. Befintliga GR/IM-/legacyårsdata fortsätter med dokumenterad null/legacyserie och samma måttsemantik.</action>
<verify>Kör relevanta gym-/class-/decision-/planning-kontraktsprov, npx tsc --noEmit och riktad lint. Prov: två version1 med olika serieID godtas, samma serieversion med olikaID nekas, fel scope nekas, två namedplanrefs behålls, samma programram räknas en gång.</verify>
<done>Ingen strikt parser eller identitetsnyckel antar längre en gemensam versionsräkning för alla namngivna planer på skolan.</done>
</task>

</tasks>

<verification>
RED → GREEN: node --test lib/named-timplan.test.mjs från web. Testa 80/81 kodpunkter, astral Unicode, Cc/Cf/Cs, vanliga blanksteg kontra andra separators, nullpar och otillåtna extra nycklar. SQLparitet provas senare mot02/03. Kör relevanta gym-/class-/decision-/planning-kontraktsprov, npx tsc --noEmit och riktad lint. Prov: två version1 med olika serieID godtas, samma serieversion med olikaID nekas, fel scope nekas, två namedplanrefs behålls, samma programram räknas en gång.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Två separata timplaner kan båda heta version1 utan identitetskonflikt.
- Namnändring ändrar varken planversions-ID eller klass-ID.
- Felaktig eller tvetydig scope/namn/version nekas före användning.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-06-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
