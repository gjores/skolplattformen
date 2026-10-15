// Own ephemeral GoTrue + Worker, bound to a schema-only fixture database.
// Never changes or restarts the active application's containers or processes.
import assert from 'node:assert/strict';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {execFileSync,spawn} from 'node:child_process';
import {readFileSync,writeFileSync,openSync,closeSync,existsSync,unlinkSync,statSync} from 'node:fs';
import {createServer,request as httpRequest} from 'node:http';
import {createServer as netServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {assertTarget} from './verify-target.mjs';
import {artifactManifest} from './verify-programplan-copy-api.mjs';
import {classCohortProcessProof} from './phase5-class-cohort-oidc-fixtures.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const hash=s=>createHash('sha256').update(s).digest('hex');
const docker=args=>execFileSync('docker',args,{encoding:'utf8',stdio:['ignore','pipe','pipe']}).trim();
async function available(port){const s=netServer();await new Promise((resolve,reject)=>{s.once('error',reject);s.listen(port,'127.0.0.1',resolve);});await new Promise(resolve=>s.close(resolve));}
async function ready(url,child){for(let n=0;n<120;n++){if(child&&child.exitCode!==null)throw Error('Owned runtime exited before readiness');try{const r=await fetch(url,{signal:AbortSignal.timeout(1000)});if(r.ok)return await r.json();}catch{}await new Promise(resolve=>setTimeout(resolve,250));}throw Error('Owned runtime readiness timed out');}
export async function createNamedTimplanRuntime({snapshot,buildRoot,evidenceDir}){
 assert.ok(path.resolve(evidenceDir).startsWith('/private/tmp/')&&(statSync(evidenceDir).mode&0o077)===0);
 assert.ok(path.resolve(buildRoot).startsWith(path.join(root,'work/pilot/targets/protected/runtime/')));
 const mark=JSON.parse(readFileSync(path.join(buildRoot,'build-mode.json'),'utf8'));assert.equal(mark.mode,'protected');
 const target=await assertTarget('protected',{requireIdp:true});
 const runId=randomUUID(),name='named-timplan-auth-'+runId,baseURL='http://127.0.0.1:3014',apiURL='http://127.0.0.1:56331';
 const envPath=path.join(evidenceDir,'auth.env'),varsPath=path.join(buildRoot,'server/.dev.vars'),journalPath=path.join(evidenceDir,'runtime.json');
 assert.equal(existsSync(varsPath),false,'Candidate must not inherit live private vars');
 const journal={runId,name,baseURL,apiURL,buildRoot,database:snapshot.provenance.database,status:'initializing',cleanup:'pending',artifact:artifactManifest(buildRoot)};
 const save=()=>writeFileSync(journalPath,JSON.stringify(journal,null,2)+'\n',{mode:0o600});save();
 let container=false,proxy,worker,logfd,closed=false;
 const cleanup=async()=>{
  if(closed)return journal;
  if(worker&&worker.exitCode===null){worker.kill('SIGTERM');await Promise.race([new Promise(resolve=>worker.once('exit',resolve)),new Promise((_,reject)=>setTimeout(()=>reject(Error('Owned Worker did not stop')),10000))]);}
  if(proxy){proxy.closeAllConnections();await new Promise(resolve=>proxy.close(resolve));}
  if(container){const inspected=JSON.parse(docker(['inspect',name]))[0];assert.equal(inspected.Config.Labels['skolplattform.named-run'],runId);docker(['rm','-f',name]);}
  if(logfd!==undefined)closeSync(logfd);
  for(const p of [envPath,varsPath])if(existsSync(p))unlinkSync(p);
  closed=true;journal.cleanup='complete';journal.stoppedAt=new Date().toISOString();save();return journal;
 };
 try{
  await available(3014);await available(56331);await available(56332);
  const source=JSON.parse(docker(['inspect','supabase_auth_skolplattform-pilot-protected']))[0];
  assert.equal(source.Config.Image,'public.ecr.aws/supabase/gotrue:v2.187.0');
  const env=Object.fromEntries(source.Config.Env.map(s=>[s.slice(0,s.indexOf('=')),s.slice(s.indexOf('=')+1)]));
  const migrationsPath=env.GOTRUE_DB_MIGRATIONS_PATH;assert.equal(migrationsPath,'/usr/local/etc/auth/migrations');
  // Version metadata is derived from the installed image's public SQL filenames,
  // not copied from any source database table.
  const files=docker(['exec','supabase_auth_skolplattform-pilot-protected','ls',migrationsPath]).split('\n');
  const versions=files.map(f=>f.match(/^(\d+)_.+\.up\.sql$/u)?.[1]);assert.ok(versions.length>50&&versions.every(Boolean));
  assert.equal((await snapshot.db`select count(*)::int n from auth.schema_migrations`)[0].n,0);
  for(const version of versions)await snapshot.db`insert into auth.schema_migrations(version) values(${version})`;
  journal.authImage=source.Image;journal.authMigrationVersions=versions;save();
  await snapshot.withPrivateTarget(async local=>{
   assert.equal(local.database,snapshot.provenance.database);
   const dbUrl=new URL(local.dbUrl),inside=new URL(env.GOTRUE_DB_DATABASE_URL);
   assert.equal(inside.hostname,'supabase_db_skolplattform-pilot-protected');
   dbUrl.hostname=inside.hostname;dbUrl.port='5432';dbUrl.searchParams.set('search_path','auth');
   env.GOTRUE_DB_DATABASE_URL=dbUrl.toString();env.GOTRUE_API_HOST='0.0.0.0';env.GOTRUE_API_PORT='9999';
   env.API_EXTERNAL_URL=apiURL;env.GOTRUE_SITE_URL=baseURL;env.GOTRUE_URI_ALLOW_LIST=baseURL+'/**';env.GOTRUE_JWT_ISSUER=apiURL+'/auth/v1';
   const config=Object.entries(env).filter(([key])=>key.startsWith('GOTRUE_')||key==='API_EXTERNAL_URL').map(([k,v])=>{assert.ok(!/[\r\n]/u.test(v));return k+'='+v;}).join('\n')+'\n';
   writeFileSync(envPath,config,{mode:0o600,flag:'wx'});
   const vars={APP_MODE:'protected',OIDC_ISSUER:target.idp.issuer,OIDC_CLIENT_ID:target.idp.clientId,OIDC_CLIENT_SECRET:target.idp.clientSecret,OIDC_REDIRECT_URI:baseURL+'/api/auth/callback',OIDC_POST_LOGOUT_REDIRECT_URI:baseURL+'/',SUPABASE_URL:apiURL,SUPABASE_ANON_KEY:target.anonKey,DATABASE_URL:local.workerDbUrl,SESSION_SECRET:randomBytes(48).toString('base64url'),MFA_ACR_VALUES:target.mfa.acrValues,MFA_MAX_AGE_SECONDS:target.mfa.maxAgeSeconds,SESSION_IDLE_SECONDS:900,SESSION_ABSOLUTE_SECONDS:28800};
   writeFileSync(varsPath,Object.entries(vars).map(([k,v])=>k+'='+v).join('\n')+'\n',{mode:0o600,flag:'wx'});journal.privateVarsSha256=hash(readFileSync(varsPath));
  });
  docker(['run','-d','--name',name,'--label','skolplattform.named-run='+runId,'--network','supabase_network_skolplattform-pilot-protected','--publish','127.0.0.1:56332:9999','--env-file',envPath,source.Image]);container=true;save();
  await ready('http://127.0.0.1:56332/health');
  proxy=createServer((req,res)=>{
   if(req.method!=='POST'||req.url!=='/auth/v1/token?grant_type=id_token'){res.writeHead(404);res.end();return;}
   const upstream=httpRequest({hostname:'127.0.0.1',port:56332,path:'/token?grant_type=id_token',method:'POST',headers:{...req.headers,host:'127.0.0.1:56332'}},r=>{res.writeHead(r.statusCode,r.headers);r.pipe(res);});
   upstream.on('error',()=>{res.writeHead(502);res.end();});req.pipe(upstream);
  });await new Promise((resolve,reject)=>{proxy.once('error',reject);proxy.listen(56331,'127.0.0.1',resolve);});
  logfd=openSync(path.join(evidenceDir,'worker.log'),'wx',0o600);
  worker=spawn(process.execPath,['scripts/preview-worker.mjs',path.join(buildRoot,'server/wrangler.json'),'3014'],{cwd:path.join(root,'web'),stdio:['ignore',logfd,logfd],env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  const health=await ready(baseURL+'/api/health/db',worker);assert.equal(health.role,'skolplattform_worker');assert.equal(health.runtime,'workerd');
  journal.process=classCohortProcessProof(baseURL,buildRoot);journal.status='ready';save();
  return{baseURL,buildRoot,proof:journal,cleanup};
 }catch(error){journal.status='FAIL';journal.failureCode=error.code??'setup';save();try{await cleanup();}catch(e){journal.cleanup='failed';journal.cleanupCode=e.code??'cleanup';save();}throw error;}
}
