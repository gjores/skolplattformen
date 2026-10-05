---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: "21"
subsystem: protected-programplan-units
status: complete
completed: 2026-10-05
requirements: [ADMIN-02, ADMIN-03]
requirements-finally-verified: []
human_result: awaiting_user
requires: [05-20]
provides: [shared-programplan-schools, all-schools-write-mandate, copied-school-selection]
affects: [05-22, 05-23, 05-25]
plan_head_before: dc71130
worker_build_revision: 9f80719975d0cb3424ceb92daa0bf78a7378b015
---

# 05-21 — Programplanens skolor

Huvudmannen kan välja flera egna gymnasieskolor under **Skolor**. De ser samma programplan med samma versioner och innehåll. Skrivning kräver mandat för alla planens skolor; en rektor med mandat för en del av skolorna kan läsa. Kopiering till ny elevkull tar med skolvalet. Genomfört och automatiskt prövat lokalt med syntetiska uppgifter. Mänsklig begriplighetsbedömning återstår.

## Levererat enligt D-03 och D-05

- `offering_units` kopplar utbildningen till skolorna med huvudmannamatchande främmande nycklar. Befintliga utbildningar fick huvudskolans koppling. En trigger skapar samma koppling för nya utbildningar. Huvudskolan är oföränderlig och dess koppling kan inte tas bort medan utbildningen finns.
- Huvudmannen kan lägga till skolor i framtida, pågående, avslutade och startokända planer. Borttagning tillåts bara före kullstart och aldrig för huvudskolan. Arkiverade planer kan inte ändras.
- Skolkommandot använder befintlig skyddad livscykelrutt med revision, huvudmannauppdrag, MFA och obligatorisk DB-/Worker-audit. Granskningsloggen innehåller antal tillagda/borttagna skolor. Ingen ny Worker-grant; exakt tidigare sexton entrypoints. Direkta skrivningar till skolkopplingstabellen är stängda och RLS aktiverat.
- Läsning omfattar mandat för någon kopplad skola. Alla befintliga programplansskrivningar kräver mandat för samtliga skolor. Skol-, utbildnings- och planscope låses i kontrollerad ordning; mandat prövas på nytt efter låsväntan.
- Dialogen visar huvudskolan som **Skapad här**, skyddar osparat urval och förklarar när borttagning är låst. Rektor med delmandat ser **Planen delas med skolor utanför ditt uppdrag och kan bara läsas**. Listan visar huvudskola + antal andra skolor; sökning och skolfilter omfattar alla kopplade skolor inom uppdraget.
- Kopiering skickar skolvalet efter att utbildning och terminsfördelning skapats, med den nya planens aktuella revision. Om skolsteget misslyckas bevaras kopian och beskedet anger att skolorna behöver väljas igen under Skolor. Återhämtningen är prövad i webbläsare.
- Handboken beskriver delningen, mandat/statusregler, kopiering och gränsen mot 05-22: **klasser, elevplaceringar och timplaner hör tills vidare bara till huvudskolan**.

## Verifiering

| Kontroll | Resultat |
|---|---|
| Node, `lib/*.test.mjs` och `lib/server/*.test.mjs` | 571/571 PASS |
| TypeScript, oxlint app lib, skyddat appbygge och Docusaurus-bygge | PASS |
| Riktade SQL-prov för skolkopplingar | 54/54 PASS efter tillämpad migration; även rollback-preview PASS |
| Hela SQL-sviten | 1917/1918, **FAIL** endast äldre `phase2_audit` fall 13 |
| Verklig byggd Worker och livscykel-/skol-API | 39/39 PASS; cleanup PASS och ursprungliga verksamhetshashar bevarade |
| Verkliga PostgreSQL-lås | 3/3 PASS: en vinnare vid samma revision, yttre rollback och återkallat B-mandat efter observerad låsväntan |
| Browser livscykel L01–L09, dator + iPhone 13 | 18/18 PASS |
| Browser programplan, dator + iPhone 13 | 39/40 i hela körningen (**FAIL**, listladdningens 5 s-väntan i datorfall 08) + 1/1 PASS i separat omprov; alla 40 beteenden prövade. Fall 12 PASS på båda skärmstorlekarna |
| Browser terminer, dator + iPhone 13 | 14/15 i hela körningen (**FAIL**, telefonfall 06 väntar 5 s på återläst sparstatus efter avsiktligt tappat sparsvar) + 1/1 PASS i separat omprov; ett avsiktligt hoppat prov |
| Browser timplan, dator + iPhone 13 | 20/20 PASS |
| Oberoende kodgranskning | Inga blockerande produktfynd; fyra must-haves spårade i `05-21-VERIFICATION.md` |

