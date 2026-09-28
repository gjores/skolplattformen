# Requirements: Skolplattformen

**Defined:** 2026-09-10

**Milestone:** v1.0 — Säker administration inför en pilot

**Core Value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.

**Status:** Godkända av användaren 2026-09-11 tillsammans med färdplanens åtta faser. Nio krav är verifierade efter fas 1–2; övriga 33 inväntar genomförande och verifiering.

## v1 Requirements

Kraven avser en avgränsad pilot, inte fullständig ersättning av alla skolans system. Befintliga funktioner räknas inte som produktionsverifierade bara för att de fungerar med demoidentitet. Samtliga nedanstående krav ska prövas efter förändringarna och kopplas till exakt en ansvarig fas.

### Baslinje och pilotens kontrakt

- [x] **BASE-01**: Projektansvarig kan återgå till en versionshanterad baslinje för den befintliga appen och se vilka uppskattade arbetsflöden som passerar dokumenterade regressionsprov.
- [x] **BASE-02**: Pilotansvarig kan använda en avskild test-/pilotmiljö där anonym demoetablering och automatisk exempeldata inte kan ge åtkomst till skyddade driftvägar.
- [x] **PILOT-01**: Pilotansvarig kan granska en daterad anslutningsprofil med ansvarig organisation, valda elevuppgifter, originalkälla och skrivansvar, pilotvolym samt öppna kund- och leverantörsberoenden.

### Identitet och kontolivscykel

- [x] **IAM-01**: En verifierad företrädare kan etablera kundens första medlemskap utan att enbart ett angivet organisationsnummer eller en e-postdomän ger rättigheter.
- [ ] **IAM-02**: Personal kan logga in via pilotens godkända identitetsanslutning med avtalade autentiseringskrav; fel utfärdare, otillåten inloggningsväg och kontokollisioner ger ingen åtkomst.
- [x] **IAM-03**: Personal med flera giltiga uppdrag kan välja tillåten arbetskontext; varje uppdrag anger organisation, relevant skolenhet och giltighet utan att rättigheter blandas.
- [x] **IAM-04**: Personal kan logga ut så att skyddad åtkomst för den avslutade appsessionen upphör och föregående elevinnehåll rensas ur relevant klienttillstånd, även vid kontextbyte och flera flikar.
- [x] **IAM-05**: Behörig administratör kan spärra ett medlemskap eller avsluta ett uppdrag så att nästa skyddade anrop nekas även med tidigare utfärdad token.
- [ ] **IAM-06**: Pilotansvarig kan följa extern kontotilldelning och avveckling samt se uppmätt fördröjning från vald källa till appens spärr mot en överenskommen tidsgräns.

### Behörighet och ansvar

- [x] **ACL-01**: En användare nekas åtkomst till annan kunds objekt och röjande metadata via direkt anrop, vy, sökning, export och tillgängliga filvägar.
- [x] **ACL-02**: Rektor kan tilldela och avsluta läraruppdrag endast vid de skolenheter rektorn leder under aktuell giltighet; huvudmannens vanliga roll kan inte göra samma tilldelning.
- [x] **ACL-03**: Huvudmannen kan utse rektor inom sin organisation; en rektor kan inte tilldela sig själv eller andra rektorsmandat.
- [x] **ACL-04**: Lärare och skoladministratör får endast de elev- och administrativa åtgärder som den fastställda uppdragsmatrisen medger; okända eller saknade rättigheter nekar åtkomst.
- [x] **ACL-05**: Kommunens IT-funktion kan administrera anslutningen utan generell elevinsyn, och eventuell supportåtkomst är separat tilldelad, tidsbegränsad och spårbar.

### Beständigt elevregister

