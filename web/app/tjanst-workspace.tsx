'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Plus, UserRoundPlus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {electivePreparationTarget,type ElectivePreparationIntent} from '@/lib/elective-preparation-target.ts';
import type { BlockerTarget } from '@/lib/tjanst-blocker-actions.ts';
import TjanstMatrixActions from './tjanst-matrix-actions';
import { TjanstActionMenu, actionOrigin } from './tjanst-action-menu';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, ApiError } from '@/lib/server-client.ts';
import { createPlanCommand, parsePersonalCommand, parsePersonalCommandReply, parsePlanCommandReply, parsePlanReadReply, parsePlanStatusReply,
  parseStatusReply, personalCommandRef, planCommandRef, TjanstContractError, type TjanstCommandRef, type TjanstJoint,
  type TjanstPlanRead, type TjanstRow, type TjanstSpecial } from '@/lib/tjanst-contract.ts';
import { parseYearReply, parseYearRequest, type TjanstYearRequest, type TjanstYearReply, type TjanstYearCatalogReply, type TjanstYearBasePayload as TjanstPlanPayload } from '@/lib/tjanst-year-contract.ts';
import TjanstYearDialog, { type TjanstYearBatchDraft, type TjanstScopedMove } from './tjanst-year-dialog';
import { loadTjanstJournal, persistTjanstJournal, removeTjanstJournal, TjanstJournalError, type TjanstJournal, type TjanstJournalScope } from '@/lib/tjanst-journal.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ActiveContext } from './context-switch';
import TjanstMatrix, { courseCode, EMPTY_FILTER, filterGroups, jointOf, needEntries, sortTeachers, subjectOf, TjanstClassLinkButtons, type TjanstCellTarget, type TjanstFilter, type TjanstOpenClassLinks } from './tjanst-matrix';
import { hereForStepUp, TjanstAddTeacherDialog, TjanstConfirmDialog, TjanstJointDialog, TjanstNewTeacherDialog, TjanstRowDialog, TjanstSpecialDialog,
  Problems, type TjanstPreparedChange, type TjanstFormCache, type TjanstFailure, type TjanstOutcome } from './tjanst-dialogs';
import TjanstPublishPanel, { ackSummary, dateText, STATUS_LABEL, type TjanstFeedback } from './tjanst-publish-panel';
import MfaStepUpNotice from './mfa-step-up';
import { formatTime, TERM_LABEL, yearLabel, type TjanstTermView } from './tjanst-service-summary';
import { TjanstClassView, TjanstCourseView, TjanstSpecialView, TjanstTeacherView } from './tjanst-views';
import TjanstLensBar from './tjanst-lens-bar';
import TjanstGroupMatrix, { teachingGroupEntries } from './tjanst-group-matrix';
import TjanstAllocation, { type TjanstAllocationDraft } from './tjanst-allocation';
import TjanstSharingDialog, { SHARING_LABEL } from './tjanst-sharing-dialog';
import { needTeachers, sharedNeedState } from '@/lib/tjanst-model.ts';
import { createYearRowEditor, selectYearTeacher, yearRowSavePayload } from '@/lib/tjanst-year-model.ts';
import { EMPTY_LENS_PREFS, lensStorageKey, readLensPrefs, TJANST_LENSES, teachersWithoutTeaching, visibleTeachers, writeLensPrefs, type TjanstLensPrefs } from '@/lib/tjanst-lens.ts';
import './tjanst.css';

/**
 * Rektors och skoladministratörens vy Tjänstefördelning (TJANST-01–04). Servern avgör skolor, kolumner, behov,
 * actions, blockers och capabilities; dolda knappar är bara bekvämlighet. Läsningar och mutationer går via POST.
 * Vyn nycklas på epok, uppdrag, skola och läsår, så att ett byte tömmer innehåll, markeringar och dialoger (D-11).
 */
export type TjanstView = 'matris' | 'fordela' | 'klass' | 'larare' | 'special' | 'kurs';
const VIEWS: { id: TjanstView; label: string }[] = [{ id: 'matris', label: 'Matris' }, { id: 'fordela', label: 'Fördela' }, { id: 'klass', label: 'Per klass' }, { id: 'larare', label: 'Per lärare' },
  { id: 'special', label: 'Specialuppdrag' }, { id: 'kurs', label: 'Per kurs/ämne' }];
const TERMS: TjanstTermView[] = ['ar', 'ht', 'vt'];
const LOCK_CODES = ['context_changed', 'assignment_ended', 'assignment_expired', 'membership_blocked'];
type TjanstPlanAction = keyof TjanstPlanPayload;
type Saved = { filter: TjanstFilter; classId: string; personId: string; autoLens: boolean };
type MatrixUndo = { revision: number; versionId: string; row: TjanstRow; previous: TjanstRow | null };
const sameMatrixRow = (a: TjanstRow, b: TjanstRow) => (Object.keys(b) as (keyof TjanstRow)[]).every(key => a[key] === b[key]);
type Dialog =
  | { kind: 'row'; target: TjanstCellTarget; replaceTeacher?: boolean; advanced?: boolean }
  | { kind: 'matrixActions'; target: TjanstCellTarget }
  | { kind: 'special'; special: TjanstSpecial | null }
  | { kind: 'joint'; rowIds: string[]; jointId: string | null }
  | { kind: 'batch'; mode: 'move' | 'bulk'; scopedMove?: TjanstScopedMove }
  | { kind: 'addTeacher' } | { kind: 'newTeacher' }
  | { kind: 'sharing'; sourceKey: string }
  | { kind: 'confirm'; confirm: 'removeTeacher' | 'deleteRow' | 'deleteSpecial' | 'discard' | 'dissolve' | 'publish'; id: string };
type ReadFailure = { text: string; clear: boolean; retry: boolean; correlationId: string | null };
export type TjanstWorkspaceProps = { context: ActiveContext; epoch: number; unitId: string | null; schoolYear: number;
  /** Krävs för skrivningar: journalen binds till inloggad identitet och uppdrag (tjanst-journal). */
  identityKey?: string | null; feedback?: TjanstFeedback; onOpenElectiveBlocks?: (target?:ElectivePreparationIntent) => void; onOpenClassLinks?: TjanstOpenClassLinks; onSessionLost?: () => void;
  /** Huvudmannens Visa fördelningen (Bemanning): skrivskyddad, utan åtgärdsrad, panel och beslutsknapp (D-01). */
  readOnly?: boolean;
  /** Versionen som läses först. Bemanning skickar skolans publicerade version, så att huvudmannen aldrig ser rektors utkast (WR-07). */
  versionId?: string | null };

function readLocation(): { view: TjanstView; term: TjanstTermView; saved: Saved } {
  const q = new URLSearchParams(window.location.search), view = q.get('tjvy'), term = q.get('termin');
  const s = window.history.state?.tjanst as Partial<Saved> | undefined;
  const merged = s?.filter && typeof s.filter === 'object' ? { ...EMPTY_FILTER, ...s.filter } : EMPTY_FILTER;
  const known = TJANST_LENSES.some(l => l.id === merged.lens) ? merged : { ...merged, lens: EMPTY_FILTER.lens };
  // 05.1-34: en adress direkt till Fördela utan sparat filter öppnar med Ofördelat.
  const filter = view === 'fordela' && !s?.filter ? { ...known, lens: 'ofordelat' as const } : known;
  return { view: VIEWS.some(v => v.id === view) ? view as TjanstView : 'matris', term: term === 'ht' || term === 'vt' ? term : 'ar',
    saved: { filter, classId: typeof s?.classId === 'string' ? s.classId : '', personId: typeof s?.personId === 'string' ? s.personId : '',
      autoLens: typeof s?.autoLens === 'boolean' ? s.autoLens : view === 'fordela' && filter.lens === 'ofordelat' } };
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
  // 05.1-33 / D-31: delning mellan lärare på samma behov.
  tjanst_sharing_joint: 'Kursen ingår i en samläsning och kan inte få en delning mellan lärare.',
  tjanst_sharing_too_few: 'Delningen kräver minst två lärare med tid på kursen i klassen. Hämta aktuellt läge.',
  tjanst_sharing_grader: 'Den som sätter betyg måste vara en av lärarna med tid på kursen.',
};
type Op = 'write' | 'publish' | 'personal';
const failed = (error: string, extra: Partial<TjanstFailure> = {}): TjanstFailure => ({ ok: false, error, ...extra });
const phoneViewport = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches;
/** localStorage kan vara avstängd; då gäller inställningarna bara under besöket. */
const lensStorage = () => { try { return window.localStorage; } catch { return null; } };
const aborted = (caught: unknown) => caught instanceof DOMException && caught.name === 'AbortError';

export default function TjanstWorkspace(props: TjanstWorkspaceProps) {
  return <Workspace key={`${props.epoch}-${props.context.assignmentId}-${props.unitId ?? 'alla'}-${props.schoolYear}-${props.versionId ?? 'aktuell'}`} {...props}/>;
}

