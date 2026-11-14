'use client';
// Följ passet (05.2-SM-FOLJ, design/Samlingsvy.dc.html): alla scheman ett pass berör, rad för rad med gemensam tidsaxel, och överst var passet kan ligga.
// Panelen följer markeringen tills den låses. Grupper, elevkluster och elevlistan kommer från servern (/api/schema/folj); lägena från /api/schema/lagen.
// Elevens schema ritas här ur utkastets placeringar. Inget sparas.
import { useEffect, useId, useRef, useState, type CSSProperties, type Ref } from 'react';
import { LockIcon, LockOpenIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { SCHEMA_CONTRACT_VERSION, villkorNyckel, type SchemaForslag, type SchemaForslagLesson, type SchemaPlacement, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { elevKrockar, foljRader, parseSchemaFolj, type FoljRad, type SchemaFolj } from '@/lib/schema-folj.ts';
import { SCHEMA_LAGEN, parseSchemaLagen, type SchemaLagen, type SchemaLagenPosition } from '@/lib/schema-lagen.ts';
import { clock, dayName, names } from './delat.ts';
import { LAGE, LAGE_KLASS, Mojligt } from './mojligt.tsx';
import { lanes, veckansSpann } from './vecka.tsx';

const FEL: Record<string, string> = {
  schema_underlag_changed: 'Underlaget eller villkoren som avgör vilka pass som finns har ändrats sedan förslaget togs fram. Ta fram ett nytt schemaförslag för att följa passet.',
  schema_pupil_not_in_lesson: 'Eleven har inte passet. Välj en annan elev.',
  schema_engine_unavailable: 'Schemamotorn kunde inte räkna möjliga starttider. Försök igen om en stund.',
};
function fel(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason && FEL[error.reason]) return FEL[error.reason];
    if (error.code === 'schema_engine_unavailable' || error.status === 503) return FEL.schema_engine_unavailable;
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
  }
  return 'Uppgifterna för passet kunde inte hämtas. Försök igen.';
}

type Props = {
  forslag: SchemaForslag; lesson: SchemaForslagLesson; placements: SchemaPlacement[];
  /** Villkoren lägena prövas mot: nuvarande villkor när grunden är förslagets, annars förslagets (05.2-SM-VILLKOR-DIREKT). */
  villkor: SchemaVillkor;
  locked: boolean; checking: boolean; headingRef: Ref<HTMLHeadingElement>;
  onLock: (locked: boolean) => void; onClose: () => void; onMove: (p: SchemaLagenPosition) => void; onSessionLost: () => void;
  /** Terminen veckan visar; passets egen termin går före. */
  term: 'ht' | 'vt';
};

