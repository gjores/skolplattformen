#!/usr/bin/env node
// 04-16: lokala, syntetiska registerfall genom byggd protected-Worker.
// Rapporten får bara innehålla fallnamn, resultat och minimerade kontroller.
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { PHASE4_IDS as F, PHASE4_USERS as U } from './phase4-browser-fixtures.mjs';
import { sources, docker } from './configure-audit-source.mjs';
import { collectKong, correlateKong } from './collect-denials.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const web = path.join(root, 'web');
const reports = path.join(root, 'work/pilot/results');

export const REQUIRED_CASES = [
  'register-reload', 'placement-change', 'class-change', 'source-discrepancy', 'search-filter',
  'concurrent-edit', 'protected-admin', 'protected-teacher', 'protected-unauthorized',
  'protected-direct', 'protected-grant-revoke', 'historical-readonly', 'export-selection',
  'export-direct-denied', 'export-personnummer', 'audit-register-read-fail',
  'audit-register-write-rollback', 'retired-probe',
];

export function parseArgs(argv) {
  const options = { cases: [], out: path.join(reports, 'phase4-api.json'), port: 3046 };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => { if (i + 1 >= argv.length) throw new Error(`${arg} saknar värde`); return argv[++i]; };
    if (arg === '--case') options.cases.push(next());
    else if (arg === '--out') options.out = path.resolve(process.cwd(), next());
    else if (arg === '--port') options.port = Number(next());
    else throw new Error(`okänt argument ${arg}`);
  }
  if (options.cases.some(name => !REQUIRED_CASES.includes(name))) throw new Error('okänt fall');
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('ogiltig port');
  const allowedTmp = [os.tmpdir(), '/private/tmp', '/tmp'].some(dir => options.out.startsWith(`${dir}/`));
  if (path.dirname(options.out) !== reports && !allowedTmp) throw new Error('--out måste ligga i work/pilot/results eller /tmp');
  options.subset = options.cases.length > 0;
  options.cases = options.subset ? REQUIRED_CASES.filter(name => options.cases.includes(name)) : [...REQUIRED_CASES];
  return options;
}

export function overallStatus(results, { subset = false } = {}) {
  if (results.some(item => item.status === 'FAIL')) return 'FAIL';
  if (results.some(item => item.status === 'BLOCKED')) return 'BLOCKED';
  if (results.some(item => item.status !== 'PASS' || !Array.isArray(item.checks) ||
    !['response', 'persistent'].every(kind => item.checks.some(check => check.kind === kind && check.ok === true)) ||
    item.checks.some(check => check.ok !== true))) return 'FAIL';
  if (subset) return 'PARTIAL';
  const names = results.map(item => item.name);
  return names.length === REQUIRED_CASES.length && new Set(names).size === REQUIRED_CASES.length &&
    REQUIRED_CASES.every(name => names.includes(name)) ? 'PASS' : 'FAIL';
}

// De två periodbytesproven behöver en entydig egen provgrund. Beständiga
// visningsfixturer kan ha användarsparad historik/framtida perioder: behåll dem.
export function currentRegisterProbePeriods(placements,classes,today,unitId){
  const day=value=>typeof value==='string'?value.slice(0,10):value.toISOString().slice(0,10);
  const current=row=>day(row.starts_on)<=today&&(row.ends_on===null||day(row.ends_on)>=today);
  const active=placements.filter(row=>row.unit_id===unitId&&current(row));
  if(active.length!==1)throw new Error('BLOCKED: current scoped placement fixture is not unique');
  const activeClasses=classes.filter(row=>row.unit_id===unitId&&row.placement_id===active[0].id&&current(row));
  if(activeClasses.length!==1)throw new Error('BLOCKED: current scoped class fixture is not unique');
  return {placements:[{...active[0],ends_on:null}],classes:activeClasses.map(row=>({...row,ends_on:null}))};
}

const direct = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (direct) await main();

async function main() {
  let options;
  try { options = parseArgs(process.argv.slice(2)); }
  catch (error) { console.error(`REFUSED: ${error.message}`); process.exitCode = 1; return; }
  const results = [];
  const report = { status: 'BLOCKED', cases: results, revision: null, target: 'protected' };
  let db = null, server = null, serverLog = '', failure = null, stage = 'target';
  const sessions = new Set();
  try {
    const manifest = await assertTarget('protected', { requireIdp: true });
    stage = 'build';
    const mark = JSON.parse(fs.readFileSync(path.join(web, 'dist-protected/build-mode.json'), 'utf8'));
    if (mark.mode !== 'protected' || !mark.revision) throw new Error('BLOCKED: bygg protected-Workern först');
    const latestRoute = execFileSync('git', ['log', '-1', '--format=%H', '--', 'web/app/api/elever/export/route.ts'], { cwd: root, encoding: 'utf8' }).trim();
    try { execFileSync('git', ['merge-base', '--is-ancestor', latestRoute, mark.revision], { cwd: root, stdio: 'ignore' }); }
    catch { throw new Error('BLOCKED: protected-bygget saknar registerrutterna'); }
    const require = createRequire(path.join(web, 'package.json'));
    db = require('postgres')(manifest.dbUrl, { max: 3, prepare: false, connect_timeout: 10, onnotice: () => {} });
    report.revision = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
    stage = 'cases';
    await runCases({ options, report, results, manifest, db, sessions, setServer: child => { server = child; }, appendLog: chunk => { serverLog = `${serverLog}${chunk}`.slice(-4000); } });
  } catch (error) {
    if (String(error?.message ?? '').startsWith('BLOCKED:')) console.error(String(error.message).slice(0, 160));
    failure = String(error?.message ?? '').startsWith('BLOCKED:') ? 'environment-unavailable' : 'execution-failed';
  } finally {
    if (server && server.exitCode === null) { server.kill('SIGTERM'); await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 3000); }); }
    if (db) {
      // Enbart egna temporära appsessioner; säkerhetshändelser behålls.
      if (sessions.size) await db`delete from public.app_sessions where id=any(${[...sessions]}::uuid[])`.catch(() => { failure = 'session-cleanup-failed'; });
      await db.end();
    }
    report.status = failure ? failure === 'environment-unavailable' ? 'BLOCKED' : 'FAIL' : overallStatus(results, { subset: options.subset });
    if (failure) { report.failureCode = failure; report.failureStage = stage; }
    fs.mkdirSync(path.dirname(options.out), { recursive: true });
    fs.writeFileSync(options.out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
    console.log(JSON.stringify({ status: report.status, cases: results.map(({ name, status }) => ({ name, status })), ...(failure ? { failureCode: failure, failureStage: stage } : {}) }));
    process.exitCode = report.status === 'PASS' || report.status === 'PARTIAL' ? 0 : report.status === 'BLOCKED' ? 3 : 1;
  }
}

