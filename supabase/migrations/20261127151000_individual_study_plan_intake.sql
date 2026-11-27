-- The first Swedish subject decision belongs to the pupil's school placement.
-- Record the outcome and actor. The school keeps assessment material separately.
create table public.individual_study_plan_swedish (
  placement_id uuid not null,
  customer_id uuid not null,
  pupil_id uuid not null,
  unit_id uuid not null,
  revision integer not null check (revision between 1 and 2147483646),
  subject text check (subject in ('SVEN','SVEA')),
  assessment text check (assessment in ('pending','confirmed')),
  effective_on date not null check (isfinite(effective_on)),
  actor_identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  recorded_at timestamptz not null default clock_timestamp(),
  command_id uuid not null unique,
  request_hash text not null,
  primary key (placement_id,revision),
  foreign key (placement_id,customer_id,pupil_id,unit_id)
    references public.pupil_placements(id,customer_id,pupil_id,unit_id),
  check ((subject is not distinct from 'SVEA') = (assessment is not null))
);

create table public.individual_study_plan_intake_receipts (
  command_id uuid primary key,
  customer_id uuid not null references public.customers(id),
  unit_id uuid not null references public.school_units(id),
  actor_identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  request_hash text not null,
  rows jsonb not null check (jsonb_typeof(rows)='array'),
  recorded_at timestamptz not null default clock_timestamp()
);

do $$
declare name text;
begin
  foreach name in array array['individual_study_plan_swedish','individual_study_plan_intake_receipts'] loop
    execute format('alter table public.%I enable row level security',name);
    execute format('alter table public.%I force row level security',name);
    execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',name);
    execute format('create trigger individual_study_plan_immutable before update or delete or truncate on public.%I for each statement execute function public.elective_time_immutable()',name);
  end loop;
end $$;

create function public.individual_study_plan_swedish_json(pick public.individual_study_plan_swedish)
returns jsonb language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('revision',coalesce(pick.revision,0),'subject',pick.subject,
    'assessment',pick.assessment,'effectiveOn',pick.effective_on)
$$;

alter function public.individual_study_plan_basis(public.pupil_placements,boolean) rename to individual_study_plan_basis_before_swedish;
create function public.individual_study_plan_basis(pl public.pupil_placements, lock_sources boolean default false)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare basis jsonb; pick public.individual_study_plan_swedish;
begin
  basis:=public.individual_study_plan_basis_before_swedish(pl,lock_sources);
  select * into pick from public.individual_study_plan_swedish s where s.placement_id=pl.id order by s.revision desc limit 1;
  if pick.revision is not null then
    basis:=jsonb_set(basis,'{source,swedishSubject}',public.individual_study_plan_swedish_json(pick));
    basis:=jsonb_set(basis,'{token}',to_jsonb(public.tjanst_hash(basis-array['token','calendar'])));
  end if;
  return basis;
end $$;

-- En obruten källpinne krävs även vid anrop från Worker med förberett innehåll.
alter function public.individual_study_plan_validate_draft(jsonb,jsonb,jsonb) rename to individual_study_plan_validate_draft_before_swedish;
create function public.individual_study_plan_validate_draft(content jsonb, prior jsonb, basis jsonb)
returns void language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare pick jsonb:=basis#>'{source,swedishSubject}'; choice jsonb; item_count integer; program jsonb; expected jsonb; actual jsonb;
  missing constant jsonb:='[{"code":"swedish_subject_required","field":"svenska"}]'::jsonb;
