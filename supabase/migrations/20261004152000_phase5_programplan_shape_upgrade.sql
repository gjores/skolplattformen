-- 05-23 B D-12: only bound legacy drafts, including started/archived education locks.
-- Before values allow deliberate reverse migration; no user session or audit actor is invented.
create table public.programplan_shape_upgrades(
 plan_id uuid primary key,
 upgraded_at timestamptz not null default clock_timestamp(),
 old_revision integer not null,
 old_basis_reference jsonb not null,
 old_term_distribution jsonb not null
);
alter table public.programplan_shape_upgrades enable row level security;
revoke all on public.programplan_shape_upgrades from public,anon,authenticated,skolplattform_worker,service_role;
-- Preserve old timestamps as well as unrelated business values. The same transaction
-- restores the inventoried enabled touch trigger; all validation guards stay enabled.
lock table public.point_plans in share row exclusive mode;
do $$ begin
 if not exists(select 1 from pg_trigger where tgrelid='public.point_plans'::regclass and tgname='point_plans_touch' and tgenabled='O') then
  raise exception 'Unexpected point plan touch trigger state' using errcode='55000';end if;
end $$;
alter table public.point_plans disable trigger point_plans_touch;
do $$
declare p public.point_plans;
begin
 for p in select * from public.point_plans where status='utkast' and catalog_id is not null and not basis_reference ? 'choiceBlocks' order by id for update loop
  insert into public.programplan_shape_upgrades(plan_id,old_revision,old_basis_reference,old_term_distribution)
  values(p.id,p.revision,p.basis_reference,p.term_distribution);
  update public.point_plans set basis_reference=public.phase5_programplan_upgrade_shape(p.basis_reference),
   term_distribution=public.phase5_programplan_upgrade_terms(p.basis_reference,p.term_distribution),revision=p.revision+1 where id=p.id;
 end loop;
end $$;

alter table public.point_plans enable trigger point_plans_touch;
