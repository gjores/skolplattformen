#!/usr/bin/env node
// Stängda SQL-entrypoints som postgres: inget Worker/API-bevis.
// Två riktiga anslutningar, observerade lås, enbart egna syntetiska fixturer.
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
let a, b, roles, setup = false, complete = false, activeCase = 'setup', failureCode;
const context = async (sql, second = false) => {
  await sql`select set_config('app.customer_id',${id(1)},true),
    set_config('app.assignment_id',${roles[second ? 'principal2' : 'principal']},true),
    set_config('app.membership_id',${id(second ? 22 : 21)},true),
    set_config('app.identity_id',${id(second ? 12 : 11)},true),
    set_config('app.correlation_id',${randomUUID()},true)`;
};
const change = async (sql, revision, column, value) => {
  const [r] = await sql`select public.phase5_change_timplan_cell(${id(50)},${revision},'matematik',${column},${value}) as result`;
  return r.result;
};
try {
  const source = fs.readFileSync(new URL('../../supabase/tests/phase5_timplan.test.sql', import.meta.url), 'utf8');
  const codePrefix = String(parseInt(prefix, 16)).padStart(10, '0').slice(-6);
  const fixture = source.slice(source.indexOf('-- Planning fixture:'), source.indexOf('-- End planning fixture.'))
    .replaceAll('55003000', prefix).replaceAll('planning.example.test', `${prefix}.planning.example.test`)
    .replaceAll('55003030', `${codePrefix}30`).replaceAll('55003031', `${codePrefix}31`);
  await db.begin(async tx => {
    await tx.unsafe(fixture);
    roles = Object.fromEntries((await tx`select name,id from planning_roles`).map(r => [r.name, r.id]));
  });
  setup = true;
  a = await db.reserve(); b = await db.reserve();
  const [{ pid: aPid }] = await a`select pg_backend_pid() as pid`;
  const [{ pid: bPid }] = await b`select pg_backend_pid() as pid`;
  const waitForLock = async () => {
    for (let attempt = 0; attempt < 150; attempt++) {
      const [r] = await db`select ${aPid}::integer=any(pg_blocking_pids(${bPid})) as waiting,
        (select locktype from pg_locks where pid=${bPid} and not granted limit 1) as kind`;
      if (r.waiting) return r.kind;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    throw new Error('Expected lock was not observed');
  };
  for (const name of ['same-cell', 'different-cell', 'parent-revoked', 'plan-row']) {
    activeCase = name;
    const [{ revision }] = await db`select revision from public.timplans where id=${id(50)}`;
    const [before] = await db`select hours from public.timplan_cells where timplan_id=${id(50)} and row_id='matematik'`;
    await a`begin`; await b`begin`;
    await a`set local statement_timeout='15s'`; await b`set local statement_timeout='15s'`;
    await context(a); await context(b, true);
    if (name === 'parent-revoked') {
      await a`select public.phase3_lock_customer(${id(1)})`;
      await a`update public.access_assignments set ended_at=clock_timestamp() where id=${id(60)}`;
    } else if (name === 'plan-row') {
      await a`select id from public.timplans where id=${id(50)} for update`;
    } else {
      const result = await change(a, revision, 0, before.hours[0] + 1);
      if (result.revision !== revision + 1) throw new Error('First write failed');
    }
    const pending = change(b, revision, name === 'different-cell' ? 1 : 0, 999)
      .then(result => ({ result }), error => ({ code: error.code }));
    const lock = await waitForLock();
    if (name === 'plan-row' ? !['transactionid', 'tuple'].includes(lock) : lock !== 'advisory')
      throw new Error('Unexpected lock layer');
    if (name === 'plan-row') await a`update public.timplans set revision=revision+1 where id=${id(50)}`;
    await a`commit`;
    const outcome = await pending;
    const expected = name === 'parent-revoked' ? '42501' : '40001';
    if (outcome.code !== expected) throw new Error('Stale or revoked write accepted');
    await b`rollback`;
    const [{ revision: afterRevision }] = await db`select revision from public.timplans where id=${id(50)}`;
    const [after] = await db`select hours from public.timplan_cells where timplan_id=${id(50)} and row_id='matematik'`;
    const expectedHours = [...before.hours];
    if (['same-cell', 'different-cell'].includes(name)) expectedHours[0]++;
    if (afterRevision !== revision + (name === 'parent-revoked' ? 0 : 1)
      || JSON.stringify(after.hours) !== JSON.stringify(expectedHours)) throw new Error('Denied write changed data');
    cases.push({ name, waitingObserved: true, lockType: lock, outcome: expected, dataPreserved: true });
    if (name === 'parent-revoked') await db`update public.access_assignments set ended_at=null where id=${id(60)}`;
  }
  complete = true;
} catch (error) {
  failureCode = typeof error?.code === 'string' && /^[A-Z0-9_]{1,40}$/.test(error.code) ? error.code : 'TEST_FAILED';
  process.exitCode = 1;
} finally {
  for (const connection of [a, b]) if (connection) { await connection`rollback`.catch(() => {}); connection.release(); }
  if (setup) await db.begin(async tx => {
    const [{ owned }] = await tx`select exists(select 1 from public.customers where id=${id(1)} and name='Syntetiskt timplansprov') as owned`;
    if (!owned || !/^[0-9a-f]{8}$/.test(prefix)) throw new Error('Fixture cleanup refused');
    // Endast provägaren, exakt denna fixturkunden. Appen har aldrig dessa rättigheter.
    await tx`set local session_replication_role=replica`;
    await tx`delete from public.security_events where customer_id=${id(1)}`;
    await tx`delete from public.class_timplans where unit_id in (${id(30)},${id(31)})`;
    await tx`delete from public.timplan_cells where timplan_id in (select id from public.timplans where organizer_id=${id(2)})`;
    await tx`delete from public.timplans where organizer_id=${id(2)}`;
    await tx`delete from public.mandate_units where customer_id=${id(1)}`;
    await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
    await tx`delete from public.access_assignments where customer_id=${id(1)}`;
    await tx`delete from public.assignment_units where assignment_id in (select id from public.assignments where organizer_id=${id(2)})`;
    await tx`delete from public.assignments where organizer_id=${id(2)}`;
    await tx`delete from public.offerings where organizer_id=${id(2)}`;
    await tx`delete from public.school_units where organizer_id=${id(2)}`;
    await tx`delete from public.memberships where customer_id=${id(1)}`;
    await tx`delete from public.organizers where id=${id(2)}`;
    await tx`delete from public.identities where id in (${id(10)},${id(11)},${id(12)},${id(13)},${id(14)})`;
    await tx`delete from public.customers where id=${id(1)}`;
  });
  await db.end();
  const result = { target: 'protected', status: complete ? 'PASS' : 'FAIL', cases,
    ...(failureCode ? { failedCase: activeCase, code: failureCode } : {}) };
  fs.writeFileSync(new URL('./results/phase5-timplan-locks.json', import.meta.url), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
}
