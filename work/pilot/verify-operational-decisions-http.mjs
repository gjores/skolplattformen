#!/usr/bin/env node
// Actual local OIDC sessions, read-only API checks and comparable HTTP timings.
// Passwords, cookies, names and plan IDs never enter the report.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {decisionBusinessHashes,protectedTables} from './verify-plan-decision-flow.mjs';
import {parsePlanDecisionInbox,parsePlanDecisionPage,defaultPlanDecisionQuery} from '../../web/lib/plan-decision.ts';
import {loginViaKeycloak,waitForHydration} from '../../web/e2e/helpers/keycloak.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(new URL('../../web/package.json',import.meta.url));
const {chromium}=require('@playwright/test');
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
const args=process.argv.slice(2),options={};for(let i=0;i<args.length;i+=2){assert.ok(['--mode','--out','--baseline'].includes(args[i])&&args[i+1]);options[args[i]]=args[i+1];}
const mode=options['--mode'],out=resolve(options['--out']??'');assert.ok(['before','after'].includes(mode)&&out.startsWith('/private/tmp/')&&out.endsWith('.json'));
const baseline=mode==='after'?JSON.parse(readFileSync(resolve(options['--baseline']??''),'utf8')):null;
if(baseline)assert.ok(baseline.kind==='operational-decisions-http'&&baseline.status==='PASS'&&baseline.mode==='before');
const target=await assertTarget('protected'),db=require('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
const tables=[...protectedTables,'plan_decision_reviews','plan_decision_history','plan_decision_receipts','plan_decision_write_permits','class_plan_commands'];
const before=await decisionBusinessHashes(db,tables);
if(baseline)assert.deepEqual(before,baseline.afterHashes,'REFUSED: business state differs from HTTP baseline');
const passwords=JSON.parse(readFileSync(resolve(root,'work/pilot/targets/protected/idp/phase3-users.json'),'utf8'));
const browser=await chromium.launch(),results=[],checks=[];let failure,after;
try{
 for(const username of ['p3.huvudman','p3.rektor','p3.admin']){
  const role=username.slice(3),context=await browser.newContext({baseURL:'http://127.0.0.1:3012',viewport:{width:1440,height:1000},locale:'sv-SE'});
  try{
   const page=await context.newPage();page.setDefaultTimeout(45000);
   await loginViaKeycloak(page,username,{password:passwords[username]});await waitForHydration(page);
   const session=await(await context.request.get('/api/session')).json();assert.ok(session.context&&Number.isInteger(session.epoch));
   const headers={Origin:'http://127.0.0.1:3012','X-Context-Epoch':String(session.epoch)};
   const times=[],inboxes=[];
   for(let n=0;n<3;n++){const start=performance.now(),response=await context.request.get('/api/planbeslut/inkorg',{headers});assert.equal(response.status(),200);inboxes.push(parsePlanDecisionInbox(await response.json()));times.push(performance.now()-start);}
   const inbox=inboxes[2];assert.equal(inbox.truncated,false,'Existing live synthetic scope must be fully comparable');
   const routingHash=digest([...inbox.items].sort((a,b)=>a.planId.localeCompare(b.planId))),counts={actionCount:inbox.actionCount,decisionCount:inbox.decisionCount,total:inbox.total};
   for(const previous of inboxes)assert.equal(digest([...previous.items].sort((a,b)=>a.planId.localeCompare(b.planId))),routingHash);
   if(baseline){const prior=baseline.results.find(r=>r.role===role);assert.equal(routingHash,prior.routingHash);assert.deepEqual(counts,prior.counts);checks.push({name:role+' existing routing and global counts unchanged',ok:true});}
   if(mode==='after'){
    const own=item=>['prepare','review','revise'].includes(item.task);
    const read=async patch=>{const selected={...defaultPlanDecisionQuery(),...patch},response=await context.request.post('/api/planbeslut/lista',{headers,data:selected});assert.equal(response.status(),200);return parsePlanDecisionPage(await response.json(),selected);};
    const all=await read({});assert.equal(all.count,inbox.total);assert.deepEqual({actionCount:all.actionCount,decisionCount:all.decisionCount,total:all.total},counts);
    for(const item of all.items)assert.deepEqual(item,inbox.items.find(x=>x.kind===item.kind&&x.planId===item.planId));
    checks.push({name:role+' actual page API agrees with inbox',ok:true});
    for(const stage of ['submitted','returned']){const found=await read({stage});assert.equal(found.count,inbox.items.filter(item=>item.stage===stage).length);checks.push({name:role+' '+stage+' count and rows',ok:true});}
    const mine=await read({tasks:'mine'}),waiting=await read({tasks:'waiting'});assert.equal(mine.count,inbox.items.filter(own).length);assert.equal(waiting.count,inbox.items.filter(item=>!own(item)).length);checks.push({name:role+' own and waiting counts',ok:true});
    const empty=await read({query:'operational-no-matching-synthetic-query'});assert.equal(empty.count,0);assert.equal(empty.actionCount,inbox.actionCount);checks.push({name:role+' empty search preserves global counter',ok:true});
    assert.equal((await context.request.post('/api/planbeslut/lista',{headers,data:{...defaultPlanDecisionQuery(),customerId:'forged'}})).status(),400);
    assert.equal((await context.request.post('/api/planbeslut/lista',{headers:{...headers,Origin:'https://outside.invalid'},data:defaultPlanDecisionQuery()})).status(),403);checks.push({name:role+' malformed selection and foreign origin refused',ok:true});
   }
   results.push({role,counts,routingHash,httpMilliseconds:times,medianMilliseconds:[...times].sort((a,b)=>a-b)[1]});
  }finally{await context.close();}
 }
}catch(error){failure={message:error.message,location:error.stack?.split('\n').find(line=>line.includes('verify-operational-decisions-http.mjs:'))};}
finally{await browser.close();after=await decisionBusinessHashes(db,tables);await db.end({timeout:5});}
if(JSON.stringify(before)!==JSON.stringify(after))failure={message:'Read-only verification changed business state'};
const report={kind:'operational-decisions-http',status:failure?'FAIL':'PASS',mode,actualLocalOidc:true,readOnly:true,beforeHashes:before,afterHashes:after,results,checks,failure};
writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.status}: ${results.length} local OIDC roles, ${checks.length} HTTP checks, business preservation.`);if(failure)process.exitCode=1;
