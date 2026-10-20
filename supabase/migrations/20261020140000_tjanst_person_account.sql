-- Fas 05.1-07: Personal visar Kopplat till ett konto / Inget konto (UI-SPEC skärm 8).
-- Bara huvudmannens läsning (utan skola) får fältet account: finns en aktiv bindning mellan personen och ett medlemskap.
-- Rektors läsning per skola är oförändrad (D-11). Inga kontouppgifter, e-post eller medlemskaps-ID lämnas ut.
-- SS 12000: kontot är en intern åtkomstuppgift och ingår inte i Person; Personal-ID och externt ID är oförändrade.

create or replace function public.tjanst_person_json(p public.staff_people,unit uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select jsonb_build_object('id',p.id,'givenName',p.given_name,'familyName',p.family_name,'externalId',p.external_id,'externalIdSource',p.external_id_source,
  'status',p.status,'proposedForUnitId',case when unit is null or p.proposed_for_unit_id=unit then p.proposed_for_unit_id end,
  'draftNote',case when unit is null or p.proposed_for_unit_id=unit then p.draft_note end,'revision',p.revision,
  'employments',case when unit is null then coalesce((select jsonb_agg(jsonb_build_object('id',e.id,'percent',e.percent,'startsOn',e.starts_on,'endsOn',e.ends_on,
    'duties',coalesce((select jsonb_agg(public.tjanst_duty_json(d) order by d.starts_on,d.id) from public.staff_school_duties d where d.employment_id=e.id),'[]'::jsonb))
    order by e.starts_on,e.id) from public.staff_employments e where e.staff_person_id=p.id),'[]'::jsonb) else '[]'::jsonb end,
  'duties',coalesce((select jsonb_agg(public.tjanst_duty_json(d) order by d.starts_on,d.id) from public.staff_school_duties d
    where d.staff_person_id=p.id and (unit is null or d.unit_id=unit)),'[]'::jsonb))
 || case when unit is null then jsonb_build_object('account',exists(select 1 from public.staff_person_bindings b
    where b.staff_person_id=p.id and b.customer_id=p.customer_id and b.organizer_id=p.organizer_id and b.ended_at is null)) else '{}'::jsonb end
$$;
