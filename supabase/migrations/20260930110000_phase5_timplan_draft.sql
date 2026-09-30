-- 05-03: intern, stängd timplansväg. Worker öppnas först efter separat
-- sessions-/MFA-/same-origin-/auditprov i 05-04. Inga gamla grants vidgas.
alter table public.timplans add column revision integer not null default 0 check (revision >= 0);

create function public.phase5_timplan_scope(plan_id uuid, writing boolean default false)
returns public.timplans language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare a public.access_assignments; p public.timplans;
begin
 a:=public.phase3_actor();
 if a.function not in ('huvudman','rektor') or (writing and a.function<>'rektor') then
  raise exception 'Planning denied' using errcode='42501'; end if;
 select t.* into p from public.timplans t
 join public.offerings o on o.id=t.offering_id and o.organizer_id=t.organizer_id
 join public.school_units s on s.id=o.unit_id and s.organizer_id=o.organizer_id
 join public.organizers g on g.id=t.organizer_id and g.customer_id=a.customer_id
 join public.mandate_units u on u.assignment_id=a.id and u.unit_id=s.id
 where t.id=plan_id and t.organizer_id=a.organizer_id;
 if not found then raise exception 'Planning denied' using errcode='42501'; end if;
 return p;
end $$;

-- Aktör härleds ur det levande mandatet, aldrig ur kommandots payload.
-- DB-händelsen har ännu ingen sessionskoppling; Worker-händelse med faktisk
-- session och assurance måste läggas i samma yttre transaktion i 05-04.
create function public.phase5_timplan_audit(plan_id uuid, operation text)
returns void language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare a public.access_assignments; i public.identities; corr uuid;
begin
 if operation not in ('timplan_read','timplan_cell_changed') or operation is null then
  raise exception 'Invalid planning operation' using errcode='22023'; end if;
 a:=public.phase3_actor();
 select * into i from public.identities where id=public.current_identity_id();
 corr:=nullif(current_setting('app.correlation_id',true),'')::uuid;
 if corr is null then raise exception 'Planning audit unavailable' using errcode='55000'; end if;
 insert into public.security_events(correlation_id,source,actor_identity_id,actor_issuer,actor_subject,
 membership_id,assignment_id,customer_id,action,object_type,object_id,outcome,details)
 values(corr,'db',i.id,i.issuer,i.subject,a.membership_id,a.id,a.customer_id,
 operation,'timplan',plan_id,'ok','{}');
end $$;

create function public.phase5_read_timplan(plan_id uuid)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare p public.timplans; result jsonb;
begin
 p:=public.phase5_timplan_scope(plan_id);
 -- Sammanhängande snapshot av metadata och timmar även för klienten som
 -- senare skickar expected_revision. Auditfel lämnar inget svar.
 select jsonb_build_object('id',t.id,'offeringId',t.offering_id,'unitId',o.unit_id,
 'version',t.version,'revision',t.revision,'status',t.status,'basis',t.basis,
 'catalogFetched',t.catalog_fetched,'decidedOn',t.decided_on,
 'cells',coalesce((select jsonb_object_agg(c.row_id,to_jsonb(c.hours)) from public.timplan_cells c where c.timplan_id=t.id),'{}'))
 into result from public.timplans t join public.offerings o on o.id=t.offering_id where t.id=p.id;
 perform public.phase5_timplan_audit(p.id,'timplan_read');
 return result;
end $$;

create function public.phase5_change_timplan_cell(plan_id uuid, expected_revision integer,
 target_row text, column_index integer, new_hours integer)
returns jsonb language plpgsql volatile security definer
set search_path=pg_catalog,public as $$
declare p public.timplans; o public.offerings; values_before smallint[];
 grades smallint[]; grade integer; column_count integer;
begin
 p:=public.phase5_timplan_scope(plan_id,true);
 select * into p from public.timplans where id=p.id for update;
 if expected_revision is null or expected_revision<0 or new_hours is null or new_hours not between 0 and 2000
 or column_index is null or column_index<0 or target_row is null then
  raise exception 'Invalid planning cell' using errcode='22023'; end if;
 if p.status not in ('utkast','atersand') then raise exception 'Planning version locked' using errcode='42501'; end if;
 if p.revision<>expected_revision then raise exception 'Planning revision conflict' using errcode='40001'; end if;
 select * into o from public.offerings where id=p.offering_id;
 if o.kind='grundskola' then
  grades:=case when coalesce(cardinality(o.grades),0)=0 then array[1,2,3,4,5,6,7,8,9]::smallint[] else o.grades end;
  if array_ndims(grades)<>1 or array_lower(grades,1)<>1
   or exists(select 1 from unnest(grades) g where g is null or g not between 1 and 9)
   or cardinality(grades)<>(select count(distinct g) from unnest(grades) g) then
   raise exception 'Invalid planning basis' using errcode='22023'; end if;
  column_count:=cardinality(grades); grade:=grades[column_index+1];
  if target_row not in ('bild','engelska','hkk','idrott','matematik','musik','no','biologi','fysik','kemi',
   'so','geografi','historia','religion','samhallskunskap','slojd','svenska','teknik','sprakval','skolansval')
   or (target_row in ('no','so') and grade>3)
   or (target_row in ('biologi','fysik','kemi','geografi','historia','religion','samhallskunskap') and grade<=3) then
   raise exception 'Invalid planning cell' using errcode='22023'; end if;
 elsif o.kind='introduktionsprogram' then
  column_count:=1;
  if target_row not in ('im-sv','im-ma','im-en','im-sh','im-idh','im-praktik','im-mentor') then
   raise exception 'Invalid planning cell' using errcode='22023'; end if;
 else
  -- Gymnasiets rader kräver en verifierad programplans-/kataloggrund.
  raise exception 'Planning basis unavailable' using errcode='42501';
 end if;
 if column_index>=column_count then raise exception 'Invalid planning cell' using errcode='22023'; end if;
 select hours into values_before from public.timplan_cells where timplan_id=p.id and row_id=target_row for update;
 if not found or array_ndims(values_before) is distinct from 1 or array_lower(values_before,1) is distinct from 1
  or cardinality(values_before)<>column_count or array_position(values_before,null) is not null then
  raise exception 'Invalid planning matrix' using errcode='22023'; end if;
 values_before[column_index+1]:=new_hours::smallint;
 update public.timplan_cells set hours=values_before where timplan_id=p.id and row_id=target_row;
 update public.timplans set revision=revision+1 where id=p.id returning * into p;
 perform public.phase5_timplan_audit(p.id,'timplan_cell_changed');
 return jsonb_build_object('id',p.id,'revision',p.revision,'rowId',target_row,'hours',values_before);
end $$;

revoke all on function public.phase5_timplan_scope(uuid,boolean),public.phase5_timplan_audit(uuid,text),
 public.phase5_read_timplan(uuid),public.phase5_change_timplan_cell(uuid,integer,text,integer,integer)
 from public,anon,authenticated,skolplattform_worker;
