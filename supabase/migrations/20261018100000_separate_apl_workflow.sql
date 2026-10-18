-- Program/timetable approval precedes separate APL planning and review.
-- Historical rows, confirmations and receipt envelopes are never rewritten.
-- These are internal planning objects, not SS 12000 attendance or Placement.
create table public.apl_workflow_states (
 plan_id uuid primary key references public.timplans(id) on delete restrict,
 revision integer not null check(revision between 0 and 2147483646)
);
-- Seed the independent counter once; all original columns remain unchanged.
insert into public.apl_workflow_states(plan_id,revision)
 select id,revision from public.timplans where gym_basis is not null;
create table public.apl_organizer_reviews (
 id uuid primary key,plan_id uuid not null references public.apl_plan_underlag(plan_id) on delete restrict,
 unit_id uuid not null references public.school_units(id),actor_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),actor_name text not null,
 occurred_at timestamptz not null,revision integer not null check(revision>0),
 timplan_revision integer not null check(timplan_revision>=0),
 rector_confirmation_id uuid not null references public.apl_rector_confirmations(id),
 content_hash text not null check(content_hash~'^sha256:[0-9a-f]{64}$'),comment text not null,
 unique(plan_id,revision),check(public.phase5_apl_text(to_jsonb(actor_name),200,false)),check(public.phase5_apl_text(to_jsonb(comment),2000,false))
);
alter table public.apl_workflow_states enable row level security;
alter table public.apl_workflow_states force row level security;
alter table public.apl_organizer_reviews enable row level security;
alter table public.apl_organizer_reviews force row level security;
revoke all on public.apl_workflow_states,public.apl_organizer_reviews from public,anon,authenticated,service_role,skolplattform_worker;
alter table public.apl_plan_commands drop constraint apl_plan_commands_action_check;
alter table public.apl_plan_commands add constraint apl_plan_commands_action_check check(action in ('save','confirm','review'));

create function public.phase5_apl_workflow_revision(target_plan uuid) returns integer
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce((select revision from public.apl_workflow_states where plan_id=target_plan),0)
$$;

create function public.phase5_apl_workflow_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;c public.apl_rector_confirmations;
begin
 if tg_op='TRUNCATE' or tg_op='DELETE' or (tg_table_name='apl_organizer_reviews' and tg_op<>'INSERT') then
  raise exception 'APL-historik får inte ändras.' using errcode='42501';end if;
 if not exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=new.plan_id)
  or (tg_op='UPDATE' and new.plan_id<>old.plan_id) then raise exception 'APL kräver skyddat kommando.' using errcode='42501';end if;
 p:=public.phase5_apl_plan_scope(new.plan_id,false);a:=public.phase5_programplan_actor();
 if p.status<>'faststalld' or exists(select 1 from public.offerings where id=p.offering_id and archived_at is not null)
  then raise exception 'Godkänn timplanen före APL-planering.' using errcode='42501';end if;
 if tg_table_name='apl_workflow_states' then
  if (tg_op='INSERT' and new.revision<>0) or (tg_op='UPDATE' and new.revision<>old.revision+1) then
   raise exception 'Ogiltig APL-revision.' using errcode='42501';end if;
 else
  select * into c from public.apl_rector_confirmations where id=new.rector_confirmation_id;
  if a.function<>'huvudman' or new.actor_id<>public.current_identity_id() or new.assignment_id<>a.id
   or new.unit_id<>p.unit_id or new.timplan_revision<>p.revision or new.revision<>public.phase5_apl_workflow_revision(p.id)
   or c.plan_id is distinct from p.id or c.content_hash is distinct from new.content_hash
   or new.content_hash<>public.phase5_apl_content_hash(p.id)
   or c.id is distinct from (select id from public.apl_rector_confirmations where plan_id=p.id order by revision desc limit 1) then
   raise exception 'APL-granskningen kräver aktuellt huvudmannamandat och rektorsbekräftelse.' using errcode='42501';end if;
 end if;
 return new;
end $$;
create trigger apl_workflow_states_guard before insert or update or delete on public.apl_workflow_states for each row execute function public.phase5_apl_workflow_guard();
create trigger apl_workflow_states_no_truncate before truncate on public.apl_workflow_states for each statement execute function public.phase5_apl_workflow_guard();
create trigger apl_organizer_reviews_guard before insert or update or delete on public.apl_organizer_reviews for each row execute function public.phase5_apl_workflow_guard();
create trigger apl_organizer_reviews_no_truncate before truncate on public.apl_organizer_reviews for each statement execute function public.phase5_apl_workflow_guard();


