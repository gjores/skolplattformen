#!/usr/bin/env node
// 05.1.1-16. Read-only source preflight; rollback rehearsal in an owned schema-only copy.
// Actual target writes require a separately recorded, candidate/package-specific user approval.
// No runtime switch, credentials in arguments, demo login, or reset path.
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,realpathSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {assertTarget} from './verify-target.mjs';
import {createNamedTimplanSnapshot,schemaFingerprint} from './named-timplan-snapshot.mjs';
import {connect,classCohortTargetIdentity,reserveReport} from './verify-class-cohort.mjs';
import {preservedColumns,preservedRows,readMigrationJournal,prepareMigrationSql,electiveTableLock,sha} from './apply-elective-blocks.mjs';
import {privatePath,evidence} from './apply-valplan.mjs';
import {TJANST_MIGRATION_REGISTRY,classifyTjanstMigrations,TJANST_PHASE_START} from './tjanst-migration-state.mjs';
import {verificationSources,bindCandidateSources} from './verify-lasar-actual.mjs';
import {validateLasarReleaseEvidence,assertEvidenceFilesUnchanged} from './lasar-install-evidence.mjs';
import {EXPECTED_DELTA,assertLasarTransition,assertLasarPrivileges} from './lasar-install-schema.mjs';
import {createLasarFixture} from './lasar-fixtures.mjs';
import {proposeSchoolYear,addDays,dayInfo} from '../../web/lib/lasar-model.ts';
import {parseLasarReadReply} from '../../web/lib/lasar-contract.ts';

const root=fileURLToPath(new URL('../../',import.meta.url)),prefix='supabase/migrations/';
const version=p=>p.split('/').at(-1).slice(0,14),name=p=>p.split('/').at(-1).slice(15,-4);
const ident=s=>'"'+s.replaceAll('"','""')+'"';
const signature=s=>s.replaceAll('public.','').replaceAll(', ',',');
const rollback=Error('expected_lasar_rehearsal_rollback');
export const LASAR_BASE_VERSION='20261111190000';
export const LASAR_MIGRATIONS=['20261112100000_lasar_groups.sql','20261112110000_lasar_change_requests.sql','20261112120000_lasar_frames.sql',
 '20261112130000_lasar_copy_overview.sql','20261112131000_lasar_overview_worker_access.sql','20261112140000_lasar_summary.sql','20261112141000_lasar_summary_worker_access.sql'].map(f=>prefix+f);
export const INSTALLED=TJANST_MIGRATION_REGISTRY.filter(m=>m.version<=LASAR_BASE_VERSION).map(m=>m.file);
export const LEGACY_REVISION='261fc0db304172ea5f76016d3907521dc5e0f63d';
export const NEW_TABLES=['school_year_change_requests','school_year_frame_settings','school_year_frames','school_year_frame_days','school_year_frame_events','school_year_review_items'];
const READERS=['tjanst_school_weeks(uuid,integer)','tjanst_year_core(access_assignments,uuid,integer)','phase5_programplan_starts_on(offerings)'];

export function lasarSourceSnapshot(){
 const files=readdirSync(resolve(root,prefix)).filter(f=>/^\d{14}_[a-z0-9_]+\.sql$/u.test(f)).sort();
 const sources=Object.fromEntries(files.map(f=>{const sql=readFileSync(resolve(root,prefix,f),'utf8');return[prefix+f,{sql,sha256:sha(sql)}];}));
 const registered=Object.fromEntries(Object.entries(sources).filter(([f])=>version(f)>=TJANST_PHASE_START).map(([f,s])=>[f,s.sha256]));
 classifyTjanstMigrations({sourceHashes:registered,journal:TJANST_MIGRATION_REGISTRY.map(m=>m.version)});
 assert.deepEqual(TJANST_MIGRATION_REGISTRY.map(m=>m.file),[...INSTALLED,...LASAR_MIGRATIONS],'unexpected_package_suffix');return sources;
}
export const sourceHashes=sources=>Object.fromEntries(Object.entries(sources).map(([f,s])=>[f,s.sha256]));
export function validateLasarJournal(rows,sources,{after=false}={}){
 const expected=after?[...INSTALLED,...LASAR_MIGRATIONS]:INSTALLED;
 const hashes=Object.fromEntries(Object.entries(sourceHashes(sources)).filter(([f])=>version(f)>=TJANST_PHASE_START));
 const state=classifyTjanstMigrations({journal:rows.map(r=>r.version),sourceHashes:hashes});
 assert.deepEqual(state.installed,expected.map(version),'unexpected_installed_prefix');
 assert.equal(rows.at(-1)?.version,version(expected.at(-1)),'unexpected_journal_tail');
 for(const f of expected)assert.deepEqual(rows.find(r=>r.version===version(f)),{version:version(f),name:name(f),statements:[sources[f].sql]},'installed_source_bytes_differ');
 assert.deepEqual(state.pendingMigrations,after?[]:LASAR_MIGRATIONS,'partial_or_replayed_package');
 return{count:rows.length,sha256:sha(rows),installed:state.installed,pending:state.pendingMigrations};
}

