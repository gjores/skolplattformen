import test from 'node:test';
import assert from 'node:assert/strict';
import artifact from './programplan-catalog.generated.json' with { type: 'json' };
import { analyseProgramplan, programplanLevelOrderIssues } from './programplan-analysis.ts';

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

test('level order uses starts and shared terms, including alternative rows',()=>{
 const rows=[{key:'foundation:ENGE:1:ENGE1000X',name:'Engelska',levelName:'Nivå 1',points:100,part:'foundation'},{key:'foundation:ENGE:1:ENGE2000X',name:'Engelska',levelName:'Nivå 2',points:100,part:'foundation'}],ranks=new Map([['ENGE:ENGE1000X',0],['ENGE:ENGE2000X',1]]);
 const check=(a,b)=>programplanLevelOrderIssues(rows,[{rowKey:rows[0].key,points:a},{rowKey:rows[1].key,points:b}],ranks);
 assert.equal(check([0,100,0,0,0,0],[100,0,0,0,0,0])[0].id,'level-order-'+rows[1].key);
 assert.equal(check([100,0,0,0,0,0],[100,0,0,0,0,0])[0].category,'risk');
 assert.equal(check([100,0,0,0,0,0],[0,100,0,0,0,0]).length,0);
 assert.equal(check([50,0,50,0,0,0],[0,50,0,50,0,0]).length,0);
});

test('current total and specialization frame include own blocks and legacy is explicitly incomplete',async()=>{
 const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');
 const {programplanTermRows,programplanLevelRanks}=await import('./programplan-terms.ts');
 const p=program('SA25'),orientationCode='SASAP',basis={catalogId:artifact.catalogId,programRef:{code:p.code,version:p.version},orientationCode,startedOn:'2026-08-17',specializationRefs:[],choiceBlocks:[...defaultProgramplanChoiceBlocks(p,orientationCode),{id:'pf1',kind:'specialization',points:300,name:'Valbar fördjupning'}]};
 const analyze=b=>analyseProgramplan({program:p,orientationCode,refs:[],startedOn:b.startedOn,sourceFetched:null,basisReference:b,terms:{rows:programplanTermRows(p,b),distribution:[],ranks:programplanLevelRanks(p)}});
 const full=analyze(basis);assert.ok(ids(full).includes('specialization-ok'));assert.equal(ids(full).includes('specialization-under'),false);assert.equal(ids(full).includes('total-points'),false);assert.equal(ids(full).includes('alternatives-foundation'),false);assert.equal(ids(full).some(id=>id.startsWith('levels-programmeSpecific-MOSP')),false);
 const short=analyze({...basis,choiceBlocks:basis.choiceBlocks.filter(b=>b.id!=='pf1')});assert.ok(ids(short).includes('total-points'));assert.ok(ids(short).includes('specialization-under'));
 const old={...basis};delete old.choiceBlocks;assert.ok(ids(analyze(old)).includes('legacy-incomplete'));
 const invalid=analyseProgramplan({program:p,orientationCode,refs:[],startedOn:basis.startedOn,sourceFetched:null,basisReference:{...basis,choiceBlocks:basis.choiceBlocks.map(b=>b.id==='iv1'?{...b,points:100}:b)}});assert.ok(ids(invalid).includes('individual-choice-points'));
});
test('Swedish alternative levels follow the same start and overlap diagnostics',async()=>{
 const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');const {programplanTermRows,programplanLevelRanks}=await import('./programplan-terms.ts');
 const p=program('SA25'),b={catalogId:artifact.catalogId,programRef:{code:p.code,version:p.version},orientationCode:'SASAP',startedOn:'2026-08-17',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(p,'SASAP')};
 const rows=programplanTermRows(p,b).filter(r=>r.key.startsWith('alternative:')).slice(0,2),ranks=programplanLevelRanks(p);
 const issues=programplanLevelOrderIssues(rows,[{rowKey:rows[0].key,points:[0,100,0,0,0,0]},{rowKey:rows[1].key,points:[100,0,0,0,0,0]}],ranks);assert.equal(issues.length,1);assert.equal(issues[0].id,'level-order-'+rows[1].key);assert.equal(issues[0].category,'fel');
});
