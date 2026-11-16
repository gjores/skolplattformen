import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag } from './schema-underlag.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
import { parseSchemaDatumAndringar, parseSchemaDatumRequest, parseSchemaDatumSvar, schemaDatumErsatt, schemaDatumNyckel, schemaDatumOriginal, schemaDatumTillfallen, schemaDatumTidsandringar } from './schema-datum.ts';
import { parseSchemaDatedBasis, schemaDatumUnderlag } from './schema-datum-underlag.ts';
const interval = (from, to = from) => ({ mode: 'intervall', monday: '', from, to });
const graph = (day, lesson) => day.problem.lessons.find(l => day.occurrences.get(l.id).lesson.id === lesson);
const clusters = (day, lesson) => graph(day, lesson).groups.flatMap(id => day.problem.groups.find(g => g.id === id).clusters);
const shares = (day, a, b) => clusters(day, a).some(c => clusters(day, b).includes(c));

test('strikt undantagstolkning nekar fel datum, dubbel originalnyckel, främmande fält och falsk kontraktsversion', () => {
  const x = datumFixture(), valid = x.change();
  for (const raw of [[valid, valid], [{ ...valid, originalDate: '2026-02-31' }], [{ ...valid, date: '2026-13-01' }], [{ ...valid, durationMin: 7 }], [{ ...valid, name: 'falskt' }], [{ ...valid, pupilId: x.id(80) }]])
    assert.throws(() => parseSchemaDatumAndringar(raw));
  const request = { ...x.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: x.f.grundFingerprint, placements: x.placements, datedOverrides: [valid], dates: [] };
  assert.equal(parseSchemaDatumRequest(request).datedOverrides[0].lesson, valid.lesson);
  assert.throws(() => parseSchemaDatumRequest({ ...request, contractVersion: 7 }));
});

test('flytt ändrar bara en originalnyckel, ankommer utanför originalintervallet och bevarar alla grundplaceringar', () => {
  const x = datumFixture(), before = structuredClone(x.f), a = x.change('2026-11-17'), changes = schemaDatumErsatt([], a, a);
  assert.equal(schemaDatumTillfallen(x.f, interval('2026-11-03'), changes).some(o => o.lesson.id === a.lesson), false);
  const arrived = schemaDatumTillfallen(x.f, interval('2026-11-17'), changes).filter(o => o.lesson.id === a.lesson);
  assert.equal(arrived.length, 2); assert.equal(new Set(arrived.map(o => o.key)).size, 2);
  assert.equal(arrived.find(o => o.changed).key, `${a.lesson}@2026-11-03`);
  assert.equal(arrived.find(o => !o.changed).key, `${a.lesson}@2026-11-17`);
  assert.deepEqual(x.f, before);
  const restored = schemaDatumErsatt(changes, a, null); assert.deepEqual(restored, []);
  assert.equal(schemaDatumTillfallen(x.f, interval('2026-11-03'), restored).some(o => o.key === schemaDatumNyckel(a)), true);
  assert.deepEqual(schemaDatumTillfallen(x.f, interval('2026-11-01', '2026-12-01'), changes), []);
});

test('kortat tillfälle behåller sin faktiska längd och en senare ändring av längd eller grunddag ogiltigförklarar undantaget', () => {
  const x = datumFixture(), l = x.of('Franska');
  x.f.trims = [{ lesson: l.id, term: 'ht', fixedMin: 0, extraCount: 1, extraMin: 5, occasions: [{ date: '2026-11-03', minutes: l.durationMin - 5 }] }];
  const original = schemaDatumOriginal(x.f, { lesson: l.id, originalDate: '2026-11-03' }); assert.equal(original.length, 5);
  const a = x.change('2026-11-04', { durationMin: 5 });
  assert.equal(schemaDatumTillfallen(x.f, interval('2026-11-04'), [a]).find(o => o.lesson.id === l.id).length, 5);
  assert.throws(() => schemaDatumTillfallen(x.f, interval('2026-11-04'), [{ ...a, durationMin: l.durationMin }]), e => e.reason === 'schema_datum_duration_changed');
  x.f.trims = []; assert.throws(() => schemaDatumTillfallen(x.f, interval('2026-11-04'), [a]), e => e.reason === 'schema_datum_duration_changed');
  l.day = 2; assert.throws(() => schemaDatumTillfallen(x.f, interval('2026-11-04'), [a]), e => e.reason === 'schema_datum_original_missing');
});

