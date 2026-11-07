// Synthetic approved högskoleförberedande frame with its slot blocks in year 1, so a block row is open for the start year.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {defaultProgramplanChoiceBlocks} from '../../web/lib/programplan-choice-blocks.ts';
import {programplanTermRows,programplanLevelRanks,suggestProgramplanTerms} from '../../web/lib/programplan-terms.ts';
import {nextCohortStart} from '../../web/lib/programplan-lifecycle.ts';
/** One more class on an approved plan, linked for the year. Actor must already be the school's principal. */
export async function linkExtraClass(t,planId,schoolYear,name,columnId='ar1'){
 const revision=async()=>(await t`select revision from public.timplans where id=${planId}`)[0].revision;
 const klass=(await t`select public.phase5_class_command(${t.json({operation:'create',commandId:randomUUID(),planId,expectedPlanRevision:await revision(),name,startYear:schoolYear})}) value`)[0].value;
 await t`select public.phase5_class_command(${t.json({operation:'link',commandId:randomUUID(),classId:klass.id,schoolYear,planId,expectedPlanRevision:await revision(),columnId,expectedLinkRevision:null,previousPlanId:null})})`;
 return klass.id;
}
export async function seedSlotBlockFrame(t,f,code,orientationCode,blockKey){
 const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8')),program=catalog.programs.filter(p=>p.code===code).at(-1);
 const reference={catalogId:catalog.catalogId,programRef:{code,version:program.version},orientationCode,startedOn:nextCohortStart(),specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,orientationCode)};
 const missing=2500-programplanTermRows(program,reference).reduce((sum,row)=>sum+row.points,0);assert.ok(missing>=0,'Frozen program exceeds the frame');
 if(missing)reference.choiceBlocks.push({id:'fordj',kind:'specialization',name:'Programfördjupning',points:missing});
 const rows=programplanTermRows(program,reference),terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(program)),block=terms.find(r=>r.rowKey===blockKey),half=rows.find(r=>r.key===blockKey).points/2;
 block.points=[half,half,0,0,0,0];
 const year=Number(reference.startedOn.slice(0,4)),offeringId=randomUUID();
 await f.actor(t,'hm');await t`insert into public.school_unit_types(unit_id,school_type) values(${f.schools.A},'GY') on conflict do nothing`;
 await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${offeringId},${f.id(2)},${f.schools.A},'gymnasium',${'Syntetisk '+code},'Syntetisk kull',${code},${orientationCode},${year})`;
 const pid=(await t`select public.phase5_create_programplan_draft(${offeringId},0,${t.json(reference)}) value`)[0].value.id;
 await f.actor(t,'principalA');await t`select public.phase5_write_programplan_terms(${pid},0,${t.json(terms)})`;
 const decide=async(kind,planId,action)=>{const b=(await t`select public.phase5_plan_decision_basis(${kind},${planId}) value`)[0].value,d=b.result??b;await t`select public.phase5_plan_decision_command(${t.json({kind,planId,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)})})`;};
 await decide('programplan',pid,'submit');await f.actor(t,'hm');await decide('programplan',pid,'approve');await f.actor(t,'principalA');
 const rev=(await t`select revision from public.point_plans where id=${pid}`)[0].revision;
 const made=(await t`select public.phase5_create_gym_timplan(${randomUUID()},${pid},${rev},0,${f.schools.A},null,null) value`)[0].value;
 const gym={id:made.reply.id};let revision=0;
 for(const r of rows)revision=(await t`select public.phase5_write_gym_timplan_row(${gym.id},${revision},${r.key},${t.json(terms.find(x=>x.rowKey===r.key).points.map(p=>p>0?p:null))}) value`)[0].value.revision;
 await decide('timplan',gym.id,'submit');await f.actor(t,'hm');await decide('timplan',gym.id,'approve');await f.actor(t,'principalA');
 const plan=(await t`select revision from public.timplans where id=${gym.id}`)[0];
 const klass=(await t`select public.phase5_class_command(${t.json({operation:'create',commandId:randomUUID(),planId:gym.id,expectedPlanRevision:plan.revision,name:'SYN-'+code+'-'+offeringId.slice(0,6).toUpperCase(),startYear:year})}) value`)[0].value;
 await t`select public.phase5_class_command(${t.json({operation:'link',commandId:randomUUID(),classId:klass.id,schoolYear:year,planId:gym.id,expectedPlanRevision:plan.revision,columnId:'ar1',expectedLinkRevision:null,previousPlanId:null})})`;
 return{unitId:f.schools.A,schoolYear:year,classId:klass.id,planId:gym.id};
}
