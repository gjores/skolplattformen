---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-07"
type: execute
status: planned
wave: 6
depends_on: ["CLASS-COHORT-06"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - web/app/protected-class-cohorts.tsx
  - web/app/protected-class-cohorts.css
  - web/app/protected-programplan-workspace.tsx
  - web/app/protected-programplan-flow.tsx
  - web/e2e/class-cohort.spec.ts
must_haves:
  truths:
    - "Efter sparad utbildning kan behörig rektor/admin förbereda klasser innan timplanen är fastställd."
    - "Användaren kan välja befintlig klass, skapa uttryckligen namngivna tomma klasser eller göra arbetet senare."
    - "Ny programplansversion återanvänder klassorganisationen och huvudmannen får inga nya skrivrättigheter."
  artifacts:
    - path: web/app/protected-class-cohorts.tsx
      provides: "Frivilligt klasssteg vid programplanen"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Frivilligt klasssteg vid programplanen

<objective>
Efter sparad utbildning kan behörig rektor/admin förbereda klasser innan timplanen är fastställd.
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
@web/app/protected-class-timplans.tsx
@web/lib/unsaved-changes.tsx
@web/lib/programplan-copy.ts
</context>

<tasks>
<task type="auto">
<name>Inför sammanhållet val vid sparad utbildning</name>
<files>web/app/protected-class-cohorts.tsx, web/app/protected-class-cohorts.css, web/app/protected-programplan-workspace.tsx, web/app/protected-programplan-flow.tsx</files>
<action>Montera en gemensam panel Klasser för utbildningen i programplansarbetsytan efter att skola/offering/start finns och utbildningens atomiska skapande har bekräftats. Samma panel fungerar för ny/befintlig utbildning och ny planversion. Gör klasssteget synligt i nya flödets övergång utan att lägga klassfel i den redan bekräftade programplanssparningen. Befintliga klasser visar namn/giltighet och väljs för inspektion, inte ny beständig relation: de tillhör redan samma offering. Skapa tomma klasser visar upp till 20 explicita namnrader, bekräftat antal och klassens verifierade giltighetsstart som läsbar uppgift före en sammanfattande bekräftelse. Datumet är inte redigerbart; slutdatum är okänt. Ingen automatisk skapa vid tom lista. Gör senare fortsätter planarbete utan mutation och återöppning finns. HM ser läsläge och vem som kan förbereda klasser. Visa utbildningsstart, första läsår och klassens giltighet var för sig; timplanskoppling är separat och kräver senare fastställd version. Kopierad ny kull får tom klasstruktur utan gamla klass-ID:n. Namn/år-kollision och startlås förklaras utan tekniska begrepp.</action>
<verify>Mockade browserprov för ny/befintlig utbildning, HM läsläge, rektor/admin, Gör senare, två klasser, samma offering ny version, kopierad kull samt fel/oklar datumkälla på dator och telefon.</verify>
<done>Klassorganisation går att påbörja tidigt och är begripligt separerad från timplansbeslutet.</done>
</task>

<task type="auto">
<name>Bevara begäran och skydda kontextbyten</name>
<files>web/app/protected-class-cohorts.tsx, web/e2e/class-cohort.spec.ts</files>
<action>Behåll commandId och exakt granskad payload tills bekräftat kvitto och återläsning. Ett nätverksfel eller mismatched reply får statusläge och blockerad navigation, inte nytt commandId. Hämta sparstatus använder läsande statusoperation; verifierat not_found kan erbjuda samma request igen. Klart kvitto + misslyckad efterläsning får läsåterhämtning, aldrig omskapning. Generation/abort och epoch/assignment/offering/unit ska hindra sena svar i ny kontext. Konflikt återläser underlaget och kräver ny granskning; MFA återupptar samma request. Gör senare får inte kringgå pågående/okänd mutation. Testa tangentbord, fokus, tydlig återkoppling, minsta användbara touchkontroller och avsaknad av horisontell överströmning.</action>
<verify>Riktade browserprov med dubbelklick, avbrutet svar före/efter commit, malformed kvitto, reloadfel, changed revision, sen response vid skol-/uppdragsbyte och MFA. Granska dator-/telefonbilder; cd web && npx tsc --noEmit && npx oxlint app lib.</verify>
<done>Inga dubbla klasser eller stale cross-scope-svar efter återhämtning; mobilen kan genomföra hela flödet.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Efter sparad utbildning kan behörig rektor/admin förbereda klasser innan timplanen är fastställd.
Användaren kan välja befintlig klass, skapa uttryckligen namngivna tomma klasser eller göra arbetet senare.
Ny programplansversion återanvänder klassorganisationen och huvudmannen får inga nya skrivrättigheter.
</success_criteria>

<output>
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-07-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>
