'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import { gymTimplanCanEdit, isGymTimplanV2, parseGymTimplan, type GymTimplan, type GymTimplanLegacy } from '@/lib/gym-timplan.ts';
import { formatTimplanMinutes, parseTimplanTimeCells, timplanTimeTotals } from '@/lib/timplan-time.ts';
import { parseTimplanTimeCommandReply, parseTimplanTimeStatusReply, parseTimplanTimeTransitionBasis, type TimplanTimeBasis, type TimplanTimeTransitionCommand } from '@/lib/timplan-time-command.ts';
import { createTimplanTimeJournal, loadTimplanTimeJournal, persistTimplanTimeJournal, removeTimplanTimeJournal, type TimplanTimeJournal, type TimplanTimeJournalScope } from '@/lib/timplan-time-journal.ts';
import MfaStepUpNotice from './mfa-step-up';

type Props = { plan: GymTimplanLegacy; scope: TimplanTimeJournalScope | null; onClose: () => void; onSaved: (plan: GymTimplan) => void; onSecurityFailure: (error: unknown) => boolean };
export default function ProtectedTimplanTimeTransition({ plan, scope, onClose, onSaved, onSecurityFailure }: Props) {
  const [basis, setBasis] = useState<{ plan: GymTimplanLegacy; proposal: TimplanTimeBasis } | null>(null);
  const [reviewed, setReviewed] = useState(false), [busy, setBusy] = useState(true), [error, setError] = useState<string | null>(null), [mfa, setMfa] = useState(false);
  const [pending, setPending] = useState<TimplanTimeJournal | null>(null), [retry, setRetry] = useState(false);
  const active = useRef(true), operation = useRef(false), controller = useRef<AbortController | null>(null);
  async function read(signal: AbortSignal) { const fresh = parseGymTimplan(await api.post('/api/timplaner/gym/lasa', { planId: plan.id }, signal), plan.id); if (fresh.unitId !== plan.unitId || fresh.offeringId !== plan.offeringId || fresh.version !== plan.version || fresh.revision < plan.revision) throw new Error('Den aktuella timplanen kunde inte kontrolleras.'); return fresh; }
  async function load() {
    if (operation.current || !scope) { if (!scope) { setBusy(false); setError('Aktuellt skolmandat saknas.'); } return; }
    operation.current = true; setBusy(true); setError(null); setReviewed(false);
    const c = new AbortController(); controller.current = c;
    try {
      const journal = await loadTimplanTimeJournal(window.sessionStorage, scope); if (!active.current) return;
      if (journal) { setPending(journal); setError('Ett tidigare sparförsök finns kvar. Kontrollera sparstatus innan du fortsätter.'); return; }
      const current = await read(c.signal); if (!active.current) return;
      if (isGymTimplanV2(current)) { onClose(); onSaved(current); return; }
      const proposal = parseTimplanTimeTransitionBasis(await api.post('/api/timplaner/gym/tidsmodell', { planId: plan.id }, c.signal), plan.id);
      if (proposal.revision !== current.revision || !gymTimplanCanEdit(current)) throw new Error('Timplanen ändrades. Läs in underlaget igen innan du granskar.');
      const rows = parseTimplanTimeCells(proposal.rows, current.rows);
      const before = Object.values(current.hours).flat().reduce<number>((n, h) => n + (h ?? 0) * 60, 0);
      if (timplanTimeTotals({ rows: current.rows, timeRows: rows }).totalMinutes !== before) throw new Error('Förslaget bevarar inte den tidigare totalen. Bytet har stoppats.');
      if (active.current) { setBasis({ plan: current, proposal: { ...proposal, rows } }); setMfa(false); }
    } catch (caught) { if (active.current && !onSecurityFailure(caught)) { setError(caught instanceof Error ? caught.message : 'Underlaget kunde inte läsas.'); setMfa(caught instanceof ApiError && caught.code === 'mfa_required'); } }
    finally { operation.current = false; if (active.current) setBusy(false); }
  }
  const initialLoad = useRef(load);
  useEffect(() => { active.current = true; queueMicrotask(() => { if (active.current) void initialLoad.current(); }); return () => { active.current = false; controller.current?.abort(); }; }, []);
  async function finish(journal: TimplanTimeJournal, signal: AbortSignal, minimumRevision: number) {
    const current = await read(signal);
    if (!isGymTimplanV2(current) || current.revision < minimumRevision) throw new Error('Den nya tabellen kunde inte läsas tillbaka. Kontrollera sparstatus igen.');
    await removeTimplanTimeJournal(window.sessionStorage, journal, scope!);
    if (active.current) { setPending(null); onClose(); onSaved(current); }
  }
  async function save() {
    if (operation.current || !scope || (!pending && (!basis || !reviewed))) return;
    operation.current = true; setBusy(true); setError(null);
    const c = new AbortController(); controller.current = c;
    let journal = pending;
    try {
      if (!journal) {
        const command: TimplanTimeTransitionCommand = { contractVersion: 'timplan_time_v2', action: 'transition', commandId: crypto.randomUUID(), planId: plan.id, expectedRevision: basis!.proposal.revision, expectedBasisHash: basis!.proposal.basisHash, reviewed: true };
        journal = await createTimplanTimeJournal(scope, command);
      }
      if (journal.request.action !== 'transition') throw new Error('Kontrollera det tidigare sparförsökets status innan du byter tabell.');
      journal = await persistTimplanTimeJournal(window.sessionStorage, journal, scope); if (!active.current) return; setPending(journal);
      const reply = parseTimplanTimeCommandReply(await api.put('/api/timplaner/gym/tidsmodell', journal.request, c.signal), journal.request);
      await finish(journal, c.signal, reply.receipt.revision);
    } catch (caught) {
      if (!active.current || onSecurityFailure(caught)) return;
      setError('Bytet kunde inte bekräftas. Dina gamla uppgifter visas tills sparstatus har kontrollerats.'); setRetry(false);
      setMfa(caught instanceof ApiError && caught.code === 'mfa_required');
    } finally { operation.current = false; if (active.current) setBusy(false); }
  }
  async function recover() {
    if (operation.current || !pending || !scope) return;
    operation.current = true; setBusy(true); setError(null); const c = new AbortController(); controller.current = c;
    try {
      const status = parseTimplanTimeStatusReply(await api.post('/api/timplaner/gym/tidsstatus', { command: pending.request }, c.signal), { command: pending.request });
      if (status.state === 'completed') await finish(pending, c.signal, status.result.receipt.revision);
      else {
        const current = await read(c.signal); if (!active.current) return;
        const sameRevision = current.revision === pending.request.expectedRevision && gymTimplanCanEdit(current) && !isGymTimplanV2(current);
        const freshBasis = sameRevision && pending.request.action === 'transition'
          ? parseTimplanTimeTransitionBasis(await api.post('/api/timplaner/gym/tidsmodell', { planId: plan.id }, c.signal), plan.id) : null;
        if (!sameRevision || pending.request.action !== 'transition' || freshBasis?.basisHash !== pending.request.expectedBasisHash || freshBasis?.revision !== pending.request.expectedRevision) {
          await removeTimplanTimeJournal(window.sessionStorage, pending, scope); setPending(null); setRetry(false); setBasis(null); setReviewed(false); setError('Timplanen har ändrats. Läs underlaget och granska ett nytt förslag.');
        } else { setRetry(true); setMfa(false); setError('Ingen övergång har bekräftats. Du kan försöka skicka samma granskade byte igen.'); }
      }
    } catch (caught) { if (active.current && !onSecurityFailure(caught)) { setError('Sparstatus kunde inte läsas. Samma sparbegäran finns kvar.'); setMfa(caught instanceof ApiError && caught.code === 'mfa_required'); } }
    finally { operation.current = false; if (active.current) setBusy(false); }
  }
  const totals = basis ? timplanTimeTotals({ rows: basis.plan.rows, timeRows: basis.proposal.rows }) : null;
  return <Dialog open onOpenChange={open => { if (!open && !busy && !pending) onClose(); }}><DialogContent className="gt-distribution-dialog gt-time-transition" showCloseButton={!busy && !pending}>
    <DialogTitle>Granska byte till skola och APL</DialogTitle><DialogDescription>Den äldre totaltiden delas upp i skoltid och års-APL. Registrerad APL flyttas till årsramen. Perioder och datum behålls.</DialogDescription>
    {busy && <output>Kontrollerar timplanen…</output>}{error && <p role="alert" className="gt-distribution-warning">{error}</p>}{mfa && <MfaStepUpNotice message="Verifiera med engångskod och kontrollera sedan samma sparförsök."/>}
    {basis && totals && <><p><strong>Oförändrad total: {formatTimplanMinutes(totals.totalMinutes)} timmar</strong><br/>Skola {formatTimplanMinutes(totals.schoolMinutes)} h + registrerad APL {formatTimplanMinutes(totals.aplMinutes)} h.</p>
      <p>Äldre APL som ännu inte har registrerats kan ingå i den föreslagna skoltiden. Kontrollera uppdelningen och komplettera års-APL efter bytet. Föreslagna nollor betyder inte att skolan har granskat all APL.</p>
      <div className="gt-table-scroll"><table className="gt-matrix"><caption>Granskning av hela timplanen. Värden anges i timmar eller timmar:minuter.</caption><thead><tr><th>Ämne</th><th>Årskurs</th><th>Tidigare total</th><th>Skola HT</th><th>Skola VT</th><th>Års-APL</th></tr></thead><tbody>{basis.plan.rows.flatMap(row => [0, 1, 2].filter(y => row.pointTerms[y * 2] > 0 || row.pointTerms[y * 2 + 1] > 0).map(y => <tr key={`${row.key}-${y}`}><th scope="row">{row.name} {row.levelName}</th><td>{y + 1}</td><td>{formatTimplanMinutes(((basis.plan.hours[row.key][y * 2] ?? 0) + (basis.plan.hours[row.key][y * 2 + 1] ?? 0)) * 60)}{[basis.plan.hours[row.key][y * 2], basis.plan.hours[row.key][y * 2 + 1]].some((h, i) => row.pointTerms[y * 2 + i] > 0 && h === null) && ' (ofullständigt)'}</td><td>{formatTimplanMinutes(basis.proposal.rows[row.key].schoolMinutes[y * 2]) || 'Ofördelat'}</td><td>{formatTimplanMinutes(basis.proposal.rows[row.key].schoolMinutes[y * 2 + 1]) || 'Ofördelat'}</td><td>{formatTimplanMinutes(basis.proposal.rows[row.key].annualAplMinutes[y]) || 'Ofördelat'}</td></tr>))}</tbody></table></div>
      <label className="gt-time-review"><input type="checkbox" checked={reviewed} disabled={busy || !!pending || mfa} onChange={event => setReviewed(event.target.checked)}/><span>Jag har granskat hela uppdelningen, inklusive föreslagen noll-APL och eventuell APL som ännu inte registrerats.</span></label>
    </>}
    <div className="gt-dialog-actions"><Button variant="outline" disabled={busy || !!pending} onClick={onClose}>Avbryt</Button>{pending ? <><Button disabled={busy || mfa} onClick={() => void recover()}>Kontrollera sparstatus</Button>{retry && <Button disabled={busy || mfa} onClick={() => void save()}>Försök samma byte igen</Button>}</> : basis ? <Button disabled={busy || !reviewed || mfa || !scope} onClick={() => void save()}>Byt till skola och APL</Button> : <Button disabled={busy || mfa || !scope} onClick={() => void load()}>Läs underlaget igen</Button>}</div>
  </DialogContent></Dialog>;
}
