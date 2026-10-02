-- Closed foundation: no client/Worker grants. New education and first draft
-- share one transaction; the immutable receipt survives an HTTP response loss.
create table public.programplan_education_receipts (
 command_id uuid primary key, identity_id uuid not null references public.identities(id),
 customer_id uuid not null references public.customers(id), organizer_id uuid not null references public.organizers(id),
 unit_id uuid not null references public.school_units(id), offering_id uuid not null references public.offerings(id),
 plan_id uuid not null references public.point_plans(id), request jsonb not null, initial_result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
alter table public.programplan_education_receipts enable row level security;
revoke all on public.programplan_education_receipts from public,anon,authenticated,skolplattform_worker;
alter table public.organisation_events add column actor_identity_id uuid references public.identities(id),
 add column session_id uuid references public.app_sessions(id), add column membership_id uuid references public.memberships(id),
 add column assignment_id uuid references public.access_assignments(id);
create function public.phase5_programplan_unit(unit_id uuid, require_hm boolean default false) returns public.school_units
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; u public.school_units;
begin
 a:=public.phase5_programplan_actor();
 if require_hm and a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501'; end if;
 select s.* into u from public.school_units s join public.organizers g on g.id=s.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units m on m.assignment_id=a.id and m.unit_id=s.id
 where s.id=phase5_programplan_unit.unit_id and s.organizer_id=a.organizer_id
 and exists(select 1 from public.school_unit_types t where t.unit_id=s.id and t.school_type='GY') for update of s;
 if not found then raise exception 'Education denied' using errcode='42501'; end if;
 a:=public.phase5_programplan_actor();
 if (require_hm and a.function<>'huvudman') or not exists(select 1 from public.school_units s join public.organizers g on g.id=s.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units m on m.assignment_id=a.id and m.unit_id=s.id where s.id=u.id and s.organizer_id=a.organizer_id
 and exists(select 1 from public.school_unit_types t where t.unit_id=s.id and t.school_type='GY')) then raise exception 'Education denied' using errcode='42501'; end if;
 select * into u from public.school_units where id=u.id; return u;
end $$;
create function public.phase5_programplan_education_audit(operation text, object_id uuid, object_type text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation not in ('programplan_selection_read','programplan_education_created','programplan_education_status_read')
 or object_type not in ('education','education_collection','education_command') then raise exception 'Invalid education audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,object_type,object_id,'ok','{}');
 exception when others then raise exception 'Education audit unavailable' using errcode='55000';end;
end $$;
create function public.phase5_programplan_selection(unit_id uuid,catalog_id text,program_ref jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; payload jsonb; result jsonb;
begin
 a:=public.phase5_programplan_actor();
 if (catalog_id is not null and (unit_id is null or catalog_id!~'^sha256:[0-9a-f]{64}$')) or (program_ref is not null and catalog_id is null)
 or (program_ref is not null and (jsonb_typeof(program_ref)<>'object' or (select count(*) from jsonb_object_keys(program_ref))<>2 or not program_ref?'code' or not program_ref?'version')) then
 raise exception 'Invalid selection' using errcode='22023';end if;
 if unit_id is not null then perform public.phase5_programplan_unit(unit_id);end if;
 if catalog_id is not null then select c.payload into payload from public.programplan_catalogs c where c.catalog_id=phase5_programplan_selection.catalog_id;
 if not found then raise exception 'Invalid catalog' using errcode='22023';end if;end if;
 select jsonb_build_object('units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'name',u.name) order by u.name,u.id)
 from public.school_units u join public.organizers g on g.id=u.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units m on m.assignment_id=a.id and m.unit_id=u.id
 where u.organizer_id=a.organizer_id and exists(select 1 from public.school_unit_types t where t.unit_id=u.id and t.school_type='GY')),'[]'::jsonb),
 'canCreateEducation',a.function='huvudman','catalogs',case when unit_id is null then '[]'::jsonb else coalesce((select jsonb_agg(jsonb_build_object('catalogId',c.catalog_id,'source',c.payload->'source') order by c.catalog_id) from public.programplan_catalogs c),'[]'::jsonb) end,
 'selection',jsonb_build_object('unitId',unit_id,'catalogId',catalog_id,'programRef',program_ref),'payload',payload,'decisionReady',false) into result;
 perform public.phase5_programplan_education_audit('programplan_selection_read',null,'education_collection');return result;
end $$;
create function public.phase5_programplan_organisation_actor() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;
begin
 if new.action='programplan_education_created' then
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' or new.organizer_id<>a.organizer_id then raise exception 'Education event denied' using errcode='42501';end if;
 new.actor:=null;new.actor_role:='huvudman';new.actor_identity_id:=s.identity_id;new.session_id:=s.id;new.membership_id:=a.membership_id;new.assignment_id:=a.id;
 else
 if new.actor_identity_id is not null or new.session_id is not null or new.membership_id is not null or new.assignment_id is not null then raise exception 'Invalid legacy event' using errcode='22023';end if;
 if public.current_actor_auth_user_id() is null or public.current_app_role() is null then raise exception 'History denied' using errcode='42501';end if;
 new.actor:=public.current_actor_auth_user_id();new.actor_role:=public.current_app_role();end if;return new;
end $$;
drop trigger organisation_events_actor on public.organisation_events;
create trigger organisation_events_actor before insert on public.organisation_events for each row execute function public.phase5_programplan_organisation_actor();
create function public.phase5_create_programplan_education(command_id uuid,unit_id uuid,name text,local_code text,cohort text,basis_reference jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;u public.school_units;receipt public.programplan_education_receipts;request jsonb;o public.offerings;p jsonb;result jsonb;fetched date;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501';end if;
 u:=public.phase5_programplan_unit(unit_id,true);
 if command_id is null or name is null or char_length(name)>120 or char_length(btrim(name))=0 or cohort is null or char_length(cohort)>120 or char_length(btrim(cohort))=0
 or (local_code is not null and (char_length(local_code)>80 or char_length(btrim(local_code))=0)) then raise exception 'Invalid education' using errcode='22023';end if;
 request:=jsonb_build_object('commandId',command_id,'unitId',unit_id,'name',btrim(name),'localCode',case when local_code is null then null else btrim(local_code) end,'cohort',btrim(cohort),'basisReference',basis_reference);
 -- Global command collision lock follows session/customer/school locks. Never
 -- inspect a foreign receipt before current school authorization is proven.
 perform pg_advisory_xact_lock(hashtextextended(command_id::text,515));
 select * into receipt from public.programplan_education_receipts r where r.command_id=phase5_create_programplan_education.command_id;
 if found then
 if receipt.identity_id<>s.identity_id or receipt.customer_id<>a.customer_id or receipt.organizer_id<>a.organizer_id or receipt.unit_id<>u.id then raise exception 'Education conflict' using errcode='40001';end if;
 if receipt.request is distinct from request then raise exception 'Education conflict' using errcode='40001';end if;
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
 -- One education audit pair describes atomic creation; draft command retains
 -- its own DB history/audit. Worker adds its required audit before commit.
 insert into public.organisation_events(organizer_id,actor_role,action) values(a.organizer_id,'huvudman','programplan_education_created');
 result:=jsonb_build_object('commandId',command_id,'education',public.phase5_programplan_education(o),'plan',p,'replayed',false);
 insert into public.programplan_education_receipts(command_id,identity_id,customer_id,organizer_id,unit_id,offering_id,plan_id,request,initial_result)
 values(command_id,s.identity_id,a.customer_id,a.organizer_id,u.id,o.id,(p->>'id')::uuid,request,result);
 perform public.phase5_programplan_unit(u.id,true);perform public.phase5_programplan_education_audit('programplan_education_created',o.id,'education');return result;
end $$;
create function public.phase5_programplan_education_status(command_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;r public.programplan_education_receipts;result jsonb;
begin
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501';end if;
 if command_id is null then raise exception 'Invalid education command' using errcode='22023';end if;
 select * into r from public.programplan_education_receipts c where c.command_id=phase5_programplan_education_status.command_id
 and c.identity_id=s.identity_id and c.customer_id=a.customer_id and c.organizer_id=a.organizer_id;
 if found then perform public.phase5_programplan_unit(r.unit_id,true);result:=(r.initial_result-'replayed')||jsonb_build_object('status','created');
 else result:=jsonb_build_object('commandId',command_id,'status','not_found');end if;
 perform public.phase5_programplan_education_audit('programplan_education_status_read',command_id,'education_command');return result;
end $$;
revoke all on function public.phase5_programplan_unit(uuid,boolean),public.phase5_programplan_education_audit(text,uuid,text),
 public.phase5_programplan_selection(uuid,text,jsonb),public.phase5_programplan_organisation_actor(),public.phase5_create_programplan_education(uuid,uuid,text,text,text,jsonb),
 public.phase5_programplan_education_status(uuid) from public,anon,authenticated,skolplattform_worker;
