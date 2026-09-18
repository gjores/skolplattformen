'use client';

import { useState } from 'react';
import { contextLabel, type AssignmentView } from '@/lib/access-rules.ts';
import { api, ApiError, setKnownEpoch } from '@/lib/server-client.ts';
import { announce, messageText } from '@/lib/session-channel.ts';
import { confirmDiscard, useHasUnsaved } from '@/lib/unsaved-changes.tsx';

export type SessionAssignment = AssignmentView & {
  organizerId: string | null;
  unitId: string | null;
  state: 'giltigt' | 'kommande' | 'avslutat';
  label: string;
  blocked: boolean;
};

export type AssignmentGroups = {
  valid: SessionAssignment[];
  upcoming: SessionAssignment[];
  ended: SessionAssignment[];
};

export type ActiveContext = {
  assignmentId: string;
  membershipId: string;
  customerId: string;
  customerName: string;
  organizerId: string | null;
  organizerName: string | null;
  unitId: string | null;
  unitName: string | null;
  function: SessionAssignment['function'];
  label: string;
  blocked: boolean;
  valid: boolean;
};

type Props = {
  context: ActiveContext | null;
  assignments: AssignmentGroups;
  onChanged: (context: ActiveContext, epoch: number) => void | Promise<void>;
};

type ContextResponse = { epoch: number; context: ActiveContext };

function endedText(assignment: SessionAssignment): string {
  return assignment.validTo ?? assignment.endedAt?.slice(0, 10) ?? 'okänt datum';
}

export default function ContextSwitch({ context, assignments, onChanged }: Props) {
  const hasUnsaved = useHasUnsaved();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [shownValue, setShownValue] = useState(context?.assignmentId ?? '');
  const activeValue = context?.assignmentId ?? '';
  const selectedValue = busy || error !== null ? shownValue : activeValue;

  async function change(assignmentId: string) {
    if (!assignmentId || assignmentId === activeValue) return;
    if (hasUnsaved && !confirmDiscard()) {
      setShownValue(activeValue);
      return;
    }
    setShownValue(assignmentId);
    setError(null);
    setBusy(true);
    try {
      const result = await api.post<ContextResponse>('/api/context', { assignmentId });
      setKnownEpoch(result.epoch);
      await onChanged(result.context, result.epoch);
      // Läs in epoken före signalen; BroadcastChannel kan annars låsa avsändarfliken.
      announce({ type: 'epoch', epoch: result.epoch });
    } catch (caught) {
      setShownValue(activeValue);
      if (caught instanceof ApiError) setError(messageText(caught.code));
      else if (!(caught instanceof DOMException && caught.name === 'AbortError')) {
        setError('Uppdraget kunde inte väljas. Försök igen.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="context-switch">
      <label htmlFor="uppdrag" className="sr-only-or-visible">
        Uppdrag
      </label>
      <select
        id="uppdrag"
        className="og-unit-switch"
        value={selectedValue}
        disabled={busy}
        onChange={(event) => void change(event.target.value)}
      >
        {!activeValue && <option value="">Välj uppdrag</option>}
        {assignments.valid.length > 0 && (
          <optgroup label="Gäller idag">
            {assignments.valid.map((assignment) => (
              <option key={assignment.id} value={assignment.id}>
                {contextLabel(assignment)}
              </option>
            ))}
          </optgroup>
        )}
        {assignments.upcoming.length > 0 && (
          <optgroup label="Kommande">
            {assignments.upcoming.map((assignment) => (
              <option key={assignment.id} value={assignment.id} disabled>
                {contextLabel(assignment)} (från {assignment.validFrom})
              </option>
            ))}
          </optgroup>
        )}
        {assignments.ended.length > 0 && (
          <optgroup label="Avslutade">
            {assignments.ended.map((assignment) => (
              <option key={assignment.id} value={assignment.id} disabled>
                {contextLabel(assignment)}{' '}
                {assignment.blocked ? '(spärrat)' : `(till ${endedText(assignment)})`}
              </option>
            ))}
          </optgroup>
        )}
      </select>
      {busy && <output>Byter uppdrag…</output>}
      {error && <output role="alert">{error}</output>}
    </div>
  );
}
