// Actual OIDC, Worker, SQL and browser for APL-CENTRAL-CONTENT. Only owned synthetic schema-only data.
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import path from 'node:path';
import {seedPlanningFlowFixture} from './planning-flow-fixtures.mjs';
import {aplActor} from './verify-apl-plan-commands.mjs';
import {actualAplClient,aplRoutes} from './apl-plan-api-scenarios.mjs';
import {syllabusRefFromRowKey} from '../../web/lib/syllabus-central.ts';
const {expect:baseExpect,devices}=createRequire(new URL('../../web/package.json',import.meta.url))('@playwright/test');
const expect=baseExpect.configure({timeout:25000});
const sha=v=>createHash('sha256').update(v).digest('hex');
const root=new URL('../../',import.meta.url);
const catalogId=JSON.parse(readFileSync(new URL('web/lib/syllabus-central.index.json',root),'utf8')).catalogId;
export function levelItems(rowKey){
 const ref=syllabusRefFromRowKey(rowKey);assert.ok(ref,rowKey);
 const subject=JSON.parse(readFileSync(new URL(`web/lib/syllabus-central/${ref.subject}-${ref.version}.json`,root),'utf8'));
 return subject.levels.find(l=>l.code===ref.level).sections.flatMap(s=>s.items.map(i=>({itemKey:i.key,heading:s.heading,text:i.text})));
}

/** Planning-flow seed with its vocational timetable approved, so later APL periods can be saved. */
export async function seedAplCentralFixture(snapshot){
 const seed=await seedPlanningFlowFixture(snapshot),id=n=>seed.ids[1].slice(0,24)+String(n).padStart(12,'0');
 await snapshot.db.begin(async tx=>{
  for(const [role,action] of [['principal','submit'],['hm','approve']]){await aplActor(tx,{...seed,id},role);
   const d=(await tx`select public.phase5_plan_decision_basis('timplan',${seed.planId}) value`)[0].value.result;
   await tx`select public.phase5_plan_decision_command(${tx.json({kind:'timplan',planId:seed.planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'Syntetisk kontroll',confirmedChecks:d.checks.map(c=>c.id)})})`;}
  await tx`set constraints all immediate`;
 });
 assert.ok(levelItems(seed.key).length>=2,'Seed level needs central content');return seed;
}
const selections=async(db,planId)=>db`select s.item_key,s.subject_code,s.subject_version,s.level_code,c.other_content from public.apl_content_central_items s join public.apl_period_contents c using(plan_id,period_id,row_key) where s.plan_id=${planId} order by s.item_key`;

