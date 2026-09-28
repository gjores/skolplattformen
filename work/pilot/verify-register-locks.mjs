#!/usr/bin/env node
// Real connections and observed server locks, restricted to fresh synthetic IDs.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { assertTarget } from './verify-target.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const postgres = require('postgres');
if (process.argv.length > 2) throw new Error('REFUSED: inga flaggor tillåtna');
const target = await assertTarget('protected');
const db = postgres(target.dbUrl, { max: 3, prepare: false, connect_timeout: 10, onnotice: () => {} });
const prefix = randomUUID().slice(0, 8);
const id = n => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const cases = [];
let a, b, roles, complete = false, setup = false, failureCode = null, activeCase = 'setup', schoolYear;
const context = async (sql, role) => {
  const member = role === 'hm' ? 20 : role === 'admin' ? 22 : 23;
  await sql`select set_config('app.customer_id',${id(1)},true),set_config('app.assignment_id',${role === 'hm' ? id(60) : roles[role]},true),set_config('app.membership_id',${id(member)},true),set_config('app.identity_id',${id(member - 10)},true)`;
};
const request = (kind, payload, expectedVersion) => ({ pupilId: id(70), schoolYear, caseId: null, expectedVersion, kind, payload });
const change = async (sql, value) => {
  const [r] = await sql`select public.phase4_change_pupil(${sql.json(value)}) as result`;
  return r.result;
};
const waitForLock = async (pid, blocker) => {
  for (let attempt = 0; attempt < 150; attempt++) {
    const [row] = await db`select ${blocker}::integer=any(pg_blocking_pids(${pid})) as waiting,(select locktype from pg_locks where pid=${pid} and not granted limit 1) as locktype`;
    if (row.waiting) return row.locktype;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  throw new Error('Expected competing connection lock was not observed');
};
try {
  // Reuse the versioned SQL fixture, with all its IDs and school codes replaced.
  const source = fs.readFileSync(new URL('../../supabase/tests/phase4_conflicts.test.sql', import.meta.url), 'utf8');
  const fixture = source.slice(source.indexOf('-- Mutation fixture:'), source.indexOf("select has_function('public','phase4_change_pupil'"))
    .replaceAll('44005000', prefix).replaceAll('mutation.example.test', `${prefix}.mutation.example.test`).replaceAll("'440050'||n", `'${String(parseInt(prefix.slice(0, 5), 16)).padStart(7, '0').slice(0, 6)}'||n`);
  await db.begin(async tx => {
    await tx.unsafe(fixture);
    roles = Object.fromEntries((await tx`select name,id from mutation_roles`).map(r => [r.name, r.id]));
  });
  setup = true;
  a = await db.reserve(); b = await db.reserve();
  const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
  const [{ pid: bPid }] = await b`select pg_backend_pid() as pid`;
  const [{ nextday, later, year }] = await db`select (public.app_today()+1)::text as nextday,(public.app_today()+2)::text as later,(extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end) as year`;
  schoolYear = year;
  for (const name of ['different-fields', 'same-field', 'period', 'membership-block', 'protection-revoked', 'pupil-row-lock']) {
    activeCase = name;
    const [{ version }] = await db`select version from public.pupils where id=${id(70)}`;
    if (name === 'protection-revoked') {
      await db.begin(async tx => {
        await tx`update public.pupils set protected_identity=true where id=${id(70)}`;
        await context(tx, 'hm');
        await tx`select public.phase4_grant_protected_permission(${roles.admin2},${id(30)})`;
      });
    }
    await a`begin`; await b`begin`;
    await a`set local statement_timeout='15s'`; await b`set local statement_timeout='15s'`;
    await context(a, name === 'protection-revoked' ? 'hm' : 'admin'); await context(b, 'admin2');
    let pendingRequest;
    if (name === 'membership-block') {
      await a`select public.phase3_lock_customer(${id(1)})`;
      await a`update public.memberships set status='blocked',blocked_at=clock_timestamp() where id=${id(23)}`;
      pendingRequest = request('basics', { displayName: 'Syntetiskt spärrprov' }, version);
    } else if (name === 'protection-revoked') {
      const [{ permission }] = await a`select id as permission from public.protected_identity_permissions where assignment_id=${roles.admin2} and revoked_at is null`;
      await a`select public.phase4_revoke_protected_permission(${permission})`;
      pendingRequest = request('basics', { displayName: 'Syntetiskt skyddsprov' }, version);
    } else if (name === 'pupil-row-lock') {
      await a`select id from public.pupils where id=${id(70)} for update`;
      pendingRequest = request('municipality', { municipalityCode: '0180', startsOn: later, endsOn: null }, version);
    } else {
      const first = name === 'period' ? request('municipality', { municipalityCode: '0180', startsOn: nextday, endsOn: null }, version) : request('basics', { displayName: `Syntetiskt ${name}` }, version);
      if ((await change(a, first)).kind !== 'success') throw new Error('First writer failed');
      pendingRequest = name === 'different-fields' ? request('basics', { personalNumber: 'TEST-20100101-0022' }, version) : name === 'period' ? request('municipality', { municipalityCode: '0180', startsOn: later, endsOn: null }, version) : request('basics', { displayName: 'Syntetiskt andra valet' }, version);
    }
    const pending = change(b, pendingRequest).then(result => ({ result }), error => ({ code: error.code }));
    const observedLock = await waitForLock(bPid, aPid);
    if (name === 'pupil-row-lock' ? !['transactionid', 'tuple'].includes(observedLock) : observedLock !== 'advisory') throw new Error('Unexpected lock layer');
    if (name === 'pupil-row-lock') await a`update public.pupils set version=version+1,updated_at=clock_timestamp() where id=${id(70)}`;
    await a`commit`;
    const outcome = await pending;
    const expected = name === 'different-fields' ? 'success' : name === 'membership-block' ? '42501' : name === 'protection-revoked' ? 'P0002' : 'conflict';
    if ((outcome.code ?? outcome.result?.kind) !== expected) throw new Error(`Unexpected result in ${name}`);
    if (outcome.result?.kind === 'conflict' && outcome.result.details.currentVersion !== version + 1) throw new Error('Conflict did not read committed version');
    if (outcome.code) await b`rollback`; else await b`commit`;
    cases.push({ name, waitingObserved: true, lockType: observedLock, outcome: expected, committedVersionObserved: !outcome.code });
    if (name === 'membership-block') await db`update public.memberships set status='active',blocked_at=null where id=${id(23)}`;
    if (name === 'protection-revoked') await db`update public.pupils set protected_identity=false where id=${id(70)}`;
  }
  complete = true;
} catch (error) {
  failureCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'TEST_FAILED';
  process.exitCode = 1;
} finally {
  for (const connection of [a, b]) if (connection) { await connection`rollback`.catch(() => {}); connection.release(); }
  if (setup) await db.begin(async tx => {
    // Privileged fixture cleanup only, this session/transaction and these IDs.
    // The application never obtains this role or bypasses append-only history.
    const [{ owned }] = await tx`select exists(select 1 from public.customers where id=${id(1)} and name='Syntetiskt ändringsprov') as owned`;
    if (!owned || !/^[0-9a-f]{8}$/.test(prefix)) throw new Error('Fixture cleanup scope refused');
    await tx`set local session_replication_role=replica`;
    for (const table of ['pupil_field_history','pupil_field_state','pupil_home_municipalities','pupil_class_memberships','pupil_placements','pupils','protected_identity_permissions','mandate_units','access_assignments','school_classes']) await tx.unsafe(`delete from public.${table} where customer_id=$1`, [id(1)]);
    await tx`delete from public.assignment_units where assignment_id in (select id from public.assignments where organizer_id=${id(2)})`;
    await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
    await tx`delete from public.assignments where organizer_id=${id(2)}`;
    await tx`delete from public.offerings where organizer_id=${id(2)}`;
    await tx`delete from public.school_units where organizer_id=${id(2)}`;
    await tx`delete from public.memberships where customer_id=${id(1)}`;
    await tx`delete from public.organizers where id=${id(2)}`;
    await tx`delete from public.identities where id in (${id(10)},${id(11)},${id(12)},${id(13)})`;
    await tx`delete from public.customers where id=${id(1)}`;
  });
  await db.end();
  const result = { target: 'protected', status: complete ? 'PASS' : 'FAIL', cases, ...(failureCode ? { failedCase: activeCase, code: failureCode } : {}) };
  fs.writeFileSync(new URL('./results/phase4-register-locks.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
