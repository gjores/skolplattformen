import test from 'node:test';
import assert from 'node:assert/strict';
import * as analysis from './timplan-analysis.ts';

const { analyseTimplan, GRUNDSKOLA_PROFILE, IM_PROFILE, DEFAULT_LOCAL_PARAMETERS } = analysis;

// Fryst regelprofil för proven. Den är medvetet skriven för hand: den inbyggda profilen
// måste vara identisk med den, så att en felskriven siffra upptäcks.
const SOURCE = {
  url: 'https://www.skolverket.se/undervisning/grundskolan/timplan-for-grundskolan',
  label: 'Skolverket: timplan för grundskolan från 2024/2025', verifiedOn: '2026-10-04', validFrom: '2024-07-01', validTo: null,
};
const h = (låg, mellan, hög) => ({ låg, mellan, hög });
const GR = {
  id: 'gr-2024-25', schoolKind: 'grundskola', source: SOURCE, stageHours: h(1882, 2334, 2634), total: 6890,
  subjects: [
    { rowId: 'bild', name: 'Bild', hours: h(60, 80, 100), protected: false },
    { rowId: 'engelska', name: 'Engelska', hours: h(60, 220, 200), protected: true },
    { rowId: 'hkk', name: 'Hem- och konsumentkunskap', hours: h(0, 0, 90), protected: false, shared: { stages: ['låg', 'mellan'], hours: 40 } },
    { rowId: 'idrott', name: 'Idrott och hälsa', hours: h(140, 180, 280), protected: false },
    { rowId: 'matematik', name: 'Matematik', hours: h(420, 410, 400), protected: true },
    { rowId: 'musik', name: 'Musik', hours: h(80, 80, 80), protected: false },
    { rowId: 'slojd', name: 'Slöjd', hours: h(50, 140, 140), protected: false },
    { rowId: 'svenska', name: 'Svenska eller svenska som andraspråk', hours: h(680, 520, 290), protected: true },
    { rowId: 'teknik', name: 'Teknik', hours: h(47, 65, 88), protected: false },
    { rowId: 'sprakval', name: 'Språkval', hours: h(0, 48, 272), protected: true },
  ],
  groups: [
    { rowId: 'no', name: 'Naturorienterande ämnen', hours: h(145, 216, 289), memberStages: ['mellan', 'hög'], members: [
      { rowId: 'biologi', name: 'Biologi', minimum: h(0, 60, 80) }, { rowId: 'fysik', name: 'Fysik', minimum: h(0, 60, 80) },
      { rowId: 'kemi', name: 'Kemi', minimum: h(0, 60, 80) }] },
    { rowId: 'so', name: 'Samhällsorienterande ämnen', hours: h(200, 375, 405), memberStages: ['mellan', 'hög'], members: [
      { rowId: 'geografi', name: 'Geografi', minimum: h(0, 75, 80) }, { rowId: 'historia', name: 'Historia', minimum: h(0, 90, 100) },
      { rowId: 'religion', name: 'Religionskunskap', minimum: h(0, 75, 80) }, { rowId: 'samhallskunskap', name: 'Samhällskunskap', minimum: h(0, 75, 90) }] },
  ],
  schoolChoice: { rowId: 'skolansval', maxHours: 600, maxReductionPercent: 20 },
};

const split = (n, parts = 3) => Array.from({ length: parts }, (_, i) => Math.floor(n / parts) + (i < n % parts ? 1 : 0));
const perGrade = (stageHours) => [...split(stageHours.låg), ...split(stageHours.mellan), ...split(stageHours.hög)];
/** Nationell fördelning, stadiets timmar jämnt över årskurserna, HKK:s 40 timmar i åk 5–6. */
function baseline() {
  const cells = {};
  for (const s of GR.subjects) cells[s.rowId] = perGrade(s.hours);
  cells.hkk = [0, 0, 0, 0, 20, 20, 30, 30, 30];
  for (const g of GR.groups) {
    cells[g.rowId] = [...split(g.hours.låg), 0, 0, 0, 0, 0, 0];
    const member = stage => {
      const min = g.members.reduce((n, m) => n + m.minimum[stage], 0), free = split(g.hours[stage] - min, g.members.length);
      return g.members.map((m, i) => m.minimum[stage] + free[i]);
    };
    const mellan = member('mellan'), hög = member('hög');
    g.members.forEach((m, i) => { cells[m.rowId] = [0, 0, 0, ...split(mellan[i]), ...split(hög[i])]; });
  }
  cells.skolansval = Array(9).fill(0);
  return cells;
}
const input = (over = {}) => ({
  schoolKind: 'grundskola', schoolId: 'skola-1', savedRevision: 3, analysisVersion: 'prov-1', appliesOn: '2026-08-17',
  profile: GR, valuesAre: 'saved', cells: baseline(), ...over,
});
const run = over => analyseTimplan(input(over));
const rules = (a, ruleId, category) => a.issues.filter(i => i.ruleId === ruleId && (!category || i.category === category));
const one = (a, ruleId, category) => { const r = rules(a, ruleId, category); assert.equal(r.length, 1, `${ruleId}/${category}: ${r.length} träffar`); return r[0]; };

