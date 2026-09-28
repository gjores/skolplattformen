begin;
-- 04-04. New register readers stay CLOSED until the auditable API (04-09/10).
-- JSON envelopes are internal: {kind:'success',body,auditRefs}. Only body is public.
-- Every entrypoint obtains the existing customer lock through phase3_actor.
create function public.phase4_keys(value jsonb,keys text[]) returns void
language plpgsql immutable set search_path=pg_catalog as $$begin
 if jsonb_typeof(value) is distinct from 'object' or not(value ?& keys)
 or exists(select 1 from jsonb_object_keys(value) k where not(k=any(keys))) then
 raise exception 'Invalid register request' using errcode='22023'; end if;
end$$;
create function public.phase4_year(y integer) returns date
language plpgsql immutable set search_path=pg_catalog as $$begin
 if y is null or y<1 or y>9998 then raise exception 'Invalid school year' using errcode='22023'; end if;
 return make_date(y,7,1);
end$$;
create function public.phase4_scope(assignment_id uuid,pupil_id uuid,unit_id uuid,case_id uuid default null) returns boolean
language sql volatile security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.access_assignments a join public.pupils p on p.id=$2 and p.customer_id=a.customer_id and p.organizer_id=a.organizer_id
 where a.id=$1 and public.phase3_mandate_is_valid(a.id)
 and a.function in ('rektor','administrator','larare','elevhalsa','support')
 and exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=$3)
 and exists(select 1 from public.pupil_placements pp where pp.pupil_id=p.id and pp.unit_id=$3)
 and ($4 is null or exists(select 1 from public.phase3_probe_cases c where c.id=$4 and c.pupil_id=p.id and c.unit_id=$3 and c.customer_id=a.customer_id))
 and (a.scope_kind='school'
 or (a.scope_kind='group' and exists(select 1 from public.mandate_groups g join public.pupil_class_memberships cm on cm.class_id=g.group_id and cm.unit_id=g.unit_id and cm.pupil_id=p.id
  where g.assignment_id=a.id and g.unit_id=$3 and cm.starts_on<=public.app_today() and (cm.ends_on is null or cm.ends_on>=public.app_today())
  and exists(select 1 from public.pupil_placements pp where pp.id=cm.placement_id and pp.starts_on<=public.app_today() and (pp.ends_on is null or pp.ends_on>=public.app_today()))))
 or (a.scope_kind='pupil' and exists(select 1 from public.mandate_pupils mp where mp.assignment_id=a.id and mp.pupil_id=p.id and mp.unit_id=$3))
 or (a.scope_kind='case' and exists(select 1 from public.mandate_cases mc where mc.assignment_id=a.id and mc.case_id=$4 and mc.unit_id=$3))))
$$;
create or replace function public.phase3_pupil_in_scope(assignment_id uuid,pupil_id uuid,case_id uuid default null) returns boolean
language sql volatile security invoker set search_path=pg_catalog,public as $$
 select exists(select 1 from public.pupil_placements p where p.pupil_id=$2 and public.phase4_scope($1,$2,p.unit_id,$3))
