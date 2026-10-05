
## 05-23 C — SQL-funktionsinventering

Aktuell pg_get_functiondef och ACL läst read-only före rättning; tillämpade migrationsfiler ändras inte.

| Funktion | Signatur | SHA-256 | ACL |
|---|---|---|---|
| phase5_bind_programplan_draft | plan_id uuid, expected_revision integer, basis_reference jsonb | 8f5fcb2acae7ecd9cde657e3327f7e7ea76f5d50d52074db093f8c3042031070 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_change_programplan_education | offering_id uuid, expected_revision integer, command text, details jsonb | 9aa2deacc77c3c87400edccecaecf7137ecdd5f85dfb891eae41654684183954 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_change_timplan_cell | plan_id uuid, expected_revision integer, target_row text, column_index integer, new_hours integer | aa43fa427e4e4a0a164b2c19aeca55dca4aba487de54baa69ba578de75c022c7 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_clone_programplan_draft | source_plan_id uuid, expected_source_revision integer, expected_latest_version integer, explicit_legacy_basis jsonb | 23a3b3cbdfefc62aefba48a6e7c1099a404405bf4a3365aecbeb5b6d2a7623a2 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_create_programplan_draft | offering_id uuid, expected_latest_version integer, basis_reference jsonb | 2743cccac507bae59515e087cbfcd859f2b87c38556a68639c57b68b7036446a | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_create_programplan_education | command_id uuid, unit_id uuid, name text, local_code text, cohort text, basis_reference jsonb | 854ddc621e735e35975d85c771bbadfa726aa67d01c2a9fc83667b5a4e3a30f0 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_list_programplan_offerings | page_number integer | a0a5421913fa3740f818057dbec6e24a5f52a217f4b02afd9eca941afc528935 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_list_timplans | page_number integer | f16c1083bbc4f47f916e0bf275c58d7be08e88729d1545c9bd2e25311c517636 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_actor |  | 2296bf837bcfe79b88c267f47fc616b7972b9df15f910ea5b153b091c1986728 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_alternative_groups | subjects jsonb | a64d1459839ed3c800c5205ded41f181e62826bb7164c4853b831ce68ab290ce | {postgres=X/postgres} |
| phase5_programplan_array | v jsonb, maximum integer | 297303000595bce47c1c84efb70f12a9318748f6e8d58f5cae87a8bf5392709a | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_audit | plan_id uuid, operation text, source_plan_id uuid | 4b4f8cffe25dd8627181a40e00d82caeb229e0eaaf934db7d81fb389437c9b68 | {postgres=X/postgres,service_role=X/postgres} |
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
| phase5_programplan_event_actor |  | 4b6770cb12c5fbd5acb4767e91e854cb82bc8e4b9b89fcd9ef16db388122f0d5 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_guard |  | fae0c9a6ac2858574dd692368a7ec538c531743129e75561a1d6534c3ca75295 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_integer | v jsonb, minimum integer, maximum integer | 89da2f7725f854149c30bfdde345d852b8ae237540648c27f7d29a501404daf1 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_item | v jsonb | d9922aa5fe52a3ed3be9c455bb0c1d8babb5b13acd3188ea585c89a5b905b345 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_lifecycle | o offerings | 93123c72b4eeff8dcdb18ac5ba359bb64ba469b9f39c86d76fbe301822d38aa7 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_lifecycle_audit | operation text, offering_id uuid, details jsonb | f6f9a8d4fb0702bb9ad796b3f78cd6cc6f86e0d52b3f7520ab73419b7ac27e48 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_organisation_actor |  | 2d337116411dfa9555070dd12148cf4c28bc7e4fb644135da80a3d6182f7ddc2 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_payload_valid | v jsonb | 43fb834dcae41fb714e05087aaeab554aae44ffb07e0f39aad78d20c9219af67 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_phase | o offerings | be82fafc2e88ca2b0389ac6538f2ec0ed2530c865e7d8990a87d2832329e3f67 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_phase_at | starts_on date, start_year integer, has_decided boolean, today date | be236c52f98991e63f69ae14102892adf0e970e378a37f5144db6c001db838da | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_primary_unit |  | 2225c80347e40faf304e61002ea01ecac4cb4ebde707a8f5f736aaea0ac21478 | {postgres=X/postgres} |
| phase5_programplan_require_current_shape | reference jsonb | 704d71a9f171478c6cee42cc33496f2bbd6bfa11aedd226ecc041bd9a79c83b7 | {postgres=X/postgres} |
| phase5_programplan_require_unused_block_ids | offering_id uuid, reference jsonb | 7e571c4f72ff983d4e4b342219a613b9b5f5749932a89d1f13e4d0d0ede1b302 | {postgres=X/postgres} |
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
| phase5_programplan_upgrade_shape | reference jsonb | cb8d09df5583e3f6e0a888e1056cc091bcc57e9fcb673dbc01b73ea3baf0bd13 | {postgres=X/postgres} |
| phase5_programplan_upgrade_terms | old_reference jsonb, old_distribution jsonb | 0cd2a0ecae8e28343235029f1e8ca661bf770196649f8e976db54fcfeed775a1 | {postgres=X/postgres} |
| phase5_programplan_url | v jsonb | a79a881a1f39f402fae08143f4cb2b4fd41f4ceaae8246cadd88ce6e6dbce054 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_validate_basis | reference jsonb, offering offerings, previous_choices text[] | 44f4e25174a91fa0d5abfd1cdec64a2843da6d2593c2a752da62cda19b0aa604 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_validate_terms | reference jsonb, distribution jsonb | 818b549a001e54d88c7409d37185257c71282ecd1ccc6cdc2a54f016802f7d35 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_workspace | offering_id uuid, version_page integer, catalog_id text | 304c7a72d3577f43ba249faed7ea52ac22ae46f08be2bd8532c6b356bc74c486 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_programplan_workspace_audit | offering_id uuid, operation text | e9c846d739ef6c95ef3dcdfe121db33ed356410e893ff6157bd91f3e2c1aec4e | {postgres=X/postgres,service_role=X/postgres} |
| phase5_programplan_writable | o offerings, require_hm boolean | 579e9c6702d46f5e8279ed08d76f9d00cebc2078c7aa8b0fa47ab0d72884d697 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_read_programplan | plan_id uuid | 4d69ae5179ab8d7f17931f00896331b0dc774e1dcbd577744394101cd29bcae2 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_read_programplan_terms | plan_id uuid | 52d7560ea5c3b1bb5a84caf796b1ef4232fef0c67c5fd86786c8942a10f4c622 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_read_timplan | plan_id uuid | 62ecb96827018c9d023999843b997c0859fd47a1edf5b3575c621847feb06b49 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_replace_programplan_blocks | plan_id uuid, expected_revision integer, choice_blocks jsonb | f06bacd452d4e06aa46adc693b3d4971446b874c0b20cf8eb43c2257655b4343 | {postgres=X/postgres,skolplattform_worker=X/postgres} |
| phase5_replace_programplan_specialization | plan_id uuid, expected_revision integer, specialization_refs jsonb | 12235446dd70c2981ac1a8f59aaa13039f27fdb28d4431a434362a088f372c79 | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |
| phase5_resolve_programplan_basis | reference jsonb | 4156d71b6188e1bd04a947328d969ec208301d1bbc632352933e8399028695ee | {postgres=X/postgres,service_role=X/postgres} |
| phase5_timplan_audit | plan_id uuid, operation text | 88e7e55b90d6e7da174c0f74ddd0921d217af02a9b069a743d32b57422270237 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_timplan_scope | plan_id uuid, writing boolean | 5397937a8bca48c517f48dbf4d84e1f7364c5f22b01495d08617fdfc345ac3d8 | {postgres=X/postgres,service_role=X/postgres} |
| phase5_write_programplan_terms | plan_id uuid, expected_revision integer, distribution jsonb | 486350bcd616a9aa51ea1d448601f502d7c83d16ca926ca04a87c1cb4eee96ea | {postgres=X/postgres,service_role=X/postgres,skolplattform_worker=X/postgres} |

