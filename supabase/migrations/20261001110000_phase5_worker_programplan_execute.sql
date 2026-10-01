-- 05-09: endast efter full Worker/API-preflight och exakt återställd ACL.
revoke execute on function public.phase5_read_programplan(uuid),
 public.phase5_bind_programplan_draft(uuid,integer,jsonb),
 public.phase5_replace_programplan_specialization(uuid,integer,jsonb),
 public.phase5_create_programplan_draft(uuid,integer,jsonb),
 public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)
 from public,anon,authenticated;
grant execute on function public.phase5_read_programplan(uuid),
 public.phase5_bind_programplan_draft(uuid,integer,jsonb),
 public.phase5_replace_programplan_specialization(uuid,integer,jsonb),
 public.phase5_create_programplan_draft(uuid,integer,jsonb),
 public.phase5_clone_programplan_draft(uuid,integer,integer,jsonb)
 to skolplattform_worker;
