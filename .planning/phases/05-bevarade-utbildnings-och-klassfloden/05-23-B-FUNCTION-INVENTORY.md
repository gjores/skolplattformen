# 05-23 B — SQL-funktionsinventering

Read-only inventering av protected, syntetiskt mål, 2026-10-05. Samtliga aktuella fas 5-definitioner hämtades via pg_get_functiondef före ersättning. Inga permanenta ändringar.

| Funktion | Signatur | SHA-256 | ACL |
|---|---|---|---|
| phase5_bind_programplan_draft | plan_id uuid, expected_revision integer, basis_reference jsonb | 650d06a56ae8e1310976be38c06f70addc8eb0d82e9f1613f622999ec80a29af | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_change_programplan_education | offering_id uuid, expected_revision integer, command text, details jsonb | 9aa2deacc77c3c87400edccecaecf7137ecdd5f85dfb891eae41654684183954 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_change_timplan_cell | plan_id uuid, expected_revision integer, target_row text, column_index integer, new_hours integer | aa43fa427e4e4a0a164b2c19aeca55dca4aba487de54baa69ba578de75c022c7 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_clone_programplan_draft | source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb | d364c5076b9ed251347d9ff2b30468e9b0f462f06e072717439191843e5f77ce | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_create_programplan_draft | offering_id uuid, expected_latest_version integer, basis_reference jsonb | 17f0b02582603e7f287abea432d9893ebb44f8c2c92a71cb310bd22a69c3acce | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_create_programplan_education | command_id uuid, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb | 3eb488715e2435c2d0548e8ff201a1e949398fa329cf3eea66d149cb9d51aedf | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_list_programplan_offerings | page_number integer | a0a5421913fa3740f818057dbec6e24a5f52a217f4b02afd9eca941afc528935 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_list_timplans | page_number integer | f16c1083bbc4f47f916e0bf275c58d7be08e88729d1545c9bd2e25311c517636 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_actor |  | 2296bf837bcfe79b88c267f47fc616b7972b9df15f910ea5b153b091c1986728 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_alternative_groups | subjects jsonb | a64d1459839ed3c800c5205ded41f181e62826bb7164c4853b831ce68ab290ce | {postgres=X/postgres} |
| phase5_programplan_array | v jsonb, maximum integer | 297303000595bce47c1c84efb70f12a9318748f6e8d58f5cae87a8bf5392709a | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_audit | plan_id uuid, operation text, source_plan_id uuid | e9c5cf1341e47ed45602e791d517fd52009f1c455ffcc4527ffd29db4f5a9c58 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_block_valid | block jsonb, subjects jsonb | 7654e0beb083ea575a5dfc964b37c06e35b38c1608925901f5136a1422c52fbb | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_blocked | reason text, catalog_id text, program_ref jsonb | b080c9e92c305cbbf7f36d66b612e1f7ef4c51bd9beedf9c16acc874834cf07b | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_canonical | v jsonb | 3ae42a1b3eea58c3285b6f9412f724870b1ab55327466c7174e1e2dfca7cfb6b | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_catalog_guard |  | cd503aad255ba46be57895fc6271d148cb449a8f3d348bd46f131b93150d89d5 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_catalog_immutable |  | 71aa7bf88abb01097d4900052ef8bf74a26871604fc7e6a0985de9776298b12b | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_choice_block_diagnostics | reference jsonb | 4a9b45685dcc015101ef2522d6be4a4983468f9570397d22371de5129ef70cbd | {postgres=X/postgres} |
| phase5_programplan_choice_blocks | reference jsonb | 53cd943d663edecaaba4d0222a7738d572be316679082535f66d05bd05e76f44 | {postgres=X/postgres} |
| phase5_programplan_code | v jsonb | fdec90949714b9b868e305889b281389172bba1e80da0a4f76c42a395cc140fe | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_date | v jsonb | 826c8523b75b111c051fdcfa0ac005d78d2f622697df0999df20d7235c4a90a5 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_date_diagnostic | v jsonb, started_on text | c70ffef8b669aab46ee8949b1838bb6c10d0d8d6f3751126274f291622750a7c | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_dates | v jsonb | 7cffe4b38446be2dea7045fc0c55951f4280f5786d4131a59ecfc42b785bee0a | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_education | offering offerings | b86048159f22d88cb1173c5898f0b0997895ad4326ecd104f10916a690d2c053 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_education_audit | operation text, object_id uuid, object_type text | d0914271d6eafd2a41dcb2a0a5929a8806e3c48a232fb7dcbd5b0d654fc0a196 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_education_status | command_id uuid | 3b12d52b40b0cfe8723d634793fa26c4226f9b2e122a75dbb18532459e2d140c | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_event_actor |  | cf9d908971da27394ab42f2bf1aaaa62d78b686a63bd774b6364669986c88c85 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_guard |  | 20a2aa1f5524f948d062940518564d45d253bddb65eb833be6767e4e969306ce | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_integer | v jsonb, minimum integer, maximum integer | 89da2f7725f854149c30bfdde345d852b8ae237540648c27f7d29a501404daf1 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_item | v jsonb | d9922aa5fe52a3ed3be9c455bb0c1d8babb5b13acd3188ea585c89a5b905b345 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_lifecycle | o offerings | 93123c72b4eeff8dcdb18ac5ba359bb64ba469b9f39c86d76fbe301822d38aa7 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_lifecycle_audit | operation text, offering_id uuid, details jsonb | f6f9a8d4fb0702bb9ad796b3f78cd6cc6f86e0d52b3f7520ab73419b7ac27e48 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_organisation_actor |  | 2d337116411dfa9555070dd12148cf4c28bc7e4fb644135da80a3d6182f7ddc2 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_payload_valid | v jsonb | 43fb834dcae41fb714e05087aaeab554aae44ffb07e0f39aad78d20c9219af67 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_phase | o offerings | be82fafc2e88ca2b0389ac6538f2ec0ed2530c865e7d8990a87d2832329e3f67 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_phase_at | starts_on date, start_year integer, has_decided boolean, today date | be236c52f98991e63f69ae14102892adf0e970e378a37f5144db6c001db838da | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_primary_unit |  | 2225c80347e40faf304e61002ea01ecac4cb4ebde707a8f5f736aaea0ac21478 | {postgres=X/postgres} |
| phase5_programplan_result | plan_id uuid | ada604fd8820035ece42b13cbf75a822a1e24e54430f0cdebcb85563abb0a078 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_scope | plan_id uuid, offering_id uuid | 9fa8348f4076c92225f2dc3b0686e33f8bab36f7d4b241994d3e898b3fb27039 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_selection | unit_id uuid, catalog_id text, program_ref jsonb | d44b1ef3f094c88c390c26c1ee318cd7c9a754da65ba94478a10e88b40e99a09 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_session_check |  | 40c3b7c4759ede12f672a45f6f762cdf2df6ad4b46391fb7c7eaf47fc7930efe | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_shape | v jsonb, keys text[] | 0b7ae96565b011f83ba7000909dc497b07c0b1d1f6d3173b64ff96318eb72e9c | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_starts_on | o offerings | 7dcd9b85aa4c8ea87fde4753206af99185fc672ab9a77623f3395d17a8f22db1 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_subject_diagnostics | s jsonb, started_on text, block_id text | 5b2d1ae3adfb11bef00d5029a4f30b9527f3c20ad0edaeb178205b57435586e5 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_term_rows | reference jsonb | 05f3bf6b5833569ffff4e60ae9f934167f2a37f4dfe4d6fefa37511368f9de0f | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_terms_audit | plan_id uuid, operation text | 25c9a2f014c40f56d960a6b8538ddd4ba39237d1370912175ce302a85b6d97d5 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_terms_guard |  | e363a4e42340e880255a1fcee025568e5a8741cde8a210773d626f01d665d7a6 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_text | v jsonb, maximum integer | f701c75184d4d4aeb0cfb6d16f0abe83dd33fe8518b72f868896b390307aed3f | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_today |  | 1209cff4025425dc3e2994cd988caf2f04afa67d12a285fd4a4713b45ef80d0d | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_unit | unit_id uuid, require_hm boolean | e996fcbe10d4d0a39b62a2eda9d1989a0c8884ea4ac2e6f55341eb25b660f157 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_unit_guard |  | 4a77b4715b391947baf2a9dc84a6085c82d222b99b07870e5f893723cd831256 | {postgres=X/postgres} |
| phase5_programplan_url | v jsonb | a79a881a1f39f402fae08143f4cb2b4fd41f4ceaae8246cadd88ce6e6dbce054 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_validate_basis | reference jsonb, offering offerings, previous_choices text[] | 44f4e25174a91fa0d5abfd1cdec64a2843da6d2593c2a752da62cda19b0aa604 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_validate_terms | reference jsonb, distribution jsonb | 818b549a001e54d88c7409d37185257c71282ecd1ccc6cdc2a54f016802f7d35 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_workspace | offering_id uuid, version_page integer, catalog_id text | 304c7a72d3577f43ba249faed7ea52ac22ae46f08be2bd8532c6b356bc74c486 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_workspace_audit | offering_id uuid, operation text | e9c846d739ef6c95ef3dcdfe121db33ed356410e893ff6157bd91f3e2c1aec4e | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_writable | o offerings, require_hm boolean | 40e4763ec89fd9aaf05d925fd90f2d63c8d70c6161fd7c79d7a00ad2e2ee26e3 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_read_programplan | plan_id uuid | 4d69ae5179ab8d7f17931f00896331b0dc774e1dcbd577744394101cd29bcae2 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_read_programplan_terms | plan_id uuid | 52d7560ea5c3b1bb5a84caf796b1ef4232fef0c67c5fd86786c8942a10f4c622 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_read_timplan | plan_id uuid | 62ecb96827018c9d023999843b997c0859fd47a1edf5b3575c621847feb06b49 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_replace_programplan_specialization | plan_id uuid, expected_revision integer, specialization_refs jsonb | 440a0fa69e34df3afa09990384b9aea6ec7713fe2234237c2bd3040ac547a7eb | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_resolve_programplan_basis | reference jsonb | 4156d71b6188e1bd04a947328d969ec208301d1bbc632352933e8399028695ee | {postgres=X/postgres,service_role=X/postgres} |
| phase5_timplan_audit | plan_id uuid, operation text | 88e7e55b90d6e7da174c0f74ddd0921d217af02a9b069a743d32b57422270237 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_timplan_scope | plan_id uuid, writing boolean | 5397937a8bca48c517f48dbf4d84e1f7364c5f22b01495d08617fdfc345ac3d8 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_write_programplan_terms | plan_id uuid, expected_revision integer, distribution jsonb | 486350bcd616a9aa51ea1d448601f502d7c83d16ca926ca04a87c1cb4eee96ea | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |

