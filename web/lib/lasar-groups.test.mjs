import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupsFromRefs } from './lasar-groups.ts';
import { LASAR_RULE_CODES } from './lasar-rule-codes.ts';
import { studentGroups, groupChain, allIssues, proposeSchoolYear, mondayOfWeek, addDays } from './lasar-model.ts';

// Syntetiska ID:n.
const gr = '51a10000-0000-4000-8000-000000000001';
const ek = '51a10000-0000-4000-8000-000000000002';
const class1A = '51a10000-0000-4000-8000-000000000101';
const classEK = '51a10000-0000-4000-8000-000000000102';
const classEK2 = '51a10000-0000-4000-8000-000000000103';
const arskurs = (offeringId, columnId, label, kind = 'grundskola', educationName = 'Grundskola') => ({ scope: 'arskurs', offeringId, columnId, label, educationName, kind });
const klass = (classId, offeringId, columnId, label, kind = 'grundskola', educationName = 'Grundskola') => ({ scope: 'klass', classId, offeringId, columnId, label, educationName, kind });
const refs = [
  arskurs(gr, 'ak1', 'Årskurs 1'),
  arskurs(gr, 'ak3', 'Årskurs 3'),
  arskurs(ek, 'ar1', 'År 1', 'gymnasium', 'Ekonomiprogrammet'),
  klass(class1A, gr, 'ak1', '1A'),
  klass(classEK, ek, 'ar1', 'EK26A', 'gymnasium', 'Ekonomiprogrammet'),
];

test('groupsFromRefs ger arskurs:{offeringId}:{columnId} och klass:{classId}', () => {
  const ids = groupsFromRefs(refs).map((g) => g.id);
  assert.deepEqual(ids, [`arskurs:${gr}:ak1`, `arskurs:${gr}:ak3`, `arskurs:${ek}:ar1`, `klass:${class1A}`, `klass:${classEK}`]);
});

test('groupsFromRefs ger samma StudentGroup-form och kedja som demons grupper', () => {
  const educations = [
    { id: gr, name: 'Grundskola', kind: 'grundskola', columns: [{ id: 'ak1', label: 'Årskurs 1' }, { id: 'ak3', label: 'Årskurs 3' }] },
    { id: ek, name: 'Ekonomiprogrammet', kind: 'gymnasium', programCode: 'EKEKO', columns: [{ id: 'ar1', label: 'År 1' }] },
  ];
  const classes = [
    { name: '1A', kind: 'grundskola', educationId: gr, columnId: 'ak1', pupils: 20 },
    { name: 'EK26A', kind: 'gymnasium', educationId: ek, columnId: 'ar1', pupils: 30 },
  ];
  const demo = studentGroups(educations, classes, 2026);
  const ours = groupsFromRefs(refs);
  const idMap = new Map([
    [`${gr}:ak1`, `arskurs:${gr}:ak1`], [`${gr}:ak3`, `arskurs:${gr}:ak3`], [`${ek}:ar1`, `arskurs:${ek}:ar1`],
    ['klass:1A', `klass:${class1A}`], ['klass:EK26A', `klass:${classEK}`],
  ]);
  const normalized = demo.map(({ pupils: _pupils, ...g }) => ({ ...g, id: idMap.get(g.id), ...(g.parentId ? { parentId: idMap.get(g.parentId) } : {}) }));
  assert.deepEqual(ours, normalized);
  for (const g of ours) assert.deepEqual(groupChain(g, ours).map((x) => x.name), groupChain(demo[ours.indexOf(g)], demo).map((x) => x.name));
  assert.deepEqual(groupChain(ours[3], ours).map((x) => x.id), [`klass:${class1A}`, `arskurs:${gr}:ak1`]);
});

test('två klasser med samma namn och olika classId får olika ID; namnet är bara etikett', () => {
  const groups = groupsFromRefs([arskurs(ek, 'ar1', 'År 1', 'gymnasium', 'Ekonomiprogrammet'), klass(classEK, ek, 'ar1', 'EK26A', 'gymnasium', 'Ekonomiprogrammet'), klass(classEK2, ek, 'ar1', 'EK26A', 'gymnasium', 'Ekonomiprogrammet')]);
  const classes = groups.filter((g) => g.scope === 'klass');
  assert.equal(classes.length, 2);
  assert.notEqual(classes[0].id, classes[1].id);
  assert.deepEqual(classes.map((g) => g.name), ['EK26A', 'EK26A']);
});

