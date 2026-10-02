'use client';

import type { CatalogProgram } from '@/lib/programplan-catalog.ts';

type Props = { program: CatalogProgram | null; orientationCode: string | null };
export default function ProgramplanOverview({ program, orientationCode }: Props) {
  const orientation=program?.orientations.find(o=>o.code===orientationCode);
  const blocks=program?[
    {name:'Gymnasiegemensamma ämnen',subjects:program.foundation},
    {name:'Programgemensamma ämnen',subjects:program.programmeSpecific},
    ...(orientation?[{name:`Inriktning: ${orientation.name}`,subjects:orientation.subjects}]:[]),
  ]:[];
  return <section className="pp-reference" aria-label="Ingår enligt underlaget"><h3>Programgrund och inriktning</h3>
    {!program&&<p>Välj ett tillgängligt underlag för att läsa ämnena. Äldre sparade uppgifter bevaras.</p>}
    {program&&program.orientations.length===0&&<p>Programmet har ingen inriktning.</p>}
    {blocks.map((block,index)=><section id={`pp-national-${index}`} className="pp-subject-block" key={block.name}><h4>{block.name}</h4><div className="pp-subject-table">{block.subjects.map(subject=><article className="pp-subject-row" key={subject.code}><div><strong>{subject.name}</strong>{subject.optional&&<p className="pp-reference-gap">Alternativ i underlaget — inget ämnesval är gjort här.</p>}</div><div>{subject.levels.length?<ul>{subject.levels.map(level=><li key={level.code}>{level.name}<span>{level.points} poäng</span></li>)}</ul>:<p className="pp-reference-gap">Nivåuppgifter saknas i underlaget.</p>}</div></article>)}</div></section>)}
    <details className="pp-concept-help"><summary>Om programplanens delar</summary><p>Grundämnen och inriktningsämnen läses från underlaget. Här väljer du skolans programfördjupning. Alternativ i grunden väljs inte automatiskt. Gymnasiepoäng beskriver omfattningen, inte lektionstimmar.</p><p>Elevens individuella val och gymnasiearbete är egna delar. De väljs inte med fördjupningskryssen. Paket kan ännu inte väljas här.</p><p>Hela utbildningens regler och poängram godkänns inte automatiskt. <a href="https://utbildningsguiden.skolverket.se/gymnasieskolan/gymnasieskolans-program/gymnasieprogrammens-olika-delar" target="_blank" rel="noreferrer">Skolverket förklarar programmens delar</a>.</p></details>
  </section>;
}
