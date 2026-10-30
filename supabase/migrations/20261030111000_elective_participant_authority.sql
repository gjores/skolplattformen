-- VB-05. School-attested identities for elective choices. No staff role or generic pupil access.
begin;
set local search_path=public,extensions;
create table public.elective_participant_bindings (
 id uuid primary key, customer_id uuid not null, organizer_id uuid not null, unit_id uuid not null,
 pupil_id uuid not null, identity_id uuid not null references public.identities(id),
 participant text not null check(participant in ('pupil','guardian')),
 confirmation_required boolean not null check(participant<>'pupil' or not confirmation_required),
 starts_on date not null check(isfinite(starts_on)), ends_on date check(ends_on is null or (isfinite(ends_on) and ends_on>=starts_on)),
 source_reference text not null check(length(source_reference) between 1 and 120 and source_reference=btrim(source_reference)),
 attested_by_assignment_id uuid not null references public.access_assignments(id),
 revision integer not null default 1 check(revision>0), created_at timestamptz not null default clock_timestamp(), revoked_at timestamptz,
 foreign key(pupil_id,customer_id,organizer_id) references public.pupils(id,customer_id,organizer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id),
 exclude using gist(identity_id with =,pupil_id with =,unit_id with =,participant with =,daterange(starts_on,ends_on,'[]') with &&) where(revoked_at is null),
 exclude using gist(identity_id with =,daterange(starts_on,ends_on,'[]') with &&) where(revoked_at is null and participant='pupil'),
 exclude using gist(pupil_id with =,daterange(starts_on,ends_on,'[]') with &&) where(revoked_at is null and participant='pupil')
);
create index elective_bindings_pupil on public.elective_participant_bindings(customer_id,unit_id,pupil_id);
create table public.elective_binding_commands (
 id uuid primary key, customer_id uuid not null references public.customers(id), unit_id uuid not null, pupil_id uuid not null,
 actor_identity_id uuid not null references public.identities(id), actor_assignment_id uuid not null references public.access_assignments(id),
 request jsonb not null, result jsonb not null, created_at timestamptz not null default clock_timestamp()
);
alter table public.elective_participant_bindings enable row level security;
alter table public.elective_participant_bindings force row level security;
alter table public.elective_binding_commands enable row level security;
alter table public.elective_binding_commands force row level security;
revoke all on public.elective_participant_bindings,public.elective_binding_commands from public,anon,authenticated,skolplattform_worker;

create function public.elective_binding_scope(unit uuid,pupil uuid) returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;p public.pupils;
begin
 perform public.phase5_programplan_session_check();a:=public.phase3_actor();
 perform public.tjanst_plan_scope(a,unit);
 if a.function not in ('rektor','administrator') or not public.phase4_scope(a.id,pupil,unit) then
  raise exception 'Binding authority denied' using errcode='42501';end if;
 select * into p from public.pupils where id=pupil and customer_id=a.customer_id and organizer_id=a.organizer_id;
 if not found or (p.protected_identity and not public.phase4_can_read_protected(pupil,unit)) then
  raise exception 'Binding authority denied' using errcode='42501';end if;
 return a;
end $$;
create function public.elective_binding_json(b public.elective_participant_bindings) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',b.id,'unitId',b.unit_id,'pupilId',b.pupil_id,'identityId',b.identity_id,'participant',b.participant,
 'confirmationRequired',b.confirmation_required,'startsOn',b.starts_on,'endsOn',b.ends_on,'sourceReference',b.source_reference,
 'revision',b.revision,'revokedAt',case when b.revoked_at is null then null else to_char(b.revoked_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,
 'attestedByAssignmentId',b.attested_by_assignment_id)
$$;
create function public.elective_binding_audit(operation text,object_id uuid,unit uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation not in ('elective_bindings_read','elective_binding_command','elective_binding_status') then raise exception 'Invalid audit' using errcode='22023';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,'elective_binding',object_id,'ok',jsonb_build_object('unitId',unit));
 exception when others then raise exception 'Binding audit unavailable' using errcode='55000';end;
