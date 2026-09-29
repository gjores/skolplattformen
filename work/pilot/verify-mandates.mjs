#!/usr/bin/env node
// Fas 3:s namngivna API-, kringgående- och loggfelsprov, portade till fas 4:s
// elevregister mot byggd protected-Worker i det lokala syntetiska målet.
//
// Sessionerna mintas direkt i målet med samma bevisprofil som verify-access.mjs.
// Det provar serverns mandat- och auditgränser men bevisar INTE en verklig
// IdP-anslutning (den riktiga OIDC-kedjan provas i browserproven).
//
// Källbevis:
//  - Worker: public.security_events per servergenererad korrelation.
//  - Direkta vägar: Kong/Storage/Postgres-loggar via collect-denials.mjs
//    (minimerade, i minnet) samt extra Kong-korrelerade prov för gamla RPC:er.
//
//   node work/pilot/verify-mandates.mjs --out work/pilot/results/phase4-mandates-regression.json
//   node work/pilot/verify-mandates.mjs --case teacher-group [--case ...]   (felsökning)
//
// Ett delurval ger aldrig status PASS (endast PARTIAL). Saknat fall, krasch eller
// otillgänglig källa ger FAIL/BLOCKED. Inga tokens, cookies, nycklar eller
// elevnamn skrivs till resultatet.

import { execFileSync, spawn, spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const startedAt = new Date().toISOString();

export const REQUIRED_CASES = [
  'principal-chain', 'teacher-group', 'school-admin', 'health-school', 'health-pupil', 'health-case',
  'support-boundary', 'support-groups', 'it-admin', 'self-escalation', 'parent-revoked', 'invitation-recheck',
  'foreign-object', 'concurrent-revoke', 'direct-rest', 'direct-rpc', 'direct-storage', 'direct-sql',
  'audit-read-fail', 'audit-export-fail', 'audit-write-rollback', 'audit-deny-fail', 'audit-flood',
  'audit-source-outage', 'audit-minimization', 'audit-retention',
];
const SOURCE_CASES = ['direct-rest', 'direct-rpc', 'direct-storage', 'direct-sql', 'audit-source-outage', 'audit-minimization'];

// Syntetiska registerfixturer (work/pilot/sql/phase3-fixtures.sql) och tillfälliga provrader.
const C1 = '33000000-0000-4000-8000-000000000001', C2 = '33000000-0000-4000-8000-000000000002';
const ORG1 = '33000000-0000-4000-8000-000000000011';
const U11 = '33000000-0000-4000-8000-000000000111', U12 = '33000000-0000-4000-8000-000000000112', U21 = '33000000-0000-4000-8000-000000000121';
const P11 = '33000000-0000-4000-8000-000000000211', P12 = '33000000-0000-4000-8000-000000000212', P21 = '33000000-0000-4000-8000-000000000221';
const G11 = '33000000-0000-4000-8000-000000000311', G12 = '33000000-0000-4000-8000-000000000312';
const K11 = '33000000-0000-4000-8000-000000000411', K12 = '33000000-0000-4000-8000-000000000412', K21 = '33000000-0000-4000-8000-000000000421';
// Tillfällig elev/grupp/ärende i skola 11 (annan grupp än G11); tas bort i finally.
const P19 = '33000000-0000-4000-8000-000000000219', G19 = '33000000-0000-4000-8000-000000000319', K19 = '33000000-0000-4000-8000-000000000419';
const HM1 = { identity: '33000000-0000-4000-8000-000000000021', membership: '33000000-0000-4000-8000-000000000031', assignment: '33000000-0000-4000-8000-000000000041' };
const HM2 = { membership: '33000000-0000-4000-8000-000000000032', assignment: '33000000-0000-4000-8000-000000000042' };
const BERTIL = { identity: '30000000-0000-4000-8000-000000000002', membership: '40000000-0000-4000-8000-000000000002', assignment: '50000000-0000-4000-8000-000000000002' };
const NAME_MARKERS = ['Syntetisk elev', 'Syntetisk rektor', 'Syntetisk personal', 'Syntetisk anteckning', 'Syntetisk inbjuden'];
const REGISTER_ROW_FIELDS = new Set(['id','displayName','unitId','unitName','classId','className','educationId',
  'educationName','grade','status','capabilities','birthDate','municipalityCode']);
const secretPattern = /sp_session=|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}|BEGIN (?:RSA |EC )?PRIVATE KEY|sb_(?:secret|service)_|Syntetisk elev/iu;

