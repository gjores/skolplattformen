# Requirements: Skolplattformen

**Klassorganisation 2026-10-15:** Användaren beställer research om tidigare läsårsval och klassval/skapande vid ny programplan. [Research](research/KLASSER-KULLAR-OCH-PLANER-2026-10-15.md) och [planeringspunkt](todos/pending/2026-10-15-klassorganisation-vid-utbildningsstart.md) är klara. Den visade timplanens frysta start är 2027-08-01, så 2027/28 är giltigt i just exemplet; ingen sparad förtidig koppling är belagd. Förslag: tidigt frivilligt klasssteg per utbildning/kull, separerat från timplansversion och med oförändrade mandat i första etappen. Ingen implementation eller kopieacceptans följer av researchen.

**Aktuell fasbedömning:** Skolflödets användarprov är godkänt och den äldre registeradapterns Workerfel är rättat. [Samlad kravbedömning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md) pekar ut endast [kullkopieringens mänskliga prov](phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-REMAINING-USER-TRIAL.md) som nästa användartest. Godkända skol-/års-/besluts-/versionsprov ska inte upprepas. Bygge `f4987b6` kör på 3012; API-adapterprov, 27 Node-prov och fem läsande OIDC-kontroller passerar. Prestandabacklogg och historiska integritetsavvikelser består; fasen är inte slutgodkänd.

**Skolimport och registeruppdatering 2026-10-14:** ADMIN-01:s skyddade huvudmannaflöde är implementerat och lokalt verifierat: SQL62, Node23, UI24, faktisk Workerpreflight25/slut25 samt läsande lokal OIDC5 PASS. Samma 197 byggfiler från `970782f` kör på 3012. Rektor, lokala årskurser, elevregisterkälla och mandat bevaras; import tilldelar inga uppdrag. [Verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-VERIFICATION.md). Nästa steg är [det avskilda användarprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-SCHOOL-REGISTRY-USER-TRIAL.md), **awaiting_user**, med simulerade skolor på 5198. Fullt krav-/fasgodkännande, historiska avvikelser och prestandabacklogg består. Tidigare versionsbytesprov är användarrapporterat godkänt; kullkopiering/mobil saknar separat resultat. Äldre noteringar nedan är historik.

**Fasgenomgång och kullkopiering 2026-10-14:** Två verkliga luckor identifierades: huvudmannens skyddade skolimport/registeruppdatering (ADMIN-01) och delkopiering vid avbrott (ADMIN-03). Kopieringen är rättad: ram, terminer och skolor sparas atomärt med requestbundet statuskvitto. SQL44, Workerpreflight16/slut16, UI18, faktisk browser2, Node41, typ/lint/bygge/handbok PASS. 3012 kör prövat `2836908`, 192 bytekontrollerade filer. [Nytt användarprov](phases/05-bevarade-utbildnings-och-klassfloden/05-COPY-CLASS-USER-TRIAL.md) för kopiering och klass/läsår/version väntar; befintliga SAM_TEST-utkast behöver först granskas/fastställas för klassprovet. [Kravgenomgång](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-AUDIT-20261014.md) redovisar ADMIN-01, historisk 05-22-avvikelse och 1 827 äldre saknade loggankare som öppna. Inga nya saknade ankare i kopieringsproven. Fulla krav/fasacceptans och historiska 88/100 samt 3/8 består. Äldre noteringar nedan är historik.

**Beslutskedjans användarprov godkänt 2026-10-12:** Användaren svarade ”Allt funkar” efter provet med rektorns inskickande, huvudmannens återsändning, rättning och fastställande. Registrerat som användarrapporterat godkänt för den lokala stödda gymnasiekedjan; planobjekt, roller, enheter och enskilda steg särredovisades inte. Det tidigare överlämnings-/godkännandegapet är därmed levererat och godkänt inom denna avgränsning. Klasskoppling, kullkopiering och fulla krav/fasacceptans får inga nya godkännanden. Nästa steg är en sammanställning av fas 5:s återstående krav mot verifieringsbevisen, före eventuell ny plan eller användarprov. Historiska 88/100 planer och 3/8 verifierade faser består. Se [användarprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-USER-TRIAL.md). Äldre lägesnoteringar nedan är historik.

