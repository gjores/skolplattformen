# Roadmap: Skolplattformen

## Overview

**Milestone:** v1.0 — Säker administration inför en pilot

**Status:** Godkänd av användaren 2026-09-11 — 42 detaljkrav och åtta faser är fastställda. Genomförande återstår.

**Granularity:** standard

Den befintliga appen utvecklas stegvis till en avgränsad pilot: först en återställbar baslinje, därefter verifierad åtkomst och spårbara mandat, beständiga elever och en avstämd registerimport. Gymnasiets utbildningar, kurs-/nivåtillägg, kullkopiering och explicita klass–timplanskopplingar bevaras och prövas vid berörda förändringar. Faktisk kommunanslutning och beslut om verkliga elevuppgifter har egna godkännandegränser.

## Phases

Heltalsfaser är planerad milstolpeomfattning. Eventuella decimalfaser förs in mellan sina omgivande heltal. Fas 1 är genomförd (alla 10 planer körda, användarens checkpoint godkänd 2026-09-12) och väntar på gsd-verifiers fasverifiering; övriga faser är inte påbörjade.

- [x] **Phase 1: Baslinje och avskild pilotmiljö** - Befintliga arbetsflöden går att pröva och återställa inom en tydlig pilotgräns. (completed 2026-09-12)
- [ ] **Phase 2: Verifierad kontoåtkomst** - Konton, arbetskontext och sessionsspärr styr den första spårbara skyddade operationen.
- [ ] **Phase 3: Mandat och skyddade datavägar** - Huvudman, rektor och personal får endast sitt aktuella mandat med kontrollerbar säkerhetslogg.
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

**Plans**: TBD
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

**Plans**: TBD
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

**Plans**: TBD
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

**Plans**: TBD
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

## Genomförande och verifiering

Varje fas följer GSD:s diskussion, planering, genomförande och användarverifiering. Fasplanen utgår från aktuell berörd kod och beskriver dagens beteende, önskat beteende, datavägar, migrering, återgång och användarprov. En dataväg växlas i taget med avstämda ID:n; återgång får inte återöppna demoåtkomst eller äldre överbehörigheter.

Kundavgränsning, aktuella mandat, spärr, skyddade syntetiska elever och obligatorisk audit är villkor för varje ny operation. Varje krav har en ansvarig fas nedan; senare beroendefaser bevarar skydden och utökar provunderlaget för sina datavägar. Verifieringsresultat länkas från kravens spårbarhet när de finns. Inga krav markeras färdiga genom enbart planering eller historiska appprov.

## Progress

**Execution Order:** 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8. Förberedelser för externa anslutningar och drift löper från början; de ändrar inte godkännandegränserna.

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Baslinje och avskild pilotmiljö | 10/10 | Complete   | 2026-09-12 |
| 2. Verifierad kontoåtkomst | 0/TBD | Not started | - |
| 3. Mandat och skyddade datavägar | 0/TBD | Not started | - |
| 4. Beständigt och skyddat elevregister | 0/TBD | Not started | - |
| 5. Bevarade utbildnings- och klassflöden | 0/TBD | Not started | - |
| 6. Avstämd registerimport | 0/TBD | Not started | - |
| 7. Verifierad kommunanslutning | 0/TBD | Not started | - |
| 8. Prövad pilotdrift och informationshantering | 0/TBD | Not started | - |

**Coverage:** 42/42 v1-krav har exakt en ansvarig fas; inga omappade eller dubbelt tilldelade krav. Detaljkraven och denna fördelning godkändes 2026-09-11. Fas 1 (BASE-01, BASE-02, PILOT-01) är genomförd och väntar på verifiering; inget krav är ännu markerat Verifierad.

---
*Last updated: 2026-09-12 — fas 1 genomförd (10/10 planer, verify:phase1 PASS, checkpoint godkänd); nästa steg är fasverifiering, därefter diskussion inför fas 2.*
