-- Own rollback fixtures only, supplied by verify-named-timplan-series.mjs.
create temporary table named_series_checks(name text primary key) on commit drop;
create function pg_temp.named_series_assert(ok boolean,label text) returns void language plpgsql as $$
begin if ok is distinct from true then raise exception 'Assertion: %',label;end if;
 insert into named_series_checks values(label);end $$;
create function pg_temp.named_series_denied(statement text,code text,label text) returns void language plpgsql as $$
declare actual text;begin
 begin execute statement;exception when others then get stacked diagnostics actual=returned_sqlstate;end;
 perform pg_temp.named_series_assert(actual=code,label);
end $$;
do $$
declare x jsonb;s public.timplan_series;p public.timplans;other_id uuid;role_name text;f record;n text;new_id uuid;
begin
 select value into x from named_series_context;
 select * into p from public.timplans where id=(x->>'planId')::uuid;
 select * into s from public.timplan_series where id=p.series_id;
 perform pg_temp.named_series_assert(s.legacy_default and s.name='Grundfördelning' and s.revision=0,'backfilled series is current default revision zero');
 perform pg_temp.named_series_assert(p.name_at_creation is null,'historical name remains unknown');
 perform pg_temp.named_series_assert(not exists(select 1 from public.timplans t left join public.timplan_series z on z.id=t.series_id
  where z.id is null or (z.offering_id,z.unit_id,z.organizer_id) is distinct from (t.offering_id,t.unit_id,t.organizer_id)),'all migrated plan versions have exact series scope');
 perform pg_temp.named_series_assert((select count(*) from public.timplan_series)=(select count(*) from (select distinct offering_id,unit_id from public.timplans) q),'one default per old scope including all school forms');
 perform pg_temp.named_series_assert(not exists(select 1 from public.timplans where name_at_creation is not null),'no old version has a fabricated historical name');
 perform pg_temp.named_series_assert((select relrowsecurity and relforcerowsecurity from pg_class where oid='public.timplan_series'::regclass),'series RLS forced');
 foreach role_name in array array['anon','authenticated','service_role','skolplattform_worker'] loop
  perform pg_temp.named_series_assert(not has_table_privilege(role_name,'public.timplan_series','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'),'closed series table ACL '||role_name);
  for f in select oid,proname from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_timplan_series_%' loop
   perform pg_temp.named_series_assert(not has_function_privilege(role_name,f.oid,'EXECUTE'),'closed helper ACL '||role_name||' '||f.proname);
  end loop;
 end loop;
 foreach n in array array['',' Grundfördelning','Grundfördelning ',repeat('😀',81),E'A\nB',E'A\tB',U&'A\200DB'] loop
  perform pg_temp.named_series_denied(format('insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name) values(%L,%L,%L,%L,%L)',s.organizer_id,s.offering_id,s.unit_id,n,lower(n)),'23514','invalid name '||encode(sha256(convert_to(n,'UTF8')),'hex'));
 end loop;
 perform pg_temp.named_series_denied(format('insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name) values(%L,%L,%L,''Grundfördelning'',''not-normalized'')',s.organizer_id,s.offering_id,s.unit_id),'23514','normalized name cannot lie');
 perform pg_temp.named_series_denied(format('insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name) values(%L,%L,%L,''GRUNDFÖRDELNING'',lower(''GRUNDFÖRDELNING''))',s.organizer_id,s.offering_id,s.unit_id),'23505','case insensitive name uniqueness');
 perform pg_temp.named_series_denied(format('insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name,legacy_default) values(%L,%L,%L,''Andra'',''andra'',true)',s.organizer_id,s.offering_id,s.unit_id),'23505','one legacy default');
 perform pg_temp.named_series_denied(format('insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name) values(%L,%L,%L,''Fel skola'',''fel skola'')',s.organizer_id,s.offering_id,x->>'foreignUnit'),'23503','series cannot use unlinked school');
 insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name)
 values(s.organizer_id,s.offering_id,s.unit_id,'Utökad matematik','utökad matematik') returning id into other_id;
 perform pg_temp.named_series_denied(format('update public.timplans set series_id=%L where id=%L',other_id,x->>'grundPlan'),'42501','existing version cannot move series');
 perform pg_temp.named_series_denied(format('update public.timplans set name_at_creation=''Inventerat'' where id=%L',x->>'grundPlan'),'42501','historical snapshot cannot be fabricated');
 perform pg_temp.named_series_denied(format('update public.timplan_series set legacy_default=false,revision=revision+1 where id=%L',s.id),'42501','default designation immutable');
 perform pg_temp.named_series_denied(format('update public.timplan_series set unit_id=%L,revision=revision+1 where id=%L',x->>'foreignUnit',s.id),'42501','series school immutable');
 perform pg_temp.named_series_denied(format('update public.timplan_series set name=''Nytt'',normalized_name=''nytt'' where id=%L',s.id),'42501','rename requires revision progression');
 -- Closed metadata can exist before rollout; old scope-wide indexes still reject
 -- a second live plan/version even when its series is explicitly different.
 perform pg_temp.named_series_denied(format('insert into public.timplans(organizer_id,offering_id,unit_id,version,series_id,status) select organizer_id,offering_id,unit_id,1,%L,''utkast'' from public.timplans where id=%L',other_id,x->>'grundPlan'),'23503','explicit foreign education series denied');
 select * into s from public.timplan_series where id=(select series_id from public.timplans where id=(x->>'grundPlan')::uuid);
 insert into public.timplan_series(organizer_id,offering_id,unit_id,name,normalized_name)
 values(s.organizer_id,s.offering_id,s.unit_id,'Andra','andra') returning id into other_id;
 perform pg_temp.named_series_denied(format('insert into public.timplans(organizer_id,offering_id,unit_id,version,series_id,status) select organizer_id,offering_id,unit_id,1,%L,''utkast'' from public.timplans where id=%L',other_id,x->>'grundPlan'),'23505','old version uniqueness retained across series');
 perform pg_temp.named_series_denied(format('insert into public.timplans(organizer_id,offering_id,unit_id,version,series_id,status) select organizer_id,offering_id,unit_id,99,%L,''utkast'' from public.timplans where id=%L',other_id,x->>'grundPlan'),'23505','old open uniqueness retained across series');
 perform pg_temp.named_series_denied(format('insert into public.timplans(organizer_id,offering_id,unit_id,version,series_id,status,decided_on) select organizer_id,offering_id,unit_id,99,%L,''faststalld'',current_date from public.timplans where id=%L',other_id,x->>'grundPlan'),'23505','old approved uniqueness retained across series');
 insert into public.timplans(organizer_id,offering_id,unit_id,version,status) select organizer_id,offering_id,unit_id,3,'ersatt' from public.timplans where id=(x->>'grundPlan')::uuid returning id into new_id;
 perform pg_temp.named_series_assert((select series_id=s.id and name_at_creation='Grundfördelning' from public.timplans where id=new_id),'legacy insert selects default despite other metadata series');
 update public.timplan_series set name='Grundfördelning uppdaterad',normalized_name='grundfördelning uppdaterad',revision=revision+1 where id=s.id;
 perform pg_temp.named_series_assert((select name_at_creation='Grundfördelning' from public.timplans where id=new_id),'rename preserves existing name snapshot');
 perform pg_temp.named_series_assert((select name_at_creation is null from public.timplans where id=(x->>'grundPlan')::uuid),'rename leaves historical snapshot unknown');
 insert into public.timplans(organizer_id,offering_id,unit_id,version,status) select organizer_id,offering_id,unit_id,4,'ersatt' from public.timplans where id=new_id returning id into new_id;
 perform pg_temp.named_series_assert((select series_id=s.id and name_at_creation='Grundfördelning uppdaterad' from public.timplans where id=new_id),'later insert snapshots current series name');
end $$;
