import test from 'node:test';
import assert from 'node:assert/strict';
import { defaultSchemaVillkor } from './schema-contract.ts';
import { parseSchemaDraftSave, parseSchemaDraftScope, parseSchemaDraftReadReply, parseSchemaDraftSaveReply, parseSchemaDraftStatusReply,
  parseSchemaDraftDocument, schemaDraftHash, schemaDraftCanonicalSerialize, schemaDraftDocument, verifySchemaDraftReadReply, verifySchemaDraftSaveReply, SCHEMA_DRAFT_VERSION } from './schema-draft-contract.ts';

const id = n => `53111600-0000-4000-8000-${String(n).padStart(12, '0')}`;
const scope = { contractVersion: SCHEMA_DRAFT_VERSION, unitId: id(1), schoolYear: 2027, period: 'lasar' };
const command = extra => ({ ...scope, commandId: id(2), draftId: null, expectedRevision: 0, name: 'Schemautkast', basisVillkor: null,
  workingVillkor: defaultSchemaVillkor(), grundFingerprint: null, placements: [], locks: [], ...extra });
const sha = n => `sha256:${String(n).repeat(64)}`;
const document = () => ({ documentVersion: 1, base: null, basisVillkor: null, workingVillkor: defaultSchemaVillkor(), placements: [], locks: [], intentional: [],
  datedOverrides: [], activityTypes: [], control: null, requiresRecalculation: true, source: { planId: null, planRevision: 0, calendarVersionId: null, calendarVersion: null, lessonSources: [], digest: sha('a') } });
const draft = () => ({ ...document(), id: id(3), name: 'Schemautkast', revision: 1, savedAt: '2026-11-16T10:00:00.000Z', contentHash: sha('b'), sourceHash: sha('a'), stale: false });
const receipt = () => ({ commandId: id(2), draftId: id(3), revision: 1, requestHash: sha('c'), contentHash: sha('b'), savedAt: '2026-11-16T10:00:00.000Z', replayed: false });

