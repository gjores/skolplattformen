import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { programplanTermRows, programplanTermTotals, validateProgramplanTermDistribution } from './programplan-terms.ts';
import { parseProgramplanTermWrite, parseProgramplanTermReply, parseProgramplanTermDistribution } from './programplan-terms-contract.ts';
const catalog = JSON.parse(readFileSync(new URL('./programplan-catalog.generated.json', import.meta.url)));
const program = catalog.programs.find(p => p.code === 'SA25');
const basis = { catalogId: catalog.catalogId, programRef: { code: program.code, version: program.version }, orientationCode: 'SABEP', startedOn: '2026-08-01', specializationRefs: [{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100}] };
const id='55001800-0000-4000-8000-000000000001';
test('exact fixed levels, chosen specialization and two frames; alternatives remain unresolved',()=>{
 const rows=programplanTermRows(program,basis);
 assert.equal(rows.some(r=>r.key.startsWith('foundation:SVEN:')),false);
 assert.equal(rows.some(r=>r.key.startsWith('foundation:SVEA:')),false);
 assert.equal(rows.filter(r=>r.part==='specialization').length,1);
 assert.equal(rows.find(r=>r.key==='specialization:ENGE:1:ENGE3000X').points,100);
 assert.equal(rows.find(r=>r.key==='meta:individualChoice').points,200);
 assert.equal(rows.find(r=>r.key==='meta:diplomaWork').points,100);
 assert.equal(new Set(rows.map(r=>r.key)).size,rows.length);
 assert.throws(()=>programplanTermRows(program,{...basis,orientationCode:null}));
 assert.throws(()=>programplanTermRows(program,{...basis,programRef:{code:'XX',version:1}}));
 assert.throws(()=>programplanTermRows(program,{...basis,specializationRefs:[{...basis.specializationRefs[0],subjectVersion:2}]}));
});
test('draft permits partial allocation but rejects unknown rows and all overflows',()=>{
 const rows=programplanTermRows(program,basis),distribution=[{rowKey:'specialization:ENGE:1:ENGE3000X',points:[0,0,25,25,0,0]}];
 const totals=programplanTermTotals(rows,distribution);
 assert.deepEqual(totals.terms,[0,0,25,25,0,0]);assert.equal(totals.allocated,50);assert.equal(totals.remaining,totals.total-50);
 for(const points of [[100,1,0,0,0,0],[-1,0,0,0,0,0],[0.5,0,0,0,0,0],[0,0,0,0,0]])assert.throws(()=>validateProgramplanTermDistribution(rows,[{rowKey:distribution[0].rowKey,points}]));
 assert.throws(()=>validateProgramplanTermDistribution(rows,[...distribution,...distribution]));
 assert.throws(()=>validateProgramplanTermDistribution(rows,[{rowKey:'foundation:SVEN:1:SVEN1000X',points:[0,0,0,0,0,0]}]));
});
test('closed distribution/request/reply rejects sparse arrays, accessors and foreign fields',()=>{
 const distribution=[{rowKey:'meta:diplomaWork',points:[0,0,0,0,0,100]}],input={planId:id,expectedRevision:4,distribution};
 assert.deepEqual(parseProgramplanTermWrite(input),input);
 assert.deepEqual(parseProgramplanTermReply({planId:id,revision:5,status:'utkast',distribution}),{planId:id,revision:5,status:'utkast',distribution});
 for(const value of [{...input,actorId:id},{...input,expectedRevision:-1},{...input,planId:'bad'},{...input,expectedRevision:2147483647}])assert.throws(()=>parseProgramplanTermWrite(value));
 for(const value of [[...distribution,...distribution],[{rowKey:'meta:unknown',points:[0,0,0,0,0,0]}],[{rowKey:'meta:diplomaWork',points:[0,0,0,0,0]}],[{rowKey:'meta:diplomaWork',points:[-1,0,0,0,0,0]}],[{rowKey:'meta:diplomaWork',points:[0.5,0,0,0,0,0]}],Array(1),Array.from({length:2001},()=>distribution[0])])assert.throws(()=>parseProgramplanTermDistribution(value));
 const sparse=Array(6);for(const i of [0,1,3,4,5])sparse[i]=0;assert.throws(()=>parseProgramplanTermDistribution([{rowKey:'meta:diplomaWork',points:sparse}]));
 const accessor={};Object.defineProperty(accessor,'rowKey',{get(){throw Error('must not execute');},enumerable:true});accessor.points=[0,0,0,0,0,0];assert.throws(()=>parseProgramplanTermDistribution([accessor]),e=>e.code==='invalid_programplan_terms');
 const extra=[0,0,0,0,0,0];extra.hidden=1;assert.throws(()=>parseProgramplanTermDistribution([{rowKey:'meta:diplomaWork',points:extra}]));
 assert.throws(()=>parseProgramplanTermReply({planId:id,revision:0,status:'approved',distribution:[]}));
});

