-- 05.1-03 (D-02, D-03, D-11, D-12, D-19): personal, anställning, skolandelar, personbindning och mandatet Egen tjänst.
-- Användarbeslut 2026-10-19 (alternativ A): scopeKind self bara för funktionen larare, utan grupper, elever och ärenden.
-- Bindningen person–medlemskap skapas och auditeras när mandatet ges. Alla elevfunktioner nekar self med 42501.
-- Self finns aldrig utan elevspärren: båda ligger i denna migration (RESEARCH §Self-mandat).
-- Inga personnummer, avtal, arbetstidsramar eller bedömningar. Procent i heltal 1–100 (= SS 12000 dutyPercent).
-- SS 12000:2024 utg. 4 / OpenAPI 2.1.0 (avsedd kompatibilitet, inget verifierat utbyte): staff_people ↔ Person
-- (externalIdentifiers via external_id + external_id_source), staff_school_duties ↔ Duty (unit_id = dutyAt,
-- percent = dutyPercent, starts_on/ends_on = startDate/endDate inklusive). Anställningen, mandatet och bindningen
-- är interna objekt utanför standarden. dutyRole (Lärare) härleds först vid ett framtida utbyte.
-- Alla nya funktioner och tabeller är stängda; Worker-rättigheter ges först i en separat grant-migration (plan 09).

-- 1. Personal: person, anställning, skolandel (Duty), bindning och kommandojournal.
create table public.staff_people (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null,
 organizer_id uuid not null,
 given_name text not null check(public.phase5_apl_text(to_jsonb(given_name),200,false)),
 family_name text not null check(public.phase5_apl_text(to_jsonb(family_name),200,false)),
 external_id text check(external_id is null or public.phase5_apl_text(to_jsonb(external_id),200,false)),
 external_id_source text check(external_id_source is null or public.phase5_apl_text(to_jsonb(external_id_source),100,false)),
 status text not null check(status in ('active','draft')),
 proposed_for_unit_id uuid,
 draft_note text check(draft_note is null or public.phase5_apl_text(to_jsonb(draft_note),500,true)),
 revision integer not null check(revision>=1),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(id,organizer_id),
 unique(id,customer_id,organizer_id),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id),
 foreign key(proposed_for_unit_id,organizer_id) references public.school_units(id,organizer_id),
 check((external_id is null)=(external_id_source is null)),
 check(status='active' or proposed_for_unit_id is not null)
);
create unique index staff_people_external_id_unique on public.staff_people(organizer_id,external_id_source,external_id) where external_id is not null;

create table public.staff_employments (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null,
 organizer_id uuid not null,
 staff_person_id uuid not null,
 percent integer not null check(percent between 1 and 100),
 starts_on date not null check(isfinite(starts_on)),
 ends_on date check(ends_on is null or (isfinite(ends_on) and ends_on>=starts_on)),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 unique(id,staff_person_id,customer_id,organizer_id),
 foreign key(staff_person_id,customer_id,organizer_id) references public.staff_people(id,customer_id,organizer_id),
 -- Etapp 1 (05.1-02 punkt 3): högst en samtidig anställning per person; kommandot nekar först med tjanst_employment_overlap.
 exclude using gist(staff_person_id with =,daterange(starts_on,ends_on,'[]') with &&)
);

create table public.staff_school_duties (
 id uuid primary key default gen_random_uuid(),
 customer_id uuid not null,
 organizer_id uuid not null,
 staff_person_id uuid not null,
 employment_id uuid not null,
 unit_id uuid not null,
 percent integer not null check(percent between 1 and 100),
 starts_on date not null check(isfinite(starts_on)),
 ends_on date check(ends_on is null or (isfinite(ends_on) and ends_on>=starts_on)),
 created_at timestamptz not null default clock_timestamp(),
 updated_at timestamptz not null default clock_timestamp(),
 foreign key(employment_id,staff_person_id,customer_id,organizer_id) references public.staff_employments(id,staff_person_id,customer_id,organizer_id),
 foreign key(unit_id,organizer_id) references public.school_units(id,organizer_id)
);
create index staff_school_duties_unit_idx on public.staff_school_duties(unit_id,staff_person_id);
create index staff_school_duties_employment_idx on public.staff_school_duties(employment_id);

-- D-02/D-03: den enda vägen från session till person. Namn och e-post är aldrig bevis.
create table public.staff_person_bindings (
 id uuid primary key default gen_random_uuid(),
 staff_person_id uuid not null,
 membership_id uuid not null,
 customer_id uuid not null,
 organizer_id uuid not null,
 access_assignment_id uuid not null,
 bound_by_assignment_id uuid not null,
 bound_at timestamptz not null,
 ended_at timestamptz check(ended_at is null or ended_at>=bound_at),
 foreign key(staff_person_id,customer_id,organizer_id) references public.staff_people(id,customer_id,organizer_id),
 foreign key(membership_id,customer_id) references public.memberships(id,customer_id),
 foreign key(access_assignment_id,customer_id,organizer_id) references public.access_assignments(id,customer_id,organizer_id),
 foreign key(bound_by_assignment_id,customer_id) references public.access_assignments(id,customer_id)
);
create unique index staff_person_bindings_active_person on public.staff_person_bindings(staff_person_id) where ended_at is null;
create unique index staff_person_bindings_active_membership on public.staff_person_bindings(membership_id,organizer_id) where ended_at is null;

create table public.tjanst_commands (
 command_id uuid primary key,
 family text not null check(family in ('personal','plan','self')),
 action text not null check(action~'^[a-z][a-z_]{0,39}$'),
 customer_id uuid not null,
 organizer_id uuid not null,
 target jsonb not null check(jsonb_typeof(target)='object'),
 actor_identity_id uuid not null references public.identities(id),
 assignment_id uuid not null references public.access_assignments(id),
 request jsonb not null,
 envelope jsonb not null,
 created_at timestamptz not null default clock_timestamp(),
 foreign key(organizer_id,customer_id) references public.organizers(id,customer_id)
);

do $$declare n text;begin
 foreach n in array array['staff_people','staff_employments','staff_school_duties','staff_person_bindings','tjanst_commands'] loop
  execute format('alter table public.%I enable row level security',n);
  execute format('alter table public.%I force row level security',n);
  execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
 end loop;
end $$;

-- Journal och bindningar är oföränderliga; en bindning kan bara avslutas en gång.
create function public.tjanst_journal_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if tg_op='TRUNCATE' then raise exception 'Tjänstefördelningens historik får inte tömmas.' using errcode='42501';end if;
 if tg_table_name='tjanst_commands' then raise exception 'Tjänstefördelningens kvitton är oföränderliga.' using errcode='42501';end if;
 if tg_op<>'UPDATE' or old.ended_at is not null or new.ended_at is null
  or (to_jsonb(new)-'ended_at') is distinct from (to_jsonb(old)-'ended_at') then
  raise exception 'Personbindningen kan bara avslutas.' using errcode='42501';end if;
 return new;
end $$;
create trigger tjanst_commands_immutable before update or delete on public.tjanst_commands for each row execute function public.tjanst_journal_guard();
create trigger tjanst_commands_no_truncate before truncate on public.tjanst_commands for each statement execute function public.tjanst_journal_guard();
create trigger staff_person_bindings_guard before update or delete on public.staff_person_bindings for each row execute function public.tjanst_journal_guard();
create trigger staff_person_bindings_no_truncate before truncate on public.staff_person_bindings for each statement execute function public.tjanst_journal_guard();

