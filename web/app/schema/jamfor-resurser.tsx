'use client';

import { useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { SchemaForslag, SchemaForslagLesson, SchemaKontrollRequest, SchemaTerm } from '@/lib/schema-contract.ts';
import { schemaDatumTillfallen, type SchemaDatumAndring, type SchemaDatumTillfalle } from '@/lib/schema-datum.ts';
import { parseSamlingData, samlingPass, samlingResurser, SAMLING_NAMN, type SamlingResurs } from '@/lib/schema-samling.ts';
import { schemaDayHeading } from '@/lib/schema-vecka.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { clock, dayName, TERM } from './delat.ts';
import { SamlingSok } from './samling-sok.tsx';

type Props = { forslag: SchemaForslag; lesson: SchemaForslagLesson; occurrence?: SchemaDatumTillfalle; overrides: SchemaDatumAndring[]; term: SchemaTerm;
  groupRequest?: SchemaKontrollRequest | null; active: boolean; onSessionLost: () => void };
type Bokning = { key: string; lesson: SchemaForslagLesson; start: number; end: number; flyttadFran?: string };
type Gruppunderlag = { status: 'last'; resources: SamlingResurs[] } | { status: 'fel' };

/** Ett pass kan visa klassens namn även när det bär en separat undervisningsgrupps källreferens. */
function resurserForJamforelse(forslag: SchemaForslag, medlemskap: SamlingResurs[]): SamlingResurs[] {
  const resurser = new Map(samlingResurser(forslag).map(r => {
    const key = r.slag === 'sal' ? `sal:${r.id}` : r.key;
    return [key, { ...r, key }];
  }));
  const gruppass = new Map<string, string[]>();
  for (const lesson of forslag.lessons) {
    const group = /^undervisning:(?:teaching_group|study_group):([^:]+)(?::(\d{4}))?$/u.exec(lesson.undervisning ?? '');
    if (!group || group[2] && Number(group[2]) !== forslag.schoolYear) continue;
    const passes = gruppass.get(group[1]);
    if (passes) passes.push(lesson.id);
    else gruppass.set(group[1], [lesson.id]);
  }
  for (const group of forslag.resurser.grupp) {
    const key = `grupp:${group.ref}`, old = resurser.get(key);
    const lessons = [...new Set([...(old?.lessons ?? []), ...(gruppass.get(group.ref) ?? [])])];
    resurser.set(key, { key, id: old?.id ?? group.ref, slag: 'grupp', name: group.name, lessons, busyLessons: lessons, size: null, antagen: false, year: null });
  }
  for (const resource of medlemskap) resurser.set(resource.key, resource);
  return [...resurser.values()];
}

function bokning(lesson: SchemaForslagLesson, length: number, key = lesson.id, flyttadFran?: string): Bokning[] {
  if (lesson.startMin === null || length <= 0) return [];
  return [{ key, lesson, start: lesson.startMin, end: lesson.startMin + length, flyttadFran }];
}

function jamforBokningar(forslag: SchemaForslag, lesson: SchemaForslagLesson, overrides: SchemaDatumAndring[], term: SchemaTerm, occurrence?: SchemaDatumTillfalle) {
  if (occurrence) {
    try {
      const { date } = occurrence;
      const tillfallen = schemaDatumTillfallen(forslag, { mode: 'intervall', monday: '', from: date, to: date }, overrides);
      const bokningar = tillfallen.flatMap(o => bokning(o.lesson, o.length, o.key, o.originalDate === o.date ? undefined : o.originalDate));
      return { bokningar, valt: bokningar.find(b => b.key === occurrence.key) ?? null };
    } catch { return { bokningar: [], valt: null }; }
  }
  if (lesson.day === null) return { bokningar: [], valt: null };
  const kortningar = new Map(forslag.trims.filter(t => t.term === term).map(t => [t.lesson, t.fixedMin]));
  const bokningar = forslag.lessons.filter(l => l.day === lesson.day && (l.term === null || l.term === term))
    .flatMap(l => bokning(l, l.durationMin - (kortningar.get(l.id) ?? 0)))
    .sort((a, b) => a.start - b.start || a.end - b.end);
  return { bokningar, valt: bokningar.find(b => b.key === lesson.id) ?? null };
}

export function JamforResurser(props: Props) {
  const { unitId, schoolYear, period, grundFingerprint } = props.forslag;
  return <JamforInnehall key={`${unitId}:${schoolYear}:${period}:${grundFingerprint}:${props.lesson.id}:${props.occurrence?.key ?? ''}`} {...props}/>;
}

function JamforInnehall({ forslag, lesson, occurrence, overrides, term, groupRequest, active, onSessionLost }: Props) {
  const heading = useId(), search = useRef<HTMLDivElement>(null);
  const [urval, setUrval] = useState<Record<string, boolean>>({});
  const [gruppunderlag, setGruppunderlag] = useState<Gruppunderlag | null>(null);
  const harGrupper = forslag.resurser.grupp.length > 0;
  const kanLasaGrupper = harGrupper && !!groupRequest && groupRequest.unitId === forslag.unitId && groupRequest.schoolYear === forslag.schoolYear
    && groupRequest.period === forslag.period && groupRequest.grundFingerprint === forslag.grundFingerprint;
  const lasGrupper = useEffectEvent((signal: AbortSignal) => {
    if (!groupRequest) return;
    void api.post<unknown>('/api/schema/samling', groupRequest, signal).then(raw => {
      if (signal.aborted) return;
      const { resources } = parseSamlingData(raw, forslag);
      setGruppunderlag({ status: 'last', resources: resources.filter(r => r.slag === 'klass' || r.slag === 'grupp') });
    }).catch((error: unknown) => {
      if (signal.aborted) return;
      if (error instanceof ApiError && error.status === 401) onSessionLost();
      else setGruppunderlag({ status: 'fel' });
    });
  });
  useEffect(() => {
    if (!active || !kanLasaGrupper || gruppunderlag) return;
    const controller = new AbortController();
    lasGrupper(controller.signal);
    return () => controller.abort();
  }, [active, kanLasaGrupper, gruppunderlag]);
  const giltigtGruppunderlag = kanLasaGrupper && gruppunderlag?.status === 'last' ? gruppunderlag : null;
  const resurser = useMemo(() => resurserForJamforelse(forslag, giltigtGruppunderlag?.resources ?? []), [forslag, giltigtGruppunderlag]);
  const lastaResurser = new Set(giltigtGruppunderlag?.resources.map(r => r.key));
  const visadTerm = lesson.term ?? (forslag.period === 'lasar' ? term : forslag.period);
  const { bokningar, valt } = useMemo(() => jamforBokningar(forslag, lesson, overrides, visadTerm, occurrence), [forslag, lesson, occurrence, overrides, visadTerm]);
  const valtPass = valt?.lesson ?? occurrence?.lesson ?? lesson;
  const rader = resurser.filter(r => urval[r.key] ?? (r.slag === 'sal' ? r.id === valtPass.roomId : r.lessons.includes(valtPass.id)));
  const overlagg = valt ? bokningar.filter(b => b.start < valt.end && valt.start < b.end) : [];
  const tid = (start: number, end: number) => `${clock(start)}–${clock(end)}`;
  const visaDag = occurrence ? schemaDayHeading(occurrence.date) : lesson.day === null ? '' : dayName(lesson.day);
  return <section className="schema-list" aria-labelledby={heading}>
    <h2 id={heading}>Jämför resurser</h2>
    {valt ? <p>{visaDag} {tid(valt.start, valt.end)} · {occurrence ? 'Faktiskt tillfälle' : `Grundschema, ${TERM[visadTerm].toLocaleLowerCase('sv-SE')}`}</p>
      : <p className="schema-note">{occurrence ? 'Tillfällets beläggning kunde inte visas för det här datumet.' : lesson.startMin === null
        ? 'Passet saknar tid. Beläggningen kan jämföras när passet har fått en tid.' : 'Passets beläggning kunde inte visas för den här terminen.'}</p>}
    <div ref={search} className="folj-chips"><SamlingSok resources={resurser} selected={rader.map(r => r.key)} allowStudents={false} onAdd={key => setUrval(old => ({ ...old, [key]: true }))}/></div>
    {harGrupper && !giltigtGruppunderlag && <div className="flex flex-wrap items-center gap-2">
      <p className="schema-note" aria-live="polite">{kanLasaGrupper && !gruppunderlag ? 'Läser elevkopplingar för klasser och grupper…' : 'Elevkopplingar saknas i jämförelsen. De kopplade passen som finns i utkastet visas.'}</p>
      {kanLasaGrupper && gruppunderlag?.status === 'fel' && <Button type="button" variant="outline" onClick={() => setGruppunderlag(null)}>Läs elevkopplingar igen</Button>}
    </div>}
    {rader.length ? <ul className="list-none divide-y divide-border pl-0!" aria-label="Jämförda resurser">
      {rader.map(r => {
        // Faktiska tillfällen kan ha en annan sal eller termin än grundpasset.
        const ids = r.slag === 'sal' ? null : new Set(occurrence ? r.lessons : samlingPass(r, forslag.lessons, visadTerm).map(l => l.id));
        const elevresurs = r.slag === 'klass' || r.slag === 'grupp', last = lastaResurser.has(r.key);
        const tillhorResurs = (b: Bokning) => ids ? ids.has(b.lesson.id) : b.lesson.roomId === r.id;
        const indirekta = new Set(last ? r.busyLessons : []);
        const onRaden = (b: Bokning) => tillhorResurs(b) || indirekta.has(b.lesson.id);
        const eget = !!valt && tillhorResurs(valt), delarValt = !!valt && !eget && indirekta.has(valt.lesson.id);
        const andra = overlagg.filter(b => b.key !== valt?.key && onRaden(b));
        const belaggningOfullstandig = harGrupper && elevresurs && !last;
        return <li key={r.key} className="grid min-w-0 gap-2 py-2">
          <div className="flex min-w-0 flex-wrap items-center justify-between gap-1">
            <p className="min-w-0 break-words"><strong>{r.name}</strong> <span className="schema-note">· {SAMLING_NAMN[r.slag]}</span></p>
            <Button type="button" variant="ghost" size="icon" aria-label={`Ta bort ${SAMLING_NAMN[r.slag].toLocaleLowerCase('sv-SE')} ${r.name} från jämförelsen`}
              onClick={() => { setUrval(old => ({ ...old, [r.key]: false })); search.current?.querySelector('input')?.focus(); }}><XIcon aria-hidden="true"/></Button>
          </div>
          {valt && <div className="grid gap-1">
            {eget && <p><span className="status-badge">Valt pass</span></p>}
            {delarValt && <p className="schema-note">Kan dela elever med valt pass</p>}
            {last && r.antagen && <p className="schema-note">Antagna elevkopplingar</p>}
            {andra.length ? <><p><span className="status-badge warning">{andra.length === 1 ? '1 överlappande pass' : `${andra.length} överlappande pass`}</span></p>
              <ul className="schema-note">{andra.map(b => <li key={b.key}>{tid(b.start, b.end)} · {b.lesson.title}{!tillhorResurs(b) && ' · Kan dela elever'}{b.flyttadFran && ` · Flyttat från ${schemaDayHeading(b.flyttadFran).toLocaleLowerCase('sv-SE')}`}</li>)}</ul></>
              : <p className="schema-note">{belaggningOfullstandig ? 'Elevöverlapp ej bedömt' : eget ? 'Inga andra överlappande pass' : 'Inga överlappande pass i visningen'}</p>}
          </div>}
        </li>;
      })}
    </ul> : <p className="empty-state">Lägg till en klass, grupp, lärare eller sal för att jämföra.</p>}
    {valt && <p className="schema-note">Jämförelsen visar passens tider. {occurrence && giltigtGruppunderlag && 'Elevkopplingar i jämförelsen gäller schemats grund. '}Den ordinarie kontrollen prövar elevöverlapp, marginaler och tillåtna tider.</p>}
  </section>;
}
