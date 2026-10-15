import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClassLinkQueue,reconcileClassLinkQueue,queueHasUnknown,queueComplete,updateQueueEntry} from './class-timplan-queue.ts';
const id=n=>`88101500-0000-4000-8000-${String(n).padStart(12,'0')}`;
const request=n=>({commandId:id(10+n),classId:id(20+n),schoolYear:2027,planId:id(1),expectedPlanRevision:3,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null});
const queue=()=>({version:1,scope:'customer-membership-assignment-epoch',planId:id(1),unitId:id(2),offeringId:id(3),schoolYear:2027,planVersion:1,series:null,entries:[0,1].map(n=>({name:`SA27${n}`,request:request(n),state:'pending',receipt:null}))});
const parse=q=>parseClassLinkQueue(q,queue().scope,id(1),id(2),id(3));
const data=()=>({plan:{id:id(1),unitId:id(2),offeringId:id(3),revision:3,status:'faststalld',version:1},schoolYear:2027,canManage:true,classes:[0,1].map(n=>({id:id(20+n),name:`SA27${n}`,link:null}))});
const receipt=n=>({classId:id(20+n),schoolYear:2027,planId:id(1),columnId:'ar1',revision:0,replayed:true});
const linked=()=>({planId:id(1),columnId:'ar1',revision:0,legacy:false});
test('journal binds every command and rejects partial or foreign scopes',()=>{
 assert.deepEqual(parse(queue()),queue());
 for(const patch of [{scope:'other'},{planId:id(9)},{unitId:id(9)},{offeringId:id(9)},{schoolYear:2028},{version:2},{extra:1},{entries:[]},{entries:[queue().entries[0],queue().entries[0]]}])assert.throws(()=>parse({...queue(),...patch}));
 for(const patch of [{commandId:id(11)},{schoolYear:2028},{planId:id(9)},{expectedPlanRevision:4},{columnId:'ar2'}])assert.throws(()=>parse({...queue(),entries:[{...queue().entries[0],request:{...request(0),...patch}},queue().entries[1]]}));
});
test('receipt alone cannot be saved; only exact fresh link completes and other year never participates',()=>{
 let q=updateQueueEntry(queue(),0,{state:'receipt',receipt:receipt(0)});assert.equal(queueComplete(q),false);assert.equal(queueHasUnknown(q),true);
 const read=data();read.classes[0].link=linked(0);q=reconcileClassLinkQueue(q,read);assert.equal(q.entries[0].state,'saved');assert.equal(q.entries[1].state,'pending');assert.equal(queueComplete(q),false);
 q=updateQueueEntry(q,1,{state:'receipt',receipt:receipt(1)});read.classes[1].link=linked(1);assert.equal(queueComplete(reconcileClassLinkQueue(q,read)),true);
 assert.throws(()=>reconcileClassLinkQueue(q,{...read,schoolYear:2028}));assert.deepEqual(q.entries.map(e=>e.request),queue().entries.map(e=>e.request));
});
test('unknown result is never guessed from matching link or converted to a fresh command',()=>{
 const q=updateQueueEntry(queue(),0,{state:'unknown'}),read=data();read.classes[0].link=linked(0);
 assert.deepEqual(reconcileClassLinkQueue(q,read),q);assert.deepEqual(parse(JSON.parse(JSON.stringify(q))),q);
 assert.throws(()=>parse(updateQueueEntry(q,1,{state:'unknown'})));
});
test('concurrent changes invalidate pending or acknowledged entries without rolling any link back',()=>{
 const read=data();read.classes[0].link={...linked(0),planId:id(99),revision:4};
 const q=updateQueueEntry(queue(),0,{state:'saved',receipt:receipt(0)}),checked=reconcileClassLinkQueue(q,read);
 assert.equal(checked.entries[0].state,'conflict');assert.equal(checked.entries[1].state,'pending');assert.equal(read.classes[0].link.planId,id(99));
 const pending=reconcileClassLinkQueue(queue(),read);assert.equal(pending.entries[0].state,'conflict');
 for(const patch of [{canManage:false},{plan:{...read.plan,revision:4}},{plan:{...read.plan,status:'ersatt'}}])assert.equal(reconcileClassLinkQueue(queue(),{...data(),...patch}).entries[0].state,'conflict');
});
test('earlier acknowledged conflict and later unknown receipt stay recoverable together',()=>{
 let q=updateQueueEntry(queue(),0,{state:'saved',receipt:receipt(0)});q=updateQueueEntry(q,1,{state:'unknown'});
 const checked=reconcileClassLinkQueue(q,data());assert.equal(checked.entries[0].state,'conflict');assert.equal(checked.entries[1].state,'unknown');assert.deepEqual(parse(checked),checked);
});
test('journal rejects missing receipts, cross-class receipts, exotic objects and sparse entries without invoking accessors',()=>{
 for(const patch of [{state:'saved'},{state:'receipt'},{state:'pending',receipt:receipt(0)},{state:'unknown',receipt:receipt(0)},{state:'saved',receipt:receipt(1)}])assert.throws(()=>parse({...queue(),entries:[{...queue().entries[0],...patch},queue().entries[1]]}));
 const sparse=queue();Reflect.deleteProperty(sparse.entries,'0');assert.throws(()=>parse(sparse));let called=false;const getter=queue();Object.defineProperty(getter,'scope',{get(){called=true;return queue().scope;}});assert.throws(()=>parse(getter));assert.equal(called,false);
 const symbol=queue();symbol.entries[0][Symbol('extra')]=1;assert.throws(()=>parse(symbol));assert.throws(()=>parse(Object.assign(Object.create({foreign:true}),queue())));
});

test('changed reviewed plan name or class name stops unsent commands, without losing an unknown one',()=>{
 const q={...queue(),series:{id:id(80),name:'Grund',revision:0}},read=data();read.plan.series={...q.series,name:'Matematik',revision:1};assert.equal(reconcileClassLinkQueue(q,read).entries[0].state,'conflict');
 const unknown=updateQueueEntry(q,0,{state:'unknown'});assert.equal(reconcileClassLinkQueue(unknown,read).entries[0].state,'unknown');assert.equal(reconcileClassLinkQueue(unknown,read).entries[1].state,'conflict');
 const renamed=data();renamed.classes[0].name='Annat namn';assert.equal(reconcileClassLinkQueue(queue(),renamed).entries[0].state,'conflict');
});
