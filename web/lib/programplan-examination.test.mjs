import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProgramplanExamination,validProgramplanExamination,requiresProgramplanExamination,examinationLabel} from './programplan-examination.ts';
import {parseProgramplanBasisReference} from './programplan-catalog.ts';
import {programplanTermRows} from './programplan-terms.ts';
import {parseGymTimplanSource} from './gym-timplan.ts';
import {suggestGymTimplanTimeV2} from './gym-timplan-distribution.ts';
import {timplanBudgetMinimum} from './timplan-budget.ts';
import {aplSourceProfileSupported,aplContentHashPayload} from './apl-plan.ts';
const id='55408000-0000-4000-8000-000000000001',start='2028-08-14';
const exam=(model='vocational_exam')=>({model,appliesToStart:start,checkedOn:'2026-10-18',referenceUrl:'https://www.skolverket.se/yrkesprov',referenceText:'Syntetiskt källunderlag för provning; ingen publicerad provkod påstås.'});
const basis=()=>({catalogId:`sha256:${'a'.repeat(64)}`,programRef:{code:'BF25',version:1},orientationCode:null,startedOn:start,specializationRefs:[]});
const program={code:'BF25',version:1,category:'VOCATIONAL_PROGRAM',foundation:[],programmeSpecific:[],orientations:[],specialization:[],startDate:'2025-07-01',endDate:null,canceledDate:null,sourceSupported:true};
const aplProgram=Object.fromEntries(['code','version','category','startDate','endDate','canceledDate','sourceSupported'].map(k=>[k,program[k]]));
const source=()=>({planId:id,offeringId:id,version:1,revision:1,status:'faststalld',catalogId:basis().catalogId,startedOn:start,educationRevision:0,education:{name:'Syntetisk BF',cohort:'2028',programCode:'BF25',orientationCode:null}});
const rowKey='programmeSpecific:PEDG:1:PEDG1000X';
const timetable=()=>({id,offeringId:id,unitId:id,schoolName:'Syntetisk skola',version:1,revision:1,status:'utkast',series:{id,name:'Syntetisk plan',revision:0},nameAtCreation:null,canPlan:true,archived:false,sourceChanged:false,currentSource:{planId:id,version:1,revision:1,status:'faststalld'},source:source(),timeModel:'school_terms_annual_apl_v2',timeCopyReview:[],rows:[{key:rowKey,name:'Syntetisk rad',levelName:'Nivå 1',part:'programmeSpecific',rowKind:'fixed',points:2700,pointTerms:[450,450,450,450,450,450]}],timeRows:{[rowKey]:{schoolMinutes:Array(6).fill(0),annualAplMinutes:Array(3).fill(0)}}});
test('only new vocational cohorts require an explicit examination review; unknown is never diploma',()=>{
 for(const [code,date,expected] of [['BF25','2028-07-01',false],['BF25','2028-07-02',true],['BF25',start,true],['SA25',start,false],['ZZ25',start,false],['BF25',null,false]])assert.equal(requiresProgramplanExamination(code,date),expected);
 assert.equal(validProgramplanExamination(undefined,'BF25',start),false);
 for(const model of ['vocational_exam','diploma_work'])assert.equal(validProgramplanExamination(exam(model),'BF25',start,'2026-10-18'),true);
 assert.equal(validProgramplanExamination(exam(),'BF25','2029-08-14'),false);
 assert.equal(validProgramplanExamination(exam(),'BF25',start,'2026-10-17'),false);
 assert.equal(validProgramplanExamination(exam(),'SA25',start),false);
});
test('strict evidence parsing rejects coerced, unsafe and malformed URLs, dates and descriptors',()=>{
 for(const url of ['javascript:alert(1)','http://www.skolverket.se/prov','https://skolverket.se.evil.example/prov','https://evil.example/skolverket.se','https://user@skolverket.se/prov','https://skolverket.se:443/prov','https:skolverket.se','https://skolverket.se\\@evil.example','https://skolverket.se/\nfoo'])assert.throws(()=>parseProgramplanExamination({...exam(),referenceUrl:url}));
 for(const patch of [{model:'unknown'},{checkedOn:'2028-02-30'},{appliesToStart:null},{referenceText:''},{referenceText:' x '},{referenceText:'x'.repeat(2001)},{extra:true}])assert.throws(()=>parseProgramplanExamination({...exam(),...patch}));
 assert.throws(()=>parseProgramplanExamination(Object.defineProperty(exam(),'referenceText',{get(){throw Error('must not execute getter');}})),TypeError);
 assert.deepEqual(parseProgramplanExamination(exam()),exam());
});
test('basis and frozen timetable source preserve evidence only for matching programme/start; old shapes stay exact',()=>{
 const old={...basis(),startedOn:'2027-08-14'};assert.deepEqual(parseProgramplanBasisReference(old),old);
 const next={...basis(),examination:exam()};assert.deepEqual(parseProgramplanBasisReference(next),next);
 for(const p of [{...old,examination:exam()},{...next,startedOn:'2029-08-14'},{...next,programRef:{code:'SA25',version:1}}])assert.throws(()=>parseProgramplanBasisReference(p));
 assert.deepEqual(parseGymTimplanSource({...source(),examination:exam()}).examination,exam());
 assert.equal(Object.hasOwn(parseGymTimplanSource(source()),'examination'),false);
 assert.throws(()=>parseGymTimplanSource({...source(),examination:{...exam(),appliesToStart:'2029-08-14'}}));
});
test('100-point row keeps identity and points while choosing the correct completion label',()=>{
 for(const model of ['vocational_exam','diploma_work']){
  const rows=programplanTermRows(program,{...basis(),examination:exam(model)}),end=rows.find(r=>r.key==='meta:diplomaWork');
  assert.equal(end.points,100);assert.equal(end.name,examinationLabel(exam(model)));assert.equal(rows.filter(r=>r.part==='diplomaWork').length,1);
 }
 assert.equal(programplanTermRows(program,basis()).find(r=>r.key==='meta:diplomaWork').name,'Gymnasiearbete');
});
test('both reviewed 2028 paths enable the same GUT/APL planning without weakening missing-review checks',()=>{
 const p=timetable();assert.equal(timplanBudgetMinimum(p),null);assert.equal(aplSourceProfileSupported(aplProgram,start),false);
 assert.throws(()=>suggestGymTimplanTimeV2(p,2625,'replace',{totalHours:345,rowKeys:[rowKey]}));
 for(const model of ['vocational_exam','diploma_work']){
  p.source.examination=exam(model);assert.deepEqual(timplanBudgetMinimum(p),{totalMinutes:157500,aplMinutes:20700});
  assert.equal(aplSourceProfileSupported(aplProgram,start,p.source.examination),true);
  const proposal=suggestGymTimplanTimeV2(p,2625,'replace',{totalHours:345,rowKeys:[rowKey]});assert.equal(proposal.totalMinutes,157500);assert.equal(proposal.aplMinutes,20700);
 }
});
test('APL hash binds all reviewed examination fields, but does not append anything to old source shapes',()=>{
 const p=timetable(),ctx={organizerId:id,plan:p,program:aplProgram,copyReview:[]};const old=aplContentHashPayload(ctx,null);
 p.source.examination=exam();const next=aplContentHashPayload(ctx,null);
 assert.deepEqual(next.slice(0,-1),old);assert.deepEqual(next.at(-1),['examination_v1',...['model','appliesToStart','checkedOn','referenceUrl','referenceText'].map(k=>exam()[k])]);
 for(const patch of [{model:'diploma_work'},{checkedOn:'2026-10-17'},{referenceUrl:'https://www.skolverket.se/annan'},{referenceText:'Annat granskat underlag.'}]){
  p.source.examination={...exam(),...patch};assert.notDeepEqual(aplContentHashPayload(ctx,null),next);
 }
});

