-- Mottagningen arbetar med redan registrerade skolplaceringar och daterade klassmedlemskap.
create table public.elevmottagande_previews (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.school_units(id),
  school_year integer not null,
  offering_id uuid references public.offerings(id),
  reviewed_on date not null,
  identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  rows jsonb not null
);

create table public.elevmottagande_commands (
  id uuid primary key,
  preview_id uuid not null unique references public.elevmottagande_previews(id),
  rows jsonb not null,
  saved_at timestamptz not null default clock_timestamp()
);

alter table public.elevmottagande_previews enable row level security;
alter table public.elevmottagande_previews force row level security;
alter table public.elevmottagande_commands enable row level security;
alter table public.elevmottagande_commands force row level security;
revoke all on public.elevmottagande_previews,public.elevmottagande_commands from public,anon,authenticated,service_role,skolplattform_worker;

create function public.elevmottagande_offering(o public.offerings, school_year integer) returns boolean
language sql stable set search_path=pg_catalog,public as $$
  select o.kind='gymnasium' and o.archived_at is null
    and started.on_date>=date '2025-07-01'
    and (extract(year from started.on_date)::integer-case when extract(month from started.on_date)<7 then 1 else 0 end)
      between school_year-2 and school_year
    and o.program_code in ('EK25','ES25','HU25','NA25','SA25','TE25','BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25')
  from (select coalesce(public.phase5_class_cohort_starts_on(o.id),make_date(o.start_year,7,1)) on_date) started
$$;

create function public.elevmottagande_actor(unit uuid, school_year integer, offering uuid) returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
  a:=public.phase3_actor();
  if school_year is null or school_year not between 2000 and 2100 then
    raise exception 'Invalid school year' using errcode='22023';
  end if;
  if a.scope_kind<>'school' or a.function not in ('rektor','administrator')
    or not exists(select 1 from public.mandate_units mu where mu.assignment_id=a.id and mu.unit_id=unit)
    or (offering is not null and not exists(select 1 from public.offerings o join public.offering_units ou on ou.offering_id=o.id
      where o.id=offering and o.organizer_id=a.organizer_id and ou.unit_id=unit and public.elevmottagande_offering(o,school_year))) then
    raise exception 'Intake scope denied' using errcode='42501';
  end if;
  return a;
end $$;

create function public.elevmottagande_membership(placement uuid, on_date date) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('id',m.id,'classId',m.class_id,'className',c.name,'startsOn',m.starts_on,'endsOn',m.ends_on)
  from public.pupil_class_memberships m join public.school_classes c on c.id=m.class_id
  where m.placement_id=placement
  order by case when daterange(m.starts_on,m.ends_on,'[]') @> on_date then 0 when m.starts_on>on_date then 1 else 2 end,
    case when m.starts_on>on_date then m.starts_on end, m.starts_on desc, m.id
  limit 1
$$;