export function parseLasarArgs(args){
 assert.ok(['--rehearse','--apply'].includes(args[0]),'explicit_mode_required');const result={mode:args[0]==='--apply'?'apply':'rehearsal'};
 const keys={'--candidate':'candidate','--actual':'actual','--tjanst-actual':'tjanstActual','--visual-review':'visualReview','--sql-evidence':'sqlEvidence','--rehearsal':'rehearsal','--approval':'approval','--out':'out'};
 for(let i=1;i<args.length;i+=2){const k=keys[args[i]];assert.ok(k&&args[i+1]&&!Object.hasOwn(result,k),'unknown_or_duplicate_argument');result[k]=k==='candidate'?resolve(args[i+1]):privatePath(args[i+1]);}
 const required=result.mode==='rehearsal'?['candidate','actual','tjanstActual','visualReview','sqlEvidence','out']:['rehearsal','approval','out'];
 assert.deepEqual(Object.keys(result).filter(k=>k!=='mode').sort(),required.sort(),'required_mode_arguments');
 assert.notEqual(result.out,result.rehearsal);assert.notEqual(result.out,result.approval);return result;
}
export function assertLasarApproval(value,prior,priorSha256){
 assert.equal(value.kind,'lasar-installation-approval');assert.equal(value.decision,'ja, installera och byt 3012');
 assert.equal(value.candidateRevision,prior.release.candidateRevision);assert.equal(value.rehearsalSha256,priorSha256);
 assert.deepEqual(value.migrations,prior.package);assert.ok(Number.isFinite(Date.parse(value.approvedAt)),'approval_date_required');
 assert.equal(prior.kind,'lasar-migration-evidence');assert.ok(Date.parse(value.approvedAt)>=Date.parse(prior.finishedAt),'approval_must_follow_rehearsal');
 assert.equal(prior.status,'PASS');assert.equal(prior.mode,'rehearsal');assert.equal(prior.committed,false);
 assert.equal(prior.rollbackRestored,true);assert.equal(prior.snapshotCleanup?.cleanup,'complete');assert.equal(prior.targetUnchanged,true);
 assert.equal(prior.databaseClosed,true);assert.ok(prior.checks?.length&&prior.checks.every(c=>c.ok===true),'rehearsal_checks_required');
 return true;
}
export function assertApprovedPackage(value,prior,currentPackage,priorSha256){
 assertLasarApproval(value,prior,priorSha256);assert.deepEqual(prior.package,currentPackage,'approved_package_differs_from_executable');
 assert.deepEqual(value.migrations,currentPackage,'approval_package_differs_from_executable');
}
export function assertOwnedRehearsal(database,sourceDatabase){
 assert.match(database,/^named_timplan_[a-f0-9]{32}$/u,'owned_rehearsal_required');assert.notEqual(database,sourceDatabase,'source_database_refused');
}

