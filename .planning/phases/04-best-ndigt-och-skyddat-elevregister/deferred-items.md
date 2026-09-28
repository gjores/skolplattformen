# Fas 4 — uppskjutna fynd utanför respektive plans omfattning

## 04-23: Icke-deterministiskt Wrangler-avbrott på nekade Worker-anrop

- **Upptäckt:** 2026-09-28 vid `work/pilot/phase4-worker-execute-probe.mjs` mot byggd protected-Worker (`npm run build:protected`, lokal preview via `scripts/run-mode.mjs`).
- **Observation:** 5 av 11 körningar under planen stoppades mitt i. Ett nekat anrop fick HTTP 500 utan JSON-kod och utan `X-Correlation-Id`. Därefter svarade Workern inte (fetch `TypeError`), fast `run-mode`-processen levde kvar. Wrangler skrev endast `✘ [ERROR]` med tomt meddelande. Varje avbrott kom på ett **nekat** anrop: personnummer eller nedladdning utan MFA, eller rektorns förhandsvisning eller nedladdning. Det kom efter ungefär 10–15 anrop. Ingen körning visade elevinnehåll, ändrade eleven eller läckte uppgifter. Med `WRANGLER_LOG=debug` gick körningen igenom utan avbrott.
- **Trolig ingång (inte bekräftad):** Nekandevägen i `protectedRoute` gör två databastransaktioner per anrop. Först rullas `withSessionContext` tillbaka, sedan skriver `logDenied` i en ny transaktion via `withLoginPhase`. Tillåtna anrop gör bara en.
- **Samband:** Troligen samma fenomen som det oförklarade Worker-avbrottet i fas 3:s access-regression (`03-VERIFICATION.md`, sammanfattningen).
- **Varför inte rättat här:** Felet fanns före denna plan. Det kräver felsökning av Worker-runtime eller databasadapter (`web/lib/server/db.ts`, `events.ts`), och 04-23 får inte ändra webbkoden. Grind- och E2E-körningar (04-16, 04-19, 04-21) kan bli instabila tills orsaken är utredd.
- **Förslag:** Egen felsökningsplan eller gsd-debug före 04-21:s fulla slutgrind. Kör proben upprepade gånger och fånga `workerd`-fel och anslutningsstängning vid nekade anrop.
