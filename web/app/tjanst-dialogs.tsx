'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TJANST_SPECIAL_KINDS, type TjanstJoint, type TjanstPerson, type TjanstPlanRead, type TjanstRow, type TjanstSpecial, type TjanstSpecialKind } from '@/lib/tjanst-contract.ts';
import { prefill } from '@/lib/tjanst-model.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from './mfa-step-up';
import { coverageText, rowTime, type TjanstCellTarget, type TjanstNeedEntry } from './tjanst-matrix';
import { formatDeviation, formatTime, SPECIAL_KIND_LABEL, yearLabel } from './tjanst-service-summary';

/**
 * Redigeringsdialoger. Inmatningen ligger i dialogens yttre komponent och bevaras vid serverfel och när
 * dialogen tillfälligt döljs på smal skärm (D-15). Stängning är spärrad bara medan sparningen pågår.
 */
export type TjanstFailure = { ok: false; error: string; code?: string; correlationId?: string | null; mfa?: string; refresh?: () => void };
export type TjanstOutcome = { ok: true } | TjanstFailure;
type Base = { open: boolean; checking: boolean; onClose: () => void };

/** Timmar med decimalkomma lagras som hela minuter. Tomt fält är 0. */
export function parseHours(value: string): { minutes: number } | { error: string } {
  const text = value.trim().replace(/\s/gu, '');
  if (text === '') return { minutes: 0 };
  if (/^[−-]\d/u.test(text)) return { error: 'Tiden kan inte vara negativ.' };
  if (!/^\d{1,4}(?:[.,]\d{1,2})?$/u.test(text)) return { error: 'Ange tid i timmar, till exempel 40 eller 37,5.' };
  const minutes = Math.round(Number(text.replace(',', '.')) * 60);
  return minutes > 200000 ? { error: 'Ange tid i timmar, till exempel 40 eller 37,5.' } : { minutes };
}
export const hoursInput = (minutes: number | null) => minutes === null ? '' : (minutes / 60).toLocaleString('sv-SE', { maximumFractionDigits: 2, useGrouping: false });

