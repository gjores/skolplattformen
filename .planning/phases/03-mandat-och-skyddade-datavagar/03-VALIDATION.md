---
phase: 03
status: automated-pass-awaiting-user-recheck
nyquist_compliant: false
wave_0_complete: false
---

# Fas 3 — valideringskarta

Inga nya app-, SQL-, API- eller browserprov körda vid planering 2026-09-21. Planerna reviderades genom kodläsning 2026-09-22; inte heller då kördes produktproven. Planerade kommandon blir tillgängliga när respektive plan genomförs. Provprofiler är förslag från 03-RESEARCH.md, inte kundbeslut.

| Krav | Plan | Avgörande bevis |
|---|---|---|
| ACL-02 | 01–03, 06–07 | Rektor inom egen skola/tid får ge och avsluta; huvudman, annan skola och gammalt mandat nekas även via inbjudan |
| ACL-03 | 01–03, 06–07 | Huvudman utser rektor; rektor kan inte utse sig själv eller annan; direkt RPC ger samma resultat |
| ACL-04 | 01–03, 05–07 | Lärare egna grupper, admin egna skolor; elevhälsa skolscope respektive exakt elev/ärende; okänt nekar; inga främmande fält/antal |
| ACL-05 | 01–03, 05–07 | IT aktiverar/pausar och provar lokal anslutning utan elevdata; separat rektorsgodkänd support; exakt sluttid, inget generellt export-/skrivmandat |
| AUDIT-02 | 04–07 | Läs/export/nekande inklusive alternativa vägar har faktisk källhändelse och avstämbar korrelation; flood ger inte tyst bortfall |
| AUDIT-03 | 04, 06–07 | Granskarisolering, innehållsminimering, append-only, 30-dygns syntetisk gallring och loggbortfall före varje svar |

## Körordning och frekvens

Efter policyändring: `cd web && node --test lib/mandate-policy.test.mjs`.
Efter SQL-ändring: `node work/pilot/run-sql-tests.mjs --file phase3_mandates.test.sql --out work/pilot/results/phase3-sql-mandates.json` respektive `--file phase3_audit.test.sql --out work/pilot/results/phase3-sql-audit.json` från roten. Runnern upptäcker redan .sql-filer; målskydd körs före anslutning. Se 03-EXECUTION-CONTRACT.md för källproven och nya runners.
Efter serverändring: `cd web && node --test lib/*.test.mjs && npx tsc --noEmit && npx oxlint app lib` samt relevanta SQL-/API-fall.
Plan 06 kör API och sammanställarprov; full grind krävs först i plan 07. Efter UI-ändring: `cd web && npm run e2e:protected -- phase3-mandates.spec.ts` i dator- och telefonprojekten.
Slutgrind: `cd web && npm run verify:phase3`. Den omfattar `npm run build`, skyddat bygge, `npm run docs:build` från roten, modell-/server-/SQL-/API-/browserprov och berörda baslinjeflöden; verifiera att den faktiskt gör det.

Testinfrastruktur tillkommer i plan 01 (modell), 02/04 (SQL), 06 (API/grind) och 07 (browser). Intermediära planer får inte kalla ännu ej skapade prov passerade. Fas 2:s testresultat är historik tills de relevanta fallen körts mot fas 3-koden.

## Bevis och stoppvillkor

Använd syntetiska data och målskydd från verify-target.mjs. Resultat ska innehålla revision/fingeravtryck, tid, namngivna fall och faktisk status; inga cookies, tokens, elevinnehåll eller fria SQL-loggar med hemligheter i Git. Kontrollera logginsamlarens minimering före sparande. Källans otillgänglighet, miljöfel eller ett hoppat obligatoriskt steg betyder BLOCKED/FAIL. Testklientens egna nekanderapporter ersätter aldrig serverlogg.

Manuellt efter grön automatisk grind: användarprov av tilldelning, elevhälsa, support och loggfel på dator/telefon. En ännu ej fastställd verklig rättighetsmatris eller lagringstid ska kvarstå som kundberoende; syntetiskt prov godkänner inte verklig drift. Nyquist-status ändras först när provkoppling och körbevis faktiskt är kompletta.