$$;
-- Internal projection, never executable by Worker. Protected identity is only an
-- internal selection attribute, not a discriminator in public list/card rows.
create function public.phase4_projection(school_year integer,target_unit uuid default null,case_id uuid default null)
returns table(pupil_id uuid,unit_id uuid,is_protected boolean,full_access boolean,item jsonb,audit_refs jsonb)
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; y date; ref date;
begin
 a:=public.phase3_actor(); y:=public.phase4_year(school_year);
 if a.function not in ('rektor','administrator','larare','elevhalsa','support') then raise exception 'Read denied' using errcode='42501'; end if;
 if target_unit is not null and not exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=target_unit) then raise exception 'Read denied' using errcode='42501'; end if;
 ref:=case when public.app_today()>=y and public.app_today()<make_date(school_year+1,7,1) then public.app_today() else y end;
 return query
 with placements as materialized (
 select distinct on (pp.pupil_id) pp.* from public.pupil_placements pp
 where pp.customer_id=a.customer_id and (target_unit is null or pp.unit_id=target_unit)
 and pp.starts_on<make_date(school_year+1,7,1) and (pp.ends_on is null or pp.ends_on>=y)
 and public.phase4_scope(a.id,pp.pupil_id,pp.unit_id,case_id)
 order by pp.pupil_id,(pp.starts_on<=ref and (pp.ends_on is null or pp.ends_on>=ref)) desc,pp.starts_on desc,pp.id
 ), projected as materialized (
 select p.*,pp.unit_id selected_unit,pp.starts_on,pp.ends_on,pp.offering_id,u.name unit_name,o.name education_name,o.start_year,
 cm.class_id,sc.name class_name,
 (not p.protected_identity or (a.function='administrator' and public.phase4_has_protected_permission(a.id,pp.unit_id))) readable
 from placements pp join public.pupils p on p.id=pp.pupil_id join public.school_units u on u.id=pp.unit_id join public.offerings o on o.id=pp.offering_id
 left join lateral (select x.class_id from public.pupil_class_memberships x where x.placement_id=pp.id
 and x.starts_on<=ref and (x.ends_on is null or x.ends_on>=ref) order by x.starts_on desc,x.id limit 1)cm on true
 left join public.school_classes sc on sc.id=cm.class_id
 )
 select p.id,p.selected_unit,p.protected_identity,p.readable,
 jsonb_build_object('id',p.id,'displayName',case when p.readable then p.display_name else p.anonymous_name end,
 'unitId',p.selected_unit,'unitName',p.unit_name,'classId',p.class_id,'className',p.class_name,
 'educationId',p.offering_id,'educationName',p.education_name,'grade',school_year-p.start_year+1,
 'status',case when p.starts_on>ref then 'framtida' when p.ends_on<ref then 'avslutad' else 'aktuell' end,
 'capabilities',jsonb_build_object(
 'canEdit',a.function='administrator' and p.readable and exists(select 1 from public.pupil_placements z where z.pupil_id=p.id and exists(select 1 from public.mandate_units mu where mu.assignment_id=a.id and mu.unit_id=z.unit_id) and (not p.protected_identity or public.phase4_has_protected_permission(a.id,z.unit_id)) and (z.ends_on is null or z.ends_on>=public.app_today())),
 'canExport',a.function='administrator' and p.readable,'canRevealPersonalNumber',a.function='administrator' and p.readable,'canReadHistory',a.function='administrator' and p.readable))
 ||case when a.function='administrator' and p.readable then jsonb_build_object('birthDate',p.birth_date,'municipalityCode',(select m.municipality_code from public.pupil_home_municipalities m where m.pupil_id=p.id and m.starts_on<=ref and (m.ends_on is null or m.ends_on>=ref) and daterange(m.starts_on,m.ends_on,'[]')&&daterange(p.starts_on,p.ends_on,'[]') order by m.starts_on desc limit 1)) else '{}'::jsonb end,
 case when p.protected_identity and p.readable then jsonb_build_array(jsonb_build_object('kind','protected','pupilId',p.id)) else '[]'::jsonb end
 from projected p;
end$$;
create function public.phase4_validate_selection(s jsonb) returns void
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
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
 if s->>'educationId' is not null and not exists(select 1 from public.offerings o where o.id=(s->>'educationId')::uuid and o.unit_id=u and o.organizer_id=a.organizer_id) then raise exception 'Read denied' using errcode='42501'; end if;
end$$;
create function public.phase4_filtered(s jsonb,search_text text,case_id uuid)
returns table(pupil_id uuid,unit_id uuid,is_protected boolean,full_access boolean,item jsonb,audit_refs jsonb)
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$begin
 perform public.phase4_validate_selection(s);
 if search_text is null or length(search_text)>200 then raise exception 'Invalid search' using errcode='22023'; end if;
 return query select p.* from public.phase4_projection((s->>'schoolYear')::integer,(s->>'unitId')::uuid,case_id) p
 where (s->>'classId' is null or p.item->>'classId'=s->>'classId')
 and (s->>'educationId' is null or p.item->>'educationId'=s->>'educationId')
 and (s->>'grade' is null or p.item->>'grade'=s->>'grade')
 and (s->>'status' is null or p.item->>'status'=s->>'status')
 and (btrim(search_text)='' or (p.full_access and (
 position(lower(btrim(search_text)) in lower(p.item->>'displayName'))>0
 or (p.item ? 'birthDate' and (position(btrim(search_text) in p.item->>'birthDate')>0
 or exists(select 1 from public.pupils identity_p where identity_p.id=p.pupil_id and position(lower(btrim(search_text)) in lower(identity_p.personal_number))>0))))));
