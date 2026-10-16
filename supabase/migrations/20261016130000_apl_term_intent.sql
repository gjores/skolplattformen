-- Preliminary APL term intent. No backfill, dates, allocations or new privileges.
-- Absent intent preserves the original eight-element canonical period payload.
alter table public.apl_plan_periods add column planned_term_index smallint
  constraint apl_plan_periods_planned_term_index_check check (planned_term_index between 0 and 5);

create or replace function public.phase5_apl_plan_parse(v jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare p jsonb;e jsonb;c jsonb;a jsonb;periods jsonb:='[]';seen uuid[]:='{}';pid uuid;
 total_allocations integer:=0;
begin
 if not public.phase5_programplan_shape(v,array['contractVersion','educationForm','classification','periods'])
 or v->>'contractVersion' is distinct from 'structured_v1'
 or v->>'educationForm' is null or v->>'educationForm' not in ('school_based','apprenticeship','unknown')
 or v->>'classification' is null or v->>'classification' not in ('unreviewed','complete')
 or not public.phase5_programplan_array(v->'periods',100) then
  raise exception 'Ogiltigt APL-underlag.' using errcode='22023',hint='invalid_apl_plan';end if;
 for p in select value from jsonb_array_elements(v->'periods') loop
  if not public.phase5_programplan_shape(p - 'plannedTermIndex',array['id','name','startsOn','endsOn','schoolYear','extent','contents','allocations'])
  or (p ? 'plannedTermIndex' and not public.phase5_programplan_integer(p->'plannedTermIndex',0,5))
  or not public.phase5_apl_text(p->'name',120)
  or (p->'startsOn'<>'null'::jsonb and not public.phase5_apl_date(p->'startsOn'))
  or (p->'endsOn'<>'null'::jsonb and not public.phase5_apl_date(p->'endsOn'))
  or (p->'startsOn'<>'null'::jsonb and p->'endsOn'<>'null'::jsonb and p->>'startsOn'>p->>'endsOn')
  or (p->'schoolYear'<>'null'::jsonb and not public.phase5_programplan_integer(p->'schoolYear',2000,2100))
  or not public.phase5_programplan_array(p->'contents',200) or not public.phase5_programplan_array(p->'allocations',1200) then
   raise exception 'Ogiltig APL-period.' using errcode='22023',hint='invalid_apl_plan';end if;
  pid:=public.phase5_apl_uuid(p->'id');
  if pid=any(seen) then raise exception 'APL-perioden finns flera gånger.' using errcode='22023',hint='duplicate';end if;
  seen:=array_append(seen,pid);e:=p->'extent';
  if not public.phase5_programplan_shape(e,array['basis','weeks','reviewed','reviewNote'])
  or e->>'basis' is null or e->>'basis' not in ('whole_weeks','mixed_weeks','unknown')
  or jsonb_typeof(e->'reviewed') is distinct from 'boolean' or not public.phase5_apl_text(e->'reviewNote',2000)
  or (e->'weeks'<>'null'::jsonb and not public.phase5_programplan_integer(e->'weeks',1,160))
  or (e->>'basis'<>'whole_weeks' and (e->'weeks'<>'null'::jsonb or e->'reviewed'<>'false'::jsonb))
  or (e->'reviewed'='true'::jsonb and (e->'weeks'='null'::jsonb or e->>'reviewNote'='')) then
   raise exception 'Ogiltigt omfattningsunderlag för APL.' using errcode='22023',hint='invalid_apl_plan';end if;
  for c in select value from jsonb_array_elements(p->'contents') loop
   if not public.phase5_programplan_shape(c,array['rowKey','description'])
   or not public.phase5_apl_row_key(c->'rowKey') or not public.phase5_apl_text(c->'description',2000) then
    raise exception 'Ogiltig innehållskoppling.' using errcode='22023',hint='invalid_apl_plan';end if;
  end loop;
  if (select count(*)<>count(distinct value->>'rowKey') from jsonb_array_elements(p->'contents')) then
   raise exception 'Innehållskopplingen finns flera gånger.' using errcode='22023',hint='duplicate';end if;
  for a in select value from jsonb_array_elements(p->'allocations') loop
   if not public.phase5_programplan_shape(a,array['rowKey','termIndex','gutMinutes'])
   or not public.phase5_apl_row_key(a->'rowKey')
   or not public.phase5_programplan_integer(a->'termIndex',0,5)
   or not public.phase5_programplan_integer(a->'gutMinutes',0,120000) then
    raise exception 'Ogiltig tidsfördelning.' using errcode='22023',hint='invalid_apl_plan';end if;
   if not exists(select 1 from jsonb_array_elements(p->'contents') x where x->>'rowKey'=a->>'rowKey') then
    raise exception 'Tidsfördelningen saknar innehållskoppling.' using errcode='22023',hint='allocation_without_content';end if;
  end loop;
  if (select count(*)<>count(distinct (value->>'rowKey',(value->>'termIndex')::integer)) from jsonb_array_elements(p->'allocations')) then
   raise exception 'Tidsfördelningen finns flera gånger.' using errcode='22023',hint='duplicate';end if;
  total_allocations:=total_allocations+jsonb_array_length(p->'allocations');
  periods:=periods||jsonb_build_array(p||jsonb_build_object('id',pid));
 end loop;
 if total_allocations>20000 then raise exception 'För många tidsfördelningar.' using errcode='22023',hint='invalid_apl_plan';end if;
 return v||jsonb_build_object('periods',periods);
end $$;

create or replace function public.phase5_apl_plan_value(target_plan uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('contractVersion',u.contract_version,'educationForm',u.education_form,'classification',u.classification,
 'periods',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'startsOn',to_char(p.starts_on,'YYYY-MM-DD'),'endsOn',to_char(p.ends_on,'YYYY-MM-DD'),
 'schoolYear',p.school_year,'extent',jsonb_build_object('basis',p.extent_basis,'weeks',p.whole_weeks,'reviewed',p.reviewed,'reviewNote',p.review_note),
 'contents',coalesce((select jsonb_agg(jsonb_build_object('rowKey',c.row_key,'description',c.description) order by c.row_key collate "C") from public.apl_period_contents c where c.plan_id=p.plan_id and c.period_id=p.id),'[]'),
 'allocations',coalesce((select jsonb_agg(jsonb_build_object('rowKey',a.row_key,'termIndex',a.term_index,'gutMinutes',a.gut_minutes) order by a.row_key collate "C",a.term_index) from public.apl_time_allocations a where a.plan_id=p.plan_id and a.period_id=p.id),'[]')) || case when p.planned_term_index is null then '{}'::jsonb else jsonb_build_object('plannedTermIndex',p.planned_term_index) end order by p.id)
 from public.apl_plan_periods p where p.plan_id=u.plan_id),'[]')) from public.apl_plan_underlag u where u.plan_id=target_plan
