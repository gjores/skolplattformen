---
gsd_state_version: "1.0"
milestone: v1.0
current_phase: 05
current_phase_name: Bevarade utbildnings- och klassflöden
current_plan: 05-38-READ-PERFORMANCE
status: in_progress
stopped_at: 05-38 faktisk preflight/slutmatris15/247 PASS; 28 entrypoints. Fortsätter med avgränsad prestanda-/kodsökrättning före UI05-39–43 och mänskligt prov.
last_updated: "2026-10-07"
last_activity: 2026-10-07
last_activity_desc: "05-38 färdig: preflight/slutmatris15/247 PASS, tre grants, 28 entries, 15 helradstabeller och audit bevarade. Nästa prestandarättning och UI."
state_head: f0b14fb
verification_worker_build_revision: d59ec10f5b4469ce4e14e1e12a591aca2363a30b
worker_status: running_on_3012
worker_build_revision: 5dd7baf0fc0bd92d7b61f07e01020cef791e0908
progress:
  total_phases: 8
  completed_phases: 3
  total_plans: 100
  completed_plans: 81
milestone_name: milestone
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-07)

**Core value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.
**Current focus:** Modell/SQL/API05-36–38 är avgränsat verifierade. Nu prestandarättning av52-raderslistan, därefter UI05-39–43 och konkret användarprov. Planeringsår och elevregisterår ska vara separata. Programplanens blockramar och terminsfördelning består; blockhanteringen är borttagen enligt användarens förtydligande 2026-10-06. Den beställda [övergången från programplan till skolans timutkast](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md) fungerar fortsatt med fryst källa och separat skolvis timfördelning. Paket finns inte i programplanerna. Teknisk 05-23/E är avslutad enligt aktuell ram; yrkesram 05-17, formella beslut och garantikontroll återstår. Det aktuella grundflödet är användarrapporterat godkänt 2026-10-06. Äldre 05-25–35 kräver omplanering mot den nya övergången.

## Current Position

**Färsk fullrollback och exakt tillämpning 2026-10-07:** Prestandakorrektivets fullrollback är PASS på oförändrad d59ec10f-Worker: SQL143/46, oförändrad93/18 och nio verkliga HTTP-mätningar med ordinarie15s/30s-gränser. Listmedian16,274s, sökmedian20,658s och sidmedian16,907s; full15-helradsbevarande, rå ACL/katalog/journal, audit-/identitetsankare och egen cleanup PASS utan deferred completion. Exakt migration06122000 är därefter tillämpad med bevarade28 grants/originalrader/audit. Fullständigt applied-slutprov pågår; prestandaförbättringen och fullplanen är ännu inte godkända. Ingen reserv/återanvänd SQL eller UI-/SEARCH-integration. 81/100 består, vanlig3012 oförändrad.

**Fortsatt isolerad källförberedelse 2026-10-07:** Ny färsk fullperformance-rollback kör på oförändrad d59ec10f-Worker med granskad Connection:close-testtransport och ordinarie tidsgränser; slutbevis är ännu öppet. Managed worktree är pushad/fjärrverifierad till4798b00: bbf11f1 locationGR/IM, 9e020a9 SEARCHsetupUnknown, a9e19fc/97cd6f1 C/L/G sticky pågående node-/browserarbete och fail-fast före fixturskapande, samt4798b00 GR/IM neutral årsrad/fullmatris/currentdraft-koppling. Location34 och GR/IM18 rena prov/lint, oberoende källreview och full typkontroll utan incremental PASS på frysta källor; sista produkttextbytet har separat syntax/lint. GR historik visar lagrade positioner med skrivspärr, uttrycklig aktuell utkastmatris visar nuvarande kolumner utan årsbindningspåstående, IM veckotid består. URL återupptar endast verkligt annualmål; obundet currentdraftläge kräver nytt uttryckligt val efter reload/årbyte. Två egna42provkällor förbereds. Ingen canonicalUIintegration/actual39–42/apply/SEARCH-PASS eller ändring av81/100 följer.

**Färsk avgränsad transportdiagnos 2026-10-07:** Alla nio egna gamla HTTP-list-/sök-/sidfall PASS med ordinarie setup15s och planning30s när endast de egna fixturanropens anslutning stängs efter svar. Listan15,737/15,007/14,852s, sök22,794/18,903/20,567s och sida2 16,731/15,337/15,337s; exakta audit-/sessionsgrindar, fulla15 originalhelrader, katalog och ägd cleanup PASS. En tidigare120s-diagnos gav ett faktiskt17,840s-svar och full cleanup; den är inte accepterad tidsbaslinje. Ingen underliggande transportorsak är belagd och Worker d59ec10f är oförändrad. Två coordinator/testkällor får avgränsat ägar-/lokalroutebundet Connection:close, återställning före cleanup, oförändrade15s/30s- och acceptansgrindar; oberoende källreview och33 rena prov PASS. Färskt fullständigt143/46+93/18+nioHTTP+slutbevarande krävs före apply; reserv fortsatt stängd och81/100 består. UI-förberedelsegrenens41koppling9c0fa70,40GET-rättninge42da19 och41gymprov03d7420 är kontrollerade/pushade, endast källberedskap. 05-42 tillåter dessutom isolerad tvåfils URL-förberedelse för GR/IM; actual41 och övriga dependencies består.

**Ny fullmatris och transportfel 2026-10-07:** Korrigerad SQL143/46 och oförändrad93/18 PASS. Första faktiska gamla HTTP-listan gav200/52/50 på18,129s med exakt4 audit/no-store. Nästa försök saknade bevisat DB-avslut; coordinatorn lämnade cleanup/finalsnapshot åt sidan och fullrapporten är bevarad FAIL. Separat ägd diagnos visar giltig session, inga aktiva DB-jobb och fritt FOR UPDATE-lås. Kontrollerad återhämtning återkallar exakt provsessionen och tar endast bort egen syntetisk affärsgraf; alla15 originalhelrader, full katalog/rå ACL/journal, all audit och auditerade identitetsankare PASS bevarade. Detta är inte fullplansbevis och aktiverar inte reserven. Provverktygets borttappade transportorsak rättas med vitlistad pendingAttempt och separat completiondiagnostik; fryst källreview och30 rena prov PASS. HTTP-only diagnos och därefter färskt fullbevis krävs före permanent apply/SEARCH/UI. 81/100 består.

**Aktuell omkörning och källförberedelse 2026-10-07:** Ny fullständig rollback kör med korrigerad ägd3h SQL-fixtur, separat120min SQL-watchdog och samma30s HTTP-gräns. Verktygen är oberoende granskade, 26/26 rena grindprov och syntax/diffkontroller PASS; `e3f1355` är pushad/verifierad. Reserven för censurerade HTTP-observationer är fortsatt stängd. SEARCH:s åtta frysta källor har oberoende review och 69/69 samlade rena kontrakts/server/grindprov PASS samt separat förberedelsecommit `2b5cf27` i managed worktree; ingen faktisk SEARCH-körning eller huvudkopieintegration. 05-40:s shell/location-/workspace-koppling och 05-41:s fyra årskontrollkällor förbereds där enligt respektive preciserad plan. De senare har27 riktade modellprov, typkontroll utan incremental, riktad lint och diffkontroll PASS; inga mobil-/spar-/beteende-PASS följer av dessa källkontroller. Fulla dependencies och81/100 består.

**Isolerad förberedelse 2026-10-07:** Managed worktree `planning-navigation-guards`, gren `codex/planning-navigation-guards`, innehåller granskad UI05-39-källförberedelse i `773e266`/`c996f4a`/`1ad8af2` och tre fristående tabell-/överblickskällor i `b00fdf5`. Alla fyra commits är pushade och fjärrgrenen verifierad. De 16 faktiska dator-/telefonfallen är skrivna men inte körda. Senaste samlade rena location-/modell-/kontrakts-/serverkontroll: 78/78, typkontroll utan incremental och lint PASS; detta omfattar även SEARCH-parserns två slutna radformer. SEARCH:s nya SQL/harness förbereds där utan målåtkomst. Scope-reset för oskickad söktext och återläsningsbar 409 vid avböjt sidbyte är källgranskade rättningar. En villkorad prestandareserv förbereds också med rena grindprov; den ändrar ännu inte fullkörningens acceptans. Ingen huvudgrensintegration, faktisk UI-/SEARCH-verifiering, permanent performance-apply eller ny krav-/plan-PASS följer av förberedelsen. Dependencies och 81/100 består.

