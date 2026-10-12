-- offering.start_year is the calendar year of startedOn. Class cohorts and
-- annual columns use the academic year (July boundary); these are distinct.
create or replace function public.phase5_class_blockers(p public.timplans,o public.offerings) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare y integer;messages jsonb:='[]';
begin
 y:=public.phase5_class_start_year(p);
 if y is null or y not between 2000 and 2100 then messages:=messages||jsonb_build_array('Timplanen saknar ett giltigt fryst startdatum. Skapa en ny version med verifierat underlag.');
 elsif o.start_year is not null and o.start_year<>substring(p.gym_basis->'basisReference'->>'startedOn',1,4)::integer then messages:=messages||jsonb_build_array('Utbildningens kullstart stämmer inte med timplanens frysta underlag. Kontrollera utbildningen innan klassen kopplas.');end if;
 if public.phase5_plan_decision_profile(p.gym_basis) is null then messages:=messages||jsonb_build_array('Timplanen saknar ett stött nationellt Gy25-underlag.');end if;
 if o.archived_at is not null then messages:=messages||jsonb_build_array('Utbildningen är arkiverad.');end if;
 return messages;
end $$;
