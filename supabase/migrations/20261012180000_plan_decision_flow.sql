-- Protected plan decisions: additive review state, immutable history/receipts,
-- exact saved-content CAS and server roles. No permanent Worker grants here.
alter table public.point_plans add column decided_identity_id uuid references public.identities(id);
alter table public.timplans add column decided_identity_id uuid references public.identities(id);
create table public.plan_decision_reviews (
 kind text not null check(kind in ('programplan','timplan')),
 plan_id uuid not null,
 programplan_id uuid references public.point_plans(id) on delete cascade,
 timplan_id uuid references public.timplans(id) on delete cascade,
 stage text not null check(stage in ('draft','submitted','returned','approved','replaced')),
 revision integer not null default 0 check(revision>=0),
 primary key(kind,plan_id),
 check((kind='programplan' and programplan_id is not null and programplan_id=plan_id and timplan_id is null)
    or (kind='timplan' and timplan_id is not null and timplan_id=plan_id and programplan_id is null))
);
create table public.plan_decision_history (
 id uuid primary key default gen_random_uuid(), kind text not null check(kind in ('programplan','timplan')),
 plan_id uuid not null, organizer_id uuid not null references public.organizers(id),
 action text not null check(action in ('submit','return','approve','withdraw')),
 plan_revision integer not null, decision_revision integer not null,
 basis_hash text not null check(basis_hash ~ '^sha256:[0-9a-f]{64}$'),
 actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 actor_name text not null, comment text not null check(length(comment)<=2000),
 confirmed_checks jsonb not null check(jsonb_typeof(confirmed_checks)='array'),
 occurred_at timestamptz not null default clock_timestamp()
);
create index plan_decision_history_plan on public.plan_decision_history(kind,plan_id,occurred_at,id);
create table public.plan_decision_receipts (
 command_id uuid primary key, kind text not null check(kind in ('programplan','timplan')),
 plan_id uuid not null, organizer_id uuid not null references public.organizers(id),
 actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 request jsonb not null, result jsonb not null,
 created_at timestamptz not null default clock_timestamp()
);
-- Only the security-definer command can create these exact, transaction-local
-- permissions. Unlike a user-settable GUC, an ordinary caller cannot forge one.
create table public.plan_decision_write_permits (
 transaction_id bigint not null, backend_id integer not null,
 kind text not null check(kind in ('programplan','timplan')),plan_id uuid not null,
 old_status text not null,new_status text not null,old_revision integer not null,
 primary key(transaction_id,backend_id,kind,plan_id)
);
alter table public.plan_decision_reviews enable row level security;
alter table public.plan_decision_history enable row level security;
alter table public.plan_decision_receipts enable row level security;
alter table public.plan_decision_write_permits enable row level security;
revoke all on public.plan_decision_reviews,public.plan_decision_history,public.plan_decision_receipts,public.plan_decision_write_permits
 from public,anon,authenticated,service_role,skolplattform_worker;

create function public.phase5_plan_decision_immutable() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin raise exception 'Immutable plan decision evidence' using errcode='42501';end $$;
create trigger plan_decision_history_immutable before update or delete on public.plan_decision_history
 for each row execute function public.phase5_plan_decision_immutable();
create trigger plan_decision_history_no_truncate before truncate on public.plan_decision_history
 for each statement execute function public.phase5_plan_decision_immutable();
create trigger plan_decision_receipts_immutable before update or delete on public.plan_decision_receipts
 for each row execute function public.phase5_plan_decision_immutable();
create trigger plan_decision_receipts_no_truncate before truncate on public.plan_decision_receipts
 for each statement execute function public.phase5_plan_decision_immutable();

create function public.phase5_plan_decision_permitted(target_kind text,target_id uuid,previous_status text,next_status text,previous_revision integer)
returns boolean language sql volatile security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.plan_decision_write_permits w
 where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid()
 and w.kind=target_kind and w.plan_id=target_id and w.old_status=previous_status
 and w.new_status=next_status and w.old_revision=previous_revision)
$$;
create function public.phase5_plan_decision_source_content(source jsonb) returns jsonb
language sql immutable set search_path=pg_catalog as $$
 select source-'revision'-'status'-'educationRevision'-'archived'
$$;
create function public.phase5_plan_decision_audit(target_kind text,target_id uuid,operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation not in ('plan_decision_basis_read','plan_decision_command','plan_decision_inbox_read')
 or (operation='plan_decision_inbox_read' and (target_kind is not null or target_id is not null))
 or (operation<>'plan_decision_inbox_read' and (target_kind not in ('programplan','timplan') or target_id is null)) then
 raise exception 'Invalid decision audit' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,
 session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,
 s.id,a.membership_id,a.id,a.customer_id,operation,coalesce(target_kind,'plan_decision_collection'),target_id,'ok','{}'::jsonb);
 exception when others then raise exception 'Plan decision audit unavailable' using errcode='55000';end;
end $$;

