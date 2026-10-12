-- Open exactly the three reviewed decision entrypoints after actual Worker preflight.
-- Helpers and decision tables remain inaccessible to the Worker role.
grant execute on function public.phase5_plan_decision_basis(text,uuid),
 public.phase5_plan_decision_command(jsonb),public.phase5_plan_decision_inbox()
 to skolplattform_worker;
