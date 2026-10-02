-- Exact grants after complete source-bound Worker API preflight on 2026-10-02.
-- Helpers, business tables and immutable command receipts remain closed.
grant execute on function public.phase5_programplan_selection(uuid,text,jsonb),
 public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb),
 public.phase5_programplan_education_status(uuid) to skolplattform_worker;
revoke all on function public.phase5_programplan_selection(uuid,text,jsonb),
 public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb),
 public.phase5_programplan_education_status(uuid) from public,anon,authenticated;
