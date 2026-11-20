-- SP-05. Jämförelsen återanvänder en avgränsad skolplacering och läser
-- Group/GroupMembership med inkluderande datum. Gruppplacering och studieplan
-- har egna versioner. Den skyddade läsoperationen skriver till sin säkerhetslogg.
create function public.individual_study_plan_impact_course(g public.study_groups)
returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  select case when public.phase5_programplan_code(to_jsonb(g.subject_code))
    and public.phase5_programplan_code(to_jsonb(g.item_code))
    and g.subject_version between 1 and 100000
    and (case coalesce(public.valplan_language_rule(g.subject_code),'none')
      when 'none' then g.language_code is null
      when 'pick' then public.elective_language_valid(g.item_code,g.language_code)
      else g.language_code=public.valplan_language_rule(g.subject_code) end)
    then jsonb_build_object('subjectCode',g.subject_code,'subjectVersion',g.subject_version,
      'itemCode',g.item_code,'languageCode',g.language_code) end
$$;

create function public.individual_study_plan_impact_participation(g public.study_groups, starts date, ends date)
returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
  select case when g.id is not null and starts<=ends then
    jsonb_build_object('groupId',g.id,'name',g.name,'startsOn',starts,'endsOn',ends) end
$$;

create function public.individual_study_plan_impact_group_source(
  g public.study_groups, m public.study_group_memberships
) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
  select jsonb_build_object('groupId',g.id,'revision',g.revision,'membershipId',m.id,
    'startsOn',coalesce(m.starts_on,g.starts_on),'endsOn',coalesce(m.ends_on,g.ends_on))
$$;

create function public.individual_study_plan_impact_level(content jsonb, course jsonb)
returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
  select l.value from jsonb_array_elements(content->'levels') l
  where l.value->>'kind'='gy25_level'
    and l.value->'subjectCode'=course->'subjectCode' and l.value->'subjectVersion'=course->'subjectVersion'
    and l.value->'itemCode'=course->'itemCode' and l.value->'languageCode'=course->'languageCode'
  limit 1
$$;

create function public.individual_study_plan_impact_level_row(
  level_row jsonb, course jsonb, g public.study_groups, change text, before_doc jsonb, after_doc jsonb
) returns jsonb
language sql immutable set search_path=pg_catalog,public as $$
  select jsonb_build_object('levelId',level_row->>'id','ref',course,'label',coalesce(level_row->>'label',g.name),
    'change',change,'before',before_doc,'after',after_doc)
$$;

