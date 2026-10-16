---
phase: 05-bevarade-utbildnings-och-klassfloden
package: APL
stage: 1
status: in_progress
date: 2026-10-16
gap: APL-01
local_acceptance: [APL1-01, APL1-02, APL1-03, APL1-04, APL1-05, APL1-06, APL1-07, APL1-08]
related_requirements: [ADMIN-02, ADMIN-04, PLANERING-01]
---

# APL i timplanen – genomförandepaket

Användaren har godkänt riktningen med ”låter som en bra lösning”. [Kontexten](05-APL-CONTEXT.md) avgränsar etapp 1 och [kontraktet](05-APL-CONTRACT.md) anger modell, roller, bevarande och lokala acceptanskriterier. Användaren beställde genomförandet med **”top kör på nu”** 2026-10-16. APL-01 är klar med 62 modell-/regressionsprov, typkontroll och lint; se [handoff](05-APL-01-SUMMARY.md). APL-02 är klar med faktisk isolerad SQL, 46 kontroller, 5 680 nyckelprober och två samtidighetsfall; se [redovisning](05-APL-02-SUMMARY.md). APL-03 är klar med 33 faktiska SQL-kontroller, tre observerade samtidighetsfall och bevarade original; se [redovisning](05-APL-03-SUMMARY.md). 3 av 11 paketplaner är klara. APL-04 och 04A pågår parallellt. Ingen faktisk Worker-/UI-verifiering eller ny lokal leverans finns ännu. Etapp 2–3 och full fasacceptans förblir öppna.

Målet är att rektor och skoladministratör kan planera APL i rätt namngivna timplan, se total undervisningstid och varav APL, spara ett granskningsbart underlag och skilja rektors förläggningsbeslut från huvudmannens fastställande. Det första automatiskt bedömda området är appens redan stödda skolförlagda nationella Gy25-yrkesprogram. Perioder med osäker omfattning kan sparas men får inget falskt uppfyllelsebesked. Elevplatser, genomförande och närvaro ingår inte.

## Ordning och filägarskap

Discovery består av [primärkälleresearchen](../../research/APL-PLANERING-OCH-GENOMFORANDE-2026-10-16.md) och färsk kodinventering av skyddade SQL-, server- och UI-vägar. Inga nya externa bibliotek eller integrationer behövs. Septemberkartorna beskriver äldre kod; varje executor kontrollerar senaste funktionsdefinitionen före ändring.

| Plan | Våg | Beroenden | Resultat |
| --- | --- | --- | --- |
| [01](05-APL-01-PLAN.md) | 1 | Kontraktet | Rena typer, parsers, minutberäkning och testad kanonisk hash. Exakt kontraktshandoff innan SQL. |
| [02](05-APL-02-PLAN.md) | 2 | 01 | Additiv stängd lagring och atomiska APL-kommandon med mandat, CAS, audit och kvitto. |
| [03](05-APL-03-PLAN.md) | 3 | 02 | Beslut, äldre ärenden, innehållsaktualitet och båda timplanskopieringsvägarna. |
| [04](05-APL-04-PLAN.md) | 4 | 01, 03 | Tre skyddade API-vägar och exakt Workeråtkomst. |
| [04A](05-APL-04A-PLAN.md) | 4 | 01, 03 | Versionsmedvetna beslutsparsers och scopebunden återhämtningsjournal. |
| [05](05-APL-05-PLAN.md) | 5 | 04, 04A | APL-editor, varavvisning, sparning och samordnade arbetsytespärrar. |
| [06](05-APL-06-PLAN.md) | 5 | 04, 04A | APL-underlag i befintligt beslutsflöde och användarhandbok. |
| [07](05-APL-07-PLAN.md) | 5 | 04, 04A | Faktisk SQL, migrationsbevarande, paritet och samtidiga sessioner. |
| [08](05-APL-08-PLAN.md) | 6 | 05, 06, 07 | Samma kandidat i faktisk Worker/OIDC, dator/telefon och konkret releaseunderlag. |
| [09](05-APL-09-PLAN.md) | 7 | 08 + exakt installationsgodkännande | Kontrollerad lokal installation, bevarande och förberett användarprov. |
| [10](05-APL-10-PLAN.md) | 8 | 09 | Separat mänsklig bedömning av begripligheten. |