-- Readiness includes only the known Gy25 higher-education-preparatory profile.
-- A checkbox cannot override unknown or incomplete national source data.
create function public.phase5_plan_decision_source_blockers(source jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare issues jsonb:='[]';catalog jsonb;program jsonb;started date;
begin
 if source is null or source='null'::jsonb or source->'basisReference' is null or source->'basisReference'='null'::jsonb then
 return jsonb_build_array('Programplanen saknar ett versionsbundet underlag.');end if;
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select value into program from jsonb_array_elements(catalog->'programs')
 where value->>'code'=source->'basisReference'->'programRef'->>'code'
 and value->'version'=source->'basisReference'->'programRef'->'version';
 begin started:=(source->'basisReference'->>'startedOn')::date;
 exception when others then started:=null;end;
 if program is null or program->>'category' is distinct from 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION'
 or program->>'code' !~ '25$' or started is null or started<date '2025-07-01'
 or program->>'startDate' is null or started<(program->>'startDate')::date
 or (program->>'endDate' is not null and started>(program->>'endDate')::date)
 or (program->>'canceledDate' is not null and started>=(program->>'canceledDate')::date) then
 issues:=issues||jsonb_build_array('Beslutsreglerna är inte verifierade för den här programtypen och elevkullen.');end if;
 begin
  perform public.phase5_gym_timplan_require_source(source||jsonb_build_object('status','utkast','archived',false));
 exception when sqlstate '22023' or sqlstate '40001' then
  issues:=issues||jsonb_build_array('Programplanens ämnen, poängram och terminsfördelning måste vara fullständiga.');
 end;
 return issues;
end $$;

-- Internal projection takes the same existing scope locks as writes. Read
-- callers are scoped first; no plan names or history are returned on denial.
create function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;
begin
 if target_kind is null or target_kind not in ('programplan','timplan') or target_id is null then
 raise exception 'Invalid plan decision read' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();
 if target_kind='programplan' then
  o:=public.phase5_programplan_scope(target_id);
  select * into p from public.point_plans where id=target_id for update;
  o:=public.phase5_programplan_scope(target_id);a:=public.phase5_programplan_actor();
  source:=public.phase5_gym_timplan_source(p.id);current_source:=source;
  stage:=case p.status when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  revision:=p.revision;version:=p.version;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if p.status='utkast' and review.stage in ('submitted','returned') then stage:=review.stage;end if;
  can_write:=a.function in ('huvudman','rektor') and o.archived_at is null
   and public.phase5_programplan_phase(o)='framtida'
   and not exists(select 1 from public.offering_units ou where ou.offering_id=o.id
    and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id));
  if can_write then
   if stage in ('draft','returned') and a.function='rektor' then actions:='["submit"]';end if;
   if stage='submitted' and a.function='rektor' then actions:='["withdraw"]';end if;
   if stage in ('draft','returned') and a.function='huvudman' then actions:='["approve"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  if public.phase5_programplan_phase(o)<>'framtida' then blockers:=blockers||jsonb_build_array('Programplanen är låst eftersom elevkullen har startat eller startläget är okänt.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','structure','label','Jag har granskat att programstruktur, nivåer och terminsordning gäller elevkullen.'),
   jsonb_build_object('id','choices','label','Jag har granskat att alternativa ämnen och valbara ramar ger varje elev en fullständig studiegång.'));
 else
  select * into t from public.timplans where id=target_id;
  if t.id is null or t.gym_basis is null then raise exception 'Plan decision denied' using errcode='42501';end if;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);
  -- Keep established program-before-timplan order, including concurrent source decisions.
  perform 1 from public.point_plans where id=t.source_programplan_id for update;
  select * into t from public.timplans where id=target_id for update;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);a:=public.phase5_programplan_actor();
  source:=t.gym_basis;current_source:=public.phase5_gym_timplan_source(t.source_programplan_id);
  revision:=t.revision;version:=t.version;unit_id:=t.unit_id;
  select name into school_name from public.school_units where id=t.unit_id;
  stage:=case t.status when 'forslag' then 'submitted' when 'atersand' then 'returned' when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if o.archived_at is null then
   if stage in ('draft','returned') and a.function in ('rektor','administrator') then actions:='["submit"]';end if;
   if stage='submitted' and a.function in ('rektor','administrator') then actions:='["withdraw"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('rowKey',c.row_id,'hours',
   (select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)) order by c.row_id),'[]')
   into hours from public.timplan_cells c where c.timplan_id=t.id;
  select coalesce(sum(c.hours[n]),0),coalesce(bool_or((d->'points'->>(n-1))::integer>0 and not c.allocated[n]),false)
   into total_hours,missing from public.timplan_cells c
   cross join lateral jsonb_array_elements(t.gym_basis->'distribution') d cross join generate_series(1,6) n
   where c.timplan_id=t.id and d->>'rowKey'=c.row_id;
  if jsonb_array_length(hours)<>jsonb_array_length(source->'rows') or missing
   or exists(select 1 from public.timplan_cells c where c.timplan_id=t.id and (select coalesce(sum(v),0) from unnest(c.hours) v)=0) then
   blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
  if total_hours<2180 then blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än 2 180 planerade undervisningstimmar.');end if;
  if current_source->>'status' is distinct from 'faststalld' then blockers:=blockers||jsonb_build_array('Huvudmannen behöver först fastställa timplanens programplansversion.');end if;
  if public.phase5_plan_decision_source_content(source) is distinct from public.phase5_plan_decision_source_content(current_source) then
   blockers:=blockers||jsonb_build_array('Programplanens innehåll har ändrats. Skapa en ny timplansversion från det aktuella underlaget.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','teacher-led','label','Jag har granskat att timmarna avser undervisning och att annan aktivitet inte räknas som undervisningstid.'),
   jsonb_build_object('id','choice-paths','label','Jag har granskat att alla möjliga ämnesval och alternativa studiegångar får minst den garanterade undervisningstiden.'));
  source_info:='Programplan version '||(source->>'version')||' · fryst revision '||(source->>'revision');
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules','gy25-higher-education-2026-10-12-v1',
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog,'hours',hours);
end $$;

