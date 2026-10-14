---
phase: 05-bevarade-utbildnings-och-klassfloden
plan: SCHOOL-REGISTRY
requirements: [ADMIN-01]
status: complete_bounded
completed_implementation: 2026-10-14
human_result: user_reported_pass
---

# Huvudmannens skolimport och registeruppdatering

**Senare användarresultat:** ”allt funkar” för det avskilda skolprovet. [Registrerat resultat](05-SCHOOL-REGISTRY-USER-TRIAL.md). Användbarheten är användarrapporterat godkänd; tekniska API-/DB-bevis behåller sin tidigare avgränsning. Nedanstående awaiting_user-noteringar beskriver läget vid leveransen. Fortsatt samlad fasbedömning är beställd.

Huvudmannen har nu **Skolor** i den skyddade appen. Där går det att söka med skolenhetskod eller den aktuella huvudmannens organisationsnummer, granska en träff och lägga till skolan. Uppdatering kräver aktuellt skolmandat och bevarar lokal rektor, årskurser, elevregisterkälla, uppdrag och planeringskopplingar. Import ger inga nya mandat. Registrets skolformer visas separat från lokala former som behållits.

Sparandet binder granskat registerunderlag och lokal revision till ett beständigt kommando. Oklart svar kan följas upp med samma kommando; status skapar inget och ett upprepat sparande ger inte dubbla skolor. Registerbyte, samtidiga ändringar, saknat mandat och auditfel stoppar sparandet. Rektorsnamn visas bara inom aktuellt skolmandat och kommer från en levande lokal uppdragskedja.

SQL62, Node23, UI24, verktygsprov4, faktisk Workerpreflight25 och slutprov25 passerar. Workerproven omfattar verkliga publika registeruppslag, isolerad lokal syntetisk kund, import/uppdatering och faktisk webbläsare i dator-/telefonstorlek. En separat läsande lokal OIDC-kontroll passerar fem kontroller för huvudmannens nya meny och befintliga program-/timplanslistor. Typkontroll, lint, skyddat appbygge och handboksbygge passerar. [Verifieringen](05-SCHOOL-REGISTRY-VERIFICATION.md) skiljer bevisnivåerna åt.

Grundmigration `20261014120000` och exakt aktivering `20261014121000` är installerade i den lokala skyddade provmiljön. Samma 197 byggfiler från produktrevision `970782fbf82c74e7e804eb61c7cba2a17f1becf4` är bytekontrollerade och kör på **3012**. Ordinarie verksamhetsdata är bevarade. Inga nya saknade auditankare skapades av proven.

Nästa steg är [det avskilda användarprovet](05-SCHOOL-REGISTRY-USER-TRIAL.md) på **5198**: lägg till Eken, uppdatera Björken och bedöm begriplighet samt bevarad rektor/skolform. Det använder simulerat register och lagring i fliken. Det mänskliga resultatet är **awaiting_user**. Ingen verklig kommunanslutning eller full fasacceptans påstås.

## Avvikelser som rättades

- SQL-provet hittade fel kvalificering av en lokal variabel; därefter korrigerades också ett ogiltigt medlemskapsfixture. Första felresultaten är bevarade.
- Mobilprovet hittade osynliga radioknappar; de har synlig native-utformning och tillräcklig tryckyta.
- Oberoende granskning skärpte kontrollen av aktuell rektor och maskerade namnet för egen import utan skolmandat.
- Faktisk Worker gav fel för `redirect: error`, trots passerade Node-prov. Den nya adaptern använder `manual` och avvisar omdirigeringar utan att följa dem. Nytt bygge och full faktisk omkörning passerar. Den äldre kundadminadaptern ändrades inte.

Full ADMIN-01-acceptans och fas 5 förblir öppna i väntan på användarbedömning och samlad kravgenomgång. Tidigare godkännande av klassens uttryckliga versionsbyte består. Kullkopiering/mobil saknar separat användarresultat, prestanda ligger kvar i backloggen och historiska 05-22-/auditavvikelser är inte omklassificerade. Historiska 88/100 planer och 3/8 faser räknas inte om av denna avgränsade leverans.
