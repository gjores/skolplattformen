-- pgTAP-prov av fas 1-karantänen (BASE-02, D-09).
--
-- Körs med `supabase --workdir <protected> test db --local` mot det skyddade
-- lokala målet (work/pilot/prepare-local.mjs --target protected) efter
-- migrationen 20260911120000_quarantine_demo_access.sql och fixturerna i
-- work/pilot/sql/protected-fixtures.sql. Provet läser effektiva rättigheter
-- (has_*_privilege), inte SQL-text, och kör dessutom faktiska satser som
-- authenticated (den gamla anonyma identiteten) och anon. Allt rullas tillbaka.

begin;
create extension if not exists pgtap with schema extensions;
select plan(52);

-- ---------------------------------------------------------------------------
-- A. Schema public
-- ---------------------------------------------------------------------------
select is(has_schema_privilege('anon', 'public', 'USAGE'), false, 'anon saknar USAGE på public');
select is(has_schema_privilege('authenticated', 'public', 'USAGE'), false, 'authenticated saknar USAGE på public');
select is(has_schema_privilege('service_role', 'public', 'USAGE'), true, 'service_role behåller USAGE');
select alike(obj_description('public'::regnamespace, 'pg_namespace'), 'fas1-karantan:%', 'karantänmarkören är satt på schemat');

-- ---------------------------------------------------------------------------
-- B. Alla tabeller och vyer i public: ingen SELECT/INSERT/UPDATE/DELETE
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(bool_or(has_table_privilege(r, c.oid, p)), false)
     from pg_class c
     join pg_namespace n on n.oid = c.relnamespace,
          unnest(array['anon', 'authenticated']) r,
          unnest(array['SELECT', 'INSERT', 'UPDATE', 'DELETE']) p
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'p')),
  false, 'inga tabellrättigheter för klientroller');
select is(
  (select count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p'))::int >= 21,
  true, 'tabellerna finns kvar (inget raderat)');
select is(has_table_privilege('authenticated', 'public.profiles', 'SELECT'), false, 'profiles stängd för authenticated');
select is(has_table_privilege('authenticated', 'public.registry_snapshots', 'SELECT'), false, 'registry_snapshots stängd för authenticated');
select is(has_table_privilege('authenticated', 'public.registry_snapshots', 'INSERT'), false, 'registry_snapshots ej skrivbar för authenticated');
select is(has_table_privilege('anon', 'public.school_units', 'SELECT'), false, 'school_units stängd för anon');

-- ---------------------------------------------------------------------------
-- C. Sekvenser
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(bool_or(has_sequence_privilege(r, c.oid, 'USAGE')), false)
     from pg_class c join pg_namespace n on n.oid = c.relnamespace,
          unnest(array['anon', 'authenticated']) r
    where n.nspname = 'public' and c.relkind = 'S'),
  false, 'inga sekvensrättigheter för klientroller');

-- ---------------------------------------------------------------------------
-- D. Kända farliga funktioner, uttryckligt per roll
-- ---------------------------------------------------------------------------
select is(has_function_privilege('authenticated', 'public.bootstrap_demo_profile(text)', 'EXECUTE'), false, 'bootstrap_demo_profile stängd för authenticated');
select is(has_function_privilege('anon', 'public.bootstrap_demo_profile(text)', 'EXECUTE'), false, 'bootstrap_demo_profile stängd för anon');
select is(has_function_privilege('authenticated', 'public.copy_offering_cohort(uuid, integer)', 'EXECUTE'), false, 'copy_offering_cohort stängd för authenticated');
select is(has_function_privilege('anon', 'public.copy_offering_cohort(uuid, integer)', 'EXECUTE'), false, 'copy_offering_cohort stängd för anon');
select is(has_function_privilege('authenticated', 'public.appoint_school_principal(uuid, uuid, text)', 'EXECUTE'), false, 'appoint_school_principal stängd för authenticated');
select is(has_function_privilege('anon', 'public.appoint_school_principal(uuid, uuid, text)', 'EXECUTE'), false, 'appoint_school_principal stängd för anon');
select is(has_function_privilege('authenticated', 'public.import_school_unit(jsonb, jsonb, uuid, text)', 'EXECUTE'), false, 'import_school_unit stängd för authenticated');
select is(has_function_privilege('anon', 'public.import_school_unit(jsonb, jsonb, uuid, text)', 'EXECUTE'), false, 'import_school_unit stängd för anon');
select is(has_function_privilege('authenticated', 'public.current_organizer_id()', 'EXECUTE'), false, 'current_organizer_id stängd för authenticated');
select is(has_function_privilege('anon', 'public.current_organizer_id()', 'EXECUTE'), false, 'current_organizer_id stängd för anon');
select is(has_function_privilege('authenticated', 'public.current_app_role()', 'EXECUTE'), false, 'current_app_role stängd för authenticated');
select is(has_function_privilege('anon', 'public.current_app_role()', 'EXECUTE'), false, 'current_app_role stängd för anon');
select is(
  (select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname in ('bootstrap_demo_profile', 'copy_offering_cohort', 'appoint_school_principal', 'import_school_unit', 'current_organizer_id', 'current_app_role'))::int,
  6, 'funktionerna finns kvar (inget raderat)');

