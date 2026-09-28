#!/usr/bin/env node
// 04-25: upprepade verkliga Worker-prov och nekandeflöden mot byggd protected-Worker
// och verifierat lokalt protected-mål. Endast syntetiska uppgifter.
//
//   node work/pilot/phase4-worker-stability.mjs --target protected --runs 20 --flood-runs 5 \
//     --flood-calls 200 [--baseline] --out work/pilot/results/phase4-25-stability.json
//   [--port-base 3040] [--variant namn] [--flood-kind denied|allowed] [--wrangler-debug]
//
// Varje körning är en oförändrad körning av phase4-worker-execute-probe.mjs med egen
// preview-Worker, egen port och egen rapport i tmp. Nekandeflödena använder probens
// valfria --deny-flood mot samma Worker efter de 9 fallen. Varje körning klassas som
// PASS, FAIL, AVBROTT eller BLOCKED:
//   AVBROTT = 500 utan JSON-kod eller utan X-Correlation-Id, eller fetch-fel efter att
//             Workern redan har svarat. Anropets ordning, fall, route, förväntan, tid sedan
//             föregående anrop och om wrangler/workerd lever registreras.
// Med --baseline blir totalstatus MEASURED (aldrig PASS). Utan --baseline blir den PASS
// endast om alla begärda körningar är PASS och antalet avbrott är 0.
//
// Wranglers och workerds utdata kan innehålla anslutningsuppgifter. Den sparas bara i
// 0600-filer i en 0700-katalog i tmp, aldrig i rapporten eller terminalutdata.

import { execFileSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const results = path.join(root, 'work/pilot/results');
const probe = path.join(root, 'work/pilot/phase4-worker-execute-probe.mjs');
const REQUIRED_CASES = ['worker-role', 'admin-change', 'admin-reveal', 'admin-export', 'no-mfa', 'other-role', 'outside-mandate', 'direct-client-roles', 'persistent-audit'];
const FUNCTIONS = ['public.phase4_change_pupil(jsonb)', 'public.phase4_resolve_source(jsonb)', 'public.phase4_reveal_personal_number(jsonb)', 'public.phase4_export_pupils(jsonb,boolean)'];
const STATUSES = ['PASS', 'FAIL', 'AVBROTT', 'BLOCKED'];
const RUN_TIMEOUT_MS = 10 * 60_000;
const leakPattern = /TEST-\d{8}-\d{4}|Syntetisk elev|sp_session=|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}/u;
const inTmp = (file) => file.startsWith(os.tmpdir()) || file.startsWith('/private/tmp/') || file.startsWith('/tmp/');

export function parseArgs(argv) {
  const options = { target: null, runs: null, floodRuns: null, floodCalls: null, baseline: false, out: null, portBase: 3040, variant: 'standard', floodKind: 'denied', wranglerDebug: false };
  const int = (arg, raw) => { if (!/^\d+$/u.test(raw)) throw new Error(`${arg} kräver ett heltal`); return Number(raw); };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => { const next = argv[++i]; if (next === undefined) throw new Error(`${arg} saknar värde`); return next; };
    if (arg === '--target') options.target = value();
    else if (arg === '--runs') options.runs = int(arg, value());
    else if (arg === '--flood-runs') options.floodRuns = int(arg, value());
    else if (arg === '--flood-calls') options.floodCalls = int(arg, value());
    else if (arg === '--baseline') options.baseline = true;
    else if (arg === '--out') options.out = path.resolve(process.cwd(), value());
    else if (arg === '--port-base') options.portBase = int(arg, value());
    else if (arg === '--variant') options.variant = value();
    else if (arg === '--flood-kind') options.floodKind = value();
    else if (arg === '--wrangler-debug') options.wranglerDebug = true;
    else throw new Error(`okänt argument ${arg}`);
  }
  if (options.target !== 'protected') throw new Error('--target protected krävs');
  if (options.runs === null || options.floodRuns === null) throw new Error('--runs och --flood-runs krävs');
  if (options.runs > 200 || options.floodRuns > 50 || options.runs + options.floodRuns < 1) throw new Error('ogiltigt antal körningar');
  if (options.floodRuns > 0 && (options.floodCalls === null || options.floodCalls < 1 || options.floodCalls > 5000)) throw new Error('--flood-calls 1–5000 krävs för nekandeflöden');
  if (options.floodRuns === 0 && options.floodCalls === null) options.floodCalls = 0;
  if (!options.out) throw new Error('--out krävs');
  if (path.dirname(options.out) !== results && !inTmp(options.out)) throw new Error('--out måste ligga direkt i work/pilot/results eller i en temporär katalog');
  if (options.portBase < 1024 || options.portBase + options.runs + options.floodRuns > 65535) throw new Error('ogiltig --port-base');
  if (!/^[a-z0-9-]{1,40}$/u.test(options.variant)) throw new Error('--variant får bara innehålla a–z, 0–9 och bindestreck');
  if (!['denied', 'allowed'].includes(options.floodKind)) throw new Error('ogiltigt --flood-kind');
  return options;
}

