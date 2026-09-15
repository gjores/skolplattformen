-- pgTAP-prov av fas 2:s oföränderliga säkerhetslogg och serverstyrda aktörsfält.
-- Alla provskrivningar rullas tillbaka.

begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

create temporary table audit_test_ids (id bigint primary key);
with created as (
  insert into public.security_events (
    correlation_id, source, action, outcome, customer_id
  ) values (
    gen_random_uuid(), 'db', 'prov', 'ok',
    '20000000-0000-4000-8000-0000000000a1'
  ) returning id
)
insert into audit_test_ids select id from created;

insert into public.security_events (
  correlation_id, source, action, outcome, customer_id
) values (
  gen_random_uuid(), 'db', 'prov_b', 'ok',
  '20000000-0000-4000-8000-0000000000a2'
);

insert into public.offerings (
  id, organizer_id, unit_id, kind, name, program_code, cohort, status
) values (
  '70000000-0000-4000-8000-000000000201',
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000101',
  'gymnasium', 'Auditprogram', 'SA25', 'Auditkull', 'aktiv'
);
insert into public.point_plans (
  id, organizer_id, offering_id, version, status
) values (
  '70000000-0000-4000-8000-000000000301',
  '60000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000201', 1, 'utkast'
);

select throws_like(
  $$update public.security_events set action = 'x'
    where id = (select id from audit_test_ids limit 1)$$,
  '%oföränderlig%',
  'UPDATE stoppas av trigger även för ägaren'
);
select throws_like(
  $$delete from public.security_events
    where id = (select id from audit_test_ids limit 1)$$,
  '%oföränderlig%',
  'DELETE stoppas av trigger även för ägaren'
);
select is(has_table_privilege('skolplattform_worker', 'public.security_events', 'UPDATE'), false, 'Worker saknar UPDATE-grant');
select is(has_table_privilege('skolplattform_worker', 'public.security_events', 'DELETE'), false, 'Worker saknar DELETE-grant');

set local role skolplattform_worker;
select throws_ok(
  $$update public.security_events set action = 'x'$$,
  '42501', null, 'Worker saknar UPDATE på säkerhetsloggen'
);
select throws_ok(
  $$delete from public.security_events$$,
  '42501', null, 'Worker saknar DELETE på säkerhetsloggen'
);
select lives_ok(
  $$insert into public.security_events (correlation_id, source, action, outcome, customer_id)
    values (gen_random_uuid(), 'worker', 'prov_worker', 'denied', '20000000-0000-4000-8000-0000000000a1')$$,
  'Worker kan lägga till säkerhetshändelse'
);

select set_config('app.customer_id', '20000000-0000-4000-8000-0000000000a1', true);
select set_config('app.access_function', 'granskare', true);
select is(
  (select count(*) from public.security_events where customer_id = '20000000-0000-4000-8000-0000000000a2'),
  0::bigint,
  'granskaren ser inte kund B'
);
select ok(
  (select count(*) from public.security_events where customer_id = '20000000-0000-4000-8000-0000000000a1') >= 2,
  'granskaren ser kund A'
);
select set_config('app.access_function', 'kundadmin', true);
select is((select count(*) from public.security_events), 0::bigint, 'utan granskarfunktion syns inga loggrader');

select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000a02","role":"authenticated"}', true);
select set_config('app.app_role', 'huvudman', true);
select set_config('app.organizer_id', '60000000-0000-4000-8000-000000000001', true);
insert into public.organisation_events (
  organizer_id, actor, actor_role, action
) values (
  '60000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000', 'larare', 'Audit organisation'
);
reset role;
select is(
  (select actor::text from public.organisation_events where action = 'Audit organisation'),
  '10000000-0000-4000-8000-000000000a02',
  'actor sätts av triggern, inte av klientvärdet'
);
select is(
  (select actor_role::text from public.organisation_events where action = 'Audit organisation'),
  'huvudman',
  'actor_role skrivs över med serverrollen'
);

set local role skolplattform_worker;
select set_config('app.app_role', '', true);
select throws_like(
  $$insert into public.organisation_events (organizer_id, actor, actor_role, action)
    values ('60000000-0000-4000-8000-000000000001', '00000000-0000-0000-0000-000000000000', 'larare', 'Saknar kontext')$$,
  '%serverkontext%',
  'händelse utan serverkontext nekas'
);
select set_config('app.app_role', 'huvudman', true);
insert into public.point_plan_events (
  point_plan_id, actor, actor_role, action
) values (
  '70000000-0000-4000-8000-000000000301',
  '00000000-0000-0000-0000-000000000000', 'larare', 'Audit poängplan'
);
reset role;
select is(
  (select actor::text from public.point_plan_events where action = 'Audit poängplan'),
  '10000000-0000-4000-8000-000000000a02',
  'poängplanshändelsens actor sätts ur serverkontexten'
);
select is(
  (select actor_role::text from public.point_plan_events where action = 'Audit poängplan'),
  'huvudman',
  'poängplanshändelsens roll skrivs över'
);

set local role skolplattform_worker;
select lives_ok(
  $$insert into public.denial_buckets (bucket_start, key, count)
    values (date_trunc('minute', now()), 'prov', 1)
    on conflict (bucket_start, key) do update set count = public.denial_buckets.count + 1$$,
  'första nekandet kan aggregeras'
);
select lives_ok(
  $$insert into public.denial_buckets (bucket_start, key, count)
    values (date_trunc('minute', now()), 'prov', 1)
    on conflict (bucket_start, key) do update set count = public.denial_buckets.count + 1$$,
  'andra nekandet kan aggregeras'
);
select is(
  (select count from public.denial_buckets where key = 'prov'),
  2,
  'andra aggregeringen ger count 2'
);
reset role;

select is(
  (select count(*) from public.security_events where action = 'prov_worker'),
  1::bigint,
  'Worker-händelsen skrevs exakt en gång'
);

select * from finish();
rollback;
