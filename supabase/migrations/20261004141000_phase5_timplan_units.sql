-- 05-22 ADMIN-04: timplan och dess versioner är skolbundna.
-- Endast skol-ID backfylls; inga klasskopplingar eller verksamhetsvärden flyttas.
alter table public.timplans add column unit_id uuid;
-- Backfill är schemaunderhåll, inte en verksamhetsändring. Bevara ändringstid.
alter table public.timplans disable trigger timplans_touch;
update public.timplans t set unit_id=o.unit_id from public.offerings o where o.id=t.offering_id;
alter table public.timplans enable trigger timplans_touch;
alter table public.timplans alter column unit_id set not null;
alter table public.timplans add constraint timplans_offering_unit_linkage_fkey
 foreign key(offering_id,unit_id,organizer_id) references public.offering_units(offering_id,unit_id,organizer_id) not valid;
alter table public.timplans validate constraint timplans_offering_unit_linkage_fkey;
alter table public.timplans add constraint timplans_offering_unit_version_unique unique(offering_id,unit_id,version);
alter table public.timplans drop constraint timplans_offering_id_version_key;
drop index public.timplans_one_open;
drop index public.timplans_one_decided;
create unique index timplans_one_open on public.timplans(offering_id,unit_id) where status in ('utkast','forslag','atersand');
create unique index timplans_one_decided on public.timplans(offering_id,unit_id) where status='faststalld';
create index timplans_unit_idx on public.timplans(unit_id,offering_id);

CREATE OR REPLACE FUNCTION public.validate_class_timplan()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
declare o public.offerings; p public.timplans;
begin
  select * into p from public.timplans where id = new.timplan_id;
  if not found or p.status <> 'faststalld' then raise exception 'Välj en fastställd timplan.'; end if;
  select * into o from public.offerings where id = p.offering_id;
  if not found or p.unit_id <> new.unit_id then raise exception 'Timplanen hör till en annan skolenhet.'; end if;
  if (o.kind = 'gymnasium' and new.column_id not in ('ar1','ar2','ar3'))
    or (o.kind = 'grundskola' and new.column_id not in (select 'ak' || g from unnest(coalesce(o.grades, array[1,2,3,4,5,6,7,8,9]::smallint[])) g))
    or (o.kind = 'introduktionsprogram' and new.column_id <> 'vecka') then
    raise exception 'Välj en årskurs som finns i timplanen.';
  end if;
  new.updated_at := now();
  return new;
end $function$
;

CREATE OR REPLACE FUNCTION public.phase5_timplan_scope(plan_id uuid, writing boolean DEFAULT false)
 RETURNS timplans
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; p public.timplans;
begin
 a:=public.phase3_actor();
 if a.function not in ('huvudman','rektor') or (writing and a.function<>'rektor') then
  raise exception 'Planning denied' using errcode='42501'; end if;
 select t.* into p from public.timplans t
 join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
 join public.school_units s on s.id=t.unit_id and s.organizer_id=o.organizer_id
 join public.organizers g on g.id=t.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units u on u.assignment_id=a.id and u.unit_id=s.id
 where t.id=plan_id and t.organizer_id=a.organizer_id;
 if not found then raise exception 'Planning denied' using errcode='42501'; end if;
 return p;
end $function$
;

CREATE OR REPLACE FUNCTION public.phase5_list_timplans(page_number integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; result jsonb;
begin
 a:=public.phase3_actor();
 if a.function not in ('huvudman','rektor') then raise exception 'Planning denied' using errcode='42501'; end if;
 if page_number is null or page_number not between 1 and 100000 then
  raise exception 'Invalid planning page' using errcode='22023'; end if;
 with scoped as materialized (
  select t.id,t.offering_id,t.version,t.revision,t.status,t.unit_id,o.name,o.cohort,o.kind,s.name as school_name
  from public.timplans t
  join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
  join public.school_units s on s.id=t.unit_id and s.organizer_id=o.organizer_id
  join public.organizers g on g.id=t.organizer_id and g.customer_id=a.customer_id
  where t.organizer_id=a.organizer_id and o.kind in ('grundskola','introduktionsprogram')
   and exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=s.id)
 ), page_rows as (
  select * from scoped order by school_name,name,version desc,id limit 50 offset ((page_number-1)*50)
 )
 select jsonb_build_object('plans',coalesce((select jsonb_agg(jsonb_build_object(
 'id',id,'offeringId',offering_id,'unitId',unit_id,'schoolName',school_name,
 'educationName',name,'cohort',cohort,'kind',kind,'version',version,'revision',revision,'status',status)
 order by school_name,name,version desc,id) from page_rows),'[]'::jsonb),
 'count',(select count(*) from scoped),'page',page_number,'pageSize',50) into result;
 perform public.phase5_timplan_audit(null,'timplan_list_read');
 return result;
end $function$
;

CREATE OR REPLACE FUNCTION public.phase5_read_timplan(plan_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare p public.timplans; o public.offerings; grades smallint[]; result jsonb; width integer;
begin
 p:=public.phase5_timplan_scope(plan_id);
 select * into o from public.offerings where id=p.offering_id;
 if o.kind='grundskola' then
  grades:=case when coalesce(cardinality(o.grades),0)=0 then array[1,2,3,4,5,6,7,8,9]::smallint[] else o.grades end;
  if array_ndims(grades)<>1 or array_lower(grades,1)<>1
   or exists(select 1 from unnest(grades) g where g is null or g not between 1 and 9)
   or cardinality(grades)<>(select count(distinct g) from unnest(grades) g) then
   raise exception 'Invalid planning basis' using errcode='22023'; end if;
  width:=cardinality(grades);
 elsif o.kind='introduktionsprogram' then
  grades:=array[]::smallint[]; width:=1;
 else
  grades:=array[]::smallint[]; width:=null;
 end if;
 -- Kanoniska GR/IM-rader krävs för att kolumnindex ska ha entydig betydelse.
 if width is not null and exists(select 1 from public.timplan_cells c where c.timplan_id=p.id
  and (array_ndims(c.hours) is distinct from 1 or array_lower(c.hours,1) is distinct from 1
   or cardinality(c.hours)<>width or exists(select 1 from unnest(c.hours) h where h is null or h not between 0 and 2000))) then
  raise exception 'Invalid planning matrix' using errcode='22023'; end if;
 select jsonb_build_object('id',t.id,'offeringId',t.offering_id,'unitId',t.unit_id,
 'schoolName',s.name,'education',jsonb_build_object('name',o.name,'cohort',o.cohort,'kind',o.kind,'grades',grades),
 'version',t.version,'revision',t.revision,'status',t.status,'basis',t.basis,
 'catalogFetched',t.catalog_fetched,'decidedOn',t.decided_on,
 'cells',coalesce((select jsonb_object_agg(c.row_id,to_jsonb(c.hours)) from public.timplan_cells c where c.timplan_id=t.id),'{}'))
 into result from public.timplans t join public.school_units s on s.id=t.unit_id where t.id=p.id;
 perform public.phase5_timplan_audit(p.id,'timplan_read');
 return result;
end $function$
;
