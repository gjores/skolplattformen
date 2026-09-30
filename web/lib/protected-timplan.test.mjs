import test from 'node:test';
import assert from 'node:assert/strict';
import { parseProtectedTimplan, parseTimplanList, timplanGrades, timplanColumns, timplanRows,
  cellHours, canChangeTimplanCell, unknownTimplanRows, parseTimplanHours, sameTimplanColumn, parseTimplanCellReply } from './protected-timplan.ts';
const id = '55006000-0000-4000-8000-000000000001';
const plan = () => ({id,offeringId:id,unitId:id,version:1,revision:0,status:'utkast',basis:'Syntetisk grund',
  catalogFetched:null,decidedOn:null,schoolName:'Syntetisk skola',education:{name:'Grundskola',cohort:'2026',kind:'grundskola',grades:[9,1,4]},
  cells:{matematik:[0,100,200],no:[0,50,0],biologi:[10,0,30]}});
test('columns retain stored grade order and stage rules follow the actual grade',()=>{
  const p = parseProtectedTimplan(plan(),id);
  assert.deepEqual(timplanColumns(p).map(c=>c.label),['Åk 9','Åk 1','Åk 4']);
  assert.equal(canChangeTimplanCell(p,'rektor','no',1),true);
  assert.equal(canChangeTimplanCell(p,'rektor','no',0),false);
  assert.equal(canChangeTimplanCell(p,'rektor','biologi',0),true);
  assert.equal(canChangeTimplanCell(p,'rektor','biologi',1),false);
  assert.equal(canChangeTimplanCell(p,'rektor','matematik',0),true);
  assert.equal(cellHours(p,'matematik',0),0);
});
test('default columns use nine grades; missing rows and wrong-width rows never invent zero',()=>{
  assert.deepEqual(timplanGrades(),[1,2,3,4,5,6,7,8,9]);assert.deepEqual(timplanGrades([]),timplanGrades());
  const p=plan();p.education.grades=[];p.cells.matematik=[10,20,30];
  assert.equal(timplanColumns(p).length,9);assert.equal(cellHours(p,'matematik',0),null);
  assert.equal(cellHours(p,'engelska',0),null);assert.equal(canChangeTimplanCell(p,'rektor','engelska',0),false);
  for(const grades of [[1,1],[0,1],[1,null],[10],[1.5]])assert.throws(()=>timplanGrades(grades));
});
test('all canonical labels exist, IM has one weekly column and known rows only',()=>{
  const p=plan();assert.equal(timplanRows(p).find(r=>r.id==='matematik').label,'Matematik');
  assert.equal(timplanRows(p).find(r=>r.id==='skolansval').label,'Skolans val');
  p.education={name:'IM',cohort:'2026',kind:'introduktionsprogram',grades:[]};p.cells={'im-ma':[5]};
  assert.deepEqual(timplanColumns(p),[{id:'vecka',label:'Per vecka'}]);assert.equal(timplanRows(p).length,7);
  assert.equal(canChangeTimplanCell(p,'rektor','im-ma',0),true);assert.equal(canChangeTimplanCell(p,'rektor','im-ma',1),false);
});
test('roles, version locks and unknown basis rows fail closed',()=>{
  const p=plan();for(const role of ['huvudman','administrator','larare','support'])assert.equal(canChangeTimplanCell(p,role,'matematik',0),false);
  for(const status of ['forslag','faststalld','ersatt']){p.status=status;assert.equal(canChangeTimplanCell(p,'rektor','matematik',0),false);}
  p.status='atersand';assert.equal(canChangeTimplanCell(p,'rektor','matematik',0),true);
  p.cells.custom=[10,20,30];assert.deepEqual(unknownTimplanRows(p),['custom']);assert.equal(canChangeTimplanCell(p,'rektor','matematik',0),false);
  p.education.kind='gymnasium';assert.equal(canChangeTimplanCell(p,'rektor','matematik',0),false);
});
test('client projection rejects wrong object, unknown fields and unsafe values',()=>{
  for(const change of [p=>p.id='55006000-0000-4000-8000-000000000002',p=>p.secret='private',p=>p.education.kind=['grundskola'],
    p=>p.cells.matematik=[null,1,2],p=>p.revision='0',p=>p.catalogFetched='2026-02-30',p=>p.education.grades=[1,1]]){
    const p=plan();change(p);assert.throws(()=>parseProtectedTimplan(p,id));
  }
  const summary={id,offeringId:id,unitId:id,version:1,revision:0,status:'utkast',schoolName:'Skola',educationName:'Grundskola',cohort:'2026',kind:'grundskola'};
  assert.equal(parseTimplanList({plans:[summary],count:1,page:1,pageSize:50},1).plans.length,1);
  assert.throws(()=>parseTimplanList({plans:[summary,summary],count:2,page:1,pageSize:50},1));
  assert.throws(()=>parseTimplanList({plans:[summary],count:1,page:2,pageSize:50},1));
  assert.throws(()=>parseTimplanList({plans:[{...summary,kind:'gymnasium'}],count:1,page:1,pageSize:50},1));
});
test('hours validation leaves empty, decimal, negative and excessive drafts invalid',()=>{
  for(const value of ['', ' ', '1.5', '-1', '2001','1e2'])assert.equal(parseTimplanHours(value),null);
  assert.equal(parseTimplanHours('0'),0);assert.equal(parseTimplanHours('2000'),2000);
});
test('a fresh read cannot redirect a retained proposal to a different grade',()=>{
  const p=plan();assert.equal(sameTimplanColumn(p,1,'ak1'),true);
  p.education.grades=[1,9,4];assert.equal(sameTimplanColumn(p,1,'ak1'),false);
  assert.equal(sameTimplanColumn(p,1,'ak9'),true);
});
test('a save acknowledgement must match the exact cell, width and revision without extra data',()=>{
  const expected={planId:id,rowId:'matematik',expectedRevision:0,columnIndex:1,hours:120,columnCount:3};
  const reply={id,revision:1,rowId:'matematik',hours:[10,120,30]};
  assert.deepEqual(parseTimplanCellReply(reply,expected),reply);
  for(const change of [r=>r.private='x',r=>r.id='55006000-0000-4000-8000-000000000002',r=>r.revision=2,
    r=>r.rowId='no',r=>r.hours=[10,120],r=>r.hours=[10,120,null],r=>r.hours=[10,120,2001],r=>r.hours=[10,119,30]]){
    const r=structuredClone(reply);change(r);assert.throws(()=>parseTimplanCellReply(r,expected));
  }
});
test('metadata text accepts the same 1000-character boundary as the server',()=>{
  for(const length of [500,1000]){
    const p=plan();p.schoolName='S'.repeat(length);p.education.name='N'.repeat(length);p.education.cohort='K'.repeat(length);
    assert.equal(parseProtectedTimplan(p,id).schoolName.length,length);
    const summary={id,offeringId:id,unitId:id,version:1,revision:0,status:'utkast',schoolName:p.schoolName,educationName:p.education.name,cohort:p.education.cohort,kind:'grundskola'};
    assert.equal(parseTimplanList({plans:[summary],count:1,page:1,pageSize:50},1).plans[0].educationName.length,length);
  }
  const p=plan();p.schoolName='S'.repeat(1001);assert.throws(()=>parseProtectedTimplan(p,id));
  const summary={id,offeringId:id,unitId:id,version:1,revision:0,status:'utkast',schoolName:p.schoolName,educationName:'N',cohort:'K',kind:'grundskola'};
  assert.throws(()=>parseTimplanList({plans:[summary],count:1,page:1,pageSize:50},1));
});
