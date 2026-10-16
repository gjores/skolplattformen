-- APL stage 1: versioned decisions and explicit structure copies.
-- Existing decisions, statuses, histories, receipts and classroom links are untouched.
-- Existing RPC grants are preserved; new helpers and evidence remain private.

create table public.apl_plan_decision_receipts (
 command_id uuid primary key references public.plan_decision_receipts(command_id) on delete restrict,
 contract_version text not null check(contract_version='apl_decision_v1'),
 apl_basis jsonb,
 check(apl_basis is null or public.phase5_programplan_shape(apl_basis,array['organizerId','gymTimplan','copyReview']))
);
alter table public.apl_plan_decision_receipts enable row level security;
alter table public.apl_plan_decision_receipts force row level security;
revoke all on public.apl_plan_decision_receipts from public,anon,authenticated,service_role,skolplattform_worker;

create function public.phase5_apl_decision_receipt_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare receipt public.plan_decision_receipts;a public.access_assignments;s public.app_sessions;
begin
 if tg_op<>'INSERT' then raise exception 'Beslutskvittots kontrakt och underlag är oföränderliga.' using errcode='42501';end if;
 select * into receipt from public.plan_decision_receipts where command_id=new.command_id;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if receipt.command_id is null or receipt.actor_identity_id<>s.identity_id or receipt.assignment_id<>a.id
  or receipt.result->>'contractVersion' is distinct from new.contract_version
  or (receipt.result->'apl'='null'::jsonb) is distinct from (new.apl_basis is null)
  or (new.apl_basis is not null and ((new.apl_basis#>>'{gymTimplan,id}')::uuid is distinct from receipt.plan_id
   or (new.apl_basis->>'organizerId')::uuid is distinct from receipt.organizer_id
   or new.apl_basis->'copyReview' is distinct from receipt.result#>'{apl,detail,copyReview}')) then
  raise exception 'Beslutskvittot saknar verifierbart fryst underlag.' using errcode='42501';end if;
 return new;
end $$;
create trigger apl_plan_decision_receipts_guard before insert or update or delete on public.apl_plan_decision_receipts
 for each row execute function public.phase5_apl_decision_receipt_guard();
create trigger apl_plan_decision_receipts_no_truncate before truncate on public.apl_plan_decision_receipts
 for each statement execute function public.phase5_apl_decision_receipt_guard();

-- Only newly inserted receipts are checked. No backfill or historical UPDATE is needed.
-- Missing metadata cannot turn a new result into a trusted legacy replay:
-- the replay branch separately rejects any versioned receipt without its sidecar.
create function public.phase5_apl_decision_receipt_required() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if new.result->>'contractVersion' is distinct from 'apl_decision_v1' then
  raise exception 'Det nya beslutskvittot saknar kontraktsversion.' using errcode='55000';end if;
 return new;
end $$;
create trigger plan_decision_apl_receipt_required before insert on public.plan_decision_receipts
 for each row execute function public.phase5_apl_decision_receipt_required();

-- Caller holds the existing school/source/series/timplan locks. Administrative
-- status/revision is deliberately absent from the rector content proof.
create function public.phase5_apl_decision_underlag(target_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;gym jsonb;detail jsonb;blockers jsonb;latest jsonb;current_id uuid;
begin
 select * into p from public.timplans where id=target_plan;
 if public.phase5_plan_decision_profile(p.gym_basis)->'vocational' is distinct from 'true'::jsonb then return null;end if;
 gym:=public.phase5_gym_timplan_result(p.id);detail:=public.phase5_apl_plan_projection(p.id);
 blockers:=public.phase5_apl_confirmation_blockers(gym,detail->'plan',detail->'copyReview',detail->'program');
 latest:=detail->'confirmations'->-1;
 if latest is not null and latest->>'contentHash'=detail->>'contentHash' then current_id:=(latest->>'id')::uuid;end if;
 if current_id is null then
  blockers:=blockers||jsonb_build_array(case when latest is null
   then 'Rektor behöver bekräfta APL-förläggningen för det aktuella innehållet.'
   else 'APL-underlaget eller timplanens innehåll har ändrats. Rektor behöver granska och bekräfta förläggningen igen.' end);
 end if;
 return jsonb_build_object('detail',detail,'blockers',blockers,'currentConfirmationId',current_id,'ready',jsonb_array_length(blockers)=0);
end $$;

create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;series jsonb;apl jsonb;
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
   if stage='draft' and a.function='huvudman' then actions:='["approve"]';end if;
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
  perform 1 from public.timplan_series where id=t.series_id for update;
  series:=public.phase5_named_timplan_series_json(t.series_id);
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
  profile:=public.phase5_plan_decision_profile(source);
  if profile is not null and total_hours<(profile->>'hours')::integer then
   blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  if current_source->>'status' is distinct from 'faststalld' then blockers:=blockers||jsonb_build_array('Huvudmannen behöver först fastställa timplanens programplansversion.');end if;
  if public.phase5_plan_decision_source_content(source) is distinct from public.phase5_plan_decision_source_content(current_source) then
   blockers:=blockers||jsonb_build_array('Programplanens innehåll har ändrats. Skapa en ny timplansversion från det aktuella underlaget.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','teacher-led','label','Jag har granskat att timmarna avser undervisning och att annan aktivitet inte räknas som undervisningstid.'),
   jsonb_build_object('id','choice-paths','label','Jag har granskat att alla möjliga ämnesval och alternativa studiegångar får minst den garanterade undervisningstiden.'));
  source_info:='Programplan version '||(source->>'version')||' · fryst revision '||(source->>'revision');
 end if;
 profile:=public.phase5_plan_decision_profile(source);
 if profile->'vocational'='true'::jsonb then
  checks:=checks||jsonb_build_array(
   jsonb_build_object('id','eligibility','label','Jag har kontrollerat att engelska nivå 1–2 och svenska eller svenska som andraspråk nivå 1–3 ingår i den gemensamma planen. Individuella bortval hanteras separat.'),
   jsonb_build_object('id','apl','label',case when target_kind='programplan' then 'Jag har kontrollerat minst 15 veckors APL, eller mer än halva utbildningen vid lärlingsutbildning. Varje APL-vecka räknas som 23 timmar och ingår bara en gång i timplanens total.' else 'Jag har granskat APL-periodernas omfattning, innehåll och inkluderade undervisningstid samt rektors aktuella bekräftelse av förläggningen.' end));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);
 if target_kind='timplan' then
  apl:=public.phase5_apl_decision_underlag(target_id);
  -- Historical approved/replaced plans remain readable without a retroactive task.
  if apl is not null and stage in ('draft','returned','submitted') then blockers:=blockers||(apl->'blockers');end if;
 end if;
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment,'nameAtDecision',h.name_at_decision) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules','gy25-national-programs-2026-10-12-v2',
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 if target_kind='timplan' then
  basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('basisHash',basis_hash,'series',series)::text,'UTF8')),'hex');
 end if;
 if apl is not null then
  basis_hash:='sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(jsonb_build_array(
   'apl_decision_v1',basis_hash,apl#>>'{detail,contentHash}',apl->'currentConfirmationId')),'UTF8')),'hex');
 end if;
 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('contractVersion','apl_decision_v1','apl',apl,'series',series,'kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog,'hours',hours);
end $$;

create or replace function public.phase5_plan_decision_basis(kind text,plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare result jsonb;frozen jsonb;
begin
 result:=public.phase5_plan_decision_detail(kind,plan_id);
 if result->'apl'<>'null'::jsonb then frozen:=public.phase5_apl_plan_basis(plan_id);end if;
 perform public.phase5_plan_decision_audit(kind,plan_id,'plan_decision_basis_read');
 return jsonb_build_object('contractVersion','apl_decision_sql_v1','resultContract','apl_decision_v1',
  'replayed',false,'result',result,'aplBasis',frozen);
end $$;

create or replace function public.phase5_plan_decision_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare target_kind text;target_id uuid;request_command_id uuid;operation text;comment_text text;
 a public.access_assignments;s public.app_sessions;basis jsonb;result jsonb;receipt public.plan_decision_receipts;
 o public.offerings;p public.point_plans;t public.timplans;prior record;next_stage text;next_status text;
 decision_revision integer;actor_name text;item jsonb;confirmed jsonb;expected_checks jsonb;
 metadata public.apl_plan_decision_receipts;frozen jsonb;result_contract text;
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
 target_kind:=input->>'kind';target_id:=(input->>'planId')::uuid;request_command_id:=(input->>'commandId')::uuid;
 if target_id is null or request_command_id is null then raise exception 'Invalid plan decision identity' using errcode='22023';end if;
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
 perform pg_advisory_xact_lock(hashtextextended(request_command_id::text,5542));
 select * into receipt from public.plan_decision_receipts r where r.command_id=request_command_id;
 if found then
  if receipt.kind<>target_kind or receipt.plan_id<>target_id or receipt.organizer_id<>o.organizer_id
   or receipt.actor_identity_id<>s.identity_id or receipt.assignment_id<>a.id or receipt.request<>input then
   raise exception 'Decision command conflict' using errcode='40001',hint='plan_decision_conflict';end if;
  if target_kind='programplan' and exists(select 1 from public.offering_units ou where ou.offering_id=o.id
   and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
   raise exception 'Plan decision replay denied' using errcode='42501';end if;
  -- Dispatch is selected from immutable database evidence, never from a request field.
  -- No new checklist, APL blocker or presentation field is injected into old results.
  result:=receipt.result;
  select * into metadata from public.apl_plan_decision_receipts where command_id=request_command_id;
  if found then
   if result->>'contractVersion' is distinct from metadata.contract_version then
    raise exception 'Beslutskvittots kontrakt kan inte verifieras.' using errcode='55000';end if;
   result_contract:=metadata.contract_version;frozen:=metadata.apl_basis;
  else
   if result ? 'contractVersion' or result ? 'apl' then
    raise exception 'Beslutskvittots frysta underlag saknas.' using errcode='55000';end if;
   result_contract:='legacy';frozen:=null;
  end if;
  perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');
  return jsonb_build_object('contractVersion','apl_decision_sql_v1','resultContract',result_contract,
   'replayed',true,'result',result,'aplBasis',frozen);
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
   for prior in select q.id,q.status,q.revision from public.timplans q where q.series_id=t.series_id and q.offering_id=o.id and q.unit_id=t.unit_id and q.organizer_id=o.organizer_id and q.status='faststalld' and q.id<>t.id order by q.id for update loop
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
 insert into public.plan_decision_history(kind,plan_id,organizer_id,action,plan_revision,decision_revision,basis_hash,actor_identity_id,assignment_id,actor_name,comment,confirmed_checks,name_at_decision)
 values(target_kind,target_id,o.organizer_id,operation,(basis->>'revision')::integer,decision_revision,basis->>'basisHash',s.identity_id,a.id,actor_name,comment_text,confirmed,case when target_kind='timplan' then basis#>>'{series,name}' end);
 result:=public.phase5_plan_decision_detail(target_kind,target_id);
 insert into public.plan_decision_receipts(command_id,kind,plan_id,organizer_id,actor_identity_id,assignment_id,request,result)
 values(request_command_id,target_kind,target_id,o.organizer_id,s.identity_id,a.id,input,result);
 if result->'apl'<>'null'::jsonb then frozen:=public.phase5_apl_plan_basis(target_id);end if;
 insert into public.apl_plan_decision_receipts(command_id,contract_version,apl_basis)
 values(request_command_id,'apl_decision_v1',frozen);
 perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');
 return jsonb_build_object('contractVersion','apl_decision_sql_v1','resultContract','apl_decision_v1',
  'replayed',false,'result',result,'aplBasis',frozen);
end $$;

create or replace function public.phase5_plan_decision_items() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; entry record; detail jsonb; item jsonb; items jsonb:='[]';
 task text;stage text;next_actor text;can_write boolean;apl jsonb;apl_summary jsonb;
 cache_keys jsonb[]:='{}';cache_values jsonb[]:='{}';cache_key jsonb;cache_index integer;cached jsonb;
begin
 a:=public.phase5_programplan_actor();
 for entry in
  select 'programplan'::text kind,p.id,p.offering_id,o.name,p.version,p.status::text status,null::uuid unit_id,null::text school_name,
   o.archived_at,public.phase5_programplan_phase(o) phase,r.stage review_stage,
   jsonb_build_array(p.catalog_id,p.basis_reference,p.term_distribution,p.status) source_key,
   not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) full_scope
   from public.point_plans p join public.offerings o on o.id=p.offering_id and o.organizer_id=p.organizer_id
   left join public.plan_decision_reviews r on r.kind='programplan' and r.plan_id=p.id
   where p.status='utkast' and o.kind='gymnasium' and o.organizer_id=a.organizer_id
   and exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.unit_id=ou.unit_id and m.assignment_id=a.id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id)
  union all
  select 'timplan',t.id,t.offering_id,o.name,t.version,t.status::text,t.unit_id,u.name,o.archived_at,null,null,null::jsonb,true
   from public.timplans t join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
   join public.school_units u on u.id=t.unit_id and u.organizer_id=t.organizer_id
   where t.gym_basis is not null and t.status in ('utkast','forslag','atersand') and o.organizer_id=a.organizer_id
   and exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.unit_id=ou.unit_id and m.assignment_id=a.id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id and ou.unit_id=t.unit_id)
  order by kind,name,id
 loop
  detail:=null;apl:=null;apl_summary:=null;
  stage:=case when entry.kind='programplan' then case when entry.review_stage in ('submitted','returned') then entry.review_stage else 'draft' end
   when entry.status='forslag' then 'submitted' when entry.status='atersand' then 'returned' else 'draft' end;
  can_write:=entry.archived_at is null and (entry.kind='timplan' or entry.phase='framtida' and entry.full_scope);
  -- These priority branches are identical to detail/actions and do not depend on blockers.
  -- Ordinary profiles retain this inexpensive routing branch. Vocational APL
  -- below needs the locked content proof even when the review task is already known.
  task:=case
   when can_write and stage='submitted' and a.function='huvudman' then 'review'
   when can_write and stage='returned' and (a.function='rektor' or entry.kind='timplan' and a.function='administrator') then 'revise'
   when can_write and stage='draft' and (a.function='rektor' or entry.kind='timplan' and a.function='administrator') then 'prepare'
   else null end;
  if task is not null then
   next_actor:=case when stage='submitted' then 'huvudman' else 'rektor' end;
   item:=jsonb_build_object('kind',entry.kind,'planId',entry.id,'offeringId',entry.offering_id,'unitId',entry.unit_id,
    'educationName',entry.name,'schoolName',entry.school_name,'version',entry.version,'stage',stage,'nextActor',next_actor,'task',task);
  else
   -- Cache only the routing outcome for identical frozen program content and access state.
   -- Identity/name/version remain the actual row's values, and catalogs are immutable.
   cache_key:=case when entry.kind='programplan' then jsonb_build_array(entry.source_key,stage,entry.phase,entry.archived_at,entry.full_scope) end;
   cache_index:=case when cache_key is not null then array_position(cache_keys,cache_key) end;
   if cache_index is null then
    detail:=public.phase5_plan_decision_detail(entry.kind,entry.id);
    task:=case when a.function='huvudman' and detail->'actions' ? 'approve' and jsonb_array_length(detail->'blockers')=0 then 'review'
     when jsonb_array_length(detail->'blockers')>0 then 'blocked' else 'waiting' end;
    cached:=jsonb_build_object('task',task,'nextActor',detail->'nextActor');
    if cache_key is not null and cardinality(cache_keys)<128 then
     cache_keys:=array_append(cache_keys,cache_key);cache_values:=array_append(cache_values,cached);
    end if;
   else cached:=cache_values[cache_index];end if;
   item:=jsonb_build_object('kind',entry.kind,'planId',entry.id,'offeringId',entry.offering_id,'unitId',entry.unit_id,
    'educationName',entry.name,'schoolName',entry.school_name,'version',entry.version,'stage',stage,
    'nextActor',cached->'nextActor','task',cached->'task');
  end if;
  if entry.kind='timplan' and public.phase5_plan_decision_profile(
   (select t.gym_basis from public.timplans t where t.id=entry.id))->'vocational'='true'::jsonb then
   -- Keep review/return discoverable even when approval requires APL correction.
   if detail is null then detail:=public.phase5_plan_decision_detail(entry.kind,entry.id);end if;
   apl:=detail->'apl';
   if apl<>'null'::jsonb then
    apl_summary:=jsonb_build_object('state',case when apl#>'{detail,plan}'='null'::jsonb then 'legacy' else 'structured_v1' end,
     'ready',apl->'ready','blockers',apl->'blockers');
   end if;
  end if;
  item:=item||jsonb_build_object('apl',apl_summary);
  item:=item||jsonb_build_object('series',case when entry.kind='timplan' then
   (select public.phase5_named_timplan_series_json(t.series_id) from public.timplans t where t.id=entry.id) else null end);
  items:=items||jsonb_build_array(item);
 end loop;
 select coalesce(jsonb_agg(j order by case when j->>'task' in ('prepare','review','revise') then 0 else 1 end,
  lower(j->>'educationName') collate "C",j->>'kind',coalesce(j->>'schoolName','') collate "C",j->>'planId'),'[]') into items
 from jsonb_array_elements(items) j;
 return items;
end $$;


-- Initial APL copy is part of the existing protected timetable creation transaction.
-- It never writes the source, timetable hours, decision history or class bindings.
create function public.phase5_apl_copy_audit(source_plan uuid,target_plan uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if source_plan is null or target_plan is null then raise exception 'Ogiltig APL-kopiering.' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   'apl_plan_copied','timplan',target_plan,'ok',jsonb_build_object('sourcePlanId',source_plan));
 exception when others then raise exception 'APL-loggningen är inte tillgänglig.' using errcode='55000';end;
end $$;

create function public.phase5_apl_copy_structure(source_plan uuid,target_plan uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
 source_row public.timplans;target_row public.timplans;a public.access_assignments;
 source_apl jsonb;source_gym jsonb;target_gym jsonb;source_program jsonb;target_program jsonb;trusted_source boolean;
 source_reviews jsonb;new_reviews jsonb:='[]'::jsonb;review jsonb;review_count integer;
 next_apl jsonb;next_periods jsonb:='[]'::jsonb;period jsonb;content jsonb;allocation jsonb;next_period jsonb;
 active_contents jsonb;active_allocations jsonb;loss_contents jsonb;loss_allocations jsonb;loss_reason text;reason text;
 target_keys jsonb;target_points jsonb;cell_totals jsonb;row_key text;term_index integer;cell_key text;cell_total integer;
 new_period_id uuid;now_at timestamptz;
begin
 if source_plan is null then return;end if;
 if target_plan is null or source_plan=target_plan then raise exception 'Ogiltig APL-kopiering.' using errcode='22023';end if;
 -- Both creators already hold the school/offering, program and source-series/plan locks.
 -- Recheck the actual scope, then reuse those row locks; never demand an editable source.
 select * into target_row from public.timplans where id=target_plan;
 select * into source_row from public.timplans where id=source_plan;
 if target_row.id is null or source_row.id is null or target_row.gym_basis is null or source_row.gym_basis is null
  or (target_row.organizer_id,target_row.unit_id,target_row.offering_id)
    is distinct from (source_row.organizer_id,source_row.unit_id,source_row.offering_id) then
  raise exception 'APL-kopieringen saknar samma skola och utbildning.' using errcode='42501';end if;
 perform public.phase5_gym_timplan_scope(target_row.offering_id,target_row.unit_id,true);
 select * into source_row from public.timplans where id=source_plan for update;
 select * into target_row from public.timplans where id=target_plan for update;
 a:=public.phase5_programplan_actor();
 if a.function not in ('rektor','administrator') or a.organizer_id<>target_row.organizer_id
  or target_row.status<>'utkast' or target_row.revision<>0
  or exists(select 1 from public.apl_plan_underlag u where u.plan_id=target_plan)
  or exists(select 1 from public.apl_rector_confirmations c where c.plan_id=target_plan)
  or exists(select 1 from public.apl_plan_commands c where c.plan_id=target_plan)
  or exists(select 1 from public.timplan_events e where e.timplan_id=target_plan)
  or exists(select 1 from public.named_timplan_commands c where c.plan_id=target_plan)
  or exists(select 1 from public.gym_timplan_receipts c where c.timplan_id=target_plan)
  or exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=target_plan) then
  raise exception 'APL får bara initieras på det nya tomma utkastet.' using errcode='42501';end if;
 -- The hook precedes both creation event and receipt. Checking these also works
 -- under a caller savepoint, unlike comparing tuple xmin with the top-level XID.
 source_apl:=public.phase5_apl_plan_value(source_plan);
 if source_apl is null then return;end if;
 source_apl:=public.phase5_apl_plan_parse(source_apl);
 source_gym:=public.phase5_gym_timplan_result(source_plan);target_gym:=public.phase5_gym_timplan_result(target_plan);
 perform public.phase5_apl_validate_allocations(source_gym,source_apl);
 source_program:=public.phase5_apl_program(source_gym);target_program:=public.phase5_apl_program(target_gym);
 trusted_source:=coalesce((source_program->>'sourceSupported')::boolean and (target_program->>'sourceSupported')::boolean,false);
 source_reviews:=public.phase5_apl_copy_review(source_plan);
 if jsonb_array_length(source_reviews)>1000 then
  raise exception 'För många granskningspunkter för säker APL-kopiering.' using errcode='40001',hint='apl_copy_review_limit';end if;
 for review in select value from jsonb_array_elements(source_reviews) where value->'resolution'='null'::jsonb loop
  -- Keep the original source plan/version/period, including inherited losses.
  -- Only the new review identity and unresolved status belong to this copy.
  new_reviews:=new_reviews||jsonb_build_array(review||jsonb_build_object('id',gen_random_uuid(),'resolution',null));
 end loop;
 select coalesce(jsonb_object_agg(r->>'key',r),'{}'::jsonb) into target_keys from jsonb_array_elements(target_gym#>'{source,rows}') r;
 select coalesce(jsonb_object_agg(d->>'rowKey',d->'points'),'{}'::jsonb) into target_points from jsonb_array_elements(target_gym#>'{source,distribution}') d;
 -- Decide all-or-nothing for each cell across every period. A period's input
 -- ordering must not decide which subset of a too-large cell happens to survive.
 select coalesce(jsonb_object_agg(c.cell_key,to_jsonb(c.minutes)),'{}'::jsonb) into cell_totals from (
  select jsonb_build_array(x->>'rowKey',(x->>'termIndex')::integer)::text cell_key,sum((x->>'gutMinutes')::bigint) minutes
  from jsonb_array_elements(source_apl->'periods') p cross join lateral jsonb_array_elements(p->'allocations') x
  group by jsonb_build_array(x->>'rowKey',(x->>'termIndex')::integer)::text
 ) c;
 for period in select value from jsonb_array_elements(source_apl->'periods') loop
  active_contents:='[]'::jsonb;active_allocations:='[]'::jsonb;
  loss_contents:='{"missing_row":[],"inactive_term":[],"insufficient_total":[],"unverified_source":[]}'::jsonb;
  loss_allocations:=loss_contents;
  for content in select value from jsonb_array_elements(period->'contents') loop
   row_key:=content->>'rowKey';loss_reason:=null;
   if not trusted_source then loss_reason:='unverified_source';
   elsif not target_keys ? row_key then loss_reason:='missing_row';end if;
   if loss_reason is null then active_contents:=active_contents||jsonb_build_array(content);
   else loss_contents:=jsonb_set(loss_contents,array[loss_reason],(loss_contents->loss_reason)||jsonb_build_array(content));end if;
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   row_key:=allocation->>'rowKey';term_index:=(allocation->>'termIndex')::integer;
   cell_key:=jsonb_build_array(row_key,term_index)::text;
   cell_total:=(target_gym->'hours'->row_key->>term_index)::integer;
   loss_reason:=null;
   if not trusted_source then loss_reason:='unverified_source';
   elsif not target_keys ? row_key then loss_reason:='missing_row';
   elsif coalesce((target_points->row_key->>term_index)::integer,0)=0 then loss_reason:='inactive_term';
   elsif cell_total is null or (cell_totals->>cell_key)::bigint>cell_total::bigint*60 then loss_reason:='insufficient_total';end if;
   if loss_reason is null then active_allocations:=active_allocations||jsonb_build_array(allocation);
   else
    loss_allocations:=jsonb_set(loss_allocations,array[loss_reason],(loss_allocations->loss_reason)||jsonb_build_array(allocation));
    if not exists(select 1 from jsonb_array_elements(loss_contents->loss_reason) c where c->>'rowKey'=row_key) then
     select value into content from jsonb_array_elements(period->'contents') where value->>'rowKey'=row_key;
     if content is null then raise exception 'APL-källan saknar innehåll för förlorad tid.' using errcode='22023',hint='allocation_without_content';end if;
     loss_contents:=jsonb_set(loss_contents,array[loss_reason],(loss_contents->loss_reason)||jsonb_build_array(content));
    end if;
   end if;
  end loop;
  new_period_id:=gen_random_uuid();
  next_period:=period||jsonb_build_object('id',new_period_id,'contents',active_contents,'allocations',active_allocations,
   'extent',(period->'extent')||jsonb_build_object('reviewed',false,'reviewNote',''));
  next_periods:=next_periods||jsonb_build_array(next_period);
  foreach reason in array array['missing_row','inactive_term','insufficient_total','unverified_source'] loop
   if jsonb_array_length(loss_contents->reason)>0 or jsonb_array_length(loss_allocations->reason)>0 then
    new_reviews:=new_reviews||jsonb_build_array(jsonb_build_object('id',gen_random_uuid(),'sourcePlanId',source_plan,
     'sourceVersion',source_row.version,'sourcePeriodId',period->'id','sourcePeriodName',period->'name','reason',reason,
     'contents',loss_contents->reason,'allocations',loss_allocations->reason,'resolution',null));
   end if;
  end loop;
  if jsonb_array_length(new_reviews)>1000 then
   raise exception 'För många granskningspunkter för säker APL-kopiering.' using errcode='40001',hint='apl_copy_review_limit';end if;
 end loop;
 next_apl:=public.phase5_apl_plan_parse(source_apl||jsonb_build_object('classification','unreviewed','periods',next_periods));
 perform public.phase5_apl_validate_allocations(target_gym,next_apl);
 -- Only this private initialization owns this exact permit; no caller-supplied
 -- session flag and no generic table permission are introduced.
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),target_plan);
 now_at:=date_trunc('milliseconds',clock_timestamp());
 insert into public.apl_plan_underlag(plan_id,organizer_id,unit_id,offering_id,education_form,classification,created_at,updated_at)
 values(target_plan,target_row.organizer_id,target_row.unit_id,target_row.offering_id,next_apl->>'educationForm','unreviewed',now_at,now_at);
 for period in select value from jsonb_array_elements(next_apl->'periods') loop
  insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note)
  values((period->>'id')::uuid,target_plan,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
   period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,false,'');
  for content in select value from jsonb_array_elements(period->'contents') loop
   insert into public.apl_period_contents(plan_id,period_id,row_key,description) values(target_plan,(period->>'id')::uuid,content->>'rowKey',content->>'description');
  end loop;
  for allocation in select value from jsonb_array_elements(period->'allocations') loop
   insert into public.apl_time_allocations(plan_id,period_id,row_key,term_index,gut_minutes)
   values(target_plan,(period->>'id')::uuid,allocation->>'rowKey',(allocation->>'termIndex')::integer,(allocation->>'gutMinutes')::integer);
  end loop;
 end loop;
 for review in select value from jsonb_array_elements(new_reviews) loop
  insert into public.apl_plan_copy_reviews(id,plan_id,source_plan_id,source_version,source_period_id,source_period_name,reason,contents,allocations)
  values((review->>'id')::uuid,target_plan,(review->>'sourcePlanId')::uuid,(review->>'sourceVersion')::integer,
   (review->>'sourcePeriodId')::uuid,review->>'sourcePeriodName',review->>'reason',review->'contents',review->'allocations');
 end loop;
 -- Guards validate provenance and every lost content/allocation tuple. Recheck
 -- the complete persisted active matrix before the creation's own receipt/audit.
 perform public.phase5_apl_plan_parse(public.phase5_apl_plan_value(target_plan));
 perform public.phase5_apl_validate_allocations(public.phase5_gym_timplan_result(target_plan),public.phase5_apl_plan_value(target_plan));
 perform public.phase5_apl_copy_audit(source_plan,target_plan);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=target_plan;
