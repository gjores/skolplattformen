'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TJANST_SPECIAL_KINDS, type TjanstJoint, type TjanstPlanRead, type TjanstRow, type TjanstSpecial, type TjanstSpecialKind } from '@/lib/tjanst-contract.ts';
import type { TjanstYearCandidate, TjanstYearChoice, TjanstYearCommand, TjanstYearRowReply } from '@/lib/tjanst-year-contract.ts';
import { createYearRowEditor, selectYearTeacher, yearRowSavePayload, type TjanstYearRowEditor } from '@/lib/tjanst-year-model.ts';
import { jointWarnings, mixedTeachers } from '@/lib/tjanst-model.ts';
import TjanstTeacherPicker from './tjanst-teacher-picker';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from './mfa-step-up';
import { coverageText, rowTime, TjanstJointWarningBox, type TjanstCellTarget, type TjanstNeedEntry } from './tjanst-matrix';
import { formatDeviation, formatTime, SPECIAL_KIND_LABEL, yearLabel } from './tjanst-service-summary';

/**
 * Redigeringsdialoger. Inmatningen speglas till arbetsytans cache och bevaras vid serverfel och när
 * dialogen avmonteras på smal skärm (D-15). Stängning är spärrad bara medan sparningen pågår.
 */
export type TjanstFailure = { ok: false; error: string; code?: string; correlationId?: string | null; mfa?: string; refresh?: () => void };
export type TjanstOutcome = { ok: true } | TjanstFailure;
export type TjanstPreparedChange = TjanstYearCommand extends infer C ? C extends TjanstYearCommand ? Omit<C, 'commandId' | 'payloadHash'> : never : never;
export type TjanstFormCache = Record<string, unknown>;
type Base = { open: boolean; checking: boolean; disabled?: boolean; onClose: () => void; supportNotice?: ReactNode; form?: TjanstFormCache; onField?: (key: string, value: unknown, dirty?: boolean) => void };
/** Formulärägaren finns i arbetsytan så ett telefonbyte kan avmontera alla redigerare. */
function useDraftField<T>(base: Pick<Base, 'form' | 'onField'>, key: string, initial: T | (() => T)): [T, (next: T | ((old: T) => T)) => void] {
  const [local, setLocal] = useState<T>(() => key in (base.form ?? {}) ? base.form![key] as T : typeof initial === 'function' ? (initial as () => T)() : initial);
  const current = useRef(local); useLayoutEffect(() => { current.current = local; }, [local]);
  const { form, onField } = base;
  useEffect(() => { if (!(key in (form ?? {}))) queueMicrotask(() => onField?.(key, local, false)); }, [form, onField, key, local]);
  return [local, next => { const value = typeof next === 'function' ? (next as (old: T) => T)(current.current) : next; current.current = value; setLocal(value); base.onField?.(key, value); }];
}

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

type RowProps = Base & { data: TjanstPlanRead; entry: TjanstNeedEntry; target: TjanstCellTarget; support: TjanstYearRowReply;
  onSave: (change: TjanstPreparedChange) => Promise<TjanstOutcome>; onDelete: (row: TjanstRow) => void };