/** Reuse the exact registered transfer SELECT, with its pure SQL helpers inlined; never create helpers on the source. */
export function groupResolutionSql(sql){
 const start=sql.indexOf('create temp table lasar_group_rows as\n'),end=sql.indexOf('\n\n-- Kontrollsumman före överföringen',start);
 assert.ok(start>=0&&end>start,'group_preflight_source_missing');let select=sql.slice(start+'create temp table lasar_group_rows as\n'.length,end).trim();
 const body=fn=>{const i=sql.indexOf('create function public.'+fn+'('),a=sql.indexOf('$$',i),b=sql.indexOf('$$',a+2);assert.ok(i>=0&&a>i&&b>a);return sql.slice(a+2,b).trim().replace(/^select\s+/u,'');};
 const replacements=[['public.lasar_offering_at(o, r.unit_id)',body('lasar_offering_at').replace(/\bunit\b/gu,'r.unit_id')],
  ['public.lasar_offering_columns(o, r.start_year)',body('lasar_offering_columns').replace(/\byear\b/gu,'r.start_year')],
  ['public.lasar_class_in_year(c, o.kind, r.start_year)',body('lasar_class_in_year').replace(/\byear\b/gu,'r.start_year').replace(/\bkind\b/gu,'o.kind')]];
 for(const[from,to]of replacements){assert.equal(select.split(from).length,2,'helper_call_count_changed');select=select.replace(from,'('+to+')');}
 select=select.replace(/;\s*$/u,'')+'\norder by r.tbl,r.school_year_id,r.group_key,r.day nulls first,r.sw_column;';
 assert.match(select,/^select\b/iu);assert.ok(!/\b(?:create|insert|update|delete|lock|set_config)\b/iu.test(select),'read_only_group_select_required');return select;
}
export function validateGroupResolution(rows){
 const counts={total:rows.length,arskurs:0,klass:0,okand:0,groupDays:0,shortWeeks:0};const keys=new Set();
 for(const row of rows){assert.ok(['arskurs','klass'].includes(row.form)&&row.resolved===true,'unresolved_group_reference');
  if(row.form==='klass')assert.equal(row.candidates,1,'ambiguous_group_reference');
  counts[row.form]++;assert.ok(['group_days','short_weeks'].includes(row.tbl));counts[row.tbl==='group_days'?'groupDays':'shortWeeks']++;
  const ref=row.form==='klass'?'klass:'+row.class_id:'arskurs:'+row.offering_id+':'+row.column_id;
  const key=JSON.stringify([row.tbl,row.school_year_id,ref,row.tbl==='group_days'?row.day:null]);
  assert.ok(!keys.has(key),'resolved_group_collision');keys.add(key);
 }
 return{...counts,unresolved:0,collisions:0,projectionSha256:sha(rows)};
}

async function preflightInTransaction(tx,target,sources){
  const identity=await classCohortTargetIdentity(tx,target),journal=await readMigrationJournal(tx);
  const groups=await tx.unsafe(groupResolutionSql(sources[LASAR_MIGRATIONS[0]].sql));
  const calendars=await tx`select to_jsonb(y) data,coalesce(y.content_hash,public.lasar_content_hash(y.id)) effective_hash,
    exists(select 1 from public.school_year_group_days g where g.school_year_id=y.id) or exists(select 1 from public.school_year_short_weeks w where w.school_year_id=y.id) has_groups
    from public.school_years y order by y.id`;
  const perScope=await tx`select versions,count(*)::integer scopes from (select count(*)::integer versions from public.school_years group by unit_id,start_year) s group by versions order by versions`;
  const reserves=await tx`select o.id,public.phase5_programplan_starts_on(o)::text starts_on from public.offerings o order by o.id`;
  const planning=await tx`select count(*)::integer total,count(*) filter(where exists(select 1 from public.school_classes c join public.offerings o on o.id=c.offering_id where c.unit_id=d.unit_id and o.kind='introduktionsprogram' and c.start_year=d.school_year))::integer with_im from public.tjanst_distributions d`;
  const columns=await preservedColumns(tx),selected=Object.fromEntries(Object.entries(columns).filter(([k])=>/^public\.(?:school_year|offerings$|offering_units$|school_classes$|class_timplans$|point_plans$)/u.test(k)));
  const state={identitySha256:identity.sha256,schemaFingerprint:await schemaFingerprint(tx),journal:validateLasarJournal(journal,sources),groups:validateGroupResolution(groups),
   calendars:{total:calendars.length,faststalld:calendars.filter(c=>c.data.status==='faststalld').length,perSchoolYear:perScope,
    freezeEligible:calendars.filter(c=>c.data.status==='faststalld'&&c.data.content_hash===null&&c.has_groups).length,payloadSha256:sha(calendars)},
   reserveStarts:{offerings:reserves.length,nonNull:reserves.filter(r=>r.starts_on!==null).length,sha256:sha(reserves)},planningCounts:planning[0],relevantRows:await preservedRows(tx,selected),
   basisImpact:{predictedChangedPlans:0,derived:true,reason:'D-19 readers already installed; package preserves effective calendar hash, school days, current version and source rows. Synthetic basis is compared before/after rehearsal.'}};
  return{state,journal,sourceDatabase:identity.database};
}
const preflight=(connection,target,sources)=>connection.begin('isolation level repeatable read read only',tx=>preflightInTransaction(tx,target,sources));