test('den inbyggda profilen är identisk med den handskrivna och stadiernas timmar summerar till 6 890', () => {
  assert.deepEqual(GRUNDSKOLA_PROFILE, GR);
  assert.equal(GR.stageHours.låg + GR.stageHours.mellan + GR.stageHours.hög + 40, GR.total);
});

test('giltig profil och nationell fördelning ger inga fel, risker eller obligatoriska kontroller', () => {
  const a = run();
  assert.equal(a.profileId, 'gr-2024-25');
  assert.equal(a.counts.fel, 0);
  assert.equal(a.counts.risk, 0);
  assert.deepEqual(a.issues.filter(i => i.category === 'info' && i.mandatory), []);
  const low = a.issues.find(i => i.issueId === 'gr:stage-total:lag+mellan'), high = a.issues.find(i => i.issueId === 'gr:stage-total:hog');
  assert.deepEqual([low.category, low.actual, low.expected, low.unit], ['ok', 4256, 4256, 'timmar']);
  assert.deepEqual([high.category, high.actual, high.expected], ['ok', 2634, 2634]);
  assert.equal(low.sourceUrl, SOURCE.url);
  assert.equal(low.validFrom, '2024-07-01');
  assert.ok(rules(a, 'protected-subject', 'ok').length === 1 && rules(a, 'shared-subject', 'ok').length === 1);
});

test('samma input ger samma resultat i samma ordning, och felen kommer först', () => {
  const cells = baseline(); cells.matematik[2] = 100;
  const first = run({ cells }), second = run({ cells: structuredClone(cells) });
  assert.deepEqual(first, second);
  assert.equal(first.issues[0].category, 'fel');
  const order = ['fel', 'risk', 'info', 'ok'];
  const ranks = first.issues.map(i => order.indexOf(i.category));
  assert.deepEqual(ranks, [...ranks].sort((x, y) => x - y));
  assert.equal(new Set(first.issues.map(i => i.issueId)).size, first.issues.length);
});

test('okänd profil, fel skolform eller kull utanför giltigheten blir en obligatorisk kontroll och aldrig Uppfyllt', () => {
  const cases = [
    { profile: null }, { appliesOn: '2023-08-15' }, { appliesOn: null },
    { profile: { ...GR, schoolKind: 'introduktionsprogram' } },
  ];
  for (const over of cases) {
    const a = run(over);
    const unknown = one(a, 'profile-unknown', 'info');
    assert.equal(unknown.mandatory, true, JSON.stringify(over));
    assert.equal(a.counts.ok, 0, JSON.stringify(over));
    assert.equal(a.counts.fel, 0, JSON.stringify(over));
  }
  assert.equal(run({ profile: null }).profileId, null);
});

test('saknad rad räknas inte som noll utan blir ett fel med en länk till raden', () => {
  const cells = baseline(); delete cells.matematik;
  const a = run({ cells });
  const missing = one(a, 'row-missing', 'fel');
  assert.deepEqual(missing.affectedRows, ['matematik']);
  assert.deepEqual(missing.actionTarget, { type: 'row', rowId: 'matematik', columnIds: ['ak1', 'ak2', 'ak3', 'ak4', 'ak5', 'ak6', 'ak7', 'ak8', 'ak9'] });
  assert.equal(rules(a, 'protected-subject', 'fel').length, 0);
  assert.equal(rules(a, 'stage-total').length, 0, 'stadiets summa kan inte bevisas utan raden');
});

test('rad med ogiltiga värden är ett fel och stoppar inte analysen av övriga rader', () => {
  const cells = baseline(); cells.bild = [1.5, 20, 20, 0, 0, 0, 0, 0, 0]; cells.musik = [80, 0, 0];
  const a = run({ cells });
  assert.deepEqual(rules(a, 'row-shape', 'fel').map(i => i.affectedRows[0]).sort(), ['bild', 'musik']);
  assert.equal(rules(a, 'protected-subject', 'ok').length, 1);
});