end$$;
create function public.phase4_list_pupils(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; s jsonb; rows jsonb; refs jsonb; total integer; page_number integer; options jsonb; scope jsonb;
begin
 perform public.phase4_keys(request,array['selection','search','caseId']);
 if jsonb_typeof(request->'search') is distinct from 'string' then raise exception 'Invalid search' using errcode='22023'; end if;
 a:=public.phase3_actor(); s:=request->'selection'; perform public.phase4_validate_selection(s); page_number:=(s->>'page')::integer;
 with selected as materialized(select * from public.phase4_filtered(s,request->>'search',(request->>'caseId')::uuid)),
 page as(select * from selected order by item->>'displayName',pupil_id limit 50 offset (page_number::bigint-1)*50)
 select (select count(*) from selected),coalesce(jsonb_agg(item order by item->>'displayName',pupil_id),'[]'),
 coalesce((select jsonb_agg(r) from page p cross join lateral jsonb_array_elements(p.audit_refs)r),'[]') into total,rows,refs from page;
 select jsonb_build_object('schools',coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.name)order by u.name,u.id),'[]')) into scope
 from public.mandate_units m join public.school_units u on u.id=m.unit_id where m.assignment_id=a.id;
 scope:=scope||jsonb_build_object('groups',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'unitId',c.unit_id)order by c.name,c.id) from public.mandate_groups g join public.school_classes c on c.id=g.group_id where g.assignment_id=a.id),'[]'),
 'cases',coalesce((select jsonb_agg(jsonb_build_object('id',m.case_id,'name','Tilldelat ärende','unitId',m.unit_id)order by m.case_id) from public.mandate_cases m where m.assignment_id=a.id),'[]'));
 select jsonb_build_object('schools',scope->'schools',
 'classes',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'name',c.name,'unitId',c.unit_id,'educationId',c.offering_id)order by c.name,c.id) from public.school_classes c where c.unit_id=(s->>'unitId')::uuid and c.customer_id=a.customer_id),'[]'),
 'educations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'unitId',o.unit_id,'startYear',o.start_year)order by o.name,o.id) from public.offerings o where o.unit_id=(s->>'unitId')::uuid and o.organizer_id=a.organizer_id),'[]'),
 'grades',coalesce((select jsonb_agg(g order by g) from(select distinct (s->>'schoolYear')::integer-o.start_year+1 g from public.offerings o where o.unit_id=(s->>'unitId')::uuid and o.start_year is not null)x),'[]'),
 'statuses',jsonb_build_array('aktuell','framtida','avslutad')) into options;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupils',rows,'scope',scope,'options',options,'count',total,'page',page_number,'pageSize',50,
 'capabilities',jsonb_build_object('canEdit',a.function='administrator','canExport',a.function='administrator','canRevealPersonalNumber',a.function='administrator','canReadHistory',a.function='administrator','canReadProtected',a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid))),'auditRefs',refs);
end$$;
create function public.phase4_card_row(request jsonb)
returns table(pupil_id uuid,unit_id uuid,is_protected boolean,full_access boolean,item jsonb,audit_refs jsonb)
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$begin
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId']);
 if jsonb_typeof(request->'schoolYear') is distinct from 'number' or (request->>'schoolYear')!~'^[0-9]+$' or (request->>'schoolYear')::numeric not between 1 and 9998 or request->>'pupilId' is null then raise exception 'Invalid card' using errcode='22023'; end if;
 return query select p.* from public.phase4_projection((request->>'schoolYear')::integer,null,(request->>'caseId')::uuid)p where p.pupil_id=(request->>'pupilId')::uuid;
 if not found then raise exception 'Pupil not found' using errcode='P0002'; end if;
end$$;
-- Closed scalar allowlist; nested source/history JSON must not become a covert
-- personal-number or foreign-placement channel. Period details have dedicated
-- scoped card arrays rather than arbitrary historic JSON values.
create function public.phase4_history_value(field text,value jsonb,target_unit uuid) returns jsonb
language plpgsql stable security invoker set search_path=pg_catalog,public as $$
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
 elsif field='education' then select o.name into label from public.offerings o where o.id=object_id and o.unit_id=target_unit;
 else select c.name into label from public.school_classes c where c.id=object_id and c.unit_id=target_unit; end if;
 if label is null then return 'null'::jsonb; end if;
 return to_jsonb(label||case when starts_on is not null then ' · '||starts_on::text||'–'||coalesce(ends_on::text,'') else '' end);
 exception when invalid_text_representation or datetime_field_overflow then return 'null'::jsonb;
