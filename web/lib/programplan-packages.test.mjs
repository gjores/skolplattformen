import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './programplan-catalog.generated.json' with {type:'json'};
import {defaultProgramplanChoiceBlocks} from './programplan-choice-blocks.ts';
import {mergeProgramplanUnitPackages,proposeLanguagePackages,createLanguagePackage,programplanPackageKey,programplanPackageLevelKey,suggestPackageDistribution,parseProgramplanPackageWrite,parseProgramplanUnitPackages,validateProgramplanPackageEntries} from './programplan-packages.ts';
const id='55002300-0000-4000-8000-000000000001',unit='55002300-0000-4000-8000-000000000002';
function context(code='SA25'){const program=catalog.programs.find(p=>p.code===code);const basis={catalogId:catalog.catalogId,programRef:{code,version:program.version},orientationCode:program.orientations[0]?.code??null,startedOn:'2027-08-15',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,program.orientations[0]?.code??null)};return{program,basis,block:basis.choiceBlocks.find(b=>b.kind==='modernLanguage')};}
test('six proposals use block points, correct consecutive starts and distinct value keys',()=>{for(const [code,count] of [['EK25',1],['NA25',1],['SA25',2],['HU25',2],['SM25',3]]){const {block}=context(code),entries=proposeLanguagePackages(block);assert.equal(entries.length,6);assert.equal(new Set(entries.map(x=>programplanPackageKey(x.ref))).size,6);for(const e of entries){assert.equal(e.ref.levels.length,count);assert.equal(e.ref.levels.reduce((n,l)=>n+l.points,0),block.points);assert.deepEqual(e.distribution,[]);}assert.deepEqual(entries[0].ref.levels.map(l=>l.itemCode),['MODO1000X','MODO2000X','MODF1000X'].slice(0,count));assert.deepEqual(entries[1].ref.levels.map(l=>l.itemCode),['MODY1000X','MODG1000X','MODO1000X'].slice(0,count));}});
test('ladder permits continuation 2 to advanced 1, sign and minority, rejects gaps, unknown code, false version, fixed level and wrong frame points',()=>{const {program,basis}=context(),ref=createLanguagePackage('de','modern',3,200);assert.deepEqual(ref.levels.map(l=>l.itemCode),['MODO2000X','MODF1000X']);const entry={ref,distribution:[]};assert.equal(validateProgramplanPackageEntries(program,basis,'mosp',[entry],catalog).length,1);for(const mutate of [e=>e.ref.languageCode='xx',e=>e.ref.levels[1].itemCode='MODF2000X',e=>e.ref.levels[0].subjectVersion=2,e=>e.ref.levels.pop()]){const e=structuredClone(entry);mutate(e);assert.throws(()=>validateProgramplanPackageEntries(program,basis,'mosp',[e],catalog));}assert.throws(()=>createLanguagePackage('fr','sign',0,200));assert.throws(()=>createLanguagePackage(null,'modern',0,200));assert.throws(()=>createLanguagePackage('de','FINX',0,200));const fi=createLanguagePackage('fi','FINX',0,200);validateProgramplanPackageEntries(program,basis,'mosp',[{ref:fi,distribution:[]}],catalog);const sign=createLanguagePackage(null,'sign',0,200);validateProgramplanPackageEntries(program,basis,'mosp',[{ref:sign,distribution:[]}],catalog);const clone=structuredClone(basis);clone.specializationRefs=[ref.levels[0]];assert.throws(()=>validateProgramplanPackageEntries(program,clone,'mosp',[entry],catalog));});
test('distribution walks the frame in order, preserves integers and allows unfinished frame',()=>{const ref=createLanguagePackage('fr','modern',2,200);const frame=[50,50,50,50,0,0];const d=suggestPackageDistribution(frame,ref.levels);assert.deepEqual(d.map(x=>x.points),[[50,50,0,0,0,0],[0,0,50,50,0,0]]);assert.deepEqual(frame,[50,50,50,50,0,0]);assert.deepEqual(suggestPackageDistribution([0,50,0,0,0,0],ref.levels).map(x=>x.points),[[0,50,0,0,0,0],[0,0,0,0,0,0]]);assert.throws(()=>suggestPackageDistribution([1.5,0,0,0,0,0],ref.levels));});
test('strict request/result parser rejects extras, sparse arrays, getters, duplicated ids/rows, oversized points and malformed package refs',()=>{const entry=proposeLanguagePackages(context().block)[0],body={planId:id,unitId:unit,expectedRevision:0,blockId:'mosp',entries:[entry]};assert.deepEqual(parseProgramplanPackageWrite(body),body);const result={planId:id,units:[{unitId:unit,revision:1,selections:[{blockId:'mosp',entries:[entry]}]}]};assert.deepEqual(parseProgramplanUnitPackages(result),result);for(const mutate of [x=>x.actorId=id,x=>x.entries=[...x.entries,...x.entries],x=>x.entries[0].ref.languageCode='XX',x=>x.entries[0].ref={type:'package',packageId:id,version:0},x=>x.entries[0].distribution=[{levelKey:programplanPackageLevelKey(entry.ref.levels[0]),points:[101,0,0,0,0,0]}]]){const b=structuredClone(body);mutate(b);assert.throws(()=>parseProgramplanPackageWrite(b));}const sparse=Array(1);assert.throws(()=>parseProgramplanPackageWrite({...body,entries:sparse}));const accessor={};Object.defineProperty(accessor,'type',{get(){throw Error('getter executed');},enumerable:true});assert.throws(()=>parseProgramplanPackageWrite({...body,entries:[{ref:accessor,distribution:[]}]}),e=>e.code==='invalid_programplan_packages');assert.throws(()=>parseProgramplanUnitPackages({...result,units:[...result.units,...result.units]}));});
test('valid imperfect distribution stays saveable for analysis, but orphan and excessive level allocation do not',()=>{const {program,basis,block}=context(),entry=proposeLanguagePackages(block)[0];entry.distribution=entry.ref.levels.map(l=>({levelKey:programplanPackageLevelKey(l),points:[0,0,0,0,0,100]}));assert.equal(validateProgramplanPackageEntries(program,basis,'mosp',[entry],catalog).length,1);entry.distribution[0].points[5]=101;assert.throws(()=>validateProgramplanPackageEntries(program,basis,'mosp',[entry],catalog));entry.distribution[0]={levelKey:'OTHER:1:OTHER1000X',points:[0,0,0,0,0,0]};assert.throws(()=>validateProgramplanPackageEntries(program,basis,'mosp',[entry],catalog));});

