import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_CONTRACT_VERSION, defaultSchemaVillkor } from './schema-contract.ts';
import { samlingResurser, samlingPass, samlingUpptagen, gemensamLedigTid, lunchTryck, ledigaResurser, filtreraSamling, sakerArbetsvy, lasArbetsvyer, skrivArbetsvyer, arbetsvyNyckel, parseSamlingData, samlingForslag, schemaSamlingData } from './schema-samling.ts';
import { buildSchemaUnderlag, defaultSchemaTime } from './schema-underlag.ts';

const l = (id, title, cls, teacherIds, day, startMin, roomId = null, extra = {}) => ({ id, title, classIds: [cls], teacherIds, durationMin: 60, marginBeforeMin: 0, marginMin: 0, roomIds: roomId ? [roomId] : [], roomId, day, startMin, vacant: false, term: null, ...extra });
const v = { ...defaultSchemaVillkor(), days: Array(5).fill({ startMin: 480, endMin: 960 }), lunch: { startMin: 660, endMin: 810, lengthMin: 40, teachers: true }, salar: ['Sal 1', 'Sal 2'], breakMin: 0 };
const f = { grundFingerprint: '0'.repeat(28), days: v.days, lessons: [l('pass-1', 'Matematik', 'grupp-1', ['larare-1'], 0, 540, 'sal-1'), l('pass-2', 'Svenska', 'grupp-1', ['larare-2'], 0, 660),
  l('pass-3', 'Matematik', 'grupp-2', ['larare-2'], 0, 780, 'sal-2'), l('pass-4', 'Matematik', 'grupp-1', ['larare-1'], 1, 600, null, { term: 'vt' })],
  classes: [{ id: 'grupp-1', name: 'Klass 1' }, { id: 'grupp-2', name: 'Klass 2' }], teachers: [{ id: 'larare-1', name: 'Provlärare A' }, { id: 'larare-2', name: 'Provlärare B' }, { id: 'larare-3', name: 'Provlärare C' }], rooms: [{ id: 'sal-1', name: 'Sal 1' }, { id: 'sal-2', name: 'Sal 2' }],
  resurser: { klass: [{ ref: 'k1', name: 'Klass 1' }, { ref: 'k2', name: 'Klass 2' }], grupp: [], larare: [{ ref: 't1', name: 'Provlärare A' }, { ref: 't2', name: 'Provlärare B' }, { ref: 't3', name: 'Provlärare C' }], amne: [], pass: [] } };
const rs = samlingResurser(f), of = key => rs.find(r => r.key === key);

