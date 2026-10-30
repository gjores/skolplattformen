// Synthetic component preview for Tjänstefördelning (05.1-05). No database, server or live authentication:
// /api/tjanst/* is answered by an in-browser mock with synthetic people and groups only. Component evidence, not an actual test.
import React, {useState,useLayoutEffect} from 'react';
import {createRoot} from 'react-dom/client';
import TjanstWorkspace from '../../app/tjanst-workspace';
import type {ActiveContext} from '../../app/context-switch';
import type {TjanstFeedback} from '../../app/tjanst-publish-panel';
import {UnsavedChangesProvider,useHasUnsaved} from '../../lib/unsaved-changes';
import type {TjanstClass,TjanstJoint,TjanstNeedSharing,TjanstPerson,TjanstPlanReceiptAction as TjanstPlanAction,TjanstPlanRead,TjanstRow,TjanstSpecial,TjanstTeacher,TjanstVersion} from '../../lib/tjanst-contract';
import {parsePlanReadRequest,parsePlanReadReply,parsePlanCommandReply,parsePlanStatusReply,parseCommandRef,parsePersonalCommand,parsePersonalCommandReply,parsePersonalReadReply,tjanstCanonicalSerialize,tjanstHashCanonical,verifyPlanCommandHash,planCommandRef,TjanstContractError,type TjanstCommandRef} from '../../lib/tjanst-contract';
import {parseYearRequest,parseYearReply,assertYearRowContext,tjanstYearHash,type TjanstYearCandidate,type TjanstYearRequest,type TjanstYearReply,type TjanstYearBatchReply} from '../../lib/tjanst-year-contract';
import {previewYearMove,yearEvidenceReason} from '../../lib/tjanst-year-model';
import {setKnownEpoch} from '../../lib/server-client';
import '../../app/globals.css';

