// 05.1-29: matrislinser för många lärare. Ren logik för kolumnval, linser och lokala inställningar.
// Relevanta lärare följer de synliga raderna; fästa lärare visas alltid. Inget väljs automatiskt (D-25–D-27),
// och inga summor jämförs med kapacitet (D-10). Inställningarna är en bekvämlighet i den egna webbläsaren.
import type { TjanstJoint, TjanstRow, TjanstTeacher } from './tjanst-contract.ts';

export type TjanstLensTerm = 'ar' | 'ht' | 'vt';
export type TjanstLensId = 'alla' | 'ofordelat' | 'samlasning';
export const TJANST_LENSES: { id: TjanstLensId; label: string }[] = [
  { id: 'alla', label: 'Alla behov' }, { id: 'ofordelat', label: 'Ofördelat' }, { id: 'samlasning', label: 'Samläsningar' }];
/** Minsta form av en behovsrad (TjanstNeedEntry i matrisen). */
export type TjanstLensEntry = { need: { needHt: number | null; needVt: number | null }; rows: TjanstRow[]; cov: { covered: { ht: number; vt: number } } };
export type TjanstLensFilter = { classId: string; subject: string; personId: string; onlyIssues: boolean; course: string };
export type TjanstSavedLens = { name: string; lens: TjanstLensId; filter: TjanstLensFilter; showAll: boolean };
export type TjanstLensPrefs = { pinned: string[]; compact: boolean; saved: TjanstSavedLens[] };
export const EMPTY_LENS_PREFS: TjanstLensPrefs = { pinned: [], compact: false, saved: [] };

const need = (e: TjanstLensEntry, term: TjanstLensTerm) => term === 'ht' ? e.need.needHt : term === 'vt' ? e.need.needVt
  : e.need.needHt === null && e.need.needVt === null ? null : (e.need.needHt ?? 0) + (e.need.needVt ?? 0);
const covered = (e: TjanstLensEntry, term: TjanstLensTerm) => term === 'ht' ? e.cov.covered.ht : term === 'vt' ? e.cov.covered.vt : e.cov.covered.ht + e.cov.covered.vt;

/** Ofördelat: känt behov som inte är täckt för vald termin, eller en vakant rad. Okänt behov räknas aldrig som 0. */
export function unallocated(e: TjanstLensEntry, term: TjanstLensTerm): boolean {
  const n = need(e, term);
  return e.rows.some(r => r.personId === null) || n !== null && covered(e, term) < n;
}
export function lensMatches(e: TjanstLensEntry, lens: TjanstLensId, term: TjanstLensTerm): boolean {
  return lens === 'alla' || (lens === 'ofordelat' ? unallocated(e, term) : e.rows.some(r => r.jointGroupId !== null));
}
/** Lärare med tid på raden, inklusive samläsningens lärare. */
export function entryTeachers(e: TjanstLensEntry, joints: TjanstJoint[]): Set<string> {
  const ids = new Set<string>();
  for (const r of e.rows) {
    if (r.personId) ids.add(r.personId);
    const joint = r.jointGroupId === null ? null : joints.find(j => j.id === r.jointGroupId);
    joint?.teachers.forEach(t => ids.add(t.personId));
  }
  return ids;
}
/**
 * Lärare utan undervisning (ingen rad och ingen samläsning) i planen, till exempel en nyss tillagd lärare eller en lärare med bara
 * specialuppdrag. Utan filter visas de, så att de går att fördela och deras summor syns; med filter är de inte relevanta.
 */
export function teachersWithoutTeaching(teachers: TjanstTeacher[], rows: TjanstRow[], joints: TjanstJoint[]): string[] {
  return teachers.filter(t => !rows.some(r => r.personId === t.personId) && !joints.some(j => j.teachers.some(p => p.personId === t.personId))).map(t => t.personId);
}
/**
 * Kolumnerna i matrisen. Med lärarfilter visas bara den läraren (som tidigare). Annars relevanta lärare (tid på synliga rader),
 * fästa lärare och empty (lärare utan undervisning när inget filter gäller), eller alla med showAll. Ordningen följer teachers (redan sorterad på efternamn).
 */
