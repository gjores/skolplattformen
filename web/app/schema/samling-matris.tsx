'use client';
// Raden i Följ passet och samlingsvyn (05.2-SM-FOLJ, 05.2-SM-SAMLINGSVY; design/Samlingsvy.dc.html), och resursmatrisen (I55): samma rad i kompakt höjd,
// en rad per lärare, sal eller klass med beläggningen som fyllda rutor. Raden är densamma i båda lägena, så att Följ passet är ett läge av samlingsvyn.
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { PlusIcon } from 'lucide-react';
import type { SchemaForslag, SchemaForslagLesson } from '@/lib/schema-contract.ts';
import type { FoljRad } from '@/lib/schema-folj.ts';
import { samlingKandidater, samlingNyckel, samlingRader, type SamlingResurs, type SamlingSlag } from '@/lib/schema-samling.ts';
import { clock, dayName, hoursText, names } from './delat.ts';
import { lanes } from './vecka.tsx';

/** Ett fält under passen i en rad: ett lager (spärrad tid, lunch …), håltid eller gemensam ledig tid. `text` syns i fältet när det ryms. */
export type RadFalt = { day: number; startMin: number; endMin: number; klass: string; label: string; text?: string };
/** Hur ett pass färgas och vad som står i rutan (`passFarg`). */
export type RadFarg = (l: SchemaForslagLesson) => { ton: number | null; avvikelse: boolean; text: string; namn: string };

/** Kort namn i passrutan, som designvyns "Ma", "Sv": två första bokstäverna. Hela namnet står i skärmläsartexten och i title. */
const kort = (title: string) => title.slice(0, 2);
/** "Klass 1, Klass 2" → "K1, K2". */
const kortKlass = (text: string) => text.replace(/\bKlass (\d+)/gu, 'K$1');

type RadProps = {
  rad: FoljRad; days: SchemaForslag['days']; start: number; classes: SchemaForslag['classes'];
  /** Passet som följs (Följ passet) och pass som krockar för eleven. */
  followed?: string; krock?: Set<string>;
  /** Dagarna som visas; utan värde alla. Resursmatrisen kan visa en dag. */
  dagar?: number[];
  falt?: RadFalt[]; farg?: RadFarg;
  /** Resursmatrisen: låg rad, fyllda rutor utan text. */
  kompakt?: boolean;
  /** Ersätter namnet i radens början (valruta eller knapp). */
  namn?: ReactNode;
  /** Klick på tom tid i raden, med dagen och minuten. */
  onTid?: (day: number, minute: number) => void;
};