test('grupp-ID bildas aldrig ur klassnamn eller programprefix', () => {
  const a = groupsFromRefs([klass(classEK, ek, 'ar1', 'EK26A', 'gymnasium', 'Ekonomiprogrammet')]);
  const b = groupsFromRefs([klass(classEK, ek, 'ar1', 'NA27B', 'gymnasium', 'Naturvetenskapsprogrammet')]);
  assert.equal(a[0].id, b[0].id);
  for (const g of groupsFromRefs(refs)) {
    assert.ok(!g.id.includes(g.name), g.id);
    assert.ok(!/EK26A|EKEKO|:EK\b/.test(g.id), g.id);
  }
});

test('groupsFromRefs nekar ID som inte är stabila UUID:n, okända kolumner och dubbletter', () => {
  assert.throws(() => groupsFromRefs([klass('EK26A', ek, 'ar1', 'EK26A')]));
  assert.throws(() => groupsFromRefs([arskurs('EK', 'ar1', 'År 1')]));
  assert.throws(() => groupsFromRefs([arskurs(gr.toUpperCase(), 'ak1', 'Årskurs 1')]));
  assert.throws(() => groupsFromRefs([arskurs(gr, 'åk1', 'Årskurs 1')]));
  assert.throws(() => groupsFromRefs([klass(class1A, gr, 'ak1', '1A'), klass(class1A, gr, 'ak1', '1B')]));
  assert.throws(() => groupsFromRefs([arskurs(gr, 'ak1', 'Årskurs 1'), arskurs(gr, 'ak1', 'Åk 1')]));
});

test('en klass utan årskursgrupp får ingen förälder och ingen kolumn', () => {
  const [g] = groupsFromRefs([klass(class1A, gr, 'ak1', '1A')]);
  assert.equal(g.parentId, undefined);
  assert.equal(g.columnId, undefined);
  const [n] = groupsFromRefs([klass(class1A, gr, null, '1A')]);
  assert.equal(n.columnId, undefined);
});

// ------------------------------------------------------------- regelkoder

/** Modellens texter i dag, en per regel. Ny regel utan kod ger rött prov. */
const CLASSIFY = [
  ['school_days_min', /^Läsåret har [\d\s ]+ skoldagar; minst 178 krävs/],
  ['holidays_min', /^Läsåret har [\d\s ]+ lovdagar; minst 12 krävs/],
  ['study_days_max', /studiedagar är utlagda; högst 5 får/],
  ['term_start_august', /^Läsåret ska börja i augusti\.$/],
  ['term_end_june', /^Läsåret ska sluta (senast )?i juni\.$/],
  ['term_order', /^Terminerna överlappar eller är omvända/],
  ['gy_weeks', /gymnasieskolans läsår ska omfatta 40 veckor/],
  ['term_edge_holiday', /^(Höstterminen|Vårterminen) (börjar|slutar) .+, som är /],
  ['weekday_balance', /^Skoldagarna är ojämnt fördelade över veckan/],
  ['long_run', /skoldagar i följd utan lov fram till/],
  ['study_day_note', /^Studiedagen .+ saknar anteckning/],
  ['short_week_column', /läser fyra dagar i veckan\. Antalet skoldagar i veckan får bara begränsas/],
  ['short_week_reason', /^Fyra skoldagar i veckan för .+ kräver särskilda skäl/],
  ['group_other_note', /saknar undervisning .+ utan angiven orsak/],
  ['group_days_min', /undervisningsdagar mot skolans/],
];

const sorted = (values) => [...values].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

