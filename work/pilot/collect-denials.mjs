#!/usr/bin/env node
// Source-based evidence for denied alternative paths in the local synthetic stack.
// Events come only from Docker logs of Kong, Storage and Postgres, read in memory and
// reduced to an explicit field schema. Client responses provide correlation keys that the
// server generated (Kong request id, Postgres session id); they are never evidence by
// themselves. Raw log lines, URLs, SQL text and exception messages are never persisted.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources, docker, readKongConfig, kongConfigCurrent, configureKong, readPostgresSettings, postgresConfigured } from './configure-audit-source.mjs';
import { assertTarget } from './verify-target.mjs';
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const routes = new Set(['rest', 'rpc', 'storage', 'other']);
const hex32 = /^[a-f0-9]{32}$/;
const hex64 = /^[a-f0-9]{64}$/;
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// ---- Kong: minimized access log written by configure-audit-source.mjs --------------------
// No spreading from untrusted log JSON. Everything outside this schema is discarded.
export function normalizeKong(line, sourceId) {
  let row;
  try { row = JSON.parse(line); } catch { return null; }
  if (!row || row.schema !== 'phase3-ingress-v1' || !hex32.test(row.requestId ?? '') ||
    typeof row.time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(row.time) || !Number.isFinite(Date.parse(row.time)) ||
    !Number.isInteger(row.status) || row.status < 100 || row.status > 599 || !routes.has(row.route) || !hex64.test(sourceId)) return null;
  return { source: 'kong', sourceEventId: `${sourceId}:${row.requestId}`, time: row.time, route: row.route,
    status: row.status, actor: null, outcome: row.status >= 400 ? 'rejected' : 'received' };
}
// Default Nginx "combined" access lines mean the minimized format was not active (e.g. after
// a restart regenerated Kong's configuration). They are counted as a coverage gap, never kept.
const combinedAccess = /^\S+ - \S+ \[\d\d\/\w{3}\/\d{4}:\d\d:\d\d:\d\d [+-]\d{4}\] "/;
export function collectKong(raw, sourceId) {
  const events = new Map();
  let malformed = 0, unminimized = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    const event = normalizeKong(line, sourceId);
    if (event) events.set(event.sourceEventId, event);
    else if (line.includes('phase3-ingress-v1')) malformed++;
    else if (combinedAccess.test(line)) unminimized++;
  }
  return { events: [...events.values()], malformed, unminimized };
}
export function correlateKong(requests, events, sourceId) {
  const seen = new Set();
  return requests.map(r => {
    const validId = typeof r.requestId === 'string' && hex32.test(r.requestId);
    const sourceEventId = validId ? `${sourceId}:${r.requestId}` : null;
    const matches = events.filter(e => e.sourceEventId === sourceEventId && e.route === r.route && e.status === r.status && e.outcome === 'rejected');
    const sourceObserved = validId && !seen.has(sourceEventId) && matches.length === 1;
    if (sourceEventId) seen.add(sourceEventId);
    return { route: r.route, status: r.status, sourceEventId, sourceObserved };
  });
}

// ---- Storage: image-default pino JSON; gateway forces x-client-trace-id = Kong request id ---
const storageRoles = new Set(['anon', 'authenticated', 'service_role']);
export function normalizeStorage(line, sourceId) {
  let row;
  try { row = JSON.parse(line); } catch { return null; }
  if (!row || row.type !== 'request') return null;
  const traceId = row.req?.headers?.x_client_trace_id;
  const status = row.res?.statusCode;
  if (!hex32.test(traceId ?? '') || typeof row.time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(row.time) ||
    !Number.isFinite(Date.parse(row.time)) || !Number.isInteger(status) || status < 100 || status > 599 || !hex64.test(sourceId)) return null;
  // Storage verified the JWT itself before assigning this role; anything else becomes null.
  const observedRole = storageRoles.has(row.role) ? row.role : null;
  const operation = typeof row.operation === 'string' && /^storage\.[a-z_]+(?:\.[a-z_]+){0,3}$/.test(row.operation) ? row.operation : null;
  return { source: 'storage', sourceEventId: `${sourceId}:${traceId}`, gatewayRequestId: traceId, time: row.time, route: 'storage',
    status, operation, observedRole, actor: null, outcome: status >= 400 ? 'rejected' : 'received' };
}
export function collectStorage(raw, sourceId) {
  const events = new Map();
  let untraced = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    const event = normalizeStorage(line, sourceId);
    if (event) { events.set(event.sourceEventId, event); continue; }
    let row; try { row = JSON.parse(line); } catch { continue; }
    // A request reaching Storage without the gateway-forced trace id bypassed Kong's
    // minimized log (or predates configuration): coverage gap, never silently dropped.
    if (row?.type === 'request') untraced++;
  }
  return { events: [...events.values()], untraced };
}
export function correlateStorage(requests, events, sourceId) {
  return requests.map(r => {
    const validId = typeof r.requestId === 'string' && hex32.test(r.requestId);
    const matches = validId ? events.filter(e => e.sourceEventId === `${sourceId}:${r.requestId}` && e.status === r.status && e.outcome === 'rejected') : [];
    return { route: 'storage', status: r.status, sourceEventId: matches.length === 1 ? matches[0].sourceEventId : null,
      observedRole: matches.length === 1 ? matches[0].observedRole : null, sourceObserved: matches.length === 1 };
  });
}

