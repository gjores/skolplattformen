#!/usr/bin/env node
// Local synthetic ingress only. Never print child-process errors/configuration.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

export function docker(args, input, env) {
  try { return execFileSync('docker', args, { encoding: 'utf8', input, env: env ? { ...process.env, ...env } : process.env, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 64 * 1024 * 1024, timeout: 60000 }); }
  catch { throw new Error('BLOCKED: local Docker source unavailable or command rejected'); }
}
// Source identity comes from Docker inspect of the projectId verified by assertTarget,
// never from arbitrary container names. json-file without max-size never rotates.
export function sourceFromInspect(container) {
  const config = container.HostConfig?.LogConfig?.Config ?? {};
  return { id: container.Id, startedAt: container.State.StartedAt,
    rotation: config['max-size'] || config['max-file'] ? 'possible' : 'disabled' };
}
export async function sources() {
  const target = await assertTarget('protected');
  const ids = docker(['ps', '-q']).trim().split('\n').filter(Boolean);
  if (!ids.length) throw new Error('BLOCKED: local sources absent');
  const inspected = JSON.parse(docker(['inspect', ...ids]));
  const result = {};
  for (const kind of ['kong', 'storage', 'db']) {
    const found = inspected.filter(c => c.Name === `/supabase_${kind}_${target.projectId}`);
    if (found.length !== 1 || !found[0].State.Running || found[0].HostConfig.LogConfig.Type !== 'json-file') throw new Error('BLOCKED: local source identity/log driver mismatch');
    result[kind] = sourceFromInspect(found[0]);
  }
  return result;
}

