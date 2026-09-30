import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCatalogArtifact } from './build-programplan-catalog.mjs';
import { createProgramplanCatalogSql, runCatalogSqlGenerator } from './build-programplan-catalog-sql.mjs';
import { canonicalCatalogJson } from '../lib/programplan-catalog.ts';

function artifact(name = 'Ämne med citat " och apostrof \' samt\nny rad \u2028') {
  return createCatalogArtifact({ source: 'https://api.skolverket.se/syllabus/v1', apiVersion: '1', fetched: '2026-09-05', schoolTypes: ['GY'],
    subjects: [{ code: 'TEST', name, typeOfSyllabus: 'GRADE_SUBJECT_SYLLABUS', schoolTypes: ['GY'], version: 1,
      startDate: '2025-07-01', items: [{ code: 'TEST1000X', name, points: 100 }] }], programs: [] });
}
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'skolplattform-programplan-sql-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'seed.sql');
}
test('SQL transport is deterministic and preserves canonical Unicode, quotes and newlines', async () => {
  const input = artifact(), original = structuredClone(input);
  const sql = await createProgramplanCatalogSql(input);
  assert.equal(sql, await createProgramplanCatalogSql(input));
  const { catalogId, ...payload } = input;
  const transported = sql.split('$programplan_catalog_payload$')[1];
  assert.equal(transported, canonicalCatalogJson(payload));
  assert.deepEqual(JSON.parse(transported), payload);
  assert.ok(sql.includes(`values ('${catalogId}',`));
  assert.equal(sql.includes('on conflict'), false);
  assert.equal(sql.includes('grant '), false);
  assert.deepEqual(input, original);
});
test('integrity is checked before SQL generation and delimiter collisions fail closed', async (t) => {
  const input = artifact(); input.subjects[0].name = 'Changed without new hash';
  const outputFile = await temporary(t);
  await assert.rejects(runCatalogSqlGenerator({ artifact: input, outputFile }), /catalog_integrity_failed/);
  await assert.rejects(stat(outputFile), { code: 'ENOENT' });
  await assert.rejects(createProgramplanCatalogSql(artifact('$programplan_catalog_payload$')), /catalog_sql_delimiter_collision/);
});
test('--check never writes on match, mismatch or missing output', async (t) => {
  const outputFile = await temporary(t), input = artifact();
  await assert.rejects(runCatalogSqlGenerator({ artifact: input, outputFile, check: true }), /catalog_sql_missing/);
  await assert.rejects(stat(outputFile), { code: 'ENOENT' });
  await runCatalogSqlGenerator({ artifact: input, outputFile });
  const before = await stat(outputFile);
  assert.equal((await runCatalogSqlGenerator({ artifact: input, outputFile, check: true })).status, 'checked');
  assert.equal((await stat(outputFile)).mtimeMs, before.mtimeMs);
  const modified = `${await readFile(outputFile, 'utf8')} `;
  await writeFile(outputFile, modified);
  const after = await stat(outputFile);
  await assert.rejects(runCatalogSqlGenerator({ artifact: input, outputFile, check: true }), /catalog_sql_out_of_date/);
  assert.equal(await readFile(outputFile, 'utf8'), modified);
  assert.equal((await stat(outputFile)).mtimeMs, after.mtimeMs);
});
test('import is side-effect free and the full saved catalog produces the exact seed payload', async () => {
  const seed = new URL('../../supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql', import.meta.url);
  const before = await stat(seed).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
  await import(`${new URL('./build-programplan-catalog-sql.mjs', import.meta.url).href}?import-check`);
  const after = await stat(seed).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
  assert.equal(after?.mtimeMs ?? null, before?.mtimeMs ?? null);
  const input = JSON.parse(await readFile(new URL('../lib/programplan-catalog.generated.json', import.meta.url), 'utf8'));
  const { catalogId, ...payload } = input;
  const sql = await createProgramplanCatalogSql(input);
  assert.deepEqual(JSON.parse(sql.split('$programplan_catalog_payload$')[1]), payload);
  assert.ok(sql.includes(catalogId));
});
