import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parsePlanningGrantArgs,assertPlanningGrantSql,checkPlanningGrantDiff,PLANNING_GRANTS} from './apply-planning-year-grants.mjs';
import {PLANNING_ENTRIES} from './apply-planning-year-migration.mjs';
test('grant apply refuses wrong migration, remote/unsafe output, duplicate or missing arguments',()=>{
 const a=['--migration',PLANNING_GRANTS,'--evidence','/private/tmp/preflight.json','--out','/private/tmp/apply.json'];
 assert.equal(parsePlanningGrantArgs(a).migration,PLANNING_GRANTS);
 for(const args of [[],a.concat('--reset'),a.concat('--migration',PLANNING_GRANTS),a.map(v=>v===PLANNING_GRANTS?'20261006120000_phase5_planning_year_reads.sql':v),a.map(v=>v==='/private/tmp/apply.json'?'/Users/unsafe.json':v)])assert.throws(()=>parsePlanningGrantArgs(args));
});
test('only reviewed three read EXECUTE grants, without broad grants or additional SQL',()=>{
 const s=readFileSync(new URL('../../supabase/migrations/'+PLANNING_GRANTS,import.meta.url),'utf8');
 assert.doesNotThrow(()=>assertPlanningGrantSql(s));
 for(const sql of [s+'\nselect 1;',s.replace('skolplattform_worker','authenticated'),s.replace('execute','all'),s.replace('public.phase5_planning_year_selection()','public.phase5_planning_year_actor()'),s.replace(',public.phase5_planning_year_overview(jsonb)','')])assert.throws(()=>assertPlanningGrantSql(sql));
});
test('apply preservation rejects all differences except exact raw ACL additions on three signatures',()=>{
 const b={functions:[...PLANNING_ENTRIES,'public.old()'].sort().map(signature=>({signature,definition:'immutable '+signature,acl:'{postgres=X/postgres}'})),tables:[{relation:'public.point_plans',acl:null,relrowsecurity:true}],journal:[{version:'20261006120000'}]};
 const after=()=>structuredClone({...b,functions:b.functions.map(r=>({...r,acl:PLANNING_ENTRIES.includes(r.signature)?'{postgres=X/postgres,skolplattform_worker=X/postgres}':r.acl}))});
 assert.equal(checkPlanningGrantDiff(b,after()).length,3);
 for(const change of [a=>a.functions[0].definition+='changed',a=>a.functions.pop(),a=>a.tables[0].acl='wide',a=>a.journal.push({version:'later'}),a=>a.functions.find(r=>r.signature==='public.old()').acl='{postgres=X/postgres,skolplattform_worker=X/postgres}',a=>a.functions.find(r=>PLANNING_ENTRIES.includes(r.signature)).acl='{postgres=X/postgres,authenticated=X/postgres}',a=>a.functions.find(r=>PLANNING_ENTRIES.includes(r.signature)).acl='{postgres=X/postgres}']){
  const a=after();change(a);assert.throws(()=>checkPlanningGrantDiff(b,a));
 }
});
