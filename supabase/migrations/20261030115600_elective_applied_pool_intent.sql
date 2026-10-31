-- VB156: en tillämpad valpool är ett organisationsbeslut även för klasser utan konkret grupp ännu.
-- Lager ovanpå raw/rammaskning: historiska klassprojektioner får inte dagens nya poolavsikt.
-- SS12000 2.1.0: intern planeringsavsikt, ingen ny Group/medlemsrelation eller extern överföring.
create or replace function public.tjanst_working_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare needs jsonb:=public.tjanst_needs_with_groups(unit,school_year,public.tjanst_group_needs(unit,school_year));applied_frames jsonb;result jsonb;
begin
 -- b.applied kan vara false efter ett otillämpat namn-/prognos-/poolutkast. Endast senaste
 -- uttryckliga applied_snapshot.sourceRefs gäller medan en tillämpad organisation finns kvar.
 -- Ett återöppnat sparutkast får återta claim i155 men väcker inte den gamla poolen före ny tillämpning.
 select coalesce(jsonb_agg(distinct coalesce(sr.value->>'frameSourceKey',sr.value->>'sourceKey')),'[]'::jsonb) into applied_frames
 from public.elective_blocks b cross join lateral jsonb_array_elements(coalesce(b.applied_snapshot->'sourceRefs','[]'::jsonb)) sr
 where b.unit_id=unit and b.school_year=tjanst_working_needs.school_year and b.organization_retired_at is null
  and exists(select 1 from public.elective_applied_groups ag join public.elective_group_snapshots gs on gs.group_id=ag.group_id and gs.revision=ag.revision where gs.block_id=b.id);
 if jsonb_array_length(applied_frames)=0 then return needs;end if;
 select coalesce(jsonb_agg(c.value||jsonb_build_object('needs',
  (select coalesce(jsonb_agg(case when applied_frames ? (n.value->>'sourceKey') then n.value||jsonb_build_object('organizationPending',true) else n.value end order by n.position),'[]'::jsonb)
   from jsonb_array_elements(c.value->'needs') with ordinality n(value,position))) order by c.position),'[]'::jsonb) into result
 from jsonb_array_elements(needs) with ordinality c(value,position);
 return result;
end $$;

create or replace function public.tjanst_row_json(r public.tjanst_rows,current_need jsonb) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'lineageId',r.lineage_id,'sourceKind',r.source_kind,'sourceKey',r.source_key,'classId',r.class_id,
  'rowKey',r.timplan_row_key,'personId',r.staff_person_id,'teacherHt',r.teacher_ht_minutes,'teacherVt',r.teacher_vt_minutes,
  'needHt',r.need_ht_minutes,'needVt',r.need_vt_minutes,'needBasis',r.need_basis,
  -- Ändrad koppling eller behov markerar raden; ögonblicksbilden skrivs aldrig om tyst (P6).
  'stale',case when r.source_kind='teaching_group' then current_need is null or coalesce((current_need->>'stale')::boolean,true) or current_need->'groupRevision' is distinct from to_jsonb(r.group_revision) else current_need is null or coalesce((current_need->>'organizationPending')::boolean,false) or (current_need->'link'->>'linkRevision')::integer<>r.link_revision or (current_need->'link'->>'timplanId')::uuid<>r.timplan_id
   or current_need->>'needBasis'<>r.need_basis or (current_need->>'needHt')::integer is distinct from r.need_ht_minutes
   or (current_need->>'needVt')::integer is distinct from r.need_vt_minutes end,
  'jointGroupId',null,'comment',r.comment)||case when r.source_kind='teaching_group' then jsonb_build_object('groupId',r.group_id,'groupRevision',r.group_revision,'classIds',r.group_snapshot->'classIds','sourceRefs',r.group_snapshot->'sourceRefs') else '{}'::jsonb end
$$;