export function Folj({ forslag, lesson, placements, villkor, locked, checking, headingRef, onLock, onClose, onMove, onSessionLost, term }: Props) {
  const heading = useId(), pupilLabel = useId();
  const [pupil, setPupil] = useState<string | null>(null), [folj, setFolj] = useState<SchemaFolj | null>(null), [svar, setSvar] = useState<{ lagen: SchemaLagen; villkor: string } | null>(null);
  const [raknat, setRaknat] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  // Panelen får en ny nyckel för varje pass (schema-workspace.tsx), så att elevvalet och svaren börjar om: eleven kanske inte har det nya passet.
  const placed = useRef(placements), lost = useRef(onSessionLost), provade = useRef(villkor);
  useEffect(() => { placed.current = placements; lost.current = onSessionLost; provade.current = villkor; });
  const key = JSON.stringify(placements), lessonId = lesson.id, villkorKey = villkorNyckel(villkor);
  const { unitId, schoolYear, period, grundFingerprint } = forslag, contractVersion = SCHEMA_CONTRACT_VERSION;
  // Grupper och elever: hämtas när passet eller eleven byts, och följer bara grunden. Avbryts om markeringen byts.
  useEffect(() => {
    const controller = new AbortController();
    api.post<unknown>('/api/schema/folj', { contractVersion, unitId, schoolYear, period, villkor: provade.current, grundFingerprint, placements: placed.current, lesson: lessonId, pupilId: pupil }, controller.signal)
      .then(value => { setFolj(parseSchemaFolj(value, grundFingerprint, lessonId)); })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
        setError(fel(caught));
      });
    return () => controller.abort();
  }, [contractVersion, unitId, schoolYear, period, grundFingerprint, lessonId, pupil]);
  // Lägen: hämtas om efter varje flytt (placeringarna), när villkoren ändras (en ny spärr prövas direkt) och när passet eller eleven byts.
  useEffect(() => {
    const controller = new AbortController();
    api.post<unknown>('/api/schema/lagen', { contractVersion, unitId, schoolYear, period, villkor: JSON.parse(villkorKey) as SchemaVillkor, grundFingerprint,
      placements: JSON.parse(key) as SchemaPlacement[], lesson: lessonId, pupilId: pupil }, controller.signal)
      .then(value => { setSvar({ lagen: parseSchemaLagen(value, grundFingerprint, lessonId), villkor: villkorKey }); setError(null); })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
        setSvar(null); setError(fel(caught));
      })
      .finally(() => { if (!controller.signal.aborted) setRaknat(key + (pupil ?? '') + villkorKey); });
    return () => controller.abort();
  }, [contractVersion, unitId, schoolYear, period, villkorKey, grundFingerprint, lessonId, pupil, key]);
  // Lägena räknas tills svaret för just dessa placeringar, den eleven och de villkoren har kommit. Ett svar för andra villkor visas inte.
  const loading = raknat !== key + (pupil ?? '') + villkorKey, lagen = svar?.villkor === villkorKey ? svar.lagen : null;

  const visas = (l: SchemaForslagLesson) => l.term === null || l.term === (lesson.term ?? term);
  const rader = foljRader(forslag, lesson.id, folj, visas);
  const krock = elevKrockar(rader);
  const { start, end } = veckansSpann(forslag.days);
  const elevNamn = pupil ? folj?.elever?.find(e => e.id === pupil)?.name : undefined;
  const kontext = { lessons: forslag.lessons, classes: forslag.classes, teachers: forslag.teachers, rooms: forslag.rooms, placements, ...(elevNamn ? { elev: elevNamn } : {}) };
  const klasser = names(lesson.classIds, forslag.classes);
  const elever = folj?.elever ?? null;

  return <section className="folj" aria-labelledby={heading}>
    <div className="folj-huvud">
      <div>
        <p className="folj-overrad">Flera scheman samtidigt</p>
        <h2 id={heading} ref={headingRef} tabIndex={-1}>Följ passet: {lesson.title}{klasser ? `, ${klasser}` : ''}</h2>
        <p className="schema-note">Alla scheman passet berör: klassen, läraren, salen och elever som delar grupp. Översta raden visar var passet kan ligga i veckan och varför inte.
          {locked ? ' Panelen är låst till passet.' : ' Panelen följer det markerade passet.'}</p>
      </div>
      <div className="folj-knappar">
        <Button type="button" variant={locked ? 'secondary' : 'outline'} aria-pressed={locked} onClick={() => onLock(!locked)}>
          {locked ? <LockIcon aria-hidden="true"/> : <LockOpenIcon aria-hidden="true"/>}Lås till detta pass</Button>
        <Button type="button" variant="outline" onClick={onClose}><XIcon aria-hidden="true"/>Stäng</Button>
      </div>
    </div>
    <div className="folj-chips"><span className="schema-note" id={`${heading}-visas`}>Visas:</span>
      <ul aria-labelledby={`${heading}-visas`}>{rader.map(r => <li key={r.key} className="folj-chip">{r.chip}</li>)}</ul></div>
    <div className="folj-for">
      {elever && elever.length > 0
        ? <label htmlFor={pupilLabel}>Möjliga starttider räknas för</label>
        : <span>Möjliga starttider räknas för</span>}
      {elever && elever.length > 0
        ? <select id={pupilLabel} value={pupil ?? ''} onChange={e => setPupil(e.target.value || null)}>
          <option value="">Alla berörda elever</option>{elever.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
        : <span className="folj-alla">Alla berörda elever</span>}
      <span className="schema-note">På individnivå syns elevens eget schema ur klass och grupper, och krockar för just den eleven. Elevens namn visas bara för den som har behörighet.</span>
    </div>
    {error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}
    <output aria-live="polite" className="sr-only">{loading ? 'Räknar möjliga starttider.' : lagen ? `${lagen.positions.filter(p => p.state === 'fri').length} fria starttider${elevNamn ? ` för ${elevNamn}` : ''}.` : ''}</output>

    <div className="folj-rutnat" style={{ '--span': end - start, '--first-hour': Math.ceil(start / 60) * 60 - start, '--days': forslag.days.length } as CSSProperties}>
      <div className="folj-rad folj-dagar" aria-hidden="true"><div/>{forslag.days.map((_, d) => <div key={d}>{dayName(d)}</div>)}</div>
      <Mojligt days={forslag.days} span={{ start, end }} step={forslag.startGridMin} lesson={lesson.id} title={lesson.title} lengthMin={lesson.durationMin}
        lagen={lagen} loading={loading} kontext={kontext} disabled={checking} onMove={onMove}/>
      {rader.map(r => <Rad key={r.key} rad={r} days={forslag.days} start={start} followed={lesson.id} krock={krock.lessons} classes={forslag.classes}/>)}
    </div>
    {krock.texter.length > 0 && <div className="folj-krock">{krock.texter.map(t => <p key={t}>{t}</p>)}</div>}
    {rader.some(r => r.slag === 'elev') && <p className="schema-note">Elevens pass kommer ur klassen och elevens grupper; streckad kant = gruppens pass.</p>}

    <ul className="schema-legend" aria-label="Teckenförklaring för Följ passet">
      {SCHEMA_LAGEN.map(s => <li key={s}><span className={`schema-sw ${LAGE_KLASS[s]}`} aria-hidden="true"/>{LAGE[s]}</li>)}
      <li><span className="schema-sw schema-sw-pass picked" aria-hidden="true"/>Passet som följs</li>
      {rader.some(r => r.slag === 'elev') && <li><span className="schema-sw folj-sw-grupp" aria-hidden="true"/>Gruppens pass i elevens schema</li>}
      {krock.lessons.size > 0 && <li><span className="schema-sw falt-brott" aria-hidden="true"/>Krock för eleven</li>}
    </ul>
  </section>;
}