test('okänd rad med timmar räknas inte men måste kontrolleras', () => {
  const cells = baseline(); cells.extra = [0, 0, 0, 0, 0, 5, 0, 0, 0];
  const a = run({ cells });
  const unknown = one(a, 'row-unknown', 'info');
  assert.equal(unknown.mandatory, true);
  assert.deepEqual(unknown.affectedRows, ['extra']);
  assert.equal(a.issues.find(i => i.issueId === 'gr:stage-total:lag+mellan').actual, 4256);
});

test('delat stadium: planen med åk 1–5 kan inte bevisa mellanstadiet eller HKK:s gemensamma 40 timmar', () => {
  const cells = Object.fromEntries(Object.entries(baseline()).map(([k, v]) => [k, v.slice(0, 5)]));
  const a = run({ grades: [1, 2, 3, 4, 5], cells });
  const partial = one(a, 'stage-partial', 'info');
  assert.deepEqual([partial.mandatory, partial.affectedColumns], [true, ['ak4', 'ak5']]);
  assert.equal(one(a, 'shared-subject', 'info').mandatory, true);
  assert.equal(a.counts.fel, 0);
  assert.equal(a.issues.some(i => i.issueId === 'gr:stage-total:lag+mellan'), false);
  assert.equal(one(a, 'stage-total', 'ok').issueId, 'gr:stage-total:lag');
});

test('en plan som bara har högstadiet behöver inget kompletterande underlag för HKK', () => {
  const cells = Object.fromEntries(Object.entries(baseline()).map(([k, v]) => [k, v.slice(6)]));
  const a = run({ grades: [7, 8, 9], cells });
  assert.equal(a.counts.fel, 0);
  assert.equal(rules(a, 'stage-partial').length + rules(a, 'shared-subject', 'info').length, 0);
  assert.equal(one(a, 'stage-total', 'ok').actual, 2634);
});

test('HKK: 40 timmar samlat i lågstadiet uppfyller den gemensamma ramen, 39 totalt gör inte det', () => {
  const inLow = baseline(); inLow.hkk = [14, 13, 13, 0, 0, 0, 30, 30, 30];
  const ok = run({ cells: inLow });
  assert.equal(ok.counts.fel, 0);
  const shared = one(ok, 'shared-subject', 'ok');
  assert.deepEqual([shared.actual, shared.expected], [40, 40]);
  assert.deepEqual(shared.affectedRows, ['hkk']);

  const short = baseline(); short.hkk = [0, 0, 0, 0, 20, 19, 30, 30, 30];
  const a = run({ cells: short });
  const total = one(a, 'stage-total', 'fel');
  assert.deepEqual([total.actual, total.expected], [4255, 4256]);
  assert.equal(rules(a, 'shared-subject', 'fel').length, 0, '39 av 40 är en tillåten minskning om tiden placeras i skolans val');

  const placed = baseline(); placed.hkk = [0, 0, 0, 0, 20, 19, 30, 30, 30]; placed.skolansval[5] = 1;
  const b = run({ cells: placed });
  assert.equal(b.counts.fel, 0);
  const choice = one(b, 'school-choice-total', 'ok');
  assert.deepEqual([choice.actual, choice.expected], [1, 600]);

  const deep = baseline(); deep.hkk = [0, 0, 0, 0, 16, 15, 30, 30, 30]; deep.skolansval[5] = 9;
  const c = run({ cells: deep });
  const over = one(c, 'shared-subject', 'fel');
  assert.deepEqual([over.actual, over.expected], [31, 32]);
  assert.deepEqual(over.actionTarget, { type: 'row', rowId: 'hkk', columnIds: ['ak1', 'ak2', 'ak3', 'ak4', 'ak5', 'ak6'] });
});

test('NO/SO räknas en gång: gruppen i lågstadiet, medlemmarna i mellan- och högstadiet', () => {
  const group = baseline(); group.no[4] = 10;
  const a = run({ cells: group });
  const misplaced = one(a, 'group-placement', 'fel');
  assert.deepEqual(misplaced.actionTarget, { type: 'cell', rowId: 'no', columnId: 'ak5' });
  assert.equal(a.issues.find(i => i.issueId === 'gr:stage-total:lag+mellan').actual, 4256, 'felplacerade timmar dubbelräknas inte');

  const member = baseline(); member.biologi[0] = 5;
  const b = run({ cells: member });
  assert.deepEqual(one(b, 'group-placement', 'fel').actionTarget, { type: 'cell', rowId: 'biologi', columnId: 'ak1' });
  assert.equal(b.issues.find(i => i.issueId === 'gr:stage-total:lag+mellan').actual, 4256);
});

