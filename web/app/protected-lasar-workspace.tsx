'use client';
// Läsår & skoldagar i skyddad drift (fas 05.1.1, plan 03: tracer).
// Samma kalender och klasser som demovyn (lasar-view.tsx), men data kommer
// från /api/lasar/lasa och ändringar skickas som kommandon till
// /api/lasar/kommando. Redigering styrs bara av serverns capabilities.canEdit;
// det finns ingen rollväxlare och inget klientval av roll (A-01, LASAR-02).
// Modellens interna spärr kräver rollen 'rektor'; den sätts bara när servern
// har sagt canEdit och visas aldrig som roll i vyn.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { api, ApiError } from '@/lib/server-client.ts';
import {
  lasarCommandRequest,
  lasarSchoolYear,
  parseLasarCommandReply,
  parseLasarReadReply,
  type LasarReadReply,
} from '@/lib/lasar-contract.ts';
import { lasarOps, type LasarOp } from '@/lib/lasar-ops.ts';
import {
  canEdit as modelCanEdit,
  setDay,
  setDays,
  statusLabel,
  summarize,
  yearOf,
  type DayInfo,
  type LasarState,
  type Planned,
} from '@/lib/lasar-model.ts';
import { LasarCalendar, num, selectionFacts, statusText, toolCopy, useCalendarSelection, type ClickModifiers } from './lasar-calendar.tsx';
import './protected-lasar.css';

export type ProtectedLasarWorkspaceProps = {
  unitId: string;
  schoolName: string;
  schoolYear: number;
  schoolTypes: string[];
  onSessionLost: () => void;
};

type Phase = 'loading' | 'error' | 'ready';
const CONFLICT = 'Kalendern ändrades av någon annan. Den har lästs om och din senaste ändring sparades inte. Gör om ändringen om den fortfarande behövs.';
const FORBIDDEN = 'Du har inte behörighet att ändra den här kalendern. Kalendern har lästs om.';
const UNCERTAIN = 'Det gick inte att bekräfta att ändringen sparades. Kalendern har lästs om. Kontrollera dagen.';
const REJECTED = 'Ändringen sparades inte. Kalendern har lästs om.';
const yearLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
const clockTime = () => new Date().toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });
const isAbort = (caught: unknown) => caught instanceof DOMException && caught.name === 'AbortError';

function stateOf(read: LasarReadReply): LasarState {
  const sy = lasarSchoolYear(read);
  return { role: read.capabilities.canEdit ? 'rektor' : 'huvudman', years: sy ? [sy] : [] };
}