test('out-of-order whole replies retain each school latest confirmed revision and choices',()=>{
 const unitB='55002300-0000-4000-8000-000000000003';const entries=proposeLanguagePackages(context().block);
 const school=(unitId,revision,entry)=>({unitId,revision,selections:entry?[{blockId:'mosp',entries:[entry]}]:[]});
 const current={planId:id,units:[school(unit,2,entries[0]),school(unitB,0,null)]};
 const delayed={planId:id,units:[school(unit,1,entries[1]),school(unitB,1,entries[2])]};
 const merged=mergeProgramplanUnitPackages(current,delayed);assert.equal(merged.units[0].revision,2);assert.deepEqual(merged.units[0].selections,current.units[0].selections);assert.deepEqual(merged.units[1],delayed.units[1]);assert.deepEqual(mergeProgramplanUnitPackages(merged,current),merged);
 assert.throws(()=>mergeProgramplanUnitPackages(current,{...delayed,planId:unit}));assert.throws(()=>mergeProgramplanUnitPackages(current,{...delayed,units:delayed.units.slice(0,1)}));
});

const dmod=await import('./programplan-packages.ts');
const genericLevel=(subject,item)=>{const s=catalog.subjects.find(s=>s.code===subject&&s.schoolTypes.includes('GY'));const l=s.items.find(i=>i.code===item);return{subjectCode:s.code,subjectVersion:s.version,itemCode:l.code,points:l.points};};
const pack=(kind,levels,extra={})=>({packageId:id,version:1,unitId:unit,kind,name:'Provpaket',catalogId:catalog.catalogId,levels,points:levels.reduce((n,l)=>n+l.points,0),...extra});
const genericEntry=p=>({ref:{type:'package',packageId:p.packageId,version:p.version},distribution:[]});

