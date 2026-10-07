# Läsårsplanering — tillämpad funktionsinventering

**05-37, 2026-10-07:** exakt foundation `20261006120000_phase5_planning_year_reads.sql` tillämpad i isolerad lokal protected-target. Tre framtida läsentrypoints och elva privata hjälpare; alla 14 är stängda för PUBLIC, anon, authenticated, service_role och skolplattform_worker. Befintliga 25 Worker-entrypoints/ACL är oförändrade. 05-38 får endast öppna de tre markerade entrypoint-signaturerna efter sin egen verkliga preflight.

SQL SHA-256: `e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71`. Journalen innehåller exakt denna fil; filen ändras inte efter apply. Rå ACL, individuella definitionhashar och faktisk security-definer/volatilitet finns i [maskinläsbar inventering](05-37-FUNCTION-EVIDENCE.json).

| Exakt signatur | Användning | EXECUTE för de fem rollerna |
| --- | --- | --- |
| `public.phase5_planning_year_academic_date(date)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_actor()` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_audit(text)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_gym_cells(jsonb,uuid)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_list(jsonb)` | Läsentrypoint | Nekad |
| `public.phase5_planning_year_measure(bigint,boolean)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_metrics(jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_overview(jsonb)` | Läsentrypoint | Nekad |
| `public.phase5_planning_year_revision(jsonb,jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_rows(jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_selection()` | Läsentrypoint | Nekad |
| `public.phase5_planning_year_sorted(jsonb,jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_totals(jsonb,jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_validate(jsonb)` | Privat hjälpare | Nekad |

Samtliga råa funktion-ACL är `{postgres=X/postgres}`; endast databasägaren har exekveringsrätt. Inga breda grants, elev-/skriv-/beslutsrättigheter eller tabelländringar tillkommer. Alla läskommandon kräver riktig session/correlation och DB-audit. Klassreferenser är verkliga UUID:n inom scope; råa klassnamn eller personuppgifter finns inte i denna inventering.

Reproducerbart: `node work/pilot/verify-planning-year-foundation.mjs --target protected --mode applied --out work/pilot/results/phase5-37-foundation.json` (Node 25). Ett nytt apply vägras om migrationsnummer/namespace redan är upptagna. [Genomförandegränser och felhistorik](05-37-SUMMARY.md) samt [verifiering](05-37-VERIFICATION.md).
