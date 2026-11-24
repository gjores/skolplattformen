// Prövar serverns planering med syntetiska datumdeltagare och en lokal motorstub.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { checkSchemaPlacements } from './schema-contract.ts';
import { datumFixture, datumId } from './schema-datum-fixture.mjs';
import { schemaDatumNyckel, schemaDatumOriginal } from './schema-datum.ts';
import { buildSchemaUnderlag, schemaForslag } from './schema-underlag.ts';

const db = new URL('./server/db.ts', import.meta.url).href, engine = new URL('./server/schemamotor.ts', import.meta.url).href;
registerHooks({ load(url, context, next) {
  if (url === db) return { format: 'module', shortCircuit: true, source: `export class Deny extends Error {
    constructor(code, status, details) { super(code); this.code = code; this.status = status; this.details = details; }
  }` };
  if (url === engine) return { format: 'module', shortCircuit: true, source: "export const validateSchema = () => { throw Error('Använd provets motorstub'); };" };
  return next(url, context);
} });
const { planeraDateradAktivitet, valideraDateradAktivitetsplan } = await import('./server/schema-daterad-aktivitet.ts');

const eventDate = '2026-12-07', sport = 'Idrott och hälsa – Nivå 1';
const noViolations = { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };

function activityFixture() {
  const x = datumFixture(), { plan, basis, datedBasis, id } = x;
  const sportKey = 'common:IDRO:1:IDRO1000X', mathKey = 'common:MATE:1:MATE1000X';
  const source = (classId, rowKey) => `class_timplan:${classId}:${plan.schoolYear}:${rowKey}`;
  for (const klass of plan.classes) {
    const need = klass.needs[0], row = plan.rows.find(row => row.sourceKey === need.sourceKey);
    Object.assign(need, { sourceKey: source(klass.classId, sportKey), rowKey: sportKey, label: sport });
    Object.assign(row, { sourceKey: need.sourceKey, rowKey: sportKey });
  }
  const [first, second] = plan.classes;
  const mathNeed = { ...first.needs[0], sourceKey: source(first.classId, mathKey), rowKey: mathKey, label: 'Matematik' };
  first.needs.push(mathNeed);
  plan.rows.push({ ...plan.rows[0], id: id(53), lineageId: id(63), sourceKey: mathNeed.sourceKey, rowKey: mathKey });

  const firstPupil = id(81), secondPupil = id(80), firstPlacement = id(91), secondPlacement = id(90);
  basis.members.pupils = [{ id: firstPupil, classIds: [first.classId] }, { id: secondPupil, classIds: [second.classId] }];
  basis.members.memberships.push({ ...basis.members.memberships[0], pupilId: firstPupil });
  datedBasis.placements.push({ ...datedBasis.placements[0], id: firstPlacement, pupilId: firstPupil });
  datedBasis.classMemberships = [
    { placementId: firstPlacement, pupilId: firstPupil, classId: first.classId, startsOn: '2026-07-01', endsOn: '2027-06-30' },
    { placementId: secondPlacement, pupilId: secondPupil, classId: second.classId, startsOn: '2026-07-01', endsOn: '2027-06-30' },
  ];
  datedBasis.memberships.push({ ...datedBasis.memberships[0], pupilId: firstPupil });

  const villkor = { ...x.request.villkor, egna: [sport, 'Matematik', 'Franska'].map(ref => ({ slag: 'amne', ref, typ: 'sal', rooms: ['Provsal A', 'Provsal B'] })) };
  const request = { ...x.request, villkor }, underlag = buildSchemaUnderlag(plan, request, basis);
  const placements = underlag.labels.lessons.map(lesson => ({
    lesson: lesson.id, day: lesson.title === 'Franska' ? 1 : 0, startMin: lesson.title === 'Matematik' ? 540 : 480,
    room: lesson.title === 'Franska' || lesson.classIds[0] === 'grupp-2' ? 'sal-2' : 'sal-1',
  }));
  const base = schemaForslag(plan, request, underlag, { status: 'complete', placements, unplaced: [], diagnoses: [], elapsedMs: 0, metrics: noViolations.metrics });
  const sports = [first, second].map(klass => `undervisning:${source(klass.classId, sportKey)}`).sort();
  const math = `undervisning:${mathNeed.sourceKey}`;
  const french = base.lessons.find(lesson => lesson.title === 'Franska' && lesson.term === 'ht');
  const originalDate = '2026-12-08';
  const original = schemaDatumOriginal(base, { lesson: french.id, originalDate });
  assert.ok(original);
  const manual = { lesson: french.id, originalDate, date: eventDate, startMin: 630, room: 'sal-2', durationMin: original.length };
  const input = { id: id(100), name: 'Friluftsdag', date: eventDate, startMin: 480, endMin: 600, classRefs: [first.classId, second.classId],
    credit: { ref: sports[0], minutes: 60 } };
  const validated = [];
  const validate = async (problem, at) => {
    assert.doesNotThrow(() => checkSchemaPlacements(at, problem, false));
    validated.push({ date: problem.id.slice(6), at: structuredClone(at) });
    return noViolations;
  };
  return { read: { plan, datedBasis }, underlag, base, input, sports, math, manual, validate, validated };
}

const changed = error => error.status === 409 && error.details?.reason === 'schema_daterad_aktivitet_changed';

