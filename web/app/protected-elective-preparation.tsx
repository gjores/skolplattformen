'use client';

import { useCallback, useEffect, useEffectEvent, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { confirmDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import {
  ELECTIVE_PREPARATION_VERSION, availableElectivePreparationProfiles, proposePreparationSlots,
  electivePreparationIssues, electivePreparationTotals, parseElectivePreparationRead, parseElectivePreparationCommand,
  createElectivePreparationRef, parseElectivePreparationRef, parseElectivePreparationReply, parseElectivePreparationStatus,
  assertElectivePreparationReplyCommand, assertElectivePreparationReplyHash,
  type ElectivePreparationScope, type ElectivePreparationRead, type ElectivePreparationDraft, type ElectivePreparationFrame,
  type ElectivePreparationFrameDraft, type ElectivePreparationSlot, type ElectivePreparationProfile, type ElectivePreparationRef,
  type ElectivePreparationCommand, type ElectivePreparationIssue,
} from '@/lib/elective-preparation.ts';
import type { ElectiveOption } from '@/lib/elective-block-contract.ts';
import { preparationJournalKey } from '@/lib/elective-preparation-journal.ts';
import { formatTimplanMinutes, parseTimplanMinuteInput } from '@/lib/timplan-time.ts';
import { formatTime } from './tjanst-service-summary';
import ElectiveCatalogPicker, { electiveOptionLabel, electiveCatalogId } from './elective-catalog-picker';
import MfaStepUpNotice from './mfa-step-up';
import './elective-blocks.css';
import './elective-preparation.css';

export type ElectivePreparationProps = {
  scope: ElectivePreparationScope; identityKey: string; contextEpoch: number | null;
  onSessionLost: () => void; onClose: () => void; onApplied?: (blockIds: string[]) => void; initialRows?: string[];
  onOpenBlocks?: (context: {unitId: string; schoolYear: number}) => void; onOpenTimplan?: (scope: ElectivePreparationScope) => void;
};
const endpoint = '/api/valbara-block/forberedelse/';
const uid = () => crypto.randomUUID();
const profiles: Record<ElectivePreparationProfile, string> = { single: 'Ett kursval inom hela ramen', terms: 'Två kursval – ett på hösten och ett på våren', even: 'Två lika stora kursval – dela tiden lika', custom: 'Annan fördelning' };
const time = (value: number | null) => value === null ? 'Tid saknas' : formatTime(value);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
const slotPoints = (slot: ElectivePreparationSlot) => slot.pointsHt === null ? 'null' : String(slot.pointsHt + slot.pointsVt!);
function issueMessage(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 409) return 'Underlaget har ändrats. Hämta aktuellt underlag och granska förberedelsen igen. Dina ändringar finns kvar.';
    if (error.status === 400) return 'Förberedelsen kunde inte sparas. Kontrollera kursvalens utbud, grupper och fördelning mot timplanen.';
    if (error.code === 'mfa_required') return 'Verifiera inloggningen för att fortsätta.';
    if (error.status === 403) return 'Du har inte längre åtkomst till den här förberedelsen.';
  }
  return 'Sparstatus är okänd. Kontrollera utfallet innan du gör en ny registrering.';
}
function identities(frame: ElectivePreparationFrame, profile: ElectivePreparationProfile, old?: ElectivePreparationFrameDraft) {
  const count = profile === 'single' ? 1 : profile === 'terms' || profile === 'even' ? 2 : old?.slots.length || 1;
  return Array.from({ length: count }, (_, index) => { const previous = old?.slots[index], proposed = profile === 'terms' ? `${frame.label} – ${index === 0 ? 'höstval' : 'vårval'}` : count === 1 ? frame.label : `${frame.label} – kursval ${index + 1}`; const automatic = [frame.label, `${frame.label} – höstval`, `${frame.label} – vårval`, `${frame.label} – kursval ${index + 1}`]; return { positionId: previous?.positionId ?? uid(), blockId: previous?.blockId ?? uid(), name: previous && !automatic.includes(previous.name) ? previous.name : proposed.slice(0, 160) }; });
}
function newFrame(frame: ElectivePreparationFrame, old?: ElectivePreparationFrameDraft, profile?: ElectivePreparationProfile): ElectivePreparationFrameDraft {
  const selected = profile ?? availableElectivePreparationProfiles(frame)[0] ?? 'custom';
  let slots: ElectivePreparationSlot[] = old?.slots ?? [];
  if (selected !== 'custom') slots = proposePreparationSlots(frame, selected, identities(frame, selected, old)).map((slot, index) => old?.slots[index] ? { ...slot, options: old.slots[index].options, groups: old.slots[index].groups } : slot);
  return { rowKey: frame.rowKey, detailId: frame.detailId ?? old?.detailId ?? uid(), expectedDetailRevision: frame.detailRevision, profile: selected, slots };
}
function initialDraft(data: ElectivePreparationRead, initialRows?: string[]): ElectivePreparationDraft {
  return data.preparation?.draft ?? { id: uid(), classIds: data.classes.map(value => value.classId), frames: data.frames.filter(frame => initialRows?.includes(frame.rowKey)).map(frame => newFrame(frame)) };
}
export default function ProtectedElectivePreparation(props: ElectivePreparationProps) {
  return <Workspace key={JSON.stringify([props.identityKey, props.scope, props.contextEpoch])} {...props}/>;
}
function Workspace({ scope, identityKey, contextEpoch, onSessionLost, onClose, onApplied, initialRows, onOpenBlocks, onOpenTimplan }: ElectivePreparationProps) {
  const id = useId(), feedback = useRef<HTMLDivElement>(null), generation = useRef(0), preparing = useRef(false);
  const journalKey = preparationJournalKey(identityKey, scope);
  const [data, setData] = useState<ElectivePreparationRead | null>(null), [draft, setDraft] = useState<ElectivePreparationDraft | null>(null);
  const [showAppliedDetails, setShowAppliedDetails] = useState(false), [refreshRequired, setRefreshRequired] = useState(false);
  const [baseline, setBaseline] = useState(''), [editingRevision, setEditingRevision] = useState(0), [review, setReview] = useState(false);
  const [busy, setBusy] = useState(true), [pending, setPending] = useState<ElectivePreparationRef | null>(null), [broken, setBroken] = useState(false);
  const pendingRef = useRef<ElectivePreparationRef | null>(null), commandRef = useRef<ElectivePreparationCommand | null>(null);
  const [notFound, setNotFound] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const [issues, setIssues] = useState<ElectivePreparationIssue[]>([]), [invalidCustom, setInvalidCustom] = useState<Record<string, boolean>>({});
  const dirty = !!draft && JSON.stringify(draft) !== baseline;
  const locked = busy || pending !== null || broken || refreshRequired;
  const conflict = data !== null && (data.preparation?.revision ?? 0) !== editingRevision;
  const catalogMismatch = data?.schoolform === 'gymnasium' && data.catalogId !== electiveCatalogId;
  useUnsavedChanges(`elective-preparation:${journalKey}`, dirty || pending !== null || broken);
  useUnsavedChanges(`navigation-block:elective-preparation:${journalKey}`, locked);
  function lost(caught: unknown) {
    if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403 && caught.code !== 'mfa_required')) {
      setData(null); setDraft(null); onSessionLost(); return true;
    }
    return caught instanceof DOMException && caught.name === 'AbortError';
  }
  function assign(next: ElectivePreparationRead) {
    const value = initialDraft(next, initialRows);
    setData(next); setDraft(value); setEditingRevision(next.preparation?.revision ?? 0); setBaseline(JSON.stringify(value)); setIssues([]); setInvalidCustom({}); setReview(false); setShowAppliedDetails(false); setRefreshRequired(false);
  }
  const stableScope = useMemo(() => ({unitId: scope.unitId, planId: scope.planId, schoolYear: scope.schoolYear, columnId: scope.columnId}), [scope.unitId, scope.planId, scope.schoolYear, scope.columnId]);
  const read = useCallback(async (signal?: AbortSignal) => parseElectivePreparationRead(await api.post(endpoint + 'lasa', stableScope, signal), stableScope), [stableScope]);
  const acceptRead = useEffectEvent((value: ElectivePreparationRead) => assign(value));
  const readFailure = useEffectEvent((caught: unknown) => { if (!lost(caught)) setError('Timplanens förberedelse kunde inte läsas. Försök hämta underlaget igen.'); });
  const invalidate = useEffectEvent(() => { generation.current++; });
  useEffect(() => {
    const controller = new AbortController(), token = ++generation.current;
    queueMicrotask(() => { if (token !== generation.current) return; try { const stored = sessionStorage.getItem(journalKey); if (stored) { const ref = parseElectivePreparationRef(JSON.parse(stored)); if (!same({ unitId: ref.unitId, planId: ref.planId, schoolYear: ref.schoolYear, columnId: ref.columnId }, stableScope)) throw Error(); pendingRef.current = ref; setPending(ref); } }
    catch { setBroken(true); } });
    void read(controller.signal).then(next => { if (token === generation.current) acceptRead(next); }).catch(caught => { if (!controller.signal.aborted && token === generation.current) readFailure(caught); }).finally(() => { if (token === generation.current) setBusy(false); });
    return () => { invalidate(); controller.abort(); };
  }, [journalKey, contextEpoch, read, stableScope]);
  useEffect(() => { if (error || pending || mfa || conflict || issues.length) { feedback.current?.focus(); feedback.current?.scrollIntoView({ block: 'nearest' }); } }, [error, pending, mfa, conflict, issues.length]);
  function change(next: ElectivePreparationDraft) { setDraft(next); setReview(false); setIssues([]); setError(null); setNotice(null); setShowAppliedDetails(true); }
  function updateFrame(entry: ElectivePreparationFrameDraft) { if (!draft) return; const previous = draft.frames.find(value => value.rowKey === entry.rowKey), stale = previous?.slots.filter(slot => previous.profile !== entry.profile || !entry.slots.some(next => next.blockId === slot.blockId)).map(slot => slot.blockId) ?? []; if (stale.length) setInvalidCustom(old => Object.fromEntries(Object.entries(old).filter(([field]) => !stale.includes(field)))); change({ ...draft, frames: draft.frames.map(value => value.rowKey === entry.rowKey ? entry : value) }); }
  function updateSlot(rowKey: string, slot: ElectivePreparationSlot) { const entry = draft?.frames.find(value => value.rowKey === rowKey); if (entry) updateFrame({ ...entry, slots: entry.slots.map(value => value.positionId === slot.positionId ? slot : value) }); }
  function focusIssue(issue: ElectivePreparationIssue) {
    setReview(false);
    requestAnimationFrame(() => { const target = document.getElementById(`${id}-${issue.field}`); const details = target?.closest('details'); if (details) details.open = true; target?.focus(); target?.scrollIntoView({ block: 'center' }); });
  }
  function validate(applying: boolean) {
    if (!data || !draft) return false;
    const found = electivePreparationIssues(draft, data, applying);
    if (catalogMismatch && draft.frames.some(frame => frame.slots.some(slot => slot.options.length))) found.push({field: 'source', code: 'catalog', message: 'Timplanens frysta katalog skiljer sig från den inlästa katalogen. Öppna aktuell timplan och kontrollera utbildningsunderlaget.'});
    if (applying) for (const frame of data.frames.filter(value => draft.frames.some(entry => entry.rowKey === value.rowKey))) { if (data.preparation?.appliedRevision == null && frame.detailRevision > 0) found.push({field: frame.rowKey, code: 'time_in_use', message: `Det finns redan en sparad tidsfördelning för ${frame.label} (version ${frame.detailRevision}). Fortsätt i Valbara block; förberedelsen får inte byta ut de befintliga positionerna.`}); const existing = frame.existingBlocks.filter(block => !data.preparation?.materializedBlockIds.includes(block.id)); if (existing.length) found.push({field: frame.rowKey, code: 'existing', message: `Befintliga block behöver användas eller hanteras först: ${existing.map(block => block.name).join(', ')}.`}); }
    for (const entry of draft.frames) for (const slot of entry.slots) {
      if (!slot.name.trim() || slot.name !== slot.name.trim()) found.push({ field: slot.blockId, code: 'name', message: 'Ange ett kursvalsnamn utan inledande eller avslutande blanksteg.' });
      for (const option of slot.options) if (!option.name.trim() || option.name !== option.name.trim()) found.push({ field: slot.blockId, code: 'name', message: 'Ange namnet som eleverna ska se.' });
      for (const group of slot.groups) { if (!group.name.trim() || group.name !== group.name.trim()) found.push({ field: group.id, code: 'name', message: 'Ange ett gruppnamn utan inledande eller avslutande blanksteg.' }); if (group.estimatedPupils !== null && (!Number.isInteger(group.estimatedPupils) || group.estimatedPupils < 0 || group.estimatedPupils > 10000)) found.push({field: group.id, code: 'pupils', message: 'Ange ett helt elevantal mellan 0 och 10000, eller lämna fältet tomt.'}); }
      if (slot.needHt + slot.needVt <= 0) found.push({ field: slot.blockId, code: 'time', message: 'Ange undervisningstid för kursvalet.' });
    }
    for (const [field, invalid] of Object.entries(invalidCustom)) if (invalid && draft.frames.some(entry => entry.profile === 'custom' && entry.slots.some(slot => slot.blockId === field))) found.push({ field, code: 'time', message: 'Kontrollera poäng och timmar i den egna fördelningen.' });
    setIssues(found); if (found.length) focusIssue(found[0]); return !found.length;
  }
  async function refresh(preserve = true) {
    if (busy) return;
    const token = generation.current; setBusy(true); setError(null); setMfa(false);
    try { const next = await read(); if (token !== generation.current) return; if (preserve && draft) { setData(next); setRefreshRequired(false); setReview(false); setNotice('Aktuellt underlag är hämtat. Dina ändringar finns kvar. Granska klassurval och kursupplägg innan du fortsätter.'); } else assign(next); }
    catch (caught) { if (token === generation.current && !lost(caught)) setError('Underlaget kunde inte hämtas. Dina uppgifter finns kvar.'); }
    finally { if (token === generation.current) setBusy(false); }
  }
  function clearPending() { try { sessionStorage.removeItem(journalKey); } catch { /* An already completed receipt is safe to recover again. */ } pendingRef.current = null; commandRef.current = null; setPending(null); setNotFound(false); }
  async function accept(raw: unknown, ref: ElectivePreparationRef, token: number, command?: ElectivePreparationCommand) {
    const reply = parseElectivePreparationReply(raw, ref); await assertElectivePreparationReplyHash(reply); if (command) assertElectivePreparationReplyCommand(reply, command);
    if (token !== generation.current) return;
    clearPending(); assign(reply.read); setNotice(ref.action === 'save' ? 'Förberedelsen är sparad. Du kan fortsätta här när klasser och utbud är klara.' : 'Block och gruppunderlag är skapade. Du kan nu bemanna grupperna eller förbereda elevval.');
    try { const next = await read(); if (token !== generation.current) return; assign(next); if (next.preparation?.revision !== reply.receipt.revision) setNotice('Sparningen är bekräftad. Förberedelsen har ändrats därefter; aktuellt underlag visas.'); }
    catch (caught) { if (token === generation.current && !lost(caught)) { setRefreshRequired(true); setError('Sparningen är bekräftad, men aktuellt underlag kunde inte hämtas. Läs om innan du fortsätter.'); } }
  }
  async function send(action: 'save' | 'apply') {
    if (!draft || !data || data.preparation?.appliedRevision != null || locked || preparing.current || conflict || !validate(action === 'apply')) return;
    if (action === 'apply' && !review) return;
    preparing.current = true; const token = generation.current; setBusy(true); setError(null); setNotice(null); setMfa(false);
    let sent = false;
    try {
      const command = parseElectivePreparationCommand({ ...scope, contractVersion: ELECTIVE_PREPARATION_VERSION, action, commandId: uid(), expectedRevision: editingRevision, expectedSourceHash: data.sourceHash, draft });
      const ref = await createElectivePreparationRef(command); if (token !== generation.current) return;
      sessionStorage.setItem(journalKey, JSON.stringify(ref)); pendingRef.current = ref; commandRef.current = command; setPending(ref);
      sent = true; await accept(await api.post(endpoint + 'kommando', command), ref, token, command);
    } catch (caught) {
      if (token !== generation.current || lost(caught)) return;
      if (sent && caught instanceof ApiError && caught.hasExplicitCode && [400, 403, 409].includes(caught.status)) clearPending();
      setMfa(caught instanceof ApiError && caught.code === 'mfa_required');
      setError(sent ? issueMessage(caught) : 'Sparbegäran kunde inte förberedas. Ingen begäran skickades. Kontrollera uppgifterna och att webbläsaren kan lagra en sparreferens.');
    } finally { if (token === generation.current) { preparing.current = false; setBusy(false); } }
  }
  async function checkStatus() {
    const ref = pendingRef.current; if (!ref || busy) return; const token = generation.current; setBusy(true); setError(null); setMfa(false);
    try { const result = parseElectivePreparationStatus(await api.post(endpoint + 'status', ref), ref); if (token !== generation.current) return; if (result.state === 'found') await accept(result.result, ref, token, commandRef.current ?? undefined); else { setNotFound(true); setNotice('Ingen sparad begäran hittades. Hämta aktuellt underlag innan du börjar om.'); } }
    catch (caught) { if (token === generation.current && !lost(caught)) { setMfa(caught instanceof ApiError && caught.code === 'mfa_required'); setError('Sparstatus kunde inte verifieras. Gör ingen ny registrering innan utfallet är känt.'); } }
    finally { if (token === generation.current) setBusy(false); }
  }
  async function forget() { if (busy || !confirm('Den lokala sparreferensen tas bort och aktuellt underlag hämtas. Osparade ändringar återställs. Fortsätta?')) return; clearPending(); setBroken(false); setNotice(null); await refresh(false); }
  const totals = useMemo(() => draft ? electivePreparationTotals(draft) : null, [draft]);
  if (!data || !draft) return <section className="elective-workspace preparation-workspace" aria-label="Förbered valbara block"><h2>Förbered valbara block</h2>{busy ? <p>Hämtar timplanens underlag…</p> : <><p role="alert">{error ?? 'Förberedelsen kan inte visas.'}</p><Button onClick={() => void refresh(false)}>Hämta underlag igen</Button><Button variant="outline" onClick={onClose}>Tillbaka</Button></>}</section>;
  const applied = data.preparation?.appliedRevision != null;
  const viewDraft = applied ? data.preparation!.draft : draft, viewTotals = applied ? electivePreparationTotals(viewDraft) : totals!;
  const completed = applied && data.preparation?.appliedRevision === data.preparation?.revision && !dirty && !showAppliedDetails && !locked && !error && !mfa;
  if (completed) return <section className="elective-workspace preparation-workspace" aria-label="Förbered valbara block"><h2>Block och gruppunderlag finns</h2><p>{data.planName} · {scope.schoolYear}/{String(scope.schoolYear + 1).slice(-2)}</p>{notice && <output className="elective-feedback">{notice}</output>}<p>{data.preparation!.materializedBlockIds.length} block med undervisningsgrupper finns redan. Öppna befintligt arbete för att bemanna eller fortsätta med elevvalen.</p><div className="elective-actions">{onApplied && <Button onClick={() => onApplied(data.preparation!.materializedBlockIds)}>Bemanna grupper</Button>}{onOpenBlocks && <Button variant="outline" onClick={() => onOpenBlocks({unitId: scope.unitId, schoolYear: scope.schoolYear})}>Öppna befintliga block</Button>}<Button variant="outline" onClick={onClose}>Tillbaka</Button><Button variant="ghost" onClick={() => setShowAppliedDetails(true)}>Visa sparad förberedelse</Button></div><p className="elective-muted">Elevval öppnas och lärartjänster publiceras separat. Ett återbesök skapar inga nya kopior.</p></section>;
  return <section className="elective-workspace preparation-workspace" aria-label="Förbered valbara block" aria-busy={busy}>
    <header className="elective-heading"><div><h2>{applied ? 'Sparad förberedelse' : review ? 'Granska block och gruppunderlag' : 'Förbered valbara block'}</h2><p className="elective-muted">{data.planName} · version {data.planVersion} · {scope.schoolYear}/{String(scope.schoolYear + 1).slice(-2)}</p></div><Button variant="outline" disabled={locked} onClick={() => { if (!dirty || confirmDiscard()) onClose(); }}>Tillbaka</Button></header>
    {notice && <output className="elective-feedback">{notice}</output>}
    {catalogMismatch && <div className="elective-error" role="alert"><p>Timplanens frysta katalog skiljer sig från den inlästa Skolverketskatalogen. Utbud kan inte väljas från en annan katalogversion. Öppna aktuell timplan och kontrollera utbildningsunderlaget.</p>{onOpenTimplan && <Button variant="outline" disabled={locked} onClick={() => onOpenTimplan(scope)}>Öppna timplaner för skolan</Button>}</div>}
    {!!data.blockers.length && <div className="elective-error"><p>Underlaget behöver kompletteras före skapandet.</p><ul>{data.blockers.map(value => <li key={value}>{value}</li>)}</ul>{onOpenTimplan && <Button variant="outline" disabled={locked} onClick={() => onOpenTimplan(scope)}>Öppna timplaner för skolan</Button>}</div>}
    {applied && <div className="preparation-existing"><strong>{data.preparation?.appliedRevision === data.preparation?.revision ? 'Gruppunderlag finns' : 'Tidigare gruppunderlag finns'}</strong><p>Grupperna är redan skapade. Utbud, grupper och elevval hanteras i de befintliga blocken. Timplanens godkända ram bevaras.</p>{onOpenBlocks && <Button variant="outline" disabled={locked} onClick={() => onOpenBlocks({unitId: scope.unitId, schoolYear: scope.schoolYear})}>Öppna befintliga block</Button>}{onApplied && <Button variant="outline" disabled={locked || dirty} onClick={() => onApplied(data.preparation!.materializedBlockIds)}>Bemanna grupper</Button>}</div>}
    {(review || applied) ? <div className="preparation-review">
      <p>{applied ? 'Det sparade paketet visas utan redigering. Befintliga grupper och elevval bevaras; ändringar görs i respektive block.' : 'Följande förberedelse sparas och används som gruppunderlag. Timplanens godkända poäng och undervisningstid bevaras.'}</p>
      {applied && dirty && <p className="elective-error">Ditt lokala utkast har inte sparats. Här visas det redan skapade gruppunderlaget. Ett utkast får inte skriva över det.</p>}
      <p>Klasser: {data.classes.filter(value => viewDraft.classIds.includes(value.classId)).map(value => value.className).join(', ') || 'Inga aktuella klasskopplingar'}</p>
      {viewDraft.frames.map(entry => <section key={entry.rowKey}><h3>{data.frames.find(frame => frame.rowKey === entry.rowKey)?.label}</h3>{entry.slots.map(slot => <div className="preparation-review-slot" key={slot.positionId}>
        <h4>{slot.name}</h4><p>{slot.pointsHt === null ? '' : `${slot.pointsHt + slot.pointsVt!} poäng · `}HT {time(slot.needHt)} · VT {time(slot.needVt)}</p>
        <ul>{slot.options.map(option => <li key={option.id}>{option.name}{option.name !== electiveOptionLabel(option) ? ` · ${electiveOptionLabel(option)}` : ''} · {slot.groups.filter(group => group.optionId === option.id).length} {slot.groups.filter(group => group.optionId === option.id).length === 1 ? 'grupp' : 'grupper'}
          <ul className="preparation-review-groups">{slot.groups.filter(group => group.optionId === option.id).map(group => <li key={group.id}><strong>Grupp: {group.name}</strong><span>{data.classes.filter(value => group.classIds.includes(value.classId)).map(value => value.className).join(', ') || 'Klasskoppling saknas'}{group.estimatedPupils === null ? '' : ` · uppskattat ${group.estimatedPupils} elever`}</span></li>)}</ul>
        </li>)}</ul>
      </div>)}</section>)}
      <p className="preparation-summary">{viewTotals.blocks} block · {viewTotals.groups} grupper · Elevtid HT {time(viewTotals.pupilHt)}, VT {time(viewTotals.pupilVt)} · Gruppundervisning totalt {time(viewTotals.groupHt + viewTotals.groupVt)}</p>
      <p className="elective-muted">Varje elev läser ett alternativ per kursval. Parallella grupper har egna undervisningsbehov. Skapandet öppnar inte elevval eller publicerar lärartjänster.</p>
    </div> : <fieldset disabled={locked || conflict} className="preparation-fields">
      <section id={`${id}-frames`} tabIndex={-1}><h3>Vilka valramar vill du förbereda?</h3>{data.frames.map(frame => <label className="preparation-frame-check" aria-label={`Förbered ${frame.label}`} key={frame.rowKey}><input type="checkbox" checked={draft.frames.some(entry => entry.rowKey === frame.rowKey)} onChange={event => change({ ...draft, frames: event.target.checked ? [...draft.frames, newFrame(frame)] : draft.frames.filter(entry => entry.rowKey !== frame.rowKey) })}/><span><strong>{frame.label}</strong><small>{frame.pointsHt === null ? '' : `${frame.pointsHt + frame.pointsVt!} poäng · `}HT {time(frame.needHt)} · VT {time(frame.needVt)}</small></span></label>)}{!data.frames.length && <p>Den här timplanen har inga valramar som kan förberedas.</p>}</section>
      <section id={`${id}-classes`} tabIndex={-1}><h3>Vilka klasser ska delta?</h3>{data.classes.length ? <div className="preparation-class-list">{data.classes.map(value => <label className="elective-check" key={value.classId}><input type="checkbox" checked={draft.classIds.includes(value.classId)} onChange={event => { const next = event.target.checked ? [...draft.classIds, value.classId] : draft.classIds.filter(key => key !== value.classId); change({ ...draft, classIds: next, frames: draft.frames.map(entry => ({ ...entry, slots: entry.slots.map(slot => ({ ...slot, groups: slot.groups.map(group => ({ ...group, classIds: same([...group.classIds].sort(), [...draft.classIds].sort()) || !group.classIds.length ? next : group.classIds.filter(key => next.includes(key)) })) })) })) }); }}/>{value.className}</label>)}</div> : <p className="preparation-note">Inga klasser är kopplade till den här timplanen ännu. Du kan välja upplägg och utbud och spara förberedelsen nu. Grupperna skapas när klasser har kopplats.</p>}</section>
      {draft.frames.map(entry => { const frame = data.frames.find(value => value.rowKey === entry.rowKey); if (!frame) return <p key={entry.rowKey} role="alert">Valramen finns inte längre. Hämta aktuellt underlag.</p>; const available = availableElectivePreparationProfiles(frame);
        return <section className="preparation-frame" aria-label={`${frame.label} förberedelse`} id={`${id}-${entry.rowKey}`} tabIndex={-1} key={entry.rowKey}><header><h3>{frame.label}</h3><p className="elective-muted">Tiden hämtas från timplanen. Välj hur kurserna ska läsas och vilka alternativ skolan erbjuder.</p></header>
          {data.preparation?.appliedRevision == null && frame.detailRevision > 0 && <div className="preparation-existing"><strong>Befintlig tidsfördelning · version {frame.detailRevision}</strong><p>{frame.label} har redan sparade kurspositioner. Ramens tid är HT {time(frame.needHt)} · VT {time(frame.needVt)}. Positionerna bevaras; den nya förberedelsen får inte ersätta dem.</p>{onOpenBlocks && <Button variant="outline" disabled={locked} onClick={() => onOpenBlocks({unitId: scope.unitId, schoolYear: scope.schoolYear})}>Fortsätt i Valbara block</Button>}<p className="elective-muted">Du kan spara förberedelsen som underlag. Skapandet behöver fortsätta från den befintliga tidsfördelningen.</p></div>}
          {!!frame.existingBlocks.length && <div className="preparation-existing"><strong>Befintliga block för den här valramen</strong><ul>{frame.existingBlocks.map(block => <li key={block.id}>{block.name} · version {block.revision}</li>)}</ul>{onOpenBlocks && <Button variant="outline" disabled={locked} onClick={() => onOpenBlocks({unitId: scope.unitId, schoolYear: scope.schoolYear})}>Öppna befintliga block</Button>}<p className="elective-muted">Befintliga grupper och elevval ska hanteras i sitt ursprungliga block. Ett nytt gruppunderlag får inte skapas ovanpå dem.</p></div>}
          <fieldset className="preparation-profile"><legend>När ska kurserna läsas?</legend>{available.map(profile => <label className="elective-check" key={profile}><input type="radio" name={`${id}-${entry.rowKey}-profile`} checked={entry.profile === profile} onChange={() => updateFrame(newFrame(frame, entry, profile))}/>{frame.pointsHt === null && profile === 'single' ? 'Ett val inom hela undervisningsramen' : profiles[profile]}</label>)}{!available.length && <p>Timplanens ram saknar tid eller ett passande utbud. Kontrollera timplansunderlaget före skapandet.</p>}
            {data.schoolform === 'gymnasium' && <Button type="button" variant="ghost" onClick={() => updateFrame({ ...entry, profile: 'custom' })}>Annan fördelning</Button>}
          </fieldset>
          {(frame.detailId !== null && frame.detailId !== entry.detailId || frame.detailRevision !== entry.expectedDetailRevision) && <div className="elective-error"><p>Tidsfördelningen har ändrats. Använd aktuellt underlag och granska kursvalen igen.</p><Button variant="outline" onClick={() => updateFrame(newFrame(frame, entry, entry.profile === 'custom' ? available[0] : entry.profile))}>Använd aktuellt underlag</Button></div>}
          {entry.slots.map((slot, index) => <SlotEditor key={slot.positionId} slot={slot} frame={frame} index={index} idPrefix={id} selectedClasses={draft.classIds} classes={data.classes} catalogBlocked={catalogMismatch} advanced={entry.profile === 'custom'} onInvalid={invalid => setInvalidCustom(old => ({ ...old, [slot.blockId]: invalid }))} onChange={next => updateSlot(entry.rowKey, next)}
            onRemove={() => updateFrame({ ...entry, slots: entry.slots.filter(value => value.positionId !== slot.positionId) })}
            onCopy={index > 0 && entry.slots[0].options.length > 0 ? () => { const source = entry.slots[0], allowed = frame.allowedCodesByPoints[slotPoints(slot)] ?? []; const options = source.options.filter(option => allowed.includes(option.levelCode) && !slot.options.some(existing => existing.levelCode === option.levelCode && existing.language === option.language)).map(option => ({ ...option, id: uid() })); updateSlot(entry.rowKey, { ...slot, options: [...slot.options, ...options], groups: [...slot.groups, ...options.map(option => ({ id: uid(), optionId: option.id, name: `${option.name} 1`, classIds: draft.classIds, estimatedPupils: null }))] }); } : undefined}/>) }
          {entry.profile === 'custom' && <Button type="button" variant="outline" disabled={entry.slots.length >= 16} onClick={() => updateFrame({ ...entry, slots: [...entry.slots, { positionId: uid(), blockId: uid(), name: `${frame.label} – kursval ${entry.slots.length + 1}`, pointsHt: frame.pointsHt === null ? null : 0, pointsVt: frame.pointsVt === null ? null : 0, needHt: 0, needVt: 0, options: [], groups: [] }] })}>Lägg till kursval</Button>}
        </section>;
      })}
    </fieldset>}
    <footer className="preparation-footer">
      {(error || pending || broken || mfa || conflict || issues.length > 0) && <div className="elective-error" tabIndex={-1} ref={feedback} {...(!mfa ? { role: 'alert' } : {})}>
        {mfa ? <MfaStepUpNotice message="Verifiera inloggningen för att fortsätta." detail={pending ? 'Sparreferensen finns kvar för återhämtning.' : 'Spara ett utkast före verifiering när det är möjligt. Osparade ändringar följer inte med.'} returnTo="/?vy=valbara"/> : error && <p>{error}</p>}
        {conflict && <p>Förberedelsen har fått en ny version av någon annan. Hämta den sparade versionen innan du fortsätter; ditt gamla utkast får inte skriva över den.</p>}
        {issues.length > 0 && <ul>{issues.map((issue, index) => <li key={`${issue.field}-${index}`}><button type="button" onClick={() => focusIssue(issue)}>{issue.message}</button></li>)}</ul>}
        {pending && <><p>En sparbegäran behöver kontrolleras innan du gör fler ändringar.</p><Button disabled={busy} onClick={() => void checkStatus()}>Kontrollera sparstatus</Button></>}
        {(broken || notFound) && <><p>{broken ? 'Den lokala sparreferensen kunde inte verifieras.' : 'Ingen sparad begäran hittades.'}</p><Button variant="outline" disabled={busy} onClick={() => void forget()}>Glöm lokal sparreferens och hämta underlag</Button></>}
        {!pending && !broken && !mfa && <Button variant="outline" disabled={busy} onClick={() => void refresh()}>Hämta aktuellt underlag</Button>}
        {conflict && !locked && <Button variant="outline" onClick={() => { if (!dirty || confirmDiscard()) void refresh(false); }}>Öppna sparad förberedelse</Button>}
      </div>}
      {applied ? <div className="elective-actions"><Button variant="outline" disabled={locked} onClick={() => setShowAppliedDetails(false)}>Till översikten</Button></div> : <div className="elective-actions"><Button variant="outline" disabled={locked || conflict} onClick={() => void send('save')}>Spara förberedelse</Button><div className="elective-actions">{review ? <><Button variant="outline" disabled={locked} onClick={() => setReview(false)}>Ändra förberedelsen</Button><Button disabled={locked || conflict} onClick={() => void send('apply')}>Skapa block och gruppunderlag</Button></> : <Button disabled={locked || conflict} onClick={() => { if (validate(true)) { setReview(true); setError(null); } }}>Granska förberedelsen</Button>}</div></div>}
    </footer>
  </section>;
}