test('generic creation, binding and legacy input cannot bypass the explicit examination review',async()=>{
 const {parseProgramplanCreate,parseProgramplanBind,parseProgramplanClone}=await import('./programplan-contract.ts');
 const {parseProgramplanEducationCreate}=await import('./programplan-education-contract.ts');
 const unreviewed={...basis(),choiceBlocks:[]};
 const cloneRequest={sourcePlanId:id,expectedSourceRevision:0,expectedLatestVersion:1};
 const requests=[
  {parse:parseProgramplanCreate,request:{offeringId:id,expectedLatestVersion:0},key:'basisReference'},
  {parse:parseProgramplanBind,request:{planId:id,expectedRevision:0},key:'basisReference'},
  {parse:parseProgramplanClone,request:cloneRequest,key:'explicitLegacyBasis'},
  {parse:parseProgramplanEducationCreate,request:{commandId:id,unitId:id,name:'Syntetisk utbildning',localCode:null,cohort:'2028'},key:'basisReference'}
 ];
 for(const {parse,request,key} of requests){assert.ok(parse({...request,[key]:unreviewed}));assert.throws(()=>parse({...request,[key]:{...unreviewed,examination:exam()}}));}
 assert.equal(parseProgramplanClone({...cloneRequest,explicitLegacyBasis:null}).explicitLegacyBasis,null);
});
