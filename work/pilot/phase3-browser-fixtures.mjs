#!/usr/bin/env node
// Syntetiska browserkonton för fas 3 (03-05/03-07) i det lokala protected-målet.
//
// Skapar/uppdaterar Keycloak-användare i testrealmen och binder dem till den
// syntetiska fas 3-kunden med servergiltiga mandat: huvudman, rektor (utsedd av
// huvudman), lärare, skoladministratör och elevhälsa med ärendescope (tilldelade
// av rektor) samt IT. För 03-07 tillkommer elevhälsa med skolscope respektive
// elevscope (tilldelade av rektor) och en granskare för kunden. Supportuppdrag
// skapas INTE här; browserprovet låter rektorn tilldela det via formuläret.
//
// Lösenord slumpas och sparas endast i work/pilot/targets/protected/idp/
// phase3-users.json (0600, gitignorerad). Inga lösenord eller tokens skrivs ut.
//
// 04-15: relationsgrunden ligger i det beständiga elevregistret (pupils,
// school_classes, daterade placeringar och klassmedlemskap) med samma ID som i
// fas 3. Gemensam referensdata (kommuner, syntetnummer) läses in efter målskyddet.
// Skriptet är idempotent: befintliga mandat återanvänds, inget raderas och inga
// konton får skyddsbehörighet. Utdata innehåller bara antal, aldrig elevvärden.
// Kör: node work/pilot/phase3-browser-fixtures.mjs --target protected

import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const args = process.argv.slice(2);
if (args.join(' ') !== '--target protected') {
  console.error('REFUSED: använd --target protected');
  process.exit(1);
}
const manifest = await assertTarget('protected');
if (!manifest.idp?.publicUrl || !manifest.idp?.issuer) {
  console.error('BLOCKED: protected-målet saknar lokal IdP');
  process.exit(3);
}
const idpUrl = new URL(manifest.idp.publicUrl);
if (!['127.0.0.1', 'localhost'].includes(idpUrl.hostname)) {
  console.error('REFUSED: IdP måste vara loopback');
  process.exit(1);
}

const CUSTOMER = '33000000-0000-4000-8000-000000000001';
const ORGANIZER = '33000000-0000-4000-8000-000000000011';
const UNIT = '33000000-0000-4000-8000-000000000111';
const OTHER_UNIT = '33000000-0000-4000-8000-000000000112';
const GROUP = '33000000-0000-4000-8000-000000000311';
const CASE = '33000000-0000-4000-8000-000000000411';
const PUPIL = '33000000-0000-4000-8000-000000000211';
export const PHASE3_USERS = [
  { key: 'huvudman', username: 'p3.huvudman', firstName: 'Hedda', lastName: 'Huvudman', totp: true },
  { key: 'rektor', username: 'p3.rektor', firstName: 'Rut', lastName: 'Rektor', totp: true },
  { key: 'larare', username: 'p3.larare', firstName: 'Lars', lastName: 'Lärare', totp: false },
  { key: 'admin', username: 'p3.admin', firstName: 'Alva', lastName: 'Skoladmin', totp: false },
  { key: 'elevhalsa', username: 'p3.elevhalsa', firstName: 'Elin', lastName: 'Elevhälsa', totp: false },
  { key: 'support', username: 'p3.support', firstName: 'Sam', lastName: 'Support', totp: false },
  { key: 'it', username: 'p3.it', firstName: 'Ivo', lastName: 'It', totp: true },
  { key: 'elevhalsa-skola', username: 'p3.elevhalsa.skola', firstName: 'Siri', lastName: 'Skolhälsa', totp: false },
  { key: 'elevhalsa-elev', username: 'p3.elevhalsa.elev', firstName: 'Ebba', lastName: 'Elevstöd', totp: false },
  { key: 'granskare', username: 'p3.granskare', firstName: 'Greta', lastName: 'Granskare', totp: false },
];

