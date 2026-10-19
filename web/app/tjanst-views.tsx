'use client';

import { useId } from 'react';
import { Link2, Pencil, Unlink } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TJANST_SPECIAL_KINDS, type TjanstJoint, type TjanstPlanRead, type TjanstRow, type TjanstSpecial } from '@/lib/tjanst-contract.ts';
import { teacherSums } from '@/lib/tjanst-model.ts';
import { classCoverage, entryDeviation, jointOf, rowTime, sortTeachers, subjectOf, type TjanstClassGroup } from './tjanst-matrix';
import type { TjanstFeedback } from './tjanst-publish-panel';
import { timeText } from './tjanst-publish-panel';
import TjanstServiceSummary, { formatDeviation, formatTime, needValue, SPECIAL_KIND_LABEL, termValue, yearLabel, type TjanstSummaryRow, type TjanstTermView } from './tjanst-service-summary';

const personName = (data: TjanstPlanRead, personId: string | null) => personId === null ? 'Vakant' : data.teachers.find(t => t.personId === personId)?.displayName ?? 'Okänd lärare';
const className = (data: TjanstPlanRead, classId: string) => data.classes.find(c => c.classId === classId)?.name ?? 'Okänd klass';
const rowLabel = (data: TjanstPlanRead, row: TjanstRow) => data.classes.find(c => c.classId === row.classId)?.needs.find(n => n.sourceKey === row.sourceKey)?.label ?? row.rowKey;
const jointClasses = (data: TjanstPlanRead, joint: TjanstJoint, except: string) =>
  [...new Set(joint.rowIds.map(id => data.rows.find(r => r.id === id)?.classId).filter((c): c is string => !!c && c !== except))].map(c => className(data, c));

/** Skärm 2. Kurser med alla lärare och täckning; okopplad klass visar bara texten om saknad koppling (D-04). */
export function TjanstClassView({ data, groups, classId, term, onClass, onOpenClassLinks }: { data: TjanstPlanRead; groups: TjanstClassGroup[]; classId: string; term: TjanstTermView;
  onClass: (classId: string) => void; onOpenClassLinks?: () => void }) {
  const id = useId(), group = groups.find(g => g.cls.classId === classId) ?? null;
  const teachersOf = (rows: TjanstRow[]) => rows.map(r => { const j = jointOf(r, data.joints), t = rowTime(r, data.joints);
    return { id: r.id, text: `${personName(data, r.personId)} · HT ${formatTime(t.ht)} · VT ${formatTime(t.vt)}`, joint: j ? `Samläsning med ${jointClasses(data, j, r.classId).join(', ')}` : null }; });
  return <section aria-label="Per klass" className="tjanst-view">
    <div className="protected-filter tjanst-picker"><label htmlFor={id}>Klass</label><select id={id} value={classId} onChange={e => onClass(e.target.value)}>
      <option value="" disabled>Välj klass</option>{data.classes.map(c => <option key={c.classId} value={c.classId}>{c.name}</option>)}</select></div>
    {!group ? <p className="tjanst-empty-text">Välj en klass för att se hur kurserna är fördelade.</p> : !group.cls.link ? <div className="tjanst-missing-card">
      <h2>{group.cls.name} · koppling saknas</h2><p>Klassen har ingen timplan för läsåret {yearLabel(data.schoolYear)}. Behovet är okänt, inte noll.</p>
      {onOpenClassLinks && <Button variant="outline" onClick={onOpenClassLinks}>Öppna klasskopplingar</Button>}</div> : <>
      <dl className="mandate-facts tjanst-facts">
        <div><dt>Timplan</dt><dd>{group.cls.link.seriesName} · version {group.cls.link.timplanVersion}</dd></div>
        <div><dt>Behov</dt><dd>{(() => { const n = group.entries.reduce<number | null>((sum, e) => { const v = needValue(e.need.needHt, e.need.needVt, term); return v === null ? sum : (sum ?? 0) + v; }, null); return n === null ? 'Okänt' : formatTime(n); })()}</dd></div>
        <div><dt>Fördelat</dt><dd>{formatTime(group.entries.reduce((sum, e) => sum + termValue(e.cov.covered, term), 0))}</dd></div>
        <div><dt>Täckning</dt><dd>{classCoverage(group.entries, term, data.joints)}</dd></div>
      </dl>
      {group.entries.length === 0 ? <p className="tjanst-empty-text">Inga rader matchar filtret.</p> : <>
        <Table className="tjanst-table tjanst-wide"><TableHeader><TableRow>{['Kurs/ämne', 'Behov HT', 'Behov VT', 'Fördelat HT', 'Fördelat VT', 'Lärare', 'Avvikelse'].map((h, i) =>
          <TableHead scope="col" key={h} className={i > 0 && i < 5 || i === 6 ? 'tjanst-num' : undefined}>{h}</TableHead>)}</TableRow></TableHeader>
          <TableBody>{group.entries.map(e => <TableRow key={e.need.sourceKey}>
            <TableCell className="tjanst-text">{e.need.label}</TableCell>
            <TableCell className="tjanst-num">{e.need.needHt === null ? 'Okänt' : formatTime(e.need.needHt)}</TableCell><TableCell className="tjanst-num">{e.need.needVt === null ? 'Okänt' : formatTime(e.need.needVt)}</TableCell>
            <TableCell className="tjanst-num">{formatTime(e.cov.covered.ht)}</TableCell><TableCell className="tjanst-num">{formatTime(e.cov.covered.vt)}</TableCell>
            <TableCell className="tjanst-text"><ul className="tjanst-plain-list">{teachersOf(e.rows).map(t => <li key={t.id}>{t.text}{t.joint && <><br/>{t.joint}</>}</li>)}</ul>
              <span className="tjanst-coverage">{classCoverage([e], 'ar', data.joints)}</span></TableCell>
            <TableCell className="tjanst-num">{formatDeviation(entryDeviation(e, term))}</TableCell>
          </TableRow>)}</TableBody></Table>
        <ul className="tjanst-cards">{group.entries.map(e => <li key={e.need.sourceKey} className="protected-card"><strong>{e.need.label}</strong>
          <span>Behov HT {e.need.needHt === null ? 'okänt' : formatTime(e.need.needHt)} · VT {e.need.needVt === null ? 'okänt' : formatTime(e.need.needVt)}</span>
          <span>Fördelat HT {formatTime(e.cov.covered.ht)} · VT {formatTime(e.cov.covered.vt)}</span>
          {teachersOf(e.rows).map(t => <span key={t.id}>{t.text}{t.joint ? ` · ${t.joint}` : ''}</span>)}<span>{classCoverage([e], 'ar', data.joints)}</span>
          {formatDeviation(entryDeviation(e, term)) && <span>Avvikelse {formatDeviation(entryDeviation(e, term))}</span>}</li>)}</ul>
      </>}
    </>}
  </section>;
}