end $$;
create function public.elective_bindings_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare unit uuid;pupil uuid;a public.access_assignments;result jsonb;
begin
 perform public.phase4_keys(input,array['unitId','pupilId']);unit:=(input->>'unitId')::uuid;pupil:=(input->>'pupilId')::uuid;
 a:=public.elective_binding_scope(unit,pupil);
 select jsonb_build_object('contractVersion','elective_binding_v1','unitId',unit,'pupilId',pupil,
 'bindings',coalesce(jsonb_agg(public.elective_binding_json(b) order by b.created_at,b.id),'[]'::jsonb)) into result
 from public.elective_participant_bindings b where b.unit_id=unit and b.pupil_id=pupil and b.customer_id=a.customer_id;
 perform public.elective_binding_audit('elective_bindings_read',pupil,unit);return result;
end $$;
create function public.elective_binding_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;unit uuid;pupil uuid;cid uuid;bid uuid;ident uuid;expected integer;
 p jsonb;op text;b public.elective_participant_bindings;prior public.elective_binding_commands;result jsonb;from_date date;to_date date;
begin
 perform public.phase4_keys(input,array['unitId','pupilId','commandId','expectedRevision','action','payload']);
 unit:=(input->>'unitId')::uuid;pupil:=(input->>'pupilId')::uuid;cid:=(input->>'commandId')::uuid;
 if jsonb_typeof(input->'expectedRevision') is distinct from 'number' or input->>'expectedRevision' !~ '^[0-9]+$' then raise exception 'Invalid revision' using errcode='22023';end if;
 expected:=(input->>'expectedRevision')::integer;op:=input->>'action';p:=input->'payload';
 a:=public.elective_binding_scope(unit,pupil);s:=public.phase5_programplan_session_check();
 select * into prior from public.elective_binding_commands where id=cid;
 if found then
  if prior.customer_id<>a.customer_id or prior.unit_id<>unit or prior.pupil_id<>pupil or prior.actor_identity_id<>s.identity_id or prior.actor_assignment_id<>a.id or prior.request<>input then
   raise exception 'Binding command conflict' using errcode='40001',hint='elective_binding_conflict';end if;
  perform public.elective_binding_audit('elective_binding_status',cid,unit);return prior.result;
 end if;
 if op='save_binding' then
  perform public.phase4_keys(p,array['id','identityId','participant','confirmationRequired','startsOn','endsOn','sourceReference']);
 elsif op='revoke_binding' then perform public.phase4_keys(p,array['id']);
 else raise exception 'Unknown binding action' using errcode='22023';end if;
 bid:=(p->>'id')::uuid;
 select * into b from public.elective_participant_bindings where id=bid for update;
 if found and (b.unit_id<>unit or b.pupil_id<>pupil or b.customer_id<>a.customer_id) then raise exception 'Binding denied' using errcode='42501';end if;
 if (b.id is null and expected<>0) or (b.id is not null and (b.revision<>expected or b.revoked_at is not null)) then
  raise exception 'Binding revision conflict' using errcode='40001',hint='elective_binding_conflict';end if;
 if op='revoke_binding' then
  if b.id is null then raise exception 'Binding revision conflict' using errcode='40001',hint='elective_binding_conflict';end if;
  update public.elective_participant_bindings set revoked_at=clock_timestamp(),revision=revision+1 where id=bid returning * into b;
 else
  ident:=(p->>'identityId')::uuid;from_date:=(p->>'startsOn')::date;to_date:=nullif(p->>'endsOn','')::date;
  if p->>'participant' not in ('pupil','guardian') or jsonb_typeof(p->'confirmationRequired') is distinct from 'boolean'
   or jsonb_typeof(p->'startsOn') is distinct from 'string' or (jsonb_typeof(p->'endsOn') is distinct from 'null' and jsonb_typeof(p->'endsOn') is distinct from 'string')
   or not isfinite(from_date) or (to_date is not null and (not isfinite(to_date) or to_date<from_date))
   or jsonb_typeof(p->'sourceReference') is distinct from 'string' or length(p->>'sourceReference') not between 1 and 120 or p->>'sourceReference'<>btrim(p->>'sourceReference')
   or (p->>'participant'='pupil' and (p->>'confirmationRequired')::boolean) then raise exception 'Invalid binding' using errcode='22023';end if;
  -- A customer-owned account and a school placement are prerequisites. Display names and email are never matched.
  perform 1 from public.memberships m where m.identity_id=ident and m.customer_id=a.customer_id and m.status='active' for share;
  if not found then raise exception 'Account outside customer' using errcode='42501';end if;
  if not exists(select 1 from public.pupil_placements pp where pp.pupil_id=pupil and pp.unit_id=unit and pp.customer_id=a.customer_id
   and (to_date is null or pp.starts_on<=to_date) and (pp.ends_on is null or pp.ends_on>=from_date)) then raise exception 'No matching placement' using errcode='42501';end if;
  if b.id is not null and (b.identity_id<>ident or b.participant<>p->>'participant') then raise exception 'Identity immutable' using errcode='22023';end if;
  if b.id is null then
   insert into public.elective_participant_bindings(id,customer_id,organizer_id,unit_id,pupil_id,identity_id,participant,confirmation_required,starts_on,ends_on,source_reference,attested_by_assignment_id)
   values(bid,a.customer_id,a.organizer_id,unit,pupil,ident,p->>'participant',(p->>'confirmationRequired')::boolean,from_date,to_date,p->>'sourceReference',a.id) returning * into b;
  else
   update public.elective_participant_bindings set confirmation_required=(p->>'confirmationRequired')::boolean,starts_on=from_date,ends_on=to_date,source_reference=p->>'sourceReference',attested_by_assignment_id=a.id,revision=revision+1 where id=bid returning * into b;
  end if;
 end if;
 result:=jsonb_build_object('status','done','receipt',jsonb_build_object('commandId',cid,'identityId',s.identity_id,'assignmentId',a.id,'bindingId',bid,'bindingRevision',b.revision,'request',input),'binding',public.elective_binding_json(b));
 insert into public.elective_binding_commands(id,customer_id,unit_id,pupil_id,actor_identity_id,actor_assignment_id,request,result)
 values(cid,a.customer_id,unit,pupil,s.identity_id,a.id,input,result);
 perform public.elective_binding_audit('elective_binding_command',bid,unit);return result;
