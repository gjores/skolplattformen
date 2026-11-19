'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/server-client.ts';
import {
  NATIONELLA_PROV_VERSION, parseNationellaProvDocument, parseNationellaProvRegister, parseNationellaProvUnderlag, skapaProvId,
  type NationellaProvDocument, type NationellaProvRegister, type NationellaProvUnderlag,
} from '@/lib/nationella-prov.ts';

type State = { register: NationellaProvRegister | null; underlag: NationellaProvUnderlag | null };
type Pending = { commandId: string; expectedRevision: number; document: NationellaProvDocument; key: string };

export function useNationellaProv({ unitId, schoolYear, enabled, onSessionLost }: {
  unitId: string; schoolYear: number; enabled: boolean; onSessionLost: () => void;
}) {
  const [state, setState] = useState<State | null>(null), [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState(true), [saving, setSaving] = useState(false), [error, setError] = useState<string | null>(null);
  const [readFailed, setReadFailed] = useState(false), [needsReload, setNeedsReload] = useState(false);
  const pending = useRef<Pending | null>(null), inFlight = useRef(false), mustReload = useRef(false);
  const lost = useRef(onSessionLost);
  useEffect(() => { lost.current = onSessionLost; }, [onSessionLost]);
  const onReload = useCallback(() => {
    if (inFlight.current) return;
    setReading(true); setError(null); setAttempt(n => n + 1);
  }, []);
  useEffect(() => {
    if (!enabled || inFlight.current) return;
    const abort = new AbortController();
    setReading(true); setError(null);
    void api.post<{ contractVersion: unknown; unitId: unknown; schoolYear: unknown; register: unknown; underlag: unknown }>(
      '/api/lasar/nationella-prov/lasa', { contractVersion: NATIONELLA_PROV_VERSION, unitId, schoolYear }, abort.signal,
    ).then(raw => {
      if (abort.signal.aborted) return;
      if (raw.contractVersion !== NATIONELLA_PROV_VERSION || raw.unitId !== unitId || raw.schoolYear !== schoolYear) throw new Error();
      const register = parseNationellaProvRegister(raw.register, schoolYear), underlag = parseNationellaProvUnderlag(raw.underlag, schoolYear);
      pending.current = null; mustReload.current = false;
      setState({ register, underlag }); setError(null); setReadFailed(false); setNeedsReload(false);
    }).catch(caught => {
      if (abort.signal.aborted) return;
      mustReload.current = true;
      if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
      setReadFailed(true); setNeedsReload(true);
      setError('Provplanen kunde inte läsas. Läs in den igen.');
    }).finally(() => { if (!abort.signal.aborted) setReading(false); });
    return () => abort.abort();
  }, [unitId, schoolYear, enabled, attempt]);

  async function onSave(document: NationellaProvDocument): Promise<boolean> {
    if (!state || inFlight.current || mustReload.current || reading) return false;
    let normalized: NationellaProvDocument;
    try { normalized = parseNationellaProvDocument(document, schoolYear); }
    catch { setError('Kontrollera provuppgifterna, datumet och att tiderna följer femminuterssteg.'); return false; }
    const key = JSON.stringify(normalized), previous = pending.current;
    if (previous && previous.key !== key) {
      setError('Det senaste sparandet saknar kvittens. Läs in provplanen innan du sparar andra ändringar.');
      return false;
    }
    const next = previous ?? { commandId: skapaProvId(), expectedRevision: state.register?.revision ?? 0, document: normalized, key };
    pending.current = next; inFlight.current = true;
    setSaving(true); setError(null);
    try {
      const { commandId, expectedRevision } = next;
      const svar = await api.post<{ contractVersion: unknown; unitId: unknown; schoolYear: unknown; register: unknown; replayed: unknown }>(
        '/api/lasar/nationella-prov/spara', { contractVersion: NATIONELLA_PROV_VERSION, unitId, schoolYear, commandId, expectedRevision, document: next.document });
      const saved = parseNationellaProvRegister(svar.register, schoolYear);
      if (svar.contractVersion !== NATIONELLA_PROV_VERSION || svar.unitId !== unitId || svar.schoolYear !== schoolYear
        || typeof svar.replayed !== 'boolean' || !saved || saved.revision !== expectedRevision + 1 || JSON.stringify(saved.document) !== key) throw new Error();
      pending.current = null;
      setState({ ...state, register: saved });
      return true;
    } catch (caught) {
      if (caught instanceof ApiError) {
        if (caught.status === 401) { lost.current(); return false; }
        if (caught.status === 409) {
          pending.current = null;
          if (caught.reason === 'nationella_prov_katalog_mapping_invalid') {
            setError('Välj en undervisning och provtid som stämmer med katalogprovet.');
            return false;
          }
          mustReload.current = true;
          setNeedsReload(true);
          setError(caught.reason === 'nationella_prov_katalog_changed'
            ? 'Provkatalogen har ändrats. Läs om provplanen och välj provet på nytt i Läsår & skoldagar.'
            : caught.reason === 'nationella_prov_underlag_changed'
              ? 'Uppgifterna stämmer inte längre med skolans underlag. Läs in provplanen och kontrollera bokningen.'
              : 'Provplanen har ändrats. Läs in den nya versionen innan du sparar igen.');
          return false;
        }
        if (caught.status === 400 || caught.status === 403) {
          pending.current = null;
          setError(caught.status === 403 ? 'Du har inte behörighet att spara skolans provplan.' : 'Provuppgifterna kunde inte sparas. Kontrollera bokningen.');
          return false;
        }
      }
      setError('Sparandet saknar kvittens. Försök spara igen eller läs in den sparade provplanen.');
      return false;
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }
  return { document: state?.register?.document ?? null, underlag: state?.underlag ?? null, reading, saving, error, readFailed, needsReload, onSave, onReload };
}
