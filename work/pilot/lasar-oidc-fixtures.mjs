// 05.1.1-15: syntetiska användare och data för det faktiska provet av tjänstefördelningen.
// Riktig Keycloak -> GoTrue -> Worker på 127.0.0.1:3016 mot provets egen schemakopia (aldrig den skyddade databasen
// eller 3012). Bara slumpade syntetiska IdP-användare och en tillfällig exakt callback-adress läggs i den lokala realmen,
// och allt tas bort efteråt. Inga personnummer utöver repots syntetiska TEST-lista, inga riktiga namn och inga hemligheter
// i manifest eller journal (lösenord och TOTP-hemligheter finns bara i den privata journalen under /private/tmp/).
import assert from 'node:assert/strict';
import { randomUUID, randomBytes, createHash } from 'node:crypto';
import { readFileSync, writeFileSync, openSync, closeSync, unlinkSync, lstatSync, realpathSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { assertTarget } from './verify-target.mjs';
import { freshOidcCode } from './fresh-oidc-code.mjs';
import { verifyClassCohortCallbackProof } from './phase5-class-cohort-oidc-fixtures.mjs';
import { createLasarFixture, seedDecidedYear } from './lasar-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OTP = createRequire(path.join(root, 'web/package.json'))('otpauth');
const hash = s => createHash('sha256').update(s).digest('hex');
export const LASAR_ACTUAL_BASE = 'http://127.0.0.1:3016';
export const LASAR_ACTUAL_ROLES = ['hm','principalA','principalB','admin'];
export const LASAR_ACTUAL_PROJECTS = ['desktop','desktop-small','phone','phone-small'];
export const LASAR_ACTUAL_LOGIN_ROLES = Object.freeze(Object.fromEntries(LASAR_ACTUAL_PROJECTS.map(p=>[p,LASAR_ACTUAL_ROLES])));
const DESKTOP_CASES = ['eget förslag och dagverktyg','återsänd, fastställ och ny version','ändringsbegäran, avslag och överblick','huvudmannens ram och uppdatering','kopiera och granska','passerade dagar låsta','läsläge och skoladministratör','konflikt mellan sessioner','IM-behov och kalenderversion','IM-text i Timplaner','HTTP-nekanden','demo och skyddad kalender'];
const PHONE_CASES = ['telefon: långtryck och Markera flera','telefon: förslag och läsning','läsläge och skoladministratör','HTTP-nekanden','IM-text i Timplaner','demo och skyddad kalender'];
export const LASAR_ACTUAL_CASES=Object.freeze(Object.fromEntries(LASAR_ACTUAL_PROJECTS.map(p=>[p,Object.freeze(p.startsWith('phone')?PHONE_CASES:DESKTOP_CASES)])));
const LOCK = path.join(root,'work/pilot/targets/protected/idp/named-timplan-run.lock');

async function ownedDatabase(db) {
 const [{name}] = await db`select current_database() name`;
 assert.match(name,/^named_timplan_[a-f0-9]{32}$/u,'Only the owned schema-only actual-test database is accepted');
 return name;
}
function keycloakClient(target) {
  return async (route, method = 'GET', body) => {
    const auth = await fetch(target.idp.publicUrl + '/realms/master/protocol/openid-connect/token', { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: target.idp.adminUser, password: target.idp.adminPassword }), signal: AbortSignal.timeout(15000) });
    assert.ok(auth.ok);
    const token = (await auth.json()).access_token;
    const res = await fetch(target.idp.publicUrl + '/admin/realms/' + new URL(target.idp.issuer).pathname.split('/').pop() + route, { method, headers: { Authorization: 'Bearer ' + token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000) });
    assert.ok(res.ok, 'Local IdP operation rejected: ' + res.status);
    const text = await res.text(); return text ? JSON.parse(text) : null;
  };
}