Hela verksamhetstabeller; MD5 av alla JSONB-rader i C-ordning, tom avskiljare.

| Tabell | Antal | MD5 |
|---|---:|---|
| point_plans | 20 | a5b359e6ddcf8fa3e48152bf63a5eaff |
| point_plan_events | 47 | 21fa46fef35eb2f30ec5d834b08d14de |
| offerings | 34 | 07a0b8f3d0db88dae7abd625085bb932 |
| offering_units | 119 | 11cd63a1ff1fd3f49cde3d3954b3ffe7 |
| timplans | 4 | 7b0075f553817ec886592d3efd694fc2 |
| timplan_cells | 46 | 2df60780ec954cf7baa3266a25a97f0a |
| class_timplans | 0 | d41d8cd98f00b204e9800998ecf8427e |
| school_classes | 6 | 73c0af1bc99a66cc0d2931b8da8bcb87 |
| pupil_placements | 68 | aa23ef97ff2a5b0230880445dcce4296 |

## Berörda äldre triggerhjälpare (bevaras)

- guard_decided_point_plan(): SHA-256 `85ae277275367a9a9562b744b6c652d97fe37ca368653ecbf1bca5b53e4f7fe1`, ACL `{postgres=X/postgres,service_role=X/postgres}`. Definitionen läst read-only, ersätts inte.
- touch_updated_at(): SHA-256 `ff1ed34c5446808469b8d3c682225f26497b7ca3c4955a20990b3c4d8977b9c9`, ACL `{postgres=X/postgres,service_role=X/postgres}`. Definitionen läst read-only, ersätts inte.

