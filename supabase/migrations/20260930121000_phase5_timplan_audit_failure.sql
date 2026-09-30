-- 05-04: framåträttning efter granskning av tillämpad 120000.
-- Normalisera endast fel i obligatorisk DB-loggskrivning, inga grants ändras.
create or replace function public.phase5_timplan_audit(plan_id uuid, operation text)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare a public.access_assignments; i public.identities; corr uuid; session_id uuid;
begin
 if operation not in ('timplan_read','timplan_cell_changed') or operation is null then
  raise exception 'Invalid planning operation' using errcode='22023'; end if;
 a:=public.phase3_actor();
 select * into i from public.identities where id=public.current_identity_id();
 corr:=nullif(current_setting('app.correlation_id',true),'')::uuid;
 session_id:=nullif(current_setting('app.session_id',true),'')::uuid;
 if corr is null or (session_id is null and
   (session_user='skolplattform_worker' or current_setting('role',true)='skolplattform_worker')) then
  raise exception 'Planning audit unavailable' using errcode='55000'; end if;
 -- Privilegierade syntetiska SQL-fixturer får vara utan session. Varje Worker-
 -- anrop måste ha faktisk, aktiv session som matchar identitet och mandat.
 if session_id is not null and not exists(select 1 from public.app_sessions s
  where s.id=session_id and s.identity_id=i.id and s.membership_id=a.membership_id
   and s.assignment_id=a.id and s.revoked_at is null
   and s.expires_at>clock_timestamp() and s.absolute_expires_at>clock_timestamp()) then
  raise exception 'Planning audit unavailable' using errcode='55000'; end if;
 begin
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,
 session_id,membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(corr,'db',i.id,i.issuer,i.subject,session_id,a.membership_id,a.id,a.customer_id,
 operation,'timplan',plan_id,'ok','{}');
 exception when others then
  raise exception 'Planning audit unavailable' using errcode='55000';
 end;
end $$;
revoke all on function public.phase5_timplan_audit(uuid,text) from public,anon,authenticated,skolplattform_worker;
