# Fas 3 — riktad plangranskning 2026-09-22

Status: De fem tidigare planfynden har fått konkreta åtgärder och kontrakt. Planerna är redo för avgränsat genomförande med nedanstående stoppvillkor; detta är inte en verifierad implementation eller ett godkännande av verklig drift. Ingen produktkod ändrad och inga nya runtime-/SQL-/browserprov körda i denna plangranskning.

| Tidigare fynd | Revidering | Återstående bevis |
|---|---|---|
| 1. Roller, inlösen och verksamhetsmandat | 03-03 omfattar db/session/authz/callback/session/context/inbjudan/losen och regelprov. Kontraktet definierar staff_assignment_id, atomär bindning och borttagning av kundadmin→huvudman-genvägen. | Implementerade sessions-/SQL-/API-prov, inklusive parent-avslut och inlösen efter ändrat mandat. |
| 2. Browserberoende | 03-06 verifierar API/sammanställare. 03-07 ändrar global och projektspecifik testMatch, skapar browserfallen och kör full grind. | Upptäckta och genomförda fall i desktop/phone/built; inget saknat projekt får PASS. |
| 3. Datakontrakt, runners, direktvägsaudit | 03-EXECUTION-CONTRACT anger tabeller/FK, exakta befintliga runnerargument, nya CLI-kontrakt och 25 namngivna API-fall. 03-04 äger konfigurator, källadaptrar och prov. Faktiska källor är Kong/Storage/Postgres och Worker, aldrig testklientens påstående. | Verklig källkapacitet är ännu oprövad. Saknat strukturerat källbevis eller lucka blockerar plan 04 och AUDIT-02; full grind förblir röd. |
| 4. IT-administration | Lokal per-skola-konfiguration kan aktiveras/pausas med versionskontroll och syntetiskt anslutningstest. GET/PATCH/POST, audit och negativa prov är definierade. | Beständig lokal ändring, 409-konflikt, annan skola nekad och ingen elevinsyn. Ingen verklig kommunanslutning påstås. |
| 5. Artefakter, kopplingar och UI | Filvisa leveransbeskrivningar och verkliga anropskedjor ersätter generiska must_haves. UI-SPEC återanvänder befintlig Sidebar/Dialog/epoch. Checkpoint har what-built/how-to-verify/resume-signal. | Funktionsprov, skärm-/telefonkontroll och användarbedömning efter grön automatisk grind. |

Docusaurus ingår i 03-07: granskade handbokssidor om användning, integration och utveckling uppdateras efter implementation. `npm run docs:build` från roten ingår i slutgrinden; installation görs endast vid behov. Planeringsunderlag och testidentiteter importeras inte.

## Risker och stoppvillkor under genomförande

- Direktvägarnas audit är den största tekniska risken. Lokala loggformat och konfiguration måste provas i 03-04. Asynkron insamling är inte synkron fail-closed-garanti för drift; Worker stoppar före elevsvar, alternativa vägar förblir stängda. Om källorna inte kan ge erforderliga händelser måste ingress/loggdesign revideras innan plan 04 kan avslutas. Detta beroende är inte räknat som löst säkerhetskrav.
- Plan 03 korsar flera befintliga sessionsfiler. Dela dess två uppgifter i små commits (roller/live-kontext, tilldelning/inlösen) och kör relevanta prov efter varje; blanda inte annan pågående produktkod. Ingen fas ska markeras klar enbart för att planfilerna finns.
- Fas 2:s gamla API-förväntningar på kundadminutnämning och undertryckta nekanden behöver ändras under 03-06 till de nya godkända reglerna. Övriga negativa säkerhetsprov ska bevaras och köras färskt.
- Syntetiska professionfält, 60 minuters support, 30 dygns gallring och förseedad elevhälsoansvarig är tekniska provförslag. Utnämningsmandat, verkliga professionsrättigheter, supportpolicy och kundens lagringstid är fortsatt öppna kundbeslut. De blockerar verklig användning, inte lokala syntetiska prov.

Genomförandet börjar med 03-01 och går sekventiellt till 03-07 på grund av gemensamma kontrakt och säkerhetsberoenden. Valideringskartan är fortsatt planned/nyquist_compliant=false; inga utförandebevis har lagts till.

Slutkontroll: YAML/frontmatter, sju sekventiella beroenden, uppgifternas verify/done och täckning av de sex faskraven kontrollerade. Riktad separat genomläsning rättade dessutom fel konfigurationssuffix och inkonsekvent namn på tilldelarfält. Detta är planverifiering, inte utförandebevis.