create function public.phase5_plan_decision_basis(kind text,plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare result jsonb;
begin result:=public.phase5_plan_decision_detail(kind,plan_id);
 perform public.phase5_plan_decision_audit(kind,plan_id,'plan_decision_basis_read');return result;end $$;

create function public.phase5_plan_decision_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare target_kind text;target_id uuid;command_id uuid;operation text;comment_text text;
 a public.access_assignments;s public.app_sessions;basis jsonb;result jsonb;receipt public.plan_decision_receipts;
 o public.offerings;p public.point_plans;t public.timplans;prior record;next_stage text;next_status text;
 decision_revision integer;actor_name text;item jsonb;confirmed jsonb;expected_checks jsonb;
begin
 if not public.phase5_programplan_shape(input,array['kind','planId','commandId','action','expectedRevision','expectedDecisionRevision','basisHash','comment','confirmedChecks'])
 or input->>'kind' not in ('programplan','timplan') or input->>'action' not in ('submit','return','approve','withdraw')
 or jsonb_typeof(input->'kind') is distinct from 'string' or jsonb_typeof(input->'action') is distinct from 'string'
 or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483646)
 or not public.phase5_programplan_integer(input->'expectedDecisionRevision',0,2147483646)
 or jsonb_typeof(input->'basisHash') is distinct from 'string' or input->>'basisHash' !~ '^sha256:[0-9a-f]{64}$'
 or jsonb_typeof(input->'comment') is distinct from 'string' or length(input->>'comment')>2000
 or (input->>'comment') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
 or not public.phase5_programplan_array(input->'confirmedChecks',20) then
 raise exception 'Invalid plan decision command' using errcode='22023';end if;
 target_kind:=input->>'kind';target_id:=(input->>'planId')::uuid;command_id:=(input->>'commandId')::uuid;
 if target_id is null or command_id is null then raise exception 'Invalid plan decision identity' using errcode='22023';end if;
 operation:=input->>'action';comment_text:=btrim(input->>'comment');confirmed:=input->'confirmedChecks';
 if operation='return' and comment_text='' then raise exception 'Return reason required' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(confirmed) c where jsonb_typeof(c)<>'string' or (c#>>'{}')!~'^[a-z][a-z0-9-]{0,79}$')
 or (select count(*) from jsonb_array_elements(confirmed))<>(select count(distinct c) from jsonb_array_elements(confirmed) c) then
 raise exception 'Invalid decision controls' using errcode='22023';end if;
 -- This obtains current session/customer/school/source/plan locks before both
 -- receipt replay and mutation. Recalled authority never replays a receipt.
 basis:=public.phase5_plan_decision_detail(target_kind,target_id);
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 select * into o from public.offerings where id=(basis->>'offeringId')::uuid;
 select * into receipt from public.plan_decision_receipts r where r.command_id=phase5_plan_decision_command.command_id;
 if found then
  if receipt.kind<>target_kind or receipt.plan_id<>target_id or receipt.organizer_id<>o.organizer_id
   or receipt.actor_identity_id<>s.identity_id or receipt.assignment_id<>a.id or receipt.request<>input then
   raise exception 'Decision command conflict' using errcode='40001',hint='plan_decision_conflict';end if;
  if target_kind='programplan' and exists(select 1 from public.offering_units ou where ou.offering_id=o.id
   and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
   raise exception 'Plan decision replay denied' using errcode='42501';end if;
  perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');return receipt.result;
 end if;
 if (basis->>'revision')::integer<>(input->>'expectedRevision')::integer
 or (basis->>'decisionRevision')::integer<>(input->>'expectedDecisionRevision')::integer
 or basis->>'basisHash'<>input->>'basisHash' then
 raise exception 'Plan decision changed' using errcode='40001',hint='plan_decision_conflict';end if;
 if not (basis->'actions' ? operation) then raise exception 'Plan decision denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(c->'id' order by c->>'id'),'[]') into expected_checks from jsonb_array_elements(basis->'checks') c;
 if exists(select 1 from jsonb_array_elements(confirmed) c where not (expected_checks @> jsonb_build_array(c))) then
 raise exception 'Unknown decision control' using errcode='22023';end if;
 if operation in ('submit','approve') and (jsonb_array_length(basis->'blockers')>0 or not(confirmed @> expected_checks)) then
 raise exception 'Plan decision needs correction' using errcode='40001',hint='plan_decision_blocked';end if;
 next_stage:=case operation when 'submit' then 'submitted' when 'return' then 'returned' when 'approve' then 'approved' when 'withdraw' then 'draft' end;
 decision_revision:=(basis->>'decisionRevision')::integer+1;
 if target_kind='programplan' then
  perform public.phase5_programplan_writable(o,operation in ('return','approve'));
  select * into p from public.point_plans where id=target_id for update;
  if operation='approve' then
   for prior in select q.id,q.status,q.revision from public.point_plans q where q.offering_id=o.id and q.organizer_id=o.organizer_id and q.status='faststalld' and q.id<>p.id order by q.id for update loop
    insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'programplan',prior.id,'faststalld','ersatt',prior.revision);
    update public.point_plans set status='ersatt',revision=revision+1 where id=prior.id;
    delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='programplan' and plan_id=prior.id;
   end loop;
   insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'programplan',p.id,'utkast','faststalld',p.revision);
   update public.point_plans set status='faststalld',revision=revision+1,decided_on=public.phase5_programplan_today(),decided_identity_id=s.identity_id where id=p.id;
   delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='programplan' and plan_id=p.id;
  end if;
 else
  select * into t from public.timplans where id=target_id for update;
  if o.archived_at is not null then raise exception 'Archived decision denied' using errcode='42501';end if;
  if operation='approve' then
   for prior in select q.id,q.status,q.revision from public.timplans q where q.offering_id=o.id and q.unit_id=t.unit_id and q.organizer_id=o.organizer_id and q.status='faststalld' and q.id<>t.id order by q.id for update loop
    insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'timplan',prior.id,'faststalld','ersatt',prior.revision);
    update public.timplans set status='ersatt',revision=revision+1 where id=prior.id;
    delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='timplan' and plan_id=prior.id;
   end loop;
  end if;
  next_status:=case operation when 'submit' then 'forslag' when 'return' then 'atersand' when 'approve' then 'faststalld' when 'withdraw' then 'utkast' end;
  insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'timplan',t.id,t.status::text,next_status,t.revision);
  update public.timplans set status=next_status::public.timplan_status,revision=revision+1,
   decided_on=case when operation='approve' then public.phase5_programplan_today() else decided_on end,
   decided_identity_id=case when operation='approve' then s.identity_id else decided_identity_id end where id=t.id;
  delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='timplan' and plan_id=t.id;
 end if;
 insert into public.plan_decision_reviews(kind,plan_id,programplan_id,timplan_id,stage,revision)
 values(target_kind,target_id,case when target_kind='programplan' then target_id end,case when target_kind='timplan' then target_id end,next_stage,decision_revision)
 on conflict(kind,plan_id) do update set stage=excluded.stage,revision=excluded.revision;
 select coalesce(nullif(btrim(i.display_name),''),case a.function when 'huvudman' then 'Huvudman' when 'rektor' then 'Rektor' else 'Skoladministratör' end)
 into actor_name from public.identities i where i.id=s.identity_id;
 insert into public.plan_decision_history(kind,plan_id,organizer_id,action,plan_revision,decision_revision,basis_hash,actor_identity_id,assignment_id,actor_name,comment,confirmed_checks)
 values(target_kind,target_id,o.organizer_id,operation,(basis->>'revision')::integer,decision_revision,basis->>'basisHash',s.identity_id,a.id,actor_name,comment_text,confirmed);
 result:=public.phase5_plan_decision_detail(target_kind,target_id);
 insert into public.plan_decision_receipts(command_id,kind,plan_id,organizer_id,actor_identity_id,assignment_id,request,result)
 values(command_id,target_kind,target_id,o.organizer_id,s.identity_id,a.id,input,result);
 perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');return result;
