import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockerActions } from './tjanst-blocker-actions.ts';

const id = n => `51a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const source = (c = 1, code = 'SVE') => `class_timplan:${id(c)}:2026:${code}`;
const row = (n, extra = {}) => ({ id: id(100 + n), lineageId: id(200 + n), sourceKind: 'class_timplan', sourceKey: source(), classId: id(1), rowKey: 'SVE',
  personId: id(10 + n), teacherHt: 60, teacherVt: 60, needHt: 60, needVt: 60, needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });
const cls = (c = 1, label = 'Klass A') => ({ classId: id(c), name: label, link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey: source(c), rowKey: 'SVE', label: 'Svenska', needHt: 60, needVt: 60, needBasis: 'terms' }] });
const plan = (code, extra = {}) => ({ contractVersion: 'fixture', unitId: id(999), schoolName: 'Syntetisk skola', schoolYear: 2026, revision: 1, version: null,
  versions: [], teachers: [{ personId: id(11), displayName: 'Lärare A', draft: false, shareHere: 100 }], classes: [cls()], rows: [], specials: [], joints: [], sharing: [],
  actions: [], blockers: code ? [{ code, message: 'Serverns meddelande' }] : [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, ...extra });
const keys = result => result.targets.map(t => t.kind === 'row' ? t.rowId : t.kind === 'sharing' ? t.sourceKey : t.kind === 'joint' ? t.jointId : t.kind);

test('inga rapporterade hinder skapar inga navigationsmål eller nya publiceringsregler', () => {
  assert.deepEqual(blockerActions(plan(null), 'stale_rows'), { targets: [], guidance: '' });
  const p = plan(null, { rows: [row(1, { stale: true })] });
  assert.deepEqual(blockerActions(p, 'stale_rows').targets, []);
});
test('tomt utkast leder till tilldelning, okänd kod bevarar en ärlig granskningsväg', () => {
  assert.deepEqual(blockerActions(plan('empty_draft'), 'empty_draft').targets, [{ kind: 'allocation', label: 'Ofördelade behov' }]);
  const result = blockerActions(plan('ny_serverkod'), 'ny_serverkod');
  assert.deepEqual(keys(result), ['review']); assert.match(result.guidance, /inte ut en viss rad/u);
});
test('gamla rader härleds med stabilt rad-ID och känt sourceKey, inte meddelandetext', () => {
  const p = plan('stale_rows', { rows: [row(1, { stale: true }), row(2), row(3, { sourceKey: source(2), classId: id(2), stale: true })], classes: [cls(), cls(2, 'Klass B')] });
  const result = blockerActions(p, 'stale_rows');
  assert.deepEqual(keys(result), [id(101), id(103)]); assert.equal(result.targets[0].sourceKey, source());
  assert.match(result.targets[0].label, /Lärare A · Svenska · Klass A/u); assert.match(result.targets[1].label, /Klass B/u);
  assert.deepEqual(blockerActions({ ...p, blockers: [{ code: 'stale_rows', message: 'En annan lärare, klass B eller fel person-ID?' }] }, 'stale_rows'), result);
});
test('stale orphan, fel klasskoppling och samlästa rader ger inte en gissad radredigerare', () => {
  const p = plan('stale_rows', { rows: [row(1, { stale: true }), row(2, { sourceKey: source(99), stale: true }), row(3, { stale: true, jointGroupId: id(80) }), row(4, { stale: true, classId: id(2) })] });
  const result = blockerActions(p, 'stale_rows'); assert.deepEqual(keys(result), [id(101), 'review']); assert.match(result.guidance, /Hämta aktuellt läge/u);
  assert.deepEqual(keys(blockerActions(plan('stale_rows'), 'stale_rows')), ['review']);
});
test('identiska etiketter och dubblettdata sammanslår aldrig olika objekt', () => {
  const p = plan('stale_rows', { rows: [row(1, { stale: true }), row(1, { stale: true }), row(2, { personId: id(11), sourceKey: source(2), classId: id(2), stale: true })], classes: [cls(), cls(2)] });
  const result = blockerActions(p, 'stale_rows'); assert.deepEqual(keys(result), [id(101), id(102)]);
  assert.match(result.targets[0].label, /alternativ 1$/u); assert.match(result.targets[1].label, /alternativ 2$/u);
  assert.ok(result.targets.every(t => !/51a10000/u.test(t.label)));
});
test('delning utan form ger ett mål per behov; vakuum och samläsning räknas inte som extra lärare', () => {
  const p = plan('shared_need_unspecified', { classes: [cls(), cls(2, 'Klass B')], rows: [row(1), row(2), row(3, { personId: null }), row(4, { sourceKey: source(2), classId: id(2) }), row(5, { sourceKey: source(2), classId: id(2) })] });
  assert.deepEqual(keys(blockerActions(p, 'shared_need_unspecified')), [source(), source(2)]);
  p.rows[1].jointGroupId = id(80); assert.deepEqual(keys(blockerActions(p, 'shared_need_unspecified')), [source(2)]);
  p.sharing = [{ sourceKey: source(2), mode: 'sequential', graderPersonIds: [id(14)] }];
  assert.deepEqual(keys(blockerActions(p, 'shared_need_unspecified')), ['review']);
});
test('saknad betygssättare kräver faktisk egen namngiven tilldelning på samma behov', () => {
  const p = plan('grader_missing', { rows: [row(1), row(2), row(3, { sourceKey: source(2), classId: id(2) })], sharing: [{ sourceKey: source(), mode: 'sequential', graderPersonIds: [id(13)] }] });
  assert.deepEqual(keys(blockerActions(p, 'grader_missing')), [source()]);
  p.sharing[0].graderPersonIds = [id(12)]; assert.deepEqual(keys(blockerActions(p, 'grader_missing')), ['review']);
  p.sharing[0].graderPersonIds = []; p.rows[1].jointGroupId = id(80); assert.deepEqual(keys(blockerActions(p, 'grader_missing')), ['review']);
});
test('saknad behovskälla för delning och saknat lokalt mål faller tillbaka utan första-rad-gissning', () => {
  const p = plan('shared_need_unspecified', { rows: [row(1, { sourceKey: source(99) }), row(2, { sourceKey: source(99) })] });
  assert.deepEqual(keys(blockerActions(p, 'shared_need_unspecified')), ['review']);
});
test('samläsning med färre än två klasser eller lärare utan egen medlemsrad blir ett gruppmål', () => {
  const a = id(80), b = id(81), valid = id(82);
  const p = plan('joint_invalid', { rows: [row(1, { jointGroupId: a }), row(2, { jointGroupId: b }), row(3, { jointGroupId: b, classId: id(2) }), row(4, { jointGroupId: valid }), row(5, { jointGroupId: valid, classId: id(2) })],
    joints: [{ id: a, name: 'Grupp A', teachers: [{ personId: id(11) }] }, { id: b, name: 'Grupp B', teachers: [{ personId: id(99) }] }, { id: valid, name: 'Grupp C', teachers: [{ personId: id(14) }] }] });
  assert.deepEqual(keys(blockerActions(p, 'joint_invalid')), [a, b]);
  p.joints.push(p.joints[0]); assert.deepEqual(keys(blockerActions(p, 'joint_invalid')), [a, b]);
});
test('olika samläsningslärare och flera lärartider följer befintlig modellregel', () => {
  const a = id(80), b = id(81), c = id(82);
  const p = plan('joint_mixed_teachers', { rows: [row(1, { jointGroupId: a }), row(2, { jointGroupId: a }), row(3, { jointGroupId: b }), row(4, { jointGroupId: c, personId: null }), row(5, { jointGroupId: c, personId: null })],
    joints: [{ id: a, name: 'Grupp A', teachers: [] }, { id: b, name: 'Grupp B', teachers: [{ personId: id(13) }, { personId: id(14) }] }, { id: c, name: 'Grupp C', teachers: [] }] });
  assert.deepEqual(keys(blockerActions(p, 'joint_mixed_teachers')), [a, b]);
});
test('personhinder väljer ingen person utifrån andel, Ny lärare eller frånvaro i kolumnerna', () => {
  for (const teachers of [[], [{ personId: id(11), displayName: 'Okänd andel', shareHere: null, draft: true }], [{ personId: id(11), displayName: 'Full andel', shareHere: 100, draft: false }]]) {
    const result = blockerActions(plan('person_not_at_school', { teachers }), 'person_not_at_school');
    assert.deepEqual(result.targets, [{ kind: 'teachers', label: 'Lärare i fördelningen' }]); assert.match(result.guidance, /inte vilken lärare/u);
  }
});
test('flera rapporterade hinder hanteras separat och funktionen ändrar inte indata', () => {
  const p = plan('stale_rows', { rows: [row(1, { stale: true })], blockers: [{ code: 'stale_rows', message: 'Äldre källa' }, { code: 'person_not_at_school', message: 'Skoluppdrag' }] });
  const before = structuredClone(p);
  const stale = blockerActions(p, 'stale_rows'), people = blockerActions(p, 'person_not_at_school');
  assert.deepEqual(keys(stale), [id(101)]); assert.deepEqual(keys(people), ['teachers']); assert.deepEqual(p, before);
  stale.targets[0].label = 'Ändrad lokal etikett'; assert.deepEqual(p, before);
});
