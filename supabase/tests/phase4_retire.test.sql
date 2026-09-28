begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
-- 04-17: elevprovet är avvecklat. Registret är enda elevdatakällan; fas 3:s
-- ärenden, mandatkedjans scopefunktioner och historiska händelser finns kvar.
-- Endast assertTarget(protected); allt återställs med rollback.

-- Gamla elevdatakällan finns inte längre, varken som tabell eller läsfunktion.
select is(to_regclass('public.phase3_probe_pupils'),null,'retired: phase3_probe_pupils finns inte');
select is(to_regclass('public.phase3_probe_groups'),null,'retired: phase3_probe_groups finns inte');
select is(to_regclass('public.phase3_probe_group_members'),null,'retired: phase3_probe_group_members finns inte');
select is(to_regprocedure('public.phase3_read_pupils(uuid,uuid,boolean)'),null,'retired: phase3_read_pupils finns inte');
select is((select count(*) from pg_proc where proname='phase3_read_pupils'),0::bigint,'retired: ingen överlagrad phase3_read_pupils finns kvar');
select is((select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace
  where n.nspname not in ('pg_catalog','information_schema')
    and p.prosrc ~ 'phase3_probe_(pupils|groups|group_members)|phase3_read_pupils'),0::bigint,
  'retired: ingen funktionskälla läser elevprovet');
select is((select count(*) from pg_views where definition ~ 'phase3_probe_(pupils|groups|group_members)'),0::bigint,'retired: ingen vy läser elevprovet');
select is((select count(*) from pg_policies where coalesce(qual,'')||coalesce(with_check,'') ~ 'phase3_probe_(pupils|groups|group_members)|phase3_read_pupils'),0::bigint,'retired: ingen policy läser elevprovet');
select is((select count(*) from pg_proc p where p.proname like 'phase3_read%'
  and (has_function_privilege('skolplattform_worker',p.oid,'EXECUTE') or has_function_privilege('authenticated',p.oid,'EXECUTE') or has_function_privilege('anon',p.oid,'EXECUTE'))),0::bigint,
  'retired: ingen phase3_read-funktion är körbar för Worker eller klientroller');

-- Faktisk Worker (har schemaåtkomst) når inte gamla vägen: objektet saknas, inte bara nekat.
-- Klientroller saknar redan schemaåtkomst (42501 före namnuppslag) och täcks av to_regclass ovan.
set local role skolplattform_worker;
select throws_ok($t$select * from public.phase3_read_pupils()$t$,'42883',null,'retired: Worker kan inte anropa gamla elevläsaren');
select throws_ok($t$select * from public.phase3_probe_pupils$t$,'42P01',null,'retired: Worker kan inte läsa gamla elevtabellen');
select throws_ok($t$select * from public.phase3_probe_group_members$t$,'42P01',null,'retired: Worker kan inte läsa gamla gruppmedlemskap');
reset role;

-- Mandat- och ärende-FK är hela och pekar på registret.
select ok(exists(select 1 from pg_constraint where conrelid='public.mandate_pupils'::regclass and contype='f' and confrelid='public.pupils'::regclass),'kept: elevmandat pekar på registrets elev');
select ok(exists(select 1 from pg_constraint where conrelid='public.mandate_groups'::regclass and contype='f' and confrelid='public.school_classes'::regclass),'kept: gruppmandat pekar på registrets klass');
select ok(exists(select 1 from pg_constraint where conrelid='public.mandate_cases'::regclass and contype='f' and confrelid='public.phase3_probe_cases'::regclass),'kept: ärendemandat pekar på fas 3-ärendet');
select ok(exists(select 1 from pg_constraint where conrelid='public.phase3_probe_cases'::regclass and contype='f' and confrelid='public.pupils'::regclass),'kept: fas 3-ärendet pekar på registrets elev');
select is((select count(*) from pg_constraint where contype='f' and confrelid::regclass::text ~ 'phase3_probe_(pupils|groups|group_members)'),0::bigint,'kept: ingen FK pekar på avvecklade tabeller');
select ok(exists(select 1 from pg_trigger where tgrelid='public.phase3_probe_cases'::regclass and tgname='phase4_case_school_scope' and not tgisinternal),'kept: ärendets skolscope-trigger finns kvar');
select is(has_table_privilege('skolplattform_worker','public.phase3_probe_cases','SELECT'),false,'kept: ärendetabellen förblir stängd för Worker');

-- Mandatkedjans gamla scopenamn lever kvar men läser bara registret.
select ok(to_regprocedure('public.phase3_probe_scope()') is not null,'kept: phase3_probe_scope finns för registrets urval');
select ok(has_function_privilege('skolplattform_worker','public.phase3_probe_scope()','EXECUTE'),'kept: phase3_probe_scope körbar för Worker');
select ok((select prosrc ~ 'school_classes' and prosrc !~ 'phase3_probe_(pupils|groups|group_members)' from pg_proc where oid='public.phase3_probe_scope()'::regprocedure),'kept: phase3_probe_scope läser registrets klasser');
select ok((select prosrc ~ 'pupil_placements' and prosrc !~ 'phase3_probe_' from pg_proc where oid='public.phase3_pupil_in_scope(uuid,uuid,uuid)'::regprocedure),'kept: phase3_pupil_in_scope läser registrets placeringar');
select is(has_function_privilege('skolplattform_worker','public.phase3_pupil_in_scope(uuid,uuid,uuid)','EXECUTE'),false,'kept: phase3_pupil_in_scope är ingen Worker-RPC');
select is(has_function_privilege('authenticated','public.phase3_pupil_in_scope(uuid,uuid,uuid)','EXECUTE'),false,'kept: phase3_pupil_in_scope är ingen klient-RPC');

-- Historiska händelser med gamla objekttyper kan fortfarande lagras och läsas.
insert into public.customers(id,name) values ('44017000-0000-4000-8000-000000000001','Syntetisk avvecklingskund');
insert into public.security_events(correlation_id,customer_id,source,action,outcome,object_type,object_id,occurred_at)
values(gen_random_uuid(),'44017000-0000-4000-8000-000000000001','db','retire-probe','ok','phase3_probe_pupil','44017000-0000-4000-8000-000000000211',transaction_timestamp()-interval '1 day'),
      (gen_random_uuid(),'44017000-0000-4000-8000-000000000001','db','retire-probe','ok','phase3_probe_case','44017000-0000-4000-8000-000000000411',transaction_timestamp()-interval '1 day');
select is((select count(*) from public.security_events where customer_id='44017000-0000-4000-8000-000000000001' and object_type in ('phase3_probe_pupil','phase3_probe_case')),2::bigint,'kept: historiska objekttyper är läsbara för granskning');
select is((select count(*) from pg_constraint where conrelid='public.security_events'::regclass and contype='f' and confrelid::regclass::text ~ 'phase3_probe'),0::bigint,'kept: säkerhetshändelser har inget beroende till elevprovet');

select * from finish();
rollback;
