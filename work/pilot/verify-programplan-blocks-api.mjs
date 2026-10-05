#!/usr/bin/env node
// 05-23: stage-specific evidence from actual Worker, SQL and owned synthetic fixtures.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { createProgramplanBrowserFixture } from './phase5-programplan-browser-fixtures.mjs';
import { TIMPLAN_ENTRIES, PROGRAMPLAN_ENTRIES, WORKSPACE_ENTRIES, EDUCATION_ENTRIES, TERM_ENTRIES, LIFECYCLE_ENTRIES, exactFunctions } from './verify-programplan-api.mjs';
import { parseProgramplan } from '../../web/lib/programplan-contract.ts';
import { parseProgramplanTermReply } from '../../web/lib/programplan-terms-contract.ts';
import { programplanTermRows, programplanLevelRanks, suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const SOURCE=['web/lib/programplan-catalog.ts','web/lib/programplan-choice-blocks.ts','web/lib/programplan-terms.ts','web/lib/programplan-terms-contract.ts','web/lib/programplan-contract.ts',
  'web/lib/protected-programplan.ts','web/lib/server/programplan-planning.ts','web/lib/server/programplan-terms.ts','web/app/protected-programplan-board.tsx','web/app/protected-programplan-flow.tsx','web/app/protected-programplan-workspace.tsx',
  'web/app/api/programplaner/skapa/route.ts','web/app/api/programplaner/lasa/route.ts','web/app/api/programplaner/terminer/route.ts','web/app/api/programplaner/terminer/lasa/route.ts',
  'supabase/migrations/20261004150000_phase5_programplan_choice_blocks.sql','work/pilot/verify-programplan-blocks-api.mjs','work/pilot/phase5-programplan-browser-fixtures.mjs'];
export const BLOCK_STEP_A_CASES=['built-worker','ts-sql-parity','v2-create-save-reread'];
export function parseBlockApiArgs(args) {
  const o={step:'a',preflight:false,baseURL:'http://127.0.0.1:3059',outFile:resolve(root,'work/pilot/results/phase5-23-a-api.json')};
  for(let i=0;i<args.length;i++) {
    const value=()=>{if(args[i+1]===undefined)throw Error('missing_argument');return args[++i];};
    if(args[i]==='--step')o.step=value();else if(args[i]==='--preflight')o.preflight=true;
    else if(args[i]==='--base-url')o.baseURL=value();else if(args[i]==='--out')o.outFile=resolve(value());else throw Error('unknown_argument');
  }
  if(!['a','b','c','d'].includes(o.step)||!/^http:\/\/127\.0\.0\.1:\d+$/u.test(o.baseURL)
    ||![resolve(root,'work/pilot/results'),'/private/tmp','/tmp'].includes(dirname(o.outFile)))throw Error('REFUSED_unsafe_target');
  // Later stages must add their own evidence; they cannot inherit a false PASS from A.
  if(o.step!=='a')throw Error('REFUSED_step_not_implemented');
  return o;
}
export async function runBlockApi(o) {
  parseBlockApiArgs(['--step',o.step,'--base-url',o.baseURL,'--out',o.outFile,...(o.preflight?['--preflight']:[])]);
  const manifest=await assertTarget('protected');
  const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:3,prepare:false,onnotice:()=>{}});
  const report={kind:'phase5-programplan-blocks-api',scope:'local-synthetic-only',step:o.step,preflight:o.preflight,status:'FAIL',cases:[],calls:[],complete:false};
  let fixture,original,beforeAcl;
  const acl=()=>db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' f,
    has_function_privilege('skolplattform_worker',p.oid,'execute') granted,p.proacl::text acl
    from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.oid`;
  const hashes=()=>db`select
    (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.point_plans p) plans,
    (select md5(coalesce(jsonb_agg(to_jsonb(o) order by id)::text,'[]')) from public.offerings o) offerings,
    (select md5(coalesce(jsonb_agg(to_jsonb(e) order by id)::text,'[]')) from public.point_plan_events e) history,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by id)::text,'[]')) from public.school_classes c) classes,
    (select md5(coalesce(jsonb_agg(to_jsonb(p) order by id)::text,'[]')) from public.pupil_placements p) placements,
    (select md5(coalesce(jsonb_agg(to_jsonb(t) order by id)::text,'[]')) from public.timplans t) timplans,
    (select md5(coalesce(jsonb_agg(to_jsonb(c) order by unit_id,class_name,start_year)::text,'[]')) from public.class_timplans c) classbindings`;
  const check=(c,name,ok)=>c.push({name,ok:Boolean(ok)});
  const run=async(name,fn)=>{const checks=[];try{await fn(checks);}catch(e){check(checks,'executable '+(/^[A-Z0-9_]{1,40}$/u.test(e.code??'')?e.code:'TEST_FAILED'),false);}
    const status=checks.length&&checks.every(c=>c.ok)?'PASS':'FAIL';report.cases.push({name,status,checks});console.log(status+' '+name);};
  try {
    const mark=JSON.parse(readFileSync(resolve(root,'web/dist-protected/build-mode.json'),'utf8'));
    const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(mark.mode!=='protected'||!mark.revision||git(['status','--porcelain','--',...SOURCE])||git(['diff','--name-only',mark.revision,'HEAD','--',...SOURCE]))throw Error('BLOCKED_source_build');
    git(['merge-base','--is-ancestor',mark.revision,'HEAD']);
    report.sourceCommit=git(['rev-parse','HEAD']);report.workerBuildRevision=mark.revision;
    const expected=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES,...TERM_ENTRIES,...LIFECYCLE_ENTRIES];
    beforeAcl=await acl();if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),expected))throw Error('REFUSED_ACL');
    original=await hashes();fixture=await createProgramplanBrowserFixture();
    const payload=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
    await run('built-worker',async c=>{
      const r=await fetch(`${o.baseURL}/api/health/db`,{signal:AbortSignal.timeout(20000)}),b=await r.json();
      check(c,'actual built workerd and restricted DB role',r.status===200&&b.runtime==='workerd'&&b.role==='skolplattform_worker');
      check(c,'exact sixteen Worker entrypoints',exactFunctions((await acl()).filter(r=>r.granted).map(r=>r.f),expected));
      const [closed]=await db`select not has_function_privilege('skolplattform_worker','public.phase5_programplan_choice_blocks(jsonb)','execute')
        and not has_function_privilege('anon','public.phase5_programplan_choice_blocks(jsonb)','execute')
        and not has_function_privilege('authenticated','public.phase5_programplan_choice_blocks(jsonb)','execute') closed`;
      check(c,'choice helper has no Worker or client grant',closed.closed);
    });
    await run('ts-sql-parity',async c=>{
      const vectors=[];
      for(const code of ['SA25','HU25','NA25','EK25','SM25','BA25']) {
        const p=payload.programs.find(p=>p.code===code);
        const orientations=code==='SA25'?p.orientations.map(o=>o.code):[code==='HU25'?'HUSPK':code==='NA25'?'NANAA':p.orientations[0]?.code??null];
        for(const orientationCode of orientations)vectors.push({p,basis:{catalogId:fixture.catalogId,programRef:{code:p.code,version:p.version},orientationCode,startedOn:fixture.basis().startedOn,specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(p,orientationCode)}});
      }
      const sa=payload.programs.find(p=>p.code==='SA25');vectors.push({p:sa,basis:fixture.basis()});
      for(const {p,basis} of vectors) {
        const rows=programplanTermRows(p,basis).map(r=>({key:r.key,points:r.points}));
        const [sql]=await db`select public.phase5_programplan_term_rows(${db.json(basis)}) rows`;
        check(c,`${p.code}/${basis.orientationCode}/${basis.choiceBlocks?'v2':'legacy'} exact ordered TS/SQL rows`,JSON.stringify(rows)===JSON.stringify(sql.rows));
      }
      report.parityVectors=vectors.length;
    });
    await run('v2-create-save-reread',async c=>{
      const sourceBefore=await fixture.snapshot(),basis=fixture.choiceBasis();
      const created=await fixture.request(o.baseURL,fixture.hm,'/api/programplaner/skapa',{offeringId:fixture.emptyOfferingId,expectedLatestVersion:0,basisReference:basis});
      const plan=parseProgramplan(created.body);
      check(c,'v2 created through HM Worker and paired audit',created.status===200&&plan.version===1&&plan.revision===0&&JSON.stringify(plan.basisReference)===JSON.stringify(basis)
        &&await fixture.paired(created.correlationId,fixture.hm,'programplan_draft_created',plan.id));
      const program=payload.programs.find(p=>p.code==='SA25');
      const rows=programplanTermRows(program,basis),distribution=suggestProgramplanTerms(rows,[],programplanLevelRanks(program));
      check(c,'new SA rows total exactly 2500 with three alternatives and two block rows',rows.reduce((n,r)=>n+r.points,0)===2500&&rows.filter(r=>r.key.startsWith('alternative:')).length===3
        &&rows.some(r=>r.key==='block:mosp'&&r.points===200)&&rows.some(r=>r.key==='block:iv1'&&r.points===200)&&!rows.some(r=>r.key==='meta:individualChoice'));
      const saved=await fixture.request(o.baseURL,fixture.hm,'/api/programplaner/terminer',{planId:plan.id,expectedRevision:0,distribution});
      const terms=parseProgramplanTermReply(saved.body);
      check(c,'all 2500 points persisted by Worker with revision and audit',saved.status===200&&terms.revision===1&&distribution.reduce((n,r)=>n+r.points.reduce((a,b)=>a+b,0),0)===2500
        &&JSON.stringify(terms.distribution)===JSON.stringify(distribution)&&await fixture.paired(saved.correlationId,fixture.hm,'programplan_terms_changed',plan.id));
      const reread=await fixture.request(o.baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId:plan.id});
      check(c,'same v2 allocation reread by principal with paired audit',reread.status===200&&JSON.stringify(parseProgramplanTermReply(reread.body))===JSON.stringify(terms)
        &&await fixture.paired(reread.correlationId,fixture.principal,'programplan_terms_read',plan.id));
      const readPlan=await fixture.request(o.baseURL,fixture.hm,'/api/programplaner/lasa',{planId:plan.id});
      check(c,'v2 blocks remain exactly pinned on plan read',readPlan.status===200&&JSON.stringify(parseProgramplan(readPlan.body).basisReference)===JSON.stringify(basis)
        &&await fixture.paired(readPlan.correlationId,fixture.hm,'programplan_read',plan.id));
      check(c,'existing source plan unchanged',JSON.stringify(await fixture.snapshot())===JSON.stringify(sourceBefore));
      for(const r of [created,saved,reread,readPlan])report.calls.push({status:r.status,correlationId:r.correlationId});
    });
    report.complete=exactFunctions(report.cases.map(c=>c.name),BLOCK_STEP_A_CASES);
    report.status=report.complete&&report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
  }catch(e){report.error=/^(REFUSED|BLOCKED)_/u.test(e.message??'')?e.message:'TEST_FAILED';report.code=/^[A-Z0-9]{5}$/u.test(e.code??'')?e.code:null;}
  finally {
    try {
      if(fixture)report.cleanup=await fixture.cleanup();
      if(beforeAcl){assert.deepEqual(await acl(),beforeAcl);report.aclUnchanged=true;if(o.preflight)report.preflightAclRestored=true;}
      if(original){report.originalHashes=original;report.finalHashes=await hashes();assert.deepEqual(report.finalHashes,original);report.originalBusinessPreserved=true;}
      report.cleanupStatus='PASS';
    }catch{report.cleanupStatus='FAIL';report.status='FAIL';}
    await db.end({timeout:5});report.completedAt=new Date().toISOString();
    report.sourceHashes=Object.fromEntries(SOURCE.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
    mkdirSync(dirname(o.outFile),{recursive:true});writeFileSync(o.outFile,JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const r=await runBlockApi(parseBlockApiArgs(process.argv.slice(2)));
  console.log(JSON.stringify({status:r.status,passed:r.cases.filter(c=>c.status==='PASS').length,total:BLOCK_STEP_A_CASES.length,error:r.error,cleanup:r.cleanupStatus}));
  if(r.status!=='PASS')process.exitCode=1;
}
