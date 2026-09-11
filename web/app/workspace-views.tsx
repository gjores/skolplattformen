'use client';
import { useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Check,
  CheckCheck,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileText,
  MessageSquareText,
  Plus,
  Send,
  Users,
  Workflow,
  CircleCheck,
  RotateCcw,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import {
  courses,
  students,
  initialTasks,
  closureReasons,
  weekDates,
  type Course,
  type Feedback,
} from '@/lib/school-model';

function formText(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
}
export function Teaching({
  selected,
  onSelect,
  plan,
  onPlan,
  onFeedback,
  drafts,
  onDraft,
}: {
  selected: string | null;
  onSelect: (id: string | null) => void;
  plan: string;
  onPlan: (text: string) => void;
  onFeedback: () => void;
  drafts: Course[];
  onDraft: (course: Course) => void;
}) {
  const [createError, setCreateError] = useState('');
  const [filter, setFilter] = useState('Alla grupper');
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState(false);
  const [material, setMaterial] = useState(false);
  const [draftPlan, setDraftPlan] = useState(plan);
  const all = [...courses, ...drafts];
  const current = all.find((c) => c.id === selected);
  if (current)
    return (
      <>
        <button className="text-link back-link" onClick={() => onSelect(null)}>
          <ArrowLeft size={16} /> Alla arbetsområden
        </button>
        <div className="course-heading">
          <span className={'subject-label ' + current.tone}>
            {current.subject} · {current.group}
          </span>
          <div className="title-row">
            <h1>{current.title}</h1>
            <span className="status-badge">
              {drafts.some((d) => d.id === current.id) ? 'Utkast' : 'Pågående'}
            </span>
          </div>
          <p>{current.description}</p>
          <div className="course-meta">
            <span>
              <CalendarIcon /> {current.period}
            </span>
            <span>
              <Users size={16} /> {current.group}
            </span>
            <span>
              <BookOpen size={16} /> {current.lessons.length} lektioner
            </span>
          </div>
        </div>
        <Tabs defaultValue="plan" className="course-tabs">
          <TabsList variant="line">
            <TabsTrigger value="plan">Planering</TabsTrigger>
            <TabsTrigger value="material">Material</TabsTrigger>
            <TabsTrigger value="work">Elevarbeten</TabsTrigger>
          </TabsList>
          <TabsContent value="plan">
            <div className="course-layout">
              <section className="surface lesson-plan">
                <div className="section-heading">
                  <h2>Lektion för lektion</h2>
                  <span className="muted">
                    {current.lessons.length} tillfällen
                  </span>
                </div>
                {current.lessons.length === 0 && (
                  <p className="empty-copy">
                    Arbetsområdet är sparat som utkast i denna session. Det
                    finns inga planerade lektioner ännu.
                  </p>
                )}
                {current.lessons.map((lesson, i) => (
                  <div
                    className={'plan-row ' + (i === 2 ? 'current-plan' : '')}
                    key={lesson}
                  >
                    <span
                      className={'step-number ' + (i < 2 ? 'step-done' : '')}
                    >
                      {i < 2 ? (
                        <Check size={15} />
                      ) : (
                        String(i + 1).padStart(2, '0')
                      )}
                    </span>
                    <div>
                      <h3>{lesson}</h3>
                      <p>
                        {i === 2
                          ? 'Nästa lektion · 4 september'
                          : i < 2
                            ? 'Tidigare lektion'
                            : 'Kommande lektion'}
                      </p>
                      {i === 2 && (
                        <div className="plan-detail">
                          <p>
                            {current.id === 'argument'
                              ? plan
                              : 'Gemensam inledning, eget arbete och ett avslutande samtal.'}
                          </p>
                          {current.id === 'argument' && (
                            <Button
                              variant="outline"
                              onClick={() => {
                                setDraftPlan(plan);
                                setEdit(true);
                              }}
                            >
                              Ändra lektionsupplägg
                            </Button>
                          )}
                        </div>
                      )}
                    </div>
                    {i === 2 && <span className="live-dot" />}
                  </div>
                ))}
              </section>
              <aside>
                <section className="surface learning-goal">
                  <span className="eyebrow">DET VI VILL UTVECKLA</span>
                  <h2>
                    {current.id === 'argument'
                      ? 'Från åsikt till underbyggt argument.'
                      : current.description}
                  </h2>
                  <p>
                    {current.id === 'argument'
                      ? 'Eleven får pröva en tes, välja relevanta belägg och förklara sambandet.'
                      : 'Ge utrymme för olika perspektiv, muntliga resonemang och egen reflektion.'}
                  </p>
                  <div className="subtle-divider" />
                  <h3>Så får eleverna visa sitt kunnande</h3>
                  <p>
                    Muntligt samtal, utkast och bearbetad text. Läraren väljer
                    relevanta underlag.
                  </p>
                </section>
                {current.id === 'argument' && (
                  <button className="response-callout" onClick={onFeedback}>
                    <MessageSquareText size={22} />
                    <strong>Fortsätt med återkopplingen</strong>
                    <span>Öppna texter och planera nästa steg.</span>
                    <ArrowUpRight size={18} />
                  </button>
                )}
              </aside>
            </div>
          </TabsContent>
          <TabsContent value="material">
            <div className="surface materials">
              <h2>Lektionsmaterial</h2>
              <button
                className="material-row"
                onClick={() => setMaterial(true)}
              >
                <FileText size={24} />
                <span>
                  <strong>
                    {current.id === 'argument'
                      ? 'En tes behöver belägg'
                      : 'Frågor som öppnar ett samtal'}
                  </strong>
                  <small>Gemensamt undervisningsmaterial · Text</small>
                </span>
                <ArrowUpRight size={18} />
              </button>
              <p className="muted">
                Materialet går att läsa här. Ingen extern fil behöver öppnas.
              </p>
            </div>
          </TabsContent>
          <TabsContent value="work">
            <div className="surface materials">
              <h2>Elevarbeten</h2>
              {current.id === 'argument' ? (
                <>
                  <p>Tre exempeltexter finns att läsa och ge respons på.</p>
                  <Button onClick={onFeedback}>
                    Öppna återkoppling <ArrowRight size={16} />
                  </Button>
                </>
              ) : (
                <p className="empty-copy">
                  Inga elevarbeten finns i detta exempel ännu.
                </p>
              )}
            </div>
          </TabsContent>
        </Tabs>
        <Dialog open={edit} onOpenChange={setEdit}>
          <DialogContent className="wide-dialog" showCloseButton={false}>
            <DialogTitle>Nästa lektionsupplägg</DialogTitle>
            <DialogDescription>
              Ändra planeringen för Ord som gör skillnad. Sparas i denna
              förhandsversions session.
            </DialogDescription>
            <label className="field-label" htmlFor="lesson-plan">
              Upplägg
            </label>
            <textarea
              id="lesson-plan"
              value={draftPlan}
              onChange={(e) => setDraftPlan(e.target.value)}
              rows={5}
            />
            <div className="dialog-actions">
              <DialogClose render={<Button variant="outline" />}>
                Avbryt
              </DialogClose>
              <Button
                disabled={!draftPlan.trim()}
                onClick={() => {
                  onPlan(draftPlan.trim());
                  setEdit(false);
                }}
              >
                Spara upplägg
              </Button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={material} onOpenChange={setMaterial}>
          <DialogContent className="wide-dialog" showCloseButton={false}>
            <DialogTitle>
              {current.id === 'argument'
                ? 'En tes behöver belägg'
                : 'Frågor som öppnar ett samtal'}
            </DialogTitle>
            <DialogDescription>
              Material att använda tillsammans i undervisningen.
            </DialogDescription>
            <div className="reading-material">
              <h3>Pröva tillsammans</h3>
              <p>
                {current.id === 'argument'
                  ? '”Skolan behöver fler lugna arbetsplatser.”'
                  : 'Vad vet vi om personen i texten, och vad gissar vi?'}
              </p>
              <p>
                {current.id === 'argument'
                  ? 'Vad är en åsikt? Vilket konkret exempel kan stödja den? Förklara hur exemplet hänger ihop med påståendet.'
                  : 'Välj ett kort textavsnitt. Vilka ledtrådar ger texten? Jämför era tolkningar och förklara vad ni bygger dem på.'}
              </p>
              <h3>Lyssna och utveckla</h3>
              <p>
                Arbeta i par. Den som lyssnar ställer en följdfråga. Byt roller
                och pröva att förtydliga resonemanget.
              </p>
            </div>
            <DialogClose render={<Button variant="outline" />}>
              Stäng materialet
            </DialogClose>
          </DialogContent>
        </Dialog>
      </>
    );
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">PLANERA · UNDERVISA · UTVECKLA</p>
          <h1>
            Din undervisning<span className="heading-dot">.</span>
          </h1>
          <p className="page-subtitle">
            Arbetsområden med plats för både planering och lärande.
          </p>
        </div>
        <Button className="primary-action" onClick={() => setCreate(true)}>
          <Plus size={17} /> Nytt arbetsområde
        </Button>
      </div>
      <div className="filter-row">
        <div className="segmented" aria-label="Filtrera grupp">
          {['Alla grupper', '8A', '8B'].map((g) => (
            <button
              key={g}
              aria-pressed={filter === g}
              onClick={() => setFilter(g)}
            >
              {g}
            </button>
          ))}
        </div>
        <span className="muted">Höstterminen 2026</span>
      </div>
      <div className="course-grid">
        {all
          .filter((c) => filter === 'Alla grupper' || c.group === filter)
          .map((c) => (
            <button
              key={c.id}
              onClick={() => onSelect(c.id)}
              className={'course-card ' + c.tone}
            >
              <div className="course-card-top">
                <span className="subject-label">
                  {c.subject} · {c.group}
                </span>
                <ArrowUpRight size={19} />
              </div>
              <div className="course-card-symbol">
                <BookOpen size={30} strokeWidth={1.25} />
              </div>
              <h2>{c.title}</h2>
              <p>{c.description}</p>
              <div className="course-card-bottom">
                <span>{c.period}</span>
                <span>{c.lessons.length} lektioner</span>
              </div>
            </button>
          ))}
      </div>
      <div className="pedagogy-note">
        <BookOpen size={19} />
        <p>
          En planering är en utgångspunkt. Låt elevernas arbete visa vägen till
          nästa lektion.
        </p>
      </div>
      <Dialog open={create} onOpenChange={setCreate}>
        <DialogContent className="wide-dialog" showCloseButton={false}>
          <DialogTitle>Nytt arbetsområde</DialogTitle>
          <DialogDescription>
            Börja med vad eleverna ska få utveckla. Du kan fortsätta planeringen
            senare.
          </DialogDescription>
          <p role="alert" className="form-error">
            {createError}
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const form = new FormData(e.currentTarget);
              if (
                !formText(form, 'title').trim() ||
                !formText(form, 'description').trim()
              ) {
                setCreateError(
                  'Fyll i ett namn och vad eleverna ska få utveckla.',
                );
                return;
              }
              setCreateError('');
              onDraft({
                id: Array.from(crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16)).join('-'),
                title: formText(form, 'title').trim(),
                description: formText(form, 'description').trim(),
                group: formText(form, 'group'),
                subject: 'Svenska',
                tone: 'blue',
                period: 'Utkast · Ej publicerat',
                lessons: [],
              });
              setCreate(false);
            }}
          >
            <label className="field-label" htmlFor="area-title">
              Namn
            </label>
            <input
              id="area-title"
              name="title"
              required
              maxLength={100}
              placeholder="Till exempel Berättelser som berör"
            />
            <label className="field-label" htmlFor="area-group">
              Grupp
            </label>
            <select id="area-group" name="group">
              <option>8A</option>
              <option>8B</option>
            </select>
            <label className="field-label" htmlFor="area-goal">
              Vad ska eleverna få utveckla?
            </label>
            <textarea id="area-goal" name="description" required rows={3} />
            <div className="dialog-actions">
              <DialogClose render={<Button variant="outline" />}>
                Avbryt
              </DialogClose>
              <Button type="submit">Skapa utkast</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
