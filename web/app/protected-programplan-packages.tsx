'use client';

import {useEffect,useRef,useState} from 'react';
import {api,ApiError} from '@/lib/server-client.ts';
import {useUnsavedChanges,confirmDiscard} from '@/lib/unsaved-changes.tsx';
import {type ProgramplanChoiceBlock} from '@/lib/programplan-choice-blocks.ts';
import {type ProgramplanTermPoints,PROGRAMPLAN_TERMS} from '@/lib/programplan-terms.ts';
import {PROGRAMPLAN_LANGUAGES,PROGRAMPLAN_LANGUAGE_LADDERS,programplanLanguageName} from '@/lib/programplan-languages.ts';
import {createLanguagePackage,languagePackageStartOptions,parseProgramplanUnitPackages,proposeLanguagePackages,programplanPackageKey,programplanPackageLevelKey,programplanPackageLevelName,suggestPackageDistribution,
  type ProgramplanPackageEntry,type ProgramplanUnitPackages} from '@/lib/programplan-packages.ts';
import type {PlanIssue} from '@/lib/programplan-analysis.ts';
import type {ProgramplanOption} from '@/lib/protected-programplan.ts';
import MfaStepUpNotice from './mfa-step-up';

export type SchoolPackagesProps={planId:string;scope:string;units:{id:string;name:string;inMandate:boolean}[];packages:ProgramplanUnitPackages|null;
  packageError:string|null;archived:boolean;disabled:boolean;onPackages:(value:ProgramplanUnitPackages)=>void;onSecurityFailure:(error:unknown)=>boolean;onReadPackages:()=>Promise<void>};
