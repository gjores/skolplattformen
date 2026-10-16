import { test } from 'node:test';
import assert from 'node:assert/strict';
import { aplJournalIdentityKey, aplJournalStorageKey, createAplJournal, loadAplJournal,
  parseAplJournal, persistAplJournal, recoverAplJournal, removeAplJournal } from './apl-plan-journal.ts';

const uid = n => `5a110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const hash = `sha256:${'a'.repeat(64)}`;
const scope = () => ({ identityKey: hash, customerId: uid(1), membershipId: uid(2), assignmentId: uid(3),
  organizerId: uid(4), unitId: uid(5), planId: uid(6), planVersion: 1, accessFunction: 'rektor' });
const period = id => ({ id: uid(id), name: 'Syntetisk period', startsOn: null, endsOn: null, schoolYear: null,
  extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' }, contents: [], allocations: [] });
const request = () => ({ contractVersion: 'structured_v1', action: 'save', commandId: uid(7), planId: uid(6), expectedRevision: 3,
  plan: { contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'unreviewed', periods: [period(8), period(9)] }, copyReviewResolutions: [] });
const live = () => ({ contractVersion: 'structured_v1', planId: uid(6), revision: 4, organizerId: uid(4),
  program: { code: 'BA25', version: 1, category: 'VOCATIONAL_PROGRAM', startDate: '2025-07-01', endDate: null, canceledDate: null, sourceSupported: true },
  plan: request().plan, copyReview: [], contentHash: hash, confirmations: [], capabilities: { canSave: true, canConfirm: true } });
const completed = () => ({ state: 'completed', result: { receipt: { contractVersion: 'structured_v1', commandId: uid(7), planId: uid(6),
  action: 'save', revision: 4, changed: true, replayed: true, contentHash: hash, confirmationId: null }, detail: live() } });
const missing = { state: 'not_found', result: null };
const storage = () => {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
};

test('reload och ny MFA-session behåller exakt commandId, CAS och payload utan rå identitet', async () => {
  const identityKey = await aplJournalIdentityKey('https://synthetic.invalid', 'synthetic-user');
  assert.equal(identityKey, await aplJournalIdentityKey('https://synthetic.invalid', 'synthetic-user'));
  assert.notEqual(identityKey, await aplJournalIdentityKey('https://other.invalid', 'synthetic-user'));
  const context = { ...scope(), identityKey }, journal = await createAplJournal(context, request()), store = storage();
  const persisted = await persistAplJournal(store, journal, context);
  assert.deepEqual(await loadAplJournal(store, structuredClone(context)), persisted);
  assert.equal(JSON.stringify(persisted).includes('synthetic-user'), false);
  assert.deepEqual(persisted.request, request());
  assert.deepEqual(await persistAplJournal(store, persisted, context), persisted);
});

test('annan identitet, kund, medlemskap, uppdrag, huvudman, skola, plan, version eller roll avvisas', async () => {
  const journal = await createAplJournal(scope(), request()), store = storage();
  await persistAplJournal(store, journal, scope());
  for (const key of Object.keys(scope())) {
    const other = { ...scope(), [key]: key === 'identityKey' ? `sha256:${'b'.repeat(64)}` : key === 'planVersion' ? 2 : key === 'accessFunction' ? 'administrator' : uid(99) };
    await assert.rejects(parseAplJournal(journal, other), { code: 'wrong_journal_scope' });
    assert.equal(await loadAplJournal(store, other), null);
  }
});

test('ändrat payload, CAS, commandId och ordning kan aldrig återanvända sparad hash', async () => {
  const original = await createAplJournal(scope(), request());
  for (const change of [j => j.request.expectedRevision++, j => { j.request.commandId = uid(99); },
    j => { j.request.plan.periods[0].name = 'Ändrat'; }, j => j.request.plan.periods.reverse(),
    j => { j.requestHash = `sha256:${'b'.repeat(64)}`; }]) {
    const changed = structuredClone(original); change(changed);
    await assert.rejects(parseAplJournal(changed, scope()), { code: 'changed_journal_request' });
  }
  const changed = request(); changed.expectedRevision++;
  assert.notEqual((await createAplJournal(scope(), changed)).requestHash, original.requestHash);
});

test('lagringsfel eller utebliven read-back stoppar mutation; befintligt försök lämnas kvar', async () => {
  const journal = await createAplJournal(scope(), request());
  for (const faulty of [
    { getItem() { throw Error('denied'); }, setItem() {}, removeItem() {} },
    { getItem() { return null; }, setItem() { throw Error('quota'); }, removeItem() {} },
    { getItem() { return null; }, setItem() {}, removeItem() {} },
  ]) {
    let mutations = 0;
    await assert.rejects(async () => { await persistAplJournal(faulty, journal, scope()); mutations++; });
    assert.equal(mutations, 0);
  }
  const store = storage(); await persistAplJournal(store, journal, scope());
  const newer = await createAplJournal(scope(), { ...request(), commandId: uid(99), expectedRevision: 4 });
  await assert.rejects(persistAplJournal(store, newer, scope()), { code: 'pending_journal_exists' });
  await assert.rejects(removeAplJournal(store, newer, scope()), { code: 'journal_changed' });
  assert.deepEqual(await loadAplJournal(store, scope()), journal);
  await removeAplJournal(store, journal, scope()); assert.equal(await loadAplJournal(store, scope()), null);
});

test('felaktig eller främmande journal i rätt storagekey stoppar återhämtning', async () => {
  const store = storage(), key = await aplJournalStorageKey(scope());
  store.setItem(key, '{'); await assert.rejects(loadAplJournal(store, scope()), { code: 'invalid_journal_json' });
  const journal = await createAplJournal(scope(), request()); journal.scope.unitId = uid(99);
  store.setItem(key, JSON.stringify(journal)); await assert.rejects(loadAplJournal(store, scope()), { code: 'wrong_journal_scope' });
  const value = await createAplJournal(scope(), request()); let called = false;
  Object.defineProperty(value, 'requestHash', { get() { called = true; return hash; } });
  await assert.rejects(parseAplJournal(value, scope())); assert.equal(called, false);
});

test('förlorat svar återfinns som exakt kvitto; nyare plan ger historisk framgång och omläsning', async () => {
  const journal = await createAplJournal(scope(), request()), result = completed();
  const current = await recoverAplJournal(journal, scope(), result, live());
  assert.equal(current.state, 'completed_current'); assert.equal(current.reloadRequired, true);
  const later = { ...live(), revision: 8, contentHash: `sha256:${'b'.repeat(64)}` };
  const recovered = await recoverAplJournal(journal, scope(), result, later);
  assert.equal(recovered.state, 'completed_historical'); assert.equal(recovered.reloadRequired, true);
  assert.deepEqual(recovered.journal.request, request()); assert.equal(later.revision, 8);
  // Even a status-only transition with unchanged content must not replace the later revision with the receipt.
  assert.equal((await recoverAplJournal(journal, scope(), result, { ...live(), revision: 5 })).state, 'completed_historical');
});

test('not_found tillåter bara exakt försök vid samma CAS och färsk skrivbehörighet', async () => {
  const journal = await createAplJournal(scope(), request()), before = { ...live(), revision: 3 };
  const result = await recoverAplJournal(journal, scope(), missing, before);
  assert.equal(result.state, 'retry_exact'); assert.deepEqual(result.journal.request, request());
  for (const next of [live(), { ...before, capabilities: { canSave: false, canConfirm: false } }]) {
    const conflict = await recoverAplJournal(journal, scope(), missing, next);
    assert.equal(conflict.state, 'needs_review'); assert.equal(conflict.reloadRequired, true);
    assert.equal(conflict.journal.request.expectedRevision, 3);
  }
});

test('bekräftelse låses till rektor, innehållshash och aktuell behörighet', async () => {
  const command = { contractVersion: 'structured_v1', action: 'confirm', commandId: uid(10), planId: uid(6), expectedRevision: 4,
    expectedContentHash: hash, comment: 'Jag har granskat förläggningen.' };
  await assert.rejects(createAplJournal({ ...scope(), accessFunction: 'administrator' }, command), { code: 'wrong_journal_scope' });
  const journal = await createAplJournal(scope(), command);
  assert.equal((await recoverAplJournal(journal, scope(), missing, live())).state, 'retry_exact');
  for (const next of [{ ...live(), contentHash: `sha256:${'b'.repeat(64)}` }, { ...live(), capabilities: { canSave: true, canConfirm: false } }])
    assert.equal((await recoverAplJournal(journal, scope(), missing, next)).state, 'needs_review');
});

test('fel kvitto, främmande snapshot och motsägande revisionshash får inte bli ett aktuellt sparbesked', async () => {
  const journal = await createAplJournal(scope(), request());
  for (const change of [r => { r.result.receipt.commandId = uid(99); }, r => { r.result.receipt.replayed = false; },
    r => { r.result.detail.plan.periods[0].name = 'Främmande'; }]) {
    const status = completed(); change(status); await assert.rejects(recoverAplJournal(journal, scope(), status, live()));
  }
  await assert.rejects(recoverAplJournal(journal, scope(), completed(), { ...live(), organizerId: uid(99) }), { code: 'wrong_journal_scope' });
  for (const stale of [{ ...live(), revision: 3 }, { ...live(), contentHash: `sha256:${'b'.repeat(64)}` }])
    assert.equal((await recoverAplJournal(journal, scope(), completed(), stale)).state, 'needs_review');
});

test('pre-extension journal hash and recovery stay exact; new term intent is bound through reload', async () => {
  const old = await createAplJournal(scope(), request());
  assert.equal(old.requestHash, 'sha256:dbbd0f5333475bc55ac67b8f49de2292112452ddd66a81d4c3dcf4258979b544');
  assert.deepEqual(await parseAplJournal(JSON.parse(JSON.stringify(old)), scope()), old);
  const q = request(); q.plan.periods[0].plannedTermIndex = 3;
  const journal = await createAplJournal(scope(), q), store = storage();
  assert.notEqual(journal.requestHash, old.requestHash);
  await persistAplJournal(store, journal, scope());
  assert.deepEqual((await loadAplJournal(store, scope())).request, q);
  const changed = structuredClone(journal); changed.request.plan.periods[0].plannedTermIndex = 4;
  await assert.rejects(parseAplJournal(changed, scope()), { code: 'changed_journal_request' });
});
