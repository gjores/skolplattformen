'use client';
// Veckans möjlighetskarta använder samma serverprövning och samma färg-/textmönster som Följ passet.
import { useEffect, useRef, useState } from 'react';
import { api, ApiError } from '@/lib/server-client.ts';
import { SCHEMA_CONTRACT_VERSION, villkorNyckel, type SchemaForslag, type SchemaPlacement, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { parseSchemaLagen, varfor, type SchemaLagen } from '@/lib/schema-lagen.ts';
import type { SchemaOverlay } from '@/lib/schema-utkast.ts';
import { LAGE } from './mojligt.tsx';
import { lagesfalt } from '@/lib/schema-lagesfalt.ts';

/** Fältets text i veckan och teckenförklaringen. */
export const FRI_UTAN_SAL = 'Fri tid, men passet blir utan sal';

type Props = { forslag: SchemaForslag | null; villkor: SchemaVillkor; lesson: string | null; placements: SchemaPlacement[]; userLocks?: SchemaPlacement[]; unitId: string; schoolYear: number; onSessionLost: () => void };
export function useSchemaBytLagen({ forslag, villkor, lesson, placements, userLocks = [], unitId, schoolYear, onSessionLost }: Props) {
  const key = JSON.stringify(placements), rules = villkorNyckel(villkor), fingerprint = forslag?.grundFingerprint ?? '', period = forslag?.period ?? 'lasar';
  const locks = JSON.stringify(userLocks);
  const query = `${fingerprint}|${lesson}|${key}|${rules}|${locks}`;
  const [reply, setReply] = useState<{ query: string; lagen: SchemaLagen | null; error: string | null } | null>(null);
  const lost = useRef(onSessionLost);
  useEffect(() => { lost.current = onSessionLost; });
  useEffect(() => {
    if (!lesson || !fingerprint) return;
    const controller = new AbortController();
    api.post<unknown>('/api/schema/lagen', { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, villkor: JSON.parse(rules) as SchemaVillkor,
      grundFingerprint: fingerprint, ...(locks !== '[]' ? { locks: { grundFingerprint: fingerprint, placements: JSON.parse(locks) as SchemaPlacement[] } } : {}), placements: JSON.parse(key) as SchemaPlacement[], lesson, pupilId: null }, controller.signal)
      .then(value => { if (!controller.signal.aborted) setReply({ query, lagen: parseSchemaLagen(value, fingerprint, lesson), error: null }); })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (error instanceof ApiError && error.status === 401) { lost.current(); return; }
        setReply({ query, lagen: null, error: error instanceof ApiError && error.status === 403 ? 'Ditt uppdrag tillåter inte att läsa möjliga starttider.' : 'Möjliga starttider kunde inte hämtas. Flytten prövas när den görs.' });
      });
    return () => controller.abort();
  }, [lesson, fingerprint, key, rules, period, unitId, schoolYear, query, locks]);
  const lagen = lesson && reply?.query === query ? reply.lagen : null;
  // Sammanhängande fält (05.2-SM-UXF-42): starttider i följd med samma läge ritas som ett fält. Den exakta startens orsaker står i panelen för valt pass.
  // Med salregister (05.2-SM-UXF-43) är en fri tid där passets egen sal inte är ledig ett eget, lättare fält: passet blir utan sal där.
  const egen = villkor.salregister && lesson ? placements.find(p => p.lesson === lesson)?.room ?? null : null;
  const utanSal = (p: { room: string | null }) => egen !== null && p.room === null;
  const salNamn = egen ? forslag?.rooms.find(r => r.id === egen)?.name || 'Salen' : '';
  const overlays: SchemaOverlay[] = lagen ? lagesfalt(lagen.positions.map(p => ({ ...p, state: p.state === 'fri' && utanSal(p) ? 'fri-utan-sal' as const : p.state })), forslag?.startGridMin ?? 5)
    .map(f => ({ day: f.day, startMin: f.startMin, endMin: f.endMin, kind: f.state, label: f.state === 'fri-utan-sal' ? FRI_UTAN_SAL : LAGE[f.state] })) : [];
  const status = (to: { day: number | null; startMin: number | null } | null): string => {
    const p = to && lagen?.positions.find(p => p.day === to.day && p.startMin === to.startMin);
    if (!p || !forslag || !lesson) return '';
    const lines = varfor(lesson, p, { ...forslag, placements });
    return [lines[0], ...(utanSal(p) ? [`${salNamn} är inte ledig då. Passet blir utan sal.`] : []), ...lines.slice(1)].join(' ');
  };
  return { lagen, overlays, status, loading: !!lesson && reply?.query !== query, error: lesson && reply?.query === query ? reply.error : null };
}
