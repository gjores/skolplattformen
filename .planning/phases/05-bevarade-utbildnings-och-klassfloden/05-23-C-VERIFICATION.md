---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: 05-23
step: C
verified: 2026-10-05T18:03:11Z
status: human_needed
score: 7/7 scoped automated must-haves verified
scope: local-synthetic-only
plan_complete: false
human_verification:
  - test: "Välj språkpaket för den egna skolan, ändra de sex språkförslagen och fördela nivåerna på dator och telefon."
    expected: "Val och terminsfördelning sparas och kan läsas om. Förslag blir sparade val genom aktivt val. Kontroller och analysens åtgärder är begripliga även på telefon."
    why_human: "Faktiska Worker- och browserprov samt bildgranskning ersätter inte användarens bedömning av arbetsflödets tydlighet."
  - test: "Öppna en plan med olika paket på två skolor som huvudman, rektor och skoladministratör. Prova även en fastställd eller ersatt version."
    expected: "Varje skolas egna paket framgår; rektor och administratör ändrar endast inom sitt verkliga skolmandat. Administratören kan hantera skolpaket i en fastställd/ersatt plan men saknar planredigering och Ny programplan. Arkiverad utbildning är låst."
    why_human: "Verksamhetens förståelse av skolval, roller och planstatus behöver mänskligt prov."
  - test: "Kopiera en plan till en senare elevkull med olika språkpaket på två skolor och granska analysens åtgärd för fel nivåordning."
    expected: "Paket och terminsfördelningar följer med till rätt skolor utan ändring av källan. Åtgärden öppnar rätt skolpaket och synligt terminsfält; eventuellt kopieringsfel anger berörd skola."
    why_human: "Automatisk jämförelse bevisar databevarande men inte att arbetsflöde och besked är tydliga för användaren."
---

# 05-23 steg C — oberoende målverifiering

**Status: human_needed.** Sju avgränsade automatiska sanningar för skolornas språkpaket är verifierade genom aktuell kod, faktisk SQL, byggd skyddad Worker och prov på dator/telefon. Rättade produktfynd och tidigare röda prov särredovisas. Mänsklig begriplighetsbedömning återstår. **Hela 05-23 är fortfarande in_progress: D/E och slutgodkännande av kraven ingår inte i denna verifiering.**

## Avgränsning och källkedja

Fas 5 ska bevara utbildnings- och klassflöden med verkliga mandat. Detta delprov gäller PLAN C: skolbundna språkpaket med egen revision, språk-/nivåtrappor, konkreta analysåtgärder, skoladministratörens läsning/paketval samt kloning och kopiering. Generella versionsbundna valpaket, full IV-/HU-/NA-regeluppsättning och fullplansverifiering tillhör D/E. Yrkesprogrammens målram/regler ligger fortsatt i 05-17.

AGENTS, PROJECT, STATE, codebase-underlag, PLAN/CONTEXT, C:s funktionsinventering, tidigare A/B-verifiering samt berörd aktuell kod har lästs. Sanningarna är härledda ur C:s mål och acceptansbeteenden. SUMMARY och annan agents review har inte ersatt läsning av implementation och faktiska körbevis. Verifieraren har endast läst kod/rapporter/bilder och skrivit denna fil, utan produktändringar, migrationskörning, serverbyte, commit eller push.

Slutlig produktkod är **8c719eedd4ce5cff8978fd1307e4cb065b9c1bd4**. Slutligt bygge och vanlig 3012 kör **9790c540059a22b9bb01c55090123b5634294319**, som enbart rättar lifecycleprovets äldre förväntning på skolpaket. App/lib/migrationer/handbok är byteidentiska mellan dessa revisioner. Historisk preflight **b16687e** var grön när grant tillämpades. Dess fem numera ändrade källhashar beskriver senare UI-/harnessrättningar och används inte som bevis för slutbygget. Slutligt C-API och B-regression har vardera 46 hashvärden som matchar aktuell kod; övriga API-rapporters produktkällhashar matchar också. Äldre lifecycle-API:s hash för just lifecycle-spec är historisk efter testrättningen; den används inte som bevis för det riktade slutprovet.

## Observerbara sanningar

