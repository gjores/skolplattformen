// 05.1-09: faktiskt prov av tjänstefördelningen mot egen Worker (127.0.0.1:3015), egen schemakopia och riktig OIDC.
// Föräldern (work/pilot/verify-tjanst-actual.mjs) äger kandidaten, schemakopian, migrationerna och Worker. Det här provet
// äger bara sina syntetiska data (en egen kund per projekt), sina slumpade IdP-användare och sina skärmbilder.
// Inga attrapper av autentisering, Worker eller databas. Två transportfel är uttryckligen märkta i fallen där de används.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,statSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {createRequire} from 'node:module';
import {test,expect,type Browser,type BrowserContext,type Page,type TestInfo} from '@playwright/test';
import {assertTarget} from '../../work/pilot/verify-target.mjs';
import {createTjanstOidcFixture,seedTjanstActual,TJANST_ACTUAL_CASES,TJANST_ACTUAL_ROLES} from '../../work/pilot/tjanst-oidc-fixtures.mjs';
const postgres=createRequire(import.meta.url)('postgres');
type Db=ReturnType<typeof postgres>;
type Fixture=Awaited<ReturnType<typeof createTjanstOidcFixture>>;
type Seed=Awaited<ReturnType<typeof seedTjanstActual>>;
type Check={case:string;name:string;ok:true;details?:unknown};

const sha=(v:Buffer|string)=>createHash('sha256').update(v).digest('hex');
const manifestPath=process.env.TJANST_ACTUAL_MANIFEST!,evidenceDir=process.env.TJANST_ACTUAL_EVIDENCE_DIR!;
const PHONE=(p:string)=>p.startsWith('phone');

test.describe.configure({mode:'serial'});