export function parseArgs(argv) {
  const options = { cases: [], port: 3014, baseUrl: null, out: path.join(root, 'work/pilot/results/phase4-mandates-regression.json') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => {
      const next = argv[++i];
      if (next === undefined) throw new Error(`${arg} saknar värde`);
      return next;
    };
    if (arg === '--case') options.cases.push(value());
    else if (arg === '--base-url') options.baseUrl = value();
    else if (arg === '--port') options.port = Number(value());
    else if (arg === '--out') options.out = path.resolve(process.cwd(), value());
    else throw new Error(`okänt argument ${arg}`);
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('ogiltig port');
  for (const name of options.cases) if (!REQUIRED_CASES.includes(name)) throw new Error(`okänt fall ${name}`);
  const results = path.join(root, 'work/pilot/results');
  if (path.dirname(options.out) !== results && !options.out.startsWith(os.tmpdir()) && !options.out.startsWith('/private/tmp/')) {
    throw new Error('--out måste ligga direkt i work/pilot/results eller i en temporär katalog');
  }
  options.subset = options.cases.length > 0;
  options.cases = options.subset ? REQUIRED_CASES.filter((name) => options.cases.includes(name)) : [...REQUIRED_CASES];
  return options;
}

/** Totalstatus: PASS kräver att exakt hela falluppsättningen körts och passerat. */
export function overallStatus(results, { subset = false } = {}) {
  const byName = new Map(results.map((item) => [item.name, item]));
  if (results.some((item) => item.status === 'FAIL')) return 'FAIL';
  if (results.some((item) => item.status === 'BLOCKED')) return 'BLOCKED';
  if (results.some((item) => item.status !== 'PASS' || !Array.isArray(item.checks) || item.checks.length < 2 || item.checks.some((c) => c.ok !== true))) return 'FAIL';
  if (subset) return 'PARTIAL';
  if (REQUIRED_CASES.some((name) => !byName.has(name))) return 'FAIL';
  return 'PASS';
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`REFUSED: ${error.message}`); process.exit(1); }
  let manifest;
  try { manifest = await assertTarget('protected'); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
  }

  const proof = {
    issuer: manifest.idp?.issuer, clientId: manifest.idp?.clientId, audience: [manifest.idp?.clientId],
    profileId: 'local-keycloak-admin', profileVersion: 1, acr: '2', amr: ['pwd', 'otp'],
  };
  const results = [];
  const sessions = new Set();
  const correlations = [];
  let server = null;
  let serverErrors = '';
  let baseUrl = options.baseUrl;
  let pgpassPath = null;
  let sourceReport = null;
  let today = null;

  const revision = () => {
    try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); }
    catch { return 'okänd'; }
  };
  const makePgpass = () => {
    if (pgpassPath) return pgpassPath;
    const url = new URL(manifest.dbUrl);
    pgpassPath = path.join(os.tmpdir(), `.skolplattform-mandates-pgpass-${process.pid}`);
    const escaped = decodeURIComponent(url.password).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
    fs.writeFileSync(pgpassPath, `${url.hostname}:${url.port}:${url.pathname.slice(1)}:${decodeURIComponent(url.username)}:${escaped}\n`, { mode: 0o600, flag: 'wx' });
    return pgpassPath;
  };
  const psqlArgs = (vars) => {
    const url = new URL(manifest.dbUrl);
    const args = ['-h', url.hostname, '-p', url.port, '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1), '-Atq', '-v', 'ON_ERROR_STOP=1'];
    for (const [key, value] of Object.entries(vars)) args.push('-v', `${key}=${value ?? ''}`);
    return [...args, '-f', '-'];
  };
  const psql = (sql, vars = {}) => execFileSync('psql', psqlArgs(vars), {
    cwd: root, env: { ...process.env, PGPASSFILE: makePgpass() }, input: sql, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim();
  // Kör SQL och returnerar 'ok' eller SQLSTATE. Felets fria text sparas aldrig.
  const sqlState = (sql, vars = {}) => {
    const run = spawnSync('psql', psqlArgs(vars), {
      cwd: root, env: { ...process.env, PGPASSFILE: makePgpass() }, input: `\\set VERBOSITY sqlstate\n${sql}`, encoding: 'utf8',
    });
    if (run.status === 0) return 'ok';
    return /ERROR:\s+([0-9A-Z]{5})/u.exec(run.stderr ?? '')?.[1] ?? 'unknown';
  };
  const workerSql = (sql, ctx = null, vars = {}) => sqlState(`begin; set local role skolplattform_worker;
    ${ctx ? `select set_config('app.phase','',true), set_config('app.identity_id',:'ctx_identity',true), set_config('app.customer_id',:'ctx_customer',true),
      set_config('app.membership_id',:'ctx_membership',true), set_config('app.assignment_id',:'ctx_assignment',true),
      set_config('app.access_function',:'ctx_function',true), set_config('app.organizer_id',:'ctx_organizer',true);` : ''}
    ${sql};
    rollback;`, { ...vars, ...(ctx ? { ctx_identity: ctx.identity, ctx_customer: C1, ctx_membership: ctx.membership, ctx_assignment: ctx.assignmentId, ctx_function: ctx.fn, ctx_organizer: ORG1 } : {}) });

  const mint = async ({ identityId, membershipId = null, assignmentId = null }) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest('hex');
    const row = psql(`insert into public.app_sessions
      (token_hash, identity_id, membership_id, assignment_id, acr, amr, auth_time,
       proof_issuer, proof_client_id, proof_audience, proof_profile_id,
       proof_profile_version, proof_checked_at, expires_at, absolute_expires_at)
      values (decode(:'hash','hex'), :'identity'::uuid, nullif(:'membership','')::uuid,
        nullif(:'assignment','')::uuid, :'acr', string_to_array(:'amr', ','), now(),
        :'issuer', :'client', string_to_array(:'audience', ','), :'profile', :'version'::int, now(),
        now() + interval '15 minutes', now() + interval '8 hours')
      returning id::text, context_epoch::text;`, {
      hash, identity: identityId, membership: membershipId, assignment: assignmentId, acr: proof.acr, amr: proof.amr.join(','),
      issuer: proof.issuer, client: proof.clientId, audience: proof.audience.join(','), profile: proof.profileId, version: proof.profileVersion,
    });
    const [sessionId, epochRaw] = row.split('|');
    sessions.add(sessionId);
    return { token, sessionId, epoch: Number(epochRaw) };
  };

  const call = async (session, method, route, body, headers = {}) => {
    // Fas 4 har explicita läsårs- och urvalskontrakt. Välj skola från det
    // faktiskt utfärdade mandatet; frågesträngens elev/ärende är enbart objektval.
    if (method === 'GET' && route.startsWith('/api/elever/')) {
      const url = new URL(route, 'http://127.0.0.1');
      const registerPath = url.pathname;
      if (['/api/elever/lista', '/api/elever/elev', '/api/elever/export'].includes(registerPath)) {
        const schoolYear = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
        const assignment = typeof session === 'string' ? null : psql("select assignment_id::text from public.app_sessions where id=:'id'::uuid", { id: session.sessionId });
        const units = assignment ? psql("select coalesce(string_agg(unit_id::text,',' order by unit_id),'') from public.mandate_units where assignment_id=:'id'::uuid", { id: assignment }).split(',').filter(Boolean) : [];
        const unitId = units.includes(U11) ? U11 : units[0] ?? U11;
        const selection = { schoolYear, unitId, classId: null, educationId: null, grade: null, status: null, page: 1 };
        const caseId = url.searchParams.get('arende');
        if (registerPath === '/api/elever/elev' || url.searchParams.has('elev')) {
          const pupilId = url.searchParams.get('elev');
          url.searchParams.delete('elev'); url.searchParams.delete('arende');
          url.searchParams.set('pupilId', pupilId ?? ''); url.searchParams.set('schoolYear', String(schoolYear));
          if (caseId) url.searchParams.set('caseId', caseId);
          route = `${registerPath === '/api/elever/lista' ? '/api/elever/elev' : registerPath}${url.search}`;
        } else if (registerPath === '/api/elever/lista') {
          route = registerPath; method = 'POST';
          body = { selection, search: 'Syntetisk elev', caseId };
        } else {
          route = registerPath; method = 'POST';
          body = { mode: 'download', export: { schoolYear, caseId: null, fields: ['id', 'displayName'], protectedIds: [], includePersonalNumber: false,
            mode: 'filter', selection, search: 'Syntetisk elev' } };
        }
      }
    }
    const token = typeof session === 'string' ? session : session.token;
    const requestHeaders = new Headers(headers);
    requestHeaders.set('Cookie', `sp_session=${token}`);
    if (!requestHeaders.has('Sec-Fetch-Site')) requestHeaders.set('Sec-Fetch-Site', 'same-origin');
    if (typeof session !== 'string' && Number.isInteger(session.epoch) && !requestHeaders.has('X-Context-Epoch')) requestHeaders.set('X-Context-Epoch', String(session.epoch));
    if (body !== undefined) requestHeaders.set('Content-Type', 'application/json');
    const init = { method, headers: requestHeaders };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(`${baseUrl}${route}`, init);
    const text = await response.text();
    let parsed = text;
    try { parsed = text ? JSON.parse(text) : null; } catch { /* CSV/text */ }
    const epochHeader = response.headers.get('X-Context-Epoch');
    const epoch = epochHeader === null ? null : Number(epochHeader);
    if (typeof session !== 'string' && Number.isInteger(epoch)) session.epoch = epoch;
    const result = { status: response.status, body: parsed, text, headers: Object.fromEntries(response.headers) };
    if (result.headers['x-correlation-id']) correlations.push(result.headers['x-correlation-id']);
    return result;
  };

  const corr = (response) => response.headers['x-correlation-id'];
  const events = (response) => psql(`select coalesce(string_agg(action||'|'||outcome||'|'||coalesce(details->>'code','')||'|'||coalesce(details->>'count','')||'|'||coalesce(details->>'readForm',''), ',' order by id),'')
    from public.security_events where correlation_id=:'corr'::uuid`, { corr: corr(response) ?? '00000000-0000-4000-8000-000000000000' });
  const leaks = (...responses) => responses.map((response) => response.text ?? '').join(' ');
  const hasName = (...responses) => NAME_MARKERS.some((marker) => leaks(...responses).includes(marker));
  const equalShape = (a, b) => a?.status === b?.status && a?.body?.code === b?.body?.code
    && JSON.stringify(Object.keys(a?.body ?? {}).sort()) === JSON.stringify(Object.keys(b?.body ?? {}).sort());
  const check = (list, name, ok, detail) => { list.push({ check: name, ok: Boolean(ok), detail: String(detail).slice(0, 300) }); };
  const pupilIds = (response) => JSON.stringify((response.body?.pupils ?? []).map((p) => p.id).sort());
  const withoutAudit = async (fn) => {
    psql('revoke insert on public.security_events from skolplattform_worker');
    try { return await fn(); }
    finally { psql('grant insert on public.security_events to skolplattform_worker'); }
  };

  const createPerson = (name = 'Syntetisk personal', customer = C1) => {
    const identity = crypto.randomUUID(), membership = crypto.randomUUID();
    psql(`insert into public.identities(id,issuer,subject,display_name) values(:'identity'::uuid,'https://phase3.example.test',:'identity',:'name');
      insert into public.memberships(id,identity_id,customer_id) values(:'member'::uuid,:'identity'::uuid,:'customer'::uuid)`, { identity, member: membership, customer, name });
    return { identity, membership };
  };
  const mandateCount = (membership) => psql("select count(*) from public.access_assignments where membership_id=:'id'::uuid", { id: membership });
  const hm = () => mint({ identityId: HM1.identity, membershipId: HM1.membership, assignmentId: HM1.assignment });
  const base = (units = [U11]) => ({ unitIds: units, scopeKind: 'school', validFrom: today });
  const actor = async (person, assignmentId, fn) => ({ ...person, assignmentId, fn, session: await mint({ identityId: person.identity, membershipId: person.membership, assignmentId }) });
  const appointRector = async (units = [U11], hmSession = null) => {
    const person = createPerson('Syntetisk rektor');
    const response = await call(hmSession ?? await hm(), 'POST', '/api/kund/rektor', { ...base(units), membershipId: person.membership, function: 'rektor' });
    if (response.status !== 201) throw new Error(`rektorsutnämning HTTP ${response.status}/${response.body?.code}`);
    return { ...(await actor(person, response.body.assignmentId, 'rektor')), response };
  };
  const grant = async (granter, body, units = [U11]) => {
    const person = createPerson();
    const response = await call(granter.session, 'POST', '/api/kund/mandat', { ...base(units), membershipId: person.membership, ...body });
    if (response.status !== 201) throw new Error(`${body.function}: HTTP ${response.status}/${response.body?.code}`);
    return { ...(await actor(person, response.body.assignmentId, body.function)), response };
  };
  // Rotmandat som saknar publik tilldelningsväg (IT, elevhälsoansvarig, kundadmin, granskare).
  const insertRoot = async (fn, units = null, customer = C1) => {
    const person = createPerson('Syntetisk personal', customer);
    const id = crypto.randomUUID();
    if (units) {
      psql(`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(:'id'::uuid,:'member'::uuid,:'customer'::uuid,:'organizer'::uuid,:'fn','synthetic-v1','school');
        insert into public.mandate_units select :'id'::uuid,:'customer'::uuid,:'organizer'::uuid,u::uuid from unnest(string_to_array(:'units',',')) u`, { id, member: person.membership, customer, organizer: ORG1, fn, units: units.join(',') });
    } else {
      psql("insert into public.access_assignments(id,membership_id,customer_id,function) values(:'id'::uuid,:'member'::uuid,:'customer'::uuid,:'fn')", { id, member: person.membership, customer, fn });
    }
    return actor(person, id, fn);
  };
  const setSupportWindow = (assignmentId, startsSql, endsSql) => psql(`update public.access_assignments set starts_at=${startsSql}, ends_at=${endsSql} where id=:'id'::uuid`, { id: assignmentId });

  // ---- Källprov för direktvägar (Kong/Storage/Postgres) -------------------------------------------
  let collectModule = null, auditSourceModule = null;
  const kongProbe = async (method, endpoint, body, route, extraHeaders = {}) => {
    const init = {
      method,
      headers: {
        apikey: manifest.anonKey, Authorization: `Bearer ${manifest.anonKey}`, 'X-Client-Trace-Id': 'f'.repeat(32), Connection: 'close',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...extraHeaders,
      },
    };
    if (body !== undefined) init.body = JSON.stringify(body);
    const response = await fetch(new URL(endpoint, manifest.apiUrl), init);
    const text = await response.text();
    return { route, status: response.status, requestId: response.headers.get('x-phase3-audit-id'), contentRange: response.headers.get('content-range'), text };
  };
  const correlateKongProbes = async (probes, since) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    const current = await auditSourceModule.sources();
    const raw = spawnSync('docker', ['logs', '--since', since, current.kong.id], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
    if (raw.status !== 0) throw new Error('BLOCKED: Kong-källan kunde inte läsas');
    const parsed = collectModule.collectKong(`${raw.stdout}\n${raw.stderr}`, current.kong.id);
    return collectModule.correlateKong(probes, parsed.events, current.kong.id);
  };
  const ensureSources = async () => {
    if (sourceReport) return sourceReport;
    collectModule = await import('./collect-denials.mjs');
    auditSourceModule = await import('./configure-audit-source.mjs');
    try {
      sourceReport = await collectModule.report({ probe: true, outageSources: ['kong', 'storage', 'db'] });
    } catch {
      sourceReport = { status: 'BLOCKED', probes: [], outages: [], events: [], blockers: ['source-collection-unavailable'] };
    }
    const denialsOut = path.join(root, 'work/pilot/results/phase4-denials-regression.json');
    if (!options.subset) fs.writeFileSync(denialsOut, `${JSON.stringify(sourceReport, null, 2)}\n`, { mode: 0o600 });
    return sourceReport;
  };
  const probeFrom = (id) => sourceReport?.probes?.find((p) => p.id === id);

  // ---- Fall ----------------------------------------------------------------------------------------
  const cases = {
    async 'principal-chain'(checks) {
      const h = await hm();
      const rector = await appointRector([U11], h);
      check(checks, 'huvudman utser rektor och händelsen committas med samma korrelation', events(rector.response) === 'principal_appointed|ok|||', events(rector.response));
      const other = createPerson();
      const byRector = await call(rector.session, 'POST', '/api/kund/rektor', { ...base(), membershipId: other.membership, function: 'rektor' });
      const selfAppoint = await call(rector.session, 'POST', '/api/kund/rektor', { ...base(), membershipId: rector.membership, function: 'rektor' });
      const admin = await insertRoot('kundadmin');
      const byAdmin = await call(admin.session, 'POST', '/api/kund/rektor', { ...base(), membershipId: other.membership, function: 'rektor' });
      check(checks, 'rektor och kundadmin kan inte utse rektor (inte heller sig själv)', byRector.status === 403 && selfAppoint.status === 403 && byAdmin.status === 403 && mandateCount(other.membership) === '0', `${byRector.status}/${selfAppoint.status}/${byAdmin.status}`);
      check(checks, 'nekad utnämning loggas som nekande', events(byRector) === 'principal_appointed|denied|forbidden||' && events(byAdmin) === 'principal_appointed|denied|forbidden||', `${events(byRector)} ; ${events(byAdmin)}`);
      const foreignUnit = await call(h, 'POST', '/api/kund/rektor', { ...base([U21]), membershipId: other.membership, function: 'rektor' });
      check(checks, 'huvudman kan inte utse rektor för annan huvudmans skola', [403, 404].includes(foreignUnit.status) && mandateCount(other.membership) === '0', `HTTP ${foreignUnit.status}`);
      const teacherBody = { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] };
      const teacher = await grant(rector, teacherBody);
      check(checks, 'rektor ger läraruppdrag inom egen skola med committad händelse', events(teacher.response) === 'mandate_granted|ok|||', events(teacher.response));
      const target = createPerson();
      const outside = await call(rector.session, 'POST', '/api/kund/mandat', { ...base([U12]), membershipId: target.membership, function: 'larare', scopeKind: 'group', groups: [{ id: G12, kind: 'teaching' }] });
      const byHm = await call(h, 'POST', '/api/kund/mandat', { ...base(), membershipId: target.membership, ...teacherBody });
      check(checks, 'rektor utanför egen skola och huvudman som lärartilldelare nekas', outside.status === 403 && byHm.status === 403 && mandateCount(target.membership) === '0', `${outside.status}/${byHm.status}`);
      const rpcAsRector = workerSql(`select public.phase3_grant_mandate(jsonb_build_object('membershipId',:'m','function','rektor','unitIds',jsonb_build_array(:'u'),'scopeKind','school','validFrom',public.app_today()::text))`, rector, { m: target.membership, u: U11 });
      const legacy = workerSql("select public.appoint_school_principal(:'u'::uuid, :'m'::uuid, 'x')", rector, { u: U11, m: target.membership });
      const directInsert = workerSql("insert into public.access_assignments(membership_id,customer_id,function) values(:'m'::uuid,:'c'::uuid,'rektor')", rector, { m: target.membership, c: C1 });
      check(checks, 'direkt RPC som rektor ger samma nekande som API (42501)', rpcAsRector === '42501', rpcAsRector);
      check(checks, 'gammal utnämningsväg och direkt INSERT är stängda för Workern', legacy === '42501' && directInsert === '42501' && mandateCount(target.membership) === '0', `${legacy}/${directInsert}`);
      const ended = await call(rector.session, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: teacher.assignmentId });
      const after = await call(teacher.session, 'GET', '/api/session');
      check(checks, 'rektor avslutar läraruppdraget omedelbart', ended.status === 200 && after.body?.context?.valid === false && events(ended) === 'assignment_ended|ok|||', `avslut ${ended.status}`);
    },

    async 'teacher-group'(checks) {
      const rector = await appointRector([U11, U12]);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const mentor = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G12, kind: 'mentor' }] }, [U12]);
      const list = await call(teacher.session, 'GET', '/api/elever/lista');
      check(checks, 'undervisningslärare ser bara egen grupp, inte annan grupp i samma skola', list.status === 200 && pupilIds(list) === JSON.stringify([P11]) && !leaks(list).includes(P19), pupilIds(list));
      check(checks, 'explicit registerfältlista och egen klass', list.body?.pupils?.every((p) =>
        Object.keys(p).every((field) => REGISTER_ROW_FIELDS.has(field)) && !Object.hasOwn(p, 'personalNumber')) &&
        list.body?.pupils?.[0]?.classId === G11, 'fält kontrollerade');
      check(checks, 'listningen har committad händelse', events(list) === 'pupil_list_read|ok||1|', events(list));
      const sameSchool = await call(teacher.session, 'GET', `/api/elever/elev?elev=${P19}`);
      const otherSchool = await call(teacher.session, 'GET', `/api/elever/elev?elev=${P12}`);
      const unknown = await call(teacher.session, 'GET', `/api/elever/elev?elev=${crypto.randomUUID()}`);
      check(checks, 'elev i annan grupp, annan skola och okänd ger samma 404 utan innehåll', sameSchool.status === 404 && equalShape(sameSchool, otherSchool) && equalShape(sameSchool, unknown) && !hasName(sameSchool, otherSchool, unknown), `${sameSchool.status}/${otherSchool.status}/${unknown.status}`);
      check(checks, 'nekade läsningar loggas', events(sameSchool) === 'pupil_read|denied|not_found||', events(sameSchool));
      const mentorList = await call(mentor.session, 'GET', '/api/elever/lista');
      check(checks, 'mentor ser bara sin mentorsgrupp', mentorList.status === 200 && pupilIds(mentorList) === JSON.stringify([P12]), pupilIds(mentorList));
      const exported = await call(teacher.session, 'GET', '/api/elever/export');
      const granted = await call(teacher.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      check(checks, 'lärare saknar export och tilldelning', exported.status === 403 && granted.status === 403 && !exported.headers['content-type']?.includes('text/csv'), `${exported.status}/${granted.status}`);
    },

    async 'school-admin'(checks) {
      const rector = await appointRector([U11]);
      const admin = await grant(rector, { function: 'administrator' });
      const list = await call(admin.session, 'GET', '/api/elever/lista');
      check(checks, 'skoladministratör ser hela egna skolan men inte andra skolor', list.status === 200 && pupilIds(list) === JSON.stringify([P11, P19].sort()), pupilIds(list));
      const other = await call(admin.session, 'GET', `/api/elever/elev?elev=${P12}`);
      const foreign = await call(admin.session, 'GET', `/api/elever/elev?elev=${P21}`);
      check(checks, 'annan skola och annan kund ger samma 404', other.status === 404 && equalShape(other, foreign) && !hasName(other, foreign), `${other.status}/${foreign.status}`);
      const exported = await call(admin.session, 'GET', '/api/elever/export');
      const csv = typeof exported.body === 'string' ? exported.body : '';
      check(checks, 'export innehåller endast egen skola och är no-store', exported.status === 200 && csv.includes(P11) && csv.includes(P19) && !csv.includes(P12) && !csv.includes(P21) && exported.headers['cache-control'] === 'no-store', `HTTP ${exported.status}`);
      check(checks, 'exporten har committad händelse med antal', events(exported) === 'pupil_exported|ok||2|', events(exported));
      const grantTry = await call(admin.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const connection = await call(admin.session, 'PATCH', '/api/kund/anslutning', { unitId: U11, enabled: true, expectedVersion: 0 });
      check(checks, 'skoladministratör kan inte tilldela eller ändra anslutning', grantTry.status === 403 && connection.status === 403, `${grantTry.status}/${connection.status}`);
    },

    async 'health-school'(checks) {
      const rector = await appointRector([U11]);
      const health = await grant(rector, { function: 'elevhalsa' });
      const list = await call(health.session, 'GET', '/api/elever/lista');
      check(checks, 'elevhälsa med skolscope ser egna skolans elever', list.status === 200 && pupilIds(list) === JSON.stringify([P11, P19].sort()) && events(list) === 'pupil_list_read|ok||2|', `${pupilIds(list)}; ${events(list)}`);
      const other = await call(health.session, 'GET', `/api/elever/elev?elev=${P12}`);
      check(checks, 'annan skola nekas', other.status === 404 && !hasName(other), `HTTP ${other.status}`);
      const exported = await call(health.session, 'GET', '/api/elever/export');
      const delegate = await call(health.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'elevhalsa' });
      check(checks, 'elevhälsa saknar export och delegering', exported.status === 403 && delegate.status === 403, `${exported.status}/${delegate.status}`);
      const lead = await insertRoot('elevhalsoansvarig', [U11]);
      const leadGrant = await call(lead.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'elevhalsa' });
      const leadOutside = await call(lead.session, 'POST', '/api/kund/mandat', { ...base([U12]), membershipId: createPerson().membership, function: 'elevhalsa' });
      const leadRead = await call(lead.session, 'GET', '/api/elever/lista');
      check(checks, 'elevhälsoansvarig tilldelar bara inom sina skolor och har ingen egen elevläsning', leadGrant.status === 201 && leadOutside.status === 403 && leadRead.status === 403, `${leadGrant.status}/${leadOutside.status}/${leadRead.status}`);
    },

    async 'health-pupil'(checks) {
      const rector = await appointRector([U11]);
      const health = await grant(rector, { function: 'elevhalsa', scopeKind: 'pupil', pupilIds: [P11] });
      const list = await call(health.session, 'GET', '/api/elever/lista');
      check(checks, 'elevscope ger exakt tilldelad elev, inte övriga i skolan', list.status === 200 && pupilIds(list) === JSON.stringify([P11]), pupilIds(list));
      const own = await call(health.session, 'GET', `/api/elever/elev?elev=${P11}`);
      const sameSchool = await call(health.session, 'GET', `/api/elever/elev?elev=${P19}`);
      const unknown = await call(health.session, 'GET', `/api/elever/elev?elev=${crypto.randomUUID()}`);
      check(checks, 'tilldelad elev läses med committad händelse', own.status === 200 && events(own) === 'pupil_read|ok|||', events(own));
      check(checks, 'otilldelad elev i samma skola ger samma 404 som okänd', sameSchool.status === 404 && equalShape(sameSchool, unknown) && !hasName(sameSchool, unknown), `${sameSchool.status}/${unknown.status}`);
      const outsideGrant = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'elevhalsa', scopeKind: 'pupil', pupilIds: [P12] });
      check(checks, 'rektor kan inte ge elevscope för elev i annan skola', [403, 404].includes(outsideGrant.status), `HTTP ${outsideGrant.status}`);
    },

    async 'health-case'(checks) {
      const rector = await appointRector([U11]);
      const health = await grant(rector, { function: 'elevhalsa', scopeKind: 'case', caseIds: [K11] });
      const list = await call(health.session, 'GET', '/api/elever/lista');
      check(checks, 'ärendescope ger ingen lista utan valt ärende', list.status === 200 && list.body?.pupils?.length === 0 && JSON.stringify(list.body?.scope?.cases?.map((c) => c.id)) === JSON.stringify([K11]), `HTTP ${list.status}`);
      const own = await call(health.session, 'GET', `/api/elever/lista?arende=${K11}`);
      check(checks, 'exakt ärende ger ärendets elev med committad händelse', own.status === 200 && pupilIds(own) === JSON.stringify([P11]) && events(own) === 'pupil_list_read|ok||1|', events(own));
      const sameSchool = await call(health.session, 'GET', `/api/elever/lista?arende=${K19}`);
      const otherSchool = await call(health.session, 'GET', `/api/elever/lista?arende=${K12}`);
      const foreign = await call(health.session, 'GET', `/api/elever/lista?arende=${K21}`);
      const mismatch = await call(health.session, 'GET', `/api/elever/lista?arende=${K11}&elev=${P19}`);
      check(checks, 'annat ärende ger samma tomma registerlista och fel elev nekas utan innehåll',
        [sameSchool, otherSchool, foreign].every((r) => r.status === 200 && r.body?.count === 0 && r.body?.pupils?.length === 0 && events(r) === 'pupil_list_read|ok||0|') &&
        mismatch.status === 404 && !hasName(sameSchool, otherSchool, foreign, mismatch),
        [sameSchool, otherSchool, foreign, mismatch].map((r) => r.status).join('/'));
      const byPupil = await call(health.session, 'GET', `/api/elever/elev?elev=${P11}`);
      check(checks, 'ärendescope ger inte direkt elevläsning utan ärende', byPupil.status === 404 && !hasName(byPupil), `HTTP ${byPupil.status}`);
    },

    async 'support-boundary'(checks) {
      const rector = await appointRector([U11]);
      const now = Date.now();
      const supportBody = { function: 'support', scopeKind: 'pupil', pupilIds: [P11], purposeCode: 'synthetic-troubleshooting', startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 20 * 60_000).toISOString() };
      const noPurpose = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, ...supportBody, purposeCode: null });
      const tooLong = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, ...supportBody, endsAt: new Date(now + 2 * 3600_000).toISOString() });
      const twoSchools = await call(rector.session, 'POST', '/api/kund/mandat', { ...base([U11, U12]), membershipId: createPerson().membership, ...supportBody });
      check(checks, 'support kräver syfte, högst 60 minuter och exakt en skola', noPurpose.status === 400 && tooLong.status === 400 && [400, 403].includes(twoSchools.status), `${noPurpose.status}/${tooLong.status}/${twoSchools.status}`);
      const lead = await insertRoot('elevhalsoansvarig', [U11]);
      const byLead = await call(lead.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, ...supportBody });
      const byHm = await call(await hm(), 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, ...supportBody });
      check(checks, 'endast rektor godkänner support', byLead.status === 403 && byHm.status === 403, `${byLead.status}/${byHm.status}`);
      const support = await grant(rector, supportBody);
      const approver = psql("select coalesce(approved_by_assignment_id::text,'') from public.access_assignments where id=:'id'::uuid", { id: support.assignmentId });
      check(checks, 'servern sätter rektorn som godkännare', approver === rector.assignmentId, 'godkännare från serverns mandat');
      setSupportWindow(support.assignmentId, "clock_timestamp()+interval '5 minutes'", "clock_timestamp()+interval '20 minutes'");
      const before = await call(support.session, 'GET', '/api/elever/lista');
      check(checks, 'före start: nekad utan innehåll', before.status === 403 && !hasName(before) && events(before).startsWith('pupil_list_read|denied|'), `${before.status}/${before.body?.code}`);
      setSupportWindow(support.assignmentId, "clock_timestamp()-interval '1 second'", "clock_timestamp()+interval '10 minutes'");
      const during = await call(support.session, 'GET', '/api/elever/lista');
      const supportSelection = await call(support.session, 'GET', '/api/elever/urval');
      check(checks, 'under giltig tid: en elev med godkännare, syfte och sluttid', during.status === 200 && pupilIds(during) === JSON.stringify([P11]) &&
        supportSelection.status === 200 && supportSelection.body?.purposeCode === 'synthetic-troubleshooting' &&
        Boolean(supportSelection.body?.endsAt) && Boolean(supportSelection.body?.approverName) &&
        events(during) === 'pupil_list_read|ok||1|', events(during));
      const exported = await call(support.session, 'GET', '/api/elever/export');
      const delegate = await call(support.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'elevhalsa' });
      const itCall = await call(support.session, 'PATCH', '/api/kund/anslutning', { unitId: U11, enabled: true, expectedVersion: 0 });
      check(checks, 'support har inget export-, delegerings- eller skrivmandat', exported.status === 403 && delegate.status === 403 && itCall.status === 403, `${exported.status}/${delegate.status}/${itCall.status}`);
      setSupportWindow(support.assignmentId, "clock_timestamp()-interval '10 minutes'", 'clock_timestamp()');
      const atEnd = await call(support.session, 'GET', '/api/elever/lista');
      setSupportWindow(support.assignmentId, "clock_timestamp()-interval '10 minutes'", "clock_timestamp()-interval '1 second'");
      const after = await call(support.session, 'GET', '/api/elever/lista');
      const session = await call(support.session, 'GET', '/api/session');
      check(checks, 'vid och efter sluttid (halvöppet intervall): nekad utan innehåll', atEnd.status === 403 && after.status === 403 && !hasName(atEnd, after) && session.body?.context?.valid === false, `${atEnd.status}/${after.status}`);
    },

    // Användarbeslut 2026-09-27: support kan gälla en namngiven elev ELLER en eller
    // flera grupper på EN skola. Övriga villkor är desamma som för elevsupport.
    async 'support-groups'(checks) {
      const rector = await appointRector([U11]);
      const rectorBoth = await appointRector([U11, U12]);
      const now = Date.now();
      const one = { function: 'support', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }], purposeCode: 'synthetic-troubleshooting', startsAt: new Date(now - 1000).toISOString(), endsAt: new Date(now + 20 * 60_000).toISOString() };
      const attempt = (granter, body, units = [U11]) => call(granter.session, 'POST', '/api/kund/mandat', { ...base(units), membershipId: createPerson().membership, ...one, ...body });
      const mixed = await attempt(rector, { pupilIds: [P11] });
      const empty = await attempt(rector, { groups: [] });
      const tooLong = await attempt(rector, { endsAt: new Date(now + 2 * 3600_000).toISOString() });
      const noPurpose = await attempt(rector, { purposeCode: null });
      const twoSchools = await attempt(rectorBoth, { groups: [{ id: G11, kind: 'teaching' }, { id: G12, kind: 'teaching' }] }, [U11, U12]);
      const statuses = [mixed, empty, tooLong, noPurpose, twoSchools].map((r) => r.status);
      check(checks, 'gruppsupport kräver grupper utan elev, syfte, högst 60 minuter och en enda skola', statuses.every((status) => [400, 403].includes(status)) && tooLong.status === 400 && noPurpose.status === 400, statuses.join('/'));
      const oneSchool = await attempt(rectorBoth, { groups: [{ id: G12, kind: 'teaching' }] }, [U12]);
      check(checks, 'rektor med två skolor kan ge gruppsupport på en av dem', oneSchool.status === 201, `HTTP ${oneSchool.status}`);
      const lead = await insertRoot('elevhalsoansvarig', [U11]);
      const byLead = await attempt(lead, {});
      const byHm = await call(await hm(), 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, ...one });
      check(checks, 'endast rektor godkänner gruppsupport', byLead.status === 403 && byHm.status === 403, `${byLead.status}/${byHm.status}`);

      const support = await grant(rector, one);
      const approver = psql("select coalesce(approved_by_assignment_id::text,'') from public.access_assignments where id=:'id'::uuid", { id: support.assignmentId });
      check(checks, 'servern sätter rektorn som godkännare för gruppsupport', approver === rector.assignmentId, 'godkännare från serverns mandat');
      const during = await call(support.session, 'GET', '/api/elever/lista');
      const supportSelection = await call(support.session, 'GET', '/api/elever/urval');
      const scopeGroups = JSON.stringify((during.body?.scope?.groups ?? []).map((group) => group.id));
      check(checks, 'gruppsupport ser endast elever i gruppen, med godkännare, syfte och sluttid', during.status === 200 && pupilIds(during) === JSON.stringify([P11]) &&
        !leaks(during).includes(P19) && scopeGroups === JSON.stringify([G11]) && supportSelection.status === 200 &&
        supportSelection.body?.purposeCode === 'synthetic-troubleshooting' && Boolean(supportSelection.body?.endsAt) &&
        Boolean(supportSelection.body?.approverName) && events(during) === 'pupil_list_read|ok||1|', `${pupilIds(during)}; ${events(during)}`);
      const sameSchool = await call(support.session, 'GET', `/api/elever/elev?elev=${P19}`);
      const otherSchool = await call(support.session, 'GET', `/api/elever/elev?elev=${P12}`);
      check(checks, 'elev utanför gruppen (samma och annan skola) nekas utan innehåll', sameSchool.status === 404 && otherSchool.status === 404 && !hasName(sameSchool, otherSchool), `${sameSchool.status}/${otherSchool.status}`);
      const exported = await call(support.session, 'GET', '/api/elever/export');
      const delegate = await call(support.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'elevhalsa' });
      check(checks, 'gruppsupport har inget export- eller delegeringsmandat', exported.status === 403 && delegate.status === 403, `${exported.status}/${delegate.status}`);

      const both = await grant(rector, { ...one, groups: [{ id: G11, kind: 'teaching' }, { id: G19, kind: 'teaching' }] });
      const bothList = await call(both.session, 'GET', '/api/elever/lista');
      check(checks, 'support för två grupper på samma skola ser elever i båda', bothList.status === 200 && pupilIds(bothList) === JSON.stringify([P11, P19].sort()), pupilIds(bothList));

      setSupportWindow(support.assignmentId, "clock_timestamp()-interval '10 minutes'", 'clock_timestamp()');
      const atEnd = await call(support.session, 'GET', '/api/elever/lista');
      setSupportWindow(support.assignmentId, "clock_timestamp()-interval '10 minutes'", "clock_timestamp()-interval '1 second'");
      const after = await call(support.session, 'GET', '/api/elever/lista');
      check(checks, 'gruppsupport vid och efter sluttid: nekad utan innehåll', atEnd.status === 403 && after.status === 403 && !hasName(atEnd, after), `${atEnd.status}/${after.status}`);
    },

    async 'it-admin'(checks) {
      const it = await insertRoot('it', [U11]);
      const schools = await call(it.session, 'GET', '/api/kund/anslutning');
      check(checks, 'IT ser bara sina skolor', schools.status === 200 && JSON.stringify((schools.body?.schools ?? []).map((s) => s.unitId ?? s.id)) === JSON.stringify([U11]), `HTTP ${schools.status}`);
      const current = await call(it.session, 'GET', `/api/kund/anslutning?unitId=${U11}`);
      const version = current.body?.version;
      const changed = await call(it.session, 'PATCH', '/api/kund/anslutning', { unitId: U11, enabled: !current.body?.enabled, expectedVersion: version });
      const conflict = await call(it.session, 'PATCH', '/api/kund/anslutning', { unitId: U11, enabled: Boolean(current.body?.enabled), expectedVersion: version });
      const tested = await call(it.session, 'POST', '/api/kund/anslutning', { unitId: U11, action: 'test' });
      check(checks, 'IT pausar/aktiverar och provar lokal anslutning', current.status === 200 && changed.status === 200 && ['synthetic_ok', 'paused'].includes(tested.body?.result), `${current.status}/${changed.status}/${tested.body?.result}`);
      check(checks, 'ändring och prov har committade händelser', events(changed) === 'connection_update|ok|||' && events(tested) === 'connection_test|ok|||', `${events(changed)} ; ${events(tested)}`);
      check(checks, 'gammal version ger 409 utan överskrivning', conflict.status === 409 && events(conflict) === 'connection_update|denied|conflict||', `${conflict.status}; ${events(conflict)}`);
      const restored = await call(it.session, 'PATCH', '/api/kund/anslutning', { unitId: U11, enabled: Boolean(current.body?.enabled), expectedVersion: changed.body?.version });
      const other = await call(it.session, 'GET', `/api/kund/anslutning?unitId=${U12}`);
      const foreign = await call(it.session, 'GET', `/api/kund/anslutning?unitId=${U21}`);
      const unknown = await call(it.session, 'GET', `/api/kund/anslutning?unitId=${crypto.randomUUID()}`);
      check(checks, 'annan skola, annan kund och okänd ger samma 404', other.status === 404 && equalShape(other, foreign) && equalShape(other, unknown), `${other.status}/${foreign.status}/${unknown.status}`);
      const read = await call(it.session, 'GET', '/api/elever/lista');
      const exported = await call(it.session, 'GET', '/api/elever/export');
      const delegate = await call(it.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      check(checks, 'IT har ingen elevinsyn, export eller delegering', read.status === 403 && exported.status === 403 && delegate.status === 403 && !hasName(read, exported, current, tested, schools), `${read.status}/${exported.status}/${delegate.status}`);
      check(checks, 'ursprungligt anslutningsläge återställt', restored.status === 200, `HTTP ${restored.status}`);
    },

    async 'self-escalation'(checks) {
      const rector = await appointRector([U11]);
      const selfRector = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: rector.membership, function: 'rektor' });
      const selfTeacher = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: rector.membership, function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const selfSupport = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: rector.membership, function: 'support', scopeKind: 'pupil', pupilIds: [P11], purposeCode: 'synthetic-troubleshooting', startsAt: new Date().toISOString(), endsAt: new Date(Date.now() + 600_000).toISOString() });
      check(checks, 'rektor kan inte ge sig själv nya uppdrag', [selfRector, selfTeacher, selfSupport].every((r) => [400, 403].includes(r.status)) && mandateCount(rector.membership) === '1', [selfRector, selfTeacher, selfSupport].map((r) => r.status).join('/'));
      const widen = await call(rector.session, 'POST', '/api/kund/mandat', { ...base([U11, U12]), membershipId: createPerson().membership, function: 'administrator' });
      check(checks, 'rektor kan inte ge större skolmängd än sin egen', widen.status === 403, `HTTP ${widen.status}`);
      const forged = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }], parentAssignmentId: HM1.assignment });
      const header = await call(rector.session, 'POST', '/api/kund/rektor', { ...base(), membershipId: createPerson().membership, function: 'rektor' }, { 'X-App-Role': 'huvudman', 'X-Access-Function': 'huvudman' });
      check(checks, 'klientangiven överordning och rollhuvud ignoreras', forged.status === 400 && header.status === 403, `${forged.status}/${header.status}`);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const teacherGrant = await call(teacher.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: teacher.membership, function: 'administrator' });
      const switchCtx = await call(teacher.session, 'POST', '/api/context', { assignmentId: rector.assignmentId });
      check(checks, 'lärare kan inte utöka sig eller byta till annans uppdrag', teacherGrant.status === 403 && [403, 404].includes(switchCtx.status) && mandateCount(teacher.membership) === '1', `${teacherGrant.status}/${switchCtx.status}`);
      const lead = await insertRoot('elevhalsoansvarig', [U11]);
      const leadSelf = await call(lead.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: lead.membership, function: 'elevhalsa' });
      check(checks, 'elevhälsoansvarig kan inte ge sig själv elevhälsouppdrag', [400, 403].includes(leadSelf.status) && mandateCount(lead.membership) === '1', `HTTP ${leadSelf.status}`);
      check(checks, 'nekade självutökningar loggas', events(selfTeacher).startsWith('mandate_granted|denied|') && events(widen) === 'mandate_granted|denied|forbidden||', `${events(selfTeacher)} ; ${events(widen)}`);
    },

    async 'parent-revoked'(checks) {
      const h = await hm();
      const rector = await appointRector([U11], h);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const health = await grant(rector, { function: 'elevhalsa', scopeKind: 'pupil', pupilIds: [P11] });
      const before = await call(teacher.session, 'GET', '/api/elever/lista');
      check(checks, 'underordnat uppdrag fungerar före avslut', before.status === 200 && pupilIds(before) === JSON.stringify([P11]), `HTTP ${before.status}`);
      const ended = await call(h, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: rector.assignmentId });
      const teacherAfter = await call(teacher.session, 'GET', '/api/elever/lista');
      const healthAfter = await call(health.session, 'GET', `/api/elever/elev?elev=${P11}`);
      const rectorAfter = await call(rector.session, 'GET', '/api/kund/mandat');
      const childEnded = psql("select count(*) from public.access_assignments where id in (:'a'::uuid,:'b'::uuid) and ended_at is not null", { a: teacher.assignmentId, b: health.assignmentId });
      check(checks, 'huvudmannens avslut av rektor nekar omedelbart underordnade sessioner utan innehåll', ended.status === 200 && teacherAfter.status === 403 && healthAfter.status === 403 && !hasName(teacherAfter, healthAfter), `${ended.status}: ${teacherAfter.status}/${healthAfter.status}`);
      check(checks, 'nekandet kräver inget bakgrundsjobb (underordnade rader är orörda)', childEnded === '0', `avslutade barnrader ${childEnded}`);
      check(checks, 'avslutad rektor nekas själv', rectorAfter.status === 403, `HTTP ${rectorAfter.status}`);
      check(checks, 'nekandena loggas med underordnat uppdrag', psql("select count(*) from public.security_events where correlation_id=:'c'::uuid and outcome='denied' and assignment_id=:'a'::uuid", { c: corr(teacherAfter), a: teacher.assignmentId }) === '1', events(teacherAfter));
      const session = await call(teacher.session, 'GET', '/api/session');
      check(checks, 'sessionen visar kontexten som ogiltig', session.body?.context?.valid === false, `HTTP ${session.status}`);
    },

    async 'invitation-recheck'(checks) {
      const h = await hm();
      const rector = await appointRector([U11], h);
      const mandate = { ...base(), function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] };
      const invite = async (subject) => call(rector.session, 'POST', '/api/kund/inbjudan', { personName: 'Syntetisk inbjuden', expectedIssuer: 'https://phase3.example.test', expectedSubject: subject, mandates: [mandate] });
      const first = createPerson();
      const issued = await invite(first.identity);
      check(checks, 'rektor utfärdar personbunden verksamhetsinbjudan', issued.status === 201 && events(issued).includes('|ok|'), `HTTP ${issued.status}`);
      const redeem = async (person, response) => call(await mint({ identityId: person.identity }), 'POST', '/api/inbjudan/losen', { token: new URL(response.body.link).hash.slice(1) });
      const accepted = await redeem(first, issued);
      const replay = await redeem(first, issued);
      const parent = psql("select coalesce(string_agg(parent_assignment_id::text,','),'') from public.access_assignments where membership_id=:'m'::uuid", { m: first.membership });
      check(checks, 'inlösen ger ett mandat under utfärdaren och kan inte återanvändas', accepted.status === 201 && replay.status === 404 && parent === rector.assignmentId, `${accepted.status}/${replay.status}`);
      const pending = createPerson(), pending2 = createPerson();
      const pendingInvite = await invite(pending.identity);
      const pendingInvite2 = await invite(pending2.identity);
      const ended = await call(h, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: rector.assignmentId });
      const rejected = await redeem(pending, pendingInvite);
      check(checks, 'avslutad utfärdare stoppar inlösen utan nytt mandat', ended.status === 200 && rejected.status === 404 && mandateCount(pending.membership) === '0', `${ended.status}/${rejected.status}`);
      // Ändrat mandat: samma person utses på nytt (nytt uppdrag); gammal inbjudan återupplivas inte.
      const reappointed = await call(h, 'POST', '/api/kund/rektor', { ...base(), membershipId: rector.membership, function: 'rektor' });
      const stillRejected = await redeem(pending2, pendingInvite2);
      check(checks, 'ny rektorsutnämning återupplivar inte inbjudan från det avslutade mandatet', reappointed.status === 201 && stillRejected.status === 404 && mandateCount(pending2.membership) === '0', `${reappointed.status}/${stillRejected.status}`);
      check(checks, 'nekade inlösen loggas', events(rejected) === 'invitation_redeem|denied|invitation_invalid||' && events(stillRejected) === 'invitation_redeem|denied|invitation_invalid||', `${events(rejected)} ; ${events(stillRejected)}`);
    },

    async 'foreign-object'(checks) {
      const rector = await appointRector([U11]);
      const pupilForeign = await call(rector.session, 'GET', `/api/elever/elev?elev=${P21}`);
      const pupilUnknown = await call(rector.session, 'GET', `/api/elever/elev?elev=${crypto.randomUUID()}`);
      check(checks, 'främmande elev ger samma 404 som okänd, utan antal', pupilForeign.status === 404 && equalShape(pupilForeign, pupilUnknown) && !hasName(pupilForeign) && pupilForeign.body?.count === undefined, `${pupilForeign.status}/${pupilUnknown.status}`);
      const endForeign = await call(rector.session, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: HM2.assignment });
      const endUnknown = await call(rector.session, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: crypto.randomUUID() });
      const foreignStill = psql("select (ended_at is null)::text from public.access_assignments where id=:'id'::uuid", { id: HM2.assignment });
      check(checks, 'främmande uppdrag kan inte avslutas och röjs inte', equalShape(endForeign, endUnknown) && [403, 404].includes(endForeign.status) && foreignStill === 'true', `${endForeign.status}/${endUnknown.status}`);
      const grantForeign = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: HM2.membership, function: 'administrator' });
      const grantUnknown = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: crypto.randomUUID(), function: 'administrator' });
      check(checks, 'tilldelning till främmande medlemskap ger samma svar som okänt', equalShape(grantForeign, grantUnknown) && grantForeign.status >= 400 && mandateCount(HM2.membership) === '1', `${grantForeign.status}/${grantUnknown.status}`);
      const options = await call(rector.session, 'GET', '/api/kund/mandat/urval');
      const list = await call(rector.session, 'GET', '/api/kund/mandat');
      const text = leaks(options, list);
      check(checks, 'urval och mandatlista innehåller inga främmande ID:n', options.status === 200 && list.status === 200 && ![C2, U21, P21, K21, HM2.membership, HM2.assignment].some((id) => text.includes(id)), `${options.status}/${list.status}`);
      const health = await grant(rector, { function: 'elevhalsa', scopeKind: 'case', caseIds: [K11] });
      const caseForeign = await call(health.session, 'GET', `/api/elever/lista?arende=${K21}`);
      const caseUnknown = await call(health.session, 'GET', `/api/elever/lista?arende=${crypto.randomUUID()}`);
      check(checks, 'främmande ärende ger samma tomma registerurval som okänt',
        caseForeign.status === 200 && caseUnknown.status === 200 && caseForeign.body?.count === 0 && caseUnknown.body?.count === 0 &&
        pupilIds(caseForeign) === pupilIds(caseUnknown) && events(caseForeign) === 'pupil_list_read|ok||0|' && events(caseUnknown) === 'pupil_list_read|ok||0|',
        `${caseForeign.status}/${caseUnknown.status}`);
      const badQuery = await call(rector.session, 'GET', `/api/elever/elev?elev=${P11}&antal=1`);
      check(checks, 'okända frågefält nekas (ingen metadata/antal via frågan)', badQuery.status === 400, `HTTP ${badQuery.status}`);
    },

    async 'concurrent-revoke'(checks) {
      const h = await hm();
      const rector = await appointRector([U11], h);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const racing = [];
      for (let i = 0; i < 8; i += 1) racing.push(call(teacher.session, 'GET', '/api/elever/lista', undefined, { 'X-Context-Epoch': String(teacher.session.epoch) }));
      const revokeP = call(rector.session, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: teacher.assignmentId });
      const doubleP = call(h, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: teacher.assignmentId });
      for (let i = 0; i < 8; i += 1) racing.push(call(teacher.session, 'GET', '/api/elever/lista', undefined, { 'X-Context-Epoch': String(teacher.session.epoch) }));
      const [reads, revoked, second] = await Promise.all([Promise.all(racing), revokeP, doubleP]);
      const okReads = reads.filter((r) => r.status === 200), denied = reads.filter((r) => r.status !== 200);
      check(checks, 'inga serverfel under samtidigt avslut och läsning', reads.every((r) => [200, 403].includes(r.status)) && revoked.status === 200 && [200, 403, 404, 409].includes(second.status), `läsningar ${okReads.length} ok/${denied.length} nekade; avslut ${revoked.status}/${second.status}`);
      check(checks, 'varje lyckad läsning har exakt en committad ok-händelse', okReads.every((r) => events(r) === 'pupil_list_read|ok||1|'), `${okReads.length} ok`);
      check(checks, 'varje nekad läsning har nekandehändelse och inget innehåll', denied.every((r) => events(r).startsWith('pupil_list_read|denied|')) && !hasName(...denied), `${denied.length} nekade`);
      const endedAt = psql("select count(*) from public.access_assignments where id=:'id'::uuid and ended_at is not null", { id: teacher.assignmentId });
      const afterwards = await Promise.all([1, 2, 3].map(() => call(teacher.session, 'GET', '/api/elever/lista')));
      check(checks, 'efter avslutets commit nekas alla nya läsningar', endedAt === '1' && afterwards.every((r) => r.status === 403) && !hasName(...afterwards), afterwards.map((r) => r.status).join('/'));
      const okAfterRevoke = okReads.filter((r) => psql("select count(*) from public.security_events e join public.access_assignments a on a.id=:'id'::uuid where e.correlation_id=:'c'::uuid and e.outcome='ok' and e.occurred_at > a.ended_at", { id: teacher.assignmentId, c: corr(r) }) !== '0');
      check(checks, 'ingen lyckad läsning har transaktionstid efter avslutet', okAfterRevoke.length === 0, `${okAfterRevoke.length} efter avslut`);
      const locks = spawnSync(process.execPath, [path.join(root, 'work/pilot/verify-mandate-locks.mjs')], { cwd: root, encoding: 'utf8', timeout: 120_000 });
      const lockReport = (() => { try { return JSON.parse(fs.readFileSync(path.join(root, 'work/pilot/results/phase3-mandate-locks.json'), 'utf8')); } catch { return null; } })();
      check(checks, 'tre verkliga låsordningar i databasen (verify-mandate-locks)', locks.status === 0 && lockReport?.status === 'PASS' && lockReport.cases?.length === 3, `exit ${locks.status}; ${lockReport?.cases?.map((c) => c.name).join(',')}`);
    },

    async 'direct-rest'(checks) {
      const report = await ensureSources();
      const probe = probeFrom('direct-rest');
      check(checks, 'anon REST mot elevtabell nekas med individuellt Kong-källbevis', probe?.status === 'PASS' && probe.gateway?.sourceObserved === true && probe.gateway.status >= 400, `${probe?.status}/${probe?.gateway?.status}`);
      const since = new Date(Date.now() - 1000).toISOString();
      const probes = [
        await kongProbe('GET', '/rest/v1/pupils?select=id,display_name', undefined, 'rest', { Prefer: 'count=exact' }),
        await kongProbe('GET', '/rest/v1/access_assignments?select=id', undefined, 'rest'),
        await kongProbe('GET', '/rest/v1/security_events?select=id,details', undefined, 'rest', { Prefer: 'count=exact' }),
      ];
      const observed = await correlateKongProbes(probes, since);
      check(checks, 'elev-, mandat- och loggtabeller nekas utan antal eller innehåll', probes.every((p) => p.status >= 400 && !/\/\d+$/u.test(p.contentRange ?? '') && !NAME_MARKERS.some((m) => p.text.includes(m))), probes.map((p) => `${p.status}:${p.contentRange ?? '-'}`).join(','));
      check(checks, 'varje extra REST-försök har exakt en Kong-händelse med servergenererat id', observed.every((o) => o.sourceObserved), observed.map((o) => o.sourceObserved).join(','));
      check(checks, 'kontinuitet i Kong-källan under provfönstret', report.continuity?.kong?.status === 'PASS', JSON.stringify(report.continuity?.kong?.reasons ?? []));
    },

    async 'direct-rpc'(checks) {
      const report = await ensureSources();
      const probe = probeFrom('direct-rpc');
      check(checks, 'anon RPC phase4_list_pupils nekas med individuellt Kong-källbevis', probe?.status === 'PASS' && probe.gateway?.sourceObserved === true, `${probe?.status}/${probe?.gateway?.status}`);
      const since = new Date(Date.now() - 1000).toISOString();
      const probes = [
        await kongProbe('POST', '/rest/v1/rpc/appoint_school_principal', { unit_id: U11, principal_assignment_id: crypto.randomUUID(), principal_name: 'x' }, 'rpc'),
        await kongProbe('POST', '/rest/v1/rpc/phase3_grant_mandate', { payload: {} }, 'rpc'),
        await kongProbe('POST', '/rest/v1/rpc/phase3_revoke_mandate', { target: HM1.assignment }, 'rpc'),
        await kongProbe('POST', '/rest/v1/rpc/purge_synthetic_audit', { target_customer: C1 }, 'rpc'),
      ];
      const observed = await correlateKongProbes(probes, since);
      const hmStill = psql("select (ended_at is null)::text from public.access_assignments where id=:'id'::uuid", { id: HM1.assignment });
      check(checks, 'gamla och nya mandat-RPC:er samt gallring nekas för anon', probes.every((p) => p.status >= 400) && hmStill === 'true', probes.map((p) => p.status).join(','));
      check(checks, 'varje RPC-försök har exakt en Kong-händelse', observed.every((o) => o.sourceObserved), observed.map((o) => o.sourceObserved).join(','));
      check(checks, 'RPC-rapporten redovisar kontinuitet', report.continuity?.kong?.status === 'PASS', report.continuity?.kong?.status);
    },

    async 'direct-storage'(checks) {
      const report = await ensureSources();
      const probe = probeFrom('direct-storage');
      check(checks, 'anon Storage-skrivning nekas och syns i både Kong och Storage med samma id', probe?.status === 'PASS' && probe.gateway?.sourceObserved === true && probe.upstream?.sourceObserved === true, `${probe?.gateway?.status}/${probe?.upstream?.status}`);
      check(checks, 'Storage verifierade rollen själv (anon), ingen klientpåstådd aktör', probe?.upstream?.observedRole === 'anon', String(probe?.upstream?.observedRole));
      const bucket = psql("select count(*) from storage.buckets where name='phase3-probe'");
      check(checks, 'ingen bucket skapades', bucket === '0', `antal ${bucket}`);
      check(checks, 'Storage-källans kontinuitet', report.continuity?.storage?.status === 'PASS', JSON.stringify(report.continuity?.storage?.reasons ?? []));
    },

    async 'direct-sql'(checks) {
      const report = await ensureSources();
      const probe = probeFrom('direct-sql');
      check(checks, 'direkt SQL som authenticator/anon/authenticated ger 42501 i exakt den serverrapporterade sessionen', probe?.status === 'PASS' && probe.postgres?.sourceObserved === true && probe.postgres.sourceEventIds?.length === probe.postgres.attempts, `${probe?.postgres?.attempts} försök, ${probe?.postgres?.sourceEventIds?.length} källhändelser`);
      const authRead = sqlState("begin; set local role authenticated; select public.phase4_list_pupils('{}'::jsonb); rollback;");
      const anonCase = sqlState('begin; set local role anon; select count(*) from public.phase3_probe_cases; rollback;');
      const workerDelete = workerSql('delete from public.security_events where id=(select min(id) from public.security_events)');
      const workerUpdate = workerSql("update public.security_events set details='{}'::jsonb where id=(select min(id) from public.security_events)");
      const workerPurge = workerSql("select public.purge_synthetic_audit(:'c'::uuid)", null, { c: C1 });
      const workerLegacy = workerSql("select public.appoint_school_principal(:'u'::uuid, gen_random_uuid(), 'x')", null, { u: U11 });
      check(checks, 'klientroller saknar elevfunktion och ärendetabell', authRead === '42501' && anonCase === '42501', `${authRead}/${anonCase}`);
      check(checks, 'Workern kan inte radera/ändra audit, gallra eller använda gammal utnämningsväg', [workerDelete, workerUpdate, workerPurge, workerLegacy].every((s) => s === '42501'), [workerDelete, workerUpdate, workerPurge, workerLegacy].join('/'));
      check(checks, 'Postgres-källans kontinuitet', report.continuity?.postgres?.status === 'PASS', JSON.stringify(report.continuity?.postgres?.reasons ?? []));
    },

    async 'audit-read-fail'(checks) {
      const rector = await appointRector([U11]);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const health = await grant(rector, { function: 'elevhalsa', scopeKind: 'case', caseIds: [K11] });
      const failed = await withoutAudit(async () => ({
        list: await call(teacher.session, 'GET', '/api/elever/lista'),
        byId: await call(teacher.session, 'GET', `/api/elever/elev?elev=${P11}`),
        byCase: await call(health.session, 'GET', `/api/elever/lista?arende=${K11}`),
        mandates: await call(rector.session, 'GET', '/api/kund/mandat'),
        options: await call(rector.session, 'GET', '/api/kund/mandat/urval'),
      }));
      const all = Object.values(failed);
      check(checks, 'loggfel stoppar lista, elev-ID, ärende, mandatlista och urval med audit_unavailable', all.every((r) => r.status === 500 && r.body?.code === 'audit_unavailable'), all.map((r) => `${r.status}/${r.body?.code}`).join(','));
      check(checks, 'inga elevbytes eller mandatdata lämnas', !hasName(...all) && !leaks(...all).includes(P11) && all.every((r) => !r.body?.pupils && !r.body?.mandates), 'svaren innehåller endast felkod och korrelation');
      check(checks, 'ingen ok-händelse finns för de stoppade läsningarna', all.every((r) => !events(r).includes('|ok|')), all.map(events).join(','));
      const recovered = await call(teacher.session, 'GET', '/api/elever/lista');
      check(checks, 'läsningen återhämtar sig när loggen är åter', recovered.status === 200 && events(recovered) === 'pupil_list_read|ok||1|', events(recovered));
    },

    async 'audit-export-fail'(checks) {
      const rector = await appointRector([U11]);
      const admin = await grant(rector, { function: 'administrator' });
      const reviewer = await insertRoot('granskare');
      const failed = await withoutAudit(async () => [
        await call(admin.session, 'GET', '/api/elever/export'),
        await call(reviewer.session, 'GET', '/api/logg?format=csv'),
      ]);
      check(checks, 'loggfel stoppar elevexport och loggexport', failed.every((r) => r.status === 500 && r.body?.code === 'audit_unavailable'), failed.map((r) => r.status).join('/'));
      check(checks, 'ingen CSV eller elevdata lämnas', failed.every((r) => !r.headers['content-type']?.includes('text/csv') && !r.headers['content-disposition']) && !hasName(...failed) && !leaks(...failed).includes(P11), 'inga CSV-svar');
      check(checks, 'ingen ok-händelse för stoppad export', failed.every((r) => !events(r).includes('|ok|')), failed.map(events).join(','));
      const recovered = await call(admin.session, 'GET', '/api/elever/export');
      check(checks, 'export fungerar igen med committad händelse', recovered.status === 200 && events(recovered) === 'pupil_exported|ok||2|', events(recovered));
    },

    async 'audit-write-rollback'(checks) {
      const h = await hm();
      const rector = await appointRector([U11], h);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const it = await insertRoot('it', [U11]);
      const current = await call(it.session, 'GET', `/api/kund/anslutning?unitId=${U11}`);
      const target = createPerson(), principal = createPerson();
      const invitee = createPerson();
      const invitationsBefore = psql("select count(*) from public.invitations where issued_by_assignment_id=:'a'::uuid", { a: rector.assignmentId });
      const failed = await withoutAudit(async () => ({
        grant: await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: target.membership, function: 'administrator' }),
        revoke: await call(rector.session, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: teacher.assignmentId }),
        appoint: await call(h, 'POST', '/api/kund/rektor', { ...base(), membershipId: principal.membership, function: 'rektor' }),
        connection: await call(it.session, 'PATCH', '/api/kund/anslutning', { unitId: U11, enabled: !current.body?.enabled, expectedVersion: current.body?.version }),
        test: await call(it.session, 'POST', '/api/kund/anslutning', { unitId: U11, action: 'test' }),
        invitation: await call(rector.session, 'POST', '/api/kund/inbjudan', { personName: 'Syntetisk inbjuden', expectedIssuer: 'https://phase3.example.test', expectedSubject: invitee.identity, mandates: [{ ...base(), function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] }] }),
      }));
      const all = Object.values(failed);
      check(checks, 'loggfel ger audit_unavailable för tilldelning, avslut, utnämning, anslutning, prov och inbjudan', all.every((r) => r.status === 500 && r.body?.code === 'audit_unavailable'), all.map((r) => r.status).join('/'));
      const teacherOpen = psql("select (ended_at is null)::text from public.access_assignments where id=:'id'::uuid", { id: teacher.assignmentId });
      const after = await call(it.session, 'GET', `/api/kund/anslutning?unitId=${U11}`);
      const invitationsAfter = psql("select count(*) from public.invitations where issued_by_assignment_id=:'a'::uuid", { a: rector.assignmentId });
      check(checks, 'inga mutationer committades', mandateCount(target.membership) === '0' && mandateCount(principal.membership) === '0' && teacherOpen === 'true' && after.body?.version === current.body?.version && after.body?.enabled === current.body?.enabled && invitationsAfter === invitationsBefore, `lärare öppen ${teacherOpen}, version ${current.body?.version}→${after.body?.version}, inbjudningar ${invitationsBefore}→${invitationsAfter}`);
      check(checks, 'inga ok-händelser för de rullade mutationerna', all.every((r) => !events(r).includes('|ok|')), all.map(events).join(','));
      const retried = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: target.membership, function: 'administrator' });
      check(checks, 'samma mutation lyckas och loggas när loggen är åter', retried.status === 201 && events(retried) === 'mandate_granted|ok|||', `HTTP ${retried.status}`);
    },

    async 'audit-deny-fail'(checks) {
      const rector = await appointRector([U11]);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const failed = await withoutAudit(async () => [
        await call('ogiltig-session-deny-fail', 'GET', '/api/elever/lista'),
        await call(teacher.session, 'GET', '/api/elever/export'),
        await call(teacher.session, 'GET', `/api/elever/elev?elev=${P21}`),
        await call(teacher.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'administrator' }),
        await call(teacher.session, 'POST', '/api/kund/uppdrag/avsluta', { assignmentId: rector.assignmentId }),
      ]);
      check(checks, 'nekande utan beständig logg ger generiskt audit_unavailable', failed.every((r) => r.status === 500 && r.body?.code === 'audit_unavailable'), failed.map((r) => r.status).join('/'));
      check(checks, 'nekandesvaren röjer inget innehåll eller nekandeorsak', !hasName(...failed) && failed.every((r) => JSON.stringify(Object.keys(r.body ?? {}).sort()) === JSON.stringify(Object.keys(failed[0].body ?? {}).sort())), Object.keys(failed[0].body ?? {}).join(','));
      const rectorOpen = psql("select (ended_at is null)::text from public.access_assignments where id=:'id'::uuid", { id: rector.assignmentId });
      check(checks, 'nekad mutation ändrade inget', rectorOpen === 'true', rectorOpen);
      const recovered = await call(teacher.session, 'GET', '/api/elever/export');
      check(checks, 'nekande loggas igen när loggen är åter', recovered.status === 403 && events(recovered) === 'pupil_export|denied|forbidden||', events(recovered));
    },

    async 'audit-flood'(checks) {
      const rector = await appointRector([U11]);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const it = await insertRoot('it', [U11]);
      const from = new Date(Date.now() - 2000).toISOString();
      const attempts = [];
      for (let i = 0; i < 10; i += 1) attempts.push({ expect: 'no_session', r: await call(`ogiltig-flod-${i}`, 'GET', '/api/elever/lista', undefined, { 'X-Forwarded-For': `203.0.113.${i + 1}` }) });
      for (let i = 0; i < 6; i += 1) attempts.push({ expect: 'forbidden', r: await call(teacher.session, 'GET', '/api/elever/export', undefined, { 'X-Forwarded-For': '198.51.100.7' }) });
      for (let i = 0; i < 6; i += 1) attempts.push({ expect: 'not_found', r: await call(teacher.session, 'GET', `/api/elever/elev?elev=${P21}`) });
      for (let i = 0; i < 6; i += 1) attempts.push({ expect: 'forbidden', r: await call(it.session, 'GET', '/api/elever/lista') });
      const reconciled = attempts.map(({ expect, r }) => {
        const row = psql("select count(*)||'|'||coalesce(max(outcome::text),'')||'|'||coalesce(max(details->>'code'),'') from public.security_events where correlation_id=:'c'::uuid", { c: corr(r) });
        return { expect, status: r.status, code: r.body?.code, row };
      });
      check(checks, `${attempts.length} nekanden (>20) gav förväntade svar`, attempts.length > 20 && reconciled.every((x) => x.code === x.expect), reconciled.map((x) => x.status).join(','));
      check(checks, 'varje försök avstäms mot exakt en beständig nekandehändelse med samma kod', reconciled.every((x) => x.row === `1|denied|${x.expect}`), reconciled.filter((x) => x.row !== `1|denied|${x.expect}`).length + ' avvikande');
      const suppressed = psql("select count(*) from public.security_events where action='denied_suppressed' and occurred_at>=:'from'::timestamptz", { from });
      check(checks, 'ingen undertryckning eller sammanslagning', suppressed === '0' && new Set(attempts.map(({ r }) => corr(r))).size === attempts.length, `suppression ${suppressed}`);
      const reviewer = await insertRoot('granskare');
      const log = await call(reviewer.session, 'GET', `/api/logg?from=${encodeURIComponent(from)}&limit=1000`);
      const seen = new Set((log.body?.events ?? []).map((e) => e.correlationId));
      const authenticated = attempts.filter((a) => a.expect !== 'no_session');
      check(checks, 'granskaren ser varje autentiserat nekande i kundens logg', log.status === 200 && authenticated.length === 18 && authenticated.every(({ r }) => seen.has(corr(r))), `${authenticated.filter(({ r }) => seen.has(corr(r))).length}/${authenticated.length}`);
    },

    async 'audit-source-outage'(checks) {
      const report = await ensureSources();
      for (const source of ['kong', 'storage', 'postgres']) {
        const outage = report.outages?.find((o) => o.source === source);
        check(checks, `${source}: avbrott upptäcks, ingen data under avbrott, omstart och återhämtning utan tyst bortfall`, outage?.status === 'PASS', outage ? `${outage.status} ${JSON.stringify(outage.reasons)}` : 'ej körd');
      }
      check(checks, 'samlad källrapport är PASS', report.status === 'PASS', JSON.stringify(report.blockers ?? []));
      const kongActive = auditSourceModule.kongConfigCurrent(auditSourceModule.readKongConfig((await auditSourceModule.sources()).kong.id));
      check(checks, 'Kongs minimerade format är aktivt efter återhämtningen', kongActive === true, String(kongActive));
      const rector = await appointRector([U11]);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const read = await call(teacher.session, 'GET', '/api/elever/lista');
      check(checks, 'Workerns auditerade läsning fungerar efter Postgres-omstarten', read.status === 200 && events(read) === 'pupil_list_read|ok||1|', events(read));
    },

    async 'audit-minimization'(checks) {
      const report = await ensureSources();
      const since = new Date(Date.now() - 2000).toISOString();
      const rector = await appointRector([U11]);
      const teacher = await grant(rector, { function: 'larare', scopeKind: 'group', groups: [{ id: G11, kind: 'teaching' }] });
      const nameQuery = await call(teacher.session, 'GET', `/api/elever/elev?elev=${encodeURIComponent('Syntetisk elev 11')}`);
      const freeText = await call(rector.session, 'POST', '/api/kund/mandat', { ...base(), membershipId: createPerson().membership, function: 'administrator', note: 'Syntetisk anteckning om elev' });
      const read = await call(teacher.session, 'GET', `/api/elever/elev?elev=${P11}`);
      check(checks, 'namn i fråga och fritext i kropp nekas', nameQuery.status === 400 && freeText.status === 400, `${nameQuery.status}/${freeText.status}`);
      const ids = [...new Set(correlations)];
      const stored = psql("select coalesce(string_agg(details::text||coalesce(object_type,'')||coalesce(action,''),' '),'') from public.security_events where correlation_id=any(string_to_array(:'ids',',')::uuid[])", { ids: ids.join(',') });
      const keys = psql("select coalesce(string_agg(distinct k,','),'') from public.security_events e, jsonb_object_keys(e.details) k where correlation_id=any(string_to_array(:'ids',',')::uuid[])", { ids: ids.join(',') }).split(',').filter(Boolean);
      const allowed = ['accessFunction', 'action', 'assignmentId', 'code', 'count', 'emailMismatch', 'field', 'fields',
        'format', 'from', 'grants', 'organizerId', 'path', 'principalNamed', 'proof', 'readForm',
        'revokedSessions', 'schoolYear', 'status', 'stepUp', 'to'];
      check(checks, `körningens ${ids.length} Worker-händelser saknar namn, anteckningar och fritext`, ids.length >= 5 && stored.length > 0 && !NAME_MARKERS.some((m) => stored.includes(m)) && !stored.includes('anteckning'), `${ids.length} korrelationer`);
      check(checks, 'detaljnycklar är allowlistade', keys.every((k) => allowed.includes(k)), keys.join(','));
      const reviewer = await insertRoot('granskare');
      const log = await call(reviewer.session, 'GET', `/api/logg?limit=1000&from=${encodeURIComponent(since)}`);
      const csvLog = await call(reviewer.session, 'GET', `/api/logg?format=csv&limit=1000&from=${encodeURIComponent(since)}`);
      const logEvents = log.body?.events ?? [];
      check(checks, 'granskaren ser elevläsningen men inga namn i JSON eller CSV', log.status === 200 && logEvents.some((e) => e.correlationId === corr(read) && e.action === 'pupil_read') && csvLog.status === 200 && !hasName(log, csvLog), `${logEvents.length} händelser`);
      check(checks, 'granskarens logg är begränsad till egen kund', logEvents.length > 0 && logEvents.every((e) => e.customerId === C1), 'kund-id kontrollerat');
      const bertil = await mint({ identityId: BERTIL.identity, membershipId: BERTIL.membership, assignmentId: BERTIL.assignment });
      const otherLog = await call(bertil, 'GET', `/api/logg?limit=1000&from=${encodeURIComponent(new Date(Date.now() - 3600_000).toISOString())}`);
      check(checks, 'annan kunds granskare ser ingen av fas 3-kundens händelser', otherLog.status === 200 && !(otherLog.body?.events ?? []).some((e) => e.customerId === C1 || ids.includes(e.correlationId)), `HTTP ${otherLog.status}`);
      const sourceKeys = new Set((report.events ?? []).flatMap((e) => Object.keys(e)));
      const sourceAllowed = ['source', 'sourceEventId', 'gatewayRequestId', 'time', 'route', 'status', 'operation', 'observedRole', 'actor', 'outcome', 'pid', 'sessionId', 'sqlstate', 'severity'];
      check(checks, 'källhändelser (Kong/Storage/Postgres) har bara allowlistade fält', (report.events ?? []).length > 0 && [...sourceKeys].every((k) => sourceAllowed.includes(k)) && !secretPattern.test(JSON.stringify(report)), [...sourceKeys].join(','));
    },

    async 'audit-retention'(checks) {
      const customer = crypto.randomUUID();
      const out = psql(`begin;
        insert into public.customers(id,name) values(:'c'::uuid,'Syntetisk gallringskund');
        insert into public.audit_retention_policy values(:'c'::uuid,'synthetic-v1',30);
        insert into public.security_events(correlation_id,source,customer_id,action,outcome,occurred_at) values
          (gen_random_uuid(),'db',:'c'::uuid,'retention_probe_old','ok',transaction_timestamp()-interval '30 days 1 second'),
          (gen_random_uuid(),'db',:'c'::uuid,'retention_probe_cutoff','ok',transaction_timestamp()-interval '30 days'),
          (gen_random_uuid(),'db',:'c'::uuid,'retention_probe_new','ok',transaction_timestamp()-interval '29 days 23 hours');
        set local role skolplattform_audit_maintenance;
        select 'removed='||public.purge_synthetic_audit(:'c'::uuid);
        reset role;
        select 'left='||string_agg(action,',' order by action) from public.security_events where customer_id=:'c'::uuid;
        rollback;`, { c: customer });
      check(checks, 'gallring tar bort endast äldre än serverberäknad 30-dygnsgräns', out.includes('removed=1'), out.split('\n').find((l) => l.startsWith('removed=')) ?? 'saknas');
      check(checks, 'händelse vid och efter gränsen finns kvar', out.includes('left=retention_probe_cutoff,retention_probe_new'), out.split('\n').find((l) => l.startsWith('left=')) ?? 'saknas');
      const noPolicy = sqlState("begin; set local role skolplattform_audit_maintenance; select public.purge_synthetic_audit(:'c'::uuid); rollback;", { c: C1 });
      const configured = psql("select count(*) from public.audit_retention_policy where customer_id=:'c'::uuid", { c: C1 });
      check(checks, 'kund utan konfigurerad syntetisk profil kan inte gallras', noPolicy === '42501' && configured === '0', `${noPolicy}; policy ${configured}`);
      const workerPurge = workerSql("select public.purge_synthetic_audit(:'c'::uuid)", null, { c: C1 });
      const workerDelete = workerSql('delete from public.security_events where id=(select min(id) from public.security_events)');
      const maintenanceUpdate = sqlState("begin; set local role skolplattform_audit_maintenance; update public.security_events set details='{}'::jsonb where id=(select min(id) from public.security_events); rollback;");
      const authPurge = sqlState("begin; set local role authenticated; select public.purge_synthetic_audit(:'c'::uuid); rollback;", { c: C1 });
      check(checks, 'Worker, klientroll och underhållsroll kan inte ändra eller radera audit direkt', [workerPurge, workerDelete, maintenanceUpdate, authPurge].every((s) => s === '42501'), [workerPurge, workerDelete, maintenanceUpdate, authPurge].join('/'));
      const leftover = psql("select count(*) from public.customers where id=:'c'::uuid", { c: customer });
      check(checks, 'provet lämnar inga rader kvar (transaktionen rullades tillbaka)', leftover === '0', leftover);
    },
  };

  const health = async (url) => {
    try {
      const response = await fetch(`${url}/api/health/db`);
      const body = await response.json();
      return response.ok && body?.role === 'skolplattform_worker';
    } catch { return false; }
  };
  const startServer = async () => {
    if (baseUrl) {
      const url = new URL(baseUrl);
      if (!['127.0.0.1', 'localhost'].includes(url.hostname) || url.protocol !== 'http:') throw new Error('REFUSED: --base-url måste vara loopback');
      baseUrl = url.origin;
      for (let i = 0; i < 60 && !await health(baseUrl); i += 1) await new Promise((resolve) => setTimeout(resolve, 500));
      if (!await health(baseUrl)) throw new Error('BLOCKED: angiven server är inte en protected-Worker');
      return;
    }
    let mark;
    try { mark = JSON.parse(fs.readFileSync(path.join(web, 'dist-protected/build-mode.json'), 'utf8')); } catch { /* nedan */ }
    if (mark?.mode !== 'protected') throw new Error('BLOCKED: kör npm run build:protected');
    baseUrl = `http://127.0.0.1:${options.port}`;
    if (await health(baseUrl)) throw new Error(`BLOCKED: port ${options.port} är redan upptagen`);
    server = spawn(process.execPath, ['scripts/run-mode.mjs', 'preview', '--mode', 'protected', '--port', String(options.port)], { cwd: web, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', () => {});
    server.stderr.on('data', (chunk) => { serverErrors = `${serverErrors}${chunk}`.slice(-2000); });
    const deadline = Date.now() + 90_000;
    while (Date.now() < deadline) {
      if (await health(baseUrl)) return;
      if (server.exitCode !== null) break;
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    const hint = /BLOCKED:[^\n]{0,160}/u.exec(serverErrors)?.[0];
    throw new Error(hint ? `BLOCKED: protected-Workern startade inte (${hint.slice(9)}); använd --base-url mot den byggda previewn` : 'BLOCKED: protected-Workern startade inte');
  };
  const workerBuild = () => { try { return JSON.parse(fs.readFileSync(path.join(web, 'dist-protected/build-mode.json'), 'utf8')).revision ?? null; } catch { return null; } };

  const setupTemporary = () => {
    psql(fs.readFileSync(path.join(root, 'work/pilot/sql/phase3-fixtures.sql'), 'utf8'));
    cleanupTemporary();
    psql(`begin;
      insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name)
      select :'p'::uuid,:'c'::uuid,:'o'::uuid,'Syntetisk elev 19',s.personal_number,'Elev 19'
      from public.synthetic_pupil_numbers s where not exists(select 1 from public.pupils x where x.customer_id=:'c'::uuid and x.personal_number=s.personal_number)
      order by s.personal_number limit 1;
      insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
      select :'g'::uuid,:'c'::uuid,:'o'::uuid,:'u'::uuid,o.id,'PROV-19',o.start_year
      from public.offerings o where o.id=public.phase4_probe_uuid('offering:'||:'u') limit 1;
      insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
      select public.phase4_probe_uuid('placement:'||:'p'),:'c'::uuid,:'o'::uuid,:'p'::uuid,:'u'::uuid,o.id,make_date(o.start_year,7,1)
      from public.offerings o where o.id=public.phase4_probe_uuid('offering:'||:'u') limit 1;
      insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on)
      select public.phase4_probe_uuid('member:'||:'g'||':'||:'p'),:'c'::uuid,:'o'::uuid,:'p'::uuid,:'u'::uuid,:'g'::uuid,
        public.phase4_probe_uuid('placement:'||:'p'),make_date(o.start_year,7,1)
      from public.offerings o where o.id=public.phase4_probe_uuid('offering:'||:'u') limit 1;
      insert into public.phase3_probe_cases values (:'k'::uuid,:'p'::uuid,:'c'::uuid,:'u'::uuid);
      commit;`, { p: P19, g: G19, k: K19, c: C1, o: ORG1, u: U11 });
  };
  function cleanupTemporary() {
    psql(`delete from public.mandate_cases where case_id=:'k'::uuid; delete from public.mandate_pupils where pupil_id=:'p'::uuid; delete from public.mandate_groups where group_id=:'g'::uuid;
      delete from public.phase3_probe_cases where id=:'k'::uuid;
      delete from public.pupil_class_memberships where pupil_id=:'p'::uuid and class_id=:'g'::uuid;
      delete from public.pupil_placements where pupil_id=:'p'::uuid;
      delete from public.school_classes where id=:'g'::uuid and name='PROV-19';
      delete from public.pupils where id=:'p'::uuid and display_name='Syntetisk elev 19';`, { p: P19, g: G19, k: K19 });
  }

  const runCase = async (name) => {
    const checks = [];
    let blockedReason = null;
    try { await cases[name](checks); }
    catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (message.startsWith('BLOCKED:')) blockedReason = message;
      check(checks, 'fallet kunde köras', false, message.replace(/postgres(?:ql)?:\/\/\S+/giu, '[db]'));
    }
    const status = blockedReason ? 'BLOCKED' : checks.length >= 2 && checks.every((item) => item.ok) ? 'PASS' : 'FAIL';
    results.push({ name, status, checks });
    console.log(`${status === 'PASS' ? 'ok ' : status === 'BLOCKED' ? 'BLK' : 'FEL'} ${name} (${checks.filter((item) => item.ok).length}/${checks.length})`);
    for (const item of checks.filter((c) => !c.ok)) console.log(`     - ${item.check}: ${item.detail}`);
  };

  let exitCode = 1;
  let temporary = false;
  try {
    // Källprov startar om Kong/Storage/Postgres; körs före Workern så att den
    // inte ärver brutna anslutningar.
    if (options.cases.some((name) => SOURCE_CASES.includes(name))) await ensureSources();
    await startServer();
    today = psql('select public.app_today()::text');
    setupTemporary();
    temporary = true;
    for (const name of options.cases) await runCase(name);
    const status = overallStatus(results, { subset: options.subset });
    const report = {
      kind: 'phase3-api',
      scope: 'local-synthetic-only',
      proof: 'lokalt mintade sessionsbevis i verifierat protected-mål; ingen verklig IdP- eller kommunanslutning',
      startedAt,
      completedAt: new Date().toISOString(),
      revision: revision(),
      workerBuildRevision: workerBuild(),
      target: 'protected',
      baseUrl,
      requiredCases: REQUIRED_CASES,
      complete: !options.subset && REQUIRED_CASES.every((name) => results.some((item) => item.name === name)),
      status,
      cases: results,
    };
    if (secretPattern.test(JSON.stringify(report))) {
      report.status = 'FAIL';
      report.validationErrors = ['rapporten innehåller hemligt markerbyte eller elevnamn'];
    }
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Totalstatus: ${report.status} (${results.filter((r) => r.status === 'PASS').length}/${results.length} fall)`);
    exitCode = report.status === 'PASS' || report.status === 'PARTIAL' ? 0 : report.status === 'BLOCKED' ? 3 : 1;
    if (report.status === 'PARTIAL') console.log('Delurval: status PARTIAL räcker inte till fasgrinden.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(message);
    exitCode = message.startsWith('BLOCKED:') ? 3 : 1;
    // Ersätt aldrig en gammal rapport med något som ser färskt ut.
    try {
      fs.writeFileSync(options.out, `${JSON.stringify({ kind: 'phase3-api', status: exitCode === 3 ? 'BLOCKED' : 'FAIL', startedAt, completedAt: new Date().toISOString(), revision: revision(), complete: false, cases: results, error: message.slice(0, 200) }, null, 2)}\n`);
    } catch { /* rapporten kan inte skrivas */ }
  } finally {
    try { if (temporary) cleanupTemporary(); } catch (error) { console.error(`Städning av provrader misslyckades: ${error instanceof Error ? error.constructor.name : 'fel'}`); exitCode = exitCode || 1; }
    try { psql('grant insert on public.security_events to skolplattform_worker'); } catch { exitCode = exitCode || 1; }
    try { if (sessions.size) psql("delete from public.app_sessions where id=any(string_to_array(:'ids',',')::uuid[])", { ids: [...sessions].join(',') }); }
    catch { console.error('Städning av sessioner misslyckades'); exitCode = exitCode || 1; }
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 3000); });
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    if (pgpassPath) fs.rmSync(pgpassPath, { force: true });
  }
  process.exit(exitCode);
}
