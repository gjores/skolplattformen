import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { classifyTjanstMigrations, TJANST_MIGRATION_REGISTRY as registry, TJANST_PHASE_START, expectedTjanstWorkerEntrypoints } from './tjanst-migration-state.mjs';

const versions = registry.map(m => m.version), gapVersions = versions.slice(0, 8);
const hashes = Object.fromEntries(registry.map(m => [m.file, m.sha256]));
const classify = (journal, sourceHashes = hashes) => classifyTjanstMigrations({ journal, sourceHashes });
for (const [name, journal, mode, pending] of [
  ['etapp 1', versions.slice(0, 7), 'etapp1', registry.slice(7).map(m => m.file)],
  ['installerad gaprättelse', gapVersions, 'etapp1+gap', registry.slice(8).map(m => m.file)],
  ['installerat publiceringssuffix', versions.slice(0,9), 'registered-suffix:20261023100000', registry.slice(9).map(m => m.file)],
  ['installerat årsförhandsgranskningssuffix', versions.slice(0,10), 'registered-suffix:20261023110000', registry.slice(10).map(m => m.file)],
  ['installerat årskommandosuffix', versions.slice(0,11), 'registered-suffix:20261023120000', registry.slice(11).map(m=>m.file)],
  ['installerat årsbehörighetssuffix', versions.slice(0,12), 'registered-suffix:20261023130000', registry.slice(12).map(m=>m.file)],
  ['hela registret installerat', versions, 'registered-suffix:'+versions.at(-1), []],
  ['tidigare journalposter bevaras utanför fasen', ['20260910000000', ...gapVersions], 'etapp1+gap', registry.slice(8).map(m => m.file)],
]) test(name, () => {
  const result = classify(journal);
  assert.equal(result.baselineMode, mode);
  assert.deepEqual(result.pendingMigrations, pending);
  assert.deepEqual(result.unknown, []);
  assert.deepEqual(result.installed, journal.filter(v => v >= TJANST_PHASE_START));
});
for (const [name, journal] of [
  ['tom journal', []],
  ['saknad äldre migration', versions.filter((_, i) => i !== 0)],
  ['saknad mittenmigration', versions.filter((_, i) => i !== 4)],
  ['publiceringssuffix utan gaprättelse', versions.filter((_, i) => i !== 7)],
  ['ofullständig etapp 1', versions.slice(0, 6)],
  ['gap utan etapp 1', versions.slice(7)],
  ['omordnad journal', [...versions].reverse()],
  ['dubblerad version', [...versions, versions.at(-1)]],
  ['okänt suffix', [...versions, '20261024120000']],
  ['okänd version före gap', [...versions.slice(0, 7), '20261021110000', versions.at(-1)]],
  ['okänd tidig fasversion', ['20261020000001', ...versions]],
  ['felaktigt format', [...versions, 'unexpected']],
]) test('stoppar ' + name, () => assert.throws(() => classify(journal)));
for (const [name, sourceHashes] of [
  ['ändrad installerad källa', { ...hashes, [registry[0].file]: '0'.repeat(64) }],
  ['ändrad väntande källa', { ...hashes, [registry[7].file]: '0'.repeat(64) }],
  ['okänd källa', { ...hashes, 'supabase/migrations/20261024120000_unknown.sql': '0'.repeat(64) }],
  ['saknad källa', Object.fromEntries(Object.entries(hashes).slice(1))],
]) test('stoppar ' + name, () => assert.throws(() => classify(versions.slice(0, 7), sourceHashes)));

test('repots migrationskällor motsvarar uttrycklig allowlist och låsta hashvärden', () => {
  const files = readdirSync(new URL('../../supabase/migrations/', import.meta.url))
    .filter(f => /^\d{14}_.*\.sql$/u.test(f) && f.slice(0, 14) >= TJANST_PHASE_START).sort();
  const actual = Object.fromEntries(files.map(f => ['supabase/migrations/' + f, createHash('sha256')
    .update(readFileSync(new URL('../../supabase/migrations/' + f, import.meta.url))).digest('hex')]));
  assert.deepEqual(classify(versions, actual).pendingMigrations, []);
});

for (const length of [7,8,9,10,11,12]) test('ACL för verifierat prefix '+length,()=>{
  const expected=expectedTjanstWorkerEntrypoints({installed:versions.slice(0,length)});
  assert.equal(expected.length,length===12?13:12);
  assert.equal(expected.includes('tjanst_year_preview(jsonb)'),length===12);
  assert.deepEqual(expectedTjanstWorkerEntrypoints({installed:versions.slice(0,7),applied:registry.slice(7,length).map(m=>m.file)}),expected);
});
for(const installed of [[],versions.slice(1),[...versions,'20261024120000'],[...versions].reverse()]) test('ACL nekar felaktigt prefix '+installed.join(','),()=>assert.throws(()=>expectedTjanstWorkerEntrypoints({installed})));
test('ACL nekar okänd eller omapplicerad fil',()=>{
  assert.throws(()=>expectedTjanstWorkerEntrypoints({installed:versions,applied:['unknown.sql']}));
  assert.throws(()=>expectedTjanstWorkerEntrypoints({installed:versions,applied:[registry.at(-1).file]}));
});

