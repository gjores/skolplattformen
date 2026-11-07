import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './programplan-catalog.generated.json' with {type:'json'};
import {VALPLAN_KINDS,parseValplan,valplanDiagnostics,valplanOffer,validateValplanChoice,valplanRowKey,valplanRowStage,valplanSubjectAllowed,valplanTakesRow,valplanTimeShare} from './valplan-model.ts';

const unit='56000000-0000-4000-8000-000000000001',vp='56000000-0000-4000-8000-000000000002';
const tA='56000000-0000-4000-8000-000000000010',tB='56000000-0000-4000-8000-000000000011';
const cA='56000000-0000-4000-8000-000000000020',cB='56000000-0000-4000-8000-000000000021',cC='56000000-0000-4000-8000-000000000022';
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const course=(n,subjectCode,itemCode,points,extra={})=>({id:`56000000-0000-4000-8000-0000000001${String(n).padStart(2,'0')}`,subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode:null,name:`Kurs ${n}`,minutesHt:points*6,minutesVt:points*6,classIds:null,...extra});
function plan(){return{id:vp,unitId:unit,schoolYear:2027,kind:'individualChoice',name:'Individuellt val 2027/28',revision:1,
  courses:[course(1,'PSYL','PSYL1000X',50),course(2,'FILS','FILS1000X',50),course(3,'RETO','RETO1000X',100),course(4,'MODY','MODY1000X',100,{languageCode:'es'})],
  rows:[{timplanId:tA,timplanVersion:2,rowKey:'block:iv1',year:2},{timplanId:tB,timplanVersion:1,rowKey:'block:iv1',year:2}]};}
function rows(){return[
  {timplanId:tA,timplanVersion:2,rowKey:'block:iv1',year:2,rowKind:'block',points:100,minutesHt:300,minutesVt:300,classIds:[cA,cB],allowedLevelKeys:null,linkedValplanId:vp},
  {timplanId:tB,timplanVersion:1,rowKey:'block:iv1',year:2,rowKind:'block',points:200,minutesHt:600,minutesVt:600,classIds:[cC],allowedLevelKeys:null,linkedValplanId:vp}];}
const codes=(d,severity)=>d.filter(x=>!severity||x.severity===severity).map(x=>x.code).sort();

test('valid plan shared by two timplaner has no blocking diagnostics',()=>{
  const p=parseValplan(plan());
  assert.deepEqual(codes(valplanDiagnostics(p,rows(),catalog),'error'),[]);
  assert.equal(valplanRowKey(p.rows[0]),`${tA}:block:iv1:2`);
});

test('strict parser rejects extras, getters, sparse arrays, bad ids, kinds and time',()=>{
  assert.deepEqual(parseValplan(plan()),plan());
  for(const mutate of [p=>p.extra=1,p=>p.kind='schoolChoice',p=>p.id='x',p=>p.courses[0].minutesHt=-1,p=>p.courses[0].minutesHt=1.5,p=>p.courses[0].classIds=[],
    p=>p.rows[0].year=4,p=>p.courses[0].languageCode='xx',p=>p.schoolYear=1999,p=>p.name=' ',p=>p.courses=Array(1)]){
    const p=plan();mutate(p);assert.throws(()=>parseValplan(p),e=>e.code==='invalid_valplan');
  }
  const p=plan();Object.defineProperty(p.courses[0],'points',{get(){throw Error('getter executed');},enumerable:true});
  assert.throws(()=>parseValplan(p),e=>e.code==='invalid_valplan');
});

test('catalog, validity, language and duplicate rules block saving errors',()=>{
  const p=plan();p.courses.push(course(5,'PSYL','PSYL1000X',50));
  assert.ok(codes(valplanDiagnostics(parseValplan(p),rows(),catalog)).includes('duplicate_course'));
  for(const [mutate,code] of [[c=>c.itemCode='PSYL9000X','course_not_in_catalog'],[c=>c.points=100,'course_not_in_catalog'],[c=>c.subjectVersion=9,'course_not_in_catalog'],
    [c=>{c.subjectCode='MODY';c.itemCode='MODY1000X';c.points=100;},'language_required'],[c=>{c.minutesHt=0;c.minutesVt=0;},'course_time_missing']]){
    const q=plan();mutate(q.courses[0]);assert.ok(codes(valplanDiagnostics(parseValplan(q),rows(),catalog),'error').includes(code),code);
  }
  const ended=plan();ended.schoolYear=2028;ended.courses[0]={...ended.courses[0],subjectCode:'STAD',subjectVersion:version('STAD'),itemCode:catalog.subjects.find(s=>s.code==='STAD').items[0].code,points:catalog.subjects.find(s=>s.code==='STAD').items[0].points};
  assert.ok(codes(valplanDiagnostics(parseValplan(ended),rows(),catalog),'error').includes('course_not_valid'));
  const lang=plan();lang.kind='modernLanguage';
  assert.ok(codes(valplanDiagnostics(parseValplan(lang),rows(),catalog),'error').includes('course_kind_mismatch'));
});

