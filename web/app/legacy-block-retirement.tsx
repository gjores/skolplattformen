'use client';

import { useEffect, useEffectEvent, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { createElectiveCommandRef, parseElectiveCommand, parseElectiveRead, parseElectiveReceipt, type ElectiveRead } from '@/lib/elective-block-contract.ts';
import { createPlanCommand, parsePlanCommandReply, parsePlanReadReply, type TjanstYearPlanRead } from '@/lib/tjanst-contract.ts';
import { parseYearReply, parseYearRequest } from '@/lib/tjanst-year-contract.ts';
import { legacyBlocks, nextLegacyStep, type LegacyBlock, type LegacyStep, type LegacyStop } from '@/lib/legacy-block-retirement.ts';

const STOP: Record<LegacyStop, string> = {
  joint_row: 'En av blockets tjänsterader ingår i en samläsning. Lös upp den i Tjänstefördelningen och försök igen.',
  placement_today: 'En elevplacering börjar i dag och kan inte avslutas förrän i morgon. Försök igen då.',
};
const REASON: Record<string, string> = {
  elective_group_in_use: 'Blocket har placeringar eller tjänsterader som du inte kan se eller ändra. Kontrollera dem och försök igen.',
  elective_round_open: 'En valomgång är fortfarande öppen. Hämta aktuellt läge och försök igen.',
};
function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason && REASON[error.reason]) return REASON[error.reason];
    if (error.status === 403) return 'Ditt uppdrag tillåter inte den här åtgärden.';
    if (error.status === 409) return 'Underlaget har ändrats. Försök igen, så fortsätter avvecklingen från aktuellt läge.';
  }
  return 'Avvecklingen stannade och resultatet av sista steget är inte bekräftat. Försök igen, så fortsätter den från aktuellt läge.';
}
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const today = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
type Reads = { elective: ElectiveRead; plan: TjanstYearPlanRead };
type Scope = { unitId: string; schoolYear: number };
async function readBoth(scope: Scope, signal?: AbortSignal): Promise<Reads> {
  const [elective, plan] = await Promise.all([api.post('/api/valbara-block/lasa', scope, signal), api.post('/api/tjanst/plan/lasa', scope, signal)]);
  return { elective: parseElectiveRead(elective, scope), plan: parsePlanReadReply(plan, scope) };
}
async function runStep(step: LegacyStep, scope: Scope, current: Reads) {
  if (step.kind === 'delete_row') {
    const request = parseYearRequest({ ...scope, mode: 'catalog' }), support = parseYearReply(await api.post('/api/tjanst/plan/forhandsvisa', request), request);
    const command = await createPlanCommand({ ...scope, action: 'delete_row', commandId: crypto.randomUUID(), expectedRevision: support.currentRevision, payload: { rowId: step.rowId, mutationContext: { baseVersionId: support.baseVersionId, expectedBasisHash: support.basisHash } } });
    parsePlanCommandReply(await api.post('/api/tjanst/plan/kommando', command), command);
    return;
  }
  const command = parseElectiveCommand({ ...scope, commandId: crypto.randomUUID(), expectedRevision: current.elective.revision, action: step.action, payload: step.payload });
  parseElectiveReceipt(await api.post('/api/valbara-block/kommando', command), await createElectiveCommandRef(command));
}
/** Reads, takes one step and reads again until the block is gone or something stops the run. */
async function retireBlock(scope: Scope, blockId: string, onRead: (reads: Reads) => void): Promise<{ stop: LegacyStop | null; removedRows: boolean }> {
  let removedRows = false;
  while (true) {
    const current = await readBoth(scope), step = nextLegacyStep(current.elective, current.plan, blockId, today());
    onRead(current);
    if (!step) return { stop: null, removedRows };
    if ('stop' in step) return { stop: step.stop, removedRows };
    await runStep(step, scope, current);
    removedRows ||= step.kind === 'delete_row';
  }
}
type Props = { unitId: string; schoolYear: number; onSessionLost: () => void };

