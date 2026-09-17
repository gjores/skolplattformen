#!/usr/bin/env node
// Leverantörens lokala rutin för personbundna engångsinbjudningar.
// Den ansluter bara till det målskyddade protected-målet och lagrar enbart tokenhashen.

import { spawnSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  newInvitationToken,
  parseGrants,
  tokenHashHex,
  ttlToExpiry,
} from '../../web/lib/invitation-rules.ts';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const options = {
  target: null,
  person: null,
  issuer: null,
  subject: null,
  verificationReference: null,
  email: '',
  grants: null,
  ttl: '72h',
  customer: null,
  customerName: null,
  printOnlyToken: false,
};

function refuse(message) {
  console.error(`REFUSED: ${message}`);
  process.exit(1);
}

const argv = process.argv.slice(2);
for (let index = 0; index < argv.length; index++) {
  const arg = argv[index];
  const value = () => {
    const next = argv[++index];
    if (!next || next.startsWith('--')) refuse(`${arg} kräver ett värde`);
    return next;
  };
  if (arg === '--target') options.target = value();
  else if (arg === '--person') options.person = value();
  else if (arg === '--issuer') options.issuer = value();
  else if (arg === '--subject') options.subject = value();
  else if (arg === '--verification-reference') options.verificationReference = value();
  else if (arg === '--email') options.email = value();
  else if (arg === '--grants') options.grants = value();
  else if (arg === '--ttl') options.ttl = value();
  else if (arg === '--customer') options.customer = value();
  else if (arg === '--customer-name') options.customerName = value();
  else if (arg === '--print-only-token') options.printOnlyToken = true;
  else refuse(`okänt argument ${arg}`);
}

if (options.target !== 'protected') refuse('endast --target protected är tillåtet');
if (!options.subject) refuse('--subject krävs och ska vara verifierat utanför appen');
if (!options.verificationReference) refuse('--verification-reference krävs');
if (!options.person || !options.issuer || !options.grants) {
  refuse('--person, --issuer och --grants krävs');
}
if ((options.customer ? 1 : 0) + (options.customerName ? 1 : 0) !== 1) {
  refuse('ange exakt en av --customer eller --customer-name');
}
if (options.customer && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(options.customer)) {
  refuse('--customer måste vara ett UUID');
}
try {
  new URL(options.issuer);
} catch {
  refuse('--issuer måste vara en giltig URL');
}

let grants;
let expiresAt;
try {
  grants = parseGrants(options.grants);
  if (options.customerName && (grants.length !== 1 || grants[0].function !== 'kundadmin')) {
    refuse('kundens första företrädare måste få exakt kundadmin');
  }
  expiresAt = ttlToExpiry(options.ttl, new Date());
} catch (error) {
  refuse(error instanceof Error ? error.message : String(error));
}

let manifest;
try {
  manifest = await assertTarget('protected');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exit(message.startsWith('BLOCKED:') ? 3 : 1);
}

const token = newInvitationToken(crypto.randomBytes(32));
const hash = await tokenHashHex(token);
const parsed = new URL(manifest.dbUrl);
const password = decodeURIComponent(parsed.password);
const passPath = path.join(path.dirname(manifest.workdir), `.invite-pgpass-${process.pid}`);
const grantsJson = JSON.stringify(grants);
const customerSql = options.customer
  ? "select :'customer'::uuid as customer_id \\gset"
  : "insert into public.customers (name) values (:'customer_name') returning id as customer_id \\gset";
const sql = `
begin;
select set_config('app.correlation_id', gen_random_uuid()::text, true);
${customerSql}
insert into public.invitations
  (customer_id, token_hash, invited_person_name, expected_issuer, expected_subject,
   expected_email, grants, issued_by, expires_at)
values
  (:'customer_id', decode(:'hash', 'hex'), :'person', :'issuer', :'subject',
   nullif(:'email', ''), :'grants'::jsonb, 'leverantor:cli', :'expires'::timestamptz)
returning id as invitation_id, customer_id as issued_customer_id \\gset
insert into public.security_events
  (correlation_id, source, action, object_type, object_id, customer_id, outcome, details)
values
  (current_setting('app.correlation_id')::uuid, 'cli', 'invitation_issued', 'invitation',
   :'invitation_id', :'issued_customer_id', 'ok',
   jsonb_build_object(
     'grants', :'grants'::jsonb,
     'expected_issuer', :'issuer',
     'verification_reference', :'verification_reference',
     'issued_by_os_user', :'osuser'));
commit;
select :'issued_customer_id' || '|' || :'invitation_id';
`;

const passLine = `${parsed.hostname}:${parsed.port}:${parsed.pathname.slice(1)}:${decodeURIComponent(parsed.username)}:${password.replaceAll('\\', '\\\\').replaceAll(':', '\\:')}\n`;
const passFile = fs.openSync(passPath, 'wx', 0o600);
fs.writeSync(passFile, passLine);
fs.closeSync(passFile);
let proc;
try {
  const variables = {
    person: options.person,
    issuer: options.issuer,
    subject: options.subject,
    verification_reference: options.verificationReference,
    email: options.email,
    grants: grantsJson,
    expires: expiresAt.toISOString(),
    customer: options.customer ?? '',
    customer_name: options.customerName ?? '',
    hash,
    osuser: os.userInfo().username,
  };
  const args = [
    '-h', parsed.hostname,
    '-p', parsed.port,
    '-U', decodeURIComponent(parsed.username),
    '-d', parsed.pathname.slice(1),
    '-v', 'ON_ERROR_STOP=1',
    '-qAt',
  ];
  for (const [key, value] of Object.entries(variables)) args.push('-v', `${key}=${value}`);
  args.push('-f', '-');
  proc = spawnSync('psql', args, {
    cwd: root,
    env: { ...process.env, PGPASSFILE: passPath },
    input: sql,
    encoding: 'utf8',
    stdio: ['pipe', 'pipe', 'pipe'],
  });
} finally {
  fs.rmSync(passPath, { force: true });
}
if (proc.error) {
  console.error(`BLOCKED: psql kunde inte startas: ${proc.error.message}`);
  process.exit(3);
}
if (proc.status !== 0) {
  console.error(`REFUSED: inbjudan kunde inte utfärdas: ${(proc.stderr ?? '').trim()}`);
  process.exit(1);
}
const result = (proc.stdout ?? '').trim().split('\n').at(-1)?.split('|');
if (!result || result.length !== 2) refuse('databasen gav inget inbjudningsresultat');
const [customerId] = result;
if (options.printOnlyToken) {
  console.log(token);
} else {
  console.log(`Inbjudan utfärdad för "${options.person}" (kund ${customerId}, gäller till ${expiresAt.toISOString()}).`);
  console.log(`Engångslänk: http://localhost:3000/inbjudan#${token}`);
}
