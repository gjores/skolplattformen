'use client';

import { useState, useEffect } from 'react';
import { flushSync } from 'react-dom';
import AdminWorkspace from './admin-workspace';
import ProtectedHome from './protected-home';
import OrganisationWorkspace, {
  type OrganisationView,
} from './organisation-workspace';
import { type AdminState, type AdminView } from '@/lib/admin-model';
import { runtime } from '@/lib/runtime-mode.ts';
import { createPilotFixture, PILOT_UNIT_GR, type PilotFixture } from '@/lib/pilot-fixtures.ts';
import { roleLabel, type Role } from '@/lib/organisation-model.ts';
import {
  Layers3,
  BookMarked,
  CalendarRange,
  CalendarClock,
  CalendarCheck,
  Building2,
  Library,
  ListChecks,
} from 'lucide-react';
import { Teaching, FeedbackView, Schedule, Cases } from './workspace-views';
import { courses, type Course, type Feedback } from '@/lib/school-model';
import {
  ArrowUpRight,
  ArrowRight,
  BookOpen,
  CalendarDays,
  ChevronRight,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  LifeBuoy,
  MessageSquareText,
  Users,
  Workflow,
} from 'lucide-react';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarTrigger,
  useSidebar,
} from '@/components/ui/sidebar';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from '@/components/ui/dialog';

type View =
  | 'day'
  | 'teaching'
  | 'feedback'
  | 'schedule'
  | 'cases'
  | OrganisationView
  | AdminView;
const adminViews: AdminView[] = ['students', 'plans', 'groups', 'planning'];
const organisationViews: OrganisationView[] = [
  'unit',
  'offerings',
  'pointplans',
  'timplan',
  'lasar',
];
const isAdmin = (view: View) =>
  (organisationViews as string[]).includes(view) ||
  (adminViews as string[]).includes(view);
