-- Additive, versioned minute storage. Installation never converts existing plans.
create table public.timplan_time_models (
 plan_id uuid primary key references public.timplans(id) on delete restrict,
 model text not null check(model='school_terms_annual_apl_v2'),
 origin text not null check(origin in ('new','copy','transition')),
 source_plan_id uuid references public.timplans(id) on delete restrict,
 source_version integer check(source_version>0),
 copy_review jsonb not null default '[]' check(jsonb_typeof(copy_review)='array'),
 created_at timestamptz not null default clock_timestamp()
);
create table public.timplan_time_cells_v2 (
 plan_id uuid not null references public.timplan_time_models(plan_id) on delete restrict,
 row_key text not null,school_minutes jsonb not null,annual_apl_minutes jsonb not null,
 primary key(plan_id,row_key)
);
create table public.timplan_time_commands (
 command_id uuid primary key,plan_id uuid not null references public.timplans(id) on delete restrict,
 organizer_id uuid not null references public.organizers(id),unit_id uuid not null references public.school_units(id),
 actor_identity_id uuid not null references public.identities(id),assignment_id uuid not null references public.access_assignments(id),
 request jsonb not null,envelope jsonb not null,created_at timestamptz not null default clock_timestamp()
);
do $$declare n text;begin
 foreach n in array array['timplan_time_models','timplan_time_cells_v2','timplan_time_commands'] loop
 execute format('alter table public.%I enable row level security',n);
 execute format('alter table public.%I force row level security',n);
 execute format('revoke all on public.%I from public,anon,authenticated,service_role,skolplattform_worker',n);
 end loop;
end $$;

