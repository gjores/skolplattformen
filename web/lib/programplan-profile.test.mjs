import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './programplan-catalog.generated.json' with {type:'json'};
import {programplanProfile, vocationalEligibilityComplete, VOCATIONAL_GY25_CODES} from './programplan-profile.ts';
import {programFrame} from './programplan-table.ts';
import {programplanTermRows, programplanLevelRanks, suggestProgramplanTerms} from './programplan-terms.ts';
import {defaultProgramplanChoiceBlocks} from './programplan-choice-blocks.ts';
import {analyseProgramplan} from './programplan-analysis.ts';

test('every national vocational Gy25 programme has exact full scope and all orientations fit without duplicate Swedish',()=>{
 assert.equal(VOCATIONAL_GY25_CODES.length,12);
 for(const code of VOCATIONAL_GY25_CODES){
  const p=catalog.programs.find(p=>p.code===code), expected=['BF25','HT25','VO25'].includes(code)?[2700,2625]:[2800,2720];
  assert.deepEqual(programplanProfile(p),{points:expected[0],hours:expected[1],vocational:true});
  assert.equal(vocationalEligibilityComplete(p),true,code);
  for(const orientationCode of p.orientations.length?p.orientations.map(o=>o.code):[null]){
   const frame=programFrame(p,orientationCode),choiceBlocks=defaultProgramplanChoiceBlocks(p,orientationCode);
   assert.equal(frame.total,expected[0]);assert.ok(frame.specializationRoom>=0);
   if(frame.specializationRoom)choiceBlocks.push({id:'fordj',name:'Programfördjupning',kind:'specialization',points:frame.specializationRoom});
   const basis={catalogId:catalog.catalogId,programRef:{code,version:p.version},orientationCode,startedOn:'2027-08-01',specializationRefs:[],choiceBlocks};
   const rows=programplanTermRows(p,basis);
   assert.equal(rows.reduce((n,r)=>n+r.points,0),expected[0],`${code}/${orientationCode}`);
   const alternatives=rows.filter(r=>r.key.startsWith('alternative:foundation:'));
   assert.equal(alternatives.length,3);assert.equal(alternatives.reduce((n,r)=>n+r.points,0),300);
   const ranks=programplanLevelRanks(p),distribution=suggestProgramplanTerms(rows,[],ranks);
   const analysis=analyseProgramplan({program:p,orientationCode,refs:[],startedOn:basis.startedOn,sourceFetched:null,basisReference:basis,terms:{rows,distribution,ranks}});
   assert.equal(analysis.ready,true,`${code}/${orientationCode}: ${analysis.missing.join(', ')}`);
  }
 }
});
test('unknown codes and mismatched categories have no fallback profile; HE remains 2500/2180',()=>{
 for(const code of ['EK25','ES25','HU25','NA25','SA25','TE25'])assert.deepEqual(programplanProfile(catalog.programs.find(p=>p.code===code)),{points:2500,hours:2180,vocational:false});
 for(const input of [{code:'ZZ25',category:'VOCATIONAL_PROGRAM'},{code:'BF',category:'VOCATIONAL_PROGRAM'},{code:'BF25',category:'PRELIMINARY_PROGRAM_FOR_HIGHER_EDUCATION'},{code:'SA25',category:'VOCATIONAL_PROGRAM'},catalog.programs.find(p=>p.code==='FL25')])assert.equal(programplanProfile(input),null);
});
test('missing, duplicated and nonalternative eligibility levels are rejected independently of total',()=>{
 const p=catalog.programs.find(p=>p.code==='BF25');
 for(const mutate of [p=>p.foundation.find(s=>s.code==='ENGE').levels.pop(),p=>p.foundation.find(s=>s.code==='SVEN').optional=false,p=>p.foundation.find(s=>s.code==='SVEA').levels[2].points=50,p=>p.foundation.find(s=>s.code==='SVEN').levels.push(p.foundation.find(s=>s.code==='SVEN').levels[0])]){
  const changed=structuredClone(p);mutate(changed);assert.equal(vocationalEligibilityComplete(changed),false);
 }
});
