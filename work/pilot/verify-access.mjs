#!/usr/bin/env node
// Körbara säkerhetsprov för fas 2 mot den byggda, lokala protected-Workern.
// Sessionerna mintas direkt i det disponibla målet för att pröva spärr och
// uppdragsändringar med redan utfärdade sessionsbevis. Keycloak behövs därför
// inte under just dessa API-prov; den verkliga OIDC-kedjan provas i 02-04/11.

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const startedAt = new Date();
const checkedAt = startedAt.toISOString();
// BLOCKED-vägar avslutas som process.exit(3) via exitCode i den gemensamma finally-grenen.
const ALL_CASES = [
  'sparr', 'uppdrag-avslut', 'uppdrag-utgatt', 'session', 'csrf', 'mfa-kravs',
  'inbjudan', 'frammande-id', 'samma-epost', 'aktor-forfalskning', 'logg',
  'logg-flod', 'context-race', 'audit-rollback', 'phase3-mandates', 'phase3-pupils',
];

const ID = {
  anna: '30000000-0000-4000-8000-000000000001',
  bertil: '30000000-0000-4000-8000-000000000002',
  ceciliaA: '30000000-0000-4000-8000-000000000003',
  ceciliaB: '30000000-0000-4000-8000-000000000004',
  david: '30000000-0000-4000-8000-000000000005',
  erik: '30000000-0000-4000-8000-000000000006',
  frida: '30000000-0000-4000-8000-000000000007',
  gustav: '30000000-0000-4000-8000-000000000008',
  hanna: '30000000-0000-4000-8000-000000000009',
  ivar: '30000000-0000-4000-8000-000000000010',
  memberA: '40000000-0000-4000-8000-000000000001',
  memberBertil: '40000000-0000-4000-8000-000000000002',
  memberCeciliaA: '40000000-0000-4000-8000-000000000003',
  memberCeciliaB: '40000000-0000-4000-8000-000000000004',
  memberDavid: '40000000-0000-4000-8000-000000000005',
  memberFrida: '40000000-0000-4000-8000-000000000007',
  memberGustav: '40000000-0000-4000-8000-000000000008',
  memberHannaA: '40000000-0000-4000-8000-000000000009',
  memberHannaB: '40000000-0000-4000-8000-00000000000a',
  memberIvar: '40000000-0000-4000-8000-000000000010',
  assignmentAnna: '50000000-0000-4000-8000-000000000001',
  assignmentBertil: '50000000-0000-4000-8000-000000000002',
  assignmentCeciliaA: '50000000-0000-4000-8000-000000000003',
  assignmentCeciliaB: '50000000-0000-4000-8000-000000000004',
  assignmentDavid: '50000000-0000-4000-8000-000000000005',
  assignmentFrida: '50000000-0000-4000-8000-000000000007',
  assignmentFuture: '50000000-0000-4000-8000-000000000017',
  assignmentExpired: '50000000-0000-4000-8000-000000000027',
  assignmentGustav: '50000000-0000-4000-8000-000000000008',
  assignmentHannaA: '50000000-0000-4000-8000-000000000009',
  assignmentHannaB: '50000000-0000-4000-8000-00000000000a',
  assignmentIvar: '50000000-0000-4000-8000-000000000010',
  customerA: '20000000-0000-4000-8000-0000000000a1',
  customerB: '20000000-0000-4000-8000-0000000000a2',
  organizerA: '60000000-0000-4000-8000-000000000001',
  unitA: '60000000-0000-4000-8000-000000000101',
  demoOrganizer: '00000000-0000-4000-8000-000000000001',
  demoUnit: '10000000-0000-4000-8000-000000000101',
};

function parseArgs(argv) {
  const options = { cases: [], port: 3013, baseUrl: null, out: path.join(root, 'work/pilot/results/access.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} saknar värde`);
      return next;
    };
    if (arg === '--case') options.cases.push(value());
    else if (arg.startsWith('--case=')) options.cases.push(arg.slice(7));
    else if (arg === '--base-url') options.baseUrl = value();
    else if (arg.startsWith('--base-url=')) options.baseUrl = arg.slice(11);
    else if (arg === '--port') options.port = Number(value());
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice(7));
    else if (arg === '--out') options.out = path.resolve(process.cwd(), value());
    else if (arg.startsWith('--out=')) options.out = path.resolve(process.cwd(), arg.slice(6));
    else throw new Error(`okänt argument ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1 || options.port > 65535) throw new Error('ogiltig port');
  for (const name of options.cases) if (!ALL_CASES.includes(name)) throw new Error(`okänt fall ${name}`);
  options.cases = options.cases.length ? [...new Set(options.cases)] : ALL_CASES;
  return options;
}

const options = parseArgs(process.argv.slice(2));
let manifest;
try {
  manifest = await assertTarget('protected');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
}

const proof = {
  issuer: manifest.idp?.issuer,
  clientId: manifest.idp?.clientId,
  audience: [manifest.idp?.clientId],
  profileId: 'local-keycloak-admin',
  profileVersion: 1,
  acr: '2',
  amr: ['pwd', 'otp'],
};
const results = [];
const restore = [];
const sessions = new Set();
let server = null;
let serverErrors = '';
let baseUrl = options.baseUrl;
let pgpassPath = null;

function revision() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return 'okänd';
  }
}

function makePgpass() {
  if (pgpassPath) return pgpassPath;
  const url = new URL(manifest.dbUrl);
  pgpassPath = path.join(os.tmpdir(), `.skolplattform-access-pgpass-${process.pid}`);
  const escaped = decodeURIComponent(url.password).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
  fs.writeFileSync(pgpassPath, `${url.hostname}:${url.port}:${url.pathname.slice(1)}:${decodeURIComponent(url.username)}:${escaped}\n`, { mode: 0o600, flag: 'wx' });
  return pgpassPath;
}

function psql(sql, vars = {}) {
  const url = new URL(manifest.dbUrl);
  const args = ['-h', url.hostname, '-p', url.port, '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1), '-Atq', '-v', 'ON_ERROR_STOP=1'];
  for (const [key, value] of Object.entries(vars)) args.push('-v', `${key}=${value ?? ''}`);
  args.push('-f', '-');
  return execFileSync('psql', args, {
    cwd: root,
    env: { ...process.env, PGPASSFILE: makePgpass() },
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
}

function bool(value) { return value === 't'; }
function equalShape(a, b) {
  return a?.status === b?.status && a?.body?.code === b?.body?.code && JSON.stringify(Object.keys(a?.body ?? {}).sort()) === JSON.stringify(Object.keys(b?.body ?? {}).sort());
}

async function mint({ identityId, membershipId = null, assignmentId = null, acr = proof.acr, amr = proof.amr, authTimeOffsetSec = 0, expiresInSec = 900, overrides = {} }) {
  const token = crypto.randomBytes(32).toString('base64url');
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  const row = psql(`insert into public.app_sessions
    (token_hash, identity_id, membership_id, assignment_id, acr, amr, auth_time,
     proof_issuer, proof_client_id, proof_audience, proof_profile_id,
     proof_profile_version, proof_checked_at, expires_at, absolute_expires_at)
    values (decode(:'hash','hex'), :'identity'::uuid, nullif(:'membership','')::uuid,
      nullif(:'assignment','')::uuid, nullif(:'acr',''), string_to_array(:'amr', ','),
      case when :'auth_null'='1' then null else now() - make_interval(secs => :'offset'::int) end,
      nullif(:'issuer',''), nullif(:'client',''), string_to_array(:'audience', ','),
      nullif(:'profile',''), nullif(:'version','')::int,
      case when :'checked_future'='1' then now() + interval '5 minutes' else now() end,
      now() + make_interval(secs => :'expires'::int), now() + interval '8 hours')
    returning id::text, context_epoch::text;`, {
    hash, identity: identityId, membership: membershipId, assignment: assignmentId,
    acr, amr: amr.join(','), offset: authTimeOffsetSec, expires: expiresInSec,
    issuer: overrides.issuer ?? proof.issuer, client: overrides.clientId ?? proof.clientId,
    audience: (overrides.audience ?? proof.audience).join(','),
    profile: overrides.profileId ?? proof.profileId,
    version: overrides.profileVersion === null ? '' : (overrides.profileVersion ?? proof.profileVersion),
    auth_null: overrides.authTimeNull ? '1' : '0', checked_future: overrides.checkedFuture ? '1' : '0',
  });
  const [sessionId, epochRaw] = row.split('|');
  sessions.add(sessionId);
  return { token, sessionId, epoch: Number(epochRaw) };
}

async function call(session, method, route, body, headers = {}) {
  const token = typeof session === 'string' ? session : session.token;
  const requestHeaders = new Headers(headers);
  requestHeaders.set('Cookie', `sp_session=${token}`);
  if (!requestHeaders.has('Sec-Fetch-Site')) requestHeaders.set('Sec-Fetch-Site', 'same-origin');
  if (typeof session !== 'string' && Number.isInteger(session.epoch) && !requestHeaders.has('X-Context-Epoch')) {
    requestHeaders.set('X-Context-Epoch', String(session.epoch));
  }
  if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
  const before = performance.now();
  const init = { method, headers: requestHeaders };
  if (body !== undefined) init.body = JSON.stringify(body);
  const response = await fetch(`${baseUrl}${route}`, init);
  const text = await response.text();
  let parsed = text;
  try { parsed = text ? JSON.parse(text) : null; } catch { /* CSV/text */ }
  const epochHeader = response.headers.get('X-Context-Epoch');
  const epoch = epochHeader === null ? null : Number(epochHeader);
  if (typeof session !== 'string' && Number.isInteger(epoch)) session.epoch = epoch;
  return { status: response.status, body: parsed, headers: Object.fromEntries(response.headers), elapsedMs: performance.now() - before };
}

function check(list, name, ok, detail) {
  list.push({ check: name, ok: Boolean(ok), detail: String(detail).slice(0, 300) });
}

async function runCase(name, fn) {
  const checks = [];
  try {
    await fn(checks);
  } catch (error) {
    check(checks, 'fall kunde köras', false, error instanceof Error ? error.message : String(error));
  }
  const status = checks.length >= 2 && checks.every((item) => item.ok) ? 'PASS' : 'FAIL';
  results.push({ name, status, checks });
  console.log(`${status === 'PASS' ? 'ok ' : 'FEL'} ${name} (${checks.filter((item) => item.ok).length}/${checks.length})`);
}

async function health(url) {
  try {
    const response = await fetch(`${url}/api/health/db`);
    const body = await response.json();
    return response.ok && body?.role === 'skolplattform_worker';
  } catch { return false; }
}

async function startServer() {
  if (baseUrl) {
    const url = new URL(baseUrl);
    if (!['127.0.0.1', 'localhost'].includes(url.hostname) || !['http:', 'https:'].includes(url.protocol)) {
      throw new Error('REFUSED: --base-url måste vara loopback');
    }
    baseUrl = url.origin;
    if (!await health(baseUrl)) throw new Error('BLOCKED: angiven server är inte en protected-Worker');
    return;
  }
  const markPath = path.join(web, 'dist-protected/build-mode.json');
  let mark;
  try { mark = JSON.parse(fs.readFileSync(markPath, 'utf8')); } catch { /* handled below */ }
  if (mark?.mode !== 'protected') throw new Error('BLOCKED: kör npm run build:protected');
  baseUrl = `http://127.0.0.1:${options.port}`;
  server = spawn(process.execPath, ['scripts/run-mode.mjs', 'preview', '--mode', 'protected', '--port', String(options.port)], {
    cwd: web, env: process.env, stdio: ['ignore', 'pipe', 'pipe'],
  });
  server.stdout.on('data', () => {});
  server.stderr.on('data', (chunk) => { serverErrors = `${serverErrors}${chunk}`.slice(-4000); });
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (await health(baseUrl)) return;
    if (server.exitCode !== null) break;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`BLOCKED: protected-Workern startade inte${serverErrors ? ` (${serverErrors.slice(-300)})` : ''}`);
}

