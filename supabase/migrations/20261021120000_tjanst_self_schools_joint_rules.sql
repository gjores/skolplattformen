-- 05.1-11 (gap, ny framåtmigration efter de sju installerade 05.1-migrationerna): Egen tjänst på flera skolor (CR-01).
-- Varje person och konto (medlemskap) har fortfarande en aktiv bindning. Ny tabell tjanst_self_mandates kopplar varje
-- self-mandat uttryckligen till en bindning. Ett nytt self-mandat för samma par person–konto kopplas till den befintliga
-- bindningen i stället för att avsluta den. Skolorna i Egen tjänst hämtas ur alla giltiga self-mandat som är kopplade
-- till kontots aktiva bindning, inte bara ur bindningens första mandat. Inga befintliga rader ändras; ifyllnaden lägger
-- till en kopplingsrad per befintligt self-mandat och reparerar mandat vars bindning avslutades av samma par.
-- SS 12000:2024 utg. 4 / OpenAPI 2.1.0 (avsedd kompatibilitet, inget verifierat utbyte): mandat, bindning och koppling
-- är behörighetsstyrning utanför standarden. Rättelsen gör att en Person (stabilt staff_people.id) med Duty på flera
-- Organisationer (staff_school_duties per skola, dutyPercent) ser sin publicerade tjänst per skola. Ingen mappning ändras.
-- Alla nya funktioner och tabellen är stängda; create or replace behåller ägare och rättigheter, inga nya entrypoints.

-- 1. Kopplingen mandat → bindning. Oföränderlig: rader läggs bara till, i samma transaktion som mandatet.
create table public.tjanst_self_mandates (
 access_assignment_id uuid primary key,
 binding_id uuid not null references public.staff_person_bindings(id),
 customer_id uuid not null,
 organizer_id uuid not null,
 linked_by_assignment_id uuid not null,
 linked_at timestamptz not null,
 foreign key(access_assignment_id,customer_id,organizer_id) references public.access_assignments(id,customer_id,organizer_id),
 foreign key(linked_by_assignment_id,customer_id) references public.access_assignments(id,customer_id)
);
create index tjanst_self_mandates_binding_idx on public.tjanst_self_mandates(binding_id);
alter table public.tjanst_self_mandates enable row level security;
alter table public.tjanst_self_mandates force row level security;
revoke all on public.tjanst_self_mandates from public,anon,authenticated,service_role,skolplattform_worker;

create function public.tjanst_self_mandates_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 raise exception 'Kopplingen mellan mandat och personbindning är oföränderlig.' using errcode='42501';
end $$;
create trigger tjanst_self_mandates_immutable before update or delete on public.tjanst_self_mandates for each row execute function public.tjanst_self_mandates_guard();
create trigger tjanst_self_mandates_no_truncate before truncate on public.tjanst_self_mandates for each statement execute function public.tjanst_self_mandates_guard();

-- 2. Ifyllnad: en rad per befintligt self-mandat. Mandatet kopplas till sin egen bindningsrad, utom när den raden är
-- avslutad och samma person, medlemskap och huvudman har en aktiv bindning; då kopplas det till den (reparation av CR-01).
-- Mandat vars bindning avslutades av ett annat par kopplas inte om. Saknar ett self-mandat en entydig bindningsrad avbryts migrationen.
do $$
declare broken integer;linked integer;repaired integer;
begin
 select count(*) into broken from public.access_assignments a where a.scope_kind='self'
  and (select count(*) from public.staff_person_bindings b where b.access_assignment_id=a.id)<>1;
 if broken>0 then
  raise exception 'Ifyllnaden av tjanst_self_mandates avbryts: % self-mandat saknar exakt en rad i staff_person_bindings.',broken using errcode='23514';end if;
 insert into public.tjanst_self_mandates(access_assignment_id,binding_id,customer_id,organizer_id,linked_by_assignment_id,linked_at)
 select a.id,coalesce(act.id,own.id),a.customer_id,a.organizer_id,own.bound_by_assignment_id,own.bound_at
 from public.access_assignments a join public.staff_person_bindings own on own.access_assignment_id=a.id
 left join public.staff_person_bindings act on own.ended_at is not null and act.ended_at is null
  and act.staff_person_id=own.staff_person_id and act.membership_id=own.membership_id and act.organizer_id=own.organizer_id
 where a.scope_kind='self';
 get diagnostics linked=row_count;
 select count(*) into repaired from public.tjanst_self_mandates l join public.staff_person_bindings own on own.access_assignment_id=l.access_assignment_id
 where l.binding_id<>own.id;
 raise notice 'tjanst_self_mandates: % kopplingar ifyllda, varav % reparerade till parets aktiva bindning.',linked,repaired;
end $$;

