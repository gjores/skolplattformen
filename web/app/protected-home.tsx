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

type ProtectedView = 'kund' | 'logg' | 'stangt';

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
  ['Utbildningar', Building2],
  ['Poängplaner', ListChecks],
  ['Timplaner', CalendarClock],
  ['Klasser och läsår', GraduationCap],
  ['Elever', Users],
] as const;

function startView(session: SessionResponse): ProtectedView {
  if (session.context?.function === 'granskare') return 'logg';
  if (session.context?.function === 'kundadmin') return 'kund';
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

function LoginPanel() {
  const params = new URLSearchParams(window.location.search);
  const returnToInvitation = params.get('till') === '/inbjudan';
  const denied = params.get('inloggning') === 'nekad';
  const code = params.get('kod') ?? 'okänd';
  const href = returnToInvitation ? '/api/auth/login?till=/inbjudan' : '/api/auth/login';
  return (
    <main id="workspace" className="blocked-start">
      <h1>Logga in för att arbeta i den skyddade provmiljön</h1>
      <p>Inloggningen sker hos den lokala testleverantören. Ingen kommunanslutning är godkänd i denna fas.</p>
      {denied && <output role="alert">Inloggningen kunde inte slutföras. Kontakta pilotansvarig (kod: {code}).</output>}
      <a className="button" href={href}>Logga in</a>
    </main>
  );
}

function SessionLock({ reason }: { reason: LockReason }) {
  const reload = useRef<HTMLButtonElement>(null);
  useEffect(() => reload.current?.focus(), []);
  return (
    <div className="session-lock">
      <Dialog open modal>
        <DialogContent role="alertdialog" aria-modal="true" showCloseButton={false} className="session-lock-card">
          <DialogTitle id="lock-title">
            {reason === 'context' ? 'Kontexten ändrades i en annan flik' : 'Du har loggats ut i en annan flik'}
          </DialogTitle>
          <DialogDescription>Innehållet i den här fliken har rensats.</DialogDescription>
          <Button ref={reload} onClick={() => window.location.assign('/')}>Ladda om</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProtectedShell() {
  const [session, setSession] = useState<SessionResponse | null | 'loading'>('loading');
  const [lock, setLock] = useState<LockReason | null>(null);
  const [view, setView] = useState<ProtectedView>('stangt');
  const [help, setHelp] = useState(false);
  const hasUnsaved = useHasUnsaved();
  const epochRef = useRef<number | null>(null);

  const loadSession = useCallback(async () => {
    setSession('loading');
    try {
      const loaded = await api.get<SessionResponse>('/api/session');
      epochRef.current = loaded.epoch;
      setKnownEpoch(loaded.epoch);
      setSession(loaded);
      setView(startView(loaded));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        epochRef.current = null;
        setKnownEpoch(null);
        setSession(null);
      } else if (!(error instanceof DOMException && error.name === 'AbortError')) {
        setSession(null);
      }
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void loadSession());
    const stopMessages = onSessionMessage((message) => {
      const result = shouldLock({ knownEpoch: epochRef.current }, message);
      if (result.lock && result.reason) {
        setSession(null);
        setLock(result.reason);
      }
    });
    const stopEpoch = onEpochChange(() => {
      setSession(null);
      setLock('context');
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
  }, [loadSession]);

  async function logout() {
    if (hasUnsaved && !confirmDiscard()) return;
    try {
      const result = await api.post<{ redirect: string }>('/api/auth/logout', {});
      window.sessionStorage.removeItem('sp_invite');
      announce({ type: 'logged-out' });
      window.location.assign(result.redirect);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        window.sessionStorage.removeItem('sp_invite');
        announce({ type: 'logged-out' });
        window.location.assign('/');
      }
    }
  }

  if (lock) return <SessionLock reason={lock} />;
  if (session === 'loading') return <main id="workspace" className="blocked-start" aria-busy="true"><h1>Öppnar arbetsytan</h1><output>Kontrollerar session och uppdrag…</output></main>;
  if (session === null) return <LoginPanel />;

  const assignmentCount = session.assignments.length;
  const contextControl = assignmentCount === 1 ? (
    <span className="context-label">{contextLabel(session.assignments[0])}</span>
  ) : (
    <ContextSwitch context={session.context} assignments={session.assignmentGroups} onChanged={() => loadSession()} />
  );
  const validContext = session.context?.valid && !session.context.blocked;
  const currentTitle = view === 'kund' ? 'Kundadministration' : view === 'logg' ? 'Säkerhetslogg' : 'Kommande funktion';

  return (
    <SidebarProvider style={{ '--sidebar-width': '15.5rem' } as React.CSSProperties}>
      <a className="skip" href="#workspace">Till innehållet</a>
      <Sidebar className="app-sidebar">
        <ProtectedNavigation session={session} view={view} setView={setView} />
      </Sidebar>
      <div className="application">
        <header className="topbar protected-topbar">
          <div className="breadcrumbs"><SidebarTrigger aria-label="Visa eller dölj navigation" /><span>Arbetsyta</span><strong>{currentTitle}</strong></div>
          <div className="top-actions">
            <span className="demo-pill">Skyddad provmiljö</span>
            {contextControl}
            <Button variant="ghost" onClick={() => void logout()}>Logga ut</Button>
            <Button variant="ghost" size="icon" aria-label="Om den skyddade provmiljön" onClick={() => setHelp(true)}><LifeBuoy size={19} /></Button>
          </div>
        </header>
        {!validContext ? (
          <main id="workspace" className="workspace"><section className="admin-empty"><h1>Välj uppdrag</h1>{session.assignmentGroups.valid.length === 0 && <p>Du har inga uppdrag som gäller idag.</p>}{contextControl}<Button variant="outline" onClick={() => void logout()}>Logga ut</Button></section></main>
        ) : (
          <main id="workspace" className="workspace protected-workspace" key={session.epoch}>
            {view === 'kund' && <section className="admin-empty"><h1>Kundadministration</h1><p>Administrationsvyn öppnas i nästa del av planen.</p></section>}
            {view === 'logg' && <section className="admin-empty"><h1>Säkerhetslogg</h1><p>Loggvyn öppnas i nästa del av planen.</p></section>}
            {view === 'stangt' && <section className="admin-empty"><h1>Stängt i denna fas</h1><p>Öppnas när mandat och elevregister är verifierade (fas 3–4).</p></section>}
          </main>
        )}
      </div>
      <Dialog open={help} onOpenChange={setHelp}>
        <DialogContent>
          <DialogTitle>Om den skyddade provmiljön</DialogTitle>
          <DialogDescription>Det valda uppdraget styr vilken kund, huvudman, skolenhet och funktion du får arbeta med. Ett byte rensar innehållet i alla öppna flikar. Den lokala testleverantören är inte en godkänd anslutning till en kommuns identitetsleverantör.</DialogDescription>
          <DialogClose render={<Button variant="outline" />}>Stäng hjälpen</DialogClose>
        </DialogContent>
      </Dialog>
    </SidebarProvider>
  );
}

export default function ProtectedHome() {
  return <UnsavedChangesProvider><ProtectedShell /></UnsavedChangesProvider>;
}
