'use client';
// Flyttpanelen (05.2-SM-FLYTT): flytta ett valt pass med dag, starttid och sal. Används med tangentbord och på pekskärm. Flyttad oförändrad av 05.2-SM-YTA.
import type { Ref } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { DAYS, clock, dayName, names, startTimes } from './delat.ts';

export type FlyttMal = { day: number; startMin: number; room: string | null };

export function Flyttpanel({ lesson: l, forslag, target, checking, shownMin, extra, roomName, dayRef, onTarget, onMove, onPark, onCancel }: {
  lesson: SchemaForslagLesson; forslag: SchemaForslag; target: FlyttMal; checking: boolean;
  shownMin: number;
  /** Kortning vissa veckor och termin, i samma text som i passrutan. */
  extra: { someWeeks: string; termTag: string };
  roomName: (id: string | null) => string;
  dayRef?: Ref<HTMLSelectElement>;
  onTarget: (next: FlyttMal) => void; onMove: () => void; onPark: () => void; onCancel: () => void;
}) {
  const starts = (day: number) => startTimes(forslag, day, l.durationMin + l.marginMin);
  return <form className="schema-move" aria-label="Flytta pass" onSubmit={e => { e.preventDefault(); onMove(); }}>
    <p><strong>{l.title}</strong>, {shownMin} min{shownMin !== l.durationMin && ` (${l.durationMin} min i grundschemat)`}{extra.someWeeks}{l.marginMin > 0 && ` och ${l.marginMin} min marginal`}{extra.termTag} · {names(l.classIds, forslag.classes)}{l.teacherIds.length > 0 && ` · ${names(l.teacherIds, forslag.teachers)}`}
      <span className="schema-note"> {l.day === null || l.startMin === null ? 'Ligger på viloytan.' : `Ligger nu ${DAYS[l.day].toLowerCase()} ${clock(l.startMin)}${l.roomId ? ` i ${roomName(l.roomId)}` : ''}.`}</span></p>
    <label>Dag<select ref={dayRef} value={target.day} disabled={checking} onChange={e => { const day = Number(e.target.value), next = starts(day); onTarget({ ...target, day, startMin: next.includes(target.startMin) ? target.startMin : next[0] ?? target.startMin }); }}>
      {forslag.days.map((_, day) => <option key={day} value={day}>{dayName(day)}</option>)}</select></label>
    <label>Starttid<select value={target.startMin} disabled={checking} onChange={e => onTarget({ ...target, startMin: Number(e.target.value) })}>
      {starts(target.day).map(m => <option key={m} value={m}>{clock(m)}–{clock(m + l.durationMin)}</option>)}</select></label>
    {l.roomIds.length > 1 && <label>Sal<select value={target.room ?? ''} disabled={checking} onChange={e => onTarget({ ...target, room: e.target.value || null })}>
      <option value="">Första lediga</option>{l.roomIds.map(id => <option key={id} value={id}>{roomName(id)}</option>)}</select></label>}
    <Button type="submit" disabled={checking || target.day === l.day && target.startMin === l.startMin && target.room === l.roomId}>{checking ? 'Kontrollerar…' : 'Flytta hit'}</Button>
    {l.day !== null && <Button type="button" variant="outline" disabled={checking} onClick={onPark}>Lägg på viloytan</Button>}
    <Button type="button" variant="outline" disabled={checking} onClick={onCancel}>Avbryt</Button>
  </form>;
}
