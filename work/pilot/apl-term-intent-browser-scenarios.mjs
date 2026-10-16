// Actual OIDC, Worker, SQL and UI. No mocked authentication, business data or transport.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {actualAplClient,prepareAplVariant,aplRoutes} from './apl-plan-api-scenarios.mjs';
import {parseAplCommandReply,parseAplStatusReply} from '../../web/lib/apl-plan.ts';
const {expect:baseExpect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const expect=baseExpect.configure({timeout:25000});
const sha=value=>createHash('sha256').update(value).digest('hex');
const responseAt=route=>response=>new URL(response.url()).pathname===route&&response.request().method()==='POST';
const termOnly=(index,year)=>({contractVersion:'structured_v1',educationForm:'unknown',classification:'unreviewed',periods:[{
 id:randomUUID(),name:'',plannedTermIndex:index,startsOn:null,endsOn:null,schoolYear:year+Math.floor(index/2),
 extent:{basis:'unknown',weeks:null,reviewed:false,reviewNote:''},contents:[],allocations:[]}]});

export async function runAplTermIntentBrowserScenarios({fixture,browser,device,snapshot,checks,evidenceDir}) {
 const settings=device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}};
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http);
 const result={status:'FAIL',device,retries:0,checks:[],screenshots:[],http,scope:fixture.scope},errors=[];
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});};
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const capture=async(page,name,target)=>{
  await page.evaluate(()=>document.fonts.ready);
  if(target)await target.evaluate(el=>{const bottom=document.querySelector('.planning-context')?.getBoundingClientRect().bottom??0;window.scrollBy(0,el.getBoundingClientRect().top-Math.max(bottom,0)-16);});
  const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(geometry.scrollWidth<=geometry.width+1,'No document-wide horizontal overflow');
  const file=device+'-'+name+'.png',output=path.join(evidenceDir,file);
  await page.screenshot({path:output,fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(output)),geometry});save();
 };
 const apl=page=>page.getByRole('region',{name:'APL-planering',exact:true});
 const open=async(page,gym)=>{
  await page.goto(fixture.baseURL+'/?'+new URLSearchParams({vy:'timplaner',timplan:gym.id,timplansskola:gym.unitId,timplansutbildning:gym.offeringId,timplansversion:String(gym.version),
   planeringslasar:String(fixture.scope.year-1),planeringsskola:gym.unitId,planeringsform:'gymnasium',planeringsallaar:'1'}));
  await expect(apl(page)).toBeVisible();await expect(apl(page)).toHaveAttribute('aria-busy','false');
 };
 const edit=async(page)=>{await apl(page).getByRole('button',{name:'Planera APL',exact:true}).click();};
 const saveUi=async(page)=>{
  await apl(page).getByRole('button',{name:'Granska ändringar',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Granska APL-planen före sparande',exact:true});await expect(dialog).toBeVisible();
  const [response]=await Promise.all([page.waitForResponse(responseAt(aplRoutes.command)),dialog.getByRole('button',{name:'Spara APL-plan',exact:true}).click()]);
  const request=response.request().postDataJSON(),body=await response.json();assert.equal(response.status(),200,body.code);
  assert.equal(request.action,'save');parseAplCommandReply(body,request);
  await expect(apl(page)).toContainText('APL-planen är sparad.');await expect(apl(page)).toHaveAttribute('aria-busy','false');return{request,reply:body};
 };
 try {
  const context=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(context);
  context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(45000);
  const p=pages.principal=await context.newPage();p.on('pageerror',e=>errors.push({message:e.message}));
  p.on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
  await fixture.login(p,'principal');await expect(p.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();
  const original=await client.gym(fixture.scope.planId);assert.equal((await client.read(original.id)).detail.plan,null);
  await open(p,original);await edit(p);await apl(p).getByRole('button',{name:'Lägg till period',exact:true}).click();
  let block=apl(p).locator('fieldset.apl-period').first();
  await expect(block.getByLabel('Årskurs',{exact:true})).toHaveValue('');await expect(block.getByLabel('Termin',{exact:true})).toHaveValue('');
  await block.getByLabel('Årskurs',{exact:true}).selectOption('2');await block.getByLabel('Termin',{exact:true}).selectOption('VT');
  await expect(block).toContainText(`${fixture.scope.year+1}/${fixture.scope.year+2}`);
  await expect(block.getByLabel('Startdatum',{exact:true})).not.toBeVisible();await expect(block.getByRole('combobox',{name:'Lägg till ämnesinnehåll',exact:true})).not.toBeVisible();
  await capture(p,'term-first',block);
  const initial=await saveUi(p),period=initial.request.plan.periods[0];
  assert.deepEqual(period,{...termOnly(3,fixture.scope.year).periods[0],id:period.id});
  let read=await client.read(original.id);assert.deepEqual(read.detail.plan,initial.request.plan);assert.equal(read.projection.readyForConfirmation,false);
  assert.deepEqual(read.gym.hours,original.hours);
  const raw=(await snapshot.db`select id::text,planned_term_index,starts_on,ends_on,name from public.apl_plan_periods where id=${period.id}`)[0];
  assert.deepEqual(raw,{id:period.id,planned_term_index:3,starts_on:null,ends_on:null,name:''});
  await p.reload();await expect(apl(p)).toHaveAttribute('aria-busy','false');await expect(apl(p).getByRole('button',{name:'Bekräfta förläggningen',exact:true})).toBeDisabled();
  await edit(p);block=apl(p).locator('fieldset.apl-period').first();
  await expect(block.getByLabel('Årskurs',{exact:true})).toHaveValue('2');await expect(block.getByLabel('Termin',{exact:true})).toHaveValue('VT');
  assert.equal((await client.read(original.id)).detail.plan.periods[0].id,period.id);await capture(p,'term-reloaded',block);
  ok('Only year 2 and spring term saved through UI; same UUID, no dates/name/contents/allocations or invented weeks after reload; year ignores differing view filter');
  await block.locator('summary').filter({hasText:/^Datum och omfattning$/u}).click();
  const start=`${fixture.scope.year+2}-01-15`,end=`${fixture.scope.year+2}-02-15`;
  await block.getByLabel('Startdatum',{exact:true}).fill(start);await block.getByLabel('Slutdatum',{exact:true}).fill(end);
  await block.getByLabel('Periodens namn',{exact:true}).fill('APL med pedagogisk fördjupning');
  await block.locator('summary').filter({hasText:/^Ämnesinnehåll och undervisningstid$/u}).click();
  const row=original.rows.find(r=>r.rowKind==='fixed'&&r.pointTerms[3]>0&&(original.hours[r.key][3]??0)>=1);
  assert.ok(row,'Synthetic fixture needs a real subject in year 2 spring');
  await block.getByRole('combobox',{name:'Lägg till ämnesinnehåll',exact:true}).selectOption(row.key);await block.getByLabel('Arbetsmoment',{exact:true}).fill('Planera pedagogiska aktiviteter tillsammans med handledaren.');
  const content=block.locator('.apl-content').first();await expect(content.locator('.apl-allocation')).toHaveCount(1);
  await content.getByLabel(/APL timmar$/u).fill('1');await capture(p,'details-later',block);
  const precise=await saveUi(p);read=await client.read(original.id);assert.equal(read.detail.plan.periods[0].id,period.id);
  assert.equal(read.detail.plan.periods[0].startsOn,start);assert.equal(read.detail.plan.periods[0].endsOn,end);assert.equal(read.detail.plan.periods[0].extent.weeks,null);
  assert.deepEqual(read.detail.plan.periods[0].allocations,[{rowKey:row.key,termIndex:3,gutMinutes:60}]);assert.deepEqual(read.detail.plan,precise.request.plan);
  await p.reload();await expect(apl(p)).toHaveAttribute('aria-busy','false');await edit(p);block=apl(p).locator('fieldset.apl-period').first();
  await block.getByLabel('Termin',{exact:true}).selectOption('HT');await expect(block).toContainText('Uppgifterna är kvar');await expect(block.locator('.apl-saved-times')).toContainText('1 h');
  // The real MFA boundary exercises the browser's own durable pending-request journal.
  await fixture.expireMfa(p,'principal');
  await apl(p).getByRole('button',{name:'Granska ändringar',exact:true}).click();
  const review=p.getByRole('dialog',{name:'Granska APL-planen före sparande',exact:true});
  const [denied]=await Promise.all([p.waitForResponse(responseAt(aplRoutes.command)),review.getByRole('button',{name:'Spara APL-plan',exact:true}).click()]);
  assert.equal(denied.status(),403);assert.equal((await denied.json()).code,'mfa_required');const pending=denied.request().postDataJSON();
  assert.equal(pending.plan.periods[0].plannedTermIndex,2);
  const journals=await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('apl-plan:')).map(k=>JSON.parse(sessionStorage.getItem(k))));
  assert.equal(journals.length,1);assert.deepEqual(journals[0].request,pending);
  await fixture.login(p,'principal',{stepUp:true,returnTo:new URL(p.url()).pathname+new URL(p.url()).search});
  await expect(apl(p).getByRole('button',{name:'Läs sparstatus',exact:true})).toBeEnabled();
  const [statusResponse]=await Promise.all([p.waitForResponse(responseAt(aplRoutes.status)),apl(p).getByRole('button',{name:'Läs sparstatus',exact:true}).click()]);
  assert.equal(statusResponse.status(),200);assert.equal((await statusResponse.json()).state,'not_found');assert.deepEqual(statusResponse.request().postDataJSON(),{command:pending});
  const [retry]=await Promise.all([p.waitForResponse(responseAt(aplRoutes.command)),apl(p).getByRole('button',{name:'Skicka samma sparförsök igen',exact:true}).click()]);
  assert.equal(retry.status(),200);assert.deepEqual(retry.request().postDataJSON(),pending);parseAplCommandReply(await retry.json(),pending);
  await expect(apl(p)).toContainText('APL-planen är sparad.');
  assert.deepEqual(await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('apl-plan:'))),[]);
  const moved=(await client.read(original.id)).detail.plan.periods[0];assert.equal(moved.plannedTermIndex,2);
  assert.equal(moved.startsOn,start);assert.equal(moved.endsOn,end);assert.deepEqual(moved.allocations,read.detail.plan.periods[0].allocations);
  ok('Later date/content targets selected term; intent change preserves dates/minutes through real expired MFA, OIDC step-up and exact browser journal retry');
  // Older payload has no plannedTermIndex and may legitimately span two terms.
  const older=await prepareAplVariant(client,fixture,'APL UX äldre flerminperiod');
  const second=older.gym.rows.find(r=>r.rowKind==='fixed'&&r.pointTerms[1]>0&&(older.gym.hours[r.key][1]??0)>=1);assert.ok(second);
  const multi=structuredClone(older.value);multi.periods[0].endsOn=`${fixture.scope.year+1}-02-15`;
  multi.periods[0].extent={basis:'mixed_weeks',weeks:null,reviewed:false,reviewNote:'Äldre period som går över två terminer.'};
  if(!multi.periods[0].contents.some(c=>c.rowKey===second.key))multi.periods[0].contents.push({rowKey:second.key,description:'Arbetsmoment på vårterminen.'});
  multi.periods[0].allocations.push({rowKey:second.key,termIndex:1,gutMinutes:60});
  await client.command(client.saveRequest(older.gym.id,older.gym.revision,multi));
  const beforeMulti=(await client.read(older.gym.id)).detail.plan, multiId=multi.periods[0].id, multiIndex=beforeMulti.periods.findIndex(period=>period.id===multiId);
  assert.ok(multiIndex>=0);const beforePeriod=beforeMulti.periods[multiIndex];assert.ok(beforePeriod.allocations.some(a=>a.termIndex===1&&a.gutMinutes===60));
  await open(p,older.gym);await edit(p);block=apl(p).locator('fieldset.apl-period').nth(multiIndex);
  await expect(block.getByLabel('Periodens namn',{exact:true})).toHaveValue(beforePeriod.name);
  await expect(block.getByLabel('Årskurs',{exact:true})).toHaveValue('');await expect(block.getByLabel('Termin',{exact:true})).toHaveValue('');
  await expect(block.locator('.apl-saved-times')).toContainText('Åk 1 VT: 1 h 0 min');
  await block.getByLabel('Periodens namn',{exact:true}).fill('Äldre flerminperiod – förtydligat namn');await capture(p,'legacy-multi-term',block);
  await saveUi(p);const kept=(await client.read(older.gym.id)).detail.plan;
  assert.deepEqual(kept.periods.find(period=>period.id===multiId),{...beforePeriod,name:'Äldre flerminperiod – förtydligat namn'});
  assert.deepEqual(kept.periods.filter(period=>period.id!==multiId),beforeMulti.periods.filter(period=>period.id!==multiId));
  ok('Older two-term period opens without automatic intent and saves changed name while retaining both terms and exact date/allocation payload');
  assert.deepEqual(errors,[]);result.planIds={termOnly:original.id,olderMulti:older.gym.id};result.periodId=period.id;result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}