Resultat finns i `work/pilot/results/phase5-21-*`. Webbläsarrapporten redovisar faktisk byggrevision per svit och cleanup. Granskade bilder omfattar skolfilter, rektorns läsläge, låst skolborttagning, kopia med skolor och återhämtning på dator och telefon. De automatiska proven ersätter inte användarens bedömning.

Migrationen `20261004130000_phase5_programplan_units.sql` är tillämpad på det isolerade lokala protected-målet utan reset eller nya grants. SHA-256: `b5ea67768554e7166daa6fab5522aeb83ed50a18b2996c173656439e19d2bdad`. Den har inte ändrats efter tillämpning. Låsproven är SQL-bevis, medan API-proven går genom riktig Worker. Ingen verklig elevdata eller kommunanslutning har prövats.

## Rättningar och avvikelser under verifieringen

1. Nodproven skrevs före implementationen: fyra nya beteenden var röda och blev gröna. SQL-spårprovet kördes rött före migrationen och grönt efter den.
2. Äldre SQL-fixturer behövde explicit huvudskolekoppling när de skapar rader under `session_replication_role=replica`. Ett avsiktligt korrupt underlag som tidigare skapades normalt måste nu skapas under samma avstängda fixturtriggers eftersom den nya FK:n korrekt stoppar det. Negativa mandatkontroller behölls.
3. API-provets två auditfel använde först samma utbildningsnamn och stoppades av dubblettregeln. Namnen separerades; båda verkliga auditrollback-proven passerar. Det första serverstartsförsöket avslutades före API-anropen; slutliga prov kördes i en bestående terminalsession. Ett felaktigt extra preflight-försök avvisades av exakt ACL-kontroll utan ändringar. De misslyckade försöken finns kvar som separata resultat, inte som produktbevis.
4. Bildgranskningen hittade en bild som togs medan listan laddades efter återhämtat skolval. Provets väntan skärptes till den återöppnade kopian och dess innehåll, och livscykeln kördes om. Samma bildgranskning upptäckte att analystexten utlovade sparande även i läsläge. Texten tar nu hänsyn till mandat/status, och L07 kontrollerar att beskedet inte säger att rektorn kan spara. Efter rättningen byggdes appen om och alla fyra webbläsarsviter samt API-proven kördes på nytt.
5. Den oberoende granskningens önskemål om faktisk samtidighets- och auditrollback-bevisning uppfylldes med observerade PostgreSQL-väntare, återkallat skolmandat och felinjektion i både DB- och Worker-audit.

6. Programplanssviten gav 39/40: datorfall 08 väntade högst 5 s på listans `aria-busy=false` efter återgång från en konflikt. Samma fall passerade på telefon och i separat datoromprov (1/1), utan ändrad kod eller provförväntning. Hela körningen är fortsatt redovisad som FAIL; inget automatiskt retry har använts. Alla 40 beteenden har passerat över 39+1, men tidskänsligheten är dokumenterad.

7. Terminsviten gav 14/15 + ett avsiktligt hoppat fall: telefonfall 06 väntade högst 5 s på återläst "Allt sparat" efter avsiktligt tappat svar. Separat omprov passerade 1/1 (en enda skrivning, återläst revisionsökning och sparstatus) och redovisas med egen källa. Hela körningen behålls som FAIL; inga förväntningar eller tidsgränser ändrades.

## Kvarstår och nästa steg

- Full SQL är fortsatt röd på det sedan tidigare dokumenterade fas 2-fallet 13: det förväntar `%serverkontext%` men får `History denied`. Ingen ny 05-21-regression identifierad; felet har inte dolts genom ändrad förväntning.
- Mänskligt prov av Skolor, delat mandat och begriplighet är **awaiting_user** på [vanlig lokal 3012](http://127.0.0.1:3012). Tidigare provdata är bevarade. Prova en framtida plan → Skolor → lägg till/ta bort gymnasieskola → kopiera till senare kull. Pröva också den låsta borttagningen efter kullstart.
- Nästa genomförandeplan är **05-22**: koppla klasser, elevplaceringar och timplaner till utbildningens skolor. Därefter 05-23 före återgång till 05-25:s förutsättningsgrind. 05-24:s rena GR/IM-analys är redan genomförd. 05-17:s yrkesregler saknar fortfarande genomförandeplan och behöver vara levererade innan yrkesplaner kan fastställas i 05-25.
- ADMIN-02/ADMIN-03 som helhet, full fas 5 och fas 4:s mänskliga checkpoint är fortfarande öppna. Arbetskopians orelaterade ändringar har inte tagits med i 05-21-commits.
