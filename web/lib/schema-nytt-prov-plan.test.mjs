import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import test from 'node:test';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { datumFixture, datumId as id } from './schema-datum-fixture.mjs';
import { schemaDatumOriginal, schemaDatumTillfallen, schemaDatumTidsandringar } from './schema-datum.ts';
import { buildSchemaUnderlag, schemaForslag } from './schema-underlag.ts';

registerHooks({ load(url, context, next) {
  const server = file => new URL(`./server/${file}`, import.meta.url).href;
  let source;
  if (url === 'cloudflare:workers') source = 'export const env = {};';
  if (url === server('db.ts')) source = `export class Deny extends Error { constructor(code, status, details) { super(code); this.status = status; this.details = details; } }
    export const withLoginPhase = () => { throw new Error('Ingen testdatabas.'); };`;
  if (url === server('schema-read.ts')) source = 'export const readSchemaBasis = () => { throw new Error("Ingen testdatabas."); };';
  if (url === server('authz.ts')) source = 'export class AuditUnavailable extends Error {}; export const protectedRoute = () => { throw new Error("Ingen testrutt."); }; export const requireSameOrigin = () => {};';
  return source ? { format: 'module', source, shortCircuit: true } : next(url, context);
} });
const { nyttSchemaProvKomplett, planeraNyttSchemaProv, provForPeriod } = await import('./server/schema-nytt-prov-plan.ts');

const dag = '2026-11-02';
const godkant = { violations: [], metrics: { studentGapMin: 0, teacherGapMin: 0 } };

function testUnderlag(period = 'ht', platser = 30) {
  const fixture = datumFixture({ year: true });
  const { plan, datedBasis } = fixture;
  const basis = { ...fixture.basis, skolsalar: { nasta: 3, salar: ['Provsal A', 'Provsal B'].map((name, i) => ({
    id: `sal-${i + 1}`, name, typ: 'Allmän sal', platser, utrustning: [],
  })) } };
  const source = { plan, basis, datedBasis, schoolDuties: plan.teachers.map(t => ({
    ref: t.personId, name: t.displayName, startsOn: '2026-07-01', endsOn: null,
  })) };
  const request = { ...fixture.request, period }, underlag = buildSchemaUnderlag(plan, request, basis);
  const placements = fixture.placements.filter(p => underlag.labels.lessons.some(l => l.id === p.lesson));
  const f = schemaForslag(plan, request, underlag, { ...godkant, status: 'complete', placements, unplaced: [], diagnoses: [], elapsedMs: 0 });
  const input = { ...request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: f.grundFingerprint, placements };
  const bokning = { id: id(101), namn: 'Nationellt prov', undervisning: `undervisning:class_timplan:${id(10)}:2026:prov`,
    mal: { slag: 'klass', ref: id(10) }, datum: dag, startMin: 480, slutMin: 540, tidsval: 'period', salId: null, vakter: [], kontrolleradDatum: dag };
  const varprov = { ...bokning, id: id(102), datum: '2027-02-01', salId: 'sal-2', vakter: [id(21)] };
  const register = { revision: 3, document: { granskad: true, bokningar: [bokning, varprov] }, savedAt: `${dag}T10:00:00Z` };
  return { source, input, f, underlag, register, bokning, varprov };
}

