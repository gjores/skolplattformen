// Actual local IdP/browser trial; no traces, raw page output, codes or cookies in reports.
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import fs from 'node:fs';
import {assertTarget} from './verify-target.mjs';

export async function verifyLocalLoginHelpers() {
  const manifest=await assertTarget('protected',{requireIdp:true});
  const require=createRequire(new URL('../../web/package.json',import.meta.url));
  const {chromium,webkit,devices,expect}=require('@playwright/test');
  const base='http://127.0.0.1:3012';
  const cases=[];
  let stage='readiness', failure=null;
  try {
    const health=await fetch(base+'/api/health/db',{signal:AbortSignal.timeout(10000)});
    const status=await health.json();
    if(health.status!==200||status.runtime!=='workerd'||status.role!=='skolplattform_worker')throw Error('readiness');
    for(const [profile,engine,options,roles] of [
      ['desktop',chromium,{viewport:{width:1440,height:900}},[['p3.rektor','Rektor'],['p3.huvudman','Huvudman']]],
      ['phone',webkit,devices['iPhone 13'],[['p3.rektor','Rektor'],['p3.it','IT']]],
    ]) {
      const browser=await engine.launch({headless:true});
      try {
        for(const [username,label] of roles) {
          const context=await browser.newContext({...options,locale:'sv-SE'});
          const page=await context.newPage();
          try {
            stage=`${profile}-${label}-password`;
            await page.goto(base+'/api/auth/login');
            await expect(page.locator('#local-test-accounts')).toBeVisible();
            await expect(page.locator('#local-test-accounts button')).toHaveCount(8);
            await page.getByRole('button',{name:label,exact:true}).click();
            await expect(page.locator('#username')).toHaveValue(username);
            await expect(page.locator('#password')).toHaveAttribute('type','password');
            await page.locator('#kc-login').click();
            stage=`${profile}-${label}-otp`;
            const otp=page.locator('input[name=otp]');
            await expect(otp).toBeVisible();
            stage=`${profile}-${label}-otp-button`;
            const button=page.getByRole('button',{name:'Fyll i provkod',exact:true});
            await expect(button).toBeVisible();
            const bounds=await button.boundingBox();
            if(!bounds||bounds.height<44){failure='touch_target';throw Error('touch_target');}
            if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth)){failure='horizontal_overflow';throw Error('horizontal_overflow');}
            let requestedUser=null;page.on('request',r=>{if(r.url()==='http://127.0.0.1:8181/otp'&&r.method()==='POST'){try{requestedUser=JSON.parse(r.postData()).username;}catch{}}});
            stage=`${profile}-${label}-otp-fill`;
            await button.click();
            await expect(otp).toHaveValue(/^\d{6}$/, {timeout:50000});
            if(requestedUser!==username){failure='wrong_helper_account';throw Error('helper_account');}
            await page.locator('#kc-login').click();
            stage=`${profile}-${label}-callback`;
            await page.waitForURL(url=>url.origin===base&&!url.pathname.startsWith('/api/auth'),{timeout:30000}).catch(()=>{failure=new URL(page.url()).pathname.includes('/realms/')?'idp_did_not_return':'callback_did_not_finish';throw Error('return_failed');});
            const response=await page.request.get(base+'/api/session');
            const session=await response.json();
            const user=manifest.idp.users.find(u=>u.username===username);
            if(response.status()!==200){failure='session_read_failed';throw Error('session');}
            if(session.identity?.subject!==user.subject){failure='account_mismatch';throw Error('account');}
            if(session.mfa?.proof!==true||!session.mfa.amr.includes('otp')){failure='mfa_proof_missing';throw Error('proof');}
            cases.push({profile,role:label,status:'PASS',actualOidc:true,mfaProof:true,touchTarget:true,noHorizontalOverflow:true});
          } finally {
            try {
              if((await context.cookies(base)).some(cookie=>cookie.name==='sp_session')) {
                const logout=await page.request.post(base+'/api/auth/logout',{headers:{Origin:base,'Sec-Fetch-Site':'same-origin'}});
                if(logout.status()!==200)throw Error('cleanup_failed');
              }
            } finally {await context.close();}
          }
        }
      } finally {await browser.close();}
    }
    return {status:'PASS',checkedAt:new Date().toISOString(),scope:'isolated local synthetic IdP',cases,
      cleanup:'actual app logout revokes each own browser session; security audit preserved',
      limitations:['Test helper automatically supplies a real local code; this is not a human second-factor assurance test.','Phone uses iPhone/WebKit emulation; production authentication and mandates unchanged.']};
  } catch {return {status:'FAIL',stage,failure,cases};}
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url) {
  if(process.argv.length!==2)throw Error('no_flags_allowed');
  const report=await verifyLocalLoginHelpers();
  fs.writeFileSync(new URL('./results/local-login-helpers.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
  if(report.status!=='PASS')process.exitCode=1;
}
