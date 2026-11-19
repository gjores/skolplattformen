'use client';
// Viloytan (05.2-SM-FLYTT): pass utan tid. Dras hit för att tas ur veckan och härifrån ut i veckan.
import type { PointerEvent as ReactPointerEvent, Ref } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { OppnaFonster } from './fonster';
import { names } from './delat.ts';

export function Viloyta({ lessons, forslag, over, dragging, disabled, termTag, onGrab, onPick, restRef, onOpen, onSuggest, onSuggestAll, onFollow }: {
  lessons: SchemaForslagLesson[]; forslag: SchemaForslag; over: boolean; dragging: string | null; disabled: boolean;
  termTag: (l: SchemaForslagLesson) => string;
  onGrab: (e: ReactPointerEvent<HTMLElement>, l: SchemaForslagLesson) => void; onPick: (l: SchemaForslagLesson) => void;
  restRef?: Ref<HTMLDivElement>; onOpen?: () => void;
  onSuggest?: (lesson: string) => void; onSuggestAll?: () => void;
  onFollow?: (lesson: string) => void;
}) {
  return <div ref={restRef} className={`schema-list schema-rest${over ? ' over' : ''}`}><div className="flex flex-wrap items-center justify-between gap-2"><h2>Pass utan tid ({lessons.length})</h2><OppnaFonster onOpen={onOpen} label="Pass utan tid"/></div>
    <p className="schema-note">Dra ett pass hit för att ta bort tiden, eller dra det till veckan för att ge det en tid. Undervisning utan tid räknas som avvikelse från timplanen.</p>
    {lessons.length > 0 && onSuggestAll && <Button type="button" variant="outline" disabled={disabled} onClick={onSuggestAll}>Föreslå tider för alla</Button>}
    {lessons.length === 0 ? <p className="schema-note">Alla pass har tid.</p>
      : <ul className="schema-unplaced">{lessons.map(l => <li key={l.id} className={dragging === l.id ? 'dragging' : undefined} onPointerDown={e => onGrab(e, l)}><span>{l.title}, {l.durationMin} min{termTag(l)} · {names(l.classIds, forslag.classes)}{l.teacherIds.length > 0 && ` · ${names(l.teacherIds, forslag.teachers)}`}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Lägg ut ${l.title}, ${names(l.classIds, forslag.classes)}`} onClick={() => onPick(l)}>Lägg ut</Button>
        {onFollow && <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Följ passet ${l.title}, ${names(l.classIds, forslag.classes)}`} onClick={() => onFollow(l.id)}>Följ passet</Button>}
        {onSuggest && <Button type="button" variant="outline" size="sm" disabled={disabled} data-schema-rest-lesson={l.id} aria-label={`Föreslå placering för ${l.title}, ${names(l.classIds, forslag.classes)}`} onClick={() => onSuggest(l.id)}>Föreslå placering</Button>}</li>)}</ul>}</div>;
}
