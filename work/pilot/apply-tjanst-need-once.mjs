#!/usr/bin/env node
// Installerar 20261112150000_tjanst_need_once.sql på det lokala skyddade provmålet (3012 ska vara stoppad).
// --rehearse kör hela installationen och rullar tillbaka; --apply kräver användarens ja och genomför den.
// En transaktion: journalen ska sluta på kalenderpaketet, bara tre funktioner får ändras och en tillkomma,
// varje fördelningsrad ska räknas lika före och efter, och inga tabellrader får ändras utöver granskningsraden.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,constants} from 'node:fs';
import {createRequire} from 'node:module';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {assertTarget} from './verify-target.mjs';
import {preservedColumns,preservedRows,readMigrationJournal,sha} from './apply-elective-blocks.mjs';
import {TJANST_MIGRATION_REGISTRY,classifyTjanstMigrations,assertTjanstYearAcl} from './tjanst-migration-state.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
export const NEED_ONCE='supabase/migrations/20261112150000_tjanst_need_once.sql';
export const NEED_ONCE_BASE='20261112141000';
export const NEED_ONCE_ADDED=['tjanst_need_in(jsonb,jsonb,text)'];
export const NEED_ONCE_CHANGED=['tjanst_need(uuid,integer,text)','tjanst_plan_blockers(access_assignments,tjanst_versions,uuid,integer,jsonb)','tjanst_year_core(access_assignments,uuid,integer)'];
const rollback=Error('expected_need_once_rehearsal_rollback');

export function parseNeedOnceArgs(args){
 assert.ok(args.length===3&&['--rehearse','--apply'].includes(args[0])&&args[1]==='--out','explicit_mode_and_output_required');
 const out=resolve(args[2]);assert.ok(['/tmp','/private/tmp'].includes(dirname(out)),'private_output_required');
 return{mode:args[0]==='--apply'?'apply':'rehearsal',out};
}
/** Exakt förväntad katalogskillnad: en ny privat funktion, tre ändrade kroppar med oförändrade rättigheter. */
export function assertNeedOnceDiff(before,after){
 const key=f=>f.signature,by=list=>new Map(list.map(f=>[key(f),f]));const b=by(before),a=by(after);
 assert.deepEqual([...a.keys()].filter(k=>!b.has(k)),NEED_ONCE_ADDED,'unexpected_added_function');
 assert.deepEqual([...b.keys()].filter(k=>!a.has(k)),[],'function_removed');
 assert.deepEqual([...b.keys()].filter(k=>a.get(k).definition!==b.get(k).definition).sort(),NEED_ONCE_CHANGED,'unexpected_changed_function');
 for(const k of b.keys())assert.equal(a.get(k).acl,b.get(k).acl,'privileges_changed:'+k);
 assert.equal(a.get(NEED_ONCE_ADDED[0]).acl,'{postgres=X/postgres}','new_function_must_be_private');
 return{added:NEED_ONCE_ADDED,changed:NEED_ONCE_CHANGED.map(k=>({signature:k,before:sha(b.get(k).definition),after:sha(a.get(k).definition)}))};
}
const functions=db=>db`select replace(p.oid::regprocedure::text,'public.','') signature,pg_get_functiondef(p.oid) definition,coalesce(p.proacl::text,'') acl
 from pg_proc p where p.pronamespace='public'::regnamespace and p.prokind='f' order by 1`.then(r=>Array.from(r,x=>({...x})));
// Varje lagrad fördelningsrad räknad mot sitt behov, så som förhandsvisningen och spärrkontrollen gör.
const rowProof=db=>db`select count(*)::integer rows,encode(sha256(convert_to(coalesce(string_agg(r.id::text||public.tjanst_row_json(r,public.tjanst_need(d.unit_id,d.school_year,r.source_key))::text,E'\n' order by r.id),''),'UTF8')),'hex') sha256
 from public.tjanst_rows r join public.tjanst_versions v on v.id=r.version_id join public.tjanst_distributions d on d.id=v.distribution_id`.then(r=>({...r[0]}));

