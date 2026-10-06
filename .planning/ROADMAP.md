# Roadmap: Skolplattformen

## Overview

**Milestone:** v1.0 — Säker administration inför en pilot

**Status:** Godkänd av användaren 2026-09-11 — 42 detaljkrav och åtta faser är fastställda. Fas 1–3 är genomförda och verifierade lokalt syntetiskt; fas 4 genomförs (24 av 25 planer klara; mänskligt användarprov och fasverifiering återstår).

**Granularity:** standard

Den befintliga appen utvecklas stegvis till en avgränsad pilot: först en återställbar baslinje, därefter verifierad åtkomst och spårbara mandat, beständiga elever och en avstämd registerimport. Gymnasiets utbildningar, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar bevaras och prövas vid berörda förändringar. Faktisk kommunanslutning och beslut om verkliga elevuppgifter har egna godkännandegränser.

## Phases

Heltalsfaser är planerad milstolpeomfattning. Eventuella decimalfaser förs in mellan sina omgivande heltal. Fas 1 är genomförd (alla 10 planer körda, användarens checkpoint godkänd 2026-09-12) och verifierades 2026-09-12 i `01-VERIFICATION.md`; fas 2 verifierades 2026-09-21 och fas 3 stängdes efter mänsklig verifiering 2026-09-28. Fas 4 genomförs; faserna 5–8 är inte genomförda.

- [x] **Phase 1: Baslinje och avskild pilotmiljö** - Befintliga arbetsflöden går att pröva och återställa inom en tydlig pilotgräns. (completed 2026-09-12)
- [x] **Phase 2: Verifierad kontoåtkomst** - Konton, arbetskontext och sessionsspärr styr den första spårbara skyddade operationen.
- [x] **Phase 3: Mandat och skyddade datavägar** - Huvudman, rektor och personal får endast sitt aktuella mandat med kontrollerbar säkerhetslogg. (completed 2026-09-28)
- [ ] **Phase 4: Beständigt och skyddat elevregister** - Behörig administration kan söka, ändra, följa och exportera rätt elever.
- [ ] **Phase 5: Bevarade utbildnings- och klassflöden** - Uppskattade skol-, utbildnings- och kullflöden fungerar med den nya säkerhetsgrunden.
- [ ] **Phase 6: Avstämd registerimport** - En begränsad anslutning kan granskas, köras om och följas i användbara dator- och telefonflöden.
- [ ] **Phase 7: Verifierad kommunanslutning** - Faktiska identitets- och registeranslutningar har godkända prov och uppmätt kontolivscykel.
- [ ] **Phase 8: Prövad pilotdrift och informationshantering** - Kunden kan fatta pilotbeslut med provad återställning, incidenthantering och avveckling.

## Phase Details

### Phase 1: Baslinje och avskild pilotmiljö

**Goal**: Projektansvarig kan bedöma och återställa den befintliga appen, medan pilotens provdata och öppna kundbeslut hålls tydligt avgränsade.
**Depends on**: Nothing (first phase)
**Requirements**: BASE-01, BASE-02, PILOT-01
**Success Criteria** (what must be TRUE):

1. Projektansvarig kan återgå till en versionshanterad baslinje och läsa aktuella regressionsresultat för gymnasieutbildning, kurs-/nivåtillägg, kullkopiering och klass–timplanskoppling. Tidigare tester är identifierade som historik. (BASE-01)
2. Pilotansvarig kan använda en avskild testmiljö där demoinloggning, installerad demoetablering och automatisk exempeldata inte ger åtkomst till skyddade driftvägar. (BASE-02)
3. Pilotansvarig kan granska en daterad anslutningsprofil med organisation, elevfält, originalkälla, skrivansvar och volym; ännu ej valda kund- och leverantörsuppgifter framgår som öppna beroenden. (PILOT-01)

**Plans**: 10 plans

Plans:

- [x] 01-01-PLAN.md — Git-baslinje med tagg `fas1-baslinje` och återställningsprov (verify-baseline.mjs)
- [x] 01-02-PLAN.md — Daterad anslutningsprofil docs/pilot/connection-profile.md (PILOT-01)
- [x] 01-03-PLAN.md — Runtime-läge stängt som standard, klientgräns utan klient, laddare utan demoinloggning/seed, exempelskript med tom Supabase-miljö
- [x] 01-04-PLAN.md — Pilotfixtur: en huvudman, grundskola + gymnasium, 2 klasser × 6 elever per skola (TDD)
- [x] 01-05-PLAN.md — Disponibla lokala Supabase-mål med målskydd, karantänmigration och pgTAP-prov
- [x] 01-06-PLAN.md — Negativa API-prov (tre identiteter, rader oförändrade) och positiva baslinjeflöden mot baseline-målet
- [x] 01-07-PLAN.md — UI: blockerad start, Provmiljö-märkning, skolväljare Exempelskola, sann lagringsstatus, gatad telefonstart
- [x] 01-08-PLAN.md — Playwright 1.63.0 med projekt dator/telefon/blockerad/byggd; browserprov av bevarade flöden, skolföljande Elever-vy och isolering
- [x] 01-09-PLAN.md — Baslinjerapport docs/pilot/baseline.md, startanvisning, valideringskarta och användarens checkpoint på dator/telefon (kravstatus uppdateras först efter checkpointen)
- [x] 01-10-PLAN.md — Sparordningsreproducerare som KNOWN-ISSUE (ägare fas 5) och sammanställare verify:phase1

**UI hint**: yes

