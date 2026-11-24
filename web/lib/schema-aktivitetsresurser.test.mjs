import assert from 'node:assert/strict';
import test from 'node:test';
import { aktivitetKontrollProblem, aktivitetMotorsProblem, aktivitetReservproblem, valjAktivitetsresurser } from './schema-aktivitetsresurser.ts';
import { parseAktiviteter, aktivitetsPassId } from './schema-aktiviteter.ts';
import { SCHEMA_CONTRACT_VERSION, checkSchemaPlacements, parseSchemaForslag, parseSchemaKontrollRequest } from './schema-contract.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
import { buildSchemaUnderlag, schemaForslag } from './schema-underlag.ts';
import { schemaUtkast, tomtUtkast, utkastPlaceringar } from './schema-utkast.ts';

const aktivitet = { id: 'aktivitet-1', typId: 'typ-tillsyn', typ: 'Tillsyn', name: 'Rastaktivitet', classRefs: [], groupRefs: [], teacherRefs: [], rooms: [],
  durationMin: 30, veckor: { typ: 'alla' }, visibleFor: 'personal', margin: null, tid: { typ: 'motor', days: [0], startMin: 480, endMin: 630 }, salval: 'motor', ansvarigval: 'motor' };
const aktivitetId = aktivitetsPassId(aktivitet.id);
const at = (lesson, startMin = 480, room = null) => ({ lesson, day: 0, startMin, room });
const solution = placements => ({ status: 'complete', placements, unplaced: [], diagnoses: [], elapsedMs: 0, metrics: { studentGapMin: 0, teacherGapMin: 0 } });

test('gamla fasta resurser fungerar, motorns resurser optas in separat', () => {
  const { salval, ansvarigval, ...gammal } = aktivitet;
  const x = datumFixture(), person = x.plan.teachers[0].personId;
  const manuell = { ...gammal, rooms: ['Provsal A'], teacherRefs: [person] };
  assert.deepEqual(parseAktiviteter([manuell, { ...aktivitet, id: 'aktivitet-2' }]), [manuell, { ...aktivitet, id: 'aktivitet-2' }]);
  assert.throws(() => parseAktiviteter([{ ...manuell, salval }]));
  assert.throws(() => parseAktiviteter([{ ...manuell, ansvarigval }]));
  const u = buildSchemaUnderlag(x.plan, { ...x.request, villkor: { ...x.request.villkor, aktiviteter: [manuell] } }, x.basis);
  assert.equal(u.problem.aktivitetsResurser, undefined);
  assert.deepEqual(u.problem.lessons.find(l => l.id === aktivitetId).rooms.allowed, ['sal-1']);
});

test('valet följer förslag, regelkontroll och utkast utan att personens stabila ID lämnas till motorn', () => {
  const x = datumFixture(), request = { ...x.request, villkor: { ...x.request.villkor, aktiviteter: [aktivitet] } };
  const u = buildSchemaUnderlag(x.plan, request, x.basis), l = u.problem.lessons.find(l => l.id === aktivitetId);
  const person = u.problem.aktivitetsResurser[aktivitetId].ansvariga[0];
  assert.deepEqual(l.rooms.allowed, ['sal-1', 'sal-2']);
  assert.ok(!JSON.stringify(aktivitetMotorsProblem(u.problem)).includes(person.ref));
  const solved = valjAktivitetsresurser(u.problem, solution([at(aktivitetId, 480, 'sal-1')]));
  const p = solved.placements[0];
  assert.deepEqual(p, { ...at(aktivitetId, 480, 'sal-1'), ansvarig: person.ref });
  assert.deepEqual(checkSchemaPlacements([p], u.problem), [p]);
  assert.throws(() => checkSchemaPlacements([{ ...p, ansvarig: x.id(99) }], u.problem));
  assert.deepEqual(aktivitetKontrollProblem(u.problem, [p]).motor.lessons.find(l => l.id === aktivitetId).teachers, [person.id]);
  const f = schemaForslag(x.plan, request, u, solved), fPass = f.lessons.find(l => l.id === aktivitetId);
  assert.equal(fPass.ansvarig, person.ref);
  assert.deepEqual(fPass.teacherIds, [person.id]);
  assert.equal(parseSchemaForslag(f, request).lessons.find(l => l.id === aktivitetId).ansvarig, person.ref);
  const input = { ...request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, placements: [p] };
  assert.deepEqual(parseSchemaKontrollRequest(input).placements, [p]);
  const state = schemaUtkast(tomtUtkast(), { type: 'reset', forslag: f });
  const moved = schemaUtkast(state, { type: 'move', lesson: aktivitetId, day: 1, startMin: 500 });
  assert.deepEqual(utkastPlaceringar(moved.placements).find(p => p.lesson === aktivitetId), { ...p, day: 1, startMin: 500 });
});

test('ledig senare tid kan prövas med samma ansvarig när personens första tid är upptagen', () => {
  const x = datumFixture(), ansvarig = x.plan.teachers[0].personId;
  const request = { ...x.request, villkor: { ...x.request.villkor, aktiviteter: [aktivitet] } };
  const basis = { ...x.basis, ansvarsUppdrag: [{ ref: ansvarig, startsOn: '2026-07-01', endsOn: '2027-06-30' }] };
  const u = buildSchemaUnderlag(x.plan, request, basis), undervisning = x.of('Matematik');
  const candidate = valjAktivitetsresurser(u.problem, solution([at(undervisning.id, 480, 'sal-1'), at(aktivitetId, 480, 'sal-2')]));
  assert.deepEqual(candidate.unplaced, [aktivitetId]);
  assert.equal(candidate.diagnoses[0].code, 'activity_responsible_missing');
  const reparera = aktivitetReservproblem(u.problem, candidate);
  assert.equal(reparera.ansvariga.get(aktivitetId), ansvarig);
  assert.deepEqual(reparera.motor.lessons.find(l => l.id === undervisning.id).locked, { day: 0, start_min: 480, rooms: ['sal-1'] });
  assert.equal(reparera.motor.lessons.find(l => l.id === aktivitetId).locked, undefined);
  assert.ok(!JSON.stringify(reparera.motor).includes(ansvarig));
});

test('saknad sal eller ansvarig blir synligt, och uppdrag som inte täcker terminen kan inte väljas', () => {
  const x = datumFixture();
  const basis = { ...x.basis, ansvarsUppdrag: [{ ref: x.plan.teachers[0].personId, startsOn: '2026-11-01', endsOn: null }] };
  const u = buildSchemaUnderlag(x.plan, { ...x.request, villkor: { ...x.request.villkor, aktiviteter: [aktivitet] } }, basis);
  assert.deepEqual(u.problem.aktivitetsResurser[aktivitetId].ansvariga, []);
  for (const [room, code] of [[null, 'activity_room_missing'], ['sal-1', 'activity_responsible_missing']]) {
    const s = valjAktivitetsresurser(u.problem, solution([at(aktivitetId, 480, room)]));
    assert.deepEqual(s.unplaced, [aktivitetId]);
    assert.equal(s.diagnoses[0].code, code);
    assert.deepEqual(s.placements, []);
  }
});
