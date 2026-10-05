---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: 05-23
step: D
verified: 2026-10-05T19:04:00Z
status: human_needed
score: 7/7 scoped automated must-haves verified
scope: local-synthetic-only
plan_complete: false
human_verification:
  - test: "Skapa och versionera skolans valpaket, välj det i ett block och fördela nivåerna på dator och telefon."
    expected: "Tillåtna nivåer och paketets poäng är begripliga. Ny version bevarar tidigare val. Konflikt eller obekräftat sparande bevarar användarens uppgifter."
    why_human: "Automatiska Worker-/browserprov och bildgranskning ersätter inte verksamhetens bedömning av arbetsflödets tydlighet."
  - test: "Öppna skolornas IV-analys och jämför saknad idrott, estetiskt ämne och behörighetsnivåer med skolans faktiska utbud."
    expected: "Kontrollerna gäller rätt skola; saknad rättighet är risk och estetisk ämneslista redovisas som Att kontrollera. Rektor och skoladministratör arbetar endast inom sitt skolmandat."
    why_human: "Verksamhetens förståelse och godkända verkliga uppdrag/utbud har inte provats med kommunuppgifter."
---

# 05-23 steg D — oberoende målverifiering

**Status: human_needed.** Sju avgränsade automatiska sanningar för generella valpaket är verifierade genom aktuell kod, faktisk SQL/TS-paritet, byggd skyddad Worker och prov på dator/telefon. Mänsklig begriplighetsbedömning återstår. **Hela 05-23 är fortfarande in_progress; E, ADMIN-02/ADMIN-03:s slutgodkännande och full fas 5 ingår inte i denna delverifiering.**

## Avgränsning och källkedja

Granskningen gäller PLAN D och D-03/D-07/D-08/D-10:s paketdel samt D-19. AGENTS, PROJECT, STATE, codebase-underlag, PLAN/CONTEXT, tidigare C-verifiering, D:s funktionsinventering och faktisk berörd kod har lästs. SUMMARY- och inventeringspåståenden har jämförts med implementation, rårapporter och bilder. Verifieraren har inte ändrat produktkod, kört migration/grant, skrivit provdata, byggt, bytt server, committat eller pushat.

Slutligt skyddat API-bygge är **a307d26d0e6ca712e07a96b052a01c451b18b966**. Produktkod i app/lib/SQL är byteidentisk med browserbygget **a4e6ad6092115c789207e03d1ab4db56bd22a8f3** och preflightbygget **13883616421817a5e6320486b02912fcac1d57e1**. Senare commits rättar och utökar provunderlag; a307d26 rättar en påvisad äldre städningslucka och utökar källbevakningen. Preflightens 62 hashvärden var aktuella när grant öppnades; tre provverktyg har därefter ändrats, så dessa preflighthashar är historiska. Färskt D-API på a307d26 har 63/63 aktuella hashvärden, B/C vardera 53/53 och huvud-API 19/19. Slutlig paritet har körts om med rättad provhjälpare; 10/10 hashvärden matchar aktuell kod.

## Observerbara sanningar