-- ---------------------------------------------------------------------------
-- E. Alla funktioner i public
-- ---------------------------------------------------------------------------
select is(
  (select coalesce(bool_or(has_function_privilege(r, p.oid, 'EXECUTE')), false)
     from pg_proc p join pg_namespace n on n.oid = p.pronamespace,
          unnest(array['anon', 'authenticated']) r
    where n.nspname = 'public'),
  false, 'ingen EXECUTE i public för klientroller');

-- ---------------------------------------------------------------------------
-- F. Framtida objekt (skapas som postgres i transaktionen, rullas tillbaka)
-- ---------------------------------------------------------------------------
create table public.__fas1_prov (id int);
create sequence public.__fas1_seq;
create function public.__fas1_fn() returns int language sql as 'select 1';
select is(has_table_privilege('authenticated', 'public.__fas1_prov', 'SELECT'), false, 'ny tabell nekas för authenticated (SELECT)');
select is(has_table_privilege('authenticated', 'public.__fas1_prov', 'INSERT'), false, 'ny tabell nekas för authenticated (INSERT)');
select is(has_table_privilege('anon', 'public.__fas1_prov', 'SELECT'), false, 'ny tabell nekas för anon (SELECT)');
select is(has_table_privilege('anon', 'public.__fas1_prov', 'INSERT'), false, 'ny tabell nekas för anon (INSERT)');
select is(has_sequence_privilege('authenticated', 'public.__fas1_seq', 'USAGE'), false, 'ny sekvens nekas för authenticated');
select is(has_sequence_privilege('anon', 'public.__fas1_seq', 'USAGE'), false, 'ny sekvens nekas för anon');
select is(has_function_privilege('authenticated', 'public.__fas1_fn()', 'EXECUTE'), false, 'ny funktion nekas för authenticated');
select is(has_function_privilege('anon', 'public.__fas1_fn()', 'EXECUTE'), false, 'ny funktion nekas för anon');

-- ---------------------------------------------------------------------------
-- G. Storage
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from pg_policies where schemaname = 'storage' and tablename = 'objects' and policyname like 'tillstand_%')::int,
  0, 'inga tillstand-policyer kvar');
select is((select public from storage.buckets where id = 'tillstand'), false, 'bucket tillstand privat');
select is(
  (select count(*) from storage.objects where bucket_id = 'tillstand' and name = '00000000-0000-4000-8000-000000000001/karantan-prov.txt')::int,
  1, 'fil bevarad');

-- ---------------------------------------------------------------------------
-- H. Bevarade rader och tidigare anonym profil
-- ---------------------------------------------------------------------------
select is((select count(*) from public.profiles where id = '10000000-0000-4000-8000-000000000a01' and role = 'huvudman')::int, 1, 'gammal anonym HM-profil finns kvar');
select is((select count(*) from public.organizers where id = '00000000-0000-4000-8000-000000000001')::int, 1, 'demohuvudman finns kvar');
select is((select count(*) from auth.users where id in ('10000000-0000-4000-8000-000000000a01', '10000000-0000-4000-8000-000000000a02'))::int, 2, 'båda providentiteterna finns kvar i auth.users');
select is((select count(*) from public.school_units where id = '10000000-0000-4000-8000-000000000101')::int, 1, 'Karantänskolan finns kvar');

-- ---------------------------------------------------------------------------
-- I. Faktisk körning som authenticated med den gamla anonyma identiteten.
-- pgTAP:s egna funktioner ligger i schemat extensions; migrationens globala
-- "alter default privileges … revoke execute on functions from public" kan
-- göra throws_ok/is oanropbara för klientrollerna. Ge därför tillfälliga
-- rättigheter INOM testtransaktionen (rullas tillbaka av rollback nedan);
-- de bevisar inget om appens schema public.
-- ---------------------------------------------------------------------------
grant usage on schema extensions to anon, authenticated;
grant execute on all functions in schema extensions to anon, authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000a01","role":"authenticated","is_anonymous":true}', true);
select is(current_user, 'authenticated', 'kör som authenticated');
select throws_ok('select * from public.profiles', '42501', null, 'profiles nekas som authenticated');
select throws_ok('select public.current_organizer_id()', '42501', null, 'current_organizer_id nekas som authenticated');
select throws_ok($$select public.bootstrap_demo_profile('x')$$, '42501', null, 'bootstrap nekas som authenticated');
select throws_ok($$select public.copy_offering_cohort('10000000-0000-4000-8000-000000000201'::uuid, 2027)$$, '42501', null, 'kullkopiering nekas som authenticated');
select throws_ok($$insert into public.school_units (organizer_id, code, name, municipality_code) values ('00000000-0000-4000-8000-000000000001', '99999998', 'x', '0000')$$, '42501', null, 'insert i school_units nekas som authenticated');
select throws_ok('select * from public.registry_snapshots', '42501', null, 'registry_snapshots nekas som authenticated');
reset role;

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select is(current_user, 'anon', 'kör som anon');
select throws_ok('select * from public.school_units', '42501', null, 'school_units nekas som anon');
select throws_ok($$select public.bootstrap_demo_profile('x')$$, '42501', null, 'bootstrap nekas som anon');
reset role;

-- Ingen dold skrivning: fixturraderna är oförändrade i antal efter proven.
select is((select count(*) from public.school_units where code in ('99999998', '99999999'))::int, 1, 'inga nya skolenheter efter nekade prov');
select is((select count(*) from public.profiles)::int, 1, 'inga nya profiler efter nekade prov');

select * from finish();
rollback;