**Nytt provfel och avgränsad rättning 2026-10-07:** Full omkörning från07:59UTC slutade09:00UTC FAIL: testets egna entimmessessioner löpte ut efter gamla cachegränsfallet. Gamla återstående fall och hela kandidaten gav42501; SQL-watchdog flaggade också timeout. Det är inget paritets-PASS. Hela public-katalogen/rå ACL/journalen, alla15 originalhelrader och ursprungliga audit-/identitetsankare är oförändrade. Faktisk separat rollbackdiagnos12 visar giltig session00000 och expired42501 för både original/kandidat; ett trettonde prov verifierar att ny explicit fixturgrind gerPZ003. Bara korrektivets egna fyra SQL-sessioner har nu3h livslängd; original93, migration, Worker/authz/HTTP30s är oförändrade. SQL-watchdog120min med aktivt ägt backendstopp förbereds. Ny full143/46+93/18 krävs före timing/apply; äldre SQL-delbevis får inte återbrukas när testhashen ändrats. [Felhistorik](../work/pilot/results/phase5-38-read-performance-failure-history.json). Reservaktivering och huvudgrensintegration av UI/SEARCH är fortsatt stängda; 81/100 består.

**Tidigare kontroll 2026-10-07, före expiry-omkörningen:** Prestandakorrektivets hela rollback-SQL143/46 och oförändrade original93/18 PASS; fullrapporten är ändå FAIL eftersom första HTTP-mätningen fick timeout30s. Alla15 hela originaltabeller, rå ACL28, definitioner/journal och audit-/identitetsankare bevarade. En separat ommätning efter katalogstatistikuppdatering gav200/52/50 på28,675s med audit/no-store/städning PASS; detta är endast en diagnos, ingen full tidsbaslinje eller bevisad orsak. Den senare omkörningens expiry-FAIL redovisas ovan; ingen permanent apply. [Felhistorik](../work/pilot/results/phase5-38-read-performance-failure-history.json). UI05-39 förbereds i separat managed worktree `planning-navigation-guards` med rena tester/källgranskning; ingen integration, browserkörning eller beteende-PASS innan backendens fulla dependencykedja är färdig. Plan-/kravantal och Pending-status består.

**Färsk genomförandeprecisering 2026-10-07:** Kod-/benämningssökningen som 05-40 redan kräver saknas i dagens SQL/PlanningRow. [05-40-SEARCH-DETAILS](phases/05-bevarade-utbildnings-och-klassfloden/05-40-SEARCH-DETAILS-PLAN.md) är en avgränsad teknisk förutsättning efter prestandakorrektivet och före UI05-39–43; samma privata hjälpare/28 grants, ingen ny verksamhetsregel. Dessutom är sparstatus-/Back-gränser, exakt versionsöppning, 44px mobilknappar och GR:s okända kolumnkarta preciserade efter färsk kodgranskning. Planerna är ännu inte genomförda eller verifierade. Paketet har tio sekventiella waves; kör endast dess uttryckliga dependencykedja, inte hela fasens äldre planer.

**API-läsning 2026-10-07 — avgränsat PASS:** [05-38](phases/05-bevarade-utbildnings-och-klassfloden/05-38-SUMMARY.md) har faktisk preflight och permanent slutmatris 15 fall/247 kontroller vardera PASS. Exakt tre läsgrants ger 28 Worker-entrypoints; 11 hjälpare är fortsatt stängda. Alla 15 hela originaltabeller/tidsstämplar, audit/identitetsankare och övriga definitioner/rättigheter bevarade. Nästa är [05-38-READ-PERFORMANCE](phases/05-bevarade-utbildnings-och-klassfloden/05-38-READ-PERFORMANCE-PLAN.md) för uppmätt långsam 52-raderslistning, därefter UI 05-39–43. 81 av 100 planer är genomförda; fulla PLANERING-/ADMIN-krav, fas 5 och båda gapen är fortsatt Pending. Ordinarie 3012 är oförändrad.

**SQL-läsgrund 2026-10-07 — avgränsat PASS:** [05-37](phases/05-bevarade-utbildnings-och-klassfloden/05-37-SUMMARY.md) är genomförd och exakt tillämpad i isolerad lokal protected-databas. Både rollback och applied: 93 SQL-prov, 18 faktisk kontraktsparitet och 3 verkliga kundlåsväntor PASS; Node 6 och riktade lås 9 PASS. Alla 15 hela originaltabeller/tidsstämplar, säkerhetsaudit, gamla ACL/funktionsdefinitioner och journal bevarade. Tre nya läs-RPC och elva hjälpare är fortsatt stängda; samma 25 befintliga Worker-entrypoints. GR-originalkartor saknar proveniens och ger okända årstimmar. [Exakt inventering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-FUNCTION-INVENTORY.md). Nästa plan är **05-38, skyddad API-läsning och exakt läsgrant**; 80 av 98 skrivna planer är genomförda. PLANERING-01–05/hela fas 5 och övriga gap är fortsatt Pending. Ordinarie 3012 är oförändrad.

**Läsårsmodell 2026-10-06 — avgränsat PASS:** [05-36](phases/05-bevarade-utbildnings-och-klassfloden/05-36-SUMMARY.md) är genomförd: källstyrt GY-/GR-/IM-årssnitt, strikta läskontrakt och skilda poäng-/tim-/klassmått. 70 riktade Node-prov, 20 oberoende verifierarprober och typ/lint PASS. Ingen ny SQL/API/UI eller serverändring följer av modellsteget. PLANERING-01–05 och hela fas 5 är fortsatt Pending. Nästa plan är **05-37, stängd SQL-läsgrund**; 79 av 98 skrivna planer har SUMMARY.

**Teknisk slutverifiering 2026-10-06 — PASS:** 05-23 A–E är avslutad enligt aktuell ram. [E-verifieringen](phases/05-bevarade-utbildnings-och-klassfloden/05-23-E-VERIFICATION.md) visar 149 dator-/telefonfall, 170 API-fall/1 077 kontroller, 2 512 SQL-prov och 674 modell-/serverprov PASS. Sju uttryckliga skips gäller sex borttagna paketeditorfall och ett telefonfall på dator. 150 fixturer städade; 14 hela verksamhetstabeller inklusive tidsstämplar, ACL/funktionsfingeravtryck och samma 18 befintliga scenarier/44 auditpar före och efter bevarade. Programplanssvitens tidigare nio fel sammanfaller med datorvila; oförändrad återkörning ger 40/40 PASS. Felhistoriken består. Samma separata bygge `e9ca1e7`; vanlig 3012 behåller `5dd7baf`. Grundflödet är användarrapporterat godkänt. ADMIN-02/03/04, hela fas 5, historisk 05-22 metadata PARTIAL och båda nya gapen kvarstår. Läsårsmodellen 05-36 är därefter färdig; nästa plan är 05-37; äldre 05-25–35 kräver omplanering.

**Mobilt UI-gap 2026-10-06:** Användaren föredrar programplanens årskursknappar framför dropdownen. [Registrerat förbättringsbehov](todos/pending/2026-10-06-arskursknappar-i-mobilens-timplan.md) kopplar till den motsvarande dropdown som finns i gymtimplanen enligt färsk kodkontroll; exakt målvy är en samtalstolkning att kontrollera vid rättning. Knappmodellen ska återanvändas med bevarad timinmatning/sparning och samordnas med 05-41. Pending, ingen UI-ändring eller nytt prov genomfört. Grundflödets tidigare godkännande består.

**Nytt verksamhetsgap 2026-10-06:** Rektorn ska uttryckligen kunna färdigmarkera sitt arbete och en behörig huvudmannarepresentant ska kunna godkänna det. [Registrerat behov](todos/pending/2026-10-06-rektor-fardigmarkerar-och-huvudmannen-godkanner-planarbete.md) gäller aktuellt program-/timplansarbete. Dagens ”Klar för beslut” är framräknad analysstatus, inte rektorns överlämning. HM-programbeslut finns i äldre 05-25/26 och timplansförslag/beslut i 05-32/33, men är inte genomförda. Omplaneringen ska uttryckligen täcka båda aktörernas handlingar. Grundflödets användargodkännande består; beslutsgapet är pending och avslutas inte av teknisk 05-23/E eller läsårsplanerna 05-36–43.

**Användarresultat 2026-10-06:** ”detta funkar!” efter provuppmaningen för öppna/ändra programplan, gå till rätt skolas timplan, fylla i timmar och kontrollera efter återöppning. Det aktuella grundflödet är **användarrapporterat godkänt**, utan särredovisade steg, roller, dator/telefon eller faktisk provrevision. Se [samlat användarresultat](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-USER-TRIAL.md). Grundflödets mänskliga vänteläge är avslutat; äldre väntelägen/FAIL nedan är historik för respektive version. Ingen ny teknisk körning följer av beskedet. E:s tekniska fullplansverifiering är därefter PASS; övriga uttryckligen oprövade användarmoment, ADMIN-02/03/04, hela fas 5 och fas 4-checkpoint är fortsatt öppna. Läsårsmodellen 05-36 är därefter genomförd; 05-37–43 återstår.

