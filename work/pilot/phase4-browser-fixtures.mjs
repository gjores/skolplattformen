#!/usr/bin/env node
// 04-16: syntetiska registerscenarion i assertTarget-skyddat lokalt mål.
// Kör: node work/pilot/phase4-browser-fixtures.mjs --target protected
// Import av PHASE4_IDS/PHASE4_USERS har inga sidoeffekter.
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';
import { createTimplanBrowserFixture } from './phase5-browser-fixtures.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const here = fileURLToPath(import.meta.url);
export const PHASE4_IDS = Object.freeze({
  customer: '33000000-0000-4000-8000-000000000001',
  organizer: '33000000-0000-4000-8000-000000000011',
  unit: '33000000-0000-4000-8000-000000000111',
  otherUnit: '33000000-0000-4000-8000-000000000112',
  otherCustomer: '33000000-0000-4000-8000-000000000002',
  otherCustomerUnit: '33000000-0000-4000-8000-000000000121',
  group: '33000000-0000-4000-8000-000000000311',
  namesakeA: '44001600-0000-4000-8000-000000000201',
  namesakeB: '44001600-0000-4000-8000-000000000202',
  protected: '44001600-0000-4000-8000-000000000203',
  future: '44001600-0000-4000-8000-000000000204',
  ended: '44001600-0000-4000-8000-000000000205',
  classChanged: '44001600-0000-4000-8000-000000000206',
  municipalitySource: '44001600-0000-4000-8000-000000000207',
  classB: '44001600-0000-4000-8000-000000000311',
  classOtherEducation: '44001600-0000-4000-8000-000000000312',
});
export const PHASE4_USERS = Object.freeze({
  protectedAdmin: 'p4.admin.skyddad',
  concurrentAdmin: 'p4.admin.samtidig',
  unprotectedAdmin: 'p3.admin',
  teacherInClass: 'p3.larare',
  teacherOutsideGroup: 'p4.larare.utanfor',
  adminOtherSchool: 'p4.admin.annanskola',
  adminOtherCustomer: 'p4.admin.annankund',
  principalOtherSchool: 'p4.rektor.annanskola',
  principalOtherCustomer: 'p4.rektor.annankund',
  support: 'p3.support',
  organizer: 'p3.huvudman',
  principal: 'p3.rektor',
});

