begin;
create extension if not exists pgtap with schema extensions;
select no_plan();

-- Same exact source can move from a saved draft to a decision without
-- pretending that a different program version or changed content is identical.
select is(
 public.phase5_plan_decision_source_content('{"planId":"same","revision":1,"status":"utkast","educationRevision":2,"archived":false,"catalogId":"pin","rows":[{"key":"one","points":100}],"distribution":[{"rowKey":"one","points":[100,0,0,0,0,0]}]}'::jsonb),
 public.phase5_plan_decision_source_content('{"planId":"same","revision":2,"status":"faststalld","educationRevision":3,"archived":false,"catalogId":"pin","rows":[{"key":"one","points":100}],"distribution":[{"rowKey":"one","points":[100,0,0,0,0,0]}]}'::jsonb),
 'An unchanged source remains identical when it is approved');
select isnt(
 public.phase5_plan_decision_source_content('{"planId":"one","rows":[{"key":"one","points":100}]}'::jsonb),
 public.phase5_plan_decision_source_content('{"planId":"two","rows":[{"key":"one","points":100}]}'::jsonb),
 'Another source plan is never adopted implicitly');
select isnt(
 public.phase5_plan_decision_source_content('{"planId":"one","distribution":[{"rowKey":"one","points":[100,0,0,0,0,0]}]}'::jsonb),
 public.phase5_plan_decision_source_content('{"planId":"one","distribution":[{"rowKey":"one","points":[0,100,0,0,0,0]}]}'::jsonb),
 'Changed term distribution requires explicit source handling');
select isnt(
 public.phase5_plan_decision_source_content('{"planId":"one","catalogId":"original"}'::jsonb),
 public.phase5_plan_decision_source_content('{"planId":"one","catalogId":"new"}'::jsonb),
 'Changing the frozen catalog is a content change');

select ok(not exists(
 select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.pronamespace='public'::regnamespace and p.proname like 'phase5_plan_decision_%'
 and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'))
 and a.privilege_type='EXECUTE'), 'All decision RPCs and helpers deny public and browser roles');
select ok(not exists(
 select 1 from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_plan_decision_%'
 and p.proname not in ('phase5_plan_decision_basis','phase5_plan_decision_command','phase5_plan_decision_inbox')
 and has_function_privilege('skolplattform_worker',p.oid,'EXECUTE')), 'Worker cannot call private helpers or forge a write permit');
select ok(not exists(
 select 1 from unnest(array['plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits']) t
 where has_table_privilege('skolplattform_worker','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE')),
 'Worker has no direct decision-state, history, receipt or permit DML');
select ok(not exists(select 1 from public.plan_decision_write_permits), 'No command leaves a persisted write permit');
select ok(exists(select 1 from pg_trigger where tgrelid='public.point_plans'::regclass and tgname='point_plans_decision_delete_guard' and tgenabled='O'), 'A submitted source cannot be deleted through another path');
select ok(exists(select 1 from pg_trigger where tgrelid='public.offerings'::regclass and tgname='offerings_decision_guard' and tgenabled='O'), 'Submission locks education identity as well as plan cells');
select ok(exists(select 1 from pg_trigger where tgrelid='public.offering_units'::regclass and tgname='offering_units_decision_guard' and tgenabled='O'), 'Submission locks the reviewed shared-school scope');
select * from finish();
rollback;
