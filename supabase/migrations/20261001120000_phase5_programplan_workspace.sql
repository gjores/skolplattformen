-- 05-10 closed read foundation. The two Worker grants require separate API preflight.
create function public.phase5_programplan_education(offering public.offerings) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',offering.id,'unitId',offering.unit_id,'schoolName',u.name,'kind',offering.kind,
  'name',offering.name,'localCode',offering.local_code,'cohort',offering.cohort,'startYear',offering.start_year,
  'status',offering.status,'programCode',offering.program_code,'orientationCode',offering.orientation_code,
  'latestVersion',coalesce((select max(p.version) from public.point_plans p where p.offering_id=offering.id and p.organizer_id=offering.organizer_id),0),
  'draftId',(select p.id from public.point_plans p where p.offering_id=offering.id and p.organizer_id=offering.organizer_id and p.status='utkast'))
 from public.school_units u where u.id=offering.unit_id and u.organizer_id=offering.organizer_id
$$;

create function public.phase5_programplan_workspace_audit(offering_id uuid, operation text) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s public.app_sessions; i public.identities;
begin
 if operation is null or operation not in ('programplan_offerings_listed','programplan_workspace_read')
  or (operation='programplan_offerings_listed') is distinct from (offering_id is null) then
  raise exception 'Invalid programplan workspace operation' using errcode='22023'; end if;
 a:=public.phase5_programplan_actor();
 if offering_id is not null then perform public.phase5_programplan_scope(null,offering_id); end if;
 s:=public.phase5_programplan_session_check();
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,
   action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   operation,case when offering_id is null then 'education_collection' else 'education' end,offering_id,'ok','{}');
 exception when others then raise exception 'Programplan workspace audit unavailable' using errcode='55000'; end;
end $$;

create function public.phase5_list_programplan_offerings(page_number integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
 a:=public.phase5_programplan_actor();
 if page_number is null or page_number not between 1 and 100000 then
  raise exception 'Invalid programplan workspace page' using errcode='22023'; end if;
 with scoped as materialized (
  select o.*,u.name as school_name from public.offerings o
  join public.school_units u on u.id=o.unit_id and u.organizer_id=o.organizer_id
  join public.organizers g on g.id=o.organizer_id and g.customer_id=a.customer_id
  where o.kind='gymnasium' and o.organizer_id=a.organizer_id
   and exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=u.id)
 ), page_rows as (
  select * from scoped order by school_name,name,cohort,id limit 50 offset (page_number-1)*50
 )
 select jsonb_build_object('offerings',coalesce((select jsonb_agg(public.phase5_programplan_education(o)
   order by r.school_name,r.name,r.cohort,r.id) from page_rows r join public.offerings o on o.id=r.id),'[]'::jsonb),
  'count',(select count(*) from scoped),'page',page_number,'pageSize',50) into result;
 -- The actor helper refreshes actual session/issuing chain after the customer lock.
 perform public.phase5_programplan_workspace_audit(null,'programplan_offerings_listed');
 return result;
end $$;

create function public.phase5_programplan_workspace(offering_id uuid, version_page integer, catalog_id text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare o public.offerings; result jsonb; catalog_payload jsonb; catalog_status text; catalog_diagnostic text;
begin
 o:=public.phase5_programplan_scope(null,offering_id);
 if version_page is null or version_page not between 1 and 100000
  or (catalog_id is not null and catalog_id !~ '^sha256:[0-9a-f]{64}$') then
  raise exception 'Invalid programplan workspace request' using errcode='22023'; end if;
 -- NULL is a deliberate absence of selection, never an alias for a latest catalog.
 catalog_status:='unselected';
 if catalog_id is not null then
  select c.payload into catalog_payload from public.programplan_catalogs c where c.catalog_id=phase5_programplan_workspace.catalog_id;
  if found then catalog_status:='selected';
  else catalog_status:='blocked'; catalog_diagnostic:='catalog_unavailable'; end if;
 end if;
 with scoped_versions as materialized (
  select p.* from public.point_plans p where p.offering_id=o.id and p.organizer_id=o.organizer_id
 ), page_rows as (
  select * from scoped_versions order by version desc,id limit 50 offset (version_page-1)*50
 )
 select jsonb_build_object('education',public.phase5_programplan_education(o),
  'versions',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'revision',p.revision,'status',p.status,
   'decidedOn',p.decided_on,'catalogId',p.catalog_id,'basisReference',p.basis_reference,
   'legacySpecialization',case when p.catalog_id is null then to_jsonb(p.specialization) else null end) order by p.version desc,p.id)
   from page_rows p),'[]'::jsonb),
  'versionCount',(select count(*) from scoped_versions),'versionPage',version_page,'pageSize',50,
  'catalogs',coalesce((select jsonb_agg(jsonb_build_object('catalogId',c.catalog_id,'source',c.payload->'source') order by c.catalog_id)
   from public.programplan_catalogs c),'[]'::jsonb),
  'catalog',jsonb_build_object('status',catalog_status,'catalogId',catalog_id,'diagnostic',catalog_diagnostic,'payload',catalog_payload),
  'decisionReady',false) into result;
 perform public.phase5_programplan_scope(null,o.id);
 perform public.phase5_programplan_workspace_audit(o.id,'programplan_workspace_read');
 return result;
end $$;

revoke all on function public.phase5_programplan_education(public.offerings),public.phase5_programplan_workspace_audit(uuid,text),
 public.phase5_list_programplan_offerings(integer),public.phase5_programplan_workspace(uuid,integer,text)
 from public,anon,authenticated,skolplattform_worker;