const pickCall = (call) => ({
  n: call.n ?? null,
  caseId: call.caseId ?? null,
  route: call.route ?? null,
  expect: call.expect ?? null,
  gapMs: call.gapMs ?? null,
  ms: call.ms ?? null,
  status: call.status ?? null,
  code: call.code ?? null,
  hasCorr: call.hasCorr ?? null,
  error: call.error ?? null,
  cause: call.cause ?? null,
  processes: call.processes ? { runMode: call.processes.runMode ?? null, wrangler: call.processes.wrangler ?? null, workerd: call.processes.workerd ?? null } : null,
});

/** Första avbrottet i ett anropsspår, eller null. */
export function abortInTrace(trace) {
  if (!trace || !Array.isArray(trace.calls)) return null;
  for (const call of trace.calls) {
    if (call.error) {
      // Workern har redan svarat på hälsokontrollen när spåret börjar.
      if (trace.workerReady) return { ...pickCall(call), signature: 'fetch-fel-efter-svar' };
      continue;
    }
    if (typeof call.status === 'number' && call.status >= 500 && (!call.code || !call.hasCorr)) {
      return { ...pickCall(call), signature: '500-utan-kod-eller-korrelation' };
    }
  }
  return null;
}

/** Klassar en körning. Ett avbrott, BLOCKED eller en ofullständig körning blir aldrig PASS. */
export function classifyRun({ exitCode, report, trace, floodCalls }) {
  const abort = abortInTrace(trace);
  if (abort) return { status: 'AVBROTT', reason: abort.signature, abort };
  if (exitCode === 3 || report?.status === 'BLOCKED') return { status: 'BLOCKED', reason: typeof report?.error === 'string' ? report.error.slice(0, 200) : 'BLOCKED', abort: null };
  const reasons = [];
  if (!report) reasons.push('rapport saknas');
  if (!trace) reasons.push('anropsspår saknas');
  else if (trace.complete !== true) reasons.push('ofullständig körning');
  if (report) {
    if (report.status !== 'PASS') reasons.push(`rapportstatus ${report.status}`);
    if (report.complete !== true) reasons.push('fallistan ofullständig');
    const passed = new Set((report.cases ?? []).filter((c) => c.status === 'PASS').map((c) => c.caseId));
    const failed = REQUIRED_CASES.filter((c) => !passed.has(c));
    if (failed.length) reasons.push(`fall utan PASS: ${failed.join(',')}`);
    if (floodCalls > 0) {
      const f = report.flood;
      if (!f) reasons.push('nekandeflöde saknas');
      else if (!(f.ok === true && f.requested === floodCalls && f.completed === floodCalls && f.audit?.expected === floodCalls && f.audit?.logged === floodCalls)) {
        reasons.push(`ofullständigt nekandeflöde ${f.completed ?? 0}/${floodCalls}, logg ${f.audit?.logged ?? 0}/${f.audit?.expected ?? 0}`);
      }
    }
  }
  if (exitCode !== 0) reasons.push(`exit ${exitCode}`);
  return reasons.length ? { status: 'FAIL', reason: reasons.join('; '), abort: null } : { status: 'PASS', reason: null, abort: null };
}

