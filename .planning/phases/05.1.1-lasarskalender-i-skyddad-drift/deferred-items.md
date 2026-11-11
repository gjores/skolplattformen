# Uppskjutna punkter – fas 05.1.1

## Från 05.1.1-06 (2026-11-10)

- **pgTAP-fall för programplanens reservstart stämmer inte med D-19.** `supabase/tests/phase5_programplan_lifecycle.test.sql` (rad 115) och `supabase/tests/phase5_programplan_units.test.sql` (rad 149) lägger in ett läsår med status utkast och väntar sig att det ger reservstart. Efter `20261111100000_lasar_versions.sql` ger bara den gällande fastställda versionen reservstart (D-19). Filerna är hashlåsta i äldre apply-skript och ändrades därför inte i plan 06. Om de ska köras mot det nya schemat behöver fixturen lägga in en fastställd version (`status='faststalld'`, `decided_on`), och hashlåsningen behöver ett eget beslut. Det nya beteendet är prövat i `work/pilot/verify-lasar.mjs`.

## 2026-11-11 — extra äldre personal-SQL-prov blockerat

Vid plan 16 lades `verify-tjanst-personal --ephemeral` till utöver planens fyra tjänsteregressioner. Det föll före personalfallen: dess gamla start utesluter tjänstemigrationerna men kör en senare `20261030112000_elective_tjanst_sources.sql`, som behöver den då saknade `public.tjanst_rows` (42P01). Inga personalbeteenden hann verifieras; processen avslutades med exit1 och den egna PostgreSQL-miljön är städad. Rapport: `/private/tmp/lasar-package-sql-7dda-short-03-evidence/tjanst-personal/report.json`.

Användaren valde efter förklaring ordagrant **”Fortsätt med planens prov och repetitionen (rekommenderat)”**. Plan 16 kör därför exakt kalenderns tre originalsviter och tjänstefördelningens `plan`, `year-preview`, `year-commands` och `sharing`. Det extra provet markeras inte PASS och tas inte med i slutmanifestets accepterade urval. Originalprovet och dess basuppbyggnad ändras inte i denna leverans. En separat framtida rättning behöver bevara dess avsedda historiska migrationsprov och binda nya provkällor till en kandidat; inget fel i personalfunktionerna är fastställt av detta startfel.
