-- 05-20: programplanens livscykel (D-01, D-02, D-04). Stängd grund: inga Worker-grants här.
-- Status räknas i SQL från kullens start; klienten visar bara serverns lifecycle.
alter table public.offerings add column archived_at timestamptz,
 add column lifecycle_revision integer not null default 0 check (lifecycle_revision>=0);

-- Ren statusregel. Samma falltabell provas i TS (programplan-lifecycle.ts) och pgTAP.
create function public.phase5_programplan_phase_at(starts_on date, start_year integer, has_decided boolean, today date) returns text
language sql immutable set search_path=pg_catalog as $$
 select case
  when today is null then null
  when starts_on is not null then case when today<starts_on then 'framtida'
   when today<(starts_on+interval '3 years')::date then 'pagaende' else 'avslutad' end
  when start_year is not null then case when today<make_date(start_year,1,1) then 'framtida'
   when today>=make_date(start_year+4,1,1) then 'avslutad' else 'okand' end
  when coalesce(has_decided,true) then 'okand' else 'framtida' end
$$;
create function public.phase5_programplan_today() returns date
language sql stable set search_path=pg_catalog as $$ select (now() at time zone 'Europe/Stockholm')::date $$;
create function public.phase5_programplan_starts_on(o public.offerings) returns date
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(
  (select min((p.basis_reference->>'startedOn')::date) from public.point_plans p
   where p.offering_id=o.id and p.organizer_id=o.organizer_id and p.basis_reference is not null
    and p.basis_reference->>'startedOn' ~ '^\d{4}-\d{2}-\d{2}$'),
  (select min(y.ht_start) from public.school_years y where y.unit_id=o.unit_id and y.organizer_id=o.organizer_id and y.start_year=o.start_year))
$$;
create function public.phase5_programplan_phase(o public.offerings) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.phase5_programplan_phase_at(public.phase5_programplan_starts_on(o),o.start_year,
  exists(select 1 from public.point_plans p where p.offering_id=o.id and p.organizer_id=o.organizer_id and p.status in ('faststalld','ersatt')),
  public.phase5_programplan_today())
$$;
-- units innehåller här bara huvudskolan; 05-21 utökar utan kontraktsbyte.
create function public.phase5_programplan_lifecycle(o public.offerings) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('phase',public.phase5_programplan_phase(o),'startsOn',public.phase5_programplan_starts_on(o),
  'archived',o.archived_at is not null,'revision',o.lifecycle_revision,
  'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name,'primary',true,
   'inMandate',exists(select 1 from public.mandate_units m where m.assignment_id=public.current_assignment_id() and m.unit_id=u.id)))
   from public.school_units u where u.id=o.unit_id and u.organizer_id=o.organizer_id),'[]'::jsonb))
$$;
-- Anropas efter scope-lås. Separata hints skiljer mandat, arkiv och status.
create function public.phase5_programplan_writable(o public.offerings, require_hm boolean) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; fresh public.offerings;
begin
 a:=public.phase5_programplan_actor();
 select * into fresh from public.offerings where id=o.id;
 if not found or (require_hm and a.function<>'huvudman') or fresh.organizer_id<>a.organizer_id
  or not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=fresh.unit_id) then
  raise exception 'Programplan denied' using errcode='42501',hint='programplan_mandate'; end if;
 if fresh.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
 if public.phase5_programplan_phase(fresh) is distinct from 'framtida' then
  raise exception 'Programplan started' using errcode='42501',hint='programplan_started'; end if;
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
   and exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=u.id)
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

create or replace function public.phase5_programplan_workspace(offering_id uuid, version_page integer, catalog_id text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; result jsonb; catalog_payload jsonb; catalog_status text; catalog_diagnostic text;
begin
 o:=public.phase5_programplan_scope(null,offering_id);
 if version_page is null or version_page not between 1 and 100000
  or (catalog_id is not null and catalog_id !~ '^sha256:[0-9a-f]{64}$') then
  raise exception 'Invalid programplan workspace request' using errcode='22023'; end if;
 catalog_status:='unselected';
 if catalog_id is not null then
  select c.payload into catalog_payload from public.programplan_catalogs c where c.catalog_id=phase5_programplan_workspace.catalog_id;
  if found then catalog_status:='selected';
  else catalog_status:='blocked'; catalog_diagnostic:='catalog_unavailable'; end if;
 end if;
 with scoped_versions as materialized (
  select p.* from public.point_plans p where p.offering_id=o.id and p.organizer_id=o.organizer_id
 ), page_rows as (
  select * from scoped_versions order by version desc,id limit 50 offset (version_page-1)*50
 )
 select jsonb_build_object('education',public.phase5_programplan_education(o),'lifecycle',public.phase5_programplan_lifecycle(o),
  'versions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'revision',p.revision,'status',p.status,
   'decidedOn',p.decided_on,'catalogId',p.catalog_id,'basisReference',p.basis_reference,
   'legacySpecialization',case when p.catalog_id is null then to_jsonb(p.specialization) else null end) order by p.version desc,p.id)
   from page_rows p),'[]'::jsonb),
  'versionCount',(select count(*) from scoped_versions),'versionPage',version_page,'pageSize',50,
  'catalogs',coalesce((select jsonb_agg(jsonb_build_object('catalogId',c.catalog_id,'source',c.payload->'source') order by c.catalog_id)
   from public.programplan_catalogs c),'[]'::jsonb),
  'catalog',jsonb_build_object('status',catalog_status,'catalogId',catalog_id,'diagnostic',catalog_diagnostic,'payload',catalog_payload),
  'decisionReady',false) into result;
 perform public.phase5_programplan_scope(null,o.id);
 perform public.phase5_programplan_workspace_audit(o.id,'programplan_workspace_read');
 return result;
