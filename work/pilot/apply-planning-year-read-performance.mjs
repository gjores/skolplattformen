#!/usr/bin/env node
// Apply one reviewed private definition only after complete owned rollback/HTTP evidence.
import {readFileSync,writeFileSync,copyFileSync,constants} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {sha,equal,PLANNING_FOUNDATION,PLANNING_ENTRIES,PLANNING_BASE_ENTRIES,planningFingerprint,planningBusinessHashes} from './apply-planning-year-migration.mjs';
import {PLANNING_GRANTS} from './apply-planning-year-grants.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {PERFORMANCE_MIGRATION,PERFORMANCE_ENTRY,readPerformanceCatalog,assertPerformanceDiff,validatePerformanceRollback,validatePerformanceBaseApi,canonicalPerformanceEvidencePath,assertPerformanceEvidenceOutput} from './verify-planning-year-read-performance.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export function parsePerformanceApplyArgs(argv){
 const o={migration:null,evidence:null,out:null},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--migration','--evidence','--out'].includes(flag)||seen.has(flag)||!argv[i+1])throw Error('REFUSED: exact arguments required');
  seen.add(flag);o[flag.slice(2)]=argv[++i];
 }
 if(o.migration!==PERFORMANCE_MIGRATION||!o.evidence||!o.out
  ||![join(root,'work/pilot/results'),'/tmp','/private/tmp'].includes(dirname(resolve(o.out))))throw Error('REFUSED: exact private correction, rollback proof and safe output required');
 o.evidence=canonicalPerformanceEvidencePath(o.evidence);o.out=assertPerformanceEvidenceOutput(o.out,[o.evidence]);
 if(o.evidence===o.out)throw Error('REFUSED: output must not overwrite canonical input evidence');
 return o;
}
async function auditAnchors(db){
 const [audit]=await db`select count(*)::integer count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(e) order by e.id),'[]'::jsonb)::text,'sha256'),'hex') sha256 from public.security_events e`;
 const [identities]=await db`select count(*)::integer count,encode(extensions.digest(coalesce(jsonb_agg(to_jsonb(i) order by i.id),'[]'::jsonb)::text,'sha256'),'hex') sha256 from public.identities i`;
 return {audit:{...audit},identities:{...identities}};
}
async function main(){
 const o=parsePerformanceApplyArgs(process.argv.slice(2)),source=readFileSync(join(root,'supabase/migrations',o.migration),'utf8');
 const e=JSON.parse(readFileSync(resolve(o.evidence),'utf8'));assertPerformanceEvidenceOutput(o.out,[o.evidence,e.reusableExplicitNamedSqlComponents?.report,e.reusableExplicitNamedSqlComponents?.currentFullReport?.report,join(root,'work/pilot/results/phase5-38-api-final.json'),join(root,'work/pilot/results/phase5-38-read-performance-rollback.json')]);validatePerformanceRollback(e,p=>readFileSync(join(root,p)));
 const foundation=readFileSync(join(root,'supabase/migrations',PLANNING_FOUNDATION),'utf8'),grant=readFileSync(join(root,'supabase/migrations',PLANNING_GRANTS),'utf8');
 if(sha(foundation)!=='e014d63bca3a1f71d41054216f97c1b02f6cdf93f2e45baff40fe7afd7c2aa71'
  ||sha(readFileSync(join(root,'supabase/tests/phase5_planning_year.test.sql')))!=='be8d975aa43a07fa6712c3b333709e8344ee50debf65f26200ce10649d80bd34')throw Error('REFUSED: immutable foundation or original test changed');
 const final38=JSON.parse(readFileSync(join(root,'work/pilot/results/phase5-38-api-final.json'),'utf8'));
 validatePerformanceBaseApi(final38,p=>readFileSync(join(root,p)));
 const inventory=JSON.parse(readFileSync(join(root,'.planning/phases/05-bevarade-utbildnings-och-klassfloden/05-37-FUNCTION-EVIDENCE.json'),'utf8'));
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let result;
 try{
  await db.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(5520)`;
   const before=await readPerformanceCatalog(tx),beforeHashes=await planningBusinessHashes(tx),beforeAudit=await auditAnchors(tx),beforePlanningFingerprint=await planningFingerprint(tx);
   if(e.targetProjectId&&e.targetProjectId!==target.projectId)throw Error('REFUSED: rollback proof targets a different owned protected project');
   if(!equal(beforeAudit,e.finalAllAnchors))throw Error('REFUSED: full audit or identity rows changed since rollback proof');
   if(beforePlanningFingerprint!==final38.finalFingerprint||!equal(beforeHashes,final38.finalHashes))throw Error('REFUSED: original38 applied baseline changed');
   const journal=before.journal.filter(r=>r.version>='20261006120000');
   if(journal.length!==2||journal[0].version!=='20261006120000'||!equal(journal[0].statements,[foundation])
    ||journal[1].version!=='20261006121000'||!equal(journal[1].statements,[grant]))throw Error('REFUSED: exact predecessors and unoccupied correction time required');
   if(sha(JSON.stringify(before))!==e.baselineFingerprint||!equal(beforeHashes,e.originalHashes))throw Error('REFUSED: baseline changed since rollback');
   const planning=before.functions.filter(r=>r.signature.startsWith('public.phase5_planning_year_'));
   if(planning.length!==14||!exactFunctions(planning.map(r=>r.signature),inventory.functions.map(r=>r.signature))
    ||planning.some(r=>sha(r.definition)!==inventory.functions.find(f=>f.signature===r.signature)?.definitionHash
     ||r.acl!==(PLANNING_ENTRIES.includes(r.signature)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':'{postgres=X/postgres}'))
    ||sha(planning.find(r=>r.signature===PERFORMANCE_ENTRY)?.definition??'')!==e.originalDefinitionHash)throw Error('REFUSED: original private definition inventory changed');
   const acl=await gymAcl(tx),workerFunctions=acl.filter(r=>r.granted).map(r=>r.f);
   if(!exactFunctions(workerFunctions,[...PLANNING_BASE_ENTRIES,...PLANNING_ENTRIES]))throw Error('REFUSED: exact28 Worker entrypoints required');
   await tx.unsafe(source);
   const candidate=await readPerformanceCatalog(tx),difference=assertPerformanceDiff(before,candidate,{journal:'unchanged'});
   if(difference.candidateDefinitionHash!==e.candidateDefinitionHash||difference.originalDefinitionHash!==e.originalDefinitionHash
    ||!equal(acl,await gymAcl(tx))||!equal(beforeHashes,await planningBusinessHashes(tx))||!equal(beforeAudit,await auditAnchors(tx)))throw Error('REFUSED: unexpected definition, privileges, business or audit change');
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261006122000','phase5_planning_year_read_performance',${[source]})`;
   const after=await readPerformanceCatalog(tx);assertPerformanceDiff(before,after,{journal:'append',expectedSource:source});
   result={kind:'phase5-planning-year-read-performance-apply',status:'PASS',complete:true,target:'protected',scope:'local-synthetic-only',reset:false,
    migration:o.migration,sourceHash:sha(source),sourceHashes:e.sourceHashes,reusableExplicitNamedSqlComponents:e.reusableExplicitNamedSqlComponents??null,
    acceptedTimingPolicy:e.reusableExplicitNamedSqlComponents?.policy??'complete-http-baseline',targetProjectId:target.projectId,baselineFingerprint:e.baselineFingerprint,afterFingerprint:sha(JSON.stringify(after)),
    beforePlanningFingerprint,originalDefinitionHash:e.originalDefinitionHash,candidateDefinitionHash:difference.candidateDefinitionHash,
    changedDefinitions:difference.changedDefinitions,unexpectedDifferences:0,originalHashes:beforeHashes,finalHashes:await planningBusinessHashes(tx),
    beforeWorkerFunctions:workerFunctions,afterWorkerFunctions:(await gymAcl(tx)).filter(r=>r.granted).map(r=>r.f),
    originalBusinessPreserved:true,originalTimestampsPreserved:true,aclUnchanged:true,originalAuditPreserved:true,identityAnchorsPreserved:true,
    beforeAudit,afterAudit:await auditAnchors(tx),functions:after.functions.filter(r=>r.signature.startsWith('public.phase5_planning_year_')).map(r=>({signature:r.signature,acl:r.acl,definitionHash:sha(r.definition)}))};
  });
  const actual=await readPerformanceCatalog(db);
  if(sha(JSON.stringify(actual))!==result.afterFingerprint||!equal(result.originalHashes,await planningBusinessHashes(db)))throw Error('REFUSED: postcommit correction mismatch');
  copyFileSync(join(root,'supabase/migrations',o.migration),join(target.workdir,'supabase/migrations',o.migration));
  writeFileSync(resolve(o.out),JSON.stringify(result,null,2)+'\n',{flag:constants.O_WRONLY|constants.O_CREAT|constants.O_TRUNC|constants.O_NOFOLLOW});process.stdout.write('PASS exact private read correction; unchanged28 grants, original rows and audit\n');
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':'FAILED: PERFORMANCE_APPLY_FAILED\n');process.exitCode=1;});
