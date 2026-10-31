'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import type { TjanstPlanRead, TjanstRow } from '@/lib/tjanst-contract.ts';
import { formatTime } from './tjanst-service-summary';
import { rowTime, type TjanstCellTarget } from './tjanst-matrix';

/** Ett aktivt vägval för ett redan bemannat behov. Här görs inga läs- eller skrivkommandon. */
export default function TjanstMatrixActions({ data, rows, target, description, onClose, onReplace, onAdvanced }: {
  data: TjanstPlanRead; rows: TjanstRow[]; target: Pick<TjanstCellTarget, 'sourceKey' | 'personId' | 'rowId'>; description: string;
  onClose: () => void; onReplace: (row: TjanstRow) => void; onAdvanced: (row: TjanstRow | null) => void;
}) {
  const id = useId();
  const [rowId, setRowId] = useState(target.rowId ?? (rows.length === 1 ? rows[0].id : ''));
  const selected = rows.find(row => row.id === rowId) ?? null;
  const who = (personId: string | null) => data.teachers.find(t => t.personId === personId)?.displayName ?? 'Läraren';
  const groups = new Set(rows.flatMap(row => row.jointGroupId ? [row.jointGroupId] : []));
  const targetName = target.personId && !rows.some(row => row.personId === target.personId) ? who(target.personId) : null;
  return <Dialog open onOpenChange={value => { if (!value) onClose(); }}>
    <DialogContent className="admin-dialog tjanst-dialog tjanst-matrix-actions">
      <DialogTitle>Vad vill du göra?</DialogTitle><DialogDescription>{description}</DialogDescription>
      <p>Redan tilldelat: {[...new Set(rows.map(row => who(row.personId)))].join(', ')}.</p>
      {rows.length > 1 && <label className="tjanst-field" htmlFor={id}>Tilldelning att byta<select id={id} value={rowId} onChange={event => setRowId(event.target.value)}>
        <option value="">Välj nuvarande lärare</option>{rows.map(row => { const time = rowTime(row, data.joints); return <option key={row.id} value={row.id}>{who(row.personId)} · HT {formatTime(time.ht)} · VT {formatTime(time.vt)}{row.jointGroupId ? ' · samläsning' : ''}</option>; })}
      </select></label>}
      <div className="tjanst-matrix-action-choices">
        <Button disabled={!selected} onClick={() => { if (selected) onReplace(selected); }}>Byt lärare</Button>
        <p>{targetName ? `Byt till ${targetName}.` : 'Välj en annan lärare.'} Tiderna behålls. {selected?.jointGroupId ? 'Bytet gäller hela samläsningen och förhandsvisas före sparning.' : 'Du sparar bytet i nästa steg.'}</p>
        <Button variant="outline" disabled={groups.size > 0 && rows.length > 1 && !selected} onClick={() => onAdvanced(selected)}>Avancerade val</Button>
        <p>Justera tid, delning eller andra uppgifter.</p>
      </div>
      <Button variant="ghost" onClick={onClose}>Avbryt</Button>
    </DialogContent>
  </Dialog>;
}
