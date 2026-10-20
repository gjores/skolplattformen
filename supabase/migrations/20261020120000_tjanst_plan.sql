-- 05.1-06: Tjänstefördelningens fördelning, behov, versioner och lärarens egen läsning (etapp 1).
-- Behovet hämtas alltid på servern ur identifierade klass–timplanskopplingar (D-04, D-17, D-21, D-22) och lagras som
-- ögonblicksbild på tjänsteraden tillsammans med typad källa (source_kind, source_key). Lärartiden lagras skilt (D-06).
-- Publicerad version är oföränderlig; ändring efter publicering blir nytt utkast med samma lineage_id (D-05, D-24).
-- Bara rektor publicerar (D-01). Läraren läser bara publicerade rader för den person som bindningen pekar ut (D-03).
-- Bygger på 20261020100000 (GR/IM-koppling) och 20261020110000 (personal, tjanst_actor, tjanst_hash, journal).
-- SS 12000 (avsedd kompatibilitet): tjänsterad ↔ Activity med teachers[] (DutyAssignment); behovsminuter ↔
-- Activity.minutesPlanned och lärarminuter ↔ DutyAssignment.minutesPlanned i skilda kolumner; klassen ↔ groups.

-- 1. Tabeller. RLS tvingas och klientroller saknar rättigheter; allt går genom entrypoints.
create table public.tjanst_distributions (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null,
 organizer_id uuid not null,
 unit_id uuid not null,
 school_year integer not null check(school_year between 2000 and 2100),
 revision integer not null default 0 check(revision>=0),
 created_at timestamptz not null default clock_timestamp(),
 unique(unit_id,school_year),
 unique(id,unit_id,school_year),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
create table public.tjanst_versions (
 id uuid primary key default gen_random_uuid(),
 distribution_id uuid not null references public.tjanst_distributions(id),
 version_no integer not null check(version_no>=1),
 status text not null check(status in ('draft','published','superseded','discarded')),
 based_on_version_id uuid references public.tjanst_versions(id),
 content_hash text check(content_hash is null or content_hash~'^sha256:[0-9a-f]{64}$'),
 created_by_identity_id uuid not null references public.identities(id),
 created_by_assignment_id uuid not null references public.access_assignments(id),
 created_at timestamptz not null default clock_timestamp(),
 published_by_identity_id uuid references public.identities(id),
 published_by_assignment_id uuid references public.access_assignments(id),
 published_at timestamptz,
 unique(distribution_id,version_no),
 check((status in ('published','superseded'))=(published_at is not null and published_by_identity_id is not null
  and published_by_assignment_id is not null and content_hash is not null))
);
create unique index tjanst_versions_one_draft on public.tjanst_versions(distribution_id) where status='draft';
create unique index tjanst_versions_one_published on public.tjanst_versions(distribution_id) where status='published';
create table public.tjanst_version_teachers (
 version_id uuid not null references public.tjanst_versions(id),
 staff_person_id uuid not null references public.staff_people(id),
 primary key(version_id,staff_person_id)
);
create table public.tjanst_rows (
 id uuid primary key default gen_random_uuid(),
 version_id uuid not null references public.tjanst_versions(id),
 lineage_id uuid not null,
 staff_person_id uuid references public.staff_people(id),
 source_kind text not null check(source_kind in ('class_timplan')),
 source_key text not null check(length(source_key) between 1 and 240),
 class_id uuid not null references public.school_classes(id),
 school_year integer not null check(school_year between 2000 and 2100),
 link_revision integer not null check(link_revision>=0),
 timplan_id uuid not null references public.timplans(id),
 series_id uuid not null,
 timplan_version integer not null check(timplan_version>=1),
 timplan_row_key text not null check(length(timplan_row_key) between 1 and 160),
 link_column text not null check(link_column~'^(ar[1-3]|ak[1-9]|vecka)$'),
 need_label text not null check(length(need_label) between 1 and 300),
 need_ht_minutes integer check(need_ht_minutes between 0 and 200000),
 need_vt_minutes integer check(need_vt_minutes between 0 and 200000),
 need_basis text not null check(need_basis in ('terms','even_split','weekly_calendar')),
 teacher_ht_minutes integer not null check(teacher_ht_minutes between 0 and 200000),
 teacher_vt_minutes integer not null check(teacher_vt_minutes between 0 and 200000),
 comment text not null default '' check(char_length(comment)<=2000),
 check(teacher_ht_minutes+teacher_vt_minutes>0),
 check(source_key='class_timplan:'||class_id::text||':'||school_year::text||':'||timplan_row_key)
);
create unique index tjanst_rows_lineage on public.tjanst_rows(version_id,lineage_id);
create unique index tjanst_rows_teacher_source on public.tjanst_rows(version_id,staff_person_id,source_key) where staff_person_id is not null;
create unique index tjanst_rows_vacant_source on public.tjanst_rows(version_id,source_key) where staff_person_id is null;

do $$declare n text;begin
 foreach n in array array['tjanst_distributions','tjanst_versions','tjanst_version_teachers','tjanst_rows'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('alter table public.%I force row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
 end loop;
end $$;

-- En publicerad, ersatt eller kasserad version ändras aldrig: rader och lärarkolumner bara i utkast,
-- och versionen får bara gå utkast → publicerad/kasserad eller publicerad → ersatt.
create function public.tjanst_version_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare v_status text;
begin
 if tg_op='TRUNCATE' then raise exception 'Tjänstefördelningens versioner får inte tömmas.' using errcode='42501';end if;
 if tg_table_name='tjanst_versions' then
  if tg_op='DELETE' then raise exception 'En version kan inte tas bort.' using errcode='42501';end if;
  if (to_jsonb(new)-array['status','content_hash','published_by_identity_id','published_by_assignment_id','published_at'])
    is distinct from (to_jsonb(old)-array['status','content_hash','published_by_identity_id','published_by_assignment_id','published_at'])
   or not ((old.status='draft' and new.status in ('published','discarded')) or (old.status='published' and new.status='superseded'))
   or (old.status='published' and (new.content_hash,new.published_at,new.published_by_identity_id,new.published_by_assignment_id)
    is distinct from (old.content_hash,old.published_at,old.published_by_identity_id,old.published_by_assignment_id)) then
   raise exception 'En publicerad version är oföränderlig.' using errcode='42501';end if;
  return new;
 end if;
 select v.status into v_status from public.tjanst_versions v where v.id=case when tg_op='DELETE' then old.version_id else new.version_id end;
 if v_status is distinct from 'draft' or (tg_op='UPDATE' and old.version_id<>new.version_id) then
  raise exception 'Bara ett utkast kan ändras.' using errcode='42501';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger tjanst_versions_guard before update or delete on public.tjanst_versions for each row execute function public.tjanst_version_guard();
create trigger tjanst_versions_no_truncate before truncate on public.tjanst_versions for each statement execute function public.tjanst_version_guard();
create trigger tjanst_rows_guard before insert or update or delete on public.tjanst_rows for each row execute function public.tjanst_version_guard();
create trigger tjanst_rows_no_truncate before truncate on public.tjanst_rows for each statement execute function public.tjanst_version_guard();
create trigger tjanst_version_teachers_guard before insert or update or delete on public.tjanst_version_teachers for each row execute function public.tjanst_version_guard();
create trigger tjanst_version_teachers_no_truncate before truncate on public.tjanst_version_teachers for each statement execute function public.tjanst_version_guard();

-- 2. Audit: samma funktion som 05.1-03 med planens och egen-vägens åtgärder tillagda.
create or replace function public.tjanst_audit(operation text,object_type text,object_id uuid,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation is null or operation not in ('tjanst_personal_read','tjanst_personal_status_read','tjanst_person_created','tjanst_person_updated',
   'tjanst_draft_teacher_created','tjanst_employment_saved','tjanst_duties_saved',
   'tjanst_plan_read','tjanst_plan_command','tjanst_plan_published','tjanst_plan_status_read','tjanst_self_read')
  or object_type is null or object_type not in ('staff_person','tjanst_command','tjanst_distribution','tjanst_version')
  or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid service allocation audit' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,object_type,object_id,'ok',details);
 exception when others then raise exception 'Service allocation audit unavailable' using errcode='55000';end;
end $$;

-- 3. Behov. Svenska allmänna helgdagar (lagen 1989:253) som lasar-model.ts publicHolidays.
create function public.tjanst_easter(y integer) returns date
language plpgsql immutable set search_path=pg_catalog as $$
declare a int:=y%19;b int:=y/100;c int:=y%100;d int;e int;f int;g int;h int;i int;k int;l int;m int;mo int;da int;
begin
 d:=b/4;e:=b%4;f:=(b+8)/25;g:=(b-f+1)/3;h:=(19*a+b-d-g+15)%30;i:=c/4;k:=c%4;l:=(32+2*e+2*i-h-k)%7;m:=(a+11*h+22*l)/451;
 mo:=(h+l-7*m+114)/31;da:=((h+l-7*m+114)%31)+1;
 return make_date(y,mo,da);
end $$;
create function public.tjanst_is_holiday(day date) returns boolean
language plpgsql immutable set search_path=pg_catalog as $$
declare y int:=extract(year from day)::int;easter date:=public.tjanst_easter(extract(year from day)::int);
begin
 return day in (make_date(y,1,1),make_date(y,1,6),easter-2,easter,easter+1,make_date(y,5,1),easter+39,easter+49,make_date(y,6,6),
  make_date(y,6,20)+((6-extract(dow from make_date(y,6,20))::int+7)%7),make_date(y,10,31)+((6-extract(dow from make_date(y,10,31))::int+7)%7),
  make_date(y,12,25),make_date(y,12,26));
end $$;
-- Skoldagar per termin ur en fastställd läsårskalender: vardagar inom terminen som varken är helgdag eller lov-/studiedag.
-- Saknas kalender eller är den inte fastställd blir resultatet null (”underlag saknas”), aldrig 0.
create function public.tjanst_school_weeks(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare y public.school_years;ht integer;vt integer;
begin
 select * into y from public.school_years s where s.unit_id=unit and s.start_year=school_year and s.status='faststalld';
 if not found then return null;end if;
 select count(*) filter (where d<=y.ht_end),count(*) filter (where d>=y.vt_start) into ht,vt
 from generate_series(y.ht_start,y.vt_end,interval '1 day') g(x) cross join lateral (select g.x::date d) dd
 where (d between y.ht_start and y.ht_end or d between y.vt_start and y.vt_end) and extract(isodow from d)<6 and not public.tjanst_is_holiday(d)
  and not exists(select 1 from public.school_year_days e where e.school_year_id=y.id and e.day=d);
 return jsonb_build_object('htSchoolDays',ht,'vtSchoolDays',vt);
end $$;
create function public.tjanst_grim_label(row_id text) returns text
language sql immutable set search_path=pg_catalog as $$
 select coalesce((select l from (values('bild','Bild'),('engelska','Engelska'),('hkk','Hem- och konsumentkunskap'),('idrott','Idrott och hälsa'),
  ('matematik','Matematik'),('musik','Musik'),('no','Naturorienterande ämnen'),('biologi','Biologi'),('fysik','Fysik'),('kemi','Kemi'),
  ('so','Samhällsorienterande ämnen'),('geografi','Geografi'),('historia','Historia'),('religion','Religionskunskap'),('samhallskunskap','Samhällskunskap'),
  ('slojd','Slöjd'),('svenska','Svenska eller svenska som andraspråk'),('teknik','Teknik'),('sprakval','Språkval'),('skolansval','Skolans val'),
  ('im-sv','Svenska eller svenska som andraspråk, grundskolenivå'),('im-ma','Matematik, grundskolenivå'),('im-en','Engelska, grundskolenivå'),
  ('im-sh','Samhällskunskap, grundskolenivå'),('im-idh','Idrott och hälsa'),('im-praktik','Praktik och yrkesorientering'),
  ('im-mentor','Studiehandledning och mentorstid')) x(k,l) where k=row_id),row_id)
$$;

-- Läsbar etikett för en Gy25-rad ur den frusna katalogen (kursens namn), valblockets namn eller nyckeln som reserv.
create function public.tjanst_gy_label(basis jsonb,key text) returns text
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare cat jsonb;seg text;parts text[];nm text;names text[]:='{}';
begin
 if key like 'block:%' then
  return coalesce((select left(b.value->>'name',300) from jsonb_array_elements(coalesce(basis->'basisReference'->'choiceBlocks','[]'::jsonb)) b
   where b.value->>'id'=substr(key,7) and length(b.value->>'name')>0 limit 1),key);
 end if;
 select c.payload into cat from public.programplan_catalogs c where c.catalog_id=basis->>'catalogId';
 foreach seg in array string_to_array(regexp_replace(key,'^(alternative:)?[A-Za-z]+:',''),'+') loop
  parts:=string_to_array(seg,':');nm:=null;
  if array_length(parts,1)=3 then
   select i.value->>'name' into nm from jsonb_array_elements(coalesce(cat->'subjects','[]'::jsonb)) sub cross join lateral jsonb_array_elements(coalesce(sub.value->'items','[]'::jsonb)) i
   where sub.value->>'code'=parts[1] and sub.value->>'version'=parts[2] and i.value->>'code'=parts[3] limit 1;
  end if;
  names:=names||coalesce(nm,seg);
 end loop;
 return coalesce(nullif(left(array_to_string(names,' / '),300),''),key);
end $$;

-- Klasserna på skolan för läsåret med identifierad koppling och behov. Bara identifierade kopplingar (class_id) ger behov;
-- namnrader och okopplade klasser ger link null och inga behov, aldrig nollor.
--   Gy25: rader ur frusna gym_basis (meta:* utesluts, valblock ingår), aktiva i läsår N enligt distributionen.
--         v2: skolminuter index HT 2(N-1), VT 2(N-1)+1; utan v2: årets timmar 50/50 (even_split). APL-minuter ingår aldrig.
--   GR:   årstimmar för ak{n} delas 50/50; åk 1–3 räknar NO/SO som grupprad, åk 4–9 delraderna, aldrig båda.
--   IM:   veckotimmar × 12 × skoldagar per termin ur fastställd kalender, annars null.
create function public.tjanst_needs(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare c record;t public.timplans;o public.offerings;l public.class_timplans;needs jsonb;classes jsonb:='[]';n integer;i integer;r jsonb;
 v2 boolean;mins jsonb;ht jsonb;vt jsonb;hours smallint[];alloc boolean[];weeks jsonb;grades smallint[];idx integer;key text;series jsonb;
begin
 weeks:=public.tjanst_school_weeks(unit,school_year);
 for c in select sc.*,f.kind offering_kind from public.school_classes sc join public.offerings f on f.id=sc.offering_id
  where sc.unit_id=unit and public.phase5_class_cohort_year_fits(sc,school_year)
   and ((f.kind='gymnasium' and sc.start_year between school_year-2 and school_year) or (f.kind<>'gymnasium' and sc.start_year=school_year))
  order by sc.name collate "C",sc.id loop
  select * into l from public.class_timplans x where x.class_id=c.id and x.start_year=school_year;
  if not found then classes:=classes||jsonb_build_array(jsonb_build_object('classId',c.id,'name',c.name,'link',null,'needs','[]'::jsonb));continue;end if;
  select * into t from public.timplans where id=l.timplan_id;select * into o from public.offerings where id=t.offering_id;
  series:=public.phase5_named_timplan_plan_series(t.id);needs:='[]';
  if t.gym_basis is not null then
   n:=substr(l.column_id,3)::integer;i:=2*(n-1);
   v2:=exists(select 1 from public.timplan_time_models tm where tm.plan_id=t.id);
   for r in select x.value from jsonb_array_elements(t.gym_basis->'rows') x order by x.value->>'key' collate "C" loop
    key:=r->>'key';
    continue when key like 'meta:%';
    select d.value->'points' into mins from jsonb_array_elements(t.gym_basis->'distribution') d where d.value->>'rowKey'=key;
    continue when mins is null or coalesce((mins->>i)::integer,0)+coalesce((mins->>(i+1))::integer,0)=0;
    if v2 then
     select cell.school_minutes into mins from public.timplan_time_cells_v2 cell where cell.plan_id=t.id and cell.row_key=key;
     ht:=coalesce(mins->i,'null'::jsonb);vt:=coalesce(mins->(i+1),'null'::jsonb);
     needs:=needs||jsonb_build_array(jsonb_build_object('rowKey',key,'label',public.tjanst_gy_label(t.gym_basis,key),'needHt',ht,'needVt',vt,'needBasis','terms'));
    else
     select cell.hours,cell.allocated into hours,alloc from public.timplan_cells cell where cell.timplan_id=t.id and cell.row_id=key;
     ht:=case when coalesce(alloc[i+1],false) and hours[i+1] is not null then to_jsonb(hours[i+1]) else 'null'::jsonb end;
     vt:=case when coalesce(alloc[i+2],false) and hours[i+2] is not null then to_jsonb(hours[i+2]) else 'null'::jsonb end;
     -- Utan v2-tid: årets timmar delas 50/50 och märks even_split (05.1-02, kontrollpunktsbeslut A).
     ht:=case when ht='null'::jsonb and vt='null'::jsonb then 'null'::jsonb
      else to_jsonb((coalesce((ht#>>'{}')::integer,0)+coalesce((vt#>>'{}')::integer,0))*30) end;
     needs:=needs||jsonb_build_array(jsonb_build_object('rowKey',key,'label',public.tjanst_gy_label(t.gym_basis,key),
      'needHt',ht,'needVt',ht,'needBasis','even_split'));
    end if;
   end loop;
  elsif o.kind='grundskola' then
   n:=substr(l.column_id,3)::integer;grades:=coalesce(o.grades,array[1,2,3,4,5,6,7,8,9]::smallint[]);idx:=array_position(grades,n::smallint);
   for key,hours in select cell.row_id,cell.hours from public.timplan_cells cell where cell.timplan_id=t.id order by cell.row_id collate "C" loop
    continue when idx is null or hours[idx] is null or hours[idx]=0;
    continue when n<=3 and key in ('biologi','fysik','kemi','geografi','historia','religion','samhallskunskap');
    continue when n>3 and key in ('no','so');
    needs:=needs||jsonb_build_array(jsonb_build_object('rowKey',key,'label',public.tjanst_grim_label(key),'needHt',hours[idx]*30,'needVt',hours[idx]*30,'needBasis','even_split'));
   end loop;
  else
   for key,hours in select cell.row_id,cell.hours from public.timplan_cells cell where cell.timplan_id=t.id order by cell.row_id collate "C" loop
    continue when hours[1] is null or hours[1]=0;
    needs:=needs||jsonb_build_array(jsonb_build_object('rowKey',key,'label',public.tjanst_grim_label(key),
     'needHt',case when weeks is null then null else hours[1]*12*(weeks->>'htSchoolDays')::integer end,
     'needVt',case when weeks is null then null else hours[1]*12*(weeks->>'vtSchoolDays')::integer end,'needBasis','weekly_calendar'));
   end loop;
  end if;
  classes:=classes||jsonb_build_array(jsonb_build_object('classId',c.id,'name',c.name,
   'link',jsonb_build_object('linkRevision',l.revision,'timplanId',t.id,'seriesId',t.series_id,'seriesName',series->>'name','timplanVersion',t.version,
    'column',l.column_id,'schoolform',o.kind),
   'needs',(select coalesce(jsonb_agg(x.value||jsonb_build_object('sourceKind','class_timplan',
     'sourceKey','class_timplan:'||c.id::text||':'||school_year::text||':'||(x.value->>'rowKey'))),'[]'::jsonb) from jsonb_array_elements(needs) x)));
 end loop;
 return classes;
end $$;
-- Ett behov med sin kopplings ögonblicksbild, eller null om källan inte finns för skolan och läsåret.
create function public.tjanst_need(unit uuid,school_year integer,source_key text) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select x.value||jsonb_build_object('classId',c.value->>'classId','link',c.value->'link')
 from jsonb_array_elements(public.tjanst_needs(unit,school_year)) c cross join lateral jsonb_array_elements(c.value->'needs') x
 where x.value->>'sourceKey'=source_key limit 1
$$;

-- 4. Hjälpfunktioner för plan.
create function public.tjanst_plan_scope(a public.access_assignments,unit uuid) returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if unit is null or not exists(select 1 from public.mandate_units m join public.school_units u on u.id=m.unit_id
   where m.assignment_id=a.id and m.unit_id=unit and u.organizer_id=a.organizer_id) then
  raise exception 'Service allocation denied' using errcode='42501';end if;
end $$;
-- D-11: en person hör till skolan med ett skoluppdrag som överlappar läsåret, eller som rektors utkastlärare för skolan.
create function public.tjanst_person_at_school(a public.access_assignments,person uuid,unit uuid,school_year integer) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.staff_people p where p.id=person and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
  and (exists(select 1 from public.staff_school_duties d where d.staff_person_id=p.id and d.unit_id=unit
    and daterange(d.starts_on,d.ends_on,'[]')&&daterange(make_date(school_year,7,1),make_date(school_year+1,6,30),'[]'))
   or (p.status='draft' and p.proposed_for_unit_id=unit)))
$$;
create function public.tjanst_row_json(r public.tjanst_rows,current_need jsonb) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',r.id,'lineageId',r.lineage_id,'sourceKind',r.source_kind,'sourceKey',r.source_key,'classId',r.class_id,
  'rowKey',r.timplan_row_key,'personId',r.staff_person_id,'teacherHt',r.teacher_ht_minutes,'teacherVt',r.teacher_vt_minutes,
  'needHt',r.need_ht_minutes,'needVt',r.need_vt_minutes,'needBasis',r.need_basis,
  -- Ändrad koppling eller behov markerar raden; ögonblicksbilden skrivs aldrig om tyst (P6).
  'stale',current_need is null or (current_need->'link'->>'linkRevision')::integer<>r.link_revision or (current_need->'link'->>'timplanId')::uuid<>r.timplan_id
   or current_need->>'needBasis'<>r.need_basis or (current_need->>'needHt')::integer is distinct from r.need_ht_minutes
   or (current_need->>'needVt')::integer is distinct from r.need_vt_minutes,
  'jointGroupId',null,'comment',r.comment)
$$;
-- Innehållshashen binder läsår, skola, lärarkolumner och rader (inte id eller status), så att publicering prövar exakt det granskade.
create function public.tjanst_version_hash(version uuid) returns text
language sql stable security definer set search_path=pg_catalog,public as $$
 select public.tjanst_hash(jsonb_build_array('tjanst_content_v1',d.unit_id,d.school_year,
  coalesce((select jsonb_agg(t.staff_person_id order by t.staff_person_id) from public.tjanst_version_teachers t where t.version_id=v.id),'[]'::jsonb),
  coalesce((select jsonb_agg(jsonb_build_array(r.lineage_id,r.source_key,r.staff_person_id,r.link_revision,r.timplan_id,r.timplan_version,r.link_column,
    r.need_ht_minutes,r.need_vt_minutes,r.need_basis,r.teacher_ht_minutes,r.teacher_vt_minutes,r.comment) order by r.lineage_id)
   from public.tjanst_rows r where r.version_id=v.id),'[]'::jsonb)))
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where v.id=version
$$;
create function public.tjanst_version_json(v public.tjanst_versions) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',v.id,'versionNo',v.version_no,'status',v.status,'contentHash',coalesce(v.content_hash,public.tjanst_version_hash(v.id)),
  'basedOnVersionId',v.based_on_version_id,
  'publishedByName',case when v.published_at is null then null else coalesce(nullif((select left(i.display_name,200) from public.identities i where i.id=v.published_by_identity_id),''),'Rektor') end,
  'publishedAt',case when v.published_at is null then null else to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end)
$$;
create function public.tjanst_plan_blockers(a public.access_assignments,v public.tjanst_versions,unit uuid,school_year integer,needs jsonb) returns jsonb
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
   union select r.staff_person_id from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id is not null) x
   where not public.tjanst_person_at_school(a,x.p,unit,school_year)) then
  result:=result||jsonb_build_array(jsonb_build_object('code','person_not_at_school','message','En lärare saknar giltigt skoluppdrag på skolan för läsåret.'));end if;
 return result;
end $$;

-- Läsning: utan versionId visas utkastet om det finns, annars den publicerade versionen. Med versionId visas en publicerad
-- eller ersatt version i sin helhet, skrivskyddad (D-24). Svaret bär actions, blockers och capabilities (servern avgör).
create function public.tjanst_plan_projection(a public.access_assignments,unit uuid,school_year integer,version_id uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare d public.tjanst_distributions;v public.tjanst_versions;needs jsonb;rows jsonb;teachers jsonb;versions jsonb;blockers jsonb;
 history boolean:=version_id is not null;editing boolean;actions text[]:='{}';
begin
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=tjanst_plan_projection.school_year;
 if history then
  select * into v from public.tjanst_versions x where x.id=version_id and x.distribution_id=d.id and x.status in ('published','superseded');
  if not found then raise exception 'Service allocation denied' using errcode='42501';end if;
 else
  select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status in ('draft','published') order by (x.status='draft') desc limit 1;
 end if;
 needs:=public.tjanst_needs(unit,school_year);
 select coalesce(jsonb_agg(public.tjanst_row_json(r,(select x.value||jsonb_build_object('link',c.value->'link') from jsonb_array_elements(needs) c
   cross join lateral jsonb_array_elements(c.value->'needs') x where x.value->>'sourceKey'=r.source_key limit 1))
   order by r.source_key collate "C",r.staff_person_id nulls last,r.id),'[]'::jsonb) into rows from public.tjanst_rows r where r.version_id=v.id;
 select coalesce(jsonb_agg(jsonb_build_object('personId',p.id,'displayName',left(p.given_name||' '||p.family_name,200),'draft',p.status='draft',
   'shareHere',(select max(s.percent) from public.staff_school_duties s where s.staff_person_id=p.id and s.unit_id=unit
     and daterange(s.starts_on,s.ends_on,'[]')&&daterange(make_date(school_year,7,1),make_date(school_year+1,6,30),'[]')))
   order by p.family_name collate "C",p.given_name collate "C",p.id),'[]'::jsonb) into teachers
 from public.staff_people p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
  and (exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id));
 select coalesce(jsonb_agg(public.tjanst_version_json(x) order by x.version_no desc),'[]'::jsonb) into versions
 from public.tjanst_versions x where x.distribution_id=d.id and x.status<>'discarded';
 blockers:=case when history then '[]'::jsonb else public.tjanst_plan_blockers(a,v,unit,school_year,needs) end;
 editing:=not history and a.function in ('rektor','administrator');
 if editing and coalesce(v.status='draft',false) then actions:=array['add_teacher','save_row','delete_row','discard_draft'];
  if a.function='rektor' and jsonb_array_length(blockers)=0 then actions:=actions||'publish'::text;end if;
 elsif editing then actions:=array['create_draft'];end if;
 return jsonb_build_object('contractVersion','tjanst_v1','unitId',unit,'schoolName',(select u.name from public.school_units u where u.id=unit),
  'schoolYear',school_year,'revision',coalesce(d.revision,0),'version',case when v.id is null then null else public.tjanst_version_json(v) end,
  'versions',versions,'teachers',teachers,
  'classes',(select coalesce(jsonb_agg(c.value-'needs'||jsonb_build_object('needs',(select coalesce(jsonb_agg(x.value-'classId'-'link'),'[]'::jsonb)
    from jsonb_array_elements(c.value->'needs') x))),'[]'::jsonb) from jsonb_array_elements(needs) c),
  'rows',rows,'specials','[]'::jsonb,'joints','[]'::jsonb,'actions',to_jsonb(actions),'blockers',blockers,
  'capabilities',jsonb_build_object('canEdit',editing and coalesce(v.status='draft',false),
   'canPublish',editing and coalesce(v.status='draft',false) and a.function='rektor' and jsonb_array_length(blockers)=0,
   'canReadHistory',true));
end $$;

create function public.tjanst_plan_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;unit uuid;year integer;version uuid;result jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or not (input ? 'unitId' and input ? 'schoolYear')
  or exists(select 1 from jsonb_object_keys(input) k where k not in ('unitId','schoolYear','versionId'))
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) then
  raise exception 'Invalid service allocation read' using errcode='22023',hint='tjanst_invalid';end if;
 unit:=public.tjanst_uuid(input->'unitId');year:=(input->>'schoolYear')::integer;
 if input ? 'versionId' then version:=public.tjanst_uuid(input->'versionId');end if;
 a:=public.tjanst_actor('plan');perform public.tjanst_plan_scope(a,unit);
 result:=public.tjanst_plan_projection(a,unit,year,version);
 perform public.tjanst_audit('tjanst_plan_read','tjanst_distribution',(select d.id from public.tjanst_distributions d where d.unit_id=unit and d.school_year=year),
  jsonb_build_object('unitId',unit,'schoolYear',year,'versionId',version));
 return result;
end $$;

-- 5. Kommandon. Tolkning speglar parsePlanCommand; 05.1-08 byter tolkning och dispatcher när specialuppdrag och samläsning läggs till.
create function public.tjanst_plan_parse(input jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare action_name text;p jsonb;payload jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'action') is distinct from 'string'
  or input->>'action' not in ('create_draft','add_teacher','save_row','delete_row','discard_draft','publish')
  or not public.phase5_programplan_shape(input,array['commandId','unitId','schoolYear','action','expectedRevision','payloadHash','payload']
   ||case when input->>'action'='publish' then array['expectedContentHash'] else '{}'::text[] end)
  or not public.phase5_programplan_integer(input->'schoolYear',2000,2100) or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483647)
  or jsonb_typeof(input->'payloadHash') is distinct from 'string' or input->>'payloadHash'!~'^sha256:[0-9a-f]{64}$'
  or (input->>'action'='publish' and (jsonb_typeof(input->'expectedContentHash') is distinct from 'string' or input->>'expectedContentHash'!~'^sha256:[0-9a-f]{64}$')) then
  raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
 action_name:=input->>'action';p:=input->'payload';
 if action_name='create_draft' then
  if not public.phase5_programplan_shape(p,array['basedOnVersionId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('basedOnVersionId',case when p->'basedOnVersionId'='null'::jsonb then null else public.tjanst_uuid(p->'basedOnVersionId') end);
 elsif action_name='add_teacher' then
  if not public.phase5_programplan_shape(p,array['personId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('personId',public.tjanst_uuid(p->'personId'));
 elsif action_name='save_row' then
  if not public.phase5_programplan_shape(p,array['rowId','sourceKind','sourceKey','personId','teacherHt','teacherVt','comment'])
   or p->>'sourceKind' is distinct from 'class_timplan' or jsonb_typeof(p->'sourceKey') is distinct from 'string'
   or not public.phase5_programplan_integer(p->'teacherHt',0,200000) or not public.phase5_programplan_integer(p->'teacherVt',0,200000)
   or (p->>'teacherHt')::integer+(p->>'teacherVt')::integer=0 then
   raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  if not public.phase5_apl_text(p->'comment',2000,true) then raise exception 'Invalid comment' using errcode='22023',hint='tjanst_comment_too_long';end if;
  payload:=jsonb_build_object('rowId',case when p->'rowId'='null'::jsonb then null else public.tjanst_uuid(p->'rowId') end,'sourceKind','class_timplan',
   'sourceKey',p->'sourceKey','personId',case when p->'personId'='null'::jsonb then null else public.tjanst_uuid(p->'personId') end,
   'teacherHt',p->'teacherHt','teacherVt',p->'teacherVt','comment',p->'comment');
 elsif action_name='delete_row' then
  if not public.phase5_programplan_shape(p,array['rowId']) then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('rowId',public.tjanst_uuid(p->'rowId'));
 else
  if p is distinct from '{}'::jsonb then raise exception 'Invalid service allocation command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:='{}'::jsonb;
 end if;
 return jsonb_build_object('commandId',public.tjanst_uuid(input->'commandId'),'unitId',public.tjanst_uuid(input->'unitId'),'schoolYear',input->'schoolYear',
  'action',action_name,'expectedRevision',input->'expectedRevision','payloadHash',input->'payloadHash','payload',payload)
  ||case when action_name='publish' then jsonb_build_object('expectedContentHash',input->'expectedContentHash') else '{}'::jsonb end;
end $$;

create function public.tjanst_current_draft(d public.tjanst_distributions) returns public.tjanst_versions
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions;
begin
 select * into v from public.tjanst_versions x where x.distribution_id=d.id and x.status='draft';
 if not found then raise exception 'No draft' using errcode='40001',hint='tjanst_published_meanwhile';end if;
 return v;
end $$;
create function public.tjanst_plan_create_draft(a public.access_assignments,s public.app_sessions,d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare published public.tjanst_versions;v public.tjanst_versions;
begin
 if exists(select 1 from public.tjanst_versions x where x.distribution_id=d.id and x.status='draft') then
  raise exception 'Draft exists' using errcode='40001',hint='tjanst_revision_conflict';end if;
 select * into published from public.tjanst_versions x where x.distribution_id=d.id and x.status='published';
 if (published.id is null)<>(p->'basedOnVersionId'='null'::jsonb) or (published.id is not null and published.id<>(p->>'basedOnVersionId')::uuid) then
  raise exception 'Published version changed' using errcode='40001',hint='tjanst_published_meanwhile';end if;
 insert into public.tjanst_versions(distribution_id,version_no,status,based_on_version_id,created_by_identity_id,created_by_assignment_id)
 values(d.id,coalesce((select max(x.version_no) from public.tjanst_versions x where x.distribution_id=d.id),0)+1,'draft',published.id,s.identity_id,a.id) returning * into v;
 if published.id is not null then
  -- Ny version: samma lineage_id, nya rad-id; ögonblicksbilderna följer med oförändrade och markeras om underlaget har ändrats.
  insert into public.tjanst_version_teachers(version_id,staff_person_id) select v.id,t.staff_person_id from public.tjanst_version_teachers t where t.version_id=published.id;
  insert into public.tjanst_rows(version_id,lineage_id,staff_person_id,source_kind,source_key,class_id,school_year,link_revision,timplan_id,series_id,timplan_version,
   timplan_row_key,link_column,need_label,need_ht_minutes,need_vt_minutes,need_basis,teacher_ht_minutes,teacher_vt_minutes,comment)
  select v.id,r.lineage_id,r.staff_person_id,r.source_kind,r.source_key,r.class_id,r.school_year,r.link_revision,r.timplan_id,r.series_id,r.timplan_version,
   r.timplan_row_key,r.link_column,r.need_label,r.need_ht_minutes,r.need_vt_minutes,r.need_basis,r.teacher_ht_minutes,r.teacher_vt_minutes,r.comment
  from public.tjanst_rows r where r.version_id=published.id;
 end if;
 return v.id;
end $$;
create function public.tjanst_plan_add_teacher(a public.access_assignments,d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);
begin
 if not public.tjanst_person_at_school(a,(p->>'personId')::uuid,d.unit_id,d.school_year) then
  raise exception 'Person not at school' using errcode='22023',hint='tjanst_person_not_at_school';end if;
 insert into public.tjanst_version_teachers(version_id,staff_person_id) values(v.id,(p->>'personId')::uuid) on conflict do nothing;
 return v.id;
end $$;
create function public.tjanst_plan_save_row(a public.access_assignments,d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);need jsonb;person uuid;row_id uuid;link jsonb;
begin
 -- Behovet hämtas på servern i samma transaktion; klienten anger bara källa och lärartid.
 need:=public.tjanst_need(d.unit_id,d.school_year,p->>'sourceKey');
 if need is null then raise exception 'Unknown need source' using errcode='22023',hint='tjanst_unknown_source';end if;
 link:=need->'link';person:=(p->>'personId')::uuid;
 if person is not null then
  if not public.tjanst_person_at_school(a,person,d.unit_id,d.school_year) then raise exception 'Person not at school' using errcode='22023',hint='tjanst_person_not_at_school';end if;
  insert into public.tjanst_version_teachers(version_id,staff_person_id) values(v.id,person) on conflict do nothing;
 end if;
 begin
  if p->'rowId'='null'::jsonb then
   insert into public.tjanst_rows(version_id,lineage_id,staff_person_id,source_kind,source_key,class_id,school_year,link_revision,timplan_id,series_id,timplan_version,
    timplan_row_key,link_column,need_label,need_ht_minutes,need_vt_minutes,need_basis,teacher_ht_minutes,teacher_vt_minutes,comment)
   values(v.id,gen_random_uuid(),person,'class_timplan',need->>'sourceKey',(need->>'classId')::uuid,d.school_year,(link->>'linkRevision')::integer,(link->>'timplanId')::uuid,
    (link->>'seriesId')::uuid,(link->>'timplanVersion')::integer,need->>'rowKey',link->>'column',left(need->>'label',300),(need->>'needHt')::integer,(need->>'needVt')::integer,
    need->>'needBasis',(p->>'teacherHt')::integer,(p->>'teacherVt')::integer,p->>'comment') returning id into row_id;
  else
   update public.tjanst_rows set staff_person_id=person,source_key=need->>'sourceKey',class_id=(need->>'classId')::uuid,link_revision=(link->>'linkRevision')::integer,
    timplan_id=(link->>'timplanId')::uuid,series_id=(link->>'seriesId')::uuid,timplan_version=(link->>'timplanVersion')::integer,timplan_row_key=need->>'rowKey',
    link_column=link->>'column',need_label=left(need->>'label',300),need_ht_minutes=(need->>'needHt')::integer,need_vt_minutes=(need->>'needVt')::integer,
    need_basis=need->>'needBasis',teacher_ht_minutes=(p->>'teacherHt')::integer,teacher_vt_minutes=(p->>'teacherVt')::integer,comment=p->>'comment'
   where id=(p->>'rowId')::uuid and version_id=v.id returning id into row_id;
   if row_id is null then raise exception 'Unknown row' using errcode='22023',hint='tjanst_invalid';end if;
  end if;
 exception when unique_violation then raise exception 'Duplicate row' using errcode='22023',hint='tjanst_duplicate_row';end;
 return v.id;
end $$;
create function public.tjanst_plan_delete_row(d public.tjanst_distributions,p jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);deleted uuid;
begin
 delete from public.tjanst_rows where id=(p->>'rowId')::uuid and version_id=v.id returning id into deleted;
 if deleted is null then raise exception 'Unknown row' using errcode='22023',hint='tjanst_invalid';end if;
 return v.id;
end $$;
create function public.tjanst_plan_publish(a public.access_assignments,s public.app_sessions,d public.tjanst_distributions,q jsonb) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare v public.tjanst_versions:=public.tjanst_current_draft(d);h text;
begin
 if a.function<>'rektor' then raise exception 'Publish denied' using errcode='42501';end if;
 h:=public.tjanst_version_hash(v.id);
 if h<>q->>'expectedContentHash' then raise exception 'Content changed' using errcode='40001',hint='tjanst_content_changed';end if;
 if jsonb_array_length(public.tjanst_plan_blockers(a,v,d.unit_id,d.school_year,public.tjanst_needs(d.unit_id,d.school_year)))>0 then
  raise exception 'Publish blocked' using errcode='40001',hint='tjanst_publish_blocked';end if;
 update public.tjanst_versions set status='superseded' where distribution_id=d.id and status='published';
 update public.tjanst_versions set status='published',content_hash=h,published_by_identity_id=s.identity_id,published_by_assignment_id=a.id,published_at=clock_timestamp()
 where id=v.id;
 return v.id;
end $$;

create function public.tjanst_plan_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;request_id uuid;action_name text;unit uuid;year integer;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;
 d public.tjanst_distributions;version uuid;target jsonb;detail jsonb;receipt jsonb;envelope jsonb;discarded uuid;
begin
 q:=public.tjanst_plan_parse(input);request_id:=(q->>'commandId')::uuid;action_name:=q->>'action';unit:=(q->>'unitId')::uuid;year:=(q->>'schoolYear')::integer;
 a:=public.tjanst_actor('plan');s:=public.phase5_programplan_session_check();
 -- D-01: huvudmannen följer upp men skriver inte; bara rektor publicerar.
 if a.function not in ('rektor','administrator') or (action_name='publish' and a.function<>'rektor') then raise exception 'Service allocation command denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,unit);
 if public.tjanst_hash(jsonb_build_array('tjanst_payload_v1',action_name,input->'payload'))<>q->>'payloadHash' then
  raise exception 'Payload hash mismatch' using errcode='22023',hint='tjanst_payload_hash';end if;
 target:=jsonb_build_object('unitId',unit,'schoolYear',year,'versionId',null,'personId',null);
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5561));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('plan',action_name,a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Service allocation command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 insert into public.tjanst_distributions(customer_id,organizer_id,unit_id,school_year) values(a.customer_id,a.organizer_id,unit,year) on conflict(unit_id,school_year) do nothing;
 select * into d from public.tjanst_distributions x where x.unit_id=unit and x.school_year=year for update;
 if d.customer_id<>a.customer_id or d.organizer_id<>a.organizer_id then raise exception 'Service allocation denied' using errcode='42501';end if;
 if d.revision<>(q->>'expectedRevision')::integer then raise exception 'Service allocation revision conflict' using errcode='40001',hint='tjanst_revision_conflict';end if;
 if action_name='create_draft' then version:=public.tjanst_plan_create_draft(a,s,d,q->'payload');
 elsif action_name='add_teacher' then version:=public.tjanst_plan_add_teacher(a,d,q->'payload');
 elsif action_name='save_row' then version:=public.tjanst_plan_save_row(a,d,q->'payload');
 elsif action_name='delete_row' then version:=public.tjanst_plan_delete_row(d,q->'payload');
 elsif action_name='discard_draft' then
  version:=(public.tjanst_current_draft(d)).id;update public.tjanst_versions set status='discarded' where id=version;discarded:=version;
 else version:=public.tjanst_plan_publish(a,s,d,q);
 end if;
 update public.tjanst_distributions set revision=revision+1 where id=d.id returning * into d;
 detail:=public.tjanst_plan_projection(a,unit,year,null);
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'versionId',version,'revision',d.revision,
  'contentHash',coalesce((select v.content_hash from public.tjanst_versions v where v.id=version),public.tjanst_version_hash(version)),'replayed',false,'changed',true);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'plan',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 perform public.tjanst_audit(case when action_name='publish' then 'tjanst_plan_published' else 'tjanst_plan_command' end,'tjanst_version',version,
  jsonb_build_object('commandId',request_id,'action',action_name,'revision',d.revision,'unitId',unit,'schoolYear',year,'discarded',discarded is not null));
 return envelope;
end $$;

create function public.tjanst_plan_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare ref jsonb;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;result jsonb;
begin
 ref:=public.tjanst_command_ref(input,'plan');
 if ref->'target'->>'unitId' is null or ref->'target'->'schoolYear'='null'::jsonb or ref->'target'->>'versionId' is not null or ref->'target'->>'personId' is not null then
  raise exception 'Invalid service allocation status request' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.tjanst_actor('plan');s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') then raise exception 'Service allocation status denied' using errcode='42501';end if;
 perform public.tjanst_plan_scope(a,(ref->'target'->>'unitId')::uuid);
 perform pg_advisory_xact_lock(hashtextextended(ref->>'commandId',5561));
 select * into r from public.tjanst_commands where command_id=(ref->>'commandId')::uuid;
 if not found then result:=jsonb_build_object('state','not_found','result',null);
 else
  if (r.family,r.action,r.target,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id)
    is distinct from ('plan',ref->>'action',ref->'target',a.customer_id,a.organizer_id,s.identity_id,a.id) then
   raise exception 'Service allocation command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  result:=jsonb_build_object('state','completed','result',jsonb_set(r.envelope->'result','{receipt,replayed}','true'::jsonb,false));
 end if;
 perform public.tjanst_audit('tjanst_plan_status_read','tjanst_command',(ref->>'commandId')::uuid,jsonb_build_object('action',ref->>'action'));
 return jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',result);
end $$;

-- 6. Lärarens egen läsning (D-03, TJANST-05): personen härleds ur sessionens self-mandat och den aktiva bindningen,
-- aldrig ur ett person-ID i begäran. Bara publicerade versioner på mandatets skolor; inga utkast och inga elever.
create function public.tjanst_self_person(a public.access_assignments) returns public.staff_people
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people;
begin
 if a.scope_kind is distinct from 'self' then raise exception 'Own service denied' using errcode='42501';end if;
 select x.* into p from public.staff_person_bindings b join public.staff_people x on x.id=b.staff_person_id
 where b.membership_id=a.membership_id and b.organizer_id=a.organizer_id and b.customer_id=a.customer_id and b.ended_at is null;
 if not found then raise exception 'Own service denied' using errcode='42501';end if;
 return p;
end $$;
create function public.tjanst_self_projection(a public.access_assignments) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people:=public.tjanst_self_person(a);publications jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'versionNo',v.version_no,'unitId',d.unit_id,
   'schoolName',(select u.name from public.school_units u where u.id=d.unit_id),'schoolYear',d.school_year,
   'publishedAt',to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contentHash',v.content_hash,
   'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'className',c.name,'rowKey',r.timplan_row_key,'label',r.need_label,
     'ht',r.teacher_ht_minutes,'vt',r.teacher_vt_minutes,'joint',null) order by c.name collate "C",r.need_label collate "C",r.id),'[]'::jsonb)
    from public.tjanst_rows r join public.school_classes c on c.id=r.class_id where r.version_id=v.id and r.staff_person_id=p.id),
   'specials','[]'::jsonb,'acknowledgedAt',null,'comments','[]'::jsonb) order by d.school_year desc,d.unit_id),'[]'::jsonb) into publications
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
 where v.status='published' and d.customer_id=a.customer_id and d.organizer_id=a.organizer_id
  and exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=d.unit_id)
  and (exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id));
 return jsonb_build_object('contractVersion','tjanst_v1','person',jsonb_build_object('id',p.id,'displayName',left(p.given_name||' '||p.family_name,200)),
  'publications',publications,'capabilities',jsonb_build_object('canAck',false,'canComment',false));
