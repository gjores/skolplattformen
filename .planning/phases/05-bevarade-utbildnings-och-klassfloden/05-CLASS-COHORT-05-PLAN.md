---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-05"
type: tdd
status: complete
wave: 4
depends_on: ["CLASS-COHORT-03"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - web/lib/class-cohort.ts
  - web/lib/class-cohort.test.mjs
must_haves:
  truths:
    - "Fel skola, utbildning, namn, datum eller svar kan inte presenteras som lyckad klasskapning."
    - "Klassval och klasskapande är separata från timplanskopplingen."
  artifacts:
    - path: web/lib/class-cohort.ts
      provides: "Strikta kontrakt för tidiga klasser"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Strikta kontrakt för tidiga klasser

<objective>
Fel skola, utbildning, namn, datum eller svar kan inte presenteras som lyckad klasskapning.
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
<name>Skriv beteendeprov för kontraktet</name>
<files>web/lib/class-cohort.test.mjs</files>
<action>Skriv RED-prov för exakt kontrakt i IMPLEMENTATION: okända fält, UUID/revisioner, riktiga kalenderdatum, max 20 namn, dubletter efter normalisering, obligatoriskt null endsOn i create-svar, fel offering/unit/source och svar vars antal/namn/datum/commandId inte exakt svarar mot request. Status found måste verifiera hela kvittot; not_found får inga klasser. Underlagets äldre null datum tillåts uttryckligen; nya skapade svar kräver datum. Felaktigt svar är osäkert, inte bekräftat sparande.</action>
<verify>cd web && node --test lib/class-cohort.test.mjs: relevanta beteendefall fallerar före implementation.</verify>
<done>Proven beskriver verkliga säkerhets- och återhämtningsgränser.</done>
</task>

<task type="auto">
<name>Implementera request- och svarstolkning</name>
<files>web/lib/class-cohort.ts, web/lib/class-cohort.test.mjs</files>
<action>Implementera rena TypeScript-typer och strikta parsers med befintliga gym-/programplan-validerare; skilj underlag, create, status. UI:s normalisering av klassnamn sker före granskning; parser accepterar endast det bekräftade kanoniska namnet. Återge säkra felkoder för blockerad källa och kollision. Nya klassers startsOn måste motsvara exakt källa och validitySource=education_start; äldre null representeras som legacy_unknown. Ingen SQL, UI, extern tjänst eller egen parallell klassmodell. Modellera datum och skolformsavgränsning enligt SS12000-bilagan; detta är internt kontrakt, inte implementerad SS12000-export.</action>
<verify>cd web && node --test lib/class-cohort.test.mjs; npx tsc --noEmit.</verify>
<done>Alla kontraktsfall är GREEN och matchar plan04:s JSON utan toleranta fallback.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Fel skola, utbildning, namn, datum eller svar kan inte presenteras som lyckad klasskapning.
Klassval och klasskapande är separata från timplanskopplingen.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-05-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>
