# 05-23 D — SQL-funktionsinventering och rollbackprov

Aktuell `pg_get_functiondef` och ACL inventerades read-only på det isolerade målet `protected` innan D-definitionerna skrevs. Baslinjen har 79 `phase5_*`-funktioner och exakt 19 Worker-entrypoints. Inga tillämpade migrationsfiler har ändrats.

## Ersatta definitioner

156000 ersätter exakt dessa tre funktioner med samma signatur och ACL. De övriga 76 gamla definitionerna är byteidentiska i rollbackprovet, och samtliga 79 gamla ACL är oförändrade före den separata grantmigrationen.

| Funktion | Signatur | SHA-256 före | ACL före |
|---|---|---|---|
| phase5_programplan_validate_selection | reference jsonb, block_id text, entry jsonb | af636d1340a7d860d5a5ef16a1333530f52762c3c70764b72e6681759d8fc6b9 | `{postgres=X/postgres}` |
| phase5_programplan_resolved_selections | plan_id uuid, unit_id uuid | 175505d8ce5f37a6d018fbc0b476145bde66d41307c3eb312cfb8745e5759ba4 | `{postgres=X/postgres}` |
| phase5_write_programplan_unit_packages | plan_id uuid, unit_id uuid, expected_revision integer, block_id text, entries jsonb | 8435ee0494230377c8d75a5e20ab33a37a9abfe4d2effb58f14206b7e889bcf4 | `{postgres=X/postgres,skolplattform_worker=X/postgres}` |

Valideraren accepterar nu frysta referenser `{type:'package',packageId,version}` och kontrollerar katalogpin, exakt blocktyp, paketets nivåer/poäng, fasta nivåer och fördjupningsalternativ. Skolspecifik validering sker dessutom i den nya interna `phase5_programplan_validate_scoped_selection`, som anropas både vid skrivning och upplösning.

En verifierad C-lucka rättades: valideraren hämtade tidigare `basis.nationalBlocks`, `basis.selectedSpecialization` och `basis.specializationOptions` från ett resolverresultat som saknar `basis`. Fasta nivåer jämförs nu med aktuella terminsradnycklar, inklusive alternativrader, och fördjupningsalternativ hämtas från exakt pinnat program. LATI1 i HU och BIOG1 i NA är därför spärrade när nivåerna redan är fasta. Detta ändrar inte lagrade paketval eller planrader.

## Nya objekt och behörigheter

`programplan_packages` har kontraktets oföränderliga versionsrader, unik `(package_id,version)`, skol-/organizerrelation, katalogreferens och skapande uppdrag/tid. RLS inklusive FORCE är på. UPDATE, DELETE och TRUNCATE nekas av triggers. PUBLIC, anon, authenticated, service_role och Worker har inga direkta tabellprivilegier.

Sju nya funktioner är stängda i foundationmigrationen:

- `phase5_programplan_package_immutable()`
- `phase5_programplan_package_levels(text,text,jsonb)`
- `phase5_programplan_package_result(programplan_packages)`
- `phase5_programplan_package_audit(text,uuid,uuid,integer,integer)`
- `phase5_programplan_validate_scoped_selection(jsonb,text,jsonb,uuid,uuid)`
- `phase5_save_programplan_package(uuid,integer,jsonb)`
- `phase5_list_programplan_packages(uuid)`

157000 ger EXECUTE endast till Worker för de sista två entrypointsen. Inga hjälpare öppnas; slutlig mängd är den tidigare mängden plus exakt dessa två, 19 → 21. Permanent tillämpning och preflight hanteras av samordnaren och är inte bevisade av detta rollbackprov.

Skrivning har session-/kundkontroll före skolor i id-ordning och paketets advisory-lås. Skapande kräver null package-id/expectedVersion 0; ny version kräver senaste versionens CAS. Huvudman kan skapa för egen skola eller alla egna skolor. Rektor/administrator måste ha eget aktuellt mandat både för ny versions källa och mål och får inte versionera en global källa.

Egen skola får lista alla tillgängliga oföränderliga versioner. En annan skola kan läsas endast när den ingår i en utbildning delad med en egen mandatsskola, och listan innehåller då bara exakta versioner som faktiskt valts på den skolan i läsbara delade planer. Nya versioner eller orelaterat utbud på den andra skolan exponeras inte.

Audit i samma transaktion: `programplan_package_saved`, objekt `programplan_package`/package-id, detaljer `{unitId,packageVersion,count}`; `programplan_packages_read`, objekt `school_unit`/unit-id, detaljer `{count}`. Count är antal nivåer respektive antal listade versioner. Auditfel rullar tillbaka skapandet eller stoppar lässvaret.

## Exakt basmängd för Worker