export function visibleTeachers(entries: TjanstLensEntry[], teachers: TjanstTeacher[], joints: TjanstJoint[],
  { pinned, showAll, personId, empty = [] }: { pinned: string[]; showAll: boolean; personId: string; empty?: string[] }): TjanstTeacher[] {
  if (personId) return teachers.filter(t => t.personId === personId);
  if (showAll) return teachers;
  const keep = new Set([...pinned, ...empty]);
  for (const e of entries) entryTeachers(e, joints).forEach(id => keep.add(id));
  return teachers.filter(t => keep.has(t.personId));
}
/** Initialer för kompakta kolumner: förnamn och efternamn ("Anna Andersson" → "AA"). */
export function initials(displayName: string): string {
  const parts = displayName.trim().split(/\s+/u).filter(Boolean);
  return parts.length ? (parts[0][0] + (parts.length > 1 ? parts.at(-1)![0] : '')).toUpperCase() : '?';
}

// ---------- lokala inställningar ----------
/** Nyckeln bygger på den hashade identiteten (sha256:…), skola och läsår. Inga namn lagras. */
export const lensStorageKey = (identityKey: string, unitId: string, schoolYear: number) => `tjanst-lins:v1:${identityKey}:${unitId}:${schoolYear}`;
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const LENS_IDS = new Set(TJANST_LENSES.map(l => l.id));
const FILTER_KEYS = ['classId', 'subject', 'personId', 'course'] as const;
const text = (v: unknown, max = 200) => typeof v === 'string' && v.length <= max ? v : null;
function readFilter(value: unknown): TjanstLensFilter | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>, out = { classId: '', subject: '', personId: '', onlyIssues: v.onlyIssues === true, course: '' };
  for (const k of FILTER_KEYS) { const s = text(v[k] ?? ''); if (s === null) return null; out[k] = s; }
  return out;
}
/** Läser inställningarna. Trasig, främmande eller otillgänglig lagring ger standardläget; okända lärare och klasser rensas. */
export function readLensPrefs(storage: StorageLike | null, key: string, known: { teacherIds: string[]; classIds: string[] }): TjanstLensPrefs {
  let raw: unknown;
  try { raw = JSON.parse(storage?.getItem(key) ?? 'null'); } catch { return EMPTY_LENS_PREFS; }
  if (!raw || typeof raw !== 'object' || (raw as { v?: unknown }).v !== 1) return EMPTY_LENS_PREFS;
  const r = raw as Record<string, unknown>, teachers = new Set(known.teacherIds), classes = new Set(known.classIds);
  const pinned = Array.isArray(r.pinned) ? [...new Set(r.pinned.filter((id): id is string => typeof id === 'string' && teachers.has(id)))] : [];
  const saved: TjanstSavedLens[] = [];
  for (const s of Array.isArray(r.saved) ? r.saved.slice(0, 20) : []) {
    const x = s as Record<string, unknown> | null, name = text(x?.name, 60)?.trim(), filter = readFilter(x?.filter);
    if (!name || !filter || !LENS_IDS.has(x!.lens as TjanstLensId) || saved.some(o => o.name === name)) continue;
    if (filter.personId && !teachers.has(filter.personId)) filter.personId = '';
    if (filter.classId && !classes.has(filter.classId)) filter.classId = '';
    saved.push({ name, lens: x!.lens as TjanstLensId, filter, showAll: x!.showAll === true });
  }
  return { pinned, compact: r.compact === true, saved };
}
/** Skriver inställningarna. Ett fel i lagringen ignoreras; vyn fungerar ändå under besöket. */
export function writeLensPrefs(storage: StorageLike | null, key: string, prefs: TjanstLensPrefs): boolean {
  try { storage?.setItem(key, JSON.stringify({ v: 1, pinned: prefs.pinned, compact: prefs.compact, saved: prefs.saved })); return !!storage; } catch { return false; }
}
