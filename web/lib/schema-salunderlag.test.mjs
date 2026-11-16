// 05.2-SM-UXF-21: salregister och salbehov genom underlaget till motorns problem. Syntetiska uppgifter.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, defaultSchemaTime, schemaForslag } from './schema-underlag.ts';
import { checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaVillkor, sammaGrund } from './schema-contract.ts';
import { schemaDiagnos } from './schema-diagnos.ts';
import { andraSal, laggTillSal, overforSalnamn, sattSalbehov, taBortSal, tomtSalbehov } from './schema-salregister.ts';
import { schemaLage } from './schema-status.ts';

const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, h = n => n * 60;
const classKey = (c, row) => `class_timplan:${uid(c)}:2026:${row}`;
const need = (c, row, label) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, row), rowKey: row, label, needHt: h(54), needVt: h(54), needBasis: 'terms' });
const row = (id, c, key, personId) => ({ id: uid(id), lineageId: uid(id + 500), sourceKind: 'class_timplan', sourceKey: classKey(c, key), classId: uid(c), rowKey: key,
  personId, teacherHt: h(54), teacherVt: h(54), needHt: h(54), needVt: h(54), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' });
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 3,
  version: { id: uid(2), versionNo: 4, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: [20, 21, 22].map(n => ({ personId: uid(n), displayName: `Lärare ${n}`, draft: false, shareHere: 100 })),
  classes: [{ classId: uid(10), name: '1A', link: null, aplMinutes: null, needs: [need(10, 'ma', 'Matematik'), need(10, 'ke', 'Kemi')] },
    { classId: uid(11), name: '1B', link: null, aplMinutes: null, needs: [need(11, 'ke', 'Kemi')] }],
  rows: [row(30, 10, 'ma', uid(20)), row(31, 10, 'ke', uid(21)), row(32, 11, 'ke', uid(22))],
  groups: [], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
// 22 elever i 1A; 1B saknar elever, så dess elevantal är okänt.
const basis = { members: { pupils: Array.from({ length: 22 }, (_, i) => ({ id: uid(1000 + i), classIds: [uid(10)] })), memberships: [] }, time: defaultSchemaTime() };
const build = villkor => buildSchemaUnderlag(plan, { period: 'ht', villkor }, basis);
const sal = (name, typ, platser, utrustning = []) => ({ name, typ, platser, utrustning });
function medRegister() {
  let v = defaultSchemaVillkor();
  for (const s of [sal('A101', 'Allmän sal', 32), sal('Bortvald', 'Allmän sal', 30), sal('Labb 1', 'Laborationssal', 24, ['Dragskåp']), sal('Labb 2', 'Laborationssal', 18, ['Dragskåp']), sal('Okänd', 'Allmän sal', null)]) v = laggTillSal(v, s);
  return taBortSal(v, 'sal-2').villkor;
}
const passFor = (u, title, klass) => u.labels.lessons.filter(l => l.title === title && (!klass || l.classIds.includes(u.labels.classes.find(c => c.name === klass).id)));

test('registrets ID, platser och egenskaper når motorns problem även när numren är glesa', () => {
  const v = medRegister(), u = build(v);
  assert.deepEqual(u.problem.rooms.map(r => r.id), ['sal-1', 'sal-3', 'sal-4', 'sal-5']);
  assert.deepEqual(u.problem.rooms[1], { id: 'sal-3', capacity: 24, features: ['typ:laborationssal', 'utr:dragskåp'] });
  assert.deepEqual(u.problem.rooms[3], { id: 'sal-5', features: ['typ:allmän sal'] }, 'okända platser sänds inte som noll');
  assert.deepEqual(checkSchemaVillkor(v), []); assert.deepEqual(parseSchemaVillkor(JSON.parse(JSON.stringify(v))), v);
  // Utan salbehov är varje undervisning obesvarad och passen läggs utan sal, som förut.
  assert.ok(u.problem.lessons.every(l => !l.rooms)); assert.ok(u.labels.lessons.every(l => l.sal.lage === 'obesvarat'));
  assert.equal(schemaLage(u.labels.lessons.map(l => ({ ...l, day: 0, roomId: null }))).sal.utanSalbehov, u.labels.lessons.length);
});
test('salbehovet ger snittet av kraven: ämnets krav ärvs, elevantalet sorterar bort för små salar och undantag går före', () => {
  let v = sattSalbehov(medRegister(), 'amne', 'Kemi', { ...tomtSalbehov('sarskild'), utrustning: ['dragskåp'] });
  v = sattSalbehov(v, 'amne', 'Matematik', tomtSalbehov('allman'));
  const u = build(v), kemiA = passFor(u, 'Kemi', '1A'), kemiB = passFor(u, 'Kemi', '1B'), ma = passFor(u, 'Matematik');
  assert.ok(kemiA.length && kemiB.length && ma.length);
  // 1A har 22 elever: Labb 2 (18 platser) faller bort. Alla tillåtna salar har kända platser, så motorn får minimikravet.
  assert.deepEqual(kemiA[0].roomIds, ['sal-3']); assert.deepEqual(kemiA[0].sal, { undervisning: kemiA[0].sal.undervisning, lage: 'sarskild', kalla: 'amne', elever: 22, kapacitet: { 'sal-3': 'racker' } });
  assert.deepEqual(u.problem.lessons.find(l => l.id === kemiA[0].id).rooms, { count: 1, allowed: ['sal-3'], features: ['utr:dragskåp'], min_capacity: 22 });
  // 1B saknar elever: båda labben är kvar och kapaciteten är inte kontrollerad. Inget minimikrav sänds.
  assert.deepEqual(kemiB[0].roomIds, ['sal-3', 'sal-4']); assert.deepEqual(kemiB[0].sal.kapacitet, { 'sal-3': 'okand', 'sal-4': 'okand' }); assert.equal(kemiB[0].sal.elever, null);
  assert.deepEqual(u.problem.lessons.find(l => l.id === kemiB[0].id).rooms, { count: 1, allowed: ['sal-3', 'sal-4'], features: ['utr:dragskåp'] });
  // Allmän sal: sal med okända platser är kvar, därför sänds inget minimikrav till motorn.
  assert.deepEqual(ma[0].roomIds, ['sal-1', 'sal-5']); assert.deepEqual(ma[0].sal.kapacitet, { 'sal-1': 'racker', 'sal-5': 'okand' });
  assert.deepEqual(u.problem.lessons.find(l => l.id === ma[0].id).rooms, { count: 1, allowed: ['sal-1', 'sal-5'], features: ['typ:allmän sal'] });
  // Eget undantag för 1A: sal behövs inte.
  const undantag = build(sattSalbehov(v, 'undervisning', kemiA[0].sal.undervisning, { ...tomtSalbehov('ingen'), form: 'utomhus' }));
  assert.deepEqual(passFor(undantag, 'Kemi', '1A')[0].sal, { undervisning: kemiA[0].sal.undervisning, lage: 'ingen', kalla: 'eget', elever: 22 });
  assert.ok(!undantag.problem.lessons.find(l => l.id === kemiA[0].id).rooms); assert.deepEqual(passFor(undantag, 'Kemi', '1B')[0].roomIds, ['sal-3', 'sal-4']);
});
test('tom mängd ger hindret sal_saknas med kraven i klartext, och passet läggs utan sal', () => {
  const v = sattSalbehov(medRegister(), 'amne', 'Kemi', { ...tomtSalbehov('sarskild'), utrustning: ['Dragskåp'], typ: 'Allmän sal' }), u = build(v);
  const kemi = passFor(u, 'Kemi', '1A')[0];
  assert.deepEqual(kemi.roomIds, []); assert.equal(kemi.sal.hinder, 'Ingen sal uppfyller alla krav: saltyp allmän sal, dragskåp, minst 22 platser.');
  const fynd = schemaDiagnos(u, []).filter(f => f.code === 'sal_saknas');
  assert.equal(fynd.length, 2); assert.match(fynd[0].message, /^Kemi \(1A\) har ingen lämplig sal\. Ingen sal uppfyller alla krav/u); assert.equal(fynd[0].proof, false);
  const lage = schemaLage(u.labels.lessons.map(l => ({ ...l, day: 0, roomId: null })));
  assert.equal(lage.sal.hinder, passFor(u, 'Kemi').length); assert.equal(lage.sal.utanSalbehov, passFor(u, 'Matematik').length);
});
test('registret ändrar aldrig grunden: överföring, ny sal, nytt namn och borttagen sal lämnar passen och fingeravtrycket orörda', () => {
  const gammalt = { ...defaultSchemaVillkor(), salar: ['Hallen', 'Labbet'], egna: [{ slag: 'amne', ref: 'Kemi', typ: 'sal', rooms: ['Labbet'] }] };
  const fore = build(gammalt), overfort = overforSalnamn(gammalt), efter = build(overfort);
  assert.equal(efter.grundFingerprint, fore.grundFingerprint); assert.ok(sammaGrund(gammalt, overfort));
  assert.deepEqual(efter.problem.lessons, fore.problem.lessons, 'äldre salvillkor gäller oförändrat efter överföringen');
  assert.deepEqual(passFor(efter, 'Kemi')[0].sal.lage, 'aldre'); assert.deepEqual(passFor(efter, 'Kemi')[0].roomIds, ['sal-2']);
  let v = laggTillSal(overfort, sal('A101', 'Allmän sal', 30));
  v = andraSal(v, 'sal-2', sal('Labb 1', 'Laborationssal', 24, ['Dragskåp']));
  const andrat = build(v);
  assert.equal(andrat.grundFingerprint, fore.grundFingerprint); assert.ok(sammaGrund(gammalt, v));
  assert.deepEqual(passFor(andrat, 'Kemi')[0].roomIds, ['sal-2'], 'namnbytet följde med i salvillkoret');
  const borta = build(taBortSal(v, 'sal-1').villkor);
  assert.equal(borta.grundFingerprint, fore.grundFingerprint); assert.deepEqual(borta.problem.rooms.map(r => r.id), ['sal-2', 'sal-3']);
  assert.deepEqual(passFor(borta, 'Kemi')[0].roomIds, ['sal-2'], 'en borttagen sal flyttar inte andra pass till fel sal');
  // Ett utkast utan äldre salnamn kan få register och salbehov utan att grunden ändras.
  const tomt = defaultSchemaVillkor(), nytt = sattSalbehov(laggTillSal(tomt, sal('A101', 'Allmän sal', 30)), 'amne', 'Matematik', tomtSalbehov('allman'));
  assert.equal(build(nytt).grundFingerprint, build(tomt).grundFingerprint); assert.ok(sammaGrund(tomt, nytt));
});
test('förslaget bär passens salbehov till klienten och tolkas tillbaka', () => {
  const v = sattSalbehov(medRegister(), 'amne', 'Matematik', tomtSalbehov('allman')), u = build(v), request = { unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: v };
  const placements = u.problem.lessons.map((l, i) => ({ lesson: l.id, day: i % 5, startMin: 480 + 60 * Math.floor(i / 5), room: l.rooms?.allowed[0] ?? null }));
  const f = schemaForslag(plan, request, u, { status: 'complete', placements, unplaced: [], diagnoses: [], metrics: { studentGapMin: 0, teacherGapMin: 0 }, elapsedMs: 1 });
  const tolkad = parseSchemaForslag(JSON.parse(JSON.stringify(f)), request), ma = tolkad.lessons.find(l => l.title === 'Matematik');
  assert.deepEqual(ma.sal.kapacitet, { 'sal-1': 'racker', 'sal-5': 'okand' }); assert.equal(ma.roomId, 'sal-1');
  const lage = schemaLage(tolkad.lessons);
  assert.equal(lage.kapacitet.kontrollerad, tolkad.lessons.filter(l => l.title === 'Matematik').length); assert.equal(lage.sal.utanSalbehov, tolkad.lessons.filter(l => l.title === 'Kemi').length);
});
test('villkoren nekar salbehov utan register och register som inte följer salarnas namn', () => {
  const v = medRegister();
  assert.match(checkSchemaVillkor({ ...defaultSchemaVillkor(), salbehov: [{ slag: 'amne', ref: 'Kemi', ...tomtSalbehov('allman') }] }).at(-1), /kräver ett salregister/u);
  assert.match(checkSchemaVillkor({ ...v, salar: ['A101'] }).at(-1), /stämmer inte överens/u);
  assert.throws(() => parseSchemaVillkor({ ...v, salregister: { ...v.salregister, extra: 1 } }));
});
