-- Actual rollback-only SQL. Setup is source-bound in verify-class-cohort-commands.
create temporary table cohort_command_checks(name text primary key) on commit drop;
create function pg_temp.command_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion: %',label;end if;insert into cohort_command_checks values(label);end $$;
create function pg_temp.command_state() returns jsonb language sql as $$
 select jsonb_build_object('classes',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'')) from public.school_classes c),
 'placements',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'')) from public.pupil_placements c),
 'offerings',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'')) from public.offerings c),
 'plans',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'')) from public.point_plans c),
 'memberships',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'')) from public.pupil_class_memberships c),
 'links',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by unit_id,class_name,start_year)::text,'')) from public.class_timplans c),
 'receipts',(select md5(coalesce(jsonb_agg(to_jsonb(c) order by command_id)::text,'')) from public.class_cohort_commands c),
 'audit',(select count(*) from public.security_events))
$$;
create function pg_temp.command_denied(statement text,code text,hint text,label text) returns void language plpgsql as $$
declare actual_code text;actual_hint text;before jsonb;
begin
 before:=pg_temp.command_state();
 begin execute statement;exception when others then get stacked diagnostics actual_code=returned_sqlstate,actual_hint=pg_exception_hint;end;
 perform pg_temp.command_assert(actual_code=code and (hint is null or actual_hint=hint),label);
 perform pg_temp.command_assert(pg_temp.command_state()=before,label||' has no partial class membership link receipt or audit');
end $$;
create function pg_temp.command_request(o uuid,u uuid,names jsonb) returns jsonb language plpgsql as $$
declare r jsonb;
begin r:=public.phase5_class_cohort_underlag(o,u);return jsonb_build_object('commandId',gen_random_uuid(),'offeringId',o,'unitId',u,
 'expectedEducationRevision',r->'educationRevision','expectedSourceToken',r->'sourceToken','startsOn',r->'educationStartsOn','names',names);end $$;