/** Compare the original row projection. The exception is per identified row, never a global column omission. */
export function assertCalendarRowPreserved(before,after,{eligible,oldHash,updatedAtValid}={}){
 if(!eligible){assert.deepEqual(after,before,'unexpected_calendar_row_change');return;}
 assert.equal(before.status,'faststalld');assert.equal(before.content_hash,null);assert.equal(after.content_hash,oldHash,'frozen_hash_differs');
 assert.equal(updatedAtValid,true,'unexpected_updated_at');
 assert.deepEqual({...after,content_hash:before.content_hash,updated_at:before.updated_at},before,'unexpected_calendar_column_change');
}

async function captureRows(tx){
 const columns=await preservedColumns(tx),rows=await preservedRows(tx,columns);
 const calendars=await tx`select y.id,to_jsonb(y) original,coalesce(y.content_hash,public.lasar_content_hash(y.id)) effective_hash,
  y.status='faststalld' and y.content_hash is null and (exists(select 1 from public.school_year_group_days g where g.school_year_id=y.id) or exists(select 1 from public.school_year_short_weeks w where w.school_year_id=y.id)) eligible
  from public.school_years y order by y.id`;
 const groups=await tx.unsafe(groupResolutionSql(lasarSourceSnapshot()[LASAR_MIGRATIONS[0]].sql));validateGroupResolution(groups);
 return{columns,rows,calendars,groups};
}
async function assertRowsPreserved(tx,before,auditId){
 const names=before.columns['public.school_years'];
 const actual=await tx.unsafe(`select y.id,to_jsonb(p) original,coalesce(y.content_hash,public.lasar_content_hash(y.id)) effective_hash,y.updated_at=transaction_timestamp() updated_at_valid
  from public.school_years y cross join lateral(select ${names.map(n=>'y.'+ident(n)).join(',')}) p order by y.id`);
 assert.equal(actual.length,before.calendars.length,'calendar_count_changed');
 for(const b of before.calendars){const a=actual.find(v=>v.id===b.id);assert.ok(a,'calendar_removed');
  assertCalendarRowPreserved(b.original,a.original,{eligible:b.eligible,oldHash:b.effective_hash,updatedAtValid:a.updated_at_valid});
  if(b.original.status==='faststalld')assert.equal(a.effective_hash,b.effective_hash,'effective_hash_changed');}
 const afterRows=await preservedRows(tx,before.columns,auditId);
 // Every school_years original projection has already been compared per row, including exact exception boundaries.
 assert.equal(afterRows['public.school_years'].count,before.rows['public.school_years'].count);delete afterRows['public.school_years'];
 const {['public.school_years']:calendarRows,...otherBefore}=before.rows;assert.deepEqual(afterRows,otherBefore,'original_rows_changed');
 const afterGroups=[...await tx`select 'group_days' tbl,school_year_id,group_key,day,scope,offering_id,column_id,class_id,group_ref from public.school_year_group_days`,
  ...await tx`select 'short_weeks' tbl,school_year_id,group_key,null::date day,scope,offering_id,column_id,class_id,group_ref from public.school_year_short_weeks`];
 assert.equal(afterGroups.length,before.groups.length,'group_count_changed');
 for(const b of before.groups){const a=afterGroups.find(g=>g.tbl===b.tbl&&g.school_year_id===b.school_year_id&&g.group_key===b.group_key&&String(g.day)===String(b.day));assert.ok(a,'group_missing');
  assert.equal(a.scope,b.form);assert.equal(a.offering_id,b.offering_id);assert.equal(a.class_id,b.class_id);
  assert.equal(a.column_id,b.tbl==='short_weeks'?b.sw_column:b.form==='arskurs'?b.column_id:null);
  assert.equal(a.group_ref,b.form==='klass'?'klass:'+b.class_id:'arskurs:'+b.offering_id+':'+b.column_id);}
 for(const table of NEW_TABLES)assert.equal((await tx.unsafe('select count(*)::integer n from public.'+ident(table)))[0].n,0,'new_table_not_empty');
 return{originalTables:Object.keys(before.rows).length,calendarRows:actual.length,hashesFrozen:before.calendars.filter(y=>y.eligible).length,groupRows:afterGroups.length,
  effectiveHashesPreserved:true,originalColumnsPreserved:true,newTablesEmpty:NEW_TABLES.length,originalRowsSha256:sha(before.rows),calendarProjectionSha256:sha(before.calendars.map(c=>c.original))};
}

