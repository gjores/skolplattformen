# Anslutningsprofil för piloten

**Datum:** 2026-09-11
**Status:** Utkast för granskning — inga kund- eller leverantörsbeslut är fattade
**Ansvarig för nästa beslut:** Projektansvarig (tills pilotpartner är vald; se Öppna beroenden)
**Underlag:** .planning/phases/01-baslinje-och-avskild-pilotmilj/01-CONTEXT.md (D-01–D-10), .planning/ROADMAP.md (fas 1, 7, 8), .planning/REQUIREMENTS.md (Acceptance Boundaries)

Profilen uppfyller PILOT-01 i den godkända färdplanen: den ska visa vad som är bestämt, vad som bara är provmaterial, vad som är rekommenderat och vem som äger nästa beslut. Den ersätter inte kundens egna beslut och får inte läsas som en överenskommelse med någon skola, huvudman, kommun eller leverantör.

## Så läses profilen

| Markering | Betydelse |
|-----------|-----------|
| **Bekräftat** | Beslutat av användaren/projektet och dokumenterat med källa. |
| **Syntetiskt exempel** | Finns i provmiljön för att kunna prova; säger inget om verklig pilot. |
| **Förslag** | Rekommendation från research/planering som väntar på beslut. |
| **Öppet** | Inget värde finns; beslutsägare och blockerad fas anges. |

Källkolumnen hänvisar till besluten D-01–D-10 i 01-CONTEXT.md, till krav-ID i .planning/REQUIREMENTS.md eller till den plan i fas 1 som skapar provmaterialet.

## Profil

| Område | Värde | Status | Källa/beslutsägare |
|--------|-------|--------|--------------------|
| Pilotpartner (skola/huvudman/kommun) | Ingen vald | Öppet | D-01; projektansvarig |
| Organisation i provmiljön | Exempelstads kommun (org.nr 2120009999, fiktivt) med Björkhagens grundskola (99999902) och Exempelstads gymnasium (99999903) | Syntetiskt exempel | D-02; plan 01-04 |
| Skolformer | Grundskola och gymnasium, en exempelskola vardera | Bekräftat | D-02 |
| Provmaterialets omfattning | 2 klasser per skola, 6 elever per klass, 24 elever totalt | Syntetiskt exempel | D-03; RESEARCH Pattern 4 |
| Verklig pilotvolym (elever, klasser, skolenheter) | Ej fastställd. 24 är ett provförslag och varken pilotvolym eller kapacitetsgräns | Öppet | D-03; pilotpartner |
| Elev- och placeringsfält | Se avsnittet Föreslagna elev- och placeringsfält | Förslag | Codex discretion; fas 4/6 |
| Originalkälla för elevuppgifter | Ej vald. Skolverkets skolenhetsregister ger skoluppgifter, inte elever eller företrädarmandat | Öppet | D-06; AGENTS.md; pilotpartner |
| Skrivansvar per fält | Ej fastställt; lokal rättelse vs. källsystem avgörs när källa är vald | Öppet | STU-04; fas 4/6 |
| Identitetsleverantör (IdP) | Ej vald; nuvarande demoinloggning är avstängd i provmiljön och räknas inte | Öppet | IAM-02; fas 7 |
| Kontokälla för personal (tilldelning/avveckling) | Ej vald | Öppet | IAM-06; fas 7 |
| Registerleverantör och kontrakt (t.ex. SS 12000) | Ej vald; SS 12000 används först när motpartens stöd är verifierat | Öppet | INT-02, INT-07; fas 6/7 |
| Drift, avtal och personuppgiftsflöden | Ej fastställt; inga verkliga elevuppgifter före kundens driftbeslut | Öppet | OPS-01; fas 8 |
| Acceptansprov mot verklig test-/pilotmiljö | Ej möjligt utan vald leverantör; simulatorprov redovisas separat | Öppet | INT-07; fas 7 |
| Provmiljöns tekniska upplägg | Uttryckligt exempelläge utan databasanslutning; separat stängd lokal målmiljö | Förslag | RESEARCH; plan 01-03/01-05 |
| Testpersoner | Användaren själv på dator och telefon | Bekräftat | D-04 |

Provmiljöns organisation, skolenhetskoder och elev-ID:n (`E-2001`–`E-2024`) är fiktiva och saknar personnummer, adresser och kontaktuppgifter. De fastställs i plan 01-04 och beskriver inte någon verklig huvudman. Skolenhetskoderna 99999902 och 99999903 är reserverade exempelvärden och ska inte slås upp som verkliga enheter.

**Vad profilen inte påstår**

1. Inga verkliga elevuppgifter finns eller får läggas in i utvecklingsprojektet. Provmiljön arbetar enbart med syntetiska uppgifter (D-06, D-09); det gäller även när en pilotpartner senare är vald och tills kundens driftbeslut i fas 8 finns.
2. Fiktiva namn, exempelroller och simulerade prov bevisar ingen verklig kommunanslutning, inget verkligt mandat och ingen pilotacceptans. Skolverkets uppslag verifierar skoluppgifter, inte rätten att företräda en huvudman, och den lokala rollväljaren är inget behörighetsbevis.
3. Ett godkänt syntetiskt prov ändrar inte godkännandegränserna i fas 7 och 8. Fas 7 kräver vald pilotkund, IdP, kontokälla, registerleverantör, tilldelad åtkomst och överenskomna acceptansvillkor (IAM-02, IAM-06, INT-07); fas 8 kräver granskad drift och avtal (OPS-01). Saknas de förblir kraven öppna.