- `phase5_bind_programplan_draft(plan_id uuid, expected_revision integer, basis_reference jsonb)`
- `phase5_change_programplan_education(offering_id uuid, expected_revision integer, command text, details jsonb)`
- `phase5_change_timplan_cell(plan_id uuid, expected_revision integer, target_row text, column_index integer, new_hours integer)`
- `phase5_clone_programplan_draft(source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb)`
- `phase5_create_programplan_draft(offering_id uuid, expected_latest_version integer, basis_reference jsonb)`
- `phase5_create_programplan_education(command_id uuid, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb)`
- `phase5_list_programplan_offerings(page_number integer)`
- `phase5_list_timplans(page_number integer)`
- `phase5_programplan_education_status(command_id uuid)`
- `phase5_programplan_selection(unit_id uuid, catalog_id text, program_ref jsonb)`
- `phase5_programplan_workspace(offering_id uuid, version_page integer, catalog_id text)`
- `phase5_read_programplan(plan_id uuid)`
- `phase5_read_programplan_terms(plan_id uuid)`
- `phase5_read_programplan_unit_packages(plan_id uuid)`
- `phase5_read_timplan(plan_id uuid)`
- `phase5_replace_programplan_blocks(plan_id uuid, expected_revision integer, choice_blocks jsonb)`
- `phase5_replace_programplan_specialization(plan_id uuid, expected_revision integer, specialization_refs jsonb)`
- `phase5_write_programplan_terms(plan_id uuid, expected_revision integer, distribution jsonb)`
- `phase5_write_programplan_unit_packages(plan_id uuid, unit_id uuid, expected_revision integer, block_id text, entries jsonb)`

## Automatiskt verifierat lokalt

Granskad tillfällig provkörare anropar `assertTarget('protected')` före anslutning, lägger foundation och grant i en yttre transaktion, tar bort provfilens inre BEGIN/ROLLBACK och gör obligatorisk yttre ROLLBACK även vid fel. Ingen reset, migrationsjournal eller permanent grant skrivs. Följande pgTAP-resultat är från syntetiska data:

| Provfil | PASS |
|---|---:|
| `phase5_programplan_unit_packages.test.sql` | 137 |
| `phase5_programplan_catalog.test.sql` | 60 |
| `phase5_programplan_drafts.test.sql` | 108 |
| `phase5_programplan_worker.test.sql` | 31 |
| `phase5_programplan_workspace_worker.test.sql` | 18 |
| `phase5_programplan_lifecycle.test.sql` | 125 |
| `phase5_timplan_worker.test.sql` | 27 |
| `phase5_timplan_selection.test.sql` | 59 |

Totalt 565 kontroller. Den riktade filen behåller C-fallen och provar dessutom version 1/2, komplett oförändrad ursprungsrad, oförändrat skolval, upplösning av exakt gammal version, två planers gemensamma paket, olika skolmandat, global källspärr, HU/NA/fördjupning/IV, fel katalog, generiska språkförbud, poäng-/fördelningsform, namnparitet inklusive C1/NBSP, immutabilitet, auditrollback och riktiga Worker-rollanrop.

Historiska ACL-fixturer återkallar D:s två senare grants endast inne i rollback, så deras ursprungliga förväntade mängder fortsätter att vara exakta. Kontrollerna har körts med D-grants först tillfälligt öppnade.

Före foundation, efter foundation och efter yttre rollback jämfördes antal och hash av samtliga kompletta rader i exakt elva ursprungliga verksamhetstabeller: `point_plans`, `point_plan_events`, `offerings`, `offering_units`, `timplans`, `timplan_cells`, `class_timplans`, `school_classes`, `pupil_placements`, `programplan_shape_upgrades`, `programplan_unit_packages`. Samtliga jämförelser PASS. Även alla gamla funktionsdefinitioner/ACL är exakt återställda efter varje prov. Alla provets egna verksamhetsrader, nya paket och tillfälliga auditfeltriggers försvinner med rollback. Nya funktioner/tabeller försvinner när foundationen enbart funnits i provtransaktionen.

Rå definitioner, helradshashar, TAP och rapporter finns lokalt under `/private/tmp/phase5-23-d/`; de innehåller inga anslutningshemligheter och publiceras inte i handboken. Tidiga körningar gav SQL-tvetydighet samt två positiva testfixturfel och blottlade den fasta-nivå-lucka som rättades ovan; endast de slutliga gröna körningarna räknas här. Full SQL-svit, Worker-API/preflight, permanent migration/grant, webbläsare och mänskligt användarprov är separat arbete och påstås inte PASS av denna inventering.

## Källhashar för slutligt SQL-prov

- `supabase/migrations/20261004156000_phase5_programplan_packages.sql`: `7e087cfd70c589fc979817a489ea0d52512be1f4ca85523baf8798caf20cfa38`
- `supabase/migrations/20261004157000_phase5_worker_programplan_packages.sql`: `2e236c16180f539722e7098d88a8d2a2575824d9804a2a51f07594fe71956ea2`
- `supabase/tests/phase5_programplan_unit_packages.test.sql`: `abefe06cfa9f285470b1856ee3f868ab54a01bd6a51f79199931f8f55cf2811b`
