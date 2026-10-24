import { test } from 'node:test';
import assert from 'node:assert/strict';
import { selfCommandRef, planCommandRef, parseCommandRef } from './tjanst-contract.ts';
import { loadTjanstJournal, persistTjanstJournal, recoverTjanstJournal, removeTjanstJournal, tjanstJournalIdentityKey, tjanstJournalKey } from './tjanst-journal.ts';

const uid = n => `51a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const storage = () => {
  const values = new Map();
  return { values, getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
};
const scope = async () => ({ identityKey: await tjanstJournalIdentityKey('https://idp.example.invalid/realm', 'synthetic-subject'), assignmentId: uid(3) });
const comment = (n = 40) => selfCommandRef({ commandId: uid(n), versionId: uid(70), action: 'comment', body: 'Syntetisk kommentar om Åsa i 8B' });
const save = (n = 41) => planCommandRef({ commandId: uid(n), unitId: uid(1), schoolYear: 2026, action: 'save_row', expectedRevision: 3, payloadHash: `sha256:${'a'.repeat(64)}`,
  payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: `class_timplan:${uid(10)}:2026:programmeSpecific:BYGG:1:BYGG1000X`, personId: uid(20), teacherHt: 3000, teacherVt: 3000, comment: 'Lärarnamn Syntetisk',
    planningContext: { baseVersionId: uid(50), expectedBasisHash: `sha256:${'b'.repeat(64)}`,
      choice: { kind: 'manual', personId: uid(20), expectedPersonBasisHash: `sha256:${'c'.repeat(64)}` } } } });

test('Journalen sparar bara commandId, operation och mål (ingen kommentarstext, inga namn)', async () => {
  const s = storage(), sc = await scope();
  await persistTjanstJournal(s, sc, comment());
  await persistTjanstJournal(s, sc, save());
  const raw = [...s.values.values()].join('\n');
  assert.ok(!raw.includes('Syntetisk kommentar') && !raw.includes('Åsa') && !raw.includes('Lärarnamn') && !raw.includes('synthetic-subject') && !raw.includes('3000'));
  for (const key of s.values.keys()) assert.match(key, /^tjanst:sha256:[0-9a-f]{64}$/u);
  for (const value of s.values.values()) assert.deepEqual(Object.keys(JSON.parse(value).command).sort(), ['action', 'commandId', 'family', 'target']);
});

test('omladdning läser tillbaka samma referens; annat uppdrag ser den inte', async () => {
  const s = storage(), sc = await scope();
  await persistTjanstJournal(s, sc, save());
  assert.equal((await loadTjanstJournal(s, sc, save())).command.commandId, uid(41));
  assert.equal(await loadTjanstJournal(s, { ...sc, assignmentId: uid(4) }, save()), null);
});

test('ett väntande kommando för samma mål ersätts inte av ett nytt', async () => {
  const s = storage(), sc = await scope();
  await persistTjanstJournal(s, sc, save(41));
  await assert.rejects(persistTjanstJournal(s, sc, save(42)), e => e.code === 'pending_journal_exists');
  await persistTjanstJournal(s, sc, save(41));
});

test('återhämtning läser status och kräver alltid omläsning, utan automatisk ny skrivning', async () => {
  const s = storage(), sc = await scope(), journal = await persistTjanstJournal(s, sc, save());
  assert.deepEqual(recoverTjanstJournal(journal, { state: 'not_found', result: null }), { state: 'not_completed', journal, reloadRequired: true });
  assert.equal(recoverTjanstJournal(journal, { state: 'completed', result: {} }).state, 'completed');
  await removeTjanstJournal(s, journal);
  assert.equal(await loadTjanstJournal(s, sc, save()), null);
  assert.equal(s.values.size, 0);
});

test('ogiltig lagring och ändrad post nekas', async () => {
  const s = storage(), sc = await scope(), key = await tjanstJournalKey(sc, save());
  s.setItem(key, '{inte json');
  await assert.rejects(loadTjanstJournal(s, sc, save()), e => e.code === 'invalid_journal_json');
  s.setItem(key, JSON.stringify({ version: 1, scope: sc, command: { ...save(), action: 'ack' } }));
  await assert.rejects(loadTjanstJournal(s, sc, save()), e => e.code === 'invalid_journal_command');
  const broken = { getItem: () => { throw new Error('blocked'); }, setItem: () => {}, removeItem: () => {} };
  await assert.rejects(persistTjanstJournal(broken, sc, save()), e => e.code === 'journal_storage_unavailable');
});


test('old save/create and new row/move/bulk/removal share the exact plan target lock after reload', async () => {
  const s = storage(), sc = await scope(), current = save();
  const refs = ['create_draft', 'save_row', 'move', 'bulk', 'remove_teacher'].map((action, n) => parseCommandRef({ ...current, action, commandId: uid(80 + n) }));
  const expectedKey = await tjanstJournalKey(sc, current);
  for (const older of refs) {
    const journal = await persistTjanstJournal(s, sc, older);
    assert.equal(await tjanstJournalKey(sc, older), expectedKey);
    assert.equal((await loadTjanstJournal(s, sc, current)).command.action, older.action);
    await assert.rejects(persistTjanstJournal(s, sc, current), e => e.code === 'pending_journal_exists');
    await removeTjanstJournal(s, journal);
  }
});

test('non-null plan person/version cannot bypass target lock and context is never journalled', async () => {
  const s = storage(), sc = await scope(), current = save();
  await persistTjanstJournal(s, sc, current);
  for (const target of [{ ...current.target, personId: uid(20) }, { ...current.target, versionId: uid(50) }]) {
    await assert.rejects(persistTjanstJournal(s, sc, { ...current, commandId: uid(99), target }), e => e.code === 'invalid_journal_command');
  }
  const encoded = [...s.values.values()].join('');
  for (const field of ['planningContext', 'expectedBasisHash', 'expectedPersonBasisHash', 'payloadHash', 'suggestionId']) assert.ok(!encoded.includes(field));
});