const secretsPath = path.join(manifest.workdir, 'idp', 'phase3-users.json');
let pgpass = null;
function psql(sql, vars = {}) {
  const url = new URL(manifest.dbUrl);
  if (!pgpass) {
    pgpass = path.join(os.tmpdir(), `.skolplattform-p3-pgpass-${process.pid}`);
    const escaped = decodeURIComponent(url.password).replaceAll('\\', '\\\\').replaceAll(':', '\\:');
    fs.writeFileSync(pgpass, `${url.hostname}:${url.port}:${url.pathname.slice(1)}:${decodeURIComponent(url.username)}:${escaped}\n`, { mode: 0o600, flag: 'wx' });
  }
  const argv = ['-h', url.hostname, '-p', url.port, '-U', decodeURIComponent(url.username), '-d', url.pathname.slice(1), '-Atq', '-v', 'ON_ERROR_STOP=1'];
  for (const [key, value] of Object.entries(vars)) argv.push('-v', `${key}=${value ?? ''}`);
  argv.push('-f', '-');
  return execFileSync('psql', argv, { input: sql, encoding: 'utf8', env: { ...process.env, PGPASSFILE: pgpass }, stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

async function keycloak(pathname, init = {}, token) {
  const response = await fetch(new URL(pathname, idpUrl), {
    ...init,
    headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok && response.status !== 409) throw new Error(`Keycloak ${init.method ?? 'GET'} ${pathname.split('?')[0]}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function readSecrets() {
  try { return JSON.parse(fs.readFileSync(secretsPath, 'utf8')); } catch { return {}; }
}

try {
  psql(fs.readFileSync(path.join(root, 'work/pilot/sql/phase4-reference-data.sql'), 'utf8'));
  psql(fs.readFileSync(path.join(root, 'work/pilot/sql/phase3-fixtures.sql'), 'utf8'));
  // Skyddsbehörighet ges bara av huvudmannen i registret, aldrig av fixturen.
  const protectedPermissions = () => Number(psql(`select count(*) from public.protected_identity_permissions p
    join public.access_assignments a on a.id=p.assignment_id where a.customer_id=:'customer'::uuid and p.revoked_at is null`, { customer: CUSTOMER }));
  const protectedBefore = protectedPermissions();
  const admin = await keycloak('/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: manifest.idp.adminUser, password: manifest.idp.adminPassword }),
  });
  const token = admin.access_token;
  const realm = '/admin/realms/skolplattform-test';
  const secrets = readSecrets();
  const bound = {};
  for (const user of PHASE3_USERS) {
    const email = `${user.key}@phase3.example.test`;
    secrets[user.username] ??= crypto.randomBytes(18).toString('base64url');
    let found = await keycloak(`${realm}/users?username=${encodeURIComponent(user.username)}&exact=true`, {}, token);
    if (!found?.length) {
      await keycloak(`${realm}/users`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: user.username, email, firstName: user.firstName, lastName: user.lastName, enabled: true, emailVerified: true, requiredActions: user.totp ? ['CONFIGURE_TOTP'] : [] }),
      }, token);
      found = await keycloak(`${realm}/users?username=${encodeURIComponent(user.username)}&exact=true`, {}, token);
    }
    const subject = found[0].id;
    await keycloak(`${realm}/users/${subject}/reset-password`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'password', value: secrets[user.username], temporary: false }),
    }, token);
    const displayName = `${user.firstName} ${user.lastName}`;
    const identity = psql(`insert into public.identities(issuer,subject,display_name,email) values(:'issuer',:'subject',:'name',:'email')
      on conflict (issuer,subject) do update set display_name=excluded.display_name returning id::text`, { issuer: manifest.idp.issuer, subject, name: displayName, email });
    let membership = psql("select id::text from public.memberships where identity_id=:'identity'::uuid and customer_id=:'customer'::uuid", { identity, customer: CUSTOMER });
    if (!membership) membership = psql("insert into public.memberships(identity_id,customer_id) values(:'identity'::uuid,:'customer'::uuid) returning id::text", { identity, customer: CUSTOMER });
    psql("update public.memberships set status='active', blocked_at=null, blocked_by=null, block_reason=null where id=:'id'::uuid", { id: membership });
    bound[user.key] = { ...user, subject, identity, membership, email };
  }
  fs.mkdirSync(path.dirname(secretsPath), { recursive: true });
  fs.writeFileSync(secretsPath, `${JSON.stringify(secrets, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(secretsPath, 0o600);

  // Mottagare utan IdP-konto för formulärprovet.
  const recipientIdentity = psql(`insert into public.identities(issuer,subject,display_name) values('https://phase3.example.test','browser-recipient','Pia Provmottagare')
    on conflict (issuer,subject) do update set display_name=excluded.display_name returning id::text`);
  if (!psql("select id::text from public.memberships where identity_id=:'identity'::uuid and customer_id=:'customer'::uuid", { identity: recipientIdentity, customer: CUSTOMER })) {
    psql("insert into public.memberships(identity_id,customer_id) values(:'identity'::uuid,:'customer'::uuid)", { identity: recipientIdentity, customer: CUSTOMER });
  }

  const current = (membership, fn) => psql(`select a.id::text from public.access_assignments a where a.membership_id=:'membership'::uuid
    and a.function=:'fn'::public.access_function and a.profile_id='synthetic-v1' and public.phase3_mandate_is_valid(a.id) order by a.created_at desc nulls last limit 1`, { membership, fn });
  const topLevel = (key, fn, units) => {
    const existing = current(bound[key].membership, fn);
    if (existing) return existing;
    const id = crypto.randomUUID();
    psql(`insert into public.access_assignments(id,membership_id,customer_id,organizer_id,function,profile_id,scope_kind) values(:'id'::uuid,:'membership'::uuid,:'customer'::uuid,:'organizer'::uuid,:'fn'::public.access_function,'synthetic-v1','school');
      insert into public.mandate_units select :'id'::uuid,:'customer'::uuid,:'organizer'::uuid,unnest(string_to_array(:'units',',')::uuid[]);`, { id, membership: bound[key].membership, customer: CUSTOMER, organizer: ORGANIZER, fn, units: units.join(',') });
    return id;
  };
  const delegated = (parent, key, payload) => {
    const existing = current(bound[key].membership, payload.function);
    if (existing) return existing;
    return psql("select public.phase3_insert_mandate(:'parent'::uuid, :'payload'::jsonb)::text", { parent, payload: JSON.stringify({ ...payload, membershipId: bound[key].membership, validFrom: psql('select public.app_today()::text') }) });
  };
  const assignments = {};
  assignments.huvudman = topLevel('huvudman', 'huvudman', [UNIT, OTHER_UNIT]);
  assignments.it = topLevel('it', 'it', [UNIT]);
  assignments.rektor = delegated(assignments.huvudman, 'rektor', { function: 'rektor', scopeKind: 'school', unitIds: [UNIT] });
  assignments.larare = delegated(assignments.rektor, 'larare', { function: 'larare', scopeKind: 'group', unitIds: [UNIT], groups: [{ id: GROUP, kind: 'teaching' }] });
  assignments.admin = delegated(assignments.rektor, 'admin', { function: 'administrator', scopeKind: 'school', unitIds: [UNIT] });
  assignments.elevhalsa = delegated(assignments.rektor, 'elevhalsa', { function: 'elevhalsa', scopeKind: 'case', unitIds: [UNIT], caseIds: [CASE] });
  assignments['elevhalsa-skola'] = delegated(assignments.rektor, 'elevhalsa-skola', { function: 'elevhalsa', scopeKind: 'school', unitIds: [UNIT] });
  assignments['elevhalsa-elev'] = delegated(assignments.rektor, 'elevhalsa-elev', { function: 'elevhalsa', scopeKind: 'pupil', unitIds: [UNIT], pupilIds: [PUPIL] });
  // Granskaren har kundomfattande loggläsning och saknar publik tilldelningsväg (som i verify-mandates).
  // Samma form som i verify-mandates: kunduppdrag utan skolprofil.
  assignments.granskare = psql(`select a.id::text from public.access_assignments a where a.membership_id=:'membership'::uuid
    and a.function='granskare' and a.ended_at is null and (a.valid_to is null or a.valid_to>=public.app_today()) order by a.created_at desc nulls last limit 1`, { membership: bound.granskare.membership }) || (() => {
    const id = crypto.randomUUID();
    psql("insert into public.access_assignments(id,membership_id,customer_id,function) values(:'id'::uuid,:'membership'::uuid,:'customer'::uuid,'granskare')", { id, membership: bound.granskare.membership, customer: CUSTOMER });
    return id;
  })();
  for (const [key, id] of Object.entries(assignments)) {
    if (key === 'granskare') continue;
    if (psql("select public.phase3_mandate_is_valid(:'id'::uuid)::text", { id }) !== 'true') throw new Error(`mandatet för ${key} är inte giltigt`);
  }

  // Registerrelationerna ska vara oförändrade mellan körningar (endast antal, inga värden).
  const count = (sql, vars = {}) => Number(psql(sql, { customer: CUSTOMER, ...vars }));
  const relations = {
    pupils: count("select count(*) from public.pupils where customer_id=:'customer'::uuid and id::text like '33000000-%'"),
    placements: count("select count(*) from public.pupil_placements where customer_id=:'customer'::uuid and pupil_id::text like '33000000-%'"),
    classes: count("select count(*) from public.school_classes where customer_id=:'customer'::uuid and id::text like '33000000-%'"),
    classMemberships: count("select count(*) from public.pupil_class_memberships where customer_id=:'customer'::uuid and pupil_id::text like '33000000-%'"),
    cases: count("select count(*) from public.phase3_probe_cases where customer_id=:'customer'::uuid and id::text like '33000000-%'"),
    assignments: count(`select count(*) from public.access_assignments a join public.memberships m on m.id=a.membership_id
      where a.customer_id=:'customer'::uuid and m.id=any(string_to_array(:'members',',')::uuid[]) and a.ended_at is null`, { members: Object.values(bound).map((user) => user.membership).join(',') }),
  };
  // Mandatens objekt ska vara registerobjekt: lärarens klass och elevhälsans elev.
  const registerBound = count(`select (select count(*) from public.mandate_groups g join public.school_classes c on c.id=g.group_id and c.unit_id=g.unit_id
      where g.assignment_id=:'teacher'::uuid and g.group_id=:'group'::uuid)
    + (select count(*) from public.mandate_pupils p join public.pupils r on r.id=p.pupil_id and r.customer_id=p.customer_id
      where p.assignment_id=:'pupilScope'::uuid and p.pupil_id=:'pupil'::uuid)
    + (select count(*) from public.pupil_placements pp where pp.pupil_id=:'pupil'::uuid and pp.unit_id=:'unit'::uuid
      and pp.starts_on<=public.app_today() and (pp.ends_on is null or pp.ends_on>=public.app_today()))`,
    { teacher: assignments.larare, group: GROUP, pupilScope: assignments['elevhalsa-elev'], pupil: PUPIL, unit: UNIT });
  if (registerBound !== 3) throw new Error('fixturens mandat är inte bundna till aktuella registerobjekt');
  const protectedAfter = protectedPermissions();
  if (protectedAfter > protectedBefore) throw new Error('fixturen gav skyddsbehörighet');

  // Playwright-hjälparen läser TOTP-kravet ur manifestets användarlista.
  const manifestPath = path.join(manifest.workdir, 'manifest.json');
  const stored = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  stored.idp.users = [
    ...stored.idp.users.filter((user) => !PHASE3_USERS.some((candidate) => candidate.username === user.username)),
    ...Object.values(bound).map((user) => ({ username: user.username, subject: user.subject, email: user.email, totp: user.totp })),
  ];
  fs.writeFileSync(manifestPath, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ status: 'OK', target: 'protected', customer: CUSTOMER, users: PHASE3_USERS.map((user) => user.username), assignments: Object.keys(assignments), relations, protectedPermissions: protectedAfter }));
} finally {
  if (pgpass) fs.rmSync(pgpass, { force: true });
}
