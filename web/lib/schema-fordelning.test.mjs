import test from 'node:test';
import assert from 'node:assert/strict';
import { SCHEMA_CONTRACT_VERSION, SCHEMA_MOTOR_VERSION, checkSchemaVillkor, defaultSchemaVillkor, parseSchemaForslag, parseSchemaVillkor, sammaGrund, villkorNyckel } from './schema-contract.ts';
import { buildSchemaUnderlag, defaultSchemaTime, schemaForslag } from './schema-underlag.ts';
import { SchemaFordelningError } from './schema-fordelning.ts';

const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const key = n => `class_timplan:${uid(n)}:2026:ma`;
const ref = n => `undervisning:${key(n)}`;
const sourceNeed = n => ({ sourceKind: 'class_timplan', sourceKey: key(n), rowKey: 'ma', label: 'Matematik', needHt: 3240, needVt: 3600, needBasis: 'terms' });
function plan() {
  return { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 1,
    version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x' }, versions: [],
    teachers: [{ personId: uid(20), displayName: 'Provlärare', draft: false, shareHere: 100 }],
    classes: [10, 11].map(n => ({ classId: uid(n), name: `Klass ${n}`, link: null, aplMinutes: null, needs: [sourceNeed(n)] })),
    rows: [10, 11].map(n => ({ id: uid(n + 30), lineageId: uid(n + 40), sourceKind: 'class_timplan', sourceKey: key(n), classId: uid(n), rowKey: 'ma', personId: uid(20),
      teacherHt: 3240, teacherVt: 3600, needHt: 3240, needVt: 3600, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' })),
    groups: [], joints: [], sharing: [], specials: [], actions: [], blockers: [], capabilities: { canEdit: true }, sharingInfo: [] };
}
const request = (fordelning, egna = []) => ({ unitId: uid(1), schoolYear: 2026, period: 'ht', villkor: { ...defaultSchemaVillkor(), egna, ...(fordelning ? { fordelning } : {}) } });
const allPlaced = u => ({ status: 'complete', placements: u.labels.lessons.map((l, i) => ({ lesson: l.id, day: i % 5, startMin: 480, room: null })), unplaced: [], diagnoses: [], elapsedMs: 1, metrics: { studentGapMin: 0, teacherGapMin: 0 } });
const antal = (u, n) => u.labels.lessons.filter(l => l.classIds.includes(u.labels.classes.find(c => c.name === `Klass ${n}`).id)).length;

test('tom och frånvarande fördelning är samma grund och tolkas kanoniskt; ordning ändrar inte betydelsen', () => {
  const base = defaultSchemaVillkor();
  assert.deepEqual(parseSchemaVillkor({ ...base, fordelning: [] }), base);
  assert.ok(sammaGrund(base, { ...base, fordelning: [] }));
  assert.equal(villkorNyckel(base), villkorNyckel({ ...base, fordelning: [] }));
  const a = [{ ref: ref(10), antal: 2 }, { ref: ref(11), antal: 3 }], b = [...a].reverse();
  assert.deepEqual(parseSchemaVillkor({ ...base, fordelning: b }).fordelning, a);
  assert.ok(sammaGrund({ ...base, fordelning: a }, { ...base, fordelning: b }));
  assert.equal(villkorNyckel({ ...base, fordelning: a }), villkorNyckel({ ...base, fordelning: b }));
  assert.ok(!sammaGrund(base, { ...base, fordelning: a }));
});

test('strikt villkorstolkning nekar främmande fält, dubletter, ogiltigt antal och ogiltig referens', () => {
  for (const values of [[{ ref: ref(10), antal: 0 }], [{ ref: ref(10), antal: 11 }], [{ ref: ref(10), antal: 2.5 }], [{ ref: 'pass-1', antal: 2 }],
    [{ ref: ref(10), antal: 2, name: 'Påhittat' }], [{ ref: ref(10), antal: 2 }, { ref: ref(10), antal: 3 }], null]) {
    assert.throws(() => parseSchemaVillkor({ ...defaultSchemaVillkor(), fordelning: values }));
  }
  assert.ok(checkSchemaVillkor({ ...defaultSchemaVillkor(), fordelning: [{ ref: ref(10), antal: 0 }] }).some(x => x.includes('1–10')));
});

test('samma ämne får två respektive tre lektioner i olika faktiska klassundervisningar utan nya timmar', () => {
  const data = plan(), input = request([{ ref: ref(10), antal: 2 }, { ref: ref(11), antal: 3 }]);
  const u = buildSchemaUnderlag(data, input), f = schemaForslag(data, input, u, allPlaced(u));
  assert.deepEqual([antal(u, 10), antal(u, 11)], [2, 3]);
  assert.deepEqual(u.labels.lessons.filter(l => l.classIds.includes('grupp-1')).map(l => l.durationMin), [90, 90]);
  assert.deepEqual(u.labels.lessons.filter(l => l.classIds.includes('grupp-2')).map(l => l.durationMin), [60, 60, 60]);
  assert.deepEqual(f.teachings.map(t => [t.ref, t.needMin, t.plannedMin]), [[ref(10), 6840, 3240], [ref(11), 6840, 3240]]);
  assert.deepEqual(f.fordelning.map(row => [row.ref, row.antal, row.terms[0]]), [
    [ref(10), 2, { term: 'ht', needMin: 3240, plannedMin: 3240, antalPass: 2 }], [ref(11), 3, { term: 'ht', needMin: 3240, plannedMin: 3240, antalPass: 3 }],
  ]);
  assert.equal(parseSchemaForslag(structuredClone(f), input).fordelning.length, 2);
  assert.equal(f.contractVersion, 8); assert.equal(u.problem.version, SCHEMA_MOTOR_VERSION);
  const sent = JSON.stringify(u.problem);
  assert.ok(!sent.includes('52a10000') && !sent.includes('Matematik') && !sent.includes('undervisning:'));
});

test('undervisningsreferensen följer källan när namn eller radernas ordning ändras', () => {
  const data = plan(), input = request([{ ref: ref(10), antal: 2 }, { ref: ref(11), antal: 3 }]);
  const old = buildSchemaUnderlag(data, input);
  const changed = buildSchemaUnderlag({ ...data, rows: [...data.rows].reverse(), classes: [...data.classes].reverse().map(c => ({ ...c, name: `Nytt ${c.name}`, needs: c.needs.map(n => ({ ...n, label: 'Nytt ämnesnamn' })) })) }, input);
  assert.deepEqual(changed.fordelning.map(x => x.ref).sort((a, b) => a.localeCompare(b)), old.fordelning.map(x => x.ref).sort((a, b) => a.localeCompare(b)));
  const byRef = (a, b) => String(a[0]).localeCompare(String(b[0]));
  assert.deepEqual(changed.fordelning.map(x => [x.ref, x.terms[0].antalPass]).sort(byRef), [[ref(10), 2], [ref(11), 3]].sort(byRef));
  assert.notEqual(changed.grundFingerprint, old.grundFingerprint);
});

test('samma klass och ämnesnamn kan ändå ha två källbundna undervisningar med olika antal', () => {
  const data = plan(), second = { ...data.classes[0].needs[0], sourceKey: `${key(10)}:extra`, rowKey: 'extra' };
  data.classes = [{ ...data.classes[0], needs: [data.classes[0].needs[0], second] }];
  data.rows = [data.rows[0], { ...data.rows[0], id: uid(90), sourceKey: second.sourceKey, rowKey: 'extra' }];
  const u = buildSchemaUnderlag(data, request([{ ref: ref(10), antal: 2 }, { ref: `undervisning:${second.sourceKey}`, antal: 3 }]));
  assert.deepEqual(u.fordelning.map(r => r.terms[0].antalPass), [2, 3]);
});

test('explicit undervisningsval går före generella antal; klass går före ämne oavsett inmatningsordning', () => {
  const data = plan(), own = { slag: 'klass', ref: uid(10), typ: 'antal', count: 2 }, subject = { slag: 'amne', ref: 'Matematik', typ: 'antal', count: 4 };
  for (const rules of [[own, subject], [subject, own]]) {
    assert.equal(antal(buildSchemaUnderlag(data, request(undefined, rules)), 10), 2);
    assert.equal(antal(buildSchemaUnderlag(data, request([{ ref: ref(10), antal: 3 }], rules)), 10), 3);
  }
});

test('motstridiga klassantal i samläsning ger samma tydliga konflikt i båda ordningarna; eget val löser den', () => {
  const data = plan(); data.joints = [{ id: uid(80), lineageId: uid(81), name: 'Gemensam matematik', rowIds: data.rows.map(r => r.id), teachers: [{ personId: uid(20), ht: 3240, vt: 3600 }] }];
  data.rows = data.rows.map(r => ({ ...r, jointGroupId: uid(80) }));
  const rules = [10, 11].map((n, i) => ({ slag: 'klass', ref: uid(n), typ: 'antal', count: i + 2 }));
  const failures = [rules, [...rules].reverse()].map(egna => {
    try { buildSchemaUnderlag(data, request(undefined, egna)); assert.fail('konflikten saknades'); } catch (error) { assert.ok(error instanceof SchemaFordelningError); return error.issues; }
  });
  assert.deepEqual(failures[0], failures[1]); assert.match(failures[0][0], /Gemensam matematik.*Klass 10: 2 lektioner.*Klass 11: 3 lektioner/u);
  const stable = `samlasning:${uid(81)}`, input = request([{ ref: stable, antal: 2 }], rules), u = buildSchemaUnderlag(data, input);
  assert.equal(u.fordelning[0].ref, stable); assert.equal(u.fordelning[0].typ, 'samlasning'); assert.equal(u.fordelning[0].terms[0].antalPass, 2);
  const newer = { ...data, joints: data.joints.map(j => ({ ...j, id: uid(82) })), rows: data.rows.map(r => ({ ...r, jointGroupId: uid(82) })) };
  assert.equal(buildSchemaUnderlag(newer, input).fordelning[0].ref, stable);
});

test('reservblock utan medlemskap redovisar gemensam referens och kan inte ges påhittade separata mönster', () => {
  const data = plan(); data.classes = [{ ...data.classes[0], needs: [] }]; data.rows = [];
  data.groups = [40, 41].map(n => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(n)}`, rowKey: `group:${uid(n)}`, label: `Språk ${n}`, name: `Språk ${n}`,
    groupId: uid(n), blockId: uid(60), classIds: [uid(10)], needHt: 2160, needVt: 2400, needBasis: 'terms' }));
  const blockRef = `valbart-block:${uid(60)}`, u = buildSchemaUnderlag(data, request([{ ref: blockRef, antal: 2 }]));
  assert.equal(u.fordelning.length, 1); assert.equal(u.fordelning[0].typ, 'block'); assert.match(u.fordelning[0].begransning, /gemensamt lektionsmönster/u);
  assert.equal(u.fordelning[0].terms[0].antalPass, 2);
  assert.throws(() => buildSchemaUnderlag(data, request([{ ref: `undervisning:${data.groups[0].sourceKey}`, antal: 2 }])), SchemaFordelningError);
});

test('separata elevgrupper får egna källbundna antal när medlemmarna är kända; grupp går före ämne', () => {
  const data = plan(); data.classes = [{ ...data.classes[0], needs: [] }]; data.rows = [];
  data.groups = [40, 41].map(n => ({ sourceKind: 'teaching_group', sourceKey: `teaching_group:${uid(n)}`, rowKey: `group:${uid(n)}`, label: `Språk ${n}`, name: `Språk ${n}`,
    groupId: uid(n), blockId: uid(60), classIds: [uid(10)], needHt: 2160, needVt: 2400, needBasis: 'terms' }));
  const basis = { time: defaultSchemaTime(), members: { pupils: [100, 101].map(n => ({ id: uid(n), classIds: [uid(10)] })),
    memberships: [40, 41].map((n, i) => ({ groupId: uid(n), pupilId: uid(100 + i), startsOn: '2026-08-17', endsOn: null })) } };
  const values = data.groups.map((g, i) => ({ ref: `undervisning:${g.sourceKey}`, antal: i + 2 }));
  const u = buildSchemaUnderlag(data, request(values), basis);
  assert.deepEqual(u.fordelning.map(r => [r.ref, r.typ, r.terms[0].antalPass]), values.map(v => [v.ref, 'undervisning', v.antal]));
  const rules = [{ slag: 'amne', ref: 'Språk 40', typ: 'antal', count: 4 }, { slag: 'grupp', ref: uid(40), typ: 'antal', count: 2 }];
  for (const own of [rules, [...rules].reverse()]) assert.equal(buildSchemaUnderlag(data, request(undefined, own), basis).fordelning[0].terms[0].antalPass, 2);
});

test('inaktiv undervisning syns inte som en fördelningsrad; ogiltig källreferens och omöjligt antal stoppas', () => {
  const data = plan(); data.classes[1].needs[0].needHt = 0; data.rows[1].needHt = 0; data.rows[1].teacherHt = 0;
  const u = buildSchemaUnderlag(data, request()); assert.equal(u.fordelning.length, 1);
  assert.throws(() => buildSchemaUnderlag(plan(), request([{ ref: 'undervisning:främmande', antal: 2 }])), SchemaFordelningError);
  const tooMuch = plan(); tooMuch.classes[0].needs[0].needHt = 7200; tooMuch.rows[0].needHt = 7200; tooMuch.rows[0].teacherHt = 7200;
  assert.throws(() => buildSchemaUnderlag(tooMuch, request([{ ref: ref(10), antal: 1 }])), SchemaFordelningError);
});

test('svarstolkningen kräver aktuell fördelningsmetadata och källbundna timplansrader', () => {
  const data = plan(), input = request(), u = buildSchemaUnderlag(data, input), f = schemaForslag(data, input, u, allPlaced(u));
  for (const edit of [x => { x.contractVersion = SCHEMA_CONTRACT_VERSION - 1; }, x => { delete x.fordelning; }, x => { x.fordelning.push(structuredClone(x.fordelning[0])); },
    x => { delete x.teachings[0].ref; }, x => { x.fordelning[0].terms[0].needMin = 0; }, x => { x.teachings[0].ref = 'undervisning:annan'; }]) {
    const broken = structuredClone(f); edit(broken); assert.throws(() => parseSchemaForslag(broken, input));
  }
});
