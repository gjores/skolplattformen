// Programplanen beskriver ramar; sparat skolutbud hör till ett separat senare flöde.
import { expect,test,type Page } from '@playwright/test';
import { createProgramplanBrowserFixture,verifyProgramplanBrowserTarget,FUTURE_START } from '../../work/pilot/phase5-programplan-browser-fixtures.mjs';
import { waitForHydration } from './helpers/keycloak.ts';
type Fixture=Awaited<ReturnType<typeof createProgramplanBrowserFixture>>;
let fixture:Fixture;
const baseURL=process.env.PHASE5_BASE_URL??'http://127.0.0.1:3059';
const workspace=(page:Page)=>page.getByTestId('protected-programplan-workspace');
const board=(page:Page)=>workspace(page).getByRole('region',{name:'Programplanen',exact:true});
const packagePath=/^\/api\/programplaner\/(?:paketval|valpaket)(?:\/|$)/u;

async function navigate(page:Page,name=/^Öppna utbildning Syntetisk SA utan plan,/u) {
  await waitForHydration(page);
  const mobile=await page.evaluate(()=>matchMedia('(max-width: 767px)').matches),sidebar=page.locator('[data-slot="sidebar"][data-state]');
  if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed')await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  await page.getByRole('button',{name:'Programplaner',exact:true}).click();
  const list=workspace(page).getByRole('region',{name:'Alla programplaner',exact:true});
  await expect(list).toHaveAttribute('aria-busy','false');
  await list.getByRole('button',{name}).click();
  await expect(board(page)).toBeVisible();await expect(board(page)).toContainText('Allt sparat');
}
async function noPackageControls(page:Page) {
  await expect(workspace(page).getByRole('button',{name:/paket/iu})).toHaveCount(0);
  await expect(workspace(page).getByRole('region',{name:/^Paket i /u})).toHaveCount(0);
  await expect(workspace(page).getByLabel('Skolans valpaket',{exact:true})).toHaveCount(0);
  await expect(workspace(page)).not.toContainText('Skolornas paket behöver läsas');
  await expect(workspace(page)).not.toContainText('Hämtar skolornas paket');
}
async function observeNoPackageRequests(page:Page) {
  const attempts:string[]=[];
  page.on('request',request=>{if(packagePath.test(new URL(request.url()).pathname))attempts.push(new URL(request.url()).pathname);});
  // A missing/unavailable library must never block the plan workspace. If the UI
  // tries to use it, its request is refused and the final zero-attempt check fails.
  await page.route('**/api/programplaner/{paketval,valpaket}**',route=>route.abort('failed'));
  return attempts;
}
async function createPlan() {
  const created=await fixture.request(baseURL,fixture.hm,'/api/programplaner/skapa',{offeringId:fixture.emptyOfferingId,expectedLatestVersion:0,basisReference:fixture.choiceBasis()});
  expect(created.status).toBe(200);expect(await fixture.paired(created.correlationId,fixture.hm,'programplan_draft_created',created.body.id)).toBe(true);
  return created.body.id as string;
}
async function enter(page:Page,session=fixture.principal) {
  await fixture.cookies(page.context(),session,baseURL);await page.goto('/');
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();await navigate(page);
}
async function allocateFrame(page:Page,planId:string,session=fixture.principal) {
  await expect(board(page).locator('tr[data-row-key="block:mosp"]')).toContainText('Moderna språk');
  await expect(board(page).locator('tr[data-row-key="block:iv1"]')).toContainText('Individuellt val');
  const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/programplaner/terminer'&&response.request().method()==='POST');
  await board(page).getByRole('button',{name:'Föreslå fördelning',exact:true}).click();const response=await pending;expect(response.status()).toBe(200);
  expect(await fixture.paired(response.headers()['x-correlation-id'],session,'programplan_terms_changed',planId)).toBe(true);
  await expect(board(page)).toContainText('2 500 av 2 500 poäng fördelade');await expect(board(page)).toContainText('Allt sparat');
  await expect(workspace(page).locator('.pp-status')).toContainText('Klar för beslut');
  const read=await fixture.request(baseURL,session,'/api/programplaner/terminer/lasa',{planId});expect(read.status).toBe(200);
  expect(read.body.distribution.reduce((sum:number,row:{points:number[]})=>sum+row.points.reduce((a,b)=>a+b,0),0)).toBe(2500);
  for(const id of ['mosp','iv1'])expect(read.body.distribution.find((row:{rowKey:string})=>row.rowKey===`block:${id}`).points.reduce((a:number,b:number)=>a+b,0)).toBe(200);
  return read.body;
}
async function saveSchoolOffering(planId:string) {
  const saved=await fixture.request(baseURL,fixture.principal,'/api/programplaner/valpaket',{packageId:null,expectedVersion:0,details:{unitId:fixture.unitId,kind:'individualChoice',name:'Syntetiskt tidigare sparat skolutbud',levels:[{subjectCode:'BILD',subjectVersion:1,itemCode:'BILD1B00X',points:100},{subjectCode:'IDRO',subjectVersion:1,itemCode:'IDRO2000X',points:100}]}});
  expect(saved.status).toBe(200);expect(saved.body.points).toBe(200);
  expect(await fixture.paired(saved.correlationId,fixture.principal,'programplan_package_saved',saved.body.packageId,'programplan_package')).toBe(true);
  const picked=await fixture.request(baseURL,fixture.principal,'/api/programplaner/paketval',{planId,unitId:fixture.unitId,expectedRevision:0,blockId:'iv1',entries:[{ref:{type:'package',packageId:saved.body.packageId,version:1},distribution:[]}]});
  expect(picked.status).toBe(200);expect(await fixture.paired(picked.correlationId,fixture.principal,'programplan_unit_packages_changed',planId)).toBe(true);
  const school=await fixture.packageSnapshot(planId);expect(school.versions).toHaveLength(1);expect(school.selections).toHaveLength(1);
  expect(school.selections[0].row.selections[0].entries[0].distribution).toEqual([]);
  return school;
}
async function includeSchoolB(page:Page) {
  await workspace(page).getByRole('button',{name:'Skolor',exact:true}).click();const schools=page.getByRole('dialog',{name:'Skolor',exact:true});
  await schools.getByRole('checkbox',{name:'Syntetisk gymnasieskola B',exact:true}).check();
  const changed=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/programplaner/utbildning/livscykel'&&response.request().method()==='POST');
  await schools.getByRole('button',{name:'Spara skolor',exact:true}).click();expect((await changed).status()).toBe(200);await expect(schools).toHaveCount(0);
}
async function checkAnalysis(page:Page,status='Klar för beslut') {
  await workspace(page).getByRole('button',{name:/^Analys/u}).click();
  await expect(workspace(page).getByRole('heading',{name:'Analys av programplanen',exact:true})).toBeVisible();
  await noPackageControls(page);await expect(workspace(page).locator('.pp-status')).toContainText(status);
  // Missing choices/term allocation in the separate school offering are not
  // programplan errors or readiness requirements.
  await expect(workspace(page)).not.toContainText('paketval saknas');
  await expect(workspace(page)).not.toContainText('en paketnivå saknar terminer');
  await expect(workspace(page)).not.toContainText('paketet avviker från ramen');
  await expect(workspace(page)).not.toContainText('Individuellt val: nästa nivå i idrott saknas');
  await expect(workspace(page)).not.toContainText('Individuellt val: kontrollera estetiskt ämne');
}
test.beforeAll(async({browserName},info)=>{await info.attach('source-build.json',{body:JSON.stringify({...await verifyProgramplanBrowserTarget(baseURL),browserName,scope:'local-synthetic-only'}),contentType:'application/json'});});
test.beforeEach(async()=>{fixture=await createProgramplanBrowserFixture();});
test.afterEach(async({},info)=>{if(fixture)await info.attach('cleanup.json',{body:JSON.stringify(await fixture.cleanup()),contentType:'application/json'});});

