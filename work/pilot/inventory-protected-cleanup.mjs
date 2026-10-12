#!/usr/bin/env node
// Local, read-only inventory. A fixture signature is not permission to remove it.
// No row values, names, comments, credentials, pupil data or tokens are exported.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import { assertTarget } from './verify-target.mjs';

async function main() {
const quote = value => '"' + value.replaceAll('"', '""') + '"';
const args = process.argv.slice(2);
assert.ok(args.length === 2 && args[0] === '--out', 'Usage: node work/pilot/inventory-protected-cleanup.mjs --out /private/tmp/new-report.json');
const out = resolve(args[1]);
assert.ok(/^\/private\/tmp\/[^/]+\.json$/u.test(out), 'Private report must be a new JSON file directly under /private/tmp.');
const target = await assertTarget('protected');
const db = createRequire(new URL('../../web/package.json', import.meta.url))('postgres')(target.dbUrl, {
  max: 1, prepare: false, connect_timeout: 10, onnotice: () => {},
  connection: { application_name: 'protected_cleanup_read_only_inventory', default_transaction_read_only: 'on' },
});
let report;
try {
  report = await db.begin('isolation level repeatable read read only', async tx => {
    await tx`set local statement_timeout = '10s'`;
    await tx`set local lock_timeout = '3s'`;
    await tx`set local idle_in_transaction_session_timeout = '30s'`;
    const [guard] = await tx`select current_setting('transaction_read_only') read_only, current_setting('transaction_isolation') isolation`;
    assert.equal(guard.read_only, 'on');
    assert.equal(guard.isolation, 'repeatable read');
    const timings = [];
    const timed = async (label, run) => {
      const start = performance.now();
      const rows = await run();
      timings.push({ label, milliseconds: Math.round((performance.now() - start) * 10) / 10 });
      return rows;
    };
    const tables = await tx`select c.relname table_name, pg_total_relation_size(c.oid)::text total_bytes,
      pg_relation_size(c.oid)::text heap_bytes, pg_indexes_size(c.oid)::text index_bytes,
      s.n_live_tup::text estimated_live_rows, s.n_dead_tup::text estimated_dead_rows
      from pg_class c left join pg_stat_user_tables s on s.relid=c.oid
      where c.relnamespace='public'::regnamespace and c.relkind='r' order by c.relname`;
    for (const table of tables) {
      const [count] = await timed(`count:${table.table_name}`, () => tx.unsafe(`select count(*)::text count from public.${quote(table.table_name)}`));
      table.exact_rows = count.count;
    }
    const foreignKeys = await tx`select c.conrelid::regclass::text source_table, c.confrelid::regclass::text referenced_table,
      c.conname constraint_name, c.confdeltype delete_action, pg_get_constraintdef(c.oid) definition
      from pg_constraint c where c.contype='f' and c.connamespace='public'::regnamespace order by 1,3`;
    const indexes = await tx`select s.relname table_name,s.indexrelname index_name,s.idx_scan::text scans,
      pg_relation_size(s.indexrelid)::text bytes,i.indisvalid valid,i.indisunique unique_index
      from pg_stat_user_indexes s join pg_index i on i.indexrelid=s.indexrelid
      where s.schemaname='public' order by s.relname,s.indexrelname`;
    // Exact source markers plus UUID family plus expected organizer ownership.
    // This establishes fixture provenance, not that the fixture is abandoned.
    const customers = await timed('customer-provenance-and-dependencies', () => tx`
      select c.id customer_id,
        case when c.id in ('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002')
          then 'persistent-local-role-example-preserve'
          when c.name in ('Syntetiskt programplansprov','Syntetiskt 05-06 browserprov')
            and c.id::text ~ '^[0-9a-f]{8}-0000-4000-8000-000000000001$'
            and exists(select 1 from public.organizers o where o.customer_id=c.id
              and o.id::text=left(c.id::text,8)||'-0000-4000-8000-000000000002')
          then 'fixture-signature-match-review-activity'
          else 'unknown-provenance-preserve' end classification,
        c.created_at,
        (select count(*)::int from public.organizers o where o.customer_id=c.id) organizers,
        (select count(*)::int from public.memberships m where m.customer_id=c.id) memberships,
        (select count(*)::int from public.access_assignments a where a.customer_id=c.id) mandates,
        (select count(*)::int from public.app_sessions s join public.memberships m on m.id=s.membership_id
          where m.customer_id=c.id and s.revoked_at is null and least(s.expires_at,s.absolute_expires_at)>now()) live_sessions,
        (select max(s.last_seen_at) from public.app_sessions s join public.memberships m on m.id=s.membership_id where m.customer_id=c.id) last_session_activity,
        (select count(*)::int from public.offerings f join public.organizers o on o.id=f.organizer_id where o.customer_id=c.id) offerings,
        (select count(*)::int from public.point_plans p join public.organizers o on o.id=p.organizer_id where o.customer_id=c.id) programplans,
        (select count(*)::int from public.timplans p join public.organizers o on o.id=p.organizer_id where o.customer_id=c.id) timplans,
        (select count(*)::int from public.school_classes sc where sc.customer_id=c.id) classes,
        (select count(*)::int from public.pupils p where p.customer_id=c.id) pupils,
        (select count(*)::int from public.class_timplans ct join public.school_units u on u.id=ct.unit_id
          join public.organizers o on o.id=u.organizer_id where o.customer_id=c.id) class_links,
        (select count(*)::int from public.plan_decision_history h join public.organizers o on o.id=h.organizer_id where o.customer_id=c.id) decision_history_preserve,
        (select count(*)::int from public.security_events e where e.customer_id=c.id) security_history_preserve
      from public.customers c order by c.id`);
    const planStates = await timed('plan-status-counts', () => tx`
      select 'programplan' kind,p.status::text status,count(*)::text count from public.point_plans p group by p.status
      union all select 'timplan',t.status::text,count(*)::text from public.timplans t group by t.status order by 1,2`);
    const [relationships] = await timed('plan-link-counts', () => tx`
      select
        (select count(*)::int from public.point_plans p where not exists(select 1 from public.timplans t where t.source_programplan_id=p.id)) programplans_without_timplan_preserve,
        (select count(*)::int from public.timplans t join public.offerings o on o.id=t.offering_id
          where o.kind='gymnasium' and t.source_programplan_id is null) legacy_gym_timplans_without_source_review,
        (select count(*)::int from public.timplans t where t.source_programplan_id is not null and not exists(select 1 from public.point_plans p where p.id=t.source_programplan_id)) missing_programplan_references,
        (select count(*)::int from public.class_timplans ct join public.timplans t on t.id=ct.timplan_id
          where not exists(select 1 from public.school_classes c
            where c.unit_id=ct.unit_id and c.name=ct.class_name and c.offering_id=t.offering_id)) class_links_without_registered_unit_name_offering_review,
        (select count(*)::int from public.class_timplans ct join public.timplans t on t.id=ct.timplan_id
          where t.status::text not in ('faststalld','ersatt')) class_links_to_unapproved_version_review`);
    const [retainedEvidence] = await timed('retained-audit-anchor-counts', () => tx`
      select
        (select count(*)::int from public.identities i where not exists(select 1 from public.memberships m where m.identity_id=i.id)
          and exists(select 1 from public.security_events e where e.actor_identity_id=i.id)) audit_identity_anchors_preserve,
        (select count(*)::int from public.security_events e where e.customer_id is not null
          and not exists(select 1 from public.customers c where c.id=e.customer_id)) audit_rows_for_removed_fixture_customers_preserve,
        (select count(*)::int from public.app_sessions s where s.revoked_at is not null
          or least(s.expires_at,s.absolute_expires_at)<=now()) expired_or_revoked_sessions_retention_review`);
    const candidates = customers.filter(c => c.classification === 'fixture-signature-match-review-activity');
    const aggregate = {
      customerCount: customers.length,
      fixtureSignatureMatches: candidates.length,
      fixtureMatchesWithLiveSessions: candidates.filter(c => c.live_sessions > 0).length,
      provenAbandonedGraphs: 0,
      deletionsAuthorizedByInventory: 0,
      classifications: Object.fromEntries([...new Set(customers.map(c => c.classification))].map(k => [k, customers.filter(c => c.classification === k).length])),
      relationships,
      retainedEvidence,
    };
    return { kind: 'protected-cleanup-read-only-inventory', capturedAt: new Date().toISOString(), target: 'protected',
      readOnly: true, writes: 0, guard, aggregate, customers, tables, foreignKeys, indexes, planStates, timings,
      caveats: [
        'No record is a deletion candidate solely because its name looks synthetic, it has no links, or it is old.',
        'Fixture signature matches require a separate owning-run/lease investigation; absence of a session is not abandonment proof.',
        'Programplan drafts without timplans are intentional work in progress and must be preserved.',
        'Identities, mandates, security/audit and plan-decision history are preserved.',
        'Exact customer IDs and activity timestamps remain only in this private report. No personal row contents were read.',
        'Index scans/dead-row estimates describe PostgreSQL statistics, not an app latency benchmark or removal recommendation.',
      ],
    };
  });
} finally {
  await db.end({ timeout: 5 });
}
writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
console.log(JSON.stringify({ status: 'PASS', readOnly: true, writes: 0, ...report.aggregate }));

}
await main().catch(() => {
  console.error('FAIL: local read-only cleanup inventory did not complete; database details were not logged.');
  process.exitCode = 1;
});
