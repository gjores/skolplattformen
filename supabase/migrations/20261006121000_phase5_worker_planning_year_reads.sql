-- Only the three closed foundation read entrypoints, after actual Worker preflight.
grant execute on function public.phase5_planning_year_selection(),
 public.phase5_planning_year_list(jsonb),public.phase5_planning_year_overview(jsonb)
 to skolplattform_worker;
