'use client';
// Villkoren för schemat (05.2-SM-LASAR-VILLKOR) och egna villkor per resurs (05.2-SM-VILLKOR-PER-RESURS). Flyttat oförändrat från arbetsytan av 05.2-SM-YTA.
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SCHEMA_REGEL_SLAG, SCHEMA_REGEL_TYPER, SCHEMA_VILLKOR_LIMITS, defaultSchemaVillkor, parseSchemaVillkor, type SchemaRegel, type SchemaRegelSlag, type SchemaRegelTyp, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { DAYS, REGEL, SAME_DAY, SLAG, clock, daysText, hoursText, minutesOf, ruleText, steps, type Resurser } from './delat.ts';

/** Senast använda villkor för skolan, i den här webbläsaren. Egna villkor bär appens ID för klass, grupp och lärare, aldrig namn; ämnen och salar står med namn. Inget annat lagras. */
const villkorKey = (unitId: string) => `schema-villkor:${unitId}`;
export function storedVillkor(unitId: string): SchemaVillkor | null {
  try {
    const raw = window.localStorage.getItem(villkorKey(unitId)), value = raw === null ? null : JSON.parse(raw) as Record<string, unknown> | null;
    if (value === null || typeof value !== 'object') return null;
    // Villkor sparade före egna villkor får tomma listor. Valet av egna pass per termin finns inte längre (05.2-SM-TIMPLAN-EXAKT, E5).
    const rest = Object.fromEntries(Object.entries(value).filter(([key]) => key !== 'termDiffPct'));
    return parseSchemaVillkor('egna' in rest ? rest : { ...rest, salar: [], egna: [] });
  } catch { return null; }
}

export function rememberVillkor(unitId: string, villkor: SchemaVillkor): void {
  try { window.localStorage.setItem(villkorKey(unitId), JSON.stringify(villkor)); } catch { /* utan lagring gäller villkoren bara tills sidan lämnas */ }
}

