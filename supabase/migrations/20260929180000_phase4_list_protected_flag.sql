begin;
-- 04-24. Elevlistan anger skyddade elever, men bara för den som får se dem.
-- En administratör med huvudmannens skyddsbehörighet på skolan (D-17) får
-- protectedIdentity:true på skyddade rader och body.protectedIds med de skyddade
-- elev-ID:na i hela det filtrerade urvalet, så att exporten kan ta med dem efter
-- uttryckligt val (D-15). Varje sådant ID har en egen skyddsreferens i auditRefs,
-- som därför bildas ur hela urvalet i stället för bara sidan.
-- Alla som saknar skyddsbehörighet (administratör utan beslut, lärare, elevhälsa,
-- support) får oförändrat svar: ingen flagga, ingen protectedIds och inga
-- skyddsreferenser (D-19). Endast phase4_list_pupils(jsonb) ändras.
create or replace function public.phase4_list_pupils(request jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
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
 'educations',coalesce((select jsonb_agg(jsonb_build_object('id',o.id,'name',o.name,'unitId',o.unit_id,'startYear',o.start_year)order by o.name,o.id) from public.offerings o where o.unit_id=(s->>'unitId')::uuid and o.organizer_id=a.organizer_id),'[]'),
 'grades',coalesce((select jsonb_agg(g order by g) from(select distinct (s->>'schoolYear')::integer-o.start_year+1 g from public.offerings o where o.unit_id=(s->>'unitId')::uuid and o.start_year is not null)x),'[]'),
 'statuses',jsonb_build_array('aktuell','framtida','avslutad')) into options;
 return jsonb_build_object('kind','success','body',jsonb_build_object('pupils',rows,'scope',scope,'options',options,'count',total,'page',page_number,'pageSize',50,
 'capabilities',jsonb_build_object('canEdit',a.function='administrator','canExport',a.function='administrator','canRevealPersonalNumber',a.function='administrator','canReadHistory',a.function='administrator','canReadProtected',a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid)))
 ||case when a.function='administrator' and public.phase4_has_protected_permission(a.id,(s->>'unitId')::uuid) then jsonb_build_object('protectedIds',protected_ids) else '{}'::jsonb end,
 'auditRefs',refs);
end$$;

revoke all on function public.phase4_list_pupils(jsonb) from public,anon,authenticated;
grant execute on function public.phase4_list_pupils(jsonb) to skolplattform_worker;
commit;