**Ny planeringsbeställning 2026-10-06:** Användaren har beslutat om gemensamt valt år/skola inom planeringen och separat elevregisterår, med både nya och fortsättande kullar i årsöverblicken. [05-36–43](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-IMPLEMENTATION.md) har genomförbara delplaner för modell, skyddad läsning, kontext, sökbara tabeller, rätt årsdel i GY/GR/IM och slutprov/handbok. Samtalsbeslut och färsk kodinventering är sparade; gamla läsårs-/tabelltodos samordnas och förblir pending. PLANERING-01–05 är kompletterande Pending-krav; pilotens 42 ursprungliga krav/åtta faser består. Planeringsbeställningen gav i sig ingen körning; 05-36 har därefter fått separat modell-/kontrakts-SUMMARY. Ingen ny app-/DB-/browserkörning har gjorts. Nuvarande serverbygge är fortsatt `5dd7baf`. Läs paketets planer selektivt vid genomförande; gamla replan_required-planer får inte dras igång bara för att wave-numret är lika. Efter E är planinventeringen 98 skrivna/78 genomförda; yrkesram och formella beslut är fortsatt öppna.

**Senaste avgränsade rättning 2026-10-06:** Gymnasietimplanens timmar fylls direkt i aktiva terminsceller och sparas när raden lämnas eller Enter trycks. Köade radskrivningar, ny inmatning under sparning, konfliktjämförelse och återläsning vid okänt svar bevarar arbetet. T01–T13 på dator/telefon 26/26 PASS, 26 städningsbilagor, riktade modell/server 24 PASS och typ/lint/skyddat bygge/handbok PASS. Vanlig 3012 kör `5dd7baf`, 174 prövade filer byteidentiska. De 18 befintliga scenarierna/44 läspar består. Initial databasjämförelse FAIL bevarad: två verksamhetshändelser inträffade före första prov; kompletterande jämförelse av alla 14 hela tabeller från provstart till serverbyte PASS, inklusive dessa uppgifter. Se [rättning och bevis](debug/gym-timplan-inline-hours.md). Separat [tabellöversikts-todo](todos/pending/2026-10-06-tabelloversikter-med-sokning-filter-och-sortering-for-planer.md) är pending. Fulla krav/fasstatus och planinventering 90/77 ändras inte.

**Föregående avgränsade rättning 2026-10-06:** ”Behåll blockramarna, ta bort blockhanteringen.” Skapa/dela/ändra/ta bort block är borta från programplanen; sparade blockrader, poäng, terminer och fasta nivåval består. B01–B03 6/6, F01–F05 10/10 och T01/T03 4/4 på dator/telefon PASS; typ/lint/skyddat bygge/handbok PASS. Första ram-FAIL bevarad och provet anpassat till borttagen UI-väg med fortsatt verkligt 409-API-skydd. 20 slutliga cleanupbilagor noll egna verksamhetsrader. Vanlig 3012 kör `a7c78e1`, 174 prövade artefaktfiler byteidentiska; färsk baslinje över 14 hela tabeller och 18 scenarier/44 auditpar bevarad. Se [rättningen](debug/programplan-block-controls.md) och phase5-programplan-block-controls-rapporter. Hela 05-23/E och ADMIN-02/03/04 förblir öppna; planinventeringen 90/77 ändras inte.

**Beställd 2026-10-05; genomförd och verifierad 2026-10-06:** Programplanens Timplan leder till rätt skolas beständiga timutkast. Poäng/källversion fryses; timmar sparas separat över sex terminer. Samma programram kan användas av flera skolor. Rektor/skoladministratör ändrar inom skolmandatet; HM läser. Explicit nytt underlag bär bara timmar från oförändrade ramar; äldre timmar och klasskopplingar består. Nya browser18/18 och regression42/42, faktisk Worker på 3012 11/157, postgrants SQL37 och 14 hela originaltabeller/18 scenarier/44 auditpar PASS. 174 prövade artefaktfiler är byteidentiska på vanlig 3012 (`3ae5fe5`). Slutlig städning och bevarandekontroll efter alla 60 browserfall PASS. Se [PLAN](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md) och [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md). **Avgränsad utkastleverans; ADMIN-02/03/04 och hela fas 5 är öppna.** 05-25–35 har replan_required; deras fastställd-/paketgrind ersätts endast för förberedande utkast.

**Föregående paketborttagning, 2026-10-05:** Programplanen har fasta nivåer och valbara blocks poäng/terminsram, utan paketkommandon, paketladdning eller paketanalys. Kullkopiering tar med ram/terminer/skolor utan paketval; äldre hela paket-/planrader bevaras. F01–F05 10 PASS, B01–B03 6 PASS, skrivskyddad terminsanalys 2 och delad plan 2 PASS; 6 äldre paket-UI-fall uttryckligen historiska skips. Node 512 + 136, harness 4, typ/lint/skyddat bygge/handbok PASS. Första browser-FAIL och byggavvikelser bevarade; slutlig städning av 20 fixturer noll egna verksamhetsrader. Vanlig 3012 kör 848afd4: 166 testade artefaktfiler byteidentiska, 12 ursprungliga tabellers helradshashar och 18 scenarier/44 auditpar bevarade utan reset. Se [REMOVE-PACKAGES-PLAN](phases/05-bevarade-utbildnings-och-klassfloden/05-23-REMOVE-PACKAGES-PLAN.md), [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-23-SUMMARY.md) och phase5-programplan-frame-rapporter. Avgränsad rättning klar, **hela 05-23/E in_progress, ADMIN-02/ADMIN-03 Pending och mänsklig begriplighet awaiting_user**. Äldre audit-FAIL/05-22 metadata PARTIAL kvar. Berörda 05-25–28 ska granska sina skolpaketsantaganden mot beslutet; inget skydd kringgås.

**Tidigare begärd arkitekturöversyn, före senare beställning 2026-10-05:** Användaren ifrågasätter paketens placering i programplanen och vill bedöma dem tillsammans med individuella studieplaner och tjänstefördelning. [Bedömningen](research/PAKETENS-PLATS-I-UTBILDNINGSFLODET-2026-10-05.md) föreslår programram → skolans utbud/valomgång → elevens konkreta studierader → grupper/bemanning, med tidig resursprognos och senare avstämning. Bibliotek/versioner och befintliga uppgifter kan återanvändas. Den senare beställningen ovan godkänner paketborttagningen, som nu är genomförd. Den fulla separata utbuds-/organisationsfunktionen är fortsatt ett förslag. E:s gamla paketUI-prov ersätts av ramprov i den reviderade planen; inga redan godkända krav återfrågas.

**Organisatoriskt tillägg från användaren, 2026-10-05:** Skolan behöver kunna organisera block i olika kombinationer utifrån resurser, exempelvis språkgrupper på olika dagar med en enda språklärare. Programblock/terminsram ska inte automatiskt innebära parallellt veckoschema. Skolvis grupporganisation, elevkombinationer och bemanning behöver planeras tillsammans; samma programram ska kunna användas med olika organisation på olika skolor. Översynen och schemadelprojektets S1/S3 har kompletterats med avgränsning och föreslagna verifieringsfall. Detta godkänner inte i sig hela den separata organisationsfunktionen. Paketborttagningen är senare beställd och genomförd; skolorganisationen är ännu inte implementerad.

**Historiskt 05-23 steg D, före paketborttagningen 2026-10-05:** Oföränderliga ämnespaket/versioner för IV/fördjupning/HU/NA, exakt versionsbundet skolval, mandat för källa/mål och skydd mot tappat svar/409 är genomförda. Skolans samlade IV-utbud analyseras; saknad idrott/yrkesbehörighet ger risk, estetisk lista Att kontrollera. Migration 156000/157000 utan reset, exakt 21 Worker-entrypoints. Node 646, harness 5, riktad SQL 137+428, TS/SQL-paritet 33, D-preflight/API/3012 vardera 11 och API-regression C16/B11/program48/terminer31/livscykel39/utbildning43 PASS. D/C/B-browser 6/16/6 och fyra bilder på dator/telefon PASS. Typ/lint/bygge/handbok PASS. Första runtime-FAIL fann 74 kvarlämnade ägda syntetiska skolkopplingar; städningsrättning och exakt återställning av originalmängden bevisade. Slutlig 3012 kör a307d26 med tolv hela tabeller och 18 scenarier/44 auditpar bevarade. Se SUMMARY/D-VERIFICATION/D-FUNCTION-INVENTORY och phase5-23-d-rapporter. Full SQL inte omkörd: C:s historiska 2411/2412 FAIL samt 05-22 metadata PARTIAL kvar. **Hela 05-23 in_progress, ADMIN-02/ADMIN-03 Pending; nästa E.** Mänsklig begriplighet awaiting_user, inga verkliga kommunbevis.

