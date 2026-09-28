-- Follow-up to already applied 160000: audit outcome and typed conflict contract.
begin;
create or replace function public.phase4_mutation_conflict(p public.pupils,details jsonb) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('kind','conflict','details',jsonb_build_object('currentVersion',p.version,
 'changedBy',case when h.changed_at is not null and h.actor_id is null then 'Simulerad källa' else coalesce(h.actor_id::text,nullif(current_setting('app.membership_id',true),'')) end,
 'changedAt',coalesce(h.changed_at,p.updated_at))||details,
 'auditRefs',case when p.protected_identity then jsonb_build_array(jsonb_build_object('kind','protected','pupilId',p.id)) else '[]'::jsonb end)
 from (select 1) seed left join lateral (
  select actor_id,changed_at from public.pupil_field_history h where h.pupil_id=p.id
   and case details->>'kind'
    when 'fields' then h.field in (select value->>'field' from jsonb_array_elements(details->'fields'))
    when 'identity' then h.field='personalNumber'
    else true end
  order by h.revision desc,h.changed_at desc limit 1
 )h on true
$$;
create or replace function public.phase4_simulated_source_deliver(request jsonb) returns jsonb
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare p public.pupils; f text; incoming jsonb; current_value jsonb; state public.pupil_field_state; conflict_id uuid; next_version integer;
begin
 if current_user<>'postgres' then raise exception 'Delivery denied' using errcode='42501'; end if;
 perform public.phase4_keys(request,array['pupilId','field','value']);
 f:=request->>'field'; incoming:=request->'value';
 if coalesce(f,'') not in ('displayName','personalNumber','protectedIdentity') then raise exception 'Invalid source field' using errcode='22023'; end if;
 if f='displayName' and (jsonb_typeof(incoming) is distinct from 'string' or length(incoming#>>'{}') not between 1 and 240 or incoming#>>'{}'<>btrim(incoming#>>'{}')) then raise exception 'Invalid source value' using errcode='22023'; end if;
 if f='personalNumber' and (jsonb_typeof(incoming) is distinct from 'string' or not exists(select 1 from public.synthetic_pupil_numbers where personal_number=incoming#>>'{}')) then raise exception 'Invalid synthetic value' using errcode='22023'; end if;
 if f='protectedIdentity' and jsonb_typeof(incoming) is distinct from 'boolean' then raise exception 'Invalid source value' using errcode='22023'; end if;
 select * into p from public.pupils where id=(request->>'pupilId')::uuid;
 if not found then raise exception 'Pupil not found' using errcode='P0002'; end if;
 perform public.phase3_lock_customer(p.customer_id);
 select * into p from public.pupils where id=p.id for update;
 select * into state from public.pupil_field_state where pupil_id=p.id and field=f;
 current_value:=case f when 'displayName' then to_jsonb(p.display_name) when 'personalNumber' then to_jsonb(p.personal_number) else to_jsonb(p.protected_identity) end;
 -- Repeating the same delivery preserves both pending and resolved decisions.
 if state.latest_source_value is not distinct from incoming then
  insert into public.security_events(correlation_id,source,customer_id,action,object_type,object_id,outcome,details)
  values(gen_random_uuid(),'db',p.customer_id,'pupil.source.deliver','pupil',p.id,'ok',jsonb_build_object('field',f,'source','simulated','status','unchanged'));
  return jsonb_build_object('status','unchanged');
 end if;
 next_version:=p.version+1;
 -- Keep a local value until an administrator explicitly decides otherwise.
 -- Different later source deliveries update the same pending conflict identity.
 if incoming is distinct from current_value then
  insert into public.pupil_source_values(customer_id,organizer_id,pupil_id,field,source,actor_id,source_value)
  values(p.customer_id,p.organizer_id,p.id,f,'simulated',null,incoming)
  on conflict(pupil_id,field) where resolved_at is null do update set source_value=excluded.source_value,changed_at=clock_timestamp()
  returning id into conflict_id;
 else
  update public.pupil_source_values set resolved_at=clock_timestamp(),resolution='source' where pupil_id=p.id and field=f and resolved_at is null;
 end if;
 insert into public.pupil_field_state(customer_id,organizer_id,pupil_id,field,source,actor_id,local_correction,revision,writer_source,latest_source_value,local_value,original_source)
 values(p.customer_id,p.organizer_id,p.id,f,'simulated',null,incoming is distinct from current_value,next_version,case when incoming is distinct from current_value then 'manual' else 'simulated' end,incoming,case when incoming is distinct from current_value then current_value end,coalesce(state.original_source,state.source,'manual'))
 on conflict(pupil_id,field) do update set source='simulated',latest_source_value=excluded.latest_source_value,local_value=excluded.local_value,local_correction=excluded.local_correction,writer_source=excluded.writer_source,actor_id=null,changed_at=clock_timestamp(),revision=excluded.revision;
 insert into public.pupil_field_history(customer_id,organizer_id,pupil_id,field,source,actor_id,before_value,after_value,revision)
 values(p.customer_id,p.organizer_id,p.id,f,'simulated',null,state.latest_source_value,incoming,next_version);
 update public.pupils set version=next_version,updated_at=clock_timestamp() where id=p.id;
 insert into public.security_events(correlation_id,source,customer_id,action,object_type,object_id,outcome,details)
 values(gen_random_uuid(),'db',p.customer_id,'pupil.source.deliver','pupil',p.id,'ok',jsonb_build_object('field',f,'source','simulated','status',case when conflict_id is null then 'matched' else 'conflict' end));
 return jsonb_build_object('status',case when conflict_id is null then 'matched' else 'conflict' end);
exception when invalid_text_representation or check_violation or unique_violation then raise exception 'Invalid source delivery' using errcode='22023';
end$$;

create or replace function public.phase4_resolve_source(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; p public.pupils; s public.pupil_source_values; expected integer; choice text; old_value jsonb; next_value jsonb; next_version integer;
begin
 a:=public.phase3_actor();
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId','expectedVersion','kind','payload']);
 perform public.phase4_keys(request->'payload',array['conflictId','choice']);
 if a.function<>'administrator' or a.scope_kind<>'school' then raise exception 'Mutation denied' using errcode='42501'; end if;
 if request->>'kind' is distinct from 'resolve-source' or request->'caseId'<>'null'::jsonb
 or jsonb_typeof(request->'schoolYear') is distinct from 'number' or (request->>'schoolYear')!~'^[0-9]+$' or (request->>'schoolYear')::numeric not between 1 and 9998
 or jsonb_typeof(request->'expectedVersion') is distinct from 'number' or (request->>'expectedVersion')!~'^[0-9]+$' or (request->>'expectedVersion')::numeric not between 1 and 2147483646
 or coalesce(request->'payload'->>'choice','') not in ('local','source') then raise exception 'Invalid resolution' using errcode='22023'; end if;
 select * into p from public.pupils where id=(request->>'pupilId')::uuid and customer_id=a.customer_id and organizer_id=a.organizer_id for update;
 if not found or not exists(select 1 from public.pupil_placements pp join public.mandate_units u on u.unit_id=pp.unit_id and u.assignment_id=a.id where pp.pupil_id=p.id and (pp.ends_on is null or pp.ends_on>=public.app_today()) and (not p.protected_identity or public.phase4_has_protected_permission(a.id,pp.unit_id))) then raise exception 'Pupil not found' using errcode='P0002'; end if;
 select * into s from public.pupil_source_values where id=(request->'payload'->>'conflictId')::uuid and pupil_id=p.id and resolved_at is null;
 if not found then raise exception 'Source conflict not found' using errcode='P0002'; end if;
 if s.field not in ('displayName','personalNumber','protectedIdentity') then raise exception 'Invalid source field' using errcode='22023'; end if;
 choice:=request->'payload'->>'choice'; expected:=(request->>'expectedVersion')::integer;
 if s.field='protectedIdentity' and choice='source' and s.source_value='true'::jsonb and not exists(select 1 from public.pupil_placements pp join public.mandate_units u on u.unit_id=pp.unit_id and u.assignment_id=a.id where pp.pupil_id=p.id and (pp.ends_on is null or pp.ends_on>=public.app_today()) and public.phase4_has_protected_permission(a.id,pp.unit_id)) then raise exception 'Mutation denied' using errcode='42501'; end if;
 if expected>p.version then raise exception 'Invalid version' using errcode='22023'; end if;
 if expected<>p.version then
  if s.field='personalNumber' then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','identity','field','personalNumber')); end if;
  return public.phase4_mutation_conflict(p,jsonb_build_object('kind','fields','fields',jsonb_build_array(jsonb_build_object('field',s.field,'current',case s.field when 'displayName' then to_jsonb(p.display_name) else to_jsonb(p.protected_identity) end,'submitted',case when choice='source' then s.source_value else case s.field when 'displayName' then to_jsonb(p.display_name) else to_jsonb(p.protected_identity) end end))));
 end if;
 old_value:=case s.field when 'displayName' then to_jsonb(p.display_name) when 'personalNumber' then to_jsonb(p.personal_number) else to_jsonb(p.protected_identity) end;
 next_value:=case when choice='source' then s.source_value else old_value end; next_version:=p.version+1;
 if choice='source' then
  update public.pupils set display_name=case when s.field='displayName' then next_value#>>'{}' else display_name end,personal_number=case when s.field='personalNumber' then next_value#>>'{}' else personal_number end,protected_identity=case when s.field='protectedIdentity' then (next_value#>>'{}')::boolean else protected_identity end where id=p.id;
 end if;
 update public.pupil_field_state set writer_source=case when choice='local' then 'manual' else s.source end,actor_id=a.membership_id,changed_at=clock_timestamp(),local_correction=choice='local',local_value=case when choice='local' then old_value end,revision=next_version where pupil_id=p.id and field=s.field;
 insert into public.pupil_field_history(customer_id,organizer_id,pupil_id,field,source,actor_id,before_value,after_value,revision,resolution)
 values(p.customer_id,p.organizer_id,p.id,s.field,case when choice='local' then 'manual' else s.source end,a.membership_id,old_value,next_value,next_version,choice);
 update public.pupil_source_values set resolved_at=clock_timestamp(),resolution=choice where id=s.id;
 update public.pupils set version=next_version,updated_at=clock_timestamp() where id=p.id;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupilId',p.id,'version',next_version,'warnings','[]'::jsonb),'auditRefs',case when p.protected_identity or (s.field='protectedIdentity' and next_value='true'::jsonb) then jsonb_build_array(jsonb_build_object('kind','protected','pupilId',p.id)) else '[]'::jsonb end);
exception when invalid_text_representation or check_violation or unique_violation then raise exception 'Invalid source resolution' using errcode='22023';
end$$;
commit;