export default function ProtectedLasarWorkspace({ unitId, schoolName, schoolYear, schoolTypes, onSessionLost }: ProtectedLasarWorkspaceProps) {
  const [phase, setPhase] = useState<Phase>('loading');
  const [read, setRead] = useState<LasarReadReply | null>(null);
  const [state, setState] = useState<LasarState>({ role: 'huvudman', years: [] });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [tool, setTool] = useState<Planned>('lovdag');
  const [note, setNoteText] = useState('');
  const calendar = useCalendarSelection();

  // Senaste lokala läge och serverns version/revision, utan att vänta på rendering.
  const local = useRef(state);
  const basis = useRef<{ versionId: string; revision: number } | null>(null);
  const generation = useRef(0);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const pending = useRef(0);
  const lost = useRef(onSessionLost);
  useEffect(() => { lost.current = onSessionLost; });

  const adopt = useCallback((reply: LasarReadReply) => {
    const next = stateOf(reply);
    local.current = next;
    basis.current = reply.calendar ? { versionId: reply.calendar.versionId, revision: reply.calendar.revision } : null;
    setRead(reply);
    setState(next);
  }, []);

  /** Läser kalendern. `quiet` behåller vyn och markeringen (omläsning efter nekad skrivning). */
  const load = useCallback(async (quiet = false) => {
    const gen = ++generation.current;
    pending.current = 0;
    const request = { unitId, schoolYear };
    try {
      const reply = parseLasarReadReply(await api.post<unknown>('/api/lasar/lasa', request), request);
      if (gen !== generation.current) return;
      adopt(reply);
      setPhase('ready');
    } catch (caught) {
      if (gen !== generation.current || isAbort(caught)) return;
      if (caught instanceof ApiError && (caught.status === 401 || caught.status === 403)) { lost.current(); return; }
      if (!quiet) setPhase('error');
    }
  }, [unitId, schoolYear, adopt]);

  // Byte av skola eller läsår nollställer markering, fel och sparstatus (som choose() i demon).
  const scope = `${unitId}:${schoolYear}`;
  const [shownScope, setShownScope] = useState(scope);
  if (shownScope !== scope) {
    setShownScope(scope);
    setPhase('loading');
    setState({ role: 'huvudman', years: [] });
    setRead(null);
    setSaving(false);
    calendar.clear();
    setError('');
    setSavedAt(null);
  }
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; generation.current += 1; };
  }, [load]);

  async function send(ops: LasarOp[], gen: number) {
    const current = basis.current;
    if (gen !== generation.current || !current) return;
    try {
      const request = await lasarCommandRequest({ unitId, schoolYear, versionId: current.versionId, expectedRevision: current.revision, ops });
      const reply = parseLasarCommandReply(await api.post<unknown>('/api/lasar/kommando', request), request);
      if (gen !== generation.current) return;
      basis.current = { versionId: current.versionId, revision: reply.receipt.revision };
      pending.current -= 1;
      if (pending.current === 0) {
        adopt(reply.detail);
        setSaving(false);
        setSavedAt(clockTime());
      }
    } catch (caught) {
      if (gen !== generation.current || isAbort(caught)) return;
      setSaving(false);
      if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
      setError(caught instanceof ApiError
        ? caught.status === 409 ? CONFLICT : caught.status === 403 ? FORBIDDEN : caught.status >= 500 ? UNCERTAIN : REJECTED
        : UNCERTAIN);
      void load(true);
    }
  }

  /** Kör modellens funktion lokalt och skickar skillnaden som kommando; svaret ersätter den lokala kopian. */
  function apply(fn: (s: LasarState) => LasarState): boolean {
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
    const ops = lasarOps(yearOf(before, id), yearOf(next, id));
    setError('');
    local.current = next;
    setState(next);
    if (!ops.length) return true;
    pending.current += 1;
    setSaving(true);
    const gen = generation.current;
    queue.current = queue.current.then(() => send(ops, gen));
    return true;
  }

  const sy = state.years[0];
  const editable = sy ? modelCanEdit(state, sy) : false;
  const summary = sy ? summarize(sy, schoolTypes) : undefined;
  const noteText = () => note.trim() || undefined;
  const { changeable } = selectionFacts(sy, calendar.selection, new Map());

  function onDayClick(date: string, event: ClickModifiers) {
    if (!sy || !calendar.dayClick(sy, date, event) || !editable) return;
    apply((s) => setDay(s, sy.id, date, tool, noteText()));
  }
  function onWeekClick(days: DayInfo[], event: Pick<ClickModifiers, 'metaKey' | 'ctrlKey'>) {
    if (!sy) return;
    const weekdays = days.filter((d) => d.editable).map((d) => d.date);
    if (!calendar.weekClick(weekdays, event) || !editable) return;
    apply((s) => setDays(s, sy.id, weekdays, tool, noteText()));
  }
  function applyToSelection(kind: Planned) {
    if (!sy || !changeable.length) return;
    apply((s) => setDays(s, sy.id, changeable.map((d) => d.date), kind, noteText()));
  }

  return (
    <section className="admin-workspace timplan-workspace protected-lasar" aria-busy={phase === 'loading'}>
      <div className="ly-layout">
        <section className="tp-canvas ly-canvas">
          <div className="tp-cover">
            <div>
              <h1 className="admin-kicker ly-page-title">Läsår och skoldagar · {schoolName}</h1>
              <h2>{sy ? sy.label : `Läsåret ${yearLabel(schoolYear)}`}</h2>
              <p>Rektorn föreslår skoldagar, lov och studiedagar. Huvudmannen fastställer terminernas början och slut.</p>
            </div>
            {sy && summary && (
              <div className="tp-cover-side">
                <span className={`tp-status tp-status-${sy.status}`}>{statusLabel[sy.status]}</span>
                {!read?.capabilities.canEdit && <span>Läsvy</span>}
                {saving ? <output className="og-saving">Sparar…</output> : savedAt ? <output className="ly-saved">Sparat {savedAt}</output> : null}
                <span>{num(summary.skoldagar)} skoldagar · {num(summary.weeks.total)} veckor</span>
              </div>
            )}
          </div>
          {error && (
            <div className="validation-warning tp-inline-error">
              <p><AlertTriangle size={16} /><span>{error}</span></p>
            </div>
          )}
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
            <div className="admin-empty">
              <CalendarCheck size={28} />
              <h2>Inget läsår ännu</h2>
              <p>Det finns ingen läsårskalender för {schoolName} {yearLabel(schoolYear)} ännu.</p>
            </div>
          ) : (
            <>
              <fieldset className="ly-tools">
                <legend className="ly-tools-label">Markera som</legend>
                {(['skoldag', 'lovdag', 'studiedag'] as Planned[]).map((t) => (
                  <button key={t} type="button" className={`ly-tool ly-tool-${t}`} aria-pressed={tool === t} disabled={!editable} onClick={() => setTool(t)}>
                    <i aria-hidden="true" /> {toolCopy[t].label}
                  </button>
                ))}
                <div className="ly-note-field">
                  <label className="ly-field-label" htmlFor="ly-note">Anteckning</label>
                  <Input id="ly-note" value={note} disabled={!editable || tool === 'skoldag'} placeholder={tool === 'studiedag' ? 'Vad personalen gör, t.ex. Fortbildning' : tool === 'lovdag' ? 't.ex. Höstlov' : ''} onChange={(e) => setNoteText(e.target.value)} />
                </div>
                <span className="ly-tools-hint">
                  {editable
                    ? `${toolCopy[tool].hint} Skift-klicka för att markera ett intervall, kommando- eller ctrl-klicka för att markera flera. Högerklicka på markeringen för att ändra den.`
                    : 'Du har läsbehörighet. Klicka på en dag för detaljer, skift- eller kommando-klicka för att markera flera.'}
                </span>
              </fieldset>
              <LasarCalendar
                sy={sy}
                summary={summary}
                calendar={calendar}
                editable={editable}
                tool={tool}
                onDayClick={onDayClick}
                onWeekClick={onWeekClick}
                onApplyToSelection={applyToSelection}
              />
              <div className="ly-legend">
                {(['skoldag', 'lovdag', 'studiedag', 'helgdag', 'helg'] as DayInfo['status'][]).map((s) => (
                  <span key={s} className={`ly-legend-item ly-${s}`}>
                    <i aria-hidden="true" />
                    {statusText[s]}
                    {s === 'skoldag' && <small>{num(summary.skoldagar)}</small>}
                    {s === 'lovdag' && <small>{num(summary.lovdagar)}</small>}
                    {s === 'studiedag' && <small>{num(summary.studiedagar)}</small>}
                    {s === 'helgdag' && <small>{num(summary.helgdagar.length)}</small>}
                  </span>
                ))}
                <span className="ly-legend-item"><i className="ly-note-dot ly-legend-dot" aria-hidden="true" /> Har anteckning</span>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
