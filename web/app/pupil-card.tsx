'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, CheckCheck, History, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  groupPlacements, maskedPersonalNumber, referenceDate,
  type ChangeRequest, type HistoryEntry, type NamedOption, type PersonalNumberResult, type PupilCard as PupilCardData,
  type PupilHistory, type RegisterOptions, type SourceConflict,
} from '@/lib/pupil-register-model.ts';
import { api } from '@/lib/server-client.ts';
import MfaStepUpNotice from './mfa-step-up';
import {
  failure, fieldLabels, formatTime, originText, periodText, PupilChangeDialog, sourceName, sourceOwned, targetPlacement,
  valueText, Warning, type ChangeKind,
} from './pupil-dialogs';

const statusLabels = { aktuell: 'Aktiv', framtida: 'Kommande', avslutad: 'Avslutad' } as const;

type Props = {
  pupilId: string;
  schoolYear: number;
  caseId: string | null;
  /** Dagens datum (svensk tid) ur serverns startkontext. */
  today: string;
  /** Serverns referensurval för listans skola: namn på klasser och utbildningar. */
  options: RegisterOptions | null;
  schools: NamedOption[];
  returnTo: string;
  epoch: number;
  loadUnitOptions: (unitId: string) => Promise<RegisterOptions>;
  onBack: () => void;
  onChanged: () => void;
  onSessionLost: () => void;
};
type HistoryState = { entries: HistoryEntry[]; count: number; page: number; busy: boolean; error: string | null };
const emptyHistory: HistoryState = { entries: [], count: 0, page: 0, busy: false, error: null };
const historyError = (text: string) => (previous: HistoryState): HistoryState => ({ ...previous, busy: false, error: text });

/** Elevkortet ersätter listan i samma main. Endast fält som servern returnerar
 * visas; personnummer hämtas separat på uttrycklig begäran och finns bara här. */