test('05-23 A tracer: v2 SA25 includes Swedish alternatives and modern language frame',()=>{
 const refs=['ENGE3000X','ANIM1000X','ANIM2000X'].map(itemCode=>{const s=program.specialization.find(s=>s.levels.some(l=>l.code===itemCode)),l=s.levels.find(l=>l.code===itemCode);return{subjectCode:s.code,subjectVersion:s.subjectVersion,itemCode,points:l.points};});
 const v2={...basis,specializationRefs:refs,choiceBlocks:[{id:'mosp',kind:'modernLanguage',points:200,name:'Moderna språk'},{id:'iv1',kind:'individualChoice',points:200,name:'Individuellt val'}]};
 const rows=programplanTermRows(program,v2);
 assert.equal(rows.filter(r=>r.key.startsWith('alternative:foundation:')).length,3);
 assert.equal(rows.find(r=>r.key==='block:mosp')?.points,200);
 assert.equal(rows.some(r=>r.key==='meta:individualChoice'),false);
 assert.equal(rows.reduce((s,r)=>s+r.points,0),2500);
});

test('all 29 pinned programs and every orientation expose exact v2 alternatives and slots, preserving legacy rows',async()=>{
 const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');
 assert.equal(catalog.programs.length,29);
 const mosp={EK25:100,HU25:200,NA25:100,SA25:200,SM25:300};
 for(const p of catalog.programs)for(const orientation of p.orientations.length?p.orientations:[null]){
   const legacy={catalogId:catalog.catalogId,programRef:{code:p.code,version:p.version},orientationCode:orientation?.code??null,startedOn:'2026-08-01',specializationRefs:[]};
   const choiceBlocks=defaultProgramplanChoiceBlocks(p,legacy.orientationCode),v2={...legacy,choiceBlocks},rows=programplanTermRows(p,v2);
   const alternatives=rows.filter(r=>r.key.startsWith('alternative:'));
   assert.equal(alternatives.length,3,`${p.code}/${orientation?.code}`);assert.deepEqual(alternatives.map(r=>r.points),[100,100,100]);
   assert.deepEqual(alternatives.map(r=>r.name),Array(3).fill('Svenska/svenska som andraspråk'));
   assert.equal(rows.some(r=>r.key==='meta:individualChoice'),false);
   const expected=[...(mosp[p.code]?[['mosp',mosp[p.code]]]:[]),...(p.code==='HU25'&&orientation?.code==='HUSPK'?[['sprk',300]]:[]),...(p.code==='NA25'&&orientation?.code==='NANAA'?[['nave',100]]:[]),['iv1',200]];
   assert.deepEqual(rows.filter(r=>r.key.startsWith('block:')).map(r=>[r.key.slice(6),r.points]),expected);
   const oldRows=programplanTermRows(p,legacy);
   assert.deepEqual(rows.filter(r=>!r.key.startsWith('alternative:')&&!r.key.startsWith('block:')),oldRows.filter(r=>r.key!=='meta:individualChoice'));
 }
});
test('SA25 all orientations reach 2500 with exact selected specialization; alternatives rank in source order',async()=>{
 const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');
 const {programplanLevelRanks,suggestProgramplanTerms}=await import('./programplan-terms.ts');
 for(const orientation of program.orientations){
  const refs=['ENGE3000X','ANIM1000X','ANIM2000X'].map(code=>{const s=program.specialization.find(s=>s.levels.some(l=>l.code===code)),l=s.levels.find(l=>l.code===code);return{subjectCode:s.code,subjectVersion:s.subjectVersion,itemCode:l.code,points:l.points};});
  const rows=programplanTermRows(program,{...basis,orientationCode:orientation.code,specializationRefs:refs,choiceBlocks:defaultProgramplanChoiceBlocks(program,orientation.code)}),ranks=programplanLevelRanks(program),distribution=suggestProgramplanTerms(rows,[],ranks);
  assert.equal(programplanTermTotals(rows,distribution).allocated,2500);
  const alternatives=rows.filter(r=>r.key.startsWith('alternative:'));
  assert.deepEqual(alternatives.map(r=>ranks.get(`alternative:${r.key.split(':').slice(2).join(':')}`)),[0,1,2]);
  assert.deepEqual(alternatives.map(r=>distribution.find(d=>d.rowKey===r.key).points),[[50,50,0,0,0,0],[0,0,50,50,0,0],[0,0,0,0,50,50]]);
  assert.deepEqual(parseProgramplanTermDistribution(distribution),distribution);
 }
});

test('v2 uses whole verified program as allocation target while legacy and vocational targets remain their row totals',async()=>{
 const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');
 const {programplanTermTarget}=await import('./programplan-terms.ts');
 const legacyRows=programplanTermRows(program,basis),v2Rows=programplanTermRows(program,{...basis,choiceBlocks:defaultProgramplanChoiceBlocks(program,basis.orientationCode)});
 assert.equal(v2Rows.reduce((s,r)=>s+r.points,0),2300);assert.equal(programplanTermTarget(program,v2Rows),2500);
 assert.equal(programplanTermTarget(program,legacyRows),legacyRows.reduce((s,r)=>s+r.points,0));
 const ba=catalog.programs.find(p=>p.code==='BA25'),ref={...basis,programRef:{code:ba.code,version:ba.version},orientationCode:ba.orientations[0].code,specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(ba,ba.orientations[0].code)},rows=programplanTermRows(ba,ref);
 assert.equal(programplanTermTarget(ba,rows),rows.reduce((s,r)=>s+r.points,0));
});