end$$;
create function public.phase4_pupil_card(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record; result jsonb;
begin
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request);
 result:=r.item||jsonb_build_object('version',(select p.version from public.pupils p where p.id=r.pupil_id),
 'placements',case when r.full_access then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'unitId',p.unit_id,'educationId',p.offering_id,'startsOn',p.starts_on,'endsOn',p.ends_on)order by p.starts_on,p.id) from public.pupil_placements p where p.pupil_id=r.pupil_id and p.unit_id=r.unit_id),'[]') else '[]'::jsonb end,
 'classes',case when r.full_access then coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'placementId',c.placement_id,'classId',c.class_id,'startsOn',c.starts_on,'endsOn',c.ends_on)order by c.starts_on,c.id) from public.pupil_class_memberships c where c.pupil_id=r.pupil_id and c.unit_id=r.unit_id and (a.scope_kind<>'group' or exists(select 1 from public.mandate_groups g where g.assignment_id=a.id and g.group_id=c.class_id))),'[]') else '[]'::jsonb end);
 if a.function='administrator' and r.full_access then
 result:=result||jsonb_build_object('protectedIdentity',r.is_protected,
 'municipalities',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'municipalityCode',m.municipality_code,'startsOn',m.starts_on,'endsOn',m.ends_on,'origin',(select jsonb_build_object('source',h.source,'actorId',h.actor_id,'changedAt',h.changed_at,'localCorrection',exists(select 1 from public.pupil_field_state fs where fs.pupil_id=h.pupil_id and fs.field=h.field and fs.revision=h.revision and fs.local_correction)) from public.pupil_field_history h where h.pupil_id=m.pupil_id and h.field='municipality' and (h.after_value->>'id'=m.id::text or (h.after_value->>'municipalityCode'=m.municipality_code and h.after_value->>'startsOn'=m.starts_on::text)) order by h.changed_at desc,h.id limit 1))order by m.starts_on,m.id) from public.pupil_home_municipalities m join public.pupils p on p.id=m.pupil_id where m.pupil_id=r.pupil_id and exists(select 1 from public.pupil_placements pp where pp.pupil_id=m.pupil_id and pp.unit_id=r.unit_id and daterange(pp.starts_on,pp.ends_on,'[]')&&daterange(m.starts_on,m.ends_on,'[]'))),'[]'),
 'origins',coalesce((select jsonb_object_agg(f.field,jsonb_build_object('source',f.source,'actorId',f.actor_id,'changedAt',f.changed_at,'localCorrection',f.local_correction)) from public.pupil_field_state f where f.pupil_id=r.pupil_id),'{}'),
 'sourceConflicts',coalesce((select jsonb_agg(jsonb_build_object('id',s.id,'field',s.field,'origin',jsonb_build_object('source',s.source,'actorId',s.actor_id,'changedAt',s.changed_at,'localCorrection',false))||case when s.field='personalNumber' then '{}'::jsonb else jsonb_build_object('local',case s.field when 'displayName' then to_jsonb(p.display_name) when 'protectedIdentity' then to_jsonb(p.protected_identity) else 'null'::jsonb end,'incoming',public.phase4_history_value(s.field,s.source_value,r.unit_id))end order by s.changed_at,s.id) from public.pupil_source_values s join public.pupils p on p.id=s.pupil_id where s.pupil_id=r.pupil_id and s.resolved_at is null),'[]'));
 end if;
 return jsonb_build_object('kind','success','body',result,'auditRefs',r.audit_refs);
end$$;
create function public.phase4_pupil_history(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record; entries jsonb; total integer; page_number integer;
begin
 perform public.phase4_keys(request,array['pupilId','schoolYear','caseId','page']);
 if jsonb_typeof(request->'page') is distinct from 'number' or (request->>'page')!~'^[0-9]+$' or (request->>'page')::numeric<1 or (request->>'page')::numeric>2147483647 then raise exception 'Invalid page' using errcode='22023'; end if;
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request-'page');
 if a.function<>'administrator' or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 page_number:=(request->>'page')::integer;
 select count(*) into total from public.pupil_field_history h where h.pupil_id=r.pupil_id;
 select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'field',h.field,'before',public.phase4_history_value(h.field,h.before_value,r.unit_id),'after',public.phase4_history_value(h.field,h.after_value,r.unit_id),'changedBy',h.actor_id,'changedAt',h.changed_at,'origin',jsonb_build_object('source',h.source,'actorId',h.actor_id,'changedAt',h.changed_at,'localCorrection',exists(select 1 from public.pupil_field_state fs where fs.pupil_id=h.pupil_id and fs.field=h.field and fs.revision=h.revision and fs.local_correction)))order by h.changed_at desc,h.id),'[]') into entries
 from(select * from public.pupil_field_history h where h.pupil_id=r.pupil_id order by h.changed_at desc,h.id limit 20 offset(page_number::bigint-1)*20)h;
 return jsonb_build_object('kind','success','body',jsonb_build_object('entries',entries,'count',total,'page',page_number,'pageSize',20),'auditRefs',r.audit_refs);
