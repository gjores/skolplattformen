-- D-17: separat skolbunden rätt från huvudman till ett bestämt adminuppdrag.
-- STÄNGDA entrypoints: Worker-GRANT införs först med plan 04-11:s auditerade
-- MFA-/same-origin-route. Rättighetsändring och logg ska committas i samma tx.
create table public.protected_identity_permissions (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null, organizer_id uuid not null, unit_id uuid not null,
 assignment_id uuid not null, granted_by_assignment_id uuid not null,
 granted_at timestamptz not null default clock_timestamp(),
 revoked_at timestamptz, revoked_by_assignment_id uuid,
 foreign key(assignment_id,customer_id,organizer_id) references public.access_assignments(id,customer_id,organizer_id),
 foreign key(granted_by_assignment_id,customer_id,organizer_id) references public.access_assignments(id,customer_id,organizer_id),
 foreign key(revoked_by_assignment_id,customer_id,organizer_id) references public.access_assignments(id,customer_id,organizer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id),
 check((revoked_at is null)=(revoked_by_assignment_id is null))
);
create unique index protected_identity_permission_current on public.protected_identity_permissions(assignment_id,unit_id) where revoked_at is null;
alter table public.protected_identity_permissions enable row level security;
alter table public.protected_identity_permissions force row level security;
revoke all on public.protected_identity_permissions from public,anon,authenticated,skolplattform_worker;

create function public.phase4_protected_permission_is_valid(permission_id uuid) returns boolean
language sql volatile security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.protected_identity_permissions p
 join public.access_assignments a on a.id=p.assignment_id
 join public.access_assignments g on g.id=p.granted_by_assignment_id
 where p.id=permission_id and p.revoked_at is null
 and a.function='administrator' and g.function='huvudman'
 and a.customer_id=p.customer_id and g.customer_id=p.customer_id
 and a.organizer_id=p.organizer_id and g.organizer_id=p.organizer_id
 and public.phase3_mandate_is_valid(a.id) and public.phase3_mandate_is_valid(g.id)
 and exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=p.unit_id)
 and exists(select 1 from public.mandate_units u where u.assignment_id=g.id and u.unit_id=p.unit_id))
$$;
create function public.phase4_has_protected_permission(target_assignment_id uuid,target_unit_id uuid) returns boolean
language sql volatile security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.protected_identity_permissions p
 where p.assignment_id=target_assignment_id and p.unit_id=target_unit_id and public.phase4_protected_permission_is_valid(p.id))
$$;
-- Denna interna kontroll kopplar rättigheten till elevens FAKTISKA placering.
create function public.phase4_can_read_protected(target_pupil_id uuid,target_unit_id uuid,at_date date default public.app_today()) returns boolean
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
 a:=public.phase3_actor();
 return a.function='administrator' and public.phase4_has_protected_permission(a.id,target_unit_id)
 and exists(select 1 from public.pupil_placements p where p.pupil_id=target_pupil_id and p.unit_id=target_unit_id
   and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
   and p.starts_on<=at_date and (p.ends_on is null or p.ends_on>=at_date));
end $$;
create function public.phase4_grant_protected_permission(target_assignment_id uuid,target_unit_id uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; recipient public.access_assignments; existing_id uuid; new_id uuid;
begin
 a:=public.phase3_actor();
 select * into recipient from public.access_assignments where id=target_assignment_id;
 if a.function<>'huvudman' or recipient.id is null or recipient.function<>'administrator'
  or recipient.customer_id is distinct from a.customer_id or recipient.organizer_id is distinct from a.organizer_id
  or not public.phase3_mandate_is_valid(recipient.id)
  or not exists(select 1 from public.mandate_units where assignment_id=a.id and unit_id=target_unit_id)
  or not exists(select 1 from public.mandate_units where assignment_id=recipient.id and unit_id=target_unit_id) then
  raise exception 'Protected permission denied' using errcode='42501'; end if;
 select id into existing_id from public.protected_identity_permissions where assignment_id=recipient.id and unit_id=target_unit_id and revoked_at is null;
 if existing_id is not null then
   if public.phase4_protected_permission_is_valid(existing_id) then return existing_id; end if;
   -- Ett nytt beslut får aldrig återuppliva den gamla givarkedjan.
   update public.protected_identity_permissions set revoked_at=clock_timestamp(),revoked_by_assignment_id=a.id where id=existing_id;
 end if;
 insert into public.protected_identity_permissions(customer_id,organizer_id,unit_id,assignment_id,granted_by_assignment_id)
 values(a.customer_id,a.organizer_id,target_unit_id,recipient.id,a.id) returning id into new_id;
 return new_id;
end $$;
create function public.phase4_revoke_protected_permission(permission_id uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; target public.protected_identity_permissions;
begin
 a:=public.phase3_actor();
 select * into target from public.protected_identity_permissions where id=permission_id;
 if a.function<>'huvudman' or target.id is null or target.customer_id is distinct from a.customer_id
  or target.organizer_id is distinct from a.organizer_id
  or not exists(select 1 from public.mandate_units where assignment_id=a.id and unit_id=target.unit_id) then
  raise exception 'Protected permission denied' using errcode='42501'; end if;
 update public.protected_identity_permissions set revoked_at=clock_timestamp(),revoked_by_assignment_id=a.id
 where id=target.id and revoked_at is null;
 return target.id;
end $$;
create function public.phase4_list_protected_permissions() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
 a:=public.phase3_actor();
 if a.function<>'huvudman' then raise exception 'Protected permission denied' using errcode='42501'; end if;
 select coalesce(jsonb_agg(jsonb_build_object('assignmentId',r.id,'membershipId',r.membership_id,
   'displayName',coalesce(nullif(i.display_name,''),'Namngiven personal'),'unitId',u.unit_id,'schoolName',s.name,
   'permissionId',(select p.id from public.protected_identity_permissions p where p.assignment_id=r.id and p.unit_id=u.unit_id and public.phase4_protected_permission_is_valid(p.id))) order by r.id,u.unit_id),'[]'::jsonb)
 into result from public.access_assignments r join public.memberships m on m.id=r.membership_id
 join public.identities i on i.id=m.identity_id join public.mandate_units u on u.assignment_id=r.id
 join public.school_units s on s.id=u.unit_id
 where r.function='administrator' and r.customer_id=a.customer_id and r.organizer_id=a.organizer_id
 and public.phase3_mandate_is_valid(r.id)
 and exists(select 1 from public.mandate_units g where g.assignment_id=a.id and g.unit_id=u.unit_id);
 return result;
end $$;
revoke all on function public.phase4_protected_permission_is_valid(uuid),public.phase4_has_protected_permission(uuid,uuid),
 public.phase4_can_read_protected(uuid,uuid,date),public.phase4_grant_protected_permission(uuid,uuid),
 public.phase4_revoke_protected_permission(uuid),public.phase4_list_protected_permissions()
 from public,anon,authenticated,skolplattform_worker;
-- phase3_mandate_shape ändras inte: ett adminuppdrag förblir ett vanligt
-- skolmandat. Skydd är aldrig en rektorsvalbar roll eller flagga.