end $$;

-- Organisationshändelser för livscykeln får sessionens aktör, som skapandet.
create or replace function public.phase5_programplan_organisation_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;
begin
 if new.action in ('programplan_education_created','programplan_education_deleted','programplan_education_archived',
  'programplan_education_restored','programplan_education_updated') then
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' or new.organizer_id<>a.organizer_id then raise exception 'Education event denied' using errcode='42501';end if;
 new.actor:=null;new.actor_role:='huvudman';new.actor_identity_id:=s.identity_id;new.session_id:=s.id;new.membership_id:=a.membership_id;new.assignment_id:=a.id;
 else
 if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null then raise exception 'Invalid legacy event' using errcode='22023';end if;
 if public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501';end if;
 new.actor:=public.current_actor_auth_user_id();new.actor_role:=public.current_app_role();end if;return new;
end $$;

create function public.phase5_programplan_lifecycle_audit(operation text, offering_id uuid, details jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('programplan_education_deleted','programplan_education_archived','programplan_education_restored','programplan_education_updated')
  or offering_id is null or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid education audit' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor(); s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'education',offering_id,'ok',details);
 exception when others then raise exception 'Education audit unavailable' using errcode='55000'; end;
end $$;

-- Huvudmannens enda Worker-entrypoint för livscykeln. 05-20 uppgift 1: delete.
create function public.phase5_change_programplan_education(offering_id uuid, expected_revision integer, command text, details jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; o public.offerings; versions integer; decided boolean;
begin
 a:=public.phase5_programplan_actor(); perform public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if offering_id is null or expected_revision is null or expected_revision<0 or command is null or command not in ('delete')
  or details is null or jsonb_typeof(details)<>'object' or details<>'{}'::jsonb then raise exception 'Invalid education command' using errcode='22023'; end if;
 -- Låsordning: session -> kund (actor) -> utbildning (scope) -> planer.
 o:=public.phase5_programplan_scope(null,offering_id);
 perform 1 from public.point_plans p where p.offering_id=o.id order by p.id for update;
 select * into o from public.offerings where id=o.id;
 perform public.phase5_programplan_writable(o,true);
 if o.lifecycle_revision<>expected_revision then raise exception 'Education revision conflict' using errcode='40001'; end if;
 if exists(select 1 from public.school_classes c where c.offering_id=o.id) or exists(select 1 from public.pupil_placements p where p.offering_id=o.id)
  or exists(select 1 from public.timplans t where t.offering_id=o.id) or exists(select 1 from public.permits t where t.offering_id=o.id) then
  raise exception 'Education in use' using errcode='55006',hint='programplan_in_use'; end if;
 select count(*)::integer,coalesce(bool_or(p.status in ('faststalld','ersatt')),false) into versions,decided from public.point_plans p where p.offering_id=o.id;
 -- Versionernas händelser följer med (ON DELETE CASCADE). Kvitton finns kvar som spärr.
 delete from public.point_plans p where p.offering_id=o.id;
 delete from public.offerings f where f.id=o.id;
 insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman','programplan_education_deleted');
 perform public.phase5_programplan_lifecycle_audit('programplan_education_deleted',o.id,jsonb_build_object('versions',versions,'decided',decided));
 return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',null);
end $$;

-- Kvitton är spärr: utbildningen återskapas aldrig från ett kvitto.
alter table public.programplan_education_receipts drop constraint programplan_education_receipts_offering_id_fkey,
 drop constraint programplan_education_receipts_plan_id_fkey;
create or replace function public.phase5_create_programplan_education(command_id uuid,unit_id uuid,name text,local_code text,cohort text,basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;u public.school_units;receipt public.programplan_education_receipts;request jsonb;o public.offerings;p jsonb;result jsonb;fetched date;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501';end if;
 u:=public.phase5_programplan_unit(unit_id,true);
 if command_id is null or name is null or char_length(name)>120 or char_length(btrim(name))=0 or cohort is null or char_length(cohort)>120 or char_length(btrim(cohort))=0
 or (local_code is not null and (char_length(local_code)>80 or char_length(btrim(local_code))=0)) then raise exception 'Invalid education' using errcode='22023';end if;
 request:=jsonb_build_object('commandId',command_id,'unitId',unit_id,'name',btrim(name),'localCode',case when local_code is null then null else btrim(local_code) end,'cohort',btrim(cohort),'basisReference',basis_reference);
 perform pg_advisory_xact_lock(hashtextextended(command_id::text,515));
 select * into receipt from public.programplan_education_receipts r where r.command_id=phase5_create_programplan_education.command_id;
 if found then
 if receipt.identity_id<>s.identity_id or receipt.customer_id<>a.customer_id or receipt.organizer_id<>a.organizer_id or receipt.unit_id<>u.id then raise exception 'Education conflict' using errcode='40001';end if;
 if receipt.request is distinct from request then raise exception 'Education conflict' using errcode='40001';end if;
 -- En borttagen utbildning återskapas aldrig: replay ger konflikt.
 if not exists(select 1 from public.offerings f where f.id=receipt.offering_id) then raise exception 'Education conflict' using errcode='40001';end if;
 perform public.phase5_programplan_unit(receipt.unit_id,true);
 perform public.phase5_programplan_education_audit('programplan_education_created',receipt.offering_id,'education');
 return receipt.initial_result||jsonb_build_object('replayed',true);end if;
 if exists(select 1 from public.offerings f where f.organizer_id=a.organizer_id and f.unit_id=u.id and f.kind='gymnasium'
 and f.program_code is not distinct from basis_reference->'programRef'->>'code' and f.orientation_code is not distinct from basis_reference->>'orientationCode'
 and btrim(f.name)=btrim(phase5_create_programplan_education.name) and btrim(f.cohort)=btrim(phase5_create_programplan_education.cohort) and case when f.local_code is null then null else btrim(f.local_code) end is not distinct from request->>'localCode') then
 raise exception 'Education conflict' using errcode='40001';end if;
 select (c.payload->'source'->>'fetched')::date into fetched from public.programplan_catalogs c where c.catalog_id=basis_reference->>'catalogId';
 if not found then raise exception 'Invalid catalog' using errcode='22023';end if;
 insert into public.offerings(organizer_id,unit_id,kind,name,local_code,cohort,status,program_code,orientation_code,start_year,catalog_fetched)
 values(a.organizer_id,u.id,'gymnasium',btrim(name),request->>'localCode',btrim(cohort),'planerad',basis_reference->'programRef'->>'code',basis_reference->>'orientationCode',extract(year from (basis_reference->>'startedOn')::date)::integer,fetched) returning * into o;
 p:=public.phase5_create_programplan_draft(o.id,0,basis_reference);
 insert into public.organisation_events(organizer_id,actor_role,action) values(a.organizer_id,'huvudman','programplan_education_created');
 result:=jsonb_build_object('commandId',command_id,'education',public.phase5_programplan_education(o),'plan',p,'replayed',false);
 insert into public.programplan_education_receipts(command_id,identity_id,customer_id,organizer_id,unit_id,offering_id,plan_id,request,initial_result)
 values(command_id,s.identity_id,a.customer_id,a.organizer_id,u.id,o.id,(p->>'id')::uuid,request,result);
 perform public.phase5_programplan_unit(u.id,true);perform public.phase5_programplan_education_audit('programplan_education_created',o.id,'education');return result;
end $$;
create or replace function public.phase5_programplan_education_status(command_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;r public.programplan_education_receipts;result jsonb;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501';end if;
 if command_id is null then raise exception 'Invalid education command' using errcode='22023';end if;
 select * into r from public.programplan_education_receipts c where c.command_id=phase5_programplan_education_status.command_id
 and c.identity_id=s.identity_id and c.customer_id=a.customer_id and c.organizer_id=a.organizer_id;
 if found and exists(select 1 from public.offerings f where f.id=r.offering_id) then perform public.phase5_programplan_unit(r.unit_id,true);result:=(r.initial_result-'replayed')||jsonb_build_object('status','created');
 else result:=jsonb_build_object('commandId',command_id,'status','not_found');end if;
 perform public.phase5_programplan_education_audit('programplan_education_status_read',command_id,'education_command');return result;
end $$;

-- Uttryckligt stängda direkta skrivningar. Karantänen 20260911120000 återkallade redan klientrollerna.
-- school_units: borttagning kaskaderar till utbildningar och stängs för alla roller. Workerns befintliga
-- insert/update behövs av kundadminens skolimport (import_school_unit, security invoker, fas 2) och bevaras.
revoke insert,update,delete,truncate on public.offerings,public.point_plans,public.point_plan_events,public.programplan_education_receipts
 from public,anon,authenticated,service_role,skolplattform_worker;
revoke insert,update,delete,truncate on public.school_units from public,anon,authenticated,service_role;
revoke delete,truncate on public.school_units from skolplattform_worker;
drop policy if exists offerings_write on public.offerings;

revoke all on function public.phase5_programplan_phase_at(date,integer,boolean,date),public.phase5_programplan_today(),
 public.phase5_programplan_starts_on(public.offerings),public.phase5_programplan_phase(public.offerings),
 public.phase5_programplan_lifecycle(public.offerings),public.phase5_programplan_writable(public.offerings,boolean),
 public.phase5_programplan_lifecycle_audit(text,uuid,jsonb),public.phase5_change_programplan_education(uuid,integer,text,jsonb)
 from public,anon,authenticated,skolplattform_worker;
