-- Komplett intern form-/kedjeprövning och objekturval. Fortsatt utan Worker-GRANT.
create function public.phase3_mandate_shape(a public.access_assignments)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare units integer; groups integer; pupils integer; cases integer;
begin
  if a.profile_id is distinct from 'synthetic-v1' or a.scope_kind is null then return false; end if;
  select count(*) into units from public.mandate_units where assignment_id=a.id;
  select count(*) into groups from public.mandate_groups where assignment_id=a.id;
  select count(*) into pupils from public.mandate_pupils where assignment_id=a.id;
  select count(*) into cases from public.mandate_cases where assignment_id=a.id;
  if a.function in ('kundadmin','granskare') then
    return a.organizer_id is null and a.scope_kind='school' and units+groups+pupils+cases=0;
  end if;
  if units=0 or a.organizer_id is null then return false; end if;
  if a.function='larare' then return a.scope_kind='group' and groups>0 and pupils+cases=0; end if;
  if a.function='support' then
    return a.scope_kind='pupil' and units=1 and pupils=1 and groups+cases=0
      and a.parent_assignment_id is not null and a.approved_by_assignment_id=a.parent_assignment_id
      and a.starts_at is not null and a.ends_at is not null
      and a.ends_at-a.starts_at <= interval '60 minutes'
      and a.purpose_code='synthetic-troubleshooting';
  end if;
  if a.function='elevhalsa' then
    return (a.scope_kind='school' and groups+pupils+cases=0)
      or (a.scope_kind='pupil' and pupils>0 and groups+cases=0)
      or (a.scope_kind='case' and cases>0 and groups+pupils=0);
  end if;
  return a.scope_kind='school' and groups+pupils+cases=0;
end $$;

create function public.phase3_mandate_is_valid(assignment_id uuid, require_current boolean default true)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare a public.access_assignments; p public.access_assignments;
  cursor_id uuid:=assignment_id; seen uuid[]:='{}'; check_time boolean:=require_current;
  today date:=(statement_timestamp() at time zone 'Europe/Stockholm')::date;
begin
  loop
    if cursor_id is null or cursor_id=any(seen) or cardinality(seen)>=64 then return false; end if;
    seen:=array_append(seen,cursor_id);
    select * into a from public.access_assignments where id=cursor_id;
    if not found or a.ended_at is not null then return false; end if;
    -- Tidigare kundkonton behålls; äldre verksamhetsmandat ger ingen fas3-rätt.
    if a.profile_id is null then
      return a.function in ('kundadmin','granskare') and a.parent_assignment_id is null
        and a.valid_from<=today and (a.valid_to is null or today<=a.valid_to)
        and exists(select 1 from public.memberships m join public.customers c on c.id=m.customer_id
          where m.id=a.membership_id and m.status='active' and c.closed_at is null);
    end if;
    if not public.phase3_mandate_shape(a)
      or not exists(select 1 from public.memberships m join public.customers c on c.id=m.customer_id
        where m.id=a.membership_id and m.status='active' and c.closed_at is null)
      or (a.function in ('rektor','larare') and not public.phase3_staff_binding_is_valid(a.id))
      or (check_time and (a.valid_from>today or (a.valid_to is not null and a.valid_to<today)
        or (a.starts_at is not null and a.starts_at>statement_timestamp())
        or (a.ends_at is not null and a.ends_at<=statement_timestamp()))) then return false; end if;
    if a.parent_assignment_id is null then
      return a.function in ('huvudman','elevhalsoansvarig','it','kundadmin','granskare');
    end if;
    select * into p from public.access_assignments where id=a.parent_assignment_id;
    if not found then return false; end if;
    if a.issued_by_assignment_id is distinct from p.id
      or a.customer_id is distinct from p.customer_id or a.organizer_id is distinct from p.organizer_id
      or not ((p.function='huvudman' and a.function='rektor')
        or (p.function='rektor' and a.function in ('larare','administrator','elevhalsa','support'))
        or (p.function='elevhalsoansvarig' and a.function='elevhalsa')
        or (p.function='kundadmin' and a.function in ('kundadmin','granskare')))
      or exists(select 1 from public.memberships x join public.memberships y on x.identity_id=y.identity_id
        where x.id=a.membership_id and y.id=p.membership_id)
      or a.valid_from<p.valid_from or (p.valid_to is not null and (a.valid_to is null or a.valid_to>p.valid_to))
      or (p.starts_at is not null and (a.starts_at is null or a.starts_at<p.starts_at))
      or (p.ends_at is not null and (a.ends_at is null or a.ends_at>p.ends_at))
      or exists(select 1 from public.mandate_units u where u.assignment_id=a.id
        and not exists(select 1 from public.mandate_units pu where pu.assignment_id=p.id and pu.unit_id=u.unit_id))
    then return false; end if;
    cursor_id:=p.id; check_time:=true;
  end loop;
