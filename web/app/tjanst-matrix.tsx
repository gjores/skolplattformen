'use client';

import { useId, useRef, useState, type KeyboardEvent } from 'react';
import { Link2, Pin, PinOff, Plus, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { TjanstClass, TjanstJoint, TjanstNeed, TjanstPlanRead, TjanstRow, TjanstTeacher } from '@/lib/tjanst-contract.ts';
import { coverage, jointHasMixedTeachers, sharedNeedState, teacherSums, type TjanstCoverage, type TjanstJointWarnings, type TjanstSharedNeedState } from '@/lib/tjanst-model.ts';
import { Users } from 'lucide-react';
import { initials, lensMatches, surplusVacant, type TjanstLensId } from '@/lib/tjanst-lens.ts';
import { formatDeviation, formatTime, needValue, TERM_LABEL, termValue, yearLabel, type TjanstTermView } from './tjanst-service-summary';

/** En behovsrad (kurs × klass) med sina tjänsterader och täckningen enligt tjanst-model (samläsning räknas en gång). */
export type TjanstNeedEntry = { cls: TjanstClass; need: TjanstNeed; rows: TjanstRow[]; cov: TjanstCoverage };
export type TjanstClassGroup = { cls: TjanstClass; entries: TjanstNeedEntry[] };
/** personId null = Vakant. rowId null = ny rad. */
export type TjanstCellTarget = { classId: string; sourceKey: string; personId: string | null; rowId: string | null };
/** lens (05.1-29): Alla behov, Ofördelat eller Samläsningar; kombineras med övriga filter. */
export type TjanstFilter = { classId: string; subject: string; personId: string; onlyIssues: boolean; course: string; lens: TjanstLensId };
export const EMPTY_FILTER: TjanstFilter = { classId: '', subject: '', personId: '', onlyIssues: false, course: '', lens: 'alla' };
/** Kurskod eller ämnesrad ur behovets radnyckel (05.1-27): samma kod i olika klasser är samma kurs. Namnet ensamt räcker inte. */
export const courseCode = (need: { rowKey: string }) => need.rowKey.replace(/^.*:/u, '');

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
/** 05.1-27: varningar för olika timplanstid och APL-skillnad i en samläsning. Stöd, inte hinder. */
export function TjanstJointWarningBox({ warnings, className }: { warnings: TjanstJointWarnings; className: (classId: string) => string }) {
  if (!warnings.time && !warnings.apl) return null;
  const list = (ids: string[]) => ids.map(className).join(', ');
  return <div className="tjanst-warning"><TriangleAlert size={16} aria-hidden="true"/><div>
    {warnings.time && <p>Timplanstiden skiljer sig mellan klasserna: {warnings.time.map(t => `${className(t.classId)} HT ${formatTime(t.ht)} · VT ${formatTime(t.vt)}`).join('; ')}. Gruppens tid kan inte motsvara alla klassers behov.</p>}
    {warnings.apl && <p>{list(warnings.apl.withApl)} har APL under läsåret{warnings.apl.withoutApl.length ? `, ${list(warnings.apl.withoutApl)} har ingen APL` : ''}. Samläsningen kan inte schemaläggas tillsammans under APL-perioderna.{warnings.apl.unknown.length ? ` APL är okänd för ${list(warnings.apl.unknown)}.` : ''}</p>}
  </div></div>;
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
    return { cls, need, rows, cov: coverage(need.sourceKey, knownNeed(need), data.rows, data.joints, data.sharing) };
  }) }));
}
export function entryDeviation(e: TjanstNeedEntry, term: TjanstTermView): number | null {
  const need = needValue(e.need.needHt, e.need.needVt, term);
  return need === null ? null : termValue(e.cov.covered, term) - need;
}
export function filterGroups(groups: TjanstClassGroup[], filter: TjanstFilter, term: TjanstTermView, joints: TjanstJoint[]): TjanstClassGroup[] {
  const teaches = (e: TjanstNeedEntry) => e.rows.some(r => r.personId === filter.personId || jointOf(r, joints)?.teachers.some(t => t.personId === filter.personId));
  return groups.filter(g => !filter.classId || g.cls.classId === filter.classId).map(g => ({ ...g, entries: g.entries.filter(e =>
    (!filter.subject || subjectOf(e.need.label) === filter.subject) && (!filter.course || courseCode(e.need) === filter.course) && (!filter.personId || teaches(e)) && (!filter.onlyIssues || (entryDeviation(e, term) ?? 1) !== 0) && lensMatches(e, filter.lens, term)) }))
    .filter(g => g.cls.link === null ? !filter.subject && !filter.personId && !filter.course && filter.lens === 'alla' : g.entries.length > 0 || !filter.subject && !filter.personId && !filter.onlyIssues && !filter.course && filter.lens === 'alla');
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
  onGroupBody?: (element: HTMLTableSectionElement | null) => void; additionalCoverage?: {need: TjanstNeed; cov: TjanstCoverage}[]; onOpenElectiveBlocks?: () => void;
  onCell: (target: TjanstCellTarget, origin: HTMLElement, advanced?: boolean) => void; onJoint: (jointId: string, origin: HTMLElement, advanced?: boolean, target?: TjanstCellTarget) => void; onOpenClassLinks?: TjanstOpenClassLinks;
  feedback?: { sourceKey: string; text: string } | null; undoSourceKey?: string | null; onUndo?: () => void; undoDisabled?: boolean;
  advanced?: boolean;
  /** 05.1-27: öppnar Per kurs/ämne filtrerad på kursen respektive fokuserad på samläsningen. */
  onOpenCourse?: (code: string) => void; onOpenJoint?: (jointId: string) => void;
  /** 05.1-29: fästa lärare och kompakta kolumner (initialer och summa, hela namnet vid hovring och fokus). */
  pinned?: string[]; onPin?: (personId: string, pin: boolean) => void; compact?: boolean;
  /** 05.1-33: öppnar Hur delar lärarna kursen? för ett behov med flera lärare. */
  onOpenSharing?: (sourceKey: string, origin: HTMLElement) => void };