end $$;

create function public.phase5_plan_decision_inbox() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;entry record;detail jsonb;item jsonb;items jsonb:='[]';
 task text;total integer:=0;action_count integer:=0;decision_count integer:=0;
begin
 a:=public.phase5_programplan_actor();
 for entry in
  select 'programplan'::text kind,p.id,p.offering_id,o.name,0 rank
   from public.point_plans p join public.offerings o on o.id=p.offering_id and o.organizer_id=p.organizer_id
   where p.status='utkast' and o.kind='gymnasium' and o.organizer_id=a.organizer_id
   and exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.unit_id=ou.unit_id and m.assignment_id=a.id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id)
  union all
  select 'timplan',t.id,t.offering_id,o.name,1
   from public.timplans t join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
   where t.gym_basis is not null and t.status in ('utkast','forslag','atersand') and o.organizer_id=a.organizer_id
   and exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.unit_id=ou.unit_id and m.assignment_id=a.id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id and ou.unit_id=t.unit_id)
  order by rank,name,id
 loop
  detail:=public.phase5_plan_decision_detail(entry.kind,entry.id);
  task:=case
   when detail->>'stage'='submitted' and a.function='huvudman' and detail->'actions' ? 'return' then 'review'
   when detail->>'stage'='returned' and detail->'actions' ? 'submit' then 'revise'
   when detail->>'stage'='draft' and detail->'actions' ? 'submit' then 'prepare'
   when a.function='huvudman' and detail->'actions' ? 'approve' and jsonb_array_length(detail->'blockers')=0 then 'review'
   when jsonb_array_length(detail->'blockers')>0 then 'blocked'
   else 'waiting' end;
  item:=jsonb_build_object('kind',detail->'kind','planId',detail->'planId','offeringId',detail->'offeringId',
   'unitId',detail->'unitId','educationName',detail->'educationName','schoolName',detail->'schoolName',
   'version',detail->'version','stage',detail->'stage','nextActor',detail->'nextActor','task',task);
  total:=total+1;
  if task in ('prepare','review','revise') then action_count:=action_count+1;end if;
  if task='review' then decision_count:=decision_count+1;end if;
  if total<=500 then items:=items||jsonb_build_array(item);end if;
 end loop;
 perform public.phase5_plan_decision_audit(null,null,'plan_decision_inbox_read');
 return jsonb_build_object('items',items,'actionCount',action_count,'decisionCount',decision_count,'total',total,'truncated',total>500);
end $$;