async function seedRehearsal(tx){
 const f=await createLasarFixture(tx),year=2027,sy=proposeSchoolYear(year,f.schools.A,['GR','GY']),days=[];
 for(let d=sy.ht.start;d<=sy.vt.end;d=addDays(d,1))if(dayInfo(sy,d).status==='skoldag')days.push(d);
 const add=async(version,{decided=false,stored=false,groups=true,unit=f.schools.A}={})=>{
  const [y]=await tx`insert into public.school_years(organizer_id,unit_id,start_year,version,ht_start,ht_end,vt_start,vt_end,status)
   values(${f.id(2)},${unit},${year},${version},${sy.ht.start},${sy.ht.end},${sy.vt.start},${sy.vt.end},'utkast') returning id`;
  for(const[day,e]of Object.entries(sy.exceptions))await tx`insert into public.school_year_days(school_year_id,day,kind,note) values(${y.id},${day},${e.kind},${e.note??null})`;
  if(groups){await tx`insert into public.school_year_group_days(school_year_id,group_key,day,cause,note) values
    (${y.id},${f.offerings.gr+':ak1'},${days[5]},'friluftsdag','Syntetisk dag'),(${y.id},'klass:SYN1A',${days[6]},'annat','Syntetisk dag')`;
   await tx`insert into public.school_year_short_weeks(school_year_id,group_key,column_id,weekday,reason) values(${y.id},${'klass:'+f.groups.classes.im},'vecka',4,'Syntetiska skäl')`;}
  if(decided)await tx`update public.school_years set status='faststalld',decided_on='2027-05-01',content_hash=${stored?tx`public.lasar_content_hash(id)`:null} where id=${y.id}`;
  return y.id;
 };
 const v1=await add(1,{decided:true}),v2=await add(2);
 await tx`update public.school_years set superseded_at=clock_timestamp(),superseded_by=${v2} where id=${v1}`;
 await tx`update public.school_years set status='faststalld',decided_on='2027-05-02',content_hash=public.lasar_content_hash(id) where id=${v2}`;
 const v3=await add(3);await add(1,{decided:true,groups:false,unit:f.schools.B});
 await f.actor(tx,'principalA');
 const basis=async()=>{const [r]=await tx`select public.tjanst_year_core(a,${f.schools.A},${year}) value from public.access_assignments a where a.id=${f.roles.principalA}`;return r.value;};
 return{f,year,versionId:v3,basis};
}

export function installerSources(revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim()){
 const sources=verificationSources({entrypoints:['work/pilot/apply-lasar.mjs','work/pilot/apply-lasar.test.mjs','work/pilot/lasar-install-schema.test.mjs','work/pilot/lasar-install-evidence.test.mjs']});
 return{revision,sources,binding:bindCandidateSources(revision,sources)};
}

