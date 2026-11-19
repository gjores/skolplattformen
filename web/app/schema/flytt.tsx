'use client';
// Flyttpanelen (05.2-SM-FLYTT): flytta ett valt pass med dag, starttid och sal. Används med tangentbord och på pekskärm. Flyttad oförändrad av 05.2-SM-YTA.
import { useId, type ReactNode, type Ref } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import type { SchemaSalScope } from '@/lib/schema-salar.ts';
import { DAYS, clock, dayName, names, startTimes } from './delat.ts';
import { SalSok } from './sal-sok.tsx';
import { stegaStart } from '@/lib/schema-lagesfalt.ts';

export type FlyttMal = { day: number; startMin: number; room: string | null };

const SALBEHOV: Record<NonNullable<SchemaForslagLesson['sal']>['lage'], string> = { allman: 'Lämplig allmän sal', sarskild: 'Särskilda salskrav', ingen: 'Sal behövs inte', aldre: 'Salvillkor', obesvarat: 'Salbehov obesvarat' };

/**
 * Panelen för valt pass (05.2-SM-UXF-42, designvyn Veckan2). Ett klick på ett pass visar passet här och ändrar ingenting.
 * Passet flyttas först med Flytta hit. Exakt starttid väljs i listan eller med − och +, utan dragning. Flyttpanelens tangentbordsväg är oförändrad.
 */