### Phase 2: Verifierad kontoåtkomst

**Goal**: Personal kan arbeta i en verifierad och återkallningsbar arbetskontext, med kundavgränsning och spårbarhet från den första skyddade ändringen.
**Depends on**: Phase 1
**Requirements**: IAM-01, IAM-03, IAM-04, IAM-05, ACL-01, AUDIT-01
**Success Criteria** (what must be TRUE):

1. En verifierad företrädare kan etablera kundens första medlemskap; enbart organisationsnummer eller e-postdomän räcker inte för att få behörighet. (IAM-01)
2. Personal kan välja bland sina giltiga uppdrag utan sammanblandade rättigheter och nekas annan kunds objekt och metadata även vid direkta anrop, sökning, export och tillgängliga filvägar. (IAM-03, ACL-01)
3. Efter utloggning nekas den avslutade appsessionen skyddad åtkomst; vid utloggning och kontextbyte rensas föregående elevinnehåll även mellan flikar. (IAM-04)
4. En administratör kan spärra medlemskap eller avsluta uppdrag så att nästa skyddade anrop nekas med en redan utfärdad token. (IAM-05)
5. Behörig granskare kan följa beständiga ändringar med serververifierad aktör, faktiskt uppdrag, tid, källa, objekt och resultat; manipulerad klientroll kan inte förfalska historiken. (AUDIT-01)

**Plans**: 12 planer i 11 vågor — granskade och redo att genomföras 2026-09-13

- [x] 02-01-PLAN.md — Lokal testidentitet och skyddad körmiljö
- [x] 02-02-PLAN.md — Databasens identitets- och sessionsgrund
- [x] 02-03-PLAN.md — Tidigt prov av databasanslutning och OIDC i Worker
- [x] 02-04-PLAN.md — Körbevis och kontrollpunkt för inloggningsflödet
- [x] 02-05-PLAN.md — Kund-, uppdrags- och loggmodell
- [x] 02-06-PLAN.md — Serverns behörighets- och sessionskontroller
- [x] 02-07-PLAN.md — Personbundna inbjudningar, spärr och avslut
- [x] 02-08-PLAN.md — Granskarlogg och första skyddade ändringen
- [x] 02-09-PLAN.md — API-prov av åtkomst och kundisolering
- [x] 02-10-PLAN.md — Uppdragsväljare, flikrensning och administrationsvyer
- [x] 02-11-PLAN.md — Webbläsarprov på dator och telefon
- [x] 02-12-PLAN.md — Samlad fasgrind, bevisrapport och användarbedömning

**UI hint**: yes

Prov mot en avskild testidentitet kan utveckla och verifiera appens kontrakt. Den faktiska IdP-anslutningen och fördröjningen från extern kontokälla godkänns i fas 7; de får inte markeras uppfyllda här. Sessions- och cookieflödet provas tidigt i byggd Worker innan elevlagringen bygger vidare på det.

### Phase 3: Mandat och skyddade datavägar

**Goal**: Varje personalroll kan utföra sitt tillåtna uppdrag, och pilotens åtkomst går att granska utan att alternativa datavägar kringgår skydd eller loggning.
**Depends on**: Phase 2
**Requirements**: ACL-02, ACL-03, ACL-04, ACL-05, AUDIT-02, AUDIT-03
**Success Criteria** (what must be TRUE):

1. Huvudmannen kan utse rektor inom sin organisation; en rektor kan inte skapa rektorsmandat för sig själv eller någon annan. (ACL-03)
2. Rektor kan tilldela och avsluta läraruppdrag bara inom sina aktuella skolenheter och giltighetstider; huvudmannens vanliga roll nekas samma tilldelning. (ACL-02)
3. Lärare och skoladministratör kan endast utföra elev- och administrationsåtgärder enligt den fastställda uppdragsmatrisen; okänd eller saknad rättighet nekar åtkomst även vid direkt anrop. (ACL-04)
4. Kommunens IT-funktion kan hantera anslutningen utan generell elevinsyn; eventuell supportåtkomst upphör efter sin tilldelade tid och går att följa. (ACL-05)
5. Behörig säkerhetsfunktion kan följa de syntetiska elevläsningar, exporter och nekade försök som loggpolicyn kräver, även genom alternativa datavägar. Pilotansvarig kan kontrollera loggarnas begränsade åtkomst, minimerade innehåll, beslutade lagringstid och provade beteende vid loggbortfall. (AUDIT-02, AUDIT-03)

**Plans**: 7 planer i 7 sekventiella vågor — granskade 2026-09-22. Se 03-PLAN-REVIEW.md och 03-EXECUTION-CONTRACT.md för verifieringsgrindar och kvarstående risker.
**UI hint**: yes

Den första syntetiska elevoperationen används för att bevisa hela skydds- och loggkedjan. Elevregistret i fas 4 får inte öppna en dataväg som saknar samma kontroller; kvarvarande direkt databasåtkomst måste omfattas eller stängas. Dessa kontroller följer varje senare ändring och import.

### Phase 4: Beständigt och skyddat elevregister

**Goal**: Behörig administratör kan administrera en elev från sökning till sparad ändring och omläsning, med historik, informationsursprung och skyddade uppgifter.
**Depends on**: Phase 3
**Requirements**: STU-01, STU-02, STU-03, STU-04, STU-05, STU-06, DATA-01, DATA-02
**Success Criteria** (what must be TRUE):

