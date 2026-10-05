import test from 'node:test';
import catalog from './programplan-catalog.generated.json' with {type:'json'};
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

test('school packages distinguish unsaved suggestions, missing language tracks and keep findings scoped',async()=>{
 const {proposeLanguagePackages}=await import('./programplan-packages.ts');const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');const{analyseProgramplanPackages}=await import('./programplan-analysis.ts');
 const program=catalog.programs.find(p=>p.code==='SA25');const basis={catalogId:catalog.catalogId,programRef:{code:program.code,version:program.version},orientationCode:program.orientations[0].code,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,program.orientations[0].code)};
 const entries=proposeLanguagePackages(basis.choiceBlocks.find(b=>b.id==='mosp'));const units=[{id:'55002300-0000-4000-8000-000000000001',name:'Skola A'},{id:'55002300-0000-4000-8000-000000000002',name:'Skola B'}];
 const input={program,orientationCode:basis.orientationCode,refs:[],startedOn:basis.startedOn,sourceFetched:null,basisReference:basis,units,packages:{planId:units[0].id,units:[{unitId:units[0].id,revision:1,selections:[{blockId:'mosp',entries:entries.slice(0,5)}]}]}};
 const issues=analyseProgramplanPackages(input);assert.ok(issues.some(i=>i.unitId===units[0].id&&i.category==='info'&&i.title.includes('Tyska')));assert.ok(issues.some(i=>i.unitId===units[1].id&&i.category==='fel'&&i.id.includes('missing')));for(const i of issues){assert.ok(units.some(u=>u.id===i.unitId));assert.equal(i.action,'Visa paket');assert.equal(i.target.kind,'package');assert.equal(i.target.unitId,i.unitId);}
});
test('package frame mismatch and reverse level start are errors while actual overlap is a risk',async()=>{
 const {proposeLanguagePackages,programplanPackageLevelKey}=await import('./programplan-packages.ts');const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');const{analyseProgramplanPackages}=await import('./programplan-analysis.ts');
 const program=catalog.programs.find(p=>p.code==='SA25'),unit='55002300-0000-4000-8000-000000000001',basis={catalogId:catalog.catalogId,programRef:{code:program.code,version:program.version},orientationCode:program.orientations[0].code,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,program.orientations[0].code)},entry=proposeLanguagePackages(basis.choiceBlocks[0])[0];
 const input={program,orientationCode:basis.orientationCode,refs:[],startedOn:basis.startedOn,sourceFetched:null,basisReference:basis,units:[{id:unit,name:'Skola A'}],terms:{rows:[],ranks:new Map(),distribution:[{rowKey:'block:mosp',points:[100,0,100,0,0,0]}]},packages:{planId:unit,units:[{unitId:unit,revision:1,selections:[{blockId:'mosp',entries:[entry]}]}]}};
 entry.distribution=entry.ref.levels.map((l,i)=>({levelKey:programplanPackageLevelKey(l),points:i===0?[0,0,100,0,0,0]:[100,0,0,0,0,0]}));let issues=analyseProgramplanPackages(input);assert.ok(issues.some(i=>i.id.includes('order')&&i.category==='fel'));entry.distribution.forEach(d=>d.points=[0,50,0,0,50,0]);issues=analyseProgramplanPackages(input);assert.ok(issues.some(i=>i.id.includes('overlap')&&i.category==='risk'));assert.ok(issues.some(i=>i.id.includes('frame')&&i.category==='fel'));assert.ok(!issues.some(i=>i.id.includes('order')));
});

 test('vocational eligibility recognises real SVEN/SVEA 1–3 and ENGE 1–2 in fixed rows',async()=>{const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');const{programplanTermRows}=await import('./programplan-terms.ts');const{analyseProgramplanPackages}=await import('./programplan-analysis.ts');const p=catalog.programs.find(p=>p.code==='BA25'),basis={catalogId:catalog.catalogId,programRef:{code:p.code,version:p.version},orientationCode:p.orientations[0].code,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(p,p.orientations[0].code)},base={program:p,orientationCode:basis.orientationCode,refs:[],startedOn:basis.startedOn,sourceFetched:null,basisReference:basis,units:[{id:'55002300-0000-4000-8000-000000000001',name:'Yrkesprogramskola'}],terms:{rows:programplanTermRows(p,basis),distribution:[],ranks:new Map()}};assert.ok(!analyseProgramplanPackages(base).some(i=>i.category==='risk'&&(i.id.includes('right-SVEN')||i.id.includes('right-ENGE'))));const missing={...base,terms:{...base.terms,rows:base.terms.rows.filter(r=>!r.key.includes('ENGE2000X'))}};assert.ok(analyseProgramplanPackages(missing).some(i=>i.id.includes('right-ENGE')&&i.category==='risk'));});

const {analyseProgramplanPackages}=await import('./programplan-analysis.ts');
const {defaultProgramplanChoiceBlocks}=await import('./programplan-choice-blocks.ts');
const {programplanTermRows,programplanLevelRanks}=await import('./programplan-terms.ts');
const {proposeLanguagePackages,programplanPackageLevelKey}=await import('./programplan-packages.ts');
const du='55002300-0000-4000-8000-000000000001',dp='55002300-0000-4000-8000-000000000002';
const dl=(subject,item)=>{const s=catalog.subjects.find(s=>s.code===subject),l=s.items.find(l=>l.code===item);return{subjectCode:subject,subjectVersion:s.version,itemCode:item,points:l.points};};
const dv=(levels,extra={})=>({packageId:dp,version:1,unitId:du,kind:'individualChoice',name:'Syntetiskt paket',catalogId:catalog.catalogId,levels,points:levels.reduce((n,l)=>n+l.points,0),...extra});
const de=p=>({ref:{type:'package',packageId:p.packageId,version:p.version},distribution:p.levels.map(l=>({levelKey:programplanPackageLevelKey(l),points:[l.points,0,0,0,0,0]}))});
function di(){const p=program('SA25'),basis={catalogId:catalog.catalogId,programRef:{code:p.code,version:p.version},orientationCode:p.orientations[0].code,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(p,p.orientations[0].code)};basis.choiceBlocks=basis.choiceBlocks.map(b=>b.id==='iv1'?{...b,points:100}:b);basis.choiceBlocks.push({id:'iv2',kind:'individualChoice',points:100,name:'Andra IV-blocket'});return{program:p,orientationCode:basis.orientationCode,refs:[],startedOn:basis.startedOn,sourceFetched:null,basisReference:basis,units:[{id:du,name:'Skola A'}],terms:{rows:programplanTermRows(p,basis),distribution:basis.choiceBlocks.map(b=>({rowKey:`block:${b.id}`,points:[b.points,0,0,0,0,0]})),ranks:programplanLevelRanks(p)},packages:{planId:dp,units:[{unitId:du,revision:1,selections:[]}]},valpaket:[]};}

test('split IV rights aggregate all blocks once per school and aesthetic remains source-aware manual check',()=>{
 const x=di(),sport=dv([dl('IDRO','IDRO2000X')]),art=dv([dl('BILD','BILD1B00X')],{packageId:'55002300-0000-4000-8000-000000000003'});x.valpaket=[sport,art];x.packages.units[0].selections=[{blockId:'iv1',entries:[de(art)]},{blockId:'iv2',entries:[de(sport)]}];
 const issues=analyseProgramplanPackages(x);assert.equal(issues.filter(i=>i.id.includes('right-sport')).length,1);assert.equal(issues.find(i=>i.id.includes('right-sport')).category,'ok');const aesthetic=issues.filter(i=>i.id.includes('right-art'));assert.equal(aesthetic.length,1);assert.equal(aesthetic[0].category,'info');assert.match(aesthetic[0].detail,/BILD, IDRO/);assert.ok(!issues.some(i=>i.id.includes('export')));
 x.packages.units[0].selections.pop();assert.equal(analyseProgramplanPackages(x).find(i=>i.id.endsWith('right-sport')).category,'risk');
});
test('missing immutable version blocks decision and is never resolved through newest package',()=>{
 const x=di(),p=dv([dl('IDRO','IDRO2000X')]);x.valpaket=[{...p,version:2}];x.packages.units[0].selections=[{blockId:'iv1',entries:[de(p)]}];const issues=analyseProgramplanPackages(x);assert.ok(issues.some(i=>i.id.includes('missing-version')&&i.category==='fel'));assert.ok(issues.some(i=>i.id.endsWith('right-sport')&&i.category==='risk'));
 x.valpaket=[p];assert.equal(analyseProgramplanPackages(x).some(i=>i.id.includes('missing-version')),false);
});
test('generic sequence uses subject rank independent of package array order and compares unrelated subjects separately',()=>{
 const x=di();x.basisReference.choiceBlocks=x.basisReference.choiceBlocks.filter(b=>b.id!=='iv2').map(b=>b.id==='iv1'?{...b,points:200}:b);
 const p=dv([dl('BILD','BILD2000X'),dl('BILD','BILD1B00X')]);x.valpaket=[p];x.packages.units[0].selections=[{blockId:'iv1',entries:[{...de(p),distribution:[{levelKey:programplanPackageLevelKey(p.levels[0]),points:[100,0,0,0,0,0]},{levelKey:programplanPackageLevelKey(p.levels[1]),points:[0,100,0,0,0,0]}]}]}];
 assert.ok(analyseProgramplanPackages(x).some(i=>i.id.includes('order')&&i.category==='fel'));x.packages.units[0].selections[0].entries[0].distribution[1].points=[100,0,0,0,0,0];assert.ok(analyseProgramplanPackages(x).some(i=>i.id.includes('overlap')&&i.category==='risk'));
 p.levels=[dl('IDRO','IDRO2000X'),dl('BILD','BILD1B00X')];x.packages.units[0].selections[0].entries=[de(p)];assert.equal(analyseProgramplanPackages(x).some(i=>i.id.includes('order')||i.id.includes('overlap')),false);
});
test('same exact level across IV blocks is a school-scoped risk and comparability stays Att kontrollera',()=>{
 const x=di(),p=dv([dl('IDRO','IDRO2000X')]);x.valpaket=[p];x.packages.units[0].selections=['iv1','iv2'].map(blockId=>({blockId,entries:[de(p)]}));const issues=analyseProgramplanPackages(x),duplicate=issues.find(i=>i.id.includes('duplicate'));assert.equal(duplicate.category,'risk');assert.equal(duplicate.unitId,du);assert.equal(issues.find(i=>i.id.includes('comparability')).category,'info');
});
test('IV right risks do not prevent a complete high-school plan from being ready for decision',()=>{
 const x=di();x.basisReference.specializationRefs=[dl('ANIM','ANIM1000X'),dl('ARTI','ARTI1000X'),dl('DIGA','DIGA1000X')];x.refs=x.basisReference.specializationRefs;
 x.terms.rows=programplanTermRows(x.program,x.basisReference);x.terms.distribution=x.terms.rows.map(r=>({rowKey:r.key,points:[r.points,0,0,0,0,0]}));
 const art=dv([dl('BILD','BILD1B00X')]),science=dv([dl('KEMI','KEMI1000X')],{packageId:'55002300-0000-4000-8000-000000000003'});x.valpaket=[art,science];const language=proposeLanguagePackages(x.basisReference.choiceBlocks.find(b=>b.id==='mosp'));language.forEach(e=>e.distribution=e.ref.levels.map(l=>({levelKey:programplanPackageLevelKey(l),points:[100,0,0,0,0,0]})));x.packages.units[0].selections=[{blockId:'mosp',entries:language},{blockId:'iv1',entries:[de(art)]},{blockId:'iv2',entries:[de(science)]}];
 const a=analyseProgramplan(x);assert.equal(a.counts.fel,0,JSON.stringify(a.issues.filter(i=>i.category==='fel')));assert.equal(a.ready,true);assert.ok(a.issues.some(i=>i.id.endsWith('right-sport')&&i.category==='risk'));assert.ok(a.issues.some(i=>i.id.endsWith('right-art')&&i.category==='info'));
});
