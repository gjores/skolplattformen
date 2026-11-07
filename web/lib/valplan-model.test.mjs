import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './programplan-catalog.generated.json' with {type:'json'};
import {VALPLAN_KINDS,parseValplan,valplanCheck,valplanClosestPoints,valplanCourseReaders,valplanDiagnostics,valplanOffer,validateValplanChoice,valplanClassLabel,valplanLinkClasses,valplanRowDoubled,valplanRowKey,valplanRowLink,valplanRowMissing,valplanRowStage,valplanSubjectAllowed,valplanTakesRow,valplanTimeShare,valplanWithRow} from './valplan-model.ts';

const unit='56000000-0000-4000-8000-000000000001',vp='56000000-0000-4000-8000-000000000002',other='56000000-0000-4000-8000-000000000003';
const tA='56000000-0000-4000-8000-000000000010',tB='56000000-0000-4000-8000-000000000011';
const cA='56000000-0000-4000-8000-000000000020',cB='56000000-0000-4000-8000-000000000021',cC='56000000-0000-4000-8000-000000000022';
const version=code=>catalog.subjects.find(s=>s.code===code&&s.schoolTypes.includes('GY')).version;
const course=(n,subjectCode,itemCode,points,extra={})=>({id:`56000000-0000-4000-8000-0000000001${String(n).padStart(2,'0')}`,subjectCode,subjectVersion:version(subjectCode),itemCode,points,languageCode:null,name:`Kurs ${n}`,minutesHt:points*6,minutesVt:points*6,classIds:null,...extra});
function plan(){return{id:vp,unitId:unit,schoolYear:2027,kind:'individualChoice',name:'Individuellt val 2027/28',revision:1,
  courses:[course(1,'PSYL','PSYL1000X',50),course(2,'FILS','FILS1000X',50),course(3,'RETO','RETO1000X',100),course(4,'MODY','MODY1000X',100,{languageCode:'es'})],
  rows:[{timplanId:tA,timplanVersion:2,rowKey:'block:iv1',year:2,excludedClassIds:[]},{timplanId:tB,timplanVersion:1,rowKey:'block:iv1',year:2,excludedClassIds:[]}]};}
function rows(){return[
  {timplanId:tA,timplanVersion:2,rowKey:'block:iv1',year:2,rowKind:'block',points:100,minutesHt:300,minutesVt:300,classIds:[cA,cB],allowedLevelKeys:null,blocks:[{valplanId:vp,classIds:[cA,cB]}]},
  {timplanId:tB,timplanVersion:1,rowKey:'block:iv1',year:2,rowKind:'block',points:200,minutesHt:600,minutesVt:600,classIds:[cC],allowedLevelKeys:null,blocks:[{valplanId:vp,classIds:[cC]}]}];}
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
  const stage=(approved,classCount,blockCount,missingCount=0,doubledCount=0)=>valplanRowStage({approved,classCount,blockCount,missingCount,doubledCount});
  assert.equal(stage(false,2,0),'notApproved');assert.equal(stage(false,2,1),'notApproved');
  assert.equal(stage(true,0,0),'noClasses');assert.equal(stage(true,2,0,2),'missing');
  assert.equal(stage(true,3,1,1),'partial');assert.equal(stage(true,3,2,0,1),'doubled');assert.equal(stage(true,3,2,1,1),'doubled');
  assert.equal(stage(true,2,1),'done');assert.equal(stage(true,3,2),'done');assert.equal(stage(true,0,1),'done');
});

test('a block takes a row of its kind unless the classes already choose in it',()=>{
  const p=parseValplan({...plan(),rows:[plan().rows[0]]}),free={...rows()[1],blockKind:'individualChoice',blocks:[]},all=[{...rows()[0],blockKind:'individualChoice'},free];
  assert.equal(valplanTakesRow(p,all,free),true);
  assert.equal(valplanTakesRow(p,all,{...free,blockKind:'modernLanguage'}),false);
  assert.equal(valplanTakesRow(p,all,{...free,classIds:[cC,cB]}),false);
});