1. Administratören kan återfinna samma elev och sparade basuppgifter efter utloggning och omläsning, med stabilt internt elev-ID skilt från inloggningskonto. Sökning per skola/läsår, åtskillnad av namnlika elever och återgång till samma urval fungerar med tillåtna uppgifter. (STU-01, STU-05)
2. Administratören kan se aktuell, framtida och avslutad skolplacering samt hantera tillåtna datumsatta klasstillhörigheter. Klassbyte bevarar historik och byter inte automatiskt utbildning. (STU-02, STU-03)
3. Administratören kan se uppgiftens ursprung och rätta i ansvarig källa; konkurrerande källor och två samtidiga ändringar kan inte tyst skriva över nyare uppgifter utan ger begriplig konflikt. (STU-04, STU-06)
4. Behörig personal kan genomföra pilotens fastställda arbetsfall med en skyddad syntetisk elev. Obehöriga läsvägar, sökträffar, fel och aviseringar röjer varken skyddade uppgifter eller metadata. (DATA-01)
5. Administratören kan exportera ett uttryckligt elevurval med endast tillåtna fält. Serverns behörighetskontroll, aktuella spärrar, skyddsregler och loggning gäller även om exporten anropas direkt. (DATA-02)

**Plans**: 25 planer i 15 vågor, 24 genomförda — planstrukturen granskad 2026-09-28; 04-23 tillagd efter våg 7 (användarbeslut 2026-09-28); 04-24 och 04-25 tillagda efter våg 8 för luckorna skyddad export och Worker-avbrott. 04-21:s handbok och förnyade fullgrind är klara; 04-22:s användarprov och separat fasverifiering återstår.

- [x] 04-01-PLAN.md — Fastställ registerkontrakt och rena datumregler (våg 1)
- [x] 04-02-PLAN.md — Bygg registerschema och referensdata (våg 2)
- [x] 04-03-PLAN.md — Flytta provrelationer och inför huvudmannens skyddsbehörighet (våg 3)
- [x] 04-04-PLAN.md — Implementera serverurval och fältprojektion (våg 4)
- [x] 04-05-PLAN.md — Spara datumändringar med konflikter och historik (våg 5)
- [x] 04-06-PLAN.md — Skydda lokal rättelse mot simulerad källa (våg 6)
- [x] 04-07-PLAN.md — Transportera säkra fel och stoppa gamla svar (våg 2)
- [x] 04-08-PLAN.md — Utöka obligatorisk minimerad registerlogg (våg 2)
- [x] 04-09-PLAN.md — Koppla läs-API till registerprojektionen (våg 5)
- [x] 04-10-PLAN.md — Öppna ändring, personnummer och export via skyddat API (våg 7)
- [x] 04-11-PLAN.md — Gör skyddsbehörighet hanterbar för huvudmannen (våg 4)
- [x] 04-12-PLAN.md — Bygg lista, läsår och säkert urval (våg 6)
- [x] 04-13-PLAN.md — Bygg elevkort och ändringsdialoger (våg 8)
- [x] 04-14-PLAN.md — Porta första delen av SQL-regressionen (våg 7)
- [x] 04-15-PLAN.md — Porta resterande SQL och lokala fixturer (våg 8)
- [x] 04-16-PLAN.md — Skapa fullständiga registerprov och syntetiska scenarion (våg 10)
- [x] 04-17-PLAN.md — Avveckla elevprovet utan alternativa datavägar (våg 9, körs sist i vågen)
- [x] 04-18-PLAN.md — Porta tidigare API- och browserbevis (våg 11)
- [x] 04-19-PLAN.md — Verifiera hela elevflödet i webbläsare (våg 12)
- [x] 04-20-PLAN.md — Bygg fullständig fasgrind och beviskarta (våg 13)
- [x] 04-21-PLAN.md — Uppdatera handboken med prövat registerbeteende (våg 14)
- [ ] 04-22-PLAN.md — Genomför användarprov och redovisa fasens gräns (våg 15)
- [x] 04-23-PLAN.md — Öppna Worker-körrätt för registrets skriv-, personnummer- och exportfunktioner (våg 8, körs först i vågen)
- [x] 04-24-PLAN.md — Visa skyddade elever för behörig administratör i lista och export (våg 9, efter 04-25 och före 04-17)
- [x] 04-25-PLAN.md — Utred och åtgärda lokala Worker-avbrott på nekade anrop (våg 9, körs först i vågen)

Granskningsrapport: `04-VERIFICATION-CHECKER.md`.
**UI hint**: yes

### Phase 5: Bevarade utbildnings- och klassflöden

**Goal**: Behörig personal kan fortsätta skolans befintliga planeringsarbete med riktiga medlemskap och explicita, beständiga klasskopplingar.
**Depends on**: Phase 4
**Requirements**: ADMIN-01, ADMIN-02, ADMIN-03, ADMIN-04
**Success Criteria** (what must be TRUE):

1. Huvudmannen kan lägga till skola via organisationsnummer eller skolenhetskod med adress och skolform från registret; en registeruppdatering bevarar lokalt tillsatt rektor. (ADMIN-01)
2. Behörig personal kan skapa gymnasieutbildning och lägga till kurser/nivåer med befintliga planversioners beslutsregler efter bytet av identitet och åtkomst. (ADMIN-02)
3. Huvudmannen kan kopiera utbildningsupplägg till en senare elevkull och få egna planutkast utan att elever, klasser eller tidigare beslut kopieras. (ADMIN-03)
4. Behörig personal kan koppla en beständig klass till en fastställd timplansversion och se rätt läsårsunderlag; en ny version flyttar inte den befintliga kopplingen. (ADMIN-04)

