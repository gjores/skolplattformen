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

**Plans**: 05-01–05-09 och 05-12 genomförda till 2026-10-01. Skyddad GR/IM-timplanslista/celländring och separat strikt programplansreferensgrund verifierade; övriga utbildnings- och versionsflöden återstår.

- [x] 05-01-PLAN.md — Kodförankrat mandat-/bevarandekontrakt och verifieringsmatris; inga skyddade vyer öppnade
- [x] 05-02-PLAN.md — Lokal sparordning/databas-ID rättade med ordinarie regression; 346/346 tester, typ/lint/bygge PASS; inga skyddade vyer öppnade
- [x] 05-03-PLAN.md — Stängd mandatavgränsad timplansläsning/celländring med revision och atomisk DB-audit; SQL 77/77, lås 4/4 PASS; session/API/UI återstår

- [x] 05-04-PLAN.md — Sessionskopplad timplans-API, MFA/konflikt/audit, preflight/final 29/29 PASS och exakt två Worker-grants; UI/gymnasieskrivning stängda

- [x] 05-05-PLAN.md — Auditerad GR/IM-lista och kolumnmetadata, API preflight/final 39/39, SQL 59/77/27, lås 4/4 och exakt tre Worker-entrypoints
- [x] 05-06-PLAN.md — Skyddad timplansvy med celländring, osparat skydd/konflikt/rensning, browser 18/18 och byggd handbok; övriga planeringskommandon stängda
- [x] 05-07-PLAN.md — Reproducerbart katalogartefakt, exakta program-/ämnes-/nivåreferenser och serverintegritet; 451/451 prov, typ/lint/skyddat bygge PASS; inga gymnasieskrivningar öppnade

- [x] 05-08-PLAN.md — Oföränderlig SQL-katalog och stängda sessions-/mandatbundna utkast med CAS/audit; 632 SQL, 455+5 Node, 42 paritet och 6 observerade låsväntansfall + rollback PASS; inga API/grants/beslut öppnade

- [x] 05-09-PLAN.md — Skyddad programplans-API, preflight/final 48/48, SQL 663, gamla timplans-API 39 och oberoende granskning 6/6 PASS; exakt fem nya grants efter återställd preflight
- [ ] 05-10-PLAN.md — Gymnasieurval, versions-/legacyunderlag och uttrycklig verifierad katalogkälla före UI; förberedande genomförande pågår
- [ ] 05-11-PLAN.md — Skyddad programplansvy, utkast/kloning, dator-/telefonprov, handbok och samlat mänskligt prov; förbereds bakom stängd navigation
- [x] 05-12-PLAN.md — Regelhandledning i befintlig timplansvy och dialog, GR/IM-källor och handbok; 20/20 browserprov och skyddat bygge PASS. Mänsklig förståelsebedömning följer med 05-11.

05-11 ska öppna programplansvyn efter 05-09/05-10:s verifierade API. Användaren har 2026-10-01 godkänt automatisk fortsättning till nästa konkreta mänskliga prov. Programplanernas framtida direkta HM-fastställande ur utkast bevaras; nationella alternativ/ramar och historiskt obundna poster kräver uttrycklig kontroll. Beslut, utbildningsskapning, kullkopiering och klasskoppling återstår som egna kontrollerbara steg. 05-12 genomfördes parallellt med 05-09 och utökar ingen regelkontroll eller beslutsrättighet.

Fas 5 genomförs i avgränsade delplaner på användarens instruktion. Fas 4:s kvarstående användarprov/datumanmärkning och separata fasverifiering behålls öppna.

Planeringsgräns 2026-10-01: användarens [delprojekt för sammanhängande schemamoduler](research/SCHEMAMODUL-PROJEKT.md) ska beaktas i berörda återstående planer. Redovisa stabila ID:n, exakta plan-/katalogversioner, undervisningstidens enheter, giltighet, klasskopplingar och ändringsansvar så programplaner, timplaner och framtida studieplan/schema kan samverka. ADMIN-01–04 behålls; Rustmotor och nya schemafunktioner får egna genomförandeplaner. AI utvärderas separat; eventuell AI-koppling planeras bara efter införandebeslut.

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

## Registrerat delprojekt: sammanhängande schemamoduler

Användarinriktning 2026-10-01. SCHEMA-01–08 finns bland senare produkt- och utvärderingskrav med verifieringsmål i [projektunderlaget](research/SCHEMAMODUL-PROJEKT.md). Föreslagen ordning: S1 gemensamma kontrakt/mandat/regler; S2 avskild Rust-/motorprototyp och jämförande AI-utvärdering med möjlighet att avstå från AI; S3 plan–grupp–schema med granskning och synk; S4 komponentbyte och vald extern adapter. Dessa är ej genomförda planeringssteg i delprojektet, inte nya numrerade faser i v1.0. Genomförandeplaceringen återstår; kompatibilitetsfrågorna ska beaktas redan i fas 5. Den befintliga schematodon är uppdaterad, inte duplicerad.

MODUL-01–04 kompletterar projektet med användarens beslut om separat köp av moduler. S1 ska definiera köpbara gränser, beroenden och kundens modultillgång skild från personmandat. S4 provar olika köpta kombinationer, externt planunderlag och tillägg/avslut med bevarad historik. Prissättning och betalningsväg är öppna; ingen kommersiell funktion är verifierad.

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
| 5. Bevarade utbildnings- och klassflöden | 10/12 hittills planerade | In progress — 05-09 API och 05-12 handledning klara; 05-10/05-11 genomförs till mänskligt prov | - |
| 6. Avstämd registerimport | 0/TBD | Not started | - |
| 7. Verifierad kommunanslutning | 0/TBD | Not started | - |
| 8. Prövad pilotdrift och informationshantering | 0/TBD | Not started | - |

**Coverage:** 42/42 v1-krav har exakt en ansvarig fas; inga omappade eller dubbelt tilldelade krav. Detaljkraven och denna fördelning godkändes 2026-09-11. Fas 1:s tre krav är verifierade 2026-09-12 och fas 2:s sex krav är verifierade 2026-09-21. Fas 3:s sex krav är verifierade lokalt syntetiskt 2026-09-28. Övriga 27 krav väntar på genomförande eller slutverifiering. Fas 4:s åtta krav har gröna automatiska syntetiska bevis, men mänskligt användarprov och separat fasverifiering återstår.

---
*Last updated: 2026-10-01 — schemadelprojekt och kompatibilitetsgräns registrerade; fas 5:s åtta delplaner genomförda, fas 4:s checkpoint och fasverifiering kvarstår.*
