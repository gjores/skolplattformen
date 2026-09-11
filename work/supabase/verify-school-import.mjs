import assert from 'node:assert/strict';
import {supabase,signInDemo} from '../../web/lib/supabase.ts';
import {createOrganisationState,addUnitFromRegistry,applyRegistryUnit} from '../../web/lib/organisation-model.ts';
import {saveUnitFromRegistry,loadOrganisation,savePrincipal,updateUnitFromRegistry} from '../../web/lib/organisation-store.ts';
await signInDemo('Kontroll av skolimport');
const db=supabase();
const checked=async q=>{const {data,error}=await q;if(error)throw new Error(error.message);return data;};
const tag=`Importkontroll ${Date.now()}`;
const code=String(90000000+Math.floor(Math.random()*9999999));
const source='https://api.skolverket.se/skolenhetsregistret/v2/school-units/'+code;
const registry={code,name:tag,status:'AKTIV',municipalityCode:'1480',municipalityName:'Göteborg',schoolTypes:['GR','GY'],programmes:{gy:['SA']},organizer:{name:'Testhuvudman',type:'ENSKILD'},headMaster:'Registrets uppgift',address:{street:'Testgatan 1',postalCode:'12345',locality:'Teststad',type:'BESOKSADRESS'}};
const local=addUnitFromRegistry(createOrganisationState(),'huvudman',registry,source).units.find(u=>u.code===code);
let id;
try {
  await assert.rejects(()=>saveUnitFromRegistry(local,registry,source,'00000000-0000-4000-8000-000000000999'),/rektor/);
  assert.equal((await checked(db.from('school_units').select('id').eq('code',code))).length,0);
  id=await saveUnitFromRegistry(local,registry,source,undefined,tag+' A');
  let state=await loadOrganisation();
  let unit=state.units.find(u=>u.id===id);
  assert.deepEqual(unit.address,registry.address);assert.deepEqual(unit.schoolTypes.map(t=>t.code).sort(),['GR','GY']);
  const appointed=state.assignments.find(a=>a.name===tag+' A');assert(appointed.unitIds.includes(id));
  await assert.rejects(()=>saveUnitFromRegistry(local,registry,source,undefined,tag+' B'),/redan/);
  const refreshed=applyRegistryUnit({...state,activeUnitId:id},'huvudman',{...registry,headMaster:'Annan registeruppgift',address:{...registry.address,street:'Testgatan 2'}},source);
  await updateUnitFromRegistry(id,refreshed.units.find(u=>u.id===id),registry,source);
  state=await loadOrganisation();assert(state.assignments.find(a=>a.id===appointed.id).unitIds.includes(id));
  assert.equal(state.units.find(u=>u.id===id).address.street,'Testgatan 2');
  await savePrincipal(id,undefined,tag+' B');
  state=await loadOrganisation();assert.equal(state.assignments.filter(a=>a.role==='rektor'&&a.unitIds.includes(id)).length,1);
  assert.equal(state.assignments.find(a=>a.role==='rektor'&&a.unitIds.includes(id)).name,tag+' B');
  await savePrincipal(id,appointed.id);
  assert((await loadOrganisation()).assignments.find(a=>a.id===appointed.id).unitIds.includes(id));
  console.log('PASS: atomic import/rollback, address and school types persist, HM appointment persists, refresh preserves appointment, replacement and existing principal selection work.');
} finally {
  if(id)await checked(db.from('school_units').delete().eq('id',id));
  await checked(db.from('assignments').delete().like('name',tag+'%'));
  console.log('Temporary school and assignments removed.');
}