| # | Sanning inom C | Status | Kontrollerat bevis |
|---|---|---|---|
| 1 | Skolan kan välja språk och rätt sammanhängande nivåtrappa för en språkram på 100/200/300 poäng; ogiltiga nivåer, språk och poäng avvisas. Exportstatus är uttryckligen overifierad. | VERIFIED | 42 språk och 18 trappor är identiska i SQL/TypeScript. 534/534 paritetsvektorer omfattar tillåtna starter, glapp, fel språk/version/poäng och distribution. Förslag är franska/spanska/tyska × nybörjare/fortsättning; antal nivåer följer ramen. B04 och B10 använder riktiga sparade paket. |
| 2 | HM, rektor och administratör kan spara/läsa egna skolpaket med oberoende CAS; andra skolor eller skolor utanför utbildningen kan inte ändras. Planens helrad bevaras. | VERIFIED | UI → paketroute → strikt kontrakt → serveradapter → SQL är kopplade. C-API provar tre roller, omläsning, två samtidiga CAS-anrop med en vinnare/en konflikt och nekade skolor. SQL låser verklig session/kund/utbildning/skolkoppling samt skolrevision. Paketändring skriver inte planrevision/planrad. DB- och Worker-audit paras; båda auditfel återställer ändringen. |
| 3 | Administratören kan använda planens språkpaket och nödvändiga läsvägar men inte skapa/ändra plan. Paketval fungerar i fastställd/ersatt plan och låses vid arkivering. | VERIFIED | Verkliga list-/val-/underlags-/plan-/termins-/paketläsrutter tillåter administrator med servermandat; planmutationsrutter gör det inte. C-API omfattar admin list/val med canCreate=false och planwrite-denial. B07 provar faktisk adminnavigation, saknad Ny programplan/planedit och paketwrite i fastställd plan på dator/telefon. Sealed/replaced/archived provas separat i API. |
| 4 | Analysen gäller rätt skola och paket, jämför paketnivåer med ramen och ger konkreta åtgärder för terminsordning och överlapp. | VERIFIED | `analyseProgramplanPackages` anropas av huvudanalysen med sparade skolpaket och skolnamn. Issues bär unitId/blockId/entryKey/levelKey. Saknat val/ramavvikelse/tidig högre nivå ger fel, samma termin risk, få paket risk, saknade språkspår och exportstatus kontroll/info. B05 har faktisk ramavvikelse samt Åk 1 före Åk 3 och provar åtgärdens fokus på synligt fält på båda skärmar. |
| 5 | Paketeditorn sparar terminsändringar, behåller sista köade värde och skyddar osparade val vid filter, ommontering, strukturändring och kopiering. Dator/telefon har användbara kontroller. | VERIFIED | Sparning på blur med per-school CAS; okänt svar återläses innan bekräftelse/ny write. Monoton sammanslagning av skolrevisioner avvisar motsägande svar. Dirty-scope stoppar struktur/kopiering och håller paketet monterat under filter. C11/C12 provar verklig ommontering, invalid 101 + filter, köad ändring och servercommit med ogiltigt svar utan andra write. B10 mäter kontroller mot telefonens tabellram och provar teckenspråk → moderna språk med bevarad italienska. |
| 6 | Ny version och kopiering till senare utbildning bevarar varje skolas egna val/fördelning och hela källan; kopian börjar med revision 1. | VERIFIED | SQL-clone kopierar samtliga skolpaket och redovisar copiedPackageUnits. Worker-API provar kloning och auditrollback. C13 provar faktisk UI-kopiering med två skolor med olika språk, exakta refs/distributions/revision 1 samt oförändrad källplan och källpaket. Workspace validerar exakt källskolmängd, länkar målets skolor först och namnger berörd skola vid paketskrivfel. |
| 7 | C öppnar endast två nya Worker-entrypoints efter godkänd preflight; tabell/hjälpare/klientvägar förblir stängda och befintliga data/ACL bevaras. | VERIFIED | Före-inventering och faktisk pg_get_functiondef visar sex avgränsat ersatta och nio nya funktioner. Foundation bevarar tidigare 17 entrypoints; separat grant ger exakt 19. Ny tabell har RLS, noll klientgrants och explicit plan–utbildning–skolkoppling. Direkt klient/helperaccess nekas. Rollbackbevis bevarar tio helradstabeller, gamla ACL och återställer alla definitioner. Faktisk migration/grant har exakta SQL-SHA utan reset. Vanlig 3012 visar samma elva helradstabeller före/efter slutbygget och bevarar 18 befintliga scenarier; C-API 16/16 PASS på den servern. |

