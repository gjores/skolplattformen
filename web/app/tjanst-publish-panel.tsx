'use client';

import { History, MessageSquare, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { TjanstPlanRead, TjanstVersion } from '@/lib/tjanst-contract.ts';

/**
 * Lärarnas återkoppling för senaste publicerade version. Fördelningens läsning (tjanst_v1) bär inte kvittenser och
 * kommentarer; vyn visar dem bara när en sådan uppgift skickas in (öppen fråga i 05.1-05-SUMMARY).
 */
export type TjanstFeedback = { versionNo: number; teachers: { personId: string; name: string; acknowledgedAt: string | null }[];
  comments: { id: string; personId: string; name: string; at: string; body: string }[] };
export const STATUS_LABEL: Record<TjanstVersion['status'], string> = { draft: 'Utkast', published: 'Fastställd och publicerad', superseded: 'Ersatt av senare version', discarded: 'Borttaget utkast' };
export const dateText = (instant: string) => new Date(instant).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
export const timeText = (instant: string) => new Date(instant).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' });
export const ackSummary = (feedback: TjanstFeedback) => `Kvitterad av ${feedback.teachers.filter(t => t.acknowledgedAt).length} av ${feedback.teachers.length} lärare`;

type Props = { data: TjanstPlanRead; phone: boolean; busy: boolean; feedback?: TjanstFeedback; onPublish: () => void; onDiscard: () => void };
/** Skärm 6. Beslutsknappen visas bara när serverns actions innehåller publish (D-01); servern prövar ändå anropet. Inget steg för facklig samverkan (D-20). */
export default function TjanstPublishPanel({ data, phone, busy, feedback, onPublish, onDiscard }: Props) {
  const version = data.version, draft = version?.status === 'draft';
  const canPublish = data.actions.includes('publish') && !phone, canDiscard = data.actions.includes('discard_draft') && !phone;
  const blockers = data.blockers.length;
  const history = [...data.versions].sort((a, b) => b.versionNo - a.versionNo);
  return <section className="tjanst-panel protected-card" aria-label="Fastställ och publicera">
    <h2>Fastställ och publicera</h2>
    <ol className="tjanst-steps" aria-label="Fördelningens steg">
      <li aria-current={draft ? 'step' : undefined}>1. Utkast</li>
      <li aria-current={version && !draft ? 'step' : undefined}>2. Fastställd och publicerad</li>
    </ol>
    {blockers > 0 && <div className="validation-warning tjanst-blockers"><p><TriangleAlert size={16} aria-hidden="true"/>{blockers} {blockers === 1 ? 'punkt behöver' : 'punkter behöver'} åtgärdas innan du kan fastställa.</p>
      <ul>{data.blockers.map(b => <li key={b.code}>{b.message}</li>)}</ul></div>}
    {draft && (canPublish || canDiscard) && <div className="mandate-actions">
      {canPublish && <Button disabled={busy || blockers > 0} onClick={onPublish}>Fastställ och publicera…</Button>}
      {canDiscard && <Button variant="outline" disabled={busy} onClick={onDiscard}>Ta bort utkastet…</Button>}
    </div>}
    {draft && !data.actions.includes('publish') && data.capabilities.canEdit && <p>Rektor fastställer och publicerar fördelningen. Du kan fortsätta förbereda utkastet.</p>}
    <Collapsible className="tjanst-collapsible">
      <CollapsibleTrigger render={<Button variant="outline"/>}><History size={16} aria-hidden="true"/>Versionshistorik</CollapsibleTrigger>
      <CollapsibleContent><ul className="tjanst-plain-list">{history.map(v => <li key={v.id}>Version {v.versionNo} · {STATUS_LABEL[v.status]}{v.publishedByName ? ` · ${v.publishedByName}` : ''}{v.publishedAt ? ` · ${timeText(v.publishedAt)}` : ''}</li>)}</ul></CollapsibleContent>
    </Collapsible>
    {feedback && <Collapsible className="tjanst-collapsible">
      <CollapsibleTrigger render={<Button variant="outline"/>}><MessageSquare size={16} aria-hidden="true"/>Lärarnas återkoppling ({feedback.comments.length})</CollapsibleTrigger>
      <CollapsibleContent>
        <p>Version {feedback.versionNo} · {ackSummary(feedback)}</p>
        <ul className="tjanst-plain-list">{feedback.teachers.map(t => <li key={t.personId}>{t.name} · <Badge variant="outline" className="tjanst-badge">{t.acknowledgedAt ? `Kvitterad ${timeText(t.acknowledgedAt)}` : 'Inte kvitterad'}</Badge></li>)}</ul>
        {feedback.comments.length > 0 && <ul className="tjanst-comments">{feedback.comments.map(c => <li key={c.id}><strong>{c.name} · {timeText(c.at)}</strong><p>{c.body}</p></li>)}</ul>}
        <p>Kvittensen betyder att läraren har läst tjänsten, inte att läraren godkänner den.</p>
      </CollapsibleContent>
    </Collapsible>}
  </section>;
}
