'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { DatePicker } from '@/components/ui/date-picker';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePlanningSetup } from '@/lib/planning-year-contract.ts';
import { parsePersonalCommand, parsePersonalCommandReply, parsePersonalReadReply, personalCommandRef, TjanstContractError, type TjanstCommandRef, type TjanstEmployment,
  type TjanstPerson, type TjanstPersonalAction, type TjanstPersonalPayload, type TjanstPersonalRead } from '@/lib/tjanst-contract.ts';
import type { TjanstJournalScope } from '@/lib/tjanst-journal.ts';
import { capacityViolations } from '@/lib/tjanst-model.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import type { ActiveContext } from './context-switch';
import { described, Field, Problems, Shell, useSubmit, type TjanstFailure, type TjanstOutcome } from './tjanst-dialogs';
import { recoverTracked, TRACKED_TEXT, trackedCommand } from './tjanst-tracked';
import './tjanst.css';

/**
 * Huvudmannens vy Personal (TJANST-07, D-12, D-19). Personer, anställningar och andelar per skola. Alla ändringar kräver
 * engångskod (servern prövar). Inga personnummer, avtal eller arbetstidsramar. SS 12000: Personal-ID är internt och stabilt,
 * externt ID visas med källa (Person.externalIdentifiers), andel per skola motsvarar Duty.dutyPercent. Inget utbyte påstås.
 * Sökordet och valt personkort hålls utanför adressen; personkortet ligger i history.state.
 */
export type PersonalWorkspaceProps = { context: ActiveContext; epoch: number; identityKey: string | null; today: string; onSessionLost?: () => void };
type Unit = { unitId: string; schoolName: string };
type Dialog = { kind: 'person'; person: TjanstPerson | null } | { kind: 'employment'; person: TjanstPerson; employment: TjanstEmployment | null }
  | { kind: 'duties'; person: TjanstPerson; employment: TjanstEmployment };
const LOCK_CODES = ['context_changed', 'assignment_ended', 'assignment_expired', 'membership_blocked'];
const MFA = 'Att ändra personaluppgifter kräver verifiering med engångskod.';
const failed = (error: string, extra: Partial<TjanstFailure> = {}): TjanstFailure => ({ ok: false, error, ...extra });
const fullName = (p: Pick<TjanstPerson, 'givenName' | 'familyName'>) => `${p.givenName} ${p.familyName}`;
const period = (from: string, to: string | null) => `${from} – ${to ?? 'tills vidare'}`;
const covers = (p: { startsOn: string; endsOn: string | null }, day: string) => p.startsOn <= day && (p.endsOn === null || p.endsOn >= day);

/** Anställningen som gäller i dag, annars den närmast kommande, annars den senaste. */
export function currentEmployment(person: TjanstPerson, today: string): TjanstEmployment | null {
  const sorted = [...person.employments].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return sorted.find(e => covers(e, today)) ?? sorted.find(e => e.startsOn > today) ?? sorted.at(-1) ?? null;
}
/** Fördelat {s} av {g} %: andelarna som gäller på referensdagen (i dag eller anställningens start). */
export function allocated(employment: TjanstEmployment, today: string): number {
  const day = employment.startsOn > today ? employment.startsOn : today;
  return employment.duties.filter(d => covers(d, day)).reduce((n, d) => n + d.percent, 0);
}
export const needsCompletion = (p: TjanstPerson) => p.status === 'draft' || p.employments.length === 0 || p.duties.length === 0;

function usePhone(): boolean {
  const [phone, setPhone] = useState(() => typeof window !== 'undefined' && window.matchMedia('(max-width: 800px)').matches);
  useEffect(() => {
    const media = window.matchMedia('(max-width: 800px)'), update = () => setPhone(media.matches);
    media.addEventListener('change', update); update();
    return () => media.removeEventListener('change', update);
  }, []);
  return phone;
}

export default function PersonalWorkspace(props: PersonalWorkspaceProps) {
  return <Workspace key={`${props.epoch}-${props.context.assignmentId}`} {...props}/>;
}