test('lov, helg, klassens undervisningsfria dag och datum utanför verklig kalender avvisas', () => {
  const x = datumFixture();
  for (const date of ['2026-11-09', '2026-11-07', '2027-07-01']) assert.throws(() => schemaDatumTillfallen(x.f, interval('2026-11-02'), [x.change(date)]), e => e.reason === 'schema_datum_date_invalid');
  const day = x.f.time.calendar.days.find(d => d.date === '2026-11-04'); day.classes[x.of('Franska').classIds[0]] = { schoolDay: false, reason: 'Friluftsdag' };
  assert.throws(() => schemaDatumTillfallen(x.f, interval('2026-11-04'), [x.change('2026-11-04')]), e => e.reason === 'schema_datum_date_invalid');
});

test('flytt mellan terminer redovisar båda tidsavvikelserna utan ändrad timplan eller namnmatchning', () => {
  const x = datumFixture(), a = x.change('2027-01-12'), p = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [a]);
  const deltas = schemaDatumTidsandringar(x.f, [a], p.sources), ref = p.sources.find(s => s.lesson === a.lesson).ref;
  assert.deepEqual(deltas.map(t => [t.ref, t.term, t.deltaMin]), [[ref, 'ht', -a.durationMin], [ref, 'vt', a.durationMin]]);
  for (const d of deltas) assert.equal(d.needMin, x.f.teachings.find(t => t.ref === ref).terms.find(t => t.term === d.term).needMin);
  assert.ok(deltas.some(d => d.deviation));
  assert.throws(() => schemaDatumTidsandringar(x.f, [a], []), e => e.reason === 'schema_datum_source_unknown');
});

test('exakta start-/slutdagar och placeringsrelation avgör dagens kluster, utan elev-ID i motorproblem', () => {
  const x = datumFixture(), days = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [x.change('2026-11-02')], ['2026-11-16']).days;
  const first = days.find(d => d.date === '2026-11-02'), last = days.find(d => d.date === '2026-11-16');
  assert.ok(shares(first, x.of('Matematik').id, x.of('Franska').id));
  assert.equal(shares(first, x.of('Historia').id, x.of('Franska').id), false);
  // Samma veckoundervisning har nu deltagaren i klass 2; den daterade projektionen ändrar inte passidentiteten.
  const movedLater = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [x.change('2026-11-16')]).days.find(d => d.date === '2026-11-16');
  assert.ok(shares(movedLater, x.of('Historia').id, x.of('Franska').id));
  assert.equal(shares(movedLater, x.of('Matematik').id, x.of('Franska').id), false);
  assert.ok(last); const text = JSON.stringify(days.map(d => d.problem));
  assert.ok(!text.includes('73111600') && !text.includes('Franska') && !text.includes('pupilId') && !text.includes('classMemberships'));
  x.datedBasis.placements[0].endsOn = '2026-11-16';
  const ended = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [], ['2026-11-17']).days[0];
  assert.equal(ended.problem.clusters.length, 0); assert.ok(graph(ended, x.of('Franska').id));
});

test('en grupp utan deltagare just den dagen behåller samma undervisning och tomma kluster, utan fallback till hela klassen', () => {
  const x = datumFixture({ block: true }); x.datedBasis.memberships[0].endsOn = '2026-11-16';
  const prepared = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [], ['2026-11-17']), day = prepared.days[0], group = graph(day, x.of('Franska').id);
  assert.ok(group); assert.equal(group.activity, x.underlag.problem.lessons.find(l => l.id === x.of('Franska').id).activity);
  assert.deepEqual(clusters(day, x.of('Franska').id), []);
  assert.equal(day.occurrences.get(group.id).lesson.id, x.of('Franska').id);
  assert.ok(prepared.sources.find(s => s.lesson === x.of('Franska').id).ref.startsWith('undervisning:'));
  const rebuilt = buildSchemaUnderlag(x.plan, x.request, { ...x.basis, members: { ...x.basis.members, memberships: [] } });
  assert.ok(rebuilt.labels.activities.some(a => a.ref.startsWith('valbart-block:')), 'fixturen ska visa varför dagsvis ombyggnad skulle byta undervisningsidentitet');
});

