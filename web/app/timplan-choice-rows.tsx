'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseValplanRead } from '@/lib/valplan-contract.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { formatTime } from './tjanst-service-summary';

/** A timplan choice row for the planning school year and the valplan that fills it, if any. */
export type ChoiceRowInfo = { rowKey: string; year: number; schoolYear: number; classNames: string[];
  valplan: { id: string; name: string; courses: { id: string; name: string; points: number; minutesHt: number; minutesVt: number }[] } | null };
export type ChoiceRows = { rows: Map<string, ChoiceRowInfo>; open: (info: ChoiceRowInfo) => void };

/** Reads the school's valplaner once per plan and year. Missing access or data simply shows no choice rows. */
export function useTimplanChoiceRows(target: { unitId: string; timplanId: string; schoolYear: number; year: number } | null, onSessionLost: () => void): Map<string, ChoiceRowInfo> | null {
  const [rows, setRows] = useState<Map<string, ChoiceRowInfo> | null>(null);
  const unitId = target?.unitId ?? null, timplanId = target?.timplanId ?? null, schoolYear = target?.schoolYear ?? null, year = target?.year ?? null;
  const lost = useEffectEvent(() => onSessionLost());
  useEffect(() => {
    if (unitId === null || timplanId === null || schoolYear === null || year === null) { queueMicrotask(() => setRows(null)); return; }
    const controller = new AbortController(), scope = { unitId, schoolYear };
    api.post('/api/valplaner/lasa', scope, controller.signal).then(value => {
      const read = parseValplanRead(value, scope), map = new Map<string, ChoiceRowInfo>();
      for (const row of read.rows.filter(r => r.timplanId === timplanId && r.year === year)) {
        const plan = read.valplans.find(v => v.valplan.id === row.linkedValplanId)?.valplan ?? null;
        map.set(row.rowKey, { rowKey: row.rowKey, year: row.year, schoolYear, classNames: row.classes.map(c => c.name),
          valplan: plan && { id: plan.id, name: plan.name, courses: plan.courses.filter(c => !c.classIds || c.classIds.some(id => row.classIds.includes(id)))
            .map(c => ({ id: c.id, name: c.name, points: c.points, minutesHt: c.minutesHt, minutesVt: c.minutesVt })) } });
      }
      setRows(map);
    }).catch(error => { if (error instanceof ApiError && error.status === 401) lost(); if (!controller.signal.aborted) setRows(null); });
    return () => controller.abort();
  }, [unitId, timplanId, schoolYear, year]);
  return rows;
}

export function ChoiceRowSummary({ info, expanded, controls, onToggle }: { info: ChoiceRowInfo; expanded: boolean; controls: string; onToggle: () => void }) {
  return <button type="button" className="gt-choice-toggle" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>
    {info.valplan ? `Enligt valplanen ${info.valplan.name}` : `Ingen valplan ${planningYearLabel(info.schoolYear)}`}</button>;
}

export function ChoiceRowDetail({ info, id, colSpan, onOpen }: { info: ChoiceRowInfo; id: string; colSpan: number; onOpen: (info: ChoiceRowInfo) => void }) {
  return <tr className="gt-choice-detail" id={id}><td colSpan={colSpan}><div>
    <p>Läsår {planningYearLabel(info.schoolYear)} · årskurs {info.year}{info.classNames.length ? ` · ${info.classNames.join(', ')}` : ' · inga klasser kopplade'}</p>
    {info.valplan ? info.valplan.courses.length ? <ul aria-label={`Kurser i ${info.valplan.name}`}>{info.valplan.courses.map(c =>
      <li key={c.id}><strong>{c.name}</strong> · {c.points} p · HT {formatTime(c.minutesHt)} · VT {formatTime(c.minutesVt)}</li>)}</ul>
      : <p>Valplanen har inga kurser för klasserna ännu.</p>
      : <p>Eleverna väljer kurser i en valplan. Ingen valplan fyller raden detta läsår.</p>}
    <Button size="sm" variant="outline" onClick={() => onOpen(info)}>{info.valplan ? 'Öppna valplanen' : 'Öppna valplaner'}</Button>
  </div></td></tr>;
}