-- 2. Gemensamma hjälpfunktioner: identitet, kanonisk hash, aktör och audit.
create function public.tjanst_uuid(v jsonb) returns uuid
language plpgsql immutable set search_path=pg_catalog,public as $$
begin
 if jsonb_typeof(v) is distinct from 'string' or (v#>>'{}')!~*'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
  raise exception 'Ogiltig identitet i tjänstefördelningen.' using errcode='22023',hint='tjanst_invalid';end if;
 return (v#>>'{}')::uuid;
end $$;

-- Samma kanoniska form som tjanstCanonicalSerialize i web/lib/tjanst-contract.ts: n, t/f, i<heltal>;, s<UTF-8-byte>:<text>,
-- a<antal>:<värden>, o<antal>:<nyckel värde>… med nycklar sorterade på UTF-8-byte. Prövas mot phase51_tjanst_hash_vectors.json.
create function public.tjanst_canonical(value jsonb,depth integer default 0) returns text
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare kind text;result_text text;element jsonb;scalar_text text;scalar_number numeric;k text;
begin
 if value is null or depth is null or depth>32 then raise exception 'Ogiltigt kanoniskt värde.' using errcode='22023',hint='tjanst_invalid';end if;
 kind:=jsonb_typeof(value);
 if kind='null' then return 'n';end if;
 if kind='boolean' then return case when value='true'::jsonb then 't' else 'f' end;end if;
 if kind='number' then
  scalar_number:=(value#>>'{}')::numeric;
  if trunc(scalar_number)<>scalar_number or abs(scalar_number)>9007199254740991 then
   raise exception 'Kanoniska tal ska vara säkra heltal.' using errcode='22023',hint='tjanst_invalid';end if;
  return 'i'||scalar_number::bigint::text||';';
 end if;
 if kind='string' then scalar_text:=value#>>'{}';return 's'||octet_length(convert_to(scalar_text,'UTF8'))::text||':'||scalar_text;end if;
 if kind='array' then
  if jsonb_array_length(value)>200000 then raise exception 'Kanonisk lista för stor.' using errcode='22023',hint='tjanst_invalid';end if;
  result_text:='a'||jsonb_array_length(value)::text||':';
  for element in select item.value from jsonb_array_elements(value) with ordinality item(value,position) order by item.position loop
   result_text:=result_text||public.tjanst_canonical(element,depth+1);
  end loop;
  return result_text;
 end if;
 result_text:='o'||(select count(*) from jsonb_object_keys(value))::text||':';
 for k in select key from jsonb_object_keys(value) key order by convert_to(key,'UTF8') loop
  result_text:=result_text||'s'||octet_length(convert_to(k,'UTF8'))::text||':'||k||public.tjanst_canonical(value->k,depth+1);
 end loop;
 return result_text;
end $$;

create function public.tjanst_hash(value jsonb) returns text
language sql immutable security definer set search_path=pg_catalog,public as $$
 select 'sha256:'||encode(sha256(convert_to(public.tjanst_canonical(value,0),'UTF8')),'hex')
$$;

-- Kopierar phase5_programplan_actor:s kedjeprövning med en vitlista per familj:
-- personal = huvudman och rektor, plan = huvudman, rektor och administratör, self = lärare.
create function public.tjanst_actor(family text) returns public.access_assignments
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;corr uuid;node public.access_assignments;cursor_id uuid;seen uuid[]:='{}';
begin
 if family is null or family not in ('personal','plan','self') then raise exception 'Invalid service allocation family' using errcode='22023',hint='tjanst_invalid';end if;
 perform public.phase5_programplan_session_check();
 begin corr:=nullif(current_setting('app.correlation_id',true),'')::uuid;
 exception when invalid_text_representation then raise exception 'Service allocation audit unavailable' using errcode='55000';end;
 if corr is null then raise exception 'Service allocation audit unavailable' using errcode='55000';end if;
 a:=public.phase3_actor();
 -- Färsk kontroll efter väntan på kundlåset. Klientens rollval ger aldrig behörighet.
 perform public.phase5_programplan_session_check();
 if (family='personal' and a.function not in ('huvudman','rektor'))
  or (family='plan' and a.function not in ('huvudman','rektor','administrator'))
  or (family='self' and a.function<>'larare') then raise exception 'Service allocation denied' using errcode='42501';end if;
 cursor_id:=a.id;
 loop
  if cursor_id=any(seen) or cardinality(seen)>=64 then raise exception 'Service allocation denied' using errcode='42501';end if;
  seen:=array_append(seen,cursor_id);
  select * into node from public.access_assignments where id=cursor_id;
  if not found or not exists(select 1 from public.memberships m join public.customers c on c.id=m.customer_id join public.identities i on i.id=m.identity_id
   where m.id=node.membership_id and m.customer_id=node.customer_id and m.status='active' and c.closed_at is null)
   or (node.organizer_id is not null and not exists(select 1 from public.organizers g where g.id=node.organizer_id and g.customer_id=node.customer_id))
   or exists(select 1 from public.mandate_units m left join public.school_units u on u.id=m.unit_id
    where m.assignment_id=node.id and (u.id is null or u.organizer_id is distinct from node.organizer_id)) then
   raise exception 'Service allocation denied' using errcode='42501';end if;
  exit when node.parent_assignment_id is null;
  cursor_id:=node.parent_assignment_id;
 end loop;
 return a;
end $$;

-- Detaljer är bara referenser: UUID, heltal, sanningsvärden och korta koder. Ingen fritext, inga namn.
create function public.tjanst_audit_details(details jsonb) returns boolean
language sql immutable security definer set search_path=pg_catalog,public as $$
 select jsonb_typeof(details)='object' and (select count(*) from jsonb_object_keys(details))<=16
  and not exists(select 1 from jsonb_each(details) x where x.key!~'^[a-zA-Z]{1,40}$'
   or not (jsonb_typeof(x.value) in ('null','boolean','number')
    or (jsonb_typeof(x.value)='string' and ((x.value#>>'{}')~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     or (x.value#>>'{}')~'^[a-z][a-z0-9_]{0,63}$'))))
$$;

create function public.tjanst_audit(operation text,object_type text,object_id uuid,details jsonb default '{}') returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;i public.identities;
begin
 if operation is null or operation not in ('tjanst_personal_read','tjanst_personal_status_read','tjanst_person_created','tjanst_person_updated',
   'tjanst_draft_teacher_created','tjanst_employment_saved','tjanst_duties_saved')
  or object_type is null or object_type not in ('staff_person','tjanst_command') or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid service allocation audit' using errcode='22023',hint='tjanst_invalid';end if;
 a:=public.phase3_actor();s:=public.phase5_programplan_session_check();select * into i from public.identities where id=s.identity_id;
 begin
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(nullif(current_setting('app.correlation_id',true),'')::uuid,'db',i.id,i.issuer,i.subject,s.id,a.membership_id,a.id,a.customer_id,operation,object_type,object_id,'ok',details);
 exception when others then raise exception 'Service allocation audit unavailable' using errcode='55000';end;
end $$;

-- Bindningens audit: aktören är det tilldelande mandatet (rektor), också när mandatet ges via en inbjudan.
create function public.tjanst_binding_audit(issuer public.access_assignments,binding_id uuid,operation text,details jsonb) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare i public.identities;sid uuid;corr uuid;
begin
 if issuer.id is null or binding_id is null or operation is null or operation not in ('tjanst_person_bound','tjanst_binding_ended')
  or not coalesce(public.tjanst_audit_details(details),false) then
  raise exception 'Invalid service allocation audit' using errcode='22023',hint='tjanst_invalid';end if;
 select i2.* into i from public.memberships m join public.identities i2 on i2.id=m.identity_id where m.id=issuer.membership_id;
 begin
  corr:=coalesce(nullif(current_setting('app.correlation_id',true),'')::uuid,gen_random_uuid());
  if public.current_assignment_id() is not distinct from issuer.id then sid:=nullif(current_setting('app.session_id',true),'')::uuid;end if;
  insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
  values(corr,'db',i.id,i.issuer,i.subject,sid,issuer.membership_id,issuer.id,issuer.customer_id,operation,'staff_person_binding',binding_id,'ok',details);
 exception when others then raise exception 'Service allocation audit unavailable' using errcode='55000';end;
end $$;

-- D-12: för varje datum får summan av överlappande skolandelar inte överstiga anställningens grad.
-- Anställningen låses for update före summeringen, så att samtidiga kommandon prövas i tur och ordning.
create function public.tjanst_capacity_check(employment_id uuid) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare e public.staff_employments;t date;total integer;
begin
 select * into e from public.staff_employments x where x.id=employment_id for update;
 if not found then raise exception 'Unknown employment' using errcode='22023',hint='tjanst_invalid';end if;
 if exists(select 1 from public.staff_school_duties d where d.employment_id=e.id and (d.starts_on<e.starts_on
   or (e.ends_on is not null and (d.ends_on is null or d.ends_on>e.ends_on)))) then
  raise exception 'Duty outside employment' using errcode='22023',hint='tjanst_invalid';end if;
 -- Summan är styckvis konstant och kan bara öka vid en andels startdatum.
 for t in select distinct d.starts_on from public.staff_school_duties d where d.employment_id=e.id loop
  select coalesce(sum(x.percent),0) into total from public.staff_school_duties x
   where x.employment_id=e.id and x.starts_on<=t and (x.ends_on is null or x.ends_on>=t);
  if total>e.percent then raise exception 'Duty shares exceed employment' using errcode='22023',hint='tjanst_capacity_exceeded';end if;
 end loop;
end $$;

-- 3. Mandatet Egen tjänst (D-03, alternativ A).
alter table public.access_assignments drop constraint phase3_scope_kind;
alter table public.access_assignments add constraint phase3_scope_kind check (scope_kind in ('school','group','pupil','case','self'));
alter table public.access_assignments add constraint phase51_self_scope check (scope_kind is distinct from 'self' or function='larare');

-- Formprövningen: lärare har antingen gruppscope med grupper eller self utan grupper, elever och ärenden.
-- Övriga grenar är ordagrant oförändrade från 20260927090000.
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
  if a.function='larare' then return (a.scope_kind='group' and groups>0 and pupils+cases=0) or (a.scope_kind='self' and groups+pupils+cases=0); end if;
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

-- Bindningen skrivs i samma transaktion som mandatet. Personen ska höra till huvudmannen och ha ett skoluppdrag
-- på varje mandatskola som överlappar mandatets giltighet. En aktiv bindning till ett annat medlemskap (eller
-- medlemskapets bindning till en annan person) nekas så länge dess mandat gäller; har mandatet upphört avslutas den.
create function public.phase51_bind_self_person(parent public.access_assignments,recipient_id uuid,mandate_id uuid,person_id uuid,unit_ids uuid[]) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare m public.access_assignments;person public.staff_people;b public.staff_person_bindings;u uuid;binding_id uuid;now_at timestamptz:=clock_timestamp();
begin
 select * into m from public.access_assignments where id=mandate_id;
 if not found or m.function<>'larare' or m.scope_kind<>'self' or m.membership_id<>recipient_id or m.parent_assignment_id<>parent.id then
  raise exception 'Self mandate denied' using errcode='42501';end if;
 select * into person from public.staff_people p where p.id=person_id and p.customer_id=parent.customer_id and p.organizer_id=parent.organizer_id for update;
 if not found then raise exception 'Staff person denied' using errcode='42501';end if;
 if cardinality(unit_ids)=0 then raise exception 'Self mandate denied' using errcode='42501';end if;
 foreach u in array unit_ids loop
  if not exists(select 1 from public.staff_school_duties d where d.staff_person_id=person.id and d.unit_id=u and d.organizer_id=parent.organizer_id
    and daterange(d.starts_on,d.ends_on,'[]')&&daterange(m.valid_from,m.valid_to,'[]')) then
   raise exception 'Staff person has no duty at the school' using errcode='22023',hint='tjanst_person_not_at_school';end if;
 end loop;
 for b in select * from public.staff_person_bindings x where x.ended_at is null
   and (x.staff_person_id=person.id or (x.membership_id=recipient_id and x.organizer_id=parent.organizer_id)) order by x.id for update loop
  if (b.staff_person_id<>person.id or b.membership_id<>recipient_id) and exists(select 1 from public.access_assignments old
    where old.id=b.access_assignment_id and old.ended_at is null and (old.valid_to is null or old.valid_to>=public.app_today())
    and public.phase3_mandate_is_valid(old.id,false)) then
   raise exception 'Staff person is bound to another account' using errcode='42501';end if;
  update public.staff_person_bindings set ended_at=now_at where id=b.id;
  perform public.tjanst_binding_audit(parent,b.id,'tjanst_binding_ended',jsonb_build_object('personId',b.staff_person_id,'membershipId',b.membership_id,'assignmentId',mandate_id));
 end loop;
 insert into public.staff_person_bindings(staff_person_id,membership_id,customer_id,organizer_id,access_assignment_id,bound_by_assignment_id,bound_at)
 values(person.id,recipient_id,parent.customer_id,parent.organizer_id,mandate_id,parent.id,now_at) returning id into binding_id;
 perform public.tjanst_binding_audit(parent,binding_id,'tjanst_person_bound',jsonb_build_object('personId',person.id,'membershipId',recipient_id,'assignmentId',mandate_id));
 return binding_id;
end $$;

-- Senaste definition ur 20260929140000 med tre ändringar: nyckeln staffPersonId, self bara för larare med
-- staffPersonId (andra scope nekar nyckeln) och bindningen efter den slutliga mandatprövningen.
create or replace function public.phase3_insert_mandate(actor_id uuid,payload jsonb) returns uuid
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare parent public.access_assignments; recipient public.memberships; new_id uuid:=gen_random_uuid();
  fn public.access_function; unit_ids uuid[]; staff_id uuid; group_item jsonb; item uuid; self_person uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k not in ('membershipId','function','unitIds','scopeKind','groups','pupilIds','caseIds',
      'validFrom','validTo','startsAt','endsAt','profession','purposeCode','staffAssignmentId','staffPersonId')) then
    raise exception 'Invalid mandate payload' using errcode='22023'; end if;
  select * into parent from public.access_assignments where id=actor_id;
  if not found or not public.phase3_mandate_is_valid(parent.id) then raise exception 'Mandate denied' using errcode='42501'; end if;
  select * into recipient from public.memberships where id=(payload->>'membershipId')::uuid and customer_id=parent.customer_id and status='active';
  if not found then raise exception 'Recipient denied' using errcode='42501'; end if;
  fn:=(payload->>'function')::public.access_function;
  unit_ids:=array(select jsonb_array_elements_text(coalesce(payload->'unitIds','[]'))::uuid);
  staff_id:=nullif(payload->>'staffAssignmentId','')::uuid;
  -- 05.1 D-03: Egen tjänst bara för lärare, alltid med en uttrycklig person ur huvudmannens personal.
  self_person:=nullif(payload->>'staffPersonId','')::uuid;
  if coalesce(payload->>'scopeKind','')='self' and fn<>'larare' then raise exception 'Self mandate denied' using errcode='42501'; end if;
  if (coalesce(payload->>'scopeKind','')='self')<>(self_person is not null) then raise exception 'Invalid staff person' using errcode='22023'; end if;
  if fn in ('rektor','larare') then
    if staff_id is null then
      insert into public.assignments(organizer_id,name,role)
      select parent.organizer_id,coalesce(nullif(i.display_name,''),'Personal'),fn::text::public.staff_role
        from public.identities i where i.id=recipient.identity_id returning id into staff_id;
    else
      if not exists(select 1 from public.assignments s where s.id=staff_id and s.organizer_id=parent.organizer_id and s.role::text=fn::text)
        or exists(select 1 from public.staff_assignment_bindings b where b.staff_assignment_id=staff_id and b.membership_id<>recipient.id)
      then raise exception 'Staff binding denied' using errcode='42501'; end if;
    end if;
    insert into public.staff_assignment_bindings values(staff_id,recipient.id,parent.customer_id,parent.organizer_id) on conflict do nothing;
    insert into public.assignment_units(assignment_id,unit_id) select staff_id,unnest(unit_ids) on conflict do nothing;
  elsif staff_id is not null then raise exception 'Unexpected staff binding' using errcode='22023'; end if;
  insert into public.access_assignments(id,membership_id,customer_id,organizer_id,unit_id,function,
    valid_from,valid_to,staff_assignment_id,created_by,parent_assignment_id,issued_by_assignment_id,
    profile_id,scope_kind,profession,starts_at,ends_at,approved_by_assignment_id,purpose_code)
  values(new_id,recipient.id,parent.customer_id,parent.organizer_id,unit_ids[1],fn,
    coalesce((payload->>'validFrom')::date,public.app_today()),(payload->>'validTo')::date,staff_id,parent.membership_id,
    parent.id,parent.id,'synthetic-v1',payload->>'scopeKind',payload->>'profession',
    (payload->>'startsAt')::timestamptz,(payload->>'endsAt')::timestamptz,
    case when fn='support' then parent.id end,payload->>'purposeCode');
  insert into public.mandate_units select new_id,parent.customer_id,parent.organizer_id,unnest(unit_ids);
  for group_item in select value from jsonb_array_elements(coalesce(payload->'groups','[]')) loop
    if jsonb_typeof(group_item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(group_item) k where k not in ('id','kind'))
      or group_item->>'kind' not in ('teaching','mentor') or group_item->>'kind' is null then
      raise exception 'Invalid group' using errcode='22023'; end if;
    insert into public.mandate_groups
      select new_id,g.id,parent.customer_id,g.unit_id,case group_item->>'kind' when 'teaching' then 'undervisning' else 'mentor' end
      from public.school_classes g where g.id=(group_item->>'id')::uuid and g.customer_id=parent.customer_id;
    if not found then raise exception 'Group denied' using errcode='42501'; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(payload->'pupilIds','[]'))::uuid loop
    insert into public.mandate_pupils select new_id,p.id,parent.customer_id,p.unit_id from (select pp.pupil_id id,pp.unit_id from public.pupil_placements pp where pp.pupil_id=item and pp.customer_id=parent.customer_id and pp.unit_id=any(unit_ids) and (pp.ends_on is null or pp.ends_on>=public.app_today()) order by (pp.starts_on<=public.app_today()) desc,pp.starts_on,pp.id limit 1) p;
    if not found then raise exception 'Pupil denied' using errcode='42501'; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(payload->'caseIds','[]'))::uuid loop
    insert into public.mandate_cases select new_id,c.id,parent.customer_id,c.unit_id from public.phase3_probe_cases c where c.id=item and c.customer_id=parent.customer_id;
    if not found then raise exception 'Case denied' using errcode='42501'; end if;
  end loop;
  if not public.phase3_mandate_is_valid(new_id,false) then raise exception 'Delegation denied' using errcode='42501'; end if;
  if self_person is not null then perform public.phase51_bind_self_person(parent,recipient.id,new_id,self_person,unit_ids); end if;
  return new_id;
end $$;

-- 4. Personalfamiljen (tjanst_personal_read/command/status).
create function public.tjanst_command_ref(input jsonb,expected_family text) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare c jsonb;t jsonb;actions text[];
begin
 if not public.phase5_programplan_shape(input,array['command']) or not public.phase5_programplan_shape(input->'command',array['family','commandId','action','target'])
  or input#>>'{command,family}' is distinct from expected_family or jsonb_typeof(input#>'{command,action}') is distinct from 'string'
  or not public.phase5_programplan_shape(input#>'{command,target}',array['unitId','schoolYear','versionId','personId']) then
  raise exception 'Invalid service allocation status request' using errcode='22023',hint='tjanst_invalid';end if;
 c:=input->'command';t:=c->'target';
 actions:=case expected_family when 'personal' then array['create_person','update_person','create_draft_teacher','save_employment','save_duties']
  when 'plan' then array['create_draft','add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','discard_draft','publish']
  when 'self' then array['ack','comment'] end;
 if actions is null or not (c->>'action'=any(actions))
  or (t->'schoolYear'<>'null'::jsonb and not public.phase5_programplan_integer(t->'schoolYear',2000,2100)) then
  raise exception 'Invalid service allocation status request' using errcode='22023',hint='tjanst_invalid';end if;
 return jsonb_build_object('family',expected_family,'commandId',public.tjanst_uuid(c->'commandId'),'action',c->>'action',
  'target',jsonb_build_object('unitId',case when t->'unitId'='null'::jsonb then null else public.tjanst_uuid(t->'unitId') end,
   'schoolYear',t->'schoolYear',
   'versionId',case when t->'versionId'='null'::jsonb then null else public.tjanst_uuid(t->'versionId') end,
   'personId',case when t->'personId'='null'::jsonb then null else public.tjanst_uuid(t->'personId') end));
end $$;

create function public.tjanst_personal_parse(input jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare p jsonb;action_name text;payload jsonb;d jsonb;duties jsonb:='[]';keys text[]:='{}';k text;
begin
 if not public.phase5_programplan_shape(input,array['commandId','action','expectedRevision','payload'])
  or jsonb_typeof(input->'action') is distinct from 'string'
  or input->>'action' not in ('create_person','update_person','create_draft_teacher','save_employment','save_duties')
  or not public.phase5_programplan_integer(input->'expectedRevision',0,2147483647) then
  raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
 action_name:=input->>'action';p:=input->'payload';
 if action_name in ('create_person','create_draft_teacher') and (input->>'expectedRevision')::integer<>0 then
  raise exception 'Personnel revision conflict' using errcode='40001',hint='tjanst_revision_conflict';end if;
 if action_name in ('create_person','update_person') then
  if not public.phase5_programplan_shape(p,case when action_name='create_person' then array['givenName','familyName','externalId','externalIdSource']
    else array['personId','givenName','familyName','externalId','externalIdSource'] end)
   or not public.phase5_apl_text(p->'givenName',200,false) or not public.phase5_apl_text(p->'familyName',200,false)
   or (p->'externalId'='null'::jsonb)<>(p->'externalIdSource'='null'::jsonb)
   or (p->'externalId'<>'null'::jsonb and (not public.phase5_apl_text(p->'externalId',200,false) or not public.phase5_apl_text(p->'externalIdSource',100,false))) then
   raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('givenName',p->'givenName','familyName',p->'familyName','externalId',p->'externalId','externalIdSource',p->'externalIdSource');
  if action_name='update_person' then payload:=payload||jsonb_build_object('personId',public.tjanst_uuid(p->'personId'));end if;
 elsif action_name='create_draft_teacher' then
  if not public.phase5_programplan_shape(p,array['unitId','givenName','familyName','draftNote'])
   or not public.phase5_apl_text(p->'givenName',200,false) or not public.phase5_apl_text(p->'familyName',200,false)
   or not public.phase5_apl_text(p->'draftNote',500,true) then
   raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('unitId',public.tjanst_uuid(p->'unitId'),'givenName',p->'givenName','familyName',p->'familyName','draftNote',p->'draftNote');
 elsif action_name='save_employment' then
  if not public.phase5_programplan_shape(p,array['personId','employmentId','percent','startsOn','endsOn'])
   or not public.phase5_programplan_integer(p->'percent',1,100) or not public.phase5_apl_date(p->'startsOn')
   or (p->'endsOn'<>'null'::jsonb and (not public.phase5_apl_date(p->'endsOn') or (p->>'endsOn')::date<(p->>'startsOn')::date)) then
   raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
  payload:=jsonb_build_object('personId',public.tjanst_uuid(p->'personId'),
   'employmentId',case when p->'employmentId'='null'::jsonb then null else public.tjanst_uuid(p->'employmentId') end,
   'percent',(p->>'percent')::integer,'startsOn',p->'startsOn','endsOn',p->'endsOn');
 else
  if not public.phase5_programplan_shape(p,array['personId','employmentId','duties']) or jsonb_typeof(p->'duties') is distinct from 'array'
   or jsonb_array_length(p->'duties')>200 then
   raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
  for d in select x.value from jsonb_array_elements(p->'duties') with ordinality x(value,n) order by x.n loop
   if not public.phase5_programplan_shape(d,array['dutyId','unitId','percent','startsOn','endsOn'])
    or not public.phase5_programplan_integer(d->'percent',1,100) or not public.phase5_apl_date(d->'startsOn')
    or (d->'endsOn'<>'null'::jsonb and (not public.phase5_apl_date(d->'endsOn') or (d->>'endsOn')::date<(d->>'startsOn')::date)) then
    raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
   d:=jsonb_build_object('dutyId',case when d->'dutyId'='null'::jsonb then null else public.tjanst_uuid(d->'dutyId') end,
    'unitId',public.tjanst_uuid(d->'unitId'),'percent',(d->>'percent')::integer,'startsOn',d->'startsOn','endsOn',d->'endsOn');
   k:=coalesce(d->>'dutyId',(d->>'unitId')||':'||(d->>'startsOn'));
   if k=any(keys) then raise exception 'Invalid personnel command' using errcode='22023',hint='tjanst_invalid';end if;
   keys:=array_append(keys,k);duties:=duties||jsonb_build_array(d);
  end loop;
  payload:=jsonb_build_object('personId',public.tjanst_uuid(p->'personId'),'employmentId',public.tjanst_uuid(p->'employmentId'),'duties',duties);
 end if;
 return jsonb_build_object('commandId',public.tjanst_uuid(input->'commandId'),'action',action_name,'expectedRevision',(input->>'expectedRevision')::integer,'payload',payload);
end $$;

create function public.tjanst_duty_json(d public.staff_school_duties) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',d.id,'unitId',d.unit_id,'schoolName',(select u.name from public.school_units u where u.id=d.unit_id),
  'percent',d.percent,'startsOn',d.starts_on,'endsOn',d.ends_on)
$$;

-- D-11: utan skola (bara huvudmannen) visas anställningar och alla andelar. Med skola visas bara den skolans andelar,
-- inga anställningar och inget om andra skolor, inte heller en summa.
create function public.tjanst_person_json(p public.staff_people,unit uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'givenName',p.given_name,'familyName',p.family_name,'externalId',p.external_id,'externalIdSource',p.external_id_source,
  'status',p.status,'proposedForUnitId',case when unit is null or p.proposed_for_unit_id=unit then p.proposed_for_unit_id end,
  'draftNote',case when unit is null or p.proposed_for_unit_id=unit then p.draft_note end,'revision',p.revision,
  'employments',case when unit is null then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'percent',e.percent,'startsOn',e.starts_on,'endsOn',e.ends_on,
    'duties',coalesce((select jsonb_agg(public.tjanst_duty_json(d) order by d.starts_on,d.id) from public.staff_school_duties d where d.employment_id=e.id),'[]'::jsonb))
    order by e.starts_on,e.id) from public.staff_employments e where e.staff_person_id=p.id),'[]'::jsonb) else '[]'::jsonb end,
  'duties',coalesce((select jsonb_agg(public.tjanst_duty_json(d) order by d.starts_on,d.id) from public.staff_school_duties d
    where d.staff_person_id=p.id and (unit is null or d.unit_id=unit)),'[]'::jsonb))
$$;

create function public.tjanst_personal_projection(a public.access_assignments,person_filter uuid,unit uuid) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare people jsonb;
begin
 if a.function not in ('huvudman','rektor') or (a.function='rektor' and unit is null)
  or (unit is not null and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=unit)) then
  raise exception 'Personnel read denied' using errcode='42501';end if;
 select coalesce(jsonb_agg(public.tjanst_person_json(p,unit) order by p.family_name collate "C",p.given_name collate "C",p.id),'[]'::jsonb) into people
 from public.staff_people p where p.customer_id=a.customer_id and p.organizer_id=a.organizer_id and (person_filter is null or p.id=person_filter)
  and (unit is null or exists(select 1 from public.staff_school_duties d where d.staff_person_id=p.id and d.unit_id=unit)
   or (p.status='draft' and p.proposed_for_unit_id=unit));
 return jsonb_build_object('contractVersion','tjanst_v1','scope',case when unit is null then 'organizer' else 'unit' end,'unitId',unit,'people',people,
  'actions',case when a.function='rektor' then '["create_draft_teacher"]'::jsonb when unit is null then '["create_person","update_person","save_employment","save_duties"]'::jsonb else '[]'::jsonb end,
  'blockers','[]'::jsonb,
  'capabilities',jsonb_build_object('canManage',a.function='huvudman' and unit is null,'canCreateDraft',a.function='rektor'));
end $$;

create function public.tjanst_personal_read(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;person uuid;unit uuid;result jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or exists(select 1 from jsonb_object_keys(input) k where k not in ('personId','unitId')) then
  raise exception 'Invalid personnel read' using errcode='22023',hint='tjanst_invalid';end if;
 if input ? 'personId' then person:=public.tjanst_uuid(input->'personId');end if;
 if input ? 'unitId' then unit:=public.tjanst_uuid(input->'unitId');end if;
 a:=public.tjanst_actor('personal');
 result:=public.tjanst_personal_projection(a,person,unit);
 perform public.tjanst_audit('tjanst_personal_read','staff_person',person,jsonb_build_object('unitId',unit));
 return result;
end $$;

create function public.tjanst_lock_person(a public.access_assignments,person_id uuid,expected_revision integer) returns public.staff_people
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.staff_people;
begin
 select * into p from public.staff_people x where x.id=person_id and x.customer_id=a.customer_id and x.organizer_id=a.organizer_id for update;
 if not found then raise exception 'Personnel denied' using errcode='42501';end if;
 if p.revision<>expected_revision then raise exception 'Personnel revision conflict' using errcode='40001',hint='tjanst_revision_conflict';end if;
 return p;
end $$;

create function public.tjanst_personal_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;p jsonb;request_id uuid;action_name text;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;
 person public.staff_people;e public.staff_employments;target jsonb;unit uuid;d jsonb;kept uuid[]:='{}';duty_id uuid;
 receipt jsonb;detail jsonb;envelope jsonb;audit_action text;now_at timestamptz;
begin
 q:=public.tjanst_personal_parse(input);p:=q->'payload';request_id:=(q->>'commandId')::uuid;action_name:=q->>'action';
 a:=public.tjanst_actor('personal');s:=public.phase5_programplan_session_check();
 -- D-19: huvudmannen lägger in och kompletterar personal; rektor lägger bara upp utkastlärare för sin skola.
 if (action_name='create_draft_teacher' and a.function<>'rektor') or (action_name<>'create_draft_teacher' and a.function<>'huvudman') then
  raise exception 'Personnel command denied' using errcode='42501';end if;
 target:=jsonb_build_object('unitId',coalesce(p->'unitId','null'::jsonb),'schoolYear',null,'versionId',null,'personId',coalesce(p->'personId','null'::jsonb));
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5551));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('personal',action_name,a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Personnel command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 now_at:=clock_timestamp();
 if action_name='create_person' then
  begin
   insert into public.staff_people(customer_id,organizer_id,given_name,family_name,external_id,external_id_source,status,revision)
   values(a.customer_id,a.organizer_id,p->>'givenName',p->>'familyName',p->>'externalId',p->>'externalIdSource','active',1) returning * into person;
  exception when unique_violation then raise exception 'External identifier already used' using errcode='22023',hint='tjanst_invalid';end;
  audit_action:='tjanst_person_created';
 elsif action_name='update_person' then
  person:=public.tjanst_lock_person(a,(p->>'personId')::uuid,(q->>'expectedRevision')::integer);
  begin
   update public.staff_people set given_name=p->>'givenName',family_name=p->>'familyName',external_id=p->>'externalId',external_id_source=p->>'externalIdSource',
    revision=revision+1,updated_at=now_at where id=person.id returning * into person;
  exception when unique_violation then raise exception 'External identifier already used' using errcode='22023',hint='tjanst_invalid';end;
  audit_action:='tjanst_person_updated';
 elsif action_name='create_draft_teacher' then
  unit:=(p->>'unitId')::uuid;
  if not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=unit) then raise exception 'Personnel command denied' using errcode='42501';end if;
  insert into public.staff_people(customer_id,organizer_id,given_name,family_name,status,proposed_for_unit_id,draft_note,revision)
  values(a.customer_id,a.organizer_id,p->>'givenName',p->>'familyName','draft',unit,p->>'draftNote',1) returning * into person;
  audit_action:='tjanst_draft_teacher_created';
 elsif action_name='save_employment' then
  person:=public.tjanst_lock_person(a,(p->>'personId')::uuid,(q->>'expectedRevision')::integer);
  if p->'employmentId'<>'null'::jsonb then
   select * into e from public.staff_employments x where x.id=(p->>'employmentId')::uuid and x.staff_person_id=person.id for update;
   if not found then raise exception 'Unknown employment' using errcode='22023',hint='tjanst_invalid';end if;
  end if;
  if exists(select 1 from public.staff_employments x where x.staff_person_id=person.id and x.id is distinct from e.id
    and daterange(x.starts_on,x.ends_on,'[]')&&daterange((p->>'startsOn')::date,(p->>'endsOn')::date,'[]')) then
   raise exception 'Overlapping employment' using errcode='22023',hint='tjanst_employment_overlap';end if;
  if e.id is null then
   insert into public.staff_employments(customer_id,organizer_id,staff_person_id,percent,starts_on,ends_on)
   values(person.customer_id,person.organizer_id,person.id,(p->>'percent')::integer,(p->>'startsOn')::date,(p->>'endsOn')::date) returning * into e;
  else
   update public.staff_employments set percent=(p->>'percent')::integer,starts_on=(p->>'startsOn')::date,ends_on=(p->>'endsOn')::date,updated_at=now_at
   where id=e.id returning * into e;
  end if;
  -- Ändrad grad eller period prövar andelarna på nytt.
  perform public.tjanst_capacity_check(e.id);
  -- Huvudmannens första sparade anställning kompletterar rektors utkastlärare (D-19).
  update public.staff_people set status='active',revision=revision+1,updated_at=now_at where id=person.id returning * into person;
  audit_action:='tjanst_employment_saved';
 else
  person:=public.tjanst_lock_person(a,(p->>'personId')::uuid,(q->>'expectedRevision')::integer);
  select * into e from public.staff_employments x where x.id=(p->>'employmentId')::uuid and x.staff_person_id=person.id for update;
  if not found then raise exception 'Unknown employment' using errcode='22023',hint='tjanst_invalid';end if;
  for d in select x.value from jsonb_array_elements(p->'duties') with ordinality x(value,n) order by x.n loop
   if not exists(select 1 from public.mandate_units m join public.school_units u on u.id=m.unit_id and u.organizer_id=a.organizer_id
     where m.assignment_id=a.id and m.unit_id=(d->>'unitId')::uuid) then raise exception 'Personnel command denied' using errcode='42501';end if;
   if d->'dutyId'<>'null'::jsonb then
    update public.staff_school_duties set unit_id=(d->>'unitId')::uuid,percent=(d->>'percent')::integer,starts_on=(d->>'startsOn')::date,
     ends_on=(d->>'endsOn')::date,updated_at=now_at where id=(d->>'dutyId')::uuid and employment_id=e.id returning id into duty_id;
    if duty_id is null then raise exception 'Unknown duty' using errcode='22023',hint='tjanst_invalid';end if;
   else
    insert into public.staff_school_duties(customer_id,organizer_id,staff_person_id,employment_id,unit_id,percent,starts_on,ends_on)
    values(e.customer_id,e.organizer_id,person.id,e.id,(d->>'unitId')::uuid,(d->>'percent')::integer,(d->>'startsOn')::date,(d->>'endsOn')::date) returning id into duty_id;
   end if;
   kept:=array_append(kept,duty_id);duty_id:=null;
  end loop;
  delete from public.staff_school_duties where employment_id=e.id and not (id=any(kept));
  perform public.tjanst_capacity_check(e.id);
  update public.staff_people set revision=revision+1,updated_at=now_at where id=person.id returning * into person;
  audit_action:='tjanst_duties_saved';
 end if;
 detail:=public.tjanst_personal_projection(a,null,case when a.function='rektor' then unit end);
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'personId',person.id,'revision',person.revision,'replayed',false);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt,'detail',detail));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'personal',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 perform public.tjanst_audit(audit_action,'staff_person',person.id,jsonb_build_object('commandId',request_id,'action',action_name,'revision',person.revision,'unitId',unit));
 return envelope;
