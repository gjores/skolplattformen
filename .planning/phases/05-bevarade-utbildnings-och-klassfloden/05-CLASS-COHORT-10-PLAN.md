---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-10"
type: execute
status: planned
wave: 9
depends_on: ["CLASS-COHORT-09"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: false
files_modified: []
must_haves:
  truths:
    - "Användaren kan bedöma att tidig klassbildning och tre olika datum-/årsbegrepp är begripliga."
    - "Resultatet registreras utan att äldre redan godkända prov upprepas eller full fasacceptans påstås."
  artifacts:
    - path: .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-USER-TRIAL.md
      provides: "Mänskligt prov och avgränsat resultat"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Mänsklig kontroll av klassorganisationen

<objective>
Användaren kan bedöma att tidig klassbildning och tre olika datum-/årsbegrepp är begripliga.
</objective>

<execution_context>
@/Users/petter.gjores/.codex/skills/gsd/workflows/execute-plan/SKILL.md
</execution_context>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/REQUIREMENTS.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-SS12000.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-IMPLEMENTATION.md
</context>

<tasks>
<task type="auto">
<name>Förbered ett kort prov på det levererade bygget</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-USER-TRIAL.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-VERIFICATION.md, .planning/STATE.md, .planning/REQUIREMENTS.md</files>
<action>Läs VERIFICATION och USER-TRIAL och kontrollera att 3012 fortfarande har samma prövade bygge. Förbered konkreta syntetiska objekt och länkar privat; erbjud endast nytt klassflöde: öppna framtida kull/programplansutkast, förstå utbildningsstart/första läsår, Gör senare/återöppna, välj befintlig eller skapa två tomma klasser, se ingen timplanskoppling ännu, och granska korrekt läsårsval vid fastställd timplan. Visa HM-läsläge som separat rollgräns om relevant. Den tidigare godkända kullkopian är regression i plan08, inte nytt mänskligt acceptanskrav.</action>
<verify>Kontrollera konkret provtext och åtkomlig skyddad lokal app; automatiserade resultat i plan08/09 måste vara klara.</verify>
<done>Ett kort prov kan genomföras utan att användaren behöver hantera teknik.</done>
</task>

<task type="checkpoint:human-verify">
<what-built>Tidigt frivilligt klasssteg för samma utbildning/kull med oförändrade mandat, läsbart startdatum och tydligt tillämpningsläsår. Samma testade skyddade bygge är lokalt levererat på 3012.</what-built>
<how-to-verify>Öppna den förberedda syntetiska framtida kullen. Kontrollera utbildningsstart och första läsår, välj Gör senare och återöppna klasssteget. Välj en befintlig klass eller skapa två namngivna tomma klasser och granska datumet. Kontrollera att de finns kvar utan timplanskoppling. Öppna förberedd fastställd timplan och kontrollera att giltigt läsår/årskurs är tydligt medan valt planeringsår visas separat. Bedöm om flödet är begripligt på den enhet du använder; rapportera gärna enhet, men ett ospecificerat svar dokumenteras utan antagen telefonkontroll.</how-to-verify>
<resume-signal>Svara att klassflödet fungerar eller beskriv vilket steg som är oklart eller fel. Endast detta nya prov efterfrågas.</resume-signal>
<name>Låt användaren bedöma flödet</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-USER-TRIAL.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-VERIFICATION.md, .planning/STATE.md, .planning/REQUIREMENTS.md</files>
<action>Presentera det korta provet och be om utfallet för begriplighet, tidigt klassarbete och läsårsval. Avvakta faktiskt mänskligt svar; automatiska tester är inte användaracceptans. Efter svar uppdateras USER-TRIAL, VERIFICATION, STATE och kravspårning med exakt avgränsning. Registrera enhetsgräns ärligt om användaren inte anger dator/telefon. Misslyckat delsteg blir avgränsad gap-plan; redan godkända delar upprepas inte.</action>
<verify>Mänskligt rapporterat utfall, alternativt uttrycklig awaiting_user utan fabricated pass.</verify>
<done>Avgränsad mänsklig acceptans eller konkreta kvarstående luckor är dokumenterade.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Användaren kan bedöma att tidig klassbildning och tre olika datum-/årsbegrepp är begripliga.
Resultatet registreras utan att äldre redan godkända prov upprepas eller full fasacceptans påstås.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-10-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>
