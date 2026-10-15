import test from 'node:test';
import assert from 'node:assert/strict';
import {parseClassPlanCreateRequest,parseClassPlanLinkRequest,parseClassPlanLinkReply,parseClassPlanUnderlag} from './class-timplan.ts';
const id='aaaaaaaa-0000-4000-8000-000000000001';
const create={commandId:id,planId:id,expectedPlanRevision:2,name:'SA27A',startYear:2027};
const link={commandId:id,classId:id,schoolYear:2027,planId:id,expectedPlanRevision:2,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};
test('strict class name and cohort, no coerced revision or extra attributes',()=>{assert.deepEqual(parseClassPlanCreateRequest(create),create);for(const patch of [{name:''},{name:'Sa27a'},{name:'SA\n27A'},{name:' SA27A'},{startYear:1999},{expectedPlanRevision:'2'},{unexpected:true}])assert.throws(()=>parseClassPlanCreateRequest({...create,...patch}));});
test('explicit prior plan and revision must travel together',()=>{assert.deepEqual(parseClassPlanLinkRequest(link),link);for(const patch of [{expectedLinkRevision:0},{previousPlanId:id},{columnId:'ak1'},{schoolYear:2027.5},{expectedLinkRevision:-1,previousPlanId:id}])assert.throws(()=>parseClassPlanLinkRequest({...link,...patch}));assert.equal(parseClassPlanLinkRequest({...link,expectedLinkRevision:0,previousPlanId:id}).expectedLinkRevision,0);});
test('reply binds exact requested class, year, version and next revision including replay',()=>{const reply={classId:id,schoolYear:2027,planId:id,columnId:'ar1',revision:0,replayed:true};assert.deepEqual(parseClassPlanLinkReply(reply,link),reply);for(const patch of [{schoolYear:2028},{revision:1},{columnId:'ar2'}])assert.throws(()=>parseClassPlanLinkReply({...reply,...patch},link));});
test('read contract never claims blocked or replaced plan is writable',()=>{const data={plan:{id,offeringId:id,unitId:id,schoolName:'Skola',educationName:'SA',cohort:'HT2027',startYear:2027,version:1,status:'faststalld',revision:2},schoolYear:2027,canManage:true,blockers:[],classes:[],linkedClasses:[]};assert.equal(parseClassPlanUnderlag(data,{planId:id,schoolYear:2027}).canManage,true);for(const patch of [{blockers:['Fel kull']},{plan:{...data.plan,status:'ersatt'}},{plan:{...data.plan,startYear:null}}])assert.throws(()=>parseClassPlanUnderlag({...data,...patch},{planId:id,schoolYear:2027}));});
test('legacy reader distinguishes unknown class ID from modern identified link',()=>{const data={plan:{id,offeringId:id,unitId:id,schoolName:'Skola',educationName:'SA',cohort:'HT2027',startYear:null,version:1,status:'ersatt',revision:2},schoolYear:2027,canManage:false,blockers:['Äldre underlag'],classes:[],linkedClasses:[{classId:null,className:'SA27A',classStartYear:null,schoolYear:2027,columnId:'ar1',revision:0,legacy:true}]};assert.equal(parseClassPlanUnderlag(data,{planId:id,schoolYear:2027}).linkedClasses[0].legacy,true);assert.throws(()=>parseClassPlanUnderlag({...data,linkedClasses:[{...data.linkedClasses[0],legacy:false}]},{planId:id,schoolYear:2027}));});

const uid=n=>`aaaaaaaa-0000-4000-8000-${String(n).padStart(12,'0')}`;
const series=n=>({id:uid(n),name:`Plan ${n}`,revision:0});
const namedData=()=>({plan:{id,offeringId:uid(2),unitId:uid(3),schoolName:'Skola',educationName:'SA',cohort:'HT2027',startYear:2027,version:1,status:'faststalld',revision:2,series:series(10)},schoolYear:2027,canManage:true,blockers:[],classes:[{id:uid(20),name:'SA27A',startYear:2027,link:{planId:id,version:1,status:'faststalld',columnId:'ar1',revision:0,legacy:false,series:series(10)}},{id:uid(21),name:'SA27B',startYear:2027,link:{planId:uid(30),version:1,status:'faststalld',columnId:'ar1',revision:0,legacy:false,series:series(11)}}],linkedClasses:[]});
test('class underlag keeps exact named plan identities and multiple version ones',()=>{
 const d=namedData(),expected={planId:id,schoolYear:2027};assert.deepEqual(parseClassPlanUnderlag(d,expected),d);
 for(const patch of [{series:series(10)},{series:{...series(10),name:'Fel'},version:2},{planId:id},{series:null},{series:{...series(11),revision:-1}}])assert.throws(()=>parseClassPlanUnderlag({...d,classes:[d.classes[0],{...d.classes[1],link:{...d.classes[1].link,...patch}}]},expected));
 const missing=structuredClone(d);delete missing.classes[1].link.series;assert.throws(()=>parseClassPlanUnderlag(missing,expected));
 const mixed=structuredClone(d);delete mixed.plan.series;assert.throws(()=>parseClassPlanUnderlag(mixed,expected));
 const renamed=structuredClone(d);renamed.plan.series.name='Nytt namn';renamed.plan.series.revision=1;renamed.classes[0].link.series={...renamed.plan.series};const parsed=parseClassPlanUnderlag(renamed,expected);assert.equal(parsed.classes[0].id,d.classes[0].id);assert.equal(parsed.classes[0].link.planId,id);
});
test('named class links reject metadata accessors without execution and do not extend link receipts',()=>{
 let called=false;const d=namedData();Object.defineProperty(d.classes[0].link,'series',{enumerable:true,get(){called=true;return series(10);}});assert.throws(()=>parseClassPlanUnderlag(d,{planId:id,schoolYear:2027}));assert.equal(called,false);
 const other=namedData();other.classes[0].link.series[Symbol('extra')]=1;assert.throws(()=>parseClassPlanUnderlag(other,{planId:id,schoolYear:2027}));
 assert.throws(()=>parseClassPlanLinkReply({classId:id,schoolYear:2027,planId:id,columnId:'ar1',revision:0,replayed:true,series:series(10)},link));
});
