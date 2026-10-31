// Synthetic approved GY frame, derived from the VB02B verifier's tested fixture.
import{randomUUID}from'node:crypto';import{readFileSync}from'node:fs';
import{vocationalFixture}from'./vocational-plan-fixture.mjs';
export async function seedElectiveTimeFrame(t,f,htOnly=false){
 const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8')),{reference,rows,terms}=vocationalFixture(catalog,'BF25'),year=Number(reference.startedOn.slice(0,4));
 const iv=terms.find(r=>r.rowKey==='block:iv1');iv.points=htOnly?[200,0,0,0,0,0]:[100,100,0,0,0,0];const offeringId=randomUUID();
 await f.actor(t,'hm');await t`insert into public.school_unit_types(unit_id,school_type) values(${f.schools.A},'GY') on conflict do nothing`;
 await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${offeringId},${f.id(2)},${f.schools.A},'gymnasium','Syntetisk IV-tidsram','Syntetisk kull','BF25',${reference.orientationCode},${year})`;
 const pid=(await t`select public.phase5_create_programplan_draft(${offeringId},0,${t.json(reference)}) value`)[0].value.id;
 await f.actor(t,'principalA');await t`select public.phase5_write_programplan_terms(${pid},0,${t.json(terms)})`;
 const decide=async(kind,planId,action)=>{const d=(await t`select public.phase5_plan_decision_basis(${kind},${planId}) value`)[0].value.result;await t`select public.phase5_plan_decision_command(${t.json({kind,planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'Syntetisk kontroll',confirmedChecks:d.checks.map(c=>c.id)})})`;};
 await decide('programplan',pid,'submit');await f.actor(t,'hm');await decide('programplan',pid,'approve');await f.actor(t,'principalA');
 const rev=(await t`select revision from public.point_plans where id=${pid}`)[0].revision;
 const made=(await t`select public.phase5_create_gym_timplan(${randomUUID()},${pid},${rev},0,${f.schools.A},null,null) value`)[0].value;
 let gym=(await t`select public.phase5_gym_timplan_result(${made.reply.id}) value`)[0].value;
 const aplKey=rows.find(r=>!r.key.startsWith('block:')&&!r.key.startsWith('meta:')&&terms.find(x=>x.rowKey===r.key).points[0]>0).key;
 for(const r of rows){const points=terms.find(x=>x.rowKey===r.key).points,row={schoolMinutes:points.map(p=>p>0?p*60:null),annualAplMinutes:[0,1,2].map(i=>points[i*2]+points[i*2+1]>0?(r.key===aplKey&&i===0?20700:0):null)};
 if(r.key==='block:iv1')row.schoolMinutes=htOnly?[10800,null,null,null,null,null]:[5400,5400,null,null,null,null];
 gym=(await t`select public.phase5_timplan_time_command(${t.json({contractVersion:'timplan_time_v2',action:'save_row',commandId:randomUUID(),planId:gym.id,expectedRevision:gym.revision,rowKey:r.key,row})}) value`)[0].value.plan;}
 await decide('timplan',gym.id,'submit');await f.actor(t,'hm');await decide('timplan',gym.id,'approve');await f.actor(t,'principalA');
 const plan=(await t`select revision from public.timplans where id=${gym.id}`)[0],klass=(await t`select public.phase5_class_command(${t.json({operation:'create',commandId:randomUUID(),planId:gym.id,expectedPlanRevision:plan.revision,name:'SYN-IV-'+offeringId.slice(0,6).toUpperCase(),startYear:year})}) value`)[0].value;
 await t`select public.phase5_class_command(${t.json({operation:'link',commandId:randomUUID(),classId:klass.id,schoolYear:year,planId:gym.id,expectedPlanRevision:plan.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null})})`;
 return{unitId:f.schools.A,schoolYear:year,frameSourceKey:`class_timplan:${klass.id}:${year}:block:iv1`};
}
