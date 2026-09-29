-- Syntetiska registerscenarion för 04-16. Kör endast efter assertTarget('protected')
-- och fas 3-fixturen. Provmarkör 44001600; fasta UUID och tillåtna TEST-nummer.
-- Idempotent utan radering. Befintliga elevrader och ändringar lämnas orörda.
begin;
do $$ begin
 if not exists(select 1 from public.school_units where id='33000000-0000-4000-8000-000000000111')
 or not exists(select 1 from public.synthetic_pupil_numbers where personal_number='TEST-20100101-4008') then
  raise exception 'Phase 3 base/reference data missing' using errcode='55000';
 end if;
end $$;
create temporary table phase4_fixture_pupils(id uuid, name text, number text, protected boolean, starts_on date, ends_on date, class_id uuid) on commit drop;
insert into phase4_fixture_pupils values
 ('44001600-0000-4000-8000-000000000201','Alex Prov','TEST-20100101-4008',false,public.app_today()-30,null,'33000000-0000-4000-8000-000000000311'),
 ('44001600-0000-4000-8000-000000000202','Alex Prov','TEST-20100101-4016',false,public.app_today()-30,null,'33000000-0000-4000-8000-000000000311'),
 ('44001600-0000-4000-8000-000000000203','Skyddad Provperson','TEST-20100101-4024',true,public.app_today()-30,null,'33000000-0000-4000-8000-000000000311'),
 ('44001600-0000-4000-8000-000000000204','Framtida Provperson','TEST-20100101-4032',false,public.app_today()+30,null,'44001600-0000-4000-8000-000000000311'),
 ('44001600-0000-4000-8000-000000000205','Avslutad Provperson','TEST-20100101-4040',false,public.app_today()-90,public.app_today()-30,'44001600-0000-4000-8000-000000000311'),
 ('44001600-0000-4000-8000-000000000206','Klassbyte Provperson','TEST-20100101-4057',false,public.app_today()-90,null,'44001600-0000-4000-8000-000000000312'),
 ('44001600-0000-4000-8000-000000000207','Kommunkälla Provperson','TEST-20100101-4065',false,public.app_today()-90,null,'33000000-0000-4000-8000-000000000311');
-- Annan utbildning på samma skola, så klassbytet får en tydlig varning.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year)
select '44001600-0000-4000-8000-000000000401','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000111','grundskola','Syntetisk annan utbildning','Prov 04-16',o.start_year
from public.offerings o where o.id=public.phase4_probe_uuid('offering:33000000-0000-4000-8000-000000000111') on conflict(id) do nothing;
insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
select g.id,'33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','33000000-0000-4000-8000-000000000111',g.offering_id,g.name,o.start_year
from (values
 ('44001600-0000-4000-8000-000000000311'::uuid,public.phase4_probe_uuid('offering:33000000-0000-4000-8000-000000000111'),'PROV-04-16-B'),
 ('44001600-0000-4000-8000-000000000312'::uuid,'44001600-0000-4000-8000-000000000401'::uuid,'PROV-04-16-ANNAN'))g(id,offering_id,name)
join public.offerings o on o.id=g.offering_id on conflict(id) do nothing;
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,protected_identity,anonymous_name)
select p.id,'33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011',p.name,p.number,p.protected,'Elev 04-'||right(p.id::text,3)
from phase4_fixture_pupils p on conflict(id) do nothing;
do $$ begin
 if exists(select 1 from phase4_fixture_pupils f left join public.pupils p on p.id=f.id where p.id is null or p.customer_id<>'33000000-0000-4000-8000-000000000001' or p.personal_number<>f.number) then
  raise exception 'Phase 4 fixture ID collision' using errcode='23514';
 end if;
end $$;
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on)
select public.phase4_probe_uuid('phase4-fixture-placement:'||p.id),'33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011',p.id,'33000000-0000-4000-8000-000000000111',public.phase4_probe_uuid('offering:33000000-0000-4000-8000-000000000111'),p.starts_on,p.ends_on
from phase4_fixture_pupils p where not exists(select 1 from public.pupil_placements x where x.pupil_id=p.id);
-- Klassbyte: två datumperioder, medan placeringsutbildningen är densamma.
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
select public.phase4_probe_uuid('phase4-fixture-class:'||p.id||':1'),'33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011',p.id,'33000000-0000-4000-8000-000000000111',case when p.id='44001600-0000-4000-8000-000000000206' then '33000000-0000-4000-8000-000000000311'::uuid else p.class_id end,
 public.phase4_probe_uuid('phase4-fixture-placement:'||p.id),p.starts_on,case when p.id='44001600-0000-4000-8000-000000000206' then public.app_today()-1 else p.ends_on end
from phase4_fixture_pupils p where not exists(select 1 from public.pupil_class_memberships x where x.pupil_id=p.id);
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
select '44001600-0000-4000-8000-000000000326','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','44001600-0000-4000-8000-000000000206','33000000-0000-4000-8000-000000000111','44001600-0000-4000-8000-000000000312',public.phase4_probe_uuid('phase4-fixture-placement:44001600-0000-4000-8000-000000000206'),public.app_today()
where not exists(select 1 from public.pupil_class_memberships x where x.pupil_id='44001600-0000-4000-8000-000000000206' and x.class_id='44001600-0000-4000-8000-000000000312');
-- Hemkommunbyte: två angränsande perioder med bevarad historik.
insert into public.pupil_home_municipalities(id,customer_id,organizer_id,pupil_id,municipality_code,starts_on,ends_on)
values ('44001600-0000-4000-8000-000000000371','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','44001600-0000-4000-8000-000000000207','0180',public.app_today()-90,public.app_today()-1)
on conflict(id) do nothing;
insert into public.pupil_home_municipalities(id,customer_id,organizer_id,pupil_id,municipality_code,starts_on)
values ('44001600-0000-4000-8000-000000000372','33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011','44001600-0000-4000-8000-000000000207','0380',public.app_today())
on conflict(id) do nothing;
-- 55 egna sökträffar gör serverns sortering, count och sida 2 observerbara.
-- Nummer väljs i fast lista efter de sju scenariernas nummer och ägs bara av
-- denna provmarkör. Inga befintliga elevrader ändras vid återkörning.
create temporary table phase4_page_pupils on commit drop as
select ('44001600-0000-4000-8000-'||lpad((500+n)::text,12,'0'))::uuid id,
 ('Sida Provperson '||lpad(n::text,2,'0')) name, s.personal_number
from generate_series(1,55) n
join lateral (
 select personal_number from public.synthetic_pupil_numbers
 where personal_number >= 'TEST-20100101-4107' order by personal_number limit 1 offset (n-1)
) s on true;
do $$begin
 if (select count(*) from phase4_page_pupils)<>55 or exists(select 1 from phase4_page_pupils f
 join public.pupils p on p.customer_id='33000000-0000-4000-8000-000000000001' and p.personal_number=f.personal_number and p.id<>f.id) then
  raise exception 'Phase 4 page fixture synthetic numbers unavailable' using errcode='23514';
 end if;
end$$;
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
select p.id,'33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011',p.name,p.personal_number,'Elev sida '||right(p.id::text,3)
from phase4_page_pupils p on conflict(id) do nothing;
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
select public.phase4_probe_uuid('phase4-fixture-placement:'||p.id),'33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000011',p.id,'33000000-0000-4000-8000-000000000111',public.phase4_probe_uuid('offering:33000000-0000-4000-8000-000000000111'),public.app_today()-30
from phase4_page_pupils p where not exists(select 1 from public.pupil_placements x where x.pupil_id=p.id);
commit;
