# Fas 5 — valideringskarta

Status 2026-09-30: 05-01–05-07 genomförda som delplaner. Skyddad GR/IM-timplanslista/cellvy och separat programplansreferensgrund lokalt verifierade; övriga utbildnings-/versionsflöden och full fasverifiering återstår. Kravstatus ändras inte av denna karta.

| Krav | Positivt användarbeteende | Negativa och återställande prov | Slutligt bevis |
| --- | --- | --- | --- |
| ADMIN-01 | Huvudman importerar skola via kod/orgnummer, omläser adress/skolform; uppdatering bevarar lokal rektor. | Annan kund/skola, återkallat mandat, förfalskad klientroll, fel under import/audit; rektorsmandat och data oförändrade. | Lokal SQL/API + dator/telefon + handbok; verkligt källuppslag redovisas separat från stub. Väntar. |
| ADMIN-02 | Gymnasieutbildning, kurs/nivå, programplaners utkast/direkta HM-beslut och timplanernas förslagsflöde följer befintliga regler och består efter inloggning. | Låst version, ogiltigt katalogval/ram, obehörigt beslut, samtidig revision, audit-/delskrivningsfel. | Modeller + lokal SQL/API + browser + handbok. Väntar. |
| ADMIN-03 | Huvudman kopierar till senare kull och får egna utkast med nya ID:n. | Tidigare/ogiltigt år, dubbla samtidiga kopior, annan kund/skola, avbrott; inga kopierade elever/klasser/beslut/tillstånd. | Lokal atomär SQL/API, negativa identiteter och browser. Väntar. |
| ADMIN-04 | Beständig klass kopplas till exakt fastställd timplan/läsår/kolumn; ny version lämnar gamla kopplingen kvar. | Annan skola, fel kolumn, ej fastställd ny koppling, tvetydig backfill, omvänd sparordning, ny objekts-ID, konflikt och loggfel. | Modeller + schemaavstämning + SQL/API + browser/läsårsunderlag. Väntar. |

## Genomförda startprov

Se `05-CURRENT-EVIDENCE.md`: 30/30 befintliga modellprov PASS; båda äldre sparordnings-/ID-prov FAIL. Den syntetiska transporten är inget API- eller databasbevis. Inga ADMIN-krav är genomförda eller verifierade här.

## Kontroller per avgränsad implementation

1. Rena modell-/serverkontrakt och riktade samtidighetsprov.
2. Nya migrations-/policy-/grant-prov mot endast assertTarget-skyddat syntetiskt mål. Kontrollera oförändrade data efter nekade eller felande anrop.
3. Positiva och negativa API-prov med separata kunder/skolor/uppdrag, återkallelse, MFA där befintlig policy kräver och auditbortfall.
4. Byggd skyddad app, dator och telefonvy, verklig servertransport; tangentbord, sparläge, konflikt och ny inloggning. Enhetsläge anges som sådant, ingen påhittad fysisk telefon.
5. Relevant typ/lint/bygge och handboksbygge efter användarbeteendeändring. Separat syntetisk baslinje bevarar uppskattade äldre flöden.

Fas 5 behöver en fail-closed kravgrind som kräver alla obligatoriska steg, ingen grön status vid saknade mål, skip eller inaktuell kodfingerprint. Den bevarar fas 4:s negativa säkerhetsvägar men ersätter inte fas 4:s kvarstående mänskliga checkpoint/fasverifiering. Exakta kommandon och rapportnamn fastställs i respektive ännu återstående genomförandeplan; denna karta är inte en körd grind.

## Föreslagna framtida provfiler — ännu inte skapade