export default function LegacyBlockRetirement({ unitId, schoolYear, onSessionLost }: Props) {
  const scope = useMemo(() => ({ unitId, schoolYear }), [unitId, schoolYear]);
  const [reads, setReads] = useState<Reads | null>(null), [loadError, setLoadError] = useState(false), [review, setReview] = useState<string | null>(null), [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null), [notice, setNotice] = useState<string | null>(null);
  useUnsavedChanges(`legacy-blocks-${unitId}-${schoolYear}`, busy);
  const failedRead = useEffectEvent((caught: unknown) => { if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setLoadError(true); });
  useEffect(() => {
    const controller = new AbortController();
    readBoth(scope, controller.signal).then(value => { setReads(value); setLoadError(false); }).catch(caught => { if (!controller.signal.aborted) failedRead(caught); });
    return () => controller.abort();
  }, [scope, attempt]);
  async function retire(legacy: LegacyBlock) {
    const { id, name } = legacy.block;
    setBusy(true); setError(null); setNotice(null);
    try {
      const { stop, removedRows } = await retireBlock(scope, id, setReads);
      if (stop) { setError(STOP[stop]); return; }
      setReview(null);
      setNotice(`${name} är avvecklat.${removedRows ? ' Publicera en ny version i Tjänstefördelningen när du är klar.' : ''}`);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      setError(message(caught));
    } finally { setBusy(false); }
  }
  const blocks = reads ? legacyBlocks(reads.elective, reads.plan, today()) : [];
  const status = <>{error && <div className="valplan-alert" role="alert"><p>{error}</p></div>}{notice && <output className="valplan-notice">{notice}</output>}</>;
  if (loadError) return <div className="valplan-alert" role="alert"><p>Gamla valbara block kunde inte hämtas.</p><Button variant="outline" onClick={() => { setLoadError(false); setAttempt(n => n + 1); }}>Försök igen</Button></div>;
  if (!blocks.length) return notice ? <div className="valplan-card">{status}</div> : null;
  return <section className="valplan-card" aria-label="Gamla valbara block">
    <div className="section-heading"><h2>Gamla valbara block</h2></div>
    <p className="valplan-muted">Blocken nedan räknas fortfarande som behov i tjänstefördelningen. Avveckla dem när en valplan ersätter dem.</p>
    {status}
    {blocks.map(legacy => { const { block } = legacy; return <article key={block.id} className="valplan-group" aria-label={block.name}>
      <header><h3>{block.name}</h3><small>{count(block.groups.length, 'grupp', 'grupper')} · {count(legacy.rowIds.length, 'tjänsterad', 'tjänsterader')}</small></header>
      {review === block.id ? <>
        <p>Det här händer när du avvecklar blocket:</p>
        <ul>
          {legacy.rowIds.length > 0 && <li>{count(legacy.rowIds.length, 'tjänsterad tas', 'tjänsterader tas')} bort ur tjänstefördelningen. Publicerad version gäller tills du publicerar en ny.</li>}
          {legacy.openRounds > 0 && <li>{count(legacy.openRounds, 'öppen valomgång stängs', 'öppna valomgångar stängs')}.</li>}
          {legacy.placements > 0 && <li>{count(legacy.placements, 'elevplacering avslutas', 'elevplaceringar avslutas')}.</li>}
          <li>{count(block.groups.length, 'grupp avvecklas', 'grupper avvecklas')}. Historiken finns kvar.</li>
        </ul>
        {block.appliedRevision !== null && <p>Timplanens rader väntar sedan på ett valbart block med grupp. Tills dess går tjänstefördelningen inte att publicera.</p>}
        <p className="valplan-muted">Avvecklingen går inte att ångra.</p>
        <div className="valplan-actions"><Button disabled={busy} onClick={() => void retire(legacy)}>{busy ? 'Avvecklar…' : 'Bekräfta avveckling'}</Button><Button variant="outline" disabled={busy} onClick={() => { setReview(null); setError(null); }}>Behåll blocket</Button></div>
      </> : <div className="valplan-actions"><Button variant="outline" disabled={busy} onClick={() => { setReview(block.id); setError(null); setNotice(null); }}>Avveckla…</Button></div>}
    </article>; })}
  </section>;
}
