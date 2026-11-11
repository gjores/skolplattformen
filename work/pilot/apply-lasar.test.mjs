import test from 'node:test';
import assert from 'node:assert/strict';
import {LASAR_MIGRATIONS,INSTALLED,lasarSourceSnapshot,validateLasarJournal,parseLasarArgs,assertLasarApproval,
 assertOwnedRehearsal,groupResolutionSql,validateGroupResolution,assertCalendarRowPreserved,assertApprovedPackage,applyLasar,lasarPreflightValue,assertLasarApprovalRevalidation} from './apply-lasar.mjs';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
// npm dependencies are bound by the package lock, separately from repo sources.
const require=createRequire(new URL('../../web/package.json',import.meta.url));
const {default:Result}=await import(new URL('./result.js',pathToFileURL(require.resolve('postgres'))));
const version=f=>f.split('/').at(-1).slice(0,14),name=f=>f.split('/').at(-1).slice(15,-4);
function journal(){const sources=lasarSourceSnapshot();return{sources,rows:INSTALLED.map(f=>({version:version(f),name:name(f),statements:[sources[f].sql]}))};}
test('live postgres preflight matches persisted evidence while changed counts and hashes remain refused',()=>{
 const rows=new Result();rows.push({versions:1,scopes:3});
 const live={calendars:{perSchoolYear:rows},relevantRows:{'public.school_years':{count:3,sha256:'old'}}};
 const saved=JSON.parse(JSON.stringify(live));
 assert.throws(()=>assert.deepEqual(live,saved));
 assert.deepEqual(lasarPreflightValue(live),saved);
 rows[0].scopes=4;assert.throws(()=>assert.deepEqual(lasarPreflightValue(live),saved));rows[0].scopes=3;
 live.relevantRows['public.school_years'].sha256='changed';assert.throws(()=>assert.deepEqual(lasarPreflightValue(live),saved));
});
test('exact installed prefix accepts the three immutable early files and seven pending files',()=>{
 const{rows,sources}=journal(),r=validateLasarJournal(rows,sources);assert.equal(rows.at(-1).version,'20261111190000');assert.deepEqual(r.pending,LASAR_MIGRATIONS);
});
test('prefix holes, duplicates, partial apply and replay are refused',()=>{
 const{rows,sources}=journal();for(const modified of [rows.slice(0,-1),[...rows,rows.at(-1)],rows.filter((_,i)=>i!==5),
  [...rows,{version:version(LASAR_MIGRATIONS[0]),name:name(LASAR_MIGRATIONS[0]),statements:[sources[LASAR_MIGRATIONS[0]].sql]}]])assert.throws(()=>validateLasarJournal(modified,sources));
 const full=[...rows,...LASAR_MIGRATIONS.map(f=>({version:version(f),name:name(f),statements:[sources[f].sql]}))];assert.throws(()=>validateLasarJournal(full,sources));assert.doesNotThrow(()=>validateLasarJournal(full,sources,{after:true}));
});
test('an early installed SQL byte change or duplicate source statement is refused',()=>{
 for(const f of INSTALLED.slice(-3)){for(const change of [r=>r.statements[0]+='\n',r=>r.statements.push(r.statements[0])]){const{rows,sources}=journal();change(rows.find(r=>r.version===version(f)));assert.throws(()=>validateLasarJournal(rows,sources),/installed_source_bytes_differ/);}}
});
test('CLI has no implicit mode, arbitrary URL, approval shortcut or partial argument set',()=>{
 const args=['--rehearse','--candidate','/private/tmp/lasar-candidate','--actual','/private/tmp/a.json','--tjanst-actual','/private/tmp/t.json','--visual-review','/private/tmp/v.json','--sql-evidence','/private/tmp/s.json','--out','/private/tmp/r.json'];
 assert.equal(parseLasarArgs(args).mode,'rehearsal');for(const bad of [[],args.slice(1),args.slice(0,-2),[...args,'--yes','yes'],['--apply','--rehearsal','/private/tmp/r.json','--out','/private/tmp/o.json'],[...args,'--db-url','example']])assert.throws(()=>parseLasarArgs(bad));
 assert.equal(parseLasarArgs(['--apply','--rehearsal','/private/tmp/r.json','--approval','/private/tmp/a.json','--out','/private/tmp/o.json']).mode,'apply');
});
test('installation approval is bound to exact candidate, package and rollback evidence',()=>{
 const prior={kind:'lasar-migration-evidence',status:'PASS',mode:'rehearsal',committed:false,rollbackRestored:true,targetUnchanged:true,databaseClosed:true,finishedAt:'2026-11-11T09:00:00Z',checks:[{name:'bound',ok:true}],snapshotCleanup:{cleanup:'complete'},release:{candidateRevision:'a'.repeat(40)},package:[{file:'locked.sql',sha256:'b'.repeat(64)}]};
 const approval={kind:'lasar-installation-approval',decision:'ja, installera och byt 3012',candidateRevision:prior.release.candidateRevision,rehearsalSha256:'c'.repeat(64),migrations:prior.package,approvedAt:'2026-11-11T10:00:00Z'};
 assert.equal(assertLasarApproval(approval,prior,'c'.repeat(64)),true);
 assert.doesNotThrow(()=>assertApprovedPackage(approval,prior,prior.package,'c'.repeat(64)));
 assert.throws(()=>assertApprovedPackage(approval,prior,[{file:'other.sql',sha256:'b'.repeat(64)}],'c'.repeat(64)),/approved_package_differs_from_executable/);
 for(const change of [a=>a.decision='yes',a=>a.candidateRevision='d'.repeat(40),a=>a.migrations=[],a=>a.rehearsalSha256='e'.repeat(64),a=>a.approvedAt='2026-11-10T10:00:00Z']){const a=structuredClone(approval);change(a);assert.throws(()=>assertLasarApproval(a,prior,'c'.repeat(64)));}
 for(const change of [r=>r.committed=true,r=>r.targetUnchanged=false,r=>r.snapshotCleanup.cleanup='failed',r=>r.status='FAIL']){const r=structuredClone(prior);change(r);assert.throws(()=>assertLasarApproval(approval,r,'c'.repeat(64)));}
});
test('exported entry point refuses invalid mode before touching paths or connecting',async()=>{
 await assert.rejects(applyLasar({mode:'other',out:'/does-not-exist'}),/explicit_mode_required/);
});
test('technical revalidation keeps original user decision and rejects any changed approved scope or broken evidence chain',()=>{
 const original={kind:'lasar-migration-evidence',status:'PASS',mode:'rehearsal',committed:false,rollbackRestored:true,targetUnchanged:true,databaseClosed:true,finishedAt:'2026-11-11T09:00:00Z',checks:[{ok:true}],snapshotCleanup:{cleanup:'complete'},
  release:{candidateRevision:'a'.repeat(40),artifact:'same'},package:[{file:'locked.sql',sha256:'b'.repeat(64)}],inputs:{actual:'same'},sqlSourceHashes:{sql:'same'},expectedDelta:{tables:6},preflight:{rows:'same'},legacyParser:{revision:'same'},rehearsal:{fingerprint:'same'},tool:{revision:'old'}};
 const current={...structuredClone(original),finishedAt:'2026-11-11T11:00:00Z',tool:{revision:'fixed'}};
 const approval={kind:'lasar-installation-approval',decision:'ja, installera och byt 3012',userReply:'kör på!',candidateRevision:original.release.candidateRevision,rehearsalSha256:'c'.repeat(64),migrations:original.package,approvedAt:'2026-11-11T10:00:00Z'};
 const approvalProof={path:'/private/tmp/approval.json',sha256:'d'.repeat(64)},originalProof={path:'/private/tmp/old.json',sha256:approval.rehearsalSha256},currentProof={path:'/private/tmp/new.json',sha256:'e'.repeat(64)};
 const chain={kind:'lasar-approval-revalidation',reason:'postgres_result_json_roundtrip',originalApproval:approvalProof,originalRehearsal:originalProof,revalidatedRehearsal:currentProof,revalidatedAt:'2026-11-11T12:00:00Z',toolRevisions:{original:'old',revalidated:'fixed'}};
 const args={approval,original,current,chain,approvalProof,originalProof,currentProof};
 assert.equal(assertLasarApprovalRevalidation(args),true);assert.equal(approval.approvedAt,'2026-11-11T10:00:00Z');assert.equal(approval.userReply,'kör på!');
 for(const key of ['package','release','inputs','sqlSourceHashes','expectedDelta','preflight','legacyParser']){const changed=structuredClone(args);changed.current[key]={changed:true};assert.throws(()=>assertLasarApprovalRevalidation(changed));}
 for(const change of [a=>a.chain.originalApproval.sha256='x',a=>a.chain.originalRehearsal.sha256='x',a=>a.chain.revalidatedRehearsal.sha256='x',a=>a.chain.revalidatedAt='2026-11-11T10:59:00Z',a=>a.current.snapshotCleanup.cleanup='failed',a=>a.current.rehearsal.fingerprint='other',a=>a.chain.toolRevisions.revalidated='other',a=>a.approval.approvedAt='2026-11-11T08:00:00Z']){
  // Proof arguments are independent read-file observations, not aliases of the chain's JSON.
  const changed={...structuredClone(args),approvalProof:{...approvalProof},originalProof:{...originalProof},currentProof:{...currentProof}};change(changed);assert.throws(()=>assertLasarApprovalRevalidation(changed));
 }
 assert.equal(parseLasarArgs(['--apply','--rehearsal',currentProof.path,'--approval',approvalProof.path,'--approval-revalidation','/private/tmp/chain.json','--out','/private/tmp/apply.json']).approvalRevalidation,'/private/tmp/chain.json');
});
test('rehearsal cannot point at the source database or an unowned database',()=>{
 const own='named_timplan_'+'a'.repeat(32);assert.doesNotThrow(()=>assertOwnedRehearsal(own,'postgres'));assert.throws(()=>assertOwnedRehearsal('postgres','postgres'));assert.throws(()=>assertOwnedRehearsal(own,own));
});
test('preflight is a read-only SELECT derived from the registered migration and not target helper installation',()=>{
 const sql=groupResolutionSql(lasarSourceSnapshot()[LASAR_MIGRATIONS[0]].sql);assert.match(sql,/^select/);assert.ok(!/create|update|insert|set_config|lasar_offering_at\(/i.test(sql));assert.match(sql,/phase5_class_cohort_year_fits/);assert.throws(()=>groupResolutionSql('select 1'));
});
test('group preflight refuses ambiguous, foreign, unknown and colliding stable references',()=>{
 const row={tbl:'group_days',school_year_id:'year',group_key:'klass:name',day:'2027-09-01',form:'klass',resolved:true,class_id:'stable-class',candidates:1,offering_id:null,column_id:null};
 assert.equal(validateGroupResolution([row]).klass,1);for(const changed of [{...row,form:'okand'},{...row,resolved:false},{...row,candidates:2}])assert.throws(()=>validateGroupResolution([changed]));
 assert.throws(()=>validateGroupResolution([row,{...row,group_key:'klass:stable-class'}]),/resolved_group_collision/);
 assert.equal(validateGroupResolution([row,{...row,day:'2027-09-02'}]).total,2);
});
test('only the identified null-hash approved row may freeze its OLD hash and trigger timestamp',()=>{
 const before={id:'year',status:'faststalld',content_hash:null,updated_at:'old',note:'kept',group_key:'kept'};
 const after={...before,content_hash:'old-effective-hash',updated_at:'transaction-time'};
 assert.doesNotThrow(()=>assertCalendarRowPreserved(before,after,{eligible:true,oldHash:'old-effective-hash',updatedAtValid:true}));
 for(const changed of [{...after,content_hash:'new-hash'},{...after,note:'changed'},{...after,group_key:'changed'}])assert.throws(()=>assertCalendarRowPreserved(before,changed,{eligible:true,oldHash:'old-effective-hash',updatedAtValid:true}));
 assert.throws(()=>assertCalendarRowPreserved(before,after,{eligible:true,oldHash:'old-effective-hash',updatedAtValid:false}));
 assert.throws(()=>assertCalendarRowPreserved(before,after,{eligible:false}));
});
test('stored hashes, nonapproved rows and no-group rows have no broad column exception',()=>{
 for(const before of [{status:'faststalld',content_hash:'stored',updated_at:'old'},{status:'utkast',content_hash:null,updated_at:'old'}]){
  assert.doesNotThrow(()=>assertCalendarRowPreserved(before,{...before},{eligible:false}));assert.throws(()=>assertCalendarRowPreserved(before,{...before,updated_at:'changed'},{eligible:false}));
  assert.throws(()=>assertCalendarRowPreserved(before,{...before,content_hash:'new'},{eligible:true,oldHash:'new',updatedAtValid:true}));
 }
});
