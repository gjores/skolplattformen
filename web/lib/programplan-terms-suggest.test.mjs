import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with { type: 'json' };
import { programplanTermRows, programplanLevelRanks, suggestProgramplanTerms, validateProgramplanTermDistribution, firstYear } from './programplan-terms.ts';
import { analyseProgramplan } from './programplan-analysis.ts';

const program = artifact.programs.find(p => p.code === 'SA25');
const orientation = program.orientations[0].code;
const eng3 = program.specialization.find(s => s.code === 'ENGE');
const basis = { catalogId: artifact.catalogId, programRef: { code: program.code, version: program.version }, orientationCode: orientation, startedOn: '2026-08-17',
  specializationRefs: [{ subjectCode: 'ENGE', subjectVersion: eng3.subjectVersion, itemCode: 'ENGE3000X', points: 100 }] };
const rows = programplanTermRows(program, basis), ranks = programplanLevelRanks(program);
const year = (dist, key) => firstYear(dist.find(d => d.rowKey === key)?.points);
const keyOf = (part, code) => rows.find(r => r.part === part && r.key.endsWith(`:${code}`)).key;

test('förslaget fördelar alla nivåer giltigt och delar varje nivå på HT och VT', () => {
  const dist = suggestProgramplanTerms(rows, [], ranks);
  validateProgramplanTermDistribution(rows, dist);
  assert.equal(dist.length, rows.length);
  for (const d of dist) assert.equal(d.points.reduce((a, b) => a + b, 0), rows.find(r => r.key === d.rowKey).points);
});

test('nivåordning, inriktning från åk 2 och gymnasiearbete i åk 3', () => {
  const dist = suggestProgramplanTerms(rows, [], ranks);
  assert.equal(year(dist, keyOf('foundation', 'ENGE1000X')), 0);
  assert.equal(year(dist, keyOf('foundation', 'ENGE2000X')), 1);
  assert.equal(year(dist, keyOf('specialization', 'ENGE3000X')), 2);
  for (const r of rows.filter(r => r.part === 'orientation')) assert.ok(year(dist, r.key) >= 1, r.key);
  assert.equal(year(dist, 'meta:diplomaWork'), 2);
});

test('redan fördelade rader rörs inte', () => {
  const key = keyOf('foundation', 'ENGE1000X'), own = [{ rowKey: key, points: [0, 0, 0, 0, 100, 0] }];
  const dist = suggestProgramplanTerms(rows, own, ranks);
  assert.deepEqual(dist.find(d => d.rowKey === key).points, [0, 0, 0, 0, 100, 0]);
});

test('analysen: ofördelat är fel, förslaget ger klar för beslut och fel nivåordning stoppar', () => {
  const input = terms => ({ program, orientationCode: orientation, refs: basis.specializationRefs, startedOn: '2026-08-17', sourceFetched: null, terms });
  const empty = analyseProgramplan(input({ rows, distribution: [], ranks }));
  assert.ok(empty.issues.some(i => i.id === 'terms-open' && i.category === 'fel'));
  assert.equal(empty.ready, false);
  const full = suggestProgramplanTerms(rows, [], ranks);
  const okRefs = analyseProgramplan({ ...input({ rows, distribution: full, ranks }), refs: [...basis.specializationRefs, { subjectCode: 'X', subjectVersion: 1, itemCode: 'X', points: 200 }] });
  assert.ok(okRefs.issues.some(i => i.id === 'terms-ok'));
  const swapped = full.map(d => d.rowKey === keyOf('foundation', 'ENGE2000X') ? { ...d, points: [50, 50, 0, 0, 0, 0] } : d.rowKey === keyOf('foundation', 'ENGE1000X') ? { ...d, points: [0, 0, 50, 50, 0, 0] } : d);
  const wrong = analyseProgramplan(input({ rows, distribution: swapped, ranks }));
  assert.ok(wrong.issues.some(i => i.id.startsWith('level-order-') && i.category === 'fel'));
  assert.equal(wrong.ready, false);
  assert.ok(wrong.missing.length > 0);
});

test('utan underlag med terminer är planen aldrig klar', () => {
  const a = analyseProgramplan({ program, orientationCode: orientation, refs: [], startedOn: '2026-08-17', sourceFetched: null });
  assert.equal(a.ready, false);
});

test('v2 slots and custom specialization get their exact two-year frames', async()=>{
 const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');
 for(const [code,orientationCode,slotKey] of [['SA25','SASAP','mosp'],['HU25','HUSPK','sprk'],['NA25','NANAA','nave']]){
  const p=artifact.programs.find(p=>p.code===code),reference={catalogId:artifact.catalogId,programRef:{code:p.code,version:p.version},orientationCode,startedOn:'2026-08-17',specializationRefs:[],choiceBlocks:[...defaultProgramplanChoiceBlocks(p,orientationCode),{id:'pf1',kind:'specialization',points:100,name:'Valbar fördjupning'}]};
  const rs=programplanTermRows(p,reference),ds=suggestProgramplanTerms(rs,[],programplanLevelRanks(p));
  const slot=rs.find(r=>r.key===`block:${slotKey}`),parts=ds.find(d=>d.rowKey===slot.key).points;
  assert.deepEqual(parts,slot.part==='programmeSpecific'?[slot.points/4,slot.points/4,slot.points/4,slot.points/4,0,0]:[0,0,slot.points/4,slot.points/4,slot.points/4,slot.points/4]);
  assert.deepEqual(ds.find(d=>d.rowKey==='block:pf1').points,[0,0,25,25,25,25]);
 }
});
