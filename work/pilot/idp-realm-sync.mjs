#!/usr/bin/env node
// Uppdaterar den körande lokala test-IdP:ns inloggningsflöde på plats från
// work/pilot/idp/realm-template.json (källan). Etableringen (prepare-local
// --with-idp) importerar mallen bara när IdP:n skapas; ändringar i flödet efter
// det förs över med detta skript utan att realmen, användarna eller deras
// registrerade engångskoder rörs.
//
// Vad som synkas: webbläsarflödet (browserFlow) med alla underflöden,
// villkor, krav och authenticatorConfig, samt realmens acr.loa.map och
// OTP-policy. Klienter, användare och inloggningsuppgifter lämnas orörda.
//
// Om flödet avviker från mallen byggs det om: realmen pekas tillfälligt på det
// inbyggda "browser"-flödet, mallens flöden tas bort och skapas igen, och
// realmen pekas tillbaka. Efteråt jämförs det körande flödet med mallen igen.
// Inga hemligheter, koder eller tokens skrivs ut.
//
// Kör: node work/pilot/idp-realm-sync.mjs --target protected [--check]
//   --check  jämför endast (exit 2 om flödet avviker), ändrar inget.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const REALM = 'skolplattform-test';
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const templatePath = path.join(root, 'work', 'pilot', 'idp', 'realm-template.json');

