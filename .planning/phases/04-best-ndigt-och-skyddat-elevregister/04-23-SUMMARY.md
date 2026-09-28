---
phase: 04-best-ndigt-och-skyddat-elevregister
plan: "23"
subsystem: register-worker-acl
status: complete
completed: 2026-09-28
tags: [postgres, acl, worker, mfa, audit, probe]
requires: [04-10, 04-14]
provides:
  - Worker-körrätt för phase4_change_pupil, phase4_resolve_source, phase4_reveal_personal_number och phase4_export_pupils
  - ACL-kontrakt som prövar exakt Worker-mängd för phase4_* och stängda klientroller
  - Återkörbart verkligt Worker-prov för ändring, personnummer och export
affects: [04-13, 04-16, 04-19, 04-21]
requirements: [STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02]
requirements-addressed: [STU-01, STU-02, STU-03, STU-04, STU-06, DATA-01, DATA-02]
requirements-finally-verified: []
tech-stack:
  added: []
  patterns:
    - "Smal grant-migration: revoke från public/anon/authenticated och grant endast till skolplattform_worker (131000/141000/161000)"
    - "Worker-prov med egen slump-ID-kund och provmarkör, begränsad städning och bevarade säkerhetsloggar"
key-files:
  created:
    - supabase/migrations/20260929170000_phase4_worker_register_execute.sql
    - work/pilot/phase4-worker-execute-probe.mjs
    - .planning/phases/04-best-ndigt-och-skyddat-elevregister/deferred-items.md
  modified:
    - supabase/tests/phase4_register.test.sql
    - supabase/tests/phase4_periods.test.sql
    - supabase/tests/phase4_export.test.sql
key-decisions:
  - "Migrationens tidsstämpel blev 20260929170000 i stället för planens 20260929090000, som skulle sortera före befintliga 163000; den ligger före 04-17:s planerade 20260930100000"
  - "ACL-kontraktet prövar hela mängden phase4_*-funktioner som Worker kan köra (11 st, sorterad i C-kollation), inte bara de fyra, så att hjälpfunktioner och källeverans förblir stängda"
  - "Worker-provet i phase4_periods använder migrationens grant; den testlokala grant-raden togs bort"
  - "Nytt fokuserat provskript i stället för att utöka verify-mandates.mjs, vars fasta fas 3-falllista ingår i fasgrinden"
actuals:
  tokens: 7800
  tasks: 2
  commits: 2
plan_head_before: 88a715b4a2b9887387c48dec9cf12feacc39db81
duration: ca 35min
---

# Fas 4 plan 23: Worker-körrätt för registrets skrivvägar

**Behörig administratör med MFA kan nu ändra elevuppgifter, visa personnummer och exportera via Worker mot den verkliga lokala databasen. Rektor, administratör utan mandat på elevens skola, anrop utan MFA och direktanrop med anon eller authenticated nekas fortfarande och loggas. Allt är prövat lokalt med syntetiska uppgifter.**

## Genomfört

- **Migration `20260929170000_phase4_worker_register_execute.sql`** revokerar idempotent från `public, anon, authenticated` och ger `EXECUTE` endast till `skolplattform_worker` på exakt dessa signaturer, hämtade ur definierande migrationer:
  - `public.phase4_change_pupil(jsonb)` (150000)
  - `public.phase4_resolve_source(jsonb)` (160000, ersatt i 162000)
  - `public.phase4_reveal_personal_number(jsonb)` (140000)
  - `public.phase4_export_pupils(jsonb, boolean)` (140000)

  Inga andra funktioner, tabeller, roller eller RLS-policyer ändras. Funktionernas egna kontroller är oförändrade (levande mandat, spärr, skydd, D-20, `expectedVersion`), och loggen är fortsatt obligatorisk via `protectedRoute`. Ingen tidigare migration har skrivits om.
- **ACL-kontrakt:**
  - `phase4_register` prövar varje funktion för `anon`, `authenticated` och Worker.
  - PUBLIC saknar körrätt enligt `aclexplode`.
  - Den exakta mängden `phase4_*` som Worker kan köra är de sju tidigare granskade ingångarna plus de fyra nya.
  - Ingen `phase4_*` kan köras av `anon` eller `authenticated`.
  - `phase4_simulated_source_deliver` förblir stängd för alla tre roller.
  - `phase4_periods`: kontrollen av Worker-körrätt är vänd till öppen. Det verkliga Worker-anropet går nu via migrationens grant (den testlokala grant-raden är borttagen), och körrätten består efter rollback.
  - `phase4_export`: Worker är öppen, `anon` och `authenticated` stängda.
  - Inga andra assertions togs bort eller försvagades.
