-- SP-11. Publicering pekar på en oföränderlig schemarevision. Stabila klass- och
-- gruppreferenser och daterade passdagar används i elevens snäva studieplansläsning.
create table public.schema_publications (
  id uuid primary key default gen_random_uuid(),
  sequence bigint generated always as identity unique,
  customer_id uuid not null,
  organizer_id uuid not null,
  unit_id uuid not null,
  school_year integer not null check (school_year between 1900 and 2200),
  period text not null check (period in ('lasar','ht','vt')),
  draft_id uuid not null,
  draft_revision integer not null check (draft_revision > 0),
  content_hash text not null check (content_hash ~ '^sha256:[0-9a-f]{64}$'),
  command_id uuid not null unique,
  command_hash bytea not null,
  actor_identity_id uuid not null references public.identities(id),
  assignment_id uuid not null references public.access_assignments(id),
  published_at timestamptz not null default clock_timestamp(),
  unique (draft_id,draft_revision),
  foreign key (draft_id,draft_revision) references public.schema_draft_revisions(draft_id,revision),
  foreign key (draft_id,customer_id,organizer_id) references public.schema_drafts(id,customer_id,organizer_id),
  foreign key (unit_id,organizer_id) references public.school_units(id,organizer_id)
);
create index schema_publications_scope_idx on public.schema_publications
  (unit_id,school_year,period,sequence desc);

create table public.schema_publication_study_tracks (
  publication_id uuid not null references public.schema_publications(id),
  kind text not null check (kind in ('class','group')),
  target_id uuid not null,
  subject_code text not null,
  subject_version integer not null check (subject_version > 0),
  item_code text not null,
  language_code text,
  term text not null check (term in ('ht','vt')),
  days date[] not null check (cardinality(days) between 1 and 366),
  unique nulls not distinct (publication_id,term,subject_code,subject_version,item_code,language_code,kind,target_id)
);

alter table public.schema_publications enable row level security;
alter table public.schema_publications force row level security;
alter table public.schema_publication_study_tracks enable row level security;
alter table public.schema_publication_study_tracks force row level security;
revoke all on public.schema_publications,public.schema_publication_study_tracks
  from public,anon,authenticated,service_role,skolplattform_worker;
create trigger schema_publications_immutable before update or delete or truncate on public.schema_publications
  for each statement execute function public.elective_time_immutable();
create trigger schema_publication_study_tracks_immutable before update or delete or truncate on public.schema_publication_study_tracks
  for each statement execute function public.elective_time_immutable();

create function public.schema_publication_invalid() returns void
language plpgsql immutable set search_path=pg_catalog as $$
begin
  raise exception 'Invalid schema publication' using errcode='22023',hint='schema_publication_invalid';
end $$;

