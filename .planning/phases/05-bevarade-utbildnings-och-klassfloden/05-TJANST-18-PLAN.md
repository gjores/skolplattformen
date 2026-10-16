---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-18
type: execute
wave: 13
depends_on: ["TJANST-17"]
files_modified: ["work/pilot/apply-tjanst.mjs","work/pilot/apply-tjanst.test.mjs","work/pilot/deliver-tjanst.mjs","work/pilot/deliver-tjanst.test.mjs"]
autonomous: true
status: planned
must_haves:
  truths: ["Den lokala appen visar exakt den tjänstefördelning som har verifierats.","Befintliga utbildningar, klasser, beslut och personuppgifter bevaras vid installation.","Ett misslyckat appbyte återställer tidigare fungerande app utan att radera nya verksamhetsdata."]
  artifacts: ["work/pilot/apply-tjanst.mjs","work/pilot/apply-tjanst.test.mjs","work/pilot/deliver-tjanst.mjs","work/pilot/deliver-tjanst.test.mjs"]
  key_links: ["Exakt versionsbundet underlag → verifierat beteende → redovisad provnivå"]
---

<objective>
Förbered och leverera den verifierade lokala tjänstefördelningen. Omfattar TJ1-01–10 med särskilt fokus på bevarande och verifierad lokal leverans. Ingen full kommunanslutning eller fullständig fasacceptans följer av paketet.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-17-SUMMARY.md
@work/pilot/apply-rector-programplan.mjs
@work/pilot/deliver-rector-programplan.mjs
</context>

<tasks>
<task type="auto">
<name>Förbered kontrollerad migration och appöverföring</name>
<files>work/pilot/apply-tjanst.mjs; work/pilot/apply-tjanst.test.mjs; work/pilot/deliver-tjanst.mjs; work/pilot/deliver-tjanst.test.mjs</files>
<action>Bygg avgränsade verktyg efter senaste lokala leveransmönster, med läsande --preflight och separat --apply. Bind till exakt målidentitet, källrevision, migrationshashar, föregående runtime och verifierad17-artefakt; upptäck pågående APL-/andra leveranser före mutation. Applicera endast granskade additiva migrationer och exakta grants, med full jämförelse av gamla kolumner/rader, ACL och journal. Testa fel mål, ändrad hash, halvinstallerat paket, samtidighet och okänt installutfall. Kopiera samma bevarade byte från17; bygg inte om vid leverans. Appåtergång återställer tidigare artefakt och process efter verifiering; gör ingen automatisk DROP av nya tabeller eller radering av registrerad personal. Dokumentera när databasens additiva schema måste ligga kvar även vid appåtergång. Skriv privat förkontroll/leveransrapport med reproducerbart manifest, men utan hemligheter.</action>
<verify>node --test work/pilot/apply-tjanst.test.mjs work/pilot/deliver-tjanst.test.mjs. Kör läsande preflight på avsett lokalt mål; provkör lyckad installation och felåtergång på isolerad kopia. Läs faktisk schema-/artefaktdiff innan installation.</verify>
<done>Exakt lokal ändring och återgång går att granska före den skrivande körningen; inget generellt migrationsverktyg eller produktionsdriftsättning ingår.</done>
</task>

<task type="auto">
<name>Överför samma verifierade resultat och stäm av bevarande</name>
<files>work/pilot/apply-tjanst.mjs; work/pilot/deliver-tjanst.mjs</files>
<action>Verkställ lokal installation först när genomförandet och denna konkreta lokala överföring omfattas av användarens då gällande beställning. Återfråga inte redan lämnad auktorisering. Om den saknas, gör allt förberedelsearbete klart och presentera exakt mål, migrationer, artefakt och återgång som sista steg. Kör preflight igen precis före apply och avbryt vid ändrad bas. Efter migration och appbyte gör faktisk läsande OIDC/MFA-kontroll av avtals-/tjänstevyn, nekad egenvy för främmande person samt ursprungliga programplan/timplan/klassflöden utan verksamhetsskrivning. Registrera bevarande av befintliga rader och förväntade audit/login-delta. Förbered ett separat syntetiskt, tydligt identifierat underlag för19. Uppdatera paketets implementerings- och verifieringsstatus med verkligt utfall; ta inte över STATE:s aktiva arbete om annat paket fortfarande pågår.</action>
<verify>Verifiera lokal hälsa med skolplattform_worker, exakt filmanifest från17, faktisk inloggning, originalsiffror/-hashar och stängda egna verifieringssessioner. Vid fel återställ appen enligt testad väg och redovisa varje installerad migration separat. Avgränsad commit/push enligt stående godkännande.</verify>
<done>Lokalt leveransresultat är verifierat eller tydligt blockerat utan falsk PASS; användarprovet har ett konkret åtkomligt mål.</done>
</task>
</tasks>

<verification>
Inventera berörda filer vid start och följ kontraktets SS 12000-mappning, aktuella mandat, sekretess och okändsemantik. Tidigare PASS ersätter inte kontroller av nya ändringar.
</verification>

<success_criteria>
- Den lokala appen visar exakt den tjänstefördelning som har verifierats.
- Befintliga utbildningar, klasser, beslut och personuppgifter bevaras vid installation.
- Ett misslyckat appbyte återställer tidigare fungerande app utan att radera nya verksamhetsdata.
- Resultatets nivå och begränsningar är dokumenterade; pilotens äldre acceptans skrivs inte om.
</success_criteria>

<output>
Skriv 05-TJANST-18-SUMMARY.md och uppdatera paketets implementeringsöversikt/verifieringsmatris med faktiska resultat. Genomför avgränsad commit/push enligt projektreglerna.
</output>
