begin;
-- pgTAP access exists only inside this rolled-back verification transaction.
grant usage on schema extensions to skolplattform_audit_maintenance;
select plan(19);
insert into public.customers(id,name) values ('39000000-0000-4000-8000-000000000001','Syntetisk gallring A'),('39000000-0000-4000-8000-000000000002','Syntetisk gallring B');
insert into public.audit_retention_policy values ('39000000-0000-4000-8000-000000000001','synthetic-v1',30);
insert into public.security_events(correlation_id,customer_id,source,action,outcome,occurred_at)
select gen_random_uuid(),'39000000-0000-4000-8000-000000000001','db','retention-probe','ok',transaction_timestamp()-interval '30 days'+delta
from unnest(array[interval '-1 microsecond',interval '0',interval '1 microsecond']) delta;
insert into public.security_events(correlation_id,customer_id,source,action,outcome,occurred_at)
values(gen_random_uuid(),'39000000-0000-4000-8000-000000000002','db','retention-probe','ok',transaction_timestamp()-interval '31 days');
-- 04-15: registerhistorik och äldre fas 3-händelser ligger utanför gallringsvägen.
-- Endast syntetiska rader i rollback; inga elevvärden läses ut i testsvar.
insert into public.customers(id,name) values ('39000000-0000-4000-8000-000000000003','Syntetisk gallring C');
insert into public.audit_retention_policy values ('39000000-0000-4000-8000-000000000003','synthetic-v1',30);
insert into public.organizers(id,customer_id,name,type) values ('39000000-0000-4000-8000-000000000011','39000000-0000-4000-8000-000000000001','Syntetisk gallringshuvudman','Kommun');
insert into public.identities(id,issuer,subject) values ('39000000-0000-4000-8000-000000000021','https://phase3-audit.example.test','synthetic-1');
insert into public.memberships(id,identity_id,customer_id) values ('39000000-0000-4000-8000-000000000031','39000000-0000-4000-8000-000000000021','39000000-0000-4000-8000-000000000001');
insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
select '39000000-0000-4000-8000-000000000211','39000000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000011','Syntetisk gallringselev',n.personal_number,'Elev 1' from public.synthetic_pupil_numbers n order by n.personal_number limit 1;
insert into public.pupil_field_history(customer_id,organizer_id,pupil_id,field,source,actor_id,changed_at,revision)
values('39000000-0000-4000-8000-000000000001','39000000-0000-4000-8000-000000000011','39000000-0000-4000-8000-000000000211','displayName','manual','39000000-0000-4000-8000-000000000031',transaction_timestamp()-interval '400 days',1);
insert into public.security_events(correlation_id,customer_id,source,action,outcome,object_type,object_id,occurred_at)
values(gen_random_uuid(),'39000000-0000-4000-8000-000000000003','db','retention-probe','ok','phase3_probe_pupil','39000000-0000-4000-8000-000000000211',transaction_timestamp()-interval '1 day');
select ok(not has_table_privilege('skolplattform_worker','public.security_events','DELETE'),'Worker saknar DELETE');
select ok(not has_table_privilege('skolplattform_worker','public.security_events','UPDATE'),'Worker saknar UPDATE');
select ok(not has_function_privilege('skolplattform_worker','public.purge_synthetic_audit(uuid)','EXECUTE'),'Worker saknar gallringsfunktion');
select ok(not has_function_privilege('authenticated','public.purge_synthetic_audit(uuid)','EXECUTE'),'Klient saknar gallringsfunktion');
select ok(not has_table_privilege('skolplattform_audit_maintenance','public.security_events','DELETE'),'Underhåll saknar direkt DELETE');
select ok(not has_table_privilege('skolplattform_audit_maintenance','public.audit_retention_policy','UPDATE'),'Underhåll kan inte ändra retention');
select ok(not has_table_privilege('skolplattform_audit_maintenance','public.pupils','SELECT'),'Underhåll saknar läsning av elevregistret');
select ok(not has_table_privilege('skolplattform_audit_maintenance','public.pupil_field_history','SELECT,DELETE'),'Underhåll saknar läsning och radering av registerhistorik');
select ok(not has_function_privilege('skolplattform_audit_maintenance','public.phase4_list_pupils(jsonb)','EXECUTE'),'Underhåll saknar elevlistan');
set local role skolplattform_audit_maintenance;
select throws_ok($t$select public.purge_synthetic_audit('39000000-0000-4000-8000-000000000002')$t$,'42501',null,'okänd policy nekar');
select is(public.purge_synthetic_audit('39000000-0000-4000-8000-000000000001'),1::bigint,'endast raden före gränsen gallras');
select is(public.purge_synthetic_audit('39000000-0000-4000-8000-000000000001'),0::bigint,'upprepad gallring är idempotent');
select is(public.purge_synthetic_audit('39000000-0000-4000-8000-000000000003'),0::bigint,'äldre fas 3-händelse inom retention gallras inte');
reset role;
select is((select count(*) from public.security_events where customer_id='39000000-0000-4000-8000-000000000001'),2::bigint,'vid och efter gränsen bevaras');
select is((select count(*) from public.security_events where customer_id='39000000-0000-4000-8000-000000000002'),1::bigint,'annan kund bevaras');
select is((select count(*) from public.pupil_field_history where pupil_id='39000000-0000-4000-8000-000000000211'),1::bigint,'gallring av säkerhetslogg rör inte registerhistorik');
select is((select count(*) from public.security_events where customer_id='39000000-0000-4000-8000-000000000003' and object_type='phase3_probe_pupil' and object_id='39000000-0000-4000-8000-000000000211'),1::bigint,'äldre fas 3-händelse bevaras med oförändrad objekttyp');
select throws_ok($t$update public.security_events set action='tampered' where customer_id='39000000-0000-4000-8000-000000000001'$t$,'42501',null,'UPDATE förblir omöjlig');
select throws_ok($t$delete from public.security_events where customer_id='39000000-0000-4000-8000-000000000001'$t$,'42501',null,'nyare audit får inte raderas ens via direkt postgresväg');
select * from finish();
rollback;