begin
  perform public.individual_study_plan_validate_draft_before_swedish(content,prior,basis);
  if pick is null and not coalesce(prior->'sourceIssues'@>missing,false) and not coalesce(content->'sourceIssues'@>missing,false) then return; end if;
  if pick is null and not content->'sourceIssues'@>missing then perform public.individual_study_plan_invalid(); end if;
  select count(*),jsonb_agg(item)->0 into item_count,choice from jsonb_array_elements(content->'choices') item where item->>'id'='svenska';
  if basis#>>'{source,catalogId}' is null and item_count=0 then return; end if;
  if item_count<>1 then perform public.individual_study_plan_invalid(); end if;
  if pick->>'subject' is null or pick->>'assessment'='pending' then
    if choice->>'state' is distinct from 'unresolved' or choice->'levelIds' is distinct from '[]'::jsonb then
      perform public.individual_study_plan_invalid();
    end if;
    return;
  end if;
  select p into program from public.programplan_catalogs c cross join lateral jsonb_array_elements(c.payload->'programs') p
    where c.catalog_id=basis#>>'{source,catalogId}' and p->>'code'=basis#>>'{path,programCode}'
      and p->'version'=basis#>'{source,programVersion}';
  select coalesce(jsonb_agg(jsonb_build_array(l->>'code',s->'subjectVersion',l->'points') order by l->>'code'),'[]'::jsonb)
    into expected from jsonb_array_elements((program->'foundation')||(program->'programmeSpecific')) s
      cross join lateral jsonb_array_elements(s->'levels') l where s->>'code'=pick->>'subject' and s->'optional'='true'::jsonb;
  select coalesce(jsonb_agg(jsonb_build_array(l->>'itemCode',l->'subjectVersion',l->'points') order by l->>'itemCode'),'[]'::jsonb)
    into actual from jsonb_array_elements(content->'levels') l where (choice->'levelIds')?(l->>'id')
      and l->>'subjectCode'=pick->>'subject';
  if expected='[]'::jsonb then
    if choice->>'state' is distinct from 'unresolved' or choice->'levelIds' is distinct from '[]'::jsonb then
      perform public.individual_study_plan_invalid();
    end if;
  elsif expected is distinct from actual or jsonb_array_length(actual)<>jsonb_array_length(choice->'levelIds')
    or choice->>'state' is distinct from 'confirmed' then
    perform public.individual_study_plan_invalid();
  end if;
end $$;

create function public.individual_study_plan_intake_row(pl public.pupil_placements, on_date date)
returns jsonb language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare pick public.individual_study_plan_swedish; latest public.individual_study_plan_revisions; approved public.individual_study_plan_revisions;
  subjects jsonb; status text; plan_subject text; subject_writable boolean;
