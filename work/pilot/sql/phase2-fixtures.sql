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

-- Uppdrag (access_assignments) läggs till i denna fil av plan 02-04.
