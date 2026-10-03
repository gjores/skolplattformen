#!/usr/bin/env node
// Applies exactly one reviewed migration to the isolated local target, never resets it.
import { TIMPLAN_ENTRIES, PROGRAMPLAN_ENTRIES, WORKSPACE_ENTRIES, EDUCATION_ENTRIES, exactFunctions } from './verify-programplan-api.mjs';
import { assertTarget } from './verify-target.mjs';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync, copyFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const option=process.argv.slice(2).join(' '),grants=option==='--grants',repair=option==='--repair-row-keys';
if(option&&!grants&&!repair)throw Error('REFUSED: use no argument, --repair-row-keys or --grants');
const name=grants?'20261003121000_phase5_worker_programplan_terms.sql':'20261003120000_phase5_programplan_terms.sql';
const manifest=await assertTarget('protected');
const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
try {
 const source=readFileSync(resolve(root,'supabase/migrations',name),'utf8');
 if(grants){const evidence=JSON.parse(readFileSync(resolve(root,'work/pilot/results/phase5-18-terms-api-preflight.json')));if(evidence.status!=='PASS'||evidence.preflightAclRestored!==true||evidence.cleanupStatus!=='PASS'||evidence.originalBusinessPreserved!==true||!evidence.complete)throw Error('REFUSED: verified terms API preflight required');for(const [path,hash] of Object.entries(evidence.sourceHashes??{}))if(createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex')!==hash)throw Error('REFUSED: source changed since preflight');if(Object.keys(evidence.sourceHashes??{}).length!==7)throw Error('REFUSED: preflight source evidence missing');}
 await db.begin(async tx=>{
  const version=name.slice(0,14);
  await tx`select pg_advisory_xact_lock(5518)`;
  const journal=await tx`select version from supabase_migrations.schema_migrations where version=${version}`;
  if(repair?journal.length!==1:journal.length!==0)throw Error('REFUSED: unexpected migration journal state');
  const expected=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES];
  const actual=await tx`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' signature,has_function_privilege('skolplattform_worker',p.oid,'execute') granted from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%'`;
  const [proof]=await tx`select to_regclass('public.programplan_education_receipts') is not null receipts,not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')) and a.privilege_type='EXECUTE') public_closed`;
  if(!proof.receipts||!proof.public_closed||!exactFunctions(actual.filter(r=>r.granted).map(r=>r.signature),expected))throw Error('REFUSED: previous actual education schema/grants missing');
  console.log(JSON.stringify({prerequisite:'actual-reviewed-phase5-objects',receipts:proof.receipts,publicClosed:proof.public_closed,workerSignatures:expected.length,status:'PASS'}));
  if(repair){
   const hash=()=>tx`select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) plans from public.point_plans p`;
   const before=await hash();
   const match=source.match(/create function public\.phase5_programplan_term_rows\(reference jsonb\)[\s\S]*?end \$\$;/u);
   if(!match)throw Error('REFUSED: reviewed row helper absent');
   await tx.unsafe(match[0].replace('create function','create or replace function'));
   await tx`update supabase_migrations.schema_migrations set statements=${[source]} where version=${version}`;
   if(JSON.stringify(await hash())!==JSON.stringify(before))throw Error('REFUSED: business data changed');
  }else{
   await tx.unsafe(source);
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},${name.slice(15,-4)},${[source]})`;
  }
 });
 copyFileSync(resolve(root,'supabase/migrations',name),resolve(manifest.workdir,'supabase/migrations',name));
 console.log(JSON.stringify({target:'protected',projectId:manifest.projectId,migration:name,status:'PASS',reset:false,repair,sourceHash:createHash('sha256').update(source).digest('hex')}));
}finally{await db.end({timeout:5});}
