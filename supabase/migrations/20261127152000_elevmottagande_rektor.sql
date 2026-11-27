-- Rektor kan registrera första klasstillhörigheten genom samma daterade
-- granskning och kvitto som administratören i Elevmottagande.
-- Ordinarie elevregisterkommando behåller sina roller.
create function public.elevmottagande_rektor_first_class(a public.access_assignments, unit uuid, checked jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare
  p public.pupils; m public.pupil_class_memberships; next_version integer;
begin
  -- Anropas efter elevmottagande_check, som låser eleven och klassen och
  -- prövar placering, utbildning, datum, skrivansvar och tidigare medlemskap.
  if a.function is distinct from 'rektor' or a.scope_kind is distinct from 'school'
    or a.id is distinct from public.current_assignment_id()
    or not exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=unit)
    or checked->>'reason' is not null then
    raise exception 'Intake class registration denied' using errcode='42501';
  end if;
  select * into p from public.pupils
  where id=(checked->>'pupilId')::uuid and customer_id=a.customer_id and organizer_id=a.organizer_id
    and not protected_identity and version=(checked->'stamp'->>0)::integer
  for update;
  if p.id is null then return '{"kind":"conflict"}'::jsonb; end if;

  insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
  select p.customer_id,p.organizer_id,p.id,unit,(checked->>'classId')::uuid,pl.id,
    (checked->>'startsOn')::date,(checked->>'endsOn')::date
  from public.pupil_placements pl
  where pl.id=(checked->>'placementId')::uuid and pl.pupil_id=p.id and pl.unit_id=unit
    and not exists(
      select 1 from public.pupil_class_memberships previous where previous.pupil_id=p.id
        and (previous.placement_id=pl.id or daterange(previous.starts_on,previous.ends_on,'[]')
          && daterange((checked->>'startsOn')::date,(checked->>'endsOn')::date,'[]'))
    )
  returning * into m;
  if m.id is null then return '{"kind":"conflict"}'::jsonb; end if;

  next_version:=p.version+1;
  perform public.phase4_record_change(p,a,'class',null,public.phase4_class_value(m),next_version);
  update public.pupils set version=next_version,updated_at=clock_timestamp() where id=p.id;
  return '{"kind":"success"}'::jsonb;
end $$;

revoke all on function public.elevmottagande_rektor_first_class(public.access_assignments,uuid,jsonb)
  from public,anon,authenticated,service_role,skolplattform_worker;

create or replace function public.elevmottagande_read(q jsonb) returns jsonb
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
  select jsonb_build_object('unitId',unit,'schoolYear',year,'offeringId',offering,'on',on_date,'canAllocate',true,
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
      'canAllocate',not s.source_owned and s.membership is null
        and coalesce(s.ends_on,'infinity'::date)>=public.app_today()) order by s.display_name,s.placement_id),'[]')),
    coalesce(jsonb_agg(distinct s.pupil_id) filter(where s.protected_identity),'[]')
  into result,protected_ids from source_rows s;
  return jsonb_build_object('body',result,'protectedIds',protected_ids);
end $$;

create or replace function public.elevmottagande_allocate(q jsonb) returns jsonb
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
        if a.function='rektor' then
          applied:=public.elevmottagande_rektor_first_class(a,unit,checked);
        else
          applied:=public.phase4_change_pupil(jsonb_build_object('pupilId',checked->'pupilId','schoolYear',year,'caseId',null,
            'expectedVersion',checked->'stamp'->0,'kind','class','payload',proposed||jsonb_build_object('endsOn',checked->'endsOn')));
        end if;
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
