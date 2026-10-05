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
import { TIMPLAN_ENTRIES, PROGRAMPLAN_ENTRIES, WORKSPACE_ENTRIES, EDUCATION_ENTRIES, TERM_ENTRIES, LIFECYCLE_ENTRIES, BLOCK_ENTRIES, exactFunctions } from './verify-programplan-api.mjs';
import { parseProgramplan } from '../../web/lib/programplan-contract.ts';
import { parseProgramplanTermReply } from '../../web/lib/programplan-terms-contract.ts';
import { programplanTermRows, programplanLevelRanks, suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';
import { canonicalCatalogJson } from '../../web/lib/programplan-catalog.ts';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';

const root=fileURLToPath(new URL('../../',import.meta.url));
const SOURCE=['web/lib/programplan-catalog.ts','web/lib/programplan-choice-blocks.ts','web/lib/programplan-terms.ts','web/lib/programplan-terms-contract.ts','web/lib/programplan-contract.ts',
  'web/lib/protected-programplan.ts','web/lib/server/programplan-planning.ts','web/lib/server/programplan-terms.ts','web/app/protected-programplan-board.tsx','web/app/protected-programplan-flow.tsx','web/app/protected-programplan-workspace.tsx',
  'web/app/api/programplaner/skapa/route.ts','web/app/api/programplaner/lasa/route.ts','web/app/api/programplaner/terminer/route.ts','web/app/api/programplaner/terminer/lasa/route.ts',
  'supabase/migrations/20261004150000_phase5_programplan_choice_blocks.sql','supabase/migrations/20261004150100_phase5_programplan_block_numeric.sql','work/pilot/verify-programplan-blocks-api.mjs','work/pilot/phase5-programplan-browser-fixtures.mjs','web/app/api/programplaner/block/route.ts','web/lib/programplan-analysis.ts','supabase/migrations/20261004151000_phase5_programplan_block_commands.sql','supabase/migrations/20261004152000_phase5_programplan_shape_upgrade.sql','supabase/migrations/20261004153000_phase5_worker_programplan_blocks.sql'];
export const BLOCK_STEP_A_CASES=['built-worker','ts-sql-parity','v2-create-save-reread'];
export const BLOCK_STEP_B_CASES=['built-worker','blocks-save-reread','blocks-cas','block-id-retired','shape-upgrade','clone-upgrades-legacy','mfa-csrf-session','audit-rollback','direct-clients-closed','blocks-denied'];
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
  if(!['a','b'].includes(o.step))throw Error('REFUSED_step_not_implemented');
  if(o.step==='b'&&!args.includes('--out'))o.outFile=resolve(root,'work/pilot/results/phase5-23-b-api.json');
  return o;
}
export async function runBlockApi(o) {
  parseBlockApiArgs(['--step',o.step,'--base-url',o.baseURL,'--out',o.outFile,...(o.preflight?['--preflight']:[])]);
  if(o.step==='b')return runBlockStepB(o);
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
    beforeAcl=await acl();if(BLOCK_ENTRIES.every(f=>beforeAcl.some(r=>r.f===f&&r.granted)))expected.push(...BLOCK_ENTRIES);if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),expected))throw Error('REFUSED_ACL');
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
      const request=async(route,body,session=fixture.hm)=>{
        const r=await fixture.request(o.baseURL,session,route,body);
        report.calls.push({route,status:r.status,correlationId:r.correlationId,...(/^[a-z_]{1,40}$/u.test(r.body?.code??'')?{code:r.body.code}:{})});return r;
      };
      const created=await request('/api/programplaner/skapa',{offeringId:fixture.emptyOfferingId,expectedLatestVersion:0,basisReference:basis});
      const plan=parseProgramplan(created.body);
      check(c,'v2 created through HM Worker and paired audit',created.status===200&&plan.version===1&&plan.revision===0&&JSON.stringify(plan.basisReference)===JSON.stringify(basis)
        &&await fixture.paired(created.correlationId,fixture.hm,'programplan_draft_created',plan.id));
      const program=payload.programs.find(p=>p.code==='SA25');
      const rows=programplanTermRows(program,basis),distribution=suggestProgramplanTerms(rows,[],programplanLevelRanks(program));
      check(c,'new SA rows total exactly 2500 with three alternatives and two block rows',rows.reduce((n,r)=>n+r.points,0)===2500&&rows.filter(r=>r.key.startsWith('alternative:')).length===3
        &&rows.some(r=>r.key==='block:mosp'&&r.points===200)&&rows.some(r=>r.key==='block:iv1'&&r.points===200)&&!rows.some(r=>r.key==='meta:individualChoice'));
      const saved=await request('/api/programplaner/terminer',{planId:plan.id,expectedRevision:0,distribution});
      const terms=parseProgramplanTermReply(saved.body);
      check(c,'all 2500 points persisted by Worker with revision and audit',saved.status===200&&terms.revision===1&&distribution.reduce((n,r)=>n+r.points.reduce((a,b)=>a+b,0),0)===2500
        &&JSON.stringify(terms.distribution)===JSON.stringify(distribution)&&await fixture.paired(saved.correlationId,fixture.hm,'programplan_terms_changed',plan.id));
      const reread=await request('/api/programplaner/terminer/lasa',{planId:plan.id},fixture.principal);
      check(c,'same v2 allocation reread by principal with paired audit',reread.status===200&&JSON.stringify(parseProgramplanTermReply(reread.body))===JSON.stringify(terms)
        &&await fixture.paired(reread.correlationId,fixture.principal,'programplan_terms_read',plan.id));
      const readPlan=await request('/api/programplaner/lasa',{planId:plan.id});
      check(c,'v2 blocks remain exactly pinned on plan read',readPlan.status===200&&JSON.stringify(parseProgramplan(readPlan.body).basisReference)===JSON.stringify(basis)
        &&await fixture.paired(readPlan.correlationId,fixture.hm,'programplan_read',plan.id));
      check(c,'existing source plan unchanged',JSON.stringify(await fixture.snapshot())===JSON.stringify(sourceBefore));
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
  console.log(JSON.stringify({status:r.status,passed:r.cases.filter(c=>c.status==='PASS').length,total:(r.step==='b'?BLOCK_STEP_B_CASES:BLOCK_STEP_A_CASES).length,error:r.error,cleanup:r.cleanupStatus}));
  if(r.status!=='PASS')process.exitCode=1;
}