**Poäng: 7/7 avgränsade automatiska sanningar.** Detta är inte fullplansverifiering, slutgodkännande av krav eller mänskligt godkännande.

## Artefakter och viktiga länkar

Samtliga nedanstående artefakter finns, har substantiell implementation och används i den faktiska kedjan.

| Artefakt | Substans och koppling |
|---|---|
| `web/lib/programplan-languages.ts`, `programplan-packages.ts` | Slutna språk/trappor, exportVerified=false, strikta parsers inklusive okända fält/prototyper/sparse arrays, fasta katalogversioner, exakta nivå-/blockpoäng, förslag, ramfördelning och monoton sammanslagning. Generisk package-ref avvisas tills D. |
| `web/app/protected-programplan-packages.tsx` | Verklig paketeditor med skolval, mandat/status, tillägg/borttagning/fördelning, CAS/autospar/återläsning/kö och osparat register. Detta är den genomkopplade motsvarigheten till PLAN:s tänkta filnamn `protected-programplan-block.tsx`. |
| `protected-programplan-board.tsx`, `protected-programplan-workspace.tsx` | Utfällbara block; sparade skolpaket räknas i sammanfattning/analys. Åtgärd öppnar rätt skola/block/nivå och rätt telefonår. Paketdirty skyddar struktur/ny version/kopiering; read-back och skolmängd kontrolleras. Administratörens planfunktioner hålls stängda. |
| `protected-home.tsx`, `protected-programplan-list.tsx`, mandatpolicy | Faktisk administratörsnavigation, planlista/utbildningsalias och rollriktig text. Ny programplan saknas när canEditPlans=false. |
| `/api/programplaner/paketval`, `/paketval/lasa`, planens läsrutter | Mutating paketwrite kräver MFA/CSRF/required audit. Read är same-origin med required audit. HM/R/admin kontrolleras i servervägar, inte genom klientens rollval. |
| `web/lib/server/programplan-packages.ts`, `programplan-analysis.ts` | Parametriserad SQL, exakt reply-identitet/revision+1/val, atomisk audit; integrerad analys med skolbundna issues och paketaction. |
| `supabase/migrations/20261004154000_phase5_programplan_unit_packages.sql` | Ny skolpakettabell, plan/offering/unit-guard, skol-CAS, validering, läs/write, audit, block-/skolborttagningsspärr, clone och verkligt administratörsmandat. Helpers är stängda. SHA256 `443a8e4a3f56872491cb13b29cad88e12765d47dac71f536bbcf8cd299483541`. |
| `20261004155000_phase5_worker_programplan_unit_packages.sql`, apply-verktyg | Endast read/write-RPC öppnas efter rätt C-preflightkind/step/status/cleanup/bevarande/hashkedja. SHA256 `fb873b7f1041dd8c2598c7c135a36f19da9b12b1256837289b33dc610d5a19f2`. |
| `web/e2e/phase5-packages.spec.ts`, API-/SQL-/paritetsprov | Separat språkpaket-browserfil är motsvarigheten till PLAN:s avsedda utökning av blocks-spec. Åtta cases × dator/telefon, faktiska byggda Worker-prov och riktig SQL. |
| `docs/handbok/programplaner.md:107` | Granskad användartext om skolornas språkpaket/roller, sex förslag, autospar/konflikt, planstatus, lokal exportbegränsning och kopiering. D:s generella valpaket beskrivs som återstående. Dokumentationsbygge PASS. |

Ingen blockerande stub, TODO eller okopplad C-artefakt har identifierats. Avsiktliga tomma analyser för saknade underlag, guards för otillåtna åtgärder och dolda kontroller är genomförda begränsningar. Teckenspråk kräver ingen språkkod; minoritetsspråk har fast kod. Katalogens språkidentiteter har inte verifierats för Skolverkets/UHR:s externa exportformat.

## Körbevis och exakta begränsningar

Minimala rapporter ligger i `work/pilot/results/phase5-23-c-*.json`; råloggar/rapporter och browserbilagor i `web/test-results/phase5-23-c-final/`. Bevis med sourceHashes/rawSha256 har jämförts med faktiska filer. Historiska rapporter behåller sin ursprungliga status.

