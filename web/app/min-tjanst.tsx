'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { CheckCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseSelfCommand, parseSelfCommandReply, parseSelfReadReply, selfCommandRef, TJANST_LIMITS, TjanstContractError,
  type TjanstCommandRef, type TjanstSelfCommand, type TjanstSelfPublication, type TjanstSelfRead } from '@/lib/tjanst-contract.ts';
import type { TjanstJournalScope } from '@/lib/tjanst-journal.ts';
import type { TjanstTeacherSums } from '@/lib/tjanst-model.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ActiveContext } from './context-switch';
import { dateText, timeText } from './tjanst-publish-panel';
import TjanstServiceSummary, { sharingWith, yearLabel, type TjanstSummaryRow } from './tjanst-service-summary';
import { recoverTracked, TRACKED_TEXT, trackedCommand } from './tjanst-tracked';
import './tjanst.css';

/**
 * Lärarens egen vy (TJANST-05, D-03, D-23). Läser bara /api/tjanst/egen/*: personen härleds från sessionen och inget
 * person-ID skickas. Visar bara publicerade versioner, inga utkast, inga elever och kollegors namn bara i egen samläsning.
 * Kvittens och kommentar kräver ingen engångskod. Journalen sparar bara commandId, operation och mål, aldrig kommentarstext.
 */
export type MinTjanstProps = { context: ActiveContext; epoch: number; identityKey: string | null; currentSchoolYear: number; onSessionLost?: () => void };
type Outcome = { ok: true; reply: TjanstSelfRead } | { ok: false; error: string };
type Message = { kind: 'notice' | 'error'; text: string; correlationId?: string | null };

const LOCK_CODES = ['context_changed', 'assignment_ended', 'assignment_expired', 'membership_blocked'];
const UNREACHABLE = 'Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.';
const UNBOUND = 'Ditt konto är inte kopplat till någon personal. Kontakta huvudmannen.';
const aborted = (caught: unknown) => caught instanceof DOMException && caught.name === 'AbortError';
const characters = (n: number) => n.toLocaleString('sv-SE');

/** Samläst tid räknas en gång per samläsning (D-16); specialuppdrag hålls isär från undervisning. */
export function selfSums(publication: TjanstSelfPublication): TjanstTeacherSums {
  const teaching = { ht: 0, vt: 0 }, special = { ht: 0, vt: 0 }, joints = new Set<string>();
  for (const row of publication.rows) {
    if (row.joint === null) { teaching.ht += row.ht; teaching.vt += row.vt; continue; }
    if (joints.has(row.joint.jointId)) continue;
    joints.add(row.joint.jointId); teaching.ht += row.joint.ht; teaching.vt += row.joint.vt;
  }
  for (const s of publication.specials) { special.ht += s.ht; special.vt += s.vt; }
  const year = (t: { ht: number; vt: number }) => ({ ...t, year: t.ht + t.vt });
  return { teaching: year(teaching), special: year(special), total: year({ ht: teaching.ht + special.ht, vt: teaching.vt + special.vt }) };
}
function summaryRows(publication: TjanstSelfPublication): TjanstSummaryRow[] {
  return publication.rows.map(row => {
    const others = row.joint ? [...new Set(publication.rows.filter(r => r.joint?.jointId === row.joint!.jointId && r.id !== row.id).map(r => r.className))] : [];
    return { id: row.id, course: row.label, className: row.className, ht: row.ht, vt: row.vt, jointWith: row.joint ? others.length ? others : [row.joint.name] : null,
      sharing: row.sharing ? sharingWith(row.sharing.mode, row.sharing.colleagues, row.sharing.grader) : null };
  });
}

export default function MinTjanst(props: MinTjanstProps) {
  return <Workspace key={`${props.epoch}-${props.context.assignmentId}`} {...props}/>;
}

