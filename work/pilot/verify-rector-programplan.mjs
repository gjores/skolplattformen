#!/usr/bin/env node
// Actual SQL/Worker-role proof in an owned schema-only database. No live rows
// are copied; all fixtures/migration are rolled back before the copy is dropped.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createNamedTimplanSnapshot,schemaFingerprint} from './named-timplan-snapshot.mjs';
import {allPublicHashes,copyCommand,privateOutput} from './verify-atomic-cohort-copy.mjs';
import {approvedClassFixture,sourceHashes as fixtureSources} from './verify-class-timplans.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
export const migration='supabase/migrations/20261016100000_rector_programplan_creation.sql';
const rollback=Error('expected_rector_programplan_rollback');
export function rectorSources(){
 const paths=new Set([...Object.keys(fixtureSources()),migration,'work/pilot/verify-rector-programplan.mjs','work/pilot/named-timplan-snapshot.mjs','work/pilot/verify-atomic-cohort-copy.mjs','supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql','web/lib/programplan-catalog.generated.json']);
 const visited=new Set(),ts=createRequire(resolve(root,'web/package.json'))('typescript');
 const visit=file=>{
  if(visited.has(file))return;visited.add(file);paths.add(file);
  const absolute=resolve(root,file);assert.ok(absolute.startsWith(root));
  const syntax=ts.createSourceFile(absolute,readFileSync(absolute,'utf8'),ts.ScriptTarget.Latest,true);
  for(const statement of syntax.statements){
   if(!(ts.isImportDeclaration(statement)||ts.isExportDeclaration(statement)))continue;
   const specifier=statement.moduleSpecifier;if(!specifier||!ts.isStringLiteral(specifier)||!specifier.text.startsWith('.'))continue;
   const dependency=relative(root,resolve(dirname(absolute),specifier.text));
   if(/\.(?:mjs|js|ts)$/u.test(dependency))visit(dependency);
  }
 };
 for(const file of [...paths])if(/\.(?:mjs|js|ts)$/u.test(file))visit(file);
 return Object.fromEntries([...paths].sort().map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
}
export async function rectorScenarios(tx,checks,f){
 const {id,actor,roles}=f;
 const ok=name=>checks.push({name,ok:true});
 const worker=fn=>tx.savepoint(async s=>{await s`set local role skolplattform_worker`;try{return await fn(s);}finally{await s`reset role`;}});
 const deny=async(name,fn,codes=['42501'])=>{const before=await allPublicHashes(tx);let error;try{await worker(fn);}catch(e){error=e;}assert.ok(error,name);assert.ok(codes.includes(error.code),`${name}: unexpected ${error.code}`);assert.deepEqual(await allPublicHashes(tx),before);ok(name);};
 const create=(s,q)=>(s`select public.phase5_create_programplan_education(${q.commandId},${q.unitId},${q.name},${q.localCode},${q.cohort},${s.json(q.basisReference)}) result`).then(r=>r[0].result);
 const status=(s,q)=>(s`select public.phase5_programplan_education_status(${q.commandId}) result`).then(r=>r[0].result);
 const [source]=await tx`select * from public.point_plans where id=${f.programId}`;
 const basis=source.basis_reference,terms=source.term_distribution;
 const request={commandId:randomUUID(),unitId:id(30),name:'Syntetisk rektorsplan',localCode:null,cohort:'Syntetisk framtida kull',basisReference:basis};
 const selection=await worker(s=>s`select public.phase5_programplan_selection(${id(30)},null,null) result`);
 assert.equal(selection[0].result.canCreateEducation,true);assert.deepEqual(selection[0].result.units.map(u=>u.id),[id(30)]);ok('rector selection advertises creation only with own school list');
 await deny('selection rejects another school',s=>s`select public.phase5_programplan_selection(${id(31)},null,null)`);
 const created=await worker(s=>create(s,request));
 assert.equal(created.plan.version,1);assert.equal(created.plan.status,'utkast');assert.equal(created.plan.revision,0);assert.equal(created.education.unitId,id(30));ok('rector creates education and first draft through actual Worker role');
 assert.deepEqual((await tx`select unit_id from public.offering_units where offering_id=${created.education.id}`).map(r=>r.unit_id),[id(30)]);
 const [stored]=await tx`select status,decided_on,decided_by from public.point_plans where id=${created.plan.id}`;
 assert.deepEqual(stored,{status:'utkast',decided_on:null,decided_by:null});ok('new rector plan has one school and no approval metadata');
 const [event]=await tx`select actor_role,actor_identity_id,assignment_id from public.organisation_events where action='programplan_education_created' and assignment_id=${roles.principal} order by created_at desc limit 1`;
 assert.equal(event.actor_role,'rektor');assert.equal(event.actor_identity_id,id(11));assert.equal(event.assignment_id,roles.principal);ok('organisation history records actual rector identity and role');
 const [planEvent]=await tx`select actor_role,actor_identity_id from public.point_plan_events where point_plan_id=${created.plan.id}`;assert.equal(planEvent.actor_role,'rektor');assert.equal(planEvent.actor_identity_id,id(11));ok('draft history records actual rector role');
 const replay=await worker(s=>create(s,request));assert.equal(replay.replayed,true);assert.equal(replay.plan.id,created.plan.id);assert.equal((await worker(s=>status(s,request))).status,'created');ok('rector exact create retry and status return immutable receipt');
 await deny('rector cannot create at another school',s=>create(s,{...request,commandId:randomUUID(),unitId:id(31)}));
 await deny('create receipt rejects different request',s=>create(s,{...request,name:'ANNAT'}),['40001']);
 await deny('past start remains denied',s=>create(s,{...request,commandId:randomUUID(),name:'FÖRR',basisReference:{...basis,startedOn:'2020-08-01'}}),['22023']);
 await deny('unknown pinned catalog remains denied',s=>create(s,{...request,commandId:randomUUID(),name:'KATALOG',basisReference:{...basis,catalogId:'sha256:'+'a'.repeat(64)}}),['22023']);
 await worker(s=>s`select public.phase5_write_programplan_terms(${created.plan.id},0,${s.json(terms)})`);
 const decide=async(s,planId,action)=>{const b=(await s`select public.phase5_plan_decision_basis('programplan',${planId}) result`)[0].result,d=b.detail??b;return(await s`select public.phase5_plan_decision_command(${s.json({kind:'programplan',planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)})}) result`)[0].result;};
 await worker(s=>decide(s,created.plan.id,'submit'));ok('rector fills and submits own newly created plan');
 await deny('rector cannot approve newly created plan',s=>decide(s,created.plan.id,'approve'));
 await actor('hm');await worker(s=>decide(s,created.plan.id,'approve'));assert.equal((await tx`select status from public.point_plans where id=${created.plan.id}`)[0].status,'faststalld');ok('head organiser approves rector draft through unchanged decision command');
 // Shared source primary school is outside principal2's mandate.
 await tx`select public.phase5_change_programplan_education(${id(46)},0,'units',${tx.json({unitIds:[id(30),id(31)]})})`;
 const q={commandId:randomUUID(),sourcePlanId:f.programId,expectedSourceRevision:source.revision,expectedEducationRevision:1,unitId:id(31),name:'Syntetisk rektorskopia',localCode:null,cohort:'Syntetisk nästa kull',basisReference:{...basis,startedOn:`${Number(basis.startedOn.slice(0,4))+1}-08-17`}};
 const sourceBefore=await tx`select to_jsonb(p) value from public.point_plans p where id=${f.programId}`;
 const sourceSchools=await tx`select to_jsonb(u) value from public.offering_units u where offering_id=${id(46)} order by unit_id`;
 await actor('principal2');
 const copied=await worker(s=>copyCommand(s,q));assert.equal(copied.education.unitId,id(31));assert.equal(copied.plan.status,'utkast');assert.equal(copied.plan.version,1);ok('rector copies shared plan from another primary school to own selected school');
 assert.deepEqual((await tx`select unit_id from public.offering_units where offering_id=${copied.education.id}`).map(r=>r.unit_id),[id(31)]);assert.deepEqual((await tx`select term_distribution from public.point_plans where id=${copied.plan.id}`)[0].term_distribution,terms);ok('rector copy includes exact terms and only own school');
 assert.deepEqual(await tx`select to_jsonb(p) value from public.point_plans p where id=${f.programId}`,sourceBefore);assert.deepEqual(await tx`select to_jsonb(u) value from public.offering_units u where offering_id=${id(46)} order by unit_id`,sourceSchools);ok('shared source content and school links remain unchanged');
 for(const table of ['school_classes','pupil_placements','timplans','programplan_unit_packages'])assert.equal((await tx.unsafe(`select count(*)::integer n from public.${table} where offering_id=$1`,[copied.education.id]))[0].n,0);ok('copy does not copy pupils classes timplans or school packages');
 assert.equal((await worker(s=>copyCommand(s,q))).replayed,true);assert.equal((await worker(s=>copyCommand(s,q,true))).status,'created');ok('rector copy retry and status keep full request receipt');
 await deny('copy rejects primary school outside rector mandate',s=>copyCommand(s,{...q,commandId:randomUUID(),unitId:id(30)}));
 await deny('copy rejects missing selected school source link',s=>copyCommand(s,{...q,commandId:randomUUID(),sourcePlanId:created.plan.id,expectedSourceRevision:2,expectedEducationRevision:0}));
 await deny('copy still rejects stale source revision',s=>copyCommand(s,{...q,commandId:randomUUID(),expectedSourceRevision:900}),['40001']);
 await deny('copy still rejects stale education revision',s=>copyCommand(s,{...q,commandId:randomUUID(),expectedEducationRevision:900}),['40001']);
 await deny('copy receipt rejects another body',s=>copyCommand(s,{...q,name:'ÄNDRAD'},true),['40001']);
 await deny('rector cannot edit shared source school associations',s=>s`select public.phase5_change_programplan_education(${id(46)},1,'units',${s.json({unitIds:[id(31)]})})`);
 await actor('hm');const hmCopy=await worker(s=>copyCommand(s,{...q,commandId:randomUUID(),unitId:id(30),name:'Syntetisk huvudmannakopia'}));assert.deepEqual((await tx`select unit_id from public.offering_units where offering_id=${hmCopy.education.id} order by unit_id`).map(r=>r.unit_id),[id(30),id(31)]);ok('head organiser retains full multi-school cohort copying');
 await actor('admin');for(const [label,fn] of [['create',s=>create(s,{...request,commandId:randomUUID()})],['create status',s=>status(s,request)],['copy',s=>copyCommand(s,q)],['copy status',s=>copyCommand(s,q,true)]])await deny('administrator cannot '+label,fn);
 // Audit errors must roll the entire new graph back.
 await actor('principal2');
 await tx.unsafe(`create function pg_temp.fail_rector_audit() returns trigger language plpgsql as $$begin if new.customer_id='${id(1)}' and new.action in ('programplan_education_created','programplan_education_copied') then raise exception 'synthetic audit failure' using errcode='55000';end if;return new;end$$;create trigger fail_rector_audit before insert on public.security_events for each row execute function pg_temp.fail_rector_audit();`);
 await deny('create audit failure rolls back all rows',s=>create(s,{...request,commandId:randomUUID(),unitId:id(31),name:'Syntetiskt auditfel'}),['55000']);
 await tx.unsafe(`create or replace function pg_temp.fail_rector_audit() returns trigger language plpgsql as $$begin if new.customer_id='${id(1)}' and new.action='programplan_education_copied' then raise exception 'synthetic late audit failure' using errcode='55000';end if;return new;end$$;`);
 await deny('copy final audit failure rolls back all rows',s=>copyCommand(s,{...q,commandId:randomUUID(),name:'Syntetiskt kopieauditfel'}),['55000']);await tx`drop trigger fail_rector_audit on public.security_events`;
 // Removing the selected source school invalidates even a completed copy receipt.
 await tx`delete from public.offering_units where offering_id=${id(46)} and unit_id=${id(31)}`;
 await deny('removed selected source school blocks copy replay',s=>copyCommand(s,q));await deny('removed selected source school blocks copy status',s=>copyCommand(s,q,true));
 await tx`insert into public.offering_units(offering_id,unit_id,organizer_id) values(${id(46)},${id(31)},${id(2)})`;
 // Mandate removal is performed by fixture owner only; commands run as Worker.
 await tx`delete from public.mandate_units where assignment_id=${roles.principal2} and unit_id=${id(31)}`;
 await deny('lost school mandate blocks copy replay',s=>copyCommand(s,q));await deny('lost school mandate blocks copy status',s=>copyCommand(s,q,true));
 await actor('principal');await tx`delete from public.mandate_units where assignment_id=${roles.principal} and unit_id=${id(30)}`;
 await deny('lost school mandate blocks create replay',s=>create(s,request));await deny('lost school mandate blocks create status',s=>status(s,request));
 await tx`insert into public.mandate_units(assignment_id,customer_id,organizer_id,unit_id) values(${roles.principal},${id(1)},${id(2)},${id(30)})`;
 await tx`update public.access_assignments set ended_at=clock_timestamp() where id=${roles.hm}`;
 await deny('revoked parent mandate blocks create replay',s=>create(s,request));await deny('revoked parent mandate blocks create status',s=>status(s,request));
 await tx`update public.access_assignments set ended_at=null where id=${roles.hm}`;
 await tx`update public.app_sessions set revoked_at=clock_timestamp() where id=${id(81)}`;
 await deny('revoked session blocks creation',s=>create(s,{...request,commandId:randomUUID()}));
 await tx`update public.app_sessions set revoked_at=null where id=${id(81)}`;
 await tx`update public.access_assignments set ended_at=clock_timestamp() where id=${roles.principal}`;
 await deny('revoked assignment blocks creation',s=>create(s,{...request,commandId:randomUUID()}));
}
export async function verifyRectorProgramplan(out){
 assert.ok(!existsSync(out),'Report already exists');
 const report={kind:'rector-programplan-schema-only-sql',status:'FAIL',sources:rectorSources(),checks:[],limitations:['Synthetic fixtures and actual PostgreSQL Worker role only; HTTP/OIDC/browser and permanent installation are separate']};
 writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600,flag:'wx'});let snapshot;
 try{
  snapshot=await createNamedTimplanSnapshot();report.snapshot=snapshot.provenance;
  const before=await allPublicHashes(snapshot.db),schemaBefore=await schemaFingerprint(snapshot.db);report.beforeRows=before;report.beforeSchemaFingerprint=schemaBefore;
  try{await snapshot.db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   const f=await approvedClassFixture(tx,'SA25');report.migrationBeforeRows=await allPublicHashes(tx);
   const acl=await tx`select p.oid::regprocedure::text signature,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace order by 1`;
   await tx.unsafe(readFileSync(resolve(root,migration),'utf8'));report.migrationAfterRows=await allPublicHashes(tx);assert.deepEqual(report.migrationAfterRows,report.migrationBeforeRows);report.installedSchemaFingerprint=await schemaFingerprint(tx);report.checks.push({name:'migration preserves every existing table row',ok:true});
   assert.deepEqual(await tx`select p.oid::regprocedure::text signature,p.proacl::text acl,p.proowner::text owner from pg_proc p where p.pronamespace='public'::regnamespace order by 1`,acl);report.checks.push({name:'all function signatures owners and grants unchanged',ok:true});
   report.grantsUnchanged=true;await rectorScenarios(tx,report.checks,f);throw rollback;
  });}catch(error){if(error!==rollback)throw error;}
  report.afterRows=await allPublicHashes(snapshot.db);report.afterSchemaFingerprint=await schemaFingerprint(snapshot.db);assert.deepEqual(report.afterRows,before);assert.equal(report.afterSchemaFingerprint,schemaBefore);report.checks.push({name:'all fixture rows migration DDL and grants rolled back exactly',ok:true});
  report.finalSources=rectorSources();assert.deepEqual(report.finalSources,report.sources);report.rollback=true;report.status='PASS';
 }catch(error){report.failure={code:error.code??'assertion',message:error.message};}
 finally{if(snapshot)try{report.cleanup=await snapshot.cleanup();}catch(error){report.status='FAIL';report.cleanup={status:'failed',code:error.code??'cleanup_failed'};}writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});}
 console.log(`${report.status}: ${report.checks.length} rector programplan SQL checks`);if(report.status!=='PASS')process.exitCode=1;return report;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await verifyRectorProgramplan(privateOutput(process.argv.slice(2)));
