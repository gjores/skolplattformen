'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import type { TjanstPlanRead, TjanstRow, TjanstTeacher, TjanstTeachingGroup } from '@/lib/tjanst-contract.ts';
import type { TjanstYearReply, TjanstYearRequest, TjanstYearRowReply } from '@/lib/tjanst-year-contract.ts';
import { coverage } from '@/lib/tjanst-model.ts';
import { lensMatches } from '@/lib/tjanst-lens.ts';
import { createYearRowEditor, selectYearTeacher, yearRowSavePayload } from '@/lib/tjanst-year-model.ts';
import { useUnsavedChanges, confirmDiscard } from '@/lib/unsaved-changes.tsx';
import { coverageText, rowTime, subjectOf, type TjanstFilter } from './tjanst-matrix';
import { TjanstRowDialog, type TjanstFailure, type TjanstOutcome, type TjanstPreparedChange, type TjanstFormCache } from './tjanst-dialogs';
import TjanstMatrixActions from './tjanst-matrix-actions';
import TjanstSharingDialog from './tjanst-sharing-dialog';
import { formatTime, type TjanstTermView } from './tjanst-service-summary';

const total = (value: { ht: number; vt: number }, term: TjanstTermView) => term === 'ht' ? value.ht : term === 'vt' ? value.vt : value.ht + value.vt;
const known = (group: TjanstTeachingGroup) => group.needHt === null || group.needVt === null ? null : { ht: group.needHt, vt: group.needVt };
export function teachingGroupEntries(data: TjanstPlanRead, filter: TjanstFilter, term: TjanstTermView, keepSource?: string) {
  return (data.groups ?? []).map(group => ({ group, need: group, rows: data.rows.filter(row => row.sourceKey === group.sourceKey),
    cov: coverage(group.sourceKey, known(group), data.rows, data.joints, data.sharing) })).filter(entry => {
    const { group, rows, cov } = entry, need = known(group), deviation = need ? total(cov.covered, term) - total(need, term) : null;
    return (!filter.classId || group.classIds.includes(filter.classId)) && (!filter.subject || subjectOf(group.label) === filter.subject)
      && (!filter.course || (group.levelCode ?? group.subjectCode) === filter.course) && (!filter.personId || rows.some(row => row.personId === filter.personId))
      && (!filter.onlyIssues || deviation !== 0 || group.stale) && (group.sourceKey === keepSource || lensMatches(entry, filter.lens, term));
  });
}
type Target = { sourceKey: string; personId: string | null; rowId: string | null };
type Editor = { read: TjanstPlanRead; target: Target; support: TjanstYearRowReply; advanced: boolean; replace: boolean };
type Undo = { revision: number; versionId: string; row: TjanstRow; previous: TjanstRow | null };
type Props = { data: TjanstPlanRead; teachers: TjanstTeacher[]; filter: TjanstFilter; term: TjanstTermView; editable: boolean; phone: boolean;
  advanced?: boolean; matrixBody?: HTMLTableSectionElement | null; inMatrix?: boolean; visible?: boolean; loadPreview: (request: TjanstYearRequest) => Promise<TjanstYearReply | TjanstFailure>;
  onSave: (change: TjanstPreparedChange, accepted?: (data: TjanstPlanRead) => void) => Promise<TjanstOutcome>;
  onFeedback?: (sourceKey: string, text: string) => void; onOpenCourse?: (code: string) => void; onBusy: (value: boolean) => void; onOpenBlocks?: () => void };

