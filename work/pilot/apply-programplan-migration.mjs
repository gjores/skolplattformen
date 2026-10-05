#!/usr/bin/env node
// 05-20–05-22: tillämpar exakt en granskad migration på det isolerade lokala målet. Ingen reset.
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
// Endast granskade 05-20–05-22-migrationer, i ordning, med förväntad ACL före tillämpning.
const ALLOWED={
 '20261004120000_phase5_programplan_lifecycle.sql':{before:BASE,grants:false},
 '20261004121000_phase5_worker_programplan_lifecycle.sql':{before:BASE,grants:true},
 '20261004122000_phase5_programplan_lifecycle_locks.sql':{before:[...BASE,...LIFECYCLE_ENTRIES],grants:false},
 '20261004130000_phase5_programplan_units.sql':{before:[...BASE,...LIFECYCLE_ENTRIES],grants:false},
 '20261004140000_phase5_offering_unit_linkage.sql':{before:[...BASE,...LIFECYCLE_ENTRIES],grants:false},
 '20261004141000_phase5_timplan_units.sql':{before:[...BASE,...LIFECYCLE_ENTRIES],grants:false},
};
export function parseApplyArgs(argv){
 const o={migration:null,grants:null};
 for(let i=0;i<argv.length;i++){const a=argv[i],v=()=>{if(argv[i+1]===undefined)throw Error('REFUSED: missing value');return argv[++i];};
  if(a==='--migration')o.migration=v();else if(a==='--grants')o.grants=v();else if(a==='--sync-backfill-journal')o.backfillJournal=v();else throw Error('REFUSED: use --migration <fil> [--grants <preflight.json>]');}
 if(!o.migration||basename(o.migration)!==o.migration||!ALLOWED[o.migration])throw Error('REFUSED: unknown migration');
 if(ALLOWED[o.migration].grants!==(o.grants!==null))throw Error(ALLOWED[o.migration].grants?'REFUSED: --grants <preflight.json> required':'REFUSED: --grants not allowed for this migration');
 if(o.backfillJournal&&o.migration!=='20261004141000_phase5_timplan_units.sql')throw Error('REFUSED: journal sync only for reviewed 05-22 backfill');
 return o;
}
export function verifyPreflight(evidence,read){
 if(evidence?.status!=='PASS'||evidence.preflight!==true||evidence.preflightAclRestored!==true||evidence.cleanupStatus!=='PASS'||evidence.originalBusinessPreserved!==true||evidence.complete!==true)throw Error('REFUSED: verified lifecycle API preflight required');
 const hashes=Object.entries(evidence.sourceHashes??{});
 if(hashes.length<5)throw Error('REFUSED: preflight source evidence missing');
 for(const [path,hash] of hashes)if(createHash('sha256').update(read(path)).digest('hex')!==hash)throw Error('REFUSED: source changed since preflight');
}
// Engångsrättning av en lokal journalpost efter backfill-prov. Inget schema eller
// verksamhetsrader ändras; exakt gamla/nya källhashar och rollbackbevis krävs.
export function verifyBackfillJournal(previous,source,proof){
 const hash=s=>createHash('sha256').update(s).digest('hex');
 if(hash(previous)!=='82426fbd90061062f5732cb7300e9d8b1aeab7b4968b38e2d6687379b45a431b'
  ||hash(source)!=='653fd5fdf8233c29293004da8ab31a91ee750d47688f8519b1f5e368e6db559e')throw Error('REFUSED: journal repair source is not the reviewed backfill correction');
 if(proof?.target!=='protected'||proof.status!=='PASS'||proof.fullExistingTimplanRowsPreserved!==true
  ||proof.unitIdBackfilled!==true||proof.touchTriggerRestored!==true||proof.rollback!==true||proof.reset!==false
  ||proof.sourceHash!==hash(source))throw Error('REFUSED: corrected backfill rollback proof required');
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
   const journal=await tx`select version,statements from supabase_migrations.schema_migrations where version=${version} for update`;
   if(journal.length!==0&&!o.backfillJournal)throw Error('REFUSED: migration already in journal');
   if(o.backfillJournal&&journal.length!==1)throw Error('REFUSED: existing journal required for backfill sync');
   const later=await tx`select version from supabase_migrations.schema_migrations where version>${version}`;
   if(later.length)throw Error('REFUSED: later migration already applied');
   const actual=await tx`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' signature from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'execute')`;
   const [closed]=await tx`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')) and a.privilege_type='EXECUTE') ok`;
   if(!closed.ok||!exactFunctions(actual.map(r=>r.signature),spec.before))throw Error('REFUSED: previous exact Worker ACL missing');
   if(o.backfillJournal){
    if(journal[0].statements?.length!==1)throw Error('REFUSED: unexpected journal statements');
    verifyBackfillJournal(journal[0].statements[0],source,JSON.parse(readFileSync(resolve(root,o.backfillJournal),'utf8')));
    const [state]=await tx`select
     exists(select 1 from pg_attribute where attrelid='public.timplans'::regclass and attname='unit_id' and attnotnull and not attisdropped)
     and exists(select 1 from pg_constraint where conrelid='public.timplans'::regclass and conname='timplans_offering_unit_linkage_fkey' and convalidated)
     and exists(select 1 from pg_trigger where tgrelid='public.timplans'::regclass and tgname='timplans_touch' and tgenabled='O') ok`;
    if(!state.ok)throw Error('REFUSED: corrected backfill schema/trigger state missing');
    await tx`update supabase_migrations.schema_migrations set statements=${[source]} where version=${version}`;
    return;
   }
   await tx.unsafe(source);
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},${o.migration.slice(15,-4)},${[source]})`;
  });
  copyFileSync(resolve(root,'supabase/migrations',o.migration),resolve(manifest.workdir,'supabase/migrations',o.migration));
  console.log(JSON.stringify({target:'protected',projectId:manifest.projectId,migration:o.migration,status:'PASS',reset:false,grants:!!o.grants,journalOnly:!!o.backfillJournal,sourceHash:createHash('sha256').update(source).digest('hex')}));
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{console.error(e.message?.startsWith('REFUSED')?e.message:`FAILED: ${e.code??'unknown'} ${e.message??''}`);process.exitCode=1;});
