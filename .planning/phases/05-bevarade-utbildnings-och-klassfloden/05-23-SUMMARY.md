---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "23"
status: in_progress
completed_steps: [A]
next_step: B
requirements: [ADMIN-02, ADMIN-03]
requirements-finally-verified: []
human_result: awaiting_user
worker_build_revision: b819a50c0116194e52fdf089ee7f7d134640da2c
---

# 05-23 — full poängsumma och valbara block

Steg A är genomfört och automatiskt verifierat lokalt med syntetiska data. Nya planer får separata Svenska/SvA-rader och blockramar. SA25 med 300 p programfördjupning sparas och läses om med 2 500 p. Planen som helhet är inte genomförd: äldre utkast, full analys, blockändringar och skolornas paketval återstår i B–E.

## Steg A — nya planer, svenskrader och blockramar

Källcommits: `ef365fc` (grundformen), `84ba403` (legacy-förhandsvisning) och `b819a50` (numerisk SQL-rättning). Migrationerna `20261004150000_phase5_programplan_choice_blocks.sql` och `20261004150100_phase5_programplan_block_numeric.sql` är tillämpade och journalförda på det isolerade målet `protected`. Ingen reset eller verksamhetsbackfill har gjorts. Aktuella före-definitioner inventerades med `pg_get_functiondef`; se [FUNCTION-INVENTORY](05-23-FUNCTION-INVENTORY.md).

- Nytt underlag har `choiceBlocks`. Katalogens Svenska/SvA-alternativ blir tre terminsrader à 100 p. Slotblockens id, namn och poäng kommer från den pinnade katalogen; individuellt val har en 200-poängsram. Exakt en rad per block, ingen v2-rad `meta:individualChoice`.
- Alla 29 program och 70 inriktningskombinationer prövas i TS och SQL. SA:s tre inriktningar når 2 500 p med 300 p vald programfördjupning. Ny plan utan den fördjupningen visar kvarstående poäng mot programmets total; inga nivåer läggs till utan användarval.
- Block-id följer det beslutade kontraktet, inklusive giltiga `constructor`/`prototype`, med säkra listor/Map. Ogiltiga former, dubbla id, slotavvikelser och fel IV-summa nekas.
- Nya skapandevägar skickar v2. Lagrade legacyplaner, deras förhandsvisningar och kopiering behåller sitt faktiska gamla underlag. Reply-kontrollen jämför också pinnade block och nekar tappade eller ändrade block.
- Inga nya grants. Exakt tidigare 16 Worker-entrypoints; nya interna hjälpare är stängda för klienter, Worker och service_role. Befintliga ACL och ej ersatta definitioner bevaras.
- Handboken beskriver verifierade nya rader och tydligt att äldre utkast och paketval återstår. Den är byggd utan publicering.

### Kontroller och rapporter

Minimerade rapporter ligger i `work/pilot/results/phase5-23-a-*.json`. Lokala rårapporter, loggar och bilder finns i `web/test-results/phase5-23-a-final/`. Orörda rårapporter har SHA i browserrapporten; `*-local.json` och `report-paths.json` flyttar bilagornas sökvägar inför städning av byggkopian.

| Kontroll | Resultat |
|---|---|
| Node modell/server | Slutligt 593/593 PASS |
| TypeScript, oxlint, skyddat bygge, handboksbygge, diff-kontroll | PASS |
| Riktad SQL | Först 312/312; efter numerikrättningen 326/326 PASS |
| TS/SQL-katalogparitet i rollback | 142/142 PASS, legacy/v2 för 70 kombinationer och två kontrakts-id |
| Numerisk RED/GREEN | Före rättning 3/326 FAIL med `22P02`; efter rättning 326/326 PASS. 14 rå-JSON-fall |
| Faktisk migration och numerikrättning | PASS: nio hela tabellmängder, tidigare ACL och andra definitioner oförändrade, journalposter finns |
| A-API, faktisk byggd Worker | 3/3 PASS, nio ordnade TS/SQL-vektorer, v2 skapa/spara/återläsa, revision och parade auditspår |
| Termins-API | 31/31 PASS |
| B01 på dator och iPhone 13 | 2/2 PASS på `84ba403`, sedan 2/2 på slutligt `b819a50` |
| Programplansbrowser / terminsbrowser | 40/40 och 25/25 PASS, ett avsiktligt hoppat datorfall för telefonlayout |
| Städningsbilagor | 68/68 i första matrisen och 2/2 i slutligt B01: noll egna kvarvarande verksamhetsrader/felinjektioner. Append-only audit och nödvändiga ankare behålls |
| Full SQL, 31 filer | **FAIL 2289/2290**, enbart det tidigare kända `phase2_audit` #13 |
| Användarprov före/efter serverbyte | 18 aktuella scenarier över nio utbildningar/två roller, 44 auditloggade läsningar per omgång, verksamhetsrader bevarade |