export async function runAplCentralBrowserScenarios({fixture,browser,device,snapshot,seed,checks,evidenceDir}){
 const contexts=[],pages={},errors=[],items=levelItems(seed.key),db=snapshot.db;
 const result={status:'FAIL',device,retries:0,features:{choose:false,review:false,saveReload:false,organizerView:false},checks:[],screenshots:[],scope:fixture.scope};
 const save=()=>writeFileSync(path.join(evidenceDir,`browser-${device}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
 const ok=name=>{result.checks.push({name,ok:true});checks.push({name:device+': '+name,ok:true});save();};
 const capture=async(page,name)=>{await page.evaluate(()=>document.fonts.ready);const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));assert.ok(geometry.scrollWidth<=geometry.width+1,'No horizontal overflow');
  const file=device+'-'+name+'.png';await page.screenshot({path:path.join(evidenceDir,file),fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(path.join(evidenceDir,file))),geometry});save();};
 const settings=device==='phone'?devices['iPhone 13']:{viewport:{width:1440,height:1000}};
 try{
  for(const role of ['principal','hm']){const context=await browser.newContext({...settings,baseURL:fixture.baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});contexts.push(context);context.setDefaultTimeout(25000);context.setDefaultNavigationTimeout(45000);
   const page=pages[role]=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.type()==='beforeunload'?d.accept():d.dismiss());await fixture.login(page,role);}
  const client=actualAplClient(fixture,pages),gym=await client.gym(seed.planId);assert.equal(gym.status,'faststalld');
  const url=fixture.baseURL+'/?'+new URLSearchParams({vy:'apl-planering',timplan:gym.id,timplansskola:gym.unitId,timplansutbildning:gym.offeringId,timplansversion:String(gym.version)});
  const p=pages.principal,apl=page=>page.getByRole('region',{name:'APL-planering',exact:true});
  await p.goto(url);await expect(apl(p)).toHaveAttribute('aria-busy','false');
  await apl(p).getByRole('button',{name:'Förlägg APL i perioder',exact:true}).click();await apl(p).getByRole('button',{name:'Lägg till period',exact:true}).click();
  const period=apl(p).locator('fieldset.apl-period').first();
  await period.getByLabel('Årskurs',{exact:true}).selectOption('1');await period.getByLabel('Termin',{exact:true}).selectOption('HT');
  await period.getByText('Ämnesinnehåll och undervisningstid',{exact:true}).click();
  const course=period.getByLabel('Lägg till kurs');await expect(course.locator(`option[value="${seed.key}"]`)).toHaveCount(1);await course.selectOption(seed.key);
  const central=period.locator('.apl-central');await expect(central.locator('summary')).toHaveText(`Centralt innehåll (0 av ${items.length} valda)`);await central.locator('summary').click();
  for(const item of items.slice(0,2))await central.getByLabel(item.text,{exact:true}).check();
  await expect(central.locator('summary')).toHaveText(`Centralt innehåll (2 av ${items.length} valda)`);
  await period.getByLabel('Arbetsmoment',{exact:true}).fill('Syntetiskt arbetsmoment på arbetsplatsen.');await period.getByLabel('Övrigt innehåll (valfritt)',{exact:true}).fill('Syntetisk säkerhetsintroduktion.');
  await central.scrollIntoViewIfNeeded();await capture(p,'central-choice');result.features.choose=true;ok('Rector chooses a course with APL time and checks central content points in the actual protected UI');
  await apl(p).getByRole('button',{name:'Granska ändringar',exact:true}).click();const dialog=p.getByRole('dialog');await expect(dialog).toBeVisible();
  await dialog.getByText('Visa ämnesinnehåll',{exact:true}).click();await expect(dialog).toContainText('Centralt innehåll (2 punkter)');await expect(dialog).toContainText(items[0].text);await expect(dialog).toContainText('Övrigt innehåll: Syntetisk säkerhetsintroduktion.');
  await capture(p,'review-dialog');result.features.review=true;ok('Save review shows selected points and other content before saving');
  const [response]=await Promise.all([p.waitForResponse(r=>new URL(r.url()).pathname===aplRoutes.command&&r.request().method()==='POST'),dialog.getByRole('button',{name:'Spara APL-plan',exact:true}).click()]);
  assert.equal(response.status(),200);const sent=response.request().postDataJSON().plan.periods[0].contents.find(c=>c.rowKey===seed.key);
  assert.deepEqual(sent.central,{catalogId,items:items.slice(0,2)});assert.equal(sent.otherContent,'Syntetisk säkerhetsintroduktion.');
  await expect(apl(p)).toContainText('APL-planen är sparad.');
  const rows=await selections(db,seed.planId),ref=syllabusRefFromRowKey(seed.key);
  assert.deepEqual(rows.map(r=>r.item_key).sort(),items.slice(0,2).map(i=>i.itemKey).sort());assert.ok(rows.every(r=>r.subject_code===ref.subject&&r.subject_version===ref.version&&r.level_code===ref.level&&r.other_content==='Syntetisk säkerhetsintroduktion.'));
  await p.reload();await expect(apl(p)).toHaveAttribute('aria-busy','false');await apl(p).getByText('Visa underlag',{exact:true}).click();
  for(const item of items.slice(0,2))await expect(apl(p)).toContainText(item.text);await expect(apl(p)).toContainText('Övrigt innehåll: Syntetisk säkerhetsintroduktion.');
  result.features.saveReload=true;ok('Actual Worker save persists exact catalog points with subject, version and level and they read back after reload');
  const h=pages.hm;await h.goto(url);await expect(apl(h)).toHaveAttribute('aria-busy','false');await apl(h).getByText('Visa underlag',{exact:true}).click();
  await expect(apl(h)).toContainText(items[1].text);await expect(apl(h)).toContainText('Övrigt innehåll: Syntetisk säkerhetsintroduktion.');
  await expect(apl(h).getByRole('button',{name:'Förlägg APL i perioder',exact:true})).toHaveCount(0);
  await apl(h).getByText('Visa underlag',{exact:true}).scrollIntoViewIfNeeded();await capture(h,'organizer-read');result.features.organizerView=true;ok('Organizer reads the selected central content and other content without edit access');
  assert.deepEqual(errors,[]);result.status='PASS';save();return result;
 }catch(error){result.failure={code:error.code??'ASSERTION',message:error.message};result.pageErrors=errors;save();if(pages.principal)await capture(pages.principal,'failure').catch(()=>{});throw error;}
 finally{for(const context of contexts)await context.close();}
}

export async function runAplCentralApiScenarios({fixture,browser,snapshot,seed,checks}){
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),{call}=client,db=snapshot.db,items=levelItems(seed.key);
 const ok=name=>checks.push({name,ok:true});
 try{
  for(const role of ['principal','hm','principal2']){const ctx=await browser.newContext({baseURL:fixture.baseURL});contexts.push(ctx);pages[role]=await ctx.newPage();await fixture.login(pages[role],role);}
  const {detail}=await client.read(seed.planId),base=structuredClone(seed.value);
  const withCentral=(central,other)=>{const v=structuredClone(base);v.periods[0].contents=v.periods[0].contents.map(c=>c.rowKey===seed.key?{...c,central,...(other?{otherContent:other}:{})}:c);return v;};
  const q=value=>({contractVersion:'structured_v1',revisionScope:'apl',expectedTimplanRevision:detail.timplanRevision,action:'save',commandId:randomUUID(),planId:seed.planId,expectedRevision:detail.revision,plan:value,copyReviewResolutions:[]});
  const tampered=await call('principal',aplRoutes.command,q(withCentral({catalogId,items:[{...items[0],text:items[0].text+' Påhittad.'}]})),400);
  assert.equal(tampered.details?.reason,'unknown_central_content');assert.equal((await selections(db,seed.planId)).length,0);
  await call('principal',aplRoutes.command,q(withCentral({catalogId,items:[{...items[0],itemKey:'f'.repeat(32)}]})),400);assert.equal((await selections(db,seed.planId)).length,0);
  ok('Actual API rejects altered point text and unknown point keys with 400 and writes no selection');
  const valid=q(withCentral({catalogId,items:items.slice(0,1)},'Syntetiskt övrigt.'));
  await call('principal2',aplRoutes.command,valid,403);await call('hm',aplRoutes.command,valid,403);await call('principal',aplRoutes.command,valid,403,{Origin:'https://wrong.invalid'});
  assert.equal((await selections(db,seed.planId)).length,0);ok('Other school, organizer and wrong origin cannot save selections');
  await fixture.expireMfa(pages.principal,'principal');assert.equal((await call('principal',aplRoutes.command,valid,403)).code,'mfa_required');assert.equal((await selections(db,seed.planId)).length,0);
  await fixture.login(pages.principal,'principal',{stepUp:true});await call('principal',aplRoutes.command,valid);
  assert.deepEqual((await selections(db,seed.planId)).map(r=>r.item_key),[items[0].itemKey]);ok('Expired MFA writes nothing; after real step-up the same selection saves once');
  const read=await client.read(seed.planId);assert.deepEqual(read.detail.plan.periods[0].contents.find(c=>c.rowKey===seed.key).central,{catalogId,items:items.slice(0,1)});
  ok('Read and TypeScript hash verification accept the saved selection');
  return{status:'PASS',http,badRequest:true,scopeProtected:true,mfaProtected:true};
 }finally{for(const ctx of contexts)await ctx.close();}
}
