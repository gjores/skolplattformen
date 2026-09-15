-- Fixturer för det skyddade lokala provmålet (work/pilot/prepare-local.mjs --target protected).
--
-- Körs med psql som postgres mot 127.0.0.1 efter db reset. Alla ID:n är fasta
-- och alla satser är idempotenta (on conflict do nothing). Syftet är att ge
-- de negativa proven (pgTAP i plan 01-05, API i plan 01-06) kända rader att
-- försöka nå: en tidigare anonym identitet som redan har fått
-- huvudmannaprofil av bootstrap_demo_profile, ett vanligt provkonto utan
-- profil, en skolenhet med utbildning/poängplan/timplan och en fil i bucket
-- tillstand. Lösenordet är ett lokalt provvärde, inte en hemlighet.
--
-- Demohuvudmannen 00000000-0000-4000-8000-000000000001 insätts redan av
-- migrationen 20260905130000_demo_bootstrap.sql.

-- ---------------------------------------------------------------------------
-- auth.users
-- ---------------------------------------------------------------------------
-- (a) Tidigare anonym identitet (som signInDemo skapade i arbetsversionen).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous, is_sso_user,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '10000000-0000-4000-8000-000000000a01', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', null, null, null,
  '{"provider":"anonymous","providers":["anonymous"]}'::jsonb, '{}'::jsonb, true, false,
  now(), now(),
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

-- (b) Vanligt provkonto med lösenord (ingen profil i public.profiles).
insert into auth.users (
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, is_anonymous, is_sso_user,
  created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, phone_change, phone_change_token, reauthentication_token
) values (
  '10000000-0000-4000-8000-000000000a02', '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'provkonto@example.test',
  extensions.crypt('Provlosenord-1', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, false, false,
  now(), now(),
  '', '', '', '', '', '', '', ''
)
on conflict (id) do nothing;

insert into auth.identities (
  id, user_id, provider_id, provider, identity_data, last_sign_in_at, created_at, updated_at
) values (
  '10000000-0000-4000-8000-000000000b02', '10000000-0000-4000-8000-000000000a02',
  'provkonto@example.test', 'email',
  jsonb_build_object(
    'sub', '10000000-0000-4000-8000-000000000a02',
    'email', 'provkonto@example.test',
    'email_verified', true,
    'phone_verified', false
  ),
  now(), now(), now()
)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- public: gammal anonym HM-profil, skolenhet, utbildning, poängplan, timplan
-- ---------------------------------------------------------------------------
insert into public.profiles (id, organizer_id, name, role)
values ('10000000-0000-4000-8000-000000000a01', '00000000-0000-4000-8000-000000000001',
        'Gammal anonym demoprofil', 'huvudman')
on conflict (id) do nothing;

insert into public.school_units (id, organizer_id, code, name, municipality_code, municipality_name, status, locality)
values ('10000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001',
        '99999999', 'Karantänskolan', '0000', 'Exempelstad', 'Aktiv', 'Exempelstad')
on conflict (id) do nothing;

-- Två namnlika huvudmän med samma skolenhetskod provar att fas 2:s backfill
-- skapar en kund per huvudman och lämnar tvetydig registerproveniens okopplad.
insert into public.organizers (id, organization_number, name, type) values
  ('10000000-0000-4000-8000-000000000901', '5599999902', 'Namnlika huvudmannen', 'Enskild'),
  ('10000000-0000-4000-8000-000000000902', '5599999903', 'Namnlika huvudmannen', 'Enskild')
on conflict (id) do nothing;

insert into public.school_units (
  id, organizer_id, code, name, municipality_code, municipality_name, status, locality
) values
  ('10000000-0000-4000-8000-000000000911', '10000000-0000-4000-8000-000000000901', '99999998', 'Namnskola ett', '0000', 'Exempelstad', 'Aktiv', 'Exempelstad'),
  ('10000000-0000-4000-8000-000000000912', '10000000-0000-4000-8000-000000000902', '99999998', 'Namnskola två', '0000', 'Exempelstad', 'Aktiv', 'Exempelstad')
on conflict (id) do nothing;

insert into public.registry_snapshots (id, unit_code, fetched_by, source_url, payload)
values (
  '10000000-0000-4000-8000-000000000921', '99999998',
  '10000000-0000-4000-8000-000000000a01', 'https://example.test/tvetydig', '{}'
)
on conflict (id) do nothing;

insert into public.school_unit_types (unit_id, school_type, programmes)
values ('10000000-0000-4000-8000-000000000101', 'GY', '{SA}')
on conflict do nothing;

insert into public.offerings (id, organizer_id, unit_id, kind, name, program_code, orientation_code, cohort, status)
values ('10000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000101', 'gymnasium', 'Karantän SA', 'SA25', 'SASAP',
        'Elever som börjar HT 2026', 'aktiv')
on conflict (id) do nothing;

insert into public.point_plans (id, organizer_id, offering_id, version, status, specialization, decided_on)
values ('10000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000201', 1, 'faststalld', '{ENGE3000X}', '2026-09-01')
on conflict (id) do nothing;

-- Timplanen läggs först som utkast så att cellerna får skrivas (triggern
-- guard_timplan_cells låser cellerna i en fastställd version), och
-- fastställs därefter. Cellinsättningen är villkorad i stället för
-- on conflict, eftersom before-triggern annars kastar vid omkörning.
insert into public.timplans (id, organizer_id, offering_id, version, status, basis)
values ('10000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000201', 1, 'utkast', 'Poängplan v1')
on conflict (id) do nothing;

insert into public.timplan_cells (timplan_id, row_id, hours)
select '10000000-0000-4000-8000-000000000401', 'ENGE3000X', '{0,50,50}'::smallint[]
where not exists (
  select 1 from public.timplan_cells
  where timplan_id = '10000000-0000-4000-8000-000000000401' and row_id = 'ENGE3000X'
);

update public.timplans
   set status = 'faststalld', decided_on = '2026-09-01'
 where id = '10000000-0000-4000-8000-000000000401' and status = 'utkast';

-- ---------------------------------------------------------------------------
-- storage: en fil i den privata bucketen tillstand (metadata räcker för
-- list-/hämtnings-/borttagningsprov; nekandet beror inte på innehållet).
-- ---------------------------------------------------------------------------
insert into storage.objects (bucket_id, name, owner, metadata)
values ('tillstand', '00000000-0000-4000-8000-000000000001/karantan-prov.txt', null,
        '{"size":1,"mimetype":"text/plain"}'::jsonb)
on conflict do nothing;
