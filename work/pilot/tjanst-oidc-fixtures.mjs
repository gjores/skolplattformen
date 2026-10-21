// 05.1-09: syntetiska användare och data för det faktiska provet av tjänstefördelningen.
// Riktig Keycloak -> GoTrue -> Worker på 127.0.0.1:3015 mot provets egen schemakopia (aldrig den skyddade databasen
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
import { verifyClassCohortCallbackProof } from './phase5-class-cohort-oidc-fixtures.mjs';
import { createTjanstFixture, grantSelf, planCommand, planSend, seedGy25Class, staffWithDuties } from './tjanst-fixtures.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const OTP = createRequire(path.join(root, 'web/package.json'))('otpauth');
const hash = s => createHash('sha256').update(s).digest('hex');
export const TJANST_ACTUAL_BASE = 'http://127.0.0.1:3015';
/** De sju syntetiska rollerna i provet (plan 09): huvudman, rektor A, rektor B, rektor AB, administratör A, self-lärare P1 och grupplärare. */
export const TJANST_ACTUAL_ROLES = ['hm', 'principalA', 'principalB', 'principalAB', 'admin', 'teacherSelf', 'teacherGroup'];
const LOCK = path.join(root, 'work/pilot/targets/protected/idp/named-timplan-run.lock');
/** Projekten i Playwright-konfigurationen (UI-SPEC Responsive: 1440 × 900, 1024 × 768, 390 × 844 och 320 × 740). */
export const TJANST_ACTUAL_PROJECTS = ['desktop', 'desktop-small', 'phone', 'phone-small'];
/** Namngivna fall per projekt. Rapporten kräver ett godkänt fall per namn; saknade redovisas som ej körda. */
const PHONE_CASES = ['Min tjänst på telefon', 'Per lärare på telefon utan redigeringskontroller', 'Bemanning på telefon utan redigeringskontroller', '44 px på telefon'];
/** 05.1-12 (WR-07): huvudmannens Visa fördelningen läser den publicerade versionen med versionId, också när rektor har ett utkast. */
const BEMANNING_PUBLISHED = 'Bemanning: Visa fördelningen visar publicerad version trots utkast';
export const TJANST_ACTUAL_CASES = {
  desktop: ['spår', 'GR/IM-klass i Timplaner med behov', 'okopplad klass utan nollor', 'ny version: läraren ser den tidigare', 'äldre version skrivskyddad (D-24)',
    'fördela tom cell', 'person utan konto får rader', 'annan skola och annat läsår nekas', 'specialuppdrag', 'två lärare på samma kurs', 'samläsning räknas en gång',
    'utkastlärare från rektor', 'administratör utan knapp och 403 vid publicering', 'kvittens till tjanst_feedback', 'versionshistorik med aktör och tid',
    'huvudmannens Bemanning utan beslutsknapp och 403 vid publicering', 'personal: utan konto och utkastlärare', 'andelar 60 % + 40 % sparas och 60 % + 50 % nekas med engångskod',
    'rektor B ser bara Andel här 40 %', 'tillstånd: 403', 'två flikar: den andra får 409', 'avbrutet svar återhämtas via status', 'tillstånd: laddning', 'tillstånd: loggfel',
    'tillstånd: MFA', 'tillstånd: context_changed', BEMANNING_PUBLISHED, 'tangentbord, fokus och 44 px'],
  'desktop-small': ['fördela', 'samläsning', 'publicera', 'tangentbord, fokus och 44 px'],
  phone: [...PHONE_CASES, BEMANNING_PUBLISHED],
  'phone-small': PHONE_CASES,
};

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

/**
 * Syntetiskt underlag i provets egen schemakopia (migrationerna ska vara installerade). Allt skapas i en committad
 * transaktion i en egen kund: skolor A/B/C, roller, en godkänd Gy25-klass (BF25) på skola A, fastställda GR- och
 * IM-timplaner och läsårskalender för samma läsår (klasserna skapas och kopplas av rektor i provet), en okopplad
 * GR-klass och personal. P1 har mandatet Egen tjänst. Med published=true finns dessutom en publicerad version 1
 * (förberedd med samma kommandofunktioner som Worker anropar) för telefonprojekten, som bara läser. Med linkGrim=true skapas
 * och kopplas GR-klassen SYNGR8 (åk 8) och IM-klassen SYNIM med rektors GR/IM-kommando (för desktop-small; på desktop görs
 * det i Timplaner i webbläsaren).
 */
