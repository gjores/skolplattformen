// Isolerad migrerad PostgreSQL med syntetiskt underlag. Tar ingen målanslutning.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';
import { datumFixture } from '../../web/lib/schema-datum-fixture.mjs';
import { schemaAktivitetTimplan } from '../../web/lib/schema-daterad-aktivitet.ts';
import { schemaDatumOriginal } from '../../web/lib/schema-datum.ts';
import { parseSchemaDraftDocument, schemaDraftHash, verifySchemaDraftReadReply } from '../../web/lib/schema-draft-contract.ts';
import { schemaKontroll } from '../../web/lib/schema-underlag.ts';

const sourceHash = `sha256:${'a'.repeat(64)}`;
const schemaCommand = (tx, input) => tx`select public.schema_command(${tx.json(input)}) as result`.then(([row]) => row.result.result);
const schemaRead = (tx, scope) => tx`select public.schema_read(${tx.json(scope)}) as result`.then(([row]) => row.result.result.draft);

function activityFixture() {
  const fixture = datumFixture(), { f, of } = fixture;
  const originalDate = '2026-12-07';
  const math = schemaDatumOriginal(f, { lesson: of('Matematik').id, originalDate });
  const history = schemaDatumOriginal(f, { lesson: of('Historia').id, originalDate });
  assert.ok(math && history);
  const creditRef = f.teachings.find(row => row.title === 'Historia').ref;
  const activity = {
    id: randomUUID(), name: 'Gemensam temadag', date: originalDate, startMin: 480, endMin: 540,
    classRefs: f.resurser.klass.map(c => c.ref), credit: { ref: creditRef, minutes: 45 }, credits: [creditRef],
    cancelled: [{ lesson: history.lesson.id, originalDate }],
    moves: [{ lesson: math.lesson.id, originalDate, date: originalDate, startMin: 570, room: math.lesson.roomId, durationMin: math.length }],
  };
  return { ...fixture, activity, creditRef, math, history };
}

test('timplansutfallet räknar aktivitetens minuter en gång och flytten bevarar lektionens tid', () => {
  const { f, activity, history } = activityFixture();
  const outcome = schemaAktivitetTimplan(f, [activity]);
  const before = f.teachings.find(row => row.ref === activity.credit.ref);
  const after = outcome.teachings.find(row => row.ref === before.ref);
  const delta = activity.credit.minutes - history.length;
  assert.equal(after.plannedMin, before.plannedMin + delta);
  assert.equal(after.terms.find(term => term.term === 'ht').plannedMin, before.terms.find(term => term.term === 'ht').plannedMin + delta);
  assert.deepEqual(after.terms.find(term => term.term === 'vt'), before.terms.find(term => term.term === 'vt'));
  assert.deepEqual(outcome.teachings.find(row => row.title === 'Matematik'), f.teachings.find(row => row.title === 'Matematik'));
});