**Historiskt 05-23 steg C, före paketborttagningen 2026-10-05:** Skolvisa språkpaket och terminsram, analysåtgärd för rätt skola, autospar med samtidighets-/osparatskydd och paketkopiering till ny version/elevkull verifierade lokalt. Skoladministratör läser planen och ändrar egna paket men får inte ändra planen. Arkiv låser paket; fastställd/ersatt och passerad start tillåter paketarbete. Migration 154000/155000 tillämpade utan reset, exakt 19 Worker-entrypoints. Se SUMMARY/C-VERIFICATION/C-FUNCTION-INVENTORY. Node 629, paritet 534, SQL 986+86, C-API 16, regression 11/48/31/39/43 och paketbrowser 16 PASS. Block 6/program 40/terminer 25(+1 avsiktligt skip)/livscykel 20 över bas 18 + riktat omprov 2 PASS; 142 browserstädningsbilagor noll egna verksamhetsrader. Full SQL 2411/2412 FAIL endast äldre phase2_audit#13. Vanlig 3012 kör 9790c54 (produkt byteidentisk med 8c719ee); C-API 16 och 18 bevarade scenarier/44 auditpar före/efter samt 11 helradstabeller PASS. Exportkoder ej verifierade, inga verkliga kommunbevis eller mänskligt godkännande. **Hela 05-23 in_progress, ADMIN-02/ADMIN-03 Pending.** Nästa ny executorsession D, sedan E. 05-22 metadata förblir PARTIAL.

**05-23 steg A/B, 2026-10-05:** Nya planer och 13 uppgraderade legacyutkast har Svenska/SvA 1–3 och blockramar. Huvudman/rektor kan dela IV (200 p) och lägga till fördjupningsblock, med CAS/MFA/CSRF/audit. Äldre fastställda/ersatta helrader och tidsstämplar bevarade. Terminsbaserad nivåordning ersätter årsordning. Migration 151000/152000, separat historisk klonrättning 152100 och blockgrant 153000 tillämpade; exakt 17 Worker-entrypoints. Se 05-23-SUMMARY/B-VERIFICATION/B-FUNCTION-INVENTORY. Node 609, SQL 912, paritet 210, block-API 11, program-API 48, termins-API 31, livscykel-API 39 och utbildnings-API 43 PASS. Blockbrowser 6, livscykel 20 och slutlig program 40/terminer 25 (+1 avsiktligt hoppat fall) över bas+omprov PASS; första felomgångar bevarade, 96 cleanupbilagor noll egna kvarvarande verksamhetsrader. Verklig mobilklippning rättad och visuellt återprovad. Typkontroll, lint, skyddat bygge och handbok PASS. Full SQL 2337/2338 FAIL endast känt phase2_audit#13; 05-22:s historiska updated_at är fortsatt PARTIAL. Vanlig 3012 kör 2b45237, befintliga användarplaner återlästa före/efter serverbyte utan ändring. Mänskligt prov awaiting_user. **Hela 05-23 är in_progress**, ADMIN-02/ADMIN-03 är Pending. Nästa nya executorsession C för skolans språkpaket, därefter D/E och 05-25.

**05-22, 2026-10-05:** Tillagda skolor har egna elevplaceringar, klasser och timplansversioner genom befintliga skyddade vägar. Klasskoppling kräver samma skola/fastställd version och flyttas inte av ny version. Skolborttagning nekar befintliga beroenden med konkret besked. Se 05-22-SUMMARY/VERIFICATION och FUNCTION-INVENTORY. Riktad SQL 46/46, timplan/livscykel/register-API 39/39, 39/39 och 18/18, Node 577/577, typ/lint/skyddat bygge/handbok PASS. Browser: 137 beteenden och ett avsiktligt hoppat fall, 112 städningsbilagor: första program 39/40 FAIL följt av oförändrat phone14-omprov 1/1; första elevkort 0/12 med uppsättningsfel bevaras, slutligt 12/12 PASS. Lista 13/13, rolläsningar 5/5, timplan 22/22, livscykel 20/20, terminer 25/25 och ett hoppat fall PASS. Full SQL 1963/1964 FAIL endast äldre phase2_audit#13. Första backfillen ändrade fyra timplans updated_at; gamla tidsstämplar inte återställda, historiskt bevarande PARTIAL. Korrigerad migration helradsprovad med rollback; övriga verksamhetsvärden/ACL bevarade, även efter regressionen. Vanlig 3012 kör ce88748 med äldre klientfiler bevarade; 18 aktuella användarscenarier återlästa utan ändring före/efter serverbytet. Mänskligt prov awaiting_user. ADMIN-04 Pending; skapa klass/timplan/koppla klass ingår ännu inte. Nästa 05-23 steg A för felaktig poängmängd/valblock.

**Följdprov/förenkling, 2026-10-05:** Användaren säger att vyn ser bättre ut men har för många informationsrutor. Analys-/klarstatus-/åtgärdsrutorna har tagits bort; status står vid namnet och Analys visar antal fel/risker. Radmarkeringen försvinner när samma rad är rättad. Terminsprov 25/25 (+1 avsiktligt hoppat), utbildningsurval 2/2 och delad skrivskyddad plan 2/2 PASS, 30 fixturer städade. 8 riktade Node-prov, typ/lint/skyddat bygge/handbok PASS. Dator- och telefonbilder granskade. Vanlig 3012 kör `4b1addc`; endast testanpassning skiljer från terminsprovets `197e5b9`. Öppna flikar laddas inte om automatiskt. Se programplan-compact-ui.json och debug/programplan-analysis-actions.md. Ny mänsklig bedömning väntar; nästa plan förblir 05-22.

**Användarfynd/rättning, 2026-10-05:** Analysens gemensamma åtgärdslänk öppnade ett låst fördjupningsformulär med tom visningsfördelning. Varje åtgärd går nu till rätt rad, sökfält, årskurskort eller datum; skrivskydd förklaras. En sista radändring medan tidigare sparning pågick kunde bli osparad och köas nu korrekt. På `db5fb9b`: 25 körda dator-/telefonprov PASS (+1 avsiktligt hoppat datorfall), nya åtgärdsfall 10/10, cleanup 26/26, Node 571/571, typ/lint/skyddat bygge/handbok PASS. Första misslyckade provomgången bevaras. Vanlig 3012 kör det nya bygget; befintliga användarplaner bevaras och öppna flikar laddas inte om automatiskt. Se debug/programplan-analysis-actions.md och användarprovet. Mänskligt prov efter rättning är awaiting_user, nästa genomförandeplan förblir 05-22.

**05-21, 2026-10-05:** Huvudmannen väljer programplanens skolor; alla kopplade skolor läser samma versioner. Skrivning kräver mandat för alla skolor, och kullkopiering tar med skolvalet. Se 05-21-SUMMARY/VERIFICATION. Riktad SQL 54/54, API 39/39, verkliga lås 3/3, browser livscykel 18/18, program 39/40 + 1/1 omprov, terminer 14/15 + 1/1 omprov (+1 hoppat) och timplan 20/20 PASS; Node 571/571, typ/lint/skyddat bygge/handbok PASS. Full SQL 1917/1918 är FAIL på det äldre phase2_audit-fallet 13. Vid skolprovet körde vanlig 3012 9f80719; det aktuella bygget är db5fb9b enligt följdrättningen ovan. Tidigare syntetiska provdata är bevarade. Mänsklig begriplighet är awaiting_user. Klasser, elevplaceringar och timplaner på tillagda skolor återstår i 05-22.

**Planeringspaketet 2026-10-04–05:** [05-24–05-35](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md) omfattar sammanhållen timtabell och analys. Endast 05-24:s rena GR/IM-analys är genomförd i paketet. 05-19–05-21 har genomförandesammanfattningar; 05-22 och 05-23 har planer. 05-22 och 05-23 A/B/C/D är därefter genomförda; nästa steg är 05-23 E; därefter återgår arbetet till 05-25:s grind. 05-17 saknar PLAN och behöver yrkesregler levererade inför yrkesfastställande. Inga äldre wave-nummer ersätter dessa faktiska beroenden.