async function main(){
 const o=parseNeedOnceArgs(process.argv.slice(2)),source=readFileSync(join(root,NEED_ONCE),'utf8'),runId=randomUUID();
 try{assert.equal(execFileSync('lsof',['-ti','tcp:3012','-sTCP:LISTEN'],{encoding:'utf8'}).trim(),'','stop_3012_parent_first');}catch(e){if(e.status!==1)throw e;}
 const hashes=Object.fromEntries(TJANST_MIGRATION_REGISTRY.map(m=>[m.file,sha(readFileSync(join(root,m.file),'utf8'))]));
 assert.equal(TJANST_MIGRATION_REGISTRY.at(-1).file,NEED_ONCE,'unexpected_package_suffix');
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 let report;
 try{
  await db.begin(async tx=>{
   await tx`set local lock_timeout='8s'`;await tx`set local statement_timeout='900s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5551) locked`)[0].locked,true,'installation_lock_unavailable');
   await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
   const journal=await readMigrationJournal(tx),state=classifyTjanstMigrations({journal:journal.map(r=>r.version),sourceHashes:hashes});
   assert.equal(journal.at(-1).version,NEED_ONCE_BASE,'unexpected_journal_tail');assert.deepEqual(state.pendingMigrations,[NEED_ONCE],'partial_or_replayed_package');
   const columns=await preservedColumns(tx),rows=await preservedRows(tx,columns),before=await functions(tx),parityBefore=await rowProof(tx);
   await tx.unsafe(source);
   assert.deepEqual(await preservedColumns(tx),columns,'tables_changed');
   const after=await functions(tx),difference=assertNeedOnceDiff(before,after),parityAfter=await rowProof(tx);
   assert.deepEqual(parityAfter,parityBefore,'row_needs_differ_after_install');
   const workerEntrypoints=await assertTjanstYearAcl(tx,{installed:state.installed,applied:[NEED_ONCE]});
   for(const role of['public','anon','authenticated','service_role','skolplattform_worker'])
    assert.equal((await tx`select has_function_privilege(${role},'public.tjanst_need_in(jsonb,jsonb,text)','EXECUTE') ok`)[0].ok,false,'new_function_reachable:'+role);
   assert.deepEqual(await preservedRows(tx,columns),rows,'rows_changed');
   await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values('20261112150000','tjanst_need_once',${[source]})`;
   const details={package:'tjanst-need-once',migrations:[{file:NEED_ONCE,sha256:sha(source)}]};
   const [audit]=await tx`insert into public.security_events(correlation_id,source,action,object_type,outcome,details)
    values(${runId},'cli','tjanst_need_once_migration_install','migration_package','ok',${tx.json(details)}) returning id`;
   assert.deepEqual(await preservedRows(tx,columns,audit.id),rows,'rows_changed_beyond_audit');
   const tail=(await readMigrationJournal(tx)).at(-1);assert.deepEqual(tail,{version:'20261112150000',name:'tjanst_need_once',statements:[source]},'journal_source_bytes_differ');
   report={kind:'tjanst-need-once-install',mode:o.mode,status:'PASS',target:'protected',scope:'local-synthetic-only',targetProjectId:target.projectId,
    migration:NEED_ONCE,sourceSha256:sha(source),journalBefore:NEED_ONCE_BASE,journalAfter:tail.version,difference,rowParity:parityAfter,
    functionsAfterSha256:sha(after),workerEntrypoints,tablesChecked:Object.keys(columns).length,auditRowsAdded:1,journalRowsAdded:1,committed:o.mode==='apply'};
   if(o.mode==='rehearsal')throw rollback;
  }).catch(e=>{if(e!==rollback)throw e;});
  const journal=await readMigrationJournal(db),now=await functions(db);
  if(o.mode==='apply'){assert.equal(journal.at(-1).version,'20261112150000','postcommit_journal_mismatch');assert.equal(sha(now),report.functionsAfterSha256,'postcommit_function_mismatch');}
  else{assert.equal(journal.at(-1).version,NEED_ONCE_BASE,'rehearsal_left_journal_row');assert.ok(!now.some(f=>f.signature===NEED_ONCE_ADDED[0]),'rehearsal_left_function');}
  writeFileSync(o.out,JSON.stringify(report,null,2)+'\n',{flag:constants.O_WRONLY|constants.O_CREAT|constants.O_EXCL|constants.O_NOFOLLOW,mode:0o600});
  process.stdout.write(`PASS ${o.mode}: ${report.rowParity.rows} rader lika före och efter, ${report.tablesChecked} tabeller oförändrade\n`);
 }finally{await db.end({timeout:5});}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main().catch(e=>{process.stderr.write('FAILED: '+(e.code==='ERR_ASSERTION'?e.message:(e.message?.startsWith('REFUSED')||e.message?.startsWith('BLOCKED')?e.message:'NEED_ONCE_INSTALL_FAILED'))+'\n');process.exitCode=1;});
