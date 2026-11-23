-- Daterad aktivitet som frivillig del av schemautkastets oföränderliga revision.
-- Äldre v1-dokument och kvitton behåller samma innehåll och kontrollsumma.
create function public.schema_daterade_aktiviteter_valid(activities jsonb, school_year integer) returns boolean
language plpgsql immutable set search_path = pg_catalog, public as $$
declare
 activity jsonb;
 credit jsonb;
 item jsonb;
 starts integer;
 ends integer;
 duration integer;
 movement_start integer;
 activity_date date;
 target_date date;
 school_start date := make_date(school_year, 7, 1);
 school_end date := make_date(school_year + 1, 6, 30);
 uuid_pattern constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
 if jsonb_typeof(activities) is distinct from 'array' then return false;end if;
 if jsonb_array_length(activities) <> 1 then return false;end if;
 activity := activities->0;
 if not public.nationella_prov_keys(activity, array['id','name','date','startMin','endMin','classRefs','credit','credits','cancelled','moves'])
  or jsonb_typeof(activity->'id') is distinct from 'string' or not coalesce(activity->>'id' ~ uuid_pattern, false)
  or jsonb_typeof(activity->'name') is distinct from 'string' or length(activity->>'name') not between 1 and 120
  or btrim(activity->>'name') <> activity->>'name' or activity->>'name' ~ '[[:cntrl:]]'
  or not coalesce(public.phase5_programplan_integer(activity->'startMin',0,1435),false)
  or not coalesce(public.phase5_programplan_integer(activity->'endMin',5,1440),false)
  or jsonb_typeof(activity->'classRefs') is distinct from 'array' or jsonb_typeof(activity->'cancelled') is distinct from 'array'
  or jsonb_typeof(activity->'moves') is distinct from 'array' or jsonb_typeof(activity->'credits') is distinct from 'array' then return false;end if;

 starts := (activity->>'startMin')::integer;
 ends := (activity->>'endMin')::integer;
 activity_date := public.nationella_prov_date(activity->'date');
 if activity_date is null or activity_date not between school_start and school_end or starts % 5 <> 0 or ends % 5 <> 0 or ends <= starts
  or jsonb_array_length(activity->'classRefs') not between 1 and 2000 or jsonb_array_length(activity->'credits') > 20000
  or jsonb_array_length(activity->'cancelled') + jsonb_array_length(activity->'moves') > 20000 then return false;end if;
 if exists (select 1 from jsonb_array_elements(activity->'classRefs') ref
  where jsonb_typeof(ref) is distinct from 'string' or not coalesce(ref#>>'{}' ~ uuid_pattern,false))
  or exists (select 1 from jsonb_array_elements(activity->'classRefs') ref group by ref having count(*)>1) then return false;end if;

 credit := activity->'credit';
 if credit = 'null'::jsonb then
  if jsonb_array_length(activity->'credits') <> 0 then return false;end if;
 else
  if jsonb_array_length(activity->'credits') = 0 or not public.nationella_prov_keys(credit,array['ref','minutes'])
   or jsonb_typeof(credit->'ref') is distinct from 'string'
   or length(credit->>'ref') not between 1 and 2000 or btrim(credit->>'ref') <> credit->>'ref' or credit->>'ref' ~ '[[:cntrl:]]'
   or jsonb_array_length(activity->'credits') = 0
   or not coalesce(public.phase5_programplan_integer(credit->'minutes',5,ends-starts),false) then return false;end if;
  if (credit->>'minutes')::integer % 5 <> 0 then return false;end if;
 end if;
 if exists (select 1 from jsonb_array_elements(activity->'credits') ref where jsonb_typeof(ref) is distinct from 'string'
  or length(ref#>>'{}') not between 1 and 2000 or btrim(ref#>>'{}') <> ref#>>'{}' or ref#>>'{}' ~ '[[:cntrl:]]')
  or exists (select 1 from jsonb_array_elements(activity->'credits') ref group by ref having count(*)>1) then return false;end if;

 for item in select value from jsonb_array_elements(activity->'cancelled') loop
  if not public.nationella_prov_keys(item,array['lesson','originalDate'])
   or not coalesce(item->>'lesson' ~ '^pass-[0-9]{1,8}$',false)
   or item->'originalDate' is distinct from activity->'date' then return false;end if;
 end loop;
 for item in select value from jsonb_array_elements(activity->'moves') loop
  if not public.nationella_prov_keys(item,array['lesson','originalDate','date','startMin','room','durationMin'])
   or not coalesce(item->>'lesson' ~ '^pass-[0-9]{1,8}$',false) or item->'originalDate' is distinct from activity->'date'
   or (item->'room' is distinct from 'null'::jsonb and not coalesce(item->>'room' ~ '^sal-[0-9]{1,3}$',false))
   or not coalesce(public.phase5_programplan_integer(item->'startMin',0,1435),false)
   or not coalesce(public.phase5_programplan_integer(item->'durationMin',5,600),false) then return false;end if;
  target_date := public.nationella_prov_date(item->'date');
  movement_start := (item->>'startMin')::integer;
  duration := (item->>'durationMin')::integer;
  if target_date is null or target_date not between school_start and school_end
   or movement_start % 5 <> 0 or duration % 5 <> 0 or movement_start + duration > 1440 then return false;end if;
 end loop;
 return not exists (select 1 from jsonb_array_elements((activity->'cancelled') || (activity->'moves')) occurrence
  group by occurrence->>'lesson' having count(*)>1);
end $$;

revoke all on function public.schema_daterade_aktiviteter_valid(jsonb, integer) from public, anon, authenticated, service_role, skolplattform_worker;

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
  or (select count(*) from jsonb_object_keys(doc))<>12 + (case when doc ? 'datedActivities' then 1 else 0 end)
  or exists(select 1 from jsonb_object_keys(doc) k where not k=any(array['documentVersion','base','basisVillkor','workingVillkor','placements','locks','intentional','datedOverrides','datedActivities','activityTypes','control','requiresRecalculation','source']))
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