Det är elva planer i åtta vågor. 04 delades i två eftersom ny API, historisk beslutstolkning och återhämtning annars gav en för stor säkerhetsändring. 10 har avsiktligt en enda checkpointuppgift; övriga planer har två uppgifter. Filerna i 04/04A och 05/06/07 överlappar inte. Vid genomförandet kompletteras 04 med en separat avgränsad SQL-/ACL-runner (`work/pilot/verify-apl-plan-access.mjs`) och 04A med de två befintliga beslutsrutterna `underlag`/`andra`, så att färsk serverkontext når den oberoende projektorn. Detta ändrar inte mandat eller yttre requestkontrakt. Samordnaren äger commit/push och statusfiler, integrerar efter varje våg och förhindrar att senare plan startar mot ofärdiga kontrakt. Äldre fasplaner körs inte om.

APL-knappen **Bekräfta förläggningen** och APL-kommandots journal ägs av 05:s komponent. 06:s beslutspanel visar samma sparade underlag och erbjuder befintlig submit/return/approve/withdraw; den har ingen separat APL-granskningsalgoritm. 05 skickar samlat tim-/APL-dirty, pågående skrivning och okänt utfall genom panelens befintliga `disabled`-prop. Även en redan öppnad bekräftelsedialog ska respektera spärren. Servern och SQL kontrollerar alltid aktuellt innehåll och mandat oberoende av UI.

## Viktiga genomförandeval

- Befintliga timceller är fortsatt heltal/null och betyder total undervisningstid. Den nya APL-andelen lagras i heltals-GUT-minuter: 690 + 690 minuter kan fördelas på två nivåer utan avrundning. En granskad hel vecka ger 23 × 60 minuter. Delveckor får ingen ny schablon genom minutprecisionen.
- Periodens omfattning räknas en gång, medan innehållskopplingar och tidsallokeringar är skilda relationer. Nulltotal eller en APL-andel över totalen nekar allokeringsskrivning. En period kan ändå sparas utan färdig fördelning. Senare totalminskning under APL-andelen nekas med rättningsväg.
- Kalenderdatum visar förläggning, inte beräknat veckotal. Vårstart och period över år/termin kräver uttrycklig fördelning. En plan avser en planeringsgrupp; olika klassvarianter använder olika namngivna timplaner. Ingen dold summering av parallella elevgrupper införs.
- Rektors händelse är innehållsbunden och oföränderlig. Samma timplansrevision används för CAS, men en administrativ submit-/approve-revision gör inte i sig rektors granskning inaktuell.
- Gamla beslut, timmar och kvitton bevaras. Ett redan inskickat äldre yrkesärende behöver kompletteras före ett nytt approve; återkalla/återsänd ska fungera. Gammalt redan utfört beslut kan återhämtas med exakt historiskt resultat. Betrott lagrat kontrakt avgör legacytolkningen; klienten kan inte välja en svagare kontroll.
- Programplanens godkännande får inget nytt beroende av en ännu ej skapad skolvis timplan. Skyddad kopiering till nästa kull fortsätter kopiera programramen, inte timplan/APL. Ny timplansversion eller uttrycklig strukturkopia får nytt granskningsbehov och inga kopierade beslut.

01:s handoff ska precisera exakta JSON-shapes, enumvärden, gränser och kanonisk hashpayload i exporterade typer samt sin SUMMARY. Normalisera listordning deterministiskt; rent omordnad semantiskt identisk data ska inte ogiltigförklara rektorshändelsen. Ange även revision-/auditutfall för no-op och bekräftelse. SQL i 02 följer denna färdiga definition och jämför fasta hashvektorer med TypeScript. Ingen parallell gissning av kontrakt tillåts.

## Verifiering och körkontrakt

Följande CLI är krav på nya runners när de implementeras, inte kommandon som går att köra redan nu. Samtliga tar privata rapportvägar och ska vägra oväntat mål; inga råa svar, sessionsuppgifter eller hemligheter skrivs i Git. `--out`-runners bygger eller använder en uttryckligt validerad privat schema-only-kopia med syntetiska fixturer. De får inte falla tillbaka till aktiv databas för skrivprov.

