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
const contexts:Record<string,BrowserContext>={},pages:Record<string,Page>={},network:Record<string,{method:string;path:string;status:number|null}[]>={};
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
  ctx.on('request',req=>{const u=new URL(req.url());if(u.origin!==baseURL)return;const entry={method:req.method(),path:u.pathname,status:null as number|null};network[role].push(entry);
    void req.response().then(r=>{if(r)entry.status=r.status();}).catch(()=>{});});
  return page;
}
async function signIn(browser:Browser,info:TestInfo,role:string,returnTo='/'){
  const page=await context(browser,info,role);await fixture!.login(page,role,{returnTo});
  await expect(page.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();return page;
}

const ws=(page:Page)=>page.locator('.tjanst');
const matrix=(page:Page)=>ws(page).getByRole('region',{name:'Matris'});
const footer=(page:Page,label:string,teacher:string)=>page.locator(`[data-sum="${label}:${teacher}"]`);
async function settled(page:Page){await expect(ws(page)).toHaveAttribute('aria-busy','false');await expect(ws(page).getByText('Hämtar tjänstefördelningen…')).toHaveCount(0);}
/** Öppnar Tjänstefördelning via menyn och väljer skola och läsår i planeringsvalet. */
async function openTjanst(page:Page,unitId:string){
  await page.getByRole('link',{name:'Tjänstefördelning',exact:true}).or(page.getByRole('button',{name:'Tjänstefördelning',exact:true})).first().click();
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
  seed=await seedTjanstActual(db,{published:PHONE(project)});result.scope={year:seed.year,customerId:seed.customerId,schools:seed.schools};save();
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

/** Öppnar rektors Fastställ-panel och publicerar; med mfa kontrolleras att servern kräver engångskod och step-up görs via knappen. */
async function publish(page:Page,role:string,versionNo:number,{stepUp=false}={}){
  await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  const panel=ws(page).getByRole('region',{name:'Fastställ och publicera'});
  await panel.getByRole('button',{name:'Fastställ och publicera…'}).click();
  let dialog=page.getByRole('dialog');
  await expect(dialog.getByRole('heading',{name:`Fastställ och publicera version ${versionNo}?`})).toBeVisible();
  await expect(dialog.getByRole('button',{name:'Behåll utkastet'})).toBeFocused();
  if(stepUp){
    const sent=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/tjanst/plan/publicera');
    await dialog.getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
    const denied=await sent;expect(denied.status()).toBe(403);expect((await denied.json()).code).toBe('mfa_required');
    await expect(dialog.getByRole('alert')).toContainText('Att fastställa och publicera kräver verifiering med engångskod.');
    const proof=await fixture!.login(page,role,{stepUp:true,trigger:()=>dialog.getByRole('button',{name:'Verifiera med engångskod'}).click()});
    expect(proof.mfa).toBe(true);await settled(page);
    await ws(page).getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
    await panel.getByRole('button',{name:'Fastställ och publicera…'}).click();dialog=page.getByRole('dialog');
  }
  const done=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/tjanst/plan/publicera');
  await dialog.getByRole('button',{name:'Fastställ och publicera',exact:true}).click();
  expect((await done).status()).toBe(200);
  await expect(ws(page).getByText(`Version ${versionNo} är fastställd och publicerad. Lärarna ser den i Min tjänst.`)).toBeVisible();
  await settled(page);
}

test('spår: rektor A tilldelar en Gy25-rad och publicerar med engångskod; P1 ser raden i Min tjänst',async({browser},info)=>{
  test.skip(project!=='desktop','Spåret körs på projektet desktop.');
  const p=await signIn(browser,info,'principalA');
  await openTjanst(p,seed.schools.A);
  await expect(ws(p).getByRole('heading',{name:`Ingen tjänstefördelning för läsåret ${String(seed.year).slice(2)}/${String(seed.year+1).slice(2)} ännu`})).toBeVisible();
  await ws(p).locator('.tjanst-state').getByRole('button',{name:'Lägg till lärare i fördelningen'}).click();
  let dialog=p.getByRole('dialog');await dialog.getByLabel('Lärare').selectOption({label:'Pia Ek'});
  await dialog.getByRole('button',{name:'Lägg till läraren'}).click();
  await expect(ws(p).getByText('Pia Ek är tillagd i fördelningen.')).toBeVisible();await settled(p);
  const cell=matrix(p).getByRole('button',{name:/^Pia Ek, .*, SYNBF1: ingen tid\. Tilldela\.$/}).first();
  const cellName=(await cell.getAttribute('aria-label'))??'';
  await cell.click();dialog=p.getByRole('dialog');
  await expect(dialog.getByText('Schemalagd tid')).toBeVisible();await expect(dialog.getByText('Underlag saknas')).toBeVisible();
  await capture(p,'spar-tjansterad');
  const ht=await dialog.getByLabel('Lärartid HT (timmar)').inputValue();
  await dialog.getByLabel('Lärartid VT (timmar)').fill('40');
  await dialog.getByRole('button',{name:'Spara tjänsteraden'}).click();
  await expect(ws(p).getByText(/^Tjänsteraden är sparad: Pia Ek, .*, SYNBF1, HT .* · VT 40 h\.$/)).toBeVisible();await settled(p);
  await expect(footer(p,'Undervisning','Pia Ek')).toHaveText(/^\d+ h$/);
  await capture(p,'spar-matris');
  await fixture!.expireMfa(p,'principalA');
  await publish(p,'principalA',1,{stepUp:true});
  await capture(p,'spar-publicerad');
  const [version]=await db`select v.status,v.version_no from public.tjanst_versions v join public.tjanst_distributions d on d.id=v.distribution_id where d.unit_id=${seed.schools.A} and d.school_year=${seed.year}`;
  expect(version).toMatchObject({status:'published',version_no:1});
  pass('spår','rektor A tilldelar en Gy25-rad i matrisen och publicerar efter riktig step-up',{cell:cellName,prefilledHt:ht,version});
  const t=await signIn(browser,info,'teacherSelf');
  await expect(t.getByRole('heading',{name:'Min tjänst',level:1})).toBeVisible();
  await expect(t.getByText(/SYNBF1/).first()).toBeVisible();
  await capture(t,'spar-min-tjanst');
  const paths=network.teacherSelf.map(n=>n.path).filter(x=>x.startsWith('/api/'));
  expect(paths.filter(x=>x.startsWith('/api/elever')||x.startsWith('/api/planering'))).toEqual([]);
  const direct=await fixture!.request(t,'teacherSelf','/api/elever/lista',{selection:{schoolYear:seed.year,unitId:seed.schools.A,classId:null,educationId:null,grade:null,status:null,page:1},search:''});
  expect(direct.status).toBe(403);
  pass('spår','P1 landar i Min tjänst och ser raden; nätverksloggen saknar /api/elever och /api/planering; direktanrop mot /api/elever/lista ger 403',{apiPaths:[...new Set(paths)],direct});
});
