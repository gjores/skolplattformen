-- VB157: explicit least privilege even when the provider grants service_role ALL by default.
-- Only tables introduced by VB01–VB09. Existing staffing/register tables and default ACLs stay unchanged.
revoke all privileges on table
 public.elective_school_state,public.elective_blocks,public.elective_block_sources,public.elective_options,
 public.teaching_groups,public.teaching_group_sources,public.elective_commands,
 public.elective_participant_bindings,public.elective_binding_commands,
 public.elective_time_details,public.elective_time_versions,public.elective_time_commands,
 public.elective_group_snapshots,public.elective_applied_groups,
 public.tjanst_version_group_sources,public.tjanst_version_class_basis,
 public.elective_rounds,public.elective_choices,public.elective_choice_history,
 public.elective_guardian_confirmations,public.elective_self_commands,
 public.elective_policy_history,public.elective_placements,public.elective_placement_history
 from public,anon,authenticated,service_role,skolplattform_worker;

-- These are the elective module's closed helpers and guarded entrypoints. Preserve explicit
-- Worker EXECUTE grants from the earlier migrations; removing PUBLIC does not remove those grants.
-- No tjanst_* or unrelated function/default privileges are changed.
do $$declare fn regprocedure;begin
 for fn in select p.oid::regprocedure from pg_proc p
  where p.pronamespace='public'::regnamespace and p.prokind='f' and p.proname ~ '^elective_'
 loop
  execute format('revoke all privileges on function %s from public,anon,authenticated,service_role',fn);
 end loop;
end $$;