## Slutlig C-definition och verifiering

Foundation 154000 ersätter exakt sex inventerade definitioner med samma signatur och ACL: actor, event_actor, education dispatcher, block command, clone och audit. Övriga 64 befintliga fas5-definitioner bevaras. Administrator godtas i actor för scoped läsning; alla nio redan öppna skrivande Worker-entrypoints har kvar sitt egna skrivskydd. Paketval är det enda nya skrivundantaget.

Nio nya stängda funktioner ger språklista, trappor, strikt nivå-/språk-/fördelningsvalidering, upplösta poster, resultat, audit, relationsguard och två RPC. Ny tabell programplan_unit_packages har RLS, PK(plan_id,unit_id), cascade-FK till planen och FK till planens skolkoppling. Guard binder också plan/offering/organizer, så de två föräldrareferenserna inte kan peka åt olika håll. Ingen klient, Worker eller service_role har direkta tabellprivilegier eller helper-EXECUTE. Foundation bevarar exakt17Worker-entrypoints. Separat155000 ger bara read/writepaketval och den slutliga mängden blir19.

Skrivningen använder befintlig session/kund/skolor/utbildningsscope, därefter share-lås på plan och advisory-/radlås på (plan,skola), även för saknad CAS-rad. Paketrevision0 betyder ingen rad, och varje ändring ökar skolans revision en gång utan att röra planens helrad. Läsning ger samtliga explicit kopplade skolor inom planens redan kontrollerade huvudman. Ändring kräver eget aktuellt skolmandat. Utkast, fastställd och ersatt tillåts; arkiv nekar. Språkpaket kan sparas ofördelade eller med ramavvikelse, så analysen kan visa det; form, nivå, poängtak, trappa, katalogpin och blockets paketpoäng är hårda spärrar. Generic package-referenser öppnas först i D.

