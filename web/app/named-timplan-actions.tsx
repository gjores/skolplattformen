'use client';
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Button} from '@/components/ui/button';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from '@/components/ui/dialog';
import {api,ApiError} from '@/lib/server-client.ts';
import {useUnsavedChanges} from '@/lib/unsaved-changes.tsx';
import {parseGymTimplan,parseGymTimplanCreateReply,type GymTimplan,type GymTimplanUnderlag,type GymTimplanUnit,type GymTimplanSummary} from '@/lib/gym-timplan.ts';
import {normalizeTimplanName,parseNamedTimplanCreateReply,parseNamedTimplanRenameReply} from '@/lib/named-timplan.ts';
import {parseTimplanJournal,type TimplanJournal} from '@/lib/named-timplan-journal.ts';
import {statusLabel} from '@/lib/protected-timplan.ts';
import MfaStepUpNotice from './mfa-step-up';
export type TimplanAction = {kind:'new';basis:GymTimplanUnderlag;unit:GymTimplanUnit}|{kind:'version';basis:GymTimplanUnderlag;unit:GymTimplanUnit;previous:GymTimplanSummary}|{kind:'rename';plan:GymTimplan};
const label={new:'Skapa ny timplan',version:'Skapa ny version',rename:'Byt namn'};
export default function NamedTimplanActions({scope,action,returnTo,onClose,onSaved,onBlocked,onSecurityFailure}:{scope:string;action:TimplanAction|null;returnTo:string;onClose:()=>void;onSaved:(plan:GymTimplan,notice:string)=>void;onBlocked:(blocked:boolean)=>void;onSecurityFailure:(error:unknown)=>boolean}){
 const key=`sp:named-timplan:${scope}`;
 const [name,setName]=useState(''),[copy,setCopy]=useState(''),[review,setReview]=useState<TimplanJournal|null>(null),[pending,setPending]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[mfa,setMfa]=useState(false),[broken,setBroken]=useState(false),[ready,setReady]=useState(false);
 const restoreKey=useRef('');
 const active=useRef(true),inFlight=useRef(false),latest=useRef({onSaved,onBlocked,onSecurityFailure,onClose});useLayoutEffect(()=>{latest.current={onSaved,onBlocked,onSecurityFailure,onClose};},[onSaved,onBlocked,onSecurityFailure,onClose]);
 useEffect(()=>{active.current=true;queueMicrotask(()=>{if(!active.current)return;try{const raw=sessionStorage.getItem(key);if(raw){setReview(parseTimplanJournal(JSON.parse(raw),scope));setPending(true);}}catch{setBroken(true);}setReady(true);});return()=>{active.current=false;};},[key,scope]);
 useEffect(()=>{queueMicrotask(()=>{if(active.current&&action){restoreKey.current=`${action.kind}:${action.kind==='rename'?action.plan.unitId:action.unit.unitId}`;setName(action.kind==='rename'?action.plan.series?.name??'':'');setCopy('');setReview(null);setError(null);setMfa(false);}});},[action]);
 const blocked=broken||pending||busy||!!action||!!review;
 useUnsavedChanges(`navigation-block:named-timplan:${scope}`,blocked);
 useEffect(()=>{latest.current.onBlocked(blocked);return()=>latest.current.onBlocked(false);},[blocked]);
 function close(){if(pending||busy||broken)return;setReview(null);setError(null);latest.current.onClose();}
 async function prepare(){
  if(!action||inFlight.current||pending)return;inFlight.current=true;setBusy(true);setError(null);
  try{
   const common={version:1 as const,scope,schoolName:action.kind==='rename'?action.plan.schoolName:action.unit.schoolName,unitId:action.kind==='rename'?action.plan.unitId:action.unit.unitId,offeringId:action.kind==='rename'?action.plan.offeringId:action.basis.source.offeringId,sourceVersion:action.kind==='rename'?action.plan.source.version:action.basis.source.version,preserved:0,cleared:0};
   let value:TimplanJournal;
   if(action.kind==='rename'){
    if(!action.plan.series)throw Error('missing_name');
    value={...common,kind:'rename',seriesId:action.plan.series.id,previousName:action.plan.series.name,request:{commandId:crypto.randomUUID(),planId:action.plan.id,seriesId:action.plan.series.id,expectedSeriesRevision:action.plan.series.revision,name:normalizeTimplanName(name)}};
   }else{
    const previous=action.kind==='version'?action.previous:action.unit.plans.find(p=>p.id===copy);
    if(action.kind==='new'&&copy&&!previous)throw Error('wrong_copy');
    if(previous){
     const old=parseGymTimplan(await api.post('/api/timplaner/gym/lasa',{planId:previous.id}),previous.id);
     if(old.revision!==previous.revision||old.unitId!==common.unitId||old.offeringId!==common.offeringId||!old.series||JSON.stringify(old.series)!==JSON.stringify(previous.series))throw Error('changed_copy');
     common.preserved=action.basis.rows.filter(row=>old.rows.some(before=>before.key===row.key&&before.points===row.points&&before.pointTerms.every((p,i)=>p===row.pointTerms[i]))).length;
    }
    common.cleared=action.basis.rows.length-common.preserved;
    const request={commandId:crypto.randomUUID(),sourcePlanId:action.basis.source.planId,expectedSourceRevision:action.basis.source.revision,expectedEducationRevision:action.basis.source.educationRevision,unitId:common.unitId};
    value=action.kind==='new'?{...common,kind:'new',seriesId:null,previousName:previous?`${previous.series?.name} · version ${previous.version}`:'',request:{...request,name:normalizeTimplanName(name),copyFromPlanId:previous?.id??null,expectedCopyFromRevision:previous?.revision??null}}:{...common,kind:'version',seriesId:action.previous.series?.id??null,previousName:`${action.previous.series?.name} · version ${action.previous.version}`,request:{...request,predecessorPlanId:action.previous.id,expectedPredecessorRevision:action.previous.revision}};
   }
   if(active.current)setReview(parseTimplanJournal(value,scope));
  }catch(caught){if(active.current&&!latest.current.onSecurityFailure(caught))setError(caught instanceof ApiError?caught.message:'Kontrollera namnet (1–80 tecken, utan kontrolltecken). Om underlaget har ändrats: stäng och läs om timplanerna.');}
  finally{inFlight.current=false;if(active.current)setBusy(false);}
 }
 function clearJournal(){sessionStorage.removeItem(key);if(sessionStorage.getItem(key)!==null)throw Error('journal_remove_failed');}
 async function send(){
  if(!review||inFlight.current||broken)return;
  const own=review,wasPending=pending;inFlight.current=true;setBusy(true);setError(null);setMfa(false);let accepted=false,started=false;
  try{
   // Persist the exact reviewed command BEFORE any write. No storage means no request.
   const serialized=JSON.stringify(own);sessionStorage.setItem(key,serialized);
   if(sessionStorage.getItem(key)!==serialized)throw Error('journal_write_failed');
   setPending(true);started=true;
   let id:string,seriesId:string|null=own.seriesId,minNameRevision=0;
   if(own.kind==='rename'){
    const reply=parseNamedTimplanRenameReply(await api.post('/api/timplaner/gym/planer/namn',own.request),own.request);id=reply.planId;seriesId=reply.series.id;minNameRevision=reply.series.revision;
   }else if(own.kind==='new'){
    const reply=parseNamedTimplanCreateReply(await api.post('/api/timplaner/gym/planer/skapa',own.request),own.request);id=reply.id;seriesId=reply.series.id;
   }else{id=parseGymTimplanCreateReply(await api.post('/api/timplaner/gym/skapa',own.request),own.request).id;}
   accepted=true;
   const fresh=parseGymTimplan(await api.post('/api/timplaner/gym/lasa',{planId:id}),id);
   if(fresh.offeringId!==own.offeringId||fresh.unitId!==own.unitId||!fresh.series||fresh.series.id!==seriesId||fresh.series.revision<minNameRevision
    ||own.kind==='new'&&(fresh.nameAtCreation!==own.request.name||fresh.version!==1)
    ||own.kind!=='rename'&&(fresh.source.planId!==own.request.sourcePlanId||fresh.source.revision!==own.request.expectedSourceRevision))throw Error('mismatched_fresh_read');
   clearJournal();
   if(!active.current)return;
   const moved=own.kind!=='version'&&fresh.series.name!==own.request.name;
   setPending(false);setReview(null);latest.current.onClose();latest.current.onSaved(fresh,moved?`Åtgärden är bekräftad. Namnet har ändrats igen sedan dess. Nuvarande namn är ${fresh.series.name}.`:`${fresh.series.name} är sparad och återläst. ${own.kind==='rename'?'Timmar och klasskopplingar är oförändrade.':'Klasskopplingar görs separat när versionen är fastställd.'}`);
  }catch(caught){
   if(!active.current)return;
   if(latest.current.onSecurityFailure(caught)){setReview(null);setPending(false);return;}
   const explicit=caught instanceof ApiError&&caught.hasExplicitCode;
   if(!started){setError('Begäran kunde inte sparas i webbläsaren. Ingen ändring skickades. Försök igen.');}
   else if(!wasPending&&!accepted&&explicit&&caught.code!=='mfa_required'){
    try{clearJournal();setPending(false);setReview(null);}catch{setBroken(true);}
    setError(caught.message+' Granska uppgifterna igen innan du sparar.');
   }else{setPending(true);setMfa(explicit&&caught.code==='mfa_required');setError(explicit?caught.message:'Sparandet kunde inte bekräftas. Kontrollera samma begäran innan du fortsätter.');}
  }finally{inFlight.current=false;if(active.current)setBusy(false);}
 }
 if(!ready)return null;
 const kind=review?.kind??action?.kind??'new';
 return <Dialog open={broken||!!review||!!action} onOpenChange={open=>{if(!open)close();}}><DialogContent finalFocus={()=>{requestAnimationFrame(()=>document.querySelector<HTMLElement>(`[data-named-timplan-action="${restoreKey.current}"]`)?.focus());return false;}} className="gt-name-dialog" showCloseButton={!pending&&!busy&&!broken}><DialogTitle>{pending?'Kontrollera sparandet':label[kind]}</DialogTitle><DialogDescription>{review?.schoolName??(action?.kind==='rename'?action.plan.schoolName:action?.unit.schoolName)}. {kind==='new'?'En separat timplan får eget namn, egna timmar och en egen versionshistorik.':kind==='rename'?'Namnet gäller alla versioner av denna timplan. Timmar och klasskopplingar ändras inte.':'En ny version hör till samma timplan. Tidigare versioner och klasskopplingar bevaras.'}</DialogDescription>
 {broken?<p role="alert">Den sparade timplansbegäran kan inte verifieras. Ingen ny ändring skickas. Behåll den här fliken och kontakta administratören.</p>:<>
 {!review&&<>{kind!=='version'&&<label className="gt-name-field">Timplanens namn<input value={name} disabled={busy} onChange={e=>setName(e.target.value)} placeholder={action?.kind==='rename'?action.plan.source.education.name:action?.basis.source.education.name??'Utbildningens namn'} autoComplete="off"/><span>Välj ett namn som skiljer planen från skolans andra timplaner.</span></label>}{action?.kind==='new'&&<label className="gt-name-field">Utgå från<select value={copy} disabled={busy} onChange={e=>setCopy(e.target.value)}><option value="">Börja utan fördelade timmar</option>{action.unit.plans.filter(p=>p.sourcePlanId&&p.series).map(p=><option value={p.id} key={p.id}>{p.series?.name} · version {p.version} · {statusLabel[p.status]}</option>)}</select></label>}</>}
 {review&&<section className="gt-name-review" aria-label="Granska timplanen"><strong>{review.kind==='version'?review.previousName:review.request.name}</strong>{review.kind==='rename'?<p>Tidigare namn: {review.previousName}</p>:<><p>Programplan version {review.sourceVersion}. {review.previousName?`Utgår från ${review.previousName}. Originalet bevaras.`:'Alla timmar börjar ofördelade.'}</p><p>{review.preserved} rader behåller timmar. {review.cleared} rader behöver fördelas.</p><p>Inga klasser kopplas automatiskt.</p></>}</section>}
 {error&&<p role="alert">{error}</p>}{mfa&&<MfaStepUpNotice message="Verifiera för att fortsätta." detail="Den granskade begäran finns kvar i den här fliken. Efter återkomsten kontrollerar du samma begäran." returnTo={returnTo}/>}
 <div className="gt-dialog-actions"><Button variant="outline" disabled={busy||pending} onClick={close}>Avbryt</Button>{review&&!pending&&<Button variant="outline" disabled={busy} onClick={()=>setReview(null)}>Ändra uppgifter</Button>}<Button disabled={busy} onClick={()=>void(review?send():prepare())}>{busy?'Kontrollerar…':pending?'Kontrollera samma begäran':review?'Bekräfta och spara':'Granska'}</Button></div></>}
 </DialogContent></Dialog>;
}