export function TjanstRowDialog(props: RowProps & { replaceTeacher?: boolean; advanced?: boolean }) {
  const { open, checking, disabled, onClose, data, entry, support, onSave, onDelete } = props;
  const id = useId(), row = support.currentRow;
  const editingTeacher = !!row && row.personId !== null;
  const [changingTeacher, setChangingTeacher] = useState(!!props.replaceTeacher && (props.target.personId === row?.personId || !support.candidates.some(p => p.personId === props.target.personId)));
  const own = row ? rowTime(row, data.joints) : { ht: 0, vt: 0 };
  const others = { ht: entry.cov.covered.ht - (row?.personId ? own.ht : 0), vt: entry.cov.covered.vt - (row?.personId ? own.vt : 0) };
  const [editor, setEditor] = useDraftField<TjanstYearRowEditor>(props, 'editor', () => { const value = createYearRowEditor(support, others); if (props.form?.resetChoice) return { ...value, choice: null, personId: null };
    if (props.replaceTeacher && props.target.personId !== null && props.target.personId !== row?.personId) { try { return selectYearTeacher(value, support, { kind: 'manual', personId: props.target.personId }); } catch { return { ...value, choice: null, personId: null }; } } return value; });
  const [ht, setHt] = useDraftField(props, 'ht', () => hoursInput(editor.teacherHt));
  const [vt, setVt] = useDraftField(props, 'vt', () => hoursInput(editor.teacherVt));
  const [comment, setComment] = useDraftField(props, 'comment', editor.comment);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  let choiceStale = false;
  if (editor.choice) { try { yearRowSavePayload({ ...editor, teacherHt: 1, teacherVt: 1 }, support); } catch { choiceStale = true; } }
  const stale = editor.expectedRevision !== support.currentRevision || editor.expectedBasisHash !== support.basisHash || choiceStale;
  const liveDeviation = (term: string, raw: string, need: number | null, other: number) => { const parsed = parseHours(raw); return !raw.trim() || 'error' in parsed || need === null ? 'Behovet eller tiden är okänd.' : `Avvikelse ${term}: ${formatDeviation(other + parsed.minutes - need) || 'ingen'}`; };
  // 05.1-40: befintlig namngiven tilldelning väljer först och sparar uttryckligt. Ny/vakant rad behåller direktvalet.
  function submit(chosen: TjanstYearRowEditor = editor) {
    const h = parseHours(ht), v = parseHours(vt), next: Record<string, string> = {};
    let chosenStale = chosen !== editor ? false : stale;
    if (chosen !== editor && chosen.choice) { try { yearRowSavePayload({ ...chosen, teacherHt: 1, teacherVt: 1 }, support); } catch { chosenStale = true; } }
    if (!chosen.choice) next.person = 'Välj lärare.';
    if (!ht.trim()) next.ht = 'Ange tid för HT. Skriv 0 om terminen saknar tid.';
    if (!vt.trim()) next.vt = 'Ange tid för VT. Skriv 0 om terminen saknar tid.';
    if ('error' in h) next.ht = h.error; if ('error' in v) next.vt = v.error;
    if ('minutes' in h && 'minutes' in v && h.minutes === 0 && v.minutes === 0) next.ht = 'Ange tid för minst en termin.';
    if (comment.length > 2000) next.comment = 'Kommentaren får vara högst 2 000 tecken.';
    if (chosenStale) next.person = 'Underlaget har ändrats. Dina uppgifter finns kvar. Välj lärare på nytt.';
    let payload;
    if (!Object.keys(next).length && 'minutes' in h && 'minutes' in v) {
      try { payload = yearRowSavePayload({ ...chosen, teacherHt: h.minutes, teacherVt: v.minutes, comment: comment.trim() }, support); }
      catch { next.person = 'Underlaget har ändrats. Dina uppgifter finns kvar. Välj lärare på nytt.'; }
    }
    setErrors(next); if (!payload) return;
    const change: TjanstPreparedChange = { action: 'save_row', unitId: chosen.unitId, schoolYear: chosen.schoolYear, expectedRevision: chosen.expectedRevision, payload };
    void run(() => onSave(change));
  }
  const selectedName = editor.choice?.personId ? support.candidates.find(p => p.personId === editor.choice?.personId)?.displayName ?? teacherName(data, editor.choice.personId) : editor.choice?.kind === 'unassigned' ? 'Vakant' : 'Välj aktuell lärare';
  return <Shell open={open} busy={busy} onClose={onClose} title={row ? 'Ändra tjänsteraden' : 'Ny tjänsterad'} description={`${entry.need.label} · ${entry.cls.name}`}>
    {!editingTeacher && <dl className="mandate-facts tjanst-facts"><div><dt>Behov enligt timplanen</dt><dd>HT {support.need.needHt === null ? 'okänt' : formatTime(support.need.needHt)} · VT {support.need.needVt === null ? 'okänt' : formatTime(support.need.needVt)}<small>Källa: {entry.cls.link?.seriesName} version {entry.cls.link?.timplanVersion}, ämnesrad {support.need.label}{support.need.needBasis === 'even_split' ? ", årets tid delad lika på HT och VT" : ''}</small></dd></div>
      <div><dt>Redan fördelat till andra</dt><dd>HT {formatTime(others.ht)} · VT {formatTime(others.vt)}</dd></div><div><dt>Schemalagd tid</dt><dd>Underlag saknas</dd></div></dl>}
    {props.supportNotice}
    <Problems failure={failure} checking={checking} summary={Object.values(errors).some(Boolean)}/>
    {stale && <p role="alert">Underlaget har ändrats. Dina uppgifter finns kvar. Välj lärare på nytt.</p>}
    {row && row.personId === null && <p className="tjanst-direct-hint">Behovet har en vakant rad. Väljer du en lärare ersätts Vakant, så att behovet inte fördelas dubbelt.</p>}
    {row && !editingTeacher && <p>Sparad tilldelning: {teacherName(data, row.personId)}{row.personId !== null && !support.candidates.some(p => p.personId === row.personId) ? '. Personen saknar aktuellt skoluppdrag i underlaget. Välj en aktuell lärare eller Vakant före sparning.' : ''}</p>}
    <form className="protected-form tjanst-form" onSubmit={e => { e.preventDefault(); submit(); }}><fieldset disabled={busy || disabled}>
      {editingTeacher && <div className="tjanst-edit-teacher"><strong>Lärare: {selectedName}</strong>
        <Button type="button" variant="outline" aria-expanded={changingTeacher} onClick={() => setChangingTeacher(v => !v)}>Byt lärare</Button>
        {editor.personId !== row?.personId && <output>Lärarbytet sparas när du väljer Spara tjänsteraden.</output>}</div>}

      <Field id={`${id}-ht`} label="Lärartid HT (timmar)" error={errors.ht} help={liveDeviation('HT', ht, support.need.needHt, others.ht)}><input {...described(`${id}-ht`, errors.ht, 'help')} inputMode="decimal" value={ht} onChange={e => setHt(e.target.value)}/></Field>
      <Field id={`${id}-vt`} label="Lärartid VT (timmar)" error={errors.vt} help={liveDeviation('VT', vt, support.need.needVt, others.vt)}><input {...described(`${id}-vt`, errors.vt, 'help')} inputMode="decimal" value={vt} onChange={e => setVt(e.target.value)}/></Field>
      {!editingTeacher && <Field id={`${id}-comment`} label="Kommentar (valfri)" error={errors.comment}><textarea {...described(`${id}-comment`, errors.comment)} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></Field>}
      <>{editingTeacher && !changingTeacher && errors.person && <p role="alert" className="field-error">{errors.person}</p>}</><p className="tjanst-direct-hint">{editingTeacher ? 'Justera tid eller byt lärare och välj Spara tjänsteraden.' : row ? 'Välj en lärare för att ersätta Vakant och spara direkt.' : 'Ange tiden och välj sedan lärare eller Vakant. Raden sparas när du väljer.'}</p>
      <>{(!editingTeacher || changingTeacher) && <TjanstTeacherPicker compact={editingTeacher} unavailablePersonIds={editingTeacher ? entry.rows.filter(r => r.id !== row?.id && r.personId !== null).map(r => r.personId!) : []} candidates={support.candidates} schoolYear={support.schoolYear} choice={editor.choice} support={support} error={errors.person}
        onSelect={selection => { let chosen: TjanstYearRowEditor; try { chosen = selectYearTeacher(editor, support, selection); } catch { setErrors({ person: 'Underlaget har ändrats. Dina uppgifter finns kvar. Välj lärare på nytt.' }); return; }
          setEditor(chosen); setErrors({}); if (editingTeacher) { setChangingTeacher(false); requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`${id}-save`)?.focus())); } else submit(chosen); }}/>}</>
      {editingTeacher && <details className="tjanst-row-more" open={props.advanced || errors.comment ? true : undefined}><summary>{comment ? 'Fler val · kommentar finns' : 'Fler val och underlag'}</summary><dl className="mandate-facts tjanst-facts"><div><dt>Behov enligt timplanen</dt><dd>HT {support.need.needHt === null ? 'okänt' : formatTime(support.need.needHt)} · VT {support.need.needVt === null ? 'okänt' : formatTime(support.need.needVt)}<small>Källa: {entry.cls.link?.seriesName} version {entry.cls.link?.timplanVersion}, ämnesrad {support.need.label}{support.need.needBasis === 'even_split' ? ", årets tid delad lika på HT och VT" : ''}</small></dd></div>
      <div><dt>Redan fördelat till andra</dt><dd>HT {formatTime(others.ht)} · VT {formatTime(others.vt)}</dd></div><div><dt>Schemalagd tid</dt><dd>Underlag saknas</dd></div></dl><Field id={`${id}-comment`} label="Kommentar (valfri)" error={errors.comment}><textarea {...described(`${id}-comment`, errors.comment)} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></Field><Button type="button" variant="outline" disabled={busy || disabled} onClick={() => onDelete(row!)}>Ta bort tjänsteraden…</Button></details>}
    </fieldset><div className="mandate-actions">{row && <Button id={`${id}-save`} type="submit" disabled={busy || disabled || stale}>{busy ? 'Sparar…' : 'Spara tjänsteraden'}</Button>}
      {!row && busy && <output aria-busy="true">Sparar…</output>}
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
      {row && !editingTeacher && <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => onDelete(row)}>Ta bort tjänsteraden…</Button>}</div></form>
  </Shell>;
}

