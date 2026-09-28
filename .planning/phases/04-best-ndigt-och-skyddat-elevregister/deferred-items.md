# Fas 4 — uppskjutna fynd utanför respektive plans omfattning

## 04-23: Icke-deterministiskt Wrangler-avbrott på nekade Worker-anrop

- **Upptäckt:** 2026-09-28 vid `work/pilot/phase4-worker-execute-probe.mjs` mot byggd protected-Worker (`npm run build:protected`, lokal preview via `scripts/run-mode.mjs`).
- **Observation:** 5 av 11 körningar under planen stoppades mitt i. Ett nekat anrop fick HTTP 500 utan JSON-kod och utan `X-Correlation-Id`. Därefter svarade Workern inte (fetch `TypeError`), fast `run-mode`-processen levde kvar. Wrangler skrev endast `✘ [ERROR]` med tomt meddelande. Varje avbrott kom på ett **nekat** anrop: personnummer eller nedladdning utan MFA, eller rektorns förhandsvisning eller nedladdning. Det kom efter ungefär 10–15 anrop. Ingen körning visade elevinnehåll, ändrade eleven eller läckte uppgifter. Med `WRANGLER_LOG=debug` gick körningen igenom utan avbrott.
- **Trolig ingång (inte bekräftad):** Nekandevägen i `protectedRoute` gör två databastransaktioner per anrop. Först rullas `withSessionContext` tillbaka, sedan skriver `logDenied` i en ny transaktion via `withLoginPhase`. Tillåtna anrop gör bara en.
- **Samband:** Troligen samma fenomen som det oförklarade Worker-avbrottet i fas 3:s access-regression (`03-VERIFICATION.md`, sammanfattningen).
- **Varför inte rättat här:** Felet fanns före denna plan. Det kräver felsökning av Worker-runtime eller databasadapter (`web/lib/server/db.ts`, `events.ts`), och 04-23 får inte ändra webbkoden. Grind- och E2E-körningar (04-16, 04-19, 04-21) kan bli instabila tills orsaken är utredd.
- **Förslag:** Egen felsökningsplan eller gsd-debug före 04-21:s fulla slutgrind. Kör proben upprepade gånger och fånga `workerd`-fel och anslutningsstängning vid nekade anrop.

### Utredning och åtgärd i 04-25 (2026-09-28): fastställd orsak, åtgärdad i appkoden

- **Fastställd orsak:** Ett nekande före handlern (`forbidden`, `mfa_required` på routes som kräver MFA i `protectedRoute`-optionerna, `no_session`) svarade medan begärans kropp var oläst. Den lokala användar-Workern kunde då inte återanvända HTTP-anslutningen. Wranglers ProxyWorker skickade nästa anrop på samma anslutning och fick `Network connection lost`. Den svarade 500 utan kod och korrelation på 2–4 ms, utan att anropet nådde appen. Wrangler behandlar felet i ProxyWorker som fatalt och avslutades (tomt `✘ [ERROR]`). Båda workerd-processerna levde med samma pid, och run-mode levde kvar tills vidare.
- **Bevis (A/B, en variabel i taget, samma bygge):**
  - Rektorns nekanden med kropp: 5/5 flöden avbröts inom 6–19 anrop. Samma nekanden utan kropp: 0/5 på 1 500 anrop.
  - Lika många tillåtna anrop (kroppen läses): 0/5 på 1 000 anrop.
  - Tillfälligt bygge som läser kroppen före nekandesvaret: 0/10 körningar. Tillfälligt bygge som i stället avbryter kroppen (`cancel`): 5/5 avbrott. Kroppen måste alltså vara färdigläst.
  - Baslinjen gav 16 avbrott av 25 körningar, samtliga direkt efter ett nekande med oläst kropp (14 `forbidden`, 2 `mfa_required`). Wrangler var död vid nästa anrop i 16/16.
