'use client';
// Gemensam radrenderare för Följ passet och fria samlingsvyer; samma tidsaxel, överlappningsbanor och skärmläsartext.
import type { CSSProperties, ReactNode } from 'react';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import type { FoljRad } from '@/lib/schema-folj.ts';
import type { SchemaBand, SchemaOverlay } from '@/lib/schema-utkast.ts';
import { clock, dayName, names } from './delat.ts';
import { lanes } from './vecka.tsx';

export function SamlingRad({ rad, days, start, followed = '', krock = new Set<string>(), classes, head, overlays = [], bands = [], visibleDays, onPick, passClass, passLabel, compact = false, shortTitles = compact, onTime }: {
  rad: FoljRad; days: SchemaForslag['days']; start: number; followed?: string; krock?: Set<string>; classes: SchemaForslag['classes'];
  head?: ReactNode; overlays?: SchemaOverlay[]; bands?: SchemaBand[]; visibleDays?: number[]; onPick?: (id: string) => void;
  passClass?: (l: SchemaForslagLesson) => string; passLabel?: (l: SchemaForslagLesson) => string; compact?: boolean; shortTitles?: boolean;
  onTime?: (day: number, minute: number) => void;
}) {
  const visaKlass = rad.slag === 'larare' || rad.slag === 'sal';
  return <div className={`folj-rad folj-${rad.slag}${compact ? ' samling-kompakt' : ''}`} data-resource={rad.key}>
    <div className="folj-namn">{head ?? <><b>{rad.name}</b><small>{rad.detail}</small></>}</div>
    {(visibleDays ?? days.map((_, d) => d)).map(day => {
      const own = rad.lessons.filter(l => l.day === day && l.startMin !== null).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id)), lane = lanes(own);
      return <ul key={day} className="folj-dag" aria-label={`${rad.name}, ${dayName(day)}`}>
        {onTime && <li className="samling-tider">{Array.from({ length: Math.ceil((days[day].endMin - days[day].startMin) / 30) }, (_, i) => days[day].startMin + i * 30).map(min =>
          <button type="button" key={min} className="samling-tid" style={{ '--at': min - start, '--length': 30 } as CSSProperties} aria-label={`Sök ledig lärare eller sal ${dayName(day).toLowerCase()} ${clock(min)}`} onClick={() => onTime(day, min)}/>)}</li>}
        {overlays.filter(o => o.day === day).map((o, i) => <li key={`lager-${i}`} className={`folj-lage falt-${o.kind} samling-lager`} style={{ '--at': o.startMin - start, '--length': o.endMin - o.startMin } as CSSProperties} title={o.label}><span className="sr-only">{o.label}, {clock(o.startMin)}–{clock(o.endMin)}</span></li>)}
        {bands.map((b, i) => { const l = own.find(l => l.id === b.lesson); if (!l) return null; const at = b.side === 'fore' ? l.startMin! - b.minutes : l.startMin! + l.durationMin;
          return <li key={`band-${i}`} className={`folj-lage falt-${b.kind ?? 'marginal'} samling-lager`} style={{ '--at': at - start, '--length': b.minutes } as CSSProperties} title={`${b.label} ${b.minutes} min`}><span className="sr-only">{b.label} {b.minutes} min</span></li>; })}
        {own.map(l => {
          const place = lane.get(l.id)!, mark = [l.id === followed ? 'passet som följs' : '', rad.fromGroup?.has(l.id) ? 'gruppens pass' : '', krock.has(l.id) && rad.slag === 'elev' ? 'krock för eleven' : ''].filter(Boolean);
          const extra = visaKlass ? names(l.classIds, classes) : '', text = `${l.title}${extra ? `, ${extra}` : ''}, ${clock(l.startMin!)}–${clock(l.startMin! + l.durationMin)}${mark.length ? ` (${mark.join(', ')})` : ''}`;
          const className = `folj-pass${l.id === followed ? ' vald' : ''}${rad.fromGroup?.has(l.id) ? ' grupp' : ''}${krock.has(l.id) && rad.slag === 'elev' ? ' krock' : ''}${l.egenAktivitet ? ' aktivitet' : ''} ${passClass?.(l) ?? ''}`;
          const style = { '--at': l.startMin! - start, '--length': l.durationMin, '--lane': place.lane, '--lanes': place.lanes } as CSSProperties;
          const fullText = `${text}${l.egenAktivitet ? `, ${l.egenAktivitet.typ}` : ''}${passLabel?.(l) ? `, ${passLabel(l)}` : ''}`;
          const content = <><span aria-hidden="true" className={shortTitles ? 'samling-kort-text' : undefined}>{shortTitles ? l.title.slice(0, 2) : l.title}{extra ? ` ${extra.replace(/\bKlass (\d+)/gu, 'K$1')}` : ''}{l.egenAktivitet ? ` · ${l.egenAktivitet.typ}` : ''}{!shortTitles && passLabel?.(l) ? ` · ${passLabel(l)}` : ''}</span><span className="sr-only">{fullText}</span></>;
          return onPick ? <li key={l.id}><button type="button" data-schema-pass={l.id} title={fullText} className={className} style={style} onClick={() => onPick(l.id)}>{content}</button></li>
            : <li key={l.id} title={fullText} className={className} style={style}>{content}</li>;
        })}
      </ul>;
    })}
  </div>;
}
