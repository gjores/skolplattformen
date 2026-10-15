-- Transaktionsfria assertions; runner owns rollback, source closure and fixtures.
-- No grants or trigger disabling; direct legacy-format setup uses own rows only.
create temporary table link_identity_checks(name text primary key) on commit drop;
create function pg_temp.link_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion: %',label;end if;
 insert into link_identity_checks values(label);end $$;
create function pg_temp.link_snapshot() returns jsonb language sql as $$
 select jsonb_build_object(
 'classes',(select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.id),'')) from public.school_classes c),
 'links',(select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.unit_id,c.class_name,c.start_year),'')) from public.class_timplans c),
 'receipts',(select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.command_id),'')) from public.class_plan_commands c),
 'pupils',(select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.id),'')) from public.pupils c),
 'placements',(select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.id),'')) from public.pupil_placements c),
 'memberships',(select md5(coalesce(string_agg(to_jsonb(c)::text,'' order by c.id),'')) from public.pupil_class_memberships c))
$$;
create function pg_temp.link_denied(statement text,code text,hint text,label text) returns void language plpgsql as $$
declare actual_code text;actual_hint text;before_rows jsonb;
begin
 before_rows:=pg_temp.link_snapshot();
 begin execute statement;exception when others then get stacked diagnostics actual_code=returned_sqlstate,actual_hint=pg_exception_hint;end;
 perform pg_temp.link_assert(actual_code=code and (hint is null or actual_hint=hint),label);
 perform pg_temp.link_assert(before_rows=pg_temp.link_snapshot(),label||' preserves classes links receipts pupils placements memberships');
end $$;
create function pg_temp.link_create(plan uuid,name text) returns uuid language plpgsql as $$
declare p public.timplans;r jsonb;
begin
 select * into p from public.timplans where id=plan;
 r:=public.phase5_class_command(jsonb_build_object('operation','create','commandId',gen_random_uuid(),'planId',p.id,
  'expectedPlanRevision',p.revision,'name',name,'startYear',public.phase5_class_start_year(p)));
 return (r->>'id')::uuid;
end $$;
create function pg_temp.link_request(plan uuid,target_class uuid,school_year integer,expected integer default null,previous uuid default null) returns jsonb language sql as $$
 select jsonb_build_object('operation','link','commandId',gen_random_uuid(),'classId',target_class,'schoolYear',school_year,'planId',p.id,
  'expectedPlanRevision',p.revision,'columnId','ar'||(school_year-public.phase5_class_start_year(p)+1)::text,
  'expectedLinkRevision',expected,'previousPlanId',previous) from public.timplans p where p.id=plan
$$;
create function pg_temp.link_decision(plan uuid,action text) returns jsonb language plpgsql as $$
declare b jsonb;d jsonb;
begin
 b:=public.phase5_plan_decision_basis('timplan',plan);d:=coalesce(b->'detail',b);
 return public.phase5_plan_decision_command(jsonb_build_object('kind','timplan','planId',plan,'commandId',gen_random_uuid(),
  'action',action,'expectedRevision',d->'revision','expectedDecisionRevision',d->'decisionRevision','basisHash',d->'basisHash','comment','',
  'confirmedChecks',(select jsonb_agg(v->'id') from jsonb_array_elements(d->'checks') v)));
end $$;