/** Skärm 3. Samma innehåll som lärarens egen vy, utan kvittensformulär. Andra skolors uppgifter visas aldrig här (D-11). */
export function TjanstTeacherView({ data, personId, onTeacher, feedback }: { data: TjanstPlanRead; personId: string; onTeacher: (personId: string) => void; feedback?: TjanstFeedback }) {
  const id = useId(), teacher = data.teachers.find(t => t.personId === personId) ?? null;
  const teaching: TjanstSummaryRow[] = [], seen = new Set<string>();
  if (teacher) for (const r of data.rows) {
    const j = jointOf(r, data.joints);
    if (j) {
      const t = j.teachers.find(x => x.personId === personId);
      if (!t || seen.has(j.id)) continue; seen.add(j.id);
      const first = data.rows.find(x => x.id === j.rowIds[0])!;
      teaching.push({ id: j.id, course: rowLabel(data, first), className: className(data, first.classId), ht: t.ht, vt: t.vt, jointWith: jointClasses(data, j, first.classId) });
    } else if (r.personId === personId) teaching.push({ id: r.id, course: rowLabel(data, r), className: className(data, r.classId), ht: r.teacherHt, vt: r.teacherVt, jointWith: null });
  }
  const specials = data.specials.filter(s => s.personId === personId).map(s => ({ id: s.id, kind: s.kind, label: s.label, group: s.classId ? className(data, s.classId) : null, ht: s.ht, vt: s.vt }));
  const ack = feedback?.teachers.find(t => t.personId === personId), comments = feedback?.comments.filter(c => c.personId === personId) ?? [];
  return <section aria-label="Per lärare" className="tjanst-view">
    <div className="protected-filter tjanst-picker"><label htmlFor={id}>Lärare</label><select id={id} value={personId} onChange={e => onTeacher(e.target.value)}>
      {!teacher && <option value="">Välj lärare</option>}{sortTeachers(data.teachers).map(t => <option key={t.personId} value={t.personId}>{t.displayName}</option>)}</select></div>
    {!teacher ? <p className="tjanst-empty-text">{data.teachers.length ? 'Välj en lärare för att se tjänsten.' : 'Inga lärare finns i fördelningen ännu.'}</p> : <>
      <h2>{teacher.displayName}{teacher.draft && <Badge variant="outline" className="tjanst-badge">Ny lärare</Badge>}</h2>
      <p className="tjanst-meta">Personal-ID {teacher.personId}</p>
      <TjanstServiceSummary name={teacher.displayName} teaching={teaching} specials={specials} sums={teacherSums(personId, data.rows, data.specials, data.joints)} shareHere={teacher.shareHere}>
        {feedback && <section className="tjanst-feedback" aria-label="Återkoppling"><h3>Återkoppling för version {feedback.versionNo}</h3>
          <p><Badge variant="outline" className="tjanst-badge">{ack?.acknowledgedAt ? `Kvitterad ${timeText(ack.acknowledgedAt)}` : 'Inte kvitterad'}</Badge></p>
          {comments.length ? <ul className="tjanst-comments">{comments.map(c => <li key={c.id}><strong>{timeText(c.at)}</strong><p>{c.body}</p></li>)}</ul> : <p>Inga kommentarer.</p>}</section>}
      </TjanstServiceSummary>
    </>}
  </section>;
}

