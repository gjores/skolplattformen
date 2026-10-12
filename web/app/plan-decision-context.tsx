'use client';

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { ClipboardCheck, ArrowRight, RefreshCw } from 'lucide-react';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanDecisionInbox, parsePlanDecisionPage, defaultPlanDecisionQuery, type PlanDecisionPage, type PlanDecisionQuery, type PlanDecisionInbox, type PlanDecisionItem } from '@/lib/plan-decision.ts';
import './plan-decision.css';

type DecisionContext = { scopeKey: string; revision: number; inbox: PlanDecisionInbox | null; loading: boolean; error: string | null; refresh: () => void };
const Context = createContext<DecisionContext>({ scopeKey: '', revision: 0, inbox: null, loading: false, error: null, refresh: () => {} });
export const usePlanDecisions = () => useContext(Context);
export const decisionStageLabel = { draft: 'Utkast', submitted: 'Inväntar beslut', returned: 'Tillbaka för rättning', approved: 'Fastställd', replaced: 'Ersatt' };
export const decisionActorLabel = { huvudman: 'huvudmannen', rektor: 'rektor' };
export const decisionNextActorLabel = (kind: 'programplan' | 'timplan', actor: 'huvudman' | 'rektor') => kind === 'timplan' && actor === 'rektor' ? 'rektor eller skoladministratör' : decisionActorLabel[actor];
export function PlanDecisionProvider({ active, scopeKey, onSessionLost, children }: {
  active: boolean; scopeKey: string; onSessionLost: () => void; children: ReactNode;
}) {
  const [inbox, setInbox] = useState<PlanDecisionInbox | null>(null), [loading, setLoading] = useState(false), [error, setError] = useState<string | null>(null);
  const [generation, setGeneration] = useState(0), [loadedScope, setLoadedScope] = useState('');
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
      if (current) { setInbox(value); setLoadedScope(scopeKey); }
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
  return <Context.Provider value={{ scopeKey, revision: generation, inbox: loadedScope === scopeKey ? inbox : null, loading, error, refresh }}>{children}</Context.Provider>;
}
export function DecisionIndicator({ onOpen }: { onOpen: () => void }) {
  const { inbox, error, loading } = usePlanDecisions();
  return <button type="button" className={`decision-indicator${inbox?.actionCount ? ' has-tasks' : ''}`} onClick={onOpen}
    aria-label={error ? 'Att göra – uppgifterna kunde inte hämtas' : `Att göra${inbox ? `: ${inbox.actionCount} ${inbox.actionCount === 1 ? 'uppgift' : 'uppgifter'}, ${inbox.decisionCount} beslut` : ', hämtar uppgifter'}`}>
    <ClipboardCheck size={18} aria-hidden="true"/><span>Att göra</span><strong>{error ? '!' : inbox ? inbox.actionCount : loading ? '…' : '–'}</strong>
  </button>;
}
const taskLabel = { prepare: 'Förbered beslut', review: 'Granska och besluta', revise: 'Läs återkoppling och rätta', waiting: 'Inväntar beslut', blocked: 'Visa varför' };
export function DecisionInbox({ roleLabel, onOpen }: { roleLabel: string; onOpen: (item: PlanDecisionItem) => void }) {
  const { inbox, loading, error, refresh, scopeKey, revision } = usePlanDecisions();
  const [filters, setFilters] = useState({ scopeKey, selection: defaultPlanDecisionQuery(), draft: '' });
  if (filters.scopeKey !== scopeKey) setFilters({ scopeKey, selection: defaultPlanDecisionQuery(), draft: '' });
  const selection = filters.scopeKey === scopeKey ? filters.selection : defaultPlanDecisionQuery();
  const [result, setResult] = useState<{key:string;data:PlanDecisionPage|null;error:string|null;loading:boolean}>({key:'',data:null,error:null,loading:false});
  const key = JSON.stringify([scopeKey,selection,revision]), currentKey = useRef(key);
  useLayoutEffect(() => { currentKey.current = key; }, [key]);
  const isDefault = selection.query === '' && selection.kind === 'all' && selection.stage === 'all' && selection.tasks === 'all' && selection.page === 1;
  useEffect(() => {
    if (isDefault || !scopeKey) return;
    const controller = new AbortController(); let active = true;
    const current = () => active && currentKey.current === key;
    queueMicrotask(() => { if (current()) setResult(previous => ({key,data:previous.key === key ? previous.data : null,error:null,loading:true})); });
    const selected: PlanDecisionQuery = JSON.parse(key)[1];
    void api.post('/api/planbeslut/lista', selected, controller.signal).then(raw => parsePlanDecisionPage(raw,selected)).then(data => {
      if (current()) setResult({key,data,error:null,loading:false});
    }).catch(caught => {
      if (!current() || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && [401,403].includes(caught.status) && caught.code !== 'mfa_required') refresh();
      setResult({key,data:null,error:'Urvalet kunde inte hämtas. Försök igen.',loading:false});
    });
    return () => { active = false; controller.abort(); };
  }, [key,isDefault,scopeKey,refresh]);
  const page = result.key === key ? result : null;
  const items = isDefault ? inbox?.items.slice(0,50) ?? [] : page?.data?.items ?? [];
  const count = isDefault ? inbox?.total ?? 0 : page?.data?.count ?? 0;
  const searching = !isDefault && (!page || page.loading);
  const change = (patch: Partial<PlanDecisionQuery>) => setFilters(previous => ({...previous,scopeKey,selection:{...selection,...patch,page:patch.page ?? 1}}));
  const mine = items.filter(item => !['waiting','blocked'].includes(item.task));
  const waiting = items.filter(item => ['waiting','blocked'].includes(item.task));
  const row = (item: PlanDecisionItem) => <li key={`${item.kind}:${item.planId}:${item.unitId}`}>
    <div><strong>{item.educationName}</strong><span>{item.kind === 'programplan' ? 'Programplan' : 'Timplan'} · Version {item.version}{item.schoolName && ` · ${item.schoolName}`}</span>
      <span>{decisionStageLabel[item.stage]}{item.nextActor && ` · Nästa steg hos ${decisionNextActorLabel(item.kind, item.nextActor)}`}</span></div>
    <button type="button" onClick={() => onOpen(item)}>{item.task === 'waiting' && item.stage === 'returned' ? 'Inväntar rättning' : item.task === 'waiting' && item.stage === 'draft' ? 'Inväntar förberedelse' : taskLabel[item.task]}<ArrowRight size={16} aria-hidden="true"/></button>
  </li>;
  return <section className="decision-inbox" aria-labelledby="decision-inbox-title" aria-busy={loading || searching}>
    <header><div><h2 id="decision-inbox-title">Dina uppgifter och beslut</h2><p>För ditt aktuella uppdrag: {roleLabel}. Visar alla läsår inom uppdraget.</p></div><button type="button" disabled={loading} onClick={refresh} aria-label="Uppdatera uppgifter"><RefreshCw size={18}/></button></header>
    {error ? <p role="alert">{error}</p> : !inbox ? <output>Hämtar uppgifter…</output> : <>
      <p className="decision-inbox-summary"><strong>{inbox.decisionCount} {inbox.decisionCount === 1 ? 'plan väntar' : 'planer väntar'} på ditt beslut</strong><span>{inbox.actionCount} {inbox.actionCount === 1 ? 'uppgift' : 'uppgifter'} att arbeta vidare med</span></p>
      <form className="decision-filters" onSubmit={event => { event.preventDefault(); change({query:filters.draft.trim()}); }}>
        <label>Sök uppgift<input type="search" maxLength={200} value={filters.draft} placeholder="Utbildning eller skola" onChange={event => setFilters(previous => ({...previous,draft:event.target.value}))}/></label>
        <label>Beslutsskede<select value={selection.stage} onChange={event => change({stage:event.target.value as PlanDecisionQuery['stage']})}>
          <option value="all">Alla skeden</option><option value="draft">Utkast</option><option value="submitted">Inväntar beslut</option><option value="returned">Tillbaka för rättning</option>
        </select></label>
        <label>Uppgifter<select value={selection.tasks} onChange={event => change({tasks:event.target.value as PlanDecisionQuery['tasks']})}>
          <option value="all">Alla · egna först</option><option value="mine">Mina uppgifter</option><option value="waiting">Väntande och spärrade</option>
        </select></label>
        <label>Plan<select value={selection.kind} onChange={event => change({kind:event.target.value as PlanDecisionQuery['kind']})}>
          <option value="all">Båda plantyperna</option><option value="programplan">Programplaner</option><option value="timplan">Timplaner</option>
        </select></label>
        <button type="submit">Sök</button><button type="button" onClick={() => setFilters({scopeKey,selection:defaultPlanDecisionQuery(),draft:''})}>Rensa filter</button>
      </form>
      {page?.error && !isDefault && <p role="alert">{page.error} <button type="button" onClick={refresh}>Försök igen</button></p>}
      {searching ? <output>Hämtar urvalet…</output> : <p>{count} {count === 1 ? 'träff' : 'träffar'} · egna uppgifter visas först</p>}
      {mine.length ? <ul>{mine.map(row)}</ul> : !searching && <p>{isDefault ? 'Du har inga planuppgifter att göra just nu.' : 'Inga egna uppgifter på den här sidan.'}</p>}
      {waiting.length > 0 && <details open><summary>Väntande och spärrade planer ({waiting.length})</summary><ul>{waiting.map(row)}</ul></details>}
      <nav className="decision-pages" aria-label="Uppgifternas sidor">
        <button type="button" disabled={searching || selection.page <= 1} onClick={() => change({page:selection.page-1})}>Föregående sida</button>
        <span>Sida {selection.page} av {Math.max(1,Math.ceil(count/50))}</span>
        <button type="button" disabled={searching || selection.page*50 >= count} onClick={() => change({page:selection.page+1})}>Nästa sida</button>
      </nav>
    </>}
  </section>;
}
