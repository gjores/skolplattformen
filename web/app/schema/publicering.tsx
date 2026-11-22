'use client';

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { parseSchemaPublicationReply, type SchemaPublication, type SchemaPublicationRequest, type SchemaPublicationScope } from '@/lib/schema-publication-contract.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { useRequestConfirm } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from '../mfa-step-up';

type Saved = { draftId: string; revision: number; contentHash: string };
type Command = Extract<SchemaPublicationRequest, { action: 'publish' }>;
const periodLabels = { lasar: 'hela läsåret', ht: 'höstterminen', vt: 'vårterminen' };
const endpoint = '/api/schema/publicering';

export function SchemaPublicering({ scope, saved, canPublish, disabled, onSessionLost }: {
  scope: SchemaPublicationScope; saved: Saved | null; canPublish: boolean; disabled: boolean; onSessionLost: () => void;
}) {
  const heading = useId();
  const confirm = useRequestConfirm();
  const [publication, setPublication] = useState<SchemaPublication | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfa, setMfa] = useState(false);
  const [pending, setPending] = useState<Command | null>(null);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(false);
  const inProgress = useRef(false);

  async function send(input: SchemaPublicationRequest) {
    if (request.current || !mounted.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(true);
    setError(null);
    setMfa(false);
    try {
      const reply = parseSchemaPublicationReply(await api.post<unknown>(endpoint, input, controller.signal), input);
      if (controller.signal.aborted) return;
      if (input.action === 'publish' && !reply.publication) throw new Error('Missing publication receipt');
      setPublication(reply.publication);
      setLoaded(true);
      setPending(null);
    } catch (caught) {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
      if (caught instanceof ApiError && (caught.status === 403 || caught.code === 'context_changed')) {
        setPublication(null);
        setLoaded(false);
        setMfa(caught.code === 'mfa_required');
        setError(caught.code === 'mfa_required' ? null : 'Ditt aktuella uppdrag tillåter inte den här publiceringen.');
      } else if (input.action === 'status') {
        setError('Publiceringsläget kunde inte läsas. Försök igen.');
      } else if (caught instanceof ApiError && caught.status === 409) {
        setPending(null);
        setError(caught.reason === 'schema_publication_not_ready'
          ? 'Schemat behöver vara komplett och kontrollerat med aktuellt underlag före publicering.'
          : 'Schemat eller publiceringen har ändrats. Läs aktuellt läge och välj den sparade version du vill publicera.');
      } else if (caught instanceof ApiError && caught.hasExplicitCode && caught.status >= 400 && caught.status < 500) {
        setPending(null);
        setError('Publiceringen kunde inte godtas. Läs aktuellt läge och kontrollera det sparade utkastet.');
      } else {
        setError('Svaret från publiceringen kunde inte bekräftas. Kontrollera samma begäran.');
      }
    } finally {
      if (request.current === controller) {
        request.current = null;
        if (!controller.signal.aborted) setBusy(false);
      }
    }
  }

  const initialRead = useEffectEvent(() => { void send({ action: 'status', ...scope }); });
  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => { if (active) initialRead(); });
    return () => {
      active = false;
      mounted.current = false;
      request.current?.abort();
      request.current = null;
    };
  }, []);

  const publishedThisDraft = saved !== null && publication?.draftId === saved.draftId && publication.revision === saved.revision;
  async function publish() {
    if (!saved || busy || disabled || pending || inProgress.current || publishedThisDraft) return;
    const input: Command = { action: 'publish', ...scope, ...saved, commandId: crypto.randomUUID() };
    inProgress.current = true;
    setConfirming(true);
    try {
      const accepted = await confirm({ title: 'Publicera schemat?',
        description: `Du publicerar den sparade versionen ${input.revision} för ${periodLabels[scope.period]}. Elevkortet kan därefter läsa de matchande undervisningspassen.`,
        confirmLabel: 'Publicera schema', cancelLabel: 'Avbryt' });
      if (!accepted || !mounted.current) return;
      setPending(input);
      await send(input);
    } finally {
      inProgress.current = false;
      if (mounted.current) setConfirming(false);
    }
  }

  return <section className="grid min-w-0 gap-3 rounded-lg border border-border bg-card p-4" aria-labelledby={heading}>
    <h2 id={heading} className="section-heading">Publicering</h2>
    <output className="text-sm" aria-live="polite">
      {busy ? pending ? 'Publicerar schema…' : 'Läser publiceringen…'
        : publication ? <><span className="status-badge success">Senaste publiceringen</span> Version {publication.revision} · {periodLabels[publication.period]}</>
          : loaded ? 'Inget schema har publicerats för den här perioden.' : null}
    </output>
    {error && <p role="alert" className="validation-warning">{error}</p>}
    {mfa && <MfaStepUpNotice returnTo="/?vy=schema" message="Verifiera med engångskod för att läsa eller publicera skolans schema." />}
    {!busy && !mfa && pending && <Button variant="outline" className="w-fit" onClick={() => void send(pending)}>Kontrollera publiceringen</Button>}
    {!busy && !mfa && !pending && error && <Button variant="outline" className="w-fit" onClick={() => void send({ action: 'status', ...scope })}>Läs publiceringen igen</Button>}
    {canPublish && loaded && !publishedThisDraft && !pending && !mfa && <>
      {!saved && <p className="text-sm text-muted-foreground">Spara ett komplett schemaförslag innan du publicerar.</p>}
      <Button variant="outline" className="w-fit" disabled={!saved || busy || confirming || disabled || !!error} onClick={() => void publish()}>
        Publicera schema…
      </Button>
    </>}
  </section>;
}
