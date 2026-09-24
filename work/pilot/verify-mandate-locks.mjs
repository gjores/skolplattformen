#!/usr/bin/env node
// Två riktiga anslutningar: skyddad kontroll väntar på avslut och läser ny status.
// Endast nya slump-UUID-fixturer i assertTarget-verifierat lokalt mål.
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import { assertTarget } from './verify-target.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const postgres = require('postgres');
if (process.argv.length > 2) throw new Error('REFUSED: inga flaggor tillåtna');
const target = await assertTarget('protected');
const db = postgres(target.dbUrl, { max: 3, prepare: false, onnotice: () => {} });
const ids = Object.fromEntries(['customer', 'identity1', 'identity2', 'member1', 'member2', 'root'].map(k => [k, randomUUID()]));
let a, b, child;
let waiting = false, denied = false, completed = false;
const context = async (sql, assignment, member, identity) => {
  await sql`select set_config('app.customer_id',${ids.customer},true),
    set_config('app.assignment_id',${assignment},true),set_config('app.membership_id',${member},true),
    set_config('app.identity_id',${identity},true)`;
};
try {
  await db.begin(async tx => {
    await tx`insert into public.customers(id,name) values(${ids.customer},'Syntetiskt låsprov')`;
    await tx`insert into public.identities(id,issuer,subject) values
      (${ids.identity1},'https://lock.example.test',${ids.identity1}),(${ids.identity2},'https://lock.example.test',${ids.identity2})`;
    await tx`insert into public.memberships(id,identity_id,customer_id) values
      (${ids.member1},${ids.identity1},${ids.customer}),(${ids.member2},${ids.identity2},${ids.customer})`;
    await tx`insert into public.access_assignments(id,membership_id,customer_id,function)
      values(${ids.root},${ids.member1},${ids.customer},'kundadmin')`;
    await context(tx, ids.root, ids.member1, ids.identity1);
    const rows = await tx`select public.phase3_grant_mandate(${tx.json({membershipId:ids.member2,function:'kundadmin',scopeKind:'school',unitIds:[]})}) as id`;
    child = rows[0].id;
  });
  a = await db.reserve(); b = await db.reserve();
  await a`begin`; await b`begin`;
  await a`set local role skolplattform_worker`; await b`set local role skolplattform_worker`;
  await a`set local statement_timeout='10s'`; await b`set local statement_timeout='10s'`;
  await context(a, ids.root, ids.member1, ids.identity1);
  await context(b, child, ids.member2, ids.identity2);
  const [{pid}] = await b`select pg_backend_pid() as pid`;
  await a`select public.phase3_revoke_mandate(${child})`;
  // Convert error immediately to result so the pending Promise cannot reject unhandled.
  const pending = b`select public.phase3_mandate_context()`.then(() => 'allowed', error => error.code);
  for (let attempt=0; attempt<100; attempt++) {
    const [row] = await db`select exists(select 1 from pg_locks where pid=${pid} and locktype='advisory' and not granted) as waiting`;
    if (row.waiting) { waiting=true; break; }
    await new Promise(resolve=>setTimeout(resolve,20));
  }
  if (!waiting) throw new Error('Skyddad kontroll väntade inte på avslutets kundlås');
  await a`commit`;
  denied = (await pending) === '42501';
  if (!denied) throw new Error('Väntande anrop nekades inte efter avslutets commit');
  await b`rollback`;
  completed = true;
} finally {
  for (const connection of [a,b]) {
    if (connection) { await connection`rollback`.catch(()=>{}); connection.release(); }
  }
  // Radera enbart fixtur-ID:n som detta körningstillfälle skapade.
  await db.begin(async tx => {
    if (child) await tx`delete from public.access_assignments where id=${child}`;
    await tx`delete from public.access_assignments where id=${ids.root}`;
    await tx`delete from public.memberships where id in (${ids.member1},${ids.member2})`;
    await tx`delete from public.identities where id in (${ids.identity1},${ids.identity2})`;
    await tx`delete from public.customers where id=${ids.customer}`;
  });
  await db.end();
  const result={target:'protected',status:completed?'PASS':'FAIL',waitingObserved:waiting,revokedContextDenied:denied};
  fs.writeFileSync(new URL('./results/phase3-mandate-locks.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}