// 05.1.1-06: läsårskalenderns två migrationer ligger sist i registret, efter VP-16 (exakt prefix).
const LASAR = ['supabase/migrations/20261111100000_lasar_versions.sql', 'supabase/migrations/20261111190000_lasar_worker_access.sql'];
// 05.1.1-08: de två kalenderfilerna är installerade på 3012 (2026-11-10) och låsta; gruppfilen sorterar efter dem.
const GROUPS = 'supabase/migrations/20261112100000_lasar_groups.sql';
// 05.1.1-09: ändringsbegäran, ny version och låsta passerade dagar; sorterar efter gruppfilen.
const CHANGES = 'supabase/migrations/20261112110000_lasar_change_requests.sql';
// 05.1.1-10: huvudmannens ram och arbetssätt; sorterar efter ändringsbegärans fil.
const FRAMES = 'supabase/migrations/20261112120000_lasar_frames.sql';
// 05.1.1-11: kopiering med granskningsposter och kalenderstatus per skola; sorterar efter ramens fil.
const COPY = 'supabase/migrations/20261112130000_lasar_copy_overview.sql';
// 05.1.1-11: överblickens Worker-ingång i en egen grant-fil direkt efter kopieringsfilen (den installerade grant-filen ändras inte).
const OVERVIEW_GRANT = 'supabase/migrations/20261112131000_lasar_overview_worker_access.sql';
/** Kalenderns filer som inte är installerade på 3012, i registrets ordning. */
const PENDING_3012 = [GROUPS, CHANGES, FRAMES, COPY, OVERVIEW_GRANT];
const INSTALLED_3012 = { 'supabase/migrations/20261111100000_lasar_versions.sql': '10961843a52192d38c962d0c9311d97538e9f8f4bba446868b02505ccb3f3f66',
  'supabase/migrations/20261111190000_lasar_worker_access.sql': '3b95e261bc48e8df8f8bbcdedbf9005050658ac6419c0e123208436e7216027c' };
test('kalenderns migrationer är registrerade sist och i versionsordning', () => {
  const first = registry.findIndex(m => m.file === LASAR[0]);
  assert.deepEqual(registry.slice(first, first + 2).map(m => m.file), LASAR);
  assert.ok(registry.slice(first).every(m => /_lasar_/u.test(m.file)), 'efter kalenderns första fil kommer bara kalenderns filer');
  assert.ok(versions.every((v, i) => i === 0 || v > versions[i - 1]), 'registret ska vara strikt ordnat');
  assert.ok(registry.slice(first).every(m => /^[0-9a-f]{64}$/u.test(m.sha256)));
});
test('installerat till och med VP-16 ger kalenderns två filer som väntande', () => {
  const vp16 = versions.indexOf('20261110100000');
  assert.ok(vp16 > 0);
  const result = classify(versions.slice(0, vp16 + 1));
  assert.deepEqual(result.pendingMigrations.slice(0, 2), LASAR);
  assert.deepEqual(result.pendingMigrations.slice(2), PENDING_3012);
  assert.equal(result.baselineMode, 'registered-suffix:20261110100000');
});
test('kalendern kan inte installeras före VP-16', () => {
  assert.throws(() => classify(versions.filter(v => v !== '20261110100000')));
  assert.throws(() => classify([...versions.slice(0, versions.indexOf('20261110100000')), '20261111100000']));
});
test('installerat på 3012 till och med 20261111190000 ger alla ej installerade kalenderfiler som väntande, i ordning', () => {
  const end = versions.indexOf('20261111190000');
  assert.ok(end > 0);
  const result = classify(versions.slice(0, end + 1));
  assert.deepEqual(result.pendingMigrations, PENDING_3012);
  assert.equal(result.baselineMode, 'registered-suffix:20261111190000');
  assert.ok(PENDING_3012.every((f, i) => f.split('/').at(-1).slice(0, 14) > (i ? PENDING_3012[i - 1].split('/').at(-1).slice(0, 14) : '20261111190000')));
});
test('ändringsbegärans fil (05.1.1-09) är registrerad direkt efter gruppfilen', () => {
  const at = registry.findIndex(m => m.file === GROUPS);
  assert.equal(registry[at + 1]?.file, CHANGES);
  assert.match(registry[at + 1].sha256, /^[0-9a-f]{64}$/u);
});
test('ramens fil (05.1.1-10) är registrerad direkt efter ändringsbegärans fil', () => {
  const at = registry.findIndex(m => m.file === CHANGES);
  assert.equal(registry[at + 1]?.file, FRAMES);
  assert.match(registry[at + 1].sha256, /^[0-9a-f]{64}$/u);
});
test('kopieringens och överblickens fil (05.1.1-11) är registrerad direkt efter ramens fil, och grant-filen direkt efter den och sist', () => {
  const at = registry.findIndex(m => m.file === FRAMES);
  assert.equal(registry[at + 1]?.file, COPY);
  assert.equal(registry[at + 2]?.file, OVERVIEW_GRANT);
  assert.equal(registry.at(-1).file, OVERVIEW_GRANT);
  assert.match(registry[at + 1].sha256, /^[0-9a-f]{64}$/u); assert.match(registry[at + 2].sha256, /^[0-9a-f]{64}$/u);
});
test('de installerade kalenderfilernas hashar står fast', () => {
  for (const [file, sha256] of Object.entries(INSTALLED_3012)) assert.equal(registry.find(m => m.file === file)?.sha256, sha256, file);
});
