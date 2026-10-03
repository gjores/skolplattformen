'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CalendarDays, Check, ChevronDown, Pencil, RotateCcw, Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseProgramplan, type Programplan } from '@/lib/programplan-contract.ts';
import type { CatalogProgram } from '@/lib/programplan-catalog.ts';
import { sameProgramplanLevels, sameProgramplanPin } from '@/lib/protected-programplan.ts';
import { programplanTermRows, validateProgramplanTermDistribution } from '@/lib/programplan-terms.ts';
import { parseProgramplanTermReply, type ProgramplanTermDistribution, type ProgramplanTermReply } from '@/lib/programplan-terms-contract.ts';
import MfaStepUpNotice from './mfa-step-up';
import './protected-programplan-terms.css';

type Props = {
  plan: Programplan; program: CatalogProgram; scope: string; disabled: boolean;
  onSecurityFailure: (error: unknown) => boolean;
  onEditing: (active: boolean) => void;
  onRevision: (revision: number) => void;
};
const fmt = (n: number) => n.toLocaleString('sv-SE');
const labels = ['Åk 1 HT', 'Åk 1 VT', 'Åk 2 HT', 'Åk 2 VT', 'Åk 3 HT', 'Åk 3 VT'];
const parts = { foundation: 'Gymnasiegemensamma ämnen', programmeSpecific: 'Programgemensamma ämnen', orientation: 'Inriktning', specialization: 'Programfördjupning', individualChoice: 'Individuellt val', diplomaWork: 'Gymnasiearbete' };
const same = (a: ProgramplanTermDistribution, b: ProgramplanTermDistribution) => JSON.stringify([...a].sort((x,y)=>x.rowKey.localeCompare(y.rowKey))) === JSON.stringify([...b].sort((x,y)=>x.rowKey.localeCompare(y.rowKey)));
const blank = (): [number,number,number,number,number,number] => [0,0,0,0,0,0];