-- Preserve the latest program block/clone guard, adding only closed decision transitions.
CREATE OR REPLACE FUNCTION public.phase5_programplan_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare o public.offerings; choices text[]; additions jsonb; source_id uuid; source public.point_plans;
begin
 if tg_op='UPDATE' and public.phase5_plan_decision_permitted('programplan',old.id,old.status::text,new.status::text,old.revision) then
  if (to_jsonb(new)-'status'-'revision'-'decided_on'-'decided_identity_id'-'updated_at')
   is distinct from (to_jsonb(old)-'status'-'revision'-'decided_on'-'decided_identity_id'-'updated_at')
   or new.revision<>old.revision+1
   or not ((old.status='utkast' and new.status='faststalld' and new.decided_on is not distinct from public.phase5_programplan_today()
     and new.decided_identity_id is not distinct from public.current_identity_id())
    or (old.status='faststalld' and new.status='ersatt' and new.decided_on is not distinct from old.decided_on
     and new.decided_identity_id is not distinct from old.decided_identity_id)) then
   raise exception 'Invalid program decision transition' using errcode='42501';end if;
  return new;
 end if;
 if (tg_op='INSERT' and new.decided_identity_id is not null)
 or (tg_op='UPDATE' and new.decided_identity_id is distinct from old.decided_identity_id) then
  raise exception 'Program decision identity locked' using errcode='42501';end if;
 if tg_op='UPDATE' and exists(select 1 from public.plan_decision_reviews r where r.kind='programplan' and r.plan_id=old.id and r.stage='submitted')
 and (to_jsonb(new)-'updated_at') is distinct from (to_jsonb(old)-'updated_at') then
  raise exception 'Programplan submitted for review' using errcode='42501',hint='programplan_submitted';end if;
 if tg_op='UPDATE' and old.catalog_id is not null then
  if new.id is distinct from old.id or new.organizer_id is distinct from old.organizer_id or new.offering_id is distinct from old.offering_id
   or new.version is distinct from old.version or new.catalog_id is distinct from old.catalog_id or new.status is distinct from old.status
   or new.decided_on is distinct from old.decided_on or new.decided_by is distinct from old.decided_by or new.created_by is distinct from old.created_by
   or new.created_at is distinct from old.created_at or new.catalog_fetched is distinct from old.catalog_fetched
   or (new.basis_reference-'specializationRefs'-'startedOn'-'choiceBlocks') is distinct from (old.basis_reference-'specializationRefs'-'startedOn'-'choiceBlocks') then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if old.status<>'utkast' and (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization or new.revision is distinct from old.revision) then
   raise exception 'Programplan version locked' using errcode='42501'; end if;
  if (new.basis_reference is distinct from old.basis_reference or new.specialization is distinct from old.specialization) and new.revision<>old.revision+1 then
   raise exception 'Programplan revision required' using errcode='40001'; end if;
  if new.revision<old.revision then raise exception 'Programplan revision conflict' using errcode='40001'; end if;
 end if;
 if new.catalog_id is null and new.basis_reference is null then return new; end if;
 if new.catalog_id is null or new.basis_reference is null or new.catalog_id is distinct from new.basis_reference->>'catalogId' then raise exception 'Invalid programplan binding' using errcode='22023'; end if;
 if tg_op='INSERT' or old.catalog_id is null or old.basis_reference ? 'choiceBlocks' then
  perform public.phase5_programplan_require_current_shape(new.basis_reference);
 end if;
 if (tg_op='INSERT' or old.catalog_id is null) and (new.status<>'utkast' or new.decided_on is not null or new.decided_by is not null) then
  raise exception 'Programplan version locked' using errcode='42501'; end if;
 select * into o from public.offerings where id=new.offering_id and organizer_id=new.organizer_id and kind='gymnasium';
 if not found then raise exception 'Programplan denied' using errcode='42501'; end if;
 if tg_op='UPDATE' then
  -- Retaining a source block in this version is not introduction of a new identity.
  select coalesce(jsonb_agg(b),'[]'::jsonb) into additions from jsonb_array_elements(coalesce(new.basis_reference->'choiceBlocks','[]'::jsonb)) b
   where not exists(select 1 from jsonb_array_elements(coalesce(old.basis_reference->'choiceBlocks','[]'::jsonb)) prior where prior->>'id'=b->>'id');
  perform public.phase5_programplan_require_unused_block_ids(new.offering_id,new.basis_reference||jsonb_build_object('choiceBlocks',additions));
 else
  begin source_id:=nullif(current_setting('app.programplan_clone_source',true),'')::uuid;
  exception when invalid_text_representation then raise exception 'Invalid programplan clone context' using errcode='22023';end;
  if source_id is null then
   perform public.phase5_programplan_require_unused_block_ids(new.offering_id,new.basis_reference);
  else
   -- The clone command sets this only after source, mandate, status and CAS checks.
   -- Verify the complete preserved source contents rather than trusting the GUC value.
   select * into source from public.point_plans where id=source_id for update;
   if not found or source.status not in ('faststalld','ersatt') or source.catalog_id is null
    or source.organizer_id is distinct from new.organizer_id or source.offering_id is distinct from new.offering_id
    or source.specialization is distinct from new.specialization
    or new.version is distinct from (select coalesce(max(version),0)+1 from public.point_plans where offering_id=new.offering_id)
    or new.basis_reference is distinct from public.phase5_programplan_upgrade_shape(source.basis_reference)
    or new.term_distribution is distinct from public.phase5_programplan_upgrade_terms(source.basis_reference,source.term_distribution) then
    raise exception 'Invalid programplan clone context' using errcode='22023';end if;
  end if;
 end if;
 perform public.phase5_programplan_validate_basis(new.basis_reference,o,case when tg_op='UPDATE' and old.catalog_id is null then old.specialization else null end);
 if tg_op='UPDATE' and old.catalog_id is null and (old.status<>'utkast' or new.revision<>old.revision+1) then raise exception 'Programplan version locked' using errcode='42501'; end if;
 select coalesce(array_agg(value->>'itemCode' order by n),'{}'::text[]) into choices from jsonb_array_elements(new.basis_reference->'specializationRefs') with ordinality e(value,n);
 if new.specialization is distinct from choices then raise exception 'Programplan choices mismatch' using errcode='22023'; end if;
 return new;
end $function$;


