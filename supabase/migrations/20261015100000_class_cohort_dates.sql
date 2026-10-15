-- CLASS-COHORT-02. Unknown historical dates and registration times stay unknown.
alter table public.school_classes
 add column starts_on date,
 add column ends_on date,
 add column validity_source text not null default 'legacy_unknown',
 add column created_at timestamptz,
 add column updated_at timestamptz,
 add constraint school_classes_validity_dates check (
  (starts_on is null or isfinite(starts_on)) and
  (ends_on is null or (isfinite(ends_on) and starts_on is not null and ends_on>=starts_on))),
 add constraint school_classes_validity_source check (
  (validity_source='legacy_unknown' and starts_on is null and ends_on is null) or
  (validity_source='education_start' and starts_on is not null));

create function public.phase5_class_cohort_date(value text) returns date
language plpgsql immutable set search_path=pg_catalog as $$
declare result date;
begin
 if value is null or value !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then return null;end if;
 begin result:=value::date;exception when datetime_field_overflow or invalid_datetime_format then return null;end;
 if not isfinite(result) or to_char(result,'YYYY-MM-DD')<>value then return null;end if;
 return result;
end $$;

-- Exact source, never min/fallback. Unknown/unbound legacy versions are not
-- evidence; every bound version must supply the same valid calendar date.
create function public.phase5_class_cohort_source_date(target uuid) returns date
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare o public.offerings; candidate date; dates integer; versions integer; valid integer;
begin
 select * into o from public.offerings where id=target;
 if not found or o.kind<>'gymnasium' then return null;end if;
 select count(*),count(public.phase5_class_cohort_date(p.basis_reference->>'startedOn')),
  count(distinct public.phase5_class_cohort_date(p.basis_reference->>'startedOn')),
  min(public.phase5_class_cohort_date(p.basis_reference->>'startedOn'))
 into versions,valid,dates,candidate from public.point_plans p
 where p.offering_id=o.id and (p.catalog_id is not null or p.basis_reference is not null);
 if versions=0 or valid<>versions or dates<>1
  or exists(select 1 from public.point_plans p where p.offering_id=o.id and
   (p.catalog_id is not null or p.basis_reference is not null) and
   (p.catalog_id is null or p.basis_reference is null or p.catalog_id is distinct from p.basis_reference->>'catalogId')) then return null;end if;
 return candidate;
end $$;

create function public.phase5_class_cohort_starts_on(target uuid) returns date
language sql stable security definer set search_path=pg_catalog,public as $$
select d.started from public.offerings o cross join lateral
 (select public.phase5_class_cohort_source_date(o.id) started) d
where o.id=target and extract(year from d.started)::integer=o.start_year
$$;

-- Supported RPCs already hold customer -> school -> offering -> plan locks.
-- A direct plan write has acquired its tuple first. NOWAIT prevents waiting
-- backwards against a class creator; a conflict aborts the whole statement.
-- The offering lock remains held through commit in both write directions.
create function public.phase5_class_cohort_lock(target uuid) returns public.offerings
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings;
begin
 if current_setting('transaction_isolation')<>'read committed' then
  raise exception 'Class source requires current committed state' using errcode='40001',hint='class_cohort_start_locked';end if;
 select * into o from public.offerings where id=target for update nowait;
 if not found then raise exception 'Class education missing' using errcode='23503';end if;
 return o;
exception when lock_not_available then
 raise exception 'Class education changed concurrently' using errcode='40001',hint='class_cohort_start_locked';
end $$;

create function public.phase5_class_cohort_class_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare o public.offerings; started date; registered timestamptz;
begin
 if tg_op='UPDATE' then
  if (new.starts_on,new.ends_on,new.validity_source,new.created_at) is distinct from
     (old.starts_on,old.ends_on,old.validity_source,old.created_at)
   or (new.id,new.customer_id,new.organizer_id,new.unit_id,new.offering_id,new.start_year) is distinct from
      (old.id,old.customer_id,old.organizer_id,old.unit_id,old.offering_id,old.start_year) then
   raise exception 'Class identity and validity immutable' using errcode='40001',hint='class_cohort_start_locked';end if;
  new.updated_at:=old.updated_at;
  if new is distinct from old then new.updated_at:=clock_timestamp();end if;
  return new;
 end if;
 o:=public.phase5_class_cohort_lock(new.offering_id);
 if o.kind='gymnasium' then
  started:=public.phase5_class_cohort_starts_on(o.id);
  if started is null then raise exception 'Class education start unavailable' using errcode='40001',hint='class_cohort_source_invalid';end if;
  if new.start_year<>(extract(year from started)::integer-case when extract(month from started)<7 then 1 else 0 end)
   or (new.starts_on is not null and new.starts_on<>started) or new.ends_on is not null then
   raise exception 'Class education start mismatch' using errcode='22023';end if;
  new.starts_on:=started;new.ends_on:=null;new.validity_source:='education_start';
 else
  if new.starts_on is not null or new.ends_on is not null or new.validity_source<>'legacy_unknown' then
   raise exception 'Unsupported class date source' using errcode='22023';end if;
 end if;
 registered:=clock_timestamp();new.created_at:=registered;new.updated_at:=registered;
 return new;
