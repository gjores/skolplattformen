import test from 'node:test';
import assert from 'node:assert/strict';
import catalog from './programplan-catalog.generated.json' with {type:'json'};
import {verifyProgramplanCatalog,resolveProgramplanBasis,parseProgramplanBasisReference} from './programplan-catalog.ts';
import {defaultProgramplanChoiceBlocks,programplanChoiceBlocks,parseProgramplanChoiceBlocks} from './programplan-choice-blocks.ts';
const verified=await verifyProgramplanCatalog(catalog), program=catalog.programs.find(p=>p.code==='SA25');
const basis=()=>({catalogId:catalog.catalogId,programRef:{code:program.code,version:program.version},orientationCode:'SASAP',startedOn:'2026-08-01',specializationRefs:[],choiceBlocks:defaultProgramplanChoiceBlocks(program,'SASAP')});
test('standard blocks derive slot names and exact points from pinned program and orientation',()=>{
 const ref=basis();assert.deepEqual(programplanChoiceBlocks(program,ref).map(b=>[b.id,b.kind,b.points,b.part,b.rowKey]),[['mosp','modernLanguage',200,'programmeSpecific','block:mosp'],['iv1','individualChoice',200,'individualChoice','block:iv1']]);
 assert.deepEqual(parseProgramplanBasisReference(ref),ref);
 const legacy={...ref};delete legacy.choiceBlocks;assert.deepEqual(parseProgramplanBasisReference(legacy),legacy);assert.deepEqual(programplanChoiceBlocks(program,legacy),[]);
});
test('closed blocks reject malformed shapes, accessors, sparse arrays and unknown kinds',()=>{
 const block=basis().choiceBlocks[0];
 for(const value of [null,{},Array(1),[{...block,id:'Upper'}],[{...block,points:0}],[{...block,points:0.5}],[{...block,name:' '}],[{...block,kind:'module'}],[{...block,extra:1}],Array.from({length:201},()=>block)])assert.throws(()=>parseProgramplanChoiceBlocks(value),e=>e.code==='invalid_choice_blocks');
 const accessor={...block};Object.defineProperty(accessor,'name',{get(){throw Error('must not execute');},enumerable:true});assert.throws(()=>parseProgramplanChoiceBlocks([accessor]),e=>e.code==='invalid_choice_blocks');
});
test('resolver reports missing duplicate mismatched and unexpected slots, IV totals and unknown kinds',()=>{
 const ref=basis(),[slot,iv]=ref.choiceBlocks;
 for(const [choiceBlocks,code] of [[[iv],'missing_slot_block'],[[slot,slot,iv],'duplicate_choice_block'],[[{...slot,points:100},iv],'slot_block_mismatch'],[[{...slot,name:'Wrong'},iv],'slot_block_mismatch'],[[slot,iv,{id:'nave',kind:'naturalScience',points:100,name:'Wrong'}],'unexpected_slot_block'],[[slot,{...iv,points:201}],'individual_choice_points_mismatch'],[[slot,{...iv,kind:'module'}],'invalid_choice_blocks']]){
 const r=resolveProgramplanBasis(verified,{...ref,choiceBlocks});assert.equal(r.status,'blocked');assert.ok(r.diagnostics.some(d=>d.code===code),JSON.stringify(r.diagnostics));assert.equal(r.basis,null);
 }
 const split={...ref,choiceBlocks:[slot,{...iv,points:100},{...iv,id:'iv2',points:100}]};assert.equal(resolveProgramplanBasis(verified,split).status,'resolved');
});
test('v2 removes only solved alternatives and slot diagnostics; legacy remains exact',()=>{
 const ref=basis(),legacy={...ref};delete legacy.choiceBlocks;
 const old=resolveProgramplanBasis(verified,legacy),v2=resolveProgramplanBasis(verified,ref);
 assert.equal(v2.status,'resolved');assert.ok(old.unresolvedChoices.some(c=>c.subjectCode==='SVEN'));assert.ok(old.unresolvedChoices.some(c=>c.subjectCode==='MOSP'));
 assert.equal(v2.unresolvedChoices.some(c=>['SVEN','SVEA','MOSP'].includes(c.subjectCode)),false);
 assert.ok(v2.unresolvedChoices.some(c=>c.kind==='program_rules_unverified'));
 const hu=catalog.programs.find(p=>p.code==='HU25'),hur={...ref,programRef:{code:hu.code,version:hu.version},orientationCode:'HUSPK',choiceBlocks:defaultProgramplanChoiceBlocks(hu,'HUSPK')};
 assert.ok(resolveProgramplanBasis(verified,hur).unresolvedChoices.some(c=>['MODA1','MODA2','MODA3'].includes(c.subjectCode)));
});

test('contract-valid constructor and prototype IDs remain safe array entries and exact block rows',()=>{
 const ref=basis();ref.choiceBlocks.push({id:'constructor',kind:'specialization',points:100,name:'Konstruktion'},{id:'prototype',kind:'specialization',points:100,name:'Prototyper'});
 const original=structuredClone(ref),parsed=parseProgramplanBasisReference(ref),resolved=resolveProgramplanBasis(verified,parsed);
 assert.equal(resolved.status,'resolved');assert.deepEqual(parsed,original);
 assert.deepEqual(programplanChoiceBlocks(program,parsed).slice(-2).map(b=>[b.id,b.rowKey,b.part]),[['constructor','block:constructor','specialization'],['prototype','block:prototype','specialization']]);
 assert.deepEqual(ref,original);assert.equal(Object.getPrototypeOf(parsed.choiceBlocks),Array.prototype);
 assert.equal(Object.getPrototypeOf(parsed.choiceBlocks.at(-1)),Object.prototype);assert.equal(Object.hasOwn(Object.prototype,'points'),false);
});
