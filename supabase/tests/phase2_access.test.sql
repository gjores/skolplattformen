-- pgTAP-prov av fas 2:s worker-roll, kärntabeller och RLS-kontext.
-- All provdata och alla tillfälliga uppdateringar rullas tillbaka sist.

begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- ---------------------------------------------------------------------------
-- A. Rollen och dess effektiva rättigheter
-- ---------------------------------------------------------------------------
select is((select rolcanlogin from pg_roles where rolname = 'skolplattform_worker'), true, 'worker kan logga in');
select is((select rolbypassrls from pg_roles where rolname = 'skolplattform_worker'), false, 'worker saknar BYPASSRLS');
select is((select rolsuper from pg_roles where rolname = 'skolplattform_worker'), false, 'worker är inte superuser');

select is(has_table_privilege('skolplattform_worker', 'public.customers', 'DELETE'), false, 'worker saknar DELETE på customers');
select is(has_table_privilege('skolplattform_worker', 'public.customers', 'SELECT'), true, 'worker har SELECT på customers');
select is(has_table_privilege('skolplattform_worker', 'public.identities', 'DELETE'), false, 'worker saknar DELETE på identities');
select is(has_table_privilege('skolplattform_worker', 'public.identities', 'SELECT'), true, 'worker har SELECT på identities');
select is(has_table_privilege('skolplattform_worker', 'public.memberships', 'DELETE'), false, 'worker saknar DELETE på memberships');
select is(has_table_privilege('skolplattform_worker', 'public.memberships', 'SELECT'), true, 'worker har SELECT på memberships');
select is(has_table_privilege('skolplattform_worker', 'public.app_sessions', 'DELETE'), false, 'worker saknar DELETE på app_sessions');
select is(has_table_privilege('skolplattform_worker', 'public.app_sessions', 'SELECT'), true, 'worker har SELECT på app_sessions');

select is(has_table_privilege('anon', 'public.memberships', 'SELECT'), false, 'anon saknar SELECT på memberships');
select is(has_table_privilege('anon', 'public.app_sessions', 'SELECT'), false, 'anon saknar SELECT på app_sessions');
select is(has_table_privilege('authenticated', 'public.memberships', 'SELECT'), false, 'authenticated saknar SELECT på memberships');
select is(has_table_privilege('authenticated', 'public.app_sessions', 'SELECT'), false, 'authenticated saknar SELECT på app_sessions');
select is(has_schema_privilege('anon', 'public', 'USAGE'), false, 'fas 1-karantänen för public består');

-- ---------------------------------------------------------------------------
-- B. Kundisolering och serverstyrda specialfaser som worker
-- ---------------------------------------------------------------------------
set local role skolplattform_worker;
select set_config('app.phase', '', true);
select set_config('app.access_function', '', true);
select set_config('app.identity_id', '30000000-0000-4000-8000-000000000001', true);
select set_config('app.customer_id', '20000000-0000-4000-8000-0000000000a1', true);

