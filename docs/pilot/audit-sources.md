# Auditkällor i lokalt syntetiskt mål — delimplementation

Verifierat 2026-09-24. Detta är intern teknisk dokumentation, inte användarhandbok eller godkännande av AUDIT-02.

## Verifierat

`configure-audit-source.mjs --target protected` verifierar målet med `assertTarget` och identifierar körande Kong, Storage och Postgres genom Docker-inspektion mot verifierat projekt-ID. Okänd loggdrivrutin eller saknad källa blockerar. Verktyget ändrar enbart Kongs genererade Nginx-konfiguration i den disponibla containern. Nginx valideras före reload; fel återställer tidigare konfiguration i minnet. Inga credentials/configkopior sparas i repot.

Kong skriver ett avgränsat JSON-accessformat till stdout: servergenererat Nginx-request-id, tid, status och fast kategori rest/rpc/storage/other. Ingen rå URL, query, requestheader eller body finns i det formatet. Andra befintliga tjänste-/felloggar är inte därmed minimerade. Körning efter containeråterskapande krävs; automatisk återställning av konfiguration efter omstart är inte verifierad.

`collect-denials.mjs --probe --out work/pilot/results/phase3-denials.json` gav tre verkliga Kong-händelser för tre syntetiska anrop utan API-nyckel till REST, RPC och Storage. Dessa nekas vid gateway; provet bevisar inte ett nekande i Storage eller Postgres. Klientsvar används endast som jämförelse, medan händelserna kommer från Docker-loggar. Den klientvalda korrelationsheadern används inte som identitet.

Kollektorn läser stdout och stderr endast i minnet och sparar ett explicit fältschema. Okänd aktör blir null, framgångsrik ingress blir `received` och får inte beskrivas som ett behörighetsnekande. Dubbletter identifieras med container-id och servergenererat request-id. Samma sekund eller anonym aktör slår inte samman olika händelser. Sju enhetstester kontrollerar dessa begränsningar, felaktig indata, argument och konfigurationsformat.

## Blockerande luckor

Hela källkedjan returnerar alltid **BLOCKED** och exitkod 3. `kongProbe: OBSERVED` betyder endast att motsvarande route/status observerades i provfönstret; individuell säker korrelation mellan varje klientprov och serverhändelse återstår.

- Storage har befintliga breda JSON-loggar. Egen minimerad konfiguration, verifierat ursprung för request-id/roll och faktiska upstream-nekanden återstår.
- Postgres loggar finns på stderr. Observerad konfigurationsfil hade `log_statement=ddl` och prefix utan explicit SQLSTATE/session-id. Minimerad konfiguration, kontroll av effektiva inställningar och verkliga SQL-nekanden återstår.
- Avbrott, loggrotation, omstart, cursorluckor och återhämtning utan bortfall är inte verifierade. Docker `--since` är ett provfönster, ingen beständig cursor. En ren tidsstämpel ger ingen kontinuitetsgaranti. Kollektorn får därför aldrig godkänna full täckning.
- Ingen synkron driftsgaranti ges av denna asynkrona lokala insamling. Verklig drift och kommunanslutning omfattas inte.

Nästa arbete är att fullfölja dessa källor och felprov enligt `03-EXECUTION-CONTRACT.md`; det krävs före plan 04 kan godkännas. Den lokala konfiguratorn lämnar övrig stack och direktvägarnas behörigheter oförändrade.