do $$
declare x jsonb;p1 uuid;p2 uuid;y integer;c1 uuid;c2 uuid;c3 uuid;q jsonb;r jsonb;before_rows jsonb;old_class public.school_classes;
begin
 select value into x from cohort_context;p1:=(x->>'planId')::uuid;p2:=(x#>>'{second,planId}')::uuid;y:=(x->>'year')::integer;
 perform pg_temp.cohort_actor('principal');
 before_rows:=pg_temp.link_snapshot();
 r:=public.phase5_class_command(x->'priorRequest');
 perform pg_temp.link_assert(r=(x->'priorReply')||'{"replayed":true}'::jsonb,'historical link receipt replays exact previous reply');
 perform pg_temp.link_assert(before_rows=pg_temp.link_snapshot(),'receipt replay does not rewrite historical rows or validity');
 select * into old_class from public.school_classes where id=(x->>'legacyClassId')::uuid;
 r:=public.phase5_class_underlag(p1,y);
 perform pg_temp.link_assert(exists(select 1 from jsonb_array_elements(r->'classes') c where c->>'id'=old_class.id::text
  and c->'link'->>'planId'=p1::text),'identified read resolves class ID despite historical name mismatch');
 perform pg_temp.link_assert(old_class.starts_on is null and old_class.created_at is null,'identified legacy validity remains unknown');
 c1:=pg_temp.link_create(p1,'SHARED');c2:=pg_temp.link_create(p2,'SHARED');
 perform pg_temp.link_assert(c1<>c2,'same class name different cohort has different stable ID');
 q:=pg_temp.link_request(p1,c1,y+1);perform public.phase5_class_command(q);
 r:=public.phase5_class_underlag(p2,y+1);
 perform pg_temp.link_assert(exists(select 1 from jsonb_array_elements(r->'classes') c where c->>'id'=c2::text and c->'link'='null'),'identified link from another cohort is never borrowed by name');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(p2,c2,y+1)::text),
  '40001','class_name_year_conflict','overlapping name school year rejects second class');
 c3:=pg_temp.link_create(p2,'DIFFERENT');perform public.phase5_class_command(pg_temp.link_request(p2,c3,y+1));
 perform pg_temp.link_assert(exists(select 1 from public.class_timplans where class_id=c3 and start_year=y+1),'different class name shares same school year successfully');
 perform public.phase5_class_command(pg_temp.link_request(p2,c2,y+3));
 perform pg_temp.link_assert(exists(select 1 from public.class_timplans where class_id=c2 and start_year=y+3),'same name allowed for nonoverlapping application year');
 perform public.phase5_class_command(pg_temp.link_request(p1,c1,y+2));
 update cohort_context set value=value||jsonb_build_object('sharedClassId',c1,'secondSharedId',c2,'differentClassId',c3);
end $$;

do $$
declare x jsonb;p1 uuid;p2 uuid;y integer;c1 uuid;c2 uuid;ambiguous uuid;q jsonb;r jsonb;before_rows jsonb;
begin
 select value into x from cohort_context;p1:=(x->>'planId')::uuid;p2:=(x#>>'{second,planId}')::uuid;y:=(x->>'year')::integer;
 -- An old name link from a different offering must not become the new class's link.
 c1:=pg_temp.link_create(p1,'FOREIGN-LEGACY');c2:=pg_temp.link_create(p2,'FOREIGN-LEGACY');
 insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
 select unit_id,'FOREIGN-LEGACY',y+1,p1,'ar2' from public.timplans where id=p1;
 r:=public.phase5_class_underlag(p2,y+1);
 perform pg_temp.link_assert(exists(select 1 from jsonb_array_elements(r->'classes') c where c->>'id'=c2::text and c->'link'='null'),'foreign offering legacy link is absent from selected class');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(p2,c2,y+1,0,p1)::text),
  '40001','class_name_year_conflict','foreign offering legacy adoption rejected even with exact previous plan');
 -- Correct legacy adoption is explicit and revision checked.
 c1:=pg_temp.link_create(p1,'ADOPT');
 insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
 select unit_id,'ADOPT',y,p1,'ar1' from public.timplans where id=p1;
 r:=public.phase5_class_underlag(p1,y);
 perform pg_temp.link_assert(exists(select 1 from jsonb_array_elements(r->'classes') c where c->>'id'=c1::text and c->'link'->>'legacy'='true'),'same offering unambiguous legacy candidate remains visible');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(p1,c1,y)::text),'40001',null,'legacy adoption cannot omit exact previous revision');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(p1,c1,y,99,p1)::text),'40001',null,'legacy adoption rejects changed revision');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(p1,c1,y,0,p2)::text),'40001',null,'legacy adoption rejects wrong previous plan');
 before_rows:=pg_temp.link_snapshot();q:=pg_temp.link_request(p1,c1,y,0,p1);r:=public.phase5_class_command(q);
 perform pg_temp.link_assert((r->>'revision')::integer=1 and (select class_id=c1 from public.class_timplans where timplan_id=p1 and class_name='ADOPT' and start_year=y),'explicit legacy adoption writes exact chosen ID once');
 perform pg_temp.link_assert((before_rows-'links'-'receipts')=(pg_temp.link_snapshot()-'links'-'receipts'),'adoption preserves class validity pupils placements memberships');
 perform pg_temp.link_assert((public.phase5_class_command(q)->>'replayed')::boolean,'legacy adoption receipt replays without second adoption');
 select id into ambiguous from public.school_classes where offering_id=(x->>'offeringId')::uuid and name='AMBIGUOUS' and start_year=y;
 insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id)
 select unit_id,'AMBIGUOUS',y,p1,'ar1' from public.timplans where id=p1;
 r:=public.phase5_class_underlag(p1,y);
 perform pg_temp.link_assert(not exists(select 1 from jsonb_array_elements(r->'classes') c where c->>'name'='AMBIGUOUS' and c->'link'<>'null'),'ambiguous historical classes are not inferred from legacy name');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(p1,ambiguous,y,0,p1)::text),
  '40001','class_name_year_conflict','ambiguous legacy adoption rejected');
