-- Efter namnbytet av katalogvalideraren är det tidigare funktionsnamnet
-- inte längre ett giltigt prefix för läsårparametern. Använd parameterpositionen.
create or replace function public.nationella_prov_valid_katalog(doc jsonb, school_year integer) returns boolean
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
      where k.school_year = $2
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
