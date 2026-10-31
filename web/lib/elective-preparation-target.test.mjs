import test from 'node:test';
import assert from 'node:assert/strict';
import {electivePreparationTarget} from './elective-preparation-target.ts';
const need={sourceKind:'class_timplan',sourceKey:'class_timplan:c1:2027:block:mosp',rowKey:'block:mosp',organizationPending:true};
const data={unitId:'school',schoolYear:2027,classes:[{classId:'c1',link:{timplanId:'approved-plan',column:'ar2'},needs:[need]}]};
test('pending allocation retains actual timetable, selected year and column without pupil metadata',()=>{
 assert.deepEqual(electivePreparationTarget(data,need),{unitId:'school',planId:'approved-plan',schoolYear:2027,columnId:'ar2',rowKey:'block:mosp'});
});
test('existing teaching group or ordinary course does not create a new preparation intent',()=>{
 assert.equal(electivePreparationTarget(data,{...need,organizationPending:false}),null);
 assert.equal(electivePreparationTarget(data,{...need,sourceKind:'teaching_group'}),null);
});
test('missing annual link or mismatched source never guesses a timetable',()=>{
 assert.equal(electivePreparationTarget({...data,classes:[{...data.classes[0],link:null}]},need),null);
 assert.equal(electivePreparationTarget(data,{...need,sourceKey:'other'}),null);
});
test('ground-school annual column is retained; weekly IM source is not offered as an annual preparation',()=>{
 const variant=column=>({...data,classes:[{...data.classes[0],link:{...data.classes[0].link,column}}]});
 assert.equal(electivePreparationTarget(variant('ak7'),need).columnId,'ak7');
 assert.equal(electivePreparationTarget(variant('vecka'),need),null);
});