export function SamlingRad({ rad, days, start, classes, followed, krock, dagar, falt = [], farg, kompakt = false, namn, onTid }: RadProps) {
  const visaKlass = rad.slag === 'larare' || rad.slag === 'sal', end = Math.max(...days.map(d => d.endMin));
  // Pekgenväg: klick på tom tid väljer tiden. Samma val görs med tangentbord i panelens fält, så knappen står utanför tabbordningen.
  const klick = (day: number) => (e: MouseEvent<HTMLButtonElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    onTid?.(day, start + (e.clientX - box.left) / box.width * (end - start));
  };
  return <div className={`folj-rad folj-${rad.slag}${kompakt ? ' samling-kompakt' : ''}`} data-rad={rad.key}>
    <div className="folj-namn">{namn ?? <><b>{rad.name}</b><small>{rad.detail}</small></>}</div>
    {(dagar ?? days.map((_, d) => d)).map(day => {
      const own = rad.lessons.filter(l => l.day === day).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id)), lane = lanes(own);
      return <ul key={day} className={`folj-dag${onTid ? ' samling-valbar' : ''}`} aria-label={`${rad.name}, ${dayName(day)}`}>
        {onTid && <li className="samling-tid" aria-hidden="true"><button type="button" tabIndex={-1} aria-label={`Sök ledig lärare eller sal, ${rad.name} ${dayName(day).toLowerCase()}`} title="Sök ledig lärare eller sal den här tiden" onClick={klick(day)}/></li>}
        {falt.filter(f => f.day === day).map((f, i) => <li key={`${f.klass}-${f.startMin}-${i}`} className={`folj-lage samling-falt ${f.klass}`} title={f.label}
          style={{ '--at': f.startMin - start, '--length': f.endMin - f.startMin } as CSSProperties}>
          {f.text && <span aria-hidden="true">{f.text}</span>}<span className="sr-only">{f.label}, {clock(f.startMin)}–{clock(f.endMin)}</span></li>)}
        {own.map(l => {
          const place = lane.get(l.id)!, f = farg?.(l), elevKrock = !!krock?.has(l.id) && rad.slag === 'elev';
          const mark = [l.id === followed ? 'passet som följs' : '', rad.fromGroup?.has(l.id) ? 'gruppens pass' : '', elevKrock ? 'krock för eleven' : '', f?.avvikelse ? 'regelavvikelse' : ''].filter(Boolean);
          const extra = visaKlass ? names(l.classIds, classes) : '';
          const text = f ? `${f.text}${extra && !kompakt ? ` ${kortKlass(extra)}` : ''}` : `${kort(l.title)}${extra ? ` ${kortKlass(extra)}` : ''}`;
          return <li key={l.id} title={`${l.title}${extra ? `, ${extra}` : ''}, ${clock(l.startMin!)}–${clock(l.startMin! + l.durationMin)}${f && f.namn !== l.title ? ` · ${f.namn}` : ''}`}
            className={`folj-pass${l.id === followed ? ' vald' : ''}${rad.fromGroup?.has(l.id) ? ' grupp' : ''}${elevKrock || f?.avvikelse ? ' krock' : ''}${f && f.ton !== null ? ` samling-ton-${f.ton}` : ''}`}
            style={{ '--at': l.startMin! - start, '--length': l.durationMin, '--lane': place.lane, '--lanes': place.lanes } as CSSProperties}>
            {!kompakt && <span aria-hidden="true">{text}</span>}
            <span className="sr-only">{l.title}{extra ? `, ${extra}` : ''}, {clock(l.startMin!)}–{clock(l.startMin! + l.durationMin)}{f && f.namn !== l.title ? `, ${f.namn}` : ''}{mark.length ? ` (${mark.join(', ')})` : ''}</span></li>;
        })}
      </ul>;
    })}
  </div>;
}

export type MatrisSlag = Extract<SamlingSlag, 'larare' | 'sal' | 'klass'>;
export const MATRIS_SLAG: { id: MatrisSlag; namn: string }[] = [{ id: 'larare', namn: 'Lärare' }, { id: 'sal', namn: 'Salar' }, { id: 'klass', namn: 'Klasser och grupper' }];

/**
 * Resursmatrisen (I55): alla lärare, salar eller klasser, en kompakt rad var. Klick på radens namn lägger raden i samlingsvyn.
 * `dag` zoomar till en dag.
 */
export function Matris({ forslag, lessons, slag, dag, start, valda, farg, onLaggTill }: {
  forslag: SchemaForslag;
  /** Passen som visas (termin och filter). */
  lessons: SchemaForslagLesson[];
  slag: MatrisSlag; dag: number | null; start: number;
  /** Rader som redan finns i samlingsvyn. */
  valda: Set<string>; farg: RadFarg; onLaggTill: (r: SamlingResurs, name: string) => void;
}) {
  const alla = samlingKandidater(forslag).filter(k => slag === 'klass' ? k.slag === 'klass' || k.slag === 'grupp' : k.slag === slag);
  const rader = samlingRader(forslag, alla, lessons), dagar = dag === null ? undefined : [dag];
  if (alla.length === 0) return <p className="empty-state">{slag === 'sal' ? 'Skolan har inga salar i villkoren för schemat.' : 'Förslaget har inga sådana rader.'}</p>;
  return <>{rader.map((r, i) => {
    const egna = dag === null ? r.lessons : r.lessons.filter(l => l.day === dag), minuter = egna.reduce((n, l) => n + l.durationMin, 0), vald = valda.has(samlingNyckel(alla[i]));
    return <SamlingRad key={r.key} rad={r} days={forslag.days} start={start} classes={forslag.classes} dagar={dagar} farg={farg} kompakt
      namn={<button type="button" className="samling-matris-namn" disabled={vald} onClick={() => onLaggTill(alla[i], r.name)}
        aria-label={vald ? `${r.name} visas i samlingsvyn` : `Lägg till ${r.name} i samlingsvyn`}>
        {!vald && <PlusIcon aria-hidden="true"/>}<b>{r.name}</b><small>{egna.length} pass · {hoursText(minuter)}{vald ? ' · visas' : ''}</small></button>}/>;
  })}</>;
}
