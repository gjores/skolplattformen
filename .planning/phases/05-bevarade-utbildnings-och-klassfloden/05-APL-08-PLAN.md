---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-08
type: execute
wave: 6
depends_on: ["APL-05", "APL-06", "APL-07"]
files_modified: ["work/pilot/verify-apl-plan-api.mjs", "work/pilot/apl-plan-oidc-fixtures.mjs", "web/playwright.apl-actual.config.ts", "web/e2e/apl-plan-actual.spec.ts", "work/pilot/apply-apl-plan.mjs", "work/pilot/deliver-apl-plan.mjs", "work/pilot/deliver-apl-plan.test.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md"]
autonomous: true
status: in_progress
gap: APL-01
must_haves:
  truths: ["Samma APL-kandidat fungerar med verklig Worker/OIDC på dator och telefon.", "Rektor och huvudman arbetar med samma sparade innehåll under verkliga mandat.", "En exakt verifierad och granskningsbar release finns innan aktiv databasändring begärs."]
  artifacts: ["work/pilot/verify-apl-plan-api.mjs", "web/e2e/apl-plan-actual.spec.ts", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md"]
  key_links: ["Källmanifest → separat skyddat bygge → faktisktAPI och browser på samma artefakt", "Egen OIDC/MFA-identitet → korrekt Worker → isolerad SQL från 07", "Verifierade migrations-/artefaktbytes → konkret sista installationsbeslut"]
---

<objective>
Verifiera verklig integration och förbered en exakt lokal leverans. Inga permanenta ändringar i användarens aktiva databas eller byte av3012 görs i denna plan.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/codebase/ARCHITECTURE.md
@.planning/codebase/TESTING.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-IMPLEMENTATION.md
@work/pilot/verify-named-timplans-api.mjs
@work/pilot/named-timplan-oidc-fixtures.mjs
@work/pilot/apply-rector-programplan.mjs
@work/pilot/deliver-rector-programplan.mjs
@web/playwright.class-cohort-actual.config.ts
</context>

<tasks>

<task type="auto">
<name>1. Kör faktisk Worker/OIDC och användarflöden på samma kandidat</name>
<files>work/pilot/verify-apl-plan-api.mjs; work/pilot/apl-plan-oidc-fixtures.mjs; web/playwright.apl-actual.config.ts; web/e2e/apl-plan-actual.spec.ts; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-VERIFICATION.md</files>
<action>Bygg separat skyddad kandidat och bind source/buildmanifest till samtliga verifierade produkt-/migrationsfiler. Återanvänd verifierad privat testmiljö från 07 och egna OIDC/GoTrue-fixturer efter granskning; ingen demo-bootstrap eller authmock. Prova hela flödet: två planvarianter från samma programplan, tre femveckorsperioder, flera innehållskopplingar med bara 20 700 inkluderadeAPL-minuter (345 timmar), exakt 690 + 690 minutersfördelning, legacygranskning, rektorsbeslut, inskick, HM-återsändning/approve och exakt klasslänk. Prova del-/blandvecka, unknown/lärling, saknade timmar, förlorat svar, reload/replay, staleCAS och återkallat mandat genom verklig HTTP. Chromiumdator och WebKittelefon använder samma build, retries0. Granska skärmbilder, fokus och sparbesked; återanvänd inga användarklasser som skrivfixturer.</action>
<verify>Från web kör relevanta Node-modell/serverprov, npx tsc --noEmit, npx oxlint app lib, separat skyddat produktionsbygge och faktisk browserkonfiguration: npx playwright test -c playwright.apl-actual.config.ts. Den konfigurationen matchar enbart apl-plan-actual.spec.ts och pekar på egen isolerad kandidatport, aldrig generiska e2e:protected eller aktiv 3012. Kör docs:build från roten om verifieringen ändrar handbok. Dokumentera riktiga HTTP-statusar, aktörscope, audit, buildhash och full cleanup. Simulerade fall hålls i separat rapport.</verify>
<done>FaktiskaAPI- och dator/telefonfall passerar eller har konkret olöst status; samma artefakt är bevisad och egna testresurser städade.</done>
</task>

<task type="auto">
<name>2. Gör den framtida installationen konkret och granskningsbar</name>
<files>work/pilot/apply-apl-plan.mjs; work/pilot/deliver-apl-plan.mjs; work/pilot/deliver-apl-plan.test.mjs; .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-RELEASE.md</files>
<action>Förbered granskade installations-/leveransverktyg med målidentitet, exakta migrationshashar, förväntad aktuell3012-artefakt och ny kandidat. Verktygen ska vägra oväntat mål, gammal verifiering, avvikande schema/ACL eller ändrade bytes. Förkontroll kan vara läsande; tunga DDL-prov kvarstår i separat mål. Planera originalfingeravtryck före/efter faktiskapply utan dataexport, kort sammanhängande schemaapply och samma Worker-byte; definiera återställning av app och hantering av oklartDB-utfall utan blind retry. Dokumentera att rollback av app inte innebär ogjord permanent databasändring. Releaseunderlaget anger exakt vad som ska installeras, påverkan på befintligt legacyärende, verifieringsbevis och vad som återstår. Tidigare godkännande av fem andra migrationer gäller inte detta paket. Om aktuellt sessionsgodkännande saknas ska samordnaren först nu begära det för just denna konkreta release; plan 09 startar inte före svaret.</action>
<verify>Testa verktygens vägran vid fel mål/hash/schema, redan utförd respektive okändapply och kandidatbyte med simulerad verktygsI/O. Gör läsande aktuellmiljöinventering och jämför mot releaseunderlaget, utan att ändra databas/runtime. Git diff --check och oberoende granskning av migrations-/leveransdiff.</verify>
<done>Allt oberoende arbete är klart; användaren kan vid behov godkänna exakt migrationspaket och 3012-kandidat som sista installationsbeslut.</done>
</task>

</tasks>

<verification>
APL1-01–08 har sammanhängande faktisk verifiering. Aktiv databas och 3012 är fortfarande oförändrade. Ett nekat eller uteblivet installationsbeslut innebär väntande release, inte tekniskt godkänd driftsättning.
Inventera aktuella definitioner vid start; äldre kodkartor och tidigare PASS är bakgrund. Läs kontraktets SS 12000-avstämning och bevara stabila skol-/klass-ID:n, giltighet och källansvar; inget externt standardutbyte verifieras av denna plan.
</verification>

<success_criteria>
- Samma APL-kandidat fungerar med verklig Worker/OIDC på dator och telefon.
- Rektor och huvudman arbetar med samma sparade innehåll under verkliga mandat.
- En exakt verifierad och granskningsbar release finns innan aktiv databasändring begärs.
- Uppgifternas verifiering är redovisad på faktisk provnivå; avvikelser och första fel döljs inte.
</success_criteria>

<output>
Skriv 05-APL-08-SUMMARY.md i samma katalog med ändrade filer, utförda kontroller, bevarande, avvikelser och nästa beroende. Samordnaren hanterar avgränsad commit/push och paketstatus.
</output>

## Utförandeavvikelse 2026-10-16

Första verkliga byggprovet gav saknade layoututilities i källkopia under ignorerad katalog; kandidaten levererades inte. En separat lokal sparse-källkopia utanför ignoreträdet bygger samma produkt med kontrollerade dialogstilar. Andra faktiska körningen sparade/reloadade tre perioder och återhämtade rektors bekräftelse efter riktig MFA på båda enheterna, men länken till APL-underlaget tappade fokus genom navigering/remontering. Länken hanterar nu ankaret inom den monterade planen, uppdaterar URL och flyttar fokus/scroll uttryckligen. Två riktade tangentbordsprov på dator/telefon samt TypeScript och full app/lib-lint PASS; ny faktisk helkörning krävs. Inga datamodeller, mandat eller SS12000-relationer ändras av fokusfixen. Handbokens befintliga länkflöde består.
