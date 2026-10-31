-- A school-attested pupil/guardian association may create passive customer affiliation.
-- It never creates an identity, staff assignment, role or invitation, and never reactivates a block.
begin;
alter function public.elective_binding_command(jsonb) rename to elective_binding_command_existing_member;
revoke all on function public.elective_binding_command_existing_member(jsonb) from public,anon,authenticated,skolplattform_worker;
create function public.elective_binding_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;target public.identities;m public.memberships;
 q jsonb;unit uuid;pupil uuid;target_identity uuid;created_id uuid;from_date date;to_date date;
begin
 perform public.phase4_keys(input,array['unitId','pupilId','commandId','expectedRevision','action','payload']);
 unit:=(input->>'unitId')::uuid;pupil:=(input->>'pupilId')::uuid;
 a:=public.elective_binding_scope(unit,pupil);s:=public.phase5_programplan_session_check();
 if input->>'action'<>'save_binding' then return public.elective_binding_command_existing_member(input);end if;
 q:=input->'payload';perform public.phase4_keys(q,array['id','identityId','participant','confirmationRequired','startsOn','endsOn','sourceReference']);
 target_identity:=(q->>'identityId')::uuid;from_date:=(q->>'startsOn')::date;to_date:=(q->>'endsOn')::date;
 if q->>'participant' not in ('pupil','guardian') or jsonb_typeof(q->'confirmationRequired') is distinct from 'boolean'
 or jsonb_typeof(q->'startsOn') is distinct from 'string' or (jsonb_typeof(q->'endsOn') is distinct from 'null' and jsonb_typeof(q->'endsOn') is distinct from 'string')
 or not isfinite(from_date) or to_date is not null and (not isfinite(to_date) or to_date<from_date)
 or jsonb_typeof(q->'sourceReference') is distinct from 'string' or length(q->>'sourceReference') not between 1 and 120 or q->>'sourceReference'<>btrim(q->>'sourceReference')
 or q->>'participant'='pupil' and (q->>'confirmationRequired')::boolean then raise exception 'Invalid attestation' using errcode='22023';end if;
 if not exists(select 1 from public.pupil_placements pp where pp.pupil_id=pupil and pp.unit_id=unit and pp.customer_id=a.customer_id
 and (to_date is null or pp.starts_on<=to_date) and (pp.ends_on is null or pp.ends_on>=from_date)) then raise exception 'No matching school placement' using errcode='42501';end if;
 -- The identity reference comes from an existing OIDC login; no email/name lookup or account creation.
 select * into target from public.identities x where x.id=target_identity for share;
 if not found then raise exception 'Unknown account reference' using errcode='42501';end if;
 select * into m from public.memberships x where x.identity_id=target.id and x.customer_id=a.customer_id for update;
 if found and m.status<>'active' then raise exception 'Account affiliation blocked' using errcode='42501';end if;
 if m.id is null then
  if target.last_login_at is null then raise exception 'Account has not completed login' using errcode='42501';end if;
  perform 1 from public.customers where id=a.customer_id and closed_at is null for share;
  if not found then raise exception 'Customer unavailable' using errcode='42501';end if;
  insert into public.memberships(identity_id,customer_id) values(target.id,a.customer_id)
  on conflict(identity_id,customer_id) do nothing returning id into created_id;
  select * into m from public.memberships x where x.identity_id=target.id and x.customer_id=a.customer_id for update;
  if m.id is null or m.status<>'active' then raise exception 'Account affiliation blocked' using errcode='42501';end if;
  if created_id is not null then
   select * into i from public.identities where id=s.identity_id;
   begin
    insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
    values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,
    'elective_participant_account_attested','identity',target.id,'ok',jsonb_build_object('unitId',unit,'bindingId',(q->>'id')::uuid,'participant',q->>'participant','createdMembershipId',created_id));
   exception when others then raise exception 'Participant affiliation audit unavailable' using errcode='55000';end;
  end if;
 end if;
 -- Existing native binding CAS, attestation, constraints, command journal and audit stay authoritative.
 return public.elective_binding_command_existing_member(input);
end $$;
revoke all on function public.elective_binding_command(jsonb) from public,anon,authenticated,skolplattform_worker;
grant execute on function public.elective_binding_command(jsonb) to skolplattform_worker;
commit;