**Användarprov05-43 godkänt2026-10-09:** Användaren svarade ”allt fnukar” efter årsplaneringens femstegsprov. Registrerat som användarrapporterat godkänt; enhet, uppdrag och enskilda steg särredovisades inte.88/100 planer och3/8 verifierade faser består. Fulla krav,05-17, fas5 och rektors färdigmarkering/huvudmannens godkännande förblir öppna. Nästa arbete behöver planeras inom kvarstående gap; detta svar startar ingen ny implementation. Se [användarprovet](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-USER-TRIAL.md).

**UI43 levererad för användarprov:** SlutC16, läsande release och exakt3012-överföring med18 före/efter är accepterade. Samma prövade build179,180 filer och15 hela verksamhetstabeller bevarade; handbok byggd en gång.88/100 planer,3/8 verifierade faser. Mänskligt prov är awaiting_user; fulla krav och formella beslut kvarstår. Se [slutredovisning](phases/05-bevarade-utbildnings-och-klassfloden/05-43-SUMMARY.md) och [femstegsprov](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-USER-TRIAL.md).

**UI42 färdigt 2026-10-08 — avgränsat PASS:** Full O01–18 på dator och telefon, ROOT42476 känd exit0/rå `c39fa94964b254adaa7f141c1d6dd8b5b091b3e50334653af31233092dffa901`, source `ac41d6c3ed9cdd9977bee6a9207fa30a146ad165`, spec `93c6b4e06eca6563059b9cb5f877a818a44ba9b553e6ee184125969998b0e639` och bevarat bygge `17924ff417899dd5863c394bb4496a5bf22865bd`. 36/36 PASS utan skips/omprov/flaky; 36 normalcleanup/full15 exakt SEARCH/sex avslutsflaggor/egna16 samt foreignverksamhet/DDL0. 20 explicita/49 skyddade/241 produktfiler/båda parsers och fyra historiska C16/extraC04/L36/G38-kedjor matchar; inget nytt appbygge. Terminal audit197363/114cc50c och auditerade identiteter5387/3ebcec87. 16 geometrier minst44×44/contained och16 PNG/14 unika ROOT-granskade; telefonens fokushopplänk över text och O05:s svaga dialogtext redovisas, ingen felfriUI- eller orsaksförklaring. Oberoende full fil-/3/3-målgranskning PASS: `work/pilot/results/phase5-42-seventh-independent-full-file-review-20261008.json` · SHA `281713e9082cb51ecae6d61559df54c1660b5f62cae9cfcf5e81bb8df75867cc`. 87/100 planer,3/8 verifierade faser; nästa [05-43](phases/05-bevarade-utbildnings-och-klassfloden/05-43-PLAN.md) med separat slutC16/release/3012 och konkret användarprov. Alla första fel och recoveries består; fulla PLANERING-/ADMIN-krav/fas5/05-17/formell rektors färdigmarkering och HM-godkännande kvarstår. Ordinarie3012/5dd7baf är inte överförd av detta steg.


**Defined:** 2026-09-10

**Milestone:** v1.0 — Säker administration inför en pilot

**Core Value:** Rätt person ska enkelt kunna utföra skolans administration med korrekta uppgifter och åtkomst begränsad till sitt aktuella uppdrag.

**Status:** V1-kraven godkändes av användaren 2026-09-11 tillsammans med färdplanens åtta faser. 15 krav är verifierade efter fas 1–3; övriga 27 inväntar genomförande eller slutverifiering. SCHEMA-01–08 är registrerade som separat senare projektinriktning 2026-10-01 och är ännu inte verifierade.

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

### Läsårsstyrd planering — kompletterande användarbeslut 2026-10-06

Användaren har beslutat om ett gemensamt läsår inom planeringsområdet, med separat läsårsval i elevregister/löpande administration, och beställt en GSD-plan. Nedan spåras den kompletterande beställningen till nya 05-36–43. Pilotens ursprungliga 42 v1-krav och åtta faser är oförändrade. Planering är inte genomförande: samtliga nya krav är **Pending**, utan verksamhets-PASS.

