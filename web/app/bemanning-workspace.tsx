'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseStaffingReadReply, TjanstContractError, type TjanstStaffingRead, type TjanstStaffingUnit } from '@/lib/tjanst-contract.ts';
import type { ActiveContext } from './context-switch';
import { dateText } from './tjanst-publish-panel';
import { formatTime, TERM_LABEL, termValue, yearLabel, type TjanstTermView } from './tjanst-service-summary';
import TjanstWorkspace from './tjanst-workspace';
import './tjanst.css';

/**
 * Huvudmannens Bemanning (D-01, D-19): uppföljning per skola för planeringsvalets läsår, utan beslutsknapp. Summorna kommer
 * från servern för den publicerade versionen. Ej fördelad tid räknas bara på kopplade klasser; okopplade klasser räknas
 * separat (Koppling saknas). Visa fördelningen finns bara för skolor med publicerad version och öppnar just den versionen skrivskyddad,
 * också när rektor har ett utkast (WR-07). Lärarantal ingår inte i svaret.
 */
export type BemanningWorkspaceProps = { context: ActiveContext; epoch: number; schoolYear: number; onSessionLost?: () => void };
const LOCK_CODES = ['context_changed', 'assignment_ended', 'assignment_expired', 'membership_blocked'];
const TERMS: TjanstTermView[] = ['ar', 'ht', 'vt'];

export default function BemanningWorkspace(props: BemanningWorkspaceProps) {
  return <Workspace key={`${props.epoch}-${props.context.assignmentId}-${props.schoolYear}`} {...props}/>;
}

