-- Gemensamma publicerade provdatum. Skolans deltagare och resursval ligger kvar i skolans provplan.
create table public.nationella_prov_kataloger (
  school_year integer not null check (school_year between 2000 and 2100),
  revision integer not null check (revision > 0),
  document jsonb not null check (jsonb_typeof(document) = 'array' and octet_length(document::text) <= 262144),
  checked_date date not null check (checked_date >= date '2000-01-01'),
  source_url text not null check (source_url = 'https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-gymnasieskolan'),
  imported_at timestamptz not null default clock_timestamp(),
  primary key (school_year, revision)
);

alter table public.nationella_prov_kataloger enable row level security;
alter table public.nationella_prov_kataloger force row level security;
revoke all on public.nationella_prov_kataloger from public, anon, authenticated, service_role, skolplattform_worker;
grant select on public.nationella_prov_kataloger to skolplattform_worker;
create policy nationella_prov_katalog_worker_read on public.nationella_prov_kataloger
for select to skolplattform_worker using (true);

create trigger nationella_prov_katalog_immutable before update or delete on public.nationella_prov_kataloger
for each row execute function public.nationella_prov_immutable();

create function public.nationella_prov_katalog_import(import_year integer, import_document jsonb, import_date date)
returns table (revision integer, changed boolean)
language plpgsql volatile set search_path = pg_catalog, public as $$
declare
  latest public.nationella_prov_kataloger;
  source constant text := 'https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-gymnasieskolan';
begin
  if import_year is null or import_year not between 2000 and 2100
    or import_date is null or import_date not between date '2000-01-01' and (statement_timestamp() at time zone 'Europe/Stockholm')::date
    or jsonb_typeof(import_document) is distinct from 'array'
    or octet_length(import_document::text) > 262144 then
    raise exception 'Invalid national exam catalogue' using errcode = '22023';
  end if;
  if jsonb_array_length(import_document) not between 1 and 200
    or exists (select 1 from jsonb_array_elements(import_document) item
      where jsonb_typeof(item -> 'id') is distinct from 'string'
        or length(item ->> 'id') > 80 or item ->> 'id' = 'eget-prov'
        or item ->> 'id' !~ '^[a-z0-9]+(-[a-z0-9]+)*$')
    or exists (select 1 from jsonb_array_elements(import_document) item group by item ->> 'id' having count(*) > 1) then
    raise exception 'Invalid national exam catalogue entries' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(2026111903, import_year);
  select * into latest from public.nationella_prov_kataloger k where k.school_year = import_year
    order by k.revision desc limit 1;
  if latest.document = import_document then
    return query select latest.revision, false;
    return;
  end if;
  revision := coalesce(latest.revision, 0) + 1;
  insert into public.nationella_prov_kataloger(school_year, revision, document, checked_date, source_url)
    values (import_year, revision, import_document, import_date, source);
  return query select revision, true;
end $$;

revoke all on function public.nationella_prov_katalog_import(integer, jsonb, date)
from public, anon, authenticated, service_role, skolplattform_worker;

-- Kör samma grundvalidering för äldre och nya provplaner. Den nya källkopplingen valideras separat.
alter function public.nationella_prov_valid(jsonb, integer) rename to nationella_prov_valid_v1;

create function public.nationella_prov_valid(doc jsonb, school_year integer) returns boolean
language plpgsql stable set search_path = pg_catalog, public as $$
declare
  link jsonb;
  unlinked jsonb;
begin
  if not public.nationella_prov_keys(doc, array['granskad', 'bokningar'])
    or jsonb_typeof(doc -> 'bokningar') is distinct from 'array'
    or octet_length(doc::text) > 262144 then
    return false;
  end if;
  if jsonb_array_length(doc -> 'bokningar') > 200 then return false; end if;
  for link in select item -> 'kallprov' from jsonb_array_elements(doc -> 'bokningar') item
    where jsonb_typeof(item) = 'object' and item ? 'kallprov' loop
    if not public.nationella_prov_keys(link, array['id', 'revision'])
      or jsonb_typeof(link -> 'id') is distinct from 'string'
      or length(link ->> 'id') > 80 or link ->> 'id' = 'eget-prov'
      or link ->> 'id' !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
      or not coalesce(public.phase5_programplan_integer(link -> 'revision', 1, 2147483647), false) then
      return false;
    end if;
    if not exists (select 1 from public.nationella_prov_kataloger k
      where k.school_year = nationella_prov_valid.school_year
        and k.revision = ((link ->> 'revision')::numeric)::integer
        and k.document @> jsonb_build_array(jsonb_build_object('id', link -> 'id'))) then
      return false;
    end if;
  end loop;
  select coalesce(jsonb_agg(
    case when jsonb_typeof(item) = 'object' then item - 'kallprov' else item end order by position
  ), '[]'::jsonb) into unlinked
    from jsonb_array_elements(doc -> 'bokningar') with ordinality as rows(item, position);
  return public.nationella_prov_valid_v1(jsonb_set(doc, '{bokningar}', unlinked), school_year);
end $$;

revoke all on function public.nationella_prov_valid(jsonb, integer)
from public, anon, authenticated, service_role, skolplattform_worker;
