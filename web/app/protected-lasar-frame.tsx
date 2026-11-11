'use client';
// Huvudmannens ram i skyddad drift (fas 05.1.1, plan 05; UI-SPEC avsnitt 11,
// A-05, A-06, A-12; D-02, D-05, D-06, D-08, D-13). Jämförelsen räknas med de
// rena funktionerna i lasar-frame.ts. Inget i skolans kalender ändras förrän
// rektorn har bekräftat *Ta in ramens ändringar*; dialogens säkra knapp
// *Behåll skolans kalender* skickar ingenting. Huvudmannen ser skillnaderna
// men får inga knappar för skolans räkning.
import { useRef, useState, type ReactNode } from 'react';
import { AlertTriangle, Send } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { frameChanges, frameDeviation, type FrameChange, type FrameChanges, type FrameDeviation, type FrameKey, type FrameValue } from '@/lib/lasar-frame.ts';
import type { LasarFrameRef, LasarFrameState } from '@/lib/lasar-contract.ts';
import { formatDate, formatLong, type ISODate, type SchoolYear, type Summary } from '@/lib/lasar-model.ts';
import { num } from './lasar-calendar.tsx';

const TERM_LABEL: Record<string, string> = { 'term:ht:start': 'HT börjar', 'term:ht:end': 'HT slutar', 'term:vt:start': 'VT börjar', 'term:vt:end': 'VT slutar' };
const isTerm = (key: FrameKey) => key.startsWith('term:');
const dateOf = (key: FrameKey) => key.slice(4) as ISODate;

/** Dagens status i text: skoldag, lovdag eller studiedag med anteckning. */
export function frameValueText(value: FrameValue): string {
  if (value === null) return 'skoldag';
  if (typeof value === 'string') return formatDate(value, true);
  return value.note ? `${value.kind} (${value.note})` : value.kind;
}
function keyLabel(key: FrameKey): string {
  return isTerm(key) ? TERM_LABEL[key] : formatLong(dateOf(key));
}

export type FrameComparison = {
  /** Ramversionen som skolans avvikelser räknas mot (D-06): den senast utgivna, annars skolans bas. */
  reference: LasarFrameRef;
  /** Ramversionen skolan utgick från eller senast tog in (`frame.current`); bas för ramens ändringar (D-05). */
  base: LasarFrameRef | null;
  latest: LasarFrameRef | null;
  deviation: FrameDeviation[];
  days: Map<ISODate, FrameDeviation>;
  terms: Map<string, FrameDeviation>;
  /** Ramen har getts ut på nytt och skolan har inte tagit in eller kvitterat den (D-05). */
  pending: boolean;
  changes: FrameChanges | null;
};

/**
 * Skola utan ramversion (D-15: började i eget förslag, eller kopierade förra läsåret i arbetssättet ram).
 * Utan bas går det inte att skilja ramens ändringar från skolans egna, så varje skillnad är ett val
 * som rektorn kryssar i; inget tas in utan uttryckligt val (samma regel som servern, plan 10).
 */
export function frameChangesWithoutBase(theirs: LasarFrameRef, ours: SchoolYear): FrameChanges {
  return { apply: [], conflicts: frameDeviation(ours, theirs).map((d) => ({ key: d.key, base: d.school, theirs: d.frame, ours: d.school })), own: [] };
}

/**
 * D-05, D-06: skolans avvikelser från ramen och, om ramen har ändrats, vad som kan tas in.
 * Avvikelserna räknas mot den senast utgivna ramen, så att skillnader som skolan behöll med
 * *Behåll skolans kalender* står kvar som avvikelser. Ramens ändringar räknas mot skolans bas
 * (`frame.current`), som servern bara flyttar när ändringar tas in; kvitteringen flyttar bara
 * `acknowledgedVersionId`.
 */
export function compareWithFrame(sy: SchoolYear, frame: LasarFrameState | null): FrameComparison | null {
  if (!frame) return null;
  const base = frame.current;
  const latest = frame.latest;
  const reference = latest ?? base;
  if (!reference) return null;
  const deviation = frameDeviation(sy, reference);
  const pending = Boolean(latest && latest.versionId !== frame.acknowledgedVersionId && (!base || latest.version > base.version));
  return {
    reference,
    base,
    latest,
    deviation,
    days: new Map(deviation.filter((d) => !isTerm(d.key)).map((d) => [dateOf(d.key), d])),
    terms: new Map(deviation.filter((d) => isTerm(d.key)).map((d) => [d.key, d])),
    pending,
    changes: pending && latest ? (base ? frameChanges(base, latest, sy) : frameChangesWithoutBase(latest, sy)) : null,
  };
}
export const changeCount = (changes: FrameChanges | null) => (changes ? changes.apply.length + changes.conflicts.length : 0);
/** Datum som ramens ändring rör, för *Visa skillnaderna*. */
export const changedDates = (changes: FrameChanges | null): ISODate[] =>
  changes ? [...changes.apply, ...changes.conflicts].filter((c) => !isTerm(c.key)).map((c) => dateOf(c.key)) : [];

