// 05.1.1-15. Actual browser -> OIDC -> Worker -> owned PostgreSQL schema copy.
// Calendar endpoints are never mocked. The separate demo fixture is only a visual reference.
import {test,expect,type Browser,type BrowserContext,type Page,type TestInfo} from '@playwright/test';
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync,realpathSync,statSync} from 'node:fs';
import path from 'node:path';
import {assertTarget} from '../../work/pilot/verify-target.mjs';
import {createLasarOidcFixture,seedLasarActual,lasarForeignFingerprint,LASAR_ACTUAL_CASES,LASAR_ACTUAL_ROLES} from '../../work/pilot/lasar-oidc-fixtures.mjs';
import {lasarPayloadHash,parseLasarReadReply,parseLasarCommandReply,parseLasarSummaryReply,type LasarTarget,type LasarReadReply,type LasarAnyOp,type LasarDecision} from '../lib/lasar-contract';
const postgres=createRequire(import.meta.url)('postgres');
type Db=ReturnType<typeof postgres>;
type Fixture=Awaited<ReturnType<typeof createLasarOidcFixture>>;
type Seed=Awaited<ReturnType<typeof seedLasarActual>>;
const manifestPath=process.env.LASAR_ACTUAL_MANIFEST!,evidenceDir=process.env.LASAR_ACTUAL_EVIDENCE_DIR!;
let db:Db,fixture:Fixture|undefined,seed:Seed,project='',baseURL='';
const contexts:Record<string,BrowserContext>={},pages:Record<string,Page>={},network:Record<string,{method:string;path:string;status:number|null}[]>={};
const result:{status:string;project:string;checks:{case:string;name:string;ok:true;details?:unknown}[];screenshots:{file:string;sha256:string;geometry:unknown}[];errors:unknown[];browser?:unknown;scope?:unknown;foreignCanary?:{before:unknown;after?:unknown;unchanged?:boolean};missing?:string[]}={status:'FAIL',project:'',checks:[],screenshots:[],errors:[]};
const phone=()=>project.startsWith('phone');
const save=()=>writeFileSync(path.join(evidenceDir,`browser-${project}.json`),JSON.stringify(result,null,2)+'\n',{mode:0o600});
const pass=(name:string,details?:unknown)=>{result.checks.push({case:name,name,ok:true,...(details===undefined?{}:{details})});save();};
const school=(unitId:string):LasarTarget=>({kind:'school',unitId});
const frame:LasarTarget={kind:'frame'};
const responseOf=(route:string)=>(r:{url():string})=>new URL(r.url()).pathname===route;
async function request(role:string,route:string,input?:unknown,headers?:Record<string,string>){return fixture!.request(pages[role],role,route,input,headers);}
async function read(role:string,target:LasarTarget,year=seed.year,versionId:string|null=null):Promise<LasarReadReply>{
 const q={target,schoolYear:year,versionId},r=await request(role,'/api/lasar/lasa',q);expect(r.status,JSON.stringify(r.body)).toBe(200);return parseLasarReadReply(r.body,q);
}
async function command(role:string,target:LasarTarget,ops:LasarAnyOp[],year=seed.year,current?:LasarReadReply){
 const c=current??await read(role,target,year),creating=ops[0]?.op==='create',q={commandId:randomUUID(),target,schoolYear:year,versionId:creating?null:c.calendar?.versionId??null,expectedRevision:creating?null:c.calendar?.revision??null,ops,payloadHash:await lasarPayloadHash(ops)};
 const r=await request(role,'/api/lasar/kommando',q);expect(r.status,JSON.stringify(r.body)).toBe(200);return parseLasarCommandReply(r.body,q).detail;
}
async function decision(role:string,target:LasarTarget,action:LasarDecision,year=seed.year,extra:Record<string,unknown>={}){
 const c=await read(role,target,year),q={commandId:randomUUID(),target,schoolYear:year,versionId:c.calendar?.versionId??null,expectedRevision:c.calendar?.revision??null,action,text:'Syntetiskt kalenderprov: '+action,mode:null,confirmAffected:[],...extra};
 const r=await request(role,'/api/lasar/beslut',q);expect(r.status,JSON.stringify(r.body)).toBe(200);return r.body;
}
async function context(browser:Browser,info:TestInfo,role:string){
 if(pages[role])return pages[role];const use=info.project.use;
 const ctx=await browser.newContext({viewport:use.viewport,userAgent:use.userAgent,deviceScaleFactor:use.deviceScaleFactor,isMobile:use.isMobile,hasTouch:use.hasTouch,baseURL,locale:'sv-SE',timezoneId:'Europe/Stockholm',reducedMotion:'reduce'});
 contexts[role]=ctx;const p=await ctx.newPage();pages[role]=p;network[role]=[];
 p.on('pageerror',e=>{result.errors.push({role,message:e.message});save();});
 ctx.on('request',req=>{const u=new URL(req.url());if(u.origin!==baseURL)return;const entry={method:req.method(),path:u.pathname,status:null as number|null};network[role].push(entry);void req.response().then(r=>{if(r)entry.status=r.status();}).catch(()=>{});});
 return p;
}
async function login(browser:Browser,info:TestInfo,role:string){const p=await context(browser,info,role);await fixture!.login(p,role);await expect(p.getByRole('button',{name:'Logga ut',exact:true})).toBeVisible();return p;}
async function open(p:Page,unitId:string,year=seed.year){
 await p.bringToFront();await p.goto(baseURL+'/?vy=lasar');
 const ys=p.getByLabel('Planeringsläsår',{exact:true}),us=p.getByLabel('Planeringsskola',{exact:true});await expect(ys).toBeVisible();
 if(await ys.inputValue()!==String(year))await ys.selectOption(String(year));
 if(await us.inputValue()!==unitId)await us.selectOption(unitId);
 await expect(p.locator('.protected-lasar')).toBeVisible();await expect(p.getByText('Läser kalendern…',{exact:true})).toHaveCount(0);
}
async function ready(p:Page){await expect(p.locator('.ly-calendar')).toBeVisible();await expect(p.locator('.og-saving')).toHaveCount(0);}
async function uiDecision(p:Page,action:string,button=action,text='Syntetiskt prov genom användargränssnittet.'){
 await p.bringToFront();await p.locator('.tp-workflow-actions').getByRole('button',{name:action,exact:true}).click();
 const d=p.getByRole('dialog');await expect(d).toBeVisible();await d.getByRole('textbox').fill(text);
 const done=p.waitForResponse(responseOf('/api/lasar/beslut'));await d.getByRole('button',{name:button,exact:true}).click();expect((await done).status()).toBe(200);await expect(d).toHaveCount(0);await ready(p);
}
async function capture(p:Page,name:string,source:string){
 await p.evaluate(()=>document.fonts.ready);const geometry=await p.evaluate(()=>({width:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth,viewport:{w:innerWidth,h:innerHeight}}));
 expect(geometry.scrollWidth,name).toBeLessThanOrEqual(geometry.width+1);const file=`${project}-${name}.png`,filePath=path.join(evidenceDir,file);await p.screenshot({path:filePath,fullPage:true});
 result.screenshots.push({file,sha256:createHash('sha256').update(readFileSync(filePath)).digest('hex'),geometry:{...geometry,source}});save();
}
async function summary(role:string,year=seed.year){const q={unitId:seed.schools.A,schoolYear:year},r=await request(role,'/api/lasar/sammanfattning',q);expect(r.status,JSON.stringify(r.body)).toBe(200);return parseLasarSummaryReply(r.body,q);}