function adminMint(overrides = {}) {
  return mint({ identityId: ID.anna, membershipId: ID.memberA, assignmentId: ID.assignmentAnna, ...overrides });
}

function invitationToken(args) {
  return execFileSync(process.execPath, ['work/pilot/invite.mjs', '--target', 'protected', ...args, '--print-only-token'], {
    cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function customerIdForInvitation(token) {
  const hash = crypto.createHash('sha256').update(token).digest('hex');
  return psql("select customer_id::text from public.invitations where token_hash=decode(:'hash','hex')", { hash });
}

async function ensureActiveGustav() {
  psql(`update public.memberships set status='active', blocked_at=null, blocked_by=null, block_reason=null where id=:'id'::uuid;
    update public.access_assignments set ended_at=null, ended_by=null where id=:'assignment'::uuid;`, { id: ID.memberGustav, assignment: ID.assignmentGustav });
}

const cases = {
  // 03-05: syntetiskt elevprov. Visar att varje läsform (lista, elev-ID, ärende,
  // export) lämnar data först efter committad säkerhetshändelse med samma
  // korrelation, och att loggfel stoppar läsningen utan innehåll.
  async 'phase3-pupils'(checks) {
    psql(fs.readFileSync(path.join(root,'work/pilot/sql/phase3-fixtures.sql'),'utf8'));
    const customer='33000000-0000-4000-8000-000000000001';
    const unit='33000000-0000-4000-8000-000000000111';
    const group='33000000-0000-4000-8000-000000000311';
    const pupil='33000000-0000-4000-8000-000000000211', otherPupil='33000000-0000-4000-8000-000000000212', foreignPupil='33000000-0000-4000-8000-000000000221';
    const ownCase='33000000-0000-4000-8000-000000000411', otherCase='33000000-0000-4000-8000-000000000412';
    const FIELDS=JSON.stringify(['displayName','groupIds','id','unitId']);
    const corr=(response)=>response.headers['x-correlation-id'];
    const events=(response)=>psql("select action||'|'||outcome||'|'||coalesce(details->>'count','')||'|'||coalesce(details->>'readForm','')||'|'||coalesce(details->>'code','') from public.security_events where correlation_id=:'corr'::uuid order by id",{corr:corr(response)});
    const leaks=(...responses)=>responses.map((response)=>JSON.stringify(response.body)).join(' ');
    const createPerson=(name)=>{
      const identity=crypto.randomUUID(),membership=crypto.randomUUID();
      psql("insert into public.identities(id,issuer,subject,display_name) values(:'identity'::uuid,'https://phase3.example.test',:'identity',:'name'); insert into public.memberships(id,identity_id,customer_id) values(:'member'::uuid,:'identity'::uuid,:'customer'::uuid)",{identity,member:membership,customer,name});
      return {identity,membership};
    };
    const hm=await mint({identityId:'33000000-0000-4000-8000-000000000021',membershipId:'33000000-0000-4000-8000-000000000031',assignmentId:'33000000-0000-4000-8000-000000000041'});
    const today=psql('select public.app_today()::text');
    const base={unitIds:[unit],scopeKind:'school',validFrom:today};
    const principal=createPerson('Syntetisk rektor');
    const appointed=await call(hm,'POST','/api/kund/rektor',{...base,membershipId:principal.membership,function:'rektor'});
    check(checks,'huvudman utser rektor för provet',appointed.status===201,`HTTP ${appointed.status}/${appointed.body?.code}`);
    if(appointed.status!==201)return;
    const rector=await mint({identityId:principal.identity,membershipId:principal.membership,assignmentId:appointed.body.assignmentId});

    const options=await call(rector,'GET','/api/kund/mandat/urval');
    const optionText=JSON.stringify(options.body);
    check(checks,'tilldelningsurvalet är begränsat till rektorns skola',options.status===200&&JSON.stringify(options.body?.pupils?.map((p)=>p.id))===JSON.stringify([pupil])&&JSON.stringify(options.body?.schools?.map((s)=>s.id))===JSON.stringify([unit])&&!optionText.includes(otherPupil)&&!optionText.includes(foreignPupil)&&!options.body?.recipients?.some((r)=>r.membershipId===principal.membership),`HTTP ${options.status}`);
    check(checks,'tilldelningsurvalet är auditerat',events(options)==='mandate_options_read|ok|1||',events(options));
    const hmOptions=await call(hm,'GET','/api/kund/mandat/urval');
    check(checks,'huvudman får inget elevurval',hmOptions.status===200&&JSON.stringify(hmOptions.body?.functions)==='["rektor"]'&&hmOptions.body?.pupils?.length===0,`HTTP ${hmOptions.status}`);

    const grant=async(name,body)=>{
      const person=createPerson(name);
      const granted=await call(rector,'POST','/api/kund/mandat',{...base,membershipId:person.membership,...body});
      if(granted.status!==201)throw new Error(`${name}: HTTP ${granted.status}/${granted.body?.code}`);
      return {...person,assignmentId:granted.body.assignmentId,session:await mint({identityId:person.identity,membershipId:person.membership,assignmentId:granted.body.assignmentId})};
    };
    const teacher=await grant('Syntetisk lärare',{function:'larare',scopeKind:'group',groups:[{id:group,kind:'teaching'}]});
    const admin=await grant('Syntetisk skoladministratör',{function:'administrator'});
    const health=await grant('Syntetisk elevhälsa',{function:'elevhalsa',scopeKind:'case',caseIds:[ownCase]});
    const support=await grant('Syntetisk support',{function:'support',scopeKind:'pupil',pupilIds:[pupil],purposeCode:'synthetic-troubleshooting',startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+1200000).toISOString()});
    check(checks,'rektor tilldelar lärare, skoladministratör, elevhälsa och support via API',true,'4 × 201');

    const list=await call(teacher.session,'GET','/api/prov/elev');
    check(checks,'lärarens lista gäller endast egen grupp',list.status===200&&JSON.stringify(list.body?.pupils?.map((p)=>p.id))===JSON.stringify([pupil]),`HTTP ${list.status}/${list.body?.code}`);
    check(checks,'endast explicit fältlista lämnas',list.body?.pupils?.every((p)=>JSON.stringify(Object.keys(p).sort())===FIELDS)&&JSON.stringify(list.body?.pupils?.[0]?.groupIds)===JSON.stringify([group]),JSON.stringify(Object.keys(list.body?.pupils?.[0]??{})));
    check(checks,'läsning är no-store',list.headers['cache-control']==='no-store',list.headers['cache-control']);
    check(checks,'listläsning har committad händelse med samma korrelation',events(list)==='pupil_probe_listed|ok|1|list|',events(list));
    const byId=await call(teacher.session,'GET',`/api/prov/elev?elev=${pupil}`);
    check(checks,'direkt ID-läsning inom scope loggas',byId.status===200&&events(byId)==='pupil_probe_read|ok|1|pupil|',`HTTP ${byId.status}; ${events(byId)}`);
    const other=await call(teacher.session,'GET',`/api/prov/elev?elev=${otherPupil}`);
    const foreign=await call(teacher.session,'GET',`/api/prov/elev?elev=${foreignPupil}`);
    const unknown=await call(teacher.session,'GET',`/api/prov/elev?elev=${crypto.randomUUID()}`);
    check(checks,'annan skolas, annan kunds och okänd elev ger samma nekande',other.status===404&&equalShape(other,foreign)&&equalShape(other,unknown)&&!leaks(other,foreign,unknown).includes('Syntetisk elev'),`HTTP ${other.status}/${foreign.status}/${unknown.status}`);
    check(checks,'nekad ID-läsning loggas som nekande',events(other)==='pupil_probe_read|denied|||not_found'&&events(unknown)==='pupil_probe_read|denied|||not_found',`${events(other)} / ${events(unknown)}`);
    const bad=await call(teacher.session,'GET',`/api/prov/elev?elev=${pupil}&falt=namn`);
    check(checks,'okända frågeparametrar nekas',bad.status===400,`HTTP ${bad.status}`);

    const healthList=await call(health.session,'GET','/api/prov/elev');
    const caseRead=await call(health.session,'GET',`/api/prov/elev?arende=${ownCase}`);
    const otherCaseRead=await call(health.session,'GET',`/api/prov/elev?arende=${otherCase}`);
    const mismatch=await call(health.session,'GET',`/api/prov/elev?arende=${ownCase}&elev=${otherPupil}`);
    check(checks,'ärendescope kräver exakt ärende',healthList.status===200&&healthList.body?.pupils?.length===0&&JSON.stringify(healthList.body?.scope?.cases?.map((c)=>c.id))===JSON.stringify([ownCase]),`lista ${healthList.status}`);
    check(checks,'exakt ärende ger ärendets elev och loggas',caseRead.status===200&&caseRead.body?.pupils?.[0]?.id===pupil&&events(caseRead)==='pupil_probe_case_read|ok|1|case|',`HTTP ${caseRead.status}; ${events(caseRead)}`);
    check(checks,'annat ärende och fel elev nekas lika',otherCaseRead.status===404&&mismatch.status===404&&equalShape(otherCaseRead,mismatch),`HTTP ${otherCaseRead.status}/${mismatch.status}`);

    const exported=await call(admin.session,'GET','/api/prov/export');
    const csv=typeof exported.body==='string'?exported.body:'';
    check(checks,'skoladministratören exporterar samma kontrollerade urval',exported.status===200&&exported.headers['content-type']?.includes('text/csv')&&csv.includes('Syntetisk elev 11')&&!csv.includes('Syntetisk elev 12')&&!csv.includes('Syntetisk elev 21')&&exported.headers['cache-control']==='no-store',`HTTP ${exported.status}`);
    check(checks,'exporten har committad händelse',events(exported)==='pupil_probe_exported|ok|1|export|',events(exported));
    const teacherExport=await call(teacher.session,'GET','/api/prov/export');
    const supportExport=await call(support.session,'GET','/api/prov/export');
    const hmRead=await call(hm,'GET','/api/prov/elev');
    check(checks,'lärare, support och huvudman saknar export/elevinsyn',teacherExport.status===403&&supportExport.status===403&&hmRead.status===403,`${teacherExport.status}/${supportExport.status}/${hmRead.status}`);
    check(checks,'nekad export loggas',events(teacherExport)==='pupil_probe_export|denied|||forbidden',events(teacherExport));

    const supportList=await call(support.session,'GET','/api/prov/elev');
    check(checks,'support ser en elev med godkännare, syfte och sluttid',supportList.status===200&&supportList.body?.pupils?.length===1&&supportList.body?.scope?.approverName==='Syntetisk rektor'&&supportList.body?.scope?.purposeCode==='synthetic-troubleshooting'&&Boolean(supportList.body?.scope?.endsAt),`HTTP ${supportList.status}`);
    const eventText=psql("select coalesce(string_agg(details::text,' '),'') from public.security_events where correlation_id=any(string_to_array(:'ids',',')::uuid[])",{ids:[list,byId,caseRead,exported,supportList,options].map(corr).join(',')});
    check(checks,'händelserna innehåller inga elevnamn',eventText!==''&&!eventText.includes('Syntetisk elev'),'details kontrollerade');

    let failed;
    try {
      psql('revoke insert on public.security_events from skolplattform_worker');
      failed={
        list:await call(teacher.session,'GET','/api/prov/elev'),
        byId:await call(teacher.session,'GET',`/api/prov/elev?elev=${pupil}`),
        caseRead:await call(health.session,'GET',`/api/prov/elev?arende=${ownCase}`),
        exported:await call(admin.session,'GET','/api/prov/export'),
        denied:await call(teacher.session,'GET','/api/prov/export'),
        options:await call(rector,'GET','/api/kund/mandat/urval'),
      };
    } finally {
      psql('grant insert on public.security_events to skolplattform_worker');
    }
    const allFailed=Object.values(failed);
    check(checks,'loggfel stoppar lista, ID, ärende, export, nekande och urval med audit_unavailable',allFailed.every((response)=>response.status===500&&response.body?.code==='audit_unavailable'),allFailed.map((response)=>`${response.status}/${response.body?.code}`).join(','));
    check(checks,'loggfel lämnar inget elevinnehåll',!leaks(...allFailed).includes('Syntetisk elev')&&!allFailed.some((response)=>response.headers['content-type']?.includes('text/csv')),'inga namn eller CSV');
    check(checks,'loggfel lämnar ingen ok-händelse',allFailed.every((response)=>!events(response).includes('|ok|')),allFailed.map(events).join(','));
    const recovered=await call(teacher.session,'GET','/api/prov/elev');
    check(checks,'läsningen fungerar igen när loggen är åter',recovered.status===200&&events(recovered)==='pupil_probe_listed|ok|1|list|',`HTTP ${recovered.status}`);

    const ended=await call(rector,'POST','/api/kund/uppdrag/avsluta',{assignmentId:support.assignmentId});
    const afterEnd=await call(support.session,'GET','/api/prov/elev');
    check(checks,'avslutat supportuppdrag nekar genast utan innehåll',ended.status===200&&afterEnd.status===403&&!leaks(afterEnd).includes('Syntetisk elev'),`avslut ${ended.status}, läsning ${afterEnd.status}/${afterEnd.body?.code}`);
    psql("update public.access_assignments set ended_at=clock_timestamp() where id=any(string_to_array(:'ids',',')::uuid[]) and ended_at is null",{ids:[teacher,admin,health,{assignmentId:appointed.body.assignmentId}].map((item)=>item.assignmentId).join(',')});
  },

  async 'phase3-mandates'(checks) {
    psql(fs.readFileSync(path.join(root,'work/pilot/sql/phase3-fixtures.sql'),'utf8'));
    const customer='33000000-0000-4000-8000-000000000001', organizer='33000000-0000-4000-8000-000000000011';
    const unit='33000000-0000-4000-8000-000000000111', group='33000000-0000-4000-8000-000000000311';
    const hm=await mint({identityId:'33000000-0000-4000-8000-000000000021',membershipId:'33000000-0000-4000-8000-000000000031',assignmentId:'33000000-0000-4000-8000-000000000041'});
    const createPerson=()=>{
      const identity=crypto.randomUUID(),membership=crypto.randomUUID();
      psql("insert into public.identities(id,issuer,subject,display_name) values(:'identity'::uuid,'https://phase3.example.test',:'identity','Syntetisk personal'); insert into public.memberships(id,identity_id,customer_id) values(:'member'::uuid,:'identity'::uuid,:'customer'::uuid)",{identity,member:membership,customer});
      return {identity,membership};
    };
    const person=createPerson(), teacher=createPerson();
    const today=psql('select public.app_today()::text');
    const payload={membershipId:person.membership,function:'rektor',unitIds:[unit],scopeKind:'school',validFrom:today};
    const principal=await call(hm,'POST','/api/kund/rektor',payload);
    check(checks,'huvudman tilldelar personbundet rektorsmandat',principal.status===201,`HTTP ${principal.status}/${principal.body?.code}`);
    if(principal.status!==201)return;
    const rector=await mint({identityId:person.identity,membershipId:person.membership,assignmentId:principal.body.assignmentId});
    const teacherPayload={...payload,membershipId:teacher.membership,function:'larare',scopeKind:'group',groups:[{id:group,kind:'teaching'}]};
    const forbidden=await call(hm,'POST','/api/kund/mandat',teacherPayload);
    check(checks,'huvudman nekas lärartilldelning',forbidden.status===403,`HTTP ${forbidden.status}`);
    const granted=await call(rector,'POST','/api/kund/mandat',teacherPayload);
    check(checks,'rektor tilldelar lärare i sin grupp',granted.status===201,`HTTP ${granted.status}/${granted.body?.code}`);
    const list=await call(rector,'GET','/api/kund/mandat');
    check(checks,'rektor kan lista sina mandat',list.status===200,`HTTP ${list.status}`);
    let noAuditRead, noAuditDeny, noAuditExport;
    const reviewer=await mint({identityId:ID.bertil,membershipId:ID.memberBertil,assignmentId:ID.assignmentBertil});
    try {
      psql('revoke insert on public.security_events from skolplattform_worker');
      noAuditRead=await call(rector,'GET','/api/kund/mandat');
      noAuditDeny=await call('invalid-audit-probe','GET','/api/kund/mandat');
      noAuditExport=await call(reviewer,'GET','/api/logg?format=csv');
    } finally {
      psql('grant insert on public.security_events to skolplattform_worker');
    }
    check(checks,'loggfel stoppar mandatläsning utan innehåll',noAuditRead?.status===500&&!noAuditRead.body?.mandates,`HTTP ${noAuditRead?.status}`);
    check(checks,'nekande utan beständig logg ger serverfel',noAuditDeny?.status===500,`HTTP ${noAuditDeny?.status}`);
    check(checks,'loggfel stoppar export utan CSV-innehåll',noAuditExport?.status===500&&!noAuditExport.headers['content-type']?.includes('text/csv'),`HTTP ${noAuditExport?.status}`);

    if(granted.status===201){
      const teacherSession=await mint({identityId:teacher.identity,membershipId:teacher.membership,assignmentId:granted.body.assignmentId});
      const before=await call(teacherSession,'GET','/api/session');
      const revoked=await call(rector,'POST','/api/kund/uppdrag/avsluta',{assignmentId:granted.body.assignmentId});
      const after=await call(teacherSession,'GET','/api/session');
      check(checks,'återkallat mandat blir omedelbart ovalbart',before.body?.context?.valid===true&&revoked.status===200&&after.body?.context?.valid===false,`avslut ${revoked.status}`);
    }
    const it=createPerson(),assignment=crypto.randomUUID();
    psql("insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(:'id'::uuid,:'member'::uuid,:'customer'::uuid,:'organizer'::uuid,'it','synthetic-v1','school'); insert into public.mandate_units values(:'id'::uuid,:'customer'::uuid,:'organizer'::uuid,:'unit'::uuid)",{id:assignment,member:it.membership,customer,organizer,unit});
    const itSession=await mint({identityId:it.identity,membershipId:it.membership,assignmentId:assignment});
    const current=await call(itSession,'GET',`/api/kund/anslutning?unitId=${unit}`);
    const changed=await call(itSession,'PATCH','/api/kund/anslutning',{unitId:unit,enabled:true,expectedVersion:current.body?.version});
    const conflict=await call(itSession,'PATCH','/api/kund/anslutning',{unitId:unit,enabled:false,expectedVersion:current.body?.version});
    const tested=await call(itSession,'POST','/api/kund/anslutning',{unitId:unit,action:'test'});
    check(checks,'IT kan ändra och prova syntetisk anslutning',current.status===200&&changed.status===200&&tested.body?.result==='synthetic_ok',`GET ${current.status}, PATCH ${changed.status}, test ${tested.status}`);
    check(checks,'IT får versionskonflikt vid gammal ändring',conflict.status===409,`HTTP ${conflict.status}`);
    const forged=await call(rector,'POST','/api/kund/mandat',{...teacherPayload,parentAssignmentId:'33000000-0000-4000-8000-000000000041'});
    const selfPromotion=await call(rector,'POST','/api/kund/rektor',payload);
    check(checks,'klienten kan inte ange överordnat mandat',forged.status===400,`HTTP ${forged.status}`);
    check(checks,'rektor kan inte utse rektor',selfPromotion.status===403,`HTTP ${selfPromotion.status}`);
    const itGrant=await call(itSession,'POST','/api/kund/mandat',teacherPayload);
    const otherConnection=await call(itSession,'GET','/api/kund/anslutning?unitId=33000000-0000-4000-8000-000000000112');
    const unknownConnection=await call(itSession,'GET',`/api/kund/anslutning?unitId=${crypto.randomUUID()}`);
    check(checks,'IT kan inte delegera verksamhetsmandat',itGrant.status===403,`HTTP ${itGrant.status}`);
    check(checks,'IT röjer inte annan skolas anslutning',otherConnection.status===404&&unknownConnection.status===404&&otherConnection.body?.code===unknownConnection.body?.code,`HTTP ${otherConnection.status}/${unknownConnection.status}`);
    const pupil='33000000-0000-4000-8000-000000000211';
    const health=createPerson();
    const healthGrant=await call(rector,'POST','/api/kund/mandat',{...payload,membershipId:health.membership,function:'elevhalsa',scopeKind:'pupil',pupilIds:[pupil]});
    check(checks,'rektor ger elevhälsa ett explicit elevurval',healthGrant.status===201,`HTTP ${healthGrant.status}`);
    if(healthGrant.status===201){
      const hs=await mint({identityId:health.identity,membershipId:health.membership,assignmentId:healthGrant.body.assignmentId});
      const denied=await call(hs,'POST','/api/kund/mandat',teacherPayload);
      check(checks,'elevhälsa kan inte delegera lärarmandat',denied.status===403,`HTTP ${denied.status}`);
    }
    const lead=createPerson(),leadAssignment=crypto.randomUUID();
    psql("insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(:'id'::uuid,:'member'::uuid,:'customer'::uuid,:'organizer'::uuid,'elevhalsoansvarig','synthetic-v1','school'); insert into public.mandate_units values(:'id'::uuid,:'customer'::uuid,:'organizer'::uuid,:'unit'::uuid)",{id:leadAssignment,member:lead.membership,customer,organizer,unit});
    const leadSession=await mint({identityId:lead.identity,membershipId:lead.membership,assignmentId:leadAssignment});
    const assignedHealth=createPerson();
    const withinHealth=await call(leadSession,'POST','/api/kund/mandat',{...payload,membershipId:assignedHealth.membership,function:'elevhalsa'});
    const outsideHealth=await call(leadSession,'POST','/api/kund/mandat',{...payload,membershipId:assignedHealth.membership,function:'elevhalsa',unitIds:['33000000-0000-4000-8000-000000000112']});
    const leadTeacher=await call(leadSession,'POST','/api/kund/mandat',teacherPayload);
    check(checks,'elevhälsoansvarig delegerar bara inom sin skola',withinHealth.status===201&&outsideHealth.status===403,`inom ${withinHealth.status}, utanför ${outsideHealth.status}`);
    check(checks,'elevhälsoansvarig kan inte delegera lärare',leadTeacher.status===403,`HTTP ${leadTeacher.status}`);
    const support=createPerson();
    const supportPayload={...payload,membershipId:support.membership,function:'support',scopeKind:'pupil',pupilIds:[pupil],purposeCode:'synthetic-troubleshooting',startsAt:new Date(Date.now()-1000).toISOString(),endsAt:new Date(Date.now()+600000).toISOString()};
    const tooLong=await call(rector,'POST','/api/kund/mandat',{...supportPayload,endsAt:new Date(Date.now()+7200000).toISOString()});
    const supportGrant=await call(rector,'POST','/api/kund/mandat',supportPayload);
    check(checks,'support kräver högst 60 minuter',tooLong.status===400&&supportGrant.status===201,`för lång ${tooLong.status}, avgränsad ${supportGrant.status}`);
    if(supportGrant.status===201){
      const ss=await mint({identityId:support.identity,membershipId:support.membership,assignmentId:supportGrant.body.assignmentId});
      const valid=await call(ss,'GET','/api/session');
      // Force only this random fixture past its deadline, keeping its duration valid.
      psql("update public.access_assignments set starts_at=clock_timestamp()-interval '10 minutes',ends_at=clock_timestamp()-interval '1 second' where id=:'id'::uuid",{id:supportGrant.body.assignmentId});
      const ended=await call(ss,'GET','/api/session');
      check(checks,'utgången support blir ovalbar i samma session',valid.body?.context?.valid===true&&ended.body?.context?.valid===false,`före ${valid.status}, efter ${ended.status}`);
    }
    const invitee=createPerson();
    const {membershipId:_recipient,...invitationMandate}=teacherPayload;
    const invitationBody={personName:'Syntetisk inbjuden',expectedIssuer:'https://phase3.example.test',expectedSubject:invitee.identity,mandates:[invitationMandate]};
    const invitation=await call(rector,'POST','/api/kund/inbjudan',invitationBody);
    check(checks,'rektor utfärdar personbunden verksamhetsinbjudan',invitation.status===201,`HTTP ${invitation.status}`);
    if(invitation.status===201){
      const inviteSession=await mint({identityId:invitee.identity});
      const token=new URL(invitation.body.link).hash.slice(1);
      const accepted=await call(inviteSession,'POST','/api/inbjudan/losen',{token});
      const replay=await call(inviteSession,'POST','/api/inbjudan/losen',{token});
      check(checks,'verksamhetsinbjudan kan lösas exakt en gång',accepted.status===201&&accepted.body?.assignments?.[0]?.function==='larare'&&replay.status===404,`första ${accepted.status}, andra ${replay.status}`);
    }
    const pending=createPerson();
    const pendingInvitation=await call(rector,'POST','/api/kund/inbjudan',{...invitationBody,expectedSubject:pending.identity});
    const closePrincipal=await call(hm,'POST','/api/kund/uppdrag/avsluta',{assignmentId:principal.body.assignmentId});
    if(pendingInvitation.status===201){
      const pendingSession=await mint({identityId:pending.identity});
      const rejected=await call(pendingSession,'POST','/api/inbjudan/losen',{token:new URL(pendingInvitation.body.link).hash.slice(1)});
      const count=psql("select count(*) from public.access_assignments where membership_id=:'id'::uuid",{id:pending.membership});
      check(checks,'avslutad utfärdare stoppar inlösen utan nytt mandat',closePrincipal.status===200&&rejected.status===404&&count==='0',`avslut ${closePrincipal.status}, inlösen ${rejected.status}, mandat ${count}`);
    }else check(checks,'inbjudan före avslut kunde skapas',false,`HTTP ${pendingInvitation.status}`);
    if(healthGrant.status===201){
      const hs=await mint({identityId:health.identity,membershipId:health.membership,assignmentId:healthGrant.body.assignmentId});
      const inherited=await call(hs,'GET','/api/session');
      check(checks,'rektorsavslut spärrar underordnat elevhälsomandat',closePrincipal.status===200&&inherited.body?.context?.valid===false,`HTTP ${inherited.status}`);
    }

  },

  async sparr(checks) {
    await ensureActiveGustav();
    const gustav = await mint({ identityId: ID.gustav, membershipId: ID.memberGustav, assignmentId: ID.assignmentGustav });
    const anna = await adminMint();
    const before = await call(gustav, 'GET', '/api/kund/oversikt');
    const blocked = await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'prov' });
    const old = await call(gustav, 'GET', '/api/kund/oversikt');
    const unblocked = await call(anna, 'PATCH', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, action: 'unblock' });
    const fresh = await mint({ identityId: ID.gustav, membershipId: ID.memberGustav, assignmentId: ID.assignmentGustav });
    const after = await call(fresh, 'GET', '/api/kund/oversikt');
    check(checks, 'befintlig session fungerade före spärr', before.status === 200, `HTTP ${before.status}`);
    check(checks, 'spärr återkallade utfärdad session', blocked.status === 200 && old.status === 401 && old.body?.code === 'session_revoked', `spärr ${blocked.status}, nästa ${old.status}/${old.body?.code}`);
    check(checks, 'öppning kräver ny session', unblocked.status === 200 && after.status === 200, `öppna ${unblocked.status}, ny ${after.status}`);
  },

  async 'uppdrag-avslut'(checks) {
    await ensureActiveGustav();
    const gustav = await mint({ identityId: ID.gustav, membershipId: ID.memberGustav, assignmentId: ID.assignmentGustav });
    const anna = await adminMint();
    const ended = await call(anna, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: ID.assignmentGustav });
    const denied = await call(gustav, 'GET', '/api/kund/oversikt');
    check(checks, 'uppdrag avslutades', ended.status === 200, `HTTP ${ended.status}`);
    check(checks, 'redan utfärdad session nekades', denied.status === 403 && denied.body?.code === 'assignment_ended', `HTTP ${denied.status}/${denied.body?.code}`);
    check(checks, 'assignment-id bevarades i audit', psql("select count(*) from public.security_events where assignment_id=:'id'::uuid and action='kund_oversikt' and outcome='denied'", { id: ID.assignmentGustav }) !== '0', 'nekandet är bundet till uppdraget');
    await ensureActiveGustav();
  },

  async 'uppdrag-utgatt'(checks) {
    const expired = await mint({ identityId: ID.frida, membershipId: ID.memberFrida, assignmentId: ID.assignmentExpired });
    const future = await mint({ identityId: ID.frida, membershipId: ID.memberFrida, assignmentId: ID.assignmentFuture });
    const valid = await mint({ identityId: ID.frida, membershipId: ID.memberFrida, assignmentId: ID.assignmentFrida });
    const [expiredResult, futureResult, validResult, sessionResult] = await Promise.all([
      call(expired, 'GET', '/api/kund/oversikt'), call(future, 'GET', '/api/kund/oversikt'),
      call(valid, 'GET', '/api/kund/oversikt'), call(valid, 'GET', '/api/session'),
    ]);
    check(checks, 'utgånget uppdrag nekades', expiredResult.status === 403 && ['assignment_expired', 'assignment_ended'].includes(expiredResult.body?.code), `HTTP ${expiredResult.status}/${expiredResult.body?.code}`);
    check(checks, 'kommande uppdrag nekades', futureResult.status === 403 && futureResult.body?.code === 'assignment_upcoming', `HTTP ${futureResult.status}/${futureResult.body?.code}`);
    const states = new Map((sessionResult.body?.assignments ?? []).map((item) => [item.id, item.state]));
    check(checks, 'sessionen visar alla giltighetslägen', validResult.status === 200 && states.get(ID.assignmentFrida) === 'giltigt' && states.get(ID.assignmentFuture) === 'kommande' && states.get(ID.assignmentExpired) === 'avslutat', JSON.stringify(Object.fromEntries(states)));
  },

  async session(checks) {
    const expired = await adminMint({ expiresInSec: -60 });
    const revoked = await adminMint();
    psql("update public.app_sessions set revoked_at=now() where id=:'id'::uuid", { id: revoked.sessionId });
    const sliding = await adminMint();
    psql("update public.app_sessions set last_seen_at=now()-interval '2 minutes' where id=:'id'::uuid", { id: sliding.sessionId });
    const [expiredResult, revokedResult, invalidResult, slidingResult] = await Promise.all([
      call(expired, 'GET', '/api/kund/oversikt'), call(revoked, 'GET', '/api/kund/oversikt'),
      call('ogiltig', 'GET', '/api/kund/oversikt'), call(sliding, 'GET', '/api/kund/oversikt'),
    ]);
    check(checks, 'utgången session nekades', expiredResult.status === 401 && expiredResult.body?.code === 'session_expired', `HTTP ${expiredResult.status}/${expiredResult.body?.code}`);
    check(checks, 'återkallad session nekades', revokedResult.status === 401 && revokedResult.body?.code === 'session_revoked', `HTTP ${revokedResult.status}/${revokedResult.body?.code}`);
    check(checks, 'okänd cookie nekades', invalidResult.status === 401 && invalidResult.body?.code === 'no_session', `HTTP ${invalidResult.status}/${invalidResult.body?.code}`);
    check(checks, 'glidande livstid förlängdes', slidingResult.status === 200 && bool(psql("select expires_at > now()+interval '14 minutes 30 seconds' from public.app_sessions where id=:'id'::uuid", { id: sliding.sessionId })), `HTTP ${slidingResult.status}`);
  },

  async csrf(checks) {
    const anna = await adminMint();
    const cross = await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: crypto.randomUUID(), reason: 'prov' }, { 'Sec-Fetch-Site': 'cross-site', Origin: 'https://annan.example' });
    const own = await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: crypto.randomUUID(), reason: 'prov' }, { 'Sec-Fetch-Site': '', Origin: baseUrl });
    check(checks, 'cross-site nekades', cross.status === 403 && cross.body?.code === 'csrf', `HTTP ${cross.status}/${cross.body?.code}`);
    check(checks, 'egen origin passerade CSRF-gränsen', own.body?.code !== 'csrf', `HTTP ${own.status}/${own.body?.code}`);
  },

  async 'mfa-kravs'(checks) {
    await ensureActiveGustav();
    const before = psql("select status::text from public.memberships where id=:'id'::uuid", { id: ID.memberGustav });
    const pwd = await adminMint({ acr: '1', amr: ['pwd'] });
    const stale = await adminMint({ authTimeOffsetSec: 30_000 });
    const deniedPwd = await call(pwd, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'proof', proof: { result: 'accepted' }, identityAssurance: 'hög' });
    const deniedStale = await call(stale, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'proof' });
    check(checks, 'lösenord utan OTP nekades utan skrivning', deniedPwd.status === 403 && deniedPwd.body?.code === 'mfa_required' && before === psql("select status::text from public.memberships where id=:'id'::uuid", { id: ID.memberGustav }), `HTTP ${deniedPwd.status}/${deniedPwd.body?.code}`);
    check(checks, 'för gammalt bevis nekades', deniedStale.status === 403 && deniedStale.body?.code === 'mfa_required', `HTTP ${deniedStale.status}/${deniedStale.body?.code}`);
    const variants = [
      ['proof-profile', { profileId: 'okand-profil' }, {}],
      ['proof-issuer', { issuer: 'https://annan.example' }, {}],
      ['proof-audience', { audience: ['annan-klient'] }, {}],
      ['proof-time', {}, { authTimeOffsetSec: -300 }],
      ['proof-amr', {}, { amr: ['pwd', 'otp', 'okand'] }],
    ];
    for (const [name, overrides, mintOptions] of variants) {
      const bad = await adminMint({ ...mintOptions, overrides });
      const result = await call(bad, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: name });
      check(checks, name, result.status === 403 && result.body?.code === 'mfa_required', `HTTP ${result.status}/${result.body?.code}`);
    }
    const ivar = await mint({ identityId: ID.ivar, membershipId: ID.memberIvar, assignmentId: ID.assignmentIvar, acr: '1', amr: ['pwd'] });
    const ivarResult = await call(ivar, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'prov' });
    check(checks, 'kundadmin utan TOTP nekades', ivarResult.status === 403 && ivarResult.body?.code === 'mfa_required', `HTTP ${ivarResult.status}/${ivarResult.body?.code}`);
    const good = await adminMint();
    const accepted = await call(good, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'proof', proof: { issuer: 'klient' }, actor: ID.david });
    const acceptedCorr = accepted.headers['x-correlation-id'];
    const deniedCorr = deniedPwd.headers['x-correlation-id'];
    const proofRows = psql(`select string_agg(details->'proof'->>'result', ',' order by outcome) from public.security_events
      where correlation_id in (:'denied'::uuid, :'accepted'::uuid)`, { denied: deniedCorr, accepted: acceptedCorr });
    check(checks, 'serverhärledd proof-audit för nekad och godkänd åtgärd', accepted.status === 200 && proofRows.includes('accepted') && proofRows.includes('denied'), `HTTP ${accepted.status}; resultat ${proofRows}`);
    const exported = psql(`select details::text from public.security_events where correlation_id=:'corr'::uuid`, { corr: acceptedCorr });
    check(checks, 'klientens proof och aktör ignorerades', !exported.includes('"issuer": "klient"') && !exported.includes(ID.david), 'audit innehåller endast serverbedömt bevis');
    const unblock = await call(good, 'PATCH', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, action: 'unblock' });
    check(checks, 'giltigt exakt bevis kunde återställa', unblock.status === 200, `HTTP ${unblock.status}`);
  },

  async inbjudan(checks) {
    const accountAdmin=await adminMint();
    const accountInvitation=await call(accountAdmin,'POST','/api/kund/inbjudan',{personName:'Syntetisk granskare',expectedIssuer:proof.issuer,expectedSubject:ID.erik,grants:['granskare']});
    check(checks,'kundadmin kan bjuda in till kontoroll via webben',accountInvitation.status===201,`HTTP ${accountInvitation.status}`);
    if(accountInvitation.status===201){
      const accountSession=await mint({identityId:ID.erik});
      const redeemed=await call(accountSession,'POST','/api/inbjudan/losen',{token:new URL(accountInvitation.body.link).hash.slice(1)});
      check(checks,'webbinbjudan ger endast begärd kontoroll',redeemed.status===201&&redeemed.body?.assignments?.length===1&&redeemed.body.assignments[0].function==='granskare',`HTTP ${redeemed.status}`);
    }
    const prefix = `Provkund C ${Date.now()}`;
    const issuedCustomers = [];
    const issue = (extra, suffix) => {
      const token = invitationToken(['--subject', ID.erik, '--verification-reference', 'local-fixture', '--person', 'Prov Företrädare', '--issuer', proof.issuer, '--grants', 'kundadmin', '--customer-name', `${prefix} ${suffix}`, ...extra]);
      issuedCustomers.push(customerIdForInvitation(token));
      return token;
    };
    try {
      const token = issue([], 'giltig');
      const erik = await mint({ identityId: ID.erik });
      const first = await call(erik, 'POST', '/api/inbjudan/losen', { token });
      const overview = await call(erik, 'GET', '/api/kund/oversikt');
      const replay = await call(erik, 'POST', '/api/inbjudan/losen', { token });
      check(checks, 'giltig personbunden inbjudan gav kundadmin', first.status === 201 && first.body?.assignments?.[0]?.function === 'kundadmin' && overview.status === 200 && overview.body?.customer?.name.startsWith(prefix), `lösen ${first.status}, översikt ${overview.status}`);
      check(checks, 'återanvändning nekades', replay.status === 404 && replay.body?.code === 'invitation_invalid', `HTTP ${replay.status}/${replay.body?.code}`);

      const wrongIssuer = invitationToken(['--subject', ID.erik, '--verification-reference', 'local-fixture', '--person', 'Prov Företrädare', '--issuer', 'https://annan.example', '--grants', 'kundadmin', '--customer-name', `${prefix} issuer`]);
      issuedCustomers.push(customerIdForInvitation(wrongIssuer));
      const wrongIssuerResult = await call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { token: wrongIssuer });
      check(checks, 'fel issuer nekades', wrongIssuerResult.status === 404 && wrongIssuerResult.body?.code === 'invitation_invalid', `HTTP ${wrongIssuerResult.status}/${wrongIssuerResult.body?.code}`);

      const expired = issue(['--ttl', '0s'], 'utgangen');
      await new Promise((resolve) => setTimeout(resolve, 20));
      const expiredResult = await call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { token: expired });
      check(checks, 'utgången inbjudan nekades', expiredResult.status === 404 && expiredResult.body?.code === 'invitation_invalid', `HTTP ${expiredResult.status}/${expiredResult.body?.code}`);

      const before = Number(psql("select count(*) from public.memberships where identity_id=:'id'::uuid", { id: ID.erik }));
      const orgOnly = await call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { organizationNumber: '5599999901', emailDomain: 'example.test' });
      const bad = await call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { token: 'x'.repeat(43) });
      check(checks, 'organisationsnummer gav ingen rättighet', orgOnly.status === 400 && Number(psql("select count(*) from public.memberships where identity_id=:'id'::uuid", { id: ID.erik })) === before, `HTTP ${orgOnly.status}`);
      check(checks, 'okänd token har samma 404-form', bad.status === 404 && equalShape(bad, replay), `HTTP ${bad.status}/${bad.body?.code}`);

      const wrongSubject = invitationToken(['--subject', ID.anna, '--email', 'erik@example.test', '--verification-reference', 'local-fixture', '--person', 'Prov Företrädare', '--issuer', proof.issuer, '--grants', 'kundadmin', '--customer-name', `${prefix} subject`]);
      issuedCustomers.push(customerIdForInvitation(wrongSubject));
      const wrongSubjectResult = await call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { token: wrongSubject });
      check(checks, 'samma issuer och e-post men fel subject nekades', wrongSubjectResult.status === 404 && wrongSubjectResult.body?.code === 'invitation_invalid', `HTTP ${wrongSubjectResult.status}/${wrongSubjectResult.body?.code}`);

      const weakToken = issue([], 'svag');
      const weak = await mint({ identityId: ID.erik, acr: '1', amr: ['pwd'] });
      const weakResult = await call(weak, 'POST', '/api/inbjudan/losen', { token: weakToken });
      check(checks, 'otillräcklig MFA nekades', weakResult.status === 403 && weakResult.body?.code === 'mfa_required', `HTTP ${weakResult.status}/${weakResult.body?.code}`);

      const concurrentToken = issue([], 'samtidig');
      const concurrent = await Promise.all([
        call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { token: concurrentToken }),
        call(await mint({ identityId: ID.erik }), 'POST', '/api/inbjudan/losen', { token: concurrentToken }),
      ]);
      const statuses = concurrent.map((item) => item.status).sort((a, b) => a - b);
      check(checks, 'samtidig inlösen gav exakt en vinnare', JSON.stringify(statuses) === JSON.stringify([201, 404]), statuses.join(','));
    } finally {
      psql(`update public.app_sessions set membership_id=null, assignment_id=null where identity_id=:'identity'::uuid;
        delete from public.access_assignments where membership_id in (select id from public.memberships where identity_id=:'identity'::uuid);
        delete from public.memberships where identity_id=:'identity'::uuid;
        delete from public.invitations where customer_id in (select id from public.customers where name like :'prefix');
        delete from public.organizers where customer_id in (select id from public.customers where name like :'prefix');
        delete from public.customers where name like :'prefix';`, { identity: ID.erik, prefix: `${prefix}%` });
    }
  },

  async 'frammande-id'(checks) {
    const anna = await adminMint();
    const david = await mint({ identityId: ID.david, membershipId: ID.memberDavid, assignmentId: ID.assignmentDavid });
    const foreign = await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberDavid, reason: 'prov' });
    const missing = await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: crypto.randomUUID(), reason: 'prov' });
    check(checks, 'främmande och obefintligt medlemskap har samma svar', equalShape(foreign, missing) && Math.abs(foreign.elapsedMs - missing.elapsedMs) < 200, `HTTP ${foreign.status}/${missing.status}, Δ ${Math.round(Math.abs(foreign.elapsedMs - missing.elapsedMs))} ms`);
    const foreignPrincipal = await call(anna, 'POST', '/api/kund/rektor', { organizerId: ID.organizerA, unitId: ID.demoUnit, principalName: 'x' });
    const missingPrincipal = await call(anna, 'POST', '/api/kund/rektor', { organizerId: ID.organizerA, unitId: crypto.randomUUID(), principalName: 'x' });
    check(checks, 'främmande skolenhet röjde inte existens', equalShape(foreignPrincipal, missingPrincipal), `HTTP ${foreignPrincipal.status}/${missingPrincipal.status}`);
    const foreignOrg = await call(david, 'GET', `/api/organisation?huvudman=${ID.organizerA}`);
    const members = await call(david, 'GET', '/api/kund/medlemmar');
    const emails = (members.body?.members ?? []).map((member) => member.email).filter(Boolean);
    check(checks, 'främmande huvudman nekades', foreignOrg.status === 404 && foreignOrg.body?.code === 'not_found', `HTTP ${foreignOrg.status}/${foreignOrg.body?.code}`);
    check(checks, 'listning läckte inga A-personer', members.status === 200 && !emails.includes('anna@example.test') && !emails.includes('bertil@example.test'), `HTTP ${members.status}; ${emails.join(',')}`);
    check(checks, 'främmande medlemskap ändrades inte', psql("select status::text from public.memberships where id=:'id'::uuid", { id: ID.memberDavid }) === 'active', 'status active');
    const foreignAssignment = psql("select id::text from public.assignments where organizer_id<>:'org'::uuid limit 1", { org: ID.organizerA });
    if (foreignAssignment) {
      const principal = await call(anna, 'POST', '/api/kund/rektor', { organizerId: ID.organizerA, unitId: ID.unitA, principalAssignmentId: foreignAssignment });
      const missingPrincipal = await call(anna, 'POST', '/api/kund/rektor', { organizerId: ID.organizerA, unitId: ID.unitA, principalAssignmentId: crypto.randomUUID() });
      check(checks, 'kundadmin nekas rektorsvägen utan att röja främmande uppdrag', principal.status === 403 && principal.body?.code === 'forbidden' && missingPrincipal.status === 403 && missingPrincipal.body?.code === 'forbidden', `HTTP ${principal.status}/${missingPrincipal.status}`);
    } else check(checks, 'rektorsuppdrag från annan huvudman nekades', true, 'ingen sådan syntetisk rad; slump-id-vägen täcks ovan');
  },

  async 'samma-epost'(checks) {
    const a = await mint({ identityId: ID.ceciliaA, membershipId: ID.memberCeciliaA, assignmentId: ID.assignmentCeciliaA });
    const b = await mint({ identityId: ID.ceciliaB, membershipId: ID.memberCeciliaB, assignmentId: ID.assignmentCeciliaB });
    const [overviewA, overviewB, sessionA, sessionB] = await Promise.all([
      call(a, 'GET', '/api/kund/oversikt'), call(b, 'GET', '/api/kund/oversikt'), call(a, 'GET', '/api/session'), call(b, 'GET', '/api/session'),
    ]);
    check(checks, 'två identiteter med samma e-post finns', psql("select count(*) from public.identities where email='cecilia@example.test'") === '2', 'antal 2');
    check(checks, 'kunderna hålls isär', overviewA.body?.customer?.name === 'Provkund A' && overviewB.body?.customer?.name === 'Provkund B', `${overviewA.body?.customer?.name}/${overviewB.body?.customer?.name}`);
    check(checks, 'vardera identiteten har ett uppdrag', sessionA.body?.assignments?.length === 1 && sessionB.body?.assignments?.length === 1 && psql("select count(*) from public.memberships where identity_id in (:'a'::uuid, :'b'::uuid)", { a: ID.ceciliaA, b: ID.ceciliaB }) === '2', `${sessionA.body?.assignments?.length}/${sessionB.body?.assignments?.length}`);
    const original = psql("select id::text||'|'||coalesce(auth_user_id::text,'') from public.identities where id in (:'a'::uuid, :'b'::uuid) order by id", { a: ID.ceciliaA, b: ID.ceciliaB }).split('\n');
    const authUser = psql('select id::text from auth.users order by created_at limit 1');
    const synthetic = crypto.randomUUID();
    try {
      if (authUser) {
        psql("update public.identities set auth_user_id=:'auth'::uuid where id in (:'a'::uuid, :'b'::uuid)", { auth: authUser, a: ID.ceciliaA, b: ID.ceciliaB });
        const sharedA = await call(await mint({ identityId: ID.ceciliaA, membershipId: ID.memberCeciliaA, assignmentId: ID.assignmentCeciliaA }), 'GET', '/api/kund/oversikt');
        const sharedB = await call(await mint({ identityId: ID.ceciliaB, membershipId: ID.memberCeciliaB, assignmentId: ID.assignmentCeciliaB }), 'GET', '/api/kund/oversikt');
        check(checks, 'delad auth-referens gav inte delat medlemskap', sharedA.body?.customer?.name === 'Provkund A' && sharedB.body?.customer?.name === 'Provkund B', `${sharedA.body?.customer?.name}/${sharedB.body?.customer?.name}`);
        psql(`insert into public.identities(id,issuer,subject,auth_user_id,display_name,email)
          values (:'id'::uuid,'https://synthetic.invalid',:'id',:'auth'::uuid,'Syntetisk Cecilia','cecilia@example.test')`, { id: synthetic, auth: authUser });
        const external = await mint({ identityId: synthetic });
        const externalSession = await call(external, 'GET', '/api/session');
        const externalOverview = await call(external, 'GET', '/api/kund/oversikt');
        check(checks, 'ny extern subject ärvde ingen kund', externalSession.status === 200 && externalSession.body?.assignments?.length === 0 && externalOverview.status === 403 && externalOverview.body?.code === 'no_context', `session ${externalSession.status}, översikt ${externalOverview.status}/${externalOverview.body?.code}`);
      } else check(checks, 'delad auth-referens gav inte delat medlemskap', false, 'saknar auth.users-fixtur');
    } finally {
      psql("delete from public.app_sessions where identity_id=:'id'::uuid; delete from public.identities where id=:'id'::uuid", { id: synthetic });
      for (const row of original) {
        const [id, auth] = row.split('|');
        psql("update public.identities set auth_user_id=nullif(:'auth','')::uuid where id=:'id'::uuid", { id, auth });
      }
    }
  },

  async 'aktor-forfalskning'(checks) {
    await ensureActiveGustav();
    const anna = await adminMint();
    const response = await call(anna, 'POST', '/api/kund/medlemskap/sparr', {
      membershipId: ID.memberGustav, reason: 'Syntetisk elevuppgift får inte loggas', actorRole: 'larare', actor: ID.david,
    }, { 'X-App-Role':'larare', 'X-Actor':ID.david });
    const corr=response.headers['x-correlation-id'];
    const audit=psql("select actor_identity_id::text||'|'||assignment_id::text||'|'||action from public.security_events where correlation_id=:'corr'::uuid",{corr});
    check(checks,'tillåten kontoåtgärd lyckades',response.status===200,`HTTP ${response.status}`);
    check(checks,'förfalskade aktörsfält ignoreras',audit===`${ID.anna}|${ID.assignmentAnna}|membership_blocked`,audit);
    const minimized=psql("select not(details ? 'reason') and position('Syntetisk elevuppgift' in details::text)=0 from public.security_events where correlation_id=:'corr'::uuid",{corr});
    check(checks,'fritext sparas inte i den beständiga händelsen',minimized==='t','endast minimerade detaljfält');

    await call(anna,'PATCH','/api/kund/medlemskap/sparr',{membershipId:ID.memberGustav,action:'unblock'});
    const principal=await call(anna,'POST','/api/kund/rektor',{organizerId:ID.organizerA,unitId:ID.unitA,principalName:'Förfalskad Rektor'}, {'X-App-Role':'huvudman'});
    check(checks,'kundadmin kan inte ärva huvudmannens utnämningsrätt',principal.status===403&&principal.body?.code==='forbidden',`HTTP ${principal.status}`);
  },

  async logg(checks) {
    await ensureActiveGustav();
    const anna = await adminMint();
    const bertil = await mint({ identityId: ID.bertil, membershipId: ID.memberBertil, assignmentId: ID.assignmentBertil });
    const ceciliaB = await mint({ identityId: ID.ceciliaB, membershipId: ID.memberCeciliaB, assignmentId: ID.assignmentCeciliaB });
    const from = new Date(Date.now() - 1000).toISOString();
    await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'loggprov' });
    await call(anna, 'PATCH', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, action: 'unblock' });
    const originalAuth = psql("select coalesce(auth_user_id::text,'') from public.identities where id=:'id'::uuid", { id: ID.anna });
    const authUser = originalAuth || psql('select id::text from auth.users order by created_at limit 1');
    try {
      psql("update public.identities set auth_user_id=:'auth'::uuid where id=:'id'::uuid", { auth: authUser, id: ID.anna });
      await call(anna, 'POST', '/api/kund/rektor', { organizerId: ID.organizerA, unitId: ID.unitA, principalName: 'Loggprov Rektor' });
    } finally {
      psql("update public.identities set auth_user_id=nullif(:'auth','')::uuid where id=:'id'::uuid", { auth: originalAuth, id: ID.anna });
    }
    const jsonLog = await call(bertil, 'GET', `/api/logg?from=${encodeURIComponent(from)}`);
    const before = Number(psql("select count(*) from public.security_events where action='log_exported' and actor_identity_id=:'id'::uuid", { id: ID.bertil }));
    const csvLog = await call(bertil, 'GET', `/api/logg?format=csv&from=${encodeURIComponent(from)}`);
    const after = Number(psql("select count(*) from public.security_events where action='log_exported' and actor_identity_id=:'id'::uuid", { id: ID.bertil }));
    const denied = await call(anna, 'GET', `/api/logg?from=${encodeURIComponent(from)}`);
    const other = await call(ceciliaB, 'GET', `/api/logg?from=${encodeURIComponent(from)}`);
    const events = jsonLog.body?.events ?? [];
    check(checks, 'granskare såg bara kund A:s logg', jsonLog.status === 200 && events.length > 0 && events.every((event) => event.customerId === ID.customerA), `HTTP ${jsonLog.status}, ${events.length} händelser`);
    check(checks, 'loggen innehöll serverhärledd spärr och nekad rektorsutnämning', events.some((event) => event.action === 'membership_blocked' && event.actorSubject === ID.anna) && events.some((event) => event.action === 'principal_appointed' && event.actorSubject === ID.anna && event.outcome === 'denied'), 'båda audittyperna hittades');
    check(checks, 'CSV-export loggades exakt en gång', csvLog.status === 200 && String(csvLog.headers['content-type']).startsWith('text/csv') && after === before + 1, `HTTP ${csvLog.status}, Δ ${after - before}`);
    check(checks, 'kundadmin nekades granskarlogg', denied.status === 403 && denied.body?.code === 'forbidden', `HTTP ${denied.status}/${denied.body?.code}`);
    check(checks, 'kund B såg inga A-rader', other.status === 200 && (other.body?.events ?? []).every((event) => event.customerId === ID.customerB), `HTTP ${other.status}, ${(other.body?.events ?? []).length} händelser`);
    const forbidden = events.some((event) => Object.keys(event.details ?? {}).some((key) => ['token', 'email'].includes(key.toLowerCase())));
    check(checks, 'exporterade detaljer är minimerade', !forbidden, forbidden ? 'förbjuden nyckel hittades' : 'inga token/e-postnycklar');
  },

  async 'logg-flod'(checks) {
    const from = new Date().toISOString();
    const statuses = [];
    for (let i = 0; i < 30; i += 1) {
      const result = await call(`ogiltig-${i}`, 'GET', '/api/kund/oversikt', undefined, { 'X-Forwarded-For': `203.0.113.${i + 1}` });
      statuses.push(result.status);
    }
    const denied = Number(psql("select count(*) from public.security_events where action='kund_oversikt' and outcome='denied' and occurred_at>=:'from'::timestamptz", { from }));
    const suppressed = Number(psql("select count(*) from public.security_events where action='denied_suppressed' and occurred_at>=:'from'::timestamptz", { from }));
    check(checks, 'alla ogiltiga sessioner nekades', statuses.every((status) => status === 401), `${statuses.filter((status) => status === 401).length}/30`);
    check(checks, 'varje nekande har en beständig händelse', denied === 30, `${denied} fullständiga nekanden`);
    check(checks, 'ingen tyst undertryckning vid spoofad X-Forwarded-For', suppressed === 0, `${suppressed} suppression`);
  },

  async 'context-race'(checks) {
    const hanna = await mint({ identityId: ID.hanna, membershipId: ID.memberHannaA, assignmentId: ID.assignmentHannaA });
    const oldEpoch = hanna.epoch;
    const switched = await call(hanna, 'POST', '/api/context', { assignmentId: ID.assignmentHannaB });
    const stale = await call(hanna, 'GET', '/api/kund/oversikt', undefined, { 'X-Context-Epoch': String(oldEpoch) });
    const fresh = await call(hanna, 'GET', '/api/kund/oversikt');
    check(checks, 'kontextbyte ökade epoch', switched.status === 200 && hanna.epoch > oldEpoch, `${oldEpoch}→${hanna.epoch}`);
    check(checks, 'gammal epoch nekades utan data', stale.status === 409 && stale.body?.code === 'context_changed' && !JSON.stringify(stale.body).includes('Provkund B'), `HTTP ${stale.status}/${stale.body?.code}`);
    check(checks, 'ny epoch gav vald kund', fresh.status === 200 && fresh.body?.customer?.name === 'Provkund B', `HTTP ${fresh.status}/${fresh.body?.customer?.name}`);
  },

  async 'audit-rollback'(checks) {
    await ensureActiveGustav();
    const anna = await adminMint();
    let response;
    try {
      psql('revoke insert on public.security_events from skolplattform_worker');
      response = await call(anna, 'POST', '/api/kund/medlemskap/sparr', { membershipId: ID.memberGustav, reason: 'rollbackprov' });
    } finally {
      psql('grant insert on public.security_events to skolplattform_worker');
    }
    const status = psql("select status::text from public.memberships where id=:'id'::uuid", { id: ID.memberGustav });
    check(checks, 'auditfel gav serverfel', response?.status === 500, `HTTP ${response?.status ?? 'saknas'}`);
    check(checks, 'verksamhetsändringen rullades tillbaka', status === 'active', `status ${status}`);
  },
};

