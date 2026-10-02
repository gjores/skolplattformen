'use client';

import { useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CatalogProgram, ProgramplanLevelRef } from '@/lib/programplan-catalog.ts';
import { groupProgramplanOptions, programplanLevelName, sameProgramplanLevels, toggleProgramplanLevel, type ProgramplanOption } from '@/lib/protected-programplan.ts';
import { DIPLOMA_WORK_POINTS, INDIVIDUAL_CHOICE_POINTS, canAddLevel, frameStatus, programFrame } from '@/lib/programplan-table.ts';

type Props = {
  program: CatalogProgram | null; orientationCode: string | null;
  /** När options och onChange anges visas programfördjupningen som valbara rader. */
  options?: ProgramplanOption[]; refs?: ProgramplanLevelRef[]; onChange?: (refs: ProgramplanLevelRef[]) => void;
  disabled?: boolean; idPrefix?: string;
  /** 'base' visar bara ämnestabellen, 'selection' bara poängramen och valet, 'all' (standard) båda. */
  part?: 'base' | 'selection' | 'all';
};
const points = (n: number) => `${n.toLocaleString('sv-SE')} poäng`;

export default function ProgramplanTable({ program, orientationCode, options, refs = [], onChange, disabled = false, idPrefix = 'pp', part = 'all' }: Props) {
  const showBase = part !== 'selection', showSelection = part !== 'base';
  const [search, setSearch] = useState('');
  const frame = program ? programFrame(program, orientationCode) : null;
  const selectable = !!(options && onChange && frame);
  const status = frame ? frameStatus(frame, refs) : null;
  const groups = selectable ? groupProgramplanOptions(options, search) : [];
  const move = (index: number, step: number) => { const changed = [...refs]; [changed[index], changed[index + step]] = [changed[index + step], changed[index]]; onChange?.(changed); };
  return <section className="pp-reference" aria-label={showBase?'Ingår enligt underlaget':'Programfördjupning enligt Skolverkets ram'}>{showBase&&<h3>Programgrund och inriktning</h3>}
    {showBase&&!program&&<p>Välj ett tillgängligt underlag för att läsa ämnena. Äldre sparade uppgifter bevaras.</p>}
    {showBase&&program&&program.orientations.length===0&&<p>Programmet har ingen inriktning.</p>}
    {showBase&&frame&&<div className="pp-table-wrap"><table className="pp-table"><caption className="pp-sr">Ämnen och nivåer enligt Skolverket</caption>
      <thead><tr><th scope="col">Kurs</th><th scope="col">Kod</th><th scope="col" className="pp-num">Poäng</th></tr></thead>
      {frame.sections.map(section=><tbody key={section.id} id={`pp-national-${section.id}`}>
        <tr className="pp-table-group"><th colSpan={3} scope="colgroup">{section.title}</th></tr>
        {section.rows.map(row=><tr key={row.key}><th scope="row">{row.subjectName}{row.levelName&&` · ${row.levelName}`}{row.note&&<small className={row.code?'':'pp-reference-gap'}>{row.note==='Alternativ — en av dem läses'?'Alternativ i underlaget — inget ämnesval är gjort här.':row.note==='Nivåer saknas i underlaget'?'Nivåuppgifter saknas i underlaget.':row.note}</small>}</th><td>{row.code??'—'}</td><td className="pp-num">{row.points}</td></tr>)}
        <tr className="pp-table-sum"><th scope="row" colSpan={2}>Summa {section.title.toLocaleLowerCase('sv')}</th><td className="pp-num">{section.points}</td></tr>
      </tbody>)}
    </table></div>}
    {showSelection&&frame&&status&&<section className="pp-frame" aria-label="Skolverkets poängram">
      <h4>Programfördjupning</h4>
      {frame.unresolved==='orientation'?<p className="pp-alert" role="alert">Välj inriktning först. Utan inriktning går det inte att räkna ut hur många poäng som får väljas som programfördjupning.</p>
        :frame.unresolved==='total'?<><p className="pp-frame-note">Skolverkets poängram kan inte kontrolleras för det här programmet. Yrkesprogram omfattar 2 700 eller 2 800 poäng och underlaget anger inte vilket. Du kan bara välja nivåer som Skolverket tillåter som programfördjupning, men summan jämförs inte mot någon gräns.</p><output className="pp-frame-status">Valt {points(status.chosen)}</output></>
        :<><p>Skolverkets ram: {points(frame.total ?? 0)} totalt − {points(DIPLOMA_WORK_POINTS)} gymnasiearbete − {points(INDIVIDUAL_CHOICE_POINTS)} individuellt val − {points(frame.fixedPoints)} i programgrunden = <strong>{points(frame.specializationRoom ?? 0)}</strong> programfördjupning.</p>
        <output className={status.over?'pp-frame-status pp-frame-over':'pp-frame-status'} role={status.over?'alert':undefined}>{status.over?`Utanför Skolverkets ram: ${points(status.chosen)} valda, högst ${points(frame.specializationRoom ?? 0)} får väljas. Ta bort nivåer.`:`Valt ${points(status.chosen)} av ${points(frame.specializationRoom ?? 0)} · ${points(status.remaining ?? 0)} kvar`}</output></>}
    </section>}
    {showSelection&&selectable&&frame&&frame.unresolved!=='orientation'&&<>
      <div className="pp-field"><label htmlFor={`${idPrefix}-search`}>Sök ämne eller nivå</label><input id={`${idPrefix}-search`} type="search" value={search} disabled={disabled} placeholder="Till exempel engelska" onChange={e=>setSearch(e.target.value)}/></div>
      <p className="pp-picker-help">Kryssa i nivåerna skolan ska erbjuda. Bara de ämnen Skolverket tillåter som programfördjupning för det här programmet visas. En nivå som skulle gå utanför ramen kan inte väljas.</p>
      <div className="pp-table-wrap pp-table-scroll"><table className="pp-table pp-table-options"><caption className="pp-sr">Valbar programfördjupning enligt Skolverket</caption>
        <thead><tr><th scope="col">Välj</th><th scope="col">Kurs</th><th scope="col">Kod</th><th scope="col" className="pp-num">Poäng</th></tr></thead>
        {groups.length===0&&<tbody><tr><td colSpan={4}>Ingen tillgänglig nivå matchar sökningen. Prova ett annat ämnesnamn eller töm sökfältet.</td></tr></tbody>}
        {groups.map(group=><tbody key={`${group.subjectCode}:${group.subjectVersion}`}>
          <tr className="pp-table-group"><th colSpan={4} scope="colgroup">{group.subjectName}</th></tr>
          {group.levels.map(level=>{
            const checked=refs.some(ref=>sameProgramplanLevels([ref],[level]));
            const blocked=!checked&&!canAddLevel(frame,refs,level.points);
            return <tr key={level.itemCode} className={checked?'pp-row-chosen':undefined}>
              <td><input type="checkbox" aria-label={`${level.subjectName} · ${level.name} · ${level.points} poäng`} data-level-code={level.itemCode} checked={checked} disabled={disabled||blocked||!checked&&refs.length>=200} title={blocked?'Skulle gå utanför Skolverkets ram':undefined} onChange={()=>onChange?.(toggleProgramplanLevel(refs,level))}/></td>
              <th scope="row">{level.subjectName} · {level.name}{blocked&&<small className="pp-reference-gap">Ryms inte inom Skolverkets ram</small>}</th><td>{level.itemCode}</td><td className="pp-num">{level.points}</td></tr>;
          })}
        </tbody>)}
      </table></div>
      <section className="pp-picker-selected" aria-label="Vald programfördjupning"><h4>Vald programfördjupning</h4><output>{refs.length===1?'1 vald nivå':`${refs.length} valda nivåer`}</output>
        {refs.length===0&&<p>Kryssa i nivåer i tabellen. Du kan också spara ett tomt utkast.</p>}
        <ol className="pp-edit-levels">{refs.map((ref,index)=><li key={`${index}-${ref.itemCode}`}><div><strong>{programplanLevelName(ref,options)}</strong><span>{ref.points} gymnasiepoäng</span></div><div className="pp-level-actions"><Button type="button" variant="outline" disabled={disabled||index===0} aria-label={`Flytta upp ${ref.itemCode}`} onClick={()=>move(index,-1)}><ArrowUp size={16}/></Button><Button type="button" variant="outline" disabled={disabled||index===refs.length-1} aria-label={`Flytta ned ${ref.itemCode}`} onClick={()=>move(index,1)}><ArrowDown size={16}/></Button><Button type="button" variant="outline" disabled={disabled} aria-label={`Ta bort ${ref.itemCode}`} onClick={()=>onChange?.(refs.filter((_,i)=>i!==index))}>Ta bort</Button></div></li>)}</ol></section>
    </>}
    {showBase&&<details className="pp-concept-help"><summary>Om programplanens delar</summary><p>Ämnen och nivåer i tabellen läses från Skolverkets underlag. Alternativ i grunden väljs inte automatiskt. Gymnasiepoäng beskriver omfattningen, inte lektionstimmar.</p><p>Individuellt val ({INDIVIDUAL_CHOICE_POINTS} poäng) och gymnasiearbete ({DIPLOMA_WORK_POINTS} poäng) är egna delar som inte väljs här. Poängramen räknas ut från Skolverkets programstruktur: 2 500 poäng för högskoleförberedande program. För yrkesprogram (2 700 eller 2 800 poäng) anger underlaget inte totalsumman, så ramen kontrolleras inte där. Paket kan ännu inte väljas här.</p><p>Hela utbildningens regler godkänns inte automatiskt. <a href="https://utbildningsguiden.skolverket.se/gymnasieskolan/gymnasieskolans-program/gymnasieprogrammens-olika-delar" target="_blank" rel="noreferrer">Skolverket förklarar programmens delar</a>.</p></details>}
  </section>;
}
