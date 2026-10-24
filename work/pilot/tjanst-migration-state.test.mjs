import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { classifyTjanstMigrations, TJANST_MIGRATION_REGISTRY as registry, TJANST_PHASE_START } from './tjanst-migration-state.mjs';

const versions = registry.map(m => m.version), gapVersions = versions.slice(0, 8);
const hashes = Object.fromEntries(registry.map(m => [m.file, m.sha256]));
const classify = (journal, sourceHashes = hashes) => classifyTjanstMigrations({ journal, sourceHashes });
for (const [name, journal, mode, pending] of [
  ['etapp 1', versions.slice(0, 7), 'etapp1', registry.slice(7).map(m => m.file)],
  ['installerad gaprättelse', gapVersions, 'etapp1+gap', registry.slice(8).map(m => m.file)],
  ['installerat publiceringssuffix', versions.slice(0,9), 'registered-suffix:20261023100000', registry.slice(9).map(m => m.file)],
  ['installerat årsförhandsgranskningssuffix', versions.slice(0,10), 'registered-suffix:20261023110000', registry.slice(10).map(m => m.file)],
  ['installerat årskommandosuffix', versions, 'registered-suffix:20261023120000', []],
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
