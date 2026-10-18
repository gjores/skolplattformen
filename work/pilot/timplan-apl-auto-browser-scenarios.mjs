// Actual OIDC, Worker, SQL and browser. Only owned synthetic schema-only data.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {seedPlanningFlowFixture} from './planning-flow-fixtures.mjs';
import {aplActor} from './verify-apl-plan-commands.mjs';
import {actualAplClient} from './apl-plan-api-scenarios.mjs';
import {parseGymTimplan} from '../../web/lib/gym-timplan.ts';
import {gymTimplanGut} from '../../web/lib/gym-timplan-distribution.ts';
import {timplanTimeTotals} from '../../web/lib/timplan-time.ts';
const {expect:baseExpect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const expect=baseExpect.configure({timeout:25000}),route='/api/timplaner/gym/fordela';
const sha=v=>createHash('sha256').update(v).digest('hex');
const responseAt=response=>new URL(response.url()).pathname===route&&response.request().method()==='POST';
const parseResponse=value=>parseGymTimplan(value,value.id);
const eligible=plan=>plan.rows.filter(r=>r.rowKind==='fixed'&&['programmeSpecific','orientation','specialization'].includes(r.part)&&r.pointTerms.some(p=>p>0)).map(r=>r.key);
const request=(gym,totalHours,mode='fill-empty',apl={totalHours:345,rowKeys:eligible(gym)})=>({commandId:randomUUID(),planId:gym.id,expectedRevision:gym.revision,totalHours,mode,...(apl?{apl}:{})});
const totals=plan=>timplanTimeTotals(plan);
const assertBudget=(gym,totalHours,aplHours=345)=>{const t=totals(gym);assert.equal(t.totalMinutes,totalHours*60);assert.equal(t.aplMinutes,aplHours*60);assert.equal(t.complete,true);
 for(const row of gym.rows){for(let i=0;i<6;i++)if(row.pointTerms[i]===0)assert.equal(gym.timeRows[row.key].schoolMinutes[i],null);
  for(let y=0;y<3;y++)if(row.pointTerms[y*2]+row.pointTerms[y*2+1]===0)assert.equal(gym.timeRows[row.key].annualAplMinutes[y],null);
 }};
const assertPreserved=(before,after)=>{for(const row of before.rows){const a=before.timeRows[row.key],b=after.timeRows[row.key];
 for(let i=0;i<6;i++)if(a.schoolMinutes[i]!==null)assert.equal(b.schoolMinutes[i],a.schoolMinutes[i]);
 for(let y=0;y<3;y++)if(a.annualAplMinutes[y]!==null)assert.ok(b.annualAplMinutes[y]>=a.annualAplMinutes[y]);
}};
export async function seedTimplanAplAutoFixture(snapshot){
 const seed=await seedPlanningFlowFixture(snapshot),id=n=>seed.ids[1].slice(0,24)+String(n).padStart(12,'0');assert.equal(id(30),seed.ids[30]);
 await snapshot.db.begin(async tx=>{await aplActor(tx,{...seed,id},'principal');
  const gym=(await tx`select public.phase5_gym_timplan_result(${seed.planId}) value`)[0].value;
  const rows=Object.fromEntries(Object.keys(gym.timeRows).map(key=>[key,{schoolMinutes:[null,null,null,null,null,null],annualAplMinutes:[null,null,null]}]));
  await tx`select public.phase5_timplan_time_command(${tx.json({contractVersion:'timplan_time_v2',action:'save_rows',commandId:randomUUID(),planId:seed.planId,expectedRevision:gym.revision,rows})})`;
  await tx`set constraints all immediate`;
 });return seed;
}
export async function runTimplanAplAutoBrowserScenarios({fixture,browser,device,seed,checks,evidenceDir}){
 const contexts=[],pages={},http=[],client=actualAplClient(fixture,pages,http),errors=[];
 const result={status:'FAIL',device,retries:0,features:{annualApl:false,saveReload:false,submitWithoutPeriods:false},checks:[],screenshots:[],http,scope:fixture.scope};
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});save();};
 const capture=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(geometry.scrollWidth<=geometry.width+1);
  const file=device+'-'+name+'.png';await page.screenshot({path:path.join(evidenceDir,file),fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(path.join(evidenceDir,file))),geometry});save();};
 try{
  const context=await browser.newContext({...device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}},baseURL:fixture.baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(context);context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(45000);
  const page=pages.principal=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());await fixture.login(page,'principal');
  const original=await client.gym(seed.planId),gut=gymTimplanGut(original);assert.ok(gut?.vocational);assert.equal(totals(original).totalMinutes,0);
  await page.goto(fixture.baseURL+'/?'+new URLSearchParams({vy:'timplaner',timplan:original.id,timplansskola:original.unitId,timplansutbildning:original.offeringId,timplansversion:String(original.version),planeringslasar:String(fixture.scope.year),planeringsskola:original.unitId,planeringsform:'gymnasium',planeringsrelativar:'1',planeringsallaar:'0'}));
  await page.getByRole('button',{name:'Autofördela timmar',exact:true}).click();const modal=page.getByRole('dialog',{name:'Autofördela undervisningstid',exact:true});await expect(modal).toBeVisible();
  await expect(modal.getByLabel('Total undervisningstid (timmar)',{exact:true})).toHaveValue(String(gut.hours));
  // Labels are the final public contract of the new dialog, not implementation-only selectors.
  await expect(modal.getByRole('checkbox',{name:/^Föreslå APL-timmar/u})).toBeChecked();
  await expect(modal.getByLabel('APL totalt (timmar)',{exact:true})).toHaveValue('345');await expect(modal).toContainText('GUT');await capture(page,'apl-total-and-subjects');
  await modal.getByRole('button',{name:'Granska fördelning',exact:true}).click();await capture(page,'apl-preview');
  result.features.annualApl=true;ok('Actual empty vocational V2 draft offers 345 APL hours, GUT total and explicit subject selection without dates');
  const [response]=await Promise.all([page.waitForResponse(responseAt),modal.getByRole('button',{name:'Spara fördelning',exact:true}).click()]);assert.equal(response.status(),200);
  const q=response.request().postDataJSON(),saved=parseResponse(await response.json());assert.equal(q.apl.totalHours,345);assert.ok(q.apl.rowKeys.length>0);assert.ok(q.apl.rowKeys.every(key=>eligible(original).includes(key)));assertBudget(saved,gut.hours);
  for(const row of saved.rows)if(!q.apl.rowKeys.includes(row.key))assert.ok(saved.timeRows[row.key].annualAplMinutes.every(v=>v===null||v===0));
  await expect(modal).not.toBeVisible();await expect(page.getByText('Fördelningen är sparad. Skoltimmar och APL visas i tabellen.',{exact:true})).toBeVisible();
  await page.waitForLoadState('networkidle');await page.reload();await expect(page.getByRole('button',{name:'Autofördela timmar',exact:true})).toBeVisible();assert.deepEqual((await client.gym(saved.id)).timeRows,saved.timeRows);assert.equal((await client.read(saved.id)).detail.plan,null);
  result.features.saveReload=true;ok('One actual save persists exact GUT including 345 annual APL, complete active cells, all years and unchanged empty period plan after reload');
  const decision=page.getByRole('region',{name:'Beslut och nästa steg',exact:true});await decision.getByText('Granska och skicka',{exact:true}).click();for(const check of await decision.getByRole('checkbox').all())await check.check();
  const [submitted]=await Promise.all([page.waitForResponse(r=>new URL(r.url()).pathname==='/api/planbeslut/andra'&&r.request().method()==='POST'),decision.getByRole('button',{name:'Skicka till huvudmannen',exact:true}).click()]);assert.equal(submitted.status(),200);
  assert.equal((await client.gym(saved.id)).status,'forslag');assert.equal((await client.read(saved.id)).detail.plan,null);await expect(decision).toContainText('huvudmannen');await decision.scrollIntoViewIfNeeded();await capture(page,'submitted-without-periods');
  result.features.submitWithoutPeriods=true;ok('Rector submits the automatically allocated complete timetable through real UI without creating APL periods');assert.deepEqual(errors,[]);result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}
