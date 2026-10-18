'use client';

import { useEffect, useRef, useState } from 'react';
import { ApiError } from '@/lib/server-client.ts';
import MfaStepUpNotice from './mfa-step-up';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { parseProgramplanExamination, examinationLabel, type ProgramplanExamination } from '@/lib/programplan-examination.ts';
import { stockholmToday } from '@/lib/programplan-lifecycle.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';

export function ExaminationEvidence({ examination, compact=false }: { examination: ProgramplanExamination; compact?: boolean }) {
  return <div className="pp-examination-evidence">
    <p><strong>{examinationLabel(examination)}</strong> · kontrollerat {examination.checkedOn}</p>
    <details open={!compact}><summary>Visa källa och kontroll</summary><p>Gäller utbildningsstart {examination.appliesToStart}.</p>
    <p><a href={examination.referenceUrl} target="_blank" rel="noreferrer">Öppna den kontrollerade källan hos Skolverket</a></p>
    <p className="pp-examination-reference">{examination.referenceText}</p>
    <p className="pp-examination-help">Detta är skolans dokumenterade kontroll. Appen har inte verifierat att ett tillämpligt yrkesprov är publicerat.</p></details>
  </div>;
}

type Props = { planId: string; startedOn: string; examination?: ProgramplanExamination; canEdit: boolean; disabled: boolean;
  onSave: (value: ProgramplanExamination) => Promise<void>; onRead: () => Promise<void>; onSecurityFailure: (error: unknown) => boolean };