test('F01: tomt skolutbud påverkar inte programplanens blockramar eller beslutsklarhet',async({page},info)=>{
  const planId=await createPlan(),attempts=await observeNoPackageRequests(page);
  const schoolBefore=await fixture.packageSnapshot(planId);expect(schoolBefore.versions).toHaveLength(0);expect(schoolBefore.selections).toHaveLength(0);
  await enter(page);await noPackageControls(page);const frame=await allocateFrame(page,planId);await checkAnalysis(page);
  await page.reload();await navigate(page);await noPackageControls(page);await expect(workspace(page).locator('.pp-status')).toContainText('Klar för beslut');
  const reread=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId});expect(reread.body).toEqual(frame);
  expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);expect(attempts).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath('frame-without-school-packages.png');await page.screenshot({path,fullPage:true});await info.attach('frame-without-school-packages.png',{path,contentType:'image/png'});
});

test('F02: tidigare sparat ofördelat IV-paket bevaras utan att påverka programplanens analys',async({page},info)=>{
  const planId=await createPlan(),schoolBefore=await saveSchoolOffering(planId);
  const attempts=await observeNoPackageRequests(page);await enter(page);await noPackageControls(page);const frame=await allocateFrame(page,planId),planBefore=await fixture.snapshot(planId);await checkAnalysis(page);
  await page.reload();await navigate(page);await noPackageControls(page);await expect(workspace(page).locator('.pp-status')).toContainText('Klar för beslut');await checkAnalysis(page);
  const reread=await fixture.request(baseURL,fixture.principal,'/api/programplaner/terminer/lasa',{planId});expect(reread.body).toEqual(frame);
  expect(await fixture.snapshot(planId)).toEqual(planBefore);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);expect(attempts).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath('frame-analysis-preserves-school-offering.png');await page.screenshot({path,fullPage:true});await info.attach('frame-analysis-preserves-school-offering.png',{path,contentType:'image/png'});
  await info.attach('separate-offering-preserved.json',{body:JSON.stringify({versions:schoolBefore.versions.length,selections:schoolBefore.selections.length,wholeRowsUnchanged:true,planRowUnchangedAfterAnalysis:true,packageApiAttempts:attempts}),contentType:'application/json'});
});

