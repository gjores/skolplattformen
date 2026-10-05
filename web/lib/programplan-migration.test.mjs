import test from 'node:test';
import assert from 'node:assert/strict';
import {parseApplyArgs} from '../../work/pilot/apply-programplan-migration.mjs';
for (const migration of ['20261004140000_phase5_offering_unit_linkage.sql','20261004141000_phase5_timplan_units.sql']) {
 test(`05-22 målskydd tillåter exakt ${migration} utan grants`,()=>{
  assert.deepEqual(parseApplyArgs(['--migration',migration]),{migration,grants:null});
  assert.throws(()=>parseApplyArgs(['--migration',migration,'--grants','any.json']),/grants not allowed/);
 });
}
test('05-22 målskydd vägrar okända migrationsfiler och sökvägar',()=>{
 for(const name of ['20261004142000_other.sql','../20261004140000_phase5_offering_unit_linkage.sql','/tmp/20261004141000_phase5_timplan_units.sql'])assert.throws(()=>parseApplyArgs(['--migration',name]),/unknown migration/);
});
test('05-22 målskydd behåller grind för Worker-grant och vägrar fjärrflaggor',()=>{
 assert.throws(()=>parseApplyArgs(['--migration','20261004121000_phase5_worker_programplan_lifecycle.sql']),/preflight.json.*required/);
 assert.throws(()=>parseApplyArgs(['--migration','20261004140000_phase5_offering_unit_linkage.sql','--linked']),/REFUSED/);
});

test('05-22 journalrättning är begränsad till den exakta backfillmigrationen',()=>{
 const migration='20261004141000_phase5_timplan_units.sql';
 assert.deepEqual(parseApplyArgs(['--migration',migration,'--sync-backfill-journal','proof.json']),{migration,grants:null,backfillJournal:'proof.json'});
 assert.throws(()=>parseApplyArgs(['--migration','20261004140000_phase5_offering_unit_linkage.sql','--sync-backfill-journal','proof.json']),/only for reviewed/);
});
test('05-22 journalrättning kräver rätt källa och faktiskt rollbackbevis',async()=>{
 const {readFileSync}=await import('node:fs');const {verifyBackfillJournal}=await import('../../work/pilot/apply-programplan-migration.mjs');
 const source=readFileSync(new URL('../../supabase/migrations/20261004141000_phase5_timplan_units.sql',import.meta.url),'utf8');
 const before=source.replace('-- Backfill är schemaunderhåll, inte en verksamhetsändring. Bevara ändringstid.\nalter table public.timplans disable trigger timplans_touch;\n','').replace('alter table public.timplans enable trigger timplans_touch;\n','');
 const proof={target:'protected',status:'PASS',fullExistingTimplanRowsPreserved:true,unitIdBackfilled:true,touchTriggerRestored:true,rollback:true,reset:false,sourceHash:'653fd5fdf8233c29293004da8ab31a91ee750d47688f8519b1f5e368e6db559e'};
 assert.doesNotThrow(()=>verifyBackfillJournal(before,source,proof));
 assert.throws(()=>verifyBackfillJournal(before,source+'\n',proof),/not the reviewed/);
 assert.throws(()=>verifyBackfillJournal(before+'\n',source,proof),/not the reviewed/);
 for(const change of [{status:'FAIL'},{target:'baseline'},{rollback:false},{fullExistingTimplanRowsPreserved:false},{touchTriggerRestored:false},{sourceHash:'other'}])assert.throws(()=>verifyBackfillJournal(before,source,{...proof,...change}),/rollback proof required/);
});

test('05-23 A målskydd tillåter exakt blockunderlaget och inga grants',()=>{
 const migration='20261004150000_phase5_programplan_choice_blocks.sql';
 assert.deepEqual(parseApplyArgs(['--migration',migration]),{migration,grants:null});
 assert.throws(()=>parseApplyArgs(['--migration',migration,'--grants','proof.json']),/grants not allowed/);
 for(const name of ['20261004156000_unknown.sql','../'+migration])assert.throws(()=>parseApplyArgs(['--migration',name]),/unknown migration/);
 assert.throws(()=>parseApplyArgs(['--migration',migration,'--sync-backfill-journal','proof.json']),/only for reviewed/);
});


test('05-23 A numerisk rättning är en separat migration utan grants eller journalrättning',()=>{
 const migration='20261004150100_phase5_programplan_block_numeric.sql';
 assert.deepEqual(parseApplyArgs(['--migration',migration]),{migration,grants:null});
 assert.throws(()=>parseApplyArgs(['--migration',migration,'--grants','proof.json']),/grants not allowed/);
 assert.throws(()=>parseApplyArgs(['--migration',migration,'--sync-backfill-journal','proof.json']),/only for reviewed/);
});

for (const migration of ['20261004151000_phase5_programplan_block_commands.sql','20261004152000_phase5_programplan_shape_upgrade.sql','20261004152100_phase5_programplan_block_clone_identity.sql']) test(`B allows exact ${migration} without grants`,()=>{
 assert.deepEqual(parseApplyArgs(['--migration',migration]),{migration,grants:null});assert.throws(()=>parseApplyArgs(['--migration',migration,'--grants','proof.json']),/grants not allowed/);
});
test('B worker entrypoint requires preflight proof',()=>{
 const migration='20261004153000_phase5_worker_programplan_blocks.sql';assert.throws(()=>parseApplyArgs(['--migration',migration]),/preflight.json.*required/);
 assert.deepEqual(parseApplyArgs(['--migration',migration,'--grants','proof.json']),{migration,grants:'proof.json'});
});

 test('C foundation and grants are separate; B proof cannot open C',async()=>{
 const {verifyPreflight}=await import('../../work/pilot/apply-programplan-migration.mjs');const {createHash}=await import('node:crypto');
 const foundation='20261004154000_phase5_programplan_unit_packages.sql',grant='20261004155000_phase5_worker_programplan_unit_packages.sql';
 assert.deepEqual(parseApplyArgs(['--migration',foundation]),{migration:foundation,grants:null});assert.throws(()=>parseApplyArgs(['--migration',foundation,'--grants','proof.json']),/not allowed/);
 assert.throws(()=>parseApplyArgs(['--migration',grant]),/required/);
 const content='reviewed';const hash=createHash('sha256').update(content).digest('hex');const proof={kind:'phase5-programplan-blocks-api',step:'c',status:'PASS',preflight:true,preflightAclRestored:true,cleanupStatus:'PASS',originalBusinessPreserved:true,complete:true,sourceHashes:Object.fromEntries([1,2,3,4,5].map(i=>['source'+i,hash]))};
 assert.doesNotThrow(()=>verifyPreflight(proof,()=>content,proof.kind,'c'));assert.throws(()=>verifyPreflight({...proof,step:'b'},()=>content,proof.kind,'c'),/matching block step/);assert.throws(()=>verifyPreflight(proof,()=>content+'changed',proof.kind,'c'),/source changed/);
 });