test('generic creation and immutable version DTO are closed and anchored to real GY levels',()=>{
 const p=pack('individualChoice',[genericLevel('IDRO','IDRO2000X')]);
 const request={packageId:null,expectedVersion:0,details:{unitId:p.unitId,kind:p.kind,name:p.name,levels:p.levels}};
 assert.deepEqual(dmod.parseProgramplanValpaketWrite(request),request);assert.deepEqual(dmod.parseProgramplanValpaket(p),p);
 for(const mutate of [x=>x.expectedVersion=1,x=>x.packageId=id,x=>x.details.catalogId=catalog.catalogId,x=>x.details.name=' ',x=>x.details.name=' extra ',x=>x.details.name='a\nline',x=>x.details.kind='modernLanguage',x=>x.details.levels[0].points=101,x=>x.details.levels.push(x.details.levels[0]),x=>x.details.levels[0].subjectVersion=99]){const v=structuredClone(request);mutate(v);assert.throws(()=>dmod.parseProgramplanValpaketWrite(v));}
 assert.throws(()=>dmod.parseProgramplanValpaket({...p,points:200}));assert.throws(()=>dmod.parseProgramplanValpaket({...p,catalogId:'sha256:'+'0'.repeat(64)}));
 for(const subject of ['MODY','MODG','MODO','MODF','MODE']){const s=catalog.subjects.find(s=>s.code===subject);assert.throws(()=>dmod.parseProgramplanValpaketWrite({...request,details:{...request.details,levels:[genericLevel(subject,s.items[0].code)]}}));}
});
test('generic school refs preserve exact version and refuse new-version fallback, catalog and school substitution',()=>{
 const p=pack('individualChoice',[genericLevel('IDRO','IDRO2000X')]),entry=genericEntry(p),{program,basis}=context();
 assert.equal(programplanPackageKey(entry.ref),`package:${id}@1`);assert.deepEqual(parseProgramplanPackageWrite({planId:id,unitId:unit,expectedRevision:1,blockId:'iv1',entries:[entry]}).entries,[entry]);
 // IV is 200 points: use a second eligible level, not a silently larger reference.
 p.levels.push(genericLevel('BILD','BILD1B00X'));p.points=200;
 assert.deepEqual(dmod.programplanPackageLevels(entry.ref,catalog,{unitId:unit,packages:[p]}),p.levels);
 assert.equal(validateProgramplanPackageEntries(program,basis,'iv1',[entry],catalog,{unitId:unit,packages:[p]}).length,1);
 for(const packages of [[],[{...p,version:2}],[{...p,unitId:id}],[{...p,catalogId:'sha256:'+'0'.repeat(64)}]])assert.throws(()=>validateProgramplanPackageEntries(program,basis,'iv1',[entry],catalog,{unitId:unit,packages}));
 assert.throws(()=>dmod.programplanPackageLevels(entry.ref));
 const dto={unitId:unit,packages:[p,{...p,version:2}]};assert.deepEqual(dmod.parseProgramplanValpaketList(dto),dto);assert.throws(()=>dmod.parseProgramplanValpaketList({...dto,packages:[p,p]}));assert.throws(()=>dmod.parseProgramplanValpaketList({...dto,packages:[{...p,unitId:id}]}));
});
test('NAVE and SPRK generic packages enforce subjects and fixed levels, all kinds match their block',()=>{
 const na=context('NA25');na.basis.orientationCode='NANAA';na.basis.choiceBlocks=defaultProgramplanChoiceBlocks(na.program,'NANAA');
 const p=pack('naturalScience',[genericLevel('BIOG','BIOG2000X')]),entry=genericEntry(p);
 assert.equal(validateProgramplanPackageEntries(na.program,na.basis,'nave',[entry],catalog,{unitId:unit,packages:[p]}).length,1);
 assert.throws(()=>dmod.parseProgramplanValpaket({...p,levels:[genericLevel('BILD','BILD1B00X')]}));
 assert.throws(()=>validateProgramplanPackageEntries(na.program,na.basis,'mosp',[entry],catalog,{unitId:unit,packages:[p]}));
 const hu=context('HU25');hu.basis.orientationCode='HUSPK';hu.basis.choiceBlocks=defaultProgramplanChoiceBlocks(hu.program,'HUSPK');
 const latin=pack('languageSubject',[1,2,3].map(i=>genericLevel('LATI',`LATI${i}000X`)));
 assert.throws(()=>validateProgramplanPackageEntries(hu.program,hu.basis,'sprk',[genericEntry(latin)],catalog,{unitId:unit,packages:[latin]}));
 const en=pack('languageSubject',[genericLevel('ENGE','ENGE3000X'),genericLevel('KLAS','KLAS1000X'),genericLevel('LATI','LATI2000X')]);
 assert.equal(validateProgramplanPackageEntries(hu.program,hu.basis,'sprk',[genericEntry(en)],catalog,{unitId:unit,packages:[en]}).length,1);
 assert.throws(()=>validateProgramplanPackageEntries(hu.program,hu.basis,'sprk',[genericEntry({...en,kind:'individualChoice'})],catalog,{unitId:unit,packages:[{...en,kind:'individualChoice'}]}));
});
test('mixed refs and generic allocations reject duplicates, missing level and excess allocation in context',()=>{
 const {program,basis}=context(),language=proposeLanguagePackages({kind:'modernLanguage',points:200})[0],p=pack('individualChoice',[genericLevel('IDRO','IDRO2000X'),genericLevel('BILD','BILD1B00X')]);
 assert.equal(validateProgramplanPackageEntries(program,basis,'iv1',[language,genericEntry(p)],catalog,{unitId:unit,packages:[p]}).length,2);
 for(const d of [{levelKey:'IDRO:1:IDRO2000X',points:[101,0,0,0,0,0]},{levelKey:'BILD:1:BILD2000X',points:[0,0,0,0,0,0]}])assert.throws(()=>validateProgramplanPackageEntries(program,basis,'iv1',[{...genericEntry(p),distribution:[d]}],catalog,{unitId:unit,packages:[p]}));
 assert.throws(()=>dmod.parseProgramplanPackageEntries([genericEntry(p),genericEntry(p)]));assert.throws(()=>dmod.parseProgramplanPackageEntries([{ref:{...genericEntry(p).ref,levels:p.levels},distribution:[]}]))
});

