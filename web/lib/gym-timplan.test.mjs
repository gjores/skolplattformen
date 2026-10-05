import test from 'node:test';
import assert from 'node:assert/strict';
import {
  gymTimplanCanEdit, gymTimplanTotals, parseGymTimplan, parseGymTimplanCreateReply, parseGymTimplanCreateRequest,
  parseGymTimplanHourInput, parseGymTimplanHours, parseGymTimplanReadRequest, parseGymTimplanRowReply,
  parseGymTimplanRowRequest, parseGymTimplanUnderlag, parseGymTimplanUnderlagRequest,
} from './gym-timplan.ts';

const id = '55401000-0000-4000-8000-000000000001', unit = '55401000-0000-4000-8000-000000000002', other = '55401000-0000-4000-8000-000000000003';
const key = 'foundation:ENGE:1:ENGE1000X';
const source = () => ({planId:id,offeringId:other,version:1,revision:3,status:'utkast',catalogId:`sha256:${'0'.repeat(64)}`,startedOn:'2027-08-01',educationRevision:2,
  education:{name:'Syntetisk utbildning',cohort:'27/28',programCode:'SA25',orientationCode:'SABET'}});
const row = () => ({key,name:'Engelska',levelName:'Nivå 1',points:100,part:'foundation',pointTerms:[50,50,0,0,0,0],rowKind:'fixed'});
const plan = () => ({id:other,offeringId:other,unitId:unit,schoolName:'Syntetisk skola',version:1,revision:0,status:'utkast',source:source(),
  currentSource:{planId:id,version:1,revision:3,status:'utkast'},rows:[row()],hours:{[key]:[null,null,null,null,null,null]},canPlan:true,archived:false,sourceChanged:false});