/** Totalstatus. --baseline ger MEASURED (aldrig PASS); annars PASS endast med alla begärda körningar PASS. */
export function summarize(runs, { runs: requestedRuns, floodRuns, baseline }) {
  const counts = Object.fromEntries(STATUSES.map((s) => [s, 0]));
  let unknown = 0;
  for (const run of runs) {
    if (STATUSES.includes(run.status)) counts[run.status] += 1;
    else unknown += 1;
  }
  const expected = requestedRuns + floodRuns;
  const allClassified = unknown === 0 && runs.length === expected;
  let status;
  if (baseline) status = allClassified ? 'MEASURED' : 'FAIL';
  else if (!allClassified) status = 'FAIL';
  else if (counts.PASS === expected && counts.AVBROTT === 0) status = 'PASS';
  else if (counts.AVBROTT === 0 && counts.FAIL === 0) status = 'BLOCKED';
  else status = 'FAIL';
  const exitCode = status === 'PASS' || status === 'MEASURED' ? 0 : status === 'BLOCKED' ? 3 : 1;
  return { status, exitCode, counts, aborts: counts.AVBROTT, abortRate: expected ? Number((counts.AVBROTT / expected).toFixed(4)) : 0 };
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();

function versions() {
  const require = createRequire(path.join(web, 'package.json'));
  const version = (name) => { try { return require(`${name}/package.json`).version; } catch { return null; } };
  return { node: process.version, wrangler: version('wrangler'), miniflare: version('miniflare'), workerd: version('workerd'), postgres: version('postgres') };
}

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

async function preflight() {
  const { assertTarget } = await import('./verify-target.mjs');
  const manifest = await assertTarget('protected');
  const mark = readJson(path.join(web, 'dist-protected/build-mode.json'));
  if (mark?.mode !== 'protected' || !mark.revision) throw new Error('BLOCKED: kör npm run build:protected i web/');
  const routeCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', 'web/app/api/elever/export/route.ts'], { cwd: root, encoding: 'utf8' }).trim();
  try { execFileSync('git', ['merge-base', '--is-ancestor', routeCommit, mark.revision], { cwd: root, stdio: 'ignore' }); }
  catch { throw new Error('BLOCKED: dist-protected är äldre än skriv-/exportroutes; kör npm run build:protected i web/'); }
  const require = createRequire(path.join(web, 'package.json'));
  const postgres = require('postgres');
  const db = postgres(manifest.dbUrl, { max: 1, prepare: false, connect_timeout: 10, onnotice: () => {} });
  try {
    const [{ granted }] = await db`select bool_and(has_function_privilege('skolplattform_worker',f,'execute')) as granted from unnest(${FUNCTIONS}::text[]) f`;
    if (!granted) throw new Error('BLOCKED: migration 20260929170000 är inte tillämpad i protected-målet');
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('BLOCKED:')) throw error;
    throw new Error(`BLOCKED: protected-målet svarar inte (${error?.code ?? 'fel'})`);
  } finally {
    await db.end({ timeout: 5 });
  }
  return mark;
}