test('nytt höstschema återanvänder frigjord sal, ersätter exakt undervisningstid och utesluter vårens bokning', async () => {
  const { source, input, f, underlag, register, bokning, varprov } = testUnderlag();
  source.datedBasis.classMemberships[0].endsOn = null;
  source.datedBasis.classMemberships.splice(1);
  const originalPass = f.lessons.find(l => l.title === 'Matematik');
  const original = schemaDatumOriginal(f, { lesson: originalPass.id, originalDate: dag });
  const motordatum = [];
  const svar = await planeraNyttSchemaProv(source, input, register, { tidigasteErsattning: dag, validate: async (problem, placements) => {
    motordatum.push(problem.id);
    assert.ok(!JSON.stringify(problem).includes(id(80)));
    // Den verkliga måldagens regelkontroll får här ett syntetiskt hinder för nya tider på provdagen.
    const matematik = new Set(problem.lessons.filter(l => l.teachers.some(teacher => underlag.teacherRefs[teacher] === id(20))).map(l => l.id));
    if (problem.id === `datum-${dag}` && placements.some(p => matematik.has(p.lesson) && p.startMin >= bokning.slutMin)) {
      return { ...godkant, violations: [{ code: 'syntetiskt_hinder', message: 'Boka en senare skoldag.', lessons: [], resources: [] }] };
    }
    return godkant;
  } });
  assert.ok(nyttSchemaProvKomplett(svar));
  assert.equal(svar.dateIssues, 0);
  assert.deepEqual(svar.bokningar, [{ ...bokning, salId: 'sal-1', vakter: [id(20)] }, varprov]);
  assert.deepEqual(register.document.bokningar, [bokning, varprov]);
  assert.deepEqual(svar.result.bokningar.map(p => p.id), [bokning.id]);
  const [ersatt] = svar.result.ersattningar;
  assert.equal(ersatt.lesson, originalPass.id);
  assert.equal(ersatt.originalDate, dag);
  assert.equal(ersatt.date, '2026-11-03');
  assert.equal(ersatt.durationMin, original.length);
  assert.deepEqual(motordatum.slice(-2), [`datum-${dag}`, 'datum-2026-11-03']);
  const projektionsval = { mode: 'intervall', monday: '', from: dag, to: ersatt.date };
  const tillfallen = schemaDatumTillfallen(f, projektionsval, svar.result.ersattningar);
  assert.deepEqual(tillfallen.filter(t => t.key === original.key).map(t => t.date), [ersatt.date]);
  const tidsandringar = schemaDatumTidsandringar(f, [ersatt], [{ lesson: originalPass.id, ref: originalPass.undervisning }]);
  assert.deepEqual(tidsandringar, []);
});

test('för liten sal eller fel i slutkontrollen skriver inga resursval i förslaget', async () => {
  const liten = testUnderlag('ht', 1);
  liten.source.datedBasis.placements.push({ id: id(91), pupilId: id(81), startsOn: '2026-07-01', endsOn: null });
  liten.source.datedBasis.classMemberships.push({ placementId: id(91), pupilId: id(81), classId: id(10), startsOn: '2026-07-01', endsOn: null });
  const ingaSalar = await planeraNyttSchemaProv(liten.source, liten.input, liten.register, { tidigasteErsattning: dag, validate: async () => godkant });
  assert.equal(nyttSchemaProvKomplett(ingaSalar), false);
  assert.deepEqual(ingaSalar.result.bokningar[0].problem, ['sal_saknas']);
  assert.deepEqual(ingaSalar.bokningar, liten.register.document.bokningar);

  const underlag = testUnderlag();
  let anrop = 0;
  const slutFel = await planeraNyttSchemaProv(underlag.source, underlag.input, underlag.register, { tidigasteErsattning: dag, validate: async () => ++anrop === 1 ? godkant
    : { ...godkant, violations: [{ code: 'room_clash', message: 'Syntetiskt fel vid slutkontroll.', lessons: [], resources: [] }] } });
  assert.equal(slutFel.result.bokningar[0].sal.id, 'sal-1');
  assert.equal(nyttSchemaProvKomplett(slutFel), false);
  assert.equal(slutFel.dateIssues, 1);
  assert.deepEqual(slutFel.bokningar, underlag.register.document.bokningar);
});

test('nytt provschema kräver aktuell kalender och deltagarunderlag från rätt skola och läsår', async () => {
  const { source, input, register, bokning, varprov } = testUnderlag();
  const options = { tidigasteErsattning: dag, validate: async () => { assert.fail('Fel källa får inte anropa motorn.'); } };
  for (const fel of [{ plan: { ...source.plan, unitId: id(2) } }, { datedBasis: { ...source.datedBasis, schoolYear: 2027 } },
    { datedBasis: { ...source.datedBasis, complete: false } }]) {
    await assert.rejects(planeraNyttSchemaProv({ ...source, ...fel }, input, register, options), { reason: 'schema_datum_participants_unavailable' });
  }
  await assert.rejects(planeraNyttSchemaProv({ ...source, basis: { ...source.basis, time: { ...source.basis.time, current: false } } }, input, register, options),
    { reason: 'schema_datum_calendar_missing' });
  const utanfor = { ...bokning, datum: '2026-12-31' };
  assert.deepEqual(provForPeriod([bokning, varprov, utanfor], source.basis.time.dates, 'ht'), [bokning, utanfor]);
});