| # | Sanning inom D | Status | Kontrollerat bevis |
|---|---|---|---|
| 1 | Ett paket skapas med version 1. Ny version ändrar varken tidigare komplett paketversion eller skolval som pekar på den; samma paket kan användas i två planer. | VERIFIED | SQL-rader är unika på package_id/version. Trigger nekar UPDATE/DELETE/TRUNCATE, exakt version löses utan senaste-version-fallback. SQL 137, D-API:s version/immutabilitet/återläsning och B08 provas genom riktiga datavägar. |
| 2 | HM kan skapa för egen skola eller alla egna skolor. Rektor/administrator kräver verkligt mandat för både versionskällan och målet och kan inte versionera global källa. | VERIFIED | SQL börjar med aktuell session/actor och kontrollerar source_unit/target_unit i skol-id-ordning före advisory-paketlåset. Ny version kräver senaste CAS och oförändrad källskola efter låsväntan. D-API provar tre roller, främmande skolor/kund, globala källor och samtidiga HTTP-anrop med exakt en vinnare/en 409. |
| 3 | HU/NA/fördjupning/IV har rätt typ, ämneslista, katalog, datum, blockpoäng och fasta-nivåspärr; otillåtna generiska moderna språk avvisas. | VERIFIED | Strict TS-parser, SQL package_levels och validate_scoped_selection är genomkopplade. HU LATI1 och NA BIOG1 jämförs nu med verkliga terminsrader; Svenska/SvA-alternativ plattas ut och spärras också. 33 identiska TS/SQL-vektorer PASS inklusive datum, katalog, typ, poäng, distributionsform och gamla versioner. B09 visar endast tillåten BIOG2 och återläser exakt ref. |
| 4 | Analysen summerar IV-utbud över skolans samtliga IV-block och ger rätt D-19-kategorier; jämförbara/estetiska nivåer gissas inte. | VERIFIED | analyseProgramplanPackages integreras med sparade skolval och exakta katalogversioner. Saknad nästa IDRO och yrkesbehörighet ger risk; svenska/SvA/engelska i fasta rader räknas. Estetiskt ämne och 4 kap. 8 § redovisas Att kontrollera med skola/ämnen. Identisk nivå i olika block ger risk. B08 provar 2 × 100, idrottsrisk och fortsatt Klar för beslut. |
| 5 | Dialogen visar mandatsskola, typ, bara giltiga nivåer och poängsumma. Paketeditorn laddar hela underlaget och skyddar scope, osparade värden, omläsning och versionskonflikt. | VERIFIED | Dialogens kandidater filtreras på GY, ämnestyp, datum, fasta rader och fördjupningsalternativ. Save kräver rätt poäng; servern omvaliderar. Initial paketread väntar på alla skolors bibliotek före publicering. Scope/remount aborterar dialoganrop; dirty registreras på faktisk plan/uppdrag. Omläsning låser skolbyte och laddar både skolval och bibliotek. Globala immutable refs slås samman utan att andra skolors tidigare refs försvinner. |
| 6 | Obekräftat skrivsvar bekräftas genom listning innan ny write; gammal versionsdialog får konflikt och behåller användarens ändringar. Dator-/telefonflöden och paketlayout fungerar. | VERIFIED | Dialogen listar före write, sparar baseline och jämför exakt förväntad version/innehåll efteråt. Osäkert resultat låser ny skrivning. B11 låter verklig Worker commit ske och bryter svaret: exakt en POST/exakt en återläst version. Därefter verklig konkurrerande version 2, 409 i den gamla dialogen, bevarat namn och avstängd save. B08/B09/B11 × dator/telefon = 6/6. B08/B09 originalbilder granskade; D:s paketnamn/knappar/terminsfält ryms. |
| 7 | D öppnar exakt två Worker-entrypoints efter preflight. Tabellen/hjälparna/klientvägarna förblir stängda; DB- och Worker-audit är obligatorisk och tidigare verksamhetsrader/ACL bevaras. | VERIFIED | Foundation har FORCE RLS, noll direktgrants och sju stängda nya funktioner. Separat 157000 öppnar enbart save/list. Faktisk preflight visar 19→21→19, grant/slut-API exakt 21. Routes kräver MFA för write, same-origin/CSRF och required audit. Serveradapter kräver exakt receipt. D-API injicerar både DB/Worker-auditfel för save/list och bevisar rollback/inget success-event. Riktade rollbackprov bevarar gamla funktioner/ACL och elva originaltabeller; D-API/paritet jämför tolv inklusive nya biblioteket och städar egna rader. |

**Poäng: 7/7 avgränsade automatiska sanningar.** Inga kvarstående blockerande kod-/genomkopplingsfynd inom D har identifierats.

## Artefakter och viktiga länkar