Worker har före B exakt 16 fas 5-entrypoints. Triggerinventering före visar point_plans_touch=O och samtliga tre andra point_plans-guardtriggers=O. 152000 kräver och återställer O; andra guards är aktiva under hela uppgraderingen.

## Slutlig implementation och rollbackbevis

151000 ersätter nio befintliga funktioner med samma signatur: guard, writable, bind, specialization-replace, create-draft, create-education, clone, audit och event_actor. Deras tidigare ACL bevaras. Nya stängda hjälpare kräver v2, uppgraderar basis/terminer och nekar återanvända block-ID:n. Nytt stängt kommando replace_programplan_blocks använder scope, writable, CAS och atomisk actorhistorik/DB-audit. Blockhistorikens comment innehåller endast kontrollerad JSON med retiredBlockIds; inga namn/poäng förs till säkerhetsloggen. Spärren gäller även andra versioner inom samma utbildning.

152000 uppgraderar endast bundna legacyutkast, även låsta utbildningars utkast. Revision ökar en gång; basis/terminer uppgraderas deterministiskt. Alla andra fält inklusive updated_at bevaras. Förevärden finns i den stängda tabellen programplan_shape_upgrades. plan_id är primärnyckel utan främmande nyckel: förebevisen överlever utbildningsborttagning och inför ingen ny raderingsspärr. 153000 öppnar endast blockkommandot efter just steg B:s verifierade Worker-preflight; tidigare ACL ska ha exakt 16 entrypoints och den nya exakt 17.