end $$;

create function public.tjanst_personal_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare ref jsonb;a public.access_assignments;s public.app_sessions;r public.tjanst_commands;result jsonb;
begin
 ref:=public.tjanst_command_ref(input,'personal');
 a:=public.tjanst_actor('personal');s:=public.phase5_programplan_session_check();
 perform pg_advisory_xact_lock(hashtextextended(ref->>'commandId',5551));
 select * into r from public.tjanst_commands where command_id=(ref->>'commandId')::uuid;
 if not found then result:=jsonb_build_object('state','not_found','result',null);
 else
  if (r.family,r.action,r.target,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id)
    is distinct from ('personal',ref->>'action',ref->'target',a.customer_id,a.organizer_id,s.identity_id,a.id) then
   raise exception 'Personnel command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  result:=jsonb_build_object('state','completed','result',jsonb_set(r.envelope->'result','{receipt,replayed}','true'::jsonb,false));
 end if;
 perform public.tjanst_audit('tjanst_personal_status_read','tjanst_command',(ref->>'commandId')::uuid,jsonb_build_object('action',ref->>'action'));
 return jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),'result',result);
end $$;

-- 5. Elevspärren (T-05.1-08). Ett self-mandat får inga elevlistor och inga klass-, utbildnings- eller årskursval.
-- Varje elevfunktion nedan är sin senaste definition ordagrant, med spärren som första sats.
create function public.phase51_deny_self() returns void
language plpgsql stable security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.access_assignments a where a.id=public.current_assignment_id() and a.scope_kind='self') then
  raise exception 'Self mandate has no pupil access' using errcode='42501';end if;