- [ ] **STU-01**: Behörig administratör kan återfinna samma elev och sparade basuppgifter efter utloggning och omläsning genom ett stabilt internt ID skilt från elevens eventuella inloggningskonto.
- [ ] **STU-02**: Administratören kan se aktuell, framtida och avslutad skolplacering med giltighetsdatum och bevarad historik enligt pilotens placeringsregler.
- [ ] **STU-03**: Administratören kan se och hantera tillåtna datumsatta klasstillhörigheter utan att klassbyte automatiskt byter utbildning eller skriver om tidigare tillhörighet.
- [ ] **STU-04**: Administratören kan se uppgiftens ursprung och rätta den i den källa som har skrivansvar; en lokal rättelse kan inte tyst skrivas över av en annan källa.
- [ ] **STU-05**: Administratören kan söka och filtrera tillåtna elever per skola och läsår, skilja namnlika elever åt med tillåtna uppgifter och återgå till samma urval.
- [ ] **STU-06**: Två administratörer som ändrar samma uppgift får en begriplig versionskonflikt i stället för att nyare data tyst skrivs över.

### Skyddsvärda uppgifter och export

- [ ] **DATA-01**: Behörig personal kan utföra pilotens fastställda arbetsfall för en skyddad syntetisk elev, medan obehöriga läsvägar, sökträffar, fel och aviseringar inte röjer skyddade uppgifter eller metadata.
- [ ] **DATA-02**: Behörig administratör kan exportera endast tillåtna elever och fält för ett uttryckligt urval; exporten kontrolleras på servern, loggas och följer samma spärr- och skyddsregler som elevvyn.

### Spårbarhet

- [x] **AUDIT-01**: Behörig granskare kan följa pilotens beständiga ändringar med serververifierad aktör, faktiskt uppdrag, tid, källa, objekt och resultat; klienten kan inte välja en annan loggad aktör eller roll.
- [x] **AUDIT-02**: Behörig säkerhetsfunktion kan spåra de elevläsningar, exporter och nekade åtkomstförsök som pilotens loggpolicy kräver, även när någon försöker använda en alternativ direkt dataväg.
- [x] **AUDIT-03**: Pilotansvarig kan kontrollera att loggar har begränsad åtkomst, minimerat innehåll, beslutad lagringstid och ett provat beteende vid loggbortfall.

### En kommunintegration

- [ ] **INT-01**: Kommunens integrationsansvariga kan konfigurera och stoppa den valda anslutningen med en separat maskinidentitet vars åtkomst är begränsad till rätt kund och objekt.
- [ ] **INT-02**: Integrationsansvarig kan läsa in överenskomna elev- och placeringsobjekt från en vald källa med validerade fält, stabila externa ID:n och dokumenterad kontraktsversion; SS 12000 används när motpartens relevanta stöd är verifierat.
- [ ] **INT-03**: Administratören kan granska tillägg, ändringar och avvikelser före pilotens första införande och få radvisa fel utan att felaktiga rader blir tyst godkända.
- [ ] **INT-04**: Integrationsansvarig kan köra om samma leverans och återuppta en avbruten körning utan dubbla elever, förlorade ändringar eller oförklarliga delresultat.
- [ ] **INT-05**: Administratören får en tydlig avvikelse vid oväntat tom leverans eller föreslagen massborttagning; sådana leveranser kan inte tyst radera elevregistret.
- [ ] **INT-06**: Administratören kan se senaste lyckade och avstämda synk, aktuell källa, fel och inaktuella uppgifter samt följa ett kontrollerat omförsök.
- [ ] **INT-07**: Pilotansvarig kan se ett dokumenterat godkänt anslutningsprov mot den valda leverantörens faktiska test-/pilotmiljö; ett lokalt simulerat API redovisas separat och uppfyller inte detta krav.

### Bevarade administrationsflöden

- [ ] **ADMIN-01**: Huvudmannen kan fortsatt lägga till skola från organisationsnummer eller skolenhetskod med adress och skolform ur registret, medan lokalt tillsatt rektor bevaras vid registeruppdatering.
- [ ] **ADMIN-02**: Behörig personal kan fortsatt skapa gymnasieutbildning och lägga till kurser/nivåer med de befintliga planversionernas beslutsregler efter införandet av verkliga identiteter.
- [ ] **ADMIN-03**: Huvudmannen kan fortsatt kopiera utbildningsupplägg till en senare elevkull med egna planutkast utan att kopiera elever, klasser eller tidigare beslut.
- [ ] **ADMIN-04**: Behörig personal kan koppla en beständig klass till en fastställd timplansversion och se korrekt läsårsunderlag; en ny version flyttar inte automatiskt den befintliga kopplingen.
- [ ] **UX-01**: Personal kan slutföra pilotens elev-, uppdrags- och importgranskningsflöden på dator och telefon samt med tangentbord, med begriplig status, synligt fokus och kvarvarande inmatning vid rättningsbara fel.