export async function seedTjanstActual(connection, { published = false, linkGrim = false, schoolB = false } = {}) {
  return connection.begin(async tx => {
    await tx`set constraints all deferred`;
    const f = await createTjanstFixture(tx);
    const gy = await seedGy25Class(tx, f, 'SYNBF1');
    const Y = gy.year, A = f.schools.A;
    await f.actor(tx, 'hm');
    const grOffering = randomUUID(), imOffering = randomUUID(), grPlan = randomUUID(), imPlan = randomUUID(), loose = randomUUID();
    await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values
     (${grOffering},${f.id(2)},${A},'grundskola','Syntetisk grundskola 7–9',${'Läsåret ' + Y + '/' + String(Y + 1).slice(2)},${[7, 8, 9]}::smallint[],${Y}),
     (${imOffering},${f.id(2)},${A},'introduktionsprogram','Syntetiskt introduktionsprogram',${'Läsåret ' + Y + '/' + String(Y + 1).slice(2)},null,${Y})`;
    await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${grPlan},${f.id(2)},${grOffering},${A},1,'Syntetisk GR-timplan'),(${imPlan},${f.id(2)},${imOffering},${A},1,'Syntetisk IM-timplan')`;
    await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values
     (${grPlan},'matematik',${[100, 90, 80]}::smallint[]),(${grPlan},'engelska',${[60, 60, 60]}::smallint[]),(${grPlan},'biologi',${[70, 100, 70]}::smallint[]),
     (${imPlan},'im-ma',${[3]}::smallint[]),(${imPlan},'im-sv',${[5]}::smallint[]),(${imPlan},'im-en',${[2]}::smallint[])`;
    await tx`set local session_replication_role=replica`;
    await tx`update public.timplans set status='faststalld',decided_on=${Y + '-06-01'} where id in (${grPlan},${imPlan})`;
    const sy = (await tx`insert into public.school_years(organizer_id,unit_id,start_year,ht_start,ht_end,vt_start,vt_end,status,decided_on)
     values(${f.id(2)},${A},${Y},${Y + '-08-17'},${Y + '-12-22'},${(Y + 1) + '-01-11'},${(Y + 1) + '-06-11'},'faststalld',${Y + '-05-01'}) returning id`)[0].id;
    await tx`insert into public.school_year_days(school_year_id,day,kind) values(${sy},${Y + '-10-30'},'lovdag'),(${sy},${(Y + 1) + '-02-19'},'studiedag')`;
    await tx`set local session_replication_role=origin`;
    // En GR-klass för läsåret utan koppling: behovet är okänt, inte noll.
    await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year) values(${loose},${f.id(1)},${f.id(2)},${A},${grOffering},'SYN9X',${Y})`;
    let grimClasses = null;
    if (linkGrim) {
      await f.actor(tx, 'principalA');
      const grim = q => tx`select public.phase51_grim_class_command(${tx.json(q)}) value`.then(r => r[0].value);
      const gr = await grim({ action: 'create', commandId: randomUUID(), planId: grPlan, expectedPlanRevision: 0, name: 'SYNGR8' });
      const im = await grim({ action: 'create', commandId: randomUUID(), planId: imPlan, expectedPlanRevision: 0, name: 'SYNIM' });
      const grId = gr.id, imId = im.id;
      assert.ok(grId && imId, 'GR/IM-klasserna skapades inte: ' + JSON.stringify({ gr, im }));
      await grim({ action: 'link', commandId: randomUUID(), classId: grId, planId: grPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null });
      await grim({ action: 'link', commandId: randomUUID(), classId: imId, planId: imPlan, expectedPlanRevision: 0, columnId: 'vecka', expectedLinkRevision: null, previousPlanId: null });
      grimClasses = { gr: grId, im: imId };
    }
    // Skola B (för rektor B): fastställd GR-plan och klassen SYNB8 kopplad till åk 8 med rektor B:s GR/IM-kommando.
    let schoolBClass = null;
    if (schoolB) {
      await f.actor(tx, 'hm');
      const bOffering = randomUUID(), bPlan = randomUUID();
      await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year) values
       (${bOffering},${f.id(2)},${f.schools.B},'grundskola','Syntetisk grundskola B 7–9',${'Läsåret ' + Y + '/' + String(Y + 1).slice(2)},${[7, 8, 9]}::smallint[],${Y})`;
      await tx`insert into public.timplans(id,organizer_id,offering_id,unit_id,version,basis) values(${bPlan},${f.id(2)},${bOffering},${f.schools.B},1,'Syntetisk GR-timplan B')`;
      await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${bPlan},'matematik',${[100, 90, 80]}::smallint[])`;
      await tx`set local session_replication_role=replica`;
      await tx`update public.timplans set status='faststalld',decided_on=${Y + '-06-01'} where id=${bPlan}`;
      await tx`set local session_replication_role=origin`;
      await f.actor(tx, 'principalB');
      const grim = q => tx`select public.phase51_grim_class_command(${tx.json(q)}) value`.then(r => r[0].value);
      const created = await grim({ action: 'create', commandId: randomUUID(), planId: bPlan, expectedPlanRevision: 0, name: 'SYNB8' });
      await grim({ action: 'link', commandId: randomUUID(), classId: created.id, planId: bPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null });
      schoolBClass = created.id;
    }
    // Personal: P1 (Egen tjänst), Tor Berg utan konto, Ulla Sund på skola A. Sara Dahl läggs upp av huvudmannen i provet.
    const p1 = await staffWithDuties(tx, f, { givenName: 'Pia', familyName: 'Ek', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
    const t2 = await staffWithDuties(tx, f, { givenName: 'Tor', familyName: 'Berg', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
    const t3 = await staffWithDuties(tx, f, { givenName: 'Ulla', familyName: 'Sund', duties: [{ unitId: A, percent: 100, startsOn: '2026-07-01' }] });
    await grantSelf(tx, f, { unitIds: [A], staffPersonId: p1.personId });
    const need = gy.timeRows[gy.aplKey];
    let publishedVersion = null;
    if (published) {
      await f.actor(tx, 'principalA');
      const send = async q => { const e = await planSend(tx, q); assert.equal(e.contractVersion, 'tjanst_sql_v1'); return e.result; };
      let r = await send(await planCommand(A, Y, 'create_draft', 0, { basedOnVersionId: null }));
      const read = r.detail, klass = read.classes.find(c => c.classId === gy.classId), first = klass.needs.find(n => n.rowKey === gy.aplKey);
      r = await send(await planCommand(A, Y, 'save_row', r.detail.revision, { rowId: null, sourceKind: 'class_timplan', sourceKey: first.sourceKey, personId: p1.personId, teacherHt: 3000, teacherVt: 2400, comment: '' }));
      r = await send(await planCommand(A, Y, 'publish', r.detail.revision, {}, { expectedContentHash: r.detail.version.contentHash }));
      publishedVersion = { id: r.detail.version.id, versionNo: r.detail.version.versionNo };
    }
    await tx`set constraints all immediate`;
    const actors = Object.fromEntries(['hm', 'principalA', 'principalB', 'principalAB', 'admin', 'teacherSelf', 'teacherGroup']
      .map(role => [role, { identityId: f.identity(role), membershipId: f.membership(role), assignmentId: f.roles[role] }]));
    return { prefix: f.prefix, year: Y, customerId: f.id(1), organizerId: f.id(2), schools: f.schools, actors,
      gy: { classId: gy.classId, planId: gy.planId, offeringId: gy.offeringId, aplKey: gy.aplKey, schoolMinutes: need?.schoolMinutes ?? null },
      grim: { grPlan, imPlan, grOffering, imOffering, looseClassId: loose, classes: grimClasses, schoolBClass },
      people: { p1: p1.personId, t2: t2.personId, t3: t3.personId }, publishedVersion };
  });
}

/** Får bara anropas när den ägande webbläsarprocessen har avslutats. Läser eller skriver aldrig verksamhetsdata. */
export async function recoverTjanstOidcFixture(journalPath) {
  assert.ok(journalPath.startsWith('/private/tmp/') && journalPath.endsWith('/oidc-private.json'));
  assert.equal(realpathSync(journalPath), journalPath); const stat = lstatSync(journalPath);
  assert.ok(stat.isFile()); assert.equal(stat.mode & 0o077, 0); assert.equal(stat.uid, process.getuid());
  const journal = JSON.parse(readFileSync(journalPath, 'utf8')); assert.equal(journal.kind, 'tjanst-owned-oidc'); assert.equal(journal.baseURL, TJANST_ACTUAL_BASE);
  assert.match(journal.runId, /^[a-f0-9-]{36}$/u); assert.ok(Array.isArray(journal.users) && journal.users.length <= TJANST_ACTUAL_ROLES.length);
  const verifiedCallbacks = journal.auth.filter(a => a.status === 'verified').length;
  if (journal.cleanup === 'complete') return { runId: journal.runId, cleanup: 'complete', deletedUsers: journal.users.length, verifiedCallbacks };
  for (const user of journal.users) { assert.ok(TJANST_ACTUAL_ROLES.includes(user.role)); assert.equal(user.username, 'tjanst-' + journal.runId + '-' + user.role.toLowerCase()); if (user.subject) assert.match(user.subject, /^[a-f0-9-]{36}$/u); }
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
    current.redirectUris = current.redirectUris.filter(uri => uri !== TJANST_ACTUAL_BASE + '/api/auth/callback'); await keycloak('/clients/' + journal.clientId, 'PUT', current);
    assert.equal((await keycloak('/clients/' + journal.clientId)).redirectUris.includes(TJANST_ACTUAL_BASE + '/api/auth/callback'), false);
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
export async function createTjanstOidcFixture({ db, provenance, baseURL, evidenceDir, seed, roles = TJANST_ACTUAL_ROLES }) {
  const target = await assertTarget('protected', { requireIdp: true }), runId = randomUUID();
  assert.equal(baseURL, TJANST_ACTUAL_BASE); assert.equal((await db`select current_database() n`)[0].n, provenance.database);
  assert.ok(roles.every(r => TJANST_ACTUAL_ROLES.includes(r)));
  const lockFd = openSync(LOCK, 'wx', 0o600); writeFileSync(lockFd, runId);
  const journalPath = path.join(evidenceDir, 'oidc-private.json'), journal = { kind: 'tjanst-owned-oidc', baseURL, runId, users: [], auth: [], redirectAdded: false, cleanup: 'pending' }, actors = {};
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
      const username = 'tjanst-' + runId + '-' + role.toLowerCase(), password = randomBytes(24).toString('base64url'), email = username + '@synthetic.example.test';
      assert.equal((await keycloak('/users?username=' + encodeURIComponent(username) + '&exact=true')).length, 0);
      const user = { username, password, email, subject: null, role, ...seeded }; journal.users.push(user); save();
      await keycloak('/users', 'POST', { username, email, firstName: 'Syntetisk', lastName: 'Tjänstprov', enabled: true, emailVerified: true, requiredActions: ['CONFIGURE_TOTP'] });
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
    const code = async a => { for (let n = 0; n < 130; n++) { const token = new OTP.TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: OTP.Secret.fromBase32(a.secret) }).generate(); if (token !== a.lastCode) { a.lastCode = token; save(); return token; } await new Promise(resolve => setTimeout(resolve, 250)); } throw Error('Fresh OTP unavailable'); };
    const fill = async (page, a) => {
      const username = page.getByLabel(/Användarnamn|Username/i), password = page.getByRole('textbox', { name: /Lösenord|Password/i }), otp = page.getByLabel(/Engångskod|Engångslösenord|One-time code/i);
      await password.waitFor({ state: 'visible', timeout: 15000 }); if (await username.isVisible()) await username.fill(a.username); await password.fill(a.password); await page.getByRole('button', { name: /Logga in|Sign In/i }).click();
      const secret = page.locator('#kc-totp-secret-key'), manual = page.getByText(/Kan du inte (?:skanna|scanna)|Unable to scan/i);
      const next = await Promise.race([secret.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'secret'), manual.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'manual'), otp.waitFor({ state: 'visible', timeout: 15000 }).then(() => 'otp'), page.waitForURL(u => u.origin === baseURL, { timeout: 15000 }).then(() => 'returned')]);
      if (next === 'returned') return;
      if (next === 'manual') await manual.click();
      if (next !== 'otp') { await secret.waitFor({ state: 'visible' }); a.secret = (await secret.innerText()).replaceAll(/\s/gu, ''); save(); await page.locator('input[name="totp"]').fill(await code(a)); const label = page.locator('input[name="userLabel"]'); if (await label.isVisible()) await label.fill('Isolerat tjänstprov'); await page.getByRole('button', { name: /Skicka|Spara|Logga in|Submit/i }).click(); }
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
