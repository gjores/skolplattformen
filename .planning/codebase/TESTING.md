# Testing

Kartlagt 2026-09-10. Ingen ny appverifiering utförd i kartläggningen.

Ordinarie kontroller körs i `web/`:

```sh
node --test lib/*.test.mjs
npx tsc --noEmit
npx oxlint app lib
npm run build
```

Historiskt: 85 modelltester, typkontroll, riktad lint och bygge passerade 2026-09-08, tillsammans med roll- och layoutprov på dator/mobil. Full mall-lint hade äldre avvikelser utanför den egna appkoden. Återanvänd inte resultatet som en aktuell produktionsgaranti.

`work/supabase/verify.mjs`, `verify-cohorts.mjs` och `verify-school-import.mjs` innehåller kontroller med riktig databasåtkomst. De ska granskas före körning och riktas till isolerad testmiljö. `reset.mjs` är ett destruktivt demoverktyg, inte ett teststeg för pilotdata.

Saknad pilotverifiering: verkliga separata användare, kund- och skolgränser, utgångna uppdrag, spärr med gammal session, skyddade sök-/export-/filvägar, registerkonflikter, återställning samt kommunal identitetsanslutning. Testa behörighet via API/databas också, inte endast dolda knappar.
