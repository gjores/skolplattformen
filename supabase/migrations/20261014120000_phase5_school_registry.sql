-- ADMIN-01 closed foundation. Registry information never grants school access.
create table public.school_registry_receipts (
 command_id uuid primary key, identity_id uuid not null references public.identities(id),
 customer_id uuid not null references public.customers(id), organizer_id uuid not null,
 unit_id uuid not null, request jsonb not null, registry_data jsonb not null,
 initial_result jsonb not null, created_at timestamptz not null default clock_timestamp(),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
alter table public.school_registry_receipts enable row level security;
alter table public.school_registry_receipts force row level security;
revoke all on public.school_registry_receipts from public,anon,authenticated,service_role,skolplattform_worker;

create function public.phase5_school_registry_actor() returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
 a:=public.phase5_programplan_actor();
 if a.function<>'huvudman' or a.parent_assignment_id is not null or a.organizer_id is null then
  raise exception 'School registry denied' using errcode='42501'; end if;
 return a;
end $$;

create function public.phase5_school_registry_audit(operation text,object_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('school_registry_list_read','school_registry_imported','school_registry_updated','school_registry_status_read') then
  raise exception 'Invalid registry audit' using errcode='22023'; end if;
 a:=public.phase5_school_registry_actor(); s:=public.phase5_programplan_session_check();
 select * into strict i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,'school_unit',object_id,'ok','{}');
 exception when others then raise exception 'School registry audit unavailable' using errcode='55000'; end;
end $$;

create function public.phase5_school_registry_revision(unit_id uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select encode(sha256(convert_to(jsonb_build_object(
  'unit',jsonb_build_object('id',u.id,'organizer',u.organizer_id,'code',u.code,'name',u.name,
   'municipalityCode',u.municipality_code,'municipalityName',u.municipality_name,'status',u.status,
   'locality',u.locality,'address',u.address,'sourceName',u.source_name,'sourceUrl',u.source_url,
   'sourceFetched',u.source_fetched,'sourceModified',u.source_modified),
  'types',coalesce((select jsonb_agg(to_jsonb(t) order by t.school_type) from public.school_unit_types t where t.unit_id=u.id),'[]'::jsonb)
 )::text,'UTF8')),'hex') from public.school_units u where u.id=unit_id
$$;

create function public.phase5_school_registry_list() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; result jsonb;
begin
 a:=public.phase5_school_registry_actor(); s:=public.phase5_programplan_session_check();
 select jsonb_build_object('organizer',jsonb_build_object('id',g.id,'name',g.name,'organizationNumber',g.organization_number),
  'units',coalesce((select jsonb_agg(jsonb_build_object('id',u.id,'code',u.code,'name',u.name,'status',u.status,
   'municipalityCode',u.municipality_code,'municipalityName',u.municipality_name,'locality',u.locality,'address',u.address,
   'principalName',case when exists(select 1 from public.mandate_units own where own.assignment_id=a.id and own.unit_id=u.id) then
    (select string_agg(p.name,', ' order by p.name,p.id) from public.assignments p where p.organizer_id=a.organizer_id and p.role='rektor'
     and exists(select 1 from public.assignment_units pu where pu.assignment_id=p.id and pu.unit_id=u.id)
     and exists(select 1 from public.access_assignments principal join public.mandate_units pm on pm.assignment_id=principal.id and pm.unit_id=u.id
      where principal.staff_assignment_id=p.id and principal.organizer_id=a.organizer_id and principal.customer_id=a.customer_id and principal.function='rektor'
       and public.phase3_mandate_is_valid(principal.id))) else null end,
   'schoolTypes',coalesce((select jsonb_agg(t.school_type order by t.school_type) from public.school_unit_types t where t.unit_id=u.id),'[]'::jsonb),
   'sourceSchoolTypes',(select r.registry_data->'schoolTypes' from public.school_registry_receipts r where r.unit_id=u.id order by r.created_at desc,r.command_id desc limit 1),
   'revision',public.phase5_school_registry_revision(u.id),'sourceFetchedAt',u.source_fetched::text,
   'canUpdate',exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=u.id)
  ) order by u.name,u.id) from public.school_units u where u.organizer_id=g.id and (
   exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=u.id)
   or exists(select 1 from public.school_registry_receipts r where r.unit_id=u.id and r.identity_id=s.identity_id and r.customer_id=a.customer_id and r.organizer_id=a.organizer_id and r.request->>'operation'='import')
  )),'[]'::jsonb)) into result from public.organizers g where g.id=a.organizer_id and g.customer_id=a.customer_id;
 if result is null then raise exception 'School registry denied' using errcode='42501'; end if;
 perform public.phase5_school_registry_audit('school_registry_list_read',null);
 return result;
end $$;

create function public.phase5_school_registry_save(request jsonb,registry_data jsonb,registry_payload jsonb,status_only boolean) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; g public.organizers; u public.school_units;
 r public.school_registry_receipts; v_command_id uuid; item jsonb; v_code text; operation text; result jsonb; v_source_url text; fetched timestamptz; modified timestamptz;