function Workspace({ context, epoch, schoolYear, onSessionLost }: BemanningWorkspaceProps) {
  const [data, setData] = useState<TjanstStaffingRead | null>(null), [loading, setLoading] = useState(true), [readKey, setReadKey] = useState(0);
  const [error, setError] = useState<{ text: string; retry: boolean; correlationId: string | null } | null>(null);
  const [term, setTerm] = useState<TjanstTermView>('ar'), [open, setOpen] = useState<TjanstStaffingUnit | null>(null);
  const active = useRef(true), generation = useRef(0), lost = useRef(onSessionLost), opener = useRef<string | null>(null);
  useEffect(() => { lost.current = onSessionLost; });
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const load = useCallback(async () => {
    const token = ++generation.current, request = { schoolYear };
    setLoading(true);
    try {
      const reply = parseStaffingReadReply(await api.post('/api/tjanst/bemanning/lasa', request), request);
      if (!active.current || token !== generation.current) return;
      setData(reply); setError(null);
    } catch (caught) {
      if (!active.current || token !== generation.current || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { lost.current?.(); return; }
      if (caught instanceof TjanstContractError || caught instanceof ApiError && caught.status === 403) setData(null);
      setError(caught instanceof TjanstContractError ? { text: 'Bemanningens underlag kunde inte kontrolleras. Hämta det igen.', retry: true, correlationId: null }
        : !(caught instanceof ApiError) ? { text: 'Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.', retry: true, correlationId: null }
        : LOCK_CODES.includes(caught.code) ? { text: 'Uppdraget har ändrats. Ladda om arbetsytan.', retry: false, correlationId: caught.correlationId }
        : caught.code === 'audit_unavailable' ? { text: 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.', retry: true, correlationId: caught.correlationId }
        : caught.status === 403 ? { text: 'Ditt aktuella uppdrag tillåter inte att läsa bemanningen.', retry: false, correlationId: caught.correlationId }
        : { text: 'Bemanningen kunde inte hämtas. Försök igen.', retry: true, correlationId: caught.correlationId });
    } finally { if (active.current && token === generation.current) setLoading(false); }
  }, [schoolYear]);
  useEffect(() => { queueMicrotask(() => void load()); }, [load, readKey]);
  useEffect(() => {
    if (open || !opener.current) return;
    // Tabell och kort finns båda i DOM; fokus går till den synliga knappen.
    [...document.querySelectorAll<HTMLElement>(`[data-staffing-open="${CSS.escape(opener.current)}"]`)].find(e => e.getClientRects().length > 0)?.focus(); opener.current = null;
  }, [open]);

  if (open) return <div className="bemanning-detail">
    <div className="mandate-actions"><Button variant="outline" onClick={() => setOpen(null)}>Tillbaka till bemanningen</Button></div>
    <TjanstWorkspace context={context} epoch={epoch} unitId={open.unitId} schoolYear={schoolYear} versionId={open.published?.versionId ?? null} readOnly onSessionLost={onSessionLost}/>
  </div>;

  const units = data ? [...data.units].sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'sv')) : [];
  const none = !!data && units.every(u => u.published === null);
  const time = (value: { ht: number; vt: number } | undefined) => value ? formatTime(termValue(value, term)) : '–';
  return <div className="admin-workspace protected-admin tjanst bemanning" aria-busy={loading}>
    <div className="admin-heading tjanst-heading"><div>
      <span className="admin-kicker">PLANERING</span>
      <h1>Bemanning</h1>
      <p className="tjanst-subline">Läsåret {yearLabel(schoolYear)}</p>
      <p>Huvudmannen följer upp bemanningen. Rektor fastställer och publicerar skolans fördelning.</p>
    </div></div>
    <fieldset className="tjanst-term"><legend>Visa tid</legend>
      {TERMS.map(t => <button key={t} type="button" aria-pressed={term === t} onClick={() => setTerm(t)}>{TERM_LABEL[t]}</button>)}</fieldset>
    <div className="tjanst-messages">
      {error && <div role="alert" className="validation-warning"><p>{error.text}</p>{error.correlationId && <p>Referens: {error.correlationId}</p>}
        {error.retry && <Button variant="outline" aria-label="Hämta bemanningen igen" onClick={() => setReadKey(n => n + 1)}>Hämta igen</Button>}</div>}
      {loading && <output aria-busy="true">Hämtar bemanning…</output>}
    </div>
    {data && (none ? <div className="admin-empty tjanst-state"><p>Ingen skola har en tjänstefördelning för läsåret {yearLabel(schoolYear)} ännu.</p></div> : <>
      <Table className="tjanst-table tjanst-wide bemanning-table"><caption className="sr-only">Bemanning per skola läsåret {yearLabel(schoolYear)}, {TERM_LABEL[term]}</caption>
        <TableHeader><TableRow><TableHead scope="col">Skola</TableHead><TableHead scope="col">Status</TableHead><TableHead scope="col" className="tjanst-num">Undervisning</TableHead>
          <TableHead scope="col" className="tjanst-num">Specialuppdrag</TableHead><TableHead scope="col" className="tjanst-num">Vakant tid</TableHead><TableHead scope="col" className="tjanst-num">Ej fördelad tid</TableHead>
          <TableHead scope="col" className="tjanst-num">Koppling saknas</TableHead><TableHead scope="col"><span className="sr-only">Åtgärd</span></TableHead></TableRow></TableHeader>
        <TableBody>{units.map(u => <TableRow key={u.unitId}>
          <TableHead scope="row" className="tjanst-text">{u.schoolName}</TableHead>
          <TableCell>{u.published ? <>Publicerad version {u.published.versionNo}, <span className="tjanst-nowrap">{dateText(u.published.publishedAt)}</span></> : 'Ingen publicerad version'}</TableCell>
          <TableCell className="tjanst-num">{time(u.sums?.teaching)}</TableCell><TableCell className="tjanst-num">{time(u.sums?.special)}</TableCell>
          <TableCell className="tjanst-num">{time(u.sums?.vacant)}</TableCell><TableCell className="tjanst-num">{time(u.sums?.unallocated)}</TableCell>
          <TableCell className="tjanst-num">{u.sums ? u.sums.unlinkedClasses === 1 ? '1 klass' : `${u.sums.unlinkedClasses} klasser` : '–'}</TableCell>
          <TableCell>{u.published && <Button variant="outline" data-staffing-open={u.unitId} aria-label={`Visa fördelningen för ${u.schoolName}`} onClick={() => { opener.current = u.unitId; setOpen(u); }}>Visa fördelningen</Button>}</TableCell>
        </TableRow>)}</TableBody></Table>
      <ul className="tjanst-cards">{units.map(u => <li key={u.unitId} className="protected-card">
        <strong>{u.schoolName}</strong><span>{u.published ? <>Publicerad version {u.published.versionNo}, <span className="tjanst-nowrap">{dateText(u.published.publishedAt)}</span></> : 'Ingen publicerad version'}</span>
        {u.sums && <><span>Undervisning {time(u.sums.teaching)} · Specialuppdrag {time(u.sums.special)}</span><span>Vakant tid {time(u.sums.vacant)} · Ej fördelad tid {time(u.sums.unallocated)}</span>
          <span>Koppling saknas: {u.sums.unlinkedClasses === 1 ? '1 klass' : `${u.sums.unlinkedClasses} klasser`}</span></>}
        {u.published && <Button variant="outline" data-staffing-open={u.unitId} aria-label={`Visa fördelningen för ${u.schoolName}`} onClick={() => { opener.current = u.unitId; setOpen(u); }}>Visa fördelningen</Button>}
      </li>)}</ul>
      <p className="tjanst-empty-text">Ej fördelad tid räknas bara på klasser med timplan. Klasser utan koppling räknas i kolumnen Koppling saknas, eftersom deras behov är okänt.</p>
      {data.vacancies.length > 0 && <section className="protected-card bemanning-vacancies" aria-labelledby="bemanning-vacancies"><h2 id="bemanning-vacancies">Vakanser</h2>
        <ul className="personal-list">{data.vacancies.map(v => <li key={`${v.kind}:${v.id}`}>{units.find(u => u.unitId === v.unitId)?.schoolName ?? ''} · {v.label} · HT {formatTime(v.ht)} · VT {formatTime(v.vt)}</li>)}</ul></section>}
    </>)}
  </div>;
}
