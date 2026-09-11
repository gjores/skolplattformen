-- Fas 1-karantän: stäng klientrollernas installerade rättigheter i appens schema.
--
-- Bakgrund (BASE-02, beslut D-09): arbetsversionen låter varje anonym session
-- få huvudmannaprofil via bootstrap_demo_profile, registry_snapshots släpper
-- in alla inloggade, och Storage-policyerna för bucket tillstand är
-- tillåtande. En demobadge i gränssnittet är ingen avskiljning. Den här
-- migrationen tar bort rättigheterna för PUBLIC, anon och authenticated på
-- tabeller, sekvenser, funktioner och schemat public, stänger
-- Storage-policyerna och sätter defaultprivilegier så att inte heller
-- framtida objekt blir nåbara. Karantänen gäller tills fas 2 öppnar
-- verifierad åtkomst genom uttryckliga, provade vägar.
--
-- Inga rader raderas, inga tabeller eller funktioner tas bort och auth.*
-- rörs inte: befintliga profiler, huvudmän och filer finns kvar men kan
-- inte nås av klientrollerna. service_role berörs inte (den används bara
-- för lokal etablering och städning utanför webbläsaren). Rollen postgres
-- (migrationsrollen) behåller allt.
--
-- Supabase CLI kör migrationen i en transaktion; inga egna begin/commit.

-- 1. Stäng installerade rättigheter för klientroller i appens schema.
revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke usage on schema public from public, anon, authenticated;
grant usage on schema public to service_role;   -- lokal etablering/städning utanför webbläsaren

-- 2. Framtida objekt skapade av migrationsrollen postgres. Supabase sätter
--    schemaspecifika defaultprivilegier för postgres som ger anon och
--    authenticated allt på nya tabeller, sekvenser och funktioner; de
--    återkallas här. Den globala raden tar bort PostgreSQL:s standard
--    (EXECUTE till PUBLIC på nya funktioner).
alter default privileges for role postgres in schema public revoke all privileges on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke all privileges on sequences from public, anon, authenticated;
alter default privileges for role postgres in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges for role postgres revoke execute on functions from public;

-- 3. Uttryckligt för de kända farliga vägarna (redundant med 1, men läsbart och provbart).
revoke execute on function public.bootstrap_demo_profile(text) from public, anon, authenticated;
revoke execute on function public.copy_offering_cohort(uuid, integer) from public, anon, authenticated;
revoke execute on function public.appoint_school_principal(uuid, uuid, text) from public, anon, authenticated;
revoke execute on function public.import_school_unit(jsonb, jsonb, uuid, text) from public, anon, authenticated;
revoke execute on function public.current_organizer_id() from public, anon, authenticated;
revoke execute on function public.current_app_role() from public, anon, authenticated;

-- 4. Storage: stäng appens tillåtande policyer; bucket förblir privat och filer bevaras.
drop policy if exists tillstand_read on storage.objects;
drop policy if exists tillstand_write on storage.objects;
drop policy if exists tillstand_delete on storage.objects;

-- 5. Provmarkör: gör det möjligt att verifiera att karantänen är installerad.
comment on schema public is 'fas1-karantan: klientroller saknar rättigheter tills fas 2 öppnar verifierad åtkomst';