/** Kort namn i passrutan, som designvyns "Ma", "Sv": två första bokstäverna. Hela namnet står i skärmläsartexten och i title. */
const kort = (title: string) => title.slice(0, 2);
/** "Klass 1, Klass 2" → "K1, K2". */
const kortKlass = (text: string) => text.replace(/\bKlass (\d+)/gu, 'K$1');

function Rad({ rad, days, start, followed, krock, classes }: { rad: FoljRad; days: SchemaForslag['days']; start: number; followed: string; krock: Set<string>; classes: SchemaForslag['classes'] }) {
  const visaKlass = rad.slag === 'larare' || rad.slag === 'sal';
  return <div className={`folj-rad folj-${rad.slag}`}>
    <div className="folj-namn"><b>{rad.name}</b><small>{rad.detail}</small></div>
    {days.map((_, day) => {
      const own = rad.lessons.filter(l => l.day === day).sort((a, b) => a.startMin! - b.startMin! || a.id.localeCompare(b.id)), lane = lanes(own);
      return <ul key={day} className="folj-dag" aria-label={`${rad.name}, ${dayName(day)}`}>
        {own.map(l => {
          const place = lane.get(l.id)!, mark = [l.id === followed ? 'passet som följs' : '', rad.fromGroup?.has(l.id) ? 'gruppens pass' : '', krock.has(l.id) && rad.slag === 'elev' ? 'krock för eleven' : ''].filter(Boolean);
          const extra = visaKlass ? names(l.classIds, classes) : '';
          return <li key={l.id} title={`${l.title}${extra ? `, ${extra}` : ''}, ${clock(l.startMin!)}–${clock(l.startMin! + l.durationMin)}`}
            className={`folj-pass${l.id === followed ? ' vald' : ''}${rad.fromGroup?.has(l.id) ? ' grupp' : ''}${krock.has(l.id) && rad.slag === 'elev' ? ' krock' : ''}`}
            style={{ '--at': l.startMin! - start, '--length': l.durationMin, '--lane': place.lane, '--lanes': place.lanes } as CSSProperties}>
            <span aria-hidden="true">{kort(l.title)}{extra ? ` ${kortKlass(extra)}` : ''}</span>
            <span className="sr-only">{l.title}{extra ? `, ${extra}` : ''}, {clock(l.startMin!)}–{clock(l.startMin! + l.durationMin)}{mark.length ? ` (${mark.join(', ')})` : ''}</span></li>;
        })}
      </ul>;
    })}
  </div>;
}