**Aktuellt läge 2026-10-04:** 05-18 automatiskt verifierad: poäng per årskurs och termin i skyddad programplansversion, 16 browser / 31 API / 236 SQL. Mänskligt prov väntar på vanlig 3012; ADMIN-02/full fas 5 och fas 4:s checkpoint kvarstår. Delegation och timplansskapande har egna todos.

**Användarprov 2026-10-01:** användaren rapporterar att alla tidigare timplansprov fungerar, registrerat i 05-TIMPLAN-USER-TRIAL.md. Ny regelhandledning och programplansvyn kräver fortfarande mänsklig förståelsebedömning; deras automatiska prov är separata. Fas 4:s checkpoint kvarstår.

Phase: 05 (Bevarade utbildnings- och klassflöden) — 05-01–05-16, 05-18–05-21 och 05-24 automatiskt genomförda; mänskliga prov och full fasverifiering kvarstår. Fas 4 kvarstår på 24 av 25 planer.
Fas 4: 04-01–04-21, 04-23, 04-24 och 04-25 klara; mänsklig checkpoint 04-22 kvarstår separat.
Fas 1: 10 av 10 planer genomförda och verifierade 2026-09-12 (`01-VERIFICATION.md`, status passed).
Fas 2: 12 av 12 planer genomförda och verifierade 2026-09-21 (`02-VERIFICATION.md`, status passed).
**Current Phase:** 05
**Current Phase Name:** Bevarade utbildnings- och klassflöden
**Total Phases:** 8
**Current Plan:** 05-38-READ-PERFORMANCE; därefter 05-39–43. API05-38 actual preflight/slutprov15/247 PASS, 28 entries. Äldre05-25–35 kräver omplanering.
**Total Plans in Phase:** 45 PLAN-filer; ny avgränsad prestandarättning. 05-36–38 har SUMMARY/verifiering, korrektivet och UI05-39–43 återstår. 05-17 saknar PLAN. Mänskliga prov och full fasverifiering är separata.
**Status:** 05-23/E tekniskt PASS lokalt. Grundflödet användarrapporterat godkänt. ADMIN-02/03/04, hela fas 5 och båda nya gapen är Pending; 05-22 metadata PARTIAL består.
**Detailed scope:** Approved — användaren godkände 42 detaljkrav och färdplanens åtta faser 2026-09-11.
**Last Activity:** 2026-10-07
**Last Activity Description:** 05-38 actual preflight/slutprov15/247 PASS och tre exakta läsgrants; 28 entries, 15 helradstabeller och audit bevarade. Prestandarättning/UI följer.

**Senaste förtydligande:** Jev och liknande AI ska utvärderas för schemamodulen, inte specificeras som obligatorisk produktfunktion. SCHEMA-05 och S2 anger jämförelse mot samma motor utan AI och dokumenterad rekommendation; att avstå är ett giltigt utfall. Kunden ska kunna köpa moduler var för sig. MODUL-01–04 tillagda för separat modultillgång/personmandat, externa databeroenden och tillägg/avslut med bevarade ID:n/historik. S1/S4 utökade med kontrakt och provmål; modulkatalog, priser och beställnings-/betalningsprocess återstår.

**Historiska genomförandebevis, 2026-10-04:** Terminer 16/16, programplaner 40/40 och kompletterat API 31/31 PASS; SQL 236/236 och Node 417/417 PASS. Timplan 20 beteenden PASS över 19+1, externa setupfel bevarade separat. Typ/lint/skyddat bygge/handbok PASS, fyra terminsbilder granskade. Vanlig 3012 kör d37f566; inga produktkälldifferenser från d1f34ca där terms/program prövades. Läs 05-18-SUMMARY/REVIEW. Mänskligt prov väntar.

**Tidigare genomförandebevis, 2026-10-02:** 05-15/05-16 har samma program → inriktning → programfördjupning för nya och befintliga utbildningar. På `023e68b`: programbrowser 38/38, timplan 20/20, nya utbildnings-API 43/43, 128 riktade Node-prov, typ/lint/bygge/handbok PASS. Tio bilder granskade. Vanlig 3012, nio bevarade utbildningar och fyra lokala inloggningar verifierade. Ny mänsklig begriplighetsbedömning väntar; gemensamma paket är en pending todo.

**Tidigare verifiering:** SQL-policy, personbundna tilldelningar, inbjudningar, återkallelse och lokal IT-konfiguration inkopplade. 510 SQL-prov och verkligt samtidighetsprov PASS; 277 modell-/serverprov och 15/15 isolerade API-fall PASS, mandat-/auditfallet utökat till 24 kontroller; giltig verksamhetsinbjudan rättad. Läs 03-04-SUMMARY: Worker-audit/gallring prövade (Worker-API i föregående miljö); källrapporten är sedan 2026-09-26 PASS lokalt på återskapad stack.

Progress: [████░░░░░░] 38%
Planinventering 2026-10-07 efter 05-38: 99 skrivna PLAN-filer; 81 genomförda inklusive separat paketborttagning. 18 återstår: 04-22, 05-25–35, prestandarättning och 05-39–43. En SUMMARY godkänner inte automatiskt fulla krav eller hela fasen; 3 av 8 faser är verifierade.
Phases executed: 3 of 8 (fas 1–3 verifierade lokalt med syntetiska uppgifter)

## Performance Metrics

**Velocity:**

- Completed plans with execution summary: 81 (inklusive separat genomförd paketborttagning)
- Partial plan summary: Ingen aktiv; 05-23 A–E avslutad enligt aktuell ram
- Average duration: Ej tillämpligt
- Total execution time: Ej sammanräknad; registrerade uppgiftstider finns nedan.

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | 0 | - | - |
| 3 | 7 | - | - |

**Recent Trend:**

- Last 5 plans: 05-18, 05-19, 05-20, 05-24 och 05-21 automatiskt genomförda; nytt mänskligt begriplighetsprov återstår.
- Trend: Ej tillämpligt

| Phase 01 P01 | 5min | 2 tasks | 3 files |
| Phase 01 P02 | 6min | 2 tasks | 1 files |
| Phase 01 P04 | 5min | 2 tasks | 3 files |
| Phase 01 P03 | 6min | 3 tasks | 10 files |
| Phase 01 P05 | 18min | 3 tasks | 7 files |
| Phase 01 P06 | 25min | 2 tasks | 4 files |
| Phase 01 P07 | 48min | 3 tasks | 5 files |
| Phase 01 P08 | 20min | 2 tasks | 6 files |
| Phase 01 P10 | 8min | 2 tasks | 3 files |
| Phase 01 P09 | 10min | 3 tasks | 4 files |
| Phase 03 P04 (fortsättning 2026-09-26) | 20min | 2 tasks | 6 files |
| Phase 03 P05 (fortsättning 2026-09-26) | 27min | 2 tasks | 26 files |
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 03 P06 | 50min | 2 tasks | 11 files |
| Phase 03 P07 | ca 3h exkl. användarprov | 2 tasks | 43 files |
| Phase 04 P10 | 25min | 2 tasks | 5 files |
| Phase 04 P14 | ca 35min | 2 tasks | 4 files |
| Phase 04 P23 | ca 35min | 2 tasks | 5 files |
| Phase 04 P13 | 22min | 2 tasks | 10 files |
| Phase 04 P15 | 20min | 2 tasks | 5 files |
| Phase 04 P25 | 50min | 3 tasks | 6 files |
| Phase 04 P24 | ca 30min | 3 tasks | 11 files |
| Phase 04 P17 | 20min | 2 tasks | 14 files |
| Phase 04 P19 | ca 2h inklusive fulla browseromprov | 2 tasks | 5 kod-/provfiler |
| Phase 04 P20 | flera fulla lokala omprov | 2 tasks | fasgrind, provhjälp, intern beviskarta och miljöskript |

## Accumulated Context

## Decisions Made

- 2026-10-06: Valt planeringsläsår/skola följer med inom program-/timplaner och framtida planeringsmoduler. Elevregister/löpande administration har separat urval; inget planeringsår skapar placeringar, klasskopplingar eller ändrar mandat. Nya/fortsättande kullar ses tillsammans. GSD-planering beställd; 05-36–43 är ännu inte genomförda.

- 2026-10-05: Användaren beställer utformning och genomförande av övergång programplan → timplan. Komplett sparad högskoleförberedande ram kan ge ett förberedande skolutkast före formellt beslut; exakt källa fryses och timmar planeras separat. Paket återinförs inte. Gamla 05-25–35 ska omplaneras mot aktuell kod och upptagna migrationsnummer.

Fullständiga beslut finns i PROJECT.md.

