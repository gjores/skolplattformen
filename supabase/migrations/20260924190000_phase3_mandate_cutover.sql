-- Samordnad cutover EFTER att servervägar använder de kontrollerade funktionerna.
-- Elevläsfunktionen får INTE Worker-GRANT före obligatorisk audit i plan04/05.
create or replace function public.assignment_is_valid(a public.access_assignments)
returns boolean language sql volatile security definer set search_path=pg_catalog,public as $$
  select public.phase3_mandate_is_valid(a.id)
$$;
revoke insert,update,delete on public.access_assignments,public.invitations,
  public.assignments,public.assignment_units from skolplattform_worker;
revoke all on function public.appoint_school_principal(uuid,uuid,text) from skolplattform_worker;
drop policy if exists access_assignments_write on public.access_assignments;
drop policy if exists access_assignments_update on public.access_assignments;
drop policy if exists invitations_customer on public.invitations;
create policy invitations_read on public.invitations for select to skolplattform_worker
using(customer_id=public.current_customer_id() or public.current_phase()='login');
alter table public.access_assignments force row level security;
alter table public.invitations force row level security;
grant execute on function public.phase3_lock_customer(uuid),public.phase3_mandate_context(),
  public.phase3_list_mandates(),public.phase3_grant_mandate(jsonb),public.phase3_revoke_mandate(uuid),
  public.phase3_issue_invitation(jsonb),public.phase3_redeem_invitation(bytea,uuid),
  public.phase3_connection(uuid,text,boolean,integer),public.assignment_is_valid(public.access_assignments)
to skolplattform_worker;
