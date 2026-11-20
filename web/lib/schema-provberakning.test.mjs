import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSchemaCheck } from './schema-contract.ts';
import { schemaDatumOriginal } from './schema-datum.ts';
import { datumFixture, datumId as id } from './schema-datum-fixture.mjs';
import { schemaProvBerakning } from './schema-provberakning.ts';
import { motorProblem } from './schema-utan-sal.ts';

const dag = '2026-11-02';
const prov = (num, extra = {}) => ({ id: id(num), namn: 'Nationellt prov', undervisning: `undervisning:class_timplan:${id(10)}:2026:prov`,
  mal: { slag: 'klass', ref: id(10) }, datum: dag, startMin: 480, slutMin: 540, tidsval: 'period', salId: null, vakter: [], kontrolleradDatum: dag, ...extra });
const sal = (num, name, platser) => ({ id: `sal-${num}`, name, typ: 'Allmän sal', platser, utrustning: [] });
const salregister = [sal(7, 'Provsal A', 28), sal(6, 'Provsal B', 26), sal(5, 'Ledig sal', 20), sal(4, 'Okänd kapacitet', null)];
const vakt = (num, startsOn = dag, endsOn = null) => ({ ref: id(num), name: `Provlärare ${num}`, startsOn, endsOn });
const godkant = { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };

function input(fixture, extra = {}) {
  return { plan: fixture.plan, underlag: fixture.underlag, forslag: fixture.f, datedBasis: fixture.datedBasis, datedOverrides: [],
    bokningar: [prov(101)], salar: salregister, vakter: [vakt(18), vakt(20), vakt(21), vakt(22)], validate: async () => godkant, ...extra };
}

test('exakt elevgrupp tränger undan ett pass och frigjord lärare och sal prioriteras framför mindre ledig sal', async () => {
  const fixture = datumFixture({ year: true });
  const original = schemaDatumOriginal(fixture.f, { lesson: fixture.of('Matematik').id, originalDate: dag });
  const calls = [];
  const data = input(fixture, { validate: async (problem, placements) => { calls.push({ problem, placements }); return godkant; } });
  const snapshot = structuredClone({ ...data, validate: undefined });
  const result = await schemaProvBerakning(data);
  assert.deepEqual(result.bokningar[0], { id: id(101), namn: 'Nationellt prov', datum: dag, startMin: 480, slutMin: 540,
    deltagare: 1, deltagarnamn: 'Provklass 1', sal: { id: 'sal-7', name: 'Provsal A' }, vakter: [{ ref: id(20), name: 'Provlärare 20' }], problem: [] });
  assert.equal(result.bortfall.length, 1);
  assert.equal(result.bortfall[0].title, 'Matematik · Provklass 1');
  assert.deepEqual([result.bortfall[0].bortfallMin, result.bortfall[0].ersattMin, result.bortfall[0].kvarMin], [original.length, original.length, 0]);
  assert.equal(result.ersattningar[0].durationMin, original.length);
  assert.equal(result.ersattningar[0].originalDate, dag);
  assert.equal(result.ersattningar[0].date, dag);
  assert.ok(result.ersattningar[0].startMin >= 540);
  assert.equal(calls.length, 1);
  assert.ok(!JSON.stringify(calls[0].problem).includes(id(80)));
  assert.deepEqual({ ...data, validate: undefined }, snapshot);
});

test('samtidiga prov för olika elever delar inte sal eller vakt och respekterar låsta bokningsval', async () => {
  const fixture = datumFixture({ year: true });
  fixture.datedBasis.placements.push({ id: id(91), pupilId: id(81), startsOn: '2026-07-01', endsOn: null });
  fixture.datedBasis.classMemberships.push({ placementId: id(91), pupilId: id(81), classId: id(11), startsOn: '2026-07-01', endsOn: null });
  const second = prov(102, { mal: { slag: 'klass', ref: id(11) }, salId: 'sal-6', vakter: [id(21)] });
  const result = await schemaProvBerakning(input(fixture, { bokningar: [second, prov(101)] }));
  assert.deepEqual(result.bokningar.map(b => [b.id, b.sal.id, b.vakter[0].ref, b.problem]), [
    [id(101), 'sal-7', id(20), []], [id(102), 'sal-6', id(21), []],
  ]);
  assert.equal(result.ersattningar.length, 2);
  assert.ok(result.bortfall.every(r => r.kvarMin === 0));
});

