'use client';
// Samma inloggning, men en ny behörighetskontroll per fönster. Inga mandat tas från öppnaren eller synkmeddelanden.
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError, onEpochChange, setKnownEpoch } from '@/lib/server-client.ts';
import { onSessionMessage } from '@/lib/session-channel.ts';
import { parseFonsterTarget } from '@/lib/schema-synk.ts';
import SchemaWorkspace from '../schema-workspace';

type Target = NonNullable<ReturnType<typeof parseFonsterTarget>>;
type Access = { unitId: string; schoolYear: number; scopeKey: string };
export function UtlyftSchema() {
  const search = useSyncExternalStore(callback => { window.addEventListener('popstate', callback); return () => window.removeEventListener('popstate', callback); }, () => window.location.search, () => '');
  const target: Target | null = useMemo(() => parseFonsterTarget(new URLSearchParams(search)), [search]);
  const [access, setAccess] = useState<Access | null>(null), [error, setError] = useState(''), [loading, setLoading] = useState(true), [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null), locked = useRef(false), validScope = useRef<string | null>(null);
  useEffect(() => {
    if (!target) return;
    let cancelled = false;
    const verify = async () => {
      request.current?.abort(); const controller = new AbortController(); request.current = controller;
      // Töm vyn och stäng dess kanal medan en ändrad kontext kontrolleras.
      setLoading(true); setAccess(null); locked.current = false;
      try {
        const session = await api.get<{ epoch: number }>('/api/session', controller.signal);
        if (!Number.isSafeInteger(session.epoch) || session.epoch < 0) throw new Error('session');
        setKnownEpoch(session.epoch);
        const next = await api.post<Access>('/api/schema/fonster', { unitId: target.unitId, schoolYear: target.schoolYear }, controller.signal);
        if (cancelled || controller.signal.aborted || locked.current) return;
        if (next.unitId !== target.unitId || next.schoolYear !== target.schoolYear || typeof next.scopeKey !== 'string' || !next.scopeKey.startsWith(`${session.epoch}:`)) throw new Error('scope');
        if (validScope.current !== null && validScope.current !== next.scopeKey) {
          locked.current = true; setError('Ditt uppdrag har ändrats. Öppna vyn igen från huvudfönstret.'); return;
        }
        validScope.current = next.scopeKey; setAccess(next); setError('');
      } catch (caught) {
        if (cancelled || controller.signal.aborted) return;
        setAccess(null); setError(caught instanceof ApiError && caught.status === 401 ? 'Logga in igen och öppna vyn från huvudfönstret.' : 'Vyn kunde inte öppnas med ditt aktuella uppdrag. Läs om för att kontrollera behörigheten igen.');
      } finally { if (!cancelled && request.current === controller) setLoading(false); }
    };
    const revoke = () => { locked.current = true; request.current?.abort(); setAccess(null); setLoading(false); setError('Ditt uppdrag eller din inloggning har ändrats. Öppna vyn igen från huvudfönstret.'); };
    const epochOff = onEpochChange(revoke), sessionOff = onSessionMessage(revoke);
    const focus = () => { if (!locked.current) void verify(); };
    const visibility = () => { if (document.visibilityState === 'visible') focus(); };
    window.addEventListener('focus', focus); document.addEventListener('visibilitychange', visibility);
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible' && !locked.current) void verify(); }, 30000);
    void verify();
    return () => { cancelled = true; request.current?.abort(); epochOff(); sessionOff(); window.removeEventListener('focus', focus); document.removeEventListener('visibilitychange', visibility); clearInterval(timer); };
  }, [target, retry]);
  if (search === '' || target && loading) return <main className="p-4"><output>Kontrollerar ditt uppdrag för schemavyn…</output></main>;
  if (!target) return <main className="p-4"><h1 className="page-title">Schemavyn kan inte öppnas</h1><p>Öppna ett nytt fönster från schemats arbetsyta.</p></main>;
  if (!access || error) return <main className="p-4"><div className="empty-state"><h1>Schemavyn är stängd</h1><p role="alert">{error || 'Öppna vyn från huvudfönstret.'}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>Läs om behörigheten</Button></div></main>;
  return <main className="p-4"><SchemaWorkspace unitId={target.unitId} schoolYear={target.schoolYear} scopeKey={access.scopeKey} fonster={target.fonster} onSessionLost={() => { setAccess(null); setError('Logga in igen och öppna vyn från huvudfönstret.'); }}/></main>;
}
