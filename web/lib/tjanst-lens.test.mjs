import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EMPTY_LENS_PREFS, initials, teachersWithoutTeaching, lensMatches, lensStorageKey, readLensPrefs, surplusVacant, unallocated, visibleTeachers, writeLensPrefs } from './tjanst-lens.ts';

const uid = n => `51a20000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const h = n => n * 60;
const teacher = (n, name) => ({ personId: uid(n), displayName: name, draft: false, shareHere: 100 });
const T = [teacher(1, 'Anna Andersson'), teacher(2, 'Bertil Berg'), teacher(3, 'Cecilia Dahl'), teacher(4, 'David Ek')];
const row = (id, personId, extra = {}) => ({ id: uid(100 + id), personId, jointGroupId: null, teacherHt: h(10), teacherVt: h(10), ...extra });
const entry = (rows, needHt = h(20), needVt = h(20), covered = { ht: h(20), vt: h(20) }) => ({ need: { needHt, needVt }, rows, cov: { covered } });
const joint = { id: uid(900), teachers: [{ personId: uid(3), ht: h(10), vt: h(10) }] };

test('relevanta lärare följer synliga rader, samläsningens lärare och fästa lärare; ordningen bevaras', () => {
  const entries = [entry([row(1, uid(2))]), entry([row(2, uid(1), { jointGroupId: joint.id })])];
  const ids = o => visibleTeachers(entries, T, [joint], { pinned: [], showAll: false, personId: '', ...o }).map(t => t.personId);
  assert.deepEqual(ids(), [uid(1), uid(2), uid(3)]);
  assert.deepEqual(ids({ pinned: [uid(4)] }), [uid(1), uid(2), uid(3), uid(4)]);
  assert.deepEqual(ids({ showAll: true }), T.map(t => t.personId));
  assert.deepEqual(ids({ personId: uid(4) }), [uid(4)], 'lärarfiltret visar bara den läraren, som tidigare');
  assert.deepEqual(visibleTeachers([], T, [], { pinned: [], showAll: false, personId: '' }), [], 'inga rader ger bara Vakant');
  assert.deepEqual(ids({ empty: [uid(4)] }), [uid(1), uid(2), uid(3), uid(4)], 'lärare utan undervisning visas när de skickas med');
});

test('lärare utan undervisning: ingen rad och ingen samläsning; specialuppdrag räknas inte som undervisning', () => {
  assert.deepEqual(teachersWithoutTeaching(T, [row(1, uid(1))], [joint]), [uid(2), uid(4)]);
});

test('Ofördelat: otäckt känt behov, eller vakant rad på okänt behov; okänt behov är aldrig 0', () => {
  assert.equal(unallocated(entry([row(1, uid(1))]), 'ar'), false);
  assert.equal(unallocated(entry([row(1, uid(1))], h(20), h(20), { ht: h(20), vt: h(10) }), 'ar'), true);
  assert.equal(unallocated(entry([row(1, uid(1))], h(20), h(20), { ht: h(20), vt: h(10) }), 'ht'), false, 'terminen styr');
  assert.equal(unallocated(entry([row(1, null)], h(20), h(20), { ht: 0, vt: 0 }), 'ar'), true, 'bara vakant rad: lärartid saknas');
  // 05.1-34: en vakant rad på ett behov som lärarna täcker är överflödig, inte ofördelad (användarbeslut 2026-10-29).
  assert.equal(unallocated(entry([row(1, uid(1)), row(2, null)]), 'ar'), false, 'överflödig vakant rad');
  assert.equal(unallocated(entry([row(1, null)], null, null, { ht: 0, vt: 0 }), 'ar'), true, 'vakant rad på okänt behov');
  assert.equal(unallocated(entry([], null, null, { ht: 0, vt: 0 }), 'ar'), false, 'okänt behov');
  assert.equal(unallocated(entry([], h(20), null, { ht: 0, vt: 0 }), 'vt'), false, 'okänd termin');
  assert.equal(unallocated(entry([], h(20), null, { ht: 0, vt: 0 }), 'ar'), true, 'en känd termin räcker för läsåret');
});

test('linser: alla, ofördelat och samläsningar', () => {
  const plain = entry([row(1, uid(1))]), open = entry([], h(20), h(20), { ht: 0, vt: 0 }), joined = entry([row(2, uid(3), { jointGroupId: joint.id })]);
  assert.deepEqual([plain, open, joined].map(e => lensMatches(e, 'alla', 'ar')), [true, true, true]);
  assert.deepEqual([plain, open, joined].map(e => lensMatches(e, 'ofordelat', 'ar')), [false, true, false]);
  assert.deepEqual([plain, open, joined].map(e => lensMatches(e, 'samlasning', 'ar')), [false, false, true]);
});

test('initialer för kompakta kolumner', () => {
  assert.equal(initials('Anna Andersson'), 'AA');
  assert.equal(initials('Maximiliana Konstantinopelska-Vasaborgsson Ekströmsdotter'), 'ME');
  assert.equal(initials('Greta'), 'G');
  assert.equal(initials('  '), '?');
});

function memory(initial = {}) { const m = new Map(Object.entries(initial)); return { getItem: k => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), m }; }
const KEY = lensStorageKey(`sha256:${'ab'.repeat(32)}`, uid(50), 2026), known = { teacherIds: T.map(t => t.personId), classIds: [uid(60)] };

test('inställningar: sparas och läses per identitet, skola och läsår; inga namn lagras', () => {
  assert.match(KEY, /^tjanst-lins:v1:sha256:[0-9a-f]{64}:51a20000-0000-4000-8000-000000000050:2026$/u);
  const s = memory(), prefs = { pinned: [uid(2)], compact: true, saved: [{ name: 'Engelska', lens: 'ofordelat', filter: { classId: uid(60), subject: 'Engelska', personId: '', onlyIssues: false, course: '' }, showAll: false }] };
  assert.equal(writeLensPrefs(s, KEY, prefs), true);
  assert.deepEqual(readLensPrefs(s, KEY, known), prefs);
  for (const t of T) assert.ok(!s.m.get(KEY).includes(t.displayName), 'inga namn i lagringen');
  assert.deepEqual(readLensPrefs(s, lensStorageKey(`sha256:${'cd'.repeat(32)}`, uid(50), 2026), known), EMPTY_LENS_PREFS, 'annan identitet');
});

test('inställningar: trasig, främmande eller otillgänglig lagring ger standardläget; okända id:n rensas', () => {
  assert.deepEqual(readLensPrefs(null, KEY, known), EMPTY_LENS_PREFS);
  assert.deepEqual(readLensPrefs(memory({ [KEY]: '{trasig' }), KEY, known), EMPTY_LENS_PREFS);
  assert.deepEqual(readLensPrefs(memory({ [KEY]: JSON.stringify({ v: 2, pinned: [uid(1)] }) }), KEY, known), EMPTY_LENS_PREFS);
  const throwing = { getItem: () => { throw new Error('blockerad'); }, setItem: () => { throw new Error('full'); } };
  assert.deepEqual(readLensPrefs(throwing, KEY, known), EMPTY_LENS_PREFS);
  assert.equal(writeLensPrefs(throwing, KEY, EMPTY_LENS_PREFS), false);
  const stale = { v: 1, pinned: [uid(1), uid(99), 7, uid(1)], compact: 'ja', saved: [
    { name: 'Gammal', lens: 'ofordelat', filter: { classId: uid(98), subject: '', personId: uid(97), onlyIssues: true, course: '' }, showAll: true },
    { name: 'Gammal', lens: 'alla', filter: {}, showAll: false }, { name: '', lens: 'alla', filter: {} }, { name: 'Okänd lins', lens: 'andrat', filter: {} },
    { name: 'Fel filter', lens: 'alla', filter: { subject: 5 } }] };
  assert.deepEqual(readLensPrefs(memory({ [KEY]: JSON.stringify(stale) }), KEY, known), { pinned: [uid(1)], compact: false,
    saved: [{ name: 'Gammal', lens: 'ofordelat', filter: { classId: '', subject: '', personId: '', onlyIssues: true, course: '' }, showAll: true }] });
});

test('överflödig vakant rad: lärarna täcker hela det kända behovet båda terminerna och en vakant rad finns kvar (05.1-34)', () => {
  assert.equal(surplusVacant(entry([row(1, uid(1)), row(2, null)])), true);
  assert.equal(surplusVacant(entry([row(1, uid(1)), row(2, null)], h(20), h(20), { ht: h(20), vt: h(10) })), false, 'VT är inte täckt');
  assert.equal(surplusVacant(entry([row(1, uid(1))])), false, 'ingen vakant rad');
  assert.equal(surplusVacant(entry([row(2, null)], null, null, { ht: 0, vt: 0 })), false, 'okänt behov');
  assert.equal(surplusVacant(entry([row(1, uid(1)), row(2, null)], h(20), null, { ht: h(20), vt: 0 })), true, 'okänd termin räknas inte');
});
