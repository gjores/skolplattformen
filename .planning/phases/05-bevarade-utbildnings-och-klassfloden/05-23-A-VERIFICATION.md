---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: 05-23
step: A
verified: 2026-10-05T12:31:03Z
status: human_needed
score: 5/5 scoped automated must-haves verified
scope: local-synthetic-only
plan_complete: false
human_verification:
  - test: "Skapa en ny SA25-plan, lägg till hela programfördjupningen, fördela och läs om på dator och telefon."
    expected: "Tre svenska/SvA-rader, moderna språk och individuellt val syns; full fördelning är 2 500 av 2 500 poäng och består efter omläsning."
    why_human: "Automatiska verkliga Worker-/browserprov och bildgranskning ersätter inte användarens bedömning av begriplighet och arbetsflöde."
  - test: "Öppna och förhandsvisa kopiering/ändring av en befintlig legacy-plan."
    expected: "Befintliga rader och fördelningar bevaras. Förhandsvyn följer källans form; befintliga planer har ännu inte uppgraderats till blockformen."
    why_human: "Skillnaden mellan nytt underlag och befintlig plan behöver vara begriplig för användaren."
---

# 05-23 steg A — oberoende verifiering

**Status: human_needed.** Steg A:s fem avgränsade automatiska sanningar är verifierade med kod, faktisk SQL, byggd Worker och dator-/telefonprov. Hela 05-23 är fortfarande öppen. Steg B–E har inte verifierats eller genomförandegodkänts här.

## Avgränsning och mål

Fas 5 ska bevara utbildnings- och klassflöden med rätt mandat efter identitetsbytet. Detta delprov gäller endast PLAN A: nivåvisa svenska/SvA-alternativ, valbara blockramar och full poängsumma i nya v2-programplaner. SA25 med hela programfördjupningen ska kunna sparas och läsas om med 2 500 poäng.

PLAN, CONTEXT, SQL-funktionsinventeringen och faktisk implementation har lästs. Granskningen utgår från beteendet och genomkopplingen; SUMMARY-utsagor har inte använts som ersättning för körbevis. Verifieraren har inte muterat databasen, startat servrar eller gjort commits. Rapporten skrivs på samordnarens uppdrag.

Källkedjan är `ef365fc` → `84ba403` → `b819a50c0116194e52fdf089ee7f7d134640da2c`. Första ändringen levererar A, den andra rättar legacy-förhandsvyn och den tredje rättar SQL:s hantering av numeriskt likvärdiga JSON-tal. Senaste skyddade bygge, A-API och B01 använder `b819a50`.

## Observerbara sanningar

| # | Sanning inom A | Resultat | Kontrollerat underlag |
|---|---|---|---|
| 1 | Alla 29 program och samtliga 70 inriktningskombinationer får tre svenska/SvA-alternativrader à 100 poäng, exakt nationella slotblock och v2-IV utan legacy-meta-raden. | VERIFIED | Substantiell TS/SQL-generering, katalogloopar i båda språk; riktad faktisk SQL 326/326. SA25:s tre inriktningar summerar till 2 500 med full programfördjupning. |
| 2 | Femnycklig legacy och sexnycklig v2 godtas strikt; felaktiga block ger kontrollerade diagnoser och TS/SQL ger samma ordnade rader. | VERIFIED | Parserns egna fält/array-/prototyp-/accessorskydd; slot-, id-, poäng- och typkontroller; 142/142 rollback-paritetsvektorer samt nio riktiga A-harnessvektorer. Separat rå-JSON-rättning och 14 numeriska fall stänger decimaltextfelet. |
| 3 | Ny create/bind använder v2, och en behörig huvudman kan skapa, fördela och spara 2 500 poäng, som rektor kan läsa tillbaka med revision och audit. | VERIFIED | `newProgramplanBasis`, flow och arbetsytans create/bind är kopplade till parsade standardblock. A-API:s tre fall passerar genom byggd Worker och faktisk SQL; sparad revision och parade auditspår kontrolleras. |
| 4 | Den riktiga tavlan visar alternativen och blockramarna på dator/telefon; legacy ändras inte genom förhandsvisning, ändring eller kopiering. | VERIFIED | B01 2/2 efter sluträttningen; programplansregression 40/40 och terminsregression 25 passerade + ett avsiktligt desktop-skip. Förhandsvyn får uttryckligen kommandots pin/form. Bilder granskade för läsbara namn, blocketiketter, totalsumma och sparstatus. |
| 5 | A utökar befintligt SQL-kontrakt utan nya Worker-/klientgrants eller verksamhetsändring; aktuella funktioners övriga beteende och mandatvägar bevaras. | VERIFIED | Inventering från aktuella `pg_get_functiondef`; samma tre ersatta signaturer; exakt 16 Worker-entrypoints; tre nya stängda hjälpare. Två faktiska tillämpningsrapporter visar identiska hela rader i nio verksamhetstabeller, tidigare ACL och övriga definitioner bevarade, separata journalposter. |