API och slutligt B01 använder samma käll- och byggrevision `b819a50c0116194e52fdf089ee7f7d134640da2c`. Program-/terminsregression och termins-API använder `84ba403`; produktkod i `web/app` och `web/lib` samt dessa browserprov är identisk med slutrevisionen. Rättningen ändrar endast SQL:s konvertering av redan validerade heltal, dess test, målskydd och A-harnessens källbevis. Hela SQL-regressionen kördes igen efter rättningen.

Dator-/telefonbilder är visuellt granskade: läsbara Svenska/SvA-rader, blockramar, 2 500/2 500, sparstatus och årskursväxling. Ingen global sidöverströmning. Det är agentens kontroll, inte användarens begriplighetsgodkännande eller verklig kommunanslutning. API/browser använder mintade lokala syntetiska sessioner mot riktig Worker och PostgreSQL; interaktiv OIDC/MFA-bedömning härleds inte ur dem.

### Avvikelser och bevarande

- Tillämpad migration 150000 är byteidentisk med sitt tillämpningsbevis. Slutgranskningen fann att giltigt rå-JSON `200.0` gav castfel. Separat 150100, från aktuell funktionsdefinition, normaliserar med `numeric::integer` först efter heltalsvalidering. RED och GREEN bevaras. Ingen tillämpad fil har redigerats.
- Steg A behöver även workspace-pinning, förslagsrangordning, reply-test och handbok för att nya skapandevägar faktiskt ska fungera. De avgränsade beroendena ligger i källcommiten; senare steg B:s blockkommandon/analys är inte genomförda.
- Skyddat bygge/server på 3059 kördes i egen ignorerad byggkopia med samma kontrollerade runner, i stället för att låta restart-scriptet skriva över den aktiva 3012-katalogen. Den gamla servern hölls igång tills slutbygget var prövat. Vid kopiering följde byggserverns privata restfiler med; ägarskapsskyddet stoppade starten, kopiorna togs bort, och 3012 startades med egna inställningar. Inga hemligheter versionshanterades.
- Vanlig 3012 kör slutligt `b819a50` och behåller 35 tidigare klientfiler för öppna flikar. Ingen automatisk omladdning eller återskapande av användarplaner. Byggkopian och föregående byggbackup städas efter att råbevisen bevarats.
- Under första read-only inventeringen tillkom verksamhetsrader från annat aktivt flöde. Dessa behölls. Delmängdsbevis identifierar alla ursprungliga rader; migrationerna har dessutom separata helradsbevis före/efter. 05-22:s historiska fyra ändrade `updated_at` återställs inte genom A och förblir PARTIAL.
- Full SQL:s äldre auditfall förväntar annan feltext. Det räknas som FAIL och är inte dolt som ett godkänt prov. Alla fas 5-filer passerar.

### Överlämning till ny session — steg B

Läs detta avsnitt, aktuell STATE och 05-23-PLAN/CONTEXT. A är klart; ingen fullplans- eller kravslutmarkering ska göras. Nästa steg B:

1. Inventera aktuella SQL-definitioner före samma-signatursersättning; 150100:s helper är aktuell, inte texten i 150000.
2. Bygg blockändringskommandot med CAS/MFA/CSRF/audit och exakt ny Worker-ACL efter preflight.
3. Uppgradera endast äldre **utkast** till nya Svenska/SvA-rader och block. Bevisa oförändrade fastställda/ersatta versioner och ändrade utkast med hela radhashar.
4. Genomför total-/legacyanalys och terminsbaserad nivåordning. V2-alternativens fulla nivåordningsanalys ingår ännu inte i A.
5. Provkör B:s SQL/API/browser, uppdatera handbok och skriv ett eget ”Steg B” med commit/push och migrationer. C–E och paketval är fortsatt öppna.

05-17 saknar PLAN och är inte förutsättning för A/B. Yrkesprogrammets total/bortval och yrkesfastställande kräver separat 05-17-arbete; ingen total gissas. 05-25 väntar fortfarande på hela 05-23.

Mänskligt A-prov: `awaiting_user` — skapa en ny SA-plan, välj programfördjupning och kontrollera Svenska/SvA 1–3, blockramarna och totalsumman på dator/telefon. Planens slutliga mänskliga paketprov hör till steg E och kan ännu inte genomföras.