end $$;

-- Known ends are not editable in this package. Probe the actual closed date
-- predicate, including inclusive boundaries, without fabricating stored dates.
do $$declare x jsonb;c public.school_classes;y integer;begin
 select value into x from cohort_context;y:=(x->>'year')::integer;
 select * into c from public.school_classes where id=(x->>'sharedClassId')::uuid;
 perform pg_temp.link_assert(public.phase5_class_cohort_year_fits(c,y),'stored class start overlaps first school year');
 c.starts_on:=make_date(y+1,6,30);c.ends_on:=null;
 perform pg_temp.link_assert(public.phase5_class_cohort_year_fits(c,y),'June30 validity start overlaps inclusive school year end');
 c.starts_on:=make_date(y+1,7,1);
 perform pg_temp.link_assert(not public.phase5_class_cohort_year_fits(c,y),'July1 validity start cannot overlap previous school year');
 c.starts_on:=make_date(y-1,8,1);c.ends_on:=make_date(y,7,1);
 perform pg_temp.link_assert(public.phase5_class_cohort_year_fits(c,y),'July1 validity end overlaps inclusive school year start');
 c.ends_on:=make_date(y,6,30);
 perform pg_temp.link_assert(not public.phase5_class_cohort_year_fits(c,y),'June30 validity end does not overlap later school year');
 c.starts_on:=null;c.ends_on:=null;
 perform pg_temp.link_assert(public.phase5_class_cohort_year_fits(c,y),'unknown legacy validity imposes no invented date');
end $$;

do $$
declare x jsonb;p public.timplans;pp public.point_plans;o public.offerings;g jsonb;new_plan uuid;q jsonb;r jsonb;y integer;before_rows jsonb;links jsonb;c uuid;
begin
 select value into x from cohort_context;y:=(x->>'year')::integer;c:=(x->>'sharedClassId')::uuid;
 select * into p from public.timplans where id=(x->>'planId')::uuid;
 select * into pp from public.point_plans where id=p.source_programplan_id;
 select * into o from public.offerings where id=p.offering_id;
 before_rows:=pg_temp.link_snapshot();
 g:=public.phase5_create_gym_timplan(gen_random_uuid(),pp.id,pp.revision,o.lifecycle_revision,p.unit_id,p.id,p.revision);new_plan:=(g->'reply'->>'id')::uuid;
 perform pg_temp.link_decision(new_plan,'submit');perform pg_temp.cohort_actor('hm');perform pg_temp.link_decision(new_plan,'approve');perform pg_temp.cohort_actor('principal');
 perform pg_temp.link_assert(before_rows=pg_temp.link_snapshot(),'new approved version preserves every class link receipt and membership');
 r:=public.phase5_class_command(x->'priorRequest');
 perform pg_temp.link_assert(r=(x->'priorReply')||'{"replayed":true}'::jsonb,'historical receipt works after replacement approval');
 q:=pg_temp.link_request(new_plan,c,y+1,0,p.id);perform public.phase5_class_command(q);
 perform pg_temp.link_assert(exists(select 1 from public.class_timplans where class_id=c and start_year=y+1 and timplan_id=new_plan and revision=1)
  and exists(select 1 from public.class_timplans where class_id=c and start_year=y+2 and timplan_id=p.id and revision=0),'ID first replacement changes only requested application year');
 perform pg_temp.link_assert((before_rows-'links'-'receipts')=(pg_temp.link_snapshot()-'links'-'receipts'),'version switch preserves class IDs validity pupils placements memberships');
 perform pg_temp.link_denied(format('select public.phase5_class_command(%L::jsonb)',pg_temp.link_request(new_plan,c,y+1,0,p.id)::text),'40001',null,'stale identified link revision cannot overwrite winner');
 update cohort_context set value=value||jsonb_build_object('replacementPlanId',new_plan);
