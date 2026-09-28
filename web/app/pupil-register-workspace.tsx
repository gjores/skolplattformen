'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { FUNCTION_LABEL } from '@/lib/access-rules.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { schoolYearLabel, selectionFromQuery, selectionToQuery, type PupilList, type PupilListItem, type RegisterOptions, type Selection } from '@/lib/pupil-register-model.ts';
import type { ActiveContext } from './context-switch';
import PupilCard from './pupil-card';
import { PupilExportDialog, stockholmToday } from './pupil-dialogs';
import type { RegisterSetup } from './school-year-picker';

const fallbackText = 'Urvalet i adressen gäller inte ditt uppdrag. Listan visar läsåret för din första skola.';
const statusLabels = { aktuell: 'Aktiv', framtida: 'Kommande', avslutad: 'Avslutad' };
export function clearRegisterLocation(preserveAuthentication = false) {
  const retained = new URLSearchParams();
  if (preserveAuthentication) {
    const current = new URLSearchParams(window.location.search);
    if (current.get('till') === '/inbjudan') retained.set('till', '/inbjudan');
    if (current.get('inloggning') === 'nekad') {
      retained.set('inloggning', 'nekad');
      const code = current.get('kod');
      if (code) retained.set('kod', code);
    }
  }
  const query = retained.toString();
  window.history.replaceState(null, '', window.location.pathname + (query ? `?${query}` : ''));
  for (const kind of ['sessionStorage', 'localStorage'] as const) {
    try { const storage = window[kind]; for (const key of Object.keys(storage)) if (key.startsWith('sp_elevsok')) storage.removeItem(key); } catch { /* Storage kan vara avstängd. */ }
  }
}
function defaultSelection(setup: RegisterSetup, year: number): Selection {
  return { schoolYear: year, unitId: setup.scope.schools[0]?.id ?? '', classId: null, educationId: null, grade: null, status: null, page: 1 };
}
function readSelection(setup: RegisterSetup, year: number): Selection | null {
  const parsed = selectionFromQuery(window.location.search, defaultSelection(setup, year));
  return parsed && setup.schoolYears.includes(parsed.schoolYear) && setup.scope.schools.some(school => school.id === parsed.unitId) ? parsed : null;
}
function allowed(selection: Selection, result: PupilList) {
  return (selection.classId === null || result.options.classes.some(item => item.id === selection.classId && item.unitId === selection.unitId)) &&
    (selection.educationId === null || result.options.educations.some(item => item.id === selection.educationId && item.unitId === selection.unitId)) &&
    (selection.grade === null || result.options.grades.includes(selection.grade)) &&
    (selection.status === null || result.options.statuses.includes(selection.status));
}

type Props = { context: ActiveContext; epoch: number; setup: RegisterSetup; schoolYear: number; onSchoolYear: (year: number) => void; onSessionLost: () => void;
  onOpenPupil?: (id: string | null, selection: Selection, caseId: string | null) => void };

