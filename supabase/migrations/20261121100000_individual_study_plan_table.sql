-- Komplettera flera planerade perioder i en gällande studieplan i ett sparande.
-- Tidigare revisioner och registrerad elevdialog förblir återläsbara.
alter table public.individual_study_plan_receipts
  drop constraint individual_study_plan_receipts_action_check,
  add constraint individual_study_plan_receipts_action_check
    check (action in ('prepare_draft','update_planned_dates','record_actual','record_decision','record_dialogue','make_current'));

create function public.individual_study_plan_edit_dates(content jsonb, payload jsonb)
returns jsonb
language plpgsql immutable set search_path=pg_catalog,public as $$
declare
  edits jsonb:=payload->'dates';
  edit jsonb; coordinates text[]; level_id uuid; attempt_id uuid; seen uuid[]:='{}';
begin
  perform public.phase4_keys(payload,array['dates']);
  if not public.phase5_programplan_array(edits,1500) or jsonb_array_length(edits)=0 then
    perform public.individual_study_plan_invalid();
  end if;
  for edit in select value from jsonb_array_elements(edits) loop
    perform public.phase4_keys(edit,array['levelId','attemptId','plannedStart','plannedEnd']);
    level_id:=public.tjanst_uuid(edit->'levelId');
    attempt_id:=public.tjanst_uuid(edit->'attemptId');
    if attempt_id=any(seen) then perform public.individual_study_plan_invalid(); end if;
    seen:=array_append(seen,attempt_id);
    select array['levels',(l.nr-1)::text,'attempts',(a.nr-1)::text] into coordinates
      from jsonb_array_elements(content->'levels') with ordinality l(value,nr)
      cross join lateral jsonb_array_elements(l.value->'attempts') with ordinality a(value,nr)
      where l.value->>'id'=level_id::text and a.value->>'id'=attempt_id::text;
    if coordinates is null then perform public.individual_study_plan_invalid(); end if;
    content:=jsonb_set(content,coordinates||array['plannedStart'],edit->'plannedStart');
    content:=jsonb_set(content,coordinates||array['plannedEnd'],edit->'plannedEnd');
  end loop;
  return content;
end $$;

