'use client';
// Markering om ny kalenderversion i Tjänstefördelning (05.1.1-14, D-11, LASAR-05, UI-SPEC avsnitt 15).
// Läser kalenderns sammanfattning (POST /api/lasar/sammanfattning) i en egen väg, bara när någon IM-rad
// (needBasis weekly_calendar) är inaktuell. Visas när den gällande versionen har en föregående fastställd
// version. Markören skickar aldrig något kommando. *Använd version {n}* lämnar de berörda raderna till
// Tjänstefördelningen, som öppnar den befintliga raddialogen för en rad i taget (användarbeslut
// 2026-11-11, alternativ a); inget sparas förrän användaren sparar raden där. Tjänstefördelningens tolkar
// ändras inte (Pitfall 7). En rad som är inaktuell av en annan orsak får också markeringen, eftersom
// raderna inte sparar vilken kalenderversion de räknades med. SS 12000: inga standardobjekt, inga ID:n i texten.
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/server-client.ts';
import { parseLasarSummaryReply, type LasarSummaryReply } from '@/lib/lasar-contract.ts';
import { formatDate } from '@/lib/lasar-model.ts';
import { lasarBasisChange, lasarBasisText, lasarYearLabel } from '@/lib/lasar-summary.ts';
import type { TjanstClass, TjanstRow } from '@/lib/tjanst-contract.ts';
import './protected-timplan.css';

type Props = {
  unitId: string;
  schoolYear: number;
  rows: readonly TjanstRow[];
  /** Klassernas namn och behov, för listan i *Visa skillnaden*. */
  classes: readonly TjanstClass[];
  /** Saknas utan skrivförmåga (huvudman, telefon, historik); då visas bara texten och *Visa skillnaden*. */
  onUse?: (rows: TjanstRow[], from: HTMLElement) => void;
};
type State = { key: string; summary: LasarSummaryReply | null };

const isAffected = (row: TjanstRow) => row.stale && row.needBasis === 'weekly_calendar';

export default function LasarBasisMarker({ unitId, schoolYear, rows, classes, onUse }: Props) {
  const hasAffected = rows.some(isAffected);
  const key = `${unitId}|${schoolYear}`;
  const [state, setState] = useState<State>({ key: '', summary: null });
  const [showDiff, setShowDiff] = useState(false);

  useEffect(() => {
    if (!hasAffected) return;
    const controller = new AbortController();
    const request = { unitId, schoolYear };
    void api.post<unknown>('/api/lasar/sammanfattning', request, controller.signal).then((raw) => {
      const summary = parseLasarSummaryReply(raw, request);
      if (!controller.signal.aborted) setState({ key, summary });
    }).catch(() => {
      // Ett läsfel döljer markeringen; radernas egen markering om inaktuellt underlag finns kvar i matrisen.
      if (!controller.signal.aborted) setState({ key, summary: null });
    });
    return () => controller.abort();
  }, [unitId, schoolYear, key, hasAffected]);

  const summary = state.key === key ? state.summary : null;
  const change = hasAffected ? lasarBasisChange(summary, rows) : null;
  if (!change) return null;
  const { before, after } = change;
  const count = change.rows.length;
  const rowLabel = (row: TjanstRow) => {
    const cls = classes.find((c) => c.classId === row.classId);
    const need = cls?.needs.find((n) => n.sourceKey === row.sourceKey);
    return `${cls?.name ?? 'Klass'} · ${need?.label ?? row.rowKey}`;
  };

  return (
    <section className="pt-year-context" data-testid="lasar-basis-marker" aria-label="Ny version av läsårskalendern">
      <p>{lasarBasisText(change)}</p>
      <p>
        {count === 1 ? 'En rad räknar med den äldre versionen.' : `${count} rader räknar med den äldre versionen.`}
        {onUse ? ` Använd version ${after.version} öppnar en rad i taget. Inget räknas om förrän du sparar raden.` : ' Inget räknas om automatiskt.'}
      </p>
      <div className="mandate-actions">
        <Button type="button" variant="outline" onClick={() => setShowDiff(true)}>Visa skillnaden</Button>
        {onUse && <Button type="button" variant="outline" onClick={(e) => onUse(change.rows, e.currentTarget)}>Använd version {after.version}</Button>}
      </div>
      {showDiff && (
        <Dialog open onOpenChange={(open) => { if (!open) setShowDiff(false); }}>
          <DialogContent className="mandate-dialog tjanst-dialog" showCloseButton={false}>
            <DialogTitle>Skillnad mellan kalenderversionerna</DialogTitle>
            <DialogDescription>Läsårskalendern {lasarYearLabel(schoolYear)}. Inget räknas om förrän du sparar en rad.</DialogDescription>
            <table className="w-full text-sm" data-testid="lasar-basis-diff">
              <thead>
                <tr>
                  <th scope="col" className="text-left">Skoldagar</th>
                  <th scope="col" className="text-left">Version {before.version}, {formatDate(before.decidedOn, true)}</th>
                  <th scope="col" className="text-left">Version {after.version}, {formatDate(after.decidedOn, true)}</th>
                </tr>
              </thead>
              <tbody>
                <tr><th scope="row" className="text-left">HT</th><td>{before.htSchoolDays}</td><td>{after.htSchoolDays}</td></tr>
                <tr><th scope="row" className="text-left">VT</th><td>{before.vtSchoolDays}</td><td>{after.vtSchoolDays}</td></tr>
                <tr><th scope="row" className="text-left">Hela läsåret</th><td>{before.schoolDays}</td><td>{after.schoolDays}</td></tr>
              </tbody>
            </table>
            <h3>Berörda rader</h3>
            <ul data-testid="lasar-basis-rows">{change.rows.map((row) => <li key={row.id}>{rowLabel(row)}</li>)}</ul>
            <p className="text-muted-foreground">En rad kan också vara inaktuell av en annan orsak, till exempel en ändrad timplanskoppling.</p>
            <div className="mandate-actions"><Button type="button" variant="outline" onClick={() => setShowDiff(false)}>Stäng</Button></div>
          </DialogContent>
        </Dialog>
      )}
    </section>
  );
}
