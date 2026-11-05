-- VP-07. The group view names the classes it offers, also those without pupils yet. Class id and name only.
CREATE OR REPLACE FUNCTION public.study_group_projection(a access_assignments, unit uuid, school_year integer)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
 select jsonb_build_object('contractVersion','study_group_v1','unitId',unit,'schoolYear',school_year,
  'groups',(select coalesce(jsonb_agg(public.study_group_document(g) order by g.name collate "C",g.id),'[]') from public.study_groups g where g.unit_id=unit and g.school_year=study_group_projection.school_year),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('id',m.id,'groupId',m.group_id,'pupilId',m.pupil_id,'startsOn',m.starts_on,'endsOn',m.ends_on,'source',m.source,'sourceRef',m.source_ref) order by m.group_id,m.starts_on,m.id),'[]')
   from public.study_group_memberships m join public.study_groups g on g.id=m.group_id join public.pupils p on p.id=m.pupil_id
   where g.unit_id=unit and g.school_year=study_group_projection.school_year and m.cancelled_at is null
    and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))),
  'pupils',public.study_group_pupils(a,unit,school_year),
  'classes',(select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.name) order by c.name collate "C",c.id),'[]') from public.school_classes c where c.unit_id=unit))
$function$;