export default function TjanstGroupMatrix({ data, teachers, filter, term, editable, phone, advanced = false, matrixBody = null, inMatrix = false, visible = true, loadPreview, onSave, onBusy, onFeedback, onOpenCourse, onOpenBlocks }: Props) {
  const [supportRetry, setSupportRetry] = useState(0), [supportError, setSupportError] = useState<TjanstFailure | null>(null);
  const [busy, setBusy] = useState(false), [editor, setEditor] = useState<Editor | null>(null), [actions, setActions] = useState<Target | null>(null);
  const [sharing, setSharing] = useState<string | null>(null), [form, setForm] = useState<TjanstFormCache>({}), [dirty, setDirty] = useState(false);
  const [feedback, setFeedback] = useState<{ sourceKey: string; text: string; filterKey: string } | null>(null), [undo, setUndo] = useState<Undo | null>(null);
  const dirtyFlag = useRef(false), alive = useRef(true), latest = useRef(data), mobile = useRef(phone), running = useRef(false), focusTarget = useRef<Target | null>(null), origin = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => { latest.current = data; mobile.current = phone; dirtyFlag.current = dirty; }, [data, phone, dirty]);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  useUnsavedChanges('navigation-block:tjanst-groups', busy);
  useUnsavedChanges('tjanst-group-editor', dirty);
  const filterKey = JSON.stringify(filter), shownFeedback = feedback?.filterKey === filterKey ? feedback : null;
  const entries = teachingGroupEntries(data, filter, term, shownFeedback?.sourceKey);
  const allEntries = teachingGroupEntries(data, { classId: '', subject: '', personId: '', onlyIssues: false, course: '', lens: 'alla' }, term);
  const entryFor = (sourceKey: string) => allEntries.find(entry => entry.group.sourceKey === sourceKey);
  const name = (personId: string | null) => personId === null ? 'Vakant' : data.teachers.find(teacher => teacher.personId === personId)?.displayName ?? 'Lärare';
  function restoreFocus() {
    if (origin.current?.isConnected) { origin.current.focus(); return; }
    const target = focusTarget.current;
    if (target) document.querySelector<HTMLButtonElement>(`[data-group-source="${CSS.escape(target.sourceKey)}"][data-group-person="${CSS.escape(target.personId ?? 'vacant')}"]`)?.focus();
  }
  function close(discard = false) {
    if (running.current || !discard && dirtyFlag.current && !confirmDiscard()) return;
    dirtyFlag.current = false; setEditor(null); setActions(null); setSharing(null); setForm({}); setDirty(false);
    requestAnimationFrame(restoreFocus);
  }
  function notice(sourceKey: string, text: string) { setFeedback({ sourceKey, text, filterKey }); onFeedback?.(sourceKey, text); }
  async function run(sourceKey: string, operation: () => Promise<void>) {
    if (running.current) return;
    running.current = true; setBusy(true); onBusy(true);
    try { await operation(); }
    catch { if (alive.current) notice(sourceKey, 'Ändringen kunde inte slutföras. Kontrollera sparstatus eller hämta aktuellt läge.'); }
    finally { running.current = false; if (alive.current) { setBusy(false); onBusy(false); } }
  }
  function remember(detail: TjanstPlanRead, sourceKey: string, personId: string | null, previous: TjanstRow | null) {
    const row = detail.rows.find(value => value.sourceKey === sourceKey && value.personId === personId);
    setUndo(row && detail.version ? { revision: detail.revision, versionId: detail.version.id, row: structuredClone(row), previous: previous ? structuredClone(previous) : null } : null);
    notice(sourceKey, `Sparat · ${name(personId)}`);
  }
  async function edit(target: Target, replace = false, more = true) {
    const entry = entryFor(target.sourceKey); if (!entry || !editable) return;
    const snapshot = data;
    await run(target.sourceKey, async () => {
      const reply = await loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, mode: 'row', sourceKey: target.sourceKey, rowId: target.rowId });
      if (!alive.current || latest.current !== snapshot || mobile.current) return;
      if ('ok' in reply) { notice(target.sourceKey, reply.error); return; }
      if (reply.mode !== 'row' || reply.currentRevision !== snapshot.revision || reply.baseVersionId !== (snapshot.version?.id ?? null)) { notice(target.sourceKey, 'Underlaget har ändrats. Hämta aktuellt läge.'); return; }
      setActions(null); setForm({}); setDirty(false); setSupportError(null); setEditor({ read: snapshot, target, support: reply, replace, advanced: more });
    });
  }
  async function click(group: TjanstTeachingGroup, personId: string | null, from: HTMLElement, more: boolean) {
    if (!editable || running.current) return;
    origin.current = from;
    const entry = entryFor(group.sourceKey); if (!entry) return;
    const own = entry.rows.find(row => row.personId === personId), target = { sourceKey: group.sourceKey, personId, rowId: own?.id ?? null }; focusTarget.current = target;
    if (!more && entry.rows.some(row => row.personId !== null)) { setActions(target); return; }
    const vacancy = entry.rows.find(row => row.personId === null && row.jointGroupId === null);
    const effective = { ...target, rowId: own?.id ?? vacancy?.id ?? null };
    const need = known(group), remaining = need ? { ht: Math.max(0, need.ht - entry.cov.covered.ht), vt: Math.max(0, need.vt - entry.cov.covered.vt) } : null;
    if (more || own || personId === null || group.stale || !remaining || remaining.ht + remaining.vt === 0) { await edit(effective); return; }
    const snapshot = data;
    await run(group.sourceKey, async () => {
      const reply = await loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, mode: 'row', sourceKey: group.sourceKey, rowId: effective.rowId });
      if (!alive.current || latest.current !== snapshot || mobile.current) return;
      if ('ok' in reply) { notice(group.sourceKey, reply.error); return; }
      if (reply.mode !== 'row' || reply.currentRevision !== snapshot.revision || reply.baseVersionId !== (snapshot.version?.id ?? null)
        || reply.need.needHt !== group.needHt || reply.need.needVt !== group.needVt || reply.currentRow?.personId || reply.currentRow?.stale || reply.currentRow?.jointGroupId) { notice(group.sourceKey, 'Underlaget har ändrats. Inget har tilldelats. Hämta aktuellt läge.'); return; }
      const chosen = selectYearTeacher(createYearRowEditor(reply, entry.cov.covered), reply, { kind: 'manual', personId });
      const change: TjanstPreparedChange = { action: 'save_row', unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: reply.currentRevision,
        payload: yearRowSavePayload({ ...chosen, teacherHt: remaining.ht, teacherVt: remaining.vt }, reply) };
      const outcome = await onSave(change, detail => remember(detail, group.sourceKey, personId, reply.currentRow));
      if (!outcome.ok) notice(group.sourceKey, outcome.error); else requestAnimationFrame(restoreFocus);
    });
  }
  async function remove(row: TjanstRow) {
    if (!editable || !window.confirm('Ta bort tilldelningen från den här gruppen?')) return;
    await run(row.sourceKey, async () => {
      const reply = await loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, mode: 'catalog' });
      if ('ok' in reply) { notice(row.sourceKey, reply.error); return; }
      if (!alive.current || reply.currentRevision !== latest.current.revision) return;
      const result = await onSave({ action: 'delete_row', unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: reply.currentRevision,
        payload: { rowId: row.id, mutationContext: { baseVersionId: reply.baseVersionId, expectedBasisHash: reply.basisHash } } }, () => { setUndo(null); notice(row.sourceKey, 'Tilldelningen är borttagen.'); });
      if (result.ok) { dirtyFlag.current = false; setEditor(null); setForm({}); setDirty(false); } else notice(row.sourceKey, result.error);
    });
  }
  const undoCurrent = undo && data.revision === undo.revision && data.version?.id === undo.versionId && data.rows.some(row => JSON.stringify(row) === JSON.stringify(undo.row));
  async function undoLast() {
    if (!undo || !undoCurrent || !editable) return;
    const saved = undo;
    await run(saved.row.sourceKey, async () => {
      const reply = await loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, ...(saved.previous ? { mode: 'row' as const, sourceKey: saved.row.sourceKey, rowId: saved.row.id } : { mode: 'catalog' as const }) });
      if ('ok' in reply) { notice(saved.row.sourceKey, reply.error); return; }
      if (!alive.current || reply.currentRevision !== saved.revision || reply.baseVersionId !== saved.versionId) { setUndo(null); notice(saved.row.sourceKey, 'Underlaget har ändrats. Ändringen kan inte ångras här.'); return; }
      let change: TjanstPreparedChange;
      if (saved.previous && reply.mode === 'row') {
        const entry = entryFor(saved.row.sourceKey); if (!entry) return;
        const choice = saved.previous.personId === null ? { kind: 'unassigned' as const } : { kind: 'manual' as const, personId: saved.previous.personId };
        const chosen = selectYearTeacher(createYearRowEditor(reply, entry.cov.covered), reply, choice);
        change = { action: 'save_row', unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: reply.currentRevision, payload: yearRowSavePayload({ ...chosen, teacherHt: saved.previous.teacherHt, teacherVt: saved.previous.teacherVt, comment: saved.previous.comment }, reply) };
      } else change = { action: 'delete_row', unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: reply.currentRevision,
        payload: { rowId: saved.row.id, mutationContext: { baseVersionId: reply.baseVersionId, expectedBasisHash: reply.basisHash } } };
      const result = await onSave(change, () => { setUndo(null); notice(saved.row.sourceKey, 'Tilldelningen är ångrad.'); });
      if (!result.ok) notice(saved.row.sourceKey, result.error);
    });
  }
  async function share(action: 'save_sharing' | 'clear_sharing', mode?: 'sequential' | 'concurrent', graderPersonIds: string[] = []): Promise<TjanstOutcome> {
    if (!sharing) return { ok: false, error: 'Välj en grupp.' };
    const sourceKey = sharing;
    let outcome: TjanstOutcome = { ok: false, error: 'Delningen kunde inte sparas.' };
    await run(sourceKey, async () => {
    const reply = await loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, mode: 'catalog' });
    if ('ok' in reply) { outcome = reply; return; }
    if (!alive.current || reply.currentRevision !== latest.current.revision || reply.baseVersionId !== (latest.current.version?.id ?? null)) { outcome = { ok: false, error: 'Underlaget har ändrats. Öppna gruppens delning på nytt.' }; return; }
    const mutationContext = { baseVersionId: reply.baseVersionId, expectedBasisHash: reply.basisHash };
    const change: TjanstPreparedChange = action === 'save_sharing' && mode ? { action: 'save_sharing', unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: reply.currentRevision, payload: { sourceKey, mode, graderPersonIds, mutationContext } }
      : { action: 'clear_sharing', unitId: data.unitId, schoolYear: data.schoolYear, expectedRevision: reply.currentRevision, payload: { sourceKey, mutationContext } };
    outcome = await onSave(change, () => notice(sourceKey, 'Delningen är sparad.'));
    if (outcome.ok) { dirtyFlag.current = false; setDirty(false); setForm({}); }
    });
    return outcome;
  }
  useEffect(() => {
    if (!editor || editor.read === data || phone) return;
    let current = true;
    void loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, mode: 'row', sourceKey: editor.target.sourceKey, rowId: editor.target.rowId }).then(reply => {
      if (!current || !alive.current) return;
      if ('ok' in reply) { setSupportError(reply); return; }
      if (reply.mode !== 'row' || reply.currentRevision !== latest.current.revision || reply.baseVersionId !== (latest.current.version?.id ?? null)) { setSupportError({ ok: false, error: 'Planeringsstödet är inte aktuellt. Hämta underlaget igen.' }); return; }
      setSupportError(null);
      setEditor(previous => previous && previous.target.sourceKey === reply.sourceKey && previous.target.rowId === reply.rowId ? { ...previous, read: latest.current, support: reply } : previous);
    });
    return () => { current = false; };
  }, [data, editor, phone, loadPreview, supportRetry]);
  if (!data.groups?.length) return null;
  const editorEntry = editor ? entryFor(editor.target.sourceKey) : null;
  const actionsEntry = actions ? entryFor(actions.sourceKey) : null;
  const bodyRows = <>{inMatrix && entries.length > 0 && <tr className="tjanst-class-summary"><th colSpan={5 + teachers.length} scope="rowgroup">Valbara undervisningsgrupper {onOpenBlocks && <Button variant="ghost" onClick={onOpenBlocks}>Hantera valbara block</Button>}</th></tr>}
    {entries.map(({ group, rows, cov }, rowIndex) => <tr data-group-row={rowIndex} key={group.groupId}><th scope="row" className="tjanst-first"><strong>{group.name}</strong><small>{onOpenCourse ? <button type="button" className="tjanst-course tjanst-linklike" onClick={() => onOpenCourse(group.levelCode ?? group.subjectCode)}>{group.label}</button> : group.label} · {group.sourceRefs.map(source => source.className).filter((value, index, values) => values.indexOf(value) === index).join(', ')}</small>
        {group.stale && <p>Underlaget behöver stämmas av.</p>}{rows.filter(row => row.personId !== null).length > 1 && <Button variant="ghost" disabled={!editable || busy} onClick={event => { origin.current = event.currentTarget; setSharing(group.sourceKey); }}>Delning och betyg</Button>}
        <div className="tjanst-row-feedback"><output>{shownFeedback?.sourceKey === group.sourceKey ? shownFeedback.text : ''}</output>{undoCurrent && undo?.row.sourceKey === group.sourceKey && <Button variant="ghost" disabled={!editable || busy} onClick={() => void undoLast()}>Ångra</Button>}</div>
      </th><td className="tjanst-num">{known(group) ? formatTime(total(known(group)!, term)) : 'Okänt'}</td><td className="tjanst-num">{formatTime(total(cov.covered, term))}</td><td className="tjanst-num">{known(group) ? formatTime(total(cov.covered, term) - total(known(group)!, term)) : 'Okänt'}</td>
      {[...teachers.map(teacher => teacher.personId), null].map((personId, columnIndex) => { const matching = rows.filter(row => row.personId === personId), minutes = matching.reduce((sum, row) => sum + total(rowTime(row, data.joints), term), 0);
        return <td key={personId ?? 'vacant'} className={`tjanst-cell${personId === null ? ' tjanst-vacant' : ''}`}>{editable ? <button data-group-cell={`${rowIndex}:${columnIndex}`} data-group-source={group.sourceKey} data-group-person={personId ?? 'vacant'} disabled={busy || group.stale || !known(group)} onKeyDown={event => { if (event.shiftKey && ['Enter', ' '].includes(event.key)) { event.preventDefault(); void click(group, personId, event.currentTarget, true); return; } const table = event.currentTarget.closest('table'), row = event.currentTarget.closest('tr'); if (!table || !row) return; const col = event.currentTarget.closest('td')!.cellIndex; let next: HTMLButtonElement | null = null; if (['ArrowUp','ArrowDown'].includes(event.key)) { const direction = event.key === 'ArrowUp' ? -1 : 1; for (let index = row.rowIndex + direction; index >= 0 && index < table.rows.length; index += direction) { next = table.rows[index].cells[col]?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? null; if (next) break; } } else if (['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) { const destination = event.key === 'Home' ? 4 : event.key === 'End' ? row.cells.length - 1 : col + (event.key === 'ArrowLeft' ? -1 : 1); next = row.cells[Math.max(4, Math.min(row.cells.length - 1, destination))]?.querySelector<HTMLButtonElement>('button:not(:disabled)') ?? null; } if (next) { event.preventDefault(); next.focus(); } }} aria-label={`${name(personId)}, ${group.name}: ${matching.length ? formatTime(minutes) : 'ingen tid'}. ${matching.length ? 'Ändra' : 'Tilldela'}.`} onClick={event => void click(group, personId, event.currentTarget, advanced || event.shiftKey)}>{matching.length ? formatTime(minutes) : <span aria-hidden="true">+</span>}</button> : matching.length ? formatTime(minutes) : ''}</td>;
      })}</tr>)}</>;
  const dialogs = <>
    {!phone && actions && actionsEntry && <TjanstMatrixActions data={data} target={actions} rows={actionsEntry.rows.filter(row => row.personId !== null)} description={`${actionsEntry.group.name} · ${actionsEntry.group.label}`} onClose={() => close()}
      onReplace={row => void edit({ ...actions, rowId: row.id }, true, false)} onAdvanced={row => { const target = row && (row.id === actions.rowId || actionsEntry.rows.filter(item => item.personId !== null).length > 1) ? { ...actions, rowId: row.id, personId: row.personId } : actions; void edit(target, false, true); }}/>}
    {!phone && editor && editorEntry && <TjanstRowDialog open checking={busy} disabled={!editable || editor.read !== data} supportNotice={editor.read !== data ? supportError ? <p role="alert">{supportError.error}<Button variant="outline" onClick={() => setSupportRetry(value => value + 1)}>Hämta planeringsstöd igen</Button></p> : <output aria-busy="true">Hämtar aktuellt planeringsstöd. Dina uppgifter finns kvar.</output> : undefined} onClose={() => close()} onDiscard={() => close(true)} key={`${editor.target.sourceKey}:${editor.target.rowId}`} data={data} entry={editorEntry} target={editor.target} support={editor.support} replaceTeacher={editor.replace} advanced={editor.advanced} form={form} onField={(key, value, changed) => { setForm(previous => ({ ...previous, [key]: value })); if (changed) setDirty(true); }}
      onSave={async change => { const result = await onSave(change, detail => remember(detail, editor.target.sourceKey, change.action === 'save_row' ? change.payload.personId : null, editor.support.currentRow)); if (result.ok) { dirtyFlag.current = false; setEditor(null); setForm({}); setDirty(false); requestAnimationFrame(restoreFocus); } return result; }} onDelete={row => void remove(row)}/>}
    {!phone && sharing && <TjanstSharingDialog open checking={busy} disabled={!editable} data={data} form={form} onField={(key, value, changed) => { setForm(previous => ({ ...previous, [key]: value })); if (changed) setDirty(true); }} sourceKey={sharing} title={entryFor(sharing)?.group.name ?? 'Undervisningsgrupp'} onClose={() => close()} onDiscard={() => close(true)} onSave={(mode, graders) => share('save_sharing', mode, graders)} onClear={() => share('clear_sharing')}/>}
  </>;
  if (inMatrix) return <>{matrixBody && createPortal(bodyRows, matrixBody)}{dialogs}</>;
  if (!visible) return dialogs;
  return <section className="tjanst-group-workspace" aria-label="Valbara undervisningsgrupper" aria-busy={busy}>
    <header className="elective-heading"><div><h3>Valbara undervisningsgrupper</h3><p>Varje grupp bemannas en gång, även när eleverna kommer från flera klasser.</p></div>{onOpenBlocks && <Button variant="outline" onClick={onOpenBlocks}>Hantera valbara block</Button>}</header>
    {phone && dirty && <p>Du har en osparad gruppändring. Återgå till datorläget för att fortsätta redigera.</p>}
    {!entries.length ? <p>Inga undervisningsgrupper matchar filtret.</p> : phone ? <div className="elective-list">{entries.map(({ group, cov }) => <article className="elective-card" key={group.groupId}><h4>{group.name}</h4><p>{group.label} · {group.sourceRefs.map(source => source.className).join(', ')}</p><p>{coverageText(total(cov.covered, term), known(group) ? total(known(group)!, term) : null)}</p>{data.rows.filter(row => row.sourceKey === group.sourceKey).map(row => <p key={row.id}>{name(row.personId)} · {formatTime(total(rowTime(row, data.joints), term))}</p>)}</article>)}</div>
    : <div className="tjanst-matrix-scroll"><table className="tjanst-matrix"><caption className="sr-only">Bemanning av valbara undervisningsgrupper</caption><thead><tr><th scope="col" className="tjanst-first">Undervisningsgrupp · klass</th><th scope="col" className="tjanst-num">Behov</th><th scope="col" className="tjanst-num">Fördelat</th><th scope="col" className="tjanst-num">Avvikelse</th>{teachers.map(teacher => <th scope="col" className="tjanst-teacher" key={teacher.personId}>{teacher.displayName}</th>)}<th scope="col">Vakant</th></tr></thead><tbody>
      {bodyRows}
    </tbody></table></div>}
    {dialogs}
  </section>;
}
