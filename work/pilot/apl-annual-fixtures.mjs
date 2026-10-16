// Owned synthetic fixtures, seeded before the additive annual-time migrations.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { aplUxFixture } from './apl-ux-fixtures.mjs';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';
import { programplanTermRows,programplanLevelRanks,suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';
import { nextCohortStart } from '../../web/lib/programplan-lifecycle.ts';
export async function seedAplAnnualActualFixture(snapshot){
 assert.match(snapshot.provenance.database,/^named_timplan_[0-9a-f]{32}$/u);
 assert.equal((await snapshot.db`select current_database() name`)[0].name,snapshot.provenance.database);
 return snapshot.db.begin(async tx=>{
  const f=await aplUxFixture(tx),{id,actor}=f;
  const catalog=JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json',import.meta.url),'utf8'));
  const catalogId=(await tx`select catalog_id from public.point_plans where id=${f.programId}`)[0].catalog_id;
  const program=catalog.programs.find(p=>p.code==='SA25'&&p.version===4);
  const reference={catalogId,programRef:{code:'SA25',version:4},orientationCode:'SABEP',startedOn:nextCohortStart(),specializationRefs:[{subjectCode:'ENGE',subjectVersion:1,itemCode:'ENGE3000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM1000X',points:100},{subjectCode:'ANIM',subjectVersion:1,itemCode:'ANIM2000X',points:100}],choiceBlocks:defaultProgramplanChoiceBlocks(program,'SABEP')};
  const rows=programplanTermRows(program,reference),terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(program)),offeringId=randomUUID();
  await actor('hm');await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year) values(${offeringId},${id(2)},${id(30)},'gymnasium','Syntetisk högskoleförberedande års-APL-kontroll','Syntetisk framtida kull','SA25','SABEP',${Number(reference.startedOn.slice(0,4))})`;
  const prep=(await tx`select public.phase5_create_programplan_draft(${offeringId},0,${tx.json(reference)}) value`)[0].value.id;
  await actor('principal');await tx`select public.phase5_write_programplan_terms(${prep},0,${tx.json(terms)})`;
  const decide=async action=>{const d=(await tx`select public.phase5_plan_decision_basis('programplan',${prep}) value`)[0].value.result;
   return tx`select public.phase5_plan_decision_command(${tx.json({kind:'programplan',planId:prep,commandId:randomUUID(),action,expectedRevision:d.revision,expectedDecisionRevision:d.decisionRevision,basisHash:d.basisHash,comment:'',confirmedChecks:d.checks.map(c=>c.id)})})`;};
  await decide('submit');await actor('hm');await decide('approve');await actor('principal');
  const revision=(await tx`select revision from public.point_plans where id=${prep}`)[0].revision;
  const prepPlan=(await tx`select public.phase5_create_gym_timplan(${randomUUID()},${prep},${revision},0,${id(30)},null,null) value`)[0].value.reply.id;
  await tx`set constraints all immediate`;
  return{ids:Object.fromEntries([1,2,10,11,12,13,20,21,22,23,30,31,46].map(n=>[n,id(n)])),roles:f.roles,programId:f.programId,planId:f.planId,year:f.year,
   preparatory:{programId:prep,planId:prepPlan,offeringId}};
 });
}
