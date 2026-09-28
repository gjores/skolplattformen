#!/usr/bin/env node
// Fasta syntetiska scenarier, ingen verklig integration (inte INT-07).
// node work/pilot/phase4-simulated-source.mjs --target protected
// Varje körning skapar egen slump-ID-fixtur. Två riktiga anslutningar bevisar
// dubbel leverans och leverans mot gammalt beslut; audit lämnas utan elevvärden.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { assertTarget } from './verify-target.mjs';
if (process.argv.length !== 4 || process.argv[2] !== '--target' || process.argv[3] !== 'protected') {
 console.error('REFUSED'); process.exit(1);
}
const require = createRequire(new URL('../../web/package.json',import.meta.url));
const postgres = require('postgres');
let db,a,b,ready=false,passed=false,caseId='target',failureCode;
const prefix=randomUUID().slice(0,8);
const id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
const cases=[];
try {
 const target=await assertTarget('protected');
 db=postgres(target.dbUrl,{max:3,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const src=fs.readFileSync(new URL('../../supabase/tests/phase4_conflicts.test.sql',import.meta.url),'utf8');
 const fixture=src.slice(src.indexOf('-- Mutation fixture:'),src.indexOf("select has_function('public','phase4_change_pupil'"))
  .replaceAll('44005000',prefix).replaceAll('mutation.example.test',`${prefix}.source.example.test`)
  .replaceAll("'440050'||n",`'${String(parseInt(prefix.slice(0,5),16)).padStart(7,'0').slice(0,6)}'||n`);
 caseId='fixture';await assertTarget('protected');
 let assignment,year;
 await db.begin(async tx=>{await tx.unsafe(fixture);[{id:assignment}]=await tx`select id from mutation_roles where name='admin'`;});ready=true;
 [{year}]=await db`select (extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end) as year`;
 caseId='closed-roles';
 const denied=await db`select r,has_function_privilege(r,'public.phase4_simulated_source_deliver(jsonb)','execute') as allowed from unnest(array['anon','authenticated','skolplattform_worker'])r`;
 if(denied.some(x=>x.allowed))throw Error();cases.push({caseId,status:'PASS'});
 a=await db.reserve();b=await db.reserve();
 const [{pid:ap}]=await a`select pg_backend_pid() as pid`;const [{pid:bp}]=await b`select pg_backend_pid() as pid`;
 const deliver=async(sql,value)=>{await assertTarget('protected');return (await sql`select public.phase4_simulated_source_deliver(${sql.json({pupilId:id(70),field:'displayName',value})}) as result`)[0].result;};
 const wait=async()=>{for(let n=0;n<150;n++){const [{waiting}]=await db`select ${ap}::integer=any(pg_blocking_pids(${bp})) as waiting`;if(waiting)return;await new Promise(r=>setTimeout(r,20));}throw Error();};
 for(const name of ['concurrent-repeat','stale-decision']){
  caseId=name;await assertTarget('protected');await a`begin`;await b`begin`;await a`set local statement_timeout='15s'`;await b`set local statement_timeout='15s'`;
  const [{version}]=await db`select version from public.pupils where id=${id(70)}`;
  let conflictId;
  if(name==='stale-decision')[{id:conflictId}]=await db`select id from public.pupil_source_values where pupil_id=${id(70)} and resolved_at is null`;
  await deliver(a,name==='concurrent-repeat'?'Syntetisk källa ett':'Syntetisk källa två');
  let pending;
  if(name==='concurrent-repeat')pending=deliver(b,'Syntetisk källa ett');
  else{
   await b`select set_config('app.customer_id',${id(1)},true),set_config('app.assignment_id',${assignment},true),set_config('app.membership_id',${id(22)},true),set_config('app.identity_id',${id(12)},true)`;
   await assertTarget('protected');
   pending=b`select public.phase4_resolve_source(${b.json({pupilId:id(70),schoolYear:year,caseId:null,expectedVersion:version,kind:'resolve-source',payload:{conflictId,choice:'source'}})}) as result`.then(rows=>rows[0].result);
  }
  // Observe actual server blocking before releasing writer A.
  pending=Promise.resolve(pending).then(result=>({result}),()=>({failed:true}));
  await wait();await a`commit`;const outcome=await pending;
  if(outcome.failed||(name==='concurrent-repeat'?outcome.result.status!=='unchanged':outcome.result.kind!=='conflict'))throw Error();
  await b`commit`;
  const [row]=await db`select display_name,version,(select count(*)::integer from public.pupil_source_values where pupil_id=${id(70)} and resolved_at is null) as pending from public.pupils where id=${id(70)}`;
  if(row.display_name!=='Syntetisk elev'||row.version!==version+1||row.pending!==1)throw Error();
  cases.push({caseId,status:'PASS',waitingObserved:true});
 }
 passed=true;
}catch(error){failureCode=String(error?.message??'').startsWith('BLOCKED:')?'ENVIRONMENT_BLOCKED':/^[A-Z0-9_]{1,40}$/.test(error?.code??'')?error.code:'FAILED';process.exitCode=['CONNECT_TIMEOUT','ECONNREFUSED','ENVIRONMENT_BLOCKED','TUNNEL_UNAVAILABLE'].includes(failureCode)?3:1;}
finally{
 for(const c of [a,b])if(c){await c`rollback`.catch(()=>{});c.release();}
 if(ready){
  try{await assertTarget('protected');await db.begin(async tx=>{
   const [{owned}]=await tx`select exists(select 1 from public.customers where id=${id(1)} and name='Syntetiskt ändringsprov') as owned`;
   if(!owned||!/^[0-9a-f]{8}$/.test(prefix))throw Error();
   await tx`set local session_replication_role=replica`;
   for(const table of ['pupil_source_values','pupil_field_history','pupil_field_state','pupil_home_municipalities','pupil_class_memberships','pupil_placements','pupils','protected_identity_permissions','mandate_units','access_assignments','school_classes'])await tx.unsafe(`delete from public.${table} where customer_id=$1`,[id(1)]);
   await tx`delete from public.assignment_units where assignment_id in(select id from public.assignments where organizer_id=${id(2)})`;
   await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
   await tx`delete from public.assignments where organizer_id=${id(2)}`;
   await tx`delete from public.offerings where organizer_id=${id(2)}`;
   await tx`delete from public.school_units where organizer_id=${id(2)}`;
   await tx`delete from public.memberships where customer_id=${id(1)}`;
   await tx`delete from public.organizers where id=${id(2)}`;
   await tx`delete from public.identities where id in(${id(10)},${id(11)},${id(12)},${id(13)})`;
   await tx`delete from public.customers where id=${id(1)}`;
  });}catch{passed=false;caseId='cleanup';process.exitCode=1;}
 }
 if(db)await db.end();
 const result={status:passed?'PASS':process.exitCode===3?'BLOCKED':'FAIL',caseId:passed?'complete':caseId,cases,...(failureCode?{failureCode}:{})};
 fs.mkdirSync(new URL('./results/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('./results/phase4-simulated-source.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,caseId:result.caseId,cases:cases.map(({caseId,status})=>({caseId,status}))}));
}