create or replace function public.phase5_gym_timplan_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='UPDATE' and public.phase5_plan_decision_permitted('timplan',old.id,old.status::text,new.status::text,old.revision) then
  if (old.gym_basis is null and not(old.status='faststalld' and new.status='ersatt')) or (to_jsonb(new)-'status'-'revision'-'decided_on'-'decided_identity_id'-'updated_at')
   is distinct from (to_jsonb(old)-'status'-'revision'-'decided_on'-'decided_identity_id'-'updated_at')
   or new.revision<>old.revision+1
   or not ((old.status in ('utkast','atersand') and new.status='forslag')
    or (old.status='forslag' and new.status in ('utkast','atersand','faststalld'))
    or (old.status='faststalld' and new.status='ersatt')) then
   raise exception 'Invalid timplan decision transition' using errcode='42501';end if;
  if new.status='faststalld' then
   if new.decided_on is distinct from public.phase5_programplan_today() or new.decided_identity_id is distinct from public.current_identity_id() then
    raise exception 'Invalid timplan decision identity' using errcode='42501';end if;
  elsif new.decided_on is distinct from old.decided_on or new.decided_identity_id is distinct from old.decided_identity_id then
   raise exception 'Timplan decision identity locked' using errcode='42501';end if;
  return new;
 end if;
 if (tg_op='INSERT' and new.decided_identity_id is not null)
 or (tg_op='UPDATE' and new.decided_identity_id is distinct from old.decided_identity_id) then
  raise exception 'Timplan decision identity locked' using errcode='42501';end if;
 if tg_op='UPDATE' and old.gym_basis is not null then
  if (new.id,new.organizer_id,new.offering_id,new.unit_id,new.version,new.gym_basis,new.source_programplan_id,new.basis,new.catalog_fetched,new.created_at,new.created_by,new.decided_on,new.decided_by)
  is distinct from (old.id,old.organizer_id,old.offering_id,old.unit_id,old.version,old.gym_basis,old.source_programplan_id,old.basis,old.catalog_fetched,old.created_at,old.created_by,old.decided_on,old.decided_by)
  or old.status not in ('utkast','atersand') or new.status not in (old.status,'ersatt') or new.revision<>old.revision+1 then raise exception 'Gym timplan version locked' using errcode='42501';end if;
 elsif tg_op='UPDATE' and new.gym_basis is not null then
  raise exception 'Gym legacy version locked' using errcode='42501';
 end if;
 if new.gym_basis is not null then
  if not public.phase5_programplan_shape(new.gym_basis,array['planId','offeringId','version','revision','status','catalogId','basisReference','distribution','rows','educationRevision','education','archived'])
   or new.gym_basis->>'planId' is distinct from new.source_programplan_id::text
   or new.gym_basis->>'offeringId' is distinct from new.offering_id::text
   or not exists(select 1 from public.offerings o where o.id=new.offering_id and o.organizer_id=new.organizer_id and o.kind='gymnasium')
   or (tg_op='INSERT' and (new.status<>'utkast' or new.revision<>0 or new.decided_on is not null or new.decided_by is not null)) then
   raise exception 'Invalid gym timplan binding' using errcode='22023';end if;
  perform public.phase5_gym_timplan_require_source(new.gym_basis);
 end if;return new;
end $$;

create or replace function public.phase5_gym_timplan_cells_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.timplans;point_terms jsonb;v integer;
begin
 select * into p from public.timplans where id=coalesce(new.timplan_id,old.timplan_id);
 if p.gym_basis is null then
  if tg_op<>'DELETE' and new.allocated is not null then raise exception 'Legacy allocation mask denied' using errcode='22023';end if;
  return coalesce(new,old);
 end if;
 if p.status not in ('utkast','atersand') then raise exception 'Timplan is locked for decision' using errcode='42501';end if;
 if tg_op='DELETE' then return old;end if;
 if not exists(select 1 from jsonb_array_elements(p.gym_basis->'rows') r where r->>'key'=new.row_id)
 or array_ndims(new.hours) is distinct from 1 or array_lower(new.hours,1) is distinct from 1 or cardinality(new.hours)<>6
 or array_position(new.hours,null) is not null or array_ndims(new.allocated) is distinct from 1 or array_lower(new.allocated,1) is distinct from 1
 or cardinality(new.allocated)<>6 or array_position(new.allocated,null) is not null then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 select d->'points' into point_terms from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=new.row_id;
 for v in 1..6 loop
 if new.hours[v] not between 0 and 2000 or (not new.allocated[v] and new.hours[v]<>0)
 or ((point_terms->>(v-1))::integer=0 and (new.allocated[v] or new.hours[v]<>0)) then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 end loop;return new;
end $$;

