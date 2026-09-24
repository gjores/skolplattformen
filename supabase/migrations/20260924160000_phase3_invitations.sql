alter table public.invitations
  add column issued_by_assignment_id uuid,
  add column mandate_payload jsonb,
  add constraint invitation_issuer_customer_fk foreign key(issued_by_assignment_id,customer_id)
    references public.access_assignments(id,customer_id),
  add constraint invitation_payload_version check(mandate_payload is null or
    (mandate_payload->>'version'='1' and jsonb_typeof(mandate_payload->'mandates')='array'
      and issued_by_assignment_id is not null));

-- Prövar verkliga integritets-/delegationsregler, men lämnar inga identiteter,
-- medlemskap, personalrader eller mandat från förhandsprövningen efter sig.
create function public.phase3_validate_invitation(actor_id uuid,issuer text,subject text,mandates jsonb)
returns jsonb language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare chosen_identity uuid; member_id uuid; customer uuid; p jsonb; normalized jsonb:='[]';
begin
  if jsonb_typeof(mandates) is distinct from 'array' or jsonb_array_length(mandates) not between 1 and 10 then
    raise exception 'Invalid invitation mandates' using errcode='22023'; end if;
  select customer_id into customer from public.access_assignments where id=actor_id;
  begin
    select id into chosen_identity from public.identities i where i.issuer=$2 and i.subject=$3;
    if chosen_identity is null then insert into public.identities(issuer,subject) values($2,$3) returning id into chosen_identity; end if;
    insert into public.memberships(identity_id,customer_id) values(chosen_identity,customer)
      on conflict(identity_id,customer_id) do update set status=public.memberships.status returning id into member_id;
    for p in select value from jsonb_array_elements(mandates) loop
      if p ? 'membershipId' then raise exception 'Recipient must be identity-bound' using errcode='22023'; end if;
      p:=p||jsonb_build_object('validFrom',coalesce(p->>'validFrom',public.app_today()::text));
      perform public.phase3_insert_mandate(actor_id,p||jsonb_build_object('membershipId',member_id));
      normalized:=normalized||jsonb_build_array(p);
    end loop;
    raise exception 'Preview complete' using errcode='PT001';
  exception when sqlstate 'PT001' then return normalized;
  end;
end $$;

create function public.phase3_issue_invitation(payload jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; normalized jsonb; result uuid; expiry timestamptz;
begin
  a:=public.phase3_actor();
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k not in ('personName','expectedIssuer','expectedSubject','expectedEmail','tokenHashHex','expiresAt','mandates')) then
    raise exception 'Invalid invitation payload' using errcode='22023'; end if;
  expiry:=(payload->>'expiresAt')::timestamptz;
  if expiry is null or not isfinite(expiry) or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '7 days' then
    raise exception 'Invalid invitation expiry' using errcode='22023'; end if;
  normalized:=public.phase3_validate_invitation(a.id,payload->>'expectedIssuer',payload->>'expectedSubject',payload->'mandates');
  insert into public.invitations(customer_id,token_hash,invited_person_name,expected_issuer,expected_subject,
    expected_email,grants,issued_by,expires_at,issued_by_assignment_id,mandate_payload)
  values(a.customer_id,decode(payload->>'tokenHashHex','hex'),payload->>'personName',payload->>'expectedIssuer',payload->>'expectedSubject',
    payload->>'expectedEmail',(select jsonb_agg(jsonb_build_object('function',p->>'function')) from jsonb_array_elements(normalized) p),
    a.membership_id::text,expiry,a.id,jsonb_build_object('version',1,'mandates',normalized)) returning id into result;
  return result;
end $$;

create function public.phase3_redeem_invitation(token_hash bytea,session_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions; ident public.identities; invite public.invitations;
  member public.memberships; c public.customers; p jsonb; new_id uuid; assignments jsonb:='[]';
begin
  select * into s from public.app_sessions where id=$2 for update;
  if not found or s.identity_id is distinct from public.current_identity_id() or s.revoked_at is not null
    or s.expires_at<=clock_timestamp() or s.absolute_expires_at<=clock_timestamp() then
    raise exception 'Invitation denied' using errcode='42501'; end if;
  select * into ident from public.identities where id=s.identity_id;
  select * into invite from public.invitations i where i.token_hash=$1;
  if not found then raise exception 'Invitation denied' using errcode='42501'; end if;
  perform public.phase3_lock_customer(invite.customer_id);
  select * into invite from public.invitations where id=invite.id for update;
  if invite.used_at is not null or invite.expires_at<=clock_timestamp()
    or invite.expected_issuer is distinct from ident.issuer or invite.expected_subject is distinct from ident.subject then
    raise exception 'Invitation denied' using errcode='42501'; end if;
  select * into c from public.customers where id=invite.customer_id and closed_at is null;
  if not found then raise exception 'Invitation denied' using errcode='42501'; end if;
  insert into public.memberships(identity_id,customer_id) values(ident.id,c.id)
    on conflict(identity_id,customer_id) do update set status=public.memberships.status returning * into member;
  if member.status<>'active' then raise exception 'Invitation denied' using errcode='42501'; end if;
  if invite.issued_by_assignment_id is not null then
    if invite.mandate_payload->>'version' is distinct from '1' or not public.phase3_mandate_is_valid(invite.issued_by_assignment_id) then
      raise exception 'Invitation issuer denied' using errcode='42501'; end if;
    for p in select value from jsonb_array_elements(invite.mandate_payload->'mandates') loop
      new_id:=public.phase3_insert_mandate(invite.issued_by_assignment_id,p||jsonb_build_object('membershipId',member.id));
      assignments:=assignments||jsonb_build_array(jsonb_build_object('id',new_id,'function',p->>'function'));
    end loop;
  elsif invite.issued_by='leverantor:cli' and invite.mandate_payload is null then
    -- Manuell leverantörsbootstrap är fortsatt separat från verksamhetsmandat.
    if jsonb_array_length(invite.grants) not between 1 and 2 then raise exception 'Bootstrap denied' using errcode='42501'; end if;
    for p in select value from jsonb_array_elements(invite.grants) loop
      if jsonb_typeof(p) is distinct from 'object' or p->>'function' is null or p->>'function' not in ('kundadmin','granskare')
        or exists(select 1 from jsonb_object_keys(p) k where k<>'function') then raise exception 'Bootstrap denied' using errcode='42501'; end if;
      insert into public.access_assignments(membership_id,customer_id,function)
        values(member.id,c.id,(p->>'function')::public.access_function) returning id into new_id;
      assignments:=assignments||jsonb_build_array(jsonb_build_object('id',new_id,'function',p->>'function'));
    end loop;
  else raise exception 'Invitation issuer missing' using errcode='42501'; end if;
  if jsonb_array_length(assignments)=0 then raise exception 'Empty invitation' using errcode='42501'; end if;
  update public.invitations set used_at=clock_timestamp(),used_by_identity_id=ident.id where id=invite.id;
  return jsonb_build_object('invitationId',invite.id,'membershipId',member.id,'assignments',assignments,
    'customer',jsonb_build_object('id',c.id,'name',c.name),'emailMismatch',invite.expected_email is not null and invite.expected_email is distinct from ident.email);
end $$;
revoke all on function public.phase3_validate_invitation(uuid,text,text,jsonb),public.phase3_issue_invitation(jsonb),public.phase3_redeem_invitation(bytea,uuid)
from public,anon,authenticated,skolplattform_worker;
