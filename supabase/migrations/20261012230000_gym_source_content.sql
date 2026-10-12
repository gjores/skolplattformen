-- Read-only source projection: distinguish changed frame from approval metadata.
create or replace function public.phase5_gym_timplan_result(plan_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;o public.offerings;a public.access_assignments;catalog jsonb;current_source jsonb;values jsonb;
begin
 select * into p from public.timplans where id=plan_id;
 if p.gym_basis is null then raise exception 'Gym legacy basis unavailable' using errcode='42501',hint='gym_timplan_legacy';end if;
 select * into o from public.offerings where id=p.offering_id;
 a:=public.phase3_actor();select payload into catalog from public.programplan_catalogs where catalog_id=p.gym_basis->>'catalogId';
 select jsonb_build_object('planId',q.id,'version',q.version,'revision',q.revision,'status',q.status) into current_source
 from public.point_plans q where q.offering_id=p.offering_id and q.organizer_id=p.organizer_id order by version desc,id limit 1;
 select coalesce(jsonb_object_agg(c.row_id,(select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)),'{}'::jsonb)
 into values from public.timplan_cells c where c.timplan_id=p.id;
 return jsonb_build_object('id',p.id,'offeringId',p.offering_id,'unitId',p.unit_id,'schoolName',(select name from public.school_units where id=p.unit_id),
 'version',p.version,'revision',p.revision,'status',p.status,'source',p.gym_basis,'catalog',catalog,'currentSource',current_source,'currentSourceBasis',case when current_source is null then null else public.phase5_gym_timplan_source((current_source->>'planId')::uuid) end,'hours',values,
 'canPlan',a.function in ('rektor','administrator') and p.status in ('utkast','atersand') and o.archived_at is null,'archived',o.archived_at is not null);
end $$;
