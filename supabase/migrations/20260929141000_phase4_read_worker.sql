-- Open only the three reads whose Worker routes validate projections and commit
-- mandatory object and main events in the same transaction before responding.
begin;
grant execute on function public.phase4_list_pupils(jsonb),
  public.phase4_pupil_card(jsonb), public.phase4_pupil_history(jsonb)
  to skolplattform_worker;
commit;
