'use client';

import { MessageSquare, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import type { TjanstFeedback, TjanstPlanRead, TjanstVersion } from '@/lib/tjanst-contract.ts';

/** Lärarnas återkoppling för senaste publicerade version kommer i rektors och administratörens läsning (05.1-08). */
export type { TjanstFeedback };
export const STATUS_LABEL: Record<TjanstVersion['status'], string> = { draft: 'Pågående planering', published: 'Publicerad', superseded: 'Ersatt av senare version', discarded: 'Borttaget utkast' };
export const dateText = (instant: string) => new Date(instant).toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
export const timeText = (instant: string) => new Date(instant).toLocaleString('sv-SE', { timeZone: 'Europe/Stockholm', dateStyle: 'short', timeStyle: 'short' });
export const ackSummary = (feedback: TjanstFeedback) => `Kvitterad av ${feedback.teachers.filter(t => t.acknowledgedAt).length} av ${feedback.teachers.length} lärare`;

type Props = { data: TjanstPlanRead; phone: boolean; busy: boolean; feedback?: TjanstFeedback; onPublish: () => void; onDiscard: () => void;
  /** Rektor i ett utkast. Servern utelämnar publish så länge det finns hinder; då visas knappen inaktiv (UI-SPEC Skärm 6). */
  rector?: boolean };
/** Skärm 6. Beslutsknappen visas bara när serverns actions innehåller publish (D-01); servern prövar ändå anropet. Inget steg för facklig samverkan (D-20). */
export default function TjanstPublishPanel({ data, phone, busy, feedback, onPublish, onDiscard, rector = false }: Props) {
  const version = data.version, draft = version?.status === 'draft';
  const blockers = data.blockers.length;
  // Beslutsknappen kommer från serverns actions. Med hinder saknas publish i svaret; rektor ser då knappen inaktiv
  // tillsammans med punkterna. Servern prövar ändå varje anrop (409 tjanst_publish_blocked).
  const blockedRector = rector && blockers > 0 && data.capabilities.canEdit;
  const canPublish = (data.actions.includes('publish') || blockedRector) && !phone, canDiscard = data.actions.includes('discard_draft') && !phone;

  return <section className="tjanst-panel protected-card" aria-label="Fastställ och publicera">
    <h2>Fastställ och publicera</h2>
    <p>{draft ? data.versions.some(v => v.status === 'published') ? 'Ändringarna är ännu inte publicerade. Lärarna ser den senaste publiceringen tills du publicerar på nytt.' : 'Planeringen pågår. Lärarna ser den när rektor har fastställt och publicerat.' : 'Du kan fortsätta planera i samma arbetsyta. Nästa ändring sparas utan att ändra det lärarna redan ser.'}</p>
    {blockers > 0 && <div className="validation-warning tjanst-blockers"><p><TriangleAlert size={16} aria-hidden="true"/>{blockers} {blockers === 1 ? 'punkt behöver' : 'punkter behöver'} åtgärdas innan du kan fastställa.</p>
      <ul>{data.blockers.map(b => <li key={b.code}>{b.message}</li>)}</ul></div>}
    {draft && (canPublish || canDiscard) && <div className="mandate-actions">
      {canPublish && <Button disabled={busy || blockers > 0} onClick={onPublish}>Fastställ och publicera…</Button>}
      {canDiscard && <Button variant="outline" disabled={busy} onClick={onDiscard}>Ta bort opublicerade ändringar…</Button>}
    </div>}
    {draft && !data.actions.includes('publish') && !rector && data.capabilities.canEdit && <p>Rektor fastställer och publicerar fördelningen. Du kan fortsätta planera.</p>}
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
