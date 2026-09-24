-- Synthetic retention only. No application role receives maintenance rights.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='skolplattform_audit_maintenance') then
    create role skolplattform_audit_maintenance nologin noinherit;
  end if;
end $$;
create table public.audit_retention_policy (
  customer_id uuid primary key references public.customers(id),
  profile_id text not null check(profile_id='synthetic-v1'),
  retention_days integer not null check(retention_days=30)
);
alter table public.audit_retention_policy enable row level security;
alter table public.audit_retention_policy force row level security;
revoke all on public.audit_retention_policy from public,anon,authenticated,skolplattform_worker,skolplattform_audit_maintenance;

-- The protected SECURITY DEFINER entry point runs as postgres. The trigger
-- rechecks the server cutoff itself; caller-controlled GUCs cannot enable deletion.
create or replace function public.security_events_immutable() returns trigger
language plpgsql security invoker set search_path=pg_catalog,public as $$
begin
  if TG_OP='DELETE' and current_user='postgres' and exists (
    select 1 from public.audit_retention_policy p where p.customer_id=old.customer_id
      and p.profile_id='synthetic-v1'
      and old.occurred_at < transaction_timestamp()-make_interval(days=>p.retention_days)
  ) then return old; end if;
  raise exception 'security_events är oföränderlig' using errcode='42501';
end $$;

create function public.purge_synthetic_audit(target_customer uuid) returns bigint
language plpgsql security definer set search_path=pg_catalog,public as $$
declare days integer; removed bigint;
begin
  select retention_days into days from public.audit_retention_policy
    where customer_id=target_customer and profile_id='synthetic-v1' for share;
  if not found then raise exception 'Retention is not configured' using errcode='42501'; end if;
  delete from public.security_events where customer_id=target_customer
    and occurred_at < transaction_timestamp()-make_interval(days=>days);
  get diagnostics removed = row_count;
  return removed;
end $$;
alter function public.purge_synthetic_audit(uuid) owner to postgres;
revoke all on function public.purge_synthetic_audit(uuid) from public,anon,authenticated,skolplattform_worker;
grant usage on schema public to skolplattform_audit_maintenance;
grant execute on function public.purge_synthetic_audit(uuid) to skolplattform_audit_maintenance;
-- No customers are configured automatically; no existing rows are removed.
