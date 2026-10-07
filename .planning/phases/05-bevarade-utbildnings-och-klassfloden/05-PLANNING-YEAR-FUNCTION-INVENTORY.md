# Läsårsplanering — tillämpad funktionsinventering

**Aktuell 05-38, 2026-10-07:** tre exakta läsgrants tillämpade efter actual preflight och slutprov 15/247 PASS vardera. Worker har 28 entrypoints; 11 privata planeringshjälpare fortsatt stängda. Endast läsentrypoints i tabellen nedan har Worker-EXECUTE, övriga fyra roller saknar EXECUTE på samtliga 14. Grant-SHA: `ef34e6a5f606d940e6851aed591a2cb84ff8af279c94994cbca9655326e2db82`. Definitionhashar är oförändrade från foundation; [tillämpat bevis](../../../work/pilot/results/phase5-38-grants.json).

**Historisk 05-37, 2026-10-07:** exakt foundation `20261006120000_phase5_planning_year_reads.sql` tillämpad i isolerad lokal protected-target. Tre framtida läsentrypoints och elva privata hjälpare; alla 14 är stängda för PUBLIC, anon, authenticated, service_role och skolplattform_worker. Befintliga 25 Worker-entrypoints/ACL är oförändrade. 05-38 får endast öppna de tre markerade entrypoint-signaturerna efter sin egen verkliga preflight.

SQL SHA-256: `e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71`. Journalen innehåller exakt denna fil; filen ändras inte efter apply. Rå ACL, individuella definitionhashar och faktisk security-definer/volatilitet finns i [maskinläsbar inventering](05-37-FUNCTION-EVIDENCE.json).

| Exakt signatur | Användning | EXECUTE för de fem rollerna |
| --- | --- | --- |
| `public.phase5_planning_year_academic_date(date)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_actor()` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_audit(text)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_gym_cells(jsonb,uuid)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_list(jsonb)` | Läsentrypoint | Endast Worker |
| `public.phase5_planning_year_measure(bigint,boolean)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_metrics(jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_overview(jsonb)` | Läsentrypoint | Endast Worker |
| `public.phase5_planning_year_revision(jsonb,jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_rows(jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_selection()` | Läsentrypoint | Endast Worker |
| `public.phase5_planning_year_sorted(jsonb,jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_totals(jsonb,jsonb)` | Privat hjälpare | Nekad |
| `public.phase5_planning_year_validate(jsonb)` | Privat hjälpare | Nekad |

Aktuell rå ACL för tre läsentrypoints är `{postgres=X/postgres,skolplattform_worker=X/postgres}`; de elva hjälparna har `{postgres=X/postgres}`. Inga breda grants, elev-/skriv-/beslutsrättigheter eller tabelländringar tillkommer. Alla läskommandon kräver riktig session/correlation och DB-audit. Klassreferenser är verkliga UUID:n inom scope; råa klassnamn eller personuppgifter finns inte i denna inventering.

Historiskt reproduktionskommando för 05-37:s stängda stadium (kan inte köras oförändrat efter 05-38-grants): `node work/pilot/verify-planning-year-foundation.mjs --target protected --mode applied --out work/pilot/results/phase5-37-foundation.json` (Node 25). Ett nytt apply vägras om migrationsnummer/namespace redan är upptagna. [Genomförandegränser och felhistorik](05-37-SUMMARY.md) samt [verifiering](05-37-VERIFICATION.md).

Aktuellt reproduktionskommando: `node work/pilot/verify-planning-year-api.mjs --target protected --base-url http://127.0.0.1:3060 --out work/pilot/results/phase5-38-api-final.json`. 05-38-READ-PERFORMANCE får ändra endast rows-hjälparens definition, inga grants.
