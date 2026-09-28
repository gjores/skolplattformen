-- Syntetisk relationsgrund för 03-02, portad till det beständiga elevregistret i 04-15.
-- Samma kund-, skol-, elev-, grupp- och ärende-ID som i fas 3. Eleverna finns i
-- pupils, grupperna är registerklasser och tillhörigheten är daterade placeringar och
-- klassmedlemskap med samma deterministiska ID som migreringen 20260929110000
-- (phase4_probe_uuid). Inga rader skrivs i phase3_probe_pupils/-groups/-group_members.
-- Läsår och startdatum härleds från app_today(); inga fasta kalenderdatum.
-- Idempotent: befintliga rader lämnas orörda och inget raderas. En elev som redan har
-- en placering eller ett klassmedlemskap (t.ex. ändrat via registret) får ingen ny rad.
-- Inga API-mandat aktiveras. Kör endast efter assertTarget(protected), som postgres,
-- efter att work/pilot/sql/phase4-reference-data.sql (syntetnummer) har lästs in.
begin;
do $$begin
 if not exists(select 1 from public.synthetic_pupil_numbers) then
  raise exception 'Synthetic pupil numbers missing: load work/pilot/sql/phase4-reference-data.sql first' using errcode='55000';
 end if;
end $$;
insert into public.customers(id,name) values ('33000000-0000-4000-8000-000000000001','Syntetisk fas 3 kund 1') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000001','Syntetisk huvudman 1','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33000000-0000-4000-8000-000000000021','https://phase3.example.test','synthetic-1') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33000000-0000-4000-8000-000000000031','33000000-0000-4000-8000-000000000021','33000000-0000-4000-8000-000000000001') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33000000-0000-4000-8000-000000000041','33000000-0000-4000-8000-000000000031','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33000000-0000-4000-8000-000000000111','33000000-0000-4000-8000-000000000011','33000011','Syntetisk skola 11','0000') on conflict do nothing;
insert into public.mandate_units values ('33000000-0000-4000-8000-000000000041','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33000000-0000-4000-8000-000000000112','33000000-0000-4000-8000-000000000011','33000012','Syntetisk skola 12','0000') on conflict do nothing;
insert into public.mandate_units values ('33000000-0000-4000-8000-000000000041','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.customers(id,name) values ('33000000-0000-4000-8000-000000000002','Syntetisk fas 3 kund 2') on conflict do nothing;
insert into public.organizers(id,customer_id,name,type) values ('33000000-0000-4000-8000-000000000012','33000000-0000-4000-8000-000000000002','Syntetisk huvudman 2','Kommun') on conflict do nothing;
insert into public.identities(id,issuer,subject) values ('33000000-0000-4000-8000-000000000022','https://phase3.example.test','synthetic-2') on conflict do nothing;
insert into public.memberships(id,identity_id,customer_id) values ('33000000-0000-4000-8000-000000000032','33000000-0000-4000-8000-000000000022','33000000-0000-4000-8000-000000000002') on conflict do nothing;
insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values ('33000000-0000-4000-8000-000000000042','33000000-0000-4000-8000-000000000032','33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000012','huvudman','synthetic-v1','school') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33000000-0000-4000-8000-000000000121','33000000-0000-4000-8000-000000000012','33000021','Syntetisk skola 21','0000') on conflict do nothing;
insert into public.mandate_units values ('33000000-0000-4000-8000-000000000042','33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000012','33000000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.school_units(id,organizer_id,code,name,municipality_code) values ('33000000-0000-4000-8000-000000000122','33000000-0000-4000-8000-000000000012','33000022','Syntetisk skola 22','0000') on conflict do nothing;
insert into public.mandate_units values ('33000000-0000-4000-8000-000000000042','33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000012','33000000-0000-4000-8000-000000000122') on conflict do nothing;
-- Registerelever, -klasser och daterad tillhörighet.
create temporary table phase3_fixture_pupils(id uuid,customer_id uuid,organizer_id uuid,unit_id uuid,display_name text) on commit drop;
insert into phase3_fixture_pupils values
('33000000-0000-4000-8000-000000000211'::uuid,'33000000-0000-4000-8000-000000000001'::uuid,'33000000-0000-4000-8000-000000000011'::uuid,'33000000-0000-4000-8000-000000000111'::uuid,'Syntetisk elev 11'),
('33000000-0000-4000-8000-000000000212'::uuid,'33000000-0000-4000-8000-000000000001'::uuid,'33000000-0000-4000-8000-000000000011'::uuid,'33000000-0000-4000-8000-000000000112'::uuid,'Syntetisk elev 12'),
('33000000-0000-4000-8000-000000000221'::uuid,'33000000-0000-4000-8000-000000000002'::uuid,'33000000-0000-4000-8000-000000000012'::uuid,'33000000-0000-4000-8000-000000000121'::uuid,'Syntetisk elev 21'),
('33000000-0000-4000-8000-000000000222'::uuid,'33000000-0000-4000-8000-000000000002'::uuid,'33000000-0000-4000-8000-000000000012'::uuid,'33000000-0000-4000-8000-000000000122'::uuid,'Syntetisk elev 22');
create temporary table phase3_fixture_classes(id uuid,customer_id uuid,organizer_id uuid,unit_id uuid) on commit drop;
insert into phase3_fixture_classes values
('33000000-0000-4000-8000-000000000311'::uuid,'33000000-0000-4000-8000-000000000001'::uuid,'33000000-0000-4000-8000-000000000011'::uuid,'33000000-0000-4000-8000-000000000111'::uuid),
('33000000-0000-4000-8000-000000000312'::uuid,'33000000-0000-4000-8000-000000000001'::uuid,'33000000-0000-4000-8000-000000000011'::uuid,'33000000-0000-4000-8000-000000000112'::uuid),
('33000000-0000-4000-8000-000000000321'::uuid,'33000000-0000-4000-8000-000000000002'::uuid,'33000000-0000-4000-8000-000000000012'::uuid,'33000000-0000-4000-8000-000000000121'::uuid),
('33000000-0000-4000-8000-000000000322'::uuid,'33000000-0000-4000-8000-000000000002'::uuid,'33000000-0000-4000-8000-000000000012'::uuid,'33000000-0000-4000-8000-000000000122'::uuid);
create temporary table phase3_fixture_members(class_id uuid,pupil_id uuid,customer_id uuid,unit_id uuid) on commit drop;
insert into phase3_fixture_members values
('33000000-0000-4000-8000-000000000311'::uuid,'33000000-0000-4000-8000-000000000211'::uuid,'33000000-0000-4000-8000-000000000001'::uuid,'33000000-0000-4000-8000-000000000111'::uuid),
('33000000-0000-4000-8000-000000000312'::uuid,'33000000-0000-4000-8000-000000000212'::uuid,'33000000-0000-4000-8000-000000000001'::uuid,'33000000-0000-4000-8000-000000000112'::uuid),
('33000000-0000-4000-8000-000000000321'::uuid,'33000000-0000-4000-8000-000000000221'::uuid,'33000000-0000-4000-8000-000000000002'::uuid,'33000000-0000-4000-8000-000000000121'::uuid),
('33000000-0000-4000-8000-000000000322'::uuid,'33000000-0000-4000-8000-000000000222'::uuid,'33000000-0000-4000-8000-000000000002'::uuid,'33000000-0000-4000-8000-000000000122'::uuid);
create temporary table phase3_fixture_year on commit drop as
 select extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end as start_year;
-- En tydligt syntetisk utbildning per provskola; befintliga utbildningar ändras inte.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year)
select distinct public.phase4_probe_uuid('offering:'||u.unit_id),u.organizer_id,u.unit_id,'grundskola'::public.offering_kind,'Syntetisk provutbildning','Syntetisk migrering',y.start_year
from (select unit_id,organizer_id from phase3_fixture_pupils union select unit_id,organizer_id from phase3_fixture_classes) u cross join phase3_fixture_year y
on conflict(id) do nothing;
-- Nya elever får lediga syntetnummer i samma reproducerbara ordning som migreringen.
with pending as (
 select p.*,row_number() over(partition by p.customer_id order by p.id) n
 from phase3_fixture_pupils p where not exists(select 1 from public.pupils r where r.id=p.id)
), available as (
 select c.customer_id,s.personal_number,row_number() over(partition by c.customer_id order by s.personal_number) n
 from (select distinct customer_id from pending) c cross join public.synthetic_pupil_numbers s
 where not exists(select 1 from public.pupils p where p.customer_id=c.customer_id and p.personal_number=s.personal_number)
)
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
select p.id,p.customer_id,p.organizer_id,p.display_name,a.personal_number,'Elev '||p.n
from pending p join available a on a.customer_id=p.customer_id and a.n=p.n;
do $$begin
 if exists(select 1 from phase3_fixture_pupils p where not exists(select 1 from public.pupils r
   where r.id=p.id and r.customer_id=p.customer_id and r.organizer_id=p.organizer_id)) then
  raise exception 'Phase 3 fixture pupil missing or bound to another customer' using errcode='23514';
 end if;
end $$;
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
select g.id,g.customer_id,g.organizer_id,g.unit_id,public.phase4_probe_uuid('offering:'||g.unit_id),'PROV-'||upper(g.id::text),o.start_year
from phase3_fixture_classes g join public.offerings o on o.id=public.phase4_probe_uuid('offering:'||g.unit_id)
on conflict(id) do nothing;
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
select public.phase4_probe_uuid('placement:'||p.id),p.customer_id,p.organizer_id,p.id,p.unit_id,
 public.phase4_probe_uuid('offering:'||p.unit_id),make_date(o.start_year,7,1)
from phase3_fixture_pupils p join public.offerings o on o.id=public.phase4_probe_uuid('offering:'||p.unit_id)
where not exists(select 1 from public.pupil_placements x where x.pupil_id=p.id);
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
select public.phase4_probe_uuid('member:'||m.class_id||':'||m.pupil_id),m.customer_id,pp.organizer_id,m.pupil_id,m.unit_id,m.class_id,pp.id,pp.starts_on
from phase3_fixture_members m join public.pupil_placements pp on pp.id=public.phase4_probe_uuid('placement:'||m.pupil_id)
where not exists(select 1 from public.pupil_class_memberships x where x.pupil_id=m.pupil_id);
-- Ärendena ligger kvar i phase3_probe_cases med FK till registrets elev.
insert into public.phase3_probe_cases values ('33000000-0000-4000-8000-000000000411','33000000-0000-4000-8000-000000000211','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000111') on conflict do nothing;
insert into public.phase3_probe_cases values ('33000000-0000-4000-8000-000000000412','33000000-0000-4000-8000-000000000212','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000112') on conflict do nothing;
insert into public.phase3_probe_cases values ('33000000-0000-4000-8000-000000000421','33000000-0000-4000-8000-000000000221','33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000121') on conflict do nothing;
insert into public.phase3_probe_cases values ('33000000-0000-4000-8000-000000000422','33000000-0000-4000-8000-000000000222','33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000122') on conflict do nothing;
commit;
