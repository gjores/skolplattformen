#!/usr/bin/env node
// 05-20: tillämpar exakt en granskad migration på det isolerade lokala målet. Ingen reset.
// Kontrollerar journal och tidigare exakt Worker-ACL; grants kräver PASS-preflight med samma källor.
import { TIMPLAN_ENTRIES, PROGRAMPLAN_ENTRIES, WORKSPACE_ENTRIES, EDUCATION_ENTRIES, TERM_ENTRIES, LIFECYCLE_ENTRIES, exactFunctions } from './verify-programplan-api.mjs';
import { assertTarget } from './verify-target.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, copyFileSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const BASE=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES,...TERM_ENTRIES];
// Endast 05-20:s migrationer, i ordning, med förväntad ACL före tillämpning.
const ALLOWED={
 '20261004120000_phase5_programplan_lifecycle.sql':{before:BASE,grants:false},
 '20261004121000_phase5_worker_programplan_lifecycle.sql':{before:BASE,grants:true},
 '20261004122000_phase5_programplan_lifecycle_locks.sql':{before:[...BASE,...LIFECYCLE_ENTRIES],grants:false},
};
export function parseApplyArgs(argv){
 const o={migration:null,grants:null};
 for(let i=0;i<argv.length;i++){const a=argv[i],v=()=>{if(argv[i+1]===undefined)throw Error('REFUSED: missing value');return argv[++i];};
  if(a==='--migration')o.migration=v();else if(a==='--grants')o.grants=v();else throw Error('REFUSED: use --migration <fil> [--grants <preflight.json>]');}
 if(!o.migration||basename(o.migration)!==o.migration||!ALLOWED[o.migration])throw Error('REFUSED: unknown migration');
 if(ALLOWED[o.migration].grants!==(o.grants!==null))throw Error(ALLOWED[o.migration].grants?'REFUSED: --grants <preflight.json> required':'REFUSED: --grants not allowed for this migration');
 return o;
}
export function verifyPreflight(evidence,read){
 if(evidence?.status!=='PASS'||evidence.preflight!==true||evidence.preflightAclRestored!==true||evidence.cleanupStatus!=='PASS'||evidence.originalBusinessPreserved!==true||evidence.complete!==true)throw Error('REFUSED: verified lifecycle API preflight required');
 const hashes=Object.entries(evidence.sourceHashes??{});
 if(hashes.length<5)throw Error('REFUSED: preflight source evidence missing');
 for(const [path,hash] of hashes)if(createHash('sha256').update(read(path)).digest('hex')!==hash)throw Error('REFUSED: source changed since preflight');
}
async function main(){
 const o=parseApplyArgs(process.argv.slice(2)),spec=ALLOWED[o.migration];
 const source=readFileSync(resolve(root,'supabase/migrations',o.migration),'utf8');
 if(o.grants)verifyPreflight(JSON.parse(readFileSync(resolve(root,o.grants),'utf8')),path=>readFileSync(resolve(root,path)));
 const manifest=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 try{
  await db.begin(async tx=>{
   const version=o.migration.slice(0,14);
   await tx`select pg_advisory_xact_lock(5520)`;
   const journal=await tx`select version from supabase_migrations.schema_migrations where version=${version}`;
   if(journal.length!==0)throw Error('REFUSED: migration already in journal');
   const later=await tx`select version from supabase_migrations.schema_migrations where version>${version}`;
   if(later.length)throw Error('REFUSED: later migration already applied');
   const actual=await tx`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'execute')`;
   const [closed]=await tx`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')) and a.privilege_type='EXECUTE') ok`;
   if(!closed.ok||!exactFunctions(actual.map(r=>r.signature),spec.before))throw Error('REFUSED: previous exact Worker ACL missing');
   await tx.unsafe(source);
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},${o.migration.slice(15,-4)},${[source]})`;
  });
  copyFileSync(resolve(root,'supabase/migrations',o.migration),resolve(manifest.workdir,'supabase/migrations',o.migration));
  console.log(JSON.stringify({target:'protected',projectId:manifest.projectId,migration:o.migration,status:'PASS',reset:false,grants:!!o.grants,sourceHash:createHash('sha256').update(source).digest('hex')}));
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:`FAILED: ${e.code??'unknown'} ${e.message??''}`);process.exitCode=1;});
