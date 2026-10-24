'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { TjanstContractError, type TjanstPlanRead, type TjanstSpecialKind } from '@/lib/tjanst-contract.ts';
import { coverage, prefill, teacherSums } from '@/lib/tjanst-model.ts';
import { previewYearMove, yearCandidatePeriod } from '@/lib/tjanst-year-model.ts';
import { assertTjanstYearInputSize, assertYearRowContext, parseYearBatch, parseYearReply, type TjanstYearBatch, type TjanstYearBatchReply,
  type TjanstYearBulkItem, type TjanstYearCandidate, type TjanstYearCatalogReply, type TjanstYearChoice, type TjanstYearReply,
  type TjanstYearRequest, type TjanstYearRowReply } from '@/lib/tjanst-year-contract.ts';
import { Field, hoursInput, parseHours, Problems, type TjanstFailure, type TjanstOutcome, type TjanstPreparedChange } from './tjanst-dialogs';
import { formatTime, SPECIAL_KIND_LABEL, yearLabel } from './tjanst-service-summary';

type BulkRow = { sourceKey: string; label: string; support: TjanstYearRowReply | null; supportError: boolean; choice: TjanstYearChoice | null;
  baseVersionId: string | null; basisHash: string; revision: number; ht: string; vt: string; comment: string };
type SpecialForm = { kind: TjanstSpecialKind | ''; label: string; person: string; classId: string; ht: string; vt: string; comment: string };
const emptySpecial = (): SpecialForm => ({ kind: '', label: '', person: '', classId: '', ht: '', vt: '', comment: '' });
/** Owned by the workspace while this desktop editor is unmounted on a phone. Frozen choices and raw input survive. */
export type TjanstYearBatchDraft = { scopeKey: string; mode: 'move' | 'bulk'; snapshot: TjanstPlanRead; dirty: boolean;
  catalog: TjanstYearCatalogReply | null; sourcePerson: string; targetPerson: string; moveChoice: TjanstYearChoice | null; moveChoiceRevision: number | null;
  selected: string[]; rows: BulkRow[]; specials: Extract<TjanstYearBulkItem, { kind: 'special' }>[];
  manualPerson: string; specialForm: SpecialForm; preview: { batch: TjanstYearBatch; reply: TjanstYearBatchReply } | null };
type Props = { mode: 'move' | 'bulk'; data: TjanstPlanRead; scopeKey: string; disabled: boolean; checking: boolean;
  loadPreview: (request: TjanstYearRequest) => Promise<TjanstYearReply | TjanstFailure>;
  onSave: (prepared: TjanstPreparedChange) => Promise<TjanstOutcome>; onClose: () => void; onRefreshPlan: () => void;
  initialDraft?: TjanstYearBatchDraft; onDraftChange?: (draft: TjanstYearBatchDraft) => void };
const failure = (error: string): TjanstFailure => ({ ok: false, error });
const matches = (reply: TjanstYearReply, snapshot: TjanstPlanRead) => reply.unitId === snapshot.unitId && reply.schoolYear === snapshot.schoolYear
  && reply.currentRevision === snapshot.revision && reply.baseVersionId === (snapshot.version?.id ?? null);
const BLOCKER_LABELS = { stale_basis: 'Planeringsunderlaget har ändrats. Hämta aktuellt läge och välj på nytt.',
  person_unavailable: 'Lärarens uppgifter har ändrats. Bekräfta ett aktuellt lärarval.', suggestion_unavailable: 'Planeringsförslaget har ändrats. Välj lärare igen.',
  duplicate_row: 'Målläraren har redan en tjänsterad för samma behov.', unknown_need: 'Behovet finns inte längre i det aktuella underlaget.',
  unknown_class: 'Klassen finns inte i det aktuella läsåret.', joint_incomplete: 'Markera alla den flyttade lärarens rader i samläsningen.',
  joint_person_collision: 'Samläsningen kan inte flyttas till vakant eller till en lärare som redan ingår.',
  batch_too_large: 'Urvalet påverkar fler än 100 objekt. Minska urvalet och gör resten i nästa omgång.', wrong_scope: 'Urvalet hör inte längre till denna planering.' };

function checkedMinutes(ht: string, vt: string) {
  if (!ht.trim() || !vt.trim()) throw new Error('Ange tid för båda terminerna. Skriv 0 om uppdraget saknar tid den terminen.');
  const h = parseHours(ht), v = parseHours(vt);
  if ('error' in h) throw new Error(h.error); if ('error' in v) throw new Error(v.error);
  if (h.minutes + v.minutes === 0) throw new Error('Ange tid för minst en termin.');
  return { ht: h.minutes, vt: v.minutes };
}
function manualChoice(catalog: TjanstYearCatalogReply | TjanstYearRowReply, value: string): TjanstYearChoice {
  if (value === 'vakant') return { kind: 'unassigned', personId: null };
  const candidate = catalog.candidates.find(c => c.personId === value);
  if (!candidate) throw new Error('Välj en aktuell lärare eller Vakant.');
  return { kind: 'manual', personId: candidate.personId, expectedPersonBasisHash: candidate.personBasisHash };
}
function errorText(error: unknown): string {
  if (error instanceof TjanstContractError) return error.reason === 'tjanst_input_too_large' ? 'Urvalet är för stort att skicka. Minska urvalet eller korta kommentarerna.' : 'Kontrollera lärarval, tider och urval före förhandsvisningen.';
  return error instanceof Error ? error.message : 'Underlaget kunde inte kontrolleras. Försök igen.';
}
function CandidateFacts({ candidate, year }: { candidate: TjanstYearCandidate | undefined; year: number }) {
  if (!candidate) return null;
  return <div className="tjanst-year-candidate-facts"><strong>{candidate.displayName}</strong>
    <p>{candidate.draft ? 'Under registrering. Andel vid skolan saknas.' : yearCandidatePeriod(candidate, year) === 'part_year' ? 'Uppdraget omfattar en del av läsåret.' : 'Uppdrag finns under hela läsåret.'}</p>
    {candidate.duties.length > 0 && <ul>{candidate.duties.map(duty => <li key={duty.dutyId}>{duty.percent} % här · {duty.startsOn}–{duty.endsOn ?? 'tills vidare'}</li>)}</ul>}
    <small>Lärarbehörighet: underlag saknas.</small>
  </div>;
}

