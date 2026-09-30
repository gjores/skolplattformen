-- 05-05: stängd lista och verifierat kolumnunderlag. Worker-listgranten följer efter API-preflight.
create or replace function public.phase5_timplan_audit(plan_id uuid, operation text)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare a public.access_assignments; i public.identities; corr uuid; session_id uuid;
begin
 if operation not in ('timplan_read','timplan_cell_changed','timplan_list_read') or operation is null then
  raise exception 'Invalid planning operation' using errcode='22023'; end if;
 if (operation='timplan_list_read' and plan_id is not null) or (operation<>'timplan_list_read' and plan_id is null) then
  raise exception 'Invalid planning object' using errcode='22023'; end if;
 a:=public.phase3_actor();
 select * into i from public.identities where id=public.current_identity_id();
 corr:=nullif(current_setting('app.correlation_id',true),'')::uuid;
 session_id:=nullif(current_setting('app.session_id',true),'')::uuid;
 if corr is null or (session_id is null and
   (session_user='skolplattform_worker' or current_setting('role',true)='skolplattform_worker')) then
  raise exception 'Planning audit unavailable' using errcode='55000'; end if;
 -- Privilegierade syntetiska SQL-fixturer får vara utan session. Varje Worker-
 -- anrop måste ha faktisk, aktiv session som matchar identitet och mandat.
 if session_id is not null and not exists(select 1 from public.app_sessions s
  where s.id=session_id and s.identity_id=i.id and s.membership_id=a.membership_id
   and s.assignment_id=a.id and s.revoked_at is null
   and s.expires_at>clock_timestamp() and s.absolute_expires_at>clock_timestamp()) then
  raise exception 'Planning audit unavailable' using errcode='55000'; end if;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,
 session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(corr,'db',i.id,i.issuer,i.subject,session_id,a.membership_id,a.id,a.customer_id,
 operation,case when operation='timplan_list_read' then 'timplan_collection' else 'timplan' end,plan_id,'ok','{}');
 exception when others then
  raise exception 'Planning audit unavailable' using errcode='55000';
 end;
end $$;
revoke all on function public.phase5_timplan_audit(uuid,text) from public,anon,authenticated,skolplattform_worker;

-- En snapshot ger kolumnunderlag i lagrad ordning. Ingen gymnasieskrivning öppnas.
create or replace function public.phase5_read_timplan(plan_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
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
 select jsonb_build_object('id',t.id,'offeringId',t.offering_id,'unitId',o.unit_id,
 'schoolName',s.name,'education',jsonb_build_object('name',o.name,'cohort',o.cohort,'kind',o.kind,'grades',grades),
 'version',t.version,'revision',t.revision,'status',t.status,'basis',t.basis,
 'catalogFetched',t.catalog_fetched,'decidedOn',t.decided_on,
 'cells',coalesce((select jsonb_object_agg(c.row_id,to_jsonb(c.hours)) from public.timplan_cells c where c.timplan_id=t.id),'{}'))
 into result from public.timplans t join public.school_units s on s.id=o.unit_id where t.id=p.id;
 perform public.phase5_timplan_audit(p.id,'timplan_read');
 return result;
end $$;

-- Kund, huvudman och varje skolenhet följer det levande mandatet. Inga klientfilter.
create function public.phase5_list_timplans(page_number integer)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
 a:=public.phase3_actor();
 if a.function not in ('huvudman','rektor') then raise exception 'Planning denied' using errcode='42501'; end if;
 if page_number is null or page_number not between 1 and 100000 then
  raise exception 'Invalid planning page' using errcode='22023'; end if;
 with scoped as materialized (
  select t.id,t.offering_id,t.version,t.revision,t.status,o.unit_id,o.name,o.cohort,o.kind,s.name as school_name
  from public.timplans t
  join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
  join public.school_units s on s.id=o.unit_id and s.organizer_id=o.organizer_id
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
end $$;
revoke all on function public.phase5_list_timplans(integer) from public,anon,authenticated,skolplattform_worker;