| Phase | Summary | Rationale |
|-------|---------|-----------|
| 05 |Paketens placering 2026-10-05: tas bort från programplanerna enligt uttrycklig beställning. Ram/terminer/skolor och äldre data bevaras; separat utbud/organisation planeras senare. Gemensam terminsram innebär inte automatiskt parallellt schema|Senare användarbeslut ersätter D-14 och det gamla schemafönsterantagandet i D-05; se REMOVE-PACKAGES-PLAN|
| Init | 42 detaljkrav och åtta faser godkända 2026-09-11 | Användarens uttryckliga ja till kravförslaget och färdplanen |
| 05 | Valbara block 2026-10-04 (05-23, D-01–D-19): svenska/SvA som egna rader per nivå; valbara block med exakt ett paket och gemensam terminsram för moderna språk, HU/NA-val, programfördjupning och individuellt val; planen bestämmer blocken och skolan väljer paketen; huvudman, rektor och skoladministratör får skapa valpaket; utbudet får ändras när som helst; nivåordning är fel om den högre nivån börjar före den lägre och risk vid överlapp. 2026-10-05: paketstorlek efter blockets poäng (D-16), paketval även i ersatt version men inte i arkiverad (D-17), läsrätt för skoladministratör (D-18), saknade rättigheter i individuellt val är risk (D-19) | Användarens svar på frågor i chatten; se `phases/05-…/05-23-CONTEXT.md` |
| Init | Säker administration inför pilot är första milstolpen | Användarval 2026-09-10: inloggning, behörigheter, elevregister och en kommunintegration |
| 1–5 | Bevara gymnasieutbildningar, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar | Uppskattade befintliga arbetsflöden |
| 3 | Huvudmannen utser rektor; rektor tilldelar läraruppdrag inom sitt mandat | Användarens ansvarsfördelning |
| 3 | Syntetisk elevläsning öppnas för Workern först efter API-bevis för committad händelse per läsform och stopp vid loggfel (03-05) | Användarens loggpolicy: obligatorisk loggning, annars stoppas åtgärden |
| 3 | Elev-/ärendeurval i tilldelningsformuläret endast för rektor; elevhälsoansvarigs elevinsyn är öppet beslut | Ingen roll får mer elevinsyn än dess mandat ger |
| 7–8 | Syntetiska prov ersätter inte faktisk kommunanslutning eller beslut om verklig användning | Godkänd färdplans avgränsningar; etablerad informationshantering kan användas utan egen publik diarietjänst |

- [Phase 03]: Storage-källan korreleras via Kong-tvingad X-Client-Trace-Id (Storage allowlistar headern); Postgres-källan konfigureras lokalt med ALTER SYSTEM (SQLSTATE/PID/session/rad/roll, ingen statementtext); Kong-konfigurationsförlust efter omstart rapporteras som lucka men förhindras inte
- [Phase 01]: Docs committades separat (383b3e0) före appbaslinjen; taggen fas1-baslinje (917313b) omfattar bara web/, supabase/config.toml, sex migrationer och work/
- [Phase 01]: web/.openai/hosting.json spåras (importeras av vite.config.ts, endast null-värden); resultatfilen från verify-baseline.mjs har extra fält errors[]
- [Phase 01]: Provmiljöns organisation och 24 elever står som Syntetiskt exempel i anslutningsprofilen; partner, volym, källa, IdP, kontokälla, leverantör och drift är öppna beroenden OB-01–OB-08 med beslutsägare
- [Phase 01]: Pilotfixturens tillstånd anges som 'Huvudmannens beslut' (kommunal huvudman); likhetstestet jämför timplaner strukturellt eftersom timplan-model sätter ID:n med uid()
- [Phase 01]: Klientgränsen skapar ingen Supabase-klient i fas 1; hasBackend är konstant false och laddarna är rena läsningar utan demoinloggning eller seedning (seedExample* är den uttryckliga vägen)
- [Phase 01]: Exempelläget startas/byggs via run-mode.mjs med tomma Supabase-strängar i miljön så att .env.local aldrig läcker in; bygget märks i dist/build-mode.json
- [Phase 01]: Lokala provmål: CLI:ns .temp-cache tas bort ur målens workdir; supabase_admins defaultprivilegier i public kan inte ändras av postgres och lämnas (gäller ej migrationsskapade objekt)
- [Phase 01]: Karantänen 20260911120000 stänger anon/authenticated/PUBLIC i public och Storage-policyerna tillstand_* utan att radera rader; bevisad med 52 pgTAP-prov (All tests successful) mot protected-målet
- [Phase 01]: API-provet tar bort sin egen signup-provanvändare som postgres före ögonblicksbilden; baseline-provets anonyma sessionsanvändare lämnas (refereras av organisation_events, loggrader raderas inte av prov)
- [Phase 01]: Karantänen bevisad via API-vägen: 58 nekade/0 tillåtna för anon, gammal anonym HM-profil (mintad JWT) och provkonto; fyra baslinjeflöden PASS i baseline-målet
- [Phase 01]: Laddnings- och sparstatus i provvyn använder <output> (implicit role=status) enligt lintregeln och .admin-notice-konventionen; ny elev måste få en klass vid vald exempelskola
- [Phase 01]: Vald exempelskola ägs av sidan (activeUnitId); organisationsvyn rapporterar skolbyte uppåt och elevvyn filtrerar på unitId — ingen remount, ändringar bevaras vid byte
- [Phase 01]: Playwright 1.63.0 med egna servrar per projekt (reuseExistingServer false) och VINEXT_NO_DEV_LOCK=1 för dev-servrarna; browserproven väntar in Reacts hydrering innan de interagerar
- [Phase 01]: Isolering mäts som förbjudna sökvägar + inga främmande värdar + inga sb-nycklar; 'supabase' räknas bara på främmande värd i dev (modulen /lib/supabase.ts laddas från egen värd) men förbjuds helt i det byggda paketet
- [Phase 01]: Pekyteprovet i phone lämnas rött: skolväljaren är 26 px i WebKit (appearance:auto på select); rättning i globals.css är uppskjuten till UI-arbete, prövas på fysisk telefon i 01-09
- [Phase 01]: Sparordningsfelet reproduceras i save-order.repro.mjs (utanför testglobben) mot riktiga persistTimplans/loadTimplans med fake-PostgREST, fördröjd första upsert och FK-emulering; 2/2 scenarier röda, KNOWN-ISSUE med ägare fas 5
- [Phase 01]: verify:phase1 committas med totalstatus FAIL: browsersteget är obligatoriskt och det kända pekyteprovet är rött; ingen filtrering eller KNOWN-ISSUE-väg för Playwright infördes — 01-09 avgör hanteringen
- [Phase 01]: Pekytefelet i WebKit rättades i globals.css (564d067) i stället för en KNOWN-ISSUE-väg för Playwright; verify:phase1 omkörd i sin helhet → PASS
- [Phase 01]: Kravstatus går Pending → 'Genomförd — väntar verifiering' först efter användarens godkända checkpoint; Verifierad sätts bara av gsd-verifier
- [Phase 01]: Konkurrerande sparningar och redigering efter skapande står som KNOWN-ISSUE med ägare fas 5 och stoppvillkor; grön fasgrind gör dem inte till godkänd funktion
- [Phase 03]: 03-06: verify-mandates kör exakt 25 namngivna fall med källbevis; delurval ger PARTIAL, aldrig PASS
- [Phase 03]: 03-06: verify:phase3 är fail-closed; miljöhinder (stoppat mål, upptagen port, kvarlämnat lås) ger BLOCKED, fas 3-mandatspecen i 03-07 måste ha titlarna i MANDATE_BROWSER
- [Phase 03]: 03-07: engångskod anges vid inloggning för den som har registrerad kod; övriga loggar in med lösenord; beviset gäller 8 h och step-up är reserv (användarbeslut 2026-09-27)
- [Phase 03]: 03-07: tidsbegränsad support kan gälla en namngiven elev eller en eller flera grupper på en skola; högst 60 minuter, syfte, rektorsgodkännande och ingen export oförändrat (användarbeslut 2026-09-27)
- [Phase 03]: 03-07: användarprovet 2026-09-27 godkänt som syntetiskt användarprov (dator; telefon i enhetsläge/WebKit); det godkänner inte verklig drift, IdP eller kommunanslutning
- [Phase 04]: 04-10: Exportkropp {mode:'preview'|'download', export}; preview utan MFA lämnar bara antal, nedladdning kräver MFA och räknar om urvalet
- [Phase 04]: 04-10: Worker-EXECUTE för change/resolve/reveal/export förblir stängd; separat grant-migration med ACL-fixturer och verkligt API-prov krävs före 04-13/04-16
- [Phase 04]: 04-14: Äldre fas 3-fixturer skapar samma elev-/grupp-/ärende-ID i registret (inga phase3_probe-elevrader); elevläsning prövas via phase4_list_pupils/pupil_card/exportpreview
- [Phase 04]: 04-14: Fallet 'phase3_read_pupils öppen för Worker' vändes avsiktligt till stängd; positivt Worker-fall via phase4_list_pupils. Dubbel samtidig klass ersatt av tidigare klassperiod (registret tillåter en klass åt gången)
- [Phase 04]: 04-23: Worker får EXECUTE på exakt phase4_change_pupil, phase4_resolve_source, phase4_reveal_personal_number och phase4_export_pupils (migration 20260929170000, tidsstämpel efter 163000 i stället för planens 090000); PUBLIC/anon/authenticated stängda, ACL-kontraktet prövar exakt Worker-mängd för phase4_*
- [Phase 04]: 04-23: Verkligt Worker-prov 9/9 PASS med lokalt mintade sessioner och testrealmens bevisprofil (ingen interaktiv IdP); icke-deterministiskt Wrangler-avbrott på nekade anrop uppskjutet till deferred-items
- [Phase 04]: 04-13: Elevkortet hålls i arbetsytans minne; elev-ID aldrig i adressen
- [Phase 04]: 04-13: Konfliktval skickar bara uttryckligt valt eget värde; sparat värde förvalt och skrivs inte
- [Phase 04]: 04-13: Export skickar protectedIds=[] tills listan får skyddsflagga per rad; skyddade elever utelämnas
- [Phase 04]: 04-15: phase3_boundaries/-connections/-audit portade utan kontraktsändringar; nya fas 4-gränsprov är tillägg
- [Phase 04]: 04-15: phase3-fixtures.sql skriver inte i phase3_probe_pupils/-groups/-group_members; placering/klassmedlemskap skapas bara för elev utan sådan rad, inget raderas
- [Phase 04]: 04-25: Worker-avbrotten orsakades av nekande med oläst begärandekropp; denyResponse loggar först, läser sedan kroppen till slut (högst 1 MiB, ingen buffring) och svarar sist. Grindar klassar avbrott med phase4-worker-stability.mjs; avbrott blir aldrig PASS.
- [Phase 04]: Listan ger skyddsflagga och protectedIds (hela urvalet) bara till administratör med skyddsbehörighet på skolan; obehörigas svar oförändrat (04-24, migration 20260929180000)
- [Phase 04]: Exportens skyddsval är aldrig förvalt, återställs vid målbyte och prövas om av servern (användarbeslut 2026-09-28)
- [Phase 04]: 04-17: Elevprovet avvecklat (migration 20260930100000); phase3_probe_cases, phase3_probe_scope och phase3_pupil_in_scope behålls och läser bara registret; /api/prov borttagen men kvar som loggklass