do $$
declare x jsonb;o uuid;u uuid;r jsonb;q jsonb;reply jsonb;before jsonb;role_name text;f record;ids uuid[];source jsonb;canonical text;v jsonb;
begin
 select value into x from cohort_context;o:=(x->>'earlyOfferingId')::uuid;u:=(x->>'unitId')::uuid;
 foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
  for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_class_cohort_%' loop
   perform pg_temp.command_assert(has_function_privilege(role_name,f.oid,'EXECUTE')=(role_name='skolplattform_worker' and f.proname in('phase5_class_cohort_underlag','phase5_class_cohort_command','phase5_class_cohort_status')),'exact entrypoint ACL '||role_name||' '||f.proname);
  end loop;
  perform pg_temp.command_assert(not has_table_privilege(role_name,'public.class_cohort_commands','SELECT,INSERT,UPDATE,DELETE,TRUNCATE'),'closed receipt table '||role_name);
 end loop;
 perform pg_temp.command_assert((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.class_cohort_commands'::regclass),'receipt RLS forced');
 perform pg_temp.cohort_actor('hm');r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(r->'canManage'='false' and r->'blockers'='[]','HM reads viable early draft without create authority');
 q:=pg_temp.command_request(o,u,'["EARLY-A","EARLY-B"]');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'42501',null,'HM cannot create');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',q),'42501',null,'HM cannot inspect private command status');
 perform pg_temp.cohort_actor('principal');r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(r->'canManage'='true' and r->>'educationStartsOn'=x->>'startedOn','principal can create before approved timplan');
 perform pg_temp.command_assert(not exists(select 1 from public.timplans where offering_id=o),'early education has no timplan');
 perform pg_temp.command_assert(not exists(select 1 from jsonb_array_elements(r->'classes') c where c->>'name'='SECONDARY'),'read uses exact offering school');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_underlag(%L,%L)',x->>'offeringId',x->>'extraUnitId'),'42501',null,'other school in same offering denied');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_underlag(%L,%L)',gen_random_uuid(),u),'42501',null,'unknown offering is denied not empty');
 r:=public.phase5_class_cohort_underlag((x->>'nullCalendarOfferingId')::uuid,u);
 perform pg_temp.command_assert(r->'sourceToken'='null' and r->'educationStartsOn'='null' and r->'firstSchoolYear'='null' and r->'canManage'='false' and jsonb_array_length(r->'blockers')>0 and jsonb_array_length(r->'classes')=1,'unknown calendar blocked while legacy class stays readable');
 -- Independently recompute the canonical token, including every ordered source row.
 select jsonb_build_object('calendarStartYear',edu.start_year,'versions',(select jsonb_agg(jsonb_build_object('id',p.id,'version',p.version,'revision',p.revision,'status',p.status,'catalogId',p.catalog_id,'basisCatalogId',p.basis_reference->>'catalogId','hasBasis',p.basis_reference is not null,'startedOn',p.basis_reference->>'startedOn') order by p.id) from public.point_plans p where p.offering_id=edu.id))::text into canonical from public.offerings edu where edu.id=o;
 perform pg_temp.command_assert(q->>'expectedSourceToken'=encode(sha256(convert_to(canonical,'UTF8')),'hex'),'source token binds exact canonical snapshot');
 before:=pg_temp.command_state();r:=public.phase5_class_cohort_status(q);
 perform pg_temp.command_assert(r->>'status'='not_found' and r->'receipt'='null' and (pg_temp.command_state()-'audit')=(before-'audit'),'not found status creates no business rows');
 foreach v in array array[q||'{"names":["VALID-FIRST","lowercase"]}',q||'{"names":["DUP","DUP"]}',q||'{"names":[]}',q||'{"names":[null]}',q||'{"unexpected":true}',q||'{"expectedEducationRevision":2147483648}',q||'{"startsOn":"2101-07-01"}',q||'{"startsOn":"2027-02-29"}',q||'{"commandId":"00000000-0000-0000-0000-000000000000"}']::jsonb[] loop
  perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',v),'22023',null,'invalid complete request '||md5(v::text));
 end loop;
 reply:=public.phase5_class_cohort_command(q);
 perform pg_temp.command_assert(reply->'replayed'='false' and jsonb_array_length(reply->'classes')=2 and reply->'classes'->0->>'name'='EARLY-A' and reply->'classes'->1->>'name'='EARLY-B','ordered two-class atomic batch');
 perform pg_temp.command_assert((select bool_and(c->>'startsOn'=x->>'startedOn' and c->'endsOn'='null' and c->>'validitySource'='education_start' and (c->>'cohortStartYear')::integer=(x->>'year')::integer) from jsonb_array_elements(reply->'classes') c),'new classes exact source period and origin');
 select array_agg((c->>'id')::uuid) into ids from jsonb_array_elements(reply->'classes') c;
 perform pg_temp.command_assert(cardinality(ids)=2 and ids[1]<>ids[2] and (select count(*)=2 from public.school_classes where id=any(ids)),'batch stable unique IDs stored');
 perform pg_temp.command_assert(not exists(select 1 from public.class_timplans where class_id=any(ids)) and not exists(select 1 from public.pupil_class_memberships where class_id=any(ids)),'empty classes create no plan or pupil membership');
 perform pg_temp.command_assert((select count(*)=2 from public.security_events where action='class_created' and object_id=any(ids) and object_type='class') and (select count(*)=1 from public.security_events where action='class_cohort_created' and object_id=(q->>'commandId')::uuid and object_type='education_command' and details='{}'),'per-class and batch audit contain no class names');
 perform pg_temp.command_assert(public.phase5_class_cohort_command(q)=reply||'{"replayed":true}'::jsonb,'exact command retry returns same class IDs');
 r:=public.phase5_class_cohort_status(q);perform pg_temp.command_assert(r->>'status'='found' and r->'receipt'=reply||'{"replayed":true}'::jsonb,'status returns complete request-bound replay receipt');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||'{"names":["OTHER"]}'),'40001',null,'same command changed batch conflicts');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',q||jsonb_build_object('expectedSourceToken',repeat('b',64))),'40001',null,'same command changed token status conflicts');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('commandId',gen_random_uuid())),'40001','class_name_year_conflict','new command same name and year conflicts');
 perform pg_temp.cohort_actor('admin');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'40001',null,'different authorized actor cannot replay');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',q),'40001',null,'different authorized actor cannot read receipt');
 r:=public.phase5_class_cohort_command(pg_temp.command_request(o,u,'["ADMIN-EARLY"]'));
 perform pg_temp.command_assert(r->'classes'->0->>'name'='ADMIN-EARLY','administrator can create early class');
 perform pg_temp.cohort_actor('principal');
 perform pg_temp.command_denied(format('update public.class_cohort_commands set reply=reply where command_id=%L',q->>'commandId'),'42501',null,'receipt update forbidden');
 perform pg_temp.command_denied(format('delete from public.class_cohort_commands where command_id=%L',q->>'commandId'),'42501',null,'receipt delete forbidden');
 perform pg_temp.command_denied('truncate public.class_cohort_commands','42501',null,'receipt truncate forbidden');
 update public.point_plans set revision=revision+1 where id=(x->>'draftPlanId')::uuid;
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('commandId',gen_random_uuid(),'names','["STALE"]'::jsonb)),'40001',null,'new create stale source revision fails');
 perform pg_temp.command_assert(public.phase5_class_cohort_command(q)=reply||'{"replayed":true}'::jsonb and public.phase5_class_cohort_status(q)->'receipt'=reply||'{"replayed":true}'::jsonb,'source revision change does not invalidate own receipt');
 update public.offerings set archived_at=clock_timestamp(),lifecycle_revision=lifecycle_revision+1 where id=o;
 r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(r->'canManage'='false' and jsonb_array_length(r->'classes')>=3 and r->>'sourceToken' is not null,'archive blocks new creation but preserves readable class list');
 perform pg_temp.command_assert(public.phase5_class_cohort_status(q)->'receipt'=reply||'{"replayed":true}'::jsonb,'archive and lifecycle change do not invalidate own receipt');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('commandId',gen_random_uuid(),'names','["ARCHIVED"]'::jsonb)),'40001','class_plan_not_ready','archived new create denied');
 update public.offerings set archived_at=null,lifecycle_revision=lifecycle_revision+1 where id=o;
 -- Live session and exact mandate are checked even for already-successful requests.
 update public.app_sessions set revoked_at=clock_timestamp() where id=(x->>'sessionId')::uuid;
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',q),'42501',null,'revoked session cannot inspect receipt');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'42501',null,'revoked session cannot replay');
 update public.app_sessions set revoked_at=null where id=(x->>'sessionId')::uuid;
 delete from public.mandate_units where assignment_id=public.current_assignment_id() and unit_id=u;
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',q),'42501',null,'removed school mandate cannot inspect receipt');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'42501',null,'removed school mandate cannot replay');
 insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(public.current_assignment_id(),(x->>'customerId')::uuid,(x->>'organizerId')::uuid,u);
 update cohort_context set value=value||jsonb_build_object('batchRequest',q,'batchReply',reply);
