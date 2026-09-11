'use client';
import { useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowUp,
  ArrowRight,
  ArrowUpRight,
  ArrowLeft,
  Search,
  Plus,
  X,
  Users,
  BookOpen,
  CheckCheck,
  AlertTriangle,
  CalendarDays,
  Layers3,
  ChevronRight,
  History,
  GraduationCap,
  CircleCheck,
  Download,
  Pencil,
  MapPin,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetTitle,
  SheetDescription,
  SheetClose,
} from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import {
  pupilIssues,
  groupPreview,
  applyGroup,
  scheduleConflicts,
  slotPreview,
  slotLanes,
  applySlot,
  savePlanDraft,
  discardPlanDraft,
  dayNames,
  timeLabel,
  rooms,
  teachers,
  uid,
  planSyllabusIssues,
  type AdminState,
  type AdminView,
  type Pupil,
  type Slot,
  type PlanItem,
} from '@/lib/admin-model';
import {
  code as syllabusCode,
  regimeOf,
  snapshotInfo,
} from '@/lib/syllabus.ts';

function Pick({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <Select
      value={value}
      onValueChange={(v) => {
        if (v !== null) onChange(v);
      }}
      items={options}
    >
      <SelectTrigger className="admin-select" aria-label={label}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
const initials = (name: string) =>
  name
    .split(' ')
    .map((p) => p[0])
    .slice(0, 2)
    .join('');
function Status({ pupil }: { pupil: Pupil }) {
  const issues = pupilIssues(pupil);
  return issues.length ? (
    <span className="a-status amber">
      <span />
      {issues[0]}
      {issues.length > 1 ? ` +${issues.length - 1}` : ''}
    </span>
  ) : (
    <span className="a-status">
      <span />
      Aktiv
    </span>
  );
}
const titles: Record<AdminView, { title: string; sub: string; index: string }> =
  {
    students: {
      title: 'Alla elever',
      sub: 'Elevens utbildning, grupper och planering. Samlat.',
      index: '01',
    },
    plans: {
      title: 'Studieplaner',
      sub: 'Utbildningsvägen, från innehåll till undervisning.',
      index: '02',
    },
    groups: {
      title: 'Grupper',
      sub: 'Rätt elever. Rätt undervisning. Plats för alla.',
      index: '03',
    },
    planning: {
      title: 'Schema & resurser',
      sub: 'Se helheten. Förstå konsekvensen innan du ändrar.',
      index: '04',
    },
  };
export default function AdminWorkspace({
  view,
  onNavigate,
  state,
  setState,
  unitId,
}: {
  view: AdminView;
  onNavigate: (v: AdminView) => void;
  /** Sessionsdata ägs av sidan så att läsårsvyn kan räkna på samma schema. */
  state: AdminState;
  setState: React.Dispatch<React.SetStateAction<AdminState>>;
  /** Vald exempelskola; elevlistor, filter och räkningar avser bara den skolan. */
  unitId: string;
}) {
  const [query, setQuery] = useState('');
  const [classFilter, setClassFilter] = useState('all');
  const [filter, setFilter] = useState('all');
  const [ascending, setAscending] = useState(true);
  const [selected, setSelected] = useState<string[]>([]);
  const [pupilId, setPupilId] = useState<string | null>(null);
  const [planId, setPlanId] = useState('E-1001');
  const [groupId, setGroupId] = useState('ma-a');
  const [batchIds, setBatchIds] = useState<string[] | null>(null);
  const [targetGroup, setTargetGroup] = useState('ma-b');
  const [editSlot, setEditSlot] = useState<Slot | null>(null);
  const [step, setStep] = useState('edit');
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [newClass, setNewClass] = useState('SA26A');
  const [newPupil, setNewPupil] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [planEdit, setPlanEdit] = useState(false);
  const [draftItems, setDraftItems] = useState<PlanItem[]>([]);
  const [draftReason, setDraftReason] = useState('');
  const [resource, setResource] = useState('all');
  const [planSearch, setPlanSearch] = useState('');
  const conflicts = useMemo(() => scheduleConflicts(state), [state]);
  // Elever vid vald skola. Id-uppslag, id-generering och skrivningar går
  // fortfarande mot hela registret så att andra skolans elever bevaras.
  const unitPupils = useMemo(() => state.pupils.filter((p) => p.unitId === unitId), [state.pupils, unitId]);
  const attention = unitPupils.filter((p) => pupilIssues(p).length);
  const classNames = [...new Set(unitPupils.map((p) => p.className))];
  // Klassen för en ny elev måste finnas vid vald skola; annars väljs skolans första klass.
  const pupilClass = classNames.includes(newClass) ? newClass : (classNames[0] ?? '');
  const visible = unitPupils
    .filter(
      (p) =>
        (classFilter === 'all' || p.className === classFilter) &&
        (filter === 'all' ||
          (filter === 'attention' && pupilIssues(p).length > 0) ||
          (filter === 'new' && p.status === 'Inskrivning')) &&
        `${p.name} ${p.id} ${p.className} ${p.program}`
          .toLocaleLowerCase('sv')
          .includes(query.toLocaleLowerCase('sv')),
    )
    .sort((a, b) => (ascending ? 1 : -1) * a.name.localeCompare(b.name, 'sv'));
  const pupil = state.pupils.find((p) => p.id === pupilId);
  const planPupil =
    state.pupils.find((p) => p.id === planId) ?? unitPupils[0];
  const group = state.groups.find((g) => g.id === groupId) ?? state.groups[0];
  const preview = batchIds ? groupPreview(state, batchIds, targetGroup) : null;
  const schedulePreview = editSlot ? slotPreview(state, editSlot) : null;
  const allSelected =
    visible.length > 0 && visible.every((p) => selected.includes(p.id));
  const clearSelection = () => setSelected([]);
  function openBatch(ids: string[], preferred?: string) {
    setBatchIds(ids);
    setTargetGroup(preferred ?? 'ma-b');
    setStep('edit');
    setError('');
  }
  function openPlan(id: string) {
    setPlanId(id);
    setPupilId(null);
    onNavigate('plans');
  }
  function openGroup(id: string) {
    setGroupId(id);
    setPupilId(null);
    onNavigate('groups');
  }
  function commitGroup() {
    try {
      setState(applyGroup(state, batchIds ?? [], targetGroup));
      setNotice(
        'Gruppbytet är genomfört i exemplet. Medlemskap och planreferenser är uppdaterade.',
      );
      setBatchIds(null);
      setSelected([]);
      setError('');
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Ändringen kunde inte genomföras.',
      );
    }
  }
  function downloadSelection() {
    const ids = selected.length ? selected : visible.map((p) => p.id);
    const safe = (v: string) =>
      '"' + (/^[=+@\-\t\r]/.test(v) ? "'" + v : v).replaceAll('"', '""') + '"';
    const rows = [
      ['Elev-ID', 'Namn', 'Klass', 'Utbildning', 'Mentor'],
      ...state.pupils
        .filter((p) => ids.includes(p.id))
        .map((p) => [p.id, p.name, p.className, p.program, p.mentor]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ['\uFEFF' + rows.map((r) => r.map(safe).join(';')).join('\r\n')],
        { type: 'text/csv;charset=utf-8' },
      ),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'skolplattformen-exempelelever.csv';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNotice(`${ids.length} exempelelever exporterade.`);
  }
  return (
    <div className="admin-workspace">
      <div className="admin-heading">
        <div>
          <div className="admin-kicker">
            <span>ADMINISTRATION</span>
            <span className="kicker-line" /> HÖSTTERMINEN 2026
          </div>
          <h1>
            {titles[view].title}
            <span className="admin-page-number">/{titles[view].index}</span>
          </h1>
          <p>{titles[view].sub}</p>
        </div>
        <div className="admin-heading-actions">
          <Button variant="outline" onClick={() => setHistoryOpen(true)}>
            <History size={16} /> Ändringslogg{' '}
            {state.changes.length > 0 && (
              <span className="button-count">{state.changes.length}</span>
            )}
          </Button>
          {view === 'students' && (
            <Button
              onClick={() => {
                setNewPupil(true);
                setError('');
              }}
            >
              <Plus size={17} /> Lägg till elev
            </Button>
          )}
        </div>
      </div>
      <div className="admin-context">
        <span className="context-school">
          <GraduationCap size={16} /> Testskolan
        </span>
        <span>Grundskola & gymnasium</span>
        <span className="context-demo">
          Syntetiska exempel · ändringar gäller denna session
        </span>
      </div>
      {notice && (
        <output className="admin-notice">
          <CheckCheck size={17} />
          <span>{notice}</span>
          <button aria-label="Stäng meddelandet" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </output>
      )}
      {view === 'students' && (
        <>
          <div className="register-top">
            <div className="register-tabs">
              <button
                className={filter === 'all' ? 'active' : ''}
                onClick={() => {
                  setFilter('all');
                  clearSelection();
                }}
              >
                Alla elever <span>{unitPupils.length}</span>
              </button>
              <button
                className={filter === 'attention' ? 'active' : ''}
                onClick={() => {
                  setFilter('attention');
                  clearSelection();
                }}
              >
                Att följa upp{' '}
                <span className="amber-count">{attention.length}</span>
              </button>
              <button
                className={filter === 'new' ? 'active' : ''}
                onClick={() => {
                  setFilter('new');
                  clearSelection();
                }}
              >
                Inskrivning{' '}
                <span>
                  {
                    unitPupils.filter((p) => p.status === 'Inskrivning')
                      .length
                  }
                </span>
              </button>
            </div>
          </div>
          <div className="register-layout">
            <section className="register-surface">
              <div className="register-toolbar">
                <div className="admin-search">
                  <Search size={17} />
                  <Input
                    aria-label="Sök elev, elev-ID eller klass"
                    placeholder="Sök namn, elev-ID eller klass…"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      clearSelection();
                    }}
                  />
                </div>
                <Pick
                  label="Filtrera klass"
                  value={classFilter}
                  onChange={(v) => {
                    setClassFilter(v);
                    clearSelection();
                  }}
                  options={[
                    { value: 'all', label: 'Alla klasser' },
                    ...classNames.map((c) => ({ value: c, label: c })),
                  ]}
                />
                <Button
                  className="export-button"
                  variant="ghost"
                  onClick={downloadSelection}
                >
                  <Download size={16} />
                  <span>Exportera</span>
                </Button>
              </div>
              {selected.length > 0 && (
                <div className="batch-bar">
                  <strong>{selected.length} elever valda</strong>
                  <button onClick={() => openBatch(selected)}>
                    Byt undervisningsgrupp <ArrowRight size={15} />
                  </button>
                  <button className="batch-clear" onClick={clearSelection}>
                    Avmarkera
                  </button>
                </div>
              )}
              <div className="desktop-register">
                <Table className="admin-table">
                  <TableHeader>
                    <TableRow>
                      <TableHead className="check-cell">
                        <Checkbox
                          aria-label="Markera alla synliga elever"
                          checked={allSelected}
                          indeterminate={!allSelected && selected.length > 0}
                          onCheckedChange={() =>
                            setSelected(
                              allSelected ? [] : visible.map((p) => p.id),
                            )
                          }
                        />
                      </TableHead>
                      <TableHead
                        aria-sort={ascending ? 'ascending' : 'descending'}
                      >
                        <button
                          className="sort-heading"
                          onClick={() => setAscending(!ascending)}
                        >
                          Elev{' '}
                          {ascending ? (
                            <ArrowUp size={13} />
                          ) : (
                            <ArrowDown size={13} />
                          )}
                        </button>
                      </TableHead>
                      <TableHead>Klass</TableHead>
                      <TableHead>Utbildning</TableHead>
                      <TableHead>Mentor</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>
                        <span className="sr-only">Öppna elev</span>
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {visible.map((p, i) => (
                      <TableRow
                        key={p.id}
                        data-state={
                          selected.includes(p.id) ? 'selected' : undefined
                        }
                      >
                        <TableCell className="check-cell">
                          <Checkbox
                            aria-label={`Markera ${p.name}`}
                            checked={selected.includes(p.id)}
                            onCheckedChange={(checked) =>
                              setSelected(
                                checked
                                  ? [...selected, p.id]
                                  : selected.filter((id) => id !== p.id),
                              )
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <button
                            className="pupil-link"
                            onClick={() => setPupilId(p.id)}
                          >
                            <span className={'pupil-avatar tone-' + (i % 4)}>
                              {initials(p.name)}
                            </span>
                            <span>
                              <strong>{p.name}</strong>
                              <small>{p.id}</small>
                            </span>
                          </button>
                        </TableCell>
                        <TableCell>
                          <button
                            className="class-chip"
                            onClick={() => {
                              setClassFilter(p.className);
                              clearSelection();
                            }}
                          >
                            {p.className}
                          </button>
                        </TableCell>
                        <TableCell>
                          <span className="program-short">{p.program}</span>
                          <small className="cell-secondary">{p.regime}</small>
                        </TableCell>
                        <TableCell>
                          <span className="mentor-cell">{p.mentor}</span>
                        </TableCell>
                        <TableCell>
                          <Status pupil={p} />
                        </TableCell>
                        <TableCell>
                          <button
                            className="row-arrow"
                            onClick={() => setPupilId(p.id)}
                            aria-label={`Öppna ${p.name}`}
                          >
                            <ArrowUpRight size={17} />
                          </button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mobile-register">
                {visible.map((p) => (
                  <div className="mobile-pupil" key={p.id}>
                    <Checkbox
                      aria-label={`Markera ${p.name}`}
                      checked={selected.includes(p.id)}
                      onCheckedChange={(checked) =>
                        setSelected(
                          checked
                            ? [...selected, p.id]
                            : selected.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <button onClick={() => setPupilId(p.id)}>
                      <span className="pupil-avatar">{initials(p.name)}</span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>
                          {p.id} · {p.className}
                        </small>
                        <Status pupil={p} />
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  </div>
                ))}
              </div>
              {!visible.length && (
                <div className="admin-empty">
                  <Search size={26} />
                  <h2>Inga elever matchar urvalet</h2>
                  <p>Pröva ett annat namn eller ta bort filtreringen.</p>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setQuery('');
                      setFilter('all');
                      setClassFilter('all');
                      clearSelection();
                    }}
                  >
                    Visa alla elever
                  </Button>
                </div>
              )}
              <div className="table-summary">
                <span>
                  {visible.length} av {unitPupils.length} elever
                </span>
                <span>Sorterat på namn · {ascending ? 'A–Ö' : 'Ö–A'}</span>
              </div>
            </section>
            <aside className="admin-rail">
              <div className="rail-title">
                <span className="rail-dot" /> ATT TA VIDARE
              </div>
              <h2>
                Små luckor.
                <br />
                Tydliga nästa steg.
              </h2>
              <p className="rail-intro">
                Samlat från elevregistret och planeringen.
              </p>
              <button
                className="rail-task"
                onClick={() => {
                  const p = unitPupils.find((p) =>
                    p.plan.some((i) => i.points > 0 && !i.groupId),
                  );
                  if (p) openPlan(p.id);
                }}
                disabled={
                  !unitPupils.some((p) =>
                    p.plan.some((i) => i.points > 0 && !i.groupId),
                  )
                }
              >
                <span className="rail-task-icon">
                  <Users size={19} />
                </span>
                <span>
                  <strong>
                    {
                      unitPupils.filter((p) =>
                        p.plan.some((i) => i.points > 0 && !i.groupId),
                      ).length
                    }{' '}
                    elever saknar grupp
                  </strong>
                  <small>Kontrollera studieplanens kopplingar</small>
                </span>
                <ChevronRight size={16} />
              </button>
              <button
                className="rail-task"
                onClick={() => {
                  const p = unitPupils.find((p) => p.draft);
                  if (p) openPlan(p.id);
                }}
                disabled={!unitPupils.some((p) => p.draft)}
              >
                <span className="rail-task-icon">
                  <BookOpen size={19} />
                </span>
                <span>
                  <strong>
                    {unitPupils.filter((p) => p.draft).length} planutkast att
                    granska
                  </strong>
                  <small>Jämför ändringen med gällande plan</small>
                </span>
                <ChevronRight size={16} />
              </button>
              <button
                className="rail-task"
                onClick={() => onNavigate('planning')}
              >
                <span className="rail-task-icon amber">
                  <CalendarDays size={19} />
                </span>
                <span>
                  <strong>
                    {conflicts.length} schemakrock
                    {conflicts.length !== 1 ? 'ar' : ''}
                  </strong>
                  <small>
                    {conflicts.length
                      ? 'Lokal eller resurs behöver ses över'
                      : 'Inga krockar i exempelunderlaget'}
                  </small>
                </span>
                <ChevronRight size={16} />
              </button>
              <div className="rail-bottom">
                <Layers3 size={19} />
                <strong>En ändring, ett sammanhang.</strong>
                <p>
                  Ett gruppbyte följer med till studieplanen och elevens
                  schematillhörighet.
                </p>
              </div>
            </aside>
          </div>
        </>
      )}
      {view === 'plans' && (
        <div className="plans-layout">
          <aside className="plan-directory">
            <div className="admin-search">
              <Search size={16} />
              <Input
                placeholder="Sök studieplan…"
                aria-label="Sök studieplan"
                value={planSearch}
                onChange={(e) => setPlanSearch(e.target.value)}
              />
            </div>
            <div className="directory-caption">GYMNASIET · TERMINSUTDRAG</div>
            {unitPupils
              .filter(
                (p) =>
                  p.regime !== 'Grundskola' &&
                  `${p.name} ${p.className}`
                    .toLowerCase()
                    .includes(planSearch.toLowerCase()),
              )
              .map((p) => (
                <button
                  className={'plan-person ' + (planId === p.id ? 'active' : '')}
                  key={p.id}
                  onClick={() => setPlanId(p.id)}
                >
                  <span className="pupil-avatar">{initials(p.name)}</span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>
                      {p.className} · {p.regime}
                    </small>
                  </span>
                  {pupilIssues(p).length > 0 && (
                    <span
                      className="person-alert"
                      aria-label="Uppgift att följa upp"
                    />
                  )}
                </button>
              ))}
          </aside>
          <section className="plan-canvas">
            <div className="plan-cover">
              <div>
                <span className="admin-kicker">
                  INDIVIDUELL STUDIEPLAN · UTDRAG
                </span>
                <h2>{planPupil.name}</h2>
                <p>
                  {planPupil.program} <span>/{planPupil.className}</span>
                </p>
              </div>
              <span className="regime-badge">{planPupil.regime}</span>
            </div>
            <div className="plan-info-line">
              <span>Version {planPupil.planVersion}</span>
              <span>Start {planPupil.start}</span>
              <span>Mentor {planPupil.mentor}</span>
              <button onClick={() => setPupilId(planPupil.id)}>
                Elevöversikt <ArrowUpRight size={14} />
              </button>
            </div>
            {planPupil.goal && (
              <div className="im-goal">
                <GraduationCap size={19} />
                <div>
                  <strong>Utbildningens mål</strong>
                  <p>{planPupil.goal}</p>
                  <small>
                    Planerad period: {planPupil.start} – {planPupil.end}
                  </small>
                </div>
              </div>
            )}
            <div className="plan-section-heading">
              <h3>Studieinnehåll</h3>
              <Button
                variant="outline"
                onClick={() => {
                  setDraftItems(
                    structuredClone(
                      planPupil.draft?.items ??
                        (planPupil.plan.length
                          ? planPupil.plan
                          : (
                              state.pupils.find(
                                (p) =>
                                  p.className === planPupil.className &&
                                  p.plan.length,
                              )?.plan ?? []
                            ).map((i) => ({ ...i, groupId: null }))),
                    ),
                  );
                  setDraftReason(planPupil.draft?.reason ?? '');
                  setPlanEdit(true);
                  setError('');
                }}
              >
                <Pencil size={15} />
                {planPupil.draft ? 'Redigera utkast' : 'Förbered ändring'}
              </Button>
            </div>
            {planSyllabusIssues(planPupil).length > 0 && (
              <div className="plan-syllabus-alert validation-warning">
                {planSyllabusIssues(planPupil).map(({ item, issues }) => (
                  <p key={item.id}>
                    <AlertTriangle size={16} />
                    <span>
                      <strong>{item.name}</strong>
                      {issues.map((issue) => (
                        <span key={issue}>{issue}</span>
                      ))}
                    </span>
                  </p>
                ))}
              </div>
            )}
            <Table className="admin-table plan-table">
              <TableHeader>
                <TableRow>
                  <TableHead>
                    {planPupil.regime === 'Gy11'
                      ? 'Kurs'
                      : 'Ämne och nivå / insats'}
                  </TableHead>
                  <TableHead>Poäng</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Undervisningsgrupp</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {planPupil.plan.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell>
                      <strong className="module-name">{item.name}</strong>
                      <span className="cell-secondary">
                        {item.syllabus ? (
                          <>
                            {syllabusCode(item.syllabus)} ·{' '}
                            {regimeOf(item.syllabus)} · Skolverket
                          </>
                        ) : (
                          'Lokalt innehåll utan nationell kod'
                        )}
                      </span>
                    </TableCell>
                    <TableCell>{item.points || '—'}</TableCell>
                    <TableCell>{item.period}</TableCell>
                    <TableCell>
                      {item.groupId ? (
                        <button
                          className="group-reference"
                          onClick={() => openGroup(item.groupId!)}
                        >
                          {
                            state.groups.find((g) => g.id === item.groupId)
                              ?.name
                          }
                          <ArrowUpRight size={13} />
                        </button>
                      ) : item.points > 0 ? (
                        <button
                          className="missing-group"
                          onClick={() =>
                            openBatch(
                              [planPupil.id],
                              state.groups.find((g) => g.moduleId === item.id)
                                ?.id,
                            )
                          }
                        >
                          Koppla grupp <Plus size={13} />
                        </button>
                      ) : (
                        <span className="cell-secondary">
                          Utanför undervisningsgrupp
                        </span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="plan-total">
              <span>{planPupil.plan.length} delar i terminsutdraget</span>
              <strong>
                {planPupil.plan.reduce((n, i) => n + i.points, 0)} planerade
                poäng
              </strong>
            </div>
            {planPupil.draft && (
              <section className="plan-draft">
                <div className="section-heading">
                  <h3>
                    <Pencil size={17} /> Ändringsutkast
                  </h3>
                  <span className="a-status amber">Ej fastställt</span>
                </div>
                <p>{planPupil.draft.reason}</p>
                {planPupil.draft.basedOn !== planPupil.planVersion && (
                  <div className="validation-warning">
                    Gällande plan har ändrats sedan utkastet skapades. Jämför
                    gruppkopplingarna före fortsatt granskning.
                  </div>
                )}
                <div className="draft-diffs">
                  {planPupil.draft.items.map(
                    (item, i) =>
                      JSON.stringify(item) !==
                        JSON.stringify(planPupil.plan[i]) && (
                        <div key={item.id}>
                          <strong>{item.name}</strong>
                          <span>
                            {planPupil.plan[i]
                              ? `${planPupil.plan[i].period} · ${planPupil.plan[i].points} p · ${state.groups.find((g) => g.id === planPupil.plan[i].groupId)?.name ?? 'Ingen grupp'}`
                              : 'Finns inte i gällande plan'}
                          </span>
                          <ArrowRight size={15} />
                          <span>
                            {item.period} · {item.points} p ·{' '}
                            {state.groups.find((g) => g.id === item.groupId)
                              ?.name ?? 'Ingen grupp'}
                          </span>
                        </div>
                      ),
                  )}
                </div>
                <div className="plan-draft-footer">
                  <span>
                    Utkastet har inte ändrat gällande innehåll eller schema.
                  </span>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setState((s) => discardPlanDraft(s, planPupil.id));
                      setNotice(
                        'Planutkastet togs bort. Gällande plan är oförändrad.',
                      );
                    }}
                  >
                    Ta bort utkast
                  </Button>
                </div>
              </section>
            )}
            <div className="plan-boundary">
              <BookOpen size={17} />
              <p>
                Terminsutdraget visar exempel på studieinnehåll. Hela
                utbildningen, examenskrav och formella beslut ingår inte i denna
                kontroll.
              </p>
            </div>
          </section>
        </div>
      )}
      {view === 'groups' && (
        <div className="groups-layout">
          <aside className="group-directory">
            <div className="directory-heading">
              <h2>Undervisningsgrupper</h2>
              <span>{state.groups.length}</span>
            </div>
            {state.groups.map((g) => (
              <button
                className={
                  'group-directory-item ' + (groupId === g.id ? 'active' : '')
                }
                key={g.id}
                onClick={() => setGroupId(g.id)}
              >
                <span className="group-symbol">
                  <Layers3 size={18} />
                </span>
                <span>
                  <strong>{g.name}</strong>
                  <small>{g.subject}</small>
                </span>
                <span className="group-size">{g.members.length}</span>
              </button>
            ))}
          </aside>
          <section>
            <div className="group-cover">
              <div className="group-cover-icon">
                <Users size={28} />
              </div>
              <div>
                <span className="admin-kicker">
                  UNDERVISNINGSGRUPP · {group.regime}
                  {group.syllabus && ` · ${syllabusCode(group.syllabus)}`}
                </span>
                <h2>{group.name}</h2>
                <p>{group.subject}</p>
              </div>
              <div className="capacity-ring">
                <strong>
                  {group.members.length}
                  <small>/{group.capacity}</small>
                </strong>
                <span>elever / platser</span>
              </div>
            </div>
            <div className="group-metadata">
              <span>
                <GraduationCap size={17} />
                {group.teacher}
              </span>
              <span>
                <CalendarDays size={16} /> HT 2026
              </span>
              <span>
                <Layers3 size={16} />
                {[
                  ...new Set(
                    unitPupils
                      .filter((p) => group.members.includes(p.id))
                      .map((p) => p.className),
                  ),
                ].join(', ') || 'Inga klasser'}
              </span>
              <span>
                <BookOpen size={16} />
                Skolverkets katalog, hämtad {snapshotInfo.fetched}
              </span>
            </div>
            <div className="group-member-heading">
              <h3>Elever i gruppen</h3>
              <Button variant="outline" onClick={() => openBatch([], group.id)}>
                <Plus size={16} /> Placera elever
              </Button>
            </div>
            <div className="group-members">
              {unitPupils
                .filter((p) => group.members.includes(p.id))
                .map((p) => (
                  <div className="group-member" key={p.id}>
                    <button
                      className="pupil-link"
                      onClick={() => setPupilId(p.id)}
                    >
                      <span className="pupil-avatar">{initials(p.name)}</span>
                      <span>
                        <strong>{p.name}</strong>
                        <small>{p.id}</small>
                      </span>
                    </button>
                    <span className="class-chip">{p.className}</span>
                    <button
                      className="row-arrow"
                      aria-label={`Byt grupp för ${p.name}`}
                      onClick={() =>
                        openBatch(
                          [p.id],
                          state.groups.find(
                            (g) =>
                              g.moduleId === group.moduleId &&
                              g.id !== group.id,
                          )?.id ?? group.id,
                        )
                      }
                    >
                      <ArrowRight size={17} />
                    </button>
                  </div>
                ))}
            </div>
            <section className="group-sessions">
              <div className="section-heading">
                <h3>Gruppens schemapass</h3>
                <button
                  className="text-link"
                  onClick={() => {
                    setResource(group.id);
                    onNavigate('planning');
                  }}
                >
                  Visa i schemat <ArrowUpRight size={14} />
                </button>
              </div>
              {state.slots
                .filter((s) => s.groupId === group.id)
                .map((s) => (
                  <button
                    className="group-session"
                    key={s.id}
                    onClick={() => {
                      setEditSlot({ ...s });
                      setStep('edit');
                      setError('');
                    }}
                  >
                    <span>
                      {dayNames[s.day]}
                      <strong>
                        {timeLabel(s.start)}–{timeLabel(s.start + s.duration)}
                      </strong>
                    </span>
                    <span>
                      <MapPin size={14} />
                      {s.room}
                    </span>
                    <span>{s.teacher}</span>
                    <Pencil size={15} />
                  </button>
                ))}
            </section>
          </section>
        </div>
      )}
      {view === 'planning' && (
        <>
          <div className="planning-toolbar">
            <div className="week-label">
              <CalendarDays size={18} />
              <strong>Veckomall · HT 2026</strong>
              <span>{state.slots.length} pass</span>
            </div>
            <Pick
              label="Visa gruppens schema"
              value={resource}
              onChange={setResource}
              options={[
                { value: 'all', label: 'Alla undervisningsgrupper' },
                ...state.groups.map((g) => ({ value: g.id, label: g.name })),
              ]}
            />
          </div>
          <div className="planning-layout">
            <section className="schedule-board">
              <div className="schedule-board-inner">
                <div className="a-time-axis">
                  <div />
                  {[
                    '08.00',
                    '09.00',
                    '10.00',
                    '11.00',
                    '12.00',
                    '13.00',
                    '14.00',
                    '15.00',
                    '16.00',
                  ].map((t) => (
                    <span key={t}>{t}</span>
                  ))}
                </div>
                {dayNames.map((day, d) => (
                  <div className="a-day-column" key={day}>
                    <div className="a-day-heading">
                      <span>{day}</span>
                      <small>
                        {
                          state.slots.filter(
                            (s) =>
                              s.day === d &&
                              (resource === 'all' || s.groupId === resource),
                          ).length
                        }{' '}
                        pass
                      </small>
                    </div>
                    <div className="a-day-slots">
                      {state.slots
                        .filter(
                          (s) =>
                            s.day === d &&
                            (resource === 'all' || s.groupId === resource),
                        )
                        .map((s) => {
                          const g = state.groups.find(
                            (g) => g.id === s.groupId,
                          )!;
                          const clash = conflicts.some((c) =>
                            c.slotIds.includes(s.id),
                          );
                          const placement = slotLanes(
                            state.slots.filter(
                              (o) =>
                                resource === 'all' || o.groupId === resource,
                            ),
                          )[s.id];
                          return (
                            <button
                              key={s.id}
                              className={
                                'a-slot ' +
                                (clash ? 'clash' : '') +
                                ' ' +
                                (g.regime === 'Gy11'
                                  ? 'violet'
                                  : g.regime === 'Grundskola'
                                    ? 'green'
                                    : '')
                              }
                              style={{
                                top: (s.start - 480) * 1.3,
                                height: s.duration * 1.3 - 4,
                                left: `calc(${(placement.lane / placement.count) * 100}% + 4px)`,
                                width: `calc(${100 / placement.count}% - 8px)`,
                              }}
                              onClick={() => {
                                setEditSlot({ ...s });
                                setStep('edit');
                                setError('');
                              }}
                            >
                              <span>
                                {timeLabel(s.start)}–
                                {timeLabel(s.start + s.duration)}
                              </span>
                              <strong>{g.name}</strong>
                              <small>
                                {s.room} · {s.teacher.split(' ')[0]}
                              </small>
                              {clash && <AlertTriangle size={13} />}
                            </button>
                          );
                        })}
                    </div>
                  </div>
                ))}
              </div>
            </section>
            <aside className="schedule-inspector">
              <div className="section-heading">
                <h2>Kontrollcenter</h2>
                <span
                  className={'a-status ' + (conflicts.length ? 'amber' : '')}
                >
                  {conflicts.length} krockar
                </span>
              </div>
              <p>
                Kontrollerar lärare, lokaler, gemensamma elever och lokalernas
                kapacitet.
              </p>
              {conflicts.length === 0 ? (
                <div className="no-conflicts">
                  <CircleCheck size={28} />
                  <strong>Inga krockar hittade</strong>
                  <span>I det tillgängliga exempelunderlaget.</span>
                </div>
              ) : (
                conflicts.map((c) => (
                  <button
                    className="conflict-card"
                    key={c.key}
                    onClick={() => {
                      setEditSlot({
                        ...state.slots.find((s) => s.id === c.slotIds[0])!,
                      });
                      setStep('edit');
                      setError('');
                    }}
                  >
                    <AlertTriangle size={18} />
                    <strong>{c.message}</strong>
                    <span>
                      Granska och ändra pass <ArrowRight size={14} />
                    </span>
                  </button>
                ))
              )}
              <div className="resource-list">
                <h3>Lokaler</h3>
                {rooms.map((r) => (
                  <div key={r.id}>
                    <span>
                      <MapPin size={14} />
                      {r.id}
                    </span>
                    <span>{r.capacity} platser</span>
                  </div>
                ))}
              </div>
              <p className="small-note">
                Ingen synkronisering med Royal Schedule är ansluten. Ett ändrat
                pass gäller endast denna förhandsversion.
              </p>
            </aside>
          </div>
        </>
      )}
      <Sheet
        open={!!pupil}
        onOpenChange={(open) => {
          if (!open) setPupilId(null);
        }}
      >
        <SheetContent className="admin-student-sheet" showCloseButton={false}>
          <div className="sheet-topline">
            <span>ELEVÖVERSIKT</span>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Stäng elevöversikt"
                />
              }
            >
              <X size={20} />
            </SheetClose>
          </div>
          {pupil && (
            <>
              <div className="student-sheet-cover">
                <span className="large-avatar">{initials(pupil.name)}</span>
                <div>
                  <SheetTitle>{pupil.name}</SheetTitle>
                  <SheetDescription>
                    {pupil.id} · {pupil.className}
                  </SheetDescription>
                </div>
                <Status pupil={pupil} />
              </div>
              <div className="sheet-quick-actions">
                {pupil.regime !== 'Grundskola' && (
                  <Button onClick={() => openPlan(pupil.id)}>
                    <BookOpen size={16} /> Öppna studieplan
                  </Button>
                )}
                <Button
                  variant="outline"
                  onClick={() => {
                    setPupilId(null);
                    openBatch([pupil.id]);
                  }}
                >
                  <Users size={16} /> Byt grupp
                </Button>
              </div>
              <Tabs defaultValue="overview">
                <TabsList variant="line">
                  <TabsTrigger value="overview">Översikt</TabsTrigger>
                  <TabsTrigger value="groups">Grupper</TabsTrigger>
                  <TabsTrigger value="history">Historik</TabsTrigger>
                </TabsList>
                <TabsContent value="overview">
                  <dl className="pupil-facts">
                    <div>
                      <dt>Utbildning</dt>
                      <dd>{pupil.program}</dd>
                    </div>
                    <div>
                      <dt>Klass</dt>
                      <dd>{pupil.className}</dd>
                    </div>
                    <div>
                      <dt>Regelverk / skolform</dt>
                      <dd>{pupil.regime}</dd>
                    </div>
                    <div>
                      <dt>Mentor</dt>
                      <dd>{pupil.mentor}</dd>
                    </div>
                    <div>
                      <dt>Utbildningen startade</dt>
                      <dd>{pupil.start}</dd>
                    </div>
                    <div>
                      <dt>Undervisningsgrupper</dt>
                      <dd>
                        {
                          state.groups.filter((g) =>
                            g.members.includes(pupil.id),
                          ).length
                        }
                      </dd>
                    </div>
                  </dl>
                  <section className="pupil-attention">
                    <h3>Att följa upp</h3>
                    {pupilIssues(pupil).length ? (
                      pupilIssues(pupil).map((issue) => (
                        <p key={issue}>
                          <AlertTriangle size={15} />
                          {issue}
                        </p>
                      ))
                    ) : (
                      <p>
                        <CircleCheck size={16} /> Inga registrerade uppgifter i
                        exemplet.
                      </p>
                    )}
                  </section>
                  {pupil.regime === 'Grundskola' && (
                    <p className="small-note">
                      Gymnasial individuell studieplan används inte för denna
                      elev. Pedagogisk planering och eventuell IUP hanteras i
                      respektive arbetsflöde.
                    </p>
                  )}
                </TabsContent>
                <TabsContent value="groups">
                  <div className="sheet-group-list">
                    {state.groups
                      .filter((g) => g.members.includes(pupil.id))
                      .map((g) => (
                        <button key={g.id} onClick={() => openGroup(g.id)}>
                          <span className="group-symbol">
                            <Layers3 size={17} />
                          </span>
                          <span>
                            <strong>{g.name}</strong>
                            <small>
                              {g.teacher} · {g.subject}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                  </div>
                </TabsContent>
                <TabsContent value="history">
                  <div className="admin-history">
                    {state.changes
                      .filter((c) => c.pupilIds.includes(pupil.id))
                      .map((c) => (
                        <div key={c.id}>
                          <span>{c.time}</span>
                          <strong>{c.title}</strong>
                          <p>{c.detail}</p>
                        </div>
                      ))}
                    <div>
                      <span>Vid start av exemplet</span>
                      <strong>Elevuppgifter inlästa</strong>
                      <p>Syntetisk elevpost. Ingen extern registerhämtning.</p>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </>
          )}
        </SheetContent>
      </Sheet>
      <Dialog
        open={batchIds !== null}
        onOpenChange={(open) => {
          if (!open) setBatchIds(null);
        }}
      >
        <DialogContent className="admin-dialog" showCloseButton={false}>
          <div className="dialog-eyebrow">
            GRUPPLACERING <span>STEG {step === 'edit' ? '1' : '2'} AV 2</span>
          </div>
          <DialogTitle>
            {step === 'edit' ? 'Förbered gruppbytet' : 'Kontrollera ändringen'}
          </DialogTitle>
          <DialogDescription>
            Undervisningsgrupp ändras. Elevens klass och program ligger kvar.
          </DialogDescription>
          {step === 'edit' ? (
            <>
              <span className="field-label">Ny undervisningsgrupp</span>
              <Pick
                label="Ny undervisningsgrupp"
                value={targetGroup}
                onChange={setTargetGroup}
                options={state.groups.map((g) => ({
                  value: g.id,
                  label: `${g.name} · ${g.members.length}/${g.capacity} elever`,
                }))}
              />
              <div className="batch-selected-list">
                <h3>Elever i ändringen</h3>
                {batchIds?.length ? (
                  batchIds.map((id) => (
                    <div key={id}>
                      <span>{state.pupils.find((p) => p.id === id)?.name}</span>
                      <small>
                        {state.pupils.find((p) => p.id === id)?.className}
                      </small>
                      <button
                        aria-label={`Ta bort ${id} från urvalet`}
                        onClick={() =>
                          setBatchIds(batchIds.filter((x) => x !== id))
                        }
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))
                ) : (
                  <p className="muted">Välj elever nedan.</p>
                )}
              </div>
              <details className="eligible-pupils" open={!batchIds?.length}>
                <summary>Lägg till elever i urvalet</summary>
                {unitPupils
                  .filter((p) => {
                    const target = state.groups.find(
                      (g) => g.id === targetGroup,
                    )!;
                    return (
                      p.regime === target.regime &&
                      (p.regime === 'Grundskola' ||
                        p.plan.some((i) => i.id === target.moduleId)) &&
                      !target.members.includes(p.id)
                    );
                  })
                  .map((p) => (
                    <label key={p.id}>
                      <Checkbox
                        checked={batchIds?.includes(p.id) ?? false}
                        onCheckedChange={(checked) =>
                          setBatchIds(
                            checked
                              ? [...(batchIds ?? []), p.id]
                              : (batchIds ?? []).filter((id) => id !== p.id),
                          )
                        }
                      />
                      <span>{p.name}</span>
                      <small>{p.className}</small>
                    </label>
                  ))}
              </details>
            </>
          ) : (
            <>
              <div className="review-summary">
                <span>
                  {preview?.changes.length} elever får en ny grupplacering
                </span>
                <strong>
                  {state.groups.find((g) => g.id === targetGroup)?.name}
                </strong>
                <p>
                  Gruppreferensen i elevens studieplan följer med.
                  Schematillhörighet räknas ut från det nya medlemskapet.
                </p>
              </div>
              <div className="change-rows">
                {preview?.changes.map((change) => (
                  <div key={change.id}>
                    <strong>
                      {state.pupils.find((p) => p.id === change.id)?.name}
                    </strong>
                    <span>
                      {change.from} <ArrowRight size={14} /> {change.to}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
          {preview && preview.errors.length > 0 && (
            <div className="validation-warning" role="alert">
              {preview.errors.map((message) => (
                <p key={message}>
                  <AlertTriangle size={15} />
                  {message}
                </p>
              ))}
            </div>
          )}
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            {step === 'review' ? (
              <Button variant="outline" onClick={() => setStep('edit')}>
                <ArrowLeft size={15} /> Ändra
              </Button>
            ) : (
              <DialogClose render={<Button variant="outline" />}>
                Avbryt
              </DialogClose>
            )}
            <Button
              disabled={!preview || preview.errors.length > 0}
              onClick={() =>
                step === 'edit' ? setStep('review') : commitGroup()
              }
            >
              {step === 'edit'
                ? 'Granska ändring'
                : 'Genomför gruppbyte i exemplet'}
              <ArrowRight size={15} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!editSlot}
        onOpenChange={(open) => {
          if (!open) setEditSlot(null);
        }}
      >
        <DialogContent className="admin-dialog" showCloseButton={false}>
          <div className="dialog-eyebrow">
            SCHEMAÄNDRING{' '}
            <span>{step === 'edit' ? 'FÖRSLAG' : 'GRANSKNING'}</span>
          </div>
          <DialogTitle>
            {step === 'edit' ? 'Ändra ett schemapass' : 'Kontrollera påverkan'}
          </DialogTitle>
          <DialogDescription>
            {state.groups.find((g) => g.id === editSlot?.groupId)?.name} ·
            ändringen gäller veckomallen i exemplet.
          </DialogDescription>
          {editSlot && (
            <>
              {step === 'edit' ? (
                <div className="slot-form">
                  <div>
                    <span className="field-label">Veckodag</span>
                    <Pick
                      label="Veckodag"
                      value={String(editSlot.day)}
                      onChange={(v) =>
                        setEditSlot({ ...editSlot, day: Number(v) })
                      }
                      options={dayNames.map((label, i) => ({
                        value: String(i),
                        label,
                      }))}
                    />
                  </div>
                  <div>
                    <label className="field-label" htmlFor="slot-start">
                      Starttid
                    </label>
                    <input
                      id="slot-start"
                      type="time"
                      min="08:00"
                      max="16:00"
                      value={timeLabel(editSlot.start).replace('.', ':')}
                      onChange={(e) => {
                        const [h, m] = e.target.value.split(':').map(Number);
                        setEditSlot({ ...editSlot, start: h * 60 + m });
                      }}
                    />
                  </div>
                  <div>
                    <span className="field-label">Lokal</span>
                    <Pick
                      label="Lokal"
                      value={editSlot.room}
                      onChange={(v) => setEditSlot({ ...editSlot, room: v })}
                      options={rooms.map((r) => ({
                        value: r.id,
                        label: `${r.id} · ${r.capacity} platser`,
                      }))}
                    />
                  </div>
                  <div>
                    <span className="field-label">Lärare för passet</span>
                    <Pick
                      label="Lärare för passet"
                      value={editSlot.teacher}
                      onChange={(v) => setEditSlot({ ...editSlot, teacher: v })}
                      options={teachers.map((t) => ({ value: t, label: t }))}
                    />
                  </div>
                </div>
              ) : (
                <div className="schedule-before-after">
                  <div>
                    <small>Nuvarande</small>
                    <strong>
                      {
                        dayNames[
                          state.slots.find((s) => s.id === editSlot.id)!.day
                        ]
                      }{' '}
                      {timeLabel(
                        state.slots.find((s) => s.id === editSlot.id)!.start,
                      )}
                    </strong>
                    <span>
                      {state.slots.find((s) => s.id === editSlot.id)!.room} ·{' '}
                      {state.slots.find((s) => s.id === editSlot.id)!.teacher}
                    </span>
                  </div>
                  <ArrowRight size={20} />
                  <div>
                    <small>Förslag</small>
                    <strong>
                      {dayNames[editSlot.day]} {timeLabel(editSlot.start)}
                    </strong>
                    <span>
                      {editSlot.room} · {editSlot.teacher}
                    </span>
                  </div>
                </div>
              )}
              <div className="slot-impact">
                <Users size={17} />
                <span>
                  {
                    state.groups.find((g) => g.id === editSlot.groupId)?.members
                      .length
                  }{' '}
                  elever berörs · {editSlot.duration} minuter
                </span>
              </div>
              {schedulePreview?.errors.length ? (
                <div className="validation-warning" role="alert">
                  {schedulePreview.errors.map((message) => (
                    <p key={message}>
                      <AlertTriangle size={15} />
                      {message}
                    </p>
                  ))}
                </div>
              ) : (
                <div className="validation-success">
                  <CircleCheck size={17} /> Inga krockar för förslaget i
                  exempelunderlaget.
                </div>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <div className="dialog-actions">
                {step === 'review' ? (
                  <Button variant="outline" onClick={() => setStep('edit')}>
                    Ändra förslag
                  </Button>
                ) : (
                  <DialogClose render={<Button variant="outline" />}>
                    Avbryt
                  </DialogClose>
                )}
                <Button
                  disabled={
                    !schedulePreview || schedulePreview.errors.length > 0
                  }
                  onClick={() => {
                    if (step === 'edit') {
                      setStep('review');
                      return;
                    }
                    try {
                      setState(applySlot(state, editSlot));
                      setEditSlot(null);
                      setNotice(
                        'Schemapasset är ändrat i exemplet. Ingen information har skickats externt.',
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error
                          ? e.message
                          : 'Ändringen kunde inte genomföras.',
                      );
                    }
                  }}
                >
                  {step === 'edit'
                    ? 'Granska påverkan'
                    : 'Tillämpa i veckomallen'}
                  <ArrowRight size={15} />
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
      <Dialog open={planEdit} onOpenChange={setPlanEdit}>
        <DialogContent
          className="admin-dialog plan-edit-dialog"
          showCloseButton={false}
        >
          <div className="dialog-eyebrow">STUDIEPLAN · NYTT UTKAST</div>
          <DialogTitle>Förbered ändring för {planPupil.name}</DialogTitle>
          <DialogDescription>
            Gällande plan behålls. Spara ett förslag med orsak för fortsatt
            granskning.
          </DialogDescription>
          <div className="plan-edit-items">
            {draftItems.map((item, i) => (
              <div key={item.id}>
                <strong>{item.name}</strong>
                <div>
                  <label className="field-label" htmlFor={`points-${item.id}`}>
                    Poäng
                  </label>
                  <input
                    id={`points-${item.id}`}
                    type="number"
                    min="0"
                    max="1000"
                    step="50"
                    disabled={
                      item.points === 0 &&
                      planPupil.program === 'Introduktionsprogram'
                    }
                    value={item.points}
                    onChange={(e) =>
                      setDraftItems(
                        draftItems.map((x, j) =>
                          j === i
                            ? { ...x, points: Number(e.target.value) }
                            : x,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <span className="field-label">Planerad period</span>
                  <Pick
                    label={`Period för ${item.name}`}
                    value={item.period}
                    onChange={(v) =>
                      setDraftItems(
                        draftItems.map((x, j) =>
                          j === i ? { ...x, period: v } : x,
                        ),
                      )
                    }
                    options={[
                      { value: 'HT 2026', label: 'HT 2026' },
                      { value: 'VT 2027', label: 'VT 2027' },
                    ]}
                  />
                </div>
              </div>
            ))}
          </div>
          <label className="field-label" htmlFor="plan-change-reason">
            Orsak och vad som behöver stämmas av
          </label>
          <textarea
            id="plan-change-reason"
            rows={3}
            value={draftReason}
            onChange={(e) => setDraftReason(e.target.value)}
            placeholder="Beskriv behovet och vilka som ska delta i granskningen…"
          />
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <div className="dialog-actions">
            <DialogClose render={<Button variant="outline" />}>
              Avbryt
            </DialogClose>
            <Button
              onClick={() => {
                try {
                  setState(
                    savePlanDraft(state, planPupil.id, draftItems, draftReason),
                  );
                  setPlanEdit(false);
                  setNotice(
                    'Planutkastet är sparat. Gällande innehåll och schema är oförändrade.',
                  );
                } catch (e) {
                  setError(
                    e instanceof Error
                      ? e.message
                      : 'Kunde inte spara utkastet.',
                  );
                }
              }}
            >
              Spara ändringsutkast
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={newPupil} onOpenChange={setNewPupil}>
        <DialogContent className="admin-dialog" showCloseButton={false}>
          <div className="dialog-eyebrow">ELEVREGISTER</div>
          <DialogTitle>Lägg till en exempelelev</DialogTitle>
          <DialogDescription>
            Skapar ett inskrivningsunderlag i denna session. Lägg endast in
            syntetiska uppgifter.
          </DialogDescription>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              const name = data.get('name');
              const className = data.get('className');
              if (
                typeof name !== 'string' ||
                !name.trim() ||
                typeof className !== 'string'
              ) {
                setError('Fyll i elevens namn och klass.');
                return;
              }
              const basis = unitPupils.find(
                (p) => p.className === className,
              );
              if (!basis) {
                setError('Välj en klass vid den valda exempelskolan.');
                return;
              }
              const id = `E-${Math.max(...state.pupils.map((p) => Number(p.id.slice(2)))) + 1}`;
              const p: Pupil = {
                id,
                name: name.trim(),
                className,
                program: basis.program,
                regime: basis.regime,
                mentor: basis.mentor,
                unitId,
                status: 'Inskrivning',
                start: '2026-09-05',
                plan: [],
                planVersion: 1,
                ...(basis.goal ? { goal: basis.goal, end: basis.end } : {}),
              };
              setState({
                ...state,
                pupils: [...state.pupils, p],
                revision: state.revision + 1,
                changes: [
                  {
                    id: uid(),
                    time: new Date().toLocaleTimeString('sv-SE', {
                      hour: '2-digit',
                      minute: '2-digit',
                    }),
                    title: 'Exempelelev tillagd',
                    detail: `${p.name} · ${className}. Inskrivning och studieinnehåll behöver kompletteras.`,
                    pupilIds: [id],
                  },
                  ...state.changes,
                ],
              });
              setNewPupil(false);
              setNotice(`${p.name} är tillagd som inskrivningsunderlag.`);
              setPupilId(id);
            }}
          >
            <label className="field-label" htmlFor="new-pupil-name">
              Namn på exempeleleven
            </label>
            <Input
              id="new-pupil-name"
              name="name"
              required
              maxLength={80}
              placeholder="Förnamn Efternamn"
            />
            <span className="field-label">Klass i exemplet</span>
            <input type="hidden" name="className" value={pupilClass} />
            <Pick
              label="Klass i exemplet"
              value={pupilClass}
              onChange={setNewClass}
              options={classNames.map((c) => ({ value: c, label: c }))}
            />
            <p className="small-note">
              Utbildning, regelverk och mentor hämtas från klassens
              exempelprofil. Gruppplacering och studieplan behöver hanteras
              separat.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <div className="dialog-actions">
              <DialogClose render={<Button variant="outline" />}>
                Avbryt
              </DialogClose>
              <Button type="submit">Lägg till exempelelev</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      <Sheet open={historyOpen} onOpenChange={setHistoryOpen}>
        <SheetContent className="admin-student-sheet" showCloseButton={false}>
          <div className="sheet-topline">
            <span>ADMINISTRATION</span>
            <SheetClose
              render={
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Stäng ändringslogg"
                />
              }
            >
              <X size={20} />
            </SheetClose>
          </div>
          <SheetTitle>Ändringslogg</SheetTitle>
          <SheetDescription>
            Ändringar i den här sessionen. Detta är ingen säker revisionslogg på
            servern.
          </SheetDescription>
          <div className="admin-history">
            {state.changes.map((c) => (
              <div key={c.id}>
                <span>{c.time}</span>
                <strong>{c.title}</strong>
                <p>{c.detail}</p>
              </div>
            ))}
            {!state.changes.length && (
              <div className="admin-empty">
                <History size={25} />
                <h2>Inga ändringar ännu</h2>
                <p>Gruppbyten, schemaändringar och planutkast syns här.</p>
              </div>
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
