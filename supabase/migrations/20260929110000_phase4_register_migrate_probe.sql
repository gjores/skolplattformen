-- 04-03: bevara provens UUID, men bind mandat till beständiga registerobjekt.
-- Ingen egen COMMIT: migrationen körs atomiskt av migrationsverktyget och kan
-- återspelas inne i pgTAP:s rollback-fixtur. Inga objekt släpps med CASCADE.
-- Inventering före DDL: pg_constraint visar fem FK till probe_pupils/groups;
-- endast mandate_pupils, mandate_groups och probe_cases pekas om. Äldre
-- probe_group_members behåller sin stängda övergångskälla. PL/pgSQL-body-
-- beroenden syns inte alltid i pg_depend: även phase3_* funktionskällor lästes.
revoke all on function public.phase3_read_pupils(uuid,uuid,boolean) from public,anon,authenticated,skolplattform_worker;
revoke all on public.phase3_probe_pupils,public.phase3_probe_groups,
  public.phase3_probe_group_members,public.phase3_probe_cases from public,anon,authenticated,skolplattform_worker;

-- Deterministiskt UUID-format med version 3 (MD5) och RFC-variant 8.
create or replace function public.phase4_probe_uuid(value text) returns uuid
language sql immutable strict set search_path=pg_catalog as $$
 select overlay(overlay(md5('phase4-probe:'||value) placing '3' from 13 for 1) placing '8' from 17 for 1)::uuid
$$;
revoke all on function public.phase4_probe_uuid(text) from public,anon,authenticated,skolplattform_worker;

-- Avvisa tvetydig gammal grupptillhörighet: välj aldrig tyst bort ett mandat.
do $$begin
  if exists(select 1 from public.phase3_probe_group_members group by pupil_id having count(*)>1) then
    raise exception 'Ambiguous probe class membership' using errcode='23514';
  end if;
end $$;

-- En tydligt syntetisk utbildning per provskola; befintliga utbildningar ändras inte.
insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,start_year)
select public.phase4_probe_uuid('offering:'||u.unit_id),u.organizer_id,u.unit_id,
  'grundskola','Syntetisk provutbildning','Syntetisk migrering',
  extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end
from (select unit_id,organizer_id from public.phase3_probe_pupils union select unit_id,organizer_id from public.phase3_probe_groups) u
on conflict(id) do nothing;

-- Befintliga nummer används inte igen inom samma kund. Sortering ger reproducerbar tilldelning.
with pending as (
  select p.*,row_number() over(partition by customer_id order by id) n
  from public.phase3_probe_pupils p where not exists(select 1 from public.pupils r where r.id=p.id)
), available as (
  select c.customer_id,s.personal_number,row_number() over(partition by c.customer_id order by s.personal_number) n
  from (select distinct customer_id from pending) c cross join public.synthetic_pupil_numbers s
  where not exists(select 1 from public.pupils p where p.customer_id=c.customer_id and p.personal_number=s.personal_number)
)
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
select p.id,p.customer_id,p.organizer_id,p.display_name,a.personal_number,'Elev '||p.n
from pending p join available a on a.customer_id=p.customer_id and a.n=p.n;
do $$begin
  if exists(select 1 from public.phase3_probe_pupils p where not exists(select 1 from public.pupils r where r.id=p.id and r.customer_id=p.customer_id and r.organizer_id=p.organizer_id)) then
    raise exception 'Probe pupil migration incomplete' using errcode='23514';
  end if;
end $$;

insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
select g.id,g.customer_id,g.organizer_id,g.unit_id,public.phase4_probe_uuid('offering:'||g.unit_id),
 'PROV-'||upper(g.id::text),o.start_year
from public.phase3_probe_groups g join public.offerings o on o.id=public.phase4_probe_uuid('offering:'||g.unit_id)
on conflict(id) do nothing;
insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
select public.phase4_probe_uuid('placement:'||p.id),p.customer_id,p.organizer_id,p.id,p.unit_id,
 public.phase4_probe_uuid('offering:'||p.unit_id),make_date(o.start_year,7,1)
from public.phase3_probe_pupils p join public.offerings o on o.id=public.phase4_probe_uuid('offering:'||p.unit_id)
on conflict(id) do nothing;
insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
select public.phase4_probe_uuid('member:'||m.group_id||':'||m.pupil_id),m.customer_id,p.organizer_id,m.pupil_id,m.unit_id,m.group_id,
 p.id,p.starts_on from public.phase3_probe_group_members m join public.pupil_placements p on p.id=public.phase4_probe_uuid('placement:'||m.pupil_id)
on conflict(id) do nothing;

alter table public.mandate_pupils drop constraint mandate_pupils_pupil_id_customer_id_unit_id_fkey;
alter table public.mandate_pupils add constraint mandate_pupils_pupil_id_customer_id_unit_id_fkey
 foreign key(pupil_id,customer_id) references public.pupils(id,customer_id);
alter table public.mandate_groups drop constraint mandate_groups_group_id_customer_id_unit_id_fkey;
alter table public.mandate_groups add constraint mandate_groups_group_id_customer_id_unit_id_fkey
 foreign key(group_id,customer_id,unit_id) references public.school_classes(id,customer_id,unit_id);
alter table public.phase3_probe_cases drop constraint phase3_probe_cases_pupil_id_customer_id_unit_id_fkey;
alter table public.phase3_probe_cases add constraint phase3_probe_cases_pupil_id_customer_id_unit_id_fkey
 foreign key(pupil_id,customer_id) references public.pupils(id,customer_id);
-- Ärendets unit_id är självständigt historiskt scope; följer inte elevens flytt.
-- Kopplingen mellan kund och skola prövas av separat FK till skolans organisation.
alter table public.phase3_probe_cases drop constraint if exists phase4_case_school_fk;
alter table public.phase3_probe_cases add constraint phase4_case_school_fk foreign key(unit_id) references public.school_units(id);
create or replace function public.phase4_case_school_scope() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$begin
 if not exists(select 1 from public.school_units u join public.organizers o on o.id=u.organizer_id
   join public.pupils p on p.id=new.pupil_id and p.customer_id=new.customer_id and p.organizer_id=u.organizer_id
   where u.id=new.unit_id and o.customer_id=new.customer_id) then
   raise exception 'Case school scope denied' using errcode='23503'; end if;
 return new;
end $$;
revoke all on function public.phase4_case_school_scope() from public,anon,authenticated,skolplattform_worker;
drop trigger if exists phase4_case_school_scope on public.phase3_probe_cases;
create trigger phase4_case_school_scope before insert or update on public.phase3_probe_cases
for each row execute function public.phase4_case_school_scope();
do $$begin
 if exists(select 1 from public.phase3_probe_cases c where not exists(select 1 from public.school_units u
  join public.organizers o on o.id=u.organizer_id join public.pupils p on p.id=c.pupil_id and p.customer_id=c.customer_id and p.organizer_id=u.organizer_id where u.id=c.unit_id and o.customer_id=c.customer_id)) then
 raise exception 'Case school scope denied' using errcode='23503'; end if;
end $$;