-- Endpoints log the protected identities in each response in the same transaction.
create function public.elevmottagande_read(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  unit uuid:=(q->>'unitId')::uuid; year integer:=(q->>'schoolYear')::integer;
  offering uuid:=(q->>'offeringId')::uuid; on_date date:=(q->>'on')::date;
  a public.access_assignments; result jsonb; protected_ids jsonb;
begin
  perform public.phase4_keys(q,array['unitId','schoolYear','offeringId','on']);
  a:=public.elevmottagande_actor(unit,year,offering);
  if on_date is null or not isfinite(on_date) then raise exception 'Invalid intake date' using errcode='22023'; end if;
  with offerings as materialized (
    select o.* from public.offerings o join public.offering_units ou on ou.offering_id=o.id
    where o.organizer_id=a.organizer_id and ou.unit_id=unit and public.elevmottagande_offering(o,year)
  ), source_rows as materialized (
    select pl.id placement_id,pl.starts_on,pl.ends_on,pl.offering_id,
      p.id pupil_id,p.display_name,p.version,p.protected_identity,o.name education_name,
      public.elevmottagande_membership(pl.id,on_date) membership,
      exists(select 1 from public.pupil_field_state f where f.pupil_id=p.id and f.field='class' and f.source<>'manual'
        and not f.local_correction) source_owned
    from public.pupil_placements pl join offerings o on o.id=pl.offering_id
    join public.pupils p on p.id=pl.pupil_id and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
    where pl.unit_id=unit and pl.customer_id=a.customer_id and (offering is null or pl.offering_id=offering)
      and daterange(pl.starts_on,pl.ends_on,'[]') && daterange(make_date(year,7,1),make_date(year+1,7,1),'[)')
      and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))
  ), class_rows as materialized (
    select c.id,c.name,c.offering_id,c.starts_on,c.ends_on,
      (select count(*) from public.pupil_class_memberships m join public.pupils p on p.id=m.pupil_id
        where m.class_id=c.id and daterange(m.starts_on,m.ends_on,'[]') @> on_date
          and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))) pupil_count,
      (select jsonb_build_object('planId',t.id,'name',coalesce(public.phase5_named_timplan_plan_series(t.id)->>'name',o.name),
          'version',t.version,'columnId',l.column_id,'revision',l.revision)
        from public.class_timplans l join public.timplans t on t.id=l.timplan_id
        where l.unit_id=unit and l.start_year=year and t.unit_id=unit and t.offering_id=c.offering_id
          and t.status='faststalld' and public.phase5_class_start_year(t)=c.start_year
          and l.column_id='ar'||(year-c.start_year+1)::text
          and (l.class_id=c.id or (public.phase5_class_legacy_matches(c,l) and not exists(
            select 1 from public.class_timplans identified where identified.class_id=c.id and identified.start_year=year)))
        limit 1) timetable
    from public.school_classes c join offerings o on o.id=c.offering_id
    where c.customer_id=a.customer_id and c.unit_id=unit and (offering is null or c.offering_id=offering)
      and c.start_year between year-2 and year and public.phase5_class_cohort_year_fits(c,year)
  )
  select jsonb_build_object('unitId',unit,'schoolYear',year,'offeringId',offering,'on',on_date,'canAllocate',a.function='administrator',
    'latestCommandId',(select rc.id from public.elevmottagande_commands rc
      join public.elevmottagande_previews rv on rv.id=rc.preview_id
      where rv.unit_id=unit and rv.school_year=year and rv.offering_id is not distinct from offering
        and exists(select 1 from jsonb_array_elements(rc.rows) r join source_rows s on s.placement_id=(r->>'placementId')::uuid)
      order by rc.saved_at desc,rc.id limit 1),
    'offerings',(select coalesce(jsonb_agg(jsonb_build_object('id',o.id,'name',o.name) order by o.name,o.id),'[]') from offerings o),
    'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'offeringId',c.offering_id,
      'startsOn',c.starts_on,'endsOn',c.ends_on,'count',c.pupil_count,'timetable',c.timetable) order by c.name,c.id),'[]') from class_rows c),
    'timetableChoices',(select coalesce(jsonb_agg(jsonb_build_object('id',t.id,'name',
      coalesce(public.phase5_named_timplan_plan_series(t.id)->>'name',o.name),'version',t.version,
      'offeringId',t.offering_id) order by t.version desc,t.id),'[]')
      from public.timplans t join offerings o on o.id=t.offering_id
      where t.unit_id=unit and t.status='faststalld' and (offering is null or t.offering_id=offering)
        and public.phase5_class_start_year(t) between year-2 and year and public.phase5_class_blockers(t,o)='[]'::jsonb),
    'rows',coalesce(jsonb_agg(jsonb_build_object('placementId',s.placement_id,'pupilId',s.pupil_id,'name',s.display_name,
      'offeringId',s.offering_id,'educationName',s.education_name,'startsOn',s.starts_on,'endsOn',s.ends_on,'version',s.version,
      'classification',case when s.membership is null then 'unplaced' when (s.membership->>'startsOn')::date>on_date then 'booked'
        when (s.membership->>'endsOn')::date<on_date then 'historical' else 'registered' end,'membership',s.membership,
      'canAllocate',a.function='administrator' and not s.source_owned and s.membership is null
        and coalesce(s.ends_on,'infinity'::date)>=public.app_today()) order by s.display_name,s.placement_id),'[]')),
    coalesce(jsonb_agg(distinct s.pupil_id) filter(where s.protected_identity),'[]')
  into result,protected_ids from source_rows s;
  return jsonb_build_object('body',result,'protectedIds',protected_ids);
