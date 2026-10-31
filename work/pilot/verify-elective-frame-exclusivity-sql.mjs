// Funded position exclusivity: actual approved GY curriculum/time, isolated synthetic database.
import assert from'node:assert/strict';import{randomUUID,createHash}from'node:crypto';import{readFileSync,writeFileSync}from'node:fs';import{fileURLToPath}from'node:url';
import{createEphemeralMigratedDb,migrationFiles}from'./ephemeral-migrated-db.mjs';import{createTjanstFixture}from'./tjanst-fixtures.mjs';import{seedElectiveTimeFrame}from'./elective-frame-fixture.mjs';
import{parseElectiveCommand}from'../../web/lib/elective-block-contract.ts';
const root=fileURLToPath(new URL('../../',import.meta.url)),files=['20261030110000_elective_blocks.sql','20261030111000_elective_participant_authority.sql','20261030111500_elective_timplan_positions.sql','20261030113000_elective_rounds_choices.sql','20261030114000_elective_guardian_confirmation.sql','20261030115200_elective_frame_exclusivity.sql'];
const report={kind:'ephemeral-elective-frame-exclusivity-sql',checks:[],sources:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(root+'supabase/migrations/'+f)).digest('hex')]))};
const pass=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);},env=await createEphemeralMigratedDb({exclude:migrationFiles().filter(f=>f.startsWith('20261030'))});
try{const db=env.db;for(const name of files)await db.unsafe(readFileSync(root+'supabase/migrations/'+name,'utf8'));
 let f,scope;await db.begin(async t=>{f=await createTjanstFixture(t);scope=await seedElectiveTimeFrame(t,f);});
 const unitId=scope.unitId,schoolYear=scope.schoolYear;
 const worker=fn=>db.begin(async t=>{await f.actor(t,'principalA');await t`set local role skolplattform_worker`;return fn(t);});
 const read=()=>worker(async t=>(await t`select public.elective_block_read(${t.json({unitId,schoolYear})}) result`)[0].result.result);
 const staff=async(action,payload)=>{const q=parseElectiveCommand({unitId,schoolYear,commandId:randomUUID(),expectedRevision:(await read()).revision,action,payload});return worker(async t=>(await t`select public.elective_block_command(${t.json(q)}) result`)[0].result.result);};
 const deny=async(name,fn,hint)=>{let e;try{await fn();}catch(error){e=error;}assert.ok(e,name);assert.equal(e.code,'40001',e.message);if(hint)assert.equal(e.hint,hint);pass(name);};
 const full=(await read()).sources.find(x=>x.frameSourceKey===scope.frameSourceKey);assert.ok(full);assert.equal(full.timeDetailRef,null);pass('actual approved IV200 whole-frame source');
 const pick=async(source,points)=>{const q=(await db`select sub.value->>'code' subject,item.value->>'code' code from public.programplan_catalogs pc cross join lateral jsonb_array_elements(pc.payload->'subjects') sub cross join lateral jsonb_array_elements(coalesce(sub.value->'items','[]')) item where item.value->>'code'=any(${source.allowedOptionCodes}::text[]) and (item.value->>'points')::int=${points} and public.elective_language_valid(item.value->>'code',null) order by item.value->>'code' limit 1`)[0];assert.ok(q,'catalogue '+points+' course');return{id:randomUUID(),name:'Syntetiskt alternativ '+points,subjectCode:q.subject,levelCode:q.code,language:null,points};};
 const wholeOption=await pick(full,200),id=randomUUID();
 const draft=(blockId,source,option)=>({id:blockId,kind:'individualChoice',name:'Individuellt val',startsOn:`${schoolYear}-07-01`,endsOn:`${schoolYear+1}-06-30`,sourceRefs:[source],options:[option],groups:[{id:randomUUID(),optionId:option.id,name:'Planerad grupp',startsOn:`${schoolYear}-07-01`,endsOn:`${schoolYear+1}-06-30`,classIds:[source.classId],sourceKeys:[source.sourceKey],estimatedPupils:null}]});
 await staff('save_block',{expectedBlockRevision:null,block:draft(id,full,wholeOption)});pass('first block owns one complete frame');
 await deny('second block cannot consume same whole frame',()=>staff('save_block',{expectedBlockRevision:null,block:draft(randomUUID(),full,{...wholeOption,id:randomUUID()})}),'elective_frame_conflict');
 const frame=await worker(async t=>(await t`select public.elective_timplan_time_read(${t.json(scope)}) result`)[0].result.result);
 const positions=[{id:randomUUID(),name:'IV1',pointsHt:50,pointsVt:50,needHt:2400,needVt:2400},{id:randomUUID(),name:'IV2',pointsHt:50,pointsVt:50,needHt:3000,needVt:3000}];
 await worker(t=>t`select public.elective_timplan_time_command(${t.json({...scope,contractVersion:'elective_timplan_time_v1',action:'apply',commandId:randomUUID(),detailId:randomUUID(),expectedRevision:0,expectedParentHash:frame.frame.parentHash,expectedLinkRevision:frame.linkRevision,positions})})`);
 const expanded=(await read()).sources.filter(x=>x.frameSourceKey===scope.frameSourceKey);assert.equal(expanded.length,2);const source1=expanded.find(x=>x.timeDetailRef.positionId===positions[0].id),source2=expanded.find(x=>x.timeDetailRef.positionId===positions[1].id),option=await pick(source1,100);
 await deny('existing whole frame prevents another block taking even one new subdivision',()=>staff('save_block',{expectedBlockRevision:null,block:draft(randomUUID(),source1,option)}),'elective_frame_conflict');
 // An explicit CAS rewrite of the same unused block releases its old whole frame.
 const updated=draft(id,source2,option);await staff('save_block',{expectedBlockRevision:1,block:updated});pass('same unused block can explicitly rebind whole frame to one position without deadlocking on itself');
 await deny('one exact stable position cannot be reused in another block',()=>staff('save_block',{expectedBlockRevision:null,block:draft(randomUUID(),source2,{...option,id:randomUUID()})}),'elective_frame_conflict');
 const secondId=randomUUID(),second=draft(secondId,source1,{...option,id:randomUUID()});await staff('save_block',{expectedBlockRevision:null,block:second});pass('two distinct stable100-point positions in one200-point frame support two legitimate blocks');
 // Existing block can change its presentation without treating itself as a competing owner.
 await staff('save_block',{expectedBlockRevision:2,block:{...updated,name:'IV2 uppdaterad'}});pass('ordinary same-block amendment preserves its position ownership');
 // Model a legacy duplicate before installing the guard to prove open-round independently rejects it.
 const legacy=randomUUID();await db.begin(async t=>{await t`set local session_replication_role=replica`;await t`insert into public.elective_blocks select (jsonb_populate_record(null::public.elective_blocks,to_jsonb(b)||jsonb_build_object('id',${legacy}::uuid,'name','Syntetiskt äldre dubbelt block'))).* from public.elective_blocks b where id=${secondId}`;await t`insert into public.elective_block_sources select (jsonb_populate_record(null::public.elective_block_sources,to_jsonb(s)||jsonb_build_object('block_id',${legacy}::uuid))).* from public.elective_block_sources s where block_id=${secondId}`;await t`set local session_replication_role=origin`;});
 await staff('set_policy',{guardianConfirmation:false});
 const start=new Date(Date.now()-60000).toISOString(),end=new Date(Date.now()+86400000).toISOString();
 const open=(blockId,revision)=>({roundId:randomUUID(),blockId,expectedBlockRevision:revision,opensAt:start,closesAt:end,minChoices:1,maxChoices:1,pupilIds:[f.pupils.inGroup]});
 // Move only synthetic fixture enrollment into the actual approved GY class, without pretending to test a transfer integration.
 const offering=(await db`select offering_id from public.school_classes where id=${full.classId}`)[0].offering_id;
 await db.begin(async t=>{await t`set local session_replication_role=replica`;await t`update public.pupil_placements set offering_id=${offering},starts_on=${schoolYear+'-07-01'} where pupil_id=${f.pupils.inGroup}`;await t`update public.pupil_class_memberships set class_id=${full.classId},starts_on=${schoolYear+'-07-01'} where pupil_id=${f.pupils.inGroup}`;await t`set local session_replication_role=origin`;});
 await deny('open_round independently rejects a legacy duplicate source binding',()=>staff('open_round',open(secondId,1)),'elective_frame_conflict');
 await db`delete from public.elective_block_sources where block_id=${legacy}`;await db`delete from public.elective_blocks where id=${legacy}`;
 const firstRound=open(id,3),secondRound=open(secondId,1);await staff('open_round',firstRound);await staff('open_round',secondRound);
 for(const [r,opt]of[[firstRound,option.id],[secondRound,second.options[0].id]])await staff('record_choice',{roundId:r.roundId,pupilId:f.pupils.inGroup,offeringRevision:r.blockId===id?3:1,expectedChoiceRevision:null,selectedOptionIds:[opt]});
 const choices=(await read()).choices;const c1=choices.find(x=>x.roundId===firstRound.roundId),c2=choices.find(x=>x.roundId===secondRound.roundId);await staff('confirm_choice',{choiceId:c1.id,expectedChoiceRevision:1});
 await deny('same concrete100-point course cannot be confirmed twice across two legitimate positions',()=>staff('confirm_choice',{choiceId:c2.id,expectedChoiceRevision:1}),'elective_duplicate_course');
 report.pass=true;report.total=report.checks.length;report.provenance=env.provenance;writeFileSync('/private/tmp/elective-frame-exclusivity-sql.json',JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('PASS '+report.total+' actual frame exclusivity SQL checks');
}finally{await env.end();}