/** Skärm 4. Mentor visar sin klass; andra uppdrag får aldrig en påhittad grupp. */
export function TjanstSpecialView({ data, editable, onEdit }: { data: TjanstPlanRead; editable: boolean; onEdit: (special: TjanstSpecial, origin: HTMLElement) => void }) {
  const order = (s: TjanstSpecial) => TJANST_SPECIAL_KINDS.indexOf(s.kind);
  const list = [...data.specials].sort((a, b) => order(a) - order(b) || personName(data, a.personId).localeCompare(personName(data, b.personId), 'sv'));
  const title = (s: TjanstSpecial) => `${SPECIAL_KIND_LABEL[s.kind]}${s.label !== SPECIAL_KIND_LABEL[s.kind] ? ` · ${s.label}` : ''}`;
  const edit = (s: TjanstSpecial) => editable && <Button variant="outline" aria-label={`Ändra uppdraget ${title(s)} för ${personName(data, s.personId)}`} onClick={e => onEdit(s, e.currentTarget)}><Pencil size={16} aria-hidden="true"/>Ändra uppdraget</Button>;
  return <section aria-label="Specialuppdrag" className="tjanst-view">
    {list.length === 0 ? <p className="tjanst-empty-text">Inga specialuppdrag ännu.</p> : <>
      <Table className="tjanst-table tjanst-wide"><TableHeader><TableRow>{['Uppdrag', 'Lärare', 'Grupp', 'HT', 'VT', 'Läsår', 'Kommentar'].map((h, i) => <TableHead scope="col" key={h} className={i >= 3 && i <= 5 ? 'tjanst-num' : undefined}>{h}</TableHead>)}
        {editable && <TableHead scope="col"><span className="sr-only">Åtgärd</span></TableHead>}</TableRow></TableHeader>
        <TableBody>{list.map(s => <TableRow key={s.id}><TableCell className="tjanst-text">{title(s)}</TableCell><TableCell className="tjanst-text">{personName(data, s.personId)}</TableCell>
          <TableCell className="tjanst-text">{s.classId ? className(data, s.classId) : 'Ingen grupp'}</TableCell><TableCell className="tjanst-num">{formatTime(s.ht)}</TableCell><TableCell className="tjanst-num">{formatTime(s.vt)}</TableCell>
          <TableCell className="tjanst-num">{formatTime(s.ht + s.vt)}</TableCell><TableCell className="tjanst-text tjanst-prewrap">{s.comment}</TableCell>{editable && <TableCell>{edit(s)}</TableCell>}</TableRow>)}</TableBody></Table>
      <ul className="tjanst-cards">{list.map(s => <li key={s.id} className="protected-card"><strong>{title(s)}</strong><span>{personName(data, s.personId)} · {s.classId ? className(data, s.classId) : 'Ingen grupp'}</span>
        <span>HT {formatTime(s.ht)} · VT {formatTime(s.vt)} · Läsår {formatTime(s.ht + s.vt)}</span>{s.comment && <span className="tjanst-prewrap">{s.comment}</span>}</li>)}</ul>
    </>}
  </section>;
}