**Poäng: 5/5 avgränsade automatiska sanningar.** Mänsklig användarbedömning återstår.

## Artefakter och genomkoppling

| Artefakter | Substans och koppling |
|---|---|
| `web/lib/programplan-choice-blocks.ts`, `programplan-catalog.ts`, `programplan-contract.ts` | Strikt v2-parser, standardblock från fast katalog, blockdiagnoser och legacy/v2-resolver. Används i faktisk server-/klientparsning. |
| `web/lib/programplan-terms.ts`, `programplan-terms-contract.ts` | Stabila alternative-/blocknycklar, rätt del/poäng, nivåpositioner, sex terminer och fördelningskontroll. Högskoleförberedande v2 visar hela målramen även innan fördjupning lagts till; legacy och yrkesprogram behåller tidigare målhantering. |
| `web/lib/protected-programplan.ts`, `web/app/protected-programplan-flow.tsx`, `protected-programplan-workspace.tsx` | Nya create/bind-pins har standardblock. Bound legacy clone/replace behåller sin befintliga form. Svar jämförs mot fryst pin; v2-block kan inte försvinna eller bytas i ett godtaget svar. |
| `web/app/protected-programplan-board.tsx` | Faktiska sparade rader respektive explicit osparad form visas i samma tavla. Lösta alternativ/slotar tas bort ur olösta ämnesupplysningar. |
| Migrationerna `20261004150000_phase5_programplan_choice_blocks.sql` och `20261004150100_phase5_programplan_block_numeric.sql` | Resolver/termrader/underlagsvalidator har samma signaturer. Rättningsmigrationen ändrar endast IV-summering av redan validerade heltalsvärden; den tillämpade 150000-källan är orörd. Ingen backfill eller ny grant. |
| SQL-/Node-prov, `verify-programplan-blocks-api.mjs`, B01 och browserfixturen | Kontrollerar riktiga radlistor, felindata, faktisk sparning/omläsning, audit och rensning. Steg B–D i A-harness vägras uttryckligen tills de implementerats. |
| `apply-programplan-migration.mjs`, dess målskyddsprov och handboken | A kräver sex tidigare journalberoenden och exakt 16 entrypoints. 150100 kräver 150000. Grants, andra filvägar/senare steg och journalrättning för A vägras. Handboken beskriver nya rader samt att skolpaket och befintlig uppgradering återstår. |

Begränsade ändringar i arbetsytan, `protected-programplan.test.mjs`, migrationsverktygets prov och handboken utöver PLAN A:s fillista behövs för faktisk genomkoppling och korrekt användarinstruktion. De utvidgar inte leveransen till B–E.

Viktiga länkar är granskade: flow/create/bind → strikt basisparser → befintligt Worker-kommando → SQL-underlagsvalidator/resolver; termintavla → terminskontrakt → Worker → samma SQL-radgenerator; omläsning → parsad plan/fryst pin → samma tavla. Mandat, MFA, revision och DB-/Worker-audit går genom befintliga servervägar, inte klientens rollval.

## Körbevis och källor

| Kontroll | Resultat och källa |
|---|---|
| Slutlig Node-svit | **593/593 PASS**, `web/test-results/phase5-23-a-final/phase5-23-a-node-correction.log`. Tidigare 585/592-omgångar är separat historik. |
| Typkontroll, lint, skyddat bygge, handbok | PASS. Slutligt skyddat bygge märkt `b819a50` i `phase5-23-a-build-correction.log`; typ-/lintslutloggar och Docusaurus-logg finns i samma resultatkatalog. |
| Faktisk riktad SQL | **326/326 PASS**, `work/pilot/results/phase5-23-a-sql-correction.json` och rå `phase5-23-a-sql-correction.log`. |
| Full faktisk SQL | **2289/2290, FAIL**, `phase5-23-a-sql-all-correction.json` och rålogg. Enda fallerade provet är äldre `phase2_audit.test.sql` #13, ”händelse utan serverkontext nekas”. Detta är inte full SQL-grönt och felet lämnas öppet. |
| Ursprunglig katalogparitet | **142/142 PASS** i rollback, `phase5-23-a-parity.json`: 70 kombinationer × legacy/v2 plus två prototypnamn. Diagnoser och olösta val omfattas också. |
| Numerisk RED/GREEN | Före rättning: **323/326**, tre rå-JSON-fall ger `22P02`. Efter rättning: **326/326 PASS**, 14 giltiga/ogiltiga numeriska stavningsfall och målskydd 8/8; `phase5-23-a-numeric.json`. |
| A-API på senaste Worker | **3/3 PASS**, nio paritetsvektorer, source/build `b819a50`; `phase5-23-a-api-correction.json`. Exakt 16 entrypoints, helperstängning, parat audit, rensning och oförändrade ursprungshashar är kontrollerade. |
| Termins-API-regression | **31/31 PASS**, source/build `84ba403`, `phase5-23-a-terms-api.json`. Inkluderar mandat-/sessionsgränser, MFA, samtidighetskonflikt, auditfel, legacy-clone och oförändrad källa. |
| Obligatoriskt B01 | **2/2 PASS**, dator och iPhone 13 på slutligt `b819a50`. `phase5-23-a-browser.json` har separat `correctionB01`; rårapport/bilder finns i `blocks-correction/`. Inget B01-fall har hoppats. |
| Samlad UI-regression före SQL-rättningen | **67 passerade + ett avsiktligt hoppat**: B01 2, program 40, terminer 25. `phase5-23-a-browser.json`, rårapporter med källhash och omlokaliserade bilagevägar. 68/68 rensningsbilagor PASS. Skip gäller telefonlayoutprovet i desktop-projektet; telefonfallet passerar. |