| Artefakt | Substans och koppling |
|---|---|
| `web/lib/programplan-packages.ts` | Slutna generiska definitioner/listor/refs, exakt immutable lookup, skol-/katalog-/typ-/nivåkontroll och paketfördelning. Språkpaketets bevarade separata form fungerar parallellt. |
| `web/lib/programplan-analysis.ts` | Skolbunden samlad IV-analys, nivåordning/överlapp, saknade exakta versioner, risk vid identiska nivåer i olika block och uttryckliga manuella källkontroller. |
| `web/app/protected-programplan-package-dialog.tsx` | Verklig create/version-dialog → API save/list → baseline/reread, AbortController, dirty-/MFA-/CAS-/obekräftat-skydd. |
| `protected-programplan-packages.tsx`, `protected-programplan-board.tsx`, `protected-programplan-workspace.tsx` | Utfällbara skolpaket, katalog/val-laddning, nivåfilter och terminsfält. PLAN:s avsedda `protected-programplan-block.tsx` motsvaras av den genomkopplade befintliga paketkomponenten. |
| `/api/programplaner/valpaket`, `/valpaket/lista`, `web/lib/server/programplan-packages.ts`, `audit-details.ts` | Strikta requests och svar, parametriserad SQL, HM/R/admin, MFA/CSRF och obligatorisk audit före svar. Audit innehåller ids/version/count, inga paketnamn eller nivåinnehåll. |
| `20261004156000_phase5_programplan_packages.sql` | Immutable tabell/sju nya funktioner och exakt tre avgränsat ersatta gamla funktioner. SQL-SHA256 `7e087cfd70c589fc979817a489ea0d52512be1f4ca85523baf8798caf20cfa38`. |
| `20261004157000_phase5_worker_programplan_packages.sql`, apply-verktyget | Exakt två senare grants; kräver D:s kompletta rätt-target/preflight/cleanup/bevarande/ACL- och hashbevis. SQL-SHA256 `2e236c16180f539722e7098d88a8d2a2575824d9804a2a51f07594fe71956ea2`. |
| `phase5_programplan_unit_packages.test.sql`, D-API/paritet och B08/B09/B11 | Substantiella verkliga prov. Syntetiska fixturer är avgränsade och egna rader städas; immutabla biblioteket rensas bara med särskilt ägarskapskontrollerad provkod. |

Andra skolors list-API exponerar endast exakta paketversioner som redan valts i delade läsbara utbildningar. Lästillgång till en annan skolas val ger ingen rätt att versionera den skolans källa. Rektors/admins skrivmandat omkontrolleras på servern; klientens rollval används endast för visning. Ingen återstående blockerande stub eller TODO har identifierats i D-kedjan.

## Körbevis och begränsningar

