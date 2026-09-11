-- Principals may assign/remove teachers within their organizer. They cannot
-- alter a principal's assignment or link to another organizer's school/staff.
-- The existing headman administration policy remains for school setup/deletion
-- and the shared demo login; the app's headman view is read-only for teachers.
create policy assignment_units_principal_insert on public.assignment_units
for insert to authenticated with check (
  public.current_app_role() = 'rektor'
  and exists(select 1 from public.assignments a where a.id=assignment_id and a.role='larare' and a.organizer_id=public.current_organizer_id())
  and exists(select 1 from public.school_units u where u.id=unit_id and u.organizer_id=public.current_organizer_id())
);
create policy assignment_units_principal_delete on public.assignment_units
for delete to authenticated using (
  public.current_app_role() = 'rektor'
  and exists(select 1 from public.assignments a where a.id=assignment_id and a.role='larare' and a.organizer_id=public.current_organizer_id())
  and exists(select 1 from public.school_units u where u.id=unit_id and u.organizer_id=public.current_organizer_id())
);
