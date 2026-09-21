---
phase: 03
status: planned
nyquist_compliant: false
wave_0_complete: false
---

# Fas 3 — valideringskarta

Inga nya app-, SQL-, API- eller browserprov körda vid planering 2026-09-21. Planerade kommandon blir tillgängliga när respektive plan genomförs. Provprofiler är förslag från 03-RESEARCH.md, inte kundbeslut.

| Krav | Plan | Avgörande bevis |
|---|---|---|
| ACL-02 | 01–03, 06–07 | Rektor inom egen skola/tid får ge och avsluta; huvudman, annan skola och gammalt mandat nekas även via inbjudan |
| ACL-03 | 01–03, 06–07 | Huvudman utser rektor; rektor kan inte utse sig själv eller annan; direkt RPC ger samma resultat |
| ACL-04 | 01–03, 05–07 | Lärare egna grupper, admin egna skolor; elevhälsa skolscope respektive exakt elev/ärende; okänt nekar; inga främmande fält/antal |
| ACL-05 | 01–03, 05–07 | IT-status utan elevdata; separat rektorsgodkänd support; exakt sluttid, inget generellt export-/skrivmandat |
| AUDIT-02 | 04–07 | Läs/export/nekande inklusive alternativa vägar har faktisk källhändelse och avstämbar korrelation; flood ger inte tyst bortfall |
| AUDIT-03 | 04, 06–07 | Granskarisolering, innehållsminimering, append-only, 30-dygns syntetisk gallring och loggbortfall före varje svar |

## Körordning och frekvens

Efter policyändring: `cd web && node --test lib/mandate-policy.test.mjs`.
Efter SQL-ändring: använd befintliga `work/pilot/run-sql-tests.mjs` mot verifierat lokalt protected-mål; kontrollera dess faktiska CLI innan anrop. Nya testfiler måste uttryckligen ingå i runnerns uppsättning; om runnern inte autodetekterar dem, lägg till dem under plan 02 respektive 04 och redovisa utökad filomfattning.
Efter serverändring: `cd web && node --test lib/*.test.mjs && npx tsc --noEmit && npx oxlint app lib` samt relevanta SQL-/API-fall.
Efter UI-ändring: `cd web && npm run e2e:protected -- phase3-mandates.spec.ts` i dator- och telefonprojekten.
Slutgrind: `cd web && npm run verify:phase3`. Den omfattar `npm run build`, skyddat bygge, modell-/SQL-/API-/browserprov och berörda baslinjeflöden; verifiera att den faktiskt gör det.

Testinfrastruktur tillkommer i plan 01 (modell), 02/04 (SQL), 06 (API/grind) och 07 (browser). Intermediära planer får inte kalla ännu ej skapade prov passerade. Fas 2:s testresultat är historik tills de relevanta fallen körts mot fas 3-koden.

## Bevis och stoppvillkor

Använd syntetiska data och målskydd från verify-target.mjs. Resultat ska innehålla revision/fingeravtryck, tid, namngivna fall och faktisk status; inga cookies, tokens, elevinnehåll eller fria SQL-loggar med hemligheter i Git. Kontrollera logginsamlarens minimering före sparande. Källans otillgänglighet, miljöfel eller ett hoppat obligatoriskt steg betyder BLOCKED/FAIL. Testklientens egna nekanderapporter ersätter aldrig serverlogg.

Manuellt efter grön automatisk grind: användarprov av tilldelning, elevhälsa, support och loggfel på dator/telefon. En ännu ej fastställd verklig rättighetsmatris eller lagringstid ska kvarstå som kundberoende; syntetiskt prov godkänner inte verklig drift. Nyquist-status ändras först när provkoppling och körbevis faktiskt är kompletta.
