#!/usr/bin/env node
// APL-CENTRAL-CONTENT: installation i den skyddade lokala databasen.
// Kör: node work/pilot/apply-apl-central-content.mjs --sql-evidence /private/tmp/x.json [--apply]
// Utan --apply körs migrationerna i en transaktion som alltid rullas tillbaka.
// --apply upprepar först samma prov och installerar sedan i en egen transaktion som journalförs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {assertTarget} from './verify-target.mjs';
import {schemaFingerprint} from './named-timplan-snapshot.mjs';
import {catalogColumns,projectionHashes} from './verify-class-cohort.mjs';
import {centralMigrations} from './verify-apl-central-content.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const sha=v=>createHash('sha256').update(v).digest('hex');
const sources=Object.fromEntries(centralMigrations.map(p=>[p,sha(readFileSync(resolve(root,p)))]));
const versions=centralMigrations.map(p=>p.split('/').pop().slice(0,14));
const newTables=['apl_content_central_items','syllabus_central_catalogs','syllabus_central_items'];
const changedFunctions=['phase5_apl_copy_structure(uuid,uuid)','phase5_apl_hash_payload(jsonb,uuid,jsonb,jsonb,jsonb)','phase5_apl_plan_command(jsonb)','phase5_apl_plan_parse(jsonb)','phase5_apl_plan_value(uuid)'];
const addedFunctions=['phase5_apl_content_hash_entry(jsonb)','phase5_apl_content_valid(jsonb)','phase5_apl_insert_content(uuid,uuid,jsonb)','phase5_apl_syllabus_ref(text)','phase5_syllabus_central_immutable()'];
const rollback=Error('apl_central_rollback');
const fn=s=>s.replace(/^public\./u,'').replaceAll(', ',',');

const args=process.argv.slice(2),mode=args.includes('--apply')?'--apply':'--verify';
const evidencePath=args[args.indexOf('--sql-evidence')+1];
assert.ok(args.indexOf('--sql-evidence')>=0&&evidencePath?.startsWith('/private/tmp/'),'--sql-evidence /private/tmp/... krävs');
const evidence=JSON.parse(readFileSync(evidencePath,'utf8'));
const report={kind:'apl-central-content-installation',mode,sources,sqlEvidence:{path:evidencePath,sha256:sha(readFileSync(evidencePath))},checks:[]};
const check=(name,ok,detail)=>{report.checks.push({name,ok,...(detail===undefined?{}:{detail})});assert.ok(ok,`${name}: ${JSON.stringify(detail)}`);};

// Exakt värde för varje befintlig APL-plan. Hashen kräver en inloggad aktör och prövas i stället
// i den isolerade SQL-kopian (frysta hashvektorer); samma värde ger där samma hash.
const aplState=async tx=>Object.fromEntries((await tx`select plan_id::text id,public.phase5_apl_plan_value(plan_id) value from public.apl_plan_underlag order by plan_id`).map(r=>[r.id,r.value]));
const recorded=async tx=>(await tx`select count(*)::int n from supabase_migrations.schema_migrations where version=any(${versions}::text[])`)[0].n;