// ---- Postgres: stderr with prefix phase3pg|%m|%p|%c|%l|%u|%e| -------------------------------
const pgLine = /^phase3pg\|(\d{4}-\d\d-\d\d) (\d\d:\d\d:\d\d\.\d{3}) UTC\|(\d{1,10})\|([0-9a-f]{1,16}\.[0-9a-f]{1,8})\|(\d{1,12})\|([a-z_][a-z0-9_]{0,62})?\|([0-9A-Z]{5})\|(ERROR|FATAL|PANIC):/;
const defaultPg = /^(?:\S+ )?\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} UTC \[\d+\]/;
export function normalizePostgres(line, sourceId) {
  const m = pgLine.exec(line);
  if (!m || !hex64.test(sourceId)) return null;
  const [, day, clock, pid, sessionId, lineNo, user, sqlstate, severity] = m;
  const time = `${day}T${clock}Z`;
  if (!Number.isFinite(Date.parse(time))) return null;
  // Class 28 (authentication) and 08 (connection) carry only a claimed user name.
  const verified = !['28', '08'].includes(sqlstate.slice(0, 2));
  return { source: 'postgres', sourceEventId: `${sourceId}:${sessionId}:${lineNo}`, time, pid: Number(pid), sessionId,
    sqlstate, severity, observedRole: verified && user ? user : null, actor: null, outcome: 'rejected' };
}
export function collectPostgres(raw, sourceId) {
  const events = new Map();
  let unconfigured = 0, statementLines = 0, detailLines = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    if (/^phase3pg\|.*\|STATEMENT:|^\S.* STATEMENT: /.test(line)) statementLines++;
    if (/^phase3pg\|.*\|(?:DETAIL|HINT|CONTEXT|QUERY):/.test(line)) detailLines++;
    const event = normalizePostgres(line, sourceId);
    if (event) events.set(event.sourceEventId, event);
    else if (!line.startsWith('phase3pg|') && defaultPg.test(line)) unconfigured++;
  }
  return { events: [...events.values()], unconfigured, statementLines, detailLines };
}
export function correlateSql(probe, events) {
  const matches = events.filter(e => e.sessionId === probe.sessionId && e.pid === probe.pid && e.sqlstate === probe.expectedSqlstate);
  return { sessionId: probe.sessionId ?? null, expectedSqlstate: probe.expectedSqlstate, attempts: probe.attempts, clientDenied: probe.clientDenied,
    sourceEventIds: matches.map(e => e.sourceEventId), observedRole: matches[0]?.observedRole ?? null,
    sourceObserved: probe.attempts > 0 && probe.clientDenied === probe.attempts && matches.length === probe.attempts };
}

