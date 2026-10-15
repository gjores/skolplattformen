-- Structural guards; behavioral cases run with synthetic actors in the paired runner.
create temporary table named_decision_checks(name text primary key) on commit drop;
create function pg_temp.named_decision_assert(ok boolean,label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'Assertion: %',label;end if;
 insert into named_decision_checks values(label);
end $$;
do $$
declare role_name text;
begin
 perform pg_temp.named_decision_assert(exists(select 1 from pg_constraint where conrelid='public.timplans'::regclass and conname='timplans_series_version_unique' and pg_get_constraintdef(oid)='UNIQUE (series_id, version)'),'version uniqueness belongs to series');
 perform pg_temp.named_decision_assert(not exists(select 1 from pg_constraint where conrelid='public.timplans'::regclass and conname='timplans_offering_unit_version_unique'),'old scope version limit removed');
 perform pg_temp.named_decision_assert(exists(select 1 from pg_indexes where schemaname='public' and indexname='timplans_one_open' and indexdef like '%(series_id)%'),'one open version per series');
 perform pg_temp.named_decision_assert(exists(select 1 from pg_indexes where schemaname='public' and indexname='timplans_one_decided' and indexdef like '%(series_id)%'),'one approved version per series');
 foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
  perform pg_temp.named_decision_assert(not has_function_privilege(role_name,'public.phase5_named_timplan_create(jsonb)','EXECUTE'),'new creation still closed '||role_name);
  perform pg_temp.named_decision_assert(not has_function_privilege(role_name,'public.phase5_named_timplan_rename(jsonb)','EXECUTE'),'rename still closed '||role_name);
  perform pg_temp.named_decision_assert(not has_table_privilege(role_name,'public.timplan_series','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'series table still closed '||role_name);
 end loop;
end $$;
