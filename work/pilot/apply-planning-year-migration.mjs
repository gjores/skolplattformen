#!/usr/bin/env node
// Exactly reviewed closed local foundation. Never opens Worker grants or resets data.
import {readFileSync,copyFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {resolve,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {GYM_BASE_ENTRIES,GYM_ENTRIES,gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
export const PLANNING_FOUNDATION='20261006120000_phase5_planning_year_reads.sql';
export const PLANNING_TEST='supabase/tests/phase5_planning_year.test.sql';
export const PLANNING_BASE_ENTRIES=[...GYM_BASE_ENTRIES,...GYM_ENTRIES];
export const PLANNING_ENTRIES=['public.phase5_planning_year_selection()','public.phase5_planning_year_list(jsonb)','public.phase5_planning_year_overview(jsonb)'];
export const PLANNING_TABLES=['point_plans','point_plan_events','offerings','offering_units','timplans','timplan_cells','timplan_events','class_timplans',
 'school_classes','pupil_placements','programplan_shape_upgrades','programplan_unit_packages','programplan_packages','gym_timplan_receipts','school_years'];
export const sha=value=>createHash('sha256').update(value).digest('hex');
export const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const root=fileURLToPath(new URL('../../',import.meta.url));
export function parsePlanningApplyArgs(argv){
 const result={migration:null,evidence:null};const seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--migration','--evidence'].includes(flag)||seen.has(flag)||!argv[i+1])throw Error('REFUSED: exact arguments required');
  seen.add(flag);result[flag.slice(2)]=argv[++i];
 }
 if(result.migration!==PLANNING_FOUNDATION||basename(result.migration)!==result.migration||!result.evidence)throw Error('REFUSED: exact closed foundation and evidence required');
 return result;
}
export function verifyPlanningFoundation(e,source,test){
 if(e?.kind!=='phase5-planning-year-foundation'||e.status!=='PASS'||e.target!=='protected'||e.scope!=='local-synthetic-only'
  ||e.mode!=='rollback'||e.stage!=='full'||e.complete!==true||e.rollback!==true||e.reset!==false
  ||e.sourceHash!==sha(source)||e.testHash!==sha(test)||! /^[a-f0-9]{64}$/u.test(e.baselineFingerprint??'')
  ||e.originalBusinessPreserved!==true||e.originalTimestampsPreserved!==true||e.aclUnchanged!==true||e.functionsAndJournalPreserved!==true
  ||!exactFunctions(e.beforeWorkerFunctions??[],PLANNING_BASE_ENTRIES)||!exactFunctions(e.afterWorkerFunctions??[],PLANNING_BASE_ENTRIES)
  ||!e.parity?.ok||!e.locks?.ok||!e.tap||e.tap.status!=='PASS'||e.tap.total<60
  ||Object.keys(e.originalHashes??{}).length!==PLANNING_TABLES.length||!equal(e.originalHashes,e.finalHashes)
  ||!Array.isArray(e.checks)||e.checks.length===0||!e.checks.every(c=>c.ok===true))throw Error('REFUSED: complete rollback, parity, lock and preservation proof required');
}
export async function planningFingerprint(db,excludeNew=false){
 const functions=await db`select p.oid::regprocedure::text signature,p.proacl::text acl,pg_get_functiondef(p.oid) definition
 from pg_proc p where p.pronamespace='public'::regnamespace and (not ${excludeNew} or p.proname not like 'phase5_planning_year_%') order by signature`;
 const tables=await db`select c.oid::regclass::text relation,c.relacl::text acl,c.relrowsecurity,c.relforcerowsecurity from pg_class c
 where c.relnamespace='public'::regnamespace and c.relkind in ('r','p','v','m','S') order by relation`;
 const journal=await db`select version,name,statements from supabase_migrations.schema_migrations order by version`;
 return sha(JSON.stringify({functions,tables,journal}));
}
export async function planningBusinessHashes(db){
 const hashes={};for(const table of PLANNING_TABLES){const [r]=await db.unsafe(`select count(*)::integer count,
 encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb)::text,'sha256'),'hex') sha256 from public.${table} t`);hashes[table]={...r};}return hashes;
}
async function main(){
 const o=parsePlanningApplyArgs(process.argv.slice(2)),source=readFileSync(resolve(root,'supabase/migrations',o.migration),'utf8'),test=readFileSync(resolve(root,PLANNING_TEST),'utf8');
 const e=JSON.parse(readFileSync(resolve(o.evidence),'utf8'));verifyPlanningFoundation(e,source,test);
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 try {await db.begin(async tx=>{
  await tx`select pg_advisory_xact_lock(5520)`;
  if((await tx`select version from supabase_migrations.schema_migrations where version>='20261006120000'`).length)throw Error('REFUSED: migration time is occupied');
  if((await tx`select version from supabase_migrations.schema_migrations where version='20261005111000'`).length!==1)throw Error('REFUSED: exact predecessor missing');
  if((await tx`select 1 from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_planning_year_%'`).length)throw Error('REFUSED: function namespace collision');
  const before=await gymAcl(tx);
  if(!exactFunctions(before.filter(r=>r.granted).map(r=>r.f),PLANNING_BASE_ENTRIES)||e.baselineFingerprint!==await planningFingerprint(tx)
    ||!equal(e.originalHashes,await planningBusinessHashes(tx)))throw Error('REFUSED: baseline changed after proof');
  await tx.unsafe(source);
  if(!equal(before, (await gymAcl(tx)).filter(r=>!r.f.startsWith('public.phase5_planning_year_')))||e.baselineFingerprint!==await planningFingerprint(tx,true)
    ||!equal(e.originalHashes,await planningBusinessHashes(tx)))throw Error('REFUSED: foundation changed original state');
  const [closed]=await tx`select not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
   where p.pronamespace='public'::regnamespace and p.proname like 'phase5_planning_year_%' and a.privilege_type='EXECUTE'
    and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),
    (select oid from pg_roles where rolname='service_role'),(select oid from pg_roles where rolname='skolplattform_worker'))) ok`;
  if(!closed.ok)throw Error('REFUSED: foundation grants open');
  await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261006120000','phase5_planning_year_reads',${[source]})`;
 });
 copyFileSync(resolve(root,'supabase/migrations',o.migration),resolve(target.workdir,'supabase/migrations',o.migration));
 process.stdout.write(JSON.stringify({status:'PASS',target:'protected',migration:o.migration,sourceHash:sha(source),reset:false,grants:false})+'\n');
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':`FAILED: ${/^[A-Z0-9_]{1,40}$/u.test(e.code??'')?e.code:'APPLY_FAILED'}\n`);process.exitCode=1;});