test('row links: block rows only, one valplan per row, stale version and class overlap are visible',()=>{
  const kind=rows();kind[0].blockKind='modernLanguage';
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),kind,catalog),'error').includes('row_kind_mismatch'));
  const r=rows();r[0].rowKind='fixed';
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),r,catalog),'error').includes('row_not_choice_block'));
  const other=rows();other[1].blocks=[{valplanId:'56000000-0000-4000-8000-000000000099',classIds:[cC]}];
  assert.ok(codes(valplanDiagnostics(parseValplan(plan()),other,catalog),'error').includes('class_in_other_block'));
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

test('a row is shared by class: a class is in at most one block and unticked classes stay out',()=>{
  const other='56000000-0000-4000-8000-000000000099',shared=[{...rows()[0],blockKind:'individualChoice',blocks:[{valplanId:other,classIds:[cB]}]},rows()[1]];
  const p=plan();p.rows[0].excludedClassIds=[cB];
  assert.deepEqual(codes(valplanDiagnostics(parseValplan(p),shared,catalog),'error'),[]);
  assert.deepEqual(valplanLinkClasses(p.rows[0],shared[0]),[cA]);
  p.rows[0].excludedClassIds=[];const doubled=valplanDiagnostics(parseValplan(p),shared,catalog).filter(d=>d.code==='class_in_other_block');
  assert.deepEqual(doubled.map(d=>d.classId),[cB]);
  p.rows[0].excludedClassIds=[cA,cB];
  assert.ok(codes(valplanDiagnostics(parseValplan(p),shared,catalog),'error').includes('row_without_classes'));
  const late=plan();late.rows[0].excludedClassIds=['56000000-0000-4000-8000-000000000098'];
  assert.deepEqual(valplanLinkClasses(late.rows[0],rows()[0]),[cA,cB]);
  const dup=plan();dup.rows[0].excludedClassIds=[cA,cA];assert.throws(()=>parseValplan(dup),e=>e.code==='invalid_valplan');
});

test('the row tells which classes lack a block and which are in two',()=>{
  const row={...rows()[0],classIds:[cA,cB,cC],blocks:[{valplanId:vp,classIds:[cA,cC]},{valplanId:'56000000-0000-4000-8000-000000000099',classIds:[cC]}]};
  assert.deepEqual(valplanRowMissing(row),[cB]);assert.deepEqual(valplanRowDoubled(row),[cC]);
  assert.equal(valplanClassLabel(['SA27B']),'SA27B');assert.equal(valplanClassLabel(['SA27B','SA27C']),'SA27B och SA27C');assert.equal(valplanClassLabel(['A','B','C']),'3 klasser');
});

test('a new link leaves out classes held by other blocks, and joining takes only the free ones',()=>{
  const other='56000000-0000-4000-8000-000000000099',row={...rows()[0],classIds:[cA,cB,cC],blockKind:'individualChoice',blocks:[{valplanId:other,classIds:[cC,cA]}]};
  assert.deepEqual(valplanRowLink(row,vp).excludedClassIds,[cA,cC]);assert.deepEqual(valplanRowLink(row,other).excludedClassIds,[]);
  const fresh=parseValplan({...plan(),rows:[]});assert.deepEqual(valplanWithRow(fresh,row).rows[0].excludedClassIds,[cA,cC]);
  const own=parseValplan({...plan(),rows:[{...plan().rows[0],excludedClassIds:[cA,cB]}]}),held={...row,classIds:[cA,cB],blocks:[{valplanId:vp,classIds:[]},{valplanId:other,classIds:[cA]}]};
  assert.deepEqual(valplanWithRow(own,held).rows[0].excludedClassIds,[cA]);
  assert.equal(valplanTakesRow(own,[held],held),true);
  assert.equal(valplanTakesRow(own,[held],{...held,blocks:[{valplanId:other,classIds:[cA,cB]}]}),false);
});