-- 3. Bindningen. Signatur, returtyp och prövningarna av mandat, person och skoluppdrag är oförändrade (20261020110000).
-- Samma par person–medlemskap: bindningen behålls och mandatet kopplas till den. Ett annat par nekas så länge något mandat
-- som är kopplat till dess bindning gäller eller ännu inte har börjat; annars avslutas den bindningen som förut.
-- En ny bindning skapas bara när paret saknar aktiv bindning. Kopplingen och audit skrivs i samma transaktion som mandatet.
create or replace function public.phase51_bind_self_person(parent public.access_assignments,recipient_id uuid,mandate_id uuid,person_id uuid,unit_ids uuid[]) returns uuid
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare m public.access_assignments;person public.staff_people;b public.staff_person_bindings;u uuid;binding_id uuid;now_at timestamptz:=clock_timestamp();
begin
 select * into m from public.access_assignments where id=mandate_id;
 if not found or m.function<>'larare' or m.scope_kind<>'self' or m.membership_id<>recipient_id or m.parent_assignment_id<>parent.id then
  raise exception 'Self mandate denied' using errcode='42501';end if;
 select * into person from public.staff_people p where p.id=person_id and p.customer_id=parent.customer_id and p.organizer_id=parent.organizer_id for update;
 if not found then raise exception 'Staff person denied' using errcode='42501';end if;
 if cardinality(unit_ids)=0 then raise exception 'Self mandate denied' using errcode='42501';end if;
 foreach u in array unit_ids loop
  if not exists(select 1 from public.staff_school_duties d where d.staff_person_id=person.id and d.unit_id=u and d.organizer_id=parent.organizer_id
    and daterange(d.starts_on,d.ends_on,'[]')&&daterange(m.valid_from,m.valid_to,'[]')) then
   raise exception 'Staff person has no duty at the school' using errcode='22023',hint='tjanst_person_not_at_school';end if;
 end loop;
 for b in select * from public.staff_person_bindings x where x.ended_at is null
   and (x.staff_person_id=person.id or (x.membership_id=recipient_id and x.organizer_id=parent.organizer_id)) order by x.id for update loop
  if b.staff_person_id=person.id and b.membership_id=recipient_id then binding_id:=b.id;continue;end if;
  if exists(select 1 from public.access_assignments old
    where (old.id=b.access_assignment_id or old.id in (select l.access_assignment_id from public.tjanst_self_mandates l where l.binding_id=b.id))
     and old.ended_at is null and (old.valid_to is null or old.valid_to>=public.app_today())
     and public.phase3_mandate_is_valid(old.id,false)) then
   raise exception 'Staff person is bound to another account' using errcode='42501';end if;
  update public.staff_person_bindings set ended_at=now_at where id=b.id;
  perform public.tjanst_binding_audit(parent,b.id,'tjanst_binding_ended',jsonb_build_object('personId',b.staff_person_id,'membershipId',b.membership_id,'assignmentId',mandate_id));
 end loop;
 if binding_id is null then
  insert into public.staff_person_bindings(staff_person_id,membership_id,customer_id,organizer_id,access_assignment_id,bound_by_assignment_id,bound_at)
  values(person.id,recipient_id,parent.customer_id,parent.organizer_id,mandate_id,parent.id,now_at) returning id into binding_id;
 end if;
 insert into public.tjanst_self_mandates(access_assignment_id,binding_id,customer_id,organizer_id,linked_by_assignment_id,linked_at)
 values(mandate_id,binding_id,parent.customer_id,parent.organizer_id,parent.id,now_at);
 perform public.tjanst_binding_audit(parent,binding_id,'tjanst_person_bound',jsonb_build_object('personId',person.id,'membershipId',recipient_id,'assignmentId',mandate_id));
 return binding_id;
end $$;

-- 4. Skolorna i Egen tjänst: mandatskolorna för alla giltiga self-mandat som är kopplade till kontots aktiva bindning
-- för samma medlemskap och huvudman.
create function public.tjanst_self_unit_ids(a public.access_assignments) returns uuid[]
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(array_agg(distinct u.unit_id order by u.unit_id),'{}'::uuid[])
 from public.staff_person_bindings b
 join public.tjanst_self_mandates l on l.binding_id=b.id
 join public.access_assignments m on m.id=l.access_assignment_id
 join public.mandate_units u on u.assignment_id=m.id
 where b.membership_id=a.membership_id and b.organizer_id=a.organizer_id and b.customer_id=a.customer_id and b.ended_at is null
  and m.scope_kind='self' and m.membership_id=a.membership_id and m.organizer_id=a.organizer_id and m.customer_id=a.customer_id
  and public.phase3_mandate_is_valid(m.id)
$$;