Giltig legacy-termform hade inga optional Svenska/SvA-rader. Alla tillämpliga gamla termrader och deras ordning bevaras, endast meta:individualChoice blir block:iv1. Olagliga gamla SVEN/SVEA-termrader avvisas uttryckligen i SQL och TS; de tappas inte tyst. V2 uppgradering är oförändrad. Inventerade SQL-definitioner innehåller ingen gammal nivåordningsdiagnos; D-13 ligger i TS-analysen.

- RED: nya blockkommandot saknas på steg A-schema, 42883; skyddat mål, full rollback. Diagnos /private/tmp/phase5-23-b/red.json.
- GREEN: 897/897 pgTAP-kontroller i elva programplansfiler genom 151000 i rollback. Nya blockfilen har 33 kontroller för direkt formgräns, splittrad IV/fördjupning, CAS, slot/IV/ramspärr, admin/arkiv, legacyclone, helradskälla, auditrollback, borttagna IDs och auditrollback av själva borttagningen/retireringshistoriken. Se work/pilot/results/phase5-23-b-sql-rollback.json.
- Upgrade rollback: 14 eligibleutkast inklusive ett syntetiskt arkivlåst utkast. Fullrad efter uppgradering exakt motsvarande bara basis, termfördelning och revision+1; alla föreloggar exakta; övriga åtta verksamhetstabeller och gamla ACL oförändrade. Befintligt delete-education kommando fungerar på uppgraderat utkast; föreloggen behålls och är stängd för samtliga klient/Worker/service_role. Alla nio heltabellshashar är återställda efter rollback. Se phase5-23-b-upgrade-rollback.json.
- Uppgraderingsparitet SQL/TS: 210/210 vektorer (alla 70 program/inriktningskombinationer × legacy tom, legacy med fasta/IV-terminer, v2), fullbasis/fördelning/ordning. Se phase5-23-b-upgrade-parity.json.
- Migrationparser: 11/11 Node-kontroller PASS. applyverktyget kräver rätt preflightkind för varje grantmigration och stage b för blocks.