end $$;

-- Genererad ur migrationskällorna (sista förekomsten av varje funktion); verifieraren jämför pg_get_functiondef före och efter.
-- phase4_validate_selection: senaste definition ur 20261004140000_phase5_offering_unit_linkage.sql; enda ändring är spärren först.
create or replace function public.phase4_validate_selection(s jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; u uuid;
begin
 perform public.phase51_deny_self();
 perform public.phase4_keys(s,array['schoolYear','unitId','classId','educationId','grade','status','page']);
 if jsonb_typeof(s->'schoolYear')<>'number' or (s->>'schoolYear') !~ '^[0-9]+$'
 or jsonb_typeof(s->'page')<>'number' or (s->>'page') !~ '^[0-9]+$' or (s->>'page')::numeric<1 or (s->>'page')::numeric>2147483647
 or (s->>'schoolYear')::numeric not between 1 and 9998
 or (s->'grade'<>'null'::jsonb and (jsonb_typeof(s->'grade')<>'number' or (s->>'grade')!~ '^-?[0-9]+$' or (s->>'grade')::numeric not between -2147483648 and 2147483647))
 or (s->'status'<>'null'::jsonb and s->>'status' not in ('aktuell','framtida','avslutad')) then raise exception 'Invalid selection' using errcode='22023'; end if;
 perform public.phase4_year((s->>'schoolYear')::integer); u:=(s->>'unitId')::uuid;
 a:=public.phase3_actor();
 if u is null or not exists(select 1 from public.mandate_units x where x.assignment_id=a.id and x.unit_id=u) then raise exception 'Read denied' using errcode='42501'; end if;
 if s->>'classId' is not null and not exists(select 1 from public.school_classes c where c.id=(s->>'classId')::uuid and c.unit_id=u and c.customer_id=a.customer_id) then raise exception 'Read denied' using errcode='42501'; end if;
 if s->>'educationId' is not null and not exists(select 1 from public.offering_units ou where ou.offering_id=(s->>'educationId')::uuid and ou.unit_id=u and ou.organizer_id=a.organizer_id) then raise exception 'Read denied' using errcode='42501'; end if;
end$function$;

-- phase4_list_pupils: senaste definition ur 20261004140000_phase5_offering_unit_linkage.sql; enda ändring är spärren först.
create or replace function public.phase4_list_pupils(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; s jsonb; rows jsonb; refs jsonb; total integer; page_number integer; options jsonb; scope jsonb; protected_ids jsonb;
begin
 perform public.phase51_deny_self();
 perform public.phase4_keys(request,array['selection','search','caseId']);
 if jsonb_typeof(request->'search') is distinct from 'string' then raise exception 'Invalid search' using errcode='22023'; end if;
 a:=public.phase3_actor(); s:=request->'selection'; perform public.phase4_validate_selection(s); page_number:=(s->>'page')::integer;
 with selected as materialized(select * from public.phase4_filtered(s,request->>'search',(request->>'caseId')::uuid)),
 page as(select * from selected order by item->>'displayName',pupil_id limit 50 offset (page_number::bigint-1)*50)
 select (select count(*) from selected),
 coalesce(jsonb_agg(case when a.function='administrator' and p.is_protected and p.full_access then p.item||jsonb_build_object('protectedIdentity',true) else p.item end order by p.item->>'displayName',p.pupil_id),'[]'),
 coalesce((select jsonb_agg(r order by x.item->>'displayName',x.pupil_id) from selected x cross join lateral jsonb_array_elements(x.audit_refs)r),'[]'),
 coalesce((select jsonb_agg(to_jsonb(x.pupil_id) order by x.item->>'displayName',x.pupil_id) from selected x where a.function='administrator' and x.is_protected and x.full_access),'[]')
 into total,rows,refs,protected_ids from page p;
 select jsonb_build_object('schools',coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name)order by u.name,u.id),'[]')) into scope
 from public.mandate_units m join public.school_units u on u.id=m.unit_id where m.assignment_id=a.id;
 scope:=scope||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'unitId',c.unit_id)order by c.name,c.id) from public.mandate_groups g join public.school_classes c on c.id=g.group_id where g.assignment_id=a.id),'[]'),
 'cases',coalesce((select jsonb_agg(jsonb_build_object('id',m.case_id,'name','Tilldelat ärende','unitId',m.unit_id)order by m.case_id) from public.mandate_cases m where m.assignment_id=a.id),'[]'));
 select jsonb_build_object('schools',scope->'schools',
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'unitId',c.unit_id,'educationId',c.offering_id)order by c.name,c.id) from public.school_classes c where c.unit_id=(s->>'unitId')::uuid and c.customer_id=a.customer_id),'[]'),
 'educations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'unitId',ou.unit_id,'startYear',o.start_year)order by o.name,o.id) from public.offerings o join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id where ou.unit_id=(s->>'unitId')::uuid and o.organizer_id=a.organizer_id),'[]'),
 'grades',coalesce((select jsonb_agg(g order by g) from(select distinct (s->>'schoolYear')::integer-o.start_year+1 g from public.offerings o join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id where ou.unit_id=(s->>'unitId')::uuid and o.start_year is not null)x),'[]'),
 'statuses',jsonb_build_array('aktuell','framtida','avslutad')) into options;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupils',rows,'scope',scope,'options',options,'count',total,'page',page_number,'pageSize',50,
 'capabilities',jsonb_build_object('canEdit',a.function='administrator','canExport',a.function='administrator','canRevealPersonalNumber',a.function='administrator','canReadHistory',a.function='administrator','canReadProtected',a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid)))
 ||case when a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid) then jsonb_build_object('protectedIds',protected_ids) else '{}'::jsonb end,
 'auditRefs',refs);
