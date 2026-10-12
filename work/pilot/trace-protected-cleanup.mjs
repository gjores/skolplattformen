#!/usr/bin/env node
// Read-only provenance follow-up. Does not generate or execute deletion SQL.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
async function main() {
const root=fileURLToPath(new URL('../../',import.meta.url));
const args=process.argv.slice(2);
assert.equal(args.length,4); assert.equal(args[0],'--inventory'); assert.equal(args[2],'--out');
for(const p of [args[1],args[3]]) assert.ok(/^\/private\/tmp\/[^/]+\.json$/u.test(path.resolve(p)));
const inventory=JSON.parse(fs.readFileSync(args[1],'utf8'));
assert.equal(inventory.kind,'protected-cleanup-read-only-inventory');
const ids=inventory.customers.map(c=>c.customer_id),sha=s=>createHash('sha256').update(s).digest('hex');
const reports=[];
for(const file of fs.readdirSync(path.join(root,'work/pilot/results')).filter(f=>f.endsWith('.json'))){
 const source=fs.readFileSync(path.join(root,'work/pilot/results',file),'utf8');
 if(!ids.some(id=>source.includes(id)))continue;
 let data;try{data=JSON.parse(source);}catch{continue;}
 const matches=[];
 function visit(v,p=[]){
  if(typeof v==='string'&&ids.includes(v))matches.push({customerId:v,path:p.join('.')});
  else if(Array.isArray(v))v.forEach((x,i)=>visit(x,[...p,i]));
  else if(v&&typeof v==='object')for(const[k,x]of Object.entries(v))visit(x,[...p,k]);
 }
 visit(data);
 if(matches.length)reports.push({file,sha256:sha(source),status:data.status??null,complete:data.complete??null,
  databaseClosed:data.databaseClosed??null,transactionCommitted:data.transactionCommitted??null,matches});
}
const target=await assertTarget('protected');
const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{},connection:{application_name:'protected_cleanup_read_only_provenance',default_transaction_read_only:'on'}});
let report;
try{report=await db.begin('isolation level repeatable read read only',async tx=>{
 await tx`set local statement_timeout='10s'`;await tx`set local lock_timeout='3s'`;await tx`set local idle_in_transaction_session_timeout='30s'`;
 const customers=await tx`select c.id customer_id,
  case when c.name ~* '(syntet|test|prov)' then c.name else null end synthetic_marker,
  md5(to_jsonb(c)::text) row_hash,
  (select count(*)::int from public.security_events e where e.customer_id=c.id) retained_audit_rows,
  (select count(*)::int from public.memberships m where m.customer_id=c.id) memberships,
  (select count(*)::int from public.access_assignments a where a.customer_id=c.id) mandates
  from public.customers c where c.id=any(${ids}::uuid[]) order by c.id`;
 for(const c of customers){
  c.planStates=await tx`select p.status::text status,count(*)::int count
    from public.point_plans p join public.organizers o on o.id=p.organizer_id
    where o.customer_id=${c.customer_id} group by p.status order by 1`;
  c.sourceMarkerFiles=[];
  // Track only fixture/verification source files, never private manifests or logs.
  const scan=(dir)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){
   if(e.isDirectory())continue;
   if(!/\.(mjs|sql)$/u.test(e.name)||['inventory-protected-cleanup.mjs','trace-protected-cleanup.mjs'].includes(e.name))continue;
   const file=path.join(dir,e.name),text=fs.readFileSync(file,'utf8');
   if((c.synthetic_marker&&text.includes(c.synthetic_marker))||text.includes(c.customer_id))c.sourceMarkerFiles.push(path.relative(root,file));
  }};
  for(const p of ['work/pilot','work/pilot/sql','supabase/tests'])scan(path.join(root,p));
  c.completedRecoveryMatches=reports.filter(r=>r.status==='PASS'&&r.transactionCommitted===true&&r.matches.some(m=>m.customerId===c.customer_id));
 }
 const oldFixture=inventory.customers.filter(c=>c.classification==='fixture-signature-match-review-activity'&&c.offerings===6&&c.programplans===4);
 assert.equal(oldFixture.length,1,'Expected one previously inventoried review graph.');
 const customerId=oldFixture[0].customer_id;
 const columns=await tx`select table_name,array_agg(column_name::text) columns from information_schema.columns
   where table_schema='public' group by table_name order by table_name`;
 const graph=[];
 for(const table of columns){
  const cs=table.columns,clauses=[];
  // No SQL identifiers originate from user arguments. All are quoted catalogue names.
  const q=s=>'"'+s.replaceAll('"','""')+'"';
  if(table.table_name==='customers')clauses.push('t.id=$1::uuid');
  if(cs.includes('customer_id'))clauses.push('t.customer_id=$1::uuid');
  if(cs.includes('organizer_id'))clauses.push('t.organizer_id in(select id from public.organizers where customer_id=$1::uuid)');
  for(const key of ['plan_id','point_plan_id','programplan_id','source_programplan_id'])if(cs.includes(key))
   clauses.push('t.'+q(key)+' in(select p.id from public.point_plans p join public.organizers o on o.id=p.organizer_id where o.customer_id=$1::uuid)');
  if(cs.includes('offering_id'))clauses.push('t.offering_id in(select f.id from public.offerings f join public.organizers o on o.id=f.organizer_id where o.customer_id=$1::uuid)');
  if(cs.includes('unit_id'))clauses.push('t.unit_id in(select u.id from public.school_units u join public.organizers o on o.id=u.organizer_id where o.customer_id=$1::uuid)');
  if(cs.includes('membership_id'))clauses.push('t.membership_id in(select id from public.memberships where customer_id=$1::uuid)');
  if(cs.includes('assignment_id'))clauses.push('t.assignment_id in(select id from public.access_assignments where customer_id=$1::uuid union select a.id from public.assignments a join public.organizers o on o.id=a.organizer_id where o.customer_id=$1::uuid)');
  if(cs.includes('school_year_id'))clauses.push('t.school_year_id in(select y.id from public.school_years y join public.organizers o on o.id=y.organizer_id where o.customer_id=$1::uuid)');
  if(cs.includes('timplan_id'))clauses.push('t.timplan_id in(select p.id from public.timplans p join public.organizers o on o.id=p.organizer_id where o.customer_id=$1::uuid)');
  if(!clauses.length||table.table_name==='security_events')continue;
  const [digest]=await tx.unsafe(`select count(*)::int count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'sha256'),'hex') sha256 from public.${q(table.table_name)} t where ${clauses.join(' or ')}`,[customerId]);
  graph.push({table:table.table_name,...digest});
 }
 const exampleOfferings=await tx`select o.id offering_id,o.organizer_id,
  case when o.name ~* '(syntet|test|prov)' then o.name else null end synthetic_marker,
  o.kind::text kind,o.program_code,
  (select count(*)::int from public.point_plans p where p.offering_id=o.id) programplans,
  (select count(*)::int from public.timplans t where t.offering_id=o.id) timplans,
  (select count(*)::int from public.school_classes c where c.offering_id=o.id) classes,
  (select count(*)::int from public.pupil_placements p where p.offering_id=o.id) placements
  from public.offerings o join public.organizers org on org.id=o.organizer_id
  where org.customer_id in ('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000002') order by o.id`;
 // Only activity states/ages, never query text, client credentials or addresses.
 const activity=await tx`select pid,application_name,state,backend_start,xact_start,
  exists(select 1 from pg_locks l where l.pid=a.pid and l.locktype='advisory' and l.granted) has_advisory_lock
  from pg_stat_activity a where a.datname=current_database() and a.backend_type='client backend' and a.pid<>pg_backend_pid()`;
 return{kind:'protected-cleanup-provenance',capturedAt:new Date().toISOString(),target:'protected',readOnly:true,writes:0,
  inputSha256:sha(fs.readFileSync(args[1])),customers,reports,exampleOfferings,activity,reviewGraph:{customerId,scope:"direct customer/organizer and plan/offering logical dependencies; not a complete restore export",rows:graph},
  authorizedDeletions:0,caveat:'Completed recovery reports intentionally retain audit-related customer/mandate graphs. Absence of plans does not make these disposable. No backup of secrets or identity records is taken.'};
});}finally{await db.end({timeout:5});}
fs.writeFileSync(args[3],JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});
console.log(JSON.stringify({status:'PASS',readOnly:true,writes:0,customers:report.customers.length,
 sourceMatchedCustomers:report.customers.filter(c=>c.sourceMarkerFiles.length).length,
 customersInCompletedRecovery:report.customers.filter(c=>c.completedRecoveryMatches.length).length,
 exampleOfferings:report.exampleOfferings.length,exampleOfferingsWithPlansOrClasses:report.exampleOfferings.filter(o=>o.programplans||o.timplans||o.classes||o.placements).length,
 otherOpenTransactions:report.activity.filter(a=>a.xact_start).length,advisoryLockHolders:report.activity.filter(a=>a.has_advisory_lock).length}));

}
await main().catch(() => {
  console.error('FAIL: local read-only cleanup inventory did not complete; database details were not logged.');
  process.exitCode = 1;
});
