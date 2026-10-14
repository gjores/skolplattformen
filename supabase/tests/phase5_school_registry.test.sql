-- Closed foundation contract; executable behavior lives in rollback harness.
do $contract$
declare name text; role_name text; f oid;
begin
 foreach name in array array['public.phase5_school_registry_list()','public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean)',
  'public.phase5_school_registry_actor()','public.phase5_school_registry_audit(text,uuid)','public.phase5_school_registry_revision(uuid)'] loop
  f:=to_regprocedure(name);
  if f is null or not exists(select 1 from pg_proc where oid=f and prosecdef and proconfig=array['search_path=pg_catalog, public']::text[]) then raise exception 'Registry function contract missing'; end if;
  foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
   if has_function_privilege(role_name,f,'execute') then raise exception 'Registry foundation function is open'; end if;
  end loop;
  if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.oid=f and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'Registry PUBLIC grant'; end if;
 end loop;
 if not exists(select 1 from pg_class where oid='public.school_registry_receipts'::regclass and relrowsecurity and relforcerowsecurity) then raise exception 'Registry receipts RLS missing'; end if;
 foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
  if has_table_privilege(role_name,'public.school_registry_receipts','select,insert,update,delete,truncate,references,trigger') then raise exception 'Registry receipt table grant'; end if;
 end loop;
end $contract$;
