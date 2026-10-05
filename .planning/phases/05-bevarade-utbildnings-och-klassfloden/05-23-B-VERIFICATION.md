---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: 05-23
step: B
verified: 2026-10-05T14:07:07Z
status: human_needed
score: 7/7 scoped automated must-haves verified
scope: local-synthetic-only
plan_complete: false
human_verification:
  - test: "Dela individuellt val i två block på 100 poäng, lägg till ett fördjupningsblock, fördela och läs om på dator och telefon."
    expected: "Blocken sparas med sina namn och poäng, IV summerar till 200 och fördjupningsblock räknas tillsammans med fasta nivåer. Hjälptext och kontroller går att läsa och använda. En fördelad ram måste tömmas och sparas före borttagning."
    why_human: "Automatiska verkliga Worker- och webbläsarprov samt bildgranskning ersätter inte användarens bedömning av begriplighet och arbetsflöde."
  - test: "Öppna en äldre fastställd eller ersatt plan märkt Ofullständig och skapa en ny version."
    expected: "Den äldre versionen behåller sin faktiska form. Det nya utkastet har svenska/SvA-rader och standardblock; tidigare val och tillämpliga terminsfördelningar följer med. Nya ofördelade rader framgår."
    why_human: "Användaren behöver bedöma om skillnaden mellan bevarad äldre version och kompletterat utkast är tydlig."
  - test: "Läs analysen när en högre nivå börjar tidigare än den lägre, respektive när nivåerna överlappar i samma termin."
    expected: "Tidigare start visas som fel och gemensam termin som risk med konkret termin och berörd nivå; åtgärden går att förstå."
    why_human: "Diagnosernas verksamhetsmässiga tydlighet behöver mänskligt användarprov."
---

# 05-23 steg B — oberoende målverifiering

**Status: human_needed.** Sju avgränsade automatiska sanningar för steg B är verifierade genom aktuell kod, faktisk SQL, byggd Worker och dator-/telefonprov. Ett verkligt mobilfynd och en historisk kloningslucka har rättats och återprovats. Mänsklig begriplighetsbedömning återstår. **Hela 05-23 är fortfarande in_progress; steg C–E och slutgodkännande av kraven ingår inte här.**

## Avgränsning och källkedja

Fas 5 ska bevara utbildnings- och klassflöden med verkliga mandat. Detta delprov gäller PLAN B: ändra planens block, uppgradera bundna legacyutkast med bevarade före-värden, bevara äldre fastställda/ersatta källor, klona dem till rätt form och analysera nivåordning per termin. Det omfattar inte skolornas paketval, valpaket, elevval eller steg C:s nya läsrätt för skoladministratör.

AGENTS, PROJECT, STATE, codebase-underlaget, PLAN/CONTEXT, före-inventeringen B, tidigare A-verifiering och berörd aktuell kod har lästs. Sanningarna nedan är härledda ur just B:s beteenden och acceptanskriterier. Inga SUMMARY-påståenden har använts som ersättning för implementation eller körbevis. Verifieraren har endast läst kod, rapporter och bilder och skrivit denna fil; inga egna databasändringar, servrar, commits eller pushar.

Källkedjan är `b6675af` → `50c830a` → `939e109` → `3223297` → `1978024` → `2b45237` → `6fadda4`. B:s grundimplementation följs av kontrollerade fixtur-/harnessrättningar, separat historisk kloningsrättning och rättning av mobilklippning. Slutlig produktkod och skyddad Worker är `2b452370d66c11277c9783cdee428c7f15925df7`. `6fadda4` ändrar endast utbildningsharness, inte Worker-/produktkällorna.

## Observerbara sanningar

