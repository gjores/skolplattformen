-- 05-21 D-03/D-05: en programplan delar versioner mellan huvudmannens skolor.
-- Ingen ny Worker-grant. Befintliga funktionssignaturer/ACL bevaras.
alter table public.offerings add constraint offerings_id_organizer_unique unique(id,organizer_id);
create table public.offering_units (
 offering_id uuid not null, unit_id uuid not null, organizer_id uuid not null,
 created_at timestamptz not null default clock_timestamp(),
 primary key(offering_id,unit_id),
 unique(offering_id,unit_id,organizer_id),
 foreign key(offering_id,organizer_id) references public.offerings(id,organizer_id) on delete cascade,
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
create index offering_units_unit_idx on public.offering_units(unit_id,offering_id);
alter table public.offering_units enable row level security;
revoke all on public.offering_units from public,anon,authenticated,service_role,skolplattform_worker;
insert into public.offering_units(offering_id,unit_id,organizer_id) select id,unit_id,organizer_id from public.offerings;

create function public.phase5_programplan_primary_unit() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='INSERT' then
  insert into public.offering_units(offering_id,unit_id,organizer_id) values(new.id,new.unit_id,new.organizer_id);
 elsif new.unit_id is distinct from old.unit_id or new.organizer_id is distinct from old.organizer_id then
  raise exception 'Programplan primary school immutable' using errcode='42501';
 end if;
 return new;
end $$;
create trigger offering_primary_unit_insert after insert on public.offerings for each row execute function public.phase5_programplan_primary_unit();
create trigger offering_primary_unit_update before update of unit_id,organizer_id on public.offerings for each row execute function public.phase5_programplan_primary_unit();
create function public.phase5_programplan_unit_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 -- Vid ON DELETE CASCADE är föräldern redan borta: bara då får huvudskolan raderas.
 if exists(select 1 from public.offerings o where o.id=old.offering_id and o.unit_id=old.unit_id)
 and (tg_op='DELETE' or new.offering_id is distinct from old.offering_id or new.unit_id is distinct from old.unit_id or new.organizer_id is distinct from old.organizer_id) then
  raise exception 'Programplan primary school required' using errcode='42501';
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger offering_units_primary_guard before delete or update on public.offering_units for each row execute function public.phase5_programplan_unit_guard();
revoke all on function public.phase5_programplan_primary_unit(),public.phase5_programplan_unit_guard() from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.phase5_programplan_scope(plan_id uuid, offering_id uuid default null) returns public.offerings
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; o public.offerings;
begin
 a:=public.phase5_programplan_actor();
 select f.* into o from public.offerings f join public.organizers g on g.id=f.organizer_id and g.customer_id=a.customer_id
 where f.organizer_id=a.organizer_id and f.kind='gymnasium'
 and ((plan_id is not null and exists(select 1 from public.point_plans p where p.id=plan_id and p.offering_id=f.id and p.organizer_id=f.organizer_id)) or (plan_id is null and f.id=offering_id))
 and exists(select 1 from public.offering_units ou join public.mandate_units m on m.assignment_id=a.id and m.unit_id=ou.unit_id where ou.offering_id=f.id and ou.organizer_id=f.organizer_id);
 if not found then raise exception 'Programplan denied' using errcode='42501'; end if;
 -- Session -> kund -> skolor (id-ordning) -> utbildning -> planer.
 -- Kundlåset serialiserar skolval och mandat. Skolor låses före utbildningen
 -- så att skolimport/skapande inte får omvänd ordning.
 perform 1 from public.school_units u join public.offering_units ou on ou.unit_id=u.id and ou.organizer_id=u.organizer_id where ou.offering_id=o.id order by u.id for update of u;
 select * into o from public.offerings f where f.id=o.id for update;
 a:=public.phase5_programplan_actor();
 if o.id is null or o.organizer_id<>a.organizer_id or not exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
 or not exists(select 1 from public.offering_units ou join public.mandate_units m on m.assignment_id=a.id and m.unit_id=ou.unit_id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id)
 or (plan_id is not null and not exists(select 1 from public.point_plans p where p.id=plan_id and p.offering_id=o.id and p.organizer_id=o.organizer_id)) then
  raise exception 'Programplan denied' using errcode='42501'; end if;
 return o;
end $$;
create or replace function public.phase5_programplan_lifecycle(o public.offerings) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('phase',public.phase5_programplan_phase(o),'startsOn',public.phase5_programplan_starts_on(o),
 'archived',o.archived_at is not null,'revision',o.lifecycle_revision,
 'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'primary',u.id=o.unit_id,
 'inMandate',exists(select 1 from public.mandate_units m where m.assignment_id=public.current_assignment_id() and m.unit_id=u.id)) order by (u.id=o.unit_id) desc,u.name,u.id)
 from public.offering_units ou join public.school_units u on u.id=ou.unit_id and u.organizer_id=ou.organizer_id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id),'[]'::jsonb))