function Workspace({ context, unitId, schoolYear, identityKey = null, feedback: feedbackProp, onOpenClassLinks, onOpenElectiveBlocks, onSessionLost, readOnly = false, versionId: startVersion = null }: TjanstWorkspaceProps) {
  const [initial] = useState(readLocation);
  const [autoLens, setAutoLens] = useState(initial.saved.autoLens);
  const [allocationStart, setAllocationStart] = useState<string | null>(null);
  const [matrixGroupBody, setMatrixGroupBody] = useState<HTMLTableSectionElement | null>(null);
  const [matrixAdvanced, setMatrixAdvanced] = useState(false), [quickBusy, setQuickBusy] = useState(false);
  const [matrixUndo, setMatrixUndo] = useState<MatrixUndo | null>(null);
  const [matrixFeedback, setMatrixFeedback] = useState<{ sourceKey: string; text: string; filterKey: string } | null>(null);
  const quickRunning = useRef(false);
  const [view, setView] = useState<TjanstView>(initial.view), [term, setTerm] = useState<TjanstTermView>(initial.term);
  const [filter, setFilter] = useState<TjanstFilter>(initial.saved.filter), [classId, setClassId] = useState(initial.saved.classId), [personId, setPersonId] = useState(initial.saved.personId);
  const [versionId, setVersionId] = useState(startVersion ?? ''), [readKey, setReadKey] = useState(0), [readDone, setReadDone] = useState(0);
  const [data, setData] = useState<TjanstPlanRead | null>(null), [loading, setLoading] = useState(!!unitId), [readError, setReadError] = useState<ReadFailure | null>(null);
  const matrixCurrent = useRef({ data, view, versionId });
  useLayoutEffect(() => { matrixCurrent.current = { data, view, versionId }; }, [data, view, versionId]);
  const [notice, setNotice] = useState<string | null>(null), [pageError, setPageError] = useState<TjanstFailure | null>(null), [pendingCheck, setPendingCheck] = useState(false), [recovering, setRecovering] = useState(true);
  const [dialog, setDialog] = useState<Dialog | null>(null), [marked, setMarked] = useState<string[]>([]), [markError, setMarkError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false), [checking, setChecking] = useState(false), [busy, setBusy] = useState(false);
  const [dialogData, setDialogData] = useState<TjanstPlanRead | null>(null), [form, setForm] = useState<TjanstFormCache>({}), [formDirty, setFormDirty] = useState(false);
  const [pendingRowInput, setPendingRowInput] = useState<TjanstFormCache | null>(null);
  const [support, setSupport] = useState<TjanstYearReply | null>(null), [acceptedCatalog, setAcceptedCatalog] = useState<TjanstYearCatalogReply | null>(null);
  const [supportBusy, setSupportBusy] = useState(false), [supportError, setSupportError] = useState<TjanstFailure | null>(null), [supportKey, setSupportKey] = useState(0);
  const [batchDraft, setBatchDraft] = useState<TjanstYearBatchDraft>();
  // Endast i denna arbetsyta (uppdrag/skola/läsår), aldrig browserstorage eller historisk version.
  const [allocationDrafts, setAllocationDrafts] = useState<Record<string, TjanstAllocationDraft>>({});
  const allocationDraftCount = Object.keys(allocationDrafts).length;
  const updateAllocationDraft = useCallback((sourceKey: string, draft: TjanstAllocationDraft | null) => {
    setAllocationDrafts(previous => {
      const next = { ...previous };
      if (draft) next[sourceKey] = draft; else delete next[sourceKey];
      return next;
    });
  }, []);
  const supportGeneration = useRef(0), supportInitialized = useRef(false), recoveryGate = useRef(true), uncertainGate = useRef(false);
  const onField = useCallback((key: string, value: unknown, dirty = true) => { setForm(old => ({ ...old, [key]: value })); if (dirty) setFormDirty(true); }, []);
  const phone = usePhone(), phoneRef = useRef(phone); useLayoutEffect(() => { phoneRef.current = phone; }, [phone]);
  const scopeKey = `${context.assignmentId}:${unitId}:${schoolYear}`;
  const active = useRef(true), generation = useRef(0), running = useRef(false), origin = useRef<HTMLElement | null>(null), lost = useRef(onSessionLost);
  const originCell = useRef<{ sourceKey: string; personId: string | null } | null>(null), focusCell = useRef<() => HTMLElement | null>(() => null);
  const editableNow = useRef(false);
  const viewHeading = useRef<HTMLHeadingElement>(null), headingId = useId(), pendingFocus = useRef<HTMLElement | null>(null), reading = useRef(false);
  const pendingMatrixFocus = useRef(false);
  // En läsning som redan har startat men ännu inte renderat inert får inte förbruka fokusmålet: cellen kan ersättas av läsningen
  // och fokus skulle då gå förlorat (faktiskt prov 05.1-22). Målet ligger kvar tills läsningen är klar.
  const applyFocus = useCallback(() => {
    const target = pendingFocus.current;
    // Under ett pågående kommando ritas cellerna utan knappar (inte redigerbara); vänta så att rätt cell kan hittas igen.
    if (!target || reading.current || running.current || quickRunning.current) return;
    // En cell ritas utan knapp medan arbetsytan inte är redigerbar. Vänta då på knappen i stället för att tappa fokus till rubriken.
    // 05.1-33: delningsmärket ritas om när formen ändras; det hittas igen med sin nyckel.
    const keyed = !target.isConnected && target.dataset.focusKey ? document.querySelector<HTMLElement>(`[data-focus-key="${CSS.escape(target.dataset.focusKey)}"]`) : null;
    if (!target.isConnected && target.dataset.focusKey && !keyed && !editableNow.current) return;
    const cell = pendingMatrixFocus.current ? focusCell.current() : target.isConnected ? target : keyed ?? focusCell.current();
    if (!cell && originCell.current && !editableNow.current) return;
    const resolved = cell ?? viewHeading.current;
    if (!resolved || resolved.closest('[inert]')) return;
    pendingFocus.current = null; pendingMatrixFocus.current = false; resolved.focus();
  }, []);
  useLayoutEffect(() => { lost.current = onSessionLost; });
  useLayoutEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scope = useMemo<TjanstJournalScope | null>(() => identityKey ? { identityKey, assignmentId: context.assignmentId } : null, [identityKey, context.assignmentId]);
  useUnsavedChanges('navigation-block:tjanst', busy || checking || pendingCheck);
  useUnsavedChanges('navigation-block:tjanst-quick', quickBusy);
  useUnsavedChanges('tjanst-marked', marked.length > 0);
  useUnsavedChanges('tjanst-editor', !!pendingRowInput || !!dialog && (formDirty || !!batchDraft?.dirty));
  useUnsavedChanges('tjanst-allocation', allocationDraftCount > 0);

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
  // 05.1-32 (användarprov 2026-10-28): filter, lins och termin används bara i webbläsaren och läser inte om fördelningen.
  useEffect(() => { queueMicrotask(() => void load()); }, [load, readKey]);
  const refresh = useCallback(() => setReadKey(n => n + 1), []);
  // readDone räknas upp efter varje avslutad läsning, även när loading true/false slås ihop i samma rendering.


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
  async function tracked<R extends { receipt: { commandId: string } }>(ref: TjanstCommandRef, path: string, body: unknown, parse: (value: unknown) => R, op: Op, stillCurrent: () => boolean = () => true): Promise<{ ok: true; reply: R } | TjanstFailure> {
    if (!scope) return failed('Ändringen kunde inte förberedas i den här fliken. Inget har skickats.');
    let journal: TjanstJournal;
    try { journal = await persistTjanstJournal(window.sessionStorage, scope, ref); }
    catch (caught) {
      if (caught instanceof TjanstJournalError && caught.code === 'pending_journal_exists') { uncertainGate.current = true; setPendingCheck(true); return failed('Ett tidigare sparförsök behöver kontrolleras först. Välj Kontrollera sparstatus.'); }
      return failed('Ändringen kunde inte förberedas i den här fliken. Inget har skickats.');
    }
    const forget = async () => { try { await removeTjanstJournal(window.sessionStorage, journal); } catch { /* Journalen kontrolleras vid nästa visning. */ } };
    if (!active.current || phoneRef.current || phoneViewport() || !stillCurrent()) { await forget(); return failed('Arbetsytan har ändrats. Inget har skickats.'); }
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
    if (!dialog || !dialogData || phone || dialog.kind === 'newTeacher' || dialog.kind === 'batch' || dialog.kind === 'matrixActions') return;
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
  async function sendPrepared(prepared: TjanstPreparedChange, message: (detail: TjanstPlanRead) => string = () => 'Ändringarna är sparade.', stillCurrent: () => boolean = () => true, inlineMatrix = false): Promise<TjanstOutcome> {
    if (!active.current || !data || !unitId || running.current || recoveryGate.current || uncertainGate.current || pendingCheck || checking || phoneRef.current || readOnly || versionId || !scope || !data.capabilities.canEdit) return failed('Vänta tills föregående ändring är klar och använd aktuell planering på dator.');
    if (dialog && !['move', 'bulk'].includes(prepared.action) && (supportBusy || supportError)) return failed('Hämta och kontrollera planeringsstödet före sparning.');
    if (prepared.unitId !== unitId || prepared.schoolYear !== schoolYear) return failed('Arbetsytan har ändrats.');
    running.current = true; setBusy(true); setNotice(null); setPageError(null);
    try {
      const command = await createPlanCommand({ ...prepared, commandId: crypto.randomUUID() });
      if (!active.current || phoneRef.current || phoneViewport() || !stillCurrent()) return failed('Arbetsytan har ändrats. Inget har skickats.');
      if (!data.actions.includes(command.action)) return failed('Åtgärden är inte längre tillgänglig i aktuellt läge. Hämta aktuellt läge.');
      const result = await tracked(planCommandRef(command), command.action === 'publish' ? '/api/tjanst/plan/publicera' : '/api/tjanst/plan/kommando', command,
        value => parsePlanCommandReply(value, command), command.action === 'publish' ? 'publish' : 'write', stillCurrent);
      if (!result.ok) {
        if (active.current && (result.code?.includes('stale') || ['tjanst_revision_conflict', 'tjanst_published_meanwhile', 'tjanst_content_changed'].includes(result.code ?? '') || result.code === 'tjanst_publish_blocked')) { setSupportKey(n => n + 1); refresh(); }
        return result;
      }
      if (!active.current) return { ok: true };
      setVersionId(''); const savedMessage = message(result.reply.detail);
      if (inlineMatrix) { setNotice(null); setData(result.reply.detail); setReadError(null); } else { setNotice(savedMessage); refresh(); }
      if (phoneRef.current) close(); return { ok: true };
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
  const saved = useMemo<Saved>(() => ({ filter, classId, personId, autoLens }), [filter, classId, personId, autoLens]);
  const savedRef = useRef(saved);
  useLayoutEffect(() => { savedRef.current = saved; });
  useEffect(() => { writeLocation(initial.view, initial.term, initial.saved, 'replace'); }, [initial]);
  useEffect(() => {
    const pop = () => { setMatrixFeedback(null); const next = readLocation(); savedRef.current = next.saved; setAutoLens(next.saved.autoLens); setView(next.view); setTerm(next.term); setFilter(next.saved.filter); setClassId(next.saved.classId); setPersonId(next.saved.personId); };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  // 05.1-34: Fördela öppnar med linsen Ofördelat; Alla behov väljs uttryckligen (till exempel för en andra lärare).
  // Linsen delas mellan vyerna. En lins som Fördela satte automatiskt återställs när vyn lämnas, så att matrisen inte döljer fördelade rader.
  function chooseView(next: TjanstView, patch?: Partial<Saved>) {
    if (next === view && !patch) return;
    setMatrixFeedback(null);
    const current = { ...savedRef.current, ...patch };
    const automatic = next === 'fordela' && current.filter.lens === 'alla' && !patch?.filter;
    const lens = automatic ? 'ofordelat' as const
      : view === 'fordela' && current.autoLens && current.filter.lens === 'ofordelat' ? 'alla' as const : current.filter.lens;
    const saved = { ...current, filter: { ...current.filter, lens }, autoLens: automatic };
    savedRef.current = saved; setAutoLens(saved.autoLens); setFilter(saved.filter); setClassId(saved.classId); setPersonId(saved.personId);
    setAllocationStart(null); setView(next); setMarkError(null); writeLocation(next, term, saved, next === view ? 'replace' : 'push');
  }
  // 05.1-27: kursnamn och samläsningsmärke leder till Per kurs/ämne. Kursen filtreras på kurskod; samläsningen fokuseras.
  const [focusJoint, setFocusJoint] = useState<string | null>(null);
  const clearFocusJoint = useCallback(() => setFocusJoint(null), []);
  function openCourse(code: string) { setMarked([]); chooseView('kurs', { filter: { ...EMPTY_FILTER, course: code }, autoLens: false }); }
  function openJoint(jointId: string) { chooseView('kurs', { filter: EMPTY_FILTER, autoLens: false }); setFocusJoint(jointId); }
  function openAllocation(sourceKey: string) {
    const cls = data?.classes.find(c => c.needs.some(n => n.sourceKey === sourceKey));
    const need = cls?.needs.find(n => n.sourceKey === sourceKey); if (!cls || !need) return;
    chooseView('fordela', { filter: { ...EMPTY_FILTER, classId: cls.classId, course: courseCode(need) }, autoLens: false });
    setAllocationStart(sourceKey);
  }
  function chooseTerm(next: TjanstTermView) { if (next === term) return; setMatrixFeedback(null); setTerm(next); writeLocation(view, next, savedRef.current, 'push'); }
  function patchSaved(patch: Partial<Saved>) {
    setMatrixFeedback(null);
    const next = { ...savedRef.current, ...patch };
    savedRef.current = next; if (patch.autoLens !== undefined) setAutoLens(patch.autoLens);
    if (patch.filter) setFilter(patch.filter); if (patch.classId !== undefined) setClassId(patch.classId); if (patch.personId !== undefined) setPersonId(patch.personId);
    writeLocation(view, term, next, 'replace');
  }

  // Rektor och administratör får lärarnas återkoppling i läsningen; huvudmannens läsning har den aldrig (lib/server/tjanst.ts).
  const feedback = !versionId && !readOnly ? feedbackProp ?? data?.feedback : undefined;
  const editable = !readOnly && !!data && data.capabilities.canEdit && !versionId && !phone && !!scope && !busy && !quickBusy && !checking && !pendingCheck && !recovering;
  const can = (action: TjanstPlanAction) => editable && !!data?.actions.includes(action);
  // 05.1-33 / D-31: när en andra lärare får tid på ett behov frågar arbetsytan direkt hur lärarna delar kursen.
  // Frågan väntar tills omläsningen visar den nya lärarens rad; en lärare som redan hade tid på behovet ger ingen fråga.
  const [askSharing, setAskSharing] = useState<{ sourceKey: string; personId: string } | null>(null);
  function askSharingFor(change: TjanstPreparedChange) {
    if (change.action !== 'save_row' || change.payload.personId === null || !data) return;
    if (!needTeachers(change.payload.sourceKey, data.rows).includes(change.payload.personId)) setAskSharing({ sourceKey: change.payload.sourceKey, personId: change.payload.personId });
  }

  useLayoutEffect(() => { editableNow.current = editable; });
  useEffect(() => { if (!loading && !busy) requestAnimationFrame(applyFocus); }, [loading, readDone, busy, editable, applyFocus]);
  const shownView: TjanstView = phone && view === 'matris' ? (data?.teachers.length ? 'larare' : 'klass') : view;
  const annualView = shownView === 'larare' || shownView === 'special' || shownView === 'kurs';
  const filterTerm = shownView === 'kurs' ? 'ar' : term;
  const teachers = useMemo(() => data ? sortTeachers(data.teachers) : [], [data]);
  const groups = useMemo(() => data ? needEntries(data) : [], [data]);
  const matrixFilterKey = JSON.stringify({ filter, term: filterTerm });
  const filtered = useMemo(() => {
    if (!data) return [];
    const visible = filterGroups(groups, filter, filterTerm, data.joints);
    // Behåll senast behandlade behov för radfeedback/Ångra även när det precis blivit täckt.
    if (shownView !== 'matris' || versionId || matrixFeedback?.filterKey !== matrixFilterKey) return visible;
    return groups.flatMap(group => {
      const shown = visible.find(g => g.cls.classId === group.cls.classId);
      const entries = group.entries.filter(e => e.need.sourceKey === matrixFeedback.sourceKey || shown?.entries.some(v => v.need.sourceKey === e.need.sourceKey));
      return shown || entries.length ? [{ ...group, entries }] : [];
    });
  }, [data, groups, filter, filterTerm, shownView, versionId, matrixFeedback, matrixFilterKey]);
  const hasFilter = !!(filter.classId || filter.subject || filter.personId || filter.onlyIssues || filter.course || filter.lens !== 'alla');
  // 05.1-29: fästa lärare, kompakta kolumner och sparade linser. Bara i den egna webbläsaren; utan identitet bara under besöket.
  const prefsKey = identityKey && unitId ? lensStorageKey(identityKey, unitId, schoolYear) : null;
  const [local, setLocal] = useState<{ key: string | null; prefs: TjanstLensPrefs } | null>(null), [showAll, setShowAll] = useState(true);
  const known = useMemo(() => data ? { teacherIds: data.teachers.map(t => t.personId), classIds: data.classes.map(c => c.classId) } : null, [data]);
  const prefs = useMemo(() => local && local.key === prefsKey ? local.prefs : known && prefsKey ? readLensPrefs(lensStorage(), prefsKey, known) : EMPTY_LENS_PREFS, [local, prefsKey, known]);
  function updatePrefs(next: TjanstLensPrefs) { setLocal({ key: prefsKey, prefs: next }); if (prefsKey) writeLensPrefs(lensStorage(), prefsKey, next); }
  const unassigned = useMemo(() => data ? teachersWithoutTeaching(data.teachers, data.rows, data.joints) : [], [data]);
  const columns = useMemo(() => data ? visibleTeachers(filtered.flatMap(g => g.entries), teachers, data.joints, { pinned: prefs.pinned, showAll: showAll || filter.lens === 'ofordelat', personId: filter.personId, empty: hasFilter ? [] : unassigned }) : [],
    [data, filtered, teachers, prefs.pinned, showAll, filter.personId, filter.lens, unassigned, hasFilter]);
  const pin = (id: string, on: boolean) => updatePrefs({ ...prefs, pinned: on ? [...new Set([...prefs.pinned, id])] : prefs.pinned.filter(x => x !== id) });
  function saveLens(name: string): string | null {
    const clean = name.trim(); if (!clean) return 'Skriv ett namn på linsen.';
    if (prefs.saved.length >= 20 && !prefs.saved.some(s => s.name === clean)) return 'Du kan spara högst 20 linser. Ta bort en lins först.';
    const { lens, ...rest } = filter;
    updatePrefs({ ...prefs, saved: [...prefs.saved.filter(s => s.name !== clean), { name: clean, lens, filter: rest, showAll }] }); return null;
  }
  useLayoutEffect(() => { focusCell.current = () => {
    const target = originCell.current; if (!target) return null;
    const row = filtered.flatMap(g => g.cls.link ? g.entries : []).findIndex(e => e.need.sourceKey === target.sourceKey);
    const column = target.personId === null ? columns.length : columns.findIndex(t => t.personId === target.personId);
    return row < 0 || column < 0 ? null : document.querySelector<HTMLElement>(`[data-cell="${row}:${column}"]`);
  }; }, [filtered, columns]);
  const subjects = [...new Set([...groups.flatMap(g => g.entries.map(e => subjectOf(e.need.label))), ...(data?.groups ?? []).map(group => subjectOf(group.label))])].sort((a, b) => a.localeCompare(b, 'sv'));
    const courseLabel = filter.course ? groups.flatMap(g => g.entries).find(e => courseCode(e.need) === filter.course)?.need.label ?? data?.groups?.find(group => (group.levelCode ?? group.subjectCode) === filter.course)?.label ?? filter.course : '';
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

  const open = (next: Dialog, from: HTMLElement | null) => {
    if (!editable || quickRunning.current || running.current || recoveryGate.current || uncertainGate.current || !data) return;
    const cell = from?.dataset.cell?.split(':').map(Number), entry = cell ? filtered.flatMap(g => g.cls.link ? g.entries : [])[cell[0]] : null;
    originCell.current = entry && cell ? { sourceKey: entry.need.sourceKey, personId: columns[cell[1]]?.personId ?? null } : null;
    supportGeneration.current++; supportInitialized.current = false; origin.current = from; setPageError(null); setDialog(next); setDialogData(structuredClone(data)); setForm(next.kind === 'row' && pendingRowInput ? { ...pendingRowInput, resetChoice: true } : {}); setFormDirty(next.kind === 'row' && !!pendingRowInput); setPendingRowInput(null);
    setSupportBusy(false); setSupport(null); setAcceptedCatalog(null); setSupportError(null); setBatchDraft(undefined);
  };
  useEffect(() => {
    if (!askSharing || !data || loading || dialog || !can('save_sharing')) return;
    const { sourceKey, personId } = askSharing;
    if (!needTeachers(sourceKey, data.rows).includes(personId)) return;
    queueMicrotask(() => setAskSharing(null));
    if (sharedNeedState(sourceKey, data.rows, data.sharing) === 'unspecified') queueMicrotask(() => open({ kind: 'sharing', sourceKey }, document.activeElement instanceof HTMLElement ? document.activeElement : null));
  });
  // Fokus återgår till cellen eller knappen som öppnade dialogen, efter omläsningen (innehållet är inert under läsning).
  function close(focus?: HTMLElement | null) { pendingFocus.current = focus ?? origin.current ?? viewHeading.current; supportGeneration.current++; setDialog(null); setForm({}); setFormDirty(false); setBatchDraft(undefined); requestAnimationFrame(applyFocus); }
  const rowName = (row: TjanstRow) => {
    const frame = data!.groups?.flatMap(group => group.sourceRefs).find(source => source.sourceKey === row.sourceKey || source.frameSourceKey === row.sourceKey), cls = data!.classes.find(c => c.classId === row.classId), group = row.sourceKind === 'teaching_group' ? data!.groups?.find(value => value.groupId === row.groupId) : null, need = cls?.needs.find(n => n.sourceKey === row.sourceKey) ?? group;
    return { teacher: row.personId === null ? 'Vakant' : data!.teachers.find(t => t.personId === row.personId)?.displayName ?? 'Okänd lärare', course: need?.label ?? frame?.label ?? (row.sourceKind === 'teaching_group' ? 'Gruppunderlag saknas' : row.rowKey), cls: cls?.name ?? group?.name ?? '' };
  };
  // 05.1-32 (användarprov 2026-10-28): en ny rad för ett behov med en vakant rad ersätter den vakanta i stället för att fördela behovet dubbelt.
  function vacantTarget(target: TjanstCellTarget): TjanstCellTarget {
    if (target.rowId !== null || !data) return target;
    const vacant = data.rows.find(r => r.sourceKey === target.sourceKey && r.personId === null && r.jointGroupId === null);
    return vacant ? { ...target, rowId: vacant.id } : target;
  }
  async function assignMatrix(target: TjanstCellTarget, from: HTMLElement, advanced = false) {
    if (quickRunning.current || !can('save_row') || !data) return;
    const entry = groups.flatMap(g => g.entries).find(e => e.need.sourceKey === target.sourceKey);
    if (!entry) return;
    const { need, cov } = entry;
    if (need.organizationPending) { onOpenElectiveBlocks?.(electivePreparationTarget(data,need)??undefined); return; }
    const ht = need.needHt === null ? null : Math.max(0, need.needHt - cov.covered.ht);
    const vt = need.needVt === null ? null : Math.max(0, need.needVt - cov.covered.vt);
    const effective = vacantTarget(target);
    if (!advanced && entry.rows.some(row => row.personId !== null)) { open({ kind: 'matrixActions', target }, from); return; }
    if (advanced || target.rowId !== null || target.personId === null || ht === null || vt === null || ht + vt === 0
      || entry.rows.some(r => r.stale || r.jointGroupId !== null) || pendingRowInput || allocationDrafts[target.sourceKey]) {
      open({ kind: 'row', target: effective, advanced }, from); return;
    }
    const snapshot = data;
    const current = () => active.current && !phoneRef.current && !phoneViewport() && matrixCurrent.current.view === 'matris'
      && !matrixCurrent.current.versionId && matrixCurrent.current.data === snapshot;
    quickRunning.current = true; setQuickBusy(true); setMatrixUndo(null); setMatrixFeedback({ filterKey: matrixFilterKey, sourceKey: target.sourceKey, text: 'Kontrollerar ändringen i matrisen…' }); setPageError(null);
    origin.current = from; originCell.current = { sourceKey: target.sourceKey, personId: target.personId }; pendingFocus.current = from;
    try {
      const reply = await loadPreview({ unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, mode: 'row', sourceKey: target.sourceKey, rowId: effective.rowId });
      if (!current()) return;
      if ('ok' in reply) { setPageError(reply); return; }
      if (reply.mode !== 'row' || reply.currentRevision !== snapshot.revision || reply.baseVersionId !== (snapshot.version?.id ?? null)
        || reply.need.needHt !== need.needHt || reply.need.needVt !== need.needVt || reply.currentRow?.stale
        || (reply.currentRow?.personId ?? null) !== null || reply.currentRow?.jointGroupId) {
        setPageError(failed('Underlaget har ändrats. Inget har tilldelats. Hämta aktuellt läge och välj på nytt.', { refresh })); return;
      }
      const editor = selectYearTeacher(createYearRowEditor(reply, cov.covered), reply, { kind: 'manual', personId: target.personId });
      const payload = yearRowSavePayload({ ...editor, teacherHt: ht, teacherVt: vt }, reply);
      const change: TjanstPreparedChange = { action: 'save_row', unitId: reply.unitId, schoolYear: reply.schoolYear, expectedRevision: reply.currentRevision, payload };
      const who = reply.candidates.find(p => p.personId === target.personId)!.displayName;
      const outcome = await sendPrepared(change, detail => {
        const row = detail.rows.find(r => r.sourceKey === target.sourceKey && r.personId === target.personId);
        if (row && detail.version) setMatrixUndo({ revision: detail.revision, versionId: detail.version.id, row: structuredClone(row), previous: reply.currentRow ? structuredClone(reply.currentRow) : null });
        setMatrixFeedback({ filterKey: matrixFilterKey, sourceKey: target.sourceKey, text: `Sparat · ${who}` });
        return '';
      }, current, true);
      if (!outcome.ok) { setMatrixFeedback(null); setPageError(outcome); } else askSharingFor(change);
    } catch { if (active.current) setPageError(failed('Tilldelningen kunde inte kontrolleras. Hämta aktuellt läge och välj på nytt.')); }
    finally { quickRunning.current = false; if (active.current) { setQuickBusy(false); setMatrixFeedback(value => value?.text === 'Kontrollerar ändringen i matrisen…' ? null : value); requestAnimationFrame(applyFocus); } }
  }
  const undoMatches = (snapshot: TjanstPlanRead | null, undo: MatrixUndo) => !!snapshot && snapshot.revision === undo.revision
    && snapshot.version?.id === undo.versionId && snapshot.rows.some(r => r.id === undo.row.id && sameMatrixRow(r, undo.row));
  async function undoMatrix() {
    const undo = matrixUndo, snapshot = data;
    if (quickRunning.current || !editable || !undo || !snapshot || !undoMatches(snapshot, undo)) return;
    const current = () => active.current && !phoneRef.current && !phoneViewport() && matrixCurrent.current.view === 'matris'
      && !matrixCurrent.current.versionId && undoMatches(matrixCurrent.current.data, undo);
    originCell.current = { sourceKey: undo.row.sourceKey, personId: undo.row.personId };
    pendingFocus.current = viewHeading.current; pendingMatrixFocus.current = true;
    quickRunning.current = true; setQuickBusy(true); setMatrixFeedback({ filterKey: matrixFilterKey, sourceKey: undo.row.sourceKey, text: 'Kontrollerar ändringen i matrisen…' }); setPageError(null);
    try {
      const reply = await loadPreview({ unitId: snapshot.unitId, schoolYear: snapshot.schoolYear, ...(undo.previous
        ? { mode: 'row' as const, sourceKey: undo.row.sourceKey, rowId: undo.row.id } : { mode: 'catalog' as const }) });
      if (!current()) return;
      if ('ok' in reply) { setPageError(reply); return; }
      if (reply.currentRevision !== undo.revision || reply.baseVersionId !== undo.versionId) {
        setMatrixUndo(null); setPageError(failed('Fördelningen har ändrats. Ångra är inte längre tillgängligt. Ändra raden i dialogen.', { refresh })); return;
      }
      let change: TjanstPreparedChange;
      if (undo.previous && reply.mode === 'row' && reply.currentRow && !reply.currentRow.stale && sameMatrixRow(reply.currentRow, undo.row)) {
        const editor = selectYearTeacher(createYearRowEditor(reply), reply, { kind: 'unassigned' });
        const payload = yearRowSavePayload({ ...editor, teacherHt: undo.previous.teacherHt, teacherVt: undo.previous.teacherVt, comment: undo.previous.comment }, reply);
        change = { action: 'save_row', unitId: reply.unitId, schoolYear: reply.schoolYear, expectedRevision: reply.currentRevision, payload };
      } else if (!undo.previous && reply.mode === 'catalog') {
        change = { action: 'delete_row', unitId: reply.unitId, schoolYear: reply.schoolYear, expectedRevision: reply.currentRevision,
          payload: { rowId: undo.row.id, mutationContext: { baseVersionId: reply.baseVersionId, expectedBasisHash: reply.basisHash } } };
      } else { setMatrixUndo(null); setPageError(failed('Raden har ändrats. Ångra är inte längre tillgängligt.')); return; }
      const outcome = await sendPrepared(change, () => { setMatrixFeedback({ filterKey: matrixFilterKey, sourceKey: undo.row.sourceKey, text: 'Tilldelningen är ångrad.' }); return ''; }, current, true);
      if (outcome.ok) { setMatrixUndo(null); setAskSharing(null); } else setPageError(outcome);
    } catch { if (active.current) setPageError(failed('Tilldelningen kunde inte ångras. Hämta aktuellt läge och kontrollera raden.')); }
    finally { quickRunning.current = false; if (active.current) { setQuickBusy(false); setMatrixFeedback(value => value?.text === 'Kontrollerar ändringen i matrisen…' ? null : value); requestAnimationFrame(applyFocus); } }
  }
  function showPublishPanel() {
    setPanelOpen(true);
    requestAnimationFrame(() => document.getElementById(`${headingId}-publish`)?.focus());
  }
  function openBlockerTarget(target: BlockerTarget, from: HTMLElement) {
    if (!data || loading || busy || quickBusy || checking || pendingCheck) return;
    if (target.kind === 'elective_blocks') { onOpenElectiveBlocks?.(); return; }
    const need = 'sourceKey' in target ? groups.flatMap(g => g.entries).find(e => e.need.sourceKey === target.sourceKey) : null;
    if (target.kind === 'row' && need) {
      const row = data.rows.find(r => r.id === target.rowId && r.sourceKey === target.sourceKey);
      if (row && can('save_row') && row.jointGroupId === null) { originCell.current = null; open({ kind: 'row', target: { classId: need.cls.classId, sourceKey: need.need.sourceKey, rowId: row.id, personId: row.personId } }, from); return; }
    }
    if (target.kind === 'sharing' && (need || data.groups?.some(group => group.sourceKey === target.sourceKey)) && can('save_sharing')) { open({ kind: 'sharing', sourceKey: target.sourceKey }, from); return; }
    if (target.kind === 'joint') { openJoint(target.jointId); return; }
    else if (need) chooseView(phone ? 'klass' : 'kurs', { filter: { ...EMPTY_FILTER, course: courseCode(need.need) }, classId: need.cls.classId, autoLens: false });
    else if (target.kind === 'allocation') chooseView(phone ? 'klass' : 'fordela', { filter: { ...EMPTY_FILTER, lens: 'ofordelat' }, autoLens: false });
    else if (target.kind === 'teachers') chooseView('larare');
    else chooseView('kurs', { filter: EMPTY_FILTER, autoLens: false });
    requestAnimationFrame(() => { viewHeading.current?.focus(); viewHeading.current?.scrollIntoView({ block: 'start' }); });
  }
  function linkMarked(from: HTMLElement) {
    if (!data) return;
    const rows = marked.map(id => data.rows.find(r => r.id === id)).filter((r): r is TjanstRow => !!r);
    const joinedRow = rows.find(r => r.jointGroupId !== null);
    if (joinedRow) { const n = rowName(joinedRow); setMarkError(`${n.course} ${n.cls} ingår redan i samläsningen ${jointOf(joinedRow, data.joints)?.name ?? ''}. Lös upp den först eller ändra den samläsningen.`); return; }
    if (rows.length >= 2 && new Set(rows.map(r => r.classId)).size < 2) { setMarkError(`Raderna gäller samma klass (${rowName(rows[0]).cls}). En samläsning behöver rader i minst två olika klasser. Två rader på samma behov i en klass är dubbel fördelning; ta bort den ena i matrisen.`); return; }
    if (rows.length < 2) { setMarkError('Markera minst två rader i minst två olika klasser.'); return; }
    setMarkError(null); open({ kind: 'joint', rowIds: rows.map(r => r.id), jointId: null }, from);
  }
  const visibleKeys = useMemo(() => new Set(filtered.flatMap(g => g.entries.map(e => e.need.sourceKey))), [filtered]);

  if (!unitId) return <div className="admin-workspace protected-admin tjanst">
    <Heading schoolName={null} schoolYear={schoolYear} forms={[]} admin={context.function === 'administrator'} readOnly={readOnly}/>
    <div className="admin-empty tjanst-state"><h2>Välj skola</h2><p>Välj en skola i planeringsvalet. En tjänstefördelning gäller en skola.</p></div>
  </div>;

  const dialogEntry = (dialog?.kind === 'row' || dialog?.kind === 'matrixActions') ? (dialogData ? needEntries(dialogData) : []).flatMap(g => g.entries).find(e => e.need.sourceKey === dialog.target.sourceKey) ?? null : null;
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
        {context.function === 'huvudman' && <span>Huvudmannen följer upp bemanningen. Rektor fastställer och publicerar skolans fördelning.</span>}
        {context.function === 'administrator' && <span>Du kan förbereda fördelningen. Rektor fastställer och publicerar.</span>}
        <strong>{viewingOld ? 'Historik' : data.version?.status === 'published' ? 'Publicerad' : published ? 'Ändringar ännu inte publicerade' : 'Pågående planering'}</strong>
        {data.version?.status === 'draft' && published?.publishedAt && <span>Lärarna ser version {published.versionNo}, publicerad {dateText(published.publishedAt)}.</span>}
        {data.version?.status === 'published' && !viewingOld && data.version.publishedAt && <span>Lärarna ser version {data.version.versionNo}, publicerad {dateText(data.version.publishedAt)}.</span>}
      </div>
      <div className="tjanst-status-side">
        {showChoices && !versionId && <Button variant="outline" disabled={loading || !!dialog || !!pendingRowInput || busy || quickBusy || pendingCheck} onClick={() => { setPendingRowInput(null); setVersionId(choices[0].id); }}>Historik</Button>}
        {!!versionId && <><label className="tjanst-inline-field">Historisk publicering<select value={versionId} disabled={loading} onChange={e => setVersionId(e.target.value)}>
          {choices.map(v => <option key={v.id} value={v.id}>Version {v.versionNo} · {v.publishedAt ? `publicerad ${dateText(v.publishedAt)}` : STATUS_LABEL[v.status]}</option>)}</select></label>
          {!readOnly && <Button variant="outline" onClick={() => setVersionId('')}>Tillbaka till planeringen</Button>}</>}
        {feedback && <span>{ackSummary(feedback)}</span>}
        {!readOnly && !versionId && data.blockers.length > 0 && <Button variant="outline" className="tjanst-blocker-count" aria-label={`Visa ${data.blockers.length} hinder för publicering`} aria-controls={`${headingId}-publish`} disabled={loading || busy || quickBusy || checking || pendingCheck} onClick={showPublishPanel}>{data.blockers.length} hinder för publicering</Button>}
        {!readOnly && <Button variant="outline" aria-expanded={panelOpen} onClick={() => setPanelOpen(v => !v)}>{phone ? panelOpen ? 'Dölj publiceringsstatus' : 'Publiceringsstatus' : panelOpen ? 'Dölj Fastställ och publicera' : 'Fastställ och publicera'}</Button>}
      </div>
      {viewingOld && data.version && <p className="tjanst-readonly">Du läser version {data.version.versionNo} skrivskyddat{data.version.publishedAt ? `, publicerad ${dateText(data.version.publishedAt)} av ${data.version.publishedByName}` : ''}. {published && published.id !== data.version.id ? `Lärarna ser version ${published.versionNo}.` : data.version.status === 'published' ? `Lärarna ser den här versionen.` : ''}</p>}
      {panelOpen && !readOnly && <TjanstPublishPanel id={`${headingId}-publish`} onBlockerAction={openBlockerTarget} navigationBusy={loading || busy || quickBusy || checking || pendingCheck} data={data} phone={phone} busy={!editable || loading} feedback={feedback} rector={context.function === 'rektor'} onPublish={() => open({ kind: 'confirm', confirm: 'publish', id: data.version!.id }, document.activeElement as HTMLElement)}
        onDiscard={() => open({ kind: 'confirm', confirm: 'discard', id: data.version!.id }, document.activeElement as HTMLElement)}/>}
    </div>}
    {phone ? <><label className="tjanst-inline-field tjanst-view-select">Vy<select value={shownView} onChange={e => chooseView(e.target.value as TjanstView)}>
      {VIEWS.filter(v => v.id !== 'matris').map(v => <option key={v.id} value={v.id}>{v.label}</option>)}</select></label>
      <p className="tjanst-phone-text">Matrisen och all redigering finns på dator. Här kan du läsa fördelningen.</p></>
      : <div className="tjanst-switch" inert={quickBusy}><Tabs value={shownView} onValueChange={value => chooseView(value as TjanstView)}><TabsList variant="line" aria-label="Vy">
        {VIEWS.map(v => <TabsTrigger key={v.id} value={v.id}>{v.label}</TabsTrigger>)}</TabsList></Tabs>
        </div>}

    {annualView && <p className="tjanst-meta">Hela läsåret · HT och VT</p>}
    <div className="tjanst-controls">
      {!annualView && <TermSwitch term={term} onTerm={chooseTerm}/>}
    {data && (shownView === 'matris' || shownView === 'kurs' || shownView === 'fordela') && <div className="protected-filter tjanst-filter" inert={quickBusy}>
      <TjanstLensBar extra={<TjanstActionMenu className="tjanst-filter-options" label={`Filter${[filter.classId, filter.subject, filter.personId, filter.onlyIssues].filter(Boolean).length ? ` (${[filter.classId, filter.subject, filter.personId, filter.onlyIssues].filter(Boolean).length})` : ''}`}>
      <div className="tjanst-field"><label htmlFor={`${headingId}-klass`}>Klass</label><select id={`${headingId}-klass`} value={filter.classId} onChange={e => patchSaved({ filter: { ...filter, classId: e.target.value } })}><option value="">Alla klasser</option>{data.classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}</select></div>
      <div className="tjanst-field"><label htmlFor={`${headingId}-amne`}>Ämne</label><select id={`${headingId}-amne`} value={filter.subject} onChange={e => patchSaved({ filter: { ...filter, subject: e.target.value } })}><option value="">Alla ämnen</option>{subjects.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
      <div className="tjanst-field"><label htmlFor={`${headingId}-larare`}>Lärare</label><select id={`${headingId}-larare`} value={filter.personId} onChange={e => patchSaved({ filter: { ...filter, personId: e.target.value } })}><option value="">Alla lärare</option>{teachers.map(t => <option key={t.personId} value={t.personId}>{t.displayName}</option>)}</select></div>
<label className="mandate-check"><input type="checkbox" checked={filter.onlyIssues} onChange={e => patchSaved({ filter: { ...filter, onlyIssues: e.target.checked } })}/>Visa bara avvikelser och saknade kopplingar</label>
      </TjanstActionMenu>} clear={hasFilter ? <Button variant="outline" onClick={() => patchSaved({ filter: EMPTY_FILTER })}>Rensa filter</Button> : null} lens={filter.lens} onLens={lens => patchSaved({ filter: { ...filter, lens }, autoLens: false })} phone={phone} matrix={shownView === 'matris'}
        shown={columns.length} total={teachers.length} showAll={showAll} onShowAll={setShowAll} filteredByTeacher={!!filter.personId}
        teachers={teachers} pinned={prefs.pinned} onPin={pin} compact={prefs.compact} onCompact={compact => updatePrefs({ ...prefs, compact })}
        saved={prefs.saved} onSave={saveLens} onDeleteSaved={name => updatePrefs({ ...prefs, saved: prefs.saved.filter(s => s.name !== name) })}
        onApplySaved={lens => { patchSaved({ filter: { ...lens.filter, lens: lens.lens }, autoLens: false }); setShowAll(lens.showAll); }}/>
      {filter.course && <output className="tjanst-course-filter">Visar alla klasser med kursen {courseLabel}. Markera rader för att koppla dem till en samläsning.</output>}

    </div>}
    {data && (editable || quickBusy) && <div className="mandate-actions tjanst-actions" inert={!editable || loading}>
      <TjanstActionMenu label="Lägg till">
      {onOpenElectiveBlocks && <Button variant="outline" onClick={()=>onOpenElectiveBlocks?.()}><Plus size={16} aria-hidden="true"/>Lägg till valbart block</Button>}
      {data.actions.includes('add_teacher') && <Button variant="outline" onClick={e => open({ kind: 'addTeacher' }, actionOrigin(e.currentTarget))}><Plus size={16} aria-hidden="true"/>Lägg till lärare i fördelningen</Button>}
      {data.actions.includes('add_teacher') && context.function === 'rektor' && <Button variant="outline" onClick={e => open({ kind: 'newTeacher' }, actionOrigin(e.currentTarget))}><UserRoundPlus size={16} aria-hidden="true"/>Lägg upp ny lärare</Button>}
      {data.actions.includes('save_special') && <Button variant="outline" onClick={e => open({ kind: 'special', special: null }, actionOrigin(e.currentTarget))}><Plus size={16} aria-hidden="true"/>Lägg till specialuppdrag</Button>}
      </TjanstActionMenu><TjanstActionMenu label="Verktyg">
        {shownView === 'matris' && data.capabilities.canEdit && data.actions.includes('save_row') && !phone && <label className="mandate-check"><input type="checkbox" checked={matrixAdvanced} onChange={e => setMatrixAdvanced(e.target.checked)}/>Avancerade val före tilldelning</label>}
        <details className="tjanst-assignment-help"><summary>Så fungerar tilldelning</summary><p>Normalt tilldelar ett klick i en tom lärarcell återstående tid för HT och VT direkt. Befintliga tilldelningar och Vakant öppnas i dialog. Skift+klick, Skift+Enter eller Skift+mellanslag öppnar avancerade val.</p></details>
      {data.actions.includes('move') && <Button variant="outline" onClick={e => open({ kind: 'batch', mode: 'move' }, actionOrigin(e.currentTarget))}>Flytta uppdrag</Button>}
      {data.actions.includes('bulk') && <Button variant="outline" onClick={e => open({ kind: 'batch', mode: 'bulk' }, actionOrigin(e.currentTarget))}>Massregistrera</Button>}
      <Button variant="outline" disabled={loading} onClick={e => { pendingFocus.current = actionOrigin(e.currentTarget); pendingMatrixFocus.current = false; refresh(); }}>Hämta aktuellt läge</Button>
    {data && (editable || quickBusy) && data.actions.includes('remove_teacher') && <details className="tjanst-empty-columns" inert={!editable || loading}><summary>Tomma lärarkolumner</summary><p>En tom kolumn kan tas bort ur fördelningen. Personen finns kvar i Personal.</p>
      {data.teachers.filter(t => !data.rows.some(r => r.personId === t.personId) && !data.specials.some(s => s.personId === t.personId) && !data.joints.some(j => j.teachers.some(p => p.personId === t.personId))).map(t => <div key={t.personId}>{t.displayName} <Button variant="outline" onClick={e => open({ kind: 'confirm', confirm: 'removeTeacher', id: t.personId }, actionOrigin(e.currentTarget))}>Ta bort tom lärarkolumn…</Button></div>)}</details>}
      </TjanstActionMenu>
    </div>}
    </div>
    <div className="tjanst-messages">
      {allocationDraftCount > 0 && <output className="admin-notice">
        Osparade tider i Fördela: {allocationDraftCount} behov. Tiderna finns kvar när du byter vy i samma planering.
        {!versionId && !phone && <Button variant="outline" disabled={busy || checking || pendingCheck || recovering} onClick={() => setAllocationDrafts({})}>Återställ alla osparade tider i Fördela</Button>}
      </output>}
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
    {data && <div className="tjanst-content" inert={loading || quickBusy} aria-labelledby={headingId}>
      <h2 id={headingId} ref={viewHeading} tabIndex={-1} className="sr-only">{VIEWS.find(v => v.id === shownView)!.label}</h2>
      {empty && <p>{phone ? 'Inga uppdrag har ännu fördelats för läsåret. Här kan du läsa aktuellt underlag. Planeringen görs på dator.' : 'Välj ett behov i matrisen och välj lärare på raden. Inga lärarval är förifyllda.'}</p>}
      {!linked && shownView === 'matris' ? <div className="admin-empty tjanst-state"><h2>Inga klasser med timplan</h2><p>Ingen klass på skolan har en timplan för läsåret {yearLabel(schoolYear)}. Koppla klasserna till timplaner först. En gymnasieklass behöver en koppling för varje läsår, även i årskurs 2 och 3.</p>
        {onOpenClassLinks && <TjanstClassLinkButtons onOpen={onOpenClassLinks}/>}</div>
      : hasFilter && filtered.length === 0 && !teachingGroupEntries(data, filter, term, matrixFeedback?.filterKey === matrixFilterKey ? matrixFeedback.sourceKey : undefined).length && (shownView === 'matris' || shownView === 'kurs' || shownView === 'fordela') ? <div className="admin-empty tjanst-state"><p>Inga rader matchar filtret.</p><Button variant="outline" onClick={() => patchSaved({ filter: EMPTY_FILTER })}>Rensa filter</Button></div>
      : shownView === 'matris' ? <section aria-label="Matris"><TjanstMatrix data={data} groups={filtered} teachers={columns} term={term} editable={editable && can('save_row')} onOpenClassLinks={onOpenClassLinks}
          onGroupBody={setMatrixGroupBody} additionalCoverage={teachingGroupEntries(data, filter, term, matrixFeedback?.filterKey === matrixFilterKey ? matrixFeedback.sourceKey : undefined)} onOpenElectiveBlocks={()=>onOpenElectiveBlocks?.()} onPrepareNeed={need=>{if(data)onOpenElectiveBlocks?.(electivePreparationTarget(data,need)??undefined);}}
          advanced={matrixAdvanced}
          feedback={versionId ? null : matrixFeedback} undoSourceKey={matrixUndo && undoMatches(data, matrixUndo) ? matrixUndo.row.sourceKey : null}
          onUndo={() => void undoMatrix()} undoDisabled={!editable || loading}
          pinned={prefs.pinned} onPin={phone ? undefined : pin} compact={prefs.compact}
          onCell={(target, from, advanced) => void assignMatrix(target, from, advanced)} onOpenCourse={openCourse} onOpenJoint={openJoint}
          onOpenSharing={can('save_sharing') ? (sourceKey, from) => open({ kind: 'sharing', sourceKey }, from) : undefined}
          onJoint={(jointId, from, advanced, target) => advanced || !target ? open({ kind: 'joint', rowIds: data.joints.find(j => j.id === jointId)?.rowIds ?? [], jointId }, from) : open({ kind: 'matrixActions', target }, from)}/></section>
      : shownView === 'fordela' && !filtered.length && teachingGroupEntries(data, filter, term).length > 0 ? <p>Fördela lärartiden på undervisningsgrupperna nedan.</p>
      : shownView === 'fordela' ? <TjanstAllocation data={data} groups={filtered} term={term} lens={filter.lens} onOpenElectiveBlocks={()=>onOpenElectiveBlocks?.()} onPrepareNeed={need=>{if(data)onOpenElectiveBlocks?.(electivePreparationTarget(data,need)??undefined);}} editable={editable && can('save_row')} phone={phone} onOpenCourse={openCourse}
          drafts={versionId ? {} : allocationDrafts} onDraft={updateAllocationDraft}
          initialSourceKey={allocationStart}
          loadSupport={(sourceKey, rowId) => loadPreview({ unitId: data.unitId, schoolYear: data.schoolYear, mode: 'row', sourceKey, rowId })}
          onSave={async (change, message) => { const outcome = await sendPrepared(change, () => message); if (outcome.ok) askSharingFor(change); return outcome; }}/>
      : shownView === 'klass' ? <TjanstClassView data={data} groups={groups} classId={effectiveClass} term={term} onClass={id => patchSaved({ classId: id })} onOpenClassLinks={onOpenClassLinks} onOpenJoint={openJoint}/>
      : shownView === 'larare' ? <TjanstTeacherView data={data} personId={effectivePerson} onTeacher={id => patchSaved({ personId: id })} feedback={feedback}/>
      : shownView === 'special' ? <TjanstSpecialView data={data} editable={can('save_special')} onEdit={(special, from) => open({ kind: 'special', special }, from)}/>
      : !filtered.length && teachingGroupEntries(data, filter, term).length > 0 ? null : <TjanstCourseView data={data} groups={filtered} onAllocate={can('save_row') ? openAllocation : undefined} editable={can('save_joint')} marked={marked} visible={visibleKeys} markError={markError} focusJointId={focusJoint} onFocusedJoint={clearFocusJoint} onMark={ids => { setMarked(ids); setMarkError(null); }} onLink={linkMarked}
          onEditJoint={(joint, from) => open({ kind: 'joint', rowIds: joint.rowIds, jointId: joint.id }, from)} onDissolve={(joint, from) => open({ kind: 'confirm', confirm: 'dissolve', id: joint.id }, from)}/>}
    </div>}
    {data && <TjanstGroupMatrix key={`${data.unitId}:${data.schoolYear}:${versionId ?? 'draft'}`} data={data} teachers={columns} filter={shownView === 'klass' ? { ...EMPTY_FILTER, classId: effectiveClass } : filter} term={term} editable={editable && can('save_row')} phone={phone} advanced={matrixAdvanced} inMatrix={shownView === 'matris'} matrixBody={matrixGroupBody} visible={['matris','fordela','klass','kurs'].includes(shownView)} onFeedback={(sourceKey, text) => setMatrixFeedback({ filterKey: matrixFilterKey, sourceKey, text })} onOpenCourse={openCourse} onBusy={setQuickBusy} onOpenBlocks={()=>onOpenElectiveBlocks?.()} loadPreview={loadPreview}
      onSave={(change, accepted) => sendPrepared(change, detail => { accepted?.(detail); return ''; }, () => active.current && !phoneRef.current, true)}/>}
    {data && data.rows.some(r => r.sourceKind === 'teaching_group' ? !data.groups?.some(group => group.sourceKey === r.sourceKey) : !groups.some(g => g.entries.some(e => e.need.sourceKey === r.sourceKey && !e.need.organizationPending))) && <section className="protected-card"><h2>Sparade rader som behöver stämmas av</h2><p>Granska dessa fördelningar mot aktuellt underlag. En tidigare klassram kan ha ersatts av undervisningsgrupper.</p>
      {data.rows.filter(r => r.sourceKind === 'teaching_group' ? !data.groups?.some(group => group.sourceKey === r.sourceKey) : !groups.some(g => g.entries.some(e => e.need.sourceKey === r.sourceKey && !e.need.organizationPending))).map(r => <div key={r.id}><span>{rowName(r).teacher} · {rowName(r).course} · {rowName(r).cls} · HT {formatTime(r.teacherHt)} · VT {formatTime(r.teacherVt)}</span>
        {can('delete_row') && !r.jointGroupId && <Button variant="outline" onClick={e => open({ kind: 'confirm', confirm: 'deleteRow', id: r.id }, e.currentTarget)}>Ta bort tjänsteraden…</Button>}
        {can('dissolve_joint') && r.jointGroupId && <Button variant="outline" onClick={e => open({ kind: 'confirm', confirm: 'dissolve', id: r.jointGroupId! }, e.currentTarget)}>Lös upp samläsningen…</Button>}</div>)}</section>}
    {!phone && dialog && dialog.kind !== 'batch' && dialog.kind !== 'matrixActions' && !support && <>{supportBusy && <output aria-busy="true">Hämtar planeringsstöd…</output>}
      {supportError && <div><Problems failure={supportError} summary={false} checking={false}/><Button variant="outline" onClick={() => setSupportKey(n => n + 1)}>Hämta planeringsstöd igen</Button><Button variant="outline" onClick={() => close()}>Stäng formuläret</Button></div>}
</>}
    {!phone && dialogData && dialog?.kind === 'matrixActions' && dialogEntry && <TjanstMatrixActions data={dialogData} rows={dialogEntry.rows.filter(row => row.personId !== null)} target={dialog.target} description={`${dialogEntry.need.label} · ${dialogEntry.cls.name}`} onClose={() => close()}
      onReplace={row => {
        if (data?.revision !== dialogData.revision) { close(); setPageError(failed('Underlaget har ändrats. Välj tilldelningen på nytt.')); return; }
        const personId = dialog.target.personId !== row.personId && !dialogEntry.rows.some(r => r.id !== row.id && r.personId === dialog.target.personId) ? dialog.target.personId : null;
        if (row.jointGroupId) { const joint = dialogData.joints.find(j => j.id === row.jointGroupId); if (!joint || row.personId === null) return;
          open({ kind: 'batch', mode: 'move', scopedMove: { fromPersonId: row.personId, rowIds: joint.rowIds.filter(id => dialogData.rows.some(r => r.id === id && r.personId === row.personId)), ...(personId ? { targetPersonId: personId } : {}) } }, origin.current);
        } else open({ kind: 'row', target: { ...dialog.target, rowId: row.id, personId: personId ?? row.personId }, replaceTeacher: true }, origin.current);
      }} onAdvanced={row => {
        if (data?.revision !== dialogData.revision) { close(); setPageError(failed('Underlaget har ändrats. Välj tilldelningen på nytt.')); return; }
        const ids = [...new Set(dialogEntry.rows.flatMap(r => r.jointGroupId ? [r.jointGroupId] : []))], jointId = row ? row.jointGroupId : (ids.length === 1 ? ids[0] : null);
        const joint = dialogData.joints.find(j => j.id === jointId);
        if (joint) open({ kind: 'joint', jointId: joint.id, rowIds: joint.rowIds }, origin.current);
        else { const target = row && (row.id === dialog.target.rowId || dialogEntry.rows.filter(r => r.personId !== null).length > 1) ? { ...dialog.target, rowId: row.id, personId: row.personId } : dialog.target; open({ kind: 'row', target, advanced: true }, origin.current); }
      }}/>}
    {!phone && dialogData && dialog?.kind === 'row' && dialogEntry && support?.mode === 'row' && <TjanstRowDialog {...base} key={`${dialog.target.sourceKey}:${dialog.target.rowId}`} data={dialogData} entry={dialogEntry} target={dialog.target} support={support} replaceTeacher={dialog.replaceTeacher} advanced={dialog.advanced}
      onClose={() => close()} onDelete={row => open({ kind: 'confirm', confirm: 'deleteRow', id: row.id }, origin.current)}
      onSave={async change => {
        if (change.action !== 'save_row') return failed('Tjänsteraden kunde inte kontrolleras.');
        const payload = change.payload, who = payload.personId === null ? 'Vakant' : support.candidates.find(p => p.personId === payload.personId)?.displayName ?? dialogData.teachers.find(t => t.personId === payload.personId)?.displayName ?? 'Läraren';
        const inline = shownView === 'matris' && support.currentRow?.personId != null;
        const result = await sendPrepared(change, () => {
          if (inline) setMatrixFeedback({ sourceKey: dialogEntry.need.sourceKey, filterKey: matrixFilterKey, text: `Sparat · ${who}` });
          return `Tjänsteraden är sparad: ${who}, ${dialogEntry.need.label}, ${dialogEntry.cls.name}, HT ${formatTime(payload.teacherHt)} · VT ${formatTime(payload.teacherVt)}.`;
        }, () => true, inline);
        if (result.ok) askSharingFor(change);
        return !result.ok && result.code === 'tjanst_duplicate_row' ? { ...result, error: `${who} har redan en rad för ${dialogEntry.need.label} i ${dialogEntry.cls.name}. Ändra den befintliga raden.` } : result;
      }}/>}
    {!phone && dialogData && dialog?.kind === 'special' && support?.mode === 'catalog' && <TjanstSpecialDialog {...base} key={dialog.special?.id ?? 'ny'} data={dialogData} special={dialog.special} candidates={support.candidates} onChoice={acceptCatalog}
      onClose={() => close()} onDelete={s => open({ kind: 'confirm', confirm: 'deleteSpecial', id: s.id }, origin.current)} onSave={draft => plan('save_special', { specialId: dialog.special?.id ?? null, ...draft }, () => `Specialuppdraget ${draft.label} är sparat för ${draft.personId === null ? 'Vakant' : support.candidates.find(p => p.personId === draft.personId)?.displayName ?? dialogData.teachers.find(t => t.personId === draft.personId)?.displayName ?? 'läraren'}.`)}/>}
    {!phone && dialogData && dialog?.kind === 'joint' && jointDialog && support?.mode === 'catalog' && <TjanstJointDialog {...base} key={dialog.jointId ?? dialog.rowIds.join()} data={dialogData} joint={jointDialog.joint}
      rows={dialog.rowIds.map(id => dialogData.rows.find(r => r.id === id)).filter((r): r is TjanstRow => !!r)} onClose={() => close()}
      onSave={async draft => { const outcome = await plan('save_joint', { jointId: dialog.jointId, name: draft.name, rowIds: dialog.rowIds, teachers: draft.teachers }, () => `Samläsningen ${draft.name} är sparad. Lärartiden räknas en gång och klasserna ${[...new Set(dialog.rowIds.map(id => rowName(dialogData.rows.find(r => r.id === id)!).cls))].join(' och ')} visas som täckta.`); if (outcome.ok) setMarked([]); return outcome; }}/>
    }
    {!phone && dialogData && dialog?.kind === 'sharing' && support?.mode === 'catalog' && <TjanstSharingDialog {...base} key={dialog.sourceKey} data={dialogData} sourceKey={dialog.sourceKey}
      title={(() => { const group = dialogData.groups?.find(group => group.sourceKey === dialog.sourceKey); if (group) return `${group.label} · ${group.name}`; const cls = dialogData.classes.find(c => c.needs.some(n => n.sourceKey === dialog.sourceKey)); const need = cls?.needs.find(n => n.sourceKey === dialog.sourceKey); return `${need?.label ?? ''} · ${cls?.name ?? ''}`; })()}
      onClose={() => close()}
      onSave={(mode, graderPersonIds) => plan('save_sharing', { sourceKey: dialog.sourceKey, mode, graderPersonIds }, () => `Delningen är sparad: ${SHARING_LABEL[mode]}. Sätter betyg: ${graderPersonIds.map(id => dialogData.teachers.find(t => t.personId === id)?.displayName ?? 'Okänd lärare').join(', ')}.`)}
      onClear={() => plan('clear_sharing', { sourceKey: dialog.sourceKey }, () => 'Delningen är borttagen. Ange en ny delning före publicering.')}/>}
    {!phone && dialogData && dialog?.kind === 'addTeacher' && support?.mode === 'catalog' && <TjanstAddTeacherDialog {...base} data={dialogData} candidates={support.candidates} onChoice={acceptCatalog} onClose={() => close()}
      onNewTeacher={context.function === 'rektor' ? () => open({ kind: 'newTeacher' }, origin.current) : undefined} onSave={(person, name) => plan('add_teacher', { personId: person }, () => `${name} är tillagd i fördelningen.`)}/>}
    {!phone && dialogData && dialog?.kind === 'newTeacher' && <TjanstNewTeacherDialog {...base} schoolName={dialogData.schoolName} onClose={() => close()} onSave={newTeacher}/>}
    {!phone && dialogData && confirm && support?.mode === 'catalog' && <Confirmation key={`${confirm.confirm}:${confirm.id}`} data={dialogData} dialog={confirm} base={base} rowName={rowName}
      onClose={focus => close(focus)} plan={plan} classHeading={id => document.querySelector<HTMLElement>(`[data-class-heading="${CSS.escape(id)}"]`)}/>}
    {!phone && data && dialog?.kind === 'batch' && <TjanstYearDialog mode={dialog.mode} scopedMove={dialog.scopedMove} data={data} scopeKey={scopeKey} disabled={busy || checking || pendingCheck || recovering || !data.capabilities.canEdit}
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
    <h1>Tjänstefördelning</h1>
    <p className="tjanst-subline">{schoolName ? `${schoolName} · ` : ''}Läsåret {yearLabel(schoolYear)}{forms.length ? ` · ${forms.join(' · ')}` : ''}</p>
  </div><details className="tjanst-intro"><summary>Om tjänstefördelningen</summary>
    <p>{readOnly ? 'Här kan du läsa skolans fördelning utan att ändra den.'
      : `Fördela skolans undervisning och specialuppdrag på lärare. Behovet kommer från klassernas timplaner. Lärarna ser fördelningen först när rektor har fastställt och publicerat.${admin ? ' Du kan förbereda fördelningen. Rektor fattar publiceringsbeslutet.' : ''}`}</p>
  </details></div>;
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
    return <TjanstConfirmDialog {...base} onClose={() => onClose(deleted.current ? row.sourceKind === 'class_timplan' ? classHeading(row.classId) : undefined : undefined)} title="Ta bort tjänsteraden?" text={`${n.teacher}, ${n.course}, ${n.cls} tas bort ur planeringen. Publicerade versioner ändras inte.`}
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
