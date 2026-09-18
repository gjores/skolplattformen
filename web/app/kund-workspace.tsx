'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { FUNCTION_LABEL, type AccessFunction } from '@/lib/access-rules.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { messageText } from '@/lib/session-channel.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ActiveContext } from './context-switch';
import type { SessionResponse } from './protected-home';

type Overview = {
  customer: { id: string; name: string };
  counts: { memberships: number; assignments: number; invitationsOpen: number };
};
type MemberAssignment = {
  id: string;
  function: AccessFunction;
  organizerName: string | null;
  unitName: string | null;
  validFrom: string;
  validTo: string | null;
  endedAt: string | null;
  state: 'giltigt' | 'kommande' | 'avslutat';
};
type Member = {
  membershipId: string;
  displayName: string | null;
  email: string | null;
  issuer: string;
  status: 'active' | 'blocked';
  assignments: MemberAssignment[];
};
type Invitation = {
  id: string;
  personName: string;
  expectedIssuer: string;
  grants: Array<{ function: AccessFunction }>;
  expiresAt: string;
  usedAt: string | null;
};
type Organizer = {
  id: string;
  name: string;
  organizationNumber: string | null;
  type: 'Kommun' | 'Enskild' | 'Region' | 'Staten';
  unitCount: number;
};
type SchoolUnit = {
  id: string;
  code: string;
  name: string;
  municipalityName: string | null;
  status: string;
  schoolTypes: string[];
  principal: { assignmentId: string; name: string } | null;
};
type Organization = {
  organizer: { id: string; name: string; type: string };
  units: SchoolUnit[];
  staff: Array<{ id: string; name: string; role: 'rektor' | 'larare'; unitIds: string[] }>;
};
type RegistryUnit = {
  code: string;
  name: string;
  municipalityName?: string;
  schoolTypes: string[];
  organizer: { name: string; organizationNumber?: string; type: string };
};

type Props = {
  context: ActiveContext;
  identity: SessionResponse['identity'];
  epoch: number;
  onMfaRequired: () => void;
  onSessionLost: () => void;
};

function shortIssuer(issuer: string): string {
  try { return new URL(issuer).hostname; } catch { return issuer; }
}

function personName(member: Member): string {
  return member.displayName ?? member.email ?? 'Namnlös medlem';
}

function formatError(error: unknown): string | null {
  if (error instanceof ApiError) {
    return `${messageText(error.code)}${error.correlationId ? ` (ref ${error.correlationId})` : ''}`;
  }
  if (error instanceof DOMException && error.name === 'AbortError') return null;
  return 'Åtgärden kunde inte slutföras. Försök igen.';
}