$$;

create or replace function public.phase5_apl_hash_payload(gym jsonb,organizer uuid,apl jsonb,reviews jsonb,program jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare source_data jsonb:=gym->'source'; basis_data jsonb:=gym->'source'->'basisReference';
 row_data jsonb; row_key text; row_part text; row_kind text; block_kind text; block_count integer;
 row_terms jsonb; row_hours jsonb; rows_payload jsonb:='[]'::jsonb;
 apl_payload jsonb:='null'::jsonb; period_data jsonb; periods_payload jsonb:='[]'::jsonb;
 contents_payload jsonb; allocations_payload jsonb; review_data jsonb; reviews_payload jsonb:='[]'::jsonb;
 resolution_payload jsonb;
begin
 if organizer is null or jsonb_typeof(gym) is distinct from 'object'
  or jsonb_typeof(source_data->'rows') is distinct from 'array'
  or jsonb_typeof(source_data->'distribution') is distinct from 'array'
  or jsonb_typeof(basis_data) is distinct from 'object'
  or jsonb_typeof(reviews) is distinct from 'array'
  or jsonb_typeof(program) is distinct from 'object' then
  raise exception 'APL hash context missing' using errcode='22023',hint='apl_invalid_contract';
 end if;
 -- projectGymTimplan derives these attributes from the verified source's exact
 -- catalog/rows. Raw source.rows contains key+points, not the UI rowKind/part.
 for row_data in select item.value from jsonb_array_elements(source_data->'rows') item(value)
  order by (item.value->>'key') collate "C" loop
  row_key:=row_data->>'key';
  if row_key like 'block:%' then
   row_kind:='block';
   select count(*),min(item.value->>'kind') into block_count,block_kind
    from jsonb_array_elements(coalesce(basis_data->'choiceBlocks','[]'::jsonb)) item(value)
    where item.value->>'id'=substr(row_key,7);
   if block_count<>1 then raise exception 'APL hash block does not match frozen source' using errcode='22023',hint='apl_invalid_contract';end if;
   row_part:=case block_kind when 'modernLanguage' then 'programmeSpecific' when 'languageSubject' then 'orientation'
    when 'naturalScience' then 'orientation' when 'specialization' then 'specialization' when 'individualChoice' then 'individualChoice' else null end;
  elsif row_key like 'alternative:%' then row_kind:='alternative';row_part:=split_part(row_key,':',2);
  elsif row_key='meta:diplomaWork' then row_kind:='diplomaWork';row_part:='diplomaWork';
  elsif row_key='meta:individualChoice' then
   -- Exactly matches the legacy GymTimplan projection. APL readiness still
   -- rejects this unspecified frame as verified subject-level content.
   row_kind:='fixed';row_part:='individualChoice';
  else row_kind:='fixed';row_part:=split_part(row_key,':',1);end if;
  if row_part is null or row_part not in ('foundation','programmeSpecific','orientation','specialization','individualChoice','diplomaWork') then
   raise exception 'APL hash row part invalid' using errcode='22023',hint='apl_invalid_contract';
  end if;
  select item.value->'points' into row_terms from jsonb_array_elements(source_data->'distribution') item(value)
   where item.value->>'rowKey'=row_key;
  row_terms:=coalesce(row_terms,'[0,0,0,0,0,0]'::jsonb);
  row_hours:=gym->'hours'->row_key;
  if jsonb_typeof(row_terms) is distinct from 'array' or jsonb_array_length(row_terms)<>6
   or jsonb_typeof(row_hours) is distinct from 'array' or jsonb_array_length(row_hours)<>6 then
   raise exception 'APL hash term matrix missing' using errcode='22023',hint='apl_invalid_contract';
  end if;
  rows_payload:=rows_payload||jsonb_build_array(jsonb_build_array(row_key,row_data->'points',row_part,row_kind,row_terms,row_hours));
 end loop;

 if apl is not null and apl<>'null'::jsonb then
  for period_data in select item.value from jsonb_array_elements(apl->'periods') item(value)
   order by (item.value->>'id') collate "C" loop
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
    order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
    from jsonb_array_elements(period_data->'contents') item(value);
   select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
    order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
    from jsonb_array_elements(period_data->'allocations') item(value);
   periods_payload:=periods_payload||jsonb_build_array(jsonb_build_array(
    period_data->'id',period_data->'name',period_data->'startsOn',period_data->'endsOn',period_data->'schoolYear',
    jsonb_build_array(period_data->'extent'->'basis',period_data->'extent'->'weeks',period_data->'extent'->'reviewed',period_data->'extent'->'reviewNote'),
    contents_payload,allocations_payload) || case when period_data ? 'plannedTermIndex'
     then jsonb_build_array(jsonb_build_array('planned_term_v1',period_data->'plannedTermIndex')) else '[]'::jsonb end);
  end loop;
  apl_payload:=jsonb_build_array(apl->'contractVersion',apl->'educationForm',apl->'classification',periods_payload);
 end if;

 for review_data in select item.value from jsonb_array_elements(reviews) item(value)
  order by (item.value->>'id') collate "C" loop
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'description')
   order by (item.value->>'rowKey') collate "C"),'[]'::jsonb) into contents_payload
   from jsonb_array_elements(review_data->'contents') item(value);
  select coalesce(jsonb_agg(jsonb_build_array(item.value->'rowKey',item.value->'termIndex',item.value->'gutMinutes')
   order by (item.value->>'rowKey') collate "C",(item.value->>'termIndex')::integer),'[]'::jsonb) into allocations_payload
   from jsonb_array_elements(review_data->'allocations') item(value);
  resolution_payload:=case when review_data->'resolution' is null or review_data->'resolution'='null'::jsonb then 'null'::jsonb
   else jsonb_build_array(review_data->'resolution'->'actorId',review_data->'resolution'->'assignmentId',review_data->'resolution'->'at',review_data->'resolution'->'note') end;
  reviews_payload:=reviews_payload||jsonb_build_array(jsonb_build_array(review_data->'id',review_data->'sourcePlanId',review_data->'sourceVersion',
   review_data->'sourcePeriodId',review_data->'sourcePeriodName',review_data->'reason',contents_payload,allocations_payload,resolution_payload));
 end loop;

 return jsonb_build_array('apl_content_v1',
  jsonb_build_array(organizer::text,gym->'unitId',gym->'offeringId',gym->'id',gym->'series'->'id',gym->'version'),
  jsonb_build_array(source_data->'planId',source_data->'version',source_data->'catalogId',basis_data->'startedOn',
   source_data->'education'->'programCode',source_data->'education'->'orientationCode',program->'version',program->'category',
   program->'startDate',program->'endDate',program->'canceledDate',program->'sourceSupported'),
  rows_payload,apl_payload,reviews_payload);
