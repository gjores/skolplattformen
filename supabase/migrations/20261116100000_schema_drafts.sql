-- Serverlagrade schemautkast, uttryckligt användarval 2026-11-16. Ingen publicering.
-- SS 12000: SIS OpenAPI 2.1.0 / SS12000:2020. Utkast/revision/kvittologg är interna objekt.
-- Stabila skolenhets- och källreferenser bevaras; motorns löpnummer gäller bara den lagrade grunden.
-- Ingen klient-/Worker-tabellrättighet ges. Grant för tre smala RPC:er ligger i egen fil.

-- Schemat bär även bråkveckor/beräknade veckominuter. Ändra inte tjänsteplanens separata heltalskontrakt.
-- Samma kanoniska form som schemaDraftCanonicalSerialize: heltal i<tal>;, bråk d<vanlig decimal>;.
create function public.schema_draft_canonical(value jsonb,depth integer default 0) returns text
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare kind text;result_text text;element jsonb;scalar_text text;scalar_number numeric;k text;
begin
 if value is null or depth is null or depth>32 then raise exception 'Invalid canonical schema value' using errcode='22023',hint='schema_draft_invalid';end if;
 kind:=jsonb_typeof(value);
 if kind='null' then return 'n';end if;
 if kind='boolean' then return case when value='true'::jsonb then 't' else 'f' end;end if;
 if kind='number' then
  scalar_number:=(value#>>'{}')::numeric;
  if abs(scalar_number)>9007199254740991 then raise exception 'Invalid canonical schema number' using errcode='22023',hint='schema_draft_invalid';end if;
  if trunc(scalar_number)=scalar_number then return 'i'||scalar_number::bigint::text||';';end if;
  return 'd'||trim_scale(scalar_number)::text||';';
 end if;
 if kind='string' then scalar_text:=value#>>'{}';return 's'||octet_length(convert_to(scalar_text,'UTF8'))::text||':'||scalar_text;end if;
 if kind='array' then
  if jsonb_array_length(value)>200000 then raise exception 'Canonical schema list too large' using errcode='22023',hint='schema_draft_invalid';end if;
  result_text:='a'||jsonb_array_length(value)::text||':';
  for element in select item.value from jsonb_array_elements(value) with ordinality item(value,position) order by item.position loop
   result_text:=result_text||public.schema_draft_canonical(element,depth+1);
  end loop;
  return result_text;
 end if;
 result_text:='o'||(select count(*) from jsonb_object_keys(value))::text||':';
 for k in select key from jsonb_object_keys(value) key order by convert_to(key,'UTF8') loop
  result_text:=result_text||'s'||octet_length(convert_to(k,'UTF8'))::text||':'||k||public.schema_draft_canonical(value->k,depth+1);
 end loop;
 return result_text;
end $$;
create function public.schema_draft_hash(value jsonb) returns text
language sql immutable security definer set search_path=pg_catalog,public as $$
 select 'sha256:'||encode(sha256(convert_to(public.schema_draft_canonical(jsonb_build_array('schema_draft_v1',value),0),'UTF8')),'hex')
$$;

create table public.schema_drafts (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null references public.customers(id), organizer_id uuid not null,
 unit_id uuid not null, school_year integer not null check(school_year between 1900 and 2200),
 period text not null check(period in ('lasar','ht','vt')), name text not null check(length(name) between 1 and 120 and name=btrim(name)),
 revision integer not null default 0 check(revision>=0),
 created_by_identity_id uuid not null references public.identities(id), created_by_assignment_id uuid not null references public.access_assignments(id),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id),
 unique(unit_id,school_year,period), unique(id,customer_id,organizer_id)
);
create table public.schema_draft_revisions (
 draft_id uuid not null, revision integer not null check(revision>0),
 customer_id uuid not null, organizer_id uuid not null,
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=8388608),
 content_hash text not null check(content_hash~'^sha256:[0-9a-f]{64}$'), source_hash text not null check(source_hash~'^sha256:[0-9a-f]{64}$'),
 actor_identity_id uuid not null references public.identities(id), assignment_id uuid not null references public.access_assignments(id),
 saved_at timestamptz not null default now(), primary key(draft_id,revision),
 foreign key(draft_id,customer_id,organizer_id) references public.schema_drafts(id,customer_id,organizer_id)
);
create table public.schema_draft_commands (
 command_id uuid primary key, draft_id uuid not null references public.schema_drafts(id),
 customer_id uuid not null references public.customers(id), organizer_id uuid not null,
 unit_id uuid not null references public.school_units(id), school_year integer not null, period text not null,
 actor_identity_id uuid not null references public.identities(id), assignment_id uuid not null references public.access_assignments(id),
 requested_draft_id uuid, expected_revision integer not null,
 request_hash text not null check(request_hash~'^sha256:[0-9a-f]{64}$'), document_hash text not null check(document_hash~'^sha256:[0-9a-f]{64}$'),
 envelope jsonb not null, created_at timestamptz not null default now()
);
alter table public.schema_drafts enable row level security;
alter table public.schema_drafts force row level security;
alter table public.schema_draft_revisions enable row level security;
alter table public.schema_draft_revisions force row level security;
alter table public.schema_draft_commands enable row level security;
alter table public.schema_draft_commands force row level security;
revoke all on public.schema_drafts,public.schema_draft_revisions,public.schema_draft_commands from public,anon,authenticated,service_role,skolplattform_worker;