begin
 a:=public.phase5_school_registry_actor(); s:=public.phase5_programplan_session_check();
 if status_only is null or jsonb_typeof(request) is distinct from 'object' or
  not request ?& array['commandId','code','operation','expectedRevision','registryFingerprint'] or
  request-array['commandId','code','operation','expectedRevision','registryFingerprint']<>'{}'::jsonb or
  jsonb_typeof(request->'commandId') is distinct from 'string' or request->>'commandId' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-5][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}$' or
  jsonb_typeof(request->'code') is distinct from 'string' or request->>'code' !~ '^\d{8}$' or
  request->>'operation' not in ('import','update') or jsonb_typeof(request->'operation') is distinct from 'string' or
  jsonb_typeof(request->'registryFingerprint') is distinct from 'string' or request->>'registryFingerprint' !~ '^[a-f0-9]{64}$' or
  (request->>'operation'='import' and request->'expectedRevision'<>'null'::jsonb) or
  (request->>'operation'='update' and (jsonb_typeof(request->'expectedRevision') is distinct from 'string' or request->>'expectedRevision' !~ '^[a-f0-9]{64}$')) then
  raise exception 'Invalid school registry request' using errcode='22023'; end if;
 v_command_id:=(request->>'commandId')::uuid; v_code:=request->>'code'; operation:=request->>'operation';
 select * into strict g from public.organizers where id=a.organizer_id and customer_id=a.customer_id for update;
 perform pg_advisory_xact_lock(hashtextextended(v_command_id::text,516));
 select * into u from public.school_units x where x.organizer_id=a.organizer_id and x.code=v_code for update;
 -- Update authorization is required before inspecting a saved receipt too.
 if operation='update' and (u.id is null or not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=u.id)) then
  raise exception 'School registry denied' using errcode='42501'; end if;
 if operation='import' and u.id is not null and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=u.id)
  and not exists(select 1 from public.school_registry_receipts x where x.unit_id=u.id and x.identity_id=s.identity_id and x.customer_id=a.customer_id and x.organizer_id=a.organizer_id and x.request->>'operation'='import') then
  raise exception 'School registry denied' using errcode='42501'; end if;
 select * into r from public.school_registry_receipts x where x.command_id=v_command_id;
 if found then
  if r.identity_id<>s.identity_id or r.customer_id<>a.customer_id or r.organizer_id<>a.organizer_id or r.request is distinct from request
   or r.unit_id is distinct from u.id then raise exception 'School registry receipt conflict' using errcode='40001'; end if;
  perform public.phase5_school_registry_audit('school_registry_status_read',r.unit_id);
  return r.initial_result||jsonb_build_object('replayed',true);
 end if;
 if status_only then
  perform public.phase5_school_registry_audit('school_registry_status_read',null);
  return jsonb_build_object('commandId',v_command_id,'status','not_found');
 end if;
 if (operation='import' and u.id is not null) or (operation='update' and public.phase5_school_registry_revision(u.id) is distinct from request->>'expectedRevision') then
  raise exception 'School registry revision conflict' using errcode='40001'; end if;
 if jsonb_typeof(registry_data) is distinct from 'object' or not registry_data ?& array['code','name','status','municipalityCode','municipalityName','locality','address','organizationNumber','schoolTypes','programmes','modified','registryFingerprint','fetchedAt']
  or registry_data-array['code','name','status','municipalityCode','municipalityName','locality','address','organizationNumber','schoolTypes','programmes','modified','registryFingerprint','fetchedAt']<>'{}'::jsonb
  or registry_data->>'code' is distinct from v_code or registry_data->>'registryFingerprint' is distinct from request->>'registryFingerprint'
  or g.organization_number is null or registry_data->>'organizationNumber' is distinct from g.organization_number
  or jsonb_typeof(registry_data->'name') is distinct from 'string' or length(btrim(registry_data->>'name')) not between 1 and 300
  or jsonb_typeof(registry_data->'status') is distinct from 'string' or length(registry_data->>'status') not between 1 and 80
  or jsonb_typeof(registry_data->'municipalityCode') is distinct from 'string' or registry_data->>'municipalityCode' !~ '^\d{4}$'
  or jsonb_typeof(registry_data->'schoolTypes') is distinct from 'array' or jsonb_typeof(registry_data->'programmes') is distinct from 'object'
  or jsonb_typeof(registry_payload) is distinct from 'object' or octet_length(registry_payload::text)>2000000
  or jsonb_typeof(registry_data->'fetchedAt') is distinct from 'string' or registry_data->>'fetchedAt' !~ '^\d{4}-\d{2}-\d{2}T' then
  raise exception 'Invalid school registry data' using errcode='22023'; end if;
 foreach v_code in array array['municipalityName','locality','modified'] loop
  if jsonb_typeof(registry_data->v_code) not in ('string','null') or length(registry_data->>v_code)>300 then raise exception 'Invalid optional registry field' using errcode='22023'; end if;
 end loop;
 v_code:=request->>'code';
 begin
  fetched:=(registry_data->>'fetchedAt')::timestamptz;
  modified:=(registry_data->>'modified')::timestamptz;
 exception when others then raise exception 'Invalid registry timestamp' using errcode='22023'; end;
 if fetched is null or not isfinite(fetched) or fetched<clock_timestamp()-interval '10 minutes' or fetched>clock_timestamp()+interval '1 minute'
  or (modified is not null and not isfinite(modified)) then raise exception 'Stale registry data' using errcode='22023'; end if;
 if registry_data->'address'<>'null'::jsonb and (jsonb_typeof(registry_data->'address') is distinct from 'object' or
  not (registry_data->'address') ?& array['street','postalCode','locality'] or (registry_data->'address')-array['street','postalCode','locality','type']<>'{}'::jsonb or
  exists(select 1 from jsonb_each(registry_data->'address') e where jsonb_typeof(e.value)<>'string' or length(e.value#>>'{}')>300)) then
  raise exception 'Invalid registry address' using errcode='22023'; end if;
 if jsonb_array_length(registry_data->'schoolTypes') not between 1 and 50 or
  exists(select 1 from jsonb_array_elements(registry_data->'schoolTypes') x where jsonb_typeof(x)<>'string' or x#>>'{}' !~ '^[A-Z0-9_]{1,30}$') or
  (select count(*)<>count(distinct x) from jsonb_array_elements(registry_data->'schoolTypes') x) or
  exists(select 1 from jsonb_object_keys(registry_data->'programmes') x where not (registry_data->'schoolTypes') ? x) then
  raise exception 'Invalid registry school types' using errcode='22023'; end if;
 for item in select value from jsonb_array_elements(registry_data->'schoolTypes') loop
  if jsonb_typeof(registry_data->'programmes'->(item#>>'{}')) is distinct from 'array' then raise exception 'Invalid registry programmes' using errcode='22023'; end if;
  if jsonb_array_length(registry_data->'programmes'->(item#>>'{}'))>300 or exists(select 1 from jsonb_array_elements(registry_data->'programmes'->(item#>>'{}')) x where jsonb_typeof(x)<>'string' or length(x#>>'{}') not between 1 and 80) then
   raise exception 'Invalid registry programmes' using errcode='22023'; end if;
 end loop;
 v_source_url:='https://api.skolverket.se/skolenhetsregistret/v2/school-units/'||v_code;
 if operation='import' then
  insert into public.school_units(organizer_id,code,name,municipality_code,municipality_name,status,locality,address,source_name,source_url,source_fetched,source_modified)
  values(a.organizer_id,v_code,registry_data->>'name',registry_data->>'municipalityCode',registry_data->>'municipalityName',registry_data->>'status',registry_data->>'locality',nullif(registry_data->'address','null'::jsonb),
   'Skolenhetsregistret (Skolverket)',v_source_url,(fetched at time zone 'UTC')::date,(modified at time zone 'UTC')::date) returning * into u;
 else
  update public.school_units x set name=registry_data->>'name',municipality_code=registry_data->>'municipalityCode',municipality_name=registry_data->>'municipalityName',
   status=registry_data->>'status',locality=registry_data->>'locality',address=nullif(registry_data->'address','null'::jsonb),source_name='Skolenhetsregistret (Skolverket)',source_url=v_source_url,
   source_fetched=(fetched at time zone 'UTC')::date,source_modified=(modified at time zone 'UTC')::date where x.id=u.id;
 end if;
 for item in select value from jsonb_array_elements(registry_data->'schoolTypes') loop
  insert into public.school_unit_types(unit_id,school_type,programmes) values(u.id,item#>>'{}',array(select jsonb_array_elements_text(registry_data->'programmes'->(item#>>'{}'))))
  on conflict(unit_id,school_type) do update set programmes=excluded.programmes;
 end loop;
 insert into public.registry_snapshots(unit_code,organizer_id,source_url,payload) values(v_code,a.organizer_id,v_source_url,registry_payload);
 result:=jsonb_build_object('commandId',v_command_id,'status','saved','unitId',u.id,'code',v_code,'operation',operation,'revision',public.phase5_school_registry_revision(u.id),'replayed',false);
 insert into public.school_registry_receipts(command_id,identity_id,customer_id,organizer_id,unit_id,request,registry_data,initial_result)
 values(v_command_id,s.identity_id,a.customer_id,a.organizer_id,u.id,request,registry_data,result);
 perform public.phase5_school_registry_audit(case when operation='import' then 'school_registry_imported' else 'school_registry_updated' end,u.id);
 return result;
end $$;

revoke all on function public.phase5_school_registry_actor(),public.phase5_school_registry_audit(text,uuid),
 public.phase5_school_registry_revision(uuid),public.phase5_school_registry_list(),public.phase5_school_registry_save(jsonb,jsonb,jsonb,boolean)
 from public,anon,authenticated,service_role,skolplattform_worker;
