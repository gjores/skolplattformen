-- pgTAP-prov av fas 2:s worker-roll, kärntabeller och RLS-kontext.
-- All provdata och alla tillfälliga uppdateringar rullas tillbaka sist.

begin;
create extension if not exists pgtap with schema extensions;
select plan(40);

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
select is((select count(*) from public.app_sessions), 1::bigint, 'kundadmin ser endast vald kunds sessioner');
select results_eq(
  $$update public.app_sessions
       set revoked_at = now()
     where membership_id = '40000000-0000-4000-8000-000000000001'
    returning 1$$,
  array[1],
  'kundadmin kan återkalla en session i vald kund'
);
select results_eq(
  $$update public.app_sessions
       set revoked_at = now()
     where membership_id = '40000000-0000-4000-8000-000000000005'
    returning 1$$,
  array[]::integer[],
  'kundadmin kan inte återkalla en session i kund B'
);
reset role;
select is(
  (select revoked_at is null from public.app_sessions where membership_id = '40000000-0000-4000-8000-000000000005'),
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

select * from finish();
rollback;