/** Secondary batch tool. All mutations go through the same workspace journal as ordinary row edits. */
export default function TjanstYearDialog({ mode, data, scopeKey, disabled, checking, loadPreview, onSave, onClose, onRefreshPlan, initialDraft, onDraftChange }: Props) {
  const id = useId();
  const [draft, setDraft] = useState<TjanstYearBatchDraft>(() => initialDraft?.scopeKey === scopeKey && initialDraft.mode === mode ? initialDraft : {
    scopeKey, mode, snapshot: structuredClone(data), dirty: false, catalog: null, sourcePerson: '', targetPerson: '', moveChoice: null, moveChoiceRevision: null,
    selected: [], rows: [], specials: [], manualPerson: '', specialForm: emptySpecial(), preview: null });
  const current = useRef(draft), lifecycle = useRef({ active: false, epoch: 0 }), busy = useRef(false), rowSequence = useRef(0), rowRequests = useRef(new Map<string, number>());
  const callbacks = useRef({ loadPreview, onDraftChange, onRefreshPlan });
  useLayoutEffect(() => { callbacks.current = { loadPreview, onDraftChange, onRefreshPlan }; }, [loadPreview, onDraftChange, onRefreshPlan]);
  const [problem, setProblem] = useState<TjanstFailure | null>(null), [loading, setLoading] = useState(false), [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState(''), [expanded, setExpanded] = useState<string | null>(null), [rowPerson, setRowPerson] = useState('');
  useLayoutEffect(() => { current.current = draft; }, [draft]);
  useEffect(() => { if (draft.scopeKey === scopeKey) callbacks.current.onDraftChange?.(draft); }, [draft, scopeKey]);
  useEffect(() => { const life = lifecycle.current, requests = rowRequests.current; life.active = true; return () => { life.active = false; life.epoch++; requests.clear(); }; }, [scopeKey]);
  function update(fn: (old: TjanstYearBatchDraft) => TjanstYearBatchDraft, markDirty = true) {
    lifecycle.current.epoch++; setProblem(null);
    setDraft(old => { const next = fn(old); current.current = { ...next, dirty: markDirty || next.dirty, preview: null }; return current.current; });
  }
  const read = useCallback(async (request: TjanstYearRequest): Promise<TjanstYearReply | TjanstFailure> => {
    try { const value = await callbacks.current.loadPreview(request); return 'ok' in value ? value : parseYearReply(value, request); }
    catch { return failure('Planeringsstödet kunde inte hämtas. Försök igen.'); }
  }, []);
  const loadCatalog = useCallback(async (snapshot = current.current.snapshot) => {
    const requestEpoch = ++lifecycle.current.epoch; setLoading(true); setProblem(null);
    const reply = await read({ unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, mode: 'catalog' });
    if (!lifecycle.current.active || requestEpoch !== lifecycle.current.epoch) return;
    setLoading(false);
    if ('ok' in reply) { setProblem(reply); return; }
    if (reply.mode !== 'catalog' || !matches(reply, snapshot)) { setProblem(failure('Planeringen har ändrats. Hämta aktuellt läge före ett nytt urval.')); callbacks.current.onRefreshPlan(); return; }
    // A new catalog never replaces an already chosen person or its frozen hash.
    setDraft(old => ({ ...old, catalog: reply, preview: null }));
  }, [read]);
  useEffect(() => { if (!current.current.catalog) void loadCatalog(); }, [loadCatalog]); // This component mounts on desktop only.

  // Read row support with bounded concurrency. Each reply is bound to the selected source and exact plan snapshot.
  useEffect(() => {
    if (!draft.catalog || mode !== 'bulk' || disabled) return;
    const pending = draft.rows.filter(r => !r.support && !r.supportError && !rowRequests.current.has(r.sourceKey));
    for (const row of pending.slice(0, Math.max(0, 4 - rowRequests.current.size))) {
      const requestId = ++rowSequence.current; rowRequests.current.set(row.sourceKey, requestId);
      const snapshot = draft.snapshot, token = `${snapshot.revision}:${snapshot.version?.id ?? ''}`, key = row.sourceKey;
      void read({ unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, mode: 'row', sourceKey: key, rowId: null }).then(reply => {
        if (!lifecycle.current.active || rowRequests.current.get(key) !== requestId) return; rowRequests.current.delete(key);
        const now = current.current;
        if (`${now.snapshot.revision}:${now.snapshot.version?.id ?? ''}` !== token || !now.rows.some(r => r.sourceKey === key)) return;
        if ('ok' in reply || reply.mode !== 'row' || !matches(reply, snapshot)) {
          setDraft(old => ({ ...old, rows: old.rows.map(r => r.sourceKey === key ? { ...r, supportError: true } : r) }));
          if ('ok' in reply) setProblem(reply); else { setProblem(failure('Planeringen har ändrats. Dina inmatade tider är kvar. Hämta aktuellt läge före nya val.')); callbacks.current.onRefreshPlan(); } return;
        }
        setDraft(old => ({ ...old, rows: old.rows.map(r => r.sourceKey !== key ? r : { ...r, support: reply,
          ...(r.choice ? {} : { baseVersionId: reply.baseVersionId, basisHash: reply.basisHash, revision: reply.currentRevision }) }) }));
      });
    }
  }, [draft.rows, draft.catalog, draft.snapshot, mode, disabled, read]);
  const snapshot = draft.snapshot, scopeChanged = draft.scopeKey !== scopeKey || snapshot.unitId !== data.unitId || snapshot.schoolYear !== data.schoolYear;
  const locked = disabled || checking || saving || scopeChanged, allNeeds = snapshot.classes.flatMap(cls => cls.needs.map(need => ({ ...need, classId: cls.classId, className: cls.name })));
  const personName = (personId: string | null) => personId === null ? 'Vakant' : draft.catalog?.candidates.find(p => p.personId === personId)?.displayName ?? snapshot.teachers.find(t => t.personId === personId)?.displayName ?? 'Lärare utanför aktuellt urval';
  const className = (classId: string | null) => classId === null ? '' : snapshot.classes.find(cls => cls.classId === classId)?.name ?? 'Tidigare klass';
  const needName = (sourceKey: string | null) => { const need = allNeeds.find(n => n.sourceKey === sourceKey); return need ? `${need.className} · ${need.label}` : draft.rows.find(row => row.sourceKey === sourceKey)?.label ?? 'Tidigare tjänsterad'; };
  const moveRows = snapshot.rows.filter(r => r.personId === draft.sourcePerson), moveSpecials = snapshot.specials.filter(s => s.personId === draft.sourcePerson);
  const unavailableSelection = draft.selected.filter(key => !moveRows.some(row => key === `row:${row.id}`) && !moveSpecials.some(item => key === `special:${item.id}`));
  const affectedGroups = snapshot.joints.filter(g => g.rowIds.some(rowId => draft.selected.includes(`row:${rowId}`)));
  const objectCount = mode === 'bulk' ? draft.rows.length + draft.specials.length : new Set([...draft.selected, ...affectedGroups.flatMap(g => g.rowIds.map(rowId => `row:${rowId}`))]).size;
  const options = <><option value="">Välj lärare</option>{draft.catalog?.candidates.map(p => <option key={p.personId} value={p.personId}>{p.displayName}{p.draft ? ' (under registrering)' : `${p.shareHere === null ? '' : ` (${p.shareHere} % här)`}${yearCandidatePeriod(p, snapshot.schoolYear) === 'part_year' ? ' · delår' : ''}`}</option>)}<option value="vakant">Vakant</option></>;
  function selectNeed(sourceKey: string, selected: boolean) {
    const need = allNeeds.find(n => n.sourceKey === sourceKey); if (!need) return;
    if (!selected) rowRequests.current.delete(sourceKey);
    update(old => { if (!selected) return { ...old, rows: old.rows.filter(r => r.sourceKey !== sourceKey) };
      if (old.rows.some(r => r.sourceKey === sourceKey)) return old;
      const allocated = coverage(sourceKey, null, snapshot.rows, snapshot.joints).covered;
      return { ...old, rows: [...old.rows, { sourceKey, label: `${need.className} · ${need.label}`, support: null, supportError: false, choice: null, baseVersionId: snapshot.version?.id ?? null, basisHash: '', revision: snapshot.revision,
        ht: hoursInput(prefill(need.needHt, allocated.ht)), vt: hoursInput(prefill(need.needVt, allocated.vt)), comment: '' }] }; });
  }
  function chooseRows(sourceKeys: string[], value: string) {
    try {
      if (!draft.catalog || !sourceKeys.length) throw new Error('Markera behov först.');
      // Every row gets its own captured support; no suggestion is selected in bulk.
      const chosen = sourceKeys.map(key => { const row = draft.rows.find(r => r.sourceKey === key);
        if (!row?.support || !matches(row.support, snapshot)) throw new Error('Vänta tills stödet för de markerade behoven har hämtats.');
        const choice = manualChoice(row.support, value);
        if (choice.kind !== 'unassigned' && draft.catalog?.candidates.find(person => person.personId === choice.personId)?.personBasisHash !== choice.expectedPersonBasisHash)
          throw new Error('Läraruppgifterna har ändrats sedan listan öppnades. Hämta nytt planeringsstöd och bekräfta valet igen.');
        return { key, support: row.support, choice }; });
      update(old => ({ ...old, rows: old.rows.map(row => { const item = chosen.find(c => c.key === row.sourceKey); return !item ? row : { ...row, choice: item.choice,
        baseVersionId: item.support.baseVersionId, basisHash: item.support.basisHash, revision: item.support.currentRevision }; }) }));
    } catch (error) { setProblem(failure(errorText(error))); }
  }
  function addSpecial() {
    try {
      if (!draft.catalog) throw new Error('Vänta tills lärarlistan har hämtats.');
      const form = draft.specialForm, time = checkedMinutes(form.ht, form.vt);
      if (!form.kind) throw new Error('Välj typ av specialuppdrag.');
      if (form.kind === 'mentor' && !snapshot.classes.some(c => c.classId === form.classId)) throw new Error('Välj en aktuell klass för mentorskapet.');
      const label = form.label.trim() || (form.kind === 'annat' ? '' : SPECIAL_KIND_LABEL[form.kind]);
      if (!label) throw new Error('Ange benämning.');
      const choice = manualChoice(draft.catalog, form.person);
      const item: Extract<TjanstYearBulkItem, { kind: 'special' }> = { itemKey: `special:${crypto.randomUUID()}`, kind: 'special', choice,
        payload: { specialId: null, kind: form.kind, label, personId: choice.personId, classId: form.kind === 'mentor' ? form.classId : null, ...time, comment: form.comment.trim() } };
      parseYearBatch({ action: 'bulk', baseVersionId: snapshot.version?.id ?? null, items: [item] }, snapshot.schoolYear);
      update(old => ({ ...old, specials: [...old.specials, item], specialForm: emptySpecial() }));
    } catch (error) { setProblem(failure(errorText(error))); }
  }
  function buildBatch(): TjanstYearBatch {
    if (objectCount > 100) throw new Error(BLOCKER_LABELS.batch_too_large);
    if (mode === 'move') {
      if (!draft.sourcePerson || !draft.moveChoice) throw new Error('Välj lärare att flytta från och bekräfta en ny lärare eller Vakant.');
      if (draft.moveChoiceRevision !== snapshot.revision) throw new Error('Planeringen har uppdaterats. Bekräfta målläraren igen efter att du granskat urvalet.');
      if (unavailableSelection.length) throw new Error('Några valda uppdrag finns inte längre i det aktuella urvalet. Avmarkera dem och välj aktuella uppdrag.');
      return parseYearBatch({ action: 'move', baseVersionId: snapshot.version?.id ?? null, items: draft.selected.map(key => ({ itemKey: key,
        kind: key.startsWith('row:') ? 'row' : 'special', id: key.slice(key.indexOf(':') + 1), fromPersonId: draft.sourcePerson, choice: draft.moveChoice })) }, snapshot.schoolYear);
    }
    if (Object.values(draft.specialForm).some(value => value !== '')) throw new Error('Lägg först till det påbörjade specialuppdraget i urvalet, eller töm dess fält.');
    const rows: TjanstYearBulkItem[] = draft.rows.map((row, index) => {
      if (!row.support || !row.choice) throw new Error(`Välj lärare eller Vakant för ${needName(row.sourceKey)}.`);
      if (row.revision !== snapshot.revision) throw new Error('Planeringen har uppdaterats. Bekräfta lärarvalen igen; dina tider finns kvar.');
      const time = checkedMinutes(row.ht, row.vt);
      const item: TjanstYearBulkItem = { itemKey: `row:${index}`, kind: 'row', payload: { rowId: null, sourceKind: 'class_timplan', sourceKey: row.sourceKey,
        personId: row.choice.personId, teacherHt: time.ht, teacherVt: time.vt, comment: row.comment.trim(),
        planningContext: { baseVersionId: row.baseVersionId, expectedBasisHash: row.basisHash, choice: row.choice } } };
      assertYearRowContext(item.payload, row.support); return item;
    });
    return parseYearBatch({ action: 'bulk', baseVersionId: snapshot.version?.id ?? null, items: [...rows, ...draft.specials] }, snapshot.schoolYear);
  }
  async function preview() {
    if (busy.current || locked) return;
    try {
      const batch = buildBatch(), request: TjanstYearRequest = { unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, mode: 'batch', batch };
      assertTjanstYearInputSize(request);
      // Reserve space for the command envelope, which is larger than a preview request.
      assertTjanstYearInputSize({ unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, commandId: '00000000-0000-4000-8000-000000000000', expectedRevision: snapshot.revision,
        action: batch.action, payloadHash: `sha256:${'0'.repeat(64)}`, payload: { ...batch, expectedPreviewHash: `sha256:${'0'.repeat(64)}` } });
      const requestEpoch = ++lifecycle.current.epoch; busy.current = true; setLoading(true); setProblem(null);
      const reply = await read(request);
      if (!lifecycle.current.active || requestEpoch !== lifecycle.current.epoch) return;
      if ('ok' in reply) { setProblem(reply); return; }
      if (reply.mode !== 'batch' || !matches(reply, snapshot)) { setProblem(failure('Planeringen har ändrats. Förhandsvisningen kan inte användas. Dina inmatade tider är kvar.')); callbacks.current.onRefreshPlan(); return; }
      setDraft(old => ({ ...old, preview: { batch: structuredClone(batch), reply } }));
    } catch (error) { setProblem(failure(errorText(error))); }
    finally { busy.current = false; if (lifecycle.current.active) setLoading(false); }
  }
  async function save() {
    if (busy.current || locked || !draft.preview || draft.preview.reply.blockers.length) return;
    const shown = draft.preview; busy.current = true; setSaving(true); setProblem(null);
    try {
      const common = { unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, expectedRevision: shown.reply.currentRevision };
      const prepared: TjanstPreparedChange = shown.batch.action === 'move'
        ? { ...common, action: 'move', payload: { ...shown.batch, expectedPreviewHash: shown.reply.previewHash } }
        : { ...common, action: 'bulk', payload: { ...shown.batch, expectedPreviewHash: shown.reply.previewHash } };
      const result = await onSave(prepared); if (!lifecycle.current.active) return;
      if (result.ok) onClose(); else { setProblem(result); setDraft(old => ({ ...old, preview: null })); }
    } catch { if (lifecycle.current.active) setProblem(failure('Sparandet kunde inte bekräftas. Kontrollera sparläget innan du försöker igen.')); }
    finally { busy.current = false; if (lifecycle.current.active) setSaving(false); }
  }
  function refreshSupport() {
    if (busy.current || locked) return;
    // Explicit refresh rebases only the displayed plan. Choices keep their old hashes/revision until actively reconfirmed.
    // Existing move IDs are never translated to copied draft IDs by name, source key or lineage.
    rowRequests.current.clear();
    update(old => ({ ...old, snapshot: structuredClone(data), catalog: null, rows: old.rows.map(row => ({ ...row, support: null, supportError: false })) }), false);
    void loadCatalog(data);
  }
  const shown = draft.preview;
  const afterMove = shown?.batch.action === 'move' && shown.batch.baseVersionId !== null && shown.reply.blockers.length === 0
    ? previewYearMove({ unitId: snapshot.unitId, schoolYear: snapshot.schoolYear }, shown.batch.baseVersionId, shown.batch.items, snapshot.rows, snapshot.specials, snapshot.joints) : null;
  const changedPeople = shown ? [...new Set(shown.reply.items.flatMap(item => [item.before?.personId, item.after?.personId]).filter((value): value is string => !!value))] : [];
  const specialForm = draft.specialForm;
  const patchSpecial = (patch: Partial<SpecialForm>) => update(old => ({ ...old, specialForm: { ...old.specialForm, ...patch } }));
  return <Dialog open onOpenChange={open => { if (!open && !saving && !checking) onClose(); }}>
    <DialogContent className="mandate-dialog tjanst-dialog tjanst-year-dialog" showCloseButton={false}>
      <DialogTitle>{mode === 'move' ? 'Flytta uppdrag' : 'Massregistrera'}</DialogTitle>
      <DialogDescription>{snapshot.schoolName} · {yearLabel(snapshot.schoolYear)}. Välj uppdragen och granska förhandsvisningen innan du sparar i samma planering.</DialogDescription>
      <Problems failure={problem} checking={checking} summary={false}/>
      {scopeChanged && <p role="alert">Skola, läsår eller uppdrag har ändrats. Stäng denna dialog och öppna verktyget i den aktuella planeringen.</p>}
      <fieldset disabled={locked || loading} className="tjanst-form">
        {!draft.catalog && <output>{loading ? 'Hämtar lärarlistan…' : 'Lärarlistan är inte tillgänglig.'}</output>}
        {draft.catalog && <p className="tjanst-muted">Lärarbehörighet: underlag saknas. Listan visar planeringsbara personer och deras andel vid skolan, inte verifierad ämnesbehörighet.</p>}
        {mode === 'move' ? <>
          <div className="tjanst-year-columns">
            <Field id={`${id}-from`} label="Flytta från lärare"><select id={`${id}-from`} value={draft.sourcePerson} onChange={event => update(old => ({ ...old, sourcePerson: event.target.value, selected: [] }))}>
              <option value="">Välj lärare</option>{snapshot.teachers.map(t => <option key={t.personId} value={t.personId}>{t.displayName}</option>)}</select></Field>
            <Field id={`${id}-to`} label="Flytta till lärare"><select id={`${id}-to`} value={draft.targetPerson} onChange={event => update(old => ({ ...old, targetPerson: event.target.value, moveChoice: null }))}>{options}</select></Field>
          </div>
          <CandidateFacts candidate={draft.catalog?.candidates.find(candidate => candidate.personId === draft.targetPerson)} year={snapshot.schoolYear}/>
          <Button type="button" variant="outline" disabled={!draft.catalog || !draft.targetPerson} onClick={() => { try { const choice = manualChoice(draft.catalog!, draft.targetPerson); update(old => ({ ...old, moveChoice: choice, moveChoiceRevision: snapshot.revision })); } catch (error) { setProblem(failure(errorText(error))); } }}>Bekräfta mållärare</Button>
          {draft.moveChoice && <output>Valt mål: {personName(draft.moveChoice.personId)}</output>}
          {unavailableSelection.length > 0 && <div className="validation-warning"><p>{unavailableSelection.length} tidigare valda uppdrag finns inte i den aktuella planeringen. Välj aktuella uppdrag efter uppdateringen.</p><Button type="button" variant="outline" onClick={() => update(old => ({ ...old, selected: old.selected.filter(key => !unavailableSelection.includes(key)) }))}>Avmarkera uppdrag som inte längre finns</Button></div>}
          {draft.sourcePerson && <section aria-label="Uppdrag att flytta"><h3>Markera uppdragen som ska flyttas</h3>
            {moveRows.map(row => <label className="tjanst-year-check" key={row.id}><input type="checkbox" checked={draft.selected.includes(`row:${row.id}`)} onChange={event => update(old => ({ ...old, selected: event.target.checked ? [...old.selected, `row:${row.id}`] : old.selected.filter(key => key !== `row:${row.id}`) }))}/>
              <span>{needName(row.sourceKey)}<small>Radens tid HT {formatTime(row.teacherHt)} · VT {formatTime(row.teacherVt)}{row.jointGroupId ? ' · Samläsning: grupptiden gäller' : ''}</small></span></label>)}
            {moveSpecials.map(special => <label className="tjanst-year-check" key={special.id}><input type="checkbox" checked={draft.selected.includes(`special:${special.id}`)} onChange={event => update(old => ({ ...old, selected: event.target.checked ? [...old.selected, `special:${special.id}`] : old.selected.filter(key => key !== `special:${special.id}`) }))}/><span>{special.label}{special.classId ? ` · ${className(special.classId)}` : ''}<small>Specialuppdrag · HT {formatTime(special.ht)} · VT {formatTime(special.vt)}</small></span></label>)}
            {!moveRows.length && !moveSpecials.length && <p>Läraren har inga uppdrag att flytta.</p>}
          </section>}
        </> : <>
          <p>Befintliga rader bevaras. Nya rader får ingen lärare förrän du gör ett aktivt val. Tiden utgår från det återstående behovet.</p>
          <Field id={`${id}-filter`} label="Sök behov"><input id={`${id}-filter`} value={filter} onChange={event => setFilter(event.target.value)} placeholder="Klass eller ämnesrad"/></Field>
          <fieldset className="tjanst-year-needs" aria-label="Behov att registrera">{allNeeds.filter(need => `${need.className} ${need.label}`.toLocaleLowerCase('sv').includes(filter.toLocaleLowerCase('sv'))).map(need => <label className="tjanst-year-check" key={need.sourceKey}>
            <input type="checkbox" checked={draft.rows.some(row => row.sourceKey === need.sourceKey)} onChange={event => selectNeed(need.sourceKey, event.target.checked)}/><span>{need.className} · {need.label}<small>Behov HT {need.needHt === null ? 'okänt' : formatTime(need.needHt)} · VT {need.needVt === null ? 'okänt' : formatTime(need.needVt)}</small></span></label>)}</fieldset>
          <Field id={`${id}-manual`} label="Lärare för markerade behov"><select id={`${id}-manual`} value={draft.manualPerson} onChange={event => update(old => ({ ...old, manualPerson: event.target.value }))}>{options}</select></Field>
          <CandidateFacts candidate={draft.catalog?.candidates.find(candidate => candidate.personId === draft.manualPerson)} year={snapshot.schoolYear}/>
          <Button type="button" variant="outline" disabled={!draft.manualPerson || !draft.rows.length || draft.rows.some(row => !row.support)} onClick={() => chooseRows(draft.rows.map(row => row.sourceKey), draft.manualPerson)}>Använd valet på markerade behov</Button>
          <small>Gäller bara behoven som redan är markerade. Senare tillagda behov börjar med tomt lärarval.</small>
          <div className="tjanst-year-selected">{draft.rows.map((row, index) => <section className="tjanst-year-item" key={row.sourceKey} aria-label={needName(row.sourceKey)}>
            <h4>{needName(row.sourceKey)}</h4><p>{row.choice ? `Vald lärare: ${personName(row.choice.personId)}` : 'Ingen lärare vald'}{row.supportError ? ' · Underlaget kunde inte hämtas' : !row.support ? ' · Hämtar radens underlag…' : ''}</p>
            <div className="tjanst-year-columns"><Field id={`${id}-ht-${index}`} label="Lärartid HT (timmar)"><input id={`${id}-ht-${index}`} inputMode="decimal" value={row.ht} onChange={event => update(old => ({ ...old, rows: old.rows.map(r => r.sourceKey === row.sourceKey ? { ...r, ht: event.target.value } : r) }))}/></Field>
              <Field id={`${id}-vt-${index}`} label="Lärartid VT (timmar)"><input id={`${id}-vt-${index}`} inputMode="decimal" value={row.vt} onChange={event => update(old => ({ ...old, rows: old.rows.map(r => r.sourceKey === row.sourceKey ? { ...r, vt: event.target.value } : r) }))}/></Field></div>
            <Field id={`${id}-comment-${index}`} label="Kommentar (valfri)"><textarea id={`${id}-comment-${index}`} maxLength={2000} value={row.comment} onChange={event => update(old => ({ ...old, rows: old.rows.map(r => r.sourceKey === row.sourceKey ? { ...r, comment: event.target.value } : r) }))}/></Field>
            <Button type="button" variant="outline" onClick={() => { setExpanded(expanded === row.sourceKey ? null : row.sourceKey); setRowPerson(''); }}>Välj lärare för denna rad</Button>
            {expanded === row.sourceKey && <div><Field id={`${id}-row-person`} label="Lärare för denna rad"><select id={`${id}-row-person`} value={rowPerson} onChange={event => setRowPerson(event.target.value)}>{options}</select></Field>
              <CandidateFacts candidate={draft.catalog?.candidates.find(candidate => candidate.personId === rowPerson)} year={snapshot.schoolYear}/>
              <Button type="button" disabled={!row.support || !rowPerson} onClick={() => { chooseRows([row.sourceKey], rowPerson); setExpanded(null); }}>Bekräfta lärarval</Button></div>}
            <Button type="button" variant="outline" onClick={() => selectNeed(row.sourceKey, false)}>Ta bort ur urvalet</Button>
          </section>)}</div>
          <details><summary>Lägg till specialuppdrag i samma omgång</summary>
            <Field id={`${id}-special-kind`} label="Typ av specialuppdrag"><select id={`${id}-special-kind`} value={specialForm.kind} onChange={event => patchSpecial({ kind: event.target.value as SpecialForm['kind'], classId: '' })}><option value="">Välj typ</option>{Object.entries(SPECIAL_KIND_LABEL).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></Field>
            <Field id={`${id}-special-label`} label="Benämning"><input id={`${id}-special-label`} value={specialForm.label} onChange={event => patchSpecial({ label: event.target.value })}/></Field>
            <Field id={`${id}-special-person`} label="Lärare för specialuppdrag"><select id={`${id}-special-person`} value={specialForm.person} onChange={event => patchSpecial({ person: event.target.value })}>{options}</select></Field>
            <CandidateFacts candidate={draft.catalog?.candidates.find(candidate => candidate.personId === specialForm.person)} year={snapshot.schoolYear}/>
            {specialForm.kind === 'mentor' && <Field id={`${id}-special-class`} label="Klass för mentorskap"><select id={`${id}-special-class`} value={specialForm.classId} onChange={event => patchSpecial({ classId: event.target.value })}><option value="">Välj klass</option>{snapshot.classes.map(cls => <option key={cls.classId} value={cls.classId}>{cls.name}</option>)}</select></Field>}
            <div className="tjanst-year-columns"><Field id={`${id}-special-ht`} label="Specialuppdrag HT (timmar)"><input id={`${id}-special-ht`} inputMode="decimal" value={specialForm.ht} onChange={event => patchSpecial({ ht: event.target.value })}/></Field>
              <Field id={`${id}-special-vt`} label="Specialuppdrag VT (timmar)"><input id={`${id}-special-vt`} inputMode="decimal" value={specialForm.vt} onChange={event => patchSpecial({ vt: event.target.value })}/></Field></div>
            <Field id={`${id}-special-comment`} label="Kommentar till specialuppdrag"><textarea id={`${id}-special-comment`} maxLength={2000} value={specialForm.comment} onChange={event => patchSpecial({ comment: event.target.value })}/></Field>
            <Button type="button" variant="outline" onClick={addSpecial}>Lägg till uppdrag i urvalet</Button>
          </details>
          {draft.specials.length > 0 && <ul className="tjanst-plain-list">{draft.specials.map(item => <li key={item.itemKey}>{item.payload.label}{item.payload.classId ? ` · ${className(item.payload.classId)}` : ''} · {personName(item.payload.personId)} · HT {formatTime(item.payload.ht)} · VT {formatTime(item.payload.vt)}
            <Button type="button" variant="outline" onClick={() => { setExpanded(expanded === item.itemKey ? null : item.itemKey); setRowPerson(''); }}>Ändra lärarval för uppdraget</Button>
            {expanded === item.itemKey && <div><Field id={`${id}-special-reselect`} label="Nytt lärarval för uppdraget"><select id={`${id}-special-reselect`} value={rowPerson} onChange={event => setRowPerson(event.target.value)}>{options}</select></Field>
              <CandidateFacts candidate={draft.catalog?.candidates.find(candidate => candidate.personId === rowPerson)} year={snapshot.schoolYear}/>
              <Button type="button" disabled={!rowPerson || !draft.catalog} onClick={() => { try { const choice = manualChoice(draft.catalog!, rowPerson); update(old => ({ ...old, specials: old.specials.map(s => s.itemKey === item.itemKey ? { ...s, choice, payload: { ...s.payload, personId: choice.personId } } : s) })); setExpanded(null); } catch (error) { setProblem(failure(errorText(error))); } }}>Bekräfta lärarval för uppdraget</Button></div>}
            <Button type="button" variant="outline" onClick={() => update(old => ({ ...old, specials: old.specials.filter(s => s.itemKey !== item.itemKey) }))}>Ta bort uppdrag ur urvalet</Button></li>)}</ul>}
        </>}
        <output>{objectCount} berörda objekt · högst 100 per omgång. Hela berörda samläsningar räknas in.</output>
        {objectCount > 100 && <p role="alert" className="validation-warning">{BLOCKER_LABELS.batch_too_large}</p>}
        <div className="mandate-actions"><Button type="button" disabled={!draft.catalog || objectCount === 0 || objectCount > 100} onClick={() => void preview()}>Förhandsvisa</Button>
          <Button type="button" variant="outline" onClick={refreshSupport}>Hämta nytt planeringsstöd</Button></div>
      </fieldset>
      {loading && <output>Kontrollerar underlaget…</output>}
      {affectedGroups.length > 0 && <section aria-label="Hela berörda samläsningar"><h3>Hela berörda samläsningar</h3>{affectedGroups.map(group => <div key={group.id} className="tjanst-year-item"><h4>{group.name}</h4>
        <ul>{group.rowIds.map(rowId => { const row = snapshot.rows.find(r => r.id === rowId); return row && <li key={rowId}>{needName(row.sourceKey)} · {personName(row.personId)} · {draft.selected.includes(`row:${rowId}`) ? 'vald för flytt' : 'bevaras'}</li>; })}</ul>
        <p>Grupptid räknas en gång per lärare:</p><ul>{group.teachers.map(teacher => <li key={teacher.personId}>{personName(teacher.personId)} · HT {formatTime(teacher.ht)} · VT {formatTime(teacher.vt)}</li>)}</ul>
        <Button type="button" variant="outline" disabled={locked || loading} onClick={() => update(old => ({ ...old, selected: [...new Set([...old.selected, ...snapshot.rows.filter(row => group.rowIds.includes(row.id) && row.personId === old.sourcePerson).map(row => `row:${row.id}`)])] }))}>Markera lärarens alla rader i samläsningen</Button>
      </div>)}</section>}
      {shown && <section aria-label="Förhandsvisning" className="tjanst-after"><h3>Förhandsvisning</h3><p>{shown.reply.selectedCount} valda uppdrag · {shown.reply.writeObjectCount} berörda objekt. Övriga uppdrag bevaras.</p>
        {shown.reply.blockers.length > 0 && <ul role="alert" className="validation-warning">{shown.reply.blockers.map((blocker, index) => {
          const item = shown.reply.items.find(i => i.itemKey === blocker.itemKey), special = draft.specials.find(s => s.itemKey === blocker.itemKey)?.payload ?? snapshot.specials.find(s => s.id === item?.id);
          const label = item?.kind === 'row' ? needName(item.sourceKey) : special ? `${special.label}${special.classId ? ` · ${className(special.classId)}` : ''}` : 'Uppdraget';
          return <li key={index}><strong>{label}{blocker.groupId ? ` · ${snapshot.joints.find(g => g.id === blocker.groupId)?.name ?? 'Samläsning'}` : ''}:</strong> {BLOCKER_LABELS[blocker.code]}</li>;
        })}</ul>}
        <div className="tjanst-year-table-scroll"><table><thead><tr><th>Uppdrag</th><th>Före</th><th>Efter</th></tr></thead><tbody>{shown.reply.items.map(item => <tr key={item.itemKey}><th scope="row">{item.kind === 'row' ? needName(item.sourceKey) : <>{draft.specials.find(s => s.itemKey === item.itemKey)?.payload.label ?? snapshot.specials.find(s => s.id === item.id)?.label ?? 'Specialuppdrag'}{item.classId ? ` · ${className(item.classId)}` : ''}</>}</th>
          <td>{item.before ? <>{personName(item.before.personId)}<small>HT {formatTime(item.before.ht)} · VT {formatTime(item.before.vt)}</small></> : 'Ny rad'}</td><td>{item.after ? <>{personName(item.after.personId)}<small>HT {formatTime(item.after.ht)} · VT {formatTime(item.after.vt)}{item.jointGroupId ? ' · Grupptid gäller' : ''}</small></> : 'Kan inte sparas'}</td></tr>)}</tbody></table></div>
        {shown.reply.jointTotals.length > 0 && <><h4>Samläsningens tid efter flytten</h4><ul>{shown.reply.jointTotals.map(time => <li key={`${time.jointId}:${time.personId}`}>{snapshot.joints.find(g => g.id === time.jointId)?.name} · {personName(time.personId)} · HT {formatTime(time.ht)} · VT {formatTime(time.vt)}</li>)}</ul><p>Andra lärares grupptid bevaras.</p></>}
        {!shown.reply.blockers.length && <><h4>Lärarnas summering före → efter</h4><ul className="tjanst-plain-list">{changedPeople.map(personId => {
          const before = teacherSums(personId, snapshot.rows, snapshot.specials, snapshot.joints), after = afterMove ? teacherSums(personId, afterMove.rows, afterMove.specials, afterMove.joints) : structuredClone(before);
          if (shown.batch.action === 'bulk') for (const item of shown.reply.items) if (item.after?.personId === personId) { const sum = item.kind === 'row' ? after.teaching : after.special; sum.ht += item.after.ht; sum.vt += item.after.vt; }
          return <li key={personId}><strong>{personName(personId)}</strong><small>Undervisning HT {formatTime(before.teaching.ht)} → {formatTime(after.teaching.ht)} · VT {formatTime(before.teaching.vt)} → {formatTime(after.teaching.vt)}</small><small>Specialuppdrag HT {formatTime(before.special.ht)} → {formatTime(after.special.ht)} · VT {formatTime(before.special.vt)} → {formatTime(after.special.vt)}</small></li>;
        })}</ul></>}
        <Button type="button" disabled={locked || loading || shown.reply.blockers.length > 0} onClick={() => void save()}>{saving ? 'Sparar…' : 'Spara ändringarna'}</Button>
      </section>}
      <div className="mandate-actions"><Button type="button" variant="outline" disabled={saving || checking} onClick={onClose}>Stäng utan att spara</Button></div>
    </DialogContent>
  </Dialog>;
}