Inga permanenta migrationer, journalposter, grants, commits eller pushar gjordes av SQL-executorn. Aktuell tillämpning och faktisk Worker/webbläsarbevisning utförs av samordnaren. Hela 05-23 är fortsatt öppen.

## Separat rättning 152100 efter tillämpning av B151000/B152000

Aktuell pg_get_functiondef och ACL läst read-only före rättning; tillämpade migrationsfiler ändras inte.

| Funktion | Signatur | SHA-256 | ACL |
|---|---|---|---|
| phase5_clone_programplan_draft | source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb | 18412d9ab0fd52fa6efecaa4e8936ae79d69b6f204ff070c3357f2d2499e7da0 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_create_programplan_draft | offering_id uuid, expected_latest_version integer, basis_reference jsonb | c7d2ed3a5bcd92d23cccec77f82aa1893fba486b569fed88012071bdb22a056b | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_guard |  | 80bcb64a5c1219e9da4f1ccdad97edef8aee251240eb3cae4bd006848479a3d1 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_require_unused_block_ids | offering_id uuid, reference jsonb | 7e571c4f72ff983d4e4b342219a613b9b5f5749932a89d1f13e4d0d0ede1b302 | {postgres=X/postgres} |

152100 ersätter endast guard, clone och create-draft med samma signatur och samma ACL. Den redan stängda retired-ID-hjälparen är oförändrad. UPDATE kontrollerar nyintroducerade ID:n; block som finns i versionens old-basis får behållas. INSERT från clone med kontrollerad intern källkontext kräver att hela underlaget, fördelningen, utbildningen, huvudmannen, valen och nya versionsnumret motsvarar den låsta fastställda/ersatta källan. Clone återställer kontext efter INSERT och efter fel; create-draft tömmer kontext runt INSERT och kan därför inte användas för att kringgå retired-ID-spärren. Tillämpade 151000 och 152000 ändrades inte.

- Slutligt RED på faktiskt tillämpat 151000/152000: 15 kontrollfall, 6 förväntade följdfel. Det första konkreta felet är 22023 när en äldre ersatt källa klonas efter att v2 retirerat dess block-ID. /private/tmp/phase5-23-b/clone-red.json.
- GREEN i rollback med 152100: 912/912 pgTAP i tolv programplansfiler. Nya clone-identity-filen 15/15: v1→v2→retirering→fastställning→kloning av v1→ändring av annat block, create och förfalskad create-context nekas, återinförande efter borttagning nekas, båda gamla källrader bevaras helt, auditfel återställer alla versioner/historikrader/temporär kontext. Se work/pilot/results/phase5-23-b-clone-identity-rollback.json.
- 152100 helrad/ACL-proof: alla nio fulla verksamhetstabeller oförändrade genom migrationen, samma funktionsmängd och gamla ACL, exakt 16 Worker-entrypoints. Alla ursprungliga definitioner, ACL och nio hashar återställda efter rollback. Se work/pilot/results/phase5-23-b-clone-preservation.json.
- Källa SHA-256: 26cff31f00878ed5c84983e427ce1fde4885fd11d46764575a4416fa942717cf. Migrationsverktyget tillåter rättningen utan grants och kräver den före separat 153000 grant. Faktisk tillämpning och ny Worker-preflight görs av root.