// ---- Continuity -------------------------------------------------------------------------------
export function validateCursor(previous, current) {
  if (!previous) return { status: 'BLOCKED', reason: 'initial-coverage-unproven' };
  if (!current || previous.id !== current.id) return { status: 'BLOCKED', reason: 'source-replaced' };
  if (previous.startedAt !== current.startedAt) return { status: 'BLOCKED', reason: 'source-restarted' };
  if (previous.rotation !== 'disabled' || current.rotation !== 'disabled') return { status: 'BLOCKED', reason: 'docker-log-rotation-possible' };
  return { status: 'PASS', reason: 'same-container-run-no-rotation' };
}
// A window is continuous only if the same container run covered it, logs cannot rotate,
// the minimized configuration was active at both ends and no unminimized/untraced line
// appeared in between. Any failure is reported with its reason, never ignored.
export function windowContinuity(kind, cursor, parsed, configured) {
  const reasons = [];
  if (cursor.status !== 'PASS') reasons.push(cursor.reason);
  if (!configured.before || !configured.after) reasons.push('source-configuration-inactive');
  if (parsed.malformed) reasons.push('malformed-source-lines');
  if (parsed.unminimized) reasons.push('unminimized-access-lines');
  if (parsed.untraced) reasons.push('untraced-upstream-requests');
  if (parsed.unconfigured) reasons.push('unconfigured-log-lines');
  if (parsed.statementLines) reasons.push('statement-text-logged');
  if (parsed.detailLines) reasons.push('detail-lines-logged');
  return { source: kind, status: reasons.length ? 'BLOCKED' : 'PASS', reasons };
}

