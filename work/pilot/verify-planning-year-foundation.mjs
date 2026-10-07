#!/usr/bin/env node
// Owned local SQL proofs; all migration/test bodies roll back before permanent apply.
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {PLANNING_FOUNDATION,PLANNING_TEST,PLANNING_BASE_ENTRIES,PLANNING_TABLES,sha,equal,planningFingerprint,planningBusinessHashes} from './apply-planning-year-migration.mjs';
import {parsePlanningSetup,parsePlanningSelection,parsePlanningList,parsePlanningOverview} from '../../web/lib/planning-year-contract.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function parsePlanningVerifyArgs(argv){
 const result={target:null,mode:null,out:null,stage:'full'},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--target','--mode','--out','--stage'].includes(flag)||seen.has(flag)||!argv[i+1])throw Error('REFUSED: exact arguments required');
  seen.add(flag);result[flag.slice(2)]=argv[++i];
 }
 if(result.target!=='protected'||!['rollback','applied'].includes(result.mode)||!['setup','full'].includes(result.stage)||!result.out
  ||!['/private/tmp','/tmp',resolve(root,'work/pilot/results')].includes(dirname(resolve(result.out))))throw Error('REFUSED: owned protected target, mode and safe evidence path required');
 return result;
}
export function planningRollbackBody(sql){
 if(!/^begin;\s/iu.test(sql)||!/rollback;\s*$/iu.test(sql)||/^(?:(?:commit|end)\s*;|truncate\b|drop\s+database\b|alter\s+role\b|\\connect\b)/imu.test(sql))
  throw Error('REFUSED: exact BEGIN/ROLLBACK fixture required');
 return sql.replace(/^begin;\s*/iu,'').replace(/rollback;\s*$/iu,'');
}
export function planningTapProof(output,minimum=60){
 const assertions=output.split('\n').filter(l=>/^(?:not )?ok \d+\b/u.test(l)),plans=output.split('\n').filter(l=>/^1\.\.\d+$/u.test(l));
 const total=plans.length===1?Number(plans[0].slice(3)):0;
 return {status:total>=minimum&&assertions.length===total&&assertions.every((l,i)=>l.startsWith(`ok ${i+1} `))&&!/Bail out!/iu.test(output)?'PASS':'FAIL',total,assertions};
}
export function planningRollbackScript(source,test,applied=false){
 const snapshots=PLANNING_TABLES.map(t=>`select '${t}' name,coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]'::jsonb) value from public.${t} t`).join('\nunion all\n');
 return `\\set ON_ERROR_STOP on
begin;
select pg_advisory_xact_lock(5520);
create temp table planning_original as ${snapshots};
create temp table planning_old_functions as select p.oid,p.proacl::text acl,pg_get_functiondef(p.oid) definition from pg_proc p
 where p.pronamespace='public'::regnamespace ${applied?'':"and p.proname not like 'phase5_planning_year_%'"};
${applied?'':source}
create temp table planning_after as ${snapshots};
select 'PLANNING_PRESERVATION|'||jsonb_build_object(
 'business',not exists(select 1 from planning_original o full join planning_after a using(name) where o.value is distinct from a.value),
 'functions',not exists(select 1 from planning_old_functions o left join pg_proc a on a.oid=o.oid where o.acl is distinct from a.proacl::text or o.definition is distinct from pg_get_functiondef(a.oid)),
 'closed',not exists(select 1 from pg_proc p cross join lateral aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a
 where p.pronamespace='public'::regnamespace and p.proname like 'phase5_planning_year_%' and a.privilege_type='EXECUTE'
 and a.grantee in (0,(select oid from pg_roles where rolname='anon'),(select oid from pg_roles where rolname='authenticated'),
 (select oid from pg_roles where rolname='service_role'),(select oid from pg_roles where rolname='skolplattform_worker'))))::text;
${planningRollbackBody(test)}
rollback;
`;
}
function parityProof(output,stage){
 const cases=[];
 for(const line of output.split('\n').filter(l=>l.startsWith('PLANNING_PARITY|'))){
  const e=JSON.parse(line.slice('PLANNING_PARITY|'.length)),setup=parsePlanningSetup(e.setup);
  if(e.request){const selection=parsePlanningSelection(e.request,setup);parsePlanningList(e.list,selection,setup);parsePlanningOverview(e.overview,selection,setup);}
  cases.push({name:e.name,ok:true});
 }
 return {ok:cases.length>=(stage==='setup'?1:6),cases};
}
async function main(){
 const o=parsePlanningVerifyArgs(process.argv.slice(2)),manifest=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const source=readFileSync(join(root,'supabase/migrations',PLANNING_FOUNDATION),'utf8'),test=readFileSync(join(root,PLANNING_TEST),'utf8');
 let before,after,beforeAcl,afterAcl,baselineFingerprint,afterFingerprint,tap,stage,parity,error,exitCode;
 try{
  const journal=await db`select version,statements from supabase_migrations.schema_migrations where version>='20261006120000' order by version`;
  if(o.mode==='rollback'&&journal.length)throw Error('REFUSED: foundation already applied or later journal exists');
  if(o.mode==='applied'&&(journal.length!==1||journal[0].version!=='20261006120000'||journal[0].statements?.[0]!==source))throw Error('REFUSED: exact applied source not found');
  if((await db`select version from supabase_migrations.schema_migrations where version='20261005111000'`).length!==1)throw Error('REFUSED: exact predecessor missing');
  if(o.mode==='rollback'&&(await db`select 1 from pg_proc where pronamespace='public'::regnamespace and proname like 'phase5_planning_year_%'`).length)throw Error('REFUSED: namespace collision');
  if((await db`select 1 from public.customers where id='55370000-0000-4000-8000-000000000001'`).length)throw Error('REFUSED: synthetic fixture collision');
  beforeAcl=await gymAcl(db);if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),PLANNING_BASE_ENTRIES))throw Error('REFUSED: exact 25 original Worker entries changed');
  before=await planningBusinessHashes(db);baselineFingerprint=await planningFingerprint(db);
  const proc=spawnSync('docker',['exec','-i',`supabase_db_${manifest.projectId}`,'psql','-U','postgres','-d','postgres','-X','-q','-A','-t','-f','-'],
   {input:planningRollbackScript(source,test,o.mode==='applied'),encoding:'utf8',timeout:120000,maxBuffer:32*1024*1024,stdio:['pipe','pipe','pipe']});
  exitCode=proc.status;
  const marker=proc.stdout.split('\n').find(l=>l.startsWith('PLANNING_PRESERVATION|'));
  if(marker)stage=JSON.parse(marker.slice('PLANNING_PRESERVATION|'.length));
  tap=planningTapProof(proc.stdout,o.stage==='setup'?10:60);
  try{parity=parityProof(proc.stdout,o.stage);}catch(e){parity={ok:false,error:e instanceof Error?e.message:'parity_failed'};}
  if(proc.status!==0)error=(proc.stderr.match(/ERROR:\s*(.+)$/mu)?.[1]??'sql_failed').slice(0,180);
  after=await planningBusinessHashes(db);afterAcl=await gymAcl(db);afterFingerprint=await planningFingerprint(db);
 }finally{await db.end({timeout:5});}
 const checks=[{name:'actual pgTAP assertions',ok:exitCode===0&&tap?.status==='PASS'},
  {name:'migration preserves full business rows and timestamps',ok:stage?.business===true},
  {name:'original definitions and raw function ACL unchanged',ok:stage?.functions===true},
  {name:'all new functions closed to ordinary roles and Worker',ok:stage?.closed===true},
  {name:'complete original business rows after rollback',ok:equal(before,after)},
  {name:'exact old Worker grants and raw ACL after rollback',ok:equal(beforeAcl,afterAcl)},
  {name:'full definitions, table ACL and journal after rollback',ok:baselineFingerprint===afterFingerprint},
  {name:'actual SQL/TypeScript read contract parity',ok:parity?.ok===true}];
 const report={kind:'phase5-planning-year-foundation',status:checks.every(c=>c.ok)?'PASS':'FAIL',target:'protected',scope:'local-synthetic-only',
  mode:o.mode,stage:o.stage,complete:false,rollback:true,reset:false,sourceHash:sha(source),testHash:sha(test),baselineFingerprint,
  originalBusinessPreserved:stage?.business===true&&equal(before,after),originalTimestampsPreserved:stage?.business===true&&equal(before,after),
  aclUnchanged:stage?.functions===true&&equal(beforeAcl,afterAcl),functionsAndJournalPreserved:baselineFingerprint===afterFingerprint,
  beforeWorkerFunctions:beforeAcl.filter(r=>r.granted).map(r=>r.f),afterWorkerFunctions:afterAcl.filter(r=>r.granted).map(r=>r.f),
  originalHashes:before,finalHashes:after,checks,tap,parity,error};
 const content=JSON.stringify(report,null,2)+'\n';mkdirSync(dirname(resolve(o.out)),{recursive:true});writeFileSync(resolve(o.out),content);
 if(report.status!=='PASS')writeFileSync(resolve(o.out).replace(/\.json$/u,`-fail-${Date.now()}.json`),content);
 process.stdout.write(`${report.status} ${o.stage} ${o.mode}: ${tap?.total??0} actual SQL assertions; ${checks.filter(c=>c.ok).length}/${checks.length} checks\n`);
 if(error)process.stdout.write(`SQL failure: ${error}\n`);
 for(const line of tap?.assertions??[])if(line.startsWith('not ok'))process.stdout.write(line+'\n');
 if(parity?.ok===false)process.stdout.write(`Parity failure: ${parity.error??'missing cases'}\n`);
 if(report.status!=='PASS')process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':`FAILED: ${/^[A-Z0-9_]{1,40}$/u.test(e.code??'')?e.code:'PROOF_FAILED'}\n`);process.exitCode=1;});
