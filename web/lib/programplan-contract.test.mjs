import test from 'node:test';
import assert from 'node:assert/strict';
import * as c from './programplan-contract.ts';
const id='55009000-0000-4000-8000-000000000001';
export const reference=()=>({catalogId:`sha256:${'a'.repeat(64)}`,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:'2026-08-01',choiceBlocks:[{id:'mosp',kind:'modernLanguage',points:200,name:'Moderna språk'},{id:'iv1',kind:'individualChoice',points:200,name:'Individuellt val'}],specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100}]});
export const plan=()=>({id,offeringId:id,unitId:id,schoolName:'Syntetisk skola',education:{name:'Syntetisk utbildning',cohort:'Fri text',programCode:'SA25',orientationCode:'SABEP'},version:1,revision:0,status:'utkast',decidedOn:null,catalogId:reference().catalogId,basisReference:reference(),resolution:{status:'resolved',diagnostics:[],unresolvedChoices:[{kind:'optional_subject',blockId:'foundation',subjectCode:'SVEN',points:300},{kind:'subject_levels_unresolved',blockId:'specialization',subjectCode:'MOD',points:100},{kind:'program_rules_unverified',blockId:'program',category:'studieförberedande'}],decisionReady:false}});
/** @type {[string, object][]} */
const forms=[['Read',{planId:id}],['Bind',{planId:id,expectedRevision:0,basisReference:reference()}],['Replace',{planId:id,expectedRevision:0,specializationRefs:reference().specializationRefs}],['Create',{offeringId:id,expectedLatestVersion:0,basisReference:reference()}],['Clone',{sourcePlanId:id,expectedSourceRevision:0,expectedLatestVersion:0,explicitLegacyBasis:null}]];
for(const[name,value]of forms)test(`${name}: exakt begäran, inga klientmandat, accessor/prototyp eller koercion`,()=>{
 const parse={Read:c.parseProgramplanRead,Bind:c.parseProgramplanBind,Replace:c.parseProgramplanReplace,Create:c.parseProgramplanCreate,Clone:c.parseProgramplanClone}[name];assert.deepEqual(parse(value),value);
 for(const bad of [null,[],{...value,role:'huvudman'},{...value,customerId:id},{...value,status:'faststalld'},Object.assign(Object.create({role:'rektor'}),value),Object.defineProperty({...value},'private',{value:true}),Object.defineProperty({...value},'private',{get(){throw Error('getter invoked');}}),{...value,[Symbol('x')]:1}])assert.throws(()=>parse(bad));
 for(const key of Object.keys(value)){const missing={...value};delete missing[key];assert.throws(()=>parse(missing));if(/Revision|Version/.test(key))for(const v of [-1,'0',1.5,2147483647,null])assert.throws(()=>parse({...value,[key]:v}));if(key.endsWith('Id'))assert.throws(()=>parse({...value,[key]:'bad'}));}
});
test('ordnade nivåer och kalenderdatum bevaras; formatfel trunkeras aldrig',()=>{
 assert.deepEqual(c.parseProgramplanLevels(reference().specializationRefs),reference().specializationRefs);
 for(const v of [null,Array(1),Array(201).fill(reference().specializationRefs[0]),[{...reference().specializationRefs[0],points:'100'}],[{...reference().specializationRefs[0],subjectVersion:0}],[{...reference().specializationRefs[0],secret:1}]])assert.throws(()=>c.parseProgramplanLevels(v));
 for(const ref of [{...reference(),startedOn:'2026-02-30'},{...reference(),role:'rektor'},{...reference(),programRef:{...reference().programRef,secret:1}}])assert.throws(()=>c.parseProgramplanBind({...forms[1][1],basisReference:ref}));
});
test('tolvfältssvar bevarar alla olösta val och explicit obunden äldre plan',()=>{
 assert.deepEqual(c.parseProgramplan(plan()),plan());
 const legacy={...plan(),catalogId:null,basisReference:null,resolution:{status:'blocked',diagnostics:[{code:'unpinned_basis'}],unresolvedChoices:[],decisionReady:false}};
 assert.deepEqual(c.parseProgramplan(legacy),legacy);
 for(const mutate of [p=>p.actor='private',p=>p.id='no',p=>p.education.secret=1,p=>p.education.programCode='EK25',p=>p.education.orientationCode='SASAP',p=>p.catalogId=null,p=>p.catalogId=`sha256:${'b'.repeat(64)}`,p=>p.decidedOn='2026-02-30',p=>p.status='forslag',p=>p.version=0,p=>p.revision='0',p=>p.resolution.decisionReady=true,p=>p.resolution.writeReady=false,p=>p.resolution.diagnostics=[{code:'private SQL'}],p=>p.resolution.unresolvedChoices[0].secret=1,p=>p.resolution.unresolvedChoices[2].kind='unknown',p=>p.resolution.unresolvedChoices[0].points=null,p=>p.resolution.status='blocked']){const p=plan();mutate(p);assert.throws(()=>c.parseProgramplan(p));}
 for(const mutate of [p=>p.resolution.status='resolved',p=>p.resolution.diagnostics=[{code:'catalog_unavailable'}],p=>p.basisReference=reference()]){const p=structuredClone(legacy);mutate(p);assert.throws(()=>c.parseProgramplan(p));}
});

test('05-23 reply resolution accepts new block diagnoses without opening arbitrary fields',async()=>{
 const {parseProgramplanResolution}=await import('./programplan-contract.ts');
 for(const code of ['invalid_choice_blocks','duplicate_choice_block','missing_slot_block','unexpected_slot_block','slot_block_mismatch','individual_choice_points_mismatch']){
 const value={status:'blocked',diagnostics:[{code}],unresolvedChoices:[],decisionReady:false};assert.deepEqual(parseProgramplanResolution(value),value);
 assert.throws(()=>parseProgramplanResolution({...value,diagnostics:[{code,extra:'foreign'}]}));
 }
});

test('new explicit commands require current shape while historical replies preserve legacy',()=>{
 const old=reference();delete old.choiceBlocks;
 assert.throws(()=>c.parseProgramplanCreate({offeringId:id,expectedLatestVersion:0,basisReference:old}));
 assert.throws(()=>c.parseProgramplanBind({planId:id,expectedRevision:0,basisReference:old}));
 assert.throws(()=>c.parseProgramplanClone({sourcePlanId:id,expectedSourceRevision:0,expectedLatestVersion:0,explicitLegacyBasis:old}));
 const historical=plan();historical.basisReference=old;historical.status='faststalld';assert.deepEqual(c.parseProgramplan(historical),historical);
});
test('blocks request has closed contract and retains ordered custom blocks',()=>{
 const value={planId:id,expectedRevision:3,choiceBlocks:reference().choiceBlocks};assert.deepEqual(c.parseProgramplanBlocks(value),value);
 for(const bad of [{...value,role:'rektor'},{...value,expectedRevision:-1},{...value,choiceBlocks:[{...value.choiceBlocks[0],extra:1}]}])assert.throws(()=>c.parseProgramplanBlocks(bad));
});