let db:Db,fixture:Fixture|undefined,seed:Seed,project='',baseURL='';
const contexts:Record<string,BrowserContext>={},pages:Record<string,Page>={},network:Record<string,{method:string;path:string;status:number|null;versionId?:string|null}[]>={};
const result:{status:string;project:string;checks:Check[];screenshots:{file:string;sha256:string;geometry:unknown}[];errors:unknown[];scope?:unknown}={status:'FAIL',project:'',checks:[],screenshots:[],errors:[]};
const save=()=>writeFileSync(path.join(evidenceDir,`browser-${project}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
function pass(name:string,check:string,details?:unknown){result.checks.push({case:name,name:check?`${name}: ${check}`:name,ok:true,...(details===undefined?{}:{details})});save();}

async function capture(page:Page,name:string){
  await page.evaluate(()=>document.fonts.ready);
  const geometry=await page.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,viewport:{w:innerWidth,h:innerHeight}}));
  assert.ok(geometry.scrollWidth<=geometry.width+1,'Ingen sidledsrullning på dokumentet ('+name+')');
  const file=`${project}-${name}.png`,output=path.join(evidenceDir,file);
  await page.screenshot({path:output,fullPage:false});result.screenshots.push({file,sha256:sha(readFileSync(output)),geometry});save();
}

async function context(browser:Browser,info:TestInfo,role:string){
  if(pages[role])return pages[role];
  const use=info.project.use as Record<string,unknown>;
  const ctx=await browser.newContext({viewport:use.viewport as {width:number;height:number},userAgent:use.userAgent as string|undefined,deviceScaleFactor:use.deviceScaleFactor as number|undefined,
    isMobile:use.isMobile as boolean|undefined,hasTouch:use.hasTouch as boolean|undefined,baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});
  contexts[role]=ctx;const page=await ctx.newPage();pages[role]=page;network[role]=[];
  page.on('pageerror',e=>{result.errors.push({role,message:e.message});save();});
  page.on('dialog',d=>void(d.type()==='beforeunload'?d.accept():d.dismiss()));
  ctx.on('request',req=>{const u=new URL(req.url());if(u.origin!==baseURL)return;const entry:{method:string;path:string;status:number|null;versionId?:string|null}={method:req.method(),path:u.pathname,status:null};
    // Planläsningens versionId loggas (bara syntetiska ID:n), så att nätverksloggen visar vilken version som lästes (WR-07).
    if(u.pathname==='/api/tjanst/plan/lasa')try{entry.versionId=(req.postDataJSON() as {versionId?:string}|null)?.versionId??null;}catch{entry.versionId=null;}
    network[role].push(entry);
    void req.response().then(r=>{if(r)entry.status=r.status();}).catch(()=>{});});
  return page;
}
async function signIn(browser:Browser,info:TestInfo,role:string,returnTo='/'){
  const page=await context(browser,info,role);await fixture!.login(page,role,{returnTo});
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();return page;
}

const ws=(page:Page)=>page.locator('.tjanst');
// Sektionen Matris; den rullbara behållaren inuti blir en egen region med samma namn när matrisen är bredare än ytan.
const matrix=(page:Page)=>ws(page).locator('section[aria-label="Matris"]');
const footer=(page:Page,label:string,teacher:string)=>page.locator(`[data-sum="${label}:${teacher}"]`);
async function settled(page:Page){await expect(ws(page)).toHaveAttribute('aria-busy','false');await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);}
/** Klickar en menypost; på telefon öppnas menyn först med knappen Visa eller dölj navigation. */
async function nav(page:Page,name:string){
  const item=page.locator('.nav-button:visible',{hasText:name});
  if(!await item.count())await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
  await page.locator('.nav-button:visible',{hasText:name}).first().click();
}
/** Öppnar Tjänstefördelning via menyn och väljer skola och läsår i planeringsvalet. */
async function openTjanst(page:Page,unitId:string){
  await nav(page,'Tjänstefördelning');
  const school=page.getByLabel('Planeringsskola',{exact:true}),year=page.getByLabel('Planeringsläsår',{exact:true});
  await expect(year).toBeVisible();
  if(await school.isEnabled()&&await school.inputValue()!==unitId)await school.selectOption(unitId);
  if(await year.inputValue()!==String(seed.year))await year.selectOption(String(seed.year));
  await expect(ws(page)).toBeVisible();await settled(page);
}

// oxlint-disable-next-line no-empty-pattern -- Playwright kräver ett objektmönster; provet använder inga fixturer här.
test.beforeAll(async({},info)=>{
  project=info.project.name;result.project=project;
  assert.ok(manifestPath.startsWith('/private/tmp/')&&evidenceDir.startsWith('/private/tmp/'));
  assert.equal(realpathSync(manifestPath),manifestPath);assert.equal(statSync(manifestPath).mode&0o077,0);assert.equal(statSync(evidenceDir).mode&0o077,0);
  const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
  assert.equal(manifest.kind,'tjanst-actual-owned-runtime');assert.equal(manifest.baseURL,'http://127.0.0.1:3015');assert.equal(process.env.PHASE5_BASE_URL,manifest.baseURL);
  assert.equal(manifest.provenance.dataCopied,false);assert.match(manifest.provenance.database,/^named_timplan_[a-f0-9]{32}$/u);
  baseURL=manifest.baseURL;
  const target=await assertTarget('protected',{requireIdp:true});assert.equal(target.projectId,manifest.provenance.sourceProject);
  const endpoint=new URL(target.dbUrl);assert.equal(endpoint.hostname,'127.0.0.1');assert.equal(endpoint.port,manifest.provenance.sourcePort);
  assert.notEqual(endpoint.pathname,'/'+manifest.provenance.database);endpoint.pathname='/'+manifest.provenance.database;
  // Uppgifterna för anslutningen finns bara i minnet. Manifestet innehåller bara syntetiska ID:n och ursprung.
  db=postgres(endpoint.toString(),{max:1,prepare:false,onnotice:()=>{}});
  const [identity]=await db`select current_database() database,(pg_control_system()).system_identifier::text system_identifier`;
  assert.equal(identity.database,manifest.provenance.database);assert.equal(identity.system_identifier,manifest.provenance.source.system_identifier);
  seed=await seedTjanstActual(db,{published:PHONE(project),linkGrim:project==='desktop-small',schoolB:project==='desktop'});result.scope={year:seed.year,customerId:seed.customerId,schools:seed.schools};save();
  const ownDir=path.join(evidenceDir,'oidc-'+project);mkdirSync(ownDir,{mode:0o700});
  const roles=PHONE(project)?['hm','principalA','teacherSelf']:project==='desktop-small'?['hm','principalA','admin']:[...TJANST_ACTUAL_ROLES];
  fixture=await createTjanstOidcFixture({db,provenance:manifest.provenance,baseURL,evidenceDir:ownDir,seed,roles});
});

test.afterAll(async()=>{
  const cleanup:{status:string;cleanup?:unknown;proof?:unknown;databaseClosed?:boolean}={status:'FAIL'};
  try{
    for(const ctx of Object.values(contexts))await ctx.close();
    writeFileSync(path.join(evidenceDir,`network-${project}.json`),JSON.stringify(network,null,1)+'\n',{mode:0o600});
    const required=TJANST_ACTUAL_CASES[project as keyof typeof TJANST_ACTUAL_CASES]??[];
    const missing=required.filter(name=>!result.checks.some(c=>c.case===name));
    result.status=missing.length===0&&result.errors.length===0?'PASS':'FAIL';(result as Record<string,unknown>).missing=missing;save();
  }finally{
    try{if(fixture){cleanup.cleanup=await fixture.cleanup();cleanup.proof=fixture.proof();cleanup.status='PASS';}}
    finally{if(db)await db.end();cleanup.databaseClosed=true;writeFileSync(path.join(evidenceDir,`oidc-${project}.json`),JSON.stringify(cleanup,null,2)+'\n',{mode:0o600});}
  }
});

const yy=()=>`${String(seed.year).slice(2)}/${String(seed.year+1).slice(2)}`;
/** Samma format som vyn (formatTime): heltal timmar med svensk tusentalsavgränsning och eventuella minuter. */
const fmt=(minutes:number)=>{const h=Math.floor(Math.abs(minutes)/60),m=Math.abs(minutes)%60;return `${minutes<0?'−':''}${h.toLocaleString('sv-SE')} h${m?` ${m} min`:''}`;};
const esc=(s:string)=>s.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const cellRe=(teacher:string,course:string,cls:string)=>new RegExp(`^${esc(teacher)}, ${esc(course)}, ${esc(cls)}: `,'u');
const cell=(page:Page,teacher:string,course:string,cls:string)=>matrix(page).getByRole('button',{name:cellRe(teacher,course,cls)});
const responseOf=(path:string)=>(r:{url():string})=>new URL(r.url()).pathname===path;
/** Rektorns aktuella version för skolan och läsåret i schemakopian. */
async function versionsOf(unitId:string){
  return Array.from(await db`select v.id,v.version_no::int no,v.status from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id
    where d.unit_id=${unitId} and d.school_year=${seed.year} order by v.version_no`) as {id:string;no:number;status:string}[];
}
async function addTeacher(page:Page,name:string,option=name){
  const start=ws(page).locator('.tjanst-state').getByRole('button',{name:'Lägg till lärare i fördelningen'});
  if(await start.count())await start.click();else await ws(page).locator('.tjanst-actions').getByRole('button',{name:'Lägg till lärare i fördelningen'}).click();
  const dialog=page.getByRole('dialog',{name:'Lägg till lärare i fördelningen'});await dialog.getByLabel('Lärare').selectOption({label:option});
  await dialog.getByRole('button',{name:'Lägg till läraren'}).click();
  await expect(ws(page).getByText(`${name} är tillagd i fördelningen.`)).toBeVisible();await settled(page);
}
/** Sparar en tjänsterad via matriscellen; tom sträng lämnar det förifyllda värdet. */
async function saveRow(page:Page,teacher:string,course:string,cls:string,{ht,vt}:{ht?:string;vt?:string}){
  const target=cell(page,teacher,course,cls);await target.click();
  const dialog=page.getByRole('dialog');
  if(ht!==undefined)await dialog.getByLabel('Lärartid HT (timmar)').fill(ht);
  if(vt!==undefined)await dialog.getByLabel('Lärartid VT (timmar)').fill(vt);
  const done=page.waitForResponse(responseOf('/api/tjanst/plan/kommando'));
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();expect((await done).status()).toBe(200);
  await expect(ws(page).getByText(new RegExp(`^Tjänsteraden är sparad: ${esc(teacher)}, ${esc(course)}, ${esc(cls)}, `,'u'))).toBeVisible();await settled(page);
}
/** Öppnar rektors Fastställ-panel och publicerar; med stepUp kontrolleras att servern kräver engångskod och step-up görs via knappen. */
async function publish(page:Page,role:string,versionNo:number,{stepUp=false}={}){
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  if(!await panel.isVisible())await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await panel.getByRole('button',{name:'Fastställ och publicera…'}).click();
  let dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:`Fastställ och publicera version ${versionNo}?`})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Behåll utkastet'})).toBeFocused();
  if(stepUp){
    const sent=page.waitForResponse(responseOf('/api/tjanst/plan/publicera'));
    await dialog.getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
    const denied=await sent;expect(denied.status()).toBe(403);expect((await denied.json()).code).toBe('mfa_required');
    await expect(dialog.getByRole('alert')).toContainText('Att fastställa och publicera kräver verifiering med engångskod.');
    const proof=await fixture!.login(page,role,{stepUp:true,trigger:()=>dialog.getByRole('button',{name:'Verifiera med engångskod'}).click()});
    expect(proof.mfa).toBe(true);await settled(page);
    await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
    await panel.getByRole('button',{name:'Fastställ och publicera…'}).click();dialog=page.getByRole('dialog');
  }
  const done=page.waitForResponse(responseOf('/api/tjanst/plan/publicera'));
  await dialog.getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  expect((await done).status()).toBe(200);
  await expect(ws(page).getByText(`Version ${versionNo} är fastställd och publicerad. Lärarna ser den i Min tjänst.`)).toBeVisible();
  await settled(page);
}
/** Skapar och kopplar en GR- eller IM-klass i Timplaner (05.1-01) som rektor. */
async function linkClassInTimplaner(page:Page,{form,education,name,column}:{form:'grundskola'|'introduktionsprogram';education:string;name:string;column:string|null}){
  await page.goto(baseURL+'/?vy=timplaner');
  await page.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));
  await page.getByRole('button',{name:'Grundskola och introduktionsprogram',exact:true}).click();
  const skolform=page.getByRole('combobox',{name:'Skolform',exact:true}),row=page.getByRole('row',{name:new RegExp(esc(education),'u')});
  const label=form==='grundskola'?'Grundskola':'Introduktionsprogram';
  await expect(skolform).toBeVisible();
  if(await skolform.locator('option:checked').innerText()!==label)await skolform.selectOption({label});
  await expect(row).toBeVisible({timeout:20000});
  await row.getByRole('button',{name:'Öppna'}).click();
  const section=page.getByRole('region',{name:'Klasser och läsår för GR/IM'});
  await section.getByRole('button',{name:'Koppla klass'}).click();
  await section.getByRole('button',{name:'Skapa klass'}).click();
  const dialog=page.getByRole('dialog',{name:'Skapa klass'});await dialog.getByLabel('Klassnamn').fill(name.toLowerCase());
  await dialog.getByRole('button',{name:'Skapa klass'}).click();
  await expect(section.getByText(`Klassen ${name} är skapad`,{exact:false})).toBeVisible();
  if(column)await section.getByLabel(`Årskurs för ${name}`).selectOption({label:column});
  await section.getByRole('button',{name:`Koppla ${name}`}).click();
  await expect(section.getByText(/koppling till .* är sparad/u)).toBeVisible();
  await expect(section.locator('[aria-busy]').first()).toHaveAttribute('aria-busy','false');
  await expect(page.getByText('Invänta sparandet eller läs sparstatus innan du lämnar vyn.')).toHaveCount(0);
  return section;
}

// ───────────────────────────── Dator (1440 × 900): alla fall ─────────────────────────────

test('spår: rektor A tilldelar en Gy25-rad och publicerar med engångskod; P1 ser raden i Min tjänst',async({browser},info)=>{
  test.skip(project!=='desktop','Spåret körs på projektet desktop.');
  const p=await signIn(browser,info,'principalA');
  await openTjanst(p,seed.schools.A);
  await expect(ws(p).getByRole('heading',{name:`Ingen tjänstefördelning för läsåret ${yy()} ännu`})).toBeVisible();
  await addTeacher(p,'Pia Ek');
  await expect(ws(p).getByText('Utkast',{exact:true})).toBeVisible();
  const first=matrix(p).getByRole('button',{name:/^Pia Ek, .*, SYNBF1: ingen tid\. Tilldela\.$/u}).first();
  const cellName=(await first.getAttribute('aria-label'))??'';const course=cellName.split(', ')[1];
  await first.click();const dialog=p.getByRole('dialog');
  await expect(dialog.getByText('Schemalagd tid')).toBeVisible();await expect(dialog.getByText('Underlag saknas')).toBeVisible();
  await expect(dialog.getByText(/^Källa: .* version 1, ämnesrad /u)).toBeVisible();
  const ht=await dialog.getByLabel('Lärartid HT (timmar)').inputValue();
  await capture(p,'spar-tjansterad');
  await dialog.getByLabel('Lärartid VT (timmar)').fill('40');
  await expect(dialog.getByText(/^Avvikelse VT: /u)).toBeVisible();
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(ws(p).getByText(new RegExp(`^Tjänsteraden är sparad: Pia Ek, ${esc(course)}, SYNBF1, HT ${esc(ht)} h · VT 40 h\\.$`,'u'))).toBeVisible();await settled(p);
  await expect(cell(p,'Pia Ek',course,'SYNBF1')).toBeFocused();
  await expect(footer(p,'Undervisning','Pia Ek')).toHaveText(fmt(Number(ht)*60+2400));
  await capture(p,'spar-matris');
  await fixture!.expireMfa(p,'principalA');
  await publish(p,'principalA',1,{stepUp:true});
  await capture(p,'spar-publicerad');
  const versions=await versionsOf(seed.schools.A);expect(versions.map(v=>[v.no,v.status])).toEqual([[1,'published']]);
  pass('spår','rektor A tilldelar en Gy25-rad i matrisen och publicerar efter riktig step-up',{cell:cellName,prefilledHt:ht,versions});
  const t=await signIn(browser,info,'teacherSelf');
  await expect(t.getByRole('heading',{name:'Min tjänst',level:1})).toBeVisible();
  const card=t.locator('.min-tjanst-card').first();
  await expect(card.getByRole('row').filter({hasText:'SYNBF1'})).toContainText(course);
  await expect(t.getByText(`Syntetisk skola A · läsåret ${yy()} · version 1, publicerad`,{exact:false})).toBeVisible();
  await capture(t,'spar-min-tjanst');
  const paths=network.teacherSelf.map(n=>n.path).filter(x=>x.startsWith('/api/'));
  expect(paths.filter(x=>x.startsWith('/api/elever')||x.startsWith('/api/planering'))).toEqual([]);
  expect(paths.every(x=>x==='/api/session'||x.startsWith('/api/auth/')||x.startsWith('/api/tjanst/egen/'))).toBe(true);
  const direct=await fixture!.request(t,'teacherSelf','/api/elever/lista',{selection:{schoolYear:seed.year,unitId:seed.schools.A,classId:null,educationId:null,grade:null,status:null,page:1},search:''});
  expect(direct.status).toBe(403);
  const plan=await fixture!.request(t,'teacherSelf','/api/tjanst/plan/lasa',{unitId:seed.schools.A,schoolYear:seed.year});expect(plan.status).toBe(403);
  pass('spår','P1 landar i Min tjänst och ser raden; nätverksloggen saknar /api/elever och /api/planering; direktanrop mot /api/elever/lista ger 403',
    {apiPaths:[...new Set(paths)],direct:direct.status,planRead:plan.status});
});

test('GR- och IM-klass kopplas av rektor i Timplaner och syns med behov; okopplad klass utan nollor; ny version',async()=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const p=pages.principalA;
  const gr=await linkClassInTimplaner(p,{form:'grundskola',education:'Syntetisk grundskola 7–9',name:'SYNGR8',column:'Åk 8'});
  await capture(p,'grim-gr-kopplad');void gr;
  await linkClassInTimplaner(p,{form:'introduktionsprogram',education:'Syntetiskt introduktionsprogram',name:'SYNIM',column:null});
  const links=Array.from(await db`select c.name,l.column_id,l.timplan_id from public.class_timplans l join public.school_classes c on c.id=l.class_id
    where c.unit_id=${seed.schools.A} and l.start_year=${seed.year} and c.name in ('SYNGR8','SYNIM') order by c.name`) as {name:string;column_id:string;timplan_id:string}[];
  expect(links.map(l=>[l.name,l.column_id,l.timplan_id])).toEqual([['SYNGR8','ak8',seed.grim.grPlan],['SYNIM','vecka',seed.grim.imPlan]]);
  await openTjanst(p,seed.schools.A);
  // Publicerad version 1 är skrivskyddad; Ändra i ny version skapar utkastet version 2 och lärarna ser version 1.
  await expect(matrix(p).getByRole('button',{name:/Ändra\.$|Tilldela\.$/u})).toHaveCount(0);
  await ws(p).getByRole('button',{name:'Ändra i ny version'}).click();
  await expect(ws(p).getByText('Utkastet version 2 är skapat. Lärarna ser version 1 tills du publicerar.')).toBeVisible();await settled(p);
  await expect(ws(p).getByText(/^Lärarna ser version 1, publicerad \d{4}-\d\d-\d\d\.$/u)).toBeVisible();
  const grGroup=matrix(p).locator('tbody').filter({has:p.getByRole('rowheader',{name:/^SYNGR8 · /u})});
  await expect(grGroup.getByRole('rowheader',{name:/^SYNGR8 · .* version 1/u})).toBeVisible();
  const math=grGroup.getByRole('row').filter({has:p.getByRole('rowheader',{name:/^Matematik/u})});
  await expect(math.locator('td').first()).toHaveText('90 h');
  await ws(p).getByRole('button',{name:'HT',exact:true}).click();await settled(p);
  await expect(math.locator('td').first()).toHaveText('45 h');
  const [weeks]=await db`select public.tjanst_school_weeks(${seed.schools.A}::uuid,${seed.year}::int) w`;
  const imGroup=matrix(p).locator('tbody').filter({has:p.getByRole('rowheader',{name:/^SYNIM · /u})});
  const imMath=imGroup.getByRole('row').filter({has:p.getByRole('rowheader',{name:/^Matematik, grundskolenivå/u})});
  await expect(imMath.locator('td').first()).toHaveText(fmt(3*12*weeks.w.htSchoolDays));
  await ws(p).getByRole('button',{name:'VT',exact:true}).click();await settled(p);
  await expect(imMath.locator('td').first()).toHaveText(fmt(3*12*weeks.w.vtSchoolDays));
  await expect(math.locator('td').first()).toHaveText('45 h');
  await ws(p).getByRole('button',{name:'Hela läsåret',exact:true}).click();await settled(p);
  await capture(p,'grim-matris');
  pass('GR/IM-klass i Timplaner med behov','GR åk 8 delas 50/50 (Matematik 90 h → HT 45 h, VT 45 h) och IM räknas ur kalendern (3 h/vecka × skoldagar)',
    {links,weeks:weeks.w,imHt:fmt(3*12*weeks.w.htSchoolDays),imVt:fmt(3*12*weeks.w.vtSchoolDays)});
  const loose=matrix(p).locator('tbody').filter({has:p.getByRole('rowheader',{name:'SYN9X · koppling saknas'})});
  await expect(loose).toContainText(`Klassen har ingen timplan för läsåret ${yy()}. Behovet är okänt, inte noll.`);
  await expect(loose).not.toContainText(/\b0 h\b/u);await expect(loose.getByRole('button',{name:'Öppna klasskopplingar'})).toBeVisible();
  const sums=await db`select public.tjanst_needs(${seed.schools.A}::uuid,${seed.year}::int) n`;
  const looseNeeds=(sums[0].n as {classId:string;link:unknown;needs:unknown[]}[]).find(c=>c.classId===seed.grim.looseClassId);
  expect(looseNeeds).toMatchObject({link:null,needs:[]});
  pass('okopplad klass utan nollor','SYN9X visar koppling saknas, inga 0 h och inga behov i serverns underlag',{looseNeeds});
  // Läraren ser fortfarande version 1.
  const t=pages.teacherSelf;await t.reload();
  await expect(t.getByText(`version 1, publicerad`,{exact:false}).first()).toBeVisible();
  await expect(t.getByText(/version 2/u)).toHaveCount(0);
  const versions=await versionsOf(seed.schools.A);expect(versions.map(v=>[v.no,v.status])).toEqual([[1,'published'],[2,'draft']]);
  pass('ny version: läraren ser den tidigare','Ändra i ny version skapar utkastet version 2; statusraden och P1:s Min tjänst visar version 1',{versions});
});

test('äldre version läsbar skrivskyddat (D-24) och fördela tom cell med omläsning; annan skola och annat läsår nekas',async()=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const p=pages.principalA;
  const versionSelect=ws(p).getByLabel('Visa version');
  const v1Label=(await versionSelect.locator('option').allInnerTexts()).find(t=>t.startsWith('Version 1 · publicerad'));expect(v1Label).toBeTruthy();
  await versionSelect.selectOption({label:v1Label!});
  await expect(ws(p).getByText(/^Du läser version 1 skrivskyddat, publicerad \d{4}-\d\d-\d\d av .*\. Lärarna ser den här versionen\.$/u)).toBeVisible();
  await settled(p);
  await expect(matrix(p).getByRole('button',{name:/Ändra\.$|Tilldela\.$/u})).toHaveCount(0);
  await expect(ws(p).getByRole('button',{name:/Lägg till lärare|Lägg till specialuppdrag|Ändra i ny version/u})).toHaveCount(0);
  await capture(p,'d24-aldre-version');
  await ws(p).getByLabel('Visa version').selectOption({label:'Aktuell version'});await settled(p);
  await expect(ws(p).getByRole('button',{name:'Lägg till specialuppdrag'})).toBeVisible();
  pass('äldre version skrivskyddad (D-24)','Visa version 1 visar hela versionen utan redigeringskontroller och med texten om att lärarna ser den');
  // AE1: tom cell för Tor Berg (person utan konto), förifylld tid, ändrad VT, sparad och omläst.
  await addTeacher(p,'Tor Berg');
  const target=cell(p,'Tor Berg','Matematik','SYNGR8');await expect(target).toHaveAccessibleName('Tor Berg, Matematik, SYNGR8: ingen tid. Tilldela.');
  await target.click();const dialog=p.getByRole('dialog');
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('45');await expect(dialog.getByLabel('Lärartid VT (timmar)')).toHaveValue('45');
  await dialog.getByLabel('Lärartid VT (timmar)').fill('40');await expect(dialog.getByText('Avvikelse VT: −5 h')).toBeVisible();
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(ws(p).getByText('Tjänsteraden är sparad: Tor Berg, Matematik, SYNGR8, HT 45 h · VT 40 h.')).toBeVisible();await settled(p);
  await expect(cell(p,'Tor Berg','Matematik','SYNGR8')).toBeFocused();
  await p.reload();await settled(p);
  await expect(cell(p,'Tor Berg','Matematik','SYNGR8')).toHaveAccessibleName('Tor Berg, Matematik, SYNGR8: 85 h. Ändra.');
  const mathRow=matrix(p).locator('tbody').filter({has:p.getByRole('rowheader',{name:/^SYNGR8 · /u})}).getByRole('row').filter({has:p.getByRole('rowheader',{name:/^Matematik/u})});
  await expect(mathRow.locator('.tjanst-deviation')).toHaveText('−5 h');
  await expect(footer(p,'Undervisning','Tor Berg')).toHaveText('85 h');await expect(footer(p,'Totalt','Tor Berg')).toHaveText('85 h');
  const [stored]=await db`select r.teacher_ht_minutes::int ht,r.teacher_vt_minutes::int vt,r.need_ht_minutes::int nht,r.need_vt_minutes::int nvt from public.tjanst_rows r
    join public.tjanst_versions v on v.id=r.version_id join public.tjanst_distributions dd on dd.id=v.distribution_id and dd.unit_id=${seed.schools.A} and dd.school_year=${seed.year} where r.staff_person_id=${seed.people.t2} and v.status='draft'`;
  expect(stored).toEqual({ht:2700,vt:2400,nht:2700,nvt:2700});
  pass('fördela tom cell','förifylld tid 45/45 h, ändrad VT till 40 h, sparad, omläst; avvikelse −5 h och fotraden 85 h; behov och lärartid lagras åtskilda',{stored});
  pass('person utan konto får rader','Tor Berg saknar konto och får en tjänsterad');
  // Direktanrop: annan skola och annat läsår.
  const read=await fixture!.request(p,'principalA','/api/tjanst/plan/lasa',{unitId:seed.schools.B,schoolYear:seed.year});expect(read.status).toBe(403);
  const otherSchool=await fixture!.request(p,'principalA','/api/tjanst/plan/kommando',await createCommand(seed.schools.B,seed.year,'create_draft',0,{basedOnVersionId:null}));
  expect(otherSchool.status).toBe(403);
  const [current]=await db`select d.revision::int r,v.id from public.tjanst_distributions d join public.tjanst_versions v on v.distribution_id=d.id and v.status='draft' where d.unit_id=${seed.schools.A} and d.school_year=${seed.year}`;
  const [sourceRow]=await db`select source_key from public.tjanst_rows where version_id=${current.id} and staff_person_id=${seed.people.t2}`;
  const otherYear=await fixture!.request(p,'principalA','/api/tjanst/plan/kommando',await createCommand(seed.schools.A,seed.year+1,'save_row',current.r,
    {rowId:null,sourceKind:'class_timplan',sourceKey:sourceRow.source_key,personId:seed.people.t2,teacherHt:60,teacherVt:60,comment:''}));
  expect(otherYear.status).toBeGreaterThanOrEqual(400);
  const [count]=await db`select count(*)::int n from public.tjanst_distributions where school_year=${seed.year+1} and unit_id in (${seed.schools.A},${seed.schools.B})`;expect(count.n).toBe(0);
  pass('annan skola och annat läsår nekas','rektor A: läsning av skola B 403, kommando för skola B 403, rad med källa från läsåret i ett annat läsår nekas och inget skrivs',
    {readB:read.status,commandB:otherSchool.status,otherYear:{status:otherYear.status,code:otherYear.body?.code,reason:otherYear.body?.details?.reason}});
});

test('specialuppdrag: mentor med klass och programansvar utan grupp, skilt från undervisning',async()=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const p=pages.principalA;
  const add=async(kind:string,teacher:string,cls:string|null,ht:string,vt:string)=>{
    await ws(p).getByRole('button',{name:'Lägg till specialuppdrag'}).click();const dialog=p.getByRole('dialog');
    await dialog.getByLabel('Typ').selectOption(kind);await dialog.getByLabel('Lärare').selectOption({label:teacher});
    if(cls)await dialog.getByLabel('Klass (valfri)').selectOption({label:cls});
    await dialog.getByLabel('Tid HT (timmar)').fill(ht);await dialog.getByLabel('Tid VT (timmar)').fill(vt);
    await dialog.getByRole('button',{name:'Spara specialuppdraget'}).click();
  };
  await add('mentor','Pia Ek','SYNBF1','10','10');
  await expect(ws(p).getByText('Specialuppdraget Mentor är sparat för Pia Ek.')).toBeVisible();await settled(p);
  await add('programansvar','Tor Berg',null,'20','20');
  await expect(ws(p).getByText('Specialuppdraget Programansvar är sparat för Tor Berg.')).toBeVisible();await settled(p);
  await expect(footer(p,'Specialuppdrag','Pia Ek')).toHaveText('20 h');await expect(footer(p,'Specialuppdrag','Tor Berg')).toHaveText('40 h');
  await expect(footer(p,'Undervisning','Tor Berg')).toHaveText('85 h');await expect(footer(p,'Totalt','Tor Berg')).toHaveText('125 h');
  await ws(p).getByRole('tab',{name:'Specialuppdrag'}).click();
  const view=ws(p).getByRole('region',{name:'Specialuppdrag'});
  const mentor=view.getByRole('row').filter({hasText:'Mentor'}),program=view.getByRole('row').filter({hasText:'Programansvar'});
  await expect(mentor).toContainText('Pia Ek');await expect(mentor).toContainText('SYNBF1');
  await expect(program).toContainText('Tor Berg');await expect(program).toContainText('Ingen grupp');
  await capture(p,'specialuppdrag');
  await ws(p).getByRole('tab',{name:'Per lärare'}).click();await ws(p).getByLabel('Lärare',{exact:true}).selectOption({label:'Pia Ek'});
  const facts=ws(p).getByRole('region',{name:'Per lärare'}).locator('dl.tjanst-facts');
  await expect(facts).toContainText('SpecialuppdragHT 10 h · VT 10 h · Läsår 20 h');
  const specials=Array.from(await db`select s.kind,s.class_id,s.ht_minutes::int ht,s.vt_minutes::int vt from public.tjanst_special_assignments s join public.tjanst_versions v on v.id=s.version_id
    join public.tjanst_distributions dd on dd.id=v.distribution_id and dd.unit_id=${seed.schools.A} and dd.school_year=${seed.year} where v.status='draft' order by s.kind`) as {kind:string;class_id:string|null;ht:number;vt:number}[];
  expect(specials.map(x=>[x.kind,x.class_id===null?null:'klass',x.ht,x.vt])).toEqual([['mentor','klass',600,600],['programansvar',null,1200,1200]]);
  await ws(p).getByRole('tab',{name:'Matris'}).click();await settled(p);
  pass('specialuppdrag','mentor med klass och programansvar utan grupp syns i vyn Specialuppdrag och i lärarens summa Specialuppdrag, skilt från undervisning',{specials});
});

test('samläsning en gång och två lärare på samma kurs; lägg upp ny lärare',async()=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const p=pages.principalA;
  await addTeacher(p,'Ulla Sund');
  await saveRow(p,'Ulla Sund','Biologi','SYNGR8',{ht:'50',vt:'0'});
  await saveRow(p,'Tor Berg','Biologi','SYNGR8',{ht:'0',vt:'50'});
  await ws(p).getByRole('tab',{name:'Per klass'}).click();await ws(p).getByLabel('Klass',{exact:true}).selectOption({label:'SYNGR8'});
  const bio=ws(p).getByRole('region',{name:'Per klass'}).getByRole('row').filter({hasText:'Biologi'});
  await expect(bio).toContainText('100 av 100 h · 2 lärare');await expect(bio).toContainText('Ulla Sund');await expect(bio).toContainText('Tor Berg');
  await capture(p,'per-klass-tva-larare');
  pass('två lärare på samma kurs','Biologi SYNGR8 med Ulla Sund (HT 50 h) och Tor Berg (VT 50 h) visar 100 av 100 h · 2 lärare');
  await ws(p).getByRole('tab',{name:'Matris'}).click();await settled(p);
  await saveRow(p,'Ulla Sund','Engelska','SYNGR8',{ht:'30',vt:'30'});
  await saveRow(p,'Ulla Sund','Engelska, grundskolenivå','SYNIM',{ht:'30',vt:'30'});
  await expect(footer(p,'Undervisning','Ulla Sund')).toHaveText('170 h');
  await ws(p).getByRole('tab',{name:'Per kurs/ämne'}).click();await settled(p);
  const course=ws(p).getByRole('region',{name:'Per kurs/ämne'});
  await course.getByRole('checkbox',{name:'Markera Engelska SYNGR8, Ulla Sund'}).check();
  await course.getByRole('checkbox',{name:'Markera Engelska, grundskolenivå SYNIM, Ulla Sund'}).check();
  await expect(course.getByText('2 rader markerade')).toBeVisible();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();
  const dialog=p.getByRole('dialog');await expect(dialog.getByLabel('Namn')).not.toHaveValue('');
  await dialog.getByLabel('HT (timmar)').fill('30');await dialog.getByLabel('VT (timmar)').fill('30');
  await capture(p,'samlasning-dialog');
  await dialog.getByRole('button',{name:'Spara samläsningen'}).click();
  await expect(ws(p).getByText(/^Samläsningen .* är sparad\. Lärartiden räknas en gång och klasserna SYNGR8 och SYNIM visas som täckta\.$/u)).toBeVisible();await settled(p);
  await ws(p).getByRole('tab',{name:'Matris'}).click();await settled(p);
  await expect(footer(p,'Undervisning','Ulla Sund')).toHaveText('110 h');
  for(const cls of ['SYNGR8','SYNIM'])await expect(matrix(p).locator('tbody').filter({has:p.getByRole('rowheader',{name:new RegExp(`^${cls} · `,'u')})})
    .getByRole('rowheader',{name:/^Engelska/u})).toContainText('Samläsning');
  const [joint]=await db`select g.name,(select count(*)::int from public.tjanst_joint_members m where m.group_id=g.id) members,
    (select json_agg(json_build_object('ht',t.ht_minutes,'vt',t.vt_minutes)) from public.tjanst_joint_teacher_time t where t.group_id=g.id) teachers
    from public.tjanst_joint_groups g join public.tjanst_versions v on v.id=g.version_id join public.tjanst_distributions dd on dd.id=v.distribution_id and dd.unit_id=${seed.schools.A} and dd.school_year=${seed.year} where v.status='draft'`;
  expect(joint.members).toBe(2);expect(joint.teachers).toEqual([{ht:1800,vt:1800}]);
  await capture(p,'samlasning-matris');
  pass('samläsning räknas en gång','Ulla Sunds två rader i SYNGR8 och SYNIM kopplas; Undervisning går från 170 h till 110 h och båda klasserna visas som täckta',{joint});
  // Utkastlärare från rektor.
  await ws(p).getByRole('button',{name:'Lägg upp ny lärare'}).click();const draft=p.getByRole('dialog');
  await draft.getByLabel('Förnamn').fill('Vera');await draft.getByLabel('Efternamn').fill('Nord');
  await draft.getByLabel('Meddelande till huvudmannen (valfritt)').fill('Syntetisk vikarie i engelska');
  await draft.getByRole('button',{name:'Lägg upp läraren'}).click();
  await expect(ws(p).getByText('Vera Nord är upplagd som ny lärare. Huvudmannen kompletterar anställning och andel.')).toBeVisible();await settled(p);
  await addTeacher(p,'Vera Nord','Vera Nord (ny lärare)');
  await expect(matrix(p).getByRole('columnheader',{name:/Vera Nord/u})).toContainText('Ny lärare');
  const [veraRow]=await db`select status,proposed_for_unit_id from public.staff_people where given_name='Vera' and family_name='Nord' and customer_id=${seed.customerId}`;
  expect(veraRow).toEqual({status:'draft',proposed_for_unit_id:seed.schools.A});
  pass('utkastlärare från rektor','Lägg upp ny lärare skapar Vera Nord som utkast för skola A; kolumnen har märket Ny lärare');
});

test('administratör förbereder utan beslutsknapp och nekas publicering; rektor publicerar; kvittens och kommentar till tjanst_feedback',async({browser},info)=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const admin=await signIn(browser,info,'admin');await openTjanst(admin,seed.schools.A);
  await expect(ws(admin).getByText('Du kan förbereda fördelningen. Rektor fastställer och publicerar.')).toBeVisible();
  await expect(ws(admin).getByRole('button',{name:'Lägg till lärare i fördelningen'})).toBeVisible();
  await ws(admin).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(admin).getByRole('region',{name:'Fastställ och publicera'});
  await expect(panel.getByText('Rektor fastställer och publicerar fördelningen. Du kan fortsätta förbereda utkastet.')).toBeVisible();
  // Servern ger skoladministratören discard_draft (förberedelse) men aldrig publish (D-01).
  await expect(panel.getByRole('button',{name:'Fastställ och publicera…'})).toHaveCount(0);
  await capture(admin,'administrator-panel');
  const [d]=await db`select d.revision::int r,v.content_hash h from public.tjanst_distributions d join public.tjanst_versions v on v.distribution_id=d.id and v.status='draft' where d.unit_id=${seed.schools.A} and d.school_year=${seed.year}`;
  const denied=await fixture!.request(admin,'admin','/api/tjanst/plan/publicera',await createCommand(seed.schools.A,seed.year,'publish',d.r,{},{expectedContentHash:d.h}));
  expect(denied.status).toBe(403);expect(denied.body.code).toBe('forbidden');
  expect((await versionsOf(seed.schools.A)).map(v=>v.status)).toEqual(['published','draft']);
  pass('administratör utan knapp och 403 vid publicering','skoladministratören ser texten om att rektor fastställer, ingen beslutsknapp, och direktanrop till publicera ger 403 utan att något publiceras',{status:denied.status,code:denied.body.code});
  // Rektor publicerar version 2; P1 kvitterar och kommenterar.
  const p=pages.principalA;await publish(p,'principalA',2);
  const versions=await versionsOf(seed.schools.A);const v2=versions.find(v=>v.no===2)!;expect(v2.status).toBe('published');
  const counts=async()=>(await db`select count(*) filter (where kind='ack')::int ack,count(*) filter (where kind='comment')::int comment from public.tjanst_feedback where version_id=${v2.id} and staff_person_id=${seed.people.p1}`)[0];
  const before=await counts();expect(before).toEqual({ack:0,comment:0});
  const t=pages.teacherSelf;await t.reload();const card=t.locator('.min-tjanst-card').first();
  await expect(card.getByText('Rektor har publicerat version 2. Läs igenom och kvittera den nya versionen.')).toBeVisible();
  await expect(card.getByRole('row').filter({hasText:'Mentor'})).toContainText('SYNBF1');
  const ack=t.waitForRequest(r=>new URL(r.url()).pathname==='/api/tjanst/egen/kommando'&&r.method()==='POST');
  await card.getByRole('button',{name:'Kvittera att jag har läst'}).click();
  const ackRequest=await ack;expect(ackRequest.postDataJSON()).toMatchObject({action:'ack',versionId:v2.id});
  await expect(card.getByText('Du har kvitterat version 2.')).toBeVisible();await expect(card.getByText(/^Kvitterad \d{4}-\d\d-\d\d$/u)).toBeVisible();
  const text='Syntetisk fråga: kan mentorstiden ligga kvar på VT?';
  await card.getByLabel('Kommentar till rektor').fill(text);
  const comment=t.waitForRequest(r=>new URL(r.url()).pathname==='/api/tjanst/egen/kommando'&&r.method()==='POST');
  await card.getByRole('button',{name:'Skicka kommentar'}).click();
  const commentRequest=await comment;expect(commentRequest.postDataJSON()).toMatchObject({action:'comment',versionId:v2.id,body:text});
  await expect(card.getByText('Kommentaren är skickad till rektor.')).toBeVisible();await expect(card.locator('.min-tjanst-comments')).toContainText(text);
  const after=await counts();expect(after).toEqual({ack:1,comment:1});
  expect(Object.keys(commentRequest.postDataJSON()).sort()).toEqual(['action','body','commandId','versionId']);
  await capture(t,'min-tjanst-kvitterad');
  await p.reload();await settled(p);
  await expect(ws(p).getByText(/^Kvitterad av 1 av \d+ lärare$/u)).toBeVisible();
  await ws(p).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const rp=ws(p).getByRole('region',{name:'Fastställ och publicera'});
  await rp.getByRole('button',{name:/^Lärarnas återkoppling \(1\)$/u}).click();
  await expect(rp.getByText(/^Pia Ek · /u).first()).toBeVisible();await expect(rp.getByText(/^Kvitterad \d{4}-\d\d-\d\d \d\d:\d\d$/u).first()).toBeVisible();
  await expect(rp.getByText(text)).toBeVisible();
  await rp.getByRole('button',{name:'Versionshistorik'}).click();
  await expect(rp.getByText(/^Version 2 · Fastställd och publicerad · .+ · \d{4}-\d\d-\d\d \d\d:\d\d$/u)).toBeVisible();
  await capture(p,'rektor-aterkoppling');
  pass('kvittens till tjanst_feedback','P1 trycker Kvittera att jag har läst och skickar en kommentar; POST /api/tjanst/egen/kommando två gånger, tjanst_feedback 0 → 1 ack och 0 → 1 comment, rektor ser båda i panelen',
    {requests:[ackRequest.postDataJSON().action,commentRequest.postDataJSON().action],before,after});
  pass('versionshistorik med aktör och tid','panelens historik visar version 2 som fastställd och publicerad med aktör och tid');
});

test('huvudmannen: Bemanning utan beslutsknapp och 403 vid publicering; Personal med andelar och engångskod',async({browser},info)=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const h=await signIn(browser,info,'hm');
  await h.getByRole('button',{name:'Bemanning',exact:true}).click();
  await h.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));
  const table=h.locator('table.bemanning-table');const a=table.getByRole('row').filter({hasText:'Syntetisk skola A'});
  await expect(a).toContainText('Publicerad version 2');
  await expect(h.getByText('Huvudmannen följer upp bemanningen. Rektor fastställer och publicerar skolans fördelning.',{exact:false}).first()).toBeVisible();
  await expect(h.getByRole('button',{name:/Fastställ|Publicera/u})).toHaveCount(0);
  await capture(h,'bemanning');
  await h.getByRole('button',{name:'Visa fördelningen för Syntetisk skola A'}).first().click();
  await expect(h.getByRole('heading',{name:'Tjänstefördelning',level:1})).toBeVisible();await settled(h);
  for(const name of ['Fastställ och publicera','Ändra i ny version','Lägg till lärare i fördelningen','Lägg till specialuppdrag'])await expect(h.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(matrix(h).getByRole('button',{name:/Ändra\.$|Tilldela\.$/u})).toHaveCount(0);
  await capture(h,'bemanning-visa-fordelningen');
  const [d]=await db`select d.revision::int r,v.content_hash h from public.tjanst_distributions d join public.tjanst_versions v on v.distribution_id=d.id and v.status='published' where d.unit_id=${seed.schools.A} and d.school_year=${seed.year}`;
  const denied=await fixture!.request(h,'hm','/api/tjanst/plan/publicera',await createCommand(seed.schools.A,seed.year,'publish',d.r,{},{expectedContentHash:d.h}));
  expect(denied.status).toBe(403);
  pass('huvudmannens Bemanning utan beslutsknapp och 403 vid publicering','Bemanning visar Publicerad version 2, Visa fördelningen är skrivskyddad, och direktanrop till publicera ger 403',{status:denied.status,code:denied.body?.code});
  await h.getByRole('button',{name:'Tillbaka till bemanningen'}).click();
  // Personal.
  await h.getByRole('button',{name:'Personal',exact:true}).click();
  await expect(h.getByRole('heading',{name:'Personal',level:1})).toBeVisible();
  const list=h.locator('table.personal-table');
  await expect(list.getByRole('row').filter({hasText:'Tor Berg'})).toContainText('Inget konto');
  await expect(list.getByRole('row').filter({hasText:'Pia Ek'})).toContainText('Kopplat');
  await expect(list.getByRole('row').filter({hasText:'Vera Nord'})).toContainText('Ny lärare · från Syntetisk skola A');
  await h.getByLabel('Visa bara personer som behöver kompletteras').check();
  await expect(h.getByRole('button',{name:'Vera Nord',exact:true}).first()).toBeVisible();
  await expect(h.getByRole('button',{name:'Pia Ek',exact:true})).toHaveCount(0);
  await capture(h,'personal-kompletteras');
  await h.getByLabel('Visa bara personer som behöver kompletteras').uncheck();
  pass('personal: utan konto och utkastlärare','Tor Berg visar Inget konto, Pia Ek Kopplat, och Vera Nord har märket Ny lärare · från Syntetisk skola A och syns under behöver kompletteras');
  // Person med engångskod: utan färskt MFA-bevis nekar servern, step-up via knappen och sedan sparas personen.
  await fixture!.expireMfa(h,'hm');
  const person=async()=>{await h.getByRole('button',{name:'Lägg till person'}).click();const dialog=h.getByRole('dialog',{name:'Lägg till person'});
    await dialog.getByLabel('Förnamn').fill('Sara');await dialog.getByLabel('Efternamn').fill('Dahl');await dialog.getByRole('button',{name:'Spara personen'}).click();return dialog;};
  const first=await person();
  await expect(first.getByText('Att ändra personaluppgifter kräver verifiering med engångskod.')).toBeVisible();
  await expect(h.getByRole('dialog').getByRole('button',{name:'Verifiera med engångskod'})).toBeVisible();
  const [none]=await db`select count(*)::int n from public.staff_people where given_name='Sara' and customer_id=${seed.customerId}`;expect(none.n).toBe(0);
  await fixture!.login(h,'hm',{stepUp:true,trigger:()=>h.getByRole('dialog').getByRole('button',{name:'Verifiera med engångskod'}).click()});
  await expect(h.getByRole('heading',{name:'Personal',level:1})).toBeVisible();
  await person();await expect(h.getByText(/Sara Dahl/u).first()).toBeVisible();
  await h.getByRole('button',{name:'Sara Dahl',exact:true}).first().click();
  await expect(h.getByRole('heading',{name:'Sara Dahl',level:1})).toBeFocused();
  await h.getByRole('button',{name:'Lägg till anställning'}).click();
  const emp=h.getByRole('dialog',{name:'Lägg till anställning'});await emp.getByLabel('Tjänstgöringsgrad (%)').fill('100');
  await emp.getByLabel('Gäller från').fill(`${seed.year}-07-01`);await emp.getByRole('button',{name:'Spara anställningen'}).click();
  await expect(emp).toHaveCount(0);
  await h.getByRole('button',{name:'Fördela på skolor'}).click();
  let duties=h.getByRole('dialog',{name:'Fördela på skolor'});
  await duties.getByLabel('Andel (%) på Syntetisk skola A').fill('60');await duties.getByLabel('Gäller från, Syntetisk skola A').fill(`${seed.year}-07-01`);
  await duties.getByLabel('Andel (%) på Syntetisk skola B').fill('40');await duties.getByLabel('Gäller från, Syntetisk skola B').fill(`${seed.year}-07-01`);
  await expect(duties.getByText('Fördelat: 100 av 100 %')).toBeVisible();
  await duties.getByRole('button',{name:'Spara andelarna'}).click();await expect(duties).toHaveCount(0);
  await expect(h.getByText(/^Andelarna är sparade: /u)).toBeVisible();
  await h.getByRole('button',{name:'Fördela på skolor'}).click();duties=h.getByRole('dialog',{name:'Fördela på skolor'});
  await duties.getByLabel('Andel (%) på Syntetisk skola B').fill('50');
  const text='Andelarna blir 110 %, men tjänstgöringsgraden är 100 %. Minska någon andel.';
  await expect(duties.getByText(text).first()).toBeVisible();
  const deny=h.waitForResponse(responseOf('/api/tjanst/personal/kommando'));
  await duties.getByRole('button',{name:'Spara andelarna'}).click();const denial=await deny;expect(denial.status()).toBe(400);
  await expect(duties.getByRole('alert').filter({hasText:text})).toBeVisible();
  await capture(h,'andelar-nekas');
  await duties.getByRole('button',{name:'Stäng utan att spara'}).click();
  const stored=Array.from(await db`select u.name,d.percent::int p from public.staff_school_duties d join public.staff_people s on s.id=d.staff_person_id join public.school_units u on u.id=d.unit_id
    where s.given_name='Sara' and s.customer_id=${seed.customerId} order by u.name`) as {name:string;p:number}[];
  expect(stored.map(x=>[x.name,x.p])).toEqual([['Syntetisk skola A',60],['Syntetisk skola B',40]]);
  pass('andelar 60 % + 40 % sparas och 60 % + 50 % nekas med engångskod','servern kräver engångskod för personaländringen, step-up via knappen, 60 % + 40 % sparas och 60 % + 50 % nekas (400) med samma text; andelarna är oförändrade',
    {stored,denial:denial.status()});
});

test('rektor B ser bara Andel här 40 % och rektor AB nekas läsning när skolan tas bort ur mandatet',async({browser},info)=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const b=await signIn(browser,info,'principalB');await openTjanst(b,seed.schools.B);
  await addTeacher(b,'Sara Dahl');
  await expect(matrix(b).getByRole('columnheader',{name:/Sara Dahl/u})).toContainText('Andel här 40\u00a0%');
  await ws(b).getByRole('tab',{name:'Per lärare'}).click();
  const view=ws(b).getByRole('region',{name:'Per lärare'});
  await expect(view.locator('dl.tjanst-facts')).toContainText('Andel här40\u00a0%');
  await expect(view).not.toContainText(/\b60\s%/u);await expect(ws(b)).not.toContainText('Syntetisk skola A');await expect(view.getByText(/På andra skolor/u)).toHaveCount(0);
  const read=await fixture!.request(b,'principalB','/api/tjanst/personal/lasa',{unitId:seed.schools.B});
  const sara=(read.body.people as {givenName:string;duties:{unitId:string;percent:number}[]}[]).find(x=>x.givenName==='Sara')!;
  expect(sara.duties.map(x=>[x.unitId,x.percent])).toEqual([[seed.schools.B,40]]);
  await capture(b,'rektor-b-andel');
  pass('rektor B ser bara Andel här 40 %','kolumnen och Per lärare visar Andel här 40 %; ingen summa, andel eller skolnamn från skola A, och personalsvaret innehåller bara skola B',{duties:sara.duties});
  // 403 vid läsning: rektor AB läser skola A, skolan tas bort ur mandatet, nästa läsning nekas och innehållet töms.
  const ab=await signIn(browser,info,'principalAB');await openTjanst(ab,seed.schools.A);
  await expect(matrix(ab)).toBeVisible();
  const assignment=seed.actors.principalAB.assignmentId;
  const removed=await db`delete from public.mandate_units where assignment_id=${assignment} and unit_id=${seed.schools.A} returning assignment_id,customer_id,organizer_id,unit_id`;
  try{
    await ws(ab).getByRole('button',{name:'HT',exact:true}).click();
    await expect(ws(ab).getByRole('alert')).toContainText('Ditt aktuella uppdrag tillåter inte att läsa tjänstefördelningen för den här skolan.');
    await expect(ab.locator('.tjanst-matrix')).toHaveCount(0);await expect(ws(ab).getByText('Pia Ek')).toHaveCount(0);
    await capture(ab,'tillstand-403');
  }finally{for(const r of removed)await db`insert into public.mandate_units values(${r.assignment_id},${r.customer_id},${r.organizer_id},${r.unit_id})`;}
  pass('tillstånd: 403','rektor AB:s läsning av skola A nekas med 403-texten och innehållet töms när skolan tas bort ur mandatet (återställt efteråt)');
});

test('samtidighet: två flikar och avbrutet svar; tillstånd: laddning, loggfel, MFA och context_changed',async()=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  const p=pages.principalA;
  await ws(p).getByRole('button',{name:'Ändra i ny version'}).click();
  await expect(ws(p).getByText('Utkastet version 3 är skapat. Lärarna ser version 2 tills du publicerar.')).toBeVisible();await settled(p);
  const q=await contexts.principalA.newPage();q.on('pageerror',e=>{result.errors.push({role:'principalA-2',message:e.message});save();});
  await q.goto(p.url());const qYear=q.getByLabel('Planeringsläsår',{exact:true});await expect(qYear).toBeVisible();
  if(await qYear.inputValue()!==String(seed.year))await qYear.selectOption(String(seed.year));await settled(q);
  const name='Tor Berg, Matematik, SYNGR8';
  await cell(p,'Tor Berg','Matematik','SYNGR8').click();await cell(q,'Tor Berg','Matematik','SYNGR8').click();
  const d1=p.getByRole('dialog'),d2=q.getByRole('dialog');
  await d1.getByLabel('Lärartid VT (timmar)').fill('30');await d2.getByLabel('Lärartid VT (timmar)').fill('20');
  await d1.getByRole('button',{name:'Spara tjänsteraden'}).click();await expect(ws(p).getByText(`Tjänsteraden är sparad: ${name}, HT 45 h · VT 30 h.`)).toBeVisible();
  const conflict=q.waitForResponse(responseOf('/api/tjanst/plan/kommando'));
  await d2.getByRole('button',{name:'Spara tjänsteraden'}).click();expect((await conflict).status()).toBe(409);
  await expect(d2.getByRole('alert')).toContainText('Din ändring har inte sparats. Hämta aktuellt läge och gör om ändringen.');
  await expect(d2.getByLabel('Lärartid VT (timmar)')).toHaveValue('20');
  await capture(q,'samtidighet-409');
  const [row]=await db`select r.teacher_vt_minutes::int vt from public.tjanst_rows r join public.tjanst_versions v on v.id=r.version_id join public.tjanst_distributions dd on dd.id=v.distribution_id and dd.unit_id=${seed.schools.A} and dd.school_year=${seed.year}
    where v.status='draft' and r.staff_person_id=${seed.people.t2} and r.source_key like ${'class_timplan:%:matematik'}`;
  expect(row.vt).toBe(1800);
  await d2.getByRole('button',{name:'Stäng utan att spara'}).click();await q.close();
  pass('två flikar: den andra får 409','flik 1 sparar VT 30 h, flik 2 får 409-texten med inmatningen kvar och inget skrivs över (VT 1 800 min)',{row});
  // Avbrutet svar (märkt transportfel): Worker svarar 200, men svaret tappas innan klienten får det.
  let workerStatus=0;const [commandsBefore]=await db`select count(*)::int n from public.tjanst_commands where action='save_row' and customer_id=${seed.customerId}`;
  await settled(p);await p.route('**/api/tjanst/plan/kommando',async route=>{const real=await route.fetch();workerStatus=real.status();await route.abort('failed');},{times:1});
  const status=p.waitForResponse(responseOf('/api/tjanst/plan/status'));
  await cell(p,'Tor Berg','Matematik','SYNGR8').click();await p.getByRole('dialog').getByLabel('Lärartid HT (timmar)').fill('40');
  await p.getByRole('dialog').getByRole('button',{name:'Spara tjänsteraden'}).click();
  expect((await status).status()).toBe(200);
  await expect(ws(p).getByText(`Tjänsteraden är sparad: ${name}, HT 40 h · VT 30 h.`)).toBeVisible();await settled(p);
  const [recovered]=await db`select r.teacher_ht_minutes::int ht,(select count(*)::int from public.tjanst_commands c where c.action='save_row' and c.customer_id=${seed.customerId}) commands from public.tjanst_rows r
    join public.tjanst_versions v on v.id=r.version_id join public.tjanst_distributions dd on dd.id=v.distribution_id and dd.unit_id=${seed.schools.A} and dd.school_year=${seed.year} where v.status='draft' and r.staff_person_id=${seed.people.t2} and r.source_key like ${'class_timplan:%:matematik'}`;
  expect(recovered.ht).toBe(2400);expect(workerStatus).toBe(200);expect(recovered.commands).toBe(commandsBefore.n+1);
  expect(await p.evaluate(()=>Object.keys(sessionStorage).filter(k=>k.startsWith('tjanst:')&&!k.startsWith('tjanst-planering:')))).toEqual([]);
  pass('avbrutet svar återhämtas via status','svaret på en riktig sparning tappas (märkt transportfel); vyn läser statuskvittot med samma commandId, visar bekräftelsen och skriver inte om',{recovered});
  // Laddning (märkt fördröjning av en riktig läsning).
  let release:()=>void=()=>{};const held=new Promise<void>(r=>{release=r;});
  await p.route('**/api/tjanst/plan/lasa',async route=>{await held;await route.continue();},{times:1});
  await ws(p).getByRole('button',{name:'HT',exact:true}).click();
  await expect(ws(p)).toHaveAttribute('aria-busy','true');await expect(ws(p).getByText('Hämtar tjänstefördelningen…')).toBeVisible();
  await expect(p.locator('.tjanst-content')).toHaveAttribute('inert','');await expect(p.locator('.tjanst-matrix')).toBeVisible();
  await capture(p,'tillstand-laddning');release();await settled(p);
  pass('tillstånd: laddning','aria-busy, texten Hämtar tjänstefördelningen… och föregående matris kvar inaktiv under en fördröjd riktig läsning');
  // Loggfel: en tillfällig trigger i schemakopian nekar säkerhetshändelsen för läsningen (märkt fel), sedan tas den bort.
  await db.unsafe(`create function public.tjanst09_audit_fault() returns trigger language plpgsql as $f$ begin
    if new.action='tjanst_plan_read' and new.outcome='ok' and new.customer_id='${seed.customerId}' then raise exception 'synthetic audit outage'; end if; return new; end $f$`);
  await db.unsafe('create trigger tjanst09_audit_fault before insert on public.security_events for each row execute function public.tjanst09_audit_fault()');
  try{
    const failed=p.waitForResponse(responseOf('/api/tjanst/plan/lasa'));
    await ws(p).getByRole('button',{name:'VT',exact:true}).click();const r=await failed;expect(r.status()).toBeGreaterThanOrEqual(500);expect((await r.json()).code).toBe('audit_unavailable');
    await expect(ws(p).getByRole('alert')).toContainText('Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.');
    await expect(ws(p).getByRole('alert')).toContainText('Referens: ');
    await capture(p,'tillstand-loggfel');
  }finally{await db.unsafe('drop trigger tjanst09_audit_fault on public.security_events');await db.unsafe('drop function public.tjanst09_audit_fault()');}
  await ws(p).getByRole('alert').getByRole('button',{name:'Hämta tjänstefördelningen igen'}).click();await settled(p);await expect(matrix(p)).toBeVisible();
  pass('tillstånd: loggfel','när säkerhetshändelsen inte kan skrivas svarar servern audit_unavailable och vyn visar loggfelstexten med referens; efter återställning läses vyn igen');
  // MFA vid publicering.
  await fixture!.expireMfa(p,'principalA');const beforeMfa=(await versionsOf(seed.schools.A)).map(v=>v.status);
  const panel=ws(p).getByRole('region',{name:'Fastställ och publicera'});if(!await panel.isVisible())await ws(p).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await panel.getByRole('button',{name:'Fastställ och publicera…'}).click();const dialog=p.getByRole('dialog');
  await dialog.getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await expect(dialog.getByRole('alert')).toContainText('Att fastställa och publicera kräver verifiering med engångskod.');
  await capture(p,'tillstand-mfa');await dialog.getByRole('button',{name:'Behåll utkastet'}).click();
  expect((await versionsOf(seed.schools.A)).map(v=>v.status)).toEqual(beforeMfa);
  pass('tillstånd: MFA','utan färskt MFA-bevis visar publiceringen texten om engångskod och inget publiceras');
  // context_changed: sessionens epok ändras på servern; nästa läsning med gammal epok nekas.
  const s=await fixture!.view(p,'principalA');
  await db`update public.app_sessions set context_epoch=context_epoch+1 where id=${s.sessionId}`;
  await ws(p).getByRole('button',{name:'Hela läsåret',exact:true}).click();
  // Skalet fångar context_changed för hela fliken (gemensam dialog) innan vyns egen text hinner visas.
  const changed=p.getByRole('alertdialog',{name:'Kontexten ändrades i en annan flik'});
  await expect(changed).toBeVisible();await expect(changed).toContainText('Innehållet i den här fliken har rensats.');
  await expect(p.locator('.tjanst-matrix')).toHaveCount(0);await expect(p.getByText('Pia Ek')).toHaveCount(0);
  await capture(p,'tillstand-context-changed');
  await changed.getByRole('button',{name:'Ladda om'}).click();await expect(p.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();
  pass('tillstånd: context_changed','när sessionens epok har ändrats på servern ger nästa läsning 409 context_changed; skalets dialog Kontexten ändrades i en annan flik rensar innehållet och erbjuder Ladda om');
  await openTjanst(p,seed.schools.A);
});

const BEMANNING_PUBLISHED='Bemanning: Visa fördelningen visar publicerad version trots utkast';
/** Lärarens summa av lärartid i en version (rader utan samläsning; provets lärare ingår inte i någon samläsning). */
async function teacherTime(versionId:string,personId:string){
  const [t]=await db`select coalesce(sum(r.teacher_ht_minutes),0)::int ht,coalesce(sum(r.teacher_vt_minutes),0)::int vt,
    count(*) filter (where exists(select 1 from public.tjanst_joint_members m where m.row_id=r.id))::int joint
    from public.tjanst_rows r where r.version_id=${versionId} and r.staff_person_id=${personId}`;
  expect(t.joint).toBe(0);return{ht:t.ht as number,vt:t.vt as number};
}

// 05.1-12 (WR-07). På dator har rektor A publicerat version 2 och skapat utkastet version 3 med ändrad tid (fallet samtidighet ovan).
// På telefon har rektor A publicerat version 1 (seed) och skapar här utkastet version 2 med annan tid genom Worker, eftersom
// redigering bara finns på dator (D-15).
test('Bemanning: huvudmannens Visa fördelningen öppnar den publicerade versionen trots rektors utkast (WR-07)',async({browser},info)=>{
  test.skip(project!=='desktop'&&project!=='phone','Körs på projekten desktop och phone.');
  const A=seed.schools.A,teacher=project==='desktop'?{id:seed.people.t2,name:'Tor Berg'}:{id:seed.people.p1,name:'Pia Ek'};
  if(project==='phone'){
    const p=pages.principalA;
    const [d]=await db`select d.revision::int r,v.id from public.tjanst_distributions d join public.tjanst_versions v on v.distribution_id=d.id and v.status='published' where d.unit_id=${A} and d.school_year=${seed.year}`;
    const created=await fixture!.request(p,'principalA','/api/tjanst/plan/kommando',await createCommand(A,seed.year,'create_draft',d.r,{basedOnVersionId:d.id}));
    expect(created.status,JSON.stringify(created.body)).toBe(200);
    const [row]=await db`select r.id,r.source_kind,r.source_key from public.tjanst_rows r join public.tjanst_versions v on v.id=r.version_id and v.status='draft'
      join public.tjanst_distributions dd on dd.id=v.distribution_id and dd.unit_id=${A} and dd.school_year=${seed.year} where r.staff_person_id=${seed.people.p1}`;
    const saved=await fixture!.request(p,'principalA','/api/tjanst/plan/kommando',await createCommand(A,seed.year,'save_row',created.body.detail.revision,
      {rowId:row.id,sourceKind:row.source_kind,sourceKey:row.source_key,personId:seed.people.p1,teacherHt:1200,teacherVt:2400,comment:''}));
    expect(saved.status,JSON.stringify(saved.body)).toBe(200);
  }
  const versions=await versionsOf(A),published=versions.find(v=>v.status==='published')!,draft=versions.find(v=>v.status==='draft')!;
  expect(published).toBeTruthy();expect(draft).toBeTruthy();
  const shown=await teacherTime(published.id,teacher.id),hidden=await teacherTime(draft.id,teacher.id);
  expect(hidden).not.toEqual(shown);
  const h=pages.hm??await signIn(browser,info,'hm');await h.bringToFront();
  await nav(h,'Bemanning');await h.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));
  const unitRow=project==='desktop'?h.locator('table.bemanning-table').getByRole('row').filter({hasText:'Syntetisk skola A'}):h.locator('.bemanning ul.tjanst-cards li').filter({hasText:'Syntetisk skola A'});
  await expect(unitRow).toContainText(`Publicerad version ${published.no}`);
  const logged=network.hm.length;
  const read=h.waitForRequest(r=>new URL(r.url()).pathname==='/api/tjanst/plan/lasa');
  await h.getByRole('button',{name:'Visa fördelningen för Syntetisk skola A'}).locator('visible=true').click();
  const body=(await read).postDataJSON();expect(body).toEqual({unitId:A,schoolYear:seed.year,versionId:published.id});
  await expect(h.getByRole('heading',{name:'Tjänstefördelning',level:1})).toBeVisible();await settled(h);
  await expect(ws(h).locator('.tjanst-readonly')).toHaveText(new RegExp(`^Du läser version ${published.no} skrivskyddat, publicerad \\d{4}-\\d\\d-\\d\\d av .+\\. Lärarna ser den här versionen\\.$`,'u'));
  if(project==='desktop')await expect(footer(h,'Undervisning',teacher.name)).toHaveText(fmt(shown.ht+shown.vt));
  else await expect(ws(h).getByRole('region',{name:'Per lärare'}).locator('dl.tjanst-facts')).toContainText(`UndervisningHT ${fmt(shown.ht)} · VT ${fmt(shown.vt)} · Läsår ${fmt(shown.ht+shown.vt)}`);
  const choices=ws(h).getByLabel('Visa version');
  const options=await choices.count()?await choices.locator('option').allInnerTexts():[];
  expect(options.filter(o=>/Utkast|Aktuell version/u.test(o))).toEqual([]);
  if(project==='desktop')expect(options.length).toBe(versions.filter(v=>v.status==='published'||v.status==='superseded').length);
  for(const name of ['Fastställ och publicera','Ändra i ny version','Lägg till lärare i fördelningen','Lägg till specialuppdrag'])await expect(h.getByRole('button',{name,exact:true})).toHaveCount(0);
  await capture(h,'bemanning-publicerad-version');
  const reads=network.hm.slice(logged).filter(n=>n.path==='/api/tjanst/plan/lasa');
  expect(reads.length).toBeGreaterThan(0);expect(reads.every(n=>n.versionId===published.id&&n.status===200)).toBe(true);
  pass(BEMANNING_PUBLISHED,`rektor har utkastet version ${draft.no} med annan tid; huvudmannens läsning bär versionId för version ${published.no}, vyn anger version ${published.no} skrivskyddat och visar de publicerade summorna, och väljaren saknar utkastet`,
    {published:published.no,draft:draft.no,teacher:teacher.name,shown,hidden,request:body,reads:reads.length,options});
  await h.getByRole('button',{name:'Tillbaka till bemanningen'}).click();
});

test('tangentbord, synligt fokus, fokusåterställning och 44 px på dator',async()=>{
  test.skip(project!=='desktop','Körs på projektet desktop.');
  await keyboardChecks(pages.principalA,'tangentbord');
});

async function keyboardChecks(p:Page,name:string){
  await ws(p).getByRole('button',{name:'Hela läsåret',exact:true}).click();await settled(p);
  const buttons=matrix(p).locator('button[data-cell]');
  const firstCell=buttons.first();await firstCell.focus();
  const label=async()=>p.evaluate(()=>document.activeElement?.getAttribute('aria-label')??document.activeElement?.textContent??'');
  const start=await label();await p.keyboard.press('ArrowRight');const right=await label();expect(right).not.toBe(start);
  await p.keyboard.press('ArrowLeft');expect(await label()).toBe(start);
  await p.keyboard.press('ArrowDown');const down=await label();expect(down).not.toBe(start);
  await p.keyboard.press('End');const end=await label();await p.keyboard.press('Home');const home=await label();expect(end).not.toBe(home);
  const tabStops=await matrix(p).locator('button[data-cell][tabindex="0"]').count();expect(tabStops).toBe(1);
  const ring=await p.evaluate(()=>{const s=getComputedStyle(document.activeElement!);return{outline:s.outlineStyle,width:parseFloat(s.outlineWidth),shadow:s.boxShadow};});
  expect(ring.outline!=='none'&&ring.width>=3||ring.shadow!=='none').toBe(true);
  await p.keyboard.press('Enter');const dialog=p.getByRole('dialog');await expect(dialog).toBeVisible();
  const focusedName=home;await dialog.getByRole('button',{name:'Stäng utan att spara'}).click();await expect(dialog).toHaveCount(0);
  expect(await label()).toBe(focusedName);
  const small=await p.evaluate(()=>[...document.querySelectorAll('.tjanst button, .tjanst select, .tjanst [role="tab"], .tjanst input[type="checkbox"]')]
    .filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';})
    .map(e=>{const target=e.matches('input[type="checkbox"]')?(e.closest('label')??e):e;const r=target.getBoundingClientRect();return{text:(e.getAttribute('aria-label')??e.textContent??'').trim().slice(0,60),w:Math.round(r.width),h:Math.round(r.height)};})
    .filter(r=>r.w<44||r.h<44));
  expect(small).toEqual([]);
  const clipped=await p.evaluate(()=>[...document.querySelectorAll('.tjanst [role="tab"]')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent));
  expect(clipped).toEqual([]);
  await capture(p,name+'-fokus');
  pass('tangentbord, fokus och 44 px',`piltangenter, Home och End flyttar fokus i matrisen med ett tabbstopp; synlig fokusring; fokus åter till cellen efter dialogen; alla kontroller minst 44 × 44 px`,{start,right,down,home,end,ring});
}

// ───────────────────────────── Liten dator (1024 × 768): fall 1, 4 och 5 ─────────────────────────────

test('liten dator: fördela, samläsning och publicera',async({browser},info)=>{
  test.skip(project!=='desktop-small','Körs på projektet desktop-small.');
  const p=await signIn(browser,info,'principalA');await openTjanst(p,seed.schools.A);
  await addTeacher(p,'Tor Berg');
  await expect(cell(p,'Tor Berg','Matematik','SYNGR8')).toHaveAccessibleName('Tor Berg, Matematik, SYNGR8: ingen tid. Tilldela.');
  await cell(p,'Tor Berg','Matematik','SYNGR8').click();const dialog=p.getByRole('dialog');
  await expect(dialog.getByLabel('Lärartid HT (timmar)')).toHaveValue('45');await dialog.getByLabel('Lärartid VT (timmar)').fill('40');
  await capture(p,'fordela-dialog');
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(ws(p).getByText('Tjänsteraden är sparad: Tor Berg, Matematik, SYNGR8, HT 45 h · VT 40 h.')).toBeVisible();await settled(p);
  await p.reload();await settled(p);await expect(cell(p,'Tor Berg','Matematik','SYNGR8')).toHaveAccessibleName('Tor Berg, Matematik, SYNGR8: 85 h. Ändra.');
  await expect(footer(p,'Undervisning','Tor Berg')).toHaveText('85 h');
  const scroll=await p.locator('.tjanst-matrix-scroll').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
  await capture(p,'fordela-matris');
  pass('fördela','tom cell med förifylld tid, ändrad VT, sparad och omläst vid 1024 × 768 utan sidledsrullning på sidan',{scroll});
  await addTeacher(p,'Ulla Sund');
  await saveRow(p,'Ulla Sund','Biologi','SYNGR8',{ht:'50',vt:'0'});await saveRow(p,'Tor Berg','Biologi','SYNGR8',{ht:'0',vt:'50'});
  await saveRow(p,'Ulla Sund','Engelska','SYNGR8',{ht:'30',vt:'30'});await saveRow(p,'Ulla Sund','Engelska, grundskolenivå','SYNIM',{ht:'30',vt:'30'});
  await ws(p).getByRole('tab',{name:'Per kurs/ämne'}).click();await settled(p);
  const course=ws(p).getByRole('region',{name:'Per kurs/ämne'});
  await course.getByRole('checkbox',{name:'Markera Engelska SYNGR8, Ulla Sund'}).check();await course.getByRole('checkbox',{name:'Markera Engelska, grundskolenivå SYNIM, Ulla Sund'}).check();
  await course.getByRole('button',{name:'Koppla till samläsning…'}).click();const joint=p.getByRole('dialog');
  await joint.getByLabel('HT (timmar)').fill('30');await joint.getByLabel('VT (timmar)').fill('30');await joint.getByRole('button',{name:'Spara samläsningen'}).click();
  await expect(ws(p).getByText(/^Samläsningen .* är sparad\./u)).toBeVisible();await settled(p);
  await ws(p).getByRole('tab',{name:'Matris'}).click();await settled(p);await expect(footer(p,'Undervisning','Ulla Sund')).toHaveText('110 h');
  await ws(p).getByRole('tab',{name:'Per klass'}).click();await ws(p).getByLabel('Klass',{exact:true}).selectOption({label:'SYNGR8'});
  await expect(ws(p).getByRole('region',{name:'Per klass'}).getByRole('row').filter({hasText:'Biologi'})).toContainText('100 av 100 h · 2 lärare');
  await capture(p,'samlasning-per-klass');
  pass('samläsning','samläsningen räknas en gång (170 h → 110 h) och Biologi visar 100 av 100 h · 2 lärare vid 1024 × 768');
  await ws(p).getByRole('tab',{name:'Matris'}).click();await settled(p);
  await keyboardChecks(p,'tangentbord-liten');
  const admin=await signIn(browser,info,'admin');await openTjanst(admin,seed.schools.A);
  await ws(admin).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await expect(ws(admin).getByRole('region',{name:'Fastställ och publicera'}).getByRole('button',{name:/Fastställ och publicera…/u})).toHaveCount(0);
  const [d]=await db`select d.revision::int r,v.content_hash h from public.tjanst_distributions d join public.tjanst_versions v on v.distribution_id=d.id and v.status='draft' where d.unit_id=${seed.schools.A} and d.school_year=${seed.year}`;
  const deniedAdmin=await fixture!.request(admin,'admin','/api/tjanst/plan/publicera',await createCommand(seed.schools.A,seed.year,'publish',d.r,{},{expectedContentHash:d.h}));expect(deniedAdmin.status).toBe(403);
  await fixture!.expireMfa(p,'principalA');await publish(p,'principalA',1,{stepUp:true});
  await capture(p,'publicerad');
  const h=await signIn(browser,info,'hm');
  const [pd]=await db`select d.revision::int r,v.content_hash h from public.tjanst_distributions d join public.tjanst_versions v on v.distribution_id=d.id and v.status='published' where d.unit_id=${seed.schools.A} and d.school_year=${seed.year}`;
  const deniedHm=await fixture!.request(h,'hm','/api/tjanst/plan/publicera',await createCommand(seed.schools.A,seed.year,'publish',pd.r,{},{expectedContentHash:pd.h}));expect(deniedHm.status).toBe(403);
  await h.getByRole('button',{name:'Bemanning',exact:true}).click();await h.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));
  await expect(h.locator('table.bemanning-table').getByRole('row').filter({hasText:'Syntetisk skola A'})).toContainText('Publicerad version 1');
  await expect(h.getByRole('button',{name:/Fastställ|Publicera/u})).toHaveCount(0);
  await capture(h,'bemanning');
  pass('publicera','administratören saknar beslutsknapp och får 403, rektor publicerar efter riktig step-up, huvudmannen ser Bemanning utan beslutsknapp och får 403',{admin:deniedAdmin.status,hm:deniedHm.status});
});

// ───────────────────────────── Telefon (390 × 844 och 320 × 740): läsa och kvittera ─────────────────────────────

test('telefon: Min tjänst, Per lärare och Bemanning utan redigeringskontroller',async({browser},info)=>{
  test.skip(!PHONE(project),'Körs på telefonprojekten.');
  const t=await signIn(browser,info,'teacherSelf');
  await expect(t.getByRole('heading',{name:'Min tjänst',level:1})).toBeVisible();
  const card=t.locator('.min-tjanst-card').first();
  await expect(card.locator('table.tjanst-wide').first()).toBeHidden();await expect(card.locator('ul.tjanst-cards').first()).toBeVisible();
  await expect(card.locator('ul.tjanst-cards').first()).toContainText('SYNBF1');await expect(card.locator('ul.tjanst-cards').first()).toContainText('HT 50 h · VT 40 h');
  await capture(t,'min-tjanst');
  const ack=t.waitForRequest(r=>new URL(r.url()).pathname==='/api/tjanst/egen/kommando');
  await card.getByRole('button',{name:'Kvittera att jag har läst'}).click();await ack;
  await expect(card.getByText('Du har kvitterat version 1.')).toBeVisible();
  const [fb]=await db`select count(*)::int n from public.tjanst_feedback where version_id=${seed.publishedVersion!.id} and staff_person_id=${seed.people.p1} and kind='ack'`;expect(fb.n).toBe(1);
  const long=('Arbetstidsfördelningsöverenskommelse'.repeat(8)+' ').repeat(8).slice(0,2000);
  await card.getByLabel('Kommentar till rektor').fill(long);await card.getByRole('button',{name:'Skicka kommentar'}).click();
  await expect(card.getByText('Kommentaren är skickad till rektor.')).toBeVisible();
  await card.locator('.min-tjanst-comments').scrollIntoViewIfNeeded();await capture(t,'min-tjanst-kommentar');
  const apiPaths=[...new Set(network.teacherSelf.map(n=>n.path).filter(x=>x.startsWith('/api/')))];
  expect(apiPaths.filter(x=>x.startsWith('/api/elever')||x.startsWith('/api/planering'))).toEqual([]);
  pass('Min tjänst på telefon','kort i stället för tabell, kvittens (en ack-rad) och en kommentar på 2 000 tecken utan sidledsrullning; inga elev- eller planeringsanrop',{apiPaths});
  const p=await signIn(browser,info,'principalA');await openTjanst(p,seed.schools.A);
  await expect(ws(p).getByText('Matrisen och all redigering finns på dator. Här kan du läsa fördelningen.')).toBeVisible();
  await expect(ws(p).getByLabel('Vy')).toHaveValue('larare');
  await expect(ws(p).getByRole('region',{name:'Per lärare'}).locator('dl.tjanst-facts')).toContainText('UndervisningHT 50 h · VT 40 h · Läsår 90 h');
  for(const name of ['Ändra i ny version','Lägg till lärare i fördelningen','Lägg upp ny lärare','Lägg till specialuppdrag'])await expect(p.getByRole('button',{name,exact:true})).toHaveCount(0);
  await expect(p.locator('.tjanst-matrix')).toHaveCount(0);await expect(p.getByRole('checkbox')).toHaveCount(0);
  await ws(p).getByRole('region',{name:'Per lärare'}).scrollIntoViewIfNeeded();await capture(p,'per-larare');
  await ws(p).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  await expect(ws(p).getByRole('region',{name:'Fastställ och publicera'}).getByRole('button',{name:/Fastställ och publicera…|Ta bort utkastet/u})).toHaveCount(0);
  await capture(p,'per-larare-panel');
  pass('Per lärare på telefon utan redigeringskontroller','rektor ser Per lärare med texten om dator, utan matris, åtgärdsrad, kryssrutor eller beslutsknappar');
  const h=await signIn(browser,info,'hm');
  await nav(h,'Bemanning');
  await h.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));
  const cards=h.locator('.bemanning ul.tjanst-cards');await expect(cards).toBeVisible();await expect(cards).toContainText('Syntetisk skola A');
  await expect(h.getByRole('button',{name:/Fastställ|Publicera|Ändra/u})).toHaveCount(0);
  await capture(h,'bemanning');
  await nav(h,'Personal');
  await expect(h.locator('ul.tjanst-cards')).toBeVisible();await expect(h.getByRole('button',{name:'Lägg till person'})).toHaveCount(0);
  await capture(h,'personal');
  pass('Bemanning på telefon utan redigeringskontroller','huvudmannen läser Bemanning och Personal som kort utan Lägg till, Ändra, Fördela eller beslutsknappar');
  await t.bringToFront();
  const small=await t.evaluate(()=>[...document.querySelectorAll('main button, main textarea, main select')].filter(e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0;})
    .map(e=>{const r=e.getBoundingClientRect();return{text:(e.getAttribute('aria-label')??e.textContent??'').trim().slice(0,40),w:Math.round(r.width),h:Math.round(r.height)};}).filter(r=>r.w<44||r.h<44));
  expect(small).toEqual([]);
  pass('44 px på telefon','alla knappar och fält i Min tjänst är minst 44 × 44 px');
});

/** Kommandot som klienten skickar, med payloadhash från kontraktet (för direktanrop). */
async function createCommand(unitId:string,schoolYear:number,action:string,expectedRevision:number,payload:unknown,extra:Record<string,unknown>={}){
  const contract=await import('../lib/tjanst-contract.ts');
  return{commandId:crypto.randomUUID(),unitId,schoolYear,action,expectedRevision,payloadHash:await contract.tjanstPayloadHash(action as never,payload as never),payload,...extra};
}