create function public.phase5_timplan_time_row(row_value jsonb,points jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare i integer;v jsonb;active boolean;
begin
 if not public.phase5_programplan_shape(row_value,array['schoolMinutes','annualAplMinutes'])
 or jsonb_typeof(points) is distinct from 'array' or jsonb_array_length(points)<>6
 or not public.phase5_programplan_array(row_value->'schoolMinutes',6) or jsonb_array_length(row_value->'schoolMinutes')<>6
 or not public.phase5_programplan_array(row_value->'annualAplMinutes',3) or jsonb_array_length(row_value->'annualAplMinutes')<>3 then
 raise exception 'Ogiltig tidsrad.' using errcode='22023',hint='invalid_time_row';end if;
 for i in 0..5 loop
 v:=row_value->'schoolMinutes'->i;
 if v<>'null'::jsonb and (not public.phase5_programplan_integer(v,0,120000) or coalesce((points->>i)::integer,0)=0) then
 raise exception 'Ogiltig skoltid eller inaktiv termin.' using errcode='22023',hint='invalid_time_row';end if;
 end loop;
 for i in 0..2 loop
 v:=row_value->'annualAplMinutes'->i;active:=coalesce((points->>(i*2))::integer,0)>0 or coalesce((points->>(i*2+1))::integer,0)>0;
 if v<>'null'::jsonb and (not public.phase5_programplan_integer(v,0,240000) or not active) then
 raise exception 'Ogiltig års-APL eller inaktiv årskurs.' using errcode='22023',hint='invalid_time_row';end if;
 end loop;
 return row_value;
end $$;

create function public.phase5_timplan_time_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
declare pid uuid;p public.timplans;points jsonb;allocation record;rv jsonb;rv_old jsonb;a public.access_assignments;changed integer:=0;
begin
 if tg_op='TRUNCATE' or (tg_table_name='timplan_time_commands' and tg_op<>'INSERT') or (tg_table_name='timplan_time_models' and tg_op='DELETE') then
 raise exception 'Tidsmodellens ursprung och kvitton är oföränderliga.' using errcode='42501';end if;
 pid:=case when tg_op='DELETE' then old.plan_id else new.plan_id end;
 if not exists(select 1 from public.apl_plan_write_permits w where w.transaction_id=txid_current() and w.backend_id=pg_backend_pid() and w.plan_id=pid) then
 raise exception 'Tidsraden kräver skyddat kommando.' using errcode='42501';end if;
 select * into p from public.timplans where id=pid;
 if p.gym_basis is null or p.status not in ('utkast','atersand') then raise exception 'Timplanen är låst.' using errcode='42501';end if;
 if tg_table_name='timplan_time_cells_v2' then
 if tg_op='UPDATE' and (new.plan_id,new.row_key) is distinct from (old.plan_id,old.row_key) then raise exception 'Tidsradens nyckel är låst.' using errcode='42501';end if;
 if tg_op='DELETE' then raise exception 'Tidsrader får inte raderas.' using errcode='42501';end if;
 select d->'points' into points from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=new.row_key;
 rv:=public.phase5_timplan_time_row(jsonb_build_object('schoolMinutes',new.school_minutes,'annualAplMinutes',new.annual_apl_minutes),points);
 for allocation in select term_index/2 year_index,sum(gut_minutes)::bigint minutes from public.apl_time_allocations where plan_id=pid and row_key=new.row_key group by term_index/2 loop
 if new.annual_apl_minutes->>allocation.year_index is null or (new.annual_apl_minutes->>allocation.year_index)::bigint<allocation.minutes then
 raise exception 'Års-APL understiger redan förlagd APL. Justera först perioderna.' using errcode='22023',hint='allocation_exceeds_annual';end if;
 end loop;
 elsif tg_table_name='timplan_time_models' then
 if tg_op='UPDATE' then
  if (to_jsonb(new)-'copy_review') is distinct from (to_jsonb(old)-'copy_review') or jsonb_array_length(new.copy_review)<>jsonb_array_length(old.copy_review) then raise exception 'Tidsmodellens ursprung är låst.' using errcode='42501';end if;
  a:=public.phase5_programplan_actor();
  for rv,rv_old in select n.value,o.value from jsonb_array_elements(new.copy_review) with ordinality n(value,idx) join jsonb_array_elements(old.copy_review) with ordinality o(value,idx) using(idx) loop
   if rv is distinct from rv_old then
    changed:=changed+1;
    if (rv-'resolution') is distinct from (rv_old-'resolution') or rv_old->'resolution' is distinct from 'null'::jsonb
     or not public.phase5_programplan_shape(rv->'resolution',array['actorId','assignmentId','at','note'])
     or rv#>>'{resolution,actorId}' is distinct from public.current_identity_id()::text or rv#>>'{resolution,assignmentId}' is distinct from a.id::text
     or not public.phase5_apl_text(rv#>'{resolution,note}',2000,false) or rv#>>'{resolution,at}' is null then
     raise exception 'Granskningens ursprung eller ansvar är ogiltigt.' using errcode='42501';end if;
   end if;
  end loop;
  if changed<>1 then raise exception 'Granska en punkt i taget.' using errcode='22023';end if;
  return new;
 end if;
 if public.phase5_apl_program(public.phase5_gym_timplan_result(pid))->>'category' is distinct from 'VOCATIONAL_PROGRAM' then
 raise exception 'APL används bara för yrkesprogram.' using errcode='22023',hint='apl_not_vocational';end if;
 if (new.origin='new' and (new.source_plan_id is not null or new.source_version is not null))
 or (new.origin<>'new' and not exists(select 1 from public.timplans s where s.id=new.source_plan_id and s.version=new.source_version and (s.organizer_id,s.unit_id,s.offering_id)=(p.organizer_id,p.unit_id,p.offering_id))) then
 raise exception 'Tidsmodellens källa kan inte verifieras.' using errcode='42501';end if;
 end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
do $$declare n text;begin
 foreach n in array array['timplan_time_models','timplan_time_cells_v2','timplan_time_commands'] loop
 execute format('create trigger %I before insert or update or delete on public.%I for each row execute function public.phase5_timplan_time_guard()',n||'_guard',n);
 execute format('create trigger %I before truncate on public.%I for each statement execute function public.phase5_timplan_time_guard()',n||'_no_truncate',n);
 end loop;
end $$;
create function public.phase5_timplan_time_legacy_guard() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$
begin
 if exists(select 1 from public.timplan_time_models where plan_id=case when tg_op='DELETE' then old.timplan_id else new.timplan_id end)
 or (tg_op='UPDATE' and exists(select 1 from public.timplan_time_models where plan_id=old.timplan_id)) then
 raise exception 'Timplanen använder skoltimmar och års-APL. Läs in den aktuella tabellen.' using errcode='40001',hint='time_model_conflict';end if;
 return case when tg_op='DELETE' then old else new end;
end $$;
create trigger a_timplan_cells_time_model_guard before insert or update or delete on public.timplan_cells
 for each row execute function public.phase5_timplan_time_legacy_guard();

create function public.phase5_timplan_time_rows(target_plan uuid) returns jsonb
language sql stable security definer set search_path=pg_catalog,public as $$
 select coalesce(jsonb_object_agg(row_key,jsonb_build_object('schoolMinutes',school_minutes,'annualAplMinutes',annual_apl_minutes)),'{}')
 from public.timplan_time_cells_v2 where plan_id=target_plan
$$;

create function public.phase5_timplan_time_transition_basis(target_plan uuid) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare p public.timplans;gym jsonb;apl jsonb;r jsonb;d jsonb;v jsonb;k text;school jsonb;annual jsonb;rows jsonb:='{}';i integer;minutes bigint;hash text;
begin
 p:=public.phase5_apl_plan_scope(target_plan,true);
 if exists(select 1 from public.timplan_time_models where plan_id=p.id) then raise exception 'Tidsmodellen har redan ändrats.' using errcode='40001',hint='time_model_conflict';end if;
 gym:=public.phase5_gym_timplan_result(p.id);apl:=public.phase5_apl_plan_value(p.id);
 if public.phase5_apl_program(gym)->>'category' is distinct from 'VOCATIONAL_PROGRAM' then raise exception 'APL används bara för yrkesprogram.' using errcode='22023',hint='apl_not_vocational';end if;
 perform public.phase5_apl_validate_allocations(gym,apl);
 for r in select value from jsonb_array_elements(p.gym_basis->'rows') loop
 k:=r->>'key';select value into d from jsonb_array_elements(p.gym_basis->'distribution') where value->>'rowKey'=k;
 school:='[]';annual:='[]';
 for i in 0..5 loop
 select coalesce(sum(gut_minutes),0) into minutes from public.apl_time_allocations where plan_id=p.id and row_key=k and term_index=i;
 v:=gym->'hours'->k->i;
 if v is null or (v='null'::jsonb and minutes>0) or (v<>'null'::jsonb and (v#>>'{}')::bigint*60<minutes) then raise exception 'Den äldre tiden kan inte överföras utan rättning.' using errcode='22023',hint='invalid_time_transition';end if;
 school:=school||jsonb_build_array(case when v='null'::jsonb then 'null'::jsonb else to_jsonb((v#>>'{}')::bigint*60-minutes) end);
 end loop;
 for i in 0..2 loop
 select coalesce(sum(gut_minutes),0) into minutes from public.apl_time_allocations where plan_id=p.id and row_key=k and term_index/2=i;
 annual:=annual||jsonb_build_array(case when (d->'points'->>(i*2))::integer=0 and (d->'points'->>(i*2+1))::integer=0 then 'null'::jsonb else to_jsonb(minutes) end);
 end loop;
 rows:=jsonb_set(rows,array[k],public.phase5_timplan_time_row(jsonb_build_object('schoolMinutes',school,'annualAplMinutes',annual),d->'points'));
 end loop;
 hash:='sha256:'||encode(sha256(convert_to(jsonb_build_array('timplan_time_transition_v2',p.id,p.revision,gym,apl,rows)::text,'UTF8')),'hex');
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_read');
 return jsonb_build_object('planId',p.id,'revision',p.revision,'basisHash',hash,'rows',rows);
end $$;

create function public.phase5_timplan_time_request(q jsonb) returns jsonb
language plpgsql immutable security definer set search_path=pg_catalog,public as $$
declare extra text[];
begin
 extra:=case q->>'action' when 'transition' then array['expectedBasisHash','reviewed'] when 'save_row' then array['rowKey','row'] when 'save_rows' then array['rows'] when 'resolve_copy_review' then array['reviewId','note'] else null end;
 if extra is null or not public.phase5_programplan_shape(q,array['contractVersion','action','commandId','planId','expectedRevision']||extra)
 or q->>'contractVersion' is distinct from 'timplan_time_v2' or not public.phase5_programplan_integer(q->'expectedRevision',0,2147483646) then
 raise exception 'Ogiltigt tidskommando.' using errcode='22023',hint='invalid_time_command';end if;
 if q->>'action'='transition' and (q->'reviewed' is distinct from 'true'::jsonb or jsonb_typeof(q->'expectedBasisHash') is distinct from 'string' or q->>'expectedBasisHash'!~'^sha256:[0-9a-f]{64}$') then
 raise exception 'Granska övergången innan du sparar.' using errcode='22023',hint='invalid_time_transition';end if;
 if q->>'action'='save_row' and not public.phase5_apl_row_key(q->'rowKey') then raise exception 'Ogiltig tidsrad.' using errcode='22023';end if;
 if q->>'action'='save_rows' and (jsonb_typeof(q->'rows') is distinct from 'object' or (select count(*) from jsonb_object_keys(q->'rows')) not between 1 and 1000) then raise exception 'Ogiltig tidsmatris.' using errcode='22023';end if;
 if q->>'action'='resolve_copy_review' then
 perform public.phase5_apl_uuid(q->'reviewId');
 if not public.phase5_apl_text(q->'note',2000,false) then raise exception 'Beskriv hur tiden har hanterats.' using errcode='22023';end if;
 end if;
 return q||jsonb_build_object('planId',public.phase5_apl_uuid(q->'planId'),'commandId',public.phase5_apl_uuid(q->'commandId'));
end $$;

create function public.phase5_timplan_time_command(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;p public.timplans;a public.access_assignments;s public.app_sessions;previous public.timplan_time_commands;
 basis jsonb;rows jsonb;r record;points jsonb;changed boolean:=false;reply jsonb;
begin
 q:=public.phase5_timplan_time_request(input);p:=public.phase5_apl_plan_scope((q->>'planId')::uuid,false);
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') then raise exception 'Timplanen kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(q->>'commandId',5542));
 select * into previous from public.timplan_time_commands where command_id=(q->>'commandId')::uuid;
 if found then
 if (previous.plan_id,previous.organizer_id,previous.unit_id,previous.actor_identity_id,previous.assignment_id,previous.request)
 is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q) then raise exception 'Tidskommandot har ändrats.' using errcode='40001',hint='time_command_conflict';end if;
 return jsonb_set(previous.envelope,'{receipt,replayed}','true'::jsonb,false);
 end if;
 p:=public.phase5_apl_plan_scope(p.id,true);
 if p.revision<>(q->>'expectedRevision')::integer then raise exception 'Timplanen har ändrats. Läs in den igen.' using errcode='40001',hint='time_revision_conflict';end if;
 if public.phase5_apl_program(public.phase5_gym_timplan_result(p.id))->>'category' is distinct from 'VOCATIONAL_PROGRAM' then raise exception 'APL används bara för yrkesprogram.' using errcode='22023',hint='apl_not_vocational';end if;
 if q->>'action'='transition' then
 basis:=public.phase5_timplan_time_transition_basis(p.id);
 if basis->>'basisHash'<>q->>'expectedBasisHash' then raise exception 'Övergångens underlag har ändrats.' using errcode='40001',hint='time_basis_conflict';end if;
 rows:=basis->'rows';
 else
 if not exists(select 1 from public.timplan_time_models where plan_id=p.id) then raise exception 'Timplanen använder äldre totaltimmar.' using errcode='40001',hint='time_model_conflict';end if;
 rows:=case when q->>'action'='save_row' then jsonb_build_object(q->>'rowKey',q->'row') when q->>'action'='resolve_copy_review' then '{}'::jsonb else q->'rows' end;
 end if;
 for r in select key,value from jsonb_each(rows) loop
 select d->'points' into points from jsonb_array_elements(p.gym_basis->'distribution') d where d->>'rowKey'=r.key;
 perform public.phase5_timplan_time_row(r.value,points);
 end loop;
 insert into public.apl_plan_write_permits values(txid_current(),pg_backend_pid(),p.id);
 if q->>'action'='transition' then
 insert into public.timplan_time_models(plan_id,model,origin,source_plan_id,source_version) values(p.id,'school_terms_annual_apl_v2','transition',p.id,p.version);
 changed:=true;
 end if;
 for r in select key,value from jsonb_each(rows) loop
 if not exists(select 1 from public.timplan_time_cells_v2 where plan_id=p.id and row_key=r.key and school_minutes=r.value->'schoolMinutes' and annual_apl_minutes=r.value->'annualAplMinutes') then
 insert into public.timplan_time_cells_v2(plan_id,row_key,school_minutes,annual_apl_minutes) values(p.id,r.key,r.value->'schoolMinutes',r.value->'annualAplMinutes')
 on conflict(plan_id,row_key) do update set school_minutes=excluded.school_minutes,annual_apl_minutes=excluded.annual_apl_minutes;
 changed:=true;
 end if;
 end loop;
 if q->>'action'='resolve_copy_review' then
  if not exists(select 1 from public.timplan_time_models m cross join lateral jsonb_array_elements(m.copy_review) rv where m.plan_id=p.id and rv->>'id'=q->>'reviewId' and rv->'resolution'='null'::jsonb) then raise exception 'Granskningspunkten finns inte eller är redan hanterad.' using errcode='40001',hint='time_review_conflict';end if;
  update public.timplan_time_models set copy_review=(select jsonb_agg(case when rv->>'id'=q->>'reviewId' then rv||jsonb_build_object('resolution',jsonb_build_object('actorId',s.identity_id,'assignmentId',a.id,'at',to_char(clock_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),'note',q->'note')) else rv end order by idx) from jsonb_array_elements(copy_review) with ordinality x(rv,idx)) where plan_id=p.id;
  changed:=true;
 end if;
 if changed then update public.timplans set revision=revision+1 where id=p.id returning * into p;end if;
 reply:=jsonb_build_object('contractVersion','timplan_time_sql_v2','plan',public.phase5_gym_timplan_result(p.id),'receipt',jsonb_build_object('commandId',q->'commandId','planId',p.id,'action',q->'action','revision',p.revision,'changed',changed,'replayed',false));
 insert into public.timplan_time_commands(command_id,plan_id,organizer_id,unit_id,actor_identity_id,assignment_id,request,envelope)
 values((q->>'commandId')::uuid,p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q,reply);
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_row_changed');
 delete from public.apl_plan_write_permits where transaction_id=txid_current() and backend_id=pg_backend_pid() and plan_id=p.id;
 return reply;
end $$;

create function public.phase5_timplan_time_status(input jsonb) returns jsonb
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare q jsonb;p public.timplans;a public.access_assignments;s public.app_sessions;r public.timplan_time_commands;reply jsonb;
begin
 if not public.phase5_programplan_shape(input,array['command']) then raise exception 'Ogiltig statusfråga.' using errcode='22023';end if;
 q:=public.phase5_timplan_time_request(input->'command');p:=public.phase5_apl_plan_scope((q->>'planId')::uuid,false);
 a:=public.phase5_programplan_actor();s:=public.phase5_programplan_session_check();
 if a.function not in ('rektor','administrator') then raise exception 'Timplanen kräver aktuellt skolmandat.' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(q->>'commandId',5542));
 select * into r from public.timplan_time_commands where command_id=(q->>'commandId')::uuid;
 if found then
 if (r.plan_id,r.organizer_id,r.unit_id,r.actor_identity_id,r.assignment_id,r.request) is distinct from (p.id,p.organizer_id,p.unit_id,s.identity_id,a.id,q) then raise exception 'Tidskommandot har ändrats.' using errcode='40001',hint='time_command_conflict';end if;
 reply:=jsonb_build_object('state','completed','result',jsonb_set(r.envelope,'{receipt,replayed}','true'::jsonb,false));
 else reply:=jsonb_build_object('state','not_found','result',null);end if;
 perform public.phase5_gym_timplan_audit(p.id,'gym_timplan_read');return reply;
end $$;
do $$declare fn record;begin
 for fn in select oid::regprocedure::text signature from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_timplan_time_%' loop
 execute 'revoke all on function '||fn.signature||' from public,anon,authenticated,service_role,skolplattform_worker';end loop;
end $$;