- **Avfärdade hypoteser:**
  - H1 (händelser från stängda klienter fäller isolatet): workerd lever och gör ingen omstart. Med inspektör ansluten till användar-Workern före första anropet kom 0 `Runtime.exceptionThrown`, och avbrotten kom ändå (3/3).
  - H2 (ROLLBACK mot tvingad stängning) och H4 (anslutningsgräns): samma databaslivscykel ger 0 avbrott när kroppen läses eller saknas.
  - H3 (ohanterat avslag): se separat fynd nedan. Avslagen finns, men lika mycket på tillåtna anrop, så de styr inte avbrottet.
  - H5 (wrangler oberoende av appkod): minimal Worker i tmp med postgres-mönstret, oläst kropp, kloning, fördröjning, `waitUntil`, assets och observability kraschade inte (0 avbrott på drygt 15 000 anrop). Utlösaren kräver appens nekandeväg. Felet blir däremot fatalt i wrangler.
  - `WRANGLER_LOG=debug` maskerar inte felet (8/13 avbrott); 04-23:s iakttagelse var en slump.
- **Åtgärd:** `denyResponse` (`web/lib/server/authz.ts`, commit `ee00e31`) loggar och committar nekandet först. Därefter läses en oläst kropp till slut del för del och kastas, med en gräns på 1 MiB och utan buffring. Sist lämnas svaret med kod och `X-Correlation-Id`. Fail-closed är oförändrat. Regressionsprov: `web/lib/server/deny-path.test.mjs`, RED 0/5 före och GREEN 5/5 efter.
- **Stabilitet efter åtgärden:** `phase4-25-stability.json` gav PASS 25/25: 20 provkörningar à 9/9 och 5 nekandeflöden à 200 anrop, 0 avbrott och alla nekanden loggade. Före åtgärden avbröts 55 % av provkörningarna och 100 % av flödena (`phase4-25-baseline.json`). 0 av 20 är starkt stöd men inget matematiskt bevis: med sannolikheten 0,55 per körning är chansen till 20 felfria körningar av en slump under 10⁻⁶.
- **Fas 3, punkt 2, 6 och 7:** Punkt 7 (500 på `mfa-kravs`, sedan `fetch failed`) och punkt 6 (`fetch failed`) har samma signatur och förklaras troligen av samma mekanism. Punkt 2 (previewn fanns inte kvar) stämmer med att wrangler avslutas. Det är inte verifierat i efterhand, eftersom loggar från de körningarna saknas. Den 17 h gamla kakan som avvisades förklaras inte.
- **Kvarstående risk:**
  - Nekande med kropp över 1 MiB avbryter läsningen och kan fortfarande fälla lokal wrangler.
  - Svar utanför `denyResponse` som lämnas med oläst kropp kan ge samma lokala avbrott, till exempel `auth/logout` vid csrf. De har inte prövats här.
  - Wranglers fatala hantering av ProxyWorker-fel finns kvar i wrangler 4.129.0 (4.143.0 finns). Versionsbyte föreslås som separat beslut och har inte gjorts.
- **Grindar (04-16, 04-18–04-21):** Kör `work/pilot/phase4-worker-stability.mjs` eller klassa med dess `abortInTrace`/`classifyRun`. Ett avbrott blir aldrig PASS och kräver ny utredning, inte omstart eller omförsök.
- **Status:** Luckan är stängd för nekandevägen i den lokala protected-Workern (syntetiska data). Ingen verklig drift är prövad.

## 04-25: Ohanterade avslag från varje postgres-klient i Workern (separat fynd)

- **Upptäckt:** 2026-09-28 i 04-25:s kontrollflöde med tillfällig `unhandledrejection`-loggning (bara konstruktornamn och nyckelord). Varje `sql()`-klient i `web/lib/server/db.ts` gav exakt ett ohanterat avslag (`Error`, meddelandet gäller en avbruten ström). Det blev 3 per tillåtet anrop och 4 per nekat, och också på hälsokontrollen. Minimalreproduktionen med postgres 3.4.9 i workerd visar samma nyckelord.
- **Påverkan:** Avslagen orsakade inte Worker-avbrotten (A/B ovan). De ger brus i Workerns logg och kan dölja verkliga fel.
- **Varför inte rättat här:** Utanför 04-25:s orsak. Rättningen hör sannolikt till hur postgres-klientens Cloudflare-socket stängs i `db.ts` eller till beroendet, och ett beroendebyte kräver användarbeslut.
- **Förslag:** Egen avgränsad utredning av `db.end()`-förloppet i workerd före pilotdrift.