export default function ProgramplanTerms({ plan, program, scope, disabled, onSecurityFailure, onEditing, onRevision }: Props) {
  const rows = useMemo(()=>programplanTermRows(program, plan.basisReference!), [program, plan.basisReference]);
  const [saved,setSaved] = useState<ProgramplanTermReply|null>(null);
  const [values,setValues] = useState<ProgramplanTermDistribution>([]);
  const [editing,setEditing] = useState(false), [expanded,setExpanded] = useState(false), [year,setYear] = useState(0);
  const [busy,setBusy] = useState(false), [error,setError] = useState<string|null>(null), [notice,setNotice] = useState<string|null>(null);
  const [mode,setMode] = useState<'normal'|'compare'|'unknown'|'changed'>('normal'), [mfa,setMfa] = useState(false);
  const controller = useRef<AbortController|null>(null), generation = useRef(0), writing = useRef(false);
  const dirty = editing && (!saved || !same(values,saved.distribution) || mode !== 'normal');
  useUnsavedChanges(`programplan-terms-${scope}`, dirty || busy && editing);
  useEffect(()=>{onEditing(editing || busy && writing.current);return()=>onEditing(false);},[editing,busy,onEditing]);
  const invalidate = useCallback(()=>{generation.current++;controller.current?.abort();},[]);
  const begin = useCallback(()=>{invalidate();const c=new AbortController();controller.current=c;return {signal:c.signal,token:generation.current};},[invalidate]);
  const current = useCallback((token:number)=>token===generation.current,[]);
  const failed = useCallback((e:unknown)=>{
    if(e instanceof DOMException && e.name==='AbortError')return true;
    return onSecurityFailure(e);
  },[onSecurityFailure]);
  const read = useCallback(async(signal:AbortSignal)=>{
    const body=parseProgramplanTermReply(await api.post('/api/programplaner/terminer/lasa',{planId:plan.id},signal));
    if(body.planId!==plan.id)throw Error('Fel plan i svaret.');
    const actual=parseProgramplan(await api.post('/api/programplaner/lasa',{planId:plan.id},signal));
    if(actual.id!==plan.id || actual.revision!==body.revision || actual.status!==body.status)throw Error('Underlaget ändrades under läsningen.');
    const compatible=sameProgramplanPin(actual.basisReference,plan.basisReference)
      &&sameProgramplanLevels(actual.basisReference?.specializationRefs??[],plan.basisReference!.specializationRefs);
    if(compatible)validateProgramplanTermDistribution(rows,body.distribution);
    return {body,compatible};
  },[plan.id,plan.basisReference,rows]);
  const load = useCallback(async()=>{
    const r=begin();setBusy(true);setError(null);
    try{
      const {body,compatible}=await read(r.signal);if(!current(r.token))return;
      if(!compatible || body.revision!==plan.revision){setError('Programplanen har ändrats. Läs om planen för att se rätt fördelning.');return;}
      setSaved(body);setValues(body.distribution);setMode('normal');
    }catch(e){if(current(r.token)&&!failed(e))setError('Terminsfördelningen kunde inte hämtas. Försök igen.');}
    finally{if(current(r.token))setBusy(false);}
  },[begin,read,plan.revision,failed,current]);
  useEffect(()=>{let disposed=false;void Promise.resolve().then(()=>{if(!disposed)void load();});return()=>{disposed=true;invalidate();};},[load,invalidate]);
  const shown=editing?values:saved?.distribution??[];
  const cells=new Map(shown.map(row=>[row.rowKey,row.points]));
  const totals=labels.map((_,i)=>shown.reduce((s,r)=>s+(Number.isFinite(r.points[i])?r.points[i]:0),0));
  const total=rows.reduce((s,r)=>s+r.points,0), assigned=totals.reduce((s,n)=>s+n,0);
  const valid=(()=>{try{validateProgramplanTermDistribution(rows,values);return true;}catch{return false;}})();
  const unresolved=[...program.foundation,...program.programmeSpecific,...(program.orientations.find(o=>o.code===plan.basisReference!.orientationCode)?.subjects??[])].some(s=>s.optional||!s.levels.length);
  function change(key:string,column:number,value:string){
    const points=[...(cells.get(key)??blank())] as ReturnType<typeof blank>;points[column]=value===''?0:Number(value);
    setValues(rows.flatMap(row=>{const p=row.key===key?points:cells.get(row.key);return p&&p.some(n=>n!==0)?[{rowKey:row.key,points:p}]:[];}));
    setError(null);setNotice(null);setMfa(false);
  }
  function cancel(){if(busy||dirty&&!confirmDiscard())return;setEditing(false);setMode('normal');setValues(saved?.distribution??[]);setError(null);setMfa(false);}
  async function recover(own:ProgramplanTermDistribution,uncertain:boolean,r:{token:number;signal:AbortSignal}){
    try{
      const {body,compatible}=await read(r.signal);if(!current(r.token))return;
      if(!compatible||body.status!=='utkast'){setMode('changed');setError('Programplanens innehåll eller status har ändrats. Dina värden finns kvar. Avbryt och läs om planen innan du fortsätter.');return;}
      setSaved(body);
      if(uncertain&&same(body.distribution,own)){setValues(body.distribution);setEditing(false);setMode('normal');setNotice('Fördelningen är sparad. Inget nytt sparande behövs.');onRevision(body.revision);}
      else{setMode('compare');setError(uncertain?'Sparandet kunde inte bekräftas. Jämför med den aktuella fördelningen innan du försöker igen.':'Någon har ändrat planen. Dina värden finns kvar. Jämför innan du sparar din fördelning.');}
    }catch(e){if(current(r.token)&&!failed(e)){setMode('unknown');setError('Sparstatus kunde inte läsas. Dina värden finns kvar. Läs sparstatus innan du försöker spara igen.');}}
  }
  async function save(){
    if(!saved||busy||writing.current||!valid||!['normal','compare'].includes(mode))return;
    const own=values.map(row=>({rowKey:row.rowKey,points:[...row.points] as ReturnType<typeof blank>}));
    const expected=saved.revision,r=begin();writing.current=true;setBusy(true);setError(null);setNotice(null);setMfa(false);
    try{
      const body=parseProgramplanTermReply(await api.post('/api/programplaner/terminer',{planId:plan.id,expectedRevision:expected,distribution:own},r.signal));
      if(body.planId!==plan.id||body.revision!==expected+1||body.status!=='utkast'||!same(body.distribution,own))throw Error('Sparandet kunde inte bekräftas.');
      validateProgramplanTermDistribution(rows,body.distribution);if(!current(r.token))return;
      setSaved(body);setValues(body.distribution);setEditing(false);setMode('normal');setNotice('Terminsfördelningen sparades.');onRevision(body.revision);
    }catch(e){
      if(!current(r.token)||failed(e))return;
      if(e instanceof ApiError&&e.hasExplicitCode&&(e.status===400||e.code==='mfa_required'||e.code==='audit_unavailable')){
        setError(e.code==='mfa_required'?'Verifiera med engångskod innan du sparar.':`Kunde inte spara. ${e.message}`);setMfa(e.code==='mfa_required');
      }else await recover(own,!(e instanceof ApiError&&e.status===409&&e.code==='conflict'),r);
    }finally{writing.current=false;if(current(r.token))setBusy(false);}
  }
  async function readStatus(){if(busy)return;const r=begin();setBusy(true);try{await recover(values,true,r);}finally{if(current(r.token))setBusy(false);}}
  const locked=disabled||busy||!editing||!['normal','compare'].includes(mode);
  return <section className="ppt-card" aria-label="Årskurser och terminer" aria-busy={busy}>
    <div className="ppt-heading"><div className="ppt-heading-main"><span className="ppt-icon"><CalendarDays size={20} aria-hidden="true"/></span><div><span className="ppt-eyebrow">UTBILDNINGENS STUDIEGÅNG</span><h2>Årskurser och terminer</h2></div></div>
      {saved&&plan.status==='utkast'&&!editing?<Button variant="outline" disabled={disabled||busy} onClick={()=>{setValues(saved.distribution);setEditing(true);setExpanded(true);setNotice(null);}}><Pencil size={15} aria-hidden="true"/>Fördela poäng</Button>:plan.status!=='utkast'?<span className="ppt-version">Version {plan.version} · låst</span>:null}</div>
    <p className="ppt-intro">Planera när ämnen och nivåer ska läsas. Fördela gymnasiepoängen mellan höst och vår.</p>
    {notice&&<output className="ppt-success"><Check size={16} aria-hidden="true"/>{notice}</output>}
    {error&&!mfa&&<div className="ppt-error" role="alert"><p>{error}</p>{!saved&&!editing&&<Button variant="outline" disabled={busy} onClick={()=>void load()}>Hämta fördelningen igen</Button>}</div>}
    {mfa&&<MfaStepUpNotice message={error??'Verifiering krävs.'} detail="Dina värden finns kvar. Osparade uppgifter följer inte med om du lämnar sidan för verifiering."/>}
    {!saved&&!error&&<output className="ppt-loading">Hämtar terminsfördelningen…</output>}
    {saved&&<>
      <div className="ppt-years">{[0,1,2].map(y=><div className="ppt-year" key={y}><span className="ppt-year-label">ÅRSKURS {y+1}</span><strong>{fmt(totals[y*2]+totals[y*2+1])}<small>poäng</small></strong><div className="ppt-year-terms"><span>Höst <b>{fmt(totals[y*2])}</b></span><span>Vår <b>{fmt(totals[y*2+1])}</b></span></div><div className="ppt-year-bar" aria-hidden="true"><span style={{width:`${total?Math.min(100,(totals[y*2]+totals[y*2+1])/total*100):0}%`}}/></div></div>)}</div>
      <div className="ppt-progress"><span><b>{fmt(assigned)}</b> av {fmt(total)} planeringsbara poäng fördelade</span><span className={assigned>total?'ppt-over':''}>{fmt(Math.max(0,total-assigned))} kvar att fördela</span></div>
      {unresolved&&<p className="ppt-source-note">Alternativa ämnen och ämnen utan preciserade nivåer behöver eget underlag och ingår inte i fördelningen ovan. Inget ämnesval görs automatiskt.</p>}
      {expanded&&<>
        <fieldset className="ppt-mobile-years" aria-label="Visa årskurs">{[0,1,2].map(y=><button key={y} type="button" aria-pressed={year===y} onClick={()=>setYear(y)}>Årskurs {y+1}</button>)}</fieldset>
        <section className="ppt-matrix" data-year={year} aria-label="Poäng per årskurs och termin">
          <table><thead><tr><th rowSpan={2} scope="col">Ämne / nivå</th>{[0,1,2].map(y=><th className={`ppt-col-year-${y}`} key={y} colSpan={2} scope="colgroup">Årskurs {y+1}</th>)}<th rowSpan={2} scope="col" className="ppt-row-total">Fördelat</th></tr><tr>{labels.map((label,i)=><th scope="col" className={`ppt-col-year-${Math.floor(i/2)}`} key={label}>{i%2?'Vår':'Höst'}</th>)}</tr></thead>
          <tbody>{rows.map((row,index)=>{
            const points=cells.get(row.key)??blank(),sum=points.reduce((s,n)=>s+n,0),invalid=points.some(n=>!Number.isSafeInteger(n)||n<0)||sum>row.points;
            const header=index===0||rows[index-1].part!==row.part;
            return <FragmentRows key={row.key} header={header?parts[row.part]:null} row={row} points={points} sum={sum} invalid={invalid} editing={editing} locked={locked} change={change}/>;
          })}</tbody>
          <tfoot><tr><th scope="row">Summa per termin</th>{totals.map((n,i)=><td className={`ppt-col-year-${Math.floor(i/2)}`} key={i}>{fmt(n)}</td>)}<td className="ppt-row-total">{fmt(assigned)}</td></tr></tfoot></table>
        </section>
        <p className="ppt-hint">{editing?'Skriv poäng i en eller flera terminer. Tomma fält räknas som 0. Du kan spara en delvis fördelad plan.':'Poäng beskriver omfattningen. Undervisningstimmar planeras separat i timplanen.'}</p>
      </>}
      {editing&&mode==='compare'&&saved&&<details className="ppt-comparison"><summary>Jämför med den aktuellt sparade fördelningen</summary><ul>{rows.map(row=>{const actual=saved.distribution.find(r=>r.rowKey===row.key)?.points??blank(),own=cells.get(row.key)??blank();return same([{rowKey:row.key,points:actual}],[{rowKey:row.key,points:own}])?null:<li key={row.key}><strong>{row.name} {row.levelName}</strong><span>Aktuellt: {actual.map((n,i)=>`${labels[i]}: ${n}`).join(' · ')}</span><span>Ditt förslag: {own.map((n,i)=>`${labels[i]}: ${n}`).join(' · ')}</span></li>;})}</ul></details>}
      {editing?<div className="ppt-footer"><div><strong>{valid?'Redo att spara som utkast':'Kontrollera de markerade raderna'}</strong><p>{valid?'Poängens placering sparas i den här planversionen.':'Ange hela positiva poäng eller 0. Summan får inte överstiga radens poäng.'}</p></div><div className="ppt-footer-actions"><Button variant="outline" disabled={busy} onClick={cancel}>Avbryt</Button>{mode==='unknown'?<Button disabled={busy} onClick={()=>void readStatus()}><RotateCcw size={15} aria-hidden="true"/>Läs sparstatus</Button>:<Button disabled={busy||!valid||mode==='changed'||!dirty} onClick={()=>void save()}><Save size={15} aria-hidden="true"/>{busy?'Sparar…':mode==='compare'?'Spara min fördelning':'Spara fördelning'}</Button>}</div></div>
        :<button className="ppt-expand" type="button" aria-expanded={expanded} onClick={()=>setExpanded(!expanded)}><span>{expanded?'Dölj ämnen och terminer':'Visa ämnen och terminer'}</span><ChevronDown size={16} aria-hidden="true" data-open={expanded}/></button>}
    </>}
  </section>;
}