test('F03: HM kopierar ram, terminer och skolor till nästa elevkull utan skolans paketval',async({page},info)=>{
  const planId=await createPlan(),schoolBefore=await saveSchoolOffering(planId),attempts=await observeNoPackageRequests(page);
  await enter(page,fixture.hm);await noPackageControls(page);const frame=await allocateFrame(page,planId,fixture.hm);
  await includeSchoolB(page);
  const sourceUnits=(await fixture.units(fixture.emptyOfferingId)).map((unit:{unit_id:string})=>unit.unit_id);
  expect(sourceUnits).toEqual([fixture.unitId,fixture.secondUnitId]);
  const original=await fixture.snapshot(planId),originalOffering=await fixture.offering(fixture.emptyOfferingId),originalHistory=await fixture.history(planId);
  const startsOn=`${Number(FUTURE_START.slice(0,4))+1}${FUTURE_START.slice(4)}`;
  await workspace(page).getByRole('button',{name:'Kopiera',exact:true}).click();const form=workspace(page).getByRole('region',{name:'Kopiera till ny utbildning',exact:true});
  await noPackageControls(page);await form.getByLabel('Utbildningens namn',{exact:true}).fill('Syntetisk ramkopia utan skolutbud');
  await form.getByLabel('Elevkull',{exact:true}).fill('Syntetisk nästa elevkull');await form.getByLabel('Utbildningens exakta startdatum',{exact:true}).fill(startsOn);
  const created=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/programplaner/utbildning/skapa'&&response.request().method()==='POST');
  const terms=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/programplaner/terminer'&&response.request().method()==='POST');
  const copiedSchools=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/programplaner/utbildning/livscykel'&&response.request().method()==='POST');
  await form.getByRole('button',{name:'Spara kopia',exact:true}).click();const createdResponse=await created;expect(createdResponse.status()).toBe(200);const copy=await createdResponse.json();
  expect(createdResponse.request().postDataJSON()).toMatchObject({unitId:fixture.unitId,basisReference:{...original.basis_reference,startedOn:startsOn}});
  expect(Object.keys(createdResponse.request().postDataJSON()).sort()).toEqual(['basisReference','cohort','commandId','localCode','name','unitId']);
  const termResponse=await terms;expect(termResponse.status()).toBe(200);expect(termResponse.request().postDataJSON()).toMatchObject({planId:copy.plan.id,distribution:frame.distribution});
  const schoolResponse=await copiedSchools;expect(schoolResponse.status()).toBe(200);expect(schoolResponse.request().postDataJSON()).toMatchObject({offeringId:copy.education.id,command:'units',details:{unitIds:sourceUnits}});
  await expect(workspace(page).getByRole('heading',{name:'Syntetisk ramkopia utan skolutbud',exact:true})).toBeVisible();await expect(workspace(page)).toContainText('Kopian sparades');
  await noPackageControls(page);await expect(board(page)).toContainText('2 500 av 2 500 poäng fördelade');await expect(workspace(page).locator('.pp-status')).toContainText('Klar för beslut');
  const copied=await fixture.snapshot(copy.plan.id);expect(copied.offering_id).toBe(copy.education.id);expect(copied.status).toBe('utkast');expect(copied.version).toBe(1);
  expect(copied.specialization).toEqual(original.specialization);expect(copied.basis_reference).toEqual({...original.basis_reference,startedOn:startsOn});expect(copied.term_distribution).toEqual(frame.distribution);
  expect((await fixture.units(copy.education.id)).map((unit:{unit_id:string})=>unit.unit_id)).toEqual(sourceUnits);
  const newSchool=await fixture.packageSnapshot(copy.plan.id);expect(newSchool.selections).toEqual([]);expect(newSchool.versions).toEqual(schoolBefore.versions);
  expect(await fixture.snapshot(planId)).toEqual(original);expect(await fixture.offering(fixture.emptyOfferingId)).toEqual(originalOffering);expect(await fixture.history(planId)).toEqual(originalHistory);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);
  await page.reload();await navigate(page,/^Öppna utbildning Syntetisk ramkopia utan skolutbud,/u);await noPackageControls(page);await expect(workspace(page).locator('.pp-status')).toContainText('Klar för beslut');
  const reread=await fixture.request(baseURL,fixture.hm,'/api/programplaner/terminer/lasa',{planId:copy.plan.id});expect(reread.status).toBe(200);expect(reread.body.distribution).toEqual(frame.distribution);
  expect(await fixture.packageSnapshot(copy.plan.id)).toEqual(newSchool);expect(await fixture.snapshot(planId)).toEqual(original);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);expect(attempts).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath('copied-frame-without-school-offering.png');await page.screenshot({path,fullPage:true});await info.attach('copied-frame-without-school-offering.png',{path,contentType:'image/png'});
  await info.attach('copy-separation.json',{body:JSON.stringify({sourcePlanAndOfferingWholeRowsUnchanged:true,sourceHistoryUnchanged:true,sourcePackageWholeRowsUnchanged:true,copiedChoiceBlocks:copied.basis_reference.choiceBlocks,copiedTermPoints:2500,copiedSchoolCount:sourceUnits.length,newSchoolSelections:newSchool.selections.length,packageApiAttempts:attempts}),contentType:'application/json'});
});