function ruleMatrix() {
  const p = proposeSchoolYear(2026, 'u1', ['GR']);
  const year = (patch = {}) => ({ ...p, ht: { ...p.ht }, vt: { ...p.vt }, exceptions: { ...p.exceptions }, groupExceptions: {}, shortWeeks: {}, ...patch });
  const mondays = {};
  for (let w = 35; w <= 50; w += 1) mondays[mondayOfWeek(2026, w)] = { kind: 'lovdag', note: 'Måndagslov' };
  for (let w = 3; w <= 22; w += 1) mondays[mondayOfWeek(2027, w)] = { kind: 'lovdag', note: 'Måndagslov' };
  const study = Object.fromEntries([1, 2, 3, 4, 5, 6].map((i) => [addDays('2026-11-16', i % 5 + (i > 4 ? 7 : 0)), { kind: 'studiedag', note: 'Fortbildning' }]));
  const groups = groupsFromRefs([arskurs(gr, 'ak1', 'Årskurs 1'), arskurs(gr, 'ak3', 'Årskurs 3'), klass(class1A, gr, 'ak1', '1A')]);
  const ak1 = `arskurs:${gr}:ak1`, ak3 = `arskurs:${gr}:ak3`, k1A = `klass:${class1A}`;
  const groupDays = Object.fromEntries(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].map((d) => [d, { cause: 'friluftsdag', note: 'Lägerskola' }]));
  return [
    { sy: year({ exceptions: { ...p.exceptions, ...mondays } }), types: ['GR'] },
    { sy: year({ ht: { start: '2026-09-01', end: p.ht.end }, vt: { start: p.vt.start, end: '2027-05-28' } }), types: ['GY'] },
    { sy: year({ ht: { start: '2026-08-10', end: p.ht.end } }), types: ['GR', 'GY'] },
    { sy: year({ vt: { start: '2026-12-01', end: p.vt.end } }), types: ['GR'] },
    { sy: year({ ht: { start: '2026-08-16', end: '2026-12-31' }, vt: { start: '2027-01-04', end: p.vt.end }, exceptions: {} }), types: ['GR'] },
    { sy: year({ exceptions: { ...p.exceptions, ...study, '2026-12-01': { kind: 'studiedag' } } }), types: ['GR'] },
    { sy: year({ shortWeeks: { [ak3]: { weekday: 4, reason: '', columnId: 'ak3' } }, groupExceptions: { [k1A]: { '2026-09-21': { cause: 'annat' } }, [ak1]: groupDays } }), types: ['GR'], groups },
  ];
}

test('LASAR_RULE_CODES täcker varje fel- och varningsregel som allIssues ger på en fixturmatris', () => {
  const seen = new Map();
  for (const { sy, types, groups = [] } of ruleMatrix()) {
    for (const issue of allIssues(sy, types, groups)) {
      const hits = CLASSIFY.filter(([, re]) => re.test(issue.text));
      assert.equal(hits.length, 1, `en regel per text: ${issue.text}`);
      const code = hits[0][0];
      assert.ok(LASAR_RULE_CODES[code], `kod saknas: ${code}`);
      assert.ok(LASAR_RULE_CODES[code].levels.includes(issue.level), `${code} har inte nivån ${issue.level}`);
      seen.set(code, new Set([...(seen.get(code) ?? []), issue.level]));
    }
  }
  assert.deepEqual(sorted(seen.keys()), sorted(Object.keys(LASAR_RULE_CODES)));
  assert.deepEqual(sorted(seen.get('gy_weeks')), ['error', 'warning']);
  for (const [code, levels] of seen) assert.deepEqual(sorted(levels), sorted(LASAR_RULE_CODES[code].levels), code);
});

test('regelkoderna är fastlagda med nivå och omfattning', () => {
  assert.deepEqual(Object.keys(LASAR_RULE_CODES), CLASSIFY.map(([code]) => code));
  for (const [code, rule] of Object.entries(LASAR_RULE_CODES)) {
    assert.match(code, /^[a-z_]+$/);
    assert.ok(rule.levels.length >= 1 && rule.levels.every((l) => l === 'error' || l === 'warning'), code);
    assert.ok(rule.scope === 'läsår' || rule.scope === 'grupp', code);
    assert.ok(rule.text.length > 0, code);
  }
  assert.equal(LASAR_RULE_CODES.school_days_min.scope, 'läsår');
  assert.equal(LASAR_RULE_CODES.short_week_column.scope, 'grupp');
});
