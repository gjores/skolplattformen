import test from 'node:test';
import assert from 'node:assert/strict';
import {preparationJournalKey,pendingPreparationScopes} from './elective-preparation-journal.ts';
const id=n=>'10000000-0000-4000-8000-'+String(n).padStart(12,'0');
const scope={unitId:id(1),planId:id(2),schoolYear:2027,columnId:'ar1'},actor='["customer","mandate"]';
function storage(entries){const data=new Map(entries);return{get length(){return data.size;},key:index=>[...data.keys()][index]??null,getItem:key=>data.get(key)??null};}
test('a closed launcher discovers minimal pending scope even when its body is corrupt',()=>{
 const key=preparationJournalKey(actor,scope),store=storage([[key,'corrupt body']]);
 assert.deepEqual(pendingPreparationScopes(actor,store,2027,[scope.unitId]),[scope]);
});
test('another actor, school or year never enters this preparation recovery',()=>{
 const store=storage([[preparationJournalKey('other',scope),'{}'],[preparationJournalKey(actor,{...scope,unitId:id(9)}),'{}'],[preparationJournalKey(actor,{...scope,schoolYear:2026}),'{}']]);
 assert.deepEqual(pendingPreparationScopes(actor,store,2027,[scope.unitId]),[]);
});
test('malformed source keys are not used to invent a planning context',()=>{
 const store=storage([[`sp:elective-preparation:${actor}:${scope.unitId}:bad:2027:ar1`,'{}'],[preparationJournalKey(actor,{...scope,columnId:'vecka'}),'{}']]);
 assert.deepEqual(pendingPreparationScopes(actor,store,2027,[scope.unitId]),[]);
});
test('multiple actual pending preparations have a stable recovery order',()=>{
 const other={...scope,planId:id(3)},store=storage([[preparationJournalKey(actor,other),'{}'],[preparationJournalKey(actor,scope),'{}']]);
 assert.deepEqual(pendingPreparationScopes(actor,store,2027,[scope.unitId]),[scope,other]);
});