/** Endast serverns projektion och filteralternativ; fritext och elevval finns bara i minnet. */
export default function PupilRegisterWorkspace(props: Props) {
  const [selection, setSelection] = useState<Selection>(() => readSelection(props.setup, props.schoolYear) ?? defaultSelection(props.setup, props.schoolYear));
  const [list, setList] = useState<PupilList | null>(null);
  const [draft, setDraft] = useState('');
  const [search, setSearch] = useState('');
  const [caseId, setCaseId] = useState<string | null>(null);
  const [draftCaseId, setDraftCaseId] = useState('');
  const caseRef = useRef<string | null>(null);
  const [marked, setMarked] = useState<string[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(() => readSelection(props.setup, props.schoolYear) ? null : fallbackText);
  const [revision, setRevision] = useState(0);
  const controller = useRef<AbortController | null>(null);
  const callbacks = useRef(props);
  const selectedPupil = useRef<string | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusResults = useRef(false);
  const lastSuccess = useRef<{ selection: Selection; list: PupilList } | null>(null);
  const rollback = useRef(false);
  // Öppet elevkort finns bara i minnet; adressen innehåller aldrig elev-ID.
  const [openPupil, setOpenPupil] = useState<string | null>(null);
  const nameButtons = useRef(new Map<string, HTMLButtonElement>());
  const returnFocus = useRef<string | null>(null);
  const changedInCard = useRef(false);
  const [exporting, setExporting] = useState(false);
  const selectionRef = useRef(selection);
  useEffect(() => { callbacks.current = props; });

  const move = useCallback((next: Selection, mode: 'push' | 'replace' = 'push') => {
    controller.current?.abort(); setList(null); setBusy(true); setError(null); setMarked([]);
    selectedPupil.current = null; setOpenPupil(null); returnFocus.current = null; setExporting(false);
    callbacks.current.onOpenPupil?.(null, next, null);
    window.history[mode === 'push' ? 'pushState' : 'replaceState'](null, '', selectionToQuery(next));
    setSelection(next); callbacks.current.onSchoolYear(next.schoolYear); focusResults.current = true;
  }, []);

  useEffect(() => {
    const initial = readSelection(callbacks.current.setup, callbacks.current.schoolYear) ?? defaultSelection(callbacks.current.setup, callbacks.current.schoolYear);
    window.history.replaceState(null, '', selectionToQuery(initial));
    callbacks.current.onSchoolYear(initial.schoolYear);
    const pop = () => {
      const next = readSelection(callbacks.current.setup, callbacks.current.schoolYear);
      if (!next) setNotice(fallbackText);
      const safe = next ?? defaultSelection(callbacks.current.setup, callbacks.current.schoolYear);
      // Historiken innehåller endast öppetläge. Elev-ID och sökord återställs aldrig från history.state.
      if (window.history.state?.pupilCard === true && selectedPupil.current) {
        setOpenPupil(selectedPupil.current);
        callbacks.current.onOpenPupil?.(selectedPupil.current, safe, caseRef.current);
      } else if (selectedPupil.current && next && JSON.stringify(next) === JSON.stringify(selectionRef.current)) {
        // Bakåt från elevkortet: samma lista, sida och fokus på elevens namnknapp.
        returnFocus.current = selectedPupil.current;
        setOpenPupil(null);
        callbacks.current.onOpenPupil?.(null, safe, caseRef.current);
        if (changedInCard.current) { changedInCard.current = false; setRevision(n => n + 1); }
      } else {
        callbacks.current.onOpenPupil?.(null, safe, caseRef.current);
        setOpenPupil(null); selectedPupil.current = null;
        setMarked([]); setSelection(safe); callbacks.current.onSchoolYear(safe.schoolYear);
        focusResults.current = true;
      }
      if (!next) window.history.replaceState(null, '', selectionToQuery(safe));
    };
    window.addEventListener('popstate', pop);
    return () => { controller.current?.abort(); selectedPupil.current = null; window.removeEventListener('popstate', pop); };
    // Varje epoch/uppdrag får en ny komponent. URL läses en gång vid montering.
  }, []);

  useEffect(() => { selectionRef.current = selection; }, [selection]);
  useEffect(() => {
    if (openPupil !== null || busy || !list || !returnFocus.current) return;
    const id = returnFocus.current; returnFocus.current = null;
    // Tabell på dator, kortlista på telefon: fokus till den synliga namnknappen.
    requestAnimationFrame(() => ([nameButtons.current.get(id), nameButtons.current.get(`${id}-card`)].find(element => element && element.offsetParent !== null) ?? resultHeading.current)?.focus());
  }, [openPupil, busy, list]);

  useEffect(() => {
    if (props.schoolYear !== selection.schoolYear) queueMicrotask(() => move({ ...selection, schoolYear: props.schoolYear, page: 1 }));
  }, [props.schoolYear, selection, move]);

  useEffect(() => {
    if (rollback.current) { rollback.current = false; return; }
    const abort = new AbortController(); controller.current?.abort(); controller.current = abort;
    const run = async () => {
      setBusy(true); setError(null); setList(null);
      if (props.setup.scope.cases.length > 0 && !caseId) { setBusy(false); return; }
      try {
        const result = await api.post<PupilList>('/api/elever/lista', { selection, search, caseId }, abort.signal);
        if (abort.signal.aborted) return;
        if (!allowed(selection, result)) {
          setNotice(fallbackText); move(defaultSelection(props.setup, selection.schoolYear), 'replace'); return;
        }
        lastSuccess.current = { selection, list: result };
        setList(result);
        if (focusResults.current) { focusResults.current = false; requestAnimationFrame(() => resultHeading.current?.focus()); }
      } catch (caught) {
        if (abort.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
        if (caught instanceof ApiError && caught.status === 401) { callbacks.current.onSessionLost(); return; }
        const defaults = defaultSelection(props.setup, selection.schoolYear);
        if (caught instanceof ApiError && [400, 404].includes(caught.status) && JSON.stringify(defaults) !== JSON.stringify(selection)) {
          setNotice(fallbackText); move(defaults, 'replace'); return;
        }
        const message = caught instanceof ApiError
          ? caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.'
          : caught.status === 403 ? 'Ditt aktuella uppdrag tillåter inte att läsa elever. Uppdraget kan ha upphört.'
          : caught.status === 400 ? 'Sökningen godtogs inte. Kontrollera uppgifterna och försök igen.'
          : 'Eleverna kunde inte hämtas. Försök igen.'
          : 'Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.';
        setError(message); setMarked([]);
        // Behåll senast hämtade läsår enbart vid transportfel, aldrig vid nekat mandat/loggfel.
        if (!(caught instanceof ApiError) && lastSuccess.current && lastSuccess.current.selection.schoolYear !== selection.schoolYear) {
          const previous = lastSuccess.current; rollback.current = true;
          setSelection(previous.selection); callbacks.current.onSchoolYear(previous.selection.schoolYear); setList(previous.list);
          window.history.replaceState(null, '', selectionToQuery(previous.selection));
        }
      } finally { if (!abort.signal.aborted) setBusy(false); }
    };
    void run();
    return () => abort.abort();
  }, [selection, search, caseId, revision, props.setup, move]);

  const filter = (patch: Partial<Selection>) => { if (marked.length) setNotice('Markeringen har rensats eftersom urvalet ändrades.'); move({ ...selection, ...patch, page: 1 }); };
  const submitSearch = (value: string) => { setSearch(value); setDraft(value); setMarked([]); move({ ...selection, page: 1 }); setRevision(n => n + 1); };
  const hasFilters = selection.classId !== null || selection.educationId !== null || selection.grade !== null || selection.status !== null;
  const pages = Math.max(1, Math.ceil((list?.count ?? 0) / 50));
  const distinguish = (pupil: PupilListItem) => `${'birthDate' in pupil ? `Född ${pupil.birthDate} · ` : ''}${pupil.className ?? 'Ingen klass'} · ${pupil.unitName}`;
  const openCard = (pupil: PupilListItem) => {
    selectedPupil.current = pupil.id; changedInCard.current = false;
    window.history.pushState({ pupilCard: true }, '', window.location.href);
    setOpenPupil(pupil.id);
    props.onOpenPupil?.(pupil.id, selection, caseId);
  };
  const buttonRef = (id: string) => (element: HTMLButtonElement | null) => { if (element) nameButtons.current.set(id, element); else nameButtons.current.delete(id); };
  const name = (pupil: PupilListItem, layout: 'table' | 'card') => <><span className="pupil-name"><button type="button" ref={layout === 'table' ? buttonRef(pupil.id) : buttonRef(`${pupil.id}-card`)} aria-label={`${pupil.displayName}, öppna elevkortet`} onClick={() => openCard(pupil)}>{pupil.displayName}</button></span><small>{distinguish(pupil)}</small></>;
  const mark = (pupil: PupilListItem) => pupil.capabilities.canExport && <label className="pupil-mark"><input type="checkbox" aria-label={`Markera ${pupil.displayName}`} checked={marked.includes(pupil.id)} onChange={event => setMarked(ids => event.target.checked ? [...ids, pupil.id] : ids.filter(id => id !== pupil.id))} /><span className="sr-only">Markera {pupil.displayName}</span></label>;
  const options = list?.options;
  const returnTo = `/${selectionToQuery(selection)}`;
  const loadUnitOptions = async (unitId: string): Promise<RegisterOptions> => {
    // Referensurvalet (skolans utbildningar och klasser) följer med serverns listsvar.
    // Elevraderna används inte och sparas inte.
    const result = await api.post<PupilList>('/api/elever/lista', { selection: { schoolYear: selection.schoolYear, unitId, classId: null, educationId: null, grade: null, status: null, page: 1 }, search: '', caseId: null });
    return result.options;
  };

  if (openPupil) {
    return <div className="admin-workspace protected-admin pupil-register">
      <PupilCard key={`${openPupil}-${selection.schoolYear}`} pupilId={openPupil} schoolYear={selection.schoolYear} caseId={caseId}
        today={stockholmToday(props.setup.serverNow)} options={list?.options ?? null}
        schools={props.setup.scope.schools} returnTo={returnTo} epoch={props.epoch} loadUnitOptions={loadUnitOptions}
        onBack={() => { if (window.history.state?.pupilCard === true) window.history.back(); else { returnFocus.current = openPupil; setOpenPupil(null); } }}
        onChanged={() => { changedInCard.current = true; }} onSessionLost={props.onSessionLost} />
    </div>;
  }

  return <div className="admin-workspace protected-admin pupil-register" aria-busy={busy}>
    <div className="admin-heading"><div><p className="admin-kicker">SKYDDAD PROVMILJÖ · SYNTETISKA UPPGIFTER</p><h1>Elever</h1><p>{props.context.customerName} · {props.context.label}</p></div></div>
    <p>Elever som ditt aktuella uppdrag får se och som är placerade under valt läsår. Varje läsning, ändring och export registreras i säkerhetsloggen.</p>
    <dl className="mandate-facts"><div><dt>Uppdrag</dt><dd>{FUNCTION_LABEL[props.context.function]}</dd></div><div><dt>Omfattning</dt><dd>{props.setup.scope.schools.map(school => school.name).join(', ')}</dd></div>
      {props.setup.scope.groups.length > 0 && <div><dt>Tilldelade grupper</dt><dd>{props.setup.scope.groups.map(group => group.name).join(', ')}</dd></div>}
      {props.setup.approverName && <div><dt>Godkänt av</dt><dd>{props.setup.approverName}</dd></div>}
      {props.setup.purposeCode && <div><dt>Syfte</dt><dd>{props.setup.purposeCode === 'synthetic-troubleshooting' ? 'Syntetisk felsökning' : props.setup.purposeCode}</dd></div>}
      {props.setup.endsAt && <div><dt>Upphör</dt><dd><time dateTime={props.setup.endsAt}>{new Date(props.setup.endsAt).toLocaleString('sv-SE')}</time></dd></div>}
    </dl>
    {notice && <output className="admin-notice">{notice}</output>}
    {error && <output role="alert" className="validation-warning">{error}</output>}
    {props.setup.scope.cases.length > 0 ? <form className="protected-filter" onSubmit={event => { event.preventDefault(); const selectedCase = props.setup.scope.cases.find(item => item.id === draftCaseId); if (!selectedCase) return; setCaseId(selectedCase.id); caseRef.current = selectedCase.id; move({ ...selection, unitId: selectedCase.unitId, page: 1 }); setRevision(n => n + 1); }}><label>Tilldelat ärende<select value={draftCaseId} onChange={event => setDraftCaseId(event.target.value)}><option value="">Välj ärende</option>{props.setup.scope.cases.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><Button type="submit" disabled={busy || !draftCaseId}>Visa ärendets elev</Button></form> : <form className="protected-filter" onSubmit={event => { event.preventDefault(); submitSearch(draft); }}>
      {props.setup.scope.schools.length > 1 && <label>Skola<select value={selection.unitId} disabled={busy} onChange={event => filter({ unitId: event.target.value, classId: null, educationId: null, grade: null, status: null })}>{props.setup.scope.schools.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>}
      <div className="pupil-search-field"><label htmlFor="pupil-search">Sökord</label><input id="pupil-search" type="text" autoComplete="off" spellCheck={false} maxLength={200} value={draft} onChange={event => setDraft(event.target.value)} aria-describedby="pupil-search-help" /><small id="pupil-search-help">{props.context.function === 'administrator' ? 'Namn, födelsedatum (ÅÅÅÅMMDD) eller personnummer.' : 'Namn.'}</small></div>
      <label>Klass<select value={selection.classId ?? ''} disabled={busy} onChange={event => filter({ classId: event.target.value || null })}><option value="">Alla klasser</option>{options?.classes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Utbildning<select value={selection.educationId ?? ''} disabled={busy} onChange={event => filter({ educationId: event.target.value || null })}><option value="">Alla utbildningar</option>{options?.educations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Årskurs<select value={selection.grade ?? ''} disabled={busy} onChange={event => filter({ grade: event.target.value === '' ? null : Number(event.target.value) })}><option value="">Alla årskurser</option>{options?.grades.map(grade => <option key={grade} value={grade}>{grade}</option>)}</select></label>
      <label>Status<select value={selection.status ?? ''} disabled={busy} onChange={event => filter({ status: event.target.value as Selection['status'] || null })}><option value="">Alla statusar</option>{options?.statuses.map(status => <option key={status} value={status}>{statusLabels[status]}</option>)}</select></label>
      <div className="mandate-actions"><Button type="submit" disabled={busy}>Sök elever</Button>{search && <Button variant="outline" onClick={() => submitSearch('')}>Rensa sökningen</Button>}{hasFilters && <Button variant="outline" onClick={() => filter({ classId: null, educationId: null, grade: null, status: null })}>Rensa filter</Button>}</div>
    </form>}
    <div className="mandate-actions"><Button variant="outline" disabled={busy} onClick={() => setRevision(n => n + 1)}>{error ? 'Försök igen' : 'Hämta aktuellt läge'}</Button>{list?.capabilities.canExport && list.count > 0 && <Button variant="outline" disabled={busy} onClick={() => { setNotice(null); setExporting(true); }}><Download size={16} aria-hidden="true" />Exportera urval…</Button>}{marked.length > 0 && <><output>{marked.length} elever markerade</output><Button variant="outline" onClick={() => setMarked([])}>Avmarkera alla</Button></>}</div>
    <section aria-label="Elevlista"><h2 ref={resultHeading} tabIndex={-1}>Elever läsåret {schoolYearLabel(selection.schoolYear)}</h2>
      {busy && <output>Hämtar elever…</output>}
      {!busy && !caseId && props.setup.scope.cases.length > 0 && <p>Välj ett tilldelat ärende för att se den elev ärendet gäller.</p>}
      {list && <><output>{list.count} {list.count === 1 ? 'elev' : 'elever'} · sida {list.page} av {pages}</output>
        {list.pupils.length === 0 ? <div className="admin-empty"><h3>{search || hasFilters ? 'Inga elever matchar urvalet' : `Inga elever läsåret ${schoolYearLabel(selection.schoolYear)}`}</h3><p>{search || hasFilters ? 'Kontrollera stavningen eller rensa sökningen och filtren.' : 'Ingen elev i ditt uppdrag är placerad under det här läsåret. Välj ett annat läsår i sidhuvudet.'}</p></div> : <>
          <table className="pupil-register-table"><caption className="sr-only">Elever läsåret {schoolYearLabel(selection.schoolYear)}</caption><thead><tr>{list.capabilities.canExport && <th scope="col"><span className="sr-only">Markera</span></th>}{['Elev', 'Klass', 'Utbildning', 'Åk', 'Status'].map(label => <th scope="col" key={label}>{label}</th>)}</tr></thead><tbody>{list.pupils.map(pupil => <tr key={pupil.id}>{list.capabilities.canExport && <td>{mark(pupil)}</td>}<td>{name(pupil, 'table')}</td><td>{pupil.className ?? 'Ingen klass'}</td><td>{pupil.educationName}</td><td>{pupil.grade ?? 'Uppgift saknas'}</td><td>{statusLabels[pupil.status]}</td></tr>)}</tbody></table>
          <ul className="pupil-register-cards">{list.pupils.map(pupil => <li className="protected-card" key={pupil.id}>{list.capabilities.canExport && mark(pupil)}{name(pupil, 'card')}<p>{pupil.className ?? 'Ingen klass'} · {pupil.educationName} · {pupil.grade === null ? 'Uppgift saknas' : `åk ${pupil.grade}`}</p><span>{statusLabels[pupil.status]}</span></li>)}</ul>
        </>}
        <nav className="mandate-actions" aria-label="Elevlistans sidor"><Button variant="outline" disabled={busy || list.page <= 1} onClick={() => move({ ...selection, page: list.page - 1 })}>Föregående sida</Button><span>Sida {list.page} av {pages}</span><Button variant="outline" disabled={busy || list.page >= pages} onClick={() => move({ ...selection, page: list.page + 1 })}>Nästa sida</Button></nav>
      </>}
    </section>
    {exporting && list && <PupilExportDialog schoolYear={selection.schoolYear} caseId={caseId} selection={selection} search={search} marked={marked}
      total={list.count} canReadProtected={list.capabilities.canReadProtected} returnTo={returnTo}
      onClose={() => setExporting(false)} onDone={message => { setExporting(false); setNotice(message); }} onSessionLost={props.onSessionLost} />}
  </div>;
}