export async function runTimplanAplAutoApiScenarios({fixture,browser,snapshot,seed,checks,onProgress}){
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),{call}=client,db=snapshot.db;
 const ok=name=>{checks.push({name,ok:true});onProgress?.(name);};
 const persisted=async id=>JSON.parse(JSON.stringify({plan:(await db`select to_jsonb(t) value from public.timplans t where id=${id}`)[0].value,
  cells:await db`select row_key,school_minutes,annual_apl_minutes from public.timplan_time_cells_v2 where plan_id=${id} order by row_key`,
  receipts:await db`select to_jsonb(c) value from public.timplan_time_commands c where plan_id=${id} order by command_id`,events:await db`select to_jsonb(e) value from public.timplan_events e where timplan_id=${id} order by id`}));
 try{
  for(const role of ['principal','hm','principal2','admin']){const ctx=await browser.newContext({baseURL:fixture.baseURL});contexts.push(ctx);pages[role]=await ctx.newPage();onProgress?.('Actual OIDC login: '+role);await fixture.login(pages[role],role);}
  let original=await client.gym(seed.planId);const gut=gymTimplanGut(original).hours,key=eligible(original)[0],row=structuredClone(original.timeRows[key]),points=original.rows.find(r=>r.key===key).pointTerms,active=points.findIndex(p=>p>0);row.schoolMinutes[active]=0;row.annualAplMinutes[Math.floor(active/2)]=600;
  await call('principal','/api/timplaner/gym/tidsrad',{contractVersion:'timplan_time_v2',action:'save_row',commandId:randomUUID(),planId:original.id,expectedRevision:original.revision,rowKey:key,row});original=await client.gym(original.id);
  const q=request(original,gut),before=await persisted(original.id);
  await call('principal2',route,q,403);await call('hm',route,q,403);await call('principal',route,q,403,{Origin:'https://wrong.invalid'});await call('principal',route,q,409,{'X-Context-Epoch':'999999'});
  const foundation=original.rows.find(r=>r.part==='foundation').key;
  for(const apl of [null,{}, {totalHours:-1,rowKeys:[key]}, {totalHours:345.5,rowKeys:[key]}, {totalHours:'345',rowKeys:[key]}, {totalHours:345,rowKeys:[]}, {totalHours:345,rowKeys:[key,key]}, {totalHours:345,rowKeys:['unknown:row']}, {totalHours:345,rowKeys:[foundation]}, {totalHours:345,rowKeys:[key],actor:'huvudman'}])await call('principal',route,{...q,apl},400);
  assert.deepEqual(await persisted(original.id),before);ok('Actual APL auto endpoint rejects malformed or ineligible selections and enforces school, HM, origin and context without writes');
  const prep=await client.gym(seed.preparatory.planId),prepBefore=await persisted(prep.id);await call('principal',route,request(prep,2200,'fill-empty',{totalHours:345,rowKeys:[prep.rows[0].key]}),400);assert.deepEqual(await persisted(prep.id),prepBefore);ok('Preparatory programme rejects explicit APL autofill through the real API');
  const first=parseResponse(await call('principal',route,q));assertBudget(first,gut);assertPreserved(original,first);await call('principal',route,q,409);assert.deepEqual((await client.gym(first.id)).timeRows,first.timeRows);assert.equal((await client.read(first.id)).detail.plan,null);ok('Actual fill preserves explicit school zero and existing annual APL, adds only deficit to 345 hours and rejects stale revision');
  const replacement=parseResponse(await call('principal',route,request(first,gut+100,'replace')));assertBudget(replacement,gut+100);for(const r of first.rows)assert.deepEqual(replacement.timeRows[r.key].annualAplMinutes,first.timeRows[r.key].annualAplMinutes);ok('Replacing school time retains the existing annual APL exactly and keeps APL inside total');
  const lower=await client.create('Syntetisk minimitid efter APL-fördelning',first.id),lowerBefore=await persisted(lower.id);await call('principal',route,request(lower,gut-1,'replace'),400);assert.deepEqual(await persisted(lower.id),lowerBefore);const low=parseResponse(await call('principal',route,request(lower,gut-1,'replace',null)));const d=await client.decision(low.id);assert.ok(d.blockers.some(m=>m.includes('planerade undervisningstimmar')));
  await call('principal','/api/planbeslut/andra',{kind:'timplan',planId:low.id,commandId:randomUUID(),action:'submit',expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'Syntetisk kontroll',confirmedChecks:d.checks.map(c=>c.id)},409);ok('A draft below GUT remains blocked from submission even with 345 APL hours');
  await client.decide(first.id,'submit');await client.decide(first.id,'approve','hm');const locked=await client.gym(first.id);assert.equal((await client.read(first.id)).detail.plan,null);await call('principal',route,request(locked,gut+200,'replace'),403);assert.deepEqual((await client.gym(first.id)).timeRows,locked.timeRows);ok('Annual-only timetable can be approved without periods and then refuses redistribution');
  const rollback=await client.create('Syntetisk atomisk APL-fördelning',first.id),rollbackBefore=await persisted(rollback.id),rollbackQ=request(rollback,gut+200,'replace');
  const counter='apl_auto_probe_'+randomUUID().replaceAll('-','');await db.unsafe('create sequence public.'+counter);
  await db.unsafe(`create function pg_temp.fail_apl_auto_second_row() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin if new.plan_id='${rollback.id}' and nextval('public.${counter}')=2 then raise exception 'synthetic second row failure';end if;return new;end$$;create trigger apl_auto_second_row_fail before update on public.timplan_time_cells_v2 for each row execute function pg_temp.fail_apl_auto_second_row();`);
  try{await call('principal',route,rollbackQ,500);const count=(await db.unsafe('select last_value,is_called from public.'+counter))[0];assert.equal(count.is_called,true);assert.equal(Number(count.last_value),2);}
  finally{await db`drop trigger apl_auto_second_row_fail on public.timplan_time_cells_v2`;await db`drop function pg_temp.fail_apl_auto_second_row()`;await db.unsafe('drop sequence public.'+counter);}
  assert.deepEqual(await persisted(rollback.id),rollbackBefore);ok('Second-row SQL failure rolls back the entire V2 school/APL matrix, revision, events and receipt');
  await db.unsafe(`create function pg_temp.fail_apl_auto_audit() returns trigger language plpgsql as $$begin if new.customer_id='${fixture.scope.customerId}' and new.source='worker' and new.outcome='ok' and new.action='gym_timplan_hours_distributed' then raise exception 'synthetic required audit failure';end if;return new;end$$;create trigger apl_auto_audit_fail before insert on public.security_events for each row execute function pg_temp.fail_apl_auto_audit();`);
  try{assert.equal((await call('principal',route,rollbackQ,500)).code,'audit_unavailable');}finally{await db`drop trigger apl_auto_audit_fail on public.security_events`;await db`drop function pg_temp.fail_apl_auto_audit()`;}
  assert.deepEqual(await persisted(rollback.id),rollbackBefore);ok('Required Worker audit failure rolls back all automatic school and APL allocation');
  await fixture.expireMfa(pages.principal,'principal');assert.equal((await call('principal',route,rollbackQ,403)).code,'mfa_required');assert.deepEqual(await persisted(rollback.id),rollbackBefore);await fixture.login(pages.principal,'principal',{stepUp:true});const afterMfa=parseResponse(await call('principal',route,rollbackQ));assertBudget(afterMfa,gut+200);ok('Real expired MFA leaves data intact and OIDC step-up permits explicit retry');
  const race=await client.create('Syntetisk samtidig APL-fördelning',first.id);
  const races=await Promise.all([fixture.request(pages.principal,'principal',route,request(race,gut+200,'replace')),fixture.request(pages.admin,'admin',route,request(race,gut+300,'replace'))]);assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);const winner=parseResponse(races.find(r=>r.status===200).body),current=await client.gym(race.id);assert.deepEqual(current.timeRows,winner.timeRows);assert.ok([gut+200,gut+300].includes(totals(current).totalMinutes/60));ok('Concurrent actual writers produce one exact full-matrix winner and one conflict');
  await fixture.revoke('admin');await call('admin',route,request(current,gut+400,'replace'),403);assert.deepEqual((await client.gym(current.id)).timeRows,current.timeRows);ok('Revoked mandate immediately denies automatic APL allocation');
  return {status:'PASS',http,scope:fixture.scope,atomicRollback:true,auditRollback:true,sufficientBudget:true,preparatoryDenied:true,raceStatuses:races.map(r=>r.status)};
 }finally{for(const ctx of contexts)await ctx.close();}
}
