'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Link2, Plus, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TjanstClass, TjanstJoint, TjanstNeed, TjanstPlanRead, TjanstRow, TjanstTeacher } from '@/lib/tjanst-contract.ts';
import { coverage, jointHasMixedTeachers, teacherSums, type TjanstCoverage } from '@/lib/tjanst-model.ts';
import { formatDeviation, formatTime, needValue, TERM_LABEL, termValue, yearLabel, type TjanstTermView } from './tjanst-service-summary';

/** En behovsrad (kurs × klass) med sina tjänsterader och täckningen enligt tjanst-model (samläsning räknas en gång). */
export type TjanstNeedEntry = { cls: TjanstClass; need: TjanstNeed; rows: TjanstRow[]; cov: TjanstCoverage };
export type TjanstClassGroup = { cls: TjanstClass; entries: TjanstNeedEntry[] };
/** personId null = Vakant. rowId null = ny rad. */
export type TjanstCellTarget = { classId: string; sourceKey: string; personId: string | null; rowId: string | null };
export type TjanstFilter = { classId: string; subject: string; personId: string; onlyIssues: boolean };
export const EMPTY_FILTER: TjanstFilter = { classId: '', subject: '', personId: '', onlyIssues: false };

const familyName = (t: TjanstTeacher) => t.displayName.split(' ').at(-1) ?? t.displayName;
export const sortTeachers = (teachers: TjanstTeacher[]) => [...teachers].sort((a, b) => familyName(a).localeCompare(familyName(b), 'sv') || a.displayName.localeCompare(b.displayName, 'sv'));
/** Ämnet härleds ur kursnamnet före nivåsiffran ("Matematik 1c" → "Matematik"). Kontraktet har inget eget ämnesfält (Claudes val). */
/** Ämnet i en behovsrad: Gy25 "Ämne – Nivå 1" (05.1-09), annars kursnamnet utan nivåsiffra ("Matematik 1c" → "Matematik"). */
export const subjectOf = (label: string) => label.includes(' – ') ? label.slice(0, label.indexOf(' – ')) : /^(.*?)(?:\s+\d.*)?$/u.exec(label)?.[1] || label;
/** Klasskoppling per skolform. Skolformen för en okopplad klass framgår inte av fördelningen; användaren väljer uttryckligen. */
export type TjanstOpenClassLinks = (schoolform: 'gymnasium' | 'grundskola') => void;
export function TjanstClassLinkButtons({ onOpen }: { onOpen: TjanstOpenClassLinks }) {
  return <div className="mandate-actions tjanst-class-link-actions">
    <Button variant="outline" onClick={() => onOpen('gymnasium')}>Klasskopplingar för gymnasiet</Button>
    <Button variant="outline" onClick={() => onOpen('grundskola')}>Klasskopplingar för GR och IM</Button>
  </div>;
}
export const jointOf = (row: TjanstRow, joints: TjanstJoint[]) => row.jointGroupId === null ? null : joints.find(j => j.id === row.jointGroupId) ?? null;
/** Lärarens tid på raden: i en samläsning gruppens tid för läraren, annars radens egen tid. */
export function rowTime(row: TjanstRow, joints: TjanstJoint[]): { ht: number; vt: number } {
  const joint = jointOf(row, joints), t = joint?.teachers.find(x => x.personId === row.personId);
  return joint ? { ht: t?.ht ?? 0, vt: t?.vt ?? 0 } : { ht: row.teacherHt, vt: row.teacherVt };
}
const knownNeed = (n: TjanstNeed) => n.needHt === null && n.needVt === null ? null : { ht: n.needHt ?? 0, vt: n.needVt ?? 0 };
export function needEntries(data: TjanstPlanRead): TjanstClassGroup[] {
  return data.classes.map(cls => ({ cls, entries: cls.needs.map(need => {
    const rows = data.rows.filter(r => r.sourceKey === need.sourceKey);
    return { cls, need, rows, cov: coverage(need.sourceKey, knownNeed(need), data.rows, data.joints) };
  }) }));
}
export function entryDeviation(e: TjanstNeedEntry, term: TjanstTermView): number | null {
  const need = needValue(e.need.needHt, e.need.needVt, term);
  return need === null ? null : termValue(e.cov.covered, term) - need;
}
export function filterGroups(groups: TjanstClassGroup[], filter: TjanstFilter, term: TjanstTermView, joints: TjanstJoint[]): TjanstClassGroup[] {
  const teaches = (e: TjanstNeedEntry) => e.rows.some(r => r.personId === filter.personId || jointOf(r, joints)?.teachers.some(t => t.personId === filter.personId));
  return groups.filter(g => !filter.classId || g.cls.classId === filter.classId).map(g => ({ ...g, entries: g.entries.filter(e =>
    (!filter.subject || subjectOf(e.need.label) === filter.subject) && (!filter.personId || teaches(e)) && (!filter.onlyIssues || (entryDeviation(e, term) ?? 1) !== 0)) }))
    .filter(g => g.cls.link === null ? !filter.subject && !filter.personId : g.entries.length > 0 || !filter.subject && !filter.personId && !filter.onlyIssues);
}
/** Klassens täckning: {fördelat} av {behov} h · {n} lärare. Okänt behov ingår aldrig som 0. */
export function classCoverage(entries: TjanstNeedEntry[], term: TjanstTermView, joints: TjanstJoint[]): string {
  let covered = 0, need = 0, known = false; const people = new Set<string>();
  for (const e of entries) {
    covered += termValue(e.cov.covered, term);
    const n = needValue(e.need.needHt, e.need.needVt, term); if (n !== null) { need += n; known = true; }
    for (const r of e.rows) { const j = jointOf(r, joints); if (j) j.teachers.forEach(t => people.add(t.personId)); else if (r.personId) people.add(r.personId); }
  }
  return `${coverageText(covered, known ? need : null)} · ${people.size} lärare`;
}
export function coverageText(covered: number, need: number | null): string {
  if (need === null) return `${formatTime(covered)} · behov okänt`;
  return covered % 60 === 0 && need % 60 === 0 ? `${(covered / 60).toLocaleString('sv-SE')} av ${formatTime(need)}` : `${formatTime(covered)} av ${formatTime(need)}`;
}

