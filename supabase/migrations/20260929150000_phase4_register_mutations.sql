-- Atomic register mutations. Worker ACL stays closed until the audited write API.
begin;
create function public.phase4_mutation_date(value jsonb,nullable boolean default false) returns date
language plpgsql immutable set search_path=pg_catalog as $$
declare d date;
begin
 if nullable and value='null'::jsonb then return null; end if;
 if jsonb_typeof(value) is distinct from 'string' or (value#>>'{}')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then raise exception 'Invalid date' using errcode='22023'; end if;
 begin d:=(value#>>'{}')::date; exception when datetime_field_overflow or invalid_datetime_format then raise exception 'Invalid date' using errcode='22023'; end;
 if not isfinite(d) or extract(year from d) not between 1 and 9999 then raise exception 'Invalid date' using errcode='22023'; end if;
 return d;
end$$;
create function public.phase4_placement_value(p public.pupil_placements) returns jsonb
language sql immutable set search_path=pg_catalog as $$select jsonb_build_object('id',p.id,'unitId',p.unit_id,'educationId',p.offering_id,'startsOn',p.starts_on,'endsOn',p.ends_on)$$;
create function public.phase4_class_value(p public.pupil_class_memberships) returns jsonb
language sql immutable set search_path=pg_catalog as $$select jsonb_build_object('id',p.id,'placementId',p.placement_id,'unitId',p.unit_id,'classId',p.class_id,'startsOn',p.starts_on,'endsOn',p.ends_on)$$;
create function public.phase4_municipality_value(p public.pupil_home_municipalities) returns jsonb
language sql immutable set search_path=pg_catalog as $$select jsonb_build_object('id',p.id,'municipalityCode',p.municipality_code,'startsOn',p.starts_on,'endsOn',p.ends_on)$$;
create function public.phase4_record_change(p public.pupils,a public.access_assignments,field_name text,old_value jsonb,new_value jsonb,revision_number integer) returns void
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare origin public.pupil_field_state; changed timestamptz:=clock_timestamp();
begin
 select * into origin from public.pupil_field_state where pupil_id=p.id and field=field_name;
 if found and origin.source<>'manual' and not origin.local_correction then raise exception 'Source owns field' using errcode='42501'; end if;
 insert into public.pupil_field_history(customer_id,organizer_id,pupil_id,field,source,actor_id,changed_at,before_value,after_value,revision)
 values(p.customer_id,p.organizer_id,p.id,field_name,'manual',a.membership_id,changed,old_value,new_value,revision_number);
 insert into public.pupil_field_state(customer_id,organizer_id,pupil_id,field,source,actor_id,changed_at,local_correction,revision)
 values(p.customer_id,p.organizer_id,p.id,field_name,coalesce(origin.source,'manual'),a.membership_id,changed,coalesce(origin.local_correction,false),revision_number)
 on conflict(pupil_id,field) do update set actor_id=excluded.actor_id,changed_at=excluded.changed_at,revision=excluded.revision;
end$$;
create function public.phase4_mutation_conflict(p public.pupils,details jsonb) returns jsonb
language sql stable security invoker set search_path=pg_catalog,public as $$
 select jsonb_build_object('kind','conflict','details',jsonb_build_object('currentVersion',p.version,
 'changedBy',coalesce(h.actor_id::text,nullif(current_setting('app.membership_id',true),'')),
 'changedAt',coalesce(h.changed_at,p.updated_at))||details,
 'auditRefs',case when p.protected_identity then jsonb_build_array(jsonb_build_object('kind','protected','pupilId',p.id)) else '[]'::jsonb end)
 from (select 1) seed left join lateral (
  select actor_id,changed_at from public.pupil_field_history h where h.pupil_id=p.id
   and case details->>'kind'
    when 'fields' then h.field in (select value->>'field' from jsonb_array_elements(details->'fields'))
    when 'identity' then h.field='personalNumber'
    else true end
  order by h.revision desc,h.changed_at desc limit 1
 )h on true
$$;
create function public.phase4_change_pupil(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; p public.pupils; pl public.pupil_placements; next_pl public.pupil_placements;
 cm public.pupil_class_memberships; old_cm public.pupil_class_memberships; hm public.pupil_home_municipalities; old_hm public.pupil_home_municipalities;
 payload jsonb; operation text; keys text[]; touched text[]; f text; expected integer; next_version integer;
 starts date; ends date; target_unit uuid; target_education uuid; target_class uuid; old_value jsonb;
 conflict_fields jsonb:='[]'; period_kind text; warnings jsonb:='[]'; current_value jsonb;
begin
 a:=public.phase3_actor();
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId','expectedVersion','kind','payload']);
 if a.function<>'administrator' or a.scope_kind<>'school' then raise exception 'Mutation denied' using errcode='42501'; end if;
 if request->'caseId'<>'null'::jsonb or jsonb_typeof(request->'schoolYear') is distinct from 'number' or (request->>'schoolYear')!~'^[0-9]+$' or (request->>'schoolYear')::numeric not between 1 and 9998
 or jsonb_typeof(request->'expectedVersion') is distinct from 'number' or (request->>'expectedVersion')!~'^[0-9]+$' or (request->>'expectedVersion')::numeric not between 1 and 2147483646
 or jsonb_typeof(request->'kind') is distinct from 'string' or jsonb_typeof(request->'payload') is distinct from 'object' then raise exception 'Invalid mutation' using errcode='22023'; end if;
 select * into p from public.pupils where id=(request->>'pupilId')::uuid and customer_id=a.customer_id and organizer_id=a.organizer_id for update;
 if not found or not exists(select 1 from public.pupil_placements pp join public.mandate_units u on u.unit_id=pp.unit_id and u.assignment_id=a.id where pp.pupil_id=p.id and (pp.ends_on is null or pp.ends_on>=public.app_today()) and (not p.protected_identity or public.phase4_has_protected_permission(a.id,pp.unit_id))) then raise exception 'Pupil not found' using errcode='P0002'; end if;
 expected:=(request->>'expectedVersion')::integer; operation:=request->>'kind'; payload:=request->'payload';
 case operation
 when 'basics' then
  keys:=array(select jsonb_object_keys(payload));
  if cardinality(keys)=0 or exists(select 1 from unnest(keys)k where k not in ('displayName','personalNumber','protectedIdentity')) then raise exception 'Invalid basics' using errcode='22023'; end if;
  if payload?'displayName' and (jsonb_typeof(payload->'displayName') is distinct from 'string' or length(payload->>'displayName') not between 1 and 240 or payload->>'displayName'<>btrim(payload->>'displayName')) then raise exception 'Invalid name' using errcode='22023'; end if;
  if payload?'personalNumber' and (jsonb_typeof(payload->'personalNumber') is distinct from 'string' or not exists(select 1 from public.synthetic_pupil_numbers where personal_number=payload->>'personalNumber')) then raise exception 'Invalid synthetic number' using errcode='22023'; end if;
  if payload?'protectedIdentity' and jsonb_typeof(payload->'protectedIdentity') is distinct from 'boolean' then raise exception 'Invalid protection' using errcode='22023'; end if;
  if payload->'protectedIdentity'='true'::jsonb and not exists(select 1 from public.pupil_placements pp join public.mandate_units u on u.unit_id=pp.unit_id and u.assignment_id=a.id where pp.pupil_id=p.id and (pp.ends_on is null or pp.ends_on>=public.app_today()) and public.phase4_has_protected_permission(a.id,pp.unit_id)) then raise exception 'Mutation denied' using errcode='42501'; end if;
  touched:=keys;
 when 'municipality' then
  perform public.phase4_keys(payload,array['municipalityCode','startsOn','endsOn']); touched:=array['municipality']; period_kind:='municipality';
  if jsonb_typeof(payload->'municipalityCode') is distinct from 'string' or not exists(select 1 from public.municipalities where code=payload->>'municipalityCode') then raise exception 'Invalid municipality' using errcode='22023'; end if;
 when 'transfer' then perform public.phase4_keys(payload,array['placementId','unitId','educationId','startsOn','endsOn']); touched:=array['placement','education','class']; period_kind:='placement';
 when 'education' then perform public.phase4_keys(payload,array['placementId','educationId','startsOn']); touched:=array['placement','education','class']; period_kind:='placement';
 when 'end-placement' then perform public.phase4_keys(payload,array['placementId','endsOn']); touched:=array['placement','class']; period_kind:='placement';
 when 'class' then perform public.phase4_keys(payload,array['placementId','classId','startsOn','endsOn']); touched:=array['class']; period_kind:='class';
 else raise exception 'Invalid mutation kind' using errcode='22023'; end case;
 if operation<>'basics' then
  if payload?'startsOn' then starts:=public.phase4_mutation_date(payload->'startsOn'); end if;
  if payload?'endsOn' then ends:=public.phase4_mutation_date(payload->'endsOn',operation<>'end-placement'); end if;
  if starts is not null and ends is not null and ends<starts then raise exception 'Invalid period' using errcode='22023'; end if;
 end if;
 if operation in ('transfer','education','end-placement','class') then
  select * into pl from public.pupil_placements where id=(payload->>'placementId')::uuid and pupil_id=p.id;
  if not found or not exists(select 1 from public.mandate_units where assignment_id=a.id and unit_id=pl.unit_id) or (p.protected_identity and not public.phase4_has_protected_permission(a.id,pl.unit_id)) then raise exception 'Pupil not found' using errcode='P0002'; end if;
  if operation in ('transfer','education') then
   target_unit:=case when operation='transfer' then (payload->>'unitId')::uuid else pl.unit_id end;
   target_education:=(payload->>'educationId')::uuid;
   if not exists(select 1 from public.mandate_units where assignment_id=a.id and unit_id=target_unit) or (p.protected_identity and not public.phase4_has_protected_permission(a.id,target_unit)) then raise exception 'Mutation denied' using errcode='42501'; end if;
   if not exists(select 1 from public.offerings where id=target_education and unit_id=target_unit and organizer_id=p.organizer_id) then raise exception 'Invalid education' using errcode='22023'; end if;
   if operation='education' then ends:=pl.ends_on; end if;
  elsif operation='class' then
   target_class:=(payload->>'classId')::uuid;
   if not exists(select 1 from public.school_classes where id=target_class and unit_id=pl.unit_id and customer_id=p.customer_id) then raise exception 'Invalid class' using errcode='22023'; end if;
  end if;
 end if;
 -- A stale independent basic field can merge; date relations must be reread.
 if expected>p.version then raise exception 'Invalid version' using errcode='22023'; end if;
 if expected<p.version and (operation<>'basics' or exists(select 1 from public.pupil_field_state where pupil_id=p.id and field=any(touched) and revision>expected)) then
  if operation<>'basics' then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period',period_kind,'reason','overlap')); end if;
  if payload?'personalNumber' and exists(select 1 from public.pupil_field_state where pupil_id=p.id and field='personalNumber' and revision>expected) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','identity','field','personalNumber')); end if;
  foreach f in array keys loop
   if exists(select 1 from public.pupil_field_state where pupil_id=p.id and field=f and revision>expected) then
    current_value:=case f when 'displayName' then to_jsonb(p.display_name) when 'protectedIdentity' then to_jsonb(p.protected_identity) else 'null'::jsonb end;
    conflict_fields:=conflict_fields||jsonb_build_array(jsonb_build_object('field',f,'submitted',payload->f,'current',current_value));
   end if;
  end loop;
  return public.phase4_mutation_conflict(p,jsonb_build_object('kind','fields','fields',conflict_fields));
 end if;
 if exists(select 1 from public.pupil_field_state where pupil_id=p.id and field=any(touched) and source<>'manual' and not local_correction) then raise exception 'Source owns field' using errcode='42501'; end if;
 -- All conflict checks happen before the first write.
 if operation in ('transfer','education') then
  if starts<=pl.starts_on or (pl.ends_on is not null and starts>pl.ends_on) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period','placement','reason','outside-placement')); end if;
  if exists(select 1 from public.pupil_placements where pupil_id=p.id and id<>pl.id and daterange(starts_on,ends_on,'[]')&&daterange(starts,ends,'[]')) or (operation='transfer' and exists(select 1 from public.pupil_class_memberships where placement_id=pl.id and starts_on>=starts)) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period','placement','reason','overlap')); end if;
 elsif operation='end-placement' then
  if ends<pl.starts_on or (pl.ends_on is not null and ends>pl.ends_on) or exists(select 1 from public.pupil_class_memberships where placement_id=pl.id and starts_on>ends) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period','placement','reason','outside-placement')); end if;
 elsif operation='class' then
  if starts<pl.starts_on or (pl.ends_on is not null and (ends is null or ends>pl.ends_on)) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period','class','reason','outside-placement')); end if;
  select * into cm from public.pupil_class_memberships where pupil_id=p.id and starts_on<starts and (ends_on is null or ends_on>=starts);
  if exists(select 1 from public.pupil_class_memberships where pupil_id=p.id and id is distinct from cm.id and daterange(starts_on,ends_on,'[]')&&daterange(starts,ends,'[]')) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period','class','reason','overlap')); end if;
 elsif operation='municipality' then
  select * into hm from public.pupil_home_municipalities where pupil_id=p.id and starts_on<starts and (ends_on is null or ends_on>=starts);
  if exists(select 1 from public.pupil_home_municipalities where pupil_id=p.id and id is distinct from hm.id and daterange(starts_on,ends_on,'[]')&&daterange(starts,ends,'[]')) then return public.phase4_mutation_conflict(p,jsonb_build_object('kind','period','period','municipality','reason','overlap')); end if;
 end if;
 next_version:=p.version+1;
 if operation='basics' then
  foreach f in array keys loop
   old_value:=case f when 'displayName' then to_jsonb(p.display_name) when 'personalNumber' then to_jsonb(p.personal_number) else to_jsonb(p.protected_identity) end;
   perform public.phase4_record_change(p,a,f,old_value,payload->f,next_version);
  end loop;
  update public.pupils set display_name=coalesce(payload->>'displayName',display_name),personal_number=coalesce(payload->>'personalNumber',personal_number),protected_identity=coalesce((payload->>'protectedIdentity')::boolean,protected_identity) where id=p.id;
 elsif operation='municipality' then
  old_hm:=hm;
  if hm.id is not null then
   update public.pupil_home_municipalities set ends_on=starts-1 where id=hm.id returning * into hm;
   perform public.phase4_record_change(p,a,'municipality',public.phase4_municipality_value(old_hm),public.phase4_municipality_value(hm),next_version);
  end if;
  insert into public.pupil_home_municipalities(customer_id,organizer_id,pupil_id,municipality_code,starts_on,ends_on) values(p.customer_id,p.organizer_id,p.id,payload->>'municipalityCode',starts,ends) returning * into hm;
  perform public.phase4_record_change(p,a,'municipality',null,public.phase4_municipality_value(hm),next_version);
 elsif operation='class' then
  old_cm:=cm;
  if cm.id is not null then
   update public.pupil_class_memberships set ends_on=starts-1 where id=cm.id returning * into cm;
   perform public.phase4_record_change(p,a,'class',public.phase4_class_value(old_cm),public.phase4_class_value(cm),next_version);
  end if;
  insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on) values(p.customer_id,p.organizer_id,p.id,pl.unit_id,target_class,pl.id,starts,ends) returning * into cm;
  perform public.phase4_record_change(p,a,'class',null,public.phase4_class_value(cm),next_version);
  if (select offering_id from public.school_classes where id=target_class)<>pl.offering_id then warnings:='["class-education-mismatch"]'; end if;
 elsif operation in ('transfer','education') then
  update public.pupil_placements set ends_on=starts-1 where id=pl.id returning * into next_pl;
  perform public.phase4_record_change(p,a,'placement',public.phase4_placement_value(pl),public.phase4_placement_value(next_pl),next_version);
  insert into public.pupil_placements(customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on) values(p.customer_id,p.organizer_id,p.id,target_unit,target_education,starts,ends) returning * into next_pl;
  perform public.phase4_record_change(p,a,'placement',null,public.phase4_placement_value(next_pl),next_version);
  perform public.phase4_record_change(p,a,'education',public.phase4_placement_value(pl),public.phase4_placement_value(next_pl),next_version);
  for cm in select * from public.pupil_class_memberships where placement_id=pl.id and (ends_on is null or ends_on>=starts) order by starts_on loop
   old_cm:=cm;
   if cm.starts_on<starts then
    update public.pupil_class_memberships set ends_on=starts-1 where id=cm.id returning * into cm;
    perform public.phase4_record_change(p,a,'class',public.phase4_class_value(old_cm),public.phase4_class_value(cm),next_version);
    if operation='education' then
     insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on) values(p.customer_id,p.organizer_id,p.id,pl.unit_id,old_cm.class_id,next_pl.id,starts,old_cm.ends_on) returning * into cm;
     perform public.phase4_record_change(p,a,'class',null,public.phase4_class_value(cm),next_version);
    end if;
   else
    update public.pupil_class_memberships set placement_id=next_pl.id where id=cm.id returning * into cm;
    perform public.phase4_record_change(p,a,'class',public.phase4_class_value(old_cm),public.phase4_class_value(cm),next_version);
   end if;
  end loop;
  if operation='education' and exists(select 1 from public.pupil_class_memberships c join public.school_classes sc on sc.id=c.class_id where c.placement_id=next_pl.id and sc.offering_id<>target_education) then warnings:='["class-education-mismatch"]'; end if;
 elsif operation='end-placement' then
  update public.pupil_placements set ends_on=ends where id=pl.id returning * into next_pl;
  perform public.phase4_record_change(p,a,'placement',public.phase4_placement_value(pl),public.phase4_placement_value(next_pl),next_version);
  for cm in select * from public.pupil_class_memberships where placement_id=pl.id and (ends_on is null or ends_on>ends) loop
   old_cm:=cm; update public.pupil_class_memberships set ends_on=ends where id=cm.id returning * into cm;
   perform public.phase4_record_change(p,a,'class',public.phase4_class_value(old_cm),public.phase4_class_value(cm),next_version);
  end loop;
 end if;
 update public.pupils set version=next_version,updated_at=clock_timestamp() where id=p.id;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupilId',p.id,'version',next_version,'warnings',warnings),'auditRefs','[]'::jsonb);
exception when unique_violation or foreign_key_violation or exclusion_violation or check_violation or not_null_violation or invalid_text_representation then
 raise exception 'Invalid register change' using errcode='22023';
end$$;
create function public.phase4_change_basics(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.phase3_actor();
 if request->>'kind' is distinct from 'basics' then raise exception 'Invalid mutation kind' using errcode='22023'; end if;
 return public.phase4_change_pupil(request);
end$$;
create function public.phase4_change_municipality(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.phase3_actor();
 if request->>'kind' is distinct from 'municipality' then raise exception 'Invalid mutation kind' using errcode='22023'; end if;
 return public.phase4_change_pupil(request);
end$$;
create function public.phase4_change_transfer(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.phase3_actor();
 if request->>'kind' is distinct from 'transfer' then raise exception 'Invalid mutation kind' using errcode='22023'; end if;
 return public.phase4_change_pupil(request);
end$$;
create function public.phase4_change_education(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.phase3_actor();
 if request->>'kind' is distinct from 'education' then raise exception 'Invalid mutation kind' using errcode='22023'; end if;
 return public.phase4_change_pupil(request);
end$$;
create function public.phase4_change_end_placement(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.phase3_actor();
 if request->>'kind' is distinct from 'end-placement' then raise exception 'Invalid mutation kind' using errcode='22023'; end if;
 return public.phase4_change_pupil(request);
end$$;
create function public.phase4_change_class(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
begin
 perform public.phase3_actor();
 if request->>'kind' is distinct from 'class' then raise exception 'Invalid mutation kind' using errcode='22023'; end if;
 return public.phase4_change_pupil(request);
end$$;
revoke all on function public.phase4_mutation_date(jsonb,boolean) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_placement_value(public.pupil_placements) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_class_value(public.pupil_class_memberships) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_municipality_value(public.pupil_home_municipalities) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_record_change(public.pupils,public.access_assignments,text,jsonb,jsonb,integer) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_mutation_conflict(public.pupils,jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_pupil(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_basics(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_municipality(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_transfer(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_education(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_end_placement(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_change_class(jsonb) from public,anon,authenticated,skolplattform_worker;
commit;