| Kontroll | Resultat och rapport |
|---|---|
| Modell/server | Rå `phase5-23-d-node.log`: **646/646 PASS**, inga skip/fail. Den sena produktändringen i globala bibliotekssammanslagningen är UI-kod och provas i slutbyggets browser/API; senare commits ändrar provunderlag. |
| Riktad SQL och historisk regression i rollback | **137 + 428 = 565 PASS**. Åtta rå TAP/JSON under `/private/tmp/phase5-23-d/`: paket 137, katalog 60, drafts 108, Worker 31, workspace Worker 18, lifecycle 125, timplan Worker 27 och selection 59. Yttre rollback, gamla funktioner/ACL och originaltabeller bevarade. Foundationrapport i `phase5-23-d-sql-foundation.json` är grön och påstår ingen helfasstatus. |
| TS/SQL-paritet | **33/33 PASS**, färsk `phase5-23-d-parity.json` efter städningsrättningen, 10/10 aktuella sourceHashes. Complete/rollback/bevarande/ACL/cleanup PASS; tolv helradstabeller oförändrade och noll egna kunder/paket/skolval/auditrader efter rollback. |
| Preflight och separat grant | **11/11 PASS** på 1388361, `phase5-23-d-preflight.json`; 62/62 källhashar, complete/cleanup/originalBusinessPreserved/preflightAclRestored/aclUnchanged true, exakt 19→21→19. `phase5-23-d-grant.json`: protected, exakt SQL-SHA, reset=false/journalOnly=false. Slutligt D-API bevisar faktisk permanent Worker-mängd 21. |
| Slutligt D-API | **11/11 PASS** på a307d26, `phase5-23-d-api.json`: actual workerd/skolplattform_worker, complete/cleanup/ACL/tolv helradstabeller PASS, egna paket/skolkopplingar=0; 63/63 sourceHashes matchar. |
| API-regressioner | **C 16/16, B 11/11, program 48/48, terminer 31/31, livscykel 39/39 och utbildning 43/43 PASS** i färska omgångar på a307d26; respektive `phase5-23-d-{c,b,program,terms,lifecycle,education}-api.json`. Complete/cleanup/bevarande PASS och samtliga bevakade källhashar matchar aktuell kod. Huvud-API hashar nu också offering_units och kräver noll egna skolkopplingar/paket efter städning för både huvud- och främmande fixtur. Äldre text om antal grants i B ändrar inte D:s exakta faktiska 21-inventering. |
| D-browser och bilder | **6/6 PASS** på a4e6ad6, `phase5-23-d-browser.json`: B08/B09/B11 på dator/Chromium och telefon/WebKit, inga skip/flaky. Sex städningsbilagor: noll egna verksamhetsrader; audit/ankare bevarade. Rå JSON och fyra rapporterade bildhashar matchar. B08/B09 desktop+phone har också granskats oberoende i originalupplösning. NAVE-provet är en avsiktligt ofullständig totalplan 2200/2500; dess PASS innebär bara NAVE-flödet. |
| Bygge och handbok | Färska API-rapporter anger protected/a307d26; browser körde produktidentiskt a4e6ad6. Rå bygglogg och faktisk Worker/browser bevisar körbar skyddad app. Rå Docusauruslogg visar lyckat bygge; fullplanshandbok och E:s slutliga dokumentationsprov återstår. |
| C/B-browserregression | **C 16/16 och B 6/6 PASS** på samma a4e6ad6, `phase5-23-d-language-browser.json`/`phase5-23-d-block-browser.json`. Byggbilagor visar Chromium och WebKit. 22 ytterligare städningsbilagor: noll egna verksamhetsrader och bevarade audit/ankare. Rårapporterna är också bevarade med särskilda slutnamn under `web/test-results/`. |
| Vanlig 3012 | Färskt D-API **11/11 PASS** på a307d26, `phase5-23-d-3012-api.json`, med 63/63 källhashar, exakt 21 Workerfunktioner och egen cleanup/ACL/tolv helradstabellers bevarande. `phase5-23-d-runtime-after.json` är **PASS** på samma bygge: actual workerd/skolplattform_worker, alla tolv tabellers exakta helradshashar och samtliga 18 scenarier identiska med runtime-before, 44 auditerade läsningar, HM/rektor × nio utbildningar. Verifieraren har själv jämfört dessa rapportfält. Första runtime-FAIL och de 74 syntetiska kopplingarnas verifierade rättning bevaras separat. |

Full SQL har inte körts om som del av denna avgränsade D-granskning. Den senast redovisade fullsviten i C är **2411/2412, FAIL** för äldre `phase2_audit.test.sql` #13 (förväntat `%serverkontext%`, faktiskt `History denied`). Den historiska FAIL-statusen bevaras och denna riktade D-regression gör inte fullsviten grön. **05-22:s tidigare PARTIAL för fyra timplans updated_at bevaras också**; aktuella helradshashar reparerar inte historiska tidsstämpelförändringar.

## Rättade fynd och röda bevis

