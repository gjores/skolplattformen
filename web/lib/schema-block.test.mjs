import { test } from 'node:test';
import assert from 'node:assert/strict';
import { blockPass, checkSchemaBlock, nastaBlockId, parseSchemaBlock, schemaBlock } from './schema-block.ts';

// Syntetiskt underlag: fyra undervisningar med två pass var.
const labels = {
  activities: [{ id: 'behov-1', ref: 'u:spa', title: 'Spanska 3' }, { id: 'behov-2', ref: 'u:tys', title: 'Tyska 3' }, { id: 'behov-3', ref: 'u:fra', title: 'Franska 3' }, { id: 'behov-4', ref: 'u:ma', title: 'Matematik 1c' }],
  lessons: [1, 2, 3, 4].flatMap(a => [1, 2].map(k => ({ id: `pass-${(a - 1) * 2 + k}`, activity: `behov-${a}`, title: ['Spanska 3', 'Tyska 3', 'Franska 3', 'Matematik 1c'][a - 1], term: null, classIds: [`grupp-${a}`], teacherIds: [] }))),
  teachers: [{ id: 'larare-1', name: 'Provlärare 1' }, { id: 'larare-2', name: 'Provlärare 2' }, { id: 'larare-3', name: 'Provlärare 3' }],
  classes: [{ id: 'grupp-1', name: 'Spanskgruppen' }, { id: 'grupp-2', name: 'Tyskgruppen' }, { id: 'grupp-3', name: 'Franskgruppen' }, { id: 'grupp-4', name: 'TE27' }],
  names: { 'kluster-1': 'TE27: Spanskgruppen', 'kluster-2': 'TE27: Tyskgruppen', 'kluster-3': 'TE27: Franskgruppen', 'kluster-4': 'TE27' },
};
const lesson = (n, teacher, group, extra = {}) => ({ id: `pass-${n}`, activity: `behov-${Math.ceil(n / 2)}`, duration_min: 60, teachers: [teacher], groups: [group], ...extra });
const problem = (over = {}) => ({
  groups: [{ id: 'grupp-1', clusters: ['kluster-1'] }, { id: 'grupp-2', clusters: ['kluster-2'] }, { id: 'grupp-3', clusters: ['kluster-3'] }, { id: 'grupp-4', clusters: ['kluster-1', 'kluster-2', 'kluster-3'] }],
  lessons: [lesson(1, 'larare-1', 'grupp-1'), lesson(2, 'larare-1', 'grupp-1'), lesson(3, 'larare-2', 'grupp-2'), lesson(4, 'larare-2', 'grupp-2'), lesson(5, 'larare-3', 'grupp-3'), lesson(6, 'larare-3', 'grupp-3'),
    lesson(7, 'larare-3', 'grupp-4'), lesson(8, 'larare-3', 'grupp-4')].map(l => ({ ...l, ...over[l.id] })),
});
const m = (ref, pass, term = null) => ({ ref, term, pass });
const sprak = { id: 'block-1', namn: 'Språkblock', medlemmar: [m('u:spa', 1), m('u:tys', 1)] };