const args = process.argv.slice(2);
const checkOnly = args.includes('--check');
if (args.filter((arg) => arg !== '--check').join(' ') !== '--target protected') {
  console.error('REFUSED: använd --target protected [--check]');
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

const template = JSON.parse(fs.readFileSync(templatePath, 'utf8'));
if (template.realm !== REALM) {
  console.error('REFUSED: mallen gäller en annan realm');
  process.exit(1);
}
const flowsByAlias = new Map(template.authenticationFlows.map((flow) => [flow.alias, flow]));
const configsByAlias = new Map((template.authenticatorConfig ?? []).map((config) => [config.alias, config.config]));
const topLevel = template.authenticationFlows.filter((flow) => flow.topLevel);
if (!flowsByAlias.has(template.browserFlow)) {
  console.error('REFUSED: mallens browserFlow saknas bland flödena');
  process.exit(1);
}

let token;
async function keycloak(pathname, init = {}) {
  const response = await fetch(new URL(pathname, idpUrl), {
    ...init,
    headers: {
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!response.ok) {
    const where = pathname.split('?')[0].replace(/[0-9a-f-]{36}/gu, ':id');
    throw new Error(`Keycloak ${init.method ?? 'GET'} ${where}: HTTP ${response.status}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

/** Mallens flöde som jämförbar struktur. */
function expectedFlow(alias) {
  const flow = flowsByAlias.get(alias);
  if (!flow) throw new Error(`mallen saknar underflödet ${alias}`);
  return [...flow.authenticationExecutions]
    .sort((a, b) => a.priority - b.priority)
    .map((execution) => execution.authenticatorFlow
      ? { flow: execution.flowAlias, requirement: execution.requirement, executions: expectedFlow(execution.flowAlias) }
      : {
          authenticator: execution.authenticator,
          requirement: execution.requirement,
          config: execution.authenticatorConfig
            ? { alias: execution.authenticatorConfig, config: configsByAlias.get(execution.authenticatorConfig) ?? null }
            : null,
        });
}

/** Det körande flödet som samma struktur (Keycloak returnerar en platt lista med nivåer). */
async function liveFlow(alias) {
  const flat = await keycloak(`/admin/realms/${REALM}/authentication/flows/${encodeURIComponent(alias)}/executions`);
  const direct = flat.filter((execution) => execution.level === 0).sort((a, b) => a.index - b.index);
  const result = [];
  for (const execution of direct) {
    if (execution.authenticationFlow) {
      result.push({ flow: execution.displayName, requirement: execution.requirement, executions: await liveFlow(execution.displayName) });
    } else {
      let config = null;
      if (execution.authenticationConfig) {
        const stored = await keycloak(`/admin/realms/${REALM}/authentication/config/${execution.authenticationConfig}`);
        config = { alias: stored.alias, config: stored.config ?? {} };
      }
      result.push({ authenticator: execution.providerId, requirement: execution.requirement, config });
    }
  }
  return result;
}

// Keycloak döljer vissa konfigurationsvärden (t.ex. amr-referenserna) i admin-API:t.
// Sådana värden kan inte jämföras här; de räknas upp i resultatet och prövas i
// stället av en verklig inloggning (amr i ID-token).
const MASK = '**********';
const masked = new Set();
function unmask(live, expected) {
  if (Array.isArray(live) && Array.isArray(expected)) return live.map((item, index) => unmask(item, expected[index]));
  if (live && expected && typeof live === 'object' && typeof expected === 'object') {
    const out = {};
    for (const [key, value] of Object.entries(live)) {
      if (value === MASK && typeof expected[key] === 'string') {
        masked.add(key);
        out[key] = expected[key];
      } else out[key] = unmask(value, expected[key]);
    }
    return out;
  }
  return live;
}

function sameStructure(a, b) {
  const normalize = (value) => JSON.stringify(value, (key, inner) => (
    inner && typeof inner === 'object' && !Array.isArray(inner)
      ? Object.fromEntries(Object.entries(inner).sort(([x], [y]) => x.localeCompare(y)))
      : inner));
  return normalize(a) === normalize(b);
}

async function directExecutions(alias) {
  const flat = await keycloak(`/admin/realms/${REALM}/authentication/flows/${encodeURIComponent(alias)}/executions`);
  return flat.filter((execution) => execution.level === 0).sort((a, b) => a.index - b.index);
}

async function build(alias) {
  const flow = flowsByAlias.get(alias);
  for (const execution of [...flow.authenticationExecutions].sort((a, b) => a.priority - b.priority)) {
    const before = (await directExecutions(alias)).length;
    if (execution.authenticatorFlow) {
      const child = flowsByAlias.get(execution.flowAlias);
      await keycloak(`/admin/realms/${REALM}/authentication/flows/${encodeURIComponent(alias)}/executions/flow`, {
        method: 'POST',
        body: JSON.stringify({ alias: child.alias, description: child.description ?? '', provider: 'registration-page-form', type: child.providerId }),
      });
    } else {
      await keycloak(`/admin/realms/${REALM}/authentication/flows/${encodeURIComponent(alias)}/executions/execution`, {
        method: 'POST',
        body: JSON.stringify({ provider: execution.authenticator }),
      });
    }
    const after = await directExecutions(alias);
    if (after.length !== before + 1) throw new Error(`oväntat antal steg i ${alias}`);
    const created = after[after.length - 1];
    if (created.requirement !== execution.requirement) {
      await keycloak(`/admin/realms/${REALM}/authentication/flows/${encodeURIComponent(alias)}/executions`, {
        method: 'PUT',
        body: JSON.stringify({ ...created, requirement: execution.requirement }),
      });
    }
    if (execution.authenticatorConfig) {
      const config = configsByAlias.get(execution.authenticatorConfig);
      if (!config) throw new Error(`mallen saknar authenticatorConfig ${execution.authenticatorConfig}`);
      await keycloak(`/admin/realms/${REALM}/authentication/executions/${created.id}/config`, {
        method: 'POST',
        body: JSON.stringify({ alias: execution.authenticatorConfig, config }),
      });
    }
    if (execution.authenticatorFlow) await build(execution.flowAlias);
  }
}

const REALM_FIELDS = ['otpPolicyType', 'otpPolicyAlgorithm', 'otpPolicyDigits', 'otpPolicyPeriod', 'otpPolicyLookAheadWindow', 'otpPolicyInitialCounter'];

try {
  const admin = await keycloak('/realms/master/protocol/openid-connect/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: manifest.idp.adminUser, password: manifest.idp.adminPassword }),
  });
  token = admin.access_token;

  const realm = await keycloak(`/admin/realms/${REALM}`);
  const realmDiff = REALM_FIELDS.filter((field) => realm[field] !== template[field]);
  const loaMap = template.attributes?.['acr.loa.map'];
  if ((realm.attributes?.['acr.loa.map'] ?? null) !== (loaMap ?? null)) realmDiff.push('acr.loa.map');
  if (realm.browserFlow !== template.browserFlow) realmDiff.push('browserFlow');

  const existing = new Set((await keycloak(`/admin/realms/${REALM}/authentication/flows`)).map((flow) => flow.alias));
  const expected = expectedFlow(template.browserFlow);
  const flowsMatch = topLevel.every((flow) => existing.has(flow.alias))
    && sameStructure(unmask(await liveFlow(template.browserFlow), expected), expected);

  if (checkOnly || (flowsMatch && realmDiff.length === 0)) {
    const status = flowsMatch && realmDiff.length === 0 ? 'UNCHANGED' : 'DIFFERS';
    console.log(JSON.stringify({ status, realm: REALM, browserFlow: template.browserFlow, flowsMatch, realmDiff, maskedConfigKeys: [...masked].sort() }));
    process.exit(status === 'DIFFERS' ? 2 : 0);
  }

  if (!flowsMatch) {
    // Tillfälligt inbyggt flöde medan mallens flöden byggs om.
    await keycloak(`/admin/realms/${REALM}`, { method: 'PUT', body: JSON.stringify({ browserFlow: 'browser' }) });
    const flows = await keycloak(`/admin/realms/${REALM}/authentication/flows`);
    for (const flow of flows.filter((candidate) => topLevel.some((wanted) => wanted.alias === candidate.alias))) {
      if (flow.builtIn) throw new Error(`vägrar ta bort inbyggt flöde ${flow.alias}`);
      await keycloak(`/admin/realms/${REALM}/authentication/flows/${flow.id}`, { method: 'DELETE' });
    }
    for (const flow of topLevel) {
      await keycloak(`/admin/realms/${REALM}/authentication/flows`, {
        method: 'POST',
        body: JSON.stringify({ alias: flow.alias, description: flow.description ?? '', providerId: flow.providerId, topLevel: true, builtIn: false }),
      });
      await build(flow.alias);
    }
  }

  const update = { browserFlow: template.browserFlow };
  for (const field of REALM_FIELDS) update[field] = template[field];
  if (loaMap !== undefined) update.attributes = { ...(realm.attributes ?? {}), 'acr.loa.map': loaMap };
  await keycloak(`/admin/realms/${REALM}`, { method: 'PUT', body: JSON.stringify(update) });

  const verified = sameStructure(unmask(await liveFlow(template.browserFlow), expected), expected);
  const after = await keycloak(`/admin/realms/${REALM}`);
  if (!verified || after.browserFlow !== template.browserFlow) throw new Error('det körande flödet matchar inte mallen efter uppdateringen');
  console.log(JSON.stringify({ status: 'UPDATED', realm: REALM, browserFlow: template.browserFlow, rebuiltFlows: !flowsMatch, realmFields: realmDiff, maskedConfigKeys: [...masked].sort() }));
} catch (error) {
  console.error(`FAIL: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