- `web/lib/server/education-planning.test.mjs`: kommandovalidering, roll-/skolgräns, revisionskonflikt och minimerad audit.
- `supabase/tests/phase5_planning.sql`: positiva mandat samt nekad annan kund/skola, utgånget/återkallat mandat, klientrollsförfalskning och rollback vid logg-/delskrivningsfel för samtliga fyra krav.
- `work/pilot/verify-phase5-api.mjs`: samma matris via verklig lokal server, samtidiga kommandon och oförändrade rader efter nekande.
- `web/lib/planning-save-order.test.mjs`: senaste lokala avsikt, inaktuella svar och server-ID efter skapande.
- `web/e2e/phase5-planning.spec.ts`: dator/telefon/tangentbord, skolval, omläsning/ny inloggning, kopiering och versionbunden klasskoppling.
- `web/scripts/verify-phase5.mjs`: obligatorisk kravgrind utan skip-väg till PASS.

Namnen är planeringsförslag, inte befintliga körbara tester. Nästa genomförandeplan ska bekräfta eller precisera dem innan implementation.


## Delbevis 05-03 — 2026-09-30

Stängd timplans-SQL på 8c91a22: PASS 77/77; två riktiga anslutningar/låsväntan PASS 4/4; mandat 243/243, audit 19/19, registerkonflikt 19/19 och timplansmodell 14/14 PASS. Se 05-03-SUMMARY. Intern DB-audit har session_id=NULL; session/API/nekandeaudit och exakt Worker-grant hör till 05-04. Vald rad/kolumnbredd verifierad, inte full matris/totalram eller gymnasiets programplansgrund. Äldre fastställt beslut och klasskoppling bevarade i syntetisk fixtur. ADMIN-kraven och fas 4:s slutverifiering fortsatt öppna.

## Delbevis 05-04 — 2026-09-30

Sessionskopplad timplans-API på c216c7b, skyddat bygge samma revision; prov/grant i 000ec09. Preflight och final PASS 29/29 fall (93 kontroller vardera), exakt ACL återställd före separat grant och cleanup PASS. Sessions-/Worker-SQL 27/27, timplans-SQL 77/77, mandat/audit/register 281/281, verkliga lås 4/4 och modell/server 416/416 PASS. Körargrind 2/2, typ/lint/bygge PASS. Verklig PostgreSQL och byggd Worker med lokalt mintade testrealmsessioner; ingen interaktiv IdP eller kommunanslutning. Exakt två Worker-entrypoints öppna, helpers/klientroller stängda. Se 05-04-SUMMARY för sessions-/audit-/nekande- och rollbackbevis. Skyddad UI/kolumnunderlag, full matris/totalram och gymnasiets programplansgrund återstår; ADMIN-kraven och fas 4:s slutverifiering fortsatt öppna.

## Delbevis 05-05/05-06 — 2026-09-30

05-05 server 93ceb4e, prov/grant 612523c: verklig API preflight och final 39/39 (135 kontroller), exact ACL-restoration och cleanup PASS; list/metadata-SQL 59/59, timplan 77/77, session/Worker 27/27, mandat 243/243, audit 19/19 och observerade lås 4/4 PASS. Endast list/read/change öppna för Worker, helpers/klientroller stängda.

05-06 UI/skyddat bygge 7776f41: model/server 430/430, helper 9/9, typ/lint/bygge/handbok PASS. Browser 18/18 (desktop Chromium 9, telefon WebKit 9), inga skip/retries. Befintlig GR/IM-lista, korrekt sparad kolumnordning/veckotimmar, saknat/okänt underlag, en cells beständiga ändring+revision+sessionskopplad DB/Worker-audit+omläsning, HM/låst läsvy, verklig konflikt/explicit retry, MFA/båda loggfel, epoch/session/mandat/sent svar och okänt nätutfall efter commit prövade. Osparatprov bevisar modalspärr/fokus och accepterat/avböjt discard; separat aktivt uppdragsbyte genom modal prövas inte. Pekytor minst 44 px, contained tabellscroll/inget globalt overflow och syntetiska bilder granskade. Automatiskt fresh-read efter konflikt är enda planavvikelsen i omförsöksflödet; write alltid uttryckligt. Egna fixtures/trigger städade, säkerhetsloggar bevarade.