| Kontroll | Resultat och rapport |
|---|---|
| Modell/server/harness, typ/lint/byggen | **Node 629/629 och harness 5/5 PASS** på produktrevision 8c719ee. **TypeScript/oxlint/handboksbygge PASS**, skyddat Worker-slutbygge **9790c54 PASS**; `checks.json` och råloggar. App/lib är byteidentiska med modelltestade 8c719ee; 9790c54 ändrar endast lifecycle-spec. |
| SQL i rollback | **C 74/74, samlad programplan 986/986, timplan 86/86 PASS**; green.json, green-all.json, green-timplan.json. Ingen verksamhetsreset. |
| SQL/TS-paritet | **534/534 PASS**, `parity.json`; språk-/trappinventering och både positiva/negativa regelvektorer. Raw-SHA och migrations-SHA matchar. |
| Foundationbevarande | **PASS**, `preservation.json`: tio fullständiga verksamhetstabeller oförändrade, gamla ACL oförändrade, sex ersatta/nio nya definitioner och exakt återställda rader/definitioner/ACL efter rollback. Före grant är Worker-count 17. |
| Faktiska migrationer/grant | **PASS**, `migrations.json`: protected, ingen reset/journal-only, exakta två SQL-SHA, preflight vid b16687e och exakt 19 entrypoints efter grant. Bara `phase5_read_programplan_unit_packages` och `phase5_write_programplan_unit_packages` tillkommer. |
| Full faktisk SQL | **2411/2412, FAIL**; `sql-all.json`/rålogg. Alla fas 5-filer PASS. Enda öppna fall är äldre `phase2_audit.test.sql` #13: förväntat `%serverkontext%`, faktiskt `History denied`. Full SQL är inte grön. |
| C-preflight före grant | **16/16 PASS** vid b16687e; `preflight.json`, complete/cleanup/originalBusinessPreserved/ACL restoration PASS. Första cb8cc63-rapporten är **FAIL 15/16** och bevaras som sådan. Slutbygget bevisas separat. |
| Slutligt C-API och B-regression | **16/16 + 11/11 PASS** på 8c719ee; `api.json`, `blocks-regression.json`, complete/cleanup/business preservation PASS. Vardera 46 aktuella sourceHashes matchar. B:s äldre checknamn om 17 entrypoints är historisk text; faktisk C-inventering bevisar 19. |
| Befintliga API-regressioner | **Program 48/48, terminer 31/31, livscykel 39/39, utbildning 43/43 PASS** på byggd Worker 8c719ee; respektive `program-api`, `terms-api`, `lifecycle-api`, `education-api`. Complete/cleanup/bevarande PASS och produktkällhashar aktuella. Lifecycle-specs äldre hash särredovisas ovan. Program-API:s äldre sourceCommit 6da94c0 avser bevakad källmängds senaste ändring, inte Worker-revisionen. |
| Paketbrowser | **16/16 PASS** på 8c719ee; faktisk full omgång B04/B05/B06/B07/B10/C11/C12/C13 × dator/telefon. Första 10/16 och andra 15/16 bevaras med loggar/felbilagor. `browser.json` rå-SHA matchar varje omgång. Paketomgången kördes på 8c719ee; rapportens slutliga Worker9790c54 har samma produktkod. |
| Browserregression | **Block 6/6, program 40/40, terminer 25/25 + ett avsiktligt desktop-skip samt livscykel 20/20 över bas 18 PASS + riktat 2/2 PASS**; `browser.json`. Bas på 8c719ee och riktat lifecycleprov på 9790c54. Detta är särredovisad samlad täckning, ingen ny full lifecycleomgång. 142 städningsbilagor: noll egna verksamhetsrader kvar, append-only-audit bevarad. |
| Telefonbilder/geometri | B04 dator/telefon och B10 telefon granskade oberoende, inklusive slutlig B10-bild; inga klippta kontroller identifierade. B10 mäter varje relevant input/select/button mot synlig ram. Synlig fokus och årsväxling provas av B05. Bildgranskningen är ingen mänsklig verksamhetsacceptans. |
| Vanlig 3012 och bevarade användarscenarier | **PASS**, `runtime.json`, `runtime-api.json` och raw runtime-before/after. Faktisk workerd/skolplattform_worker på 3012 kör 9790c54; C-API **16/16** med complete/cleanup/ACL/bevarande PASS och **46/46 aktuella källhashar**. Två roller × nio befintliga utbildningsscenarier, 44 auditläsningar per omgång; alla 18 scenarier och elva helradstabeller exakt lika före/efter. Runtime jämför med samma DB-sortering inom båda omgångarna; API använder COLLATE C inom sitt eget before/final. Råhashar med olika sortering jämförs inte med varandra. Äldre klientfiler bevarade, privata filer inte kopierade, ingen reset/automatisk omladdning. Lokalt mintade syntetiska sessioner, inte mänsklig IdP-/acceptansbedömning. |