exception when exclusion_violation then raise exception 'Overlapping binding' using errcode='22023',hint='elective_binding_overlap';
end $$;
create function public.elective_binding_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;c public.elective_binding_commands;
begin
 perform public.phase4_keys(input,array['unitId','pupilId','commandId','expectedRevision','action','payload']);
 a:=public.elective_binding_scope((input->>'unitId')::uuid,(input->>'pupilId')::uuid);s:=public.phase5_programplan_session_check();
 select * into c from public.elective_binding_commands where id=(input->>'commandId')::uuid;
 if found and (c.customer_id<>a.customer_id or c.actor_identity_id<>s.identity_id or c.actor_assignment_id<>a.id or c.request<>input) then raise exception 'Binding command conflict' using errcode='40001',hint='elective_binding_conflict';end if;
 perform public.elective_binding_audit('elective_binding_status',(input->>'commandId')::uuid,(input->>'unitId')::uuid);
 if c.id is null then return jsonb_build_object('status','not_found','commandId',input->>'commandId');end if;return c.result;
end $$;

-- A token-derived scope, not a staff context. Every consumer calls the internal actor helper again.
create function public.elective_participant_session(sid uuid,ident uuid,token_hex text,expected_epoch integer) returns public.app_sessions
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions;
begin
 if token_hex is null or token_hex !~ '^[0-9a-f]{64}$' or expected_epoch is null then raise exception 'Session denied' using errcode='42501',hint='elective_session_revoked';end if;
 select * into s from public.app_sessions where id=sid and identity_id=ident and token_hash=decode(token_hex,'hex') for update;
 if not found or s.revoked_at is not null then raise exception 'Session denied' using errcode='42501',hint='elective_session_revoked';end if;
 if s.expires_at<=clock_timestamp() or s.absolute_expires_at<=clock_timestamp() then raise exception 'Session expired' using errcode='42501',hint='elective_session_expired';end if;
 if s.context_epoch<>expected_epoch then raise exception 'Session changed' using errcode='40001',hint='elective_context_changed';end if;
 perform set_config('app.phase','',true),set_config('app.identity_id',ident::text,true),set_config('app.session_id',sid::text,true),
 set_config('app.assignment_id','',true),set_config('app.access_function','',true),set_config('app.app_role','',true),set_config('app.membership_id','',true),
 set_config('request.jwt.claims','{}',true),set_config('request.jwt.claim.sub','',true),
 set_config('app.elective_token_hash',token_hex,true),set_config('app.elective_epoch',expected_epoch::text,true);
 return s;
