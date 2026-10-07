#!/usr/bin/env node
// One private helper, one exact journal record, no business or privilege mutation.
import {readFileSync,copyFileSync,existsSync,realpathSync} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,join,dirname,basename} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {gymAcl} from './apply-gym-timplan-migration.mjs';
import {planningBusinessHashes,sha,equal} from './apply-planning-year-migration.mjs';
import {exactFunctions} from './verify-programplan-api.mjs';
import {validatePerformanceBaseApi} from './verify-planning-year-read-performance.mjs';
import {SEARCH_MIGRATION,SEARCH_ENTRY,SEARCH_WORKER_ENTRIES,readSearchCatalog,searchCatalogFingerprint,assertSearchDiff,
 validateSearchRollback,validateSearchDependencies,validateSearchJournal,searchAuditAnchors,verifySearchWorker,safeSearchOutput,preserveSearchReport} from './verify-planning-year-search-details.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=p=>readFileSync(join(root,p));
export function parseSearchApplyArgs(argv){
 const o={migration:null,evidence:null,out:null,baseURL:null},seen=new Set();
 for(let i=0;i<argv.length;i++){
  const flag=argv[i];if(!['--migration','--evidence','--out','--base-url'].includes(flag)||seen.has(flag)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('REFUSED: exact apply arguments required');
  seen.add(flag);o[flag==='--base-url'?'baseURL':flag.slice(2)]=argv[++i];
 }
 if(o.migration!==SEARCH_MIGRATION||!safeSearchOutput(o.evidence)||!safeSearchOutput(o.out)||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(o.baseURL??''))throw Error('REFUSED: exact SEARCH migration, safe rollback proof, actual parser Worker and safe output required');
 const canonical=p=>existsSync(p)?realpathSync(p):join(realpathSync(dirname(resolve(p))),basename(p));
 if(canonical(o.evidence)===canonical(o.out))throw Error('REFUSED: input evidence and output must be distinct');
 const port=Number(new URL(o.baseURL).port);if(port<1024||port>65535||port===3012)throw Error('REFUSED: isolated Worker port required');
 o.evidence=resolve(o.evidence);o.out=resolve(o.out);return o;
}
async function main(){
 const o=parseSearchApplyArgs(process.argv.slice(2)),e=JSON.parse(readFileSync(o.evidence,'utf8'));validateSearchRollback(e,read);
 const bundle=Object.fromEntries([['final38','phase5-38-api-final'],['performanceRollback','phase5-38-read-performance-rollback'],['performanceFinal','phase5-38-read-performance-final'],['performanceApi','phase5-38-read-performance-api-final']].map(([k,f])=>[k,JSON.parse(read(`work/pilot/results/${f}.json`).toString())]));
 const dependencies=validateSearchDependencies(bundle);if(!equal(dependencies,e.dependencyHashes))throw Error('REFUSED: dependency evidence changed');
 const currentApi=JSON.parse(read('work/pilot/results/phase5-40-search-details-parser-api.json').toString());validatePerformanceBaseApi(currentApi,read);
 if(sha(JSON.stringify(currentApi))!==e.fullApi?.sha256||currentApi.workerBuildRevision!==e.workerBuildRevision)throw Error('REFUSED: exact current full parser/API proof required');
 const proof=await verifySearchWorker(o.baseURL,bundle.performanceFinal);
 if(proof.buildRevision!==e.workerBuildRevision||!equal(proof.parserSourceHashes,e.parserBuild.parserSourceHashes))throw Error('REFUSED: actual parser Worker changed after rollback');
 const source=read(`supabase/migrations/${SEARCH_MIGRATION}`).toString(),target=await assertTarget('protected');
 const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{},connect_timeout:10});
 let report;
 try{
  await db.begin(async tx=>{
   await tx`select pg_advisory_xact_lock(5520)`;
   const before=await readSearchCatalog(tx),beforeHashes=await planningBusinessHashes(tx),beforeAudit=await searchAuditAnchors(tx),beforeAcl=await gymAcl(tx);
   validateSearchJournal(before,read,false);
   if(searchCatalogFingerprint(before)!==e.baselineFingerprint||!equal(before,e.beforeCatalog)||!equal(beforeHashes,e.originalHashes)
    ||!equal(beforeAudit,e.finalAllAnchors)||!equal(beforeAcl,e.beforeAcl)||!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),SEARCH_WORKER_ENTRIES)
    ||sha(before.functions.find(f=>f.signature===SEARCH_ENTRY)?.definition??'')!==e.originalDefinitionHash)throw Error('REFUSED: catalog, source definition, original rows or full audit anchors changed since proof');
   await tx.unsafe(source);
   const candidate=await readSearchCatalog(tx),difference=assertSearchDiff(before,candidate);
   if(difference.originalDefinitionHash!==e.originalDefinitionHash||difference.candidateDefinitionHash!==e.candidateDefinitionHash
    ||!equal(beforeHashes,await planningBusinessHashes(tx))||!equal(beforeAudit,await searchAuditAnchors(tx))||!equal(beforeAcl,await gymAcl(tx)))throw Error('REFUSED: unexpected helper, business, audit or privilege change');
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261006123000','phase5_planning_year_search_details',${[source]})`;
   const after=await readSearchCatalog(tx);assertSearchDiff(before,after,{journal:'append',expectedSource:source});validateSearchJournal(after,read,true);
   report={kind:'phase5-planning-year-search-details-apply',status:'PASS',complete:true,target:'protected',scope:'local-synthetic-only',reset:false,
    migration:SEARCH_MIGRATION,sourceHash:sha(source),sourceHashes:e.sourceHashes,dependencyHashes:e.dependencyHashes,workerBuildRevision:proof.buildRevision,
    baselineFingerprint:e.baselineFingerprint,afterFingerprint:searchCatalogFingerprint(after),originalDefinitionHash:e.originalDefinitionHash,candidateDefinitionHash:e.candidateDefinitionHash,
    changedDefinitions:difference.changedDefinitions,unexpectedDifferences:0,beforeCatalog:before,afterCatalog:after,beforeAcl,afterAcl:await gymAcl(tx),
    beforeWorkerFunctions:beforeAcl.filter(r=>r.granted).map(r=>r.f),afterWorkerFunctions:(await gymAcl(tx)).filter(r=>r.granted).map(r=>r.f),
    originalHashes:beforeHashes,finalHashes:await planningBusinessHashes(tx),beforeAudit,afterAudit:await searchAuditAnchors(tx),
    originalBusinessPreserved:true,originalTimestampsPreserved:true,aclUnchanged:true,originalAuditPreserved:true,identityAnchorsPreserved:true};
  });
  const actual=await readSearchCatalog(db);
  if(searchCatalogFingerprint(actual)!==report.afterFingerprint||!equal(report.originalHashes,await planningBusinessHashes(db))
   ||!equal(report.afterAudit,await searchAuditAnchors(db))||!equal(report.afterAcl,await gymAcl(db)))throw Error('REFUSED: postcommit exact SEARCH state mismatch');
  copyFileSync(join(root,'supabase/migrations',SEARCH_MIGRATION),join(target.workdir,'supabase/migrations',SEARCH_MIGRATION));
  preserveSearchReport(o.out,report);process.stdout.write('PASS SEARCH private definition/journal only; unchanged28 grants/all15 whole rows/audit anchors\n');
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write(e.message?.startsWith('REFUSED')?e.message+'\n':'FAILED: SEARCH_APPLY_FAILED\n');process.exitCode=1;});