test('resursurval binder arbetsvy till stabil appreferens och sal till namn, aldrig elev', () => {
  assert.equal(of('klass:k1').id, 'grupp-1'); assert.deepEqual(of('larare:t2').lessons, ['pass-2', 'pass-3']); assert.equal(of('sal:Sal 1').id, 'sal-1');
  assert.ok(!rs.some(r => r.slag === 'elev'));
});
test('gemensam ledig tid för tre resurser, med marginal och direkt spärr; filter får inte ge falsk ledighet', () => {
  const ff = { ...f, lessons: f.lessons.map(l => l.id === 'pass-1' ? { ...l, marginBeforeMin: 10, marginMin: 15 } : l) };
  const vv = { ...v, egna: [{ slag: 'larare', ref: 't1', typ: 'sparrad', days: [0], startMin: 840, endMin: 900 }, { slag: 'pass', ref: 'pass-1', typ: 'marginal', beforeMin: 10, afterMin: 15, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: [], when: 'alltid' }] };
  const common = gemensamLedigTid([of('klass:k1'), of('larare:t1'), of('sal:Sal 2')], ff, vv, 'ht').filter(s => s.day === 0);
  assert.deepEqual(common, [{ day: 0, startMin: 480, endMin: 530 }, { day: 0, startMin: 615, endMin: 660 }, { day: 0, startMin: 720, endMin: 780 }, { day: 0, startMin: 900, endMin: 960 }]);
  assert.deepEqual(gemensamLedigTid([of('klass:k1')], ff, vv, 'ht'), []);
});
test('lunchtryck räknar varje elevkluster en gång, skiljer antagna och rapporterar saknad lunch', () => {
  const lunch = lunchTryck([{ size: 8, antagen: false, lessons: ['pass-1', 'pass-2'] }, { size: 2, antagen: true, lessons: ['pass-1', 'pass-2'] }], f, v, 'ht');
  assert.equal(lunch.slots[0].startMin, 720); assert.equal(lunch.slots[0].pupils, 10); assert.equal(lunch.slots[0].antagna, 2); assert.equal(lunch.utanLunch, 0);
  assert.ok(lunch.slots.every(s => s.pupils === 10));
  assert.equal(lunchTryck([{ size: 8, antagen: false, lessons: ['pass-2'] }], f, { ...v, lunch: { ...v.lunch, endMin: 720 } }, 'ht').utanLunch, 8);
});
test('lediga lärare med ämnesuppdrag först; salens aktuella placering och spärr prövas', () => {
  const vv = { ...v, egna: [{ slag: 'sal', ref: 'Sal 1', typ: 'sparrad', days: [0], startMin: 840, endMin: 900 }] };
  const free = ledigaResurser(rs, f, vv, 'ht', { day: 0, startMin: 840, endMin: 900 }, 'Matematik');
  assert.deepEqual(free.map(r => [r.key, r.undervisar]), [['larare:t1', true], ['larare:t2', true], ['larare:t3', false], ['sal:Sal 2', false]]);
  assert.ok(!ledigaResurser(rs, f, v, 'ht', { day: 0, startMin: 540, endMin: 600 }).some(r => r.key === 'sal:Sal 1'));
});
test('kombinerbara ämnes-/års-/terminsfilter och terminer; filtrering ändrar inte underlag', () => {
  const resources = rs.map(r => r.key === 'klass:k1' ? { ...r, year: 'År 1' } : r);
  assert.deepEqual(filtreraSamling(f.lessons, { subject: 'Matematik', year: 'År 1', term: 'ht' }, resources).map(l => l.id), ['pass-1']);
  assert.deepEqual(samlingPass(of('klass:k1'), f.lessons, 'ht').map(l => l.id), ['pass-1', 'pass-2']); assert.equal(f.lessons.length, 4);
});
test('gruppens elevers klasspass upptar dem även när de inte ritas på gruppraden; ämnesfönster upptar inte hela läraren', () => {
  const group = { key: 'grupp:g1', id: 'grupp-3', slag: 'grupp', name: 'Provgrupp', lessons: ['pass-2'], busyLessons: ['pass-1', 'pass-2'], size: 10, antagen: false, year: null };
  assert.deepEqual(samlingPass(group, f.lessons, 'ht').map(l => l.id), ['pass-2']);
  assert.deepEqual(samlingUpptagen(group, f, v, 'ht', 0), [[540, 600], [660, 720]]);
  const own = { ...v, egna: [{ slag: 'amne', ref: 'Matematik', typ: 'tillaten', days: [0], startMin: 840, endMin: 900 }] };
  assert.ok(ledigaResurser(rs, f, own, 'ht', { day: 0, startMin: 720, endMin: 780 }).some(r => r.key === 'larare:t1'));
});
test('arbetsvyer lagras per skola; elevval och okända fält stryks även ur injicerat lokalt innehåll', () => {
  const values = new Map(), storage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v) };
  const view = { id: 'a', name: ' Provvy ', resources: ['klass:k1', 'elev:1', 'larare:t1'], layers: { lunch: true, elevNamn: 'Provelev' }, filter: { subject: '', year: '', program: '', team: '', term: '' }, color: 'amne', compact: false, day: null, pupil: 'hemlig' };
  assert.equal(skrivArbetsvyer(storage, 'skola-a', [view]), true); assert.equal(lasArbetsvyer(storage, 'skola-b').length, 0);
  const saved = values.get(arbetsvyNyckel('skola-a')); assert.ok(!saved.includes('elev:') && !saved.includes('Provelev') && !saved.includes('hemlig'));
  assert.deepEqual(lasArbetsvyer(storage, 'skola-a')[0].resources, ['klass:k1', 'larare:t1']);
  values.set(arbetsvyNyckel('skola-a'), JSON.stringify([view, null, {}])); assert.equal(lasArbetsvyer(storage, 'skola-a').length, 1);
  assert.deepEqual(sakerArbetsvy(view).resources, ['klass:k1', 'larare:t1']);
});
test('samlingens svar nekar fel grund, okända pass, riktiga elev-ID och dubbletter', () => {
  const raw = { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, resources: rs, clusters: [{ size: 20, antagen: true, lessons: ['pass-1'] }] };
  assert.equal(parseSamlingData(raw, f).resources.length, rs.length);
  assert.throws(() => parseSamlingData({ ...raw, grundFingerprint: 'x' }, f));
  assert.throws(() => parseSamlingData({ ...raw, resources: [...rs, { ...rs[0], key: 'elev:123', id: 'pupil-uuid', slag: 'elev' }] }, f));
  assert.throws(() => parseSamlingData({ ...raw, resources: [...rs, rs[0]] }, f));
  assert.throws(() => parseSamlingData({ ...raw, clusters: [{ size: 1, antagen: false, lessons: ['pass-999'] }] }, f));
});
test('samlingsvyn följer flytt, aktuell sal och viloyta', () => {
  const ff = samlingForslag(f, [{ lesson: 'pass-1', day: 3, startMin: 720, room: 'sal-2' }]);
  assert.equal(ff.lessons[0].day, 3); assert.equal(ff.lessons[0].roomId, 'sal-2'); assert.equal(ff.lessons[1].day, null);
  assert.deepEqual(samlingPass(of('sal:Sal 2'), ff.lessons, 'ht').map(l => l.id), ['pass-1']);
});

