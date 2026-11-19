'use client';
// Passrutan i veckorutnätet (05.2-SM-YTA). Passets egna villkor står med text (05.2-SM-VILLKOR-SYNS).
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react';
import type { SchemaDatumTillfalle } from '@/lib/schema-datum.ts';
import type { SchemaForslagLesson } from '@/lib/schema-contract.ts';
import { LockIcon } from 'lucide-react';
import { aktivitetsVeckorText } from '@/lib/schema-aktiviteter.ts';
import { clock } from './delat.ts';

export type PassProps = {
  lesson: SchemaForslagLesson; occurrence?: SchemaDatumTillfalle;
  /** Rutnätets första minut. */
  origin: number;
  /** Visad längd i minuter (justerad längd, 05.2-SM-TIMPLAN-VECKA). */
  length: number;
  lane: { lane: number; lanes: number };
  picked: boolean; flagged: boolean; dragging: boolean; disabled: boolean;
  /** Raden under ämnet: lärare eller klass, sal, termin och kortning. */
  detail: string;
  /** Fler rader: justerad längd mot grundschemat, kortning vissa veckor, salskrav. */
  rader?: string[];
  /** Låst pass. Lås införs av SM-BYT; fältet finns så att passrutan kan visa det. */
  locked?: boolean;
  onGrab?: (e: ReactPointerEvent<HTMLElement>, lesson: SchemaForslagLesson) => void;
  onPick: (lesson: SchemaForslagLesson, utoka?: boolean) => void;
  actionTitle?: string;
};

export function Pass({ lesson: l, origin, length, lane, picked, flagged, dragging, disabled, detail, rader = [], locked = false, onGrab, onPick, occurrence, actionTitle }: PassProps) {
  return <li className={`schema-lesson${l.egenAktivitet ? ' aktivitet' : ''}${l.vacant ? ' vacant' : ''}${flagged ? ' deviation' : ''}${picked ? ' picked' : ''}${dragging ? ' dragging' : ''}`}
    style={{ '--start': l.startMin! - origin, '--length': length, '--lane': lane.lane, '--lanes': lane.lanes } as CSSProperties}>
    <button type="button" data-lesson={occurrence?.lesson.id ?? l.id} data-occurrence={occurrence?.key} aria-pressed={picked} disabled={disabled} title={actionTitle ?? (occurrence ? 'Ändra detta tillfälle' : 'Flytta passet')} onContextMenu={e => { if (occurrence) { e.preventDefault(); onPick(l); } }} onPointerDown={e => { if (!e.shiftKey) onGrab?.(e, l); }} onClick={e => onPick(l, e.shiftKey)}>
      <time>{clock(l.startMin!)}–{clock(l.startMin! + length)}</time><strong>{l.title}</strong>{l.egenAktivitet && <span className="akt-typtext">{l.egenAktivitet.typ} · {aktivitetsVeckorText(l.egenAktivitet.veckor)}</span>}{locked && <LockIcon className="schema-las" aria-hidden="true"/>}
      {flagged && <em>Regelavvikelse</em>}<span>{[detail, locked ? 'Låst' : ''].filter(Boolean).join(' · ')}</span>{rader.map(x => <span key={x}>{x}</span>)}</button></li>;
}
