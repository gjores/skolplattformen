#!/usr/bin/env node
// Exact local read grants only. The closed-foundation apply gate remains unchanged.
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {PLANNING_FOUNDATION,PLANNING_ENTRIES,PLANNING_BASE_ENTRIES,planningFingerprint,planningBusinessHashes,sha,equal} from './apply-planning-year-migration.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {validatePreflight} from './verify-planning-year-api.mjs';
export const PLANNING_GRANTS='20261006121000_phase5_worker_planning_year_reads.sql';
const root=fileURLToPath(new URL('../../',import.meta.url));
const closedSourceHash='e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71';
export function parsePlanningGrantArgs(argv){
 const o={migration:null,evidence:null,out:null},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--migration','--evidence','--out'].includes(flag)||seen.has(flag)||!argv[i+1])throw Error('REFUSED: exact arguments required');
  seen.add(flag);o[flag.slice(2)]=argv[++i];
 }
 if(o.migration!==PLANNING_GRANTS||!o.evidence||!o.out
  ||![resolve(root,'work/pilot/results'),'/private/tmp','/tmp'].includes(dirname(resolve(o.out))))throw Error('REFUSED: exact grant migration, proof and safe output required');
 return o;
}
export function assertPlanningGrantSql(sql){
 const expected=`grant execute on function ${PLANNING_ENTRIES.join(',')} to skolplattform_worker;`;
 const normalize=s=>s.replace(/--[^\n]*/gu,'').replace(/\s+/gu,' ').replace(/\s*,\s*/gu,',').trim();
 if(normalize(sql)!==normalize(expected))throw Error('REFUSED: only the three exact read grants permitted');
}
async function catalog(db){
 const functions=await db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' signature,
 p.proacl::text acl,pg_get_functiondef(p.oid) definition from pg_proc p where p.pronamespace='public'::regnamespace order by signature`;
 const tables=await db`select c.oid::regclass::text relation,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity
 from pg_class c where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') order by relation`;
 const journal=await db`select version,name,statements from supabase_migrations.schema_migrations order by version`;
 return {functions,tables,journal};
}
export function checkPlanningGrantDiff(before,after){
 if(!equal(before.tables,after.tables)||!equal(before.journal,after.journal)||before.functions.length!==after.functions.length)throw Error('REFUSED: table or journal or function count changed');
 const changed=[];
 for(let i=0;i<before.functions.length;i++){
  const b=before.functions[i],a=after.functions[i];
  if(b.signature!==a.signature||b.definition!==a.definition)throw Error('REFUSED: function definition changed');
  if(b.acl!==a.acl){
   if(!PLANNING_ENTRIES.includes(b.signature)||b.acl!=='{postgres=X/postgres}'||a.acl!=='{postgres=X/postgres,skolplattform_worker=X/postgres}')throw Error('REFUSED: unexpected raw ACL change');
   changed.push(b.signature);
  }
 }
 if(!exactFunctions(changed,PLANNING_ENTRIES))throw Error('REFUSED: exact three raw ACL additions required');
 return changed;
}
async function main(){
 const o=parsePlanningGrantArgs(process.argv.slice(2)),source=readFileSync(join(root,'supabase/migrations',o.migration),'utf8');assertPlanningGrantSql(source);
 const e=JSON.parse(readFileSync(resolve(o.evidence),'utf8'));validatePreflight(e,p=>readFileSync(join(root,p)));
 const foundation=readFileSync(join(root,'supabase/migrations',PLANNING_FOUNDATION),'utf8');
 if(sha(foundation)!==closedSourceHash)throw Error('REFUSED: closed foundation changed');
 const inventory=JSON.parse(readFileSync(join(root,'.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-37-FUNCTION-EVIDENCE.json'),'utf8'));
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let result;
 try{await db.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(5520)`;
  const journal=await tx`select version,statements from supabase_migrations.schema_migrations where version>='20261006120000' order by version`;
  if(journal.length!==1||journal[0].version!=='20261006120000'||!equal(journal[0].statements,[foundation]))throw Error('REFUSED: exact foundation journal and unoccupied grant time required');
  if(e.baselineFingerprint!==await planningFingerprint(tx)||!equal(e.originalHashes,await planningBusinessHashes(tx)))throw Error('REFUSED: baseline changed after actual preflight');
  const before=await catalog(tx),acl=await gymAcl(tx);
  if(!exactFunctions(acl.filter(r=>r.granted).map(r=>r.f),PLANNING_BASE_ENTRIES))throw Error('REFUSED: original 25 Worker entrypoints changed');
  const actual=before.functions.filter(r=>r.signature.startsWith('public.phase5_planning_year_'));
  if(actual.length!==14||inventory.sourceHash!==closedSourceHash||!exactFunctions(actual.map(r=>r.signature),inventory.functions.map(r=>r.signature))
   ||actual.some(r=>r.acl!=='{postgres=X/postgres}'||sha(r.definition)!==inventory.functions.find(f=>f.signature===r.signature)?.definitionHash))throw Error('REFUSED: exact closed signatures, definitions and raw ACL required');
  await tx.unsafe(source);
  const after=await catalog(tx),changed=checkPlanningGrantDiff(before,after),afterAcl=await gymAcl(tx);
  if(!exactFunctions(afterAcl.filter(r=>r.granted).map(r=>r.f),[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES])
   ||!equal(e.originalHashes,await planningBusinessHashes(tx)))throw Error('REFUSED: Worker entries or business rows changed unexpectedly');
  await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261006121000','phase5_worker_planning_year_reads',${[source]})`;
  result={kind:'phase5-planning-year-grants',status:'PASS',target:'protected',scope:'local-synthetic-only',reset:false,sourceHash:sha(source),foundationHash:closedSourceHash,
   baselineFingerprint:e.baselineFingerprint,afterFingerprint:await planningFingerprint(tx),changedAcl:changed,originalDefinitionsTablesAndRowsPreserved:true,
   beforeWorkerFunctions:acl.filter(r=>r.granted).map(r=>r.f),afterWorkerFunctions:afterAcl.filter(r=>r.granted).map(r=>r.f),
   functions:after.functions.filter(r=>r.signature.startsWith('public.phase5_planning_year_')).map(r=>({signature:r.signature,acl:r.acl,definitionHash:sha(r.definition)}))};
 });
 copyFileSync(join(root,'supabase/migrations',PLANNING_GRANTS),join(target.workdir,'supabase/migrations',PLANNING_GRANTS));
 writeFileSync(resolve(o.out),JSON.stringify(result,null,2)+'\n');process.stdout.write('PASS exact three planning read grants; original definitions, tables and business rows preserved\n');
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':'FAILED: GRANT_APPLY_FAILED\n');process.exitCode=1;});