## Rättade fynd och bevarade röda bevis

- Första montering med redan laddade paket kunde lämna editorn tom eftersom referensbasen var sparad medan värdena började tomma. `9a4f255` initierar värden och bas från samma underlag. C11 gör faktisk planedit/remount och jämför paketet efteråt.
- Visa bara ofördelade kunde avmontera ett fördelat paket och tappa lokal ogiltig ändring. `ae37dfe` håller paketblock kvar när dirty. C11 provar osparade 101 poäng + filter och bevarat värde.
- Ny version/kopiering saknade skydd mot osparade paket. `b16687e` spärrar start och submission med samma paketdirty-register. Strukturändringar är också spärrade, och C11 provar det.
- Första adminbrowser visade ett verkligt behörighets-/navigationfel: listan tillät administrator men `/val` nekade, vilket rensade sessionen. Läsrutten rättades; admin list/val med canCreate=false och B07 på båda skärmar är gröna. Ny programplan och planedit är dolda; listans texter beskriver nu rollens faktiska möjligheter.
- Språkväljarens wrapping label gav inte provets exakta tillgänglighetsnamn. Explicit aria-label rättades. Teckenspråk visade tidigare föregående språk som en avstängd väljare; den är nu dold och B10 bevisar återgång till modern italienska.
- B05:s första fixtur låg inom ramen trots påstående om ramavvikelse; fixturen rättades till verklig avvikelse utan sänkt acceptans. Därefter hittades ett verkligt mobilfokusfel: det gamla årets dolda fält kunde fokuseras före årsväxlingen. `8c719ee` binder fokus till synligt valt år och markerar hanterat först efter lyckat fokus. Slutlig full omgång 16/16 passerar.
- Första C-preflight hade ett harnessfel i tillåtna parade auditnycklar vid skolkopiering, medan det faktiska HTTP-anropet gav 200 och övriga 15 fall passerade. Korrigerad harness fick 16/16. Första FAIL-rapporten/loggen bevaras; dubblerade CLI-delar rättades och tidigare körloggar finns kvar.
- Lifecyclebasen fick 18/20: L07 förväntade inga analyslänkar trots beslutad egen skolpaketrätt i delad plan. `9790c54` tillåter bara Visa paket och fortsätter kräva noll andra åtgärder, planinputs och strukturknappar. Riktat dator-/telefonprov 2/2 PASS; första 18/20 bevaras. Ett mellanprov stoppades av bygg-/källrevisionens grind före produktkörning och bevaras i lifecycle-build-gate.
- `phase5-23-c-review.json` är en tidigare kodgranskning med status **PASS_CODE_REVIEW_ACTUAL_VERIFICATION_PENDING** och gamla källhashar. Den är historiskt förarbete; denna färska oberoende verifiering och slutliga körbevis ersätter inte dess historiska status.

Inga kvarstående blockerande kod-/genomkopplingsfynd inom C har identifierats. Det äldre fas 2-auditfallet förblir öppet. **05-22:s historiska PARTIAL för fyra timplans updated_at förblir också öppet**; aktuella bevarandehashar reparerar eller retroaktivt godkänner inte den historiken.

## Krav och mänskligt prov

**ADMIN-02 och ADMIN-03 får delbevis och förblir Pending.** C bevisar språkpaket inom verkliga skolmandat, paketrevision/audit, skoladministratörens begränsade läs-/valflöde samt klonings-/kullkopieringsdata. Fullständiga beslut-/paketregler och verksamhetens godkännande återstår i D/E. ADMIN-04 och full fas 5 får ingen ny slutstatus här. Arbetsytans beräknade Klar för beslut innebär inte att kommande paket-/beslutsregler har slutgodkänts eller att fastställande finns i appen.

Mänskligt prov enligt frontmatter återstår på dator och telefon. Steg D/E, 05-17:s yrkesram/regler och därefter 05-25 är fortsatt planerad leverans. Syntetisk integration, bildgranskning, local protected-installation och automatiska användarscenarier innebär ingen godkänd verklig kommunanslutning eller pilotdrift.

_Verifierare: Codex, gsd-verifier. Endast 05-23 steg C, 2026-10-05._
