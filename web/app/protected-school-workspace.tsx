'use client';

import { useEffect, useEffectEvent, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { messageText } from '@/lib/session-channel.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import { parseSchoolRegistryList, parseSchoolRegistryLookupResult, parseSchoolRegistryStatus,
  type SchoolRegistryList, type SchoolRegistryLookup, type SchoolRegistryLookupResult,
  type SchoolRegistryCommand, type SchoolRegistrySaved, type LocalRegistrySchool } from '@/lib/school-registry.ts';
import type { ActiveContext } from './context-switch';
import './protected-school-workspace.css';

type Props = { context: ActiveContext; epoch: number; onMfaRequired: () => void; onSessionLost: () => void };
type Detail = Extract<SchoolRegistryLookupResult, { kind: 'code' }>;
type SaveState = 'idle' | 'saving' | 'unknown' | 'checking' | 'retry' | 'saved';
const schoolTypes: Record<string,string> = { GR: 'Grundskola', GY: 'Gymnasieskola', FKLASS: 'Förskoleklass', FTH: 'Fritidshem', ANGR: 'Anpassad grundskola', ANGY: 'Anpassad gymnasieskola' };
const typesText = (types: string[]) => types.map(type => schoolTypes[type] ?? type).join(', ') || 'Uppgift saknas';
function addressText(address: LocalRegistrySchool['address']) { return address ? [address.street, [address.postalCode, address.locality].filter(Boolean).join(' ')].filter(Boolean).join(', ') || 'Uppgift saknas' : 'Uppgift saknas'; }
function errorText(error: unknown) {
  if (error instanceof ApiError) {
    const custom: Record<string,string> = {
      conflict: 'Skolans uppgifter eller registerunderlaget har ändrats. Hämta ett nytt underlag och granska igen.',
      registry_unavailable: 'Skolenhetsregistret kunde inte nås. Försök igen om en stund.',
      not_found: 'Ingen tillgänglig skolenhet hittades för sökningen.',
      forbidden: 'Ditt aktuella uppdrag tillåter inte denna åtgärd eller skolan hör till en annan huvudman.',
    };
    return `${custom[error.code] ?? messageText(error.code)}${error.correlationId ? ` (ref ${error.correlationId})` : ''}`;
  }
  return 'Uppgifterna kunde inte hämtas eller kontrolleras. Försök igen.';
}

