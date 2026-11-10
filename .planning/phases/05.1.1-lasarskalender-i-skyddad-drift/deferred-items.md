# Uppskjutna punkter – fas 05.1.1

## Från 05.1.1-06 (2026-11-10)

- **pgTAP-fall för programplanens reservstart stämmer inte med D-19.** `supabase/tests/phase5_programplan_lifecycle.test.sql` (rad 115) och `supabase/tests/phase5_programplan_units.test.sql` (rad 149) lägger in ett läsår med status utkast och väntar sig att det ger reservstart. Efter `20261111100000_lasar_versions.sql` ger bara den gällande fastställda versionen reservstart (D-19). Filerna är hashlåsta i äldre apply-skript och ändrades därför inte i plan 06. Om de ska köras mot det nya schemat behöver fixturen lägga in en fastställd version (`status='faststalld'`, `decided_on`), och hashlåsningen behöver ett eget beslut. Det nya beteendet är prövat i `work/pilot/verify-lasar.mjs`.