end$function$;

-- phase4_register_selection: senaste definition ur 20260929161000_phase4_register_selection.sql; enda ändring är spärren först.
create or replace function public.phase4_register_selection() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s jsonb; years jsonb; current_year integer;
begin
 perform public.phase51_deny_self();
 a:=public.phase3_actor();
 -- Reuses the live scoped metadata projection, including support expiry.
 s:=public.phase3_probe_scope();
 current_year:=extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end;
 select jsonb_agg(y order by y) into years from (
  select generate_series(current_year-1,current_year+1) as y
  union select sy.start_year from public.school_years sy
   join public.mandate_units mu on mu.unit_id=sy.unit_id and mu.assignment_id=a.id
   where sy.organizer_id=a.organizer_id
 ) permitted_years where y between 1 and 9998;
 return jsonb_build_object('schoolYears',years,'currentSchoolYear',current_year,
  'scope',jsonb_build_object('schools',s->'schools',
   'groups',coalesce((select jsonb_agg(jsonb_build_object('id',v->'id','unitId',v->'unitId','name',v->'label')) from jsonb_array_elements(s->'groups') v),'[]'::jsonb),
   'cases',coalesce((select jsonb_agg(jsonb_build_object('id',v->'id','unitId',v->'unitId','name',v->'label')) from jsonb_array_elements(s->'cases') v),'[]'::jsonb)),
  'endsAt',s->'endsAt','approverName',s->'approverName','purposeCode',s->'purposeCode','serverNow',s->'serverNow');