- **PLANERING-01**: Ett session-/uppdragsbundet planeringsår och skolurval följer med inom planeringsvyerna, inklusive retur/back/omladdning, utan att ändra elevregistrets eget urval. Byte av identitet/kund/uppdrag rensar kontext och sena svar.
- **PLANERING-02**: Valt läsår visar nya och fortsättande gymnasiekullar samt rätt årskursunderlag för GR/IM utifrån strukturerade källor. Saknade, motstridiga eller endast prognostiserade uppgifter visas tydligt; inget årbyte skapar elever, kalender, klasser eller bindningar.
- **PLANERING-03**: Programplaner och timplaner återfinns i sammanhängande tabellöversikter med serveravgränsad sökning, kombinerade filter, stabil sortering och korrekt sidindelning över hela det behöriga urvalet.
- **PLANERING-04**: Årsöverblick och öppnade planer visar rätt poäng-/tim-/årskolumn och exakt källversion. Frysta underlag, fastställda planer, explicita klasskopplingar, terminsindex och osparat arbete bevaras; årsval ändrar inte dagens mandat eller planlås.
- **PLANERING-05**: Verkliga skyddade SQL-/Worker-/dator-/telefonprov verifierar separation, skolmandat, årsprojektion, bevarande och aktuell dokumentation. Framtida studieplan/grupp/tjänst/schema får ett gemensamt käll-/periodkontrakt till S1/S3 utan att dessa moduler påstås implementerade.

| Krav | Genomförandesteg | Verifieringsstatus |
| --- | --- | --- |
| PLANERING-01 | 05-36, 05-39, 05-41; samlat prov 05-43 | Automatiskt verifierat delresultat: C16/C04/G38/slutC16, separat kontext, skolscope och retur/Back/reload. Samlat årsplaneringsprov användarrapporterat godkänt2026-10-09; fullkravsgrind kvarstår. [05-43-verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-VERIFICATION.md). |
| PLANERING-02 | 05-36–38, 05-38-READ-PERFORMANCE, 05-40-SEARCH-DETAILS, 05-40, 05-42; samlat prov 05-43 | Automatiskt verifierat delresultat: modell/SQL/API/performance/SEARCH, L36 årsöverblick/kullar och O36 GR-årsbindning/IM veckotid/saknat underlag. Samlat årsplaneringsprov godkänt; fullkrav öppet; okänd GR-karta redovisas. [05-43-verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-VERIFICATION.md). |
| PLANERING-03 | 05-36–38, 05-38-READ-PERFORMANCE, 05-40-SEARCH-DETAILS, 05-40; samlat prov 05-43 | Automatiskt verifierat delresultat: L36/O36 mandatbunden kod-/namnsökning, filter/sort/50+2/exakt version och dator-/telefonrullning. Samlat årsplaneringsprov godkänt; enskilda sök-/filter-/sorteringssteg ej särredovisade. [05-43-verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-VERIFICATION.md). |
| PLANERING-04 | 05-36–38, 05-38-READ-PERFORMANCE, 05-40-SEARCH-DETAILS, 05-41–42; samlat prov 05-43 | Automatiskt verifierat delresultat: originalindex/fryst källa/sparskydd i G38/O36/slutC16 och full15 bevarande genom release/3012. Samlat årsplaneringsprov godkänt; fullkrav/formella beslut kvarstår. [05-43-verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-VERIFICATION.md). |
| PLANERING-05 | 05-37–38, 05-38-READ-PERFORMANCE, 05-43; framtida S1/S3 för nya moduler | Automatiskt verifierat delresultat: SQL/Worker/dator/telefon/slutC16/release/18före-efter och byggd handbok/S1-S3-kontrakt. Samlat årsplaneringsprov användarrapporterat godkänt; inga nya schema-/tjänste-/studieplansfunktioner eller verklig kommunanslutning. [05-43-verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-VERIFICATION.md). |

Se [beslut och gränser](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-CONTEXT.md), [färsk kodinventering](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-DISCOVERY.md) och [genomförandesteg](phases/05-bevarade-utbildnings-och-klassfloden/05-PLANNING-YEAR-IMPLEMENTATION.md). ADMIN-02/03/04, STUDY-01, GROUP-01 och SCHEMA-01/07 behåller sina egna återstående leveransgränser.

### Kundens köpbara moduler — användarbeslut 2026-10-01

Gemensamt produktkrav: kunden ska kunna köpa och använda moduler var för sig och kombinera dem med befintliga externa system. Slutlig modulkatalog, priser och beställnings-/betalningsprocess återstår. Kraven nedan får första kontraktsarbete i schemadelprojektets S1 och verifieras i S4 enligt [projektunderlaget](research/SCHEMAMODUL-PROJEKT.md); de är ännu inte implementerade eller verifierade och ändrar inte pilotens 42 v1-krav.