## Föreslagna elev- och placeringsfält

Fälten nedan är ett **förslag** för senare registerarbete i fas 4 (STU-01–STU-04) och fas 6 (INT-02); en framtida kommuns fältlista, skrivansvar och format är öppna (OB-05). Exemplen speglar den syntetiska provvärlden i plan 01-04 och dagens `Pupil`-typ i `web/lib/admin-model.ts`, inte ett fastställt informationskontrakt.

| Fält | Exempel i provmiljön | Föreslaget skrivansvar | Status | Anmärkning |
|------|----------------------|------------------------|--------|------------|
| `Internt elev-ID` | `E-2001` | Appen (stabilt, skilt från inloggningskonto) | Förslag | STU-01 |
| `Visningsnamn` | `Alma Berg` (fiktivt) | Källsystem | Förslag | Fiktiva namn i provet |
| `Skolenhets-ID` | `99999902` | Källsystem/Skolverkets skolenhetskod | Förslag | Skolenhetskod är skoluppgift, inte mandat |
| `Klassreferens` | `4A` vid 99999902 | Öppet: skola eller källsystem | Öppet | Samma klassnamn kan finnas på flera skolor (CONCERNS: klassidentitet) |
| `Skolform` | `GR` / `GY` | Källsystem | Förslag | D-02 |
| `Utbildningsreferens` | `sa25` (program SA25, inriktning SASAP) | Appen (huvudmannens utbud) | Förslag | ADMIN-02 |
| `Placeringsstart` | `2026-08-17` | Källsystem | Förslag | STU-02 |
| `Placeringsslut` | tomt eller `2027-06-11` | Källsystem | Förslag | STU-02 |
| `Källsystemets namnrymd` | ej satt i provet | Integration | Öppet | INT-02; sätts när leverantör valts |
| `Externt ID` | ej satt i provet | Källsystem | Öppet | INT-02; stabilt externt ID krävs |
| `Personnummer`, `Adress`, `Kontaktuppgifter` | ingår inte i provmaterialet | Öppet | Öppet | Behövs inte för fas 1; skyddsfrågor i DATA-01 |

Ingen rad ovan är en överenskommelse med en kund eller leverantör.

## Öppna beroenden

| ID | Beroende | Beslutsägare | Blockerar | Villkor för stängning |
|----|----------|--------------|-----------|-----------------------|
| OB-01 | Val av pilotpartner (skola, huvudman eller kommun) | Projektansvarig tillsammans med kandidatkund | Fas 7 (IAM-02, IAM-06, INT-07), fas 8 | Skriftlig avsikt och utsedd kontaktperson hos partnern |
| OB-02 | Identitetsleverantör och autentiseringskrav | Pilotpartner / kommunens IT | IAM-02 | Utfärdare, inloggningsväg och testidentiteter tilldelade |
| OB-03 | Kontokälla för tilldelning och avveckling | Pilotpartner / kommunens IT | IAM-06 | Överenskommen tidsgräns källa → spärr |
| OB-04 | Elevregisterleverantör, kontraktsversion och testmiljö | Pilotpartner / leverantör | INT-02, INT-07 | Tilldelad test-/pilotåtkomst och dokumenterat kontrakt |
| OB-05 | Fältlista, originalkälla och skrivansvar per fält | Pilotpartner | STU-04, INT-02, fas 4/6 | Fastställd fältmatris ersätter avsnittet Föreslagna elev- och placeringsfält |
| OB-06 | Verklig pilotvolym och skolenheter | Pilotpartner | Fas 6–8 | Beslutat antal elever/klasser/skolenheter |
| OB-07 | Drift, avtal, underleverantörer och bedömning av konsekvensbedömning | Projektansvarig / pilotpartner | OPS-01, fas 8 | Granskade underlag före verkliga elevuppgifter |
| OB-08 | Skyddsfall och spärr-/återställningsmål | Pilotpartner | DATA-01, OPS-02 | Beslutade fall och tidsmål |

**Så uppdateras profilen när ett beroende stängs**

- Berörd rad i Profil byter status från Öppet till Bekräftat först när beslutsägaren har lämnat ett skriftligt besked; källkolumnen anger då beskedet i stället för enbart krav-ID.
- Beroendet stryks inte ur tabellen utan får stängningsdatum i Ändringsloggen, så att spårbarheten från öppet läge till beslut bevaras.
- Syntetiska exempel byter aldrig status till Bekräftat; de ersätts av kundens verkliga värden i en ny, daterad version av profilen.

Inget av ovanstående hindrar planering eller syntetiska prov i fas 1–6. Saknade beroenden gör att berörda krav förblir öppna; de får inte markeras uppfyllda genom simulatorprov (INT-07) eller fiktiva exempel.

## Ändringslogg

| Datum | Ändring |
|-------|---------|
| 2026-09-11 | Första utkast i fas 1 (plan 01-02). |