test('friluftsdag ger båda klasserna idrottstid och flyttar matematik utan att flytta ett manuellt datumtillfälle', async () => {
  const x = activityFixture(), withManual = [x.manual], previous = structuredClone(withManual);
  const { activity, blockers, effects, totals, uncreditedClasses } =
    await planeraDateradAktivitet(x.read, x.underlag, x.base, withManual, x.input, [], [], x.validate);
  assert.deepEqual(blockers, []);
  assert.deepEqual(uncreditedClasses, []);
  assert.deepEqual(activity.credits, x.sports);
  assert.equal(activity.cancelled.length, 2);
  assert.deepEqual(effects.filter(effect => effect.status === 'credited').map(effect => effect.title), [sport, sport]);
  assert.ok(totals.filter(total => x.sports.includes(total.ref)).every(total => total.credited === 60 && total.remaining === 0));

  assert.equal(activity.moves.length, 1);
  const moved = effects.find(effect => effect.title === 'Matematik');
  assert.equal(moved.status, 'moved');
  assert.deepEqual(moved.target, activity.moves[0]);
  assert.equal(moved.target.date, eventDate);
  assert.ok(moved.target.startMin >= x.manual.startMin + x.manual.durationMin);
  assert.deepEqual(totals.find(total => total.ref === x.math), {
    ref: x.math, title: 'Matematik', classes: ['Provklass 1'], lost: moved.minutes, moved: moved.minutes, credited: 0, remaining: 0, net: 0,
  });
  assert.ok(x.validated.some(call => call.date === eventDate && call.at.some(p => p.startMin === x.manual.startMin && p.room === x.manual.room)));
  await valideraDateradAktivitetsplan(x.read, x.underlag, x.base, withManual, [activity], [], x.validate);
  assert.deepEqual(withManual, previous);
  assert.ok([...activity.cancelled, ...activity.moves].every(p => schemaDatumNyckel(p) !== schemaDatumNyckel(x.manual)));
});

test('servern nekar en klientpåhittad undervisningskredit och bevarar ett manuellt tillfälle som krockar', async () => {
  const x = activityFixture();
  const approved = (await planeraDateradAktivitet(x.read, x.underlag, x.base, [x.manual], x.input, [], [], x.validate)).activity;
  await assert.rejects(valideraDateradAktivitetsplan(x.read, x.underlag, x.base, [x.manual], [
    { ...approved, credits: [x.sports[0], x.math] },
  ], [], x.validate), changed);
  await assert.rejects(valideraDateradAktivitetsplan(x.read, x.underlag, x.base, [x.manual], [
    { ...approved, credit: { ...approved.credit, ref: sport } },
  ], [], x.validate), error => error.status === 409 && error.details?.reason === 'schema_daterad_aktivitet_subject');

  const extended = await planeraDateradAktivitet(x.read, x.underlag, x.base, [x.manual], { ...x.input, endMin: 690 }, [], [], x.validate);
  assert.ok(extended.blockers.some(message => message.includes('ett tidigare ändrat tillfälle')));
  assert.ok([...extended.activity.cancelled, ...extended.activity.moves].every(p => schemaDatumNyckel(p) !== schemaDatumNyckel(x.manual)));
  await assert.rejects(valideraDateradAktivitetsplan(x.read, x.underlag, x.base, [x.manual], [extended.activity], [], x.validate), changed);
});

test('daterad aktivitet väljer sal efter elevantal och ersätter otillgänglig ansvarig utan att ändra manuellt salval', async () => {
  const x = activityFixture(), id = datumId;
  x.underlag.problem.rooms = x.underlag.problem.rooms.map(room => ({ ...room, capacity: room.id === 'sal-1' ? 1 : 24 }));
  const expired = id(20), supervising = id(21), first = id(22), next = id(25);
  const duty = (ref, endsOn = '2027-06-30') => ({ ref, startsOn: '2026-07-01', endsOn });
  const read = { ...x.read, schoolDuties: [duty(expired, '2026-12-06'), duty(supervising), duty(first), duty(next)] };
  const exam = { id: id(95), namn: 'Prov för annan klass', mal: { slag: 'klass', ref: id(99) }, undervisning: 'undervisning:prov',
    datum: eventDate, startMin: 540, slutMin: 585, tidsval: 'fast', salId: null, vakter: [supervising], kontrolleradDatum: '2026-11-23' };
  const propose = (source, input) => planeraDateradAktivitet(source, x.underlag, x.base, [], input, [], [exam], x.validate);

  // En äldre definition saknar låsfält men får nya motorval när den planeras om.
  const automatic = await propose(read, x.input);
  assert.deepEqual(automatic.blockers, []);
  assert.deepEqual(automatic.activity.resources, { roomId: 'sal-2', teacherRef: first });

  const impossible = await propose(read, { ...x.input, resourceLocks: { roomId: 'sal-1', teacherRef: supervising } });
  assert.deepEqual(impossible.activity.resources, { roomId: null, teacherRef: null });
  assert.ok(impossible.blockers.some(message => message.includes('Ingen lämplig sal')));
  assert.ok(impossible.blockers.some(message => message.includes('Ingen ansvarig lärare')));

  const definition = { ...x.input, resourceLocks: { roomId: 'sal-2', teacherRef: null } };
  const changedDuties = { ...read, schoolDuties: read.schoolDuties.filter(item => item.ref !== first) };
  const replanned = await propose(changedDuties, definition);
  assert.deepEqual(replanned.blockers, []);
  assert.deepEqual(replanned.activity.resourceLocks, definition.resourceLocks);
  assert.deepEqual(replanned.activity.resources, { roomId: 'sal-2', teacherRef: next });
  await valideraDateradAktivitetsplan(changedDuties, x.underlag, x.base, [], [replanned.activity], [], x.validate);
  await assert.rejects(valideraDateradAktivitetsplan(changedDuties, x.underlag, x.base, [], [automatic.activity], [], x.validate),
    error => error.status === 409 && error.details?.reason === 'schema_daterad_aktivitet_resources');
});