export type TjanstSpecialDraft = { kind: TjanstSpecialKind; label: string; personId: string | null; classId: string | null; ht: number; vt: number; comment: string };
type SpecialProps = Base & { candidates: TjanstYearCandidate[]; onChoice: () => void; data: TjanstPlanRead; special: TjanstSpecial | null; onSave: (draft: TjanstSpecialDraft) => Promise<TjanstOutcome>; onDelete: (special: TjanstSpecial) => void };
/** Specialuppdrag: klass bara för mentor, annars ingen grupp (SS 12000 Duty utan påhittad grupp). */
export function TjanstSpecialDialog(props: SpecialProps) {
  const { open, checking, disabled, onClose, data, special, onSave, onDelete, candidates, onChoice } = props;
  const id = useId();
  const [kind, setKind] = useDraftField<TjanstSpecialKind | ''>(props, 'kind', special?.kind ?? ''), [label, setLabel] = useDraftField(props, 'label', special && special.label !== SPECIAL_KIND_LABEL[special.kind] ? special.label : '');
  const [person, setPerson] = useDraftField(props, 'person', special ? special.personId ?? 'vakant' : ''), [classId, setClassId] = useDraftField(props, 'classId', special?.classId ?? '');
  const [ht, setHt] = useDraftField(props, 'ht', special ? hoursInput(special.ht) : ''), [vt, setVt] = useDraftField(props, 'vt', special ? hoursInput(special.vt) : ''), [comment, setComment] = useDraftField(props, 'comment', special?.comment ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  const dirty = special ? kind !== special.kind || person !== (special.personId ?? 'vakant') || ht !== hoursInput(special.ht) || vt !== hoursInput(special.vt) || comment !== special.comment : !!(kind || label || person || ht || vt || comment);
  useUnsavedChanges('tjanst-special-dialog', dirty);
  function submit() {
    const h = parseHours(ht), v = parseHours(vt), next: Record<string, string> = {};
    if (!kind) next.kind = 'Välj typ av uppdrag.';
    if (kind === 'annat' && !label.trim()) next.label = 'Ange benämning.';
    if (!person) next.person = 'Välj lärare.';
    if (kind === 'mentor' && !data.classes.some(c => c.classId === classId)) next.classId = 'Välj en aktuell klass.';
    if ('error' in h) next.ht = h.error;
    if ('error' in v) next.vt = v.error;
    if ('minutes' in h && 'minutes' in v && h.minutes === 0 && v.minutes === 0) next.ht = 'Ange tid för minst en termin.';
    setErrors(next);
    if (Object.keys(next).length || !kind || !('minutes' in h) || !('minutes' in v)) return;
    void run(() => onSave({ kind, label: label.trim() || SPECIAL_KIND_LABEL[kind], personId: person === 'vakant' ? null : person, classId: kind === 'mentor' && classId ? classId : null, ht: h.minutes, vt: v.minutes, comment: comment.trim() }));
  }
  return <Shell open={open} busy={busy} onClose={onClose} title={special ? 'Ändra specialuppdraget' : 'Lägg till specialuppdrag'} description={<>{data.schoolName} · läsåret {yearLabel(data.schoolYear)}. Specialuppdrag räknas skilt från undervisning.</>}>
    {props.supportNotice}
    <Problems failure={failure} checking={checking} summary={Object.values(errors).some(Boolean)}/>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={busy || disabled}>
        <Field id={`${id}-kind`} label="Typ" error={errors.kind}><select {...described(`${id}-kind`, errors.kind)} value={kind} onChange={e => { setKind(e.target.value as TjanstSpecialKind); if (e.target.value !== 'mentor') setClassId(''); }}>
          <option value="">Välj typ av uppdrag</option>{TJANST_SPECIAL_KINDS.map(k => <option key={k} value={k}>{SPECIAL_KIND_LABEL[k]}</option>)}</select></Field>
        <Field id={`${id}-label`} label={kind === 'annat' ? 'Benämning' : 'Benämning (valfri)'} error={errors.label}><input {...described(`${id}-label`, errors.label)} maxLength={200} value={label} onChange={e => setLabel(e.target.value)}/></Field>
        <TjanstTeacherPicker candidates={candidates} schoolYear={data.schoolYear} choice={person === 'vakant' ? { kind: 'unassigned', personId: null } : person ? { kind: 'manual', personId: person, expectedPersonBasisHash: candidates.find(p => p.personId === person)?.personBasisHash ?? '' } : null} error={errors.person}
          onSelect={choice => { if (choice.kind === 'suggestion') return; setPerson(choice.kind === 'unassigned' ? 'vakant' : choice.personId); onChoice(); }}/>
        {kind === 'mentor' && <Field id={`${id}-class`} label="Klass" error={errors.classId}><select {...described(`${id}-class`, errors.classId)} value={classId} onChange={e => setClassId(e.target.value)}><option value="">Välj klass</option>{data.classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}</select></Field>}
        <Field id={`${id}-ht`} label="Tid HT (timmar)" error={errors.ht}><input {...described(`${id}-ht`, errors.ht)} inputMode="decimal" autoComplete="off" value={ht} onChange={e => setHt(e.target.value)}/></Field>
        <Field id={`${id}-vt`} label="Tid VT (timmar)" error={errors.vt}><input {...described(`${id}-vt`, errors.vt)} inputMode="decimal" autoComplete="off" value={vt} onChange={e => setVt(e.target.value)}/></Field>
        <Field id={`${id}-comment`} label="Kommentar (valfri)"><textarea id={`${id}-comment`} maxLength={2000} value={comment} onChange={e => setComment(e.target.value)}/></Field>
      </fieldset>
      <div className="mandate-actions">
        <Button type="submit" disabled={busy || disabled}>{busy ? 'Sparar…' : 'Spara specialuppdraget'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
        {special && <Button type="button" variant="outline" disabled={busy} onClick={() => onDelete(special)}>Ta bort specialuppdraget…</Button>}
      </div>
    </form>
  </Shell>;
}

export type TjanstJointDraft = { name: string; teachers: { personId: string; ht: number; vt: number }[] };
type JointProps = Base & { data: TjanstPlanRead; rows: TjanstRow[]; joint: TjanstJoint | null; onSave: (draft: TjanstJointDraft) => Promise<TjanstOutcome> };
/** Koppla till samläsning: lärartiden för gruppen räknas en gång, och varje klass visar sin täckning efter kopplingen (D-16). */
export function TjanstJointDialog(props: JointProps) {
  const { open, checking, disabled, onClose, data, rows, joint, onSave } = props;
  const id = useId();
  const label = (row: TjanstRow) => data.classes.find(c => c.classId === row.classId)?.needs.find(n => n.sourceKey === row.sourceKey)?.label ?? row.rowKey;
  const cls = (row: TjanstRow) => data.classes.find(c => c.classId === row.classId)?.name ?? 'Okänd klass';
  const people = [...new Set([...rows.flatMap(r => r.personId ? [r.personId] : []), ...(joint?.teachers.map(t => t.personId) ?? [])])];
  const [name, setName] = useDraftField(props, 'name', () => joint?.name ?? `${label(rows[0])} ${[...new Set(rows.map(cls))].join(' + ')}`);
  const [times, setTimes] = useDraftField<Record<string, { ht: string; vt: string }>>(props, 'times', () => Object.fromEntries(people.map(p => {
    const t = joint?.teachers.find(x => x.personId === p) ?? (() => { const r = rows.find(x => x.personId === p)!; return rowTime(r, data.joints); })();
    return [p, { ht: hoursInput(t.ht), vt: hoursInput(t.vt) }];
  })));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges('tjanst-joint-dialog', true);
  const parsed = people.map(p => ({ personId: p, ht: parseHours(times[p]?.ht ?? ''), vt: parseHours(times[p]?.vt ?? '') }));
  const group = parsed.reduce((sum, t) => ({ ht: sum.ht + ('minutes' in t.ht ? t.ht.minutes : 0), vt: sum.vt + ('minutes' in t.vt ? t.vt.minutes : 0) }), { ht: 0, vt: 0 });
  const classes = [...new Set(rows.map(r => r.classId))];
  // D-28: samma lärare på alla rader, eller bara vakanta rader.
  const mixed = mixedTeachers(rows), warnings = jointWarnings(rows, data.classes);
  function submit() {
    if (mixed) return;
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
    {props.supportNotice}
    <Problems failure={failure} checking={checking} summary={Object.values(errors).some(Boolean)}/>
    <h3>Markerade rader</h3>
    <ul className="tjanst-plain-list">{rows.map(r => <li key={r.id}>{label(r)} · {cls(r)} · {teacherName(data, r.personId)}</li>)}</ul>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); submit(); }}>
      <fieldset disabled={busy || disabled}>
        <Field id={`${id}-name`} label="Namn" error={errors.name}><input {...described(`${id}-name`, errors.name)} maxLength={200} value={name} onChange={e => setName(e.target.value)}/></Field>
        {mixed && <div role="alert" className="validation-warning"><p>En samläsning ska ha samma lärare för alla klasser. De markerade raderna har olika lärare. Byt lärare på raderna eller använd Flytta uppdrag först. Två lärare i samma grupp hanteras inte som samläsning.</p></div>}
        {!mixed && <TjanstJointWarningBox warnings={warnings} className={id => data.classes.find(c => c.classId === id)?.name ?? 'Okänd klass'}/>}
        {!mixed && people.length === 0 && <p>Raderna saknar lärare. Gruppen sparas utan lärartid.</p>}
        {!mixed && people.map(p => <fieldset key={p} className="tjanst-person-time"><legend>Lärartid för gruppen · {teacherName(data, p)}</legend>
          <Field id={`${id}-${p}-ht`} label="HT (timmar)" error={errors[`${p}-ht`]}><input {...described(`${id}-${p}-ht`, errors[`${p}-ht`])} inputMode="decimal" value={times[p]?.ht ?? ''} onChange={e => setTimes(t => ({ ...t, [p]: { ...t[p], ht: e.target.value } }))}/></Field>
          <Field id={`${id}-${p}-vt`} label="VT (timmar)" error={errors[`${p}-vt`]}><input {...described(`${id}-${p}-vt`, errors[`${p}-vt`])} inputMode="decimal" value={times[p]?.vt ?? ''} onChange={e => setTimes(t => ({ ...t, [p]: { ...t[p], vt: e.target.value } }))}/></Field>
        </fieldset>)}
      </fieldset>
      {!mixed && <section className="tjanst-after" aria-label="Täckning efter kopplingen"><h3>Täckning efter kopplingen</h3><ul className="tjanst-plain-list">{classes.map(c => {
        const own = rows.filter(r => r.classId === c), need = own.map(r => data.classes.find(x => x.classId === c)?.needs.find(n => n.sourceKey === r.sourceKey))
          .reduce<number | null>((sum, n) => n && (n.needHt !== null || n.needVt !== null) ? (sum ?? 0) + (n.needHt ?? 0) + (n.needVt ?? 0) : sum, null);
        return <li key={c}>{data.classes.find(x => x.classId === c)?.name}: {coverageText(group.ht + group.vt, need)}</li>;
      })}</ul></section>}
      <div className="mandate-actions">
        <Button type="submit" disabled={busy || disabled || mixed}>{busy ? 'Sparar…' : 'Spara samläsningen'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
      </div>
    </form>
  </Shell>;
}

type AddTeacherProps = Base & { data: TjanstPlanRead; candidates: TjanstYearCandidate[]; onChoice: () => void; onSave: (personId: string, name: string) => Promise<TjanstOutcome>; onNewTeacher?: () => void };
export function TjanstAddTeacherDialog(props: AddTeacherProps) {
  const { open, checking, disabled, onClose, data, candidates, onChoice, onSave, onNewTeacher } = props;
  const [choice, setChoice] = useDraftField<TjanstYearChoice | null>(props, 'choice', null);
  const { busy, failure, run } = useSubmit(onClose);
  const choices = candidates.filter(p => !data.teachers.some(t => t.personId === p.personId));
  return <Shell open={open} busy={busy} onClose={onClose} title="Lägg till lärare i fördelningen" description="Personer med skoluppdrag på skolan som ännu inte har en kolumn i fördelningen.">
    {props.supportNotice}
    <Problems failure={failure} checking={checking} summary={false}/>
    <TjanstTeacherPicker candidates={choices} schoolYear={data.schoolYear} choice={choice} allowVacant={false} disabled={busy || disabled} onSelect={selection => {
      if (selection.kind !== 'manual') return; const person = candidates.find(p => p.personId === selection.personId)!;
      setChoice({ kind: 'manual', personId: person.personId, expectedPersonBasisHash: person.personBasisHash }); onChoice(); }}/>
    <div className="mandate-actions"><Button disabled={busy || disabled || !choice?.personId} onClick={() => { const p = candidates.find(p => p.personId === choice?.personId); if (p) void run(() => onSave(p.personId, p.displayName)); }}>Lägg till läraren</Button>
      {onNewTeacher && <Button variant="outline" disabled={busy} onClick={onNewTeacher}>Lägg upp ny lärare</Button>}
      <Button variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button></div>
  </Shell>;
}

export type TjanstNewTeacherDraft = { givenName: string; familyName: string; draftNote: string };
type NewTeacherProps = Base & { schoolName: string; onSave: (draft: TjanstNewTeacherDraft) => Promise<TjanstOutcome> };
export function TjanstNewTeacherDialog(props: NewTeacherProps) {
  const { open, checking, disabled, onClose, schoolName, onSave } = props;
  const id = useId();
  const [given, setGiven] = useDraftField(props, 'given', ''), [family, setFamily] = useDraftField(props, 'family', ''), [note, setNote] = useDraftField(props, 'note', ''), [errors, setErrors] = useState<Record<string, string>>({});
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges('tjanst-new-teacher', !!(given || family || note));
  return <Shell open={open} busy={busy} onClose={onClose} title="Lägg upp ny lärare" description={<>Läraren läggs upp som utkast för {schoolName}. Huvudmannen kompletterar anställning och andel.</>}>
    {props.supportNotice}
    <Problems failure={failure} checking={checking} summary={Object.values(errors).some(Boolean)}/>
    <form className="protected-form tjanst-form" onSubmit={event => { event.preventDefault(); const next: Record<string, string> = {};
      if (!given.trim()) next.given = 'Ange förnamn.'; if (!family.trim()) next.family = 'Ange efternamn.'; setErrors(next);
      if (!Object.keys(next).length) void run(() => onSave({ givenName: given.trim(), familyName: family.trim(), draftNote: note.trim() })); }}>
      <fieldset disabled={busy || disabled}>
        <Field id={`${id}-given`} label="Förnamn" error={errors.given}><input {...described(`${id}-given`, errors.given)} maxLength={200} autoComplete="off" value={given} onChange={e => setGiven(e.target.value)}/></Field>
        <Field id={`${id}-family`} label="Efternamn" error={errors.family}><input {...described(`${id}-family`, errors.family)} maxLength={200} autoComplete="off" value={family} onChange={e => setFamily(e.target.value)}/></Field>
        <Field id={`${id}-note`} label="Meddelande till huvudmannen (valfritt)"><textarea id={`${id}-note`} maxLength={500} value={note} onChange={e => setNote(e.target.value)}/></Field>
      </fieldset>
      <div className="mandate-actions">
        <Button type="submit" disabled={busy || disabled}>{busy ? 'Sparar…' : 'Lägg upp läraren'}</Button>
        <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button>
      </div>
    </form>
  </Shell>;
}

type ConfirmProps = Base & { title: string; text: ReactNode; keepLabel: string; confirmLabel: string; busyLabel?: string; destructive?: boolean; onConfirm: () => Promise<TjanstOutcome> };
/** Bekräftelser. Avbrytknappen får fokus. */
export function TjanstConfirmDialog({ open, checking, onClose, title, text, keepLabel, confirmLabel, busyLabel = 'Sparar…', destructive, disabled, supportNotice, onConfirm }: ConfirmProps) {
  const { busy, failure, run } = useSubmit(onClose), keep = useRef<HTMLButtonElement>(null);
  return <Dialog open={open} onOpenChange={value => { if (!value && !busy) onClose(); }}>
    <DialogContent className="mandate-dialog tjanst-dialog sm:max-w-xl" showCloseButton={false} initialFocus={keep}>
      <DialogTitle>{title}</DialogTitle><DialogDescription>{text}</DialogDescription>
      {supportNotice}
      <Problems failure={failure} checking={checking} summary={false}/>
      <div className="mandate-actions">
        <Button ref={keep} variant="outline" disabled={busy} onClick={onClose}>{keepLabel}</Button>
        <Button variant={destructive ? 'destructive' : 'default'} disabled={busy || disabled} onClick={() => void run(onConfirm)}>{busy ? busyLabel : confirmLabel}</Button>
      </div>
    </DialogContent>
  </Dialog>;
}