**Plans**: 05-01–05-16, 05-18–05-22 och 05-24 automatiskt genomförda med dokumenterade avvikelser; 05-23 steg A/B/C/D är automatiskt genomförda; den senare avgränsade paketborttagningen är levererad, nästa är reviderat steg E för fullplansverifiering och mänskliga programplansprov väntar; 05-16:s aktuella gemensamma flöde är redo för nytt mänskligt prov. Användaren underkände senast 05-14:s begriplighet. 05-15/05-16 återför den beslutade ordningen program → inriktning → programfördjupning och använder samma arbetsyta för nytt och befintligt. Skyddad GR/IM-timplanslista/celländring och programplansurval, versionsläsning, utkast och kloning verifierade automatiskt. Samlat mänskligt prov samt fasens fulla utbildnings-/besluts-/kopierings-/klassflöden återstår.

- [x] 05-01-PLAN.md — Kodförankrat mandat-/bevarandekontrakt och verifieringsmatris; inga skyddade vyer öppnade
- [x] 05-02-PLAN.md — Lokal sparordning/databas-ID rättade med ordinarie regression; 346/346 tester, typ/lint/bygge PASS; inga skyddade vyer öppnade
- [x] 05-03-PLAN.md — Stängd mandatavgränsad timplansläsning/celländring med revision och atomisk DB-audit; SQL 77/77, lås 4/4 PASS; session/API/UI återstår

- [x] 05-04-PLAN.md — Sessionskopplad timplans-API, MFA/konflikt/audit, preflight/final 29/29 PASS och exakt två Worker-grants; UI/gymnasieskrivning stängda

- [x] 05-05-PLAN.md — Auditerad GR/IM-lista och kolumnmetadata, API preflight/final 39/39, SQL 59/77/27, lås 4/4 och exakt tre Worker-entrypoints
- [x] 05-06-PLAN.md — Skyddad timplansvy med celländring, osparat skydd/konflikt/rensning, browser 18/18 och byggd handbok; övriga planeringskommandon stängda
- [x] 05-07-PLAN.md — Reproducerbart katalogartefakt, exakta program-/ämnes-/nivåreferenser och serverintegritet; 451/451 prov, typ/lint/skyddat bygge PASS; inga gymnasieskrivningar öppnade

- [x] 05-08-PLAN.md — Oföränderlig SQL-katalog och stängda sessions-/mandatbundna utkast med CAS/audit; 632 SQL, 455+5 Node, 42 paritet och 6 observerade låsväntansfall + rollback PASS; inga API/grants/beslut öppnade