export function Flyttpanel({ lesson: l, forslag, target, checking, locked, shownMin, extra, roomName, dayRef, headingRef, salRequest, status, sal, avvikelse, medveten, verktyg, flerVerktyg, onTarget, onMove, onPark, onCancel, onSuggest, onTargetSuggest, onSessionLost }: {
  lesson: SchemaForslagLesson; forslag: SchemaForslag; target: FlyttMal; checking: boolean; locked?: string;
  shownMin: number;
  /** Kortning vissa veckor och termin för valt pass. */
  extra: { someWeeks: string; termTag: string };
  roomName: (id: string | null) => string;
  dayRef?: Ref<HTMLSelectElement>;
  headingRef?: Ref<HTMLHeadingElement>;
  salRequest?: SchemaSalScope;
  /** Möjlighetskartans besked för vald dag och start, i klartext. */
  status?: string;
  /** Passets salbehov enligt aktuellt salregister. */
  sal?: SchemaForslagLesson['sal'];
  avvikelse?: string | null;
  medveten?: boolean;
  verktyg?: ReactNode;
  flerVerktyg?: ReactNode;
  onSessionLost?: () => void;
  onTarget: (next: FlyttMal) => void; onMove: () => void; onPark: () => void; onCancel: () => void;
  onSuggest?: () => void; onTargetSuggest?: () => void;
}) {
  const blocked = checking || !!locked, rubrik = useId();
  const starts = (day: number) => startTimes(forslag, day, l.durationMin + l.marginMin, l.marginBeforeMin);
  const tidigare = stegaStart(starts(target.day), target.startMin, -1), senare = stegaStart(starts(target.day), target.startMin, 1);
  const andrad = !(target.day === l.day && target.startMin === l.startMin && target.room === l.roomId);
  const salText = l.roomId ? roomName(l.roomId) : l.roomIds.length ? 'Ingen sal ännu' : 'Ingen sal';
  const tillatnaSalar = l.roomIds.map(roomName).filter(Boolean);
  return <form className="schema-move schema-inspektor" aria-label="Flytta pass" aria-describedby={rubrik} onSubmit={e => { e.preventDefault(); if (!blocked) onMove(); }}>
    <div className="schema-inspektor-pass" id={rubrik}>
      <p className="schema-note">Valt pass</p>
      <h2 ref={headingRef} tabIndex={-1} className="text-base font-semibold">{l.title} · {names(l.classIds, forslag.classes)}</h2>
      <dl>
        <div><dt>Tid</dt><dd>{l.day === null || l.startMin === null ? 'Utan tid' : `${DAYS[l.day]} ${clock(l.startMin)}–${clock(l.startMin + shownMin)}`}{extra.termTag}{extra.someWeeks}</dd></div>
        <div><dt>Längd</dt><dd>{shownMin} min{shownMin !== l.durationMin && ` (${l.durationMin} min i grundschemat)`}{l.marginMin + l.marginBeforeMin > 0 && `, marginal ${l.marginBeforeMin || '–'} före och ${l.marginMin || '–'} efter`}</dd></div>
        <div><dt>Lärare</dt><dd>{l.teacherIds.length ? names(l.teacherIds, forslag.teachers) : 'Ingen lärare'}</dd></div>
        <div><dt>Sal</dt><dd>{salText}{sal && <span className="schema-note block">Salbehov: {SALBEHOV[sal.lage]}{sal.hinder ? `. ${sal.hinder}` : ''}</span>}
          {tillatnaSalar.length > 0 && (!l.roomId || tillatnaSalar.length > 1) && <span className="schema-note block">Salskrav: {tillatnaSalar.join(' eller ')}</span>}</dd></div>
        {(avvikelse || medveten) && <div><dt>Regelavvikelse</dt><dd>{medveten && <strong className="block">Medveten krock</strong>}{avvikelse}</dd></div>}
        {locked && <><div><dt>Lås</dt><dd>{locked}</dd></div></>}
      </dl>
    </div>
    <fieldset className="schema-inspektor-tid" disabled={blocked}><legend>Pröva ny tid eller sal</legend>
      <label>Dag<select ref={dayRef} value={target.day} onChange={e => { const day = Number(e.target.value), next = starts(day); onTarget({ ...target, day, startMin: next.includes(target.startMin) ? target.startMin : next[0] ?? target.startMin }); }}>
        {forslag.days.map((_, day) => <option key={day} value={day}>{dayName(day)}</option>)}</select></label>
      <div className="schema-inspektor-start">
        <label>Starttid<select value={target.startMin} onChange={e => onTarget({ ...target, startMin: Number(e.target.value) })}>
          {starts(target.day).map(m => <option key={m} value={m}>{clock(m)}–{clock(m + l.durationMin)}</option>)}</select></label>
        <Button type="button" variant="outline" aria-label="Tidigare start" disabled={tidigare === null} onClick={() => tidigare !== null && onTarget({ ...target, startMin: tidigare })}>−</Button>
        <Button type="button" variant="outline" aria-label="Senare start" disabled={senare === null} onClick={() => senare !== null && onTarget({ ...target, startMin: senare })}>+</Button>
      </div>
      {l.roomIds.length > 1 && <label>Sal<select value={target.room ?? ''} onChange={e => onTarget({ ...target, room: e.target.value || null })}>
        <option value="">{forslag.villkor.salregister ? 'Ingen sal' : 'Första lediga'}</option>{l.roomIds.map(id => <option key={id} value={id}>{roomName(id)}</option>)}</select></label>}
    </fieldset>
    {salRequest && <SalSok scope={salRequest} lesson={l.id} target={target} rooms={forslag.rooms} disabled={blocked} onSelect={room => onTarget({ ...target, room })} onSessionLost={onSessionLost}/>}
    <output className="schema-inspektor-status" aria-live="polite">{!andrad ? 'Passets nuvarande tid.' : status?.startsWith('Varför inte ') ? status : `${dayName(target.day)} ${clock(target.startMin)}: ${status?.startsWith(`${dayName(target.day)} ${clock(target.startMin)} `) ? status.slice(`${dayName(target.day)} ${clock(target.startMin)} `.length) : status || 'prövas när du flyttar.'}`}</output>
    <div className="schema-inspektor-knappar">
      <Button type="submit" disabled={blocked || !andrad}>{checking ? 'Kontrollerar…' : 'Flytta hit'}</Button>
      <Button type="button" variant="ghost" disabled={checking} onClick={onCancel}>Avbryt</Button>
    </div>
    <fieldset className="schema-inspektor-knappar schema-inspektor-verktyg"><legend className="sr-only">Passverktyg</legend>
      {verktyg}
      {onTargetSuggest && <Button type="button" variant="outline" disabled={blocked} onClick={onTargetSuggest}>Lägg här och flytta det som krockar</Button>}
      {onSuggest && <Button type="button" variant="outline" disabled={blocked} onClick={onSuggest}>Föreslå placering</Button>}
      {l.day !== null && <Button type="button" variant="outline" disabled={blocked} onClick={onPark}>Ta bort tiden</Button>}
    </fieldset>
    {flerVerktyg && <details className="schema-inspektor-fler"><summary>Fler passverktyg</summary><div className="schema-inspektor-knappar">{flerVerktyg}</div></details>}
  </form>;
}