type SlotEditorProps = { slot: ElectivePreparationSlot; frame: ElectivePreparationFrame; index: number; idPrefix: string; selectedClasses: string[]; classes: ElectivePreparationRead['classes']; catalogBlocked: boolean; advanced: boolean;
  onChange: (slot: ElectivePreparationSlot) => void; onRemove: () => void; onCopy?: () => void; onInvalid: (invalid: boolean) => void };
function SlotEditor({ slot, frame, index, idPrefix, selectedClasses, classes, catalogBlocked, advanced, onChange, onRemove, onCopy, onInvalid }: SlotEditorProps) {
  const [adding, setAdding] = useState(!slot.options.length);
  const allowed = catalogBlocked ? [] : frame.allowedCodesByPoints[slotPoints(slot)] ?? [];
  function add(option: ElectiveOption) { onChange({ ...slot, options: [...slot.options, option], groups: [...slot.groups, { id: uid(), optionId: option.id, name: `${option.name} 1`, classIds: selectedClasses, estimatedPupils: null }] }); setAdding(false); }
  function changeOption(option: ElectiveOption) { const old = slot.options.find(value => value.id === option.id); onChange({ ...slot, options: slot.options.map(value => value.id === option.id ? option : value), groups: slot.groups.map(group => old && group.optionId === option.id && group.name === `${old.name} 1` ? { ...group, name: `${option.name} 1` } : group) }); }
  return <section className="preparation-slot" id={`${idPrefix}-${slot.blockId}`} tabIndex={-1} aria-label={`Kursval ${index + 1}`}>
    <div className="preparation-slot-heading"><label>Namn på kursval<input aria-label={`Namn på kursval ${index + 1}`} maxLength={160} value={slot.name} onChange={event => onChange({ ...slot, name: event.target.value })}/></label><p className="preparation-time">{slot.pointsHt === null ? '' : `${slot.pointsHt + slot.pointsVt!} poäng · `}HT {time(slot.needHt)} · VT {time(slot.needVt)}</p></div>
    {advanced && <AdvancedAllocation slot={slot} onChange={onChange} onInvalid={onInvalid}/>}
    <div className="elective-heading"><h4>Alternativ som eleverna kan välja</h4>{onCopy && <Button type="button" variant="outline" disabled={!allowed.length} onClick={onCopy}>Återanvänd utbudet från kursval 1</Button>}</div>
    {slot.options.length > 0 && <ul className="preparation-options">{slot.options.map(option => <li key={option.id}><div><label>Alternativets namn<input aria-label={`Alternativets namn: ${electiveOptionLabel(option)}`} value={option.name} maxLength={200} onChange={event => changeOption({ ...option, name: event.target.value })}/></label>{option.name !== electiveOptionLabel(option) && <small>{electiveOptionLabel(option)}</small>}</div><Button type="button" variant="ghost" onClick={() => onChange({ ...slot, options: slot.options.filter(value => value.id !== option.id), groups: slot.groups.filter(group => group.optionId !== option.id) })}>Ta bort alternativ</Button></li>)}</ul>}
    {adding && <CatalogAddition key={slot.positionId} id={`${idPrefix}-${slot.blockId}-catalogue`} allowed={allowed} onAdd={add}/>}
    {!adding && <Button type="button" variant="outline" onClick={() => setAdding(true)}>Lägg till alternativ</Button>}
    {!allowed.length && <p className="elective-field-error">Inga konkreta alternativ passar kursvalets omfattning. Välj ett annat upplägg eller kontrollera timplanens ram.</p>}
    {slot.options.length > 0 && <details className="preparation-groups"><summary>Grupper och klassindelning ({slot.groups.length})</summary>{slot.options.map(option => <div className="preparation-group-set" key={option.id}><h5>{option.name}</h5>{slot.groups.filter(group => group.optionId === option.id).map(group => <div className="preparation-group" key={group.id}>
      <label>Gruppens namn<input id={`${idPrefix}-${group.id}`} value={group.name} maxLength={200} onChange={event => onChange({ ...slot, groups: slot.groups.map(value => value.id === group.id ? { ...value, name: event.target.value } : value) })}/></label>
      <label>Uppskattat elevantal<input type="number" min={0} max={10000} value={group.estimatedPupils ?? ''} onChange={event => onChange({ ...slot, groups: slot.groups.map(value => value.id === group.id ? { ...value, estimatedPupils: event.target.value === '' ? null : Number(event.target.value) } : value) })}/></label>
      <fieldset><legend>Gruppens klasser</legend>{classes.filter(value => selectedClasses.includes(value.classId)).map(value => <label className="elective-check" key={value.classId}><input type="checkbox" checked={group.classIds.includes(value.classId)} onChange={event => onChange({ ...slot, groups: slot.groups.map(other => other.id === group.id ? { ...other, classIds: event.target.checked ? [...other.classIds, value.classId] : other.classIds.filter(key => key !== value.classId) } : other) })}/>{value.className}</label>)}{!selectedClasses.length && <p>Välj klasser före skapandet. Förberedelsen kan sparas utan dem.</p>}</fieldset>
      <Button type="button" variant="ghost" onClick={() => onChange({ ...slot, groups: slot.groups.filter(value => value.id !== group.id) })}>Ta bort grupp</Button>
    </div>)}<Button type="button" variant="outline" onClick={() => onChange({ ...slot, groups: [...slot.groups, { id: uid(), optionId: option.id, name: `${option.name} ${slot.groups.filter(group => group.optionId === option.id).length + 1}`, classIds: selectedClasses, estimatedPupils: null }] })}>Lägg till grupp för {option.name}</Button></div>)}</details>}
    {advanced && <Button type="button" variant="ghost" onClick={onRemove}>Ta bort kursval</Button>}
  </section>;
}
function CatalogAddition({ id, allowed, onAdd }: { id: string; allowed: string[]; onAdd: (option: ElectiveOption) => void }) {
  const [option] = useState<ElectiveOption>(() => ({ id: uid(), name: '', subjectCode: '', levelCode: '', language: null, points: null }));
  return <ElectiveCatalogPicker id={id} option={option} allowed={allowed} disabled={!allowed.length} onSelect={onAdd}/>;
}
function AdvancedAllocation({ slot, onChange, onInvalid }: { slot: ElectivePreparationSlot; onChange: (slot: ElectivePreparationSlot) => void; onInvalid: (value: boolean) => void }) {
  const [raw, setRaw] = useState({ pointsHt: slot.pointsHt === null ? '' : String(slot.pointsHt), pointsVt: slot.pointsVt === null ? '' : String(slot.pointsVt), needHt: formatTimplanMinutes(slot.needHt), needVt: formatTimplanMinutes(slot.needVt) });
  const [invalid, setInvalid] = useState(false);
  function update(field: keyof typeof raw, value: string) {
    const next = { ...raw, [field]: value }; setRaw(next);
    const ht = parseTimplanMinuteInput(next.needHt, 6000000), vt = parseTimplanMinuteInput(next.needVt, 6000000), ph = /^\d+$/u.test(next.pointsHt) ? Number(next.pointsHt) : null, pv = /^\d+$/u.test(next.pointsVt) ? Number(next.pointsVt) : null;
    const bad = typeof ht !== 'number' || typeof vt !== 'number' || slot.pointsHt !== null && (ph === null || pv === null);
    setInvalid(bad); onInvalid(bad);
    if (!bad) onChange({ ...slot, needHt: ht!, needVt: vt!, pointsHt: slot.pointsHt === null ? null : ph, pointsVt: slot.pointsVt === null ? null : pv });
  }
  return <div className="preparation-custom"><p>Avancerad fördelning: summorna ska bevara timplanens poäng och timmar per termin.</p><div className="elective-fields">{slot.pointsHt !== null && <><label>Poäng HT<input aria-label={`Poäng HT för ${slot.name}`} inputMode="numeric" value={raw.pointsHt} onChange={event => update('pointsHt', event.target.value)}/></label><label>Poäng VT<input aria-label={`Poäng VT för ${slot.name}`} inputMode="numeric" value={raw.pointsVt} onChange={event => update('pointsVt', event.target.value)}/></label></>}<label>Timmar HT<input aria-label={`Timmar HT för ${slot.name}`} inputMode="decimal" value={raw.needHt} onChange={event => update('needHt', event.target.value)}/></label><label>Timmar VT<input aria-label={`Timmar VT för ${slot.name}`} inputMode="decimal" value={raw.needVt} onChange={event => update('needVt', event.target.value)}/></label></div>{invalid && <p className="elective-field-error">Ange giltiga poäng och undervisningstimmar.</p>}</div>;
}