end $$;
-- Called only by the server with its configured idle timeout, after a successful participant operation.
create function public.elective_participant_touch(sid uuid,ident uuid,token_hex text,expected_epoch integer,idle_seconds integer) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions;
begin
 if idle_seconds is null or idle_seconds<1 or idle_seconds>86400 then raise exception 'Invalid idle policy' using errcode='22023';end if;
 s:=public.elective_participant_session(sid,ident,token_hex,expected_epoch);
 if s.last_seen_at<=clock_timestamp()-interval '60 seconds' then
  update public.app_sessions set last_seen_at=clock_timestamp(),expires_at=least(clock_timestamp()+make_interval(secs=>idle_seconds),absolute_expires_at)
  where id=s.id and revoked_at is null and expires_at>clock_timestamp() and absolute_expires_at>clock_timestamp();
 end if;
end $$;
create function public.elective_participant_scope(sid uuid,ident uuid,token_hex text,expected_epoch integer,unit uuid,pupil uuid,kind text) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions;b public.elective_participant_bindings;cust uuid;
begin
 s:=public.elective_participant_session(sid,ident,token_hex,expected_epoch);
 if kind not in ('pupil','guardian') then raise exception 'Participant denied' using errcode='42501';end if;
 select customer_id into cust from public.elective_participant_bindings where identity_id=ident and unit_id=unit and pupil_id=pupil and participant=kind and revoked_at is null and starts_on<=public.app_today() and (ends_on is null or ends_on>=public.app_today());
 if cust is null then raise exception 'Participant denied' using errcode='42501';end if;
 perform public.phase3_lock_customer(cust);
 perform 1 from public.customers where id=cust and closed_at is null for share;
 if not found then raise exception 'Customer unavailable' using errcode='42501';end if;
 perform 1 from public.memberships where customer_id=cust and identity_id=ident and status='active' for share;
 if not found then raise exception 'Account unavailable' using errcode='42501';end if;
 select * into b from public.elective_participant_bindings where identity_id=ident and unit_id=unit and pupil_id=pupil and participant=kind and customer_id=cust
 and revoked_at is null and starts_on<=public.app_today() and (ends_on is null or ends_on>=public.app_today()) for update;
 if not found or not exists(select 1 from public.pupil_placements pp where pp.pupil_id=pupil and pp.unit_id=unit and pp.customer_id=cust and (pp.ends_on is null or pp.ends_on>=public.app_today())) then raise exception 'Participant denied' using errcode='42501';end if;
 perform set_config('app.customer_id',b.customer_id::text,true),set_config('app.organizer_id',b.organizer_id::text,true),set_config('app.elective_binding_id',b.id::text,true);
 return jsonb_build_object('unitId',unit,'pupilId',pupil,'identityId',ident,'bindingId',b.id,'customerId',b.customer_id,'organizerId',b.organizer_id,
 'participant',kind,'bindingRevision',b.revision,'confirmationRequired',b.confirmation_required,'epoch',s.context_epoch);