- **Tillämpning:** Migrationen tillämpades bara via den granskade lokala vägen:
  1. `assertTarget('protected')`.
  2. Kontroll att `schema_migrations` slutade på `20260929163000`.
  3. Kopiering till målets workdir.
  4. `supabase --workdir … migration up --local` och ny målkontroll.

  Ingen fjärrdatabas och ingen `reset.mjs` användes.
- **`work/pilot/phase4-worker-execute-probe.mjs --target protected --out …`** (ny):
  - Kör `assertTarget('protected')` före skrivning.
  - Kontrollerar att `dist-protected` innehåller 04-10:s routes och att migrationen är tillämpad. Annars blir resultatet BLOCKED.
  - Startar egen preview-Worker med samma metod som `verify-mandates.mjs`.
  - Skapar en egen kund med slump-ID-prefix och markören `Syntetiskt 04-23-prov`. Fixturen kommer från `phase4_conflicts.test.sql`, kompletterad med en administratör som bara har mandat på en annan skola.
  - Städningen är begränsad till den egna kunden och kontrollerar markören först. Säkerhetsloggar bevaras.
  - Rapporten innehåller bara fall-ID, status, HTTP-koder, antal och händelsenamn. Vid fel skrivs Workerns utdata till en 0600-fil i tmp, aldrig till rapporten.

## Faktisk verifiering

| Kontroll | Resultat |
|---|---|
| RED före migration | `phase4_register` FAIL 5/162 (de fyra Worker-assertionerna och exakt mängd); `phase4_periods` stopp på `permission denied for function phase4_change_pupil` (93/101 körda); `phase4_export` FAIL 1/22. Kontrollerna för anon, authenticated och PUBLIC passerade redan. |
| `run-sql-tests --file phase4_register.test.sql` | PASS 162/162 |
| `run-sql-tests --file phase4_periods.test.sql` | PASS 101/101 |
| `run-sql-tests --file phase4_export.test.sql` | PASS 22/22 |
| Full SQL (`phase4-23-all-sql.json`) | FAIL totalt: 16 filer, 1095 assertions, 14 filer ok. Fel endast i `phase3_boundaries` och `phase3_connections` (`Case school scope denied` före första assertion, ägs av 04-15). Alla fas 4-filer PASS. |
| `npm run build:protected` | PASS, bygge märkt `c69361e` |
| Worker-prov (`phase4-23-worker-probe.json`), slutkörning | **PASS 9/9 fall** på revision `d7ca458` med Worker-bygge `c69361e` |
| Stabilitet under planen | 11 körningar totalt. De sex körningarna med slutlig kontrollogik gav 5 PASS och 1 avbrott. Totalt avbröts 5 av 11 körningar av Wrangler (se Kvarstående). |
| `node --test lib/*.test.mjs lib/server/*.test.mjs` | PASS 383/383 (webbkoden oförändrad) |
| Städning | 0 kvarlämnade provkunder och providentiteter efter alla körningar; säkerhetshändelser kvar |

### Fall i Worker-provet

| Fall | Vad som prövas | Resultat i slutkörningen |
|---|---|---|
| worker-role | Workern ansluter som `skolplattform_worker` och har körrätt på de fyra funktionerna | PASS |
| admin-change | `POST /api/elever/andra` (basics) med MFA ger 200, ny version +1, inga elevvärden i svaret och committad `pupil_updated` | PASS |
| admin-reveal | `POST /api/elever/personnummer` två gånger ger 200. Numret är lika med elevens lagrade syntetiska nummer (jämfört utan utskrift). Varje anrop har egen korrelation med huvud- och objekthändelse `pupil_personal_number_read` | PASS |
| admin-export | Preview ger antal 1 utan rader. Nedladdning med personnummer ger `text/csv` som bilaga med rubrik och en rad. Händelser: `pupil_export_preview`, `pupil_exported` och `pupil_personal_number_exported` | PASS |
| no-mfa | Ändring, personnummer och nedladdning ger `403 mfa_required`, utan innehåll och utan ändring. Preview utan MFA ger bara antal (enligt 04-10) | PASS |
| other-role | Rektor får `403 forbidden` på alla fyra anropen | PASS |
| outside-mandate | Administratör med mandat bara på annan skola får `404 not_found` på alla fyra anropen | PASS |
| direct-client-roles | SQL som `anon` eller `authenticated` mot de fyra funktionerna ger `42501` (8/8). Worker-rollen utan serverns sessionskontext får inget personnummer (`42501`). Anonymt PostgREST-anrop via Kong ger 401 (4/4) | PASS |
| persistent-audit | Samtliga 6 tillåtna korrelationer har beständiga ok-händelser och samtliga 11 nekade har denied-händelser. Loggdetaljerna saknar elevnamn och personnummer | PASS |

