#!/usr/bin/env node
// Återställer TOTP-registreringen för fas 2:s syntetiska browserkonton i den
// lokala test-IdP:n så att browserprovet själv registrerar en ny engångskods-
// hemlighet (Keycloaks CONFIGURE_TOTP) och sparar den i den gitignorerade
// målkatalogen.
//
// Varför: browserhjälparen (web/e2e/helpers/keycloak.ts) läser hemligheten ur
// targets/protected/idp/totp-users.json. När IdP:n återskapas, eller när någon
// registrerar ett konto manuellt, stämmer den sparade hemligheten inte längre
// med kontots TOTP-uppgift i Keycloak och step-up fastnar på "Autentiseringskoden
// är ogiltig". Den här fixturen gör provets utgångsläge känt. MFA-kravet
// försvagas inte: kontot måste fortfarande registrera och ange en giltig kod,
// och realmens OTP-policy och step-up-flöde ändras inte.
//
// Gäller endast fasta syntetiska fas 2-konton (inte fas 3:s konton och aldrig
// verkliga personer) i realm skolplattform-test på loopback-IdP:n. Inga
// hemligheter, koder eller tokens skrivs ut.
//
// Kör: node work/pilot/phase2-otp-fixtures.mjs --target protected

import fs from 'node:fs';
import path from 'node:path';
import { assertTarget } from './verify-target.mjs';

export const PHASE2_TOTP_USERS = ['anna.admin', 'bertil.granskare', 'david.admin-b', 'erik.utan', 'hanna.tva'];
const REALM = 'skolplattform-test';

const args = process.argv.slice(2);
if (args.join(' ') !== '--target protected') {
  console.error('REFUSED: använd --target protected');
  process.exit(1);
}

let manifest;
try {
  manifest = await assertTarget('protected', { requireIdp: true });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(String(error?.message ?? '').startsWith('BLOCKED') ? 3 : 1);
}
const idpUrl = new URL(manifest.idp?.publicUrl ?? 'http://invalid');
if (!['127.0.0.1', 'localhost'].includes(idpUrl.hostname) || !String(manifest.idp?.issuer ?? '').endsWith(`/realms/${REALM}`)) {
  console.error('REFUSED: IdP:n måste vara den lokala testrealmen på loopback');
  process.exit(1);
}

async function keycloak(pathname, init = {}, token) {
  const response = await fetch(new URL(pathname, idpUrl), {
    ...init,
    headers: { ...init.headers, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!response.ok) throw new Error(`Keycloak ${init.method ?? 'GET'} ${pathname.split('?')[0].replace(/[0-9a-f-]{36}/gu, ':id')}: HTTP ${response.status}`);
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

function dropEntries(file, usernames) {
  let stored = {};
  try { stored = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return 0; }
  let removed = 0;
  for (const username of usernames) if (username in stored) { delete stored[username]; removed += 1; }
  fs.writeFileSync(file, `${JSON.stringify(stored, null, 2)}\n`, { mode: 0o600 });
  fs.chmodSync(file, 0o600);
  return removed;
}

try {
  const admin = await keycloak('/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: manifest.idp.adminUser, password: manifest.idp.adminPassword }),
  });
  const token = admin.access_token;
  const realm = `/admin/realms/${REALM}`;
  const summary = [];
  for (const username of PHASE2_TOTP_USERS) {
    const found = await keycloak(`${realm}/users?username=${encodeURIComponent(username)}&exact=true`, {}, token);
    if (!found?.length) throw new Error(`testkontot ${username} saknas i test-IdP:n`);
    const user = found[0];
    const credentials = await keycloak(`${realm}/users/${user.id}/credentials`, {}, token);
    const otp = (credentials ?? []).filter((credential) => credential.type === 'otp');
    for (const credential of otp) {
      await keycloak(`${realm}/users/${user.id}/credentials/${credential.id}`, { method: 'DELETE' }, token);
    }
    const requiredActions = [...new Set([...(user.requiredActions ?? []), 'CONFIGURE_TOTP'])];
    await keycloak(`${realm}/users/${user.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ requiredActions }),
    }, token);
    // Avsluta kvarvarande IdP-sessioner så att nästa inloggning går genom registreringen.
    await keycloak(`${realm}/users/${user.id}/logout`, { method: 'POST' }, token);
    summary.push({ username, removedOtpCredentials: otp.length });
  }
  const idpDir = path.join(manifest.workdir, 'idp');
  const removedSecrets = dropEntries(path.join(idpDir, 'totp-users.json'), PHASE2_TOTP_USERS);
  const removedCodes = dropEntries(path.join(idpDir, 'totp-last-used.json'), PHASE2_TOTP_USERS);
  console.log(JSON.stringify({ status: 'OK', target: 'protected', users: summary, removedStoredSecrets: removedSecrets, removedLastCodes: removedCodes }));
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