test('NO/SO: medlemmens garanterade minsta tid kontrolleras per stadium', () => {
  const cells = baseline(); cells.biologi = [0, 0, 0, 16, 16, 18, ...cells.biologi.slice(6)];
  cells.skolansval[5] = 22;
  const a = run({ cells });
  const low = one(a, 'group-minimum', 'fel');
  assert.deepEqual([low.actual, low.expected, low.affectedRows], [50, 60, ['biologi']]);
  assert.deepEqual(low.affectedColumns, ['ak4', 'ak5', 'ak6']);
  assert.equal(rules(a, 'stage-total', 'fel').length, 0);
});

test('skyddade ämnen får inte minskas, inte ens inom skolans val', () => {
  const cells = baseline(); cells.matematik[2] = 120; cells.skolansval[2] = 20;
  const a = run({ cells });
  const fel = one(a, 'protected-subject', 'fel');
  assert.deepEqual([fel.actual, fel.expected], [400, 420]);
  assert.deepEqual(fel.affectedColumns, ['ak1', 'ak2', 'ak3']);
  assert.deepEqual(fel.actionTarget, { type: 'row', rowId: 'matematik', columnIds: ['ak1', 'ak2', 'ak3'] });
  assert.equal(fel.sourceUrl, SOURCE.url);
  assert.equal(fel.basis, 'regel');
  assert.equal(rules(a, 'protected-subject', 'ok').length, 0);

  const language = baseline(); language.sprakval[8] -= 2; language.skolansval[8] = 2;
  assert.equal(rules(run({ cells: language }), 'protected-subject', 'fel')[0].affectedRows[0], 'sprakval');
});

test('skolans val: minskning med högst 20 procent per ämne och stadium', () => {
  const within = baseline(); within.bild = [16, 16, 16, ...within.bild.slice(3)]; within.skolansval[2] = 12;
  const a = run({ cells: within });
  assert.equal(a.counts.fel, 0);
  assert.equal(one(a, 'school-choice-total', 'ok').actual, 12);

  const beyond = baseline(); beyond.bild = [16, 16, 15, ...beyond.bild.slice(3)]; beyond.skolansval[2] = 13;
  const fel = one(run({ cells: beyond }), 'reduction-limit', 'fel');
  assert.deepEqual([fel.actual, fel.expected, fel.affectedRows], [47, 48, ['bild']]);
});

test('skolans val: summan av minskningarna får inte överstiga profilens ram', () => {
  const profile = { ...GR, schoolChoice: { ...GR.schoolChoice, maxHours: 50 } };
  const cells = baseline();
  cells.bild = [16, 16, 16, ...cells.bild.slice(3)];
  cells.idrott = [38, 37, 37, ...cells.idrott.slice(3)];
  cells.musik = [22, 21, 21, ...cells.musik.slice(3)];
  cells.skolansval[2] = 56;
  const a = run({ cells, profile });
  const fel = one(a, 'school-choice-total', 'fel');
  assert.deepEqual([fel.actual, fel.expected], [56, 50]);
  assert.deepEqual(fel.affectedRows, ['skolansval']);
  assert.equal(rules(a, 'reduction-limit', 'fel').length, 0);
  assert.equal(rules(a, 'stage-total', 'fel').length, 0);
});

// ---- Introduktionsprogram, lokala risker och beslutsklarhet --------------------------------------------

