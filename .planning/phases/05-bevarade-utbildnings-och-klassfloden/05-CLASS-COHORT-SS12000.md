---
phase: 05-bevarade-utbildnings-och-klassfloden
package: CLASS-COHORT
status: specification_mapping_not_integration_verification
reviewed: 2026-10-15
standard: SS 12000:2024
openapi_document_version: 2.1.0
---

# Klassorganisationens förhållande till SS 12000

## Specifikation och källkontroll

[SIS samlingssida](https://www.sis.se/delta-och-paverka/tksidor/tk400499/sistk450/ss-12000/) kontrollerad 2026-10-15 anger SS 12000:2024, utgåva 4. Den länkar [OpenAPI-definition version 2.1.0](https://www.sis.se/globalassets/standardutveckling/tksidor/tk-450/openapi_ss12000_version2_1_0.yaml). Standardens utgivningsår och API-dokumentets version hålls isär. Detta arbete granskar publicerade objektdefinitioner; det är ingen fullständig standardcertifiering.

YAML hämtad på nytt 2026-10-15 till `/private/tmp/gsd-class-cohort-ss12000-20261015.yaml`, SHA256 `aee9a95a4c5bd25cebaf357d266592f94e9388ae785ee9ac3b58e1992acccd28` (samma som researchunderlaget). Hämta från den offentliga länken om den tillfälliga filen saknas; provresultat får inte vara beroende av att denna lokala fil finns kvar. Relevanta scheman: `GroupFragment`, `GroupTypesEnum`, `Group_allOf`, `GroupMembership`, `OrganisationReference`, `Meta` och `PersonReference`.

## Avsedd mappning och begränsningar

| Internt begrepp | SS 12000 | Planens behandling |
| --- | --- | --- |
| Skolklass `school_classes.id` | `Group.id`, `groupType: Klass` | Stabilt UUID behålls över planversioner. Klassnamn är endast benämning; klass skiljs från undervisningsgrupp. |
| Klassnamn | `Group.displayName` | Namn får inte vara integrationsidentitet. Lokal namnnormalisering och äldre länknamn dokumenteras; ingen namnmatchad import. |
| Klassens skola | `Group.organisation` → `OrganisationReference.id` | Intern `unit_id` kontrolleras med kund/huvudman och mandat. Externt organisations-ID kräver separat källa och mappning. |
| Klassens giltighet | `Group.startDate`, valfri `endDate` | Båda gränserna är inkluderande. Startdatum är obligatoriskt i `GroupFragment`; enbart startår räcker inte. Nya klasser får känt datum. Historiska okända datum förblir okända och är en uttrycklig exportbegränsning. |
| Skolform | `Group.schoolType` | Den avgränsade etappen gäller gymnasiet; eventuell utbytesprojektion behöver rätt standardvärde. Interna skolformsnamn skickas inte oförändrade av antagande. |
| Skapande/ändring | `Group.meta` → `Meta` | Registertidpunkt och giltighetsdatum är olika uppgifter. Nya fält/proveniens måste göra dem åtskilda. Gamla tidsstämplar får inte fabriceras vid migrering. |
| Elevens klasstillhörighet | `Group.groupMemberships` / `GroupMembership.person`, `startDate`, `endDate` | Befintliga `pupil_class_memberships` och person-/placeringsrelationer bevaras. Tom klass skapar inget medlemskap eller personobjekt. Medlemskapsperiod är inte klassens giltighetsperiod. |
| Utbildning/kull `offering_id` | Ingen direkt motsvarighet antas i `GroupFragment` | En utbildning per klass är vår avgränsade interna modell. Det är inget krav i gruppschemat. Bredare klassorganisation behöver ett separat relationskontrakt före införande. |
| Timplansversion, årskolumn och tillämpningsläsår | Ingen direkt fältmappning antas i dessa gruppscheman | Appens uttryckliga planlänk bevaras separat. Den får inte kodas i klass-ID, klassnamn eller medlemskap. |
| Källägare och externa ID:n | Separat integrationskontrakt krävs | `GroupFragment` innehåller inget generellt `externalIdentifiers`-fält. Inför inte ett sådant fält i standardobjektet. Framtida extern identitet måste bindas till källsystem och objekttyp utan att skriva över lokalt UUID. |

`GroupFragment` medger en grupp utan medlemmar. Det motiverar ett tomt klassobjekt men ger ingen skrivrätt: ansvar, mandat och källa måste fortfarande kontrolleras i vår server. Vi använder lokal källa för ny lokal klass; importerad/okänd källa får inte tyst tas över. Extern leverantör, stödda objekt och informationsutbyte är inte verifierade av paketet.

## Modellkonflikter som hanteras före implementation

1. **Startår utan datum:** lagra nya klassers verifierade giltighetsstart och proveniens additivt; bevara okänd historik. Utbildningens framtida startändring får inte flytta existerande klassers perioder. Prov krävs för både kalenderår och första läsår vid vårstart.
2. **Äldre namnnyckel:** bevara gamla länkar, använd ID först för identifierade länkar och neka konkurrerande klass-ID på samma äldre namnnyckel. Detta är en dokumenterad lokal begränsning, inte fullt stöd för alla externa klassnamn/livscykler.
3. **En utbildning per klass:** tillåt bara befintlig relation i första etappen. Ingen tyst flytt av importerade/oanknutna klasser eller reducering av en extern blandad klass till ett godtyckligt `offering_id`.

## Nödvändiga verifieringsfall

- Två tomma klasser i en kull har olika stabila ID:n, samma kontrollerade skola/start och noll nya person-, placerings- eller medlemskapsrader.
- Ny program-/timplansversion lämnar klass-ID, klassdatum, medlemskap och befintliga planlänkar kvar. Kullkopiering tar inte med gamla klass-ID:n.
- Höststart, vårstart samt 30 juni/1 juli ger rätt första läsår; giltighetsdatum ändras inte av ett årsval. Okänt/motsägande datum spärrar ny skrivning med begripligt besked.
- Befintliga klasser med okända datum bevaras. Ingen migrationsbackfill får fabricera historik eller generera nya externa ID:n.
- Befintligt elevregister nekar nya medlemskap före en klass kända giltighetsstart och tillåter giltig start inom placeringens period; äldre okända klassdatum ger ingen gissad ny spärr. Detta prövas på servern, inte enbart genom filtrering av klasslistan.
- Samma namn i olika kullar ger ingen ID-sammanblandning; överlappande äldre länknyckel nekas utan ändringar. Äldre namnkoppling får inte automatiskt adopteras av ny klass.
- Fel kund/skola/utbildning, huvudman utan klassmandat, återkallat uppdrag, osäker sparning, ändrad revision och auditfel lämnar inga delvis skapade klasser.
- Slutlig rapport skiljer kod-/schemaavstämning, syntetiska lokala funktionsprov och verkligt informationsutbyte. Endast de två första ingår här; standardefterlevnad eller fungerande kommunanslutning påstås inte.

De konkreta planerna ska referera denna mappning och koppla fallen till sina egna SQL-, API- och användarprov. Tekniskt kontrakt stannar i interna dokument; handboken beskriver användarens klassarbete och verifierade begränsningar.
