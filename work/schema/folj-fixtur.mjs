// Fixtur för Följ passet (05.2-SM-FOLJ): motorns riktiga lägessvar och Följ passets svar för vyns prov, för förslaget i web/e2e/fixtures/schema-forslag.json.
// Samma syntetiska skola som verify-koppling.mjs (kopierad; passen prövas mot fixturen så att underlaget är detsamma). Ingen databas, inga verkliga uppgifter.
// 05.2-SM-VILLKOR-DIREKT: skriptet ger också förslagets och kontrollens fixturer appens kontraktsversion och fingeravtryck (förslaget räknas inte om, så att
// vyns prov behåller sina pass), kör om kontrollens svar mot motorn och tar fram motorns svar för villkor som läggs till efter förslaget.
// Kör från web/: node ../work/schema/folj-fixtur.mjs   (kräver `cargo build --release` i schemamotor/)
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, schemaKontroll, schemaProvUnderlag } from '../../web/lib/schema-underlag.ts';
import { schemaTime } from '../../web/lib/schema-kalender.ts';
import { SCHEMA_CONTRACT_VERSION, checkSchemaPlacements, defaultSchemaVillkor, parseSchemaCheck, parseSchemaForslag, parseSchemaKontroll } from '../../web/lib/schema-contract.ts';
import { parseSchemaLagen, parseSchemaPositions, schemaElevKluster, schemaLagen, schemaPassKluster } from '../../web/lib/schema-lagen.ts';
import { parseSchemaFolj, schemaFolj } from '../../web/lib/schema-folj.ts';

const bin = new URL('../../schemamotor/target/release/', import.meta.url).pathname, fixtures = new URL('../../web/e2e/fixtures/', import.meta.url).pathname;
const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, h = n => n * 60;
const SUBJECTS = [['sv', 'Svenska', 54], ['ma', 'Matematik', 54], ['en', 'Engelska', 45], ['idh', 'Idrott och hälsa', 36], ['hi', 'Historia', 36], ['sh', 'Samhällskunskap', 36],
  ['nk', 'Naturkunskap', 36], ['pr', 'Programämne', 108],
  // Timplanen lägger religionskunskapen på höstterminen och psykologin på vårterminen, med samma lärare: de kan dela tid i veckan.
  ['re', 'Religionskunskap', 27, 0], ['ps', 'Psykologi', 0, 27]];
const CLASSES = 12, TEACHERS = 24;
const classKey = (c, row) => `class_timplan:${uid(100 + c)}:2026:${row}`;
const classes = [], rows = [];
for (let c = 0; c < CLASSES; c++) {
  classes.push({ classId: uid(100 + c), name: `Klass ${c + 1}`, link: null, aplMinutes: null,
    needs: SUBJECTS.map(([row, label, ht, vt = ht]) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, row), rowKey: row, label, needHt: h(ht), needVt: h(vt), needBasis: 'terms' })) });
  SUBJECTS.forEach(([row, , ht, vt = ht], n) => { const s = Math.min(n, 8); rows.push({ id: uid(1000 + rows.length), lineageId: uid(5000 + rows.length), sourceKind: 'class_timplan', sourceKey: classKey(c, row), classId: uid(100 + c), rowKey: row,
    personId: s === 3 && c === 0 ? null : uid(200 + (s * 3 + c) % TEACHERS), teacherHt: h(ht), teacherVt: h(vt), needHt: h(ht), needVt: h(vt), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }); });
}
// Ett valbart block för klass 1 och 2: två alternativ med elever och ett utan. 25 syntetiska elever per klass.
const BLOCK = [['Spanska', 0], ['Tyska', 1], ['Franska', 2]];
const groups = BLOCK.map(([name, i]) => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(300 + i)}`, rowKey: `group:${uid(300 + i)}`, label: name, needHt: h(36), needVt: h(36),
  needBasis: 'terms', groupId: uid(300 + i), name, language: null, groupRevision: 1, classIds: [uid(100), uid(101)], sourceRefs: [], stale: false, blockId: uid(350), optionId: uid(360 + i), subjectCode: 'X', levelCode: '1' }));
for (const [, i] of BLOCK) rows.push({ id: uid(1000 + rows.length), lineageId: uid(5000 + rows.length), sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(300 + i)}`, classId: null, rowKey: `group:${uid(300 + i)}`,
  groupId: uid(300 + i), classIds: [], sourceRefs: [], groupRevision: 1, personId: uid(200 + i), teacherHt: h(36), teacherVt: h(36), needHt: h(36), needVt: h(36), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' });
