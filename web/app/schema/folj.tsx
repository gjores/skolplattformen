'use client';
// Följ passet (05.2-SM-FOLJ, design/Samlingsvy.dc.html): alla scheman ett pass berör, rad för rad med gemensam tidsaxel, och överst var passet kan ligga.
// Panelen följer markeringen tills den låses. Grupper, elevkluster och elevlistan kommer från servern (/api/schema/folj); lägena från /api/schema/lagen.
// Elevens schema ritas här ur utkastets placeringar. Inget sparas.
import { useEffect, useId, useRef, useState, type CSSProperties, type Ref } from 'react';
import { LockIcon, LockOpenIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { SCHEMA_CONTRACT_VERSION, villkorNyckel, type SchemaForslag, type SchemaForslagLesson, type SchemaPlacement, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { elevKrockar, foljRader, parseSchemaFolj, type SchemaFolj } from '@/lib/schema-folj.ts';
import { SCHEMA_LAGEN, parseSchemaLagen, type SchemaLagen, type SchemaLagenPosition } from '@/lib/schema-lagen.ts';
import { clock, dayName, names, ruleText } from './delat.ts';
import { passetsVillkor } from '@/lib/schema-utkast.ts';
import { LAGE, LAGE_KLASS, Mojligt } from './mojligt.tsx';
import { veckansSpann } from './vecka.tsx';
import { OppnaFonster } from './fonster';
import { SamlingRad } from './samling-rad.tsx';

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
  villkor: SchemaVillkor; userLocks?: SchemaPlacement[];
  locked: boolean; checking: boolean; headingRef: Ref<HTMLHeadingElement>;
  onLock: (locked: boolean) => void; onClose: () => void; onMove: (p: SchemaLagenPosition) => void; onSessionLost: () => void;
  onPick?: (lesson: string) => void;
  /** Terminen veckan visar; passets egen termin går före. */
  term: 'ht' | 'vt'; onOpen?: () => void; onSuggest?: () => void; onSwap?: () => void; intentional?: string[];
};

export function Folj({ forslag, lesson, placements, villkor, userLocks = [], locked, checking, headingRef, onLock, onClose, onMove, onSessionLost, onPick, term, onOpen, onSuggest, onSwap, intentional = [] }: Props) {
  const heading = useId(), pupilLabel = useId();
  const [pupil, setPupil] = useState<string | null>(null), [folj, setFolj] = useState<SchemaFolj | null>(null), [svar, setSvar] = useState<{ lagen: SchemaLagen; villkor: string } | null>(null);
  const [raknat, setRaknat] = useState<string | null>(null), [error, setError] = useState<string | null>(null);
  // Panelen får en ny nyckel för varje pass (schema-workspace.tsx), så att elevvalet och svaren börjar om: eleven kanske inte har det nya passet.
  const placed = useRef(placements), lost = useRef(onSessionLost), provade = useRef(villkor);
  useEffect(() => { placed.current = placements; lost.current = onSessionLost; provade.current = villkor; });
  const key = JSON.stringify(placements), lessonId = lesson.id, villkorKey = villkorNyckel(villkor), lockKey = JSON.stringify(userLocks);
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
      ...(lockKey !== '[]' ? { locks: { grundFingerprint, placements: JSON.parse(lockKey) as SchemaPlacement[] } } : {}),
      placements: JSON.parse(key) as SchemaPlacement[], lesson: lessonId, pupilId: pupil }, controller.signal)
      .then(value => { setSvar({ lagen: parseSchemaLagen(value, grundFingerprint, lessonId), villkor: villkorKey + lockKey }); setError(null); })
      .catch((caught: unknown) => {
        if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
        setSvar(null); setError(fel(caught));
      })
      .finally(() => { if (!controller.signal.aborted) setRaknat(key + (pupil ?? '') + villkorKey + lockKey); });
    return () => controller.abort();
  }, [contractVersion, unitId, schoolYear, period, villkorKey, grundFingerprint, lessonId, pupil, key, lockKey]);
  // Lägena räknas tills svaret för just dessa placeringar, den eleven och de villkoren har kommit. Ett svar för andra villkor visas inte.
  const loading = raknat !== key + (pupil ?? '') + villkorKey + lockKey, lagen = svar?.villkor === villkorKey + lockKey ? svar.lagen : null;

  const visas = (l: SchemaForslagLesson) => l.term === null || l.term === (lesson.term ?? term);
  const rader = foljRader(forslag, lesson.id, folj, visas);
  const krock = elevKrockar(rader);
  const { start, end } = veckansSpann(forslag.days);
  const elevNamn = pupil ? folj?.elever?.find(e => e.id === pupil)?.name : undefined;
  const kontext = { lessons: forslag.lessons, classes: forslag.classes, teachers: forslag.teachers, rooms: forslag.rooms, placements, ...(elevNamn ? { elev: elevNamn } : {}) };
  const klasser = names(lesson.classIds, forslag.classes);
  const elever = folj?.elever ?? null;
  // Ett valbart block kan ha en mycket lång titel med samtliga ämnen. Visa listan en gång på begäran, inte i varje resursrad.
  const valbartBlock = lesson.title.startsWith('Valbart block: '), kortTitel = valbartBlock ? 'Valbart block' : lesson.title;

  return <section className="folj" aria-labelledby={heading}>
    <div className="folj-huvud">
      <div>
        <p className="folj-overrad">Flera scheman samtidigt</p>
        <h2 id={heading} ref={headingRef} tabIndex={-1}>Följ passet: {kortTitel}{klasser ? `, ${klasser}` : ''}</h2>
        {valbartBlock && <details className="mt-2 text-sm">
          <summary className="min-h-(--control-height) cursor-pointer py-2 font-medium text-primary focus-visible:outline-3 focus-visible:outline-offset-4 focus-visible:outline-ring">Visa ämnen i blocket</summary>
          <p className="schema-note">{lesson.title.slice('Valbart block: '.length)}</p>
        </details>}
        <p className="schema-note">Alla scheman passet berör: klassen, läraren, salen och elever som delar grupp. Översta raden visar var passet kan ligga i veckan och varför inte.
          {locked ? ' Panelen är låst till passet.' : ' Panelen följer det markerade passet.'}</p>
      </div>
      <div className="folj-knappar">
        {onSuggest && <Button type="button" variant="outline" disabled={checking || lesson.locked} onClick={onSuggest}>Föreslå placering</Button>}
        {onSwap && <Button type="button" variant="outline" disabled={checking || lesson.locked || lesson.day === null} onClick={onSwap}>Byt med ett annat pass…</Button>}
        <OppnaFonster onOpen={onOpen} label="Följ passet"/>
        <Button type="button" variant={locked ? 'secondary' : 'outline'} aria-pressed={locked} onClick={() => onLock(!locked)}>
          {locked ? <LockIcon aria-hidden="true"/> : <LockOpenIcon aria-hidden="true"/>}Lås till detta pass</Button>
        <Button type="button" variant="outline" onClick={onClose}><XIcon aria-hidden="true"/>Stäng</Button>
      </div>
    </div>
    <div className="folj-chips"><span className="schema-note" id={`${heading}-visas`}>Visas:</span>
      <ul aria-labelledby={`${heading}-visas`}>{rader.map(r => <li key={r.key} className="folj-chip">{r.chip}</li>)}</ul></div>
    <details className="rounded-lg border border-border bg-card p-3" open>
      <summary className="cursor-pointer font-medium">Villkor för passet</summary>
      <p className="schema-note">Skolans ramar: {villkor.startGridMin} min mellan möjliga starter, {villkor.minLessonMin}–{villkor.maxLessonMin} min per lektion och {villkor.breakMin} min rast.</p>
      <p className="schema-note">{forslag.days.map((d, i) => `${dayName(i)} ${clock(d.startMin)}–${clock(d.endMin)}`).join(' · ')}</p>
      {passetsVillkor(forslag, villkor.egna, lesson).length ? <ul className="list-disc pl-5">{passetsVillkor(forslag, villkor.egna, lesson).map((r, i) => <li key={i}>{ruleText(r, forslag.resurser)}</li>)}</ul> : <p className="schema-note">Inga egna resursvillkor för passet.</p>}
      <p className="schema-note">Möjliga starttider tar också hänsyn till övriga pass, elevgrupper, salar och låsta placeringar.</p>
    </details>
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
      <Mojligt days={forslag.days} span={{ start, end }} step={forslag.startGridMin} lesson={lesson.id} title={kortTitel} lengthMin={lesson.durationMin}
        lagen={lagen} loading={loading} kontext={kontext} medSalregister={!!forslag.villkor.salregister} disabled={checking} onMove={onMove}/>
      {rader.map(r => <SamlingRad intentional={intentional} key={r.key} rad={r} days={forslag.days} start={start} followed={lesson.id} krock={krock.lessons} classes={forslag.classes} onPick={onPick}
        head={r.slag === 'larare' ? <><b>{r.name}</b><small>lärare</small></> : undefined} compact/>)}
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
