-- Kontrollerade mutationer förbereds stängda. Audit/CSRF/MFA sker i samma
-- servertransaktion; senare cutover återkallar äldre generella skrivprivilegier.
create function public.phase3_insert_mandate(actor_id uuid,payload jsonb) returns uuid
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare parent public.access_assignments; recipient public.memberships; new_id uuid:=gen_random_uuid();
  fn public.access_function; unit_ids uuid[]; staff_id uuid; group_item jsonb; item uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k not in ('membershipId','function','unitIds','scopeKind','groups','pupilIds','caseIds',
      'validFrom','validTo','startsAt','endsAt','profession','purposeCode','staffAssignmentId')) then
    raise exception 'Invalid mandate payload' using errcode='22023'; end if;
  select * into parent from public.access_assignments where id=actor_id;
  if not found or not public.phase3_mandate_is_valid(parent.id) then raise exception 'Mandate denied' using errcode='42501'; end if;
  select * into recipient from public.memberships where id=(payload->>'membershipId')::uuid and customer_id=parent.customer_id and status='active';
  if not found then raise exception 'Recipient denied' using errcode='42501'; end if;
  fn:=(payload->>'function')::public.access_function;
  unit_ids:=array(select jsonb_array_elements_text(coalesce(payload->'unitIds','[]'))::uuid);
  staff_id:=nullif(payload->>'staffAssignmentId','')::uuid;
  if fn in ('rektor','larare') then
    if staff_id is null then
      insert into public.assignments(organizer_id,name,role)
      select parent.organizer_id,coalesce(nullif(i.display_name,''),'Personal'),fn::text::public.staff_role
        from public.identities i where i.id=recipient.identity_id returning id into staff_id;
    else
      if not exists(select 1 from public.assignments s where s.id=staff_id and s.organizer_id=parent.organizer_id and s.role::text=fn::text)
        or exists(select 1 from public.staff_assignment_bindings b where b.staff_assignment_id=staff_id and b.membership_id<>recipient.id)
      then raise exception 'Staff binding denied' using errcode='42501'; end if;
    end if;
    insert into public.staff_assignment_bindings values(staff_id,recipient.id,parent.customer_id,parent.organizer_id) on conflict do nothing;
    insert into public.assignment_units(assignment_id,unit_id) select staff_id,unnest(unit_ids) on conflict do nothing;
  elsif staff_id is not null then raise exception 'Unexpected staff binding' using errcode='22023'; end if;
  insert into public.access_assignments(id,membership_id,customer_id,organizer_id,unit_id,function,
    valid_from,valid_to,staff_assignment_id,created_by,parent_assignment_id,issued_by_assignment_id,
    profile_id,scope_kind,profession,starts_at,ends_at,approved_by_assignment_id,purpose_code)
  values(new_id,recipient.id,parent.customer_id,parent.organizer_id,unit_ids[1],fn,
    coalesce((payload->>'validFrom')::date,public.app_today()),(payload->>'validTo')::date,staff_id,parent.membership_id,
    parent.id,parent.id,'synthetic-v1',payload->>'scopeKind',payload->>'profession',
    (payload->>'startsAt')::timestamptz,(payload->>'endsAt')::timestamptz,
    case when fn='support' then parent.id end,payload->>'purposeCode');
  insert into public.mandate_units select new_id,parent.customer_id,parent.organizer_id,unnest(unit_ids);
  for group_item in select value from jsonb_array_elements(coalesce(payload->'groups','[]')) loop
    if jsonb_typeof(group_item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(group_item) k where k not in ('id','kind'))
      or group_item->>'kind' not in ('teaching','mentor') or group_item->>'kind' is null then
      raise exception 'Invalid group' using errcode='22023'; end if;
    insert into public.mandate_groups
      select new_id,g.id,parent.customer_id,g.unit_id,case group_item->>'kind' when 'teaching' then 'undervisning' else 'mentor' end
      from public.phase3_probe_groups g where g.id=(group_item->>'id')::uuid and g.customer_id=parent.customer_id;
    if not found then raise exception 'Group denied' using errcode='42501'; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(payload->'pupilIds','[]'))::uuid loop
    insert into public.mandate_pupils select new_id,p.id,parent.customer_id,p.unit_id from public.phase3_probe_pupils p where p.id=item and p.customer_id=parent.customer_id;
    if not found then raise exception 'Pupil denied' using errcode='42501'; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(payload->'caseIds','[]'))::uuid loop
    insert into public.mandate_cases select new_id,c.id,parent.customer_id,c.unit_id from public.phase3_probe_cases c where c.id=item and c.customer_id=parent.customer_id;
    if not found then raise exception 'Case denied' using errcode='42501'; end if;
  end loop;
  if not public.phase3_mandate_is_valid(new_id,false) then raise exception 'Delegation denied' using errcode='42501'; end if;
  return new_id;
