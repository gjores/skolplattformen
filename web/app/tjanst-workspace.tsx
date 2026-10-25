'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Plus, UserRoundPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/server-client.ts';
import { createPlanCommand, parsePersonalCommand, parsePersonalCommandReply, parsePlanCommandReply, parsePlanReadReply, parsePlanStatusReply,
  parseStatusReply, personalCommandRef, planCommandRef, TjanstContractError, type TjanstCommandRef, type TjanstJoint,
  type TjanstPlanRead, type TjanstRow, type TjanstSpecial } from '@/lib/tjanst-contract.ts';
import { parseYearReply, parseYearRequest, type TjanstYearRequest, type TjanstYearReply, type TjanstYearCatalogReply, type TjanstYearBasePayload as TjanstPlanPayload } from '@/lib/tjanst-year-contract.ts';
import TjanstYearDialog, { type TjanstYearBatchDraft } from './tjanst-year-dialog';
import { loadTjanstJournal, persistTjanstJournal, removeTjanstJournal, TjanstJournalError, type TjanstJournal, type TjanstJournalScope } from '@/lib/tjanst-journal.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ActiveContext } from './context-switch';
import TjanstMatrix, { EMPTY_FILTER, filterGroups, jointOf, needEntries, sortTeachers, subjectOf, TjanstClassLinkButtons, type TjanstCellTarget, type TjanstFilter, type TjanstOpenClassLinks } from './tjanst-matrix';
import { hereForStepUp, TjanstAddTeacherDialog, TjanstConfirmDialog, TjanstJointDialog, TjanstNewTeacherDialog, TjanstRowDialog, TjanstSpecialDialog,
  Problems, type TjanstPreparedChange, type TjanstFormCache, type TjanstFailure, type TjanstOutcome } from './tjanst-dialogs';
import TjanstPublishPanel, { ackSummary, dateText, STATUS_LABEL, type TjanstFeedback } from './tjanst-publish-panel';
import MfaStepUpNotice from './mfa-step-up';
import { formatTime, TERM_LABEL, yearLabel, type TjanstTermView } from './tjanst-service-summary';
import { TjanstClassView, TjanstCourseView, TjanstSpecialView, TjanstTeacherView } from './tjanst-views';
import './tjanst.css';

/**
 * Rektors och skoladministratörens vy Tjänstefördelning (TJANST-01–04). Servern avgör skolor, kolumner, behov,
 * actions, blockers och capabilities; dolda knappar är bara bekvämlighet. Läsningar och mutationer går via POST.
 * Vyn nycklas på epok, uppdrag, skola och läsår, så att ett byte tömmer innehåll, markeringar och dialoger (D-11).
 */
export type TjanstView = 'matris' | 'klass' | 'larare' | 'special' | 'kurs';
const VIEWS: { id: TjanstView; label: string }[] = [{ id: 'matris', label: 'Matris' }, { id: 'klass', label: 'Per klass' }, { id: 'larare', label: 'Per lärare' },
  { id: 'special', label: 'Specialuppdrag' }, { id: 'kurs', label: 'Per kurs/ämne' }];
const TERMS: TjanstTermView[] = ['ar', 'ht', 'vt'];
const LOCK_CODES = ['context_changed', 'assignment_ended', 'assignment_expired', 'membership_blocked'];
type TjanstPlanAction = keyof TjanstPlanPayload;
type Saved = { filter: TjanstFilter; classId: string; personId: string };
type Dialog =
  | { kind: 'row'; target: TjanstCellTarget }
  | { kind: 'special'; special: TjanstSpecial | null }
  | { kind: 'joint'; rowIds: string[]; jointId: string | null }
  | { kind: 'batch'; mode: 'move' | 'bulk' }
  | { kind: 'addTeacher' } | { kind: 'newTeacher' }
  | { kind: 'confirm'; confirm: 'removeTeacher' | 'deleteRow' | 'deleteSpecial' | 'discard' | 'dissolve' | 'publish'; id: string };
type ReadFailure = { text: string; clear: boolean; retry: boolean; correlationId: string | null };
export type TjanstWorkspaceProps = { context: ActiveContext; epoch: number; unitId: string | null; schoolYear: number;
  /** Krävs för skrivningar: journalen binds till inloggad identitet och uppdrag (tjanst-journal). */
  identityKey?: string | null; feedback?: TjanstFeedback; onOpenClassLinks?: TjanstOpenClassLinks; onSessionLost?: () => void;
  /** Huvudmannens Visa fördelningen (Bemanning): skrivskyddad, utan åtgärdsrad, panel och beslutsknapp (D-01). */
  readOnly?: boolean;
  /** Versionen som läses först. Bemanning skickar skolans publicerade version, så att huvudmannen aldrig ser rektors utkast (WR-07). */
  versionId?: string | null };