- [x] 05-09-PLAN.md — Skyddad programplans-API, preflight/final 48/48, SQL 663, gamla timplans-API 39 och oberoende granskning 6/6 PASS; exakt fem nya grants efter återställd preflight
- [x] 05-10-PLAN.md — Gymnasieurval och verifierat katalogunderlag; preflight/final 38/118, SQL 443 och tidigare API 48/39 PASS. Exakt två nya läsgrants; totalt tio Worker-signaturer.
- [x] 05-11-PLAN.md — Skyddad programplansvy och utkast/kloning, programbrowser 30/30 + timplan 20/20 PASS, handbok och fyra beständiga exempel verifierade på 3012. Mänsklig begriplighet underkänd; rättas i 05-13.
- [x] 05-12-PLAN.md — Regelhandledning i befintlig timplansvy och dialog, GR/IM-källor och handbok; 20/20 browserprov och skyddat bygge PASS. Mänsklig förståelsebedömning följer med 05-11.
- [x] 05-13-PLAN.md — Direkt aktuell plan, ämnes-/nivåvy, tydlig nästa åtgärd och guidad källbindning efter användarfynd. Senast pedagogiskt fördjupad med tre dialogsteg/fälthjälp: färska 30+20 browser, typ/lint/bygge/handbok och bevarad current-läsning på vanlig 3012 PASS (e077e81). Tidigare 25+4 Node-prov är historik. Ny mänsklig begriplighetsbedömning väntar.
- [x] 05-14-PLAN.md — Granskning, ämnessökning, fem fler program och visuell karta över sex delar/val. Färska 32+20 browser, 27 Node, typ/lint/bygge/handbok och nio bevarade exempel PASS (b4c26f3). Gemensamma paket pending todo; ny mänsklig bedömning väntar.
- [x] 05-15-PLAN.md — Skyddade program-/inriktningsval och atomiskt HM-skapande av utbildning med första utkast, replaykvitto och riktiga SQL/API-prov.
- [x] 05-16-PLAN.md — Samma program → inriktning → fördjupningsarbetsyta för nytt och befintligt, ämnesgrupperade nivåval och nytt begriplighetsprov.
- [ ] 05-17 (planeras) — Yrkesprogrammens poängsumma (2 700 för BF/HT/VO, 2 800 för övriga, skollagen bilaga 2) så att ramen för programfördjupning kontrolleras. Markera Svenska/SvA nivå 2–3 och Engelska nivå 2 som ”ingår – eleven kan välja bort” med undantagen för BF/VO (Svenska 2) och HT (Engelska 2), gymnasieförordningen 4 kap. 23 §. Riksrekryterande utbildningar förblir okontrollerade. Elevens bortval hör till STUDY-01. Underlag: `research/YRKESPROGRAM-BORTVAL-2026-10-03.md`.
- [x] 05-18-PLAN.md — Poängfördelning över sex terminer i exakt programplansversion, årskursöversikt och mobilinmatning. Terminer 16/16, API 31/31 och SQL 236/236 PASS; program 40/40 och timplan 20 beteenden över 19+1. Mänskligt prov väntar, setupfel särredovisade i 05-18-SUMMARY. Administratörsdelegation och skapande av timplan har egna todos.
- [x] 05-19-PLAN.md — Sammanhållen programplan: en tabell med ämnen, programfördjupning och sex terminer, klick- och förslagsfördelning, autospar, kopiering med fördelning och framräknad Klar för beslut (användarbeslut 2026-10-04). Node 535, tabell 15/15, program 38/40 (känt utloggningsfall), timplan 20/20; mänskligt prov återstår
- [x] 05-20-PLAN.md — Programplanens livscykel (D-01/D-02/D-04): status räknad i SQL, ändra och ta bort framtida plan, arkivera övriga, stängda direkta tabellskrivningar. SQL 1863/1864 (känt fas 2-fall), API 29/48/31, browser livscykel 12/12, program 40/40, terminer 15/15, timplan 20/20 på ae41a03. Mänskligt prov väntar.
- [x] 05-21-PLAN.md — Programplanens skolor (D-03/D-05): samma plan/versioner över valda gymnasieskolor, huvudskolan bevarad, alla skolors mandat vid skrivning, skolval i kullkopiering. SQL 54/54, API 39/39, lås 3/3, browser livscykel 18/18, program 39/40 + 1/1 omprov, terminer 14/15 + 1/1 omprov och timplan 20/20 PASS; full SQL 1917/1918 med äldre fas 2-fel. Mänskligt prov väntar.
- [x] 05-22-PLAN.md — Full skolkoppling för klasser, elevplaceringar och timplaner (D-06/D-07), genomförd/verifierad lokalt 2026-10-05. SQL 46/46; API 39/39, 39/39 och 18/18; 137 browserbeteenden och ett hoppat fall med separat phone14-omprov. Full SQL 1963/1964 FAIL på äldre auditfall; första backfillens fyra updated_at-avvikelser kvar PARTIAL, korrigerad migration rollbackprovad. Mänsklig bedömning och full ADMIN-04 väntar; skapa klass/timplan/koppla klass återstår. Nästa 05-23.
- [ ] 05-23-PLAN.md — Valbara block och full poängsumma, **in_progress**. A/B/C/D genomförda enligt tidigare beställning; senare användarbeslut 2026-10-05 tar bort paket-UI, paketladdning och paketanalys från programplanerna. Avgränsad REMOVE-PACKAGES-PLAN klar: ram/terminer/skolor och äldre utbud bevarade, kullkopiering utan paketval. Node 648, harness 4, aktuella browser 20 PASS med 6 historiska skips, typ/lint/bygge/handbok PASS. Paketborttagningen prövades på 848afd4 med bevarade original. Vanlig 3012 kör nu `a7c78e1` med den verifierade timutkastövergången och den senare rättningen som tar bort blockhanteringen men behåller ramarna. Se 05-23-SUMMARY och phase5-programplan-frame-rapporter, inklusive första FAIL. Nästa E:s fullplansverifiering enligt reviderad ram; separat skolutbud/elevval/organisation ännu inte implementerat. Äldre audit-FAIL och 05-22 metadata PARTIAL kvar. ADMIN-02/ADMIN-03 Pending och mänskligt prov väntar; 05-25 väntar på hela 05-23, yrkesfastställande dessutom på 05-17.
- [x] 05-24-PLAN.md — Regelförankrad GR/IM-analys (ren funktion `timplan-analysis.ts`, 2026-10-05): HKK 40 timmar gemensamt för låg-/mellanstadiet, NO/SO utan dubbelräkning, IM räknar bara profilklassificerad undervisning, blocksDecision skilt från kategori. 25/25 nodprov, tsc/oxlint PASS; syntetiska data, ingen vy/API/SQL kopplad
- [x] 05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md — Avgränsad skolvis timutkastövergång från komplett sparad högskoleförberedande programram, genomförd/verifierad 2026-10-06. Fryst källa, separata timmar, rätt skola/källretur, CAS/replay och uttrycklig ny version med bevarade klasslänkar. SQL37, Worker11/157, browser60 och 14-tabellsbevarande PASS; lokal 3012 på 3ae5fe5. Se separat SUMMARY/VERIFICATION. Fulla huvudkrav/fas 5 och mänskligt prov är öppna.

05-11 har öppnat programplansvyn efter 05-09/05-10:s verifierade API och förberett ett konkret samlat mänskligt prov på 3012. Användaren har 2026-10-01 godkänt automatisk fortsättning till nästa konkreta mänskliga prov. Programplanernas framtida direkta HM-fastställande ur utkast bevaras; nationella alternativ/ramar och historiskt obundna poster kräver uttrycklig kontroll. 05-15/05-16 har nu levererat gymnasieutbildningsskapande med första utkast för huvudmannen. Beslut, generellt GR/IM-skapande, kullkopiering och klasskoppling återstår som egna kontrollerbara steg. 05-12 genomfördes parallellt med 05-09 och utökar ingen regelkontroll eller beslutsrättighet.



**Senare avgränsning 2026-10-05:** paketen är borttagna från programplansarbetsytan enligt uttrycklig beställning. Programramen består och innebär inte automatiskt ett parallellt schemafönster. Separat skolutbud/elevval/skolorganisation måste planeras senare. Berörda 05-25–28 ska ompröva sina skolpaketsantaganden mot detta beslut före genomförande; denna rättning kringgår inte befintliga förutsättningsgrindar eller godkänner hela 05-23/E. Se REMOVE-PACKAGES-PLAN och SUMMARY.

