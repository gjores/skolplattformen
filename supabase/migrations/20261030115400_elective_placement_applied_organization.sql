-- A placement uses the same explicitly applied organizational basis as service planning.
-- Names/forecasts are presentation, not a new class/time/course organization.
begin;
create function public.elective_placement_organization(group_id uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare g public.teaching_groups;b public.elective_blocks;s public.elective_group_snapshots;refs jsonb;current_org jsonb;applied_org jsonb;period jsonb;o public.elective_options;
begin
 select * into g from public.teaching_groups where id=group_id;select * into b from public.elective_blocks where id=g.block_id;select * into o from public.elective_options where id=g.option_id;
 perform 1 from public.elective_applied_groups a where a.group_id=g.id for share;
 select snap.* into s from public.elective_applied_groups a join public.elective_group_snapshots snap on snap.group_id=a.group_id and snap.revision=a.revision where a.group_id=g.id;
 select jsonb_agg(bs.source_ref order by gs.class_id,gs.source_key collate "C") into refs from public.teaching_group_sources gs join public.elective_block_sources bs on bs.block_id=gs.block_id and bs.source_key=gs.source_key and bs.active where gs.group_id=g.id;
 current_org:=jsonb_build_object('groupId',g.id,'blockId',g.block_id,'optionId',g.option_id,'startsOn',g.starts_on,'endsOn',g.ends_on,
 'classIds',(select jsonb_agg(distinct (x.value->>'classId')::uuid order by (x.value->>'classId')::uuid) from jsonb_array_elements(refs)x),'sourceRefs',refs,
 'subjectCode',o.subject_code,'levelCode',o.level_code,'language',o.language,'needHt',refs->0->'needHt','needVt',refs->0->'needVt','needBasis',refs->0->'needBasis');
 select x.value into period from jsonb_array_elements(coalesce(b.applied_snapshot->'groups','[]'))x where x.value->>'id'=g.id::text;
 if s.group_id is not null and period is not null then
 applied_org:=jsonb_build_object('groupId',s.group_id,'blockId',s.block_id,'optionId',s.snapshot->'optionId','startsOn',period->'startsOn','endsOn',period->'endsOn',
 'classIds',s.snapshot->'classIds','sourceRefs',s.snapshot->'sourceRefs','subjectCode',s.snapshot->'subjectCode','levelCode',s.snapshot->'levelCode','language',s.snapshot->'language','needHt',s.snapshot->'needHt','needVt',s.snapshot->'needVt','needBasis',s.snapshot->'needBasis');end if;
 return jsonb_build_object('applied',g.active and o.active and current_org is not distinct from applied_org,'current',current_org,'appliedOrganization',applied_org,'appliedRevision',s.revision);
end $$;
create or replace function public.elective_placement_basis(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.elective_school_state;c public.elective_choices;r public.elective_rounds;g public.teaching_groups;p public.pupils;old public.elective_placements;
 q jsonb;organization jsonb;issues jsonb:='[]';warnings jsonb:='[]';school_periods jsonb;class_periods jsonb;basis jsonb;body jsonb;prior jsonb:=null;start_date date;end_date date;unit uuid;year integer;state text;
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
 basis:=jsonb_build_object('request',input,'pupil',jsonb_build_object('id',p.id,'version',p.version,'name',p.display_name,'protected',p.protected_identity),'schoolPeriods',school_periods,'classPeriods',class_periods,
  'schoolPlacementRecords',(select jsonb_agg(to_jsonb(x) order by x.id) from public.pupil_placements x where x.pupil_id=p.id and x.unit_id=unit),
  'classMembershipRecords',(select jsonb_agg(to_jsonb(x) order by x.id) from public.pupil_class_memberships x where x.pupil_id=p.id and x.unit_id=unit),
  'group',to_jsonb(g),'sources',(select jsonb_agg(to_jsonb(x) order by x.source_key) from public.teaching_group_sources x where x.group_id=g.id),
  'choice',to_jsonb(c),'round',to_jsonb(r),'choiceState',state,'previous',to_jsonb(old),
  'requiredBindings',(select jsonb_agg(to_jsonb(x) order by x.id) from public.elective_participant_bindings x where x.pupil_id=p.id and x.unit_id=unit),
  'confirmations',(select jsonb_agg(to_jsonb(x) order by x.id) from public.elective_guardian_confirmations x where x.choice_id=c.id),
  'memberships',(select jsonb_agg(to_jsonb(x) order by x.id) from public.elective_placements x where x.pupil_id=p.id and x.block_id=r.block_id));
 organization:=public.elective_placement_organization(g.id);if not (organization->>'applied')::boolean then issues:=issues||'"group_not_applied_to_staffing"'::jsonb;end if;
 basis:=jsonb_build_object('placementBasis',basis,'organization',organization);
 body:=jsonb_build_object('unitId',unit,'schoolYear',year,'revision',s.revision,'basisHash',substring(public.tjanst_hash(basis) from 8),'allowed',jsonb_array_length(issues)=0,'issues',issues,
 'pupil',jsonb_build_object('id',p.id,'name',p.display_name,'version',p.version),'group',jsonb_build_object('id',g.id,'name',g.name,'startsOn',g.starts_on,'endsOn',g.ends_on),
 'period',jsonb_build_object('startsOn',start_date,'endsOn',end_date),'schoolPeriods',school_periods,'classPeriods',class_periods,'previous',prior,'warnings',warnings);
 if p.protected_identity then perform public.elective_protected_pupil_audit(a,p.id,unit,year);end if;return body;
end $$;

revoke all on function public.elective_placement_organization(uuid) from public,anon,authenticated,skolplattform_worker;
commit;