create or replace function public.phase5_apl_plan_request(q jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare normalized jsonb;resolution jsonb;resolutions jsonb:='[]';seen uuid[]:='{}';rid uuid;
begin
 if jsonb_typeof(q) is distinct from 'object' or q->>'action' is null or q->>'action' not in ('save','confirm','review') then
  raise exception 'Ogiltigt APL-kommando.' using errcode='22023',hint='invalid_apl_plan';end if;
 if not public.phase5_programplan_shape(q,array['contractVersion','action','commandId','planId','expectedRevision']||
  case when q->>'action'='save' then array['plan','copyReviewResolutions'] else array['expectedContentHash','comment'] end||case when q ? 'revisionScope' then array['revisionScope','expectedTimplanRevision'] else array[]::text[] end)
 or q->>'contractVersion' is distinct from 'structured_v1'
 or not public.phase5_programplan_integer(q->'expectedRevision',0,2147483646) then
  raise exception 'Ogiltigt APL-kommando.' using errcode='22023',hint='invalid_apl_plan';end if;
 if (q ? 'revisionScope') and (q->>'revisionScope' is distinct from 'apl' or not public.phase5_programplan_integer(q->'expectedTimplanRevision',0,2147483646))
  or (q->>'action'='review' and not(q ? 'revisionScope')) then raise exception 'Ogiltigt separat APL-kommando.' using errcode='22023',hint='invalid_apl_plan';end if;
 normalized:=q||jsonb_build_object('commandId',public.phase5_apl_uuid(q->'commandId'),'planId',public.phase5_apl_uuid(q->'planId'));
 if q->>'action'='save' then
  normalized:=normalized||jsonb_build_object('plan',public.phase5_apl_plan_parse(q->'plan'));
  if not public.phase5_programplan_array(q->'copyReviewResolutions',1000) then
   raise exception 'Ogiltig kopieringsgranskning.' using errcode='22023',hint='invalid_apl_plan';end if;
  for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
   if not public.phase5_programplan_shape(resolution,array['id','note']) or not public.phase5_apl_text(resolution->'note',2000,false) then
    raise exception 'Beskriv hur granskningspunkten har hanterats.' using errcode='22023',hint='invalid_copy_review_resolution';end if;
   rid:=public.phase5_apl_uuid(resolution->'id');
   if rid=any(seen) then raise exception 'Granskningspunkten finns flera gånger.' using errcode='22023',hint='duplicate';end if;
   seen:=array_append(seen,rid);resolutions:=resolutions||jsonb_build_array(resolution||jsonb_build_object('id',rid));
  end loop;
  normalized:=normalized||jsonb_build_object('copyReviewResolutions',resolutions);
 else
  if jsonb_typeof(q->'expectedContentHash') is distinct from 'string' or q->>'expectedContentHash'!~'^sha256:[0-9a-f]{64}$'
   or not public.phase5_apl_text(q->'comment',2000,false) then
   raise exception 'Ogiltig bekräftelse av APL-förläggning.' using errcode='22023',hint='invalid_apl_plan';end if;
 end if;
 return normalized;
end $$;

create or replace function public.phase5_apl_write_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid uuid;p public.timplans;a public.access_assignments;
begin
 if tg_op='TRUNCATE' then raise exception 'APL-historik får inte tömmas.' using errcode='42501';end if;
 if tg_op<>'INSERT' and tg_table_name in ('apl_rector_confirmations','apl_plan_commands') then
  raise exception 'APL-kvitton och rektorshändelser är oföränderliga.' using errcode='42501';end if;
 pid:=case when tg_op='DELETE' then old.plan_id else new.plan_id end;
 if not exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=pid)
 or (tg_op='UPDATE' and old.plan_id is distinct from new.plan_id) then
  raise exception 'APL kräver det skyddade kommandot.' using errcode='42501';end if;
 select * into p from public.timplans where id=pid;
 if p.gym_basis is null or p.status not in ('utkast','atersand','faststalld') then
  raise exception 'APL-underlaget är låst för beslut.' using errcode='42501';end if;
 if tg_table_name='apl_plan_underlag' and tg_op<>'DELETE' then
  if (new.organizer_id,new.unit_id,new.offering_id) is distinct from (p.organizer_id,p.unit_id,p.offering_id) then
   raise exception 'Ogiltig APL-koppling till skola och utbildning.' using errcode='42501';end if;
  if tg_op='UPDATE' and new.created_at is distinct from old.created_at then raise exception 'APL-ursprung är låst.' using errcode='42501';end if;
 elsif tg_table_name='apl_period_contents' and tg_op<>'DELETE' then
  if not exists(select 1 from jsonb_array_elements(p.gym_basis->'rows') r where r->>'key'=new.row_key) then
   raise exception 'Innehållet saknas i fryst programkälla.' using errcode='22023',hint='unknown_content';end if;
 elsif tg_table_name='apl_rector_confirmations' then
  a:=public.phase5_programplan_actor();
  if a.function<>'rektor' or new.unit_id<>p.unit_id or new.actor_id<>public.current_identity_id() or new.assignment_id<>a.id or new.revision<>public.phase5_apl_workflow_revision(p.id) then
   raise exception 'Bekräftelsen kräver rektors aktuella mandat.' using errcode='42501';end if;
 elsif tg_table_name='apl_plan_copy_reviews' then
  if tg_op='DELETE' then raise exception 'Kopieringsunderlag får inte raderas.' using errcode='42501';end if;
  if tg_op='INSERT' then
   if not exists(select 1 from public.timplans source where source.id=new.source_plan_id and source.version=new.source_version
     and (source.organizer_id,source.unit_id,source.offering_id)=(p.organizer_id,p.unit_id,p.offering_id))
    or new.resolved_at is not null or not public.phase5_apl_text(to_jsonb(new.source_period_name),120) then
    raise exception 'Ogiltigt ursprung för kopieringsgranskningen.' using errcode='42501';end if;
   perform public.phase5_apl_plan_parse(jsonb_build_object('contractVersion','structured_v1','educationForm','unknown','classification','unreviewed',
    'periods',jsonb_build_array(jsonb_build_object('id',new.source_period_id,'name',new.source_period_name,'startsOn',null,'endsOn',null,'schoolYear',null,
    'extent',jsonb_build_object('basis','unknown','weeks',null,'reviewed',false,'reviewNote',''),'contents',new.contents,'allocations',new.allocations))));
  end if;
  if tg_op='UPDATE' then
   if old.resolved_at is not null or new.resolved_at is null
   or (to_jsonb(new)-array['resolved_actor_id','resolved_assignment_id','resolved_at','resolution_note'])
    is distinct from (to_jsonb(old)-array['resolved_actor_id','resolved_assignment_id','resolved_at','resolution_note']) then
    raise exception 'Kopieringsunderlaget är oföränderligt.' using errcode='42501';end if;
   a:=public.phase5_programplan_actor();
   if new.resolved_actor_id<>public.current_identity_id() or new.resolved_assignment_id<>a.id then
    raise exception 'Granskningsansvar saknar aktuellt mandat.' using errcode='42501';end if;
  end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;