export function Field({ id, label, error, help, children }: { id: string; label: string; error?: string; help?: string; children: ReactNode }) {
  return <div className="tjanst-field"><label htmlFor={id}>{label}</label>{children}{help && <small id={`${id}-help`}>{help}</small>}{error && <small id={`${id}-error`} className="field-error">{error}</small>}</div>;
}
export const described = (id: string, error?: string, help?: string) => ({ id, ...(error ? { 'aria-invalid': true as const } : {}),
  ...(error || help ? { 'aria-describedby': [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') } : {}) });

/** Återkomst efter engångskoden: samma vy (vy, tjvy och termin i adressen). Skola och läsår återställs av planeringsvalet. */
export const hereForStepUp = () => typeof window === 'undefined' ? '/' : window.location.pathname + window.location.search;
export function Problems({ failure, summary, checking }: { failure: TjanstFailure | null; summary: boolean; checking: boolean }) {
  return <>
    {checking && <output className="admin-notice">Svaret uteblev. Vi kontrollerar om ändringen sparades.</output>}
    {summary && <p role="alert" className="validation-warning">Formuläret innehåller fel. Rätta de markerade fälten.</p>}
    {failure?.mfa && <MfaStepUpNotice message={failure.mfa} detail="Efter verifieringen kommer du tillbaka till vyn och gör om ändringen." returnTo={hereForStepUp()}/>}
    {failure && !failure.mfa && <div role="alert" className="validation-warning"><p>{failure.error}</p>{failure.correlationId && <p>Referens: {failure.correlationId}</p>}
      {failure.refresh && <Button type="button" variant="outline" onClick={failure.refresh}>Hämta aktuellt läge</Button>}</div>}
  </>;
}
export function Shell({ open, busy, title, description, onClose, children }: { open: boolean; busy: boolean; title: string; description: ReactNode; onClose: () => void; children: ReactNode }) {
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="mandate-dialog tjanst-dialog sm:max-w-xl" showCloseButton={false}>
      <DialogTitle>{title}</DialogTitle><DialogDescription>{description}</DialogDescription>{children}
    </DialogContent>
  </Dialog>;
}
export function useSubmit(onSaved: () => void) {
  const [busy, setBusy] = useState(false), [failure, setFailure] = useState<TjanstFailure | null>(null), active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  async function run(task: () => Promise<TjanstOutcome>) {
    if (busy) return;
    setBusy(true); setFailure(null);
    try { const outcome = await task(); if (!active.current) return; if (outcome.ok) onSaved(); else setFailure(outcome); }
    finally { if (active.current) setBusy(false); }
  }
  return { busy, failure, run, setFailure };
}
const teacherName = (data: TjanstPlanRead, personId: string | null) => personId === null ? 'Vakant' : data.teachers.find(t => t.personId === personId)?.displayName ?? 'Okänd lärare';

export type TjanstRowDraft = { personId: string | null; teacherHt: number; teacherVt: number; comment: string };
type RowProps = Base & { data: TjanstPlanRead; entry: TjanstNeedEntry; target: TjanstCellTarget; chooseTeacher: boolean;
  onSave: (draft: TjanstRowDraft) => Promise<TjanstOutcome>; onDelete: (row: TjanstRow) => void };
/** Dialogen Tjänsterad: behov med källa, redan fördelat till andra och förifylld lärartid (D-06, D-07, D-08). */
export function TjanstRowDialog({ open, checking, onClose, data, entry, target, chooseTeacher, onSave, onDelete }: RowProps) {
  const id = useId(), row = target.rowId ? data.rows.find(r => r.id === target.rowId) ?? null : null;
  const own = row ? rowTime(row, data.joints) : { ht: 0, vt: 0 };
  const others = { ht: entry.cov.covered.ht - (row && row.personId !== null ? own.ht : 0), vt: entry.cov.covered.vt - (row && row.personId !== null ? own.vt : 0) };
  const [person, setPerson] = useState<string>(target.personId ?? (chooseTeacher ? '' : 'vakant'));
  const [ht, setHt] = useState(() => hoursInput(row ? row.teacherHt : prefill(entry.need.needHt, others.ht)));
  const [vt, setVt] = useState(() => hoursInput(row ? row.teacherVt : prefill(entry.need.needVt, others.vt)));
  const [comment, setComment] = useState(row?.comment ?? ''), [errors, setErrors] = useState<Record<string, string>>({});
  const [initial] = useState({ ht, vt, comment, person });
  const { busy, failure, run } = useSubmit(onClose);
  // Registreras också när dialogen är dold på smal skärm: inmatningen finns kvar och skyddas (D-15).
  useUnsavedChanges(`tjanst-row-dialog:${target.sourceKey}`, ht !== initial.ht || vt !== initial.vt || comment !== initial.comment || person !== initial.person);
  const h = parseHours(ht), v = parseHours(vt);
  const live = (parsed: ReturnType<typeof parseHours>, need: number | null, other: number) => 'minutes' in parsed && need !== null ? formatDeviation(other + parsed.minutes - need) || 'ingen' : null;
  const devHt = live(h, entry.need.needHt, others.ht), devVt = live(v, entry.need.needVt, others.vt);
  const link = entry.cls.link!;
  function submit() {
    const next: Record<string, string> = {};
    if (chooseTeacher && person === '') next.person = 'Välj lärare.';
    if ('error' in h) next.ht = h.error;
    if ('error' in v) next.vt = v.error;
    if ('minutes' in h && 'minutes' in v && h.minutes === 0 && v.minutes === 0) next.ht = 'Ange tid för minst en termin.';
    if (comment.length > 2000) next.comment = 'Kommentaren får vara högst 2 000 tecken.';
    setErrors(next);
    if (Object.keys(next).length || !('minutes' in h) || !('minutes' in v)) return;
    void run(() => onSave({ personId: person === 'vakant' || person === '' ? null : person, teacherHt: h.minutes, teacherVt: v.minutes, comment: comment.trim() }));
  }
  const free = data.teachers.filter(t => t.personId === target.personId || !entry.rows.some(r => r.personId === t.personId));
  return <Shell open={open} busy={busy} onClose={onClose} title={row ? 'Ändra tjänsteraden' : 'Ny tjänsterad'}
    description={<>{teacherName(data, chooseTeacher ? (person === 'vakant' || person === '' ? null : person) : target.personId)} · {entry.need.label} · {entry.cls.name}</>}>
    <dl className="mandate-facts tjanst-facts">
      <div><dt>Behov enligt timplanen</dt><dd>HT {entry.need.needHt === null ? 'okänt' : formatTime(entry.need.needHt)} · VT {entry.need.needVt === null ? 'okänt' : formatTime(entry.need.needVt)}<small>Källa: {link.seriesName} version {link.timplanVersion}, ämnesrad {entry.need.label}{entry.need.needBasis === 'even_split' ? ', årets tid delad lika på HT och VT' : ''}</small></dd></div>
      <div><dt>Redan fördelat till andra</dt><dd>HT {formatTime(others.ht)} · VT {formatTime(others.vt)}</dd></div>
      <div><dt>Schemalagd tid</dt><dd>Underlag saknas<small>Visas när schemat finns i Skolplattformen.</small></dd></div>
    </dl>
    <Problems failure={failure} checking={checking} summary={Object.keys(errors).length > 0}/>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={busy}>
        {chooseTeacher && <Field id={`${id}-person`} label="Lärare" error={errors.person}><select {...described(`${id}-person`, errors.person)} value={person} onChange={e => setPerson(e.target.value)}>
          <option value="">Välj lärare</option>{free.map(t => <option key={t.personId} value={t.personId}>{t.displayName}</option>)}<option value="vakant">Vakant</option></select></Field>}
        <Field id={`${id}-ht`} label="Lärartid HT (timmar)" error={errors.ht} help={'error' in h ? undefined : devHt === null ? 'Behovet för HT är okänt.' : `Avvikelse HT: ${devHt}`}>
          <input {...described(`${id}-ht`, errors.ht, 'error' in h ? undefined : 'help')} inputMode="decimal" autoComplete="off" value={ht} onChange={e => setHt(e.target.value)}/></Field>
        <Field id={`${id}-vt`} label="Lärartid VT (timmar)" error={errors.vt} help={'error' in v ? undefined : devVt === null ? 'Behovet för VT är okänt.' : `Avvikelse VT: ${devVt}`}>
          <input {...described(`${id}-vt`, errors.vt, 'error' in v ? undefined : 'help')} inputMode="decimal" autoComplete="off" value={vt} onChange={e => setVt(e.target.value)}/></Field>
        <Field id={`${id}-comment`} label="Kommentar (valfri)" error={errors.comment}><textarea {...described(`${id}-comment`, errors.comment)} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></Field>
      </fieldset>
      <div className="mandate-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Spara tjänsteraden'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
        {row && <Button type="button" variant="outline" disabled={busy} onClick={() => onDelete(row)}>Ta bort tjänsteraden…</Button>}
      </div>
    </form>
  </Shell>;
}

export type TjanstSpecialDraft = { kind: TjanstSpecialKind; label: string; personId: string | null; classId: string | null; ht: number; vt: number; comment: string };
type SpecialProps = Base & { data: TjanstPlanRead; special: TjanstSpecial | null; onSave: (draft: TjanstSpecialDraft) => Promise<TjanstOutcome>; onDelete: (special: TjanstSpecial) => void };
/** Specialuppdrag: klass bara för mentor, annars ingen grupp (SS 12000 Duty utan påhittad grupp). */
export function TjanstSpecialDialog({ open, checking, onClose, data, special, onSave, onDelete }: SpecialProps) {
  const id = useId();
  const [kind, setKind] = useState<TjanstSpecialKind | ''>(special?.kind ?? ''), [label, setLabel] = useState(special && special.label !== SPECIAL_KIND_LABEL[special.kind] ? special.label : '');
  const [person, setPerson] = useState(special ? special.personId ?? 'vakant' : ''), [classId, setClassId] = useState(special?.classId ?? '');
  const [ht, setHt] = useState(special ? hoursInput(special.ht) : ''), [vt, setVt] = useState(special ? hoursInput(special.vt) : ''), [comment, setComment] = useState(special?.comment ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  const dirty = special ? kind !== special.kind || person !== (special.personId ?? 'vakant') || ht !== hoursInput(special.ht) || vt !== hoursInput(special.vt) || comment !== special.comment : !!(kind || label || person || ht || vt || comment);
  useUnsavedChanges('tjanst-special-dialog', dirty);
  function submit() {
    const h = parseHours(ht), v = parseHours(vt), next: Record<string, string> = {};
    if (!kind) next.kind = 'Välj typ av uppdrag.';
    if (kind === 'annat' && !label.trim()) next.label = 'Ange benämning.';
    if (!person) next.person = 'Välj lärare.';
    if ('error' in h) next.ht = h.error;
    if ('error' in v) next.vt = v.error;
    if ('minutes' in h && 'minutes' in v && h.minutes === 0 && v.minutes === 0) next.ht = 'Ange tid för minst en termin.';
    setErrors(next);
    if (Object.keys(next).length || !kind || !('minutes' in h) || !('minutes' in v)) return;
    void run(() => onSave({ kind, label: label.trim() || SPECIAL_KIND_LABEL[kind], personId: person === 'vakant' ? null : person, classId: kind === 'mentor' && classId ? classId : null, ht: h.minutes, vt: v.minutes, comment: comment.trim() }));
  }
  return <Shell open={open} busy={busy} onClose={onClose} title={special ? 'Ändra specialuppdraget' : 'Lägg till specialuppdrag'} description={<>{data.schoolName} · läsåret {yearLabel(data.schoolYear)}. Specialuppdrag räknas skilt från undervisning.</>}>
    <Problems failure={failure} checking={checking} summary={Object.keys(errors).length > 0}/>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={busy}>
        <Field id={`${id}-kind`} label="Typ" error={errors.kind}><select {...described(`${id}-kind`, errors.kind)} value={kind} onChange={e => { setKind(e.target.value as TjanstSpecialKind); if (e.target.value !== 'mentor') setClassId(''); }}>
          <option value="">Välj typ av uppdrag</option>{TJANST_SPECIAL_KINDS.map(k => <option key={k} value={k}>{SPECIAL_KIND_LABEL[k]}</option>)}</select></Field>
        <Field id={`${id}-label`} label={kind === 'annat' ? 'Benämning' : 'Benämning (valfri)'} error={errors.label}><input {...described(`${id}-label`, errors.label)} maxLength={200} value={label} onChange={e => setLabel(e.target.value)}/></Field>
        <Field id={`${id}-person`} label="Lärare" error={errors.person}><select {...described(`${id}-person`, errors.person)} value={person} onChange={e => setPerson(e.target.value)}>
          <option value="">Välj lärare</option>{data.teachers.map(t => <option key={t.personId} value={t.personId}>{t.displayName}</option>)}<option value="vakant">Vakant</option></select></Field>
        {kind === 'mentor' && <Field id={`${id}-class`} label="Klass (valfri)"><select id={`${id}-class`} value={classId} onChange={e => setClassId(e.target.value)}><option value="">Ingen klass</option>{data.classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}</select></Field>}
        <Field id={`${id}-ht`} label="Tid HT (timmar)" error={errors.ht}><input {...described(`${id}-ht`, errors.ht)} inputMode="decimal" autoComplete="off" value={ht} onChange={e => setHt(e.target.value)}/></Field>
        <Field id={`${id}-vt`} label="Tid VT (timmar)" error={errors.vt}><input {...described(`${id}-vt`, errors.vt)} inputMode="decimal" autoComplete="off" value={vt} onChange={e => setVt(e.target.value)}/></Field>
        <Field id={`${id}-comment`} label="Kommentar (valfri)"><textarea id={`${id}-comment`} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></Field>
      </fieldset>
      <div className="mandate-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Spara specialuppdraget'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
        {special && <Button type="button" variant="outline" disabled={busy} onClick={() => onDelete(special)}>Ta bort specialuppdraget…</Button>}
      </div>
    </form>
  </Shell>;
}

export type TjanstJointDraft = { name: string; teachers: { personId: string; ht: number; vt: number }[] };
type JointProps = Base & { data: TjanstPlanRead; rows: TjanstRow[]; joint: TjanstJoint | null; onSave: (draft: TjanstJointDraft) => Promise<TjanstOutcome> };
/** Koppla till samläsning: lärartiden för gruppen räknas en gång, och varje klass visar sin täckning efter kopplingen (D-16). */
export function TjanstJointDialog({ open, checking, onClose, data, rows, joint, onSave }: JointProps) {
  const id = useId();
  const label = (row: TjanstRow) => data.classes.find(c => c.classId === row.classId)?.needs.find(n => n.sourceKey === row.sourceKey)?.label ?? row.rowKey;
  const cls = (row: TjanstRow) => data.classes.find(c => c.classId === row.classId)?.name ?? 'Okänd klass';
  const people = [...new Set([...rows.flatMap(r => r.personId ? [r.personId] : []), ...(joint?.teachers.map(t => t.personId) ?? [])])];
  const [name, setName] = useState(() => joint?.name ?? `${label(rows[0])} ${[...new Set(rows.map(cls))].join(' + ')}`);
  const [times, setTimes] = useState<Record<string, { ht: string; vt: string }>>(() => Object.fromEntries(people.map(p => {
    const t = joint?.teachers.find(x => x.personId === p) ?? (() => { const r = rows.find(x => x.personId === p)!; return rowTime(r, data.joints); })();
    return [p, { ht: hoursInput(t.ht), vt: hoursInput(t.vt) }];
  })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges('tjanst-joint-dialog', true);
  const parsed = people.map(p => ({ personId: p, ht: parseHours(times[p]?.ht ?? ''), vt: parseHours(times[p]?.vt ?? '') }));
  const group = parsed.reduce((sum, t) => ({ ht: sum.ht + ('minutes' in t.ht ? t.ht.minutes : 0), vt: sum.vt + ('minutes' in t.vt ? t.vt.minutes : 0) }), { ht: 0, vt: 0 });
  const classes = [...new Set(rows.map(r => r.classId))];
  function submit() {
    const next: Record<string, string> = {};
    if (!name.trim()) next.name = 'Ange benämning.';
    for (const t of parsed) {
      if ('error' in t.ht) next[`${t.personId}-ht`] = t.ht.error;
      if ('error' in t.vt) next[`${t.personId}-vt`] = t.vt.error;
      if ('minutes' in t.ht && 'minutes' in t.vt && t.ht.minutes === 0 && t.vt.minutes === 0) next[`${t.personId}-ht`] = 'Ange tid för minst en termin.';
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    void run(() => onSave({ name: name.trim(), teachers: parsed.map(t => ({ personId: t.personId, ht: 'minutes' in t.ht ? t.ht.minutes : 0, vt: 'minutes' in t.vt ? t.vt.minutes : 0 })) }));
  }
  return <Shell open={open} busy={busy} onClose={onClose} title={joint ? 'Ändra samläsningen' : 'Koppla till samläsning'} description="Lärartiden för gruppen räknas en gång. Varje klass visar sitt behov som täckt av gruppens tid.">
    <Problems failure={failure} checking={checking} summary={Object.keys(errors).length > 0}/>
    <h3>Markerade rader</h3>
    <ul className="tjanst-plain-list">{rows.map(r => <li key={r.id}>{label(r)} · {cls(r)} · {teacherName(data, r.personId)}</li>)}</ul>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={busy}>
        <Field id={`${id}-name`} label="Namn" error={errors.name}><input {...described(`${id}-name`, errors.name)} maxLength={200} value={name} onChange={e => setName(e.target.value)}/></Field>
        {people.length === 0 && <p>Raderna saknar lärare. Gruppen sparas utan lärartid.</p>}
        {people.map(p => <fieldset key={p} className="tjanst-person-time"><legend>Lärartid för gruppen · {teacherName(data, p)}</legend>
          <Field id={`${id}-${p}-ht`} label="HT (timmar)" error={errors[`${p}-ht`]}><input {...described(`${id}-${p}-ht`, errors[`${p}-ht`])} inputMode="decimal" value={times[p]?.ht ?? ''} onChange={e => setTimes(t => ({ ...t, [p]: { ...t[p], ht: e.target.value } }))}/></Field>
          <Field id={`${id}-${p}-vt`} label="VT (timmar)" error={errors[`${p}-vt`]}><input {...described(`${id}-${p}-vt`, errors[`${p}-vt`])} inputMode="decimal" value={times[p]?.vt ?? ''} onChange={e => setTimes(t => ({ ...t, [p]: { ...t[p], vt: e.target.value } }))}/></Field>
        </fieldset>)}
      </fieldset>
      <section className="tjanst-after" aria-label="Täckning efter kopplingen"><h3>Täckning efter kopplingen</h3><ul className="tjanst-plain-list">{classes.map(c => {
        const own = rows.filter(r => r.classId === c), need = own.map(r => data.classes.find(x => x.classId === c)?.needs.find(n => n.sourceKey === r.sourceKey))
          .reduce<number | null>((sum, n) => n && (n.needHt !== null || n.needVt !== null) ? (sum ?? 0) + (n.needHt ?? 0) + (n.needVt ?? 0) : sum, null);
        return <li key={c}>{data.classes.find(x => x.classId === c)?.name}: {coverageText(group.ht + group.vt, need)}</li>;
      })}</ul></section>
      <div className="mandate-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Spara samläsningen'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
      </div>
    </form>
  </Shell>;
}

type AddTeacherProps = Base & { data: TjanstPlanRead; loadPeople: () => Promise<TjanstPerson[] | TjanstFailure>; onSave: (personId: string, name: string) => Promise<TjanstOutcome>; onNewTeacher: () => void };
export function TjanstAddTeacherDialog({ open, checking, onClose, data, loadPeople, onSave, onNewTeacher }: AddTeacherProps) {
  const id = useId();
  const [people, setPeople] = useState<TjanstPerson[] | null>(null), [loadError, setLoadError] = useState<TjanstFailure | null>(null);
  const [person, setPerson] = useState(''), [error, setError] = useState<string | undefined>();
  const { busy, failure, run } = useSubmit(onClose);
  useEffect(() => {
    let current = true;
    void loadPeople().then(result => { if (!current) return; if (Array.isArray(result)) setPeople(result); else setLoadError(result); });
    return () => { current = false; };
  }, [loadPeople]);
  const choices = (people ?? []).filter(p => !data.teachers.some(t => t.personId === p.id));
  const display = (p: TjanstPerson) => `${p.givenName} ${p.familyName}`;
  return <Shell open={open} busy={busy} onClose={onClose} title="Lägg till lärare i fördelningen" description="Personer med skoluppdrag på skolan som ännu inte har en kolumn i fördelningen.">
    <Problems failure={failure ?? loadError} checking={checking} summary={!!error}/>
    {people === null && !loadError && <output aria-busy="true">Hämtar personal…</output>}
    {people && <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); const p = choices.find(x => x.id === person);
      if (!p) { setError('Välj lärare.'); return; } setError(undefined); void run(() => onSave(p.id, display(p))); }}>
      {choices.length === 0 ? <p>Alla personer med skoluppdrag på skolan finns redan i fördelningen. Saknas personen, använd Lägg upp ny lärare.</p> : <fieldset disabled={busy}>
        <Field id={`${id}-person`} label="Lärare" error={error}><select {...described(`${id}-person`, error)} value={person} onChange={e => setPerson(e.target.value)}><option value="">Välj lärare</option>
          {choices.map(p => <option key={p.id} value={p.id}>{display(p)}{p.status === 'draft' ? ' (ny lärare)' : ''}</option>)}</select></Field>
        <p>Saknas personen i listan? Välj Lägg upp ny lärare.</p></fieldset>}
      <div className="mandate-actions">
        {choices.length > 0 && <Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Lägg till läraren'}</Button>}
        <Button type="button" variant="outline" disabled={busy} onClick={onNewTeacher}>Lägg upp ny lärare</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
      </div>
    </form>}
  </Shell>;
}

export type TjanstNewTeacherDraft = { givenName: string; familyName: string; draftNote: string };
type NewTeacherProps = Base & { schoolName: string; onSave: (draft: TjanstNewTeacherDraft) => Promise<TjanstOutcome> };
export function TjanstNewTeacherDialog({ open, checking, onClose, schoolName, onSave }: NewTeacherProps) {
  const id = useId();
  const [given, setGiven] = useState(''), [family, setFamily] = useState(''), [note, setNote] = useState(''), [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges('tjanst-new-teacher', !!(given || family || note));
  return <Shell open={open} busy={busy} onClose={onClose} title="Lägg upp ny lärare" description={<>Läraren läggs upp som utkast för {schoolName}. Huvudmannen kompletterar anställning och andel.</>}>
    <Problems failure={failure} checking={checking} summary={Object.keys(errors).length > 0}/>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); const next: Record<string, string> = {};
      if (!given.trim()) next.given = 'Ange förnamn.'; if (!family.trim()) next.family = 'Ange efternamn.'; setErrors(next);
      if (!Object.keys(next).length) void run(() => onSave({ givenName: given.trim(), familyName: family.trim(), draftNote: note.trim() })); }}>
      <fieldset disabled={busy}>
        <Field id={`${id}-given`} label="Förnamn" error={errors.given}><input {...described(`${id}-given`, errors.given)} maxLength={200} autoComplete="off" value={given} onChange={e => setGiven(e.target.value)}/></Field>
        <Field id={`${id}-family`} label="Efternamn" error={errors.family}><input {...described(`${id}-family`, errors.family)} maxLength={200} autoComplete="off" value={family} onChange={e => setFamily(e.target.value)}/></Field>
        <Field id={`${id}-note`} label="Meddelande till huvudmannen (valfritt)"><textarea id={`${id}-note`} maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></Field>
      </fieldset>
      <div className="mandate-actions">
        <Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Lägg upp läraren'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
      </div>
    </form>
  </Shell>;
}

type ConfirmProps = Base & { title: string; text: ReactNode; keepLabel: string; confirmLabel: string; busyLabel?: string; destructive?: boolean; onConfirm: () => Promise<TjanstOutcome> };
/** Bekräftelser. Avbrytknappen får fokus. */
export function TjanstConfirmDialog({ open, checking, onClose, title, text, keepLabel, confirmLabel, busyLabel = 'Sparar…', destructive, onConfirm }: ConfirmProps) {
  const { busy, failure, run } = useSubmit(onClose), keep = useRef<HTMLButtonElement>(null);
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="mandate-dialog tjanst-dialog sm:max-w-xl" showCloseButton={false} initialFocus={keep}>
      <DialogTitle>{title}</DialogTitle><DialogDescription>{text}</DialogDescription>
      <Problems failure={failure} checking={checking} summary={false}/>
      <div className="mandate-actions">
        <Button ref={keep} variant="outline" disabled={busy} onClick={onClose}>{keepLabel}</Button>
        <Button variant={destructive ? 'destructive' : 'default'} disabled={busy} onClick={() => void run(onConfirm)}>{busy ? busyLabel : confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
