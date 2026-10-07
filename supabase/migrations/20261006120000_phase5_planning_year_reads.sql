-- Läsårsplanering: nya stängda läsprojektioner. Ingen backfill eller verksamhetsmutation.
create function public.phase5_planning_year_actor() returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 -- Locks/rechecks the real session and customer/issuing mandate chain, independent of pupil scopes.
 return public.phase5_programplan_actor();
end $$;

create function public.phase5_planning_year_academic_date(started_on date) returns integer
language sql immutable set search_path=pg_catalog as $$
 select case when started_on is not null and isfinite(started_on) then
 extract(year from started_on)::integer-case when extract(month from started_on)<7 then 1 else 0 end end
$$;

create function public.phase5_planning_year_audit(operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('planning_year_selection_read','planning_year_list_read','planning_year_overview_read') then
  raise exception 'Invalid planning audit' using errcode='22023'; end if;
 a:=public.phase5_planning_year_actor(); s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,
   action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,'planning_year_collection',null,'ok','{}'::jsonb);
 exception when others then raise exception 'Planning audit unavailable' using errcode='55000'; end;
end $$;

create function public.phase5_planning_year_selection() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; today date; result jsonb;
begin
 a:=public.phase5_planning_year_actor(); today:=(clock_timestamp() at time zone 'Europe/Stockholm')::date;
 select jsonb_build_object('customerId',a.customer_id,'serverDate',to_char(today,'YYYY-MM-DD'),
  'currentYear',public.phase5_planning_year_academic_date(today),'minimumYear',2000,'maximumYear',2100,
  'units',coalesce(jsonb_agg(jsonb_build_object('unitId',u.id,'schoolName',u.name,'canRead',jsonb_build_object(
   'programplan',true,'gymnasium',true,'grundskola',a.function in ('huvudman','rektor'),'introduktionsprogram',a.function in ('huvudman','rektor')))
   order by u.name collate "C",u.id),'[]'::jsonb)) into result
 from public.school_units u join public.mandate_units m on m.unit_id=u.id and m.assignment_id=a.id
 join public.organizers g on g.id=u.organizer_id and g.customer_id=a.customer_id
 where u.organizer_id=a.organizer_id;
 perform public.phase5_planning_year_audit('planning_year_selection_read');
 return result;
end $$;

-- Helpers and entrypoints remain inaccessible to ordinary clients and the Worker.
revoke all on function public.phase5_planning_year_actor(),public.phase5_planning_year_academic_date(date),
 public.phase5_planning_year_audit(text),public.phase5_planning_year_selection()
 from public,anon,authenticated,service_role,skolplattform_worker;