function readLocation(): { view: TjanstView; term: TjanstTermView; saved: Saved } {
  const q = new URLSearchParams(window.location.search), view = q.get('tjvy'), term = q.get('termin');
  const s = window.history.state?.tjanst as Partial<Saved> | undefined;
  const filter = s?.filter && typeof s.filter === 'object' ? { ...EMPTY_FILTER, ...s.filter } : EMPTY_FILTER;
  return { view: VIEWS.some(v => v.id === view) ? view as TjanstView : 'matris', term: term === 'ht' || term === 'vt' ? term : 'ar',
    saved: { filter, classId: typeof s?.classId === 'string' ? s.classId : '', personId: typeof s?.personId === 'string' ? s.personId : '' } };
}
/** Bara vy och termin står i adressen. Val av lärare, klass och filter ligger i history.state (POST-läsning). */
function writeLocation(view: TjanstView, term: TjanstTermView, saved: Saved, mode: 'push' | 'replace') {
  const q = new URLSearchParams(window.location.search);
  if (view === 'matris') q.delete('tjvy'); else q.set('tjvy', view);
  if (term === 'ar') q.delete('termin'); else q.set('termin', term);
  const query = q.toString(), state = { ...window.history.state, tjanst: saved };
  window.history[mode === 'push' ? 'pushState' : 'replaceState'](state, '', `${window.location.pathname}${query ? `?${query}` : ''}`);
}
function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)'), update = () => setPhone(media.matches);
    media.addEventListener('change', update); update();
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}
function readFailure(caught: unknown): ReadFailure {
  if (caught instanceof TjanstContractError) return { text: 'Tjänstefördelningens underlag kunde inte kontrolleras. Hämta det igen.', clear: true, retry: true, correlationId: null };
  if (!(caught instanceof ApiError)) return { text: 'Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.', clear: false, retry: true, correlationId: null };
  const correlationId = caught.correlationId;
  if (caught.code === 'audit_unavailable') return { text: 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.', clear: false, retry: true, correlationId };
  if (LOCK_CODES.includes(caught.code)) return { text: 'Uppdraget har ändrats. Ladda om arbetsytan.', clear: true, retry: false, correlationId };
  if (caught.status === 403) return { text: 'Ditt aktuella uppdrag tillåter inte att läsa tjänstefördelningen för den här skolan.', clear: true, retry: false, correlationId };
  return { text: 'Tjänstefördelningen kunde inte hämtas. Försök igen.', clear: false, retry: true, correlationId };
}
const REASONS: Record<string, string> = {
  tjanst_comment_too_long: 'Kommentaren får vara högst 2 000 tecken.', tjanst_joint_too_few: 'Markera minst två rader i minst två olika klasser.',
  // WR-02: en samläst rad behåller lärare och källa och kan inte tas bort så länge samläsningen finns.
  tjanst_joint_already: 'Raden ingår i en samläsning. Ändra eller lös upp samläsningen först.',
  tjanst_joint_teacher_mismatch: 'En samläsning ska ha samma lärare för alla klasser. Byt lärare på raderna eller använd Flytta uppdrag först.',
};
type Op = 'write' | 'publish' | 'personal';
const failed = (error: string, extra: Partial<TjanstFailure> = {}): TjanstFailure => ({ ok: false, error, ...extra });
const phoneViewport = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches;
const aborted = (caught: unknown) => caught instanceof DOMException && caught.name === 'AbortError';

export default function TjanstWorkspace(props: TjanstWorkspaceProps) {
  return <Workspace key={`${props.epoch}-${props.context.assignmentId}-${props.unitId ?? 'alla'}-${props.schoolYear}-${props.versionId ?? 'aktuell'}`} {...props}/>;
}

function Workspace({ context, unitId, schoolYear, identityKey = null, feedback: feedbackProp, onOpenClassLinks, onSessionLost, readOnly = false, versionId: startVersion = null }: TjanstWorkspaceProps) {
  const [initial] = useState(readLocation);
  const [view, setView] = useState<TjanstView>(initial.view), [term, setTerm] = useState<TjanstTermView>(initial.term);
  const [filter, setFilter] = useState<TjanstFilter>(initial.saved.filter), [classId, setClassId] = useState(initial.saved.classId), [personId, setPersonId] = useState(initial.saved.personId);
  const [versionId, setVersionId] = useState(startVersion ?? ''), [readKey, setReadKey] = useState(0), [readDone, setReadDone] = useState(0);
  const [data, setData] = useState<TjanstPlanRead | null>(null), [loading, setLoading] = useState(!!unitId), [readError, setReadError] = useState<ReadFailure | null>(null);
  const [notice, setNotice] = useState<string | null>(null), [pageError, setPageError] = useState<TjanstFailure | null>(null), [pendingCheck, setPendingCheck] = useState(false), [recovering, setRecovering] = useState(true);
  const [dialog, setDialog] = useState<Dialog | null>(null), [marked, setMarked] = useState<string[]>([]), [markError, setMarkError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false), [checking, setChecking] = useState(false), [busy, setBusy] = useState(false);
  const [dialogData, setDialogData] = useState<TjanstPlanRead | null>(null), [form, setForm] = useState<TjanstFormCache>({}), [formDirty, setFormDirty] = useState(false);
  const [pendingRowInput, setPendingRowInput] = useState<TjanstFormCache | null>(null);
  const [support, setSupport] = useState<TjanstYearReply | null>(null), [acceptedCatalog, setAcceptedCatalog] = useState<TjanstYearCatalogReply | null>(null);
  const [supportBusy, setSupportBusy] = useState(false), [supportError, setSupportError] = useState<TjanstFailure | null>(null), [supportKey, setSupportKey] = useState(0);
  const [batchDraft, setBatchDraft] = useState<TjanstYearBatchDraft>();
  const supportGeneration = useRef(0), supportInitialized = useRef(false), recoveryGate = useRef(true), uncertainGate = useRef(false);
  const onField = useCallback((key: string, value: unknown, dirty = true) => { setForm(old => ({ ...old, [key]: value })); if (dirty) setFormDirty(true); }, []);
  const phone = usePhone(), phoneRef = useRef(phone); useLayoutEffect(() => { phoneRef.current = phone; }, [phone]);
  const scopeKey = `${context.assignmentId}:${unitId}:${schoolYear}`;
  const active = useRef(true), generation = useRef(0), running = useRef(false), origin = useRef<HTMLElement | null>(null), lost = useRef(onSessionLost);
  const originCell = useRef<{ sourceKey: string; personId: string | null } | null>(null), focusCell = useRef<() => HTMLElement | null>(() => null);
  const viewHeading = useRef<HTMLHeadingElement>(null), headingId = useId(), pendingFocus = useRef<HTMLElement | null>(null), reading = useRef(false);
  // En läsning som redan har startat men ännu inte renderat inert får inte förbruka fokusmålet: cellen kan ersättas av läsningen
  // och fokus skulle då gå förlorat (faktiskt prov 05.1-22). Målet ligger kvar tills läsningen är klar.
  const applyFocus = useCallback(() => {
    const target = pendingFocus.current;
    // Under ett pågående kommando ritas cellerna utan knappar (inte redigerbara); vänta så att rätt cell kan hittas igen.
    if (!target || reading.current || running.current) return;
    const resolved = target.isConnected ? target : focusCell.current() ?? viewHeading.current;
    if (!resolved || resolved.closest('[inert]')) return;
    pendingFocus.current = null; resolved.focus();
  }, []);
  useLayoutEffect(() => { lost.current = onSessionLost; });
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scope = useMemo<TjanstJournalScope | null>(() => identityKey ? { identityKey, assignmentId: context.assignmentId } : null, [identityKey, context.assignmentId]);
  useUnsavedChanges('navigation-block:tjanst', busy || checking || pendingCheck);
  useUnsavedChanges('tjanst-marked', marked.length > 0);
  useUnsavedChanges('tjanst-editor', !!pendingRowInput || !!dialog && (formDirty || !!batchDraft?.dirty));

  // Varje läsning hör till en generation. Svar från en äldre generation ignoreras (Beteendekontrakt 10).
  const load = useCallback(async () => {
    if (!unitId) return;
    const token = ++generation.current, request = { unitId, schoolYear, ...(versionId ? { versionId } : {}) };
    // Innehållet är inert under läsningen, och inert tar bort fokus. Har fokus redan återställts till en cell (efter en dialog)
    // innan läsningen startar, återställs det efter läsningen i stället för att gå förlorat (faktiskt prov 05.1-12).
    const focused = document.activeElement;
    if (!pendingFocus.current && focused instanceof HTMLElement && focused.closest('.tjanst-content')) pendingFocus.current = focused;
    reading.current = true; setLoading(true);
    try {
      const reply = parsePlanReadReply(await api.post('/api/tjanst/plan/lasa', request), request);
      if (!active.current || token !== generation.current) return;
      setData(reply); setReadError(null);
    } catch (caught) {
      if (!active.current || token !== generation.current || aborted(caught)) return;
      if (caught instanceof ApiError && caught.status === 401) { lost.current?.(); return; }
      const failure = readFailure(caught);
      if (failure.clear) { setData(null); setDialog(null); setMarked([]); }
      setReadError(failure);
    } finally { if (token === generation.current) { reading.current = false; if (active.current) setReadDone(n => n + 1); } if (active.current && token === generation.current) setLoading(false); }
  }, [unitId, schoolYear, versionId]);
  const filterKey = JSON.stringify(filter);
  useEffect(() => { queueMicrotask(() => void load()); }, [load, readKey, term, filterKey]);
  const refresh = useCallback(() => setReadKey(n => n + 1), []);
  // readDone räknas upp efter varje avslutad läsning, även när loading true/false slås ihop i samma rendering.
  useEffect(() => { if (!loading && !busy) requestAnimationFrame(applyFocus); }, [loading, readDone, busy, applyFocus]);

  // Ett osäkert sparförsök från en tidigare sidvisning kontrolleras med statuskvittot, aldrig med en ny skrivning.
  const recover = useCallback(async () => {
    if (!scope || !unitId) { recoveryGate.current = false; setRecovering(false); return; }
    if (running.current) return; recoveryGate.current = true; setRecovering(true);
    let unresolved = false;
    const template = (family: 'plan' | 'personal'): TjanstCommandRef => ({ family, commandId: crypto.randomUUID(), action: family === 'plan' ? 'save_row' : 'create_draft_teacher',
      target: { unitId, schoolYear: family === 'plan' ? schoolYear : null, versionId: null, personId: null } });
    for (const family of ['plan', 'personal'] as const) {
      let journal: TjanstJournal | null = null;
      try { journal = await loadTjanstJournal(window.sessionStorage, scope, template(family)); } catch { unresolved = true; setPageError(failed('Tidigare sparstatus kunde inte läsas. Kontrollera sparstatus innan du fortsätter.')); continue; }
      if (!journal || !active.current) continue;
      setPendingCheck(true); setChecking(true); setNotice('Svaret uteblev. Vi kontrollerar om ändringen sparades.');
      try {
        const ref = journal.command;
        const raw = await api.post(`/api/tjanst/${family}/status`, { command: ref });
        const status = family === 'plan' ? parsePlanStatusReply(raw, ref) : parseStatusReply(raw, ref, value => {
          const receipt = (value as { receipt?: { commandId?: unknown } } | null)?.receipt;
          if (!receipt || typeof receipt.commandId !== 'string') throw new TjanstContractError();
          return value as { receipt: { commandId: string } };
        });
        await removeTjanstJournal(window.sessionStorage, journal);
        if (!active.current) return;
        setPendingCheck(false); setNotice(status.state === 'completed' ? 'Ändringen är sparad.' : 'Ändringen sparades inte. Gör om ändringen om den behövs.'); refresh();
      } catch (caught) {
        if (!active.current) return;
        if (caught instanceof ApiError && caught.status === 401) { lost.current?.(); return; }
        unresolved = true; setNotice(null); setPageError(failed('Det gick inte att avgöra om ändringen sparades. Hämta aktuellt läge innan du försöker igen.'));
      } finally { if (active.current) setChecking(false); }
    }
    uncertainGate.current = unresolved; recoveryGate.current = false; if (active.current) { setPendingCheck(unresolved); setRecovering(false); }
  }, [scope, unitId, schoolYear, refresh]);
  useEffect(() => { queueMicrotask(() => void recover()); }, [recover]);

  const writeFailure = useCallback((caught: ApiError, op: Op): TjanstFailure => {
    const correlationId = caught.correlationId, reload = refresh, code = caught.reason ?? caught.code;
    if (caught.code === 'mfa_required') return failed('', { mfa: op === 'publish' ? 'Att fastställa och publicera kräver verifiering med engångskod.'
      : op === 'personal' ? 'Att ändra personaluppgifter kräver verifiering med engångskod.' : 'Att ändra tjänstefördelningen kräver verifiering med engångskod.' });
    if (code === 'audit_unavailable') return failed('Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig. Dina uppgifter finns kvar i formuläret.', { correlationId, code });
    if (LOCK_CODES.includes(caught.code)) return failed('Uppdraget har ändrats. Ladda om arbetsytan.', { correlationId });
    if (caught.status === 403) return failed(op === 'publish' ? 'Bara rektor kan fastställa och publicera tjänstefördelningen.' : 'Ditt aktuella uppdrag tillåter inte ändringen.', { correlationId });
    if (caught.status === 409) return failed('Underlaget har ändrats. Dina uppgifter finns kvar. Hämta aktuellt underlag och bekräfta ditt val på nytt.', { correlationId, code, refresh: reload });
    if (caught.status === 400) return failed(REASONS[code] ?? 'Formuläret innehåller fel. Rätta de markerade fälten.', { correlationId, code });
    return failed('Ändringen kunde inte sparas. Dina uppgifter finns kvar i formuläret.', { correlationId });
  }, [refresh]);

  /** Journalen sparas före anropet; okänt utfall kontrolleras via status med samma commandId (Beteendekontrakt 6). */
  async function tracked<R extends { receipt: { commandId: string } }>(ref: TjanstCommandRef, path: string, body: unknown, parse: (value: unknown) => R, op: Op): Promise<{ ok: true; reply: R } | TjanstFailure> {
    if (!scope) return failed('Ändringen kunde inte förberedas i den här fliken. Inget har skickats.');
    let journal: TjanstJournal;
    try { journal = await persistTjanstJournal(window.sessionStorage, scope, ref); }
    catch (caught) {
      if (caught instanceof TjanstJournalError && caught.code === 'pending_journal_exists') { uncertainGate.current = true; setPendingCheck(true); return failed('Ett tidigare sparförsök behöver kontrolleras först. Välj Kontrollera sparstatus.'); }
      return failed('Ändringen kunde inte förberedas i den här fliken. Inget har skickats.');
    }
    const forget = async () => { try { await removeTjanstJournal(window.sessionStorage, journal); } catch { /* Journalen kontrolleras vid nästa visning. */ } };
    if (!active.current || phoneRef.current || phoneViewport()) { await forget(); return failed('Arbetsytan har ändrats. Inget har skickats.'); }
    try {
      const reply = parse(await api.post(path, body));
      await forget();
      return { ok: true, reply };
    } catch (caught) {
      if (aborted(caught)) return failed('Uppdraget har ändrats. Ladda om arbetsytan.');
      if (caught instanceof ApiError && caught.status === 401) { lost.current?.(); return failed('Inloggningen har upphört.'); }
      if (caught instanceof ApiError && caught.hasExplicitCode) { await forget(); return writeFailure(caught, op); }
      if (active.current) setChecking(true);
      try {
        const status = parseStatusReply(await api.post(`/api/tjanst/${ref.family}/status`, { command: ref }), ref, parse);
        await forget();
        return status.state === 'completed' ? { ok: true, reply: status.result } : failed('Ändringen sparades inte. Dina uppgifter finns kvar i formuläret.');
      } catch {
        uncertainGate.current = true; if (active.current) setPendingCheck(true);
        return failed('Det gick inte att avgöra om ändringen sparades. Hämta aktuellt läge innan du försöker igen.');
      } finally { if (active.current) setChecking(false); }
    }
  }
  const loadPreview = useCallback(async (input: TjanstYearRequest): Promise<TjanstYearReply | TjanstFailure> => {
    if (!active.current || phoneRef.current || input.unitId !== unitId || input.schoolYear !== schoolYear) return failed('Arbetsytan har ändrats.');
    try { const request = parseYearRequest(input); const raw = await api.post('/api/tjanst/plan/forhandsvisa', request);
      if (!active.current || phoneRef.current || phoneViewport()) return failed('Arbetsytan har ändrats.'); return parseYearReply(raw, request);
    } catch (caught) { if (caught instanceof ApiError && caught.status === 401) lost.current?.();
      return failed('Planeringsstödet kunde inte hämtas. Försök igen.', { correlationId: caught instanceof ApiError ? caught.correlationId : null }); }
  }, [unitId, schoolYear]);
  useEffect(() => {
    const token = ++supportGeneration.current;
    if (!dialog || !dialogData || phone || dialog.kind === 'newTeacher' || dialog.kind === 'batch') return;
    const request: TjanstYearRequest = { unitId: dialogData.unitId, schoolYear: dialogData.schoolYear, ...(dialog.kind === 'row'
      ? { mode: 'row' as const, sourceKey: dialog.target.sourceKey, rowId: dialog.target.rowId } : { mode: 'catalog' as const }) };
    let current = true;
    queueMicrotask(() => { if (current) { setSupportBusy(true); setSupportError(null); } });
    void loadPreview(request).then(reply => {
      if (!current || !active.current || token !== supportGeneration.current || phoneRef.current) return;
      setSupportBusy(false);
      if ('ok' in reply) { setSupportError(reply); return; }
      if (reply.baseVersionId !== (dialogData.version?.id ?? null) && !(supportInitialized.current && dialog.kind === 'row' && dialog.target.rowId === null)) { setSupportError(failed('Planeringen har fått en ny arbetsrevision. Dina uppgifter finns kvar. Stäng formuläret och öppna raden i aktuellt läge.', { refresh })); refresh(); return; }
      if (!supportInitialized.current && reply.currentRevision !== dialogData.revision) { setSupportError(failed('Planeringen har ändrats. Hämta aktuellt läge och öppna formuläret igen.', { refresh })); refresh(); return; }
      supportInitialized.current = true; setSupport(reply);
      // Initial context is captured once. Later reads never silently replace the chosen context.
      if (reply.mode === 'catalog') setAcceptedCatalog(old => old ?? reply);
    });
    return () => { current = false; };
  }, [dialog, dialogData, phone, supportKey, loadPreview, refresh]);
  async function sendPrepared(prepared: TjanstPreparedChange, message: (detail: TjanstPlanRead) => string = () => 'Ändringarna är sparade.'): Promise<TjanstOutcome> {
    if (!active.current || !data || !unitId || running.current || recoveryGate.current || uncertainGate.current || pendingCheck || checking || phoneRef.current || readOnly || versionId || !scope || !data.capabilities.canEdit) return failed('Vänta tills föregående ändring är klar och använd aktuell planering på dator.');
    if (!['move', 'bulk'].includes(prepared.action) && (supportBusy || supportError)) return failed('Hämta och kontrollera planeringsstödet före sparning.');
    if (prepared.unitId !== unitId || prepared.schoolYear !== schoolYear) return failed('Arbetsytan har ändrats.');
    running.current = true; setBusy(true); setNotice(null); setPageError(null);
    try {
      const command = await createPlanCommand({ ...prepared, commandId: crypto.randomUUID() });
      if (!active.current || phoneRef.current || phoneViewport()) return failed('Arbetsytan har ändrats. Inget har skickats.');
      if (!data.actions.includes(command.action)) return failed('Åtgärden är inte längre tillgänglig i aktuellt läge. Hämta aktuellt läge.');
      const result = await tracked(planCommandRef(command), command.action === 'publish' ? '/api/tjanst/plan/publicera' : '/api/tjanst/plan/kommando', command,
        value => parsePlanCommandReply(value, command), command.action === 'publish' ? 'publish' : 'write');
      if (!result.ok) {
        if (active.current && (result.code?.includes('stale') || ['tjanst_revision_conflict', 'tjanst_published_meanwhile', 'tjanst_content_changed'].includes(result.code ?? '') || result.code === 'tjanst_publish_blocked')) { setSupportKey(n => n + 1); refresh(); }
        return result;
      }
      if (!active.current) return { ok: true };
      setVersionId(''); setNotice(message(result.reply.detail)); if (phoneRef.current) close(); refresh(); return { ok: true };
    } catch { return failed('Ändringen kunde inte förberedas i den här fliken. Inget har skickats.'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }
  async function plan<A extends TjanstPlanAction>(action: A, payload: TjanstPlanPayload[A], message: (detail: TjanstPlanRead) => string): Promise<TjanstOutcome> {
    if (!acceptedCatalog || !support || support.mode !== 'catalog' || supportBusy || supportError || acceptedCatalog.basisHash !== support.basisHash || acceptedCatalog.currentRevision !== support.currentRevision) return failed('Underlaget har ändrats. Bekräfta aktuellt underlag innan du sparar.');
    const prepared = { unitId: acceptedCatalog.unitId, schoolYear: acceptedCatalog.schoolYear, action, expectedRevision: acceptedCatalog.currentRevision,
      payload: { ...payload, mutationContext: { baseVersionId: acceptedCatalog.baseVersionId, expectedBasisHash: acceptedCatalog.basisHash } },
      ...(action === 'publish' ? { expectedContentHash: dialogData?.version?.contentHash } : {}) } as TjanstPreparedChange;
    return sendPrepared(prepared, message);
  }
  async function newTeacher(draft: { givenName: string; familyName: string; draftNote: string }): Promise<TjanstOutcome> {
    if (!active.current || !data?.capabilities.canEdit || !unitId || running.current || recoveryGate.current || uncertainGate.current || pendingCheck || checking || phoneRef.current || readOnly || versionId || context.function !== 'rektor') return failed('Vänta tills föregående ändring är klar.');
    running.current = true; setBusy(true); setNotice(null);
    try {
      const command = parsePersonalCommand({ commandId: crypto.randomUUID(), action: 'create_draft_teacher', expectedRevision: 0, payload: { unitId, ...draft } });
      const result = await tracked(personalCommandRef(command), '/api/tjanst/personal/kommando', command, value => parsePersonalCommandReply(value, command, { unitId }), 'personal');
      if (!result.ok) return result;
      if (active.current) { setNotice(`${draft.givenName} ${draft.familyName} är upplagd som ny lärare. Huvudmannen kompletterar anställning och andel.`); refresh(); }
      return { ok: true };
    } catch { return failed('Uppgifterna kunde inte kontrolleras. Rätta namnen och försök igen.'); }
    finally { running.current = false; if (active.current) setBusy(false); }
  }

  // Byte av vy eller termin är en ny historikpost; filter, klass och lärare ersätter posten.
  const saved = useMemo<Saved>(() => ({ filter, classId, personId }), [filter, classId, personId]);
  const savedRef = useRef(saved);
  useLayoutEffect(() => { savedRef.current = saved; });
  useEffect(() => { writeLocation(initial.view, initial.term, initial.saved, 'replace'); }, [initial]);
  useEffect(() => {
    const pop = () => { const next = readLocation(); setView(next.view); setTerm(next.term); setFilter(next.saved.filter); setClassId(next.saved.classId); setPersonId(next.saved.personId); };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  function chooseView(next: TjanstView) { if (next === view) return; setView(next); setMarkError(null); writeLocation(next, term, savedRef.current, 'push'); }
  function chooseTerm(next: TjanstTermView) { if (next === term) return; setTerm(next); writeLocation(view, next, savedRef.current, 'push'); }
  function patchSaved(patch: Partial<Saved>) {
    const next = { ...savedRef.current, ...patch };
    if (patch.filter) setFilter(patch.filter); if (patch.classId !== undefined) setClassId(patch.classId); if (patch.personId !== undefined) setPersonId(patch.personId);
    writeLocation(view, term, next, 'replace');
  }

  // Rektor och administratör får lärarnas återkoppling i läsningen; huvudmannens läsning har den aldrig (lib/server/tjanst.ts).
  const feedback = !versionId && !readOnly ? feedbackProp ?? data?.feedback : undefined;
  const editable = !readOnly && !!data && data.capabilities.canEdit && !versionId && !phone && !!scope && !busy && !checking && !pendingCheck && !recovering;
  const can = (action: TjanstPlanAction) => editable && !!data?.actions.includes(action);
  const shownView: TjanstView = phone && view === 'matris' ? (data?.teachers.length ? 'larare' : 'klass') : view;
  const teachers = useMemo(() => data ? sortTeachers(data.teachers) : [], [data]);
  const groups = useMemo(() => data ? needEntries(data) : [], [data]);
  const filtered = useMemo(() => data ? filterGroups(groups, filter, term, data.joints) : [], [data, groups, filter, term]);
  const columns = filter.personId ? teachers.filter(t => t.personId === filter.personId) : teachers;
  useLayoutEffect(() => { focusCell.current = () => {
    const target = originCell.current; if (!target) return null;
    const row = filtered.flatMap(g => g.cls.link ? g.entries : []).findIndex(e => e.need.sourceKey === target.sourceKey);
    const column = target.personId === null ? columns.length : columns.findIndex(t => t.personId === target.personId);
    return row < 0 || column < 0 ? null : document.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`);
  }; }, [filtered, columns]);
  const subjects = useMemo(() => [...new Set(groups.flatMap(g => g.entries.map(e => subjectOf(e.need.label))))].sort((a, b) => a.localeCompare(b, 'sv')), [groups]);
  const hasFilter = !!(filter.classId || filter.subject || filter.personId || filter.onlyIssues);
  const effectivePerson = personId && data?.teachers.some(t => t.personId === personId) ? personId : teachers[0]?.personId ?? '';
  const effectiveClass = classId && data?.classes.some(c => c.classId === classId) ? classId : data?.classes[0]?.classId ?? '';
  const published = data?.versions.find(v => v.status === 'published') ?? null;
  const viewingOld = !!versionId && !!data?.version && data.version.status !== 'draft';
  // Skrivskyddat (Bemanning) listar väljaren bara publicerade och ersatta versioner; inget val leder till utkastet (WR-07).
  const choices = data ? [...data.versions].filter(v => v.status === 'published' || v.status === 'superseded')
    .sort((a, b) => b.versionNo - a.versionNo) : [];
  const showChoices = !!data && data.capabilities.canReadHistory && choices.length > 0;
  const schoolforms = data ? [...new Set(data.classes.flatMap(c => c.link ? [c.link.schoolform === 'gymnasium' ? 'Gy25' : 'GR/IM'] : []))] : [];
  const linked = data?.classes.some(c => c.link) ?? false;
  const empty = !!data && data.rows.length === 0 && data.teachers.length === 0 && data.specials.length === 0;

  function open(next: Dialog, from: HTMLElement | null) {
    if (!editable || running.current || recoveryGate.current || uncertainGate.current || !data) return;
    const cell = from?.dataset.cell?.split(':').map(Number), entry = cell ? filtered.flatMap(g => g.cls.link ? g.entries : [])[cell[0]] : null;
    originCell.current = entry && cell ? { sourceKey: entry.need.sourceKey, personId: columns[cell[1]]?.personId ?? null } : null;
    supportGeneration.current++; supportInitialized.current = false; origin.current = from; setPageError(null); setDialog(next); setDialogData(structuredClone(data)); setForm(next.kind === 'row' && pendingRowInput ? { ...pendingRowInput, resetChoice: true } : {}); setFormDirty(next.kind === 'row' && !!pendingRowInput); setPendingRowInput(null);
    setSupportBusy(false); setSupport(null); setAcceptedCatalog(null); setSupportError(null); setBatchDraft(undefined);
  }
  // Fokus återgår till cellen eller knappen som öppnade dialogen, efter omläsningen (innehållet är inert under läsning).
  function close(focus?: HTMLElement | null) { pendingFocus.current = focus ?? origin.current ?? viewHeading.current; supportGeneration.current++; setDialog(null); setForm({}); setFormDirty(false); setBatchDraft(undefined); requestAnimationFrame(applyFocus); }
  const rowName = (row: TjanstRow) => {
    const cls = data!.classes.find(c => c.classId === row.classId), need = cls?.needs.find(n => n.sourceKey === row.sourceKey);
    return { teacher: row.personId === null ? 'Vakant' : data!.teachers.find(t => t.personId === row.personId)?.displayName ?? 'Okänd lärare', course: need?.label ?? row.rowKey, cls: cls?.name ?? '' };
  };
  function linkMarked(from: HTMLElement) {
    if (!data) return;
    const rows = marked.map(id => data.rows.find(r => r.id === id)).filter((r): r is TjanstRow => !!r);
    const joinedRow = rows.find(r => r.jointGroupId !== null);
    if (joinedRow) { const n = rowName(joinedRow); setMarkError(`${n.course} ${n.cls} ingår redan i samläsningen ${jointOf(joinedRow, data.joints)?.name ?? ''}. Lös upp den först eller ändra den samläsningen.`); return; }
    if (rows.length < 2 || new Set(rows.map(r => r.classId)).size < 2) { setMarkError('Markera minst två rader i minst två olika klasser.'); return; }
    setMarkError(null); open({ kind: 'joint', rowIds: rows.map(r => r.id), jointId: null }, from);
  }
  const visibleKeys = useMemo(() => new Set(filtered.flatMap(g => g.entries.map(e => e.need.sourceKey))), [filtered]);

  if (!unitId) return <div className="admin-workspace protected-admin tjanst">
    <Heading schoolName={null} schoolYear={schoolYear} forms={[]} admin={context.function === 'administrator'} readOnly={readOnly}/>
    <div className="admin-empty tjanst-state"><h2>Välj skola</h2><p>Välj en skola i planeringsvalet. En tjänstefördelning gäller en skola.</p></div>
  </div>;

  const dialogEntry = dialog?.kind === 'row' ? (dialogData ? needEntries(dialogData) : []).flatMap(g => g.entries).find(e => e.need.sourceKey === dialog.target.sourceKey) ?? null : null;
  const jointDialog = dialog?.kind === 'joint' ? { joint: dialog.jointId ? dialogData?.joints.find(j => j.id === dialog.jointId) ?? null : null } : null;
  const confirm = dialog?.kind === 'confirm' ? dialog : null;
  const catalogStale = support?.mode === 'catalog' && acceptedCatalog !== null && (acceptedCatalog.basisHash !== support.basisHash || acceptedCatalog.currentRevision !== support.currentRevision);
  const acceptCatalog = () => { if (support?.mode !== 'catalog' || !data || support.currentRevision !== data.revision || support.baseVersionId !== (data.version?.id ?? null)) { refresh(); return; } setAcceptedCatalog(support); if (dialogData?.revision !== data.revision) setDialogData(structuredClone(data)); };
  const supportNotice = <>{supportBusy && <output aria-busy="true">Hämtar planeringsstöd…</output>}{supportError && <><Problems failure={supportError} summary={false} checking={false}/><Button type="button" variant="outline" onClick={refresh}>Hämta aktuellt läge</Button><Button type="button" variant="outline" onClick={() => setSupportKey(n => n + 1)}>Hämta planeringsstöd igen</Button></>}
    {dialog?.kind === 'row' && dialog.target.rowId !== null && dialogData && data && (data.version?.id ?? null) !== (dialogData.version?.id ?? null) && <div role="alert"><p>Den sparade raden hör till en tidigare arbetsrevision. Dina tider och din kommentar kan tas med till en rad som du väljer i aktuellt läge. Välj sedan lärare på nytt.</p>
      <Button type="button" variant="outline" onClick={() => { const carry: TjanstFormCache = {}; for (const key of ['ht', 'vt', 'comment']) if (key in form) carry[key] = form[key]; setPendingRowInput(carry); close(); }}>Välj aktuell rad</Button></div>}
    {catalogStale && <div role="alert"><p>Underlaget har ändrats. Dina uppgifter finns kvar. Granska dem före ett nytt sparförsök.</p><Button type="button" variant="outline" onClick={acceptCatalog}>Bekräfta aktuellt underlag</Button></div>}</>;
  const base = { checking, open: true, disabled: busy || checking || pendingCheck || recovering || supportBusy || !!supportError, form, onField, supportNotice };
  return <div className="admin-workspace protected-admin tjanst" aria-busy={loading}>
    <Heading schoolName={data?.schoolName ?? null} schoolYear={schoolYear} forms={schoolforms} admin={context.function === 'administrator'} readOnly={readOnly}/>
    {data && <div className="tjanst-status protected-card">
      <div className="tjanst-status-main">
        <strong>{viewingOld ? 'Historik' : data.version?.status === 'published' ? 'Publicerad' : published ? 'Ändringar ännu inte publicerade' : 'Pågående planering'}</strong>
        {data.version?.status === 'draft' && published?.publishedAt && <span>Lärarna ser version {published.versionNo}, publicerad {dateText(published.publishedAt)}.</span>}
        {data.version?.status === 'published' && !viewingOld && data.version.publishedAt && <span>Lärarna ser version {data.version.versionNo}, publicerad {dateText(data.version.publishedAt)}.</span>}
      </div>
      <div className="tjanst-status-side">
        {showChoices && !versionId && <Button variant="outline" disabled={loading || !!dialog || !!pendingRowInput || busy || pendingCheck} onClick={() => { setPendingRowInput(null); setVersionId(choices[0].id); }}>Historik</Button>}
        {!!versionId && <><label className="tjanst-inline-field">Historisk publicering<select value={versionId} disabled={loading} onChange={e => setVersionId(e.target.value)}>
          {choices.map(v => <option key={v.id} value={v.id}>Version {v.versionNo} · {v.publishedAt ? `publicerad ${dateText(v.publishedAt)}` : STATUS_LABEL[v.status]}</option>)}</select></label>
          {!readOnly && <Button variant="outline" onClick={() => setVersionId('')}>Tillbaka till planeringen</Button>}</>}
        {feedback && <span>{ackSummary(feedback)}</span>}
        {!readOnly && <Button variant="outline" aria-expanded={panelOpen} onClick={() => setPanelOpen(v => !v)}>{phone ? panelOpen ? 'Dölj publiceringsstatus' : 'Publiceringsstatus' : panelOpen ? 'Dölj Fastställ och publicera' : 'Fastställ och publicera'}</Button>}
      </div>
      {viewingOld && data.version && <p className="tjanst-readonly">Du läser version {data.version.versionNo} skrivskyddat{data.version.publishedAt ? `, publicerad ${dateText(data.version.publishedAt)} av ${data.version.publishedByName}` : ''}. {published && published.id !== data.version.id ? `Lärarna ser version ${published.versionNo}.` : data.version.status === 'published' ? `Lärarna ser den här versionen.` : ''}</p>}
      {panelOpen && !readOnly && <TjanstPublishPanel data={data} phone={phone} busy={!editable || loading} feedback={feedback} rector={context.function === 'rektor'} onPublish={() => open({ kind: 'confirm', confirm: 'publish', id: data.version!.id }, document.activeElement as HTMLElement)}
        onDiscard={() => open({ kind: 'confirm', confirm: 'discard', id: data.version!.id }, document.activeElement as HTMLElement)}/>}
    </div>}
    {phone ? <><label className="tjanst-inline-field tjanst-view-select">Vy<select value={shownView} onChange={e => chooseView(e.target.value as TjanstView)}>
      {VIEWS.filter(v => v.id !== 'matris').map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      <p className="tjanst-phone-text">Matrisen och all redigering finns på dator. Här kan du läsa fördelningen.</p></>
      : <div className="tjanst-switch"><Tabs value={shownView} onValueChange={value => chooseView(value as TjanstView)}><TabsList variant="line" aria-label="Vy">
        {VIEWS.map(v => <TabsTrigger key={v.id} value={v.id}>{v.label}</TabsTrigger>)}</TabsList></Tabs>
        <TermSwitch term={term} onTerm={chooseTerm}/></div>}
    {phone && <TermSwitch term={term} onTerm={chooseTerm}/>}
    {data && (shownView === 'matris' || shownView === 'kurs') && <div className="protected-filter tjanst-filter">
      <div className="tjanst-field"><label htmlFor={`${headingId}-klass`}>Klass</label><select id={`${headingId}-klass`} value={filter.classId} onChange={e => patchSaved({ filter: { ...filter, classId: e.target.value } })}><option value="">Alla klasser</option>{data.classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}</select></div>
      <div className="tjanst-field"><label htmlFor={`${headingId}-amne`}>Ämne</label><select id={`${headingId}-amne`} value={filter.subject} onChange={e => patchSaved({ filter: { ...filter, subject: e.target.value } })}><option value="">Alla ämnen</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      <div className="tjanst-field"><label htmlFor={`${headingId}-larare`}>Lärare</label><select id={`${headingId}-larare`} value={filter.personId} onChange={e => patchSaved({ filter: { ...filter, personId: e.target.value } })}><option value="">Alla lärare</option>{teachers.map(t => <option key={t.personId} value={t.personId}>{t.displayName}</option>)}</select></div>
      <label className="mandate-check"><input type="checkbox" checked={filter.onlyIssues} onChange={e => patchSaved({ filter: { ...filter, onlyIssues: e.target.checked } })}/>Visa bara avvikelser och saknade kopplingar</label>
      {hasFilter && <div className="mandate-actions"><Button variant="outline" onClick={() => patchSaved({ filter: EMPTY_FILTER })}>Rensa filter</Button></div>}
    </div>}
    {data && editable && <div className="mandate-actions tjanst-actions">
      {can('add_teacher') && <Button variant="outline" onClick={e => open({ kind: 'addTeacher' }, e.currentTarget)}><Plus size={16} aria-hidden="true"/>Lägg till lärare i fördelningen</Button>}
      {can('add_teacher') && context.function === 'rektor' && <Button variant="outline" onClick={e => open({ kind: 'newTeacher' }, e.currentTarget)}><UserRoundPlus size={16} aria-hidden="true"/>Lägg upp ny lärare</Button>}
      {can('save_special') && <Button variant="outline" onClick={e => open({ kind: 'special', special: null }, e.currentTarget)}><Plus size={16} aria-hidden="true"/>Lägg till specialuppdrag</Button>}
      {data.actions.includes('move') && <Button variant="outline" onClick={e => open({ kind: 'batch', mode: 'move' }, e.currentTarget)}>Flytta uppdrag</Button>}
      {data.actions.includes('bulk') && <Button variant="outline" onClick={e => open({ kind: 'batch', mode: 'bulk' }, e.currentTarget)}>Massregistrera</Button>}
      <Button variant="outline" disabled={loading} onClick={refresh}>Hämta aktuellt läge</Button>
    </div>}
    <div className="tjanst-messages">
      {pendingRowInput && <output className="admin-notice">Välj en aktuell tjänsterad. Dina tider och din kommentar tas med; välj lärare på nytt.<Button variant="outline" onClick={() => setPendingRowInput(null)}>Släpp den sparade inmatningen</Button></output>}
      {notice && !readError && !pageError && <output className="admin-notice"><CheckCheck size={16} aria-hidden="true"/><span>{notice}</span></output>}
      {pageError && !dialog && (pageError.mfa ? <MfaStepUpNotice message={pageError.mfa} returnTo={hereForStepUp()}/> : <div role="alert" className="validation-warning"><p>{pageError.error}</p>
        {pageError.correlationId && <p>Referens: {pageError.correlationId}</p>}{pageError.refresh && <Button variant="outline" onClick={() => { setPageError(null); pageError.refresh?.(); }}>Hämta aktuellt läge</Button>}</div>)}
      {phone && dialog && <output className="admin-notice"><span>Redigeringen är stängd på den här skärmstorleken. Dina uppgifter finns kvar när du öppnar vyn på dator igen.</span></output>}
      {pendingCheck && !checking && scope && <div className="mandate-actions"><Button variant="outline" onClick={() => { setPageError(null); void recover(); }}>Kontrollera sparstatus</Button></div>}
      {readError && <div role="alert" className="validation-warning"><p>{readError.text}</p>{readError.correlationId && <p>Referens: {readError.correlationId}</p>}
        {readError.retry && <Button variant="outline" aria-label="Hämta tjänstefördelningen igen" onClick={refresh}>Hämta igen</Button>}</div>}
      {loading && <output aria-busy="true">Hämtar tjänstefördelningen…</output>}
    </div>
    {data && <div className="tjanst-content" inert={loading} aria-labelledby={headingId}>
      <h2 id={headingId} ref={viewHeading} tabIndex={-1} className="sr-only">{VIEWS.find(v => v.id === shownView)!.label}</h2>
      {empty && <p>{phone ? 'Inga uppdrag har ännu fördelats för läsåret. Här kan du läsa aktuellt underlag. Planeringen görs på dator.' : 'Välj ett behov i matrisen och välj lärare på raden. Inga lärarval är förifyllda.'}</p>}
      {!linked && shownView === 'matris' ? <div className="admin-empty tjanst-state"><h2>Inga klasser med timplan</h2><p>Ingen klass på skolan har en timplan för läsåret {yearLabel(schoolYear)}. Koppla klasserna till timplaner först. En gymnasieklass behöver en koppling för varje läsår, även i årskurs 2 och 3.</p>
        {onOpenClassLinks && <TjanstClassLinkButtons onOpen={onOpenClassLinks}/>}</div>
      : hasFilter && filtered.length === 0 && (shownView === 'matris' || shownView === 'kurs') ? <div className="admin-empty tjanst-state"><p>Inga rader matchar filtret.</p><Button variant="outline" onClick={() => patchSaved({ filter: EMPTY_FILTER })}>Rensa filter</Button></div>
      : shownView === 'matris' ? <section aria-label="Matris"><TjanstMatrix data={data} groups={filtered} teachers={columns} term={term} editable={editable && can('save_row')} onOpenClassLinks={onOpenClassLinks}
          onCell={(target, from) => open({ kind: 'row', target }, from)}
          onJoint={(jointId, from) => open({ kind: 'joint', rowIds: data.joints.find(j => j.id === jointId)?.rowIds ?? [], jointId }, from)}/></section>
      : shownView === 'klass' ? <TjanstClassView data={data} groups={filtered.length ? groups.map(g => filtered.find(f => f.cls.classId === g.cls.classId) ?? g) : groups} classId={effectiveClass} term={term} onClass={id => patchSaved({ classId: id })} onOpenClassLinks={onOpenClassLinks}/>
      : shownView === 'larare' ? <TjanstTeacherView data={data} personId={effectivePerson} onTeacher={id => patchSaved({ personId: id })} feedback={feedback}/>
      : shownView === 'special' ? <TjanstSpecialView data={data} editable={can('save_special')} onEdit={(special, from) => open({ kind: 'special', special }, from)}/>
      : <TjanstCourseView data={data} editable={can('save_joint')} marked={marked} visible={visibleKeys} markError={markError} onMark={ids => { setMarked(ids); setMarkError(null); }} onLink={linkMarked}
          onEditJoint={(joint, from) => open({ kind: 'joint', rowIds: joint.rowIds, jointId: joint.id }, from)} onDissolve={(joint, from) => open({ kind: 'confirm', confirm: 'dissolve', id: joint.id }, from)}/>}
    </div>}
    {data && data.rows.some(r => !groups.some(g => g.entries.some(e => e.need.sourceKey === r.sourceKey))) && <section className="protected-card"><h2>Sparade rader som behöver stämmas av</h2><p>Dessa rader finns kvar trots att behovet saknas i aktuellt underlag.</p>
      {data.rows.filter(r => !groups.some(g => g.entries.some(e => e.need.sourceKey === r.sourceKey))).map(r => <div key={r.id}><span>{rowName(r).teacher} · {r.rowKey} · HT {formatTime(r.teacherHt)} · VT {formatTime(r.teacherVt)}</span>
        {can('delete_row') && !r.jointGroupId && <Button variant="outline" onClick={e => open({ kind: 'confirm', confirm: 'deleteRow', id: r.id }, e.currentTarget)}>Ta bort tjänsteraden…</Button>}
        {can('dissolve_joint') && r.jointGroupId && <Button variant="outline" onClick={e => open({ kind: 'confirm', confirm: 'dissolve', id: r.jointGroupId! }, e.currentTarget)}>Lös upp samläsningen…</Button>}</div>)}</section>}
    {data && can('remove_teacher') && <details className="tjanst-empty-columns"><summary>Tomma lärarkolumner</summary><p>En tom kolumn kan tas bort ur fördelningen. Personen finns kvar i Personal.</p>
      {data.teachers.filter(t => !data.rows.some(r => r.personId === t.personId) && !data.specials.some(s => s.personId === t.personId) && !data.joints.some(j => j.teachers.some(p => p.personId === t.personId))).map(t => <div key={t.personId}>{t.displayName} <Button variant="outline" onClick={e => open({ kind: 'confirm', confirm: 'removeTeacher', id: t.personId }, e.currentTarget)}>Ta bort tom lärarkolumn…</Button></div>)}</details>}
    {!phone && dialog && dialog.kind !== 'batch' && !support && <>{supportBusy && <output aria-busy="true">Hämtar planeringsstöd…</output>}
      {supportError && <div><Problems failure={supportError} summary={false} checking={false}/><Button variant="outline" onClick={() => setSupportKey(n => n + 1)}>Hämta planeringsstöd igen</Button><Button variant="outline" onClick={() => close()}>Stäng formuläret</Button></div>}
</>}
    {!phone && dialogData && dialog?.kind === 'row' && dialogEntry && support?.mode === 'row' && <TjanstRowDialog {...base} key={`${dialog.target.sourceKey}:${dialog.target.rowId}`} data={dialogData} entry={dialogEntry} target={dialog.target} support={support}
      onClose={() => close()} onDelete={row => open({ kind: 'confirm', confirm: 'deleteRow', id: row.id }, origin.current)}
      onSave={async change => {
        if (change.action !== 'save_row') return failed('Tjänsteraden kunde inte kontrolleras.');
        const payload = change.payload, who = payload.personId === null ? 'Vakant' : support.candidates.find(p => p.personId === payload.personId)?.displayName ?? dialogData.teachers.find(t => t.personId === payload.personId)?.displayName ?? 'Läraren';
        const result = await sendPrepared(change, () => `Tjänsteraden är sparad: ${who}, ${dialogEntry.need.label}, ${dialogEntry.cls.name}, HT ${formatTime(payload.teacherHt)} · VT ${formatTime(payload.teacherVt)}.`);
        return !result.ok && result.code === 'tjanst_duplicate_row' ? { ...result, error: `${who} har redan en rad för ${dialogEntry.need.label} i ${dialogEntry.cls.name}. Ändra den befintliga raden.` } : result;
      }}/>}
    {!phone && dialogData && dialog?.kind === 'special' && support?.mode === 'catalog' && <TjanstSpecialDialog {...base} key={dialog.special?.id ?? 'ny'} data={dialogData} special={dialog.special} candidates={support.candidates} onChoice={acceptCatalog}
      onClose={() => close()} onDelete={s => open({ kind: 'confirm', confirm: 'deleteSpecial', id: s.id }, origin.current)} onSave={draft => plan('save_special', { specialId: dialog.special?.id ?? null, ...draft }, () => `Specialuppdraget ${draft.label} är sparat för ${draft.personId === null ? 'Vakant' : support.candidates.find(p => p.personId === draft.personId)?.displayName ?? dialogData.teachers.find(t => t.personId === draft.personId)?.displayName ?? 'läraren'}.`)}/>}
    {!phone && dialogData && dialog?.kind === 'joint' && jointDialog && support?.mode === 'catalog' && <TjanstJointDialog {...base} key={dialog.jointId ?? dialog.rowIds.join()} data={dialogData} joint={jointDialog.joint}
      rows={dialog.rowIds.map(id => dialogData.rows.find(r => r.id === id)).filter((r): r is TjanstRow => !!r)} onClose={() => close()}
      onSave={async draft => { const outcome = await plan('save_joint', { jointId: dialog.jointId, name: draft.name, rowIds: dialog.rowIds, teachers: draft.teachers }, () => `Samläsningen ${draft.name} är sparad. Lärartiden räknas en gång och klasserna ${[...new Set(dialog.rowIds.map(id => rowName(dialogData.rows.find(r => r.id === id)!).cls))].join(' och ')} visas som täckta.`); if (outcome.ok) setMarked([]); return outcome; }}/>
    }
    {!phone && dialogData && dialog?.kind === 'addTeacher' && support?.mode === 'catalog' && <TjanstAddTeacherDialog {...base} data={dialogData} candidates={support.candidates} onChoice={acceptCatalog} onClose={() => close()}
      onNewTeacher={context.function === 'rektor' ? () => open({ kind: 'newTeacher' }, origin.current) : undefined} onSave={(person, name) => plan('add_teacher', { personId: person }, () => `${name} är tillagd i fördelningen.`)}/>}
    {!phone && dialogData && dialog?.kind === 'newTeacher' && <TjanstNewTeacherDialog {...base} schoolName={dialogData.schoolName} onClose={() => close()} onSave={newTeacher}/>}
    {!phone && dialogData && confirm && support?.mode === 'catalog' && <Confirmation key={`${confirm.confirm}:${confirm.id}`} data={dialogData} dialog={confirm} base={base} rowName={rowName}
      onClose={focus => close(focus)} plan={plan} classHeading={id => document.querySelector<HTMLElement>(`[data-class-heading="${CSS.escape(id)}"]`)}/>}
    {!phone && data && dialog?.kind === 'batch' && <TjanstYearDialog mode={dialog.mode} data={data} scopeKey={scopeKey} disabled={busy || checking || pendingCheck || recovering || !data.capabilities.canEdit}
      checking={checking} loadPreview={loadPreview} onSave={sendPrepared} onClose={() => close()} onRefreshPlan={refresh} initialDraft={batchDraft} onDraftChange={setBatchDraft}/>}

  </div>;
}

/** Visa tid: segmentknappar med aria-pressed i en namngiven grupp. */
function TermSwitch({ term, onTerm }: { term: TjanstTermView; onTerm: (term: TjanstTermView) => void }) {
  return <fieldset className="tjanst-term"><legend>Visa tid</legend>
    {TERMS.map(t => <button key={t} type="button" aria-pressed={term === t} onClick={() => onTerm(t)}>{TERM_LABEL[t]}</button>)}</fieldset>;
}
function Heading({ schoolName, schoolYear, forms, admin, readOnly }: { schoolName: string | null; schoolYear: number; forms: string[]; admin: boolean; readOnly: boolean }) {
  return <div className="admin-heading tjanst-heading"><div>
    <span className="admin-kicker">PLANERING{schoolName ? ` · ${schoolName}` : ''}</span>
    <h1>Tjänstefördelning</h1>
    <p className="tjanst-subline">Läsåret {yearLabel(schoolYear)}{forms.length ? ` · ${forms.join(' · ')}` : ''}</p>
    {readOnly ? <p>Huvudmannen följer upp bemanningen. Rektor fastställer och publicerar skolans fördelning.</p>
      : <p>Fördela skolans undervisning och specialuppdrag på lärare. Behovet kommer från klassernas timplaner. Lärarna ser fördelningen först när du har fastställt och publicerat den.{admin ? ' Du kan förbereda fördelningen. Rektor fastställer och publicerar.' : ''}</p>}
  </div></div>;
}

type PlanFn = <A extends TjanstPlanAction>(action: A, payload: TjanstPlanPayload[A], message: (detail: TjanstPlanRead) => string) => Promise<TjanstOutcome>;
function Confirmation({ data, dialog, base, rowName, onClose, plan, classHeading }: { data: TjanstPlanRead; dialog: Extract<Dialog, { kind: 'confirm' }>; base: { checking: boolean; open: boolean; disabled?: boolean; supportNotice?: import('react').ReactNode };
  rowName: (row: TjanstRow) => { teacher: string; course: string; cls: string }; onClose: (focus?: HTMLElement | null) => void; plan: PlanFn; classHeading: (classId: string) => HTMLElement | null }) {
  const version = data.version, published = data.versions.find(v => v.status === 'published'), deleted = useRef(false);
  if (dialog.confirm === 'removeTeacher') {
    const teacher = data.teachers.find(t => t.personId === dialog.id); if (!teacher) return null;
    return <TjanstConfirmDialog {...base} onClose={() => onClose()} title={`Ta bort kolumnen för ${teacher.displayName}?`} text="Bara den tomma kolumnen tas bort ur fördelningen. Personen finns kvar i Personal. Publicerad historik ändras inte." keepLabel="Behåll kolumnen" confirmLabel="Ta bort kolumnen"
      onConfirm={() => plan('remove_teacher', { personId: teacher.personId }, () => `Den tomma kolumnen för ${teacher.displayName} är borttagen.`)}/>;
  }
  if (dialog.confirm === 'deleteRow') {
    const row = data.rows.find(r => r.id === dialog.id); if (!row) return null; const n = rowName(row);
    // Efter borttagen rad går fokus till klassrubriken; avbryt återför fokus till cellen.
    return <TjanstConfirmDialog {...base} onClose={() => onClose(deleted.current ? classHeading(row.classId) : undefined)} title="Ta bort tjänsteraden?" text={`${n.teacher}, ${n.course}, ${n.cls} tas bort ur planeringen. Publicerade versioner ändras inte.`}
      keepLabel="Behåll raden" confirmLabel="Ta bort tjänsteraden" destructive onConfirm={async () => { const o = await plan('delete_row', { rowId: row.id }, () => `Tjänsteraden är borttagen: ${n.teacher}, ${n.course}, ${n.cls}.`);
        deleted.current = o.ok; return o; }}/>;
  }
  if (dialog.confirm === 'deleteSpecial') {
    const s = data.specials.find(x => x.id === dialog.id); if (!s) return null;
    const who = s.personId === null ? 'Vakant' : data.teachers.find(t => t.personId === s.personId)?.displayName ?? '';
    return <TjanstConfirmDialog {...base} onClose={() => onClose()} title="Ta bort specialuppdraget?" text={`${s.label} för ${who} tas bort ur planeringen. Publicerade versioner ändras inte.`}
      keepLabel="Behåll uppdraget" confirmLabel="Ta bort specialuppdraget" destructive onConfirm={() => plan('delete_special', { specialId: s.id }, () => `Specialuppdraget ${s.label} för ${who} är borttaget.`)}/>;
  }
  if (dialog.confirm === 'dissolve') {
    const j: TjanstJoint | undefined = data.joints.find(x => x.id === dialog.id); if (!j) return null;
    return <TjanstConfirmDialog {...base} onClose={() => onClose()} title={`Lös upp samläsningen ${j.name}?`} text="Raderna finns kvar, men lärartiden räknas då per klass."
      keepLabel="Behåll samläsningen" confirmLabel="Lös upp samläsningen" onConfirm={() => plan('dissolve_joint', { jointId: j.id }, () => `Samläsningen ${j.name} är upplöst. Raderna finns kvar med sin tid.`)}/>;
  }
  if (dialog.confirm === 'discard') return <TjanstConfirmDialog {...base} onClose={() => onClose()} title={`Ta bort utkastet version ${version?.versionNo}?`}
    text={published ? `Ändringarna som ännu inte publicerats tas bort. Lärarna ser fortfarande version ${published.versionNo}.` : 'Ändringarna som ännu inte publicerats tas bort. Behoven finns kvar och kan planeras på nytt.'}
    keepLabel="Behåll utkastet" confirmLabel="Ta bort utkastet" destructive onConfirm={() => plan('discard_draft', {}, () => `Utkastet version ${version?.versionNo} är borttaget.`)}/>;
  return <TjanstConfirmDialog {...base} onClose={() => onClose()} title={`Fastställ och publicera version ${version?.versionNo}?`}
    text={`Lärarna på ${data.schoolName} ser version ${version?.versionNo} i Min tjänst. Den tidigare publicerade versionen ersätts men finns kvar i versionshistoriken. Beslutet loggas med ditt namn och tiden.`}
    keepLabel="Behåll utkastet" confirmLabel="Fastställ och publicera" busyLabel="Publicerar…" onConfirm={() => plan('publish', {}, d => `Version ${d.version?.versionNo ?? version?.versionNo} är fastställd och publicerad. Lärarna ser den i Min tjänst.`)}/>;
}
