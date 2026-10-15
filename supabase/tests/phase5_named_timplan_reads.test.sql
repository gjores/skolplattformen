-- Run only inside the synthetic, rollback-owned fixture database.
create temp table named_read_checks(name text primary key);
do $$declare role_name text; signature text;
begin
 foreach signature in array array['phase5_named_timplan_plan_series(uuid)','phase5_named_timplan_candidates(uuid,uuid,integer,text)'] loop
  foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
   if has_function_privilege(role_name,'public.'||signature,'EXECUTE') then raise exception 'Named read helper exposed';end if;
   insert into named_read_checks values('private helper '||signature||' denied to '||role_name);
  end loop;
 end loop;
 if position('10000' in pg_get_functiondef('public.phase5_planning_year_rows(jsonb)'::regprocedure))=0 then raise exception 'Missing row bound';end if;
 if position('50000' in pg_get_functiondef('public.phase5_planning_year_rows(jsonb)'::regprocedure))=0 then raise exception 'Missing cell/reference bound';end if;
 insert into named_read_checks values('bounded year rows retain 10000-row and 50000-cell/reference guards');
end $$;