$$;
create or replace function public.phase5_programplan_writable(o public.offerings, require_hm boolean) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; fresh public.offerings;
begin
 a:=public.phase5_programplan_actor();
 select * into fresh from public.offerings where id=o.id;
 if not found or (require_hm and a.function<>'huvudman') or fresh.organizer_id<>a.organizer_id
 or not exists(select 1 from public.offering_units ou where ou.offering_id=fresh.id and ou.unit_id=fresh.unit_id and ou.organizer_id=fresh.organizer_id)
 or exists(select 1 from public.offering_units ou where ou.offering_id=fresh.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
  raise exception 'Programplan denied' using errcode='42501',hint='programplan_mandate'; end if;
 if fresh.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
 if public.phase5_programplan_phase(fresh) is distinct from 'framtida' then raise exception 'Programplan started' using errcode='42501',hint='programplan_started'; end if;
end $$;
create or replace function public.phase5_list_programplan_offerings(page_number integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
 a:=public.phase5_programplan_actor();
 if page_number is null or page_number not between 1 and 100000 then
  raise exception 'Invalid programplan workspace page' using errcode='22023'; end if;
 with scoped as materialized (
  select o.*,u.name as school_name from public.offerings o
  join public.school_units u on u.id=o.unit_id and u.organizer_id=o.organizer_id
  join public.organizers g on g.id=o.organizer_id and g.customer_id=a.customer_id
  where o.kind='gymnasium' and o.organizer_id=a.organizer_id
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.assignment_id=a.id and m.unit_id=ou.unit_id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id)
 ), page_rows as (
  select * from scoped order by school_name,name,cohort,id limit 50 offset (page_number-1)*50
 )
 select jsonb_build_object('offerings',coalesce((select jsonb_agg(public.phase5_programplan_education(o)
   ||jsonb_build_object('lifecycle',public.phase5_programplan_lifecycle(o))
   order by r.school_name,r.name,r.cohort,r.id) from page_rows r join public.offerings o on o.id=r.id),'[]'::jsonb),
  'count',(select count(*) from scoped),'page',page_number,'pageSize',50) into result;
 perform public.phase5_programplan_workspace_audit(null,'programplan_offerings_listed');
 return result;
end $$;

create or replace function public.phase5_programplan_organisation_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;
begin
 if new.action in ('programplan_education_created','programplan_education_deleted','programplan_education_archived',
  'programplan_education_restored','programplan_education_updated','programplan_education_units_changed') then
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' or new.organizer_id<>a.organizer_id then raise exception 'Education event denied' using errcode='42501';end if;
 new.actor:=null;new.actor_role:='huvudman';new.actor_identity_id:=s.identity_id;new.session_id:=s.id;new.membership_id:=a.membership_id;new.assignment_id:=a.id;
 else
 if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null then raise exception 'Invalid legacy event' using errcode='22023';end if;
 if public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501';end if;
 new.actor:=public.current_actor_auth_user_id();new.actor_role:=public.current_app_role();end if;return new;
end $$;

create or replace function public.phase5_programplan_lifecycle_audit(operation text, offering_id uuid, details jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('programplan_education_deleted','programplan_education_archived','programplan_education_restored','programplan_education_updated','programplan_education_units_changed')
  or offering_id is null or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid education audit' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'education',offering_id,'ok',details);
 exception when others then raise exception 'Education audit unavailable' using errcode='55000'; end;
end $$;

create or replace function public.phase5_change_programplan_education(offering_id uuid, expected_revision integer, command text, details jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; o public.offerings; versions integer; decided boolean; p public.point_plans; current_start date; started date;
 new_name text; new_code text; new_cohort text; start_changed boolean:=false; operation text; unit_ids uuid[]; school_id uuid; added integer; removed integer;
begin
 a:=public.phase5_programplan_actor(); perform public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if offering_id is null or expected_revision is null or expected_revision<0 or command is null or command not in ('delete','archive','restore','update','units')
  or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command not in ('update','units') and details<>'{}'::jsonb then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command='update' then
  if (select count(*) from jsonb_object_keys(details))<>4 or not details ?& array['name','localCode','cohort','startedOn']
   or jsonb_typeof(details->'name')<>'string' or jsonb_typeof(details->'cohort')<>'string' or jsonb_typeof(details->'localCode') not in ('string','null')
   or jsonb_typeof(details->'startedOn') not in ('string','null') then raise exception 'Invalid education command' using errcode='22023'; end if;
  new_name:=btrim(details->>'name'); new_cohort:=btrim(details->>'cohort'); new_code:=case when details->>'localCode' is null then null else btrim(details->>'localCode') end;
  -- Samma längdkontroll som skapandet.
  if char_length(details->>'name')>120 or char_length(new_name)=0 or char_length(details->>'cohort')>120 or char_length(new_cohort)=0
   or (new_code is not null and (char_length(details->>'localCode')>80 or char_length(new_code)=0)) then raise exception 'Invalid education' using errcode='22023'; end if;
  if details->>'startedOn' is not null then
   if details->>'startedOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid education' using errcode='22023'; end if;
   begin started:=(details->>'startedOn')::date; exception when others then raise exception 'Invalid education' using errcode='22023'; end;
  end if;
 end if;
 if command='units' then
  if (select count(*) from jsonb_object_keys(details))<>1 or not details?'unitIds'
   or jsonb_typeof(details->'unitIds') is distinct from 'array' then raise exception 'Invalid education command' using errcode='22023'; end if;
  if jsonb_array_length(details->'unitIds') not between 1 and 100
   or exists(select 1 from jsonb_array_elements(details->'unitIds') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid education command' using errcode='22023'; end if;
  select array_agg(v::uuid order by v::uuid) into unit_ids from jsonb_array_elements_text(details->'unitIds') v;
  if cardinality(unit_ids)<>(select count(distinct v) from unnest(unit_ids) v) then raise exception 'Invalid education command' using errcode='22023'; end if;
  -- Lås både nuvarande och begärda skolor före scope i gemensam id-ordning.
  -- Mandat/kund är kontrollerat; främmande skolor låses aldrig.
  perform 1 from public.school_units u where u.organizer_id=a.organizer_id and (u.id=any(unit_ids) or exists(select 1 from public.offering_units ou where ou.offering_id=phase5_change_programplan_education.offering_id and ou.unit_id=u.id)) order by u.id for update;
 end if;
 -- Låsordning: session -> kund -> skolor (scope) -> utbildning -> planer.
 o:=public.phase5_programplan_scope(null,offering_id);
 perform 1 from public.point_plans pp where pp.offering_id=o.id order by pp.id for update;
 select * into o from public.offerings where id=o.id;
 if command in ('delete','update') then perform public.phase5_programplan_writable(o,true);
 elsif o.organizer_id<>a.organizer_id or exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
  raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if o.lifecycle_revision<>expected_revision then raise exception 'Education revision conflict' using errcode='40001'; end if;
 if command='delete' then
  if exists(select 1 from public.school_classes c where c.offering_id=o.id) or exists(select 1 from public.pupil_placements pl where pl.offering_id=o.id)
   or exists(select 1 from public.timplans t where t.offering_id=o.id) or exists(select 1 from public.permits t where t.offering_id=o.id) then
   raise exception 'Education in use' using errcode='55006',hint='programplan_in_use'; end if;
  select count(*)::integer,coalesce(bool_or(pp.status in ('faststalld','ersatt')),false) into versions,decided from public.point_plans pp where pp.offering_id=o.id;
  delete from public.point_plans pp where pp.offering_id=o.id;
  delete from public.offerings f where f.id=o.id;
  insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman','programplan_education_deleted');
  perform public.phase5_programplan_lifecycle_audit('programplan_education_deleted',o.id,jsonb_build_object('versions',versions,'decided',decided));
  return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',null);
 end if;
 if command='units' then
  if not o.unit_id=any(unit_ids) then raise exception 'Invalid education command' using errcode='22023'; end if;
  if o.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
  select count(*)::integer into removed from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids);
  select count(*)::integer into added from unnest(unit_ids) u where not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u);
  if removed>0 and public.phase5_programplan_phase(o) is distinct from 'framtida' then raise exception 'Programplan started' using errcode='42501',hint='programplan_started'; end if;
  -- Varje ändrad skola kontrolleras igen med samma GY-/huvudmanna-/mandatregel.
  for school_id in select u from unnest(unit_ids) u where not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u)
   union select ou.unit_id from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids) order by 1 loop
   perform public.phase5_programplan_unit(school_id,true);
  end loop;
  delete from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids);
  insert into public.offering_units(offering_id,unit_id,organizer_id) select o.id,u,o.organizer_id from unnest(unit_ids) u on conflict do nothing;
  update public.offerings set lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_units_changed';
 elsif command='archive' then
  if o.archived_at is not null then raise exception 'Education already archived' using errcode='40001'; end if;
  update public.offerings set archived_at=clock_timestamp(),lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_archived';
 elsif command='restore' then
  if o.archived_at is null then raise exception 'Education not archived' using errcode='40001'; end if;
  update public.offerings set archived_at=null,lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_restored';
 else
  if exists(select 1 from public.offerings f where f.id<>o.id and f.organizer_id=o.organizer_id and f.unit_id=o.unit_id and f.kind='gymnasium'
   and f.program_code is not distinct from o.program_code and f.orientation_code is not distinct from o.orientation_code
   and btrim(f.name)=new_name and btrim(f.cohort)=new_cohort and case when f.local_code is null then null else btrim(f.local_code) end is not distinct from new_code) then
   raise exception 'Education conflict' using errcode='40001'; end if;
  current_start:=public.phase5_programplan_starts_on(o);
  if started is not null and started is distinct from current_start then
   -- Startdatum ändras bara när utbildningen har en enda version som är ett bundet utkast.
   select count(*)::integer into versions from public.point_plans pp where pp.offering_id=o.id;
   select * into p from public.point_plans pp where pp.offering_id=o.id;
   if versions<>1 or p.status<>'utkast' or p.basis_reference is null then raise exception 'Education start locked' using errcode='22023'; end if;
   if started<=public.phase5_programplan_today() then raise exception 'Education start passed' using errcode='22023',hint='programplan_start_passed'; end if;
   update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(to_char(started,'YYYY-MM-DD'))),revision=revision+1 where id=p.id;
   start_changed:=true;
  end if;
  update public.offerings set name=new_name,local_code=new_code,cohort=new_cohort,
   start_year=case when start_changed then extract(year from started)::integer else start_year end,lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_updated';
 end if;
 insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman',operation);
 perform public.phase5_programplan_lifecycle_audit(operation,o.id,case when command='units' then jsonb_build_object('added',added,'removed',removed) when command='update' then jsonb_build_object('startChanged',start_changed) else '{}'::jsonb end);
 return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',public.phase5_programplan_lifecycle(o));
end $$;
