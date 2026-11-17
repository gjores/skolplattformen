'use client';
// Skolans salregister (05.2-SM-UXF-23): läses när arbetsytan öppnas och sparas direkt på servern. Ingår inte i utkastets Ångra.
import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/server-client.ts';
import { SKOLSALAR_VERSION, parseSkolsalarLasning, parseSkolsalarSvar, type SchemaSkolsalar, type SkolsalarRegister } from '@/lib/skolsalar.ts';

export type Skolsalar = { status: 'laddar' | 'ok' | 'fel'; register: SkolsalarRegister | null; fel: string | null;
  /** Sparar hela registret. `null` om det gick, annars ett besked. */ spara: (document: SchemaSkolsalar) => Promise<string | null>; lasOm: () => void };

function message(error: unknown, sparning: boolean): string {
  if (error instanceof ApiError) {
    if (error.status === 403) return 'Du har inte behörighet till skolans salregister.';
    if (error.status === 409) return 'Någon annan har ändrat skolans salregister. Registret är inläst på nytt; gör ändringen igen.';
    if (error.status === 400) return 'Salregistret kunde inte sparas: uppgifterna godtogs inte.';
  }
  return sparning ? 'Skolans salregister kunde inte sparas. Försök igen.' : 'Skolans salregister kunde inte läsas.';
}

export function useSkolsalar({ unitId, enabled, onSessionLost }: { unitId: string; enabled: boolean; onSessionLost: () => void }): Skolsalar {
  const [state, setState] = useState<{ unitId: string; status: Skolsalar['status']; register: SkolsalarRegister | null; fel: string | null } | null>(null);
  const [attempt, setAttempt] = useState(0), lost = useRef(onSessionLost), current = useRef(state);
  useEffect(() => { lost.current = onSessionLost; current.current = state; });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    void api.post<unknown>('/api/schema/salregister/las', { contractVersion: SKOLSALAR_VERSION, unitId }, controller.signal).then(raw => {
      if (controller.signal.aborted) return;
      const svar = parseSkolsalarLasning(raw);
      if (svar.unitId !== unitId) throw new Error('fel skolenhet');
      setState({ unitId, status: 'ok', register: svar.register, fel: null });
    }).catch(caught => {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
      setState(previous => ({ unitId, status: 'fel', register: previous?.unitId === unitId ? previous.register : null, fel: message(caught, false) }));
    });
    return () => controller.abort();
  }, [enabled, unitId, attempt]);
  const spara = useCallback(async (document: SchemaSkolsalar): Promise<string | null> => {
    const fore = current.current?.unitId === unitId ? current.current.register : null;
    try {
      const svar = parseSkolsalarSvar(await api.post<unknown>('/api/schema/salregister/spara',
        { contractVersion: SKOLSALAR_VERSION, unitId, commandId: crypto.randomUUID(), expectedRevision: fore?.revision ?? 0, document }));
      setState({ unitId, status: 'ok', register: svar.register, fel: null });
      return null;
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) { lost.current(); return 'Sessionen har gått ut.'; }
      if (caught instanceof ApiError && caught.status === 409) setAttempt(n => n + 1);
      return message(caught, true);
    }
  }, [unitId]);
  const aktuell = state?.unitId === unitId ? state : null;
  return { status: !enabled ? 'fel' : aktuell?.status ?? 'laddar', register: aktuell?.register ?? null, fel: aktuell?.fel ?? null, spara, lasOm: () => setAttempt(n => n + 1) };
}
