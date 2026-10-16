// Real browser UI and HTTP. One explicitly labelled transport fault forwards a real
// save to the Worker, waits for its actual 200 receipt, then drops only that response.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {actualAplClient,prepareAplVariant,aplRoutes} from './apl-plan-api-scenarios.mjs';
import {parseAplCommandReply} from '../../web/lib/apl-plan.ts';
const {expect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const sha=value=>createHash('sha256').update(value).digest('hex');
const responseAt=route=>response=>new URL(response.url()).pathname===route&&response.request().method()==='POST';
export async function runAplBrowserScenarios({fixture,browser,device,snapshot,checks,evidenceDir}) {
 const settings=device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}};
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),db=snapshot.db;
 const result={status:'FAIL',device,checks:[],screenshots:[],http,transportFaults:[],scope:fixture.scope},errors=[];
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});};
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const capture=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(geometry.scrollWidth<=geometry.width+1,'No document-wide horizontal overflow');const file=device+'-'+name+'.png',output=path.join(evidenceDir,file);
  const modal=page.getByRole('dialog');if(await modal.count()){assert.equal(await modal.evaluate(el=>getComputedStyle(el).position),'fixed','Production dialog requires generated positioning styles');}else{const panel=page.getByRole('region',{name:'APL-planering',exact:true});if(await panel.count()){
    await panel.evaluate(el=>el.scrollIntoView({block:'start'}));
    const clearance=await page.evaluate(()=>{const panel=document.getElementById('apl-planering'),bar=document.querySelector('.planning-context');return{sectionTop:panel.getBoundingClientRect().top,barBottom:bar?.getBoundingClientRect().bottom??0};});
    assert.ok(clearance.sectionTop>=clearance.barBottom,'APL heading must remain below the sticky planning controls');Object.assign(geometry,clearance);
   }}
  await page.screenshot({path:output,fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(output)),geometry});save();};
 const url=gym=>'/?'+new URLSearchParams({vy:'timplaner',timplan:gym.id,timplansskola:gym.unitId,timplansutbildning:gym.offeringId,timplansversion:String(gym.version),
  planeringslasar:String(fixture.scope.year),planeringsskola:gym.unitId,planeringsform:'gymnasium',planeringsallaar:'1'});
 const apl=page=>page.getByRole('region',{name:'APL-planering',exact:true}),decision=page=>page.getByRole('region',{name:'Beslut och nästa steg',exact:true});
 const open=async(page,gym)=>{await page.goto(fixture.baseURL+url(gym));await expect(apl(page)).toBeVisible();await expect(apl(page)).toHaveAttribute('aria-busy','false');await expect(decision(page)).toHaveAttribute('aria-busy','false');};
 const post=async(page,route,action)=>{const [response]=await Promise.all([page.waitForResponse(responseAt(route)),action()]);
  const body=await response.json();assert.equal(response.status(),200,route+': '+body.code);return{body,request:response.request().postDataJSON()};};
 const confirmUi=async(page)=>{await apl(page).getByRole('button',{name:'Bekräfta förläggningen',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Bekräfta förläggningen',exact:true});
  await dialog.getByLabel('Rektors kommentar',{exact:true}).fill('Perioder, ämnesinnehåll och inkluderad undervisningstid är granskade.');
  const response=await post(page,aplRoutes.command,()=>dialog.getByRole('button',{name:'Bekräfta förläggningen',exact:true}).click());
  assert.equal(response.request.action,'confirm');await expect(apl(page)).toContainText('Förläggningen är bekräftad av rektor.');return response;};
 const decideUi=async(page,action,comment='')=>{const panel=decision(page);await expect(panel).toHaveAttribute('aria-busy','false');
  if(action==='submit'||action==='approve')for(const check of await panel.getByRole('checkbox').all())await check.check();
  if(comment)await panel.getByRole('textbox').fill(comment);
  const name={submit:'Skicka för beslut',approve:'Fastställ planen',return:'Skicka tillbaka för rättning',withdraw:'Ta tillbaka för ändring'}[action];
  const response=await post(page,'/api/planbeslut/andra',async()=>{await panel.getByRole('button',{name,exact:true}).click();if(action==='approve')await page.getByRole('dialog',{name:'Fastställ timplanen?',exact:true}).getByRole('button',{name:'Ja, fastställ planen',exact:true}).click();});
  assert.equal(response.request.action,action);await expect(panel).toHaveAttribute('aria-busy','false');return response.body;};
 try {
  for(const role of ['principal','hm']){const context=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(context);pages[role]=await context.newPage();
   pages[role].on('pageerror',e=>errors.push({message:e.message,stack:e.stack}));pages[role].on('dialog',dialog=>dialog.type()==='beforeunload'?dialog.accept():dialog.dismiss());
   await fixture.login(pages[role],role);await expect(pages[role].getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();}
  const p=pages.principal,h=pages.hm,original=await client.gym(fixture.scope.planId);
  await open(h,original);await expect(decision(h)).toContainText('Äldre plan utan registrerat APL-underlag');await expect(apl(h)).toContainText('APL-underlag saknas');
  await expect(apl(h).getByRole('button',{name:'Planera APL',exact:true})).toHaveCount(0);await capture(h,'legacy-approved-read');
  const older=await client.gym(fixture.scope.legacySubmittedId);await open(h,older);await expect(decision(h).getByRole('button',{name:'Fastställ planen',exact:true})).toHaveCount(0);
  await decideUi(h,'return','Komplettera den äldre planen med APL-perioder och rektors bekräftelse.');ok('Legacy approved history remains readable and HM returns older submitted plan through the real UI');
  const a=await prepareAplVariant(client,fixture,'BF A – mer pedagogisk fördjupning'),b=await prepareAplVariant(client,fixture,'BF B – ordinarie APL');
  assert.equal(a.gym.source.planId,b.gym.source.planId);assert.notEqual(a.gym.series.id,b.gym.series.id);
  await open(p,a.gym);await apl(p).getByRole('button',{name:'Planera APL',exact:true}).click();await apl(p).getByRole('combobox',{name:'Utbildningsform',exact:true}).selectOption('school_based');
  for(const [index,period] of a.value.periods.entries()) {
   await apl(p).getByRole('button',{name:'Lägg till period',exact:true}).click();const block=apl(p).locator('fieldset.apl-period').nth(index);
   await block.getByLabel('Periodens namn',{exact:true}).fill(period.name);await block.getByLabel('Startdatum',{exact:true}).fill(period.startsOn);await block.getByLabel('Slutdatum',{exact:true}).fill(period.endsOn);
   await block.getByRole('combobox',{name:'Läsår',exact:true}).selectOption(String(period.schoolYear));await block.getByRole('combobox',{name:'Omfattning',exact:true}).selectOption('whole_weeks');await block.getByLabel('Uppgivna hela veckor',{exact:true}).fill('5');
   await block.getByLabel('Underlag för omfattningen',{exact:true}).fill(period.extent.reviewNote);await block.getByLabel('Omfattningen är granskad mot underlaget',{exact:true}).check();
   for(const [n,content]of period.contents.entries()) {
    await block.getByRole('combobox',{name:'Lägg till ämnesinnehåll',exact:true}).selectOption(content.rowKey);const subject=block.locator('.apl-content').nth(n);
    await subject.getByRole('textbox',{name:'Arbetsmoment',exact:true}).fill(content.description);const time=subject.locator('.apl-allocation').first(),minutes=period.allocations[n].gutMinutes;
    await time.getByLabel(/APL timmar$/u).fill(String(Math.floor(minutes/60)));await time.getByLabel(/APL minuter$/u).fill(String(minutes%60));
   }
  }
  await apl(p).getByLabel('All APL-tid är identifierad i timplanens totaltid',{exact:true}).check();
  await apl(p).getByRole('button',{name:'Granska ändringar',exact:true}).click();const review=p.getByRole('dialog',{name:'Granska APL-planen före sparande',exact:true});
  await expect(review).toContainText('345 h');await expect(review).toContainText('Ämneskopplingar: 0 → 9');await expect(review).toContainText('Perioder: 0 → 3');
  await expect(review.getByRole('button',{name:'Spara APL-plan',exact:true})).toBeEnabled();await capture(p,'three-periods-review');
  const initial=await post(p,aplRoutes.command,()=>review.getByRole('button',{name:'Spara APL-plan',exact:true}).click());assert.equal(initial.request.action,'save');parseAplCommandReply(initial.body,initial.request);
  await expect(apl(p)).toContainText('APL-planen är sparad.');const current=await client.read(a.gym.id);assert.equal(current.projection.allocatedGutMinutes,20700);assert.equal(current.projection.reviewedWholeWeeks,15);
  assert.equal(current.detail.plan.periods.length,3);assert.ok(current.detail.plan.periods.every(v=>v.allocations.filter(x=>x.gutMinutes===690).length===2));assert.deepEqual(current.gym.hours,a.gym.hours);
  await p.reload();await expect(apl(p)).toContainText('345 h');await expect(apl(p)).toHaveAttribute('aria-busy','false');await capture(p,'saved-reloaded');
  ok('Three five-week periods and nine content links saved through UI; exact 690 + 690 allocations remain 345 included hours after reload');
  // MFA failure persists the real confirmation request in sessionStorage; new login uses the same tab and exact plan URL.
  await fixture.expireMfa(p,'principal');await apl(p).getByRole('button',{name:'Bekräfta förläggningen',exact:true}).click();let dialog=p.getByRole('dialog',{name:'Bekräfta förläggningen',exact:true});
  await dialog.getByLabel('Rektors kommentar',{exact:true}).fill('Bekräftelse efter faktisk ny MFA.');const [mfaDenied]=await Promise.all([p.waitForResponse(responseAt(aplRoutes.command)),dialog.getByRole('button',{name:'Bekräfta förläggningen',exact:true}).click()]);assert.equal(mfaDenied.status(),403);assert.equal((await mfaDenied.json()).code,'mfa_required');const pendingConfirm=mfaDenied.request().postDataJSON();
  await expect(apl(p)).toContainText('Läs sparstatus');await fixture.login(p,'principal',{stepUp:true,returnTo:url(a.gym)});
  await expect(apl(p).getByRole('button',{name:'Läs sparstatus',exact:true})).toBeEnabled();const notFound=await post(p,aplRoutes.status,()=>apl(p).getByRole('button',{name:'Läs sparstatus',exact:true}).click());
  assert.equal(notFound.body.state,'not_found');assert.deepEqual(notFound.request,{command:pendingConfirm});
  const retried=await post(p,aplRoutes.command,()=>apl(p).getByRole('button',{name:'Skicka samma sparförsök igen',exact:true}).click());assert.deepEqual(retried.request,pendingConfirm);
  await expect(apl(p)).toContainText('Förläggningen är bekräftad av rektor.');ok('Real expired MFA, OIDC step-up and same-tab journal require explicit exact confirmation retry');
  await decideUi(p,'submit');await open(h,await client.gym(a.gym.id));await expect(decision(h)).toContainText('Gäller det sparade innehållet');await expect(decision(h)).toContainText('345 h');
  await decision(h).getByRole('link',{name:'Öppna APL-planeringen',exact:true}).click();await expect(apl(h)).toBeFocused();
  const focusClearance=await h.evaluate(()=>document.getElementById('apl-planering').getBoundingClientRect().top-document.querySelector('.planning-context').getBoundingClientRect().bottom);
  assert.ok(focusClearance>=0,'Focused APL heading must be visible below sticky controls before capture');await capture(h,'head-review-apl');
  await decideUi(h,'return','Förtydliga arbetsmomentet i första perioden.');await open(p,await client.gym(a.gym.id));await expect(decision(p)).toContainText('Förtydliga arbetsmomentet i första perioden.');
  await apl(p).getByRole('button',{name:'Planera APL',exact:true}).click();await apl(p).locator('fieldset.apl-period').first().getByRole('textbox',{name:'Arbetsmoment',exact:true}).first().fill('Förtydligat pedagogiskt moment efter huvudmannens återkoppling.');
  await apl(p).getByRole('button',{name:'Granska ändringar',exact:true}).click();dialog=p.getByRole('dialog',{name:'Granska APL-planen före sparande',exact:true});
  let lostRequest,lostReply;let deliver,rejectLost;const lost=new Promise((resolve,reject)=>{deliver=resolve;rejectLost=reject;});
  await p.route('**'+aplRoutes.command,async route=>{try{lostRequest=route.request().postDataJSON();const response=await route.fetch();assert.equal(response.status(),200);lostReply=parseAplCommandReply(await response.json(),lostRequest);
   await route.abort('failed');deliver();}catch(error){rejectLost(error);}},{times:1});
  await Promise.all([lost,dialog.getByRole('button',{name:'Spara APL-plan',exact:true}).click()]);await expect(apl(p)).toContainText('Sparandet kunde inte bekräftas.');
  assert.equal(lostRequest.action,'save');const [receipt]=await db`select command_id::text from public.apl_plan_commands where command_id=${lostRequest.commandId}`;assert.ok(receipt);
  result.transportFaults.push({kind:'drop-after-real-200',commandId:lostRequest.commandId,realStatus:200,revision:lostReply.receipt.revision});
  const journals=await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('apl-plan:')).map(k=>JSON.parse(sessionStorage.getItem(k))));assert.equal(journals.length,1);assert.deepEqual(journals[0].request,lostRequest);
  // Another real request changes the same plan after the lost response. Recovery must show that newer content.
  const newer=structuredClone(lostReply.detail.plan);newer.periods[1].contents[0].description='En senare verklig ändring ska bevaras vid återhämtning.';
  const latest=await client.command(client.saveRequest(a.gym.id,lostReply.detail.revision,newer));
  await p.reload();await expect(apl(p).getByRole('button',{name:'Läs sparstatus',exact:true})).toBeEnabled();
  const recovered=await post(p,aplRoutes.status,()=>apl(p).getByRole('button',{name:'Läs sparstatus',exact:true}).click());assert.equal(recovered.body.state,'completed');assert.deepEqual(recovered.request,{command:lostRequest});
  await expect(apl(p)).toContainText('En senare ändring finns också');assert.equal((await client.read(a.gym.id)).detail.revision,latest.detail.revision);
  assert.equal((await client.command(lostRequest)).receipt.replayed,true);assert.equal((await client.read(a.gym.id)).detail.revision,latest.detail.revision);
  assert.deepEqual(await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('apl-plan:'))),[]);await capture(p,'lost-response-recovered');
  ok('Actual save commits once despite dropped response; reload/status/exact replay retain the later saved revision and clear the matching journal');
  await expect(decision(p)).toContainText('Behöver förnyas efter ändring');await confirmUi(p);await decideUi(p,'submit');await open(h,await client.gym(a.gym.id));await capture(h,'head-approval-ready');
  await decideUi(h,'approve');assert.equal((await client.gym(a.gym.id)).status,'faststalld');ok('Returned content invalidates earlier confirmation; renewed rector event allows HM approval through UI');
  await client.command(client.saveRequest(b.gym.id,b.gym.revision,b.value));const bRead=await client.read(b.gym.id);await client.command(client.confirmRequest(bRead.detail));await client.decide(b.gym.id,'submit');await client.decide(b.gym.id,'approve','hm');
  const approvedA=await client.gym(a.gym.id),approvedB=await client.gym(b.gym.id);assert.equal(approvedA.status,'faststalld');assert.equal(approvedB.status,'faststalld');
  const scope={offeringId:fixture.scope.offeringId,unitId:fixture.scope.unitId},underlag=await client.call('principal','/api/klasser/organisation/underlag',scope);
  const classes=await client.call('principal','/api/klasser/organisation/skapa',{...scope,commandId:randomUUID(),expectedEducationRevision:underlag.educationRevision,expectedSourceToken:underlag.sourceToken,startsOn:underlag.educationStartsOn,names:['APL A','APL B']});
  await open(p,approvedA);const links=p.getByRole('region',{name:'Klasser och läsår',exact:true});await links.getByRole('button',{name:'Koppla klass',exact:true}).click();
  await links.getByLabel('Läsår för klasskoppling',{exact:true}).selectOption(String(fixture.scope.year));await links.getByRole('checkbox',{name:'Välj APL A',exact:true}).check();await links.getByRole('button',{name:'Koppla valda klasser (1)',exact:true}).click();
  const linking=await post(p,'/api/klasser/koppla',()=>p.getByRole('dialog',{name:'Koppla 1 klasser',exact:true}).getByRole('button',{name:'Bekräfta koppling',exact:true}).click());
  const classA=classes.classes.find(c=>c.name==='APL A'),classB=classes.classes.find(c=>c.name==='APL B');assert.equal(linking.request.classId,classA.id);assert.equal(linking.request.planId,approvedA.id);assert.equal(linking.request.schoolYear,fixture.scope.year);
  await client.call('principal','/api/klasser/koppla',{commandId:randomUUID(),classId:classB.id,schoolYear:fixture.scope.year,planId:approvedB.id,expectedPlanRevision:approvedB.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null});
  const linked=await client.call('principal','/api/klasser/underlag',{planId:approvedA.id,schoolYear:fixture.scope.year});assert.equal(linked.classes.find(c=>c.id===classA.id).link.planId,approvedA.id);assert.equal(linked.classes.find(c=>c.id===classB.id).link.planId,approvedB.id);
  await open(p,approvedA);await capture(p,'approved-exact-class-link');ok('Two named variants share one programplan and retain distinct exact school/class/year/version links');
  const copied=await client.create('BF kopia – granska APL',approvedA.id),copy=await client.read(copied.id);assert.equal(copy.detail.revision,0);assert.equal(copy.detail.confirmations.length,0);
  assert.ok(copy.detail.plan.periods.every(period=>!period.extent.reviewed));assert.ok(copy.detail.plan.periods.every(period=>!latest.detail.plan.periods.some(old=>old.id===period.id)));
  ok('Copy retains planning structure with fresh period IDs and mandatory review, without copying rector approval');
  assert.deepEqual((await client.gym(original.id)).hours,original.hours);assert.deepEqual(errors,[]);result.planIds={legacy:original.id,a:approvedA.id,b:approvedB.id,copied:copied.id};result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}
