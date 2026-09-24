-- Avgränsad lokal IT-administration; inga externa anrop eller elevuppgifter.
create function public.phase3_connection(p_unit_id uuid, p_operation text default 'read', p_enabled boolean default null, p_expected_version integer default null)
returns jsonb language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare actor public.access_assignments; config public.local_connection_configs; current_version integer;
begin
  actor:=public.phase3_actor();
  if actor.function <> 'it' then raise exception 'Denied' using errcode='42501'; end if;
  if not exists(select 1 from public.mandate_units u where u.assignment_id=actor.id and u.unit_id=p_unit_id) then
    raise exception 'Not found' using errcode='P0002';
  end if;
  if p_operation is null or p_operation not in ('read','update','test') then raise exception 'Bad operation' using errcode='22023'; end if;
  select * into config from public.local_connection_configs where unit_id=p_unit_id for update;
  current_version:=coalesce(config.version,0);
  if p_operation='update' then
    if p_enabled is null or p_expected_version is null or p_expected_version<0 then raise exception 'Bad input' using errcode='22023'; end if;
    if current_version<>p_expected_version then raise exception 'Version conflict' using errcode='40001'; end if;
    insert into public.local_connection_configs(customer_id,organizer_id,unit_id,enabled,version,updated_by_assignment_id)
      values(actor.customer_id,actor.organizer_id,p_unit_id,p_enabled,current_version+1,actor.id)
      on conflict(unit_id) do update set enabled=excluded.enabled,version=excluded.version,
        updated_by_assignment_id=excluded.updated_by_assignment_id,updated_at=statement_timestamp()
      returning * into config;
  end if;
  return jsonb_build_object('unitId',p_unit_id,'enabled',coalesce(config.enabled,false),'version',coalesce(config.version,0),
    'result',case when p_operation='test' then case when coalesce(config.enabled,false) then 'synthetic_ok' else 'paused' end else null end);
end $$;
revoke all on function public.phase3_connection(uuid,text,boolean,integer) from public,anon,authenticated,skolplattform_worker;