test('all five block kinds parse, and språkämne and naturvetenskapligt ämne keep to 4 kap. 1 a §',()=>{
  assert.deepEqual([...VALPLAN_KINDS].sort(),['individualChoice','languageSubject','modernLanguage','naturalScience','specialization']);
  for(const kind of VALPLAN_KINDS)assert.equal(parseValplan({...plan(),kind}).kind,kind);
  const allowed=(kind,codes)=>codes.filter(code=>valplanSubjectAllowed(kind,code));
  const subjects=['MODY','MODF','ENGE','KLAS','LATI','BIOG','BIOE','FYSK','FYSF','KEMI','PSYL'];
  assert.deepEqual(allowed('modernLanguage',subjects),['MODY','MODF']);
  assert.deepEqual(allowed('languageSubject',subjects),['MODY','MODF','ENGE','KLAS','LATI']);
  assert.deepEqual(allowed('naturalScience',subjects),['BIOG','BIOE','FYSK','FYSF','KEMI']);
  assert.deepEqual(allowed('individualChoice',subjects),subjects);
  const row=kind=>rows().map(r=>({...r,blockKind:kind}));
  const language={...plan(),kind:'languageSubject',courses:[course(1,'MODO','MODO1000X',100,{languageCode:'es'}),course(2,'ENGE','ENGE3000X',100)]};
  assert.deepEqual(codes(valplanDiagnostics(parseValplan(language),row('languageSubject'),catalog),'error'),[]);
  assert.ok(codes(valplanDiagnostics(parseValplan({...language,courses:[course(1,'PSYL','PSYL1000X',50)]}),row('languageSubject'),catalog),'error').includes('course_kind_mismatch'));
  const science={...plan(),kind:'naturalScience',courses:[course(1,'KEMI','KEMI2000X',100)]};
  assert.deepEqual(codes(valplanDiagnostics(parseValplan(science),row('naturalScience'),catalog),'error'),[]);
  assert.ok(codes(valplanDiagnostics(parseValplan({...science,courses:[course(1,'ENGE','ENGE3000X',100)]}),row('naturalScience'),catalog),'error').includes('course_kind_mismatch'));
  assert.ok(codes(valplanDiagnostics(parseValplan(science),row('languageSubject'),catalog),'error').includes('row_kind_mismatch'));
});

test('a timplan row is in exactly one stage with one next step',()=>{
  const stage=(approved,classCount,linked)=>valplanRowStage({approved,classCount,linked});
  assert.equal(stage(false,2,false),'notApproved');assert.equal(stage(false,2,true),'notApproved');
  assert.equal(stage(true,0,false),'noClasses');assert.equal(stage(true,2,false),'missing');
  assert.equal(stage(true,2,true),'done');assert.equal(stage(true,0,true),'done');
});

test('a block takes a row of its kind unless the classes already choose in it',()=>{
  const p=parseValplan({...plan(),rows:[plan().rows[0]]}),free={...rows()[1],blockKind:'individualChoice'},all=[{...rows()[0],blockKind:'individualChoice'},free];
  assert.equal(valplanTakesRow(p,all,free),true);
  assert.equal(valplanTakesRow(p,all,{...free,blockKind:'modernLanguage'}),false);
  assert.equal(valplanTakesRow(p,all,{...free,classIds:[cC,cB]}),false);
});

test('row links: block rows only, one valplan per row, stale version and class overlap are visible',()=>{
  const kind=rows();kind[0].blockKind='modernLanguage';
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),kind,catalog),'error').includes('row_kind_mismatch'));
  const r=rows();r[0].rowKind='fixed';
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),r,catalog),'error').includes('row_not_choice_block'));
  const other=rows();other[1].linkedValplanId='56000000-0000-4000-8000-000000000099';
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),other,catalog),'error').includes('row_linked_elsewhere'));
  const dup=plan();dup.rows.push({...dup.rows[0],timplanVersion:3});
  assert.throws(()=>parseValplan(dup),e=>e.code==='invalid_valplan');
  const stale=rows();stale[0].timplanVersion=3;
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),stale,catalog),'error').includes('row_version_changed'));
  const missing=rows().slice(0,1);
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),missing,catalog),'error').includes('row_missing'));
  const zero=rows();zero[0].points=0;
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),zero,catalog),'error').includes('row_without_points'));
  const overlap=rows();overlap[1].classIds=[cC,cA];
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),overlap,catalog),'error').includes('class_in_several_rows'));
});