async function installPackage(tx,{sources,release,runId,revalidate,beforeFingerprint,originalJournal,target=null,expectedPreflight=null}){
 await tx`set local lock_timeout='8s'`;await tx`set local statement_timeout='180s'`;
 assert.equal((await tx`select pg_try_advisory_xact_lock(5551) locked`)[0].locked,true,'installation_lock_unavailable');
 const original=await preservedColumns(tx);for(const table of Object.keys(original).sort())await tx.unsafe(electiveTableLock(table));
 await tx`lock table supabase_migrations.schema_migrations in share row exclusive mode`;
 assert.equal(await schemaFingerprint(tx),beforeFingerprint,'schema_changed_before_install');assert.deepEqual(await readMigrationJournal(tx),originalJournal,'journal_changed_before_install');
 if(expectedPreflight){assert.ok(target);assert.deepEqual((await preflightInTransaction(tx,target,sources)).state,expectedPreflight,'approved_target_changed_under_installation_locks');}
 validateLasarJournal(originalJournal,sources);await revalidate();
 const before=await schemaFingerprint(tx,true),rows=await captureRows(tx);
 for(const file of LASAR_MIGRATIONS)await tx.unsafe(prepareMigrationSql(sources[file].sql).sql);
 await tx`set constraints all immediate`;
 const after=await schemaFingerprint(tx,true),transition=assertLasarTransition(before,after),privileges=await assertLasarPrivileges(tx,before);
 for(const sig of READERS)assert.deepEqual(after.functions.find(f=>signature(f.signature)===sig),before.functions.find(f=>signature(f.signature)===sig),'installed_reader_changed');
 const rowProof=await assertRowsPreserved(tx,rows,null);
 for(const file of LASAR_MIGRATIONS)await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version(file)},${name(file)},${[sources[file].sql]})`;
 const details={package:'lasar',candidateRevision:release.candidateRevision,migrations:LASAR_MIGRATIONS.map(f=>({file:f,sha256:sources[f].sha256}))};
 const [audit]=await tx`insert into public.security_events(correlation_id,source,action,object_type,outcome,details)
  values(${runId},'cli','lasar_migration_install','migration_package','ok',${tx.json(details)}) returning id`;
 const [event]=await tx`select correlation_id::text,source,action,object_type,outcome,details from public.security_events where id=${audit.id}`;
 assert.deepEqual(event,{correlation_id:runId,source:'cli',action:'lasar_migration_install',object_type:'migration_package',outcome:'ok',details});
 await assertRowsPreserved(tx,rows,audit.id);await revalidate();
 return{fingerprint:sha(after),journal:validateLasarJournal(await readMigrationJournal(tx),sources,{after:true}),transition,privileges,rowProof,
  journalRowsAdded:LASAR_MIGRATIONS.length,auditRowsAdded:1,auditIdSha256:sha(String(audit.id))};
}

export async function applyLasar(options){
 assert.ok(['rehearsal','apply'].includes(options.mode),'explicit_mode_required');
 const out=privatePath(options.out);assert.equal(realpathSync(dirname(out)),dirname(out));
 let prior=null,approval=null;
 if(options.mode==='apply'){
  prior=evidence(options.rehearsal);approval=evidence(options.approval);assertLasarApproval(approval.value,prior.value,prior.sha256);
  try{const port=execFileSync('lsof',['-ti','tcp:3012','-sTCP:LISTEN'],{encoding:'utf8'});assert.equal(port.trim(),'','stop_3012_parent_first');}catch(e){if(e.status!==1)throw e;}
 }
 const inputs=prior?prior.value.inputs:Object.fromEntries(['candidate','actual','tjanstActual','visualReview','sqlEvidence'].map(k=>[k,options[k]]));
 const sink=reserveReport(out,'lasar-migration-evidence',options.mode),r=sink.report;r.checks=[];r.committed=false;r.inputs=inputs;
 let db,snapshot,abort=false;const stop=()=>{abort=true;};process.once('SIGINT',stop);process.once('SIGTERM',stop);
 try{
  const checked=name=>r.checks.push({name,ok:true});
  const sources=lasarSourceSnapshot();r.sqlSourceHashes=sourceHashes(sources);r.tool=installerSources(prior?.value.tool.revision);r.release=await validateLasarReleaseEvidence(inputs);
  r.migrationBinding=bindCandidateSources(r.release.candidateRevision,r.sqlSourceHashes);checked('candidate_actual_sql_visual_and_installer_sources_bound');
  r.package=LASAR_MIGRATIONS.map(file=>({file,sha256:sources[file].sha256}));r.expectedDelta=EXPECTED_DELTA;
  if(prior){assertApprovedPackage(approval.value,prior.value,r.package,prior.sha256);assert.deepEqual(prior.value.sqlSourceHashes,r.sqlSourceHashes,'migration_sources_changed');assert.deepEqual(prior.value.release,r.release,'release_evidence_changed');assert.deepEqual(prior.value.tool,r.tool,'installer_changed');r.rehearsalEvidence={path:prior.path,sha256:prior.sha256};r.approvalEvidence={path:approval.path,sha256:approval.sha256};}
  const target=await assertTarget('protected');db=connect(target);const baseline=await preflight(db,target,sources);r.preflight=baseline.state;r.targetAccess='repeatable-read-read-only';
  assert.equal(baseline.state.schemaFingerprint,r.release.targetFingerprint,'source_schema_differs_from_actual_evidence');
  assert.equal(baseline.state.journal.sha256,r.release.targetJournal.fingerprint.sha256,'source_journal_differs_from_actual_evidence');checked('source_preflight_read_only_and_matches_actual_baseline');
  if(prior)assert.deepEqual(baseline.state,prior.value.preflight,'target_changed_since_rehearsal');
  const revalidate=async()=>{assert.equal(abort,false,'interrupted');assert.deepEqual(sourceHashes(lasarSourceSnapshot()),r.sqlSourceHashes);assert.deepEqual(installerSources(r.tool.revision),r.tool);assertEvidenceFilesUnchanged(r.release);if(prior){assert.equal(evidence(options.rehearsal).sha256,prior.sha256);assert.equal(evidence(options.approval).sha256,approval.sha256);}};
  if(options.mode==='rehearsal'){
   snapshot=await createNamedTimplanSnapshot();assertOwnedRehearsal(snapshot.provenance.database,baseline.sourceDatabase);
   assert.equal(snapshot.provenance.sourceFingerprint,baseline.state.schemaFingerprint,'snapshot_source_changed');
   r.snapshot={database:snapshot.provenance.database,dataCopied:snapshot.provenance.dataCopied,sourceFingerprint:snapshot.provenance.sourceFingerprint,restoredFingerprint:snapshot.provenance.restoredFingerprint};checked('owned_schema_copy_without_source_rows');
   const originalRows=await preservedRows(snapshot.db,await preservedColumns(snapshot.db)),originalJournal=await readMigrationJournal(snapshot.db);
   try{await snapshot.db.begin(async tx=>{
    for(const row of baseline.journal)await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${row.version},${row.name},${row.statements})`;
    const fixture=await seedRehearsal(tx),basisBefore=await fixture.basis();
    const syntheticBaseline=(await preflightInTransaction(tx,target,sources)).state;
    // Exercise the actual under-lock gate with a row change, then roll the attempted change back.
    await assert.rejects(tx.savepoint(async probe=>{
     await probe`update public.school_years set revision=revision+1 where id=${fixture.versionId}`;
     await installPackage(probe,{sources,release:r.release,runId:r.runId,revalidate,beforeFingerprint:r.preflight.schemaFingerprint,
      originalJournal:baseline.journal,target,expectedPreflight:syntheticBaseline});
    }),e=>e.name==='AssertionError'&&String(e.message).includes('approved_target_changed_under_installation_locks'));
    assert.equal(await schemaFingerprint(tx),r.preflight.schemaFingerprint);assert.deepEqual(await readMigrationJournal(tx),baseline.journal);
    checked('changed_rehearsal_rows_refused_under_locks_before_ddl');
    const request={target:{kind:'school',unitId:fixture.f.schools.A},schoolYear:fixture.year,versionId:fixture.versionId};
    r.stage='rehearsing';sink.save();r.rehearsal=await installPackage(tx,{sources,release:r.release,runId:r.runId,revalidate,beforeFingerprint:r.preflight.schemaFingerprint,originalJournal:baseline.journal,target,expectedPreflight:syntheticBaseline});
    checked('exact_schema_acl_journal_and_original_row_preservation');
    assert.deepEqual(await fixture.basis(),basisBefore,'synthetic_basis_changed');
    parseLasarReadReply((await tx`select public.lasar_read(${tx.json(request)}) value`)[0].value,request);
    r.syntheticProof={basisUnchanged:true,basisSha256:sha(basisBefore),calendarParserAccepted:true,changedRowsRefusedBeforeDdl:true,scope:'owned schema-only copy; synthetic rows only'};
    checked('synthetic_basis_and_calendar_contract_unchanged');
    r.stage='rollback_pending';sink.save();throw rollback;
   });}catch(e){if(e!==rollback)throw e;}
   assert.equal(await schemaFingerprint(snapshot.db),r.preflight.schemaFingerprint);assert.deepEqual(await readMigrationJournal(snapshot.db),originalJournal);
   assert.deepEqual(await preservedRows(snapshot.db,await preservedColumns(snapshot.db)),originalRows);r.rollbackRestored=true;
   checked('owned_transaction_rolled_back_schema_journal_and_rows_restored');
   r.legacyParser={revision:LEGACY_REVISION,...bindCandidateSources(LEGACY_REVISION,verificationSources({entrypoints:['web/lib/lasar-contract.ts']}))};
   checked('installed_legacy_parser_bytes_compatible');
  }else{
   assert.ok(prior&&approval,'installation_approval_required');r.targetAccess='approved-installation';assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'installation_session_lock_unavailable');
   // READ COMMITTED observes commits made before the final table lock was acquired.
   // All baseline and row checks inside installPackage run after those write-excluding locks.
   try{r.stage='installing';sink.save();await db.begin('isolation level read committed',async tx=>{
    r.installed=await installPackage(tx,{sources,release:r.release,runId:r.runId,revalidate,beforeFingerprint:r.preflight.schemaFingerprint,originalJournal:baseline.journal,target,expectedPreflight:prior.value.preflight});
    assert.equal(r.installed.fingerprint,prior.value.rehearsal.fingerprint,'rehearsed_schema_differs');r.stage='commit_pending';sink.save();
   });r.committed=true;}finally{await db`select pg_advisory_unlock(5520)`;}
  }
  await revalidate();r.status='PASS';delete r.failureCode;r.stage='verified';
 }catch(error){r.status='FAIL';r.failure={name:error.name==='AssertionError'?'AssertionError':'Error',messageSha256:sha(String(error.message??'')),
   reason:/^[a-z_]+$/u.test(error.message??'')?error.message:null};if(r.stage==='commit_pending'&&!r.committed){r.committed=null;r.commitOutcome='unknown';}}
 finally{
  if(snapshot)try{const cleanup=await snapshot.cleanup();r.snapshotCleanup={cleanup:cleanup.cleanup,database:cleanup.database};}catch{r.snapshotCleanup={cleanup:'failed'};r.status='FAIL';}
  if(db){try{if(options.mode==='rehearsal'){const final=await preflight(db,await assertTarget('protected'),lasarSourceSnapshot());assert.deepEqual(final.state,r.preflight,'target_changed_during_rehearsal');r.targetUnchanged=true;}await db.end({timeout:5});r.databaseClosed=true;}catch{r.status='FAIL';r.targetUnchanged=false;r.databaseClosed=false;try{await db.end({timeout:5});r.databaseClosed=true;}catch{}}}
  if(options.mode==='rehearsal'&&(r.snapshotCleanup?.cleanup!=='complete'||r.rollbackRestored!==true||r.targetUnchanged!==true))r.status='FAIL';
  process.removeListener('SIGINT',stop);process.removeListener('SIGTERM',stop);r.finishedAt=new Date().toISOString();sink.close();
 }
 return r;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const r=await applyLasar(parseLasarArgs(process.argv.slice(2)));console.log(`${r.status}: lasar ${r.mode}; committed=${r.committed}; cleanup=${r.snapshotCleanup?.cleanup??'not-applicable'}`);if(r.status!=='PASS')process.exitCode=1;}
 catch{console.error('FAIL: lasar precondition refused; installation not started');process.exitCode=1;}
}