end $$;

revoke all on function public.phase5_apl_copy_audit(uuid,uuid),public.phase5_apl_copy_structure(uuid,uuid)
 from public,anon,authenticated,service_role,skolplattform_worker;

-- Preserve the existing matrix-copy behavior and counts; add only the final hook.
create or replace function public.phase5_named_timplan_copy_rows(target_plan uuid,source_basis jsonb,copy_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare previous public.timplans;r jsonb;d jsonb;old_r jsonb;old_d jsonb;h smallint[];mask boolean[];carried integer:=0;reset integer:=0;
begin
 if copy_plan is not null then select * into previous from public.timplans where id=copy_plan;end if;
 for r in select value from jsonb_array_elements(source_basis->'rows') loop
  h:=array[0,0,0,0,0,0]::smallint[];mask:=array[false,false,false,false,false,false];old_r:=null;old_d:=null;
  select value into d from jsonb_array_elements(source_basis->'distribution') where value->>'rowKey'=r->>'key';
  if previous.gym_basis is not null then
   select value into old_r from jsonb_array_elements(previous.gym_basis->'rows') where value->>'key'=r->>'key';
   select value into old_d from jsonb_array_elements(previous.gym_basis->'distribution') where value->>'rowKey'=r->>'key';
  end if;
  if old_r=r and old_d=d then
   select hours,allocated into h,mask from public.timplan_cells where timplan_id=previous.id and row_id=r->>'key';
   if not found then raise exception 'Invalid predecessor matrix' using errcode='22023';end if;
   carried:=carried+1;
  else reset:=reset+1;end if;
  insert into public.timplan_cells(timplan_id,row_id,hours,allocated) values(target_plan,r->>'key',h,mask);
 end loop;
 perform public.phase5_apl_copy_structure(copy_plan,target_plan);
 return jsonb_build_object('carriedRows',carried,'resetRows',reset);
end $$;

revoke all on function public.phase5_named_timplan_copy_rows(uuid,jsonb,uuid)
 from public,anon,authenticated,service_role,skolplattform_worker;

-- CREATE OR REPLACE above retains every existing RPC ACL. Only new helpers close here.
revoke all on function public.phase5_apl_decision_receipt_guard(),
 public.phase5_apl_decision_receipt_required(),public.phase5_apl_decision_underlag(uuid)
 from public,anon,authenticated,service_role,skolplattform_worker;