end $$;

-- phase3_probe_scope: senaste definition ur 20260929140000_phase4_register_reads.sql; enda ändring är spärren först.
create or replace function public.phase3_probe_scope() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
 perform public.phase51_deny_self();
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
        from public.school_classes g join public.school_units s on s.id=g.unit_id
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

-- phase4_card_row: senaste definition ur 20260929140000_phase4_register_reads.sql; enda ändring är spärren först.
create or replace function public.phase4_card_row(request jsonb)
returns table(pupil_id uuid,unit_id uuid,is_protected boolean,full_access boolean,item jsonb,audit_refs jsonb)
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$begin
 perform public.phase51_deny_self();
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId']);
 if jsonb_typeof(request->'schoolYear') is distinct from 'number' or (request->>'schoolYear')!~'^[0-9]+$' or (request->>'schoolYear')::numeric not between 1 and 9998 or request->>'pupilId' is null then raise exception 'Invalid card' using errcode='22023'; end if;
 return query select p.* from public.phase4_projection((request->>'schoolYear')::integer,null,(request->>'caseId')::uuid)p where p.pupil_id=(request->>'pupilId')::uuid;
 if not found then raise exception 'Pupil not found' using errcode='P0002'; end if;
end$$;

-- phase4_pupil_card: senaste definition ur 20260929140000_phase4_register_reads.sql; enda ändring är spärren först.
create or replace function public.phase4_pupil_card(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record; result jsonb;
begin
 perform public.phase51_deny_self();
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request);
 result:=r.item||jsonb_build_object('version',(select p.version from public.pupils p where p.id=r.pupil_id),
 'placements',case when r.full_access then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'unitId',p.unit_id,'educationId',p.offering_id,'startsOn',p.starts_on,'endsOn',p.ends_on)order by p.starts_on,p.id) from public.pupil_placements p where p.pupil_id=r.pupil_id and p.unit_id=r.unit_id),'[]') else '[]'::jsonb end,
 'classes',case when r.full_access then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'placementId',c.placement_id,'classId',c.class_id,'startsOn',c.starts_on,'endsOn',c.ends_on)order by c.starts_on,c.id) from public.pupil_class_memberships c where c.pupil_id=r.pupil_id and c.unit_id=r.unit_id and (a.scope_kind<>'group' or exists(select 1 from public.mandate_groups g where g.assignment_id=a.id and g.group_id=c.class_id))),'[]') else '[]'::jsonb end);
 if a.function='administrator' and r.full_access then
 result:=result||jsonb_build_object('protectedIdentity',r.is_protected,
 'municipalities',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'municipalityCode',m.municipality_code,'startsOn',m.starts_on,'endsOn',m.ends_on,'origin',(select jsonb_build_object('source',h.source,'actorId',h.actor_id,'changedAt',h.changed_at,'localCorrection',exists(select 1 from public.pupil_field_state fs where fs.pupil_id=h.pupil_id and fs.field=h.field and fs.revision=h.revision and fs.local_correction)) from public.pupil_field_history h where h.pupil_id=m.pupil_id and h.field='municipality' and (h.after_value->>'id'=m.id::text or (h.after_value->>'municipalityCode'=m.municipality_code and h.after_value->>'startsOn'=m.starts_on::text)) order by h.changed_at desc,h.id limit 1))order by m.starts_on,m.id) from public.pupil_home_municipalities m join public.pupils p on p.id=m.pupil_id where m.pupil_id=r.pupil_id and exists(select 1 from public.pupil_placements pp where pp.pupil_id=m.pupil_id and pp.unit_id=r.unit_id and daterange(pp.starts_on,pp.ends_on,'[]')&&daterange(m.starts_on,m.ends_on,'[]'))),'[]'),
 'origins',coalesce((select jsonb_object_agg(f.field,jsonb_build_object('source',f.source,'actorId',f.actor_id,'changedAt',f.changed_at,'localCorrection',f.local_correction)) from public.pupil_field_state f where f.pupil_id=r.pupil_id),'{}'),
 'sourceConflicts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'field',s.field,'origin',jsonb_build_object('source',s.source,'actorId',s.actor_id,'changedAt',s.changed_at,'localCorrection',false))||case when s.field='personalNumber' then '{}'::jsonb else jsonb_build_object('local',case s.field when 'displayName' then to_jsonb(p.display_name) when 'protectedIdentity' then to_jsonb(p.protected_identity) else 'null'::jsonb end,'incoming',public.phase4_history_value(s.field,s.source_value,r.unit_id))end order by s.changed_at,s.id) from public.pupil_source_values s join public.pupils p on p.id=s.pupil_id where s.pupil_id=r.pupil_id and s.resolved_at is null),'[]'));
 end if;
 return jsonb_build_object('kind','success','body',result,'auditRefs',r.audit_refs);
