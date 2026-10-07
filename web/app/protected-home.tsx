'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import {
  Building2,
  CalendarClock,
  GraduationCap,
  LifeBuoy,
  ListChecks,
  ScrollText,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { contextLabel } from '@/lib/access-rules.ts';
import { selectionFromQuery, selectionToQuery, type Selection } from '@/lib/pupil-register-model.ts';
import { api, ApiError, onEpochChange, setKnownEpoch } from '@/lib/server-client.ts';
import { announce, onSessionMessage, shouldLock, type LockReason } from '@/lib/session-channel.ts';
import {
  confirmDiscard,
  UnsavedChangesProvider,
  useHasUnsaved,
} from '@/lib/unsaved-changes.tsx';
import ContextSwitch, {
  type ActiveContext,
  type AssignmentGroups,
  type SessionAssignment,
} from './context-switch';
import KundWorkspace from './kund-workspace';
import LoggWorkspace from './logg-workspace';
import MandateWorkspace from './mandate-workspace';
import MfaStepUpNotice from './mfa-step-up';
import PupilRegisterWorkspace, { clearRegisterLocation } from './pupil-register-workspace';
import ProtectedTimplanWorkspace from './protected-timplan-workspace';
import ProtectedGymTimplanWorkspace from './protected-gym-timplan-workspace';
import ProtectedProgramplanWorkspace from './protected-programplan-workspace';
import ProtectedPlanningOverview from './protected-planning-overview';
import { normalizePlanLocation, planningCollectionLocation, planLocationQuery, readPlanLocation, type GymTimplanLocation, type PlanLocation, type ProgramplanLocation } from '@/lib/protected-plan-location.ts';
import { PlanningContextProvider, PlanningContextBar, usePlanningContext } from './planning-context';
import type { PlanningSelection, PlanningSetup } from '@/lib/planning-year-contract.ts';
import SchoolYearPicker, { type RegisterSetup } from './school-year-picker';

type ProtectedView = 'kund' | 'logg' | 'mandat' | 'anslutning' | 'elever' | 'timplaner' | 'programplaner' | 'stangt';

const PUPIL_FUNCTIONS = ['rektor', 'larare', 'administrator', 'elevhalsa', 'support'];

export type SessionResponse = {
  identity: {
    issuer: string;
    subject: string;
    displayName: string | null;
    email: string | null;
  };
  assignments: SessionAssignment[];
  assignmentGroups: AssignmentGroups;
  context: ActiveContext | null;
  today: string;
  mfa: { acr: string | null; amr: string[]; authTime: string | null; proof: boolean };
  epoch: number;
  expiresAt: string;
  correlationId: string;
};

const PLANNING_FUNCTIONS = ['huvudman', 'rektor', 'administrator'];
const isPlanningView = (value: ProtectedView): value is 'programplaner' | 'timplaner' => value === 'programplaner' || value === 'timplaner';
function sessionScope(value: SessionResponse | null | 'loading'): string {
  return value && value !== 'loading' && value.context?.valid && !value.context.blocked
    ? `${value.epoch}:${value.context.customerId}:${value.context.assignmentId}` : '';
}
function shellView(search: string, value: SessionResponse): ProtectedView {
  const role = value.context?.function ?? '', requested = new URLSearchParams(search).get('vy');
  if (requested === 'kund' && role === 'kundadmin' || requested === 'logg' && role === 'granskare'
    || requested === 'mandat' && ['huvudman', 'rektor', 'elevhalsoansvarig'].includes(role)
    || requested === 'anslutning' && role === 'it') return requested as ProtectedView;
  const params = new URLSearchParams(search);
  if (PUPIL_FUNCTIONS.includes(role) && (requested === 'elever' || params.has('lasar') || params.has('skola'))) return 'elever';
  return startView(value);
}
function PlanningArea({ location, children }: { location: PlanLocation | null; children: (selection: PlanningSelection, setup: PlanningSetup) => ReactNode }) {
  const { setup, selection } = usePlanningContext();
  const blocked = useHasUnsaved('navigation-block:');
  const normalized = setup && location ? normalizePlanLocation(location, setup) : null;
  const canonical = !!location && !!normalized && planLocationQuery(location) === planLocationQuery(normalized.location);
  const [lastCanonical, setLastCanonical] = useState<PlanningSelection | null>(null);
  if (canonical && selection && JSON.stringify(lastCanonical) !== JSON.stringify(selection)) setLastCanonical(selection);
  // Raw URL targets and form may differ until the shell has accepted normalization.
  // Keep an existing writer on its last verified selection while its outcome is unknown.
  const writerSelection = canonical ? selection : blocked ? lastCanonical : null;
  const readable = setup && writerSelection && setup.units.some(unit => (writerSelection.unitId === null || unit.unitId === writerSelection.unitId)
    && (writerSelection.view === 'programplan' ? unit.canRead.programplan : unit.canRead[writerSelection.schoolform]));
  return <><PlanningContextBar/>{setup && writerSelection && readable ? children(writerSelection, setup) : null}</>;
}

function startView(session: SessionResponse): ProtectedView {
  if (session.context?.function === 'granskare') return 'logg';
  if (session.context?.function === 'kundadmin') return 'kund';
  if (session.context?.function === 'it') return 'anslutning';
  if (session.context && ['huvudman', 'elevhalsoansvarig'].includes(session.context.function)) return 'mandat';
  if (session.context && PUPIL_FUNCTIONS.includes(session.context.function)) return 'elever';
  return 'stangt';
}

