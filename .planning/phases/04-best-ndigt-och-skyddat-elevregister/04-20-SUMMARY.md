---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "20"
wave: 13
status: complete
completed: 2026-09-29
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
tested-revision: e5d7a61b9866d56e22101dc10c01841c84e00e90
commits: [17ab03e, 969533d, f854616, e636404, a6e853b, 1e882c6, 8d5f75c, 7612817, e5d7a61]
---

# Fas 4 plan 20: Samlad kravgrind och beviskarta

`cd web && node --test scripts/verify-phase4.test.mjs && npm run verify:phase4` passerade på det isolerade lokala `protected`-målet med syntetiska elever och separat lokalt `baseline`-mål. Slutrapporten `work/pilot/results/phase4-summary.json` har **PASS**, revisionen ovan, oförändrat källfingeravtryck under körningen och **PASS för alla åtta kravens automatiska beviskedjor**. Den genererades 2026-09-29 16:08–16:32 UTC. Resultatfilerna är gitignorerade och innehåller minimerade bevis, inte elevuppgifter eller hemligheter.

## Genomfört och kontrollerat

- `verify:phase4` är en fail-closed grind för Node 25, målskydd, 395 modell-/serverprov, 29 grind-/registerprov, typkontroll, lint, normalt och skyddat bygge, fyra bevarade utbildnings-/klass-/timplansflöden, 17 SQL-filer, äldre åtkomst 16/16, mandat 26/26, register-API 18/18, sex verkliga tvåanslutnings-/låsfall, källbaserade nekandebevis och 13 namngivna browserfall i vart och ett av dator, WebKit-telefonläge och byggd app: **39/39**. Alla obligatoriska steg är PASS; saknat, gammalt, duplicerat, hoppat eller fel mål/revision ger inte PASS.
- Varje browserprojekt får egen lokal förhandsvisning och nyställd syntetisk fixtur. Skyddsbehörighetsprovet använder huvudmannens inloggning följd av aktivt MFA-steg före beviljande/återkallelse. Keycloak-provhjälpen gör högst två nya OTP-försök om en tidsgränskod nekas; ett bestående inloggningsfel stoppar provet. Lokalt `--exclude-extra` kan starta baslinjen utan oanvänd lagringstjänst; skyddat mål behåller lagring för källbevisen.
- `docs/pilot/phase4-register.md` binder STU-01–06 och DATA-01–02 till namngivna SQL-, API-, lås- och browserfall och de aktuella rapporterna. Den anger urval/URI, källansvar, maskerade konflikter, historik kontra säkerhetslogg, migrering, avvecklade provvägar och gränsen för de syntetiska numren.

## Krav till resultat

| Krav | Samlat automatiskt bevis 2026-09-29 |
|---|---|
| STU-01 | SQL, register-API, browser 13 × 3 och gymnasie-/klassbaslinje PASS |
| STU-02, STU-03 | SQL, register-API och browser 13 × 3 PASS |
| STU-04, STU-06 | SQL, register-API, sex tvåanslutnings-/låsfall och browser 13 × 3 PASS |
| STU-05 | SQL, register-API och browser 13 × 3 PASS |
| DATA-01, DATA-02 | SQL, register-API, browser 13 × 3, äldre åtkomst 16/16, mandat 26/26 och källbaserade nekandebevis PASS; DATA-02 omfattar även låsfall |

Kravtabellen i `docs/pilot/phase4-register.md` anger exakta fallidentiteter och rapportfiler. Detta är **implementerat och automatiskt prövat lokalt med syntetiska uppgifter**. Det är ännu inte mänskligt godkänt eller slutverifierat i GSD.

## Kvarstående gräns

Flera tidigare omkörningar var röda på gammalt provtillstånd, nekad MFA och lokala Keycloak-/Docker-avbrott; de tillgodoräknas inte som bevis. Den slutliga sammanhängande körningen på ovanstående revision är grön. WebKit-utvecklingsservern skrev återkommande modulimportvarningar trots 13/13 gröna telefonfall; automatisk enhetsemulering är inte ett prov på fysisk telefon. `docs:build` blir obligatoriskt i grinden när 04-21:s handbokssammanfattning finns och är därför ännu inte utfört i denna plan.

Nästa steg är 04-21:s granskade användarhandbok och förnyade fullgrind, därefter 04-22:s mänskliga användarprov och separat `gsd-verify-work`. Ingen verklig kommunanslutning, verklig elevdata eller pilotdrift har verifierats. `.planning/REQUIREMENTS.md` ändrar därför inte slutstatus här.
