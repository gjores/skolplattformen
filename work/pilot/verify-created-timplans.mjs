// Scoped local migration check. No fixtures, domain writes or resets.
// --verify rolls back all changes; --apply verifies then installs this migration.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { assertTarget } from './verify-target.mjs';
const require = createRequire(new URL('../../web/package.json', import.meta.url));
const postgres = require('postgres');
const mode = process.argv[2];
assert.ok(['--verify', '--apply'].includes(mode));
const version = '20261012150000';
const migration = readFileSync(new URL(`../../supabase/migrations/${version}_created_timplans_only.sql`, import.meta.url), 'utf8');
const previous = readFileSync(new URL('../../supabase/migrations/20261006123000_phase5_planning_year_search_details.sql', import.meta.url), 'utf8');
const target = await assertTarget('protected');
const db = postgres(target.dbUrl, { max: 1, onnotice: () => {} });
const tables = ['offerings','offering_units','point_plans','point_plan_events','timplans','timplan_cells','timplan_events','class_timplans','gym_timplan_receipts','programplan_unit_packages'];
async function snapshot(tx) {
 const result = {};
 for (const table of tables) result[table] = (await tx.unsafe(`select md5(coalesce(jsonb_agg(to_jsonb(r) order by to_jsonb(r)::text),'[]'::jsonb)::text) hash from public.${table} r`))[0].hash;
 return result;
}
const selection = changes => ({schoolYear:2026,unitId:null,view:'timplan',schoolform:'gymnasium',query:'',status:'all',cohortRelation:'all',archive:'all',grade:null,sort:'name',direction:'asc',page:1,selectionRevision:null,...changes});
let before, result;
try {
 try { await db.begin(async tx => {
  await tx`set local lock_timeout='5s'`;
  await tx`set local statement_timeout='30s'`;
  const [fn] = await tx`select prosrc,proowner,proacl from pg_proc where oid='public.phase5_planning_year_rows(jsonb)'::regprocedure`;
  assert.equal(fn.prosrc, previous.split('as $$')[1].split('$$;')[0], 'Installed definition changed; review required');
  assert.equal((await tx`select version from supabase_migrations.schema_migrations where version=${version}`).length,0);
  before = await snapshot(tx);
  const [s] = await tx`select s.id,s.identity_id,s.membership_id,s.assignment_id,a.customer_id,a.organizer_id from public.app_sessions s join public.access_assignments a on a.id=s.assignment_id where a.function='rektor' and s.revoked_at is null and s.expires_at>clock_timestamp() and s.absolute_expires_at>clock_timestamp() order by s.last_seen_at desc limit 1`;
  assert.ok(s, 'Log in through local OIDC as the synthetic rector first');
  const settings = {session_id:s.id,identity_id:s.identity_id,membership_id:s.membership_id,assignment_id:s.assignment_id,customer_id:s.customer_id,organizer_id:s.organizer_id,correlation_id:randomUUID()};
  for (const [key,value] of Object.entries(settings)) await tx`select set_config(${`app.${key}`},${value ?? ''},true)`;
  const queries = [selection(),selection({view:'programplan'}),selection({schoolform:'grundskola'}),selection({schoolform:'introduktionsprogram'}),selection({status:'utkast'}),selection({query:'Ingen-träff-xyz'}),selection({schoolYear:2027}),selection({cohortRelation:'relevant'})];
  const originals = [];
  for(const q of queries) originals.push((await tx`select public.phase5_planning_year_rows(${tx.json(q)}) result`)[0].result);
  assert.ok(originals[0].some(r=>r.plan===null), 'Expected existing education placeholders');
  await tx.unsafe(migration);
  const [afterFn] = await tx`select proowner,proacl from pg_proc where oid='public.phase5_planning_year_rows(jsonb)'::regprocedure`;
  assert.deepEqual(afterFn,{proowner:fn.proowner,proacl:fn.proacl});
  const counts=[];
  for(let i=0;i<queries.length;i++) {
   const q=queries[i], expected=originals[i].filter(r=>q.view==='programplan'||r.plan!==null);
   const actual=(await tx`select public.phase5_planning_year_rows(${tx.json(q)}) result`)[0].result;
   assert.deepEqual(actual,expected);
   const list=(await tx`select public.phase5_planning_year_list(${tx.json(q)}) result`)[0].result;
   const overview=(await tx`select public.phase5_planning_year_overview(${tx.json(q)}) result`)[0].result;
   assert.equal(list.count,expected.length);assert.equal(overview.count,expected.length);
   assert.deepEqual(list.rows,overview.rows.slice(0,50));assert.equal(list.selectionRevision,overview.selectionRevision);
   const page2=(await tx`select public.phase5_planning_year_list(${tx.json({...q,page:2,selectionRevision:list.selectionRevision})}) result`)[0].result;
   assert.deepEqual(page2.rows,overview.rows.slice(50,100));assert.equal(page2.count,list.count);
   counts.push({view:q.view,schoolform:q.schoolform,before:originals[i].length,after:actual.length});
  }
  assert.deepEqual(await snapshot(tx),before);
  result={mode,checks:queries.length,counts,preservedBusinessTables:tables.length,privilegesUnchanged:true};
  // Verification reads produce audit records; roll those back along with trial DDL.
  throw Error('verification_rollback');
 }); } catch(error) { if(error.message!=='verification_rollback') throw error; }
 assert.deepEqual(await db.begin(snapshot),before);
 if(mode==='--apply') await db.begin(async tx=>{
  const [fn]=await tx`select prosrc from pg_proc where oid='public.phase5_planning_year_rows(jsonb)'::regprocedure`;
  assert.equal(fn.prosrc,previous.split('as $$')[1].split('$$;')[0]);
  await tx.unsafe(migration);
  await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'created_timplans_only',${[migration]})`;
  assert.deepEqual(await snapshot(tx),before);
 });
 assert.deepEqual(await db.begin(snapshot),before);
 result.committed=mode==='--apply';result.postTransactionVerified=true;
 writeFileSync(new URL(`../../web/outputs/created-timplans-${mode.slice(2)}.json`,import.meta.url),JSON.stringify(result,null,2));
 console.log(JSON.stringify(result));
} finally { await db.end(); }