create or replace function public.phase5_apl_plan_projection(target_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;a public.access_assignments;gym jsonb;plan jsonb;reviews jsonb;program jsonb;history jsonb;editable boolean;organizer_reviews jsonb;
begin
 select * into p from public.timplans where id=target_plan;
 a:=public.phase5_programplan_actor();gym:=public.phase5_gym_timplan_result(p.id);
 plan:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 if plan is not null then
  plan:=public.phase5_apl_plan_parse(plan);perform public.phase5_apl_validate_allocations(gym,plan);
 end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'planId',e.plan_id,'unitId',e.unit_id,'actorId',e.actor_id,'assignmentId',e.assignment_id,
  'actorName',e.actor_name,'at',to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'revision',e.revision,'contentHash',e.content_hash,'comment',e.comment) order by e.revision),'[]') into history
 from public.apl_rector_confirmations e where e.plan_id=p.id;
 editable:=program->>'category'='VOCATIONAL_PROGRAM' and p.status='faststalld' and gym->'archived'='false'::jsonb;
 select coalesce(jsonb_agg(jsonb_build_object('id',e.id,'planId',e.plan_id,'unitId',e.unit_id,'actorId',e.actor_id,'assignmentId',e.assignment_id,
  'actorName',e.actor_name,'at',to_char(e.occurred_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'revision',e.revision,'contentHash',e.content_hash,'comment',e.comment,
  'timplanRevision',e.timplan_revision,'rectorConfirmationId',e.rector_confirmation_id) order by e.revision),'[]') into organizer_reviews from public.apl_organizer_reviews e where e.plan_id=p.id;
 return jsonb_build_object('revisionScope','apl','timplanRevision',p.revision,'reviews',organizer_reviews,'contractVersion','structured_v1','planId',p.id,'revision',public.phase5_apl_workflow_revision(p.id),'organizerId',p.organizer_id,
  'program',program,'plan',plan,'copyReview',reviews,'contentHash',public.phase5_apl_hash_value(gym,p.organizer_id,plan,reviews,program),
  'confirmations',history,'capabilities',jsonb_build_object('canSave',editable and a.function in ('rektor','administrator'),'canConfirm',editable and a.function='rektor','canReview',editable and a.function='huvudman'));
end $$;

create or replace function public.phase5_apl_plan_basis(target_plan uuid) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('organizerId',p.organizer_id,'gymTimplan',public.phase5_gym_timplan_result(p.id),'copyReview',public.phase5_apl_copy_review(p.id),
 'aplRevision',public.phase5_apl_workflow_revision(p.id)) from public.timplans p where p.id=target_plan
$$;

create or replace function public.phase5_apl_plan_audit(target_plan uuid,operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if target_plan is null or operation is null or operation not in ('apl_plan_read','apl_plan_status_read','apl_plan_saved','apl_plan_unchanged','apl_placement_confirmed','apl_organizer_reviewed') then
  raise exception 'Ogiltig APL-loggning.' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'timplan',target_plan,'ok','{}');
 exception when others then raise exception 'APL-loggningen är inte tillgänglig.' using errcode='55000';end;
end $$;

create or replace function public.phase5_apl_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;target_plan uuid;request_id uuid;p public.timplans;a public.access_assignments;s public.app_sessions;r public.apl_plan_commands;
 gym jsonb;previous jsonb;next_plan jsonb;reviews jsonb;program jsonb;content_hash text;next_hash text;changed boolean;receipt jsonb;detail jsonb;envelope jsonb;
 period jsonb;content jsonb;allocation jsonb;resolution jsonb;confirmation_id uuid;now_at timestamptz;actor_name text;blockers jsonb;action_name text;apl_revision integer;review_id uuid;rector_id uuid;review_hash text;
begin
 q:=public.phase5_apl_plan_request(input);target_plan:=(q->>'planId')::uuid;request_id:=(q->>'commandId')::uuid;
 p:=public.phase5_apl_plan_scope(target_plan,false);a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if (q->>'action'='review' and a.function<>'huvudman') or (q->>'action'<>'review' and (a.function not in ('rektor','administrator') or (q->>'action'='confirm' and a.function<>'rektor'))) then
  raise exception 'APL-åtgärden kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5541));
 select * into r from public.apl_plan_commands where command_id=request_id;
 if found then
  if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.action,r.request)
    is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q) then
   raise exception 'APL-kommandot har ändrats.' using errcode='40001',hint='apl_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 if q->>'revisionScope' is distinct from 'apl' then raise exception 'Läs in den separata APL-planeringen igen.' using errcode='40001',hint='apl_workflow_required';end if;
 p:=public.phase5_apl_plan_scope(target_plan,false);
 if p.status<>'faststalld' or exists(select 1 from public.offerings where id=p.offering_id and archived_at is not null) then raise exception 'Godkänn timplanen före APL-planering.' using errcode='42501';end if;
 if p.revision<>(q->>'expectedTimplanRevision')::integer then raise exception 'Timplanen har ändrats.' using errcode='40001',hint='apl_timplan_revision_conflict';end if;
 apl_revision:=public.phase5_apl_workflow_revision(p.id);
 if apl_revision<>(q->>'expectedRevision')::integer then raise exception 'APL-underlaget har ändrats. Läs in det igen.' using errcode='40001',hint='apl_revision_conflict';end if;
 gym:=public.phase5_gym_timplan_result(p.id);previous:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 if program->>'category' is distinct from 'VOCATIONAL_PROGRAM' then raise exception 'APL används inte på högskoleförberedande program.' using errcode='22023',hint='apl_not_vocational';end if;
 content_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,previous,reviews,program);
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),p.id);
 insert into public.apl_workflow_states(plan_id,revision) values(p.id,0) on conflict(plan_id) do nothing;
 now_at:=date_trunc('milliseconds',clock_timestamp());
 if q->>'action'='save' then
  next_plan:=q->'plan';perform public.phase5_apl_validate_allocations(gym,next_plan);
  for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
   if not exists(select 1 from public.apl_plan_copy_reviews c where c.id=(resolution->>'id')::uuid and c.plan_id=p.id and c.resolved_at is null) then
    raise exception 'Granskningspunkten finns inte eller är redan hanterad. Läs in APL-underlaget igen.' using errcode='22023',hint='invalid_copy_review_resolution';end if;
  end loop;
  next_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,next_plan,reviews,program);
  changed:=next_hash<>content_hash or jsonb_array_length(q->'copyReviewResolutions')>0;
  if changed then
   insert into public.apl_plan_underlag(plan_id,organizer_id,unit_id,offering_id,education_form,classification,created_at,updated_at)
   values(p.id,p.organizer_id,p.unit_id,p.offering_id,next_plan->>'educationForm',next_plan->>'classification',now_at,now_at)
   on conflict(plan_id) do update set education_form=excluded.education_form,classification=excluded.classification,updated_at=excluded.updated_at;
   delete from public.apl_plan_periods where plan_id=p.id;
   for period in select value from jsonb_array_elements(next_plan->'periods') loop
    insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note,planned_term_index)
    values((period->>'id')::uuid,p.id,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
     period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,(period#>>'{extent,reviewed}')::boolean,period#>>'{extent,reviewNote}',(period->>'plannedTermIndex')::integer);
    for content in select value from jsonb_array_elements(period->'contents') loop
     insert into public.apl_period_contents(plan_id,period_id,row_key,description) values(p.id,(period->>'id')::uuid,content->>'rowKey',content->>'description');
    end loop;
    for allocation in select value from jsonb_array_elements(period->'allocations') loop
     insert into public.apl_time_allocations(plan_id,period_id,row_key,term_index,gut_minutes)
     values(p.id,(period->>'id')::uuid,allocation->>'rowKey',(allocation->>'termIndex')::integer,(allocation->>'gutMinutes')::integer);
    end loop;
   end loop;
   for resolution in select value from jsonb_array_elements(q->'copyReviewResolutions') loop
    update public.apl_plan_copy_reviews set resolved_actor_id=s.identity_id,resolved_assignment_id=a.id,resolved_at=now_at,resolution_note=resolution->>'note'
    where id=(resolution->>'id')::uuid and plan_id=p.id and resolved_at is null;
   end loop;
   update public.apl_workflow_states set revision=revision+1 where plan_id=p.id returning revision into apl_revision;
  end if;
  action_name:=case when changed then 'apl_plan_saved' else 'apl_plan_unchanged' end;
 elsif q->>'action'='confirm' then
  if content_hash<>q->>'expectedContentHash' then raise exception 'APL-innehållet har ändrats. Granska det igen.' using errcode='40001',hint='apl_content_conflict';end if;
  blockers:=public.phase5_apl_confirmation_blockers(gym,previous,reviews,program);
  if jsonb_array_length(blockers)>0 then raise exception 'APL-underlaget behöver kompletteras innan förläggningen kan bekräftas.' using errcode='40001',hint='apl_confirmation_blocked',detail=blockers::text;end if;
  if (select count(*) from public.apl_rector_confirmations e where e.plan_id=p.id)>=1000 then
   raise exception 'Skapa en ny timplansversion för fortsatt granskning.' using errcode='40001',hint='apl_confirmation_limit';end if;
  select i.display_name into actor_name from public.identities i where i.id=s.identity_id;
  if not public.phase5_apl_text(to_jsonb(actor_name),200,false) then actor_name:='Rektor';end if;
  changed:=true;confirmation_id:=gen_random_uuid();
  update public.apl_workflow_states set revision=revision+1 where plan_id=p.id returning revision into apl_revision;
  insert into public.apl_rector_confirmations(id,plan_id,unit_id,actor_id,assignment_id,actor_name,occurred_at,revision,content_hash,comment)
  values(confirmation_id,p.id,p.unit_id,s.identity_id,a.id,actor_name,now_at,apl_revision,content_hash,q->>'comment');
  action_name:='apl_placement_confirmed';
 else
  if content_hash<>q->>'expectedContentHash' then raise exception 'APL-innehållet har ändrats.' using errcode='40001',hint='apl_content_conflict';end if;
  blockers:=public.phase5_apl_confirmation_blockers(gym,previous,reviews,program);
  -- The latest confirmation must match; an older matching event cannot bypass a newer stale event.
  review_hash:=content_hash;
  select case when e.content_hash=review_hash then e.id end into rector_id from public.apl_rector_confirmations e where e.plan_id=p.id order by e.revision desc limit 1;
  if jsonb_array_length(blockers)>0 or rector_id is null then raise exception 'Rektor behöver bekräfta aktuellt APL-underlag före huvudmannens granskning.' using errcode='40001',hint='apl_confirmation_blocked';end if;
  if (select count(*) from public.apl_organizer_reviews where plan_id=p.id)>=1000 then raise exception 'Granskningshistoriken är full.' using errcode='40001',hint='apl_confirmation_limit';end if;
  select i.display_name into actor_name from public.identities i where i.id=s.identity_id;
  if not public.phase5_apl_text(to_jsonb(actor_name),200,false) then actor_name:='Huvudman';end if;
  changed:=true;review_id:=gen_random_uuid();
  update public.apl_workflow_states set revision=revision+1 where plan_id=p.id returning revision into apl_revision;
  insert into public.apl_organizer_reviews(id,plan_id,unit_id,actor_id,assignment_id,actor_name,occurred_at,revision,timplan_revision,rector_confirmation_id,content_hash,comment)
  values(review_id,p.id,p.unit_id,s.identity_id,a.id,actor_name,now_at,apl_revision,p.revision,rector_id,content_hash,q->>'comment');
  action_name:='apl_organizer_reviewed';
 end if;
 detail:=public.phase5_apl_plan_projection(p.id);
 receipt:=jsonb_build_object('contractVersion','structured_v1','commandId',request_id,'planId',p.id,'action',q->>'action','revision',apl_revision,
  'changed',changed,'replayed',false,'contentHash',detail->'contentHash','confirmationId',confirmation_id,'reviewId',review_id);
 envelope:=jsonb_build_object('contractVersion','apl_sql_v1','basis',public.phase5_apl_plan_basis(p.id),'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.apl_plan_commands(command_id,plan_id,organizer_id,unit_id,actor_identity_id,assignment_id,action,request,envelope)
 values(request_id,p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q,envelope);
 perform public.phase5_apl_plan_audit(p.id,action_name);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=p.id;
 return envelope;
end $$;

create or replace function public.phase5_apl_plan_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;p public.timplans;a public.access_assignments;s public.app_sessions;r public.apl_plan_commands;result jsonb;
begin
 if not public.phase5_programplan_shape(input,array['command']) then raise exception 'Ogiltig APL-statusfråga.' using errcode='22023',hint='invalid_apl_plan';end if;
 q:=public.phase5_apl_plan_request(input->'command');p:=public.phase5_apl_plan_scope((q->>'planId')::uuid,false);
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if (q->>'action'='review' and a.function<>'huvudman') or (q->>'action'<>'review' and (a.function not in ('rektor','administrator') or (q->>'action'='confirm' and a.function<>'rektor'))) then raise exception 'APL-status kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(q->>'commandId',5541));
 select * into r from public.apl_plan_commands where command_id=(q->>'commandId')::uuid;
 if r.command_id is null then
  result:=jsonb_build_object('contractVersion','apl_sql_v1','basis',null,'result',jsonb_build_object('state','not_found','result',null));
 else
  if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.action,r.request)
    is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q) then
   raise exception 'APL-kommandot har ändrats.' using errcode='40001',hint='apl_command_conflict';end if;
  result:=jsonb_build_object('contractVersion','apl_sql_v1','basis',r.envelope->'basis','result',jsonb_build_object('state','completed',
   'result',jsonb_set(r.envelope->'result','{receipt,replayed}','true'::jsonb,false)));
 end if;
 perform public.phase5_apl_plan_audit(p.id,'apl_plan_status_read');return result;
end $$;

create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;series jsonb;apl jsonb;time_rows jsonb;total_minutes bigint;v2 boolean:=false;
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
  v2:=exists(select 1 from public.timplan_time_models where plan_id=t.id);
  if v2 then
   time_rows:=public.phase5_timplan_time_rows(t.id);
   if exists(select 1 from public.timplan_time_models m cross join lateral jsonb_array_elements(m.copy_review) r where m.plan_id=t.id and r->'resolution'='null'::jsonb) then
    blockers:=blockers||jsonb_build_array('Kopieringen har tidsrader som behöver granskas innan timplanen godkänns.');end if;
   select coalesce(sum((v#>>'{}')::bigint),0) into total_minutes from jsonb_each(time_rows) r cross join lateral jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v;
   missing:=exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,5) i where (d->'points'->>i)::integer>0 and time_rows->(d->>'rowKey')->'schoolMinutes'->>i is null)
    or exists(select 1 from jsonb_array_elements(source->'distribution') d cross join generate_series(0,2) i where ((d->'points'->>(i*2))::integer>0 or (d->'points'->>(i*2+1))::integer>0) and time_rows->(d->>'rowKey')->'annualAplMinutes'->>i is null)
    or exists(select 1 from jsonb_each(time_rows) r where (select coalesce(sum((v#>>'{}')::bigint),0) from jsonb_array_elements((r.value->'schoolMinutes')||(r.value->'annualAplMinutes')) v)=0);
   if (select count(*) from jsonb_object_keys(time_rows))<>jsonb_array_length(source->'rows') or missing then blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
   profile:=public.phase5_plan_decision_profile(source);
   if profile is not null and total_minutes<(profile->>'hours')::bigint*60 then blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  else
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
  end if;
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
   jsonb_build_object('id',case when target_kind='programplan' then 'apl' else 'apl-budget' end,'label',case when target_kind='programplan' then 'APL:s omfattning och förläggning ska granskas separat efter timplanen.' else 'Jag har granskat den planerade APL-tiden i timplanens total. Perioder och förläggning granskas separat.' end));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);

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
 if v2 then basis_hash:='sha256:'||encode(sha256(convert_to(public.phase5_apl_canonical(jsonb_build_array('time_decision_v2',basis_hash,time_rows::text,(select copy_review::text from public.timplan_time_models where plan_id=target_id))),'UTF8')),'hex');end if;

 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('contractVersion',case when target_kind='timplan' then 'timetable_decision_v2' else 'apl_decision_v1' end,'apl',null,'series',series,'kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog) || case when v2 then jsonb_build_object('timeModel','school_terms_annual_apl_v2','timeRows',time_rows,'timeCopyReview',(select copy_review from public.timplan_time_models where plan_id=target_id)) else jsonb_build_object('hours',hours) end;
end $$;

alter table public.apl_plan_decision_receipts drop constraint apl_plan_decision_receipts_contract_version_check;
alter table public.apl_plan_decision_receipts add constraint apl_plan_decision_receipts_contract_version_check check(contract_version in ('apl_decision_v1','timetable_decision_v2'));


create or replace function public.phase5_apl_decision_receipt_required() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if coalesce(new.result->>'contractVersion','') not in ('apl_decision_v1','timetable_decision_v2') then
  raise exception 'Det nya beslutskvittot saknar kontraktsversion.' using errcode='55000';end if;
 return new;
end $$;

create or replace function public.phase5_plan_decision_basis(kind text,plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare result jsonb;frozen jsonb;
begin
 result:=public.phase5_plan_decision_detail(kind,plan_id);
 if result->'apl'<>'null'::jsonb then frozen:=public.phase5_apl_plan_basis(plan_id);end if;
 perform public.phase5_plan_decision_audit(kind,plan_id,'plan_decision_basis_read');
 return jsonb_build_object('contractVersion','apl_decision_sql_v1','resultContract',result->>'contractVersion',
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
 values(request_command_id,result->>'contractVersion',frozen);
 perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');
 return jsonb_build_object('contractVersion','apl_decision_sql_v1','resultContract',result->>'contractVersion',
  'replayed',false,'result',result,'aplBasis',frozen);
end $$;

revoke all on function public.phase5_apl_workflow_revision(uuid),public.phase5_apl_workflow_guard() from public,anon,authenticated,service_role,skolplattform_worker;