end $$;
create function public.elective_participant_actor() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_participant_bindings;
begin
 select * into b from public.elective_participant_bindings where id=nullif(current_setting('app.elective_binding_id',true),'')::uuid;
 if not found then raise exception 'Participant context required' using errcode='42501';end if;
 return public.elective_participant_scope(nullif(current_setting('app.session_id',true),'')::uuid,nullif(current_setting('app.identity_id',true),'')::uuid,
 current_setting('app.elective_token_hash',true),nullif(current_setting('app.elective_epoch',true),'')::integer,b.unit_id,b.pupil_id,b.participant);
end $$;
create function public.elective_participant_audit(operation text,object_id uuid,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;i public.identities;
begin
 a:=public.elective_participant_actor();select * into i from public.identities where id=(a->>'identityId')::uuid;
 if operation not in ('elective_self_read','elective_choice_submitted','elective_guardian_confirmed','elective_self_status') or details<>'{}'::jsonb then raise exception 'Invalid participant audit' using errcode='22023';end if;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,nullif(current_setting('app.session_id',true),'')::uuid,(a->>'customerId')::uuid,operation,'elective_choice',object_id,'ok','{}'::jsonb);
 exception when others then raise exception 'Participant audit unavailable' using errcode='55000';end;
end $$;
create function public.elective_participant_contexts(sid uuid,ident uuid,token_hex text,expected_epoch integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare s public.app_sessions;b public.elective_participant_bindings;authority jsonb;items jsonb:='[]';nm text;school text;
begin
 s:=public.elective_participant_session(sid,ident,token_hex,expected_epoch);
 for b in select x.* from public.elective_participant_bindings x join public.customers c on c.id=x.customer_id and c.closed_at is null
 join public.memberships m on m.customer_id=x.customer_id and m.identity_id=ident and m.status='active'
 where x.identity_id=ident and x.revoked_at is null and x.starts_on<=public.app_today() and (x.ends_on is null or x.ends_on>=public.app_today())
 and exists(select 1 from public.pupil_placements pp where pp.pupil_id=x.pupil_id and pp.unit_id=x.unit_id and (pp.ends_on is null or pp.ends_on>=public.app_today()))
 order by x.customer_id,x.unit_id,x.pupil_id,x.participant limit 201 loop
  authority:=public.elective_participant_scope(sid,ident,token_hex,expected_epoch,b.unit_id,b.pupil_id,b.participant);
  select display_name into nm from public.pupils where id=b.pupil_id;select name into school from public.school_units where id=b.unit_id;
  items:=items||jsonb_build_array(jsonb_build_object('bindingId',b.id,'unitId',b.unit_id,'schoolName',school,'pupilId',b.pupil_id,'pupilName',nm,'participant',b.participant,'bindingRevision',b.revision,'confirmationRequired',b.confirmation_required));
  perform public.elective_participant_audit('elective_self_read',null);
 end loop;
 if jsonb_array_length(items)>200 then raise exception 'Too many participant contexts' using errcode='22023';end if;
 return jsonb_build_object('contractVersion','elective_self_v1','epoch',s.context_epoch,'participants',items);
end $$;
revoke all on function public.elective_binding_scope(uuid,uuid),public.elective_binding_json(public.elective_participant_bindings),public.elective_binding_audit(text,uuid,uuid),
 public.elective_bindings_read(jsonb),public.elective_binding_command(jsonb),public.elective_binding_status(jsonb),
 public.elective_participant_session(uuid,uuid,text,integer),public.elective_participant_touch(uuid,uuid,text,integer,integer),public.elective_participant_scope(uuid,uuid,text,integer,uuid,uuid,text),public.elective_participant_actor(),
 public.elective_participant_audit(text,uuid,jsonb),public.elective_participant_contexts(uuid,uuid,text,integer) from public,anon,authenticated,skolplattform_worker;
grant execute on function public.elective_bindings_read(jsonb),public.elective_binding_command(jsonb),public.elective_binding_status(jsonb),
 public.elective_participant_scope(uuid,uuid,text,integer,uuid,uuid,text),public.elective_participant_contexts(uuid,uuid,text,integer),public.elective_participant_touch(uuid,uuid,text,integer,integer) to skolplattform_worker;
commit;