test('ett block utan hinder blir motorns koppling och passen behåller sina egna lärare och grupper', () => {
  const r = schemaBlock([sprak], problem(), labels);
  assert.deepEqual(r.links, [{ kind: 'simultaneous', lessons: ['pass-1', 'pass-3'] }]);
  assert.deepEqual(r.status, [{ id: 'block-1', namn: 'Språkblock', status: 'aktivt', lessons: ['pass-1', 'pass-3'], grupp: [], text: '2 pass börjar samtidigt.' }]);
  assert.equal(blockPass(labels, m('u:spa', 2)), 'pass-2'); assert.equal(blockPass(labels, m('u:spa', 3)), null);
});
test('samma lärare eller samma elever i två pass är hinder som namnges; blocket ger ingen rätt till dubbelbokning', () => {
  const larare = schemaBlock([{ ...sprak, medlemmar: [m('u:fra', 1), m('u:ma', 1)] }], problem(), labels);
  assert.deepEqual(larare.links, []); assert.equal(larare.status[0].status, 'hinder');
  assert.match(larare.status[0].text, /^Provlärare 3 undervisar både Franska 3 \(Franskgruppen\) och Matematik 1c \(TE27\)\./u);
  assert.match(larare.status[0].text, /Samma elever går i Franska 3 \(Franskgruppen\) och Matematik 1c \(TE27\) \(TE27: Franskgruppen\)\./u);
  assert.match(larare.status[0].text, /används inte förrän hindret är löst\.$/u);
});
test('olika längd är tillåtet och redovisas; olika terminer är hinder', () => {
  const r = schemaBlock([sprak], problem({ 'pass-3': { duration_min: 50 } }), labels);
  assert.equal(r.status[0].status, 'aktivt'); assert.equal(r.status[0].text, '2 pass börjar samtidigt. Passen har olika längd (50, 60 min) och slutar olika.'); assert.equal(r.links.length, 1);
  assert.match(schemaBlock([sprak], problem({ 'pass-3': { periods: ['vt'] } }), labels).status[0].text, /olika terminer/u);
});
test('ett block vars pass inte längre finns är inaktuellt och skickas inte', () => {
  const r = schemaBlock([{ ...sprak, medlemmar: [m('u:spa', 3), m('u:tys', 1), m('u:borta', 1)] }], problem(), labels);
  assert.deepEqual(r.links, []); assert.equal(r.status[0].status, 'inaktuellt');
  assert.equal(r.status[0].text, 'Passen finns inte längre: Spanska 3, pass 3; en undervisning som inte finns i underlaget, pass 1. Antalet lektioner kan ha ändrats. Välj passen på nytt.');
});
test('block som delar pass slås ihop till en samtidighetsgrupp och prövas tillsammans', () => {
  const r = schemaBlock([sprak, { id: 'block-2', namn: 'Franska med', medlemmar: [m('u:tys', 1), m('u:fra', 1)] }, { id: 'block-3', namn: 'Fristående', medlemmar: [m('u:spa', 2), m('u:tys', 2)] }], problem(), labels);
  assert.deepEqual(r.links.map(l => [...l.lessons].sort()), [['pass-1', 'pass-3', 'pass-5'], ['pass-2', 'pass-4']]);
  assert.deepEqual(r.status.map(s => [s.id, s.status, s.grupp]), [['block-1', 'aktivt', ['block-2']], ['block-2', 'aktivt', ['block-1']], ['block-3', 'aktivt', []]]);
  assert.match(r.status[0].text, /delar pass med Franska med och läggs som en samtidighetsgrupp/u);
  // Ett hinder i gruppen stoppar hela gruppen, inte andra block.
  const hinder = schemaBlock([sprak, { id: 'block-2', namn: 'Med matte', medlemmar: [m('u:tys', 1), m('u:ma', 1)] }, { id: 'block-3', namn: 'Fristående', medlemmar: [m('u:spa', 2), m('u:tys', 2)] }], problem(), labels);
  assert.deepEqual(hinder.status.map(s => s.status), ['hinder', 'hinder', 'aktivt']); assert.equal(hinder.links.length, 1);
});
test('tolkning och rimlighetskontroll', () => {
  assert.deepEqual(parseSchemaBlock(JSON.parse(JSON.stringify([sprak]))), [sprak]);
  assert.throws(() => parseSchemaBlock([{ ...sprak, extra: 1 }])); assert.throws(() => parseSchemaBlock([sprak, sprak])); assert.throws(() => parseSchemaBlock([{ ...sprak, id: 'block-0' }]));
  assert.throws(() => parseSchemaBlock([{ ...sprak, medlemmar: [m('u:spa', 0), m('u:tys', 1)] }])); assert.throws(() => parseSchemaBlock([{ ...sprak, medlemmar: [m('u:spa', 1, 'ar'), m('u:tys', 1)] }]));
  assert.deepEqual(checkSchemaBlock([sprak]), []); assert.deepEqual(checkSchemaBlock(undefined), []);
  assert.match(checkSchemaBlock([{ ...sprak, medlemmar: [m('u:spa', 1)] }])[0], /2–20 pass/u);
  assert.match(checkSchemaBlock([{ ...sprak, medlemmar: [m('u:spa', 1), m('u:spa', 2)] }])[0], /samma undervisning/u);
  assert.match(checkSchemaBlock([sprak, { ...sprak, id: 'block-2', namn: 'språkblock' }])[0], /olika namn/u);
  assert.equal(nastaBlockId([sprak, { ...sprak, id: 'block-7' }]), 'block-8'); assert.equal(nastaBlockId(undefined), 'block-1');
});