function Workspace({ context, identityKey, currentSchoolYear, onSessionLost }: MinTjanstProps) {
  const [data, setData] = useState<TjanstSelfRead | null>(null), [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<{ text: string; retry: boolean; correlationId: string | null } | null>(null), [readKey, setReadKey] = useState(0);
  const active = useRef(true), generation = useRef(0), lost = useRef(onSessionLost);
  useEffect(() => { lost.current = onSessionLost; });
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scope = useMemo<TjanstJournalScope | null>(() => identityKey ? { identityKey, assignmentId: context.assignmentId } : null, [identityKey, context.assignmentId]);

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const reply = parseSelfReadReply(await api.post('/api/tjanst/egen/lasa', {}));
      if (!active.current || token !== generation.current) return;
      setData(reply); setReadError(null);
    } catch (caught) {
      if (!active.current || token !== generation.current || aborted(caught)) return;
      if (caught instanceof ApiError && caught.status === 401) { lost.current?.(); return; }
      // 403 tömmer vyn: utan giltig personbindning finns ingen egen tjänst att visa (tjanst_self_person).
      const failure = caught instanceof TjanstContractError ? { text: 'Din tjänst kunde inte kontrolleras. Hämta den igen.', retry: true, correlationId: null }
        : !(caught instanceof ApiError) ? { text: UNREACHABLE, retry: true, correlationId: null }
        : LOCK_CODES.includes(caught.code) ? { text: 'Uppdraget har ändrats. Ladda om arbetsytan.', retry: false, correlationId: caught.correlationId }
        : caught.code === 'audit_unavailable' ? { text: 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.', retry: true, correlationId: caught.correlationId }
        : caught.status === 403 ? { text: UNBOUND, retry: false, correlationId: caught.correlationId }
        : { text: 'Din tjänst kunde inte hämtas. Försök igen.', retry: true, correlationId: caught.correlationId };
      if (caught instanceof ApiError && caught.status === 403 || caught instanceof TjanstContractError) setData(null);
      setReadError(failure);
    } finally { if (active.current && token === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load, readKey]);
  const refresh = useCallback(() => setReadKey(n => n + 1), []);

  /** Journalen sparas före anropet; uteblivet svar kontrolleras via status med samma commandId, aldrig med ny skrivning. */
  const send = useCallback(async (command: TjanstSelfCommand, onChecking: () => void): Promise<Outcome> => {
    const result = await trackedCommand(scope, selfCommandRef(command), '/api/tjanst/egen/kommando', command, value => parseSelfCommandReply(value, command),
      { onChecking, onSessionLost: () => lost.current?.() });
    if (result.ok) return { ok: true, reply: result.reply.detail };
    if (result.failure !== 'explicit') return { ok: false, error: TRACKED_TEXT[result.failure] };
    const caught = result.error, code = caught.reason ?? caught.code, ref = caught.correlationId ? ` Referens: ${caught.correlationId}` : '';
    if (code === 'tjanst_comment_too_long') return { ok: false, error: 'Kommentaren får vara högst 2 000 tecken.' };
    if (code === 'audit_unavailable') return { ok: false, error: `Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig. Dina uppgifter finns kvar i formuläret.${ref}` };
    if (LOCK_CODES.includes(code)) return { ok: false, error: `Uppdraget har ändrats. Ladda om arbetsytan.${ref}` };
    if (caught.status === 403) return { ok: false, error: `Ditt aktuella uppdrag tillåter inte ändringen.${ref}` };
    if (caught.status === 409) return { ok: false, error: `Rektor har publicerat en ny version under tiden. Hämta din tjänst igen och läs den nya versionen.${ref}` };
    return { ok: false, error: `Ändringen kunde inte sparas. Dina uppgifter finns kvar i formuläret.${ref}` };
  }, [scope]);

  // Ett osäkert sparförsök från en tidigare sidvisning kontrolleras med statuskvittot efter läsningen.
  const [recovery, setRecovery] = useState<Message | null>(null);
  const recovered = useRef(false);
  useEffect(() => {
    if (!data || !scope || recovered.current) return;
    recovered.current = true;
    void (async () => {
      for (const publication of data.publications) {
        const template: TjanstCommandRef = { family: 'self', commandId: crypto.randomUUID(), action: 'ack', target: { unitId: null, schoolYear: null, versionId: publication.versionId, personId: null } };
        const state = await recoverTracked(scope, template);
        if (!state || !active.current) continue;
        if (state === 'unknown') { setRecovery({ kind: 'error', text: TRACKED_TEXT.unknown }); continue; }
        setRecovery({ kind: 'notice', text: state === 'completed' ? 'Ändringen är sparad.' : 'Ändringen sparades inte. Gör om den om den behövs.' }); refresh();
      }
    })();
  }, [data, scope, refresh]);

  const publications = useMemo(() => data ? [...data.publications].sort((a, b) => a.schoolName.localeCompare(b.schoolName, 'sv') || b.schoolYear - a.schoolYear) : [], [data]);
  const first = publications[0];
  return <div className="admin-workspace protected-admin tjanst min-tjanst" aria-busy={loading}>
    <div className="admin-heading tjanst-heading"><div>
      <span className="admin-kicker">MIN TJÄNST</span>
      <h1>Min tjänst</h1>
      {publications.length === 1 && first && <p className="tjanst-subline">{first.schoolName} · läsåret {yearLabel(first.schoolYear)} · version {first.versionNo}, publicerad {dateText(first.publishedAt)}</p>}
    </div></div>
    <div className="tjanst-messages">
      {recovery && (recovery.kind === 'notice' ? <output className="admin-notice"><span>{recovery.text}</span></output> : <div role="alert" className="validation-warning"><p>{recovery.text}</p></div>)}
      {readError && <div role="alert" className="validation-warning"><p>{readError.text}</p>{readError.correlationId && <p>Referens: {readError.correlationId}</p>}
        {readError.retry && <Button variant="outline" aria-label="Hämta din tjänst igen" onClick={refresh}>Hämta igen</Button>}</div>}
      {loading && <output aria-busy="true">Hämtar din tjänst…</output>}
    </div>
    {data && publications.length === 0 && <div className="admin-empty tjanst-state"><h2>Ingen publicerad tjänst ännu</h2>
      <p>Rektor har inte publicerat tjänstefördelningen för läsåret {yearLabel(currentSchoolYear)}. Du ser din tjänst här när den är publicerad.</p></div>}
    {data && publications.map(p => <PublicationCard key={p.versionId} publication={p} name={data.person.displayName} many={publications.length > 1} busyRead={loading}
      canAck={data.capabilities.canAck && !!scope} canComment={data.capabilities.canComment && !!scope} send={send}
      onSaved={reply => { if (active.current) { setData(reply); refresh(); } }}/>)}
  </div>;
}

function PublicationCard({ publication, name, many, busyRead, canAck, canComment, send, onSaved }: { publication: TjanstSelfPublication; name: string; many: boolean; busyRead: boolean;
  canAck: boolean; canComment: boolean; send: (command: TjanstSelfCommand, onChecking: () => void) => Promise<Outcome>; onSaved: (reply: TjanstSelfRead) => void }) {
  const [body, setBody] = useState(''), [touched, setTouched] = useState(false), [busy, setBusy] = useState<'ack' | 'comment' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const id = useId(), running = useRef(false);
  useUnsavedChanges(`navigation-block:min-tjanst-${publication.versionId}`, busy !== null);
  useUnsavedChanges(`min-tjanst-comment-${publication.versionId}`, body.trim() !== '');
  const tooLong = body.length > TJANST_LIMITS.comment;
  const fieldError = tooLong ? 'Kommentaren får vara högst 2 000 tecken.' : touched && body.trim() === '' ? 'Skriv en kommentar.' : null;
  const comments = [...publication.comments].sort((a, b) => b.at.localeCompare(a.at));
  const sums = useMemo(() => selfSums(publication), [publication]);

  async function run(action: 'ack' | 'comment') {
    if (running.current) return;
    running.current = true; setBusy(action); setMessage(null);
    try {
      const command = parseSelfCommand(action === 'ack' ? { commandId: crypto.randomUUID(), versionId: publication.versionId, action }
        : { commandId: crypto.randomUUID(), versionId: publication.versionId, action, body });
      const outcome = await send(command, () => setMessage({ kind: 'notice', text: 'Svaret uteblev. Vi kontrollerar om ändringen sparades.' }));
      if (!outcome.ok) { setMessage({ kind: 'error', text: outcome.error }); return; }
      if (action === 'comment') { setBody(''); setTouched(false); }
      setMessage({ kind: 'notice', text: action === 'ack' ? `Du har kvitterat version ${publication.versionNo}.` : 'Kommentaren är skickad till rektor.' });
      onSaved(outcome.reply);
    } catch { setMessage({ kind: 'error', text: action === 'comment' ? 'Kommentaren kunde inte kontrolleras. Rätta texten och försök igen.' : 'Kvittensen kunde inte förberedas. Inget har skickats.' }); }
    finally { running.current = false; setBusy(null); }
  }
  function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault(); setTouched(true);
    if (body.trim() === '' || tooLong) return;
    void run('comment');
  }

  return <section className="protected-card min-tjanst-card" aria-labelledby={`${id}-school`}>
    <h2 id={`${id}-school`}>{publication.schoolName}</h2>
    {many && <p className="tjanst-subline">{publication.schoolName} · läsåret {yearLabel(publication.schoolYear)} · version {publication.versionNo}, publicerad {dateText(publication.publishedAt)}</p>}
    {!publication.acknowledgedAt && publication.versionNo > 1 && <p className="tjanst-readonly">Rektor har publicerat version {publication.versionNo}. Läs igenom och kvittera den nya versionen.</p>}
    <h3>Sammanfattning</h3>
    <TjanstServiceSummary name={name} teaching={summaryRows(publication)} specials={publication.specials.map(s => ({ id: s.id, kind: s.kind, label: s.label, group: s.className, ht: s.ht, vt: s.vt }))} sums={sums}/>
    <h3>Kvittens och kommentar</h3>
    <div className="min-tjanst-ack">
      <Badge variant="outline" className="tjanst-badge">{publication.acknowledgedAt ? `Kvitterad ${dateText(publication.acknowledgedAt)}` : 'Inte kvitterad'}</Badge>
      <p>Kvittensen visar rektor att du har läst tjänsten. Den betyder inte att du godkänner den. Har du frågor kan du skriva en kommentar.</p>
      {!publication.acknowledgedAt && canAck && <Button disabled={busy !== null || busyRead} onClick={() => void run('ack')}>{busy === 'ack' ? 'Sparar…' : 'Kvittera att jag har läst'}</Button>}
    </div>
    <div className="tjanst-messages">
      {message && (message.kind === 'notice' ? <output className="admin-notice"><CheckCheck size={16} aria-hidden="true"/><span>{message.text}</span></output>
        : <div role="alert" className="validation-warning"><p>{message.text}</p></div>)}
    </div>
    {canComment && <form className="protected-form min-tjanst-comment" noValidate onSubmit={submit}>
      <label htmlFor={`${id}-comment`}>Kommentar till rektor</label>
      <textarea id={`${id}-comment`} value={body} rows={5} disabled={busy !== null} aria-invalid={fieldError ? true : undefined}
        aria-describedby={`${id}-help ${id}-count${fieldError ? ` ${id}-error` : ''}`} onChange={e => { setBody(e.target.value); setMessage(null); }}/>
      <small id={`${id}-help`}>Rektor ser kommentaren tillsammans med din tjänst.</small>
      <small id={`${id}-count`} aria-live="polite">{characters(body.length)} av {characters(TJANST_LIMITS.comment)} tecken</small>
      {fieldError && <small id={`${id}-error`} className="field-error">{fieldError}</small>}
      <div className="mandate-actions"><Button type="submit" variant="outline" disabled={busy !== null || busyRead}>{busy === 'comment' ? 'Sparar…' : 'Skicka kommentar'}</Button></div>
    </form>}
    <h3>Mina kommentarer</h3>
    {comments.length === 0 ? <p className="tjanst-empty-text">Du har inte skrivit några kommentarer.</p>
      : <ul className="min-tjanst-comments">{comments.map(c => <li key={c.id}><span className="min-tjanst-comment-time">{timeText(c.at)}</span><p>{c.body}</p></li>)}</ul>}
  </section>;
}
