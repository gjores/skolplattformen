-- 05.1-15 / WR-10: samma personprövning vid läsning och direkt publicering.
-- Framåtmigration: installerade migrationer ändras inte. CREATE OR REPLACE bevarar ägare/ACL.
-- Senaste blockerare: 20261021120000 (inklusive joint_invalid).
-- Senaste projektion: 20261020130000. Inga nya grants eller ändringar av publicerade beslut.
-- tjanst_person_at_school behåller befintlig läsårsöverlapp och utkastperson på föreslagen skola.
-- Detta inför ingen fullterminskontroll och verifierar inte lärarbehörighet eller SS 12000-utbyte.

create or replace function public.tjanst_plan_blockers(a public.access_assignments,v public.tjanst_versions,unit uuid,school_year integer,needs jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb:='[]';
begin
 if v.id is null or v.status<>'draft' then return result;end if;
 if not exists(select 1 from public.tjanst_rows r where r.version_id=v.id) then
  result:=result||jsonb_build_array(jsonb_build_object('code','empty_draft','message','Utkastet har inga tjänsterader. Lägg till minst en rad före publicering.'));end if;
 if exists(select 1 from public.tjanst_rows r where r.version_id=v.id and (public.tjanst_row_json(r,(select x.value||jsonb_build_object('link',c.value->'link')
   from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') x where x.value->>'sourceKey'=r.source_key limit 1))->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','stale_rows','message','Underlaget har ändrats för en eller flera rader. Spara raderna på nytt efter granskning.'));end if;
 if exists(select 1 from (select t.staff_person_id p from public.tjanst_version_teachers t where t.version_id=v.id
   union select r.staff_person_id from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
   union select s.staff_person_id from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id is not null) x
   where not public.tjanst_person_at_school(a,x.p,unit,school_year)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','person_not_at_school','message','En lärare saknar giltigt skoluppdrag på skolan för läsåret.'));end if;
 -- WR-02 (D-16): samläsningens regler prövas också vid publicering, även för data från före rättelsen.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct r.class_id) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)<2
   or exists(select 1 from public.tjanst_joint_teacher_time t where t.group_id=g.id and not exists(select 1 from public.tjanst_joint_members m
    join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id and r.staff_person_id=t.staff_person_id)))) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_invalid','message','En samläsning uppfyller inte reglerna: raderna ska finnas i minst två klasser, och lärartid får bara gälla lärare som har en rad i gruppen. Ändra eller lös upp samläsningen.'));end if;
 return result;
end $$;

create or replace function public.tjanst_plan_projection(a public.access_assignments,unit uuid,school_year integer,version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;published public.tjanst_versions;needs jsonb;rows jsonb;teachers jsonb;versions jsonb;blockers jsonb;
 specials jsonb;joints jsonb;history boolean:=version_id is not null;editing boolean;actions text[]:='{}';result jsonb;
begin
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=tjanst_plan_projection.school_year;
 if history then
  select * into v from public.tjanst_versions x where x.id=version_id and x.distribution_id=d.id and x.status in ('published','superseded');
  if not found then raise exception 'Service allocation denied' using errcode='42501';end if;
 else
  select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc limit 1;
 end if;
 needs:=public.tjanst_needs(unit,school_year);
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,(select x.value||jsonb_build_object('link',c.value->'link') from jsonb_array_elements(needs) c
   cross join lateral jsonb_array_elements(c.value->'needs') x where x.value->>'sourceKey'=r.source_key limit 1)),'{jointGroupId}',
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
 if editing and coalesce(v.status='draft',false) then actions:=array['add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft'];
  if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
 elsif editing then actions:=array['create_draft'];end if;
 result:=jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials',specials,'joints',joints,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing and coalesce(v.status='draft',false),
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,'canReadHistory',true));
 -- Återkoppling (TJANST-05): bara för rektor och administratör och bara för den aktuella publicerade versionen.
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if not history and published.id is not null and a.function in ('rektor','administrator') then result:=result||jsonb_build_object('feedback',public.tjanst_feedback_json(published.id));end if;
 return result;
end $$;
