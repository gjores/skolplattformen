import { test } from 'node:test';
import assert from 'node:assert/strict';
import { elevKrockar, foljRader, lagesStrackor, parseSchemaFolj, schemaElevernasKluster, schemaFolj } from './schema-folj.ts';
import { buildSchemaUnderlag, defaultSchemaTime } from './schema-underlag.ts';
import { defaultSchemaVillkor } from './schema-contract.ts';

/** Syntetisk tjänstefördelning: två klasser, ett valbart block med Spanska och Tyska, sex elever. Inga verkliga personer eller skolor. */
const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const h = n => n * 60;
const classKey = (c, r) => `class_timplan:${uid(c)}:2026:${r}`;
const need = (c, r, label) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, r), rowKey: r, label, needHt: h(54), needVt: h(54), needBasis: 'terms' });
const row = (id, sourceKey, personId, extra = {}) => ({ id: uid(id), lineageId: uid(id + 500), sourceKind: 'class_timplan', sourceKey, classId: uid(10), rowKey: 'x',
  personId, teacherHt: h(54), teacherVt: h(54), needHt: h(54), needVt: h(54), needBasis: 'terms', stale: false, jointGroupId: null, comment: '', ...extra });
const gRow = (id, n, personId) => row(id, `teaching_group:${uid(n)}`, personId, { sourceKind: 'teaching_group', classId: null, groupId: uid(n), classIds: [], sourceRefs: [], groupRevision: 1 });
const group = (id, name) => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(id)}`, rowKey: `group:${uid(id)}`, label: name, needHt: h(36), needVt: h(36),
  needBasis: 'terms', groupId: uid(id), name, language: null, groupRevision: 1, classIds: [uid(10), uid(11)], sourceRefs: [], stale: false, blockId: uid(60), optionId: uid(id + 50), subjectCode: 'X', levelCode: '1' });
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 1,
  version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: [20, 21, 22].map(n => ({ personId: uid(n), displayName: `Provlärare ${n - 16}`, draft: false, shareHere: 100 })),
  classes: [{ classId: uid(10), name: 'Klass 1', link: null, aplMinutes: null, needs: [need(10, 'ma', 'Matematik'), need(10, 'idh', 'Idrott och hälsa')] },
    { classId: uid(11), name: 'Klass 2', link: null, aplMinutes: null, needs: [need(11, 'ma', 'Matematik')] }],
  rows: [row(30, classKey(10, 'ma'), uid(20)), row(31, classKey(10, 'idh'), uid(21)), row(32, classKey(11, 'ma'), uid(20)), gRow(35, 40, uid(21)), gRow(36, 41, uid(22))],
  groups: [group(40, 'Spanska'), group(41, 'Tyska')], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
// Klass 1: elev 1–3, Klass 2: elev 4–6. Spanska: elev 1, 2 och 4. Tyska: elev 5. Elev 3 och 6 har inget val.
const pupils = [1, 2, 3, 4, 5, 6].map(n => ({ id: uid(900 + n), classIds: [uid(n <= 3 ? 10 : 11)] }));
const m = (g, p) => ({ groupId: uid(g), pupilId: uid(900 + p), startsOn: '2026-08-17', endsOn: null });
const members = { pupils, memberships: [m(40, 1), m(40, 2), m(40, 4), m(41, 5)] };
const names = new Map(pupils.map((p, i) => [p.id, `Provelev ${i + 1}`]));
const request = { unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: defaultSchemaVillkor() };
const underlag = buildSchemaUnderlag(plan, request, { members, time: defaultSchemaTime() });
const lessons = underlag.labels.lessons, of = (title, cls) => lessons.filter(l => l.title === title && (cls === undefined || l.classIds.includes(cls))).map(l => l.id);
const ma1 = of('Matematik', 'grupp-1'), idh1 = of('Idrott och hälsa'), sp = of('Spanska'), ty = of('Tyska');
const spanska = underlag.problem.lessons.find(l => l.id === sp[0]).groups[0];

test('elevernas kluster stämmer med underlagets indelning, annars ingen elevlista', () => {
  const k = schemaElevernasKluster(plan, underlag, members);
  assert.equal(k.real, 5);
  // Elev 1 och 2 har samma klass och grupp: samma kluster, med storlek 2 i underlaget.
  assert.equal(k.of.get(uid(901)), k.of.get(uid(902)));
  assert.equal(underlag.problem.clusters.find(c => c.id === k.of.get(uid(901))).size, 2);
  assert.notEqual(k.of.get(uid(901)), k.of.get(uid(903)));
  // Ett medlemskap som underlaget inte har: indelningen stämmer inte och ingen lista ges.
  assert.equal(schemaElevernasKluster(plan, underlag, { ...members, memberships: [...members.memberships, m(41, 3)] }), null);
  assert.deepEqual(schemaElevernasKluster(plan, underlag, null), { of: new Map(), real: 0 });
});

test('pass med blockgrupp: gruppen på passet och klasserna som delar elever, med antal', () => {
  const f = schemaFolj(plan, underlag, members, names, sp[0], null);
  assert.deepEqual(f.grupper.map(g => [g.name, g.slag, g.elever, g.delar, g.klasser]), [['Spanska', 'grupp', 3, null, ['Klass 1', 'Klass 2']], ['Klass 1', 'klass', 3, 2, []], ['Klass 2', 'klass', 3, 1, []]]);
  assert.deepEqual(f.grupper[0].lessons, sp);
  assert.deepEqual(f.elever.map(e => e.name), ['Provelev 1', 'Provelev 2', 'Provelev 4']);
  // Klassens pass: Tyska delar inga elever med Matematik i klass 1, Spanska delar två.
  const k1 = schemaFolj(plan, underlag, members, names, ma1[0], null);
  assert.deepEqual(k1.grupper.map(g => [g.name, g.delar, g.antagen]), [['Klass 1', null, false], ['Spanska', 2, false]]);
  assert.deepEqual(k1.grupper[0].lessons.sort(), [...ma1, ...idh1].sort());
  assert.deepEqual(k1.elever.map(e => e.name), ['Provelev 1', 'Provelev 2', 'Provelev 3']);
  // Utan rätt att se elever (inga namn) finns ingen elevlista; grupperna och antalen finns ändå.
  assert.equal(schemaFolj(plan, underlag, members, null, ma1[0], null).elever, null);
  assert.equal(schemaFolj(plan, underlag, members, new Map(), ma1[0], null).elever, null);
  // Ingen elev-ID i svaret utan elevlista.
  assert.ok(!JSON.stringify(schemaFolj(plan, underlag, members, null, ma1[0], null)).includes('52a10000'));
  // Utan elevregister: antagen klasstorlek.
  const utan = buildSchemaUnderlag(plan, request, { members: null, time: defaultSchemaTime() });
  const a = schemaFolj(plan, utan, null, null, utan.labels.lessons.find(l => l.title === 'Matematik').id, null);
  assert.equal(a.grupper[0].antagen, true);
  assert.equal(a.elever, null);
});

test('elevens schema är klassens och elevens gruppers pass; elev utan passet nekas', () => {
  const e = schemaFolj(plan, underlag, members, names, ma1[0], uid(901)).elev;
  assert.equal(e.name, 'Provelev 1');
  assert.deepEqual(e.grupper, ['Klass 1', 'Spanska']);
  assert.deepEqual([...e.lessons].sort(), [...ma1, ...idh1, ...sp].sort());
  assert.deepEqual(e.fromGroup, sp);
  assert.ok(!e.lessons.some(id => ty.includes(id)), 'elevens schema ska inte ha Tyska');
  // Elev 6 i klass 2 har inte Matematik i klass 1.
  assert.throws(() => schemaFolj(plan, underlag, members, names, ma1[0], uid(906)));
  assert.throws(() => schemaFolj(plan, underlag, members, names, 'pass-999', null));
  // Klientens tolkning: samma svar, och fel form nekas.
  const svar = schemaFolj(plan, underlag, members, names, ma1[0], uid(901)), wire = JSON.parse(JSON.stringify(svar));
  assert.deepEqual(parseSchemaFolj(wire, underlag.fingerprint, ma1[0]), svar);
  for (const broken of [{ ...wire, lesson: sp[0] }, { ...wire, extra: 1 }, { ...wire, grupper: [{ ...wire.grupper[0], id: 'kluster-1' }] },
    { ...wire, elever: [{ id: 'elev-1', name: 'x' }] }, { ...wire, elev: { ...wire.elev, fromGroup: ['pass-999'] } }, { ...wire, grupper: [{ ...wire.grupper[0], delar: -1 }] }])
    assert.throws(() => parseSchemaFolj(broken, underlag.fingerprint, ma1[0]), JSON.stringify(broken).slice(0, 120));
  assert.throws(() => parseSchemaFolj(wire, '0'.repeat(28), ma1[0]));
});

/** Förslaget som klienten ser det, med placeringar. */
const forslag = (at) => ({ classes: underlag.labels.classes, teachers: underlag.labels.teachers, rooms: [],
  lessons: lessons.map(({ activity: _a, ...l }) => ({ ...l, day: at[l.id]?.[0] ?? null, startMin: at[l.id]?.[1] ?? null, roomId: null })) });

test('raderna: klass, lärare, grupp som delar elever och elev; krock som bara syns på elevnivå hittas', () => {
  // Idrott i klass 1 och Spanska samtidigt måndag 13:00: klassens schema har bara Idrott (helklass), Spanskas bara Spanska.
  const at = { [ma1[0]]: [0, 480], [idh1[0]]: [0, 780], [sp[0]]: [0, 780], [ty[0]]: [0, 780] };
  const f = forslag(at), svar = schemaFolj(plan, underlag, members, names, ma1[0], uid(901));
  const rader = foljRader(f, ma1[0], svar, () => true);
  assert.deepEqual(rader.map(r => [r.slag, r.name, r.detail]), [['klass', 'Klass 1', 'klass · 3 elever'], ['larare', 'Provlärare 4', 'lärare · Matematik'],
    ['delar', 'Spanska', 'grupp · delar 2 elever'], ['elev', 'Provelev 1', 'elev · Klass 1, Spanska']]);
  // Klassens rad visar alla pass klassen berörs av, som veckan (Tyska har bara elever ur klass 2); elevens rad bara elevens, med gruppens pass märkt.
  assert.deepEqual(rader[0].lessons.map(l => l.id).sort(), [ma1[0], idh1[0], sp[0]].sort());
  assert.deepEqual(rader[3].lessons.map(l => l.id).sort(), [ma1[0], idh1[0], sp[0]].sort());
  assert.ok(rader[3].fromGroup.has(sp[0]) && !rader[3].fromGroup.has(idh1[0]));
  const k = elevKrockar(rader);
  assert.deepEqual([...k.lessons].sort(), [idh1[0], sp[0]].sort());
  assert.deepEqual(k.texter, ['Måndag 13:00 krockar för eleven: klassens Idrott och hälsa och elevens Spanska ligger samtidigt. Krocken syns inte i klassens eller gruppens schema var för sig.']);
  // Utan elev ingen krock; olika terminer krockar inte.
  assert.equal(elevKrockar(foljRader(f, ma1[0], { ...svar, elev: null }, () => true)).lessons.size, 0);
  const vt = { ...f, lessons: f.lessons.map(l => l.id === sp[0] ? { ...l, term: 'vt' } : l.id === idh1[0] ? { ...l, term: 'ht' } : l) };
  assert.equal(elevKrockar(foljRader(vt, ma1[0], svar, () => true)).lessons.size, 0);
  // Utan serverns svar: passets klasser ur förslaget, lärarna och salen.
  assert.deepEqual(foljRader(f, ma1[0], null, () => true).map(r => r.key), ['klass:grupp-1', 'larare:larare-1']);
  // Bara pass som visas (t.ex. terminen) och som har en tid.
  assert.deepEqual(foljRader(f, ma1[0], null, l => l.id !== idh1[0])[0].lessons.map(l => l.id).sort(), [ma1[0], sp[0]].sort());
  assert.equal(spanska.startsWith('grupp-'), true);
});

test('möjliga starttider blir sträckor med samma läge per dag', () => {
  const p = (day, startMin, state) => ({ day, startMin, state });
  assert.deepEqual(lagesStrackor([p(0, 500, 'fri'), p(0, 480, 'fri'), p(0, 490, 'fri'), p(0, 510, 'brott'), p(0, 530, 'brott'), p(1, 480, 'brott')], 10), [
    { day: 0, from: 480, to: 510, state: 'fri' }, { day: 0, from: 510, to: 520, state: 'brott' }, { day: 0, from: 530, to: 540, state: 'brott' }, { day: 1, from: 480, to: 490, state: 'brott' }]);
});
