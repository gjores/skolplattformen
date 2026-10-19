---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: TJANST-19
type: execute
wave: 14
depends_on: ["TJANST-18"]
files_modified: [".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-USER-TRIAL.md",".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-VERIFICATION.md",".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md"]
autonomous: false
status: superseded
superseded_on: 2026-10-19
superseded_by: "Fas 05.1 (tjänstefördelning) eller repot tjanstebedomning (tjänstebedömning); se ../05.1-tjanstefordelning/05.1-SPLIT-DECISION.md"
must_haves:
  truths: ["Användaren kan välja avtal, bedöma en tjänst och förstå vad rektor fastställer.","Huvudmannens uppföljning och lärarens egenvy har begripligt ansvar och tydliga tidsmått."]
  artifacts: [".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-USER-TRIAL.md",".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-VERIFICATION.md",".planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md"]
  key_links: ["Lokalt verifierad leverans → konkret användarprov → avgränsad acceptans"]
---

<objective>
Verifiera begriplighet med rektor och huvudman. Omfattar TJ1-01–10 med särskilt fokus på mänsklig begriplighet. Ingen full kommunanslutning eller fullständig fasacceptans följer av paketet.
</objective>

<context>
@.planning/PROJECT.md
@.planning/STATE.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTEXT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-CONTRACT.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-IMPLEMENTATION.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-DISCOVERY.md
@.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-TJANST-18-SUMMARY.md

</context>

<tasks>
<task type="checkpoint:human-verify" gate="blocking">
<name>Pröva den färdiga arbetsgången på syntetiskt underlag</name>
<what-built>Den verifierade och lokalt levererade avtalsgrunden, tjänstefördelningen och individuella bedömningen från18.</what-built>
<how-to-verify>Följ 05-TJANST-USER-TRIAL.md: välj två profiler som huvudman; fördela undervisning och mentorskap som rektor; bedöm och fastställ; läs egen tjänst som lärare; följ upp som huvudman; kopiera som nytt utkast. Prova begriplighet på dator och telefon när möjligt. Användaren behöver inte upprepa automatiska säkerhetsprov eller redan godkända programplansflöden. Ange vilka roller/enheter/steg som faktiskt prövats. Ett generellt ”fungerar” registreras som användarrapporterat godkännande med denna begränsning, inte som tekniskt bevis.</how-to-verify>
<resume-signal>Användarens resultat eller konkreta förbättringar.</resume-signal>
</task>
</tasks>

<verification>
Registrera verkligt användarresultat per steg och kvarstående luckor. Inga automatiska godkännanden vid tystnad.
</verification>

<success_criteria>
- Användaren kan välja avtal, bedöma en tjänst och förstå vad rektor fastställer.
- Huvudmannens uppföljning och lärarens egenvy har begripligt ansvar och tydliga tidsmått.
- Resultatets nivå och begränsningar är dokumenterade; pilotens äldre acceptans skrivs inte om.
</success_criteria>

<output>
Skriv 05-TJANST-19-SUMMARY.md och uppdatera paketets implementeringsöversikt/verifieringsmatris med faktiska resultat. Genomför avgränsad commit/push enligt projektreglerna. Vid anmärkning öppnas ett konkret gap; hela paketet kallas inte godkänt i förtid.
</output>
