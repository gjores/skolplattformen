-- Reviewed, dated teaching-group membership. Administrative class/school placements stay authoritative.
begin;
alter table public.elective_rounds add constraint elective_round_scope_key unique(id,block_id,unit_id);
alter table public.elective_choices add constraint elective_choice_pupil_round_key unique(id,round_id,pupil_id);
alter table public.teaching_groups add constraint elective_group_option_key unique(id,option_id,block_id);
alter table public.teaching_groups add column membership_revision integer not null default 0 check(membership_revision>=0);
create table public.elective_placements(
 id uuid primary key,unit_id uuid not null,block_id uuid not null,group_id uuid not null,option_id uuid not null,
 pupil_id uuid not null,round_id uuid not null,choice_id uuid not null,choice_revision integer not null check(choice_revision>0),
 starts_on date not null check(isfinite(starts_on)),ends_on date not null check(isfinite(ends_on) and ends_on>=starts_on),
 revision integer not null default 1 check(revision>0),cancelled_at timestamptz,
 recorded_by_assignment_id uuid not null references public.access_assignments(id),created_at timestamptz not null default clock_timestamp(),
 previous_placement_id uuid references public.elective_placements(id),
 foreign key(round_id,block_id,unit_id) references public.elective_rounds(id,block_id,unit_id),
 foreign key(choice_id,round_id,pupil_id) references public.elective_choices(id,round_id,pupil_id),
 foreign key(group_id,option_id,block_id) references public.teaching_groups(id,option_id,block_id),
 exclude using gist(pupil_id with =,block_id with =,daterange(starts_on,ends_on,'[]') with &&) where(cancelled_at is null)
);
create table public.elective_placement_history(placement_id uuid not null references public.elective_placements(id),revision integer not null,
 body jsonb not null,recorded_at timestamptz not null default clock_timestamp(),primary key(placement_id,revision));
alter table public.elective_placements enable row level security;alter table public.elective_placements force row level security;
alter table public.elective_placement_history enable row level security;alter table public.elective_placement_history force row level security;
revoke all on public.elective_placements,public.elective_placement_history from public,anon,authenticated,skolplattform_worker;