end $$;

-- Gemensamt kundlås serialiserar skyddad läsning med mandat-/scopeändring.
-- Servern tar detta EFTER sessionslåset men FÖRE medlems-/uppdragsradlås.
create function public.phase3_lock_customer(customer_id uuid) returns void
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
begin
  if customer_id is null then raise exception 'Missing customer' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(hashtextextended('phase3:'||customer_id::text,0));
end $$;

create function public.phase3_actor() returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
  perform public.phase3_lock_customer(public.current_customer_id());
  select * into a from public.access_assignments where id=public.current_assignment_id();
  if not found or a.customer_id is distinct from public.current_customer_id()
    or a.membership_id is distinct from nullif(current_setting('app.membership_id',true),'')::uuid
    or not exists(select 1 from public.memberships m where m.id=a.membership_id and m.identity_id=public.current_identity_id())
    or not public.phase3_mandate_is_valid(a.id) then
    raise exception 'Mandate denied' using errcode='42501';
  end if;
  return a;
end $$;

create function public.phase3_pupil_in_scope(assignment_id uuid,pupil_id uuid,case_id uuid default null)
returns boolean language sql stable security invoker set search_path=pg_catalog,public as $$
  select exists(select 1 from public.access_assignments a
    join public.phase3_probe_pupils p on p.id=pupil_id and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
    join public.mandate_units u on u.assignment_id=a.id and u.unit_id=p.unit_id
    where a.id=assignment_id and public.phase3_mandate_is_valid(a.id)
      and a.function in ('rektor','larare','administrator','elevhalsa','support')
      and (case_id is null or exists(select 1 from public.phase3_probe_cases c where c.id=case_id and c.pupil_id=p.id))
      and (a.scope_kind='school'
        or (a.scope_kind='group' and exists(select 1 from public.mandate_groups g
          join public.phase3_probe_group_members gm on gm.group_id=g.group_id and gm.pupil_id=p.id where g.assignment_id=a.id))
        or (a.scope_kind='pupil' and exists(select 1 from public.mandate_pupils mp where mp.assignment_id=a.id and mp.pupil_id=p.id))
        or (a.scope_kind='case' and exists(select 1 from public.mandate_cases mc
          join public.phase3_probe_cases c on c.id=mc.case_id and c.pupil_id=p.id where mc.assignment_id=a.id and mc.case_id=case_id))))
$$;

create function public.phase3_read_pupils(pupil_id uuid default null, case_id uuid default null, for_export boolean default false)
returns table(id uuid,display_name text,unit_id uuid,group_ids uuid[])
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
  a:=public.phase3_actor();
  if a.function not in ('rektor','larare','administrator','elevhalsa','support')
    or (for_export and a.function<>'administrator') then raise exception 'Read denied' using errcode='42501'; end if;
  return query select p.id,p.display_name,p.unit_id,
    array(select gm.group_id from public.phase3_probe_group_members gm where gm.pupil_id=p.id
      and (a.scope_kind<>'group' or exists(select 1 from public.mandate_groups g where g.assignment_id=a.id and g.group_id=gm.group_id)) order by gm.group_id)
  from public.phase3_probe_pupils p where (pupil_id is null or p.id=pupil_id)
    and public.phase3_pupil_in_scope(a.id,p.id,case_id) order by p.id;
end $$;

revoke all on function public.phase3_mandate_shape(public.access_assignments),
  public.phase3_mandate_is_valid(uuid,boolean),public.phase3_lock_customer(uuid),public.phase3_actor(),
  public.phase3_pupil_in_scope(uuid,uuid,uuid),public.phase3_read_pupils(uuid,uuid,boolean)
from public,anon,authenticated,skolplattform_worker;