- **MODUL-01**: Kunden kan välja, köpa och aktivera avgränsade moduler och tillval samt senare lägga till fler utan att behöva köpa hela verksamhetssviten eller byta kundidentitet.
- **MODUL-02**: Kundens giltiga modultillgång och personens aktuella operationsmandat kontrolleras var för sig på servern och i bakgrundsjobb; varken köp eller roll ensam ger verksamhetsåtkomst.
- **MODUL-03**: Varje köpbar modul har uttryckliga datakrav och beroenden som kan uppfyllas genom egen modul, kompatibel extern modul eller godkänd import när kontraktet medger det; kunden behöver inte köpa våra övriga vyer för att leverera nödvändigt underlag.
- **MODUL-04**: Tillägg, avaktivering och avslut av moduler bevarar stabila ID:n och historik, stoppar berörda funktioner och hanterar beroenden och avtalad dataåtkomst/export med definierade rättigheter utan oavsiktlig radering.

### Sammanhängande schemamoduler — användarinriktning 2026-10-01

Användaren har beställt ett sammanhängande delprojekt som ska beaktas redan i planeringen av återstående planflöden. Nedan är produkt- och utvärderingskrav för delprojektet, inte tillägg till pilotens 42 v1-krav eller redan verifierad leverans. Detaljerade roller, kontrakt och genomförandeplaner återstår. Ansvar inom delprojektet och verifieringsmål finns i [SCHEMAMODUL-PROJEKT.md](research/SCHEMAMODUL-PROJEKT.md); STUDY-01 och GROUP-01 förblir öppna och omfattar även arbete utanför schemaavgränsningen.

- **SCHEMA-01**: Programplan, timplan, individuell studieplan, undervisningsgrupp och schema har gemensamt definierade identiteter, giltigheter, enheter och exakta versionskopplingar som går att följa genom hela flödet.
- **SCHEMA-02**: Specifika schemauppdrag och operationsbundna rättigheter för underlag, regler, beräkning, granskning, publicering och integration genomdrivs på servern och i bakgrundsjobb, med återkallelse och spårbarhet.
- **SCHEMA-03**: Schemat använder versionsbundna obligatoriska regler och uttryckliga prioriterade önskemål; saknat underlag och olösbara villkor visas utan tyst regeluppluckring.
- **SCHEMA-04**: Rust ingår i en körbar avgränsad prototyp för beräkningstjänst/komponent med versionsbundet kontrakt, avbrott, resursgränser och kontrollerbar integration med befintlig backend.
- **SCHEMA-05 (utvärdering)**: Utvärdera Jev och liknande AI för konfliktprioritering, åtgärdsval eller alternativvärdering i schemamodulen jämfört med samma motor utan AI. Dokumentera kvalitet, tid, kostnad, stabilitet och integrationskomplexitet mot fördefinierade kriterier samt rekommendation att införa, avstå eller utreda vidare. Obligatoriska regler och mandat kontrolleras oberoende av modellen. AI i levererad produkt är inte ett krav; införande kräver separat beslut efter utvärderingen.
- **SCHEMA-06**: Valda delar av interna och externa moduler kan kombineras och bytas genom avgränsade kontrakt; saknat stöd för nödvändiga regler eller data upptäcks före användning.
- **SCHEMA-07**: Ändringar i plan-, grupp-, resurs- och kalendermoduler ger versionsbunden, avstämd synk och synliga konsekvenser i schemat, utan dubbletter, förlorade ändringar eller automatisk ombindning av tidigare beslut.
- **SCHEMA-08**: Behörig personal kan jämföra, låsa, granska och publicera rätt schemaversion och följa undervisningsbehov, schemalagd, inställd och genomförd tid som skilda uppgifter.

### Lärarlegitimation och undervisningsbehörighet — planeringsöversyn 2026-10-05

Användaren har beställt en översyn av hur Skolverkets lärarregister kan beaktas och integreras. Följande är **föreslagna planeringsmål**, inte fastställda leveranskrav, nya pilotkrav eller verifierade funktioner. [Research och integrationsförslag](research/LARARBEHORIGHET-SKOLVERKET-2026-10-05.md) anger ansvariga steg L1–L4 och framtida verifieringsfall; genomförandeplacering och omfattning återstår. Pilotens 42 krav och deras fasfördelning behålls.