**Beviskedjans gräns:** Sessionerna mintas i målet med testrealmens bevisprofil (issuer och klient från manifestet, `acr`/`amr`), på samma sätt som `verify-mandates.mjs`. Det prövar Workerns MFA-, mandat- och loggränser mot en riktig PostgreSQL. Det är ingen interaktiv IdP-inloggning, ingen browserverifiering och ingen kommunanslutning.

### Krav → prov (lokalt, syntetiskt)

- **STU-01, STU-02, STU-03:** Verklig ändring via Worker ger ny version och ändringshändelse (admin-change). Periodreglerna prövas i `phase4_periods` (101/101), där Worker-anropet nu går genom migrationens grant.
- **STU-04:** `phase4_resolve_source` är öppen för Worker och stängd för klientroller (ACL-kontraktet). Ett källbeslut via API har inte provats i Worker-provet. Det täcks av 04-06:s SQL- och samtidighetsprov och ska prövas i UI:t i 04-13.
- **STU-06:** Versionskontrollen följer med (`expectedVersion` från databasen). Nekade anrop ändrar inte versionen. Ett konfliktfall med 409 via verklig Worker har inte provats här.
- **DATA-01:** MFA-krav, nekande för annan roll och utanför mandat, stängda klientroller och en egen visningshändelse per personnummeranrop, utan elevvärden i logg eller rapport.
- **DATA-02:** Preview och nedladdning prövas var för sig, nedladdning kräver MFA och personnummerexport loggas.

Inga krav är slutverifierade här.

## Avvikelser från planen

1. **Migrationens tidsstämpel.** Planens `20260929090000` skulle sortera före befintliga `20260929100000`–`163000`. Därför valdes närmaste giltiga tidsstämpel, `20260929170000`, som ligger efter 163000 och före 04-17:s planerade `20260930100000`. Filnamnet i planens `files_modified` stämmer därför inte.
2. **[Rule 1, provlogik] Personnummerhändelser.** Min första kontroll krävde en enda `pupil_personal_number_read` per anrop. Workern skriver, enligt 04-10, en huvudhändelse och en objekthändelse, och båda har `object_type='pupil'`. Kontrollen kräver nu exakt två ok-händelser per egen korrelation. Produktkoden är oförändrad.
3. **[Rule 3] Ombyggnad av Workern.** `dist-protected` var byggd på `d3b9ee6`, före 04-10:s routes. Den byggdes om med `npm run build:protected`. Skriptet kräver nu att bygget innehåller exportroutens commit, annars ger det BLOCKED.
4. **Grenskydd.** `gsd-tools` klassar `master` som skyddad gren. Projektet har `branching_strategy: none`, alla tidigare plan-commits ligger på `master`, och orkestratorn angav sekventiell körning med vanliga commits i huvudarbetskopian. Commits gjordes därför på `master` enligt etablerad praxis. Ingen omskrivning av historik och ingen force-push gjordes.
5. `state.advance-plan` flyttade inte planpositionen, så STATE uppdaterades för hand (14/23, nästa 04-13 och 04-15).

## Kvarstående begränsningar

- **Icke-deterministiskt Wrangler-avbrott på nekade anrop** (se `deferred-items.md`):
  - Förlopp: 5 av 11 körningar stannade. Ett nekat anrop fick 500 utan kod och korrelation, och därefter svarade Workern inte. Wrangler skrev bara `✘ [ERROR]` med tomt meddelande.
  - Felet inträffade bara på nekade anrop (utan MFA eller med annan roll) efter ungefär 10–15 anrop.
  - Inget innehåll läckte och ingen ändring skedde.
  - Troligen samma fenomen som det oförklarade Worker-avbrottet i fas 3.
  - Felet fanns före den här planen, och webbkoden ändrades inte. Utredning krävs före 04-16/04-19/04-21, annars kan grindkörningar bli instabila.
- Konflikt (409) och källbeslut via verklig Worker, UI på dator och telefon (04-13), E2E (04-16), UI-grind (04-19), full fasgrind (04-21) samt användar- och fasverifiering återstår.
- Full SQL-grind är röd på två äldre fas 3-fixturer tills 04-15 är klar.
- Syntetiska prov godkänner ingen verklig drift, IdP-anslutning eller kommunanslutning.

## Commits

- `c69361e`: grant-migration och nytt ACL-kontrakt i tre fas 4-fixturer.
- `d7ca458`: verkligt Worker-prov av skrivvägarna.

## Self-Check: PASSED

- FOUND: supabase/migrations/20260929170000_phase4_worker_register_execute.sql, work/pilot/phase4-worker-execute-probe.mjs, deferred-items.md
- FOUND: c69361e, d7ca458 (2 commits uppmätta från `88a715b`)