| Plan | Körning från projektroten om inte annat anges |
| --- | --- |
| 02 | `node work/pilot/verify-apl-plan-commands.mjs --out /private/tmp/apl-commands.json` |
| 03 | `node work/pilot/verify-apl-plan-decisions.mjs --out /private/tmp/apl-decisions.json` |
| 07 | `node work/pilot/verify-apl-plan.mjs --out /private/tmp/apl-sql.json` |
| 08 | `node work/pilot/verify-apl-plan-api.mjs --build-root /private/tmp/apl-candidate --out /private/tmp/apl-actual.json` |
| 05, från `web/` | `npx playwright test -c playwright.apl-preview.config.ts` |
| 06, från `web/` | `npx playwright test -c playwright.apl-decision.config.ts` |
| 08, från `web/` | `npx playwright test -c playwright.apl-actual.config.ts` med runnerns privata fixtures och explicit isolerad `PHASE5_BASE_URL` |

08:s runner äger Worker/OIDC-fixturernas livslängd och kör den faktiska browserkonfigurationen innan cleanup. Om browsern startas separat måste samma journal skydda livslängd och mål. Konfigurationen matchar endast den avsedda APL-specen, kräver explicit lokal kandidatadress och nekar port 3012. Simulerade 05/06 använder egna previewfixturer/portar och kallas aldrig faktiska API-prov. Inga generella `e2e:protected`-körningar används som bevis för detta paket.

Relevanta modell-/serverregressioner, `npx tsc --noEmit`, `npx oxlint app lib`, separat skyddat produktionsbygge och `npm run docs:build` ingår enligt planerna. Samma source/buildmanifest ska gälla faktisk API, dator, telefon och leverans. Testa bland annat 15 veckor = 20 700 GUT-minuter, flera ämnen utan dubblering, minutprecision, null/överfördelning, vårstart, två klassvarianter, gammalt submitted/approved-kvitto, programplansapprove före APL, återkallat mandat, förlorat svar och verklig save/rad/approve-konkurrens.

## Migration och sista installationsbeslut

Nya migrationer förbereds som `20261016120000_apl_planning.sql`, `20261016121000_apl_plan_decisions.sql` och `20261016122000_apl_worker_access.sql`; kontrollera vid utförande att namnen är fria. Paketet aktiveras sammanhängande, inte en ny SQL-form mot en gammal Worker. Ingen installerad historisk migrationsfil ändras.

Tunga DDL-, rollback- och samtidighetsprov körs enbart i privat schema-only-kopia med granskade syntetiska förhandsrader. Inga verksamhets-/identitetsrader exporteras från aktivt mål, ingen reset eller DB-/IdP-omstart görs. Syntetiskt bevarande bevisar inte att användarens originaldata har migrerats.

08 förbereder exakt release, bevis, mål- och bevarandekontroll innan en eventuell godkännandefråga. Tidigare godkännande för fem andra migrationer är inte generellt tillstånd för detta permanenta schema. Om samma exakta APL-release redan har godkänts i sessionen frågas det inte igen. 09 startar först med giltigt konkret godkännande och kontrollerar originalfingeravtryck före/efter faktisk apply utan dataexport. Återställbar app betyder inte att databasändringen automatiskt återställs.

## Krav och SS 12000

| Kriterier | Primära planer | Bevis |
| --- | --- | --- |
| APL1-01–03 | 01–02, 05, 07–08 | Uttrycklig profil, beständiga perioder, korrekt varav och okändsemantik. |
| APL1-04 | 03, 04A, 06–08 | Skilda ansvarshändelser, aktuell innehållshash och bevarad legacyåterhämtning. |
| APL1-05 | 02–04A, 05, 07–08 | Servermandat, CAS, MFA/CSRF, audit och exakt återhämtning. |
| APL1-06 | 03–04A, 05, 07–09 | Namngivna planer, versioner, klass-/läsårslänkar och historik bevaras. |
| APL1-07–08 | 05–10 | Begripligt UI/handbok, faktisk integration, kontrollerad leverans och separat användarbedömning. |
| ADMIN-02/04, PLANERING-01 | 03, 05, 07–09 | Befintligt program-/klass-/planeringsflöde bevarat; inte full kravacceptans. |

SS 12000:2024, utgåva 4, och publicerat OpenAPI 2.1.0 avstäms enligt kontraktet och researchen. Egna APL-planobjekt är inte standardens `Placement`; periodplanering är inte faktisk `Attendance`. Stabila organisationer, klasser, medlemskap, giltighet och käll-/skrivansvar bevaras. Ingen extern standardanslutning, elevplacering eller genomförandeintegration verifieras här.
