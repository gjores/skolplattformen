begin;
-- pgTAP access exists only inside this rolled-back verification transaction.
grant usage on schema extensions to skolplattform_audit_maintenance;
select plan(13);
insert into public.customers(id,name) values ('39000000-0000-4000-8000-000000000001','Syntetisk gallring A'),('39000000-0000-4000-8000-000000000002','Syntetisk gallring B');
insert into public.audit_retention_policy values ('39000000-0000-4000-8000-000000000001','synthetic-v1',30);
insert into public.security_events(correlation_id,customer_id,source,action,outcome,occurred_at)
select gen_random_uuid(),'39000000-0000-4000-8000-000000000001','db','retention-probe','ok',transaction_timestamp()-interval '30 days'+delta
from unnest(array[interval '-1 microsecond',interval '0',interval '1 microsecond']) delta;
insert into public.security_events(correlation_id,customer_id,source,action,outcome,occurred_at)
values(gen_random_uuid(),'39000000-0000-4000-8000-000000000002','db','retention-probe','ok',transaction_timestamp()-interval '31 days');
select ok(not has_table_privilege('skolplattform_worker','public.security_events','DELETE'),'Worker saknar DELETE');
select ok(not has_table_privilege('skolplattform_worker','public.security_events','UPDATE'),'Worker saknar UPDATE');
select ok(not has_function_privilege('skolplattform_worker','public.purge_synthetic_audit(uuid)','EXECUTE'),'Worker saknar gallringsfunktion');
select ok(not has_function_privilege('authenticated','public.purge_synthetic_audit(uuid)','EXECUTE'),'Klient saknar gallringsfunktion');
select ok(not has_table_privilege('skolplattform_audit_maintenance','public.security_events','DELETE'),'Underhåll saknar direkt DELETE');
select ok(not has_table_privilege('skolplattform_audit_maintenance','public.audit_retention_policy','UPDATE'),'Underhåll kan inte ändra retention');
set local role skolplattform_audit_maintenance;
select throws_ok($t$select public.purge_synthetic_audit('39000000-0000-4000-8000-000000000002')$t$,'42501',null,'okänd policy nekar');
select is(public.purge_synthetic_audit('39000000-0000-4000-8000-000000000001'),1::bigint,'endast raden före gränsen gallras');
select is(public.purge_synthetic_audit('39000000-0000-4000-8000-000000000001'),0::bigint,'upprepad gallring är idempotent');
reset role;
select is((select count(*) from public.security_events where customer_id='39000000-0000-4000-8000-000000000001'),2::bigint,'vid och efter gränsen bevaras');
select is((select count(*) from public.security_events where customer_id='39000000-0000-4000-8000-000000000002'),1::bigint,'annan kund bevaras');
select throws_ok($t$update public.security_events set action='tampered' where customer_id='39000000-0000-4000-8000-000000000001'$t$,'42501',null,'UPDATE förblir omöjlig');
select throws_ok($t$delete from public.security_events where customer_id='39000000-0000-4000-8000-000000000001'$t$,'42501',null,'nyare audit får inte raderas ens via direkt postgresväg');
select * from finish();
rollback;