**Förtydligande genomfört 2026-10-06:** ”Behåll blockramarna, ta bort blockhanteringen.” Programplanens sparade blockrader/poäng/terminer består, medan skapa/dela/ändra/ta bort block är borttaget. Avgränsade dator-/telefonprov 20/20 och färsk 14-tabellsbevaring PASS; lokal 3012 kör nu `a7c78e1`. Se [rättningen](debug/programplan-block-controls.md). Full 05-23/E, ADMIN-02/03/04 och separat skolorganisation förblir öppna.

**Senare beställning 2026-10-05 — programplan till timplan:** [Övergångsplanen](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-PLAN.md) genomför en förberedande skolvis timplan från en komplett sparad högskoleförberedande programram, redan före programbeslut. Källa/version/revision och sex poängterminer fryses, timmar fylls separat, klasskopplingar bevaras. Ingen paketfunktion återinförs. Nya browser18/18, regression42/42 och verklig Worker11/157 på 3012 PASS; avgränsad leverans verifierad 2026-10-06. Se [SUMMARY](phases/05-bevarade-utbildnings-och-klassfloden/05-PROGRAMPLAN-TIMPLAN-TRANSITION-SUMMARY.md). Detta ersätter det äldre paketets fastställd-/paketgrind endast för förberedande utkast; 05-25–35 har replan_required och deras migrationsnamespace måste omprövas. Beslut/garantikontroll, yrkesram, full 05-23/E och ADMIN-02/03/04 är öppna.

**Historiskt planeringspaket 2026-10-04 — timplaner (omplanering krävs):** [05-24–05-35](phases/05-bevarade-utbildnings-och-klassfloden/05-TIMPLAN-IMPLEMENTATION.md) planerar en sammanhållen timplanstabell och analys efter den aktuella programplanslösningen i 05-19. Startlista, årskurs-/stadieöversikt, gymnasiets sex terminer, radvis autospar och konkreta analysåtgärder ingår. Rektor/skoladministratör arbetar inom sin skola; HM beslutar. Gymnasieplaner får fryst koppling till exakt fastställd programplan och skolpaketsunderlag. Skyddat programfastställande är ett eget föregående steg. 05-20–05-23 är verkliga förutsättningsgrindar; yrkesprofiler kräver dessutom 05-17. Befintliga GR/IM-flöden och explicita klasskopplingar bevaras. 05-24:s rena GR/IM-analys är genomförd; övriga steg i paketet är **planerade, inte genomförda**, och utgör delarbete för ADMIN-02/ADMIN-04. Full ADMIN-03/kullkopiering och fasverifiering ligger kvar separat.

Fas 5 genomförs i avgränsade delplaner på användarens instruktion. Fas 4:s kvarstående användarprov/datumanmärkning och separata fasverifiering behålls öppna.

Planeringsgräns 2026-10-01: användarens [delprojekt för sammanhängande schemamoduler](research/SCHEMAMODUL-PROJEKT.md) ska beaktas i berörda återstående planer. Redovisa stabila ID:n, exakta plan-/katalogversioner, undervisningstidens enheter, giltighet, klasskopplingar och ändringsansvar så programplaner, timplaner och framtida studieplan/schema kan samverka. ADMIN-01–04 behålls; Rustmotor och nya schemafunktioner får egna genomförandeplaner. AI utvärderas separat; eventuell AI-koppling planeras bara efter införandebeslut.

Planeringsöversyn 2026-10-05: [Skolverkets undervisningsbehörigheter](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) behöver senare kunna jämföras med bevarade ämnes-/nivå-/skolreferenser. Program-/timplansanalys ska inte påstå verifierad lärarbemanning. Stabil lärarresurs, personmatchning och behörighetsimport hör till det separata föreslagna L1–L4-spåret och schemadelprojektet; de byggs inte in i nästa 05-22-plan.

**UI hint**: yes

Denna fas äger slutverifieringen av bevarandekraven. Referensflödena provas redan i fas 1 och vid varje berörd ändring i fas 2–4; regressionsskydd skjuts inte upp till fas 5. Grundskola och gymnasium provas där respektive arbetsflöde är tillämpligt.

### Phase 6: Avstämd registerimport

**Goal**: Integrationsansvarig och administratör kan föra in överenskomna registeruppgifter, upptäcka avvikelser och följa omförsök utan att förlora eller dubblera elever.
**Depends on**: Phase 5
**Requirements**: INT-01, INT-02, INT-03, INT-04, INT-05, INT-06, UX-01
**Success Criteria** (what must be TRUE):

1. Integrationsansvarig kan konfigurera och stoppa anslutningen med en separat maskinidentitet begränsad till rätt kund och objekt. (INT-01)
2. Administratören kan granska tillägg, ändringar och radvisa avvikelser före första införandet. Endast validerade elev-/placeringsobjekt med stabila externa ID:n och känd kontraktsversion förs in; SS 12000 används när motpartens relevanta stöd är verifierat. (INT-02, INT-03)
3. Integrationsansvarig kan köra om och återuppta leveranser utan dubbletter eller förlorade ändringar. Oväntat tom leverans eller föreslagen massborttagning ger en tydlig avvikelse och raderar inte registret tyst. (INT-04, INT-05)
4. Administratören kan se aktuell källa, senaste lyckade och avstämda synk, fel och inaktuella uppgifter samt följa ett kontrollerat omförsök. (INT-06)
5. Personal kan slutföra elev-, uppdrags- och importgranskning på dator, telefon och med tangentbord, med begriplig status, synligt fokus och kvarvarande inmatning vid rättningsbara fel. (UX-01)

