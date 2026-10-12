'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ClipboardCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanDecisionInbox, type PlanDecisionInbox, type PlanDecisionItem } from '@/lib/plan-decision.ts';
import './plan-decision.css';

type DecisionContext = { inbox: PlanDecisionInbox | null; loading: boolean; error: string | null; refresh: () => void };
const Context = createContext<DecisionContext>({ inbox: null, loading: false, error: null, refresh: () => {} });
export const usePlanDecisions = () => useContext(Context);
export const decisionStageLabel = { draft: 'Utkast', submitted: 'Inväntar beslut', returned: 'Återsänd för ändring', approved: 'Fastställd', replaced: 'Ersatt' };
export const decisionActorLabel = { huvudman: 'huvudmannen', rektor: 'rektor' };
export const decisionNextActorLabel = (kind: 'programplan' | 'timplan', actor: 'huvudman' | 'rektor') => kind === 'timplan' && actor === 'rektor' ? 'rektor eller skoladministratör' : decisionActorLabel[actor];
export function PlanDecisionProvider({ active, scopeKey, onSessionLost, children }: {
  active: boolean; scopeKey: string; onSessionLost: () => void; children: ReactNode;
}) {
  const [inbox, setInbox] = useState<PlanDecisionInbox | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0);
  const lost = useRef(onSessionLost); useLayoutEffect(() => { lost.current = onSessionLost; }, [onSessionLost]);
  const refresh = useCallback(() => setGeneration(n => n + 1), []);
  useEffect(() => {
    const controller = new AbortController(); let current = true;
    void Promise.resolve().then(async () => {
      if (!current) throw new DOMException('', 'AbortError');
      if (!active) { setInbox(null); setError(null); setLoading(false); return null; }
      setLoading(true); setError(null);
      return api.get('/api/planbeslut/inkorg', controller.signal);
    }).then(raw => raw === null ? null : parsePlanDecisionInbox(raw)).then(value => {
      if (current) setInbox(value);
    }).catch(caught => {
      if (!current || caught instanceof DOMException && caught.name === 'AbortError') return;
      setInbox(null);
      if (caught instanceof ApiError && [401, 403].includes(caught.status) && caught.code !== 'mfa_required') lost.current();
      else setError('Uppgifterna kunde inte hämtas. Läs om för att se vad som väntar på dig.');
    }).finally(() => { if (current) setLoading(false); });
    return () => { current = false; controller.abort(); };
  }, [active, scopeKey, generation]);
  useEffect(() => {
    if (!active) return;
    const onFocus = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', onFocus);
    const timer = window.setInterval(onFocus, 60000);
    return () => { window.removeEventListener('focus', onFocus); window.clearInterval(timer); };
  }, [active, refresh]);
  return <Context.Provider value={{ inbox, loading, error, refresh }}>{children}</Context.Provider>;
}
export function DecisionIndicator({ onOpen }: { onOpen: () => void }) {
  const { inbox, error, loading } = usePlanDecisions();
  return <button type="button" className={`decision-indicator${inbox?.actionCount ? ' has-tasks' : ''}`} onClick={onOpen}
    aria-label={error ? 'Att göra – uppgifterna kunde inte hämtas' : `Att göra${inbox ? `: ${inbox.actionCount} ${inbox.actionCount === 1 ? 'uppgift' : 'uppgifter'}, ${inbox.decisionCount} beslut` : ', hämtar uppgifter'}`}>
    <ClipboardCheck size={18} aria-hidden="true"/><span>Att göra</span><strong>{error ? '!' : inbox ? inbox.actionCount : loading ? '…' : '–'}</strong>
  </button>;
}
const taskLabel = { prepare: 'Förbered beslut', review: 'Granska och besluta', revise: 'Ändra återsänd plan', waiting: 'Inväntar beslut', blocked: 'Visa varför' };
export function DecisionInbox({ roleLabel, onOpen }: { roleLabel: string; onOpen: (item: PlanDecisionItem) => void }) {
  const { inbox, loading, error, refresh } = usePlanDecisions();
  const mine = inbox?.items.filter(item => !['waiting', 'blocked'].includes(item.task)) ?? [];
  const waiting = inbox?.items.filter(item => ['waiting', 'blocked'].includes(item.task)) ?? [];
  const row = (item: PlanDecisionItem) => <li key={`${item.kind}:${item.planId}:${item.unitId}`}>
    <div><strong>{item.educationName}</strong><span>{item.kind === 'programplan' ? 'Programplan' : 'Timplan'} · Version {item.version}{item.schoolName && ` · ${item.schoolName}`}</span>
      <span>{decisionStageLabel[item.stage]}{item.nextActor && ` · Nästa steg hos ${decisionNextActorLabel(item.kind, item.nextActor)}`}</span></div>
    <button type="button" onClick={() => onOpen(item)}>{taskLabel[item.task]}<ArrowRight size={16} aria-hidden="true"/></button>
  </li>;
  return <section className="decision-inbox" aria-labelledby="decision-inbox-title" aria-busy={loading}>
    <header><div><h2 id="decision-inbox-title">Dina uppgifter och beslut</h2><p>För ditt aktuella uppdrag: {roleLabel}. Visar alla läsår inom uppdraget.</p></div><button type="button" disabled={loading} onClick={refresh} aria-label="Uppdatera uppgifter"><RefreshCw size={18}/></button></header>
    {error ? <p role="alert">{error}</p> : !inbox ? <output>Hämtar uppgifter…</output> : <>
      <p className="decision-inbox-summary"><strong>{inbox.decisionCount} {inbox.decisionCount === 1 ? 'plan väntar' : 'planer väntar'} på ditt beslut</strong><span>{inbox.actionCount} {inbox.actionCount === 1 ? 'uppgift' : 'uppgifter'} att arbeta vidare med</span></p>
      {mine.length ? <ul>{mine.map(row)}</ul> : <p>Du har inga planuppgifter att göra just nu.</p>}
      {waiting.length > 0 && <details open><summary>Väntande och spärrade planer ({waiting.length})</summary><ul>{waiting.map(row)}</ul></details>}
      {inbox.truncated && <p>Här visas ett urval av uppgifterna. Öppna Programplaner eller Timplaner för att se fler.</p>}
    </>}
  </section>;
}
