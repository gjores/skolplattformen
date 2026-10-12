do $$declare f record;r text;begin
 for f in select p.oid,p.proname from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_class_%' loop
  foreach r in array array['anon','authenticated','service_role'] loop
   if has_function_privilege(r,f.oid,'execute') then raise exception 'Class helper exposed';end if;
  end loop;
  if has_function_privilege('skolplattform_worker',f.oid,'execute')<>(f.proname in ('phase5_class_underlag','phase5_class_command')) then raise exception 'Wrong Worker class grants';end if;
 end loop;
 if has_table_privilege('skolplattform_worker','public.class_plan_commands','select,insert,update,delete') then raise exception 'Class receipts exposed';end if;
end $$;
