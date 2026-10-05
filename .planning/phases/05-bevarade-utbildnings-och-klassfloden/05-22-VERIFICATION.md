---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "22"
verified: 2026-10-05T11:03:49Z
status: human_needed
score: "5/5 verksamhetsbeteenden har lokalt kod-, SQL- och körbevis; historisk helradsbevaring är PARTIAL"
browser_verification: passed_with_separate_retest
migration_preservation: partial
human_verification_status: awaiting_user
requirements: [ADMIN-04, ADMIN-02]
open_deviations:
  - "Första lokala backfill ändrade updated_at för fyra timplaner. Verksamhetsvärden bevarades, men gamla tidsstämplar är inte återställda."
  - "Full SQL-svit är FAIL 1963/1964: äldre phase2_audit #13 förväntar annan feltext."
human_verification:
  - test: "Bedöm elevkortets utbildningsbyte på en tillagd skola och skolborttagning som nekas på grund av befintliga kopplingar."
    expected: "Rätt skola och utbildning framgår, daterade placeringar är begripliga och beskedet förklarar varför skolan måste vara kvar."
    why_human: "Automatiska flödesprov och bildgranskning ersätter inte användarens verksamhetsbedömning."
---

# 05-22 — verifiering av full skolkoppling

Målet i `05-22-PLAN.md` är att en tillagd skola kan använda utbildningen för sina elever, klasser och timplaner enligt D-06. Oberoende läsgranskning fann inga blockerande fel i slutlig produktkod. De fem verksamhetsbeteendena har lokala syntetiska kod-, SQL- och körbevis. **Historisk helradsbevaring är PARTIAL**, full SQL-svit är fortsatt **FAIL**, och mänsklig begriplighetsbedömning är **awaiting_user**. Detta godkänner inte hela ADMIN-04, fas 5 eller verklig pilotdrift.

Ingen tidigare 05-22-VERIFICATION fanns. Granskningen utgick från planens must-haves, aktuell kod, funktionsinventeringen och råa körresultat; SUMMARY behövde inte tas som bevis. Genomföraren körde testerna. Granskaren läste resultat, kontrollerade källkopplingar och granskade utvalda bilder, utan egna DB-mutationer eller serverstarter.

## Beteenden och bevis

| Must-have | Status och faktiskt stöd |
|---|---|
| Elever på tillagd skola kan placeras i utbildningen; registret visar skolans utbildningsval | VERIFIED. `phase4_validate_selection`, `phase4_list_pupils`, utbildningsetiketter och `phase4_change_pupil` använder `offering_units`. Mandat, kund, skydd, period- och revisionskontroller finns kvar. Nya elevkortsfallet passerade på dator, telefon och 320 px: delad utbildning visas, byte sparas genom Worker, skol-ID behålls, två daterade perioder läses om och okopplad utbildning nekas utan dataändring. |
| Klasser på tillagd skola får referera utbildningen; okopplad skola nekas | VERIFIED. Ny sammansatt FK för `school_classes` pekar på `offering_units(offering_id,unit_id,organizer_id)`. Riktad pgTAP provar både tillåten B och nekad okopplad skola. Appkommando för att skapa klass ingår ännu inte. |
| Timplaner och versioner hör till en skola; klasskoppling kräver egen skola och fastställd version; ny version flyttar inte kopplingen | VERIFIED. `timplans.unit_id` är obligatorisk med sammansatt FK; versionsunikhet samt öppen/fastställd version gäller per utbildning och skola. `validate_class_timplan` jämför timplanens och klassens skola och behåller status-/kolumnkontroller. SQL provar två skolors version 1, nekat korsskoleval och att ny fastställd B-version lämnar befintlig koppling till den tidigare versionen. Nya timplansfallet visar B:s namn, sparar B:s timmar/revision och nekar läsning/skrivning av A på dator/telefon. |
| Skola med klasser, elevplaceringar eller timplaner kan inte tas bort från utbildningen | VERIFIED. SQL-dispatcherns `units`-kommando kontrollerar alla tre beroenden före radering och returnerar `programplan_in_use`; FK bevarar också referensintegritet. SQL provar varje beroende. L10 på dator/telefon bevisar verklig HTTP 409, tydligt verksamhetsbesked, oförändrad utbildningsrevision och bevarad B-koppling efter omläsning. |
| Huvudskolans register- och timplansflöden fungerar som förut och verksamhetsvärden bevaras | VERIFIED för verksamhetsflöden; PARTIAL för den första migrationens fulla timplansrader. Fas 4:s register-API 18/18 samt elevkort 12/12, lista 13/13 och rolläsningar 5/5 är omkörda. Timplan-API 39/39 och browser 22/22 passerar. Befintliga klasser, placeringar, timvärden och klasskopplingar har identiska före-/efterhashar. Fyra timplans `updated_at` ändrades vid den första backfillen; detta får inte räknas som fullradsbevaring. |