test('serverns elevresurser följer avstämt medlemskap och lästa namn, utan att person-ID eller namn läcker till anonym lunchräkning', () => {
  const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, sourceKey = `class_timplan:${uid(10)}:2026:ma`;
  const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskola', schoolYear: 2026, revision: 1,
    version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
    teachers: [{ personId: uid(20), displayName: 'Provlärare', draft: false, shareHere: 100 }],
    classes: [{ classId: uid(10), name: 'Provklass', link: null, aplMinutes: null, needs: [{ sourceKind: 'class_timplan', sourceKey, rowKey: 'ma', label: 'Matematik', needHt: 1200, needVt: 1200, needBasis: 'terms' }] }],
    rows: [{ id: uid(30), lineageId: uid(31), sourceKind: 'class_timplan', sourceKey, classId: uid(10), rowKey: 'ma', personId: uid(20), teacherHt: 1200, teacherVt: 1200, needHt: 1200, needVt: 1200, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }],
    groups: [], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
  const members = { pupils: [{ id: uid(901), classIds: [uid(10)] }, { id: uid(902), classIds: [uid(10)] }], memberships: [] };
  const u = buildSchemaUnderlag(plan, { period: 'ht', villkor: v }, { time: defaultSchemaTime(), members });
  const named = schemaSamlingData(plan, u, members, new Map([[uid(901), 'Provelev 1']]));
  assert.equal(named.resources.filter(r => r.slag === 'elev').length, 1);
  assert.deepEqual(named.resources.find(r => r.slag === 'elev').lessons, u.problem.lessons.map(l => l.id));
  assert.ok(!JSON.stringify(named).includes(uid(901)) && !JSON.stringify(named).includes(uid(902)));
  assert.ok(!JSON.stringify(named.clusters).includes('Provelev'));
  assert.equal(named.clusters.reduce((n, c) => n + c.size, 0), 2);
  const noNames = schemaSamlingData(plan, u, members, new Map());
  assert.equal(noNames.resources.filter(r => r.slag === 'elev').length, 0);
  const mismatch = schemaSamlingData(plan, u, { ...members, pupils: members.pupils.slice(0, 1) }, new Map([[uid(901), 'Provelev 1']]));
  assert.equal(mismatch.resources.filter(r => r.slag === 'elev').length, 0);
  const makeGroup = (id, name, minutes) => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(id)}`, rowKey: `group:${uid(id)}`, label: name, needHt: minutes, needVt: minutes,
    needBasis: 'terms', groupId: uid(id), name, language: null, groupRevision: 1, classIds: [uid(10)], sourceRefs: [], stale: false, blockId: uid(60), optionId: uid(id + 50), subjectCode: 'X', levelCode: '1' });
  const groupedPlan = { ...plan, groups: [makeGroup(40, 'Utan egna pass', 0), makeGroup(41, 'Aktiv grupp', 1200)] };
  const groupedMembers = { ...members, memberships: [40, 41].map(g => ({ groupId: uid(g), pupilId: uid(901), startsOn: '2026-08-01', endsOn: null })) };
  const groupedUnderlag = buildSchemaUnderlag(groupedPlan, { period: 'ht', villkor: v }, { time: defaultSchemaTime(), members: groupedMembers });
  const grouped = schemaSamlingData(groupedPlan, groupedUnderlag, groupedMembers, new Map());
  const active = grouped.resources.find(r => r.key === `grupp:${uid(41)}`), inactive = grouped.resources.find(r => r.key === `grupp:${uid(40)}`);
  assert.equal(active.name, 'Aktiv grupp'); assert.equal(groupedUnderlag.groupRefs[uid(41)], active.id);
  assert.ok(active.busyLessons.length > active.lessons.length);
  assert.equal(inactive.name, 'Utan egna pass'); assert.equal(inactive.lessons.length, 0); assert.ok(inactive.busyLessons.length > 0);
});
