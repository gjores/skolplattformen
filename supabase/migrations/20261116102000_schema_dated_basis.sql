-- DATUM-01. Namnfri serverprojektion med inklusiva giltigheter och bevarad placeringsrelation.
-- Avsedd SS 12000-semantik: skolplacering + GroupMembership. Inget verifierat informationsutbyte.
-- Endast denna smala ingång kan köras av Worker. Ingen tabellrättighet tillförs.
create function public.schema_dated_basis(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;unit uuid;target_year integer;from_date date;to_date date;result jsonb;
begin
 if not coalesce(public.phase5_programplan_shape(input,array['unitId','schoolYear']),false)
  or not coalesce(public.phase5_programplan_integer(input->'schoolYear',1900,2200),false) then raise exception 'Invalid dated schema scope' using errcode='22023';end if;
 unit:=public.tjanst_uuid(input->'unitId');target_year:=(input->>'schoolYear')::integer;
 a:=public.tjanst_actor('plan');
 if a.function not in ('rektor','administrator') then raise exception 'Dated schema denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);s:=public.phase5_programplan_session_check();
 from_date:=make_date(target_year,7,1);to_date:=make_date(target_year+1,6,30);
 with placed as (
  select pp.* from public.pupil_placements pp where pp.unit_id=unit and pp.customer_id=a.customer_id and pp.organizer_id=a.organizer_id
   and pp.starts_on<=to_date and coalesce(pp.ends_on,'infinity'::date)>=from_date
 ), visible as (
  select p.id from public.pupils p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id and exists(select 1 from placed pp where pp.pupil_id=p.id)
   and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))
 ), allowed as (select pp.* from placed pp join visible p on p.id=pp.pupil_id),
 all_groups as (
  select g.id,g.starts_on,g.ends_on,g.active from public.study_groups g where g.unit_id=unit and g.school_year=target_year
  union all
  select g.id,g.starts_on,g.ends_on,g.active from public.teaching_groups g join public.elective_blocks b on b.id=g.block_id
   where b.unit_id=unit and b.school_year=target_year
 ), all_members as (
  select m.group_id,m.pupil_id,m.starts_on,m.ends_on from public.study_group_memberships m join all_groups g on g.id=m.group_id join visible p on p.id=m.pupil_id where m.unit_id=unit and m.cancelled_at is null
  union all
  select m.group_id,m.pupil_id,m.starts_on,m.ends_on from public.elective_placements m join all_groups g on g.id=m.group_id join visible p on p.id=m.pupil_id where m.unit_id=unit and m.cancelled_at is null
 )
 select jsonb_build_object('unitId',unit,'schoolYear',target_year,
  'complete',not exists(select 1 from placed pp where not exists(select 1 from visible p where p.id=pp.pupil_id)),
  'placements',(select coalesce(jsonb_agg(jsonb_build_object('id',pp.id,'pupilId',pp.pupil_id,'startsOn',pp.starts_on,'endsOn',pp.ends_on) order by pp.pupil_id,pp.starts_on,pp.id),'[]') from allowed pp),
  'classMemberships',(select coalesce(jsonb_agg(jsonb_build_object('placementId',m.placement_id,'pupilId',m.pupil_id,'classId',m.class_id,'startsOn',m.starts_on,'endsOn',m.ends_on) order by m.pupil_id,m.starts_on,m.id),'[]')
   from public.pupil_class_memberships m join allowed pp on pp.id=m.placement_id and pp.pupil_id=m.pupil_id where m.unit_id=unit and m.starts_on<=to_date and coalesce(m.ends_on,'infinity'::date)>=from_date),
  'groups',(select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'startsOn',g.starts_on,'endsOn',g.ends_on,'active',g.active) order by g.id),'[]') from all_groups g),
  'memberships',(select coalesce(jsonb_agg(jsonb_build_object('groupId',m.group_id,'pupilId',m.pupil_id,'startsOn',m.starts_on,'endsOn',m.ends_on) order by m.group_id,m.pupil_id,m.starts_on,m.ends_on),'[]') from all_members m)) into result;
 -- Samma transaktion som läsningen; auditfel rullar tillbaka och inget kuvert lämnas.
 select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
   'schema_dated_basis_read','school',unit,'ok',jsonb_build_object('unitId',unit,'schoolYear',target_year));
 exception when others then raise exception 'Dated schema audit unavailable' using errcode='55000';end;
 return jsonb_build_object('contractVersion','schema_dated_basis_sql_v1','actor',jsonb_build_object('identityId',i.id,'assignmentId',a.id),'result',result);
end $$;
revoke all on function public.schema_dated_basis(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.schema_dated_basis(jsonb) to skolplattform_worker;