test('schemautkast bevarar arbetsvillkor före första beräkning och normaliserar tomma metadata', () => {
  const request = parseSchemaDraftSave(command());
  assert.deepEqual(request.workingVillkor, defaultSchemaVillkor());
  assert.deepEqual([request.intentional, request.datedOverrides, request.activityTypes], [[], [], []]);
  assert.equal(request.basisVillkor, null); assert.equal(request.grundFingerprint, null);
});
test('schemautkast nekar okänd klientbas, roll och transient elevdata', () => {
  for (const extra of [{ base: {} }, { role: 'rektor' }, { pupilNames: ['inget elevnamn accepteras'] }, { scopeKey: 'old-context' }]) assert.throws(() => parseSchemaDraftSave(command(extra)));
});
test('schemautkast binder ID och revisionsläge samt period och kontraktsversion', () => {
  for (const extra of [{ draftId: id(3) }, { expectedRevision: 1 }, { contractVersion: 0 }, { period: 'annan' }]) assert.throws(() => parseSchemaDraftSave(command(extra)));
  assert.equal(parseSchemaDraftSave(command({ draftId: id(3), expectedRevision: 4 })).expectedRevision, 4);
  assert.throws(() => parseSchemaDraftScope({ ...scope, unknown: true }));
});
test('schemautkast kan inte parkera eller låsa påhittade pass utan beräkningsgrund', () => {
  assert.throws(() => parseSchemaDraftSave(command({ placements: [{ lesson: 'pass-1', day: 0, startMin: 480, room: null }] })));
  assert.throws(() => parseSchemaDraftSave(command({ locks: [{ lesson: 'pass-1', day: 0, startMin: 480, room: null }] })));
});
test('schemautkast återläser platt serverformat och nekar annat skolurval eller okänd dokumentversion', () => {
  assert.equal(parseSchemaDraftReadReply({ ...scope, draft: draft() }, scope).draft.revision, 1);
  assert.equal(parseSchemaDraftReadReply({ ...scope, draft: null }, scope).draft, null);
  assert.throws(() => parseSchemaDraftReadReply({ ...scope, unitId: id(9), draft: draft() }, scope));
  assert.throws(() => parseSchemaDraftDocument({ ...document(), documentVersion: 2 }, scope));
});
test('schemautkastets kvitto måste binda kommando, utkast, revision, hash och spartid', () => {
  assert.equal(parseSchemaDraftSaveReply({ ...scope, draft: draft(), receipt: receipt() }, parseSchemaDraftSave(command())).receipt.revision, 1);
  for (const change of [{ commandId: id(9) }, { draftId: id(9) }, { revision: 2 }, { contentHash: sha('d') }, { savedAt: '2026-11-16T10:01:00.000Z' }]) {
    assert.throws(() => parseSchemaDraftSaveReply({ ...scope, draft: draft(), receipt: { ...receipt(), ...change } }, parseSchemaDraftSave(command())));
  }
});
test('schemautkastets okända status är explicit och felaktigt hittat kvitto nekas', () => {
  const request = { ...scope, commandId: id(2), draftId: null };
  assert.equal(parseSchemaDraftStatusReply({ ...scope, state: 'not_found', found: false, receipt: null }, request).found, false);
  assert.equal(parseSchemaDraftStatusReply({ ...scope, state: 'completed', found: true, receipt: receipt() }, request).receipt.revision, 1);
  assert.throws(() => parseSchemaDraftStatusReply({ ...scope, state: 'not_found', found: true, receipt: null }, request));
  assert.throws(() => parseSchemaDraftStatusReply({ ...scope, state: 'completed', found: true, receipt: { ...receipt(), commandId: id(9) } }, request));
});
test('schemautkastets hash är kanonisk och binder även ännu ej beräknade arbetsvillkor', async () => {
  const before = parseSchemaDraftSave(command()), reordered = Object.fromEntries(Object.entries(before).reverse());
  assert.equal(await schemaDraftHash(before), await schemaDraftHash(reordered));
  const after = { ...before, workingVillkor: { ...before.workingVillkor, breakMin: 15 } };
  assert.notEqual(await schemaDraftHash(before), await schemaDraftHash(after));
});
test('schemautkast sparar aktivitetstyper utan deltagarlistor eller godtyckliga extra fält', () => {
  const type = { id: 'typ-1', name: 'Möte', group: 'Möten', participants: 'personal', visibleFor: 'personal', margin: null };
  assert.deepEqual(parseSchemaDraftSave(command({ activityTypes: [type] })).activityTypes, [type]);
  assert.throws(() => parseSchemaDraftSave(command({ activityTypes: [{ ...type, pupilIds: [id(4)] }] })));
});
test('schemautkastet verifierar verklig dokument- och requesthash innan Sparad kan visas', async () => {
  const input = parseSchemaDraftSave(command()), saved = draft(); saved.contentHash = await schemaDraftHash(schemaDraftDocument(saved));
  const proof = { ...receipt(), contentHash: saved.contentHash, requestHash: await schemaDraftHash(input) };
  assert.equal((await verifySchemaDraftReadReply({ ...scope, draft: saved }, scope)).draft.contentHash, saved.contentHash);
  assert.equal((await verifySchemaDraftSaveReply({ ...scope, draft: saved, receipt: proof }, input)).draft.revision, 1);
  await assert.rejects(() => verifySchemaDraftReadReply({ ...scope, draft: { ...saved, workingVillkor: { ...saved.workingVillkor, breakMin: 15 } } }, scope));
  await assert.rejects(() => verifySchemaDraftSaveReply({ ...scope, draft: saved, receipt: { ...proof, requestHash: sha('d') } }, input));
});
test('ett grundlöst serverdokument kan inte bära gömda pass, undantag eller källkopplingar', () => {
  for (const extra of [{ placements: [{ lesson: 'pass-1', day: 0, startMin: 480, room: null }] }, { requiresRecalculation: false },
    { source: { ...document().source, lessonSources: [{ lesson: 'pass-1', ref: 'undervisning:källa', term: 'ht', ordinal: 1 }] } }]) {
    assert.throws(() => parseSchemaDraftDocument({ ...document(), ...extra }, scope));
  }
});
test('schemats kanoniska hash bevarar bråkveckor och decimaler utan att ändra heltalssemantiken', async () => {
  assert.equal(schemaDraftCanonicalSerialize(177 / 5), 'd35.4;'); assert.equal(schemaDraftCanonicalSerialize(-0), 'i0;');
  assert.equal(schemaDraftCanonicalSerialize(1e-7), 'd0.0000001;'); assert.equal(schemaDraftCanonicalSerialize(-1e-7), 'd-0.0000001;');
  assert.equal(schemaDraftCanonicalSerialize(0.30000000000000004), 'd0.30000000000000004;');
  assert.equal(await schemaDraftHash({ weeks: 35.4 }), await schemaDraftHash({ weeks: 177 / 5 }));
  assert.notEqual(await schemaDraftHash({ weeks: 35.4 }), await schemaDraftHash({ weeks: 35 }));
  for (const value of [NaN, Infinity, undefined, Number.MAX_SAFE_INTEGER + 1]) await assert.rejects(() => schemaDraftHash(value));
});