De fem verksamhetsbeteendena har bevis, men den sista radens separata bevarandekrav har en kvarstående metadataavvikelse. Score avser därför verksamhetsbeteendena och är inte ett påstående om att alla planvillkor är utan avvikelse.

## Artefakter och kritiska kopplingar

| Artefakt eller koppling | Granskning |
|---|---|
| `20261004140000_phase5_offering_unit_linkage.sql` | Substantiv och inkopplad: nya FK läggs till NOT VALID, valideras och gamla FK tas först därefter bort. Fyra registerdefinitioner och befintlig utbildningsdispatcher ersätts. |
| `20261004141000_phase5_timplan_units.sql` | Substantiv och inkopplad: explicit skolkolumn, backfill, NOT NULL, validerad FK, skolvis unikhet/index, klasskontroll och scope/lista/läsning. Slutlig källa stänger endast `timplans_touch` under backfill och återaktiverar direkt. |
| Elevkort → skyddad registerrutt → `phase4_change_pupil` → skolbunden placering | Befintliga formulär och `pupil-register.ts` anropar de ersatta funktionerna. Nytt browserfall kontrollerar exakt skolbundet utbildnings-ID, verklig sparrespons, historiska perioder, audit och omläsning. |
| Timplansarbetsyta → `/api/timplaner/*` → `phase5_timplan_scope` → `t.unit_id` och aktuellt rektorsmandat | Worker-rutterna använder oförändrade SQL-signaturer. Skrivfunktionen ärver den nya skolan genom scope; den behöver inte ersättas. B:s rektor får endast B:s plan. |
| Skolor-dialog → livscykelrutt → SQL:s beroendekontroll → konkret felbesked | Befintlig servermappning ger HTTP 409 för `55006` + `programplan_in_use`. Dialogen har särskilt besked för skolborttagning och läser om aktuellt läge. |
| Handbok | `programplaner.md` och `timplaner.md` beskriver egna skolkopplingar, bevarad klassversion, borttagningsbegränsning och att skapa klass/timplan/koppla klass ännu saknas i appen. Dokumentationsbygget passerar. |

Funktionsinventeringen i `05-22-FUNCTION-INVENTORY.md` bygger på före-definitioner från `pg_get_functiondef` på det skyddade lokala målet. Huvudskolefält som anger utbildningens ursprung bevaras avsiktligt. `phase4_projection` använder redan placeringens skola; programplanens delade scope finns från 05-21. Inga nya direktprivilegier eller Worker-grants införs. Funktions-ACL och hela definitionen av `copy_offering_cohort` har identiska före-/efterhashar.

Den äldre kullkopieringen är stängd för PUBLIC, anon, authenticated och Worker. Den befintliga privilegierade `service_role`-rättigheten finns kvar, utan ny grant. Dess äldre insert saknar explicit skol-ID och används inte av dessa produktvägar; ingen återöppnad klientväg eller fungerande äldre service-role-kopiering har verifierats.

## Körda kontroller

