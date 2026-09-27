-- 03-07, användarbeslut 2026-09-27: tidsbegränsad support kan gälla ANTINGEN en
-- namngiven elev ELLER en eller flera grupper på EN skola. Övrigt oförändrat:
-- endast rektor tilldelar, högst 60 minuter, angivet syfte, godkänt av den
-- tilldelande rektorn, ingen export och ingen vidaredelegering.
--
-- Ny migration; tillämpade migrationer ändras inte. Elevläsningen
-- (phase3_pupil_in_scope) prövar redan gruppscope via mandate_groups och
-- phase3_probe_group_members för alla funktioner; den ändras inte här.

-- 1. Tabellvillkoret tillåter gruppscope för support (tidigare endast elev).
alter table public.access_assignments drop constraint phase3_support_fields;
alter table public.access_assignments add constraint phase3_support_fields check (function <> 'support' or
  (profile_id is not null and scope_kind in ('pupil','group') and unit_id is not null
    and starts_at is not null and ends_at is not null
    and ends_at - starts_at <= interval '60 minutes'
    and parent_assignment_id is not null and approved_by_assignment_id is not null
    and approved_by_assignment_id = parent_assignment_id
    and purpose_code is not null and purpose_code = 'synthetic-troubleshooting'));

-- 2. Formprövningen: exakt en skola och antingen exakt en elev eller minst en
-- grupp, aldrig båda och aldrig ärenden. Övriga grenar är oförändrade från
-- 20260924130000.
create or replace function public.phase3_mandate_shape(a public.access_assignments)
returns boolean language plpgsql stable security invoker set search_path=pg_catalog,public as $$
declare units integer; groups integer; pupils integer; cases integer;
begin
  if a.profile_id is distinct from 'synthetic-v1' or a.scope_kind is null then return false; end if;
  select count(*) into units from public.mandate_units where assignment_id=a.id;
  select count(*) into groups from public.mandate_groups where assignment_id=a.id;
  select count(*) into pupils from public.mandate_pupils where assignment_id=a.id;
  select count(*) into cases from public.mandate_cases where assignment_id=a.id;
  if a.function in ('kundadmin','granskare') then
    return a.organizer_id is null and a.scope_kind='school' and units+groups+pupils+cases=0;
  end if;
  if units=0 or a.organizer_id is null then return false; end if;
  if a.function='larare' then return a.scope_kind='group' and groups>0 and pupils+cases=0; end if;
  if a.function='support' then
    return units=1 and cases=0
      and ((a.scope_kind='pupil' and pupils=1 and groups=0)
        or (a.scope_kind='group' and groups>0 and pupils=0))
      and a.parent_assignment_id is not null and a.approved_by_assignment_id=a.parent_assignment_id
      and a.starts_at is not null and a.ends_at is not null
      and a.ends_at-a.starts_at <= interval '60 minutes'
      and a.purpose_code='synthetic-troubleshooting';
  end if;
  if a.function='elevhalsa' then
    return (a.scope_kind='school' and groups+pupils+cases=0)
      or (a.scope_kind='pupil' and pupils>0 and groups+cases=0)
      or (a.scope_kind='case' and cases>0 and groups+pupils=0);
  end if;
  return a.scope_kind='school' and groups+pupils+cases=0;
end $$;
revoke all on function public.phase3_mandate_shape(public.access_assignments) from public,anon,authenticated,skolplattform_worker;

-- 3. Elevprovets scope visar de egna grupperna (ID, skola och samma etikett som
-- i rektorns tilldelningsurval) när uppdraget har gruppscope. Inga elevuppgifter.
-- Oförändrat i övrigt från 20260926090000.
create or replace function public.phase3_probe_scope() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
  a:=public.phase3_actor();
  if a.function not in ('rektor','larare','administrator','elevhalsa','support') then
    raise exception 'Read denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'function',a.function,
    'scopeKind',a.scope_kind,
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id)
      from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=a.id),'[]'::jsonb),
    'groups',case when a.scope_kind='group' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unitId',x.unit_id,
        'label','Grupp '||x.n||' · '||x.name) order by x.name,x.n)
      from (select g.id,g.unit_id,s.name,row_number() over (partition by g.unit_id order by g.id) n
        from public.phase3_probe_groups g join public.school_units s on s.id=g.unit_id
        where g.customer_id=a.customer_id and g.organizer_id=a.organizer_id
          and g.unit_id in (select u.unit_id from public.mandate_units u where u.assignment_id=a.id)) x
      where exists(select 1 from public.mandate_groups mg where mg.assignment_id=a.id and mg.group_id=x.id)),'[]'::jsonb)
      else '[]'::jsonb end,
    -- Endast egna ärendetilldelningar (ID och skola), inget ärendeinnehåll.
    'cases',case when a.scope_kind='case' then coalesce((select jsonb_agg(jsonb_build_object('id',x.case_id,'unitId',x.unit_id,
        'label','Tilldelat ärende '||x.n) order by x.n)
      from (select mc.case_id,mc.unit_id,row_number() over (order by mc.case_id) n
        from public.mandate_cases mc where mc.assignment_id=a.id) x),'[]'::jsonb) else '[]'::jsonb end,
    'startsAt',a.starts_at,
    'endsAt',a.ends_at,
    'purposeCode',a.purpose_code,
    'approverName',case when a.approved_by_assignment_id is null then null else
      (select coalesce(nullif(i.display_name,''),'Namngiven personal') from public.access_assignments p
        join public.memberships m on m.id=p.membership_id join public.identities i on i.id=m.identity_id
        where p.id=a.approved_by_assignment_id) end,
    'canExport',a.function='administrator',
    'serverNow',clock_timestamp()) into result;
  return result;
end $$;
revoke all on function public.phase3_probe_scope() from public,anon,authenticated;
grant execute on function public.phase3_probe_scope() to skolplattform_worker;
