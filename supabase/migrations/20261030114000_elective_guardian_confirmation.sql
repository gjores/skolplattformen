-- VB-07. School policy controls whether required, explicitly registered guardians confirm choices.
begin;
create table public.elective_policy_history (
 unit_id uuid not null references public.school_units(id),policy_revision integer not null,guardian_confirmation boolean not null,
 applied_at timestamptz not null default clock_timestamp(),actor_assignment_id uuid not null references public.access_assignments(id),
 primary key(unit_id,policy_revision)
);
alter table public.elective_policy_history enable row level security;
alter table public.elective_policy_history force row level security;
revoke all on public.elective_policy_history from public,anon,authenticated,skolplattform_worker;
create or replace function public.elective_apply_policy(unit uuid,guardian boolean,policy_revision integer) returns void
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a public.access_assignments;
begin
 a:=public.elective_staff_scope(unit);
 if guardian is null or policy_revision is null then raise exception 'Invalid policy' using errcode='22023';end if;
 insert into public.elective_policy_history(unit_id,policy_revision,guardian_confirmation,actor_assignment_id) values(unit,policy_revision,guardian,a.id);
 -- This is the explicit school policy command. Old signatures/choices/placements are retained.
 update public.elective_rounds r set guardian_confirmation=guardian,policy_revision=elective_apply_policy.policy_revision,revision=r.revision+1
 where r.unit_id=unit and r.status='open';
end $$;
create or replace function public.elective_guardian_choice(input jsonb,authority jsonb) returns public.elective_choices
language plpgsql volatile security definer set search_path=pg_catalog,public as $$
declare a jsonb;p jsonb;r public.elective_rounds;c public.elective_choices;g public.elective_participant_bindings;existing public.elective_guardian_confirmations;
begin
 a:=public.elective_participant_actor();
 if a<>authority or a->>'participant'<>'guardian' then raise exception 'Guardian authority denied' using errcode='42501';end if;
 p:=input->'payload';perform public.phase4_keys(p,array['choiceId','expectedChoiceRevision','offeringRevision','decision']);
 if p->>'decision' not in ('approve','decline') then raise exception 'Invalid guardian decision' using errcode='22023';end if;
 select x.* into c from public.elective_choices x join public.elective_rounds y on y.id=x.round_id where x.id=(p->>'choiceId')::uuid
  and x.pupil_id=(a->>'pupilId')::uuid and y.unit_id=(a->>'unitId')::uuid for update of x;
 if not found then raise exception 'Child choice denied' using errcode='42501';end if;
 select * into r from public.elective_rounds where id=c.round_id for update;
 perform public.elective_assert_current_round(r);
 if r.status<>'open' or public.app_today()>(r.offer_snapshot->>'endsOn')::date then raise exception 'Offering closed' using errcode='40001',hint='elective_round_closed';end if;
 if c.revision<>(p->>'expectedChoiceRevision')::integer or c.offering_revision<>(p->>'offeringRevision')::integer or c.offering_revision<>r.offering_revision then raise exception 'Choice changed' using errcode='40001',hint='elective_choice_conflict';end if;
 if not r.guardian_confirmation then raise exception 'Confirmation not required' using errcode='40001',hint='elective_confirmation_conflict';end if;
 select * into g from public.elective_participant_bindings where id=(a->>'bindingId')::uuid for update;
 if not found or g.pupil_id<>c.pupil_id or g.unit_id<>r.unit_id or g.participant<>'guardian' or not g.confirmation_required or g.revoked_at is not null
  or g.starts_on>public.app_today() or (g.ends_on is not null and g.ends_on<public.app_today()) then raise exception 'Guardian relation denied' using errcode='42501';end if;
 select * into existing from public.elective_guardian_confirmations gc where gc.binding_id=g.id and gc.binding_revision=g.revision
 and gc.choice_id=c.id and gc.choice_revision=c.revision and gc.offering_revision=c.offering_revision;
 if found then
  if existing.decision<>p->>'decision' then raise exception 'Decision already recorded for this choice version' using errcode='40001',hint='elective_confirmation_conflict';end if;
 else
  insert into public.elective_guardian_confirmations(id,binding_id,binding_revision,choice_id,choice_revision,offering_revision,decision)
  values(gen_random_uuid(),g.id,g.revision,c.id,c.revision,c.offering_revision,p->>'decision');
 end if;
 return c;
end $$;
revoke all on function public.elective_apply_policy(uuid,boolean,integer),public.elective_guardian_choice(jsonb,jsonb) from public,anon,authenticated,skolplattform_worker;
commit;
