#!/usr/bin/env node
// Closed foundation + actual pgTAP in ONE rollback-only PostgreSQL connection.
// Existing full rows stay inside DB/memory; evidence contains hashes and checks.
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {GYM_FOUNDATION,GYM_BASE_ENTRIES,gymAcl,gymBaselineFingerprint} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const TABLES=['point_plans','point_plan_events','offerings','offering_units','timplans','timplan_cells','timplan_events','class_timplans',
 'school_classes','pupil_placements','programplan_shape_upgrades','programplan_unit_packages','programplan_packages'];
const TEST_PATH='supabase/tests/phase5_program_timplan_transition.test.sql';
const sha=value=>createHash('sha256').update(value).digest('hex');
const equal=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
export function gymRollbackTestBody(sql) {
 if(!/^begin;\s/iu.test(sql)||!/rollback;\s*$/iu.test(sql)||/^(?:(?:commit|end)\s*;|truncate\b|drop\s+database\b|alter\s+role\b|\\connect\b)/imu.test(sql))throw Error('REFUSED: exact BEGIN/ROLLBACK fixture required');
 return sql.replace(/^begin;\s*/iu,'').replace(/rollback;\s*$/iu,'');
}
export function gymTapProof(output) {
 const assertions=output.split('\n').filter(line=>/^(?:not )?ok \d+\b/u.test(line));
 const plans=output.split('\n').filter(line=>/^1\.\.\d+$/u.test(line));
 const total=plans.length===1?Number(plans[0].slice(3)):0;
 return {status:total>=35&&assertions.length===total&&assertions.every((line,i)=>line.startsWith(`ok ${i+1} `))&&!/Bail out!/iu.test(output)?'PASS':'FAIL',total,assertions};
}
function projected(table) {
 const extra={timplans:['gym_basis','source_programplan_id'],timplan_cells:['allocated'],timplan_events:['actor_identity_id','session_id','membership_id','assignment_id']}[table]??[];
 return `to_jsonb(t)${extra.map(k=>` - '${k}'`).join('')}`;
}
function snapshotSql(after=false) {
 return TABLES.map(table=>`select '${table}' name,coalesce(jsonb_agg(value order by value::text),'[]'::jsonb) value from (select ${after?projected(table):'to_jsonb(t)'} value from public.${table} t) rows`).join('\nunion all\n');
}
async function businessHashes(db) {
 const hashes={};for(const table of TABLES) {
  const rows=await db.unsafe(`select to_jsonb(t) row from public.${table} t order by to_jsonb(t)::text`);
  hashes[table]={count:rows.length,sha256:sha(JSON.stringify(rows.map(r=>r.row)))};
 }return hashes;
}
export function gymFoundationRollbackScript(source,test) {
 const body=gymRollbackTestBody(test);
 return `\\set ON_ERROR_STOP on
begin;
select pg_advisory_xact_lock(5520);
create temp table gym_foundation_original as ${snapshotSql()};
create temp table gym_foundation_acl as select p.oid,p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%';
create temp table gym_foundation_table_acl as select oid,relacl::text acl from pg_class where oid=any(array['public.timplans'::regclass,'public.timplan_cells'::regclass,'public.timplan_events'::regclass]);
${source}
create temp table gym_foundation_projected as ${snapshotSql(true)};
select 'GYM_FOUNDATION_CHECK|'||jsonb_build_object(
 'originalBusinessPreserved',not exists(select 1 from gym_foundation_original o full join gym_foundation_projected a using(name) where o.value is distinct from a.value),
 'originalTimestampsPreserved',not exists(select 1 from gym_foundation_original o full join gym_foundation_projected a using(name) where o.value is distinct from a.value),
 'newNullableFieldsOnly',not exists(select 1 from public.timplans where gym_basis is not null or source_programplan_id is not null)
 and not exists(select 1 from public.timplan_cells where allocated is not null)
 and not exists(select 1 from public.timplan_events where actor_identity_id is not null or session_id is not null or membership_id is not null or assignment_id is not null),
 'oldFunctionAclPreserved',not exists(select 1 from gym_foundation_acl a join pg_proc p on p.oid=a.oid where a.acl is distinct from p.proacl::text),
 'oldTableAclPreserved',not exists(select 1 from gym_foundation_table_acl a join pg_class p on p.oid=a.oid where a.acl is distinct from p.relacl::text),
 'closedFoundationWorkerCount',(select count(*) from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' and has_function_privilege('skolplattform_worker',p.oid,'execute'))
 )::text;
${body}
rollback;
`;
}
async function main() {
 const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--out'||!resolve(args[1]).startsWith('/private/tmp/'))throw Error('REFUSED: --out /private/tmp/<evidence> required');
 const manifest=await assertTarget('protected');
 const db=require('postgres')(manifest.dbUrl,{max:1,prepare:false,connect_timeout:10,onnotice:()=>{}});
 const source=readFileSync(join(root,'supabase/migrations',GYM_FOUNDATION),'utf8'),test=readFileSync(join(root,TEST_PATH),'utf8');
 let beforeHashes,afterHashes,beforeAcl,afterAcl,baselineFingerprint,afterFingerprint,stage,tap,exitCode,error;
 try {
  if((await db`select version from supabase_migrations.schema_migrations where version>='20261005110000'`).length)throw Error('REFUSED: foundation already applied or later journal exists');
  if((await db`select version from supabase_migrations.schema_migrations where version='20261004157000'`).length!==1)throw Error('REFUSED: exact D predecessor missing');
  const [collision]=await db`select exists(select 1 from public.customers where id='55010000-0000-4000-8000-000000000001') present`;
  if(collision.present)throw Error('REFUSED: synthetic test identity already exists');
  beforeAcl=await gymAcl(db);if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),GYM_BASE_ENTRIES))throw Error('REFUSED: exact original 21 Worker entrypoints changed');
  beforeHashes=await businessHashes(db);baselineFingerprint=await gymBaselineFingerprint(db);
  const script=gymFoundationRollbackScript(source,test);
  const proc=spawnSync('docker',['exec','-i',`supabase_db_${manifest.projectId}`,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-f','-'],{
   input:script,encoding:'utf8',timeout:300000,maxBuffer:16*1024*1024,stdio:['pipe','pipe','pipe']});
  exitCode=proc.status;
  const marker=proc.stdout.split('\n').find(line=>line.startsWith('GYM_FOUNDATION_CHECK|'));
  if(marker)stage=JSON.parse(marker.slice('GYM_FOUNDATION_CHECK|'.length));
  tap=gymTapProof(proc.stdout);
  if(proc.status!==0)error=(proc.stderr.match(/^ERROR:\s*(.+)$/mu)??proc.stderr.match(/ERROR:\s*(.+)$/mu))?.[1]?.slice(0,200)??'rollback_sql_failed';
  afterHashes=await businessHashes(db);afterAcl=await gymAcl(db);afterFingerprint=await gymBaselineFingerprint(db);
 }finally {await db.end({timeout:5});}
 const checks=[
  {name:'actual pgTAP assertions and deferred triggers',ok:exitCode===0&&tap?.status==='PASS'},
  ...['originalBusinessPreserved','originalTimestampsPreserved','newNullableFieldsOnly','oldFunctionAclPreserved','oldTableAclPreserved'].map(name=>({name,ok:stage?.[name]===true})),
  {name:'foundation remains exact 21 closed Worker entries',ok:stage?.closedFoundationWorkerCount===21},
  {name:'rollback preserves original complete rows and timestamps',ok:equal(beforeHashes,afterHashes)},
  {name:'rollback restores exact raw ACL',ok:equal(beforeAcl,afterAcl)},
  {name:'rollback restores function definitions and complete migration journal',ok:baselineFingerprint===afterFingerprint},
 ];
 const report={kind:'phase5-gym-timplan-foundation-rollback',status:checks.every(c=>c.ok)?'PASS':'FAIL',target:'protected',scope:'local-synthetic-only',rollback:true,reset:false,
  sourceHash:sha(source),testHash:sha(test),baselineFingerprint,originalBusinessPreserved:stage?.originalBusinessPreserved===true&&equal(beforeHashes,afterHashes),
  originalTimestampsPreserved:stage?.originalTimestampsPreserved===true&&equal(beforeHashes,afterHashes),newNullableFieldsOnly:stage?.newNullableFieldsOnly===true,
  aclUnchanged:equal(beforeAcl,afterAcl)&&stage?.oldFunctionAclPreserved===true&&stage?.oldTableAclPreserved===true,
  beforeWorkerFunctions:beforeAcl.filter(r=>r.granted).map(r=>r.f),afterWorkerFunctions:afterAcl.filter(r=>r.granted).map(r=>r.f),
  originalHashes:beforeHashes,finalHashes:afterHashes,checks,tap,error};
 const evidence=JSON.stringify(report,null,2)+'\n';
 writeFileSync(resolve(args[1]),evidence);
 // Never lose an actual failed attempt when a repaired source is retried.
 if(report.status!=='PASS')writeFileSync(resolve(args[1]).replace(/\.json$/u,`-fail-${Date.now()}.json`),evidence);
 process.stdout.write(`${report.status} foundation rollback: ${tap?.total??0} actual assertions; ${checks.filter(c=>c.ok).length}/${checks.length} preservation checks\n`);
 if(error)process.stdout.write(`SQL failure: ${error}\n`);
 for(const line of tap?.assertions??[])if(line.startsWith('not ok'))process.stdout.write(line+'\n');
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(error=>{
 process.stderr.write(error.message?.startsWith('REFUSED')?error.message+'\n':`FAILED: ${/^[A-Z0-9_]{1,40}$/u.test(error.code??'')?error.code:'TEST_FAILED'}\n`);process.exitCode=1;
});
