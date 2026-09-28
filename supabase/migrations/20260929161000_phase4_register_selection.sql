-- Reference bootstrap for the audited register UI. No pupil content is read.
begin;
create function public.phase4_register_selection() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s jsonb; years jsonb; current_year integer;
begin
 a:=public.phase3_actor();
 -- Reuses the live scoped metadata projection, including support expiry.
 s:=public.phase3_probe_scope();
 current_year:=extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end;
 select jsonb_agg(y order by y) into years from (
  select generate_series(current_year-1,current_year+1) as y
  union select sy.start_year from public.school_years sy
   join public.mandate_units mu on mu.unit_id=sy.unit_id and mu.assignment_id=a.id
   where sy.organizer_id=a.organizer_id
 ) permitted_years where y between 1 and 9998;
 return jsonb_build_object('schoolYears',years,'currentSchoolYear',current_year,
  'scope',jsonb_build_object('schools',s->'schools',
   'groups',coalesce((select jsonb_agg(jsonb_build_object('id',v->'id','unitId',v->'unitId','name',v->'label')) from jsonb_array_elements(s->'groups') v),'[]'::jsonb),
   'cases',coalesce((select jsonb_agg(jsonb_build_object('id',v->'id','unitId',v->'unitId','name',v->'label')) from jsonb_array_elements(s->'cases') v),'[]'::jsonb)),
  'endsAt',s->'endsAt','approverName',s->'approverName','purposeCode',s->'purposeCode','serverNow',s->'serverNow');
end $$;
revoke all on function public.phase4_register_selection() from public,anon,authenticated;
grant execute on function public.phase4_register_selection() to skolplattform_worker;
commit;