let exitCode = 1;
try {
  await startServer();
  // Varje verifieringskörning får en egen deterministisk minutbucket. Tabellen
  // innehåller bara flyktigt flödeskontrolltillstånd i det disponibla målet;
  // säkerhetshändelserna lämnas oförändrade.
  psql("delete from public.denial_buckets where bucket_start=date_trunc('minute',now())");
  for (const name of options.cases) await runCase(name, cases[name]);
  const report = {
    checkedAt,
    revision: revision(),
    target: 'protected',
    baseUrl,
    status: results.every((item) => item.status === 'PASS') ? 'PASS' : 'FAIL',
    cases: results,
  };
  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
  exitCode = report.status === 'PASS' ? 0 : 1;
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  exitCode = message.startsWith('BLOCKED:') ? 3 : 1;
} finally {
  try {
    if (sessions.size) psql("delete from public.app_sessions where id=any(string_to_array(:'ids',',')::uuid[])", { ids: [...sessions].join(',') });
  } catch (error) { console.error(`Städning av sessioner misslyckades: ${error instanceof Error ? error.message : String(error)}`); exitCode = 1; }
  for (const action of restore.reverse()) {
    try { action(); } catch (error) { console.error(`Återställning misslyckades: ${error instanceof Error ? error.message : String(error)}`); exitCode = 1; }
  }
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 3000); });
    if (server.exitCode === null) server.kill('SIGKILL');
  }
  if (pgpassPath) fs.rmSync(pgpassPath, { force: true });
}
process.exit(exitCode);