test('gruppmedlemskap gäller exakt start- och slutdagen och en gammal klassrelation återupplivas inte av ny placering', () => {
  const x = datumFixture(); x.datedBasis.memberships[0].startsOn = '2026-11-03'; x.datedBasis.memberships[0].endsOn = '2026-11-03';
  const days = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [], ['2026-11-02', '2026-11-03', '2026-11-04']).days;
  for (const day of days) assert.equal(day.problem.groups.find(g => g.id === 'grupp-3').clusters.length > 0, day.date === '2026-11-03');
  x.datedBasis.placements[0].endsOn = '2026-11-16';
  x.datedBasis.placements.push({ id: x.id(91), pupilId: x.id(80), startsOn: '2026-11-17', endsOn: '2027-06-30' });
  const day = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [], ['2026-11-17']).days[0];
  assert.deepEqual(day.problem.groups.find(g => g.id === 'grupp-2').clusters, []);
});

test('klientens kontrollsvar binds till original/mål och kan inte dölja terminsavvikelse eller peka ut okända pass', () => {
  const x = datumFixture(), a = x.change('2027-01-12'), prepared = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, [a]);
  const request = { ...x.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: x.f.grundFingerprint, placements: x.placements, datedOverrides: [a], dates: [] };
  const valid = { contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: x.f.grundFingerprint, fingerprint: x.f.fingerprint, datedOverrides: [a], checkedDates: prepared.days.map(d => d.date),
    violations: [], total: 0, timeChanges: schemaDatumTidsandringar(x.f, [a], prepared.sources) };
  assert.deepEqual(parseSchemaDatumSvar(valid, request).datedOverrides, [a]);
  for (const mutate of [r => { r.checkedDates.pop(); }, r => { r.datedOverrides[0].originalDate = '2026-11-10'; }, r => { r.timeChanges[0].deviation = !r.timeChanges[0].deviation; },
    r => { r.timeChanges.push(r.timeChanges[0]); }, r => { r.violations = [{ date: a.date, code: 'fake', message: 'Fel', lessons: ['pass-999999'], occurrences: ['pass-999999@2026-11-03'] }]; r.total = 1; }]) {
    const changed = structuredClone(valid); mutate(changed); assert.throws(() => parseSchemaDatumSvar(changed, request));
  }
});

test('ofullständig läsrätt, fel kuvert och bruten placeringsreferens kan inte ge en grön datumkontroll', () => {
  const x = datumFixture(); assert.deepEqual(parseSchemaDatedBasis(x.datedBasis, x.request), x.datedBasis);
  assert.throws(() => parseSchemaDatedBasis({ ...x.datedBasis, unitId: x.id(2) }, x.request));
  assert.throws(() => parseSchemaDatedBasis({ ...x.datedBasis, classMemberships: [{ ...x.datedBasis.classMemberships[0], placementId: x.id(999) }] }, x.request));
  assert.throws(() => schemaDatumUnderlag(x.plan, x.underlag, x.f, { ...x.datedBasis, complete: false }, [x.change()]), e => e.reason === 'schema_datum_participants_unavailable');
});

test('använd extrapersonal mappas från teacherRefs, inte från en filtrerad listposition', () => {
  const x = datumFixture(), used = x.id(102), unused = x.id(101), activity = { id: 'aktivitet-1', typId: 'apt', typ: 'APT', name: 'APT', classRefs: [], groupRefs: [], teacherRefs: [used], rooms: [], durationMin: 30,
    veckor: { typ: 'alla' }, visibleFor: 'personal', margin: null, tid: { typ: 'fast', day: 1, startMin: 480 } };
  const request = { ...x.request, villkor: { ...x.request.villkor, aktiviteter: [activity], egna: [...x.request.villkor.egna, { slag: 'larare', ref: used, typ: 'sparrad', days: [1], startMin: 480, endMin: 540 }] } };
  const basis = { ...x.basis, personer: [{ ref: unused, name: 'Oanvänd extraperson' }, { ref: used, name: 'Använd extraperson' }] }, u = buildSchemaUnderlag(x.plan, request, basis);
  const added = u.labels.lessons.find(l => l.egenAktivitet), placements = [...x.placements, { lesson: added.id, day: 1, startMin: 480, room: null }];
  const f = schemaForslag(x.plan, request, u, { status: 'complete', placements, unplaced: [], diagnoses: [], elapsedMs: 0, metrics: { studentGapMin: 0, teacherGapMin: 0 } });
  const day = schemaDatumUnderlag(x.plan, u, f, x.datedBasis, [], ['2026-11-03']).days[0];
  assert.ok(u.teacherRefs[added.teacherIds[0]] === used); assert.ok(graph(day, added.id).allowed.every(iv => iv.start_min >= 540 || iv.end_min <= 480));
});