type Props = { data: TjanstPlanRead; groups: TjanstClassGroup[]; teachers: TjanstTeacher[]; term: TjanstTermView; editable: boolean;
  onCell: (target: TjanstCellTarget, origin: HTMLElement) => void; onJoint: (jointId: string, origin: HTMLElement) => void; onOpenClassLinks?: TjanstOpenClassLinks };

export default function TjanstMatrix({ data, groups, teachers, term, editable, onCell, onJoint, onOpenClassLinks }: Props) {
  const [active, setActive] = useState({ r: 0, c: 0 });
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const columns = teachers.length + 1;
  const navigable = groups.flatMap(g => g.cls.link ? g.entries : []);
  const current = { r: Math.min(active.r, Math.max(0, navigable.length - 1)), c: Math.min(active.c, columns - 1) };
  const totalColumns = 4 + columns;
  const time = (minutes: number) => formatTime(minutes);
  const name = (personId: string | null) => personId === null ? 'Vakant' : data.teachers.find(t => t.personId === personId)?.displayName ?? 'Okänd lärare';
  function move(r: number, c: number) {
    const next = { r: Math.max(0, Math.min(navigable.length - 1, r)), c: Math.max(0, Math.min(columns - 1, c)) };
    setActive(next); cells.current.get(`${next.r}:${next.c}`)?.focus();
  }
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const keys: Record<string, () => void> = { ArrowRight: () => move(current.r, current.c + 1), ArrowLeft: () => move(current.r, current.c - 1),
      ArrowDown: () => move(current.r + 1, current.c), ArrowUp: () => move(current.r - 1, current.c), Home: () => move(current.r, 0), End: () => move(current.r, columns - 1) };
    const action = keys[event.key]; if (!action) return;
    event.preventDefault(); action();
  }
  const school = { teaching: { ht: 0, vt: 0 }, need: null as number | null, covered: 0, vacant: { ht: 0, vt: 0 } };
  for (const g of groups) for (const e of g.entries) {
    const n = needValue(e.need.needHt, e.need.needVt, term); if (n !== null) school.need = (school.need ?? 0) + n;
    school.covered += termValue(e.cov.covered, term);
  }
  for (const r of data.rows) if (r.personId === null && r.jointGroupId === null) { school.vacant.ht += r.teacherHt; school.vacant.vt += r.teacherVt; }
  const sums = new Map(teachers.map(t => [t.personId, teacherSums(t.personId, data.rows, data.specials, data.joints)]));
  let rowIndex = -1;
  return <div className="tjanst-matrix-scroll" tabIndex={editable ? undefined : 0} role={editable ? undefined : 'region'} aria-label={editable ? undefined : 'Matris'}>
    <table className="tjanst-matrix">
      <caption className="sr-only">Tjänstefördelning {data.schoolName} läsåret {yearLabel(data.schoolYear)}, {TERM_LABEL[term]}</caption>
      <thead><tr>
        <th scope="col" className="tjanst-first">Kurs · klass</th><th scope="col" className="tjanst-num">Behov</th><th scope="col" className="tjanst-num">Fördelat</th><th scope="col" className="tjanst-num">Avvikelse</th>
        {teachers.map(t => <th scope="col" key={t.personId} className="tjanst-teacher"><span className="tjanst-teacher-name">{t.displayName}</span>
          {t.shareHere !== null && <small>Andel här {t.shareHere}{'\u00a0'}%</small>}{t.draft && <Badge variant="outline" className="tjanst-badge">Ny lärare</Badge>}</th>)}
        <th scope="col" className="tjanst-num tjanst-vacant">Vakant</th>
      </tr></thead>
      {groups.map(g => {
        if (!g.cls.link) return <tbody key={g.cls.classId}>
          <tr className="tjanst-class-row"><th scope="rowgroup" colSpan={totalColumns} aria-label={`${g.cls.name} · koppling saknas`}><div className="tjanst-class-heading"><span>{g.cls.name} · koppling saknas</span></div></th></tr>
          <tr className="tjanst-missing"><td colSpan={totalColumns}><div className="tjanst-missing-body"><span>Klassen har ingen timplan för läsåret {yearLabel(data.schoolYear)}. Behovet är okänt, inte noll.</span>
            {onOpenClassLinks && <TjanstClassLinkButtons onOpen={onOpenClassLinks}/>}</div></td></tr>
        </tbody>;
        return <tbody key={g.cls.classId}>
          <tr className="tjanst-class-row"><th scope="rowgroup" colSpan={totalColumns} tabIndex={-1} data-class-heading={g.cls.classId} aria-label={`${g.cls.name} · ${g.cls.link.seriesName} version ${g.cls.link.timplanVersion}`}><div className="tjanst-class-heading"><span>{g.cls.name} · {g.cls.link.seriesName} version {g.cls.link.timplanVersion}</span><span>{classCoverage(g.entries, term, data.joints)}</span></div></th></tr>
          {g.entries.map(e => {
            const r = ++rowIndex, need = needValue(e.need.needHt, e.need.needVt, term), dev = entryDeviation(e, term), joined = e.rows.some(x => x.jointGroupId !== null);
            const code = e.need.rowKey.replace(/^.*:/u, '');
            const cell = (c: number, personId: string | null) => {
              const own = e.rows.filter(x => x.personId === personId), row = own[0] ?? null, joint = row ? jointOf(row, data.joints) : null;
              const minutes = own.reduce((n, x) => n + termValue(rowTime(x, data.joints), term), 0);
              const label = `${name(personId)}, ${e.need.label}, ${g.cls.name}: ${row ? `${time(minutes)}. Ändra.` : 'ingen tid. Tilldela.'}`;
              const content = <>{joint && <Link2 size={16} aria-hidden="true"/>}{row && <span>{time(minutes)}</span>}</>;
              const isActive = current.r === r && current.c === c;
              return <td key={personId ?? 'vakant'} className={personId === null ? 'tjanst-cell tjanst-vacant' : 'tjanst-cell'}>{editable ? <button type="button" data-cell={`${r}:${c}`} aria-label={label}
                tabIndex={isActive ? 0 : -1} ref={el => { if (el) cells.current.set(`${r}:${c}`, el); else cells.current.delete(`${r}:${c}`); }}
                onFocus={() => setActive({ r, c })} onKeyDown={onKey}
                onClick={event => joint ? onJoint(joint.id, event.currentTarget) : onCell({ classId: g.cls.classId, sourceKey: e.need.sourceKey, personId, rowId: row?.id ?? null }, event.currentTarget)}>
                {content}{!row && <Plus size={16} aria-hidden="true" className="tjanst-plus"/>}</button> : row ? <span className="tjanst-cell-text" aria-label={label}>{content}</span> : null}</td>;
            };
            return <tr key={e.need.sourceKey}>
              <th scope="row" className="tjanst-first"><span className="tjanst-course">{e.need.label}</span><small>{code} · ämnesrad {e.need.label}</small>
                {joined && (e.rows.some(x => { const j = jointOf(x, data.joints); return !!j && jointHasMixedTeachers(j, data.rows); })
                  ? <Badge variant="outline" className="tjanst-badge tjanst-badge-warning"><TriangleAlert size={16} aria-hidden="true"/>Samläsning · olika lärare</Badge>
                  : <Badge variant="outline" className="tjanst-badge"><Link2 size={16} aria-hidden="true"/>Samläsning</Badge>)}</th>
              <td className="tjanst-num">{need === null ? 'Okänt' : time(need)}</td><td className="tjanst-num">{time(termValue(e.cov.covered, term))}</td>
              <td className={dev ? 'tjanst-num tjanst-deviation' : 'tjanst-num'}>{dev ? <span><TriangleAlert size={16} aria-hidden="true"/>{formatDeviation(dev)}</span> : null}</td>
              {teachers.map((t, c) => cell(c, t.personId))}{cell(teachers.length, null)}
            </tr>;
          })}
        </tbody>;
      })}
      <tfoot>
        {(['Undervisning', 'Specialuppdrag', 'Totalt'] as const).map(label => <tr key={label}>
          <th scope="row" className="tjanst-first">{label}</th>
          <td className="tjanst-num">{label === 'Undervisning' && school.need !== null ? time(school.need) : ''}</td>
          <td className="tjanst-num">{label === 'Undervisning' ? time(school.covered) : ''}</td><td>{''}</td>
          {teachers.map(t => { const s = sums.get(t.personId)!; const v = label === 'Undervisning' ? s.teaching : label === 'Specialuppdrag' ? s.special : s.total;
            return <td key={t.personId} className="tjanst-num" data-sum={`${label}:${t.displayName}`}>{time(termValue(v, term))}</td>; })}
          <td className="tjanst-num tjanst-vacant">{label === 'Undervisning' ? time(termValue(school.vacant, term)) : ''}</td>
        </tr>)}
      </tfoot>
    </table>
  </div>;
}