export const tid=(n:number)=>`51a50000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const params=new URLSearchParams(location.search),role=params.get('roll')==='administrator'?'administrator':'rektor',variant=params.get('data')??'standard';
const YEAR=2026,A=tid(3),B=tid(4),KEY=`sha256:${'5a'.repeat(32)}`;
const P={anna:tid(101),bertil:tid(102),cecilia:tid(103),david:tid(104),greta:tid(105)};
const C={te:tid(201),ek:tid(202),im:tid(203),na:tid(204),sa:tid(205)};
const hash=(n:number)=>`sha256:${String(n).padStart(8,'0').repeat(8)}`;
/** Serverns text för blockeraren joint_invalid (20261021120000, WR-02). */
const JOINT_INVALID='En samläsning uppfyller inte reglerna: raderna ska finnas i minst två klasser, och lärartid får bara gälla lärare som har en rad i gruppen. Ändra eller lös upp samläsningen.';
const long=variant==='lang';
type Content={teachers:TjanstTeacher[];rows:TjanstRow[];specials:TjanstSpecial[];joints:TjanstJoint[];sharing?:TjanstNeedSharing[]};
type Unit={schoolYear:number;coreGeneration:number;evidenceGeneration:number;unitId:string;schoolName:string;revision:number;classes:TjanstClass[];versions:TjanstVersion[];draft:Content|null;snapshots:Map<string,Content>;blockers:{code:string;message:string}[]};
type Reply={status:number;json:unknown};
const clone=<T,>(v:T):T=>structuredClone(v);
const key=(classId:string,rowKey:string)=>`class_timplan:${classId}:${YEAR}:${rowKey}`;
function need(classId:string,rowKey:string,label:string,ht:number|null,vt:number|null,basis:'terms'|'even_split'|'weekly_calendar'='terms'){return{sourceKind:'class_timplan' as const,sourceKey:key(classId,rowKey),rowKey,label,needHt:ht,needVt:vt,needBasis:basis};}
function gy(classId:string,name:string,series:string,version:number,needs:ReturnType<typeof need>[],aplMinutes:number|null=null):TjanstClass{return{classId,name,aplMinutes,link:{linkRevision:0,timplanId:tid(700+version),seriesId:tid(750),seriesName:series,timplanVersion:version,column:'ar1',schoolform:'gymnasium'},needs};}
function row(id:number,classId:string,cls:TjanstClass,rowKey:string,personId:string|null,ht:number,vt:number,joint:string|null=null):TjanstRow{
 const n=cls.needs.find(x=>x.rowKey===rowKey)!;
 return{id:tid(id),lineageId:tid(id+5000),sourceKind:'class_timplan',sourceKey:n.sourceKey,classId,rowKey,personId,teacherHt:ht,teacherVt:vt,needHt:n.needHt,needVt:n.needVt,needBasis:n.needBasis,stale:false,jointGroupId:joint,comment:''};
}
function standardUnit():Unit{
 const te=gy(C.te,'TE26A','Teknikprogrammet',2,[need(C.te,'MATMAT01c',long?'Matematik 1c med fördjupning i tillämpad statistik och programmering för teknikprogrammet':'Matematik 1c',3000,3000),need(C.te,'SVESVE01','Svenska 1',3000,3000),need(C.te,'ENGENG05','Engelska 5',3000,3000)]);
 const ek=gy(C.ek,'EK26','Ekonomiprogrammet',1,[need(C.ek,'SVESVE01','Svenska 1',3000,3000),need(C.ek,'MATMAT01b','Matematik 1b',3000,3000)]);
 const im:TjanstClass={classId:C.im,name:'IMSPR',aplMinutes:null,link:{linkRevision:0,timplanId:tid(760),seriesId:tid(761),seriesName:'Språkintroduktion',timplanVersion:1,column:'vecka',schoolform:'introduktionsprogram'},needs:[need(C.im,'SVASVA01','Svenska som andraspråk 1',4320,4320,'weekly_calendar')]};
 const na:TjanstClass={classId:C.na,name:'NA26B',aplMinutes:null,link:null,needs:[]};
 const teachers:TjanstTeacher[]=[{personId:P.anna,displayName:long?'Maximiliana Konstantinopelska-Vasaborgsson Ekströmsdotter':'Anna Andersson',draft:false,shareHere:60},{personId:P.bertil,displayName:'Bertil Berg',draft:false,shareHere:100},{personId:P.cecilia,displayName:'Cecilia Dahl',draft:true,shareHere:null}];
 const j1=tid(401);
 const draft:Content={teachers,rows:[row(301,C.te,te,'ENGENG05',P.anna,3000,0),row(302,C.te,te,'ENGENG05',P.bertil,0,3000),row(303,C.te,te,'SVESVE01',P.bertil,3000,3000,j1),row(304,C.ek,ek,'SVESVE01',P.bertil,3000,3000,j1),row(305,C.im,im,'SVASVA01',null,2160,2160),row(306,C.ek,ek,'MATMAT01b',P.anna,3000,3000)],
  specials:[{id:tid(501),lineageId:tid(5501),kind:'mentor',label:'Mentor',personId:P.anna,classId:C.te,ht:1200,vt:1200,comment:''},{id:tid(502),lineageId:tid(5502),kind:'programansvar',label:'Programansvar',personId:P.bertil,classId:null,ht:1800,vt:1800,comment:''}],
  joints:[{id:j1,lineageId:tid(5401),name:'Svenska 1 TE26A + EK26',rowIds:[tid(303),tid(304)],teachers:[{personId:P.bertil,ht:3000,vt:3000}]}],
  // 05.1-33: Engelska 5 i TE26A delas en i taget (Anna HT, Bertil VT); Bertil sätter betyg. ?delning=saknas visar hindret.
  sharing:params.get('delning')==='saknas'?[]:[{sourceKey:key(C.te,'ENGENG05'),mode:'sequential' as const,graderPersonIds:[P.bertil]}]};
 const v1:TjanstVersion={id:tid(601),versionNo:1,status:'published',contentHash:hash(1),basedOnVersionId:null,publishedByName:'Rektor Syntetisk',publishedAt:'2026-06-15T08:00:00.000Z'};
 const v2:TjanstVersion={id:tid(602),versionNo:2,status:'draft',contentHash:hash(2),basedOnVersionId:v1.id,publishedByName:null,publishedAt:null};
 const old:Content={teachers:teachers.slice(0,2),rows:draft.rows.slice(0,2),specials:draft.specials.slice(0,1),joints:[]};
 const unit:Unit={schoolYear:YEAR,coreGeneration:0,evidenceGeneration:0,unitId:A,schoolName:long?'Syntetiska gymnasiet för teknik, naturvetenskap och samhällsvetenskap i Exempelstad':'Syntetiska gymnasiet',revision:7,classes:[te,ek,im,na],versions:[v1,v2],draft,snapshots:new Map([[v1.id,old]]),blockers:params.get('hinder')==='samlasning'?[{code:'joint_invalid',message:JOINT_INVALID}]:params.has('hinder')?[{code:'stale_rows',message:'En tjänsterad bygger på en äldre timplansversion.'}]:[]};
 if(params.get('hinder')==='rad'||params.get('hinder')==='flera')draft.rows.find(r=>r.id===tid(306))!.stale=true;
 if(params.get('hinder')==='flera')unit.blockers.push({code:'person_not_at_school',message:'En lärare saknar giltigt skoluppdrag på skolan för läsåret.'},{code:'unknown_rule',message:'Kontrollera planeringsunderlaget.'});
 if(params.get('hinder')==='blandad')unit.blockers=[{code:'joint_mixed_teachers',message:'Samläsningen har flera lärare.'}];
 if(params.get('hinder')==='okant')unit.blockers=[{code:'unknown_rule',message:'Kontrollera planeringsunderlaget.'}];
 if(variant==='apl'){te.aplMinutes=0;ek.aplMinutes=20700;ek.needs.find(n=>n.rowKey==='MATMAT01b')!.needVt=1800;draft.rows.find(r=>r.id===tid(306))!.needVt=1800;}
 if(variant==='okand-tid'){te.needs[0].needHt=null;te.needs[0].needVt=null;}
 if(variant==='tom'){unit.revision=0;unit.versions=[];unit.snapshots=new Map();unit.draft=null;}
 if(variant==='samlasning'){draft.rows.push(row(307,C.te,te,'SVESVE01',P.anna,1200,1200,j1),row(308,C.ek,ek,'SVESVE01',P.anna,1200,1200,j1));draft.joints[0].rowIds.push(tid(307),tid(308));draft.joints[0].teachers.push({personId:P.anna,ht:1200,vt:1200});}
 // 05.1-34: vakant=1 lägger en kvarglömd vakant rad på Matematik 1b i EK26, som Anna redan täcker helt.
 if(params.get('vakant'))draft.rows.push(row(309,C.ek,ek,'MATMAT01b',null,600,600));
 if(variant==='batch'){unit.revision=0;unit.versions=[];unit.snapshots=new Map();unit.draft=null;unit.classes=[gy(C.te,'TE26A','Batchplan',2,Array.from({length:101},(_,n)=>need(C.te,`BATCH${String(n+1).padStart(3,'0')}`,`Behov ${String(n+1).padStart(3,'0')}`,60,60)))];}
 if(variant==='utan-uppdrag')unit.draft!.specials=[];
 if(variant==='utan-klasser'){unit.classes=[na];unit.draft={teachers,rows:[],specials:[],joints:[]};}
 if(variant==='publicerad'){unit.versions=[v1];unit.draft=null;unit.snapshots=new Map([[v1.id,{...draft,joints:clone(draft.joints)}]]);}
 if(variant==='stor'){
  const classes:TjanstClass[]=[],rows:TjanstRow[]=[],big:TjanstTeacher[]=Array.from({length:40},(_,i)=>({personId:tid(1000+i),displayName:`Lärare${i+1} Efternamn${String(i+1).padStart(2,'0')}`,draft:false,shareHere:100}));
  for(let c=0;c<10;c++){const id=tid(2000+c);const cls=gy(id,`ST${c+1}`,'Storprogrammet',1,Array.from({length:30},(_,n)=>need(id,`KURS${String(n).padStart(2,'0')}`,`Kurs ${n+1} i klass ${c+1}`,3000,3000)));classes.push(cls);
   cls.needs.forEach((n,i)=>rows.push(row(3000+c*30+i,id,cls,n.rowKey,big[(c*30+i)%40].personId,3000,3000)));}
  unit.classes=classes;unit.draft={teachers:big,rows,specials:[],joints:[]};
 }
 // 05.1-29: syntetisk skola med 40 ämneslärare (5 per ämne), 6 klasser och 8 ämnen. Fysik i MA1 saknar lärare, Kemi i MA2 är vakant.
 if(variant==='manga'){
  const subjects=['Biologi','Engelska','Fysik','Historia','Idrott','Kemi','Matematik','Svenska'],first=['Alva','Bo','Clara','Dan','Ebba','Filip','Gun','Hugo','Ines','Jon'];
  const big:TjanstTeacher[]=subjects.flatMap((sub,si)=>Array.from({length:5},(_,k)=>({personId:tid(1100+si*5+k),displayName:`${first[(si+k)%10]} ${sub}lärare${k+1}`,draft:false,shareHere:100})));
  const classes:TjanstClass[]=[],rows:TjanstRow[]=[];
  for(let c=0;c<6;c++){const id=tid(2100+c),cls=gy(id,`MA${c+1}`,'Mångprogrammet',1,subjects.map((sub,si)=>need(id,`${sub.slice(0,3).toUpperCase()}0${si}`,`${sub} 1`,3000,3000)));classes.push(cls);
   subjects.forEach((sub,si)=>{const rk=`${sub.slice(0,3).toUpperCase()}0${si}`;if(c===0&&sub==='Fysik')return;
    rows.push(row(4000+c*10+si,id,cls,rk,c===1&&sub==='Kemi'?null:big[si*5+c%5].personId,3000,3000));});}
  // delvis=1: Historia i MA3 är delvis fördelad (VT 25 av 50 h) till sin lärare.
  // dubbel=1: Alva Biologilärare1 har också Kemi i MA1, alltså två rader i samma klass (två likadana förslagsskäl).
  if(params.get('dubbel')){const cls=classes[0];rows.push(row(4900,cls.classId,cls,'KEM05',big[0].personId,600,600));}
  if(params.get('delvis')){const r=rows.find(x=>x.classId===tid(2102)&&x.rowKey==='HIS03')!;r.teacherVt=1500;}
  unit.classes=classes;unit.draft={teachers:big,rows,specials:[],joints:[]};
 }
 return unit;
}
function otherUnit():Unit{
 const sa=gy(C.sa,'SA26C','Samhällsvetenskapsprogrammet',1,[need(C.sa,'HISHIS01a1','Historia 1a1',1500,1500)]);
 const v:TjanstVersion={id:tid(611),versionNo:1,status:'draft',contentHash:hash(11),basedOnVersionId:null,publishedByName:null,publishedAt:null};
 return{schoolYear:YEAR,coreGeneration:0,evidenceGeneration:0,unitId:B,schoolName:'Andra syntetiska skolan',revision:1,classes:[sa],versions:[v],draft:{teachers:[{personId:P.greta,displayName:'Greta Grön',draft:false,shareHere:40}],rows:[row(320,C.sa,sa,'HISHIS01a1',P.greta,1500,1500)],specials:[],joints:[]},snapshots:new Map(),blockers:[]};
}
const scopeKey=(unitId:string,schoolYear:number)=>`${unitId}:${schoolYear}`;
const units=new Map<string,Unit>();
const people:TjanstPerson[]=[
 {id:P.greta,givenName:'Greta',familyName:'Grön',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(805),unitId:B,schoolName:'Andra syntetiska skolan',percent:40,startsOn:'2025-07-01',endsOn:null}]},
 {id:P.anna,givenName:'Anna',familyName:'Andersson',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(801),unitId:A,schoolName:'Syntetiska gymnasiet',percent:60,startsOn:'2026-07-01',endsOn:null}]},
 {id:P.bertil,givenName:'Bertil',familyName:'Berg',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(802),unitId:A,schoolName:'Syntetiska gymnasiet',percent:100,startsOn:'2026-07-01',endsOn:null}]},
 {id:P.cecilia,givenName:'Cecilia',familyName:'Dahl',externalId:null,externalIdSource:null,status:'draft',proposedForUnitId:A,draftNote:null,revision:1,employments:[],duties:[]},
 {id:P.david,givenName:'David',familyName:'Ek',externalId:null,externalIdSource:null,status:'active',proposedForUnitId:null,draftNote:null,revision:1,employments:[],duties:[{id:tid(804),unitId:A,schoolName:'Syntetiska gymnasiet',percent:50,startsOn:'2026-07-01',endsOn:'2027-01-31'}]},
];

if(variant==='samma-namn')people.push({...clone(people.find(p=>p.id===P.anna)!),id:tid(106),duties:[{id:tid(806),unitId:A,schoolName:'Syntetiska gymnasiet',percent:30,startsOn:'2026-07-01',endsOn:null}]});

// All mutable sources are scoped explicitly. A new year projects needs, never copied allocations.
const blank=():Content=>({teachers:[],rows:[],specials:[],joints:[]});
function current(u:Unit){return u.versions.find(v=>v.status==='draft')??u.versions.find(v=>v.status==='published')??null;}
function content(u:Unit):Content{const v=current(u);return v===null?blank():v.status==='draft'?u.draft!:u.snapshots.get(v.id)!;}
function retarget(u:Unit,year:number):Unit{
 const next=clone(u);next.schoolYear=year;
 next.classes.forEach(c=>c.needs.forEach(n=>{n.sourceKey=`class_timplan:${c.classId}:${year}:${n.rowKey}`;}));
 for(const data of [next.draft,...next.snapshots.values()])data?.rows.forEach(r=>{r.sourceKey=`class_timplan:${r.classId}:${year}:${r.rowKey}`;});
 return next;
}
for(const seed of [standardUnit(),otherUnit()]){
 units.set(scopeKey(seed.unitId,YEAR),seed);
 const future=retarget(seed,2027);future.revision=0;future.versions=[];future.draft=null;future.snapshots=new Map();
 units.set(scopeKey(seed.unitId,2027),future);
 const past=retarget(seed,2025),v:TjanstVersion={id:seed.unitId===A?tid(620):tid(621),versionNo:1,status:'published',contentHash:hash(20),basedOnVersionId:null,publishedByName:'Rektor Syntetisk',publishedAt:'2025-08-01T08:00:00.000Z'};
 const old=clone(content(seed));
 old.rows.forEach(r=>{r.sourceKey=`class_timplan:${r.classId}:2025:${r.rowKey}`;});
 if(seed.unitId===A&&variant!=='batch'&&variant!=='utan-klasser'&&variant!=='stor'&&variant!=='manga'){
  const cls=past.classes.find(c=>c.classId===C.te)!;
  if(!old.teachers.some(t=>t.personId===P.anna))old.teachers.push({personId:P.anna,displayName:'Anna Andersson',draft:false,shareHere:60});
  old.rows.push(row(350,C.te,cls,'MATMAT01c',P.anna,3000,3000));
 }
 past.versions=[v];past.draft=null;past.snapshots=new Map([[v.id,old]]);past.revision=1;
 units.set(scopeKey(seed.unitId,2025),past);
}
if(variant==='ny-gr-klass'){
 const u=units.get(scopeKey(A,2027))!,oldClass=C.te,newClass=tid(299);
 u.classes=[{classId:newClass,name:'TE26A',aplMinutes:null,link:{linkRevision:0,timplanId:tid(789),seriesId:tid(790),seriesName:'Grundskoleplan',timplanVersion:1,column:'ak8',schoolform:'grundskola'},
  needs:[need(newClass,'GR-MA-NY','Matematik',3000,3000)]}];
 u.classes[0].needs[0].sourceKey=`class_timplan:${newClass}:2027:GR-MA-NY`;void oldClass;
}

const EDIT:TjanstPlanAction[]=['add_teacher','remove_teacher','save_row','delete_row','save_special','delete_special','save_joint','dissolve_joint','move','bulk','save_sharing','clear_sharing'];
/** 05.1-33 / D-31: samma hinder som tjanst_plan_blockers för flera lärare på samma behov. */
function sharingBlockers(d:Content){
 const own=d.rows.filter(r=>r.personId&&!r.jointGroupId),keys=[...new Set(own.map(r=>r.sourceKey))],out:{code:string;message:string}[]=[];
 const shared=keys.filter(k=>new Set(own.filter(r=>r.sourceKey===k).map(r=>r.personId)).size>1);
 if(shared.some(k=>!(d.sharing??[]).some(x=>x.sourceKey===k)))out.push({code:'shared_need_unspecified',message:'Två eller fler lärare har tid på samma kurs i en klass utan angiven delning. Ange om de undervisar en i taget eller samtidigt.'});
 if((d.sharing??[]).some(x=>shared.includes(x.sourceKey)&&!x.graderPersonIds.some(g=>own.some(r=>r.sourceKey===x.sourceKey&&r.personId===g))))out.push({code:'grader_missing',message:'En delad kurs saknar lärare som sätter betyg. Ange vem eller vilka av lärarna som sätter betyget.'});
 return out;
}
const allBlockers=(u:Unit)=>{const v=current(u),base=['rad','flera'].includes(params.get('hinder')??'')?u.blockers.filter(b=>b.code!=='stale_rows'||content(u).rows.some(r=>r.stale)):u.blockers;return v?.status==='draft'?[...base,...sharingBlockers(u.draft!)]:[...base];};
function read(u:Unit,versionId?:string):TjanstPlanRead{
 const v=versionId?u.versions.find(v=>v.id===versionId):current(u);if(versionId&&(!v||!['published','superseded'].includes(v.status)))throw new TjanstContractError('wrong_scope');
 const data=v===null?blank():v!.status==='draft'?u.draft!:u.snapshots.get(v!.id)!;
 const blockers=versionId?[]:allBlockers(u),editable=!versionId,canPublish=editable&&v?.status==='draft'&&role==='rektor'&&!blockers.length;
 const actions=editable?[...EDIT,...(v?.status==='draft'?['discard_draft' as const]:[]),...(canPublish?['publish' as const]:[])]:[];
 return parsePlanReadReply({contractVersion:'tjanst_v1',unitId:u.unitId,schoolName:u.schoolName,schoolYear:u.schoolYear,revision:u.revision,version:v?clone(v):null,
  versions:clone(u.versions.filter(x=>x.status!=='discarded')),teachers:clone(data.teachers),classes:clone(u.classes),rows:clone(data.rows),specials:clone(data.specials),joints:clone(data.joints),sharing:clone(data.sharing??[]),
  actions,blockers,capabilities:{canEdit:editable,canPublish,canReadHistory:true}}, {unitId:u.unitId,schoolYear:u.schoolYear,...(versionId?{versionId}:{})});
}

type Failure={status:number;code:string}|'lost'|'network';
type Logged={path:string;body:any};
type Control={commands:Logged[];reads:Logged[];fail:Record<string,Failure[]>;held:Record<string,number>;release:()=>void;mfaVerified:boolean;openedLinks:number;openedLinkForms:string[];
 failNext:(route:string,failure:Failure)=>void;holdNext:(route:string)=>void;holdProduced:(route:string)=>void;produced:{id:number;route:string;body:unknown}[];releaseProduced:(id?:number)=>void;
 bump:(kind:'core'|'person'|'evidence',unitId?:string,year?:number,personId?:string)=>void;suggestionsUnavailable:(value:boolean,unitId?:string,year?:number)=>void;
 snapshotOf:(unitId?:string,year?:number)=>unknown;activeScope:{unitId:string|null;schoolYear:number;assignmentId:string;epoch:number}};
declare global{interface Window{__tjanst:Control}}
let releases:(()=>void)[]=[];const producedHolds:Record<string,number>={},producedReleases=new Map<number,()=>void>(),unavailable=new Set<string>();let sequence=0;
const control:Control={commands:[],reads:[],fail:{},held:{},mfaVerified:false,openedLinks:0,openedLinkForms:[],produced:[],activeScope:{unitId:A,schoolYear:YEAR,assignmentId:tid(950),epoch:1},
 release:()=>{const r=releases;releases=[];r.forEach(f=>f());},failNext:(route,failure)=>{(control.fail[route]??=[]).push(failure);},holdNext:route=>{control.held[route]=(control.held[route]??0)+1;},
 holdProduced:route=>{producedHolds[route]=(producedHolds[route]??0)+1;},releaseProduced:id=>{for(const [key,release]of producedReleases)if(id===undefined||id===key){producedReleases.delete(key);release();}},
 bump:(kind,unitId=control.activeScope.unitId??A,year=control.activeScope.schoolYear,personId=P.anna)=>{const u=units.get(scopeKey(unitId,year))!;if(kind==='person')people.find(p=>p.id===personId)!.revision++;else if(kind==='core')u.coreGeneration++;else u.evidenceGeneration++;},
 suggestionsUnavailable:(value,unitId=control.activeScope.unitId??A,year=control.activeScope.schoolYear)=>{const key=scopeKey(unitId,year);if(value)unavailable.add(key);else unavailable.delete(key);},
 snapshotOf:(unitId=control.activeScope.unitId??A,year=control.activeScope.schoolYear)=>{const u=units.get(scopeKey(unitId,year))!;return clone({...u,snapshots:Object.fromEntries(u.snapshots)});}};
window.__tjanst=control;
if(params.get('forsta')==='natverk')control.failNext('plan/lasa','network');
if(params.get('forslag')==='otillgangliga')unavailable.add(scopeKey(A,YEAR));
const error=(status:number,code:string):Reply=>({status,json:code.startsWith('tjanst_')||code==='wrong_scope'?{code:status===409?'conflict':'bad_request',correlationId:'syntetisk-ref-1',details:{reason:code}}:{code,correlationId:'syntetisk-ref-1'}});
function fail(reason:string):never{throw new TjanstContractError(reason);}
const same=(a:unknown,b:unknown)=>tjanstCanonicalSerialize(a as never)===tjanstCanonicalSerialize(b as never);

async function candidates(u:Unit):Promise<TjanstYearCandidate[]>{
 const start=`${u.schoolYear}-07-01`,end=`${u.schoolYear+1}-06-30`,result:TjanstYearCandidate[]=[];
 for(const p of people){
  const duties=p.duties.filter(d=>d.unitId===u.unitId&&d.startsOn<=end&&(d.endsOn===null||d.endsOn>=start));
  if(p.status==='draft'?p.proposedForUnitId!==u.unitId:!duties.length)continue;
  const own=duties.map(d=>({dutyId:d.id,startsOn:d.startsOn,endsOn:d.endsOn,percent:d.percent}));
  result.push({personId:p.id,displayName:`${p.givenName} ${p.familyName}`,draft:p.status==='draft',shareHere:p.status==='draft'?null:Math.max(...duties.map(d=>d.percent)),duties:own,
   personBasisHash:await tjanstYearHash('person',{unitId:u.unitId,schoolYear:u.schoolYear,personId:p.id,revision:p.revision,duties:own,draft:p.status==='draft'}),qualificationStatus:'unknown'});
 }
 // Large matrix uses synthetic local teachers too, each with a real fixture duty shape.
 for(const p of content(u).teachers)if(!result.some(c=>c.personId===p.personId)&&(variant==='stor'||variant==='manga'))result.push({personId:p.personId,displayName:p.displayName,draft:false,shareHere:100,
  duties:[{dutyId:p.personId,startsOn:start,endsOn:end,percent:100}],personBasisHash:await tjanstYearHash('person',{unitId:u.unitId,schoolYear:u.schoolYear,personId:p.personId}),qualificationStatus:'unknown'});
 return result;
}
function basis(u:Unit){return{unitId:u.unitId,schoolYear:u.schoolYear,currentRevision:u.revision,baseVersionId:current(u)?.id??null,coreGeneration:u.coreGeneration,classes:u.classes};}
async function support(u:Unit,q:TjanstYearRequest):Promise<TjanstYearReply>{
 const available=await candidates(u),base={contractVersion:'tjanst_year_v1',unitId:u.unitId,schoolYear:u.schoolYear,currentRevision:u.revision,baseVersionId:current(u)?.id??null};
 if(q.mode==='catalog')return parseYearReply({...base,mode:'catalog',basisHash:await tjanstYearHash('basis',{core:basis(u),people:available.map(p=>[p.personId,p.personBasisHash])}),candidates:available,totalCandidates:available.length},q);
 if(q.mode==='row'){
  const cls=u.classes.find(c=>c.needs.some(n=>n.sourceKey===q.sourceKey)),n=cls?.needs.find(n=>n.sourceKey===q.sourceKey);if(!cls||!n)fail('tjanst_unknown_source');
  const currentRow=q.rowId===null?null:content(u).rows.find(r=>r.id===q.rowId&&r.sourceKey===q.sourceKey);if(q.rowId!==null&&!currentRow)fail('tjanst_stale_basis');
  const refs:any[]=[];
  for(const src of [u,units.get(scopeKey(u.unitId,u.schoolYear-1))].filter((x):x is Unit=>!!x)){
   const v=src===u?current(src):src.versions.find(v=>v.status==='published');if(!v)continue;
   const rows=src===u?content(src).rows:src.snapshots.get(v.id)?.rows??[];
   for(const r of rows){if(!r.personId||!available.some(c=>c.personId===r.personId))continue;
    const reason=yearEvidenceReason({unitId:u.unitId,schoolYear:u.schoolYear,classId:cls.classId,rowKey:n.rowKey},{unitId:src.unitId,schoolYear:src.schoolYear,classId:r.classId,rowKey:r.rowKey,versionStatus:v.status});
    if(reason)refs.push({reason,unitId:u.unitId,schoolYear:src.schoolYear,versionId:v.id,rowId:r.id,personId:r.personId,classId:r.classId,rowKey:r.rowKey,sourceKey:r.sourceKey});
   }
  }
  const suggestions=[];for(const p of available){const references=refs.filter(r=>r.personId===p.personId);if(references.length)suggestions.push({suggestionId:`history:${p.personId}`,personId:p.personId,evidenceHash:await tjanstYearHash('evidence',{references,generation:u.evidenceGeneration}),reasons:[...new Set(references.map(r=>r.reason))],references});}
  const isUnavailable=unavailable.has(scopeKey(u.unitId,u.schoolYear));
  return parseYearReply({...base,mode:'row',basisHash:await tjanstYearHash('basis',{core:basis(u),sourceKey:q.sourceKey,rowId:q.rowId}),sourceKey:q.sourceKey,rowId:q.rowId,
   need:{...n,classId:cls.classId,className:cls.name},currentRow:currentRow??null,candidates:available,totalCandidates:available.length,
   recommendationStatus:isUnavailable?'unavailable':suggestions.length?'ready':'empty',suggestions:isUnavailable?[]:suggestions},q);
 }
 const b=q.batch;if(b.baseVersionId!==base.baseVersionId)fail('tjanst_stale_basis');
 const data=content(u),blockers:TjanstYearBatchReply['blockers']=[],items:TjanstYearBatchReply['items']=[];let writeObjectCount=b.items.length;const jointTotals:TjanstYearBatchReply['jointTotals']=[];
 if(b.action==='move'){
  const model=previewYearMove({unitId:u.unitId,schoolYear:u.schoolYear},b.baseVersionId!,b.items,data.rows,data.specials,data.joints);blockers.push(...model.blockers);writeObjectCount=model.writeObjectCount;
  for(const i of b.items){const r=i.kind==='row'?data.rows.find(r=>r.id===i.id):data.specials.find(s=>s.id===i.id),group=i.kind==='row'?(r as TjanstRow|undefined)?.jointGroupId??null:null;
   const before=r?{personId:r.personId,ht:'teacherHt'in r?r.teacherHt:r.ht,vt:'teacherVt'in r?r.teacherVt:r.vt}:null;
   items.push({itemKey:i.itemKey,kind:i.kind,id:i.id,sourceKey:i.kind==='row'?(r as TjanstRow|undefined)?.sourceKey??null:null,classId:r?.classId??null,jointGroupId:group,before,after:before?{...before,personId:i.choice.personId}:null});
   if(group&&i.choice.personId&&!jointTotals.some(t=>t.jointId===group&&t.personId===i.choice.personId)){const time=data.joints.find(j=>j.id===group)!.teachers.find(t=>t.personId===i.fromPersonId);if(time)jointTotals.push({jointId:group,personId:i.choice.personId,ht:time.ht,vt:time.vt});}
  }
 }else for(const i of b.items){
  const p=i.payload,src=i.kind==='row'?u.classes.find(c=>c.needs.some(n=>n.sourceKey===i.payload.sourceKey)):null;
  items.push({itemKey:i.itemKey,kind:i.kind,id:null,sourceKey:i.kind==='row'?i.payload.sourceKey:null,classId:i.kind==='row'?src?.classId??null:i.payload.classId,jointGroupId:null,before:null,
   after:{personId:p.personId,ht:i.kind==='row'?i.payload.teacherHt:i.payload.ht,vt:i.kind==='row'?i.payload.teacherVt:i.payload.vt}});
  if(i.kind==='row')try{const row=await support(u,{unitId:u.unitId,schoolYear:u.schoolYear,mode:'row',sourceKey:i.payload.sourceKey,rowId:null});if(row.mode==='row')assertYearRowContext(i.payload,row);}catch{blockers.push({itemKey:i.itemKey,groupId:null,code:'stale_basis'});}
  if(i.kind==='special'&&i.payload.kind==='mentor'&&!u.classes.some(c=>c.classId===i.payload.classId))blockers.push({itemKey:i.itemKey,groupId:null,code:'unknown_class'});
  if(i.kind==='row'&&p.personId!==null&&data.rows.some(r=>r.sourceKey===i.payload.sourceKey&&r.personId===p.personId))blockers.push({itemKey:i.itemKey,groupId:null,code:'duplicate_row'});
 }
 for(const i of b.items){const c='choice'in i?i.choice:i.payload.planningContext.choice;if(c.kind!=='unassigned'&&!available.some(p=>p.personId===c.personId&&p.personBasisHash===c.expectedPersonBasisHash))blockers.push({itemKey:i.itemKey,groupId:null,code:'person_unavailable'});}
 const basisHash=await tjanstYearHash('basis',{core:basis(u),data,people:available.map(p=>[p.personId,p.personBasisHash])});
 const previewHash=await tjanstYearHash('preview',{basisHash,batch:b,items,blockers,jointTotals,writeObjectCount});
 return parseYearReply({...base,mode:'batch',basisHash,action:b.action,previewHash,items,selectedCount:b.items.length,writeObjectCount,jointTotals,blockers},q);
}

type Journal={assignmentId:string;ref:TjanstCommandRef;command:unknown;result:any};
const receipts=new Map<string,Journal>();
async function apply(original:Unit,raw:unknown):Promise<Reply>{
 const q=await verifyPlanCommandHash(raw),p=q.payload as any;
 if(q.unitId!==original.unitId||q.schoolYear!==original.schoolYear)fail('wrong_scope');
 if(q.expectedRevision!==original.revision)fail('tjanst_revision_conflict');
 if(q.action==='save_row'){
  const s=await support(original,{unitId:q.unitId,schoolYear:q.schoolYear,mode:'row',sourceKey:p.sourceKey,rowId:p.rowId});
  if(s.mode!=='row')fail('tjanst_invalid');assertYearRowContext(p,s);
 }else if(q.action==='move'||q.action==='bulk'){
  const {expectedPreviewHash,...batch}=p,s=await support(original,{unitId:q.unitId,schoolYear:q.schoolYear,mode:'batch',batch});
  if(s.mode!=='batch'||s.previewHash!==expectedPreviewHash||s.blockers.length)fail('tjanst_stale_basis');
 }else{
  const s=await support(original,{unitId:q.unitId,schoolYear:q.schoolYear,mode:'catalog'});
  if(p.mutationContext.baseVersionId!==s.baseVersionId||p.mutationContext.expectedBasisHash!==s.basisHash)fail('tjanst_stale_basis');
 }
 // Mutate a private clone. Validation or a late batch failure cannot leave partial assignments.
 const u=clone(original),available=await candidates(original),ids=new Map<string,string>();
 let v=current(u);
 if(q.action==='publish'&&(role!=='rektor'||!control.mfaVerified))return error(403,role!=='rektor'?'forbidden':'mfa_required');
 if((q.action==='publish'||q.action==='discard_draft')&&v?.status!=='draft')fail('tjanst_published_meanwhile');
 if(q.action==='publish'&&(q.expectedContentHash!==v!.contentHash||allBlockers(u).length))fail('tjanst_content_changed');
 if(v?.status!=='draft'){
  const d=clone(content(u));
  for(const item of [...d.rows,...d.specials,...d.joints]){const old=item.id;item.id=crypto.randomUUID();ids.set(old,item.id);}
  d.rows.forEach(r=>{if(r.jointGroupId)r.jointGroupId=ids.get(r.jointGroupId)!;});d.joints.forEach(j=>{j.rowIds=j.rowIds.map(id=>ids.get(id)!);});
  v={id:crypto.randomUUID(),versionNo:Math.max(0,...u.versions.map(v=>v.versionNo))+1,status:'draft',contentHash:hash(0),basedOnVersionId:v?.id??null,publishedByName:null,publishedAt:null};
  u.versions.push(v);u.draft=d;
 }
 const d=u.draft!,id=(value:string)=>ids.get(value)??value;
 const addTeacher=(personId:string|null)=>{if(!personId||d.teachers.some(t=>t.personId===personId))return;const c=available.find(c=>c.personId===personId);if(!c)fail('tjanst_person_unavailable');d.teachers.push({personId,displayName:c.displayName,draft:c.draft,shareHere:c.shareHere});};
 const saveRow=(payload:any)=>{
  const cls=u.classes.find(c=>c.needs.some(n=>n.sourceKey===payload.sourceKey)),n=cls?.needs.find(n=>n.sourceKey===payload.sourceKey);if(!cls||!n)fail('tjanst_unknown_source');
  const existing=payload.rowId?d.rows.find(r=>r.id===id(payload.rowId)):null;if(payload.rowId&&!existing)fail('wrong_scope');
  if(existing?.jointGroupId&&existing.personId!==payload.personId)fail('tjanst_joint_invalid');
  if(payload.personId!==null&&d.rows.some(r=>r.personId===payload.personId&&r.sourceKey===payload.sourceKey&&r!==existing))fail('tjanst_duplicate_row');
  addTeacher(payload.personId);
  const value={personId:payload.personId,teacherHt:payload.teacherHt,teacherVt:payload.teacherVt,comment:payload.comment};
  if(existing)Object.assign(existing,value,{stale:false,needHt:n.needHt,needVt:n.needVt,needBasis:n.needBasis});else d.rows.push({id:crypto.randomUUID(),lineageId:crypto.randomUUID(),sourceKind:'class_timplan',sourceKey:payload.sourceKey,classId:cls.classId,rowKey:n.rowKey,needHt:n.needHt,needVt:n.needVt,needBasis:n.needBasis,stale:false,jointGroupId:null,...value});
 };
 const saveSpecial=(payload:any)=>{if(payload.kind==='mentor'&&!u.classes.some(c=>c.classId===payload.classId))fail('tjanst_unknown_source');addTeacher(payload.personId);
  const existing=payload.specialId?d.specials.find(s=>s.id===id(payload.specialId)):null;if(payload.specialId&&!existing)fail('wrong_scope');
  const value={kind:payload.kind,label:payload.label,personId:payload.personId,classId:payload.classId,ht:payload.ht,vt:payload.vt,comment:payload.comment};
  if(existing)Object.assign(existing,value);else d.specials.push({id:crypto.randomUUID(),lineageId:crypto.randomUUID(),...value});};
 if(q.action==='add_teacher')addTeacher(p.personId);
 else if(q.action==='remove_teacher'){
  if(!d.teachers.some(t=>t.personId===p.personId))fail('tjanst_teacher_not_found');
  if(d.rows.some(r=>r.personId===p.personId)||d.specials.some(s=>s.personId===p.personId)||d.joints.some(j=>j.teachers.some(t=>t.personId===p.personId)))fail('tjanst_teacher_not_empty');
  d.teachers=d.teachers.filter(t=>t.personId!==p.personId);
 }else if(q.action==='save_row')saveRow(p);
 else if(q.action==='delete_row'){const r=d.rows.find(r=>r.id===id(p.rowId));if(!r)fail('wrong_scope');if(r.jointGroupId)fail('tjanst_joint_invalid');d.rows=d.rows.filter(r=>r.id!==id(p.rowId));}
 else if(q.action==='save_special')saveSpecial(p);
 else if(q.action==='delete_special')d.specials=d.specials.filter(s=>s.id!==id(p.specialId));
 else if(q.action==='save_joint'){
  const rowIds=p.rowIds.map(id),jointId=p.jointId?id(p.jointId):crypto.randomUUID();
  if(d.rows.some(r=>rowIds.includes(r.id)&&r.jointGroupId!==null&&r.jointGroupId!==jointId))fail('tjanst_joint_already');
  if(new Set(d.rows.filter(r=>rowIds.includes(r.id)).map(r=>r.classId)).size<2)fail('tjanst_joint_invalid');
  if(p.teachers.some((t:any)=>!d.rows.some(r=>rowIds.includes(r.id)&&r.personId===t.personId)))fail('tjanst_joint_invalid');
  // D-28: samma lärare på alla rader, eller bara vakanta rader.
  if(new Set(d.rows.filter(r=>rowIds.includes(r.id)).map(r=>r.personId??'vakant')).size>1)fail('tjanst_joint_teacher_mismatch');
  d.rows.forEach(r=>{if(r.jointGroupId===jointId)r.jointGroupId=null;if(rowIds.includes(r.id))r.jointGroupId=jointId;});
  const j=d.joints.find(j=>j.id===jointId),value={name:p.name,rowIds,teachers:p.teachers};if(j)Object.assign(j,value);else d.joints.push({id:jointId,lineageId:crypto.randomUUID(),...value});
 }else if(q.action==='dissolve_joint'){d.rows.forEach(r=>{if(r.jointGroupId===id(p.jointId))r.jointGroupId=null;});d.joints=d.joints.filter(j=>j.id!==id(p.jointId));}
 else if(q.action==='move'){
  const before=content(original),m=previewYearMove({unitId:q.unitId,schoolYear:q.schoolYear},p.baseVersionId,p.items,before.rows,before.specials,before.joints);
  if(m.blockers.length)fail('tjanst_stale_basis');
  for(const item of p.items){addTeacher(item.choice.personId);if(item.kind==='row')d.rows.find(r=>r.id===id(item.id))!.personId=item.choice.personId;else d.specials.find(s=>s.id===id(item.id))!.personId=item.choice.personId;}
  for(const j of m.joints)d.joints.find(x=>x.id===id(j.id))!.teachers=clone(j.teachers);
 }else if(q.action==='bulk')for(const item of p.items){if(item.kind==='row')saveRow(item.payload);else saveSpecial(item.payload);}
 else if(q.action==='save_sharing'){
  const own=d.rows.filter(r=>r.sourceKey===p.sourceKey&&r.personId&&!r.jointGroupId);
  if(new Set(own.map(r=>r.personId)).size<2)fail(d.rows.some(r=>r.sourceKey===p.sourceKey&&r.jointGroupId)?'tjanst_sharing_joint':'tjanst_sharing_too_few');
  if(!p.graderPersonIds.length||p.graderPersonIds.some((g:string)=>!own.some(r=>r.personId===g)))fail('tjanst_sharing_grader');
  d.sharing=[...(d.sharing??[]).filter(x=>x.sourceKey!==p.sourceKey),{sourceKey:p.sourceKey,mode:p.mode,graderPersonIds:[...p.graderPersonIds].sort()}];
 }else if(q.action==='clear_sharing'){if(!(d.sharing??[]).some(x=>x.sourceKey===p.sourceKey))fail('tjanst_invalid');d.sharing=(d.sharing??[]).filter(x=>x.sourceKey!==p.sourceKey);}
 u.revision++;v!.contentHash=await tjanstHashCanonical({teachers:d.teachers,rows:d.rows,specials:d.specials,joints:d.joints,...(d.sharing?.length?{sharing:d.sharing}:{})});
 if(q.action==='publish'){for(const x of u.versions)if(x.status==='published')x.status='superseded';Object.assign(v!,{status:'published',publishedByName:'Rektor Syntetisk',publishedAt:'2026-10-24T09:30:00.000Z'});u.snapshots.set(v!.id,clone(d));u.draft=null;}
 if(q.action==='discard_draft'){v!.status='discarded';u.draft=null;}
 const result=parsePlanCommandReply({receipt:{commandId:q.commandId,action:q.action,versionId:v!.id,revision:u.revision,contentHash:v!.contentHash,replayed:false,changed:true},detail:read(u)},q);
 units.set(scopeKey(u.unitId,u.schoolYear),u);receipts.set(q.commandId,{assignmentId:control.activeScope.assignmentId,ref:planCommandRef(q),command:q,result});return{status:200,json:result};
}
const personalRead=(unitId:string)=>parsePersonalReadReply({contractVersion:'tjanst_v1',scope:'unit',unitId,people:clone(people.filter(x=>x.duties.some(d=>d.unitId===unitId)||x.proposedForUnitId===unitId)),actions:['create_draft_teacher'],blockers:[],capabilities:{canManage:false,canCreateDraft:true}},{unitId});
async function personal(raw:unknown):Promise<Reply>{
 const q=parsePersonalCommand(raw);if(role!=='rektor'||q.action!=='create_draft_teacher')return error(403,'forbidden');const p=q.payload;
 const person:TjanstPerson={id:crypto.randomUUID(),givenName:p.givenName,familyName:p.familyName,externalId:null,externalIdSource:null,status:'draft',proposedForUnitId:p.unitId,draftNote:p.draftNote,revision:1,employments:[],duties:[]};
 people.push(person);const result=parsePersonalCommandReply({receipt:{commandId:q.commandId,action:q.action,personId:person.id,revision:1,replayed:false},detail:personalRead(p.unitId)},q,{unitId:p.unitId});
 receipts.set(q.commandId,{assignmentId:control.activeScope.assignmentId,command:q,ref:{family:'personal',commandId:q.commandId,action:q.action,target:{unitId:p.unitId,schoolYear:null,versionId:null,personId:null}},result});return{status:200,json:result};
}
async function route(path:string,body:any):Promise<Reply|'lost'|'network'>{
 const name=path.replace('/api/tjanst/',''),failure=control.fail[name]?.shift(),assignment=control.activeScope.assignmentId;
 if(control.held[name]){control.held[name]--;await new Promise<void>(resolve=>releases.push(resolve));}
 if(assignment!==control.activeScope.assignmentId)return error(409,'context_changed');if(failure==='network')return'network';if(failure&&failure!=='lost')return error(failure.status,failure.code);
 let reply:Reply;
 try{
  if(name==='plan/lasa'){const q=parsePlanReadRequest(body);control.reads.push({path,body:clone(body)});const u=units.get(scopeKey(q.unitId,q.schoolYear));reply=u?{status:200,json:read(u,q.versionId)}:error(403,'forbidden');}
  else if(name==='plan/forhandsvisa'){const q=parseYearRequest(body);control.reads.push({path,body:clone(body)});const u=units.get(scopeKey(q.unitId,q.schoolYear));reply=u?{status:200,json:await support(u,q)}:error(403,'forbidden');}
  else if(name==='plan/kommando'||name==='plan/publicera'){
   const q=await verifyPlanCommandHash(body);control.commands.push({path,body:clone(body)});const old=receipts.get(q.commandId);
   if(old){if(old.assignmentId!==control.activeScope.assignmentId||!same(old.command,q))fail('tjanst_command_conflict');reply={status:200,json:{...clone(old.result),receipt:{...old.result.receipt,replayed:true}}};}
   else{const u=units.get(scopeKey(q.unitId,q.schoolYear));reply=u?await apply(u,q):error(403,'forbidden');}
  }else if(name==='plan/status'||name==='personal/status'){
   const ref=parseCommandRef(body.command);control.reads.push({path,body:clone(body)});const stored=receipts.get(ref.commandId);
   if(stored&&(stored.assignmentId!==control.activeScope.assignmentId||!same(ref,stored.ref)))fail('tjanst_command_conflict');
   const result=stored?{state:'completed',result:clone(stored.result)}:{state:'not_found',result:null};reply={status:200,json:ref.family==='plan'?parsePlanStatusReply(result,ref):result};
  }else if(name==='personal/lasa'){control.reads.push({path,body:clone(body)});reply=role==='rektor'?{status:200,json:personalRead(body.unitId)}:error(403,'forbidden');}
  else if(name==='personal/kommando'){control.commands.push({path,body:clone(body)});reply=await personal(body);}
  else reply=error(404,'not_found');
 }catch(e){if(!(e instanceof TjanstContractError))throw e;reply=error(/stale|conflict|changed|meanwhile/.test(e.reason)?409:400,e.reason);}
 if(producedHolds[name]){producedHolds[name]--;const id=++sequence;reply=clone(reply);control.produced.push({id,route:name,body:clone(body)});await new Promise<void>(resolve=>producedReleases.set(id,resolve));}
 return failure==='lost'?'lost':reply;
}
const realFetch=window.fetch.bind(window);setKnownEpoch(1);
window.fetch=async(input:RequestInfo|URL,init?:RequestInit)=>{
 const url=new URL(typeof input==='string'?input:input instanceof URL?input.href:input.url,location.href);if(!url.pathname.startsWith('/api/tjanst/'))return realFetch(input,init);
 const epoch=control.activeScope.epoch,raw=typeof init?.body==='string'?init.body:'{}';
 const result=new TextEncoder().encode(raw).length>65536?error(413,'payload_too_large'):await route(url.pathname,JSON.parse(raw));
 if(result==='lost'||result==='network')throw new TypeError('Failed to fetch');
 return new Response(JSON.stringify(result.json),{status:result.status,headers:{'Content-Type':'application/json','X-Context-Epoch':String(epoch)}});
};
const feedback:TjanstFeedback|undefined=params.has('aterkoppling')?{versionNo:1,teachers:[{personId:P.anna,name:'Anna Andersson',acknowledgedAt:'2026-06-16T07:00:00.000Z'},{personId:P.bertil,name:'Bertil Berg',acknowledgedAt:null}],comments:[{id:tid(901),personId:P.anna,name:'Anna Andersson',at:'2026-06-16T07:05:00.000Z',body:'Jag vill gärna ha mentorstiden kvar på VT.'}]}:undefined;
const context=(unitId:string|null,assignmentId:string):ActiveContext=>({assignmentId,membershipId:tid(951),customerId:tid(952),customerName:'Syntetisk kund',organizerId:tid(953),organizerName:'Syntetisk huvudman',unitId,unitName:null,function:role,label:role==='rektor'?'Rektor':'Skoladministratör',blocked:false,valid:true});
function Harness(){
 const [unit,setUnit]=useState<string|null>(params.get('skola')==='alla'?null:A),[year,setYear]=useState(params.get('ar')==='2027'?2027:YEAR),[assignment,setAssignment]=useState(tid(950)),[epoch,setEpoch]=useState(1);
 const blocked=useHasUnsaved('navigation-block:'),unsaved=useHasUnsaved();useLayoutEffect(()=>{control.activeScope={unitId:unit,schoolYear:year,assignmentId:assignment,epoch};},[unit,year,assignment,epoch]);
 return <main id="workspace" lang="sv" style={{padding:'16px',maxWidth:'1800px',margin:'0 auto'}}>
  <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginBottom:'16px'}}><button type="button" onClick={()=>setUnit(unit===B?A:B)}>Byt skola</button><button type="button" onClick={()=>setYear(year===2026?2027:2026)}>Byt läsår</button><button type="button" onClick={()=>{setKnownEpoch(epoch+1);setEpoch(epoch+1);setAssignment(assignment===tid(950)?tid(954):tid(950));}}>Byt uppdrag</button><button type="button" disabled={blocked}>Lämna arbetsytan</button><output data-unsaved={String(unsaved)}>{unsaved?'Osparat finns':''}</output></div>
  <TjanstWorkspace context={context(unit,assignment)} epoch={epoch} unitId={unit} schoolYear={year} identityKey={KEY} feedback={feedback} onOpenClassLinks={form=>{control.openedLinks++;control.openedLinkForms.push(form);}} onSessionLost={()=>undefined}/>
 </main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness/></UnsavedChangesProvider>);
