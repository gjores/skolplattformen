-- 03-05: mandatlistan visar endast giltiga och kommande uppdrag.
-- Tidigare version (20260924220000) prövade kedjan utan tidskontroll och visade
-- därför utgångna men inte avslutade uppdrag (t.ex. support efter sluttid) som
-- "giltigt". Utgångna uppdrag ger ingen åtkomst och ska inte erbjudas för avslut.
create or replace function public.phase3_list_mandates() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
  today date:=(clock_timestamp() at time zone 'Europe/Stockholm')::date;
begin
  a:=public.phase3_actor();
  select coalesce(jsonb_agg(public.phase3_assignment_document(t.id)||jsonb_build_object(
    'displayName',coalesce(nullif(i.display_name,''),'Namngiven personal'),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id)
      from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=t.id),'[]'::jsonb),
    'status',case when t.valid_from > today or t.starts_at > clock_timestamp() then 'kommande' else 'giltigt' end,
    'approverName',case when t.approved_by_assignment_id=a.id then
      (select pi.display_name from public.memberships pm join public.identities pi on pi.id=pm.identity_id where pm.id=a.membership_id) else null end
  ) order by i.display_name,t.id),'[]') into result
  from public.access_assignments t join public.memberships m on m.id=t.membership_id
  join public.identities i on i.id=m.identity_id
  where t.parent_assignment_id=a.id and public.phase3_mandate_is_valid(t.id,false)
    and (t.valid_to is null or t.valid_to >= today)
    and (t.ends_at is null or t.ends_at > clock_timestamp());
  return result;
end $$;