select is(
  (select count(*) from public.memberships where customer_id = '20000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'RLS döljer kund B:s medlemskap'
);
select is(
  (select count(*) from public.memberships where customer_id = '20000000-0000-4000-8000-0000000000a1'),
  7::bigint,
  'kund A:s sju medlemskap syns'
);
select is((select count(*) from public.customers), 1::bigint, 'bara den valda kunden syns');
select is(
  (select count(*) from public.identities where id <> '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'andra identiteter döljs utan administrativ funktion'
);

select results_eq(
  $$update public.memberships
       set status = 'blocked', blocked_at = now()
     where id = '40000000-0000-4000-8000-000000000005'
    returning 1$$,
  array[]::integer[],
  'update mot kund B påverkar ingen rad'
);
reset role;
select is(
  (select status::text from public.memberships where id = '40000000-0000-4000-8000-000000000005'),
  'active',
  'kund B:s rad är oförändrad'
);

set local role skolplattform_worker;
select set_config('app.customer_id', '', true);
select set_config('app.identity_id', '30000000-0000-4000-8000-000000000009', true);
select is((select count(*) from public.memberships), 2::bigint, 'egna medlemskap i båda kunderna syns före kontextval');
select is((select count(*) from public.customers), 2::bigint, 'båda egna kunderna syns före kontextval');

select set_config('app.identity_id', '', true);
select set_config('app.phase', 'login', true);
select lives_ok(
  $$insert into public.identities (issuer, subject) values ('http://host.docker.internal:8180/realms/skolplattform-test', 'prov-ny')$$,
  'inloggningsfasen får skapa en identitet'
);
select set_config('app.phase', '', true);
select throws_ok(
  $$insert into public.identities (issuer, subject) values ('http://host.docker.internal:8180/realms/skolplattform-test', 'prov-utan-fas')$$,
  '42501',
  null,
  'utan fas och identitet nekas insert'
);

select set_config('app.phase', 'login', true);
select lives_ok(
  $$insert into public.app_sessions (token_hash, identity_id, membership_id, expires_at, absolute_expires_at) values
      (extensions.digest('prov-a', 'sha256'), '30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', now() + interval '15 minutes', now() + interval '8 hours'),
      (extensions.digest('prov-b', 'sha256'), '30000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', now() + interval '15 minutes', now() + interval '8 hours')$$,
  'inloggningsfasen får skapa serverlagrade sessioner'
);
select set_config('app.phase', '', true);
select set_config('app.identity_id', '30000000-0000-4000-8000-000000000002', true);
select set_config('app.customer_id', '20000000-0000-4000-8000-0000000000a1', true);
select set_config('app.access_function', '', true);
select is(
  (select count(*) from public.app_sessions where identity_id = '30000000-0000-4000-8000-000000000001'),
  0::bigint,
  'annan identitets session döljs utan administrativ funktion'
);

-- En serververifierad kundadmin/granskare kan läsa kundens personer. En annan
-- funktion kan fortsatt bara läsa den egna identiteten.
select set_config('app.identity_id', '30000000-0000-4000-8000-000000000001', true);
select set_config('app.access_function', 'kundadmin', true);
select is((select count(*) from public.identities), 7::bigint, 'kundadmin ser identiteter med medlemskap i vald kund');
select set_config('app.access_function', 'granskare', true);
select is((select count(*) from public.identities), 7::bigint, 'granskare ser identiteter med medlemskap i vald kund');
select set_config('app.access_function', 'huvudman', true);
select is((select count(*) from public.identities), 1::bigint, 'annan funktion ser bara den egna identiteten');

-- Kundadmin får läsa och återkalla sessioner i vald kund, men inte i kund B.
select set_config('app.access_function', 'kundadmin', true);
select is(
  (select count(*) from public.app_sessions
    where token_hash in (extensions.digest('prov-a', 'sha256'), extensions.digest('prov-b', 'sha256'))),
  1::bigint,
  'kundadmin ser kund A:s provsession men inte kund B:s'
);
select results_eq(
  $$update public.app_sessions
       set revoked_at = now()
     where token_hash = extensions.digest('prov-a', 'sha256')
    returning 1$$,
  array[1],
  'kundadmin kan återkalla en session i vald kund'
);
select results_eq(
  $$update public.app_sessions
       set revoked_at = now()
     where token_hash = extensions.digest('prov-b', 'sha256')
    returning 1$$,
  array[]::integer[],
  'kundadmin kan inte återkalla en session i kund B'
);
reset role;
select is(
  (select revoked_at is null from public.app_sessions where token_hash = extensions.digest('prov-b', 'sha256')),
  true,
  'kund B:s session är oförändrad'
);

-- ---------------------------------------------------------------------------
-- C. Kontexthjälpare
-- ---------------------------------------------------------------------------
select set_config('app.fake_today', '', true);
select is(public.app_today(), (now() at time zone 'Europe/Stockholm')::date, 'app_today följer svensk kalenderdag');
select set_config('app.fake_today', '2030-01-01', true);
select is(public.app_today(), '2030-01-01'::date, 'app.fake_today styr app_today i prov');
select set_config('app.identity_id', '', true);
select is(public.current_identity_id(), null::uuid, 'tom GUC ger NULL');

-- ---------------------------------------------------------------------------
-- D. Fas 1:s befintliga rader är kvar
-- ---------------------------------------------------------------------------
select is(
  (select count(*) from public.profiles where id = '10000000-0000-4000-8000-000000000a01'),
  1::bigint,
  'fas 1:s gamla HM-profil finns kvar'
);
select is(
  (select count(*) from public.organizers where id = '00000000-0000-4000-8000-000000000001'),
  1::bigint,
  'demohuvudmannen finns kvar som rad'
);

-- ---------------------------------------------------------------------------
-- E. Uppdragsgiltighet på svensk kalenderdag
-- ---------------------------------------------------------------------------
select set_config('app.fake_today', to_char(current_date, 'YYYY-MM-DD'), true);
select is(
  (select count(*) from public.access_assignments a
    where a.membership_id = '40000000-0000-4000-8000-000000000007'
      and public.assignment_is_valid(a)),
  1::bigint,
  'frida har exakt ett giltigt uppdrag idag'
);
select set_config('app.fake_today', to_char(current_date + 31, 'YYYY-MM-DD'), true);
select is(
  (select count(*) from public.access_assignments a
    where a.membership_id = '40000000-0000-4000-8000-000000000007'
      and public.assignment_is_valid(a)),
  1::bigint,
  'en klientliknande provklocka får inte aktivera kommande mandat'
);
select set_config('app.fake_today', to_char(current_date - 5, 'YYYY-MM-DD'), true);
select is(
  (select count(*) from public.access_assignments a
    where a.id = '50000000-0000-4000-8000-000000000027'
      and public.assignment_is_valid(a)),
  0::bigint,
  'ett avslutat uppdrag blir aldrig giltigt igen'
);
select set_config('app.fake_today', '', true);

-- ---------------------------------------------------------------------------
-- F. Kundisolering i den utökade modellen som Worker
-- ---------------------------------------------------------------------------
set local role skolplattform_worker;
select set_config('app.identity_id', '30000000-0000-4000-8000-000000000001', true);
select set_config('app.customer_id', '20000000-0000-4000-8000-0000000000a1', true);
select set_config('app.organizer_id', '60000000-0000-4000-8000-000000000001', true);
select set_config('app.app_role', 'huvudman', true);
select set_config('app.access_function', 'huvudman', true);
select is((select count(*) from public.organizers), 1::bigint, 'bara kund A:s huvudman syns');
select is(
  (select count(*) from public.school_units where id = '10000000-0000-4000-8000-000000000101'),
  0::bigint,
  'Karantänskolan hos demokunden döljs'
);
select is(
  (select count(*) from public.access_assignments where customer_id = '20000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'kund B:s uppdrag döljs'
);
select is((select count(*) from public.invitations), 0::bigint, 'inga inbjudningar utanför kunden syns');
reset role;

-- ---------------------------------------------------------------------------
-- G. Registerproveniens per huvudman
-- ---------------------------------------------------------------------------
insert into public.registry_snapshots (unit_code, source_url, payload, organizer_id) values
  ('99999904', 'https://example.test/prov-a', '{}', '60000000-0000-4000-8000-000000000001'),
  ('99999999', 'https://example.test/demo', '{}', '00000000-0000-4000-8000-000000000001');

set local role skolplattform_worker;
select set_config('app.organizer_id', '60000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.registry_snapshots), 1::bigint, 'registry_snapshots läses bara inom egen huvudman (D-14)');
select set_config('app.organizer_id', '', true);
select is((select count(*) from public.registry_snapshots), 0::bigint, 'utan huvudmannakontext syns inga registry_snapshots');
reset role;

-- ---------------------------------------------------------------------------
-- H. Klientroller och Worker-funktioner
-- ---------------------------------------------------------------------------
select is(has_table_privilege('authenticated', 'public.access_assignments', 'SELECT'), false, 'authenticated saknar uppdragsåtkomst');
select is(has_table_privilege('anon', 'public.invitations', 'SELECT'), false, 'anon saknar inbjudningsåtkomst');
select is(has_table_privilege('authenticated', 'public.security_events', 'SELECT'), false, 'authenticated saknar loggåtkomst');
select is(has_function_privilege('authenticated', 'public.import_school_unit(jsonb, jsonb, uuid, text)', 'EXECUTE'), false, 'authenticated kan inte importera skola');
select is(has_function_privilege('skolplattform_worker', 'public.import_school_unit(jsonb, jsonb, uuid, text)', 'EXECUTE'), true, 'Worker får anropa serverns skolimport');

-- ---------------------------------------------------------------------------
-- I. Fas 1-funktion med serverstyrd GUC-aktör
-- ---------------------------------------------------------------------------
set local role skolplattform_worker;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000a02","role":"authenticated"}', true);
select set_config('app.app_role', 'huvudman', true);
select set_config('app.organizer_id', '60000000-0000-4000-8000-000000000001', true);
select set_config('app.customer_id', '20000000-0000-4000-8000-0000000000a1', true);
select throws_ok(
  $$select public.appoint_school_principal('60000000-0000-4000-8000-000000000101', null, 'Rektor Prov')$$,
  '42501',null,'äldre rektors-RPC nekas även med huvudman i GUC'
);
select lives_ok(
  $$insert into public.organisation_events(organizer_id,actor,actor_role,action) values ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000a02','huvudman','Syntetiskt aktörsprov')$$,
  'befintlig händelsetrigger använder serverkontext'
);
reset role;
select is(
  (select actor_role::text from public.organisation_events
    where organizer_id = '60000000-0000-4000-8000-000000000001'
    order by created_at desc limit 1),
  'huvudman',
  'händelsen fick rollen ur GUC'
);
select is(
  (select actor::text from public.organisation_events
    where organizer_id = '60000000-0000-4000-8000-000000000001'
    order by created_at desc limit 1),
  '10000000-0000-4000-8000-000000000a02',
  'händelsen fick aktören ur request.jwt.claims'
);
set local role skolplattform_worker;
select set_config('app.app_role', '', true);
select throws_like(
  $$select public.appoint_school_principal('60000000-0000-4000-8000-000000000101', null, 'Saknar kontext')$$,
  '%permission denied%',
  'utan serverroll nekas äldre funktionen också'
);
reset role;

-- ---------------------------------------------------------------------------
-- J. Relationsgränser, backfill och sekvensåtkomst
-- ---------------------------------------------------------------------------
select throws_ok(
  $$insert into public.access_assignments (membership_id, customer_id, function)
    values ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a2', 'kundadmin')$$,
  '23503', null, 'medlemskap kan inte korsas med annan kund'
);
select throws_ok(
  $$insert into public.access_assignments (membership_id, customer_id, organizer_id, function)
    values ('40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-0000000000a2', '60000000-0000-4000-8000-000000000001', 'huvudman')$$,
  '23503', null, 'huvudman kan inte korsas med annan kund'
);
select throws_ok(
  $$insert into public.access_assignments (membership_id, customer_id, organizer_id, unit_id, function)
    values ('40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', '60000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000101', 'rektor')$$,
  '23503', null, 'skolenhet kan inte korsas med annan huvudman'
);
select throws_ok(
  $$insert into public.app_sessions (token_hash, identity_id, membership_id, expires_at, absolute_expires_at)
    values (extensions.digest('fel-identitet', 'sha256'), '30000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000001', now() + interval '15 min', now() + interval '8 hours')$$,
  '23503', null, 'sessionens medlemskap måste höra till identiteten'
);
select throws_ok(
  $$insert into public.app_sessions (token_hash, identity_id, membership_id, assignment_id, expires_at, absolute_expires_at)
    values (extensions.digest('fel-uppdrag', 'sha256'), '30000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', '50000000-0000-4000-8000-000000000001', now() + interval '15 min', now() + interval '8 hours')$$,
  '23503', null, 'sessionens uppdrag måste höra till medlemskapet'
);
select is(
  (select count(distinct customer_id) from public.organizers
    where id in ('10000000-0000-4000-8000-000000000901', '10000000-0000-4000-8000-000000000902')),
  2::bigint,
  'namnlika huvudmän fick varsin kund i backfillen'
);
select is(
  (select organizer_id from public.registry_snapshots where id = '10000000-0000-4000-8000-000000000921'),
  null::uuid,
  'tvetydig registerproveniens lämnas okopplad och oåtkomlig'
);
set local role skolplattform_worker;
select set_config('app.customer_id', '20000000-0000-4000-8000-0000000000a1', true);
select set_config('app.access_function', 'granskare', true);
select lives_ok(
  $$insert into public.security_events (correlation_id, source, action, outcome, customer_id)
    values (gen_random_uuid(), 'worker', 'sekvensprov', 'ok', '20000000-0000-4000-8000-0000000000a1')$$,
  'Worker har sekvensåtkomst och kan skriva säkerhetshändelse'
);
reset role;

select * from finish();
rollback;
