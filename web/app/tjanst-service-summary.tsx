'use client';

import type { ReactNode } from 'react';
import { Link2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { TjanstSpecialKind, TjanstTermMinutes } from '@/lib/tjanst-contract.ts';
import type { TjanstTeacherSums } from '@/lib/tjanst-model.ts';

/**
 * Gemensam läsvy för en lärares tjänst: Per lärare i rektors vy och Min tjänst (plan 07).
 * Bara summor per termin och läsår. Ingen jämförelse mot tjänstgöringsgrad och inga ord om
 * belastning (D-10, D-12). Andelen visas som upplysning (= SS 12000 dutyPercent).
 */
export type TjanstTermView = 'ar' | 'ht' | 'vt';
export const TERM_LABEL: Record<TjanstTermView, string> = { ar: 'Hela läsåret', ht: 'HT', vt: 'VT' };
export const SPECIAL_KIND_LABEL: Record<TjanstSpecialKind, string> = { mentor: 'Mentor', programansvar: 'Programansvar', speciallarare: 'Speciallärare', annat: 'Annat uppdrag' };
export const yearLabel = (year: number) => `${String(year).slice(-2)}/${String(year + 1).slice(-2)}`;
/** Tid i hela minuter visas som {h} h eller {h} h {m} min (UI-SPEC, Claudes val). */
export function formatTime(minutes: number): string {
  const sign = minutes < 0 ? '−' : '', abs = Math.abs(minutes), h = Math.floor(abs / 60), m = abs % 60;
  return `${sign}${h.toLocaleString('sv-SE')} h${m ? ` ${m} min` : ''}`;
}
/** Avvikelse: tom vid 0, annars +{h} h eller −{h} h (U+2212). */
export function formatDeviation(minutes: number | null): string {
  if (minutes === null || minutes === 0) return '';
  return minutes > 0 ? `+${formatTime(minutes)}` : formatTime(minutes);
}
export function termValue(value: TjanstTermMinutes, term: TjanstTermView): number {
  return term === 'ht' ? value.ht : term === 'vt' ? value.vt : value.ht + value.vt;
}
/** Okänt behov är null, aldrig 0 (D-04). En känd termin räcker för läsåret. */
export function needValue(ht: number | null, vt: number | null, term: TjanstTermView): number | null {
  if (term === 'ht') return ht;
  if (term === 'vt') return vt;
  return ht === null && vt === null ? null : (ht ?? 0) + (vt ?? 0);
}
export const termsText = (t: TjanstTermMinutes) => `HT ${formatTime(t.ht)} · VT ${formatTime(t.vt)} · Läsår ${formatTime(t.ht + t.vt)}`;

export type TjanstSummaryRow = { id: string; course: string; className: string; ht: number; vt: number; jointWith: string[] | null };
export type TjanstSummarySpecial = { id: string; kind: TjanstSpecialKind; label: string; group: string | null; ht: number; vt: number };
type Props = { name: string; teaching: TjanstSummaryRow[]; specials: TjanstSummarySpecial[]; sums: TjanstTeacherSums; shareHere?: number | null;
  /** Kommentarer, kvittens eller annat som vyn lägger till efter sammanfattningen. */
  children?: ReactNode };

const jointText = (classes: string[]) => `Samläsning med ${classes.join(', ')}`;
export default function TjanstServiceSummary({ name, teaching, specials, sums, shareHere, children }: Props) {
  const empty = teaching.length === 0 && specials.length === 0;
  return <div className="tjanst-summary">
    <dl className="mandate-facts tjanst-facts" aria-label={`Sammanfattning för ${name}`}>
      <div><dt>Undervisning</dt><dd>{termsText(sums.teaching)}</dd></div>
      <div><dt>Specialuppdrag</dt><dd>{termsText(sums.special)}</dd></div>
      <div><dt>Totalt</dt><dd>{termsText(sums.total)}</dd></div>
      {shareHere !== undefined && <div><dt>Andel här</dt><dd>{shareHere === null ? 'Inte angiven' : `${shareHere} %`}</dd></div>}
      <div><dt>Schemalagd tid</dt><dd>Underlag saknas<small>Visas när schemat finns i Skolplattformen.</small></dd></div>
    </dl>
    {empty ? <p className="tjanst-empty-text">{name} har ingen undervisning eller något uppdrag i den här versionen.</p> : <>
      <h3>Undervisning</h3>
      {teaching.length === 0 ? <p>Ingen undervisning i den här versionen.</p> : <>
        <Table className="tjanst-table tjanst-wide"><TableHeader><TableRow><TableHead scope="col">Kurs/ämne</TableHead><TableHead scope="col">Klass</TableHead><TableHead scope="col" className="tjanst-num">HT</TableHead><TableHead scope="col" className="tjanst-num">VT</TableHead></TableRow></TableHeader>
          <TableBody>{teaching.map(row => <TableRow key={row.id}><TableCell className="tjanst-text"><span>{row.course}</span>{row.jointWith && <Badge variant="outline" className="tjanst-badge"><Link2 size={16} aria-hidden="true"/>{jointText(row.jointWith)}</Badge>}</TableCell>
            <TableCell className="tjanst-text">{row.className}</TableCell><TableCell className="tjanst-num">{formatTime(row.ht)}</TableCell><TableCell className="tjanst-num">{formatTime(row.vt)}</TableCell></TableRow>)}</TableBody></Table>
        <ul className="tjanst-cards">{teaching.map(row => <li key={row.id} className="protected-card"><strong>{row.course}</strong><span>{row.className}</span><span>HT {formatTime(row.ht)} · VT {formatTime(row.vt)}</span>{row.jointWith && <span>{jointText(row.jointWith)}</span>}</li>)}</ul>
      </>}
      <h3>Specialuppdrag</h3>
      {specials.length === 0 ? <p>Inga specialuppdrag ännu.</p> : <>
        <Table className="tjanst-table tjanst-wide"><TableHeader><TableRow><TableHead scope="col">Uppdrag</TableHead><TableHead scope="col">Grupp</TableHead><TableHead scope="col" className="tjanst-num">HT</TableHead><TableHead scope="col" className="tjanst-num">VT</TableHead></TableRow></TableHeader>
          <TableBody>{specials.map(s => <TableRow key={s.id}><TableCell className="tjanst-text">{SPECIAL_KIND_LABEL[s.kind]}{s.label !== SPECIAL_KIND_LABEL[s.kind] ? ` · ${s.label}` : ''}</TableCell><TableCell className="tjanst-text">{s.group ?? 'Ingen grupp'}</TableCell>
            <TableCell className="tjanst-num">{formatTime(s.ht)}</TableCell><TableCell className="tjanst-num">{formatTime(s.vt)}</TableCell></TableRow>)}</TableBody></Table>
        <ul className="tjanst-cards">{specials.map(s => <li key={s.id} className="protected-card"><strong>{SPECIAL_KIND_LABEL[s.kind]}{s.label !== SPECIAL_KIND_LABEL[s.kind] ? ` · ${s.label}` : ''}</strong><span>{s.group ?? 'Ingen grupp'}</span><span>HT {formatTime(s.ht)} · VT {formatTime(s.vt)}</span></li>)}</ul>
      </>}
    </>}
    {children}
  </div>;
}
