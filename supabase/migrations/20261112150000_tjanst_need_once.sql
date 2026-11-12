-- Tjänstefördelningens behov räknas en gång per anrop (prestanda, inget ändrat resultat).
--
-- tjanst_year_core och tjanst_plan_blockers slog upp varje rads behov med tjanst_need, som räknar om hela skolans behov
-- (tjanst_working_needs) för varje rad. Med 77 rader tog förhandsvisningen cirka 5 s och ett sparat kommando cirka 10 s.
-- Båda funktionerna har redan behoven för samma skolenhet och läsår; raden slås nu upp i dem med tjanst_need_in.
-- tjanst_plan_blockers anropas bara med tjanst_working_needs(unit,school_year) som needs (tjanst_plan_projection utan historik
-- och tjanst_plan_publish). Övriga rader i funktionerna är oförändrade från 20261111100000_lasar_versions.sql
-- (tjanst_year_core) och 20261030112000_elective_tjanst_sources.sql (tjanst_plan_blockers, tjanst_need).
-- Inga tabeller, kontrakt eller rättigheter för Workern ändras.

create function public.tjanst_need_in(needs jsonb,groups jsonb,source_key text) returns jsonb
language sql immutable security definer set search_path=pg_catalog,public as $$
 select n.value||jsonb_build_object('classId',c.value->'classId','link',c.value->'link')
 from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where n.value->>'sourceKey'=source_key
 union all
 select g.value from jsonb_array_elements(groups) g where g.value->>'sourceKey'=source_key
$$;
revoke all on function public.tjanst_need_in(jsonb,jsonb,text) from public,anon,authenticated,service_role,skolplattform_worker;

-- En definition av uppslaget: enstaka anrop (tjanst_plan_save_row) går samma väg.
create or replace function public.tjanst_need(unit uuid,school_year integer,source_key text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.tjanst_need_in(public.tjanst_working_needs(unit,school_year),public.tjanst_group_needs(unit,school_year),source_key)
$$;

create or replace function public.tjanst_year_core(a public.access_assignments,unit uuid,year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;needs jsonb;people jsonb:='[]';p public.staff_people;
 duties jsonb;candidate jsonb;calendar jsonb;source_state jsonb;base jsonb;rows jsonb;specials jsonb;joints jsonb;person_hash text;groups jsonb;
begin
 if a.function not in ('rektor','administrator') or year is null or year not between 2000 and 2100 then
  raise exception 'Year planning denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year and x.customer_id=a.customer_id;
 select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc,x.version_no desc limit 1;
 needs:=public.tjanst_working_needs(unit,year); -- exactly once per request, passed through all row/batch calculations
 groups:=public.tjanst_group_needs(unit,year);
 for p in select x.* from public.staff_people x where x.customer_id=a.customer_id and x.organizer_id=a.organizer_id
  and public.tjanst_person_at_school(a,x.id,unit,year) order by x.family_name collate "C",x.given_name collate "C",x.id loop
  select coalesce(jsonb_agg(jsonb_build_object('dutyId',s.id,'startsOn',s.starts_on,'endsOn',s.ends_on,'percent',s.percent) order by s.starts_on,s.id),'[]') into duties
   from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
    and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(year,7,1),make_date(year+1,6,30),'[]');
  if jsonb_array_length(duties)>200 then raise exception 'Duty catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
  person_hash:=public.tjanst_year_hash('person',jsonb_build_object('unitId',unit,'schoolYear',year,'personId',p.id,
    'personRevision',p.revision,'draft',p.status='draft','duties',duties));
  candidate:=jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max((x.value->>'percent')::integer) from jsonb_array_elements(duties) x),'duties',duties,
   'personBasisHash',person_hash,'qualificationStatus','unknown');
  people:=people||jsonb_build_array(candidate);
 end loop;
 if jsonb_array_length(people)>5000 then raise exception 'Year catalog exceeds explicit limit' using errcode='54000',hint='tjanst_catalog_incomplete';end if;
 select jsonb_build_object('versionId',c.id,'version',c.version,'contentHash',coalesce(c.content_hash,public.lasar_content_hash(c.id)))
  into calendar from public.lasar_current(unit,year) c where c.id is not null;
 -- Include source revisions even where a source change leaves displayed minutes unchanged.
 select coalesce(jsonb_agg(jsonb_build_object('class',to_jsonb(c),'link',to_jsonb(l),'planRevision',t.revision,'planStatus',t.status,
   'planDecision',t.decided_on) order by c.id),'[]') into source_state
  from public.school_classes c join public.offerings o on o.id=c.offering_id left join public.class_timplans l on l.class_id=c.id and l.start_year=year
  left join public.timplans t on t.id=l.timplan_id where c.unit_id=unit and public.phase5_class_cohort_year_fits(c,year)
   and ((o.kind='gymnasium' and c.start_year between year-2 and year) or (o.kind<>'gymnasium' and c.start_year=year));
 select coalesce(jsonb_agg(jsonb_set(public.tjanst_row_json(r,public.tjanst_need_in(needs,groups,r.source_key)),'{jointGroupId}',coalesce((select to_jsonb(m.group_id) from public.tjanst_joint_members m where m.row_id=r.id),'null'::jsonb)) order by r.id),'[]')
  into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'lineageId',s.lineage_id,'kind',s.kind,'label',s.label,'personId',s.staff_person_id,
  'classId',s.class_id,'ht',s.ht_minutes,'vt',s.vt_minutes,'comment',s.comment) order by s.id),'[]') into specials
  from public.tjanst_special_assignments s where s.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('id',g.id,'lineageId',g.lineage_id,'name',g.name,
  'rowIds',coalesce((select jsonb_agg(m.row_id order by m.row_id) from public.tjanst_joint_members m where m.group_id=g.id),'[]'),
  'teachers',coalesce((select jsonb_agg(jsonb_build_object('personId',tt.staff_person_id,'ht',tt.ht_minutes,'vt',tt.vt_minutes) order by tt.staff_person_id)
    from public.tjanst_joint_teacher_time tt where tt.group_id=g.id),'[]')) order by g.id),'[]') into joints from public.tjanst_joint_groups g where g.version_id=v.id;
 base:=jsonb_build_object('contractVersion','tjanst_year_v1','unitId',unit,'schoolYear',year,'currentRevision',coalesce(d.revision,0),'baseVersionId',v.id);
 base:=base||jsonb_build_object('basisHash',public.tjanst_year_hash('basis',jsonb_build_object('customerId',a.customer_id,'actorId',a.membership_id,
  'assignmentId',a.id,'unitId',unit,'schoolYear',year,'baseVersionId',v.id,'currentRevision',coalesce(d.revision,0),'asOf',public.app_today(),
  'needs',needs,'sources',source_state,'calendar',calendar,'groups',groups)));
 return jsonb_build_object('base',base,'needs',needs,'groups',groups,'candidates',people,'rows',rows,'specials',specials,'joints',joints);