/** Villkoren för schemat (05.2-SM-LASAR-VILLKOR, V2). Värdena prövas här och igen på servern. */
export function Villkor({ value: v, disabled, issues, resurser, onChange }: { value: SchemaVillkor; disabled: boolean; issues: string[]; resurser: Resurser | null; onChange: (next: SchemaVillkor) => void }) {
  const L = SCHEMA_VILLKOR_LIMITS, set = (patch: Partial<SchemaVillkor>) => onChange({ ...v, ...patch });
  const time = (label: string, minutes: number, change: (minutes: number) => void, hidden = false) => <label className={hidden ? 'schema-time bare' : 'schema-time'}><span className={hidden ? 'sr-only' : undefined}>{label}</span>
    <input type="time" step={300} required disabled={disabled} value={clock(minutes)} onChange={e => { const next = minutesOf(e.target.value); if (next !== null) change(next); }}/></label>;
  const choice = (label: string, current: number | null, options: number[], change: (next: number | null) => void, text: (n: number) => string, none?: string) => <label>{label}
    <select disabled={disabled} value={current ?? ''} onChange={e => change(e.target.value === '' ? null : Number(e.target.value))}>
      {none !== undefined && <option value="">{none}</option>}{options.map(n => <option key={n} value={n}>{text(n)}</option>)}</select></label>;
  const min = (n: number) => `${n} min`, day = (i: number, patch: Partial<SchemaVillkor['days'][number]>) => set({ days: v.days.map((x, at) => at === i ? { ...x, ...patch } : x) });
  const lunch = v.lunch ?? defaultSchemaVillkor().lunch!, late = v.lateAfterMin ?? defaultSchemaVillkor().lateAfterMin!;
  const changed = JSON.stringify(v) !== JSON.stringify(defaultSchemaVillkor());
  return <details className="schema-list schema-villkor schema-wide">
    <summary><h2>Villkor för schemat</h2><span className="schema-note">{changed ? 'Ändrade' : 'Förval'}: skoldag {daysText(v.days)}, pass högst {v.maxLessonMin} min, {v.lunch ? `lunch ${v.lunch.lengthMin} min` : 'ingen lunch'}{v.egna.length > 0 && `, ${v.egna.length} egna villkor`}.</span></summary>
    <p className="schema-note">Villkoren gäller nästa förslag. De sparas inte i systemet; den här webbläsaren minns dem för skolan när ett förslag har tagits fram.</p>
    {issues.length > 0 && <div className="valplan-alert" role="alert"><p>Rätta villkoren för att kunna ta fram ett förslag:</p><ul>{issues.map(x => <li key={x}>{x}</li>)}</ul></div>}
    <div className="schema-villkor-groups">
      <fieldset disabled={disabled}><legend>Skoldag</legend>
        {v.days.map((x, i) => <div className="schema-villkor-day" key={i}><span>{DAYS[i]}</span>
          {time(`${DAYS[i]} börjar`, x.startMin, startMin => day(i, { startMin }), true)}{time(`${DAYS[i]} slutar`, x.endMin, endMin => day(i, { endMin }), true)}</div>)}
        <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => set({ days: v.days.map(() => ({ ...v.days[0] })) })}>Samma tider som måndag alla dagar</Button>
      </fieldset>
      <fieldset disabled={disabled}><legend>Pass och raster</legend>
        {choice('Längsta pass', v.maxLessonMin, steps(L.maxLesson[0], L.maxLesson[1], 5, v.maxLessonMin), n => set({ maxLessonMin: n ?? v.maxLessonMin }), min)}
        {choice('Kortaste pass', v.minLessonMin, steps(L.minLesson, Math.max(L.minLesson, Math.floor(v.maxLessonMin / 10) * 5), 5, v.minLessonMin), n => set({ minLessonMin: n ?? v.minLessonMin }), min)}
        {choice('Rast mellan pass', v.breakMin, steps(L.breakMin[0], L.breakMin[1], 5, v.breakMin), n => set({ breakMin: n ?? v.breakMin }), min)}
        {choice('Pass får börja', v.startGridMin, [...L.startGrid], n => set({ startGridMin: n ?? v.startGridMin }), n => `var ${n}:e minut`)}
        <label>Samma ämne flera gånger samma dag<select disabled={disabled} value={v.sameDay} onChange={e => set({ sameDay: e.target.value as SchemaVillkor['sameDay'] })}>
          {(['avoid', 'forbid', 'allow'] as const).map(x => <option key={x} value={x}>{SAME_DAY[x]}</option>)}</select></label>
      </fieldset>
      <fieldset disabled={disabled}><legend>Lunch</legend>
        <label className="schema-check"><input type="checkbox" checked={v.lunch !== null} onChange={e => set({ lunch: e.target.checked ? lunch : null })}/>Lägg in lunch varje dag</label>
        {v.lunch && <>
          {time('Lunch tidigast', lunch.startMin, startMin => set({ lunch: { ...lunch, startMin } }))}
          {time('Lunch slut senast', lunch.endMin, endMin => set({ lunch: { ...lunch, endMin } }))}
          {choice('Lunchens längd', lunch.lengthMin, steps(L.lunchLength[0], L.lunchLength[1], 5, lunch.lengthMin), n => set({ lunch: { ...lunch, lengthMin: n ?? lunch.lengthMin } }), min)}
          <label className="schema-check"><input type="checkbox" checked={lunch.teachers} onChange={e => set({ lunch: { ...lunch, teachers: e.target.checked } })}/>Lärare ska också få lunch</label></>}
      </fieldset>
      <fieldset disabled={disabled}><legend>Dagens längd</legend>
        <label className="schema-check"><input type="checkbox" checked={v.lateAfterMin !== null} onChange={e => set({ lateAfterMin: e.target.checked ? late : null })}/>Undvik sena pass</label>
        {v.lateAfterMin !== null && time('Sent räknas efter', late, lateAfterMin => set({ lateAfterMin }))}
        {choice('Högst undervisning per dag, elever', v.studentMaxMinPerDay, steps(L.perDay[0], L.perDay[1], 30, v.studentMaxMinPerDay), n => set({ studentMaxMinPerDay: n }), hoursText, 'Ingen gräns')}
        {choice('Högst undervisning per dag, lärare', v.teacherMaxMinPerDay, steps(L.perDay[0], L.perDay[1], 30, v.teacherMaxMinPerDay), n => set({ teacherMaxMinPerDay: n }), hoursText, 'Ingen gräns')}
      </fieldset>
      <Egna value={v} disabled={disabled} resurser={resurser} onChange={onChange}/>
    </div>
    <div><Button type="button" variant="outline" disabled={disabled || !changed} onClick={() => onChange(defaultSchemaVillkor())}>Återställ förval</Button></div>
  </details>;
}