create function public.schema_draft_immutable() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Schema history is immutable' using errcode='55000';end $$;
create trigger schema_draft_revisions_immutable before update or delete on public.schema_draft_revisions for each row execute function public.schema_draft_immutable();
create trigger schema_draft_commands_immutable before update or delete on public.schema_draft_commands for each row execute function public.schema_draft_immutable();

create function public.schema_draft_actor(unit uuid) returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
 a:=public.tjanst_actor('plan');
 if a.function not in ('rektor','administrator') then raise exception 'Schema draft denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);perform public.phase5_programplan_session_check();return a;
end $$;

create function public.schema_draft_scope(input jsonb,extra text[] default '{}') returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare allowed text[]:=array['contractVersion','unitId','schoolYear','period']||extra;
begin
 if input is null or jsonb_typeof(input)<>'object' or (select count(*) from jsonb_object_keys(input))<>cardinality(allowed)
  or exists(select 1 from jsonb_object_keys(input) k where not k=any(allowed))
  or input->'contractVersion'<>'1'::jsonb or not coalesce(public.phase5_programplan_integer(input->'schoolYear',1900,2200),false)
  or jsonb_typeof(input->'unitId')<>'string' or not coalesce((input->>'unitId')~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
  or input->>'period' is null or input->>'period' not in ('lasar','ht','vt') then
  raise exception 'Invalid schema draft scope' using errcode='22023',hint='schema_draft_invalid';end if;
 return jsonb_build_object('unitId',input->'unitId','schoolYear',input->'schoolYear','period',input->'period');
end $$;

create function public.schema_draft_audit(operation text,draft uuid,details jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation not in ('schema_draft_read','schema_draft_saved','schema_draft_status') or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid schema draft audit' using errcode='22023',hint='schema_draft_invalid';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'schema_draft',draft,'ok',details);
 exception when others then raise exception 'Schema draft audit unavailable' using errcode='55000';end;
end $$;

create function public.schema_draft_json(d public.schema_drafts) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',d.id,'name',d.name,'revision',r.revision,'savedAt',to_char(r.saved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'contentHash',r.content_hash,'sourceHash',r.source_hash,'document',r.document)
 from public.schema_draft_revisions r where r.draft_id=d.id and r.revision=d.revision
$$;

create function public.schema_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;a public.access_assignments;s public.app_sessions;d public.schema_drafts;result jsonb;
begin
 q:=public.schema_draft_scope(input);a:=public.schema_draft_actor((q->>'unitId')::uuid);s:=public.phase5_programplan_session_check();
 select * into d from public.schema_drafts x where x.unit_id=(q->>'unitId')::uuid and x.school_year=(q->>'schoolYear')::integer and x.period=q->>'period';
 if found and (d.customer_id,d.organizer_id) is distinct from (a.customer_id,a.organizer_id) then raise exception 'Schema draft denied' using errcode='42501';end if;
 result:=jsonb_build_object('draft',case when d.id is null then null else public.schema_draft_json(d) end);
 perform public.schema_draft_audit('schema_draft_read',d.id,jsonb_build_object('unitId',q->'unitId','schoolYear',q->'schoolYear'));
 return jsonb_build_object('contractVersion','schema_draft_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',result);
end $$;

create function public.schema_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;a public.access_assignments;s public.app_sessions;r public.schema_draft_commands;result jsonb;request_id uuid;
begin
 q:=public.schema_draft_scope(input,array['commandId','draftId']);
 begin request_id:=(input->>'commandId')::uuid;
  if request_id is null or input->'draftId' is distinct from 'null'::jsonb and (input->>'draftId')::uuid is null then raise invalid_text_representation;end if;
 exception when invalid_text_representation then raise exception 'Invalid schema command reference' using errcode='22023',hint='schema_draft_invalid';end;
 a:=public.schema_draft_actor((q->>'unitId')::uuid);s:=public.phase5_programplan_session_check();
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,6116));
 select * into r from public.schema_draft_commands where command_id=request_id;
 if not found then result:=jsonb_build_object('state','not_found','receipt',null,'draft',null);
 else
  if (r.customer_id,r.organizer_id,r.unit_id,r.school_year,r.period,r.actor_identity_id,r.assignment_id)
    is distinct from (a.customer_id,a.organizer_id,(q->>'unitId')::uuid,(q->>'schoolYear')::integer,q->>'period',s.identity_id,a.id)
    or input->'draftId'<>'null'::jsonb and r.draft_id<>(input->>'draftId')::uuid then
   raise exception 'Schema draft command changed' using errcode='40001',hint='schema_draft_command_conflict';end if;
  result:=jsonb_build_object('state','completed','receipt',r.envelope->'result'->'receipt'||jsonb_build_object('replayed',true),'draft',r.envelope->'result'->'draft');
 end if;
 perform public.schema_draft_audit('schema_draft_status',r.draft_id,jsonb_build_object('commandId',request_id,'unitId',q->'unitId','schoolYear',q->'schoolYear'));
 return jsonb_build_object('contractVersion','schema_draft_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',result);
end $$;

create function public.schema_command(input jsonb) returns jsonb
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
  or (select count(*) from jsonb_object_keys(doc))<>12
  or exists(select 1 from jsonb_object_keys(doc) k where not k=any(array['documentVersion','base','basisVillkor','workingVillkor','placements','locks','intentional','datedOverrides','activityTypes','control','requiresRecalculation','source']))
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

revoke all on function public.schema_draft_canonical(jsonb,integer),public.schema_draft_hash(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_draft_immutable() from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_draft_actor(uuid) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_draft_scope(jsonb,text[]) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_draft_audit(text,uuid,jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_draft_json(public.schema_drafts) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_read(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_command(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
revoke all on function public.schema_status(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
