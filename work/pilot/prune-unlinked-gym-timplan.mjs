// Beställd rensning av EN inventerad äldre syntetisk gymnasietimplan.
// --verify provar rensning, migration och spärrar med yttre rollback.
// --apply tar privat återställningskopia och genomför samma transaktion.
// Inga programplaner, klasser eller andra timplaner raderas.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID, createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const postgres = require('postgres');
const mode = process.argv[2];
assert.ok(['--verify', '--apply'].includes(mode) && process.argv.length === 3, 'Use --verify or --apply');
const id = '10000000-0000-4000-8000-000000000401';
const version = '20261012130000';
const migration = readFileSync(new URL(`../../supabase/migrations/${version}_gym_timplan_requires_programplan.sql`, import.meta.url), 'utf8');
const target = await assertTarget('protected');
const db = postgres(target.dbUrl, { max: 1, onnotice: () => {} });
const tables = ['offerings', 'offering_units', 'point_plans', 'point_plan_events', 'timplans', 'timplan_cells', 'timplan_events', 'class_timplans', 'gym_timplan_receipts', 'programplan_unit_packages'];
const hash = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function snapshot(tx) {
 const result = {};
 for (const table of tables) result[table] = (await tx.unsafe(`select coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb) rows from public.${table} r`))[0].rows;
 return result;
}
async function rollbackProbe(tx, check) {
 try { await tx.savepoint(async probe => { await check(probe); throw Error('probe_rollback'); }); }
 catch (error) { if (error.message !== 'probe_rollback') throw error; }
}
let result;
try {
 try {
  await db.begin(async tx => {
   await tx`set local lock_timeout='5s'`;
   await tx`set local statement_timeout='20s'`;
   await tx.unsafe(`lock table ${tables.map(t => `public.${t}`).join(',')} in share row exclusive mode`);
   const before = await snapshot(tx);
   const gymIds = new Set(before.offerings.filter(o => o.kind === 'gymnasium').map(o => o.id));
   const orphans = before.timplans.filter(t => gymIds.has(t.offering_id) && t.source_programplan_id === null);
   assert.deepEqual(orphans.map(t => t.id), [id], 'Inventory changed: no automatic widening of deletion');
   const old = orphans[0];
   assert.equal(old.gym_basis, null);
   assert.equal(before.class_timplans.filter(c => c.timplan_id === id).length, 0, 'Plan has class links');
   assert.equal(before.gym_timplan_receipts.filter(c => c.timplan_id === id).length, 0, 'Plan has command receipts');
   assert.equal(before.timplan_events.filter(c => c.timplan_id === id).length, 0, 'Plan has history');
   assert.equal((await tx`select version from supabase_migrations.schema_migrations where version=${version}`).length, 0, 'Migration already installed');
   // Migration must refuse unreviewed legacy data, before changing any functions.
   await assert.rejects(tx.savepoint(async probe => { await probe.unsafe(migration); }), e => e.code === '23514');
   let backup;
   if (mode === '--apply') {
    backup = fileURLToPath(new URL(`../../web/outputs/unlinked-gym-backup-${Date.now()}.json`, import.meta.url));
    writeFileSync(backup, JSON.stringify({ plan: old, cells: before.timplan_cells.filter(c => c.timplan_id === id), events: [], migrationVersion: version }, null, 2), { mode: 0o600, flag: 'wx' });
   }
   const removed = await tx`delete from public.timplans where id=${id} and source_programplan_id is null returning id`;
   assert.equal(removed.length, 1);
   await tx.unsafe(migration);
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'gym_timplan_requires_programplan',${[migration]})`;
   // A raw insert cannot reintroduce the unlinked GY plan (even as database owner).
   await assert.rejects(tx.savepoint(async probe => {
    await probe`insert into public.timplans select * from jsonb_populate_record(null::public.timplans,${probe.json(old)})`;
   }), e => e.code === '23514');
   // Both other school forms retain their independent bases.
   for (const kind of ['grundskola','introduktionsprogram']) {
    const offering = before.offerings.find(o => o.kind === kind && before.timplans.some(t => t.offering_id === o.id));
    const original = before.timplans.find(t => t.offering_id === offering.id);
    await rollbackProbe(tx, async probe => {
     const copy = { ...original, id: randomUUID(), version: 1000000, status: 'ersatt' };
     await probe`insert into public.timplans select * from jsonb_populate_record(null::public.timplans,${probe.json(copy)})`;
    });
   }
   // Existing linked plans cannot lose their source; its FK also prevents source deletion.
   const linked = before.timplans.find(t => t.source_programplan_id);
   await assert.rejects(tx.savepoint(async probe => { await probe`update public.timplans set source_programplan_id=null,gym_basis=null where id=${linked.id}`; }), e => ['23514','42501'].includes(e.code));
   await assert.rejects(tx.savepoint(async probe => { await probe`delete from public.point_plans where id=${linked.source_programplan_id}`; }), e => ['23503','42501'].includes(e.code));
   const expected = { ...before, timplans: before.timplans.filter(t => t.id !== id), timplan_cells: before.timplan_cells.filter(c => c.timplan_id !== id) };
   assert.deepEqual(await snapshot(tx), expected, 'Unrelated business data changed');
   result = { mode, deletedTimplans: 1, deletedCells: before.timplan_cells.length - expected.timplan_cells.length, deletedProgramplans: 0, preservedProgramplans: before.point_plans.length, preservedLinkedGymTimplans: before.timplans.filter(t => t.source_programplan_id).length, preservedBusinessTables: tables.length, beforeHash: hash(before), expectedAfterHash: hash(expected), migrationVersion: version, migrationSha: hash(migration), probesPassed: 6, backup: backup ?? null };
   if (mode === '--verify') throw Error('outer_verification_rollback');
  });
 } catch (error) { if (!(mode === '--verify' && error.message === 'outer_verification_rollback')) throw error; }
 const after = await db.begin('read only', snapshot);
 assert.equal(hash(after), mode === '--verify' ? result.beforeHash : result.expectedAfterHash, 'Post-transaction preservation check failed');
 result.committed = mode === '--apply'; result.postTransactionVerified = true;
 writeFileSync(new URL(`../../web/outputs/unlinked-gym-${mode.slice(2)}.json`, import.meta.url), JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} finally { await db.end(); }
