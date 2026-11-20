import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { datumFixture } from '../../web/lib/schema-datum-fixture.mjs';
import { parseSchemaDraftDocument, schemaDraftHash } from '../../web/lib/schema-draft-contract.ts';
import { schemaKontroll } from '../../web/lib/schema-underlag.ts';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture } from './tjanst-fixtures.mjs';

const scope = (unitId, period = 'lasar') => ({ contractVersion: 1, unitId, schoolYear: 2026, period });
const noPrevious = { previousRevision: null, draft: null };
const sourceHash = `sha256:${'a'.repeat(64)}`;
const name = 'Syntetiskt schemautkast';

function documents(unitId) {
  const { f, placements, underlag, change } = datumFixture();
  const source = {
    planId: null, planRevision: 1, calendarVersionId: null, calendarVersion: 1, digest: sourceHash,
    lessonSources: f.lessons.map((lesson, i) => ({ lesson: lesson.id, ref: 'undervisning:prov', term: lesson.term, ordinal: i + 1 })),
  };
  const full = parseSchemaDraftDocument({
    documentVersion: 1, base: { ...f, unitId }, basisVillkor: f.villkor, workingVillkor: f.villkor,
    placements, locks: [], intentional: [], datedOverrides: [change()], activityTypes: [], requiresRecalculation: false, source,
    control: schemaKontroll(underlag, placements, { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } }),
  }, scope(unitId));
  const empty = parseSchemaDraftDocument({
    ...full, base: null, basisVillkor: null, control: null, requiresRecalculation: true,
    placements: [], locks: [], datedOverrides: [], source: { ...source, lessonSources: [] },
  }, scope(unitId));
  return { full, empty };
}

const reset = (tx, input) => tx`select public.schema_reset_previous(${tx.json(input)}) as result`.then(([row]) => row.result.result);
async function save(tx, target, draftId, expectedRevision, document, cleared = false) {
  const commandId = randomUUID();
  const requestHash = cleared
    ? await schemaDraftHash({ operation: 'schema_draft_reset_v1', ...target, commandId, draftId, expectedRevision, action: 'clear' })
    : await schemaDraftHash({ operation: 'normal_save', ...target, commandId, draftId, expectedRevision });
  const input = { ...target, commandId, draftId, expectedRevision, name, document, sourceHash, requestHash };
  const [row] = await tx`select public.schema_command(${tx.json(input)}) as result`;
  return row.result.result.draft;
}

test('schema_reset_previous läser enbart revisionen före en giltig, aktuell rensning', async () => {
  const instance = await createEphemeralMigratedDb();
  const { db } = instance;
  try {
    for (const role of ['anon', 'authenticated', 'service_role', 'skolplattform_worker']) {
      const [row] = await db`select has_function_privilege(${role},'public.schema_reset_previous(jsonb)','EXECUTE') as allowed`;
      assert.equal(row.allowed, role === 'skolplattform_worker');
    }

    const users = await db.begin(createTjanstFixture);
    const target = scope(users.schools.A), { full, empty } = documents(target.unitId);
    let cleared;
    await db.begin(async tx => {
      await users.actor(tx, 'principalA');
      await tx`set local role skolplattform_worker`;
      const first = await save(tx, target, null, 0, full);
      const reread = (draft, includeDraft = false) => reset(tx, { ...target, draftId: draft.id, expectedRevision: draft.revision, includeDraft });
      assert.deepEqual(await reread(first, true), noPrevious);
      const normalEmpty = await save(tx, target, first.id, first.revision, empty);
      assert.deepEqual(await reread(normalEmpty, true), noPrevious);
      const normalFull = await save(tx, target, first.id, normalEmpty.revision, full);
      const markedNonempty = await save(tx, target, first.id, normalFull.revision, full, true);
      assert.deepEqual(await reread(markedNonempty, true), noPrevious);
      cleared = await save(tx, target, first.id, markedNonempty.revision, empty, true);
      assert.deepEqual(await reread(cleared), { previousRevision: markedNonempty.revision, draft: null });
      assert.deepEqual(await reread(cleared, true), { previousRevision: markedNonempty.revision, draft: markedNonempty });

      const input = { ...target, draftId: cleared.id, expectedRevision: cleared.revision, includeDraft: true };
      assert.deepEqual(await reset(tx, { ...input, draftId: randomUUID() }), noPrevious);
      assert.deepEqual(await reset(tx, { ...input, period: 'ht' }), noPrevious);
      assert.deepEqual(await reset(tx, { ...input, schoolYear: 2027 }), noPrevious);
      for (const bad of [{ expectedRevision: 0 }, { includeDraft: 'true' }, { draftId: null }, { previousRevision: 1 }]) {
        await assert.rejects(tx.savepoint(t => reset(t, { ...input, ...bad })), { code: '22023', hint: 'schema_draft_invalid' });
      }

      const term = scope(target.unitId, 'ht');
      const blank = await save(tx, term, null, 0, empty);
      const termClear = await save(tx, term, blank.id, blank.revision, empty, true);
      assert.deepEqual(await reset(tx, { ...term, draftId: termClear.id, expectedRevision: termClear.revision, includeDraft: true }), noPrevious);
    });

    const input = { ...target, draftId: cleared.id, expectedRevision: cleared.revision, includeDraft: true };
    await db.begin(async tx => {
      await users.actor(tx, 'principalB');
      await tx`set local role skolplattform_worker`;
      await assert.rejects(tx.savepoint(t => reset(t, input)), { code: '42501' });
      await users.actor(tx, 'teacherGroup');
      await assert.rejects(tx.savepoint(t => reset(t, input)), { code: '42501' });
    });

    await db.begin(async tx => {
      await tx.unsafe(`create function public.synthetic_reset_audit_fail() returns trigger language plpgsql as $$begin
        if new.action='schema_draft_read' and new.details ? 'includeDraft' then raise exception 'synthetic audit unavailable'; end if;
        return new; end$$;
        create trigger synthetic_reset_audit_fail before insert on public.security_events for each row execute function public.synthetic_reset_audit_fail();`);
      await users.actor(tx, 'principalA');
      await tx`set local role skolplattform_worker`;
      await assert.rejects(tx.savepoint(t => reset(t, input)), { code: '55000' });
      await tx`reset role`;
      await tx.unsafe('drop trigger synthetic_reset_audit_fail on public.security_events; drop function public.synthetic_reset_audit_fail();');
    });

    await db.begin(async tx => {
      await users.actor(tx, 'principalA');
      await tx`set local role skolplattform_worker`;
      const concurrent = await save(tx, target, cleared.id, cleared.revision, empty);
      assert.deepEqual(await reset(tx, input), noPrevious);
      assert.deepEqual(await reset(tx, { ...input, expectedRevision: concurrent.revision }), noPrevious);
      await assert.rejects(tx.savepoint(t => save(t, target, cleared.id, cleared.revision, full)), { code: '40001', hint: 'schema_draft_conflict' });
    });

    const [count] = await db`select count(*)::integer as total from public.schema_draft_revisions where draft_id=${cleared.id}`;
    assert.equal(count.total, cleared.revision + 1);
  } finally {
    await instance.end();
  }
});