end $$;

-- Exact historical adapter row shape, no ID, operates only as an own synthetic
-- migration-role fixture here. Protected browser roles intentionally stay closed.
do $$
declare x jsonb;p public.timplans;before_rows jsonb;r record;role_name text;actual_code text;statement text;count_before integer;
begin
 select value into x from cohort_context;select * into p from public.timplans where id=(x->>'replacementPlanId')::uuid;
 before_rows:=pg_temp.link_snapshot();
 insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(p.unit_id,'DEMO-LEGACY',public.phase5_class_start_year(p),p.id,'ar1');
 insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(p.unit_id,'DEMO-LEGACY',public.phase5_class_start_year(p),p.id,'ar1')
 on conflict(unit_id,class_name,start_year) do update set timplan_id=excluded.timplan_id,column_id=excluded.column_id;
 perform pg_temp.link_assert(exists(select 1 from public.class_timplans where unit_id=p.unit_id and class_name='DEMO-LEGACY' and class_id is null),'legacy adapter row shape reads and upserts without inventing class ID');
 delete from public.class_timplans where unit_id=p.unit_id and class_name='DEMO-LEGACY' and start_year=public.phase5_class_start_year(p);
 perform pg_temp.link_assert(before_rows=pg_temp.link_snapshot(),'legacy own-row deletion leaves all identified relations unchanged');
 foreach role_name in array array['anon','authenticated','skolplattform_worker'] loop
  foreach statement in array array[
   'select * from public.class_timplans',
   format('delete from public.class_timplans where class_id=%L',x->>'sharedClassId'),
   format('insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(%L,''DENIED'',%s,%L,''ar1'')',p.unit_id,public.phase5_class_start_year(p),p.id)] loop
   actual_code:=null;
   begin
    execute format('set local role %I',role_name);execute statement;
   exception when others then get stacked diagnostics actual_code=returned_sqlstate;
   end;
   reset role;
   perform pg_temp.link_assert(actual_code='42501','protected direct adapter denied '||role_name||' '||split_part(statement,' ',1));
  end loop;
 end loop;
 perform pg_temp.link_assert(before_rows=pg_temp.link_snapshot(),'all role denials preserve identified data and membership');
 for r in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname in ('phase5_class_cohort_year_fits','phase5_class_legacy_matches') loop
  foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
   perform pg_temp.link_assert(not has_function_privilege(role_name,r.oid,'execute'),'private link helper '||r.proname||' '||role_name);
  end loop;
 end loop;
end $$;

-- The old upsert payload cannot silently turn an identified row back into a
-- name-only link, even if invoked through an otherwise privileged data path.
do $$
declare x jsonb;p public.timplans;l public.class_timplans;other_plan uuid;y integer;
begin
 select value into x from cohort_context;y:=(x->>'year')::integer;
 select * into p from public.timplans where id=(x->>'replacementPlanId')::uuid;
 select * into l from public.class_timplans where class_id=(x->>'sharedClassId')::uuid and start_year=y+1;
 perform pg_temp.link_denied(format(
  'insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(%L,%L,%s,%L,%L) on conflict(unit_id,class_name,start_year) do update set timplan_id=excluded.timplan_id,column_id=excluded.column_id',
  l.unit_id,l.class_name,l.start_year,p.id,l.column_id),'40001',null,'legacy upsert cannot overwrite identified link without revision');
 perform pg_temp.link_denied(format('update public.class_timplans set class_id=null where unit_id=%L and class_name=%L and start_year=%s',
  l.unit_id,l.class_name,l.start_year),'42501',null,'identified link cannot be detached to legacy through direct update');
 other_plan:=(x#>>'{second,planId}')::uuid;
 perform pg_temp.link_denied(format('update public.class_timplans set class_id=%L,timplan_id=%L,column_id=''ar1'',revision=revision+1 where unit_id=%L and class_name=%L and start_year=%s',
  x->>'secondSharedId',other_plan,l.unit_id,l.class_name,l.start_year),'40001',null,'direct update cannot transfer stable identity to another cohort');
 perform pg_temp.link_assert(exists(select 1 from public.class_timplans where class_id=l.class_id and start_year=l.start_year and timplan_id=p.id and revision=l.revision),
  'all alternative legacy writes retain exact identified winner');
end $$;
