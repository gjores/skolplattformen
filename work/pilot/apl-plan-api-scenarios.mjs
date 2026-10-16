// Actual HTTP scenarios against the owned Worker. No authentication or business-response mocks.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseGymTimplan} from '../../web/lib/gym-timplan.ts';
import {parseAplPlan,parseAplReadReply,parseAplCommandReply,parseAplStatusReply,projectAplPlan,verifyAplReadReply} from '../../web/lib/apl-plan.ts';
import {parsePlanDecisionDetail} from '../../web/lib/plan-decision.ts';
export const aplRoutes={read:'/api/timplaner/gym/apl/lasa',command:'/api/timplaner/gym/apl/kommando',status:'/api/timplaner/gym/apl/status'};
export function actualAplClient(fixture,pages,http=[]) {
 const call=async(role,route,input,expected=200,headers)=>{const response=await fixture.request(pages[role],role,route,input,headers);
  http.push({role,route,status:response.status,...(response.body?.code?{code:response.body.code}:{})});
  assert.equal(response.status,expected,`${role} ${route}: ${response.status} ${response.body?.code??''}`);return response.body;};
 const gym=async(planId,role='principal')=>parseGymTimplan(await call(role,'/api/timplaner/gym/lasa',{planId}),planId);
 const read=async(planId,role='principal')=>{const plan=await gym(planId,role),detail=parseAplReadReply(await call(role,aplRoutes.read,{planId}),{planId});
  const context={organizerId:detail.organizerId,plan,program:detail.program,copyReview:detail.copyReview};
  return {gym:plan,detail:await verifyAplReadReply(detail,context),projection:projectAplPlan(context,detail.plan)};};
 const command=async(request,role='principal')=>parseAplCommandReply(await call(role,aplRoutes.command,request),request);
 const saveRequest=(id,revision,plan)=>({contractVersion:'structured_v1',action:'save',commandId:randomUUID(),planId:id,expectedRevision:revision,plan:parseAplPlan(plan),copyReviewResolutions:[]});
 const confirmRequest=detail=>({contractVersion:'structured_v1',action:'confirm',commandId:randomUUID(),planId:detail.planId,expectedRevision:detail.revision,expectedContentHash:detail.contentHash,comment:'Syntetiskt granskat APL-underlag, bekräftat av rektor.'});
 const decision=async(id,role='principal')=>{const query={kind:'timplan',planId:id};return parsePlanDecisionDetail(await call(role,'/api/planbeslut/underlag',query),query);};
 const decide=async(id,action,role='principal',comment='')=>{const d=await decision(id,role),q={kind:'timplan',planId:id,commandId:randomUUID(),action,
  expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment,confirmedChecks:d.checks.map(c=>c.id)};
  return parsePlanDecisionDetail(await call(role,'/api/planbeslut/andra',q),{kind:'timplan',planId:id});};
 const create=async(name,copyId=fixture.scope.planId)=>{const original=await gym(copyId),source=original.source;
  const q={commandId:randomUUID(),sourcePlanId:source.planId,expectedSourceRevision:source.revision,expectedEducationRevision:source.educationRevision,
   unitId:original.unitId,name,copyFromPlanId:original.id,expectedCopyFromRevision:original.revision};
  const made=await call('principal','/api/timplaner/gym/planer/skapa',q);return gym(made.id);};
 return{call,gym,read,command,saveRequest,confirmRequest,decision,decide,create};
}
/** Three separate five-week periods; 690 + 690 + 5,520 minutes each, counted once. */
export function threeAplPeriods(gym,year,rows) {
 const start=new Date(gym.source.startedOn+'T00:00:00.000Z');start.setUTCDate(start.getUTCDate()+(8-start.getUTCDay())%7);
 const day=offset=>new Date(start.getTime()+offset*86400000).toISOString().slice(0,10);
 return parseAplPlan({contractVersion:'structured_v1',educationForm:'school_based',classification:'complete',periods:[0,1,2].map(index=>({
  id:randomUUID(),name:`APL-period ${index+1}`,startsOn:day(index*35),endsOn:day(index*35+32),schoolYear:year,
  extent:{basis:'whole_weeks',weeks:5,reviewed:true,reviewNote:'Fem hela veckor i syntetiskt granskat verksamhetsunderlag.'},
  contents:rows.map((row,n)=>({rowKey:row.key,description:`Arbetsmoment ${n+1} i period ${index+1}: planera, genomföra och följa upp pedagogiska aktiviteter.`})),
  allocations:rows.map((row,n)=>({rowKey:row.key,termIndex:0,gutMinutes:n<2?690:5520}))}))});
}
export async function prepareAplVariant(client,fixture,name) {
 let gym=await client.create(name);const rows=gym.rows.filter(r=>r.rowKind==='fixed'&&!r.key.startsWith('meta:')&&r.pointTerms[0]>0).slice(0,3);
 assert.equal(rows.length,3,'Synthetic BF needs three real first-term subject levels');
 for(const [n,row] of rows.entries()) {const minimum=n<2?35:300;if((gym.hours[row.key][0]??0)>=minimum)continue;
  const hours=[...gym.hours[row.key]];hours[0]=minimum;
  await client.call('principal','/api/timplaner/gym/rad',{planId:gym.id,expectedRevision:gym.revision,rowKey:row.key,hours});gym=await client.gym(gym.id);
 }
 return {gym,rows,value:threeAplPeriods(gym,fixture.scope.year,rows)};
}
export async function runAplApiScenarios({fixture,browser,snapshot,checks}) {
 const pages={},contexts=[],http=[],client=actualAplClient(fixture,pages,http),{call}=client,db=snapshot.db;
 const ok=name=>checks.push({name,ok:true});const clone=structuredClone;
 try {
  for(const role of ['principal','hm','principal2','admin']){const context=await browser.newContext({baseURL:fixture.baseURL});contexts.push(context);pages[role]=await context.newPage();await fixture.login(pages[role],role);ok('Actual OIDC/MFA and valid mandate: '+role);}
  const original=await client.gym(fixture.scope.planId),beforeOriginal=(await db`select to_jsonb(t) value from public.timplans t where id=${original.id}`)[0].value;
  const prepared=await prepareAplVariant(client,fixture,'BF API – anpassad APL'),id=prepared.gym.id;
  for(const [role,capabilities] of [['principal',{canSave:true,canConfirm:true}],['admin',{canSave:true,canConfirm:false}],['hm',{canSave:false,canConfirm:false}]]){
   const r=await client.read(id,role);assert.deepEqual(r.detail.capabilities,capabilities);assert.equal(r.detail.plan,null);assert.equal(r.projection.schoolMinutes,null);
  }
  await call('principal2',aplRoutes.read,{planId:id},403);ok('Rector/admin/HM capabilities and other-school denial through actual HTTP');
  const saved=await client.command(client.saveRequest(id,prepared.gym.revision,prepared.value),'admin');
  assert.equal(saved.detail.confirmations.length,0);const full=await client.read(id);assert.equal(full.projection.allocatedGutMinutes,20700);assert.equal(full.projection.reviewedWholeWeeks,15);assert.equal(full.projection.readyForConfirmation,true);
  assert.deepEqual(full.gym.hours,prepared.gym.hours);assert.equal(full.projection.totalMinutes-full.projection.schoolMinutes,20700);ok('Three five-week periods, nine content links and exact 690 + 690 cells total only 20,700 included APL minutes');
  const q=client.confirmRequest(full.detail);
  await call('admin',aplRoutes.command,q,403);await call('hm',aplRoutes.command,client.saveRequest(id,full.detail.revision,prepared.value),403);
  await call('principal',aplRoutes.command,q,403,{Origin:'https://wrong.invalid'});await call('principal',aplRoutes.command,q,409,{'X-Context-Epoch':'999999'});
  ok('Actual HTTP protects rector confirmation, HM write boundary, origin and stale context');
  const changed=clone(prepared.value);changed.periods[0].contents[0].description+=' Administratörens rättning.';
  const newer=await client.command(client.saveRequest(id,full.detail.revision,changed),'admin');
  await call('principal',aplRoutes.command,q,409);ok('Stale revision/content confirmation rejected after actual competing admin save');
  let current=await client.read(id);const confirmation=await client.command(client.confirmRequest(current.detail));assert.equal(confirmation.detail.confirmations.at(-1).actorId,fixture.actors.principal.identityId);
  const same=client.saveRequest(id,confirmation.detail.revision,changed),noop=await client.command(same);assert.equal(noop.receipt.changed,false);assert.equal(noop.receipt.revision,confirmation.receipt.revision);
  const status=parseAplStatusReply(await call('principal',aplRoutes.status,{command:same}),{command:same});assert.equal(status.state,'completed');assert.equal(status.result.receipt.replayed,true);
  const replay=await client.command(same);assert.deepEqual(replay,status.result);ok('Actual rector event, no-op save, request-bound status and exact replay preserve the same confirmation');
  const oldRevision=newer.detail.revision;
  await call('principal',aplRoutes.command,client.saveRequest(id,oldRevision,prepared.value),409);ok('Stale CAS save cannot replace later saved content');
  for(const [label,transform] of [
   ['mixed-week',v=>{v.periods[0].extent={basis:'mixed_weeks',weeks:null,reviewed:false,reviewNote:'Delar av veckor granskas separat.'};}],
   ['unknown education',v=>{v.educationForm='unknown';}],
   ['apprenticeship',v=>{v.educationForm='apprenticeship';}],
  ]) {
   current=await client.read(id);const value=clone(changed);transform(value);const r=await client.command(client.saveRequest(id,current.detail.revision,value));
   const read=await client.read(id);assert.equal(read.projection.readyForConfirmation,false);assert.equal((await client.decision(id)).apl.ready,false);
   await call('principal',aplRoutes.command,client.confirmRequest(r.detail),409);ok('Actual HTTP saves '+label+' draft without inventing full-week compliance or allowing confirmation');
  }
  // An empty total cannot silently become APL time. Clear a cell before any allocation exists in this independent plan.
  const missing=await prepareAplVariant(client,fixture,'BF API – saknad totaltid');let missingGym=missing.gym;
  const missingHours=[...missingGym.hours[missing.rows[0].key]];missingHours[0]=null;
  await call('principal','/api/timplaner/gym/rad',{planId:missingGym.id,expectedRevision:missingGym.revision,rowKey:missing.rows[0].key,hours:missingHours});missingGym=await client.gym(missingGym.id);
  const bad=await call('principal',aplRoutes.command,client.saveRequest(missingGym.id,missingGym.revision,missing.value),400);assert.ok(bad.code);
  assert.equal((await client.read(missingGym.id)).detail.plan,null);ok('Actual HTTP refuses allocation into missing total without partial APL persistence');
  current=await client.read(id);await client.command(client.saveRequest(id,current.detail.revision,changed));current=await client.read(id);
  await client.command(client.confirmRequest(current.detail));const submitted=await client.decide(id,'submit');assert.equal(submitted.apl.ready,true);
  await client.decide(id,'return','hm','Precisera de pedagogiska momenten.');assert.equal((await client.decision(id)).stage,'returned');
  await client.decide(id,'submit');const approved=await client.decide(id,'approve','hm');assert.equal(approved.stage,'approved');ok('Rector submission, HM return, resubmission and approval use the same verified APL');
  const legacy=await client.decision(fixture.scope.planId,'hm');assert.equal(legacy.stage,'approved');assert.equal(legacy.apl.detail.plan,null);assert.equal(legacy.blockers.length,0);
  const older=await client.decision(fixture.scope.legacySubmittedId,'hm');assert.equal(older.apl.ready,false);assert.ok(older.actions.includes('return'));
  await client.decide(fixture.scope.legacySubmittedId,'return','hm','Äldre APL-underlag behöver kompletteras.');ok('Legacy approved history remains readable; legacy submitted plan retains return path');
  // A mandatory outer Worker audit failure must roll back its actual SQL command and receipt.
  const rollback=await prepareAplVariant(client,fixture,'BF API – auditåterställning'),rollbackRequest=client.saveRequest(rollback.gym.id,rollback.gym.revision,rollback.value);
  const before=(await db`select count(*)::int n from public.apl_plan_commands where plan_id=${rollback.gym.id}`)[0].n;
  await db.unsafe(`create function pg_temp.fail_apl_http_audit() returns trigger language plpgsql as $$begin if new.customer_id='${fixture.scope.customerId}' and new.source='worker' and new.action='apl_plan_command' and new.outcome='ok' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger apl_http_audit_fail before insert on public.security_events for each row execute function pg_temp.fail_apl_http_audit();`);
  try {const r=await call('principal',aplRoutes.command,rollbackRequest,500);assert.equal(r.code,'audit_unavailable');}
  finally {await db`drop trigger apl_http_audit_fail on public.security_events`;}
  assert.equal((await db`select count(*)::int n from public.apl_plan_commands where plan_id=${rollback.gym.id}`)[0].n,before);assert.equal((await client.read(rollback.gym.id)).detail.plan,null);ok('Actual required Worker audit failure rolls back APL rows and immutable command receipt');
  await fixture.expireMfa(pages.principal,'principal');assert.equal((await call('principal',aplRoutes.command,rollbackRequest,403)).code,'mfa_required');
  await fixture.login(pages.principal,'principal',{stepUp:true});await client.command(rollbackRequest);ok('Actual expired MFA and OIDC step-up allow only an explicit exact retry');
  await fixture.revoke('admin');await call('admin',aplRoutes.read,{planId:id},403);await call('admin',aplRoutes.status,{command:same},403);ok('Revoked membership immediately denies APL read and recovery status');
  assert.deepEqual((await db`select to_jsonb(t) value from public.timplans t where id=${original.id}`)[0].value,beforeOriginal);
  assert.deepEqual((await client.gym(original.id)).hours,original.hours);ok('Original legacy timetable and its total matrix remain exact');
  const audits=await db`select source,action,outcome,actor_identity_id::text,assignment_id::text,session_id::text from public.security_events where customer_id=${fixture.scope.customerId} and action like '%apl%' order by id`;
  assert.ok(audits.some(a=>a.source==='worker'&&a.outcome==='ok'));assert.ok(audits.some(a=>a.source==='db'&&a.action==='apl_placement_confirmed'));
  return {status:'PASS',http,planId:id,audit:audits,allocationMinutes:20700,reviewedWeeks:15,originalPreserved:true,scope:fixture.scope};
 }finally {for(const context of contexts)await context.close();}
}