end $$;

create function public.phase3_grant_mandate(payload jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
  a:=public.phase3_actor();
  return public.phase3_insert_mandate(a.id,payload);
end $$;

create function public.phase3_revoke_mandate(target_id uuid) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; target public.access_assignments;
begin
  a:=public.phase3_actor();
  select * into target from public.access_assignments where id=target_id;
  if not found or target.parent_assignment_id is distinct from a.id or not public.phase3_mandate_is_valid(target.id,false) then
    raise exception 'Revocation denied' using errcode='42501'; end if;
  update public.access_assignments set ended_at=clock_timestamp(),ended_by=a.membership_id where id=target.id;
  return target.id;
end $$;

create function public.phase3_assignment_document(assignment_id uuid) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
select jsonb_build_object('id',a.id,'identityId',m.identity_id,'customerId',a.customer_id,'organizerId',a.organizer_id,
  'function',a.function,'profileId',coalesce(a.profile_id,'synthetic-v1'),'membershipActive',m.status='active' and c.closed_at is null,
  'unitIds',coalesce((select jsonb_agg(u.unit_id order by u.unit_id) from public.mandate_units u where u.assignment_id=a.id),'[]'::jsonb),
  'scopeKind',coalesce(a.scope_kind,'school'),
  'groups',coalesce((select jsonb_agg(jsonb_build_object('id',g.group_id,'unitId',g.unit_id,'kind',case g.kind when 'undervisning' then 'teaching' else 'mentor' end) order by g.group_id) from public.mandate_groups g where g.assignment_id=a.id),'[]'::jsonb),
  'pupils',coalesce((select jsonb_agg(jsonb_build_object('id',p.pupil_id,'unitId',p.unit_id) order by p.pupil_id) from public.mandate_pupils p where p.assignment_id=a.id),'[]'::jsonb),
  'cases',coalesce((select jsonb_agg(jsonb_build_object('id',mc.case_id,'unitId',mc.unit_id,'pupilId',c.pupil_id) order by mc.case_id) from public.mandate_cases mc join public.phase3_probe_cases c on c.id=mc.case_id where mc.assignment_id=a.id),'[]'::jsonb),
  'validFrom',a.valid_from,'validTo',a.valid_to,'startsAt',a.starts_at,'endsAt',a.ends_at,'endedAt',a.ended_at,
  'parentAssignmentId',a.parent_assignment_id,'approvedByAssignmentId',a.approved_by_assignment_id,'purposeCode',a.purpose_code)
from public.access_assignments a join public.memberships m on m.id=a.membership_id join public.customers c on c.id=a.customer_id where a.id=assignment_id
$$;

create function public.phase3_mandate_context() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; node uuid; ancestors jsonb:='[]';
begin
  a:=public.phase3_actor(); node:=a.parent_assignment_id;
  while node is not null loop
    ancestors:=ancestors||jsonb_build_array(public.phase3_assignment_document(node));
    select parent_assignment_id into node from public.access_assignments where id=node;
  end loop;
  return jsonb_build_object('assignment',public.phase3_assignment_document(a.id),'ancestors',ancestors,'serverNow',clock_timestamp());
end $$;

create function public.phase3_list_mandates() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
  a:=public.phase3_actor();
  select coalesce(jsonb_agg(public.phase3_assignment_document(t.id) order by t.id),'[]') into result
    from public.access_assignments t where t.parent_assignment_id=a.id and public.phase3_mandate_is_valid(t.id,false);
  return result;
end $$;

revoke all on function public.phase3_insert_mandate(uuid,jsonb),public.phase3_grant_mandate(jsonb),
  public.phase3_revoke_mandate(uuid),public.phase3_assignment_document(uuid),
  public.phase3_mandate_context(),public.phase3_list_mandates()
from public,anon,authenticated,skolplattform_worker;