const IM_SOURCE = {
  url: 'https://www.skolverket.se/styrning-och-ansvar/regler-och-ansvar/ansvar-i-skolfragor/undervisningstid-larotider-och-schema',
  label: 'Skolverket: undervisningstid, lärotider och schema', verifiedOn: '2026-10-04', validFrom: null, validTo: null,
};
const IM = {
  id: 'im-2026-10', schoolKind: 'introduktionsprogram', source: IM_SOURCE, minTeachingHoursPerWeek: 23,
  rows: [
    { rowId: 'im-sv', name: 'Svenska eller svenska som andraspråk, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-ma', name: 'Matematik, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-en', name: 'Engelska, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-sh', name: 'Samhällskunskap, grundskolenivå', kind: 'undervisning' },
    { rowId: 'im-idh', name: 'Idrott och hälsa', kind: 'undervisning' },
    { rowId: 'im-praktik', name: 'Praktik och yrkesorientering', kind: 'annan' },
    { rowId: 'im-mentor', name: 'Studiehandledning och mentorstid', kind: 'annan' },
  ],
};
const imCells = (over = {}) => ({ 'im-sv': [8], 'im-ma': [6], 'im-en': [4], 'im-sh': [4], 'im-idh': [4], 'im-praktik': [4], 'im-mentor': [1], ...over });
const imInput = (over = {}) => input({ schoolKind: 'introduktionsprogram', profile: IM, cells: imCells(), grades: undefined, ...over });
const runIm = over => analyseTimplan(imInput(over));
const imCellsFrom = values => Object.fromEntries(['im-sv', 'im-ma', 'im-en', 'im-sh', 'im-idh', 'im-praktik', 'im-mentor'].map((id, i) => [id, [values[i]]]));

test('den inbyggda IM-profilen och de lokala parametrarna har namngivna värden', () => {
  assert.deepEqual(IM_PROFILE, IM);
  assert.deepEqual(DEFAULT_LOCAL_PARAMETERS, { subjectEveryYearMinStageHours: 100, imLowMarginHours: 2, imOtherActivityMaxPercent: 40 });
});

test('IM med hög total veckotid men för lite bekräftad undervisning saknar styrkt ram', () => {
  const a = runIm({ cells: imCellsFrom([5, 4, 3, 3, 2, 10, 3]) });
  const fel = one(a, 'im-teaching', 'fel');
  assert.deepEqual([fel.actual, fel.expected, fel.unit], [17, 23, 'timmar per vecka']);
  assert.match(fel.detail, /30/);
  assert.deepEqual(fel.actionTarget, { type: 'row', rowId: 'im-sv', columnIds: ['vecka'] });
  assert.equal(fel.sourceUrl, IM_SOURCE.url);
  assert.equal(rules(a, 'im-teaching', 'ok').length, 0);
  assert.equal(a.blocksDecision, true);
  assert.ok(a.blockingIssueIds.includes(fel.issueId));
});

test('klassificeringen kommer från profilen: okänd tid och klientpåståenden räknas inte som undervisning', () => {
  const a = runIm({ cells: imCellsFrom([5, 4, 3, 3, 2, 10, 3]), classification: { 'im-praktik': 'undervisning' } });
  assert.equal(one(a, 'im-teaching', 'fel').actual, 17);
  const withExtra = runIm({ cells: { ...imCellsFrom([5, 4, 3, 3, 2, 10, 3]), 'im-extra': [10] } });
  const unclassified = one(withExtra, 'time-unclassified', 'info');
  assert.deepEqual([unclassified.mandatory, unclassified.actual, unclassified.affectedRows], [true, 10, ['im-extra']]);
  assert.equal(one(withExtra, 'im-teaching', 'fel').actual, 17);
});

test('minst 23 bekräftade timmar ger Uppfyllt för ramen men Att kontrollera för individuell tillämpning', () => {
  const a = runIm();
  const ok = one(a, 'im-teaching', 'ok');
  assert.deepEqual([ok.actual, ok.expected], [26, 23]);
  assert.match(ok.detail, /inte.*genomförd/i);
  const individual = one(a, 'im-individual', 'info');
  assert.equal(individual.mandatory, false);
  assert.equal(a.counts.fel, 0);
  assert.equal(a.blocksDecision, false);
  assert.deepEqual(a.blockingIssueIds, []);
  assert.deepEqual(a.readinessReasons, []);
});

test('lokal marginal och balans är namngivna riskparametrar, aldrig lag', () => {
  const thin = runIm({ cells: imCellsFrom([7, 6, 4, 3, 3, 4, 1]) });
  const margin = one(thin, 'im-low-margin', 'risk');
  assert.deepEqual([margin.basis, margin.sourceUrl, margin.localParameter], ['lokal', null, { name: 'imLowMarginHours', value: 2 }]);
  assert.equal(thin.blocksDecision, false, 'en risk blockerar inte');
  assert.equal(rules(runIm({ cells: imCellsFrom([7, 6, 4, 3, 3, 4, 1]), localParameters: { imLowMarginHours: 0 } }), 'im-low-margin').length, 0);

  const heavy = runIm({ cells: imCellsFrom([8, 6, 4, 4, 4, 14, 4]) });
  const share = one(heavy, 'im-other-share', 'risk');
  assert.deepEqual([share.localParameter, share.basis], [{ name: 'imOtherActivityMaxPercent', value: 40 }, 'lokal']);
  assert.equal(rules(runIm(), 'im-other-share').length, 0);
});