Dispatcher nekar borttag av skola med icke-tomt sparat paket, hint programplan_unit_packages_in_use. Blockkommandot nekar borttag/typ-/poängändring av block med paket, hint programplan_block_packages_in_use. Rensade skolvalsrevisioner kan tas bort när skolan tas bort. Clone är baserad på faktisk152100-definition och bevarar dess källkontext och retired-ID-skydd. Alla skolrader kopieras exakt med revision1; copiedPackageUnits anger antalet i reply och DB-audit. Punktplanhistorikens aktör/session är serverbunden; paketändring och audit ligger i samma transaktion.

Bevis på lokalt, isolerat syntetiskt protected, genom yttre rollback, utan reset:

- RED: nya tabellen saknas,42P01 (/private/tmp/phase5-23-c/red.json).
- Ny C-fil:74/74pgTAP. Hela planraden inklusive revision/tidsstämplar bevarad; scoped HM/rektor/administrator, CAS, språk/trappa/poäng/extra form, fastställd/ersatt/arkiv, skol-/blockberoenden, källclone/skolrevision1, fullrad/historikrollback vid auditfel och riktig Workerroll med exakt två lokala grants.
- Alla13programplansfiler:986/986pgTAP; /private/tmp/phase5-23-c/green-all.json och phase5-23-c-green-all-guard-final.log. Första rött bevarat i phase5-23-c-green-all-first.log. D18-adminläsningar och cloneauditantal är uttryckligen anpassade. Äldre8-/10-/16entryprofiler återkallar B-/Cgrants bara inom sina rollbackfixturer, medan C-filen prövar exakta17→19.
- Två historiska timplansfiler:86/86pgTAP genom samma154000 i rollback. Bara senare B-/Cgrants återkallas lokalt; inga timplansfunktioner ändrade. /private/tmp/phase5-23-c/green-timplan.json.
- SQL/TS-paritet:534/534vektorer,18trappor och alla möjliga startlägen vid100/200/300p, språk saknat/okänt/annan minoritet, gap, version, poäng och fördelningsfel. Språklistans42poster och trappornas18definitioner är exakt samma som TS. /private/tmp/phase5-23-c/parity.json. Första metadatajämförelsen använde felaktigt stringify-keyorder; slutlig deepEqual är PASS och rå förstakörning behålls.
- Bevarande: samtliga10hela verksamhetstabeller inklusive shape_upgrades är oförändrade genom migrationen; alla gamla ACL bevarade, övriga definitioner oförändrade. Hela ursprungsschemat/ACL och10hashar återställda efter rollback. /private/tmp/phase5-23-c/preservation.json.

Inga permanenta migrationer, grants, journalposter, bygg-/serverändringar, commits eller pushar gjordes av SQL-executorn. Root utför tillämpning och verklig Worker-/browser-preflight. D/E och full05-23 är öppna.

- Fryst källa `20261004154000_phase5_programplan_unit_packages.sql`: SHA-256 `443a8e4a3f56872491cb13b29cad88e12765d47dac71f536bbcf8cd299483541`.

- Fryst källa `20261004155000_phase5_worker_programplan_unit_packages.sql`: SHA-256 `fb873b7f1041dd8c2598c7c135a36f19da9b12b1256837289b33dc610d5a19f2`.
