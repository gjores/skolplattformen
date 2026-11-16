'use client';
import { useEffect, useRef, useState } from 'react';
import { ApiError, api } from '@/lib/server-client.ts';
import { parseSchemaSalSvar, schemaSalInputFingerprint, type SchemaSalRequest, type SchemaSalSvar } from '@/lib/schema-salar.ts';

function message(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.reason === 'schema_contract_version') return 'Sidan använder en äldre schemaversion. Läs om sidan och öppna utkastet igen.';
    if (error.code === 'schema_underlag_changed') return 'Underlaget har ändrats. Ta fram ett nytt schemaförslag innan du söker salar.';
    if (error.reason === 'schema_placement_locked_lesson') return 'Passet är låst. Lås upp det innan du väljer en annan sal eller tid.';
    if (error.status === 401 || error.status === 403) return 'Salsökningen kräver en aktuell inloggning och behörighet för skolan.';
    if (error.code === 'schema_fordelning_invalid' && error.issues.length) return error.issues.join(' ');
  }
  return 'Salarna kunde inte kontrolleras. Försök igen. Inget pass har flyttats.';
}
export function useSalSok(request: SchemaSalRequest, rooms: { id: string; name: string }[], onSessionLost?: () => void) {
  const key = schemaSalInputFingerprint(request), active = useRef<AbortController | null>(null);
  const [search, setSearch] = useState<{ key: string; loading: boolean; result: SchemaSalSvar | null; error: string | null } | null>(null);
  useEffect(() => () => active.current?.abort(), [key]);
  const cancel = () => { active.current?.abort(); active.current = null; setSearch(previous => previous ? { ...previous, loading: false } : null); };
  async function run() {
    active.current?.abort(); const controller = new AbortController(); active.current = controller;
    setSearch({ key, loading: true, result: null, error: null });
    try {
      const result = parseSchemaSalSvar(await api.post<unknown>('/api/schema/salar', request, controller.signal), request, rooms);
      if (!controller.signal.aborted) setSearch({ key, loading: false, result, error: null });
    } catch (error) {
      if (controller.signal.aborted || error instanceof DOMException && error.name === 'AbortError') return;
      setSearch({ key, loading: false, result: null, error: message(error) });
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) onSessionLost?.();
    } finally { if (active.current === controller) active.current = null; }
  }
  return { search, stale: search !== null && search.key !== key, run, cancel };
}