| Kontroll | Resultat och källa |
|---|---|
| Riktat spårprov före migration | RED enligt `work/pilot/results/phase5-22-tracer-before.json`: klass på tillagd skola nekades med 23503. |
| Riktad skolkopplings-SQL | 46/46 PASS; `phase5-22-linkage-sql.json` och lokal rålogg `web/test-results/phase5-22-final/phase5-22-linkage.log`. Första 44/46-omgången bevaras separat; överlappande negativ provperiod och fel antagande om legacy service_role rättades i proven. |
| Hela SQL-sviten | **FAIL, 1963/1964**, 30 filer; `phase5-22-sql-all.json` och lokal rålogg. Enda röda fallet är äldre `phase2_audit` #13: `History denied` matchar inte `%serverkontext%`. Samtliga berörda register- och timplansfiler passerar. |
| Modell/server och målskydd | Node 577/577 PASS, inklusive sex migrations-/journalprov; lokal `phase5-22-node-final.log`. |
| API-harness | Timplan 7/7 samt registerharness 5/5 PASS enligt genomförarens loggar; periodharness granskat för bevarade original och egna kloner. |
| TypeScript, oxlint, skyddat appbygge och handbok | PASS enligt genomförarens körloggar i `web/test-results/phase5-22-final/`; två skyddade byggen används enligt källbevis nedan. |
| Verklig byggd Worker, timplan-API | 39/39 PASS; `work/pilot/results/phase5-22-timplan-api.json`, bygge `849c1df`, cleanup PASS. Provar mandat, skol-/kundgränser, revisioner, session/MFA, obligatorisk audit och lista. |
| Verklig byggd Worker, livscykel-API | 39/39 PASS; `phase5-22-lifecycle-api.json`, bygge `849c1df`, cleanup PASS och identiska original/finalhashar. Alla 18 angivna sourceHashes stämmer mot källkod vid granskningen. |
| Register-API omkört | 18/18 PASS; `phase5-22-register-api.json`. Första 15/18-omgången finns i `phase5-22-register-api-first.json`: egna provkloner behövde entydiga aktuella perioder och lokal Kong-loggkälla behövde befintlig minimeringskonfiguration. Originalens sparade framtid/historik ändrades inte. Faktisk Kong-källa och stängd klient-ACL passerar i omprovet. |
| Timplan och livscykel i browser | 22/22 respektive 20/20 PASS på dator/telefon, utan retry/flaky/skipped. |
| Programplan i browser | Första hela körning **FAIL 39/40**. Phone14 föll i versionsöppningens 20 s väntan på lässvar, före skrivning och epoch-prov. Oförändrat separat phone14-omprov passerade 1/1; första orsaken är inte fastställd. Alla 40 beteenden har passerat över 39 + 1. |
| Terminer i browser | 25/25 körda PASS samt ett avsiktligt hoppat datorfall; ingen oväntad failure/flaky. |
| Register i browser | Slutligt elevkort 12/12, lista 13/13 och rolläsningar 5/5 PASS. Första elevkortsomgången behåller **FAIL 0/12**: tre felaktiga etikettlokatorer och nio avvisade lokala IdP-returadresser. Slutligt exakt options-ID-prov är starkare, produktregler oförändrade. |

Den sammanställda `work/pilot/results/phase5-22-browser.json` bevarar första körningarnas FAIL, separata omprov och lokala rårapportvägar/hashar. Granskaren jämförde de angivna rårapporthasharna utan avvikelse. Matrisen täcker **137 passerade beteenden och ett avsiktligt hoppat fall**, med 112 cleanupbilagor utan kvarvarande egna verksamhetsrader/felinjektioner. Append-only audithändelser och nödvändiga ankare bevaras.

Fas 5:s första sviter och API använder bygge/källa `849c1df31ba1b22d64120682400683556611e3ce`; slutliga registersviter och phone14 använder `ce887482648a1cc1a0257d3d380769f35519a5cb`. Produktkod i `web/app`, `web/lib` och `supabase` är identisk mellan dessa revisioner; senare ändringar gäller provharness och intern dokumentation. De nya skolkopplingsfallen använder lokalt mintade sessionsbevis mot riktig Worker/SQL. De äldre registerbrowserfallen går genom riktig lokal OIDC. Den tillfälliga 3059-returadressen har återställts till ursprunglig URI-mängd enligt granskad PASS-logg; inga användare eller autentiseringsuppgifter ändrades i återställningen.

Den nya regressionen ersätter fas 4:s äldre körbevis för de fyra ersatta registerfunktionerna. Den är lokal och syntetisk, och verifierar inte en riktig kommunanslutning, elevdata eller pilotdrift.