**Plans**: TBD
**UI hint**: yes

Ett simulerat API kan användas för interna kontrakts- och felprov och redovisas som sådant. Val av verklig källa, skrivansvar och kontrakt behöver fastställas innan den verkliga adaptern godkänns. Faktiskt anslutningsprov har egen kravägare i fas 7. UX prövas vid varje berörd förändring; fasen äger den samlade verifieringen.

Lärarregisterspårets L2 kan återanvända dessa importmönster, men får eget person-/behörighetskontrakt, kund-/skolmandat och verifieringsresultat. INT-02–06 behåller elev-/placeringsavgränsningen; en lärarimport räknas inte som dessa kravs leverans.

### Phase 7: Verifierad kommunanslutning

**Goal**: Pilotansvarig kan skilja interna prov från godkända faktiska anslutningar för personalidentitet, kontolivscykel och elevregister.
**Depends on**: Phase 6
**Requirements**: IAM-02, IAM-06, INT-07
**Success Criteria** (what must be TRUE):

1. Personal kan logga in genom pilotens godkända faktiska identitetsanslutning med avtalade autentiseringskrav. Fel utfärdare, otillåten inloggningsväg och kontokollision ger ingen åtkomst. (IAM-02)
2. Pilotansvarig kan följa kontotilldelning och avveckling från den valda externa källan och jämföra uppmätt fördröjning till appens spärr med en överenskommen tidsgräns. (IAM-06)
3. Pilotansvarig kan granska ett dokumenterat godkänt anslutningsprov mot registerleverantörens faktiska test-/pilotmiljö. Rapporten skiljer detta från simulatorprov. (INT-07)

**Plans**: TBD
**UI hint**: yes

**Extern godkännandegräns:** Vald pilotkund, IdP, kontokälla, registerleverantör, tilldelad åtkomst och överenskomna acceptansvillkor krävs. Saknas de förblir berörda krav öppna och fasen får inte markeras genomförd. Anslutningsprov förbereds från fas 1 och får köras tidigare när deras förutsättningar är uppfyllda; fasen samlar deras slutliga godkännande.

Om Skolverkets lärarregister väljs får L4 eget bevis för faktisk XML-/API-leverans och egna acceptansvillkor. Det ersätter inte INT-07:s elevregisterprov eller IAM-02/IAM-06. Någon offentlig API-åtkomst till läraruppslag har ännu inte verifierats.

### Phase 8: Prövad pilotdrift och informationshantering

**Goal**: Kunden kan fatta ett underbyggt beslut om avgränsad verklig användning och kan återställa, utreda samt avsluta piloten med fortsatt kontroll över information och åtkomst.
**Depends on**: Phase 7
**Requirements**: INFO-01, OPS-01, OPS-02, OPS-03, OPS-04
**Success Criteria** (what must be TRUE):

1. Ansvarig funktion kan fastställa hur information återfinns, bevaras/gallras och lämnas ut, med hänvisning till kundens faktiska process eller diarium och ett genomfört syntetiskt arbetsprov. (INFO-01)
2. Pilotansvarig kan granska faktisk drift, personuppgiftsflöden, underleverantörer, avtal och bedömning av behovet av konsekvensbedömning innan beslut om verkliga elevuppgifter. (OPS-01)
3. Driftansvarig kan återställa avtalade data och relevanta filer i avskild miljö inom beslutade mål, avstämma resultatet och bevara aktuella spärrar innan åtkomst öppnas. (OPS-02)
4. Pilotansvarig kan följa ett genomfört incidentprov med utsedda kontaktvägar och granska oberoende säkerhetsprov samt kvarstående avvikelser inför pilotbeslut. (OPS-03)
5. Kunden kan få en avstämd export av överenskomna data och avsluta anslutningen med återkallad åtkomst samt dokumenterad fortsatt hantering enligt bevarande-/gallringsbeslut. (OPS-04)

**Plans**: TBD
**UI hint**: no

Informationshantering kan bygga på kundens etablerade process; en egen publik diarietjänst ingår inte. Drift- och avtalsfrågor förbereds från fas 1. Inga verkliga elevuppgifter får föras in innan kundens driftbeslut och tillämpliga godkännanden finns; ett godkänt syntetiskt prov ändrar inte denna gräns.

Inför faktisk användning av lärarregisterspåret kompletteras underlaget med personal-/personnummerflöden, ändamål för kontroll respektive löpande planering, åtkomst, källbevarande/gallring, färskhet, återställning och avslut. L4:s föreslagna gränser finns i researchunderlaget; ingen sådan drift är godkänd genom planeringsöversynen.

## Registrerat delprojekt: sammanhängande schemamoduler

Användarinriktning 2026-10-01. SCHEMA-01–08 finns bland senare produkt- och utvärderingskrav med verifieringsmål i [projektunderlaget](research/SCHEMAMODUL-PROJEKT.md). Föreslagen ordning: S1 gemensamma kontrakt/mandat/regler; S2 avskild Rust-/motorprototyp och jämförande AI-utvärdering med möjlighet att avstå från AI; S3 plan–grupp–schema med granskning och synk; S4 komponentbyte och vald extern adapter. Dessa är ej genomförda planeringssteg i delprojektet, inte nya numrerade faser i v1.0. Genomförandeplaceringen återstår; kompatibilitetsfrågorna ska beaktas redan i fas 5. Den befintliga schematodon är uppdaterad, inte duplicerad.

