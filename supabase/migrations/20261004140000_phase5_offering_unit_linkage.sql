-- 05-22 D-06: klasser och placeringar hör till någon av utbildningens skolor.
-- Nya FK valideras före gamla släpps; tillämpning sker i en transaktion.
-- Befintliga funktionssignaturer och ACL bevaras med CREATE OR REPLACE.
alter table public.school_classes add constraint school_classes_offering_unit_linkage_fkey
 foreign key(offering_id,unit_id,organizer_id) references public.offering_units(offering_id,unit_id,organizer_id) not valid;
alter table public.school_classes validate constraint school_classes_offering_unit_linkage_fkey;
alter table public.school_classes drop constraint school_classes_offering_id_unit_id_organizer_id_fkey;
alter table public.pupil_placements add constraint pupil_placements_offering_unit_linkage_fkey
 foreign key(offering_id,unit_id,organizer_id) references public.offering_units(offering_id,unit_id,organizer_id) not valid;
alter table public.pupil_placements validate constraint pupil_placements_offering_unit_linkage_fkey;
alter table public.pupil_placements drop constraint pupil_placements_offering_id_unit_id_organizer_id_fkey;

CREATE OR REPLACE FUNCTION public.phase4_change_pupil(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
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
   if not exists(select 1 from public.offering_units where offering_id=target_education and unit_id=target_unit and organizer_id=p.organizer_id) then raise exception 'Invalid education' using errcode='22023'; end if;
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
end$function$
;

CREATE OR REPLACE FUNCTION public.phase4_history_value(field text, value jsonb, target_unit uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare label text; object_id uuid; starts_on date; ends_on date;
begin
 if field='personalNumber' then return 'null'::jsonb; end if;
 if field='displayName' and jsonb_typeof(value)='string' then return value; end if;
 if field='protectedIdentity' and jsonb_typeof(value)='boolean' then return value; end if;
 if field='municipality' and jsonb_typeof(value)='string' and (value#>>'{}')~'^[0-9]{4}$' then return value; end if;
 if field='municipality' and jsonb_typeof(value)='object' then
  if exists(select 1 from jsonb_object_keys(value)k where k not in ('id','municipalityCode','startsOn','endsOn')) or coalesce(value->>'municipalityCode','')!~'^[0-9]{4}$' then return 'null'::jsonb; end if;
  if value->>'id' is null or not exists(select 1 from public.pupil_home_municipalities m where m.id=(value->>'id')::uuid and m.municipality_code=value->>'municipalityCode' and m.starts_on::text=value->>'startsOn'
   and exists(select 1 from public.pupil_placements p where p.pupil_id=m.pupil_id and p.unit_id=target_unit and daterange(p.starts_on,p.ends_on,'[]')&&daterange(m.starts_on,m.ends_on,'[]'))) then return 'null'::jsonb; end if;
  starts_on:=(value->>'startsOn')::date; ends_on:=(value->>'endsOn')::date;
  return to_jsonb((value->>'municipalityCode')||case when starts_on is not null then ' · '||starts_on::text||'–'||coalesce(ends_on::text,'') else '' end);
 end if;
 if field not in ('placement','education','class') then return 'null'::jsonb; end if;
 if jsonb_typeof(value)='object' then
  if exists(select 1 from jsonb_object_keys(value)k where k not in ('id','placementId','unitId','educationId','classId','startsOn','endsOn')) then return 'null'::jsonb; end if;
  if value->>'unitId' is not null and (value->>'unitId')::uuid<>target_unit then return 'null'::jsonb; end if;
  if value->>'placementId' is not null and not exists(select 1 from public.pupil_placements p where p.id=(value->>'placementId')::uuid and p.unit_id=target_unit) then return 'null'::jsonb; end if;
  object_id:=case field when 'placement' then (value->>'id')::uuid when 'education' then coalesce(value->>'educationId',value->>'id')::uuid else coalesce(value->>'classId',value->>'id')::uuid end;
  starts_on:=(value->>'startsOn')::date; ends_on:=(value->>'endsOn')::date;
 elsif jsonb_typeof(value)='string' then object_id:=(value#>>'{}')::uuid;
 else return 'null'::jsonb; end if;
 if field='placement' then
  select u.name||' · '||o.name into label from public.pupil_placements p join public.school_units u on u.id=p.unit_id join public.offerings o on o.id=p.offering_id where p.id=object_id and p.unit_id=target_unit;
 elsif field='education' then select o.name into label from public.offerings o join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id where o.id=object_id and ou.unit_id=target_unit;
 else select c.name into label from public.school_classes c where c.id=object_id and c.unit_id=target_unit; end if;
 if label is null then return 'null'::jsonb; end if;
 return to_jsonb(label||case when starts_on is not null then ' · '||starts_on::text||'–'||coalesce(ends_on::text,'') else '' end);
 exception when invalid_text_representation or datetime_field_overflow then return 'null'::jsonb;
end$function$
;

CREATE OR REPLACE FUNCTION public.phase4_list_pupils(request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; s jsonb; rows jsonb; refs jsonb; total integer; page_number integer; options jsonb; scope jsonb; protected_ids jsonb;
begin
 perform public.phase4_keys(request,array['selection','search','caseId']);
 if jsonb_typeof(request->'search') is distinct from 'string' then raise exception 'Invalid search' using errcode='22023'; end if;
 a:=public.phase3_actor(); s:=request->'selection'; perform public.phase4_validate_selection(s); page_number:=(s->>'page')::integer;
 with selected as materialized(select * from public.phase4_filtered(s,request->>'search',(request->>'caseId')::uuid)),
 page as(select * from selected order by item->>'displayName',pupil_id limit 50 offset (page_number::bigint-1)*50)
 select (select count(*) from selected),
 coalesce(jsonb_agg(case when a.function='administrator' and p.is_protected and p.full_access then p.item||jsonb_build_object('protectedIdentity',true) else p.item end order by p.item->>'displayName',p.pupil_id),'[]'),
 coalesce((select jsonb_agg(r order by x.item->>'displayName',x.pupil_id) from selected x cross join lateral jsonb_array_elements(x.audit_refs)r),'[]'),
 coalesce((select jsonb_agg(to_jsonb(x.pupil_id) order by x.item->>'displayName',x.pupil_id) from selected x where a.function='administrator' and x.is_protected and x.full_access),'[]')
 into total,rows,refs,protected_ids from page p;
 select jsonb_build_object('schools',coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name)order by u.name,u.id),'[]')) into scope
 from public.mandate_units m join public.school_units u on u.id=m.unit_id where m.assignment_id=a.id;
 scope:=scope||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'unitId',c.unit_id)order by c.name,c.id) from public.mandate_groups g join public.school_classes c on c.id=g.group_id where g.assignment_id=a.id),'[]'),
 'cases',coalesce((select jsonb_agg(jsonb_build_object('id',m.case_id,'name','Tilldelat ärende','unitId',m.unit_id)order by m.case_id) from public.mandate_cases m where m.assignment_id=a.id),'[]'));
 select jsonb_build_object('schools',scope->'schools',
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'unitId',c.unit_id,'educationId',c.offering_id)order by c.name,c.id) from public.school_classes c where c.unit_id=(s->>'unitId')::uuid and c.customer_id=a.customer_id),'[]'),
 'educations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'unitId',ou.unit_id,'startYear',o.start_year)order by o.name,o.id) from public.offerings o join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id where ou.unit_id=(s->>'unitId')::uuid and o.organizer_id=a.organizer_id),'[]'),
 'grades',coalesce((select jsonb_agg(g order by g) from(select distinct (s->>'schoolYear')::integer-o.start_year+1 g from public.offerings o join public.offering_units ou on ou.offering_id=o.id and ou.organizer_id=o.organizer_id where ou.unit_id=(s->>'unitId')::uuid and o.start_year is not null)x),'[]'),
 'statuses',jsonb_build_array('aktuell','framtida','avslutad')) into options;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupils',rows,'scope',scope,'options',options,'count',total,'page',page_number,'pageSize',50,
 'capabilities',jsonb_build_object('canEdit',a.function='administrator','canExport',a.function='administrator','canRevealPersonalNumber',a.function='administrator','canReadHistory',a.function='administrator','canReadProtected',a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid)))
 ||case when a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid) then jsonb_build_object('protectedIds',protected_ids) else '{}'::jsonb end,
 'auditRefs',refs);