| # | Sanning inom B | Status | Kontrollerat bevis |
|---|---|---|---|
| 1 | Bundna äldre utkast, även livscykellåsta, uppgraderas deterministiskt till v2. Befintliga val/fördelningar och andra fält bevaras, revision ökar en gång och före-värden loggas. Fastställda/ersatta versioner ändras inte. | VERIFIED | 152000 uppgraderar enbart bundna legacyutkast. Faktisk migrationpreservation PASS för 13 utkast: exakt förväntad helrad med basis/terminer/revision+1, inklusive bevarad updated_at. Stängd före-logg och aktiva guards; 210/210 SQL/TS-paritetsvektorer och separat rollbackbevis. |
| 2 | Rektor/huvudman kan spara och läsa om IV 2 × 100 och eget fördjupningsblock med stabila radnycklar, revision och atomiskt auditspår. | VERIFIED | Editor → blockroute → strikt kontrakt → SQL-kommando är genomkopplade. B-API provar faktisk sparning/omläsning och samtidiga CAS-anrop med en vinnare/en konflikt. Blockhistorik har serverns actor; DB-/Worker-audit paras och auditfel återställer verksamhetsändringen. |
| 3 | Felaktiga eller otillåtna blockändringar nekas utan delskrivning. | VERIFIED | SQL kontrollerar verklig session/kund/skolmandat, writable, utkast/v2 och CAS. Slotändring, IV över 200, fördelad borttagen ram, legacy, administrator, främmande mandat, pågående/arkiverad plan, MFA/CSRF/session samt direkta klient-/helperförsök provas. Borttaget ID kan inte återinföras som ny identitet. |
| 4 | Ny version kompletterar legacy men bevarar hela källan; kloning av en äldre förseglad version behåller även ett block-ID som en senare version har tagit bort. | VERIFIED | 152100 låser/validerar hela källunderlaget och fördelningen; INSERT får begränsad intern klonkontext som återställs även vid fel. Create tömmer kontexten. SQL 15/15 och verklig API-kedja v1 → v2 → borttagning → v3 från v1 kontrollerar identitet, andra blockändringar, oförändrade källrader/historik och auditrollback. B03 provar legacy → ny version med bevarade IV-poäng. |
| 5 | Analysen använder terminsstart och faktisk gemensam termin enligt D-13, och räknar v2-summa, IV och fördjupningsblock korrekt. | VERIFIED | Substantiell `programplanLevelOrderIssues` är anropad av analysen. Tidigare start ger `level-order-*`/fel, överlapp ger `level-overlap-*`/risk, glapp utan gemensam termin ger ingen ordningsissue. Alternativa svenskrader följer samma kontroll. Årsbaserad ordningsjämförelse/äldre `order-*` är borttagen. Legacy ger Ofullständig; IV ≠ 200 och total ≠ målram ger fel; egna fördjupningsblock räknas i ramen. |
| 6 | Den verkliga arbetsytan fungerar på dator/telefon med blockeditor, sparning/omläsning, Ofullständig/Ny version och korrekta instruktioner. | VERIFIED | B01–B03 6/6 PASS på slutbygget, program40 och terminer25 över särredovisade omgångar. Mobilklippning hittades i oberoende bildgranskning, mättes, rättades och återprovades. Nya B02 mäter varje input/button/hjälpparagraf mot synlig tabellbehållare. Efterbilder granskade. Handboken beskriver blockredigering, ramspärr, legacy och att skolpaket återstår. Mänsklig bedömning behövs. |
| 7 | B öppnar exakt en Worker-entrypoint efter rätt preflight; nya hjälpare/före-logg förblir stängda och gamla mandat-/datavägar bevaras. | VERIFIED | Före-inventering från aktuella pg_get_functiondef, samma signaturer/ACL för ersatta funktioner. Preflight 11/11 på 3223297 återställde ACL till exakt 16. Separat 153000 öppnade bara blockkommandot till exakt 17. Faktiska migrations-/grantbevis och klientförsök; gamla definitioner/ACL och verksamhetsrader bevarade utöver den uttryckliga utkastuppgraderingen. |

**Poäng: 7/7 avgränsade automatiska sanningar.** Detta är inte fullplansverifiering eller mänskligt godkännande.

## Artefakter och viktiga länkar

Samtliga nedanstående artefakter finns, har substantiv implementation och används i den faktiska kedjan.