MODUL-01–04 kompletterar projektet med användarens beslut om separat köp av moduler. S1 ska definiera köpbara gränser, beroenden och kundens modultillgång skild från personmandat. S4 provar olika köpta kombinationer, externt planunderlag och tillägg/avslut med bevarad historik. Prissättning och betalningsväg är öppna; ingen kommersiell funktion är verifierad.

### Föreslaget lärarregisterspår — planeringsöversyn 2026-10-05

[Underlaget](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) och [uppgiften](todos/pending/2026-10-05-integrera-skolverkets-lararbehorigheter.md) beskriver L1 kontrakt/personmatchning tillsammans med S1, L2 skyddad XML-import, L3 tjänstefördelning och regelkontroll i S3 samt L4 faktiskt anslutnings-/driftprov kopplat till S4. S2 ska kunna pröva syntetiska behörighetsbegränsningar. LLEG-01–04 är föreslagna planeringsmål med ett ansvarigt steg och väntande verifiering, inte tillägg till pilotens godkända krav eller nya numrerade faser. Omfattning och genomförandeplaner återstår. Aktuell fas 5-ordning behålls.

## Genomförande och verifiering

Varje fas följer GSD:s diskussion, planering, genomförande och användarverifiering. Fasplanen utgår från aktuell berörd kod och beskriver dagens beteende, önskat beteende, datavägar, migrering, återgång och användarprov. En dataväg växlas i taget med avstämda ID:n; återgång får inte återöppna demoåtkomst eller äldre överbehörigheter.

Kundavgränsning, aktuella mandat, spärr, skyddade syntetiska elever och obligatorisk audit är villkor för varje ny operation. Varje krav har en ansvarig fas nedan; senare beroendefaser bevarar skydden och utökar provunderlaget för sina datavägar. Verifieringsresultat länkas från kravens spårbarhet när de finns. Inga krav markeras färdiga genom enbart planering eller historiska appprov.

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Förberedelser för externa anslutningar och drift löper från början; de ändrar inte godkännandegränserna.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Baslinje och avskild pilotmiljö | 10/10 | Complete    | 2026-09-12 |
| 2. Verifierad kontoåtkomst | 12/12 | Complete | 2026-09-21 |
| 3. Mandat och skyddade datavägar | 7/7 | Complete    | 2026-09-28 |
| 4. Beständigt och skyddat elevregister | 24/25 | In progress — våg 14 klar: 04-21 (handbok byggd, förnyad lokal syntetisk fullgrind PASS på 8923529, browser 39/39, SQL 17/17); nästa våg 15: 04-22 användarprov och fasverifiering | - |
| 5. Bevarade utbildnings- och klassflöden | 16/16 hittills skrivna automatiskt genomförda | In progress — samma nya/befintliga programflöde verifierat automatiskt och redo för nytt mänskligt prov; handledningsbedömning, utbildnings-/beslutsflöden och fasverifiering öppna | - |
| 6. Avstämd registerimport | 0/TBD | Not started | - |
| 7. Verifierad kommunanslutning | 0/TBD | Not started | - |
| 8. Prövad pilotdrift och informationshantering | 0/TBD | Not started | - |

**Coverage:** 42/42 v1-krav har exakt en ansvarig fas; inga omappade eller dubbelt tilldelade krav. Detaljkraven och denna fördelning godkändes 2026-09-11. Fas 1:s tre krav är verifierade 2026-09-12 och fas 2:s sex krav är verifierade 2026-09-21. Fas 3:s sex krav är verifierade lokalt syntetiskt 2026-09-28. Övriga 27 krav väntar på genomförande eller slutverifiering. Fas 4:s åtta krav har gröna automatiska syntetiska bevis, men mänskligt användarprov och separat fasverifiering återstår.

---
*Last updated: 2026-10-04 — 05-18 automatiskt verifierad; mänskligt prov, fas 4:s checkpoint och full fasverifiering kvarstår.*


Aktuellt 2026-10-02: 05-15/05-16 genomförda automatiskt på skyddat bygge `023e68b`. Samma program → inriktning → programfördjupning används för befintligt rektorsarbete och huvudmannens nya gymnasieutbildning/utkast. Fulla programbrowser 38/38 och timplan 20/20, cleanup 58/58, ny API 43/43 och 128 riktade Node-prov PASS. Typ/lint/skyddat bygge och handbok PASS; tio dator-/telefonbilder granskade. Vanlig 3012 kör direkt workerd; nio bevarade exempel för R/HM lästa med 40 auditpar och fyra verkliga lokala OIDC/MFA-inloggningar PASS. Ny mänsklig begriplighetsbedömning väntar. ADMIN-02/full fas 5, nationella beslut, paket, kullkopiering och klasskoppling är öppna.

Aktuellt 2026-10-04: 05-18 levererar versionsbunden poängfördelning över sex terminer, årskurskort och mobilinmatning. Nya terminsflödet 16/16, program 40/40, API 31/31 och SQL 236/236 PASS; timplanens 20 beteenden PASS över 19+1, två externa setup-timeouts bevarade. Mänskligt prov och full ADMIN-02/fas 5 återstår; se 05-18-SUMMARY/REVIEW. Vanlig 3012 uppdaterad till d37f566.
