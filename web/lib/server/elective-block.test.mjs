import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({load(url,ctx,next){if(url===new URL('./session.ts',import.meta.url).href)return {format:'module',shortCircuit:true,source:'export const readSession=()=>{throw Error("unexpected session")};'};if(url===new URL('./env.ts',import.meta.url).href)return {format:'module',shortCircuit:true,source:'export const serverEnv=()=>({});'};if(url===new URL('./db.ts',import.meta.url).href)return {format:'module',shortCircuit:true,source:'export class Deny extends Error {constructor(code,status,details){super(code);this.code=code;this.status=status;this.details=details;}} export const withLoginPhase=()=>{throw Error("unexpected DB")};export const withSessionContext=()=>{throw Error("unexpected DB")};'};return next(url,ctx);}});
const { readElectiveBlocks, commandElectiveBlock, statusElectiveBlock, electiveRequest } = await import('./elective-block.ts');
import { createElectiveCommandRef, parseElectiveCommand } from '../elective-block-contract.ts';
const id=n=>`75300200-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope={unitId:id(1),schoolYear:2027},authority={identityId:id(2),assignmentId:id(3),accessFunction:'rektor'};
const read=()=>({contractVersion:'elective_block_v1',...scope,schoolName:'Syntetisk skola',revision:1,canManage:true,canReadPupils:false,
 policy:{unitId:id(1),revision:1,guardianConfirmation:null},sources:[],blocks:[],pupils:null,rounds:[],choices:null,placements:null});
const wrap=result=>({contractVersion:'elective_sql_v1',actor:{identityId:id(2),assignmentId:id(3)},result});
function fixture(reply,error){const calls=[];const tx=async(strings,...values)=>{calls.push({sql:strings.join('?'),values});if(error)throw error;return [{result:structuredClone(reply)}];};tx.json=v=>v;return {tx,calls};}
const q=()=>({...scope,commandId:id(4),expectedRevision:1,action:'set_policy',payload:{guardianConfirmation:false}});
const rejects=(fn,code)=>assert.rejects(fn,e=>e.code===code||e.name===code);
test('personalread binder SQLaktör, skola och år innan några data lämnar servern',async()=>{
 const f=fixture(wrap(read()));assert.deepEqual((await readElectiveBlocks(f.tx,authority,scope)).body,read());assert.match(f.calls[0].sql,/elective_block_read/);
 for(const reply of [wrap({...read(),unitId:id(90)}),{...wrap(read()),actor:{identityId:id(90),assignmentId:id(3)}},{...wrap(read()),actor:{identityId:id(2),assignmentId:id(90)}}])await rejects(()=>readElectiveBlocks(fixture(reply).tx,authority,scope),'AuditUnavailable');
});
test('elev/VH och andra roller kan inte få personalread genom adapteranrop',async()=>{
 for(const role of ['larare','huvudman','support',null,'elev','vardnadshavare']){const f=fixture(wrap(read()));await rejects(()=>readElectiveBlocks(f.tx,{...authority,accessFunction:role},scope),'forbidden');assert.equal(f.calls.length,0);}
});
test('kvittot verifierar exaktrequesthash och status kräver bara referens utan valpayload',async()=>{
 const command=q(),ref=await createElectiveCommandRef(command),receipt={...ref,revision:2,objectId:id(1),objectRevision:2,replayed:false};
 const f=fixture(wrap(receipt));assert.deepEqual((await commandElectiveBlock(f.tx,authority,command)).body,receipt);
 await rejects(()=>commandElectiveBlock(fixture(wrap({...receipt,payloadHash:'a'.repeat(64)})).tx,authority,command),'AuditUnavailable');
 const status={...scope,commandId:command.commandId,status:'found',receipt:{...receipt,replayed:true}},sf=fixture(wrap(status));
 assert.deepEqual((await statusElectiveBlock(sf.tx,authority,ref)).body,status);assert.deepEqual(sf.calls[0].values,[ref]);assert.equal(Object.hasOwn(sf.calls[0].values[0],'payload'),false);
});
test('SQLkonflikt, auditfel och oönskat fel ger slutna svar utan databasinnehåll',async()=>{
 for(const [error,code] of [[{code:'40001',hint:'elective_revision_conflict'},'conflict'],[{code:'42501'},'forbidden'],[{code:'55000'},'AuditUnavailable'],[{code:'22023',hint:'elective_option_not_allowed'},'bad_request'],[{code:'12345',message:'privat innehåll'},'AuditUnavailable']])await rejects(()=>readElectiveBlocks(fixture(null,error).tx,authority,scope),code);
});
test('känsliga projektioner får inte visas som fullständig tom lista utan mandat',async()=>{
 for(const patch of [{pupils:[]},{choices:[]},{placements:[]}])await rejects(()=>readElectiveBlocks(fixture(wrap({...read(),...patch})).tx,authority,scope),'AuditUnavailable');
});
test('HTTPrequest valideras slutet och storleksgränsen gäller verkliga strömmade byte',async()=>{
 const request=v=>new Request('http://localhost/api/valbara-block/kommando',{method:'POST',body:JSON.stringify(v)});
 assert.deepEqual(await electiveRequest(request(q()),parseElectiveCommand),q());
 await rejects(()=>electiveRequest(request({...q(),identityId:id(5)}),parseElectiveCommand),'bad_request');
 await rejects(()=>electiveRequest(request({x:'x'.repeat(65537)}),parseElectiveCommand),'bad_request');
});
