// Kedjeprov för 05.2-SM-KOPPLING, -ELEVER-KALENDER och -FLYTT med syntetiska uppgifter: tjänstefördelning, elevernas grupper och terminens skoldagar → underlag → schemamotor-tjanst över HTTP
// → appens strikta tolkning → motorns fristående kontrollant. Ingen databas och inga verkliga uppgifter.
// Kör från web/: node ../work/schema/verify-koppling.mjs   (kräver `cargo build --release` i schemamotor/)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, schemaForslag, schemaKontroll } from '../../web/lib/schema-underlag.ts';
import { checkSchemaPlacements, parseSchemaCheck, parseSchemaForslag, parseSchemaKontroll, parseSchemaSolution } from '../../web/lib/schema-contract.ts';

const bin = new URL('../../schemamotor/target/release/', import.meta.url).pathname;
const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, h = n => n * 60;
const SUBJECTS = [['sv', 'Svenska', 54], ['ma', 'Matematik', 54], ['en', 'Engelska', 45], ['idh', 'Idrott och hälsa', 36], ['hi', 'Historia', 36], ['sh', 'Samhällskunskap', 36],
  ['nk', 'Naturkunskap', 36], ['re', 'Religionskunskap', 27], ['pr', 'Programämne', 108]];
const CLASSES = 12, TEACHERS = 24;
const classKey = (c, row) => `class_timplan:${uid(100 + c)}:2026:${row}`;
const classes = [], rows = [];
for (let c = 0; c < CLASSES; c++) {
  classes.push({ classId: uid(100 + c), name: `Klass ${c + 1}`, link: null, aplMinutes: null,
    needs: SUBJECTS.map(([row, label, hours]) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, row), rowKey: row, label, needHt: h(hours), needVt: h(hours), needBasis: 'terms' })) });
  SUBJECTS.forEach(([row, , hours], s) => rows.push({ id: uid(1000 + rows.length), lineageId: uid(5000 + rows.length), sourceKind: 'class_timplan', sourceKey: classKey(c, row), classId: uid(100 + c), rowKey: row,
    personId: s === 3 && c === 0 ? null : uid(200 + (s * 3 + c) % TEACHERS), teacherHt: h(hours), teacherVt: h(hours), needHt: h(hours), needVt: h(hours), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }));
}
// Ett valbart block för klass 1 och 2: två alternativ med elever och ett utan. 25 syntetiska elever per klass.
const BLOCK = [['Spanska', 0], ['Tyska', 1], ['Franska', 2]];
const groups = BLOCK.map(([name, i]) => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(300 + i)}`, rowKey: `group:${uid(300 + i)}`, label: name, needHt: h(36), needVt: h(36),
  needBasis: 'terms', groupId: uid(300 + i), name, language: null, groupRevision: 1, classIds: [uid(100), uid(101)], sourceRefs: [], stale: false, blockId: uid(350), optionId: uid(360 + i), subjectCode: 'X', levelCode: '1' }));
for (const [, i] of BLOCK) rows.push({ id: uid(1000 + rows.length), lineageId: uid(5000 + rows.length), sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(300 + i)}`, classId: null, rowKey: `group:${uid(300 + i)}`,
  groupId: uid(300 + i), classIds: [], sourceRefs: [], groupRevision: 1, personId: uid(200 + i), teacherHt: h(36), teacherVt: h(36), needHt: h(36), needVt: h(36), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' });
const pupils = Array.from({ length: CLASSES * 25 }, (_, i) => ({ id: uid(10000 + i), classIds: [uid(100 + Math.floor(i / 25))] }));
const memberships = pupils.slice(0, 50).flatMap((p, i) => i % 5 === 4 ? [] : [{ groupId: uid(300 + i % 2), pupilId: p.id, startsOn: '2026-08-17', endsOn: null }]);
// Terminens tid som läsårskalendern ger den: 88 skoldagar, och klass 12 med en egen dag utan undervisning.
const time = { source: 'kalender', version: 1, status: 'faststalld', current: true, term: { start: '2026-08-17', end: '2026-12-18' }, perWeekday: [17, 18, 17, 18, 18], classes: { [uid(111)]: [17, 18, 17, 17, 18] } };
const basis = { members: { pupils, memberships }, time };
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 1,
  version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: Array.from({ length: TEACHERS }, (_, i) => ({ personId: uid(200 + i), displayName: `Provlärare ${i + 1}`, draft: false, shareHere: 100 })),
  classes, rows, groups, specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