test('per course class restriction must stay within linked classes',()=>{
  const p=plan();p.courses[2].classIds=[cA];
  assert.deepEqual(codes(valplanDiagnostics(parseValplan(p),rows(),catalog),'error'),[]);
  p.courses[2].classIds=['56000000-0000-4000-8000-000000000098'];
  assert.ok(codes(valplanDiagnostics(parseValplan(p),rows(),catalog),'error').includes('course_class_not_linked'));
});

test('a course that fits no linked row and a course outside a row allow-list are reported',()=>{
  const p=plan();p.courses[2]={...course(3,'MATE','MATE1A00X',100)};p.courses.push({...course(6,'ENGE','ENGE1000X',100),id:'56000000-0000-4000-8000-000000000106'});
  const r=rows();r.forEach(x=>x.points=50);
  const d=valplanDiagnostics(parseValplan(p),r,catalog);
  assert.ok(codes(d,'error').includes('course_fits_no_row'));
  const allow=rows();allow[0].allowedLevelKeys=['PSYL:3:PSYL1000X'];
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),allow,catalog),'notice').includes('course_not_allowed_in_row'));
});

test('offer follows the pupil class row, points in the year and course restrictions',()=>{
  const p=plan();p.courses[2].classIds=[cB];
  const offerA=valplanOffer(parseValplan(p),rows(),cA);
  assert.equal(offerA.points,100);
  assert.deepEqual(offerA.courseIds,[p.courses[0].id,p.courses[1].id,p.courses[3].id]);
  const offerC=valplanOffer(parseValplan(p),rows(),cC);
  assert.equal(offerC.points,200);
  assert.deepEqual(offerC.courseIds,[p.courses[0].id,p.courses[1].id,p.courses[3].id]);
  assert.equal(valplanOffer(parseValplan(p),rows(),'56000000-0000-4000-8000-000000000097'),null);
  const allow=rows();allow[0].allowedLevelKeys=['PSYL:3:PSYL1000X','FILS:1:FILS1000X'];
  assert.deepEqual(valplanOffer(parseValplan(plan()),allow,cA).courseIds,[p.courses[0].id,p.courses[1].id]);
});

test('choice must fill the row points exactly; time deviation is a notice',()=>{
  const p=parseValplan(plan()),offer=valplanOffer(p,rows(),cA);
  const [psy,fil,ret,spa]=p.courses.map(c=>c.id);
  const ok=validateValplanChoice(p,offer,[psy,fil]);
  assert.deepEqual(ok.errors,[]);
  assert.deepEqual([ok.points,ok.minutesHt,ok.minutesVt],[100,600,600]);
  assert.deepEqual([ok.deviationHt,ok.deviationVt],[300,300]);
  assert.deepEqual(validateValplanChoice(p,offer,[psy]).errors,['choice_points_mismatch']);
  assert.deepEqual(validateValplanChoice(p,offer,[psy,fil,spa]).errors,['choice_points_mismatch']);
  assert.deepEqual(validateValplanChoice(p,offer,[psy,psy]).errors,['duplicate_course']);
  assert.deepEqual(validateValplanChoice(p,offer,[ret]).errors,[]);
  const restricted=plan();restricted.courses[2].classIds=[cC];const rp=parseValplan(restricted);
  assert.deepEqual(validateValplanChoice(rp,valplanOffer(rp,rows(),cA),[ret]).errors,['course_not_offered']);
  assert.deepEqual(validateValplanChoice(p,offer,[]).errors,['choice_points_mismatch']);
});

test('tidsförslag följer radens poäng och blir noll när raden saknar tid', () => {
  assert.deepEqual(valplanTimeShare(50, { points: 100, minutesHt: 2640, minutesVt: 2640 }), { minutesHt: 1320, minutesVt: 1320 });
  assert.deepEqual(valplanTimeShare(100, { points: 100, minutesHt: null, minutesVt: null }), { minutesHt: 0, minutesVt: 0 });
  assert.deepEqual(valplanTimeShare(100, undefined), { minutesHt: 0, minutesVt: 0 });
});