const marker = '# phase3 minimized ingress v1';
const responseHeader = 'add_header X-Phase3-Audit-Id $request_id always;';
const realIp = /^(\s*)proxy_set_header\s+X-Real-IP\s+\$remote_addr;\s*$/;
const trace = /^\s*proxy_set_header\s+X-Client-Trace-Id\s+\$request_id;\s*$/;
// Kong's request_id is also forced upstream as X-Client-Trace-Id. proxy_set_header replaces
// any client-supplied header of the same name; Storage logs this allowlisted header, which
// gives per-request gateway->Storage correlation without logging URL, query, body or tokens.
export function kongConfig(original) {
  let config = original;
  if (!config.startsWith(marker)) {
    const needle = 'access_log logs/access.log;';
    if (config.split(needle).length !== 2) throw new Error('BLOCKED: unsupported Kong configuration');
    config = `${marker}
map $request_uri $phase3_route {
  default other;
  ~^/rest/v1/rpc/ rpc;
  ~^/rest/v1/ rest;
  ~^/storage/v1/ storage;
}
log_format phase3_audit escape=json '{"schema":"phase3-ingress-v1","requestId":"$request_id","time":"$time_iso8601","status":$status,"route":"$phase3_route"}';
${config.replace(needle, `access_log /dev/stdout phase3_audit;\n    ${responseHeader}`)}`;
  } else if (!config.includes(responseHeader)) {
    const needle = 'access_log /dev/stdout phase3_audit;';
    if (config.split(needle).length !== 2) throw new Error('BLOCKED: unsupported minimized Kong configuration');
    config = config.replace(needle, `${needle}\n    ${responseHeader}`);
  }
  const lines = config.split('\n');
  const out = [];
  let proxies = 0;
  for (let i = 0; i < lines.length; i++) {
    if (trace.test(lines[i])) continue; // re-added below right after its X-Real-IP line
    out.push(lines[i]);
    const match = lines[i].match(realIp);
    if (match) { proxies++; out.push(`${match[1]}proxy_set_header      X-Client-Trace-Id  $request_id;`); }
  }
  if (!proxies) throw new Error('BLOCKED: unsupported Kong proxy configuration');
  return out.join('\n');
}
export function kongConfigCurrent(config) {
  return typeof config === 'string' && config.startsWith(marker) && kongConfig(config) === config;
}
const kongFile = '/usr/local/kong/nginx-kong.conf';
export function readKongConfig(id) { return docker(['exec', id, 'cat', kongFile]); }
function workers(id) {
  const lines = docker(['exec', id, 'ps', '-o', 'pid,args']).split('\n').filter(l => l.includes('nginx: worker process'));
  return { active: lines.filter(l => !l.includes('shutting down')).map(l => l.trim().split(/\s+/)[0]), draining: lines.filter(l => l.includes('shutting down')).length };
}
// Nginx reload is asynchronous: old workers keep serving until they receive the signal
// and drain. Configuration counts as active only when every pre-reload worker is gone.
async function waitForReload(id, before) {
  for (let i = 0; i < 120; i++) {
    const now = workers(id);
    if (!now.draining && now.active.length && now.active.every(pid => !before.includes(pid))) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('BLOCKED: Kong reload did not complete');
}
function reload(id) {
  docker(['exec', id, '/usr/local/openresty/nginx/sbin/nginx', '-t', '-p', '/usr/local/kong/', '-c', 'nginx.conf']);
  docker(['exec', id, '/usr/local/openresty/nginx/sbin/nginx', '-s', 'reload', '-p', '/usr/local/kong/', '-c', 'nginx.conf']);
}
export async function configureKong(source) {
  const original = readKongConfig(source.id);
  const updated = kongConfig(original);
  if (updated === original) return 'unchanged';
  const before = workers(source.id).active;
  try {
    docker(['exec', '-i', source.id, 'sh', '-c', `cat > ${kongFile}`], updated);
    reload(source.id);
    await waitForReload(source.id, before);
  } catch (error) {
    try { docker(['exec', '-i', source.id, 'sh', '-c', `cat > ${kongFile}`], original); reload(source.id); }
    catch { throw new Error('BLOCKED: Kong rollback requires inspection'); }
    throw error;
  }
  return 'reloaded';
}

// Postgres: stderr log with SQLSTATE, PID, session id, session line and authenticated
// session user. No statement text, bind values, DETAIL/HINT/CONTEXT lines.
export const postgresSettings = {
  log_line_prefix: 'phase3pg|%m|%p|%c|%l|%u|%e|',
  log_min_error_statement: 'panic',
  log_error_verbosity: 'terse',
  log_statement: 'none',
  log_destination: 'stderr',
  logging_collector: 'off',
};
function dbPassword(target) {
  const url = new URL(target.dbUrl);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('REFUSED: non-local database');
  return decodeURIComponent(url.password);
}
export function psqlAdmin(target, source, sql) {
  // Local disposable stack only: supabase_admin shares the manifest's local default password.
  return docker(['exec', '-i', '-e', 'PGPASSWORD', source.id, 'psql', '-h', '127.0.0.1', '-U', 'supabase_admin', '-d', 'postgres',
    '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-f', '-'], sql, { PGPASSWORD: dbPassword(target) });
}
// Effective settings as seen by a fresh session of the ordinary postgres login, plus any
// per-role/per-database overrides that could re-enable statement logging.
export function readPostgresSettings(target, source) {
  const names = Object.keys(postgresSettings).map(n => `'${n}'`).join(',');
  const rows = docker(['exec', '-i', '-e', 'PGPASSWORD', source.id, 'psql', '-h', '127.0.0.1', '-U', 'postgres', '-d', 'postgres', '-X', '-q', '-A', '-t', '-F', '\t', '-f', '-'],
    `select name, setting from pg_settings where name in (${names}) order by name;`, { PGPASSWORD: dbPassword(target) });
  const overrides = psqlAdmin(target, source, `select count(*) from pg_db_role_setting s, unnest(s.setconfig) c
    where split_part(c, '=', 1) in (${names}) and c <> 'log_statement=none';`).trim();
  const settings = Object.fromEntries(rows.trim().split('\n').filter(Boolean).map(r => r.split('\t')));
  return { settings, overrides: Number(overrides) };
}
export function postgresConfigured(state) {
  return state.overrides === 0 && Object.entries(postgresSettings).every(([k, v]) => state.settings[k] === v);
}
export async function configurePostgres(target, source) {
  const before = readPostgresSettings(target, source);
  if (postgresConfigured(before)) return 'unchanged';
  if (before.overrides !== 0 || before.settings.logging_collector !== 'off' || before.settings.log_destination !== 'stderr') throw new Error('BLOCKED: unsupported Postgres logging configuration');
  const statements = Object.entries(postgresSettings).filter(([k]) => !['logging_collector', 'log_destination'].includes(k))
    .map(([k, v]) => `alter system set ${k} = '${v}';`).join('\n');
  psqlAdmin(target, source, `${statements}\nselect pg_reload_conf();\n`);
  for (let i = 0; i < 40; i++) {
    if (postgresConfigured(readPostgresSettings(target, source))) return 'reloaded';
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw new Error('BLOCKED: Postgres logging settings not effective');
}

export async function configure() {
  const target = await assertTarget('protected');
  const current = await sources();
  const kong = await configureKong(current.kong);
  const postgres = await configurePostgres(target, current.db);
  return { status: 'CONFIGURED', scope: 'local-synthetic-only', kong, postgres,
    storage: 'image-default-json; gateway-forced x-client-trace-id',
    note: 'Configuration is not evidence. collect-denials.mjs decides PASS/BLOCKED per source.' };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).join(' ') !== '--target protected') throw new Error('REFUSED: expected --target protected');
    console.log(JSON.stringify(await configure()));
  } catch { console.error('BLOCKED: source configuration failed; no audit approval'); process.exitCode = 3; }
}