const request = { unitId: uid(1), schoolYear: 2026, term: 'ht' };

const token = randomBytes(24).toString('hex'), port = 20000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}`;
const service = spawn(join(bin, 'schemamotor-tjanst'), [], { env: { SCHEMAMOTOR_TOKEN: token, SCHEMAMOTOR_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* startar */ }
    assert.ok(i < 50, 'tjänsten startade inte');
    await new Promise(r => setTimeout(r, 100));
  }
  const underlag = buildSchemaUnderlag(plan, request, basis), body = JSON.stringify(underlag.problem);
  assert.equal((await fetch(`${url}/v1/solve`, { method: 'POST', body })).status, 401);
  const response = await fetch(`${url}/v1/solve?time_ms=10000`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  assert.equal(response.status, 200);
  const raw = await response.json(), solution = parseSchemaSolution(raw, underlag.problem);
  const forslag = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(plan, request, underlag, solution))), request);
  const dir = mkdtempSync(join(tmpdir(), 'schema-koppling-'));
  writeFileSync(join(dir, 'underlag.json'), body); writeFileSync(join(dir, 'resultat.json'), JSON.stringify(raw));
  const check = spawnSync(join(bin, 'schemamotor'), ['validate', join(dir, 'underlag.json'), join(dir, 'resultat.json')], { encoding: 'utf8' });
  const sent = JSON.stringify(underlag.problem);
  assert.ok(!sent.includes('52a10000') && !sent.includes('Spanska') && !sent.includes('Provlärare'), 'namn eller ID nådde motorn');
  assert.deepEqual(forslag.members, { pupils: 300, groupsWithoutMembers: ['Franska'], classesWithoutPupils: [], withoutChoice: [{ title: 'Spanska, Tyska, Franska', count: 10 }] });
  // Samma elever får aldrig två pass samtidigt, prövat här ur appens egna uppgifter oberoende av motorn.
  const cluster = new Map(underlag.problem.groups.map(g => [g.id, g.clusters])), placed = underlag.problem.lessons.map(l => ({ ...l, at: solution.placements.find(p => p.lesson === l.id) })).filter(l => l.at);
  let parallel = 0;
  for (const [i, a] of placed.entries()) for (const b of placed.slice(i + 1)) {
    if (a.at.day !== b.at.day || a.at.startMin >= b.at.startMin + b.duration_min || b.at.startMin >= a.at.startMin + a.duration_min) continue;
    const mine = new Set(a.groups.flatMap(g => cluster.get(g)));
    assert.ok(!b.groups.flatMap(g => cluster.get(g)).some(c => mine.has(c)), `${a.id} och ${b.id} delar elever och ligger samtidigt`);
    if (a.activity !== b.activity && [a, b].every(l => l.groups.some(g => Number(g.slice(6)) > CLASSES))) parallel += 1;
  }
  const planned = forslag.teachings.reduce((sum, t) => sum + t.plannedMin, 0), needed = forslag.teachings.reduce((sum, t) => sum + t.needMin, 0);
  console.log(JSON.stringify({ time: forslag.time, parallelBlockLessons: parallel, plannedHours: Math.round(planned / 60), neededHours: Math.round(needed / 60),
    largestDeviationMin: Math.max(...forslag.teachings.map(t => Math.abs(t.plannedMin - t.needMin))) }));
  console.log(JSON.stringify({ status: forslag.status, ...forslag.metrics, elapsedMs: forslag.elapsedMs, classes: forslag.classes.length, teachers: forslag.teachers.length,
    validatorExit: check.status, validator: (check.stdout + check.stderr).trim().split('\n').slice(-3) }, null, 1));
  assert.equal(check.status, 0, 'kontrollanten godkände inte resultatet');
  // Flytt för hand (05.2-SM-FLYTT): samma steg som appens kontrollrutt, mot tjänstens /v1/validate.
  const kontroll = async lessons => {
    const placements = checkSchemaPlacements(lessons.flatMap(l => l.day === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin }]), underlag.problem);
    const reply = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ problem: underlag.problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin })) }) });
    assert.equal(reply.status, 200);
    return parseSchemaKontroll(JSON.parse(JSON.stringify(schemaKontroll(underlag, placements, parseSchemaCheck(await reply.json(), underlag.problem)))), forslag.fingerprint);
  };
  assert.equal((await fetch(`${url}/v1/validate`, { method: 'POST', body: JSON.stringify({ problem: underlag.problem, placements: [] }) })).status, 401);
  assert.equal((await kontroll(forslag.lessons)).total, 0, 'förslaget som det räknades ska vara utan avvikelser');
  // Ett pass i klass 1 flyttas till en tid där klassen redan har ett annat pass: samma elever på två ställen.
  const own = forslag.lessons.filter(l => l.classIds.length === 1 && l.classIds[0] === forslag.classes[0].id && l.day !== null && !l.vacant);
  const a = own[0], b = own.find(l => l.id !== a.id && l.day !== a.day && l.startMin + a.durationMin <= forslag.days[l.day].endMin);
  const move = { lesson: a.id, day: b.day, startMin: b.startMin }, movedLessons = forslag.lessons.map(l => l.id === a.id ? { ...l, day: move.day, startMin: move.startMin } : l);
  const clash = await kontroll(movedLessons);
  assert.ok(clash.violations.some(v => v.code === 'student_clash' && v.lessons.includes(a.id) && v.lessons.includes(b.id) && v.message.includes('Klass 1')), 'elevkrocken redovisas inte');
  assert.ok(clash.violations.every(v => !/\b(?:pass|grupp|kluster|larare|behov)-\d/u.test(v.message)), 'löpnummer i avvikelsetext');
  assert.equal((await kontroll(forslag.lessons)).total, 0, 'ångrad flytt ska ge ett schema utan avvikelser');
  const lifted = await kontroll(forslag.lessons.map(l => l.id === a.id ? { ...l, day: null, startMin: null } : l));
  assert.deepEqual([lifted.total, lifted.metrics.unplaced, lifted.teachings.reduce((n, t) => n + t.unplaced, 0)], [0, 1, 1]);
  assert.throws(() => checkSchemaPlacements([{ lesson: a.id, day: 0, startMin: forslag.days[0].endMin }], underlag.problem), 'tid utanför skoldagen ska nekas före motorn');
  // Ändrat underlag (en lärare byts) ger ett annat fingeravtryck: kontrollrutten nekar då flytten.
  const other = { ...plan, rows: plan.rows.map((r, i) => i === 0 ? { ...r, personId: uid(200 + TEACHERS - 1) } : r) };
  assert.notEqual(buildSchemaUnderlag(other, request, basis).fingerprint, underlag.fingerprint);
  assert.equal(buildSchemaUnderlag(plan, request, basis).fingerprint, underlag.fingerprint);
  console.log(JSON.stringify({ flytt: { violations: clash.total, codes: [...new Set(clash.violations.map(v => v.code))], first: clash.violations[0].message } }));
  // Valfritt: spara det namnsatta förslaget och en kontrollerad flytt som syntetiskt underlag för vyns prov.
  if (process.env.SCHEMA_FORSLAG_OUT) {
    writeFileSync(process.env.SCHEMA_FORSLAG_OUT, JSON.stringify(forslag));
    writeFileSync(join(dirname(process.env.SCHEMA_FORSLAG_OUT), 'schema-kontroll.json'), JSON.stringify({ move, clash, lifted }));
  }
  assert.equal(forslag.status, 'complete');
} finally { service.kill(); }
