-- VB-06. Frozen offerings and pupil-owned choices. Planned groups remain independent of pupil selections.
begin;
-- Offering identity excludes mutable group organisation/forecast counts.
create function public.elective_offering_hash(block uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select substring(public.tjanst_hash(jsonb_build_array('elective_offer_v1',b.id,b.kind,b.name,b.starts_on,b.ends_on,
  coalesce((select jsonb_agg(x.source_ref order by x.source_key collate "C") from public.elective_block_sources x where x.block_id=b.id and x.active),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'subjectCode',o.subject_code,'levelCode',o.level_code,'language',o.language,'points',o.points) order by o.id) from public.elective_options o where o.block_id=b.id and o.active),'[]'::jsonb))) from 8)
 from public.elective_blocks b where b.id=block
$$;
create table public.elective_rounds (
 id uuid primary key,block_id uuid not null references public.elective_blocks(id),unit_id uuid not null references public.school_units(id),
 school_year integer not null,customer_id uuid not null references public.customers(id),organizer_id uuid not null references public.organizers(id),
 block_revision integer not null check(block_revision>0),revision integer not null default 1 check(revision>0),offering_revision integer not null check(offering_revision>0),
 policy_revision integer not null check(policy_revision>0),guardian_confirmation boolean not null,
 opens_at timestamptz not null,closes_at timestamptz not null check(closes_at>opens_at),status text not null check(status in ('open','closed')),
 min_choices integer not null check(min_choices>=0),max_choices integer not null check(max_choices between 1 and 100 and max_choices>=min_choices),
 option_ids uuid[] not null check(cardinality(option_ids)>0),pupil_ids uuid[] not null check(cardinality(pupil_ids)>0),offer_snapshot jsonb not null,offer_hash text not null check(offer_hash~'^[0-9a-f]{64}$'),time_sources jsonb not null
);
create table public.elective_choices (
 id uuid primary key,round_id uuid not null references public.elective_rounds(id),pupil_id uuid not null references public.pupils(id),
 offering_revision integer not null check(offering_revision>0),revision integer not null default 1 check(revision>0),selected_option_ids uuid[] not null,
 submitted_at timestamptz not null default clock_timestamp(),confirmed_at timestamptz,submitted_by_identity_id uuid not null references public.identities(id),
 submitted_by_binding_id uuid references public.elective_participant_bindings(id),recorded_by_assignment_id uuid references public.access_assignments(id),
 unique(round_id,pupil_id)
);
create table public.elective_choice_history (
 choice_id uuid not null references public.elective_choices(id),revision integer not null,body jsonb not null,recorded_at timestamptz not null default clock_timestamp(),
 primary key(choice_id,revision)
);
create table public.elective_guardian_confirmations (
 id uuid primary key,binding_id uuid not null references public.elective_participant_bindings(id),binding_revision integer not null,
 choice_id uuid not null references public.elective_choices(id),choice_revision integer not null,offering_revision integer not null,
 decision text not null check(decision in ('approve','decline')),decided_at timestamptz not null default clock_timestamp(),
 unique(binding_id,binding_revision,choice_id,choice_revision,offering_revision)
);
create table public.elective_self_commands (
 command_id uuid primary key,unit_id uuid not null,pupil_id uuid not null,participant text not null check(participant in ('pupil','guardian')),
 actor_identity_id uuid not null references public.identities(id),binding_id uuid not null references public.elective_participant_bindings(id),
 action text not null,payload_hash text not null check(payload_hash~'^[0-9a-f]{64}$'),request jsonb not null,result jsonb not null,created_at timestamptz not null default clock_timestamp()
);
create index elective_rounds_school on public.elective_rounds(unit_id,school_year);
create index elective_choices_pupil on public.elective_choices(pupil_id,round_id);
do $$declare n text;begin foreach n in array array['elective_rounds','elective_choices','elective_choice_history','elective_guardian_confirmations','elective_self_commands'] loop
 execute format('alter table public.%I enable row level security',n);execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,skolplattform_worker',n);
end loop;end$$;