// B grants are opened temporarily for preflight, with exact compensation on every exit.
async function runBlockStepB(o) {
  const manifest=await assertTarget('protected');
  const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(manifest.dbUrl,{max:4,prepare:false,onnotice:()=>{}});
  const report={kind:'phase5-programplan-blocks-api',scope:'local-synthetic-only',step:'b',preflight:o.preflight,status:'FAIL',cases:[],calls:[],complete:false};
  let fixture,beforeAcl,original,aclTouched=false;
  const acl=()=>db`select 'public.'||p.proname||'('||array_to_string(array(select format_type(t,null) from unnest(p.proargtypes::oid[]) t),',')||')' f,has_function_privilege('skolplattform_worker',p.oid,'execute') granted,p.proacl::text acl from pg_proc p where p.pronamespace='public'::regnamespace and p.proname like 'phase5_%' order by p.oid`;
  const tables=['point_plans','point_plan_events','offerings','offering_units','timplans','timplan_cells','class_timplans','school_classes','pupil_placements','programplan_shape_upgrades'];
  const hashes=async()=>Object.fromEntries(await Promise.all(tables.map(async table=>{const [row]=await db.unsafe(`select count(*)::int count,md5(coalesce(string_agg(to_jsonb(t)::text,'' order by to_jsonb(t)::text collate "C"),'')) hash from public.${table} t`);return[table,row];})));
  const check=(c,name,ok)=>c.push({name,ok:Boolean(ok)});
  const run=async(name,fn)=>{const checks=[];try{await fn(checks);}catch(e){check(checks,'executable '+(/^[A-Z0-9_]{1,40}$/u.test(e.code??'')?e.code:'TEST_FAILED'),false);}const status=checks.length&&checks.every(c=>c.ok)?'PASS':'FAIL';report.cases.push({name,status,checks});console.log(status+' '+name);};
  try {
    const mark=JSON.parse(readFileSync(resolve(root,'web/dist-protected/build-mode.json'),'utf8'));
    const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();
    if(mark.mode!=='protected'||!mark.revision||git(['status','--porcelain','--',...SOURCE])||git(['diff','--name-only',mark.revision,'HEAD','--',...SOURCE]))throw Error('BLOCKED_source_build');
    git(['merge-base','--is-ancestor',mark.revision,'HEAD']);report.sourceCommit=git(['rev-parse','HEAD']);report.workerBuildRevision=mark.revision;
    const old=[...TIMPLAN_ENTRIES,...PROGRAMPLAN_ENTRIES,...WORKSPACE_ENTRIES,...EDUCATION_ENTRIES,...TERM_ENTRIES,...LIFECYCLE_ENTRIES],expected=[...old,...BLOCK_ENTRIES];
    beforeAcl=await acl();if(!exactFunctions(beforeAcl.filter(r=>r.granted).map(r=>r.f),o.preflight?old:expected))throw Error('REFUSED_ACL');original=await hashes();
    if(o.preflight){aclTouched=true;for(const f of BLOCK_ENTRIES)await db.unsafe(`grant execute on function ${f} to skolplattform_worker`);}
    fixture=await createProgramplanBrowserFixture();
    const call=async(session,route,body,headers={})=>{
      const r=await fetch(`${o.baseURL}/api/programplaner/${route}`,{method:'POST',headers:{'Content-Type':'application/json',Origin:o.baseURL,'Sec-Fetch-Site':'same-origin',...(session?{Cookie:`sp_session=${session.token}`,'X-Context-Epoch':String(session.epoch)}:{}),...headers},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});
      let bodyValue;try{bodyValue=await r.json();}catch{}
      const result={status:r.status,body:bodyValue,corr:r.headers.get('x-correlation-id'),cache:r.headers.get('cache-control')};report.calls.push({route,status:r.status,code:bodyValue?.code??null,correlationId:result.corr});return result;
    };
    const command=(plan,blocks,revision=plan.revision)=>({planId:plan.id,expectedRevision:revision,choiceBlocks:blocks});
    const current=async()=>{const r=await call(fixture.hm,'lasa',{planId:fixture.planId});if(r.status!==200)throw Error('READ_FAILED');return parseProgramplan(r.body);};
    const success=async(r,session,action='programplan_blocks_changed',id=fixture.planId)=>{try{parseProgramplan(r.body);}catch{return false;}return r.status===200&&r.cache==='no-store'&&await fixture.paired(r.corr,session,action,id);};
    const deny=async(c,session,body,status,headers={})=>{
      const before=await hashes(),r=await call(session,'block',body,headers);check(c,`denied ${status} without business change`,r.status===status&&JSON.stringify(await hashes())===JSON.stringify(before));
      const events=await fixture.events(r.corr);check(c,'only denied Worker audit',events.length===1&&events[0].source==='worker'&&events[0].outcome==='denied');return r;
    };
    await run('built-worker',async c=>{const r=await fetch(`${o.baseURL}/api/health/db`),b=await r.json();check(c,'actual built workerd restricted DB role',r.ok&&b.runtime==='workerd'&&b.role==='skolplattform_worker');check(c,'exact seventeen Worker entrypoints',exactFunctions((await acl()).filter(r=>r.granted).map(r=>r.f),expected));});
    await run('blocks-save-reread',async c=>{
      const before=await current(),blocks=[before.basisReference.choiceBlocks.find(b=>b.id==='mosp'),{id:'iv1',kind:'individualChoice',name:'Individuellt val 1',points:100},{id:'iv2',kind:'individualChoice',name:'Individuellt val 2',points:100},{id:'fordj1',kind:'specialization',name:'Valbar fördjupning',points:200}];
      const saved=await call(fixture.principal,'block',command(before,blocks)),reread=await current();
      check(c,'principal saves IV 2x100 and specialization with CAS and paired audit',await success(saved,fixture.principal)&&saved.body.revision===before.revision+1&&canonicalCatalogJson(saved.body.basisReference.choiceBlocks)===canonicalCatalogJson(blocks));
      check(c,'HM rereads exact persisted block identity and row keys',canonicalCatalogJson(reread.basisReference.choiceBlocks)===canonicalCatalogJson(blocks)&&reread.revision===saved.body.revision);
      const rows=programplanTermRows(JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8')).programs.find(p=>p.code===reread.basisReference.programRef.code&&p.version===reread.basisReference.programRef.version),reread.basisReference);
      check(c,'new block rows sum to 2500 with existing specialization',rows.reduce((n,r)=>n+r.points,0)===2500&&rows.some(r=>r.key==='block:iv2'&&r.points===100)&&rows.some(r=>r.key==='block:fordj1'&&r.points===200));
    });
    await run('blocks-cas',async c=>{
      const before=await current(),original=before.basisReference.choiceBlocks;
      const replies=await Promise.all([fixture.principal,fixture.second].map((session,i)=>call(session,'block',command(before,original.map(b=>b.id==='fordj1'?{...b,name:'Fördjupning '+(i+1)}:b)))));
      const winners=replies.filter(r=>r.status===200),losers=replies.filter(r=>r.status===409),after=await current();
      check(c,'one concurrent winner and one conflict',winners.length===1&&losers.length===1&&after.revision===before.revision+1);
      check(c,'winner exact basis persisted with paired audit',winners.length===1&&JSON.stringify(after.basisReference.choiceBlocks)===JSON.stringify(winners[0].body.basisReference.choiceBlocks)&&await fixture.paired(winners[0].corr,replies[0]===winners[0]?fixture.principal:fixture.second,'programplan_blocks_changed'));
      await deny(c,fixture.hm,command(before,original),409);
    });
    await run('block-id-retired',async c=>{
      const before=await current(),blocks=[...before.basisReference.choiceBlocks,{id:'retire1',kind:'specialization',name:'Tillfälligt block',points:100}];
      const added=await call(fixture.hm,'block',command(before,blocks));check(c,'new unused block saved with paired audit',await success(added,fixture.hm));
      const plan=await current(),removed=await call(fixture.principal,'block',command(plan,before.basisReference.choiceBlocks));check(c,'unallocated block removed with paired audit',await success(removed,fixture.principal));
      const after=await current();await deny(c,fixture.hm,command(after,blocks),400);
    });
    await run('shape-upgrade',async c=>{
      const [row]=await db`select count(*)::int n from public.point_plans where status='utkast' and basis_reference is not null and not basis_reference ? 'choiceBlocks'`;
      const [journal]=await db`select count(*)::int n from supabase_migrations.schema_migrations where version in('20261004151000','20261004152000')`;
      check(c,'two applied non-grant B migrations and no remaining bound legacy drafts',row.n===0&&journal.n===2);
      const [closed]=await db`select not exists(select 1 from unnest(array['anon','authenticated','skolplattform_worker','service_role']) r where has_table_privilege(r,'public.programplan_shape_upgrades','select,insert,update,delete')) closed`;
      check(c,'closed upgrade before-values log',closed.closed);
      const before=fixture.legacyBasis(),[upgraded]=await db`select public.phase5_programplan_upgrade_shape(${db.json(before)}) basis,public.phase5_programplan_upgrade_terms(${db.json(before)},'[{"rowKey":"meta:individualChoice","points":[0,0,50,50,50,50]}]'::jsonb) terms`;
      check(c,'upgrade standard blocks and remaps IV without inventing allocation',canonicalCatalogJson(upgraded.basis)===canonicalCatalogJson(fixture.basis())&&upgraded.terms.some(r=>r.rowKey==='block:iv1'&&JSON.stringify(r.points)==='[0,0,50,50,50,50]')&&!upgraded.terms.some(r=>r.rowKey==='meta:individualChoice'));
    });
    await run('clone-upgrades-legacy',async c=>{
      await fixture.seedLegacyBound();const before=await fixture.snapshot(fixture.legacyPlanId),history=await fixture.history(fixture.legacyPlanId);
      const cloned=await call(fixture.principal,'klona',{sourcePlanId:fixture.legacyPlanId,expectedSourceRevision:before.revision,expectedLatestVersion:before.version,explicitLegacyBasis:null}),cloneId=cloned.body?.id;
      check(c,'legacy source cloned into current shape and audited',await success(cloned,fixture.principal,'programplan_draft_cloned',cloneId)&&Array.isArray(cloned.body.basisReference.choiceBlocks)&&cloned.body.revision===0);
      if(cloneId){const read=await call(fixture.principal,'terminer/lasa',{planId:cloneId});check(c,'clone keeps exact old IV points on new frame',read.status===200&&read.body.distribution.some(r=>r.rowKey==='block:iv1'&&JSON.stringify(r.points)==='[0,0,50,50,50,50]')&&!read.body.distribution.some(r=>r.rowKey==='meta:individualChoice'));}
      check(c,'sealed source entire row and history unchanged',JSON.stringify(await fixture.snapshot(fixture.legacyPlanId))===JSON.stringify(before)&&JSON.stringify(await fixture.history(fixture.legacyPlanId))===JSON.stringify(history));
    });
    await run('mfa-csrf-session',async c=>{
      const plan=await current(),body=command(plan,plan.basisReference.choiceBlocks);
      await deny(c,fixture.noMfa,body,403);await deny(c,null,body,401);await deny(c,fixture.hm,body,403,{Origin:'https://foreign.invalid'});await deny(c,fixture.hm,body,409,{'X-Context-Epoch':String(fixture.hm.epoch+1)});
      const expired=await fixture.newPrincipal();await fixture.expire(expired);await deny(c,expired,body,401);
    });
    await run('audit-rollback',async c=>{
      for(const source of ['db','worker']){
        const plan=await current(),before=await hashes();await fixture.auditFailure(source,'programplan_blocks_changed');
        try{const r=await call(fixture.principal,'block',command(plan,plan.basisReference.choiceBlocks.map(b=>b.id==='fordj1'?{...b,name:'Misslyckat förslag'}:b)));check(c,source+' audit failure leaves entire business unchanged',r.status===500&&r.body?.code==='audit_unavailable'&&JSON.stringify(await hashes())===JSON.stringify(before));check(c,source+' no success audit survives',!(await fixture.events(r.corr)).some(e=>e.outcome==='ok'));}finally{await fixture.clearAuditFailure();}
      }
    });
    await run('direct-clients-closed',async c=>{
      const denied=[];for(const role of ['anon','authenticated'])try{await db.begin(async tx=>{await tx.unsafe(`set local role ${role}`);await tx`select public.phase5_replace_programplan_blocks(null::uuid,null::integer,null::jsonb)`;});denied.push('open');}catch(e){denied.push(e.code);}
      check(c,'actual direct clients denied',denied.length===2&&denied.every(v=>v==='42501'));
      const [closed]=await db`select not has_table_privilege('skolplattform_worker','public.point_plans','insert,update,delete') and not has_function_privilege('skolplattform_worker','public.phase5_programplan_upgrade_shape(jsonb)','execute') and not has_function_privilege('skolplattform_worker','public.phase5_programplan_upgrade_terms(jsonb,jsonb)','execute') closed`;check(c,'helpers and tables remain closed',closed.closed);
    });
    await run('blocks-denied',async c=>{
      const plan=await current(),blocks=plan.basisReference.choiceBlocks;await deny(c,fixture.admin,command(plan,blocks),403);await deny(c,fixture.principalB,command(plan,blocks),403);
      await deny(c,fixture.hm,command(plan,blocks.map(b=>b.id==='mosp'?{...b,points:100}:b)),400);
      await deny(c,fixture.hm,command(plan,blocks.map(b=>b.id==='iv1'?{...b,points:200}:b)),400);
      const stored=await call(fixture.principal,'terminer',{planId:plan.id,expectedRevision:plan.revision,distribution:[{rowKey:'block:fordj1',points:[0,0,100,100,0,0]}]});check(c,'allocated frame saved before orphan test',stored.status===200);
      const allocated=await current();await deny(c,fixture.hm,command(allocated,blocks.filter(b=>b.id!=='fordj1')),400);
      const started=await fixture.startedEducation();await deny(c,fixture.hm,{planId:started.planId,expectedRevision:0,choiceBlocks:fixture.basis().choiceBlocks},403);
      await fixture.seedBoundLocked();const sealed=await current();await deny(c,fixture.hm,command(sealed,blocks),403);
      // A newly injected owned legacy draft is invalid for block writes; no production rows are touched.
      await fixture.seedLegacyBound('utkast',undefined,'main');const legacy=await fixture.snapshot(fixture.planId);await deny(c,fixture.hm,{planId:fixture.planId,expectedRevision:legacy.revision,choiceBlocks:fixture.basis().choiceBlocks},400);
    });
    report.complete=exactFunctions(report.cases.map(c=>c.name),BLOCK_STEP_B_CASES);report.status=report.complete&&report.cases.every(c=>c.status==='PASS')?'PASS':'FAIL';
  }catch(e){report.error=/^(REFUSED|BLOCKED)_/u.test(e.message??'')?e.message:'TEST_FAILED';report.code=/^[A-Z0-9]{5}$/u.test(e.code??'')?e.code:null;}
  finally {
    // Compensation is attempted before cleanup and independently of its outcome.
    let cleanupFailed=false;
    try {
      if(aclTouched&&beforeAcl){await assertTarget('protected');for(const f of BLOCK_ENTRIES){const old=beforeAcl.find(r=>r.f===f);await db.unsafe(`${old.granted?'grant':'revoke'} execute on function ${f} ${old.granted?'to':'from'} skolplattform_worker`);}}
      if(beforeAcl){assert.deepEqual(await acl(),beforeAcl);report.aclUnchanged=true;if(o.preflight)report.preflightAclRestored=true;}
    }catch{cleanupFailed=true;report.aclRestoreFailed=true;}
    try{if(fixture)report.cleanup=await fixture.cleanup();}catch{cleanupFailed=true;}
    try{if(original){report.originalHashes=original;report.finalHashes=await hashes();assert.deepEqual(report.finalHashes,original);report.originalBusinessPreserved=true;}}catch{cleanupFailed=true;}
    report.cleanupStatus=cleanupFailed?'FAIL':'PASS';if(cleanupFailed)report.status='FAIL';
    await db.end({timeout:5});report.completedAt=new Date().toISOString();report.sourceHashes=Object.fromEntries(SOURCE.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));mkdirSync(dirname(o.outFile),{recursive:true});writeFileSync(o.outFile,JSON.stringify(report,null,2)+'\n');
  }
  return report;
}