function readLogs(source, since) {
  const r = spawnSync('docker', ['logs', '--since', since, source.id], { encoding: 'utf8', timeout: 60000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0 || r.error) throw new Error('BLOCKED: source read unavailable');
  return `${r.stdout}\n${r.stderr}`;
}
function parseAll(current, since) {
  return {
    kong: collectKong(readLogs(current.kong, since), current.kong.id),
    storage: collectStorage(readLogs(current.storage, since), current.storage.id),
    postgres: collectPostgres(readLogs(current.db, since), current.db.id),
  };
}
async function configState(target, current) {
  let kong = false, postgres = false;
  try { kong = kongConfigCurrent(readKongConfig(current.kong.id)); } catch { kong = false; }
  try { postgres = postgresConfigured(readPostgresSettings(target, current.db)); } catch { postgres = false; }
  return { kong, postgres, storage: kong };
}

// ---- Probes ------------------------------------------------------------------------------------
// agent:false gives one fresh connection per request, so no pooled socket can outlive a restart.
function httpProbe(target, method, endpoint, body, headers = {}) {
  const url = new URL(endpoint, target.apiUrl);
  const payload = body === undefined ? undefined : JSON.stringify(body);
  return new Promise((resolve, reject) => {
    const req = http.request(url, { method, agent: false, timeout: 10000, headers: {
      apikey: target.anonKey, Authorization: `Bearer ${target.anonKey}`,
      // Hostile client values: Kong must overwrite the trace header and never trust these.
      'X-Correlation-Id': 'untrusted-client-marker', 'X-Client-Trace-Id': 'f'.repeat(32),
      ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {}), ...headers } }, res => {
      res.resume();
      res.on('end', () => resolve({ status: res.statusCode, requestId: res.headers['x-phase3-audit-id'] ?? null }));
    });
    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', () => reject(new Error('BLOCKED: probe connection failed')));
    req.end(payload);
  });
}
// Uses the public local anon key only. These paths must stay closed for anon.
const httpProbes = [
  { id: 'direct-rest', route: 'rest', method: 'GET', endpoint: '/rest/v1/phase3_probe_pupils?select=id' },
  { id: 'direct-rpc', route: 'rpc', method: 'POST', endpoint: '/rest/v1/rpc/phase3_read_pupils', body: {} },
  { id: 'direct-storage', route: 'storage', method: 'POST', endpoint: '/storage/v1/bucket', body: { name: 'phase3-probe', public: false } },
];
async function runHttpProbe(target, probe) {
  const r = await httpProbe(target, probe.method, probe.endpoint, probe.body);
  return { id: probe.id, route: probe.route, status: r.status, requestId: r.requestId };
}
function loadPostgres() {
  const require = createRequire(new URL('../../web/package.json', import.meta.url));
  return require('postgres');
}
// Direct SQL as the authenticator login (as any holder of the pooler/API database credential
// could), then as anon/authenticated. Each statement must fail with 42501 and appear in the
// server log for exactly this server-reported session.
async function runSqlProbe(target) {
  const url = new URL(target.dbUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('REFUSED: non-local database');
  const postgres = loadPostgres();
  const sql = postgres({ host: url.hostname, port: Number(url.port), database: url.pathname.slice(1), username: 'authenticator',
    password: decodeURIComponent(url.password), max: 1, prepare: false, onnotice: () => {}, connect_timeout: 10, idle_timeout: 5 });
  const statements = [
    'select id from public.phase3_probe_pupils limit 1',
    'set role anon',
    'select id from public.phase3_probe_pupils limit 1',
    'reset role',
    'set role authenticated',
    'select count(*) from public.security_events',
  ];
  const result = { id: 'direct-sql', expectedSqlstate: '42501', attempts: 0, clientDenied: 0, sessionId: null, pid: null };
  try {
    const [session] = await sql.unsafe("select pg_backend_pid() as pid, to_hex(trunc(extract(epoch from backend_start))::bigint) || '.' || to_hex(pid) as sid from pg_stat_activity where pid = pg_backend_pid()");
    result.pid = Number(session.pid); result.sessionId = session.sid;
    for (const statement of statements) {
      if (!statement.startsWith('select')) { await sql.unsafe(statement); continue; }
      result.attempts++;
      try { await sql.unsafe(statement); } catch (error) { if (error?.code === '42501') result.clientDenied++; }
    }
  } catch { result.loginFailed = true; }
  finally { await sql.end({ timeout: 5 }).catch(() => {}); }
  return result;
}

// ---- Single collection window ------------------------------------------------------------------
export async function collect({ probe = false } = {}) {
  const target = await assertTarget('protected');
  const before = await sources();
  const configBefore = await configState(target, before);
  const since = new Date(Date.now() - 1000).toISOString();
  const baseline = parseAll(before, since);
  const known = new Set(['kong', 'storage', 'postgres'].flatMap(k => baseline[k].events.map(e => e.sourceEventId)));
  const requests = [];
  let sqlProbe = null;
  if (probe) {
    for (const p of httpProbes) requests.push(await runHttpProbe(target, p));
    sqlProbe = await runSqlProbe(target);
    // Nginx/pino/Postgres emit at request completion; bounded delay only for local delivery.
    await sleep(1500);
  }
  const after = await sources();
  const configAfter = await configState(target, after);
  const parsed = parseAll(before, since);
  const events = ['kong', 'storage', 'postgres'].flatMap(k => parsed[k].events).filter(e => !known.has(e.sourceEventId));
  const kongObs = correlateKong(requests, parsed.kong.events, before.kong.id);
  const storageObs = correlateStorage(requests.filter(r => r.route === 'storage'), parsed.storage.events, before.storage.id);
  const probes = requests.map((r, i) => ({ id: r.id, gateway: kongObs[i], ...(r.route === 'storage' ? { upstream: storageObs[0] } : {}) }));
  if (sqlProbe) probes.push({ id: 'direct-sql', loginFailed: Boolean(sqlProbe.loginFailed), postgres: correlateSql(sqlProbe, parsed.postgres.events) });
  const continuity = {
    kong: windowContinuity('kong', validateCursor(before.kong, after.kong), parsed.kong, { before: configBefore.kong, after: configAfter.kong }),
    storage: windowContinuity('storage', validateCursor(before.storage, after.storage), parsed.storage, { before: configBefore.storage, after: configAfter.storage }),
    postgres: windowContinuity('postgres', validateCursor(before.db, after.db), parsed.postgres, { before: configBefore.postgres, after: configAfter.postgres }),
  };
  return { target, before, since, requests, probes, events, continuity };
}
function probeStatus(p) {
  if (p.id === 'direct-sql') return !p.loginFailed && p.postgres.sourceObserved;
  return p.gateway.sourceObserved && (p.id !== 'direct-storage' || p.upstream?.sourceObserved === true);
}

// ---- Outage / restart / recovery ---------------------------------------------------------------
async function waitHealthy(id) {
  for (let i = 0; i < 240; i++) {
    try {
      const [c] = JSON.parse(docker(['inspect', id]));
      if (c.State.Running && (!c.State.Health || c.State.Health.Status === 'healthy')) return true;
    } catch { /* keep waiting */ }
    await sleep(500);
  }
  return false;
}
async function retry(fn, ok, attempts = 20) {
  let last;
  for (let i = 0; i < attempts; i++) {
    try { last = await fn(); if (ok(last)) return last; } catch { last = null; }
    await sleep(1000);
  }
  return last;
}
const outageProbe = { kong: 'direct-rest', storage: 'direct-storage', db: 'direct-sql' };
async function probeOnce(target, kind) {
  if (kind === 'db') return { sql: await runSqlProbe(target) };
  return { http: await runHttpProbe(target, httpProbes.find(p => p.id === outageProbe[kind])) };
}
function observedIn(kind, result, current, since) {
  if (!result) return { observed: false, ids: [] };
  if (kind === 'db') {
    const c = correlateSql(result.sql, collectPostgres(readLogs(current.db, since), current.db.id).events);
    return { observed: !result.sql.loginFailed && c.sourceObserved, ids: c.sourceEventIds };
  }
  const r = result.http;
  const k = correlateKong([r], collectKong(readLogs(current.kong, since), current.kong.id).events, current.kong.id)[0];
  if (kind === 'kong') return { observed: k.sourceObserved, ids: k.sourceEventId ? [k.sourceEventId] : [] };
  const s = correlateStorage([r], collectStorage(readLogs(current.storage, since), current.storage.id).events, current.storage.id)[0];
  return { observed: k.sourceObserved && s.sourceObserved, ids: s.sourceEventId ? [s.sourceEventId] : [] };
}
export function outageVerdict(r) {
  const reasons = [];
  if (!r.preOutageObserved) reasons.push('pre-outage-event-not-observed');
  if (!r.collectorBlockedDuringOutage) reasons.push('outage-not-detected');
  if (r.dataServedDuringOutage) reasons.push('path-served-during-outage');
  if (!r.restartDetected) reasons.push('restart-not-detected');
  if (r.configLostAfterRestart && !r.gapReported) reasons.push('silent-configuration-gap');
  if (!r.configActiveAfterRecovery) reasons.push('configuration-not-restored');
  if (!r.preOutageEventRetained) reasons.push('pre-outage-event-lost');
  if (!r.postRecoveryObserved) reasons.push('post-recovery-event-not-observed');
  return { status: reasons.length ? 'BLOCKED' : 'PASS', reasons };
}
async function outage(target, kind) {
  const start = await sources();
  const source = start[kind];
  const since = new Date(Date.now() - 1000).toISOString();
  const r = { source: kind === 'db' ? 'postgres' : kind };
  const pre = await probeOnce(target, kind);
  await sleep(1500);
  const preObs = observedIn(kind, pre, start, since);
  r.preOutageObserved = preObs.observed;
  docker(['stop', '-t', '15', source.id]);
  try { await sources(); r.collectorBlockedDuringOutage = false; } catch { r.collectorBlockedDuringOutage = true; }
  // Attempt the same closed path during the outage: success would mean unlogged access.
  let during = null;
  try { during = await probeOnce(target, kind); } catch { during = null; }
  r.duringOutage = during?.http ? { status: during.http.status } : during?.sql ? { loginFailed: Boolean(during.sql.loginFailed), clientDenied: during.sql.clientDenied } : { connection: 'refused' };
  r.dataServedDuringOutage = Boolean(during?.http && during.http.status < 400) || Boolean(during?.sql && !during.sql.loginFailed && during.sql.clientDenied !== during.sql.attempts);
  docker(['start', source.id]);
  r.healthyAfterRestart = await waitHealthy(source.id);
  const restarted = await retry(() => sources(), () => true, 60);
  r.restartDetected = validateCursor(source, restarted?.[kind]).reason === 'source-restarted';
  if (kind === 'kong') {
    r.configLostAfterRestart = !kongConfigCurrent(readKongConfig(source.id));
    if (r.configLostAfterRestart) {
      // Request in the unconfigured window: must surface as a gap, not vanish.
      await retry(() => runHttpProbe(target, httpProbes[0]), x => x?.status >= 400);
      await sleep(1000);
      r.gapReported = collectKong(readLogs(restarted.kong, since), source.id).unminimized > 0;
      await configureKong(restarted.kong);
    }
    r.configActiveAfterRecovery = kongConfigCurrent(readKongConfig(source.id));
  } else if (kind === 'db') {
    r.configLostAfterRestart = false;
    r.configActiveAfterRecovery = Boolean(await retry(async () => postgresConfigured(readPostgresSettings(target, restarted.db)), x => x === true, 30));
  } else {
    r.configLostAfterRestart = false;
    r.configActiveAfterRecovery = kongConfigCurrent(readKongConfig(restarted.kong.id));
  }
  const post = await retry(() => probeOnce(target, kind), x => kind === 'db' ? !x.sql.loginFailed : x.http.status >= 400 && x.http.status < 500 && x.http.requestId, 30);
  await sleep(1500);
  const final = await sources();
  r.postRecoveryObserved = observedIn(kind, post, final, since).observed;
  const retained = kind === 'db' ? collectPostgres(readLogs(final.db, since), final.db.id).events
    : kind === 'kong' ? collectKong(readLogs(final.kong, since), final.kong.id).events
    : collectStorage(readLogs(final.storage, since), final.storage.id).events;
  r.preOutageEventRetained = preObs.ids.length > 0 && preObs.ids.every(id => retained.some(e => e.sourceEventId === id));
  return { ...r, ...outageVerdict(r) };
}

export async function report({ probe = false, outageSources = [] } = {}) {
  const window = await collect({ probe });
  const probes = window.probes.map(p => ({ ...p, status: probeStatus(p) ? 'PASS' : 'BLOCKED' }));
  const outages = [];
  for (const kind of outageSources) outages.push(await outage(window.target, kind));
  const blockers = [];
  if (!probe) blockers.push('no-probes-run');
  for (const p of probes) if (p.status !== 'PASS') blockers.push(`${p.id}-source-evidence-missing`);
  for (const c of Object.values(window.continuity)) if (c.status !== 'PASS') blockers.push(`${c.source}-continuity:${c.reasons.join('+')}`);
  for (const kind of ['kong', 'storage', 'db']) {
    const o = outages.find(x => x.source === (kind === 'db' ? 'postgres' : kind));
    if (!o) blockers.push(`${kind === 'db' ? 'postgres' : kind}-outage-recovery-untested`);
    else if (o.status !== 'PASS') blockers.push(`${o.source}-outage:${o.reasons.join('+')}`);
  }
  return {
    status: blockers.length ? 'BLOCKED' : 'PASS',
    scope: 'local-synthetic-only',
    guarantee: 'asynchronous local collector; no synchronous operational guarantee; not a municipal/production log chain',
    checkedAt: new Date().toISOString(),
    coverage: { from: window.since, to: new Date().toISOString() },
    probes, continuity: window.continuity, outages,
    notCovered: ['postgrest-upstream-postgres-errors-are-pooled-and-not-individually-correlated', 'worker-events-are-verified-by-verify-access.mjs-not-this-collector'],
    events: window.events, blockers,
  };
}
export function parseArgs(args) {
  const result = { probe: false, out: null, outageSources: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--probe' && !result.probe) result.probe = true;
    else if (args[i] === '--outage' && !result.outageSources.length && args[i + 1]) {
      const list = args[++i].split(',');
      if (!list.every(k => ['kong', 'storage', 'db'].includes(k)) || new Set(list).size !== list.length) throw new Error('REFUSED: --outage kong,storage,db');
      result.outageSources = list;
    }
    else if (args[i] === '--out' && !result.out && args[i + 1]) result.out = path.resolve(args[++i]);
    else throw new Error('REFUSED: unknown/repeated argument');
  }
  if (result.outageSources.length && !result.probe) throw new Error('REFUSED: --outage requires --probe');
  const results = path.join(root, 'work/pilot/results') + path.sep;
  if (result.out && (!result.out.startsWith(results) || path.dirname(result.out) !== results.slice(0, -1) || !result.out.endsWith('.json') || (fs.existsSync(result.out) && fs.lstatSync(result.out).isSymbolicLink()))) throw new Error('REFUSED: output must be a JSON file directly in work/pilot/results');
  return result;
}
export async function runCollection(options, collector = report) {
  let result;
  try { result = await collector(options); }
  catch {
    // Replace an older report after any failed attempt. Never leave stale observations
    // looking like evidence from the current run, and never persist raw exception text.
    result = { status: 'BLOCKED', scope: 'local-synthetic-only', attemptedAt: new Date().toISOString(),
      probes: [], events: [], blockers: ['source-collection-unavailable'] };
  }
  if (options.out) fs.writeFileSync(options.out, JSON.stringify(result, null, 2) + '\n', { mode: 0o600 });
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const result = await runCollection(options);
    console.log(JSON.stringify({ status: result.status, probes: (result.probes ?? []).map(p => `${p.id}:${p.status}`), outages: (result.outages ?? []).map(o => `${o.source}:${o.status}`), eventCount: result.events.length, blockers: result.blockers }));
    process.exitCode = result.status === 'PASS' ? 0 : 3;
  } catch { console.error('BLOCKED: source collection failed; no audit approval'); process.exitCode = 3; }
}