/** Salar och egna villkor per klass, grupp, ämne, lärare och sal (05.2-SM-VILLKOR-PER-RESURS, R1–R6). */
function Egna({ value: v, disabled, resurser, onChange }: { value: SchemaVillkor; disabled: boolean; resurser: Resurser | null; onChange: (next: SchemaVillkor) => void }) {
  const L = SCHEMA_VILLKOR_LIMITS;
  const [sal, setSal] = useState('');
  const [draft, setDraft] = useState({ slag: 'klass' as SchemaRegelSlag, ref: '', typ: 'sparrad' as SchemaRegelTyp, days: [0, 1, 2, 3, 4], startMin: 480, endMin: 720, minutes: 15, maxMin: 60, count: 2, rooms: [] as string[] });
  const name = sal.trim(), canAddSal = name.length > 0 && name.length <= L.salNamn && v.salar.length < L.salar && !v.salar.some(x => x.toLowerCase() === name.toLowerCase());
  const addSal = () => { if (canAddSal) { onChange({ ...v, salar: [...v.salar, name] }); setSal(''); } };
  // En sal som tas bort tas också bort ur villkoren.
  const removeSal = (room: string) => onChange({ ...v, salar: v.salar.filter(x => x !== room),
    egna: v.egna.flatMap((r): SchemaRegel[] => r.slag === 'sal' && r.ref === room ? [] : !('rooms' in r) ? [r] : r.rooms.some(x => x !== room) ? [{ slag: r.slag, ref: r.ref, typ: 'sal', rooms: r.rooms.filter(x => x !== room) }] : []) });
  // Före första förslaget är bara salarna kända.
  const slagen = SCHEMA_REGEL_SLAG.filter(x => x === 'sal' ? v.salar.length > 0 : resurser !== null && resurser[x].length > 0);
  const slag = slagen.includes(draft.slag) ? draft.slag : slagen[0] ?? null;
  const choices = slag === null ? [] : slag === 'sal' ? v.salar.map(x => ({ ref: x, name: x })) : resurser?.[slag] ?? [];
  const ref = choices.some(c => c.ref === draft.ref) ? draft.ref : choices[0]?.ref ?? '';
  const types = slag === null ? [] : SCHEMA_REGEL_TYPER[slag].filter(t => t !== 'sal' || v.salar.length > 0), typ = types.includes(draft.typ) ? draft.typ : types[0];
  const rooms = draft.rooms.filter(x => v.salar.includes(x));
  const rule: SchemaRegel | null = slag === null || !ref || !typ ? null
    : typ === 'sparrad' || typ === 'tillaten' ? (draft.days.length > 0 && draft.startMin < draft.endMin ? { slag, ref, typ, days: [...draft.days].sort((a, b) => a - b), startMin: draft.startMin, endMin: draft.endMin } : null)
    : typ === 'marginal' ? { slag, ref, typ, minutes: draft.minutes } : typ === 'langd' ? { slag, ref, typ, maxMin: draft.maxMin } : typ === 'antal' ? { slag, ref, typ, count: draft.count }
    : rooms.length > 0 ? { slag, ref, typ, rooms } : null;
  const range = (from: number, to: number, step: number) => Array.from({ length: Math.floor((to - from) / step) + 1 }, (_, i) => from + i * step);
  const time = (label: string, minutes: number, change: (minutes: number) => void) => <label className="schema-time">{label}
    <input type="time" step={300} required value={clock(minutes)} onChange={e => { const next = minutesOf(e.target.value); if (next !== null) change(next); }}/></label>;
  const number = (label: string, current: number, options: number[], change: (n: number) => void, text: (n: number) => string) => <label>{label}
    <select value={current} onChange={e => change(Number(e.target.value))}>{options.map(n => <option key={n} value={n}>{text(n)}</option>)}</select></label>;
  return <>
    <fieldset disabled={disabled}><legend>Salar</legend>
      <p className="schema-note">Ange de salar som villkor ska kunna gälla, till exempel idrottshallen eller en labbsal. Pass utan salsvillkor läggs utan sal.</p>
      <label>Salens namn<input type="text" maxLength={L.salNamn} value={sal} onChange={e => setSal(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addSal(); } }}/></label>
      <div><Button type="button" variant="outline" size="sm" disabled={disabled || !canAddSal} onClick={addSal}>Lägg till sal</Button></div>
      {v.salar.length > 0 && <ul className="schema-egna" aria-label="Salar">{v.salar.map(x => <li key={x}><span>{x}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort sal ${x}`} onClick={() => removeSal(x)}>Ta bort</Button></li>)}</ul>}
    </fieldset>
    <fieldset disabled={disabled} className="schema-wide"><legend>Egna villkor</legend>
      <p className="schema-note">Ett eget villkor gäller en klass, en grupp, ett ämne, en lärare eller en sal. Villkoren styr när och var passen läggs och hur veckotiden delas i pass. Hur mycket undervisning som läggs bestäms alltid av timplanen.</p>
      {resurser === null && <p className="schema-note">Ta fram ett första förslag för att kunna välja klass, grupp, ämne och lärare.</p>}
      {slag !== null && <div className="schema-egna-form">
        <label>Gäller<select value={slag} onChange={e => setDraft({ ...draft, slag: e.target.value as SchemaRegelSlag, ref: '' })}>{slagen.map(x => <option key={x} value={x}>{SLAG[x]}</option>)}</select></label>
        <label>{SLAG[slag]}<select value={ref} onChange={e => setDraft({ ...draft, ref: e.target.value })}>{choices.map(c => <option key={c.ref} value={c.ref}>{c.name}</option>)}</select></label>
        <label>Villkor<select value={typ} onChange={e => setDraft({ ...draft, typ: e.target.value as SchemaRegelTyp })}>{types.map(t => <option key={t} value={t}>{REGEL[t]}</option>)}</select></label>
        {(typ === 'sparrad' || typ === 'tillaten') && <>
          <fieldset className="schema-days schema-wide"><legend className="sr-only">Veckodagar</legend>{DAYS.slice(0, 5).map((d, i) => <label key={d} className="schema-check">
            <input type="checkbox" checked={draft.days.includes(i)} onChange={e => setDraft({ ...draft, days: e.target.checked ? [...draft.days, i] : draft.days.filter(x => x !== i) })}/>{d}</label>)}</fieldset>
          {time('Från', draft.startMin, startMin => setDraft({ ...draft, startMin }))}{time('Till', draft.endMin, endMin => setDraft({ ...draft, endMin }))}</>}
        {typ === 'marginal' && number('Marginal', draft.minutes, range(L.marginal[0], L.marginal[1], 5), minutes => setDraft({ ...draft, minutes }), n => `${n} min`)}
        {typ === 'langd' && number('Längsta pass', draft.maxMin, range(L.maxLesson[0], L.maxLesson[1], 5), maxMin => setDraft({ ...draft, maxMin }), n => `${n} min`)}
        {typ === 'antal' && number('Pass per vecka', draft.count, range(L.antal[0], L.antal[1], 1), count => setDraft({ ...draft, count }), n => String(n))}
        {typ === 'sal' && <fieldset className="schema-days schema-wide"><legend className="sr-only">Salar för villkoret</legend>{v.salar.map(x => <label key={x} className="schema-check">
          <input type="checkbox" checked={rooms.includes(x)} onChange={e => setDraft({ ...draft, rooms: e.target.checked ? [...rooms, x] : rooms.filter(y => y !== x) })}/>{x}</label>)}</fieldset>}
        <div><Button type="button" variant="outline" disabled={disabled || rule === null || v.egna.length >= L.egna} onClick={() => { if (rule) onChange({ ...v, egna: [...v.egna, rule] }); }}>Lägg till villkor</Button></div>
      </div>}
      {v.egna.length > 0 && <ul className="schema-egna" aria-label="Egna villkor">{v.egna.map((r, i) => <li key={i}><span>{ruleText(r, resurser)}</span>
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort villkoret ${ruleText(r, resurser)}`} onClick={() => onChange({ ...v, egna: v.egna.filter((_, at) => at !== i) })}>Ta bort</Button></li>)}</ul>}
    </fieldset>
  </>;
}
