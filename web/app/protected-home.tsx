'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
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
import { selectionFromQuery, selectionToQuery } from '@/lib/pupil-register-model.ts';
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
import ProtectedProgramplanWorkspace from './protected-programplan-workspace';
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

const closedItems = [
  ['Klasser och läsår', GraduationCap],
] as const;

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
}: {
  session: SessionResponse;
  view: ProtectedView;
  setView: (view: ProtectedView) => void;
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
          <SidebarMenuItem>
            <SidebarMenuButton isActive={view === 'timplaner'} aria-current={view === 'timplaner' ? 'page' : undefined}
              onClick={() => go(session.context && ['huvudman','rektor'].includes(session.context.function) ? 'timplaner' : 'stangt')} className="nav-button">
              <CalendarClock size={19}/><span>Timplaner</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton isActive={view === 'programplaner'} aria-current={view === 'programplaner' ? 'page' : undefined}
              onClick={() => go(session.context && ['huvudman','rektor'].includes(session.context.function) ? 'programplaner' : 'stangt')} className="nav-button">
              <ListChecks size={19}/><span>Programplaner</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem><SidebarMenuButton isActive={false} onClick={() => go(session.context && ['huvudman','rektor'].includes(session.context.function) ? 'programplaner' : 'stangt')} className="nav-button"><Building2 size={19}/><span>Utbildningar</span></SidebarMenuButton></SidebarMenuItem>
          {closedItems.map(([label, Icon]) => (
            <SidebarMenuItem key={label}>
              <SidebarMenuButton isActive={false} onClick={() => go('stangt')} className="nav-button">
                <Icon size={19} /><span>{label}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
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
  const [registerSetup, setRegisterSetup] = useState<RegisterSetup | null>(null);
  const [schoolYear, setSchoolYear] = useState<number | null>(null);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerRetry, setRegisterRetry] = useState(0);
  const [help, setHelp] = useState(false);
  const [mfaRequired, setMfaRequired] = useState(false);
  // Återkomst från en step-up där kontot saknar registrerad engångskod.
  const [stepUpWithoutOtp, setStepUpWithoutOtp] = useState(false);
  const hasUnsaved = useHasUnsaved();
  const epochRef = useRef<number | null>(null);

  const sessionLoad = useRef(0);
  const sessionRef = useRef<SessionResponse | null>(null);
  const clearSession = useCallback((preserveAuthentication = false) => {
    sessionLoad.current += 1; sessionRef.current = null;
    // Avbryt även redan hämtade men ännu inte levererade elev-/CSV-svar.
    setKnownEpoch(null);
    clearRegisterLocation(preserveAuthentication); setRegisterSetup(null); setSchoolYear(null); setHelp(false); setSession(null);
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
        const changed = previous !== null && (previous.epoch !== loaded.epoch || previous.context?.assignmentId !== loaded.context?.assignmentId);
        if (changed) { clearRegisterLocation(); setRegisterSetup(null); setSchoolYear(null); setHelp(false); }
        sessionRef.current = loaded;
        setSession(loaded);
        if (!previous || changed) setView(startView(loaded));
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

  const registerContextKey = session && session !== 'loading' && session.context?.valid ? `${session.epoch}-${session.context.assignmentId}` : null;
  useEffect(() => {
    const currentSession = sessionRef.current;
    if (!currentSession || !currentSession.context?.valid || !PUPIL_FUNCTIONS.includes(currentSession.context.function)) return;
    const abort = new AbortController();
    let timer: number | undefined;
    queueMicrotask(() => { if (!abort.signal.aborted) { setRegisterSetup(null); setRegisterError(null); } });
    void api.get<RegisterSetup>('/api/elever/urval', abort.signal).then(setup => {
      if (abort.signal.aborted) return;
      const requested = Number(new URLSearchParams(window.location.search).get('lasar'));
      setSchoolYear(setup.schoolYears.includes(requested) ? requested : setup.currentSchoolYear);
      setRegisterSetup(setup);
      if (setup.endsAt) {
        const remaining = Date.parse(setup.endsAt) - Date.parse(setup.serverNow);
        timer = window.setTimeout(() => {
          clearSession(); setExpired(true); setLock('context');
        }, Math.max(0, Math.min(remaining, 2_147_000_000)));
      }
    }).catch(caught => {
      if (abort.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { clearSession(); return; }
      setRegisterError(caught instanceof ApiError && caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.' : 'Elevregistrets urval kunde inte hämtas. Försök igen.');
    });
    return () => { abort.abort(); if (timer !== undefined) window.clearTimeout(timer); };
  }, [registerContextKey, registerRetry, clearSession]);

  async function logout() {
    if (hasUnsaved && !confirmDiscard()) return;
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
    <ContextSwitch context={session.context} assignments={session.assignmentGroups} onChanged={() => { clearRegisterLocation(); setRegisterSetup(null); setSchoolYear(null); return loadSession(); }} />
  );
  const validContext = session.context?.valid && !session.context.blocked;
  const currentTitle = view === 'kund' ? 'Kundadministration' : view === 'logg' ? 'Säkerhetslogg' : view === 'mandat' ? 'Mandat' : view === 'anslutning' ? 'Lokal anslutning' : view === 'elever' ? 'Elever' : view === 'timplaner' ? 'Timplaner' : view === 'programplaner' ? 'Programplaner' : 'Kommande funktion';

  return (
    <SidebarProvider style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}>
      <a className="skip" href="#workspace">Till innehållet</a>
      <Sidebar className="app-sidebar">
        <ProtectedNavigation session={session} view={view} setView={next => {
          if (next !== view && hasUnsaved && !confirmDiscard()) return;
          setView(next);
        }} />
      </Sidebar>
      <div className="application">
        <header className="topbar protected-topbar">
          <div className="breadcrumbs"><SidebarTrigger aria-label="Visa eller dölj navigation" /><span>Arbetsyta</span><strong>{currentTitle}</strong></div>
          <div className="top-actions">
            <span className="demo-pill">Skyddad provmiljö</span>
            {view !== 'timplaner' && view !== 'programplaner' && validContext && registerSetup && schoolYear !== null && <SchoolYearPicker setup={registerSetup} value={schoolYear} onChange={year => {
              setSchoolYear(year);
              if (view !== 'elever' && registerSetup.scope.schools[0]) {
                const defaults = { schoolYear: year, unitId: registerSetup.scope.schools[0].id, classId: null, educationId: null, grade: null, status: null, page: 1 };
                const current = selectionFromQuery(window.location.search, defaults) ?? defaults;
                window.history.pushState(null, '', selectionToQuery({ ...current, schoolYear: year, page: 1 }));
              }
            }} />}
            {contextControl}
            <Button variant="ghost" onClick={() => void logout()}>Logga ut</Button>
            <Button variant="ghost" size="icon" aria-label="Om den skyddade provmiljön" onClick={() => setHelp(true)}><LifeBuoy size={19} /></Button>
          </div>
        </header>
        {!validContext ? (
          <main id="workspace" className="workspace"><section className="admin-empty"><h1>Välj uppdrag</h1>{session.assignmentGroups.valid.length === 0 ? <><p>Du har inga uppdrag som gäller idag.</p><Button variant="outline" onClick={() => void logout()}>Logga ut</Button></> : <p>Välj ett giltigt uppdrag i sidhuvudet för att öppna arbetsytan.</p>}</section></main>
        ) : (
          <main id="workspace" className="workspace protected-workspace" key={session.epoch}>
            {stepUpWithoutOtp && <output role="alert" className="validation-warning">Verifieringen gav inget bevis med engångskod eftersom ditt konto saknar registrerad engångskod hos inloggningstjänsten. Du kan fortsätta arbeta, men åtgärder som kräver engångskod går inte att göra. Kontakta den som administrerar din inloggning.</output>}
            {mfaRequired && !stepUpWithoutOtp && <MfaStepUpNotice message="Åtgärden kräver verifiering med engångskod." />}
            {view === 'kund' && <KundWorkspace context={session.context!} identity={session.identity} epoch={session.epoch} onMfaRequired={() => setMfaRequired(true)} onSessionLost={clearSession} />}
            {view === 'logg' && <LoggWorkspace epoch={session.epoch} onSessionLost={clearSession} />}
            {(view === 'mandat' || view === 'anslutning') && <MandateWorkspace key={`${session.epoch}-${session.context!.assignmentId}`} context={session.context!} epoch={session.epoch} onMfaRequired={() => setMfaRequired(true)} onSessionLost={clearSession} />}
            {view === 'elever' && (registerSetup && schoolYear !== null ? registerSetup.scope.schools.length > 0 ? <PupilRegisterWorkspace key={`${session.epoch}-${session.context!.assignmentId}`} context={session.context!} epoch={session.epoch} setup={registerSetup} schoolYear={schoolYear} onSchoolYear={setSchoolYear} onSessionLost={clearSession} /> : <section className="admin-empty"><h1>Elever</h1><p>Ditt uppdrag omfattar inga elever just nu.</p></section> : <section><h1>Elever</h1>{registerError ? <><output role="alert">{registerError}</output><Button variant="outline" onClick={() => setRegisterRetry(n => n + 1)}>Försök igen</Button></> : <output>Hämtar elevregistrets urval…</output>}</section>)}
            {view === 'timplaner' && ['huvudman','rektor'].includes(session.context!.function) && <ProtectedTimplanWorkspace key={`${session.epoch}-${session.context!.assignmentId}`} context={session.context!} epoch={session.epoch} onSessionLost={clearSession}/>}
            {view === 'programplaner' && ['huvudman','rektor'].includes(session.context!.function) && <ProtectedProgramplanWorkspace key={`${session.epoch}-${session.context!.assignmentId}`} context={session.context!} epoch={session.epoch} onSessionLost={clearSession}/>}
            {view === 'stangt' && <section className="admin-empty"><h1>Stängt i denna fas</h1><p>Öppnas när mandat och elevregister är verifierade (fas 3–4).</p></section>}
          </main>
        )}
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Om den skyddade provmiljön</DialogTitle>
          <DialogDescription>Läsåret i sidhuvudet styr vilka elever som visas i elevlistan. Det valda uppdraget styr vilken kund, huvudman, skolenhet och funktion du får arbeta med. Ett byte rensar innehållet i alla öppna flikar. Den lokala testleverantören är inte en godkänd anslutning till en kommuns identitetsleverantör.</DialogDescription>
          <DialogClose render={<Button variant="outline" />}>Stäng hjälpen</DialogClose>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

export default function ProtectedHome() {
  return <UnsavedChangesProvider><ProtectedShell /></UnsavedChangesProvider>;
}