/** Synthetic setup only; all calendar decisions under test are later made over authenticated HTTP. */
export async function seedLasarActual(db) {
 await ownedDatabase(db);
 return db.begin(async tx=>{
  await tx`set constraints all deferred`;
  const f=await createLasarFixture(tx);
  const [{today}]=await tx`select current_date::text today`;
  const currentYear=Number(today.slice(0,4))-(today.slice(5,7)<'07'?1:0),year=currentYear+1;
  assert.equal(year,2027,'The catalog-bound synthetic class fixture must be refreshed for the current school year');
  const currentVersion=await seedDecidedYear(tx,f,{unitId:f.schools.A,schoolYear:currentYear,schoolTypes:f.schoolTypes.A,ht:{start:`${currentYear}-08-17`,end:`${currentYear}-12-30`},exceptions:{[`${currentYear}-12-28`]:{kind:'studiedag',note:'Syntetisk vecka 53'}}});
  // Explicit copy-review source: Easter is movable, and 2026 has ISO week 53.
  const foreignVersion=randomUUID();
  await tx`set local session_replication_role=replica`;
  await tx`insert into public.school_years(id,organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on)
   values(${foreignVersion},${f.id(4)},${f.schools.foreign},${year},${`${year}-08-17`},${`${year}-12-22`},${`${year+1}-01-11`},${`${year+1}-06-11`},'faststalld',${`${year}-06-01`})`;
  await tx`set local session_replication_role=origin`;
  await tx`set constraints all immediate`;
  return {prefix:f.prefix,year,currentYear,today,currentVersion,customerId:f.id(1),organizerId:f.id(2),schools:f.schools,
   actors:Object.fromEntries(LASAR_ACTUAL_ROLES.map(role=>[role,{identityId:f.identity(role),membershipId:f.membership(role),assignmentId:f.roles[role]}])),
   groups:f.groups,offerings:f.offerings,schoolTypes:f.schoolTypes,foreignCanary:{customerId:f.id(3),organizerId:f.id(4),schoolId:f.schools.foreign,versionId:foreignVersion}};
 });
}
export async function lasarForeignFingerprint(db,seed) {
 await ownedDatabase(db);const c=seed.foreignCanary;
 const [r]=await db`select jsonb_build_object(
  'customer',(select to_jsonb(x) from public.customers x where id=${c.customerId}),
  'organizer',(select to_jsonb(x) from public.organizers x where id=${c.organizerId}),
  'school',(select to_jsonb(x) from public.school_units x where id=${c.schoolId}),
  'calendars',(select coalesce(jsonb_agg(to_jsonb(x) order by id),'[]') from public.school_years x where unit_id=${c.schoolId}),
  'days',(select coalesce(jsonb_agg(to_jsonb(x) order by school_year_id,day),'[]') from public.school_year_days x where school_year_id=${c.versionId})
 ) value`;
 assert.ok(r.value.calendars.length);return {sha256:hash(JSON.stringify(r.value)),customerId:c.customerId,calendars:r.value.calendars.length};
}
/** Får bara anropas när den ägande webbläsarprocessen har avslutats. Läser eller skriver aldrig verksamhetsdata. */
export async function recoverLasarOidcFixture(journalPath) {
  assert.ok(journalPath.startsWith('/private/tmp/') && journalPath.endsWith('/oidc-private.json'));
  assert.equal(realpathSync(journalPath), journalPath); const stat = lstatSync(journalPath);
  assert.ok(stat.isFile()); assert.equal(stat.mode & 0o077, 0); assert.equal(stat.uid, process.getuid());
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')); assert.equal(journal.kind, 'lasar-owned-oidc'); assert.equal(journal.baseURL, LASAR_ACTUAL_BASE);
  assert.match(journal.runId, /^[a-f0-9-]{36}$/u); assert.ok(Array.isArray(journal.users) && journal.users.length <= LASAR_ACTUAL_ROLES.length);
  const verifiedCallbacks = journal.auth.filter(a => a.status === 'verified').length;
  if (journal.cleanup === 'complete') return { runId: journal.runId, cleanup: 'complete', deletedUsers: journal.users.length, verifiedCallbacks };
  for (const user of journal.users) { assert.ok(LASAR_ACTUAL_ROLES.includes(user.role)); assert.equal(user.username, 'lasar-' + journal.runId + '-' + user.role.toLowerCase()); if (user.subject) assert.match(user.subject, /^[a-f0-9-]{36}$/u); }
  assert.equal(new Set(journal.users.map(u => u.username)).size, journal.users.length);
  const target = await assertTarget('protected', { requireIdp: true }), keycloak = keycloakClient(target);
  const clients = await keycloak('/clients?clientId=' + encodeURIComponent(target.idp.clientId)); assert.equal(clients.length, 1); assert.equal(clients[0].id, journal.clientId);
  for (const user of journal.users) {
    const matches = await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true'); assert.ok(matches.length <= 1);
    if (matches.length) { assert.equal(matches[0].username, user.username); if (user.subject) assert.equal(matches[0].id, user.subject); await keycloak('/users/' + matches[0].id, 'DELETE'); }
    assert.equal((await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true')).length, 0);
  }
  if (journal.redirectAdded) {
    const current = await keycloak('/clients/' + journal.clientId); assert.equal(current.clientId, target.idp.clientId);
    current.redirectUris = current.redirectUris.filter(uri => uri !== LASAR_ACTUAL_BASE + '/api/auth/callback'); await keycloak('/clients/' + journal.clientId, 'PUT', current);
    assert.equal((await keycloak('/clients/' + journal.clientId)).redirectUris.includes(LASAR_ACTUAL_BASE + '/api/auth/callback'), false);
  }
  let lockRemoved = false;
  try { if (readFileSync(LOCK, 'utf8') === journal.runId) { unlinkSync(LOCK); lockRemoved = true; } } catch (error) { if (error.code !== 'ENOENT') throw error; }
  journal.cleanup = 'complete'; journal.recoveredAfterWorkerExit = true;
  writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 });
  return { runId: journal.runId, cleanup: 'complete', deletedUsers: journal.users.length, redirectRestored: true, recoveredAfterWorkerExit: true, lockRemoved, verifiedCallbacks };
}