export default function PupilCard(props: Props) {
  const [card, setCard] = useState<PupilCardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ text: string; retry: boolean } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [stale, setStale] = useState<string | null>(null);
  const [mfa, setMfa] = useState<'reveal' | 'change' | null>(null);
  const [personalNumber, setPersonalNumber] = useState<string | null>(null);
  const [revealing, setRevealing] = useState(false);
  const [dialog, setDialog] = useState<ChangeKind | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [history, setHistory] = useState<HistoryState>(emptyHistory);
  const [resolving, setResolving] = useState<string | null>(null);
  const [sourceError, setSourceError] = useState<{ id: string; text: string } | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const firstConflict = useRef<HTMLHeadingElement>(null);
  const generation = useRef(0);
  const historyGeneration = useRef(0);
  const focusedOnce = useRef(false);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });

  const query = useCallback((extra: Record<string, string> = {}) => {
    const q = new URLSearchParams({ pupilId: props.pupilId, schoolYear: String(props.schoolYear), ...extra });
    if (props.caseId) q.set('caseId', props.caseId);
    return q.toString();
  }, [props.pupilId, props.schoolYear, props.caseId]);

  /** Läser elevkortet. Nekad läsning, saknad elev och loggfel tömmer kortet innan
   * texten visas; bara transportfel efter en sparning behåller senast visade kort. */
  const load = useCallback(async (mode: 'initial' | 'after-save' | 'refresh'): Promise<PupilCardData | null> => {
    const current = ++generation.current;
    setLoading(true); setError(null);
    if (mode === 'initial') setCard(null);
    try {
      const loaded = await api.get<PupilCardData>(`/api/elever/elev?${query()}`);
      if (current !== generation.current) return null;
      setCard(loaded); setStale(null); setPersonalNumber(null);
      return loaded;
    } catch (caught) {
      if (current !== generation.current) return null;
      const result = failure(caught, 'read');
      if (!result) return null;
      if (result.kind === 'session') { callbacks.current.onSessionLost(); return null; }
      const transport = result.kind === 'message' && result.status === null;
      const text = result.kind === 'message' ? result.text : 'Elevkortet kunde inte hämtas. Försök igen.';
      if (transport && mode !== 'initial') {
        // Transportfel efter sparning: kortet står kvar som inaktuellt (se stale).
        if (mode === 'refresh') setError({ text, retry: false });
        return null;
      }
      setCard(null); setPersonalNumber(null);
      setError({ text, retry: transport });
      return null;
    } finally {
      if (current === generation.current) setLoading(false);
    }
  }, [query]);

  // Fokus till elevens namn när kortet första gången har renderats (efter commit,
  // inte i en animationsram som i WebKit kan köras före React-renderingen).
  useEffect(() => {
    if (card && !focusedOnce.current) { focusedOnce.current = true; heading.current?.focus(); }
  }, [card]);

  useEffect(() => {
    queueMicrotask(() => void load('initial'));
    return () => { generation.current += 1; historyGeneration.current += 1; };
  }, [load]);

  const loadHistory = useCallback(async (page: number) => {
    const current = ++historyGeneration.current;
    setHistory(previous => ({ ...(page === 1 ? emptyHistory : previous), busy: true, error: null }));
    try {
      const loaded = await api.get<PupilHistory>(`/api/elever/historik?${query({ page: String(page) })}`);
      if (current !== historyGeneration.current) return;
      setHistory(previous => ({ entries: page === 1 ? loaded.entries : [...previous.entries, ...loaded.entries], count: loaded.count, page: loaded.page, busy: false, error: null }));
    } catch (caught) {
      if (current !== historyGeneration.current) return;
      const result = failure(caught, 'read');
      if (!result) return;
      if (result.kind === 'session') { callbacks.current.onSessionLost(); return; }
      setHistory(historyError(result.kind === 'message' ? result.text : 'Ändringshistoriken kunde inte hämtas. Försök igen.'));
    }
  }, [query]);

  async function afterSave(message: string) {
    setDialog(null); setNotice(null); setMfa(null);
    callbacks.current.onChanged();
    const loaded = await load('after-save');
    // Sparat-meddelandet visas först när omläsningen visar det sparade läget.
    if (loaded) {
      setNotice(message);
      if (historyOpen) void loadHistory(1);
    } else setStale(message.replace(/\.$/u, ''));
  }

  async function reveal() {
    if (!card) return;
    setRevealing(true); setMfa(null); setError(null);
    try {
      const result = await api.post<PersonalNumberResult>('/api/elever/personnummer', { pupilId: card.id, schoolYear: props.schoolYear, caseId: props.caseId });
      if (result.pupilId === card.id) setPersonalNumber(result.personalNumber);
    } catch (caught) {
      const result = failure(caught, 'read');
      if (result?.kind === 'session') callbacks.current.onSessionLost();
      else if (result?.kind === 'mfa') setMfa('reveal');
      else if (result?.kind === 'message') setError({ text: result.text, retry: false });
    } finally { setRevealing(false); }
  }

  async function resolveSource(conflict: SourceConflict, choice: 'local' | 'source') {
    if (!card || resolving) return;
    setResolving(conflict.id); setSourceError(null); setNotice(null); setMfa(null);
    const request: ChangeRequest = { pupilId: card.id, schoolYear: props.schoolYear, caseId: props.caseId, expectedVersion: card.version, kind: 'resolve-source', payload: { conflictId: conflict.id, choice } };
    try {
      await api.post('/api/elever/andra', request);
      const label = fieldLabels[conflict.field]?.toLowerCase() ?? 'uppgiften';
      await afterSave(choice === 'local' ? `Den lokala rättelsen gäller för ${label}.` : `Källans värde gäller nu för ${label}.`);
    } catch (caught) {
      const result = failure(caught, 'change');
      if (!result) return;
      if (result.kind === 'session') callbacks.current.onSessionLost();
      else if (result.kind === 'mfa') setMfa('change');
      else if (result.kind === 'conflict') setSourceError({ id: conflict.id, text: result.details ? `Eleven har ändrats av ${result.details.changedBy} ${formatTime(result.details.changedAt)}. Inget har sparats. Hämta aktuellt läge och välj på nytt.` : 'Eleven har ändrats av någon annan. Inget har sparats. Hämta aktuellt läge och välj på nytt.' });
      else setSourceError({ id: conflict.id, text: result.text });
    } finally { setResolving(null); }
  }

  const back = <Button variant="outline" onClick={props.onBack}><ArrowLeft size={16} aria-hidden="true" />Tillbaka till elevlistan</Button>;
  if (!card) {
    return <section className="pupil-card" aria-busy={loading}>
      {back}
      {loading && <output>Hämtar elevkortet…</output>}
      {stale && <Warning>{stale}, men elevkortet kunde inte läsas om.</Warning>}
      {error && <Warning>{error.text}{error.retry && <> <Button variant="outline" onClick={() => void load('initial')}>Försök igen</Button></>}</Warning>}
    </section>;
  }

  const admin = 'municipalities' in card && Array.isArray(card.municipalities);
  const isProtected = 'protectedIdentity' in card && card.protectedIdentity === true;
  const origins = admin && card.origins ? card.origins : {};
  const conflicts = admin && card.sourceConflicts ? card.sourceConflicts : [];
  const reference = referenceDate(props.schoolYear, props.today);
  const groups = groupPlacements(card.placements, reference);
  const educations = (props.options?.educations ?? []).filter(item => item.unitId === card.unitId);
  const classes = (props.options?.classes ?? []).filter(item => item.unitId === card.unitId);
  const educationName = (id: string) => educations.find(item => item.id === id)?.name ?? (id === card.educationId ? card.educationName : 'Utbildningens namn saknas');
  const className = (id: string) => classes.find(item => item.id === id)?.name ?? (id === card.classId && card.className ? card.className : 'Klassens namn saknas');
  const canEdit = card.capabilities.canEdit && !stale && !loading;
  const placement = targetPlacement(card, props.today);
  const currentClasses = card.classes.filter(item => item.startsOn <= reference && (item.endsOn === null || item.endsOn >= reference));
  const earlierClasses = card.classes.filter(item => item.endsOn !== null && item.endsOn < reference).reverse();
  const laterClasses = card.classes.filter(item => item.startsOn > reference);
  const placementOf = (id: string) => card.placements.find(item => item.id === id);
  const origin = (key: keyof typeof origins) => origins[key] ? <small>{originText(origins[key]!)}</small> : null;
  const owned = (key: keyof typeof origins) => sourceOwned(origins[key]);
  const municipalities = admin ? card.municipalities ?? [] : [];
  const busy = loading || revealing || resolving !== null;

  return <section className="pupil-card" aria-busy={busy}>
    {back}
    <div className="admin-heading"><div>
      <p className="admin-kicker">SKYDDAD PROVMILJÖ · SYNTETISK ELEV</p>
      <h1 ref={heading} tabIndex={-1}>{card.displayName}</h1>
      <p className="pupil-badges"><Badge variant="outline" className="pupil-badge">{statusLabels[card.status]}</Badge>
        {isProtected && <Badge variant="outline" className="pupil-badge"><ShieldAlert size={16} aria-hidden="true" />Skyddade personuppgifter</Badge>}</p>
      <p className="pupil-id">Elev-ID {card.id}</p>
    </div></div>
    {isProtected && <p className="pupil-protection">Eleven har skyddade personuppgifter. Visa inte uppgifterna för andra och lämna inte ut dem utan särskild prövning. Varje visning registreras.</p>}
    {conflicts.length > 0 && <Warning>{conflicts.length === 1 ? '1 uppgift avviker från källan.' : `${conflicts.length} uppgifter avviker från källan.`} Välj vilket värde som ska gälla. <Button variant="outline" onClick={() => firstConflict.current?.focus()}>Gå till avvikelsen</Button></Warning>}
    {notice && <output className="admin-notice"><CheckCheck size={16} aria-hidden="true" />{notice}</output>}
    {stale && <Warning>{stale}, men elevkortet kunde inte uppdateras. Uppgifterna nedan kan vara inaktuella. <Button variant="outline" disabled={loading} onClick={() => void load('refresh').then(loaded => { if (loaded) setNotice('Elevkortet är uppdaterat.'); })}>{loading ? 'Hämtar…' : 'Hämta aktuellt läge'}</Button></Warning>}
    {error && <Warning>{error.text}</Warning>}
    {mfa && <MfaStepUpNotice className="pupil-warning" returnTo={props.returnTo} message={mfa === 'reveal' ? 'Att visa personnummer kräver verifiering med engångskod.' : 'Att ändra elevuppgifter kräver verifiering med engångskod.'} detail="Efter verifieringen kommer du tillbaka till elevlistan." />}
    {loading && <output>Hämtar elevkortet…</output>}

    <div className="protected-card"><h2>Basuppgifter</h2>
      <dl className="mandate-facts">
        <div><dt>Namn</dt><dd>{card.displayName}</dd>{origin('displayName')}{owned('displayName') && <small>Uppgiften ägs av {sourceName(origins.displayName!)}. Rätta den där; ändringen syns här efter nästa leverans.</small>}</div>
        {'birthDate' in card && card.birthDate && <div><dt>Födelsedatum</dt><dd className="pupil-number">{card.birthDate}</dd></div>}
        {'birthDate' in card && card.birthDate && card.capabilities.canRevealPersonalNumber && <div><dt>Personnummer</dt>
          <dd className="pupil-number">{personalNumber ?? <>{maskedPersonalNumber(card.birthDate).replace('-••••', '-')}<span aria-hidden="true">••••</span><span className="sr-only">de fyra sista siffrorna är dolda</span></>}</dd>
          <Button variant="outline" disabled={busy} onClick={() => personalNumber ? setPersonalNumber(null) : void reveal()}>{revealing ? 'Hämtar…' : personalNumber ? 'Dölj personnummer' : 'Visa personnummer'}</Button>
          <small>Visningen registreras i säkerhetsloggen.</small>{origin('personalNumber')}</div>}
        {admin && <div><dt>Hemkommun</dt><dd>{'municipalityCode' in card && card.municipalityCode ? `Kommunkod ${card.municipalityCode}` : 'Uppgift saknas'}</dd>{origin('municipality')}</div>}
        <div><dt>Skola</dt><dd>{card.unitName}</dd></div>
        <div><dt>Klass</dt><dd>{card.className ?? 'Ingen klass'}</dd></div>
        <div><dt>Utbildning</dt><dd>{card.educationName}</dd></div>
        <div><dt>Årskurs</dt><dd>{card.grade === null ? 'Uppgift saknas' : `åk ${card.grade}`}</dd></div>
        <div><dt>Elev-ID</dt><dd className="pupil-number">{card.id}</dd><small>Elevens ID i registret. Det ändras inte vid namnbyte, skolbyte eller nytt inloggningskonto.</small></div>
      </dl>
      {admin && municipalities.length > 0 && <><h3>Hemkommun över tid</h3><ul className="pupil-rows">{[...municipalities].reverse().map(item => <li key={item.id} className="protected-assignment"><span>Kommunkod {item.municipalityCode}</span><small>{periodText(item.startsOn, item.endsOn)}</small></li>)}</ul></>}
      {canEdit && <div className="mandate-actions">
        {(!owned('displayName') || !owned('personalNumber')) && <Button variant="outline" onClick={() => setDialog('basics')}>Ändra basuppgifter</Button>}
        {admin && <Button variant="outline" onClick={() => setDialog('municipality')}>Registrera ny hemkommun</Button>}
      </div>}
    </div>

    {conflicts.map((conflict, index) => {
      const label = fieldLabels[conflict.field] ?? 'Uppgift';
      const local = origins[conflict.field];
      return <div key={conflict.id} className="protected-card pupil-conflict">
        <h2 ref={index === 0 ? firstConflict : undefined} tabIndex={-1}>Avvikelse från källan: {label}</h2>
        {conflict.field === 'personalNumber'
          ? <><p>Lokal rättelse: personnumret i registret{local ? ` (${formatTime(local.changedAt)})` : ''}</p><p>Simulerad källa (syntetisk): ett annat personnummer (levererad {formatTime(conflict.origin.changedAt)})</p></>
          : <><p>Lokal rättelse: {valueText(conflict.local)}{local ? ` (${formatTime(local.changedAt)})` : ''}</p><p>Simulerad källa (syntetisk): {valueText(conflict.incoming)} (levererad {formatTime(conflict.origin.changedAt)})</p></>}
        <p>Den lokala rättelsen gäller tills du väljer. Källans värde skriver inte över den.</p>
        {sourceError?.id === conflict.id && <Warning>{sourceError.text} <Button variant="outline" disabled={loading} onClick={() => { setSourceError(null); void load('refresh'); }}>Hämta aktuellt läge</Button></Warning>}
        {canEdit && <div className="mandate-actions">
          <Button variant="outline" disabled={busy} onClick={() => void resolveSource(conflict, 'local')}>{resolving === conflict.id ? 'Sparar…' : 'Behåll lokal rättelse'}</Button>
          <Button variant="outline" disabled={busy} onClick={() => void resolveSource(conflict, 'source')}>Använd källans värde</Button>
        </div>}
      </div>;
    })}

    {(admin || card.placements.length > 0) && <div className="protected-card"><h2>Skolplacering</h2>
      {(['aktuell', 'framtida', 'avslutad'] as const).map(status => <div key={status}>
        <h3>{status === 'aktuell' ? 'Aktuell' : status === 'framtida' ? 'Framtida' : 'Avslutade'}</h3>
        {groups[status].length === 0 ? <p>{status === 'aktuell' ? 'Ingen aktuell placering.' : status === 'framtida' ? 'Inga framtida placeringar.' : 'Inga avslutade placeringar.'}</p>
          : <ul className="pupil-rows">{groups[status].map(item => <li key={item.id} className="protected-assignment"><span>{card.unitName} · {educationName(item.educationId)}</span><small>{periodText(item.startsOn, item.endsOn)}</small></li>)}</ul>}
      </div>)}
      {canEdit && placement && <div className="mandate-actions">
        {props.schools.length > 1 && <Button variant="outline" onClick={() => setDialog('transfer')}>Registrera skolbyte</Button>}
        <Button variant="outline" onClick={() => setDialog('education')}>Byt utbildning</Button>
        <Button variant="outline" onClick={() => setDialog('end-placement')}>Avsluta placering</Button>
      </div>}
    </div>}

    {(admin || card.classes.length > 0) && <div className="protected-card"><h2>Klasstillhörighet</h2>
      {currentClasses.length === 0 ? <p>Eleven har ingen klass just nu.</p> : <ul className="pupil-rows">{currentClasses.map(item => <li key={item.id} className="protected-assignment"><span>{className(item.classId)} · från {item.startsOn}</span></li>)}</ul>}
      {laterClasses.length > 0 && <><h3>Kommande klasser</h3><ul className="pupil-rows">{laterClasses.map(item => <li key={item.id} className="protected-assignment"><span>{className(item.classId)} · {educationName(placementOf(item.placementId)?.educationId ?? '')}</span><small>{periodText(item.startsOn, item.endsOn)}</small></li>)}</ul></>}
      <h3>Tidigare klasser</h3>
      {earlierClasses.length === 0 ? <p>Inga tidigare klasser.</p> : <ul className="pupil-rows">{earlierClasses.map(item => <li key={item.id} className="protected-assignment"><span>{className(item.classId)} · {educationName(placementOf(item.placementId)?.educationId ?? '')}</span><small>{periodText(item.startsOn, item.endsOn)}</small></li>)}</ul>}
      {canEdit && placement && <div className="mandate-actions"><Button variant="outline" onClick={() => setDialog('class')}>Byt klass</Button></div>}
    </div>}

    {card.capabilities.canReadHistory && <div className="protected-card"><h2>Historik</h2>
      <Collapsible open={historyOpen} onOpenChange={open => { setHistoryOpen(open); if (open) void loadHistory(1); else { historyGeneration.current += 1; setHistory(emptyHistory); } }}>
        <CollapsibleTrigger render={<Button variant="outline" />}><History size={16} aria-hidden="true" />{historyOpen ? 'Dölj ändringshistorik' : 'Visa ändringshistorik'}</CollapsibleTrigger>
        <CollapsibleContent>
          <div aria-busy={history.busy}>
            {history.error && <Warning>{history.error}</Warning>}
            {history.busy && history.entries.length === 0 && <output>Hämtar ändringshistorik…</output>}
            {!history.busy && !history.error && history.page > 0 && history.entries.length === 0 && <p>Inga ändringar ännu.</p>}
            {history.entries.length > 0 && <ol className="pupil-history">{history.entries.map(entry => <li key={entry.id}>
              <span>{fieldLabels[entry.field] ?? 'Uppgift'}: {entry.field === 'personalNumber' ? 'ändrat (numret visas inte här)' : `${valueText(entry.before)} → ${valueText(entry.after)}`}</span>
              <small>{formatTime(entry.changedAt)} · Källa: {sourceName(entry.origin)}{entry.resolution === 'local' ? ' · lokal rättelse behölls' : entry.resolution === 'source' ? " · källans värde valdes" : ''}</small>
            </li>)}</ol>}
            {history.entries.length < history.count && <Button variant="outline" disabled={history.busy} onClick={() => void loadHistory(history.page + 1)}>{history.busy ? 'Hämtar…' : 'Visa fler ändringar'}</Button>}
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>}

    {dialog && <PupilChangeDialog key={dialog} kind={dialog} card={card} schoolYear={props.schoolYear} caseId={props.caseId} today={props.today}
      options={props.options} schools={props.schools} returnTo={props.returnTo} epoch={props.epoch}
      refresh={() => load('refresh')} loadUnitOptions={props.loadUnitOptions}
      onClose={reload => { setDialog(null); if (reload) void load('refresh'); }}
      onSaved={message => void afterSave(message)} onSessionLost={props.onSessionLost} />}
  </section>;
}
