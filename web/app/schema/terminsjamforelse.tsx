'use client';
import type { CSSProperties } from 'react';
import { SCHEMA_TERMS, type SchemaForslag, type SchemaForslagLesson, type SchemaTerm } from '@/lib/schema-contract.ts';
import { clock, dayName, TERM } from './delat.ts';
import { Pass } from './pass.tsx';
import { lanes, Teckenforklaring, veckansSpann } from './vecka.tsx';

type Props = {
  days: SchemaForslag['days'];
  lessons: SchemaForslagLesson[];
  length: (lesson: SchemaForslagLesson, term: SchemaTerm) => number;
  detail: (lesson: SchemaForslagLesson) => string;
  extra: (lesson: SchemaForslagLesson, term: SchemaTerm) => string[];
  locked: (lesson: SchemaForslagLesson) => boolean;
  flagged: Set<string>;
  picked: string | null;
  disabled: boolean;
  onOpen: (lesson: SchemaForslagLesson, term: SchemaTerm) => void;
};

export function Terminsjamforelse({ days, lessons, length, detail, extra, locked, flagged, picked, disabled, onOpen }: Props) {
  const { start, end, hours } = veckansSpann(days);
  const style = { '--days': days.length, '--span': end - start, '--first-hour': (hours[0] ?? start) - start } as CSSProperties;
  return <>
    <section className="schema-terminsram" aria-label="Grundschema för höst och vår"
      // eslint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- Tangentbordet ska kunna rulla hela jämförelsen i sidled.
      tabIndex={0}>
      <div className="schema-week schema-terminsvecka" style={style}>
        <div className="schema-hours" aria-hidden="true">{hours.map(h => <span key={h} style={{ '--at': h - start } as CSSProperties}>{clock(h)}</span>)}</div>
        {days.map((_, day) => <section key={day} aria-label={dayName(day)} className="schema-terminspar">
          <h3>{dayName(day)}</h3>
          <div className="schema-terminskolumner">
            {SCHEMA_TERMS.map(term => {
              const passes = lessons.filter(l => l.day === day && l.startMin !== null && (l.term === null || l.term === term))
                .map(lesson => ({ lesson, length: length(lesson, term) }))
                .sort((a, b) => a.lesson.startMin! - b.lesson.startMin! || a.lesson.id.localeCompare(b.lesson.id));
              const columns = lanes(passes.map(p => ({ ...p.lesson, durationMin: p.length })));
              return <section key={term} aria-label={TERM[term]} className="schema-day schema-terminskolumn" data-term={term}>
                <h4><abbr title={TERM[term]}>{term.toUpperCase()}</abbr></h4>
                <ol>{passes.map(({ lesson, length: minutes }) => <Pass key={lesson.id}
                  lesson={lesson} origin={start} length={minutes} lane={columns.get(lesson.id)!}
                  picked={lesson.id === picked} flagged={flagged.has(lesson.id)} locked={locked(lesson)}
                  dragging={false} disabled={disabled} detail={detail(lesson)} rader={extra(lesson, term)}
                  actionTitle={`${clock(lesson.startMin!)}–${clock(lesson.startMin! + minutes)} · ${lesson.title} · Öppna i ${TERM[term].toLocaleLowerCase('sv-SE')}`}
                  onPick={() => onOpen(lesson, term)}/>)}
                  {passes.length === 0 && <li className="schema-terminstom">Inga pass</li>}
                </ol>
              </section>;
            })}
          </div>
        </section>)}
      </div>
    </section>
    <Teckenforklaring lessons={lessons} flagged={flagged} picked={picked}/>
  </>;
}