function runProbe(args, env, outputFile) {
  return new Promise((resolve) => {
    const output = fs.openSync(outputFile, 'w', 0o600);
    const child = spawn(process.execPath, [probe, ...args], { cwd: root, env, stdio: ['ignore', output, output] });
    const timer = setTimeout(() => { child.kill('SIGTERM'); setTimeout(() => child.kill('SIGKILL'), 5000); }, RUN_TIMEOUT_MS);
    child.on('exit', (code, signal) => { clearTimeout(timer); fs.closeSync(output); resolve(signal ? 124 : (code ?? 1)); });
  });
}

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`REFUSED: ${error.message}`); process.exit(1); }
  const startedAt = new Date().toISOString();
  const revision = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'okänd'; } };
  const base = { kind: 'phase4-worker-stability', scope: 'local-synthetic-only', variant: options.variant, baseline: options.baseline, startedAt, revision: revision(), versions: versions(), requested: { runs: options.runs, floodRuns: options.floodRuns, floodCalls: options.floodCalls, floodKind: options.floodKind, wranglerDebug: options.wranglerDebug } };
  const write = (report) => {
    const text = `${JSON.stringify(report, null, 2)}\n`;
    if (leakPattern.test(text)) throw new Error('rapporten innehåller elevvärde eller hemlighet');
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, text);
  };

  let mark;
  try { mark = await preflight(); }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const blocked = message.startsWith('BLOCKED:') || message.startsWith('REFUSED:');
    console.error(blocked ? message.slice(0, 200) : 'BLOCKED: förkontrollen misslyckades');
    write({ ...base, status: blocked && message.startsWith('REFUSED:') ? 'FAIL' : 'BLOCKED', completedAt: new Date().toISOString(), error: blocked ? message.slice(0, 200) : 'förkontroll', runs: [] });
    process.exit(message.startsWith('REFUSED:') ? 1 : 3);
  }

  const evidence = fs.mkdtempSync(path.join(os.tmpdir(), 'phase4-25-stability-'));
  fs.chmodSync(evidence, 0o700);
  const env = { ...process.env };
  if (options.wranglerDebug) env.WRANGLER_LOG = 'debug';
  const total = options.runs + options.floodRuns;
  const runs = [];
  console.log(`${options.baseline ? 'Baslinje' : 'Stabilitetskörning'} (${options.variant}): ${options.runs} provkörningar + ${options.floodRuns} ${options.floodKind === 'allowed' ? 'kontrollflöden (tillåtna)' : 'nekandeflöden'} à ${options.floodCalls} anrop`);
  for (let i = 0; i < total; i += 1) {
    const kind = i < options.runs ? 'standard' : 'flood';
    const file = (suffix) => path.join(evidence, `run-${String(i + 1).padStart(2, '0')}.${suffix}`);
    const args = ['--target', 'protected', '--port', String(options.portBase + i), '--out', file('report.json'), '--trace', file('trace.json'), '--worker-log', file('worker.log')];
    if (kind === 'flood') args.push('--deny-flood', String(options.floodCalls), '--flood-kind', options.floodKind);
    const t0 = Date.now();
    const exitCode = await runProbe(args, env, file('probe.out'));
    const report = readJson(file('report.json'));
    const trace = readJson(file('trace.json'));
    const result = classifyRun({ exitCode, report, trace, floodCalls: kind === 'flood' ? options.floodCalls : 0 });
    const entry = {
      run: i + 1, kind, status: result.status, reason: result.reason, abort: result.abort, exitCode,
      calls: Array.isArray(trace?.calls) ? trace.calls.length : null,
      flood: kind === 'flood' ? { completed: report?.flood?.completed ?? 0, requested: options.floodCalls, audit: report?.flood?.audit ?? null, nextAfterFailure: report?.flood?.nextAfterFailure ?? null } : null,
      durationMs: Date.now() - t0,
    };
    runs.push(entry);
    const a = result.abort;
    const detail = a
      ? ` vid anrop ${a.n} (${a.caseId}, ${a.route}, ${a.expect === 'deny' ? 'förväntat nekande' : 'förväntat tillåtet'}, ${a.gapMs ?? '-'} ms efter föregående, ${a.status ?? a.error}; wrangler ${a.processes?.wrangler ? 'lever' : 'lever inte'}, workerd ${a.processes?.workerd ? 'lever' : 'lever inte'})`
      : result.reason ? ` (${result.reason.slice(0, 160)})` : '';
    console.log(`#${String(i + 1).padStart(2, '0')} ${kind === 'flood' ? 'flöde  ' : 'standard'} ${result.status}${detail}`);
  }
  const summary = summarize(runs, { runs: options.runs, floodRuns: options.floodRuns, baseline: options.baseline });
  const report = { ...base, completedAt: new Date().toISOString(), workerBuildRevision: mark?.revision ?? null, status: summary.status, counts: summary.counts, aborts: summary.aborts, abortRate: summary.abortRate, evidenceDir: evidence, runs };
  write(report);
  console.log(`Totalstatus: ${summary.status} — PASS ${summary.counts.PASS}, FAIL ${summary.counts.FAIL}, AVBROTT ${summary.counts.AVBROTT}, BLOCKED ${summary.counts.BLOCKED} av ${total}`);
  process.exit(summary.exitCode);
}