end $$;

create or replace function public.phase5_apl_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;target_plan uuid;request_id uuid;p public.timplans;a public.access_assignments;s public.app_sessions;r public.apl_plan_commands;
 gym jsonb;previous jsonb;next_plan jsonb;reviews jsonb;program jsonb;content_hash text;next_hash text;changed boolean;receipt jsonb;detail jsonb;envelope jsonb;
 period jsonb;content jsonb;allocation jsonb;resolution jsonb;confirmation_id uuid;now_at timestamptz;actor_name text;blockers jsonb;action_name text;
begin
 q:=public.phase5_apl_plan_request(input);target_plan:=(q->>'planId')::uuid;request_id:=(q->>'commandId')::uuid;
 p:=public.phase5_apl_plan_scope(target_plan,false);a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') or (q->>'action'='confirm' and a.function<>'rektor') then
  raise exception 'APL-åtgärden kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5541));
 select * into r from public.apl_plan_commands where command_id=request_id;
 if found then
  if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.action,r.request)
    is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q) then
   raise exception 'APL-kommandot har ändrats.' using errcode='40001',hint='apl_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 p:=public.phase5_apl_plan_scope(target_plan,true);
 if p.revision<>(q->>'expectedRevision')::integer then raise exception 'APL-underlaget har ändrats. Läs in det igen.' using errcode='40001',hint='apl_revision_conflict';end if;
 gym:=public.phase5_gym_timplan_result(p.id);previous:=public.phase5_apl_plan_value(p.id);reviews:=public.phase5_apl_copy_review(p.id);program:=public.phase5_apl_program(gym);
 content_hash:=public.phase5_apl_hash_value(gym,p.organizer_id,previous,reviews,program);
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),p.id);
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
   update public.timplans set revision=revision+1 where id=p.id returning * into p;
  end if;
  action_name:=case when changed then 'apl_plan_saved' else 'apl_plan_unchanged' end;
 else
  if content_hash<>q->>'expectedContentHash' then raise exception 'APL-innehållet har ändrats. Granska det igen.' using errcode='40001',hint='apl_content_conflict';end if;
  blockers:=public.phase5_apl_confirmation_blockers(gym,previous,reviews,program);
  if jsonb_array_length(blockers)>0 then raise exception 'APL-underlaget behöver kompletteras innan förläggningen kan bekräftas.' using errcode='40001',hint='apl_confirmation_blocked',detail=blockers::text;end if;
  if (select count(*) from public.apl_rector_confirmations e where e.plan_id=p.id)>=1000 then
   raise exception 'Skapa en ny timplansversion för fortsatt granskning.' using errcode='40001',hint='apl_confirmation_limit';end if;
  select i.display_name into actor_name from public.identities i where i.id=s.identity_id;
  if not public.phase5_apl_text(to_jsonb(actor_name),200,false) then actor_name:='Rektor';end if;
  changed:=true;confirmation_id:=gen_random_uuid();
  update public.timplans set revision=revision+1 where id=p.id returning * into p;
  insert into public.apl_rector_confirmations(id,plan_id,unit_id,actor_id,assignment_id,actor_name,occurred_at,revision,content_hash,comment)
  values(confirmation_id,p.id,p.unit_id,s.identity_id,a.id,actor_name,now_at,p.revision,content_hash,q->>'comment');
  action_name:='apl_placement_confirmed';
 end if;
 detail:=public.phase5_apl_plan_projection(p.id);
 receipt:=jsonb_build_object('contractVersion','structured_v1','commandId',request_id,'planId',p.id,'action',q->>'action','revision',p.revision,
  'changed',changed,'replayed',false,'contentHash',detail->'contentHash','confirmationId',confirmation_id);
 envelope:=jsonb_build_object('contractVersion','apl_sql_v1','basis',public.phase5_apl_plan_basis(p.id),'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.apl_plan_commands(command_id,plan_id,organizer_id,unit_id,actor_identity_id,assignment_id,action,request,envelope)
 values(request_id,p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q->>'action',q,envelope);
 perform public.phase5_apl_plan_audit(p.id,action_name);
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=p.id;
 return envelope;
end $$;

create or replace function public.phase5_apl_copy_structure(source_plan uuid,target_plan uuid) returns void
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
  insert into public.apl_plan_periods(id,plan_id,name,starts_on,ends_on,school_year,extent_basis,whole_weeks,reviewed,review_note,planned_term_index)
  values((period->>'id')::uuid,target_plan,period->>'name',(period->>'startsOn')::date,(period->>'endsOn')::date,(period->>'schoolYear')::integer,
   period#>>'{extent,basis}',(period#>>'{extent,weeks}')::integer,false,'',(period->>'plannedTermIndex')::integer);
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