async function installAndCheck(tx,label){
 await tx`set local lock_timeout='5s'`;await tx`set local statement_timeout='120s'`;
 check(label+': migrations not yet recorded',await recorded(tx)===0);
 const beforeStructure=await schemaFingerprint(tx,true),originalColumns=await catalogColumns(tx),beforeRows=await projectionHashes(tx,originalColumns),beforeApl=await aplState(tx);
 report.existingAplPlans=Object.keys(beforeApl).length;
 for(const p of centralMigrations)await tx.unsafe(readFileSync(resolve(root,p),'utf8'));
 await tx`set constraints all immediate`;
 const afterStructure=JSON.parse(JSON.stringify(await schemaFingerprint(tx,true))),afterRows=await projectionHashes(tx,originalColumns),before=JSON.parse(JSON.stringify(beforeStructure));
 for(const [table,hash] of Object.entries(beforeRows))assert.deepEqual(afterRows[table],hash,'Original rows changed: '+table);
 check(label+': every original row unchanged in its original columns',true,Object.keys(beforeRows).length);
 const tables=s=>s.tables.filter(t=>t.relkind==='r').map(t=>t.relname);
 const rels=st=>st.tables.filter(t=>!newTables.includes(t.relname)&&!t.relname.startsWith('apl_content_central_items')&&!t.relname.startsWith('syllabus_central_items')&&!t.relname.startsWith('syllabus_central_catalogs')).map(t=>JSON.stringify(t));
 const relAdded=rels(afterStructure).filter(t=>!rels(before).includes(t)).map(t=>JSON.parse(t).relname);
 check(label+': existing relations unchanged apart from the new unique content index',rels(before).every(t=>rels(afterStructure).includes(t))&&JSON.stringify(relAdded)==='["apl_period_contents_central_unique"]',relAdded);
 check(label+': exactly three new tables',JSON.stringify(tables(afterStructure).filter(t=>!tables(before).includes(t)).sort())===JSON.stringify(newTables),tables(afterStructure).filter(t=>!tables(before).includes(t)));
 const oldTables=new Set(tables(before)),newIndexes=new Set(['apl_period_contents_central_unique']);
 const cols=s=>s.columns.filter(c=>oldTables.has(c.relname)||!newTables.includes(c.relname)&&!newIndexes.has(c.relname)&&!c.relname.startsWith('apl_content_central_items')&&!c.relname.startsWith('syllabus_central_')).map(c=>JSON.stringify(c));
 const added=cols(afterStructure).filter(c=>!cols(before).includes(c)).map(c=>JSON.parse(c)),removed=cols(before).filter(c=>!cols(afterStructure).includes(c));
 check(label+': only apl_period_contents gains other_content and central_catalog_id',removed.length===0&&JSON.stringify(added.map(c=>c.relname+'.'+c.attname).sort())==='["apl_period_contents.central_catalog_id","apl_period_contents.other_content"]',{added:added.map(c=>c.relname+'.'+c.attname),removed});
 const others=(s,key)=>s[key].filter(x=>!newTables.includes(x.relname??x.tablename)).map(x=>JSON.stringify(x));
 const constraintDiff=others(afterStructure,'constraints').filter(c=>!others(before,'constraints').includes(c)).map(c=>JSON.parse(c).conname);
 check(label+': existing tables gain only the new content constraints',others(before,'constraints').every(c=>others(afterStructure,'constraints').includes(c))
  &&JSON.stringify(constraintDiff.sort())==='["apl_period_contents_central_catalog_id_fkey","apl_period_contents_central_unique","apl_period_contents_other_content_check"]',constraintDiff);
 for(const key of ['triggers','policies'])check(label+': existing '+key+' unchanged',JSON.stringify(others(before,key))===JSON.stringify(others(afterStructure,key)));
 const idx=others(afterStructure,'indexes').filter(c=>!others(before,'indexes').includes(c)).map(c=>JSON.parse(c).indexname);
 check(label+': existing tables gain only the unique content index',others(before,'indexes').every(c=>others(afterStructure,'indexes').includes(c))&&JSON.stringify(idx)==='["apl_period_contents_central_unique"]',idx);
 const changed=[],metadata=[];
 for(const old of before.functions){const next=afterStructure.functions.find(f=>fn(f.signature)===fn(old.signature));assert.ok(next,'Function removed: '+old.signature);
  const {definition:a,...am}=old,{definition:b,...bm}=next;if(JSON.stringify(am)!==JSON.stringify(bm))metadata.push(fn(old.signature));if(a!==b)changed.push(fn(old.signature));}
 check(label+': only the five planned functions are redefined, with unchanged privileges',metadata.length===0&&JSON.stringify(changed.sort())===JSON.stringify(changedFunctions),{changed,metadata});
 const additions=afterStructure.functions.filter(f=>!before.functions.some(o=>fn(o.signature)===fn(f.signature))).map(f=>fn(f.signature)).sort();
 check(label+': exactly the planned helper functions are added',JSON.stringify(additions)===JSON.stringify(addedFunctions),additions);
 for(const role of ['anon','authenticated','service_role','skolplattform_worker']){
  for(const table of newTables)assert.equal((await tx`select has_table_privilege(${role},${'public.'+table},'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') allowed`)[0].allowed,false,role+table);
  for(const f of addedFunctions)assert.equal((await tx`select has_function_privilege(${role},${'public.'+f},'EXECUTE') allowed`)[0].allowed,false,role+f);
 }
 check(label+': new tables and helpers are private to the owner',true);
 const [counts]=await tx`select (select count(*)::int from public.syllabus_central_catalogs) catalogs,(select count(*)::int from public.syllabus_central_items) items,(select count(*)::int from public.apl_content_central_items) selections`;
 check(label+': catalog seeded with 18 051 points and no selections',counts.catalogs===1&&counts.items===18051&&counts.selections===0,counts);
 const afterApl=await aplState(tx);
 check(label+': every existing APL plan keeps its exact value',JSON.stringify(afterApl)===JSON.stringify(beforeApl),Object.keys(afterApl).length);
 return {beforeFingerprint:sha(JSON.stringify(beforeStructure)),afterFingerprint:sha(JSON.stringify(afterStructure))};
}

const target=await assertTarget('protected');
const db=createRequire(new URL('../../web/package.json',import.meta.url))('postgres')(target.dbUrl,{max:1,prepare:false,onnotice:()=>{}});
let failure;
try{
 check('SQL evidence PASS for the exact migration sources',evidence.kind==='apl-central-content-private-schema-only'&&evidence.status==='PASS'&&evidence.cleanup?.cleanup==='complete'
  &&centralMigrations.every(p=>evidence.sources?.[p]===sources[p]),{status:evidence.status});
 report.before={fingerprint:await schemaFingerprint(db),recorded:await recorded(db)};
 try{await db.begin(async tx=>{await tx`set transaction isolation level repeatable read`;report.rehearsal=await installAndCheck(tx,'rehearsal');throw rollback;});}catch(e){if(e!==rollback)throw e;}
 check('rollback restored the exact schema',await schemaFingerprint(db)===report.before.fingerprint&&await recorded(db)===0);
 if(mode==='--apply'){
  await db.begin(async tx=>{
   await tx`set transaction isolation level repeatable read`;
   check('install lock acquired',(await tx`select pg_try_advisory_xact_lock(5541) locked`)[0].locked===true);
   check('install starts from the rehearsed schema',await schemaFingerprint(tx)===report.before.fingerprint);
   const started=Date.now();report.installed=await installAndCheck(tx,'install');
   for(const [i,p] of centralMigrations.entries())await tx`insert into supabase_migrations.schema_migrations(version,name,statements) values(${versions[i]},${p.split('/').pop().slice(15,-4)},${[readFileSync(resolve(root,p),'utf8')]})`;
   report.lockHoldMsBeforeCommit=Date.now()-started;
  });
  report.committed=true;
  check('installation persisted and journalled',await recorded(db)===2&&await schemaFingerprint(db)!==report.before.fingerprint);
 }
}catch(e){failure=e;}finally{await db.end({timeout:5});}
report.status=failure?'FAIL':'PASS';if(failure)report.error=failure.message;
console.log(JSON.stringify(report,null,1));
process.exitCode=failure?1:0;