function FragmentRows({header,row,points,sum,invalid,editing,locked,change}:{header:string|null;row:ReturnType<typeof programplanTermRows>[number];points:ReturnType<typeof blank>;sum:number;invalid:boolean;editing:boolean;locked:boolean;change:(key:string,column:number,value:string)=>void}){
  return <>{header&&<tr className="ppt-group"><th colSpan={8} scope="rowgroup">{header}</th></tr>}<tr className={invalid?'ppt-invalid':''}>
    <th scope="row"><span className="ppt-subject">{row.name}</span><span className="ppt-level">{row.levelName??'Programdel'} <b>{row.points} p</b></span></th>
    {points.map((n,i)=><td className={`ppt-col-year-${Math.floor(i/2)}`} key={i}>{editing?<input type="number" inputMode="numeric" min={0} max={row.points} step={1} value={n===0?'':Number.isFinite(n)?n:''} disabled={locked} aria-label={`${row.name}${row.levelName?` · ${row.levelName}`:''}, ${labels[i]}`} aria-invalid={invalid} placeholder="—" onChange={e=>change(row.key,i,e.target.value)}/>:<span className={n?'ppt-cell-filled':'ppt-cell-empty'}>{n?fmt(n):'—'}</span>}</td>)}
    <td className="ppt-row-total"><span className={invalid?'ppt-row-badge ppt-over':sum===row.points?'ppt-row-badge ppt-complete':'ppt-row-badge'}>{fmt(sum)} / {row.points}</span>{sum<row.points&&<small>{fmt(row.points-sum)} kvar</small>}{invalid&&<small>Kontrollera summan</small>}</td>
  </tr></>;
}