end $$;
create trigger school_classes_cohort_dates before insert or update on public.school_classes
 for each row execute function public.phase5_class_cohort_class_guard();

create function public.phase5_class_cohort_source_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare target uuid; o public.offerings; existing date; proposed date;
begin
 if tg_table_name='offerings' then
  if (new.start_year,new.kind) is distinct from (old.start_year,old.kind)
   and current_setting('transaction_isolation')<>'read committed' then
   raise exception 'Class source requires current committed state' using errcode='40001',hint='class_cohort_start_locked';end if;
  if (new.start_year,new.kind) is distinct from (old.start_year,old.kind)
   and exists(select 1 from public.school_classes where offering_id=old.id) then
   raise exception 'Class education start locked' using errcode='40001',hint='class_cohort_start_locked';end if;
  return new;
 end if;
 target:=case when tg_op='INSERT' then new.offering_id else old.offering_id end;
 -- No reverse lock for ordinary content/status updates. A source-changing
 -- write always serializes, including when no class existed at statement start.
 if tg_op='UPDATE' and (new.offering_id,new.catalog_id,new.basis_reference->>'catalogId',new.basis_reference->>'startedOn') is not distinct from
  (old.offering_id,old.catalog_id,old.basis_reference->>'catalogId',old.basis_reference->>'startedOn') then return new;end if;
 o:=public.phase5_class_cohort_lock(target);
 if exists(select 1 from public.school_classes where offering_id=target) then
  existing:=public.phase5_class_cohort_source_date(target);
  proposed:=case when tg_op='DELETE' then null else public.phase5_class_cohort_date(new.basis_reference->>'startedOn') end;
  -- Unknown legacy evidence is never made up; it can remain readable, but its
  -- source cannot be changed underneath an existing class.
  if existing is null or proposed is distinct from existing or tg_op='DELETE'
   or new.offering_id is distinct from target or new.catalog_id is null
   or new.catalog_id is distinct from new.basis_reference->>'catalogId' then
   raise exception 'Class education start locked' using errcode='40001',hint='class_cohort_start_locked';end if;
 end if;
 if tg_op='UPDATE' and new.offering_id is distinct from old.offering_id then
  o:=public.phase5_class_cohort_lock(new.offering_id);
  if exists(select 1 from public.school_classes where offering_id=new.offering_id) and
   (public.phase5_class_cohort_source_date(new.offering_id) is null or
    public.phase5_class_cohort_date(new.basis_reference->>'startedOn') is distinct from public.phase5_class_cohort_source_date(new.offering_id)) then
   raise exception 'Class education start locked' using errcode='40001',hint='class_cohort_start_locked';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
-- Alphabetical ordering places the focused error before older general guards.
create trigger aa_class_cohort_offering_start before update on public.offerings
 for each row execute function public.phase5_class_cohort_source_guard();
create trigger aa_class_cohort_plan_start before insert or update or delete on public.point_plans
 for each row execute function public.phase5_class_cohort_source_guard();

create function public.phase5_class_cohort_membership_fits(c public.school_classes,member_start date,member_end date) returns boolean
language sql immutable set search_path=pg_catalog,public as $$
 select member_start is not null and isfinite(member_start)
  and (member_end is null or (isfinite(member_end) and member_end>=member_start))
  and (c.starts_on is null or member_start>=c.starts_on)
  and (c.ends_on is null or (member_end is not null and member_end<=c.ends_on))
$$;
create function public.phase5_class_cohort_membership_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare c public.school_classes;
begin
 select * into c from public.school_classes where id=new.class_id for share;
 if not found then raise exception 'Class missing' using errcode='23503';end if;
 if not public.phase5_class_cohort_membership_fits(c,new.starts_on,new.ends_on) then
  raise exception 'Membership outside class validity' using errcode='22023',hint='class_cohort_membership_period';end if;
 return new;
end $$;
create trigger pupil_class_memberships_cohort_dates before insert or update on public.pupil_class_memberships
 for each row execute function public.phase5_class_cohort_membership_guard();

revoke all on function public.phase5_class_cohort_date(text),public.phase5_class_cohort_source_date(uuid),public.phase5_class_cohort_starts_on(uuid),
 public.phase5_class_cohort_lock(uuid),public.phase5_class_cohort_class_guard(),
 public.phase5_class_cohort_source_guard(),public.phase5_class_cohort_membership_guard(),
 public.phase5_class_cohort_membership_fits(public.school_classes,date,date)
 from public,anon,authenticated,service_role,skolplattform_worker;
