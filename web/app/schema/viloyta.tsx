'use client';
// Viloytan (05.2-SM-FLYTT): pass utan tid. Dras hit för att tas ur veckan och härifrån ut i veckan.
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { names } from './delat.ts';

export function Viloyta({ lessons, forslag, over, dragging, disabled, termTag, onGrab, onPick, restRef }: {
  lessons: SchemaForslagLesson[]; forslag: SchemaForslag; over: boolean; dragging: string | null; disabled: boolean;
  termTag: (l: SchemaForslagLesson) => string;
  onGrab: (e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) => void; onPick: (l: SchemaForslagLesson) => void;
  restRef?: Ref<HTMLDivElement>;
}) {
  return <div ref={restRef} className={`schema-list schema-rest${over ? ' over' : ''}`}><h2>Viloyta ({lessons.length})</h2>
    <p className="schema-note">Pass utan tid ligger här. Dra ett pass hit för att ta det ur veckan, och härifrån ut i veckan för att lägga det. Pass på viloytan räknas som avvikelse från timplanen.</p>
    {lessons.length === 0 ? <p className="schema-note">Inga pass på viloytan.</p>
      : <ul className="schema-unplaced">{lessons.map(l => <li key={l.id} className={dragging === l.id ? 'dragging' : undefined} onPointerDown={e => onGrab(e, l)}><span>{l.title}, {l.durationMin} min{termTag(l)} · {names(l.classIds, forslag.classes)}{l.teacherIds.length > 0 && ` · ${names(l.teacherIds, forslag.teachers)}`}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Lägg ut ${l.title}, ${names(l.classIds, forslag.classes)}`} onClick={() => onPick(l)}>Lägg ut</Button></li>)}</ul>}</div>;
}