function CalendarIcon() {
  return <Clock3 size={16} />;
}

export function FeedbackView({
  feedback,
  onFeedback,
  onNextLesson,
}: {
  feedback: Feedback[];
  onFeedback: (f: Feedback) => void;
  onNextLesson: () => void;
}) {
  const [student, setStudent] = useState(students[0].id);
  const [version, setVersion] = useState('1');
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState('');
  const current = students.find((s) => s.id === student)!;
  const saved = feedback.find((f) => f.student === student);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">SVENSKA · 8A · ORD SOM GÖR SKILLNAD</p>
          <h1>
            Återkoppling som tar vidare<span className="heading-dot">.</span>
          </h1>
          <p className="page-subtitle">
            Läs arbetet. Ge ett tydligt nästa steg. Lämna utrymme att pröva
            igen.
          </p>
        </div>
        <span className="status-badge">
          {feedback.length} av 3 har fått respons i exemplet
        </span>
      </div>
      <div className="feedback-workspace">
        <aside className="student-list">
          <h2>
            Elevarbeten <span className="quiet-count">3</span>
          </h2>
          {students.map((s) => (
            <button
              key={s.id}
              onClick={() => {
                setStudent(s.id);
                setVersion('1');
                setNotice('');
              }}
              className={student === s.id ? 'selected-student' : ''}
              aria-pressed={student === s.id}
            >
              <span className="student-avatar">{s.initials}</span>
              <span>
                <strong>{s.name}</strong>
                <small>
                  {feedback.some((f) => f.student === s.id)
                    ? 'Respons finns'
                    : 'Väntar på respons'}
                </small>
              </span>
              {feedback.some((f) => f.student === s.id) && <Check size={15} />}
            </button>
          ))}
          <div className="student-list-note">
            Syntetiska elevarbeten.
            <br />
            Ingen betygsberäkning.
          </div>
        </aside>
        <article className="student-paper">
          <div className="paper-toolbar">
            <span>
              <FileText size={16} /> Argumenterande text
            </span>
            <div className="version-switch">
              {['1', '2'].map((v) => (
                <button
                  key={v}
                  aria-pressed={v === version}
                  onClick={() => setVersion(v)}
                >
                  Utkast {v}
                </button>
              ))}
            </div>
          </div>
          <div className="paper-content">
            <span className="eyebrow">
              {current.name} · UTKAST {version}
            </span>
            <h2>
              {student === 'e14'
                ? 'En plats att tänka'
                : student === 'e08'
                  ? 'Mer tid för läsning'
                  : 'Gör plats för cyklarna'}
            </h2>
            <p>{version === '1' ? current.text : current.revision}</p>
            <div className="paper-bottom">
              <span>
                {version === '1'
                  ? 'Första utkastet'
                  : 'Exempel på en bearbetad version'}
              </span>
              <span>Svenska · 8A</span>
            </div>
          </div>
        </article>
        <aside className="feedback-panel">
          <div className="feedback-panel-title">
            <MessageSquareText size={19} />
            <h2>Din återkoppling</h2>
          </div>
          <p className="muted">
            Knyt responsen till något i texten och ge eleven en sak att pröva.
          </p>
          {saved && (
            <div className="saved-feedback">
              <span>
                <CheckCheck size={16} /> Respons på utkast {saved.revision}
              </span>
              <p>{saved.text}</p>
            </div>
          )}
          <label className="field-label" htmlFor="response">
            Nästa steg för eleven
          </label>
          <textarea
            id="response"
            rows={7}
            placeholder="Det här fungerar redan… Pröva nu att…"
            value={drafts[student] ?? ''}
            onChange={(e) =>
              setDrafts({ ...drafts, [student]: e.target.value })
            }
          />
          <Button
            className="full-button"
            disabled={!drafts[student]?.trim()}
            onClick={() => {
              onFeedback({
                student,
                text: drafts[student].trim(),
                revision: Number(version),
              });
              setDrafts({ ...drafts, [student]: '' });
              setNotice(
                'Responsen finns nu i exemplet. Ingen information har skickats.',
              );
            }}
          >
            <Send size={16} /> Spara respons i exemplet
          </Button>
          <output className="inline-status">{notice}</output>
          <div className="next-teaching">
            <span className="eyebrow">TILLBAKA TILL UNDERVISNINGEN</span>
            <p>Behöver fler elever samma förtydligande?</p>
            <button className="text-link" onClick={onNextLesson}>
              Planera nästa lektion <ArrowRight size={15} />
            </button>
          </div>
        </aside>
      </div>
    </>
  );
}

