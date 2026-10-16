// Actual OIDC -> Worker -> PostgreSQL. No transport, authentication or business mocks.
import assert from 'node:assert/strict';
import { randomUUID,createHash } from 'node:crypto';
import { readFileSync,writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { actualAplClient,aplRoutes } from './apl-plan-api-scenarios.mjs';
import { parseTimplanTimeReply } from '../../web/lib/timplan-time-command.ts';
const {expect:baseExpect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const expect=baseExpect.configure({timeout:25000}),sha=v=>createHash('sha256').update(v).digest('hex');
const at=(route,method='POST')=>res=>new URL(res.url()).pathname===route&&res.request().method()===method;
const total=plan=>Object.values(plan.timeRows).flatMap(r=>[...r.schoolMinutes,...r.annualAplMinutes]).reduce((n,v)=>n+(v??0),0);
export async function runAplAnnualBrowserScenarios({fixture,browser,device,snapshot,seed,checks,evidenceDir}){
 const settings=device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}};
 const pages={},contexts=[],http=[],errors=[],client=actualAplClient(fixture,pages,http);
 const result={status:'FAIL',device,retries:0,features:{transition:false,annualBudget:false,laterPeriod:false,preparatoryNoApl:false,newPlan:false},checks:[],screenshots:[],http,scope:fixture.scope};
 let phase='login';
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});save();};
 const capture=async(page,name,target)=>{await page.evaluate(()=>document.fonts.ready);if(target)await target.evaluate(el=>{const b=document.querySelector('.planning-context')?.getBoundingClientRect().bottom??0;window.scrollBy(0,el.getBoundingClientRect().top-Math.max(b,0)-16);});
  const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(geometry.scrollWidth<=geometry.width+1,'No document overflow');
  const file=device+'-'+name+'.png';await page.screenshot({path:path.join(evidenceDir,file),fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(path.join(evidenceDir,file))),geometry});save();};
 const observe=page=>page.on('pageerror',e=>{const u=new URL(page.url());errors.push({message:e.message,phase,origin:u.origin,pathname:u.pathname});});
 const navigate=async(page,gym)=>{await page.waitForLoadState('networkidle');await page.goto(fixture.baseURL+'/?'+new URLSearchParams({vy:'timplaner',timplan:gym.id,timplansskola:gym.unitId,timplansutbildning:gym.offeringId,timplansversion:String(gym.version),planeringslasar:String(fixture.scope.year),planeringsskola:gym.unitId,planeringsform:'gymnasium',planeringsallaar:'1'}));};
 try{
  const ctx=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(ctx);ctx.setDefaultTimeout(25000);ctx.setDefaultNavigationTimeout(45000);
  const page=pages.principal=await ctx.newPage();observe(page);page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  await fixture.login(page,'principal');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await page.waitForLoadState('networkidle');
  phase='legacy-transition';const original=await client.gym(fixture.scope.planId),beforeMinutes=Object.values(original.hours).flat().reduce((n,v)=>n+(v??0)*60,0);
  await navigate(page,original);await page.getByRole('button',{name:'Granska byte till skola och APL',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Granska byte till skola och APL',exact:true});await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Byt till skola och APL',exact:true})).toBeDisabled();await capture(page,'transition-review');
  await dialog.getByRole('checkbox',{name:'Jag har granskat hela uppdelningen, inklusive föreslagen noll-APL och eventuell APL som ännu inte registrerats.',exact:true}).check();
  const [transitionResponse]=await Promise.all([page.waitForResponse(at('/api/timplaner/gym/tidsmodell','PUT')),dialog.getByRole('button',{name:'Byt till skola och APL',exact:true}).click()]);
  assert.equal(transitionResponse.status(),200);const transitionRequest=transitionResponse.request().postDataJSON(),transitionBody=await transitionResponse.json();parseTimplanTimeReply(transitionBody,transitionRequest);
  const transitioned=await client.gym(original.id);assert.equal(transitioned.timeModel,'school_terms_annual_apl_v2');assert.equal(total(transitioned),beforeMinutes);assert.ok(!('hours' in transitioned));
  assert.equal((await snapshot.db`select count(*)::int n from public.apl_plan_periods where plan_id=${original.id}`)[0].n,0);
  await expect(page.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true})).toBeVisible();await capture(page,'transition-complete',page.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true}));
  result.features.transition=true;ok('Explicit reviewed legacy transition preserves total and old cells without creating periods');
  phase='new-vocational-plan';const source=transitioned.source;
  const made=await client.call('principal','/api/timplaner/gym/planer/skapa',{commandId:randomUUID(),sourcePlanId:source.planId,expectedSourceRevision:source.revision,expectedEducationRevision:source.educationRevision,unitId:transitioned.unitId,name:'Syntetisk års-APL '+device,copyFromPlanId:null,expectedCopyFromRevision:null});
  let gym=await client.gym(made.id);assert.equal(gym.timeModel,'school_terms_annual_apl_v2');assert.ok(Object.values(gym.timeRows).every(r=>[...r.schoolMinutes,...r.annualAplMinutes].every(v=>v===null)));
  await navigate(page,gym);const table=page.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true});await expect(table).toBeVisible();result.features.newPlan=true;ok('A new vocational plan starts with separate empty school and annual APL fields');
  const row=gym.rows.find(r=>r.pointTerms[0]>0&&r.pointTerms[1]>0&&r.rowKind==='fixed');assert.ok(row,'fixture needs two active school terms');
  // Data keys are stable model identifiers, not text guesses in potentially duplicated subject names.
  const cell=index=>table.locator('input[data-time-cell="'+index+'"][data-row='+JSON.stringify(row.key)+']');
  const ht=cell(0),vt=cell(1),annual=cell(6);await ht.fill('20');await vt.fill('20');await annual.fill('60');
  const [rowResponse]=await Promise.all([page.waitForResponse(at('/api/timplaner/gym/tidsrad')),annual.press('Enter')]);assert.equal(rowResponse.status(),200);const rowRequest=rowResponse.request().postDataJSON();parseTimplanTimeReply(await rowResponse.json(),rowRequest);
  gym=await client.gym(gym.id);assert.equal(gym.timeRows[row.key].schoolMinutes[0],1200);assert.equal(gym.timeRows[row.key].schoolMinutes[1],1200);assert.equal(gym.timeRows[row.key].annualAplMinutes[0],3600);assert.equal(total(gym),6000);
  assert.equal((await snapshot.db`select count(*)::int n from public.apl_plan_periods where plan_id=${gym.id}`)[0].n,0);
  await page.waitForLoadState('networkidle');await page.reload();await expect(table).toBeVisible();await expect(cell(0)).toHaveValue('20');await expect(cell(1)).toHaveValue('20');await expect(cell(6)).toHaveValue('60');
  await expect(page.getByText('Hela planen: 100 h',{exact:true})).toBeVisible();await capture(page,'annual-budget-reloaded',table);result.features.annualBudget=true;ok('UI saves and reloads HT20 + VT20 + annualAPL60 =100h with no period or date');
  phase='later-period';const apl=page.getByRole('region',{name:'APL-planering',exact:true});await expect(apl).toBeVisible();await apl.getByRole('button',{name:'Förlägg APL i perioder',exact:true}).click();await apl.getByRole('button',{name:'Lägg till period',exact:true}).click();
  const period=apl.locator('fieldset.apl-period').first();await period.getByLabel('Årskurs',{exact:true}).selectOption('1');await period.getByLabel('Termin',{exact:true}).selectOption('HT');
  await apl.getByRole('button',{name:'Granska ändringar',exact:true}).click();const review=page.getByRole('dialog',{name:'Granska APL-planen före sparande',exact:true});await expect(review).toBeVisible();
  const [periodResponse]=await Promise.all([page.waitForResponse(at(aplRoutes.command)),review.getByRole('button',{name:'Spara APL-plan',exact:true}).click()]);assert.equal(periodResponse.status(),200);
  const coarse=periodResponse.request().postDataJSON().plan;assert.equal(coarse.periods[0].startsOn,null);assert.equal(coarse.periods[0].endsOn,null);
  let aplRead=await client.read(gym.id);const planned=structuredClone(aplRead.detail.plan);planned.periods[0].contents=[{rowKey:row.key,description:'Syntetiska arbetsmoment som planeras senare'}];planned.periods[0].allocations=[{rowKey:row.key,termIndex:0,gutMinutes:2400}];
  await client.command(client.saveRequest(gym.id,aplRead.detail.revision,planned));aplRead=await client.read(gym.id);assert.equal(total(aplRead.gym),6000);assert.deepEqual(aplRead.gym.timeRows,gym.timeRows);assert.equal(aplRead.projection.readyForConfirmation,false);
  assert.equal((await snapshot.db`select sum(gut_minutes)::int minutes from public.apl_time_allocations where plan_id=${gym.id}`)[0].minutes,2400);
  await page.waitForLoadState('networkidle');await page.reload();await expect(apl).toHaveAttribute('aria-busy','false');await expect(apl.getByRole('region',{name:'Årsram och förläggning',exact:true})).toContainText('Förlagt 40 h');await expect(apl.getByRole('region',{name:'Årsram och förläggning',exact:true})).toContainText('Kvar att förlägga 20 h');await capture(page,'later-period',apl);
  result.features.laterPeriod=true;ok('A coarse period can be added later; 40h actual API placement consumes its annual budget, with20h remaining and total remains100h');
  phase='guards';await client.call('principal','/api/timplaner/gym/tidsrad',{...rowRequest,commandId:randomUUID(),expectedRevision:aplRead.gym.revision,row:{...gym.timeRows[row.key],annualAplMinutes:[2399,...gym.timeRows[row.key].annualAplMinutes.slice(1)]}},400);
  await client.call('principal','/api/timplaner/gym/rad',{planId:gym.id,expectedRevision:aplRead.gym.revision,rowKey:row.key,hours:[20,20,null,null,null,null]},400);
  const recovered=await client.call('principal','/api/timplaner/gym/tidsstatus',{command:rowRequest});assert.equal(recovered.state,'completed');assert.equal(recovered.result.receipt.replayed,true);assert.deepEqual(recovered.result.plan.timeRows,gym.timeRows);
  ok('Protected API rejects annual under-budget and legacy writes; original row request replays its exact frozen result');
  phase='preparatory';const prep=await client.gym(seed.preparatory.planId);assert.ok('hours' in prep);await navigate(page,prep);await expect(page.getByRole('heading',{name:prep.series?.name??prep.source.education.name,exact:true})).toBeVisible();const schoolOnly=page.getByRole('region',{name:'Skolans undervisningstid',exact:true});await expect(schoolOnly).toBeVisible();await expect(schoolOnly.locator('input.gt-term-input').first()).toBeEnabled();await expect(page.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true})).toHaveCount(0);await expect(page.getByRole('region',{name:'APL-planering',exact:true})).toHaveCount(0);
  await client.call('principal',aplRoutes.command,{contractVersion:'structured_v1',action:'save',commandId:randomUUID(),planId:prep.id,expectedRevision:prep.revision,copyReviewResolutions:[],plan:{contractVersion:'structured_v1',educationForm:'school_based',classification:'unreviewed',periods:[]}},400);
  await capture(page,'preparatory-school-only',schoolOnly);result.features.preparatoryNoApl=true;ok('Higher-education preparatory plan has no APL columns/panel and rejects APL writes on the server');
  phase='huvudman-login';const hmContext=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',reducedMotion:'reduce'});contexts.push(hmContext);const hm=pages.hm=await hmContext.newPage();observe(hm);await fixture.login(hm,'hm');await expect(hm.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await hm.waitForLoadState('networkidle');phase='huvudman-read';await navigate(hm,gym);
  await expect(hm.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true})).toBeVisible();await expect(hm.locator('input[data-time-cell]')).toHaveCount(0);await capture(hm,'huvudman-readonly',hm.getByRole('region',{name:'Skoltid och APL per årskurs',exact:true}));ok('Huvudman reads the minute budget without rector editing rights');
  assert.deepEqual(errors,[]);result.planId=gym.id;result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}
