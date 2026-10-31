#!/usr/bin/env node
// Explicitly reproduce the missing pool-class intent in an owned PostgreSQL; never uses a live database.
import assert from 'node:assert/strict';
import {randomUUID,createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {createEphemeralMigratedDb,migrationFiles} from './ephemeral-migrated-db.mjs';
import {runTjanstYearCases,runTjanstYearBatchCases,runTjanstYearGroupCases,runTjanstYearLimitCases} from './verify-tjanst-year-commands.mjs';
import {runTjanstSharingCases} from './verify-tjanst-sharing.mjs';
import {createTjanstYearFixture,yearPreview,yearManual,yearRowPayload,yearSend} from './tjanst-year-fixtures.mjs';
import {planRead,planSend,planCommand} from './tjanst-fixtures.mjs';
import {parseElectiveRead,parseElectiveCommand} from '../../web/lib/elective-block-contract.ts';
import {parseYearPlanReadReply} from '../../web/lib/tjanst-contract.ts';
const reproduceOnly=process.argv.includes('--expect-bug'),migration='20261030115600_elective_applied_pool_intent.sql';
const original03='d47f695aee0d969d4d010068fef14c75ff6150b6d821b46181557625603e4953';
assert.equal(createHash('sha256').update(readFileSync(new URL('../../supabase/migrations/20261030112000_elective_tjanst_sources.sql',import.meta.url))).digest('hex'),original03);
const pinnedFiles=['supabase/migrations/20261030112000_elective_tjanst_sources.sql','supabase/migrations/20261030115500_elective_group_retirement.sql','supabase/migrations/'+migration,'work/pilot/verify-elective-pool-intent-sql.mjs','web/lib/tjanst-contract.ts','web/lib/tjanst-year-contract.ts','web/lib/elective-block-contract.ts'];
const sourceHashes=()=>Object.fromEntries(pinnedFiles.map(path=>[path,createHash('sha256').update(readFileSync(new URL('../../'+path,import.meta.url))).digest('hex')]));
const initialSources=sourceHashes();
const own=await createEphemeralMigratedDb({exclude:migrationFiles().filter(f=>f.slice(0,14)>='20261030115600')});
const report={kind:'ephemeral-elective-pool-intent-sql',provenance:own.provenance,checks:[],ok:false};
const check=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
async function deny(tx,name,run,hint){let error;try{await tx.savepoint(sp=>run(sp));}catch(e){error=e;}assert.equal(error?.code,'40001',error?.message??name);if(hint)assert.equal(error.hint,hint);check(name);}
const frozen=data=>Object.fromEntries(['version','classes','groups','rows','specials','joints','sharing'].filter(key=>key in data).map(key=>[key,data[key]]));
try{await own.db.begin(async tx=>{
 const s=await createTjanstYearFixture(tx),{f,unitId,schoolYear,g,people}=s,scope={unitId,schoolYear};
 await tx`set local session_replication_role=replica`;await tx`insert into public.timplan_cells(timplan_id,row_id,hours) values(${g.grPlan},'sprakval',${[100,100,100]}::smallint[])`;await tx`set local session_replication_role=origin`;await f.actor(tx,'principalA');
 const read=async()=>parseYearPlanReadReply(await planRead(tx,scope),scope),electiveRead=async()=>parseElectiveRead((await tx`select public.elective_block_read(${tx.json(scope)}) value`)[0].value.result,scope);
 const send=async(action,payload)=>{const r=await electiveRead();return(await tx`select public.elective_block_command(${tx.json(parseElectiveCommand({...scope,commandId:randomUUID(),expectedRevision:r.revision,action,payload}))}) value`)[0].value.result;};
 const sources=(await electiveRead()).sources.filter(x=>x.blockKind==='languageChoice'),a=sources.find(x=>x.classId===f.classes.group),b=sources.find(x=>x.classId===f.classes.other);assert.ok(a&&b);
 const groupId=randomUUID(),optionId=randomUUID(),blockId=randomUUID();
 let block={id:blockId,kind:'languageChoice',name:'Syntetisk pool A+B',startsOn:`${schoolYear}-07-01`,endsOn:`${schoolYear+1}-06-30`,sourceRefs:[a,b],options:[{id:optionId,name:'Syntetiskt franskt val',subjectCode:'GRGRMSP01',levelCode:'GRGRMSP01',language:'fr',points:null}],groups:[{id:groupId,optionId,name:'Endast klass A',startsOn:`${schoolYear}-07-01`,endsOn:`${schoolYear+1}-06-30`,classIds:[a.classId],sourceKeys:[a.sourceKey],estimatedPupils:10}]};
 await send('save_block',{expectedBlockRevision:null,block});let current=await read();assert.equal(current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey).organizationPending,undefined);check('unapplied block draft does not alter old class staffing');
 await send('apply_groups',{blockId,expectedBlockRevision:1});current=await read();const uncovered=current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey);assert.equal(uncovered.organizationPending,undefined);assert.equal(uncovered.needHt,3000);
 const support=await yearPreview(tx,{...scope,mode:'row',sourceKey:b.sourceKey,rowId:null});await yearSend(tx,unitId,schoolYear,'save_row',yearRowPayload(support,yearManual(support.candidates.find(c=>c.personId===people[0].personId)),{teacherHt:3000,teacherVt:3000}));
 const catalog=await yearPreview(tx,{...scope,mode:'catalog'});await yearSend(tx,unitId,schoolYear,'publish',{mutationContext:{baseVersionId:catalog.baseVersionId,expectedBasisHash:catalog.basisHash}});current=await read();assert.equal(current.version.status,'published');
 check('REPRODUCED before156: applied pool A+B with only A-group permits B aggregate assignment and publication');
 if(reproduceOnly)return;
 const published=current.version.id,history=await planRead(tx,{...scope,versionId:published}),hash=(await tx`select public.tjanst_version_hash(${published}) value`)[0].value;
 await tx.unsafe(readFileSync(new URL('../../supabase/migrations/'+migration,import.meta.url),'utf8'));
 current=await read();const rest=current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey);assert.equal(rest.organizationPending,true);assert.equal(rest.needHt,3000);assert.equal(rest.needVt,3000);assert.ok(current.classes.find(c=>c.classId===a.classId).needs.every(n=>n.sourceKey!==a.sourceKey));assert.equal(current.groups.length,1);check('explicit applied pool keeps uncovered B frame pending without duplicating organized A');
 const oldRow=current.rows.find(r=>r.sourceKey===b.sourceKey);assert.equal(oldRow.stale,true);assert.equal(oldRow.teacherHt,3000);check('existing aggregate assignment is preserved but needs explicit reconciliation');
 const blocked=await yearPreview(tx,{...scope,mode:'row',sourceKey:b.sourceKey,rowId:oldRow.id});const command=await planCommand(unitId,schoolYear,'save_row',current.revision,yearRowPayload(blocked,yearManual(blocked.candidates.find(c=>c.personId===people[0].personId)),{teacherHt:3000,teacherVt:3000}));await deny(tx,'direct assignment on unorganized pool frame is rejected',sp=>planSend(sp,command),'tjanst_stale_basis');
 assert.deepEqual(frozen(await planRead(tx,{...scope,versionId:published})),frozen(history));assert.equal((await tx`select public.tjanst_version_hash(${published}) value`)[0].value,hash);check('forward fix preserves published class/group mask and source content hash');
 const math=await yearPreview(tx,{...scope,mode:'row',sourceKey:s.key(),rowId:null});await yearSend(tx,unitId,schoolYear,'save_row',yearRowPayload(math,yearManual(math.candidates.find(c=>c.personId===people[0].personId)),{teacherHt:600,teacherVt:600}));current=await read();assert.ok(current.blockers.some(x=>x.code==='organization_pending'));
 await deny(tx,'uncovered applied-pool class blocks actual new publication',async sp=>{const c=await yearPreview(sp,{...scope,mode:'catalog'});return planSend(sp,await planCommand(unitId,schoolYear,'publish',current.revision,{mutationContext:{baseVersionId:c.baseVersionId,expectedBasisHash:c.basisHash}},{expectedContentHash:current.version.contentHash}));},'tjanst_publish_blocked');
 // A later draft changes pool B away without applying. The previous real applied pool must still govern.
 block={...block,name:'Nytt otillämpat namn',sourceRefs:[a]};await send('save_block',{expectedBlockRevision:1,block});current=await read();assert.equal(current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey).organizationPending,true);check('unapplied pool edit cannot clear earlier applied class intent');
 // Retire the actual never-staffed A group through155; B was only an uncovered pool class.
 await send('retire_group',{groupId,expectedBlockRevision:2});current=await read();assert.equal(current.groups?.length??0,0);assert.equal(current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey).organizationPending,undefined);assert.equal(current.classes.find(c=>c.classId===a.classId).needs.find(n=>n.sourceKey===a.sourceKey).organizationPending,true);check('released block clears pool-only B intent while actual retired A frame stays explicitly unorganized');
 assert.deepEqual(frozen(await planRead(tx,{...scope,versionId:published})),frozen(history));check('retirement and released intent preserve prior publication');
 const afterRetire=(await electiveRead()).blocks.find(x=>x.id===blockId),newGroupId=randomUUID();block={...block,groups:[{...block.groups[0],id:newGroupId,name:'Ny A-grupp'}]};await send('save_block',{expectedBlockRevision:afterRetire.revision,block});current=await read();
 assert.equal((await tx`select organization_retired_at is null active from public.elective_blocks where id=${blockId}`)[0].active,true);assert.equal(current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey).organizationPending,undefined);check('reclaiming a released block with an unapplied new group does not resurrect the old A+B pool');
 const beforeReapply=(await electiveRead()).blocks.find(x=>x.id===blockId);await send('apply_groups',{blockId,expectedBlockRevision:beforeReapply.revision});current=await read();assert.equal(current.groups.length,1);assert.equal(current.groups[0].groupId,newGroupId);assert.equal(current.classes.find(c=>c.classId===b.classId).needs.find(n=>n.sourceKey===b.sourceKey).organizationPending,undefined);check('new explicit A-only application uses new pool and group identity without reviving retired B intent');

 });
 if(!reproduceOnly){const legacy={checks:[]};for(const run of [runTjanstYearCases,runTjanstYearBatchCases,runTjanstYearGroupCases,runTjanstYearLimitCases,runTjanstSharingCases])await run(own.db,legacy);report.legacyChecks=legacy.checks;check(`${legacy.checks.length} existing class/year/bulk/move/sharing cases remain green against156`);}
 assert.deepEqual(sourceHashes(),initialSources,'verification sources changed while running');report.sources=initialSources;
 report.ok=true;report.reproduceOnly=reproduceOnly;writeFileSync('/private/tmp/elective-pool-intent-sql.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(`${report.checks.length} SQL checks PASS${reproduceOnly?' (reproduction only)':''}`);
}catch(e){console.error('Pool intent verification failed:',e.code??'',e.message,e.hint??'',e.where??'',e.stack??'');process.exitCode=1;}finally{await own.end();}