### Informationshantering och drift

- [ ] **INFO-01**: Pilotens ansvariga funktion kan granska och fastställa hantering för informationens återfinning, bevarande/gallring och utlämnande, med hänvisning till kundens faktiska process eller diarium och ett genomfört syntetiskt arbetsprov.
- [ ] **OPS-01**: Pilotansvarig kan granska faktisk drift, personuppgiftsflöden, underleverantörer, avtal och bedömning av behovet av konsekvensbedömning före beslut om verkliga elevuppgifter.
- [ ] **OPS-02**: Driftansvarig kan återställa pilotens avtalade data och relevanta filer i avskild miljö inom beslutade mål, avstämma resultatet och bevara aktuella spärrar innan åtkomst öppnas.
- [ ] **OPS-03**: Pilotansvarig kan genomföra ett spårbart incidentprov med utsedda kontaktvägar och granska oberoende säkerhetsprov samt kvarstående avvikelser före pilotbeslut.
- [ ] **OPS-04**: Kunden kan få en avstämd export av överenskomna data och avsluta anslutningen med återkallad åtkomst och dokumenterad fortsatt hantering enligt bevarande-/gallringsbeslut.

## v2 Requirements

Senarelagda delar av visionen. De är inte borttagna produktmål och behöver egen avgränsning.

- **STUDY-01**: Beständiga individuella studieplansflöden, rättelser och relevant examens-/betygsvalidering.
- **GROUP-01**: Fullständig tjänstefördelning, undervisningsgrupper och schemaflöden med datumsatta elev-/lärarrelationer.
- **TEACH-01**: Undervisning, arbetsområden, elevinlämningar och återkoppling med riktig lagring och åtkomst.
- **CASE-01**: Verksamhetsgranskade elevärenden, stödinsatser, beslut, kommunikation och uppföljning.
- **GUARD-01**: Vårdnadshavarportal med verifierade relationer och lämplig e-legitimering.
- **INT-08**: Fler kommun- och leverantörsanslutningar samt skrivning tillbaka där informationsansvar är beslutat.
- **RECORD-01**: Eventuell egen diariefunktion/publik tjänst efter separat produktbeslut och rättslig granskning.
- **HOST-01**: Leverans för kommunal egen drift efter provad installation, uppgradering och förvaltning.
- **PARITY-01**: Fortsatt genomgång av SchoolSoft-funktionsregistret med varje relevant område märkt byggt, planerat, senarelagt eller ej tillämpligt och verifiering skild från leverantörsbeskrivning.

## Out of Scope

| Funktion | Skäl |
|----------|------|
| Medicinska elevhälsojournaler i vanliga elevregistret | Separat informations- och åtkomstområde kräver egen utredning. |
| Automatisk myndighetsutövning, sekretessprövning eller lagtolkning från etiketter | Verksamhets-/juridisk bedömning kan inte ersättas av status, elevantal eller markering. |
| Generell fullständig tvåvägssynk för alla leverantörer | Första milstolpen bevisar ett avgränsat läsande registerflöde. |
| Offlinekopior av känsligt elevinnehåll och separat native-mobilapp | Responsiv webb är första leverans; fler datakopior/distributionsvägar kräver eget behov. |
| Komplett SchoolSoft-paritet före första pilot | Behovskatalogen bevaras, men vald milstolpe är avgränsad. |

## Traceability