const command = () => ({commandId:other,sourcePlanId:id,expectedSourceRevision:3,expectedEducationRevision:2,unitId:unit,predecessorPlanId:null,expectedPredecessorRevision:null});
const write = () => ({planId:other,expectedRevision:0,rowKey:key,hours:[0,45,null,null,null,null]});
test('blank hours, explicit zero and inactive terms keep distinct meanings', () => {
  assert.equal(parseGymTimplanHourInput(''),null); assert.equal(parseGymTimplanHourInput('0'),0); assert.equal(parseGymTimplanHourInput('2000'),2000);
  for (const input of [' ','-1','1.5','2001','1e2','abc']) assert.equal(parseGymTimplanHourInput(input),undefined);
  assert.deepEqual(parseGymTimplanHours([null,0,45,null,null,null]),[null,0,45,null,null,null]);
  for (const value of [[],[0,0,0],['0',0,0,0,0,0],[null,1.5,null,null,null,null],[null,2001,null,null,null,null]]) assert.throws(() => parseGymTimplanHours(value));
});
test('closed creation commands bind exact source, education, school and predecessor revisions', () => {
  assert.deepEqual(parseGymTimplanCreateRequest(command()),command());
  for (const changes of [{actorId:id},{role:'rektor'},{expectedSourceRevision:-1},{expectedEducationRevision:'2'},{predecessorPlanId:id},
    {expectedPredecessorRevision:0},{unitId:'bad'},{commandId:null},{expectedSourceRevision:2147483647}]) assert.throws(() => parseGymTimplanCreateRequest({...command(),...changes}));
  const withPredecessor = {...command(),predecessorPlanId:id,expectedPredecessorRevision:5};
  assert.deepEqual(parseGymTimplanCreateRequest(withPredecessor),withPredecessor);
});
test('read and row commands reject extra selection fields and preserve null', () => {
  assert.deepEqual(parseGymTimplanUnderlagRequest({sourcePlanId:id}),{sourcePlanId:id}); assert.deepEqual(parseGymTimplanReadRequest({planId:other}),{planId:other});
  assert.deepEqual(parseGymTimplanRowRequest(write()),write());
  for (const value of [{planId:other,unitId:unit},{planId:other,customerId:id},{planId:7},null]) assert.throws(() => parseGymTimplanReadRequest(value));
  for (const changes of [{rowKey:'__proto__'},{rowKey:'foundation:ENGE:0:ENGE1000X'},{hours:[0,0,0,0,0,0,0]},{expectedRevision:2147483647},{actorId:id}]) assert.throws(() => parseGymTimplanRowRequest({...write(),...changes}));
});
test('hostile descriptors and sparse arrays cannot become closed contracts', () => {
  const sparse = [null,null,null,null,null,null]; Reflect.deleteProperty(sparse,'2'); assert.throws(() => parseGymTimplanHours(sparse));
  const getter = {...command()}; Object.defineProperty(getter,'commandId',{get(){throw new Error('Getter must never run');},enumerable:true});
  assert.throws(() => parseGymTimplanCreateRequest(getter),error => error.code === 'invalid_gym_timplan');
  const own = {...command()}; own[Symbol('secret')] = 'private'; assert.throws(() => parseGymTimplanCreateRequest(own));
});
test('saved hours require all frozen rows and exact active terms', () => {
  assert.deepEqual(parseGymTimplan(plan(),other),plan());
  for (const mutate of [p=>delete p.hours[key],p=>p.hours.extra=[null,null,null,null,null,null],p=>p.hours[key][2]=0,
    p=>p.rows[0].pointTerms=[0,0,0,0,0,0],p=>p.source.offeringId=id,p=>p.secret='private']) {
    const value = plan(); mutate(value); assert.throws(() => parseGymTimplan(value,other));
  }
});
test('source change detection binds ID, version and revision without rewriting the snapshot', () => {
  for (const change of [{planId:unit},{version:2},{revision:4}]) {
    const value = plan(); Object.assign(value.currentSource,change); value.sourceChanged=true;
    const parsed = parseGymTimplan(value,other); assert.equal(parsed.sourceChanged,true); assert.deepEqual(parsed.source,source());
    value.sourceChanged=false; assert.throws(() => parseGymTimplan(value,other));
  }
  const value = plan(); value.currentSource=null; value.sourceChanged=true; assert.equal(parseGymTimplan(value,other).sourceChanged,true);
});
test('underlag can explain incomplete point terms while existing frozen plans cannot', () => {
  const value = {source:source(),units:[{unitId:unit,schoolName:'Syntetisk skola',canPlan:true,plans:[]}],rows:[{...row(),pointTerms:[0,0,0,0,0,0]}],
    readiness:{ready:false,missing:['Alla nivåer är inte fördelade på terminer.']}};
  assert.equal(parseGymTimplanUnderlag(value,id).readiness.ready,false);
  for (const mutate of [v=>v.readiness.ready=true,v=>v.units.push({...v.units[0]}),v=>v.source.planId=other,v=>v.catalog='private']) {
    const changed=structuredClone(value);mutate(changed);assert.throws(()=>parseGymTimplanUnderlag(changed,id));
  }
});
test('create replay and row acknowledgements cannot accept wrong identities, revisions or changed values', () => {
  const created={id:other,offeringId:other,unitId:unit,version:1,revision:0,sourcePlanId:id,sourceRevision:3,replayed:false,carriedRows:0,resetRows:1};
  assert.deepEqual(parseGymTimplanCreateReply(created,command()),created);
  assert.equal(parseGymTimplanCreateReply({...created,replayed:true,revision:2},command()).revision,2);
  for (const changes of [{unitId:id},{sourcePlanId:unit},{sourceRevision:4},{revision:1},{carriedRows:-1},{secret:'private'}]) assert.throws(()=>parseGymTimplanCreateReply({...created,...changes},command()));
  const saved={id:other,revision:1,rowKey:key,hours:write().hours};assert.deepEqual(parseGymTimplanRowReply(saved,write()),saved);
  for (const changes of [{id:id},{revision:0},{rowKey:'block:iv1'},{hours:[null,45,null,null,null,null]},{secret:'private'}]) assert.throws(()=>parseGymTimplanRowReply({...saved,...changes},write()));
});
test('school planning capability and current plan status control editing', () => {
  assert.equal(gymTimplanCanEdit(plan()),true);
  for (const change of [{canPlan:false},{archived:true},{status:'faststalld'},{status:'ersatt'},{status:'forslag'},{status:'atersand'}]) assert.equal(gymTimplanCanEdit({...plan(),...change}),false);
});
test('hour totals count each frame row once and explicit zero completes an active cell', () => {
  const value=plan(); assert.deepEqual(gymTimplanTotals(value),{terms:[0,0,0,0,0,0],total:0,missingRows:[key]});
  value.hours[key]=[0,40,null,null,null,null];assert.deepEqual(gymTimplanTotals(value),{terms:[0,40,0,0,0,0],total:40,missingRows:[]});
  const alternative={...row(),key:'alternative:foundation:SVEN:1:SVEN1000X+SVEA:1:SVEA1000X',name:'Svenska/svenska som andraspråk',rowKind:'alternative'};
  value.rows.push(alternative,{...row(),key:'block:iv1',name:'Individuellt val',rowKind:'block',part:'individualChoice'});
  value.hours[alternative.key]=[25,25,null,null,null,null];value.hours['block:iv1']=[20,30,null,null,null,null];
  assert.equal(gymTimplanTotals(value).total,140);
});
