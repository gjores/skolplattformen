-- Färsk serverklocka efter låsväntan och avgränsad kontokompatibilitet.
create or replace function public.phase3_mandate_is_valid(assignment_id uuid, require_current boolean default true)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare a public.access_assignments; p public.access_assignments;
  cursor_id uuid:=assignment_id; seen uuid[]:='{}'; check_time boolean:=require_current;
  server_now timestamptz:=clock_timestamp();
  today date:=(server_now at time zone 'Europe/Stockholm')::date;
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
    if not isfinite(a.valid_from) or (a.valid_to is not null and not isfinite(a.valid_to)) or not public.phase3_mandate_shape(a)
      or not exists(select 1 from public.memberships m join public.customers c on c.id=m.customer_id
        where m.id=a.membership_id and m.status='active' and c.closed_at is null)
      or (a.function in ('rektor','larare') and not public.phase3_staff_binding_is_valid(a.id))
      or (check_time and (a.valid_from>today or (a.valid_to is not null and a.valid_to<today)
        or (a.starts_at is not null and a.starts_at>server_now)
        or (a.ends_at is not null and a.ends_at<=server_now))) then return false; end if;
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

-- Historiska kontoroller administreras av kundadmin utan elevmandat.
create or replace function public.phase3_revoke_mandate(target_id uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; target public.access_assignments; legacy_account boolean;
begin
  a:=public.phase3_actor();
  select * into target from public.access_assignments where id=target_id;
  if not found then raise exception 'Revocation denied' using errcode='42501'; end if;
  legacy_account:=a.function='kundadmin' and target.function in ('kundadmin','granskare')
    and target.profile_id is null and target.parent_assignment_id is null
    and target.customer_id=a.customer_id and target.ended_at is null
    and not exists(select 1 from public.memberships x join public.memberships y on x.identity_id=y.identity_id
      where x.id=a.membership_id and y.id=target.membership_id);
  if not legacy_account and (target.parent_assignment_id is distinct from a.id
    or not public.phase3_mandate_is_valid(target.id,false)) then
    raise exception 'Revocation denied' using errcode='42501'; end if;
  update public.access_assignments set ended_at=clock_timestamp(),ended_by=a.membership_id where id=target.id;
  return target.id;
end $$;
