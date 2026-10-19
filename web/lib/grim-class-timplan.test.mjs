import { test } from 'node:test';
import assert from 'node:assert/strict';
import { grimClassColumn, parseGrimClassCreateReply, parseGrimClassCreateRequest, parseGrimClassLinkReply, parseGrimClassLinkRequest,
  parseGrimClassUnderlag } from './grim-class-timplan.ts';

const uid = n => `51a30000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const series = { id: uid(5), name: 'Grundfördelning', revision: 0 };
const link = (extra = {}) => ({ planId: uid(1), series, version: 1, status: 'faststalld', columnId: 'ak7', revision: 0, ...extra });
const underlag = (extra = {}) => ({ plan: { id: uid(1), offeringId: uid(2), unitId: uid(3), schoolName: 'Syntetisk skola', educationName: 'GR 7–9', kind: 'grundskola', series,
  version: 1, status: 'faststalld', revision: 2 }, schoolYear: 2026, columns: [{ id: 'ak7', label: 'Åk 7' }, { id: 'ak8', label: 'Åk 8' }], canManage: true, blockers: [],
  classes: [{ id: uid(10), name: '7A', startYear: 2026, link: link(), candidate: null }, { id: uid(11), name: '8B', startYear: 2026, link: null, candidate: link({ columnId: 'ak8' }) }],
  legacyRows: [{ className: '9C', columnId: 'ak9', revision: 0 }], ...extra });
const linkRequest = (extra = {}) => ({ commandId: uid(40), classId: uid(10), planId: uid(1), expectedPlanRevision: 2, columnId: 'ak7', expectedLinkRevision: null, previousPlanId: null, ...extra });

test('kolumn: GR ak1–ak9 och IM vecka; Gy-kolumner och okända värden nekas', () => {
  for (const c of ['ak1', 'ak9', 'vecka']) assert.equal(grimClassColumn(c), c);
  for (const c of ['ar1', 'ak0', 'ak10', 'Vecka', '', null]) assert.throws(() => grimClassColumn(c));
});

test('underlaget tolkas strikt och klassens koppling och kandidat hålls isär', () => {
  const parsed = parseGrimClassUnderlag(underlag(), { planId: uid(1) });
  assert.equal(parsed.classes[0].link.columnId, 'ak7'); assert.equal(parsed.classes[1].candidate.columnId, 'ak8');
  assert.throws(() => parseGrimClassUnderlag(underlag(), { planId: uid(9) }));
  assert.throws(() => parseGrimClassUnderlag({ ...underlag(), extra: 1 }, { planId: uid(1) }));
  const both = underlag(); both.classes[0].candidate = link(); assert.throws(() => parseGrimClassUnderlag(both, { planId: uid(1) }));
  const wrongYear = underlag(); wrongYear.classes[0].startYear = 2025; assert.throws(() => parseGrimClassUnderlag(wrongYear, { planId: uid(1) }));
  const outside = underlag(); outside.classes[0].link = link({ columnId: 'ak9' }); assert.throws(() => parseGrimClassUnderlag(outside, { planId: uid(1) }));
});

test('namnrad med samma namn som en klass och hantering utan fastställd plan nekas', () => {
  assert.throws(() => parseGrimClassUnderlag(underlag({ legacyRows: [{ className: '7A', columnId: 'ak7', revision: 0 }] }), { planId: uid(1) }));
  const draft = underlag(); draft.plan.status = 'utkast'; assert.throws(() => parseGrimClassUnderlag(draft, { planId: uid(1) }));
  assert.throws(() => parseGrimClassUnderlag(underlag({ schoolYear: null, classes: [] }), { planId: uid(1) }));
  assert.equal(parseGrimClassUnderlag(underlag({ schoolYear: null, classes: [], canManage: false, blockers: ['Utbildningen saknar ett giltigt läsår.'] }), { planId: uid(1) }).schoolYear, null);
});

test('IM har exakt kolumnen vecka; GR saknar vecka', () => {
  const im = underlag({ columns: [{ id: 'vecka', label: 'Per vecka' }], classes: [], legacyRows: [] }); im.plan.kind = 'introduktionsprogram';
  assert.equal(parseGrimClassUnderlag(im, { planId: uid(1) }).columns[0].id, 'vecka');
  assert.throws(() => parseGrimClassUnderlag({ ...im, columns: [{ id: 'ak7', label: 'Åk 7' }] }, { planId: uid(1) }));
  assert.throws(() => parseGrimClassUnderlag(underlag({ columns: [{ id: 'vecka', label: 'Per vecka' }], classes: [], legacyRows: [] }), { planId: uid(1) }));
});

test('skapa: namn i versaler utan omgivande blanksteg; svaret måste ha samma namn', () => {
  const q = { commandId: uid(40), planId: uid(1), expectedPlanRevision: 2, name: '7A' };
  assert.deepEqual(parseGrimClassCreateRequest(q), q);
  for (const name of ['7a', ' 7A', '', 'A'.repeat(61)]) assert.throws(() => parseGrimClassCreateRequest({ ...q, name }));
  assert.throws(() => parseGrimClassCreateRequest({ ...q, startYear: 2026 }));
  assert.equal(parseGrimClassCreateReply({ id: uid(10), name: '7A', startYear: 2026, replayed: false }, q).id, uid(10));
  assert.throws(() => parseGrimClassCreateReply({ id: uid(10), name: '7B', startYear: 2026, replayed: false }, q));
});

test('koppla: förväntad revision och föregående plan anges tillsammans; svaret har revision + 1', () => {
  assert.equal(parseGrimClassLinkRequest(linkRequest()).expectedLinkRevision, null);
  assert.throws(() => parseGrimClassLinkRequest(linkRequest({ expectedLinkRevision: 0 })));
  assert.throws(() => parseGrimClassLinkRequest(linkRequest({ columnId: 'ar1' })));
  const q = linkRequest({ expectedLinkRevision: 0, previousPlanId: uid(1), columnId: 'ak8' });
  const reply = (extra = {}) => ({ classId: uid(10), schoolYear: 2026, planId: uid(1), columnId: 'ak8', revision: 1, adopted: true, replayed: false, ...extra });
  assert.equal(parseGrimClassLinkReply(reply(), q).revision, 1);
  assert.throws(() => parseGrimClassLinkReply(reply({ revision: 2 }), q));
  assert.throws(() => parseGrimClassLinkReply(reply({ columnId: 'ak7' }), q));
  assert.throws(() => parseGrimClassLinkReply(reply({ revision: 0, adopted: true }), linkRequest({ columnId: 'ak8' })));
  assert.equal(parseGrimClassLinkReply(reply({ revision: 0, adopted: false }), linkRequest({ columnId: 'ak8' })).revision, 0);
});
