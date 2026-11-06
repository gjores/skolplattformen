#!/usr/bin/env node
// CLASS-LINK. Fills coming school years for gymnasium classes that were linked one year at a time, on the protected target.
// Only adds missing years with the class's latest plan. Rehearsal rolls back. Run after apply-class-link-following.mjs
// with 3012 stopped. Never accepts a DB URL and changes no other table than class_timplans, plus one audit row on apply.
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {assertTarget} from './verify-target.mjs';
import {connect} from './verify-class-cohort.mjs';
import {preservedColumns,preservedRows} from './apply-elective-blocks.mjs';
import {privatePath} from './apply-valplan.mjs';
const mode=process.argv[2]==='--apply'?'apply':process.argv[2]==='--rehearse'?'rehearsal':null,out=privatePath(process.argv[process.argv.indexOf('--out')+1]);assert.ok(mode,'explicit_mode_required');
const report={kind:'class-link-years-fill',mode,status:'FAIL'},rollback=Error('rollback'),db=connect(await assertTarget('protected'));
const others=rows=>Object.fromEntries(Object.entries(rows).filter(([key])=>key!=='public.class_timplans'));
try{
 assert.equal((await db`select pg_try_advisory_lock(5520) locked`)[0].locked,true,'target_lock_unavailable');
 const columns=await preservedColumns(db),before=await preservedRows(db,columns);let auditId=null;
 await db.begin(async tx=>{
  const existing=await tx`select class_id,start_year,timplan_id,column_id,revision from public.class_timplans order by class_id,start_year`;
  const plans=await tx`select distinct on (l.class_id) l.class_id,l.start_year,l.timplan_id,t.status,public.phase5_class_start_year(t) first_year,public.phase5_class_following(c,t,l.start_year) following
   from public.class_timplans l join public.school_classes c on c.id=l.class_id join public.timplans t on t.id=l.timplan_id where t.gym_basis is not null order by l.class_id,l.start_year desc`;
  await tx`alter table public.class_timplans disable trigger class_timplans_validate`;
  let added=0,skipped=0;
  for(const p of plans){
   const[c]=await tx`select unit_id,name from public.school_classes where id=${p.class_id}`;
   for(const f of p.following){
    if(f.status!=='new'||p.status!=='faststalld'){skipped+=f.status==='same'?0:1;continue;}
    await tx`insert into public.class_timplans(unit_id,class_name,start_year,timplan_id,column_id,class_id) values(${c.unit_id},${c.name},${f.schoolYear},${p.timplan_id},${'ar'+(f.schoolYear-p.first_year+1)},${p.class_id})`;added++;
   }
  }
  await tx`alter table public.class_timplans enable trigger class_timplans_validate`;
  const after=await tx`select class_id,start_year,timplan_id,column_id,revision from public.class_timplans order by class_id,start_year`;
  const key=r=>JSON.stringify(r),kept=new Set(after.map(key));assert.ok(existing.every(r=>kept.has(key(r))),'existing_link_changed');assert.equal(after.length,existing.length+added);
  Object.assign(report,{classes:plans.length,linksBefore:existing.length,linksAfter:after.length,added,skipped,years:Object.entries(Object.groupBy(after,r=>`${r.start_year}:${r.column_id}`)).map(([k,v])=>[k,v.length]).sort()});
  if(mode==='rehearsal')throw rollback;
  const[audit]=await tx`insert into public.security_events(correlation_id,source,action,object_type,outcome,details) values(${randomUUID()},'cli','class_link_years_fill','class_timplans','ok',${tx.json({added,skipped})}) returning id`;auditId=audit.id;
 }).catch(error=>{if(error!==rollback)throw error;});
 assert.deepEqual(others(await preservedRows(db,columns,auditId)),others(before),'other_tables_changed');
 report.status='PASS';
}finally{await db`select pg_advisory_unlock(5520)`.catch(()=>{});await db.end({timeout:5});writeFileSync(out,JSON.stringify(report,null,2)+'\n',{mode:0o600});console.log(JSON.stringify(report));}
