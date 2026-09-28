-- 04-23: öppna Worker-körrätt för registrets ändring, källbeslut, personnummervisning
-- och export. Endast de auditerade Worker-routerna (/api/elever/andra, /personnummer,
-- /export) anropar dem; protectedRoute kräver MFA/same-origin och committar obligatorisk
-- logg i samma transaktion. Funktionerna prövar själva levande mandat, spärr, skydd,
-- D-20 och expectedVersion. Klientroller och PUBLIC förblir stängda; inga hjälpfunktioner,
-- tabeller, RLS-policys eller andra roller ändras. Tidigare migrationer skrivs inte om.
begin;
revoke all on function public.phase4_change_pupil(jsonb),
  public.phase4_resolve_source(jsonb),
  public.phase4_reveal_personal_number(jsonb),
  public.phase4_export_pupils(jsonb,boolean)
  from public,anon,authenticated;
grant execute on function public.phase4_change_pupil(jsonb),
  public.phase4_resolve_source(jsonb),
  public.phase4_reveal_personal_number(jsonb),
  public.phase4_export_pupils(jsonb,boolean)
  to skolplattform_worker;
commit;