revoke all on function public.individual_study_plan_edit_dates(jsonb,jsonb)
  from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.individual_study_plan_command(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  cmd jsonb:=input->'command'; payload jsonb:=cmd->'payload'; action text:=cmd->>'action';
  a public.access_assignments; pl public.pupil_placements; plan public.individual_study_plans;
  latest public.individual_study_plan_revisions; receipt public.individual_study_plan_receipts;
  cid uuid; digest bytea; result jsonb; basis jsonb; issues jsonb; next_content jsonb;
  effective date; dialogue_date date; reason text;
begin
  if action='record_actual' and input?'keepCurrentActual' then
    perform public.phase4_keys(input,array['command','content','keepCurrentActual']);
    if input->'keepCurrentActual' is distinct from 'true'::jsonb then
      perform public.individual_study_plan_invalid();
    end if;
  else
    perform public.phase4_keys(input,array['command','content']);
  end if;
  perform public.phase4_keys(cmd,array['contractVersion','unitId','pupilId','placementId','commandId','expectedRevision','expectedSourceToken','action','payload']);
  if action is null or action not in ('prepare_draft','update_planned_dates','record_actual','record_decision','record_dialogue','make_current')
    or not public.phase5_programplan_integer(cmd->'expectedRevision',0,2147483645)
    or jsonb_typeof(cmd->'expectedSourceToken') is distinct from 'string' or cmd->>'expectedSourceToken' !~ '^sha256:[0-9a-f]{64}$'
    or jsonb_typeof(payload) is distinct from 'object'
    or action<>'prepare_draft' and input->'content' is distinct from 'null'::jsonb then
    perform public.individual_study_plan_invalid();
  end if;
  a:=public.elective_staff_scope(public.tjanst_uuid(cmd->'unitId'));
  pl:=public.individual_study_plan_scope(cmd,a);
  if action in ('record_decision','make_current','update_planned_dates') and a.function<>'rektor' then
    raise exception 'Study plan decision denied' using errcode='42501';
  end if;
  -- The customer guard serializes scoped changes. Take the row locks before deriving the source token.
  perform 1 from public.pupils where id=pl.pupil_id for share;
  select * into strict pl from public.pupil_placements where id=pl.id for share;
  select * into plan from public.individual_study_plans p where p.placement_id=pl.id for update;
  select * into latest from public.individual_study_plan_revisions r where r.plan_id=plan.id order by r.revision desc limit 1;
  cid:=public.tjanst_uuid(cmd->'commandId');
  digest:=extensions.digest(convert_to(cmd::text,'UTF8'),'sha256');
  result:=public.individual_study_plan_scope_json(pl)||jsonb_build_object('commandId',cid);
  perform pg_advisory_xact_lock(hashtextextended(cid::text,112001));
  select * into receipt from public.individual_study_plan_receipts q where q.command_id=cid;
  if receipt.command_id is not null then
    if receipt.plan_id is distinct from plan.id or receipt.actor_identity_id is distinct from public.current_identity_id()
      or receipt.assignment_id is distinct from a.id or receipt.request_hash is distinct from digest then
      reason:='command';
    else
      perform public.individual_study_plan_audit(a,pl,'individual_study_plan_replayed');
      return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','saved','receipt',public.individual_study_plan_receipt_json(receipt)));
    end if;
  elsif (cmd->>'expectedRevision')::integer<>coalesce(latest.revision,0) then
    reason:='revision';
  else
    basis:=public.individual_study_plan_basis(pl,true);
    if basis->>'token' is distinct from cmd->>'expectedSourceToken'
      or (action<>'prepare_draft' and latest.plan_id is not null and latest.source_token is distinct from basis->>'token') then
      reason:='source';
    end if;
  end if;
  if reason is not null then
    return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','conflict','reason',reason,'latestRevision',coalesce(latest.revision,0)));
  end if;
  if coalesce(pl.ends_on,'infinity'::date)<public.app_today() or (plan.id is not null and plan.offering_id<>pl.offering_id) then
    raise exception 'Study plan placement closed' using errcode='42501';
  end if;
  if basis #>> '{path,regime}' is distinct from 'national_gy25' then
    return public.individual_study_plan_envelope(a,result||'{"status":"incomplete","issues":[{"code":"unsupported_path","field":"path"}]}'::jsonb);
  end if;
  if latest.plan_id is null and action<>'prepare_draft' then perform public.individual_study_plan_invalid(); end if;
  next_content:=latest.content;
  case action
    when 'prepare_draft' then
      next_content:=input->'content';
      perform public.individual_study_plan_validate_draft(next_content,latest.content,basis);
    when 'update_planned_dates' then
      if latest.state<>'current' then perform public.individual_study_plan_invalid(); end if;
      next_content:=public.individual_study_plan_edit_dates(next_content,payload);
      perform public.individual_study_plan_validate_draft(
        jsonb_set(next_content,'{dialogue}','null'::jsonb),latest.content,basis);
      effective:=greatest(latest.effective_on,public.app_today());
    when 'record_actual' then
      next_content:=public.individual_study_plan_actual(next_content,payload);
      if input?'keepCurrentActual' then
        -- Ett bekräftat faktum ändrar inget i den gällande planens innehållsbeslut.
        next_content:=jsonb_set(next_content,'{dialogue}',latest.content->'dialogue');
        effective:=latest.effective_on;
      end if;
    when 'record_decision' then
      perform public.phase4_keys(payload,array['decision']);
      next_content:=public.individual_study_plan_decision(next_content,payload->'decision');
    when 'record_dialogue' then
      perform public.phase4_keys(payload,array['on']);
      dialogue_date:=public.study_group_date(payload->'on');
      if latest.state<>'draft' or dialogue_date>public.app_today() then perform public.individual_study_plan_invalid(); end if;
      next_content:=next_content||jsonb_build_object('dialogue',jsonb_build_object('on',dialogue_date,'reviewedRevision',latest.revision));
    when 'make_current' then
      perform public.phase4_keys(payload,array['effectiveOn']);
      effective:=public.study_group_date(payload->'effectiveOn');
      if latest.state<>'draft' or effective<pl.starts_on or effective>coalesce(pl.ends_on,'infinity'::date) then
        perform public.individual_study_plan_invalid();
      end if;
      issues:=public.individual_study_plan_issues(next_content);
      if jsonb_array_length(issues)>0 then
        return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','incomplete','issues',issues));
      end if;
  end case;
  if plan.id is null then
    insert into public.individual_study_plans(placement_id,customer_id,pupil_id,unit_id,offering_id)
      values(pl.id,pl.customer_id,pl.pupil_id,pl.unit_id,pl.offering_id) returning * into plan;
  end if;
  insert into public.individual_study_plan_revisions(plan_id,revision,state,effective_on,catalog_id,source_token,content,actor_identity_id,assignment_id)
    values(plan.id,coalesce(latest.revision,0)+1,case when effective is null then 'draft' else 'current' end,
      effective,next_content #>> '{source,catalogId}',basis->>'token',next_content,public.current_identity_id(),a.id) returning * into latest;
  insert into public.individual_study_plan_receipts(command_id,plan_id,revision,assignment_id,actor_identity_id,action,request_hash)
    values(cid,plan.id,latest.revision,a.id,public.current_identity_id(),action,digest) returning * into receipt;
  perform public.individual_study_plan_audit(a,pl,'individual_study_plan_saved');
  return public.individual_study_plan_envelope(a,result||jsonb_build_object('status','saved','receipt',public.individual_study_plan_receipt_json(receipt)));
end $$;

-- En entydig gruppplacering ger ett valbart planeringsförslag. Faktiska datum
-- hämtas aldrig från gruppmedlemskapet.
create function public.individual_study_plan_date_suggestions(pl public.pupil_placements, content jsonb)
returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'levelId',level_id,'attemptId',attempt_id,
    'plannedStart',jsonb_build_object('kind','day','date',starts_on),
    'plannedEnd',jsonb_build_object('kind','day','date',ends_on))
    order by level_id,attempt_id),'[]'::jsonb)
  from (
    select l.value->>'id' as level_id, attempt.value->>'id' as attempt_id,
      min(m.starts_on) as starts_on,min(m.ends_on) as ends_on
    from public.study_group_memberships m
    join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
    cross join lateral jsonb_array_elements(content->'levels') l
    cross join lateral jsonb_array_elements(l.value->'attempts') attempt
    where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and g.organizer_id=pl.organizer_id
      and m.cancelled_at is null and g.active
      and m.starts_on>=pl.starts_on and m.ends_on<=coalesce(pl.ends_on,'infinity'::date)
      and not exists (
        select 1 from public.pupil_placements other
        where other.pupil_id=pl.pupil_id and other.unit_id=pl.unit_id and other.id<>pl.id
          and daterange(other.starts_on,other.ends_on,'[]') && daterange(m.starts_on,m.ends_on,'[]'))
      and l.value->>'kind'='gy25_level' and jsonb_array_length(l.value->'attempts')=1
      and g.subject_code=l.value->>'subjectCode' and to_jsonb(g.subject_version)=l.value->'subjectVersion'
      and g.item_code=l.value->>'itemCode' and g.language_code is not distinct from l.value->>'languageCode'
      and attempt.value->'plannedStart'='null'::jsonb and attempt.value->'plannedEnd'='null'::jsonb
      and attempt.value #>> '{actual,certainty}'='recorded'
      and attempt.value #> '{actual,start}'='null'::jsonb and attempt.value #> '{actual,end}'='null'::jsonb
    group by l.value->>'id',attempt.value->>'id'
    having count(*)=1
  ) suggested