create function public.schema_publication_json(p public.schema_publications) returns jsonb
language sql stable set search_path=pg_catalog as $$
  select jsonb_build_object('publication',case when p.id is not null then jsonb_build_object(
    'id',p.id,'unitId',p.unit_id,'schoolYear',p.school_year,'period',p.period,'draftId',p.draft_id,
    'revision',p.draft_revision,'contentHash',p.content_hash,
    'publishedAt',to_char(p.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) end)
$$;

create function public.schema_publication(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  action text:=input->>'action';
  args text[]:=array['action','unitId','schoolYear','period'];
  request_unit uuid;
  request_year integer;
  request_period text;
  request_draft uuid;
  request_revision integer;
  request_hash text;
  request_command uuid;
  command_hash bytea;
  actor public.access_assignments;
  session public.app_sessions;
  identity public.identities;
  draft public.schema_drafts;
  revision public.schema_draft_revisions;
  publication public.schema_publications;
  track jsonb;
  track_kind text;
  track_target uuid;
  track_term text;
  track_days date[];
  sub_code text;
  sub_version integer;
  item text;
  lang text;
  ht_days date[];
  vt_days date[];
begin
  if action in ('receipt','publish') then
    args:=args||array['draftId','revision','contentHash','commandId'];
  end if;
  if action='publish' then args:=args||array['sourceHash','tracks'];end if;
  perform public.phase4_keys(input,args);
  if action is null or action not in ('status','receipt','publish')
    or not coalesce(public.phase5_programplan_integer(input->'schoolYear',1900,2200),false)
    or input->>'period' is null or input->>'period' not in ('lasar','ht','vt') then
    perform public.schema_publication_invalid();
  end if;
  request_unit:=public.tjanst_uuid(input->'unitId');
  request_year:=(input->>'schoolYear')::integer;
  request_period:=input->>'period';
  actor:=public.schema_draft_actor(request_unit);
  if actor.scope_kind is distinct from 'school' or (action<>'status' and actor.function<>'rektor') then
    raise exception 'Schema publication denied' using errcode='42501';
  end if;

  if action='status' then
    select p.* into publication
    from public.schema_publications p
    where (p.customer_id,p.organizer_id,p.unit_id,p.school_year,p.period)
      =(actor.customer_id,actor.organizer_id,request_unit,request_year,request_period)
    order by p.sequence desc limit 1;
    return public.schema_publication_json(publication);
  end if;

  if not coalesce(public.phase5_programplan_integer(input->'revision',1,2147483647),false)
    or not coalesce(input->>'contentHash' ~ '^sha256:[0-9a-f]{64}$',false) then
    perform public.schema_publication_invalid();
  end if;
  request_draft:=public.tjanst_uuid(input->'draftId');
  request_revision:=(input->>'revision')::integer;
  request_hash:=input->>'contentHash';
  request_command:=public.tjanst_uuid(input->'commandId');
  session:=public.phase5_programplan_session_check();
  if action='publish' then
    if not coalesce(input->>'sourceHash' ~ '^sha256:[0-9a-f]{64}$',false)
      or jsonb_typeof(input->'tracks') is distinct from 'array'
      or jsonb_array_length(input->'tracks')>20000 or octet_length((input->'tracks')::text)>8388608 then
      perform public.schema_publication_invalid();
    end if;
    command_hash:=extensions.digest(convert_to(input::text,'UTF8'),'sha256');
    -- Samma låsordning som schema_command: kund, kommandots ID, utkastets omfång.
    perform pg_advisory_xact_lock(hashtextextended(request_command::text,6120));
  end if;
  select p.* into publication from public.schema_publications p where p.command_id=request_command;
  if found then
    if (publication.customer_id,publication.organizer_id,publication.unit_id,publication.school_year,
        publication.period,publication.actor_identity_id,publication.assignment_id,publication.draft_id,
        publication.draft_revision,publication.content_hash)
      is distinct from (actor.customer_id,actor.organizer_id,request_unit,request_year,request_period,
        session.identity_id,actor.id,request_draft,request_revision,request_hash)
      or (action='publish' and publication.command_hash is distinct from command_hash) then
      raise exception 'Schema publication command changed' using errcode='40001',hint='schema_publication_command_conflict';
    end if;
    return public.schema_publication_json(publication);
  end if;
  if action='receipt' then return public.schema_publication_json(null);end if;

  perform pg_advisory_xact_lock(hashtextextended(request_unit::text||':'||request_year::text||':'||request_period,6117));
  select d.* into draft from public.schema_drafts d
  where (d.customer_id,d.organizer_id,d.unit_id,d.school_year,d.period)
    =(actor.customer_id,actor.organizer_id,request_unit,request_year,request_period)
  for update;
  if draft.id is distinct from request_draft or draft.revision is distinct from request_revision then
    raise exception 'Schema draft changed' using errcode='40001',hint='schema_publication_draft_changed';
  end if;
  select r.* into revision from public.schema_draft_revisions r
  where r.draft_id=draft.id and r.revision=draft.revision;
  if revision.content_hash is distinct from request_hash or revision.source_hash is distinct from input->>'sourceHash' then
    raise exception 'Schema draft changed' using errcode='40001',hint='schema_publication_draft_changed';
  end if;
  if exists(select 1 from public.schema_publications p where p.draft_id=draft.id and p.draft_revision=draft.revision) then
    raise exception 'Schema revision already published' using errcode='40001',hint='schema_publication_already_published';
  end if;
  if revision.document->'requiresRecalculation' is distinct from 'false'::jsonb
    or revision.document->'intentional' is distinct from '[]'::jsonb
    or revision.document#>'{base,metrics,unplaced}' is distinct from '0'::jsonb
    or revision.document#>'{control,total}' is distinct from '0'::jsonb
    or not coalesce(public.phase5_programplan_integer(revision.document#>'{base,metrics,placed}',1,20000),false)
    or jsonb_typeof(revision.document#>'{base,time,calendar,days}') is distinct from 'array' then
    raise exception 'Schema publication requires a checked draft' using errcode='40001',hint='schema_publication_not_ready';
  end if;
  select array_agg((d->>'date')::date) filter (where d->>'term'='ht'),
    array_agg((d->>'date')::date) filter (where d->>'term'='vt')
    into ht_days,vt_days
  from jsonb_array_elements(revision.document#>'{base,time,calendar,days}') d
  where d->'schoolDay'='true'::jsonb;
  if (request_period in ('ht','lasar') and ht_days is null)
    or (request_period in ('vt','lasar') and vt_days is null) then
    raise exception 'Schema publication requires calendar days' using errcode='40001',hint='schema_publication_not_ready';
  end if;

  insert into public.schema_publications(customer_id,organizer_id,unit_id,school_year,period,draft_id,draft_revision,
    content_hash,command_id,command_hash,actor_identity_id,assignment_id)
  values(actor.customer_id,actor.organizer_id,request_unit,request_year,request_period,draft.id,draft.revision,
    request_hash,request_command,command_hash,session.identity_id,actor.id)
  returning * into publication;

  begin
    for track in select value from jsonb_array_elements(input->'tracks') loop
      perform public.phase4_keys(track,array['kind','targetId','subjectCode','subjectVersion','itemCode','languageCode','term','days']);
      track_kind:=track->>'kind';
      track_term:=track->>'term';
      track_target:=public.tjanst_uuid(track->'targetId');
      if track_kind is null or track_kind not in ('class','group') or track_term is null or track_term not in ('ht','vt')
        or (request_period<>'lasar' and request_period<>track_term)
        or not coalesce(public.phase5_programplan_code(track->'subjectCode'),false)
        or not coalesce(public.phase5_programplan_code(track->'itemCode'),false)
        or not coalesce(public.phase5_programplan_integer(track->'subjectVersion',1,2147483647),false)
        or (track->'languageCode' is distinct from 'null'::jsonb and not coalesce(public.phase5_programplan_code(track->'languageCode'),false))
        or jsonb_typeof(track->'days') is distinct from 'array'
        or jsonb_array_length(track->'days') not between 1 and 366 then
        perform public.schema_publication_invalid();
      end if;
      sub_code:=track->>'subjectCode';sub_version:=(track->>'subjectVersion')::integer;
      item:=track->>'itemCode';lang:=track->>'languageCode';
      select array_agg(distinct day order by day) into track_days
        from (select public.study_group_date(value) as day from jsonb_array_elements(track->'days')) d;
      if cardinality(track_days)<>jsonb_array_length(track->'days')
        or not coalesce(track_days <@ case track_term when 'ht' then ht_days else vt_days end,false)
        or track_days[1]<make_date(request_year,7,1)
        or track_days[cardinality(track_days)]>make_date(request_year+1,6,30)
        or (track_kind='class' and not exists (
          select 1 from public.school_classes c
          where (c.id,c.customer_id,c.organizer_id,c.unit_id)=(track_target,actor.customer_id,actor.organizer_id,request_unit)))
        or (track_kind='group' and not exists (
          select 1 from public.study_groups g
          where (g.id,g.organizer_id,g.unit_id,g.school_year)=(track_target,actor.organizer_id,request_unit,request_year)
            and g.active and (g.subject_code,g.subject_version,g.item_code,g.language_code)
              is not distinct from (sub_code,sub_version,item,lang)
            and g.starts_on<=track_days[1] and g.ends_on>=track_days[cardinality(track_days)])) then
        perform public.schema_publication_invalid();
      end if;
      insert into public.schema_publication_study_tracks
        values(publication.id,track_kind,track_target,sub_code,sub_version,item,lang,track_term,track_days);
    end loop;
  exception when unique_violation then
    perform public.schema_publication_invalid();
  end;

  select * into strict identity from public.identities i where i.id=session.identity_id;
  begin
    insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,
      session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
    values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',identity.id,identity.issuer,identity.subject,
      session.id,actor.membership_id,actor.id,actor.customer_id,'schema_published','schema_publication',publication.id,'ok',
      jsonb_build_object('unitId',request_unit,'schoolYear',request_year,'period',request_period,'draftId',draft.id,'revision',draft.revision));
  exception when others then
    raise exception 'Schema publication audit unavailable' using errcode='55000';
  end;
  return public.schema_publication_json(publication);
end $$;

-- Elevkortet läser bara kalenderbesked för sina egna rader. Planen står kvar som
-- den är. Års- och terminsversioner kan ersätta varandra per termin.
create function public.schema_study_schedule(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare
  actor public.access_assignments;
  placement public.pupil_placements;
  plan_content jsonb;
  on_day date;
  result jsonb;
begin
  perform public.phase4_keys(input,array['contractVersion','unitId','pupilId','placementId','planId','revision','on']);
  if not coalesce(public.phase5_programplan_integer(input->'revision',1,2147483647),false) then
    perform public.individual_study_plan_invalid();
  end if;
  actor:=public.elective_staff_scope(public.tjanst_uuid(input->'unitId'));
  placement:=public.individual_study_plan_scope(input,actor);
  on_day:=public.study_group_date(input->'on');
  select r.content into plan_content
  from public.individual_study_plans p
  join public.individual_study_plan_revisions r on r.plan_id=p.id and r.revision=(input->>'revision')::integer
  where p.id=public.tjanst_uuid(input->'planId')
    and (p.placement_id,p.pupil_id,p.unit_id,p.customer_id)=(placement.id,placement.pupil_id,placement.unit_id,placement.customer_id);
  if not found then
    raise exception 'Study schedule denied' using errcode='42501';
  end if;

  with publications as materialized (
    select distinct on (p.school_year,terms.term) p.id,p.school_year,terms.term
    from public.schema_publications p
    cross join (values('ht'),('vt')) terms(term)
    where (p.customer_id,p.organizer_id,p.unit_id)=(placement.customer_id,placement.organizer_id,placement.unit_id)
      and (p.period='lasar' or p.period=terms.term)
      and make_date(p.school_year+1,6,30)>=placement.starts_on
      and make_date(p.school_year,7,1)<=coalesce(placement.ends_on,'infinity'::date)
    order by p.school_year,terms.term,p.sequence desc
  ),
  levels as (
    select l->>'id' as level_id,l#>>'{attempts,0,id}' as attempt_id,l->>'subjectCode' as subject_code,
      (l->>'subjectVersion')::integer as subject_version,l->>'itemCode' as item_code,l->>'languageCode' as language_code
    from jsonb_array_elements(plan_content->'levels') l
    where l->>'kind'='gy25_level' and jsonb_array_length(l->'attempts')=1
  ),
  matches as (
    select l.level_id,l.attempt_id,p.school_year,t.term,t.kind,t.target_id,t.days
    from levels l
    join public.schema_publication_study_tracks t on
      (t.subject_code,t.subject_version,t.item_code)=(l.subject_code,l.subject_version,l.item_code)
      and t.language_code is not distinct from l.language_code
    join publications p on p.id=t.publication_id and p.term=t.term
  ),
  memberships as (
    select m.level_id,m.attempt_id,m.school_year,m.term,m.days,cm.starts_on,cm.ends_on
    from matches m
    join public.pupil_class_memberships cm on m.kind='class' and cm.class_id=m.target_id
      and (cm.placement_id,cm.pupil_id,cm.unit_id)=(placement.id,placement.pupil_id,placement.unit_id)
    union all
    select m.level_id,m.attempt_id,m.school_year,m.term,m.days,
      greatest(g.starts_on,gm.starts_on),least(g.ends_on,gm.ends_on)
    from matches m
    join public.study_groups g on m.kind='group' and g.id=m.target_id and g.unit_id=placement.unit_id
      and g.organizer_id=placement.organizer_id and g.school_year=m.school_year and g.active
    join public.study_group_memberships gm on gm.group_id=g.id and gm.unit_id=g.unit_id
      and gm.pupil_id=placement.pupil_id and gm.cancelled_at is null
    -- Gruppmedlemskapet har ingen egen placeringsnyckel. En delad intervall-
    -- koppling är därför otydlig även om den valda passdagen överlappar.
    where gm.starts_on>=placement.starts_on and gm.ends_on<=coalesce(placement.ends_on,'infinity'::date)
      and not exists (
        select 1 from public.pupil_placements competing where competing.pupil_id=placement.pupil_id
          and competing.unit_id=placement.unit_id and competing.id<>placement.id
          and daterange(competing.starts_on,competing.ends_on,'[]') && daterange(gm.starts_on,gm.ends_on,'[]'))
  ),
  track_days as (
    select m.level_id,m.attempt_id,m.school_year,m.term,min(d.day) as first_day,max(d.day) as last_day,
      on_day between m.starts_on and coalesce(m.ends_on,'infinity'::date) as on_member
    from memberships m cross join lateral unnest(m.days) d(day)
    where d.day between greatest(placement.starts_on,m.starts_on) and
      least(coalesce(placement.ends_on,'infinity'::date),coalesce(m.ends_on,'infinity'::date))
    group by m.level_id,m.attempt_id,m.school_year,m.term,m.starts_on,m.ends_on
  ),
  projected as (
    select level_id,attempt_id,min(first_day) as first_pass_on,
      bool_or(on_member and on_day between first_day and last_day) as scheduled_now
    from track_days group by level_id,attempt_id
  )
  select coalesce(jsonb_agg(jsonb_build_object('levelId',level_id,'attemptId',attempt_id,
    'firstPassOn',first_pass_on,'scheduledNow',scheduled_now) order by level_id,attempt_id),'[]'::jsonb)
  into result from projected;
  return result;
end $$;

revoke all on function public.schema_publication_invalid(),public.schema_publication_json(public.schema_publications),
  public.schema_publication(jsonb),public.schema_study_schedule(jsonb)
  from public,anon,authenticated,service_role,skolplattform_worker;
grant execute on function public.schema_publication(jsonb),public.schema_study_schedule(jsonb) to skolplattform_worker;
