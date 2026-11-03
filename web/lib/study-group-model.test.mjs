import test from 'node:test';
import assert from 'node:assert/strict';
import {parseStudyGroup,parseStudyGroupMembership,studyGroupMembershipErrors,distributeStudyGroupMembers,moveStudyGroupMembership,renameStudyGroup,studyGroupNeeds,timplanRowNeedMode} from './study-group-model.ts';

const id=n=>`57000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const unit=id(1),vp=id(2),set=id(3),setB=id(4);
const [cA,cB,cC]=[id(20),id(21),id(22)];
const [p1,p2,p3,p4,p5]=[id(31),id(32),id(33),id(34),id(35)];
const group=(n,extra={})=>({id:id(100+n),unitId:unit,schoolYear:2027,name:`Grupp ${n}`,startsOn:'2027-08-16',endsOn:'2028-06-10',
  course:{subjectCode:'MODY',subjectVersion:1,itemCode:'MODY1000X',points:100,languageCode:'es'},minutesHt:3000,minutesVt:3000,
  parallelSetId:set,classIds:[cA],origin:{kind:'valplan',valplanId:vp,courseId:id(200)},revision:1,active:true,...extra});
const member=(n,groupId,pupilId,extra={})=>({id:id(300+n),groupId,pupilId,startsOn:'2027-08-16',endsOn:'2028-06-10',source:'choice',sourceRef:id(400+n),...extra});

test('strict parsers accept the documented shape and reject extras, bad dates and empty class lists for class origin',()=>{
  assert.deepEqual(parseStudyGroup(group(1)),group(1));
  assert.deepEqual(parseStudyGroup(group(2,{course:null,origin:{kind:'manual'}})),group(2,{course:null,origin:{kind:'manual'}}));
  for(const mutate of [g=>g.extra=1,g=>g.startsOn='2027-02-30',g=>g.endsOn='2027-08-01',g=>{g.origin={kind:'classes'};g.classIds=[];},g=>g.classIds=[cA,cA],
    g=>g.origin={kind:'valplan',valplanId:vp},g=>g.minutesHt=-5,g=>g.name='',g=>g.course.languageCode=7]){
    const g=group(1);mutate(g);assert.throws(()=>parseStudyGroup(g),e=>e.code==='invalid_study_group');
  }
  assert.deepEqual(parseStudyGroupMembership(member(1,id(101),p1)),member(1,id(101),p1));
  for(const mutate of [m=>m.source='class-change',m=>m.endsOn='2027-08-15',m=>m.sourceRef='x',m=>m.pupilId=undefined]){
    const m=member(1,id(101),p1);mutate(m);assert.throws(()=>parseStudyGroupMembership(m),e=>e.code==='invalid_study_group');
  }
});

test('same class can belong to two language groups; class data is never part of a membership',()=>{
  const es=group(1),de=group(2,{course:{...group(1).course,languageCode:'de'},parallelSetId:setB});
  const ms=[member(1,es.id,p1),member(2,de.id,p2)];
  assert.deepEqual(studyGroupMembershipErrors([es,de],ms),[]);
  assert.deepEqual(Object.keys(ms[0]).sort(),['endsOn','groupId','id','pupilId','source','sourceRef','startsOn']);
});

test('memberships stay inside the group period, never overlap in a group or across parallel groups',()=>{
  const a=group(1),b=group(2);
  const codes=ms=>studyGroupMembershipErrors([a,b],ms).map(e=>e.code);
  assert.deepEqual(codes([member(1,a.id,p1,{startsOn:'2027-08-01'})]),['membership_outside_group']);
  assert.deepEqual(codes([member(1,a.id,p1),member(2,a.id,p1,{startsOn:'2028-01-01'})]),['membership_overlap']);
  assert.deepEqual(codes([member(1,a.id,p1,{endsOn:'2027-12-31'}),member(2,b.id,p1,{startsOn:'2028-01-01'})]),[]);
  assert.deepEqual(codes([member(1,a.id,p1),member(2,b.id,p1,{startsOn:'2028-01-01'})]),['parallel_overlap']);
  assert.deepEqual(codes([member(1,id(999),p1)]),['unknown_group']);
  const retired=group(1,{active:false});
  assert.deepEqual(studyGroupMembershipErrors([retired],[member(1,retired.id,p1)]).map(e=>e.code),['group_inactive']);
});

test('even distribution is deterministic, keeps existing members and fills the smallest group first',()=>{
  const a=group(1),b=group(2);
  const existing=[member(1,a.id,p1),member(2,a.id,p2)];
  const drafts=distributeStudyGroupMembers([a,b],existing,[p1,p2,p3,p4,p5],'2027-08-16');
  assert.deepEqual(drafts.map(d=>[d.groupId,d.pupilId]),[[b.id,p3],[b.id,p4],[a.id,p5]]);
  assert.deepEqual(distributeStudyGroupMembers([a,b],existing,[p5,p4,p3,p2,p1],'2027-08-16').map(d=>d.pupilId),[p5,p4,p3]);
  assert.deepEqual(drafts,distributeStudyGroupMembers([a,b],existing,[p1,p2,p3,p4,p5],'2027-08-16'));
  assert.throws(()=>distributeStudyGroupMembers([a,group(3,{parallelSetId:setB})],[],[p1],'2027-08-16'),e=>e.code==='invalid_study_group');
  assert.deepEqual(drafts.every(d=>d.startsOn==='2027-08-16'&&d.endsOn===a.endsOn),true);
});

test('moving ends the old membership the day before, or cancels one that has not started',()=>{
  const a=group(1),b=group(2),m=member(1,a.id,p1);
  const moved=moveStudyGroupMembership(a,b,m,'2028-01-08');
  assert.deepEqual(moved.end,{...m,endsOn:'2028-01-07'});
  assert.equal(moved.cancel,false);
  assert.deepEqual(moved.create,{groupId:b.id,pupilId:p1,startsOn:'2028-01-08',endsOn:'2028-06-10',source:m.source,sourceRef:m.sourceRef});
  const early=moveStudyGroupMembership(a,b,m,'2027-08-16');
  assert.equal(early.end,null);assert.equal(early.cancel,true);assert.equal(early.create.startsOn,'2027-08-16');
  assert.equal(moveStudyGroupMembership(a,b,m,'2028-03-01').end.endsOn,'2028-02-29');
  assert.throws(()=>moveStudyGroupMembership(a,b,m,'2028-06-11'),e=>e.code==='invalid_study_group');
  assert.throws(()=>moveStudyGroupMembership(a,group(3,{parallelSetId:setB}),m,'2028-01-08'),e=>e.code==='invalid_study_group');
});

test('rename keeps identity; needs are one per active group and a valplan row is not a class need',()=>{
  const g=group(1),renamed=renameStudyGroup(g,'Spanska nybörjare A');
  assert.equal(renamed.id,g.id);assert.equal(renamed.revision,2);assert.equal(renamed.name,'Spanska nybörjare A');
  const three=group(2,{classIds:[cA,cB,cC],parallelSetId:setB});
  assert.deepEqual(studyGroupNeeds([three]),[{groupId:three.id,minutesHt:3000,minutesVt:3000,classIds:[cA,cB,cC]}]);
  const parallel=[group(3),group(4)];
  assert.equal(studyGroupNeeds([...parallel,group(5,{active:false})]).length,2);
  assert.equal(timplanRowNeedMode(null,[]),'class');
  assert.equal(timplanRowNeedMode(vp,[]),'unorganized');
  assert.equal(timplanRowNeedMode(vp,parallel),'groups');
  assert.equal(timplanRowNeedMode(vp,[group(6,{origin:{kind:'manual'}})]),'unorganized');
});
