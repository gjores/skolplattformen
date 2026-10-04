import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with { type: 'json' };
import { analyseProgramplan } from './programplan-analysis.ts';

const program = code => artifact.programs.find(p => p.code === code);
const ref = (code, points = 100) => ({ subjectCode: code.slice(0, 4), subjectVersion: 1, itemCode: code, points });
const input = (refs, extra = {}) => ({ program: program('HU25'), orientationCode: program('HU25').orientations[0].code, refs, startedOn: '2026-08-17', sourceFetched: '2026-09-05', ...extra });
const ids = a => a.issues.map(i => i.id);

test('över ramen är fel men stoppar inget, och felen sorteras först', () => {
  const a = analyseProgramplan(input([ref('A1'), ref('A2'), ref('A3'), ref('A4')]));
  assert.equal(a.counts.fel, 1);
  assert.equal(a.issues[0].id, 'specialization-over');
  assert.match(a.issues[0].detail, /400 poäng valda, högst 300/);
});

test('outnyttjat utrymme är fel eftersom eleverna inte når programmets poäng, inom ramen är uppfyllt', () => {
  const under = analyseProgramplan(input([ref('A1')]));
  assert.ok(ids(under).includes('specialization-under'));
  assert.equal(under.counts.fel, 1);
  const full = analyseProgramplan(input([ref('A1'), ref('A2'), ref('A3')]));
  assert.ok(ids(full).includes('specialization-ok'));
  assert.ok(!ids(full).includes('specialization-under'));
});

test('saknat startdatum, alternativ och saknade nivåer flaggas', () => {
  const a = analyseProgramplan(input([], { startedOn: null }));
  assert.ok(ids(a).includes('start-missing'));
  assert.ok(ids(a).includes('alternatives-foundation'));
  assert.ok(a.issues.some(i => i.id.startsWith('levels-programmeSpecific')));
});

test('yrkesprogram får ingen gissad gräns utan en kontrollpunkt', () => {
  const a = analyseProgramplan({ program: program('VO25'), orientationCode: null, refs: [ref('A1')], startedOn: '2026-08-17', sourceFetched: null });
  assert.ok(ids(a).includes('total-unverified'));
  assert.equal(a.counts.fel, 0);
});

test('saknad inriktning är fel', () => {
  const a = analyseProgramplan(input([], { orientationCode: null }));
  assert.ok(ids(a).includes('orientation-missing'));
});