create function public.elective_round_json(r public.elective_rounds,include_pupils boolean default false) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'blockId',r.block_id,'blockRevision',r.block_revision,'revision',r.revision,'offeringRevision',r.offering_revision,
 'policyRevision',r.policy_revision,'guardianConfirmation',r.guardian_confirmation,'opensAt',to_char(r.opens_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'closesAt',to_char(r.closes_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'status',r.status,'minChoices',r.min_choices,'maxChoices',r.max_choices,'optionIds',to_jsonb(r.option_ids))
 ||case when include_pupils then jsonb_build_object('pupilIds',to_jsonb(r.pupil_ids)) else '{}'::jsonb end
$$;
create function public.elective_round_eligible(r public.elective_rounds,pupil uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select pupil=any(r.pupil_ids) and exists(
 select 1 from public.pupil_placements pp join public.pupil_class_memberships cm on cm.placement_id=pp.id and cm.pupil_id=pp.pupil_id
 join public.elective_block_sources src on src.block_id=r.block_id and src.class_id=cm.class_id and src.active
 where pp.pupil_id=pupil and pp.customer_id=r.customer_id and pp.organizer_id=r.organizer_id and pp.unit_id=r.unit_id
 and pp.starts_on<=(r.offer_snapshot->>'endsOn')::date and (pp.ends_on is null or pp.ends_on>=(r.offer_snapshot->>'startsOn')::date)
 and cm.starts_on<=(r.offer_snapshot->>'endsOn')::date and (cm.ends_on is null or cm.ends_on>=(r.offer_snapshot->>'startsOn')::date))
$$;
create function public.elective_assert_current_round(r public.elective_rounds) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare b public.elective_blocks;
begin
 select * into b from public.elective_blocks where id=r.block_id and unit_id=r.unit_id for share;
 if not found or b.offering_revision<>r.offering_revision or public.elective_offering_hash(b.id)<>r.offer_hash then raise exception 'Offering changed' using errcode='40001',hint='elective_stale_offer';end if;
 perform public.elective_check_block_sources(b.id);
end $$;
create function public.elective_choice_state(c public.elective_choices) returns text
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare r public.elective_rounds;b public.elective_blocks;g record;found_required boolean:=false;waiting boolean:=false;d text;
begin
 select * into r from public.elective_rounds where id=c.round_id;select * into b from public.elective_blocks where id=r.block_id;
 if c.offering_revision<>r.offering_revision or b.offering_revision<>r.offering_revision or public.elective_offering_hash(b.id)<>r.offer_hash then return 'stale_offer';end if;
 begin perform public.elective_check_block_sources(b.id);exception when serialization_failure then return 'stale_offer';end;
 if r.guardian_confirmation then
  for g in select x.* from public.elective_participant_bindings x where x.pupil_id=c.pupil_id and x.unit_id=r.unit_id and x.participant='guardian'
   and x.confirmation_required and x.revoked_at is null and x.starts_on<=public.app_today() and (x.ends_on is null or x.ends_on>=public.app_today()) order by x.id loop
   found_required:=true;select decision into d from public.elective_guardian_confirmations gc where gc.binding_id=g.id and gc.binding_revision=g.revision
    and gc.choice_id=c.id and gc.choice_revision=c.revision and gc.offering_revision=c.offering_revision;
   if d='decline' then return 'guardian_declined';end if;if d is distinct from 'approve' then waiting:=true;end if;
  end loop;
  if not found_required then return 'guardian_bindings_missing';end if;if waiting then return 'awaiting_guardian';end if;
 end if;
 if c.confirmed_at is not null then return 'confirmed';end if;return 'ready_for_confirmation';
end $$;
create function public.elective_choice_json(c public.elective_choices) returns jsonb
language sql volatile security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',c.id,'roundId',c.round_id,'pupilId',c.pupil_id,'offeringRevision',c.offering_revision,'revision',c.revision,
 'selectedOptionIds',to_jsonb(c.selected_option_ids),'submittedAt',to_char(c.submitted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
 'confirmedAt',case when c.confirmed_at is null then null else to_char(c.confirmed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end,'state',public.elective_choice_state(c))
$$;
create function public.elective_record_choice(r public.elective_rounds,pupil uuid,offer integer,expected integer,selected uuid[],actor uuid,binding uuid,assignment uuid) returns public.elective_choices
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare c public.elective_choices;
begin
 perform public.elective_assert_current_round(r);
 if r.status<>'open' or clock_timestamp()<r.opens_at or clock_timestamp()>r.closes_at then raise exception 'Choice window closed' using errcode='40001',hint='elective_round_closed';end if;
 if offer<>r.offering_revision or not public.elective_round_eligible(r,pupil) then raise exception 'Choice not eligible' using errcode='42501';end if;
 if cardinality(selected)<r.min_choices or cardinality(selected)>r.max_choices or not selected<@r.option_ids or cardinality(selected)<>(select count(distinct x) from unnest(selected)x) then raise exception 'Invalid choices' using errcode='22023';end if;
 if exists(select 1 from public.elective_options o where o.id=any(selected) and o.block_id=r.block_id and not exists(
  select 1 from public.elective_block_sources src join public.pupil_class_memberships cm on cm.class_id=src.class_id and cm.pupil_id=pupil
   join public.pupil_placements pp on pp.id=cm.placement_id
  where src.block_id=r.block_id and src.active and src.source_ref->'allowedOptionCodes' ? o.level_code
   and pp.unit_id=r.unit_id and pp.starts_on<=(r.offer_snapshot->>'endsOn')::date and (pp.ends_on is null or pp.ends_on>=(r.offer_snapshot->>'startsOn')::date)
   and cm.starts_on<=(r.offer_snapshot->>'endsOn')::date and (cm.ends_on is null or cm.ends_on>=(r.offer_snapshot->>'startsOn')::date))) then raise exception 'Option not in pupil study path' using errcode='42501';end if;

 select * into c from public.elective_choices where round_id=r.id and pupil_id=pupil for update;
 if (c.id is null and expected is not null) or (c.id is not null and c.revision is distinct from expected) then raise exception 'Choice changed' using errcode='40001',hint='elective_choice_conflict';end if;
 if c.id is null then
  insert into public.elective_choices(id,round_id,pupil_id,offering_revision,selected_option_ids,submitted_by_identity_id,submitted_by_binding_id,recorded_by_assignment_id)
  values(gen_random_uuid(),r.id,pupil,offer,selected,actor,binding,assignment) returning * into c;
 else
  insert into public.elective_choice_history(choice_id,revision,body) values(c.id,c.revision,public.elective_choice_json(c));
  update public.elective_choices set selected_option_ids=selected,offering_revision=offer,revision=revision+1,submitted_at=clock_timestamp(),confirmed_at=null,
   submitted_by_identity_id=actor,submitted_by_binding_id=binding,recorded_by_assignment_id=assignment where id=c.id returning * into c;
 end if;
 return c;
end $$;

-- Called only by the staff wrapper, which owns global school revision, command journal and audit.
create or replace function public.elective_round_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;st public.elective_school_state;b public.elective_blocks;r public.elective_rounds;c public.elective_choices;
 unit uuid;year integer;p jsonb;pid uuid;target uuid;opts uuid[];pupils uuid[];snap jsonb;ht integer;vt integer;basis text;
begin
 unit:=(input->>'unitId')::uuid;year:=(input->>'schoolYear')::integer;a:=public.elective_staff_scope(unit);s:=public.phase5_programplan_session_check();st:=public.elective_lock_school(unit);p:=input->'payload';
 if input->>'action'='open_round' then
  perform public.phase4_keys(p,array['roundId','blockId','expectedBlockRevision','opensAt','closesAt','minChoices','maxChoices','pupilIds']);
  select * into b from public.elective_blocks where id=(p->>'blockId')::uuid and unit_id=unit and school_year=year for update;
  if not found or b.revision<>(p->>'expectedBlockRevision')::integer then raise exception 'Block changed' using errcode='40001',hint='elective_stale_offer';end if;
  if st.guardian_confirmation is null then raise exception 'School policy not selected' using errcode='40001',hint='elective_policy_missing';end if;
  perform public.elective_check_block_sources(b.id);
  select array_agg(o.id order by o.id) into opts from public.elective_options o where o.block_id=b.id and o.active;
  select array_agg(x::uuid order by x) into pupils from jsonb_array_elements_text(p->'pupilIds') x;
  if opts is null or pupils is null or cardinality(pupils)<>(select count(distinct x) from unnest(pupils)x) or cardinality(pupils)>2000
   or (p->>'opensAt')::timestamptz>=(p->>'closesAt')::timestamptz or (p->>'minChoices')::integer<>1 or (p->>'maxChoices')::integer<>1 then raise exception 'Invalid round' using errcode='22023';end if;
  if exists(select 1 from public.elective_rounds x where x.block_id=b.id and x.status='open' and tstzrange(x.opens_at,x.closes_at,'[]')&&tstzrange((p->>'opensAt')::timestamptz,(p->>'closesAt')::timestamptz,'[]')) then raise exception 'Another open offering' using errcode='40001',hint='elective_round_conflict';end if;
  select case when count(distinct src.source_ref->'needHt')=1 then min((src.source_ref->>'needHt')::integer) else null end,case when count(distinct src.source_ref->'needVt')=1 then min((src.source_ref->>'needVt')::integer) else null end,case when count(distinct src.source_ref->>'needBasis')=1 then min(src.source_ref->>'needBasis') else null end into ht,vt,basis from public.elective_block_sources src where src.block_id=b.id and src.active;
  snap:=jsonb_build_object('blockName',b.name,'blockKind',b.kind,'startsOn',b.starts_on,'endsOn',b.ends_on,'needHt',ht,'needVt',vt,'needBasis',basis,
   'options',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'subjectCode',o.subject_code,'levelCode',o.level_code,'language',o.language,'points',o.points) order by o.name,o.id) from public.elective_options o where o.block_id=b.id and o.active),'[]'::jsonb));
  insert into public.elective_rounds(id,block_id,unit_id,school_year,customer_id,organizer_id,block_revision,offering_revision,policy_revision,guardian_confirmation,opens_at,closes_at,status,min_choices,max_choices,option_ids,pupil_ids,offer_snapshot,offer_hash,time_sources)
  values((p->>'roundId')::uuid,b.id,unit,year,b.customer_id,b.organizer_id,b.revision,b.offering_revision,st.policy_revision,st.guardian_confirmation,(p->>'opensAt')::timestamptz,(p->>'closesAt')::timestamptz,'open',(p->>'minChoices')::integer,(p->>'maxChoices')::integer,opts,pupils,snap,public.elective_offering_hash(b.id),(select jsonb_agg(x.source_ref order by x.source_key collate "C") from public.elective_block_sources x where x.block_id=b.id and x.active)) returning * into r;
  foreach pid in array pupils loop
   if not public.phase4_scope(a.id,pid,unit) or not public.elective_round_eligible(r,pid) or exists(select 1 from public.pupils x where x.id=pid and x.protected_identity and not public.phase4_can_read_protected(pid,unit)) then raise exception 'Pupil outside offering' using errcode='42501';end if;
  end loop;
  return jsonb_build_object('objectId',r.id,'objectRevision',r.revision);
 elsif input->>'action'='close_round' then
  perform public.phase4_keys(p,array['roundId','expectedRoundRevision']);select * into r from public.elective_rounds where id=(p->>'roundId')::uuid and unit_id=unit and school_year=year for update;
  if not found or r.revision<>(p->>'expectedRoundRevision')::integer then raise exception 'Round changed' using errcode='40001',hint='elective_round_conflict';end if;
  update public.elective_rounds set status='closed',revision=revision+1 where id=r.id returning * into r;return jsonb_build_object('objectId',r.id,'objectRevision',r.revision);
 elsif input->>'action'='record_choice' then
  perform public.phase4_keys(p,array['roundId','pupilId','offeringRevision','expectedChoiceRevision','selectedOptionIds']);pid:=(p->>'pupilId')::uuid;
  select * into r from public.elective_rounds where id=(p->>'roundId')::uuid and unit_id=unit and school_year=year for update;
  if not found or not public.phase4_scope(a.id,pid,unit) or exists(select 1 from public.pupils x where x.id=pid and x.protected_identity and not public.phase4_can_read_protected(pid,unit)) then raise exception 'Choice denied' using errcode='42501';end if;
  select coalesce(array_agg(x::uuid),'{}'::uuid[]) into opts from jsonb_array_elements_text(p->'selectedOptionIds')x;
  c:=public.elective_record_choice(r,pid,(p->>'offeringRevision')::integer,(p->>'expectedChoiceRevision')::integer,opts,s.identity_id,null,a.id);
  return jsonb_build_object('objectId',c.id,'objectRevision',c.revision);
 elsif input->>'action'='confirm_choice' then
  perform public.phase4_keys(p,array['choiceId','expectedChoiceRevision']);select x.* into c from public.elective_choices x join public.elective_rounds y on y.id=x.round_id where x.id=(p->>'choiceId')::uuid and y.unit_id=unit and y.school_year=year for update of x;
  if not found or not public.phase4_scope(a.id,c.pupil_id,unit) or exists(select 1 from public.pupils x where x.id=c.pupil_id and x.protected_identity and not public.phase4_can_read_protected(c.pupil_id,unit)) then raise exception 'Choice denied' using errcode='42501';end if;
  select * into r from public.elective_rounds where id=c.round_id for update;perform public.elective_assert_current_round(r);
  if c.revision<>(p->>'expectedChoiceRevision')::integer then raise exception 'Choice changed' using errcode='40001',hint='elective_choice_conflict';end if;
  if public.elective_choice_state(c) not in ('ready_for_confirmation','confirmed') then raise exception 'Choice not confirmed' using errcode='40001',hint='elective_confirmation_required';end if;
  if exists(select 1 from jsonb_array_elements(r.offer_snapshot->'options') chosen
   join public.elective_choices other on other.pupil_id=c.pupil_id and other.id<>c.id and other.confirmed_at is not null
   join public.elective_rounds rr on rr.id=other.round_id and rr.school_year=r.school_year and rr.block_id<>r.block_id
   cross join lateral jsonb_array_elements(rr.offer_snapshot->'options') existing
   where chosen->'points'<>'null'::jsonb and existing->'points'<>'null'::jsonb and (chosen->>'id')::uuid=any(c.selected_option_ids) and (existing->>'id')::uuid=any(other.selected_option_ids)
    and chosen->>'levelCode'=existing->>'levelCode' and lower(chosen->>'language') is not distinct from lower(existing->>'language')
    and daterange((r.offer_snapshot->>'startsOn')::date,(r.offer_snapshot->>'endsOn')::date,'[]')&&daterange((rr.offer_snapshot->>'startsOn')::date,(rr.offer_snapshot->>'endsOn')::date,'[]')) then
   raise exception 'Same course already chosen in overlapping position' using errcode='40001',hint='elective_duplicate_course';end if;
  update public.elective_choices set confirmed_at=coalesce(confirmed_at,clock_timestamp()) where id=c.id returning * into c;return jsonb_build_object('objectId',c.id,'objectRevision',c.revision);
 end if;
 raise exception 'Unsupported round action' using errcode='22023';