end$function$
;

CREATE OR REPLACE FUNCTION public.phase4_validate_selection(s jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; u uuid;
begin
 perform public.phase4_keys(s,array['schoolYear','unitId','classId','educationId','grade','status','page']);
 if jsonb_typeof(s->'schoolYear')<>'number' or (s->>'schoolYear') !~ '^[0-9]+$'
 or jsonb_typeof(s->'page')<>'number' or (s->>'page') !~ '^[0-9]+$' or (s->>'page')::numeric<1 or (s->>'page')::numeric>2147483647
 or (s->>'schoolYear')::numeric not between 1 and 9998
 or (s->'grade'<>'null'::jsonb and (jsonb_typeof(s->'grade')<>'number' or (s->>'grade')!~ '^-?[0-9]+$' or (s->>'grade')::numeric not between -2147483648 and 2147483647))
 or (s->'status'<>'null'::jsonb and s->>'status' not in ('aktuell','framtida','avslutad')) then raise exception 'Invalid selection' using errcode='22023'; end if;
 perform public.phase4_year((s->>'schoolYear')::integer); u:=(s->>'unitId')::uuid;
 a:=public.phase3_actor();
 if u is null or not exists(select 1 from public.mandate_units x where x.assignment_id=a.id and x.unit_id=u) then raise exception 'Read denied' using errcode='42501'; end if;
 if s->>'classId' is not null and not exists(select 1 from public.school_classes c where c.id=(s->>'classId')::uuid and c.unit_id=u and c.customer_id=a.customer_id) then raise exception 'Read denied' using errcode='42501'; end if;
 if s->>'educationId' is not null and not exists(select 1 from public.offering_units ou where ou.offering_id=(s->>'educationId')::uuid and ou.unit_id=u and ou.organizer_id=a.organizer_id) then raise exception 'Read denied' using errcode='42501'; end if;
end$function$
;

CREATE OR REPLACE FUNCTION public.phase5_change_programplan_education(offering_id uuid, expected_revision integer, command text, details jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
declare a public.access_assignments; o public.offerings; versions integer; decided boolean; p public.point_plans; current_start date; started date;
 new_name text; new_code text; new_cohort text; start_changed boolean:=false; operation text; unit_ids uuid[]; school_id uuid; added integer; removed integer;
begin
 a:=public.phase5_programplan_actor(); perform public.phase5_programplan_session_check();
 if a.function<>'huvudman' then raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if offering_id is null or expected_revision is null or expected_revision<0 or command is null or command not in ('delete','archive','restore','update','units')
  or details is null or jsonb_typeof(details)<>'object' then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command not in ('update','units') and details<>'{}'::jsonb then raise exception 'Invalid education command' using errcode='22023'; end if;
 if command='update' then
  if (select count(*) from jsonb_object_keys(details))<>4 or not details ?& array['name','localCode','cohort','startedOn']
   or jsonb_typeof(details->'name')<>'string' or jsonb_typeof(details->'cohort')<>'string' or jsonb_typeof(details->'localCode') not in ('string','null')
   or jsonb_typeof(details->'startedOn') not in ('string','null') then raise exception 'Invalid education command' using errcode='22023'; end if;
  new_name:=btrim(details->>'name'); new_cohort:=btrim(details->>'cohort'); new_code:=case when details->>'localCode' is null then null else btrim(details->>'localCode') end;
  -- Samma längdkontroll som skapandet.
  if char_length(details->>'name')>120 or char_length(new_name)=0 or char_length(details->>'cohort')>120 or char_length(new_cohort)=0
   or (new_code is not null and (char_length(details->>'localCode')>80 or char_length(new_code)=0)) then raise exception 'Invalid education' using errcode='22023'; end if;
  if details->>'startedOn' is not null then
   if details->>'startedOn' !~ '^\d{4}-\d{2}-\d{2}$' then raise exception 'Invalid education' using errcode='22023'; end if;
   begin started:=(details->>'startedOn')::date; exception when others then raise exception 'Invalid education' using errcode='22023'; end;
  end if;
 end if;
 if command='units' then
  if (select count(*) from jsonb_object_keys(details))<>1 or not details?'unitIds'
   or jsonb_typeof(details->'unitIds') is distinct from 'array' then raise exception 'Invalid education command' using errcode='22023'; end if;
  if jsonb_array_length(details->'unitIds') not between 1 and 100
   or exists(select 1 from jsonb_array_elements(details->'unitIds') v where jsonb_typeof(v)<>'string' or v#>>'{}' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then raise exception 'Invalid education command' using errcode='22023'; end if;
  select array_agg(v::uuid order by v::uuid) into unit_ids from jsonb_array_elements_text(details->'unitIds') v;
  if cardinality(unit_ids)<>(select count(distinct v) from unnest(unit_ids) v) then raise exception 'Invalid education command' using errcode='22023'; end if;
  -- Lås både nuvarande och begärda skolor före scope i gemensam id-ordning.
  -- Mandat/kund är kontrollerat; främmande skolor låses aldrig.
  perform 1 from public.school_units u where u.organizer_id=a.organizer_id and (u.id=any(unit_ids) or exists(select 1 from public.offering_units ou where ou.offering_id=phase5_change_programplan_education.offering_id and ou.unit_id=u.id)) order by u.id for update;
 end if;
 -- Låsordning: session -> kund -> skolor (scope) -> utbildning -> planer.
 o:=public.phase5_programplan_scope(null,offering_id);
 perform 1 from public.point_plans pp where pp.offering_id=o.id order by pp.id for update;
 select * into o from public.offerings where id=o.id;
 if command in ('delete','update') then perform public.phase5_programplan_writable(o,true);
 elsif o.organizer_id<>a.organizer_id or exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not exists(select 1 from public.mandate_units m where m.assignment_id=a.id and m.unit_id=ou.unit_id)) then
  raise exception 'Education denied' using errcode='42501',hint='programplan_mandate'; end if;
 if o.lifecycle_revision<>expected_revision then raise exception 'Education revision conflict' using errcode='40001'; end if;
 if command='delete' then
  if exists(select 1 from public.school_classes c where c.offering_id=o.id) or exists(select 1 from public.pupil_placements pl where pl.offering_id=o.id)
   or exists(select 1 from public.timplans t where t.offering_id=o.id) or exists(select 1 from public.permits t where t.offering_id=o.id) then
   raise exception 'Education in use' using errcode='55006',hint='programplan_in_use'; end if;
  select count(*)::integer,coalesce(bool_or(pp.status in ('faststalld','ersatt')),false) into versions,decided from public.point_plans pp where pp.offering_id=o.id;
  delete from public.point_plans pp where pp.offering_id=o.id;
  delete from public.offerings f where f.id=o.id;
  insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman','programplan_education_deleted');
  perform public.phase5_programplan_lifecycle_audit('programplan_education_deleted',o.id,jsonb_build_object('versions',versions,'decided',decided));
  return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',null);
 end if;
 if command='units' then
  if not o.unit_id=any(unit_ids) then raise exception 'Invalid education command' using errcode='22023'; end if;
  if o.archived_at is not null then raise exception 'Programplan archived' using errcode='42501',hint='programplan_archived'; end if;
  select count(*)::integer into removed from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids);
  select count(*)::integer into added from unnest(unit_ids) u where not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u);
  if removed>0 and public.phase5_programplan_phase(o) is distinct from 'framtida' then raise exception 'Programplan started' using errcode='42501',hint='programplan_started'; end if;
  -- Varje ändrad skola kontrolleras igen med samma GY-/huvudmanna-/mandatregel.
  for school_id in select u from unnest(unit_ids) u where not exists(select 1 from public.offering_units ou where ou.offering_id=o.id and ou.unit_id=u)
   union select ou.unit_id from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids) order by 1 loop
   perform public.phase5_programplan_unit(school_id,true);
  end loop;
  -- FK skyddar också mot samtidiga referenser. Här får klienten en verksamhetsorsak.
  -- Före nästa migration saknar timplans unit_id; huvudskolan är då dess enda skola.
  if exists(select 1 from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids)
   and (exists(select 1 from public.school_classes c where c.offering_id=o.id and c.unit_id=ou.unit_id)
    or exists(select 1 from public.pupil_placements pl where pl.offering_id=o.id and pl.unit_id=ou.unit_id)
    or exists(select 1 from public.timplans t where t.offering_id=o.id and coalesce((to_jsonb(t)->>'unit_id')::uuid,o.unit_id)=ou.unit_id))) then
   raise exception 'Education in use' using errcode='55006',hint='programplan_in_use'; end if;
  delete from public.offering_units ou where ou.offering_id=o.id and not ou.unit_id=any(unit_ids);
  insert into public.offering_units(offering_id,unit_id,organizer_id) select o.id,u,o.organizer_id from unnest(unit_ids) u on conflict do nothing;
  update public.offerings set lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_units_changed';
 elsif command='archive' then
  if o.archived_at is not null then raise exception 'Education already archived' using errcode='40001'; end if;
  update public.offerings set archived_at=clock_timestamp(),lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_archived';
 elsif command='restore' then
  if o.archived_at is null then raise exception 'Education not archived' using errcode='40001'; end if;
  update public.offerings set archived_at=null,lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_restored';
 else
  if exists(select 1 from public.offerings f where f.id<>o.id and f.organizer_id=o.organizer_id and f.unit_id=o.unit_id and f.kind='gymnasium'
   and f.program_code is not distinct from o.program_code and f.orientation_code is not distinct from o.orientation_code
   and btrim(f.name)=new_name and btrim(f.cohort)=new_cohort and case when f.local_code is null then null else btrim(f.local_code) end is not distinct from new_code) then
   raise exception 'Education conflict' using errcode='40001'; end if;
  current_start:=public.phase5_programplan_starts_on(o);
  if started is not null and started is distinct from current_start then
   -- Startdatum ändras bara när utbildningen har en enda version som är ett bundet utkast.
   select count(*)::integer into versions from public.point_plans pp where pp.offering_id=o.id;
   select * into p from public.point_plans pp where pp.offering_id=o.id;
   if versions<>1 or p.status<>'utkast' or p.basis_reference is null then raise exception 'Education start locked' using errcode='22023'; end if;
   if started<=public.phase5_programplan_today() then raise exception 'Education start passed' using errcode='22023',hint='programplan_start_passed'; end if;
   update public.point_plans set basis_reference=jsonb_set(basis_reference,'{startedOn}',to_jsonb(to_char(started,'YYYY-MM-DD'))),revision=revision+1 where id=p.id;
   start_changed:=true;
  end if;
  update public.offerings set name=new_name,local_code=new_code,cohort=new_cohort,
   start_year=case when start_changed then extract(year from started)::integer else start_year end,lifecycle_revision=lifecycle_revision+1 where id=o.id returning * into o;
  operation:='programplan_education_updated';
 end if;
 insert into public.organisation_events(organizer_id,actor_role,action) values(o.organizer_id,'huvudman',operation);
 perform public.phase5_programplan_lifecycle_audit(operation,o.id,case when command='units' then jsonb_build_object('added',added,'removed',removed) when command='update' then jsonb_build_object('startChanged',start_changed) else '{}'::jsonb end);
 return jsonb_build_object('offeringId',o.id,'command',command,'lifecycle',public.phase5_programplan_lifecycle(o));
end $function$
;
