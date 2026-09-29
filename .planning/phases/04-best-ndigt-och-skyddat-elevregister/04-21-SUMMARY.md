---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "21"
wave: 14
status: complete
completed: 2026-09-29
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
tested-revision: 892352916dcccbbf9b2019c41ddfc9a98082f991
commits: [8923529]
---

# Fas 4 plan 21: Handbok för det skyddade elevregistret

Handboken beskriver nu elevlistan, sökning och filter, elevkort, daterade placeringar, historik, skyddade uppgifter, källavvikelser och ett uttryckligt exportsteg. Gamla besked om att elevkort och export ännu inte finns har tagits bort. Skyddsbehörighetens gräns mellan huvudman, rektor och administratör är beskriven i verksamhetstermer. Säkerhetsloggen hålls åtskild från elevens ändringshistorik.

## Genomfört och verifierat

- Ändrade endast `docs/handbok/anvandning.md`, `mandat.md`, `regler.md` och `sakerhetslogg.md` för planen.
- `npm run docs:build` passerade och byggde den granskade Docusaurus-handboken.
- `cd web && npm run verify:phase4` passerade 2026-09-29 på revision `892352916dcccbbf9b2019c41ddfc9a98082f991`, med oförändrat källfingeravtryck. Rapporten finns lokalt i gitignorerade `work/pilot/results/phase4-summary.json`.
- Hela grinden passerade: 395 modell-/serverprov, 29 grindprov, typkontroll, lint och pilotlint, normalt och skyddat bygge, fyra baslinjeflöden, SQL 17/17 filer med 1 216 kontroller, åtkomst-API 16/16, mandat-API 26/26 med 139 kontroller, källbevis, register-API 18/18, lås 6/6 och browser 39/39 (13 i vart och ett av dator-, telefonstorleks- och byggd-app-projekten). Alla åtta kravkedjor fick automatiskt PASS.
- Provmålen var separata och lokala: baslinjen med sex migrationer och skyddat mål med 42 migrationer, båda loopback-bundna och med syntetiska uppgifter. Det skyddade målet använde en lokal testidentitetsleverantör och simulerad syntetisk källa.

## Kvarstående gränser

Telefonprojektets utvecklingsserver skrev återkommande modulimportfel i sin logg trots att 13/13 browserfall passerade. Det är inte ett prov på fysisk telefon. Inga verkliga elevuppgifter, kommun- eller registeranslutningar eller pilotdrift prövades. Det mänskliga användarprovet i 04-22 och separat `gsd-verify-work`/fasverifiering återstår. Inga krav markeras slutverifierade i denna plan.

Nästa steg är 04-22: genomför användarprovet, redovisa kvarstående begränsningar och gör därefter fasverifieringen separat.