test.beforeAll(async({browser},info)=>{
 project=info.project.name;result.project=project;result.browser={name:browser.browserType().name(),version:browser.version(),viewport:info.project.use.viewport};
 assert.ok(manifestPath.startsWith('/private/tmp/')&&evidenceDir.startsWith('/private/tmp/'));assert.equal(realpathSync(manifestPath),manifestPath);assert.equal(statSync(manifestPath).mode&0o077,0);assert.equal(statSync(evidenceDir).mode&0o077,0);
 const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));assert.equal(manifest.kind,'lasar-actual-owned-runtime');assert.equal(manifest.baseURL,'http://127.0.0.1:3016');assert.equal(process.env.PHASE5_BASE_URL,manifest.baseURL);assert.equal(manifest.provenance.dataCopied,false);assert.match(manifest.provenance.database,/^named_timplan_[a-f0-9]{32}$/u);baseURL=manifest.baseURL;
 const target=await assertTarget('protected',{requireIdp:true});assert.equal(target.projectId,manifest.provenance.sourceProject);const endpoint=new URL(target.dbUrl);assert.equal(endpoint.hostname,'127.0.0.1');assert.equal(endpoint.port,manifest.provenance.sourcePort);assert.notEqual(endpoint.pathname,'/'+manifest.provenance.database);endpoint.pathname='/'+manifest.provenance.database;
 db=postgres(endpoint.toString(),{max:1,prepare:false,onnotice:()=>{}});const [identity]=await db`select current_database() database,(pg_control_system()).system_identifier::text system_identifier`;assert.equal(identity.database,manifest.provenance.database);assert.equal(identity.system_identifier,manifest.provenance.source.system_identifier);
 seed=await seedLasarActual(db);result.scope={year:seed.year,currentYear:seed.currentYear,customerId:seed.customerId,schools:seed.schools};result.foreignCanary={before:await lasarForeignFingerprint(db,seed)};save();
 const ownDir=path.join(evidenceDir,'oidc-'+project);mkdirSync(ownDir,{mode:0o700});fixture=await createLasarOidcFixture({db,provenance:manifest.provenance,baseURL,evidenceDir:ownDir,seed,roles:LASAR_ACTUAL_ROLES});
});
test.afterAll(async()=>{
 const cleanup:{status:string;cleanup?:unknown;proof?:unknown;databaseClosed?:boolean}={status:'FAIL'};
 try{if(seed){const after=await lasarForeignFingerprint(db,seed);expect(after).toEqual(result.foreignCanary!.before);result.foreignCanary={...result.foreignCanary!,after,unchanged:true};}writeFileSync(path.join(evidenceDir,`network-${project}.json`),JSON.stringify(network,null,1)+'\n',{mode:0o600});
 result.missing=(LASAR_ACTUAL_CASES[project as keyof typeof LASAR_ACTUAL_CASES]??[]).filter((name:string)=>!result.checks.some(c=>c.case===name));result.status=result.missing.length===0&&result.errors.length===0?'PASS':'FAIL';save();
 }finally{await Promise.all(Object.values(contexts).map(c=>c.close()));try{if(fixture){cleanup.cleanup=await fixture.cleanup();cleanup.proof=fixture.proof();cleanup.status='PASS';}}finally{if(db)await db.end();cleanup.databaseClosed=true;writeFileSync(path.join(evidenceDir,`oidc-${project}.json`),JSON.stringify(cleanup,null,2)+'\n',{mode:0o600});}}
});

