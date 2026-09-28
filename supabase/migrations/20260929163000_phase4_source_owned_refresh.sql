-- Preserve local corrections; refresh fields explicitly adopted from source.
begin;
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
 -- A field explicitly adopted from the source follows that source. Only a
 -- manual field or an explicit local correction requires a new decision.
 if state.source='simulated' and not state.local_correction then
  update public.pupils set display_name=case when f='displayName' then incoming#>>'{}' else display_name end,
   personal_number=case when f='personalNumber' then incoming#>>'{}' else personal_number end,
   protected_identity=case when f='protectedIdentity' then (incoming#>>'{}')::boolean else protected_identity end where id=p.id;
  current_value:=incoming;
 end if;
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

create or replace function public.phase4_pupil_history(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record; entries jsonb; total integer; page_number integer;
begin
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId','page']);
 if jsonb_typeof(request->'page') is distinct from 'number' or (request->>'page')!~'^[0-9]+$' or (request->>'page')::numeric<1 or (request->>'page')::numeric>2147483647 then raise exception 'Invalid page' using errcode='22023'; end if;
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request-'page');
 if a.function<>'administrator' or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 page_number:=(request->>'page')::integer;
 select count(*) into total from public.pupil_field_history h where h.pupil_id=r.pupil_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'field',h.field,'before',public.phase4_history_value(h.field,h.before_value,r.unit_id),'after',public.phase4_history_value(h.field,h.after_value,r.unit_id),'resolution',h.resolution,'changedBy',h.actor_id,'changedAt',h.changed_at,'origin',jsonb_build_object('source',h.source,'actorId',h.actor_id,'changedAt',h.changed_at,'localCorrection',exists(select 1 from public.pupil_field_state fs where fs.pupil_id=h.pupil_id and fs.field=h.field and fs.revision=h.revision and fs.local_correction)))order by h.changed_at desc,h.id),'[]') into entries
 from(select * from public.pupil_field_history h where h.pupil_id=r.pupil_id order by h.changed_at desc,h.id limit 20 offset(page_number::bigint-1)*20)h;
 return jsonb_build_object('kind','success','body',jsonb_build_object('entries',entries,'count',total,'page',page_number,'pageSize',20),'auditRefs',r.audit_refs);
end$$;
commit;
