import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({load(url,ctx,next){if(url===new URL('./session.ts',import.meta.url).href)return {format:'module',shortCircuit:true,source:'export const readSession=()=>{throw Error("unexpected session")};'};if(url===new URL('./env.ts',import.meta.url).href)return {format:'module',shortCircuit:true,source:'export const serverEnv=()=>({});'};if(url===new URL('./db.ts',import.meta.url).href)return {format:'module',shortCircuit:true,source:'export class Deny extends Error {constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=()=>{throw Error("unexpected DB")};export const withSessionContext=()=>{throw Error("unexpected DB")};'};return next(url,ctx);}});
const {previewElectivePlacement}=await import('./elective-placement.ts');
const {parsePlacementPreviewRequest}=await import('../elective-placement-contract.ts');
const {parseElectiveCommand}=await import('../elective-block-contract.ts');
const id=n=>`75300200-0000-4000-8000-${String(n).padStart(12,'0')}`;
const authority={identityId:id(2),assignmentId:id(3),accessFunction:'rektor'};
const request=()=>({unitId:id(1),schoolYear:2026,expectedRevision:4,payload:{placementId:id(4),choiceId:id(5),expectedChoiceRevision:1,groupId:id(6),startsOn:'2026-11-01',endsOn:null,previousPlacementId:null}});
const answer=()=>({unitId:id(1),schoolYear:2026,revision:4,basisHash:'a'.repeat(64),allowed:true,issues:[],pupil:{id:id(7),name:'Syntetisk elev',version:2},group:{id:id(6),name:'Språkgrupp',startsOn:'2026-07-01',endsOn:'2027-06-30'},period:{startsOn:'2026-11-01',endsOn:'2027-06-30'},schoolPeriods:[{startsOn:'2026-07-01',endsOn:null}],classPeriods:[{classId:id(8),className:'7A',startsOn:'2026-07-01',endsOn:null}],previous:null,warnings:[]});
const wrap=result=>({contractVersion:'elective_sql_v1',actor:{identityId:id(2),assignmentId:id(3)},result});
function fixture(reply,error){const calls=[];const tx=async(strings,...values)=>{calls.push({sql:strings.join('?'),values});if(error)throw error;return[{result:reply}];};tx.json=v=>v;return{tx,calls};}
test('granskning lämnar datumfakta först efter korrekt skolaktör och exakt grupp/scope',async()=>{
 const f=fixture(wrap(answer()));assert.deepEqual((await previewElectivePlacement(f.tx,authority,request())).body,answer());assert.match(f.calls[0].sql,/elective_placement_preview/);
 for(const body of [{...answer(),unitId:id(90)},{...answer(),group:{...answer().group,id:id(90)}},{...answer(),period:{startsOn:'2026-12-01',endsOn:'2027-06-30'}},{...answer(),allowed:true,issues:['choice_not_confirmed']}])await assert.rejects(()=>previewElectivePlacement(fixture(wrap(body)).tx,authority,request()),e=>e.name==='AuditUnavailable');
});
test('elev och VH får ingen personalgranskning via direktadapter',async()=>{
 for(const role of ['larare','elev','guardian',null]){const f=fixture(wrap(answer()));await assert.rejects(()=>previewElectivePlacement(f.tx,{...authority,accessFunction:role},request()),e=>e.code==='forbidden');assert.equal(f.calls.length,0);}
});
test('ändrat liveunderlag är bestämd409 och SQLdetaljer lämnas aldrig ut',async()=>{
 await assert.rejects(()=>previewElectivePlacement(fixture(null,{code:'40001',hint:'elective_placement_conflict',message:'privat'}).tx,authority,request()),e=>e.code==='conflict'&&e.status===409&&e.details.reason==='elective_placement_conflict');
 await assert.rejects(()=>previewElectivePlacement(fixture(null,{code:'55000'}).tx,authority,request()),e=>e.name==='AuditUnavailable');
});
test('apply kräver reviewhash medan preview aldrig tillåter klientens behörighetsfält',()=>{
 assert.deepEqual(parsePlacementPreviewRequest(request()),request());assert.throws(()=>parsePlacementPreviewRequest({...request(),identityId:id(9)}));
 const c={...request(),commandId:id(10),action:'save_placement'};assert.throws(()=>parseElectiveCommand(c));
 assert.equal(parseElectiveCommand({...c,payload:{...c.payload,expectedBasisHash:'a'.repeat(64)}}).payload.expectedBasisHash,'a'.repeat(64));
 assert.throws(()=>parseElectiveCommand({...c,payload:{...c.payload,expectedBasisHash:'not-reviewed'}}));
});
