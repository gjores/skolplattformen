-- Independent decision chains. Install only as part of the coherent named-plan package.
-- No old decision, receipt, status, timestamp or class link is rewritten.
alter table public.plan_decision_history add column name_at_decision text
 check(name_at_decision is null or public.phase5_timplan_series_name(name_at_decision));
alter table public.timplans drop constraint timplans_offering_unit_version_unique;
drop index public.timplans_one_open;
drop index public.timplans_one_decided;
alter table public.timplans add constraint timplans_series_version_unique unique(series_id,version);
create unique index timplans_one_open on public.timplans(series_id) where status in ('utkast','forslag','atersand');
create unique index timplans_one_decided on public.timplans(series_id) where status='faststalld';

create or replace function public.phase5_plan_decision_detail(target_kind text,target_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;o public.offerings;p public.point_plans;t public.timplans;
 review public.plan_decision_reviews;source jsonb;current_source jsonb;catalog jsonb;hours jsonb:='[]';
 stage text;revision integer;version integer;school_name text;unit_id uuid;actions jsonb:='[]';
 blockers jsonb:='[]';checks jsonb;history jsonb;links jsonb;basis_hash text;next_actor text;
 can_write boolean:=false;total_hours bigint;missing boolean;source_info text;profile jsonb;series jsonb;
begin
 if target_kind is null or target_kind not in ('programplan','timplan') or target_id is null then
 raise exception 'Invalid plan decision read' using errcode='22023';end if;
 a:=public.phase5_programplan_actor();
 if target_kind='programplan' then
  o:=public.phase5_programplan_scope(target_id);
  select * into p from public.point_plans where id=target_id for update;
  o:=public.phase5_programplan_scope(target_id);a:=public.phase5_programplan_actor();
  source:=public.phase5_gym_timplan_source(p.id);current_source:=source;
  stage:=case p.status when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  revision:=p.revision;version:=p.version;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if p.status='utkast' and review.stage in ('submitted','returned') then stage:=review.stage;end if;
  can_write:=a.function in ('huvudman','rektor') and o.archived_at is null
   and public.phase5_programplan_phase(o)='framtida'
   and not exists(select 1 from public.offering_units ou where ou.offering_id=o.id
    and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id));
  if can_write then
   if stage in ('draft','returned') and a.function='rektor' then actions:='["submit"]';end if;
   if stage='submitted' and a.function='rektor' then actions:='["withdraw"]';end if;
   if stage='draft' and a.function='huvudman' then actions:='["approve"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  if public.phase5_programplan_phase(o)<>'framtida' then blockers:=blockers||jsonb_build_array('Programplanen är låst eftersom elevkullen har startat eller startläget är okänt.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','structure','label','Jag har granskat att programstruktur, nivåer och terminsordning gäller elevkullen.'),
   jsonb_build_object('id','choices','label','Jag har granskat att alternativa ämnen och valbara ramar ger varje elev en fullständig studiegång.'));
 else
  select * into t from public.timplans where id=target_id;
  if t.id is null or t.gym_basis is null then raise exception 'Plan decision denied' using errcode='42501';end if;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);
  -- Keep established program-before-timplan order, including concurrent source decisions.
  perform 1 from public.point_plans where id=t.source_programplan_id for update;
  perform 1 from public.timplan_series where id=t.series_id for update;
  series:=public.phase5_named_timplan_series_json(t.series_id);
  select * into t from public.timplans where id=target_id for update;
  o:=public.phase5_gym_timplan_scope(t.offering_id,t.unit_id,false);a:=public.phase5_programplan_actor();
  source:=t.gym_basis;current_source:=public.phase5_gym_timplan_source(t.source_programplan_id);
  revision:=t.revision;version:=t.version;unit_id:=t.unit_id;
  select name into school_name from public.school_units where id=t.unit_id;
  stage:=case t.status when 'forslag' then 'submitted' when 'atersand' then 'returned' when 'faststalld' then 'approved' when 'ersatt' then 'replaced' else 'draft' end;
  select * into review from public.plan_decision_reviews where kind=target_kind and plan_id=target_id for update;
  if o.archived_at is null then
   if stage in ('draft','returned') and a.function in ('rektor','administrator') then actions:='["submit"]';end if;
   if stage='submitted' and a.function in ('rektor','administrator') then actions:='["withdraw"]';end if;
   if stage='submitted' and a.function='huvudman' then actions:='["return","approve"]';end if;
  end if;
  select coalesce(jsonb_agg(jsonb_build_object('rowKey',c.row_id,'hours',
   (select jsonb_agg(case when c.allocated[n] then to_jsonb(c.hours[n]) else 'null'::jsonb end order by n) from generate_series(1,6) n)) order by c.row_id),'[]')
   into hours from public.timplan_cells c where c.timplan_id=t.id;
  select coalesce(sum(c.hours[n]),0),coalesce(bool_or((d->'points'->>(n-1))::integer>0 and not c.allocated[n]),false)
   into total_hours,missing from public.timplan_cells c
   cross join lateral jsonb_array_elements(t.gym_basis->'distribution') d cross join generate_series(1,6) n
   where c.timplan_id=t.id and d->>'rowKey'=c.row_id;
  if jsonb_array_length(hours)<>jsonb_array_length(source->'rows') or missing
   or exists(select 1 from public.timplan_cells c where c.timplan_id=t.id and (select coalesce(sum(v),0) from unnest(c.hours) v)=0) then
   blockers:=blockers||jsonb_build_array('Fördela undervisningstiden i alla aktiva terminsfält innan timplanen skickas för godkännande.');end if;
  profile:=public.phase5_plan_decision_profile(source);
  if profile is not null and total_hours<(profile->>'hours')::integer then
   blockers:=blockers||jsonb_build_array('Timplanen innehåller färre än '||replace(to_char((profile->>'hours')::integer,'FM9 999'),chr(160),' ')||' planerade undervisningstimmar.');end if;
  if current_source->>'status' is distinct from 'faststalld' then blockers:=blockers||jsonb_build_array('Huvudmannen behöver först fastställa timplanens programplansversion.');end if;
  if public.phase5_plan_decision_source_content(source) is distinct from public.phase5_plan_decision_source_content(current_source) then
   blockers:=blockers||jsonb_build_array('Programplanens innehåll har ändrats. Skapa en ny timplansversion från det aktuella underlaget.');end if;
  checks:=jsonb_build_array(jsonb_build_object('id','teacher-led','label','Jag har granskat att timmarna avser undervisning och att annan aktivitet inte räknas som undervisningstid.'),
   jsonb_build_object('id','choice-paths','label','Jag har granskat att alla möjliga ämnesval och alternativa studiegångar får minst den garanterade undervisningstiden.'));
  source_info:='Programplan version '||(source->>'version')||' · fryst revision '||(source->>'revision');
 end if;
 profile:=public.phase5_plan_decision_profile(source);
 if profile->'vocational'='true'::jsonb then
  checks:=checks||jsonb_build_array(
   jsonb_build_object('id','eligibility','label','Jag har kontrollerat att engelska nivå 1–2 och svenska eller svenska som andraspråk nivå 1–3 ingår i den gemensamma planen. Individuella bortval hanteras separat.'),
   jsonb_build_object('id','apl','label','Jag har kontrollerat minst 15 veckors APL, eller mer än halva utbildningen vid lärlingsutbildning. Varje APL-vecka räknas som 23 timmar och ingår bara en gång i timplanens total.'));
 end if;
 if o.archived_at is not null then blockers:=blockers||jsonb_build_array('Utbildningen är arkiverad.');end if;
 blockers:=blockers||public.phase5_plan_decision_source_blockers(source);
 select payload into catalog from public.programplan_catalogs where catalog_id=source->>'catalogId';
 select coalesce(jsonb_agg(jsonb_build_object('unitId',ou.unit_id,'organizerId',ou.organizer_id) order by ou.unit_id),'[]') into links
  from public.offering_units ou where ou.offering_id=o.id;
 select coalesce(jsonb_agg(jsonb_build_object('action',h.action,'at',h.occurred_at,'actorName',h.actor_name,'comment',h.comment,'nameAtDecision',h.name_at_decision) order by h.occurred_at desc,h.id desc),'[]')
  into history from (select * from public.plan_decision_history h where h.kind=target_kind and h.plan_id=target_id and h.organizer_id=o.organizer_id order by occurred_at desc,id desc limit 1000) h;
 basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('rules','gy25-national-programs-2026-10-12-v2',
  'kind',target_kind,'planId',target_id,'revision',revision,'source',source,'currentSource',current_source,
  'hours',hours,'stage',stage,'decisionRevision',coalesce(review.revision,0),'links',links,
  'educationRevision',o.lifecycle_revision,'archived',o.archived_at,'phase',public.phase5_programplan_phase(o))::text,'UTF8')),'hex');
 if target_kind='timplan' then
  basis_hash:='sha256:'||encode(sha256(convert_to(jsonb_build_object('basisHash',basis_hash,'series',series)::text,'UTF8')),'hex');
 end if;
 next_actor:=case when stage='submitted' or (a.function='huvudman' and actions ? 'approve' and jsonb_array_length(blockers)=0) then 'huvudman' when stage in ('draft','returned') then 'rektor' else null end;
 return jsonb_build_object('series',series,'kind',target_kind,'planId',target_id,'offeringId',o.id,'unitId',unit_id,
  'educationName',o.name,'schoolName',school_name,'version',version,'stage',stage,'nextActor',next_actor,
  'revision',revision,'decisionRevision',coalesce(review.revision,0),'basisHash',basis_hash,'actions',actions,
  'blockers',blockers,'checks',checks,'history',history,'sourceInfo',source_info,'source',source,'catalog',catalog,'hours',hours);