export default function ProtectedProgramplanExamination({planId,startedOn,examination,canEdit,disabled,onSave,onRead,onSecurityFailure}: Props) {
  const [editing,setEditing]=useState(false),[model,setModel]=useState<ProgramplanExamination['model']|''>('');
  const [checkedOn,setCheckedOn]=useState(''),[referenceUrl,setReferenceUrl]=useState(''),[referenceText,setReferenceText]=useState(''),[confirmed,setConfirmed]=useState(false);
  const [saving,setSaving]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState<string|null>(null),[notice,setNotice]=useState<string|null>(null),[mfa,setMfa]=useState(false);
  const alive=useRef(true),inFlight=useRef(false),form=useRef<HTMLDivElement>(null);
  useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
  useEffect(()=>{if(editing)form.current?.focus();},[editing]);
  useUnsavedChanges(`navigation-block:programplan-examination:${planId}`,editing||saving||uncertain);
  function open(){setModel(examination?.model??'');setCheckedOn('');setReferenceUrl(examination?.referenceUrl??'');setReferenceText(examination?.referenceText??'');setConfirmed(false);setError(null);setNotice(null);setMfa(false);setEditing(true);}
  function proposed(){try{if(checkedOn>stockholmToday())return null;return parseProgramplanExamination({model,appliesToStart:startedOn,checkedOn,referenceUrl:referenceUrl.trim(),referenceText:referenceText.trim()});}catch{return null;}}
  const value=proposed(),locked=disabled||saving||uncertain||!canEdit;
  async function save(){
    if(locked||!value||!confirmed||inFlight.current)return;
    inFlight.current=true;setSaving(true);setError(null);
    try{await onSave(value);if(alive.current){setEditing(false);setConfirmed(false);setNotice('Examensformen är sparad för denna version.');}}
    catch(caught){if(!alive.current||onSecurityFailure(caught))return;setConfirmed(false);
      if(caught instanceof ApiError&&caught.hasExplicitCode&&[400,403,409].includes(caught.status)){
        setMfa(caught.code==='mfa_required');setUncertain(caught.status===409);
        setError(caught.status===409?'Planen har ändrats eller låsts. Läs aktuell sparstatus och granska på nytt.':caught.code==='mfa_required'?'Verifiera dig med engångskod innan du sparar kontrollen.':'Kontrollen kunde inte sparas. Kontrollera uppgifterna och bekräfta igen.');
      }else{setUncertain(true);setError('Sparandet kunde inte bekräftas. Läs aktuell sparstatus innan du fortsätter. Dina uppgifter finns kvar.');}}
    finally{inFlight.current=false;if(alive.current)setSaving(false);}
  }
  async function read(){if(inFlight.current)return;inFlight.current=true;setSaving(true);try{await onRead();if(alive.current){setUncertain(false);setEditing(false);setError(null);setNotice('Aktuell examensform har lästs. Granska den innan du ändrar igen.');}}catch(caught){if(alive.current&&!onSecurityFailure(caught))setError('Aktuell sparstatus kunde inte läsas. Försök igen.');}finally{inFlight.current=false;if(alive.current)setSaving(false);}}
  return <section className="pps-card pp-examination" aria-label="Examensform för elevkullen" aria-busy={saving}>
    <h2>Examensform för elevkullen</h2>
    {!editing&&<>{examination?<ExaminationEvidence examination={examination} compact/>:<p>Kontrollera om ett tillämpligt yrkesprov finns för denna utbildning. Dokumentera valet innan programplanen skickas till huvudmannen.</p>}
      {canEdit?<Button variant={examination?'outline':'default'} disabled={disabled} onClick={open}>{examination?'Ändra kontrollen':'Granska examensform'}</Button>:<p>Rektor dokumenterar kontrollen i ett redigerbart utkast. Fastställda versioner ändras inte.</p>}</>}
    {editing&&<div ref={form} tabIndex={-1} className="pp-examination-form">
      <p>Gäller denna programversion och utbildningsstart {startedOn}. Välj först efter att du har kontrollerat Skolverkets aktuella underlag.</p>
      <fieldset disabled={locked}><legend>Vad gäller för utbildningen?</legend>
        <label className="pp-check"><input type="radio" name={`examination-${planId}`} checked={model==='vocational_exam'} onChange={()=>{setModel('vocational_exam');setConfirmed(false);}}/><span>Yrkesprov – ett tillämpligt prov finns</span></label>
        <label className="pp-check"><input type="radio" name={`examination-${planId}`} checked={model==='diploma_work'} onChange={()=>{setModel('diploma_work');setConfirmed(false);}}/><span>Gymnasiearbete – tillämpligt yrkesprov saknas</span></label>
      </fieldset>
      <label className="pp-field">Källa hos Skolverket<input type="url" value={referenceUrl} disabled={locked} placeholder="https://www.skolverket.se/…" onChange={event=>{setReferenceUrl(event.target.value);setConfirmed(false);}}/></label>
      <label className="pp-field">Vad har du kontrollerat?<textarea value={referenceText} maxLength={2000} rows={4} disabled={locked} onChange={event=>{setReferenceText(event.target.value);setConfirmed(false);}}/></label>
      <p className="pp-examination-help">{model==='vocational_exam'?'Ange provets namn eller kod, relevant beslut och varför det gäller för utbildningen.':'Beskriv vilket underlag du kontrollerat och varför ett tillämpligt yrkesprov saknas. Ingen kontroll är förvald.'}</p>
      <div className="pp-field"><label htmlFor={`examination-date-${planId}`}>Kontrollerat den</label><DatePicker id={`examination-date-${planId}`} value={checkedOn} max={stockholmToday()} disabled={locked} onValueChange={date=>{setCheckedOn(date);setConfirmed(false);}}/></div>
      <label className="pp-check"><input type="checkbox" checked={confirmed} disabled={locked||!value} onChange={event=>setConfirmed(event.target.checked)}/><span>{model==='diploma_work'?'Jag har kontrollerat att ett tillämpligt yrkesprov saknas för denna utbildning och elevkull.':'Jag har kontrollerat att det angivna yrkesprovet gäller för denna utbildning och elevkull.'}</span></label>
      {!value&&<p className="pp-examination-help">Välj examensform och ange kontrollens datum, en officiell HTTPS-källa hos Skolverket och vad du kontrollerat.</p>}
      <div className="pp-actions"><Button variant="outline" disabled={saving||uncertain} onClick={()=>{setEditing(false);setError(null);}}>Avbryt</Button><Button disabled={locked||!value||!confirmed} onClick={()=>void save()}> {saving?'Sparar…':'Spara examensform'}</Button></div>
    </div>}
    {mfa&&<MfaStepUpNotice message="Kontrollen kräver verifiering med engångskod."/>}{error&&<p role="alert">{error}</p>}{uncertain&&<Button disabled={saving} variant="outline" onClick={()=>void read()}>Läs aktuell sparstatus</Button>}{notice&&<output>{notice}</output>}
  </section>;
}