Fördelningen nedan godkändes av användaren 2026-09-11 tillsammans med färdplanen. Varje v1-krav har exakt en ansvarig fas. Status Pending avser återstående genomförande och verifiering; "Genomförd — väntar verifiering" betyder att fasens planer är körda och användarens checkpoint godkänd, men att gsd-verifiers fasverifiering ännu inte satt Verifierad. Länk till fasens bevis läggs till när prov finns.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BASE-01 | Phase 1 | Verifierad 2026-09-12 (01-VERIFICATION.md; docs/pilot/baseline.md) |
| BASE-02 | Phase 1 | Verifierad 2026-09-12 (01-VERIFICATION.md; docs/pilot/baseline.md) |
| PILOT-01 | Phase 1 | Verifierad 2026-09-12 (01-VERIFICATION.md; docs/pilot/connection-profile.md) |
| IAM-01 | Phase 2 | Verifierad 2026-09-21 (02-VERIFICATION.md; phase2-summary.json) |
| IAM-02 | Phase 7 | Pending |
| IAM-03 | Phase 2 | Verifierad 2026-09-21 (02-VERIFICATION.md; phase2-summary.json) |
| IAM-04 | Phase 2 | Verifierad 2026-09-21 (02-VERIFICATION.md; phase2-summary.json) |
| IAM-05 | Phase 2 | Verifierad 2026-09-21 (02-VERIFICATION.md; phase2-summary.json) |
| IAM-06 | Phase 7 | Pending |
| ACL-01 | Phase 2 | Verifierad 2026-09-21 (02-VERIFICATION.md; phase2-summary.json) |
| ACL-02 | Phase 3 | Complete |
| ACL-03 | Phase 3 | Complete |
| ACL-04 | Phase 3 | Complete |
| ACL-05 | Phase 3 | Complete |
| STU-01 | Phase 4 | Pending |
| STU-02 | Phase 4 | Pending |
| STU-03 | Phase 4 | Pending |
| STU-04 | Phase 4 | Pending |
| STU-05 | Phase 4 | Pending |
| STU-06 | Phase 4 | Pending |
| DATA-01 | Phase 4 | Pending |
| DATA-02 | Phase 4 | Pending |
| AUDIT-01 | Phase 2 | Verifierad 2026-09-21 (02-VERIFICATION.md; phase2-summary.json) |
| AUDIT-02 | Phase 3 | Complete |
| AUDIT-03 | Phase 3 | Complete |
| INT-01 | Phase 6 | Pending |
| INT-02 | Phase 6 | Pending |
| INT-03 | Phase 6 | Pending |
| INT-04 | Phase 6 | Pending |
| INT-05 | Phase 6 | Pending |
| INT-06 | Phase 6 | Pending |
| INT-07 | Phase 7 | Pending |
| ADMIN-01 | Phase 5 | Pending |
| ADMIN-02 | Phase 5 | Pending |
| ADMIN-03 | Phase 5 | Pending |
| ADMIN-04 | Phase 5 | Pending |
| UX-01 | Phase 6 | Pending |
| INFO-01 | Phase 8 | Pending |
| OPS-01 | Phase 8 | Pending |
| OPS-02 | Phase 8 | Pending |
| OPS-03 | Phase 8 | Pending |
| OPS-04 | Phase 8 | Pending |

**Coverage:** 42/42 v1-krav mappade; 0 omappade; 0 dubbla ansvariga faser. 39 krav är Pending; BASE-01, BASE-02 och PILOT-01 är verifierade i fas 1.

## Acceptance Boundaries

- Skolform, pilotvolym, IdP, registerleverantör och tidsmål beslutas i anslutningsprofilen; inga godtyckliga SLA-tal införs här.
- Kontraktstester med syntetiska data möjliggör utveckling men ersätter inte kundens verkliga anslutningsprov eller driftbeslut.
- Aktuell lokal spärr och fördröjningen från extern källa till spärr är separata prov.
- Grundskola och gymnasium delar säkerhetsgrund; bevarade utbildnings- och klassflöden provas med båda skolformerna där de är tillämpliga.
- Acceptans av en fas betyder inte att det är tillåtet att lägga verkliga elevuppgifter i utvecklingsprojektet.

---
*Last updated: 2026-09-12 — BASE-01, BASE-02 och PILOT-01 verifierade i fas 1 (01-VERIFICATION.md status passed, användarens checkpoint godkänd). Övriga 39 krav Pending.*