export default function ProtectedSchoolWorkspace({ context, epoch, onMfaRequired, onSessionLost }: Props) {
  const [list, setList] = useState<SchoolRegistryList | null>(null);
  const [loading, setLoading] = useState(true);
  const [kind, setKind] = useState<SchoolRegistryLookup['kind']>('code');
  const [value, setValue] = useState('');
  const [result, setResult] = useState<SchoolRegistryLookupResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [command, setCommand] = useState<SchoolRegistryCommand | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [stale, setStale] = useState(false);
  const [saved, setSaved] = useState<SchoolRegistrySaved | null>(null);
  const generation = useRef(0), searchNumber = useRef(0), inFlight = useRef(false);
  const detailHeading = useRef<HTMLHeadingElement>(null);
  const detail: Detail | null = result?.kind === 'code' ? result : null;
  const blocked = ['saving', 'unknown', 'checking', 'saved'].includes(saveState);
  useUnsavedChanges(`navigation-block:schools-${epoch}-${context.assignmentId}`, blocked);

  function handleError(caught: unknown) {
    if (caught instanceof ApiError && caught.code === 'mfa_required') onMfaRequired();
    if (caught instanceof ApiError && (caught.status === 401 || ['membership_blocked', 'assignment_ended', 'assignment_expired', 'context_changed'].includes(caught.code))) onSessionLost();
    setError(errorText(caught));
  }
  async function loadList(version = generation.current, required?: SchoolRegistrySaved) {
    setLoading(true);
    try {
      const next = parseSchoolRegistryList(await api.get<unknown>('/api/skolor'));
      if (required && !next.units.some(unit => unit.id === required.unitId && unit.code === required.code)) throw new TypeError('Saved school missing from current list');
      if (version !== generation.current) return false;
      setList(next); return true;
    } catch (caught) { if (version === generation.current) handleError(caught); return false; }
    finally { if (version === generation.current) setLoading(false); }
  }
  const initialize = useEffectEvent((version: number) => { void loadList(version); });
  useEffect(() => {
    const version = ++generation.current;
    queueMicrotask(() => { if (version === generation.current) initialize(version); });
    return () => { generation.current = version + 1; };
  }, []);
  useEffect(() => { if (detail) detailHeading.current?.focus(); }, [detail]);

  async function lookup(request: SchoolRegistryLookup) {
    if (blocked || inFlight.current) return;
    const version = generation.current, search = ++searchNumber.current;
    setSearching(true); setResult(null); setError(null); setNotice(null); setStale(false); setCommand(null); setSaveState('idle');
    try {
      const next = parseSchoolRegistryLookupResult(await api.post<unknown>('/api/skolor/register', request), request);
      if (version !== generation.current || search !== searchNumber.current) return;
      if (next.kind === 'code' && next.unit.organizationNumber !== list?.organizer.organizationNumber) throw new TypeError('Wrong registry organizer');
      setResult(next);
    } catch (caught) { if (version === generation.current && search === searchNumber.current) handleError(caught); }
    finally { if (version === generation.current && search === searchNumber.current) setSearching(false); }
  }
  function invalidateSearch() { searchNumber.current++; setSearching(false); setResult(null); setError(null); setStale(false); setCommand(null); setSaveState('idle'); }
  function search(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalized = kind === 'organizationNumber' ? value.replace(/[\s-]/gu, '') : value.trim();
    if (!(kind === 'code' ? /^\d{8}$/u : /^\d{10}$/u).test(normalized)) { setError(kind === 'code' ? 'Ange en skolenhetskod med åtta siffror.' : 'Ange huvudmannens organisationsnummer med tio siffror.'); return; }
    if (kind === 'organizationNumber' && normalized !== list?.organizer.organizationNumber) { setError('Sök med organisationsnumret för din aktuella huvudman.'); return; }
    void lookup({ kind, value: normalized });
  }
  async function finishSaved(receipt: SchoolRegistrySaved, version: number) {
    setSaved(receipt); setSaveState('saved'); setNotice('Sparandet är bekräftat. Läser skolans aktuella uppgifter…'); setResult(null);
    if (await loadList(version, receipt)) {
      if (version !== generation.current) return;
      setSaveState('idle'); setCommand(null); setSaved(null); setValue('');
      setNotice(receipt.operation === 'import' ? 'Skolenheten är tillagd. Importen ger inga nya uppdrag. Tillgång till planering och rektorsuppdrag hanteras separat via Mandat.' : 'Registeruppgifterna är uppdaterade. Lokalt tillsatt rektor, årskurser och uppdrag är bevarade.');
    } else if (version === generation.current) setNotice('Sparandet är bekräftat, men listan kunde inte läsas. Läs om listan för att fortsätta.');
  }
  async function save(request?: SchoolRegistryCommand) {
    if (inFlight.current || blocked || (!request && (!detail || stale || (detail.local && !detail.local.canUpdate)))) return;
    const input = request ?? { commandId: crypto.randomUUID(), code: detail!.unit.code, operation: detail!.local ? 'update' : 'import', expectedRevision: detail!.local?.revision ?? null, registryFingerprint: detail!.unit.registryFingerprint } satisfies SchoolRegistryCommand;
    const version = generation.current; inFlight.current = true;
    setCommand(input); setSaveState('saving'); setError(null); setNotice(null);
    try {
      const receipt = parseSchoolRegistryStatus(await api.post<unknown>('/api/skolor/register/spara', input), input);
      if (version !== generation.current) return;
      if (receipt.status !== 'saved') throw new TypeError('Save without receipt');
      await finishSaved(receipt, version);
    } catch (caught) {
      if (version !== generation.current) return;
      // Only explicit application denials establish that the command did not save.
      if (caught instanceof ApiError && caught.hasExplicitCode && [400,401,403,404,409,422].includes(caught.status)) {
        setSaveState('idle'); setCommand(null); setStale(true); handleError(caught);
      } else { setSaveState('unknown'); setError('Svaret på sparandet saknas. Läs sparstatus innan du försöker igen eller lämnar vyn.'); }
    } finally { if (version === generation.current) inFlight.current = false; }
  }
  async function readStatus() {
    if (!command || inFlight.current) return;
    const version = generation.current; inFlight.current = true; setSaveState('checking'); setError(null);
    try {
      const receipt = parseSchoolRegistryStatus(await api.post<unknown>('/api/skolor/register/status', command), command);
      if (version !== generation.current) return;
      if (receipt.status === 'saved') await finishSaved(receipt, version);
      else { setSaveState('retry'); setNotice('Inget sparande finns för denna begäran. Du kan försöka spara samma granskade underlag igen.'); }
    } catch (caught) { if (version === generation.current) { setSaveState('unknown'); handleError(caught); } }
    finally { if (version === generation.current) inFlight.current = false; }
  }
  const retained = detail?.local?.schoolTypes.filter(type => !detail.unit.schoolTypes.includes(type)) ?? [];
  return <section className="school-registry" aria-labelledby="school-registry-title">
    <header><h1 id="school-registry-title">Skolor</h1><p>Hämta skoluppgifter från Skolenhetsregistret och granska dem innan du sparar.</p>{list && <p><strong>{list.organizer.name}</strong> · {list.organizer.organizationNumber ?? 'Organisationsnummer saknas'}</p>}</header>
    {error && <p className="school-registry-error" role="alert">{error}</p>}
    {notice && <output className="school-registry-notice">{notice}</output>}
    {(saveState === 'unknown' || saveState === 'checking') && <Button disabled={saveState === 'checking'} onClick={() => void readStatus()}>{saveState === 'checking' ? 'Läser sparstatus…' : 'Läs sparstatus'}</Button>}
    {saveState === 'retry' && command && <Button onClick={() => void save(command)}>Försök spara igen</Button>}
    {saveState === 'saved' && saved && <Button disabled={loading} onClick={() => void finishSaved(saved, generation.current)}>Läs om listan</Button>}
    {!list && <output>{loading ? 'Läser skolenheter…' : 'Skolenheterna kunde inte läsas.'}</output>}
    {!list && !loading && <Button onClick={() => { setError(null); void loadList(); }}>Försök läsa igen</Button>}
    {list && <>
      <section className="school-registry-panel" aria-labelledby="registry-search-title"><h2 id="registry-search-title">Sök i Skolenhetsregistret</h2>
        {!list.organizer.organizationNumber ? <p>Huvudmannen saknar organisationsnummer. Kundadministratören behöver komplettera det innan du kan hämta och spara registeruppgifter.</p> : <form onSubmit={search}>
          <fieldset disabled={blocked}><legend>Sök med</legend><div className="school-registry-choices">
            <label><input type="radio" name="school-search-kind" checked={kind === 'code'} onChange={() => { invalidateSearch(); setKind('code'); setValue(''); }}/> Skolenhetskod</label>
            <label><input type="radio" name="school-search-kind" checked={kind === 'organizationNumber'} onChange={() => { invalidateSearch(); setKind('organizationNumber'); setValue(list.organizer.organizationNumber ?? ''); }}/> Organisationsnummer</label>
          </div><label className="school-registry-query">{kind === 'code' ? 'Skolenhetskod (8 siffror)' : 'Huvudmannens organisationsnummer'}<input inputMode="numeric" autoComplete="off" value={value} maxLength={kind === 'code' ? 8 : 13} onChange={event => { invalidateSearch(); setValue(event.target.value); }}/></label>
          <Button type="submit" disabled={!value.trim() || searching}>{searching ? 'Söker…' : 'Sök skola'}</Button></fieldset>
        </form>}
        {result?.kind === 'organizationNumber' && <div className="school-registry-results"><h3>Välj skola att granska</h3>{result.units.length === 0 && <p>Inga skolenheter hittades.</p>}{result.units.map(unit => <article key={unit.code}><div><strong>{unit.name}</strong><p>{unit.code} · {unit.status}</p></div><Button variant="outline" disabled={blocked} onClick={() => void lookup({kind:'code',value:unit.code})}>Granska {unit.name}</Button></article>)}</div>}
      </section>
      {detail && <section className="school-registry-panel school-registry-preview" aria-labelledby="registry-preview-title"><h2 ref={detailHeading} tabIndex={-1} id="registry-preview-title">Granska {detail.unit.name}</h2><p>{detail.local ? 'Jämför de sparade uppgifterna med det nya registerunderlaget.' : 'Skolan läggs till först när du bekräftar nedan.'}</p>
        <dl className="school-registry-facts"><div><dt>Skolenhetskod</dt><dd>{detail.unit.code}</dd></div><div><dt>Namn i registret</dt><dd>{detail.unit.name}{detail.local && detail.local.name !== detail.unit.name && <small>Nu: {detail.local.name}</small>}</dd></div><div><dt>Adress i registret</dt><dd>{addressText(detail.unit.address)}{detail.local && addressText(detail.local.address) !== addressText(detail.unit.address) && <small>Nu: {addressText(detail.local.address)}</small>}</dd></div><div><dt>Kommun i registret</dt><dd>{detail.unit.municipalityName ?? detail.unit.municipalityCode}</dd></div><div><dt>Status i registret</dt><dd>{detail.unit.status}</dd></div><div><dt>Skolformer i registret</dt><dd>{typesText(detail.unit.schoolTypes)}</dd></div><div><dt>Lokalt tillsatt rektor</dt><dd>{detail.local && !detail.local.canUpdate ? 'Visas med skolmandat' : detail.local?.principalName ?? 'Ingen lokalt tillsatt rektor'}<small>Bevaras vid uppdatering. Rektor utses separat via Mandat.</small></dd></div></dl>
        {retained.length > 0 && <p className="school-registry-notice">Lokala skolformer behålls: {typesText(retained)}. De saknas i det nya registerunderlaget och tas inte bort automatiskt.</p>}
        <p>Lokala årskurser, rektorsuppdrag, övriga uppdrag och elevregisteranslutning ändras inte.</p>
        <p className="school-registry-source">Källa: Skolverkets skolenhetsregister · hämtat {new Date(detail.unit.fetchedAt).toLocaleString('sv-SE')}</p>
        {detail.local && !detail.local.canUpdate ? <p>Du saknar skolmandat för att uppdatera denna skola. Skolimporten ger ingen automatisk rätt att planera eller utse rektor.</p> : <div className="school-registry-actions"><Button disabled={blocked || stale || saveState === 'retry'} onClick={() => void save()}>{saveState === 'saving' ? 'Sparar…' : detail.local ? 'Uppdatera registeruppgifter' : 'Lägg till skolenhet'}</Button><Button variant="outline" disabled={blocked} onClick={() => { invalidateSearch(); setNotice(null); }}>Avbryt granskning</Button>{stale && <Button variant="outline" onClick={() => void lookup({kind:'code',value:detail.unit.code})}>Hämta nytt underlag</Button>}</div>}
      </section>}
      <section aria-labelledby="local-schools-title"><h2 id="local-schools-title">Dina skolenheter</h2>{list.units.length === 0 && <p>Inga skolenheter är tillgängliga för detta uppdrag.</p>}<div className="school-registry-cards">{list.units.map(unit => <article className="school-registry-panel" key={unit.id}><h3>{unit.name}</h3><p>{unit.code} · {unit.municipalityName ?? unit.municipalityCode}</p><p>{typesText(unit.schoolTypes)}</p><p>Lokalt tillsatt rektor: <strong>{unit.canUpdate ? unit.principalName ?? 'Ingen utsedd' : 'Visas med skolmandat'}</strong></p>{unit.sourceSchoolTypes && unit.schoolTypes.some(type => !unit.sourceSchoolTypes!.includes(type)) && <p>Vissa lokala skolformer saknas i senaste registerunderlaget och är bevarade.</p>}{unit.canUpdate ? <Button variant="outline" disabled={blocked || !list.organizer.organizationNumber} onClick={() => void lookup({kind:'code',value:unit.code})}>Hämta registeruppgifter för {unit.name}</Button> : <p>Importerad skola. Ett skolmandat behövs för fortsatt arbete.</p>}</article>)}</div></section>
    </>}
  </section>;
}
