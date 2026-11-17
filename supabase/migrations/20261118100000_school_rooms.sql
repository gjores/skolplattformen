-- Skolans salregister (05.2-SM-UXF-23), användarbeslut 2026-11-17: salar är en konstant per skolenhet som alltid finns i schemat.
-- Huvudman, rektor och administratör med mandat för skolenheten får läsa och ändra. Ingen klient-/Worker-tabellrättighet;
-- grant för två smala RPC:er ligger i egen fil.
-- SS 12000 (SIS OpenAPI 2.1.0 / SS12000:2020) `Room`: namn → displayName, platser → seatingCapacity, skolenheten → ägande organisation.
-- (skolenhet, sal-N) är stabilt och räcker för ett deterministiskt UUID vid utbyte. Saltyp och utrustning är interna.

create table public.school_room_registers (
 unit_id uuid primary key, customer_id uuid not null references public.customers(id), organizer_id uuid not null,
 revision integer not null check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object' and octet_length(document::text)<=262144),
 content_hash text not null check(content_hash~'^sha256:[0-9a-f]{64}$'),
 updated_at timestamptz not null default now(),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
create table public.school_room_register_revisions (
 unit_id uuid not null references public.school_room_registers(unit_id), revision integer not null check(revision>0),
 customer_id uuid not null, organizer_id uuid not null,
 command_id uuid not null unique, expected_revision integer not null check(expected_revision>=0),
 document jsonb not null, content_hash text not null check(content_hash~'^sha256:[0-9a-f]{64}$'),
 actor_identity_id uuid not null references public.identities(id), assignment_id uuid not null references public.access_assignments(id),
 saved_at timestamptz not null default now(), primary key(unit_id,revision)
);
alter table public.school_room_registers enable row level security;
alter table public.school_room_registers force row level security;
alter table public.school_room_register_revisions enable row level security;
alter table public.school_room_register_revisions force row level security;
revoke all on public.school_room_registers,public.school_room_register_revisions from public,anon,authenticated,service_role,skolplattform_worker;
create function public.school_rooms_immutable() returns trigger language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'School rooms history is immutable' using errcode='55000';end $$;
create trigger school_room_register_revisions_immutable before update or delete on public.school_room_register_revisions
 for each row execute function public.school_rooms_immutable();
-- Innehållets hash: PostgreSQL:s normaliserade jsonb-text. Används bara för att känna igen ett upprepat kommando.
create function public.school_rooms_hash(doc jsonb) returns text
language sql immutable security definer set search_path=pg_catalog,public as $$
 select 'sha256:'||encode(sha256(convert_to(doc::text,'UTF8')),'hex')
$$;

-- Aktören: färsk session och korrelation (tjanst_actor), en av tre funktioner och mandat för just skolenheten.
create function public.school_rooms_actor(unit uuid) returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
 a:=public.tjanst_actor('plan');
 if a.function not in ('huvudman','rektor','administrator') then raise exception 'School rooms denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);perform public.phase5_programplan_session_check();return a;
end $$;

create function public.school_rooms_unit(input jsonb,extra text[] default '{}') returns uuid
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare allowed text[]:=array['contractVersion','unitId']||extra;
begin
 if input is null or jsonb_typeof(input)<>'object' or (select count(*) from jsonb_object_keys(input))<>cardinality(allowed)
  or exists(select 1 from jsonb_object_keys(input) k where not k=any(allowed)) or input->'contractVersion'<>'1'::jsonb
  or jsonb_typeof(input->'unitId')<>'string' or not coalesce((input->>'unitId')~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false) then
  raise exception 'Invalid school rooms request' using errcode='22023',hint='school_rooms_invalid';end if;
 return (input->>'unitId')::uuid;
end $$;

-- Samma regler som parseSalregister i appen, utan `arv`: högst 100 salar, stabila sal-N under `nasta`, unika namn utan hänsyn till skiftläge.
create function public.school_rooms_valid_text(value jsonb,max integer,empty boolean default false) returns boolean
language sql immutable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_typeof(value)='string' and value#>>'{}'=btrim(value#>>'{}') and length(value#>>'{}')<=max
  and (empty or length(value#>>'{}')>0) and (value#>>'{}')!~'[[:cntrl:]]',false)
$$;
create function public.school_rooms_valid(doc jsonb) returns boolean
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare s jsonb;n integer;nasta integer;ids text[]:='{}';names text[]:='{}';tags text[];t jsonb;
begin
 if doc is null or jsonb_typeof(doc)<>'object' or (select count(*) from jsonb_object_keys(doc))<>2 or not (doc?'nasta' and doc?'salar')
  or not coalesce(public.phase5_programplan_integer(doc->'nasta',1,1000),false) or jsonb_typeof(doc->'salar')<>'array' or jsonb_array_length(doc->'salar')>100 then return false;end if;
 nasta:=(doc->>'nasta')::integer;
 for s in select x from jsonb_array_elements(doc->'salar') x loop
  if jsonb_typeof(s)<>'object' or (select count(*) from jsonb_object_keys(s))<>5 or not (s?'id' and s?'name' and s?'typ' and s?'platser' and s?'utrustning')
   or jsonb_typeof(s->'id')<>'string' or (s->>'id')!~'^sal-[1-9][0-9]{0,2}$'
   or not public.school_rooms_valid_text(s->'name',60) or not public.school_rooms_valid_text(s->'typ',40,true)
   or (s->'platser'<>'null'::jsonb and not coalesce(public.phase5_programplan_integer(s->'platser',1,2000),false))
   or jsonb_typeof(s->'utrustning')<>'array' or jsonb_array_length(s->'utrustning')>12 then return false;end if;
  n:=substr(s->>'id',5)::integer;
  if n>=nasta or s->>'id'=any(ids) or lower(s->>'name')=any(names) then return false;end if;
  ids:=ids||(s->>'id');names:=names||lower(s->>'name');tags:='{}';
  for t in select x from jsonb_array_elements(s->'utrustning') x loop
   if not public.school_rooms_valid_text(t,40) or lower(t#>>'{}')=any(tags) then return false;end if;
   tags:=tags||lower(t#>>'{}');
  end loop;
 end loop;
 return true;
end $$;

create function public.school_rooms_audit(operation text,unit uuid,details jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation not in ('school_rooms_read','school_rooms_saved') or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid school rooms audit' using errcode='22023',hint='school_rooms_invalid';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'school_rooms',unit,'ok',details);
 exception when others then raise exception 'School rooms audit unavailable' using errcode='55000';end;
end $$;

create function public.school_rooms_json(r public.school_room_registers) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select case when r.unit_id is null then null else jsonb_build_object('revision',r.revision,'contentHash',r.content_hash,
  'savedAt',to_char(r.updated_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'document',r.document) end
$$;

create function public.school_rooms_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare unit uuid;a public.access_assignments;s public.app_sessions;r public.school_room_registers;
begin
 unit:=public.school_rooms_unit(input);a:=public.school_rooms_actor(unit);s:=public.phase5_programplan_session_check();
 select * into r from public.school_room_registers x where x.unit_id=unit;
 if found and (r.customer_id,r.organizer_id) is distinct from (a.customer_id,a.organizer_id) then raise exception 'School rooms denied' using errcode='42501';end if;
 perform public.school_rooms_audit('school_rooms_read',unit,jsonb_build_object('unitId',unit,'revision',coalesce(r.revision,0)));
 return jsonb_build_object('contractVersion','school_rooms_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('register',public.school_rooms_json(r)));
end $$;

-- Optimistisk revision: väntad revision måste vara den aktuella (0 för ett nytt register). Samma kommando ger samma kvitto.
create function public.school_rooms_save(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare unit uuid;a public.access_assignments;s public.app_sessions;r public.school_room_registers;old public.school_room_register_revisions;
 request_id uuid;expected integer;doc jsonb;doc_hash text;saved timestamptz;
begin
 unit:=public.school_rooms_unit(input,array['commandId','expectedRevision','document']);
 begin request_id:=(input->>'commandId')::uuid;
 exception when invalid_text_representation then raise exception 'Invalid school rooms command' using errcode='22023',hint='school_rooms_invalid';end;
 if request_id is null or not coalesce(public.phase5_programplan_integer(input->'expectedRevision',0,2147483646),false) or not public.school_rooms_valid(input->'document') then
  raise exception 'Invalid school rooms command' using errcode='22023',hint='school_rooms_invalid';end if;
 expected:=(input->>'expectedRevision')::integer;doc:=input->'document';doc_hash:=public.school_rooms_hash(doc);
 a:=public.school_rooms_actor(unit);s:=public.phase5_programplan_session_check();
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,6118));
 select * into old from public.school_room_register_revisions where command_id=request_id;
 if found then
  if (old.unit_id,old.customer_id,old.organizer_id,old.actor_identity_id,old.assignment_id,old.expected_revision,old.content_hash)
   is distinct from (unit,a.customer_id,a.organizer_id,s.identity_id,a.id,expected,doc_hash) then
   raise exception 'School rooms command changed' using errcode='40001',hint='school_rooms_command_conflict';end if;
  return jsonb_build_object('contractVersion','school_rooms_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
   'result',jsonb_build_object('register',jsonb_build_object('revision',old.revision,'contentHash',old.content_hash,
    'savedAt',to_char(old.saved_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'document',old.document),'replayed',true));
 end if;
 perform pg_advisory_xact_lock(hashtextextended(unit::text,6119));
 select * into r from public.school_room_registers x where x.unit_id=unit for update;
 if found and (r.customer_id,r.organizer_id) is distinct from (a.customer_id,a.organizer_id) then raise exception 'School rooms denied' using errcode='42501';end if;
 if coalesce(r.revision,0)<>expected then raise exception 'School rooms revision conflict' using errcode='40001',hint='school_rooms_conflict';end if;
 -- Ett nummer återanvänds aldrig: nasta får inte minska.
 if found and (doc->>'nasta')::integer<(r.document->>'nasta')::integer then
  raise exception 'Invalid school rooms command' using errcode='22023',hint='school_rooms_invalid';end if;
 saved:=clock_timestamp();
 if found then update public.school_room_registers set revision=revision+1,document=doc,content_hash=doc_hash,updated_at=saved where unit_id=unit returning * into r;
 else insert into public.school_room_registers(unit_id,customer_id,organizer_id,revision,document,content_hash,updated_at)
  values(unit,a.customer_id,a.organizer_id,1,doc,doc_hash,saved) returning * into r;end if;
 insert into public.school_room_register_revisions(unit_id,revision,customer_id,organizer_id,command_id,expected_revision,document,content_hash,actor_identity_id,assignment_id,saved_at)
  values(unit,r.revision,a.customer_id,a.organizer_id,request_id,expected,doc,doc_hash,s.identity_id,a.id,saved);
 perform public.school_rooms_audit('school_rooms_saved',unit,jsonb_build_object('commandId',request_id,'unitId',unit,'revision',r.revision));
 return jsonb_build_object('contractVersion','school_rooms_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('register',public.school_rooms_json(r),'replayed',false));
end $$;

revoke all on function public.school_rooms_immutable(),public.school_rooms_hash(jsonb),public.school_rooms_actor(uuid),public.school_rooms_unit(jsonb,text[]),public.school_rooms_valid_text(jsonb,integer,boolean),
 public.school_rooms_valid(jsonb),public.school_rooms_audit(text,uuid,jsonb),public.school_rooms_json(public.school_room_registers),
 public.school_rooms_read(jsonb),public.school_rooms_save(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