end $$;

-- Inject a failure on the second per-class audit; the entire first class and
-- its audit must disappear with the second, and no immutable receipt is saved.
create function pg_temp.fail_cohort_audit() returns trigger language plpgsql as $$
begin if new.action='class_created' and exists(select 1 from public.school_classes where id=new.object_id and name='AUDIT-SECOND') then raise exception 'Synthetic audit unavailable';end if;return new;end $$;
create trigger cohort_audit_failure before insert on public.security_events for each row execute function pg_temp.fail_cohort_audit();
do $$declare x jsonb;q jsonb;begin select value into x from cohort_context;
 q:=pg_temp.command_request((x->>'earlyOfferingId')::uuid,(x->>'unitId')::uuid,'["AUDIT-FIRST","AUDIT-SECOND"]');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'55000',null,'second class audit failure rolls back entire batch');
end $$;
drop trigger cohort_audit_failure on public.security_events;

-- A real second education in the same school/year, plus a genuine foreign
-- customer fixture, avoid proving scope/uniqueness only with nonexistent IDs.
do $$
declare x jsonb;u uuid;o uuid:=gen_random_uuid();foreign_customer uuid:=gen_random_uuid();foreign_org uuid:=gen_random_uuid();foreign_school uuid:=gen_random_uuid();foreign_offering uuid:=gen_random_uuid();p public.point_plans;r jsonb;q jsonb;old_q jsonb;before jsonb;new_assignment uuid;old_assignment uuid;member uuid;names jsonb;
begin
 select value into x from cohort_context;u:=(x->>'unitId')::uuid;old_q:=x->'batchRequest';
 select * into p from public.point_plans where id=(x->>'programId')::uuid;
 perform pg_temp.cohort_actor('hm');
 insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
 values(o,p.organizer_id,u,'gymnasium','Syntetisk parallell utbildning','Syntetisk',p.basis_reference->'programRef'->>'code',p.basis_reference->>'orientationCode',extract(year from (x->>'startedOn')::date));
 r:=public.phase5_create_programplan_draft(o,0,p.basis_reference);
 perform pg_temp.cohort_actor('principal');perform public.phase5_write_programplan_terms((r->>'id')::uuid,0,p.term_distribution);
 perform pg_temp.cohort_decision((r->>'id')::uuid,'submit');perform pg_temp.cohort_actor('hm');perform pg_temp.cohort_decision((r->>'id')::uuid,'approve');
 perform pg_temp.cohort_actor('principal');r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(r->'classes'='[]' and r->'canManage'='true','real authorized education can have empty class list');
 q:=pg_temp.command_request(o,u,'["OTHER-EDUCATION"]');r:=public.phase5_class_cohort_command(q);
 perform pg_temp.command_assert(r->'classes'->0->>'name'='OTHER-EDUCATION','two educations same year accept different names');
 q:=pg_temp.command_request(o,u,'["EARLY-A"]');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'40001','class_name_year_conflict','same school name year conflicts across education IDs');
 before:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.cohort_actor('hm');
 select * into p from public.point_plans where offering_id=o order by version desc limit 1;
 r:=public.phase5_clone_programplan_draft(p.id,p.revision,p.version,null);
 perform pg_temp.cohort_actor('principal');r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(r->'classes'=before->'classes' and r->>'sourceToken'<>before->>'sourceToken','same-date new version retains stable class structure and changes token');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('names','["OLD-VERSION"]'::jsonb)),'40001',null,'old version snapshot cannot create new batch');
 select jsonb_agg('TWENTY-'||g::text order by g) into names from generate_series(1,20) g;
 q:=pg_temp.command_request(o,u,names);r:=public.phase5_class_cohort_command(q);
 perform pg_temp.command_assert(jsonb_array_length(r->'classes')=20,'maximum batch of twenty classes succeeds');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('commandId',gen_random_uuid(),'names',names||'"TWENTY-21"'::jsonb)),'22023',null,'twenty-one names rejected');
 -- Capacity is per exact school+education, before any batch INSERT.
 insert into public.school_classes(customer_id,organizer_id,unit_id,offering_id,name,start_year)
 select (x->>'customerId')::uuid,(x->>'organizerId')::uuid,u,o,'CAPACITY-'||g::text,(x->>'year')::integer
 from generate_series(1,1999-(select count(*)::integer from public.school_classes where offering_id=o and unit_id=u)) g;
 q:=pg_temp.command_request(o,u,'["LAST-A","LAST-B"]');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'40001',null,'batch crossing two-thousand capacity is wholly denied');
 q:=q||jsonb_build_object('commandId',gen_random_uuid(),'names','["LAST-A"]'::jsonb);r:=public.phase5_class_cohort_command(q);
 r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(jsonb_array_length(r->'classes')=2000 and r->'canManage'='false' and jsonb_array_length(r->'blockers')>0,'exactly two thousand classes remains readable and blocks creation');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('commandId',gen_random_uuid(),'names','["FULL"]'::jsonb)),'40001',null,'full education refuses another class');
 q:=pg_temp.command_request((x->>'earlyOfferingId')::uuid,u,'["LIFECYCLE-STALE"]');
 update public.offerings set lifecycle_revision=lifecycle_revision+1 where id=(x->>'earlyOfferingId')::uuid;
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'40001',null,'lifecycle revision alone invalidates new create');
 perform pg_temp.command_assert(public.phase5_class_cohort_status(old_q)->'receipt'=(x->'batchReply')||'{"replayed":true}'::jsonb,'lifecycle change alone preserves successful receipt');
 -- Current identity can hold a new valid assignment but cannot adopt an old receipt.
 old_assignment:=public.current_assignment_id();select membership_id into member from public.access_assignments where id=old_assignment;
 perform pg_temp.cohort_actor('hm');new_assignment:=public.phase3_grant_mandate(jsonb_build_object('membershipId',member,'function','rektor','scopeKind','school','unitIds',jsonb_build_array(u)));
 perform pg_temp.cohort_actor('principal');
 update public.app_sessions set assignment_id=new_assignment where id=(x->>'sessionId')::uuid;
 perform set_config('app.assignment_id',new_assignment::text,true);
 perform pg_temp.command_assert((public.phase5_class_cohort_underlag((x->>'earlyOfferingId')::uuid,u)->'canManage')='true','replacement assignment has live school authority');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',old_q),'40001',null,'same identity new assignment cannot adopt receipt');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',old_q),'40001',null,'same identity new assignment cannot replay receipt');
 update public.app_sessions set assignment_id=old_assignment where id=(x->>'sessionId')::uuid;perform set_config('app.assignment_id',old_assignment::text,true);
 insert into public.customers(id,name) values(foreign_customer,'Syntetisk annan klasskund');
 insert into public.organizers(id,customer_id,name,type) values(foreign_org,foreign_customer,'Syntetisk annan huvudman','Kommun');
 insert into public.school_units(id,organizer_id,code,name,municipality_code) values(foreign_school,foreign_org,'55009999','Syntetisk annan skola','0000');
 insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values(foreign_offering,foreign_org,foreign_school,'gymnasium','Syntetisk främmande utbildning','Syntetisk','SA25','SABEP');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_underlag(%L,%L)',foreign_offering,foreign_school),'42501',null,'actual foreign customer read denied');
 q:=old_q||jsonb_build_object('offeringId',foreign_offering,'unitId',foreign_school);
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'42501',null,'actual foreign customer command denied before receipt');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_status(%L)',q),'42501',null,'actual foreign customer status denied before receipt');
end $$;