end$$;
create function public.phase4_reveal_personal_number(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; r record;
begin
 a:=public.phase3_actor(); select * into strict r from public.phase4_card_row(request);
 if a.function<>'administrator' or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupilId',r.pupil_id,'personalNumber',(select p.personal_number from public.pupils p where p.id=r.pupil_id)),
 'auditRefs',r.audit_refs||jsonb_build_array(jsonb_build_object('kind','personal-number','pupilId',r.pupil_id)));
end$$;
create function public.phase4_export_pupils(request jsonb,preview boolean default false) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; selected jsonb; r record; rows jsonb:='[]'; refs jsonb:='[]'; fields text[]; ids uuid[]; protected_ids uuid[]; seen uuid[]:='{}'; row_value jsonb; include_number boolean; y integer; c uuid; total integer:=0;
begin
 a:=public.phase3_actor(); if a.function<>'administrator' then raise exception 'Export denied' using errcode='42501'; end if;
 if request->>'mode'='filter' then perform public.phase4_keys(request,array['mode','selection','search','schoolYear','caseId','fields','protectedIds','includePersonalNumber']);
 elsif request->>'mode'='ids' then perform public.phase4_keys(request,array['mode','ids','schoolYear','caseId','fields','protectedIds','includePersonalNumber']);
 else raise exception 'Invalid export' using errcode='22023'; end if;
 if preview is null or jsonb_typeof(request->'schoolYear') is distinct from 'number' or (request->>'schoolYear')!~'^[0-9]+$'
 or (request->>'schoolYear')::numeric not between 1 and 9998
 or jsonb_typeof(request->'fields') is distinct from 'array' or jsonb_typeof(request->'protectedIds') is distinct from 'array'
 or jsonb_typeof(request->'includePersonalNumber') is distinct from 'boolean' then raise exception 'Invalid export' using errcode='22023'; end if;
 y:=(request->>'schoolYear')::integer; perform public.phase4_year(y); c:=(request->>'caseId')::uuid;
 fields:=array(select jsonb_array_elements_text(request->'fields')); protected_ids:=array(select jsonb_array_elements_text(request->'protectedIds')::uuid);
 if cardinality(fields)=0 or exists(select 1 from unnest(fields)f where f not in ('id','displayName','birthDate','unitName','className','educationName','grade','status','municipalityCode')) or cardinality(fields)<>(select count(distinct f)from unnest(fields)f)
 or cardinality(protected_ids)<>(select count(distinct f)from unnest(protected_ids)f) then raise exception 'Invalid export fields' using errcode='22023'; end if;
 include_number:=(request->>'includePersonalNumber')::boolean;
 if request->>'mode'='filter' then
 if request->'selection'->>'schoolYear' is distinct from request->>'schoolYear' or jsonb_typeof(request->'search') is distinct from 'string' then raise exception 'Invalid export filter' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.item->>'displayName',x.pupil_id),'[]') into selected from public.phase4_filtered(request->'selection',request->>'search',c)x;
 else
 if jsonb_typeof(request->'ids') is distinct from 'array' or jsonb_array_length(request->'ids')=0 then raise exception 'Invalid export ids' using errcode='22023'; end if;
 ids:=array(select jsonb_array_elements_text(request->'ids')::uuid);
 if cardinality(ids)<>(select count(distinct f)from unnest(ids)f) then raise exception 'Invalid export ids' using errcode='22023'; end if;
 select coalesce(jsonb_agg(to_jsonb(x)order by x.item->>'displayName',x.pupil_id),'[]') into selected from public.phase4_projection(y,null,c)x where x.pupil_id=any(ids);
 if jsonb_array_length(selected)<>cardinality(ids) then raise exception 'Pupil not found' using errcode='P0002'; end if;
 end if;
 for r in select * from jsonb_to_recordset(selected)as x(pupil_id uuid,unit_id uuid,is_protected boolean,full_access boolean,item jsonb,audit_refs jsonb) loop
 if r.pupil_id=any(protected_ids) then
 if not r.is_protected or not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 seen:=array_append(seen,r.pupil_id);
 elsif r.is_protected then continue; end if;
 if not r.full_access then raise exception 'Pupil not found' using errcode='P0002'; end if;
 total:=total+1;
 if not preview then
 select coalesce(jsonb_object_agg(k,v),'{}') into row_value from jsonb_each(r.item)as x(k,v) where k=any(fields);
 if include_number then
 row_value:=row_value||jsonb_build_object('personalNumber',(select p.personal_number from public.pupils p where p.id=r.pupil_id));
 refs:=refs||jsonb_build_array(jsonb_build_object('kind','personal-number-export','pupilId',r.pupil_id));
 end if;
 rows:=rows||jsonb_build_array(row_value); refs:=refs||r.audit_refs;
 end if;
 end loop;
 if cardinality(seen)<>cardinality(protected_ids) then raise exception 'Pupil not found' using errcode='P0002'; end if;
 return jsonb_build_object('kind','success','body',jsonb_build_object('count',total,'fields',to_jsonb(fields),'includePersonalNumber',include_number)||case when preview then '{}'::jsonb else jsonb_build_object('rows',rows)end,'auditRefs',refs);