test('daterad aktivitet följer den nya revisionen och äldre utkast behåller innehåll och kontrollsumma', async t => {
  const instance = await createEphemeralMigratedDb();
  t.after(() => instance.end());
  const { db } = instance;
  const users = await db.begin(createTjanstFixture);
  const scope = { contractVersion: 1, unitId: users.schools.A, schoolYear: 2026, period: 'lasar' };
  const { f, placements, underlag, activity, creditRef, math } = activityFixture();
  const source = { planId: null, planRevision: 1, calendarVersionId: null, calendarVersion: 1, digest: sourceHash,
    lessonSources: f.lessons.map((lesson, ordinal) => ({ lesson: lesson.id, ref: 'undervisning:syntetiskt', term: lesson.term, ordinal: ordinal + 1 })) };
  const originalDocument = parseSchemaDraftDocument({ documentVersion: 1, base: { ...f, unitId: scope.unitId }, basisVillkor: f.villkor,
    workingVillkor: f.villkor, placements, locks: [], intentional: [], datedOverrides: [], activityTypes: [], requiresRecalculation: false, source,
    control: schemaKontroll(underlag, placements, { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } }) }, scope);
  const approvedDocument = parseSchemaDraftDocument({ ...originalDocument, datedActivities: [activity] }, scope);
  const { credits: _credits, cancelled: _cancelled, moves: _moves, ...definition } = activity;
  const retained = { ...definition, resourceLocks: { roomId: 'ingen', teacherRef: null } };
  const withResources = { ...approvedDocument, datedActivities: [{ ...retained, credits: activity.credits, cancelled: activity.cancelled,
    moves: activity.moves, resources: { roomId: null, teacherRef: users.schools.A } }] };
  const clearedDocument = parseSchemaDraftDocument({ ...originalDocument, base: null, basisVillkor: null, placements: [], control: null,
    source: { ...source, lessonSources: [] }, requiresRecalculation: true, datedActivityDefinitions: [retained] }, scope);
  const read = async tx => {
    const { document, ...metadata } = await schemaRead(tx, scope);
    return (await verifySchemaDraftReadReply({ ...scope, draft: { ...document, ...metadata, stale: false } }, scope)).draft;
  };
  const input = async (document, prior = null) => {
    const commandId = randomUUID();
    return { ...scope, commandId, draftId: prior?.id ?? null, expectedRevision: prior?.revision ?? 0, name: 'Syntetiskt helårsutkast',
      document, sourceHash, requestHash: await schemaDraftHash({ commandId, document }) };
  };

  let first, second, third, fourth;
  await db.begin(async tx => {
    await users.actor(tx, 'principalA');
    await tx`set local role skolplattform_worker`;
    first = (await schemaCommand(tx, await input(originalDocument))).draft;
    assert.equal(first.contentHash, await schemaDraftHash(originalDocument));
    assert.equal(Object.hasOwn(await read(tx), 'datedActivities'), false);

    const commit = await input(approvedDocument, first);
    second = (await schemaCommand(tx, commit)).draft;
    assert.equal(second.revision, first.revision + 1);
    assert.equal(second.contentHash, await schemaDraftHash(approvedDocument));
    assert.deepEqual((await read(tx)).datedActivities, [activity]);
    assert.deepEqual((await read(tx)).placements, placements);
    assert.deepEqual((await read(tx)).datedOverrides, []);
    assert.equal((await schemaCommand(tx, commit)).receipt.replayed, true);
    const outdated = await input(originalDocument, first);
    await assert.rejects(tx.savepoint(t => schemaCommand(t, outdated)), { code: '40001' });
    for (const change of [{ cancelled: [...activity.cancelled, { lesson: math.lesson.id, originalDate: activity.date }] },
      { credits: [] }, { credits: [creditRef, creditRef] }, { credit: null }]) {
      const forged = await input({ ...approvedDocument, datedActivities: [{ ...activity, ...change }] }, second);
      await assert.rejects(tx.savepoint(t => schemaCommand(t, forged)), { code: '22023', hint: 'schema_draft_invalid' });
    }
    third = (await schemaCommand(tx, await input(withResources, second))).draft;
    assert.deepEqual((await read(tx)).datedActivities, withResources.datedActivities);
    for (const invalid of [
      { ...withResources, datedActivityDefinitions: [retained] },
      { ...withResources, datedActivities: [{ ...withResources.datedActivities[0], resources: { roomId: 'ingen', teacherRef: null } }] },
      { ...clearedDocument, datedActivityDefinitions: [{ ...retained, moves: [] }] },
      { ...clearedDocument, datedActivityDefinitions: [{ ...retained, resourceLocks: { roomId: 'sal-001', teacherRef: null } }] },
    ]) {
      await assert.rejects(tx.savepoint(async t => schemaCommand(t, await input(invalid, third))), { code: '22023', hint: 'schema_draft_invalid' });
    }
    fourth = (await schemaCommand(tx, await input(clearedDocument, third))).draft;
    assert.deepEqual((await read(tx)).datedActivityDefinitions, [retained]);
  });

  await db.begin(async tx => {
    await users.actor(tx, 'principalB');
    await tx`set local role skolplattform_worker`;
    await assert.rejects(tx.savepoint(t => schemaRead(t, scope)), { code: '42501' });
  });

  const historyRows = await db`select revision, document, content_hash from public.schema_draft_revisions where draft_id=${first.id} order by revision`;
  assert.deepEqual([...historyRows], [
    { revision: first.revision, document: originalDocument, content_hash: first.contentHash },
    { revision: second.revision, document: approvedDocument, content_hash: second.contentHash },
    { revision: third.revision, document: withResources, content_hash: third.contentHash },
    { revision: fourth.revision, document: clearedDocument, content_hash: fourth.contentHash },
  ]);
});
