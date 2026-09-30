import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { createCatalogArtifact, runCatalogGenerator, serializeCatalogArtifact } from './build-programplan-catalog.mjs';
import { verifyProgramplanCatalog } from '../lib/programplan-catalog.ts';
import { syllabusSnapshot } from '../lib/syllabus-snapshot.ts';

const block = () => ({ code: 'TEST', name: 'Testämne', points: 100, optional: false,
  levels: [{ code: 'TEST1000X', name: 'Testämne, nivå 1', points: 100 }] });
function fixture() {
  return {
    source: 'https://api.skolverket.se/syllabus/v1', apiVersion: '1', fetched: '2026-09-05', schoolTypes: ['GY'],
    subjects: [{ code: 'TEST', name: 'Testämne', typeOfSyllabus: 'GRADE_SUBJECT_SYLLABUS', schoolTypes: ['GY'],
      version: 1, startDate: '2025-07-01', items: [{ code: 'TEST1000X', name: 'Testämne, nivå 1', points: 100 }] }],
    programs: [{ code: 'TEST25', name: 'Testprogram', category: 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION', version: 1,
      startDate: '2025-07-01', foundation: [block()], programmeSpecific: [], orientations: [], specialization: [] }],
  };
}
function reverseKeys(value) {
  if (Array.isArray(value)) return value.map(reverseKeys);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).reverse().map(([key, val]) => [key, reverseKeys(val)]));
  return value;
}
async function temporary(t) {
  const directory = await mkdtemp(join(tmpdir(), 'skolplattform-programplan-catalog-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return join(directory, 'catalog.json');
}

test('offline generation is byte-identical and compatible with the runtime integrity verifier', async (t) => {
  const outputFile = await temporary(t);
  const snapshot = fixture();
  const original = structuredClone(snapshot);
  const first = await runCatalogGenerator({ snapshot, outputFile });
  const firstBytes = await readFile(outputFile, 'utf8');
  await runCatalogGenerator({ snapshot, outputFile });
  assert.equal(await readFile(outputFile, 'utf8'), firstBytes);
  assert.deepEqual(snapshot, original);
  const verified = await verifyProgramplanCatalog(JSON.parse(firstBytes));
  assert.equal(verified.catalogId, first.catalogId);
  assert.deepEqual([first.subjects, first.items, first.programs], [1, 1, 1]);
});

test('object field order does not change identity; meaningful metadata and semantic block order do', () => {
  const original = fixture();
  const identity = createCatalogArtifact(original).catalogId;
  assert.equal(createCatalogArtifact(reverseKeys(original)).catalogId, identity);
  const changes = [
    (s) => { s.subjects[0].name = 'Nytt namn'; },
    (s) => { s.subjects[0].items[0].points = 150; s.programs[0].foundation[0].levels[0].points = 150; },
    (s) => { s.subjects[0].version = 2; },
    (s) => { s.programs[0].version = 2; },
    (s) => { s.programs[0].startDate = '2025-08-01'; },
    (s) => { s.programs[0].foundation[0].optional = true; },
    (s) => { s.programs[0].programmeSpecific = s.programs[0].foundation; s.programs[0].foundation = []; },
    (s) => { s.programs[0].category = 'VOCATIONAL_PROGRAM'; },
    (s) => { s.subjects[0].schoolTypes.push('VUXGY'); },
    (s) => { s.fetched = '2026-09-06'; },
  ];
  for (const change of changes) {
    const changed = structuredClone(original); change(changed);
    assert.notEqual(createCatalogArtifact(changed).catalogId, identity);
  }
  const withTwo = fixture();
  withTwo.subjects[0].items.push({ code: 'TEST2000X', name: 'Testämne, nivå 2', points: 100 });
  withTwo.programs[0].foundation[0].levels.push({ ...withTwo.subjects[0].items[1] });
  const ordered = createCatalogArtifact(withTwo).catalogId;
  withTwo.programs[0].foundation[0].levels.reverse();
  assert.notEqual(createCatalogArtifact(withTwo).catalogId, ordered);
});

test('catalog set order is canonical while source block points are preserved independently of level sums', () => {
  const s = fixture();
  s.subjects.push({ ...structuredClone(s.subjects[0]), code: 'SECOND', items: [{ code: 'SECOND1000X', name: 'Andra', points: 100 }] });
  s.programs.push({ ...structuredClone(s.programs[0]), code: 'SECOND25' });
  s.programs[0].foundation[0].points = 200;
  const first = createCatalogArtifact(s);
  s.subjects.reverse(); s.programs.reverse();
  assert.equal(createCatalogArtifact(s).catalogId, first.catalogId);
  assert.equal(first.programs.find((p) => p.code === 'TEST25').foundation[0].points, 200);
  assert.equal(first.programs.find((p) => p.code === 'TEST25').foundation[0].levels[0].points, 100);
});

test('--check is read-only on success, mismatch and missing artifact', async (t) => {
  const outputFile = await temporary(t);
  const snapshot = fixture();
  await assert.rejects(runCatalogGenerator({ check: true, snapshot, outputFile }), /catalog_artifact_missing/);
  await assert.rejects(stat(outputFile), { code: 'ENOENT' });
  await runCatalogGenerator({ snapshot, outputFile });
  const before = await stat(outputFile);
  assert.equal((await runCatalogGenerator({ check: true, snapshot, outputFile })).status, 'checked');
  assert.equal((await stat(outputFile)).mtimeMs, before.mtimeMs);
  const tampered = `${await readFile(outputFile, 'utf8')} `;
  await writeFile(outputFile, tampered);
  const tamperedStat = await stat(outputFile);
  await assert.rejects(runCatalogGenerator({ check: true, snapshot, outputFile }), /catalog_artifact_out_of_date/);
  assert.equal(await readFile(outputFile, 'utf8'), tampered);
  assert.equal((await stat(outputFile)).mtimeMs, tamperedStat.mtimeMs);
});

test('importing the generator never writes the production artifact', async () => {
  const output = new URL('../lib/programplan-catalog.generated.json', import.meta.url);
  const before = await stat(output).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
  const bytes = before ? await readFile(output, 'utf8') : null;
  await import(`${new URL('./build-programplan-catalog.mjs', import.meta.url).href}?import-safety-test`);
  const after = await stat(output).catch((e) => { if (e.code === 'ENOENT') return null; throw e; });
  assert.equal(after?.mtimeMs ?? null, before?.mtimeMs ?? null);
  if (after) assert.equal(await readFile(output, 'utf8'), bytes);
});

test('duplicate, malformed and cross-subject references abort generation', () => {
  for (const mutate of [
    (s) => { s.subjects.push(structuredClone(s.subjects[0])); },
    (s) => { s.programs.push(structuredClone(s.programs[0])); },
    (s) => { s.subjects[0].items.push({ ...s.subjects[0].items[0] }); },
    (s) => { s.programs[0].foundation[0].levels[0].points = 99; },
    (s) => { s.programs[0].foundation[0].levels[0].code = 'MISSING1000X'; },
    (s) => { s.programs[0].foundation[0].code = 'MISSING'; },
    (s) => { s.programs[0].startDate = '2025-02-30'; },
    (s) => { s.programs[0].foundation[0].optional = 'false'; },
    (s) => { s.subjects[0].version = Number.NaN; },
  ]) {
    const s = fixture(); mutate(s); assert.throws(() => createCatalogArtifact(s));
  }
});

test('full saved snapshot is reproducible, integrity-verified and every nonempty block is cross-referenced', async () => {
  const artifact = createCatalogArtifact(syllabusSnapshot);
  const verified = await verifyProgramplanCatalog(JSON.parse(serializeCatalogArtifact(artifact)));
  assert.equal(verified.catalogId, artifact.catalogId);
  assert.equal(artifact.subjects.length, syllabusSnapshot.subjects.length);
  assert.equal(artifact.programs.length, syllabusSnapshot.programs.length);
  let references = 0;
  for (const program of artifact.programs) {
    for (const b of [...program.foundation, ...program.programmeSpecific, ...program.orientations.flatMap((o) => o.subjects), ...program.specialization]) {
      const subject = artifact.subjects.find((s) => s.code === b.code);
      if (b.levels.length) {
        assert.ok(subject); assert.equal(b.subjectVersion, subject.version);
        for (const level of b.levels) {
          const item = subject.items.find((i) => i.code === level.code);
          assert.ok(item); assert.equal(level.points, item.points); references++;
        }
      }
    }
  }
  assert.ok(references > 0);
});