const pupils = Array.from({ length: CLASSES * 25 }, (_, i) => ({ id: uid(10000 + i), classIds: [uid(100 + Math.floor(i / 25))] }));
const memberships = pupils.slice(0, 50).flatMap((p, i) => i % 5 === 4 ? [] : [{ groupId: uid(300 + i % 2), pupilId: p.id, startsOn: '2026-08-17', endsOn: null }]);
// Läsårets tid ur en syntetisk läsårskalender, dag för dag (05.2-SM-TIMPLAN-VECKA, W1): höstlov, studiedag, sportlov och påsklov utöver röda dagar,
// och klass 12 med en egen friluftsdag på hösten.
const lov = (from, n) => Object.fromEntries(Array.from({ length: n }, (_, i) => { const d = new Date(`${from}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + i); return [d.toISOString().slice(0, 10), { kind: 'lovdag' }]; }));
const calendar = { versionId: uid(80), version: 1, status: 'faststalld', revision: 1, terms: { ht: { start: '2026-08-17', end: '2026-12-18' }, vt: { start: '2027-01-11', end: '2027-06-11' } },
  exceptions: { ...lov('2026-10-26', 5), '2026-11-11': { kind: 'studiedag' }, ...lov('2027-02-22', 5), ...lov('2027-03-29', 5) },
  groupDays: { [`klass:${uid(111)}`]: { '2026-11-12': { cause: 'friluftsdag' } } }, shortWeeks: {}, frameVersionId: null, contentHash: 'x', decidedOn: '2026-03-18', history: [] };
const time = schemaTime({ contractVersion: 'lasar_sql_v1', target: { kind: 'school', unitId: uid(1) }, schoolYear: 2026, schoolName: 'Provskolan', schoolTypes: ['GY'], mode: 'eget', modeLocked: false,
  versions: [{ versionId: uid(80), version: 1, status: 'faststalld', decidedOn: '2026-03-18', current: true }], calendar,
  groups: Array.from({ length: CLASSES }, (_, i) => ({ scope: 'klass', classId: uid(100 + i), offeringId: uid(90), columnId: null, label: `Klass ${i + 1}`, educationName: 'Provutbildning', kind: 'gy' })) },
  Array.from({ length: CLASSES }, (_, i) => uid(100 + i)));
assert.equal(time.source, 'kalender');
const basis = { members: { pupils, memberships }, time };
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 1,
  version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: Array.from({ length: TEACHERS }, (_, i) => ({ personId: uid(200 + i), displayName: `Provlärare ${i + 1}`, draft: false, shareHere: 100 })),
  classes, rows, groups, specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
const request = { unitId: uid(1), schoolYear: 2026, period: 'lasar', villkor: defaultSchemaVillkor() };
const forslag = JSON.parse(readFileSync(join(fixtures, 'schema-forslag.json'), 'utf8'));
const underlag = buildSchemaUnderlag(plan, request, basis);
// Förslagets pass ska vara underlagets; då får fixturen appens kontraktsversion och underlagets fingeravtryck. Inga gamla fingeravtryck står kvar.
const passen = list => list.map(l => [l.id, l.title, l.classIds, l.teacherIds, l.durationMin, l.marginMin, l.marginBeforeMin, l.roomIds, l.vacant, l.term]);
assert.deepEqual(passen(forslag.lessons), passen(underlag.labels.lessons), 'underlaget är inte detsamma som fixturens');
assert.deepEqual(forslag.villkor, request.villkor);
Object.assign(forslag, { contractVersion: SCHEMA_CONTRACT_VERSION, fingerprint: underlag.fingerprint, grundFingerprint: underlag.grundFingerprint });
parseSchemaForslag(JSON.parse(JSON.stringify(forslag)), request);
writeFileSync(join(fixtures, 'schema-forslag.json'), JSON.stringify(forslag));
const gammalKontroll = JSON.parse(readFileSync(join(fixtures, 'schema-kontroll.json'), 'utf8'));
// Elevernas namn är syntetiska; bara den som får se elever får dem i appen.
const names = new Map(pupils.map((p, i) => [p.id, `Provelev ${i + 1}`]));
const token = randomBytes(24).toString('hex'), port = 20000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}`;
const service = spawn(join(bin, 'schemamotor-tjanst'), [], { env: { SCHEMAMOTOR_TOKEN: token, SCHEMAMOTOR_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* startar */ }
    assert.ok(i < 50, 'tjänsten startade inte');
    await new Promise(r => setTimeout(r, 100));
  }
  // Samma steg som appens lägesrutt.
  const lagen = async (lesson, lessons, pupilId = null, u = underlag) => {
    const placements = checkSchemaPlacements(lessons.flatMap(l => l.day === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId ?? null }]), u.problem);
    const pupil = pupilId && schemaElevKluster(plan, request, basis, u, pupilId);
    if (pupilId) assert.ok(pupil && schemaPassKluster(u.problem, lesson).includes(pupil));
    const reply = await fetch(`${url}/v1/positions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ problem: u.problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })), lesson, ...(pupil ? { pupil } : {}) }) });
    const text = await reply.text();
    assert.equal(reply.status, 200, text.slice(0, 200));
    return parseSchemaLagen(JSON.parse(JSON.stringify(schemaLagen(u, parseSchemaPositions(JSON.parse(text), u.problem, lesson), pupil !== null))), forslag.grundFingerprint, lesson);
  };
  // Samma steg som appens kontrollrutt, med villkoren i begäran och förslagets grund (05.2-SM-VILLKOR-DIREKT).
  const kontroll = async (lessons, villkor = request.villkor) => {
    const u = schemaProvUnderlag(plan, { ...request, villkor, grundFingerprint: forslag.grundFingerprint }, basis);
    assert.ok(u, 'villkoren ska ha förslagets grund');
    const placements = checkSchemaPlacements(lessons.flatMap(l => l.day === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId ?? null }]), u.problem);
    const reply = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ problem: u.problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) }) });
    assert.equal(reply.status, 200);
    return parseSchemaKontroll(JSON.parse(JSON.stringify(schemaKontroll(u, placements, parseSchemaCheck(await reply.json(), u.problem)))), forslag.grundFingerprint);
  };
  // Kontrollens fixtur: samma flytt som förut (verify-koppling.mjs), körd om mot motorn.
  const { move } = gammalKontroll, flytt = forslag.lessons.map(l => l.id === move.lesson ? { ...l, day: move.day, startMin: move.startMin } : l);
  const clash = await kontroll(flytt), lifted = await kontroll(forslag.lessons.map(l => l.id === move.lesson ? { ...l, day: null, startMin: null } : l));
  assert.ok(clash.total > 0 && clash.violations.some(v => v.lessons.includes(move.lesson)) && lifted.total === 0 && (await kontroll(forslag.lessons)).total === 0);
  // Villkor efter förslaget (vyns prov): spärr för Klass 1 torsdag 14:00–16:30 och "Lägg aldrig här" för Programämne torsdag 10:00–11:10.
  const sparr = { slag: 'klass', ref: plan.classes[0].classId, typ: 'sparrad', days: [3], startMin: 840, endMin: 990 };
  const aldrig = { slag: 'amne', ref: 'Programämne', typ: 'sparrad', days: [3], startMin: 600, endMin: 670 };
  const villkorMed = egna => ({ ...request.villkor, egna });
  const direkt = { sparr: { regel: sparr, kontroll: await kontroll(forslag.lessons, villkorMed([sparr])) }, aldrig: { regel: aldrig, kontroll: await kontroll(forslag.lessons, villkorMed([aldrig])) } };
  for (const [namn, x] of Object.entries(direkt)) assert.ok(x.kontroll.total > 0 && x.kontroll.violations.every(v => v.code === 'outside_allowed'), `${namn}: kontrollen prövar inte villkoret`);
  writeFileSync(join(fixtures, 'schema-kontroll.json'), JSON.stringify({ move, clash, lifted, direkt }));
  // Matematik i klass 1 under hösten, som designvyn. Eleven: första eleven i klass 1 med Spanska.
  const lesson = forslag.lessons.find(l => l.title === 'Matematik' && l.classIds.length === 1 && l.classIds[0] === forslag.classes[0].id && l.term === 'ht' && l.day !== null);
  const pupilId = pupils[0].id;
  const alla = await lagen(lesson.id, forslag.lessons), elev = await lagen(lesson.id, forslag.lessons, pupilId);
  const fri = alla.positions.find(p => p.state === 'fri' && !(p.day === lesson.day && p.startMin === lesson.startMin));
  assert.ok(fri, 'ingen annan fri tid');
  const flyttad = forslag.lessons.map(l => l.id === lesson.id ? { ...l, day: fri.day, startMin: fri.startMin } : l), efter = await lagen(lesson.id, flyttad);
  const folj = parseSchemaFolj(JSON.parse(JSON.stringify(schemaFolj(plan, underlag, basis.members, names, lesson.id, null))), underlag.grundFingerprint, lesson.id);
  const foljElev = parseSchemaFolj(JSON.parse(JSON.stringify(schemaFolj(plan, underlag, basis.members, names, lesson.id, pupilId))), underlag.grundFingerprint, lesson.id);
  const utanElever = parseSchemaFolj(JSON.parse(JSON.stringify(schemaFolj(plan, underlag, basis.members, null, lesson.id, null))), underlag.grundFingerprint, lesson.id);
  // Möjliga starttider med en spärr för klassen efter förslaget (05.2-SM-VILLKOR-DIREKT): tiden under spärren är spärrad.
  const uSparr = schemaProvUnderlag(plan, { ...request, villkor: villkorMed([sparr]), grundFingerprint: forslag.grundFingerprint }, basis);
  const medSparr = await lagen(lesson.id, forslag.lessons, null, uSparr);
  const underSparr = medSparr.positions.filter(p => p.day === 3 && p.startMin < sparr.endMin && p.startMin + lesson.durationMin > sparr.startMin);
  assert.ok(underSparr.length && underSparr.every(p => p.state === 'sparrad'), 'spärren syns inte i lägena');
  assert.ok(alla.positions.filter(p => underSparr.some(q => q.day === p.day && q.startMin === p.startMin)).every(p => p.state !== 'sparrad'));
  assert.ok(folj.grupper.some(g => g.delar !== null), 'ingen grupp delar elever med passet');
  assert.equal(utanElever.elever, null);
  const count = x => Object.fromEntries(['fri', 'onskemal', 'byte', 'brott', 'sparrad'].map(s => [s, x.positions.filter(p => p.state === s).length]));
  console.log(JSON.stringify({ lesson: lesson.id, alla: count(alla), elev: count(elev), efter: count(efter), medSparr: count(medSparr), fri: [fri.day, fri.startMin], grupper: folj.grupper.map(g => [g.name, g.delar]), elever: folj.elever.length,
    kontroll: { clash: clash.total, sparr: direkt.sparr.kontroll.violations.map(v => v.lessons), aldrig: direkt.aldrig.kontroll.violations.map(v => v.lessons) } }));
  writeFileSync(join(fixtures, 'schema-folj.json'), JSON.stringify({ lesson: lesson.id, pupilId, fri, alla, elev, efter, folj, foljElev, utanElever, sparr: { regel: sparr, lagen: medSparr } }));
} finally { service.kill(); }