test('läsårskalendern genom OIDC, Worker och PostgreSQL',async({browser},info)=>{
 const p=await login(browser,info,'principalA'),h=await login(browser,info,'hm'),a=await login(browser,info,'admin'),b=await login(browser,info,'principalB');
 const A=school(seed.schools.A),B=school(seed.schools.B);
 // Boundary checks use the actual session and authoritative server, without route interception.
 const wrongSchool=await request('principalA','/api/lasar/lasa',{target:B,schoolYear:seed.year,versionId:null});expect(wrongSchool.status).toBe(403);
 const foreign=await request('principalA','/api/lasar/lasa',{target:school(seed.schools.foreign),schoolYear:seed.year,versionId:null});expect(foreign.status).toBe(403);
 const csrf=await p.request.post(baseURL+'/api/lasar/kommando',{data:{}});expect(csrf.status()).toBe(403);
 const stale=await request('principalA','/api/lasar/lasa',{target:A,schoolYear:seed.year,versionId:null},{'X-Context-Epoch':'0'});expect(stale.status).toBe(409);expect(stale.body.code).toBe('context_changed');
 await fixture!.expireMfa(p,'principalA');const denied=await request('principalA','/api/lasar/beslut',{commandId:randomUUID(),target:A,schoolYear:seed.year,versionId:null,expectedRevision:null,action:'submit',text:'Utan färsk verifiering',mode:null,confirmAffected:[]});expect(denied.status).toBe(403);expect(denied.body.code).toBe('mfa_required');await fixture!.login(p,'principalA',{stepUp:true});
 pass('HTTP-nekanden',{anotherSchool:403,foreignCustomer:403,missingCsrf:403,changedEpoch:409,decisionWithoutOtp:403});
 // Demo and protected view have exactly the same GR proposal for 2026, through different rendering paths.
 await command('principalB',B,[{op:'create',source:'proposal'}],seed.currentYear);await open(b,seed.schools.B,seed.currentYear);await ready(b);
 const demo=await contexts.principalB.newPage();await demo.goto(`http://127.0.0.1:3017/e2e/fixtures/lasar-preview.html?vy=demo&ar=${seed.currentYear}`);await expect(demo.locator('.ly-calendar')).toBeVisible();
 const calendar=(q:Page)=>q.locator('.ly-grid').evaluateAll(tables=>tables.map(table=>Array.from(table.querySelectorAll('tr')).map(row=>Array.from(row.querySelectorAll('td,th')).map(cell=>({text:cell.textContent?.replace(/\s+/g,' ').trim(),kind:(cell.className??'').replace(/ ly-(?:past|selected|anchor)/g,'')})))));
 expect(await calendar(b)).toEqual(await calendar(demo));expect(await b.locator('.ly-counters').first().innerText()).toBe(await demo.locator('.ly-counters').first().innerText());
 const width=project==='desktop-small'?1280:info.project.use.viewport!.width;await b.setViewportSize({width,height:info.project.use.viewport!.height});await demo.setViewportSize({width,height:info.project.use.viewport!.height});await capture(b,'protected-calendar','actual Worker/OIDC/PostgreSQL');await capture(demo,'demo-calendar','simulated demo reference');await demo.close();await b.setViewportSize(info.project.use.viewport!);
 pass('demo och skyddad kalender',{sameGridAndCounters:true,width});
 // IM text is exercised in the real Timplaner, before and after an actual decision.
 await p.bringToFront();await p.goto(baseURL+'/?vy=timplaner');await p.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));await p.getByRole('button',{name:'Grundskola och introduktionsprogram',exact:true}).click();await p.getByRole('combobox',{name:'Skolform',exact:true}).selectOption({label:'Introduktionsprogram'});
 await p.getByRole('row',{name:/Syntetiskt IM/}).getByRole('button',{name:/^Öppna /}).click();await expect(p.getByText(`Veckoram. Läsårskalendern för ${seed.year}/${String(seed.year+1).slice(2)} är inte fastställd. Inga årstimmar beräknas.`,{exact:true})).toBeVisible();
 // School administrator can propose but never approve; huvudman reads a draft without editing.
 await open(a,seed.schools.A);await a.getByRole('button',{name:phone()?'Skapa förslag':'Kopiera förra läsåret',exact:true}).click();await ready(a);
 if(!phone()){const reviews=(await read('admin',A)).review.filter(r=>!r.resolved);expect(reviews.some(r=>r.reason==='missing_week')).toBe(true);expect(reviews.some(r=>r.reason==='easter')).toBe(true);await expect(a.locator('.ly-review-card')).toBeVisible();await expect(a.getByRole('button',{name:'Skicka förslag',exact:true})).toBeDisabled();while(await a.locator('.ly-review-row').count()){const count=await a.locator('.ly-review-row').count();const r=a.waitForResponse(responseOf('/api/lasar/kommando'));await a.locator('.ly-review-row').first().getByRole('button',{name:/^Klar/}).click();expect((await r).status()).toBe(200);await expect(a.locator('.ly-review-row')).toHaveCount(count-1);}await expect(a.locator('.ly-review-card')).toHaveCount(0);pass('kopiera och granska',{reviews:reviews.length,reasons:[...new Set(reviews.map(r=>r.reason))]});await command('admin',A,[{op:'reset_to_proposal'}]);await open(a,seed.schools.A);await ready(a);}await expect(a.getByRole('button',{name:'Skicka förslag',exact:true})).toBeVisible();
 const adminRead=await read('admin',A);expect(adminRead.capabilities.canApprove).toBe(false);
 const adminApprove=await request('admin','/api/lasar/beslut',{commandId:randomUUID(),target:A,schoolYear:seed.year,versionId:adminRead.calendar!.versionId,expectedRevision:adminRead.calendar!.revision,action:'approve',text:'Nekat',mode:null,confirmAffected:[]});expect(adminApprove.status).toBe(403);
 await open(h,seed.schools.A);await ready(h);await expect(h.locator('.tp-cover-side')).toContainText('Läsvy');await expect(h.locator('.tp-workflow-actions button')).toHaveCount(0);
 await uiDecision(a,'Skicka förslag');expect((await read('principalA',A)).calendar!.status).toBe('forslag');pass('läsläge och skoladministratör',{administratorSubmit:true,administratorApprove:403,headDraftReadOnly:true});
 if(phone()){
  await decision('hm',A,'return');await open(p,seed.schools.A);await ready(p);
  const d=p.locator(`button[title^="onsdag 6 oktober ${seed.year} ·"]`);await d.scrollIntoViewIfNeeded();
  // The touch sequence exercises the calendar's long-press handler.
  const box=(await d.boundingBox())!,touches=[{identifier:0,clientX:box.x+box.width/2,clientY:box.y+box.height/2}];await d.dispatchEvent('touchstart',{touches,changedTouches:touches,targetTouches:touches});await p.waitForTimeout(700);await d.dispatchEvent('touchend',{touches:[],changedTouches:touches,targetTouches:[]});await expect(p.locator('.ly-menu')).toBeVisible();await p.keyboard.press('Escape');
  await p.getByRole('button',{name:'Markera flera',exact:true}).click();await p.locator(`button[title^="torsdag 7 oktober ${seed.year} ·"]`).tap();await expect(p.locator('.ly-marking')).toContainText('2 dagar markerade');expect(await p.locator('.ly-marking').evaluate(el=>getComputedStyle(el).position)).toBe('fixed');
  const apply=p.locator('.ly-marking').getByRole('button',{name:/Gör till lovdagar/});const done=p.waitForResponse(responseOf('/api/lasar/kommando'));await apply.click();expect((await done).status()).toBe(200);await ready(p);await capture(p,'phone-selection','actual Worker/OIDC/PostgreSQL');
  const buttons=await p.locator('.ly-tools button,.tp-workflow-actions button').evaluateAll(es=>es.filter(e=>e.getClientRects().length).map(e=>({label:e.textContent?.trim(),height:e.getBoundingClientRect().height})));for(const x of buttons)expect(x.height,x.label).toBeGreaterThanOrEqual(44);
  pass('telefon: långtryck och Markera flera',{buttons});await uiDecision(p,'Skicka förslag');await open(h,seed.schools.A);await ready(h);await expect(h.getByRole('button',{name:'Fastställ',exact:true})).toBeVisible();pass('telefon: förslag och läsning');
  await decision('hm',A,'approve');
 }else{
  await open(h,seed.schools.A);await ready(h);await uiDecision(h,'Återsänd');await open(p,seed.schools.A);await ready(p);
  const d=(long:string)=>p.locator(`button[title^="${long} ·"]`);
  await p.getByRole('button',{name:'Lovdag',exact:true}).click();let done=p.waitForResponse(responseOf('/api/lasar/kommando'));await d(`onsdag 6 oktober ${seed.year}`).click();expect((await done).status()).toBe(200);await ready(p);
  // Shift selects the interval; only the explicit action below writes it.
  const beforeRange=await read('principalA',A),commandsBeforeRange=network.principalA.filter(r=>r.path==='/api/lasar/kommando').length;
  await d(`fredag 8 oktober ${seed.year}`).click({modifiers:['Shift']});await expect(p.locator('.ly-marking')).toContainText('3 dagar markerade');
  for(const date of [`onsdag 6 oktober ${seed.year}`,`torsdag 7 oktober ${seed.year}`,`fredag 8 oktober ${seed.year}`])await expect(d(date)).toHaveAttribute('aria-pressed','true');
  expect(network.principalA.filter(r=>r.path==='/api/lasar/kommando').length).toBe(commandsBeforeRange);expect((await read('principalA',A)).calendar!.revision).toBe(beforeRange.calendar!.revision);
  done=p.waitForResponse(responseOf('/api/lasar/kommando'));await p.locator('.ly-marking').getByRole('button',{name:'Gör till lovdagar (3)',exact:true}).click();expect((await done).status()).toBe(200);await ready(p);
  const range=await read('principalA',A);for(const date of [`${seed.year}-10-06`,`${seed.year}-10-07`,`${seed.year}-10-08`])expect(range.calendar!.exceptions[date].kind).toBe('lovdag');
  await d(`måndag 11 oktober ${seed.year}`).click({modifiers:['ControlOrMeta']});await expect(d(`måndag 11 oktober ${seed.year}`)).toHaveAttribute('aria-pressed','true');await d(`måndag 11 oktober ${seed.year}`).click({button:'right'});await expect(p.locator('.ly-menu')).toBeVisible();await p.keyboard.press('Escape');
  done=p.waitForResponse(responseOf('/api/lasar/kommando'));await p.getByRole('button',{name:/^Vecka 42: sätt måndag–fredag som lovdag/}).click();expect((await done).status()).toBe(200);await ready(p);
  // Restore for a valid unmodified baseline before the decisions.
  await command('principalA',A,[{op:'reset_to_proposal'}]);await open(p,seed.schools.A);await ready(p);await p.getByRole('button',{name:'Lovdag',exact:true}).click();done=p.waitForResponse(responseOf('/api/lasar/kommando'));await d(`onsdag 6 oktober ${seed.year}`).click();expect((await done).status()).toBe(200);await p.locator('#ly-day-note').fill('Syntetisk anteckning');done=p.waitForResponse(responseOf('/api/lasar/kommando'));await p.locator('#ly-day-note').blur();expect((await done).status()).toBe(200);await ready(p);
  expect((await read('principalA',A)).calendar!.exceptions[`${seed.year}-10-06`].note).toBe('Syntetisk anteckning');await uiDecision(p,'Skicka förslag');await p.getByRole('button',{name:'Ta tillbaka',exact:true}).click();await expect(p.getByRole('button',{name:'Skicka förslag',exact:true})).toBeVisible();await uiDecision(p,'Skicka förslag');pass('eget förslag och dagverktyg');
  await open(h,seed.schools.A);await ready(h);await uiDecision(h,'Fastställ');const before=await summary('principalA');expect(before.current!.version).toBe(1);
  await open(p,seed.schools.A);await ready(p);await uiDecision(p,'Begär ändring','Skicka begäran');
  const over=await request('hm','/api/lasar/oversikt',{schoolYear:seed.year});expect(over.status).toBe(200);expect(over.body.schools.find((s:{unitId:string})=>s.unitId===seed.schools.A).changeRequested).toBe(true);
  await open(h,'all');const row=h.locator('.ly-overview-row').filter({hasText:'Syntetisk skola A'});await expect(row).toContainText('Ändring begärd');await row.getByRole('button',{name:'Öppna läsårskalendern för Syntetisk skola A',exact:true}).click();await ready(h);expect(await h.getByLabel('Planeringsskola',{exact:true}).inputValue()).toBe(seed.schools.A);await uiDecision(h,'Avslå begäran');expect((await read('principalA',A)).changeRequest!.status).toBe('declined');
  await open(p,seed.schools.A);await uiDecision(p,'Begär ändring','Skicka begäran');await open(h,seed.schools.A);await uiDecision(h,'Öppna för ändring','Öppna');const opened=await read('principalA',A);expect(opened.calendar!.version).toBe(2);expect(opened.versions.find(v=>v.version===1)!.current).toBe(true);expect((await summary('principalA')).current).toEqual(before.current);pass('ändringsbegäran, avslag och överblick');
  await open(p,seed.schools.A);await ready(p);await p.locator('.tp-versions button').first().click();await expect(p.locator('.tp-cover-side')).toContainText('Läsvy');await expect(p.locator('.tp-workflow-actions button')).toHaveCount(0);await p.locator('.tp-versions button').last().click();await ready(p);
  const staleRead=await read('principalA',A);await command('admin',A,[{op:'comment',text:'Syntetisk parallell ändring'}]);done=p.waitForResponse(responseOf('/api/lasar/kommando'));await p.getByRole('button',{name:'Lovdag',exact:true}).click();await d(`torsdag 7 oktober ${seed.year}`).click();expect((await done).status()).toBe(409);await expect(p.locator('.tp-inline-error')).toContainText('Kalendern ändrades av någon annan.');expect((await read('principalA',A)).calendar!.revision).toBeGreaterThan(staleRead.calendar!.revision);pass('konflikt mellan sessioner');
  await command('principalA',A,[{op:'set_days',dates:[`${seed.year}-10-07`],kind:'lovdag'}]);await decision('principalA',A,'submit');await decision('hm',A,'approve');expect((await summary('principalA')).current!.version).toBe(2);pass('återsänd, fastställ och ny version');
  const plan=await request('principalA','/api/tjanst/plan/lasa',{unitId:seed.schools.A,schoolYear:seed.year});expect(plan.status,JSON.stringify(plan.body)).toBe(200);const im=plan.body.classes.find((c:{classId:string})=>c.classId===seed.groups.classes.im);expect(im).toBeTruthy();const need=im.needs.find((n:{rowKey:string})=>n.rowKey==='im-ma');const s=await summary('principalA');expect(need.needBasis).toBe('weekly_calendar');expect(need.needHt).toBe(s.current!.htSchoolDays*3*60/5);expect(need.needVt).toBe(s.current!.vtSchoolDays*3*60/5);pass('IM-behov och kalenderversion',{version:s.current!.version,needHt:need.needHt,needVt:need.needVt});
  // A real current-year version, so the lock is based on server time rather than a browser clock.
  await decision('hm',A,'reopen',seed.currentYear);await open(p,seed.schools.A,seed.currentYear);await ready(p);const past=p.locator(`button[title^="onsdag 7 oktober ${seed.currentYear} ·"]`);await expect(past).toHaveAttribute('title',/passerad dag, låst/);await p.getByRole('button',{name:'Lovdag',exact:true}).click();await past.click();await expect(p.locator('.ly-marking')).toContainText('låst');await p.getByRole('button',{name:/^Vecka 41: markera/}).click();await expect(p.locator('.ly-marking')).toContainText('låsta');await past.click({button:'right'});await expect(p.locator('.ly-menu')).toContainText('Markerade dagar är låsta');await p.keyboard.press('Escape');await expect(p.locator('#ly-ht-start')).not.toHaveAttribute('type','date');
  const pc=await read('principalA',A,seed.currentYear),ops:LasarAnyOp[]=[{op:'set_days',dates:[`${seed.currentYear}-10-07`],kind:'lovdag'}],pq={commandId:randomUUID(),target:A,schoolYear:seed.currentYear,versionId:pc.calendar!.versionId,expectedRevision:pc.calendar!.revision,ops,payloadHash:await lasarPayloadHash(ops)};const locked=await request('principalA','/api/lasar/kommando',pq);expect(locked.status).toBe(409);expect(locked.body.code).toBe('conflict');expect(locked.body.details.reason).toBe('lasar_past_day');pass('passerade dagar låsta');
  // Main organiser chooses a frame for the next available year; affected schools are explicitly acknowledged.
  const copyYear=seed.year+1;const preview=await decision('hm',frame,'preview_mode_change',copyYear,{mode:'ram'});await decision('hm',frame,'set_mode',copyYear,{mode:'ram',confirmAffected:preview.affected.map((s:{unitId:string})=>s.unitId)});await command('hm',frame,[{op:'create',source:'proposal'}],copyYear);await open(h,'ram',copyYear);await ready(h);await expect(h.locator('#ly-group')).toHaveCount(0);await expect(h.locator('.ly-shortweek')).toHaveCount(0);await h.getByRole('button',{name:'Ge ut ramen',exact:true}).click();const publish=h.waitForResponse(responseOf('/api/lasar/beslut'));await h.getByRole('dialog').getByRole('button',{name:'Ge ut ramen',exact:true}).click();expect((await publish).status()).toBe(200);
  await open(b,seed.schools.B,copyYear);await b.getByRole('button',{name:'Utgå från huvudmannens ram',exact:true}).click();await ready(b);await command('hm',frame,[{op:'create',source:'frame'}],copyYear);await command('hm',frame,[{op:'set_days',dates:[`${copyYear}-10-11`],kind:'lovdag'}],copyYear);await decision('hm',frame,'publish_frame',copyYear);await open(b,seed.schools.B,copyYear);await ready(b);await expect(b.locator('.ly-frame-banner')).toBeVisible();await b.getByRole('button',{name:'Ta in ramens ändringar',exact:true}).click();await b.getByRole('alertdialog').getByRole('button',{name:/^Ta in \d+ ändring/}).click();await expect(b.locator('.ly-frame-banner')).toHaveCount(0);expect((await read('principalB',B,copyYear)).calendar!.exceptions[`${copyYear}-10-11`].kind).toBe('lovdag');pass('huvudmannens ram och uppdatering');
 }
 await p.bringToFront();await p.goto(baseURL+'/?vy=timplaner');await p.getByLabel('Planeringsläsår',{exact:true}).selectOption(String(seed.year));await p.getByRole('button',{name:'Grundskola och introduktionsprogram',exact:true}).click();await p.getByRole('combobox',{name:'Skolform',exact:true}).selectOption({label:'Introduktionsprogram'});await p.getByRole('row',{name:/Syntetiskt IM/}).getByRole('button',{name:/^Öppna /}).click();await expect(p.getByText(new RegExp(`^Veckoram\\. Läsårskalendern ${seed.year}/.* är fastställd \\(version ${phone()?1:2}, \\d+ skoldagar\\)\\. Individuell fördelning visas inte här\\.$`))).toBeVisible();pass('IM-text i Timplaner',{withoutCalendar:true,approvedVersion:phone()?1:2});
});
