-- Syntetiska fixturer för fas 2:s lokala protected-mål.
-- Kunder är en egen nivå och ska inte sammanblandas med huvudmän (D-05).
insert into public.customers (id, name) values
  ('20000000-0000-4000-8000-0000000000a1', 'Provkund A'),
  ('20000000-0000-4000-8000-0000000000a2', 'Provkund B')
on conflict (id) do nothing;

-- Identiteten binds till Keycloaks issuer och subject. E-post och namn är
-- visningsuppgifter och används aldrig som inloggnings- eller behörighetsnyckel.
-- Det interna identitets-ID:t är samma som subject för läsbarhet i provmiljön.
insert into public.identities (id, issuer, subject, display_name, email) values
  ('30000000-0000-4000-8000-000000000001', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000001', 'Anna Admin', 'anna@example.test'),
  ('30000000-0000-4000-8000-000000000002', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000002', 'Bertil Granskare', 'bertil@example.test'),
  ('30000000-0000-4000-8000-000000000003', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000003', 'Cecilia Dubbel', 'cecilia@example.test'),
  ('30000000-0000-4000-8000-000000000004', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000004', 'Cecilia Dubbel', 'cecilia@example.test'),
  ('30000000-0000-4000-8000-000000000005', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000005', 'David Adminsson', 'david@example.test'),
  ('30000000-0000-4000-8000-000000000006', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000006', 'Erik Utanmedlemskap', 'erik@example.test'),
  ('30000000-0000-4000-8000-000000000007', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000007', 'Frida Uppdrag', 'frida@example.test'),
  ('30000000-0000-4000-8000-000000000008', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000008', 'Gustav Spärr', 'gustav@example.test'),
  ('30000000-0000-4000-8000-000000000009', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000009', 'Hanna Tvåkund', 'hanna@example.test'),
  ('30000000-0000-4000-8000-000000000010', 'http://host.docker.internal:8180/realms/skolplattform-test', '30000000-0000-4000-8000-000000000010', 'Ivar Utanotp', 'ivar@example.test')
on conflict (issuer, subject) do nothing;

-- Tio medlemskap: Erik saknar medlemskap och Hanna hör till båda kunderna.
insert into public.memberships (id, identity_id, customer_id) values
  ('40000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-0000000000a2'),
  ('40000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-0000000000a2'),
  ('40000000-0000-4000-8000-000000000007', '30000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-000000000008', '30000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-000000000009', '30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-0000000000a1'),
  ('40000000-0000-4000-8000-00000000000a', '30000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-0000000000a2'),
  ('40000000-0000-4000-8000-000000000010', '30000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-0000000000a1')
on conflict (identity_id, customer_id) do nothing;

-- Kundadministrativa och granskande uppdrag. Fridas tre rader provar dagens,
-- kommande och avslutad giltighet; Hanna provar byte mellan två kunder.
insert into public.access_assignments (
  id, membership_id, customer_id, function, valid_from, valid_to, ended_at
) values
  ('50000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-0000000000a1', 'kundadmin', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-0000000000a1', 'granskare', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-0000000000a1', 'granskare', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000004', '40000000-0000-4000-8000-000000000004', '20000000-0000-4000-8000-0000000000a2', 'granskare', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000005', '40000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-0000000000a2', 'kundadmin', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000007', '40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-0000000000a1', 'granskare', public.app_today() - 10, null, null),
  ('50000000-0000-4000-8000-000000000017', '40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-0000000000a1', 'kundadmin', public.app_today() + 30, null, null),
  ('50000000-0000-4000-8000-000000000027', '40000000-0000-4000-8000-000000000007', '20000000-0000-4000-8000-0000000000a1', 'granskare', public.app_today() - 400, public.app_today() - 1, (public.app_today() - 1)::timestamptz),
  ('50000000-0000-4000-8000-000000000008', '40000000-0000-4000-8000-000000000008', '20000000-0000-4000-8000-0000000000a1', 'granskare', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000009', '40000000-0000-4000-8000-000000000009', '20000000-0000-4000-8000-0000000000a1', 'granskare', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-00000000000a', '40000000-0000-4000-8000-00000000000a', '20000000-0000-4000-8000-0000000000a2', 'kundadmin', public.app_today() - 30, null, null),
  ('50000000-0000-4000-8000-000000000010', '40000000-0000-4000-8000-000000000010', '20000000-0000-4000-8000-0000000000a1', 'kundadmin', public.app_today() - 30, null, null)
on conflict (id) do nothing;

insert into public.organizers (id, organization_number, name, type, customer_id)
values (
  '60000000-0000-4000-8000-000000000001', '2120009999',
  'Provkommun A:s barn- och utbildningsnämnd', 'Kommun',
  '20000000-0000-4000-8000-0000000000a1'
)
on conflict (id) do nothing;

insert into public.school_units (
  id, organizer_id, code, name, municipality_code, municipality_name, status, locality
)
values (
  '60000000-0000-4000-8000-000000000101',
  '60000000-0000-4000-8000-000000000001',
  '99999904', 'Provskolan A', '0000', 'Exempelstad', 'Aktiv', 'Exempelstad'
)
on conflict (id) do nothing;
