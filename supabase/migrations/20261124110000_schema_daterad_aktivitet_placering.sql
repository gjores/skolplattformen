-- En tömning sparar den daterade aktiviteten som definition, med manuella
-- resursval men utan lagda resurser, ersättningar eller tillgodoräknad tid.
alter function public.schema_daterade_aktiviteter_valid(jsonb, integer) rename to schema_daterade_aktiviteter_bas_valid;

create function public.schema_daterad_aktivitetsresurs_valid(resource jsonb, manual_lock boolean) returns boolean
language sql immutable set search_path = pg_catalog, public as $$
 select public.nationella_prov_keys(resource, array['roomId','teacherRef'])
  and (resource->'roomId' = 'null'::jsonb or
    (jsonb_typeof(resource->'roomId') = 'string' and (resource->>'roomId' ~ '^sal-[1-9][0-9]{0,2}$' or manual_lock and resource->>'roomId' = 'ingen')))
  and (resource->'teacherRef' = 'null'::jsonb or
    (jsonb_typeof(resource->'teacherRef') = 'string' and resource->>'teacherRef' ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'));
$$;

create function public.schema_daterade_aktiviteter_valid(activities jsonb, school_year integer) returns boolean
language plpgsql immutable set search_path = pg_catalog, public as $$
declare activity jsonb;
begin
 if jsonb_typeof(activities) is distinct from 'array' then return false;end if;
 if jsonb_array_length(activities) <> 1 then return false;end if;
 activity := activities->0;
 if jsonb_typeof(activity) is distinct from 'object' then return false;end if;
 if (activity ? 'resourceLocks' and not coalesce(public.schema_daterad_aktivitetsresurs_valid(activity->'resourceLocks',true),false))
   or (activity ? 'resources' and not coalesce(public.schema_daterad_aktivitetsresurs_valid(activity->'resources',false),false)) then return false;end if;
 return public.schema_daterade_aktiviteter_bas_valid(jsonb_build_array(activity - array['resourceLocks','resources']), school_year);
end $$;

create function public.schema_daterad_aktivitetsdefinition_valid(definitions jsonb, school_year integer) returns boolean
language plpgsql immutable set search_path = pg_catalog, public as $$
declare definition jsonb; empty_effects jsonb; credit_refs jsonb;
begin
 if jsonb_typeof(definitions) is distinct from 'array' then return false;end if;
 if jsonb_array_length(definitions) <> 1 then return false;end if;
 definition := definitions->0;
 if jsonb_typeof(definition) is distinct from 'object' then return false;end if;
 if definition ?| array['cancelled','moves','credits','resources'] then return false;end if;
 -- Samma strukturkontroll som för en placerad aktivitet. Kreditreferensen
 -- används bara som formprov här och sparas inte som en tillgodoräknad rad.
 credit_refs := case when definition->'credit' = 'null'::jsonb then '[]'::jsonb else jsonb_build_array(definition->'credit'->'ref') end;
 empty_effects := jsonb_build_object('cancelled','[]'::jsonb,'moves','[]'::jsonb,'credits',credit_refs);
 return public.schema_daterade_aktiviteter_valid(jsonb_build_array(definition || empty_effects), school_year);
end $$;

revoke all on function public.schema_daterad_aktivitetsresurs_valid(jsonb, boolean),
 public.schema_daterade_aktiviteter_valid(jsonb, integer), public.schema_daterad_aktivitetsdefinition_valid(jsonb, integer)
 from public, anon, authenticated, service_role, skolplattform_worker;

create or replace function public.schema_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;a public.access_assignments;s public.app_sessions;r public.schema_draft_commands;d public.schema_drafts;
 request_id uuid;requested_draft uuid;expected integer;doc jsonb;doc_hash text;request_hash text;source_hash text;receipt jsonb;envelope jsonb;saved timestamptz;
begin
 q:=public.schema_draft_scope(input,array['commandId','draftId','expectedRevision','name','requestHash','document','sourceHash']);
 begin request_id:=(input->>'commandId')::uuid;requested_draft:=(input->>'draftId')::uuid;
 exception when invalid_text_representation then raise exception 'Invalid schema command' using errcode='22023',hint='schema_draft_invalid';end;
 if request_id is null or not coalesce(public.phase5_programplan_integer(input->'expectedRevision',0,2147483646),false)
   or jsonb_typeof(input->'name')<>'string' or length(input->>'name') not between 1 and 120 or input->>'name'<>btrim(input->>'name')
   or not coalesce((input->>'requestHash')~'^sha256:[0-9a-f]{64}$',false) or not coalesce((input->>'sourceHash')~'^sha256:[0-9a-f]{64}$',false) then
  raise exception 'Invalid schema command' using errcode='22023',hint='schema_draft_invalid';end if;
 expected:=(input->>'expectedRevision')::integer;doc:=input->'document';request_hash:=input->>'requestHash';source_hash:=input->>'sourceHash';
 if (requested_draft is null)<>(expected=0) or jsonb_typeof(doc)<>'object' or octet_length(doc::text)>8388608
  or (doc ? 'datedActivities' and doc ? 'datedActivityDefinitions')
  or (select count(*) from jsonb_object_keys(doc))<>12 + (case when doc ? 'datedActivities' or doc ? 'datedActivityDefinitions' then 1 else 0 end)
  or exists(select 1 from jsonb_object_keys(doc) k where not k=any(array['documentVersion','base','basisVillkor','workingVillkor','placements','locks','intentional','datedOverrides','datedActivities','datedActivityDefinitions','activityTypes','control','requiresRecalculation','source']))
  or doc->'documentVersion'<>'1'::jsonb or jsonb_typeof(doc->'workingVillkor')<>'object'
  or jsonb_typeof(doc->'requiresRecalculation')<>'boolean' or jsonb_typeof(doc->'source')<>'object'
  or (select count(*) from jsonb_object_keys(doc->'source'))<>6
  or exists(select 1 from jsonb_object_keys(doc->'source') k where not k=any(array['planId','planRevision','calendarVersionId','calendarVersion','lessonSources','digest']))
  or doc->'source'->>'digest' is distinct from source_hash
  or jsonb_typeof(doc->'source'->'lessonSources')<>'array' or jsonb_array_length(doc->'source'->'lessonSources')>20000
  or jsonb_typeof(doc->'placements')<>'array' or jsonb_array_length(doc->'placements')>20000
  or jsonb_typeof(doc->'locks')<>'array' or jsonb_array_length(doc->'locks')>20000
  or jsonb_typeof(doc->'intentional')<>'array' or jsonb_array_length(doc->'intentional')>200
  or jsonb_typeof(doc->'activityTypes')<>'array' or jsonb_array_length(doc->'activityTypes')>100
  or jsonb_typeof(doc->'datedOverrides')<>'array' or jsonb_array_length(doc->'datedOverrides')>20000
  or (doc ? 'datedActivities' and (jsonb_typeof(doc->'base') is distinct from 'object'
    or not public.schema_daterade_aktiviteter_valid(doc->'datedActivities', (q->>'schoolYear')::integer)))
  or (doc ? 'datedActivityDefinitions' and not public.schema_daterad_aktivitetsdefinition_valid(doc->'datedActivityDefinitions', (q->>'schoolYear')::integer))
  or (doc->'base'<>'null'::jsonb and (doc->'base'->>'unitId',doc->'base'->>'schoolYear',doc->'base'->>'period')
    is distinct from (q->>'unitId',q->>'schoolYear',q->>'period')) then
  raise exception 'Invalid canonical schema document' using errcode='22023',hint='schema_draft_invalid';end if;
 doc_hash:=public.schema_draft_hash(doc);
 a:=public.schema_draft_actor((q->>'unitId')::uuid);s:=public.phase5_programplan_session_check();
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,6116));
 select * into r from public.schema_draft_commands where command_id=request_id;
 if found then
  if (r.customer_id,r.organizer_id,r.unit_id,r.school_year,r.period,r.actor_identity_id,r.assignment_id,r.requested_draft_id,r.expected_revision,r.request_hash,r.document_hash)
   is distinct from (a.customer_id,a.organizer_id,(q->>'unitId')::uuid,(q->>'schoolYear')::integer,q->>'period',s.identity_id,a.id,requested_draft,expected,request_hash,doc_hash)
   or r.envelope->'result'->'draft'->>'name' is distinct from input->>'name' then
   raise exception 'Schema draft command changed' using errcode='40001',hint='schema_draft_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 perform pg_advisory_xact_lock(hashtextextended((q->>'unitId')||':'||(q->>'schoolYear')||':'||(q->>'period'),6117));
 select * into d from public.schema_drafts x where x.unit_id=(q->>'unitId')::uuid and x.school_year=(q->>'schoolYear')::integer and x.period=q->>'period' for update;
 if not found then
  if requested_draft is not null then raise exception 'Schema draft not found' using errcode='40001',hint='schema_draft_conflict';end if;
  insert into public.schema_drafts(customer_id,organizer_id,unit_id,school_year,period,name,created_by_identity_id,created_by_assignment_id)
   values(a.customer_id,a.organizer_id,(q->>'unitId')::uuid,(q->>'schoolYear')::integer,q->>'period',input->>'name',s.identity_id,a.id) returning * into d;
 elsif requested_draft is distinct from d.id or expected<>d.revision then
  raise exception 'Schema draft revision conflict' using errcode='40001',hint='schema_draft_conflict';
 end if;
 if (d.customer_id,d.organizer_id) is distinct from (a.customer_id,a.organizer_id) then raise exception 'Schema draft denied' using errcode='42501';end if;
 saved:=clock_timestamp();
 insert into public.schema_draft_revisions(draft_id,revision,customer_id,organizer_id,document,content_hash,source_hash,actor_identity_id,assignment_id,saved_at)
  values(d.id,d.revision+1,a.customer_id,a.organizer_id,doc,doc_hash,source_hash,s.identity_id,a.id,saved);
 update public.schema_drafts set revision=revision+1,name=input->>'name',updated_at=saved where id=d.id returning * into d;
 receipt:=jsonb_build_object('commandId',request_id,'draftId',d.id,'revision',d.revision,'requestHash',request_hash,'contentHash',doc_hash,
  'savedAt',to_char(saved at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'replayed',false);
 envelope:=jsonb_build_object('contractVersion','schema_draft_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('draft',public.schema_draft_json(d),'receipt',receipt));
 insert into public.schema_draft_commands(command_id,draft_id,customer_id,organizer_id,unit_id,school_year,period,actor_identity_id,assignment_id,requested_draft_id,expected_revision,request_hash,document_hash,envelope)
 values(request_id,d.id,a.customer_id,a.organizer_id,d.unit_id,d.school_year,d.period,s.identity_id,a.id,requested_draft,expected,request_hash,doc_hash,envelope);
 perform public.schema_draft_audit('schema_draft_saved',d.id,jsonb_build_object('commandId',request_id,'unitId',d.unit_id,'schoolYear',d.school_year,'revision',d.revision));
 return envelope;
end $$;
