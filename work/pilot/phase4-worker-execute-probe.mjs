#!/usr/bin/env node
// 04-23: verkligt prov av registrets skrivvägar genom byggd protected-Worker mot
// det målskyddade lokala PostgreSQL-målet. Endast syntetiska uppgifter.
//
//   node work/pilot/phase4-worker-execute-probe.mjs --target protected --out work/pilot/results/phase4-23-worker-probe.json
//   [--port 3023]  (egen preview-Worker startas från web/dist-protected)
//
// Sessionerna mintas i målet med samma OIDC-bevisprofil som verify-mandates.mjs
// (issuer/klient från testrealmens manifest, acr/amr). Det provar Workerns MFA-,
// mandat- och auditgränser mot riktig databas men är INTE en interaktiv IdP-inloggning.
//
// Varje körning skapar en egen kund med slump-ID-prefix och provmarkören
// "Syntetiskt 04-23-prov" (fixtur ur phase4_conflicts.test.sql). Städningen är
// begränsad till den kunden och kontrollerar markören först. Säkerhetsloggar raderas
// aldrig. Rapport och terminalutdata innehåller bara fall-ID, status, HTTP-koder,
// antal och händelsenamn – aldrig elevnamn, personnummer, tokens eller nycklar.

import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const results = path.join(root, 'work/pilot/results');
const MARKER = 'Syntetiskt 04-23-prov';
const FUNCTIONS = ['public.phase4_change_pupil(jsonb)', 'public.phase4_resolve_source(jsonb)', 'public.phase4_reveal_personal_number(jsonb)', 'public.phase4_export_pupils(jsonb,boolean)'];
const REQUIRED_CASES = ['worker-role', 'admin-change', 'admin-reveal', 'admin-export', 'no-mfa', 'other-role', 'outside-mandate', 'direct-client-roles', 'persistent-audit'];
const leakPattern = /TEST-\d{8}-\d{4}|Syntetisk elev|sp_session=|postgres(?:ql)?:\/\/|eyJ[A-Za-z0-9_-]{20,}/u;

export function parseArgs(argv) {
  const options = { target: null, out: null, port: 3023 };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    const value = () => { const next = argv[++i]; if (next === undefined) throw new Error(`${arg} saknar värde`); return next; };
    if (arg === '--target') options.target = value();
    else if (arg === '--out') options.out = path.resolve(process.cwd(), value());
    else if (arg === '--port') options.port = Number(value());
    else throw new Error(`okänt argument ${arg}`);
  }
  if (options.target !== 'protected') throw new Error('--target protected krävs');
  if (!options.out) throw new Error('--out krävs');
  if (path.dirname(options.out) !== results && !options.out.startsWith(os.tmpdir()) && !options.out.startsWith('/private/tmp/')) {
    throw new Error('--out måste ligga direkt i work/pilot/results eller i en temporär katalog');
  }
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('ogiltig port');
  return options;
}