function ProtectedNavigation({
  session,
  view,
  setView,
  overview,
  onOverview,
}: {
  session: SessionResponse;
  view: ProtectedView;
  setView: (view: ProtectedView) => void;
  overview: boolean;
  onOverview: () => void;
}) {
  const { setOpenMobile } = useSidebar();
  const go = (next: ProtectedView) => {
    setView(next);
    setOpenMobile(false);
  };
  return (
    <>
      <SidebarHeader className="brand-area">
        <div className="brand">
          <span className="brand-symbol"><GraduationCap size={23} /></span>
          <span>skolplattform<span className="brand-dot">.</span></span>
        </div>
        <div className="school protected-school">
          <span className="school-avatar">{session.context?.customerName.slice(0, 1) ?? 'S'}</span>
          <div>
            <strong>{session.context?.customerName ?? 'Skyddad arbetsyta'}</strong>
            <small>{session.context?.label ?? 'Välj uppdrag'}</small>
          </div>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <div className="nav-caption">ARBETSYTA</div>
        <SidebarMenu className="main-nav">
          {session.context?.function === 'kundadmin' && (
            <SidebarMenuItem>
              <SidebarMenuButton isActive={view === 'kund'} aria-current={view === 'kund' ? 'page' : undefined} onClick={() => go('kund')} className="nav-button">
                <ShieldCheck size={19} /><span>Kundadministration</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {session.context?.function === 'granskare' && (
            <SidebarMenuItem>
              <SidebarMenuButton isActive={view === 'logg'} aria-current={view === 'logg' ? 'page' : undefined} onClick={() => go('logg')} className="nav-button">
                <ScrollText size={19} /><span>Säkerhetslogg</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {session.context && ['huvudman', 'rektor', 'elevhalsoansvarig', 'it'].includes(session.context.function) && (
            <SidebarMenuItem>
              <SidebarMenuButton isActive={view === 'mandat' || view === 'anslutning'} aria-current={view === 'mandat' || view === 'anslutning' ? 'page' : undefined} onClick={() => go(session.context?.function === 'it' ? 'anslutning' : 'mandat')} className="nav-button">
                <ShieldCheck size={19} /><span>{session.context.function === 'it' ? 'Lokal anslutning' : 'Mandat'}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
          {session.context && PUPIL_FUNCTIONS.includes(session.context.function) && (
            <SidebarMenuItem>
              <SidebarMenuButton isActive={view === 'elever'} aria-current={view === 'elever' ? 'page' : undefined} onClick={() => go('elever')} className="nav-button">
                <Users size={19} /><span>Elever</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          )}
        </SidebarMenu>
        {session.context && PLANNING_FUNCTIONS.includes(session.context.function) && <>
          <div className="nav-caption">PLANERING</div>
          <SidebarMenu className="main-nav" aria-label="Planering">
            <SidebarMenuItem><SidebarMenuButton data-testid="planning-overview-nav" isActive={overview} aria-current={overview ? 'page' : undefined}
              onClick={() => { onOverview(); setOpenMobile(false); }} className="nav-button"><CalendarClock size={19}/><span>Läsårsöverblick</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton data-testid="programplan-list-nav" isActive={!overview && view === 'programplaner'} aria-current={!overview && view === 'programplaner' ? 'page' : undefined}
              onClick={() => go('programplaner')} className="nav-button"><ListChecks size={19}/><span>Programplaner</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton data-testid="timplan-list-nav" isActive={!overview && view === 'timplaner'} aria-current={!overview && view === 'timplaner' ? 'page' : undefined}
              onClick={() => go('timplaner')} className="nav-button"><CalendarClock size={19}/><span>Timplaner</span></SidebarMenuButton></SidebarMenuItem>
            <SidebarMenuItem><SidebarMenuButton isActive={false} onClick={() => go('programplaner')} className="nav-button"><Building2 size={19}/><span>Utbildningar</span></SidebarMenuButton></SidebarMenuItem>
          </SidebarMenu>
        </>}
      </SidebarContent>
      <SidebarFooter className="profile">
        <span className="avatar">{(session.identity.displayName ?? 'P').slice(0, 2).toUpperCase()}</span>
        <div><strong>{session.identity.displayName ?? 'Inloggad person'}</strong><small>{session.identity.email ?? session.identity.subject}</small></div>
      </SidebarFooter>
    </>
  );
}

function LoginPanel({ error }: { error?: string | null }) {
  const params = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const returnToInvitation = params.get('till') === '/inbjudan';
  const denied = params.get('inloggning') === 'nekad';
  const code = params.get('kod') ?? 'okänd';
  const href = returnToInvitation ? '/api/auth/login?till=/inbjudan' : '/api/auth/login';
  return (
    <main id="workspace" className="blocked-start">
      <h1>Logga in för att arbeta i den skyddade provmiljön</h1>
      <p>Inloggningen sker hos den lokala testleverantören. Ingen kommunanslutning är godkänd i denna fas.</p>
      {error && <output role="alert">{error}</output>}
      {denied && <output role="alert">Inloggningen kunde inte slutföras. Kontakta pilotansvarig (kod: {code}).</output>}
      <a className="button" href={href}>Logga in</a>
    </main>
  );
}

function SessionLock({ reason, expired }: { reason: LockReason; expired?: boolean }) {
  const reload = useRef<HTMLButtonElement>(null);
  useEffect(() => reload.current?.focus(), []);
  return (
    <div className="session-lock">
      <Dialog open modal>
        <DialogContent role="alertdialog" aria-modal="true" showCloseButton={false} className="session-lock-card">
          <DialogTitle id="lock-title">
            {expired ? 'Uppdraget har upphört vid sin sluttid' : reason === 'context' ? 'Kontexten ändrades i en annan flik' : 'Du har loggats ut i en annan flik'}
          </DialogTitle>
          <DialogDescription>{expired ? 'Elevuppgifterna har tagits bort från vyn och kan inte läsas längre.' : 'Innehållet i den här fliken har rensats.'}</DialogDescription>
          <Button ref={reload} onClick={() => window.location.assign('/')}>Ladda om</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProtectedShell() {
  const [session, setSession] = useState<SessionResponse | null | 'loading'>(null);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);
  const [lock, setLock] = useState<LockReason | null>(null);
  const [view, setView] = useState<ProtectedView>('stangt');
  const [programplanTarget, setProgramplanTarget] = useState<ProgramplanLocation | null>(null);
  const [timplanTarget, setTimplanTarget] = useState<GymTimplanLocation | null>(null);
  const [timplanMode, setTimplanMode] = useState<'gym' | 'other'>('gym');
  const [timplanYear, setTimplanYear] = useState('all');
  const [planNavigation, setPlanNavigation] = useState(0);
  const locationRef = useRef('');
  const locationStateRef = useRef<unknown>(null);
  const viewRef = useRef<ProtectedView>('stangt');
  const [planningLocation, setPlanningLocation] = useState<PlanLocation | null>(null);
  const planningLocationRef = useRef<PlanLocation | null>(null);
  const registerSelectionRef = useRef<{ key: string; selection: Selection } | null>(null);
  const [navigationNotice, setNavigationNotice] = useState<string | null>(null);
  const lastGymPlan = useRef<{ sourcePlanId: string; target: GymTimplanLocation } | null>(null);
  const [registerSetup, setRegisterSetup] = useState<RegisterSetup | null>(null);
  const [schoolYear, setSchoolYear] = useState<number | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerRetry, setRegisterRetry] = useState(0);
  const [help, setHelp] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  // Återkomst från en step-up där kontot saknar registrerad engångskod.
  const [stepUpWithoutOtp, setStepUpWithoutOtp] = useState(false);
  const hasUnsaved = useHasUnsaved();
  const navigationBlocked = useHasUnsaved('navigation-block:');
  const contextKey = sessionScope(session);
  const epochRef = useRef<number | null>(null);

  const sessionLoad = useRef(0);
  const sessionRef = useRef<SessionResponse | null>(null);
  const clearSession = useCallback((preserveAuthentication = false) => {
    sessionLoad.current += 1; sessionRef.current = null; epochRef.current = null;
    locationRef.current = ''; locationStateRef.current = null; viewRef.current = 'stangt';
    planningLocationRef.current = null; registerSelectionRef.current = null;
    setPlanningLocation(null); setNavigationNotice(null); setView('stangt');
    // Avbryt även redan hämtade men ännu inte levererade elev-/CSV-svar.
    setKnownEpoch(null);
    clearRegisterLocation(preserveAuthentication); setRegisterSetup(null); setSchoolYear(null); setHelp(false); setSession(null);
    setProgramplanTarget(null); setTimplanTarget(null); setTimplanMode('gym'); setTimplanYear('all'); lastGymPlan.current = null;
  }, []);
  const lockChangedContext = useCallback(() => {
    const wasSupport = sessionRef.current?.context?.function === 'support';
    clearSession();
    setLock('context');
    if (!wasSupport) return;

    // En ändrad epok kan komma före den lokala sluttidstimern. Kontrollera
    // serverns orsak efter att innehållet rensats; ett annat kontextbyte får
    // aldrig visas som ett utgånget uppdrag. Läs inga elevuppgifter ur svaret.
    const lockedLoad = sessionLoad.current;
    void fetch('/api/elever/urval', {
      credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' },
    }).then(async response => {
      if (response.status !== 403) return;
      const body: unknown = await response.json().catch(() => null);
      if (lockedLoad === sessionLoad.current && body && typeof body === 'object' &&
          'code' in body && body.code === 'assignment_expired') setExpired(true);
    }).catch(() => { /* Den generiska låstexten kvarstår om servern inte kan nås. */ });
  }, [clearSession]);
  const loadSession = useCallback(async () => {
    const current = ++sessionLoad.current;
    if (!sessionRef.current) setSession('loading');
    // En annan begäran som får 401 eller ny epok avbryter pågående begäranden,
    // även denna sessionskontroll. Den senaste kontrollen görs då om i stället för
    // att vyn blir kvar i laddningsläget.
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const loaded = await api.get<SessionResponse>('/api/session');
        if (current !== sessionLoad.current) return;
        epochRef.current = loaded.epoch;
        setKnownEpoch(loaded.epoch);
        const previous = sessionRef.current;
        const changed = previous !== null && (previous.epoch !== loaded.epoch || previous.context?.assignmentId !== loaded.context?.assignmentId || previous.context?.customerId !== loaded.context?.customerId);
        if (changed) {
          clearRegisterLocation(); setRegisterSetup(null); setSchoolYear(null); setHelp(false);
          registerSelectionRef.current = null; planningLocationRef.current = null; setPlanningLocation(null);
          locationRef.current = ''; locationStateRef.current = null; setNavigationNotice(null);
          setTimplanYear('all'); lastGymPlan.current = null;
        }
        sessionRef.current = loaded;
        setSession(loaded);
        if (!previous || changed) {
          const location = !changed && ['huvudman','rektor','administrator'].includes(loaded.context?.function ?? '') ? readPlanLocation(window.location.search) : null;
          const nextView = location?.view ?? shellView(window.location.search, loaded);
          setView(nextView); viewRef.current = nextView;
          planningLocationRef.current = location; setPlanningLocation(location);
          setProgramplanTarget(location?.view === 'programplaner' ? location.programplan : null);
          setTimplanTarget(location?.view === 'timplaner' ? location.gym : null);
          setTimplanMode(location?.view === 'timplaner' && (location.other || location.planning?.schoolform && location.planning.schoolform !== 'gymnasium') ? 'other' : 'gym');
          setTimplanYear(location?.allYears || location?.relativeYear === undefined ? 'all' : String(location.relativeYear - 1));
          locationRef.current = window.location.pathname + window.location.search; locationStateRef.current = window.history.state;
        }
        setMfaRequired(false);
        return;
      } catch (error) {
        if (current !== sessionLoad.current) return;
        if (error instanceof DOMException && error.name === 'AbortError') continue;
        if (error instanceof ApiError && error.status === 401) {
          epochRef.current = null;
          setKnownEpoch(null);
        }
        // Första oinloggade kontrollen måste behålla inbjudans returväg och IdP-felet.
        // Efter en faktiskt laddad session gäller alltid fullständig rensning.
        clearSession(sessionRef.current === null);
        return;
      }
    }
    if (current === sessionLoad.current) clearSession(sessionRef.current === null);
  }, [clearSession]);

  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get('verifiering') === 'saknar-engangskod') {
      queueMicrotask(() => setStepUpWithoutOtp(true));
      url.searchParams.delete('verifiering');
      window.history.replaceState(null, '', url.pathname + url.search + url.hash);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadSession());
    const stopMessages = onSessionMessage((message) => {
      const result = shouldLock({ knownEpoch: epochRef.current }, message);
      if (result.lock && result.reason) {
        if (result.reason === 'context') lockChangedContext();
        else { clearSession(); setLock(result.reason); }
      }
    });
    const stopEpoch = onEpochChange(() => {
      lockChangedContext();
    });
    const revalidate = () => {
      if (document.visibilityState === 'visible') void loadSession();
    };
    const pageShow = () => void loadSession();
    document.addEventListener('visibilitychange', revalidate);
    window.addEventListener('pageshow', pageShow);
    return () => {
      stopMessages();
      stopEpoch();
      document.removeEventListener('visibilitychange', revalidate);
      window.removeEventListener('pageshow', pageShow);
    };
  }, [loadSession, clearSession, lockChangedContext]);

  function canNavigate() {
    if (navigationBlocked) { setNavigationNotice('Invänta sparandet eller läs sparstatus innan du lämnar vyn.'); return false; }
    if (hasUnsaved && !confirmDiscard()) return false;
    setNavigationNotice(null); return true;
  }
  const currentRegisterSelection = useCallback((search = window.location.search): Selection | null => {
    if (!registerSetup || schoolYear === null || !contextKey) return null;
    const saved = registerSelectionRef.current?.key === contextKey ? registerSelectionRef.current.selection : null;
    const defaults: Selection = saved ?? { schoolYear, unitId: registerSetup.scope.schools[0]?.id ?? '', classId: null, educationId: null, grade: null, status: null, page: 1 };
    const requested = selectionFromQuery(search, defaults);
    const valid = (value: Selection | null): value is Selection => !!value && registerSetup.schoolYears.includes(value.schoolYear)
      && registerSetup.scope.schools.some(unit => unit.id === value.unitId);
    return valid(requested) ? requested : valid(saved) ? saved : valid(defaults) ? defaults : null;
  }, [contextKey, registerSetup, schoolYear]);
  const rememberRegister = useCallback((search = window.location.search) => {
    const selected = currentRegisterSelection(search);
    if (selected) registerSelectionRef.current = { key: contextKey, selection: selected };
  }, [contextKey, currentRegisterSelection]);
  function writePlanLocation(location: PlanLocation, replace = false) {
    // Old child callbacks cannot restore an address after a forced context/session clear.
    if (!contextKey || sessionScope(sessionRef.current) !== contextKey) return;
    const url = window.location.pathname + planLocationQuery(location);
    if (window.location.pathname + window.location.search !== url) window.history[replace ? 'replaceState' : 'pushState'](null, '', url);
    locationRef.current = url; locationStateRef.current = window.history.state;
    planningLocationRef.current = location; setPlanningLocation(location);
  }
  // These callbacks follow the workspace's actual scoped read. An explicit
  // former school follows the verified target; an all-school selection stays all.
  function planningAfterOpened(unitId: string | undefined) {
    const prior = planningLocationRef.current?.planning;
    const scopeChanged = !!unitId && typeof prior?.unitId === 'string' && prior.unitId !== unitId;
    return { scopeChanged, planning: scopeChanged ? { ...prior, unitId, page: 1, selectionRevision: null } : prior };
  }
  function programplanOpened(target: ProgramplanLocation | null) {
    if (sessionScope(sessionRef.current) !== contextKey) return;
    const prior = planningLocationRef.current;
    const firstOpenedTarget = !!target && prior?.view === 'programplaner' && !prior.programplan && !prior.overview;
    const next = planningAfterOpened(target?.unitId);
    // A changed school remounts the workspace. Pin the new verified target
    // before its selection changes, so a previous row cannot be reopened.
    if (next.scopeChanged) setProgramplanTarget(target);
    // Preserve the annual list for Back without remounting this verified workspace.
    // Existing targets and explicit null (local return or absent candidate) replace.
    writePlanLocation({ view: 'programplaner', programplan: target, planning: next.planning }, !firstOpenedTarget);
  }
  function gymTimplanOpened(target: GymTimplanLocation | null, sourcePlanId?: string) {
    if (sessionScope(sessionRef.current) !== contextKey) return;
    const prior = planningLocationRef.current;
    const firstOpenedTarget = !!target && prior?.view === 'timplaner' && !prior.gym && !prior.other && !prior.overview;
    const next = planningAfterOpened(target?.unitId);
    if (next.scopeChanged) setTimplanTarget(target);
    if (target?.kind === 'plan' && sourcePlanId) lastGymPlan.current = { sourcePlanId, target };
    writePlanLocation({ view: 'timplaner', gym: target, planning: next.planning, allYears: timplanYear === 'all',
      ...(timplanYear !== 'all' ? { relativeYear: (Number(timplanYear) + 1) as 1 | 2 | 3 } : {}) }, !firstOpenedTarget);
  }
  function planningFor(next: 'programplaner' | 'timplaner'): PlanLocation {
    const prior = planningLocationRef.current;
    return next === 'programplaner' ? { view: next, programplan: null, planning: prior?.planning }
      : { view: next, gym: null, planning: prior?.planning };
  }
  function applyPlanningLocation(location: PlanLocation) {
    setProgramplanTarget(location.view === 'programplaner' ? location.programplan : null);
    setTimplanTarget(location.view === 'timplaner' ? location.gym : null);
    setTimplanMode(location.view === 'timplaner' && (location.other || location.planning?.schoolform && location.planning.schoolform !== 'gymnasium') ? 'other' : 'gym');
    setTimplanYear(location.allYears || location.relativeYear === undefined ? 'all' : String(location.relativeYear - 1));
    planningLocationRef.current = location; setPlanningLocation(location); setView(location.view); viewRef.current = location.view;
  }
  function transitionPlanning(location: PlanLocation, mode: 'push' | 'replace') {
    if (!contextKey || sessionScope(sessionRef.current) !== contextKey) return;
    // User changes have already passed the provider's block/discard gate.
    applyPlanningLocation(location); if (mode === 'push') setPlanNavigation(value => value + 1);
    writePlanLocation(location, mode === 'replace');
  }
  function goToProgramplan(target: ProgramplanLocation) {
    if (!canNavigate()) return;
    if (view === 'elever') rememberRegister();
    const prior = planningFor('programplaner');
    const location: PlanLocation = { ...prior, view: 'programplaner', programplan: target, planning: { ...prior.planning, ...(target.unitId ? { unitId: target.unitId } : {}) } };
    applyPlanningLocation(location); setPlanNavigation(value => value + 1); writePlanLocation(location);
  }
  function goToTimplan(source: string | GymTimplanLocation) {
    if (!canNavigate()) return;
    if (view === 'elever') rememberRegister();
    const prior = planningFor('timplaner'), cached = lastGymPlan.current;
    const target: GymTimplanLocation = typeof source !== 'string' ? source
      : cached?.sourcePlanId === source && (cached.target.unitId === undefined || cached.target.unitId === prior.planning?.unitId)
        ? cached.target : { kind: 'source', id: source };
    const location: PlanLocation = { ...prior, view: 'timplaner', gym: target, planning: { ...prior.planning, schoolform: 'gymnasium',
      ...(target.unitId ? { unitId: target.unitId } : {}) } };
    applyPlanningLocation(location); setPlanNavigation(value => value + 1); writePlanLocation(location);
  }
  function navigateOverview() {
    if (!canNavigate()) return;
    if (view === 'elever') rememberRegister();
    const prior = planningLocationRef.current, next = prior?.view ?? 'timplaner';
    const location: PlanLocation = { ...planningFor(next), overview: true, planning: { ...prior?.planning, page: 1, selectionRevision: null } };
    applyPlanningLocation(location); setPlanNavigation(value => value + 1); writePlanLocation(location);
  }
  function chooseOverviewCollection(next: PlanningSelection['view'], schoolform: PlanningSelection['schoolform'], setup: PlanningSetup) {
    if (!canNavigate()) return;
    const result = planningCollectionLocation(planningLocationRef.current ?? planningFor('timplaner'), next, schoolform, setup);
    applyPlanningLocation(result.location); setNavigationNotice(result.normalizationNotice); setPlanNavigation(value => value + 1); writePlanLocation(result.location);
  }
  function navigate(next: ProtectedView) {
    if (next === view && !isPlanningView(next) || !canNavigate()) return;
    if (view === 'elever') rememberRegister();
    setProgramplanTarget(null); setTimplanTarget(null); setPlanNavigation(value => value + 1);
    if (isPlanningView(next)) {
      const location = planningFor(next); applyPlanningLocation(location); writePlanLocation(location);
    } else {
      if (next === 'elever') {
        const selected = currentRegisterSelection('');
        if (selected) { registerSelectionRef.current = { key: contextKey, selection: selected }; setSchoolYear(selected.schoolYear); }
        const query = selected ? selectionToQuery(selected) : '?vy=elever';
        window.history.pushState(null, '', window.location.pathname + query);
      } else window.history.pushState(null, '', window.location.pathname + `?vy=${next}`);
      locationRef.current = window.location.pathname + window.location.search; locationStateRef.current = window.history.state;
      setView(next); viewRef.current = next;
    }
  }
  useEffect(() => {
    const pop = (event: PopStateEvent) => {
      const activeSession = sessionRef.current;
      if (!sessionScope(activeSession) || !activeSession || !locationRef.current) return;
      const location = PLANNING_FUNCTIONS.includes(activeSession.context?.function ?? '') ? readPlanLocation(window.location.search) : null;
      const nextView = location?.view ?? shellView(window.location.search, activeSession);
      const priorView = viewRef.current;
      // Register list/card pops belong to its own existing listener. Never normalize them as planning.
      if (priorView === 'elever' && nextView === 'elever' && !location) {
        locationRef.current = window.location.pathname + window.location.search; locationStateRef.current = window.history.state;
        return;
      }
      event.stopImmediatePropagation();
      if (navigationBlocked || hasUnsaved && !confirmDiscard()) {
        if (navigationBlocked) setNavigationNotice('Invänta sparandet eller läs sparstatus innan du lämnar vyn.');
        window.history.pushState(locationStateRef.current, '', locationRef.current); return;
      }
      if (priorView === 'elever') rememberRegister(new URL(locationRef.current, window.location.origin).search);
      setNavigationNotice(null); setPlanNavigation(value => value + 1);
      if (location) applyPlanningLocation(location);
      else {
        setProgramplanTarget(null); setTimplanTarget(null);
        if (nextView === 'elever') {
          const selected = currentRegisterSelection();
          if (selected) { registerSelectionRef.current = { key: contextKey, selection: selected }; setSchoolYear(selected.schoolYear);
            if (!selectionFromQuery(window.location.search, selected)) window.history.replaceState(null, '', window.location.pathname + selectionToQuery(selected)); }
        }
        setView(nextView); viewRef.current = nextView;
      }
      locationRef.current = window.location.pathname + window.location.search; locationStateRef.current = window.history.state;
    };
    window.addEventListener('popstate', pop, true); return () => window.removeEventListener('popstate', pop, true);
  }, [navigationBlocked, hasUnsaved, contextKey, currentRegisterSelection, rememberRegister]);

  const registerContextKey = session && session !== 'loading' && session.context?.valid ? `${session.epoch}-${session.context.customerId}-${session.context.assignmentId}` : null;
  useEffect(() => {
    const currentSession = sessionRef.current;
    if (!currentSession || !currentSession.context?.valid || !PUPIL_FUNCTIONS.includes(currentSession.context.function)) return;
    const scope = sessionScope(currentSession);
    const abort = new AbortController();
    let timer: number | undefined;
    queueMicrotask(() => { if (!abort.signal.aborted) { setRegisterSetup(null); setRegisterError(null); } });
    void api.get<RegisterSetup>('/api/elever/urval', abort.signal).then(setup => {
      if (abort.signal.aborted || sessionScope(sessionRef.current) !== scope) return;
      const saved = registerSelectionRef.current?.key === scope ? registerSelectionRef.current.selection : null;
      const params = new URLSearchParams(window.location.search);
      const requested = !readPlanLocation(window.location.search) && params.has('lasar') ? Number(params.get('lasar')) : saved?.schoolYear ?? setup.currentSchoolYear;
      setSchoolYear(setup.schoolYears.includes(requested) ? requested : setup.currentSchoolYear);
      setRegisterSetup(setup);
      if (setup.endsAt) {
        const remaining = Date.parse(setup.endsAt) - Date.parse(setup.serverNow);
        timer = window.setTimeout(() => {
          clearSession(); setExpired(true); setLock('context');
        }, Math.max(0, Math.min(remaining, 2_147_000_000)));
      }
    }).catch(caught => {
      if (abort.signal.aborted || sessionScope(sessionRef.current) !== scope || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
      setRegisterError(caught instanceof ApiError && caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.' : 'Elevregistrets urval kunde inte hämtas. Försök igen.');
    });
    return () => { abort.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [registerContextKey, registerRetry, clearSession]);

  async function logout() {
    if (!canNavigate()) return;
    clearSession();
    try {
      const result = await api.post<{ redirect: string }>('/api/auth/logout', undefined);
      try { window.sessionStorage.removeItem('sp_invite'); } catch { /* Storage kan vara avstängd. */ }
      announce({ type: 'logged-out' });
      window.location.assign(result.redirect);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        try { window.sessionStorage.removeItem('sp_invite'); } catch { /* Storage kan vara avstängd. */ }
        announce({ type: 'logged-out' });
        window.location.assign('/');
      } else setLogoutError('Utloggningen kunde inte slutföras. Ladda om sidan och försök igen. Elevinnehållet i den här fliken har rensats.');
    }
  }

  if (lock) return <SessionLock reason={lock} expired={expired} />;
  if (session === 'loading') return <main id="workspace" className="blocked-start" aria-busy="true"><h1>Öppnar arbetsytan</h1><output>Kontrollerar session och uppdrag…</output></main>;
  if (session === null) return <LoginPanel error={logoutError} />;

  const assignmentCount = session.assignments.length;
  const contextControl = assignmentCount === 1 ? (
    <span className="context-label">{contextLabel(session.assignments[0])}</span>
  ) : (
    <ContextSwitch context={session.context} assignments={session.assignmentGroups} onChanged={() => { clearSession(); return loadSession(); }} />
  );
  const validContext = session.context?.valid && !session.context.blocked;
  const overview = isPlanningView(view) && planningLocation?.overview === true;
  const currentTitle = overview ? 'Läsårsöverblick' : view === 'kund' ? 'Kundadministration' : view === 'logg' ? 'Säkerhetslogg' : view === 'mandat' ? 'Mandat' : view === 'anslutning' ? 'Lokal anslutning' : view === 'elever' ? 'Elever' : view === 'timplaner' ? 'Timplaner' : view === 'programplaner' ? 'Programplaner' : 'Kommande funktion';

  return (
    <PlanningContextProvider key={contextKey} contextKey={contextKey} active={!!validContext && isPlanningView(view) && PLANNING_FUNCTIONS.includes(session.context!.function)} location={planningLocation}
      onTransition={transitionPlanning} onSessionLost={clearSession}>
    <SidebarProvider style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}>
      <a className="skip" href="#workspace">Till innehållet</a>
      <Sidebar className="app-sidebar">
        <ProtectedNavigation session={session} view={view} setView={navigate} overview={overview} onOverview={navigateOverview}/>
      </Sidebar>
      <div className="application">
        <header className="topbar protected-topbar">
          <div className="breadcrumbs"><SidebarTrigger aria-label="Visa eller dölj navigation" /><span>Arbetsyta</span><strong>{currentTitle}</strong></div>
          <div className="top-actions">
            <span className="demo-pill">Skyddad provmiljö</span>
            {view === 'elever' && validContext && registerSetup && schoolYear !== null && <SchoolYearPicker setup={registerSetup} value={schoolYear} onChange={year => {
              if (!canNavigate()) return;
              const selected = currentRegisterSelection();
              if (selected) registerSelectionRef.current = { key: contextKey, selection: { ...selected, schoolYear: year, page: 1 } };
              setSchoolYear(year);
            }}/>}
            {contextControl}
            <Button variant="ghost" onClick={() => void logout()}>Logga ut</Button>
            <Button variant="ghost" size="icon" aria-label="Om den skyddade provmiljön" onClick={() => setHelp(true)}><LifeBuoy size={19} /></Button>
          </div>
        </header>
        {!validContext ? (
          <main id="workspace" className="workspace"><section className="admin-empty"><h1>Välj uppdrag</h1>{session.assignmentGroups.valid.length === 0 ? <><p>Du har inga uppdrag som gäller idag.</p><Button variant="outline" onClick={() => void logout()}>Logga ut</Button></> : <p>Välj ett giltigt uppdrag i sidhuvudet för att öppna arbetsytan.</p>}</section></main>
        ) : (
          <main id="workspace" className="workspace protected-workspace" key={contextKey}>
            {navigationNotice && <output data-testid="planning-navigation-notice" className="validation-warning">{navigationNotice}</output>}
            {stepUpWithoutOtp && <output role="alert" className="validation-warning">Verifieringen gav inget bevis med engångskod eftersom ditt konto saknar registrerad engångskod hos inloggningstjänsten. Du kan fortsätta arbeta, men åtgärder som kräver engångskod går inte att göra. Kontakta den som administrerar din inloggning.</output>}
            {mfaRequired && !stepUpWithoutOtp && <MfaStepUpNotice message="Åtgärden kräver verifiering med engångskod." />}
            {view === 'kund' && <KundWorkspace context={session.context!} identity={session.identity} epoch={session.epoch} onMfaRequired={() => setMfaRequired(true)} onSessionLost={clearSession} />}
            {view === 'logg' && <LoggWorkspace epoch={session.epoch} onSessionLost={clearSession} />}
            {(view === 'mandat' || view === 'anslutning') && <MandateWorkspace key={`${session.epoch}-${session.context!.assignmentId}`} context={session.context!} epoch={session.epoch} onMfaRequired={() => setMfaRequired(true)} onSessionLost={clearSession} />}
            {view === 'elever' && (registerSetup && schoolYear !== null ? registerSetup.scope.schools.length > 0 ? <PupilRegisterWorkspace key={`${session.epoch}-${session.context!.assignmentId}`} context={session.context!} epoch={session.epoch} setup={registerSetup} schoolYear={schoolYear} onSchoolYear={year => { if (sessionScope(sessionRef.current) !== contextKey) return; setSchoolYear(year); rememberRegister(); locationRef.current = window.location.pathname + window.location.search; locationStateRef.current = window.history.state; }}
              onOpenPupil={(_id, selection) => { if (sessionScope(sessionRef.current) === contextKey) registerSelectionRef.current = { key: contextKey, selection }; }} onSessionLost={clearSession} /> : <section className="admin-empty"><h1>Elever</h1><p>Ditt uppdrag omfattar inga elever just nu.</p></section> : <section><h1>Elever</h1>{registerError ? <><output role="alert">{registerError}</output><Button variant="outline" onClick={() => setRegisterRetry(n => n + 1)}>Försök igen</Button></> : <output>Hämtar elevregistrets urval…</output>}</section>)}
            {isPlanningView(view) && PLANNING_FUNCTIONS.includes(session.context!.function) && <PlanningArea location={planningLocation}>{(selection, setup) => <>
              {overview && <ProtectedPlanningOverview onSecurityFailure={error => {
                if (error instanceof ApiError && (error.status === 401 || error.status === 403 && error.code !== 'mfa_required')) { clearSession(); return true; }
                return false;
              }} onChooseCollection={(collection, schoolform) => chooseOverviewCollection(collection, schoolform, setup)} onShowPlans={() => navigate(view)}/>}
              {!overview && view === 'timplaner' && <>
                <nav className="gt-tabs" aria-label="Timplanens skolform"><Button variant={timplanMode === 'gym' ? 'default' : 'outline'} aria-pressed={timplanMode === 'gym'} onClick={() => {
                  if (!canNavigate()) return;
                  const location: PlanLocation = { view: 'timplaner', gym: null, planning: { ...planningLocationRef.current?.planning, schoolform: 'gymnasium', page: 1, selectionRevision: null } };
                  applyPlanningLocation(location); setPlanNavigation(value => value + 1); writePlanLocation(location);
                }}>Gymnasium</Button>
                  {session.context!.function !== 'administrator' && <Button variant={timplanMode === 'other' ? 'default' : 'outline'} aria-pressed={timplanMode === 'other'} onClick={() => {
                    if (!canNavigate()) return;
                    const location: PlanLocation = { view: 'timplaner', gym: null, planning: { ...planningLocationRef.current?.planning, schoolform: 'grundskola', page: 1, selectionRevision: null } };
                    applyPlanningLocation(location); setPlanNavigation(value => value + 1); writePlanLocation(location);
                  }}>Grundskola och introduktionsprogram</Button>}</nav>
                {timplanMode === 'gym' ? <ProtectedGymTimplanWorkspace key={`${contextKey}-${selection.schoolYear}-${selection.unitId}-${planNavigation}`} context={session.context!} epoch={session.epoch} initialTarget={timplanTarget} onSessionLost={clearSession}
                  year={timplanYear} onYear={year => { if (navigationBlocked) { setNavigationNotice('Invänta sparandet eller läs sparstatus innan du byter årskurs.'); return; } setTimplanYear(year);
                    writePlanLocation({ view: 'timplaner', gym: planningLocationRef.current?.view === 'timplaner' ? planningLocationRef.current.gym : timplanTarget, planning: planningLocationRef.current?.planning,
                      allYears: year === 'all', ...(year !== 'all' ? { relativeYear: (Number(year) + 1) as 1 | 2 | 3 } : {}) }, true); }}
                  onOpened={gymTimplanOpened} onProgramplan={goToProgramplan}/>
                  : <ProtectedTimplanWorkspace key={`${contextKey}-${selection.schoolYear}-${selection.unitId}-${planNavigation}`} context={session.context!} epoch={session.epoch} onSessionLost={clearSession}/>}
              </>}
              {!overview && view === 'programplaner' && <ProtectedProgramplanWorkspace key={`${contextKey}-${selection.schoolYear}-${selection.unitId}-${planNavigation}`} context={session.context!} epoch={session.epoch} initialPlan={programplanTarget} onSessionLost={clearSession} onTimplan={goToTimplan}
                onOpened={programplanOpened}/>}
            </>}</PlanningArea>}
            {view === 'stangt' && <section className="admin-empty"><h1>Stängt i denna fas</h1><p>Öppnas när mandat och elevregister är verifierade (fas 3–4).</p></section>}
          </main>
        )}
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Om den skyddade provmiljön</DialogTitle>
          <DialogDescription>Elevregistrets läsår styr elevlistan. Planering har ett eget skol- och läsårsval som följer med mellan programplaner och timplaner. Det valda uppdraget styr vilken kund, huvudman, skolenhet och funktion du får arbeta med. Ett byte rensar innehållet i alla öppna flikar. Den lokala testleverantören är inte en godkänd anslutning till en kommuns identitetsleverantör.</DialogDescription>
          <DialogClose render={<Button variant="outline" />}>Stäng hjälpen</DialogClose>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
    </PlanningContextProvider>
  );
}

export default function ProtectedHome() {
  return <UnsavedChangesProvider><ProtectedShell /></UnsavedChangesProvider>;
}