test('immutable lookup retains old content after newer version and global packages stay school-scoped by list',()=>{
 const first=pack('individualChoice',[genericLevel('IDRO','IDRO2000X')]),second=pack('individualChoice',[genericLevel('BILD','BILD1B00X')],{version:2});
 assert.deepEqual(dmod.programplanPackageLevels(genericEntry(first).ref,catalog,{unitId:unit,packages:[second,first]}),first.levels);assert.deepEqual(dmod.programplanPackageLevels(genericEntry(second).ref,catalog,{unitId:unit,packages:[second,first]}),second.levels);
 const global={...first,unitId:null};assert.deepEqual(dmod.parseProgramplanValpaketList({unitId:id,packages:[global]}).packages,[global]);assert.deepEqual(dmod.programplanPackageLevels(genericEntry(global).ref,catalog,{unitId:id,packages:[global]}),first.levels);
 assert.throws(()=>dmod.programplanPackageLevels(genericEntry(global).ref,catalog,{unitId:'invalid',packages:[global]}));
});
test('specialization generic content is constrained by the chosen program and all package dates are checked',()=>{
 const {program,basis}=context();basis.choiceBlocks.push({id:'pf1',kind:'specialization',points:100,name:'Valbar fördjupning'});const p=pack('specialization',[genericLevel('ANIM','ANIM1000X')]);
 assert.equal(validateProgramplanPackageEntries(program,basis,'pf1',[genericEntry(p)],catalog,{unitId:unit,packages:[p]}).length,1);
 const excluded=catalog.subjects.find(s=>s.schoolTypes.includes('GY')&&s.typeOfSyllabus==='GRADE_SUBJECT_SYLLABUS'&&!program.specialization.some(x=>x.code===s.code)&&s.items.some(i=>i.points===100)&&!['MODY','MODG','MODO','MODF','MODE'].includes(s.code));const wrong=pack('specialization',[genericLevel(excluded.code,excluded.items.find(i=>i.points===100).code)]);
 assert.throws(()=>validateProgramplanPackageEntries(program,basis,'pf1',[genericEntry(wrong)],catalog,{unitId:unit,packages:[wrong]}));
 const expired=structuredClone(catalog);expired.subjects.find(s=>s.code==='ANIM').endDate='2026-08-15';assert.throws(()=>validateProgramplanPackageEntries(program,basis,'pf1',[genericEntry(p)],expired,{unitId:unit,packages:[p]}));
});
