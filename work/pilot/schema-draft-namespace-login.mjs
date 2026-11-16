// Endast nya inloggningar med den helt egna syntetiska testkundens uppgifter. Inga browsercredentials läses.
import assert from 'node:assert/strict';
import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { login } from './verify-schema-draft-actual.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url)), require = createRequire(path.join(root, 'web/package.json'));
const postgres = require('postgres');
export async function loginSchemaNamespace({ manifestFile, browser, role = 'principalA' }) {
  assert.match(manifestFile, /^\/private\/tmp\/schema-draft-final-namespace-[a-z0-9-]+-evidence\/ui-manifest\.json$/u);
  const directory = path.dirname(manifestFile), manifest = JSON.parse(readFileSync(manifestFile, 'utf8'));
  const namespaceFile = path.join(directory, 'namespace-private.json'), namespace = JSON.parse(readFileSync(namespaceFile, 'utf8'));
  assert.equal(namespace.kind, 'schema-actual-owned-namespace'); assert.equal(namespace.status, 'ready'); assert.equal(namespace.cleanup, 'pending');
  assert.equal(manifest.syntheticOnly, true); assert.equal(manifest.directory, directory); assert.equal(manifest.baseURL, namespace.baseURL); assert.equal(manifest.idpURL, namespace.idpURL);
  assert.ok(['principalA', 'admin', 'principalB', 'hm', 'teacherGroup', 'principalAB'].includes(role));
  const user = namespace.users[role]; assert.equal(user.username, `schema-${namespace.runId}-${role.toLowerCase()}`);
  assert.match(namespace.parentRuntime, /^\/private\/tmp\/schema-draft-actual-[a-z0-9-]+-evidence\/runtime-private\.json$/u);
  const parent = JSON.parse(readFileSync(namespace.parentRuntime, 'utf8'));
  assert.equal(parent.kind, 'schema-actual-owned-runtime'); assert.ok(['ready', 'core-ready'].includes(parent.status)); assert.equal(parent.cleanup, 'pending');
  assert.equal(parent.database, 'named_timplan_' + parent.runId.replaceAll('-', '')); assert.ok(parent.pg.startsWith(path.dirname(namespace.parentRuntime) + '/postgres-'));
  assert.equal(parent.idpURL, manifest.idpURL); assert.equal(new URL(manifest.baseURL).hostname, '127.0.0.1'); assert.equal(new URL(manifest.idpURL).hostname, '127.0.0.1');
  const db = postgres({ path: path.join(parent.pg, `.s.PGSQL.${parent.ports.postgres}`), database: parent.database, username: 'postgres', max: 1, prepare: false, onnotice: () => {} });
  try {
    const result = await login({ db, baseURL: manifest.baseURL, idpURL: manifest.idpURL }, browser, user, role, directory);
    // Sekventiella egna browserprov får inte återanvända samma redan förbrukade engångskod.
    const current = JSON.parse(readFileSync(namespaceFile, 'utf8')); assert.equal(current.runId, namespace.runId);
    assert.equal(current.users[role].identityId, user.identityId);
    if (user.lastCode) current.users[role].lastCode = user.lastCode;
    writeFileSync(namespaceFile, JSON.stringify(current, null, 2), { mode: 0o600 });
    chmodSync(path.join(directory, 'auth-' + role + '.json'), 0o600);
    return result; // BrowserContext/Page samt ofarligt verifieringskvitto; aldrig lösenord eller TOTP-hemlighet.
  } finally { await db.end({ timeout: 5 }); }
}