| Föreslaget mål | Ansvarigt steg | Avsett resultat | Verifiering |
| --- | --- | --- | --- |
| LLEG-01 | L1, tillsammans med S1 | Rätt intern lärarresurs binds kontrollerat till myndighetsunderlaget; källa, lokalt uppdrag och systemåtkomst hålls isär. | Ej genomförd; namnlika/omatchade personer, flera uppdrag, lärare utan konto och kundgräns. |
| LLEG-02 | L2 | Behörig personal kan granska och tillämpa en versionsbunden XML-leverans med radfel, omkörning, historik och spårbarhet; en bekräftad API-adapter kan använda samma kontrakt. | Ej genomförd; dubblett/äldre/tom leverans, felaktig XML, konflikter och auditrollback. |
| LLEG-03 | L3, kopplat till S3 | Tjänstefördelning och schema visar behörighetsmatchning per skolform, ämne och årskurs samt okänt underlag och konsekvenser av ändrad källa. | Ej genomförd; Gy11/Gy25, språk/specialisering, regelprofil, undantag och ändrad revision inför publicering. |
| LLEG-04 | L4, kopplat till S4 | Vald faktisk XML-/API-leverans och avsedd informationshantering/drift kan granskas med separat anslutningsbevis och färskhetsregler. | Ej genomförd; åtkomst/ändamål, verkligt leveransprov, avbrott, återställning och avslut. |

GROUP-01 och SCHEMA-01/03/07/08 har beröringspunkter; MODUL-03 ska medge kompatibelt externt personalunderlag. ACL-02 avser fortsatt lokala läraruppdrag. Elevimportens INT-02–06 och anslutningsprovet INT-07 uppfylls inte av en lärarregisterimport. Offentligt dokumenterat API för personuppslag är ännu inte verifierat.

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
| ADMIN-01 | Phase 5 | Lokalt verifierat och användbarhetsprov användarrapporterat godkänt. Skyddad HM-väg: SQL62, publik registerväg genom Worker25+25, UI24. Äldre adapter separat rättad med verklig workerd/API. Full pilot-/fasacceptans separat. [Samlad bedömning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md). |
| ADMIN-02 | Phase 5 | Lokalt verifierat inom stödda nationella Gy25-profiler genom DECISION/VOCATIONAL och grundflöde; beslutskedjans användarprov godkänt. Ingen ny implementationslucka identifierad; tidigare formulering om saknade formella beslut/yrkesram är ersatt av senare leveranser. [Samlad bedömning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md). |
| ADMIN-03 | Phase 5 | Automatiskt verifierat: atomär kullkopiering av ram, terminer och skolor, SQL44/Worker16+16/browser2. Separat mänskligt kopieringsresultat awaiting_user; godkänt versionsbyte räknas inte som kopieprov. [Samlad bedömning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md). |
| ADMIN-04 | Phase 5 | Lokalt verifierat genom OPERATIONAL: beständig klass, explicit gymnasietimplansversion/läsår/årskolumn. Versionsbyte användarrapporterat godkänt. 05-22:s historiska metadataavvikelse förblir PARTIAL. [Samlad bedömning](phases/05-bevarade-utbildnings-och-klassfloden/05-CURRENT-ACCEPTANCE-REVIEW.md). |
| UX-01 | Phase 6 | Pending |
| INFO-01 | Phase 8 | Pending |
| OPS-01 | Phase 8 | Pending |
| OPS-02 | Phase 8 | Pending |
| OPS-03 | Phase 8 | Pending |
| OPS-04 | Phase 8 | Pending |

**Coverage:** 42/42 v1-krav mappade; 0 omappade; 0 dubbla ansvariga faser. 27 krav är Pending; 15 krav är verifierade i fas 1–3 (lokal syntetisk nivå, se respektive VERIFICATION.md).

## Acceptance Boundaries

- Skolform, pilotvolym, IdP, registerleverantör och tidsmål beslutas i anslutningsprofilen; inga godtyckliga SLA-tal införs här.
- Kontraktstester med syntetiska data möjliggör utveckling men ersätter inte kundens verkliga anslutningsprov eller driftbeslut.
- Aktuell lokal spärr och fördröjningen från extern källa till spärr är separata prov.
- Grundskola och gymnasium delar säkerhetsgrund; bevarade utbildnings- och klassflöden provas med båda skolformerna där de är tillämpliga.
- Acceptans av en fas betyder inte att det är tillåtet att lägga verkliga elevuppgifter i utvecklingsprojektet.

---
*Last updated: 2026-10-07 — PLANERING-01–05 spårade till 05-36–43; modell 05-36 och stängd lokal SQL 05-37 PASS. Worker05-38 avgränsat PASS; prestandarättning/UI och samlade krav återstår. LLEG-/SCHEMA-/MODUL-mål behålls. V1:s 42 krav och åtta faser är oförändrade; inga nya verksamhetsverifieringar av läsårsplaneringen.*

