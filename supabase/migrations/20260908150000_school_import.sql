alter table public.school_units add column address jsonb;

-- The organizer appoints the principal. Registry head_master remains source information.
create or replace function public.appoint_school_principal(school_id uuid, principal_id uuid default null, principal_name text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare org_id uuid; chosen uuid;
begin
  if public.current_app_role() is distinct from 'huvudman' then raise exception 'Bara huvudmannen utser rektor.'; end if;
  select organizer_id into org_id from public.school_units where id=school_id and organizer_id=public.current_organizer_id() for update;
  if not found then raise exception 'Skolenheten finns inte.'; end if;
  if principal_id is not null then
    select id into chosen from public.assignments where id=principal_id and organizer_id=org_id and role='rektor';
    if not found then raise exception 'Välj en rektor hos huvudmannen.'; end if;
  elsif nullif(btrim(principal_name),'') is not null then
    if length(btrim(principal_name))>120 then raise exception 'Rektorns namn är för långt.'; end if;
    insert into public.assignments(organizer_id,name,role) values(org_id,btrim(principal_name),'rektor') returning id into chosen;
  else raise exception 'Välj rektor eller ange ett namn.';
  end if;
  delete from public.assignment_units au using public.assignments a where au.assignment_id=a.id and a.role='rektor' and au.unit_id=school_id;
  insert into public.assignment_units(assignment_id,unit_id) values(chosen,school_id);
  insert into public.organisation_events(organizer_id,actor,actor_role,action,comment)
    values(org_id,auth.uid(),'huvudman','Rektor utsedd',(select name from public.assignments where id=chosen)||' vid '||(select name from public.school_units where id=school_id));
  return chosen;
end $$;
revoke all on function public.appoint_school_principal(uuid,uuid,text) from public,anon;
grant execute on function public.appoint_school_principal(uuid,uuid,text) to authenticated;

create or replace function public.import_school_unit(unit_data jsonb, registry_payload jsonb, principal_id uuid default null, principal_name text default null)
returns uuid language plpgsql security invoker set search_path=public as $$
declare new_id uuid; org_id uuid; item jsonb;
begin
  if public.current_app_role() is distinct from 'huvudman' then raise exception 'Bara huvudmannen lägger till skolenheter.'; end if;
  org_id:=public.current_organizer_id();
  insert into public.school_units(organizer_id,code,name,municipality_code,municipality_name,status,head_master,locality,address,source_name,source_url,source_fetched,source_modified,pupil_register_source)
  values(org_id,unit_data->>'code',unit_data->>'name',unit_data->'municipality'->>'code',unit_data->'municipality'->>'name',unit_data->>'status',unit_data->>'headMaster',unit_data->>'locality',unit_data->'address',unit_data->'source'->>'name',unit_data->'source'->>'url',nullif(unit_data->'source'->>'fetched','')::date,nullif(unit_data->'source'->>'modified','')::timestamptz,unit_data->'pupilRegister'->>'source') returning id into new_id;
  for item in select value from jsonb_array_elements(unit_data->'schoolTypes') loop
    insert into public.school_unit_types(unit_id,school_type,grades,programmes)
      values(new_id,item->>'code',case when item ? 'grades' then array(select jsonb_array_elements_text(item->'grades')::smallint) else null end,array(select jsonb_array_elements_text(coalesce(item->'programmes','[]'::jsonb))));
  end loop;
  if principal_id is not null or nullif(btrim(principal_name),'') is not null then
    perform public.appoint_school_principal(new_id,principal_id,principal_name);
  end if;
  insert into public.registry_snapshots(unit_code,fetched_by,source_url,payload)
    values(unit_data->>'code',auth.uid(),unit_data->'source'->>'url',registry_payload);
  insert into public.organisation_events(organizer_id,actor,actor_role,action,comment)
    values(org_id,auth.uid(),'huvudman','Skolenhet tillagd',unit_data->>'name');
  return new_id;
end $$;
revoke all on function public.import_school_unit(jsonb,jsonb,uuid,text) from public,anon;
grant execute on function public.import_school_unit(jsonb,jsonb,uuid,text) to authenticated;
