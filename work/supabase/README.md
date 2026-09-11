# Historiska databasskript

Skripten i den här katalogen — `verify.mjs`, `verify-cohorts.mjs`,
`verify-school-import.mjs` och `reset.mjs` — skrevs mot den gemensamma
molndemon. De importerar `signInDemo` ur `web/lib/supabase.ts`, som togs bort
i fas 1 (plan 01-03) när klientgränsen stängdes. Skripten körs därför inte i
aktuell kod och ska inte lagas för att köras mot molnet igen.

- `reset.mjs` raderar demohuvudmannens data. Det är aldrig ett baslinjesteg
  (beslut D-08: befintligt material bevaras, skripten mot molnet körs inte).
- Motsvarande prov mot avsiktligt isolerade lokala mål finns i `work/pilot/`
  (planerna 01-05 och 01-06). Använd dem, inte skripten här.
- Skripten bevaras som historik. Den fungerande versionen kan läsas ur taggen
  `fas1-baslinje`, till exempel:
  `git show fas1-baslinje:work/supabase/verify-cohorts.mjs`.

Granska alltid ett skript i `work/supabase/` innan något körs; flera skriver
till ansluten databas (se AGENTS.md).
