#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sources } from './configure-audit-source.mjs';
import { assertTarget } from './verify-target.mjs';
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const routes = new Set(['rest', 'rpc', 'storage', 'other']);
// No spreading from untrusted log JSON. Everything outside this schema is discarded.
export function normalizeKong(line, sourceId) {
  let row;
  try { row = JSON.parse(line); } catch { return null; }
  if (!row || row.schema !== 'phase3-ingress-v1' || !/^[a-f0-9]{32}$/.test(row.requestId ?? '') ||
    typeof row.time !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:Z|[+-]\d\d:\d\d)$/.test(row.time) || !Number.isFinite(Date.parse(row.time)) ||
    !Number.isInteger(row.status) || row.status < 100 || row.status > 599 || !routes.has(row.route) || !/^[a-f0-9]{64}$/.test(sourceId)) return null;
  return { source: 'kong', sourceEventId: `${sourceId}:${row.requestId}`, time: row.time, route: row.route,
    status: row.status, actor: null, outcome: row.status >= 400 ? 'rejected' : 'received' };
}
export function collectKong(raw, sourceId) {
  const events = new Map();
  let malformed = 0;
  for (const line of raw.split('\n').filter(Boolean)) {
    const event = normalizeKong(line, sourceId);
    if (event) events.set(event.sourceEventId, event);
    else if (line.includes('phase3-ingress-v1')) malformed++;
  }
  return { events: [...events.values()], malformed };
}
function readLogs(source, since) {
  const r = spawnSync('docker', ['logs', '--since', since, source.id], { encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  if (r.status !== 0 || r.error) throw new Error('BLOCKED: source read unavailable');
  return `${r.stdout}\n${r.stderr}`;
}
export function validateCursor(previous, current) {
  if (!previous) return { status: 'BLOCKED', reason: 'initial-coverage-unproven' };
  if (previous.id !== current.id || previous.startedAt !== current.startedAt) return { status: 'BLOCKED', reason: 'source-restarted' };
  return { status: 'BLOCKED', reason: 'docker-log-rotation-continuity-unproven' };
}
export async function collect({ probe = false } = {}) {
  const target = await assertTarget('protected');
  const before = await sources();
  const since = new Date(Date.now() - 1000).toISOString();
  const baseline = new Set(collectKong(readLogs(before.kong, since), before.kong.id).events.map(e => e.sourceEventId));
  const requests = [];
  if (probe) {
    // No API credentials: gateway rejects these synthetic attempts before upstream access.
    for (const [route, endpoint] of [['rest','/rest/v1/phase3_probe_pupils'], ['rpc','/rest/v1/rpc/phase3_unavailable'], ['storage','/storage/v1/object/phase3-probe']]) {
      const response = await fetch(target.apiUrl + endpoint, { headers: { 'X-Correlation-Id': 'untrusted-client-marker' }, signal: AbortSignal.timeout(10000), redirect: 'error' });
      await response.arrayBuffer();
      requests.push({ route, status: response.status });
    }
    // Nginx emits at request completion; bounded delay is only for local log delivery.
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  const after = await sources();
  const parsed = collectKong(readLogs(before.kong, since), before.kong.id);
  const events = parsed.events.filter(e => !baseline.has(e.sourceEventId));
  const changed = before.kong.id !== after.kong.id || before.kong.startedAt !== after.kong.startedAt;
  const observations = requests.map(r => ({ ...r, sourceObserved: events.some(e => e.route === r.route && e.status === r.status && e.outcome === 'rejected') }));
  return { status: 'BLOCKED', scope: 'local-synthetic-only', coverage: { from: since, to: new Date().toISOString(), continuity: 'unproven' },
    kongProbe: probe && !changed && !parsed.malformed && observations.every(r => r.sourceObserved) ? 'OBSERVED' : 'UNVERIFIED',
    observations, events, malformed: parsed.malformed,
    blockers: [...(changed ? ['source-restarted'] : []), 'storage-upstream-denials-unverified', 'direct-sql-denials-unverified', 'outage-restart-cursor-recovery-unverified', 'individual-probe-correlation-unverified'] };
}
export function parseArgs(args) {
  const result = { probe: false, out: null };
  for (let i=0; i<args.length; i++) {
    if (args[i] === '--probe' && !result.probe) result.probe = true;
    else if (args[i] === '--out' && !result.out && args[i+1]) result.out = path.resolve(args[++i]);
    else throw new Error('REFUSED: unknown/repeated argument');
  }
  const results = path.join(root, 'work/pilot/results') + path.sep;
  if (result.out && (!result.out.startsWith(results) || path.dirname(result.out) !== results.slice(0,-1) || !result.out.endsWith('.json') || (fs.existsSync(result.out) && fs.lstatSync(result.out).isSymbolicLink()))) throw new Error('REFUSED: output must be a JSON file directly in work/pilot/results');
  return result;
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = parseArgs(process.argv.slice(2));
    const report = await collect(options);
    if (options.out) fs.writeFileSync(options.out, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 });
    console.log(JSON.stringify({ status: report.status, kongProbe: report.kongProbe, eventCount: report.events.length, blockers: report.blockers }));
    process.exitCode = 3;
  } catch { console.error('BLOCKED: source collection failed; no audit approval'); process.exitCode = 3; }
}