end $$;

create function public.elevmottagande_check(a public.access_assignments, unit uuid, year integer, offering uuid, draft jsonb)
returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  pl public.pupil_placements; p public.pupils; c public.school_classes;
  on_date date:=(draft->>'startsOn')::date; member_end date; membership jsonb; reason text;
begin
  select p0.* into p from public.pupil_placements pl0 join public.pupils p0 on p0.id=pl0.pupil_id
  where pl0.id=(draft->>'placementId')::uuid and pl0.customer_id=a.customer_id and pl0.unit_id=unit
    and p0.organizer_id=a.organizer_id
    and (not p0.protected_identity or public.phase4_can_read_protected(p0.id,unit))
  for update of p0;
  if p.id is null then return jsonb_build_object('reason','no_access'); end if;
  select * into pl from public.pupil_placements where id=(draft->>'placementId')::uuid and pupil_id=p.id;
  select * into c from public.school_classes where id=(draft->>'classId')::uuid and customer_id=a.customer_id and unit_id=unit for share;
  if c.id is null or (offering is not null and pl.offering_id<>offering)
    or not exists(select 1 from public.offerings o where o.id=pl.offering_id and public.elevmottagande_offering(o,year))
    or not (daterange(pl.starts_on,pl.ends_on,'[]') && daterange(make_date(year,7,1),make_date(year+1,7,1),'[)')) then
    return jsonb_build_object('reason','no_access');
  end if;
  membership:=public.elevmottagande_membership(pl.id,on_date);
  member_end:=least(pl.ends_on,c.ends_on);
  reason:=case
    when membership is not null then 'existing_membership'
    when coalesce(pl.ends_on,'infinity'::date)<public.app_today() or on_date<make_date(year,7,1) or on_date>=make_date(year+1,7,1)
      or not (daterange(pl.starts_on,pl.ends_on,'[]') @> on_date) then 'placement_period'
    when c.offering_id<>pl.offering_id or c.start_year not between year-2 and year then 'class_education'
    when not public.phase5_class_cohort_membership_fits(c,on_date,member_end) then 'class_period'
    when exists(select 1 from public.pupil_field_state s where s.pupil_id=p.id and s.field='class'
      and s.source<>'manual' and not s.local_correction) then 'source_owned'
  end;
  return draft||jsonb_build_object('pupilId',p.id,'className',c.name,'membership',membership,'reason',reason,
    'endsOn',member_end,'stamp',jsonb_build_array(p.version,pl.offering_id,pl.starts_on,pl.ends_on,c.offering_id,c.start_year,c.starts_on,c.ends_on,c.name));
end $$;

-- Receipts retain identifiers and outcomes. Names, memberships and protected identities are read with current scope.
create function public.elevmottagande_rows(a public.access_assignments, unit uuid, result_rows jsonb) returns jsonb
language sql stable set search_path=pg_catalog,public as $$
  select jsonb_build_object('rows',coalesce(jsonb_agg(
    (r.value-'stamp'-'endsOn') || jsonb_build_object('name',p.display_name,'pupilId',p.id)
    || case when p.id is null then jsonb_build_object('membership',null) else '{}'::jsonb end order by r.ordinality),'[]'),
    'protectedIds',coalesce(jsonb_agg(distinct p.id) filter(where p.protected_identity),'[]'))
  from jsonb_array_elements(result_rows) with ordinality r
  left join public.pupils p on p.id=(r.value->>'pupilId')::uuid and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
    and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))
    and exists(select 1 from public.pupil_placements pl where pl.id=(r.value->>'placementId')::uuid and pl.unit_id=unit and pl.pupil_id=p.id)
  where p.id is not null
$$;