test('F04: administratör och rektor på delad skola läser full ram utan termins- eller paketkommandon',async({page},info)=>{
  const planId=await createPlan(),schoolBefore=await saveSchoolOffering(planId),attempts=await observeNoPackageRequests(page);
  await enter(page,fixture.hm);const frame=await allocateFrame(page,planId,fixture.hm);await includeSchoolB(page);
  const originalOffering=await fixture.offering(fixture.emptyOfferingId);
  const commands:string[]=[],commandPaths=new Set(['/api/programplaner/terminer','/api/programplaner/block','/api/programplaner/nivaa','/api/programplaner/skapa','/api/programplaner/klona','/api/programplaner/binda','/api/programplaner/utbildning/skapa','/api/programplaner/utbildning/livscykel']);
  page.on('request',request=>{const path=new URL(request.url()).pathname;if(request.method()==='POST'&&commandPaths.has(path))commands.push(path);});
  for(const status of ['utkast','faststalld'] as const) {
    // Explicit synthetic fixture preparation, never a real fastställandebeslut.
    if(status==='faststalld')await fixture.sealOwnedPlan(planId);
    const original=await fixture.snapshot(planId),originalHistory=await fixture.history(planId),statusText=status==='utkast'?'Klar för beslut':'Fastställd';
    for(const [label,session,reason] of [['administratör',fixture.admin,'Du kan läsa planen men inte ändra den.'],['delad rektor',fixture.principalB,'Planen delas med skolor utanför ditt uppdrag och kan bara läsas']] as const) {
      await enter(page,session);await expect(workspace(page)).toContainText(reason);await noPackageControls(page);
      await expect(board(page)).toContainText('2 500 av 2 500 poäng fördelade');await expect(board(page).locator('tr[data-row-key="block:mosp"]')).toContainText('Moderna språk');await expect(board(page).locator('tr[data-row-key="block:iv1"]')).toContainText('Individuellt val');
      await expect(board(page).locator('input[inputmode="numeric"]')).toHaveCount(0);
      for(const name of ['Föreslå fördelning','Dela i block','Lägg till valbart block','Spara block','Skolor','Ändra uppgifter','Kopiera'])await expect(workspace(page).getByRole('button',{name,exact:true})).toHaveCount(0);
      await checkAnalysis(page,statusText);const analysis=workspace(page).getByRole('region',{name:'Analys av programplanen',exact:true});await expect(analysis.locator('.pps-link')).toHaveCount(0);
      expect(await fixture.snapshot(planId)).toEqual(original);expect(await fixture.offering(fixture.emptyOfferingId)).toEqual(originalOffering);expect(await fixture.history(planId)).toEqual(originalHistory);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);
      await page.reload();await navigate(page);await noPackageControls(page);await expect(workspace(page)).toContainText(reason);await expect(board(page)).toContainText('2 500 av 2 500 poäng fördelade');await expect(workspace(page).locator('.pp-status')).toContainText(statusText);
      const read=await fixture.request(baseURL,session,'/api/programplaner/terminer/lasa',{planId});expect(read.status).toBe(200);expect(read.body).toEqual({...frame,status});
      expect(await fixture.snapshot(planId)).toEqual(original);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);expect(commands).toEqual([]);expect(attempts).toEqual([]);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
      const path=info.outputPath(`frame-readonly-${status}-${label==='administratör'?'admin':'shared-principal'}.png`);await page.screenshot({path,fullPage:true});await info.attach(`${label}-${status}-frame.png`,{path,contentType:'image/png'});
    }
  }
  await info.attach('readonly-separation.json',{body:JSON.stringify({readers:['administrator','shared-principal'],statuses:['utkast','faststalld'],faststalldPreparation:'owned synthetic fixture only, no real decision',baselinePerStatus:true,termAndPlanCommands:commands,packageApiAttempts:attempts,sourcePlanAndOfferingWholeRowsUnchangedDuringReads:true,sourceHistoryUnchangedDuringReads:true,sourcePackageWholeRowsUnchanged:true}),contentType:'application/json'});
});

