// Tests only self-created fixtures; never updates an existing school/offering.
// node --env-file=web/.env.local work/supabase/verify-cohorts.mjs
import assert from 'node:assert/strict';
import { supabase, signInDemo } from '../../web/lib/supabase.ts';
import { copyCohortInDatabase,saveClassTimplan,loadClassTimplans,deleteClassTimplan } from '../../web/lib/cohort-store.ts';
await signInDemo('Kontroll av elevkullar');
const db=supabase();
const checked=async query=>{const {data,error}=await query;if(error)throw new Error(error.message);return data;};
const org=await checked(db.rpc('current_organizer_id'));
const unitIds=[];
try {
  const unit=await checked(db.from('school_units').insert({organizer_id:org,code:String(90000000+Math.floor(Math.random()*9999999)),name:'Tillfällig kontroll av elevkullar',municipality_code:'0000'}).select('id').single());unitIds.push(unit.id);
  const source=await checked(db.from('offerings').insert({organizer_id:org,unit_id:unit.id,kind:'gymnasium',name:'Kontroll SA',program_code:'SA25',orientation_code:'SASAP',cohort:'Elever som börjar HT 2026'}).select('id').single());
  const pp=await checked(db.from('point_plans').insert({organizer_id:org,offering_id:source.id,version:1,specialization:['ENGE3000X']}).select('id').single());
  const tp=await checked(db.from('timplans').insert({organizer_id:org,offering_id:source.id,version:1,basis:'Poängplan v1'}).select('id').single());
  await checked(db.from('timplan_cells').insert({timplan_id:tp.id,row_id:'ENGE3000X',hours:[0,50,50]}));
  await checked(db.from('point_plans').update({status:'faststalld',decided_on:'2026-09-08'}).eq('id',pp.id));
  await checked(db.from('timplans').update({status:'faststalld',decided_on:'2026-09-08'}).eq('id',tp.id));
  const copiedId=await copyCohortInDatabase(source.id,2027);
  const copied=await checked(db.from('offerings').select('*').eq('id',copiedId).single());
  assert.equal(copied.cohort,'Elever som börjar HT 2027');assert.equal(copied.status,'planerad');
  const copiedPP=await checked(db.from('point_plans').select('*').eq('offering_id',copiedId).single());
  assert.equal(copiedPP.status,'utkast');assert.equal(copiedPP.decided_on,null);assert.deepEqual(copiedPP.specialization,['ENGE3000X']);
  const copiedTP=await checked(db.from('timplans').select('*').eq('offering_id',copiedId).single());
  const cells=await checked(db.from('timplan_cells').select('hours').eq('timplan_id',copiedTP.id).single());
  assert.deepEqual(cells.hours,[0,50,50]);assert.equal(copiedTP.status,'utkast');
  await assert.rejects(()=>copyCohortInDatabase(source.id,2027),/redan/);
  await assert.rejects(()=>copyCohortInDatabase(source.id,2026),/efter/);
  const b={unitId:unit.id,className:'SA27A',startYear:2027,timplanId:copiedTP.id,columnId:'ar1'};
  await assert.rejects(()=>saveClassTimplan(b),/fastställd/);
  await checked(db.from('timplans').update({status:'faststalld',decided_on:'2026-09-08'}).eq('id',copiedTP.id));
  await saveClassTimplan(b);
  assert.deepEqual((await loadClassTimplans(unit.id))[0],b);
  await assert.rejects(()=>saveClassTimplan({...b,columnId:'ak8'}),/årskurs/);
  await saveClassTimplan({...b,columnId:'ar2'});
  assert.equal((await loadClassTimplans(unit.id))[0].columnId,'ar2');
  const other=await checked(db.from('school_units').insert({organizer_id:org,code:String(90000000+Math.floor(Math.random()*9999999)),name:'Tillfällig kontroll av skolgräns',municipality_code:'0000'}).select('id').single());unitIds.push(other.id);
  await assert.rejects(()=>saveClassTimplan({...b,unitId:other.id}),/annan skolenhet/);
  // A later decision must not silently reassign a class to its newest version.
  await checked(db.from('timplans').update({status:'ersatt'}).eq('id',copiedTP.id));
  assert.equal((await loadClassTimplans(unit.id))[0].timplanId,copiedTP.id);
  await deleteClassTimplan(b);assert.equal((await loadClassTimplans(unit.id)).length,0);
  const original=await checked(db.from('timplan_cells').select('hours').eq('timplan_id',tp.id).single());assert.deepEqual(original.hours,[0,50,50]);
  console.log('PASS: cloud copy preserves courses/hours as drafts, rejects duplicate/earlier cohort, persists class mapping, validates decision/column/school and preserves historical version.');
} finally {
  for(const id of unitIds){
    await checked(db.from('class_timplans').delete().eq('unit_id',id));
    await checked(db.from('school_units').delete().eq('id',id));
  }
  console.log('Temporary school fixtures removed.');
}