export default function KundWorkspace({ context, identity, epoch, onMfaRequired, onSessionLost }: Props) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [organizers, setOrganizers] = useState<Organizer[]>([]);
  const [selectedOrganizer, setSelectedOrganizer] = useState('');
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [invite, setInvite] = useState({ personName: '', expectedIssuer: identity.issuer, expectedSubject: '', expectedEmail: '', grant: 'kundadmin' as 'kundadmin' | 'granskare', ttl: '72h' });
  const [invitationLink, setInvitationLink] = useState('');
  const [organizerForm, setOrganizerForm] = useState({ name: '', organizationNumber: '', type: 'Kommun' as Organizer['type'] });
  const [unitCode, setUnitCode] = useState('');
  const [registryUnit, setRegistryUnit] = useState<RegistryUnit | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ member: Member; unblock: boolean } | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [endTarget, setEndTarget] = useState<{ member: Member; assignment: MemberAssignment } | null>(null);
  const [principalTarget, setPrincipalTarget] = useState<SchoolUnit | null>(null);
  const [principalName, setPrincipalName] = useState('');
  const blockCancel = useRef<HTMLButtonElement>(null);
  const endCancel = useRef<HTMLButtonElement>(null);
  const principalCancel = useRef<HTMLButtonElement>(null);

  const inviteDirty = Object.values(invite).some((value) => value !== '') &&
    (invite.personName !== '' || invite.expectedSubject !== '' || invite.expectedEmail !== '');
  const organizerDirty = organizerForm.name !== '' || organizerForm.organizationNumber !== '';
  useUnsavedChanges(`kund-invite-${epoch}`, inviteDirty);
  useUnsavedChanges(`kund-organizer-${epoch}`, organizerDirty);
  useUnsavedChanges(`kund-unit-${epoch}`, unitCode !== '');
  useUnsavedChanges(`kund-block-${epoch}`, blockReason !== '');
  useUnsavedChanges(`kund-principal-${epoch}`, principalName !== '');

  const handleError = useCallback((caught: unknown) => {
    if (caught instanceof ApiError && caught.code === 'mfa_required') {
      setBlockTarget(null);
      setEndTarget(null);
      setPrincipalTarget(null);
      setBlockReason('');
      setPrincipalName('');
      onMfaRequired();
      setError(messageText(caught.code));
      return;
    }
    if (
      caught instanceof ApiError &&
      (caught.status === 401 || ['membership_blocked', 'assignment_ended', 'assignment_expired', 'context_changed'].includes(caught.code))
    ) {
      onSessionLost();
      return;
    }
    setError(formatError(caught));
  }, [onMfaRequired, onSessionLost]);

  const loadBase = useCallback(async () => {
    setError(null);
    try {
      const [nextOverview, nextMembers, nextInvitations, nextOrganizers] = await Promise.all([
        api.get<Overview>('/api/kund/oversikt'),
        api.get<{ members: Member[] }>('/api/kund/medlemmar'),
        api.get<{ invitations: Invitation[] }>('/api/kund/inbjudan'),
        api.get<{ organizers: Organizer[] }>('/api/kund/huvudman'),
      ]);
      setOverview(nextOverview);
      setMembers(nextMembers.members);
      setInvitations(nextInvitations.invitations);
      setOrganizers(nextOrganizers.organizers);
      setSelectedOrganizer((current) => current || nextOrganizers.organizers[0]?.id || '');
    } catch (caught) { handleError(caught); }
  }, [handleError]);

  const loadOrganization = useCallback(async (organizerId: string) => {
    if (!organizerId) { setOrganization(null); return; }
    try {
      setOrganization(await api.get<Organization>(`/api/organisation?huvudman=${encodeURIComponent(organizerId)}`));
    } catch (caught) { handleError(caught); }
  }, [handleError]);

  useEffect(() => { queueMicrotask(() => void loadBase()); }, [loadBase]);
  useEffect(() => { if (selectedOrganizer) queueMicrotask(() => void loadOrganization(selectedOrganizer)); }, [loadOrganization, selectedOrganizer]);
  useEffect(() => { if (blockTarget) blockCancel.current?.focus(); }, [blockTarget]);
  useEffect(() => { if (endTarget) endCancel.current?.focus(); }, [endTarget]);
  useEffect(() => { if (principalTarget) principalCancel.current?.focus(); }, [principalTarget]);

  async function mutate(action: () => Promise<unknown>, success: string, reload: 'base' | 'organization' | 'both' = 'base') {
    setBusy(true); setError(null); setStatus(null);
    try {
      await action();
      setStatus(success);
      if (reload === 'base' || reload === 'both') await loadBase();
      if ((reload === 'organization' || reload === 'both') && selectedOrganizer) await loadOrganization(selectedOrganizer);
      return true;
    } catch (caught) { handleError(caught); return false; }
    finally { setBusy(false); }
  }

  async function submitInvitation(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const result = await (async () => {
      setBusy(true); setError(null); setStatus(null);
      try {
        const created = await api.post<{ link: string }>('/api/kund/inbjudan', {
          personName: invite.personName,
          expectedIssuer: invite.expectedIssuer,
          expectedSubject: invite.expectedSubject,
          expectedEmail: invite.expectedEmail || undefined,
          grants: [invite.grant],
          ttl: invite.ttl,
        });
        setInvitationLink(created.link);
        setInvite({ personName: '', expectedIssuer: identity.issuer, expectedSubject: '', expectedEmail: '', grant: 'kundadmin', ttl: '72h' });
        setStatus('Inbjudan är skapad. Länken visas bara nu.');
        await loadBase();
        return true;
      } catch (caught) { handleError(caught); return false; }
      finally { setBusy(false); }
    })();
    return result;
  }

  async function submitOrganizer(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const ok = await mutate(() => api.post('/api/kund/huvudman', {
      name: organizerForm.name,
      organizationNumber: organizerForm.organizationNumber || null,
      type: organizerForm.type,
    }), 'Huvudmannen är tillagd.');
    if (ok) setOrganizerForm({ name: '', organizationNumber: '', type: 'Kommun' });
  }

  async function lookupUnit() {
    setBusy(true); setError(null); setRegistryUnit(null);
    try {
      const result = await api.get<{ unit: RegistryUnit }>(`/api/skolenhet?kod=${encodeURIComponent(unitCode)}`);
      setRegistryUnit(result.unit);
      setStatus('Skolenheten är hämtad från Skolenhetsregistret.');
    } catch (caught) {
      if (caught instanceof ApiError && caught.status >= 500) setError('Skolenhetsregistret svarar inte just nu.');
      else handleError(caught);
    } finally { setBusy(false); }
  }

  async function addUnit() {
    if (!registryUnit || !selectedOrganizer) return;
    const ok = await mutate(
      () => api.post('/api/kund/skolenhet', { organizerId: selectedOrganizer, code: registryUnit.code }),
      'Skolenheten är tillagd.',
      'both',
    );
    if (ok) { setUnitCode(''); setRegistryUnit(null); }
  }

  async function changeBlock() {
    if (!blockTarget) return;
    const { member, unblock } = blockTarget;
    const ok = await mutate(
      () => unblock
        ? api.patch('/api/kund/medlemskap/sparr', { membershipId: member.membershipId, action: 'unblock' })
        : api.post('/api/kund/medlemskap/sparr', { membershipId: member.membershipId, reason: blockReason }),
      unblock ? 'Spärren är hävd.' : 'Medlemskapet är spärrat.',
    );
    if (ok) { setBlockTarget(null); setBlockReason(''); }
  }

  async function endAssignment() {
    if (!endTarget) return;
    const ok = await mutate(
      () => api.post('/api/kund/uppdrag/avsluta', { assignmentId: endTarget.assignment.id }),
      'Uppdraget är avslutat.',
    );
    if (ok) setEndTarget(null);
  }

  async function appointPrincipal() {
    if (!principalTarget || !selectedOrganizer) return;
    const ok = await mutate(
      () => api.post('/api/kund/rektor', { organizerId: selectedOrganizer, unitId: principalTarget.id, principalName }),
      'Rektorn är utsedd.',
      'organization',
    );
    if (ok) { setPrincipalTarget(null); setPrincipalName(''); }
  }

  const customerName = overview?.customer.name ?? context.customerName;
  const selectedOrganizerName = organizers.find((item) => item.id === selectedOrganizer)?.name ?? '';
  const currentMembers = useMemo(() => members, [members]);

  return (
    <div className="admin-workspace protected-admin" aria-busy={busy}>
      <div className="admin-heading"><div><p className="admin-kicker">SKYDDAD PROVMILJÖ</p><h1>Kundadministration</h1><p>Hantera {customerName} inom det uppdrag som visas i sidhuvudet.</p></div></div>
      {status && <output className="admin-notice">{status}</output>}
      {error && <output role="alert" className="validation-warning">{error} Försök igen eller använd referensen när du kontaktar support.</output>}
      {busy && <output className="protected-loading">Arbetar…</output>}

      <section className="protected-card"><h2>Översikt</h2>{overview ? <dl className="protected-counts"><div><dt>Medlemmar</dt><dd>{overview.counts.memberships}</dd></div><div><dt>Uppdrag</dt><dd>{overview.counts.assignments}</dd></div><div><dt>Öppna inbjudningar</dt><dd>{overview.counts.invitationsOpen}</dd></div></dl> : <output>Laddar översikten…</output>}</section>

      <section className="protected-card"><h2>Medlemmar</h2>
        <div className="protected-table-scroll"><table className="admin-table protected-table"><thead><tr><th>Person</th><th>Utfärdare</th><th>Status</th><th>Uppdrag</th><th>Handlingar</th></tr></thead><tbody>
          {currentMembers.map((member) => <tr key={member.membershipId}><td><strong>{personName(member)}</strong><span className="cell-secondary">{member.email ?? 'Ingen e-post för visning'}</span></td><td>{shortIssuer(member.issuer)}</td><td>{member.status === 'active' ? 'Aktiv' : 'Spärrad'}</td><td>{member.assignments.length === 0 ? 'Inga uppdrag' : member.assignments.map((assignment) => <div className="protected-assignment" key={assignment.id}><span>{FUNCTION_LABEL[assignment.function]} · {assignment.organizerName ?? customerName}{assignment.unitName ? ` · ${assignment.unitName}` : ''}</span><small>{assignment.validFrom}–{assignment.validTo ?? 'tills vidare'} · {assignment.state}</small>{assignment.state !== 'avslutat' && <Button variant="ghost" onClick={() => setEndTarget({ member, assignment })}>Avsluta</Button>}</div>)}</td><td><Button variant="outline" onClick={() => { setBlockReason(''); setBlockTarget({ member, unblock: member.status === 'blocked' }); }}>{member.status === 'blocked' ? 'Häv spärr' : 'Spärra'}</Button></td></tr>)}
        </tbody></table></div>
      </section>

      <section className="protected-card"><h2>Inbjudningar</h2>
        <div className="protected-table-scroll"><table className="admin-table protected-table"><thead><tr><th>Person</th><th>Funktion</th><th>Gäller till</th><th>Status</th></tr></thead><tbody>{invitations.map((item) => <tr key={item.id}><td>{item.personName}</td><td>{item.grants.map((grant) => FUNCTION_LABEL[grant.function]).join(', ')}</td><td>{new Date(item.expiresAt).toLocaleString('sv-SE')}</td><td>{item.usedAt ? 'Använd' : 'Öppen'}</td></tr>)}</tbody></table></div>
        <form className="protected-form" onSubmit={(event) => void submitInvitation(event)}><h3>Bjud in</h3>
          <label>Namn<input required value={invite.personName} onChange={(event) => setInvite({ ...invite, personName: event.target.value })} /></label>
          <label>Förväntad utfärdare<input required type="url" value={invite.expectedIssuer} onChange={(event) => setInvite({ ...invite, expectedIssuer: event.target.value })} /></label>
          <label>Förväntat subjekt-ID<input required value={invite.expectedSubject} onChange={(event) => setInvite({ ...invite, expectedSubject: event.target.value })} /><small>Hämtas efter extern identitetsverifiering.</small></label>
          <label>E-post (valfri)<input type="email" value={invite.expectedEmail} onChange={(event) => setInvite({ ...invite, expectedEmail: event.target.value })} /><small>Används bara för visning.</small></label>
          <label>Funktion<select value={invite.grant} onChange={(event) => setInvite({ ...invite, grant: event.target.value as 'kundadmin' | 'granskare' })}><option value="kundadmin">Kundadministration</option><option value="granskare">Granskning</option></select></label>
          <label>Giltighet<select value={invite.ttl} onChange={(event) => setInvite({ ...invite, ttl: event.target.value })}><option value="24h">24 timmar</option><option value="72h">72 timmar</option><option value="7d">7 dagar</option></select></label>
          <Button type="submit" disabled={busy}>Bjud in</Button>
        </form>
        {invitationLink && <output className="protected-one-time"><strong>Engångslänk (visas bara nu):</strong><input readOnly value={invitationLink} aria-label="Engångslänk" /><Button variant="outline" onClick={() => void navigator.clipboard.writeText(invitationLink)}>Kopiera</Button></output>}
      </section>

      <section className="protected-card"><h2>Huvudmän</h2>
        <ul className="protected-directory">{organizers.map((item) => <li key={item.id}><button aria-pressed={selectedOrganizer === item.id} onClick={() => setSelectedOrganizer(item.id)}><strong>{item.name}</strong><span>{item.type} · {item.unitCount} skolenheter</span></button></li>)}</ul>
        <form className="protected-form" onSubmit={(event) => void submitOrganizer(event)}><h3>Lägg till huvudman</h3><label>Namn<input required value={organizerForm.name} onChange={(event) => setOrganizerForm({ ...organizerForm, name: event.target.value })} /></label><label>Organisationsnummer<input inputMode="numeric" pattern="[0-9]{10}" value={organizerForm.organizationNumber} onChange={(event) => setOrganizerForm({ ...organizerForm, organizationNumber: event.target.value })} /><small>Organisationsnumret ger ingen behörighet; det är en uppgift om huvudmannen.</small></label><label>Typ<select value={organizerForm.type} onChange={(event) => setOrganizerForm({ ...organizerForm, type: event.target.value as Organizer['type'] })}><option>Kommun</option><option>Enskild</option><option>Region</option><option>Staten</option></select></label><Button type="submit" disabled={busy}>Lägg till huvudman</Button></form>
      </section>

      {selectedOrganizer && <section className="protected-card"><h2>Skolenheter hos {selectedOrganizerName}</h2>
        <div className="protected-table-scroll"><table className="admin-table protected-table"><thead><tr><th>Kod</th><th>Namn</th><th>Kommun</th><th>Skolform</th><th>Rektor</th><th>Handling</th></tr></thead><tbody>{organization?.units.map((unit) => <tr key={unit.id}><td>{unit.code}</td><td>{unit.name}</td><td>{unit.municipalityName ?? 'Saknas'}</td><td>{unit.schoolTypes.join(', ') || 'Saknas'}</td><td>{unit.principal?.name ?? 'Inte utsedd'}</td><td><Button variant="outline" onClick={() => { setPrincipalName(''); setPrincipalTarget(unit); }}>Utse rektor</Button></td></tr>)}</tbody></table></div>
        <div className="protected-form"><h3>Lägg till skolenhet</h3><label>Skolenhetskod<input inputMode="numeric" pattern="[0-9]{8}" value={unitCode} onChange={(event) => { setUnitCode(event.target.value); setRegistryUnit(null); }} /></label><Button variant="outline" disabled={busy || !/^\d{8}$/u.test(unitCode)} onClick={() => void lookupUnit()}>Hämta från Skolenhetsregistret</Button>{registryUnit && <div className="og-preview"><strong>{registryUnit.name}</strong><span>{registryUnit.municipalityName ?? 'Kommun saknas'} · {registryUnit.schoolTypes.join(', ')}</span><Button disabled={busy} onClick={() => void addUnit()}>Lägg till</Button></div>}</div>
      </section>}

      <Dialog open={blockTarget !== null} onOpenChange={(open) => { if (!open) { setBlockTarget(null); setBlockReason(''); } }}><DialogContent className="admin-dialog" showCloseButton={false}><DialogTitle>{blockTarget?.unblock ? 'Häv spärren?' : 'Spärra medlemskap'}</DialogTitle><DialogDescription>{blockTarget && `${personName(blockTarget.member)} hos ${customerName}. ${blockTarget.unblock ? 'Personen kan åter använda giltiga uppdrag.' : 'Alla aktiva sessioner för medlemskapet avslutas och uppdragen kan inte användas.'}`}</DialogDescription>{!blockTarget?.unblock && <label className="field-label">Orsak<textarea maxLength={200} value={blockReason} onChange={(event) => setBlockReason(event.target.value)} /></label>}<div className="dialog-actions"><Button ref={blockCancel} variant="ghost" onClick={() => { setBlockTarget(null); setBlockReason(''); }}>Avbryt</Button><Button disabled={busy} onClick={() => void changeBlock()}>{blockTarget?.unblock ? 'Häv spärr' : 'Spärra'}</Button></div></DialogContent></Dialog>
      <Dialog open={endTarget !== null} onOpenChange={(open) => { if (!open) setEndTarget(null); }}><DialogContent className="admin-dialog" showCloseButton={false}><DialogTitle>Avsluta uppdraget?</DialogTitle><DialogDescription>{endTarget && `${personName(endTarget.member)} · ${FUNCTION_LABEL[endTarget.assignment.function]} hos ${customerName}. Uppdraget går inte längre att välja efter att det avslutats.`}</DialogDescription><div className="dialog-actions"><Button ref={endCancel} variant="ghost" onClick={() => setEndTarget(null)}>Avbryt</Button><Button disabled={busy} onClick={() => void endAssignment()}>Avsluta</Button></div></DialogContent></Dialog>
      <Dialog open={principalTarget !== null} onOpenChange={(open) => { if (!open) { setPrincipalTarget(null); setPrincipalName(''); } }}><DialogContent className="admin-dialog" showCloseButton={false}><DialogTitle>Utse rektor för {principalTarget?.name}</DialogTitle><DialogDescription>{`${customerName} · ${selectedOrganizerName}. Huvudmannen utser rektor; ett tidigare rektorsuppdrag vid skolenheten ersätts.`}</DialogDescription><label className="field-label">Namn<input maxLength={120} value={principalName} onChange={(event) => setPrincipalName(event.target.value)} /></label><div className="dialog-actions"><Button ref={principalCancel} variant="ghost" onClick={() => { setPrincipalTarget(null); setPrincipalName(''); }}>Avbryt</Button><Button disabled={busy || !principalName.trim()} onClick={() => void appointPrincipal()}>Utse rektor</Button></div></DialogContent></Dialog>
    </div>
  );
}
