-- 05.1-26 / D-28: en samläsning har samma lärare för alla medverkande klasser, eller enbart vakanta rader.
-- Framåtmigration: installerade migrationer ändras inte. CREATE OR REPLACE bevarar ägare och ACL; inga nya ingångar eller grants.
-- tjanst_plan_save_joint nekar blandade lärare (22023/tjanst_joint_teacher_mismatch). Samma funktion används av vanligt kommando och årsvägen.
-- tjanst_plan_blockers (senast 20261023100000) får hindret joint_mixed_teachers för äldre blandade utkast. Publicerad historik ändras inte.
-- SS 12000: samläsningen motsvarar en undervisningsgrupp med en lärartilldelning; flerlärarskap hanteras separat. Inget informationsutbyte.

create or replace function public.tjanst_plan_save_joint(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);g public.tjanst_joint_groups;ids uuid[];
begin
 ids:=array(select (x.value#>>'{}')::uuid from jsonb_array_elements(p->'rowIds') x);
 if (select count(*) from public.tjanst_rows r where r.version_id=v.id and r.id=any(ids))<>cardinality(ids) then raise exception 'Unknown row' using errcode='22023',hint='tjanst_invalid';end if;
 if (select count(distinct r.class_id) from public.tjanst_rows r where r.id=any(ids))<2 then raise exception 'Too few classes' using errcode='22023',hint='tjanst_joint_too_few';end if;
 if p->'jointId'<>'null'::jsonb then
  select * into g from public.tjanst_joint_groups x where x.id=(p->>'jointId')::uuid and x.version_id=v.id;
  if not found then raise exception 'Unknown joint group' using errcode='22023',hint='tjanst_invalid';end if;
 end if;
 if exists(select 1 from public.tjanst_joint_members m where m.row_id=any(ids) and m.group_id is distinct from g.id) then
  raise exception 'Row already joint' using errcode='22023',hint='tjanst_joint_already';end if;
 if exists(select 1 from jsonb_array_elements(p->'teachers') t where not exists(select 1 from public.tjanst_rows r where r.id=any(ids)
   and r.staff_person_id=(t.value->>'personId')::uuid)) then raise exception 'Teacher not on joint rows' using errcode='22023',hint='tjanst_invalid';end if;
 -- D-28: samma lärare på alla rader, och lärartid bara för den läraren; eller enbart vakanta rader utan lärartid.
 if (select count(distinct coalesce(r.staff_person_id::text,'vakant')) from public.tjanst_rows r where r.id=any(ids))<>1
  or (select count(*) from public.tjanst_rows r where r.id=any(ids) and r.staff_person_id is not null)>0 and (jsonb_array_length(p->'teachers')<>1
   or (p->'teachers'->0->>'personId')::uuid is distinct from (select r.staff_person_id from public.tjanst_rows r where r.id=any(ids) limit 1))
  or (select count(*) from public.tjanst_rows r where r.id=any(ids) and r.staff_person_id is not null)=0 and jsonb_array_length(p->'teachers')<>0 then
  raise exception 'Joint rows have different teachers' using errcode='22023',hint='tjanst_joint_teacher_mismatch';end if;
 if g.id is null then insert into public.tjanst_joint_groups(version_id,lineage_id,name) values(v.id,gen_random_uuid(),p->>'name') returning * into g;
 else
  update public.tjanst_joint_groups set name=p->>'name' where id=g.id;
  delete from public.tjanst_joint_members where group_id=g.id;delete from public.tjanst_joint_teacher_time where group_id=g.id;
 end if;
 insert into public.tjanst_joint_members(group_id,row_id) select g.id,unnest(ids);
 insert into public.tjanst_joint_teacher_time(group_id,staff_person_id,ht_minutes,vt_minutes)
 select g.id,(t.value->>'personId')::uuid,(t.value->>'ht')::integer,(t.value->>'vt')::integer from jsonb_array_elements(p->'teachers') t;
 return v.id;
end $$;

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
 -- D-28: en samläsning har samma lärare för alla rader (eller bara vakanta rader); äldre blandade grupper repareras aldrig automatiskt.
 if exists(select 1 from public.tjanst_joint_groups g where g.version_id=v.id and (
   (select count(distinct coalesce(r.staff_person_id::text,'vakant')) from public.tjanst_joint_members m join public.tjanst_rows r on r.id=m.row_id where m.group_id=g.id)>1
   or (select count(*) from public.tjanst_joint_teacher_time t where t.group_id=g.id)>1)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','joint_mixed_teachers','message','En samläsning har flera lärare. En samläsning ska ha samma lärare för alla klasser. Flytta uppdragen till samma lärare eller lös upp samläsningen.'));end if;
 return result;
end $$;
