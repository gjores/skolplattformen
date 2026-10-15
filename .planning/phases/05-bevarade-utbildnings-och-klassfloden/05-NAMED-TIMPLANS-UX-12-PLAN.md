---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: NAMED-TIMPLANS-UX-12
type: execute
wave: 10
depends_on: ["NAMED-TIMPLANS-UX-11"]
files_modified: ["docs/handbok/programplaner.md", "docs/handbok/timplaner.md", "work/pilot/deliver-named-timplans.mjs", "work/pilot/deliver-named-timplans.test.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-USER-TRIAL.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-UX-GAP.md"]
autonomous: true
gap: CLASS-COHORT-UX-01
must_haves:
  truths: ["Verifierad version är åtkomlig lokalt med uppdaterad användarhandbok.", "Användaren får ett konkret begriplighetsprov på färdigt resultat.", "Gapet stängs endast med faktiskt mänskligt begriplighetsresultat."]
  artifacts: ["docs/handbok/programplaner.md", "docs/handbok/timplaner.md", "work/pilot/deliver-named-timplans.mjs", "work/pilot/deliver-named-timplans.test.mjs", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-USER-TRIAL.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md", ".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-UX-GAP.md"]
  key_links: ["Handbok och exakt lokal kandidatartefakt", "Förbered begriplighetsprov och redovisa kvarstående gräns"]
---

<objective>
Leverera verifierat lokalt flöde med handbok och avgränsat begriplighetsprov.

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
<name>1. Handbok och exakt lokal kandidatartefakt</name>
<files>docs/handbok/programplaner.md, docs/handbok/timplaner.md, work/pilot/deliver-named-timplans.mjs, work/pilot/deliver-named-timplans.test.mjs, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md</files>
<action>Uppdatera handboken med verifierade verksamhetssteg: skapa/spara klasser, välja flera, kopplingar förläsåret, namngivenplan vsnyversion, kopia, namnbyte, beslut och vad delvis sparad kö betyder. Inga API/SQL/GSD/testkonton ihandbok. Kör docs:build. Anpassa tidigare deliver-class-cohort-verktyget efter läsning för exakt denna nya artefakt/källmatris; ingen hårdkodad gammal400source/201filacceptans. Överför bara granskad kandidatsamma bytes till lokal3012, verifiera manifest/migrationer och läsande OIDC med fullt bevarande före/efter. Spara återställbar tidigare artefakt och avbryt säkert om källor/byggnad divergerar. Ingen extern driftsättning. Läsande inloggning kan rotera endast observerade egna authmetadatafält, inte ursäkta okända originaldiffar.</action>
<verify>npm run docs:build; leveransverktygets meningsfulla negativa verifieringar samt faktisk läsande releasekontroll och exakt bytejämförelse. Bekräfta aktuell runtime/artifactrevision och inga nya originaldifferenser.</verify>
<done>Handboken beskriver verifierat beteende och samma prövade build kör lokalt.</done>
</task>

<task type="auto">
<name>2. Förbered begriplighetsprov och redovisa kvarstående gräns</name>
<files>.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-USER-TRIAL.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-NAMED-TIMPLANS-UX-VERIFICATION.md, .planning/phases/05-bevarade-utbildnings-och-klassfloden/05-CLASS-COHORT-UX-GAP.md</files>
<action>Skriv kort användaruppgift utan steg-för-steg-lösning: skapa två klasser, inse att sparade, skapa/namnge två fördelningar med skildmatematik, koppla rättklasser och ävenflera till samma, återfinna resultatochversion. Använd egna syntetiska testobjekt eller låt användaren välja; ändra inte deras befintliga klasser i förberedelsen. Notera faktiskt provad enhet och användarens egen bedömning när den finns. Gapet CLASS-COHORT-UX-01 kvarstår awaiting_user även om tekniska provpasserar, tills användaren utan chattstegledning förstår flödet. Återöppna inte tidigare kopie-/funktionsgodkännanden. Samordnaren uppdaterar STATE/ROADMAP/kravspårning med faktisk status; historiska88/100 och3/8 inte automatiskt omräknade. Detta är inte en extra godkännandefråga före den redan auktoriserade implementationen.</action>
<verify>Kontrollera att användarprovets mål matchar implementedbuild och att resultat inte fabriceras. Alla revisions-/bevislänkar ska finnas. Slutrapport skiljer tekniskt verifieradlokalleverans, kvarstående begriplighetsacceptans och övriga fasgap.</verify>
<done>Användaren kan prova det färdiga flödet, och ingen fullfas-/standard-/kommunacceptans påstås.</done>
</task>

</tasks>

<verification>
npm run docs:build; leveransverktygets meningsfulla negativa verifieringar samt faktisk läsande releasekontroll och exakt bytejämförelse. Bekräfta aktuell runtime/artifactrevision och inga nya originaldifferenser. Kontrollera att användarprovets mål matchar implementedbuild och att resultat inte fabriceras. Alla revisions-/bevislänkar ska finnas. Slutrapport skiljer tekniskt verifieradlokalleverans, kvarstående begriplighetsacceptans och övriga fasgap.
SS 12000:2024/OpenAPI 2.1.0: tillämpa paketets mappning; stabila klass-/organisations-ID:n, giltighet och medlemskap får inte ändras. Namngiven timplansserie är intern, inget verifierat standardutbyte.
</verification>

<success_criteria>
- Verifierad version är åtkomlig lokalt med uppdaterad användarhandbok.
- Användaren får ett konkret begriplighetsprov på färdigt resultat.
- Gapet stängs endast med faktiskt mänskligt begriplighetsresultat.
- Redovisa faktisk provnivå, fel och kvarstående arbete. Ingen testmutation på användarens klasser eller länkar.
</success_criteria>

<output>
Skriv 05-NAMED-TIMPLANS-UX-12-SUMMARY.md i samma katalog med ändrade filer, kommandon/resultat, bevarande och avvikelser. Avgränsad commit och push sköts av samordnaren efter granskning.
</output>