function formatTime(minutes: number) {
  return (
    String(Math.floor(minutes / 60)).padStart(2, '0') +
    '.' +
    String(minutes % 60).padStart(2, '0')
  );
}
export function Schedule({ openLesson }: { openLesson: (id: number) => void }) {
  const [offset, setOffset] = useState(0);
  const dates = weekDates(offset);
  const dateFormat = (d: Date) =>
    d.toLocaleDateString('sv-SE', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });
  const slots = [
    { day: 0, top: 15, id: 0 },
    { day: 0, top: 150, id: 1 },
    { day: 1, top: 75, id: 0 },
    { day: 1, top: 375, id: 2 },
    { day: 2, top: 0, id: 1 },
    { day: 2, top: 225, id: 0 },
    { day: 3, top: 75, id: 1 },
    { day: 3, top: 375, id: 2 },
    { day: 4, top: 75, id: 0 },
    { day: 4, top: 175, id: 1 },
    { day: 4, top: 375, id: 2 },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">DIN VECKA, I ETT SAMMANHANG</p>
          <h1>
            Schema<span className="heading-dot">.</span>
          </h1>
          <p className="page-subtitle">
            Öppna ett pass för att komma till undervisningen.
          </p>
        </div>
        <div className="schedule-controls">
          <Button
            variant="outline"
            aria-label="Föregående vecka"
            onClick={() => setOffset(offset - 1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <Button variant="outline" onClick={() => setOffset(0)}>
            Exempelveckan
          </Button>
          <Button
            variant="outline"
            aria-label="Nästa vecka"
            onClick={() => setOffset(offset + 1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      </div>
      <div className="section-heading">
        <h2>
          {dateFormat(dates[0])} – {dateFormat(dates[4])}{' '}
          {dates[4].getUTCFullYear()}
        </h2>
        <span className="muted">Alex Lind · Exempelschema</span>
      </div>
      {offset !== 0 ? (
        <div className="surface empty-state">
          <CalendarIcon />
          <h2>Inga pass i denna exempelvecka</h2>
          <p>Demodata finns för 31 augusti–4 september.</p>
          <Button variant="outline" onClick={() => setOffset(0)}>
            Till exempelveckan
          </Button>
        </div>
      ) : (
        <div className="schedule-scroll">
          <div className="calendar-grid">
            <div className="time-column">
              <div className="calendar-day-name" />
              {[
                '08.00',
                '09.00',
                '10.00',
                '11.00',
                '12.00',
                '13.00',
                '14.00',
              ].map((t) => (
                <span key={t}>{t}</span>
              ))}
            </div>
            {dates.map((date, day) => (
              <div
                className={
                  'calendar-column ' + (day === 4 ? 'selected-day' : '')
                }
                key={day}
              >
                <div className="calendar-day-name">
                  <span>
                    {['MÅNDAG', 'TISDAG', 'ONSDAG', 'TORSDAG', 'FREDAG'][day]}
                  </span>
                  <strong>{date.getUTCDate()}</strong>
                </div>
                <div className="calendar-slots">
                  {slots
                    .filter((s) => s.day === day)
                    .map((s, i) => {
                      const c = courses[s.id];
                      return (
                        <button
                          key={i}
                          className={'calendar-event ' + c.tone}
                          style={{ top: s.top }}
                          onClick={() => openLesson(s.id)}
                        >
                          <span>
                            {formatTime(480 + s.top / 1.25)}–
                            {formatTime(
                              480 + s.top / 1.25 + (s.id === 2 ? 45 : 60),
                            )}
                          </span>
                          <strong>{c.subject}</strong>
                          <small>{c.group} · Sal 204</small>
                        </button>
                      );
                    })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="schedule-legend">
        {courses.map((c) => (
          <span key={c.id} className={'subject-label ' + c.tone}>
            {c.subject} · {c.group}
          </span>
        ))}
      </div>
    </>
  );
}

export function Cases() {
  const [tasks, setTasks] = useState(initialTasks);
  const [conclusion, setConclusion] = useState('');
  const [closed, setClosed] = useState(false);
  const [reply, setReply] = useState(false);
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<string[]>([]);
  const reasons = closureReasons(tasks, conclusion);
  return (
    <>
      <div className="page-heading">
        <div>
          <p className="eyebrow">ÄRENDE ST-014 · BEGRÄNSAD EXEMPELVY</p>
          <h1>
            Från insats till uppföljning<span className="heading-dot">.</span>
          </h1>
          <p className="page-subtitle">
            Testelev 014 · Ansvarig rektor Robin Berg
          </p>
        </div>
        <span className={'status-badge ' + (closed ? 'success' : '')}>
          {closed ? 'Avslutat i exemplet' : 'Uppföljning pågår'}
        </span>
      </div>
      <div className="case-flow">
        {['Underlag', 'Bedömning', 'Beslut', 'Genomförande', 'Uppföljning'].map(
          (s, i) => (
            <div key={s} className={i === 4 ? 'active-stage' : ''}>
              <span>{i < 4 ? <Check size={14} /> : 5}</span>
              <strong>{s}</strong>
              {i < 4 && <ChevronRight size={15} />}
            </div>
          ),
        )}
      </div>
      <div className="case-layout">
        <section>
          <div className="surface case-summary">
            <div className="section-heading">
              <h2>Vad behöver vi följa upp?</h2>
              <Workflow size={20} />
            </div>
            <p>
              Har det beslutade stödet gett eleven bättre förutsättningar att
              delta i undervisningen?
            </p>
            <div className="case-facts">
              <div>
                <small>Beslutad insats</small>
                <strong>
                  Strukturerad skrivstart, två tillfällen per vecka
                </strong>
              </div>
              <div>
                <small>Genomförande</small>
                <strong>Genomfört efter justerad resursplanering</strong>
              </div>
              <div>
                <small>Effekt</small>
                <strong>
                  {tasks.find((t) => t.id === 'effect')?.done
                    ? 'Markerad som bedömd i exemplet; se avslutsgrunden'
                    : 'Återstår att bedöma tillsammans med eleven'}
                </strong>
              </div>
            </div>
          </div>
          <div className="surface task-surface">
            <div className="section-heading">
              <h2>Uppföljningens uppgifter</h2>
              <span className="muted">
                {tasks.filter((t) => t.done).length} av {tasks.length} klara
              </span>
            </div>
            {tasks.map((t) => (
              <label className="case-task" key={t.id}>
                <Checkbox
                  checked={t.done}
                  disabled={closed}
                  onCheckedChange={(checked) => {
                    setTasks(
                      tasks.map((task) =>
                        task.id === t.id ? { ...task, done: !!checked } : task,
                      ),
                    );
                    setMessage('');
                  }}
                />
                <span>
                  <strong>{t.title}</strong>
                  <small>{t.owner}</small>
                </span>
                <span className={'task-status ' + (t.done ? 'done' : '')}>
                  {t.done ? 'Klart' : 'Återstår'}
                </span>
              </label>
            ))}
          </div>
          <div className="surface case-message">
            <span className="eyebrow">KOMMUNIKATION · 4 SEPTEMBER</span>
            <h3>Fråga inför uppföljningen</h3>
            <p>”Kan vi få veta hur skrivstödet har fungerat den här veckan?”</p>
            <div className="message-origin">
              Vårdnadshavare till Testelev 014 · Exempelmeddelande
            </div>
            <Button
              variant="outline"
              disabled={reply}
              onClick={() => {
                setReply(true);
                setHistory((h) => [
                  'Meddelandet markerades besvarat. Ärendets status är oförändrad.',
                  ...h,
                ]);
              }}
            >
              {reply ? (
                <CheckCheck size={16} />
              ) : (
                <MessageSquareText size={16} />
              )}{' '}
              {reply ? 'Besvarat i exemplet' : 'Markera besvarat i exemplet'}
            </Button>
            <p className="small-note">
              Ärendets uppföljning fortsätter även när meddelandet är besvarat.
            </p>
          </div>
        </section>
        <aside>
          <div className="surface close-panel">
            <div className="section-heading">
              <h2>Avslutsprövning</h2>
              <ShieldCheck size={20} />
            </div>
            <p className="muted">
              Uppgifter och avslutsgrund måste vara klara. Kontrollerna här
              illustrerar ett flöde, inte ett juridiskt beslut.
            </p>
            <label className="field-label" htmlFor="conclusion">
              Avslutsgrund och fortsatt ansvar
            </label>
            <textarea
              id="conclusion"
              rows={5}
              disabled={closed}
              value={conclusion}
              onChange={(e) => setConclusion(e.target.value)}
              placeholder="Sammanfatta uppföljningen och dokumentera vem som tar vid…"
            />
            {!closed && (
              <ul className="closure-reasons">
                {reasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
            )}
            <Button
              className="full-button"
              variant={closed ? 'outline' : 'default'}
              onClick={() => {
                if (closed) {
                  setClosed(false);
                  setMessage('Ärendet är återöppnat. Historiken finns kvar.');
                  setHistory((h) => [
                    'Ärendet återöppnades för fortsatt uppföljning.',
                    ...h,
                  ]);
                } else if (reasons.length)
                  setMessage('Ärendet kan inte avslutas. ' + reasons.join(' '));
                else {
                  setClosed(true);
                  setMessage('Ärendet avslutades i exemplet.');
                  setHistory((h) => [
                    'Avslutat efter kontroll av uppgifter och dokumenterad grund.',
                    ...h,
                  ]);
                }
              }}
            >
              {closed ? <RotateCcw size={16} /> : <CircleCheck size={16} />}{' '}
              {closed ? 'Återöppna ärendet' : 'Pröva avslut'}
            </Button>
            <output className="inline-status">{message}</output>
          </div>
          <div className="history">
            <h2>Händelser</h2>
            {history.map((h, i) => (
              <p key={i}>
                <span className="history-dot" />
                {h}
              </p>
            ))}
            <p>
              <span className="history-dot" />
              Uppföljning påbörjad · 4 september
            </p>
            <p>
              <span className="history-dot" />
              Genomförandet bekräftat · 3 september
            </p>
            <p>
              <span className="history-dot" />
              Beslut version 1 · 24 augusti
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}
