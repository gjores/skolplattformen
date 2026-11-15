'use client';
// Viloytan (05.2-SM-FLYTT): pass utan tid. Dras hit för att tas ur veckan och härifrån ut i veckan.
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { OppnaFonster } from './fonster';
import { names } from './delat.ts';

export function Viloyta({ lessons, forslag, over, dragging, disabled, termTag, onGrab, onPick, restRef, onOpen }: {
  lessons: SchemaForslagLesson[]; forslag: SchemaForslag; over: boolean; dragging: string | null; disabled: boolean;
  termTag: (l: SchemaForslagLesson) => string;
  onGrab: (e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) => void; onPick: (l: SchemaForslagLesson) => void;
  restRef?: Ref<HTMLDivElement>; onOpen?: () => void;
}) {
  return <div ref={restRef} className={`schema-list schema-rest${over ? ' over' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><h2>Viloyta ({lessons.length})</h2><OppnaFonster onOpen={onOpen} label="Viloytan"/></div>
    <p className="schema-note">Pass utan tid ligger här. Dra ett pass hit för att ta det ur veckan, och härifrån ut i veckan för att lägga det. Pass på viloytan räknas som avvikelse från timplanen.</p>
    {lessons.length === 0 ? <p className="schema-note">Inga pass på viloytan.</p>
      : <ul className="schema-unplaced">{lessons.map(l => <li key={l.id} className={dragging === l.id ? 'dragging' : undefined} onPointerDown={e => onGrab(e, l)}><span>{l.title}, {l.durationMin} min{termTag(l)} · {names(l.classIds, forslag.classes)}{l.teacherIds.length > 0 && ` · ${names(l.teacherIds, forslag.teachers)}`}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Lägg ut ${l.title}, ${names(l.classIds, forslag.classes)}`} onClick={() => onPick(l)}>Lägg ut</Button></li>)}</ul>}</div>;
}
