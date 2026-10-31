'use client';
import {useState,useEffect,useEffectEvent} from 'react';
import {Button} from '@/components/ui/button';
import {useHasUnsaved,confirmDiscard} from '@/lib/unsaved-changes.tsx';
import {pendingPreparationScopes} from '@/lib/elective-preparation-journal.ts';
import type {ElectivePreparationScope} from '@/lib/elective-preparation.ts';
import type {ElectivePreparationIntent} from '@/lib/elective-preparation-target.ts';
import ProtectedElectivePreparation from './protected-elective-preparation';

type Choice={unitId:string;planId:string;columnId:string;label:string};
type Props={choices:Choice[];unitId?:string;schoolYear:number;identityKey:string;contextEpoch:number|null;disabled?:boolean;onSessionLost:()=>void;onApplied?:()=>void;onTjanst?:(target:Pick<ElectivePreparationScope,'unitId'|'schoolYear'>)=>void;onOpenTimplans?:()=>void;onOpenBlocks?:(target:Pick<ElectivePreparationScope,'unitId'|'schoolYear'>)=>void;onOpenSourceTimplan?:(scope:ElectivePreparationScope)=>void;onOpenChange?:(open:boolean)=>void;initialIntent?:ElectivePreparationIntent|null};
const sourceKey=(choice:Pick<Choice,'planId'|'columnId'>)=>`${choice.planId}:${choice.columnId}`;
/** Both the approved timetable and allocation open the same preparation, including pending recovery after reload. */
export default function ElectivePreparationLauncher({choices,unitId,schoolYear,identityKey,contextEpoch,disabled=false,onSessionLost,onApplied,onTjanst,onOpenTimplans,onOpenBlocks,onOpenSourceTimplan,onOpenChange,initialIntent}:Props){
 function recovery():ElectivePreparationScope|null{try{return typeof window==='undefined'?null:pendingPreparationScopes(identityKey,sessionStorage,schoolYear,unitId?[unitId]:choices.map(value=>value.unitId))[0]??null;}catch{return null;}}
 const [recovering,setRecovering]=useState(recovery),[open,setOpen]=useState(()=>!!initialIntent||!!recovery());
 const reportOpen=useEffectEvent((value:boolean)=>onOpenChange?.(value));
 useEffect(()=>reportOpen(open),[open]);
 const initial=recovering??initialIntent;
 const available=initial&&!choices.some(choice=>sourceKey(choice)===sourceKey(initial))?[{...initial,label:'Vald timplan'},...choices]:choices;
 const [selected,setSelected]=useState(()=>initial?sourceKey(initial):choices[0]?sourceKey(choices[0]):'');
 const blocked=useHasUnsaved('navigation-block:'),dirty=useHasUnsaved('elective-preparation:');
 const choice=available.find(value=>sourceKey(value)===selected)??(!open?available[0]:undefined);
 function close(){if(blocked)return;onApplied?.();const next=recovery();setRecovering(next);if(next){setSelected(sourceKey(next));setOpen(true);}else{setOpen(false);}}
 return <section className="elective-preparation-entry" aria-label="Förberedelse från godkänd timplan">
  {!open?<><h2>Förbered valbara block från timplanen</h2><p>Välj valramar, kursupplägg och skolans utbud. Block och undervisningsgrupper förbereds tillsammans med ärvd tid.</p>
   <div className="elective-preparation-entry-actions"><Button disabled={disabled||!choice} onClick={()=>{if(choice)setSelected(sourceKey(choice));setOpen(true);}}>Förbered valbara block</Button>
   {!choice&&onOpenTimplans&&<Button variant="outline" disabled={disabled} onClick={onOpenTimplans}>Öppna timplaner</Button>}</div>
   {!choice&&<p className="elective-muted">Öppna en godkänd timplan för att förbereda utbudet, även om klasser inte är kopplade ännu.</p>}
  </>:<>
   {recovering&&<output>En tidigare sparning behöver kontrolleras innan du fortsätter.</output>}
   {available.length>1&&<label>Utgå från timplan<select value={choice?sourceKey(choice):''} disabled={blocked} onChange={event=>{if(!dirty||confirmDiscard())setSelected(event.target.value);}}>{available.map(value=><option key={sourceKey(value)} value={sourceKey(value)}>{value.label}</option>)}</select></label>}
   {choice?<ProtectedElectivePreparation key={`${identityKey}:${choice.planId}:${choice.columnId}:${schoolYear}`} scope={{unitId:choice.unitId,planId:choice.planId,schoolYear,columnId:choice.columnId}} initialRows={initialIntent?.rowKey?[initialIntent.rowKey]:undefined} identityKey={identityKey} contextEpoch={contextEpoch} onSessionLost={onSessionLost} onClose={close}
    onOpenBlocks={onOpenBlocks} onOpenTimplan={onOpenSourceTimplan}
    onApplied={onTjanst?()=>{onApplied?.();onTjanst({unitId:choice.unitId,schoolYear});}:undefined}/>:<p role="alert">Den valda timplanen finns inte längre i urvalet. Öppna rätt timplan för att fortsätta.</p>}
  </>}
 </section>;
}
