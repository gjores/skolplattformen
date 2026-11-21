-- SP-09. Ett daterat klassurval bereder separata individuella utkast. Körningen
-- binder granskade källor och återläsning till samma skoluppdrag och aktör.
create table public.individual_study_plan_class_runs (
  id uuid primary key,
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid not null,
  class_id uuid not null,
  actor_identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  selected_on date not null check (isfinite(selected_on)),
  start_token text not null check (start_token ~ '^sha256:[0-9a-f]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (class_id,customer_id,organizer_id,unit_id)
    references public.school_classes(id,customer_id,organizer_id,unit_id)
);
create index individual_study_plan_class_runs_scope_idx on public.individual_study_plan_class_runs
  (actor_identity_id,assignment_id,unit_id,class_id,created_at desc,id desc);

create table public.individual_study_plan_class_items (
  run_id uuid not null references public.individual_study_plan_class_runs(id),
  command_id uuid primary key default gen_random_uuid(),
  position integer not null check (position between 1 and 100),
  pupil_id uuid not null,
  placement_id uuid not null,
  membership_id uuid not null,
  membership_token text not null check (membership_token ~ '^sha256:[0-9a-f]{64}$'),
  source_token text not null check (source_token ~ '^sha256:[0-9a-f]{64}$'),
  outcome text not null default 'pending' check (outcome in ('pending','saved','existing','changed')),
  unique (run_id,position),
  unique (run_id,pupil_id),
  unique (run_id,placement_id)
);

alter table public.individual_study_plan_class_runs enable row level security;
alter table public.individual_study_plan_class_runs force row level security;
alter table public.individual_study_plan_class_items enable row level security;
alter table public.individual_study_plan_class_items force row level security;
revoke all on public.individual_study_plan_class_runs,public.individual_study_plan_class_items
  from public,anon,authenticated,service_role,skolplattform_worker;

create function public.individual_study_plan_class_membership_token(starts_on date, ends_on date)
returns text
language sql immutable set search_path=pg_catalog,public as $$
  select public.tjanst_hash(jsonb_build_array(starts_on,ends_on))
$$;

create function public.individual_study_plan_class_members(
  a public.access_assignments, c public.school_classes, selected_on date
)
returns table (
  placement public.pupil_placements, membership_id uuid, member_starts_on date, member_ends_on date,
  display_name text, education_name text, protected_identity boolean, latest_revision integer
)
language sql volatile set search_path=pg_catalog,public as $$
  select pl,m.id,m.starts_on,m.ends_on,p.display_name,o.name,p.protected_identity,coalesce(rev.revision,0)
  from public.pupil_class_memberships m
  join public.pupil_placements pl on pl.id=m.placement_id and pl.pupil_id=m.pupil_id
    and pl.unit_id=m.unit_id and pl.customer_id=m.customer_id and pl.organizer_id=m.organizer_id
  join public.pupils p on p.id=pl.pupil_id and p.customer_id=pl.customer_id and p.organizer_id=pl.organizer_id
  join public.offerings o on o.id=pl.offering_id and o.organizer_id=pl.organizer_id
  left join public.individual_study_plans sp on sp.placement_id=pl.id
  left join lateral (
    select r.revision from public.individual_study_plan_revisions r
    where r.plan_id=sp.id order by r.revision desc limit 1
  ) rev on true
  where m.class_id=c.id and m.unit_id=c.unit_id and m.customer_id=a.customer_id and m.organizer_id=a.organizer_id
    and (c.starts_on is null or c.starts_on<=selected_on) and (c.ends_on is null or c.ends_on>=selected_on)
    and m.starts_on<=selected_on and (m.ends_on is null or m.ends_on>=selected_on)
    and pl.starts_on<=selected_on and (pl.ends_on is null or pl.ends_on>=selected_on)
    and public.phase4_scope(a.id,p.id,pl.unit_id)
    and (not p.protected_identity or public.phase4_can_read_protected(p.id,pl.unit_id))
  order by p.display_name collate "C",p.id
  limit 101
$$;

-- Resultatet återläser elevuppgifter under aktuellt mandat. Progressraderna
-- lagrar ingen kopia av namn, utbildningsnamn eller planinnehåll.
create function public.individual_study_plan_class_visible_items(
  run public.individual_study_plan_class_runs, a public.access_assignments
)
returns table (
  command_id uuid, pupil_id uuid, item_position integer, outcome text,
  display_name text, education_name text, protected_identity boolean, placement public.pupil_placements
)
language sql volatile set search_path=pg_catalog,public as $$
  select i.command_id,i.pupil_id,i.position,i.outcome,p.display_name,o.name,p.protected_identity,pl
  from public.individual_study_plan_class_items i
  join public.pupil_placements pl on pl.id=i.placement_id and pl.pupil_id=i.pupil_id
    and pl.unit_id=run.unit_id and pl.customer_id=run.customer_id and pl.organizer_id=run.organizer_id
  join public.pupils p on p.id=i.pupil_id and p.customer_id=pl.customer_id and p.organizer_id=pl.organizer_id
  join public.offerings o on o.id=pl.offering_id and o.organizer_id=pl.organizer_id
  where i.run_id=run.id and public.phase4_scope(a.id,p.id,pl.unit_id)
    and (not p.protected_identity or public.phase4_can_read_protected(p.id,pl.unit_id))
$$;

create function public.individual_study_plan_class_result(
  run public.individual_study_plan_class_runs, a public.access_assignments
)
returns jsonb
language plpgsql volatile set search_path=pg_catalog,public as $$
declare
  item record;
  rows jsonb:='[]'::jsonb;
  has_pending boolean:=false;
begin
  for item in select * from public.individual_study_plan_class_visible_items(run,a) i order by i.item_position loop
    if item.protected_identity then
      perform public.individual_study_plan_audit(a,item.placement,'individual_study_plan_class_protected_read');
    end if;
    rows:=rows||jsonb_build_array(jsonb_build_object(
      'pupilId',item.pupil_id,'displayName',item.display_name,'educationName',item.education_name,'outcome',item.outcome));
    has_pending:=has_pending or item.outcome='pending';
  end loop;
  return jsonb_build_object('runId',run.id,'unitId',run.unit_id,'classId',run.class_id,
    'on',run.selected_on,'rows',rows,'hasPending',has_pending);
end $$;

create function public.individual_study_plan_class(input jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  action text:=input->>'action';
  keys text[]:=array['action','unitId','classId'];
  actor public.access_assignments;
  target_unit uuid;
  c public.school_classes;
  selected_on date;
  school_year_start date;
  run_id uuid;
  start_token text;
  run public.individual_study_plan_class_runs;
  resume public.individual_study_plan_class_runs;
  item public.individual_study_plan_class_items;
  candidate record;
  placement public.pupil_placements;
  source jsonb;
  pupil record;
  item_input jsonb;
  item_position integer:=0;
  closed boolean;
  next_item jsonb;
  rows jsonb:='[]'::jsonb;
  item_outcome text;
begin
  case action
    when 'preview' then keys:=keys||array['on'];
    when 'start' then keys:=keys||array['on','runId','previewToken','startToken','rows'];
    when 'status' then
      if input?'runId' then
        keys:=keys||array['runId'];
        if input?'startToken' then keys:=keys||array['startToken'];end if;
      elsif input?'schoolYear' then
        keys:=keys||array['schoolYear'];
      end if;
    when 'advance' then keys:=keys||array['runId'];
    when 'finish' then keys:=keys||array['runId','commandId','outcome'];
    else perform public.individual_study_plan_invalid();
  end case;
  perform public.phase4_keys(input,keys);
  target_unit:=public.tjanst_uuid(input->'unitId');
  -- elective_staff_scope acquires the customer lock used by placement, class
  -- membership and source writers. It remains held through the caller's write.
  actor:=public.elective_staff_scope(target_unit);
  select * into c from public.school_classes as cl where cl.id=public.tjanst_uuid(input->'classId')
    and cl.unit_id=target_unit and cl.customer_id=actor.customer_id and cl.organizer_id=actor.organizer_id;
  if c.id is null or actor.scope_kind is distinct from 'school' then
    raise exception 'Study plan class denied' using errcode='42501';
  end if;
  if input?'on' then
    selected_on:=public.study_group_date(input->'on');
    school_year_start:=make_date(extract(year from (selected_on - interval '6 months'))::integer,7,1);
  elsif input?'schoolYear' then
    if not public.phase5_programplan_integer(input->'schoolYear',1000,9998) then
      perform public.individual_study_plan_invalid();
    end if;
    school_year_start:=make_date((input->>'schoolYear')::integer,7,1);
  end if;
  if input?'runId' then run_id:=public.tjanst_uuid(input->'runId');end if;
  if input?'startToken' then
    start_token:=input->>'startToken';
    if start_token is null or start_token !~ '^sha256:[0-9a-f]{64}$' then
      perform public.individual_study_plan_invalid();
    end if;
  end if;

  if action='preview' then
    for candidate in select * from public.individual_study_plan_class_members(actor,c,selected_on) loop
      item_position:=item_position+1;
      if item_position>100 then
        raise exception 'Study plan class selection exceeds capacity'
          using errcode='22023',hint='study_plan_class_too_large';
      end if;
      placement:=candidate.placement;
      closed:=placement.ends_on is not null and placement.ends_on<public.app_today();
      source:=case when candidate.latest_revision=0 and not closed
        then public.individual_study_plan_basis(placement,false) end;
      if candidate.protected_identity then
        perform public.individual_study_plan_audit(actor,placement,'individual_study_plan_class_protected_read');
      end if;
      rows:=rows||jsonb_build_array(jsonb_build_object(
        'pupilId',placement.pupil_id,'placementId',placement.id,'displayName',candidate.display_name,
        'educationName',candidate.education_name,'membershipId',candidate.membership_id,
        'memberStartsOn',candidate.member_starts_on,'memberEndsOn',candidate.member_ends_on,
        'latestRevision',candidate.latest_revision,'basis',source,'closed',closed));
    end loop;
    return jsonb_build_object('schoolName',(select u.name from public.school_units u where u.id=target_unit),
      'className',c.name,'classStartsOn',c.starts_on,'rows',rows);
  end if;

  if action='start' then
    perform pg_advisory_xact_lock(hashtextextended(run_id::text,112002));
  end if;
  select * into run from public.individual_study_plan_class_runs r where r.class_id=c.id
    and r.unit_id=c.unit_id and r.customer_id=actor.customer_id and r.organizer_id=actor.organizer_id
    and r.actor_identity_id=public.current_identity_id() and r.assignment_id=actor.id
    and (run_id is null or r.id=run_id)
    and (run_id is not null or school_year_start is null
      or (r.selected_on>=school_year_start and r.selected_on<school_year_start+interval '1 year'))
  order by r.created_at desc,r.id desc limit 1 for update;

  if run.id is not null and start_token is not null and run.start_token<>start_token then
    raise exception 'Study plan class selection changed'
      using errcode='40001',hint='study_plan_class_changed';
  end if;
  if action='status' then
    if run.id is null then return null;end if;
    return public.individual_study_plan_class_result(run,actor);
  end if;

  if action='start' then
    if run.id is not null then
      if run.selected_on<>selected_on then perform public.individual_study_plan_invalid();end if;
      return public.individual_study_plan_class_result(run,actor);
    end if;
    if input->>'previewToken' is null or input->>'previewToken' !~ '^sha256:[0-9a-f]{64}$'
      or jsonb_typeof(input->'rows') is distinct from 'array' then
      perform public.individual_study_plan_invalid();
    end if;
    if jsonb_array_length(input->'rows') not between 1 and 100 then
      perform public.individual_study_plan_invalid();
    end if;
    -- A collision with another actor's run does not disclose its owner or scope.
    if exists(select 1 from public.individual_study_plan_class_runs r where r.id=run_id) then
      raise exception 'Study plan class denied' using errcode='42501';
    end if;
    select * into resume from public.individual_study_plan_class_runs r
    where r.class_id=c.id and r.unit_id=c.unit_id and r.customer_id=actor.customer_id
      and r.actor_identity_id=public.current_identity_id() and r.assignment_id=actor.id
      and r.selected_on>=school_year_start and r.selected_on<school_year_start+interval '1 year'
    order by r.created_at desc,r.id desc limit 1;
    if resume.id is not null and exists(
      select 1 from public.individual_study_plan_class_visible_items(resume,actor) i where i.outcome='pending'
    ) then
      raise exception 'Study plan class already has a pending run'
        using errcode='40001',hint='study_plan_class_in_progress';
    end if;
    insert into public.individual_study_plan_class_runs(id,customer_id,organizer_id,unit_id,class_id,
      actor_identity_id,assignment_id,selected_on,start_token)
    values(run_id,actor.customer_id,actor.organizer_id,c.unit_id,c.id,public.current_identity_id(),actor.id,selected_on,start_token)
    returning * into run;
    for item_input in select j.value from jsonb_array_elements(input->'rows') with ordinality j(value,position) order by j.position loop
      perform public.phase4_keys(item_input,array['pupilId','placementId','membershipId','memberStartsOn','memberEndsOn','sourceToken']);
      item_position:=item_position+1;
      insert into public.individual_study_plan_class_items(run_id,position,pupil_id,placement_id,membership_id,membership_token,source_token)
      values(run.id,item_position,public.tjanst_uuid(item_input->'pupilId'),public.tjanst_uuid(item_input->'placementId'),
        public.tjanst_uuid(item_input->'membershipId'),
        public.individual_study_plan_class_membership_token(public.study_group_date(item_input->'memberStartsOn'),
          case when item_input->'memberEndsOn'<>'null'::jsonb then public.study_group_date(item_input->'memberEndsOn') end),
        item_input->>'sourceToken');
    end loop;
    -- Even the internal entry point cannot start a run for rows outside the
    -- scoped, dated review, including a placement which acquired a plan.
    if (
      select count(*) from public.individual_study_plan_class_members(actor,c,selected_on) m
      join public.individual_study_plan_class_items i on i.run_id=run.id and i.membership_id=m.membership_id
        and i.placement_id=(m.placement).id and i.pupil_id=(m.placement).pupil_id
        and i.membership_token=public.individual_study_plan_class_membership_token(m.member_starts_on,m.member_ends_on)
      where m.latest_revision=0 and ((m.placement).ends_on is null or (m.placement).ends_on>=public.app_today())
    )<>item_position then
      raise exception 'Study plan class selection changed'
        using errcode='40001',hint='study_plan_class_changed';
    end if;
    return public.individual_study_plan_class_result(run,actor);
  end if;

  if run.id is null then raise exception 'Study plan class denied' using errcode='42501';end if;
  if action='advance' then
    -- Ett indraget skyddsuppdrag får varken ge en synlig rad eller avbryta
    -- nästa rad som fortfarande kan handläggas av samma skoluppdrag.
    with visible as materialized (
      select i.command_id from public.individual_study_plan_class_visible_items(run,actor) i
      where i.outcome='pending'
    )
    update public.individual_study_plan_class_items i set outcome='changed'
      where i.run_id=run.id and i.outcome='pending'
        and not exists(select 1 from visible v where v.command_id=i.command_id);
    select * into item from public.individual_study_plan_class_items i
      where i.run_id=run.id and i.outcome='pending' order by i.position limit 1 for update;
  else
    item_outcome:=input->>'outcome';
    if item_outcome is null or item_outcome not in ('saved','existing','changed') then
      perform public.individual_study_plan_invalid();
    end if;
    select * into item from public.individual_study_plan_class_items i where i.run_id=run.id
      and i.command_id=public.tjanst_uuid(input->'commandId') for update;
    if item.command_id is null then raise exception 'Study plan class denied' using errcode='42501';end if;
    if item.outcome=item_outcome then return public.individual_study_plan_class_result(run,actor);end if;
    if item.outcome<>'pending' then perform public.individual_study_plan_invalid();end if;
  end if;

  if item.command_id is not null then
    select p.id,p.protected_identity into pupil from public.pupils p
      where p.id=item.pupil_id and p.customer_id=run.customer_id and p.organizer_id=run.organizer_id for share;
    select * into placement from public.pupil_placements pl where pl.id=item.placement_id and pl.pupil_id=item.pupil_id
      and pl.unit_id=run.unit_id and pl.customer_id=run.customer_id and pl.organizer_id=run.organizer_id for share;
    if action='advance' then
      if pupil.id is null or placement.id is null or not public.phase4_scope(actor.id,pupil.id,run.unit_id)
        or (pupil.protected_identity and not public.phase4_can_read_protected(pupil.id,run.unit_id))
        or (c.starts_on is not null and c.starts_on>run.selected_on)
        or (c.ends_on is not null and c.ends_on<run.selected_on)
        or placement.starts_on>run.selected_on
        or (placement.ends_on is not null and placement.ends_on<greatest(run.selected_on,public.app_today()))
        or not exists(
          select 1 from public.pupil_class_memberships m where m.id=item.membership_id and m.placement_id=placement.id
            and m.pupil_id=pupil.id and m.class_id=run.class_id and m.unit_id=run.unit_id
            and m.customer_id=run.customer_id and m.organizer_id=run.organizer_id
            and m.starts_on<=run.selected_on and (m.ends_on is null or m.ends_on>=run.selected_on)
            and item.membership_token=public.individual_study_plan_class_membership_token(m.starts_on,m.ends_on)
          for share
        ) then
        item_outcome:='changed';
      elsif exists(select 1 from public.individual_study_plans sp where sp.placement_id=placement.id) then
        item_outcome:='existing';
      else
        source:=public.individual_study_plan_basis(placement,true);
        if source->>'token' is distinct from item.source_token then
          item_outcome:='changed';
        else
          next_item:=jsonb_build_object('pupilId',item.pupil_id,'placementId',item.placement_id,
            'sourceToken',item.source_token,'commandId',item.command_id);
        end if;
      end if;
    elsif placement.id is null or pupil.id is null or not public.phase4_scope(actor.id,pupil.id,run.unit_id)
      or (pupil.protected_identity and not public.phase4_can_read_protected(pupil.id,run.unit_id)) then
      raise exception 'Study plan class denied' using errcode='42501';
    elsif item_outcome='saved' and not exists(
      select 1 from public.individual_study_plan_receipts q
      join public.individual_study_plans sp on sp.id=q.plan_id and sp.placement_id=placement.id
      where q.command_id=item.command_id and q.actor_identity_id=run.actor_identity_id and q.assignment_id=run.assignment_id
        and q.action='prepare_draft' and q.revision=1
    ) then
      raise exception 'Study plan class receipt missing' using errcode='55000';
    elsif item_outcome='existing' and not exists(select 1 from public.individual_study_plans sp where sp.placement_id=placement.id) then
      perform public.individual_study_plan_invalid();
    end if;
    if item_outcome is not null then
      update public.individual_study_plan_class_items i set outcome=item_outcome
        where i.command_id=item.command_id and i.run_id=run.id;
    end if;
  end if;

  if action='advance' then
    return jsonb_build_object('run',public.individual_study_plan_class_result(run,actor),'next',next_item);
  end if;
  return public.individual_study_plan_class_result(run,actor);
end $$;

revoke all on function public.individual_study_plan_class_membership_token(date,date),
  public.individual_study_plan_class_members(public.access_assignments,public.school_classes,date),
  public.individual_study_plan_class_visible_items(public.individual_study_plan_class_runs,public.access_assignments),
  public.individual_study_plan_class_result(public.individual_study_plan_class_runs,public.access_assignments),
  public.individual_study_plan_class(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.individual_study_plan_class(jsonb) to skolplattform_worker;