create function public.elevmottagande_allocate(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  unit uuid:=(q->>'unitId')::uuid; year integer:=(q->>'schoolYear')::integer;
  offering uuid:=(q->>'offeringId')::uuid; on_date date:=(q->>'on')::date;
  action text:=q->>'action'; command_id uuid:=(q->>'commandId')::uuid; preview_id uuid:=(q->>'previewToken')::uuid;
  a public.access_assignments; review public.elevmottagande_previews; receipt public.elevmottagande_commands;
  proposed jsonb; prior jsonb; checked jsonb; applied jsonb; counts jsonb; result jsonb; changes jsonb:='[]';
begin
  if action='preview' then
    perform public.phase4_keys(q,array['action','unitId','schoolYear','offeringId','on','rows']);
  elsif action='save' then
    perform public.phase4_keys(q,array['action','unitId','schoolYear','offeringId','on','commandId','previewToken']);
  elsif action='status' then
    if q ? 'commandId' then
      perform public.phase4_keys(q,array['action','unitId','schoolYear','offeringId','commandId']);
      if command_id is null then raise exception 'Invalid intake command' using errcode='22023'; end if;
    else
      perform public.phase4_keys(q,array['action','unitId','schoolYear','offeringId']);
    end if;
  else
    raise exception 'Invalid intake action' using errcode='22023';
  end if;
  a:=public.elevmottagande_actor(unit,year,offering);

  if action='status' then
    select c.* into receipt from public.elevmottagande_commands c
    join public.elevmottagande_previews r on r.id=c.preview_id
    where r.unit_id=unit and r.school_year=year and r.offering_id is not distinct from offering
      and (command_id is null or c.id=command_id)
    order by c.saved_at desc,c.id limit 1;
    if receipt.id is null then return '{"body":null,"protectedIds":[]}'::jsonb; end if;
    result:=public.elevmottagande_rows(a,unit,receipt.rows);
    if result->'rows'='[]'::jsonb then return '{"body":null,"protectedIds":[]}'::jsonb; end if;
    return jsonb_build_object('body',jsonb_build_object('commandId',receipt.id,'rows',result->'rows'),'protectedIds',result->'protectedIds');
  end if;

  if a.function<>'administrator' then raise exception 'Intake write denied' using errcode='42501'; end if;
  if on_date is null or not isfinite(on_date) then raise exception 'Invalid intake date' using errcode='22023'; end if;

  if action='preview' then
    if jsonb_typeof(q->'rows')<>'array' or jsonb_array_length(q->'rows') not between 1 and 200
      or (select count(distinct (entry->>'placementId')::uuid) from jsonb_array_elements(q->'rows') entry)<>jsonb_array_length(q->'rows') then
      raise exception 'Invalid review rows' using errcode='22023';
    end if;
    for proposed in select value from jsonb_array_elements(q->'rows') order by (value->>'placementId')::uuid loop
      perform public.phase4_keys(proposed,array['placementId','classId','startsOn']);
      if proposed->>'classId' is null or proposed->>'startsOn' is null or not isfinite((proposed->>'startsOn')::date) then
        raise exception 'Invalid intake row' using errcode='22023';
      end if;
      checked:=public.elevmottagande_check(a,unit,year,offering,proposed);
      if checked->>'reason'='no_access' then raise exception 'Intake row denied' using errcode='42501'; end if;
      changes:=changes||jsonb_build_array(checked||jsonb_build_object('status',case when checked->>'reason' is null then 'ready' else 'blocked' end));
    end loop;

    with requested as (
      select (r->>'classId')::uuid class_id,(r->>'startsOn')::date starts_on,(r->>'endsOn')::date ends_on,r->>'status' status from jsonb_array_elements(changes) r
    ), wanted as (
      select distinct r.class_id,r.starts_on from requested r
    )
    select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'on',w.starts_on,'before',existing.total,'after',existing.total+incoming.total)
      order by c.name,w.starts_on,c.id),'[]')
    into counts from wanted w join public.school_classes c on c.id=w.class_id
    cross join lateral (
      select count(*) total from public.pupil_class_memberships m join public.pupils p on p.id=m.pupil_id
      where m.class_id=c.id and daterange(m.starts_on,m.ends_on,'[]') @> w.starts_on
        and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))
    ) existing
    cross join lateral (
      select count(*) total from requested r where r.class_id=c.id and daterange(r.starts_on,r.ends_on,'[]') @> w.starts_on and r.status='ready'
    ) incoming;

    insert into public.elevmottagande_previews(unit_id,school_year,offering_id,reviewed_on,identity_id,assignment_id,rows)
    values(unit,year,offering,on_date,public.current_identity_id(),a.id,changes) returning * into review;
    result:=public.elevmottagande_rows(a,unit,changes);
    return jsonb_build_object('body',jsonb_build_object('previewToken',review.id,'classes',counts,'rows',result->'rows'),
      'protectedIds',result->'protectedIds');
  end if;

  if command_id is null or preview_id is null then raise exception 'Invalid intake command' using errcode='22023'; end if;
  select * into review from public.elevmottagande_previews r where r.id=preview_id and r.unit_id=unit and r.school_year=year
    and r.offering_id is not distinct from offering and r.reviewed_on=on_date and r.identity_id=public.current_identity_id() and r.assignment_id=a.id
    for update;
  if review.id is null then raise exception 'Intake review denied' using errcode='42501'; end if;

  perform pg_advisory_xact_lock(hashtextextended('elevmottagande:'||command_id::text,0));
  select * into receipt from public.elevmottagande_commands c where c.id=command_id or c.preview_id=review.id;
  if receipt.id is not null then
    if receipt.id<>command_id or receipt.preview_id<>review.id then
      raise exception 'Intake command conflict' using errcode='40001';
    end if;
  else
    for prior in select value from jsonb_array_elements(review.rows) loop
      proposed:=jsonb_build_object('placementId',prior->'placementId','classId',prior->'classId','startsOn',prior->'startsOn');
      checked:=public.elevmottagande_check(a,unit,year,offering,proposed);
      if checked->>'reason'='no_access' then
        changes:=changes||jsonb_build_array((prior-'stamp')||jsonb_build_object('status','changed','reason','no_access','membership',null));
        continue;
      end if;
      if prior->>'status'='blocked' then
        checked:=checked||jsonb_build_object('status','blocked','reason',coalesce(checked->>'reason','source_changed'));
      elsif checked->>'reason' is not null or checked->'stamp' is distinct from prior->'stamp' then
        checked:=checked||jsonb_build_object('status','changed','reason',coalesce(checked->>'reason','source_changed'));
      else
        applied:=public.phase4_change_pupil(jsonb_build_object('pupilId',checked->'pupilId','schoolYear',year,'caseId',null,
          'expectedVersion',checked->'stamp'->0,'kind','class','payload',proposed||jsonb_build_object('endsOn',checked->'endsOn')));
        if applied->>'kind'='success' then
          checked:=checked||jsonb_build_object('status','saved','membership',
            public.elevmottagande_membership((checked->>'placementId')::uuid,(checked->>'startsOn')::date));
        elsif applied->>'kind'='conflict' then
          checked:=checked||jsonb_build_object('status','changed','reason','source_changed');
        else
          raise exception 'Unexpected class command result' using errcode='XX000';
        end if;
      end if;
      changes:=changes||jsonb_build_array(checked-'stamp');
    end loop;
    insert into public.elevmottagande_commands(id,preview_id,rows)
    values(command_id,review.id,changes) returning * into receipt;
  end if;

  result:=public.elevmottagande_rows(a,unit,receipt.rows);
  return jsonb_build_object('body',jsonb_build_object('commandId',receipt.id,'rows',result->'rows'),'protectedIds',result->'protectedIds');
end $$;

revoke all on function public.elevmottagande_offering(public.offerings,integer),
  public.elevmottagande_actor(uuid,integer,uuid),public.elevmottagande_membership(uuid,date),
  public.elevmottagande_check(public.access_assignments,uuid,integer,uuid,jsonb),
  public.elevmottagande_rows(public.access_assignments,uuid,jsonb),public.elevmottagande_read(jsonb),public.elevmottagande_allocate(jsonb)
  from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.elevmottagande_read(jsonb),public.elevmottagande_allocate(jsonb) to skolplattform_worker;
