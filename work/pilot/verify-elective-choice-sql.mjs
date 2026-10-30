// Actual SQL on a private disposable instance; no installed database or credentials accepted.
import assert from 'node:assert/strict';
import{randomUUID,createHash}from'node:crypto';
import{readFileSync,writeFileSync}from'node:fs';
import{fileURLToPath}from'node:url';
import{createEphemeralMigratedDb,migrationFiles}from'./ephemeral-migrated-db.mjs';
import{createTjanstFixture,seedGrimNeeds}from'./tjanst-fixtures.mjs';
import{parseElectiveRead,parseElectiveCommand,createElectiveCommandRef,parseElectiveReceipt}from'../../web/lib/elective-block-contract.ts';
import{parseSelfCommand,createSelfCommandRef,parseSelfReceipt,parseSelfStatus,parseSelfRead}from'../../web/lib/elective-self-contract.ts';
const root=fileURLToPath(new URL('../../',import.meta.url));
const files=['20261030110000_elective_blocks.sql','20261030111000_elective_participant_authority.sql','20261030113000_elective_rounds_choices.sql','20261030114000_elective_guardian_confirmation.sql'];
const report={kind:'ephemeral-elective-choice-guardian-sql',checks:[],sources:Object.fromEntries(files.map(f=>[f,createHash('sha256').update(readFileSync(root+'supabase/migrations/'+f)).digest('hex')]))};
const pass=name=>{report.checks.push({name,ok:true});console.log('PASS '+name);};
const env=await createEphemeralMigratedDb({exclude:migrationFiles().filter(x=>x.startsWith('20261030'))});
try{
 const db=env.db;for(const f of files)await db.unsafe(readFileSync(root+'supabase/migrations/'+f,'utf8'));pass('block/authority/round/guardian migration chain');
 let f,source;
 await db.begin(async t=>{f=await createTjanstFixture(t);const gr=await seedGrimNeeds(t,f);await t`set local session_replication_role=replica`;await t`insert into public.timplan_cells(timplan_id,row_id,hours) values(${gr.grPlan},'sprakval',${[100,100,100]}::smallint[])`;await t`set local session_replication_role=origin`;await f.actor(t,'principalA');source=(await t`select public.elective_sources(${f.schools.A},2026) value`)[0].value[0];});
 assert.ok(source,'actual GR language timplan source');
 const scope={unitId:f.schools.A,schoolYear:2026},pupil=f.pupils.inGroup;
 const firstChoice=read=>read.choices.find(c=>c.roundId===roundId);
 const worker=(name,fn)=>db.begin(async t=>{await f.actor(t,name);await t`set local role skolplattform_worker`;return fn(t);});
 const read=()=>worker('principalA',async t=>parseElectiveRead((await t`select public.elective_block_read(${t.json(scope)}) result`)[0].result.result,scope));
 const staff=async(action,payload,rawRequest=false)=>{const revision=(await read()).revision;const input={...scope,commandId:randomUUID(),expectedRevision:revision,action,payload};const q=rawRequest?input:parseElectiveCommand(input);return worker('principalA',async t=>{const raw=(await t`select public.elective_block_command(${t.json(q)}) result`)[0].result;return rawRequest?raw.result:parseElectiveReceipt(raw.result,await createElectiveCommandRef(q));});};
 const deny=async(name,fn,codes)=>{let e;try{await fn();}catch(error){e=error;}assert.ok(e,name+' must deny');assert.ok(codes.includes(e.code),name+': '+e.code+' '+e.message);pass(name);};
 const blockId=randomUUID(),fr=randomUUID(),sp=randomUUID();
 const block={id:blockId,kind:'languageChoice',name:'Språkval inför schema',startsOn:'2026-07-01',endsOn:'2027-06-30',sourceRefs:[source],
 options:[{id:fr,name:'Franska',subjectCode:'GRGRMSP01',levelCode:'GRGRMSP01',language:'fr',points:null},{id:sp,name:'Spanska',subjectCode:'GRGRMSP01',levelCode:'GRGRMSP01',language:'es',points:null}],
 groups:[fr,sp].map((optionId,i)=>({id:randomUUID(),optionId,name:i?'Spanska1':'Franska1',startsOn:'2026-07-01',endsOn:'2027-06-30',classIds:[source.classId],sourceKeys:[source.sourceKey],estimatedPupils:null}))};
 await staff('save_block',{expectedBlockRevision:null,block});pass('real block with two inherited alternatives');
 const start=new Date(Date.now()-60000).toISOString(),end=new Date(Date.now()+86400000).toISOString();
 const open=(extra={})=>({roundId:randomUUID(),blockId,expectedBlockRevision:1,opensAt:start,closesAt:end,minChoices:1,maxChoices:1,pupilIds:[pupil],...extra});
 await deny('unset school policy blocks opening',()=>staff('open_round',open()),['40001']);
 await staff('set_policy',{guardianConfirmation:false});pass('school explicitly selects no guardian confirmation');
 await deny('pupil outside bound class cannot enter offering',()=>staff('open_round',open({pupilIds:[f.pupils.outside]})),['42501']);
 await deny('two full-frame selections cannot exceed one timplan position',()=>staff('open_round',open({maxChoices:2}),true),['22023']);
 await db.begin(async t=>{await t`set local session_replication_role=replica`;await t`update public.pupil_placements set starts_on='2027-01-01' where pupil_id=${f.pupils.inGroup2}`;await t`update public.pupil_class_memberships set starts_on='2027-01-01' where pupil_id=${f.pupils.inGroup2}`;await t`set local session_replication_role=origin`;});
 const roundPayload=open({pupilIds:[pupil,f.pupils.inGroup2]}),roundId=roundPayload.roundId;await staff('open_round',roundPayload);pass('frozen offering with explicit eligible pupil and one exact position');
 const ownIdent=f.identity('teacherSelf'),parentIdent=f.identity('teacherSelf2'),parent2Ident=f.identity('teacherSelf3');
 const sessions={};
 for(const[kind,identityId]of[['pupil',ownIdent],['guardian',parentIdent],['guardian2',parent2Ident]]){const id=randomUUID(),token=createHash('sha256').update(randomUUID()).digest();sessions[kind]={id,identityId,token};await db`insert into public.app_sessions(id,token_hash,identity_id,expires_at,absolute_expires_at) values(${id},${token},${identityId},clock_timestamp()+interval '2 hours',clock_timestamp()+interval '4 hours')`;}
 const bindings={};
 for(const[kind,identityId]of[['pupil',ownIdent],['guardian',parentIdent],['guardian2',parent2Ident]]){const q={unitId:scope.unitId,pupilId:pupil,commandId:randomUUID(),expectedRevision:0,action:'save_binding',payload:{id:randomUUID(),identityId,participant:kind==='pupil'?'pupil':'guardian',confirmationRequired:kind!=='pupil',startsOn:'2026-07-01',endsOn:null,sourceReference:'synthetic-school-attestation'}};await worker('principalA',t=>t`select public.elective_binding_command(${t.json(q)})`);bindings[kind]=q.payload.id;}
 const self=async(kind,fn,connection=db)=>connection.begin(async t=>{await t`set local role skolplattform_worker`;await t`select set_config('app.correlation_id',${randomUUID()},true)`;const s=sessions[kind];await t`select public.elective_participant_scope(${s.id},${s.identityId},${s.token.toString('hex')},1,${scope.unitId},${pupil},${kind==='pupil'?'pupil':'guardian'})`;return fn(t);});
 const selfRead=kind=>self(kind,async t=>parseSelfRead((await t`select public.elective_self_read() result`)[0].result,{unitId:scope.unitId,pupilId:pupil,participant:kind==='pupil'?'pupil':'guardian',bindingId:bindings[kind]}));
 const send=(kind,q,connection=db)=>self(kind,async t=>parseSelfReceipt((await t`select public.elective_self_command(${t.json(q)}) result`)[0].result,await createSelfCommandRef(q),{identityId:sessions[kind].identityId,bindingId:bindings[kind]}),connection);
 const submit=(options,expected=null)=>parseSelfCommand({unitId:scope.unitId,pupilId:pupil,participant:'pupil',expectedBindingRevision:1,commandId:randomUUID(),action:'submit_choice',payload:{roundId,offeringRevision:1,expectedChoiceRevision:expected,selectedOptionIds:options}});
 const before=await selfRead('pupil');assert.equal(before.offers[0].blockName,block.name);assert.deepEqual(before.offers[0].options.map(x=>x.id).sort(),[fr,sp].sort());assert.equal(Object.hasOwn(before.offers[0].round,'pupilIds'),false);assert.equal(before.offers[0].needHt,source.needHt);pass('student sees exact alternatives/time with no classmates or scope list');
 await deny('student cannot submit non-offered option',()=>send('pupil',submit([randomUUID()])),['22023']);
 await deny('student cannot exceed one complete position',()=>send('pupil',submit([fr,sp])),['22023']);
 // A pupil with a future school/class placement can choose before that term starts.
 const futureIdentity=randomUUID(),futureMembership=randomUUID(),futureSession=randomUUID(),futureToken=createHash('sha256').update(randomUUID()).digest(),futureBinding=randomUUID();
 await db`insert into public.identities(id,issuer,subject,display_name) values(${futureIdentity},'https://synthetic.example.test',${randomUUID()},'Syntetisk kommande elev')`;
 await db`insert into public.memberships(id,identity_id,customer_id) values(${futureMembership},${futureIdentity},${f.id(1)})`;
 await db`insert into public.app_sessions(id,token_hash,identity_id,expires_at,absolute_expires_at) values(${futureSession},${futureToken},${futureIdentity},clock_timestamp()+interval '1 hour',clock_timestamp()+interval '2 hours')`;
 await worker('principalA',t=>t`select public.elective_binding_command(${t.json({unitId:scope.unitId,pupilId:f.pupils.inGroup2,commandId:randomUUID(),expectedRevision:0,action:'save_binding',payload:{id:futureBinding,identityId:futureIdentity,participant:'pupil',confirmationRequired:false,startsOn:'2026-07-01',endsOn:null,sourceReference:'synthetic-future-enrolment'}})})`);
 const futureCommand=parseSelfCommand({unitId:scope.unitId,pupilId:f.pupils.inGroup2,participant:'pupil',expectedBindingRevision:1,commandId:randomUUID(),action:'submit_choice',payload:{roundId,offeringRevision:1,expectedChoiceRevision:null,selectedOptionIds:[sp]}});
 await db.begin(async t=>{await t`set local role skolplattform_worker`;await t`select set_config('app.correlation_id',${randomUUID()},true)`;await t`select public.elective_participant_scope(${futureSession},${futureIdentity},${futureToken.toString('hex')},1,${scope.unitId},${f.pupils.inGroup2},'pupil')`;const got=(await t`select public.elective_self_command(${t.json(futureCommand)}) result`)[0].result;assert.equal(parseSelfReceipt(got,await createSelfCommandRef(futureCommand)).choiceRevision,1);});pass('verified future placement allows pupil choice before term starts');
 const q=submit([fr]),receipt=await send('pupil',q);assert.equal(receipt.choiceRevision,1);pass('actual pupil submit without staff assignment');
 const forecast={...block,groups:block.groups.map(g=>({...g,estimatedPupils:25}))};await staff('save_block',{expectedBlockRevision:1,block:forecast});
 assert.equal((await read()).blocks.find(b=>b.id===blockId).offeringRevision,1);assert.equal(firstChoice(await selfRead('pupil')).state,'ready_for_confirmation');pass('group forecast revision does not change offering or invalidate pupil choice');

 assert.equal(firstChoice(await selfRead('pupil')).state,'ready_for_confirmation');pass('policy off advances without fabricated guardian signature');
 assert.equal((await db`select count(*)::int n from public.elective_guardian_confirmations`)[0].n,0);pass('policy off creates zero guardian decisions');
 const replay=await send('pupil',q);assert.equal(replay.replayed,true);assert.equal(replay.choiceRevision,1);pass('same student command cannot duplicate or increment choice');
 const ref=await createSelfCommandRef(q),status=await self('pupil',async t=>(await t`select public.elective_self_status(${t.json(ref)}) result`)[0].result);assert.equal(parseSelfStatus(status,ref).status,'found');pass('minimal reference recovers true own receipt');
 await deny('wrong payload hash is conflict, never not_found',()=>self('pupil',t=>t`select public.elective_self_status(${t.json({...ref,payloadHash:'0'.repeat(64)})})`),['40001']);
 await deny('guardian cannot read pupil command journal',()=>self('guardian',t=>t`select public.elective_self_status(${t.json({...ref,participant:'guardian'})})`),['40001']);
 await deny('stale choice revision is rejected',()=>send('pupil',submit([sp],null)),['40001']);
 await staff('set_policy',{guardianConfirmation:true});assert.equal(firstChoice(await selfRead('pupil')).state,'awaiting_guardian');pass('school policy on applies explicitly to waiting open offering');
 const guardianCommand=(kind,decision='approve',revision=1)=>parseSelfCommand({unitId:scope.unitId,pupilId:pupil,participant:'guardian',expectedBindingRevision:1,commandId:randomUUID(),action:'confirm_guardian',payload:{choiceId:receipt.choiceId,expectedChoiceRevision:revision,offeringRevision:1,decision}});
 const approved=await send('guardian',guardianCommand('guardian'));assert.equal(approved.choiceId,receipt.choiceId);assert.equal(firstChoice(await selfRead('pupil')).state,'awaiting_guardian');pass('first required guardian is insufficient when second explicitly required');
 await deny('school cannot confirm while a required guardian is missing',()=>staff('confirm_choice',{choiceId:receipt.choiceId,expectedChoiceRevision:1}),['40001']);
 await send('guardian2',guardianCommand('guardian2'));assert.equal(firstChoice(await selfRead('pupil')).state,'ready_for_confirmation');pass('all required current guardians allow school confirmation');
 const parentRead=await selfRead('guardian');assert.equal(parentRead.confirmations.length,1);assert.equal(parentRead.confirmations[0].bindingId,bindings.guardian);pass('guardian read does not leak other guardians');
 await staff('confirm_choice',{choiceId:receipt.choiceId,expectedChoiceRevision:1});assert.equal(firstChoice(await selfRead('pupil')).state,'confirmed');pass('school confirmation is distinct from pupil and guardian decisions');
 const changed=await send('pupil',submit([sp],1));assert.equal(changed.choiceRevision,2);const reread=await selfRead('pupil');assert.equal(firstChoice(reread).confirmedAt,null);assert.equal(firstChoice(reread).state,'awaiting_guardian');pass('changed pupil choice invalidates old confirmations without deleting history');
 assert.equal((await db`select count(*)::int n from public.elective_choice_history`)[0].n,1);pass('earlier confirmed choice preserved as history');
 await deny('guardian cannot approve a stale choice version',()=>send('guardian',guardianCommand('guardian')),['40001']);
 await send('guardian',guardianCommand('guardian','decline',2));assert.equal(firstChoice(await selfRead('pupil')).state,'guardian_declined');pass('guardian decline blocks school confirmation');
 await deny('opposite decision on same version requires a new reviewed choice',()=>send('guardian',guardianCommand('guardian','approve',2)),['40001']);
 await staff('set_policy',{guardianConfirmation:false});assert.equal(firstChoice(await selfRead('pupil')).state,'ready_for_confirmation');pass('school may remove requirement without creating a guardian signature');
 await deny('disabled policy cannot create guardian approval',()=>send('guardian2',guardianCommand('guardian2','approve',2)),['40001']);
 // A true fault in DB audit must roll back both choice history and self journal.
 await db.unsafe(`create function public.elective_choice_audit_fault() returns trigger language plpgsql as $$begin if new.action='elective_choice_submitted' then raise exception 'synthetic audit fault';end if;return new;end$$;create trigger elective_choice_audit_fault before insert on public.security_events for each row execute function public.elective_choice_audit_fault();`);
 const faulty=submit([fr],2);await deny('actual pupil audit failure stops mutation',()=>send('pupil',faulty),['55000']);
 assert.equal(firstChoice(await selfRead('pupil')).revision,2);assert.equal((await db`select count(*)::int n from public.elective_self_commands where command_id=${faulty.commandId}`)[0].n,0);pass('failed choice audit leaves neither new revision nor receipt');
 await db.unsafe('drop trigger elective_choice_audit_fault on public.security_events;drop function public.elective_choice_audit_fault()');
 await worker('principalA',async t=>{await t`select public.elective_binding_command(${t.json({unitId:scope.unitId,pupilId:pupil,commandId:randomUUID(),expectedRevision:1,action:'revoke_binding',payload:{id:bindings.guardian}})})`;});
 await deny('revoked guardian cannot approve or read child choices',()=>selfRead('guardian'),['42501']);
 const races=await Promise.allSettled([send('pupil',submit([fr],2),env.connect()),send('pupil',submit([sp],2),env.connect())]);
 assert.equal(races.filter(r=>r.status==='fulfilled').length,1);assert.equal(races.filter(r=>r.status==='rejected'&&r.reason.code==='40001').length,1);assert.equal(firstChoice(await selfRead('pupil')).revision,3);pass('two real concurrent connections preserve exactly one expected-revision update');
 // Changing the actual inherited time is detected even when the selected names stay unchanged.
 await db.begin(async t=>{await t`set local session_replication_role=replica`;await t`update public.timplan_cells set hours=${[90,90,90]}::smallint[] where timplan_id=${source.timplanId} and row_id='sprakval'`;await t`set local session_replication_role=origin`;});
 assert.equal(firstChoice(await selfRead('pupil')).state,'stale_offer');await deny('changed timplan source cannot accept a stale pupil submission',()=>send('pupil',submit([fr],3)),['40001']);
 await db.begin(async t=>{await t`set local session_replication_role=replica`;await t`update public.timplan_cells set hours=${[100,100,100]}::smallint[] where timplan_id=${source.timplanId} and row_id='sprakval'`;await t`set local session_replication_role=origin`;});pass('frozen displayed time and source status are separate from changed timetable');
 const closeRevision=(await read()).rounds.find(x=>x.id===roundId).revision;await staff('close_round',{roundId,expectedRoundRevision:closeRevision});
 await deny('closed round rejects new pupil selection',()=>send('pupil',submit([fr],3)),['40001']);
 await deny('closed round rejects new guardian confirmation',()=>send('guardian2',guardianCommand('guardian2','approve',2)),['40001']);
 const current=(await read()).blocks.find(b=>b.id===blockId);const changedOffer={...forecast,name:'Ändrat erbjudande'};await staff('save_block',{expectedBlockRevision:current.revision,block:changedOffer});
 const historical=await selfRead('pupil');assert.equal(historical.offers.find(o=>o.round.id===roundId).blockName,block.name);assert.equal(firstChoice(historical).state,'stale_offer');pass('offer changes keep frozen historical alternatives and mark current choice stale');
 await db`update public.pupils set protected_identity=true where id=${pupil}`;
 const redacted=await read();assert.ok(!redacted.pupils.some(p=>p.id===pupil));assert.ok(redacted.rounds.every(r=>!r.pupilIds.includes(pupil)));assert.ok(!redacted.choices.some(c=>c.pupilId===pupil));pass('protected pupil identity is absent from unpermitted names, round targets and choices');
 const permit=await worker('hm',async t=>(await t`select public.phase4_grant_protected_permission(${f.roles.admin},${scope.unitId}) id`)[0].id);
 const auditBefore=(await db`select count(*)::int n from public.security_events where action='pupil_protected_read' and object_id=${pupil}`)[0].n;
 const privateRead=await worker('admin',async t=>parseElectiveRead((await t`select public.elective_block_read(${t.json(scope)}) result`)[0].result.result,scope));assert.ok(privateRead.pupils.some(p=>p.id===pupil));assert.equal((await db`select count(*)::int n from public.security_events where action='pupil_protected_read' and object_id=${pupil}`)[0].n,auditBefore+1);pass('permitted protected pupil name read records SQL-derived individual audit reference');
 await db.unsafe(`create function public.elective_protected_audit_fault() returns trigger language plpgsql as $$begin if new.action='pupil_protected_read' then raise exception 'synthetic protected audit fault';end if;return new;end$$;create trigger elective_protected_audit_fault before insert on public.security_events for each row execute function public.elective_protected_audit_fault();`);
 await deny('protected audit failure blocks entire sensitive response',()=>worker('admin',t=>t`select public.elective_block_read(${t.json(scope)})`),['55000']);
 await db.unsafe('drop trigger elective_protected_audit_fault on public.security_events;drop function public.elective_protected_audit_fault()');
 await worker('hm',t=>t`select public.phase4_revoke_protected_permission(${permit})`);const afterRevoke=await worker('admin',async t=>parseElectiveRead((await t`select public.elective_block_read(${t.json(scope)}) result`)[0].result.result,scope));assert.ok(!afterRevoke.pupils.some(p=>p.id===pupil));pass('revoked special permission restores complete protected pupil redaction');
 report.provenance=env.provenance;report.pass=true;report.total=report.checks.length;
 const out=process.argv.includes('--out')?process.argv[process.argv.indexOf('--out')+1]:'/private/tmp/elective-choice-sql.json';assert.ok(out.startsWith('/private/tmp/'));writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log('PASS '+report.total+' actual choice/guardian SQL checks');
}finally{await env.end();}
