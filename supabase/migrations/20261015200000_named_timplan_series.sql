-- NAMED-TIMPLANS-UX-02: additive identity only. Old scope-wide uniqueness stays
-- until all creation, decision and read paths become series-aware together.
create function public.phase5_timplan_series_name(n text) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare c text;bad constant int4multirange:='{[1,32),[127,160),[173,174),[1536,1542),[1564,1565),[1757,1758),[1807,1808),[2192,2194),[2274,2275),[6158,6159),[8203,8208),[8234,8239),[8288,8293),[8294,8304),[55296,57344),[65279,65280),[65529,65532),[69821,69822),[69837,69838),[78896,78912),[113824,113828),[119155,119163),[917505,917506),[917536,917632)}';
begin
 if n is null or char_length(n) not between 1 and 80 or n<>btrim(n) then return false;end if;
 for c in select regexp_split_to_table(n,'') loop
  if ascii(c)<@bad then return false;end if;
 end loop;
 return true;
end $$;

create table public.timplan_series (
 id uuid primary key default gen_random_uuid(),
 organizer_id uuid not null references public.organizers(id) on delete cascade,
 offering_id uuid not null,
 unit_id uuid not null,
 name text not null check(public.phase5_timplan_series_name(name)),
 normalized_name text not null check(normalized_name=lower(name)),
 revision integer not null default 0 check(revision>=0),
 legacy_default boolean not null default false,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 foreign key(offering_id,unit_id,organizer_id) references public.offering_units(offering_id,unit_id,organizer_id) on delete cascade,
 unique(id,offering_id,unit_id,organizer_id),
 unique(offering_id,unit_id,normalized_name)
);
create unique index timplan_series_legacy_default on public.timplan_series(offering_id,unit_id) where legacy_default;
alter table public.timplan_series enable row level security;
alter table public.timplan_series force row level security;
revoke all on public.timplan_series from public,anon,authenticated,service_role,skolplattform_worker;
alter table public.timplans add column series_id uuid,add column name_at_creation text
 check(name_at_creation is null or public.phase5_timplan_series_name(name_at_creation));

-- These series are created now. No historical name or creation time is invented
-- for an existing plan version; name_at_creation remains NULL on backfill.
insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name,legacy_default)
 select distinct organizer_id,offering_id,unit_id,'Grundfördelning','grundfördelning',true from public.timplans;

-- Backfill changes only the additive column. Restore every trigger's exact prior
-- activation in this transaction; never leave a broad permission or bypass.
do $$
declare flags jsonb;r record;mode text;
begin
 select jsonb_object_agg(tgname,tgenabled::text) into flags from pg_trigger
 where tgrelid='public.timplans'::regclass and tgname in ('timplans_touch','timplans_gym_guard','timplans_gym_matrix');
 if (select count(*) from jsonb_each_text(flags))<>3 then raise exception 'Expected timplan migration guards missing';end if;
 for r in select key from jsonb_each_text(flags) loop
  execute format('alter table public.timplans disable trigger %I',r.key);
 end loop;
 update public.timplans t set series_id=s.id from public.timplan_series s
 where s.offering_id=t.offering_id and s.unit_id=t.unit_id and s.organizer_id=t.organizer_id and s.legacy_default;
 for r in select key,value from jsonb_each_text(flags) loop
  mode:=case r.value when 'O' then 'enable' when 'A' then 'enable always' when 'R' then 'enable replica' when 'D' then 'disable' end;
  if mode is null then raise exception 'Unknown trigger activation';end if;
  execute format('alter table public.timplans %s trigger %I',mode,r.key);
 end loop;
end $$;
alter table public.timplans alter column series_id set not null;
alter table public.timplans add constraint timplans_series_scope_fkey
 foreign key(series_id,offering_id,unit_id,organizer_id) references public.timplan_series(id,offering_id,unit_id,organizer_id);
create index timplans_series_version on public.timplans(series_id,version);

create function public.phase5_timplan_series_guard() returns trigger
language plpgsql set search_path=pg_catalog,public as $$
begin
 if (new.id,new.organizer_id,new.offering_id,new.unit_id,new.legacy_default,new.created_at)
  is distinct from (old.id,old.organizer_id,old.offering_id,old.unit_id,old.legacy_default,old.created_at)
  or new.revision<>old.revision+1 then
  raise exception 'Timplan series identity locked' using errcode='42501';end if;
 new.updated_at:=clock_timestamp();return new;
end $$;
create trigger timplan_series_guard before update on public.timplan_series for each row execute function public.phase5_timplan_series_guard();

create function public.phase5_timplan_series_binding() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare s public.timplan_series;o public.offerings;
begin
 if tg_op='UPDATE' then
  if (new.series_id,new.name_at_creation) is distinct from (old.series_id,old.name_at_creation) then
   raise exception 'Timplan series binding locked' using errcode='42501';end if;
  return new;
 end if;
 if new.series_id is null then
  -- Serialize first legacy inserts on their existing education. NOWAIT avoids
  -- a reversed lock-order wait in a direct INSERT; the caller retries safely.
  select * into o from public.offerings where id=new.offering_id and organizer_id=new.organizer_id for update nowait;
  if not found then raise exception 'Timplan series education missing' using errcode='23503';end if;
  select * into s from public.timplan_series where offering_id=new.offering_id and unit_id=new.unit_id and legacy_default;
  if not found then
   insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name,legacy_default)
   values(new.organizer_id,new.offering_id,new.unit_id,'Grundfördelning','grundfördelning',true) returning * into s;
  end if;
  new.series_id:=s.id;
 else
  select * into s from public.timplan_series where id=new.series_id;
 end if;
 if s.id is null or (s.offering_id,s.unit_id,s.organizer_id) is distinct from (new.offering_id,new.unit_id,new.organizer_id) then
  raise exception 'Timplan series scope mismatch' using errcode='23503';end if;
 if new.name_at_creation is not null and new.name_at_creation<>s.name then
  raise exception 'Timplan series name snapshot mismatch' using errcode='22023';end if;
 new.name_at_creation:=s.name;
 return new;
exception when lock_not_available then
 raise exception 'Timplan series changed concurrently' using errcode='40001',hint='timplan_series_conflict';
end $$;
create trigger timplans_series_binding before insert or update on public.timplans for each row execute function public.phase5_timplan_series_binding();
revoke all on function public.phase5_timplan_series_name(text),public.phase5_timplan_series_guard(),public.phase5_timplan_series_binding()
 from public,anon,authenticated,service_role,skolplattform_worker;