end$$;

-- Existing auditable mandate mutation now uses register relations.
create or replace function public.phase3_insert_mandate(actor_id uuid,payload jsonb) returns uuid
language plpgsql volatile security invoker set search_path=pg_catalog,public as $$
declare parent public.access_assignments; recipient public.memberships; new_id uuid:=gen_random_uuid();
  fn public.access_function; unit_ids uuid[]; staff_id uuid; group_item jsonb; item uuid;
begin
  if jsonb_typeof(payload) is distinct from 'object' or exists(select 1 from jsonb_object_keys(payload) k
    where k not in ('membershipId','function','unitIds','scopeKind','groups','pupilIds','caseIds',
      'validFrom','validTo','startsAt','endsAt','profession','purposeCode','staffAssignmentId')) then
    raise exception 'Invalid mandate payload' using errcode='22023'; end if;
  select * into parent from public.access_assignments where id=actor_id;
  if not found or not public.phase3_mandate_is_valid(parent.id) then raise exception 'Mandate denied' using errcode='42501'; end if;
  select * into recipient from public.memberships where id=(payload->>'membershipId')::uuid and customer_id=parent.customer_id and status='active';
  if not found then raise exception 'Recipient denied' using errcode='42501'; end if;
  fn:=(payload->>'function')::public.access_function;
  unit_ids:=array(select jsonb_array_elements_text(coalesce(payload->'unitIds','[]'))::uuid);
  staff_id:=nullif(payload->>'staffAssignmentId','')::uuid;
  if fn in ('rektor','larare') then
    if staff_id is null then
      insert into public.assignments(organizer_id,name,role)
      select parent.organizer_id,coalesce(nullif(i.display_name,''),'Personal'),fn::text::public.staff_role
        from public.identities i where i.id=recipient.identity_id returning id into staff_id;
    else
      if not exists(select 1 from public.assignments s where s.id=staff_id and s.organizer_id=parent.organizer_id and s.role::text=fn::text)
        or exists(select 1 from public.staff_assignment_bindings b where b.staff_assignment_id=staff_id and b.membership_id<>recipient.id)
      then raise exception 'Staff binding denied' using errcode='42501'; end if;
    end if;
    insert into public.staff_assignment_bindings values(staff_id,recipient.id,parent.customer_id,parent.organizer_id) on conflict do nothing;
    insert into public.assignment_units(assignment_id,unit_id) select staff_id,unnest(unit_ids) on conflict do nothing;
  elsif staff_id is not null then raise exception 'Unexpected staff binding' using errcode='22023'; end if;
  insert into public.access_assignments(id,membership_id,customer_id,organizer_id,unit_id,function,
    valid_from,valid_to,staff_assignment_id,created_by,parent_assignment_id,issued_by_assignment_id,
    profile_id,scope_kind,profession,starts_at,ends_at,approved_by_assignment_id,purpose_code)
  values(new_id,recipient.id,parent.customer_id,parent.organizer_id,unit_ids[1],fn,
    coalesce((payload->>'validFrom')::date,public.app_today()),(payload->>'validTo')::date,staff_id,parent.membership_id,
    parent.id,parent.id,'synthetic-v1',payload->>'scopeKind',payload->>'profession',
    (payload->>'startsAt')::timestamptz,(payload->>'endsAt')::timestamptz,
    case when fn='support' then parent.id end,payload->>'purposeCode');
  insert into public.mandate_units select new_id,parent.customer_id,parent.organizer_id,unnest(unit_ids);
  for group_item in select value from jsonb_array_elements(coalesce(payload->'groups','[]')) loop
    if jsonb_typeof(group_item) is distinct from 'object' or exists(select 1 from jsonb_object_keys(group_item) k where k not in ('id','kind'))
      or group_item->>'kind' not in ('teaching','mentor') or group_item->>'kind' is null then
      raise exception 'Invalid group' using errcode='22023'; end if;
    insert into public.mandate_groups
      select new_id,g.id,parent.customer_id,g.unit_id,case group_item->>'kind' when 'teaching' then 'undervisning' else 'mentor' end
      from public.school_classes g where g.id=(group_item->>'id')::uuid and g.customer_id=parent.customer_id;
    if not found then raise exception 'Group denied' using errcode='42501'; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(payload->'pupilIds','[]'))::uuid loop
    insert into public.mandate_pupils select new_id,p.id,parent.customer_id,p.unit_id from (select pp.pupil_id id,pp.unit_id from public.pupil_placements pp where pp.pupil_id=item and pp.customer_id=parent.customer_id and pp.unit_id=any(unit_ids) and (pp.ends_on is null or pp.ends_on>=public.app_today()) order by (pp.starts_on<=public.app_today()) desc,pp.starts_on,pp.id limit 1) p;
    if not found then raise exception 'Pupil denied' using errcode='42501'; end if;
  end loop;
  for item in select jsonb_array_elements_text(coalesce(payload->'caseIds','[]'))::uuid loop
    insert into public.mandate_cases select new_id,c.id,parent.customer_id,c.unit_id from public.phase3_probe_cases c where c.id=item and c.customer_id=parent.customer_id;
    if not found then raise exception 'Case denied' using errcode='42501'; end if;
  end loop;
  if not public.phase3_mandate_is_valid(new_id,false) then raise exception 'Delegation denied' using errcode='42501'; end if;
  return new_id;
