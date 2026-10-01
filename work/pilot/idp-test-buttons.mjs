// Local-only opt-in login helpers. Runtime passwords never enter Git or logs.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
const root=path.resolve(fileURLToPath(import.meta.url),'../../..');
const mode=process.argv[2];
if(process.argv.length!==3||!['--enable','--disable'].includes(mode))throw Error('Använd --enable eller --disable');
const theme='skolplattform-local-test';
const realm='skolplattform-test';
const m=await assertTarget('protected',{requireIdp:true});
const origin=new URL(m.idp.publicUrl);
if(origin.origin!=='http://127.0.0.1:8180'||m.idp.publicUrl!==origin.origin||m.idp.containerName!=='skolplattform-pilot-idp')throw Error('REFUSED: endast lokal prov-IdP');
const ports=JSON.parse(execFileSync('docker',['inspect','--format','{{json .NetworkSettings.Ports}}',m.idp.containerName],{encoding:'utf8',stdio:['ignore','pipe','pipe']}));
if(!ports['8080/tcp']?.length||ports['8080/tcp'].some(p=>p.HostIp!=='127.0.0.1'||p.HostPort!=='8180'))throw Error('REFUSED: IdP-porten måste vara bunden enbart till loopback');
const dir=path.join(root,'work/pilot/targets/protected/idp');
const statePath=path.join(dir,'test-buttons-state.json');
let token;
async function api(url,method='GET',body){
 const r=await fetch(new URL(url,origin),{method,signal:AbortSignal.timeout(15000),headers:{...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});
 if(!r.ok)throw Error(`Local IdP HTTP ${r.status}`);
 const text=await r.text();return text?JSON.parse(text):null;
}
try{
 const response=await fetch(new URL('/realms/master/protocol/openid-connect/token',origin),{method:'POST',signal:AbortSignal.timeout(15000),body:new URLSearchParams({grant_type:'password',client_id:'admin-cli',username:m.idp.adminUser,password:m.idp.adminPassword})});
 if(!response.ok)throw Error('Local IdP admin authentication failed');
 token=(await response.json()).access_token;
 const current=await api(`/admin/realms/${realm}`);
 if(mode==='--disable'){
  if(!fs.existsSync(statePath))throw Error('Ingen sparad temainställning');
  const saved=JSON.parse(fs.readFileSync(statePath,'utf8'));
  if(current.loginTheme!==theme)throw Error('Temat har ändrats av annan åtgärd');
  await api(`/admin/realms/${realm}`,'PUT',{loginTheme:saved.loginTheme});
  execFileSync('docker',['exec',m.idp.containerName,'rm','-rf',`/opt/keycloak/themes/${theme}`],{stdio:'pipe'});
  fs.rmSync(path.join(dir,theme),{recursive:true,force:true});fs.rmSync(statePath);
  console.log('Lokala provknappar avstängda.');
 }else{
  if(!fs.existsSync(statePath))fs.writeFileSync(statePath,JSON.stringify({loginTheme:current.loginTheme??''}),{mode:0o600});
  const passwords=JSON.parse(fs.readFileSync(path.join(dir,'phase3-users.json'),'utf8'));
  const labels=[['p3.rektor','Rektor'],['p3.huvudman','Huvudman'],['p3.admin','Skoladministratör'],['p3.larare','Lärare'],['p3.elevhalsa','Elevhälsa'],['p3.it','IT'],['p3.granskare','Granskare'],['p3.support','Support']];
  let otpBindings={};try{otpBindings=JSON.parse(fs.readFileSync(path.join(dir,'helper-otp-bindings.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  const accounts=labels.map(([username,label])=>{
   if(typeof passwords[username]!=='string'||!passwords[username])throw Error('Lokalt provkonto saknas');
   return {username,label,password:passwords[username],email:m.idp.users.find(user=>user.username===username)?.email,otpCredentialId:otpBindings[username]?.credentialId};
  });
  const target=path.join(dir,theme,'login');
  fs.mkdirSync(path.join(target,'resources/js'),{recursive:true,mode:0o700});
  fs.writeFileSync(path.join(target,'theme.properties'),'parent=keycloak.v2\nimport=common/keycloak\nscripts=js/test-accounts-v2.js\n',{mode:0o600});
  const script=`// Generated private local runtime fixture; do not commit.\n(()=>{\nconst accounts=${JSON.stringify(accounts)};\nfunction installOtp(){\nconst input=document.querySelector('input[name=otp]'),form=input?.closest('form');\nif(!input||!form||document.getElementById('local-test-otp'))return;\nconst users=accounts.filter(a=>['p3.rektor','p3.huvudman','p3.it'].includes(a.username));\nconst header=document.getElementById('kc-attempted-username')?.textContent.trim();\nlet remembered=null;try{remembered=sessionStorage.getItem('local-test-login-user');}catch{}\nconst selected=(header?users.find(a=>a.username===header||a.email===header):null)||users.find(a=>a.username===remembered);\nconst panel=document.createElement('section');panel.id='local-test-otp';panel.setAttribute('aria-label','Lokal provkod');panel.style.cssText='margin:20px 0;padding:16px;border:2px solid #6a9bd0;border-radius:8px;';\nconst info=document.createElement('p');info.textContent='Lokal provmiljö: fyll i koden med knappen och välj sedan Logga in.';panel.append(info);\nconst status=document.createElement('p');status.setAttribute('role','status');\nfor(const account of selected?[selected]:users){\nconst button=document.createElement('button');button.type='button';button.textContent=selected?'Fyll i provkod':'Fyll i provkod för '+account.label.toLowerCase();button.style.cssText='min-height:44px;padding:10px 14px;margin:4px;border:1px solid #6a9bd0;border-radius:6px;background:#eef5ff;color:#172b4d;cursor:pointer';\nbutton.addEventListener('click',async()=>{for(const b of panel.querySelectorAll('button'))b.disabled=true;status.textContent='Hämtar aktuell provkod för '+account.label.toLowerCase()+'. En redan använd kod kan behöva bytas till nästa kod.';\ntry{if(account.otpCredentialId){const credential=[...form.querySelectorAll('input[name=selectedCredentialId]')].find(field=>field.value===account.otpCredentialId);if(!credential)throw Error('credential_missing');credential.click();credential.dispatchEvent(new Event('change',{bubbles:true}));}const response=await fetch('http://127.0.0.1:8181/otp',{method:'POST',credentials:'omit',cache:'no-store',headers:{'Content-Type':'application/json'},body:JSON.stringify({realm:'skolplattform-test',username:account.username}),signal:AbortSignal.timeout(45000)});if(!response.ok)throw Error('unavailable');const result=await response.json();if(typeof result.code!=='string'||!/^\\d{6}$/.test(result.code))throw Error('invalid');input.value=result.code;for(const name of ['input','change'])input.dispatchEvent(new Event(name,{bubbles:true}));status.textContent='Provkod för '+account.label.toLowerCase()+' ifylld. Tryck Logga in.';form.querySelector('[type=submit]')?.focus();}\ncatch{status.textContent='Kodknappen är inte tillgänglig just nu. Du kan fortfarande ange en engångskod i fältet.';}finally{for(const b of panel.querySelectorAll('button'))b.disabled=false;}});panel.append(button);}\npanel.append(status);input.before(panel);\n}\nfunction install(){\nif(!['http://127.0.0.1:8180','http://host.docker.internal:8180','http://localhost:8180'].includes(location.origin)||!location.pathname.startsWith('/realms/skolplattform-test/'))return;\nconst style=document.createElement('style');style.textContent='.kc-tooltip-text{left:auto!important;right:0!important;max-width:calc(100vw - 2rem);overflow-wrap:anywhere}';document.head.append(style);\ninstallOtp();\nconst username=document.getElementById('username'),password=document.getElementById('password'),form=document.getElementById('kc-form-login');\nif(!username||!password||!form||document.getElementById('local-test-accounts'))return;\nform.addEventListener('submit',()=>{const account=accounts.find(a=>a.username===username.value.trim()||a.email===username.value.trim());try{if(account)sessionStorage.setItem('local-test-login-user',account.username);else sessionStorage.removeItem('local-test-login-user');}catch{}});\nconst panel=document.createElement('section');panel.id='local-test-accounts';panel.setAttribute('aria-label','Lokala provkonton');panel.style.cssText='margin:20px 0;padding:16px;border:2px solid #6a9bd0;border-radius:8px;';\nconst title=document.createElement('h2');title.textContent='Välj provkonto';title.style.cssText='font-size:18px;margin:0 0 8px';panel.append(title);\nconst info=document.createElement('p');info.textContent='Endast lokal syntetisk provmiljö. Välj roll för att fylla i fälten och tryck sedan Logga in.';info.style.cssText='margin:0 0 12px';panel.append(info);\nconst buttons=document.createElement('div');buttons.style.cssText='display:flex;gap:8px;flex-wrap:wrap';\nconst status=document.createElement('p');status.setAttribute('role','status');\nfor(const account of accounts){const button=document.createElement('button');button.type='button';button.textContent=account.label;button.style.cssText='min-height:44px;padding:10px 14px;border:1px solid #6a9bd0;border-radius:6px;background:#eef5ff;color:#172b4d;cursor:pointer';button.addEventListener('click',()=>{username.value=account.username;password.value=account.password;for(const field of [username,password]){field.dispatchEvent(new Event('input',{bubbles:true}));field.dispatchEvent(new Event('change',{bubbles:true}));}status.textContent=account.label+' valt. Tryck Logga in.';document.getElementById('kc-login')?.focus();});buttons.append(button);}\npanel.append(buttons,status);form.before(panel);\n}\nif(document.readyState==='loading')document.addEventListener('DOMContentLoaded',install);else install();\n})();\n`;
  fs.writeFileSync(path.join(target,'resources/js/test-accounts-v2.js'),script,{mode:0o600});
  execFileSync('docker',['cp',path.join(dir,theme),`${m.idp.containerName}:/opt/keycloak/themes/`],{stdio:'pipe'});
  execFileSync('docker',['exec','--user','0',m.idp.containerName,'chmod','-R','a+rX',`/opt/keycloak/themes/${theme}`],{stdio:'pipe'});
  await api(`/admin/realms/${realm}`,'PUT',{loginTheme:theme});
  if((await api(`/admin/realms/${realm}`)).loginTheme!==theme)throw Error('Temainställning kunde inte verifieras');
  console.log('Lokala provknappar aktiverade för åtta provroller.');
 }
}catch(error){console.error('Provknappar kunde inte uppdateras:',error instanceof Error&&/^Local IdP HTTP \d+$/.test(error.message)?error.message:'LOCAL_HELPER_FAILED');process.exitCode=1;}
