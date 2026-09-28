-- 04-11: narrow entrypoints opened only with the HM-only, MFA/origin protected
-- Worker route. protectedRoute commits the permission mutation and audit together.
-- Internal helpers and tables remain closed; 04-03 is never rewritten.
begin;
grant execute on function public.phase4_list_protected_permissions(),
  public.phase4_grant_protected_permission(uuid,uuid),
  public.phase4_revoke_protected_permission(uuid)
  to skolplattform_worker;
commit;
