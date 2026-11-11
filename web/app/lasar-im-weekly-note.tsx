'use client';
// IM-raden i Timplaner (05.1.1-14, LASAR-05, folded todo 2026-10-21). Läser kalenderns
// sammanfattning (POST /api/lasar/sammanfattning) i en egen väg och visar texten ur
// lasarImWeeklyText, så att Timplaner och Tjänstefördelning nämner samma version och
// samma skoldagar. Timplaner räknar inga årstimmar för IM; raden anger bara gällande
// version. Läsfel visar en text utan siffror. SS 12000: kalendern saknar objekt i
// standarden; raden visar inga ID:n.
import { useEffect, useState } from 'react';
import { api } from '@/lib/server-client.ts';
import { parseLasarSummaryReply, type LasarSummaryReply } from '@/lib/lasar-contract.ts';
import { lasarImWeeklyText } from '@/lib/lasar-summary.ts';

type Props = { unitId: string; schoolYear: number };
type State = { key: string; summary: LasarSummaryReply | null; error: boolean };

export default function LasarImWeeklyNote({ unitId, schoolYear }: Props) {
  const key = `${unitId}|${schoolYear}`;
  const [state, setState] = useState<State>({ key: '', summary: null, error: false });

  useEffect(() => {
    const controller = new AbortController();
    const request = { unitId, schoolYear };
    void api.post<unknown>('/api/lasar/sammanfattning', request, controller.signal).then((raw) => {
      const summary = parseLasarSummaryReply(raw, request);
      if (!controller.signal.aborted) setState({ key, summary, error: false });
    }).catch((caught) => {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
      setState({ key, summary: null, error: true });
    });
    return () => controller.abort();
  }, [unitId, schoolYear, key]);

  // Ett svar för en tidigare skola eller ett tidigare läsår visas aldrig.
  const shown = state.key === key ? state : null;
  if (!shown) return <p data-testid="lasar-im-weekly" aria-busy="true">Veckoram. Läser läsårskalendern…</p>;
  if (shown.error) return <p data-testid="lasar-im-weekly">Veckoram. Läsårskalendern kunde inte läsas.</p>;
  return <p data-testid="lasar-im-weekly">{lasarImWeeklyText(shown.summary, schoolYear)}</p>;
}
