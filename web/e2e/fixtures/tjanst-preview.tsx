// Synthetic component preview for Tjänstefördelning (05.1-05). No database, server or live authentication:
// /api/tjanst/* is answered by an in-browser mock with synthetic people and groups only. Component evidence, not an actual test.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import TjanstWorkspace from '../../app/tjanst-workspace';
import type {ActiveContext} from '../../app/context-switch';
import type {TjanstFeedback} from '../../app/tjanst-publish-panel';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import type {TjanstClass,TjanstJoint,TjanstPerson,TjanstPlanAction,TjanstPlanRead,TjanstRow,TjanstSpecial,TjanstTeacher,TjanstVersion} from '../../lib/tjanst-contract';
import '../../app/globals.css';

export const tid=(n:number)=>`51a50000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const params=new URLSearchParams(location.search),role=params.get('roll')==='administrator'?'administrator':'rektor',variant=params.get('data')??'standard';
const YEAR=2026,A=tid(3),B=tid(4),KEY=`sha256:${'5a'.repeat(32)}`;
const P={anna:tid(101),bertil:tid(102),cecilia:tid(103),david:tid(104),greta:tid(105)};
const C={te:tid(201),ek:tid(202),im:tid(203),na:tid(204),sa:tid(205)};
const hash=(n:number)=>`sha256:${String(n).padStart(8,'0').repeat(8)}`;
const long=variant==='lang';
type Content={teachers:TjanstTeacher[];rows:TjanstRow[];specials:TjanstSpecial[];joints:TjanstJoint[]};
type Unit={unitId:string;schoolName:string;revision:number;classes:TjanstClass[];versions:TjanstVersion[];draft:Content|null;snapshots:Map<string,Content>;blockers:{code:string;message:string}[]};
type Reply={status:number;json:unknown};
const clone=<T,>(v:T):T=>structuredClone(v);
const key=(classId:string,rowKey:string)=>`class_timplan:${classId}:${YEAR}:${rowKey}`;
function need(classId:string,rowKey:string,label:string,ht:number|null,vt:number|null,basis:'terms'|'even_split'|'weekly_calendar'='terms'){return{sourceKind:'class_timplan' as const,sourceKey:key(classId,rowKey),rowKey,label,needHt:ht,needVt:vt,needBasis:basis};}
function gy(classId:string,name:string,series:string,version:number,needs:ReturnType<typeof need>[]):TjanstClass{return{classId,name,link:{linkRevision:0,timplanId:tid(700+version),seriesId:tid(750),seriesName:series,timplanVersion:version,column:'ar1',schoolform:'gymnasium'},needs};}
function row(id:number,classId:string,cls:TjanstClass,rowKey:string,personId:string|null,ht:number,vt:number,joint:string|null=null):TjanstRow{
 const n=cls.needs.find(x=>x.rowKey===rowKey)!;
 return{id:tid(id),lineageId:tid(id+5000),sourceKind:'class_timplan',sourceKey:n.sourceKey,classId,rowKey,personId,teacherHt:ht,teacherVt:vt,needHt:n.needHt,needVt:n.needVt,needBasis:n.needBasis,stale:false,jointGroupId:joint,comment:''};
}
function standardUnit():Unit{
 const te=gy(C.te,'TE26A','Teknikprogrammet',2,[need(C.te,'MATMAT01c',long?'Matematik 1c med fördjupning i tillämpad statistik och programmering för teknikprogrammet':'Matematik 1c',3000,3000),need(C.te,'SVESVE01','Svenska 1',3000,3000),need(C.te,'ENGENG05','Engelska 5',3000,3000)]);
 const ek=gy(C.ek,'EK26','Ekonomiprogrammet',1,[need(C.ek,'SVESVE01','Svenska 1',3000,3000),need(C.ek,'MATMAT01b','Matematik 1b',3000,3000)]);
 const im:TjanstClass={classId:C.im,name:'IMSPR',link:{linkRevision:0,timplanId:tid(760),seriesId:tid(761),seriesName:'Språkintroduktion',timplanVersion:1,column:'vecka',schoolform:'introduktionsprogram'},needs:[need(C.im,'SVASVA01','Svenska som andraspråk 1',4320,4320,'weekly_calendar')]};
 const na:TjanstClass={classId:C.na,name:'NA26B',link:null,needs:[]};
 const teachers:TjanstTeacher[]=[{personId:P.anna,displayName:long?'Maximiliana Konstantinopelska-Vasaborgsson Ekströmsdotter':'Anna Andersson',draft:false,shareHere:60},{personId:P.bertil,displayName:'Bertil Berg',draft:false,shareHere:100},{personId:P.cecilia,displayName:'Cecilia Dahl',draft:true,shareHere:null}];
 const j1=tid(401);
 const draft:Content={teachers,rows:[row(301,C.te,te,'ENGENG05',P.anna,3000,0),row(302,C.te,te,'ENGENG05',P.bertil,0,3000),row(303,C.te,te,'SVESVE01',P.bertil,3000,3000,j1),row(304,C.ek,ek,'SVESVE01',P.bertil,3000,3000,j1),row(305,C.im,im,'SVASVA01',null,2160,2160),row(306,C.ek,ek,'MATMAT01b',P.anna,3000,3000)],
  specials:[{id:tid(501),lineageId:tid(5501),kind:'mentor',label:'Mentor',personId:P.anna,classId:C.te,ht:1200,vt:1200,comment:''},{id:tid(502),lineageId:tid(5502),kind:'programansvar',label:'Programansvar',personId:P.bertil,classId:null,ht:1800,vt:1800,comment:''}],
  joints:[{id:j1,lineageId:tid(5401),name:'Svenska 1 TE26A + EK26',rowIds:[tid(303),tid(304)],teachers:[{personId:P.bertil,ht:3000,vt:3000}]}]};
 const v1:TjanstVersion={id:tid(601),versionNo:1,status:'published',contentHash:hash(1),basedOnVersionId:null,publishedByName:'Rektor Syntetisk',publishedAt:'2026-06-15T08:00:00.000Z'};
 const v2:TjanstVersion={id:tid(602),versionNo:2,status:'draft',contentHash:hash(2),basedOnVersionId:v1.id,publishedByName:null,publishedAt:null};
 const old:Content={teachers:teachers.slice(0,2),rows:draft.rows.slice(0,2),specials:draft.specials.slice(0,1),joints:[]};
 const unit:Unit={unitId:A,schoolName:long?'Syntetiska gymnasiet för teknik, naturvetenskap och samhällsvetenskap i Exempelstad':'Syntetiska gymnasiet',revision:7,classes:[te,ek,im,na],versions:[v1,v2],draft,snapshots:new Map([[v1.id,old]]),blockers:params.has('hinder')?[{code:'stale_rows',message:'En tjänsterad bygger på en äldre timplansversion.'}]:[]};
 if(variant==='tom'){unit.versions=[{...v2,versionNo:1,basedOnVersionId:null}];unit.snapshots=new Map();unit.draft={teachers:[],rows:[],specials:[],joints:[]};}
 if(variant==='utan-klasser'){unit.classes=[na];unit.draft={teachers,rows:[],specials:[],joints:[]};}
 if(variant==='publicerad'){unit.versions=[v1];unit.draft=null;unit.snapshots=new Map([[v1.id,{...draft,joints:clone(draft.joints)}]]);}
 if(variant==='stor'){
  const classes:TjanstClass[]=[],rows:TjanstRow[]=[],big:TjanstTeacher[]=Array.from({length:40},(_,i)=>({personId:tid(1000+i),displayName:`Lärare${i+1} Efternamn${String(i+1).padStart(2,'0')}`,draft:false,shareHere:100}));
  for(let c=0;c<10;c++){const id=tid(2000+c);const cls=gy(id,`ST${c+1}`,'Storprogrammet',1,Array.from({length:30},(_,n)=>need(id,`KURS${String(n).padStart(2,'0')}`,`Kurs ${n+1} i klass ${c+1}`,3000,3000)));classes.push(cls);
   cls.needs.forEach((n,i)=>rows.push(row(3000+c*30+i,id,cls,n.rowKey,big[(c*30+i)%40].personId,3000,3000)));}
  unit.classes=classes;unit.draft={teachers:big,rows,specials:[],joints:[]};
 }
 return unit;
}
function otherUnit():Unit{
 const sa=gy(C.sa,'SA26C','Samhällsvetenskapsprogrammet',1,[need(C.sa,'HISHIS01a1','Historia 1a1',1500,1500)]);
 const v:TjanstVersion={id:tid(611),versionNo:1,status:'draft',contentHash:hash(11),basedOnVersionId:null,publishedByName:null,publishedAt:null};
 return{unitId:B,schoolName:'Andra syntetiska skolan',revision:1,classes:[sa],versions:[v],draft:{teachers:[{personId:P.greta,displayName:'Greta Grön',draft:false,shareHere:40}],rows:[row(320,C.sa,sa,'HISHIS01a1',P.greta,1500,1500)],specials:[],joints:[]},snapshots:new Map(),blockers:[]};
}
const units=new Map([[A,standardUnit()],[B,otherUnit()]]);
const people:TjanstPerson[]=[
 {id:P.anna,givenName:'Anna',familyName:'Andersson',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(801),unitId:A,schoolName:'Syntetiska gymnasiet',percent:60,startsOn:'2026-07-01',endsOn:null}]},
 {id:P.bertil,givenName:'Bertil',familyName:'Berg',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(802),unitId:A,schoolName:'Syntetiska gymnasiet',percent:100,startsOn:'2026-07-01',endsOn:null}]},
 {id:P.cecilia,givenName:'Cecilia',familyName:'Dahl',externalId:null,externalIdSource:null,status:'draft',proposedForUnitId:A,draftNote:null,revision:1,employments:[],duties:[]},
 {id:P.david,givenName:'David',familyName:'Ek',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(804),unitId:A,schoolName:'Syntetiska gymnasiet',percent:50,startsOn:'2026-07-01',endsOn:null}]},
];

type Failure={status:number;code:string}|'lost'|'network';
type Control={commands:{path:string;body:any}[];reads:{path:string;body:any}[];fail:Record<string,Failure[]>;held:Record<string,number>;release:()=>void;mfaVerified:boolean;openedLinks:number;
 failNext:(route:string,failure:Failure)=>void;holdNext:(route:string)=>void};
declare global{interface Window{__tjanst:Control}}
let releases:(()=>void)[]=[];
const control:Control={commands:[],reads:[],fail:{},held:{},mfaVerified:false,openedLinks:0,
 release:()=>{const r=releases;releases=[];r.forEach(f=>f());},
 failNext:(route,failure)=>{(control.fail[route]??=[]).push(failure);},
 holdNext:route=>{control.held[route]=(control.held[route]??0)+1;}};
window.__tjanst=control;
const EDIT:TjanstPlanAction[]=['add_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint'];
const receipts=new Map<string,unknown>();
function current(u:Unit){return u.versions.find(v=>v.status==='draft')??u.versions.find(v=>v.status==='published')??null;}
function read(u:Unit,versionId?:string):TjanstPlanRead{
 const latest=current(u),version=versionId?u.versions.find(v=>v.id===versionId)!:latest;
 const content=version===null?{teachers:[],rows:[],specials:[],joints:[]}:version.status==='draft'?u.draft!:u.snapshots.get(version.id)!;
 const isDraft=version?.status==='draft';
 const actions:TjanstPlanAction[]=isDraft?(role==='rektor'?[...EDIT,'discard_draft','publish']:EDIT):!versionId&&version?.status==='published'||version===null?['create_draft']:[];
 return{contractVersion:'tjanst_v1',unitId:u.unitId,schoolName:u.schoolName,schoolYear:YEAR,revision:u.revision,version:version?clone(version):null,versions:clone(u.versions),
  teachers:clone(content.teachers),classes:clone(u.classes),rows:clone(content.rows),specials:clone(content.specials),joints:clone(content.joints),
  actions,blockers:isDraft?clone(u.blockers):[],capabilities:{canEdit:isDraft,canPublish:isDraft&&role==='rektor',canReadHistory:true}};
}
const error=(status:number,code:string):Reply=>({status,json:{code,correlationId:'syntetisk-ref-1'}});
function apply(u:Unit,body:any):Reply{
 if(body.expectedRevision!==u.revision)return error(409,'tjanst_revision_conflict');
 const p=body.payload,d=u.draft;let versionId=current(u)?.id??null;
 if(body.action==='create_draft'){
  const base=u.versions.find(v=>v.id===p.basedOnVersionId)!;const next:TjanstVersion={id:crypto.randomUUID(),versionNo:Math.max(...u.versions.map(v=>v.versionNo))+1,status:'draft',contentHash:hash(u.revision+100),basedOnVersionId:base.id,publishedByName:null,publishedAt:null};
  u.versions.push(next);u.draft=clone(u.snapshots.get(base.id)!);versionId=next.id;
 }else if(!d)return error(409,'tjanst_published_meanwhile');
 else if(body.action==='publish'){
  if(role!=='rektor')return error(403,'forbidden');
  if(!control.mfaVerified)return error(403,'mfa_required');
  const v=u.versions.find(x=>x.status==='draft')!;if(body.expectedContentHash!==v.contentHash)return error(409,'tjanst_content_changed');
  for(const x of u.versions)if(x.status==='published')x.status='superseded';
  Object.assign(v,{status:'published',publishedByName:'Rektor Syntetisk',publishedAt:'2026-10-19T09:30:00.000Z'});u.snapshots.set(v.id,d);u.draft=null;versionId=v.id;
 }else if(body.action==='discard_draft'){const v=u.versions.find(x=>x.status==='draft')!;v.status='discarded';u.draft=null;versionId=v.id;}
 else if(body.action==='add_teacher'){const person=people.find(x=>x.id===p.personId)!;d.teachers.push({personId:person.id,displayName:`${person.givenName} ${person.familyName}`,draft:person.status==='draft',shareHere:person.duties.find(x=>x.unitId===u.unitId)?.percent??null});}
 else if(body.action==='save_row'){
  if(p.personId!==null&&d.rows.some(r=>r.personId===p.personId&&r.sourceKey===p.sourceKey&&r.id!==p.rowId))return error(400,'tjanst_duplicate_row');
  const cls=u.classes.find(c=>c.needs.some(n=>n.sourceKey===p.sourceKey))!,n=cls.needs.find(x=>x.sourceKey===p.sourceKey)!;
  const existing=d.rows.find(r=>r.id===p.rowId);
  if(existing)Object.assign(existing,{personId:p.personId,teacherHt:p.teacherHt,teacherVt:p.teacherVt,comment:p.comment});
  else{const id=crypto.randomUUID();d.rows.push({id,lineageId:crypto.randomUUID(),sourceKind:'class_timplan',sourceKey:p.sourceKey,classId:cls.classId,rowKey:n.rowKey,personId:p.personId,teacherHt:p.teacherHt,teacherVt:p.teacherVt,needHt:n.needHt,needVt:n.needVt,needBasis:n.needBasis,stale:false,jointGroupId:null,comment:p.comment});}
 }else if(body.action==='delete_row'){
  const r=d.rows.find(x=>x.id===p.rowId)!;d.rows=d.rows.filter(x=>x.id!==p.rowId);
  if(r.jointGroupId){const j=d.joints.find(x=>x.id===r.jointGroupId)!;j.rowIds=j.rowIds.filter(x=>x!==r.id);if(j.rowIds.length<2){d.rows.forEach(x=>{if(x.jointGroupId===j.id)x.jointGroupId=null;});d.joints=d.joints.filter(x=>x.id!==j.id);}}
 }else if(body.action==='save_special'){
  const s=d.specials.find(x=>x.id===p.specialId);const value={kind:p.kind,label:p.label,personId:p.personId,classId:p.classId,ht:p.ht,vt:p.vt,comment:p.comment};
  if(s)Object.assign(s,value);else d.specials.push({id:crypto.randomUUID(),lineageId:crypto.randomUUID(),...value});
 }else if(body.action==='delete_special')d.specials=d.specials.filter(x=>x.id!==p.specialId);
 else if(body.action==='save_joint'){
  const taken=d.rows.find(r=>p.rowIds.includes(r.id)&&r.jointGroupId!==null&&r.jointGroupId!==p.jointId);if(taken)return error(400,'tjanst_joint_already');
  const id=p.jointId??crypto.randomUUID();d.rows.forEach(r=>{if(r.jointGroupId===id)r.jointGroupId=null;if(p.rowIds.includes(r.id))r.jointGroupId=id;});
  const j=d.joints.find(x=>x.id===id);if(j)Object.assign(j,{name:p.name,rowIds:p.rowIds,teachers:p.teachers});else d.joints.push({id,lineageId:crypto.randomUUID(),name:p.name,rowIds:p.rowIds,teachers:p.teachers});
 }else if(body.action==='dissolve_joint'){d.rows.forEach(r=>{if(r.jointGroupId===p.jointId)r.jointGroupId=null;});d.joints=d.joints.filter(x=>x.id!==p.jointId);}
 u.revision++;const draftVersion=u.versions.find(v=>v.status==='draft');if(draftVersion&&body.action!=='create_draft')draftVersion.contentHash=hash(u.revision);
 const reply={receipt:{commandId:body.commandId,action:body.action,versionId,revision:u.revision,contentHash:current(u)?.contentHash??hash(0),replayed:false,changed:true},detail:read(u)};
 receipts.set(body.commandId,reply);return{status:200,json:reply};
}
function personal(body:any,unitId:string):Reply{
 const p=body.payload,id=crypto.randomUUID();
 people.push({id,givenName:p.givenName,familyName:p.familyName,externalId:null,externalIdSource:null,status:'draft',proposedForUnitId:p.unitId,draftNote:p.draftNote,revision:1,employments:[],duties:[]});
 const reply={receipt:{commandId:body.commandId,action:body.action,personId:id,revision:1,replayed:false},detail:personalRead(unitId)};
 receipts.set(body.commandId,reply);return{status:200,json:reply};
}
const personalRead=(unitId:string)=>({contractVersion:'tjanst_v1',scope:'unit',unitId,people:clone(people.filter(x=>x.duties.some(d=>d.unitId===unitId)||x.proposedForUnitId===unitId)),actions:['create_draft_teacher'],blockers:[],capabilities:{canManage:false,canCreateDraft:true}});
async function route(path:string,body:any):Promise<Reply|'lost'|'network'>{
 const name=path.replace('/api/tjanst/','');
 const failure=control.fail[name]?.shift();
 if(control.held[name]){control.held[name]--;await new Promise<void>(resolve=>releases.push(resolve));}
 if(failure==='network')return 'network';
 if(failure&&failure!=='lost')return error(failure.status,failure.code);
 let reply:Reply;
 if(name==='plan/lasa'){control.reads.push({path,body});const u=units.get(body.unitId);reply=u?{status:200,json:read(u,body.versionId)}:error(403,'forbidden');}
 else if(name==='plan/kommando'||name==='plan/publicera'){control.commands.push({path,body});if(receipts.has(body.commandId))return{status:200,json:receipts.get(body.commandId)};reply=apply(units.get(body.unitId)!,body);}
 else if(name==='plan/status'||name==='personal/status'){control.reads.push({path,body});const r=receipts.get(body.command.commandId);reply={status:200,json:r?{state:'completed',result:r}:{state:'not_found',result:null}};}
 else if(name==='personal/lasa'){control.reads.push({path,body});reply={status:200,json:personalRead(body.unitId)};}
 else if(name==='personal/kommando'){control.commands.push({path,body});reply=personal(body,body.payload.unitId);}
 else reply=error(404,'not_found');
 return failure==='lost'?'lost':reply;
}
const realFetch=window.fetch.bind(window);
window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);
 if(!url.pathname.startsWith('/api/tjanst/'))return realFetch(input,init);
 const result=await route(url.pathname,init?.body?JSON.parse(String(init.body)):{});
 if(result==='lost'||result==='network')throw new TypeError('Failed to fetch');
 return new Response(JSON.stringify(result.json),{status:result.status,headers:{'Content-Type':'application/json'}});
};

const feedback:TjanstFeedback|undefined=params.has('aterkoppling')?{versionNo:1,teachers:[{personId:P.anna,name:'Anna Andersson',acknowledgedAt:'2026-06-16T07:00:00.000Z'},{personId:P.bertil,name:'Bertil Berg',acknowledgedAt:null}],
 comments:[{id:tid(901),personId:P.anna,name:'Anna Andersson',at:'2026-06-16T07:05:00.000Z',body:'Jag vill gärna ha mentorstiden kvar på VT.'}]}:undefined;
const context=(unitId:string|null):ActiveContext=>({assignmentId:tid(950),membershipId:tid(951),customerId:tid(952),customerName:'Syntetisk kund',organizerId:tid(953),organizerName:'Syntetisk huvudman',
 unitId,unitName:null,function:role,label:role==='rektor'?'Rektor':'Skoladministratör',blocked:false,valid:true});
function Harness(){
 const [unit,setUnit]=useState<string|null>(params.get('skola')==='alla'?null:A);const blocked=useHasUnsaved('navigation-block:');
 return <main id="workspace" lang="sv" style={{padding:'16px',maxWidth:'1800px',margin:'0 auto'}}>
  <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}><button type="button" onClick={()=>setUnit(unit===B?A:B)}>Byt skola</button><button type="button" disabled={blocked}>Lämna arbetsytan</button></div>
  <TjanstWorkspace context={context(unit)} epoch={1} unitId={unit} schoolYear={YEAR} identityKey={KEY} feedback={feedback} onOpenClassLinks={()=>{control.openedLinks++;}} onSessionLost={()=>undefined}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
