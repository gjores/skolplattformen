-- Forward-only repair: the initial decision migration is already installed.
-- A declared local is not qualified by the function name unless its block is labelled.
-- Use an unambiguous variable instead; CREATE OR REPLACE preserves the closed ACL.
create or replace function public.phase5_plan_decision_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare target_kind text;target_id uuid;request_command_id uuid;operation text;comment_text text;
 a public.access_assignments;s public.app_sessions;basis jsonb;result jsonb;receipt public.plan_decision_receipts;
 o public.offerings;p public.point_plans;t public.timplans;prior record;next_stage text;next_status text;
 decision_revision integer;actor_name text;item jsonb;confirmed jsonb;expected_checks jsonb;
begin
 if not public.phase5_programplan_shape(input,array['kind','planId','commandId','action','expectedRevision','expectedDecisionRevision','basisHash','comment','confirmedChecks'])
 or input->>'kind' not in ('programplan','timplan') or input->>'action' not in ('submit','return','approve','withdraw')
 or jsonb_typeof(input->'kind') is distinct from 'string' or jsonb_typeof(input->'action') is distinct from 'string'
 or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483646)
 or not public.phase5_programplan_integer(input->'expectedDecisionRevision',0,2147483646)
 or jsonb_typeof(input->'basisHash') is distinct from 'string' or input->>'basisHash' !~ '^sha256:[0-9a-f]{64}$'
 or jsonb_typeof(input->'comment') is distinct from 'string' or length(input->>'comment')>2000
 or (input->>'comment') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]'
 or not public.phase5_programplan_array(input->'confirmedChecks',20) then
 raise exception 'Invalid plan decision command' using errcode='22023';end if;
 target_kind:=input->>'kind';target_id:=(input->>'planId')::uuid;request_command_id:=(input->>'commandId')::uuid;
 if target_id is null or request_command_id is null then raise exception 'Invalid plan decision identity' using errcode='22023';end if;
 operation:=input->>'action';comment_text:=btrim(input->>'comment');confirmed:=input->'confirmedChecks';
 if operation='return' and comment_text='' then raise exception 'Return reason required' using errcode='22023';end if;
 if exists(select 1 from jsonb_array_elements(confirmed) c where jsonb_typeof(c)<>'string' or (c#>>'{}')!~'^[a-z][a-z0-9-]{0,79}$')
 or (select count(*) from jsonb_array_elements(confirmed))<>(select count(distinct c) from jsonb_array_elements(confirmed) c) then
 raise exception 'Invalid decision controls' using errcode='22023';end if;
 -- This obtains current session/customer/school/source/plan locks before both
 -- receipt replay and mutation. Recalled authority never replays a receipt.
 basis:=public.phase5_plan_decision_detail(target_kind,target_id);
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 select * into o from public.offerings where id=(basis->>'offeringId')::uuid;
 select * into receipt from public.plan_decision_receipts r where r.command_id=request_command_id;
 if found then
  if receipt.kind<>target_kind or receipt.plan_id<>target_id or receipt.organizer_id<>o.organizer_id
   or receipt.actor_identity_id<>s.identity_id or receipt.assignment_id<>a.id or receipt.request<>input then
   raise exception 'Decision command conflict' using errcode='40001',hint='plan_decision_conflict';end if;
  if target_kind='programplan' and exists(select 1 from public.offering_units ou where ou.offering_id=o.id
   and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
   raise exception 'Plan decision replay denied' using errcode='42501';end if;
  perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');return receipt.result;
 end if;
 if (basis->>'revision')::integer<>(input->>'expectedRevision')::integer
 or (basis->>'decisionRevision')::integer<>(input->>'expectedDecisionRevision')::integer
 or basis->>'basisHash'<>input->>'basisHash' then
 raise exception 'Plan decision changed' using errcode='40001',hint='plan_decision_conflict';end if;
 if not (basis->'actions' ? operation) then raise exception 'Plan decision denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(c->'id' order by c->>'id'),'[]') into expected_checks from jsonb_array_elements(basis->'checks') c;
 if exists(select 1 from jsonb_array_elements(confirmed) c where not (expected_checks @> jsonb_build_array(c))) then
 raise exception 'Unknown decision control' using errcode='22023';end if;
 if operation in ('submit','approve') and (jsonb_array_length(basis->'blockers')>0 or not(confirmed @> expected_checks)) then
 raise exception 'Plan decision needs correction' using errcode='40001',hint='plan_decision_blocked';end if;
 next_stage:=case operation when 'submit' then 'submitted' when 'return' then 'returned' when 'approve' then 'approved' when 'withdraw' then 'draft' end;
 decision_revision:=(basis->>'decisionRevision')::integer+1;
 if target_kind='programplan' then
  perform public.phase5_programplan_writable(o,operation in ('return','approve'));
  select * into p from public.point_plans where id=target_id for update;
  if operation='approve' then
   for prior in select q.id,q.status,q.revision from public.point_plans q where q.offering_id=o.id and q.organizer_id=o.organizer_id and q.status='faststalld' and q.id<>p.id order by q.id for update loop
    insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'programplan',prior.id,'faststalld','ersatt',prior.revision);
    update public.point_plans set status='ersatt',revision=revision+1 where id=prior.id;
    delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='programplan' and plan_id=prior.id;
   end loop;
   insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'programplan',p.id,'utkast','faststalld',p.revision);
   update public.point_plans set status='faststalld',revision=revision+1,decided_on=public.phase5_programplan_today(),decided_identity_id=s.identity_id where id=p.id;
   delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='programplan' and plan_id=p.id;
  end if;
 else
  select * into t from public.timplans where id=target_id for update;
  if o.archived_at is not null then raise exception 'Archived decision denied' using errcode='42501';end if;
  if operation='approve' then
   for prior in select q.id,q.status,q.revision from public.timplans q where q.offering_id=o.id and q.unit_id=t.unit_id and q.organizer_id=o.organizer_id and q.status='faststalld' and q.id<>t.id order by q.id for update loop
    insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'timplan',prior.id,'faststalld','ersatt',prior.revision);
    update public.timplans set status='ersatt',revision=revision+1 where id=prior.id;
    delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='timplan' and plan_id=prior.id;
   end loop;
  end if;
  next_status:=case operation when 'submit' then 'forslag' when 'return' then 'atersand' when 'approve' then 'faststalld' when 'withdraw' then 'utkast' end;
  insert into public.plan_decision_write_permits values(txid_current(),pg_backend_pid(),'timplan',t.id,t.status::text,next_status,t.revision);
  update public.timplans set status=next_status::public.timplan_status,revision=revision+1,
   decided_on=case when operation='approve' then public.phase5_programplan_today() else decided_on end,
   decided_identity_id=case when operation='approve' then s.identity_id else decided_identity_id end where id=t.id;
  delete from public.plan_decision_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and kind='timplan' and plan_id=t.id;
 end if;
 insert into public.plan_decision_reviews(kind,plan_id,programplan_id,timplan_id,stage,revision)
 values(target_kind,target_id,case when target_kind='programplan' then target_id end,case when target_kind='timplan' then target_id end,next_stage,decision_revision)
 on conflict(kind,plan_id) do update set stage=excluded.stage,revision=excluded.revision;
 select coalesce(nullif(btrim(i.display_name),''),case a.function when 'huvudman' then 'Huvudman' when 'rektor' then 'Rektor' else 'Skoladministratör' end)
 into actor_name from public.identities i where i.id=s.identity_id;
 insert into public.plan_decision_history(kind,plan_id,organizer_id,action,plan_revision,decision_revision,basis_hash,actor_identity_id,assignment_id,actor_name,comment,confirmed_checks)
 values(target_kind,target_id,o.organizer_id,operation,(basis->>'revision')::integer,decision_revision,basis->>'basisHash',s.identity_id,a.id,actor_name,comment_text,confirmed);
 result:=public.phase5_plan_decision_detail(target_kind,target_id);
 insert into public.plan_decision_receipts(command_id,kind,plan_id,organizer_id,actor_identity_id,assignment_id,request,result)
 values(request_command_id,target_kind,target_id,o.organizer_id,s.identity_id,a.id,input,result);
 perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');return result;
end $$;
