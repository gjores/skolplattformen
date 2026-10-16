// Actual OIDC -> Worker -> PostgreSQL; owned synthetic schema-copy fixtures only.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {actualAplClient,aplRoutes} from './apl-plan-api-scenarios.mjs';
import {parseAplCommandReply} from '../../web/lib/apl-plan.ts';
const {expect:baseExpect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const expect=baseExpect.configure({timeout:25000});
const sha=value=>createHash('sha256').update(value).digest('hex');
const responseAt=route=>response=>new URL(response.url()).pathname===route&&response.request().method()==='POST';
const apl=page=>page.getByRole('region',{name:'APL-planering',exact:true});
function isoWeek(iso){
 const day=new Date(iso+'T00:00:00.000Z');day.setUTCDate(day.getUTCDate()+4-(day.getUTCDay()||7));
 return {year:day.getUTCFullYear(),week:Math.ceil((((day-new Date(Date.UTC(day.getUTCFullYear(),0,1)))/86400000)+1)/7)};
}
// Independent reference examples guard against midday rounding in the evidence helper.
for(const [date,year,week]of [['2027-01-01',2026,53],['2028-01-01',2027,52],['2027-01-04',2027,1],['2024-12-30',2025,1]])assert.deepEqual(isoWeek(date),{year,week});
export async function runAplGuideDatesBrowserScenarios({fixture,browser,device,snapshot,checks,evidenceDir}){
 const settings=device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}};
 // Different civil time zones must preserve the exact ISO date saved by the calendar.
 const timezoneId=device==='phone'?'America/Los_Angeles':'Europe/Stockholm';
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),errors=[];
 const result={status:'FAIL',device,retries:0,timezoneId,features:{guide:false,calendar:false,aplSaveReload:false},checks:[],screenshots:[],http,scope:fixture.scope};
 let phase='principal-login';
 const observeErrors=page=>page.on('pageerror',error=>{const url=new URL(page.url());errors.push({message:error.message,phase,origin:url.origin,pathname:url.pathname});});
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});};
 const capture=async(page,name,target)=>{
  await page.evaluate(()=>document.fonts.ready);
  if(target)await target.evaluate(el=>{const bottom=document.querySelector('.planning-context')?.getBoundingClientRect().bottom??0;window.scrollBy(0,el.getBoundingClientRect().top-Math.max(bottom,0)-16);});
  const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
  assert.ok(geometry.scrollWidth<=geometry.width+1,'No document-wide horizontal overflow');
  const file=device+'-'+name+'.png';await page.screenshot({path:path.join(evidenceDir,file),fullPage:false});
  result.screenshots.push({file,sha256:sha(readFileSync(path.join(evidenceDir,file))),geometry});save();
 };
 const open=async(page,gym)=>{
  await page.goto(fixture.baseURL+'/?'+new URLSearchParams({vy:'timplaner',timplan:gym.id,timplansskola:gym.unitId,timplansutbildning:gym.offeringId,timplansversion:String(gym.version),planeringslasar:String(fixture.scope.year),planeringsskola:gym.unitId,planeringsform:'gymnasium',planeringsallaar:'1'}));
  await expect(apl(page)).toBeVisible();await expect(apl(page)).toHaveAttribute('aria-busy','false');
 };
 const edit=async page=>apl(page).getByRole('button',{name:'Planera APL',exact:true}).click();
 const saveUi=async page=>{
  await apl(page).getByRole('button',{name:'Granska ändringar',exact:true}).click();
  const dialog=page.getByRole('dialog',{name:'Granska APL-planen före sparande',exact:true});await expect(dialog).toBeVisible();
  const [response]=await Promise.all([page.waitForResponse(responseAt(aplRoutes.command)),dialog.getByRole('button',{name:'Spara APL-plan',exact:true}).click()]);
  const request=response.request().postDataJSON(),body=await response.json();assert.equal(response.status(),200,body.code);assert.equal(request.action,'save');parseAplCommandReply(body,request);
  await expect(apl(page)).toContainText('APL-planen är sparad.');await expect(apl(page)).toHaveAttribute('aria-busy','false');return{request,reply:body};
 };
 // Accessible names are shared with the reusable calendar's own component tests.
 const chooseDate=async(page,block,label,date)=>{
  await block.getByLabel(label,{exact:true}).locator('..').getByRole('button',{name:'Öppna kalender',exact:true}).click();
  const calendar=page.getByRole('dialog',{name:'Välj datum',exact:true});await expect(calendar).toBeVisible();
  await calendar.getByLabel('År',{exact:true}).selectOption(date.slice(0,4));
  await calendar.getByLabel('Månad',{exact:true}).selectOption(String(Number(date.slice(5,7))-1));
  await expect(calendar.locator('.rdp-week_number_header')).toHaveText('v.');
  const fullDate=new Date(date+'T12:00:00.000Z').toLocaleDateString('sv-SE',{weekday:'long',year:'numeric',month:'long',day:'numeric',timeZone:'UTC'});
  const day=calendar.getByRole('button',{name:new RegExp('^'+fullDate+'(?:,|$)','u')});
  await expect(day).toBeVisible();await expect(day.locator('xpath=ancestor::tr').getByRole('rowheader',{name:'Vecka '+isoWeek(date).week,exact:true})).toBeVisible();
  const box=await calendar.boundingBox(),viewport=page.viewportSize();assert.ok(box&&viewport&&box.x>=0&&box.x+box.width<=viewport.width+1,'Calendar remains within the viewport');
  await capture(page,label==='Startdatum'?'calendar-year-boundary':'calendar-end');await day.click();
  await expect(calendar).not.toBeVisible();await expect(block.getByLabel(label,{exact:true})).toHaveValue(date);
  const week=isoWeek(date),year=Number(date.slice(0,4));
  await expect(block.getByLabel(label,{exact:true}).locator('xpath=ancestor::*[contains(concat(" ", normalize-space(@class), " "), " school-date ")][1]').locator('.school-date-help')).toHaveText(`Vecka ${week.week}${week.year===year?'':` (${week.year})`}`);
 };
 try{
  const context=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',timezoneId,reducedMotion:'reduce'});contexts.push(context);
  context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(45000);
  const page=pages.principal=await context.newPage();observeErrors(page);page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());
  await fixture.login(page,'principal');await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await page.waitForLoadState('networkidle');phase='principal-planning';const original=await client.gym(fixture.scope.planId);assert.equal((await client.read(original.id)).detail.plan,null);
  await open(page,original);
  const guide=apl(page).locator('.apl-guide');await guide.locator(':scope > summary').click();
  await expect(guide).toHaveAttribute('open','');await expect(guide).toContainText('Minst 15 veckor');await expect(guide).toContainText('23 timmar per vecka');
  await expect(guide).toContainText('Garanterad undervisningstid'.toLowerCase());
  await capture(page,'guide-overview',guide);
  const allocationStep=guide.locator('details').filter({has:page.locator('summary').filter({hasText:'3. Koppla innehåll och fördela timmar'})});
  await allocationStep.locator('summary').click();await expect(allocationStep).toContainText('115');await expect(allocationStep).toContainText('ingår');await capture(page,'guide-hours-example',allocationStep);
  const followupStep=guide.locator('details').filter({has:page.locator('summary').filter({hasText:'5. Säkra arbetsplatsen och följ varje elev'})});
  await followupStep.locator('summary').click();await expect(followupStep).toContainText('registreras eller kontrolleras ännu inte här');
  await expect(followupStep.getByRole('link',{name:/Skolverket/u})).toHaveAttribute('href',/^https:\/\/www\.skolverket\.se\//u);
  await capture(page,'guide-followup',followupStep);await guide.locator(':scope > summary').click();
  result.features.guide=true;ok('Rector can open sourced APL guidance from the actual planning view with weekly and GUT rules');
  await edit(page);await apl(page).getByRole('button',{name:'Lägg till period',exact:true}).click();let block=apl(page).locator('fieldset.apl-period').first();
  await block.getByLabel('Årskurs',{exact:true}).selectOption('1');await block.getByLabel('Termin',{exact:true}).selectOption('VT');
  const coarse=await saveUi(page),before=coarse.request.plan.periods[0];assert.equal(before.plannedTermIndex,1);assert.equal(before.schoolYear,fixture.scope.year);assert.equal(before.startsOn,null);assert.equal(before.endsOn,null);
  await page.waitForLoadState('networkidle');await page.reload();await expect(apl(page)).toHaveAttribute('aria-busy','false');await edit(page);block=apl(page).locator('fieldset.apl-period').first();
  await block.locator('summary').filter({hasText:/^Datum och omfattning$/u}).click();
  const start=`${fixture.scope.year+1}-01-01`,end=`${fixture.scope.year+1}-01-15`;
  await chooseDate(page,block,'Startdatum',start);await chooseDate(page,block,'Slutdatum',end);
  await expect(block.getByLabel('Årskurs',{exact:true})).toHaveValue('1');await expect(block.getByLabel('Termin',{exact:true})).toHaveValue('VT');
  await expect(block.getByRole('combobox',{name:'Periodens läsår',exact:true})).toHaveValue(String(fixture.scope.year));
  await expect(block.getByRole('combobox',{name:'Omfattning',exact:true})).toHaveValue('unknown');result.features.calendar=true;
  ok('Swedish calendar shows ISO week at year boundary; chosen dates preserve year, term, school year and unknown APL extent in '+timezoneId);
  const saved=await saveUi(page),after=saved.request.plan.periods[0];assert.deepEqual(after,{...before,startsOn:start,endsOn:end});
  const read=await client.read(original.id);assert.deepEqual(read.detail.plan,saved.request.plan);assert.deepEqual(read.gym.hours,original.hours);assert.equal(read.projection.readyForConfirmation,false);
  const raw=(await snapshot.db`select id::text,planned_term_index,starts_on::text,ends_on::text from public.apl_plan_periods where id=${before.id}`)[0];assert.deepEqual(raw,{id:before.id,planned_term_index:1,starts_on:start,ends_on:end});
  await page.waitForLoadState('networkidle');await page.reload();await expect(apl(page)).toHaveAttribute('aria-busy','false');await edit(page);block=apl(page).locator('fieldset.apl-period').first();await block.locator('summary').filter({hasText:/^Datum och omfattning$/u}).click();
  await expect(block.getByLabel('Startdatum',{exact:true})).toHaveValue(start);await expect(block.getByLabel('Slutdatum',{exact:true})).toHaveValue(end);await expect(block.getByRole('combobox',{name:'Omfattning',exact:true})).toHaveValue('unknown');
  await capture(page,'dates-reloaded',block);result.features.aplSaveReload=true;
  ok('Real save/read/reload persists exact ISO dates and period UUID without converting calendar weeks to APL weeks, changing allocations or completing confirmation');
  const hmContext=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',timezoneId,reducedMotion:'reduce'});contexts.push(hmContext);hmContext.setDefaultTimeout(25000);
  phase='huvudman-login';const hm=await hmContext.newPage();observeErrors(hm);await fixture.login(hm,'hm');await expect(hm.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await hm.waitForLoadState('networkidle');phase='huvudman-planning';await open(hm,original);
  await expect(apl(hm)).toContainText('APL-underlaget visas i läsläge');
  await expect(apl(hm).getByRole('button',{name:'Planera APL',exact:true})).toHaveCount(0);
  const hmGuide=apl(hm).locator('.apl-guide');await hmGuide.locator(':scope > summary').click();await expect(hmGuide).toHaveAttribute('open','');await capture(hm,'guide-readonly',hmGuide);
  ok('Huvudman can read the guidance in the actual read-only view without gaining edit rights');
  assert.deepEqual(errors,[]);result.periodId=before.id;result.planId=original.id;result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}