end 
$$;

create or replace function public.tjanst_plan_blockers(a public.access_assignments,v public.tjanst_versions,unit uuid,school_year integer,needs jsonb) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare result jsonb:='[]';groups jsonb;
begin
 if v.id is null or v.status<>'draft' then return result;end if;
 groups:=public.tjanst_group_needs(unit,school_year);
 if not exists(select 1 from public.tjanst_rows r where r.version_id=v.id) then
  result:=result||jsonb_build_array(jsonb_build_object('code','empty_draft','message','Utkastet har inga tjänsterader. Lägg till minst en rad före publicering.'));end if;
 if exists(select 1 from public.tjanst_rows r where r.version_id=v.id and (public.tjanst_row_json(r,public.tjanst_need_in(needs,groups,r.source_key))->>'stale')::boolean) then
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
 -- D-28: en samläsning har samma lärare för alla rader (eller bara vakanta rader); äldre blandade grupper repareras aldrig automatiskt.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct coalesce(r.staff_person_id::text,'vakant')) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)>1
   or (select count(*) from public.tjanst_joint_teacher_time t where t.group_id=g.id)>1)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_mixed_teachers','message','En samläsning har flera lärare. En samläsning ska ha samma lärare för alla klasser. Flytta uppdragen till samma lärare eller lös upp samläsningen.'));end if;
 -- 05.1-33 / D-31: två eller fler lärare med tid på samma behov kräver en angiven delningsform och minst en betygssättare med tid.
 if exists(select 1 from (select r.source_key from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null
   and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id) group by r.source_key having count(distinct r.staff_person_id)>1) x
   where not exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id and s.source_key=x.source_key)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','shared_need_unspecified','message','Två eller fler lärare har tid på samma kurs i en klass utan angiven delning. Ange om de undervisar en i taget eller samtidigt.'));end if;
 if exists(select 1 from public.tjanst_need_sharing s where s.version_id=v.id
   and (select count(distinct r.staff_person_id) from public.tjanst_rows r where r.version_id=v.id and r.source_key=s.source_key and r.staff_person_id is not null
    and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))>1
   and not exists(select 1 from public.tjanst_need_graders g join public.tjanst_rows r on r.version_id=v.id and r.source_key=g.source_key and r.staff_person_id=g.staff_person_id
    where g.version_id=v.id and g.source_key=s.source_key and not exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))) then
  result:=result||jsonb_build_array(jsonb_build_object('code','grader_missing','message','En delad kurs saknar lärare som sätter betyg. Ange vem eller vilka av lärarna som sätter betyget.'));end if;
 if exists(select 1 from jsonb_array_elements(needs) c cross join lateral jsonb_array_elements(c.value->'needs') n where coalesce((n.value->>'organizationPending')::boolean,false)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','organization_pending','message','Valbara tidsutrymmen återstår att organisera i undervisningsgrupper. Välj block för klasser som saknar block och skapa grupperna från det valbara blocket eller under Undervisningsgrupper innan tjänstefördelningen publiceras.'));end if;
 if exists(select 1 from jsonb_array_elements(groups) g where (g.value->>'stale')::boolean) then
  result:=result||jsonb_build_array(jsonb_build_object('code','group_sources_changed','message','Underlaget för undervisningsgrupper har ändrats. Granska grupperna och spara dem på nytt.'));end if;
 return result;
end 
$$;
