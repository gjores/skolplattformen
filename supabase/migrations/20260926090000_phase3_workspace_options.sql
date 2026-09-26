-- 03-05: behörigt tilldelningsurval och elevprovets eget scope.
-- Båda funktionerna utgår från serverns aktuella mandat (phase3_actor) och
-- lämnar bara ut sådant som aktören redan får administrera eller läsa.
-- Elevläsningen (phase3_read_pupils) öppnas INTE här.

create function public.phase3_mandate_options() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; own uuid; fns text[]; result jsonb;
begin
  a:=public.phase3_actor();
  fns:=case a.function
    when 'huvudman' then array['rektor']
    when 'rektor' then array['larare','administrator','elevhalsa','support']
    when 'elevhalsoansvarig' then array['elevhalsa']
    else null end;
  if fns is null then raise exception 'Delegation denied' using errcode='42501'; end if;
  select m.identity_id into own from public.memberships m where m.id=a.membership_id;
  select jsonb_build_object(
    'functions',to_jsonb(fns),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.id,
        'displayName',coalesce(nullif(i.display_name,''),'Namngiven personal')) order by i.display_name,m.id)
      from public.memberships m join public.identities i on i.id=m.identity_id
      join public.customers c on c.id=m.customer_id
      where m.customer_id=a.customer_id and m.status='active' and c.closed_at is null
        and m.identity_id is distinct from own),'[]'::jsonb),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id)
      from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=a.id),'[]'::jsonb),
    -- Grupper, elever och ärenden erbjuds endast rektor, som redan har skolans elevläsning.
    'groups',case when a.function='rektor' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unitId',x.unit_id,
        'label','Grupp '||x.n||' · '||x.name) order by x.name,x.n)
      from (select g.id,g.unit_id,s.name,row_number() over (partition by g.unit_id order by g.id) n
        from public.phase3_probe_groups g
        join public.mandate_units u on u.assignment_id=a.id and u.unit_id=g.unit_id
        join public.school_units s on s.id=g.unit_id
        where g.customer_id=a.customer_id and g.organizer_id=a.organizer_id) x),'[]'::jsonb) else '[]'::jsonb end,
    'pupils',case when a.function='rektor' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'unitId',p.unit_id,
        'label',p.display_name) order by p.display_name,p.id)
      from public.phase3_probe_pupils p
      where p.customer_id=a.customer_id and public.phase3_pupil_in_scope(a.id,p.id)),'[]'::jsonb) else '[]'::jsonb end,
    'cases',case when a.function='rektor' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unitId',x.unit_id,
        'label','Ärende '||x.n||' · '||x.display_name) order by x.display_name,x.n)
      from (select c.id,c.unit_id,p.display_name,row_number() over (partition by c.pupil_id order by c.id) n
        from public.phase3_probe_cases c join public.phase3_probe_pupils p on p.id=c.pupil_id
        where c.customer_id=a.customer_id and public.phase3_pupil_in_scope(a.id,p.id)) x),'[]'::jsonb) else '[]'::jsonb end,
    'validFrom',greatest(a.valid_from,public.app_today()),
    'validTo',a.valid_to,
    'serverNow',clock_timestamp()) into result;
  return result;
end $$;

create function public.phase3_probe_scope() returns jsonb
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

revoke all on function public.phase3_mandate_options(),public.phase3_probe_scope() from public,anon,authenticated;
grant execute on function public.phase3_mandate_options(),public.phase3_probe_scope() to skolplattform_worker;