end $$;

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
  -- Older receipts keep their exact stored body/hash. Add only absent presentation metadata.
  result:=receipt.result;
  if not(result ? 'series') then result:=result||jsonb_build_object('series',basis->'series');end if;
  perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');return result;
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
   for prior in select q.id,q.status,q.revision from public.timplans q where q.series_id=t.series_id and q.offering_id=o.id and q.unit_id=t.unit_id and q.organizer_id=o.organizer_id and q.status='faststalld' and q.id<>t.id order by q.id for update loop
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
 insert into public.plan_decision_history(kind,plan_id,organizer_id,action,plan_revision,decision_revision,basis_hash,actor_identity_id,assignment_id,actor_name,comment,confirmed_checks,name_at_decision)
 values(target_kind,target_id,o.organizer_id,operation,(basis->>'revision')::integer,decision_revision,basis->>'basisHash',s.identity_id,a.id,actor_name,comment_text,confirmed,case when target_kind='timplan' then basis#>>'{series,name}' end);
 result:=public.phase5_plan_decision_detail(target_kind,target_id);
 insert into public.plan_decision_receipts(command_id,kind,plan_id,organizer_id,actor_identity_id,assignment_id,request,result)
 values(request_command_id,target_kind,target_id,o.organizer_id,s.identity_id,a.id,input,result);
 perform public.phase5_plan_decision_audit(target_kind,target_id,'plan_decision_command');return result;
end $$;

create or replace function public.phase5_plan_decision_items() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; entry record; detail jsonb; item jsonb; items jsonb:='[]';
 task text;stage text;next_actor text;can_write boolean;
 cache_keys jsonb[]:='{}';cache_values jsonb[]:='{}';cache_key jsonb;cache_index integer;cached jsonb;
begin
 a:=public.phase5_programplan_actor();
 for entry in
  select 'programplan'::text kind,p.id,p.offering_id,o.name,p.version,p.status::text status,null::uuid unit_id,null::text school_name,
   o.archived_at,public.phase5_programplan_phase(o) phase,r.stage review_stage,
   jsonb_build_array(p.catalog_id,p.basis_reference,p.term_distribution,p.status) source_key,
   not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) full_scope
   from public.point_plans p join public.offerings o on o.id=p.offering_id and o.organizer_id=p.organizer_id
   left join public.plan_decision_reviews r on r.kind='programplan' and r.plan_id=p.id
   where p.status='utkast' and o.kind='gymnasium' and o.organizer_id=a.organizer_id
   and exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.unit_id=ou.unit_id and m.assignment_id=a.id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id)
  union all
  select 'timplan',t.id,t.offering_id,o.name,t.version,t.status::text,t.unit_id,u.name,o.archived_at,null,null,null::jsonb,true
   from public.timplans t join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
   join public.school_units u on u.id=t.unit_id and u.organizer_id=t.organizer_id
   where t.gym_basis is not null and t.status in ('utkast','forslag','atersand') and o.organizer_id=a.organizer_id
   and exists(select 1 from public.organizers g where g.id=o.organizer_id and g.customer_id=a.customer_id)
   and exists(select 1 from public.offering_units ou join public.mandate_units m on m.unit_id=ou.unit_id and m.assignment_id=a.id where ou.offering_id=o.id and ou.organizer_id=o.organizer_id and ou.unit_id=t.unit_id)
  order by kind,name,id
 loop
  stage:=case when entry.kind='programplan' then case when entry.review_stage in ('submitted','returned') then entry.review_stage else 'draft' end
   when entry.status='forslag' then 'submitted' when entry.status='atersand' then 'returned' else 'draft' end;
  can_write:=entry.archived_at is null and (entry.kind='timplan' or entry.phase='framtida' and entry.full_scope);
  -- These priority branches are identical to detail/actions and do not depend on blockers.
  -- No catalog, rows, hours, history, hashes or row locks are needed for an ordinary task list.
  task:=case
   when can_write and stage='submitted' and a.function='huvudman' then 'review'
   when can_write and stage='returned' and (a.function='rektor' or entry.kind='timplan' and a.function='administrator') then 'revise'
   when can_write and stage='draft' and (a.function='rektor' or entry.kind='timplan' and a.function='administrator') then 'prepare'
   else null end;
  if task is not null then
   next_actor:=case when stage='submitted' then 'huvudman' else 'rektor' end;
   item:=jsonb_build_object('kind',entry.kind,'planId',entry.id,'offeringId',entry.offering_id,'unitId',entry.unit_id,
    'educationName',entry.name,'schoolName',entry.school_name,'version',entry.version,'stage',stage,'nextActor',next_actor,'task',task);
  else
   -- Cache only the routing outcome for identical frozen program content and access state.
   -- Identity/name/version remain the actual row's values, and catalogs are immutable.
   cache_key:=case when entry.kind='programplan' then jsonb_build_array(entry.source_key,stage,entry.phase,entry.archived_at,entry.full_scope) end;
   cache_index:=case when cache_key is not null then array_position(cache_keys,cache_key) end;
   if cache_index is null then
    detail:=public.phase5_plan_decision_detail(entry.kind,entry.id);
    task:=case when a.function='huvudman' and detail->'actions' ? 'approve' and jsonb_array_length(detail->'blockers')=0 then 'review'
     when jsonb_array_length(detail->'blockers')>0 then 'blocked' else 'waiting' end;
    cached:=jsonb_build_object('task',task,'nextActor',detail->'nextActor');
    if cache_key is not null and cardinality(cache_keys)<128 then
     cache_keys:=array_append(cache_keys,cache_key);cache_values:=array_append(cache_values,cached);
    end if;
   else cached:=cache_values[cache_index];end if;
   item:=jsonb_build_object('kind',entry.kind,'planId',entry.id,'offeringId',entry.offering_id,'unitId',entry.unit_id,
    'educationName',entry.name,'schoolName',entry.school_name,'version',entry.version,'stage',stage,
    'nextActor',cached->'nextActor','task',cached->'task');
  end if;
  item:=item||jsonb_build_object('series',case when entry.kind='timplan' then
   (select public.phase5_named_timplan_series_json(t.series_id) from public.timplans t where t.id=entry.id) else null end);
  items:=items||jsonb_build_array(item);
 end loop;
 select coalesce(jsonb_agg(j order by case when j->>'task' in ('prepare','review','revise') then 0 else 1 end,
  lower(j->>'educationName') collate "C",j->>'kind',coalesce(j->>'schoolName','') collate "C",j->>'planId'),'[]') into items
 from jsonb_array_elements(items) j;
 return items;