/** Raden i granskningsrutan vid skicka och fastställ (avsnitt 9). */
export function frameReviewText(c: FrameComparison): string {
  const terms = [...c.terms.values()].map((d) => `${TERM_LABEL[d.key]} ${frameValueText(d.school)}`);
  return `Avviker från ramen: ${num(c.days.size)} dagar${terms.length ? ` · ${terms.join(', ')}` : ''}`;
}

/** Kortet ”Jämfört med huvudmannens ram” överst i `ly-side` (A-06). */
export function LasarFrameCard({ comparison, showNotTaken, onShowDay }: {
  comparison: FrameComparison;
  /** Huvudmannen och den som inte kan ändra kalendern ser texten, utan knappar. */
  showNotTaken: boolean;
  onShowDay: (date: ISODate) => void;
}) {
  const { reference, terms, days } = comparison;
  const termText = terms.size
    ? [...terms.values()].map((d) => `${TERM_LABEL[d.key]} ${frameValueText(d.school)} · ramen ${frameValueText(d.frame)}`).join('; ')
    : 'Samma som ramen';
  return (
    <section className="og-card ly-frame-card" aria-labelledby="ly-frame-card-heading">
      <div className="section-heading">
        <h3 id="ly-frame-card-heading">Jämfört med huvudmannens ram</h3>
        <span className={comparison.deviation.length ? 'a-status amber' : 'a-status'}><span />{comparison.deviation.length ? 'Skiljer sig' : 'Samma som ramen'}</span>
      </div>
      <p className="ly-frame-version">Ramens version {reference.version}, utgiven {formatDate(reference.publishedOn, true)}</p>
      {showNotTaken && comparison.pending && (
        <p className="ly-frame-pending"><AlertTriangle size={14} aria-hidden="true" /> Ramen har ändrats sedan skolan började. Rektorn har inte tagit in ändringen.</p>
      )}
      <dl className="ly-counters">
        <div className={terms.size ? 'ly-bad' : ''}>
          <dt>Terminsdatum</dt>
          <dd><small>{termText}</small></dd>
        </div>
        <div className={days.size ? 'ly-bad' : ''}>
          <dt>Dagar som skiljer sig</dt>
          <dd><strong>{num(days.size)}</strong></dd>
        </div>
      </dl>
      {days.size > 0 && (
        <ul className="ly-frame-list">
          {[...days.entries()].map(([date, d]) => (
            <li key={date}>
              <span>{formatLong(date)}: {frameValueText(d.school)} · ramen {frameValueText(d.frame)}</span>
              <Button variant="outline" size="sm" aria-label={`Visa ${formatLong(date)}`} onClick={() => onShowDay(date)}>Visa</Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Banderollen `ly-frame-banner` ovanför arbetsflödet när ramen har ändrats (D-05). */
export function LasarFrameBanner({ latest, count, busy, onShowDiff, onTake, onKeep }: {
  latest: LasarFrameRef;
  count: number;
  busy: boolean;
  onShowDiff: () => void;
  onTake: () => void;
  onKeep: () => void;
}) {
  return (
    <section className="ly-frame-banner" aria-labelledby="ly-frame-banner-text">
      <p id="ly-frame-banner-text">
        <AlertTriangle size={16} aria-hidden="true" />
        <span>Huvudmannen har ändrat ramen (version {latest.version}, {formatDate(latest.publishedOn, true)}). {num(count)} {count === 1 ? 'dag skiljer' : 'dagar skiljer'} sig från skolans kalender.</span>
      </p>
      <div className="ly-frame-banner-actions">
        <Button variant="outline" onClick={onShowDiff}>Visa skillnaderna</Button>
        <Button disabled={busy || count === 0} onClick={onTake}>Ta in ramens ändringar</Button>
        <Button variant="outline" disabled={busy} onClick={onKeep}>Behåll skolans kalender</Button>
      </div>
    </section>
  );
}

function ChangeRow({ change }: { change: FrameChange }) {
  return (
    <>
      <span>{keyLabel(change.key)}</span>
      <small>skolan {frameValueText(change.ours)} → ramen {frameValueText(change.theirs)}</small>
    </>
  );
}

/**
 * Bekräftelsen ”Ta in ramens ändringar?” (A-12). Ändringar som skolan inte har rört
 * är med; konflikter, där skolan har ändrat samma dag, är val som rektorn kryssar i.
 * Den säkra knappen har fokus, och Esc betyder nej.
 */
export function LasarTakeFrameDialog({ changes, busy, onCancel, onConfirm }: {
  changes: FrameChanges | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (accepted: string[]) => void;
}) {
  const keep = useRef<HTMLButtonElement>(null);
  const [chosen, setChosen] = useState<string[]>([]);
  const accepted = changes ? [...changes.apply.map((c) => c.key), ...changes.conflicts.filter((c) => chosen.includes(c.key)).map((c) => c.key)] : [];
  const n = accepted.length;
  return (
    <AlertDialog open={changes !== null} onOpenChange={(open) => { if (!open) { setChosen([]); onCancel(); } }}>
      <AlertDialogContent className="admin-dialog protected-lasar-dialog ly-list-dialog" initialFocus={keep}>
        {changes && (
          <>
            <AlertDialogTitle>Ta in ramens ändringar?</AlertDialogTitle>
            <AlertDialogDescription>
              {num(n)} {n === 1 ? 'dag' : 'dagar'} i skolans kalender ändras till ramens värden. Skolans egna justeringar på andra dagar ligger kvar.
            </AlertDialogDescription>
            {changes.apply.length > 0 && (
              <ul className="ly-dialog-list" aria-label="Ändringar som tas in">
                {changes.apply.map((c) => <li key={c.key}><ChangeRow change={c} /></li>)}
              </ul>
            )}
            {changes.conflicts.length > 0 && (
              <>
                <p className="field-label">Skolan har ändrat samma dag. Välj om ramens värde ska gälla.</p>
                <ul className="ly-dialog-list" aria-label="Dagar där skolan och ramen skiljer sig">
                  {changes.conflicts.map((c) => (
                    <li key={c.key}>
                      <label className="ly-dialog-choice">
                        <Checkbox
                          checked={chosen.includes(c.key)}
                          onCheckedChange={(on) => setChosen((list) => (on ? [...list, c.key] : list.filter((k) => k !== c.key)))}
                        />
                        <span>Ta in ramens värde för {keyLabel(c.key)}</span>
                      </label>
                      <small>skolan {frameValueText(c.ours)} · ramen {frameValueText(c.theirs)}</small>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <div className="dialog-actions">
              <AlertDialogCancel ref={keep} variant="outline">Behåll skolans kalender</AlertDialogCancel>
              <Button disabled={busy || n === 0} onClick={() => { setChosen([]); onConfirm(accepted); }}>Ta in {num(n)} {n === 1 ? 'ändring' : 'ändringar'}</Button>
            </div>
          </>
        )}
      </AlertDialogContent>
    </AlertDialog>
  );
}

/** Dialogen ”Ge ut ramen till skolorna” (avsnitt 11, D-13). Meddelandet är frivilligt. */
export function LasarPublishFrameDialog({ open, yearText, text, onText, error, notice, busy, onCancel, onConfirm }: {
  open: boolean;
  yearText: string;
  text: string;
  onText: (text: string) => void;
  error: string;
  notice?: ReactNode;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) onCancel(); }}>
      <DialogContent className="admin-dialog protected-lasar-dialog" showCloseButton={false}>
        <div className="dialog-eyebrow">
          <span>{`LÄSÅRET ${yearText}`}</span>
          <span>HUVUDMANNENS RAM</span>
        </div>
        <DialogTitle>Ge ut ramen till skolorna</DialogTitle>
        <DialogDescription>
          Rektorerna utgår från ramen. Skolor som redan har börjat får en markering om vilka dagar som skiljer sig. Inget i skolornas kalendrar ändras.
        </DialogDescription>
        <label className="field-label" htmlFor="ly-publish-text">Meddelande till rektorerna (frivilligt)</label>
        <Textarea id="ly-publish-text" rows={3} value={text} placeholder="Till exempel vad som har ändrats sedan förra versionen." onChange={(e) => onText(e.target.value)} />
        {error && <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p></div>}
        {notice}
        <div className="dialog-actions">
          <Button variant="outline" onClick={onCancel}>Avbryt</Button>
          <Button disabled={busy} onClick={onConfirm}><Send size={15} /> Ge ut ramen</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** `tp-cover-side` för ramen: Utkast eller Utgiven i stället för skolans status. */
export function LasarFrameCoverSide({ sy, summary, children }: { sy: SchoolYear; summary: Summary; children?: ReactNode }) {
  const published = sy.status === 'fastställd';
  return (
    <div className="tp-cover-side">
      <span className={`tp-status tp-status-${published ? 'fastställd' : 'utkast'}`}>{published ? 'Utgiven' : 'Utkast'}</span>
      {published && sy.decidedOn && <span>Utgiven {sy.decidedOn}</span>}
      {children}
      <span>{num(summary.skoldagar)} skoldagar · {num(summary.weeks.total)} veckor</span>
    </div>
  );
}