create or replace function public.elective_group_membership(group_id uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('memberCount',(select count(distinct p.pupil_id) from public.elective_placements p where p.group_id=g.id and p.cancelled_at is null),
 'membershipRevision',g.membership_revision,'membershipHash',substring(public.tjanst_hash(jsonb_build_array('elective_members_v1',g.id,
 coalesce((select jsonb_agg(jsonb_build_object('pupilId',p.pupil_id,'startsOn',p.starts_on,'endsOn',p.ends_on,'choiceId',p.choice_id,'choiceRevision',p.choice_revision) order by p.pupil_id,p.starts_on,p.ends_on,p.choice_id,p.choice_revision)
 from public.elective_placements p where p.group_id=g.id and p.cancelled_at is null),'[]'::jsonb))) from 8)) from public.teaching_groups g where g.id=group_id
$$;
create function public.elective_placement_json(p public.elective_placements) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'groupId',p.group_id,'pupilId',p.pupil_id,'choiceId',p.choice_id,'choiceRevision',p.choice_revision,'startsOn',p.starts_on,'endsOn',p.ends_on,'revision',p.revision)
$$;
-- Live period facts are locked and included in review CAS even if the elective school revision did not change.
create function public.elective_placement_basis(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.elective_school_state;c public.elective_choices;r public.elective_rounds;g public.teaching_groups;p public.pupils;old public.elective_placements;
 q jsonb;issues jsonb:='[]';warnings jsonb:='[]';school_periods jsonb;class_periods jsonb;basis jsonb;body jsonb;prior jsonb:=null;start_date date;end_date date;unit uuid;year integer;state text;
begin
 perform public.elective_require_shape(input,array['unitId','schoolYear','expectedRevision','payload']);
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;a:=public.elective_staff_scope(unit);s:=public.elective_lock_school(unit);a:=public.elective_staff_scope(unit);
 if s.revision<>(input->>'expectedRevision')::integer then raise exception 'Review changed' using errcode='40001',hint='elective_revision_conflict';end if;
 q:=input->'payload';perform public.elective_require_shape(q,array['placementId','choiceId','expectedChoiceRevision','groupId','startsOn','endsOn','previousPlacementId']);
 -- Establish the target school before accessing pupil or group details.
 select x.* into r from public.elective_rounds x join public.elective_choices z on z.round_id=x.id where z.id=public.tjanst_uuid(q->'choiceId') and x.unit_id=unit and x.school_year=year for update of x;
 if not found then raise exception 'Placement scope denied' using errcode='42501';end if;
 select * into c from public.elective_choices x where x.id=(q->>'choiceId')::uuid for update;
 select * into p from public.pupils x where x.id=c.pupil_id for share;
 if not public.phase4_scope(a.id,p.id,unit) or p.protected_identity and not public.phase4_can_read_protected(p.id,unit) then raise exception 'Pupil denied' using errcode='42501';end if;
 select * into g from public.teaching_groups x where x.id=public.tjanst_uuid(q->'groupId') and x.block_id=r.block_id and x.active for share;
 if not found then raise exception 'Group denied' using errcode='42501';end if;
 perform 1 from public.pupil_placements x where x.pupil_id=p.id and x.unit_id=unit order by x.id for share;
 perform 1 from public.pupil_class_memberships x where x.pupil_id=p.id and x.unit_id=unit order by x.id for share;
 perform 1 from public.elective_participant_bindings x where x.unit_id=unit and x.pupil_id=p.id order by x.id for share;
 perform 1 from public.elective_guardian_confirmations x where x.choice_id=c.id order by x.id for share;
 perform public.elective_assert_current_round(r);state:=public.elective_choice_state(c);
 start_date:=(q->>'startsOn')::date;end_date:=coalesce((q->>'endsOn')::date,g.ends_on);
 if not isfinite(start_date) or not isfinite(end_date) or end_date<start_date then raise exception 'Invalid period' using errcode='22023',hint='elective_placement_invalid';end if;
 if c.revision<>(q->>'expectedChoiceRevision')::integer then issues:=issues||'"choice_changed"'::jsonb;end if;
 if state<>'confirmed' then issues:=issues||'"choice_not_confirmed"'::jsonb;end if;
 if not g.option_id=any(c.selected_option_ids) then issues:=issues||'"option_not_selected"'::jsonb;end if;
 if start_date<g.starts_on or end_date>g.ends_on then issues:=issues||'"outside_group_period"'::jsonb;end if;
 select coalesce(jsonb_agg(jsonb_build_object('startsOn',x.starts_on,'endsOn',x.ends_on) order by x.starts_on,x.id),'[]'::jsonb) into school_periods from public.pupil_placements x where x.pupil_id=p.id and x.unit_id=unit;
 select coalesce(jsonb_agg(jsonb_build_object('classId',x.class_id,'className',sc.name,'startsOn',x.starts_on,'endsOn',x.ends_on) order by x.starts_on,x.id),'[]'::jsonb) into class_periods from public.pupil_class_memberships x join public.school_classes sc on sc.id=x.class_id where x.pupil_id=p.id and x.unit_id=unit;
 if not exists(select 1 from public.pupil_placements pp join public.pupil_class_memberships cm on cm.placement_id=pp.id
  join public.teaching_group_sources gs on gs.class_id=cm.class_id and gs.group_id=g.id
  where pp.pupil_id=p.id and pp.unit_id=unit and pp.starts_on<=start_date and (pp.ends_on is null or pp.ends_on>=end_date)
  and cm.starts_on<=start_date and (cm.ends_on is null or cm.ends_on>=end_date)) then issues:=issues||'"outside_pupil_class_period"'::jsonb;end if;
 if exists(select 1 from public.elective_placements x where x.id=public.tjanst_uuid(q->'placementId')) then issues:=issues||'"placement_id_used"'::jsonb;end if;
 if q->>'previousPlacementId' is not null then
  select * into old from public.elective_placements x where x.id=public.tjanst_uuid(q->'previousPlacementId') and x.unit_id=unit and x.pupil_id=p.id and x.block_id=r.block_id for update;
  if not found then raise exception 'Previous placement denied' using errcode='42501';end if;
  if old.cancelled_at is not null then issues:=issues||'"previous_cancelled"'::jsonb;end if;
  if start_date<=old.starts_on and old.starts_on<public.app_today() then issues:=issues||'"historical_period_rewrite"'::jsonb;end if;
  prior:=jsonb_build_object('id',old.id,'groupId',old.group_id,'groupName',(select name from public.teaching_groups where id=old.group_id),'startsOn',old.starts_on,'endsOn',old.ends_on,'revision',old.revision,'operation',case when start_date<=old.starts_on then 'cancel' else 'end' end);
 end if;
 if exists(select 1 from public.elective_placements x where x.pupil_id=p.id and x.block_id=r.block_id and x.cancelled_at is null
  and x.id is distinct from old.id and daterange(x.starts_on,x.ends_on,'[]')&&daterange(start_date,end_date,'[]')) then issues:=issues||'"previous_placement_required"'::jsonb;end if;
 if not exists(select 1 from public.elective_blocks x where x.id=r.block_id and x.applied_snapshot->'groups' @> jsonb_build_array(jsonb_build_object('id',g.id))) then warnings:=warnings||'"group_not_applied_to_staffing"'::jsonb;end if;
 basis:=jsonb_build_object('request',input,'pupil',jsonb_build_object('id',p.id,'version',p.version,'name',p.display_name,'protected',p.protected_identity),'schoolPeriods',school_periods,'classPeriods',class_periods,
  'schoolPlacementRecords',(select jsonb_agg(to_jsonb(x) order by x.id) from public.pupil_placements x where x.pupil_id=p.id and x.unit_id=unit),
  'classMembershipRecords',(select jsonb_agg(to_jsonb(x) order by x.id) from public.pupil_class_memberships x where x.pupil_id=p.id and x.unit_id=unit),
  'group',to_jsonb(g),'sources',(select jsonb_agg(to_jsonb(x) order by x.source_key) from public.teaching_group_sources x where x.group_id=g.id),
  'choice',to_jsonb(c),'round',to_jsonb(r),'choiceState',state,'previous',to_jsonb(old),
  'requiredBindings',(select jsonb_agg(to_jsonb(x) order by x.id) from public.elective_participant_bindings x where x.pupil_id=p.id and x.unit_id=unit),
  'confirmations',(select jsonb_agg(to_jsonb(x) order by x.id) from public.elective_guardian_confirmations x where x.choice_id=c.id),
  'memberships',(select jsonb_agg(to_jsonb(x) order by x.id) from public.elective_placements x where x.pupil_id=p.id and x.block_id=r.block_id));
 body:=jsonb_build_object('unitId',unit,'schoolYear',year,'revision',s.revision,'basisHash',substring(public.tjanst_hash(basis) from 8),'allowed',jsonb_array_length(issues)=0,'issues',issues,
 'pupil',jsonb_build_object('id',p.id,'name',p.display_name,'version',p.version),'group',jsonb_build_object('id',g.id,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on),
 'period',jsonb_build_object('startsOn',start_date,'endsOn',end_date),'schoolPeriods',school_periods,'classPeriods',class_periods,'previous',prior,'warnings',warnings);
 if p.protected_identity then perform public.elective_protected_pupil_audit(a,p.id,unit,year);end if;return body;
end $$;
create function public.elective_placement_preview(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare body jsonb;a public.access_assignments;begin
 body:=public.elective_placement_basis(input);a:=public.elective_staff_scope((input->>'unitId')::uuid);
 perform public.elective_staff_audit('elective_read',(body->'pupil'->>'id')::uuid,(input->>'unitId')::uuid);
 return jsonb_build_object('contractVersion','elective_sql_v1','actor',jsonb_build_object('identityId',current_setting('app.identity_id',true),'assignmentId',a.id),'result',body);
end $$;
create or replace function public.elective_placement_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;q jsonb;review jsonb;old public.elective_placements;created public.elective_placements;c public.elective_choices;r public.elective_rounds;g public.teaching_groups;unit uuid;end_date date;
begin
 unit:=(input->>'unitId')::uuid;a:=public.elective_staff_scope(unit);q:=input->'payload';
 if input->>'action'='save_placement' then
  perform public.elective_require_shape(q,array['placementId','choiceId','expectedChoiceRevision','groupId','startsOn','endsOn','previousPlacementId','expectedBasisHash']);
  review:=public.elective_placement_basis(jsonb_build_object('unitId',unit,'schoolYear',input->'schoolYear','expectedRevision',input->'expectedRevision','payload',q-'expectedBasisHash'));
  if q->>'expectedBasisHash' is distinct from review->>'basisHash' then raise exception 'Placement basis changed' using errcode='40001',hint='elective_placement_conflict';end if;
  if not (review->>'allowed')::boolean then raise exception 'Placement requires review' using errcode='40001',hint='elective_placement_conflict';end if;
  select * into c from public.elective_choices where id=(q->>'choiceId')::uuid;select * into r from public.elective_rounds where id=c.round_id;select * into g from public.teaching_groups where id=(q->>'groupId')::uuid;
  if q->>'previousPlacementId' is not null then
   select * into old from public.elective_placements where id=(q->>'previousPlacementId')::uuid;
   insert into public.elective_placement_history(placement_id,revision,body) values(old.id,old.revision,to_jsonb(old));
   if review->'previous'->>'operation'='cancel' then update public.elective_placements set cancelled_at=clock_timestamp(),revision=revision+1 where id=old.id;
   else update public.elective_placements set ends_on=least(ends_on,(q->>'startsOn')::date-1),revision=revision+1 where id=old.id;end if;
   update public.teaching_groups set membership_revision=membership_revision+1 where id=old.group_id;
  end if;
  insert into public.elective_placements(id,unit_id,block_id,group_id,option_id,pupil_id,round_id,choice_id,choice_revision,starts_on,ends_on,recorded_by_assignment_id,previous_placement_id)
  values((q->>'placementId')::uuid,unit,r.block_id,g.id,g.option_id,c.pupil_id,r.id,c.id,c.revision,(review->'period'->>'startsOn')::date,(review->'period'->>'endsOn')::date,a.id,old.id) returning * into created;
  update public.teaching_groups set membership_revision=membership_revision+1 where id=g.id;
 elsif input->>'action'='end_placement' then
  perform public.elective_require_shape(q,array['placementId','expectedPlacementRevision','endsOn']);
  select x.* into old from public.elective_placements x join public.elective_blocks b on b.id=x.block_id where x.id=public.tjanst_uuid(q->'placementId') and x.unit_id=unit and b.school_year=(input->>'schoolYear')::integer for update of x;
  if not found or not public.phase4_scope(a.id,old.pupil_id,unit) or exists(select 1 from public.pupils p where p.id=old.pupil_id and p.protected_identity and not public.phase4_can_read_protected(p.id,unit)) then raise exception 'Placement denied' using errcode='42501';end if;
  end_date:=(q->>'endsOn')::date;
  if old.revision<>(q->>'expectedPlacementRevision')::integer or old.cancelled_at is not null or end_date<old.starts_on or end_date>old.ends_on then raise exception 'Placement changed' using errcode='40001',hint='elective_placement_conflict';end if;
  insert into public.elective_placement_history(placement_id,revision,body) values(old.id,old.revision,to_jsonb(old));
  update public.elective_placements set ends_on=end_date,revision=revision+1 where id=old.id returning * into created;
  update public.teaching_groups set membership_revision=membership_revision+1 where id=old.group_id;
 else raise exception 'Placement action denied' using errcode='22023',hint='elective_invalid';end if;
 return jsonb_build_object('objectId',created.id,'objectRevision',created.revision);
end $$;
create or replace function public.elective_self_placements(unit uuid,pupil uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;begin
 a:=public.elective_participant_actor();if (a->>'unitId')::uuid<>unit or (a->>'pupilId')::uuid<>pupil then raise exception 'Own placement denied' using errcode='42501';end if;
 return coalesce((select jsonb_agg(jsonb_build_object('groupId',x.group_id,'groupName',g.name,'optionId',x.option_id,'startsOn',x.starts_on,'endsOn',x.ends_on) order by x.starts_on,x.id)
 from public.elective_placements x join public.teaching_groups g on g.id=x.group_id where x.unit_id=unit and x.pupil_id=pupil and x.cancelled_at is null),'[]'::jsonb);
end $$;
create or replace function public.elective_placement_projection(a public.access_assignments,unit uuid,school_year integer) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 if a.id is distinct from public.current_assignment_id() or a.function not in ('rektor','administrator') then raise exception 'Placement projection denied' using errcode='42501';end if;
 return jsonb_build_object('placements',coalesce((select jsonb_agg(public.elective_placement_json(x) order by x.starts_on,x.id) from public.elective_placements x join public.elective_blocks b on b.id=x.block_id
 join public.pupils p on p.id=x.pupil_id where x.unit_id=unit and b.school_year=elective_placement_projection.school_year and x.cancelled_at is null and public.phase4_scope(a.id,p.id,unit) and (not p.protected_identity or public.phase4_can_read_protected(p.id,unit))),'[]'::jsonb));
end $$;
revoke all on function public.elective_group_membership(uuid),public.elective_placement_json(public.elective_placements),public.elective_placement_basis(jsonb),public.elective_placement_preview(jsonb),public.elective_placement_command(jsonb),public.elective_self_placements(uuid,uuid),public.elective_placement_projection(public.access_assignments,uuid,integer) from public,anon,authenticated,skolplattform_worker;
grant execute on function public.elective_placement_preview(jsonb) to skolplattform_worker;
commit;