type CourseProps = { data: TjanstPlanRead; editable: boolean; marked: string[]; onMark: (rowIds: string[]) => void; markError: string | null;
  onLink: (origin: HTMLElement) => void; onEditJoint: (joint: TjanstJoint, origin: HTMLElement) => void; onDissolve: (joint: TjanstJoint, origin: HTMLElement) => void; visible: Set<string> };
/** Skärm 5. Samläsning skapas bara genom markering; inget förslag skapas automatiskt (D-16). */
export function TjanstCourseView({ data, editable, marked, onMark, markError, onLink, onEditJoint, onDissolve, visible }: CourseProps) {
  const rows = data.rows.filter(r => visible.has(r.sourceKey));
  const line = (r: TjanstRow) => { const t = rowTime(r, data.joints), label = rowLabel(data, r), cls = className(data, r.classId);
    return <li key={r.id} className="tjanst-course-row">
      {editable && <label className="tjanst-mark"><input type="checkbox" checked={marked.includes(r.id)} onChange={e => onMark(e.target.checked ? [...marked, r.id] : marked.filter(id => id !== r.id))}/>
        <span className="sr-only">Markera {label} {cls}, {personName(data, r.personId)}</span></label>}
      <span><span className="tjanst-label">Klass</span>{cls}</span><span><span className="tjanst-label">Lärare</span>{personName(data, r.personId)}</span>
      <span className="tjanst-num"><span className="tjanst-label">HT</span>{formatTime(t.ht)}</span><span className="tjanst-num"><span className="tjanst-label">VT</span>{formatTime(t.vt)}</span>
      {r.jointGroupId && <Badge variant="outline" className="tjanst-badge"><Link2 size={16} aria-hidden="true"/>Samläsning</Badge>}
    </li>; };
  const courses = new Map<string, TjanstRow[]>();
  for (const r of rows.filter(x => x.jointGroupId === null)) { const label = rowLabel(data, r); courses.set(label, [...(courses.get(label) ?? []), r]); }
  const sorted = [...courses.entries()].sort(([a], [b]) => subjectOf(a).localeCompare(subjectOf(b), 'sv') || a.localeCompare(b, 'sv'));
  const joints = data.joints.filter(j => j.rowIds.some(id => rows.some(r => r.id === id)));
  return <section aria-label="Per kurs/ämne" className="tjanst-view">
    {editable && marked.length === 0 && <p className="tjanst-empty-text">Markera rader i olika klasser för att koppla dem till en samläsning.</p>}
    {rows.length === 0 && <p className="tjanst-empty-text">Inga tjänsterader ännu.</p>}
    {joints.map(j => <section key={j.id} className="tjanst-joint" aria-label={`Samläsning: ${j.name}`}><h3>Samläsning: {j.name}</h3>
      <ul className="tjanst-plain-list">{j.rowIds.map(id => data.rows.find(r => r.id === id)).filter((r): r is TjanstRow => !!r).map(r => <li key={r.id} className="tjanst-joint-line">{rowLabel(data, r)}<ul className="tjanst-plain-list">{line(r)}</ul></li>)}</ul>
      <p>Lärartid för gruppen: {j.teachers.length ? j.teachers.map(t => `${personName(data, t.personId)} HT ${formatTime(t.ht)} · VT ${formatTime(t.vt)}`).join('; ') : 'ingen lärare'}</p>
      {editable && <div className="mandate-actions"><Button variant="outline" onClick={e => onEditJoint(j, e.currentTarget)}>Ändra samläsningen</Button>
        <Button variant="outline" onClick={e => onDissolve(j, e.currentTarget)}><Unlink size={16} aria-hidden="true"/>Lös upp samläsningen</Button></div>}
    </section>)}
    {sorted.map(([label, list]) => <section key={label} className="tjanst-course-group" aria-label={label}><h3>{label}</h3><ul className="tjanst-plain-list">{list.map(line)}</ul></section>)}
    {editable && marked.length > 0 && <section className="tjanst-selection" aria-label="Markerade rader">
      <output>{marked.length} {marked.length === 1 ? 'rad markerad' : 'rader markerade'}</output>
      <Button aria-describedby={markError ? 'tjanst-mark-error' : undefined} onClick={e => onLink(e.currentTarget)}>Koppla till samläsning…</Button>
      <Button variant="outline" onClick={() => onMark([])}>Avmarkera alla</Button>
      {markError && <small id="tjanst-mark-error" role="alert" className="field-error">{markError}</small>}
    </section>}
  </section>;
}
