import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {parseGymTimplan,parseGymTimplanUnderlag} from '../../web/lib/gym-timplan.ts';
import {parseNamedTimplanCreateReply,parseNamedTimplanRenameReply} from '../../web/lib/named-timplan.ts';
import {parsePlanDecisionDetail} from '../../web/lib/plan-decision.ts';
export async function namedTimplanApiScenarios({fixture,browser,snapshot,checks}){
 const pages={};const ok=name=>checks.push({name,ok:true});
 const call=async(role,route,body,expected=200,headers)=>{const r=await fixture.request(pages[role],role,route,body,headers);assert.equal(r.status,expected,route+': '+r.body.code);return r.body;};
 const read=async id=>parseGymTimplan(await call('principal','/api/timplaner/gym/lasa',{planId:id}),id);
 const decide=async(id,action,role)=>{const q={kind:'timplan',planId:id},d=parsePlanDecisionDetail(await call(role,'/api/planbeslut/underlag',q),q);return call(role,'/api/planbeslut/andra',{...q,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)});};
 try{
  for(const role of ['principal','hm','principal2','admin']){const context=await browser.newContext({baseURL:'http://127.0.0.1:3014'});pages[role]=await context.newPage();await fixture.login(pages[role],role);ok('Real OIDC callback and MFA: '+role);}
  const original=await read(fixture.scope.planId),source=original.source;
  const create={commandId:randomUUID(),sourcePlanId:source.planId,expectedSourceRevision:source.revision,expectedEducationRevision:source.educationRevision,unitId:original.unitId,name:'SA – mer matematik',copyFromPlanId:original.id,expectedCopyFromRevision:original.revision};
  const raw=await call('principal','/api/timplaner/gym/planer/skapa',create),made=parseNamedTimplanCreateReply(raw,create);let b=await read(made.id);
  assert.equal(b.version,1);assert.notEqual(b.series.id,original.series.id);assert.deepEqual(b.hours,original.hours);ok('HTTP creates independent named v1 with exact copied hours');
  assert.deepEqual(await call('principal','/api/timplaner/gym/planer/skapa',create),{...raw,replayed:true});ok('HTTP replay keeps immutable create receipt');
  await call('hm','/api/timplaner/gym/planer/skapa',{...create,commandId:randomUUID(),name:'Denied HM'},403);ok('Head authority cannot create school timetable');
  await call('principal2','/api/timplaner/gym/lasa',{planId:b.id},403);ok('Other school cannot read timetable');
  await call('principal','/api/timplaner/gym/planer/skapa',{...create,commandId:randomUUID(),name:create.name.toUpperCase()},409);ok('SQL owns case-insensitive name conflict through actual HTTP');
  await call('principal','/api/timplaner/gym/planer/skapa',{...create,commandId:randomUUID(),name:'Denied origin'},403,{Origin:'http://wrong.invalid'});ok('Same-origin write protection');
  await call('principal','/api/timplaner/gym/planer/skapa',{...create,commandId:randomUUID(),name:'Denied epoch'},409,{'X-Context-Epoch':'999999'});ok('Stale session context rejected');
  const row=b.rows.find(r=>r.key.toLowerCase().includes('mate'));assert.ok(row);const hours=[...b.hours[row.key]],index=hours.findIndex(v=>v!==null);assert.ok(index>=0);hours[index]+=40;
  await call('principal','/api/timplaner/gym/rad',{planId:b.id,expectedRevision:b.revision,rowKey:row.key,hours});b=await read(b.id);
  assert.equal(b.hours[row.key][index],original.hours[row.key][index]+40);assert.deepEqual((await read(original.id)).hours,original.hours);assert.deepEqual(b.rows.map(r=>r.points),original.rows.map(r=>r.points));ok('Actual HTTP adds40 mathematics hours without changing other plan or source points');
  await decide(b.id,'submit','principal');await decide(b.id,'approve','hm');b=await read(b.id);assert.equal(b.status,'faststalld');assert.equal((await read(original.id)).status,'faststalld');ok('Two versions1 are approved simultaneously in different series');
  const scope={offeringId:fixture.scope.offeringId,unitId:original.unitId};const underlag=await call('principal','/api/klasser/organisation/underlag',scope);
  const created=await call('principal','/api/klasser/organisation/skapa',{...scope,commandId:randomUUID(),expectedEducationRevision:underlag.educationRevision,expectedSourceToken:underlag.sourceToken,startsOn:underlag.educationStartsOn,names:['SA API A','SA API B']});assert.equal(created.classes.length,2);ok('Actual HTTP creates two permanent empty classes');
  const links=[];for(const [n,c]of created.classes.entries()){const p=n?b:original;const q={commandId:randomUUID(),classId:c.id,schoolYear:fixture.scope.year,planId:p.id,expectedPlanRevision:p.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null};const reply=await call('admin','/api/klasser/koppla',q);links.push({q,reply});}
  const linked=await call('principal','/api/klasser/underlag',{planId:b.id,schoolYear:fixture.scope.year});assert.equal(linked.classes.find(c=>c.id===created.classes[0].id).link.series.id,original.series.id);assert.equal(linked.classes.find(c=>c.id===created.classes[1].id).link.series.id,b.series.id);ok('Both class links read distinct stable series names');
  const year2={...links[0].q,commandId:randomUUID(),schoolYear:fixture.scope.year+1,columnId:'ar2'};await call('admin','/api/klasser/koppla',year2);
  const beforeLinks=await snapshot.db`select to_jsonb(c) r from public.class_timplans c order by unit_id,class_name,start_year`;
  const rename={commandId:randomUUID(),planId:b.id,seriesId:b.series.id,expectedSeriesRevision:b.series.revision,name:'SA A – utökad matematik'};parseNamedTimplanRenameReply(await call('principal','/api/timplaner/gym/planer/namn',rename),rename);
  assert.deepEqual(await snapshot.db`select to_jsonb(c) r from public.class_timplans c order by unit_id,class_name,start_year`,beforeLinks);ok('Renaming approved plan preserves every explicit class-year link');
  const next=await call('principal','/api/timplaner/gym/skapa',{commandId:randomUUID(),sourcePlanId:source.planId,expectedSourceRevision:source.revision,expectedEducationRevision:source.educationRevision,unitId:original.unitId,predecessorPlanId:original.id,expectedPredecessorRevision:original.revision});
  await decide(next.id,'submit','principal');await decide(next.id,'approve','hm');assert.equal((await read(original.id)).status,'ersatt');assert.equal((await read(b.id)).status,'faststalld');assert.deepEqual(await snapshot.db`select to_jsonb(c) r from public.class_timplans c order by unit_id,class_name,start_year`,beforeLinks);ok('Actual A2 approval leaves B1 and all pre-existing links unchanged');
  // Both classes can explicitly choose B1 for this year. A's second year stays as-is.
  const move={...links[0].q,commandId:randomUUID(),planId:b.id,expectedPlanRevision:b.revision,previousPlanId:original.id,expectedLinkRevision:links[0].reply.revision};await call('admin','/api/klasser/koppla',move);
  const afterMove=await call('principal','/api/klasser/underlag',{planId:b.id,schoolYear:fixture.scope.year});assert.ok(created.classes.every(c=>afterMove.classes.find(x=>x.id===c.id).link.planId===b.id));ok('Two classes explicitly share one named timetable');
  const actual=await read(b.id),mfaRequest={commandId:randomUUID(),planId:b.id,seriesId:actual.series.id,expectedSeriesRevision:actual.series.revision,name:'SA – MFA återställd'};
  await fixture.expireMfa(pages.principal,'principal');const denied=await call('principal','/api/timplaner/gym/planer/namn',mfaRequest,403);assert.equal(denied.code,'mfa_required');await fixture.login(pages.principal,'principal',{stepUp:true});await call('principal','/api/timplaner/gym/planer/namn',mfaRequest);ok('Expired MFA followed by real bound step-up retries exact command');
  const units=parseGymTimplanUnderlag(await call('principal','/api/timplaner/gym/underlag',{sourcePlanId:source.planId}),source.planId).units;assert.ok(units.find(u=>u.unitId===original.unitId).plans.some(p=>p.id===b.id&&p.series.name==='SA – MFA återställd'));ok('SQL-server-client underlag parity includes every named series');
  const beforeAudit=(await snapshot.db`select count(*)::int n from public.named_timplan_commands`)[0].n;
  await snapshot.db.unsafe(`create function pg_temp.fail_named_http() returns trigger language plpgsql as $$begin if new.customer_id='${fixture.scope.customerId}' and new.source='worker' and new.action='named_timplan_created' and new.outcome='ok' then raise exception 'synthetic audit failure';end if;return new;end$$;create trigger named_http_audit_fail before insert on public.security_events for each row execute function pg_temp.fail_named_http();`);
  try{await call('principal','/api/timplaner/gym/planer/skapa',{...create,commandId:randomUUID(),name:'Audit must rollback',copyFromPlanId:null,expectedCopyFromRevision:null},503);}finally{await snapshot.db`drop trigger named_http_audit_fail on public.security_events`;}
  assert.equal((await snapshot.db`select count(*)::int n from public.named_timplan_commands`)[0].n,beforeAudit);ok('Actual Worker audit failure rolls back command and receipt');
  await fixture.revoke('admin');await call('admin','/api/timplaner/gym/lasa',{planId:b.id},401);ok('Revoked membership loses access on next actual request');
  return{approvedPlanId:b.id,newVersionId:next.id,classes:created.classes};
 }finally{for(const p of Object.values(pages))await p.context().close();}
}