export async function runAplTermIntentApiScenarios({fixture,browser,snapshot,checks}) {
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),{call}=client,db=snapshot.db;
 const ok=name=>checks.push({name,ok:true});
 try {
  for(const role of ['principal','hm','principal2','admin']){
   const context=await browser.newContext({baseURL:fixture.baseURL});contexts.push(context);pages[role]=await context.newPage();await fixture.login(pages[role],role);
  }
  const original=await client.gym(fixture.scope.planId);
  const draft=await client.create('APL UX preliminärt'),value=termOnly(3,fixture.scope.year),request=client.saveRequest(draft.id,draft.revision,value);
  await call('principal2',aplRoutes.read,{planId:draft.id},403);await call('hm',aplRoutes.command,request,403);
  await call('principal',aplRoutes.command,request,403,{Origin:'https://wrong.invalid'});await call('principal',aplRoutes.command,request,409,{'X-Context-Epoch':'999999'});
  const saved=await client.command(request),reread=await client.read(draft.id);assert.deepEqual(reread.detail.plan,value);
  assert.equal(reread.projection.readyForConfirmation,false);await call('principal',aplRoutes.command,client.confirmRequest(reread.detail),409);
  assert.deepEqual((await client.read(draft.id,'hm')).detail.capabilities,{canSave:false,canConfirm:false});
  ok('Actual term-only HTTP save/read persists intent; incomplete confirmation, other school, HM mutation, wrong origin and stale context are denied');
  const newer=structuredClone(value);newer.periods[0].plannedTermIndex=2;
  const changed=await client.command(client.saveRequest(draft.id,saved.detail.revision,newer),'admin');assert.notEqual(changed.detail.contentHash,saved.detail.contentHash);
  await call('principal',aplRoutes.command,client.saveRequest(draft.id,saved.detail.revision,value),409);
  const status=parseAplStatusReply(await call('principal',aplRoutes.status,{command:request}),{command:request});assert.equal(status.state,'completed');
  assert.deepEqual(status.result.detail.plan,value);assert.equal((await client.command(request)).receipt.replayed,true);assert.deepEqual((await client.read(draft.id)).detail.plan,newer);
  ok('Term intent changes content hash; CAS and immutable original request/status replay preserve the newer saved term');
  const full=await prepareAplVariant(client,fixture,'APL UX bekräftelse och beslut');
  const oldRequest=client.saveRequest(full.gym.id,full.gym.revision,full.value),old=await client.command(oldRequest);
  assert.ok(old.detail.plan.periods.every(p=>!Object.hasOwn(p,'plannedTermIndex')));
  await client.command(client.confirmRequest(old.detail));let current=await client.read(full.gym.id);assert.equal((await client.decision(full.gym.id)).apl.ready,true);
  const intended=structuredClone(current.detail.plan),intentId=full.value.periods[0].id,intentPeriod=intended.periods.find(period=>period.id===intentId);
  assert.ok(intentPeriod);intentPeriod.plannedTermIndex=1;const intentName=intentPeriod.name;
  await client.command(client.saveRequest(full.gym.id,current.detail.revision,intended));current=await client.read(full.gym.id);
  assert.notEqual(current.detail.contentHash,old.detail.contentHash);assert.equal((await client.decision(full.gym.id)).apl.ready,false);
  await call('admin',aplRoutes.command,client.confirmRequest(current.detail),403);
  const oldReplay=await client.command(oldRequest);assert.equal(oldReplay.receipt.replayed,true);assert.deepEqual(oldReplay.detail.plan,old.detail.plan);assert.equal(oldReplay.detail.contentHash,old.detail.contentHash);
  assert.equal((await client.read(full.gym.id)).detail.plan.periods.find(p=>p.id===intentId).plannedTermIndex,1);
  await client.command(client.confirmRequest(current.detail));await client.decide(full.gym.id,'submit');await client.decide(full.gym.id,'return','hm','Syntetisk granskning av förläggning.');
  await client.decide(full.gym.id,'submit');assert.equal((await client.decide(full.gym.id,'approve','hm')).stage,'approved');
  ok('Old no-intent receipt keeps its exact saved plan/hash; changed intent invalidates rector confirmation; renewed rector event and separate HM return/approval remain required');
  const copied=await client.create('APL UX kopia med terminsavsikt',full.gym.id),copy=await client.read(copied.id);
  assert.equal(copy.detail.plan.periods.find(p=>p.name===intentName).plannedTermIndex,1);assert.equal(copy.detail.confirmations.length,0);
  assert.ok(copy.detail.plan.periods.every(p=>!intended.periods.some(old=>old.id===p.id)));assert.ok(copy.detail.plan.periods.every(p=>!p.extent.reviewed));
  const approved=await client.gym(full.gym.id),source=approved.source;
  const next=await call('principal','/api/timplaner/gym/skapa',{commandId:randomUUID(),sourcePlanId:source.planId,expectedSourceRevision:source.revision,
   expectedEducationRevision:source.educationRevision,unitId:approved.unitId,predecessorPlanId:approved.id,expectedPredecessorRevision:approved.revision});
  const version=await client.read(next.id);assert.equal(version.gym.version,approved.version+1);assert.equal(version.gym.series.id,approved.series.id);
  assert.equal(version.detail.plan.periods.find(p=>p.name===intentName).plannedTermIndex,1);assert.equal(version.detail.confirmations.length,0);
  assert.ok(version.detail.plan.periods.every(p=>!intended.periods.some(old=>old.id===p.id)));assert.ok(version.detail.plan.periods.every(p=>!p.extent.reviewed));
  ok('Named copy and next version preserve coarse intent with new period UUIDs, mandatory review and no rector confirmation');
  const rollback=await client.create('APL UX auditåterställning'),rollbackRequest=client.saveRequest(rollback.id,rollback.revision,termOnly(0,fixture.scope.year));
  const before=(await db`select count(*)::int n from public.apl_plan_commands where plan_id=${rollback.id}`)[0].n;
  await db.unsafe(`create function pg_temp.fail_apl_ux_http_audit() returns trigger language plpgsql as $$begin if new.customer_id='${fixture.scope.customerId}' and new.source='worker' and new.action='apl_plan_command' and new.outcome='ok' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger apl_ux_http_audit_fail before insert on public.security_events for each row execute function pg_temp.fail_apl_ux_http_audit();`);
  try{assert.equal((await call('principal',aplRoutes.command,rollbackRequest,500)).code,'audit_unavailable');}
  finally{await db`drop trigger apl_ux_http_audit_fail on public.security_events`;}
  assert.equal((await db`select count(*)::int n from public.apl_plan_commands where plan_id=${rollback.id}`)[0].n,before);assert.equal((await client.read(rollback.id)).detail.plan,null);
  await fixture.expireMfa(pages.principal,'principal');assert.equal((await call('principal',aplRoutes.command,rollbackRequest,403)).code,'mfa_required');
  await fixture.login(pages.principal,'principal',{stepUp:true});await client.command(rollbackRequest);
  await fixture.revoke('admin');await call('admin',aplRoutes.read,{planId:draft.id},403);await call('admin',aplRoutes.status,{command:request},403);
  assert.deepEqual((await client.gym(original.id)).hours,original.hours);assert.equal((await client.read(original.id)).detail.plan,null);
  ok('Required Worker audit failure rolls back intent/receipt; real expired MFA requires OIDC step-up; revoked membership denies reads/status; untouched seed plan remains exact');
  return {status:'PASS',http,scope:fixture.scope,originalPreserved:true};
 }finally{for(const context of contexts)await context.close();}
}