end$$;

-- phase4_pupil_history: senaste definition ur 20260929163000_phase4_source_owned_refresh.sql; enda ändring är spärren först.
create or replace function public.phase4_pupil_history(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record; entries jsonb; total integer; page_number integer;
begin
 perform public.phase51_deny_self();
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId','page']);
 if jsonb_typeof(request->'page') is distinct from 'number' or (request->>'page')!~'^[0-9]+$' or (request->>'page')::numeric<1 or (request->>'page')::numeric>2147483647 then raise exception 'Invalid page' using errcode='22023'; end if;
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request-'page');
 if a.function<>'administrator' or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 page_number:=(request->>'page')::integer;
 select count(*) into total from public.pupil_field_history h where h.pupil_id=r.pupil_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'field',h.field,'before',public.phase4_history_value(h.field,h.before_value,r.unit_id),'after',public.phase4_history_value(h.field,h.after_value,r.unit_id),'resolution',h.resolution,'changedBy',h.actor_id,'changedAt',h.changed_at,'origin',jsonb_build_object('source',h.source,'actorId',h.actor_id,'changedAt',h.changed_at,'localCorrection',exists(select 1 from public.pupil_field_state fs where fs.pupil_id=h.pupil_id and fs.field=h.field and fs.revision=h.revision and fs.local_correction)))order by h.changed_at desc,h.id),'[]') into entries
 from(select * from public.pupil_field_history h where h.pupil_id=r.pupil_id order by h.changed_at desc,h.id limit 20 offset(page_number::bigint-1)*20)h;
 return jsonb_build_object('kind','success','body',jsonb_build_object('entries',entries,'count',total,'page',page_number,'pageSize',20),'auditRefs',r.audit_refs);