end $$;


-- Existing Worker metadata paths never expose protected names.
create or replace function public.phase3_mandate_options() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; own uuid; fns text[]; result jsonb;
begin
  a:=public.phase3_actor();
  fns:=case a.function
    when 'huvudman' then array['rektor']
    when 'rektor' then array['larare','administrator','elevhalsa','support']
    when 'elevhalsoansvarig' then array['elevhalsa']
    else null end;
  if fns is null then raise exception 'Delegation denied' using errcode='42501'; end if;
  select m.identity_id into own from public.memberships m where m.id=a.membership_id;
  select jsonb_build_object(
    'functions',to_jsonb(fns),
    'recipients',coalesce((select jsonb_agg(jsonb_build_object('membershipId',m.id,
        'displayName',coalesce(nullif(i.display_name,''),'Namngiven personal')) order by i.display_name,m.id)
      from public.memberships m join public.identities i on i.id=m.identity_id
      join public.customers c on c.id=m.customer_id
      where m.customer_id=a.customer_id and m.status='active' and c.closed_at is null
        and m.identity_id is distinct from own),'[]'::jsonb),
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id)
      from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=a.id),'[]'::jsonb),
    -- Grupper, elever och ärenden erbjuds endast rektor, som redan har skolans elevläsning.
    'groups',case when a.function='rektor' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unitId',x.unit_id,
        'label','Grupp '||x.n||' · '||x.name) order by x.name,x.n)
      from (select g.id,g.unit_id,s.name,row_number() over (partition by g.unit_id order by g.id) n
        from public.school_classes g
        join public.mandate_units u on u.assignment_id=a.id and u.unit_id=g.unit_id
        join public.school_units s on s.id=g.unit_id
        where g.customer_id=a.customer_id and g.organizer_id=a.organizer_id) x),'[]'::jsonb) else '[]'::jsonb end,
    'pupils',case when a.function='rektor' then coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'unitId',p.unit_id,
        'label',p.display_name) order by p.display_name,p.id)
      from (select p.id,pp.unit_id,p.customer_id,case when p.protected_identity then p.anonymous_name else p.display_name end display_name from public.pupils p join public.pupil_placements pp on pp.pupil_id=p.id where pp.starts_on<=public.app_today() and (pp.ends_on is null or pp.ends_on>=public.app_today())) p
      where p.customer_id=a.customer_id and public.phase4_scope(a.id,p.id,p.unit_id)),'[]'::jsonb) else '[]'::jsonb end,
    'cases',case when a.function='rektor' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unitId',x.unit_id,
        'label','Ärende '||x.n||' · '||x.display_name) order by x.display_name,x.n)
      from (select c.id,c.unit_id,case when p.protected_identity then p.anonymous_name else p.display_name end display_name,row_number() over (partition by c.pupil_id order by c.id) n
        from public.phase3_probe_cases c join public.pupils p on p.id=c.pupil_id
        where c.customer_id=a.customer_id and public.phase4_scope(a.id,p.id,c.unit_id,c.id)) x),'[]'::jsonb) else '[]'::jsonb end,
    'validFrom',greatest(a.valid_from,public.app_today()),
    'validTo',a.valid_to,
    'serverNow',clock_timestamp()) into result;
  return result;
