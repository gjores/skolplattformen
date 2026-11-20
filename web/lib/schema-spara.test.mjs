import test from 'node:test';
import assert from 'node:assert/strict';
import { SchemaSparko, schemaSparinnehall } from './schema-spara.ts';
import { schemaDraftHash } from './schema-draft-contract.ts';
import { defaultSchemaVillkor } from './schema-contract.ts';
const id = n => `53111600-0000-4000-8000-${String(n).padStart(12,'0')}`;
const scope = { contractVersion:1, unitId:id(1), schoolYear:2027, period:'lasar' };
const snapshot = extra => ({ name:'Schemautkast',basisVillkor:null,workingVillkor:defaultSchemaVillkor(),grundFingerprint:null,placements:[],locks:[],intentional:[],datedOverrides:[],activityTypes:[],...extra });
const deferred = () => { let resolve; const promise = new Promise(r => { resolve=r; }); return {promise,resolve}; };
function fixture() {
  const server = { draft:null, receipts:new Map(), calls:[], statuses:[], reads:0 };
  const transport = {
    read: async () => { server.reads++; return {...scope,draft:structuredClone(server.draft)}; },
    status: async (input) => { server.statuses.push(input); const receipt=server.receipts.get(input.commandId)??null; return {...scope,state:receipt?'completed':'not_found',found:!!receipt,receipt}; },
    save: async (input) => {
      server.calls.push(structuredClone(input));
      if (server.draft && input.expectedRevision!==server.draft.revision) throw {reason:'schema_draft_conflict',status:409};
      const sourceHash=`sha256:${'a'.repeat(64)}`,savedAt='2026-11-16T10:00:00.000Z';
      const document={documentVersion:1,base:null,basisVillkor:null,workingVillkor:input.workingVillkor,placements:[],locks:[],intentional:[],datedOverrides:[],activityTypes:input.activityTypes,control:null,requiresRecalculation:true,
        source:{planId:null,planRevision:0,calendarVersionId:null,calendarVersion:null,lessonSources:[],digest:sourceHash}};
      const draft={...document,id:id(3),name:input.name,revision:input.expectedRevision+1,savedAt,contentHash:await schemaDraftHash(document),sourceHash,stale:false};
      const receipt={commandId:input.commandId,draftId:draft.id,revision:draft.revision,savedAt,requestHash:await schemaDraftHash(input),contentHash:draft.contentHash,replayed:false};
      server.draft=draft;server.receipts.set(input.commandId,receipt);return {...scope,draft,receipt};
    }
  };
  let seq=10; const states=[]; const draftIds=[];
  const queue=new SchemaSparko(scope,transport,(s,_ack,draftId)=>{states.push(structuredClone(s));draftIds.push(draftId);},()=>id(seq++));
  return {server,transport,queue,states,draftIds};
}
test('schema sparar endast efter läsning och visar Sparad först efter kontrollerad kvittens',async()=>{
  const {queue,server,states,draftIds}=fixture(); queue.update(snapshot()); assert.equal(await queue.flush(),false);assert.equal(server.calls.length,0);
  assert.equal(await queue.load(),null);assert.equal(draftIds.at(-1),null);
  queue.update(snapshot());assert.equal(queue.state.dirty,true);assert.equal(await queue.flush(),true);
  assert.equal(queue.state.phase,'saved');assert.equal(queue.state.revision,1);assert.equal(queue.state.dirty,false);assert.ok(states.some(s=>s.phase==='saving'));
  assert.equal(draftIds.at(-1),server.draft.id);assert.ok(draftIds.every((draftId,i)=>states[i].phase!=='saving'||draftId===null));
});
test('schema serialiserar nya ändringar under pågående skrivning och använder kvitterad revision',async()=>{
  const {queue,server,transport}=fixture(), gate=deferred(),begun=deferred(),save=transport.save;
  transport.save=async input=>{if(!server.calls.length){begun.resolve();await gate.promise;}return save(input);};
  await queue.load();queue.update(snapshot());const flushing=queue.flush();await begun.promise;
  queue.update(snapshot({name:'Nyare lokalt'}));const second=queue.flush();gate.resolve();await Promise.all([flushing,second]);
  assert.equal(server.calls.length,2);assert.equal(server.calls[1].expectedRevision,1);assert.notEqual(server.calls[0].commandId,server.calls[1].commandId);
  assert.equal(server.draft.name,'Nyare lokalt');assert.equal(queue.state.revision,2);assert.equal(queue.state.dirty,false);
});
test('ett tappat svar efter commit återfinns via samma kommando utan dubbel skrivning',async()=>{
  const {queue,server,transport}=fixture(),save=transport.save;
  transport.save=async input=>{await save(input);throw new TypeError('transport');};
  await queue.load();queue.update(snapshot());assert.equal(await queue.flush(),true);
  assert.equal(server.calls.length,1);assert.equal(server.statuses[0].commandId,server.calls[0].commandId);assert.equal(queue.state.phase,'saved');assert.equal(queue.state.revision,1);
});
test('tappat svar före commit lämnar osäkert läge och återförsöker exakt samma kommando',async()=>{
  const {queue,server,transport}=fixture(),save=transport.save;let failed=true,first;
  transport.save=async input=>{if(failed){failed=false;first=structuredClone(input);throw new TypeError('transport');}return save(input);};
  await queue.load();queue.update(snapshot());assert.equal(await queue.flush(),false);assert.equal(queue.state.phase,'unknown');assert.equal(queue.state.dirty,true);
  assert.equal(await queue.flush(),true);assert.deepEqual(server.calls[0],first);assert.equal(server.draft.revision,1);
});
test('CAS-konflikt behåller lokalt arbete och tillåter inte blind överskrivning',async()=>{
  const {queue,transport,server}=fixture();await queue.load();queue.update(snapshot());await queue.flush();
  const local=snapshot({name:'Lokal version'});queue.update(local);server.draft.revision=2;
  assert.equal(await queue.flush(),false);assert.equal(queue.state.phase,'conflict');assert.equal(queue.state.dirty,true);
  const calls=server.calls.length;queue.update(snapshot({name:'Fortsatt lokalt'}));assert.equal(await queue.flush(),false);assert.equal(server.calls.length,calls);
  assert.equal(server.draft.name,'Schemautkast');assert.ok(transport);
});
test('annan revision under kvittenssökning ger konflikt i stället för falskt Sparad',async()=>{
  const {queue,transport}=fixture(),save=transport.save;transport.save=async input=>{const reply=await save(input);reply.draft.revision++;throw new TypeError('lost');};
  await queue.load();queue.update(snapshot());assert.equal(await queue.flush(),false);assert.equal(queue.state.phase,'conflict');assert.equal(queue.state.dirty,true);
});
test('förfalskad requesthash kan aldrig kvittera schemat som sparat',async()=>{
  const {queue,transport}=fixture(),save=transport.save;transport.save=async input=>{const reply=await save(input);reply.receipt.requestHash=`sha256:${'b'.repeat(64)}`;return reply;};
  await queue.load();queue.update(snapshot());assert.equal(await queue.flush(),false);assert.equal(queue.state.phase,'unknown');assert.equal(queue.state.dirty,true);
});
test('ett gammalt serverutkast läses bevarat men skrivning kräver en ny kontrollerad grund',async()=>{
  const {queue,transport,server}=fixture();await queue.load();queue.update(snapshot());await queue.flush();server.draft.stale=true;
  const other=new SchemaSparko(scope,transport,()=>{},()=>id(50));const draft=await other.load();assert.equal(draft.stale,true);
  other.update({...schemaSparinnehall(draft),name:'Nytt'});assert.equal(await other.flush(),false);assert.equal(other.state.phase,'stale');
  other.acceptNewBasis();assert.equal(await other.flush(),true);assert.equal(server.draft.name,'Nytt');
});
test('efter kontextavslut påverkar ett sent svar inte ny vy eller spardisplay',async()=>{
  const {queue,transport,states}=fixture(),save=transport.save,gate=deferred(),begun=deferred();transport.save=async input=>{begun.resolve();await gate.promise;return save(input);};
  await queue.load();queue.update(snapshot());const result=queue.flush();await begun.promise;queue.dispose();const count=states.length;gate.resolve();assert.equal(await result,false);assert.equal(states.length,count);
});
test('utkast utan namn visar konkret fel och kan sparas när namnet rättas',async()=>{
  const {queue,server}=fixture();await queue.load();queue.update(snapshot({name:''}));assert.equal(await queue.flush(),false);assert.match(queue.state.message,/namn/);assert.equal(server.calls.length,0);
  queue.update(snapshot({name:'Läsåret'}));assert.equal(queue.state.phase,'idle');assert.equal(await queue.flush(),true);
});
test('fel vid första läsning tillåter inte att ett befintligt utkast ersätts med ett tomt',async()=>{
  const {queue,transport,server}=fixture();transport.read=async()=>{throw new Error('nätfel');};await assert.rejects(queue.load());queue.update(snapshot());assert.equal(await queue.flush(),false);assert.equal(server.calls.length,0);
});
test('tom lektionsfördelning normaliseras och orsakar inte extra revisioner',async()=>{
  const {queue,server}=fixture();await queue.load();const value=snapshot({workingVillkor:{...defaultSchemaVillkor(),fordelning:[]}});queue.update(value);assert.equal(await queue.flush(),true);assert.equal(server.calls.length,1);
  queue.update(snapshot());assert.equal(await queue.flush(),true);assert.equal(server.calls.length,1);assert.equal(queue.state.dirty,false);
});
