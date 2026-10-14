// Standalone human usability preview. This module is never imported by the app.
// Every fetch is handled in memory; there is no network/API/database fallback.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedSchoolWorkspace from '../../app/protected-school-workspace';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import { parseSchoolRegistryCommand, parseSchoolRegistryLookup, type LocalRegistrySchool, type RegistrySchool, type SchoolRegistryCommand, type SchoolRegistrySaved } from '../../lib/school-registry';
import '../../app/globals.css';

const id = (n: number) => `77101420-0000-4000-8000-${String(n).padStart(12, '0')}`;
const initial: LocalRegistrySchool = {
  id: id(4), code: '11111111', name: 'Provskolan Björken', status: 'AKTIV', municipalityCode: '0180', municipalityName: 'Provkommunen',
  locality: 'Provorten', address: {street:'Gamla skolvägen 1',postalCode:'12345',locality:'Provorten'},
  principalName: 'Alex – lokalt tillsatt rektor', schoolTypes: ['GY','GR'], sourceSchoolTypes: ['GY','GR'],
  revision: 'a'.repeat(64), sourceFetchedAt: '2026-10-01', canUpdate: true,
};
const organizer = {id:id(3),name:'Avskild provhuvudman',organizationNumber:'9999999999'};
const registry = (code: string): RegistrySchool => ({
  code, name: code === initial.code ? 'Björkens gymnasium' : 'Provskolan Eken', status:'AKTIV', municipalityCode:'0180',municipalityName:'Provkommunen',
  locality:'Provorten',address:{street:code===initial.code?'Nya skolvägen 2':'Ekvägen 3',postalCode:'12345',locality:'Provorten'},
  organizationNumber:organizer.organizationNumber,schoolTypes:['GY'],programmes:{GY:['SA']},modified:'2026-10-14',registryFingerprint:'b'.repeat(64),fetchedAt:new Date().toISOString(),
});
let units = [structuredClone(initial)];
let revision = 0;
const receipts = new Map<string, {request:SchoolRegistryCommand;result:SchoolRegistrySaved}>();
const respond = (body:unknown,status=200) => Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const deny = (code:string,status:number) => respond({code},status);
function reset() { units = [structuredClone(initial)]; receipts.clear(); revision = 0; }

window.fetch = async (input:RequestInfo | URL, options?:RequestInit):Promise<Response> => {
  const url = new URL(input instanceof Request ? input.url : String(input), location.origin);
  const method = (options?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  if (url.origin !== location.origin || !url.pathname.startsWith('/api/skolor')) throw new TypeError('Avskilt prov: nätanrop är avstängda.');
  if (options?.signal?.aborted) throw new DOMException('Avbrutet','AbortError');
  try {
    if (url.pathname === '/api/skolor' && method === 'GET') return respond({organizer,units});
    if (method !== 'POST' || typeof options?.body !== 'string') return deny('bad_request',400);
    const body:unknown = JSON.parse(options.body);
    if (url.pathname === '/api/skolor/register') {
      const request = parseSchoolRegistryLookup(body);
      if (request.kind === 'organizationNumber') {
        if (request.value !== organizer.organizationNumber) return deny('forbidden',403);
        return respond({kind:'organizationNumber',organizationNumber:organizer.organizationNumber,units:['11111111','22222222'].map(code=>({code,name:registry(code).name,status:'AKTIV'}))});
      }
      if (!['11111111','22222222'].includes(request.value)) return deny('not_found',404);
      return respond({kind:'code',unit:registry(request.value),local:units.find(unit=>unit.code===request.value)??null});
    }
    if (!['/api/skolor/register/spara','/api/skolor/register/status'].includes(url.pathname)) return deny('not_found',404);
    const request = parseSchoolRegistryCommand(body), existing = receipts.get(request.commandId);
    if (existing) {
      if (JSON.stringify(request)!==JSON.stringify(existing.request)) return deny('conflict',409);
      return respond({...existing.result,replayed:true});
    }
    if (url.pathname.endsWith('/status')) return respond({commandId:request.commandId,status:'not_found'});
    if (!['11111111','22222222'].includes(request.code)) return deny('not_found',404);
    const current = units.find(unit=>unit.code===request.code), source = registry(request.code);
    if (request.registryFingerprint!==source.registryFingerprint) return deny('conflict',409);
    if (request.operation==='update' && !current?.canUpdate) return deny('forbidden',403);
    if (request.operation==='import' && current || request.operation==='update' && request.expectedRevision!==current?.revision) return deny('conflict',409);
    const saved:LocalRegistrySchool = {
      id:current?.id??id(5),code:source.code,name:source.name,status:source.status,municipalityCode:source.municipalityCode,
      municipalityName:source.municipalityName,locality:source.locality,address:source.address,principalName:current?.principalName??null,
      schoolTypes:[...new Set([...(current?.schoolTypes??[]),...source.schoolTypes])],sourceSchoolTypes:source.schoolTypes,
      revision:(++revision).toString(16).padStart(64,'0'),sourceFetchedAt:source.fetchedAt,canUpdate:current?.canUpdate??false,
    };
    units = current ? units.map(unit=>unit.id===saved.id?saved:unit) : [...units,saved];
    const result:SchoolRegistrySaved = {commandId:request.commandId,status:'saved',unitId:saved.id,code:saved.code,operation:request.operation,revision:saved.revision,replayed:false};
    receipts.set(request.commandId,{request,result});return respond(result);
  } catch { return deny('bad_request',400); }
};

function Preview() {
  const [epoch,setEpoch] = useState(1);
  return <main className="workspace" style={{padding:'1rem'}}>
    <aside style={{maxWidth:1100,margin:'0 auto 24px',padding:20,border:'2px solid #315d90',borderRadius:12,background:'#edf4fb',color:'#203d60'}}>
      <h1 style={{fontSize:22,fontWeight:700}}>Avskilt användarprov</h1>
      <p style={{marginBlock:10}}>Simulerade registeruppgifter; inga vanliga skolor ändras. Sparandet finns bara i denna flik och försvinner när du laddar om sidan.</p>
      <ol style={{listStyle:'decimal',paddingLeft:24,lineHeight:1.7}}><li>Sök med organisationsnummer <strong>9999999999</strong> och granska <strong>Provskolan Eken</strong> (kod 22222222). Lägg till skolan.</li><li>Hämta registeruppgifter för <strong>Provskolan Björken</strong> (kod 11111111). Granska nytt namn och ny adress; rektorn och den lokala grundskolan ska behållas.</li><li>Uppdatera registeruppgifterna och kontrollera resultatet under Dina skolenheter.</li></ol>
      <button type="button" style={{marginTop:14,minHeight:44,padding:'8px 14px',border:'1px solid #315d90',borderRadius:6,background:'white'}} onClick={()=>{reset();setEpoch(value=>value+1);}}>Börja om användarprovet</button>
    </aside>
    <UnsavedChangesProvider key={epoch}><ProtectedSchoolWorkspace context={{assignmentId:id(10),membershipId:id(2),customerId:id(1),customerName:'Avskild provkund',organizerId:id(3),organizerName:organizer.name,unitId:null,unitName:null,function:'huvudman',label:'Huvudman',blocked:false,valid:true}} epoch={epoch} onMfaRequired={()=>{}} onSessionLost={()=>{}}/></UnsavedChangesProvider>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