## Körresultat 2026-09-26 (plan 03-07)

Färsk fasgrind `cd web && npm run verify:phase3` på revision `7d4ec8d` (14:42–14:58 UTC): **PASS**, inga valideringsfel. Rapport: `work/pilot/results/phase3-summary.json`. Detaljer och rättade fel: `docs/pilot/phase3-mandates.md`.

| Krav | Bevissteg i körningen | Automatiskt resultat | Återstår |
|---|---|---|---|
| ACL-02 | sql (540), access-api (16), mandat-api (25/130), fas3-arbetsyta-browser (18), fas3-mandat-browser (36) | PASS | Användarprov 03-07, gsd-verify-work |
| ACL-03 | som ACL-02 | PASS | som ovan |
| ACL-04 | modeller (281), sql, mandat-api, fas3-arbetsyta-browser, fas3-mandat-browser | PASS | som ovan |
| ACL-05 | som ACL-04 | PASS | som ovan |
| AUDIT-02 | sql, access-api, mandat-api, källbevis (4 vägar, 3 avbrott), båda fas 3-browsersviterna | PASS | som ovan |
| AUDIT-03 | sql, mandat-api, källbevis, fas3-mandat-browser | PASS | som ovan |

Regressioner i samma körning: baslinje-db PASS (utbildning och kurs-/nivåtillägg, kullkopiering, klass–timplan, grundskolans timplan), fas 1-browser 26 PASS, fas 2-browser 37 PASS. Endast redovisade projekthopp förekom (1 respektive 19).

Allt är lokalt och syntetiskt. Ingen verklig IdP, lagringstid eller kommunanslutning är prövad. Mandatbrowserns telefonbevis är WebKit i iPhone-storlek; en fysisk telefon når inte den lokala miljön. Kraven markeras inte som verifierade i REQUIREMENTS.md förrän användarprovet och gsd-verify-work är gjorda. Nyquist-status ändras inte av denna körning, eftersom det manuella steget återstår.

## Körresultat 2026-09-27 (plan 03-07, efter användarprovets avvikelser)

Användarprovet 2026-09-26/27 godkändes inte. Tre avvikelser rättades inom 03-07:
- Verifieringen gick inte att nå inifrån dialogen (43c6b79).
- Engångskod ska anges vid inloggningen för den som har registrerad kod (d9499dc).
- Support ska kunna ges för grupper (2d17d4c).

Handboken är uppdaterad (4fb5773).

- Färsk grind på `4fb5773` (11:13–11:42 UTC): **FAIL**. access-api fick HTTP 500 och därefter `fetch failed` när provets Worker slutade svara. Samma prov fristående gav 16/16. Resultatet står kvar som FAIL för den körningen.
- Färsk grind på `278f235` (11:43–12:13 UTC): **PASS**, alla steg och inga valideringsfel. Rapport: `work/pilot/results/phase3-summary.json`.

| Krav | Bevissteg i körningen | Automatiskt resultat | Återstår |
|---|---|---|---|
| ACL-02 | sql (565), access-api (16), mandat-api (26/139), fas3-arbetsyta-browser (18), fas3-mandat-browser (45) | PASS | Nytt användarprov 03-07, gsd-verify-work |
| ACL-03 | som ACL-02 | PASS | som ovan |
| ACL-04 | modeller (305), sql, mandat-api, fas3-arbetsyta-browser, fas3-mandat-browser | PASS | som ovan |
| ACL-05 | som ACL-04 (inklusive support-groups och gruppsupport i browsern) | PASS | som ovan |
| AUDIT-02 | sql, access-api, mandat-api, källbevis (4 vägar, 3 avbrott), båda fas 3-browsersviterna | PASS | som ovan |
| AUDIT-03 | sql, mandat-api, källbevis, fas3-mandat-browser | PASS | som ovan |

Regressioner i samma körning: baslinje-db PASS, fas 1-browser 26 PASS (1 redovisat hopp), fas 2-browser 37 PASS (19 redovisade hopp). Allt är lokalt och syntetiskt. Kraven är inte markerade som verifierade.
