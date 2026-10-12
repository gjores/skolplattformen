'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parsePlanDecisionDetail, type PlanDecisionAction, type PlanDecisionDetail, type PlanDecisionKind, type PlanDecisionStage } from '@/lib/plan-decision.ts';
import { decisionNextActorLabel, decisionStageLabel, usePlanDecisions } from './plan-decision-context';
import MfaStepUpNotice from './mfa-step-up';

type Command = { commandId: string; kind: PlanDecisionKind; planId: string; action: PlanDecisionAction; expectedRevision: number; expectedDecisionRevision: number; basisHash: string; comment: string; confirmedChecks: string[] };
const actionLabel = { submit: 'Skicka för beslut', return: 'Skicka tillbaka för rättning', approve: 'Fastställ planen', withdraw: 'Ta tillbaka för ändring' };
const historyLabel = { submit: 'Skickad för beslut', return: 'Skickad tillbaka för rättning', approve: 'Fastställd', withdraw: 'Tillbakatagen för ändring' };
export default function PlanDecisionPanel({ kind, planId, revision, disabled, onChanged, onSecurityFailure, onStage }: {
  kind: PlanDecisionKind; planId: string; revision: number | string; disabled: boolean; onStage?: (stage: PlanDecisionStage | null) => void;
  onChanged: () => void | Promise<void>; onSecurityFailure: (error: unknown) => boolean;
}) {
  const { refresh } = usePlanDecisions();
  const [detail, setDetail] = useState<PlanDecisionDetail | null>(null), [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null), [mfa, setMfa] = useState(false), [retry, setRetry] = useState(0);
  const [checks, setChecks] = useState<string[]>([]), [comment, setComment] = useState(''), [confirm, setConfirm] = useState(false);
  const [pending, setPending] = useState<Command | null>(null), [sending, setSending] = useState(false), [completed, setCompleted] = useState(0);
  const readGeneration = useRef(0);
  const active = useRef(true), inFlight = useRef(false), latest = useRef({ onChanged, onSecurityFailure, onStage });
  useLayoutEffect(() => { latest.current = { onChanged, onSecurityFailure, onStage }; }, [onChanged, onSecurityFailure, onStage]);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useUnsavedChanges(`navigation-block:plan-decision:${kind}:${planId}`, pending !== null);
  useUnsavedChanges(`plan-decision-comment:${kind}:${planId}`, comment.trim().length > 0);
  useEffect(() => {
    const abort = new AbortController(); let current = true; const ownRead = ++readGeneration.current;
    void Promise.resolve().then(() => {
      if (!current || ownRead !== readGeneration.current) throw new DOMException('', 'AbortError');
      setLoading(true); setDetail(null); setChecks([]); setConfirm(false); setError(null); latest.current.onStage?.(null);
      return api.post('/api/planbeslut/underlag', { kind, planId }, abort.signal);
    }).then(raw => parsePlanDecisionDetail(raw, { kind, planId })).then(value => {
      if (current && ownRead === readGeneration.current) { setDetail(value); latest.current.onStage?.(value.stage); }
    }).catch(caught => {
      if (!current || ownRead !== readGeneration.current || caught instanceof DOMException && caught.name === 'AbortError' || latest.current.onSecurityFailure(caught)) return;
      setError('Beslutsunderlaget kunde inte hämtas. Läs om innan du går vidare.');
    }).finally(() => { if (current && ownRead === readGeneration.current) setLoading(false); });
    return () => { current = false; abort.abort(); };
  }, [kind, planId, revision, retry, completed]);
  useEffect(() => {
    if (completed) { refresh(); void latest.current.onChanged(); }
  }, [completed, refresh]);
  async function execute(command: Command) {
    if (inFlight.current) return;
    inFlight.current = true; readGeneration.current++; setLoading(false); setPending(command); setSending(true); setError(null); setMfa(false); setConfirm(false);
    try {
      parsePlanDecisionDetail(await api.post('/api/planbeslut/andra', command), { kind, planId });
      if (!active.current) return;
      // Ett återspelat kommando kan ha följts av ett nytt beslut. Visa alltid en ny serverläsning.
      setDetail(null); latest.current.onStage?.(null); setChecks([]); setComment(''); setPending(null); setCompleted(n => n + 1);
    } catch (caught) {
      if (!active.current || latest.current.onSecurityFailure(caught)) return;
      if (caught instanceof ApiError && caught.hasExplicitCode && [400, 403, 409].includes(caught.status)) {
        setPending(null);
        if (caught.code === 'mfa_required') { setMfa(true); setError('Verifiera dig med engångskod innan du beslutar.'); }
        else { setError(caught.status === 409 ? 'Planen eller beslutsunderlaget har ändrats. Läs om och granska på nytt.' : caught.message); setDetail(null); }
      } else setError('Svaret uteblev. Lämna inte planen ännu. Kontrollera beslutet genom att försöka samma åtgärd igen.');
    } finally { inFlight.current = false; if (active.current) setSending(false); }
  }
  function act(action: PlanDecisionAction) {
    if (!detail || disabled || loading || pending || !detail.actions.includes(action)) return;
    void execute({ commandId: crypto.randomUUID(), kind, planId, action, expectedRevision: detail.revision, expectedDecisionRevision: detail.decisionRevision,
      basisHash: detail.basisHash, comment: comment.trim(), confirmedChecks: checks });
  }
  const ready = !!detail && detail.blockers.length === 0 && detail.checks.every(check => checks.includes(check.id));
  const feedback = detail?.stage === 'returned' ? detail.history.find(event => event.action === 'return') : null;
  return <section className="plan-decision-panel" aria-label="Beslut och nästa steg" aria-busy={loading || sending}>
    <div className="plan-decision-heading"><div><h2>Beslut och nästa steg</h2>{detail && <p><strong>{decisionStageLabel[detail.stage]}</strong>{detail.nextActor && ` · Nästa steg hos ${decisionNextActorLabel(kind, detail.nextActor)}`}</p>}</div>
      <Button variant="outline" disabled={loading || pending !== null || disabled} onClick={() => setRetry(n => n + 1)}>Läs beslutsstatus</Button></div>
    {loading && <output>Hämtar aktuellt beslutsunderlag…</output>}
    {error && <p role="alert">{error}</p>}
    {mfa && <MfaStepUpNotice message="Beslutet kräver verifiering med engångskod."/>}
    {pending && <Button disabled={sending} onClick={() => void execute(pending)}>{sending ? 'Sparar beslut…' : 'Kontrollera och försök igen'}</Button>}
    {detail && <>
      <ol className="plan-decision-steps" aria-label="Planens beslutsgång">{(['draft','submitted','approved'] as const).map((stage, index) => <li key={stage} aria-current={detail.stage === stage || stage === 'draft' && detail.stage === 'returned' ? 'step' : undefined}>{index + 1}. {stage === 'draft' ? 'Bearbeta utkast' : stage === 'submitted' ? 'Granska och besluta' : 'Fastställd plan'}</li>)}</ol>
      {detail.stage === 'returned' && <section className="decision-feedback" aria-label="Återkoppling från huvudmannen">
        <h3>Det här behöver rättas</h3>
        {feedback ? <><p className="decision-feedback-comment">{feedback.comment}</p><p className="decision-secondary">{feedback.actorName} · {new Date(feedback.at).toLocaleString('sv-SE')}</p></> : <p>Öppna beslutshistoriken för tidigare återkoppling.</p>}
        <p>{kind === 'programplan' ? 'Rektor' : 'Rektor eller skoladministratör'} rättar och sparar planen och skickar den sedan för ett nytt beslut.</p>
      </section>}
      {detail.stage === 'submitted' && <p>{detail.actions.includes('return')
        ? 'Granska underlaget. Om något är fel, beskriv vad som behöver rättas i kommentaren och skicka tillbaka planen. Fastställ först när granskningen är klar.'
        : detail.actions.includes('withdraw') ? 'Planen väntar på huvudmannens beslut. Ta tillbaka den om du behöver göra ändringar.' : 'Planen väntar på huvudmannens beslut och kan inte ändras under granskningen.'}</p>}
      {detail.stage === 'approved' && <p>Den här versionen är fastställd och låst. Fortsatta ändringar görs i en ny version.</p>}
      {detail.sourceInfo && <p className="decision-secondary">{detail.sourceInfo}</p>}
      {detail.blockers.length > 0 && <div><strong>Behöver åtgärdas före beslut</strong><ul className="decision-blockers">{detail.blockers.map((blocker, index) => <li key={index}>{blocker}</li>)}</ul></div>}
      {detail.actions.some(action => action === 'approve' || action === 'submit') && detail.checks.map(check => <label className="decision-check" key={check.id}><input type="checkbox" checked={checks.includes(check.id)} disabled={disabled || !!pending} onChange={event => setChecks(current => event.target.checked ? [...current, check.id] : current.filter(id => id !== check.id))}/><span>{check.label}</span></label>)}
      {detail.actions.length > 0 && <>
        <label className="decision-comment">Kommentar{detail.actions.includes('return') ? ' – vad behöver rättas?' : ' (frivillig)'}<textarea value={comment} maxLength={2000} disabled={disabled || !!pending} onChange={event => setComment(event.target.value)}/></label>
        {detail.actions.includes('return') && <p className="decision-secondary">En kommentar krävs för att skicka tillbaka planen. Den visas för den som ska rätta och sparas i beslutshistoriken.</p>}
        {disabled && <p>Spara eller avsluta pågående ändringar innan du går vidare med beslutet.</p>}
        <div className="decision-actions">{detail.actions.map(action => <Button key={action} variant={action === 'approve' || action === 'submit' ? 'default' : 'outline'}
          disabled={disabled || !!pending || loading || (action === 'approve' || action === 'submit') && !ready || action === 'return' && !comment.trim()}
          onClick={() => action === 'approve' ? setConfirm(true) : act(action)}>{actionLabel[action]}</Button>)}</div>
      </>}
      <details><summary>Beslutshistorik ({detail.history.length})</summary>{detail.history.length ? <ol className="decision-history">{detail.history.map((event, index) => <li key={index}><strong>{historyLabel[event.action]}</strong><span>{event.actorName} · {new Date(event.at).toLocaleString('sv-SE')}</span>{event.comment && <p>{event.comment}</p>}</li>)}</ol> : <p>Inga beslut har registrerats för den här versionen.</p>}</details>
    </>}
    <Dialog open={confirm} onOpenChange={setConfirm}><DialogContent><DialogTitle>Fastställ {kind === 'programplan' ? 'programplanen' : 'timplanen'}?</DialogTitle><DialogDescription>{detail?.educationName}{detail?.schoolName ? ` · ${detail.schoolName}` : ''} · Version {detail?.version}. Den granskade versionen låses och beslutet sparas i historiken.</DialogDescription><div className="decision-actions"><Button variant="outline" onClick={() => setConfirm(false)}>Avbryt</Button><Button disabled={disabled || !ready || !!pending} onClick={() => act('approve')}>Ja, fastställ planen</Button></div></DialogContent></Dialog>
  </section>;
}
