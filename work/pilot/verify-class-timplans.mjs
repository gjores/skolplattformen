#!/usr/bin/env node
import assert from 'node:assert/strict';
import {createHash,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {assertTarget} from './verify-target.mjs';
import {decisionFixtureSource,decisionBusinessHashes} from './verify-plan-decision-flow.mjs';
import {vocationalTables,vocationalDatabaseFingerprint} from './apply-vocational-plan-decisions.mjs';
import {vocationalFixture} from './vocational-plan-fixture.mjs';
import {defaultProgramplanChoiceBlocks} from '../../web/lib/programplan-choice-blocks.ts';
import {programplanTermRows,programplanLevelRanks,suggestProgramplanTerms} from '../../web/lib/programplan-terms.ts';
import {nextCohortStart} from '../../web/lib/programplan-lifecycle.ts';
import {parseClassPlanUnderlag,parseClassPlanCreateReply,parseClassPlanLinkReply} from '../../web/lib/class-timplan.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),rollback=Error('class_rollback');
export const migrationName='20261012210000_class_timplan_flow.sql';
export const sourcePaths=['supabase/migrations/'+migrationName,'supabase/migrations/20261012240000_class_start_calendar.sql','supabase/tests/phase5_class_timplan_flow.test.sql','web/lib/class-timplan.ts','web/lib/server/class-timplan.ts','web/app/api/klasser/underlag/route.ts','web/app/api/klasser/skapa/route.ts','web/app/api/klasser/koppla/route.ts','work/pilot/verify-class-timplans.mjs','work/pilot/verify-target.mjs','work/pilot/verify-plan-decision-flow.mjs','work/pilot/verify-programplan-locks.mjs','work/pilot/apply-vocational-plan-decisions.mjs','work/pilot/vocational-plan-fixture.mjs','supabase/tests/phase5_programplan_drafts.test.sql'];
export const sourceHashes=()=>Object.fromEntries(sourcePaths.map(p=>[p,createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex')]));
export async function classBusinessHashes(db,installed=false){const r=await decisionBusinessHashes(db,vocationalTables.filter(t=>t!=='class_timplans'));const [v]=await db.unsafe(`select count(*)::integer count,md5(coalesce(string_agg(r::text,'' order by r::text),'')) hash from (select to_jsonb(c)${installed?"-'class_id'-'revision'":''} r from public.class_timplans c) s`);r.class_timplans=v;return r;}
export async function classFixture(tx){
 const prefix=randomUUID().slice(0,8),id=n=>`${prefix}-0000-4000-8000-${String(n).padStart(12,'0')}`;
 const fixtureSource=decisionFixtureSource(prefix).replace(`"membershipId":"${id(22)}","function":"rektor","scopeKind":"school","unitIds":["${id(30)}"]`,`"membershipId":"${id(22)}","function":"rektor","scopeKind":"school","unitIds":["${id(31)}"]`);
 assert.notEqual(fixtureSource,decisionFixtureSource(prefix));await tx.unsafe(fixtureSource);
 const roles=Object.fromEntries((await tx`select name,id from programplan_roles`).map(r=>[r.name,r.id]));
 const actor=async name=>{const [i,m,s]={hm:[10,20,80],principal:[11,21,81],principal2:[12,22,82],admin:[13,23,83]}[name];for(const[key,value]of Object.entries({customer_id:id(1),organizer_id:id(2),identity_id:id(i),membership_id:id(m),session_id:id(s),assignment_id:roles[name],correlation_id:randomUUID()}))await tx`select set_config(${`app.${key}`},${value},true)`;};
 await actor('hm');await tx`insert into public.school_unit_types(unit_id,school_type) values(${id(30)},'GY'),(${id(31)},'GY')`;
 return{id,actor,roles};
}
export async function approvedClassFixture(tx,code='BF25'){
 const f=await classFixture(tx),{id,actor}=f,catalog=JSON.parse(readFileSync(resolve(root,'web/lib/programplan-catalog.generated.json'),'utf8'));
 const [{catalog_id:catalogId}]=await tx`select catalog_id from public.point_plans where id=${id(50)}`;
 let reference,rows,terms;
 if(code==='SA25'){const program=catalog.programs.find(p=>p.code==='SA25'&&p.version===4);reference={catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM2000X',points:100}],choiceBlocks:defaultProgramplanChoiceBlocks(program,'SABEP')};rows=programplanTermRows(program,reference);terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(program));}
 else({reference,rows,terms}=vocationalFixture(catalog,code,catalogId));
 await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code) values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetisk klass','Syntetisk framtida kull',${reference.programRef.code},${reference.orientationCode})`;
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
}
async function scenarios(tx,checks,code){
 const f=await approvedClassFixture(tx,code),{actor,planId,year,id}=f;
 const ok=name=>checks.push({name:`${code}: ${name}`,ok:true});
 const denied=async(name,fn,codes=['42501','40001','22023','23505','55000'])=>{let error;try{await tx.savepoint(fn);}catch(e){error=e;}assert.ok(error,name);assert.ok(codes.includes(error.code),`${name}: ${error.code}`);ok(name);};
 const read=async(p=planId,y=year)=>parseClassPlanUnderlag((await tx`select public.phase5_class_underlag(${p},${y}) result`)[0].result,{planId:p,schoolYear:y});
 const before=await read();assert.equal(before.canManage,true);assert.equal(before.plan.startYear,year);ok('exact frozen cohort and approved writable source');
 const create={commandId:randomUUID(),planId,expectedPlanRevision:before.plan.revision,name:'SYN27A',startYear:year};
 const command=async(q)=>(await tx`select public.phase5_class_command(${tx.json(q)}) result`)[0].result;
 const c=parseClassPlanCreateReply(await command({operation:'create',...create}),create);ok('create permanent class');
 assert.equal((await command({operation:'create',...create})).replayed,true);ok('create retry keeps same ID');
 await denied('duplicate name cohort',s=>s`select public.phase5_class_command(${s.json({operation:'create',...create,commandId:randomUUID()})})`);
 await denied('reuse command different body',s=>s`select public.phase5_class_command(${s.json({operation:'create',...create,name:'OTHER'})})`);
 for(const role of ['hm','principal2']){await actor(role);await denied(role+' cannot create',s=>s`select public.phase5_class_command(${s.json({operation:'create',...create,commandId:randomUUID(),name:'OTHER'})})`);}
 await actor('hm');assert.equal((await read()).canManage,false);ok('HM reads only');await actor('admin');
 const link={commandId:randomUUID(),classId:c.id,schoolYear:year,planId,expectedPlanRevision:before.plan.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};
 const linked=parseClassPlanLinkReply(await command({operation:'link',...link}),link);assert.equal(linked.revision,0);ok('administrator explicitly links exact approved version');
 assert.equal((await command({operation:'link',...link})).replayed,true);ok('link retry');
 const preservationTables=['school_classes','class_timplans','class_plan_commands','pupils','pupil_placements','pupil_class_memberships'];
 const beforeEarlyYear=await decisionBusinessHashes(tx,preservationTables);
 const early=await read(planId,year-1);assert.equal(early.canManage,false);assert.ok(early.blockers.some(b=>b.includes('läsår')));
 await denied('SQL rejects year before frozen cohort start',s=>s`select public.phase5_class_command(${s.json({operation:'link',...link,commandId:randomUUID(),schoolYear:year-1})})`,['22023']);
 const afterEarly=await read(planId,year-1);assert.deepEqual(afterEarly.linkedClasses,early.linkedClasses);
 assert.deepEqual(await decisionBusinessHashes(tx,preservationTables),beforeEarlyYear);ok('year-before-start denial preserves complete class links receipts pupils placements memberships');
 await denied('stale link cannot overwrite',s=>s`select public.phase5_class_command(${s.json({operation:'link',...link,commandId:randomUUID()})})`);
 for(const change of [{schoolYear:year+1,columnId:'ar1'},{schoolYear:year+3,columnId:'ar3'},{expectedPlanRevision:0},{classId:id(30)}])await denied('wrong year column revision or class',s=>s`select public.phase5_class_command(${s.json({operation:'link',...link,commandId:randomUUID(),...change})})`);
 await actor('principal');
 const second={...link,commandId:randomUUID(),schoolYear:year+1,columnId:'ar2'};await command({operation:'link',...second});assert.equal((await read(planId,year+1)).classes.find(x=>x.id===c.id).link.columnId,'ar2');ok('year two persists separate explicit link');
 await tx.savepoint(async s=>{const [p]=await s`select * from public.timplans where id=${planId}`;for(const [date,expected]of [[`${year}-06-30`,year-1],[`${year}-07-01`,year]]){const modified={...p,gym_basis:{...p.gym_basis,basisReference:{...p.gym_basis.basisReference,startedOn:date}}};assert.equal((await s`select public.phase5_class_start_year(jsonb_populate_record(null::public.timplans,${s.json(modified)})) y`)[0].y,expected);}ok('frozen June July boundary independent from offering date');});
 const allBefore=await decisionBusinessHashes(tx,['school_classes','class_timplans','class_plan_commands']);
 await tx.unsafe(`create function pg_temp.fail_class_audit() returns trigger language plpgsql as $$begin if new.customer_id='${id(1)}' and new.action='class_created' then raise exception 'synthetic';end if;return new;end$$;create trigger fail_class_audit before insert on public.security_events for each row execute function pg_temp.fail_class_audit();`);
 await denied('audit failure aborts class and receipt',s=>s`select public.phase5_class_command(${s.json({operation:'create',...create,commandId:randomUUID(),name:'AUDITFAIL'})})`,['55000']);await tx`drop trigger fail_class_audit on public.security_events`;assert.deepEqual(await decisionBusinessHashes(tx,['school_classes','class_timplans','class_plan_commands']),allBefore);ok('audit failure preserves class links receipts');
 const latest=await read();assert.equal(latest.linkedClasses.length,2);assert.equal(latest.linkedClasses.every(l=>l.classId===c.id&&!l.legacy),true);ok('all school years remain visible');
 const [{revision:sourceRevision}]=await tx`select revision from public.point_plans where id=${f.programId}`;
 const g2=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${f.programId},${sourceRevision},0,${id(30)},${planId},${before.plan.revision}) result`)[0].result;
 await denied('draft version cannot be linked',s=>s`select public.phase5_class_command(${s.json({operation:'link',...link,commandId:randomUUID(),planId:g2.reply.id,expectedPlanRevision:0,expectedLinkRevision:0,previousPlanId:planId})})`);
 await f.decision('timplan',g2.reply.id,'submit');await actor('hm');await f.decision('timplan',g2.reply.id,'approve');await actor('principal');
 const older=await read();assert.equal(older.plan.status,'ersatt');assert.equal(older.canManage,false);assert.equal(older.linkedClasses.length,2);await actor('admin');assert.equal((await command({operation:'link',...link})).replayed,true);await actor('principal');ok('new approval preserves both old links and old command receipt');
 const newer=await read(g2.reply.id);const replacement={...link,commandId:randomUUID(),planId:g2.reply.id,expectedPlanRevision:newer.plan.revision,previousPlanId:planId,expectedLinkRevision:0};
 await command({operation:'link',...replacement});assert.equal((await read()).linkedClasses.length,1);assert.equal((await read(g2.reply.id)).linkedClasses.length,1);ok('explicit revision checked switch changes only chosen school year');
 const legacyCreate={...create,commandId:randomUUID(),planId:g2.reply.id,expectedPlanRevision:newer.plan.revision,name:'LEGACY'};
 const legacyClass=await command({operation:'create',...legacyCreate});
 await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id) values(${id(30)},'LEGACY',${year},${g2.reply.id},'ar1')`;
 assert.equal((await read(g2.reply.id)).classes.find(c=>c.id===legacyClass.id).link.legacy,true);ok('legacy named link remains visible and unidentified');
 const adopt={...replacement,commandId:randomUUID(),classId:legacyClass.id,previousPlanId:g2.reply.id};
 await denied('legacy link cannot be silently adopted',s=>s`select public.phase5_class_command(${s.json({operation:'link',...adopt,previousPlanId:null,expectedLinkRevision:null})})`);
 await command({operation:'link',...adopt});assert.equal((await read(g2.reply.id)).classes.find(c=>c.id===legacyClass.id).link.legacy,false);ok('legacy adoption explicit exact previous plan revision');
 await tx.savepoint(async s=>{const [p]=await s`select * from public.timplans where id=${g2.reply.id}`;const [o]=await s`select * from public.offerings where id=${p.offering_id}`;const changed={...o,start_year:year+1};const blockers=(await s`select public.phase5_class_blockers(jsonb_populate_record(null::public.timplans,${s.json(p)}),jsonb_populate_record(null::public.offerings,${s.json(changed)})) b`)[0].b;assert.ok(blockers.some(b=>b.includes('kullstart')));ok('current offering cohort mismatch blocks instead of changing frozen year');});

}
async function appliedDefinitions(db){
 // Compare installed function bodies and execution properties with the exact
 // current migration sources, without executing any migration DDL.
 const expected=new Map();
 for(const migration of [migrationName,'20261012240000_class_start_calendar.sql']){
  const source=readFileSync(resolve(root,'supabase/migrations',migration),'utf8');
  assert.equal((await db`select version from supabase_migrations.schema_migrations where version=${migration.slice(0,14)}`).length,1,'REFUSED: required class migration missing');
  for(const match of source.matchAll(/create(?: or replace)? function public\.(\w+)\(([\s\S]*?)\) returns ([\s\S]*?) as \$\$([\s\S]*?)\$\$;/g)){
   const [,name,args,header,body]=match;
   const signature=`public.${name}(${args?args.split(',').map(arg=>arg.trim().split(/\s+/)[1]).join(','):''})`;
   expected.set(signature,{body,definer:header.includes('security definer'),volatility:header.includes(' stable ')?'s':'v'});
  }
 }
 assert.equal(expected.size,8,'REFUSED: incomplete source definition extraction');
 const hashes={};
 for(const[signature,source]of expected){
  const [actual]=await db`select p.prosrc,p.prosecdef,p.provolatile,p.proconfig,l.lanname,pg_get_functiondef(p.oid) definition,p.proacl::text acl,p.proowner::text owner from pg_proc p join pg_language l on l.oid=p.prolang where p.oid=to_regprocedure(${signature})`;
  assert.ok(actual,`REFUSED: missing ${signature}`);assert.equal(actual.prosrc,source.body,`REFUSED: changed ${signature}`);
  assert.equal(actual.prosecdef,source.definer);assert.equal(actual.provolatile,source.volatility);assert.equal(actual.lanname,'plpgsql');
  assert.deepEqual(actual.proconfig,['search_path=pg_catalog, public']);
  hashes[signature]=createHash('sha256').update(JSON.stringify(actual)).digest('hex');
 }
 return hashes;
}
async function allBusinessHashes(db){return decisionBusinessHashes(db,(await db`select tablename from pg_tables where schemaname='public' order by tablename`).map(r=>r.tablename));}
async function main(){
 const args=process.argv.slice(2),applied=args[0]==='--applied';if(applied)args.shift();
 assert.equal(args.length,2,'REFUSED: use [--applied] --out /private/tmp/name.json');assert.equal(args[0],'--out');
 const out=resolve(args[1]);assert.ok(out.startsWith('/private/tmp/')&&out.endsWith('.json'),'REFUSED: private report required');
 const sources=sourceHashes(),target=await assertTarget('protected'),db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
 const checks=[];let before,after,beforeFingerprint,afterFingerprint,definitions,failure;
 const snapshot=applied?allBusinessHashes:classBusinessHashes;
 try{
  before=await snapshot(db);beforeFingerprint=await vocationalDatabaseFingerprint(db);
  try{await db.begin(async tx=>{
   await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='60s'`;
   assert.equal((await tx`select pg_try_advisory_xact_lock(5520) locked`)[0].locked,true);
   if(applied){definitions=await appliedDefinitions(tx);checks.push({name:'installed class definitions match source without migration DDL',ok:true});}
   else{
    assert.equal((await tx`select version from supabase_migrations.schema_migrations where version>=${migrationName.slice(0,14)}`).length,0,'REFUSED: installed schema requires --applied');
    await tx.unsafe(readFileSync(resolve(root,'supabase/migrations',migrationName),'utf8'));
    await tx.unsafe(readFileSync(resolve(root,'supabase/tests/phase5_class_timplan_flow.test.sql'),'utf8'));
    assert.deepEqual(await classBusinessHashes(tx,true),before);checks.push({name:'migration preserves complete existing business rows',ok:true});
   }
   for(const code of ['SA25','BF25'])await tx.savepoint(async s=>{await scenarios(s,checks,code);throw rollback;}).catch(e=>{if(e!==rollback)throw e;});
   throw rollback;
  });}catch(e){if(e!==rollback)failure=e;}
  after=await snapshot(db);afterFingerprint=await vocationalDatabaseFingerprint(db);
  assert.deepEqual(after,before);assert.equal(beforeFingerprint,afterFingerprint);
  if(applied&&definitions)assert.deepEqual(await appliedDefinitions(db),definitions);
  checks.push({name:'all business data and full DDL ACL journal rolled back',ok:true});
 }catch(e){failure=e;}finally{await db.end({timeout:5});}
 const finalSourceHashes=sourceHashes();if(JSON.stringify(sources)!==JSON.stringify(finalSourceHashes))failure=Error('Source changed');
 const report={kind:'class-timplans-rollback',mode:applied?'applied':'migration',target:'protected',status:failure?'FAIL':'PASS',rollback:true,sourceHashes:sources,finalSourceHashes,definitions,beforeHashes:before,afterHashes:after,beforeFingerprint,afterFingerprint,checks,failure:failure?{code:failure.code??'ASSERTION',message:failure.message?.split('\n')[0]}:null};
 writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.status}: ${checks.length} class SQL checks`);if(failure)process.exitCode=1;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