-- En avslutad eller borttagen nivå före den jämförda gruppperioden kräver
-- ingen ny undervisningsgrupp. Terminsplaneringen används här med sin egen precision.
create function public.individual_study_plan_impact_needs_group(content jsonb, level_row jsonb, starts date, ends date)
returns boolean
language sql stable set search_path=pg_catalog,public as $$
  select level_row is not null and starts<=ends
    and not exists(select 1 from jsonb_array_elements(content->'decisions') d
      where d.value->>'kind' in ('reduced','eligibility_opt_out','adapted','replaced')
        and (d.value->'levelIds') ? (level_row->>'id')
        and (d.value->>'effectiveOn')::date<=starts
        and (d.value->>'endsOn' is null or (d.value->>'endsOn')::date>=ends))
    and exists(select 1 from jsonb_array_elements(level_row->'attempts') a
      where (a.value #>> '{actual,end,on}' is null or (a.value #>> '{actual,end,on}')::date>starts)
        and (case
          when a.value #>> '{actual,start,on}' is not null then (a.value #>> '{actual,start,on}')::date<=ends
          else case a.value #>> '{plannedStart,kind}'
              when 'day' then (a.value #>> '{plannedStart,date}')::date<=ends
              when 'term' then make_date((a.value #>> '{plannedStart,schoolYear}')::integer,7,1)<=ends
              else true end
            and case a.value #>> '{plannedEnd,kind}'
              when 'day' then (a.value #>> '{plannedEnd,date}')::date>=starts
              when 'term' then make_date((a.value #>> '{plannedEnd,schoolYear}')::integer+1,6,30)>=starts
              else true end
        end))
$$;

create function public.individual_study_plan_impact_options(pl public.pupil_placements, on_date date, year integer)
returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
  with choices as (
    select 1 priority,c.name,c.id,jsonb_build_object('kind','class','classId',c.id,'name',c.name) value
      from public.school_classes c
      join public.offerings o on o.id=c.offering_id and o.organizer_id=c.organizer_id
      where c.unit_id=pl.unit_id and c.customer_id=pl.customer_id and c.organizer_id=pl.organizer_id
        and c.start_year between year-(case when o.kind='gymnasium' then 2 else 0 end) and year
        and (c.starts_on is null or c.starts_on<=on_date) and (c.ends_on is null or c.ends_on>=on_date)
        and not exists(select 1 from public.pupil_class_memberships cm
          where cm.placement_id=pl.id and cm.class_id=c.id and daterange(cm.starts_on,cm.ends_on,'[]') @> on_date)
    union all
    select 2,g.name,g.id,jsonb_build_object('kind','group','groupId',g.id,'name',g.name,'revision',g.revision,
      'startsOn',g.starts_on,'endsOn',g.ends_on,'course',public.individual_study_plan_impact_course(g),'parallelSetId',g.parallel_set_id)
      from public.study_groups g
      where g.unit_id=pl.unit_id and g.organizer_id=pl.organizer_id and g.school_year=year and g.active
        and g.ends_on>=on_date and g.starts_on<=coalesce(pl.ends_on,'infinity'::date)
    union all
    select 0,g.name,m.id,jsonb_build_object('kind','membership','groupId',g.id,'name',g.name,'revision',g.revision,
      'startsOn',m.starts_on,'endsOn',m.ends_on,'course',public.individual_study_plan_impact_course(g),'parallelSetId',g.parallel_set_id,
      'membershipId',m.id,'groupStartsOn',g.starts_on,'groupEndsOn',g.ends_on)
      from public.study_group_memberships m
      join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
      where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and g.organizer_id=pl.organizer_id
        and g.school_year=year and m.cancelled_at is null and m.ends_on>=on_date
        and m.starts_on>=pl.starts_on and m.starts_on<=coalesce(pl.ends_on,'infinity'::date)
        and m.starts_on>=g.starts_on and m.ends_on<=g.ends_on
  )
  select coalesce(jsonb_agg(value order by priority,name collate "C",id),'[]'::jsonb)
    from (select * from choices order by priority,name collate "C",id limit 5000) included
$$;

create or replace function public.individual_study_plan_impact(input jsonb, pl public.pupil_placements, on_date date)
returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare
  target jsonb:=input->'target'; kind text:=target->>'kind';
  unavailable jsonb;
  ref_year integer:=extract(year from on_date)::integer - case when extract(month from on_date)<7 then 1 else 0 end;
  compared_on date:=on_date; period_end date;
  plan public.individual_study_plans; rev public.individual_study_plan_revisions;
  current_class public.pupil_class_memberships; target_class public.school_classes;
  current_group public.study_groups; target_group public.study_groups;
  member public.study_group_memberships; alternate_member public.study_group_memberships; alternate_group public.study_groups;
  related record;
  current_course jsonb; target_course jsonb; current_level jsonb; target_level jsonb;
  before_doc jsonb; after_doc jsonb; remainder jsonb; suffix jsonb:='{}'::jsonb;
  related_sources jsonb:='[]'::jsonb; levels jsonb:='[]'::jsonb; issues jsonb:='[]'::jsonb;
  effect text:='same_level'; direct_move boolean; valid_group_period boolean;
  remaining_group_gap boolean; overlap boolean;
  pupil_version integer; offering_revision integer; target_offering_revision integer;
  current_class_name text;
begin
  if input->>'view'='options' then
    if not (daterange(pl.starts_on,pl.ends_on,'[]') @> on_date) then
      return '{"status":"unavailable","options":[]}'::jsonb;
    end if;
    return jsonb_build_object('status','available','options',public.individual_study_plan_impact_options(pl,on_date,ref_year));
  end if;

  unavailable:=jsonb_build_object('status','unavailable','target',target,'impact',null);
  case kind
    when 'class_move' then
      perform public.phase4_keys(target,array['kind','classId']);
    when 'group_add' then
      perform public.phase4_keys(target,array['kind','groupId','startsOn','endsOn']);
      period_end:=public.study_group_date(target->'endsOn');
      if public.study_group_date(target->'startsOn')<>on_date or period_end<on_date then
        perform public.individual_study_plan_invalid();
      end if;
    when 'group_move' then
      perform public.phase4_keys(target,array['kind','membershipId','toGroupId']);
    when 'group_end' then
      perform public.phase4_keys(target,array['kind','membershipId']);
    else perform public.individual_study_plan_invalid();
  end case;
  if not (daterange(pl.starts_on,pl.ends_on,'[]') @> on_date) then return unavailable; end if;

  if kind='class_move' then
    select c.* into target_class from public.school_classes c
      join public.offerings o on o.id=c.offering_id and o.organizer_id=c.organizer_id
      where c.id=public.tjanst_uuid(target->'classId') and c.unit_id=pl.unit_id
        and c.customer_id=pl.customer_id and c.organizer_id=pl.organizer_id
        and c.start_year between ref_year-(case when o.kind='gymnasium' then 2 else 0 end) and ref_year
        and (c.starts_on is null or c.starts_on<=on_date) and (c.ends_on is null or c.ends_on>=on_date);
    if target_class.id is null or exists(select 1 from public.pupil_class_memberships cm
      where cm.placement_id=pl.id and cm.class_id=target_class.id and daterange(cm.starts_on,cm.ends_on,'[]') @> on_date) then
      return unavailable;
    end if;
  else
    if kind in ('group_move','group_end') then
      select m.* into member from public.study_group_memberships m
        join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
        where m.id=public.tjanst_uuid(target->'membershipId') and m.unit_id=pl.unit_id and m.pupil_id=pl.pupil_id
          and m.cancelled_at is null and g.organizer_id=pl.organizer_id and g.school_year=ref_year
          and m.starts_on>=pl.starts_on and m.starts_on<=coalesce(pl.ends_on,'infinity'::date);
      if member.id is null then return unavailable; end if;
      select * into current_group from public.study_groups g where g.id=member.group_id;
      current_course:=public.individual_study_plan_impact_course(current_group);
      before_doc:=public.individual_study_plan_impact_participation(current_group,member.starts_on,member.ends_on);
      related_sources:=jsonb_build_array(public.individual_study_plan_impact_group_source(current_group,member));
    end if;
    if kind in ('group_move','group_add') then
      select * into target_group from public.study_groups g
        where g.id=public.tjanst_uuid(case kind when 'group_move' then target->'toGroupId' else target->'groupId' end)
          and g.unit_id=pl.unit_id and g.organizer_id=pl.organizer_id and g.school_year=ref_year and g.active;
      if target_group.id is null then return unavailable; end if;
      target_course:=public.individual_study_plan_impact_course(target_group);
      related_sources:=related_sources||jsonb_build_array(public.individual_study_plan_impact_group_source(target_group,null));
      if kind='group_move' then
        if on_date>member.ends_on or target_group.id=current_group.id then return unavailable; end if;
        -- move_member flyttar själva startdagen till källans första dag
        -- vid en tidig ändring. Målet behåller gruppens egen slutgräns.
        compared_on:=greatest(on_date,member.starts_on);
        period_end:=least(member.ends_on,target_group.ends_on);
      end if;
      valid_group_period:=compared_on>=target_group.starts_on and compared_on<=period_end
        and period_end<=target_group.ends_on and period_end<=coalesce(pl.ends_on,'infinity'::date);
      if valid_group_period then
        after_doc:=public.individual_study_plan_impact_participation(target_group,compared_on,period_end);
        select exists(select 1 from public.study_group_memberships m
          where m.unit_id=pl.unit_id and m.pupil_id=pl.pupil_id and m.id is distinct from member.id
            and m.parallel_set_id=target_group.parallel_set_id and m.cancelled_at is null
            and daterange(m.starts_on,m.ends_on,'[]') && daterange(compared_on,period_end,'[]'))
          into overlap;
      else
        issues:=issues||'[{"code":"group_period_outside","field":"target"}]'::jsonb;
      end if;
      if overlap then issues:=issues||'[{"code":"group_overlap","field":"target"}]'::jsonb; end if;
    elsif not (daterange(member.starts_on,member.ends_on,'[]') @> on_date) then
      return unavailable;
    else
      after_doc:=public.individual_study_plan_impact_participation(current_group,member.starts_on,on_date);
    end if;
  end if;

  select * into current_class from public.pupil_class_memberships cm
    where cm.placement_id=pl.id and cm.pupil_id=pl.pupil_id and cm.unit_id=pl.unit_id
      and cm.customer_id=pl.customer_id and cm.organizer_id=pl.organizer_id
      and daterange(cm.starts_on,cm.ends_on,'[]') @> compared_on;
  select c.name into current_class_name from public.school_classes c
    where c.id=current_class.class_id and c.unit_id=pl.unit_id and c.customer_id=pl.customer_id and c.organizer_id=pl.organizer_id;
  select * into plan from public.individual_study_plans p where p.placement_id=pl.id and p.offering_id=pl.offering_id;
  rev:=public.individual_study_plan_on(plan.id,compared_on);
  select p.version into pupil_version from public.pupils p
    where p.id=pl.pupil_id and p.customer_id=pl.customer_id and p.organizer_id=pl.organizer_id;
  select o.lifecycle_revision into offering_revision from public.offerings o
    where o.id=pl.offering_id and o.organizer_id=pl.organizer_id;
  if rev.plan_id is null then issues:=issues||'[{"code":"plan_missing","field":"levels"}]'::jsonb; end if;

  if kind='class_move' then
    select o.lifecycle_revision into target_offering_revision from public.offerings o
      where o.id=target_class.offering_id and o.organizer_id=pl.organizer_id;
    if target_class.offering_id<>pl.offering_id then
      effect:='review_education';
      issues:=issues||'[{"code":"target_offering_changed","field":"path"}]'::jsonb;
    elsif rev.plan_id is null then
      effect:='unknown';
    end if;
    if exists(select 1 from public.pupil_class_memberships cm
      where cm.placement_id=pl.id and daterange(cm.starts_on,cm.ends_on,'[]') && daterange(on_date,pl.ends_on,'[]')
        and (cm.id is distinct from current_class.id or cm.starts_on=on_date)) then
      issues:=issues||'[{"code":"class_period_overlap","field":"target"}]'::jsonb;
      if effect='same_level' then effect:='follow_up'; end if;
    end if;
    -- Klasskommandot sparar klasstillhörighet. Befintliga undervisningsmedlemskap
    -- kvarstår, även när planeringen för dem utgår från den gamla klassen.
    for related in
      select g,m from public.study_group_memberships m
      join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
      where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and m.cancelled_at is null
        and m.starts_on>=pl.starts_on and daterange(m.starts_on,m.ends_on,'[]') @> compared_on
        and g.organizer_id=pl.organizer_id and g.school_year=ref_year
        and exists(select 1 from public.study_group_classes x where x.group_id=g.id and x.class_id=current_class.class_id)
        and not exists(select 1 from public.study_group_classes x where x.group_id=g.id and x.class_id=target_class.id)
      order by g.id limit 150
    loop
      current_group:=related.g; member:=related.m;
      current_course:=public.individual_study_plan_impact_course(current_group);
      current_level:=public.individual_study_plan_impact_level(rev.content,current_course);
      related_sources:=related_sources||jsonb_build_array(public.individual_study_plan_impact_group_source(current_group,member));
      if current_level is not null then
        before_doc:=public.individual_study_plan_impact_participation(current_group,member.starts_on,member.ends_on);
        levels:=levels||jsonb_build_array(public.individual_study_plan_impact_level_row(current_level,current_course,
          current_group,'needs_review',before_doc,before_doc));
      end if;
    end loop;
    if jsonb_array_length(related_sources)>0 then
      issues:=issues||'[{"code":"class_group_follow_up","field":"levels"}]'::jsonb;
      if effect='same_level' then effect:='follow_up'; end if;
    end if;
  else
    current_level:=public.individual_study_plan_impact_level(rev.content,current_course);
    target_level:=public.individual_study_plan_impact_level(rev.content,target_course);
    if kind in ('group_end','group_move') and current_course is null
      or kind in ('group_add','group_move') and target_course is null then
      issues:=issues||'[{"code":"group_course_missing","field":"levels"}]'::jsonb;
    end if;
    if kind='group_move' then
      direct_move:=current_group.parallel_set_id=target_group.parallel_set_id and valid_group_period and not overlap;
      if current_group.parallel_set_id<>target_group.parallel_set_id then
        issues:=issues||'[{"code":"different_parallel_set","field":"target"}]'::jsonb;
      elsif direct_move then
        -- Vid en tidig flytt återtas källmedlemskapet. Vid ett påbörjat
        -- medlemskap är den sista dagen före den jämförda måldagen.
        remainder:=public.individual_study_plan_impact_participation(current_group,member.starts_on,compared_on-1);
        suffix:=jsonb_build_object('sourceRemainder',remainder);
      end if;
    end if;
    if kind='group_end' and on_date<member.ends_on and current_level is not null
      and public.individual_study_plan_impact_needs_group(rev.content,current_level,on_date+1,member.ends_on) then
      select m.* into alternate_member from public.study_group_memberships m
        join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
        where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and m.cancelled_at is null and m.id<>member.id
          and m.starts_on>=pl.starts_on and m.starts_on<=on_date+1 and m.ends_on>=member.ends_on
          and g.organizer_id=pl.organizer_id and g.school_year=ref_year
          and public.individual_study_plan_impact_course(g)=current_course
        order by m.starts_on,m.id limit 1;
      remaining_group_gap:=alternate_member.id is null;
      if remaining_group_gap then
        issues:=issues||'[{"code":"group_membership_ends","field":"levels"}]'::jsonb;
      else
        select * into alternate_group from public.study_groups g where g.id=alternate_member.group_id;
        related_sources:=related_sources||jsonb_build_array(public.individual_study_plan_impact_group_source(alternate_group,alternate_member));
      end if;
    end if;
    if kind='group_move' and direct_move and period_end<member.ends_on then
      issues:=issues||'[{"code":"planned_period_review","field":"levels"}]'::jsonb;
    end if;

    if kind='group_add' and target_course is not null then
      select m.* into alternate_member from public.study_group_memberships m
        join public.study_groups g on g.id=m.group_id and g.unit_id=m.unit_id
        where m.pupil_id=pl.pupil_id and m.unit_id=pl.unit_id and m.cancelled_at is null and m.starts_on>=pl.starts_on
          and daterange(m.starts_on,m.ends_on,'[]') @> compared_on and g.organizer_id=pl.organizer_id
          and g.school_year=ref_year and public.individual_study_plan_impact_course(g)=target_course
        order by (m.parallel_set_id=target_group.parallel_set_id) desc,m.id limit 1;
      if alternate_member.id is not null then
        select * into alternate_group from public.study_groups g where g.id=alternate_member.group_id;
        before_doc:=public.individual_study_plan_impact_participation(alternate_group,alternate_member.starts_on,alternate_member.ends_on);
        related_sources:=related_sources||jsonb_build_array(public.individual_study_plan_impact_group_source(alternate_group,alternate_member));
      end if;
      levels:=jsonb_build_array(public.individual_study_plan_impact_level_row(target_level,target_course,target_group,
        case when not valid_group_period or overlap then 'needs_review' when target_level is null then 'new_level' else 'same_level' end,
        before_doc,after_doc));
    elsif kind='group_end' and current_course is not null then
      levels:=jsonb_build_array(public.individual_study_plan_impact_level_row(current_level,current_course,current_group,
        case when remaining_group_gap then 'missing_group' when current_level is null then 'needs_review' else 'same_level' end,before_doc,after_doc));
    elsif kind='group_move' then
      if current_course is not null and current_course=target_course then
        levels:=jsonb_build_array(public.individual_study_plan_impact_level_row(current_level,current_course,current_group,
          case when direct_move and current_level is not null then 'same_level' else 'needs_review' end,before_doc,after_doc));
      else
        if current_course is not null then
          levels:=jsonb_build_array(public.individual_study_plan_impact_level_row(current_level,current_course,current_group,
            'needs_review',before_doc,null));
        end if;
        if target_course is not null then
          levels:=levels||jsonb_build_array(public.individual_study_plan_impact_level_row(target_level,target_course,target_group,
            case when target_level is null then 'new_level' else 'needs_review' end,null,after_doc));
        end if;
      end if;
    end if;
    if rev.plan_id is null or (kind in ('group_end','group_move') and current_course is null)
      or (kind in ('group_add','group_move') and target_course is null) then
      effect:='unknown';
    elsif jsonb_array_length(issues)>0 or exists(select 1 from jsonb_array_elements(levels) x where x->>'change'<>'same_level') then
      effect:='follow_up';
    end if;
  end if;

  return jsonb_build_object('status','compared','target',target,'impact',jsonb_build_object(
    'comparedOn',compared_on,
    'plan',case when rev.plan_id is not null then jsonb_build_object('planId',rev.plan_id,'revision',rev.revision) end,
    'result',effect,'issues',issues,
    'sources',jsonb_build_object('classId',current_class.class_id,'classMembershipId',current_class.id,
      'className',current_class_name,'targetClassName',target_class.name,
      'classStartsOn',current_class.starts_on,'classEndsOn',current_class.ends_on,
      'pupilVersion',pupil_version,'offeringId',pl.offering_id,'offeringRevision',offering_revision,
      'targetOfferingId',target_class.offering_id,'targetOfferingRevision',target_offering_revision,'groups',related_sources),
    'levels',levels)||suffix);
end $$;

revoke all on function public.individual_study_plan_impact(jsonb,public.pupil_placements,date),
  public.individual_study_plan_impact_course(public.study_groups),
  public.individual_study_plan_impact_participation(public.study_groups,date,date),
  public.individual_study_plan_impact_group_source(public.study_groups,public.study_group_memberships),
  public.individual_study_plan_impact_level(jsonb,jsonb),
  public.individual_study_plan_impact_level_row(jsonb,jsonb,public.study_groups,text,jsonb,jsonb),
  public.individual_study_plan_impact_needs_group(jsonb,jsonb,date,date),
  public.individual_study_plan_impact_options(public.pupil_placements,date,integer)
from public,anon,authenticated,service_role,skolplattform_worker;
