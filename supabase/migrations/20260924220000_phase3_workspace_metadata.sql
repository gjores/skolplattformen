-- Presentation metadata only for already-administrable mandates and IT schools.
create or replace function public.phase3_list_mandates() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
  a:=public.phase3_actor();
  select coalesce(jsonb_agg(public.phase3_assignment_document(t.id)||jsonb_build_object(
    'displayName',coalesce(nullif(i.display_name,''),'Namngiven personal'),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id)
      from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=t.id),'[]'::jsonb),
    'status',case when t.valid_from > (clock_timestamp() at time zone 'Europe/Stockholm')::date
      or t.starts_at > clock_timestamp() then 'kommande' else 'giltigt' end,
    'approverName',case when t.approved_by_assignment_id=a.id then
      (select pi.display_name from public.memberships pm join public.identities pi on pi.id=pm.identity_id where pm.id=a.membership_id) else null end
  ) order by i.display_name,t.id),'[]') into result
  from public.access_assignments t join public.memberships m on m.id=t.membership_id
  join public.identities i on i.id=m.identity_id
  where t.parent_assignment_id=a.id and public.phase3_mandate_is_valid(t.id,false);
  return result;
end $$;
create function public.phase3_connection_schools() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
  a:=public.phase3_actor();
  if a.function<>'it' then raise exception 'IT mandate required' using errcode='42501'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id),'[]') into result
    from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=a.id;
  return result;
end $$;
revoke all on function public.phase3_connection_schools() from public,anon,authenticated;
grant execute on function public.phase3_connection_schools() to skolplattform_worker;
