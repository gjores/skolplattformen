// Verklig provinloggning via wifi-ingången; inga lösenord, koder, cookies eller
// åtkomstnycklar skrivs till rapporten. Beständiga utbildningar läses, inte ändras.
import {createRequire} from 'node:module';
import {readFile,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {verifyProgramplanBrowserTarget} from './phase5-programplan-browser-fixtures.mjs';

const require=createRequire(new URL('../../web/package.json',import.meta.url));
const {chromium,webkit,devices,expect}=require('@playwright/test');
const manifest=await assertTarget('protected',{requireIdp:true});
const access=JSON.parse(await readFile(new URL('./targets/protected/mobile-preview.json',import.meta.url),'utf8'));
const proof=await verifyProgramplanBrowserTarget('http://127.0.0.1:3012');
const {origin,entry}=access;
const cases=[];
let stage='entry',failure=null,diagnostics=null;
try {
  expect((await fetch(origin,{redirect:'manual'})).status).toBe(403);
  for(const [profile,engine,options,roles] of [
    ['desktop',chromium,{viewport:{width:1440,height:900}},[['p3.rektor','Rektor','rektor']]],
    ['phone',webkit,devices['iPhone 13'],[['p3.rektor','Rektor','rektor'],['p3.huvudman','Huvudman','huvudman']]],
  ]) {
    const browser=await engine.launch({headless:true});
    try {
      for(const [username,label,role] of roles) {
        const context=await browser.newContext({...options,locale:'sv-SE'});
        const page=await context.newPage();
        const foreign=[];
        const otpResponses=[];
        const idpResponses=[];
        let businessWrites=0;
        page.on('request',request=>{
          const url=new URL(request.url());
          if(url.protocol.startsWith('http')&&url.origin!==origin) foreign.push(url.origin);
          if(url.pathname.startsWith('/api/programplaner/')&&/skapa|ersatt|bind|klona|faststall/.test(url.pathname)) businessWrites++;
        });
        page.on('response',response=>{if(new URL(response.url()).pathname==='/__mobile/otp')otpResponses.push(response.status());});
        page.on('response',response=>{const path=new URL(response.url()).pathname;if(path.startsWith('/realms/'))idpResponses.push({path,status:response.status(),method:response.request().method()});});
        try {
          stage=`${profile}-${label}-entry`;
          await page.goto(entry);
          await page.goto(origin+'/api/auth/login');
          await expect(page.getByRole('button',{name:label,exact:true})).toBeVisible();
          await page.getByRole('button',{name:label,exact:true}).click();
          await expect(page.locator('#username')).toHaveValue(username);
          await page.locator('#kc-login').click();
          stage=`${profile}-${label}-otp-button`;
          await expect(page.getByRole('button',{name:'Fyll i provkod',exact:true})).toBeVisible({timeout:5000});
          await page.getByRole('button',{name:'Fyll i provkod',exact:true}).click();
          stage=`${profile}-${label}-otp-fill`;
          await expect(page.locator('input[name=otp]')).toHaveValue(/^\d{6}$/,{timeout:50000});
          await page.locator('#kc-login').click();
          stage=`${profile}-${label}-callback`;
          await page.waitForURL(url=>url.origin===origin&&!url.pathname.startsWith('/api/auth'),{timeout:30000});
          const sessionResponse=await page.request.get(origin+'/api/session');
          const session=await sessionResponse.json();
          expect(sessionResponse.status()).toBe(200);
          expect(session.identity.subject).toBe(manifest.idp.users.find(u=>u.username===username).subject);
          expect(session.mfa.proof).toBe(true);expect(session.mfa.amr).toContain('otp');
          const assignment=session.assignments.find(a=>a.function===role&&a.state==='giltigt'&&a.customerId==='33000000-0000-4000-8000-000000000001'&&(role!=='rektor'||a.unitId==='33000000-0000-4000-8000-000000000111'));
          expect(assignment).toBeTruthy();
          stage=`${profile}-${label}-context`;
          if(session.context?.assignmentId!==assignment.id) {
            await expect(page.getByLabel('Uppdrag',{exact:true})).toBeVisible();
            const changed=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/context'&&r.request().method()==='POST');
            await page.getByLabel('Uppdrag',{exact:true}).selectOption(assignment.id);
            expect((await changed).status()).toBe(200);
          } else expect(session.context.valid&&!session.context.blocked).toBe(true);
          stage=`${profile}-${label}-programplan`;
          const mobile=profile==='phone';
          const sidebar=page.locator('[data-slot="sidebar"][data-state]');
          await expect(page.getByRole('button',{name:'Visa eller dölj navigation'})).toBeVisible();
          if(mobile?!await page.locator('[data-mobile="true"]').isVisible():await sidebar.getAttribute('data-state')==='collapsed') await page.getByRole('button',{name:'Visa eller dölj navigation'}).click();
          await page.getByRole('button',{name:'Programplaner',exact:true}).click();
          const workspace=page.getByTestId('protected-programplan-workspace');
          const flow=workspace.getByRole('region',{name:'Program, inriktning och fördjupning',exact:true});
          const school=flow.getByLabel('Skola',{exact:true});await expect(school).toBeEnabled();
          if(await school.inputValue()!=='33000000-0000-4000-8000-000000000111') await school.selectOption('33000000-0000-4000-8000-000000000111');
          await expect(flow).toHaveAttribute('aria-busy','false');
          await flow.getByLabel('1. Program',{exact:true}).selectOption('SA25:4');
          await expect(flow).toHaveAttribute('aria-busy','false');
          await flow.getByLabel('2. Inriktning',{exact:true}).selectOption('SASAP');
          await expect(flow.getByRole('region',{name:'Välj utbildning och elevkull',exact:true}).getByRole('button')).toHaveCount(4);
          if(role==='huvudman') {
            await flow.getByRole('button',{name:'Ny utbildning',exact:true}).click();
            await expect(flow.getByLabel('Utbildningens namn',{exact:true})).toBeVisible();
            await flow.getByLabel('1. Program',{exact:true}).selectOption('VO25:4');
            await expect(flow).toHaveAttribute('aria-busy','false');
            await expect(flow).toContainText('Programmet har ingen inriktning.');
            await expect(flow.getByRole('heading',{name:'3. Programfördjupning',exact:true})).toBeVisible();
          } else expect(await flow.getByRole('button',{name:'Ny utbildning',exact:true}).count()).toBe(0);
          expect(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)).toBe(false);
          expect(businessWrites).toBe(0);expect(foreign).toEqual([]);
          stage=`${profile}-${label}-logout`;
          const logoutResponse=page.waitForResponse(r=>new URL(r.url()).pathname==='/api/auth/logout'&&r.request().method()==='POST');
          const idpLogout=page.waitForResponse(r=>new URL(r.url()).pathname==='/realms/skolplattform-test/protocol/openid-connect/logout');
          await page.getByRole('button',{name:'Logga ut',exact:true}).click();
          const ended=await logoutResponse;expect(ended.status()).toBe(200);await ended.finished();
          expect((await idpLogout).status()).toBeLessThan(400);
          await page.waitForURL(url=>url.origin===origin&&url.pathname==='/',{timeout:30000});
          await expect(page.getByRole('link',{name:'Logga in',exact:true})).toBeVisible();
          expect((await page.request.get(origin+'/api/session')).status()).toBe(401);
          cases.push({profile,role,status:'PASS',actualOidc:true,mfaProof:true,correctMandate:true,sharedProgramSelection:true,noForeignBrowserOrigins:true,noBusinessWrites:true,noHorizontalOverflow:true,logoutRevoked:true});
        } catch(error) {
          const visibleText=await page.locator('body').innerText();
          diagnostics={path:new URL(page.url()).pathname,otpResponses,idpResponses,otpInputPresent:await page.locator('input[name=otp]').count(),otpButtonPresent:await page.getByRole('button',{name:'Fyll i provkod',exact:true}).count(),failureClass:error.constructor.name,cookies:(await context.cookies(origin)).map(c=>({name:c.name,secure:c.secure,sameSite:c.sameSite})),gatewayOriginDenied:visibleText.includes('Främmande ursprung nekas')||visibleText.includes('Ursprung krävs'),cookieError:/cookie.*not found|cookie.*hittades/i.test(visibleText),sslError:/https required|ssl required/i.test(visibleText),credentialError:/invalid username|invalid.*password|felaktigt.*lösenord/i.test(visibleText),restartError:/restart|timed out|timeout|starta om/i.test(visibleText)};
          throw error;
        } finally {
          if((await context.cookies(origin)).some(c=>c.name==='sp_session')) {
            const cleanup=await page.request.post(origin+'/api/auth/logout',{headers:{Origin:origin,'Sec-Fetch-Site':'same-origin'}});
            if(cleanup.status()!==200) throw Error('session_cleanup_failed');
          }
          await context.close();
        }
      }
    } finally {await browser.close();}
  }
} catch {failure=stage;}
const source=await readFile(new URL('./mobile-preview.mjs',import.meta.url));
const report={...proof,status:failure?'FAIL':'PASS',checkedAt:new Date().toISOString(),gatewaySha256:createHash('sha256').update(source).digest('hex'),cases,failure,diagnostics,scope:'local synthetic LAN entry, no app/IdP configuration changes',humanPhoneResult:'awaiting_user',limits:['Browser checks use Chromium/WebKit on the computer, not a physical phone.','The temporary HTTP entry is bound to the selected private interface and access-link gated for two hours.','Existing protected app, identity/MFA and server mandates remain authoritative.']};
await writeFile(new URL('./results/mobile-preview.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,cases,failure,diagnostics}));
if(report.status!=='PASS') process.exitCode=1;
