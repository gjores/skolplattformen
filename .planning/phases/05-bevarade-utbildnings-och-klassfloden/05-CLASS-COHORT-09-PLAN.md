---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "CLASS-COHORT-09"
type: execute
status: planned
wave: 8
depends_on: ["CLASS-COHORT-08"]
requirements: [ADMIN-03, ADMIN-04, PLANERING-04, PLANERING-05]
autonomous: true
files_modified:
  - docs/handbok/programplaner.md
  - docs/handbok/timplaner.md
  - work/pilot/deliver-class-cohort.mjs
  - work/pilot/deliver-class-cohort.test.mjs
must_haves:
  truths:
    - "Handboken beskriver det faktiskt verifierade klassflödet och dess begränsningar."
    - "Användarprovet öppnar exakt det lokala bygge som har testats."
  artifacts:
    - path: docs/handbok/programplaner.md
      provides: "Handbok och lokal leverans för användarprov"
  key_links:
    - "Aktuellt skolmandat → exakt utbildning/kull → stabilt klass-ID → uttrycklig läsårs-/versionskoppling"
---

# Handbok och lokal leverans för användarprov

<objective>
Handboken beskriver det faktiskt verifierade klassflödet och dess begränsningar.
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
@work/pilot/activate-school-registry.mjs
@work/pilot/verify-planning-year-release.mjs
</context>

<tasks>
<task type="auto">
<name>Beskriv klassorganisation och separat timplanskoppling</name>
<files>docs/handbok/programplaner.md, docs/handbok/timplaner.md</files>
<action>Dokumentera Klasser för utbildningen, befintliga klasser inom samma kull/skola, tomma namngivna klasser, giltighet, Gör senare, återöppning och rektor/admin-mandat. Förklara klassens giltighet, utbildningsstart och timplanens tillämpningsläsår med höst-/vårexempel. Ny version skapar inga klasser eller flyttar länkar; kopiering tar inte med elever/klass-ID:n. Förklara läsläge för HM, låst utbildningsstart och att samma namn i överlappande läsår kan kräva annat namn i nuvarande stöd. Inga tekniska API-/SS12000-kontrakt eller projektstatus i handboken; beskriv endast kontrollerat beteende.</action>
<verify>npm run docs:build från roten och manuell kontroll av de två berörda sidorna mot plan08-resultat.</verify>
<done>Användarinstruktionerna motsvarar färskt verifierat beteende.</done>
</task>

<task type="auto">
<name>Leverera samma bygge lokalt och sammanställ nästa prov</name>
<files>work/pilot/deliver-class-cohort.mjs</files>
<action>Skapa avgränsat lokalt leveransskript efter befintligt privat runtime-flöde; det kräver plan08:s build-/källmanifest och bevarandebevis, målskydd och tvåstegs --verify/--apply. Kontrollera ordinarie 3012:s aktuella bygge och privata konfiguration, bevara tidigare fungerande runtime, överför exakt prövade byggfiler och starta om lokalt utan nytt appbygge. Läs tillbaka manifest, hälsa och faktiskt OIDC-läsprov för relevant skola; ändra inga verksamhetsdata i leveranskontrollen. Vid fel återställ endast egen runtime med bevarade filer och redovisa resultat. Publicera eller driftsätt inte externt. Skriv 05-CLASS-COHORT-VERIFICATION.md och 05-CLASS-COHORT-USER-TRIAL.md med datum, gränser, lokala användarsteg och awaiting_user; uppdatera STATE/kravspårning utan full kravacceptans. Commit/push endast avgränsad kontrollerad plan och verifiera fjärr-HEAD enligt AGENTS.</action>
<verify>Leverans --verify följt av --apply med samma privata evidens; faktisk read-only OIDC på 3012, byteverifierat manifest, oförändrade business-hashar och lokal återställningsväg. Spara inga testkonton, länktokens eller elevdata i Git.</verify>
<done>3012 visar testad ändring och användaren har ett konkret avgränsat prov med ärlig status.</done>
</task>

</tasks>

<verification>
Kör planens riktade kontroller mot aktuella källor. Bevara tidigare elev-/klass-/versionsdata; skriv endast syntetisk egen fixtur i avsedd isolerad miljö. Se SS12000-bilagan: SS 12000:2024, OpenAPI 2.1.0; intern en-utbildning-per-klass och legacydatum/namnnyckel är begränsningar, inte verifierat standardstöd. Ingen verklig kommunanslutning provas här.
</verification>

<success_criteria>
Handboken beskriver det faktiskt verifierade klassflödet och dess begränsningar.
Användarprovet öppnar exakt det lokala bygge som har testats.
</success_criteria>

<output>
Explicita GSD-outputartefakter: .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-VERIFICATION.md och .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-USER-TRIAL.md; uppdatera .planning/STATE.md och berörd kravspårning. Dessa är dokumentationsoutput utöver files_modified:s produkt-/provfiler.
Skriv .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-09-SUMMARY.md med faktiskt resultat, kommandon/exitkoder, bevisreferenser, kvarstående gränser och SS12000-bedömning. Uppdatera paketets status proportionerligt. Versionshantera endast denna plans avgränsade ändringar; pusha aktuell gren och verifiera avsedd fjärrcommit enligt AGENTS.md.
</output>

## Genomförandeprecisering

Leveransens OIDC-bevis sparar full privat hållbar före-bild innan inloggning. Endast det egna kontots iat/exp i authmetadata får rotera och måste matcha exakt cookie-/auditbunden, serververifierad callbacktoken. Alla övriga nästade fält/nycklar och äldre rader bevaras.48 rena positiva/negativa prov i deliver-class-cohort.test.mjs verifierar gränsen. Första leveransens FAIL, egen återhämtning och bevisgräns redovisas i09-SUMMARY.
