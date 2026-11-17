import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salsattningPlaceringar, tilldelaSalar } from './schema-salsattning.ts';

const rooms = [{ id: 'sal-1', name: 'A101' }, { id: 'sal-2', name: 'A102' }, { id: 'sal-7', name: 'Labb 1' }];
const p = (n, extra = {}) => ({ id: `pass-${n}`, title: `Ämne ${n}`, day: 0, startMin: 480, durationMin: 60, roomIds: ['sal-1', 'sal-2'], roomId: null, marginMin: 0, marginBeforeMin: 0, term: null, ...extra });
const val = (extra = {}) => ({ rooms, egna: [], lasta: new Set(), datum: new Set(), ...extra });
const till = r => Object.fromEntries(r.tilldelade.map(t => [t.lesson, t.till]));

test('pass med tid får en ledig tillåten sal; när salarna inte räcker namnges hindret och vilka som upptar salarna', () => {
  const lessons = [p(1), p(2), p(3), p(4, { startMin: 540 })], r = tilldelaSalar(lessons, val());
  assert.deepEqual(till(r), { 'pass-1': 'sal-1', 'pass-2': 'sal-2', 'pass-4': 'sal-1' });
  assert.deepEqual(r.hinder, [{ lesson: 'pass-3', title: 'Ämne 3', day: 0, startMin: 480, text: 'Ingen tillåten sal är ledig måndag 08:00: A101 (upptagen av Ämne 1); A102 (upptagen av Ämne 2).' }]);
  // Ingen dag eller starttid ändras.
  const efter = salsattningPlaceringar(lessons, r.tilldelade);
  assert.deepEqual(efter.map(x => [x.lesson, x.day, x.startMin]), lessons.map(l => [l.id, l.day, l.startMin]));
  assert.deepEqual(efter.map(x => x.room), ['sal-1', 'sal-2', null, 'sal-1']);
});
test('det mest begränsade passet väljs först, och en sal som få andra behöver väljs före en eftertraktad', () => {
  // pass-1 kan ligga i båda, pass-2 bara i sal-1: pass-2 får sal-1 trots att det kommer sist.
  assert.deepEqual(till(tilldelaSalar([p(1), p(2, { roomIds: ['sal-1'] })], val())), { 'pass-1': 'sal-2', 'pass-2': 'sal-1' });
  // Tre pass samtidigt med två salar var: pass-1 tar Labb 1, som inget annat pass behöver, så att A101 och A102 räcker till de andra.
  const r = tilldelaSalar([p(1, { roomIds: ['sal-1', 'sal-7'] }), p(2), p(3)], val());
  assert.deepEqual(till(r), { 'pass-1': 'sal-7', 'pass-2': 'sal-1', 'pass-3': 'sal-2' }); assert.deepEqual(r.hinder, []);
});
test('pass som redan har tillåten sal, låsta pass, pass med datumändring och pass utan tid eller salbehov rörs inte', () => {
  const lessons = [p(1, { roomId: 'sal-1' }), p(2, { roomId: null }), p(3), p(4, { day: null, startMin: null }), p(5, { roomIds: [] }), p(6, { startMin: 600 })];
  const r = tilldelaSalar(lessons, val({ lasta: new Set(['pass-2']), datum: new Set(['pass-6']) }));
  assert.deepEqual(till(r), { 'pass-3': 'sal-2' });
  assert.deepEqual(r.ororda, { medSal: 1, lasta: 1, datum: 1, utanTid: 1, utanSalbehov: 1 });
  assert.equal(salsattningPlaceringar(lessons, r.tilldelade).find(x => x.lesson === 'pass-2').room, null);
});
test('en sal som inte längre är tillåten byts ut och redovisas med tidigare sal; pass i olika terminer kan dela sal och tid', () => {
  const r = tilldelaSalar([p(1, { roomId: 'sal-7' }), p(2, { roomIds: ['sal-1'], term: 'ht' }), p(3, { roomIds: ['sal-1'], term: 'vt' })], val());
  assert.deepEqual(r.tilldelade.map(t => [t.lesson, t.fran, t.till]), [['pass-1', 'sal-7', 'sal-2'], ['pass-2', null, 'sal-1'], ['pass-3', null, 'sal-1']]);
  assert.deepEqual(r.hinder, []);
});
test('pass vars sal kontrollen underkänt får en ny sal om en är ledig, annars står salen kvar och hindret namnges', () => {
  // Kontrollens ifyllning har lagt tre pass i sal-1 samtidigt. Två salar finns: två pass får var sin, det tredje redovisas som hinder.
  const lessons = [p(1, { roomId: 'sal-1' }), p(2, { roomId: 'sal-1' }), p(3, { roomId: 'sal-1' })], krockar = new Set(['pass-1', 'pass-2', 'pass-3']);
  const r = tilldelaSalar(lessons, val({ krockar }));
  assert.deepEqual(r.tilldelade.map(t => [t.lesson, t.fran, t.till]), [['pass-1', 'sal-1', 'sal-1'], ['pass-2', 'sal-1', 'sal-2']]);
  assert.equal(r.hinder.length, 1); assert.equal(r.hinder[0].lesson, 'pass-3');
  assert.deepEqual(salsattningPlaceringar(lessons, r.tilldelade).map(x => x.room), ['sal-1', 'sal-2', 'sal-1'], 'passet med hinder behåller sin sal tills användaren löser det');
  assert.equal(tilldelaSalar(lessons, val()).tilldelade.length, 0, 'utan underkänd sal rörs inget');
});
test('salens spärrade och tillåtna tid och passens marginaler respekteras', () => {
  const egna = [{ slag: 'sal', ref: 'A101', typ: 'sparrad', days: [0], startMin: 480, endMin: 600 }, { slag: 'sal', ref: 'A102', typ: 'tillaten', days: [1], startMin: 480, endMin: 720 }];
  const sparr = tilldelaSalar([p(1)], val({ egna }));
  assert.deepEqual(till(sparr), {}); assert.match(sparr.hinder[0].text, /A101 \(spärrad eller utanför salens tillåtna tid\); A102 \(spärrad eller utanför salens tillåtna tid\)/u);
  assert.deepEqual(till(tilldelaSalar([p(1, { day: 1 })], val({ egna }))), { 'pass-1': 'sal-1' });
  // Marginal efter pass-1 gör att pass-2 direkt efter inte kan ta samma sal.
  const marginal = tilldelaSalar([p(1, { roomIds: ['sal-1'], marginMin: 15 }), p(2, { roomIds: ['sal-1'], startMin: 540 })], val());
  assert.deepEqual(till(marginal), { 'pass-1': 'sal-1' }); assert.equal(marginal.hinder[0].lesson, 'pass-2');
});
