import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

// RED deliberately reports missing domain functions, rather than failing module loading.
const apl = existsSync(new URL('./apl-plan.ts', import.meta.url)) ? await import('./apl-plan.ts') : {};
const call = (name, ...args) => {
  assert.equal(typeof apl[name], 'function', `APL-domänen saknar funktionen ${name}`);
  return apl[name](...args);
};
const invalid = fn => assert.throws(fn, error => error.code === 'invalid_apl_plan');
const uid = n => `5a110000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const keyA = 'programmeSpecific:BYGG:1:BYGG1000X';
const keyB = 'programmeSpecific:HUSB:1:HUSB1000X';
const row = key => ({ key, name: key === keyA ? 'Bygg' : 'Husbyggnad', levelName: 'Nivå 1', points: 100,
  part: 'programmeSpecific', pointTerms: [50, 50, 0, 0, 0, 0], rowKind: 'fixed' });
const context = () => ({ organizerId: uid(1), copyReview: [], plan: {
  id: uid(2), offeringId: uid(3), unitId: uid(4), schoolName: 'Syntetisk skola', version: 1, revision: 7,
  status: 'utkast', series: { id: uid(5), name: 'Bygg A – extra matematik', revision: 0 }, nameAtCreation: 'Bygg A',
  source: { planId: uid(6), offeringId: uid(3), version: 2, revision: 3, status: 'faststalld',
    catalogId: `sha256:${'a'.repeat(64)}`, startedOn: '2026-08-01', educationRevision: 2,
    education: { name: 'Byggprogrammet', cohort: '2026', programCode: 'BA25', orientationCode: null } },
  currentSource: { planId: uid(6), version: 2, revision: 3, status: 'faststalld' }, rows: [row(keyA), row(keyB)],
  hours: { [keyA]: [400, 400, null, null, null, null], [keyB]: [400, 400, null, null, null, null] },
  canPlan: true, archived: false, sourceChanged: false,
}, program: { code: 'BA25', version: 1, category: 'VOCATIONAL_PROGRAM', startDate: '2025-07-01',
  endDate: null, canceledDate: null, sourceSupported: true } });
const period = (weeks = 15) => ({ id: uid(10), name: 'APL på hösten', startsOn: '2026-08-03', endsOn: '2026-11-15',
  schoolYear: 2026, extent: { basis: 'whole_weeks', weeks, reviewed: true, reviewNote: 'Granskat helt veckounderlag.' },
  contents: [{ rowKey: keyA, description: 'Arbetsmoment A' }, { rowKey: keyB, description: 'Arbetsmoment B' }],
  allocations: [{ rowKey: keyA, termIndex: 0, gutMinutes: weeks * 23 * 60 }] });
const plan = () => ({ contractVersion: 'structured_v1', educationForm: 'school_based', classification: 'complete', periods: [period()] });
const save = () => ({ contractVersion: 'structured_v1', action: 'save', commandId: uid(20), planId: uid(2), expectedRevision: 7, plan: plan(), copyReviewResolutions: [] });
const confirm = hash => ({ contractVersion: 'structured_v1', action: 'confirm', commandId: uid(21), planId: uid(2), expectedRevision: 7,
  expectedContentHash: hash, comment: 'Jag har granskat förläggningen.' });
const confirmation = hash => ({ id: uid(30), planId: uid(2), unitId: uid(4), actorId: uid(31), assignmentId: uid(32),
  actorName: 'Syntetisk rektor', at: '2026-10-16T09:15:00.000Z', revision: 7, contentHash: hash, comment: 'Granskad.' });
const hasIssue = (result, code) => result.issues.some(issue => issue.code === code);

test('APL-källprofil följer samma exakta datumgränser som besluts-SQL utan att lita på sin egen flagga', () => {
  const vocational = context().program;
  for (const [started, expected] of [[null, false], ['2025-06-30', false], ['2025-07-01', true],
    ['2028-07-01', true], ['2028-07-02', false], ['2029-08-01', false]])
    assert.equal(call('aplSourceProfileSupported', vocational, started), expected);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, sourceSupported: false }, '2027-08-01'), true);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, code: 'SA25', category: 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION' }, '2029-08-01'), true);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, code: 'ZZ25' }, '2027-08-01'), false);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, startDate: null }, '2027-08-01'), false);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, endDate: '2027-08-01' }, '2027-08-01'), true);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, endDate: '2027-08-01' }, '2027-08-02'), false);
  assert.equal(call('aplSourceProfileSupported', { ...vocational, canceledDate: '2027-08-01' }, '2027-08-01'), false);
});

test('15 granskade hela veckor ger 345 GUT-timmar inom totalen, 14 ger kompletteringsbehov', () => {
  const result = call('projectAplPlan', context(), plan());
  assert.equal(result.ruleProfile, 'gy25_school_vocational_v1');
  assert.equal(result.readyForConfirmation, true);
  assert.equal(result.declaredWholeWeeks, 15);
  assert.equal(result.reviewedWholeWeeks, 15);
  assert.equal(result.expectedGutMinutes, 20700);
  assert.equal(result.allocatedGutMinutes, 20700);
  assert.equal(result.totalMinutes, 96000);
  assert.equal(result.schoolMinutes, 75300);
  assert.equal(result.totalMinutes, result.schoolMinutes + result.allocatedGutMinutes);
  const short = plan(); short.periods = [period(14)];
  const next = call('projectAplPlan', context(), short);
  assert.equal(next.readyForConfirmation, false); assert(hasIssue(next, 'minimum_weeks'));
});

test('explicit utbildningsform krävs; lärling, okänd form och blandvecka får ingen schablon', () => {
  for (const form of ['apprenticeship', 'unknown']) {
    const value = { ...plan(), educationForm: form }, result = call('projectAplPlan', context(), value);
    assert.equal(result.readyForConfirmation, false); assert.equal(result.expectedGutMinutes, null);
    assert.equal(result.reviewedWholeWeeks, null); assert.equal(result.ruleProfile, null);
  }
  const value = plan(); value.periods[0].extent = { basis: 'mixed_weeks', weeks: null, reviewed: false, reviewNote: 'Halva dagar på arbetsplats.' };
  assert.deepEqual(call('parseAplPlan', value), value);
  const result = call('projectAplPlan', context(), value);
  assert.equal(result.expectedGutMinutes, null); assert.equal(result.readyForConfirmation, false);
  assert(hasIssue(result, 'extent_needs_review'));
  invalid(() => call('parseAplPlan', { ...plan(), educationForm: undefined }));
});

test('hela veckor utan rektorsgranskat underlag räcker inte', () => {
  const value = plan(); value.periods[0].extent.reviewed = false;
  const result = call('projectAplPlan', context(), value);
  assert.equal(result.declaredWholeWeeks, 15); assert.equal(result.reviewedWholeWeeks, 0);
  assert.equal(result.readyForConfirmation, false); assert.equal(result.schoolMinutes, null);
  assert(hasIssue(result, 'extent_needs_review'));
});

test('fem veckor kan fördelas 6 000 + 900 minuter utan dubblerade innehållskopplingar', () => {
  const value = plan(), p = period(5); p.allocations = [{ rowKey: keyA, termIndex: 0, gutMinutes: 6000 }, { rowKey: keyB, termIndex: 0, gutMinutes: 900 }];
  value.periods = [p]; const result = call('projectAplPlan', context(), value);
  assert.equal(result.expectedGutMinutes, 6900); assert.equal(result.allocatedGutMinutes, 6900);
  assert.equal(result.periods[0].allocatedGutMinutes, 6900); assert.equal(result.declaredWholeWeeks, 5);
  p.allocations[1].gutMinutes = 901;
  assert(hasIssue(call('projectAplPlan', context(), value), 'period_allocation_mismatch'));
});

test('690 + 690 minuter bevarar 11 h 30 min per nivå utan avrundning', () => {
  const value = plan(); value.periods = [period(1)];
  value.periods[0].allocations = [{ rowKey: keyA, termIndex: 0, gutMinutes: 690 }, { rowKey: keyB, termIndex: 0, gutMinutes: 690 }];
  const result = call('projectAplPlan', context(), value);
  assert.equal(result.allocatedGutMinutes, 1380);
  assert.deepEqual(call('splitAplMinutes', 690), { hours: 11, minutes: 30 });
  invalid(() => call('splitAplMinutes', 690.5));
});

test('allokeringsskrivning nekar nulltotal, för liten total och inaktiv term även för noll', () => {
  for (const total of [null, 344]) {
    const ctx = context(); ctx.plan.hours[keyA][0] = total;
    assert.throws(() => call('validateAplAllocationWrite', ctx, plan()), error =>
      error.code === 'invalid_apl_plan' && ['allocation_without_total', 'allocation_exceeds_total'].includes(error.reason));
  }
  const value = plan(); value.periods[0].allocations = [{ rowKey: keyA, termIndex: 2, gutMinutes: 0 }];
  assert.throws(() => call('validateAplAllocationWrite', context(), value), error => error.reason === 'inactive_term');
  const noAllocation = plan(); noAllocation.periods[0].allocations = [];
  const unknownTotal = context(); unknownTotal.plan.hours[keyA][0] = null;
  assert.doesNotThrow(() => call('validateAplAllocationWrite', unknownTotal, noAllocation));
});

test('sammanlagd APL i en cell, inte bara varje period, skyddar sparad total', () => {
  const value = plan(); const second = period(3); second.id = uid(11); second.startsOn = '2026-11-16'; second.endsOn = '2026-12-06';
  value.periods.push(second);
  assert.throws(() => call('validateAplAllocationWrite', context(), value), error => error.reason === 'allocation_exceeds_total');
  const ctx = context(); ctx.plan.hours[keyA][0] = 500;
  assert.doesNotThrow(() => call('validateAplAllocationWrite', ctx, value));
});

test('saknade, negativa, decimala och inaktiva totaltimmar kan inte läsas som giltig matris', () => {
  for (const mutate of [ctx => delete ctx.plan.hours[keyA], ctx => ctx.plan.hours[keyA][0] = -1,
    ctx => ctx.plan.hours[keyA][0] = 345.5, ctx => ctx.plan.hours[keyA][2] = 0]) {
    const ctx = context(); mutate(ctx); invalid(() => call('projectAplPlan', ctx, plan()));
  }
});

test('legacy, tom strukturerad plan och oklassificerad total har skilda betydelser', () => {
  const legacy = call('projectAplPlan', context(), null);
  assert.equal(legacy.state, 'legacy'); assert.equal(legacy.allocatedGutMinutes, null); assert.equal(legacy.schoolMinutes, null);
  const empty = call('projectAplPlan', context(), { ...plan(), periods: [] });
  assert.equal(empty.state, 'structured'); assert.equal(empty.allocatedGutMinutes, 0); assert.equal(empty.readyForConfirmation, false);
  const unclassified = call('projectAplPlan', context(), { ...plan(), classification: 'unreviewed' });
  assert.equal(unclassified.schoolMinutes, null); assert(hasIssue(unclassified, 'classification_unreviewed'));
});

test('datumförlängning ändrar aldrig uppgivet veckotal eller GUT', () => {
  const value = plan(), before = call('projectAplPlan', context(), value);
  value.periods[0].endsOn = '2026-12-31'; const after = call('projectAplPlan', context(), value);
  assert.equal(before.declaredWholeWeeks, after.declaredWholeWeeks);
  assert.equal(before.expectedGutMinutes, after.expectedGutMinutes);
});

test('ISO-veckoövre gräns hanterar måndag, söndag, årsskifte och enstaka dag utan att ge granskat besked', () => {
  for (const [start, end, expected] of [['2026-10-12', '2026-10-18', 1], ['2026-10-18', '2026-10-19', 2],
    ['2026-12-28', '2027-01-03', 1], ['2026-12-31', '2027-01-04', 2], ['2026-10-15', '2026-10-15', 1]]) {
    assert.equal(call('aplIsoWeekUpperBound', start, end), expected);
  }
  invalid(() => call('aplIsoWeekUpperBound', '2026-02-29', '2026-03-02'));
  const value = plan(); value.periods[0].startsOn = '2026-10-15'; value.periods[0].endsOn = '2026-10-15';
  assert(hasIssue(call('projectAplPlan', context(), value), 'weeks_exceed_calendar_bound'));
});

test('datum måste vara giltiga och ordnade, ofullständig period får sparas utan fördelning', () => {
  for (const change of [{ startsOn: '2026-02-30' }, { endsOn: '2026-01-01' }, { schoolYear: 2101 }]) {
    const value = plan(); Object.assign(value.periods[0], change); invalid(() => call('parseAplPlan', value));
  }
  const value = plan(); Object.assign(value.periods[0], { name: '', startsOn: null, endsOn: null, schoolYear: null, contents: [], allocations: [],
    extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' } });
  assert.deepEqual(call('parseAplPlan', value), value);
  assert.doesNotThrow(() => call('validateAplAllocationWrite', context(), value));
  assert(hasIssue(call('projectAplPlan', context(), value), 'incomplete_period'));
});

test('explicit terminsuppdelning kan korsa nyår och läsår utan att skapa extra veckor', () => {
  for (const [start, end, schoolYear, indices] of [['2026-12-21', '2027-01-24', 2026, [0, 1]], ['2027-06-21', '2027-07-25', 2026, [1, 2]]]) {
    const ctx = context(); ctx.plan.rows[0].pointTerms = [25, 25, 25, 25, 0, 0]; ctx.plan.hours[keyA] = [400, 400, 400, 400, null, null];
    const value = plan(); value.periods = [{ ...period(5), startsOn: start, endsOn: end, schoolYear,
      allocations: indices.map((termIndex, i) => ({ rowKey: keyA, termIndex, gutMinutes: i ? 2760 : 4140 })) }];
    const result = call('projectAplPlan', ctx, value);
    assert(!hasIssue(result, 'allocation_outside_period')); assert.equal(result.declaredWholeWeeks, 5);
    value.periods[0].allocations[0].termIndex = 3;
    assert(hasIssue(call('projectAplPlan', ctx, value), 'allocation_outside_period'));
  }
});

test('vårstart återanvänder frysta sex terminer och kräver uttrycklig granskning före start', () => {
  const ctx = context(); ctx.plan.source.startedOn = '2027-01-15';
  const value = plan(); Object.assign(value.periods[0], { startsOn: '2027-01-18', endsOn: '2027-05-02', schoolYear: 2026 });
  value.periods[0].allocations[0].termIndex = 1;
  const result = call('projectAplPlan', ctx, value);
  assert.equal(result.periods[0].termIndices[0], 1); assert(hasIssue(result, 'spring_start_review'));
  assert.equal(result.readyForConfirmation, true); assert.equal(result.issues.find(i => i.code === 'spring_start_review').level, 'review');
  value.periods[0].startsOn = '2027-01-01'; assert(hasIssue(call('projectAplPlan', ctx, value), 'period_before_start'));
});

test('överlappande perioder och explicit fel läsår blockerar granskad total', () => {
  const value = plan(); value.periods[0] = period(5); value.periods.push({ ...period(5), id: uid(11) });
  const result = call('projectAplPlan', context(), value);
  assert(hasIssue(result, 'overlapping_periods')); assert.equal(result.reviewedWholeWeeks, null); assert.equal(result.schoolMinutes, null);
  value.periods = [period()]; value.periods[0].schoolYear = 2027;
  assert(hasIssue(call('projectAplPlan', context(), value), 'school_year_mismatch'));
});

test('valbart block kan spara innehåll men räknas inte som verifierad ämnesnivå', () => {
  const ctx = context(), block = { ...row(keyB), key: 'block:iv1', rowKind: 'block', part: 'individualChoice' };
  ctx.plan.rows.push(block); ctx.plan.hours[block.key] = [100, 100, null, null, null, null];
  const value = plan(); value.periods[0].contents.push({ rowKey: block.key, description: 'Ämnesval saknas.' });
  assert.doesNotThrow(() => call('validateAplAllocationWrite', ctx, value));
  assert(hasIssue(call('projectAplPlan', ctx, value), 'unresolved_content'));
  const old = { ...row(keyB), key: 'meta:individualChoice', rowKind: 'fixed', part: 'individualChoice' };
  ctx.plan.rows.push(old); ctx.plan.hours[old.key] = [100, 100, null, null, null, null];
  value.periods[0].contents = [{ rowKey: old.key, description: 'Äldre ospecificerat individuellt val.' }]; value.periods[0].allocations = [];
  assert(hasIssue(call('projectAplPlan', ctx, value), 'unresolved_content'));
});

test('separata korta perioder får inte dubbelräkna samma kalendervecka, inte heller dolda delmängder', () => {
  const value = plan(); value.periods = Array.from({ length: 15 }, (_, i) => {
    const day = `2026-08-${String(i + 3).padStart(2, '0')}`;
    return { ...period(1), id: uid(100 + i), startsOn: day, endsOn: day };
  });
  let result = call('projectAplPlan', context(), value);
  assert.equal(result.readyForConfirmation, false); assert.equal(result.reviewedWholeWeeks, null);
  assert(hasIssue(result, 'whole_week_capacity_conflict'));
  value.periods = [{ ...period(1), startsOn: '2026-08-03', endsOn: '2026-08-04' },
    { ...period(1), id: uid(11), startsOn: '2026-08-05', endsOn: '2026-08-06' },
    { ...period(13), id: uid(12), startsOn: '2026-08-10', endsOn: '2026-12-31' }];
  result = call('projectAplPlan', context(), value);
  assert(hasIssue(result, 'whole_week_capacity_conflict')); assert.equal(result.readyForConfirmation, false);
  // A shared edge week does not always mean duplicate time: enough distinct weeks still permits manual review.
  value.periods = [{ ...period(5), startsOn: '2026-08-03', endsOn: '2026-09-08' },
    { ...period(10), id: uid(11), startsOn: '2026-09-09', endsOn: '2026-11-22' }];
  result = call('projectAplPlan', context(), value);
  assert(!hasIssue(result, 'whole_week_capacity_conflict')); assert.equal(result.readyForConfirmation, true);
});

test('kopieringsbortfall bevaras separat, blockerar tills uttryckligt hanterat och binds i rektorshash', async () => {
  const ctx = context(), original = plan(), review = { id: uid(60), sourcePlanId: uid(61), sourceVersion: 2,
    sourcePeriodId: uid(62), sourcePeriodName: 'Tidigare APL', reason: 'missing_row',
    contents: [{ rowKey: 'specialization:MATE:1:MATE1000X', description: 'Tidigare moment' }],
    allocations: [{ rowKey: 'specialization:MATE:1:MATE1000X', termIndex: 2, gutMinutes: 690 }], resolution: null };
  ctx.copyReview = [review]; const before = structuredClone(ctx), hash = await call('aplContentHash', ctx, original);
  assert.doesNotThrow(() => call('validateAplAllocationWrite', ctx, original));
  assert(hasIssue(call('projectAplPlan', ctx, original), 'copy_review_pending'));
  const resolution = { id: review.id, note: 'Momentet ersatt och tiden omfördelad i den nya perioden.' };
  call('validateAplCopyReviewResolutions', ctx.copyReview, [resolution]);
  assert.deepEqual(call('aplMutationEffect', original, original, 'save', [resolution]),
    { changed: true, revisionDelta: 1, auditAction: 'apl_plan_saved' });
  for (const resolutions of [[{ ...resolution, id: uid(99) }], [resolution, resolution], [{ ...resolution, note: '' }]])
    invalid(() => call('validateAplCopyReviewResolutions', ctx.copyReview, resolutions));
  assert.deepEqual(ctx, before);
  review.resolution = { actorId: uid(31), assignmentId: uid(32), at: '2026-10-16T10:00:00.000Z', note: resolution.note };
  invalid(() => call('validateAplCopyReviewResolutions', ctx.copyReview, [resolution]));
  assert.equal(call('projectAplPlan', ctx, original).readyForConfirmation, true);
  assert.notEqual(await call('aplContentHash', ctx, original), hash);
  assert.equal(ctx.copyReview[0].allocations[0].gutMinutes, 690);
  invalid(() => call('parseAplCommand', { ...save(), copyReview: ctx.copyReview }));
});

test('befintliga gränser för källa, Gy25, programkategori och yrkesprov 2028 består', () => {
  for (const mutate of [ctx => ctx.program.sourceSupported = false, ctx => ctx.program.category = 'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION',
    ctx => ctx.plan.source.startedOn = '2025-06-30', ctx => ctx.plan.source.startedOn = '2028-07-02',
    ctx => ctx.program.endDate = '2026-07-31', ctx => ctx.program.canceledDate = '2026-08-01',
    ctx => ctx.program.startDate = null]) {
    const ctx = context(); mutate(ctx); const result = call('projectAplPlan', ctx, plan());
    assert.equal(result.ruleProfile, null); assert.equal(result.readyForConfirmation, false); assert.equal(result.expectedGutMinutes, null);
  }
  const ctx = context(); ctx.program.code = 'VO25'; invalid(() => call('projectAplPlan', ctx, plan()));
});

test('strikta kontrakt nekar extra fält, dubbletter, negativa/decimala minuter och ej kopplat innehåll', () => {
  for (const mutate of [p => p.role = 'rektor', p => p.periods.push(structuredClone(p.periods[0])),
    p => p.periods[0].contents.push(structuredClone(p.periods[0].contents[0])),
    p => p.periods[0].allocations.push(structuredClone(p.periods[0].allocations[0])),
    p => p.periods[0].allocations[0].gutMinutes = -1, p => p.periods[0].allocations[0].gutMinutes = 1.5,
    p => p.periods[0].extent.weeks = 0, p => p.periods[0].extent.weeks = 1.5,
    p => p.periods[0].contents = [], p => p.periods[0].extent.basis = 'days_divided_by_five']) {
    const value = plan(); mutate(value); invalid(() => call('parseAplPlan', value));
  }
});

test('hostila getters, symboler, prototyper och glesa listor avvisas utan körning', () => {
  const getter = plan(); Object.defineProperty(getter, 'educationForm', { get() { throw new Error('Getter får aldrig köras'); }, enumerable: true });
  invalid(() => call('parseAplPlan', getter));
  const symbol = plan(); symbol[Symbol('private')] = 'secret'; invalid(() => call('parseAplPlan', symbol));
  const proto = Object.assign(Object.create({ role: 'rektor' }), plan()); invalid(() => call('parseAplPlan', proto));
  const sparse = plan(); Reflect.deleteProperty(sparse.periods[0].contents, '0'); invalid(() => call('parseAplPlan', sparse));
});

test('spar- och bekräftelsekommandon accepterar aldrig klientvalt mandat eller eget beslut', () => {
  assert.deepEqual(call('parseAplCommand', save()), save());
  const input = confirm(`sha256:${'b'.repeat(64)}`); assert.deepEqual(call('parseAplCommand', input), input);
  for (const change of [{ actorId: uid(31) }, { role: 'rektor' }, { expectedRevision: 2147483647 }, { action: 'approve' },
    { contractVersion: 'legacy' }, { planId: 'bad' }, { organizerId: uid(1) }]) invalid(() => call('parseAplCommand', { ...save(), ...change }));
  assert.deepEqual(call('parseAplReadRequest', { planId: uid(2) }), { planId: uid(2) });
  assert.deepEqual(call('parseAplStatusRequest', { command: save() }), { command: save() });
  invalid(() => call('parseAplStatusRequest', { commandId: uid(20) }));
});

test('kanonisering har en explicit portabel UTF-8-vektor för SQL', async () => {
  const values = ['APL-å', 23, null, true, false, ['é', 690]], canonical = 'a6:s6:APL-åi23;ntfa2:s2:éi690;';
  assert.equal(call('aplCanonicalSerialize', values), canonical);
  assert.equal(await call('aplHashCanonical', values), 'sha256:b54eabd4a0ee5d100187de548a9cde8fa8402391e02ef338914515e14a62230c');
  assert.equal(await call('aplHashCanonical', values), `sha256:${createHash('sha256').update(canonical).digest('hex')}`);
});

test('rektorshash bevaras vid enbart status, revision och planbenämning men ändras med underlaget', async () => {
  const ctx = context(), value = plan(), before = await call('aplContentHash', ctx, value);
  assert.equal(before, 'sha256:712b6f8b5c78706128cda90bcb56d3d5c9fa11329d38f5073f3c9d574a371907');
  const renamed = structuredClone(ctx); Object.assign(renamed.plan, { revision: 99, status: 'faststalld', schoolName: 'Nytt visningsnamn' });
  Object.assign(renamed.plan.series, { name: 'Ny benämning', revision: 9 }); renamed.plan.nameAtCreation = 'Annat namn';
  Object.assign(renamed.plan.source, { revision: 99, status: 'ersatt', educationRevision: 8 }); renamed.plan.source.education.name = 'Namn';
  renamed.plan.rows.forEach(r => { r.name = 'Namn'; r.levelName = 'Nivånamn'; });
  assert.equal(await call('aplContentHash', renamed, value), before);
  for (const mutate of [c => c.plan.hours[keyA][0]++, c => c.plan.source.catalogId = `sha256:${'c'.repeat(64)}`,
    c => c.plan.rows[0].pointTerms = [60, 40, 0, 0, 0, 0], c => c.plan.unitId = uid(50), c => c.plan.series.id = uid(50)]) {
    const changed = context(); mutate(changed); assert.notEqual(await call('aplContentHash', changed, value), before);
  }
  const changed = plan(); changed.periods[0].contents[0].description = 'Andra arbetsmoment';
  assert.notEqual(await call('aplContentHash', ctx, changed), before);
});

test('listordning är semantiskt stabil och ursprungsobjekten muteras inte', async () => {
  const ctx = context(), value = plan(); value.periods = [period(5), { ...period(5), id: uid(11), startsOn: '2026-11-16', endsOn: '2026-12-20' }];
  value.periods[0].allocations = [{ rowKey: keyA, termIndex: 0, gutMinutes: 6000 }, { rowKey: keyB, termIndex: 0, gutMinutes: 900 }];
  const original = structuredClone({ ctx, value }), before = await call('aplContentHash', ctx, value);
  const reordered = structuredClone(value); reordered.periods.reverse(); reordered.periods.forEach(p => { p.contents.reverse(); p.allocations.reverse(); });
  const reversedCtx = structuredClone(ctx); reversedCtx.plan.rows.reverse();
  assert.equal(await call('aplContentHash', reversedCtx, reordered), before);
  assert.deepEqual({ ctx, value }, original);
  assert.deepEqual(call('aplMutationEffect', value, reordered, 'save'), { changed: false, revisionDelta: 0, auditAction: 'apl_plan_unchanged' });
  reordered.periods[0].name = 'Annan period';
  assert.deepEqual(call('aplMutationEffect', value, reordered, 'save'), { changed: true, revisionDelta: 1, auditAction: 'apl_plan_saved' });
  assert.deepEqual(call('aplMutationEffect', value, value, 'confirm'), { changed: true, revisionDelta: 1, auditAction: 'apl_placement_confirmed' });
});

test('historisk rektorshändelse har oförändrad aktör, uppdrag och revision medan aktualitet följer innehåll', async () => {
  const ctx = context(), value = plan(), hash = await call('aplContentHash', ctx, value), event = confirmation(hash), before = structuredClone(event);
  assert.equal(await call('aplConfirmationCurrent', ctx, value, event), true);
  ctx.plan.revision++; ctx.plan.status = 'forslag'; assert.equal(await call('aplConfirmationCurrent', ctx, value, event), true);
  value.periods[0].extent.reviewNote = 'Ändrad omfattningsgrund'; assert.equal(await call('aplConfirmationCurrent', ctx, value, event), false);
  assert.deepEqual(event, before);
  const foreign = { ...event, unitId: uid(99) }; assert.equal(await call('aplConfirmationCurrent', ctx, plan(), foreign), false);
});

test('läsning tar uttryckliga serverkapabiliteter och bevarar legacy utan påhittad form', async () => {
  const hash = await call('aplContentHash', context(), null), value = { contractVersion: 'structured_v1', organizerId: uid(1), program: context().program, planId: uid(2), revision: 7,
    plan: null, copyReview: [], contentHash: hash, confirmations: [], capabilities: { canSave: false, canConfirm: false } };
  assert.deepEqual(call('parseAplReadReply', value, { planId: uid(2) }), value);
  invalid(() => call('parseAplReadReply', { ...value, capabilities: { role: 'rektor' } }, { planId: uid(2) }));
  invalid(() => call('parseAplReadReply', { ...value, planId: uid(3) }, { planId: uid(2) }));
  invalid(() => call('parseAplReadReply', { ...value, confirmations: [confirmation(hash)] }, { planId: uid(2) }));
  assert.deepEqual(await call('verifyAplReadReply', value, context()), value);
  await assert.rejects(() => call('verifyAplReadReply', { ...value, contentHash: `sha256:${'f'.repeat(64)}` }, context()), error => error.code === 'invalid_apl_plan');
  for (const change of [{ organizerId: uid(99) }, { program: { ...value.program, sourceSupported: false } }])
    await assert.rejects(() => call('verifyAplReadReply', { ...value, ...change }, context()), error => error.code === 'invalid_apl_plan');
});

test('requestbundna kvitton och status kontrollerar identitet, effekt och frysta svar', async () => {
  const input = save(), hash = await call('aplContentHash', context(), input.plan);
  const detail = { contractVersion: 'structured_v1', organizerId: uid(1), program: context().program, planId: uid(2), revision: 8, plan: input.plan, copyReview: [], contentHash: hash,
    confirmations: [], capabilities: { canSave: true, canConfirm: true } };
  const result = { receipt: { contractVersion: 'structured_v1', commandId: uid(20), planId: uid(2), action: 'save', revision: 8,
    changed: true, replayed: false, contentHash: hash, confirmationId: null }, detail };
  assert.deepEqual(call('parseAplCommandReply', result, input), result);
  assert.deepEqual(call('parseAplStatusReply', { state: 'completed', result: { ...result, receipt: { ...result.receipt, replayed: true } } }, { command: input }).state, 'completed');
  assert.deepEqual(call('parseAplStatusReply', { state: 'not_found', result: null }, { command: input }), { state: 'not_found', result: null });
  for (const mutate of [r => r.receipt.commandId = uid(90), r => r.receipt.revision = 9, r => r.detail.revision = 9,
    r => r.receipt.confirmationId = uid(30), r => r.detail.plan.educationForm = 'unknown', r => r.receipt.role = 'rektor',
    r => r.detail.confirmations.push({ ...confirmation(hash), revision: 8 })]) {
    const changed = structuredClone(result); mutate(changed); invalid(() => call('parseAplCommandReply', changed, input));
  }
  const unchanged = { receipt: { ...result.receipt, revision: 7, changed: false }, detail: { ...detail, revision: 7 } };
  assert.equal(call('parseAplCommandReply', unchanged, input).receipt.revision, 7);
  const confirmedInput = confirm(hash), confirmed = { receipt: { ...result.receipt, commandId: uid(21), action: 'confirm', confirmationId: uid(30) },
    detail: { ...detail, confirmations: [{ ...confirmation(hash), revision: 8, comment: confirmedInput.comment }] } };
  assert.deepEqual(call('parseAplCommandReply', confirmed, confirmedInput), confirmed);
  for (const mutate of [r => r.receipt.changed = false, r => r.detail.confirmations[0].comment = 'Annan kommentar',
    r => r.detail.confirmations[0].contentHash = `sha256:${'f'.repeat(64)}`]) {
    const changed = structuredClone(confirmed); mutate(changed); invalid(() => call('parseAplCommandReply', changed, confirmedInput));
  }
});

test('privat SQL-envelope håller fryst katalog och timmatris separat från klientkontraktet', async () => {
  const ctx = context(), hash = await call('aplContentHash', ctx, plan()), detail = { contractVersion: 'structured_v1', organizerId: uid(1), program: context().program, planId: uid(2), revision: 7,
    plan: plan(), copyReview: [], contentHash: hash, confirmations: [], capabilities: { canSave: true, canConfirm: true } };
  const { rows: _rows, sourceChanged: _changed, ...rawGym } = ctx.plan;
  const envelope = { contractVersion: 'apl_sql_v1', basis: { organizerId: uid(1), copyReview: [],
    gymTimplan: { ...rawGym, catalog: { frozen: 'validated by server projection, never by this outer parser' }, currentSourceBasis: null } }, result: detail };
  const parser = value => call('parseAplReadReply', value, { planId: uid(2) });
  assert.deepEqual(call('parseAplSqlEnvelope', envelope, parser), envelope);
  invalid(() => call('parseAplSqlEnvelope', { ...envelope, basis: null }, parser));
  invalid(() => call('parseAplSqlEnvelope', { ...envelope, contractVersion: 'legacy' }, parser));
  const missing = { contractVersion: 'apl_sql_v1', basis: null, result: { state: 'not_found', result: null } };
  assert.deepEqual(call('parseAplSqlEnvelope', missing, value => call('parseAplStatusReply', value, { command: save() })), missing);
  invalid(() => call('parseAplSqlEnvelope', { ...missing, basis: envelope.basis }, value => call('parseAplStatusReply', value, { command: save() })));
});

test('korrekt hash räcker inte för att läsa omöjliga aktiva APL-allokeringar', async () => {
  for (const change of [ctx => { ctx.plan.hours[keyA][0] = 344; }, ctx => { ctx.plan.hours[keyA][0] = null; }]) {
    const ctx = context(); change(ctx); const value = plan();
    const detail = { contractVersion: 'structured_v1', organizerId: uid(1), program: context().program, planId: uid(2), revision: 7, plan: value, copyReview: [],
      contentHash: await call('aplContentHash', ctx, value), confirmations: [], capabilities: { canSave: true, canConfirm: true } };
    await assert.rejects(() => call('verifyAplReadReply', detail, ctx), error => ['allocation_exceeds_total', 'allocation_without_total'].includes(error.reason));
    value.periods[0].allocations = []; detail.contentHash = await call('aplContentHash', ctx, value);
    assert.deepEqual(await call('verifyAplReadReply', detail, ctx), detail);
  }
  const value = plan(); value.periods[0].contents.push({ rowKey: 'specialization:MATE:1:MATE1000X', description: 'Finns inte i källan.' });
  assert.throws(() => call('validateAplAllocationWrite', context(), value), error => error.reason === 'unknown_content');
  const ctx = context(), detail = { contractVersion: 'structured_v1', organizerId: uid(1), program: context().program, planId: uid(2), revision: 7, plan: value, copyReview: [],
    contentHash: await call('aplContentHash', ctx, value), confirmations: [], capabilities: { canSave: true, canConfirm: true } };
  await assert.rejects(() => call('verifyAplReadReply', detail, ctx), error => error.reason === 'unknown_content');
});

export { context as aplTestContext, plan as aplTestPlan };

test('term-first draft persists without invented dates, names, subjects or minutes', () => {
  for (let index = 0; index <= 5; index++) {
    const value = plan(); value.periods = [{ ...period(), name: '', plannedTermIndex: index,
      startsOn: null, endsOn: null, schoolYear: null, contents: [], allocations: [],
      extent: { basis: 'unknown', weeks: null, reviewed: false, reviewNote: '' } }];
    assert.deepEqual(call('parseAplPlan', value), value);
    call('validateAplAllocationWrite', context(), value);
    assert.equal(call('projectAplPlan', context(), value).readyForConfirmation, false);
    assert.deepEqual(call('aplPlanCanonicalPayload', value)[3][0][8], ['planned_term_v1', index]);
  }
});

test('optional planned term rejects null, undefined, non-integers, accessors and extra keys', () => {
  for (const index of [null, undefined, -1, 6, 0.5, '2', true, NaN, Infinity]) {
    const value = plan(); value.periods[0].plannedTermIndex = index;
    invalid(() => call('parseAplPlan', value));
  }
  const value = plan(); let accessed = false;
  Object.defineProperty(value.periods[0], 'plannedTermIndex', { get() { accessed = true; return 2; } });
  invalid(() => call('parseAplPlan', value)); assert.equal(accessed, false);
  const extra = plan(); Object.assign(extra.periods[0], { plannedTermIndex: 2, invented: 1 });
  invalid(() => call('parseAplPlan', extra));
});

test('pre-extension canonical and content hashes remain exact; explicit term changes require confirmation', async () => {
  const value = plan(), parsed = call('parseAplPlan', value);
  assert.equal(Object.hasOwn(parsed.periods[0], 'plannedTermIndex'), false);
  assert.equal(call('aplPlanCanonicalPayload', parsed)[3][0].length, 8);
  assert.equal(await call('aplHashCanonical', call('aplPlanCanonicalPayload', parsed)), 'sha256:24d0575aafd111a9e5703d8686269ee0ca92ca709c94d237500f985c84f30d60');
  const oldHash = await call('aplContentHash', context(), parsed);
  assert.equal(oldHash, 'sha256:712b6f8b5c78706128cda90bcb56d3d5c9fa11329d38f5073f3c9d574a371907');
  parsed.periods[0].plannedTermIndex = 0;
  const explicitHash = await call('aplContentHash', context(), parsed);
  assert.notEqual(explicitHash, oldHash);
  parsed.periods[0].plannedTermIndex = 1;
  assert.notEqual(await call('aplContentHash', context(), parsed), explicitHash);
  assert.equal(call('projectAplPlan', context(), parsed).readyForConfirmation, true, 'intent does not introduce a new date rule');
});

test('separate APL commands bind their own counter and the approved timetable revision', () => {
  for (const action of ['save', 'confirm', 'review']) {
    const q = { ...(action === 'save' ? save() : confirm(`sha256:${'a'.repeat(64)}`)), action,
      revisionScope: 'apl', expectedTimplanRevision: 42 };
    assert.deepEqual(call('parseAplCommand', q), q);
    for (const field of ['revisionScope', 'expectedTimplanRevision']) {
      const broken = { ...q }; delete broken[field]; invalid(() => call('parseAplCommand', broken));
    }
    invalid(() => call('parseAplCommand', { ...q, expectedTimplanRevision: -1 }));
    invalid(() => call('parseAplCommand', { ...q, revisionScope: 'timplan' }));
  }
  invalid(() => call('parseAplCommand', { ...confirm(`sha256:${'a'.repeat(64)}`), action: 'review' }));
});

test('separate read permits APL revision past frozen timetable while rejecting a changed timetable reference', async () => {
  const ctx = context(); ctx.plan.status = 'faststalld'; ctx.plan.canPlan = false;
  const value = plan(), contentHash = await call('aplContentHash', ctx, value);
  const rector = { ...confirmation(contentHash), revision: 15 };
  const review = { ...rector, id: uid(40), actorName: 'Syntetisk huvudman', revision: 16,
    timplanRevision: ctx.plan.revision, rectorConfirmationId: rector.id };
  const detail = { contractVersion: 'structured_v1', revisionScope: 'apl', timplanRevision: ctx.plan.revision,
    planId: ctx.plan.id, revision: 16, organizerId: ctx.organizerId, program: ctx.program, plan: value,
    copyReview: [], contentHash, confirmations: [rector], reviews: [review], capabilities: { canSave: false, canConfirm: false, canReview: true } };
  assert.deepEqual(await call('verifyAplReadReply', detail, ctx), detail);
  await assert.rejects(() => call('verifyAplReadReply', { ...detail, timplanRevision: 6 }, ctx));
  invalid(() => call('parseAplReadReply', { ...detail, reviews: [{ ...review, rectorConfirmationId: uid(99) }] }, { planId: ctx.plan.id }));
  invalid(() => call('parseAplReadReply', { ...detail, reviews: [{ ...review, contentHash: `sha256:${'b'.repeat(64)}` }] }, { planId: ctx.plan.id }));
});

test('organizer review receipt must bind its exact event, content, comment and timetable revision', async () => {
  const ctx = context(), value = plan(), contentHash = await call('aplContentHash', ctx, value);
  const rector = confirmation(contentHash), review = { ...rector, id: uid(40), revision: 8,
    timplanRevision: 42, rectorConfirmationId: rector.id, comment: 'Separat huvudmannagranskning.' };
  const q = { ...confirm(contentHash), action: 'review', revisionScope: 'apl', expectedTimplanRevision: 42, comment: review.comment };
  const reply = { receipt: { contractVersion: 'structured_v1', commandId: q.commandId, planId: q.planId,
    action: 'review', revision: 8, changed: true, replayed: false, contentHash, confirmationId: null, reviewId: review.id },
    detail: { contractVersion: 'structured_v1', revisionScope: 'apl', timplanRevision: 42, planId: q.planId,
      revision: 8, organizerId: ctx.organizerId, program: ctx.program, plan: value, copyReview: [], contentHash,
      confirmations: [rector], reviews: [review], capabilities: { canSave: false, canConfirm: false, canReview: true } } };
  assert.deepEqual(call('parseAplCommandReply', reply, q), reply);
  for (const mutate of [r => r.receipt.reviewId = uid(99), r => r.detail.reviews[0].timplanRevision = 41,
    r => r.detail.reviews[0].comment = 'Annat', r => r.receipt.confirmationId = rector.id]) {
    const broken = structuredClone(reply); mutate(broken); invalid(() => call('parseAplCommandReply', broken, q));
  }
});

const bygg = (await import('node:fs')).readFileSync(new URL('./syllabus-central/BYGG-1.json', import.meta.url), 'utf8');
const byggLevel = JSON.parse(bygg).levels.find(l => l.code === 'BYGG1000X');
const centralIndex = JSON.parse((await import('node:fs')).readFileSync(new URL('./syllabus-central.index.json', import.meta.url), 'utf8'));
const pick = (n = 2) => byggLevel.sections.flatMap(s => s.items.map(i => ({ itemKey: i.key, heading: s.heading, text: i.text }))).slice(0, n);
const withCentral = (extra = {}) => { const value = plan();
  value.periods[0].contents[0] = { ...value.periods[0].contents[0], central: { catalogId: centralIndex.catalogId, items: pick() }, otherContent: 'Säkerhetsgenomgång med handledare.', ...extra };
  return value; };

test('centralt innehåll och övrigt innehåll tolkas och påverkar hash, utan att ändra gamla poster', async () => {
  const old = call('parseAplPlan', plan()), next = call('parseAplPlan', withCentral());
  assert.deepEqual(next.periods[0].contents[1], old.periods[0].contents[1]);
  assert.deepEqual(call('aplContentHashEntry', old.periods[0].contents[0]), [keyA, 'Arbetsmoment A']);
  const entry = call('aplContentHashEntry', next.periods[0].contents[0]);
  assert.equal(entry[2][0], 'apl_content_detail_v1');
  assert.deepEqual(entry[2][2].map(i => i[0]), [...pick().map(i => i.itemKey)].sort());
  assert.equal(await call('aplContentHash', context(), old), 'sha256:712b6f8b5c78706128cda90bcb56d3d5c9fa11329d38f5073f3c9d574a371907');
  const hash = await call('aplContentHash', context(), next);
  assert.notEqual(hash, await call('aplContentHash', context(), old));
  const reordered = withCentral(); reordered.periods[0].contents[0].central.items.reverse();
  assert.equal(await call('aplContentHash', context(), call('parseAplPlan', reordered)), hash, 'punktordning påverkar inte hash');
  const onlyOther = plan(); onlyOther.periods[0].contents[0].otherContent = 'Övrigt.';
  assert.notEqual(await call('aplContentHash', context(), call('parseAplPlan', onlyOther)), await call('aplContentHash', context(), old));
  assert.equal(call('aplMutationEffect', old, next, 'save').changed, true);
});

test('val av centralt innehåll nekar tomma, dubblerade, felformade och nivålösa poster', () => {
  invalid(() => call('parseAplPlan', withCentral({ otherContent: '' })));
  invalid(() => call('parseAplPlan', withCentral({ central: { catalogId: centralIndex.catalogId, items: [] } })));
  invalid(() => call('parseAplPlan', withCentral({ central: { catalogId: centralIndex.catalogId, items: [pick(1)[0], pick(1)[0]] } })));
  invalid(() => call('parseAplPlan', withCentral({ central: { catalogId: 'sha256:x', items: pick() } })));
  invalid(() => call('parseAplPlan', withCentral({ central: { catalogId: centralIndex.catalogId, items: [{ ...pick(1)[0], itemKey: 'A'.repeat(32) }] } })));
  invalid(() => call('parseAplPlan', withCentral({ central: { catalogId: centralIndex.catalogId, items: [{ ...pick(1)[0], text: ' mellanslag' }] } })));
  invalid(() => call('parseAplPlan', withCentral({ central: { catalogId: centralIndex.catalogId, items: pick(), extra: 1 } })));
  invalid(() => call('parseAplPlan', withCentral({ unknown: 1 })));
  const block = withCentral(); block.periods[0].contents[0].rowKey = 'block:extra'; block.periods[0].allocations = [];
  assert.throws(() => call('parseAplPlan', block));
});
