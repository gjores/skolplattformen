---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-09
type: execute
wave: 7
depends_on: ["APL-08"]
files_modified: [".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md", ".planning/STATE.md"]
autonomous: true
status: planned
gap: APL-01
execution_prerequisite: explicit_approval_for_exact_apl_release
must_haves:
  truths: ["Användarens befintliga data bevaras vid uttryckligt godkänd lokal installation.", "Exakt provad artefakt kör på 3012 efter bytet.", "Användaren får ett kort konkret begriplighetsprov med verkligt tillgänglig plan."]
  artifacts: [".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md"]
  key_links: ["Uttryckligt godkänd release → exakt migration/applyjournal → bevarandekontroll", "Verifierad kandidat → bytekontrollerad3012 → läsande OIDC", "Teknisk leverans → separat användarprov i 10"]
---

<objective>
Leverera det redan verifierade APL-paketet lokalt och förbered användarens konkreta prov. Körförutsättning: exakt releaseunderlag från 08 är fortfarande aktuellt och användaren har uttryckligen godkänt den permanenta installationen och 3012-bytet. Detta är inte uppfyllt genom en äldre annan migrationsfråga.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@work/pilot/apply-apl-plan.mjs
@work/pilot/deliver-apl-plan.mjs
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md
</context>

<tasks>

<task type="auto">
<name>1. Installera godkänt paket och verifiera bevarad lokal miljö</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md</files>
<action>Kontrollera releasegodkännandet och exakta aktuella bytes innan någon mutation. Ta privata originalfingeravtryck enligt granskade verktyget, utan export av verksamhetsrader. Installera endast de verifierade migrationerna och bytekontrollerade artefakten enligt 08. Bevara tidigare app för återställning; starta inte om DB/IdP och kör ingen reset. Okänt applyutfall måste utredas via journal innan fortsatt byte eller nytt försök. Kontrollera originalplaner, timmar, klasser, giltighet, länkar, historiska kvitton/beslut, auditankare, grants och tillåtna schemaförändringar före/efter. Bevis från den syntetiska testdatabasen ersätter inte denna originalkontroll.</action>
<verify>Kontrollera verklig applyjournal och migrationshashar, bytes för samtliga 3012-byggfiler, hälsa och läsande OIDC under verkliga skolmandat. Ingen användarplan ändras för eftertest. Dokumentera faktiskrevision, artefakthash, originalbevarande och avvikelser. Vid fel återställ app enligt beredskap där kompatibelt och redovisa DB-läget korrekt.</verify>
<done>Samma godkända kandidat kör lokalt och originalbevarande är kontrollerat; kvarstående fel redovisas utan falsktPASS.</done>
</task>

<task type="auto">
<name>2. Förbered ett tydligt användarprov och avsluta teknisk redovisning</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-USER-TRIAL.md; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md; .planning/STATE.md</files>
<action>Gör högst sex korta verksamhetssteg med konkret behörig ingång: öppna syntetisk yrkestimplan, se/granska planerade perioder, fördela innehåll och varav APL utan totaländring, spara/återöppna, fatta rektorsbeslut och granska somHM. Använd en egen tydligt märkt syntetisk provplan eller verifierat tillgänglig läsplan; modifiera inte användarens befintliga klasser. Visa förväntade resultat, särskilt att detta är planering och att genomförande ännu saknar stöd. Fråga om begriplighet, inte nya godkännanden av redan beställd verksamhetsriktning. Markera tekniskt verifierat och user_trial awaiting_user separat. Samordnaren gör scopedcommit/push och verifieraroriginSHA, utan orelaterade arbetskopieändringar.</action>
<verify>Öppna de dokumenterade startvägarna läsande och bekräfta att angivna namn/roller finns. Granska att provet går att följa utan chattbaserad detaljledning. Kontrollera GSD-länkar och diff. Användarens genomförande rapporteras först i 10.</verify>
<done>Lokalleveransen är redovisad och ett konkret självständigt användarprov väntar; full fas5-acceptans är inte antagen.</done>
</task>

</tasks>

<verification>
Teknisk etapp1 är levererad endast om faktiskapply/bevaring/3012kontroll passerar. Mänsklig begriplighetsacceptans tillhör10. Utan nytt explicit releasegodkännande stannar planen orörd och status är awaiting_release_authorization.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Användarens befintliga data bevaras vid uttryckligt godkänd lokal installation.
- Exakt provad artefakt kör på 3012 efter bytet.
- Användaren får ett kort konkret begriplighetsprov med verkligt tillgänglig plan.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-09-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>