end $$;
create function public.tjanst_self_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;result jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or input<>'{}'::jsonb then raise exception 'Invalid own service read' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.tjanst_actor('self');
 result:=public.tjanst_self_projection(a);
 perform public.tjanst_audit('tjanst_self_read','staff_person',(result->'person'->>'id')::uuid,'{}'::jsonb);
 return result;
end $$;

revoke all on function public.tjanst_version_guard(),public.tjanst_audit(text,text,uuid,jsonb),public.tjanst_easter(integer),public.tjanst_is_holiday(date),
 public.tjanst_school_weeks(uuid,integer),public.tjanst_grim_label(text),public.tjanst_gy_label(jsonb,text),public.tjanst_needs(uuid,integer),public.tjanst_need(uuid,integer,text),
 public.tjanst_plan_scope(public.access_assignments,uuid),public.tjanst_person_at_school(public.access_assignments,uuid,uuid,integer),
 public.tjanst_row_json(public.tjanst_rows,jsonb),public.tjanst_version_hash(uuid),public.tjanst_version_json(public.tjanst_versions),
 public.tjanst_plan_blockers(public.access_assignments,public.tjanst_versions,uuid,integer,jsonb),
 public.tjanst_plan_projection(public.access_assignments,uuid,integer,uuid),public.tjanst_plan_read(jsonb),public.tjanst_plan_parse(jsonb),
 public.tjanst_current_draft(public.tjanst_distributions),public.tjanst_plan_create_draft(public.access_assignments,public.app_sessions,public.tjanst_distributions,jsonb),
 public.tjanst_plan_add_teacher(public.access_assignments,public.tjanst_distributions,jsonb),public.tjanst_plan_save_row(public.access_assignments,public.tjanst_distributions,jsonb),
 public.tjanst_plan_delete_row(public.tjanst_distributions,jsonb),public.tjanst_plan_publish(public.access_assignments,public.app_sessions,public.tjanst_distributions,jsonb),
 public.tjanst_plan_command(jsonb),public.tjanst_plan_status(jsonb),public.tjanst_self_person(public.access_assignments),
 public.tjanst_self_projection(public.access_assignments),public.tjanst_self_read(jsonb)
 from public,anon,authenticated,service_role,skolplattform_worker;
