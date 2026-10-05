#!/usr/bin/env node
// Exactly reviewed local-only migrations; foundation requires rolled-back proof,
// Worker grants require actual built Worker preflight with exact restored ACL.
import {readFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {TIMPLAN_ENTRIES,PROGRAMPLAN_ENTRIES,WORKSPACE_ENTRIES,EDUCATION_ENTRIES,TERM_ENTRIES,LIFECYCLE_ENTRIES,BLOCK_ENTRIES,UNIT_PACKAGE_ENTRIES,PACKAGE_ENTRIES,exactFunctions} from './verify-programplan-api.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const GYM_FOUNDATION='20261005110000_phase5_gym_timplan_transition.sql';
export const GYM_GRANTS='20261005111000_phase5_worker_gym_timplan_transition.sql';
export const GYM_ENTRIES=['public.phase5_gym_timplan_underlag(uuid)','public.phase5_create_gym_timplan(uuid,uuid,integer,integer,uuid,uuid,integer)','public.phase5_read_gym_timplan(uuid)','public.phase5_write_gym_timplan_row(uuid,integer,text,jsonb)'];
export const GYM_BASE_ENTRIES=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES,...TERM_ENTRIES,...LIFECYCLE_ENTRIES,...BLOCK_ENTRIES,...UNIT_PACKAGE_ENTRIES,...PACKAGE_ENTRIES];
export const GYM_API_CASES=['built-worker','source-school-scope','create-two-schools-replay','row-null-cas','source-replacement','role-school-denials','source-not-ready','audit-rollback','mfa-csrf-session','clients-closed','legacy-class-preservation'];
export const GYM_SOURCE_PATHS=['work/pilot/apply-gym-timplan-migration.mjs','work/pilot/verify-gym-timplan-api.mjs','work/pilot/phase5-gym-timplan-fixtures.mjs','work/pilot/phase5-programplan-browser-fixtures.mjs','web/lib/gym-timplan.ts','web/lib/server/gym-timplan.ts','web/lib/server/audit-details.ts','web/lib/mandate-policy.ts',...['underlag','skapa','lasa','rad'].map(s=>`web/app/api/timplaner/gym/${s}/route.ts`),`supabase/migrations/${GYM_FOUNDATION}`,`supabase/migrations/${GYM_GRANTS}`];
const sha=s=>createHash('sha256').update(s).digest('hex');
export function parseGymApplyArgs(argv){
 const o={migration:null,evidence:null};
 for(let i=0;i<argv.length;i++){const a=argv[i],v=()=>{if(argv[i+1]===undefined)throw Error('REFUSED: missing argument');return argv[++i];};
 if(a==='--migration')o.migration=v();else if(a==='--evidence')o.evidence=v();else throw Error('REFUSED: unknown argument');}
 if(![GYM_FOUNDATION,GYM_GRANTS].includes(o.migration)||basename(o.migration)!==o.migration||!o.evidence)throw Error('REFUSED: exact reviewed migration and evidence required');
 return o;
}
export function verifyGymFoundation(e,source){
 if(e?.kind!=='phase5-gym-timplan-foundation-rollback'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.rollback!==true||e.reset!==false
 ||e.sourceHash!==sha(source)||! /^[a-f0-9]{64}$/u.test(e.baselineFingerprint??'')||e.originalBusinessPreserved!==true||e.originalTimestampsPreserved!==true||e.newNullableFieldsOnly!==true
 ||e.aclUnchanged!==true||!exactFunctions(e.beforeWorkerFunctions??[],GYM_BASE_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],GYM_BASE_ENTRIES)
 ||!Array.isArray(e.checks)||e.checks.length===0||!e.checks.every(c=>c.ok===true))throw Error('REFUSED: complete foundation rollback and original-data proof required');
}
export function verifyGymPreflight(e,read){
 if(e?.kind!=='phase5-gym-timplan-api'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'||e.preflight!==true||e.complete!==true
 ||e.preflightAclRestored!==true||e.aclUnchanged!==true||e.cleanupStatus!=='PASS'||e.originalBusinessPreserved!==true
 ||!exactFunctions(e.beforeWorkerFunctions??[],GYM_BASE_ENTRIES)||!exactFunctions(e.restoredWorkerFunctions??[],GYM_BASE_ENTRIES)
 ||!exactFunctions(e.verifiedWorkerFunctions??[],[...GYM_BASE_ENTRIES,...GYM_ENTRIES])
 ||!Array.isArray(e.cases)||!exactFunctions(e.cases.map(c=>c.name),GYM_API_CASES)||!e.cases.every(c=>c.status==='PASS'&&Array.isArray(c.checks)&&c.checks.length>0&&c.checks.every(k=>k.ok===true))
 ||! /^[a-f0-9]{40}$/u.test(e.sourceCommit??'')||! /^[a-f0-9]{40}$/u.test(e.workerBuildRevision??'')
 ||! /^[a-f0-9]{64}$/u.test(e.baselineFingerprint??'')
 ||!e.cleanup?.originalBusinessUnchanged||e.cleanup.gymReceipts!==0||e.cleanup.timplans!==0||e.cleanup.classLinks!==0
 ||Object.keys(e.originalHashes??{}).length!==14||JSON.stringify(e.originalHashes)!==JSON.stringify(e.finalHashes))throw Error('REFUSED: complete actual Worker/ACL/cleanup proof required');
 for(const p of GYM_SOURCE_PATHS)if(!e.sourceHashes?.[p]||e.sourceHashes[p]!==sha(read(p)))throw Error('REFUSED: source changed since preflight');
}
export async function gymAcl(db){return db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' as f,has_function_privilege('skolplattform_worker',p.oid,'execute') as granted,p.proacl::text as acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.oid`;}
export async function gymBaselineFingerprint(db){
 const functions=await db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' as f,
 p.proacl::text as acl,pg_get_functiondef(p.oid) as definition from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by f`;
 const journal=await db`select version,name,statements from supabase_migrations.schema_migrations order by version`;
 return sha(JSON.stringify({functions,journal}));
}
async function main(){
 const o=parseGymApplyArgs(process.argv.slice(2)),source=readFileSync(resolve(root,'supabase/migrations',o.migration),'utf8'),e=JSON.parse(readFileSync(resolve(o.evidence),'utf8'));
 if(o.migration===GYM_FOUNDATION)verifyGymFoundation(e,source);else verifyGymPreflight(e,p=>readFileSync(resolve(root,p)));
 const manifest=await assertTarget('protected');const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 try{
 await db.begin(async tx=>{
 await tx`select pg_advisory_xact_lock(5520)`;
 const version=o.migration.slice(0,14);
 if((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length)throw Error('REFUSED: current or later migration already applied');
 const dependency=o.migration===GYM_FOUNDATION?'20261004157000':GYM_FOUNDATION.slice(0,14);
 if((await tx`select version from supabase_migrations.schema_migrations where version=${dependency}`).length!==1)throw Error('REFUSED: required exact predecessor migration missing');
 const actual=await gymAcl(tx);
 if(!exactFunctions(actual.filter(r=>r.granted).map(r=>r.f),GYM_BASE_ENTRIES))throw Error('REFUSED: previous exact Worker ACL changed');
 if(e.baselineFingerprint!==await gymBaselineFingerprint(tx))throw Error('REFUSED: function definitions, ACL or journal changed since proof');
 const [closed]=await tx`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated')) and a.privilege_type='EXECUTE') ok`;
 if(!closed.ok)throw Error('REFUSED: public planning RPC privilege open');
 await tx.unsafe(source);
 const after=await gymAcl(tx),expected=o.migration===GYM_FOUNDATION?GYM_BASE_ENTRIES:[...GYM_BASE_ENTRIES,...GYM_ENTRIES];
 if(!exactFunctions(after.filter(r=>r.granted).map(r=>r.f),expected))throw Error('REFUSED: migration Worker ACL differs');
 await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},${o.migration.slice(15,-4)},${[source]})`;
 });
 copyFileSync(resolve(root,'supabase/migrations',o.migration),resolve(manifest.workdir,'supabase/migrations',o.migration));
 process.stdout.write(JSON.stringify({status:'PASS',target:'protected',migration:o.migration,reset:false,sourceHash:sha(source),grants:o.migration===GYM_GRANTS})+'\n');
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':`FAILED: ${e.code??'unknown'}\n`);process.exitCode=1;});
