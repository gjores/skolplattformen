-- Catalogue contract only. Business/failure/concurrency probes live in the
-- rollback runner; this file neither grants nor rewrites existing functions.
do $contract$
declare f oid:=to_regprocedure('public.phase5_copy_programplan_education(uuid,uuid,integer,integer,uuid,text,text,text,jsonb,boolean)');
 h oid:=to_regprocedure('public.phase5_programplan_copy_audit(text,uuid)'); role_name text;
begin
 if f is null or h is null then raise exception 'Atomic copy functions missing'; end if;
 if not exists(select 1 from pg_proc where oid=f and prosecdef and prorettype='jsonb'::regtype
  and proargnames=array['command_id','source_plan_id','expected_source_revision','expected_education_revision','unit_id','name','local_code','cohort','basis_reference','status_only']::text[]
  and proconfig=array['search_path=pg_catalog, public']::text[]) then raise exception 'Atomic copy exact contract differs'; end if;
 foreach role_name in array array['anon','authenticated','service_role'] loop
  if has_function_privilege(role_name,f,'execute') or has_function_privilege(role_name,h,'execute') then raise exception 'Atomic copy client grant'; end if;
 end loop;
 if exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
  where p.oid in (f,h) and a.grantee=0 and a.privilege_type='EXECUTE') then raise exception 'Atomic copy PUBLIC grant'; end if;
 if has_function_privilege('skolplattform_worker',h,'execute')
  or has_table_privilege('skolplattform_worker','public.programplan_education_receipts','select') then raise exception 'Atomic copy helper/table grant'; end if;
end $contract$;
