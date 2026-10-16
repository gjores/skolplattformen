import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {writeFileSync,readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
const {expect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const baseURL='http://127.0.0.1:3014';
export async function runRectorBrowserScenarios({fixture,browser,device,snapshot,checks,evidenceDir}){
 const settings=device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}},role=device==='phone'?'principal2':'principal',unitId=device==='phone'?fixture.scope.secondUnitId:fixture.scope.unitId;
 const result={device,checks:[],screenshots:[]},contexts=[],db=snapshot.db;let page;
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const ok=name=>{result.checks.push(name);checks.push({name:`Actual ${device}: ${name}`,ok:true});save();};
 const call=async(page,role,route,body)=>{const r=await fixture.request(page,role,route,body);assert.equal(r.status,200,route+': '+r.body.code);return r.body;};
 const checkedPost=async(page,route,act)=>{const pending=page.waitForResponse(r=>new URL(r.url()).pathname===route&&r.request().method()==='POST');await act();const r=await pending;assert.equal(r.status(),200,route);return r.json();};
 const capture=async name=>{await expect(page.locator('[data-slot=sidebar-wrapper]')).toHaveCSS('display','flex');if(device==='desktop')await expect(page.locator('[data-slot=sidebar-container]')).toHaveCSS('position','fixed');await expect(page.getByText('Toggle Sidebar',{exact:true})).toHaveCSS('position','absolute');const geometry=await page.evaluate(()=>({width:document.documentElement.scrollWidth,viewport:innerWidth}));assert.ok(geometry.width<=settings.viewport.width+1);assert.ok(geometry.viewport<=settings.viewport.width+1);const file=`${device}-${name}.png`;await page.screenshot({path:path.join(evidenceDir,file),fullPage:true});result.screenshots.push({file,geometry,sha256:createHash('sha256').update(readFileSync(path.join(evidenceDir,file))).digest('hex')});save();};
 try{
  if(device==='desktop'){
   const hc=await browser.newContext({baseURL});contexts.push(hc);const hp=await hc.newPage();await fixture.login(hp,'hm');const [o]=await db`select lifecycle_revision from public.offerings where id=${fixture.scope.offeringId}`;
   await call(hp,'hm','/api/programplaner/utbildning/livscykel',{offeringId:fixture.scope.offeringId,expectedRevision:o.lifecycle_revision,command:'units',details:{unitIds:[fixture.scope.unitId,fixture.scope.secondUnitId]}});
  }
  const context=await browser.newContext({...settings,baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(context);page=await context.newPage();const errors=[];await fixture.login(page,role);await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();page.on('pageerror',e=>errors.push({message:e.message,stack:e.stack,url:page.url()}));
  const source=(await db`select * from public.point_plans where id=${fixture.scope.programId}`)[0],later=`${Number(source.basis_reference.startedOn.slice(0,4))+1}-08-17`,name=`Rektor ${device} ${randomUUID().slice(0,6)}`;
  const query=new URLSearchParams({vy:'programplaner',planeringsskola:unitId,planeringslasar:String(fixture.scope.year),planeringsform:'gymnasium',planeringsallaar:'1'});
  await page.goto(baseURL+'/?'+query);await page.getByRole('button',{name:'Ny programplan',exact:true}).click();
  const flow=page.getByRole('region',{name:'Program, inriktning och fördjupning'});await expect(flow.locator('#pp-flow-school')).toHaveValue(unitId);
  await flow.locator('#pp-flow-program').selectOption('SA25:4');await flow.locator('#pp-flow-orientation').selectOption('SABEP');
  await flow.getByLabel('Utbildningens namn',{exact:true}).fill(name);await flow.getByLabel('Elevkull',{exact:true}).fill('Nästa kull');await flow.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(later);
  await flow.getByRole('button',{name:'Granska utkast',exact:true}).click();await expect(flow.getByRole('region',{name:'Kontrollera före sparning'})).toContainText(name);await capture('create-review');
  const made=await checkedPost(page,'/api/programplaner/utbildning/skapa',()=>flow.getByRole('button',{name:'Spara utbildning och utkast',exact:true}).click());assert.equal(made.education.unitId,unitId);assert.equal(made.plan.status,'utkast');await expect(page.getByRole('heading',{name,exact:true})).toBeVisible();ok('Rector creates a named first draft through the real UI in selected own school');
  const sourceUrl=new URLSearchParams({...Object.fromEntries(query),utbildning:fixture.scope.offeringId,programplan:source.id,programplanskola:unitId,programplansversion:String(source.version)});
  await page.goto(baseURL+'/?'+sourceUrl);await page.getByRole('button',{name:'Kopiera',exact:true}).click();const form=page.getByRole('region',{name:'Kopiera till ny utbildning'});await expect(form).toContainText('Kopian gäller endast');await expect(form).toContainText('Huvudmannen godkänner');
  await form.getByLabel('Utbildningens namn',{exact:true}).fill(name+' kopia');await form.getByLabel('Elevkull',{exact:true}).fill('Nästa kull');await form.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(later);await capture('copy-own-school');
  const copy=await checkedPost(page,'/api/programplaner/utbildning/kopiera',()=>form.getByRole('button',{name:'Spara kopia',exact:true}).click());assert.equal(copy.education.unitId,unitId);
  await expect(page.getByRole('heading',{name:name+' kopia',exact:true})).toBeVisible();assert.deepEqual((await db`select unit_id from public.offering_units where offering_id=${copy.education.id}`).map(r=>r.unit_id),[unitId]);const [copied]=await db`select * from public.point_plans where id=${copy.plan.id}`;assert.deepEqual(copied.term_distribution,source.term_distribution);assert.equal(copied.status,'utkast');
  await expect(page.getByRole('button',{name:'Skolor',exact:true})).toHaveCount(0);await expect(page.getByRole('button',{name:'Fastställ planen',exact:true})).toHaveCount(0);await capture('copied-draft');ok('Rector copy keeps terms, targets only own school and offers no school-sharing or approval control');
  assert.deepEqual(errors,[]);result.createdPlanId=made.plan.id;result.copiedPlanId=copy.plan.id;result.status='PASS';save();return result;
 }catch(e){result.status='FAIL';result.failureCode=e.code??'ASSERTION';save();if(page)await page.screenshot({path:path.join(evidenceDir,device+'-failure.png'),fullPage:true}).catch(()=>{});throw e;}
 finally{for(const context of contexts)await context.close();}
}