test('två samtidiga prov använder salarna från respektive klass flyttade undervisning', async () => {
  const fixture = datumFixture({ year: true });
  fixture.datedBasis.placements.push({ id: id(91), pupilId: id(81), startsOn: '2026-07-01', endsOn: null });
  fixture.datedBasis.classMemberships.push({ placementId: id(91), pupilId: id(81), classId: id(11), startsOn: '2026-07-01', endsOn: null });
  const second = prov(102, { mal: { slag: 'klass', ref: id(11) } });
  const data = input(fixture, { bokningar: [second, prov(101)] });
  const result = await schemaProvBerakning(data);
  assert.deepEqual(result.bokningar.map(b => [b.id, b.sal?.id, b.problem]), [
    [id(101), 'sal-7', []], [id(102), 'sal-6', []],
  ]);
  assert.ok(result.bortfall.every(r => r.kvarMin === 0));
  assert.deepEqual(await schemaProvBerakning({ ...data, bokningar: [...data.bokningar].reverse(), salar: [...data.salar].reverse() }), result);
});

test('överlappande prov delar upp salarna även när ett tidigare prov behöver välja bort sin frigjorda sal', async () => {
  const fixture = datumFixture({ year: true });
  fixture.datedBasis.placements.push(...[81, 82].map((pupil, i) => ({ id: id(91 + i), pupilId: id(pupil), startsOn: '2026-07-01', endsOn: null })));
  fixture.datedBasis.classMemberships.push({ placementId: id(91), pupilId: id(81), classId: id(11), startsOn: '2026-07-01', endsOn: null });
  fixture.datedBasis.memberships[0].pupilId = id(82);
  fixture.underlag.villkor.egna.push(
    { slag: 'sal', ref: 'Provsal B', typ: 'tillaten', days: [0], startMin: 480, endMin: 540 },
    { slag: 'sal', ref: 'Ledig sal', typ: 'tillaten', days: [0], startMin: 510, endMin: 570 },
  );
  const bokningar = [prov(101), prov(102, { mal: { slag: 'klass', ref: id(11) }, startMin: 510, slutMin: 570 }),
    prov(103, { mal: { slag: 'grupp', ref: id(40) }, startMin: 510, slutMin: 570 })];
  const result = await schemaProvBerakning(input(fixture, { bokningar, salar: [sal(7, 'Provsal A', 20), ...salregister.slice(1)] }));
  assert.equal(result.bokningar[0].sal.id, 'sal-6');
  assert.deepEqual(new Set(result.bokningar.slice(1).map(b => b.sal?.id)), new Set(['sal-7', 'sal-5']));
  assert.ok(result.bokningar.every(b => b.problem.length === 0));
});

test('ett flyttat pass utan sal frigör ingen sal och provet får en ledig sal med kontrollerad kapacitet', async () => {
  const fixture = datumFixture({ year: true });
  fixture.of('Matematik').roomId = null;
  const result = await schemaProvBerakning(input(fixture));
  assert.deepEqual(result.bokningar[0].sal, { id: 'sal-5', name: 'Ledig sal' });
  assert.equal(result.bortfall[0].kvarMin, 0);
});

test('provkrock med gemensam elev flaggas och samma bortfall summeras bara en gång', async () => {
  const fixture = datumFixture({ year: true });
  const group = prov(102, { mal: { slag: 'grupp', ref: id(40) } });
  const result = await schemaProvBerakning(input(fixture, { bokningar: [group, prov(101)], lastaPass: [fixture.of('Matematik').id] }));
  assert.ok(result.bokningar.every(b => b.problem.includes('provkrock') && b.problem.includes('last_pass_krock') && !b.sal && !b.vakter.length));
  assert.equal(result.bortfall.length, 1);
  assert.equal(result.bortfall[0].bortfallMin, schemaDatumOriginal(fixture.f, { lesson: fixture.of('Matematik').id, originalDate: dag }).length);
  assert.equal(result.bortfall[0].ersattMin, 0);
  assert.equal(result.bortfall[0].kvarMin, result.bortfall[0].bortfallMin);
});

test('datum utanför skoldag, saknade deltagare, otillräcklig kapacitet och otillgängliga låsta resurser lämnas synliga', async () => {
  const fixture = datumFixture({ year: true });
  const data = input(fixture, { bokningar: [
    prov(101, { datum: '2026-11-09' }),
    prov(102, { mal: { slag: 'grupp', ref: id(90) } }),
    prov(103, { salId: 'sal-4', vakter: [id(20)] }),
  ], vakter: [vakt(20, '2026-11-03')], lastaPass: [fixture.of('Matematik').id] });
  const result = await schemaProvBerakning(data);
  const byId = new Map(result.bokningar.map(b => [b.id, b]));
  assert.deepEqual(byId.get(id(101)).problem, ['datum_utan_undervisning']);
  assert.deepEqual(byId.get(id(102)).problem, ['deltagare_saknas']);
  assert.deepEqual(byId.get(id(103)).problem, ['last_pass_krock', 'last_sal_olamplig', 'last_vakt_upptagen']);
  assert.equal(byId.get(id(103)).sal.id, 'sal-4');
  assert.equal(byId.get(id(103)).vakter[0].ref, id(20));
  assert.equal(result.ersattningar.length, 0);
});

