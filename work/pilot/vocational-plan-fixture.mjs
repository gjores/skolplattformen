// Deterministic, frozen-catalog references used only by isolated synthetic proofs.
import assert from 'node:assert/strict';
import { defaultProgramplanChoiceBlocks } from '../../web/lib/programplan-choice-blocks.ts';
import { programplanTermRows, programplanLevelRanks, suggestProgramplanTerms } from '../../web/lib/programplan-terms.ts';
import { nextCohortStart } from '../../web/lib/programplan-lifecycle.ts';
export const vocationalCodes=['BA25','BF25','EE25','FR25','FS25','FT25','HT25','IN25','NB25','RL25','VF25','VO25'];
export function vocationalFixture(catalog,code,catalogId=catalog.catalogId) {
 const program=catalog.programs.find(p=>p.code===code);
 assert.ok(program,'Frozen national program missing');
 const points=['BF25','HT25','VO25'].includes(code)?2700:2800;
 const hours=points===2700?2625:2720;
 const orientationCode=program.orientations[0]?.code??null;
 const reference={catalogId,programRef:{code,version:program.version},orientationCode,startedOn:nextCohortStart(),specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,orientationCode)};
 const missing=points-programplanTermRows(program,reference).reduce((sum,row)=>sum+row.points,0);
 assert.ok(missing>=0,'Frozen program exceeds national frame');
 if(missing)reference.choiceBlocks.push({id:'yrkesp',kind:'specialization',name:'Programfördjupning',points:missing});
 const rows=programplanTermRows(program,reference);
 const terms=suggestProgramplanTerms(rows,[],programplanLevelRanks(program));
 assert.equal(rows.reduce((sum,row)=>sum+row.points,0),points);
 return {program,reference,rows,terms,points,hours};
}