Se 05-05/05-06-SUMMARY och work/pilot/results/phase5-05-*.json, phase5-06-browser.json. Verklig byggd Worker/PostgreSQL med lokalt mintade testsessioner, inte interaktiv IdP/kommunanslutning. ADMIN-02/04 har delbevis men är fortsatt Pending: skapande, beslut, fullmatris/totalram, gymnasiets programplansgrund, kullkopiering och klasskoppling återstår. ADMIN-01/03 och fas 4:s mänskliga checkpoint är också öppna.

## Delbevis 05-07 — 2026-09-30

Kod/skyddat bygge 6922ce7: riktade katalog/generator/serverprov 21/21, full modell/server/generator 451/451, typ/lint, oförändrad originalsnapshot och byteexakt `--check` PASS. Katalog-ID `sha256:fa42ec44e663703bbf69ccd7b78c28d28ad275b144c57241f9f450a7a7252ace`. Generatorn korsreferensprövar 907 ämnen, 2192 items, 29 program och 2561 blocknivåreferenser. Alla 29 program kan återfinnas tekniskt med vald första inriktning/start 2026-08-01; 58 optional-val, 8 ej nivåupplösta block i dessa vägar och 29 programregel-luckor kvarstår. Ingen generell poäng-/timram eller implicit svenska skapas. Fel version/inriktning/start/nivå/poäng, ändrat innehåll med gammalt ID, obunden legacygrund och malformed objektreferenser stoppas.

Oberoende GSD-läsgranskning 5/5 must-haves. Se 05-07-SUMMARY och work/pilot/results/phase5-07-catalog.json. Ingen ny DB-, SQL-, API-, UI- eller grantväg, inget nytt browserprov/handboksbygge. Referensgrunden är tekniskt verifierad; nationellt komplett beslutsunderlag och skyddad beständig programplanshantering återstår före ADMIN-02:s slutbevis. Fas 4:s checkpoint och hela fas 5 är fortsatt öppna.

## Delbevis 05-08 — 2026-09-30

Stängd SQL-katalog c357f64 och utkastskommandon 244d1e2; faktisk samtidighets-/städningsharness bf278d8, äldre loggprov b0bf476. Katalog 60/60, utkast 108/108 och riktad SQL-regression 464/464 PASS (timplan 77, Worker/session 27, list/kolumn 59, mandat 243, audit 19, registerkonflikt 19, äldre säkerhetsaudit 20). Full modell/server/generator 455/455 samt harnesssäkerhet 5/5, typ/lint och båda artefakternas bytekontroll PASS. Faktiska separata anslutningar visar 6/6 observerade låsväntansfall: samtidig replace/bind/clone-CAS, stale revision efter planradlås, återkallat givarmandat och utgången session efter kundlåsväntan. Separat yttre SQL-caller-rollback bevarar data/historik/audit. Alla 42 TS/SQL-jämförelser PASS, inklusive alla 29 program, Gy11/GR och felreferenser; ofullständiga språk-/nivå-/programregler bevaras och decisionReady=false.

Ursprungliga plan-/utbildnings-/historikfält har samma hash före/efter. Egna syntetiska kunder/sessioner/planer/utbildningar/mandat är noll efter cleanup; 3 DB-säkerhetshändelser och 1 refererad identitet bevaras som auditankare. Nya tabeller/funktioner och gamla direkta programplans-/historikrättigheter stängda; Worker har exakt de tre tidigare fas 5-timplanskommandona. Ingen verklig Worker-audit, HTTP/MFA eller UI prövad/öppnad här. Inget nytt app-/handboksbygge eller browserprov motiverat av SQL/scriptändringen; tidigare bevis är historik. Oberoende GSD-granskning 6/6 delplans-must-haves. Se 05-08-SUMMARY och work/pilot/results/phase5-08-foundation.json samt refererade resultatfiler. ADMIN-02 och hela fas 5 är fortsatt Pending/öppna; nationella beslutsregler, skyddad API/UI, fastställande, kullkopiering och klasskoppling återstår. Fas 4:s mänskliga checkpoint kvarstår.