/** 05.1-33 / D-31: märket för flera lärare på samma behov. */
export const SHARING_BADGE: Record<Exclude<TjanstSharedNeedState, 'single'>, string> = {
  unspecified: 'Två lärare utan angiven delning', sequential: 'Två lärare · en i taget', concurrent: 'Två lärare · samtidigt' };

export default function TjanstMatrix({ data, groups, teachers, term, editable, onCell, onJoint, feedback, undoSourceKey, onUndo, undoDisabled, advanced = false, onOpenClassLinks, onOpenCourse, onOpenJoint, pinned = [], onPin, compact = false, onOpenSharing, onGroupBody, additionalCoverage = [], onOpenElectiveBlocks }: Props) {
  const hintId = useId();
  const [active, setActive] = useState({ r: 0, c: 0 });
  const matrixTable = useRef<HTMLTableElement | null>(null);
  const cells = useRef(new Map<string, HTMLButtonElement>());
  const columns = teachers.length + 1;
  const navigable = groups.flatMap(g => g.cls.link ? g.entries : []);
  const current = { r: Math.min(active.r, Math.max(0, navigable.length + additionalCoverage.length - 1)), c: Math.min(active.c, columns - 1) };
  const totalColumns = 4 + columns;
  const time = (minutes: number) => formatTime(minutes);
  const name = (personId: string | null) => personId === null ? 'Vakant' : data.teachers.find(t => t.personId === personId)?.displayName ?? 'Okänd lärare';
  function move(r: number, c: number) {
    const next = { r: Math.max(0, Math.min(navigable.length + additionalCoverage.length - 1, r)), c: Math.max(0, Math.min(columns - 1, c)) };
    setActive(next); (cells.current.get(`${next.r}:${next.c}`) ?? matrixTable.current?.querySelector<HTMLButtonElement>(`[data-group-cell="${next.r - navigable.length}:${next.c}"]`))?.focus();
  }
  function onKey(event: KeyboardEvent<HTMLButtonElement>) {
    const keys: Record<string, () => void> = { ArrowRight: () => move(current.r, current.c + 1), ArrowLeft: () => move(current.r, current.c - 1),
      ArrowDown: () => move(current.r + 1, current.c), ArrowUp: () => move(current.r - 1, current.c), Home: () => move(current.r, 0), End: () => move(current.r, columns - 1) };
    const action = keys[event.key]; if (!action) return;
    event.preventDefault(); action();
  }
  const school = { teaching: { ht: 0, vt: 0 }, need: null as number | null, covered: 0, vacant: { ht: 0, vt: 0 } };
  for (const e of [...groups.flatMap(group => group.entries), ...additionalCoverage]) {
    const n = needValue(e.need.needHt, e.need.needVt, term); if (n !== null) school.need = (school.need ?? 0) + n;
    school.covered += termValue(e.cov.covered, term);
  }
  for (const r of data.rows) if (r.personId === null && r.jointGroupId === null) { school.vacant.ht += r.teacherHt; school.vacant.vt += r.teacherVt; }
  const sums = new Map(teachers.map(t => [t.personId, teacherSums(t.personId, data.rows, data.specials, data.joints)]));
  let rowIndex = -1;
  return <>
    <p className="sr-only" id={`${hintId}-assign`}>Normalt tilldelar ett klick i en tom lärarcell återstående tid för HT och VT direkt. Befintliga tilldelningar och Vakant öppnas i dialog. Skift+klick, Skift+Enter eller Skift+mellanslag öppnar avancerade val.</p>
    <div className="tjanst-matrix-scroll" tabIndex={editable ? undefined : 0} role={editable ? undefined : 'region'} aria-label={editable ? undefined : 'Matris'}>
    <span id={`${hintId}-course`} hidden>Visar alla klasser med samma kurs i Per kurs/ämne.</span><span id={`${hintId}-joint`} hidden>Öppnar samläsningen i Per kurs/ämne.</span>
    <table ref={matrixTable} className="tjanst-matrix">
      <caption className="sr-only">Tjänstefördelning {data.schoolName} läsåret {yearLabel(data.schoolYear)}, {TERM_LABEL[term]}</caption>
      <thead><tr>
        <th scope="col" className="tjanst-first">Kurs · klass</th><th scope="col" className="tjanst-num">Behov</th><th scope="col" className="tjanst-num">Fördelat</th><th scope="col" className="tjanst-num">Avvikelse</th>
        {teachers.map(t => { const isPinned = pinned.includes(t.personId);
          const pin = onPin && <button type="button" className="tjanst-pin" aria-pressed={isPinned} aria-label={`${isPinned ? 'Lossa' : 'Fäst'} ${t.displayName}`} title={`${isPinned ? 'Lossa' : 'Fäst'} ${t.displayName}`}
            onClick={() => onPin(t.personId, !isPinned)}>{isPinned ? <PinOff size={16} aria-hidden="true"/> : <Pin size={16} aria-hidden="true"/>}</button>;
          return compact ? <th scope="col" key={t.personId} className="tjanst-teacher tjanst-teacher-compact" title={t.displayName}>
            <span className="tjanst-teacher-initials" aria-hidden="true">{initials(t.displayName)}</span><span className="sr-only">{t.displayName}</span>
            <span className="tjanst-teacher-full" aria-hidden="true">{t.displayName}</span>
            <small data-compact-sum={t.displayName}>{time(termValue(sums.get(t.personId)!.total, term))}</small>{pin}</th>
          : <th scope="col" key={t.personId} className="tjanst-teacher"><span className="tjanst-teacher-name">{t.displayName}</span>
            {t.shareHere !== null && <small>Andel här {t.shareHere}{'\u00a0'}%</small>}{t.draft && <Badge variant="outline" className="tjanst-new-teacher">Ny lärare</Badge>}{pin}</th>; })}
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
              const activate = (origin: HTMLButtonElement, useAdvanced: boolean) => joint ? onJoint(joint.id, origin, useAdvanced, { classId: g.cls.classId, sourceKey: e.need.sourceKey, personId, rowId: row?.id ?? null })
                : onCell({ classId: g.cls.classId, sourceKey: e.need.sourceKey, personId, rowId: row?.id ?? null }, origin, useAdvanced);
              return <td key={personId ?? 'vakant'} className={personId === null ? 'tjanst-cell tjanst-vacant' : 'tjanst-cell'}>{editable && !e.need.organizationPending ? <button type="button" data-cell={`${r}:${c}`} aria-label={label} aria-describedby={`${hintId}-assign`}
                tabIndex={isActive ? 0 : -1} ref={el => { if (el) cells.current.set(`${r}:${c}`, el); else cells.current.delete(`${r}:${c}`); }}
                onFocus={() => setActive({ r, c })} onKeyDown={event => {
                  if (event.shiftKey && (event.key === 'Enter' || event.key === ' ')) {
                    event.preventDefault(); if (!event.repeat) activate(event.currentTarget, true); return;
                  }
                  onKey(event);
                }}
                onClick={event => activate(event.currentTarget, advanced || event.shiftKey)}>
                {content}{!row && <Plus size={16} aria-hidden="true" className="tjanst-plus"/>}</button> : row ? <span className="tjanst-cell-text" aria-label={label}>{content}</span> : null}</td>;
            };
            return <tr key={e.need.sourceKey} data-need-row={e.need.sourceKey}>
              <th scope="row" className="tjanst-first">{e.need.organizationPending && <Button variant="ghost" onClick={onOpenElectiveBlocks}>Återstår att gruppindela</Button>}<div className="tjanst-need-heading">{onOpenCourse ? <button type="button" className="tjanst-course tjanst-linklike" aria-describedby={`${hintId}-course`} onClick={() => onOpenCourse(courseCode(e.need))}>{e.need.label}</button>
                : <span className="tjanst-course">{e.need.label}</span>}
                {joined && (() => { const j = e.rows.map(x => jointOf(x, data.joints)).find(Boolean) ?? null, mixed = e.rows.some(x => { const jj = jointOf(x, data.joints); return !!jj && jointHasMixedTeachers(jj, data.rows); });
                  const content = mixed ? <><TriangleAlert size={16} aria-hidden="true"/>Samläsning · olika lärare</> : <><Link2 size={16} aria-hidden="true"/>Samläsning</>;
                  const cls = mixed ? 'tjanst-badge tjanst-badge-warning tjanst-joint-status' : 'tjanst-badge tjanst-joint-status';
                  return onOpenJoint && j ? <button type="button" className={`${cls} tjanst-badge-button`} aria-describedby={`${hintId}-joint`} onClick={() => onOpenJoint(j.id)}><span className="tjanst-joint-chip">{content}</span></button>
                    : <Badge variant="outline" className={cls}>{content}</Badge>; })()}</div>
                <small>{code}</small>
                {(() => { const state = sharedNeedState(e.need.sourceKey, data.rows, data.sharing); if (state === 'single') return null;
                  const warn = state === 'unspecified', cls = warn ? 'tjanst-badge tjanst-badge-warning tjanst-joint-status' : 'tjanst-badge tjanst-joint-status';
                  const content = <>{warn ? <TriangleAlert size={16} aria-hidden="true"/> : <Users size={16} aria-hidden="true"/>}{SHARING_BADGE[state]}</>;
                  return onOpenSharing ? <button type="button" data-focus-key={`sharing:${e.need.sourceKey}`} className={`${cls} tjanst-badge-button`} aria-label={`${SHARING_BADGE[state]}: ange hur lärarna delar ${e.need.label} i ${g.cls.name}`}
                    onClick={event => onOpenSharing(e.need.sourceKey, event.currentTarget)}>{content}</button> : <Badge variant="outline" className={cls}>{content}</Badge>; })()}
                {surplusVacant(e) && <Badge variant="outline" className="tjanst-badge tjanst-badge-warning" title="Lärarna täcker hela behovet. Ta bort den vakanta raden i Vakant-kolumnen.">
                  <TriangleAlert size={16} aria-hidden="true"/>Överflödig vakant rad</Badge>}
                <div className="tjanst-row-feedback">
                  <output aria-live="polite">{feedback?.sourceKey === e.need.sourceKey ? feedback.text : ''}</output>
                  {undoSourceKey === e.need.sourceKey && onUndo && <button type="button" className="tjanst-linklike" aria-label="Ångra senaste direkta tilldelningen" disabled={undoDisabled} onClick={onUndo}>Ångra</button>}
                </div></th>
              <td className="tjanst-num">{need === null ? 'Okänt' : time(need)}</td><td className="tjanst-num">{time(termValue(e.cov.covered, term))}</td>
              <td className={dev ? 'tjanst-num tjanst-deviation' : 'tjanst-num'}>{dev ? <span><TriangleAlert size={16} aria-hidden="true"/>{formatDeviation(dev)}</span> : null}</td>
              {teachers.map((t, c) => cell(c, t.personId))}{cell(teachers.length, null)}
            </tr>;
          })}
        </tbody>;
      })}
      <tbody ref={onGroupBody}/>
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
  </div></>;
}