## Pending Todos

- 2026-10-06: [årskursknappar i mobilens timplan](todos/pending/2026-10-06-arskursknappar-i-mobilens-timplan.md). Programplanens knappar är positivt användarbedömda; motsvarande dropdown önskas ersatt. Trolig målvy är gymtimplanen, att kontrollera inför avgränsad rättning. Samordnas med 05-41 utan att ändra läsårs-/versions-/sparregler.

- 2026-10-06: [rektor färdigmarkerar och huvudmannens representant godkänner planarbete](todos/pending/2026-10-06-rektor-fardigmarkerar-och-huvudmannen-godkanner-planarbete.md). Verklig lucka i aktuellt skyddat flöde; komplettera 05-25/26 och samordna med 05-32/33 vid omplanering. Ingen implementation/verifiering påstås.

- 2026-10-06: [tabellöversikter med sökning, filtrering och sortering för programplaner och timplaner](todos/pending/2026-10-06-tabelloversikter-med-sokning-filter-och-sortering-for-planer.md) beställt. Timplanernas startlista ska följa programplanernas tabellprincip; båda översikterna ska kunna sökas, filtreras och sorteras över hela det behöriga urvalet. Genomförande och dator-/telefonprov återstår; aktuell fasordning och kravstatus behålls.

- 2026-10-05: [integration av Skolverkets lärarlegitimation och undervisningsbehörighet](todos/pending/2026-10-05-integrera-skolverkets-lararbehorigheter.md) genomgången i [researchunderlaget](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md). Föreslagna mål LLEG-01–04 följs till L1 kontrakt/personmatchning, L2 XML-import, L3 tjänstefördelning/schema och L4 faktiskt anslutnings-/driftprov, med koppling till S1–S4. Lokala uppdrag och systemåtkomst hålls skilda från myndighetsbehörighet. API-åtkomst, omfattning, genomförandeplaner och alla integrationsprov återstår. Pilotens krav och nästa 05-22 behålls.

- 2026-10-05: [sammanhållen analys för programplan, timplan och schema samt APL-genomgång](todos/pending/2026-10-05-samordna-plananalys-schema-och-apl.md) beställd. Gemensam analys och åtgärdslänkar kopplas till fas 5; schemakorrelation till S1/S4. APL:s regelprofiler, tidsberäkning, placering och uppföljning behöver utredas och avgränsas. Planerad, schemalagd och genomförd tid samt lärande hålls isär. Genomförande och prov återstår; aktuell planordning behålls.

- 2026-10-04: [valbara paket i programfördjupning och individuellt val](research/VALPAKET-PROGRAMFORDJUPNING-IV-2026-10-04.md) utrett. Förslaget har tre lager (skolans valpaket, programplanens valblock, elevens val) och kopplar till paket-todon från 2026-10-02. Benämning, omfattning av första leveransen, mandat och nivåordningens kategori väntar på användarbeslut.

- 2026-10-04: gap – [komplettera programplanens analys](todos/pending/2026-10-04-komplettera-programplanens-analys.md): Svenska/SvA och Moderna språk saknar terminer, överlappande nivåer i fördjupningen, nivåordning per termin, fel regelhänvisning för gymnasiearbetet samt kontrollpunkter för individuellt val, APL och moderna språk. Underlag: `research/PROGRAMPLAN-ANALYS-LUCKOR-2026-10-04.md`.

- 2026-10-04: gap – [inriktningens nivåer före tillåten start](todos/pending/2026-10-04-inriktningens-amnen-fore-tillaten-start.md). Analysen ska fånga inriktningsnivåer i åk 1 utom på ES/FR/IN/NB (gymnasieförordningen 4 kap. 2 §). Planering, genomförande och prov återstår.

- 2026-10-03: gap – [bakåtknapp efter inloggning visar rå JSON-koden login_state_invalid](todos/pending/2026-10-03-baktknapp-efter-inloggning-ger-login-state-invalid.md). Avvisningen är korrekt men ska skicka användaren vidare till en sida med begripligt besked. Fasplacering, rättning och prov återstår.

- 2026-10-03: [ange årskurser och terminer för programplanens poäng](todos/pending/2026-10-03-fordela-programplanens-poang-pa-arskurser-och-terminer.md) genomfört och automatiskt verifierat i 05-18. Mänskligt begriplighetsprov väntar. Koppling till framtida timplansskapande och administratörsdelegation ligger i egna todos.

- 2026-10-03: [skapa timplaner direkt från programplaner](todos/pending/2026-10-03-skapa-timplaner-fran-programplaner.md) beställt som nästa flöde efter programplansarbetet. Användaren har preciserat att vald programplansversion ska vara godkänd och fastställd. Timplanen ska kunna redigeras av rektor och skoladministratör inom respektive skola. Genomförande och verifiering återstår.

- 2026-10-03: [huvudmannen ska kunna delegera programplansarbete till rektor och skoladministratör](todos/pending/2026-10-03-huvudmannen-delegerar-programplansarbete-till-skolorna.md) beställt. Skolavgränsad tilldelning/återkallelse och serverkontroller ska planeras i fas 5; arbetsmoment och eventuell beslutsrätt behöver preciseras. Genomförande och verifiering återstår.

- 2026-10-02: [skolgemensamma programfördjupningspaket över flera programplaner](todos/pending/2026-10-02-gemensamma-programfordjupningspaket-over-flera-programplaner.md) beställt. Gemensamt utbud, explicit plan-/paketversion och elevval ska skiljas åt; regler prövas för varje målprogram. Funktionen är inte implementerad.

- Användartermen ska vara programplan/programplaner, inte poängplan/poängplaner (beslut 2026-09-29). Skyddad navigation rättad i 05-06; bredare namnbyte i äldre vyer kvarstår som separat UI-todo, länkat till den samlade UI-genomgången.