/**
 * Binder seedens syntetiska identiteter till nya slumpade Keycloak-användare (utfärdare och subjekt byts till den lokala
 * realmens) och ger inloggning med riktig TOTP, step-up och direkta HTTP-anrop med sessionens epok.
 */
export async function createLasarOidcFixture({ db, provenance, baseURL, evidenceDir, seed, roles = LASAR_ACTUAL_ROLES }) {
  const target = await assertTarget('protected', { requireIdp: true }), runId = randomUUID();
  assert.equal(baseURL, LASAR_ACTUAL_BASE); assert.equal((await db`select current_database() n`)[0].n, provenance.database);
  assert.ok(roles.every(r => LASAR_ACTUAL_ROLES.includes(r)));
  const lockFd = openSync(LOCK, 'wx', 0o600); writeFileSync(lockFd, runId);
  const journalPath = path.join(evidenceDir, 'oidc-private.json'), journal = { kind: 'lasar-owned-oidc', baseURL, runId, users: [], auth: [], redirectAdded: false, cleanup: 'pending' }, actors = {};
  const save = () => writeFileSync(journalPath, JSON.stringify(journal, null, 2) + '\n', { mode: 0o600 }); save();
  let client, closed = false;
  const keycloak = keycloakClient(target);
  const cleanup = async () => {
    if (closed) return { runId, cleanup: journal.cleanup, deletedUsers: journal.users.length, verifiedCallbacks: journal.auth.filter(a => a.status === 'verified').length };
    for (const user of journal.users) { const matches = await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true'); assert.ok(matches.length <= 1); if (matches.length) { assert.equal(matches[0].username, user.username); if (user.subject) assert.equal(matches[0].id, user.subject); await keycloak('/users/' + matches[0].id, 'DELETE'); } assert.equal((await keycloak('/users?username=' + encodeURIComponent(user.username) + '&exact=true')).length, 0); }
    if (journal.redirectAdded) { const current = await keycloak('/clients/' + client.id); assert.equal(current.clientId, target.idp.clientId); current.redirectUris = current.redirectUris.filter(x => x !== baseURL + '/api/auth/callback'); await keycloak('/clients/' + client.id, 'PUT', current); }
    assert.equal(readFileSync(LOCK, 'utf8'), runId); closeSync(lockFd); unlinkSync(LOCK); journal.cleanup = 'complete'; closed = true; save();
    return { runId, cleanup: journal.cleanup, deletedUsers: journal.users.length, redirectRestored: true, verifiedCallbacks: journal.auth.filter(a => a.status === 'verified').length };
  };
  try {
    const clients = await keycloak('/clients?clientId=' + encodeURIComponent(target.idp.clientId)); assert.equal(clients.length, 1); client = clients[0]; journal.clientId = client.id;
    if (!client.redirectUris.includes(baseURL + '/api/auth/callback')) { journal.redirectAdded = true; save(); await keycloak('/clients/' + client.id, 'PUT', { ...client, redirectUris: [...client.redirectUris, baseURL + '/api/auth/callback'] }); }
    assert.ok(seed?.actors, 'Seed krävs');
    for (const role of roles) {
      const seeded = seed.actors[role]; assert.ok(seeded, 'Okänd roll ' + role);
      const username = 'lasar-' + runId + '-' + role.toLowerCase(), password = randomBytes(24).toString('base64url'), email = username + '@synthetic.example.test';
      assert.equal((await keycloak('/users?username=' + encodeURIComponent(username) + '&exact=true')).length, 0);
      const user = { username, password, email, subject: null, role, ...seeded }; journal.users.push(user); save();
      await keycloak('/users', 'POST', { username, email, firstName: 'Syntetisk', lastName: 'Kalenderprov', enabled: true, emailVerified: true, requiredActions: ['CONFIGURE_TOTP'] });
      const found = await keycloak('/users?username=' + encodeURIComponent(username) + '&exact=true'); assert.equal(found.length, 1); user.subject = found[0].id; save();
      await keycloak('/users/' + user.subject + '/reset-password', 'PUT', { type: 'password', value: password, temporary: false });
      const [bound] = await db`update public.identities set issuer=${target.idp.issuer},subject=${user.subject},email=${email} where id=${seeded.identityId} returning id`;
      assert.ok(bound, 'Seedens identitet saknas');
      assert.equal((await db`select public.assignment_is_valid(a) valid from public.access_assignments a where id=${seeded.assignmentId}`)[0].valid, true, 'Syntetisk aktör kräver ett giltigt mandat');
      actors[role] = user;
    }
    const view = async (page, role, select = false) => {
      const a = actors[role]; let r = await page.request.get(baseURL + '/api/session'); assert.equal(r.status(), 200); let v = await r.json(); assert.equal(v.identity.subject, a.subject);
      if (select && v.context?.assignmentId !== a.assignmentId) { r = await page.request.post(baseURL + '/api/context', { headers: { Origin: baseURL, 'Sec-Fetch-Site': 'same-origin', 'X-Context-Epoch': String(v.epoch) }, data: { assignmentId: a.assignmentId } }); assert.equal(r.status(), 200, 'Context selection: ' + JSON.stringify(await r.json())); r = await page.request.get(baseURL + '/api/session'); v = await r.json(); }
      assert.equal(v.context?.assignmentId, a.assignmentId); assert.equal(v.context.valid, true); a.epoch = v.epoch;
      const cookie = (await page.context().cookies(baseURL)).find(c => c.name === 'sp_session'); assert.ok(cookie);
      const [s] = await db`select id::text,identity_id::text,context_epoch::int epoch from public.app_sessions where token_hash=${Buffer.from(hash(cookie.value), 'hex')}`; assert.equal(s.identity_id, a.identityId); assert.equal(s.epoch, v.epoch);
      return { role, identityId: a.identityId, issuer: target.idp.issuer, subject: a.subject, sessionId: s.id, epoch: v.epoch, mfa: v.mfa.proof };
    };
    const audits = async role => Array.from(await db`select id::text,source,action,outcome,actor_identity_id::text,actor_issuer,actor_subject,session_id::text,details from public.security_events where actor_identity_id=${actors[role].identityId} and action='login' order by id`);
    const code = async a => {
      const token = await freshOidcCode({ lastCode: a.lastCode,
        generate: timestamp => new OTP.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTP.Secret.fromBase32(a.secret) }).generate({ timestamp }) });
      a.lastCode = token; save(); return token;
    };
    const fill = async (page, a) => {
      const username = page.getByLabel(/Användarnamn|Username/i), password = page.getByRole('textbox', { name: /Lösenord|Password/i }), otp = page.getByLabel(/Engångskod|Engångslösenord|One-time code/i);
      await password.waitFor({ state: 'visible', timeout: 15000 }); if (await username.isVisible()) await username.fill(a.username); await password.fill(a.password); await page.getByRole('button', { name: /Logga in|Sign In/i }).click();
      const secret = page.locator('#kc-totp-secret-key'), manual = page.getByText(/Kan du inte (?:skanna|scanna)|Unable to scan/i);
      const next = await Promise.race([secret.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'secret'), manual.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'manual'), otp.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'otp'), page.waitForURL(u => u.origin === baseURL, { timeout: 15000 }).then(() => 'returned')]);
      if (next === 'returned') return;
      if (next === 'manual') await manual.click();
      if (next !== 'otp') { await secret.waitFor({ state: 'visible' }); a.secret = (await secret.innerText()).replaceAll(/\s/gu, ''); save(); await page.locator('input[name="totp"]').fill(await code(a)); const label = page.locator('input[name="userLabel"]'); if (await label.isVisible()) await label.fill('Isolerat kalenderprov'); await page.getByRole('button', { name: /Skicka|Spara|Logga in|Submit/i }).click(); }
      else { assert.ok(a.secret); await otp.fill(await code(a)); await page.getByRole('button', { name: /Logga in|Sign In/i }).click(); }
    };
    /**
     * Riktig inloggning. trigger: valfri UI-åtgärd (t.ex. knappen Verifiera med engångskod) som startar navigeringen i stället för page.goto.
     * @param {import('@playwright/test').Page} page
     * @param {string} role
     * @param {{ stepUp?: boolean, returnTo?: string, trigger?: (() => Promise<unknown>) | null }} [options]
     */
    const login = async (page, role, { stepUp = false, returnTo = '/', trigger = null } = {}) => {
      const a = actors[role], before = stepUp ? await view(page, role) : null, priorAudits = await audits(role), priorSessions = await db`select id::text from public.app_sessions where identity_id=${a.identityId}`;
      const attempt = { id: randomUUID(), role, identityId: a.identityId, issuer: target.idp.issuer, subject: a.subject, origin: baseURL, stepUp, viaUi: Boolean(trigger), priorAuditIds: priorAudits.map(x => x.id), priorSessionIds: priorSessions.map(s => s.id), ...(before ? { sessionId: before.sessionId, epoch: before.epoch } : {}), loginRequests: 0 };
      const callbacks = [], pending = []; journal.auth.push(attempt); save();
      const observe = req => { const u = new URL(req.url()); if (u.origin !== baseURL) return; if (u.pathname === '/api/auth/login') attempt.loginRequests++; if (u.pathname === '/api/auth/callback') { const c = { id: randomUUID(), attemptId: attempt.id, role, origin: u.origin, pathname: u.pathname, method: req.method(), navigation: req.isNavigationRequest(), status: null }; callbacks.push(c); pending.push(Promise.race([req.response(), new Promise(resolve => setTimeout(() => resolve(null), 3000))]).then(r => { if (r) c.status = r.status(); })); } };
      page.context().on('request', observe);
      try {
        if (trigger) await trigger(); else await page.goto(baseURL + '/api/auth/login?' + new URLSearchParams({ till: returnTo, ...(stepUp ? { step_up: '1' } : {}) }));
        await fill(page, a); await page.waitForURL(u => u.origin === baseURL && !u.pathname.startsWith('/api/auth'), { timeout: 30000 }); const proof = await view(page, role, true); await Promise.all(pending);
        const verified = verifyClassCohortCallbackProof({ attempt, callbacks, audits: (await audits(role)).filter(x => !attempt.priorAuditIds.includes(x.id)), session: proof, browserReturn: { origin: new URL(page.url()).origin, pathname: new URL(page.url()).pathname } }); Object.assign(attempt, { proof: verified, callbacks, status: 'verified' }); save();
        if (!proof.mfa) return login(page, role, { stepUp: true, returnTo });
        if (!trigger) await page.goto(baseURL + returnTo);
        return proof;
      } finally { page.context().off('request', observe); }
    };
    const request = async (page, role, route, input, headers = {}) => {
      assert.ok(route.startsWith('/api/') && !route.startsWith('/api/auth'));
      const r = await page.request.fetch(baseURL + route, { method: input === undefined ? 'GET' : 'POST', headers: { Origin: baseURL, 'Sec-Fetch-Site': 'same-origin', 'X-Context-Epoch': String(actors[role].epoch), ...headers }, ...(input === undefined ? {} : { data: input }), maxRetries: 0 });
      let body = null; try { body = await r.json(); } catch { body = null; }
      return { status: r.status(), body };
    };
    return {
      baseURL, seed, actors, login, request, view, cleanup,
      /** Gör sessionens MFA-bevis äldre än 8 timmar (samma mekanism som APL-provet), så att nästa skrivning kräver step-up. */
      async expireMfa(page, role) { const s = await view(page, role); await db`update public.app_sessions set auth_time=now()-interval '9 hours' where id=${s.sessionId} and identity_id=${actors[role].identityId}`; },
      proof: () => ({ runId, auth: journal.auth.map(({ id, role, stepUp, viaUi, status, proof }) => ({ id, role, stepUp, viaUi, status, proof })), cleanup: journal.cleanup }),
    };
  } catch (error) { try { await cleanup(); } catch { journal.cleanup = 'failed'; save(); } throw error; }
}
