// Kedjeprov för 05.2-SM-KOPPLING, -ELEVER-KALENDER, -FLYTT, -LASAR-VILLKOR, -LAGEN, -MARGINAL, -VILLKOR-DIREKT och -VILLKORSTABELL med syntetiska uppgifter: tjänstefördelning, elevernas grupper och läsårets skoldagar → underlag → schemamotor-tjanst över HTTP
// → appens strikta tolkning → motorns fristående kontrollant. Ingen databas och inga verkliga uppgifter.
// Kör från web/: node ../work/schema/verify-koppling.mjs   (kräver `cargo build --release` i schemamotor/)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, schemaForslag, schemaKontroll, schemaProvUnderlag } from '../../web/lib/schema-underlag.ts';
import { schemaTime } from '../../web/lib/schema-kalender.ts';
import { schemaDiagnos } from '../../web/lib/schema-diagnos.ts';
import { SCHEMA_CONTRACT_VERSION, SCHEMA_MOTOR_VERSION, checkSchemaPlacements, defaultSchemaVillkor, parseSchemaCheck, parseSchemaForslag, parseSchemaKontroll, parseSchemaKontrollRequest, parseSchemaSolution, parseSchemaEngineDiagnoses, sammaGrund } from '../../web/lib/schema-contract.ts';
import { parseSchemaMotorPlacering, parseSchemaPlacering, sammaSchemaPlaceringar } from '../../web/lib/schema-placering.ts';
import { schemaAktivitetsAndring, schemaAktivitetsPlaceringar, schemaAktivitetsSvar } from '../../web/lib/schema-aktiviteter-underlag.ts';
import { parseSchemaLagen, parseSchemaPositions, schemaElevKluster, schemaLagen, schemaPassKluster, varfor } from '../../web/lib/schema-lagen.ts';

