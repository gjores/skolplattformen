'use client';

import { useEffect, useEffectEvent, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseValplanRead } from '@/lib/valplan-contract.ts';
import { valplanRowStage } from '@/lib/valplan-model.ts';
import { planningYearLabel } from '@/lib/planning-year-model.ts';
import { formatTime } from './tjanst-service-summary';

/** A timplan choice row for the planning school year and the block that fills it, if any. */
export type ChoiceRowInfo = { timplanId: string; rowKey: string; year: number; schoolYear: number; classNames: string[];
  valplan: { id: string; name: string; courses: { id: string; name: string; points: number; minutesHt: number; minutesVt: number }[] } | null };
export type ChoiceRows = { approved: boolean; rows: Map<string, ChoiceRowInfo>; open: (info: ChoiceRowInfo) => void; openClasses: () => void };

/** Reads the school's blocks once per plan and year. Missing access or data simply shows no choice rows. */
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
        map.set(row.rowKey, { timplanId: row.timplanId, rowKey: row.rowKey, year: row.year, schoolYear, classNames: row.classes.map(c => c.name),
          valplan: plan && { id: plan.id, name: plan.name, courses: plan.courses.filter(c => !c.classIds || c.classIds.some(id => row.classIds.includes(id)))
            .map(c => ({ id: c.id, name: c.name, points: c.points, minutesHt: c.minutesHt, minutesVt: c.minutesVt })) } });
      }
      setRows(map);
    }).catch(error => { if (error instanceof ApiError && error.status === 401) lost(); if (!controller.signal.aborted) setRows(null); });
    return () => controller.abort();
  }, [unitId, timplanId, schoolYear, year]);
  return rows;
}

/** The row's stage in words and its one next step. Staff only; everyone sees the row is a valbart block. */
export function ChoiceRowSummary({ choices, rowKey, expanded, controls, onToggle }: { choices: ChoiceRows; rowKey: string; expanded: boolean; controls: string; onToggle: () => void }) {
  const info = choices.rows.get(rowKey);
  if (!choices.approved) return <div className="gt-choice"><p className="status-badge">Kopplas när timplanen är fastställd.</p></div>;
  if (!info) return null;
  const stage = valplanRowStage({ approved: true, classCount: info.classNames.length, linked: info.valplan !== null });
  if (stage === 'noClasses') return <div className="gt-choice"><p className="status-badge">Koppla klasser först.</p>
    <Button size="sm" variant="outline" onClick={choices.openClasses}>Till Klasser och läsår</Button></div>;
  if (stage === 'missing') return <div className="gt-choice"><p className="status-badge">Saknar block {planningYearLabel(info.schoolYear)}</p>
    <Button size="sm" variant="outline" onClick={() => choices.open(info)}>Skapa valbart block</Button></div>;
  return <div className="gt-choice"><p className="status-badge success">Enligt {info.valplan!.name}</p>
    <Button size="sm" variant="outline" onClick={() => choices.open(info)}>Öppna blocket</Button>
    <button type="button" className="gt-choice-toggle" aria-expanded={expanded} aria-controls={controls} onClick={onToggle}>Visa kurser</button></div>;
}

export function ChoiceRowDetail({ info, id, colSpan }: { info: ChoiceRowInfo; id: string; colSpan: number }) {
  return <tr className="gt-choice-detail" id={id}><td colSpan={colSpan}><div>
    <p>Läsår {planningYearLabel(info.schoolYear)} · årskurs {info.year}{info.classNames.length ? ` · ${info.classNames.join(', ')}` : ' · inga klasser kopplade'}</p>
    {info.valplan?.courses.length ? <ul aria-label={`Kurser i ${info.valplan.name}`}>{info.valplan.courses.map(c =>
      <li key={c.id}><strong>{c.name}</strong> · {c.points} p · HT {formatTime(c.minutesHt)} · VT {formatTime(c.minutesVt)}</li>)}</ul>
      : <p>Blocket har inga kurser för klasserna ännu.</p>}
  </div></td></tr>;
}
