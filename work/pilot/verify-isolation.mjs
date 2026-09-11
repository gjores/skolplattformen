#!/usr/bin/env node
// Negativa API-prov av fas 1-karantänen (BASE-02, D-09) mot det skyddade
// lokala provmålet. pgTAP (plan 01-05) bevisar installerade rättigheter i
// databasen; det här skriptet går den väg klienterna faktiskt går: PostgREST
// (REST + RPC), GoTrue (Auth), Storage och pg_graphql via API-gatewayen.
//
//   export PATH="/opt/homebrew/opt/node@25/bin:$PATH"
//   node work/pilot/verify-isolation.mjs
//
// Tre identiteter provas: oinloggad anon, en tidigare anonym identitet som
// redan har huvudmannaprofil (JWT mintad med målets lokala jwt_secret) och
// ett vanligt provkonto med lösenord. Varje skyddad operation måste nekas
// OCH radantal/filer måste vara oförändrade efteråt, så att ett dolt
// skrivresultat inte missas.
//
// Exit 0 = PASS, exit 1 = FAIL/REFUSED/SETUP-FAIL, exit 3 = BLOCKED (målet
// är inte förberett eller inte startat). Resultatfilen innehåller aldrig
// nycklar, JWT eller lösenord. Målet väljs enbart av assertTarget('protected');
// inga miljövariabler får styra det.

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

// @supabase/supabase-js finns bara i web/node_modules; web/lib/supabase.ts
// skapar ingen klient i fas 1 och importeras därför inte.
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const { createClient } = require('@supabase/supabase-js');

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const resultPath = path.join(root, 'work', 'pilot', 'results', 'isolation.json');

// Kända fixtur-ID:n (work/pilot/sql/protected-fixtures.sql).
const DEMO_ORG = '00000000-0000-4000-8000-000000000001';
const OLD_ANON_USER = '10000000-0000-4000-8000-000000000a01';
const UNIT_ID = '10000000-0000-4000-8000-000000000101';
const OFFERING_ID = '10000000-0000-4000-8000-000000000201';
const TIMPLAN_ID = '10000000-0000-4000-8000-000000000401';
const STORAGE_FILE = `${DEMO_ORG}/karantan-prov.txt`;
const STORAGE_INTRUSION = `${DEMO_ORG}/intrang.txt`;
const PROVKONTO_EMAIL = 'provkonto@example.test';
const PROVKONTO_PASSWORD = 'Provlosenord-1'; // lokalt provvärde ur fixturfilen, ingen hemlighet
const SIGNUP_EMAIL = 'ny@example.test';

// ---------------------------------------------------------------------------
// Målskydd
// ---------------------------------------------------------------------------
let manifest;
try {
  manifest = await assertTarget('protected');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
}

// ---------------------------------------------------------------------------
// Hjälpare
// ---------------------------------------------------------------------------
const SECRET_PATTERN = /eyJ[A-Za-z0-9_-]{30,}/g;
const redact = value =>
  String(value ?? '')
    .replace(SECRET_PATTERN, '[jwt]')
    .replace(new RegExp(PROVKONTO_PASSWORD, 'g'), '[lösenord]')
    .slice(0, 300);