const bin = new URL('../../schemamotor/target/release/', import.meta.url).pathname;
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
  // SM-DIAGNOS: verklig förkontroll över HTTP utan sökning, med samma anonyma underlag.
  assert.equal((await fetch(`${url}/v1/diagnose`, { method: 'POST', body })).status, 401);
  const preflight = await fetch(`${url}/v1/diagnose`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  assert.equal(preflight.status, 200);
  const preflightRaw = await preflight.json(), findings = schemaDiagnos(underlag, parseSchemaEngineDiagnoses(preflightRaw.diagnoses, underlag.problem));
  assert.equal(preflightRaw.version, underlag.problem.version);
  assert.ok(findings.some(f => f.code === 'group_without_teacher'), 'vakant undervisning saknas i fördiagnosen');
  assert.ok(findings.every(f => f.action.label && f.message), 'fördiagnosen saknar text och åtgärd');
  const response = await fetch(`${url}/v1/solve?time_ms=10000`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  assert.equal(response.status, 200);
  const raw = await response.json(), solution = parseSchemaSolution(raw, underlag.problem);
  const forslag = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(plan, request, underlag, solution))), request);
  assert.ok(solution.statistics.lessons.length > 0 && solution.statistics.lessons.length <= 20);
  assert.ok(solution.statistics.bottlenecks.length > 0 && solution.statistics.bottlenecks.length <= 20);
  assert.ok(forslag.statistics.lessons.every(s => forslag.lessons.some(l => l.id === s.lesson && l.title === s.title)));
  assert.ok(forslag.statistics.bottlenecks.some(b => b.resource && !b.resource.label.startsWith('larare-')), 'statistikens resursnamn har inte avkodats');
  console.log(JSON.stringify({ diagnos: { fynd: findings.length, koder: [...new Set(findings.map(f => f.code))], svarastePass: solution.statistics.lessons.length, flaskhalsar: solution.statistics.bottlenecks.length } }));
  const dir = mkdtempSync(join(tmpdir(), 'schema-koppling-'));
  writeFileSync(join(dir, 'underlag.json'), body); writeFileSync(join(dir, 'resultat.json'), JSON.stringify(raw));
  const check = spawnSync(join(bin, 'schemamotor'), ['validate', join(dir, 'underlag.json'), join(dir, 'resultat.json')], { encoding: 'utf8' });
  const sent = JSON.stringify(underlag.problem);
  assert.ok(!sent.includes('52a10000') && !sent.includes('Spanska') && !sent.includes('Provlärare'), 'namn eller ID nådde motorn');
  assert.deepEqual(forslag.members, { pupils: 300, groupsWithoutMembers: ['Franska'], classesWithoutPupils: [], withoutChoice: [{ title: 'Spanska, Tyska, Franska', count: 10 }] });
  // Samma elever får aldrig två pass samtidigt, prövat här ur appens egna uppgifter oberoende av motorn.
  const cluster = new Map(underlag.problem.groups.map(g => [g.id, g.clusters])), placed = underlag.problem.lessons.map(l => ({ ...l, at: solution.placements.find(p => p.lesson === l.id) })).filter(l => l.at);
  let parallel = 0, sharedByTerm = 0;
  for (const [i, a] of placed.entries()) for (const b of placed.slice(i + 1)) {
    if (a.at.day !== b.at.day || a.at.startMin >= b.at.startMin + b.duration_min || b.at.startMin >= a.at.startMin + a.duration_min) continue;
    // Pass i olika terminer möts aldrig: de får ligga på samma tid i veckan.
    if (a.periods && b.periods && a.periods[0] !== b.periods[0]) { if (a.groups.some(g => b.groups.includes(g))) sharedByTerm += 1; continue; }
    const mine = new Set(a.groups.flatMap(g => cluster.get(g)));
    assert.ok(!b.groups.flatMap(g => cluster.get(g)).some(c => mine.has(c)), `${a.id} och ${b.id} delar elever och ligger samtidigt`);
    if (a.activity !== b.activity && [a, b].every(l => l.groups.some(g => Number(g.slice(6)) > CLASSES))) parallel += 1;
  }
  const byTerm = t => forslag.lessons.filter(l => l.term === t).length;
  // Timplanen är ram (T2): terminerna är olika långa, så samma timmar per termin ger olika veckotid och egna pass per termin.
  console.log(JSON.stringify({ lessonsPerTerm: [byTerm('ht'), byTerm('vt')], wholeYear: forslag.lessons.filter(l => l.term === null).length, deviations: forslag.teachings.filter(t => t.deviation).map(t => t.deviation).reduce((n, x) => ({ ...n, [x]: (n[x] ?? 0) + 1 }), {}) }));
  assert.ok(byTerm('ht') >= 2 * CLASSES && byTerm('vt') >= 2 * CLASSES, 'terminsbunden undervisning ska ligga i sin termin');
  assert.ok(sharedByTerm > 0, 'ingen HT- och VT-undervisning delar tid i veckan');
  const planned = forslag.teachings.reduce((sum, t) => sum + t.plannedMin, 0), needed = forslag.teachings.reduce((sum, t) => sum + t.needMin, 0);
  console.log(JSON.stringify({ period: forslag.period, time: forslag.time, parallelBlockLessons: parallel, termBoundLessons: byTerm('ht') + byTerm('vt'), sharedByTerm, plannedHours: Math.round(planned / 60), neededHours: Math.round(needed / 60),
    largestDeviationMin: Math.max(...forslag.teachings.map(t => Math.abs(t.plannedMin - t.needMin))) }));
  console.log(JSON.stringify({ status: forslag.status, ...forslag.metrics, elapsedMs: forslag.elapsedMs, classes: forslag.classes.length, teachers: forslag.teachers.length,
    validatorExit: check.status, validator: (check.stdout + check.stderr).trim().split('\n').slice(-3) }, null, 1));
  assert.equal(check.status, 0, 'kontrollanten godkände inte resultatet');
  // Timplanen läggs alltid ut (05.2-SM-TIMPLAN-VECKA): räknat på kalenderns faktiska tillfällen blir varje termin exakt timplanens tid avrundad uppåt
  // till hela 5 minuter, efter att enskilda tillfällen kortats.
  const inRange = f => f.teachings.flatMap(t => t.terms.filter(x => x.needMin > 0 && (x.plannedMin < x.needMin || x.plannedMin > x.maxMin)).map(x => `${t.title} ${t.classes.join()} ${x.term}: ${x.plannedMin} av ${x.needMin}–${x.maxMin}`));
  assert.deepEqual(inRange(forslag), []);
  assert.ok(forslag.teachings.every(t => t.deviation === null), 'en undervisning avviker från timplanen');
  const base = underlag, baseForslag = forslag;
  // Flytt för hand (05.2-SM-FLYTT): samma steg som appens kontrollrutt, mot tjänstens /v1/validate.
  const kontroll = async (lessons, underlag = base, forslag = baseForslag) => {
    const placements = checkSchemaPlacements(lessons.flatMap(l => l.day === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId ?? null }]), underlag.problem);
    const reply = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ problem: underlag.problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) }) });
    assert.equal(reply.status, 200);
    return parseSchemaKontroll(JSON.parse(JSON.stringify(schemaKontroll(underlag, placements, parseSchemaCheck(await reply.json(), underlag.problem)))), forslag.grundFingerprint);
  };
  assert.equal((await fetch(`${url}/v1/validate`, { method: 'POST', body: JSON.stringify({ problem: underlag.problem, placements: [] }) })).status, 401);
  assert.equal((await kontroll(forslag.lessons)).total, 0, 'förslaget som det räknades ska vara utan avvikelser');
  // Ett pass i klass 1 flyttas till en tid där klassen redan har ett annat pass: samma elever på två ställen.
  const own = forslag.lessons.filter(l => l.classIds.length === 1 && l.classIds[0] === forslag.classes[0].id && l.day !== null && !l.vacant && l.term === 'ht');
  const a = own[0], b = own.find(l => l.id !== a.id && l.day !== a.day && l.startMin + a.durationMin <= forslag.days[l.day].endMin);
  const move = { lesson: a.id, day: b.day, startMin: b.startMin }, movedLessons = forslag.lessons.map(l => l.id === a.id ? { ...l, day: move.day, startMin: move.startMin } : l);
  const clash = await kontroll(movedLessons);
  assert.ok(clash.violations.some(v => v.code === 'student_clash' && v.lessons.includes(a.id) && v.lessons.includes(b.id) && v.message.includes('Klass 1')), 'elevkrocken redovisas inte');
  assert.ok(clash.violations.every(v => !/\b(?:pass|grupp|kluster|larare|behov)-\d/u.test(v.message)), 'löpnummer i avvikelsetext');
  assert.equal((await kontroll(forslag.lessons)).total, 0, 'ångrad flytt ska ge ett schema utan avvikelser');
  const lifted = await kontroll(forslag.lessons.map(l => l.id === a.id ? { ...l, day: null, startMin: null } : l));
  assert.deepEqual([lifted.total, lifted.metrics.unplaced, lifted.teachings.reduce((n, t) => n + t.unplaced, 0)], [0, 1, 1]);
  // Tid utanför skoldagen redovisas av kontrollanten, eftersom skoldagen är ett tidsvillkor (05.2-SM-VILLKOR-DIREKT); tid utanför dygnet nekas före motorn.
  const sent_ = await kontroll(forslag.lessons.map(l => l.id === a.id ? { ...l, day: 0, startMin: forslag.days[0].endMin } : l));
  assert.ok(sent_.violations.some(v => v.code === 'outside_day' && v.lessons.includes(a.id)), 'pass utanför skoldagen redovisas inte');
  assert.throws(() => checkSchemaPlacements([{ lesson: a.id, day: 0, startMin: 1440, room: null }], underlag.problem), 'tid utanför dygnet ska nekas före motorn');
  // Ändrat underlag (en lärare byts) ger ett annat fingeravtryck: kontrollrutten nekar då flytten.
  const other = { ...plan, rows: plan.rows.map((r, i) => i === 0 ? { ...r, personId: uid(200 + TEACHERS - 1) } : r) };
  assert.notEqual(buildSchemaUnderlag(other, request, basis).fingerprint, underlag.fingerprint);
  assert.notEqual(buildSchemaUnderlag(other, request, basis).grundFingerprint, underlag.grundFingerprint);
  assert.equal(schemaProvUnderlag(other, { ...request, grundFingerprint: forslag.grundFingerprint }, basis), null, 'ändrad tjänstefördelning ska ge 409');
  assert.equal(buildSchemaUnderlag(plan, request, basis).fingerprint, underlag.fingerprint);
  console.log(JSON.stringify({ flytt: { violations: clash.total, codes: [...new Set(clash.violations.map(v => v.code))], first: clash.violations[0].message } }));
  // Valfritt: spara det namnsatta förslaget och en kontrollerad flytt som syntetiskt underlag för vyns prov.
  if (process.env.SCHEMA_FORSLAG_OUT) {
    writeFileSync(process.env.SCHEMA_FORSLAG_OUT, JSON.stringify(forslag));
    writeFileSync(join(dirname(process.env.SCHEMA_FORSLAG_OUT), 'schema-kontroll.json'), JSON.stringify({ move, clash, lifted }));
  }
  assert.equal(forslag.status, 'complete');
  // Egna villkor (05.2-SM-VILLKOR-PER-RESURS): spärrad och tillåten tid, marginal, uppdelning och sal, mot riktiga motorn och kontrollanten.
  const solve = async u => {
    const r = await fetch(`${url}/v1/solve?time_ms=10000`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(u.problem) });
    const text = await r.text();
    assert.equal(r.status, 200, text.slice(0, 300));
    return parseSchemaSolution(JSON.parse(text), u.problem);
  };
  // Egna aktiviteter: ett riktigt motorplacerat arbetslagsmöte och en riktig kontroll av mentorstid.
  const smallPlan = { ...plan, classes: [{ ...plan.classes[0], needs: [plan.classes[0].needs[0]] }],
    rows: plan.rows.filter(r => r.sourceKey === plan.classes[0].needs[0].sourceKey), groups: [] };
  const smallRequest = { ...request, period: 'ht', villkor: { ...defaultSchemaVillkor(), breakMin: 0, lunch: null } };
  const smallUnderlag = buildSchemaUnderlag(smallPlan, smallRequest, basis), smallSolution = await solve(smallUnderlag);
  const smallForslag = schemaForslag(smallPlan, smallRequest, smallUnderlag, smallSolution);
  // SM-BYT: lås bevaras vid en ny riktig beräkning; två oförenliga lås ger diagnos och flyttas aldrig tyst.
  const lockRequest = { ...smallRequest, locks: { grundFingerprint: smallUnderlag.grundFingerprint, placements: smallSolution.placements } };
  const lockedUnderlag = buildSchemaUnderlag(smallPlan, lockRequest, basis), lockedSolution = await solve(lockedUnderlag);
  assert.equal(lockedSolution.status, 'complete');
  assert.deepEqual(lockedSolution.placements, smallSolution.placements, 'en låst klass flyttades vid ny beräkning');
  const lockedForslag = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(smallPlan, lockRequest, lockedUnderlag, lockedSolution))), lockRequest);
  assert.deepEqual(lockedForslag.locks, lockRequest.locks.placements);
  assert.equal((await kontroll(lockedForslag.lessons, lockedUnderlag, lockedForslag)).total, 0);
  const [firstLock, secondLock] = smallSolution.placements;
  const impossibleLocks = { ...lockRequest, locks: { ...lockRequest.locks, placements: [firstLock, { ...secondLock, day: firstLock.day, startMin: firstLock.startMin }] } };
  const impossibleUnderlag = buildSchemaUnderlag(smallPlan, impossibleLocks, basis), impossibleSolution = await solve(impossibleUnderlag);
  assert.equal(impossibleSolution.status, 'infeasible');
  const lockPreflight = await fetch(`${url}/v1/diagnose`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(impossibleUnderlag.problem) });
  const lockFindings = parseSchemaEngineDiagnoses((await lockPreflight.json()).diagnoses, impossibleUnderlag.problem);
  assert.ok(lockFindings.some(d => d.code === 'locked_conflict' && d.proof), 'fördiagnosen saknar bevis för motstridiga lås');
  assert.ok(impossibleSolution.diagnoses.some(d => d.code === 'locked_conflict'), 'motorn saknar diagnos för lås som krockar');
  assert.ok(impossibleSolution.placements.every(p => { const lock = impossibleLocks.locks.placements.find(l => l.lesson === p.lesson); return !lock || lock.day === p.day && lock.startMin === p.startMin; }), 'motorn flyttade ett oförenligt lås');
  console.log(JSON.stringify({ las: { bevarade: lockedSolution.placements.length, fullstandig: lockedSolution.status, oforenligt: impossibleSolution.status, diagnos: 'locked_conflict' } }));
  // SM-PLACERING: riktig lokal /suggest och fristående kontroll av HELA varje kandidat. Ingen skyddad apprutt eller databas ingår.
  const engineAt = at => at.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] }));
  const suggest = async (problem, placements, val) => {
    const response = await fetch(`${url}/v1/suggest`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ problem, placements: engineAt(placements),
      mode: val.mode, lesson: val.lesson, depth: val.depth, target: val.target ? { day: val.target.day, start_min: val.target.startMin, rooms: val.target.room ? [val.target.room] : [] } : null }) });
    const raw = await response.json(); assert.equal(response.status, 200, JSON.stringify(raw));
    const result = parseSchemaMotorPlacering(raw, problem, { ...val, placements });
    for (const alternative of result.suggestions) {
      const check = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ problem, placements: engineAt(alternative.placements) }) });
      assert.equal(check.status, 200); assert.deepEqual(parseSchemaCheck(await check.json(), problem).violations, [], 'placeringsförslaget har regelbrott');
    }
    return result;
  };
  const parkedId = solution.placements[0].lesson, parked = solution.placements.filter(p => p.lesson !== parkedId), val = { mode: 'lesson', lesson: parkedId, target: null, depth: 1 };
  const one = await suggest(underlag.problem, parked, val);
  assert.ok(one.suggestions.length > 0, 'den ursprungliga giltiga tiden hittas inte för ett parkerat pass');
  assert.equal(one.suggestions[0].placements.length, solution.placements.length);
  assert.equal(one.suggestions[0].changes.filter(c => c.from !== null).length, 0, 'direktfallet flyttade andra pass');
  const clientInput = { ...request, ...val, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint, placements: parked };
  assert.equal(parseSchemaPlacering({ contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: underlag.grundFingerprint, ...one }, clientInput, underlag.problem.lessons.map(l => l.id)).suggestions.length, one.suggestions.length);

  const chainProblem = { version: SCHEMA_MOTOR_VERSION, id: 'placeringskedja-prov', time: { step_min: 5, start_grid_min: 60, days: [{ start_min: 480, end_min: 660 }] },
    teachers: [{ id: 'larare-1' }], groups: [{ id: 'grupp-1', clusters: ['kluster-1'] }], clusters: [{ id: 'kluster-1', size: 25 }], rooms: [], activities: [],
    lessons: [1, 2, 3].map(n => ({ id: `pass-${n}`, duration_min: 60, teachers: ['larare-1'], groups: ['grupp-1'],
      allowed: [{ day: 0, start_min: n === 3 ? 540 : 480, end_min: n === 1 ? 540 : n === 2 ? 600 : 660 }] })),
    rules: { break_min: 0, lunch: null, same_day: 'allow' }, weights: { late_after_min: null } };
  const at = (n, startMin) => ({ lesson: `pass-${n}`, day: 0, startMin, room: null }), chainAt = [at(2, 480), at(3, 540)];
  const aimed = { mode: 'target', lesson: 'pass-1', target: { day: 0, startMin: 480, room: null }, depth: 1 };
  const shallow = await suggest(chainProblem, chainAt, aimed), deep = await suggest(chainProblem, chainAt, { ...aimed, depth: 2 });
  assert.equal(shallow.suggestions.length, 0, 'kedjan ska kräva två följdflyttar');
  assert.ok(deep.suggestions.length > 0); assert.equal(deep.suggestions[0].changes.length, 3);
  assert.ok(sammaSchemaPlaceringar(deep.suggestions[0].placements, [at(1, 480), at(2, 540), at(3, 600)]));
  // Konstruerat jämförelsefall: samma tre utbytbara pass. Referensen väljs som en giltig rotation av just nollberäkningens resultat,
  // så provet inte antar en viss tidsbegränsad lösningsordning. Ett pass parkeras därefter. Rest-förslaget behöver då inga följdflyttar.
  const restProblem = { ...chainProblem, id: 'viloyta-prov', lessons: chainProblem.lessons.map(({ allowed: _, ...l }) => l) };
  const zeroResponse = await fetch(`${url}/v1/solve?time_ms=100`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(restProblem) });
  assert.equal(zeroResponse.status, 200); const zero = parseSchemaSolution(await zeroResponse.json(), restProblem); assert.equal(zero.placements.length, 3);
  const ordered = [...zero.placements].sort((a, b) => a.lesson.localeCompare(b.lesson)), rotated = ordered.map((p, i) => ({ ...ordered[(i + 1) % ordered.length], lesson: p.lesson }));
  const restAt = rotated.filter(p => p.lesson !== 'pass-1'), placedRest = await suggest(restProblem, restAt, { mode: 'rest', lesson: null, target: null, depth: 1 });
  assert.ok(placedRest.suggestions.length > 0); assert.equal(placedRest.suggestions[0].placements.length, restProblem.lessons.length);
  const movedRest = placedRest.suggestions[0].changes.filter(c => c.from !== null).length;
  const movedZero = restAt.filter(p => { const q = zero.placements.find(q => q.lesson === p.lesson); return p.day !== q.day || p.startMin !== q.startMin || p.room !== q.room; }).length;
  assert.equal(movedRest, 0); assert.ok(movedRest < movedZero);
  console.log(JSON.stringify({ placering: { stortDirektfall: one.suggestions.length, bevarade: parked.length, kedjaDjup1: shallow.suggestions.length, kedjaDjup2: deep.suggestions[0].changes.length,
    viloytaAllaLagda: true, foljdflyttarRest: movedRest, flyttarFranNoll: movedZero, valdReferens: 'konstruerad giltig rotation', regelbrott: 0 } }));
  const meeting = { id: 'aktivitet-1', typId: 'typ-mote', typ: 'Arbetslagsmöte', name: 'Arbetslagsmöte prov', classRefs: [], groupRefs: [],
    teacherRefs: [plan.teachers[0].personId, plan.teachers[1].personId], rooms: [], durationMin: 60, veckor: { typ: 'alla' }, visibleFor: 'personal', margin: null,
    tid: { typ: 'motor', days: [1, 2, 3], startMin: 840, endMin: 990 } };
  const activityInput = { ...smallRequest, contractVersion: SCHEMA_CONTRACT_VERSION, previousVillkor: smallRequest.villkor,
    villkor: { ...smallRequest.villkor, aktiviteter: [meeting] }, grundFingerprint: smallUnderlag.grundFingerprint, placements: smallSolution.placements };
  const activityChange = schemaAktivitetsAndring(smallPlan, activityInput, basis);
  assert.ok(activityChange);
  const activitySolution = await solve({ ...activityChange.efter, problem: activityChange.solver });
  const activityPlacements = schemaAktivitetsPlaceringar(activityChange, activitySolution), meetingAt = activityPlacements.find(p => p.lesson === 'pass-900001');
  assert.ok(meetingAt && [1, 2, 3].includes(meetingAt.day) && meetingAt.startMin >= 840 && meetingAt.startMin + 60 <= 990, 'arbetslagsmötet placerades inte inom sitt fönster');
  const activityCheckResponse = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ problem: activityChange.efter.problem, placements: activityPlacements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) }) });
  const activityCheck = parseSchemaCheck(await activityCheckResponse.json(), activityChange.efter.problem);
  assert.deepEqual(activityCheck.violations, []);
  const activityReply = schemaAktivitetsSvar(smallPlan, activityInput, activityChange, activityPlacements, activityCheck, activitySolution);
  assert.deepEqual(activityReply.forslag.teachings, smallForslag.teachings, 'aktiviteten ändrade undervisningens timplanetid');
  assert.deepEqual(activityPlacements.filter(p => p.lesson !== 'pass-900001'), smallSolution.placements, 'undervisningens placeringar ändrades');
  const lessonAt = smallSolution.placements[0], mentor = { ...meeting, name: 'Mentorstid prov', typ: 'Mentorstid', classRefs: [smallPlan.classes[0].classId],
    durationMin: 20, tid: { typ: 'fast', day: lessonAt.day, startMin: lessonAt.startMin } };
  const mentorInput = { ...activityInput, villkor: { ...smallRequest.villkor, aktiviteter: [mentor] } }, mentorChange = schemaAktivitetsAndring(smallPlan, mentorInput, basis);
  const mentorPlacements = schemaAktivitetsPlaceringar(mentorChange, null);
  const mentorResponse = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify({ problem: mentorChange.efter.problem, placements: mentorPlacements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) }) });
  const mentorCheck = parseSchemaCheck(await mentorResponse.json(), mentorChange.efter.problem);
  assert.ok(mentorCheck.violations.some(v => v.code === 'student_clash' && v.lessons.includes('pass-900001')), 'mentorstiden upptar inte sina elever i riktiga kontrollanten');
  console.log(JSON.stringify({ aktiviteter: { meetingWithinWindow: true, noViolations: activityCheck.violations.length === 0, unchangedTeaching: true, preservedPlacements: true, mentorClashDetected: true } }));
  const marginal = (slag, ref, beforeMin, afterMin, occupies, label) => ({ slag, ref, typ: 'marginal', beforeMin, afterMin, occupies, label, visibleFor: ['elever'], when: 'alltid' });
  const egna = [
    { slag: 'amne', ref: 'Idrott och hälsa', typ: 'sal', rooms: ['Idrottshallen'] },
    { slag: 'klass', ref: uid(100), typ: 'sparrad', days: [0], startMin: 480, endMin: 720 },
    { slag: 'larare', ref: uid(205), typ: 'tillaten', days: [0, 1, 2, 3], startMin: 480, endMin: 960 },
    marginal('amne', 'Matematik', 0, 20, ['elever', 'larare', 'sal'], 'Övergång'),
    { slag: 'amne', ref: 'Engelska', typ: 'antal', count: 3 },
    { slag: 'amne', ref: 'Programämne', typ: 'langd', maxMin: 90 },
    { slag: 'sal', ref: 'Idrottshallen', typ: 'sparrad', days: [4], startMin: 0, endMin: 1440 },
    marginal('grupp', uid(399), 0, 10, ['elever', 'larare', 'sal'], 'Övergång'),
    // Marginal (05.2-SM-MARGINAL): omklädning och dusch upptar bara eleverna, så hallen och läraren är lediga under dem.
    marginal('amne', 'Idrott och hälsa', 10, 15, ['elever'], 'Omklädning före, dusch efter')];
  const egnaRequest = { ...request, villkor: { ...defaultSchemaVillkor(), salar: ['Idrottshallen', 'Sal A'], egna } };
  const u2 = buildSchemaUnderlag(plan, egnaRequest, basis), sent2 = JSON.stringify(u2.problem);
  assert.ok(!sent2.includes('52a10000') && !sent2.includes('Idrott') && !sent2.includes('Sal A'), 'namn eller ID nådde motorn');
  const s2 = await solve(u2), f2 = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(plan, egnaRequest, u2, s2))), egnaRequest);
  // Klass 1 är spärrad måndag förmiddag, och måndag och onsdag har 17 skoldagar på hösten. Med bara en undre gräns i motorn och justering
  // per tillfälle får även klass 1 exakt timplanens tid (05.2-SM-TIMPLAN-VECKA, W2–W3).
  assert.equal(f2.status, 'complete', JSON.stringify(f2.diagnoses.map(d => d.message)));
  assert.deepEqual(inRange(f2), []);
  const trims = f => f.teachings.reduce((n, t) => n + t.terms.reduce((m, x) => m + x.trimmedCount, 0), 0);
  console.log(JSON.stringify({ justering: { grund: trims(forslag), egna: trims(f2), undervisningar: forslag.teachings.length,
    storstaMin: Math.max(...forslag.teachings.flatMap(t => t.terms.map(x => x.trimmedMin))) } }));
  assert.deepEqual(f2.egnaUtanTraff, [7], 'villkoret för en grupp som inte finns ska redovisas som utan träff');
  assert.equal((await kontroll(f2.lessons, u2, f2)).total, 0, 'förslaget med egna villkor ska vara utan avvikelser');
  const end = l => l.startMin + l.durationMin, meet = (a, b) => a.day === b.day && (a.term === null || b.term === null || a.term === b.term);
  const klass1 = f2.lessons.filter(l => l.classIds.includes(f2.classes[0].id)), idrott = f2.lessons.filter(l => l.title === 'Idrott och hälsa');
  assert.ok(klass1.every(l => l.day !== 0 || l.startMin >= 720), 'klass 1 har pass på spärrad tid');
  assert.ok(f2.lessons.filter(l => l.teacherIds.includes('larare-6')).every(l => l.day <= 3 && end(l) <= 960), 'läraren har pass utanför tillåten tid');
  assert.ok(idrott.length && idrott.every(l => l.roomId === 'sal-1' && l.day !== 4), 'idrotten ligger inte i idrottshallen eller på spärrad dag');
  let hallUnderDusch = 0;
  for (const [i, a] of idrott.entries()) for (const b of idrott.slice(i + 1)) {
    assert.ok(!meet(a, b) || end(a) <= b.startMin || end(b) <= a.startMin, 'två pass i samma sal samtidigt');
    if (meet(a, b) && (b.startMin >= end(a) && b.startMin < end(a) + 15 || a.startMin >= end(b) && a.startMin < end(b) + 15)) hallUnderDusch += 1;
  }
  // Marginalen följer passet: 20 min efter matematiken för klassen, och omklädning 10 min före och dusch 15 min efter idrotten. Passens längd är undervisningen.
  const matte = f2.lessons.filter(l => l.title === 'Matematik');
  assert.ok(matte.every(l => l.marginMin === 20 && l.marginBeforeMin === 0) && idrott.every(l => l.marginMin === 15 && l.marginBeforeMin === 10)
    && f2.lessons.every(l => ['Matematik', 'Idrott och hälsa'].includes(l.title) || l.marginMin + l.marginBeforeMin === 0));
  assert.deepEqual(f2.lessons.map(l => l.durationMin), u2.labels.lessons.map(l => l.durationMin));
  for (const m of matte) for (const l of f2.lessons) if (l !== m && meet(m, l) && l.startMin >= m.startMin && l.classIds.some(c => m.classIds.includes(c))) assert.ok(l.startMin >= end(m) + 20, 'marginalen efter matematik hålls inte');
  for (const m of idrott) for (const l of f2.lessons) if (l !== m && meet(m, l) && l.classIds.some(c => m.classIds.includes(c)))
    assert.ok(l.startMin >= end(m) + 15 || end(l) <= m.startMin - 10, `omklädning eller dusch överlappar ett annat pass för klassen: ${m.id} ${l.id}`);
  assert.ok(idrott.every(l => l.startMin - 10 >= f2.days[l.day].startMin && end(l) + 15 <= f2.days[l.day].endMin), 'idrotten med marginal ryms inte i skoldagen');
  assert.ok(f2.lessons.filter(l => l.title === 'Engelska' && l.classIds[0] === f2.classes[0].id && l.term === 'ht').length === 3, 'engelskan ska ha tre pass i veckan');
  assert.ok(f2.lessons.filter(l => l.title === 'Programämne').every(l => l.durationMin <= 90), 'programämnet har pass längre än 90 minuter');
  // Uppdelning och marginal ändrar inte hur mycket tid som läggs (T1).
  assert.ok(f2.teachings.every(t => t.deviation === null), 'egna villkor ändrade tiden');
  assert.deepEqual(f2.teachings.map(t => t.weeklyMin), forslag.teachings.map(t => t.weeklyMin));
  // Flytt för hand mot egna villkor: idrott till fredag (salen spärrad) och klass 1 till måndag morgon (klassen spärrad).
  const gympa = idrott[0], fredag = await kontroll(f2.lessons.map(l => l.id === gympa.id ? { ...l, day: 4, startMin: 480 } : l), u2, f2);
  const tidig = klass1.find(l => l.title === 'Svenska'), morgon = await kontroll(f2.lessons.map(l => l.id === tidig.id ? { ...l, day: 0, startMin: 480 } : l), u2, f2);
  assert.ok(fredag.violations.some(v => v.code === 'room_unavailable' && v.message.includes('Idrottshallen')), 'spärrad sal redovisas inte');
  assert.ok(morgon.violations.some(v => v.code === 'outside_allowed' && v.lessons.includes(tidig.id)), 'spärrad tid redovisas inte');
  assert.ok([...fredag.violations, ...morgon.violations].every(v => !/\b(?:pass|grupp|kluster|larare|behov|sal)-\d/u.test(v.message)), 'löpnummer i avvikelsetext');
  console.log(JSON.stringify({ egna: { status: f2.status, ...f2.metrics, utanTraff: f2.egnaUtanTraff, idrottMedMarginal: idrott.length, hallenUnderDusch: hallUnderDusch, sal: fredag.violations.find(v => v.code === 'room_unavailable').message, tid: morgon.violations.find(v => v.code === 'outside_allowed').message } }));
  // Otillfredsställbart fönster: historia får bara ligga måndag 08.00–08.20.
  const trang = { ...request, villkor: { ...defaultSchemaVillkor(), egna: [{ slag: 'amne', ref: 'Historia', typ: 'tillaten', days: [0], startMin: 480, endMin: 500 }] } };
  const u3 = buildSchemaUnderlag(plan, trang, basis), s3 = await solve(u3), f3 = schemaForslag(plan, trang, u3, s3);
  assert.equal(f3.status, 'infeasible');
  assert.ok(f3.metrics.unplaced === f3.lessons.filter(l => l.title === 'Historia').length && f3.lessons.every(l => (l.day === null) === (l.title === 'Historia')), 'bara historian ska sakna tid');
  assert.ok(f3.teachings.filter(t => t.title === 'Historia').every(t => t.deviation === 'unplaced'));
  console.log(JSON.stringify({ trang: { status: f3.status, ...f3.metrics, diagnoses: f3.diagnoses.slice(0, 1) } }));
  // Möjliga starttider (05.2-SM-LAGEN): samma steg som appens lägesrutt, mot tjänstens /v1/positions, för ett pass i klass 1.
  const lagen = async (lesson, pupil = null, lessons = forslag.lessons, underlag = base) => {
    const placements = checkSchemaPlacements(lessons.flatMap(l => l.day === null ? [] : [{ lesson: l.id, day: l.day, startMin: l.startMin, room: l.roomId ?? null }]), underlag.problem);
    const started = performance.now();
    const reply = await fetch(`${url}/v1/positions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ problem: underlag.problem, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })), lesson, ...(pupil ? { pupil } : {}) }) });
    const text = await reply.text(), ms = Math.round(performance.now() - started);
    assert.equal(reply.status, 200, text.slice(0, 200));
    return { ms, placements, svar: parseSchemaLagen(JSON.parse(JSON.stringify(schemaLagen(underlag, parseSchemaPositions(JSON.parse(text), underlag.problem, lesson), pupil !== null))), underlag.grundFingerprint, lesson) };
  };
  assert.equal((await fetch(`${url}/v1/positions`, { method: 'POST', body: JSON.stringify({ problem: underlag.problem, placements: [], lesson: a.id }) })).status, 401, 'lägen utan token ska nekas');
  const { ms, svar, placements: lagda } = await lagen(a.id);
  const count = state => svar.positions.filter(x => x.state === state).length, kontext = { ...forslag, placements: lagda };
  const nu = svar.positions.find(x => x.day === a.day && x.startMin === a.startMin), krock = svar.positions.find(x => x.day === b.day && x.startMin === b.startMin);
  assert.equal(nu.state, 'fri', 'passets nuvarande plats ska vara fri');
  assert.ok(['brott', 'byte'].includes(krock.state) && krock.reasons.some(r => r.code === 'student_clash' && r.lessons.includes(b.id)), 'klassens andra pass redovisas inte som hinder');
  const rader = varfor(a.id, krock, kontext);
  assert.ok(rader[1].startsWith(`Klass 1 har ${b.title} `), rader.join(' | '));
  assert.ok(svar.positions.every(x => x.reasons.every(r => r.name === null || !/\b(?:grupp|kluster|larare|behov)-\d/u.test(r.name))), 'löpnummer i lägenas namn');
  // Elevnivå: elevens kluster, aldrig elev-ID. En elev som läsningen inte gav (ingen behörighet) har inget kluster och nekas; motorn nekar ett kluster utan passet.
  const elev = schemaElevKluster(plan, request, basis, underlag, pupils[0].id), utan = { ...basis, members: { ...basis.members, pupils: pupils.slice(1) } };
  assert.ok(elev && schemaPassKluster(underlag.problem, a.id).includes(elev), 'elevens kluster saknas');
  assert.equal(schemaElevKluster(plan, request, utan, buildSchemaUnderlag(plan, request, utan), pupils[0].id), null, 'elev utan behörighet ska nekas');
  const annan = underlag.problem.clusters.find(c => !schemaPassKluster(underlag.problem, a.id).includes(c.id)).id;
  const nekad = await fetch(`${url}/v1/positions`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify({ problem: underlag.problem, placements: [], lesson: a.id, pupil: annan }) });
  assert.deepEqual([nekad.status, await nekad.json()], [400, { error: 'bad_pupil' }]);
  const enElev = await lagen(a.id, elev);
  assert.ok(enElev.svar.elev && enElev.svar.positions.filter(x => x.state === 'brott').length <= count('brott'), 'elevnivå ska inte ge fler regelbrott än klassnivå');
  assert.ok(!JSON.stringify(enElev.svar).includes('52a10000'), 'elev-ID i svaret');
  // Svarstid: varje pass i klass 1 en gång.
  const tider = [];
  for (const l of own.slice(0, 8)) tider.push((await lagen(l.id)).ms);
  console.log(JSON.stringify({ lagen: { lessons: underlag.problem.lessons.length, positions: svar.positions.length, fri: count('fri'), onskemal: count('onskemal'), byte: count('byte'), brott: count('brott'), sparrad: count('sparrad'),
    ms, msMax: Math.max(...tider), elevBrott: enElev.svar.positions.filter(x => x.state === 'brott').length, varfor: rader } }));
  // Marginal i lägena (05.2-SM-MARGINAL): möjliga starttider för ett idrottspass med omklädning och dusch ger samma svar som kontrollen av en flytt dit.
  const gympaPass = idrott.find(l => l.classIds.includes(f2.classes[0].id)), marg = await lagen(gympaPass.id, null, f2.lessons, u2);
  assert.ok(marg.svar.positions.every(x => x.startMin - 10 >= f2.days[x.day].startMin && x.startMin + gympaPass.durationMin + 15 <= f2.days[x.day].endMin), 'lägena ska bara ha tider där marginalen ryms');
  const prov = { fri: marg.svar.positions.filter(x => x.state === 'fri').slice(0, 4), brott: marg.svar.positions.filter(x => x.state === 'brott').slice(0, 4) };
  for (const [state, list] of Object.entries(prov)) for (const x of list) {
    const k = await kontroll(f2.lessons.map(l => l.id === gympaPass.id ? { ...l, day: x.day, startMin: x.startMin, roomId: x.room ?? l.roomId } : l), u2, f2);
    assert.ok(state === 'fri' ? k.total === 0 : k.total > 0, `läget ${state} ${x.day} ${x.startMin} stämmer inte med kontrollen (${k.total} avvikelser)`);
  }
  console.log(JSON.stringify({ marginalLagen: { positions: marg.svar.positions.length, provadeFri: prov.fri.length, provadeBrott: prov.brott.length, ms: marg.ms } }));
  // Nya tidsvillkor prövas direkt (05.2-SM-VILLKOR-DIREKT): förslaget är räknat utan villkor, och därefter läggs en spärr för Klass 1 över ett av dess pass.
  // Samma steg som rutterna: begäran med nuvarande villkor och förslagets grund, underlaget byggt med villkoren och grunden jämförd.
  const sparr = { slag: 'klass', ref: uid(100), typ: 'sparrad', days: [a.day], startMin: a.startMin, endMin: a.startMin + a.durationMin };
  const direkt = { ...request, villkor: { ...defaultSchemaVillkor(), egna: [sparr] } };
  const begaran = parseSchemaKontrollRequest(JSON.parse(JSON.stringify({ contractVersion: SCHEMA_CONTRACT_VERSION, ...direkt, grundFingerprint: forslag.grundFingerprint, placements: [] })));
  const uSparr = schemaProvUnderlag(plan, begaran, basis);
  assert.ok(uSparr && sammaGrund(direkt.villkor, request.villkor), 'en ny spärr ska prövas mot förslagets pass, inte ge 409');
  assert.notEqual(uSparr.fingerprint, base.fingerprint);
  assert.ok(!JSON.stringify(uSparr.problem).includes('52a10000'), 'appens ID nådde motorn med spärren');
  assert.deepEqual(uSparr.problem.lessons.map(l => [l.id, l.duration_min, l.teachers, l.groups]), base.problem.lessons.map(l => [l.id, l.duration_min, l.teachers, l.groups]), 'spärren ändrade passen');
  const paSparren = await kontroll(forslag.lessons, uSparr);
  assert.ok(paSparren.violations.some(v => v.code === 'outside_allowed' && v.lessons.includes(a.id)), 'kontrollen redovisar inte passet på den nya spärren');
  assert.ok(paSparren.violations.every(v => v.code === 'outside_allowed' && v.lessons.every(id => forslag.lessons.find(l => l.id === id).classIds.includes(forslag.classes[0].id))), 'andra avvikelser än spärren');
  assert.ok(paSparren.grundFingerprint === forslag.grundFingerprint && paSparren.fingerprint === uSparr.fingerprint, 'svaret ska bära villkorens fingeravtryck');
  // Möjliga starttider för ett annat pass i klassen: tiden under spärren är spärrad.
  const annat = own.find(l => l.id !== a.id && l.durationMin <= a.durationMin + 30);
  const lagenSparr = (await lagen(annat.id, null, forslag.lessons, uSparr)).svar;
  const underSparr = lagenSparr.positions.filter(x => x.day === sparr.days[0] && x.startMin < sparr.endMin && x.startMin + annat.durationMin > sparr.startMin);
  assert.ok(underSparr.length > 0 && underSparr.every(x => x.state === 'sparrad' && x.reasons.some(r => r.code === 'outside_allowed')), 'lägena visar inte spärrad tid');
  const utanSparr = (await lagen(annat.id)).svar.positions.filter(x => underSparr.some(y => y.day === x.day && y.startMin === x.startMin));
  assert.ok(utanSparr.every(x => !x.reasons.some(r => r.code === 'outside_allowed')), 'tiden var spärrad redan utan spärren');
  // En flytt in i spärren nekas: passen kontrollen pekade ut (spärren gäller hela läsåret, så också vårens pass på samma tid) läggs på viloytan, och
  // schemat är då utan avvikelser. Sedan flyttas ett annat pass i klassen till spärrens tid.
  const utpekade = new Set(paSparren.violations.flatMap(v => v.lessons));
  const bort = forslag.lessons.map(l => utpekade.has(l.id) ? { ...l, day: null, startMin: null } : l);
  assert.equal((await kontroll(bort, uSparr)).total, 0, 'passen borttagna från spärren ska ge ett schema utan avvikelser');
  const inSparr = await kontroll(bort.map(l => l.id === annat.id ? { ...l, day: sparr.days[0], startMin: sparr.startMin } : l), uSparr);
  assert.ok(inSparr.violations.some(v => v.code === 'outside_allowed' && v.lessons.includes(annat.id)), 'en flytt in i spärren nekas inte');
  // Ändrad grund (längsta pass) ger 409; ett nytt förslag med samma villkor har inga avvikelser och inget av klassens pass på spärren.
  assert.equal(schemaProvUnderlag(plan, { ...begaran, villkor: { ...begaran.villkor, maxLessonMin: 70 } }, basis), null, 'ändrad grund ska ge 409');
  const fSparr = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(plan, direkt, uSparr, await solve(uSparr)))), direkt);
  assert.equal(fSparr.grundFingerprint, forslag.grundFingerprint);
  assert.equal((await kontroll(fSparr.lessons, uSparr, fSparr)).total, 0, 'nytt förslag med spärren ska vara utan avvikelser');
  assert.ok(fSparr.lessons.filter(l => l.classIds.includes(fSparr.classes[0].id) && l.day === sparr.days[0] && l.startMin !== null)
    .every(l => l.startMin >= sparr.endMin || l.startMin + l.durationMin <= sparr.startMin), 'nytt förslag lägger klassen på spärren');
  console.log(JSON.stringify({ villkorDirekt: { pass: a.id, sparr: [sparr.days[0], sparr.startMin, sparr.endMin], avvikelser: paSparren.total, kod: paSparren.violations[0].code,
    utpekade: [...utpekade], annat: annat.id, sparradeLagen: underSparr.length, flyttIn: inSparr.violations.filter(v => v.code === 'outside_allowed').length, nyttForslag: fSparr.status } }));
  // Längsta dag per lärare (05.2-SM-VILLKORSTABELL, Q126): ett eget villkor `dag` för Provlärare 12 når motorn som `teachers[].max_min_per_day` och är ett
  // tidsvillkor. Lärarens undervisning räknas per termin och veckodag, som kontrollanten räknar den (pass som går hela läsåret räknas båda terminerna).
  // Läraren har 820 min i veckan på hösten; 240 min per dag går att hålla (5 × 240 = 1 200).
  // En tidsbegränsad flertrådskörning kan redan hålla gränsen. Då skapas ett uttryckligt syntetiskt motexempel för den negativa kontrollen.
  // Provlärare 1 (1 120 min i veckan, pass om 45–70 min) är för fullbokad: motorn hittar inget fullständigt schema på 10 s, utan att det är bevisat omöjligt.
  const dagar = (f, id) => { const out = {}; for (const l of f.lessons) if (l.day !== null && l.teacherIds.includes(id)) for (const t of l.term ? [l.term] : ['ht', 'vt']) out[`${t} ${l.day}`] = (out[`${t} ${l.day}`] ?? 0) + l.durationMin; return out; };
  const tolvan = forslag.teachers.find(t => t.name === 'Provlärare 12').id;
  const grundDag = Math.max(...Object.values(dagar(forslag, tolvan)));
  let dagProv = forslag.lessons, konstrueratDagbrott = false;
  if (grundDag <= 240) {
    const samle = new Map(); let min = 0, start = forslag.days[0].startMin;
    for (const l of forslag.lessons.filter(l => l.teacherIds.includes(tolvan) && (l.term === 'ht' || l.term === null))) {
      assert.ok(start + l.durationMin <= forslag.days[0].endMin, 'det syntetiska motexemplet ryms inte i skoldagen');
      samle.set(l.id, start); min += l.durationMin; start += l.durationMin + forslag.villkor.breakMin;
      if (min > 240) break;
    }
    assert.ok(min > 240, 'saknar undervisning för det syntetiska motexemplet');
    dagProv = forslag.lessons.map(l => samle.has(l.id) ? { ...l, day: 0, startMin: samle.get(l.id) } : l);
    konstrueratDagbrott = true;
  }
  const foreDag = Math.max(...Object.values(dagar({ lessons: dagProv }, tolvan)));
  const dagVillkor = { ...defaultSchemaVillkor(), egna: [{ slag: 'larare', ref: uid(211), typ: 'dag', maxMin: 240 }] }, dagRequest = { ...request, villkor: dagVillkor };
  const uDag = buildSchemaUnderlag(plan, dagRequest, basis);
  assert.deepEqual(uDag.problem.teachers.map(t => t.max_min_per_day ?? null), Array.from({ length: TEACHERS }, (_, i) => i === 11 ? 240 : null), 'längsta dag når inte motorn');
  assert.ok(sammaGrund(dagVillkor, request.villkor) && uDag.grundFingerprint === underlag.grundFingerprint, 'längsta dag ska vara ett tidsvillkor');
  assert.ok(!JSON.stringify(uDag.problem).includes('52a10000'), 'appens ID nådde motorn med längsta dag');
  // Direkt prövning: en dag över 240 min redovisas för läraren, även när grundförslaget redan råkade hålla gränsen.
  const dagDirekt = await kontroll(dagProv, schemaProvUnderlag(plan, { ...dagRequest, grundFingerprint: forslag.grundFingerprint }, basis));
  const forLang = dagDirekt.violations.filter(v => v.code === 'teacher_day_too_long');
  assert.ok(foreDag > 240, 'det negativa provet måste faktiskt överskrida gränsen');
  assert.ok(forLang.length > 0 && forLang.every(v => v.message.startsWith('Lärare Provlärare 12 har ')), 'kontrollen prövar inte längsta dag');
  // Ett nytt förslag med villkoret: ingen dag över 240 min för läraren, och kontrollanten godkänner det.
  const fDag = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(plan, dagRequest, uDag, await solve(uDag)))), dagRequest);
  assert.equal(fDag.status, 'complete', JSON.stringify(fDag.diagnoses.map(d => d.message)));
  const efterDag = Math.max(...Object.values(dagar(fDag, tolvan)));
  assert.ok(efterDag <= 240, `Provlärare 12 har ${efterDag} min en dag`);
  assert.equal((await kontroll(fDag.lessons, uDag, fDag)).total, 0, 'förslaget med längsta dag ska vara utan avvikelser');
  console.log(JSON.stringify({ langstaDag: { larare: 'Provlärare 12', maxMin: 240, langstaGrund: grundDag, konstrueratDagbrott, langstaFore: foreDag, langstaEfter: efterDag, direktAvvikelser: forLang.length, nyttForslag: fDag.status } }));
  // Appens eget motoranrop (web/lib/server/schemamotor.ts) i workerd, samma körmiljö som den byggda appen: det nodens fetch godtar är inte säkert giltigt där.
  const fromWeb = createRequire(new URL('../../web/package.json', import.meta.url)), { Miniflare, convertV4MiniflareOptions } = createRequire(fromWeb.resolve('wrangler'))('miniflare');
  const entry = `import { positionsSchema, solveSchema, validateSchema, suggestSchema } from ${JSON.stringify(new URL('../../web/lib/server/schemamotor.ts', import.meta.url).pathname)};
    export default { async fetch(request) { try { const problem = await request.json(), solved = await solveSchema(problem), check = await validateSchema(problem, solved.placements);
      const lagen = await positionsSchema(problem, solved.placements, solved.placements[0].lesson, null);
      const proposed = await suggestSchema(problem, solved.placements.slice(1), { mode: 'lesson', lesson: solved.placements[0].lesson, target: null, depth: 1, unitId: 'ska-stanna-i-appen' });
      const proposalCheck = proposed.suggestions.length ? await validateSchema(problem, proposed.suggestions[0].placements) : null;
      return Response.json({ status: solved.status, placed: solved.placements.length, violations: check.violations.length, free: lagen.positions.some(p => p.state === 'fri'),
        suggestion: proposed.suggestions.length > 0, suggestionViolations: proposalCheck?.violations.length ?? null }); } catch (error) { return Response.json({ error: error.reason ?? String(error) }); } } };`;
  const built = await fromWeb('esbuild').build({ stdin: { contents: entry, resolveDir: dir, loader: 'ts' }, bundle: true, format: 'esm', external: ['cloudflare:workers'], write: false, logLevel: 'silent' });
  const worker = new Miniflare(convertV4MiniflareOptions({ workers: [{ modules: true, script: built.outputFiles[0].text, compatibilityDate: '2025-09-01', compatibilityFlags: ['nodejs_compat'],
    bindings: { SCHEMAMOTOR_URL: url, SCHEMAMOTOR_TOKEN: token } }] }));
  try {
    const viaWorker = await (await worker.dispatchFetch('http://app.invalid/', { method: 'POST', body })).json();
    assert.deepEqual(viaWorker, { status: 'complete', placed: solution.placements.length, violations: 0, free: true, suggestion: true, suggestionViolations: 0 }, 'appens motoranrop fungerar inte i workerd');
    console.log(JSON.stringify({ workerd: viaWorker }));
  } finally { await worker.dispose(); }
} finally { service.kill(); }
