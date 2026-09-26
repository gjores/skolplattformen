import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeKong, collectKong, validateCursor, parseArgs, normalizeStorage, collectStorage, correlateStorage,
  normalizePostgres, collectPostgres, correlateSql, windowContinuity, outageVerdict } from './collect-denials.mjs';
import { kongConfig, kongConfigCurrent, sourceFromInspect, postgresConfigured, postgresSettings } from './configure-audit-source.mjs';
const source = 'a'.repeat(64);
const row = { schema:'phase3-ingress-v1', requestId:'b'.repeat(32), time:'2026-09-24T10:00:00+00:00', status:401, route:'rest' };
const kongBase = 'server {\n    access_log logs/access.log;\n    location / {\n        proxy_set_header      X-Real-IP          $remote_addr;\n    }\n    location @unbuffered {\n        proxy_set_header      X-Real-IP          $remote_addr;\n    }\n}';
test('only source allowlist survives hostile fields', () => {
  const event = normalizeKong(JSON.stringify({...row, actor:'forged', req:{authorization:'secret'}, body:'pupil-name', routeId:'private-id'}),source);
  assert.equal(event.actor,null);
  assert.equal(event.outcome,'rejected');
  assert.doesNotMatch(JSON.stringify(event),/forged|secret|pupil-name|private-id/);
});
test('reject malformed or non-schema sources and arbitrary route values', () => {
  for (const patch of [{requestId:'client-id'},{time:'anything'},{status:'401'},{status:999},{route:'/rest/v1/private-id'}]) assert.equal(normalizeKong(JSON.stringify({...row,...patch}),source),null);
  assert.equal(normalizeKong('unstructured raw error',source),null);
  assert.equal(normalizeKong(JSON.stringify(row),'invalid-source'),null);
});
test('deduplicate source ids, never actor or same-second timestamps', () => {
  const raw = [row,row,{...row,requestId:'c'.repeat(32)}].map(JSON.stringify).join('\n');
  assert.equal(collectKong(raw,source).events.length,2);
  assert.equal(collectKong('{"schema":"phase3-ingress-v1"}',source).malformed,1);
});
test('unminimized combined access lines are counted as a gap and never kept', () => {
  const raw = '192.168.65.1 - - [26/Sep/2026:11:57:12 +0000] "GET /rest/v1/private-id?name=Elev HTTP/1.1" 401 91 "-" "node"\n2026/09/26 11:57:12 [notice] 1#0: exiting';
  const parsed = collectKong(raw,source);
  assert.equal(parsed.unminimized,1);
  assert.equal(parsed.events.length,0);
  assert.doesNotMatch(JSON.stringify(parsed),/private-id|Elev/);
});
test('successful ingress does not assert denied access', () => {
  assert.equal(normalizeKong(JSON.stringify({...row,status:200}),source).outcome,'received');
});
test('cursor: replacement, restart and rotation cannot pass continuity', () => {
  const run = {id:'a',startedAt:'t1',rotation:'disabled'};
  assert.equal(validateCursor(run,{...run,id:'b'}).reason,'source-replaced');
  assert.equal(validateCursor(run,{...run,startedAt:'t2'}).reason,'source-restarted');
  assert.equal(validateCursor(run,{...run,rotation:'possible'}).reason,'docker-log-rotation-possible');
  assert.equal(validateCursor(null,run).status,'BLOCKED');
  assert.equal(validateCursor(run,undefined).status,'BLOCKED');
  assert.equal(validateCursor(run,{...run}).status,'PASS');
  assert.equal(sourceFromInspect({Id:'x',State:{StartedAt:'t'},HostConfig:{LogConfig:{Config:{'max-size':'10m'}}}}).rotation,'possible');
  assert.equal(sourceFromInspect({Id:'x',State:{StartedAt:'t'},HostConfig:{LogConfig:{Config:{}}}}).rotation,'disabled');
});
test('window continuity reports every gap reason', () => {
  const pass = {status:'PASS'};
  assert.equal(windowContinuity('kong',pass,{malformed:0,unminimized:0},{before:true,after:true}).status,'PASS');
  const blocked = windowContinuity('kong',{status:'BLOCKED',reason:'source-restarted'},{malformed:1,unminimized:2},{before:true,after:false});
  assert.deepEqual(blocked.reasons,['source-restarted','source-configuration-inactive','malformed-source-lines','unminimized-access-lines']);
  assert.deepEqual(windowContinuity('postgres',pass,{unconfigured:1,statementLines:1,detailLines:1},{before:true,after:true}).reasons,['unconfigured-log-lines','statement-text-logged','detail-lines-logged']);
  assert.deepEqual(windowContinuity('storage',pass,{untraced:1},{before:true,after:true}).reasons,['untraced-upstream-requests']);
});
test('configuration emits no raw request/header/body, forces trace header and is idempotent', () => {
  const config=kongConfig(kongBase);
  const format=config.split('\n').find(x=>x.startsWith('log_format'));
  assert.doesNotMatch(format,/request_uri|http_|request_body|args/);
  assert.match(format,/\$request_id/);
  assert.equal((config.match(/proxy_set_header\s+X-Client-Trace-Id\s+\$request_id;/g)||[]).length,2);
  assert.equal(kongConfig(config),config);
  assert.equal(kongConfigCurrent(config),true);
  assert.equal(kongConfigCurrent(kongBase),false);
  assert.throws(()=>kongConfig('unrecognized configuration'));
  assert.throws(()=>kongConfig('server {\n access_log logs/access.log;\n}'));
});
test('upgrade legacy minimized Kong config with server correlation header once',()=>{
  const current=kongConfig(kongBase);
  const legacy=current.replace('\n    add_header X-Phase3-Audit-Id $request_id always;','').replace(/\n\s*proxy_set_header\s+X-Client-Trace-Id\s+\$request_id;/g,'');
  assert.equal(kongConfigCurrent(legacy),false);
  assert.equal(kongConfig(legacy),current);
  assert.equal((current.match(/add_header X-Phase3-Audit-Id/g)||[]).length,1);
});
test('unknown flags and output escape refused', () => {
  for(const args of [['--linked'],['--target','baseline'],['--out','/tmp/private.json'],['--probe','--probe'],['--outage','kong'],['--probe','--outage','kong,other'],['--probe','--outage','kong,kong']]) assert.throws(()=>parseArgs(args));
  assert.equal(parseArgs(['--probe']).probe,true);
  assert.deepEqual(parseArgs(['--probe','--outage','storage,kong,db']).outageSources,['storage','kong','db']);
});
test('correlation requires unique server id, not route/status coincidence', async () => {
  const { correlateKong } = await import('./collect-denials.mjs');
  const event=normalizeKong(JSON.stringify(row),source);
  const request={route:'rest',status:401,requestId:row.requestId};
  assert.equal(correlateKong([request],[event],source)[0].sourceObserved,true);
  assert.equal(correlateKong([{...request,requestId:'c'.repeat(32)}],[event],source)[0].sourceObserved,false);
  assert.equal(correlateKong([{...request,requestId:'untrusted-client-marker'}],[event],source)[0].sourceObserved,false);
  assert.deepEqual(correlateKong([request,request],[event],source).map(x=>x.sourceObserved),[true,false]);
  assert.equal(correlateKong([request],[event,event],source)[0].sourceObserved,false);
});
const storageRow = { level:40, time:'2026-09-26T12:03:06.217Z', type:'request', reqId:'req-2g0', role:'anon', operation:'storage.bucket.create',
  req:{ method:'POST', url:'/bucket?name=Elev', headers:{ x_client_trace_id:'d'.repeat(32), user_agent:'node' } },
  res:{ statusCode:400 }, error:{ message:'new row violates row-level security policy', raw:'SELECT secret' }, msg:'stub | POST | 400 | /bucket' };
