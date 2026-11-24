'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { SchemaSparko, schemaSparinnehall, schemaSparnyckel, type SchemaSparinnehall, type SchemaSparstatus } from '@/lib/schema-spara.ts';
import type { SchemaDraft, SchemaDraftSave, SchemaDraftScope } from '@/lib/schema-draft-contract.ts';

export function useSchemaSpara({ scope, enabled, snapshot, onLoad, onSessionLost }: {
  scope: SchemaDraftScope; enabled: boolean; snapshot: SchemaSparinnehall; onLoad: (draft: SchemaDraft | null) => void; onSessionLost: () => void;
}) {
  const [state, setState] = useState<SchemaSparstatus>({ phase: 'loading', dirty: false, revision: 0, savedAt: null, message: null });
  const [acknowledgedKey, setAcknowledgedKey] = useState<string | null>(null);
  const [draftId, setDraftId] = useState<string | null>(null);
  const [contentHash, setContentHash] = useState<string | null>(null);
  const [readyFor, setReadyFor] = useState<string | null>(null), [reload, setReload] = useState(0);
  const queue = useRef<SchemaSparko | null>(null), waiting = useRef<string | null>(null);
  const latest = useRef({ snapshot, onLoad, onSessionLost });
  useEffect(() => { latest.current = { snapshot, onLoad, onSessionLost }; });
  const key = `${scope.unitId}:${scope.schoolYear}:${scope.period}`;
  const identity = `${key}:${reload}`, ready = readyFor === identity;
  const { contractVersion, unitId, schoolYear, period } = scope;
  useEffect(() => {
    if (!enabled) return;
    let current = true;
    waiting.current = null;
    const abort = new AbortController();
    const post = async (path: string, input: unknown) => {
      try { return await api.post<unknown>(path, input, abort.signal); }
      catch (error) { if (current && error instanceof ApiError && error.status === 401) latest.current.onSessionLost(); throw error; }
    };
    const value = new SchemaSparko({ contractVersion, unitId, schoolYear, period }, {
      read: input => post('/api/schema/utkast/las', input), save: input => post('/api/schema/utkast/spara', input), status: input => post('/api/schema/utkast/status', input),
    }, (value, acknowledged, id, hash) => { if (current) { setState(value); setAcknowledgedKey(acknowledged); setDraftId(id); setContentHash(hash); } });
    queue.current = value;
    void value.load().then(draft => {
      if (!current) return;
      const { datedActivities: _datedActivities, datedActivityDefinitions: _datedActivityDefinitions, ...initial } = latest.current.snapshot;
      waiting.current = schemaSparnyckel(draft ? schemaSparinnehall(draft) : { ...initial, name: 'Schemautkast', basisVillkor: null, grundFingerprint: null, placements: [], locks: [], intentional: [], datedOverrides: [] });
      latest.current.onLoad(draft);
      // onLoad gör en React-commit. Först dess matchande snapshot får skickas till kön.
      setReadyFor(identity);
    }).catch(() => { /* Kön visar läsfelet; inga skrivningar startas. */ });
    return () => { current = false; value.dispose(); abort.abort(); if (queue.current === value) queue.current = null; waiting.current = null; };
  }, [contractVersion, unitId, schoolYear, period, enabled, identity]);
  const snapshotKey = schemaSparnyckel(snapshot);
  useEffect(() => {
    if (!enabled || !ready || !queue.current) return;
    if (waiting.current !== null) {
      if (waiting.current !== snapshotKey) return;
      waiting.current = null;
    }
    queue.current.update(latest.current.snapshot);
    if (queue.current.state.phase !== 'idle' || !queue.current.state.dirty) return;
    const timeout = window.setTimeout(() => { void queue.current?.flush(); }, 750);
    return () => window.clearTimeout(timeout);
  }, [enabled, ready, snapshotKey]);
  const dirty = ready && (state.dirty || snapshotKey !== acknowledgedKey);
  useUnsavedChanges(`schema:${key}`, enabled && dirty);
  const flush = useCallback(async () => {
    if (!queue.current || waiting.current !== null) return false;
    queue.current.update(latest.current.snapshot);
    return queue.current.flush();
  }, []);
  const acceptNewBasis = useCallback(() => queue.current?.acceptNewBasis(), []);
  const pause = useCallback((value: boolean) => queue.current?.pause(value), []);
  const revisionEfterSkrivning = () => queue.current?.revisionEfterSkrivning() ?? Promise.resolve(null);
  const apply = useCallback(async (input: SchemaDraftSave, signal: AbortSignal) => {
    const value = queue.current;
    if (!value) throw new Error('schema_revision_changed');
    const draft = await value.apply(input, signal);
    if (queue.current !== value) throw new Error('schema_revision_changed');
    const expected = schemaSparnyckel(schemaSparinnehall(draft));
    waiting.current = expected === schemaSparnyckel(latest.current.snapshot) ? null : expected;
    return draft;
  }, []);
  const read = useCallback(() => setReload(value => value + 1), []);
  const visible: SchemaSparstatus = { ...state, dirty, phase: state.phase === 'saved' && dirty ? 'idle' : state.phase };
  return { state: visible, ready: !enabled || ready, draftId: enabled && ready ? draftId : null,
    contentHash: enabled && ready ? contentHash : null, snapshotKey, flush, read, acceptNewBasis, pause, apply, revisionEfterSkrivning };
}
