-- Läs bara den revision som omedelbart föregick en uttrycklig rensning i samma utkast.
create index schema_draft_commands_draft_revision_idx on public.schema_draft_commands(draft_id,expected_revision);

create function public.schema_reset_previous(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
 q jsonb;
 a public.access_assignments;
 s public.app_sessions;
 d public.schema_drafts;
 requested_draft uuid;
 expected integer;
 previous_revision integer;
 previous_draft jsonb;
begin
 q:=public.schema_draft_scope(input,array['draftId','expectedRevision','includeDraft']);
 if jsonb_typeof(input->'draftId') is distinct from 'string'
   or not coalesce((input->>'draftId')~'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$',false)
   or not coalesce(public.phase5_programplan_integer(input->'expectedRevision',1,2147483647),false)
   or jsonb_typeof(input->'includeDraft') is distinct from 'boolean' then
  raise exception 'Invalid schema reset reference' using errcode='22023',hint='schema_draft_invalid';
 end if;
 requested_draft:=(input->>'draftId')::uuid;
 expected:=(input->>'expectedRevision')::integer;
 a:=public.schema_draft_actor((q->>'unitId')::uuid);
 s:=public.phase5_programplan_session_check();
 select * into d from public.schema_drafts x
 where x.unit_id=(q->>'unitId')::uuid and x.school_year=(q->>'schoolYear')::integer and x.period=q->>'period';
 if found and (d.customer_id,d.organizer_id) is distinct from (a.customer_id,a.organizer_id) then
  raise exception 'Schema draft denied' using errcode='42501';
 end if;

 if d.id=requested_draft and d.revision=expected and expected>1 then
  select previous.revision into previous_revision
  from public.schema_draft_commands r
  join public.schema_draft_revisions head on head.draft_id=r.draft_id and head.revision=r.expected_revision+1
  join public.schema_draft_revisions previous on previous.draft_id=r.draft_id and previous.revision=r.expected_revision
  where r.draft_id=d.id and r.requested_draft_id=d.id and r.expected_revision=expected-1
   and (r.customer_id,r.organizer_id,r.unit_id,r.school_year,r.period)=(d.customer_id,d.organizer_id,d.unit_id,d.school_year,d.period)
   and (r.actor_identity_id,r.assignment_id,r.document_hash)=(head.actor_identity_id,head.assignment_id,head.content_hash)
   and head.document->'base'='null'::jsonb and head.document->'basisVillkor'='null'::jsonb and head.document->'placements'='[]'::jsonb
   and jsonb_typeof(previous.document->'base')='object' and jsonb_array_length(previous.document->'placements')>0
   and r.request_hash=public.schema_draft_hash(jsonb_build_object(
    'operation','schema_draft_reset_v1','contractVersion',1,'unitId',q->'unitId','schoolYear',q->'schoolYear','period',q->'period',
    'commandId',r.command_id,'draftId',d.id,'expectedRevision',r.expected_revision,'action','clear'));
 end if;

 perform public.schema_draft_audit('schema_draft_read',d.id,jsonb_build_object(
  'unitId',q->'unitId','schoolYear',q->'schoolYear','revision',previous_revision,'includeDraft',input->'includeDraft'));
 if previous_revision is not null and (input->>'includeDraft')::boolean then
  d.revision:=previous_revision;
  previous_draft:=public.schema_draft_json(d);
 end if;
 return jsonb_build_object('contractVersion','schema_draft_sql_v1',
  'actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('previousRevision',previous_revision,'draft',previous_draft));
end $$;

revoke all on function public.schema_reset_previous(jsonb) from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.schema_reset_previous(jsonb) to skolplattform_worker;