test('senare ersättning kräver samma elever och en godkänd motorkontroll inom ändliga gränser', async () => {
  const fixture = datumFixture({ year: true });
  const earliest = '2026-11-04';
  let calls = 0;
  const noLongerInClass = await schemaProvBerakning(input(fixture, { tidigasteErsattning: earliest, validate: async () => { calls++; return godkant; } }));
  assert.equal(calls, 0);
  assert.ok(noLongerInClass.bortfall[0].kvarMin > 0);
  fixture.datedBasis.classMemberships[0].endsOn = null;
  const stillInClass = await schemaProvBerakning(input(fixture, { tidigasteErsattning: earliest, validate: async (problem, placements) => {
    calls++;
    assert.ok(problem.id >= `datum-${earliest}`);
    assert.ok(placements.length > 0);
    return { ...godkant, violations: [{ code: 'syntetiskt_hinder' }] };
  } }));
  assert.ok(calls > 1 && calls <= 48);
  assert.equal(stillInClass.ersattningar.length, 0);
  assert.equal(stillInClass.bortfall[0].kvarMin, noLongerInClass.bortfall[0].kvarMin);
});

test('ett svårplacerat tillfälle får inte använda söktiden för de övriga', async () => {
  const fixture = datumFixture({ year: true });
  fixture.datedBasis.classMemberships.splice(1, 1);
  fixture.datedBasis.classMemberships[0].endsOn = null;
  fixture.datedBasis.placements.push({ id: id(91), pupilId: id(81), startsOn: '2026-07-01', endsOn: null });
  fixture.datedBasis.classMemberships.push({ placementId: id(91), pupilId: id(81), classId: id(11), startsOn: '2026-07-01', endsOn: null });
  const second = prov(102, { mal: { slag: 'klass', ref: id(11) } });
  const calls = [];
  const data = input(fixture, { bokningar: [prov(101), second], validate: async (problem, placements) => {
    const date = problem.id.slice('datum-'.length);
    const math = new Set(problem.lessons.filter(lesson => lesson.teachers.some(teacher => fixture.underlag.teacherRefs[teacher] === id(20))).map(lesson => lesson.id));
    const attempted = placements.find(placement => math.has(placement.lesson) && (placement.day !== 0 || placement.startMin !== 480));
    calls.push({ date, subject: attempted ? 'Matematik' : 'Historia', start: attempted?.startMin });
    return attempted ? { ...godkant, violations: [{ code: 'syntetiskt_hinder' }] } : godkant;
  } });
  const result = await schemaProvBerakning(data);
  assert.deepEqual(calls.slice(0, 2).map(call => call.subject), ['Matematik', 'Historia']);
  const mathStartsOnExamDate = calls.filter(call => call.date === dag && call.subject === 'Matematik').map(call => call.start);
  assert.equal(mathStartsOnExamDate.length, 3);
  assert.ok(mathStartsOnExamDate[1] - mathStartsOnExamDate[0] > 60);
  assert.equal(result.ersattningar.length, 1);
  assert.equal(result.ersattningar[0].lesson, fixture.of('Historia').id);
  assert.ok(result.bortfall.find(row => row.title.startsWith('Matematik')).kvarMin > 0);
  assert.equal(result.bortfall.find(row => row.title.startsWith('Historia')).kvarMin, 0);
  const firstRun = calls.splice(0);
  assert.deepEqual(await schemaProvBerakning(data), result);
  assert.deepEqual(calls, firstRun);
});

test('ersättningspasset godkänns av fristående Rustmotorn med faktiskt datumproblem', { skip: process.env.SCHEMA_PROV_ENGINE !== '1' }, async () => {
  const { spawn } = await import('node:child_process');
  const { randomBytes } = await import('node:crypto');
  const port = 20000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}`, token = randomBytes(24).toString('hex');
  const binary = new URL('../../schemamotor/target/release/schemamotor-tjanst', import.meta.url).pathname;
  const service = spawn(binary, [], { env: { SCHEMAMOTOR_ADDR: `127.0.0.1:${port}`, SCHEMAMOTOR_TOKEN: token }, stdio: 'ignore' });
  let spawnError;
  service.on('error', error => { spawnError = error; });
  try {
    for (let tries = 0; ; tries++) {
      if (spawnError) throw spawnError;
      try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* lokal motor startar */ }
      assert.ok(tries < 40, 'den fristående motorn startade inte');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    const fixture = datumFixture({ year: true });
    const result = await schemaProvBerakning(input(fixture, { validate: async (problem, placements) => {
      const motor = motorProblem(problem, placements);
      const response = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ problem: motor, placements: placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room === null ? [] : [p.room] })) }),
        signal: AbortSignal.timeout(5_000) });
      assert.equal(response.status, 200);
      return parseSchemaCheck(await response.json(), motor);
    } }));
    assert.equal(result.ersattningar.length, 1);
    assert.equal(result.bortfall[0].kvarMin, 0);
  } finally { service.kill('SIGTERM'); }
});
