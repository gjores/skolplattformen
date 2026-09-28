-- 04-17: avveckla elevprovet. Elevregistret är enda skyddade elevdatavägen.
-- Ingen egen COMMIT: migrationsverktyget kör filen atomiskt. Inget släpps med CASCADE,
-- så en okänd beroende policy, vy, FK eller funktion stoppar migrationen i stället för
-- att tyst försvinna.
--
-- Inventering före DDL (protected-målet, efter 20260929180000):
-- * pg_constraint: phase3_probe_pupils/-groups/-group_members har bara FK sinsemellan
--   (group_members -> pupils/groups) och till organizers/school_units. mandate_pupils
--   pekar på pupils, mandate_groups på school_classes och phase3_probe_cases på pupils
--   sedan 20260929110000. mandate_cases pekar på phase3_probe_cases.
-- * pg_depend: inga policys, vyer, regler eller triggers på de tre tabellerna.
-- * pg_proc.prosrc (PL/pgSQL-beroenden syns inte i pg_depend): enda funktionskällan som
--   läser tabellerna är phase3_read_pupils, stängd för alla roller sedan 20260929110000.
-- * pg_publication_tables: tabellerna publiceras inte.
--
-- Behålls avsiktligt:
-- * phase3_probe_cases: bär fas 3:s avgränsade ärenden och har register-FK.
-- * phase3_probe_scope(): används av phase4_register_selection() och läser bara registret.
-- * phase3_pupil_in_scope(): läser bara pupil_placements via phase4_scope; ingen RPC.
-- * security_events med object_type phase3_probe_pupil/phase3_probe_case är orörda.

-- 1. Stoppa om någon annan funktion än den gamla läsaren fortfarande läser elevprovet.
do $$begin
  if exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname not in ('pg_catalog','information_schema')
      and p.oid is distinct from to_regprocedure('public.phase3_read_pupils(uuid,uuid,boolean)')
      and p.prosrc ~ 'phase3_probe_(pupils|groups|group_members)|phase3_read_pupils') then
    raise exception 'Retire probe blocked: function still reads pupil probe' using errcode='2BP01';
  end if;
end $$;

-- 2. Stoppa om någon provrad saknar sin registerpost: inga elevuppgifter får försvinna.
do $$begin
  if exists(select 1 from public.phase3_probe_pupils p where not exists(select 1 from public.pupils r
      where r.id=p.id and r.customer_id=p.customer_id and r.organizer_id=p.organizer_id))
    or exists(select 1 from public.phase3_probe_groups g where not exists(select 1 from public.school_classes c
      where c.id=g.id and c.customer_id=g.customer_id and c.unit_id=g.unit_id))
    or exists(select 1 from public.phase3_probe_group_members m where not exists(select 1 from public.pupil_class_memberships c
      where c.class_id=m.group_id and c.pupil_id=m.pupil_id and c.customer_id=m.customer_id)) then
    raise exception 'Retire probe blocked: probe row missing in register' using errcode='23514';
  end if;
end $$;

-- 3. Återkalla och släpp gamla elevläsaren.
revoke all on function public.phase3_read_pupils(uuid,uuid,boolean) from public,anon,authenticated,skolplattform_worker;
drop function public.phase3_read_pupils(uuid,uuid,boolean);

-- 4. Återkalla och släpp gamla elev-, grupp- och medlemstabeller (beroende först).
revoke all on public.phase3_probe_group_members,public.phase3_probe_groups,public.phase3_probe_pupils
  from public,anon,authenticated,skolplattform_worker;
drop table public.phase3_probe_group_members;
drop table public.phase3_probe_groups;
drop table public.phase3_probe_pupils;

-- 5. Kontroll efter DDL: ärende- och mandatkedjan är hel och pekar på registret.
do $$begin
  if to_regclass('public.phase3_probe_pupils') is not null
    or to_regclass('public.phase3_probe_groups') is not null
    or to_regclass('public.phase3_probe_group_members') is not null
    or to_regprocedure('public.phase3_read_pupils(uuid,uuid,boolean)') is not null then
    raise exception 'Retire probe incomplete' using errcode='23514';
  end if;
  if not exists(select 1 from pg_constraint where conrelid='public.phase3_probe_cases'::regclass and contype='f' and confrelid='public.pupils'::regclass)
    or not exists(select 1 from pg_constraint where conrelid='public.mandate_cases'::regclass and contype='f' and confrelid='public.phase3_probe_cases'::regclass)
    or not exists(select 1 from pg_constraint where conrelid='public.mandate_pupils'::regclass and contype='f' and confrelid='public.pupils'::regclass)
    or not exists(select 1 from pg_constraint where conrelid='public.mandate_groups'::regclass and contype='f' and confrelid='public.school_classes'::regclass) then
    raise exception 'Retire probe broke mandate or case foreign keys' using errcode='23503';
  end if;
end $$;