// 05-22:s elevplaceringsprov äger en separat syntetisk kund per browserfall.
// Basen skapar riktiga mandat och lokala sessionsbevis; inga globala fas 4-rader ändras.
export async function createSharedOfferingRegisterFixture() {
  const fixture = await createTimplanBrowserFixture();
  try {
    const school = await fixture.sharedSchool();
    const register = await fixture.prepareRegister(school.session);
    return { ...fixture, register };
  } catch (error) {
    await fixture.cleanup();
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === here) {
  if (process.argv.slice(2).join(' ') !== '--target protected') {
    console.error('REFUSED: använd --target protected'); process.exit(1);
  }
  let pgpass;
  try {
    const target = await assertTarget('protected', { requireIdp: true });
    const idpUrl = new URL(target.idp.publicUrl);
    if (!['127.0.0.1', 'localhost'].includes(idpUrl.hostname)) throw new Error('IdP måste vara loopback');
    const dbUrl = new URL(target.dbUrl);
    const psql = (sql, vars = {}) => {
      if (!pgpass) {
        pgpass = path.join(os.tmpdir(), `.skolplattform-p4-pgpass-${process.pid}`);
        const password = decodeURIComponent(dbUrl.password).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
        fs.writeFileSync(pgpass, `${dbUrl.hostname}:${dbUrl.port}:${dbUrl.pathname.slice(1)}:${decodeURIComponent(dbUrl.username)}:${password}\n`, { mode: 0o600, flag: 'wx' });
      }
      const argv = ['-h', dbUrl.hostname, '-p', dbUrl.port, '-U', decodeURIComponent(dbUrl.username), '-d', dbUrl.pathname.slice(1), '-Atq', '-v', 'ON_ERROR_STOP=1'];
      for (const [key, value] of Object.entries(vars)) argv.push('-v', `${key}=${value}`);
      argv.push('-f', '-');
      return execFileSync('psql', argv, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSFILE: pgpass }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
    };
    const keycloak = async (url, init = {}, token) => {
      const response = await fetch(new URL(url, idpUrl), { ...init, headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) } });
      if (!response.ok && response.status !== 409) throw new Error(`Keycloak ${init.method ?? 'GET'} ${url.split('?')[0]}: HTTP ${response.status}`);
      const body = await response.text(); return body ? JSON.parse(body) : null;
    };
    // Basen körs först; dess huvudman/rektor och autentiska delegation återanvänds.
    execFileSync(process.execPath, [path.join(root, 'work/pilot/phase3-browser-fixtures.mjs'), '--target', 'protected'], { stdio: ['ignore', 'pipe', 'pipe'] });
    psql(fs.readFileSync(path.join(root, 'work/pilot/sql/phase4-fixtures.sql'), 'utf8'));
    const credentials = await keycloak('/realms/master/protocol/openid-connect/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: target.idp.adminUser, password: target.idp.adminPassword }),
    });
    const realm = '/admin/realms/skolplattform-test';
    const secretsPath = path.join(target.workdir, 'idp', 'phase4-users.json');
    let secrets = {};
    try { secrets = JSON.parse(fs.readFileSync(secretsPath, 'utf8')); } catch { /* första körningen */ }
    const specs = [
      ['protectedAdmin', 'Ada', 'Skyddsadmin', PHASE4_IDS.customer, 'administrator', PHASE4_IDS.unit, true],
      ['concurrentAdmin', 'Bertil', 'Samtidig', PHASE4_IDS.customer, 'administrator', PHASE4_IDS.unit, true],
      ['teacherOutsideGroup', 'Lena', 'Utomklass', PHASE4_IDS.customer, 'larare', PHASE4_IDS.unit],
      ['principalOtherSchool', 'Runa', 'AnnanSkola', PHASE4_IDS.customer, 'rektor', PHASE4_IDS.otherUnit],
      ['adminOtherSchool', 'Olle', 'AnnanSkola', PHASE4_IDS.customer, 'administrator', PHASE4_IDS.otherUnit],
      ['principalOtherCustomer', 'Rikard', 'AnnanKund', PHASE4_IDS.otherCustomer, 'rektor', PHASE4_IDS.otherCustomerUnit],
      ['adminOtherCustomer', 'Cilla', 'AnnanKund', PHASE4_IDS.otherCustomer, 'administrator', PHASE4_IDS.otherCustomerUnit],
    ];
    const bound = {};
    for (const [key, firstName, lastName, customer, fn, unit, totp = false] of specs) {
      const username = PHASE4_USERS[key];
      secrets[username] ??= crypto.randomBytes(18).toString('base64url');
      let found = await keycloak(`${realm}/users?username=${encodeURIComponent(username)}&exact=true`, {}, credentials.access_token);
      if (!found?.length) {
        await keycloak(`${realm}/users`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, email: `${username}@phase4.example.test`, firstName, lastName, enabled: true, emailVerified: true, requiredActions: totp ? ['CONFIGURE_TOTP'] : [] }) }, credentials.access_token);
        found = await keycloak(`${realm}/users?username=${encodeURIComponent(username)}&exact=true`, {}, credentials.access_token);
      }
      if (totp) {
        const configured = await keycloak(`${realm}/users/${found[0].id}/credentials`, {}, credentials.access_token);
        if (!configured.some((credential) => credential.type === 'otp')) {
          await keycloak(`${realm}/users/${found[0].id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ requiredActions: [...new Set([...(found[0].requiredActions ?? []), 'CONFIGURE_TOTP'])] }) }, credentials.access_token);
        }
      }
      await keycloak(`${realm}/users/${found[0].id}/reset-password`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'password', value: secrets[username], temporary: false }) }, credentials.access_token);
      const identity = psql("insert into public.identities(issuer,subject,display_name,email) values(:'issuer',:'subject',:'name',:'email') on conflict(issuer,subject) do update set display_name=excluded.display_name returning id::text", { issuer: target.idp.issuer, subject: found[0].id, name: `${firstName} ${lastName}`, email: `${username}@phase4.example.test` });
      const membership = psql("insert into public.memberships(identity_id,customer_id) values(:'identity'::uuid,:'customer'::uuid) on conflict(identity_id,customer_id) do update set status='active',blocked_at=null,blocked_by=null,block_reason=null returning id::text", { identity, customer });
      // Rektor delegerar inom kund 1; kund 2:s syntetiska huvudman gör det där.
      const parentAssignment = psql(`select a.id::text from public.access_assignments a where a.customer_id=:'customer'::uuid
        and a.function=:'fn'::public.access_function and public.phase3_mandate_is_valid(a.id)
        and exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=:'unit'::uuid)
        order by a.created_at desc limit 1`, {
        fn: fn === 'rektor' ? 'huvudman' : 'rektor', customer, unit,
      });
      if (!parentAssignment) throw new Error(`Saknar giltig givare för ${key}`);
      let assignment = psql("select id::text from public.access_assignments where membership_id=:'membership'::uuid and function=:'fn'::public.access_function and public.phase3_mandate_is_valid(id) limit 1", { membership, fn });
      if (!assignment) assignment = psql("select public.phase3_insert_mandate(:'parent'::uuid,:'payload'::jsonb)::text", { parent: parentAssignment, payload: JSON.stringify({ membershipId: membership, function: fn, scopeKind: fn === 'larare' ? 'group' : 'school', unitIds: [unit], ...(fn === 'larare' ? { groups: [{ id: PHASE4_IDS.classB, kind: 'teaching' }] } : {}), validFrom: psql('select public.app_today()::text') }) });
      bound[key] = { username, subject: found[0].id, assignment, membership, totp };
    }
    fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
    fs.writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 }); fs.chmodSync(secretsPath, 0o600);
    // Behörigheten måste passera huvudmannens faktiska SQL-kontroll, med aktiv actor-context.
    const hm = psql("select a.id::text || '|' || a.membership_id::text || '|' || m.identity_id::text from public.access_assignments a join public.memberships m on m.id=a.membership_id where a.customer_id=:'customer'::uuid and a.function='huvudman' and public.phase3_mandate_is_valid(a.id) and exists(select 1 from public.mandate_units u where u.assignment_id=a.id and u.unit_id=:'unit'::uuid) order by a.created_at desc limit 1", { customer: PHASE4_IDS.customer, unit: PHASE4_IDS.unit }).split('|');
    if (hm.length !== 3) throw new Error('Saknar giltigt huvudmannamandat');
    const permission = psql(`begin;
      select set_config('app.customer_id',:'customer',true),set_config('app.assignment_id',:'assignment',true),set_config('app.membership_id',:'membership',true),set_config('app.identity_id',:'identity',true);
      select public.phase4_grant_protected_permission(:'recipient'::uuid,:'unit'::uuid)::text;
      commit;`, { customer: PHASE4_IDS.customer, assignment: hm[0], membership: hm[1], identity: hm[2], recipient: bound.protectedAdmin.assignment, unit: PHASE4_IDS.unit }).split('\n').filter((line) => /^[0-9a-f-]{36}$/.test(line)).at(-1);
    if (!permission || psql("select public.phase4_protected_permission_is_valid(:'id'::uuid)::text", { id: permission }) !== 'true') throw new Error('Skyddsbehörigheten kunde inte bekräftas');
    if (psql("select count(*) from public.protected_identity_permissions where assignment_id=:'id'::uuid and revoked_at is null", { id: bound.adminOtherSchool.assignment }) !== '0') throw new Error('Fel administratör fick skyddsbehörighet');
    // Källa skapas genom den riktiga simulerade mottagaren, aldrig direkt i källtabellen.
    psql("select public.phase4_simulated_source_deliver(jsonb_build_object('pupilId',:'pupil'::uuid,'field','displayName','value','Källa Provperson'))", { pupil: PHASE4_IDS.municipalitySource });
    const manifestPath = path.join(target.workdir, 'manifest.json');
    const stored = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    stored.idp.users = [...stored.idp.users.filter((user) => !Object.values(bound).some((candidate) => candidate.username === user.username)), ...Object.values(bound).map(({ username, subject, totp }) => ({ username, subject, email: `${username}@phase4.example.test`, totp }))];
    fs.writeFileSync(manifestPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 }); fs.chmodSync(manifestPath, 0o600);
    const count = Number(psql("select count(*) from public.pupils where customer_id=:'customer'::uuid and id::text like '44001600-%'", { customer: PHASE4_IDS.customer }));
    if (count !== 62) throw new Error(`Registerfixturen ofullständig: ${count}/62`);
    console.log(JSON.stringify({ status: 'OK', target: 'protected', marker: '44001600', pupils: count, users: Object.keys(bound), permission: 'valid', source: 'simulated' }));
  } catch (error) {
    console.error(`BLOCKED: fas 4-fixturen kunde inte skapas: ${error.message}`); process.exitCode = 1;
  } finally { if (pgpass) fs.rmSync(pgpass, { force: true }); }
}
