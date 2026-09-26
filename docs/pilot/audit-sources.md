# Auditkällor i lokalt syntetiskt mål

Verifierat 2026-09-26 på den återskapade lokala provmiljön (protected-målet, enbart syntetiska data). Detta är intern teknisk dokumentation. Den är inte användarhandbok och inte godkännande av AUDIT-02/03 eller av någon verklig drift- eller kommunanslutning.

## Vad som är verifierat

Rapport: `work/pilot/results/phase3-denials.json`. Kommando från projektroten:

```
node work/pilot/configure-audit-source.mjs --target protected
node work/pilot/collect-denials.mjs --probe --outage storage,kong,db --out work/pilot/results/phase3-denials.json
```

Rapportens status är `PASS` med räckvidd `local-synthetic-only`. PASS gäller bara att de fyra direktvägsproven, provfönstrets kontinuitet och avbrottsproven för alla tre källor gav individuella källbevis i just denna körning. Varje källa bedöms för sig, och en saknad del ger `BLOCKED` med skäl.

| Väg | Källa | Bevis |
|-----|-------|-------|
| REST (`/rest/v1/…`, anon-nyckel) | Kong-accesslogg | 401, servergenererat request-id i svar och logg, exakt en händelse |
| RPC (`/rest/v1/rpc/phase3_read_pupils`) | Kong-accesslogg | 401, individuell korrelation som ovan |
| Storage-upstream (`POST /storage/v1/bucket`) | Kong + Storage-serverns logg | Kong 400 och Storage-nekande (RLS) med samma gateway-id; Storage har själv verifierat rollen `anon` |
| Direkt SQL (login `authenticator`, sedan `anon`/`authenticated`) | Postgres-serverns logg | 3 försök, 3 × SQLSTATE 42501 i exakt den serverrapporterade sessionen (PID + sessions-id), inloggningsroll `authenticator` |

## Källkonfiguration

`configure-audit-source.mjs` kör `assertTarget('protected')` och hittar containrarna via Docker-inspektion av det verifierade projekt-ID:t. Verktyget ändrar bara den disponibla lokala stacken.

- **Kong:** minimerat JSON-accessformat med request-id, tid, status och fast routekategori. Formatet har ingen URL, query, header eller body. Svarshuvudet `X-Phase3-Audit-Id` bär request-id:t. Kong tvingar samma id som `X-Client-Trace-Id` mot upstream. Klientens värde på headern skrivs över, vilket provet kontrollerar med ett förfalskat värde. En reload räknas som aktiv först när alla workers från före reload har avslutats. Utan den spärren hann ett prov 2026-09-26 hanteras av en gammal worker med okonfigurerat format.
- **Storage:** avbildens egen JSON-logg används. Den allowlistar `x-client-trace-id`, så gatewayns id ger en individuell koppling. Kollektorn sparar bara id, tid, status, fast operationsnamn och Storage-verifierad roll (`anon`/`authenticated`/`service_role`, annars null). URL, felmeddelande och SQL kastas.
- **Postgres:** `ALTER SYSTEM` och reload i det lokala målet ger prefixet `phase3pg|%m|%p|%c|%l|%u|%e|`. Dessutom sätts `log_min_error_statement=panic`, `log_error_verbosity=terse` och `log_statement=none`. Effektiva värden kontrolleras i en ny session, och per roll/databas får inga avvikande loggvärden finnas. Inställningarna ligger kvar efter omstart. Kollektorn sparar SQLSTATE, PID, sessions-id, radnummer och inloggningsroll. Vid klass 28/08 blir rollen null eftersom användarnamnet då bara är påstått.

Rå loggrader, SQL-text och undantagstext skrivs aldrig till rapport eller Git.

## Kontinuitet, avbrott och återhämtning

Ett provfönster räknas som kontinuerligt bara om fyra villkor gäller: samma containerkörning (id + starttid) täcker fönstret, `json-file` saknar `max-size`/`max-file` så att loggen inte kan roteras, konfigurationen är aktiv i fönstrets båda ändar, och inga omnimerade, ospårade eller felaktiga rader finns. Kong-rader i standardformat, Storage-anrop utan gateway-id, Postgres-rader utan prefix och STATEMENT-/DETAIL-rader räknas som luckor.

Avbrottsprovet stoppar och startar varje källa i tur och ordning:

- **Storage stoppad:** kollektorn blockerar. Anropet under avbrottet får 502 från Kong och loggas individuellt av Kong. Ingen data serveras.
- **Kong stoppad:** kollektorn blockerar och anslutningen nekas. Efter omstart har Kong genererat om sin konfiguration, så minimeringen är borta. Ett anrop i det okonfigurerade fönstret loggas i standardformat och rapporteras som lucka, inte tyst. Konfigurationen återställs sedan och verifieras.
- **Postgres stoppad:** kollektorn blockerar och SQL-inloggning misslyckas. Efter omstart är loggkonfigurationen kvar.

För alla tre upptäcks omstarten via ändrad starttid. Händelsen före avbrottet finns kvar i källan, och en ny händelse korreleras efter återhämtningen.

## Begränsningar som kvarstår

- **Ingen automatisk omkonfigurering av Kong efter omstart.** Luckan upptäcks och rapporteras, men förhindras inte. Anrop i luckan hamnar i Kongs standardformat, med rå URL, i containerns logg. Kollektorn sparar dem inte.
- **Ingen beständig cursor mellan separata insamlingskörningar.** Varje körning bevisar sitt eget fönster. Tid mellan körningar är inte täckt.
- **PostgREST-anrop gör Postgres-fel i poolade sessioner.** De korreleras inte individuellt med Kong-händelsen. REST/RPC-beviset kommer från Kong.
- **Worker-händelser ingår inte i denna kollektor.** De ligger i `security_events` och provas av Worker-/API-proven. Dessa har ännu inte körts om på den återskapade stacken (plan 03-06).
- **Loggen är inte bunden i storlek.** Utan rotation är det lokala provet kontinuerligt, men en verklig drift kräver annan logginfrastruktur.
- **Kollektorn är asynkron och lokal.** Den ger ingen synkron driftsgaranti. Fail-closed före elevsvar gäller Worker-vägen. Verklig ingress, verklig lagringstid och kommunanslutning omfattas inte.

## Historik

Före 2026-09-26 gav källrapporten `BLOCKED`. Tidigare saknades Storage-upstream, direkt SQL, individuell korrelation och avbrottsprov. Därefter gick den tidigare lokala stacken förlorad, och rapporten visade källan som otillgänglig. Observationer från den tidigare miljön används inte som bevis här.
