// Actual Worker, OIDC, SQL and browser; exclusively owned synthetic schema-only data.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {aplUxFixture} from './apl-ux-fixtures.mjs';
import {actualAplClient,prepareAplVariant} from './apl-plan-api-scenarios.mjs';
import {parseGymTimplan} from '../../web/lib/gym-timplan.ts';
const {expect:baseExpect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const expect=baseExpect.configure({timeout:25000});
const route='/api/timplaner/gym/fordela';
const parseResponse=value=>parseGymTimplan(value,value.id);
const sum=gym=>Object.values(gym.hours).flat().reduce((a,v)=>a+(v??0),0);
const sha=v=>createHash('sha256').update(v).digest('hex');
const responseAt=response=>new URL(response.url()).pathname===route&&response.request().method()==='POST';
const request=(gym,totalHours,mode='fill-empty')=>({planId:gym.id,expectedRevision:gym.revision,totalHours,mode});
const assertPreserved=(before,after)=>{for(const row of before.rows)for(let term=0;term<6;term++){
 if(before.hours[row.key][term]!==null)assert.equal(after.hours[row.key][term],before.hours[row.key][term]);
 if(row.pointTerms[term]===0)assert.equal(after.hours[row.key][term],null);
}};
export async function seedTimplanDistributionFixture(snapshot){
 assert.match(snapshot.provenance.database,/^named_timplan_[0-9a-f]{32}$/u);
 assert.equal((await snapshot.db`select current_database() name`)[0].name,snapshot.provenance.database);
 return snapshot.db.begin(async tx=>{
  const f=await aplUxFixture(tx);await f.actor('principal');
  const rows=await tx`select row_id,hours,allocated from public.timplan_cells where timplan_id=${f.planId} order by row_id`;
  let revision=(await tx`select revision from public.timplans where id=${f.planId}`)[0].revision,chosen=0;
  for(const row of rows){const hours=row.hours.map((_,term)=>{if(!row.allocated[term])return null;chosen++;return chosen===1?0:chosen===2?17:null;});
   revision=(await tx`select public.phase5_write_gym_timplan_row(${f.planId},${revision},${row.row_id},${tx.json(hours)}) result`)[0].result.revision;
  }
  assert.ok(chosen>2);await tx`set constraints all immediate`;
  return{ids:Object.fromEntries([1,2,10,11,12,13,20,21,22,23,30,31,46].map(n=>[n,f.id(n)])),roles:f.roles,programId:f.programId,planId:f.planId,year:f.year};
 });
}
export async function runTimplanDistributionBrowserScenarios({fixture,browser,device,snapshot,checks,evidenceDir}){
 const contexts=[],pages={},http=[],client=actualAplClient(fixture,pages,http),errors=[];
 const result={status:'FAIL',device,retries:0,checks:[],screenshots:[],http,scope:fixture.scope};
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});};
 const capture=async(page,name)=>{
  await page.evaluate(()=>document.fonts.ready);const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(geometry.scrollWidth<=geometry.width+1,'No document-wide horizontal overflow');const file=device+'-'+name+'.png';
  await page.screenshot({path:path.join(evidenceDir,file),fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(path.join(evidenceDir,file))),geometry});save();
 };
 const open=async(page,gym)=>{
  await page.goto(fixture.baseURL+'/?'+new URLSearchParams({vy:'timplaner',timplan:gym.id,timplansskola:gym.unitId,timplansutbildning:gym.offeringId,timplansversion:String(gym.version),planeringslasar:String(fixture.scope.year),planeringsskola:gym.unitId,planeringsform:'gymnasium',planeringsrelativar:'1',planeringsallaar:'0'}));
  await expect(page.getByRole('button',{name:'Autofördela timmar',exact:true})).toBeVisible();
 };
 const start=async(page)=>{await page.getByRole('button',{name:'Autofördela timmar',exact:true}).click();const modal=page.getByRole('dialog',{name:'Autofördela undervisningstid',exact:true});await expect(modal).toBeVisible();return modal;};
 const saveUi=async(page,modal)=>{
  const [response]=await Promise.all([page.waitForResponse(responseAt),modal.getByRole('button',{name:'Spara fördelning',exact:true}).click()]);
  assert.equal(response.status(),200);const body=parseResponse(await response.json());await expect(modal).not.toBeVisible();await expect(page.getByText('Fördelningen är sparad. Granska timmarna per ämne och termin.',{exact:true})).toBeVisible();return body;
 };
 try{
  const context=await browser.newContext({...device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}},baseURL:fixture.baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(context);context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(45000);
  const page=pages.principal=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());await fixture.login(page,'principal');
  const original=await client.gym(fixture.scope.planId);assert.equal(sum(original),17);await open(page,original);
  let modal=await start(page);await expect(modal.getByRole('radio',{name:/^Fyll bara tomma celler/u})).toBeChecked();
  await expect(modal).toContainText('GUT');await modal.getByLabel('Total undervisningstid (timmar)',{exact:true}).fill('2800');await capture(page,'total-and-gut');
  await modal.getByRole('button',{name:'Granska fördelning',exact:true}).click();await capture(page,'preview-fill-empty');
  const saved=await saveUi(page,modal);assert.equal(sum(saved),2800);assertPreserved(original,saved);assert.deepEqual((await client.gym(original.id)).hours,saved.hours);
  assert.ok(saved.rows.some(r=>r.pointTerms.slice(2).some((p,i)=>p>0&&saved.hours[r.key][i+2]>0)),'Whole plan allocated beyond selected first year');
  await page.reload();await expect(page.getByRole('button',{name:'Autofördela timmar',exact:true})).toBeVisible();assert.equal(sum(await client.gym(original.id)),2800);
  ok('Actual modal shows GUT, preserves explicit zero/custom value, saves exact total over all years despite year filter and reloads the same matrix');
  modal=await start(page);await modal.getByRole('radio',{name:/^Fördela om alla timmar/u}).check();await modal.getByLabel('Total undervisningstid (timmar)',{exact:true}).fill('2900');
  await modal.getByRole('button',{name:'Granska fördelning',exact:true}).click();await capture(page,'preview-replace');const replaced=await saveUi(page,modal);assert.equal(sum(replaced),2900);assert.notDeepEqual(replaced.hours,saved.hours);assert.deepEqual((await client.gym(original.id)).hours,replaced.hours);
  ok('Explicit replace mode reviews and atomically saves a new exact total');
  const hmContext=await browser.newContext({...device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}},baseURL:fixture.baseURL});contexts.push(hmContext);const hm=await hmContext.newPage();await fixture.login(hm,'hm');
  await hm.goto(page.url());await expect(hm.getByRole('region',{name:'APL-planering',exact:true})).toBeVisible();await expect(hm.getByRole('button',{name:'Autofördela timmar',exact:true})).toBeDisabled();
  ok('Huvudman read-only view disables the distribution action');
  const database=(await snapshot.db`select revision from public.timplans where id=${original.id}`)[0];assert.equal(database.revision,replaced.revision);assert.deepEqual(errors,[]);result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}