-- 5. Personen nås via den aktiva bindningen för sessionens medlemskap och huvudman. Minst ett kopplat self-mandat ska gälla.
-- Är sessionens eget uppdrag ett self-mandat ska just det vara kopplat till bindningen. Annars nekas läsningen (42501).
create or replace function public.tjanst_self_person(a public.access_assignments) returns public.staff_people
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people;b public.staff_person_bindings;
begin
 if a.function is distinct from 'larare' then raise exception 'Own service denied' using errcode='42501';end if;
 select x.* into b from public.staff_person_bindings x
 where x.membership_id=a.membership_id and x.organizer_id=a.organizer_id and x.customer_id=a.customer_id and x.ended_at is null;
 if not found then raise exception 'Own service denied' using errcode='42501';end if;
 if not exists(select 1 from public.tjanst_self_mandates l join public.access_assignments m on m.id=l.access_assignment_id
   where l.binding_id=b.id and m.scope_kind='self' and m.membership_id=a.membership_id and m.organizer_id=a.organizer_id
    and public.phase3_mandate_is_valid(m.id))
  or (a.scope_kind='self' and not exists(select 1 from public.tjanst_self_mandates l where l.access_assignment_id=a.id and l.binding_id=b.id)) then
  raise exception 'Own service denied' using errcode='42501';end if;
 select x.* into p from public.staff_people x where x.id=b.staff_person_id;
 if not found then raise exception 'Own service denied' using errcode='42501';end if;
 return p;
end $$;

