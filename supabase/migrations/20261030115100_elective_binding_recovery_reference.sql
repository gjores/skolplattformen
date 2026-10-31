-- Recovery carries only a command reference; account/source attestation payload remains server-side.
begin;
create or replace function public.elective_binding_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;c public.elective_binding_commands;
begin
 perform public.phase4_keys(input,array['unitId','pupilId','commandId','action','payloadHash']);
 if input->>'action' not in ('save_binding','revoke_binding') or jsonb_typeof(input->'payloadHash')<>'string' or input->>'payloadHash'!~'^[a-f0-9]{64}$' then raise exception 'Invalid binding reference' using errcode='22023';end if;
 a:=public.elective_binding_scope((input->>'unitId')::uuid,(input->>'pupilId')::uuid);s:=public.phase5_programplan_session_check();
 select * into c from public.elective_binding_commands where id=(input->>'commandId')::uuid;
 if found and (c.customer_id<>a.customer_id or c.unit_id<>(input->>'unitId')::uuid or c.pupil_id<>(input->>'pupilId')::uuid or c.actor_identity_id<>s.identity_id or c.actor_assignment_id<>a.id
  or c.request->>'action'<>input->>'action' or substring(public.tjanst_hash(c.request) from 8)<>input->>'payloadHash') then raise exception 'Binding reference changed' using errcode='40001',hint='elective_binding_conflict';end if;
 perform public.elective_binding_audit('elective_binding_status',(input->>'commandId')::uuid,(input->>'unitId')::uuid);
 if c.id is null then return jsonb_build_object('status','not_found','commandId',input->>'commandId');end if;return c.result;
end $$;
commit;
