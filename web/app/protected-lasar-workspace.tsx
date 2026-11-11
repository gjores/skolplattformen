'use client';
// Läsår & skoldagar i skyddad drift (fas 05.1.1, planerna 03–05).
// Samma kalender, delar och klasser som demovyn (lasar-view.tsx), men data
// kommer från /api/lasar/lasa, ändringar skickas som kommandon till
// /api/lasar/kommando och beslut till /api/lasar/beslut. Knappar och
// redigering styrs bara av serverns förmågor (capabilities) och
// editableFrom; det finns ingen rollväxlare och inget klientval av roll
// (A-01, LASAR-02). Modellens interna spärr kräver rollen 'rektor'; den
// sätts bara när servern har sagt canEdit och visas aldrig som roll i vyn.
// Avvikelser från demon: A-01–A-14, A-16 och A-18 (UI-SPEC). Startval och
// granskning efter kopiering ligger i protected-lasar-start.tsx, huvudmannens
// ram i protected-lasar-frame.tsx och undervisningspanelen i
// protected-lasar-teaching.tsx. Med Alla behöriga skolor (unitId null) visar vyn
// arbetssättskortet för huvudmannen och listan med kalenderstatus per skola
// (protected-lasar-overview.tsx, plan 12).
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCheck, CircleCheck, MessageSquareText, RotateCcw, Send, Undo2, Unlock, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/server-client.ts';
import { useRequestConfirm, useRequestDiscard, useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import {
  isLasarReason,
  lasarCommandRequest,
  lasarDecisionRequest,
  lasarErrorText,
  lasarHistoryTime,
  lasarRoleLabel,
  lasarSchoolYear,
  LasarContractError,
  LASAR_GENERIC_TEXT,
  LASAR_UNCERTAIN_TEXT,
  parseLasarCommandReply,
  parseLasarDecisionReply,
  parseLasarReadReply,
  type LasarActorRole,
  type LasarAnyOp,
  type LasarCommandOp,
  type LasarCreateSource,
  type LasarReviewItem,
  type LasarDecision,
  type LasarErrorContext,
  type LasarReadReply,
  type LasarTarget,
} from '@/lib/lasar-contract.ts';
import { lasarOps } from '@/lib/lasar-ops.ts';
import {
  addDays,
  allIssues,
  canEdit as modelCanEdit,
  dayInfo,
  formatDate,
  formatLong,
  isoWeek,
  mondayOfWeek,
  setDay,
  setDays,
  setNote,
  setNotes,
  setTerm,
  statusLabel,
  summarize,
  yearOf,
  type DayInfo,
  type LasarState,
  type Planned,
  type SchoolYear,
} from '@/lib/lasar-model.ts';
import { LasarCalendar, selectionFacts, statusPlural, useCalendarSelection, type ClickModifiers, type DayMark } from './lasar-calendar.tsx';
import {
  DEMO_BOUNDARY,
  LasarActionDialog,
  LasarControlCard,
  LasarCover,
  LasarCoverSide,
  LasarFrameLine,
  LasarHolidaysCard,
  LasarInlineError,
  LasarLegend,
  LasarMarking,
  LasarSchoolTools,
  LasarTalkCard,
  LasarTerms,
  LasarWorkflow,
  PlanBoundary,
  type LasarAction,
} from './lasar-parts.tsx';
import MfaStepUpNotice from './mfa-step-up.tsx';
import { LasarReviewCard, ProtectedLasarModeCard, ProtectedLasarStart, reviewCandidates } from './protected-lasar-start.tsx';
import ProtectedLasarOverview, { type LasarOpenTarget } from './protected-lasar-overview.tsx';
import { ProtectedLasarTeaching } from './protected-lasar-teaching.tsx';
import {
  changeCount,
  changedDates,
  compareWithFrame,
  frameReviewText,
  frameValueText,
  LasarFrameBanner,
  LasarFrameCard,
  LasarFrameCoverSide,
  LasarPublishFrameDialog,
  LasarTakeFrameDialog,
} from './protected-lasar-frame.tsx';
import type { FrameChanges } from '@/lib/lasar-frame.ts';
import './protected-lasar.css';

export type ProtectedLasarWorkspaceProps = {
  /** Skolenheten; null betyder Alla behöriga skolor (avsnitt 13). Ramens mål anges med `target`. */
  unitId: string | null;
  schoolName: string;
  schoolYear: number;
  schoolTypes: string[];
  onSessionLost: () => void;
  /** Huvudmannens ram (D-08) eller skolan; standard är skolan `unitId`. */
  target?: LasarTarget;
  /** Sessionens uppdrag, bara för texter i tomläget (A-01). Knappar styrs av förmågorna. */
  actorRole?: LasarActorRole | null;
  /** Alla behöriga skolor: Öppna kalendern byter planeringsvalet till skolan eller ramen och läsåret. */
  onOpenCalendar?: (target: LasarOpenTarget) => void;
  /** Alla behöriga skolor: arbetssättet har bytts, så planeringsvalets post Huvudmannens ram läses om. */
  onModeChanged?: () => void;
};

type Phase = 'loading' | 'error' | 'ready';
type Failure = { text: string; mfa: boolean; rules: boolean; reload: boolean };
/** A-08: ”ramen” betyder huvudmannens ram i skyddad drift. */
const CONTROL = { heading: 'Kontroll mot förordningarna', ok: 'Inom gränserna' } as const;
/** A-10: beslutet är verkligt och versionsbundet i skyddad drift. */
const BOUNDARY = DEMO_BOUNDARY.replace(' Ett fastställt beslut i exemplet är ingen handling i verklig mening.', ' Fastställandet sparas med datum, version och beslutstext. Tjänstefördelning och timplaner läser den fastställda versionen.');
const READ_ONLY_HINT = 'Du har läsbehörighet. Klicka på en dag för detaljer, skift- eller kommando-klicka för att markera flera.';
const MFA_MESSAGE = 'Verifiering med engångskod krävs.';
const MFA_DETAIL = 'Din osparade text finns kvar här. Om du väljer verifiering lämnar du sidan.';
const UNSUPPORTED = 'Ändringen kan inte sparas här. Kalendern har inte ändrats.';
/** Beslut per dialog i vyn (UI-SPEC avsnitt 9). */
const DECISION: Record<LasarAction, LasarDecision> = { submit: 'submit', approve: 'approve', return: 'return', reopen: 'reopen', request: 'request_change', decline: 'decline_request' };
const yearLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
const clockTime = () => new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
const isAbort = (caught: unknown) => caught instanceof DOMException && caught.name === 'AbortError';
const stockholmDate = (at: string) => new Date(at).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
const statusWord: Record<SchoolYear['status'], string> = { utkast: 'utkast', förslag: 'förslag', återsänd: 'återsänd', fastställd: 'fastställd' };

function stateOf(read: LasarReadReply): LasarState {
  const sy = lasarSchoolYear(read);
  return { role: read.capabilities.canEdit ? 'rektor' : 'huvudman', years: sy ? [sy] : [] };
}

export default function ProtectedLasarWorkspace(props: ProtectedLasarWorkspaceProps) {
  if (props.unitId === null && props.target?.kind !== 'frame') return <ProtectedLasarAllSchools {...props} />;
  return <LasarCalendarWorkspace {...props} unitId={props.unitId ?? 'ram'} />;
}

/**
 * Alla behöriga skolor (avsnitt 13): rubriken ”Välj skola”, för huvudmannen arbetssättskortet
 * (avsnitt 11) och sedan listan med kalenderstatus per skola. Kortets Spara arbetssätt är vyns
 * enda primära knapp; listans knappar är outline.
 */
function ProtectedLasarAllSchools({ schoolYear, actorRole = null, onSessionLost, onOpenCalendar, onModeChanged }: ProtectedLasarWorkspaceProps) {
  const [reload, setReload] = useState(0);
  return (
    <section className="admin-workspace timplan-workspace protected-lasar ly-all-schools" aria-labelledby="ly-all-heading">
      <header className="ly-all-heading">
        <h1 className="admin-kicker ly-page-title">Läsår och skoldagar · Alla behöriga skolor</h1>
        <h2 id="ly-all-heading">Välj skola</h2>
        <p>Välj en skola i planeringsvalet eller i listan.</p>
      </header>
      {actorRole === 'huvudman' && (
        <ProtectedLasarModeCard schoolYear={schoolYear} onSessionLost={onSessionLost} onChanged={() => { setReload((n) => n + 1); onModeChanged?.(); }} />
      )}
      <ProtectedLasarOverview
        schoolYear={schoolYear}
        unitId={null}
        reload={reload}
        actorRole={actorRole}
        onOpen={onOpenCalendar}
        onSecurityFailure={(caught) => {
          if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) { onSessionLost(); return true; }
          return false;
        }}
      />
    </section>
  );
}