- 2026-09-29: kommunval från sökbar lista samt sex uppgifter för ersättning/fakturering mot hemkommun tillagda. Se `.planning/research/HEMKOMMUN-ERSATTNING.md` för primärkällor, rekommenderad ordning och öppna beslut. Detta är framtida planeringsunderlag; fas 4:s öppna checkpoint och fastställd milstolpe kvarstår.

- 04-22: första provdelen och källavvikelse bekräftade av användaren. Klasstillhörighetens datum/presentation har anmärkning; samtidiga ändringar, skyddsbehörighet och separat personnummervisning återstår. Samlad UI-genomgång tillagd som todo 2026-09-29.

- SPAR-synk för elever och vårdnadshavare: befintlig todo kompletterad 2026-09-29 med möjlig Skatteverkskälla, utredning av faktisk anslutningsväg och uttrycklig hantering av källavvikelse mot lokal rättelse. Ingen ny anslutning eller utökning av fas 4 beslutad genom todo-posten.

- 04-22: användarprovet förberett i lokal skyddad app på 3012. Se `04-HUMAN-UAT.md`; mänskliga resultat och godkännande väntar. Planen är inte slutförd.

- Fas 4:s nästa steg: våg 15, 04-22, genomför mänskligt användarprov och redovisar fasens gräns. Våg 14:s handbok och förnyade fulla grind passerade lokalt syntetiskt; se `04-21-SUMMARY.md` och `04-WAVE-14-SUMMARY.md`. Därefter återstår separat `gsd-verify-work`/fasverifiering. Ingen kommunal anslutning eller verklig pilotdrift har verifierats.
- 29 todos under `.planning/todos/pending/` (inventerat 2026-10-05; lärarregisterspåret tillagt). Läsårslinsen ingår bara i den avgränsade omfattning som anges i fas 4:s CONTEXT; övrigt kvarstår.
- 2026-10-01: [rektors handledning om timplanens regelverk](todos/pending/2026-10-01-handledning-for-rektor-om-timplanens-regelverk.md) beställd. Vägledning i vyn och vid ändring ska förklara tillämpliga ramar, konsekvenser och beslutsansvar med daterade primärkällor. Planering och användarverifiering återstår.
- 2026-10-01: befintlig schematodo utökad till [sammanhängande schemadelprojekt](research/SCHEMAMODUL-PROJEKT.md). SCHEMA-01–08 har ansvar i S1–S4 och ännu ej provade verifieringsmål. Program-/tim-/studieplaner, grupper och kalender ska samverka; roller/regler och valbara moduldelar utreds från början, med Rustprototyp och utvärdering av Jev/liknande AI för möjlig användning i schemaarbetet. AI-införande är inte beslutat. Delprojektets första steg är S1 kontrakt/mandat; dess genomförandeplacering är öppen. Fas 5 ska beakta gemensamma ID:n, versioner, enheter och ändringsansvar nu. Ingen ny numrerad pilotfas eller ny rättighet införd.

## Blockers

Inga kända blockerare för fas 4:s planering och lokala syntetiska genomförande. Externa pilotbeslut nedan hindrar verklig anslutning/drift, inte denna fas.

## Externa beroenden och verifieringsramar

- Pilotkund, IdP, kontokälla, registerleverantör, åtkomst och acceptansvillkor är öppna; IAM-02, IAM-06 och INT-07 kräver faktiska anslutningsprov.
- Elevfält, skrivansvar, skyddsfall och rättigheter för fas 4:s syntetiska arbete är beslutade i `04-CONTEXT.md` (D-01–D-20). Verklig pilotvolym samt spärr-/återställningsmål återstår.
- Drift, avtal, informationshantering och pilotbeslut krävs före verkliga elevuppgifter. Dessa externa beroenden hindrar inte planering eller avgränsade syntetiska utvecklingsprov.
- Fas 1–3 har verifierat demoavskiljning, direkta datavägar och loggning lokalt syntetiskt. Fas 4 måste bevara och pröva dessa skydd på registrets nya vägar.
- Kodkartan 2026-09-11 belägger risker med överlappande sparningar, flerstegsskrivningar och breda databasmandat; ta med .planning/codebase/CONCERNS.md i berörd fasplanering.
- Git-baslinjen är verifierad: taggen fas1-baslinje (917313b). Kodkartläggningen i 1a8e1e0 är historik före fas 1.
- Senaste sparade fasverifiering: fas 3 `passed`, kompletterad med mänskligt prov 2026-09-28. Rapporten redovisar 565 SQL-prov och 337 modell-/server-/grindprov; detta är sparade bevis, inte omkörningar vid återupptagen planering. Worker-avbrottets reproducerbarhet och externa beroenden kvarstår enligt rapporten.

## Deferred Items

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Produktvision | Studieplaner, schema, undervisning, ärenden, vårdnadshavare, fler anslutningar, egen drift och eventuell diarietjänst | Se v2 Requirements | 2026-09-10 |
| Schemadelprojekt | Sammanhängande planmoduler, specifika mandat/regler, Rustprototyp, AI-utvärdering för schemat och valbara moduldelar | SCHEMA-01–08 och S1–S4 dokumenterade; kompatibilitet beaktas i fas 5, detaljerat genomförande återstår | 2026-10-01 |

## Session

**Last Date:** 2026-10-07
**Stopped At:** 05-38 avslutad actual15/247 PASS. Fortsätter autonomt med prestandarättning/UI tills konkret användarprov enligt beställningen. Ordinarie3012 består; alla övriga krav/gap är öppna.
**Resume File:** [Läsårsplaneringens genomförandesteg](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-IMPLEMENTATION.md)

**Planned Phase:** 5 — 05-38-READ-PERFORMANCE före UI05-39–43. Äldre05-25–35 kräver omplanering; besluts-/mobilgap samt fulla krav kvarstår.

### Senaste användarfynd, 2026-10-02

Programplansvyn fick ett misslyckat mänskligt begriplighetsresultat: ”programplanerdelen är ju fullständigt obegripligt UI. fattar noll.” 05-13 ska visa ämnen, nivåer och poäng först och ge tydlig nästa åtgärd; historik och tekniska källuppgifter blir sekundära. Verifierad explicit käll-/startbindning, servermandat, MFA, revisionskonflikter, osäkra sparsvar och användarens lagrade data bevaras. Kodknapp för tre syntetiska MFA-provkonton är färdig och verifierad separat, bara i den lokala test-IdP:n. 05-13 är nu automatiskt genomförd; ny mänsklig bedömning väntar.

**Senaste användarstyrning:** ”måste vara extremt pedagigisk”. Genomfört som hjälp vid första läsningen och vid varje uppgift, med numrerat start–val–spara-flöde. Detta är inget mänskligt begriplighetsgodkännande.

Historik före senaste underkännande: ännu mer pedagogik och fler gymnasieprogram genomförd i 05-14 med separat granskning och additiva exempel. Tidigare tre samtidiga dialogdelar ersätts av två användarsteg. Mänskligt godkännande väntar.

## Aktiv användarrättning — 2026-10-02

05-14:s mänskliga prov är underkänt som rörigt och osammanhängande. Användaren vill ha program → inriktning → programfördjupning och samma UI för nya/befintliga utbildningar. Historisk frontend läst och visuellt jämförd; se 05-PROGRAMFLOW-HISTORICAL-REVIEW och 05-15-FLOW-CONTEXT. 05-15 har verifierat atomiskt skapande för huvudmannen och säkert kvitto; 05-16 använder samma arbetsyta och ämnesgrupperade fördjupningsval. Ingen rektorsbehörighet eller nationell beslutsrätt utvidgas. Tidigare automatiska prov ovan är historik.


## Historiska automatiska bevis och överlämning — 2026-10-02

05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

Tidigare 05-14-introduktion/dialog/kort ovan är historik. 05-16-SUMMARY är aktuellt användarbeteende. Den generella Wrangler-proxyfrågan är öppen; vanlig lokal preview använder direkt workerd utan denna proxy.


## Telefonprov på samma wifi — 2026-10-02

2026-10-02: Användaren vill prova på fysisk telefon och bekräftar samma wifi. Separat tidsbegränsad, åtkomstlänkavgränsad LAN-ingång på port 3013 är implementerad och kör. App/IdP/kodhjälp behåller loopback och befintligt skyddat bygge 023e68b. Tio HTTP-gränsprov och tre verkliga OIDC/MFA-/programvals-/utloggningsfall genom wifi-adressen PASS (dator rektor, WebKit rektor/huvudman); inga utbildningar eller planer skrevs av dessa prov. QR-kod genererad och avkodningskontrollerad; länk/QR är privata och ignorerade. Fysisk telefonåtkomst och mänsklig begriplighet är fortsatt awaiting_user. Se work/pilot/MOBILE-PREVIEW.md och results/mobile-preview.json.