create or replace function public.phase5_write_gym_timplan_row(plan_id uuid,expected_revision integer,row_key text,row_hours jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;r jsonb;v integer;h smallint[]:='{}';mask boolean[]:='{}';points jsonb;
begin
 if expected_revision is null or expected_revision<0 or row_key is null or not public.phase5_programplan_array(row_hours,6) or jsonb_array_length(row_hours)<>6 then
 raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 select * into p from public.timplans where id=plan_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 select * into p from public.timplans where id=plan_id for update;
 perform public.phase5_gym_timplan_scope(p.offering_id,p.unit_id,true);
 if p.gym_basis is null or p.status not in ('utkast','atersand') then raise exception 'Gym timplan version locked' using errcode='42501';end if;
 if p.revision<>expected_revision then raise exception 'Gym timplan revision conflict' using errcode='40001';end if;
 select d->'points' into points from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=row_key;
 if points is null then raise exception 'Invalid gym timplan row' using errcode='22023';end if;
 for v in 0..5 loop
  r:=row_hours->v;
  if r<>'null'::jsonb and not public.phase5_programplan_integer(r,0,2000) then raise exception 'Invalid gym timplan hours' using errcode='22023';end if;
  if (points->>v)::integer=0 and r<>'null'::jsonb then raise exception 'Inactive gym timplan term' using errcode='22023';end if;
  h:=array_append(h,case when r='null'::jsonb then 0 else (r#>>'{}')::numeric::smallint end);mask:=array_append(mask,r<>'null'::jsonb);
 end loop;
 update public.timplan_cells set hours=h,allocated=mask where timplan_id=p.id and row_id=row_key;
 if not found then raise exception 'Invalid gym timplan matrix' using errcode='22023';end if;
 update public.timplans set revision=revision+1 where id=p.id;
 insert into public.timplan_events(timplan_id,actor_role,action) values(p.id,'rektor','gym_timplan_row_changed');
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_row_changed');return jsonb_build_object('id',p.id,'revision',p.revision+1,'rowKey',row_key,'hours',row_hours);
end $$;

create or replace function public.phase5_gym_timplan_result(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;catalog jsonb;current_source jsonb;values jsonb;
begin
 select * into p from public.timplans where id=plan_id;
 if p.gym_basis is null then raise exception 'Gym legacy basis unavailable' using errcode='42501',hint='gym_timplan_legacy';end if;
 select * into o from public.offerings where id=p.offering_id;
 a:=public.phase3_actor();select payload into catalog from public.programplan_catalogs where catalog_id=p.gym_basis->>'catalogId';
 select jsonb_build_object('planId',q.id,'version',q.version,'revision',q.revision,'status',q.status) into current_source
 from public.point_plans q where q.offering_id=p.offering_id and q.organizer_id=p.organizer_id order by version desc,id limit 1;
 select coalesce(jsonb_object_agg(c.row_id,(select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)),'{}'::jsonb)
 into values from public.timplan_cells c where c.timplan_id=p.id;
 return jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
 'version',p.version,'revision',p.revision,'status',p.status,'source',p.gym_basis,'catalog',catalog,'currentSource',current_source,'hours',values,
 'canPlan',a.function in ('rektor','administrator') and p.status in ('utkast','atersand') and o.archived_at is null,'archived',o.archived_at is not null);
end $$;

-- Reuse the existing explicit new-source creation for a returned draft too.
create or replace function public.phase5_create_gym_timplan(command_id uuid,source_plan_id uuid,expected_source_revision integer,expected_education_revision integer,
 unit_id uuid,predecessor_plan_id uuid,expected_predecessor_revision integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;p public.point_plans;o public.offerings;previous public.timplans;receipt public.gym_timplan_receipts;
 source jsonb;request jsonb;reply jsonb;created uuid;latest integer;carried integer:=0;reset integer:=0;r jsonb;old_r jsonb;old_d jsonb;d jsonb;h smallint[];mask boolean[];
begin
 if command_id is null or source_plan_id is null or unit_id is null or expected_source_revision is null or expected_source_revision<0
 or expected_education_revision is null or expected_education_revision<0 or (predecessor_plan_id is null)<>(expected_predecessor_revision is null)
 or expected_predecessor_revision<0 then raise exception 'Invalid gym timplan create' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();select * into p from public.point_plans where id=source_plan_id and organizer_id=a.organizer_id;
 if not found then raise exception 'Gym timplan denied' using errcode='42501';end if;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit_id,true);
 request:=jsonb_build_object('commandId',command_id,'sourcePlanId',source_plan_id,'expectedSourceRevision',expected_source_revision,'expectedEducationRevision',expected_education_revision,
 'unitId',unit_id,'predecessorPlanId',predecessor_plan_id,'expectedPredecessorRevision',expected_predecessor_revision);
 select * into receipt from public.gym_timplan_receipts where gym_timplan_receipts.command_id=phase5_create_gym_timplan.command_id for update;
 if found then
  if receipt.actor_identity_id<>public.current_identity_id() or receipt.assignment_id<>a.id or receipt.unit_id<>unit_id or receipt.organizer_id<>a.organizer_id or receipt.request<>request then
  raise exception 'Gym timplan receipt conflict' using errcode='40001';end if;
  select * into previous from public.timplans where id=receipt.timplan_id for update;
  perform public.phase5_gym_timplan_scope(previous.offering_id,previous.unit_id,true);
  reply:=receipt.reply||jsonb_build_object('replayed',true,'revision',previous.revision);
  perform public.phase5_gym_timplan_audit(previous.id,'gym_timplan_created');
  return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(previous.id));
 end if;
 select * into p from public.point_plans where id=source_plan_id for update;
 o:=public.phase5_gym_timplan_scope(p.offering_id,unit_id,true);
 if p.revision<>expected_source_revision or o.lifecycle_revision<>expected_education_revision then raise exception 'Gym timplan source conflict' using errcode='40001';end if;
 source:=public.phase5_gym_timplan_source(p.id);perform public.phase5_gym_timplan_require_source(source);
 select coalesce(max(t.version),0) into latest from public.timplans t where t.offering_id=o.id and t.unit_id=phase5_create_gym_timplan.unit_id;
 if predecessor_plan_id is null then
  if exists(select 1 from public.timplans t where t.offering_id=o.id and t.unit_id=phase5_create_gym_timplan.unit_id and t.status in ('utkast','forslag','atersand')) then raise exception 'Gym timplan open version exists' using errcode='40001';end if;
 else
  select * into previous from public.timplans t where t.id=predecessor_plan_id for update;
  if not found or previous.offering_id<>o.id or previous.unit_id<>unit_id or previous.organizer_id<>o.organizer_id or previous.status not in ('utkast','atersand','faststalld')
  or previous.revision<>expected_predecessor_revision then raise exception 'Gym timplan predecessor conflict' using errcode='40001';end if;
  perform public.phase5_gym_timplan_scope(previous.offering_id,previous.unit_id,true);
  if previous.status in ('utkast','atersand') then
   update public.timplans set status='ersatt',revision=revision+1 where id=previous.id;
   insert into public.timplan_events(timplan_id,actor_role,action) values(previous.id,'rektor','gym_timplan_superseded');
  elsif exists(select 1 from public.timplans t where t.offering_id=o.id and t.unit_id=phase5_create_gym_timplan.unit_id and t.status in ('utkast','forslag','atersand')) then
   raise exception 'Gym timplan open version exists' using errcode='40001';
  end if;
 end if;
 insert into public.timplans(organizer_id,offering_id,unit_id,version,status,basis,catalog_fetched,gym_basis,source_programplan_id)
 values(o.organizer_id,o.id,unit_id,latest+1,'utkast','Programplan v'||p.version,(select (payload->'source'->>'fetched')::date from public.programplan_catalogs where catalog_id=p.catalog_id),source,p.id) returning id into created;
 for r in select value from jsonb_array_elements(source->'rows') loop
  h:=array[0,0,0,0,0,0]::smallint[];mask:=array[false,false,false,false,false,false];old_r:=null;old_d:=null;
  select value into d from jsonb_array_elements(source->'distribution') where value->>'rowKey'=r->>'key';
  if previous.gym_basis is not null then
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
  end if;
  if old_r=r and old_d=d then
   select hours,allocated into h,mask from public.timplan_cells where timplan_id=previous.id and row_id=r->>'key';
   if not found then raise exception 'Invalid predecessor matrix' using errcode='22023';end if;carried:=carried+1;
  else reset:=reset+1;end if;
  insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(created,r->>'key',h,mask);
 end loop;
 insert into public.timplan_events(timplan_id,actor_role,action) values(created,'rektor','gym_timplan_created');
 reply:=jsonb_build_object('id',created,'offeringId',o.id,'unitId',unit_id,'version',latest+1,'revision',0,'sourcePlanId',p.id,'sourceRevision',p.revision,'replayed',false,'carriedRows',carried,'resetRows',reset);
 insert into public.gym_timplan_receipts(command_id,organizer_id,unit_id,actor_identity_id,assignment_id,timplan_id,request,reply)
 values(command_id,o.organizer_id,unit_id,public.current_identity_id(),a.id,created,request,reply);
 perform public.phase5_gym_timplan_audit(created,'gym_timplan_created');return jsonb_build_object('reply',reply,'plan',public.phase5_gym_timplan_result(created));
end $$;

-- Deleting a submitted source is also a content mutation. This does not change
-- existing draft/archived deletion policy; those remain governed by their RPC.
create function public.phase5_plan_decision_program_delete_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.plan_decision_reviews r where r.kind='programplan' and r.plan_id=old.id and r.stage='submitted') then
 raise exception 'Programplan submitted for review' using errcode='42501',hint='programplan_submitted';end if;
 return old;
end $$;
create trigger point_plans_decision_delete_guard before delete on public.point_plans
 for each row execute function public.phase5_plan_decision_program_delete_guard();

-- No public/ordinary-client/Worker helper access. Previously granted GY RPC
-- signatures retain their exact ACL through CREATE OR REPLACE.
revoke all on function
 public.phase5_plan_decision_immutable(),
 public.phase5_plan_decision_permitted(text,uuid,text,text,integer),
 public.phase5_plan_decision_source_content(jsonb),
 public.phase5_plan_decision_audit(text,uuid,text),
 public.phase5_plan_decision_source_blockers(jsonb),
 public.phase5_plan_decision_detail(text,uuid),
 public.phase5_plan_decision_basis(text,uuid),
 public.phase5_plan_decision_command(jsonb),
 public.phase5_plan_decision_inbox(),
 public.phase5_plan_decision_program_delete_guard()
 from public,anon,authenticated,service_role,skolplattform_worker;

-- Submission freezes the program's education identity and shared school scope
-- as well as point-plan cells. Revoking a mandate or archiving an education is
-- still allowed and immediately removes decision capabilities.
create function public.phase5_plan_decision_offering_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid;new_target uuid;
begin
 if tg_table_name='offerings' then
  target:=old.id;
  if tg_op='UPDATE' and (new.name,new.cohort,new.program_code,new.orientation_code,new.start_year,new.kind,new.unit_id,new.organizer_id)
   is not distinct from (old.name,old.cohort,old.program_code,old.orientation_code,old.start_year,old.kind,old.unit_id,old.organizer_id) then return new;end if;
 else
  target:=case when tg_op='INSERT' then new.offering_id else old.offering_id end;
  if tg_op='UPDATE' then new_target:=new.offering_id;end if;
 end if;
 if exists(select 1 from public.point_plans p join public.plan_decision_reviews r on r.kind='programplan' and r.plan_id=p.id
  where p.offering_id in (target,new_target) and p.status='utkast' and r.stage='submitted') then
  raise exception 'Programplan submitted for review' using errcode='42501',hint='programplan_submitted';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger offerings_decision_guard before update or delete on public.offerings
 for each row execute function public.phase5_plan_decision_offering_guard();
create trigger offering_units_decision_guard before insert or update or delete on public.offering_units
 for each row execute function public.phase5_plan_decision_offering_guard();
revoke all on function public.phase5_plan_decision_offering_guard() from public,anon,authenticated,service_role,skolplattform_worker;