type NavItem = { id: View; label: string; icon: typeof Users };
const navItems = {
  unit: { id: 'unit', label: 'Skolenheter', icon: Building2 },
  offerings: { id: 'offerings', label: 'Utbildningar', icon: Library },
  pointplans: { id: 'pointplans', label: 'Poängplaner', icon: ListChecks },
  timplan: { id: 'timplan', label: 'Timplaner', icon: CalendarClock },
  lasar: { id: 'lasar', label: 'Läsår & skoldagar', icon: CalendarCheck },
  students: { id: 'students', label: 'Elever', icon: Users },
  plans: { id: 'plans', label: 'Studieplaner', icon: BookMarked },
  groups: { id: 'groups', label: 'Grupper', icon: Layers3 },
  planning: { id: 'planning', label: 'Schema & resurser', icon: CalendarRange },
  day: { id: 'day', label: 'Min dag', icon: LayoutDashboard },
  teaching: { id: 'teaching', label: 'Undervisning', icon: BookOpen },
  feedback: { id: 'feedback', label: 'Återkoppling', icon: MessageSquareText },
  schedule: { id: 'schedule', label: 'Schema', icon: CalendarDays },
  cases: { id: 'cases', label: 'Ärenden', icon: Workflow },
} satisfies Record<View, NavItem>;
// Varje roll ser sin del. Huvudmannen lägger grunden, rektorn föreslår och
// leder, administrationen sköter register, läraren undervisar.
const roleNavigation: Record<Role, { caption: string; items: NavItem[] }[]> = {
  huvudman: [
    { caption: 'HUVUDMAN', items: [navItems.unit, navItems.offerings, navItems.pointplans, navItems.timplan, navItems.lasar] },
  ],
  rektor: [
    { caption: 'REKTOR', items: [navItems.unit, navItems.offerings, navItems.pointplans, navItems.timplan, navItems.lasar] },
    { caption: 'ADMINISTRATION', items: [navItems.students, navItems.plans, navItems.groups, navItems.planning] },
  ],
  administrator: [
    { caption: 'ADMINISTRATION', items: [navItems.students, navItems.plans, navItems.groups, navItems.planning] },
  ],
  larare: [
    { caption: 'PEDAGOGIK', items: [navItems.day, navItems.teaching, navItems.feedback, navItems.schedule, navItems.cases] },
  ],
};
const roles: Role[] = ['huvudman', 'rektor', 'administrator', 'larare'];
const navigation = Object.values(navItems);
const lessons = [
  {
    time: '09.00',
    end: '10.00',
    subject: 'Svenska',
    group: '8A',
    room: 'Sal 204',
    title: 'Ord som gör skillnad',
    detail: 'Argumenterande text · Lektion 3 av 6',
    tone: 'blue',
  },
  {
    time: '10.20',
    end: '11.20',
    subject: 'Svenska',
    group: '8B',
    room: 'Sal 204',
    title: 'Läs mellan raderna',
    detail: 'Läsning och samtal · Lektion 2 av 5',
    tone: 'violet',
  },
  {
    time: '13.00',
    end: '13.45',
    subject: 'Mentorstid',
    group: '8A',
    room: 'Sal 204',
    title: 'Veckan tillsammans',
    detail: 'Gemensam planering och reflektion',
    tone: 'green',
  },
];
function Navigation({
  view,
  go,
  pending,
  role,
  setRole,
}: {
  view: View;
  go: (v: View) => void;
  pending: number;
  role: Role;
  setRole: (r: Role) => void;
}) {
  const { setOpenMobile } = useSidebar();
  return (
    <>
      <SidebarHeader className="brand-area">
        <div className="brand">
          <span className="brand-symbol">
            <GraduationCap size={23} />
          </span>
          <span>
            skolplattform<span className="brand-dot">.</span>
          </span>
        </div>
        <div className="school">
          <span className="school-avatar">T</span>
          <div>
            <strong>Testskolan</strong>
            <small>{roleLabel[role]} · HT 2026</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        {roleNavigation[role].map((section, index) => (
          <div key={section.caption}>
            {index === 0 ? (
              <div className="nav-caption">{section.caption}</div>
            ) : (
              <div className="nav-section-divider">{section.caption}</div>
            )}
            <SidebarMenu className="main-nav">
              {section.items.map(({ id, label, icon: Icon }) => (
                <SidebarMenuItem key={id}>
                  <SidebarMenuButton
                    aria-current={view === id ? 'page' : undefined}
                    isActive={view === id}
                    onClick={() => {
                      go(id);
                      setOpenMobile(false);
                    }}
                    className="nav-button"
                  >
                    <Icon size={19} />
                    <span>{label}</span>
                    {id === 'feedback' && (
                      <span className="nav-count">{pending}</span>
                    )}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </div>
        ))}
        <div className="nav-note">
          <span className="tiny-dot" /> Fiktiva skolor och elever.
        </div>
      </SidebarContent>
      <SidebarFooter className="profile profile-roles">
        <div className="profile-person">
          <span className="avatar">AL</span>
          <div>
            <strong>Alex Lind</strong>
            <small>{roleLabel[role]} · Exempelroll</small>
          </div>
        </div>
        <fieldset className="role-switch">
          <legend>Prova som</legend>
          {roles.map((r) => (
            <button
              key={r}
              aria-pressed={role === r}
              onClick={() => {
                setRole(r);
                go(roleNavigation[r][0].items[0].id);
                setOpenMobile(false);
              }}
            >
              {roleLabel[r]}
            </button>
          ))}
        </fieldset>
      </SidebarFooter>
    </>
  );
}
/**
 * Startgrind. Utanför det uttryckliga exempelläget visas bara en blockerad
 * start: ingen sidomeny, inget rollval och ingen skoldata. Ingen teknisk
 * lägesorsak, adress eller nyckel visas.
 */
export default function Home() {
  if (runtime.mode === 'example') return <ExampleHome />;
  if (runtime.mode === 'protected') return <ProtectedHome />;
  return <BlockedStart />;
}
function BlockedStart() {
  return (
    <main id="workspace" className="blocked-start">
      <h1>Arbetsytan är inte tillgänglig ännu</h1>
      <p>
        Den här miljön är inte klar för åtkomst. Följ projektets startanvisning
        för att öppna provmiljön.
      </p>
    </main>
  );
}
function ExampleHome() {
  // Provmaterialet skapas en gång per öppnad sida och hålls i sidans minne.
  // Vid omläsning börjar exemplet om.
  const [fixture] = useState<PilotFixture>(createPilotFixture);
  const [role, setRole] = useState<Role>('huvudman');
  // Administrationens sessionsdata ligger här så att läsårsvyn kan räkna på
  // samma exempelvecka som Schema & resurser visar.
  const [admin, setAdmin] = useState<AdminState>(() => fixture.admin);
  // Vald exempelskola ägs av sidan så att elev-, grupp- och klassvyer följer
  // samma skolkontext som organisationsvyerna.
  const [activeUnitId, setActiveUnitId] = useState<string>(PILOT_UNIT_GR);
  const [view, setView] = useState<View>('unit');
  const [course, setCourse] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Course[]>([]);
  const [feedback, setFeedback] = useState<Feedback[]>([]);
  const [plan, setPlan] = useState(
    'Jämför två argument tillsammans. Skriv ett första utkast och avsluta med respons i par. Avsätt 15 minuter för bearbetning i nästa pass.',
  );
  const goTeaching = (id: string | null) => {
    setCourse(id);
    setView('teaching');
  };
  const [detail, setDetail] = useState<number | null>(null);
  const [help, setHelp] = useState(false);
  useEffect(() => {
    const context = (
      document as Document & {
        modelContext?: {
          registerTool: (
            tool: {
              name: string;
              description: string;
              inputSchema: object;
              annotations: object;
              execute: (input: unknown) => unknown;
            },
            options: { signal: AbortSignal },
          ) => void | Promise<void>;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const lifecycle = new AbortController();
    try {
      void Promise.resolve(
        context.registerTool(
          {
            name: 'open_teaching_area',
            description:
              'Öppna ett av provmiljöns arbetsområden. Ändrar bara navigation; publicerar eller sparar inga uppgifter.',
            inputSchema: {
              type: 'object',
              properties: {
                courseId: { type: 'string', enum: courses.map((c) => c.id) },
              },
              required: ['courseId'],
              additionalProperties: false,
            },
            annotations: { readOnlyHint: false, untrustedContentHint: false },
            execute(input: unknown) {
              if (
                !input ||
                typeof input !== 'object' ||
                Object.keys(input).some((k) => k !== 'courseId')
              )
                throw new Error('Ange endast courseId.');
              const id = (input as { courseId: unknown }).courseId;
              if (typeof id !== 'string' || !courses.some((c) => c.id === id))
                throw new Error('Okänt arbetsområde.');
              flushSync(() => {
                setCourse(id);
                setView('teaching');
              });
              return { view: 'teaching', courseId: id, demo: true };
            },
          },
          { signal: lifecycle.signal },
        ),
      ).catch(() => {});
    } catch {
      /* Optional host capability; the UI remains usable. */
    }
    return () => lifecycle.abort();
  }, []);
  return (
    <SidebarProvider
      style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}
    >
      <a className="skip" href="#workspace">
        Till innehållet
      </a>
      <Sidebar className="app-sidebar">
        <Navigation
          view={view}
          go={setView}
          pending={3 - feedback.length}
          role={role}
          setRole={setRole}
        />
      </Sidebar>
      <div className="application">
        <header className="topbar">
          <div className="breadcrumbs">
            <SidebarTrigger aria-label="Visa eller dölj navigation" />
            <span>Arbetsyta</span>
            <ChevronRight size={14} />
            <strong>{navigation.find((n) => n.id === view)?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="demo-pill">Provmiljö</span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Om provmiljön"
              onClick={() => setHelp(true)}
            >
              <LifeBuoy size={19} />
            </Button>
          </div>
        </header>
        <main
          id="workspace"
          className={'workspace ' + (isAdmin(view) ? 'is-admin' : '')}
        >
          <div hidden={!(adminViews as string[]).includes(view)}>
            <AdminWorkspace
              view={
                ((adminViews as string[]).includes(view)
                  ? view
                  : 'students') as AdminView
              }
              onNavigate={setView}
              state={admin}
              setState={setAdmin}
              unitId={activeUnitId}
            />
          </div>
          <div hidden={!(organisationViews as string[]).includes(view)}>
            <OrganisationWorkspace
              view={
                ((organisationViews as string[]).includes(view)
                  ? view
                  : 'unit') as OrganisationView
              }
              role={role}
              initial={{ organisation: fixture.organisation, plans: fixture.timplans.plans }}
              pupils={admin.pupils}
              onUnitChange={setActiveUnitId}
              schedule={{ groups: admin.groups, slots: admin.slots }}
            />
          </div>
          <div hidden={view !== 'day'}>
            <div className="page-heading">
              <div>
                <p className="eyebrow">FREDAG 4 SEPTEMBER · VECKA 36</p>
                <h1>
                  God morgon, Alex<span className="heading-dot">.</span>
                </h1>
                <p className="page-subtitle">En ny dag att göra skillnad.</p>
              </div>
              <div className="date-label">
                <CalendarDays size={17} /> 4 september 2026
              </div>
            </div>
            <div className="day-layout">
              <section>
                <div className="section-heading">
                  <h2>
                    Dagens undervisning <span className="quiet-count">3</span>
                  </h2>
                  <button
                    className="text-link"
                    onClick={() => setView('schedule')}
                  >
                    Hela schemat <ArrowUpRight size={16} />
                  </button>
                </div>
                <div className="lesson-list">
                  {lessons.map((l, i) => (
                    <article
                      className={'lesson ' + (i === 0 ? 'next-lesson' : '')}
                      key={l.time}
                    >
                      <div className="lesson-time">
                        <strong>{l.time}</strong>
                        <span>{l.end}</span>
                        <div className="timeline-line" />
                      </div>
                      <div className={'lesson-body ' + l.tone}>
                        <div className="lesson-top">
                          <span className={'subject-label ' + l.tone}>
                            {l.subject} <span>· {l.group}</span>
                          </span>
                          {i === 0 && (
                            <span className="next-label">
                              <span className="tiny-dot" /> Nästa lektion
                            </span>
                          )}
                        </div>
                        <h3>{l.title}</h3>
                        <p>{l.detail}</p>
                        <div className="lesson-bottom">
                          <span>
                            <Users size={15} />
                            {l.group} <span className="small-separator">/</span>{' '}
                            {l.room}
                          </span>
                          <Button
                            variant={i === 0 ? 'default' : 'outline'}
                            className="open-lesson"
                            onClick={() => setDetail(i)}
                          >
                            Öppna lektion <ArrowRight size={16} />
                          </Button>
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
                <div className="section-heading secondary-heading">
                  <h2>Fortsätt där du var</h2>
                </div>
                <button
                  className="continue-card"
                  onClick={() => goTeaching('argument')}
                >
                  <span className="document-icon">
                    <BookOpen size={23} />
                  </span>
                  <span>
                    <strong>Ord som gör skillnad</strong>
                    <small>Arbetsområde · Svenska 8A</small>
                  </span>
                  <ArrowUpRight size={20} />
                </button>
              </section>
              <aside className="day-aside">
                <section className="attention-panel">
                  <div className="section-heading">
                    <h2>Att följa upp</h2>
                    <span className="quiet-count">2</span>
                  </div>
                  <button
                    className="attention-item"
                    onClick={() => setView('feedback')}
                  >
                    <span className="attention-icon blue">
                      <MessageSquareText size={19} />
                    </span>
                    <span>
                      <strong>
                        {feedback.length === 3
                          ? 'Alla exempeltexter har respons'
                          : `${3 - feedback.length} texter väntar på respons`}
                      </strong>
                      <small>Ord som gör skillnad · 8A</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                  <button
                    className="attention-item"
                    onClick={() => setView('cases')}
                  >
                    <span className="attention-icon amber">
                      <Workflow size={19} />
                    </span>
                    <span>
                      <strong>Följ upp en stödinsats</strong>
                      <small>Ärende ST-014 · I dag</small>
                    </span>
                    <ChevronRight size={17} />
                  </button>
                </section>
                <section className="week-note">
                  <span className="eyebrow">UNDERVISNING I FOKUS</span>
                  <h2>
                    Respons blir värdefull
                    <br />
                    när den används.
                  </h2>
                  <p>Avsätt tid för bearbetning i nästa lektion med 8A.</p>
                  <button
                    onClick={() => goTeaching('argument')}
                    className="text-link"
                  >
                    Till arbetsområdet <ArrowRight size={16} />
                  </button>
                  <div className="learning-chain">
                    <span>Utkast</span>
                    <ArrowRight size={13} />
                    <span>Respons</span>
                    <ArrowRight size={13} />
                    <span>Bearbeta</span>
                  </div>
                </section>
                <div className="day-footer">
                  <Clock3 size={16} />
                  <span>Din nästa lektion börjar 09.00</span>
                </div>
              </aside>
            </div>
          </div>
          <div hidden={view !== 'teaching'}>
            <Teaching
              selected={course}
              onSelect={setCourse}
              plan={plan}
              onPlan={setPlan}
              onFeedback={() => setView('feedback')}
              drafts={drafts}
              onDraft={(c) => {
                setDrafts([...drafts, c]);
                setCourse(c.id);
              }}
            />
          </div>
          <div hidden={view !== 'feedback'}>
            <FeedbackView
              feedback={feedback}
              onFeedback={(f) =>
                setFeedback([
                  ...feedback.filter((x) => x.student !== f.student),
                  f,
                ])
              }
              onNextLesson={() => goTeaching('argument')}
            />
          </div>
          <div hidden={view !== 'schedule'}>
            <Schedule openLesson={(id) => goTeaching(courses[id].id)} />
          </div>
          <div hidden={view !== 'cases'}>
            <Cases />
          </div>
        </main>
        <footer className="app-footer">
          <span>Skolplattformen</span>
          <span>Undervisning med sammanhang.</span>
        </footer>
      </div>
      <Dialog
        open={detail !== null}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
      >
        <DialogContent className="lesson-dialog" showCloseButton={false}>
          <DialogTitle>{lessons[detail ?? 0].title}</DialogTitle>
          <DialogDescription>
            {lessons[detail ?? 0].subject} · {lessons[detail ?? 0].group} ·{' '}
            {lessons[detail ?? 0].time}–{lessons[detail ?? 0].end}
          </DialogDescription>
          <div className="lesson-agenda">
            <span className="eyebrow">LEKTIONSUPPLÄGG</span>
            <p>
              {detail === 0
                ? plan
                : detail === 1
                  ? 'Läs ett kort textavsnitt tillsammans. Samtala i par om berättarens perspektiv och samla era frågor.'
                  : 'Stäm av veckan, lyssna på gruppens frågor och planera nästa vecka tillsammans.'}
            </p>
            <div className="agenda-row">
              <span>10 min</span>
              <strong>Gemensam start</strong>
            </div>
            <div className="agenda-row">
              <span>{detail === 2 ? 25 : 35} min</span>
              <strong>Arbete och samtal</strong>
            </div>
            <div className="agenda-row">
              <span>{detail === 2 ? 10 : 15} min</span>
              <strong>Sammanfatta och ta vidare</strong>
            </div>
          </div>
          <div className="dialog-actions">
            <DialogClose render={<Button variant="outline" />}>
              Stäng
            </DialogClose>
            <Button
              onClick={() => {
                goTeaching(courses[detail ?? 0].id);
                setDetail(null);
              }}
            >
              Till arbetsområdet <ArrowRight size={16} />
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent showCloseButton={false}>
          <DialogTitle>Om provmiljön</DialogTitle>
          <DialogDescription>
            Här kan du prova administration med fiktiva skolor och elever.
            Grundskola och gymnasium har varsin exempelskola.
          </DialogDescription>
          <p>Ändringar gäller medan sidan är öppen. Vid omläsning börjar exemplet om.</p>
          <p>
            Elever, studieplaner, grupper, schema och planeringsunderlag är
            exempel. Ändringar försvinner vid omläsning.
          </p>
          <p>
            Du kan prova olika arbetsroller. Rollvalet är ett exempel och ger
            ingen åtkomst till en verklig skola.
          </p>
          <DialogClose render={<Button />}>Stäng hjälpen</DialogClose>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}