function LasarCalendarWorkspace({ unitId, schoolName, schoolYear, schoolTypes, onSessionLost, target: targetProp, actorRole = null }: ProtectedLasarWorkspaceProps & { unitId: string }) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [read, setRead] = useState<LasarReadReply | null>(null);
  const [state, setState] = useState<LasarState>({ role: 'huvudman', years: [] });
  const [error, setError] = useState('');
  const [inlineMfa, setInlineMfa] = useState(false);
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tool, setTool] = useState<Planned>('lovdag');
  const [note, setNoteText] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [noteDraft, setNoteDraft] = useState<{ key: string; value: string } | null>(null);
  const [talk, setTalk] = useState('');
  const [action, setAction] = useState<LasarAction | null>(null);
  const [comment, setComment] = useState('');
  const [dialog, setDialog] = useState<{ error: string; list: string[]; mfa: boolean }>({ error: '', list: [], mfa: false });
  const [busy, setBusy] = useState(false);
  const [taking, setTaking] = useState<FrameChanges | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [publishText, setPublishText] = useState('');
  const calendar = useCalendarSelection();
  const requestConfirm = useRequestConfirm();
  const requestDiscard = useRequestDiscard();

  // Senaste lokala läge och serverns version/revision, utan att vänta på rendering.
  const local = useRef(state);
  const basis = useRef<{ versionId: string; revision: number } | null>(null);
  const chosenVersion = useRef<string | null>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const pending = useRef(0);
  const lost = useRef(onSessionLost);
  useEffect(() => { lost.current = onSessionLost; });
  const frameTarget = targetProp?.kind === 'frame';
  const target: LasarTarget = frameTarget ? { kind: 'frame' } : { kind: 'school', unitId };

  const adopt = useCallback((reply: LasarReadReply) => {
    const next = stateOf(reply);
    local.current = next;
    basis.current = reply.calendar ? { versionId: reply.calendar.versionId, revision: reply.calendar.revision } : null;
    chosenVersion.current = reply.calendar?.versionId ?? chosenVersion.current;
    setRead(reply);
    setState(next);
  }, []);

  /** Läser kalendern. `quiet` behåller vyn och markeringen (omläsning efter nekad skrivning). */
  const load = useCallback(async (quiet = false) => {
    const gen = ++generation.current;
    pending.current = 0;
    const request = { target: frameTarget ? { kind: 'frame' as const } : { kind: 'school' as const, unitId }, schoolYear, versionId: chosenVersion.current };
    try {
      const reply = parseLasarReadReply(await api.post<unknown>('/api/lasar/lasa', request), request);
      if (gen !== generation.current) return;
      adopt(reply);
      setPhase('ready');
    } catch (caught) {
      if (gen !== generation.current || isAbort(caught)) return;
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) { lost.current(); return; }
      if (!quiet) { setRead(null); setState({ role: 'huvudman', years: [] }); setPhase('error'); }
    }
  }, [unitId, schoolYear, frameTarget, adopt]);

  // Byte av skola eller läsår nollställer allt som hör till det tidigare urvalet (som choose() i demon).
  const scope = `${frameTarget ? 'ram' : unitId}:${schoolYear}`;
  const [shownScope, setShownScope] = useState(scope);
  if (shownScope !== scope) {
    setShownScope(scope);
    setPhase('loading');
    setState({ role: 'huvudman', years: [] });
    setRead(null);
    setSaving(false);
    calendar.clear();
    setError('');
    setNotice('');
    setSavedAt(null);
    setAction(null);
    setNoteDraft(null);
  }
  useEffect(() => {
    let active = true;
    chosenVersion.current = null;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; generation.current += 1; };
  }, [load]);

  const sy = state.years[0];
  const caps = read?.capabilities;
  const editable = sy ? modelCanEdit(state, sy) : false;
  const types = read?.schoolTypes ?? schoolTypes;
  const summary = sy ? summarize(sy, types) : undefined;
  const errors = summary?.issues.filter((i) => i.level === 'error') ?? [];
  const warnings = summary?.issues.filter((i) => i.level === 'warning') ?? [];
  const gy = types.includes('GY') || types.includes('GYAN');
  const editableFrom = read?.editableFrom ?? null;
  const isLocked = editableFrom ? (date: string) => date < editableFrom : undefined;
  const versions = read?.versions ?? [];
  const current = versions.find((v) => v.current);
  const latest = versions.at(-1);
  const selected = read?.calendar ? versions.find((v) => v.versionId === read.calendar!.versionId) : undefined;
  const olderSelected = Boolean(selected && latest && selected.versionId !== latest.versionId);
  const review = read?.review ?? [];
  const openReview = review.filter((r) => !r.resolved).length;
  /** D-04: möjliga måldagar för ogranskade kopierade dagar får `ly-review`. */
  const reviewDates = new Set(review.filter((r) => !r.resolved).flatMap(reviewCandidates));
  /** A-06, D-05, D-06: jämförelse med ramen i skolvy och arbetssättet ram. */
  const comparison = !frameTarget && sy && read?.mode === 'ram' ? compareWithFrame(sy, read.frame) : null;
  const bannerActive = Boolean(comparison?.pending && comparison.latest && caps?.canEdit);
  const dayMark = (d: DayInfo): DayMark | undefined => {
    const marks: DayMark[] = [];
    if (reviewDates.has(d.date)) marks.push({ className: 'ly-review', title: 'att granska efter kopieringen' });
    const frameDiff = comparison?.days.get(d.date);
    if (frameDiff) marks.push({ className: 'ly-frame-day', title: `skiljer sig från ramen: ramen ${frameValueText(frameDiff.frame)}`, mark: <i key="frame" className="ly-frame-mark" aria-hidden="true" /> });
    if (!marks.length) return undefined;
    return {
      className: marks.map((m) => m.className).filter(Boolean).join(' '),
      title: marks.map((m) => m.title).filter(Boolean).join(' · '),
      mark: marks.map((m) => m.mark).filter(Boolean),
    };
  };
  const ctx = (extra: LasarErrorContext = {}): LasarErrorContext => ({ status: sy?.status, editableFrom, schoolYear, reviewOpen: openReview, ...extra });

  const { selectedDays, changeable, groupChangeable, groupMarked } = selectionFacts(sy, calendar.selection, new Map(), isLocked);
  const selectedInfo = selectedDays.length === 1 ? selectedDays[0] : undefined;
  const selectionKey = calendar.selection.join(',');
  const currentNote = selectedInfo ? selectedInfo.note ?? '' : '';
  const draftValue = noteDraft?.key === selectionKey ? noteDraft.value : currentNote;
  const noteDirty = noteDraft?.key === selectionKey && noteDraft.value.trim() !== currentNote.trim();

  // A-11: osparad text och pågående sparning.
  useUnsavedChanges('lasar-note', noteDirty);
  useUnsavedChanges('lasar-comment', talk.trim() !== '');
  useUnsavedChanges('lasar-dialog', action !== null && comment.trim() !== '');
  useUnsavedChanges('lasar-publish', publishing && publishText.trim() !== '');
  useUnsavedChanges('navigation-block:lasar-save', saving || busy);

  /** Felets text ur serverns vitlistade orsak (UI-SPEC avsnitt 13); okända fel ger allmän text. */
  function failure(caught: unknown, extra: LasarErrorContext = {}): Failure | null {
    if (isAbort(caught)) return null;
    if (caught instanceof ApiError) {
      if (caught.status === 401) { lost.current(); return null; }
      if (caught.code === 'mfa_required') return { text: '', mfa: true, rules: false, reload: false };
      if (isLasarReason(caught.reason)) {
        const reason = caught.reason;
        return { text: lasarErrorText(reason, ctx(extra)), mfa: false, rules: reason === 'lasar_rules_failed', reload: reason !== 'lasar_text_required' };
      }
      if (caught.status === 409) return { text: lasarErrorText('lasar_revision_conflict', {}), mfa: false, rules: false, reload: true };
      if (caught.status === 403) return { text: lasarErrorText('lasar_forbidden', {}), mfa: false, rules: false, reload: true };
      if (caught.status >= 500) return { text: LASAR_UNCERTAIN_TEXT, mfa: false, rules: false, reload: true };
      return { text: LASAR_GENERIC_TEXT, mfa: false, rules: false, reload: true };
    }
    return { text: LASAR_UNCERTAIN_TEXT, mfa: false, rules: false, reload: true };
  }
  function showInline(f: Failure) {
    setNotice('');
    setInlineMfa(f.mfa);
    setError(f.mfa ? '' : f.text);
    if (f.reload) void load(true);
  }

  async function send(ops: LasarAnyOp[], gen: number, message?: string): Promise<boolean> {
    const base = basis.current;
    if (gen !== generation.current || !base) return false;
    try {
      const request = await lasarCommandRequest({ target, schoolYear, versionId: base.versionId, expectedRevision: base.revision, ops });
      const reply = parseLasarCommandReply(await api.post<unknown>('/api/lasar/kommando', request), request);
      if (gen !== generation.current) return false;
      basis.current = { versionId: base.versionId, revision: reply.receipt.revision };
      pending.current -= 1;
      if (pending.current === 0) {
        adopt(reply.detail);
        setSaving(false);
        setSavedAt(clockTime());
      }
      if (message) setNotice(message);
      return true;
    } catch (caught) {
      if (gen !== generation.current) return false;
      pending.current = 0;
      setSaving(false);
      const f = failure(caught);
      if (f) showInline(f);
      return false;
    }
  }
  function enqueue(ops: LasarAnyOp[], message?: string): Promise<boolean> {
    pending.current += 1;
    setSaving(true);
    const gen = generation.current;
    const run = queue.current.then(() => send(ops, gen, message));
    queue.current = run;
    return run;
  }

  /** Kör modellens funktion lokalt och skickar skillnaden som kommando; svaret ersätter den lokala kopian. */
  function apply(fn: (s: LasarState) => LasarState, message?: string): boolean {
    const before = local.current;
    const id = before.years[0]?.id;
    if (!id) return false;
    let next: LasarState;
    try {
      next = fn(before);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Ändringen kunde inte göras.');
      return false;
    }
    const was = yearOf(before, id), now = yearOf(next, id);
    if (was.status !== now.status) { setError(UNSUPPORTED); return false; }
    const ops = lasarOps(was, now, { editableFrom });
    // D-12: något föll bort i filtret, så ändringen rör en passerad dag och görs inte alls.
    if (JSON.stringify(ops) !== JSON.stringify(lasarOps(was, now))) { setError(lasarErrorText('lasar_past_day', ctx())); return false; }
    setError('');
    setInlineMfa(false);
    local.current = next;
    setState(next);
    if (ops.length) void enqueue(ops, message);
    return true;
  }

  /** Ett uttryckligt kommando (återställ, kommentar) efter de köade ändringarna. */
  function command(op: LasarCommandOp, message: string): Promise<boolean> {
    setError('');
    return enqueue([op], message);
  }

  /** Startval (avsnitt 10): skapar kalendern; servern räknar fram innehållet ur källan. */
  async function create(source: LasarCreateSource) {
    if (busy || basis.current) return;
    const gen = generation.current;
    setBusy(true);
    setError('');
    try {
      const request = await lasarCommandRequest({ target, schoolYear, versionId: null, expectedRevision: null, ops: [{ op: 'create', source }] });
      const reply = parseLasarCommandReply(await api.post<unknown>('/api/lasar/kommando', request), request);
      if (gen !== generation.current) return;
      adopt(reply.detail);
      calendar.clear();
      setSavedAt(clockTime());
      const label = yearLabel(schoolYear);
      setNotice(source === 'copy'
        ? `Dagarna från ${yearLabel(schoolYear - 1)} är kopierade. Granska de dagar som inte kunde flyttas innan du skickar förslaget.`
        : source === 'frame'
          ? `Läsåret ${label} utgår från huvudmannens ram.`
          : frameTarget ? `Ett utkast till ramen för ${label} är skapat.` : `Ett förslag för läsåret ${label} är skapat.`);
    } catch (caught) {
      if (gen !== generation.current) return;
      const f = failure(caught);
      if (f) showInline(f);
    } finally {
      setBusy(false);
    }
  }

  /** D-04: Visa veckan markerar veckans ändringsbara dagar och rullar dit. */
  function showWeek(item: LasarReviewItem) {
    if (!sy) return;
    const date = reviewCandidates(item)[0];
    if (!date) return;
    const { year, week } = isoWeek(date);
    const monday = mondayOfWeek(year, week);
    const days = [0, 1, 2, 3, 4].map((i) => addDays(monday, i)).filter((d) => dayInfo(sy, d).editable && !isLocked?.(d));
    calendar.setSelection(days.length ? days : [date]);
    calendar.setAnchor(days[0] ?? date);
    document.querySelector(`.protected-lasar button[title^="${formatLong(days[0] ?? date)} ·"]`)?.scrollIntoView({ block: 'center' });
  }
  /** Markerar dagarna i kalendern och rullar till den första. */
  function showDates(dates: string[]) {
    if (!dates.length) return;
    calendar.setSelection(dates);
    calendar.setAnchor(dates[0]);
    document.querySelector(`.protected-lasar button[title^="${formatLong(dates[0])} ·"]`)?.scrollIntoView({ block: 'center' });
  }
  /** D-05: inget skickas förrän rektorn har bekräftat i dialogen; bara godkända nycklar. */
  function takeFrame(accepted: string[]) {
    const latest = comparison?.latest;
    setTaking(null);
    if (!latest || !accepted.length) return;
    void command({ op: 'take_frame_changes', frameVersionId: latest.versionId, accepted }, `${accepted.length} ${accepted.length === 1 ? 'ändring' : 'ändringar'} från ramens version ${latest.version} är intagna.`);
  }
  function keepSchoolCalendar() {
    const latest = comparison?.latest;
    if (!latest) return;
    void command({ op: 'keep_school_calendar', frameVersionId: latest.versionId }, 'Skolans kalender är behållen. Skillnaderna står kvar som skolans avvikelser.');
  }
  async function publishFrame() {
    if (busy) return;
    if (await decide('publish_frame', publishText, true)) {
      setPublishing(false);
      setPublishText('');
    }
  }

  /** Klar: posten är granskad. Infogad om en möjlig måldag nu har samma slag, annars avfärdad. */
  function resolve(item: LasarReviewItem) {
    if (!sy) return;
    const inserted = (item.kind === 'lovdag' || item.kind === 'studiedag') && reviewCandidates(item).some((d) => sy.exceptions[d]?.kind === item.kind);
    void command({ op: 'resolve_review', itemId: item.id, resolution: inserted ? 'inserted' : 'dismissed' }, 'Dagen är granskad.');
  }

  async function decide(decision: LasarDecision, text: string, inDialog: boolean): Promise<boolean> {
    await queue.current;
    const base = basis.current;
    if (!base || !sy) return false;
    let request;
    try {
      request = lasarDecisionRequest({ target, schoolYear, versionId: base.versionId, expectedRevision: base.revision, action: decision, text });
    } catch (caught) {
      const reason = caught instanceof LasarContractError && caught.reason === 'lasar_text_required' ? 'lasar_text_required' : null;
      const textError = reason ? lasarErrorText(reason, { action: decision }) : LASAR_GENERIC_TEXT;
      if (inDialog) setDialog({ error: textError, list: [], mfa: false }); else setError(textError);
      return false;
    }
    const gen = generation.current;
    setBusy(true);
    try {
      const reply = parseLasarDecisionReply(await api.post<unknown>('/api/lasar/beslut', request), request);
      if (gen !== generation.current) return false;
      adopt(reply.detail);
      calendar.clear();
      setError('');
      setInlineMfa(false);
      setNotice(successText(decision, reply.detail));
      return true;
    } catch (caught) {
      if (gen !== generation.current) return false;
      const f = failure(caught, { action: decision });
      if (!f) return false;
      if (!inDialog) { showInline(f); return false; }
      // Dialogen står öppen med texten kvar och felet i dialogen (UI-SPEC avsnitt 9 och 13).
      const list = f.rules ? allIssues(sy, types).filter((i) => i.level === 'error').map((i) => i.text) : [];
      setDialog({ error: f.text, list, mfa: f.mfa });
      if (f.reload) void load(true);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function successText(decision: LasarDecision, detail: LasarReadReply): string {
    const label = sy?.label ?? `Läsåret ${yearLabel(schoolYear)}`;
    switch (decision) {
      case 'submit': return 'Förslaget är skickat till huvudmannen.';
      case 'withdraw': return 'Förslaget är taget tillbaka.';
      case 'return': return 'Förslaget är återsänt till rektorn.';
      case 'approve': return `${label} är fastställt.`;
      case 'reopen': return `${label} är öppnat för ändring. Version ${detail.calendar?.version ?? ''} är ett utkast.`;
      case 'request_change': return 'Begäran om ändring är skickad till huvudmannen.';
      case 'withdraw_request': return 'Begäran om ändring är tagen tillbaka.';
      case 'decline_request': return 'Begäran om ändring är avslagen.';
      case 'publish_frame': return `Ramen för ${yearLabel(schoolYear)} är utgiven till skolorna.`;
      default: return 'Ändringen är sparad.';
    }
  }

  function openDialog(next: LasarAction) {
    setAction(next);
    setComment('');
    setDialog({ error: '', list: [], mfa: false });
  }
  async function closeDialog() {
    if (comment.trim() && !(await requestDiscard())) return;
    setAction(null);
    setComment('');
    setDialog({ error: '', list: [], mfa: false });
  }
  async function runDialog() {
    if (!action || busy) return;
    if (await decide(DECISION[action], comment, true)) {
      setAction(null);
      setComment('');
    }
  }

  async function resetProposal() {
    if (!sy) return;
    const yes = await requestConfirm({
      title: 'Återställ förslaget?',
      description: 'Terminer, lovdagar och studiedagar sätts tillbaka till förslaget ur helgdagar och vanliga lov. Skolans ändringar i den här versionen försvinner. Gruppernas avvikande dagar ligger kvar.',
      confirmLabel: 'Återställ',
      cancelLabel: 'Behåll förslaget',
    });
    if (yes) void command({ op: 'reset_to_proposal' }, 'Terminer och lov är återställda till förslaget.');
  }

  async function chooseVersion(versionId: string) {
    if (versionId === read?.calendar?.versionId) return;
    if ((noteDirty || talk.trim()) && !(await requestDiscard())) return;
    // En anteckning som sparades vid blur ligger i kön; den skickas innan versionen byts.
    await queue.current;
    chosenVersion.current = versionId;
    calendar.clear();
    setNoteDraft(null);
    setError('');
    setNotice('');
    setPhase('loading');
    void load();
  }

  function onDayClick(date: string, event: ClickModifiers) {
    if (!sy) return;
    const ev = selectMode ? { shiftKey: false, metaKey: true, ctrlKey: false } : event;
    if (!calendar.dayClick(sy, date, ev) || !editable || isLocked?.(date)) return;
    apply((s) => setDay(s, sy.id, date, tool, note.trim() || undefined));
  }
  function onWeekClick(days: DayInfo[], event: Pick<ClickModifiers, 'metaKey' | 'ctrlKey'>) {
    if (!sy) return;
    const weekdays = days.filter((d) => d.editable).map((d) => d.date);
    const ev = selectMode ? { metaKey: true, ctrlKey: false } : event;
    if (!calendar.weekClick(weekdays, ev) || !editable) return;
    const open = weekdays.filter((d) => !isLocked?.(d));
    if (open.length) apply((s) => setDays(s, sy.id, open, tool, note.trim() || undefined));
  }
  function applyToSelection(kind: Planned) {
    if (!sy || !changeable.length) return;
    apply(
      (s) => setDays(s, sy.id, changeable.map((d) => d.date), kind, note.trim() || undefined),
      changeable.length > 1 ? `${changeable.length} dagar är nu ${statusPlural[kind]}.` : undefined,
    );
  }
  function commitNote() {
    if (!sy || !noteDirty || !noteDraft) return;
    const text = noteDraft.value;
    const done = selectedInfo
      ? apply((s) => setNote(s, sy.id, selectedInfo.date, text))
      : apply((s) => setNotes(s, sy.id, changeable.map((d) => d.date), text));
    if (done) setNoteDraft(null);
  }

  // Versionsraden (A-07, avsnitt 12) och arbetsflödets text (avsnitt 9).
  const versionLine = !frameTarget && current && latest
    ? latest.versionId !== current.versionId
      ? `Version ${latest.version} är ${statusWord[latest.status === 'forslag' ? 'förslag' : latest.status === 'atersand' ? 'återsänd' : 'utkast']}. Version ${current.version}, fastställd ${formatDate(current.decidedOn!, true)}, gäller tills den nya versionen är fastställd.`
      : `Version ${current.version} gäller sedan ${formatDate(current.decidedOn!, true)}.`
    : null;
  const request = read?.changeRequest;
  const onCurrent = Boolean(selected?.current);
  const workflowText = !sy ? null : frameTarget
    ? sy.status === 'fastställd'
      ? 'Ramen är utgiven. Rektorerna utgår från den och justerar för sin skola. Skolornas avvikelser syns när kalendrarna fastställs.'
      : 'Ramen är ett utkast. Lägg terminer och gemensamma lov- och studiedagar. Skolorna ser ramen först när du ger ut den.'
    : sy.status === 'utkast'
    ? editable ? 'Utkastet är rektorns arbetsyta. Välj vad du vill markera och klicka på dagar eller veckonummer. Skicka när kontrollerna är gröna.' : 'Rektorn arbetar med utkastet.'
    : sy.status === 'återsänd' ? 'Huvudmannen har återsänt förslaget. Se skälet i historiken, ändra och skicka igen.'
      : sy.status === 'förslag' ? 'Förslaget väntar på huvudmannens beslut om terminernas början och slut. Rektorn kan ta tillbaka det.'
        : onCurrent && request?.status === 'open' ? `Rektorn har begärt ändring: ”${request.reason}”. Öppna kalendern för ändring eller avslå begäran med motivering.`
          : onCurrent && request?.status === 'declined' && request.answeredAt ? `Huvudmannen avslog begäran ${formatDate(stockholmDate(request.answeredAt), true)}: ”${request.answer}”. Version ${sy && selected ? selected.version : ''} gäller fortsatt.`
            : 'Fastställda läsårstider. Skoldagarna ligger till grund för timplanens riktvärden och schemat.';
  const readOnlyHint = olderSelected && selected
    ? `Du läser version ${selected.version}. Den gäller ${selected.current ? 'fortfarande' : 'inte längre'}.`
    : READ_ONLY_HINT;
  const historyById = new Map((read?.calendar?.history ?? []).map((h) => [h.id, h]));
  const dialogDescription = action === 'reopen' && current
    ? `Version ${current.version} gäller tills den nya versionen är fastställd. Rektorn kan ändra kommande dagar och skicka ett nytt förslag. Passerade dagar är låsta.`
    : action === 'approve' && selected && selected.version >= 2
      ? 'Beslutet dokumenteras med datum. Skoldagarna blir grund för timplanens riktvärden och schemat. Tjänstefördelningen och timplanerna får en markering om den nya versionen. Ingen omräkning sker automatiskt.'
      : undefined;

  return (
    <section className="admin-workspace timplan-workspace protected-lasar" aria-busy={phase === 'loading'}>
      {notice && (
        <output className="admin-notice">
          <CheckCheck size={17} aria-hidden="true" />
          <span>{notice}</span>
          <button type="button" aria-label="Stäng meddelandet" onClick={() => setNotice('')}>
            <X size={16} aria-hidden="true" />
          </button>
        </output>
      )}
      <div className="ly-layout">
        <section className="tp-canvas ly-canvas">
          <LasarCover
            kicker={<h1 className="admin-kicker ly-page-title">Läsår och skoldagar · {frameTarget ? 'Huvudmannens ram' : schoolName}</h1>}
            title={sy ? sy.label : `Läsåret ${yearLabel(schoolYear)}`}
            side={phase === 'ready' && sy && summary && (frameTarget ? (
              <LasarFrameCoverSide sy={sy} summary={summary}>
                {!caps?.canEdit && <span>Läsvy</span>}
                {saving ? <output className="og-saving">Sparar…</output> : savedAt ? <output className="ly-saved">Sparat {savedAt}</output> : null}
              </LasarFrameCoverSide>
            ) : (
              <LasarCoverSide sy={sy} summary={summary}>
                {current && <span>Gäller: version {current.version}</span>}
                {!caps?.canEdit && <span>Läsvy</span>}
                {saving ? <output className="og-saving">Sparar…</output> : savedAt ? <output className="ly-saved">Sparat {savedAt}</output> : null}
              </LasarCoverSide>
            ))}
          />
          {phase === 'ready' && read?.calendar && sy && (
            <LasarFrameLine gy={gy} legend="Versioner">
              {versions.map((v) => (
                <button key={v.versionId} type="button" aria-pressed={v.versionId === read.calendar!.versionId} onClick={() => void chooseVersion(v.versionId)}>
                  Version {v.version} · {frameTarget ? (v.status === 'faststalld' ? 'Utgiven' : 'Utkast') : statusLabel[v.status === 'forslag' ? 'förslag' : v.status === 'atersand' ? 'återsänd' : v.status === 'faststalld' ? 'fastställd' : 'utkast'].split(' ')[0]}{v.current ? ' · gäller' : ''}
                </button>
              ))}
            </LasarFrameLine>
          )}
          {error && <LasarInlineError message={error} />}
          {inlineMfa && <MfaStepUpNotice className="tp-inline-error" message={MFA_MESSAGE} detail={MFA_DETAIL} returnTo="/?vy=lasar" />}
          {phase === 'loading' ? (
            <div className="admin-empty">
              <Spinner className="size-7" aria-label="Läser läsårskalendern" />
              <h2>Läser läsårskalendern</h2>
              <p>Hämtar {schoolName} {yearLabel(schoolYear)}.</p>
            </div>
          ) : phase === 'error' ? (
            <div className="admin-empty">
              <AlertTriangle size={28} />
              <h2>Läsårskalendern kunde inte läsas</h2>
              <p>Kontrollera anslutningen och försök igen. Inget har ändrats.</p>
              <Button variant="outline" onClick={() => { setPhase('loading'); void load(); }}>Försök igen</Button>
            </div>
          ) : !sy || !summary ? (
            read ? (
              <ProtectedLasarStart read={read} actorRole={actorRole} schoolName={schoolName} busy={busy} onCreate={(source) => void create(source)} />
            ) : (
              <div className="admin-empty">
                <CalendarCheck size={28} />
                <h2>Inget läsår ännu</h2>
                <p>Ingen kalender är skapad för {schoolName} {yearLabel(schoolYear)}.</p>
              </div>
            )
          ) : (
            <>
              {bannerActive && comparison?.latest && (
                <LasarFrameBanner
                  latest={comparison.latest}
                  count={changeCount(comparison.changes)}
                  busy={busy || saving}
                  onShowDiff={() => showDates(changedDates(comparison.changes))}
                  onTake={() => setTaking(comparison.changes)}
                  onKeep={keepSchoolCalendar}
                />
              )}
              <LasarWorkflow
                text={
                  <>
                    {versionLine && <p className="ly-version-line">{versionLine}</p>}
                    {workflowText}
                    {caps?.canSubmit && openReview > 0 && <p className="ly-review-hint">{lasarErrorText('lasar_review_open', ctx())}</p>}
                  </>
                }
              >
                {frameTarget && caps?.canPublishFrame && (
                  <Button disabled={busy || errors.length > 0} onClick={() => { setDialog({ error: '', list: [], mfa: false }); setPublishing(true); }}>
                    <Send size={15} /> Ge ut ramen
                  </Button>
                )}
                {!frameTarget && caps?.canEdit && (
                  <Button variant="outline" onClick={() => void resetProposal()}>
                    <RotateCcw size={15} /> Återställ förslaget
                  </Button>
                )}
                {!frameTarget && caps?.canSubmit && (
                  // Skolplattan: en primär knapp per vy. Medan ramens ändring väntar är den banderollens.
                  <Button variant={bannerActive ? 'outline' : 'default'} onClick={() => openDialog('submit')} disabled={errors.length > 0 || openReview > 0}>
                    <Send size={15} /> Skicka förslag
                  </Button>
                )}
                {!frameTarget && caps?.canWithdraw && (
                  <Button variant="outline" disabled={busy} onClick={() => void decide('withdraw', '', false)}>
                    <Undo2 size={15} /> Ta tillbaka
                  </Button>
                )}
                {!frameTarget && caps?.canReturn && (
                  <Button variant="outline" onClick={() => openDialog('return')}>
                    <Undo2 size={15} /> Återsänd
                  </Button>
                )}
                {!frameTarget && caps?.canApprove && (
                  <Button onClick={() => openDialog('approve')} disabled={errors.length > 0}>
                    <CircleCheck size={15} /> Fastställ
                  </Button>
                )}
                {!frameTarget && caps?.canWithdrawRequest && (
                  <Button variant="outline" disabled={busy} onClick={() => void decide('withdraw_request', '', false)}>
                    <Undo2 size={15} /> Ta tillbaka begäran
                  </Button>
                )}
                {!frameTarget && caps?.canRequestChange && (
                  <Button variant="outline" onClick={() => openDialog('request')}>
                    <MessageSquareText size={15} /> Begär ändring
                  </Button>
                )}
                {!frameTarget && caps?.canDecline && (
                  <Button variant="outline" onClick={() => openDialog('decline')}>
                    <X size={15} /> Avslå begäran
                  </Button>
                )}
                {!frameTarget && caps?.canReopen && (
                  <Button variant="outline" onClick={() => openDialog('reopen')}>
                    <Unlock size={15} /> Öppna för ändring
                  </Button>
                )}
              </LasarWorkflow>
              <LasarReviewCard items={review} schoolYear={schoolYear} canResolve={Boolean(caps?.canEdit)} busy={busy} onShowWeek={showWeek} onResolve={resolve} />
              <LasarTerms
                sy={sy}
                summary={summary}
                editable={editable}
                min={editableFrom ?? undefined}
                isEdgeLocked={(part, edge) => Boolean(isLocked?.(sy[part][edge]))}
                edgeNote={(part, edge) => {
                  const d = comparison?.terms.get(`term:${part}:${edge}`);
                  return d ? <small className="ly-frame-diff">Ramen: {frameValueText(d.frame)}</small> : null;
                }}
                onTermChange={(part, edge, value) => apply((s) => setTerm(s, sy.id, part, edge, value))}
              />
              <LasarSchoolTools
                tool={tool}
                onTool={setTool}
                note={note}
                onNote={setNoteText}
                editable={editable}
                readOnlyHint={readOnlyHint}
                selectMode={{ on: selectMode, onToggle: () => setSelectMode((on) => !on) }}
              />
              <LasarCalendar
                sy={sy}
                summary={summary}
                calendar={calendar}
                editable={editable}
                tool={tool}
                isLocked={isLocked}
                dayMark={dayMark}
                menuClassName="protected-lasar-menu"
                touchSelect
                onDayClick={onDayClick}
                onWeekClick={onWeekClick}
                onApplyToSelection={applyToSelection}
              />
              <LasarLegend
                summary={summary}
                extra={(isLocked || openReview > 0 || comparison) && (
                  <>
                    {comparison && <span className="ly-legend-item ly-frame-legend"><i aria-hidden="true" /> Skiljer sig från ramen</span>}
                    {isLocked && <span className="ly-legend-item ly-past"><i aria-hidden="true" /> Passerad dag (låst)</span>}
                    {openReview > 0 && <span className="ly-legend-item ly-review-legend"><i aria-hidden="true" /> Att granska</span>}
                  </>
                )}
              />
              {calendar.selection.length > 0 && (
                <LasarMarking
                  selection={calendar.selection}
                  selectedDays={selectedDays}
                  changeable={changeable}
                  groupChangeable={groupChangeable}
                  groupMarked={groupMarked}
                  editable={editable}
                  isLocked={isLocked}
                  onNote={() => undefined}
                  noteDraft={{ value: draftValue, dirty: noteDirty, onChange: (value) => setNoteDraft({ key: selectionKey, value }), onCommit: commitNote }}
                  onApplyToGroup={() => undefined}
                  onFollowSchool={() => undefined}
                  onApplyToSelection={applyToSelection}
                  onClear={() => calendar.setSelection([])}
                />
              )}
              {read && <ProtectedLasarTeaching sy={sy} summary={summary} teaching={read.teaching} groupRefs={read.groups} frame={frameTarget} />}
              <PlanBoundary text={BOUNDARY} />
            </>
          )}
        </section>
        {phase === 'ready' && sy && summary && (
          <aside className="ly-side">
            {comparison && <LasarFrameCard comparison={comparison} showNotTaken={!caps?.canEdit} onShowDay={(date) => showDates([date])} />}
            <LasarControlCard summary={summary} gy={gy} errors={errors} warnings={warnings} groupIssues={[]} heading={CONTROL.heading} okLabel={CONTROL.ok} />
            <LasarHolidaysCard summary={summary} />
            <LasarTalkCard
              placeholder="Skriv en kommentar…"
              history={sy.history}
              canComment={Boolean(caps?.canComment)}
              onTextChange={setTalk}
              historyLabel={(h) => {
                const entry = historyById.get(h.id);
                return entry ? `${lasarRoleLabel[entry.role]} · ${entry.actorName} · ${lasarHistoryTime(entry.at)} · Version ${entry.version}` : h.time;
              }}
              onComment={(text) => (text.trim() ? command({ op: 'comment', text: text.trim() }, 'Kommentaren är sparad.') : (setError('Skriv en kommentar.'), false))}
            />
          </aside>
        )}
      </div>
      <LasarActionDialog
        action={action}
        sy={sy}
        summary={summary}
        unitName={schoolName}
        errors={errors}
        comment={comment}
        onComment={setComment}
        error={dialog.error}
        errorList={dialog.list}
        notice={dialog.mfa ? <MfaStepUpNotice message={MFA_MESSAGE} detail={MFA_DETAIL} returnTo="/?vy=lasar" /> : undefined}
        description={dialogDescription}
        reviewExtra={comparison ? <p className="ly-frame-review">{frameReviewText(comparison)}</p> : undefined}
        className="protected-lasar-dialog"
        cancelVariant="outline"
        busy={busy}
        reviewHeading={CONTROL.heading}
        okLabel={CONTROL.ok}
        onClose={() => void closeDialog()}
        onRun={() => void runDialog()}
      />
      <LasarTakeFrameDialog changes={taking} busy={busy || saving} onCancel={() => setTaking(null)} onConfirm={takeFrame} />
      <LasarPublishFrameDialog
        open={publishing}
        yearText={yearLabel(schoolYear)}
        text={publishText}
        onText={setPublishText}
        error={dialog.error}
        notice={dialog.mfa ? <MfaStepUpNotice message={MFA_MESSAGE} detail={MFA_DETAIL} returnTo="/?vy=lasar" /> : undefined}
        busy={busy}
        onCancel={() => { void (async () => { if (publishText.trim() && !(await requestDiscard())) return; setPublishing(false); setPublishText(''); })(); }}
        onConfirm={() => void publishFrame()}
      />
    </section>
  );
}
