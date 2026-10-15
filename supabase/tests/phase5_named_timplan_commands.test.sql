-- Schema-only private database. Repository synthetic fixtures only. The caller
-- installs 02/03 inside a rollback frame before this structural/negative matrix.
create temporary table named_command_checks(name text primary key) on commit drop;
create function pg_temp.named_command_assert(ok boolean,label text) returns void language plpgsql as $$
begin
 if ok is distinct from true then raise exception 'Assertion: %',label;end if;
 insert into named_command_checks values(label);
end $$;
create function pg_temp.named_command_denied(statement text,expected text,label text) returns void language plpgsql as $$
declare actual text;
begin
 begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 perform pg_temp.named_command_assert(actual=expected,label);
end $$;
do $$
declare role_name text;f record;t text;q jsonb;
begin
 foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
  foreach t in array array['named_timplan_commands','timplan_series_name_events'] loop
   perform pg_temp.named_command_assert(not has_table_privilege(role_name,'public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'private table '||t||' '||role_name);
  end loop;
  for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_named_timplan_%' loop
   perform pg_temp.named_command_assert(not has_function_privilege(role_name,f.oid,'EXECUTE'),'private function '||f.proname||' '||role_name);
  end loop;
 end loop;
 foreach t in array array['named_timplan_commands','timplan_series_name_events'] loop
  perform pg_temp.named_command_assert((select relrowsecurity and relforcerowsecurity from pg_class where oid=('public.'||t)::regclass),'forced RLS '||t);
  perform pg_temp.named_command_assert((select count(*)=2 from pg_trigger where tgrelid=('public.'||t)::regclass and not tgisinternal),'immutable update/delete/truncate triggers '||t);
 end loop;
 perform pg_temp.named_command_assert(exists(select 1 from pg_indexes where schemaname='public' and indexname='timplans_one_open' and indexdef like '%offering_id, unit_id%'),'old scope-wide open index remains closed rollout boundary');
 perform pg_temp.named_command_assert(exists(select 1 from pg_indexes where schemaname='public' and indexname='timplans_one_decided' and indexdef like '%offering_id, unit_id%'),'old scope-wide decided index remains closed rollout boundary');
 foreach q in array array['null'::jsonb,'[]'::jsonb,'{}'::jsonb,'{"commandId":null}'::jsonb] loop
  perform pg_temp.named_command_denied(format('select public.phase5_named_timplan_create(%L::jsonb)',q),'22023','invalid create object '||q::text);
  perform pg_temp.named_command_denied(format('select public.phase5_named_timplan_rename(%L::jsonb)',q),'22023','invalid rename object '||q::text);
 end loop;
end $$;