end $$;

create function public.elective_self_offer(r public.elective_rounds,pupil uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare refs jsonb;first_ref jsonb;x jsonb;
begin
 select jsonb_agg(distinct src.value) into refs from jsonb_array_elements(r.time_sources) src
 join public.pupil_class_memberships cm on cm.class_id=(src.value->>'classId')::uuid and cm.pupil_id=pupil join public.pupil_placements pp on pp.id=cm.placement_id
 where pp.unit_id=r.unit_id and pp.starts_on<=(r.offer_snapshot->>'endsOn')::date and (pp.ends_on is null or pp.ends_on>=(r.offer_snapshot->>'startsOn')::date)
 and cm.starts_on<=(r.offer_snapshot->>'endsOn')::date and (cm.ends_on is null or cm.ends_on>=(r.offer_snapshot->>'startsOn')::date);
 if refs is null then raise exception 'Pupil source missing' using errcode='42501';end if;
 first_ref:=refs->0;
 for x in select value from jsonb_array_elements(refs) loop
  if x->'needHt' is distinct from first_ref->'needHt' or x->'needVt' is distinct from first_ref->'needVt' or x->'needBasis' is distinct from first_ref->'needBasis' then raise exception 'Pupil time source conflict' using errcode='40001',hint='elective_time_conflict';end if;
 end loop;
 return r.offer_snapshot||jsonb_build_object('needHt',first_ref->'needHt','needVt',first_ref->'needVt','needBasis',first_ref->'needBasis','round',public.elective_round_json(r,false));
end $$;
-- Placement implementation replaces only these narrow projections in VB-09.
create function public.elective_self_placements(unit uuid,pupil uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$select '[]'::jsonb$$;
create function public.elective_placement_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$select jsonb_build_object('placements','[]'::jsonb)$$;
-- No full class list in a self response. Each visible offer is checked against current school placement.
create function public.elective_self_read() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;st public.elective_school_state;b public.elective_participant_bindings;r public.elective_rounds;offers jsonb:='[]';choices jsonb:='[]';confirmations jsonb:='[]';participant jsonb;
begin
 a:=public.elective_participant_actor();st:=public.elective_lock_school((a->>'unitId')::uuid);select * into b from public.elective_participant_bindings where id=(a->>'bindingId')::uuid;
 participant:=jsonb_build_object('bindingId',b.id,'unitId',b.unit_id,'schoolName',(select name from public.school_units where id=b.unit_id),'pupilId',b.pupil_id,'pupilName',(select display_name from public.pupils where id=b.pupil_id),'participant',b.participant,'bindingRevision',b.revision,'confirmationRequired',b.confirmation_required);
 for r in select x.* from public.elective_rounds x where x.unit_id=b.unit_id and b.pupil_id=any(x.pupil_ids) order by x.opens_at,x.id limit 201 loop
  -- The live school binding gates access; the frozen target preserves the pupil's own historical offer.
  offers:=offers||jsonb_build_array(public.elective_self_offer(r,b.pupil_id));
  choices:=choices||coalesce((select jsonb_agg(public.elective_choice_json(c) order by c.id) from public.elective_choices c where c.round_id=r.id and c.pupil_id=b.pupil_id),'[]'::jsonb);
  if b.participant='guardian' then confirmations:=confirmations||coalesce((select jsonb_agg(jsonb_build_object('id',gc.id,'bindingId',gc.binding_id,'bindingRevision',gc.binding_revision,'choiceId',gc.choice_id,'choiceRevision',gc.choice_revision,'offeringRevision',gc.offering_revision,'decision',gc.decision,'decidedAt',to_char(gc.decided_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by gc.decided_at,gc.id)
   from public.elective_guardian_confirmations gc join public.elective_choices c on c.id=gc.choice_id where gc.binding_id=b.id and c.round_id=r.id and c.pupil_id=b.pupil_id),'[]'::jsonb);end if;
 end loop;
 if jsonb_array_length(offers)>200 then raise exception 'Too many offers' using errcode='22023';end if;
 perform public.elective_participant_audit('elective_self_read',null);
 return jsonb_build_object('contractVersion','elective_self_v1','epoch',a->'epoch','participant',participant,'policy',jsonb_build_object('unitId',st.unit_id,'revision',st.policy_revision,'guardianConfirmation',st.guardian_confirmation),'offers',offers,'choices',choices,'confirmations',confirmations,'placements',public.elective_self_placements(b.unit_id,b.pupil_id));
end $$;
create function public.elective_guardian_choice(input jsonb,authority jsonb) returns public.elective_choices
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin raise exception 'Guardian path not installed' using errcode='42501';end $$;
create function public.elective_self_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;r public.elective_rounds;c public.elective_choices;prior public.elective_self_commands;p jsonb;hash text;opts uuid[];result jsonb;
begin
 perform public.phase4_keys(input,array['unitId','pupilId','participant','expectedBindingRevision','commandId','action','payload']);a:=public.elective_participant_actor();
 if a->>'unitId'<>input->>'unitId' or a->>'pupilId'<>input->>'pupilId' or a->>'participant'<>input->>'participant' then raise exception 'Participant mismatch' using errcode='42501';end if;
 perform public.elective_lock_school((a->>'unitId')::uuid);
 hash:=substring(public.tjanst_hash(jsonb_build_array('elective_self_payload_v1',input)) from 8);
 select * into prior from public.elective_self_commands where command_id=(input->>'commandId')::uuid;
 if found then
  if prior.actor_identity_id<>(a->>'identityId')::uuid or prior.binding_id<>(a->>'bindingId')::uuid or prior.request<>input then raise exception 'Command changed' using errcode='40001',hint='elective_self_conflict';end if;
  perform public.elective_participant_audit('elective_self_status',prior.command_id);return prior.result||jsonb_build_object('replayed',true);
 end if;
 if (input->>'expectedBindingRevision')::integer<>(a->>'bindingRevision')::integer then raise exception 'Binding changed' using errcode='40001',hint='elective_binding_conflict';end if;
 p:=input->'payload';
 if input->>'action'='submit_choice' and a->>'participant'='pupil' then
  perform public.phase4_keys(p,array['roundId','offeringRevision','expectedChoiceRevision','selectedOptionIds']);
  select * into r from public.elective_rounds where id=(p->>'roundId')::uuid and unit_id=(a->>'unitId')::uuid for update;
  if not found then raise exception 'Offering denied' using errcode='42501';end if;
  select coalesce(array_agg(x::uuid),'{}'::uuid[]) into opts from jsonb_array_elements_text(p->'selectedOptionIds')x;
  c:=public.elective_record_choice(r,(a->>'pupilId')::uuid,(p->>'offeringRevision')::integer,(p->>'expectedChoiceRevision')::integer,opts,(a->>'identityId')::uuid,(a->>'bindingId')::uuid,null);
 elsif input->>'action'='confirm_guardian' and a->>'participant'='guardian' then c:=public.elective_guardian_choice(input,a);
 else raise exception 'Unsupported participant action' using errcode='42501';end if;
 result:=jsonb_build_object('unitId',a->'unitId','pupilId',a->'pupilId','participant',a->'participant','commandId',input->'commandId','action',input->'action','payloadHash',hash,'identityId',a->'identityId','bindingId',a->'bindingId','bindingRevision',a->'bindingRevision','choiceId',c.id,'choiceRevision',c.revision,'replayed',false);
 insert into public.elective_self_commands(command_id,unit_id,pupil_id,participant,actor_identity_id,binding_id,action,payload_hash,request,result)
 values((input->>'commandId')::uuid,(a->>'unitId')::uuid,(a->>'pupilId')::uuid,a->>'participant',(a->>'identityId')::uuid,(a->>'bindingId')::uuid,input->>'action',hash,input,result);
 perform public.elective_participant_audit(case when input->>'action'='confirm_guardian' then 'elective_guardian_confirmed' else 'elective_choice_submitted' end,c.id);return result;
end $$;
create function public.elective_self_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;c public.elective_self_commands;result jsonb;
begin
 perform public.phase4_keys(input,array['unitId','pupilId','participant','commandId','action','payloadHash']);a:=public.elective_participant_actor();
 if a->>'unitId'<>input->>'unitId' or a->>'pupilId'<>input->>'pupilId' or a->>'participant'<>input->>'participant' then raise exception 'Participant mismatch' using errcode='42501';end if;
 select * into c from public.elective_self_commands where command_id=(input->>'commandId')::uuid;
 if found and (c.actor_identity_id<>(a->>'identityId')::uuid or c.binding_id<>(a->>'bindingId')::uuid or c.unit_id<>(input->>'unitId')::uuid or c.pupil_id<>(input->>'pupilId')::uuid or c.participant<>input->>'participant' or c.action<>input->>'action' or c.payload_hash<>input->>'payloadHash') then raise exception 'Command reference mismatch' using errcode='40001',hint='elective_self_conflict';end if;
 perform public.elective_participant_audit('elective_self_status',(input->>'commandId')::uuid);
 return jsonb_build_object('unitId',a->'unitId','pupilId',a->'pupilId','participant',a->'participant','commandId',input->'commandId','status',case when c.command_id is null then 'not_found' else 'found' end,'receipt',case when c.command_id is null then null else c.result||jsonb_build_object('replayed',true) end);
end $$;
-- The protected pupil reference is SQL-derived; no such identifier comes from a request list.
create function public.elective_protected_pupil_audit(a public.access_assignments,pupil uuid,unit uuid,school_year integer) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare actor public.access_assignments;s public.app_sessions;i public.identities;
begin
 actor:=public.phase3_actor();s:=public.phase5_programplan_session_check();
 if actor.id<>a.id or not public.phase4_scope(a.id,pupil,unit) or not public.phase4_can_read_protected(pupil,unit) then raise exception 'Protected read denied' using errcode='42501';end if;
 select * into i from public.identities where id=s.identity_id;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,'pupil_protected_read','pupil',pupil,'ok',jsonb_build_object('unitId',unit,'schoolYear',school_year,'readForm','list','fields',jsonb_build_array('displayName')));
 exception when others then raise exception 'Protected pupil audit unavailable' using errcode='55000';end;
end $$;
create or replace function public.elective_pupil_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare pupils jsonb;rounds jsonb;choices jsonb;protected_id uuid;
begin
 if a.id is distinct from public.current_assignment_id() or a.function not in ('rektor','administrator') then raise exception 'Pupil projection denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.display_name,'classIds',coalesce((select jsonb_agg(distinct cm.class_id) from public.pupil_class_memberships cm
  where cm.pupil_id=p.id and cm.unit_id=unit and cm.starts_on<make_date(elective_pupil_projection.school_year+1,7,1) and (cm.ends_on is null or cm.ends_on>=make_date(elective_pupil_projection.school_year,7,1))),'[]'::jsonb)) order by p.display_name,p.id),'[]'::jsonb) into pupils
 from public.pupils p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id and public.phase4_scope(a.id,p.id,unit)
 and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit)) and exists(select 1 from public.pupil_placements pp where pp.pupil_id=p.id and pp.unit_id=unit and pp.starts_on<make_date(elective_pupil_projection.school_year+1,7,1) and (pp.ends_on is null or pp.ends_on>=make_date(elective_pupil_projection.school_year,7,1)));
 for protected_id in select p.id from public.pupils p where p.protected_identity and exists(select 1 from jsonb_array_elements(pupils) shown where shown->>'id'=p.id::text) loop
  perform public.elective_protected_pupil_audit(a,protected_id,unit,elective_pupil_projection.school_year);
 end loop;
 select coalesce(jsonb_agg((public.elective_round_json(r,true)||jsonb_build_object('pupilIds',coalesce((select jsonb_agg(x) from unnest(r.pupil_ids)x where exists(select 1 from jsonb_array_elements(pupils) p where p->>'id'=x::text)),'[]'::jsonb))) order by r.opens_at,r.id),'[]'::jsonb) into rounds from public.elective_rounds r where r.unit_id=unit and r.school_year=elective_pupil_projection.school_year;
 select coalesce(jsonb_agg(public.elective_choice_json(c) order by c.id),'[]'::jsonb) into choices from public.elective_choices c join public.elective_rounds r on r.id=c.round_id
 where r.unit_id=unit and r.school_year=elective_pupil_projection.school_year and exists(select 1 from jsonb_array_elements(pupils) p where p->>'id'=c.pupil_id::text);
 return jsonb_build_object('canReadPupils',true,'pupils',pupils,'rounds',rounds,'choices',choices)||public.elective_placement_projection(a,unit,elective_pupil_projection.school_year);
end $$;
revoke all on function public.elective_offering_hash(uuid),public.elective_round_json(public.elective_rounds,boolean),public.elective_round_eligible(public.elective_rounds,uuid),public.elective_assert_current_round(public.elective_rounds),
 public.elective_choice_state(public.elective_choices),public.elective_choice_json(public.elective_choices),public.elective_record_choice(public.elective_rounds,uuid,integer,integer,uuid[],uuid,uuid,uuid),
 public.elective_round_command(jsonb),public.elective_guardian_choice(jsonb,jsonb),public.elective_self_placements(uuid,uuid),public.elective_placement_projection(public.access_assignments,uuid,integer),public.elective_self_offer(public.elective_rounds,uuid),public.elective_self_read(),public.elective_self_command(jsonb),public.elective_self_status(jsonb),public.elective_protected_pupil_audit(public.access_assignments,uuid,uuid,integer),public.elective_pupil_projection(public.access_assignments,uuid,integer) from public,anon,authenticated,skolplattform_worker;
grant execute on function public.elective_self_read(),public.elective_self_command(jsonb),public.elective_self_status(jsonb) to skolplattform_worker;
commit;