export async function runTimplanDistributionApiScenarios({fixture,browser,snapshot,checks,onProgress}){
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),{call}=client,db=snapshot.db;
 const ok=name=>{checks.push({name,ok:true});onProgress?.(name);};
 const persisted=async id=>JSON.parse(JSON.stringify({plan:(await db`select to_jsonb(t) value from public.timplans t where id=${id}`)[0].value,
  cells:await db`select row_id,hours,allocated from public.timplan_cells where timplan_id=${id} order by row_id`,events:await db`select to_jsonb(e) value from public.timplan_events e where timplan_id=${id} order by id`}));
 try{
  for(const role of ['principal','hm','principal2','admin']){const context=await browser.newContext({baseURL:fixture.baseURL});contexts.push(context);pages[role]=await context.newPage();onProgress?.('Actual OIDC login: '+role);await fixture.login(pages[role],role);}
  const original=await client.gym(fixture.scope.planId),q=request(original,2800),before=await persisted(original.id);
  await call('principal2',route,q,403);await call('hm',route,q,403);await call('principal',route,q,403,{Origin:'https://wrong.invalid'});await call('principal',route,q,409,{'X-Context-Epoch':'999999'});
  for(const totalHours of [0,-1,1.5,'2800'])await call('principal',route,{...q,totalHours},400);
  await call('principal',route,{...q,mode:'anything'},400);assert.deepEqual(await persisted(original.id),before);
  const first=parseResponse(await call('principal',route,q));assert.equal(sum(first),2800);assertPreserved(original,first);await call('principal',route,q,409);
  assert.deepEqual((await client.gym(first.id)).hours,first.hours);ok('Actual endpoint validates payload and enforces school, HM, origin, context and CAS; fill-empty preserves zero and 17 hours');
  const full=await prepareAplVariant(client,fixture,'Fördelning APL skydd');await client.command(client.saveRequest(full.gym.id,full.gym.revision,full.value));const aplBefore=await client.read(full.gym.id);
  const distributed=parseResponse(await call('principal',route,request(aplBefore.gym,3000,'replace')));assert.equal(sum(distributed),3000);const floors=new Map();for(const period of aplBefore.detail.plan.periods)for(const allocation of period.allocations){const key=allocation.rowKey+'|'+allocation.termIndex;floors.set(key,(floors.get(key)??0)+allocation.gutMinutes);}
  for(const [key,minutes]of floors){const cut=key.lastIndexOf('|');assert.ok(distributed.hours[key.slice(0,cut)][Number(key.slice(cut+1))]>=Math.ceil(minutes/60));}
  assert.deepEqual((await client.read(full.gym.id)).detail.plan,aplBefore.detail.plan);await call('principal',route,request(distributed,10,'replace'),400);assert.deepEqual((await client.gym(full.gym.id)).hours,distributed.hours);
  ok('Replacement preserves every saved APL minute floor and exact APL period data; impossible total is refused without mutation');
  const ready=await client.read(full.gym.id);await client.command(client.confirmRequest(ready.detail));await client.decide(full.gym.id,'submit');await client.decide(full.gym.id,'approve','hm');
  const locked=await client.gym(full.gym.id);await call('principal',route,request(locked,3100,'replace'),403);assert.deepEqual((await client.gym(locked.id)).hours,locked.hours);ok('Approved timetable cannot be redistributed by rector');
  const rollback=await client.create('Fördelning atomisk återställning'),rollbackBefore=await persisted(rollback.id),rollbackQ=request(rollback,3100,'replace');
  // A nontransactional probe sequence exists only in this owned disposable database.
  // PostgreSQL forbids another backend from using the owner's temporary sequence.
  const counter='distribution_probe_'+randomUUID().replaceAll('-','');assert.match(counter,/^distribution_probe_[0-9a-f]{32}$/u);
  await db.unsafe('create sequence public.'+counter);
  await db.unsafe(`create function pg_temp.fail_distribution_second_row() returns trigger language plpgsql security definer set search_path=pg_catalog as $$ begin if new.timplan_id='${rollback.id}' and nextval('public.${counter}')=2 then raise exception 'synthetic second row failure';end if;return new;end$$; create trigger distribution_second_row_fail before update on public.timplan_cells for each row execute function pg_temp.fail_distribution_second_row();`);
  try{await call('principal',route,rollbackQ,500);const count=(await db.unsafe('select last_value,is_called from public.'+counter))[0];assert.equal(count.is_called,true);assert.equal(Number(count.last_value),2);}
  finally{await db`drop trigger distribution_second_row_fail on public.timplan_cells`;await db`drop function pg_temp.fail_distribution_second_row()`;await db.unsafe('drop sequence public.'+counter);}
  assert.deepEqual(await persisted(rollback.id),rollbackBefore);ok('Injected second-row SQL failure rolls back all earlier row writes, revision changes and row events');
  await db.unsafe(`create function pg_temp.fail_distribution_audit() returns trigger language plpgsql as $$ begin if new.customer_id='${fixture.scope.customerId}' and new.source='worker' and new.outcome='ok' and new.action='gym_timplan_hours_distributed' then raise exception 'synthetic required audit failure';end if;return new;end$$;create trigger distribution_audit_fail before insert on public.security_events for each row execute function pg_temp.fail_distribution_audit();`);
  try{assert.equal((await call('principal',route,rollbackQ,500)).code,'audit_unavailable');}finally{await db`drop trigger distribution_audit_fail on public.security_events`;await db`drop function pg_temp.fail_distribution_audit()`;}
  assert.deepEqual(await persisted(rollback.id),rollbackBefore);ok('Mandatory Worker audit failure rolls back the entire distribution');
  await fixture.expireMfa(pages.principal,'principal');assert.equal((await call('principal',route,rollbackQ,403)).code,'mfa_required');assert.deepEqual(await persisted(rollback.id),rollbackBefore);await fixture.login(pages.principal,'principal',{stepUp:true});
  const afterMfa=parseResponse(await call('principal',route,rollbackQ));assert.equal(sum(afterMfa),3100);ok('Expired MFA does not change data; real OIDC step-up permits an explicit retry');
  const race=await client.create('Fördelning två samtidiga skribenter');
  const races=await Promise.all([fixture.request(pages.principal,'principal',route,request(race,3000,'replace')),fixture.request(pages.admin,'admin',route,request(race,3200,'replace'))]);
  assert.deepEqual(races.map(r=>r.status).sort(),[200,409]);const winner=races.find(r=>r.status===200),current=await client.gym(race.id);assert.deepEqual(current.hours,parseResponse(winner.body).hours);assert.ok([3000,3200].includes(sum(current)));ok('Two actual concurrent writers yield one complete winner and one conflict, with no mixed matrix');
  await fixture.revoke('admin');await call('admin',route,request(current,3300,'replace'),403);assert.deepEqual((await client.gym(current.id)).hours,current.hours);ok('Revoked mandate immediately prevents distribution');
  return{status:'PASS',http,scope:fixture.scope,atomicRollback:true,raceStatuses:races.map(r=>r.status),aplFloors:[...floors.values()]};
 }finally{for(const context of contexts)await context.close();}
}