end$$;

-- phase4_export_pupils: senaste definition ur 20260929140000_phase4_register_reads.sql; enda ändring är spärren först.
create or replace function public.phase4_export_pupils(request jsonb,preview boolean default false) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; selected jsonb; r record; rows jsonb:='[]'; refs jsonb:='[]'; fields text[]; ids uuid[]; protected_ids uuid[]; seen uuid[]:='{}'; row_value jsonb; include_number boolean; y integer; c uuid; total integer:=0;
begin
 perform public.phase51_deny_self();
 a:=public.phase3_actor(); if a.function<>'administrator' then raise exception 'Export denied' using errcode='42501'; end if;
 if request->>'mode'='filter' then perform public.phase4_keys(request,array['mode','selection','search','schoolYear','caseId','fields','protectedIds','includePersonalNumber']);
 elsif request->>'mode'='ids' then perform public.phase4_keys(request,array['mode','ids','schoolYear','caseId','fields','protectedIds','includePersonalNumber']);
 else raise exception 'Invalid export' using errcode='22023'; end if;
 if preview is null or jsonb_typeof(request->'schoolYear') is distinct from 'number' or (request->>'schoolYear')!~'^[0-9]+$'
 or (request->>'schoolYear')::numeric not between 1 and 9998
 or jsonb_typeof(request->'fields') is distinct from 'array' or jsonb_typeof(request->'protectedIds') is distinct from 'array'
 or jsonb_typeof(request->'includePersonalNumber') is distinct from 'boolean' then raise exception 'Invalid export' using errcode='22023'; end if;
 y:=(request->>'schoolYear')::integer; perform public.phase4_year(y); c:=(request->>'caseId')::uuid;
 fields:=array(select jsonb_array_elements_text(request->'fields')); protected_ids:=array(select jsonb_array_elements_text(request->'protectedIds')::uuid);
 if cardinality(fields)=0 or exists(select 1 from unnest(fields)f where f not in ('id','displayName','birthDate','unitName','className','educationName','grade','status','municipalityCode')) or cardinality(fields)<>(select count(distinct f)from unnest(fields)f)
 or cardinality(protected_ids)<>(select count(distinct f)from unnest(protected_ids)f) then raise exception 'Invalid export fields' using errcode='22023'; end if;
 include_number:=(request->>'includePersonalNumber')::boolean;
 if request->>'mode'='filter' then
 if request->'selection'->>'schoolYear' is distinct from request->>'schoolYear' or jsonb_typeof(request->'search') is distinct from 'string' then raise exception 'Invalid export filter' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.item->>'displayName',x.pupil_id),'[]') into selected from public.phase4_filtered(request->'selection',request->>'search',c)x;
 else
 if jsonb_typeof(request->'ids') is distinct from 'array' or jsonb_array_length(request->'ids')=0 then raise exception 'Invalid export ids' using errcode='22023'; end if;
 ids:=array(select jsonb_array_elements_text(request->'ids')::uuid);
 if cardinality(ids)<>(select count(distinct f)from unnest(ids)f) then raise exception 'Invalid export ids' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.item->>'displayName',x.pupil_id),'[]') into selected from public.phase4_projection(y,null,c)x where x.pupil_id=any(ids);
 if jsonb_array_length(selected)<>cardinality(ids) then raise exception 'Pupil not found' using errcode='P0002'; end if;
 end if;
 for r in select * from jsonb_to_recordset(selected)as x(pupil_id uuid,unit_id uuid,is_protected boolean,full_access boolean,item jsonb,audit_refs jsonb) loop
 if r.pupil_id=any(protected_ids) then
 if not r.is_protected or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 seen:=array_append(seen,r.pupil_id);
 elsif r.is_protected then continue; end if;
 if not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 total:=total+1;
 if not preview then
 select coalesce(jsonb_object_agg(k,v),'{}') into row_value from jsonb_each(r.item)as x(k,v) where k=any(fields);
 if include_number then
 row_value:=row_value||jsonb_build_object('personalNumber',(select p.personal_number from public.pupils p where p.id=r.pupil_id));
 refs:=refs||jsonb_build_array(jsonb_build_object('kind','personal-number-export','pupilId',r.pupil_id));
 end if;
 rows:=rows||jsonb_build_array(row_value); refs:=refs||r.audit_refs;
 end if;
 end loop;
 if cardinality(seen)<>cardinality(protected_ids) then raise exception 'Pupil not found' using errcode='P0002'; end if;
 return jsonb_build_object('kind','success','body',jsonb_build_object('count',total,'fields',to_jsonb(fields),'includePersonalNumber',include_number)||case when preview then '{}'::jsonb else jsonb_build_object('rows',rows)end,'auditRefs',refs);
end$$;

-- phase4_reveal_personal_number: senaste definition ur 20260929140000_phase4_register_reads.sql; enda ändring är spärren först.
create or replace function public.phase4_reveal_personal_number(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record;
begin
 perform public.phase51_deny_self();
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request);
 if a.function<>'administrator' or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupilId',r.pupil_id,'personalNumber',(select p.personal_number from public.pupils p where p.id=r.pupil_id)),
 'auditRefs',r.audit_refs||jsonb_build_array(jsonb_build_object('kind','personal-number','pupilId',r.pupil_id)));
end$$;

-- 6. Allt nytt är stängt. Worker får EXECUTE på tjanst_personal_read/command/status först i grant-migrationen (plan 09).
revoke all on function public.tjanst_journal_guard(),public.tjanst_uuid(jsonb),public.tjanst_canonical(jsonb,integer),public.tjanst_hash(jsonb),
 public.tjanst_actor(text),public.tjanst_audit_details(jsonb),public.tjanst_audit(text,text,uuid,jsonb),
 public.tjanst_binding_audit(public.access_assignments,uuid,text,jsonb),public.tjanst_capacity_check(uuid),
 public.phase51_bind_self_person(public.access_assignments,uuid,uuid,uuid,uuid[]),public.tjanst_command_ref(jsonb,text),
 public.tjanst_personal_parse(jsonb),public.tjanst_duty_json(public.staff_school_duties),public.tjanst_person_json(public.staff_people,uuid),
 public.tjanst_personal_projection(public.access_assignments,uuid,uuid),public.tjanst_personal_read(jsonb),
 public.tjanst_lock_person(public.access_assignments,uuid,integer),public.tjanst_personal_command(jsonb),public.tjanst_personal_status(jsonb),
 public.phase51_deny_self()
from public,anon,authenticated,service_role,skolplattform_worker;