## Slutlig förhandsvisning och sanitet

Vanlig lokal 3012 kör slutligt skyddat bygge `ce887482648a1cc1a0257d3d380769f35519a5cb`. Det aktuella användarprovet läste 18 scenarier över nio utbildningar och två roller före och efter bytet, med sparade verksamhetsrader bevarade. Inga provdata nollställdes och öppna flikar laddades inte om automatiskt. 27 äldre klientfiler bevarades för öppna flikar.

`phase5-22-regression-preservation.json` bevisar efter hela matrisen samma kontrollsummor som efter migrationen för sex klasser, 68 placeringar, fyra timplaner, 46 timrader och klasskopplingar. Alla tidigare inventerade funktions-ACL är oförändrade; Worker har exakt 16 phase5-entrypoints och klientfunktionerna är stängda. Detta PASS gäller regressionens bevarande från efter-migrationsläget och reparerar inte den första metadataavvikelsen nedan. `phase5-22-user-trial-before/after.json` och `phase5-22-checks.json` ger minimerade körbevis.

## Öppen migrationsavvikelse — PARTIAL

Första faktiska tillämpningen backfyllde timplanernas skol-ID korrekt men körde befintlig touch-trigger. **Fyra timplans `updated_at` ändrades.** `phase5-22-preservation-first.json` och `phase5-22-preservation.json` behåller därför FAIL för fulla timplansrader. Klasser, elevplaceringar, timvärden, klasskopplingar, funktionernas ACL och kopieringsdefinition bevarades; gamla tidsstämplar är inte återställda. Aggregathasharna räcker inte för att återskapa dem och inga nya historiska tider har hittats på.

Korrigerad källa stänger enbart touch-triggern kring backfill i migrationsverktygets transaktion. `phase5-22-backfill-corrected.json` bevisar PASS från återställt före-schema i exklusiv rollbacktransaktion: fulla då befintliga timplansrader bevarades, rätt skola fylldes och triggern återaktiverades. Provet rullade tillbaka alla temporära schemaändringar. Detta verifierar säkert beteende hos korrigerad migration; det reparerar inte den första körningens förlorade metadata.

`phase5-22-journal-sync.json` gäller endast lokal journalsynk. Verktyget kräver hårdkodade före-/efter-källhashar, exakt migration, PASS-rollbackbevis med samma sourceHash, giltigt schema/triggerläge och oförändrad Worker-ACL. Synken ändrade inga verksamhets- eller schemarader. Ingen reset gjordes. Metadataavvikelsen kvarstår som öppen avvikelse i denna verifiering oavsett journalsynken.

## Återstående bedömning och krav

Granskaren har visuellt kontrollerat Skolor-dialogen efter nekad borttagning på dator/telefon och elevkortet efter lyckat byte på 320 px. B är fortfarande markerad, huvudskolan låst, utbildning och aktuella/avslutade placeringar framgår och reglagen ryms. Genomföraren har dessutom granskat nya timplanen på dator/telefon och elevkortet på dator. Detta ger bildbevis; **användarens begriplighetsbedömning väntar**.

ADMIN-04 har delbevis för beständig skolbunden klass–timplanskontroll och att ny version inte flyttar kopplingen. Skyddade appkommandon för att skapa klass, skapa timplan och koppla klass till timplan samt fullt läsårsunderlag och mänskligt prov återstår. Kravet är därför Pending. ADMIN-02 får nytt delbevis för bevarade utbildnings-/registerflöden med flera skolor; fulla beslut och senare planer förblir öppna.

Inga stubbade produktkopplingar eller blockerande anti-patterns hittades. Skolborttagningens beroendeprov är seriella; FK ger referensskydd även vid samtidiga inserts, men separat kapplöpningsprov för detta genomfördes inte i 05-22. Tidigare låsbevis är historik och räknas inte som nytt sådant prov. Poängmängd och valblock hör till nästa plan 05-23 och är inte korrigerade av denna leverans.

_Verifierare: Codex, oberoende GSD-granskare. Inga commits gjorda av verifieraren._