test('F05: äldre sparat utbud hindrar mindre IV-block med tydligt 409-besked och bevarade helrader',async({page},info)=>{
  const planId=await createPlan(),schoolBefore=await saveSchoolOffering(planId),attempts=await observeNoPackageRequests(page);
  // Keep frame terms empty: the server's historical offering guard must be the
  // actual reason for refusal, rather than the local allocated-frame guard.
  await enter(page);await noPackageControls(page);const original=await fixture.snapshot(planId),originalOffering=await fixture.offering(fixture.emptyOfferingId),originalHistory=await fixture.history(planId);
  const iv=board(page).getByRole('region',{name:'Block för individuellt val',exact:true});
  await iv.getByRole('button',{name:'Dela i block',exact:true}).click();await iv.getByLabel('Poäng för block iv1',{exact:true}).fill('100');await iv.getByRole('button',{name:'Lägg till block',exact:true}).click();
  await iv.locator('input[aria-label^="Namn på block "]').last().fill('Individuellt val 2');await expect(iv.locator('input[aria-label^="Poäng för block "]').last()).toHaveValue('100');
  const pending=page.waitForResponse(response=>new URL(response.url()).pathname==='/api/programplaner/block'&&response.request().method()==='POST');
  await iv.getByRole('button',{name:'Spara block',exact:true}).click();const response=await pending;expect(response.status()).toBe(409);expect((await response.json()).code).toBe('programplan_block_packages_in_use');
  expect(response.request().postDataJSON()).toMatchObject({planId,expectedRevision:original.revision});expect(response.request().postDataJSON().choiceBlocks.filter((block:{kind:string})=>block.kind==='individualChoice').map((block:{points:number})=>block.points)).toEqual([100,100]);
  await expect(board(page)).toContainText(/tidigare sparat utbud/iu);await expect(board(page)).toContainText(/bevaras/iu);await expect(board(page)).not.toContainText('Någon annan har ändrat planen');await expect(board(page)).not.toContainText('Läs om planen innan du ändrar blocken');
  await expect(iv.getByLabel('Poäng för block iv1',{exact:true})).toHaveValue('100');await expect(iv.getByRole('button',{name:'Spara block',exact:true})).toBeEnabled();await noPackageControls(page);
  expect(await fixture.snapshot(planId)).toEqual(original);expect(await fixture.offering(fixture.emptyOfferingId)).toEqual(originalOffering);expect(await fixture.history(planId)).toEqual(originalHistory);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);expect(attempts).toEqual([]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const path=info.outputPath('older-offering-block-change-refused.png');await page.screenshot({path,fullPage:true});await info.attach('older-offering-block-change-refused.png',{path,contentType:'image/png'});
  await iv.getByRole('button',{name:'Avbryt blockändring',exact:true}).click();await page.reload();await navigate(page);await noPackageControls(page);await expect(board(page).locator('tr[data-row-key="block:iv1"] .ppb-num')).toHaveText('200');
  expect(await fixture.snapshot(planId)).toEqual(original);expect(await fixture.packageSnapshot(planId)).toEqual(schoolBefore);expect(attempts).toEqual([]);
  await info.attach('old-offering-refusal.json',{body:JSON.stringify({status:409,code:'programplan_block_packages_in_use',misleadingRevisionConflict:false,sourcePlanAndOfferingWholeRowsUnchanged:true,sourceHistoryUnchanged:true,sourcePackageWholeRowsUnchanged:true,packageApiAttempts:attempts}),contentType:'application/json'});
});
