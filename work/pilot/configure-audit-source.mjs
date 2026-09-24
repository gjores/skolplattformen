#!/usr/bin/env node
// Local synthetic ingress only. Never print child-process errors/configuration.
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

export function docker(args, input) {
  try { return execFileSync('docker', args, { encoding: 'utf8', input, stdio: ['pipe', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024, timeout: 30000 }); }
  catch { throw new Error('BLOCKED: local Docker source unavailable or command rejected'); }
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
    result[kind] = { id: found[0].Id, startedAt: found[0].State.StartedAt };
  }
  return result;
}
const marker = '# phase3 minimized ingress v1';
const responseHeader = 'add_header X-Phase3-Audit-Id $request_id always;';
export function kongConfig(original) {
  if (original.startsWith(marker)) {
    if (original.includes(responseHeader)) return original;
    const needle = 'access_log /dev/stdout phase3_audit;';
    if (original.split(needle).length !== 2) throw new Error('BLOCKED: unsupported minimized Kong configuration');
    return original.replace(needle, `${needle}\n    ${responseHeader}`);
  }
  const needle = 'access_log logs/access.log;';
  if (original.split(needle).length !== 2) throw new Error('BLOCKED: unsupported Kong configuration');
  return `${marker}
map $request_uri $phase3_route {
  default other;
  ~^/rest/v1/rpc/ rpc;
  ~^/rest/v1/ rest;
  ~^/storage/v1/ storage;
}
log_format phase3_audit escape=json '{"schema":"phase3-ingress-v1","requestId":"$request_id","time":"$time_iso8601","status":$status,"route":"$phase3_route"}';
${original.replace(needle, `access_log /dev/stdout phase3_audit;\n    ${responseHeader}`)}`;
}
export async function configure() {
  const source = (await sources()).kong;
  const file = '/usr/local/kong/nginx-kong.conf';
  const original = docker(['exec', source.id, 'cat', file]);
  const updated = kongConfig(original);
  if (updated !== original) {
    try {
      docker(['exec', '-i', source.id, 'sh', '-c', 'cat > /usr/local/kong/nginx-kong.conf'], updated);
      docker(['exec', source.id, '/usr/local/openresty/nginx/sbin/nginx', '-t', '-p', '/usr/local/kong/', '-c', 'nginx.conf']);
      docker(['exec', source.id, '/usr/local/openresty/nginx/sbin/nginx', '-s', 'reload', '-p', '/usr/local/kong/', '-c', 'nginx.conf']);
    } catch (error) {
      try {
        docker(['exec', '-i', source.id, 'sh', '-c', 'cat > /usr/local/kong/nginx-kong.conf'], original);
        docker(['exec', source.id, '/usr/local/openresty/nginx/sbin/nginx', '-s', 'reload', '-p', '/usr/local/kong/', '-c', 'nginx.conf']);
      } catch { throw new Error('BLOCKED: Kong rollback requires inspection'); }
      throw error;
    }
  }
  return { status: 'BLOCKED', configured: ['kong-access'], blockers: ['storage-minimized-source-unverified', 'postgres-source-unconfigured', 'restart-and-cursor-recovery-unverified'] };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (process.argv.slice(2).join(' ') !== '--target protected') throw new Error('REFUSED: expected --target protected');
    console.log(JSON.stringify(await configure()));
    process.exitCode = 3;
  } catch { console.error('BLOCKED: source configuration failed; no audit approval'); process.exitCode = 3; }
}