async function runCases({ options, results, manifest, db, sessions, setServer, appendLog }) {
  const ownPupils = new Set();
  const today = (await db`select public.app_today()::text as day`)[0].day;
  const year = Number(today.slice(0, 4)) - (Number(today.slice(5, 7)) < 7 ? 1 : 0);
  const shiftDay = (iso, days) => new Date(Date.parse(`${iso}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
  const card = pupilId => ({ pupilId, schoolYear: year, caseId: null });
  const selection = (extra = {}) => ({ schoolYear: year, unitId: F.unit, classId: null, educationId: null, grade: null, status: null, page: 1, ...extra });
  const listBody = (extra = {}, search = '') => ({ selection: selection(extra), search, caseId: null });
  const exportBody = (mode, ids, options = {}) => ({ mode, export: { mode: 'ids', ids, schoolYear: year, caseId: null,
    fields: ['id', 'displayName'], protectedIds: [], includePersonalNumber: false, ...options } });
  const check = (checks, kind, name, ok) => checks.push({ kind, name, ok: Boolean(ok) });
  const run = async (name, fn) => {
    if (!options.cases.includes(name)) return;
    const checks = [];
    try { await fn(checks); }
    catch { check(checks, 'response', 'fallet kunde köras', false); }
    const status = checks.length >= 2 && checks.every(item => item.ok) &&
      ['response', 'persistent'].every(kind => checks.some(item => item.kind === kind)) ? 'PASS' : 'FAIL';
    results.push({ name, status, checks });
    console.log(`${status === 'PASS' ? 'ok' : 'FEL'} ${name} (${checks.filter(x => x.ok).length}/${checks.length})`);
  };
  const actor = async (username, fn) => {
    const subject = manifest.idp.users.find(item => item.username === username)?.subject;
    if (!subject) throw new Error('BLOCKED: provkontot saknas; kör phase4-browser-fixtures');
    const rows = await db`select i.id::text as identity, m.id::text as membership, a.id::text as assignment
      from public.identities i join public.memberships m on m.identity_id=i.id
      join public.access_assignments a on a.membership_id=m.id
      where i.issuer=${manifest.idp.issuer} and i.subject=${subject} and a.function=${fn}::public.access_function
        and public.phase3_mandate_is_valid(a.id)
      order by a.created_at desc nulls last limit 1`;
    if (rows.length !== 1) throw new Error('BLOCKED: giltigt provmandat saknas');
    return rows[0];
  };
  const mint = async (who, mfa = true) => {
    const token = crypto.randomBytes(32).toString('base64url');
    const hash = crypto.createHash('sha256').update(token).digest();
    const [row] = await db`insert into public.app_sessions
      (token_hash, identity_id, membership_id, assignment_id, acr, amr, auth_time,
       proof_issuer, proof_client_id, proof_audience, proof_profile_id,
       proof_profile_version, proof_checked_at, expires_at, absolute_expires_at)
      values (${hash},${who.identity},${who.membership},${who.assignment},${mfa ? '2' : '1'},${mfa ? ['pwd','otp'] : ['pwd']},now(),
       ${manifest.idp.issuer},${manifest.idp.clientId},${[manifest.idp.clientId]},'local-keycloak-admin',1,now(),
       now()+interval '15 minutes',now()+interval '8 hours') returning id::text as id,context_epoch::text as epoch`;
    sessions.add(row.id);
    return { token, epoch: Number(row.epoch) };
  };
  const baseUrl = `http://127.0.0.1:${options.port}`;
  const call = async (session, method, route, body) => {
    const headers = new Headers({ Cookie: `sp_session=${session.token}`, 'Sec-Fetch-Site': 'same-origin' });
    if (Number.isInteger(session.epoch)) headers.set('X-Context-Epoch', String(session.epoch));
    if (body !== undefined) headers.set('Content-Type', 'application/json');
    const response = await fetch(`${baseUrl}${route}`, { method, headers, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* CSV eller tom kropp */ }
    const epoch = Number(response.headers.get('X-Context-Epoch'));
    if (Number.isInteger(epoch) && epoch > 0) session.epoch = epoch;
    return { status: response.status, body: parsed, text, corr: response.headers.get('x-correlation-id'), contentType: response.headers.get('content-type') };
  };
  const post = (session, route, body) => call(session, 'POST', route, body);
  const get = (session, route) => call(session, 'GET', route);
  const events = async response => response.corr ? db`select action,outcome,details from public.security_events where correlation_id=${response.corr}::uuid order by id` : [];
  const event = async (response, action, outcome = 'ok') => (await events(response)).some(row => row.action === action && row.outcome === outcome);
  const version = async pupilId => (await db`select version from public.pupils where id=${pupilId}`)[0]?.version;
  const change = async (session, pupilId, kind, payload, expectedVersion) => post(session, '/api/elever/andra', {
    ...card(pupilId), expectedVersion: expectedVersion ?? await version(pupilId), kind, payload,
  });
  const clone = async (sourceId,{currentPeriodsOnly=false}={}) => {
    const id = crypto.randomUUID();
    await assertTarget('protected');
    await db.begin(async tx => {
      const [number] = await tx`select s.personal_number from public.synthetic_pupil_numbers s
        where not exists(select 1 from public.pupils p where p.customer_id=${F.customer} and p.personal_number=s.personal_number)
        order by s.personal_number limit 1`;
      if (!number) throw new Error('BLOCKED: fria syntetnummer saknas');
      await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,protected_identity,anonymous_name)
        select ${id},customer_id,organizer_id,'Syntetiskt 04-16 körprov',${number.personal_number},false,'Provperson'
        from public.pupils where id=${sourceId}`;
      const placementRows=await tx`select id,customer_id,organizer_id,unit_id,offering_id,starts_on,ends_on from public.pupil_placements where pupil_id=${sourceId}`;
      const classRows=await tx`select customer_id,organizer_id,unit_id,class_id,placement_id,starts_on,ends_on from public.pupil_class_memberships where pupil_id=${sourceId}`;
      const periods=currentPeriodsOnly?currentRegisterProbePeriods(placementRows,classRows,today,F.unit):{placements:placementRows,classes:classRows};
      const placementMap = new Map();
      for (const row of periods.placements) {
        const newId = crypto.randomUUID(); placementMap.set(row.id, newId);
        await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on,ends_on)
          values(${newId},${row.customer_id},${row.organizer_id},${id},${row.unit_id},${row.offering_id},${row.starts_on},${row.ends_on})`;
      }
      for (const row of periods.classes) {
        await tx`insert into public.pupil_class_memberships(id,customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
          values(${crypto.randomUUID()},${row.customer_id},${row.organizer_id},${id},${row.unit_id},${row.class_id},${placementMap.get(row.placement_id)},${row.starts_on},${row.ends_on})`;
      }
      for (const row of await tx`select customer_id,organizer_id,municipality_code,starts_on,ends_on from public.pupil_home_municipalities where pupil_id=${sourceId}`) {
        await tx`insert into public.pupil_home_municipalities(id,customer_id,organizer_id,pupil_id,municipality_code,starts_on,ends_on)
          values(${crypto.randomUUID()},${row.customer_id},${row.organizer_id},${id},${row.municipality_code},${row.starts_on},${row.ends_on})`;
      }
    });
    ownPupils.add(id);
    return id;
  };
  const health = async () => { try { const r = await fetch(`${baseUrl}/api/health/db`); const b = await r.json(); return r.ok && b.role === 'skolplattform_worker'; } catch { return false; } };
  if (await health()) throw new Error('BLOCKED: egen provport upptagen');
  const server = spawn(process.execPath, ['scripts/run-mode.mjs','preview','--mode','protected','--port',String(options.port)], { cwd: web, env: process.env, stdio: ['ignore','pipe','pipe'] });
  setServer(server);
  server.stdout.on('data', appendLog); server.stderr.on('data', appendLog);
  let ready = false;
  for (let end = Date.now() + 90000; Date.now() < end && server.exitCode === null;) {
    if (await health()) { ready = true; break; }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw new Error('BLOCKED: protected-Workern startade inte');
  const admins = {
    safe: await mint(await actor(U.protectedAdmin, 'administrator')),
    ordinary: await mint(await actor(U.unprotectedAdmin, 'administrator')),
    principal: await mint(await actor(U.principal, 'rektor')),
    teacher: await mint(await actor(U.teacherInClass, 'larare')),
    outsideTeacher: await mint(await actor(U.teacherOutsideGroup, 'larare')),
    otherSchool: await mint(await actor(U.adminOtherSchool, 'administrator')),
    otherCustomer: await mint(await actor(U.adminOtherCustomer, 'administrator')),
    hm: await mint(await actor(U.organizer, 'huvudman')),
  };
  try {
    await run('register-reload', async checks => {
      const first = await post(admins.ordinary, '/api/elever/lista', listBody({}, 'Alex Prov'));
      const secondSession = await mint(await actor(U.unprotectedAdmin, 'administrator'));
      const second = await get(secondSession, `/api/elever/elev?pupilId=${F.namesakeA}&schoolYear=${year}`);
      check(checks, 'response', 'ny session återfinner samma stabila elev-ID och namnlika rader',
        first.status === 200 && first.body?.pupils?.some(p => p.id === F.namesakeA) && first.body?.pupils?.some(p => p.id === F.namesakeB) &&
        second.status === 200 && second.body?.id === F.namesakeA);
      check(checks, 'persistent', 'båda läsningarna har egna beständiga registerhändelser',
        await event(first, 'pupil_list_read') && await event(second, 'pupil_read') && first.corr !== second.corr);
    });
    await run('placement-change', async checks => {
      const pupil = await clone(F.namesakeA,{currentPeriodsOnly:true});
      const [placement] = await db`select id,offering_id,starts_on from public.pupil_placements where pupil_id=${pupil}`;
      const prior = await version(pupil);
      const response = await change(admins.ordinary, pupil, 'transfer', { placementId: placement.id, unitId: F.unit,
        educationId: placement.offering_id, startsOn: shiftDay(today, 30), endsOn: null });
      const rows = await db`select id,starts_on,ends_on from public.pupil_placements where pupil_id=${pupil} order by starts_on`;
      check(checks, 'response', 'administratören får sparad placering med ny version', response.status === 200 && response.body?.version === prior + 1);
      check(checks, 'persistent', 'två daterade placeringar, historik och säkerhetshändelse finns',
        rows.length === 2 && rows[0].ends_on && await event(response, 'pupil_transferred') &&
        (await db`select count(*)::int as n from public.pupil_field_history where pupil_id=${pupil} and field='placement'`)[0].n >= 1);
    });
    await run('class-change', async checks => {
      const pupil = await clone(F.namesakeA,{currentPeriodsOnly:true});
      const [placement] = await db`select id,offering_id from public.pupil_placements where pupil_id=${pupil}`;
      const response = await change(admins.ordinary, pupil, 'class', { placementId: placement.id, classId: F.classOtherEducation,
        startsOn: shiftDay(today, 1), endsOn: null });
      const classes = await db`select class_id,starts_on,ends_on from public.pupil_class_memberships where pupil_id=${pupil} order by starts_on`;
      const [after] = await db`select offering_id from public.pupil_placements where pupil_id=${pupil} order by starts_on desc limit 1`;
      check(checks, 'response', 'klassbyte sparas och annan utbildning ger begriplig varning',
        response.status === 200 && response.body?.warnings?.includes('class-education-mismatch'));
      check(checks, 'persistent', 'klasshistorik bevaras utan automatiskt utbildningsbyte',
        classes.length === 2 && classes.at(-1).class_id === F.classOtherEducation && after.offering_id === placement.offering_id && await event(response, 'pupil_class_changed'));
    });
    await run('source-discrepancy', async checks => {
      const pupil = await clone(F.municipalitySource);
      const local = await change(admins.ordinary, pupil, 'basics', { displayName: 'Syntetiskt 04-16 lokal rättelse' });
      await assertTarget('protected');
      await db`select public.phase4_simulated_source_deliver(${db.json({ pupilId: pupil, field: 'displayName', value: 'Syntetiskt 04-16 källvärde' })})`;
      const conflict = (await db`select id from public.pupil_source_values where pupil_id=${pupil} and field='displayName' and resolved_at is null order by changed_at desc limit 1`)[0]?.id;
      const cardResult = await get(admins.ordinary, `/api/elever/elev?pupilId=${pupil}&schoolYear=${year}`);
      const chooseSource = conflict && await change(admins.ordinary, pupil, 'resolve-source', { conflictId: conflict, choice: 'source' });
      const afterSource = (await db`select display_name from public.pupils where id=${pupil}`)[0]?.display_name;
      const secondPupil = await clone(F.municipalitySource);
      const localAgain = await change(admins.ordinary, secondPupil, 'basics', { displayName: 'Syntetiskt 04-16 andra rättelsen' });
      await assertTarget('protected');
      await db`select public.phase4_simulated_source_deliver(${db.json({ pupilId: secondPupil, field: 'displayName', value: 'Syntetiskt 04-16 andra källvärdet' })})`;
      const secondConflict = (await db`select id from public.pupil_source_values where pupil_id=${secondPupil} and resolved_at is null order by changed_at desc limit 1`)[0]?.id;
      const chooseLocal = secondConflict && await change(admins.ordinary, secondPupil, 'resolve-source', { conflictId: secondConflict, choice: 'local' });
      const decisions = await db`select resolution from public.pupil_source_values where pupil_id=any(${[pupil,secondPupil]}::uuid[]) and resolved_at is not null`;
      check(checks, 'response', 'kortet visar avvikelse och båda uttryckliga beslut accepteras',
        local.status === 200 && localAgain.status === 200 && cardResult.status === 200 &&
        cardResult.body?.sourceConflicts?.some(item => item.id === conflict) && chooseSource?.status === 200 && chooseLocal?.status === 200);
      check(checks, 'persistent', 'källval och lokal rättelse ligger i historik och värden skrivs inte tyst över',
        afterSource === 'Syntetiskt 04-16 källvärde' && decisions.some(d => d.resolution === 'source') && decisions.some(d => d.resolution === 'local') &&
        await event(chooseSource, 'pupil_source_resolved') && await event(chooseLocal, 'pupil_source_resolved'));
    });
    await run('search-filter', async checks => {
      const a = await post(admins.ordinary, '/api/elever/lista', listBody({}, 'Sida Provperson'));
      const b = await post(admins.ordinary, '/api/elever/lista', listBody({ page: 2 }, 'Sida Provperson'));
      const empty = await post(admins.ordinary, '/api/elever/lista', listBody({}, 'Ingen sådan provperson'));
      const foreign = await post(admins.ordinary, '/api/elever/lista', listBody({ unitId: F.otherCustomerUnit }));
      const unknown = await post(admins.ordinary, '/api/elever/lista', listBody({ unitId: crypto.randomUUID() }));
      const names = a.body?.pupils?.map(p => `${p.displayName}|${p.id}`) ?? [];
      check(checks, 'response', 'count, ordning, 50 per sida, sida 2 och tomstatus kommer från servern',
        a.status === 200 && a.body?.count === 55 && a.body?.pupils?.length === 50 && b.status === 200 && b.body?.pupils?.length === 5 &&
        names.every((value, i) => i === 0 || names[i - 1].localeCompare(value, 'sv') <= 0) && empty.status === 200 && empty.body?.count === 0 && empty.body?.pupils?.length === 0);
      check(checks, 'persistent', 'alla fem urval loggas; främmande och okänd skola ger samma generiska form',
        (await Promise.all([a,b,empty,foreign,unknown].map(events))).every(rows => rows.some(e => e.action === 'pupil_list_read')) &&
        foreign.status === unknown.status && JSON.stringify(Object.keys(foreign.body ?? {}).sort()) === JSON.stringify(Object.keys(unknown.body ?? {}).sort()));
    });
    await run('concurrent-edit', async checks => {
      const pupil = await clone(F.namesakeB), prior = await version(pupil);
      const body = name => ({ ...card(pupil), expectedVersion: prior, kind: 'basics', payload: { displayName: name } });
      const pair = await Promise.all([
        post(admins.ordinary, '/api/elever/andra', body('Syntetiskt 04-16 samtidighet A')),
        post(admins.safe, '/api/elever/andra', body('Syntetiskt 04-16 samtidighet B')),
      ]);
      check(checks, 'response', 'en sparning lyckas och en får auditerad versionskonflikt',
        pair.filter(r => r.status === 200).length === 1 && pair.filter(r => r.status === 409 && r.body?.code === 'conflict').length === 1);
      check(checks, 'persistent', 'versionen ökar exakt en gång och båda utfallen finns i loggen',
        await version(pupil) === prior + 1 && (await db`select count(*)::int as n from public.pupil_field_history where pupil_id=${pupil} and field='displayName'`)[0].n === 1 &&
        (await Promise.all(pair.map(events))).every(rows => rows.length > 0));
    });
    await run('protected-admin', async checks => {
      const list = await post(admins.safe, '/api/elever/lista', listBody({}, 'Skyddad Provperson'));
      const cardResult = await get(admins.safe, `/api/elever/elev?pupilId=${F.protected}&schoolYear=${year}`);
      const row = list.body?.pupils?.find(p => p.id === F.protected);
      const pupil = await clone(F.namesakeA);
      const protectedName = 'Syntetiskt 04-16 skyddat konfliktprov';
      const enabled = await change(admins.safe, pupil, 'basics', { protectedIdentity: true });
      const prior = await version(pupil);
      const renamed = await change(admins.safe, pupil, 'basics', { displayName: protectedName });
      const stale = { ...card(pupil), expectedVersion: prior, kind: 'basics', payload: { displayName: 'Syntetiskt 04-16 konkurrerande namn' } };
      const authorizedConflict = await post(admins.safe, '/api/elever/andra', stale);
      const unauthorizedConflict = await post(admins.ordinary, '/api/elever/andra', stale);
      check(checks, 'response', 'skyddsbehörig administratör får synlig markering och eget elevkort',
        list.status === 200 && row?.protectedIdentity === true && list.body?.protectedIds?.includes(F.protected) &&
        cardResult.status === 200 && cardResult.body?.id === F.protected && cardResult.body?.protectedIdentity === true);
      check(checks, 'persistent', 'varje skyddad lista och kortläsning har beständig objekthändelse',
        (await events(list)).some(e => e.action === 'pupil_list_read' && e.outcome === 'ok') &&
        (await events(cardResult)).some(e => e.action === 'pupil_read' && e.outcome === 'ok'));
      check(checks, 'response', 'skyddad namnkonflikt ger auditerat 409 bara för behörig och döljer namn för obehörig',
        enabled.status === 200 && renamed.status === 200 && authorizedConflict.status === 409 &&
        unauthorizedConflict.status >= 400 && !unauthorizedConflict.text.includes(protectedName));
      check(checks, 'persistent', 'konflikten ändrar inte skyddat namn och båda svar har objektlogg',
        (await db`select display_name from public.pupils where id=${pupil}`)[0]?.display_name === protectedName &&
        (await events(authorizedConflict)).length > 0 && (await events(unauthorizedConflict)).length > 0);
    });
    await run('protected-teacher', async checks => {
      const list = await post(admins.teacher, '/api/elever/lista', listBody());
      const row = list.body?.pupils?.find(p => p.id === F.protected);
      const reveal = await post(admins.teacher, '/api/elever/personnummer', card(F.protected));
      check(checks, 'response', 'läraren ser bara anonymt visningsnamn och kan inte öppna numret',
        list.status === 200 && row && !row.protectedIdentity && row.capabilities?.canExport === false &&
        !list.body?.protectedIds && reveal.status === 403 && !reveal.text.includes('Skyddad Provperson'));
      check(checks, 'persistent', 'anonym läsning och nekad nummeröppning är spårade',
        (await events(list)).length > 0 && (await events(reveal)).some(e => e.outcome === 'denied'));
    });
    await run('protected-unauthorized', async checks => {
      const without = await get(admins.ordinary, `/api/elever/elev?pupilId=${F.protected}&schoolYear=${year}`);
      const unknown = await get(admins.ordinary, `/api/elever/elev?pupilId=${crypto.randomUUID()}&schoolYear=${year}`);
      const foreign = await get(admins.otherCustomer, `/api/elever/elev?pupilId=${F.protected}&schoolYear=${year}`);
      check(checks, 'response', 'utan skyddsbehörighet anonymiseras kortet; okänd och annan kund får generiskt nekande',
        without.status === 200 && without.body?.displayName !== 'Skyddad Provperson' && !without.body?.protectedIdentity &&
        unknown.status === 404 && foreign.status === 404 && unknown.body?.code === foreign.body?.code &&
        ![without,unknown,foreign].some(r => r.text.includes('Skyddad Provperson')));
      check(checks, 'persistent', 'anonym läsning och båda nekanden finns i minimerad säkerhetslogg',
        (await events(without)).some(e => e.outcome === 'ok') &&
        (await Promise.all([unknown,foreign].map(events))).every(rows => rows.some(e => e.outcome === 'denied')));
    });
    await run('protected-direct', async checks => {
      const direct = [];
      const source = await sources();
      const since = new Date(Date.now() - 1000).toISOString();
      for (const role of ['anon','authenticated']) {
        for (const table of ['pupils','school_classes','pupil_placements','pupil_class_memberships',
          'pupil_home_municipalities','pupil_field_state','pupil_field_history','pupil_source_values','protected_identity_permissions']) {
          try { await db.begin(async tx => { await tx.unsafe(`set local role ${role}`); await tx.unsafe(`select count(*) from public.${table}`); }); direct.push('ok'); }
          catch (error) { direct.push(error?.code); }
        }
        for (const fn of ['phase4_list_pupils','phase4_pupil_card','phase4_pupil_history','phase4_change_pupil',
          'phase4_resolve_source','phase4_reveal_personal_number','phase4_simulated_source_deliver']) {
          try { await db.begin(async tx => { await tx.unsafe(`set local role ${role}`); await tx.unsafe(`select public.${fn}('{}'::jsonb)`); }); direct.push('ok'); }
          catch (error) { direct.push(error?.code); }
        }
        try { await db.begin(async tx => { await tx.unsafe(`set local role ${role}`); await tx`select public.phase4_export_pupils('{}'::jsonb,false)`; }); direct.push('ok'); }
        catch (error) { direct.push(error?.code); }
        try { await db.begin(async tx => { await tx.unsafe(`set local role ${role}`); await tx`select public.phase4_register_selection()`; }); direct.push('ok'); }
        catch (error) { direct.push(error?.code); }
      }
      const rpc = await fetch(new URL('/rest/v1/rpc/phase4_simulated_source_deliver', manifest.apiUrl), {
        method: 'POST', headers: { apikey: manifest.anonKey, Authorization: `Bearer ${manifest.anonKey}`, 'Content-Type': 'application/json', 'X-Client-Trace-Id': 'f'.repeat(32) },
        body: JSON.stringify({ request: { pupilId: F.protected, field: 'displayName', value: 'Syntetiskt 04-16 förbjudet' } }),
      });
      const rpcText = await rpc.text();
      const requestId = rpc.headers.get('x-phase3-audit-id');
      await new Promise(resolve => setTimeout(resolve, 1000));
      const rawKong = docker(['logs', '--since', since, source.kong.id]);
      const parsed = collectKong(rawKong, source.kong.id);
      const observed = correlateKong([{ route: 'rpc', status: rpc.status, requestId }], parsed.events, source.kong.id)[0];
      check(checks, 'response', 'anonymt direktanrop via Kong nekas utan skyddat värde', rpc.status >= 400 && !rpcText.includes('Skyddad Provperson'));
      check(checks, 'persistent', 'klientroller saknar rätt till alla nya tabeller och registerfunktioner', direct.length === 36 && direct.every(code => code === '42501'));
      check(checks, 'persistent', 'nekat anrop finns i faktisk minimerad Kong-källa med serverns korrelations-ID',
        observed.sourceObserved && parsed.malformed === 0 && parsed.unminimized === 0 &&
        !rawKong.includes('Skyddad Provperson') && !rawKong.includes('Syntetiskt 04-16 förbjudet'));
    });
    await run('protected-grant-revoke', async checks => {
      const before = await get(admins.safe, `/api/elever/elev?pupilId=${F.protected}&schoolYear=${year}`);
      const exportRequest = exportBody('preview', [F.protected], { protectedIds: [F.protected] });
      const preview = await post(admins.safe, '/api/elever/export', exportRequest);
      const [permission] = await db`select id from public.protected_identity_permissions where assignment_id=(
        select assignment_id from public.app_sessions where token_hash=${crypto.createHash('sha256').update(admins.safe.token).digest()}) and revoked_at is null order by granted_at desc limit 1`;
      if (!permission) throw new Error('skyddsbehörighet saknas');
      const revoked = await post(admins.hm, '/api/kund/skyddsbehorighet', { action: 'revoke', permissionId: permission.id });
      const denied = await get(admins.safe, `/api/elever/elev?pupilId=${F.protected}&schoolYear=${year}`);
      const blockedDownload = await post(admins.safe, '/api/elever/export', { ...exportRequest, mode: 'download' });
      const adminActor = await actor(U.protectedAdmin, 'administrator');
      const restored = await post(admins.hm, '/api/kund/skyddsbehorighet', { action: 'grant', assignmentId: adminActor.assignment, unitId: F.unit });
      const after = await get(admins.safe, `/api/elever/elev?pupilId=${F.protected}&schoolYear=${year}`);
      check(checks, 'response', 'återkallelse anonymiserar redan utfärdad session; nytt huvudmannabeslut öppnar igen',
        before.status === 200 && before.body?.protectedIdentity === true && preview.status === 200 &&
        revoked.status === 200 && blockedDownload.status >= 400 && !blockedDownload.contentType?.includes('text/csv') &&
        denied.status === 200 && denied.body?.displayName !== 'Skyddad Provperson' && !denied.body?.protectedIdentity &&
        restored.status === 201 && after.status === 200 && after.body?.protectedIdentity === true);
      check(checks, 'persistent', 'behörighetsrad och båda besluten bevaras i databas/logg',
        (await db`select revoked_at is not null as revoked from public.protected_identity_permissions where id=${permission.id}`)[0]?.revoked &&
        await event(revoked, 'protected_permission_revoked') && await event(restored, 'protected_permission_granted') &&
        await event(preview, 'pupil_export_preview') && !(await events(blockedDownload)).some(e => e.action === 'pupil_exported' && e.outcome === 'ok'));
    });
    await run('historical-readonly', async checks => {
      const history = await get(admins.ordinary, `/api/elever/historik?pupilId=${F.municipalitySource}&schoolYear=${year}&page=1`);
      const forbidden = await post(admins.ordinary, '/api/elever/historik', { ...card(F.municipalitySource), page: 1 });
      const before = (await db`select count(*)::int as n from public.pupil_field_history where pupil_id=${F.municipalitySource}`)[0].n;
      check(checks, 'response', 'historik läses med maskerat nummer och saknar skrivrutt',
        history.status === 200 && Array.isArray(history.body?.entries) && forbidden.status >= 400 &&
        !history.body?.entries?.some(row => row.field === 'personalNumber' && (row.before !== null || row.after !== null)));
      check(checks, 'persistent', 'läsningen loggas och historikens radantal ändras inte',
        await event(history, 'pupil_history_read') && (await db`select count(*)::int as n from public.pupil_field_history where pupil_id=${F.municipalitySource}`)[0].n === before);
    });
    await run('export-selection', async checks => {
      const ids = [F.namesakeA,F.namesakeB];
      const preview = await post(admins.ordinary, '/api/elever/export', exportBody('preview', ids));
      const file = await post(admins.ordinary, '/api/elever/export', exportBody('download', ids));
      const lines = file.text.replace(/^\ufeff/u,'').split(/\r?\n/u).filter(Boolean);
      check(checks, 'response', 'uttryckligt urval ger antal och CSV med endast valda två elever',
        preview.status === 200 && preview.body?.count === 2 && !preview.body?.rows && file.status === 200 &&
        file.contentType?.includes('text/csv') && lines.length === 3 && !file.text.includes('Skyddad Provperson'));
      check(checks, 'persistent', 'preview och hämtning har egna committade exporthändelser',
        await event(preview, 'pupil_export_preview') && await event(file, 'pupil_exported') && preview.corr !== file.corr);
    });
    await run('export-direct-denied', async checks => {
      const denied = await post(admins.teacher, '/api/elever/export', exportBody('download', [F.namesakeA]));
      const noMfa = await mint(await actor(U.unprotectedAdmin, 'administrator'), false);
      const deniedMfa = await post(noMfa, '/api/elever/export', exportBody('download', [F.namesakeA]));
      const expiring = await mint(await actor(U.unprotectedAdmin, 'administrator'));
      const preview = await post(expiring, '/api/elever/export', exportBody('preview', [F.namesakeA]));
      await assertTarget('protected');
      const tokenHash = crypto.createHash('sha256').update(expiring.token).digest();
      await db`update public.app_sessions set revoked_at=now() where token_hash=${tokenHash}`;
      const afterRevoke = await post(expiring, '/api/elever/export', exportBody('download', [F.namesakeA]));
      check(checks, 'response', 'lärare och session utan extra verifiering får ingen CSV',
        denied.status === 403 && deniedMfa.status === 403 && preview.status === 200 &&
        afterRevoke.status >= 400 && ![denied,deniedMfa,afterRevoke].some(r => r.contentType?.includes('text/csv')));
      check(checks, 'persistent', 'nekandena loggas och inget exportutfall markeras ok',
        (await Promise.all([denied,deniedMfa].map(events))).every(rows => rows.some(e => e.outcome === 'denied') && !rows.some(e => e.action === 'pupil_exported' && e.outcome === 'ok')) &&
        (await db`select revoked_at is not null as revoked from public.app_sessions where token_hash=${tokenHash}`)[0]?.revoked &&
        !(await events(afterRevoke)).some(e => e.action === 'pupil_exported' && e.outcome === 'ok'));
    });
    await run('export-personnummer', async checks => {
      const [stored] = await db`select personal_number from public.pupils where id=${F.namesakeA}`;
      const file = await post(admins.ordinary, '/api/elever/export', exportBody('download', [F.namesakeA], { includePersonalNumber: true }));
      check(checks, 'response', 'engångsverifierad hämtning innehåller enbart valt syntetiskt nummer',
        file.status === 200 && file.contentType?.includes('text/csv') && file.text.includes(stored.personal_number) &&
        file.text.split(/\r?\n/u).filter(Boolean).length === 2);
      check(checks, 'persistent', 'personnummerexporten har egen objektlogg utan rått nummer',
        (await events(file)).some(e => e.action === 'pupil_personal_number_exported' && e.outcome === 'ok') &&
        !(await events(file)).some(e => JSON.stringify(e.details).includes(stored.personal_number)));
    });
    await run('audit-register-read-fail', async checks => {
      const [stored] = await db`select personal_number from public.pupils where id=${F.namesakeA}`;
      const withoutAudit = async operation => {
        await assertTarget('protected');
        await db`revoke insert on public.security_events from skolplattform_worker`;
        try { return await operation(); }
        finally { await db`grant insert on public.security_events to skolplattform_worker`; }
      };
      const blocked = await withoutAudit(async () => [
        await post(admins.ordinary, '/api/elever/lista', listBody()),
        await get(admins.ordinary, `/api/elever/elev?pupilId=${F.namesakeA}&schoolYear=${year}`),
        await get(admins.ordinary, `/api/elever/historik?pupilId=${F.municipalitySource}&schoolYear=${year}&page=1`),
        await post(admins.ordinary, '/api/elever/personnummer', card(F.namesakeA)),
        await post(admins.ordinary, '/api/elever/export', exportBody('preview', [F.namesakeA])),
        await post(admins.ordinary, '/api/elever/export', exportBody('download', [F.namesakeA])),
        await get(admins.hm, '/api/kund/skyddsbehorighet'),
        await post(admins.safe, '/api/elever/andra', { ...card(F.protected), expectedVersion: Math.max(0, (await version(F.protected)) - 1),
          kind: 'basics', payload: { displayName: 'Syntetiskt 04-16 osynlig konflikt' } }),
      ]);
      check(checks, 'response', 'loggfel stoppar lista, kort, historik, nummer, export och behörighetsläsning utan bytes',
        blocked.every(r => r.status === 500 && r.body?.code === 'audit_unavailable' &&
          !r.text.includes('Alex Prov') && !r.text.includes(stored.personal_number) &&
          !r.text.includes('Skyddad Provperson') && !r.text.includes('osynlig konflikt') && !r.contentType?.includes('text/csv')));
      check(checks, 'persistent', 'inga ok-händelser från misslyckade läsningar committas',
        (await Promise.all(blocked.map(events))).every(rows => !rows.some(e => e.outcome === 'ok')));
      // Extra objekthändelse vid uttrycklig visning: första INSERT sker, andra
      // avsiktligt felar i samma transaktion. DDL gäller bara den isolerade prov-DB:n.
      await assertTarget('protected');
      await db.unsafe(`create function public.phase4_16_fail_second_reveal() returns trigger language plpgsql security definer set search_path=pg_catalog,public as $$
        begin
          if new.action='pupil_personal_number_read' and exists(
            select 1 from public.security_events where correlation_id=new.correlation_id
          ) then raise exception 'synthetic second audit failure' using errcode='55000'; end if;
          return new;
        end $$`);
      await db.unsafe(`create trigger phase4_16_fail_second_reveal before insert on public.security_events
        for each row when (new.action='pupil_personal_number_read') execute function public.phase4_16_fail_second_reveal()`);
      let second;
      try { second = await post(admins.ordinary, '/api/elever/personnummer', card(F.namesakeA)); }
      finally {
        await db.unsafe('drop trigger if exists phase4_16_fail_second_reveal on public.security_events');
        await db.unsafe('drop function if exists public.phase4_16_fail_second_reveal()');
      }
      check(checks, 'response', 'fel i extra visningshändelsen döljer numret',
        second.status === 500 && second.body?.code === 'audit_unavailable' && !second.text.includes(stored.personal_number));
      check(checks, 'persistent', 'den första visningshändelsen rullas tillbaka; endast nekande får finnas',
        !(await events(second)).some(e => e.outcome === 'ok'));
    });
    await run('audit-register-write-rollback', async checks => {
      const pupil = await clone(F.namesakeA), before = await version(pupil);
      const historyBefore = (await db`select count(*)::int as n from public.pupil_field_history where pupil_id=${pupil}`)[0].n;
      await assertTarget('protected');
      await db`revoke insert on public.security_events from skolplattform_worker`;
      let failed;
      try { failed = await change(admins.ordinary, pupil, 'basics', { displayName: 'Syntetiskt 04-16 osparat' }); }
      finally { await db`grant insert on public.security_events to skolplattform_worker`; }
      check(checks, 'response', 'loggfel ger generiskt svar utan elevvärde',
        failed.status === 500 && failed.body?.code === 'audit_unavailable' && !failed.text.includes('osparat'));
      check(checks, 'persistent', 'version, fälthistorik och ok-händelse rullas tillbaka',
        await version(pupil) === before &&
        (await db`select count(*)::int as n from public.pupil_field_history where pupil_id=${pupil}`)[0].n === historyBefore &&
        !(await events(failed)).some(e => e.outcome === 'ok'));
    });
    await run('retired-probe', async checks => {
      const old = await get(admins.ordinary, '/api/prov/elever');
      const objects = await db`select to_regclass('public.phase3_probe_pupils') as pupils,
        to_regclass('public.phase3_probe_groups') as groups,
        to_regprocedure('public.phase3_read_pupils(jsonb)') as fn`;
      check(checks, 'response', 'det gamla elevprovet har ingen HTTP-väg', old.status === 404 && !old.text.includes('Syntetisk elev'));
      check(checks, 'persistent', 'gamla elevtabeller och läsfunktion saknas i databasen',
        objects[0].pupils === null && objects[0].groups === null && objects[0].fn === null);
    });
  } finally {
    if (ownPupils.size) {
      await assertTarget('protected');
      await db.begin(async tx => {
        const ids = [...ownPupils];
        const [{ n }] = await tx`select count(*)::int as n from public.pupils where id=any(${ids}::uuid[]) and customer_id=${F.customer} and display_name like 'Syntetiskt 04-16%'`;
        if (n !== ids.length) throw new Error('REFUSED: provmarkör saknas vid städning');
        await tx`set local session_replication_role=replica`;
        for (const table of ['pupil_source_values','pupil_field_history','pupil_field_state','pupil_home_municipalities','pupil_class_memberships','pupil_placements'])
          await tx.unsafe(`delete from public.${table} where pupil_id=any($1::uuid[])`, [ids]);
        await tx`delete from public.pupils where id=any(${ids}::uuid[]) and customer_id=${F.customer}`;
      });
    }
  }
}