function psql(sql) {
  return execFileSync('psql', [manifest.dbUrl, '-Atc', sql], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

const SNAPSHOT_QUERIES = {
  profiles: 'select count(*) from public.profiles',
  school_units: 'select count(*) from public.school_units',
  offerings: 'select count(*) from public.offerings',
  class_timplans: 'select count(*) from public.class_timplans',
  storage_tillstand: "select count(*) from storage.objects where bucket_id='tillstand'",
  auth_users: 'select count(*) from auth.users',
  profiles_md5:
    "select md5(string_agg(id::text||role::text||coalesce(name,''), ',' order by id)) from public.profiles",
};

function snapshot() {
  const out = {};
  for (const [key, sql] of Object.entries(SNAPSHOT_QUERIES)) {
    const value = psql(sql);
    out[key] = key.endsWith('_md5') ? value : Number(value);
  }
  return out;
}

function base64url(input) {
  return Buffer.from(input).toString('base64').replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

// Mintar en giltig HS256-JWT för den gamla anonyma identiteten med målets
// lokala jwt_secret (samma som GoTrue skulle ha utfärdat i arbetsversionen).
function mintOldAnonymousJwt() {
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = base64url(
    JSON.stringify({
      aud: 'authenticated',
      role: 'authenticated',
      sub: OLD_ANON_USER,
      is_anonymous: true,
      iat: now,
      exp: now + 3600,
      session_id: crypto.randomUUID(),
    }),
  );
  const signature = crypto
    .createHmac('sha256', manifest.jwtSecret)
    .update(`${header}.${payload}`)
    .digest('base64')
    .replace(/=+$/, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${header}.${payload}.${signature}`;
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };

function clientWithToken(token) {
  return createClient(manifest.apiUrl, manifest.anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}

const checks = [];
function record(identity, operation, outcome, detail) {
  checks.push({ identity, operation, outcome, detail: redact(detail) });
  const mark = outcome === 'DENIED' ? 'ok ' : outcome === 'INFO' ? 'i  ' : 'FEL';
  console.log(`${mark} ${identity.padEnd(12)} ${operation.padEnd(48)} ${outcome}`);
}

// Ett nekande kräver error != null (eller, för listor, tomt resultat) OCH inga data.
function judge({ data, error }, { listing = false } = {}) {
  const hasData = Array.isArray(data) ? data.length > 0 : data !== null && data !== undefined;
  if (error) {
    return hasData
      ? ['ALLOWED', `fel men även data: ${error.code ?? ''} ${error.message}`]
      : ['DENIED', `fel ${error.code ?? error.status ?? ''}: ${error.message}`.trim()];
  }
  if (listing && Array.isArray(data) && data.length === 0) return ['DENIED', 'inget fel men tomt resultat (0 rader)'];
  if (!hasData) return ['DENIED', 'inget fel men inga data'];
  return ['ALLOWED', `data returnerades: ${JSON.stringify(data).slice(0, 120)}`];
}

async function graphql(token) {
  const response = await fetch(`${manifest.apiUrl}/graphql/v1`, {
    method: 'POST',
    headers: { apikey: manifest.anonKey, Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ query: '{ school_unitsCollection { edges { node { id } } } }' }),
  });
  let body;
  try {
    body = await response.json();
  } catch {
    return ['DENIED', `HTTP ${response.status}, icke-JSON-svar`];
  }
  const edges = body?.data?.school_unitsCollection?.edges;
  if (Array.isArray(edges) && edges.length > 0) return ['ALLOWED', `HTTP ${response.status}, ${edges.length} kanter`];
  if (body?.errors) return ['DENIED', `HTTP ${response.status}, errors: ${body.errors.map(e => e.message).join('; ')}`];
  return ['DENIED', `HTTP ${response.status}, saknar school_unitsCollection.edges: ${JSON.stringify(body).slice(0, 120)}`];
}

// ---------------------------------------------------------------------------
// Skyddade operationer per identitet
// ---------------------------------------------------------------------------
async function runProtectedOperations(identity, client, token) {
  const ops = [
    ['rest school_units.select', () => client.from('school_units').select('*'), { listing: true }],
    ['rest school_units.insert', () =>
      client.from('school_units').insert({ organizer_id: DEMO_ORG, code: '99999997', name: 'Intrång', municipality_code: '0000' }).select()],
    ['rest school_units.update', () => client.from('school_units').update({ name: 'Ändrad' }).eq('id', UNIT_ID).select()],
    ['rest school_units.delete', () => client.from('school_units').delete().eq('id', UNIT_ID).select()],
    ['rest profiles.select', () => client.from('profiles').select('*'), { listing: true }],
    ['rest registry_snapshots.select', () => client.from('registry_snapshots').select('*'), { listing: true }],
    ['rest timplan_cells.select', () => client.from('timplan_cells').select('*').eq('timplan_id', TIMPLAN_ID), { listing: true }],
    ['rpc bootstrap_demo_profile', () => client.rpc('bootstrap_demo_profile', { display_name: 'Intrång' })],
    ['rpc current_organizer_id', () => client.rpc('current_organizer_id')],
    ['rpc current_app_role', () => client.rpc('current_app_role')],
    ['rpc copy_offering_cohort', () => client.rpc('copy_offering_cohort', { source_id: OFFERING_ID, target_year: 2027 })],
    ['rpc appoint_school_principal', () => client.rpc('appoint_school_principal', { school_id: UNIT_ID, principal_name: 'Intrång' })],
    ['rpc import_school_unit', () => client.rpc('import_school_unit', { unit_data: {}, registry_payload: {} })],
    ['storage tillstand.list', () => client.storage.from('tillstand').list(DEMO_ORG), { listing: true }],
    ['storage tillstand.download', () => client.storage.from('tillstand').download(STORAGE_FILE)],
    ['storage tillstand.upload', () =>
      client.storage.from('tillstand').upload(STORAGE_INTRUSION, new Blob(['x'], { type: 'application/pdf' }), { contentType: 'application/pdf' })],
    ['storage tillstand.remove', () => client.storage.from('tillstand').remove([STORAGE_FILE]), { listing: true }],
  ];
  for (const [operation, run, options] of ops) {
    let result;
    try {
      result = await run();
    } catch (error) {
      result = { data: null, error: { message: error instanceof Error ? error.message : String(error) } };
    }
    const [outcome, detail] = judge(result, options);
    record(identity, operation, outcome, detail);
  }
  const [outcome, detail] = await graphql(token);
  record(identity, 'graphql/v1 school_unitsCollection', outcome, detail);
}

// ---------------------------------------------------------------------------
// Körning
// ---------------------------------------------------------------------------
let setupFailure = null;

// Förstädning: en tidigare körning kan ha lämnat signup-provanvändaren kvar.
psql(`delete from auth.users where email = '${SIGNUP_EMAIL}'`);

const rowsBefore = snapshot();
console.log('Ögonblicksbild före:', JSON.stringify(rowsBefore));

// Identitet 1: oinloggad anon.
const anon = createClient(manifest.apiUrl, manifest.anonKey, clientOptions);
await runProtectedOperations('anon', anon, manifest.anonKey);

// Identitet 2: gammal anonym identitet med redan skapad HM-profil.
const oldJwt = mintOldAnonymousJwt();
await runProtectedOperations('gammalAnonym', clientWithToken(oldJwt), oldJwt);

// Identitet 3: vanligt provkonto med lösenord.
const provkonto = createClient(manifest.apiUrl, manifest.anonKey, clientOptions);
const signIn = await provkonto.auth.signInWithPassword({ email: PROVKONTO_EMAIL, password: PROVKONTO_PASSWORD });
if (signIn.error || !signIn.data?.session?.access_token) {
  setupFailure = `SETUP-FAIL: provkontot kunde inte logga in (${signIn.error?.message ?? 'ingen session'}); fixturen är fel`;
  record('provkonto', 'auth.signInWithPassword', 'SETUP-FAIL', setupFailure);
} else {
  record('provkonto', 'auth.signInWithPassword', 'INFO', `inloggning lyckades som ${signIn.data.user?.id ?? '?'} (förutsättning för proven)`);
  await runProtectedOperations('provkonto', provkonto, signIn.data.session.access_token);
  await provkonto.auth.signOut({ scope: 'local' });
}

// Identitetsoberoende: anonym inloggning ska vara avstängd.
{
  const result = await anon.auth.signInAnonymously();
  const outcome = result.error ? 'DENIED' : 'ALLOWED';
  record('anon', 'auth.signInAnonymously', outcome,
    result.error ? `fel ${result.error.status ?? ''}: ${result.error.message}` : `session utfärdad för ${result.data?.user?.id}`);
  if (!result.error) await anon.auth.signOut({ scope: 'local' });
}

// Signup är inte skyddad åtkomst i fas 1 (enable_signup ändras inte här),
// men en ny användare får inte kunna läsa något.
{
  const signupClient = createClient(manifest.apiUrl, manifest.anonKey, clientOptions);
  const result = await signupClient.auth.signUp({ email: SIGNUP_EMAIL, password: PROVKONTO_PASSWORD });
  if (result.error) {
    record('nyAnvandare', 'auth.signUp', 'INFO', `signup nekades: ${result.error.status ?? ''} ${result.error.message}`);
  } else if (!result.data?.session) {
    record('nyAnvandare', 'auth.signUp', 'INFO', 'signup skapade användare utan session (bekräftelse krävs); läsprov ej möjligt');
  } else {
    record('nyAnvandare', 'auth.signUp', 'INFO', `signup lyckades (användare ${result.data.user?.id}); läsprov följer`);
    const [outcome, detail] = judge(await signupClient.from('school_units').select('*'), { listing: true });
    record('nyAnvandare', 'rest school_units.select', outcome, detail);
    const [g, gd] = await graphql(result.data.session.access_token);
    record('nyAnvandare', 'graphql/v1 school_unitsCollection', g, gd);
    await signupClient.auth.signOut({ scope: 'local' });
  }
  // Signup-provanvändaren är skriptets egen fixtur; den tas bort som postgres
  // (lokalt mål) så att ögonblicksbilden efteråt bara speglar de skyddade
  // operationerna. Detta är den enda avsiktliga skrivningen i skriptet.
  const removed = psql(`with d as (delete from auth.users where email = '${SIGNUP_EMAIL}' returning 1) select count(*) from d`);
  record('nyAnvandare', 'städning auth.users (postgres)', 'INFO', `${removed} signup-provanvändare borttagen`);
}

const rowsAfter = snapshot();
console.log('Ögonblicksbild efter: ', JSON.stringify(rowsAfter));
let unchanged = true;
try {
  assert.deepEqual(rowsAfter, rowsBefore);
} catch (error) {
  unchanged = false;
  console.error('Rader/filer ändrade:', error.message);
}

const fileStillThere = Number(psql(`select count(*) from storage.objects where bucket_id='tillstand' and name='${STORAGE_FILE}'`)) === 1;
const intrusionAbsent = Number(psql(`select count(*) from storage.objects where bucket_id='tillstand' and name='${STORAGE_INTRUSION}'`)) === 0;
record('kontroll', 'storage-fil kvar och ingen intrångsfil', fileStillThere && intrusionAbsent ? 'DENIED' : 'ALLOWED',
  `karantan-prov.txt finns: ${fileStillThere}; intrang.txt finns: ${!intrusionAbsent}`);

const allowed = checks.filter(c => c.outcome === 'ALLOWED');
const status = allowed.length === 0 && unchanged && !setupFailure ? 'PASS' : 'FAIL';

const revision = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: root, encoding: 'utf8' }).trim();
const result = {
  kind: 'api-isolation',
  date: new Date().toISOString(),
  target: { projectId: manifest.projectId, apiUrl: manifest.apiUrl, migrations: manifest.migrations.length },
  revision,
  identities: ['anon', 'gammalAnonym', 'provkonto'],
  checks,
  rowsBefore,
  rowsAfter,
  unchanged,
  setupFailure,
  status,
};
const serialized = JSON.stringify(result, null, 2);
assert.doesNotMatch(serialized, SECRET_PATTERN, 'resultatet får inte innehålla en JWT');
assert.doesNotMatch(serialized, /Provlosenord|service_role/, 'resultatet får inte innehålla lösenord eller nycklar');
fs.mkdirSync(path.dirname(resultPath), { recursive: true });
fs.writeFileSync(resultPath, `${serialized}\n`);

const denied = checks.filter(c => c.outcome === 'DENIED').length;
console.log(`\n${status}: ${denied} nekade, ${allowed.length} tillåtna, rader oförändrade: ${unchanged}. Skrivet till ${path.relative(root, resultPath)}`);
if (allowed.length > 0) {
  console.error('TILLÅTNA operationer (lucka i karantänen):');
  for (const c of allowed) console.error(`  ${c.identity} ${c.operation}: ${c.detail}`);
}
if (setupFailure) console.error(setupFailure);
process.exit(status === 'PASS' ? 0 : 1);