const EMPTY:ProgramplanPackageEntry[]=[];
const zero=():ProgramplanTermPoints=>[0,0,0,0,0,0];
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
export default function ProgramplanPackageBlock({block,frame,focusIssue,selectedYear,options,fixedLevelKeys=[],...props}:SchoolPackagesProps&{block:ProgramplanChoiceBlock;frame:ProgramplanTermPoints;selectedYear:number;options:ProgramplanOption[];fixedLevelKeys?:string[];focusIssue?:PlanIssue|null}){
  const handledFocus=useRef<PlanIssue|null>(null);
  const initialUnit=props.units.find(u=>u.inMandate)?.id??props.units[0]?.id??'';
  const initialEntries=props.packages?.units.find(u=>u.unitId===initialUnit)?.selections.find(s=>s.blockId===block.id)?.entries??EMPTY;
  const [unitId,setUnitId]=useState(initialUnit),[entries,setEntries]=useState<ProgramplanPackageEntry[]>(initialEntries),[proposal,setProposal]=useState(false);
  const [message,setMessage]=useState<string|null>(null),[state,setState]=useState<'idle'|'saving'|'conflict'|'unknown'|'error'|'mfa'>('idle');
  const [language,setLanguage]=useState('fr'),[start,setStart]=useState('modern:2');
  const starts=languagePackageStartOptions(block).filter(s=>s.levels.every(l=>!fixedLevelKeys.includes(programplanPackageLevelKey(l))&&(block.kind!=='specialization'||options.some(o=>o.subjectCode===l.subjectCode&&o.subjectVersion===l.subjectVersion&&o.itemCode===l.itemCode&&o.points===l.points)))), selectedStart=starts.find(s=>`${s.ladderId}:${s.startIndex}`===start)??starts[0];
  const unit=props.units.find(u=>u.id===unitId), saved=props.packages?.units.find(u=>u.unitId===unitId);
  const savedEntries=saved?.selections.find(s=>s.blockId===block.id)?.entries??EMPTY;
  const valuesRef=useRef(entries),baseRef=useRef(savedEntries),propsRef=useRef(props),busy=useRef(false),queued=useRef(false),mounted=useRef(true),stateRef=useRef(state);
  useEffect(()=>{propsRef.current=props;},[props]);
  function transition(next:typeof state){stateRef.current=next;setState(next);}
  const dirty=!proposal&&!equal(entries,savedEntries);
  const writable=!!unit?.inMandate&&!props.archived&&!props.disabled;
  const locked=!writable||['conflict','unknown','mfa'].includes(state)||!saved;
  useUnsavedChanges(`packages-${props.scope}-${props.planId}-${unitId}-${block.id}`,dirty||state==='saving');
  useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  useEffect(()=>{
    if(busy.current||!equal(valuesRef.current,baseRef.current))return;
    baseRef.current=savedEntries;valuesRef.current=savedEntries;setEntries(savedEntries);setProposal(false);
  },[savedEntries]);
  function update(next:ProgramplanPackageEntry[],commit=false){valuesRef.current=next;setEntries(next);setProposal(false);setMessage(null);if(commit)void save(next);}
  async function read(){const p=propsRef.current;const reply=parseProgramplanUnitPackages(await api.post('/api/programplaner/paketval/lasa',{planId:p.planId}));
    if(reply.planId!==p.planId||reply.units.length!==p.units.length||reply.units.some(u=>!p.units.some(x=>x.id===u.unitId)))throw Error('Fel plan eller skola i svaret.');return reply;}
  function accepts(reply:ProgramplanUnitPackages,revision:number,submitted:ProgramplanPackageEntry[]){const u=reply.units.find(u=>u.unitId===unitId);return reply.planId===props.planId&&reply.units.length===props.units.length&&reply.units.every(u=>props.units.some(x=>x.id===u.unitId))&&u?.revision===revision+1&&equal(u.selections.find(s=>s.blockId===block.id)?.entries??[],submitted);}
  async function save(submitted=valuesRef.current){
    if(busy.current){queued.current=true;return;}if(!writable||!saved||['conflict','unknown','mfa'].includes(stateRef.current)||equal(submitted,baseRef.current))return;
    if(submitted.some(e=>e.distribution.some(d=>d.points.some(p=>!Number.isSafeInteger(p)||p<0)||d.points.reduce((n,p)=>n+p,0)>(e.ref.levels.find(l=>programplanPackageLevelKey(l)===d.levelKey)?.points??0)))){transition('error');setMessage('En nivå har för många eller ogiltiga poäng. Rätta raden först.');return;}
    const revision=propsRef.current.packages?.units.find(u=>u.unitId===unitId)?.revision;if(revision===undefined)return;
    busy.current=true;queued.current=false;transition('saving');setMessage(null);
    const accepted=(reply:ProgramplanUnitPackages)=>{if(!mounted.current)return;propsRef.current={...propsRef.current,packages:reply};propsRef.current.onPackages(reply);baseRef.current=submitted;transition('idle');setMessage('Sparat');};
    try{const reply=parseProgramplanUnitPackages(await api.post('/api/programplaner/paketval',{planId:props.planId,unitId,expectedRevision:revision,blockId:block.id,entries:submitted}));if(!accepts(reply,revision,submitted))throw Error('Obekräftat svar.');accepted(reply);}
    catch(e){if(!mounted.current)return;if(propsRef.current.onSecurityFailure(e)){queued.current=false;transition('error');return;}
      if(e instanceof ApiError&&e.hasExplicitCode){transition(e.code==='mfa_required'?'mfa':e.status===409?'conflict':'error');setMessage(e.status===409?'Skolans paket har ändrats. Dina värden finns kvar. Läs om innan du sparar igen.':e.message);queued.current=false;}
      else{try{const back=await read();if(accepts(back,revision,submitted))accepted(back);else{transition('unknown');setMessage('Sparandet kunde inte bekräftas. Dina värden finns kvar. Läs om skolans paket.');queued.current=false;}}catch(inner){if(propsRef.current.onSecurityFailure(inner)){queued.current=false;transition('error');}else{transition('unknown');setMessage('Sparstatus kunde inte läsas. Läs om skolans paket innan du försöker igen.');queued.current=false;}}}
    }finally{busy.current=false;if(queued.current&&mounted.current){queued.current=false;void save(valuesRef.current);}}
  }
  async function reload(){if(dirty&&!confirmDiscard())return;try{const back=await read();props.onPackages(back);const values=back.units.find(u=>u.unitId===unitId)?.selections.find(s=>s.blockId===block.id)?.entries??EMPTY;baseRef.current=values;valuesRef.current=values;setEntries(values);setProposal(false);transition('idle');setMessage(null);}catch(e){if(!props.onSecurityFailure(e))setMessage('Paketen kunde inte läsas. Försök igen.');}}
  useEffect(()=>{const t=focusIssue?.target;if(handledFocus.current===focusIssue||t?.kind!=='package'||t.blockId!==block.id||!props.units.some(u=>u.id===t.unitId))return;
    if(unitId!==t.unitId){if(dirty||busy.current)return;setUnitId(t.unitId);const es=props.packages?.units.find(u=>u.unitId===t.unitId)?.selections.find(s=>s.blockId===block.id)?.entries??EMPTY;baseRef.current=es;valuesRef.current=es;setEntries(es);setProposal(false);}
    const handle=requestAnimationFrame(()=>{const section=document.getElementById(`packages-${block.id}`);const entry=t.entryKey?section?.querySelector<HTMLElement>(`[data-package-entry="${CSS.escape(t.entryKey)}"]`):section;const row=t.levelKey?entry?.querySelector<HTMLElement>(`[data-package-level="${CSS.escape(t.levelKey)}"]`):null;const focusedEntry=props.packages?.units.find(u=>u.unitId===t.unitId)?.selections.find(s=>s.blockId===block.id)?.entries.find(e=>!t.entryKey||programplanPackageKey(e.ref)===t.entryKey);const term=focusedEntry?.distribution.find(d=>!t.levelKey||d.levelKey===t.levelKey)?.points.findIndex(p=>p>0)??-1;const control=row?.querySelector<HTMLInputElement>(`input[data-package-term="${term<0?0:term}"]`)??section?.querySelector<HTMLElement>('select');if(control?.getBoundingClientRect().width){(row??section)?.scrollIntoView({block:'center'});control.focus({preventScroll:true});if(document.activeElement===control)handledFocus.current=focusIssue??null;}});return()=>cancelAnimationFrame(handle);
  },[focusIssue,selectedYear,block.id,unitId,dirty,props.packages,props.units]);
  const display=proposal?proposeLanguagePackages(block):entries;
  function propose(){if(dirty&&!confirmDiscard())return;setProposal(true);setMessage('Förslaget är inte sparat. Välj Använd förslaget eller ändra paketen.');}
  function materialized(){return display.map(e=>({...e,distribution:e.distribution.length?e.distribution:suggestPackageDistribution(frame,e.ref.levels)}));}
  function add(){if(!selectedStart)return;try{const ladder=PROGRAMPLAN_LANGUAGE_LADDERS.find(l=>l.id===selectedStart.ladderId)!;const ref=createLanguagePackage(ladder.languageRequired?(ladder.languageCode??language):null,ladder.id,selectedStart.startIndex,block.points);const next=proposal?materialized():entries;if(next.some(e=>programplanPackageKey(e.ref)===programplanPackageKey(ref))){setMessage('Paketet finns redan.');return;}update([...next,{ref,distribution:suggestPackageDistribution(frame,ref.levels)}],true);}catch{setMessage('Det valet kan inte användas i blocket.');}}
  return <section id={`packages-${block.id}`} className="ppk" aria-label={`Paket i ${block.name}`}>
    <div className="ppk-toolbar"><label>Skola <select aria-label={`Skola för ${block.name}`} value={unitId} disabled={state==='saving'} onChange={e=>{if(dirty&&!confirmDiscard())return;setUnitId(e.target.value);const es=props.packages?.units.find(u=>u.unitId===e.target.value)?.selections.find(s=>s.blockId===block.id)?.entries??EMPTY;baseRef.current=es;valuesRef.current=es;setEntries(es);setProposal(false);transition('idle');setMessage(null);}}>{props.units.map(u=><option key={u.id} value={u.id}>{u.name}{u.inMandate?'':' · läsbehörighet'}</option>)}</select></label>
      <span>{display.length} paket · {block.points} poäng per paket</span>{!writable&&<span>{props.archived?'Arkiverad utbildning':!unit?.inMandate?'Skolan ingår inte i ditt mandat':'Ändring pågår'}</span>}
      {writable&&block.kind==='modernLanguage'&&<button type="button" disabled={locked||state==='saving'} onClick={propose}>Föreslå språkpaket</button>}
      {proposal&&writable&&<button type="button" disabled={locked} onClick={()=>update(materialized(),true)}>Använd förslaget</button>}
    </div>
    {props.packageError?<p role="alert">{props.packageError} <button type="button" onClick={()=>void props.onReadPackages()}>Läs om paket</button></p>:!props.packages?<output>Hämtar skolornas paket…</output>:<>
      {display.map((entry,index)=>{const key=programplanPackageKey(entry.ref),totals=zero();entry.distribution.forEach(d=>d.points.forEach((n,i)=>totals[i]+=n));const mismatch=totals.map((n,i)=>n!==frame[i]);return <section className="ppk-entry" data-package-entry={key} key={key} aria-label={`Språkpaket ${programplanLanguageName(entry.ref.languageCode)} ${entry.ref.levels[0].itemCode}`}><div className="ppk-toolbar"><strong>{programplanLanguageName(entry.ref.languageCode)}</strong><span>{entry.ref.levels.map(l=>programplanPackageLevelName(l)).join(' → ')}</span>{writable&&<><button type="button" disabled={locked} onClick={()=>{const next=proposal?materialized():entries;update(next.map((e,i)=>i===index?{...e,distribution:suggestPackageDistribution(frame,e.ref.levels)}:e),true);}}>Föreslå fördelning</button><button type="button" disabled={locked} aria-label={`Ta bort paket ${programplanLanguageName(entry.ref.languageCode)} ${entry.ref.levels[0].itemCode}`} onClick={()=>update((proposal?materialized():entries).filter((_,i)=>i!==index),true)}>Ta bort</button></>}</div>
        {mismatch.some(Boolean)&&<p className="ppk-hint">Avviker från blockets ram</p>}<table className="ppk-table"><caption className="pp-sr">Paketets nivåer och terminer</caption><thead><tr><th>Nivå</th><th>Poäng</th>{PROGRAMPLAN_TERMS.map((t,i)=><th key={t} className={`ppb-y${Math.floor(i/2)}`}>{t}</th>)}</tr></thead><tbody>{entry.ref.levels.map(level=>{const lk=programplanPackageLevelKey(level),points=entry.distribution.find(d=>d.levelKey===lk)?.points??zero(),over=points.reduce((n,p)=>n+p,0)>level.points;return <tr key={lk} data-package-level={lk} onBlur={e=>{if(!e.currentTarget.contains(e.relatedTarget as Node|null)&&!proposal)void save();}}><th scope="row">{programplanPackageLevelName(level)}<small>{level.itemCode}</small></th><td>{level.points}</td>{points.map((n,i)=><td key={i} className={`ppb-y${Math.floor(i/2)}${mismatch[i]||over?' ppk-mismatch':''}`}>{writable?<input data-package-term={i} aria-invalid={mismatch[i]||over} aria-label={`${programplanLanguageName(entry.ref.languageCode)} ${level.itemCode}, ${PROGRAMPLAN_TERMS[i]}`} inputMode="numeric" value={n||''} placeholder="·" disabled={locked} onChange={e=>{const next=proposal?materialized():entries;update(next.map((en,ix)=>{if(ix!==index)return en;const p=[...(en.distribution.find(d=>d.levelKey===lk)?.points??zero())] as ProgramplanTermPoints;p[i]=Number(e.target.value.replace(/[^0-9]/gu,''));return{...en,distribution:[...en.distribution.filter(d=>d.levelKey!==lk),{levelKey:lk,points:p}]};}));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/>:n||'·'}</td>)}</tr>;})}</tbody></table></section>;})}
      {!display.length&&<p>Inga paket valda för skolan.</p>}
      {writable&&starts.length>0&&<fieldset className="ppk-add"><legend>Lägg till språkpaket</legend>{selectedStart?.ladderId!=='sign'&&<label>Språk<select aria-label="Språk" value={PROGRAMPLAN_LANGUAGE_LADDERS.find(l=>l.id===selectedStart?.ladderId)?.languageCode??language} disabled={locked||!!PROGRAMPLAN_LANGUAGE_LADDERS.find(l=>l.id===selectedStart?.ladderId)?.languageCode||selectedStart?.ladderId==='sign'} onChange={e=>setLanguage(e.target.value)}>{PROGRAMPLAN_LANGUAGES.map(l=><option key={l.code} value={l.code}>{l.name}</option>)}</select></label>}<label>Första nivå<select aria-label="Paketets första nivå" value={selectedStart?`${selectedStart.ladderId}:${selectedStart.startIndex}`:''} disabled={locked} onChange={e=>setStart(e.target.value)}>{starts.map(s=><option key={`${s.ladderId}:${s.startIndex}`} value={`${s.ladderId}:${s.startIndex}`}>{s.name}</option>)}</select></label><button type="button" disabled={locked} onClick={add}>Lägg till paket</button></fieldset>}
    </>}
    {state==='mfa'?<MfaStepUpNotice message={message??'Verifiering med engångskod krävs.'}/>:<output role={state==='idle'?'status':'alert'}>{state==='saving'?'Sparar…':message??(dirty?'Osparade paketändringar':'')}{['conflict','unknown','error'].includes(state)&&<button type="button" onClick={()=>void reload()}>Läs om skolans paket</button>}</output>}
  </section>;
}
