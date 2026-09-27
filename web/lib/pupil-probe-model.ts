// Rena delar av det syntetiska elevprovet (03-05): frågeform, fältlista och CSV.
import { csvRow } from './audit-export.ts';

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

/** Explicit fältlista; ändras bara tillsammans med SQL-returen och provmatrisen. */
export const PROBE_FIELDS = ['id', 'displayName', 'unitId', 'groupIds'] as const;
export const PROBE_CSV_HEADER = ['elev_id', 'namn', 'skolenhet_id', 'grupp_id'] as const;

export type ProbePupil = {
  id: string;
  displayName: string;
  unitId: string;
  groupIds: string[];
};

export type ProbeRead =
  | { form: 'list' }
  | { form: 'pupil'; pupilId: string }
  | { form: 'case'; caseId: string; pupilId: string | null };

export type ProbeScope = {
  function: string;
  scopeKind: 'school' | 'group' | 'pupil' | 'case';
  schools: { id: string; name: string }[];
  cases: { id: string; unitId: string; label: string }[];
  /** Egna grupper vid gruppscope (lärare eller support); saknas i äldre svar. */
  groups?: { id: string; unitId: string; label: string }[];
  startsAt: string | null;
  endsAt: string | null;
  purposeCode: string | null;
  approverName: string | null;
  canExport: boolean;
  serverNow: string;
};

export type ProbeRow = { id: string; display_name: string; unit_id: string; group_ids: unknown };

/** Endast `elev` och `arende`, en gång var, som UUID. Allt annat ger null (400). */
export function parseProbeQuery(url: string): ProbeRead | null {
  const params = new URL(url).searchParams;
  const keys = [...params.keys()];
  if (keys.some((key) => key !== 'elev' && key !== 'arende') || new Set(keys).size !== keys.length) {
    return null;
  }
  const pupilId = params.get('elev');
  const caseId = params.get('arende');
  for (const value of [pupilId, caseId]) {
    if (value !== null && !UUID.test(value)) return null;
  }
  if (caseId) return { form: 'case', caseId, pupilId };
  if (pupilId) return { form: 'pupil', pupilId };
  return { form: 'list' };
}

/** Kopierar endast tillåtna fält; okända kolumner från SQL följer aldrig med. */
export function toProbePupil(row: ProbeRow): ProbePupil {
  return {
    id: row.id,
    displayName: row.display_name,
    unitId: row.unit_id,
    // Endast en verklig lista av ID-strängar godtas; allt annat ger tom lista.
    groupIds: Array.isArray(row.group_ids) ? row.group_ids.filter((value) => typeof value === 'string') : [],
  };
}

export function probeCsv(pupils: ProbePupil[]): string {
  const lines = [
    csvRow(PROBE_CSV_HEADER),
    ...pupils.map((pupil) => csvRow([pupil.id, pupil.displayName, pupil.unitId, pupil.groupIds.join(' ')])),
  ];
  return `﻿${lines.join('\r\n')}\r\n`;
}