create or replace function public.tjanst_plan_projection(a public.access_assignments,unit uuid,school_year integer,version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;published public.tjanst_versions;needs jsonb;rows jsonb;teachers jsonb;versions jsonb;blockers jsonb;
 specials jsonb;groups jsonb;joints jsonb;sharing jsonb;history boolean:=version_id is not null;editing boolean;actions text[]:='{}';result jsonb;
begin
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=tjanst_plan_projection.school_year;
 if history then
  select * into v from public.tjanst_versions x where x.id=version_id and x.distribution_id=d.id and x.status in ('published','superseded');
  if not found then raise exception 'Service allocation denied' using errcode='42501';end if;
 else
  select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc limit 1;
 end if;
 groups:=case when history then public.tjanst_version_groups(v.id) else public.tjanst_group_needs(unit,school_year) end;
 needs:=case when history then coalesce(public.tjanst_version_class_sources(v.id),public.tjanst_needs_with_groups(unit,school_year,groups)) else public.tjanst_working_needs(unit,school_year) end;
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,(select g.value from jsonb_array_elements(groups) g where g.value->>'sourceKey'=r.source_key union all select n.value||jsonb_build_object('link',c.value->'link') from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=r.source_key limit 1)),'{jointGroupId}',
   coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb))
   order by r.source_key collate "C",r.staff_person_id nulls last,r.id),'[]'::jsonb) into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,'classId',s.class_id,
   'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.kind,s.label collate "C",s.id),'[]'::jsonb) into specials
 from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
   'rowIds',(select coalesce(jsonb_agg(m.row_id order by m.row_id),'[]'::jsonb) from public.tjanst_joint_members m where m.group_id=g.id),
   'teachers',(select coalesce(jsonb_agg(jsonb_build_object('personId',t.staff_person_id,'ht',t.ht_minutes,'vt',t.vt_minutes) order by t.staff_person_id),'[]'::jsonb)
    from public.tjanst_joint_teacher_time t where t.group_id=g.id)) order by g.name collate "C",g.id),'[]'::jsonb) into joints
 from public.tjanst_joint_groups g where g.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('sourceKey',s.source_key,'mode',s.mode,'graderPersonIds',
   (select coalesce(jsonb_agg(g.staff_person_id order by g.staff_person_id),'[]'::jsonb) from public.tjanst_need_graders g where g.version_id=s.version_id and g.source_key=s.source_key))
   order by s.source_key collate "C"),'[]'::jsonb) into sharing
 from public.tjanst_need_sharing s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max(s.percent) from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
     and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(school_year,7,1),make_date(school_year+1,6,30),'[]')))
   order by p.family_name collate "C",p.given_name collate "C",p.id),'[]'::jsonb) into teachers
 from public.staff_people p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
  and (exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_joint_teacher_time t join public.tjanst_joint_groups g on g.id=t.group_id where g.version_id=v.id and t.staff_person_id=p.id));
 select coalesce(jsonb_agg(public.tjanst_version_json(x) order by x.version_no desc),'[]'::jsonb) into versions
 from public.tjanst_versions x where x.distribution_id=d.id and x.status<>'discarded';
 blockers:=case when history then '[]'::jsonb else public.tjanst_plan_blockers(a,v,unit,school_year,needs) end;
 editing:=not history and a.function in ('rektor','administrator');
 if editing then
  actions:=array['add_teacher','remove_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','move','bulk','save_sharing','clear_sharing'];
  if coalesce(v.status='draft',false) then
   actions:=actions||'discard_draft'::text;
   if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
  end if;
 end if;
 result:=jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('aplMinutes',case when c.value ? 'aplMinutes' then c.value->'aplMinutes' else to_jsonb(public.tjanst_class_apl_minutes(c.value->'link')) end,'needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials',specials,'joints',joints,'sharing',sharing,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing,
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,'canReadHistory',true));
 -- Återkoppling (TJANST-05): bara för rektor och administratör och bara för den aktuella publicerade versionen.
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if not history and published.id is not null and a.function in ('rektor','administrator') then result:=result||jsonb_build_object('feedback',public.tjanst_feedback_json(published.id));end if;
 return result||case when jsonb_array_length(groups)>0 then jsonb_build_object('groups',groups) else '{}'::jsonb end;
end $$;

-- Alla tre är befintliga privata hjälpare; inga nya direkta Worker-ingångar.
revoke all on function public.tjanst_working_needs(uuid,integer),public.tjanst_row_json(public.tjanst_rows,jsonb),public.tjanst_plan_projection(public.access_assignments,uuid,integer,uuid) from public,anon,authenticated,service_role,skolplattform_worker;