## Aktuellt delbevis för ADMIN-02 och ADMIN-04 — 2026-10-12

[DECISION-verifieringen](phases/05-bevarade-utbildnings-och-klassfloden/05-DECISION-FLOW-VERIFICATION.md) styrker nu utkast → granskning → återsändning/rättning → fastställande av högskoleförberedande Gy25-programplan och skolans timplan, med global rollinkorg. SQL/TS 34, slutbyggd Worker 19 och efteraktiveringskontrakt 11 PASS; lokal OIDC för tre roller på dator/telefon PASS. Tidigare formuleringar om att alla formella beslut återstår är historiska för denna profil. Fulla krav förblir öppna: yrkesprofil, skyddad klasskoppling, bredare omfattning och mänsklig acceptans har egna kvarstående gränser.

## Yrkesprogram och återsändning — avgränsat delbevis 2026-10-12

[Yrkesverifieringen](phases/05-bevarade-utbildnings-och-klassfloden/05-VOCATIONAL-VERIFICATION.md) utökar ADMIN-02:s lokala beslutsflöde till de tolv nationella Gy25-yrkesprogrammen. ADMIN-04 får bevarandebevis för befintliga klasslänkar, ingen ny klasskopplingsfunktion. Programplan och skolans timplan kan gå via granskning, återsändning med direkt synlig kommentar, rättning och nytt beslut. Rollinkorgen visar rättningsansvar respektive huvudmannens vänteläge. Modell/server 141, SQL/TS 101 och slutbyggd Worker BF25 25 + BA25 25 + HE 19 kontroller PASS. Historiska formuleringar om helt saknad yrkesprofil är därmed ersatta för just denna avgränsning. Fulla ADMIN-02/04 förblir Pending: skyddad klasskoppling, bredare profiler, GR/IM-beslut och mänsklig acceptans har egna öppna gränser. Yrkesstart från 2028-07-02 spärras för beslut tills yrkesprovsmodellen finns.

## Operativ kedja och klasskoppling — 2026-10-12

[OPERATIONAL-01–06](phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-06-SUMMARY.md) och [oberoende verifiering](phases/05-bevarade-utbildnings-och-klassfloden/05-OPERATIONAL-VERIFICATION.md) ersätter äldre formuleringar om helt saknade skyddade klasskommandon i den verifierade gymnasieavgränsningen.

| Krav | Avgränsning | Färskt lokalt resultat |
|---|---|---|
| ADMIN-02 | OPERATIONAL-03/04 | Egna rolluppgifter först, sökning/status/sidor och sann källinnehållsjämförelse; 45 SQL, 21 faktiska HTTP, 4 källjämförelser PASS. |
| ADMIN-03 | OPERATIONAL-01/04/05 | Befintliga elev-/klass-/versionslänkar bevarade; inga automatiska kullflyttar eller raderingar. |
| ADMIN-04 | OPERATIONAL-01/02/04 | Beständig klass, uttryckligt exakt versions-/läsårsbyte, idempotens/konflikt/audit samt rätt årsunderlag. 56 SQL, 6 vårstartsprov, BF/BA36 faktiska API/UI PASS; klassvyer på dator/telefon. |
| PLANERING-01/04 | OPERATIONAL-01/02/04 | Läsår och frysta versioner består vid nyversion; klassens läsår skiljs från utbildningens kalenderstartår. |
| PLANERING-03 | OPERATIONAL-03 | Prioritering före begränsning, 50-raderssidor, sökning och beslutsstatus. SQL med520 uppgifter; faktisk HTTP med14 befintliga planer och oförändrade roller/räknare. |
| PLANERING-05 | OPERATIONAL-06 | Node129, UI56, verklig Worker, syntetisk lokal OIDC, byteverifierat bygge, bevarad DB och byggd handbok. |

ADMIN-02/04 och fulla PLANERING-krav behåller Pending för sina bredare gränser och mänskliga acceptans. GR/IM får inga nya klass-/beslutsregler genom detta steg; 05-22:s historiska metadataavvikelse raderas inte. HTTP för huvudman/administratör är snabbare men har kvar cirka3–4s median. Sex äldre testutbildningar har arkiverats med uttryckligt användargodkännande, utan att deras fyra programplaner eller historik raderas. Ingen verklig kommunanslutning påstås.