end $$;

create or replace function public.phase3_probe_scope() returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments; result jsonb;
begin
  a:=public.phase3_actor();
  if a.function not in ('rektor','larare','administrator','elevhalsa','support') then
    raise exception 'Read denied' using errcode='42501'; end if;
  select jsonb_build_object(
    'function',a.function,
    'scopeKind',a.scope_kind,
    'schools',coalesce((select jsonb_agg(jsonb_build_object('id',u.unit_id,'name',s.name) order by s.name,u.unit_id)
      from public.mandate_units u join public.school_units s on s.id=u.unit_id where u.assignment_id=a.id),'[]'::jsonb),
    'groups',case when a.scope_kind='group' then coalesce((select jsonb_agg(jsonb_build_object('id',x.id,'unitId',x.unit_id,
        'label','Grupp '||x.n||' · '||x.name) order by x.name,x.n)
      from (select g.id,g.unit_id,s.name,row_number() over (partition by g.unit_id order by g.id) n
        from public.school_classes g join public.school_units s on s.id=g.unit_id
        where g.customer_id=a.customer_id and g.organizer_id=a.organizer_id
          and g.unit_id in (select u.unit_id from public.mandate_units u where u.assignment_id=a.id)) x
      where exists(select 1 from public.mandate_groups mg where mg.assignment_id=a.id and mg.group_id=x.id)),'[]'::jsonb)
      else '[]'::jsonb end,
    -- Endast egna ärendetilldelningar (ID och skola), inget ärendeinnehåll.
    'cases',case when a.scope_kind='case' then coalesce((select jsonb_agg(jsonb_build_object('id',x.case_id,'unitId',x.unit_id,
        'label','Tilldelat ärende '||x.n) order by x.n)
      from (select mc.case_id,mc.unit_id,row_number() over (order by mc.case_id) n
        from public.mandate_cases mc where mc.assignment_id=a.id) x),'[]'::jsonb) else '[]'::jsonb end,
    'startsAt',a.starts_at,
    'endsAt',a.ends_at,
    'purposeCode',a.purpose_code,
    'approverName',case when a.approved_by_assignment_id is null then null else
      (select coalesce(nullif(i.display_name,''),'Namngiven personal') from public.access_assignments p
        join public.memberships m on m.id=p.membership_id join public.identities i on i.id=m.identity_id
        where p.id=a.approved_by_assignment_id) end,
    'canExport',a.function='administrator',
    'serverNow',clock_timestamp()) into result;
  return result;
end $$;
revoke all on function public.phase3_probe_scope() from public,anon,authenticated;
grant execute on function public.phase3_probe_scope() to skolplattform_worker;

revoke all on function public.phase4_keys(jsonb,text[]) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_year(integer) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_scope(uuid,uuid,uuid,uuid) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_projection(integer,uuid,uuid) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_validate_selection(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_filtered(jsonb,text,uuid) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_list_pupils(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_card_row(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_history_value(text,jsonb,uuid) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_pupil_card(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_pupil_history(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_reveal_personal_number(jsonb) from public,anon,authenticated,skolplattform_worker;
revoke all on function public.phase4_export_pupils(jsonb,boolean) from public,anon,authenticated,skolplattform_worker;

commit;
