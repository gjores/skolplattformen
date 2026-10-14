import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSchoolRegistryCommand,parseSchoolRegistryLookup,parseSchoolRegistryList,parseSchoolRegistryStatus,parseSchoolRegistryLookupResult } from './school-registry.ts';
import { fetchSchoolRegistryUnit,fetchSchoolRegistryOrganization } from './server/school-registry-upstream.ts';
const id='55101400-0000-4000-8000-000000000001', hash='a'.repeat(64);
const command={commandId:id,code:'99999901',operation:'import',expectedRevision:null,registryFingerprint:hash};
const payload={meta:{modified:'2026-10-14'},data:{schoolUnitCode:'99999901',attributes:{displayName:'Syntetisk skola',status:'AKTIV',municipalityCode:'0000',schoolTypes:['GY','GR'],schoolTypeProperties:{GY:{programmes:['SA','NA']}},headMaster:'External name must never become principal'}},included:[{type:'organizer',organizationNumber:'9999999999',attributes:{displayName:'Syntetisk huvudman',municipalities:[{municipalityCode:'0000',displayName:'Testkommun'}]}}]};
test('exact request disallows role, local facts, invalid UUID, invalid revisions and wrong operation',()=>{
 assert.deepEqual(parseSchoolRegistryCommand(command),command);
 assert.deepEqual(parseSchoolRegistryCommand({...command,operation:'update',expectedRevision:hash}),{...command,operation:'update',expectedRevision:hash});
 for(const v of [{...command,role:'huvudman'},{...command,principalName:'Injected'}, {...command,commandId:'invalid'}, {...command,operation:'update'}, {...command,expectedRevision:hash}, {...command,registryFingerprint:'bad'},{...command,operation:'delete'},Object.assign(Object.create({}),command)])assert.throws(()=>parseSchoolRegistryCommand(v));
 let read=false;const getter={...command};Object.defineProperty(getter,'code',{get(){read=true;return '99999901';}});assert.throws(()=>parseSchoolRegistryCommand(getter));assert.equal(read,false);
 assert.deepEqual(parseSchoolRegistryLookup({kind:'organizationNumber',value:'9999999999'}),{kind:'organizationNumber',value:'9999999999'});
 for(const v of [{kind:'organizationNumber',value:'999999-9999'},{kind:'code',value:'123'}, {kind:'code',value:'99999901',organizerId:id}])assert.throws(()=>parseSchoolRegistryLookup(v));
});
test('immutable receipt is bound to command, code and operation; status survives JSON boundary',()=>{
 const saved={commandId:id,status:'saved',unitId:id,code:command.code,operation:'import',revision:hash,replayed:true};
 assert.deepEqual(parseSchoolRegistryStatus(JSON.parse(JSON.stringify(saved)),command),saved);
 assert.deepEqual(parseSchoolRegistryStatus({commandId:id,status:'not_found'},command),{commandId:id,status:'not_found'});
 for(const v of [{...saved,commandId:'55101400-0000-4000-8000-000000000002'},{...saved,code:'99999902'},{...saved,operation:'update'}, {...saved,extra:'hidden'}, {...saved,revision:3}])assert.throws(()=>parseSchoolRegistryStatus(v,command));
});
test('bounded source normalizes stable fingerprint, excludes fetch time and registry principal',async()=>{
 const first=await fetchSchoolRegistryUnit(command.code,async(url,opts)=>{assert.equal(url,'https://api.skolverket.se/skolenhetsregistret/v2/school-units/99999901');assert.equal(opts.redirect,'error');assert.ok(opts.signal instanceof AbortSignal);return Response.json(payload);},new Date('2026-10-14T01:00:00Z'));
 const nextPayload=structuredClone(payload);nextPayload.data.attributes.schoolTypes.reverse();nextPayload.data.attributes.schoolTypeProperties.GY.programmes.reverse();
 const second=await fetchSchoolRegistryUnit(command.code,async()=>Response.json(nextPayload),new Date('2026-10-15T01:00:00Z'));
 assert.equal(first.unit.registryFingerprint,second.unit.registryFingerprint);assert.notEqual(first.unit.fetchedAt,second.unit.fetchedAt);
 assert.deepEqual(first.unit.programmes.GR,[]);assert.deepEqual(first.unit.programmes.GY,['NA','SA']);
 assert.equal('headMaster' in first.unit,false);assert.equal('principalName' in first.unit,false);assert.deepEqual(first.payload,payload);
 const changed=structuredClone(payload);changed.data.attributes.displayName='Changed';assert.notEqual((await fetchSchoolRegistryUnit(command.code,async()=>Response.json(changed))).unit.registryFingerprint,first.unit.registryFingerprint);
 assert.equal(parseSchoolRegistryLookupResult({kind:'code',unit:first.unit,local:null},{kind:'code',value:command.code}).unit.code,command.code);
 assert.throws(()=>parseSchoolRegistryLookupResult({kind:'code',unit:first.unit,local:null},{kind:'code',value:'99999902'}));
});
test('upstream validates shape/number/date, 404 separately; bounds body including chunked stream',async()=>{
 assert.equal(await fetchSchoolRegistryUnit(command.code,async()=>new Response(null,{status:404})),null);
 const invalid=[];
 for(const mutate of [p=>p.data.schoolUnitCode='99999902',p=>delete p.included[0].organizationNumber,p=>p.included[0].organizationNumber='wrong',p=>p.data.attributes.schoolTypes=[{}],p=>p.data.attributes.schoolTypeProperties.GY.programmes=[{}],p=>p.meta.modified='not-date',p=>p.data.attributes.displayName='']){const p=structuredClone(payload);mutate(p);invalid.push(async()=>Response.json(p));}
 invalid.push(async()=>{throw new Error('timeout private');},async()=>new Response('x',{status:503}),async()=>Response.json({}),async()=>new Response('x',{headers:{'Content-Length':'1048577'}}),async()=>new Response('x'.repeat(1048577)));
 for(const transport of invalid)await assert.rejects(fetchSchoolRegistryUnit(command.code,transport),{message:'registry_unavailable'});
});
test('missing municipality name requires matching organizer response',async()=>{
 const p=structuredClone(payload);delete p.included[0].attributes.municipalities;
 let count=0;const found=await fetchSchoolRegistryUnit(command.code,async()=>Response.json(++count===1?p:{data:{organizationNumber:'9999999999',attributes:{municipalities:[{municipalityCode:'0000',displayName:'Resolved'}]}}}));assert.equal(found.unit.municipalityName,'Resolved');assert.equal(count,2);
 count=0;await assert.rejects(fetchSchoolRegistryUnit(command.code,async()=>Response.json(++count===1?p:{data:{organizationNumber:'8888888888',attributes:{}}})),{message:'registry_unavailable'});
});
test('organization list rejects partial, duplicated, malformed and oversized lists',async()=>{
 const list={data:{attributes:[{schoolUnitCode:command.code,name:'Syntetisk',status:'AKTIV'}]}};
 const r=await fetchSchoolRegistryOrganization('9999999999',async(url,opts)=>{assert.ok(url.endsWith('organization_number=9999999999'));assert.equal(opts.redirect,'error');return Response.json(list);});assert.equal(r.units.length,1);
 for(const p of [{data:{attributes:{}}},{...list,links:{next:'https://external.invalid'}},{data:{attributes:[list.data.attributes[0],list.data.attributes[0]]}},{data:{attributes:Array.from({length:5001},()=>list.data.attributes[0])}},{data:{attributes:[{schoolUnitCode:command.code,name:'Syntetisk'}]}}])await assert.rejects(fetchSchoolRegistryOrganization('9999999999',async()=>Response.json(p)),{message:'registry_unavailable'});
});
test('list validates local scope flags, source forms and duplicate schools',()=>{
 const school={id,code:command.code,name:'Syntetisk',status:'AKTIV',municipalityCode:'0000',municipalityName:null,locality:null,address:null,principalName:'Local principal',schoolTypes:['GY','GR'],sourceSchoolTypes:['GY'],revision:hash,sourceFetchedAt:'2026-10-14',canUpdate:false};
 const list={organizer:{id,name:'Syntetisk',organizationNumber:'9999999999'},units:[school]};assert.deepEqual(parseSchoolRegistryList(list),list);
 assert.throws(()=>parseSchoolRegistryList({...list,units:[school,school]}));assert.throws(()=>parseSchoolRegistryList({...list,units:[{...school,canUpdate:'true'}]}));
});