| Artefakt | Substans och koppling |
|---|---|
| `web/app/protected-programplan-board.tsx`, `protected-programplan.css` | IV-/fördjupningseditor med osparat skydd, explicit spara/avbryt och spärr för fördelad borttagning/poängändring. Svar jämförs med plan-ID, revision och hela insända pin/val; okänt svar återläses och oklar status kräver omläsning. Mobilbredd rättad mot tabellbehållaren. |
| `web/app/api/programplaner/block/route.ts`, `web/lib/programplan-contract.ts`, `web/lib/server/programplan-planning.ts` | POST är mutating med MFA, required audit och HM/rektor. Strikt requestparser avvisar extra fält/otillåten form. Servern anropar parametriserat SQL och validerar svar, revision och block. |
| `20261004151000_phase5_programplan_block_commands.sql` | scope/writable/CAS, v2-skrivgräns, uppgraderingshjälpare, blockkommando, actorhistorik/DB-audit och retired-ID-kontroll. Hela terminsfördelningen valideras mot nya rader så att fördelad ram inte försvinner. |
| `20261004152000_phase5_programplan_shape_upgrade.sql` | Stängd före-logg, tabellås, deterministisk uppgradering av bundna utkast och revision+1. Bara inventerad touch-trigger stängs tillfälligt och återställs i transaktionen; övriga guards är aktiva och updated_at bevaras. Loggen har ingen FK som inför en ny utbildningsborttagningsspärr. |
| `20261004152100_phase5_programplan_block_clone_identity.sql` | Separat rättning av guard/clone/create med samma signatur och ACL. Äldre tillämpade migrationer är orörda. Klonkällans status, utbildning, huvudman, val, nästa version, hela uppgraderade basis och hela fördelningen kontrolleras. |
| `20261004153000_phase5_worker_programplan_blocks.sql`, applyverktyg | Endast blockkommandot öppnas. Verktyget kräver beroenden, rätt preflightkind och steg b, PASS/complete, rensning/bevarande, sourcehashar och återställd exakt ACL. |
| `programplan-choice-blocks.ts`, `programplan-terms.ts`, `programplan-table.ts`, `programplan-analysis.ts` | Deterministisk uppgradering/validering, stabila blockrader, förslag, fördjupningsram och terminsbaserad nivåordning. Både fasta och alternativa svenskrader omfattas. Yrkesmålramens kvarstående osäkerhet redovisas som Att kontrollera. |
| `protected-programplan-workspace.tsx`, `protected-programplan.ts` | Legacyhuvud och analys anger Ofullständig och nästa version. Bound clone förhandsvisas i den uppgraderade formen; gamla läsvyer behåller källformen. Kopiering till ny utbildning uppgraderar basis/terminer uttryckligen och behåller block-ID:n. Full ADMIN-03 godkänns inte av denna kodlänk. |
| SQL-/Node-prov, B-harness, browserfixtur/specifikationer och handbok | Genomkopplade kontroller av faktisk lagring, revision, sourcebevarande, felgränser, rollback, UI och rensning. Handboken är användarinstruktioner och utlovar inga ännu olevererade paketfunktioner. |

Nyckelkedjorna är granskade: editor → skyddad route → parser/server → faktisk SQL → actorhistorik/DB-audit → Worker-audit → parsad omläsning/tabell; legacy → deterministisk uppgradering → låst klonkälla → v2-utkast; terms → analys → konkret radåtgärd. Session/kund/skolor låses före utbildning/planer och mandat återkontrolleras efter låsväntan genom befintlig scope/actor, inte genom klientens rollval.

Ingen blockerande stub eller okopplad B-artefakt finns kvar. Befintliga `return null` för saknade åtgärder/tomma grupper, tom diagnoslista för legacy och input-placeholders är normal kontroll/rendering, inte ofärdig implementation.

## Körbevis och exakta begränsningar

Rapporterna finns i `work/pilot/results/`; råloggar, ursprungliga rapporter, relokaliserade browserbilagor och bilder finns i `web/test-results/phase5-23-b-final/`.

