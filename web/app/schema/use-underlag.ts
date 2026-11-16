'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/server-client.ts';
import { schemaGrund, villkorNyckel, type SchemaForslag, type SchemaForslagRequest } from '@/lib/schema-contract.ts';
import { parseSchemaUnderlagslasning } from '@/lib/schema-underlagslasning.ts';

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason === 'schema_contract_version') return 'Sidan använder en äldre schemaversion. Läs om sidan för att läsa underlaget.';
    if (error.code === 'schema_fordelning_invalid' && error.issues.length) return `Underlaget kunde inte byggas: ${error.issues.join(' ')}`;
    if (error.status === 403) return 'Du har inte behörighet att läsa skolans underlag för schemat.';
  }
  return 'Underlaget kunde inte läsas. Villkoren går att ändra ändå; klasser, grupper, ämnen och lärare visas när läsningen lyckas.';
}
export type SchemaUnderlagLas = { forslag: SchemaForslag | null; loading: boolean; error: string | null; reload: () => void };

/**
 * Underlaget före första förslaget (05.2-SM-UXF-11). Läses när inget förslag finns och på nytt när grunden i villkoren ändras
 * (det som avgör vilka pass som finns). Tidsvillkor läser inte om. Motorn anropas inte och svaret blir aldrig utkastets bas.
 */
export function useSchemaUnderlag({ enabled, request, onSessionLost }: { enabled: boolean; request: SchemaForslagRequest; onSessionLost: () => void }): SchemaUnderlagLas {
  const scope = `${request.unitId}:${request.schoolYear}:${request.period}`, key = `${scope}:${villkorNyckel(schemaGrund(request.villkor))}`;
  const [state, setState] = useState<{ key: string; scope: string; forslag: SchemaForslag | null; error: string | null } | null>(null), [attempt, setAttempt] = useState(0);
  // Begäran följer med i en ref så att ett ändrat tidsvillkor inte läser om; `key` avgör när läsningen görs.
  const body = useRef(request);
  useEffect(() => { body.current = request; });
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    // Kort väntan så att flera snabba ändringar i formuläret ger en läsning.
    const timer = setTimeout(() => {
      const sent = structuredClone(body.current);
      void api.post<unknown>('/api/schema/underlag', sent, controller.signal).then(raw => {
        if (!controller.signal.aborted) setState({ key, scope, forslag: parseSchemaUnderlagslasning(raw, sent), error: null });
      }).catch(caught => {
        if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) { onSessionLost(); return; }
        setState(previous => ({ key, scope, forslag: previous?.scope === scope ? previous.forslag : null, error: message(caught) }));
      });
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [enabled, key, scope, attempt, onSessionLost]);
  const current = state?.scope === scope ? state : null;
  return { forslag: current?.forslag ?? null, loading: enabled && current?.key !== key, error: enabled && current?.key === key ? current.error : null, reload: () => setAttempt(n => n + 1) };
}
