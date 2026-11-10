// Jämförelse med huvudmannens ram (D-05, D-06). Rena funktioner utan
// sidoeffekter: de visar skillnader och tar in uttryckligen godkända punkter.
// Inget skrivs över tyst. Ramen omfattar terminskanter och skolans lov- och
// studiedagar; skolans gruppdagar och korta veckor ingår aldrig.
import type { Exception, ISODate, SchoolYear, Term } from './lasar-model.ts';

export type FrameYear = { versionId: string; version: number; terms: { ht: Term; vt: Term }; exceptions: Record<ISODate, Exception> };
export type FrameTermKey = 'term:ht:start' | 'term:ht:end' | 'term:vt:start' | 'term:vt:end';
export type FrameKey = FrameTermKey | `day:${ISODate}`;
/** Datum för en terminskant; för en dag avvikelsen, eller null för vanlig skoldag. */
export type FrameValue = ISODate | Exception | null;
export type FrameDeviation = { key: FrameKey; school: FrameValue; frame: FrameValue };
export type FrameChange = { key: FrameKey; base: FrameValue; theirs: FrameValue; ours: FrameValue };
export type FrameChanges = { apply: FrameChange[]; conflicts: FrameChange[]; own: FrameChange[] };

type Content = { terms: { ht: Term; vt: Term }; exceptions: Record<ISODate, Exception> };

const TERM_KEYS: { key: FrameTermKey; term: 'ht' | 'vt'; edge: 'start' | 'end' }[] = [
  { key: 'term:ht:start', term: 'ht', edge: 'start' },
  { key: 'term:ht:end', term: 'ht', edge: 'end' },
  { key: 'term:vt:start', term: 'vt', edge: 'start' },
  { key: 'term:vt:end', term: 'vt', edge: 'end' },
];

const ofSchool = (sy: SchoolYear): Content => ({ terms: { ht: sy.ht, vt: sy.vt }, exceptions: sy.exceptions });
const day = (e: Exception | undefined): FrameValue => (e ? (e.note === undefined ? { kind: e.kind } : { kind: e.kind, note: e.note }) : null);
function same(a: FrameValue, b: FrameValue): boolean {
  if (a === null || b === null || typeof a === 'string' || typeof b === 'string') return a === b;
  return a.kind === b.kind && a.note === b.note;
}

/** Terminskanterna i fast ordning och därefter dagarna i datumordning. */
function keysOf(...contents: Content[]): FrameKey[] {
  const dates = new Set<ISODate>();
  for (const c of contents) for (const d of Object.keys(c.exceptions)) dates.add(d);
  return [...TERM_KEYS.map((t) => t.key), ...[...dates].sort().map((d) => `day:${d}` as FrameKey)];
}
function valueOf(c: Content, key: FrameKey): FrameValue {
  const t = TERM_KEYS.find((x) => x.key === key);
  return t ? c.terms[t.term][t.edge] : day(c.exceptions[key.slice(4)]);
}

/** D-06: skolans terminskanter och dagar som skiljer sig från ramversionen. */
export function frameDeviation(school: SchoolYear, frame: FrameYear): FrameDeviation[] {
  const s = ofSchool(school);
  return keysOf(s, frame)
    .map((key) => ({ key, school: valueOf(s, key), frame: valueOf(frame, key) }))
    .filter((d) => !same(d.school, d.frame));
}

/**
 * D-05: tre jämförelsepunkter per terminskant och dag. Bas är ramversionen
 * skolan utgick från, deras är den nya ramversionen och våra är skolans kalender.
 * - våra = bas och deras ≠ bas: kan tas in (apply)
 * - båda ändrade olika: konflikt, rektor väljer
 * - bara våra ändrade: skolans egen avvikelse, orörd (own)
 * - båda ändrade lika: ingen post
 */
export function frameChanges(base: FrameYear, theirs: FrameYear, ours: SchoolYear): FrameChanges {
  const o = ofSchool(ours);
  const result: FrameChanges = { apply: [], conflicts: [], own: [] };
  for (const key of keysOf(base, theirs, o)) {
    const change = { key, base: valueOf(base, key), theirs: valueOf(theirs, key), ours: valueOf(o, key) };
    const ourChanged = !same(change.ours, change.base);
    const theirChanged = !same(change.theirs, change.base);
    if (theirChanged && !ourChanged) result.apply.push(change);
    else if (theirChanged && ourChanged && !same(change.ours, change.theirs)) result.conflicts.push(change);
    else if (ourChanged && !theirChanged) result.own.push(change);
  }
  return result;
}

/**
 * Tar in ramens värde för exakt de godkända punkterna. Bara punkter under
 * apply eller conflicts får godkännas, och skolans värde ska vara detsamma som
 * när jämförelsen gjordes; annars nekas hela intaget.
 */
export function applyFrameChanges(ours: SchoolYear, changes: FrameChanges, accepted: string[]): SchoolYear {
  const allowed = new Map<string, FrameChange>([...changes.apply, ...changes.conflicts].map((c) => [c.key, c]));
  const result: SchoolYear = { ...ours, ht: { ...ours.ht }, vt: { ...ours.vt }, exceptions: { ...ours.exceptions } };
  for (const key of new Set(accepted)) {
    const change = allowed.get(key);
    if (!change) throw new Error(`Punkten ${key} är inte en ändring i ramen som kan tas in.`);
    if (!same(valueOf(ofSchool(ours), change.key), change.ours)) throw new Error(`Skolans kalender har ändrats sedan jämförelsen (${key}). Jämför igen.`);
    const t = TERM_KEYS.find((x) => x.key === change.key);
    if (t) {
      if (typeof change.theirs !== 'string') throw new Error(`Ramen saknar datum för ${key}.`);
      result[t.term][t.edge] = change.theirs;
      continue;
    }
    const date = change.key.slice(4);
    if (change.theirs === null) delete result.exceptions[date];
    else if (typeof change.theirs === 'object') result.exceptions[date] = { ...change.theirs };
    else throw new Error(`Ramen har ett ogiltigt värde för ${key}.`);
  }
  return result;
}