| Kontroll | Resultat och rapport |
|---|---|
| Modell/server/harness samt slutliga UI-kontroller | Node **609/609 PASS** på 939e109; berörda modell-/serverkällor är oförändrade efter detta. Typ/lint/skyddat bygge omkörda PASS på 2b45237; handbok PASS och texten därefter oförändrad. `phase5-23-b-static.json` särredovisar gamla sourceHashes och finalUiSourceHashes. Den gamla boardhashen är historik, de tre slutliga UI-hasharna matchar aktuell kod. |
| SQL i rollback | Grund B **897/897**, efter historisk kloningsrättning **912/912 PASS**; `phase5-23-b-sql-rollback.json`, `phase5-23-b-clone-identity-rollback.json`. |
| Uppgraderingsparitet och rollbackbevarande | **210/210 PASS**: alla 70 program/inriktningskombinationer × legacy tom, legacy med fasta/IV-terminer och v2. `phase5-23-b-upgrade-parity.json`, `upgrade-rollback.json`, `clone-preservation.json`. Rollbackuppgraderingen omfattar 14 utkast inklusive ett syntetiskt arkivlåst; faktisk tillämpning omfattar 13 befintliga utkast. Dessa antal är olika prov, inte motsägande leveransantal. |
| Faktiska migrationer/grant | **PASS**, `migration-preservation.json`, `clone-fix-preservation.json`, `grant-preservation.json`. 151000/152000/152100/153000 är tillämpade på protected. Exakta helrader/föreloggar, uppgraderingsavgränsning, timestamps och gamla ACL/övriga definitioner kontrolleras. |
| Full faktisk SQL | **2337/2338, FAIL**, `phase5-23-b-sql-all-identity-final.json`. Alla fas 5-filer PASS. Enda kvarstående fall är äldre `phase2_audit.test.sql` #13, förväntat `%serverkontext%`, faktiskt `History denied`. Full SQL är inte grön. Tidigare röda omgångar och råloggar bevaras. |
| B-Worker-preflight och slutligt B-API | **11/11 + 11/11 PASS**; `preflight.json` på 3223297 före grant med ACL återställd, `api.json` på 2b45237 efter mobilrättningen. De 25 slutliga sourcehasharna matchar aktuell kod. Faktisk CAS, sessions/MFA/CSRF, auditfel, retired-ID och båda kloningsformerna ingår. |
| Befintliga API-regressioner | **Programplan 48/48, terminer 31/31, livscykel 39/39, utbildning 43/43 PASS**, respektive `programplan-api.json`, `terms-api.json`, `lifecycle-api.json`, `education-api.json`. Complete/cleanup/originalBusinessPreserved PASS. Alla använder Worker 2b45237. Utbildningsharness är 6fadda4 med oförändrad produktkod. MainAPI:s revision är 6fadda4; sourceCommit b6675af avser senaste ändring i dess bevakade källmängd, vars 18 hashvärden matchar aktuell kod. Utbildningsrapportens 7 hashvärden matchar också. |
| Browser | **Block 6/6 på slutbygget; program 40/40, terminer 25/25 + ett avsiktligt desktop-skip, livscykel 20/20 över dokumenterade omgångar.** `phase5-23-b-browser.json` är PASS. Första program 38 PASS + 2 FAIL och terms 23 PASS + 2 FAIL + 1 skip bevaras, med separata 2/2 omprov för respektive rättat prov. 96 rensningsbilagor har noll egna kvarvarande verksamhetsrader; append-only-audit bevaras. Detta är samlad täckning, inte en ny full svit på en enda revision. |
| Mobilbild/geometri | **PASS**, `phase5-23-b-editor-visual.json`. Före: högerkant 405.75 mot clip 372. Efter: 359 mot 372. Slutliga B02 mäter samtliga inputs/buttons/p. Efterbilder på dator/telefon visar full hjälptext och kontroller; långt vanligt blocknamn radbryts. |
| Vanlig 3012 och bevarade användarscenarier | **PASS**, `phase5-23-b-preview.json`, `user-trial-before-swap.json`, `user-trial-after.json`. 3012 kör 2b45237, 44 äldre klientfiler behållna och privata filer uteslutna. 18 scenarier över 9 utbildningar/två roller och 44 auditläsningar per omgång; scenarier exakt lika och verksamhetsrader bevarade före/efter bytet. Ingen automatisk omladdning eller reset. Dessa är mintade syntetiska sessioner och ingen mänsklig bedömning. |