Produktens `web/app`, `web/lib` och B01-källor är oförändrade mellan `84ba403` och `b819a50`; enda ändringen under dessa sökvägar är migrationsverktygets Node-test. Den äldre fulla UI-/termins-API-regressionen och senaste A-API/B01 är därför redovisade med sina respektive källrevisioner, utan påstående om en ny full UI-omgång efter SQL-rättningen. Rårapporters ursprungliga innehåll och separata bilagerelokalisering framgår av `report-paths.json`.

## Bevarande, rättade fynd och öppna avvikelser

- Legacy-förhandsvyn genererade först v2-rader trots att clone/replace bevarade legacy-pin. Fyndet rättades i `84ba403`: förhandsvisningen följer nu uttryckligen pinens `choiceBlocks`. Ett prov jämför hela legacy-radlistan och dess giltiga IV-fördelning; samma legacy-fördelning avvisas mot v2-rader.
- SQL godkände först heltalsvärdet `200.0` men kastade dess decimaltext direkt till integer vid IV-summering. Fyndet reproducerades med tre röda fall och rättades i separat 150100 genom `numeric::integer` efter heltals-/intervallvalideringen. Ursprunglig 150000 och dess journal skrevs inte om.
- `phase5-23-a-preservation.json` och `phase5-23-a-numeric-preservation.json` visar faktisk tillämpning med identiska fullradshashar och antal i nio tabeller, bevarad tidigare ACL/övriga definitioner och journalföring. Källhasharna matchar de granskade migrationsfilerna.
- Tidigare rollback-inventering observerade tillkomna rader från ett annat pågående flöde. De återställdes inte. Inventeringen redovisar separat delmängdsbevis och repeatable-read rollbackbevis. Faktiska tillämpningsrapporter jämför A:s egna stabila före-/eftermängder.
- De tre ursprungliga ersatta hjälpfunktionerna hade redan `service_role` EXECUTE. Den ACL:n bevaras; ingen ny sådan rättighet tillskrivs A. Alla tre nya hjälpare är stängda även för service_role, Worker, anon, authenticated och PUBLIC.
- Full SQL:s äldre auditfel kvarstår. 05-22:s första backfill ändrade tidigare fyra `timplans.updated_at`; den historiska PARTIAL-avvikelsen är inte reparerad av A:s oförändrade aktuella fullradshashar. Se 05-22-verifieringen.

Inga kvarvarande blockerande kodfynd inom A har identifierats efter dessa rättningar. Statusen betyder att A:s avgränsade automatiska leverans är klar, med de öppna historiska avvikelserna uttryckligen bevarade.

## Kravstatus och vad som återstår

**ADMIN-02 får delbevis och förblir Pending.** A bevisar nya planers v2-rader, sparning och full SA-summa genom aktuella mandatvägar. Fulla nationella beslutsregler, mänsklig begriplighet och hela fasens utbildningsflöde godkänns inte här. ADMIN-04 och andra klass-/timplanskrav får ingen ny slutstatus av denna rapport.

Steg B äger planblockens analys, nivåordning, totalsummefel och explicit uppgradering av befintliga planer. Steg C–E äger paketlagring, skolpaket, val-/rollflöden och deras slutbevis. Dessa återstående steg är inte fel i A och 05-23 får inte markeras helt genomförd. Yrkesprogrammens fulla nationella målram och beroendet 05-17 är också fortsatt separata.

Mänskligt prov enligt frontmatter återstår: bedöm begripligheten i ny SA-plan på dator/telefon och i skillnaden mot bevarad legacy. Agenternas bildgranskning och syntetiska integrationsprov innebär inte godkänd verklig kommunanslutning eller pilotdrift.

Samordnarens installationsbevis efter den oberoende granskningen: vanlig `3012` kör `b819a50`, 35 tidigare klientfiler behålls för öppna flikar och inga flikar laddas om automatiskt. `phase5-23-a-preview.json` har PASS. Aktuella användarscenarier före/efter bytet är PASS: 18 scenarier över nio utbildningar/två roller, 44 auditläsningar per omgång, befintliga verksamhetsrader bevarade. Äldre planer är fortsatt legacy; detta uppgraderar dem inte.

_Verifierare: Codex, gsd-verifier. Endast 05-23 steg A, 2026-10-05._