test('IM: saknad rad, ogiltigt värde och okänd profil behandlas som i grundskolan', () => {
  const cells = imCells(); delete cells['im-ma']; cells['im-en'] = [4, 4];
  const a = runIm({ cells });
  assert.equal(one(a, 'row-missing', 'fel').affectedRows[0], 'im-ma');
  assert.equal(one(a, 'row-shape', 'fel').affectedRows[0], 'im-en');
  assert.equal(rules(a, 'im-teaching').length, 0, 'ramen kan inte bevisas när en undervisningsrad saknas');
  const unknown = runIm({ profile: null });
  assert.equal(one(unknown, 'profile-unknown', 'info').mandatory, true);
  assert.equal(unknown.counts.ok, 0);
});

test('ändrad giltighet och planerad tid redovisas öppet', () => {
  const im = runIm();
  const validity = one(im, 'profile-validity', 'info');
  assert.equal(validity.mandatory, false);
  assert.equal(validity.sourceUrl, IM_SOURCE.url);
  assert.equal(rules(run(), 'profile-validity').length, 0, 'grundskoleprofilen anger sin giltighet');
  for (const a of [im, run()]) {
    const planned = one(a, 'planned-not-delivered', 'info');
    assert.equal(planned.mandatory, false);
    assert.match(planned.detail, /inte faktiskt genomförd/);
  }
});

test('grundskolans lokala risk: ett stort ämne utan tid i en årskurs, med namngiven parameter', () => {
  const cells = baseline(); cells.matematik = [210, 210, 0, ...cells.matematik.slice(3)];
  const a = run({ cells });
  const risk = one(a, 'subject-every-year', 'risk');
  assert.deepEqual(risk.actionTarget, { type: 'cell', rowId: 'matematik', columnId: 'ak3' });
  assert.deepEqual([risk.basis, risk.sourceUrl, risk.localParameter], ['lokal', null, { name: 'subjectEveryYearMinStageHours', value: 100 }]);
  assert.equal(a.counts.fel, 0);
  assert.equal(a.blocksDecision, false);
  assert.equal(rules(run({ cells, localParameters: { subjectEveryYearMinStageHours: 500 } }), 'subject-every-year').length, 0);
});

test('beslutsklarhet: fel och obligatoriska kontroller blockerar, allmän information och risker gör det inte', () => {
  const clean = run();
  assert.equal(clean.blocksDecision, false);
  assert.ok(clean.issues.some(i => i.category === 'info' && !i.mandatory && !i.blocksDecision));
  assert.ok(clean.issues.every(i => i.blocksDecision === (i.category === 'fel' || (i.category === 'info' && i.mandatory))));

  const cells = baseline(); cells.extra = [0, 0, 0, 0, 0, 5, 0, 0, 0];
  const mandatory = run({ cells });
  assert.equal(mandatory.blocksDecision, true);
  assert.deepEqual(mandatory.blockingIssueIds, ['gr:row-unknown:extra']);

  const broken = baseline(); broken.matematik[2] = 100;
  assert.equal(run({ cells: broken }).blocksDecision, true);
  assert.equal(run({ profile: null }).blocksDecision, true);
});

test('egna osparade värden och saknad revision hindrar beslut utan att ändra analysen', () => {
  const saved = run();
  const unsaved = run({ valuesAre: 'own-unsaved' });
  assert.equal(saved.scope, 'saved');
  assert.equal(unsaved.scope, 'own-unsaved');
  assert.equal(unsaved.blocksDecision, true);
  assert.deepEqual(unsaved.readinessReasons.map(r => r.code), ['own-unsaved']);
  assert.deepEqual(unsaved.issues, saved.issues);
  assert.deepEqual(unsaved.blockingIssueIds, []);

  const noRevision = run({ savedRevision: null });
  assert.deepEqual(noRevision.readinessReasons.map(r => r.code), ['no-saved-revision']);
  assert.equal(noRevision.blocksDecision, true);
  assert.deepEqual(run({ analysisVersion: '' }).readinessReasons.map(r => r.code), ['analysis-version-missing']);
});