function Workspace({ context, identityKey, today, onSessionLost }: PersonalWorkspaceProps) {
  const [data, setData] = useState<TjanstPersonalRead | null>(null), [units, setUnits] = useState<Unit[]>([]), [loading, setLoading] = useState(true);
  const [readError, setReadError] = useState<{ text: string; retry: boolean; correlationId: string | null } | null>(null), [readKey, setReadKey] = useState(0);
  const [query, setQuery] = useState(''), [onlyIncomplete, setOnlyIncomplete] = useState(false);
  const [personId, setPersonId] = useState<string | null>(() => typeof window !== 'undefined' && typeof window.history.state?.personal?.personId === 'string' ? window.history.state.personal.personId : null);
  const [dialog, setDialog] = useState<Dialog | null>(null), [notice, setNotice] = useState<string | null>(null), [checking, setChecking] = useState(false);
  const phone = usePhone(), id = useId();
  const active = useRef(true), generation = useRef(0), lost = useRef(onSessionLost), cardHeading = useRef<HTMLHeadingElement>(null), opener = useRef<string | null>(null);
  useLayoutEffect(() => { lost.current = onSessionLost; });
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const scope = useMemo<TjanstJournalScope | null>(() => identityKey ? { identityKey, assignmentId: context.assignmentId } : null, [identityKey, context.assignmentId]);
  useUnsavedChanges('navigation-block:personal', checking);

  const load = useCallback(async () => {
    const token = ++generation.current;
    setLoading(true);
    try {
      const [reply, setup] = await Promise.all([api.post('/api/tjanst/personal/lasa', {}).then(v => parsePersonalReadReply(v, {})), api.get('/api/planering/urval').then(parsePlanningSetup)]);
      if (!active.current || token !== generation.current) return;
      setData(reply); setUnits(setup.units.map(u => ({ unitId: u.unitId, schoolName: u.schoolName }))); setReadError(null);
    } catch (caught) {
      if (!active.current || token !== generation.current || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { lost.current?.(); return; }
      const failure = caught instanceof TjanstContractError ? { text: 'Personalens underlag kunde inte kontrolleras. Hämta det igen.', retry: true, correlationId: null }
        : !(caught instanceof ApiError) ? { text: 'Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.', retry: true, correlationId: null }
        : LOCK_CODES.includes(caught.code) ? { text: 'Uppdraget har ändrats. Ladda om arbetsytan.', retry: false, correlationId: caught.correlationId }
        : caught.code === 'audit_unavailable' ? { text: 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.', retry: true, correlationId: caught.correlationId }
        : caught.status === 403 ? { text: 'Ditt aktuella uppdrag tillåter inte att läsa personal.', retry: false, correlationId: caught.correlationId }
        : { text: 'Personalen kunde inte hämtas. Försök igen.', retry: true, correlationId: caught.correlationId };
      if (caught instanceof TjanstContractError || caught instanceof ApiError && caught.status === 403) { setData(null); setDialog(null); }
      setReadError(failure);
    } finally { if (active.current && token === generation.current) setLoading(false); }
  }, []);
  useEffect(() => { queueMicrotask(() => void load()); }, [load, readKey]);
  const refresh = useCallback(() => setReadKey(n => n + 1), []);

  // Ett kvarlämnat sparförsök (före omladdning) avgörs med statuskvittot för huvudmannens mål.
  const recovered = useRef(false);
  useEffect(() => {
    if (!data || recovered.current) return;
    recovered.current = true;
    void (async () => {
      for (const person of [null, ...data.people]) {
        const template: TjanstCommandRef = { family: 'personal', commandId: crypto.randomUUID(), action: 'create_person', target: { unitId: null, schoolYear: null, versionId: null, personId: person?.id ?? null } };
        const state = await recoverTracked(scope, template);
        if (!state || !active.current) continue;
        setNotice(state === 'completed' ? 'Ändringen är sparad.' : state === 'not_completed' ? 'Ändringen sparades inte. Gör om den om den behövs.' : TRACKED_TEXT.unknown);
        if (state !== 'unknown') refresh();
      }
    })();
  }, [data, scope, refresh]);

  // Personkortet är en historikpost i samma adress, så att Tillbaka och webbläsarens Back fungerar lika.
  useEffect(() => {
    const pop = () => { const next = window.history.state?.personal?.personId; setPersonId(typeof next === 'string' ? next : null); setDialog(null); };
    window.addEventListener('popstate', pop);
    return () => window.removeEventListener('popstate', pop);
  }, []);
  function openCard(person: TjanstPerson) {
    opener.current = person.id; setNotice(null);
    window.history.pushState({ ...window.history.state, personal: { personId: person.id } }, '', window.location.pathname + window.location.search);
    setPersonId(person.id);
  }
  function back() { if (window.history.state?.personal) window.history.back(); else setPersonId(null); }
  useEffect(() => { if (personId && data) cardHeading.current?.focus(); }, [personId, data]);
  useEffect(() => {
    if (personId || !opener.current) return;
    // Tabell och kort finns båda i DOM; fokus går till den synliga knappen (kort ≤ 800 px).
    const target = [...document.querySelectorAll<HTMLElement>(`[data-person-button="${CSS.escape(opener.current)}"]`)].find(e => e.getClientRects().length > 0);
    if (target) { target.focus(); opener.current = null; }
  }, [personId, data]);

  async function command<A extends TjanstPersonalAction>(action: A, expectedRevision: number, payload: TjanstPersonalPayload[A], message: string): Promise<TjanstOutcome> {
    let parsed;
    try { parsed = parsePersonalCommand({ commandId: crypto.randomUUID(), action, expectedRevision, payload }); }
    catch { return failed('Formuläret innehåller fel. Rätta de markerade fälten.'); }
    setNotice(null);
    const result = await trackedCommand(scope, personalCommandRef(parsed), '/api/tjanst/personal/kommando', parsed, value => parsePersonalCommandReply(value, parsed, {}),
      { onChecking: () => setChecking(true), onSessionLost: () => lost.current?.() });
    if (active.current) setChecking(false);
    if (!result.ok) {
      if (result.failure !== 'explicit') return failed(TRACKED_TEXT[result.failure]);
      const caught = result.error, code = caught.reason ?? caught.code, correlationId = caught.correlationId;
      if (caught.code === 'mfa_required') return failed('', { mfa: MFA });
      if (code === 'audit_unavailable') return failed('Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig. Dina uppgifter finns kvar i formuläret.', { correlationId });
      if (LOCK_CODES.includes(code)) return failed('Uppdraget har ändrats. Ladda om arbetsytan.', { correlationId });
      if (caught.status === 403) return failed('Ditt aktuella uppdrag tillåter inte ändringen.', { correlationId });
      if (caught.status === 409) return failed('Personen har ändrats av någon annan. Din ändring har inte sparats. Hämta aktuellt läge och gör om ändringen.', { correlationId, code, refresh });
      if (caught.status === 400) return failed(code === 'tjanst_employment_overlap' ? 'Anställningen överlappar en annan anställning för personen.' : 'Formuläret innehåller fel. Rätta de markerade fälten.', { correlationId, code });
      return failed('Ändringen kunde inte sparas. Dina uppgifter finns kvar i formuläret.', { correlationId });
    }
    if (active.current) { setData(result.reply.detail); setNotice(message); refresh(); }
    return { ok: true };
  }

  const people = useMemo(() => {
    const words = query.trim().toLocaleLowerCase('sv').split(/\s+/u).filter(Boolean);
    return (data?.people ?? []).filter(p => (!onlyIncomplete || needsCompletion(p)) && words.every(w => fullName(p).toLocaleLowerCase('sv').includes(w)));
  }, [data, query, onlyIncomplete]);
  const schoolName = (unitId: string | null) => units.find(u => u.unitId === unitId)?.schoolName ?? 'okänd skola';
  const canManage = !!data?.capabilities.canManage && !phone && !!scope;
  const can = (action: TjanstPersonalAction) => canManage && !!data?.actions.includes(action);
  const person = personId ? data?.people.find(p => p.id === personId) ?? null : null;
  const close = () => setDialog(null);

  const messages = <div className="tjanst-messages">
    {notice && <output className="admin-notice"><CheckCheck size={16} aria-hidden="true"/><span>{notice}</span></output>}
    {checking && <output className="admin-notice">{TRACKED_TEXT.checking}</output>}
    {readError && <div role="alert" className="validation-warning"><p>{readError.text}</p>{readError.correlationId && <p>Referens: {readError.correlationId}</p>}
      {readError.retry && <Button variant="outline" aria-label="Hämta personalen igen" onClick={refresh}>Hämta igen</Button>}</div>}
    {loading && <output aria-busy="true">Hämtar personal…</output>}
  </div>;
  const dialogs = <>
    {dialog?.kind === 'person' && <PersonDialog key={dialog.person?.id ?? 'ny'} person={dialog.person} checking={checking} onClose={close}
      onSave={draft => dialog.person ? command('update_person', dialog.person.revision, { personId: dialog.person.id, ...draft }, `Uppgifterna för ${fullName(draft)} är sparade.`)
        : command('create_person', 0, draft, `${fullName(draft)} är upplagd.`)}/>}
    {dialog?.kind === 'employment' && <EmploymentDialog key={dialog.employment?.id ?? 'ny'} employment={dialog.employment} checking={checking} onClose={close}
      onSave={draft => command('save_employment', dialog.person.revision, { personId: dialog.person.id, employmentId: dialog.employment?.id ?? null, ...draft },
        `Anställningen är sparad: ${draft.percent} % · ${period(draft.startsOn, draft.endsOn)}.`)}/>}
    {dialog?.kind === 'duties' && <DutiesDialog key={dialog.employment.id} employment={dialog.employment} units={units} checking={checking} onClose={close}
      onSave={duties => command('save_duties', dialog.person.revision, { personId: dialog.person.id, employmentId: dialog.employment.id, duties },
        `Andelarna är sparade: ${duties.map(d => `${schoolName(d.unitId)} ${d.percent} %`).join(', ') || 'inga andelar'}.`)}/>}
  </>;

  if (personId && person) {
    const employments = [...person.employments].sort((a, b) => a.startsOn.localeCompare(b.startsOn));
    return <div className="admin-workspace protected-admin tjanst personal" aria-busy={loading}>
      <div className="mandate-actions"><Button variant="outline" onClick={back}>Tillbaka till personallistan</Button></div>
      <div className="admin-heading tjanst-heading"><div>
        <span className="admin-kicker">PERSONAL</span>
        <h1 ref={cardHeading} tabIndex={-1}>{fullName(person)}</h1>
        <p className="tjanst-subline">Personal-ID {person.id}</p>
      </div></div>
      {messages}
      <section className="protected-card personal-card" aria-labelledby={`${id}-facts`}>
        <h2 id={`${id}-facts`}>Uppgifter</h2>
        <dl className="mandate-facts">
          <div><dt>Namn</dt><dd>{fullName(person)}</dd></div>
          <div><dt>Externt ID</dt><dd>{person.externalId ? `${person.externalId} (källa: ${person.externalIdSource})` : 'Inget externt ID'}</dd></div>
          {person.status === 'draft' && <div><dt>Status</dt><dd><Badge variant="outline" className="tjanst-badge">Ny lärare · från {schoolName(person.proposedForUnitId)}</Badge>{person.draftNote && <small>{person.draftNote}</small>}</dd></div>}
        </dl>
        {can('update_person') && <div className="mandate-actions"><Button variant="outline" onClick={() => setDialog({ kind: 'person', person })}>Ändra uppgifter</Button></div>}
      </section>
      <section className="protected-card personal-card" aria-labelledby={`${id}-employments`}>
        <h2 id={`${id}-employments`}>Anställningar</h2>
        {employments.length === 0 ? <p className="tjanst-empty-text">Ingen anställning är registrerad.</p>
          : <ul className="personal-list">{employments.map(e => <li key={e.id}><span>{e.percent} % · {period(e.startsOn, e.endsOn)}</span>
            {can('save_employment') && <Button variant="outline" onClick={() => setDialog({ kind: 'employment', person, employment: e })}>Ändra anställningen</Button>}</li>)}</ul>}
        {can('save_employment') && <div className="mandate-actions"><Button variant="outline" onClick={() => setDialog({ kind: 'employment', person, employment: null })}><Plus size={16} aria-hidden="true"/>Lägg till anställning</Button></div>}
      </section>
      <section className="protected-card personal-card" aria-labelledby={`${id}-duties`}>
        <h2 id={`${id}-duties`}>Skoluppdrag</h2>
        {employments.length === 0 ? <p className="tjanst-empty-text">Lägg till en anställning innan du fördelar på skolor.</p> : employments.map(e => <div key={e.id} className="personal-duties">
          <h3>Anställning {e.percent} % · {period(e.startsOn, e.endsOn)}</h3>
          <p>Fördelat: {allocated(e, today)} av {e.percent} %</p>
          {e.duties.length === 0 ? <p className="tjanst-empty-text">Inga skoluppdrag.</p>
            : <ul className="personal-list">{e.duties.map(d => <li key={d.id}>{d.schoolName} · {d.percent} % · {period(d.startsOn, d.endsOn)}</li>)}</ul>}
          {can('save_duties') && <div className="mandate-actions"><Button variant="outline" onClick={() => setDialog({ kind: 'duties', person, employment: e })}>Fördela på skolor</Button></div>}
        </div>)}
      </section>
      <section className="protected-card personal-card" aria-labelledby={`${id}-account`}>
        <h2 id={`${id}-account`}>Konto</h2>
        <p>{person.account ? 'Kopplat till ett konto' : 'Inget konto kopplat. Personen kan ändå få undervisning och uppdrag.'}</p>
        <p>Tillgång till Min tjänst ges i Mandat.</p>
      </section>
      {dialogs}
    </div>;
  }

  return <div className="admin-workspace protected-admin tjanst personal" aria-busy={loading}>
    <div className="admin-heading tjanst-heading"><div>
      <span className="admin-kicker">ARBETSYTA</span>
      <h1>Personal</h1>
      <p>Lägg upp personer, anställningar och andelar per skola. Rektor fördelar undervisning och uppdrag i Tjänstefördelning.</p>
    </div></div>
    {messages}
    {data && data.people.length === 0 ? <div className="admin-empty tjanst-state"><h2>Inga personer är upplagda ännu.</h2>
      {can('create_person') && <Button onClick={() => setDialog({ kind: 'person', person: null })}>Lägg till person</Button>}</div>
    : data && <>
      <div className="protected-filter personal-filter">
        <div className="tjanst-field"><label htmlFor={`${id}-search`}>Namn</label><input id={`${id}-search`} type="search" value={query} autoComplete="off" onChange={e => setQuery(e.target.value)}/></div>
        <label className="mandate-check"><input type="checkbox" checked={onlyIncomplete} onChange={e => setOnlyIncomplete(e.target.checked)}/>Visa bara personer som behöver kompletteras</label>
        {can('create_person') && <div className="mandate-actions"><Button onClick={() => setDialog({ kind: 'person', person: null })}><Plus size={16} aria-hidden="true"/>Lägg till person</Button></div>}
      </div>
      {people.length === 0 ? <p className="tjanst-empty-text">Ingen person matchar sökningen.</p> : <>
        <Table className="tjanst-table tjanst-wide personal-table"><TableHeader><TableRow>
          <TableHead scope="col">Namn</TableHead><TableHead scope="col">Tjänstgöringsgrad</TableHead><TableHead scope="col">Skoluppdrag</TableHead>
          <TableHead scope="col">Fördelat</TableHead><TableHead scope="col">Konto</TableHead></TableRow></TableHeader>
          <TableBody>{people.map(p => <PersonRow key={p.id} person={p} today={today} schoolName={schoolName} onOpen={() => openCard(p)}/>)}</TableBody></Table>
        <ul className="tjanst-cards">{people.map(p => <PersonCard key={p.id} person={p} today={today} schoolName={schoolName} onOpen={() => openCard(p)}/>)}</ul>
      </>}
    </>}
    {dialogs}
  </div>;
}

function personFacts(person: TjanstPerson, today: string) {
  const employment = currentEmployment(person, today);
  return { employment, grade: employment ? `${employment.percent} %` : 'Ingen anställning', share: employment ? `${allocated(employment, today)} av ${employment.percent} %` : '–' };
}
function Marks({ person, schoolName }: { person: TjanstPerson; schoolName: (unitId: string | null) => string }) {
  return <>{person.status === 'draft' && <Badge variant="outline" className="tjanst-badge">Ny lärare · från {schoolName(person.proposedForUnitId)}</Badge>}
    {person.status !== 'draft' && needsCompletion(person) && <Badge variant="outline" className="tjanst-badge">Behöver kompletteras</Badge>}</>;
}
function PersonRow({ person, today, schoolName, onOpen }: { person: TjanstPerson; today: string; schoolName: (unitId: string | null) => string; onOpen: () => void }) {
  const f = personFacts(person, today);
  return <TableRow>
    <TableCell className="tjanst-text"><Button variant="link" className="personal-name" data-person-button={person.id} onClick={onOpen}>{fullName(person)}</Button><Marks person={person} schoolName={schoolName}/></TableCell>
    <TableCell>{f.grade}</TableCell>
    <TableCell className="tjanst-text">{person.duties.length === 0 ? '–' : <ul className="personal-list">{person.duties.map(d => <li key={d.id}>{d.schoolName} {d.percent} %</li>)}</ul>}</TableCell>
    <TableCell>{f.share}</TableCell>
    <TableCell>{person.account ? 'Kopplat' : <Badge variant="outline" className="tjanst-badge">Inget konto</Badge>}</TableCell>
  </TableRow>;
}
function PersonCard({ person, today, schoolName, onOpen }: { person: TjanstPerson; today: string; schoolName: (unitId: string | null) => string; onOpen: () => void }) {
  const f = personFacts(person, today);
  return <li className="protected-card">
    <Button variant="link" className="personal-name" data-person-button={person.id} onClick={onOpen}>{fullName(person)}</Button><Marks person={person} schoolName={schoolName}/>
    <span>Tjänstgöringsgrad {f.grade} · Fördelat {f.share}</span>
    {person.duties.map(d => <span key={d.id}>{d.schoolName} {d.percent} %</span>)}
    <span>{person.account ? 'Konto: Kopplat' : <Badge variant="outline" className="tjanst-badge">Inget konto</Badge>}</span>
  </li>;
}

type PersonDraft = { givenName: string; familyName: string; externalId: string | null; externalIdSource: string | null };
function PersonDialog({ person, checking, onClose, onSave }: { person: TjanstPerson | null; checking: boolean; onClose: () => void; onSave: (draft: PersonDraft) => Promise<TjanstOutcome> }) {
  const id = useId();
  const [given, setGiven] = useState(person?.givenName ?? ''), [family, setFamily] = useState(person?.familyName ?? '');
  const [external, setExternal] = useState(person?.externalId ?? ''), [source, setSource] = useState(person?.externalIdSource ?? ''), [errors, setErrors] = useState<Record<string, string>>({});
  const [initial] = useState({ given, family, external, source });
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges(`personal-person-dialog:${person?.id ?? 'ny'}`, given !== initial.given || family !== initial.family || external !== initial.external || source !== initial.source);
  function submit() {
    const next: Record<string, string> = {};
    if (!given.trim()) next.given = 'Ange förnamn.';
    if (!family.trim()) next.family = 'Ange efternamn.';
    if (!!external.trim() !== !!source.trim()) next[external.trim() ? 'source' : 'external'] = external.trim() ? 'Ange källa för det externa ID:t.' : 'Ange externt ID eller töm källan.';
    setErrors(next);
    if (Object.keys(next).length) return;
    void run(() => onSave({ givenName: given.trim(), familyName: family.trim(), externalId: external.trim() || null, externalIdSource: external.trim() ? source.trim() : null }));
  }
  return <Shell open busy={busy} title={person ? 'Ändra uppgifter' : 'Lägg till person'} description="Personnummer registreras inte här. Ett externt ID från ett annat system kan anges med sin källa." onClose={onClose}>
    <Problems failure={failure} summary={Object.keys(errors).length > 0} checking={checking}/>
    <form className="protected-form tjanst-form" noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
      <Field id={`${id}-given`} label="Förnamn" error={errors.given}><input {...described(`${id}-given`, errors.given)} value={given} disabled={busy} onChange={e => setGiven(e.target.value)}/></Field>
      <Field id={`${id}-family`} label="Efternamn" error={errors.family}><input {...described(`${id}-family`, errors.family)} value={family} disabled={busy} onChange={e => setFamily(e.target.value)}/></Field>
      <Field id={`${id}-external`} label="Externt ID (valfritt)" error={errors.external}><input {...described(`${id}-external`, errors.external)} value={external} disabled={busy} onChange={e => setExternal(e.target.value)}/></Field>
      <Field id={`${id}-source`} label="Källa för externt ID (valfritt)" error={errors.source}><input {...described(`${id}-source`, errors.source)} value={source} disabled={busy} onChange={e => setSource(e.target.value)}/></Field>
      <div className="mandate-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button><Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Spara personen'}</Button></div>
    </form>
  </Shell>;
}

type EmploymentDraft = { percent: number; startsOn: string; endsOn: string | null };
const percentError = (value: string) => /^\d{1,3}$/u.test(value.trim()) && Number(value) >= 1 && Number(value) <= 100 ? null : 'Ange en tjänstgöringsgrad mellan 1 och 100 %.';
function EmploymentDialog({ employment, checking, onClose, onSave }: { employment: TjanstEmployment | null; checking: boolean; onClose: () => void; onSave: (draft: EmploymentDraft) => Promise<TjanstOutcome> }) {
  const id = useId();
  const [percent, setPercent] = useState(employment ? String(employment.percent) : ''), [from, setFrom] = useState(employment?.startsOn ?? ''), [to, setTo] = useState(employment?.endsOn ?? '');
  const [errors, setErrors] = useState<Record<string, string>>({}), [initial] = useState({ percent, from, to });
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges(`personal-employment-dialog:${employment?.id ?? 'ny'}`, percent !== initial.percent || from !== initial.from || to !== initial.to);
  function submit() {
    const next: Record<string, string> = {};
    if (!percent.trim()) next.percent = 'Ange tjänstgöringsgrad.'; else { const e = percentError(percent); if (e) next.percent = e; }
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(from)) next.from = 'Ange datum.';
    if (to && to < from) next.to = 'Slutdatum kan inte vara före startdatum.';
    setErrors(next);
    if (Object.keys(next).length) return;
    void run(() => onSave({ percent: Number(percent), startsOn: from, endsOn: to || null }));
  }
  return <Shell open busy={busy} title={employment ? 'Ändra anställningen' : 'Lägg till anställning'} description="Tjänstgöringsgraden är taket för personens andelar på skolorna. Avtal och arbetstidsramar registreras inte här." onClose={onClose}>
    <Problems failure={failure} summary={Object.keys(errors).length > 0} checking={checking}/>
    <form className="protected-form tjanst-form" noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
      <Field id={`${id}-percent`} label="Tjänstgöringsgrad (%)" error={errors.percent}><input {...described(`${id}-percent`, errors.percent)} inputMode="numeric" value={percent} disabled={busy} onChange={e => setPercent(e.target.value)}/></Field>
      <Field id={`${id}-from`} label="Gäller från" error={errors.from}><DatePicker {...described(`${id}-from`, errors.from)} value={from} disabled={busy} onValueChange={setFrom}/></Field>
      <Field id={`${id}-to`} label="Gäller till (valfritt)" error={errors.to}><DatePicker {...described(`${id}-to`, errors.to)} value={to} min={from || undefined} disabled={busy} onValueChange={setTo}/></Field>
      <div className="mandate-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button><Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Spara anställningen'}</Button></div>
    </form>
  </Shell>;
}

type DutyLine = { dutyId: string | null; unitId: string; percent: string; startsOn: string; endsOn: string };
/** Andelssumma räknas med capacityViolations medan användaren skriver; sparknappen är aktiv även över graden, servern avgör (D-12). */
function DutiesDialog({ employment, units, checking, onClose, onSave }: { employment: TjanstEmployment; units: Unit[]; checking: boolean; onClose: () => void;
  onSave: (duties: { dutyId: string | null; unitId: string; percent: number; startsOn: string; endsOn: string | null }[]) => Promise<TjanstOutcome> }) {
  const id = useId();
  const [lines, setLines] = useState<DutyLine[]>(() => {
    const existing = employment.duties.map(d => ({ dutyId: d.id, unitId: d.unitId, percent: String(d.percent), startsOn: d.startsOn, endsOn: d.endsOn ?? '' }));
    const missing = units.filter(u => !existing.some(e => e.unitId === u.unitId)).map(u => ({ dutyId: null, unitId: u.unitId, percent: '', startsOn: employment.startsOn, endsOn: employment.endsOn ?? '' }));
    return [...existing, ...missing].sort((a, b) => (units.find(u => u.unitId === a.unitId)?.schoolName ?? '').localeCompare(units.find(u => u.unitId === b.unitId)?.schoolName ?? '', 'sv'));
  });
  const [errors, setErrors] = useState<Record<string, string>>({}), [initial] = useState(() => JSON.stringify(lines));
  const { busy, failure, run } = useSubmit(onClose);
  useUnsavedChanges(`personal-duties-dialog:${employment.id}`, JSON.stringify(lines) !== initial);
  const filled = lines.filter(l => l.percent.trim() !== '');
  const valid = filled.filter(l => !percentError(l.percent) && /^\d{4}-\d{2}-\d{2}$/u.test(l.startsOn) && (!l.endsOn || l.endsOn >= l.startsOn));
  let over: string | null = null;
  try {
    const v = capacityViolations({ percent: employment.percent, startsOn: employment.startsOn, endsOn: employment.endsOn },
      valid.map(l => ({ percent: Number(l.percent), startsOn: l.startsOn, endsOn: l.endsOn || null })));
    const sum = v.find((x): x is Extract<typeof x, { sum: number }> => 'sum' in x);
    if (sum) over = `Andelarna blir ${sum.sum} %, men tjänstgöringsgraden är ${employment.percent} %. Minska någon andel.`;
    else if (v.length) over = 'En andel gäller utanför anställningens period. Ändra datumen.';
  } catch { over = null; }
  const total = valid.reduce((n, l) => n + Number(l.percent), 0);
  const capacity = failure?.code === 'tjanst_capacity_exceeded' ? `Andelarna blir ${total} %, men tjänstgöringsgraden är ${employment.percent} %. Minska någon andel.` : null;
  const shownFailure = capacity ? null : failure;
  const sumError = over ?? capacity;
  const update = (index: number, patch: Partial<DutyLine>) => setLines(current => current.map((l, i) => i === index ? { ...l, ...patch } : l));
  function submit() {
    const next: Record<string, string> = {};
    lines.forEach((l, i) => {
      if (l.percent.trim() === '') return;
      const e = percentError(l.percent); if (e) next[`p${i}`] = 'Ange en andel mellan 1 och 100 %.';
      if (!/^\d{4}-\d{2}-\d{2}$/u.test(l.startsOn)) next[`f${i}`] = 'Ange datum.';
      if (l.endsOn && l.endsOn < l.startsOn) next[`t${i}`] = 'Slutdatum kan inte vara före startdatum.';
    });
    setErrors(next);
    if (Object.keys(next).length) return;
    void run(() => onSave(filled.map(l => ({ dutyId: l.dutyId, unitId: l.unitId, percent: Number(l.percent), startsOn: l.startsOn, endsOn: l.endsOn || null }))));
  }
  return <Shell open busy={busy} title="Fördela på skolor" description={`Anställning ${employment.percent} % · ${period(employment.startsOn, employment.endsOn)}. Lämna andelen tom för skolor där personen inte arbetar.`} onClose={onClose}>
    <Problems failure={shownFailure} summary={Object.keys(errors).length > 0} checking={checking}/>
    <form className="protected-form tjanst-form" noValidate onSubmit={e => { e.preventDefault(); submit(); }}>
      {lines.map((l, i) => {
        const name = units.find(u => u.unitId === l.unitId)?.schoolName ?? 'Skola';
        return <fieldset key={l.dutyId ?? l.unitId} className="personal-duty-line"><legend>{name}</legend>
          <Field id={`${id}-p${i}`} label={`Andel (%) på ${name}`} error={errors[`p${i}`]}><input {...described(`${id}-p${i}`, errors[`p${i}`])} {...(sumError && l.percent.trim() ? { 'aria-invalid': true, 'aria-describedby': `${id}-sum-error` } : {})}
            inputMode="numeric" value={l.percent} disabled={busy} onChange={e => update(i, { percent: e.target.value })}/></Field>
          <Field id={`${id}-f${i}`} label={`Gäller från, ${name}`} error={errors[`f${i}`]}><DatePicker {...described(`${id}-f${i}`, errors[`f${i}`])} value={l.startsOn} disabled={busy} onValueChange={v => update(i, { startsOn: v })}/></Field>
          <Field id={`${id}-t${i}`} label={`Gäller till, ${name} (valfritt)`} error={errors[`t${i}`]}><DatePicker {...described(`${id}-t${i}`, errors[`t${i}`])} value={l.endsOn} disabled={busy} onValueChange={v => update(i, { endsOn: v })}/></Field>
        </fieldset>;
      })}
      <output className="personal-sum">Fördelat: {total} av {employment.percent} %</output>
      {sumError && <small id={`${id}-sum-error`} className="field-error" role={capacity ? 'alert' : undefined}>{sumError}</small>}
      <div className="mandate-actions"><Button type="button" variant="outline" disabled={busy} onClick={onClose}>Stäng utan att spara</Button><Button type="submit" disabled={busy}>{busy ? 'Sparar…' : 'Spara andelarna'}</Button></div>
    </form>
  </Shell>;
}