- C:s SQL-validerare läste fasta ämnen och fördjupningsalternativ via ett obefintligt `resolution.basis`. D använder aktuella terminsrader och exakt pinnat program. TS/SQL-pariteten bevisar HU LATI1, NA BIOG1, svenska/SvA-alternativ och fast vald fördjupning.
- Dialog/laddning/filter/omläsning rättades för fulla skolbibliotek, datum, fasta alternativrader, scoped dirty och säkert dialogavbrott. Omläsning låser skolbyte och läser både skolval och bibliotek. Global sammanslagning behåller gamla immutable refs.
- Första D-browseromgången är **4/6 PASS, 2/6 FAIL**, bevarad i `phase5-23-d-browser-first.json`: B09:s dynamiska JSON-import saknade importattribut. Felet uppstod före produktanrop.
- Andra D-browseromgången är **4/6 PASS, 2/6 FAIL**, bevarad i `phase5-23-d-browser-second.json`: områdessökningen saknade katalogens ord `Ett`. Snapshot visade det faktiskt öppnade NAVE-blocket. Slutlig full D-omgång är 6/6; tidigare FAIL skrivs inte om till PASS.
- Första paritetsomgången stoppades efter gröna fall av provets egen hashfunktion för en avsiktlig bråkvektor. `parity-first-fail.json` bevaras. Hashning rättades till vanlig JSON för ogiltiga vektorer; slutlig 33/33 är faktisk ny komplett omgång. Både första och sista omgångens business/ACL återställdes.
- Första runtimeomgångens FAIL blottlade en äldre provstädningslucka: `cleanupProgramplanFixture` stängde av FK-cascade genom replica-läge men rensade inte offering_units. Huvud-API:s tidigare helradshashar omfattade inte skolkopplingstabellen. `phase5-23-d-program-api-before-cleanup-fix.json` bevaras som tidigare grönt beteendeprov med ofullständigt cleanupbevis. Rättningen i a307d26 rensar endast den ägarskapskontrollerade syntetiska grafens kopplingar/paket och kräver noll rester. `phase5-23-d-cleanup-correction.json` bevisar 74 egna kvarlämnade kopplingar, inga levande kunder/utbildningar/skolor för de två prov-id:na, exakt originalhash när endast dessa 74 exkluderades före rättningen och samma 267 originalkopplingar efteråt. Verifieraren har också läst korrigeringsskriptets avgränsning/tidsfönster och transaktionskontroller. Första FAIL-rapporten bevaras; berörda äldre provverktygshashar betecknas historiska.

## Källbegränsningar, krav och mänskligt prov

`phase5-23-d-esthetic-search.json` dokumenterar en avgränsad sökning och **NOT_LOCATED_WITHIN_BOUNDED_SEARCH**. Ingen exakt Gy25-lista kunde beläggas inom den sökningen; detta bevisar inte att föreskrift saknas. Ingen ämneslista härleds från namn. Estetisk rättighet förblir därför **Att kontrollera**, enligt PLAN D:s uttryckliga fallback. Jämförbara/alternativa nivåer enligt 4 kap. 8 § och språkexportkoder är också fortsatt overifierade.

**ADMIN-02 och ADMIN-03 får delbevis och förblir Pending.** D kompletterar versionsbundna valpaket och regler för skolans utbud. E:s hela matris, fullplanshandbok och mänskligt prov återstår; yrkesram/regler i 05-17 och följande timplansplaner slutgodkänns inte här. Paketutbud är inget elevval eller individuellt studieplansbeslut. Beräknad Klar för beslut i B08 innebär inte att fastställande eller fulla nationella beslutsregler levererats.

Mänskligt prov enligt frontmatter är öppet på dator och telefon. Alla körbevis gäller lokala syntetiska uppgifter i skyddat isolerat mål. Ingen verklig kommunanslutning, mänsklig IdP-/uppdragsacceptans eller pilotdrift har godkänts genom dessa kontroller.

_Verifierare: Codex, gsd-verifier. Endast 05-23 steg D; faktisk slutlig runtime-, API- och browserregression granskad._