end $$;

create or replace function public.phase5_plan_decision_page(q jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare items jsonb;visible jsonb;filtered jsonb;action_count integer;decision_count integer;total integer;cnt integer;page integer;
begin
 perform public.phase5_programplan_actor();
 if not public.phase5_programplan_shape(q,array['query','kind','stage','tasks','page'])
  or jsonb_typeof(q->'query')<>'string' or length(q->>'query')>200 or q->>'query'<>btrim(q->>'query') or q->>'query' ~ '[[:cntrl:]]'
  or exists(select 1 from unnest(array['kind','stage','tasks']) k where jsonb_typeof(q->k)<>'string')
  or q->>'kind' not in ('all','programplan','timplan') or q->>'stage' not in ('all','draft','submitted','returned')
  or q->>'tasks' not in ('all','mine','waiting') or not public.phase5_programplan_integer(q->'page',1,100000)
  then raise exception 'Invalid decision selection' using errcode='22023';end if;
 page:=(q->>'page')::integer;
 items:=public.phase5_plan_decision_items();total:=jsonb_array_length(items);
 select count(*) filter(where j->>'task' in ('prepare','review','revise')),count(*) filter(where j->>'task'='review')
  into action_count,decision_count from jsonb_array_elements(items) j;
 select coalesce(jsonb_agg(j order by ord),'[]') into filtered from jsonb_array_elements(items) with ordinality t(j,ord)
  where (q->>'kind'='all' or j->>'kind'=q->>'kind') and (q->>'stage'='all' or j->>'stage'=q->>'stage')
   and (q->>'tasks'='all' or (j->>'task' in ('prepare','review','revise'))=(q->>'tasks'='mine'))
   and (q->>'query'='' or strpos(lower(coalesce(j->>'educationName','')||' '||coalesce(j->>'schoolName','')||' '||coalesce(j#>>'{series,name}','')),lower(q->>'query'))>0);
 cnt:=jsonb_array_length(filtered);
 select coalesce(jsonb_agg(j order by ord),'[]') into visible from jsonb_array_elements(filtered) with ordinality t(j,ord)
  where ord>(page-1)*50 and ord<=page*50;
 perform public.phase5_plan_decision_audit(null,null,'plan_decision_inbox_read');
 return jsonb_build_object('selection',q,'items',visible,'actionCount',action_count,'decisionCount',decision_count,'total',total,'count',cnt,'pageSize',50);
end $$;