test('an unticked class gets no offer and a course may not name it',()=>{
  const p=plan();p.rows[0].excludedClassIds=[cB];const parsed=parseValplan(p);
  assert.equal(valplanOffer(parsed,rows(),cB),null);assert.equal(valplanOffer(parsed,rows(),cA).points,100);
  const limited=parseValplan({...p,courses:[course(1,'PSYL','PSYL1000X',50,{classIds:[cB]})]});
  assert.ok(codes(valplanDiagnostics(limited,rows(),catalog),'error').includes('course_class_not_linked'));
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

// Kontroll (VP-13). Row A: 100 p for classes A and B. Row B: 200 p for class C.
const block=(courses,linkRows=plan().rows)=>({...plan(),courses,rows:linkRows});
const open=check=>check.items.filter(i=>i.state==='open');
const item=(check,code)=>check.items.find(i=>i.code===code);

test('exactly the points of each class row is ready, and the list covers classes, courses, time and points',()=>{
  const time=points=>({minutesHt:points*3,minutesVt:points*3});
  const check=valplanCheck(block([course(1,'PSYL','PSYL1000X',50,time(50)),course(2,'FILS','FILS1000X',50,time(50)),course(3,'RETO','RETO1000X',100,time(100))]),rows());
  assert.equal(check.ready,true);
  assert.deepEqual(check.items.map(i=>[i.area,i.code,i.state]),[['classes','classes_ok','done'],['courses','courses_ok','done'],['time','time_ok','done'],['points','points_ok','done']]);
  assert.deepEqual(item(check,'classes_ok').classIds.sort(),[cA,cB,cC].sort());
});

test('200 p is reached with 50 + 150, each course once',()=>{
  assert.equal(valplanCheck(block([course(1,'PSYL','PSYL1000X',50),course(2,'RETO','RETO1000X',150)],[plan().rows[1]]),rows()).ready,true);
  assert.equal(valplanClosestPoints([50,150],200),200);
  assert.equal(valplanClosestPoints([100],200),100,'a course is not counted twice');
});

test('no combination gives the exact points, and the line says how close the class gets',()=>{
  const check=valplanCheck(block([course(1,'PSYL','PSYL1000X',150),course(2,'RETO','RETO1000X',100)],[plan().rows[1]]),rows());
  assert.equal(check.ready,false);
  assert.deepEqual(open(check).map(i=>[i.code,i.classIds,i.points,i.closest]),[['points_unreachable',[cC],200,150]]);
  assert.equal(item(check,'points_ok'),undefined);
});

test('a class without courses stops the opening, and classes with the same problem share a line',()=>{
  const limited=valplanCheck(block([course(1,'RETO','RETO1000X',100,{classIds:[cA]})],[plan().rows[0]]),rows());
  assert.deepEqual(open(limited).map(i=>[i.code,i.classIds,i.points]),[['class_without_courses',[cB],100]]);
  const tooBig=valplanCheck(block([course(1,'RETO','RETO1000X',150)],[plan().rows[0]]),rows());
  assert.deepEqual(open(tooBig).map(i=>[i.code,i.classIds]),[['class_without_courses',[cA,cB]]],'a course above the row points is no course to choose');
});

test('a block without courses, time or classes says what is left',()=>{
  const empty=valplanCheck(block([]),rows());
  assert.deepEqual(open(empty).map(i=>i.code).sort(),['class_without_courses','class_without_courses','no_courses'].sort());
  assert.equal(empty.items.some(i=>i.area==='time'),false);
  const noTime=valplanCheck(block([course(1,'RETO','RETO1000X',100,{minutesHt:0,minutesVt:0}),course(2,'FILS','FILS1000X',100)],[plan().rows[0]]),rows());
  assert.deepEqual(open(noTime).map(i=>[i.code,i.courseIds]),[['time_missing',[course(1,'RETO','RETO1000X',100).id]]]);
  const noClasses=valplanCheck(block([course(1,'RETO','RETO1000X',100)]),rows().map(r=>({...r,classIds:[],blocks:[]})));
  assert.deepEqual(open(noClasses).map(i=>i.code),['no_classes','points_waiting']);
  const gone=valplanCheck(block([course(1,'RETO','RETO1000X',100)]),rows().slice(0,1));
  assert.deepEqual(open(gone).map(i=>i.code),['row_missing'],'a row that is gone is one line, and the classes left are still checked');
});

test('a class counts against its own row and block on a shared row',()=>{
  const r=rows();r[0].blocks=[{valplanId:vp,classIds:[cA]},{valplanId:other,classIds:[cB]}];
  const mine=block([course(1,'RETO','RETO1000X',100,{classIds:[cA]})],[{...plan().rows[0],excludedClassIds:[cB]}]);
  assert.equal(valplanCheck(mine,r).ready,true,'the unticked class does not count here');
  const theirs={...mine,id:other,courses:[course(2,'PSYL','PSYL1000X',50)],rows:[{...plan().rows[0],excludedClassIds:[cA]}]};
  assert.deepEqual(open(valplanCheck(theirs,r)).map(i=>[i.code,i.classIds,i.closest]),[['points_unreachable',[cB],50]],'it counts in the block it belongs to');
  const shared={...mine,rows:[{...plan().rows[0],excludedClassIds:[]}],courses:[course(1,'RETO','RETO1000X',100)]};
  assert.equal(valplanCheck(shared,r).ready,false);
});

test('a class in two blocks on a row stops the opening of both, and names the other block',()=>{
  const r=rows();r[0].blocks=[{valplanId:vp,classIds:[cA,cB]},{valplanId:other,classIds:[cB]}];
  const mine=block([course(1,'RETO','RETO1000X',100)],[plan().rows[0]]),check=valplanCheck(mine,r);
  assert.deepEqual(open(check).map(i=>[i.code,i.classIds,i.valplanIds]),[['class_doubled',[cB],[other]]]);
  assert.equal(item(check,'classes_ok'),undefined);
  assert.deepEqual(open(valplanCheck({...mine,id:other,rows:[{...plan().rows[0],excludedClassIds:[cA]}]},r)).map(i=>[i.code,i.classIds,i.valplanIds]),[['class_doubled',[cB],[vp]]]);
});

test('a class on two rows of the block stops the opening, since it has no single target',()=>{
  const r=rows();r[1]={...r[1],classIds:[cA,cC]};
  assert.deepEqual(open(valplanCheck(block([course(1,'RETO','RETO1000X',100),course(2,'FILS','FILS1000X',100)]),r)).map(i=>[i.code,i.classIds]),[['class_in_several_rows',[cA]]]);
});

test('a class on the row without any block is shown but does not stop this block',()=>{
  const r=rows();r[0].blocks=[{valplanId:vp,classIds:[cA]}];
  const check=valplanCheck(block([course(1,'RETO','RETO1000X',100)],[{...plan().rows[0],excludedClassIds:[cB]}]),r);
  assert.equal(check.ready,true);assert.deepEqual([item(check,'classes_waiting').state,item(check,'classes_waiting').classIds],['notice',[cB]]);
  const held=rows();held[0].blocks=[{valplanId:other,classIds:[cB]},{valplanId:vp,classIds:[cA]}];
  assert.equal(item(valplanCheck(block([course(1,'RETO','RETO1000X',100)],[{...plan().rows[0],excludedClassIds:[cB]}]),held),'classes_waiting'),undefined,'a class in another block is not waiting');
});

test('course time that differs from the row is a notice and stops nothing',()=>{
  const fitted=course(1,'RETO','RETO1000X',100,{minutesHt:300,minutesVt:300}),check=valplanCheck(block([fitted],[plan().rows[0]]),rows());
  assert.equal(item(check,'time_deviates'),undefined);
  const off=valplanCheck(block([{...fitted,minutesHt:200}],[plan().rows[0]]),rows());
  assert.equal(off.ready,true);assert.deepEqual([item(off,'time_deviates').state,item(off,'time_deviates').courseIds],['notice',[fitted.id]]);
  assert.equal(item(valplanCheck(block([{...fitted,minutesHt:200}],[plan().rows[0]]),rows().map(r=>({...r,minutesHt:null,minutesVt:null}))),'time_deviates'),undefined,'a row without time gives nothing to compare with');
});

test('a course says who may read it by naming the shorter group',()=>{
  const k=['A','B','C','D'].map((name,i)=>({id:String(i),name}));
  assert.equal(valplanCourseReaders(k,null),'Alla klasser');
  assert.equal(valplanCourseReaders(k,['0','1','2']),'Alla klasser utom D');
  assert.equal(valplanCourseReaders(k,['0','1']),'Alla klasser utom C och D');
  assert.equal(valplanCourseReaders(k,['0']),'Bara A');
  assert.equal(valplanCourseReaders(k,[]),'Ingen klass');
  assert.equal(valplanCourseReaders([],null),'Inga klasser ännu');
  assert.equal(valplanCourseReaders(k,['0','1','2','3']),'Alla klasser');
  assert.equal(valplanCourseReaders(k,['0','9']),'Bara A','a class that left the block is not named');
});
