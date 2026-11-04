-- VP-05. Valplanen läser timplanens radtid även från planer utan tidsmodell v2 (timplan_cells), annars visas Tid okänd.
-- Bara läsning: inga tabeller eller affärsrader ändras. Behörigheter följer med create or replace.
create or replace function public.valplan_row_contexts(unit uuid,school_year integer) returns jsonb
language plpgsql stable security definer set search_path=pg_catalog,public as $$
declare t public.timplans;o public.offerings;f jsonb;pts jsonb;mins jsonb;cohort integer;y integer;idx integer;key text;
 classes jsonb;out jsonb:='[]';hrs smallint[];alloc boolean[];ht integer;vt integer;begin
 for t in select x.* from public.timplans x join public.offerings ox on ox.id=x.offering_id
  where x.unit_id=unit and x.status='faststalld' and x.gym_basis is not null and ox.kind='gymnasium' and ox.archived_at is null
  order by x.id loop
  select * into o from public.offerings where id=t.offering_id;
  cohort:=public.phase5_class_start_year(t);continue when cohort is null;
  y:=school_year-cohort+1;continue when y<1 or y>3;
  -- Older approved versions only count while classes are still linked to them for the year.
  continue when exists(select 1 from public.timplans n where n.series_id=t.series_id and n.status='faststalld' and n.version>t.version)
   and not exists(select 1 from public.class_timplans l where l.timplan_id=t.id and l.start_year=school_year and l.column_id='ar'||y);
  idx:=2*(y-1);
  select coalesce(jsonb_agg(jsonb_build_object('id',sc.id,'name',sc.name) order by sc.name collate "C",sc.id),'[]') into classes
   from public.class_timplans l join public.school_classes sc on sc.id=l.class_id
   where l.unit_id=t.unit_id and l.timplan_id=t.id and l.start_year=school_year and l.column_id='ar'||y;
  for f in select value from jsonb_array_elements(coalesce(t.gym_basis->'basisReference'->'choiceBlocks','[]')) loop
   continue when f->>'kind' not in ('modernLanguage','individualChoice','specialization');
   key:='block:'||(f->>'id');pts:=null;mins:=null;
   select v.value->'points' into pts from jsonb_array_elements(t.gym_basis->'distribution') v where v.value->>'rowKey'=key;
   continue when pts is null or coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0)=0;
   ht:=null;vt:=null;
   if exists(select 1 from public.timplan_time_models m where m.plan_id=t.id) then
    select c.school_minutes into mins from public.timplan_time_cells_v2 c where c.plan_id=t.id and c.row_key=key;
    if mins is not null then ht:=coalesce((mins->>idx)::integer,0);vt:=coalesce((mins->>(idx+1))::integer,0);end if;
   else
    -- Older plans keep hours per term; the year is split evenly, exactly as in tjänstefördelningen.
    hrs:=null;alloc:=null;select c.hours,c.allocated into hrs,alloc from public.timplan_cells c where c.timplan_id=t.id and c.row_id=key;
    if coalesce((pts->>idx)::integer,0)>0 and alloc[idx+1] then ht:=hrs[idx+1];end if;
    if coalesce((pts->>(idx+1))::integer,0)>0 and alloc[idx+2] then vt:=hrs[idx+2];end if;
    if ht is not null or vt is not null then ht:=(coalesce(ht,0)+coalesce(vt,0))*30;vt:=ht;end if;
   end if;
   out:=out||jsonb_build_array(jsonb_build_object('timplanId',t.id,'timplanVersion',t.version,'rowKey',key,'year',y,'rowKind','block','blockKind',f->>'kind',
    'points',coalesce((pts->>idx)::integer,0)+coalesce((pts->>(idx+1))::integer,0),
    'minutesHt',ht,'minutesVt',vt,
    'classIds',(select coalesce(jsonb_agg(c->'id'),'[]') from jsonb_array_elements(classes) c),'allowedLevelKeys',null,
    'linkedValplanId',(select to_jsonb(r.valplan_id) from public.valplan_rows r where r.unit_id=unit and r.school_year=valplan_row_contexts.school_year and r.timplan_id=t.id and r.row_key=key and r.year=y),
    'planName',coalesce(public.phase5_named_timplan_plan_series(t.id)->>'name',o.name),'rowLabel',f->>'name','classes',classes));
  end loop;
 end loop;
 return out;
end $$;