## Rättade fynd och bevarade röda bevis

- En verklig historisk kloningslucka uppstod när v2 hade retirerat ett block-ID och v1 därefter skulle klonas: den globala retired-ID-spärren nekade den bevarade källidentiteten. RED finns i `/private/tmp/phase5-23-b/clone-red.json`; separat 152100 rättar detta utan att skriva om tillämpade 151000/152000. GREEN 15/15 och faktisk Worker-kedja samt auditrollback stänger fyndet. Block-ID får fortfarande inte återinföras efter borttagning i ett utkast som en ny identitet.
- Första SQL-RED för det nya blockkommandot på steg A-schema gav 42883 och full rollback; `/private/tmp/phase5-23-b/red.json`. Detta är TDD-förebevis, inte en kvarvarande produktlucka.
- Första preflight/harnessröda bevis bevaras. Förväntningar på 403 för livscykellås rättades till befintlig kontrollerad 409; en fixtur skapade två gällande versioner och rättades att markera den gamla som ersatt. Dessa är fel i uppsättning/förväntning, inte bevis på försvagad behörighet eller produktfel. Nekande, oförändrade verksamhetsrader och audit kontrolleras fortfarande.
- Första programbrowser 04 använde single-element evaluate på flera add-rader efter blockeditorn; 1978024 mäter alla rader med evaluateAll. Terms 11 förväntade allt fördelat trots korrekt 2300/2500 med 200 kvar; provet kräver nu rätt besked och exakt oförändrad lagrad fördelning. Separata 2/2 green bevarar dessa beteendekontroller. Ett omprov mot fel port 3056 bevaras i setup-fail-logg och räknas inte som produktprov; korrekt 3059 passerar.
- Den oberoende bildgranskningen hittade verklig klippning av blockeditorns mobilhjälptext/input-/knappkant. Samordnaren bekräftade geometri och rättade containerbredd i 2b45237. Före/efterbilder, RED/GREEN-geometri och slutlig B02 finns kvar; detta är ett rättat produktfynd.
- Utbildningsregressionens första 43-fallsomgång var FAIL men städning/bevarande PASS. 6fadda4 rättar exakt skol-ID-mängd, VO:s egna v2-standardblock och redan införd startdatumskod. Slutligt 43/43 PASS. Den första rapporten `phase5-23-b-education-api-first.json` finns kvar och förväntningarna på mandat, delskrivning och audit har inte försvagats.

Inga kvarstående blockerande kod-/genomkopplingsfynd inom B har identifierats. Det äldre fas 2-auditfallet är fortsatt öppet. Även 05-22:s historiska PARTIAL-avvikelse för fyra timplans updated_at är öppen; B:s nuvarande bevarandehashar reparerar eller retroaktivt godkänner inte den historiken.

## Krav och mänskligt prov

**ADMIN-02 och ADMIN-03 får delbevis och förblir Pending.** B bevisar planblock, v2-uppgradering, analys, sourcebevarande och klonings-/kopieringsgrund genom befintliga skyddade mandatvägar. Fullständiga beslutsregler, full kullkopiering och användarens begriplighetsbedömning har inte slutgodkänts. ADMIN-04/klasskoppling och full fas 5 får ingen ny slutstatus av denna verifiering.

Mänskligt prov enligt frontmatter återstår på dator och telefon: blockarbetet, skillnaden mellan Ofullständig och nytt utkast samt diagnosernas åtgärder. Arbetsytans Klar för beslut är den levererade plananalysens beräknade status; rapporten godkänner inte kommande paket-/nationella beslutsregler eller fastställandefunktioner.

Steg C–E äger skolpaket, paketval/-revisioner, nya rollflöden och fullplansregression. Yrkesprogrammens målram/regler kräver 05-17. Dessa är återstående leverans, inte stängda krav genom B. Syntetiska integrationsprov, bildgranskning och lokal installation innebär ingen godkänd verklig kommunanslutning eller pilotdrift.

_Verifierare: Codex, gsd-verifier. Endast 05-23 steg B, 2026-10-05._