const invokedDirectly = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) await main();

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`REFUSED: ${error.message}`); process.exit(1); }
  const startedAt = new Date().toISOString();
  const cases = [];
  const sessions = new Set();
  let manifest, db, server = null, serverErrors = '', baseUrl = null, ready = false, exitCode = 1, fatal = null;
  const prefix = crypto.randomUUID().slice(0, 8);
  const id = (n) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
  const revision = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'okänd'; } };
  const buildMark = () => { try { return JSON.parse(fs.readFileSync(path.join(web, 'dist-protected/build-mode.json'), 'utf8')); } catch { return null; } };

  try {
    manifest = await assertTarget('protected');
    if (!manifest.idp?.issuer || !manifest.idp?.clientId) throw new Error('BLOCKED: manifestet saknar testrealmens issuer/klient för bevisprofilen');
    // Bygget måste innehålla 04-10:s routes; annars vore 404 inte ett ACL-resultat.
    const mark = buildMark();
    if (mark?.mode !== 'protected' || !mark.revision) throw new Error('BLOCKED: kör npm run build:protected i web/');
    const routeCommit = execFileSync('git', ['log', '-1', '--format=%H', '--', 'web/app/api/elever/export/route.ts'], { cwd: root, encoding: 'utf8' }).trim();
    try { execFileSync('git', ['merge-base', '--is-ancestor', routeCommit, mark.revision], { cwd: root, stdio: 'ignore' }); }
    catch { throw new Error('BLOCKED: dist-protected är äldre än skriv-/exportroutes; kör npm run build:protected i web/'); }

    const require = createRequire(path.join(web, 'package.json'));
    const postgres = require('postgres');
    db = postgres(manifest.dbUrl, { max: 3, prepare: false, connect_timeout: 10, onnotice: () => {} });
    const [{ granted }] = await db`select bool_and(has_function_privilege('skolplattform_worker',f,'execute')) as granted from unnest(${FUNCTIONS}::text[]) f`;
    if (!granted) throw new Error('BLOCKED: migration 20260929170000 är inte tillämpad i protected-målet');

    // ---- Egen syntetisk fixtur --------------------------------------------------------------
    const src = fs.readFileSync(path.join(root, 'supabase/tests/phase4_conflicts.test.sql'), 'utf8');
    const start = src.indexOf('-- Mutation fixture:');
    const end = src.indexOf("select has_function('public','phase4_change_pupil'");
    if (start < 0 || end < start) throw new Error('fixturavsnittet saknas i phase4_conflicts.test.sql');
    const code = String(parseInt(prefix.slice(0, 5), 16)).padStart(7, '0').slice(0, 6);
    const fixture = src.slice(start, end)
      .replaceAll('44005000', prefix)
      .replaceAll('Syntetiskt ändringsprov', MARKER)
      .replaceAll('mutation.example.test', `${prefix}.worker-execute.example.test`)
      .replaceAll("'440050'||n", `'${code}'||n`);
    const roles = {};
    await assertTarget('protected');
    await db.begin(async (tx) => {
      await tx.unsafe(fixture);
      // Administratör med mandat bara på skola 32 (eleven går på skola 30).
      await tx.unsafe(`insert into public.identities(id,issuer,subject) values('${id(14)}','https://${prefix}.worker-execute.example.test','14');
        insert into public.memberships(id,identity_id,customer_id) values('${id(24)}','${id(14)}','${id(1)}');
        select pg_temp.ma('principal');
        insert into mutation_roles values('outside',public.phase3_grant_mandate(jsonb_build_object('membershipId','${id(24)}'::uuid,'function','administrator','scopeKind','school','unitIds',jsonb_build_array('${id(32)}'::uuid))));`);
      for (const row of await tx`select name,id from mutation_roles`) roles[row.name] = row.id;
    });
    ready = true;
    const [{ year }] = await db`select (extract(year from public.app_today())::integer-case when extract(month from public.app_today())<7 then 1 else 0 end) as year`;
    const pupilId = id(70);
    const pupilVersion = async () => (await db`select version from public.pupils where id=${pupilId}`)[0].version;
    const storedNumber = async () => (await db`select personal_number from public.pupils where id=${pupilId}`)[0].personal_number;

    // ---- Sessioner och HTTP ------------------------------------------------------------------
    const mfaProof = { acr: '2', amr: ['pwd', 'otp'] };
    const noMfaProof = { acr: '1', amr: ['pwd'] };
    const mint = async ({ identityId, membershipId, assignmentId }, proof = mfaProof) => {
      const token = crypto.randomBytes(32).toString('base64url');
      const hash = crypto.createHash('sha256').update(token).digest();
      const [row] = await db`insert into public.app_sessions
        (token_hash, identity_id, membership_id, assignment_id, acr, amr, auth_time,
         proof_issuer, proof_client_id, proof_audience, proof_profile_id, proof_profile_version, proof_checked_at, expires_at, absolute_expires_at)
        values (${hash}, ${identityId}, ${membershipId}, ${assignmentId}, ${proof.acr}, ${proof.amr}, now(),
          ${manifest.idp.issuer}, ${manifest.idp.clientId}, ${[manifest.idp.clientId]}, 'local-keycloak-admin', 1, now(),
          now() + interval '15 minutes', now() + interval '8 hours')
        returning id::text as id, context_epoch::text as epoch`;
      sessions.add(row.id);
      return { token, epoch: Number(row.epoch) };
    };
    const call = async (session, route, body) => {
      const headers = new Headers({ Cookie: `sp_session=${session.token}`, 'Sec-Fetch-Site': 'same-origin', 'Content-Type': 'application/json' });
      if (Number.isInteger(session.epoch)) headers.set('X-Context-Epoch', String(session.epoch));
      const response = await fetch(`${baseUrl}${route}`, { method: 'POST', headers, body: JSON.stringify(body) });
      const text = await response.text();
      let parsed = null;
      try { parsed = text ? JSON.parse(text) : null; } catch { /* CSV */ }
      return { status: response.status, body: parsed, text, headers: Object.fromEntries(response.headers), corr: response.headers.get('x-correlation-id') };
    };
    const correlations = { allowed: [], denied: [] };
    const events = async (response) => {
      if (!response.corr) return [];
      return db`select action, outcome, object_type is not null as object from public.security_events where correlation_id=${response.corr}::uuid order by id`;
    };
    const summary = (list) => list.map((e) => `${e.action}|${e.outcome}`);
    const check = (list, name, ok, detail = '') => list.push({ check: name, ok: Boolean(ok), detail: String(detail).slice(0, 200) });
    const run = async (caseId, fn) => {
      const checks = [];
      try { await fn(checks); }
      catch (error) { check(checks, 'fallet kunde köras', false, `${error instanceof Error ? error.constructor.name : 'fel'}${server && server.exitCode !== null ? ' (Workern har avslutats)' : ''}`); }
      const status = checks.length > 0 && checks.every((c) => c.ok) ? 'PASS' : 'FAIL';
      cases.push({ caseId, status, checks });
      console.log(`${status === 'PASS' ? 'ok ' : 'FEL'} ${caseId} (${checks.filter((c) => c.ok).length}/${checks.length})`);
      for (const c of checks.filter((x) => !x.ok)) console.log(`     - ${c.check}: ${c.detail}`);
    };

    const actor = (name, identityN, membershipN) => ({ identityId: id(identityN), membershipId: id(membershipN), assignmentId: roles[name] });
    const card = () => ({ pupilId, schoolYear: year, caseId: null });
    const change = async (displayName) => ({ ...card(), expectedVersion: await pupilVersion(), kind: 'basics', payload: { displayName } });
    const exportBody = (mode, includePersonalNumber) => ({ mode, export: { mode: 'ids', ids: [pupilId], schoolYear: year, caseId: null, fields: ['id', 'displayName'], protectedIds: [], includePersonalNumber } });

    // ---- Worker -------------------------------------------------------------------------------
    const health = async (url) => {
      try { const r = await fetch(`${url}/api/health/db`); const b = await r.json(); return r.ok && b?.role === 'skolplattform_worker'; }
      catch { return false; }
    };
    baseUrl = `http://127.0.0.1:${options.port}`;
    if (await health(baseUrl)) throw new Error(`BLOCKED: port ${options.port} är redan upptagen`);
    server = spawn(process.execPath, ['scripts/run-mode.mjs', 'preview', '--mode', 'protected', '--port', String(options.port)], { cwd: web, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    server.stdout.on('data', (chunk) => { serverErrors = `${serverErrors}${chunk}`.slice(-40000); });
    server.stderr.on('data', (chunk) => { serverErrors = `${serverErrors}${chunk}`.slice(-2000); });
    let up = false;
    for (const deadline = Date.now() + 90_000; Date.now() < deadline && server.exitCode === null;) {
      if (await health(baseUrl)) { up = true; break; }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    if (!up) throw new Error('BLOCKED: protected-Workern startade inte');

    await run('worker-role', async (checks) => {
      check(checks, 'Workern ansluter som skolplattform_worker', await health(baseUrl));
      const [{ n }] = await db`select count(*)::int as n from unnest(${FUNCTIONS}::text[]) f where has_function_privilege('skolplattform_worker',f,'execute')`;
      check(checks, 'Worker har körrätt på de fyra funktionerna', n === 4, `${n}/4`);
    });

    const admin = await mint(actor('admin', 12, 22));
    await run('admin-change', async (checks) => {
      const before = await pupilVersion();
      const r = await call(admin, '/api/elever/andra', await change('Syntetisk elev ändrad'));
      correlations.allowed.push(r.corr);
      const after = await pupilVersion();
      check(checks, 'behörig administratör med MFA ändrar (HTTP 200)', r.status === 200, `HTTP ${r.status} ${r.body?.code ?? ''}`);
      check(checks, 'svaret har ny version och inga elevvärden', r.body?.version === before + 1 && after === before + 1 && !leakPattern.test(r.text), `version +${after - before}`);
      const ev = summary(await events(r));
      check(checks, 'ändringen har committad pupil_updated-händelse', ev.includes('pupil_updated|ok') && ev.every((e) => e.endsWith('|ok')), ev.join(','));
    });

    await run('admin-reveal', async (checks) => {
      const number = await storedNumber();
      const first = await call(admin, '/api/elever/personnummer', card());
      const second = await call(admin, '/api/elever/personnummer', card());
      correlations.allowed.push(first.corr, second.corr);
      check(checks, 'personnummer lämnas vid uttryckligt anrop med MFA (HTTP 200 x2)', first.status === 200 && second.status === 200, `HTTP ${first.status}/${second.status}`);
      check(checks, 'lämnat nummer är elevens lagrade syntetiska nummer', first.body?.personalNumber === number && second.body?.personalNumber === number, 'jämfört utan utskrift');
      const a = await events(first), b = await events(second);
      // Per anrop och egen korrelation: huvudhändelse + objekthändelse för visningen (04-10);
      // båda bär elevobjektet, därför räknas exakt två.
      const own = (list) => list.length === 2 && list.every((e) => e.object && e.action === 'pupil_personal_number_read' && e.outcome === 'ok');
      check(checks, 'varje anrop har egen visningshändelse utöver huvudhändelsen', own(a) && own(b) && first.corr !== second.corr, `${summary(a).join(',')} ; ${summary(b).join(',')}`);
    });

    await run('admin-export', async (checks) => {
      const preview = await call(admin, '/api/elever/export', exportBody('preview', false));
      const download = await call(admin, '/api/elever/export', exportBody('download', true));
      correlations.allowed.push(preview.corr, download.corr);
      check(checks, 'preview ger antal utan rader (HTTP 200)', preview.status === 200 && preview.body?.count === 1 && !('rows' in (preview.body ?? {})) && !leakPattern.test(preview.text), `HTTP ${preview.status} antal ${preview.body?.count}`);
      const lines = download.text.replace(/^﻿/u, '').split('\r\n').filter(Boolean);
      check(checks, 'nedladdning med MFA ger CSV med rubrik och en rad', download.status === 200 && /text\/csv/u.test(download.headers['content-type'] ?? '') && /attachment/u.test(download.headers['content-disposition'] ?? '') && lines.length === 2, `HTTP ${download.status} rader ${lines.length}`);
      const p = summary(await events(preview)), d = summary(await events(download));
      check(checks, 'preview och nedladdning loggas med egna händelser', p.includes('pupil_export_preview|ok') && d.includes('pupil_exported|ok') && d.includes('pupil_personal_number_exported|ok'), `${p.join(',')} ; ${d.join(',')}`);
    });

    const noMfa = await mint(actor('admin', 12, 22), noMfaProof);
    await run('no-mfa', async (checks) => {
      const before = await pupilVersion();
      const changed = await call(noMfa, '/api/elever/andra', await change('Syntetisk elev nekad'));
      const revealed = await call(noMfa, '/api/elever/personnummer', card());
      const download = await call(noMfa, '/api/elever/export', exportBody('download', true));
      const preview = await call(noMfa, '/api/elever/export', exportBody('preview', false));
      const denied = [changed, revealed, download];
      correlations.denied.push(...denied.map((r) => r.corr));
      correlations.allowed.push(preview.corr);
      check(checks, 'ändring, personnummer och nedladdning nekas utan MFA', denied.every((r) => r.status === 403 && r.body?.code === 'mfa_required'), denied.map((r) => `${r.status}/${r.body?.code}`).join(' '));
      check(checks, 'inget elevinnehåll och ingen ändring', denied.every((r) => !leakPattern.test(r.text)) && await pupilVersion() === before, 'kontrollerat');
      check(checks, 'preview utan MFA ger bara antal (04-10)', preview.status === 200 && preview.body?.count === 1 && !leakPattern.test(preview.text), `HTTP ${preview.status}`);
    });

    const principal = await mint(actor('principal', 11, 21));
    await run('other-role', async (checks) => {
      const before = await pupilVersion();
      const list = [await call(principal, '/api/elever/andra', await change('Syntetisk elev nekad')), await call(principal, '/api/elever/personnummer', card()), await call(principal, '/api/elever/export', exportBody('preview', false)), await call(principal, '/api/elever/export', exportBody('download', true))];
      correlations.denied.push(...list.map((r) => r.corr));
      check(checks, 'rektor (annan funktion) nekas på alla skrivvägar', list.every((r) => r.status === 403 && r.body?.code === 'forbidden'), list.map((r) => `${r.status}/${r.body?.code}`).join(' '));
      check(checks, 'inget elevinnehåll och ingen ändring', list.every((r) => !leakPattern.test(r.text)) && await pupilVersion() === before, 'kontrollerat');
    });

    const outside = await mint(actor('outside', 14, 24));
    await run('outside-mandate', async (checks) => {
      const before = await pupilVersion();
      const list = [await call(outside, '/api/elever/andra', await change('Syntetisk elev nekad')), await call(outside, '/api/elever/personnummer', card()), await call(outside, '/api/elever/export', exportBody('preview', false)), await call(outside, '/api/elever/export', exportBody('download', true))];
      correlations.denied.push(...list.map((r) => r.corr));
      check(checks, 'administratör utan mandat på elevens skola nekas', list.every((r) => [403, 404].includes(r.status)), list.map((r) => `${r.status}/${r.body?.code}`).join(' '));
      check(checks, 'inget elevinnehåll och ingen ändring', list.every((r) => !leakPattern.test(r.text)) && await pupilVersion() === before, 'kontrollerat');
    });

    await run('direct-client-roles', async (checks) => {
      const states = [];
      for (const role of ['anon', 'authenticated']) {
        for (const fn of FUNCTIONS) {
          const statement = fn.includes('export') ? `select ${fn.split('(')[0]}('{}'::jsonb,true)` : `select ${fn.split('(')[0]}('{}'::jsonb)`;
          let state = 'ok';
          try { await db.begin(async (tx) => { await tx.unsafe(`set local role ${role}`); await tx.unsafe(statement); }); }
          catch (error) { state = /^[0-9A-Z]{5}$/u.test(error?.code ?? '') ? error.code : 'unknown'; }
          states.push(`${role}:${state}`);
        }
      }
      check(checks, 'anon och authenticated nekas körrätt på de fyra funktionerna i databasen', states.length === 8 && states.every((s) => s.endsWith(':42501')), states.join(' '));
      let workerState = 'ok';
      try { await db.begin(async (tx) => { await tx.unsafe('set local role skolplattform_worker'); await tx.unsafe(`select public.phase4_reveal_personal_number(jsonb_build_object('pupilId','${pupilId}'::uuid,'schoolYear',${Number(year)},'caseId',null))`); }); }
      catch (error) { workerState = /^[0-9A-Z]{5}$/u.test(error?.code ?? '') ? error.code : 'unknown'; }
      check(checks, 'Worker-roll utan serverns sessionskontext får inget personnummer', workerState !== 'ok', workerState);
      const rest = [];
      for (const fn of FUNCTIONS) {
        const r = await fetch(new URL(`/rest/v1/rpc/${fn.split('(')[0].replace('public.', '')}`, manifest.apiUrl), {
          method: 'POST', headers: { apikey: manifest.anonKey, Authorization: `Bearer ${manifest.anonKey}`, 'Content-Type': 'application/json', Connection: 'close' },
          body: JSON.stringify({ request: {} }),
        });
        const text = await r.text();
        rest.push({ status: r.status, leak: leakPattern.test(text) });
      }
      check(checks, 'anonymt PostgREST-anrop via Kong nekas utan innehåll', rest.every((r) => r.status >= 400 && !r.leak), rest.map((r) => r.status).join('/'));
    });

    await run('persistent-audit', async (checks) => {
      const allowed = correlations.allowed.filter(Boolean), denied = correlations.denied.filter(Boolean);
      check(checks, 'alla anrop hade korrelations-ID', allowed.length === correlations.allowed.length && denied.length === correlations.denied.length, `${allowed.length}+${denied.length}`);
      const [a] = await db`select count(distinct correlation_id)::int as n, bool_and(outcome='ok') as ok from public.security_events where correlation_id=any(${allowed}::uuid[])`;
      check(checks, 'tillåtna fall har beständiga ok-händelser', a.n === allowed.length && a.ok === true, `${a.n}/${allowed.length}`);
      const [d] = await db`select count(distinct correlation_id)::int as n from public.security_events where correlation_id=any(${denied}::uuid[]) and outcome='denied'`;
      check(checks, 'nekade fall har beständiga denied-händelser', d.n === denied.length, `${d.n}/${denied.length}`);
      const number = await storedNumber();
      const [l] = await db`select coalesce(bool_or(coalesce(details::text,'') like '%Syntetisk elev%' or position(${number} in coalesce(details::text,''))>0),false) as leak from public.security_events where correlation_id=any(${[...allowed, ...denied]}::uuid[])`;
      check(checks, 'loggdetaljer saknar elevnamn och personnummer', l.leak === false, 'kontrollerat');
    });

    const complete = REQUIRED_CASES.every((name) => cases.some((c) => c.caseId === name));
    const status = complete && cases.every((c) => c.status === 'PASS') ? 'PASS' : 'FAIL';
    const report = {
      kind: 'phase4-worker-execute', scope: 'local-synthetic-only',
      proof: 'lokalt mintade sessioner med testrealmens bevisprofil mot byggd protected-Worker och verifierat protected-mål; ingen interaktiv IdP-inloggning eller kommunanslutning',
      startedAt, completedAt: new Date().toISOString(), revision: revision(), workerBuildRevision: buildMark()?.revision ?? null,
      target: 'protected', requiredCases: REQUIRED_CASES, complete, status, cases,
    };
    if (leakPattern.test(JSON.stringify(report))) { report.status = 'FAIL'; report.validationErrors = ['rapporten innehåller elevvärde eller hemlighet']; }
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`);
    console.log(`Totalstatus: ${report.status} (${cases.filter((c) => c.status === 'PASS').length}/${REQUIRED_CASES.length} fall)`);
    exitCode = report.status === 'PASS' ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fatal = message.startsWith('BLOCKED:') || message.startsWith('REFUSED:') ? message.slice(0, 200) : (error?.code && /^[A-Z0-9_]{1,40}$/u.test(error.code) ? error.code : 'FAILED');
    const blocked = message.startsWith('BLOCKED:') || ['CONNECT_TIMEOUT', 'ECONNREFUSED'].includes(error?.code);
    exitCode = blocked ? 3 : 1;
    console.error(fatal);
    try {
      fs.mkdirSync(path.dirname(options.out), { recursive: true });
      fs.writeFileSync(options.out, `${JSON.stringify({ kind: 'phase4-worker-execute', status: blocked ? 'BLOCKED' : 'FAIL', startedAt, completedAt: new Date().toISOString(), revision: revision(), complete: false, cases, error: fatal }, null, 2)}\n`);
    } catch { /* rapporten kan inte skrivas */ }
  } finally {
    // Felsökning: Workerns stderr går aldrig till rapporten, bara till en 0600-fil i tmp.
    if (exitCode !== 0 && serverErrors) {
      const log = path.join(os.tmpdir(), `phase4-23-worker-stderr-${process.pid}.log`);
      try { fs.writeFileSync(log, serverErrors, { mode: 0o600 }); console.error(`Workerns stderr: ${log}`); } catch { /* ignoreras */ }
    }
    if (server && server.exitCode === null) {
      server.kill('SIGTERM');
      await new Promise((resolve) => { server.once('exit', resolve); setTimeout(resolve, 3000); });
      if (server.exitCode === null) server.kill('SIGKILL');
    }
    if (db) {
      try { if (sessions.size) await db`delete from public.app_sessions where id=any(${[...sessions]}::uuid[])`; }
      catch { console.error('Städning av sessioner misslyckades'); exitCode = exitCode || 1; }
      if (ready) {
        try {
          await assertTarget('protected');
          await db.begin(async (tx) => {
            const [{ owned }] = await tx`select exists(select 1 from public.customers where id=${id(1)} and name=${MARKER}) as owned`;
            if (!owned || !/^[0-9a-f]{8}$/u.test(prefix)) throw new Error('ownership');
            await tx`set local session_replication_role=replica`;
            for (const table of ['pupil_source_values', 'pupil_field_history', 'pupil_field_state', 'pupil_home_municipalities', 'pupil_class_memberships', 'pupil_placements', 'pupils', 'protected_identity_permissions', 'mandate_units', 'access_assignments', 'school_classes']) {
              await tx.unsafe(`delete from public.${table} where customer_id=$1`, [id(1)]);
            }
            await tx`delete from public.assignment_units where assignment_id in (select id from public.assignments where organizer_id=${id(2)})`;
            await tx`delete from public.staff_assignment_bindings where customer_id=${id(1)}`;
            await tx`delete from public.assignments where organizer_id=${id(2)}`;
            await tx`delete from public.offerings where organizer_id=${id(2)}`;
            await tx`delete from public.school_units where organizer_id=${id(2)}`;
            await tx`delete from public.memberships where customer_id=${id(1)}`;
            await tx`delete from public.organizers where id=${id(2)}`;
            await tx`delete from public.identities where id in (${id(10)},${id(11)},${id(12)},${id(13)},${id(14)})`;
            await tx`delete from public.customers where id=${id(1)}`;
          });
        } catch { console.error('Städning av provfixturen misslyckades'); exitCode = exitCode || 1; }
      }
      await db.end({ timeout: 5 });
    }
  }
  process.exit(exitCode);
}