test('storage keeps only gateway trace, status, verified role and fixed operation', () => {
  const event = normalizeStorage(JSON.stringify(storageRow), source);
  assert.equal(event.gatewayRequestId,'d'.repeat(32));
  assert.equal(event.observedRole,'anon');
  assert.equal(event.outcome,'rejected');
  assert.doesNotMatch(JSON.stringify(event),/Elev|secret|row-level|bucket\?/);
  assert.equal(normalizeStorage(JSON.stringify({...storageRow,role:'forged-admin'}),source).observedRole,null);
  assert.equal(normalizeStorage(JSON.stringify({...storageRow,operation:'DROP TABLE'}),source).operation,null);
  const untraced = {...storageRow,req:{...storageRow.req,headers:{x_client_trace_id:'client-chosen'}}};
  assert.equal(normalizeStorage(JSON.stringify(untraced),source),null);
  const parsed = collectStorage([storageRow,untraced,{type:'info',msg:'started'}].map(JSON.stringify).join('\n')+'\nnot json',source);
  assert.equal(parsed.events.length,1); assert.equal(parsed.untraced,1);
});
test('storage correlation requires the Kong id, same status and exactly one upstream event', () => {
  const event = normalizeStorage(JSON.stringify(storageRow), source);
  const req = {route:'storage',status:400,requestId:'d'.repeat(32)};
  assert.equal(correlateStorage([req],[event],source)[0].sourceObserved,true);
  assert.equal(correlateStorage([{...req,status:404}],[event],source)[0].sourceObserved,false);
  assert.equal(correlateStorage([{...req,requestId:'e'.repeat(32)}],[event],source)[0].sourceObserved,false);
  assert.equal(correlateStorage([{...req,requestId:null}],[event],source)[0].sourceObserved,false);
});
const pg = (state, user='authenticator', line=3, severity='ERROR') => `phase3pg|2026-09-26 12:03:06.207 UTC|24015|6ab7b47a.5dcf|${line}|${user}|${state}|${severity}:  permission denied for table phase3_probe_pupils Elev`;
test('postgres keeps session, SQLSTATE and verified login role only', () => {
  const event = normalizePostgres(pg('42501'), source);
  assert.deepEqual([event.sqlstate,event.pid,event.sessionId,event.observedRole,event.time],['42501',24015,'6ab7b47a.5dcf','authenticator','2026-09-26T12:03:06.207Z']);
  assert.doesNotMatch(JSON.stringify(event),/phase3_probe_pupils|Elev|permission/);
  assert.equal(normalizePostgres(pg('28P01','claimed_user'),source).observedRole,null);
  assert.equal(normalizePostgres(pg('00000','x',1,'LOG'),source),null);
  assert.equal(normalizePostgres('2026-09-26 12:03:06.207 UTC [1] ERROR: x',source),null);
});
test('postgres gaps: default prefix, statement and detail lines are counted', () => {
  const raw = [pg('42501'), pg('42501'), '172.18.0.6 2026-09-26 11:57:12.172 UTC [23645] authenticator@postgres ERROR:  permission denied',
    '172.18.0.6 2026-09-26 11:57:12.172 UTC [23645] authenticator@postgres STATEMENT:  select secret', 'phase3pg|2026-09-26 12:03:06.207 UTC|1|a.b|4|u|42501|DETAIL:  Failing row contains (Elev)'].join('\n');
  const parsed = collectPostgres(raw, source);
  assert.equal(parsed.events.length,1);
  assert.equal(parsed.unconfigured,2); assert.equal(parsed.statementLines,1); assert.equal(parsed.detailLines,1);
});
test('sql correlation needs server session, pid, sqlstate and one event per attempt', () => {
  const events = [1,2,3].map(n => normalizePostgres(pg('42501','authenticator',n), source));
  const probe = {sessionId:'6ab7b47a.5dcf',pid:24015,expectedSqlstate:'42501',attempts:3,clientDenied:3};
  assert.equal(correlateSql(probe,events).sourceObserved,true);
  assert.equal(correlateSql({...probe,attempts:4,clientDenied:4},events).sourceObserved,false);
  assert.equal(correlateSql({...probe,clientDenied:2},events).sourceObserved,false);
  assert.equal(correlateSql({...probe,sessionId:'other.1'},events).sourceObserved,false);
  assert.equal(correlateSql({...probe,pid:1},events).sourceObserved,false);
});
test('postgres settings must match exactly and have no overrides', () => {
  assert.equal(postgresConfigured({settings:{...postgresSettings},overrides:0}),true);
  assert.equal(postgresConfigured({settings:{...postgresSettings},overrides:1}),false);
  assert.equal(postgresConfigured({settings:{...postgresSettings,log_min_error_statement:'error'},overrides:0}),false);
  assert.doesNotMatch(postgresSettings.log_line_prefix,/%h|%r|%a|%q/);
});
test('outage verdict: silent gap, lost event or served data can never pass', () => {
  const ok = {preOutageObserved:true,collectorBlockedDuringOutage:true,dataServedDuringOutage:false,restartDetected:true,configLostAfterRestart:true,gapReported:true,configActiveAfterRecovery:true,preOutageEventRetained:true,postRecoveryObserved:true};
  assert.equal(outageVerdict(ok).status,'PASS');
  assert.ok(outageVerdict({...ok,outageAttemptLogged:false}).reasons.includes('outage-attempt-not-logged-by-gateway'));
  assert.equal(outageVerdict({...ok,outageAttemptLogged:true}).status,'PASS');
  for (const [k,v,reason] of [['gapReported',false,'silent-configuration-gap'],['preOutageEventRetained',false,'pre-outage-event-lost'],['dataServedDuringOutage',true,'path-served-during-outage'],['collectorBlockedDuringOutage',false,'outage-not-detected'],['restartDetected',false,'restart-not-detected'],['postRecoveryObserved',false,'post-recovery-event-not-observed']]) {
    const verdict = outageVerdict({...ok,[k]:v});
    assert.equal(verdict.status,'BLOCKED'); assert.ok(verdict.reasons.includes(reason));
  }
});
test('source failure replaces previous observation and omits raw exception', async () => {
  const fs=await import('node:fs');const os=await import('node:os');const path=await import('node:path');
  const {runCollection}=await import('./collect-denials.mjs');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'phase3-audit-test-'));
  try {
    const out=path.join(dir,'report.json');
    fs.writeFileSync(out,JSON.stringify({status:'PASS',events:[row]}));
    const report=await runCollection({out},async()=>{throw new Error('secret-credential');});
    assert.equal(report.status,'BLOCKED');
    assert.deepEqual(JSON.parse(fs.readFileSync(out,'utf8')).events,[]);
    assert.doesNotMatch(fs.readFileSync(out,'utf8'),/secret-credential|PASS/);
  } finally {fs.rmSync(dir,{recursive:true,force:true});}
});