begin
  select * into pick from public.individual_study_plan_swedish s where s.placement_id=pl.id order by s.revision desc limit 1;
  select r.* into latest from public.individual_study_plans p join public.individual_study_plan_revisions r on r.plan_id=p.id
    where p.placement_id=pl.id order by r.revision desc limit 1;
  subject_writable:=coalesce(pl.ends_on,'infinity'::date)>=public.app_today()
    and not exists(select 1 from public.individual_study_plan_revisions r where r.plan_id=latest.plan_id and r.state='current');
  if pick.revision is null and latest.plan_id is not null then
    approved:=public.individual_study_plan_on(latest.plan_id,on_date);
    select min(l->>'subjectCode') into plan_subject
    from jsonb_array_elements(approved.content->'choices') c cross join lateral jsonb_array_elements(approved.content->'levels') l
    where c->>'id'='svenska' and c->>'state'='confirmed' and (c->'levelIds')?(l->>'id') and l->>'subjectCode' in ('SVEN','SVEA')
    having count(distinct l->>'subjectCode')=1;
  end if;
  status:=case when latest.plan_id is null then 'none' when latest.state='current' then 'current'
    when pick.revision is not null and (pick.subject is null or pick.assessment='pending'
      or latest.content#>'{source,swedishSubject}' is distinct from public.individual_study_plan_swedish_json(pick)) then 'needs_completion'
    when public.individual_study_plan_issues(latest.content)<>'[]'::jsonb then 'needs_completion' else 'ready' end;
  select coalesce(jsonb_agg(distinct g.subject_code order by g.subject_code),'[]'::jsonb) into subjects
  from public.study_group_memberships m join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
  where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and g.organizer_id=pl.organizer_id and m.cancelled_at is null
    and g.active and g.subject_code in ('SVEN','SVEA') and g.subject_version is not null
    and on_date between greatest(m.starts_on,g.starts_on) and least(m.ends_on,g.ends_on)
    and m.starts_on>=pl.starts_on and m.ends_on<=coalesce(pl.ends_on,'infinity'::date)
    and not exists (select 1 from public.pupil_placements competing where competing.id<>pl.id and competing.pupil_id=pl.pupil_id
      and competing.unit_id=pl.unit_id and daterange(competing.starts_on,competing.ends_on,'[]')&&daterange(m.starts_on,m.ends_on,'[]'));
  return jsonb_build_object('pupilId',pl.pupil_id,'placementId',pl.id,'swedish',public.individual_study_plan_swedish_json(pick),
    'groupSubjects',subjects,'canSaveSwedish',subject_writable,'currentPlanSubject',plan_subject,
    'plan',jsonb_build_object('planId',latest.plan_id,'revision',coalesce(latest.revision,0),'status',status));
end $$;

create function public.individual_study_plan_intake_basis(pl public.pupil_placements)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare basis jsonb; program_terms jsonb;
begin
  basis:=public.individual_study_plan_basis(pl,false);
  select jsonb_build_object('cohortStartYear',extract(year from (b.started_on-interval '6 months'))::integer,'distribution',p.term_distribution)
    into program_terms from public.offerings o
    join public.offering_units u on u.offering_id=o.id and u.organizer_id=o.organizer_id and u.unit_id=pl.unit_id
    join public.point_plans p on p.offering_id=o.id and p.organizer_id=o.organizer_id
    cross join lateral (select (p.basis_reference->>'startedOn')::date as started_on) b
    where o.id=pl.offering_id and o.organizer_id=pl.organizer_id and o.lifecycle_revision=(basis->>'offeringRevision')::integer
      and o.start_year between 1900 and 9996 and o.start_year=extract(year from b.started_on)
      and p.id=(basis#>>'{programPlan,id}')::uuid and p.status='faststalld' and p.version=(basis#>>'{programPlan,version}')::integer
      and p.revision=(basis#>>'{programPlan,revision}')::integer and p.term_distribution<>'[]'::jsonb;
  return case when program_terms is null then basis else basis||jsonb_build_object('programTerms',program_terms) end;
end $$;

create function public.individual_study_plan_intake(input jsonb)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare action text:=input->>'action'; actor public.access_assignments; unit uuid; cid uuid; pl public.pupil_placements;
  pick public.individual_study_plan_swedish; receipt public.individual_study_plan_intake_receipts;
  picked_on date; subject text; assessment text; basis jsonb; row_data jsonb; receipt_row jsonb; row_input jsonb;
  result jsonb:='[]'::jsonb; request_hash text; command jsonb; outcome text; identity_id uuid;
  shared constant jsonb:='{"contractVersion":"individual_study_plan_v1"}'::jsonb;
begin
  unit:=public.tjanst_uuid(input->'unitId');
  actor:=public.elective_staff_scope(unit);
  if actor.scope_kind is distinct from 'school' then raise exception 'Study plan intake denied' using errcode='42501'; end if;
  identity_id:=public.current_identity_id();

  if action in ('read','preview_drafts') then
    perform public.phase4_keys(input,array['action','unitId','on','pupils']);
    picked_on:=public.study_group_date(input->'on');
    if not public.phase5_programplan_array(input->'pupils',100) then perform public.individual_study_plan_invalid(); end if;
    for row_input in select value from jsonb_array_elements(input->'pupils') loop
      perform public.phase4_keys(row_input,array['pupilId','placementId']);
      pl:=public.individual_study_plan_scope(shared||row_input||jsonb_build_object('unitId',unit),actor);
      row_data:=public.individual_study_plan_intake_row(pl,greatest(pl.starts_on,least(picked_on,coalesce(pl.ends_on,'infinity'::date))));
      if action='preview_drafts' then
        select row_data||jsonb_build_object('displayName',p.display_name,'educationName',o.name,
          'closed',coalesce(pl.ends_on,'infinity'::date)<public.app_today()) into row_data
          from public.pupils p,public.offerings o where p.id=pl.pupil_id and o.id=pl.offering_id;
        basis:=case when row_data#>>'{plan,status}'='none' and row_data->'closed'='false'::jsonb
          then public.individual_study_plan_intake_basis(pl) else null end;
        row_data:=row_data||jsonb_build_object('basis',basis);
      end if;
      perform public.individual_study_plan_audit(actor,pl,'individual_study_plan_intake_read');
      result:=result||jsonb_build_array(row_data);
    end loop;
    return jsonb_build_object('rows',result,'canConfirmAssessment',actor.function='rektor');
  end if;

  cid:=public.tjanst_uuid(input->'commandId');
  if action in ('save_swedish','swedish_status') then
    perform public.phase4_keys(input,case when action='save_swedish'
      then array['action','unitId','pupilId','placementId','commandId','expectedRevision','effectiveOn','subject','assessment']
      else array['action','unitId','pupilId','placementId','commandId'] end);
    pl:=public.individual_study_plan_scope(shared||input,actor);
    select * into pick from public.individual_study_plan_swedish s where s.command_id=cid
      and s.customer_id=actor.customer_id and s.unit_id=unit and s.placement_id=pl.id
      and s.assignment_id=actor.id and s.actor_identity_id=identity_id;
    if action='swedish_status' then
      perform public.individual_study_plan_audit(actor,pl,'individual_study_plan_swedish_status');
      return case when pick.revision is null then null else jsonb_build_object('commandId',cid,'pupilId',pl.pupil_id,
        'placementId',pl.id,'swedish',public.individual_study_plan_swedish_json(pick)) end;
    end if;
    request_hash:=public.tjanst_hash(input);
    perform pg_advisory_xact_lock(hashtextextended(cid::text,112002));
    if pick.revision is not null then
      if pick.request_hash is distinct from request_hash then raise exception 'Swedish choice changed' using errcode='40001'; end if;
    else
      subject:=input->>'subject'; assessment:=input->>'assessment'; picked_on:=public.study_group_date(input->'effectiveOn');
      if not public.phase5_programplan_integer(input->'expectedRevision',0,2147483645)
        or coalesce(subject,'') not in ('','SVEN','SVEA') or coalesce(assessment,'') not in ('','pending','confirmed')
        or (subject is not distinct from 'SVEA')<>(assessment is not null) then perform public.individual_study_plan_invalid(); end if;
      if assessment='confirmed' and actor.function<>'rektor' then raise exception 'Swedish assessment denied' using errcode='42501'; end if;
      select * into strict pl from public.pupil_placements p where p.id=pl.id for share;
      if coalesce(pl.ends_on,'infinity'::date)<public.app_today() or picked_on not between pl.starts_on and coalesce(pl.ends_on,'infinity'::date) then
        perform public.individual_study_plan_invalid();
      end if;
      basis:=public.individual_study_plan_basis(pl,true);
      if basis#>>'{path,regime}' is distinct from 'national_gy25' then raise exception 'Study plan intake denied' using errcode='42501'; end if;
      if exists(select 1 from public.individual_study_plans p join public.individual_study_plan_revisions r on r.plan_id=p.id
        where p.placement_id=pl.id and (r.state='current' or exists (select 1 from jsonb_array_elements(r.content->'levels') l
          cross join lateral jsonb_array_elements(l->'attempts') a where l->>'subjectCode' in ('SVEN','SVEA')
            and l->>'subjectCode' is distinct from subject and (a#>>'{actual,start,on}' is not null or a#>>'{actual,end,on}' is not null)))) then
        raise exception 'Swedish choice requires later study plan workflow' using errcode='40001',hint='study_plan_swedish_later_change';
      end if;
      select * into pick from public.individual_study_plan_swedish s where s.placement_id=pl.id order by s.revision desc limit 1;
      if coalesce(pick.revision,0)<>(input->>'expectedRevision')::integer then
        raise exception 'Swedish choice changed' using errcode='40001',hint='study_plan_swedish_changed';
      end if;
      if pick.assessment='confirmed' and actor.function<>'rektor' then raise exception 'Swedish assessment denied' using errcode='42501'; end if;
      insert into public.individual_study_plan_swedish(placement_id,customer_id,pupil_id,unit_id,revision,subject,assessment,effective_on,
        actor_identity_id,assignment_id,command_id,request_hash)
        values(pl.id,pl.customer_id,pl.pupil_id,unit,coalesce(pick.revision,0)+1,subject,assessment,picked_on,identity_id,actor.id,cid,request_hash)
        returning * into pick;
    end if;
    perform public.individual_study_plan_audit(actor,pl,'individual_study_plan_swedish_saved');
    return jsonb_build_object('row',public.individual_study_plan_intake_row(pl,pick.effective_on),'receipt',
      jsonb_build_object('commandId',cid,'pupilId',pl.pupil_id,'placementId',pl.id,'swedish',public.individual_study_plan_swedish_json(pick)));
  end if;

  if action not in ('drafts_status','replay_drafts','save_drafts') then perform public.individual_study_plan_invalid(); end if;
  perform public.phase4_keys(input,case action when 'drafts_status' then array['action','unitId','commandId']
    when 'replay_drafts' then array['action','unitId','commandId','requestHash']
    else array['action','unitId','commandId','requestHash','on','pupils','commands'] end);
  request_hash:=input->>'requestHash';
  perform pg_advisory_xact_lock(hashtextextended(cid::text,112003));
  select * into receipt from public.individual_study_plan_intake_receipts r where r.command_id=cid and r.customer_id=actor.customer_id
    and r.unit_id=unit and r.assignment_id=actor.id and r.actor_identity_id=identity_id;
  if receipt.command_id is not null then
    if action<>'drafts_status' and receipt.request_hash is distinct from request_hash then raise exception 'Intake command changed' using errcode='40001'; end if;
    for row_input in select value from jsonb_array_elements(receipt.rows) loop
      pl:=public.individual_study_plan_scope(shared||row_input||jsonb_build_object('unitId',unit),actor);
      perform public.individual_study_plan_audit(actor,pl,'individual_study_plan_intake_status');
    end loop;
    return jsonb_build_object('commandId',cid,'rows',receipt.rows);
  end if;
  if action<>'save_drafts' then return null; end if;
  if coalesce(request_hash,'') !~ '^sha256:[0-9a-f]{64}$' or not public.phase5_programplan_array(input->'pupils',100)
    or not public.phase5_programplan_array(input->'commands',100) or jsonb_array_length(input->'pupils')=0 then
    perform public.individual_study_plan_invalid();
  end if;
  picked_on:=public.study_group_date(input->'on');
  for row_input in select value from jsonb_array_elements(input->'pupils') loop
    perform public.phase4_keys(row_input,array['pupilId','placementId']);
    pl:=public.individual_study_plan_scope(shared||row_input||jsonb_build_object('unitId',unit),actor);
    select value into command from jsonb_array_elements(input->'commands') where value#>>'{command,placementId}'=pl.id::text;
    row_data:=public.individual_study_plan_intake_row(pl,picked_on)->'plan';
    outcome:=case when row_data->>'planId' is null then 'blocked' else 'existing' end;
    if command is not null then
      if command#>>'{command,unitId}' is distinct from unit::text or command#>>'{command,pupilId}' is distinct from pl.pupil_id::text
        or command#>>'{command,action}' is distinct from 'prepare_draft' or command#>'{command,expectedRevision}' is distinct from '0'::jsonb then
        perform public.individual_study_plan_invalid();
      end if;
      receipt_row:=public.individual_study_plan_command(command)->'result';
      outcome:=case when receipt_row->>'status'='saved' then 'saved' when row_data->>'planId' is not null then 'existing' else 'changed' end;
      if outcome='saved' then row_data:=receipt_row#>'{receipt,snapshot}'; end if;
    end if;
    perform public.individual_study_plan_audit(actor,pl,'individual_study_plan_intake_saved');
    result:=result||jsonb_build_array(row_input||jsonb_build_object('outcome',outcome,'planId',row_data->'planId','revision',row_data->'revision'));
  end loop;
  insert into public.individual_study_plan_intake_receipts(command_id,customer_id,unit_id,actor_identity_id,assignment_id,request_hash,rows)
    values(cid,actor.customer_id,unit,identity_id,actor.id,request_hash,result);
  return jsonb_build_object('commandId',cid,'rows',result);
end $$;

revoke all on function public.individual_study_plan_swedish_json(public.individual_study_plan_swedish),
  public.individual_study_plan_basis(public.pupil_placements,boolean),public.individual_study_plan_validate_draft(jsonb,jsonb,jsonb),
  public.individual_study_plan_intake_row(public.pupil_placements,date),public.individual_study_plan_intake_basis(public.pupil_placements),
  public.individual_study_plan_intake(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.individual_study_plan_intake(jsonb) to skolplattform_worker;