-- 6. Ordagranna kopior ur 20261020130000; det enda som ändras är skolvillkoret (tjanst_self_unit_ids i stället för
-- bindningens enda mandat).
create or replace function public.tjanst_self_projection(a public.access_assignments) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare p public.staff_people:=public.tjanst_self_person(a);publications jsonb;
begin
 select coalesce(jsonb_agg(jsonb_build_object('versionId',v.id,'versionNo',v.version_no,'unitId',d.unit_id,
   'schoolName',(select u.name from public.school_units u where u.id=d.unit_id),'schoolYear',d.school_year,
   'publishedAt',to_char(v.published_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'contentHash',v.content_hash,
   'rows',(select coalesce(jsonb_agg(jsonb_build_object('id',r.id,'className',c.name,'rowKey',r.timplan_row_key,'label',r.need_label,
     'ht',r.teacher_ht_minutes,'vt',r.teacher_vt_minutes,
     'joint',(select jsonb_build_object('jointId',g.id,'name',g.name,
       'colleagues',coalesce((select jsonb_agg(left(o.given_name||' '||o.family_name,200) order by o.family_name collate "C",o.given_name collate "C")
         from public.tjanst_joint_teacher_time t join public.staff_people o on o.id=t.staff_person_id where t.group_id=g.id and o.id<>p.id),'[]'::jsonb),
       'ht',coalesce((select t.ht_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id and t.staff_person_id=p.id),0),
       'vt',coalesce((select t.vt_minutes from public.tjanst_joint_teacher_time t where t.group_id=g.id and t.staff_person_id=p.id),0))
      from public.tjanst_joint_members m join public.tjanst_joint_groups g on g.id=m.group_id where m.row_id=r.id))
     order by c.name collate "C",r.need_label collate "C",r.id),'[]'::jsonb)
    from public.tjanst_rows r join public.school_classes c on c.id=r.class_id where r.version_id=v.id and r.staff_person_id=p.id),
   'specials',(select coalesce(jsonb_agg(jsonb_build_object('id',s.id,'kind',s.kind,'label',s.label,'className',(select c.name from public.school_classes c where c.id=s.class_id),
     'ht',s.ht_minutes,'vt',s.vt_minutes) order by s.kind,s.label collate "C",s.id),'[]'::jsonb)
    from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id),
   'acknowledgedAt',(select to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='ack'),
   'comments',(select coalesce(jsonb_agg(jsonb_build_object('id',f.id,'body',f.body,'at',to_char(f.created_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')) order by f.created_at,f.id),'[]'::jsonb)
    from public.tjanst_feedback f where f.version_id=v.id and f.staff_person_id=p.id and f.kind='comment'))
   order by d.school_year desc,d.unit_id),'[]'::jsonb) into publications
 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
 where v.status='published' and d.customer_id=a.customer_id and d.organizer_id=a.organizer_id
  and d.unit_id=any(public.tjanst_self_unit_ids(a))
  and (exists(select 1 from public.tjanst_rows r where r.version_id=v.id and r.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_special_assignments s where s.version_id=v.id and s.staff_person_id=p.id)
   or exists(select 1 from public.tjanst_version_teachers t where t.version_id=v.id and t.staff_person_id=p.id));
 return jsonb_build_object('contractVersion','tjanst_v1','person',jsonb_build_object('id',p.id,'displayName',left(p.given_name||' '||p.family_name,200)),
  'publications',publications,'capabilities',jsonb_build_object('canAck',true,'canComment',true));
end $$;

create or replace function public.tjanst_self_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;s public.app_sessions;r public.tjanst_commands;p public.staff_people;request_id uuid;action_name text;version uuid;
 q jsonb;target jsonb;feedback uuid;receipt jsonb;envelope jsonb;
begin
 if jsonb_typeof(input) is distinct from 'object' or jsonb_typeof(input->'action') is distinct from 'string' or input->>'action' not in ('ack','comment')
  or not public.phase5_programplan_shape(input,array['commandId','versionId','action']||case when input->>'action'='comment' then array['body'] else '{}'::text[] end) then
  raise exception 'Invalid own service command' using errcode='22023',hint='tjanst_invalid';end if;
 if input->>'action'='comment' and not public.phase5_apl_text(input->'body',2000,false) then
  raise exception 'Invalid comment' using errcode='22023',hint=case when jsonb_typeof(input->'body')='string' and char_length(input->>'body')>2000 then 'tjanst_comment_too_long' else 'tjanst_invalid' end;end if;
 request_id:=public.tjanst_uuid(input->'commandId');version:=public.tjanst_uuid(input->'versionId');action_name:=input->>'action';
 q:=jsonb_build_object('commandId',request_id,'versionId',version,'action',action_name)||case when action_name='comment' then jsonb_build_object('body',input->'body') else '{}'::jsonb end;
 a:=public.tjanst_actor('self');s:=public.phase5_programplan_session_check();p:=public.tjanst_self_person(a);
 target:=jsonb_build_object('unitId',null,'schoolYear',null,'versionId',version,'personId',null);
 perform pg_advisory_xact_lock(hashtextextended(request_id::text,5571));
 select * into r from public.tjanst_commands where command_id=request_id;
 if found then
  if (r.family,r.action,r.customer_id,r.organizer_id,r.actor_identity_id,r.assignment_id,r.target,r.request)
    is distinct from ('self',action_name,a.customer_id,a.organizer_id,s.identity_id,a.id,target,q) then
   raise exception 'Own service command changed' using errcode='40001',hint='tjanst_command_conflict';end if;
  return jsonb_set(r.envelope,'{result,receipt,replayed}','true'::jsonb,false);
 end if;
 -- Bara en publicerad version där personen har rader eller uppdrag, på en skola i mandatet.
 if not exists(select 1 from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
   where v.id=version and v.status='published' and d.customer_id=a.customer_id and d.organizer_id=a.organizer_id
    and d.unit_id=any(public.tjanst_self_unit_ids(a))
    and (exists(select 1 from public.tjanst_rows x where x.version_id=v.id and x.staff_person_id=p.id)
     or exists(select 1 from public.tjanst_special_assignments x where x.version_id=v.id and x.staff_person_id=p.id))) then
  raise exception 'Own service denied' using errcode='42501';end if;
 if action_name='ack' then
  -- Kvittens en gång per version: en ny kvittens ger samma kvitto som den första.
  select f.id into feedback from public.tjanst_feedback f where f.version_id=version and f.staff_person_id=p.id and f.kind='ack';
  if feedback is null then
   insert into public.tjanst_feedback(version_id,staff_person_id,kind,body,actor_identity_id,assignment_id) values(version,p.id,'ack',null,s.identity_id,a.id) returning id into feedback;end if;
 else
  insert into public.tjanst_feedback(version_id,staff_person_id,kind,body,actor_identity_id,assignment_id) values(version,p.id,'comment',input->>'body',s.identity_id,a.id) returning id into feedback;
 end if;
 receipt:=jsonb_build_object('commandId',request_id,'action',action_name,'versionId',version,'feedbackId',feedback,'replayed',false);
 envelope:=jsonb_build_object('contractVersion','tjanst_sql_v1','actor',jsonb_build_object('identityId',s.identity_id,'assignmentId',a.id),
  'result',jsonb_build_object('receipt',receipt,'detail',public.tjanst_self_projection(a)));
 insert into public.tjanst_commands(command_id,family,action,customer_id,organizer_id,target,actor_identity_id,assignment_id,request,envelope)
 values(request_id,'self',action_name,a.customer_id,a.organizer_id,target,s.identity_id,a.id,q,envelope);
 -- Audit bär bara referenser; kommentarstexten skrivs aldrig i security_events (T-05.1-30).
 perform public.tjanst_audit('tjanst_self_command','tjanst_version',version,jsonb_build_object('commandId',request_id,'action',action_name,'feedbackId',feedback));
 return envelope;
end $$;

-- 7. Allt nytt är stängt.
revoke all on function public.tjanst_self_mandates_guard(),public.tjanst_self_unit_ids(public.access_assignments)
 from public,anon,authenticated,service_role,skolplattform_worker;
