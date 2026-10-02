'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { ProgramplanLevelRef } from '@/lib/programplan-catalog.ts';
import { groupProgramplanOptions, programplanLevelName, sameProgramplanLevels, toggleProgramplanLevel, type ProgramplanOption } from '@/lib/protected-programplan.ts';

type Props = { options: ProgramplanOption[]; refs: ProgramplanLevelRef[]; disabled: boolean; onChange: (refs: ProgramplanLevelRef[]) => void; idPrefix: string };
export default function ProgramplanLevelPicker({ options, refs, disabled, onChange, idPrefix }: Props) {
  const [search, setSearch] = useState('');
  const groups = groupProgramplanOptions(options, search);
  function move(index: number, step: number) {
    const changed = [...refs];
    [changed[index], changed[index + step]] = [changed[index + step], changed[index]];
    onChange(changed);
  }
  return <section className="pp-level-picker" aria-label="Välj programfördjupning">
    <div className="pp-field"><label htmlFor={`${idPrefix}-search`}>Sök ämne eller nivå</label><input id={`${idPrefix}-search`} type="search" value={search} disabled={disabled} placeholder="Till exempel engelska" onChange={e=>setSearch(e.target.value)}/></div>
    <p className="pp-picker-help">Kryssa i nivåerna skolan ska erbjuda. Gemensamma ämnesnivåer ingår redan i programgrunden. Valen sparas först efter granskning.</p>
    <div className="pp-picker-columns"><div className="pp-picker-options">
      {groups.length===0&&<p>Ingen tillgänglig nivå matchar sökningen. Prova ett annat ämnesnamn eller töm sökfältet.</p>}
      {groups.map(group=><fieldset className="pp-picker-subject" key={`${group.subjectCode}:${group.subjectVersion}`}><legend>{group.subjectName}</legend>{group.levels.map(level=>{
        const checked=refs.some(ref=>sameProgramplanLevels([ref],[level]));
        return <label className="pp-level-check" key={level.itemCode}><input type="checkbox" aria-label={`${level.subjectName} · ${level.name} · ${level.points} poäng`} data-level-code={level.itemCode} checked={checked} disabled={disabled||!checked&&refs.length>=200} onChange={()=>onChange(toggleProgramplanLevel(refs,level))}/><span><strong>{level.name}</strong><small>{level.itemCode}</small></span><span>{level.points} poäng</span></label>;
      })}</fieldset>)}
    </div><section className="pp-picker-selected" aria-label="Vald programfördjupning"><h4>Vald programfördjupning</h4><output>{refs.length===1?'1 vald nivå':`${refs.length} valda nivåer`}</output>{refs.length===0&&<p>Kryssa i nivåer i ämneslistan. Du kan också spara ett tomt utkast.</p>}<ol className="pp-edit-levels">{refs.map((ref,index)=><li key={`${index}-${ref.itemCode}`}><div><strong>{programplanLevelName(ref,options)}</strong><span>{ref.points} gymnasiepoäng</span></div><div className="pp-level-actions"><Button type="button" variant="outline" disabled={disabled||index===0} aria-label={`Flytta upp ${ref.itemCode}`} onClick={()=>move(index,-1)}><ArrowUp size={16}/></Button><Button type="button" variant="outline" disabled={disabled||index===refs.length-1} aria-label={`Flytta ned ${ref.itemCode}`} onClick={()=>move(index,1)}><ArrowDown size={16}/></Button><Button type="button" variant="outline" disabled={disabled} aria-label={`Ta bort ${ref.itemCode}`} onClick={()=>onChange(refs.filter((_,i)=>i!==index))}>Ta bort</Button></div></li>)}</ol></section></div>
    <p className="pp-picker-help">Paket kan ännu inte väljas här. Individuellt val och gymnasiearbete hanteras separat.</p>
  </section>;
}