$$;

revoke all on function public.individual_study_plan_date_suggestions(public.pupil_placements,jsonb)
  from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.individual_study_plan_read(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  fields text[]:=array['contractVersion','unitId','pupilId','placementId','on','view'];
  a public.access_assignments; pl public.pupil_placements; plan public.individual_study_plans;
  latest public.individual_study_plan_revisions; picked public.individual_study_plan_revisions;
  result jsonb; history jsonb; basis jsonb; on_date date;
  view_name text:=input->>'view';
begin
  if view_name is null or view_name not in ('current','history','options','impact') then
    perform public.individual_study_plan_invalid();
  end if;
  if view_name='history' and input?'revision' then
    if not public.phase5_programplan_integer(input->'revision',1,2147483646) then
      perform public.individual_study_plan_invalid();
    end if;
    fields:=fields||array['revision'];
  elsif view_name='impact' then
    fields:=fields||array['target'];
  elsif view_name='current' and input?'includeDateSuggestions' then
    if input->'includeDateSuggestions' is distinct from 'true'::jsonb then
      perform public.individual_study_plan_invalid();
    end if;
    fields:=fields||array['includeDateSuggestions'];
  end if;
  perform public.phase4_keys(input,fields);
  a:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
  pl:=public.individual_study_plan_scope(input,a);
  on_date:=public.study_group_date(input->'on');
  result:=public.individual_study_plan_scope_json(pl)||jsonb_build_object('view',view_name,'on',on_date);
  if view_name in ('options','impact') then
    result:=result||public.individual_study_plan_impact(input,pl,on_date);
  else
    select * into plan from public.individual_study_plans p where p.placement_id=pl.id;
    select * into latest from public.individual_study_plan_revisions r where r.plan_id=plan.id order by r.revision desc limit 1;
    if view_name='history' and input?'revision' then
      select * into picked from public.individual_study_plan_revisions r
        where r.plan_id=plan.id and r.revision=(input->>'revision')::integer;
    else
      picked:=public.individual_study_plan_on(plan.id,on_date);
    end if;
    select coalesce(jsonb_agg(public.individual_study_plan_revision_json(r,false) order by r.revision desc),'[]'::jsonb)
      into history from public.individual_study_plan_revisions r where r.plan_id=plan.id
      and (r.revision>latest.revision-4999 or r.revision=picked.revision);
    result:=result||jsonb_build_object('history',history);
    if view_name='current' then
      basis:=public.individual_study_plan_basis(pl,false);
      result:=result||jsonb_build_object(
        'current',public.individual_study_plan_revision_json(picked,true),
        'draft',case when latest.state='draft' then public.individual_study_plan_revision_json(latest,true) else null end,
        'latestRevision',coalesce(latest.revision,0),
        'canMakeCurrent',a.function='rektor' and coalesce(pl.ends_on,'infinity'::date)>=public.app_today(),
        'sourceToken',basis->>'token','basisStatus',case
          when basis #>> '{path,regime}' <> 'national_gy25' then 'unsupported'
          when basis #>> '{source,catalogId}' is null then 'incomplete' else 'ready' end,
        'basisIssues','[]'::jsonb,'availableLevels','[]'::jsonb,'calendar',basis->'calendar');
      if input?'includeDateSuggestions' then
        result:=result||jsonb_build_object('dateSuggestions',case
          when (latest.state='draft' or latest.revision=picked.revision)
            and coalesce(pl.ends_on,'infinity'::date)>=public.app_today()
            and basis #>> '{path,regime}'='national_gy25' then
            public.individual_study_plan_date_suggestions(pl,latest.content)
          else '[]'::jsonb end);
      end if;
    else
      result:=result||jsonb_build_object('version',public.individual_study_plan_revision_json(picked,true));
    end if;
  end if;
  perform public.individual_study_plan_audit(a,pl,'individual_study_plan_read');
  return public.individual_study_plan_envelope(a,result)||jsonb_build_object(
    'basis',basis,'latest',case when view_name='current' then public.individual_study_plan_revision_json(latest,true) else null end);
end $$;
