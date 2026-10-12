#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,copyFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {classFixture} from './verify-class-timplans.mjs';
import {decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {vocationalTables,vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {vocationalFixture} from './vocational-plan-fixture.mjs';
import {defaultProgramplanChoiceBlocks} from '../../web/lib/programplan-choice-blocks.ts';
import {programplanTermRows,programplanLevelRanks,suggestProgramplanTerms} from '../../web/lib/programplan-terms.ts';
import {nextCohortStart} from '../../web/lib/programplan-lifecycle.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('calendar_rollback');
const migrationName='20261012240000_class_start_calendar.sql',version=migrationName.slice(0,14);
const sourcePaths=['supabase/migrations/'+migrationName,'work/pilot/verify-class-start-calendar.mjs','work/pilot/verify-class-timplans.mjs','web/lib/class-timplan.ts'];
const hashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
async function springFixture(tx,code='SA25'){
 const f=await classFixture(tx),{id,actor}=f,catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
 const [{catalog_id:catalogId}]=await tx`select catalog_id from public.point_plans where id=${id(50)}`;
 let reference,rows,terms;
 if(code==='SA25'){const program=catalog.programs.find(p=>p.code==='SA25'&&p.version===4);reference={catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM2000X',points:100}],choiceBlocks:defaultProgramplanChoiceBlocks(program,'SABEP')};rows=programplanTermRows(program,reference);terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(program));}
 else({reference,rows,terms}=vocationalFixture(catalog,code,catalogId));
 reference.startedOn=nextCohortStart().slice(0,4)+'-01-15';
 terms=terms.map(t=>({...t,points:[0,t.points[0]+t.points[1],...t.points.slice(2)]}));
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetisk klass','Syntetisk framtida kull',${reference.programRef.code},${reference.orientationCode},${Number(reference.startedOn.slice(0,4))})`;
 const created=(await tx`select public.phase5_create_programplan_draft(${id(46)},0,${tx.json(reference)}) result`)[0].result;
 const programId=created.id;
 await actor('principal');await tx`select public.phase5_write_programplan_terms(${programId},0,${tx.json(terms)})`;
 const decision=async(kind,planId,action)=>{const b=(await tx`select public.phase5_plan_decision_basis(${kind},${planId}) result`)[0].result;const d=b.detail??b;
 return(await tx`select public.phase5_plan_decision_command(${tx.json({kind,planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)})}) result`)[0].result;};
 await decision('programplan',programId,'submit');await actor('hm');await decision('programplan',programId,'approve');
 await actor('principal');const [{revision:programRevision}]=await tx`select revision from public.point_plans where id=${programId}`;
 const g=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${programRevision},0,${id(30)},null,null) result`)[0].result;
 let revision=0;for(const row of rows){const hours=terms.find(t=>t.rowKey===row.key).points.map(p=>p>0?p:null);revision=(await tx`select public.phase5_write_gym_timplan_row(${g.reply.id},${revision},${row.key},${tx.json(hours)}) result`)[0].result.revision;}
 await decision('timplan',g.reply.id,'submit');await actor('hm');await decision('timplan',g.reply.id,'approve');await actor('principal');
 return{...f,programId,planId:g.reply.id,decision,year:Number(reference.startedOn.slice(0,4))-(reference.startedOn.slice(5,7)<'07'?1:0)};
}async function scenarios(tx,checks){
 for(const code of ['SA25','BF25']){
  await tx.savepoint(async tx=>{
   const f=await springFixture(tx,code),p=(await tx`select * from public.timplans where id=${f.planId}`)[0];
   const b=(await tx`select public.phase5_class_underlag(${f.planId},${f.year}) result`)[0].result;
   assert.equal(b.plan.startYear,f.year);assert.equal(b.canManage,true);assert.deepEqual(b.blockers,[]);checks.push({name:code+' actual January start draft to approved accepts calendar metadata and academic cohort',ok:true});
   const c=(await tx`select public.phase5_class_command(${tx.json({operation:'create',commandId:randomUUID(),planId:f.planId,expectedPlanRevision:p.revision,name:'SPRING',startYear:f.year})}) result`)[0].result;
   await tx`select public.phase5_class_command(${tx.json({operation:'link',commandId:randomUUID(),classId:c.id,schoolYear:f.year,planId:f.planId,expectedPlanRevision:p.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null})})`;
   const linked=(await tx`select public.phase5_class_underlag(${f.planId},${f.year}) result`)[0].result;assert.equal(linked.linkedClasses[0].columnId,'ar1');checks.push({name:code+' spring class links academic first year',ok:true});
   const o=(await tx`select * from public.offerings where id=${p.offering_id}`)[0];
   const blockers=(await tx`select public.phase5_class_blockers(jsonb_populate_record(null::public.timplans,${tx.json(p)}),jsonb_populate_record(null::public.offerings,${tx.json({...o,start_year:f.year})})) result`)[0].result;
   assert.ok(blockers.some(b=>b.includes('kullstart')));checks.push({name:code+' genuinely wrong calendar year still blocked',ok:true});
   throw rollback;
  }).catch(e=>{if(e!==rollback)throw e;});
 }
}
async function main(){
 const args=process.argv.slice(2),mode=args.shift(),opts={};assert.ok(['--verify','--apply'].includes(mode));for(let i=0;i<args.length;i+=2){assert.ok(['--evidence','--out'].includes(args[i])&&args[i+1]);opts[args[i]]=resolve(args[i+1]);}assert.ok(opts['--out']?.startsWith('/private/tmp/'));
 const sources=hashes(),source=readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8');let prior;if(mode==='--apply'){assert.ok(opts['--evidence']?.startsWith('/private/tmp/'));prior=JSON.parse(readFileSync(opts['--evidence'],'utf8'));assert.equal(prior.status,'PASS');assert.equal(prior.mode,'--verify');assert.ok(prior.rollbackRestored&&prior.checks.length===6);assert.deepEqual(prior.sourceHashes,sources);}
 const target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}}),tables=[...vocationalTables,'class_plan_commands'];
 const checks=[];let before,after,baselineFingerprint,afterMigrationFingerprint,finalFingerprint,failure,committed=false;
 try{before=await decisionBusinessHashes(db,tables);baselineFingerprint=await vocationalDatabaseFingerprint(db);if(prior)assert.equal(baselineFingerprint,prior.baselineFingerprint);
 try{await db.begin(async tx=>{await tx`set local statement_timeout='60s'`;assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);assert.equal(await vocationalDatabaseFingerprint(tx),baselineFingerprint);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${version}`).length,0);assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012210000'`).length,1);
 if(mode==='--apply')assert.equal((await tx`select version from supabase_migrations.schema_migrations where version='20261012230000'`).length,1,'REFUSED: ordered root migration230000 required');
 await tx.unsafe(source);afterMigrationFingerprint=await vocationalDatabaseFingerprint(tx);assert.deepEqual(await decisionBusinessHashes(tx,tables),before);if(prior)assert.equal(afterMigrationFingerprint,prior.afterMigrationFingerprint);
 if(mode==='--verify'){await scenarios(tx,checks);throw rollback;}assert.deepEqual(hashes(),sources);await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${version},'class_start_calendar',${[source]})`;
 });committed=true;}catch(e){if(e!==rollback)throw e;}
 after=await decisionBusinessHashes(db,tables);finalFingerprint=await vocationalDatabaseFingerprint(db);assert.deepEqual(after,before);if(!committed)assert.equal(finalFingerprint,baselineFingerprint);assert.deepEqual(hashes(),sources);if(committed)copyFileSync(resolve(root,'supabase/migrations',migrationName),resolve(target.workdir,'supabase/migrations',migrationName));
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const report={kind:'class-start-calendar',status:failure?'FAIL':'PASS',mode,committed,checks,sourceHashes:sources,beforeHashes:before,afterHashes:after,baselineFingerprint,afterMigrationFingerprint,finalFingerprint,rollbackRestored:!committed&&baselineFingerprint===finalFingerprint,failure:failure?{code:failure.code,message:failure.message}:null};writeFileSync(opts['--out'],JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.status}: class calendar ${mode}, ${checks.length} checks`);if(failure)process.exitCode=1;
}
await main();
