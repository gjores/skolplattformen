-- Behåll befintlig maximal inbjudningstid 30 dygn.
create or replace function public.phase3_issue_invitation(payload jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; normalized jsonb; result uuid; expiry timestamptz;
begin
  a:=public.phase3_actor();
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k not in ('personName','expectedIssuer','expectedSubject','expectedEmail','tokenHashHex','expiresAt','mandates')) then
    raise exception 'Invalid invitation payload' using errcode='22023'; end if;
  expiry:=(payload->>'expiresAt')::timestamptz;
  if expiry is null or not isfinite(expiry) or expiry<=clock_timestamp() or expiry>clock_timestamp()+interval '30 days' then
    raise exception 'Invalid invitation expiry' using errcode='22023'; end if;
  normalized:=public.phase3_validate_invitation(a.id,payload->>'expectedIssuer',payload->>'expectedSubject',payload->'mandates');
  insert into public.invitations(customer_id,token_hash,invited_person_name,expected_issuer,expected_subject,
    expected_email,grants,issued_by,expires_at,issued_by_assignment_id,mandate_payload)
  values(a.customer_id,decode(payload->>'tokenHashHex','hex'),payload->>'personName',payload->>'expectedIssuer',payload->>'expectedSubject',
    payload->>'expectedEmail',(select jsonb_agg(jsonb_build_object('function',p->>'function')) from jsonb_array_elements(normalized) p),
    a.membership_id::text,expiry,a.id,jsonb_build_object('version',1,'mandates',normalized)) returning id into result;
  return result;
end $$;