do $$
declare x jsonb;p public.point_plans;o uuid:=gen_random_uuid();u uuid;r jsonb;q jsonb;
begin
 select value into x from cohort_context;u:=(x->>'unitId')::uuid;
 select * into p from public.point_plans where id=(x->>'programId')::uuid;
 perform pg_temp.cohort_actor('hm');
 insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
 values(o,p.organizer_id,u,'gymnasium','Syntetisk senare läsbar kull','Syntetisk',p.basis_reference->'programRef'->>'code',p.basis_reference->>'orientationCode',2102);
 perform public.phase5_create_programplan_draft(o,0,p.basis_reference||'{"startedOn":"2102-08-17"}'::jsonb);
 perform pg_temp.cohort_actor('principal');r:=public.phase5_class_cohort_underlag(o,u);
 perform pg_temp.command_assert(r->>'educationStartsOn'='2102-08-17' and r->'firstSchoolYear'='2102' and r->>'sourceToken' is not null and r->'canManage'='false' and jsonb_array_length(r->'blockers')>0,'known source outside write years remains readable and blocked');
 q:=pg_temp.command_request(o,u,'["OUTSIDE-YEAR"]');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'22023',null,'outside-write-year create request denied');
 q:=pg_temp.command_request((x->>'earlyOfferingId')::uuid,u,'["WRONG-DATE"]');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q||jsonb_build_object('startsOn',((q->>'startsOn')::date+1)::text)),'40001',null,'valid date different from locked education source denied');
 q:=q||jsonb_build_object('offeringId',x->>'nullCalendarOfferingId');
 perform pg_temp.command_denied(format('select public.phase5_class_cohort_command(%L)',q),'40001','class_plan_not_ready','unknown source cannot accept a fabricated token and date');
 update cohort_context set value=value||jsonb_build_object('outsideYearOfferingId',o);
end $$;
