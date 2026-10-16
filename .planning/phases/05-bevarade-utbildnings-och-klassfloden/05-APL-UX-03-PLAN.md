---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: APL-UX-03
type: execute
wave: 3
depends_on: [APL-UX-01, APL-UX-02]
status: planned
autonomous: true
files_modified:
  - work/pilot/apl-ux-fixtures.mjs
  - work/pilot/verify-apl-term-intent-api.mjs
  - work/pilot/apl-term-intent-browser-scenarios.mjs
  - work/pilot/apply-apl-term-intent.mjs
  - work/pilot/apply-apl-term-intent.test.mjs
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-VERIFICATION.md
  - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-RELEASE.md
must_haves:
  truths:
    - Faktisk skyddad HTTP sparar och återläser en tom terminsplan på dator och telefon.
    - Datumkrav, rektorsbekräftelse och separat huvudmannabeslut bevaras.
    - Release använder samma prövade kandidat och bevarar originaldata.
  artifacts:
    - work/pilot/verify-apl-term-intent-api.mjs
    - .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-VERIFICATION.md
  key_links:
    - riktig OIDC till faktisk Worker till SQL till återläst browser
    - verifierade källor och migration till exakt releasekandidat
---

<objective>
Verifiera hela ändringen och förbered/genomför korrekt lokal leverans inom aktuell användarauktorisation. APLUX-01–05. Bevis för UX, faktisk integration och mänsklig acceptans särredovisas.
</objective>
<context>
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-01-SUMMARY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-02-SUMMARY.md
@work/pilot/verify-apl-plan-api.mjs
@work/pilot/apl-plan-oidc-fixtures.mjs
@work/pilot/apply-apl-plan.mjs
@work/pilot/deliver-apl-plan.mjs
</context>
<tasks>
<task type="auto">
<name>Faktisk skyddad integration och bevarande</name>
<files>work/pilot/apl-ux-fixtures.mjs, work/pilot/verify-apl-term-intent-api.mjs, work/pilot/apl-term-intent-browser-scenarios.mjs</files>
<action>Återanvänd ägd OIDC/snapshot/cleanup, med orkestrerarens nya work/pilot/apl-ux-fixtures.mjs för redan installerad APL-v1: aplUxFixture(tx) ger godkänd BF-programplan och timplansutkast utan APL; seedAplUxActualFixture(snapshot) ger seed för befintlig createAplPlanOidcFixture. Fixturen är skriven men måste verifieras före användning; den används även i UX-01:s SQL-prov. Ingen återinstallation av gamla tre DDL, backdatering eller kringgående av APL-regler. Bygg separat från aktiv artefakt och testa exakt slutlig kandidat på egen port. Dator och telefon sparar faktiskt bara årskurs/termin och återläser samma period-ID efter reload. Komplettera och prova befintlig rektor→huvudman-kedja; ofullständigt underlag nekas bekräftelse. Prova äldre kvitto/journalreplay, terminsändring efter bekräftelse, ny version och flerminperiod utan dataförlust. Riktad HTTP-kontroll av annat skolmandat, CAS, origin/MFA och auditrollback krävs. Ingen mock av auth/verksamhet; eventuellt tappat transportsvar märks. Fånga exakta käll-/migrations-/artefakthashar och originalbevarande, med full ägd cleanup även efter browserfel.</action>
<verify>Faktisk SQL och HTTP/browser PASS för samma slutliga produkt. Båda enheter retries 0, skärmbilder granskade. Ursprungliga kolumner/rader/ACL/hashar samt cleanup verifierade.</verify>
<done>Ändringen har aktuellt faktiskt integrationsbevis; aktiv databas/3012 fortfarande orörd av testet.</done>
</task>
<task type="auto">
<name>Exakt delta-installation och leveransförberedelse</name>
<files>work/pilot/apply-apl-term-intent.mjs, work/pilot/apply-apl-term-intent.test.mjs</files>
<action>Skapa avgränsat delta-verktyg för installerad APL-v1. Bind exakt ny kolumn/funktionsdelta, migrationsjournal, originalrader/ACL, SQL/API-bevis och kandidatbytes. Återanvänd granskad leveransteknik; ändra inte gamla migrationer eller låt gamla APL-v1-bevis godkänna nya bytes. Testa fel kandidat/hash, saknad bevisdel, schemaavvikelse, fel scope/identitet, ofullständig cleanup, okänd commit och överföringsfel. Slutför läsande verify/prepare innan något verkligt återstående installationsbeslut. Dokumentera samordnat appbyte eftersom äldre parser inte kan läsa nya fält; återställd process är inte en full databasrollback.</action>
<verify>Verktygens positiva/negativa Node-prov och läsande förkontroller PASS. Om befintligt leveransverktyg måste utökas: dokumentera exakt paketbindning och gör motsvarande regressionsprov före körning.</verify>
<done>Installation och samma kandidat är konkreta och granskningsbara, utan ofärdig teknisk förberedelse.</done>
</task>
<task type="auto">
<name>Sammanställ, leverera inom auktorisation och prova begriplighet</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-VERIFICATION.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-APL-UX-RELEASE.md</files>
<action>Spåra APLUX-01–05 till färska råresultat. Redovisa exakt migration/kandidat och originalbevarande. Utgå från aktuell användarauktorisation för lokal installation; skapa inte godkännandegrindar utan grund och återanvänd inte ett exakt äldre tre-migrationsgodkännande som bevis för annan DDL. Om konkret godkännande återstår ska endast detta beslut lämnas till användaren efter alla oberoende förberedelser. När auktoriserad: installera deltamatrisen, överför samma prövade bytes till 3012 och verifiera riktig läsande rektorsinloggning samt originalbevarande. Efter leverans ges högst fyra steg: välj årskurs/termin, spara utan datum/ämnen, ladda om, öppna precisering. Begriplighetsgapet stängs först efter faktisk användaråterkoppling, separat från äldre APL-10 och pilotkrav.</action>
<verify>Jämför dokumentens påståenden mot rårapporter och faktiskt runtimebevis. Build-PASS är inte leveransbevis och preview är inte faktisk anslutning.</verify>
<done>Ändringen är verifierad och leveransbar, eller lokalt levererad när auktoriserad; mänsklig bedömning redovisas separat.</done>
</task>
</tasks>
<verification>Full typkontroll, app/lib lint, separat skyddat appbygge och relevanta Node-regressioner på slutlig produkt. Handboksbygge från UX-02 återanvänds om källorna är oförändrade. Ingen faktisk extern SS 12000-anslutning påstås.</verification>
<success_criteria>Färskt faktiskt integrations- och bevarandebevis finns; release-status och kvarstående mänsklig begriplighetsbedömning är tydliga.</success_criteria>
<output>Skriv 05-APL-UX-03-SUMMARY.md. Scoped commit/push enligt AGENTS. Orkestreraren uppdaterar STATE/gap; skriv inte om äldre historik eller pilotkrav.</output>
