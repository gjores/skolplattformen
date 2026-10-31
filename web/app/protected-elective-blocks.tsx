'use client';

import { useCallback, useEffect, useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges, useHasUnsaved, confirmDiscard } from '@/lib/unsaved-changes.tsx';
import { parseElectiveRead, parseElectiveBlockDraft, parseElectiveCommand, parseElectiveReceipt, parseElectiveStatusReply, createElectiveCommandRef, parseElectiveCommandRef,
  type ElectiveRead, type ElectiveBlock, type ElectiveBlockDraft, type ElectiveBlockKind,
  type ElectiveCommand, type ElectiveCommandRef, type ElectiveSource, type ElectiveOption } from '@/lib/elective-block-contract.ts';
import { PROGRAMPLAN_LANGUAGES, PROGRAMPLAN_LANGUAGE_LADDERS, programplanLanguageName } from '@/lib/programplan-languages.ts';
import { inheritElectiveTime } from '@/lib/elective-block-model.ts';
import { parseProgramplanCatalog } from '@/lib/programplan-catalog.ts';
import catalogArtifact from '@/lib/programplan-catalog.generated.json';
import { formatTime } from './tjanst-service-summary';
import './elective-blocks.css';
import ProtectedElectiveTimplanTime from './protected-elective-timplan-time';
import ElectivePlacementForm from './elective-placement-form';
import ElectivePlacementList from './elective-placement-list';
import ElectiveRetireGroup from './elective-retire-group';
import MfaStepUpNotice from './mfa-step-up';
import { nationalTimplan } from '@/lib/timplan-model.ts';
import ElectiveParticipantBindings from './elective-participant-bindings';
import ElectiveStaffChoice from './elective-staff-choice';

const KIND: Record<ElectiveBlockKind, string> = { modernLanguage: 'Moderna språk', individualChoice: 'Individuellt val', specialization: 'Programfördjupning', languageChoice: 'Språkval', schoolChoice: 'Skolans val' };
const CHOICE_STATE: Record<string, string> = { stale_offer: 'Utbudet har ändrats', policy_missing: 'Skolinställning saknas', guardian_bindings_missing: 'VH-koppling saknas', guardian_declined: 'VH har avböjt', awaiting_guardian: 'Väntar på VH', ready_for_confirmation: 'Klar att bekräfta', confirmed: 'Bekräftat' };
const catalog = parseProgramplanCatalog(catalogArtifact);
const levels = catalog.subjects.flatMap(subject => subject.items.map(item => ({ ...item, subjectCode: subject.code, subjectName: subject.name })));
const GR_NAMES: Record<string, string> = { ...Object.fromEntries(nationalTimplan.flatMap(subject => subject.code ? [[subject.code, subject.name]] : [])), GRGRSVE01: 'Svenska', GRGRSVA01: 'Svenska som andraspråk', GRGRENG01: 'Engelska', GRGRMSP01: 'Moderna språk', GRGRMOD01: 'Moderna språk' };
function languageRule(code: string) { const ladder = PROGRAMPLAN_LANGUAGE_LADDERS.find(value => value.steps.some(step => step.itemCode === code)); return { required: ladder?.languageRequired ?? ['GRGRMSP01', 'GRGRMOD01'].includes(code), fixed: ladder?.languageCode ?? null }; }
function lastValInstant(date: string): string {
  const noon = new Date(`${date}T12:00:00Z`), zone = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Stockholm', timeZoneName: 'shortOffset' }).formatToParts(noon).find(part => part.type === 'timeZoneName')?.value;
  const match = zone?.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/u);
  if (!match) throw new Error('timezone');
  const minutes = (Number(match[2]) * 60 + Number(match[3] ?? 0)) * (match[1] === '+' ? 1 : -1);
  return new Date(Date.parse(`${date}T23:59:59Z`) - minutes * 60_000).toISOString();
}
const newId = () => crypto.randomUUID();
const time = (value: number | null) => value === null ? 'Tid saknas' : formatTime(value);
function message(error: unknown, action?: ElectiveCommand['action']): string {
  if (error instanceof ApiError) {
    if (error.code === 'elective_frame_conflict') return 'Tidsutrymmet används redan av ett annat valbart block. Ändra det befintliga blocket eller välj ett annat tidsutrymme.';
    if (error.code === 'elective_round_open') return 'Stäng gruppens öppna valomgångar innan du avvecklar gruppen.';
    if (error.code === 'elective_group_retired') return 'Gruppen är redan avvecklad. Hämta aktuellt läge.';
    if (error.code === 'elective_group_in_use' && action === 'retire_group') return 'Avsluta eller återta elevplaceringarna och ta bort gruppens aktuella lärartilldelningar innan du avvecklar den.';
    if (error.code === 'elective_group_in_use') return 'Gruppens sparade källor eller befintliga kopplingar hindrar ändringen. Använd en ny grupp för nytt underlag. Avveckla en tidigare använd grupp när placeringar och bemanning är avslutade.';
    if (error.code === 'elective_retire_conflict') return 'Gruppen kan inte avvecklas ännu. Avsluta eller återta elevplaceringarna, ta bort aktuell bemanning och stäng berörda valomgångar.';
    if (error.code === 'elective_duplicate_course') return 'Eleven har redan samma kurs eller nivå i ett annat bekräftat val. Granska elevens val innan du fortsätter.';
    if (error.status === 409) return 'Underlaget har ändrats. Hämta aktuellt läge och granska ändringen igen.';
    if (error.status === 403) return error.code === 'mfa_required' ? 'Verifiera inloggningen för att spara.' : 'Ditt uppdrag tillåter inte den här åtgärden.';
    if (error.status === 400) return 'Kontrollera blockets ram, alternativ och grupper. Uppgifterna kunde inte sparas.';
  }
  return 'Svaret kunde inte verifieras. Kontrollera sparstatus innan du försöker igen.';
}
type Props = { unitId: string | null; schoolYear: number; scopeKey: string; contextEpoch?: number | null; onSessionLost: () => void; onTjanst?: () => void };
export default function ProtectedElectiveBlocks(props: Props) {
  if (!props.unitId) return <section className="elective-card"><h1>Valbara block</h1><p>Välj en skola för att se utbud och grupper.</p></section>;
  return <Workspace key={`${props.scopeKey}-${props.unitId}-${props.schoolYear}`} {...props} unitId={props.unitId}/>;
}
function Workspace({ unitId, schoolYear, scopeKey, contextEpoch = null, onSessionLost, onTjanst }: Props & { unitId: string }) {
  const heading = useId();
  const [data, setData] = useState<ElectiveRead | null>(null), [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<ElectiveBlockDraft | null>(null), [busy, setBusy] = useState(false), [pending, setPending] = useState<ElectiveCommandRef | null>(() => {
    try {
      const value = window.sessionStorage.getItem(`elective-status:${scopeKey}:${unitId}:${schoolYear}`);
      if (!value) return null;
      const ref = parseElectiveCommandRef(JSON.parse(value));
      return ref.unitId === unitId && ref.schoolYear === schoolYear ? ref : null;
    } catch { return null; }
  });
  const [error, setError] = useState<string | null>(null), [feedback, setFeedback] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const [review, setReview] = useState(false), [mfa, setMfa] = useState(false);
  const [policyReview, setPolicyReview] = useState<boolean | null>(null), [timeFrame, setTimeFrame] = useState<string | null>(null);
  const hasUnsaved = useHasUnsaved(), navigationBlocked = useHasUnsaved('navigation-block:');
  useUnsavedChanges(`elective-editor:${scopeKey}`, draft !== null);
  useUnsavedChanges(`navigation-block:elective:${scopeKey}`, busy || pending !== null);
  const scope = useMemo(() => ({ unitId, schoolYear }), [unitId, schoolYear]);
  const load = useCallback(async (signal?: AbortSignal) => {
    const next = parseElectiveRead(await api.post('/api/valbara-block/lasa', scope, signal), scope);
    setData(next); return next;
  }, [scope]);
  useEffect(() => {
    const controller = new AbortController();
    void api.post('/api/valbara-block/lasa', scope, controller.signal).then(raw => {
      if (!controller.signal.aborted) setData(parseElectiveRead(raw, scope));
    }).catch(caught => {
      if (controller.signal.aborted) return;
      if (caught instanceof ApiError && [401, 403].includes(caught.status)) { setData(null); setDraft(null); }
      if (caught instanceof ApiError && caught.status === 401) onSessionLost(); else setError(message(caught));
    });
    return () => controller.abort();
  }, [scope, retry, onSessionLost]);
  async function send(action: ElectiveCommand['action'], payload: ElectiveCommand['payload'], current = data) {
    if (!current || busy || pending) return null;
    let command: ElectiveCommand;
    try { command = parseElectiveCommand({ ...scope, commandId: newId(), expectedRevision: current.revision, action, payload }); }
    catch { setError('Kontrollera att alla namn, datum, alternativ och grupper är ifyllda.'); return null; }
    setBusy(true); setError(null); setFeedback(null); setMfa(false);
    const ref = await createElectiveCommandRef(command);
    try { window.sessionStorage.setItem(`elective-status:${scopeKey}:${unitId}:${schoolYear}`, JSON.stringify(ref)); }
    catch { setBusy(false); setError('Ändringen kunde inte förberedas säkert. Inget har skickats.'); return null; }
    setPending(ref);
    let acknowledged = false;
    try {
      parseElectiveReceipt(await api.post('/api/valbara-block/kommando', command), ref);
      try { window.sessionStorage.removeItem(`elective-status:${scopeKey}:${unitId}:${schoolYear}`); } catch { /* Ett bekräftat kvitto kan läsas igen efter reload. */ }
      acknowledged = true; setPending(null); setDraft(null); setReview(false); setPolicyReview(null);
      if (command.action === 'save_block') setSelected(command.payload.block.id);
      const next = await load(); setFeedback('Ändringen är sparad.'); return next;
    } catch (caught) {
      if (acknowledged) { setData(null); setError('Ändringen är sparad, men det aktuella läget kunde inte hämtas. Hämta aktuellt läge innan du fortsätter.'); return null; }
      if (caught instanceof ApiError && caught.status === 401) onSessionLost();
      if (caught instanceof ApiError && caught.hasExplicitCode && [400, 403, 409].includes(caught.status)) {
        setPending(null);
        try { window.sessionStorage.removeItem(`elective-status:${scopeKey}:${unitId}:${schoolYear}`); } catch { /* Samma status kan kontrolleras efter reload. */ }
      }
      if (caught instanceof ApiError && caught.code === 'mfa_required') setMfa(true);
      setError(message(caught, command.action)); return null;
    } finally { setBusy(false); }
  }
  async function checkStatus() {
    if (!pending || busy) return;
    setBusy(true); setError(null);
    try {
      const result = parseElectiveStatusReply(await api.post('/api/valbara-block/status', pending), pending);
      try { window.sessionStorage.removeItem(`elective-status:${scopeKey}:${unitId}:${schoolYear}`); } catch { /* Kvittot är verifierat; gammalt lokalt underlag ger aldrig ett nytt kommando. */ }
      if (result.status === 'found') { setPending(null); setDraft(null); setReview(false); setFeedback('Sparandet är bekräftat.'); try { await load(); } catch { setData(null); setError('Sparandet är bekräftat. Hämta aktuellt läge för att fortsätta.'); } }
      else { setPending(null); setFeedback('Ändringen är inte sparad. Granska och spara igen.'); }
    } catch (caught) { if (caught instanceof ApiError && caught.code === 'mfa_required') setMfa(true); setError(message(caught)); } finally { setBusy(false); }
  }
  const current = data?.blocks.find(block => block.id === selected) ?? data?.blocks[0] ?? null;
  const disabled = busy || pending !== null || navigationBlocked || !data?.canManage;
  function choosePolicy(value: boolean) {
    if (data && (data.policy.guardianConfirmation !== null || data.rounds.some(round => round.status === 'open'))) setPolicyReview(value);
    else void send('set_policy', { guardianConfirmation: value });
  }
  function start(block?: ElectiveBlock) {
    if (!data || draft || navigationBlocked || hasUnsaved && !confirmDiscard()) return;
    setError(null); setFeedback(null); setReview(false);
    setDraft(block ? { id: block.id, kind: block.kind, name: block.name, startsOn: block.startsOn, endsOn: block.endsOn,
      sourceRefs: block.sourceRefs.map(source => data.sources.find(current => current.sourceKey === source.sourceKey) ?? source), options: block.options, groups: block.groups.map(({ memberCount: _count, membershipRevision: _revision, ...group }) => group) }
      : { id: newId(), kind: data.sources[0]?.blockKind ?? 'modernLanguage', name: '', startsOn: `${schoolYear}-07-01`, endsOn: `${schoolYear + 1}-06-30`, sourceRefs: [], options: [], groups: [] });
  }
  return <section className="elective-workspace" aria-labelledby={heading}>
    <header className="elective-heading"><div><h1 id={heading}>Valbara block</h1><output className="elective-muted">{feedback ?? 'Alternativ, elevval och undervisningsgrupper'}</output></div>
      <div className="elective-actions">{onTjanst && <Button variant="outline" onClick={onTjanst}>Till tjänstefördelningen</Button>}
        <Button disabled={disabled || draft !== null || timeFrame !== null} onClick={() => start()}>Lägg till valbart block</Button></div>
    </header>
    {mfa && <MfaStepUpNotice message="Verifiera inloggningen för att fortsätta." detail={pending ? 'Kontrollera sparstatus efter verifieringen innan du försöker spara igen.' : 'Osparade uppgifter följer inte med. Du kommer tillbaka till valbara block efter verifieringen.'} returnTo="/?vy=valbara"/>}
    {error && !mfa && <div className="elective-error" role="alert">{error}{!pending && <Button variant="ghost" disabled={busy} onClick={() => { setError(null); setRetry(value => value + 1); }}>Hämta aktuellt läge</Button>}</div>}
    {pending && <div className="elective-card" aria-live="polite"><p>Kontrollera sparstatus innan du fortsätter.</p><Button disabled={busy} onClick={() => void checkStatus()}>Kontrollera sparstatus</Button></div>}
    {!data ? <p aria-busy="true">Hämtar skolans valbara block…</p> : <>
      <details className="elective-card"><summary>Skolinställning för VH-bekräftelse <span className="elective-muted">{data.policy.guardianConfirmation === null ? 'Inte vald' : data.policy.guardianConfirmation ? 'På' : 'Av'}</span></summary>
        <p>Välj om elevval behöver bekräftas av vårdnadshavare innan skolan kan bekräfta och placera eleven.</p>
        <div className="elective-actions"><Button variant="outline" aria-pressed={data.policy.guardianConfirmation === true} disabled={disabled || !!draft || timeFrame !== null || data.policy.guardianConfirmation === true} onClick={() => choosePolicy(true)}>På</Button>
          <Button variant="outline" aria-pressed={data.policy.guardianConfirmation === false} disabled={disabled || !!draft || timeFrame !== null || data.policy.guardianConfirmation === false} onClick={() => choosePolicy(false)}>Av</Button></div>
        {policyReview !== null && <div className="elective-card"><h3>Granska skolinställningen</h3><p>VH-bekräftelse blir {policyReview ? 'på' : 'av'} för skolans öppna valomgångar. Inlämnade val och svar behålls, men deras status kan ändras. Redan gjorda gruppplaceringar flyttas inte.</p><div className="elective-actions"><Button variant="outline" disabled={disabled} onClick={() => setPolicyReview(null)}>Avbryt</Button><Button disabled={disabled || !!draft} onClick={() => void send('set_policy', { guardianConfirmation: policyReview })}>Ändra skolinställningen</Button></div></div>}
      </details>
      {!draft && data.sources.some(source => source.schoolform === 'gymnasium') && <details className="elective-card"><summary>Timplanens valbara tidsutrymmen</summary><p>Grupper ärver tiden. Om en ram ska delas, exempelvis individuellt val i två kurser om 100 poäng, fördelar du först tiden i timplanen här. Skapa sedan ett block för varje tidsutrymme.</p>
        {!timeFrame ? <div className="elective-list">{[...new Map(data.sources.filter(source => source.schoolform === 'gymnasium').map(source => [`${source.timplanId}:${source.rowKey}:${source.column}`, source])).values()].map(source => <Button key={source.frameSourceKey} variant="outline" disabled={disabled} onClick={() => setTimeFrame(source.frameSourceKey)}>{KIND[source.blockKind]} · timplan version {source.timplanVersion} · {data.sources.filter(item => item.timplanId === source.timplanId && item.rowKey === source.rowKey && item.column === source.column).map(item => item.className).filter((name, index, values) => values.indexOf(name) === index).join(', ')}</Button>)}</div>
        : <><Button variant="outline" disabled={navigationBlocked || busy || pending !== null} onClick={() => { if (!hasUnsaved || confirmDiscard()) setTimeFrame(null); }}>Tillbaka till tidsutrymmen</Button><ProtectedElectiveTimplanTime unitId={unitId} schoolYear={schoolYear} frameSourceKey={timeFrame} contextEpoch={contextEpoch} onSessionLost={onSessionLost} onApplied={() => void load().catch(caught => setError(message(caught)))}/></>}
      </details>}
      {!draft && data.canReadPupils && data.pupils && <details className="elective-card"><summary>Kontokopplingar för elevval och VH-bekräftelse</summary><ElectiveParticipantBindings unitId={unitId} schoolYear={schoolYear} scopeKey={scopeKey} pupils={data.pupils} disabled={disabled || timeFrame !== null} onSessionLost={onSessionLost}/></details>}
      {draft ? <BlockEditor draft={draft} sources={data.sources} reserved={Object.fromEntries(data.sources.flatMap(source => { const owner = data.blocks.find(block => block.id !== draft.id && !data.releasedBlockIds?.includes(block.id) && block.sourceRefs.some(ref => ref.classId === source.classId && ref.frameSourceKey === source.frameSourceKey && (!ref.timeDetailRef || !source.timeDetailRef || ref.timeDetailRef.positionId === source.timeDetailRef.positionId))); return owner ? [[source.sourceKey, owner.name]] : []; }))} disabled={disabled} review={review} lockedOptions={data.blocks.find(block => block.id === draft.id)?.options.map(option => option.id) ?? []} onChange={next => { setDraft(next); setReview(false); }}
        onReview={() => { try { parseElectiveBlockDraft(draft); for (const group of draft.groups) inheritElectiveTime(draft.sourceRefs.filter(source => group.sourceKeys.includes(source.sourceKey))); setError(null); setReview(true); }
          catch { setError('Kontrollera alternativens namn, ämne, språk och grupper. Gruppernas timplansunderlag måste ha känd och förenlig tid.'); } }} onCancel={() => { setDraft(null); setReview(false); }} onSave={() => void send('save_block', { expectedBlockRevision: data.blocks.find(block => block.id === draft.id)?.revision ?? null, block: draft })}/>
        : <div className="elective-columns"><nav className="elective-list" aria-label="Valbara block">{data.blocks.map(block => <button key={block.id} aria-pressed={current?.id === block.id} disabled={navigationBlocked || busy || pending !== null} onClick={() => { if (!hasUnsaved || confirmDiscard()) { setSelected(block.id); setFeedback(null); } }}>
          {block.name}<small>{KIND[block.kind]} · {block.groups.length} grupper</small></button>)}{data.blocks.length === 0 && <p>Inga valbara block finns ännu.</p>}</nav>
          {current ? <BlockDetail key={current.id} data={data} block={current} disabled={disabled || timeFrame !== null} onEdit={() => start(current)} onSend={send}/>
            : <div className="elective-card"><h2>Planera utbudet före elevvalen</h2><p>Lägg upp ett valbart block och koppla det till timplanens ram. Grupperna kan sedan bemannas även innan alla elever har valt.</p>{data.sources.length === 0 && <p className="elective-muted">Inga valbara timplansramar finns i underlaget. Kontrollera klassernas timplanskopplingar och utbildningens valbara utrymme.</p>}</div>}
        </div>}
    </>}
  </section>;
}

type EditorProps = { draft: ElectiveBlockDraft; sources: ElectiveSource[]; reserved: Record<string, string>; disabled: boolean; review: boolean; lockedOptions: string[]; onChange: (draft: ElectiveBlockDraft) => void; onReview: () => void; onCancel: () => void; onSave: () => void };
function BlockEditor({ draft, sources, reserved, disabled, review, lockedOptions, onChange, onReview, onCancel, onSave }: EditorProps) {
  const id = useId();
  const candidates = sources.filter(source => source.blockKind === draft.kind);
  const allowed = draft.sourceRefs.length ? draft.sourceRefs[0].allowedOptionCodes.filter(code => draft.sourceRefs.every(source => source.allowedOptionCodes.includes(code))) : [];
  const chooseSource = (source: ElectiveSource, checked: boolean) => { const previous = draft.sourceRefs.find(value => value.classId === source.classId); onChange({ ...draft, sourceRefs: checked ? [...draft.sourceRefs.filter(value => value.classId !== source.classId), source] : draft.sourceRefs.filter(value => value.sourceKey !== source.sourceKey), groups: draft.groups.map(group => ({ ...group, classIds: checked ? group.classIds : group.classIds.filter(id => id !== source.classId), sourceKeys: checked ? group.sourceKeys.map(key => key === previous?.sourceKey ? source.sourceKey : key) : group.sourceKeys.filter(key => key !== source.sourceKey) })) }); };
  const changeOption = (option: ElectiveOption) => onChange({ ...draft, options: draft.options.map(value => value.id === option.id ? option : value) });
  return <div className="elective-card"><h2>{review ? 'Granska valbart block' : 'Valbart block'}</h2><fieldset disabled={disabled || review}>
    <div className="elective-fields"><label htmlFor={`${id}-name`}>Blockets namn<input id={`${id}-name`} value={draft.name} maxLength={200} onChange={event => onChange({ ...draft, name: event.target.value })}/></label>
      <label>Typ av valbart block<select value={draft.kind} onChange={event => onChange({ ...draft, kind: event.target.value as ElectiveBlockKind, sourceRefs: [], options: [], groups: [] })}>{Object.entries(KIND).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <div><span className="elective-muted">Period enligt timplansunderlaget</span><p>{draft.startsOn} – {draft.endsOn}</p></div></div>
    <fieldset><legend>Timplansram och berörda klasser</legend>{candidates.map(source => <label className="elective-check" key={source.sourceKey}><input type="checkbox" disabled={!!reserved[source.sourceKey] && !draft.sourceRefs.some(value => value.sourceKey === source.sourceKey)} checked={draft.sourceRefs.some(value => value.sourceKey === source.sourceKey)} onChange={event => chooseSource(source, event.target.checked)}/>
      <span>{source.className} · {source.label}{reserved[source.sourceKey] && <small> Används av {reserved[source.sourceKey]}</small>}<small className="elective-muted"> HT {time(source.needHt)} · VT {time(source.needVt)}</small></span></label>)}
      {candidates.length === 0 && <p>Ingen sådan ram finns i aktuellt timplansunderlag.</p>}</fieldset>
    <p className="elective-muted">Undervisningstiden ärvs från timplanen. Gemensamma grupper behöver förenliga tider för de valda klasserna.</p>
    <h3>Alternativ och grupper</h3>
    {draft.options.map((option, index) => <div className="elective-card" key={option.id}><div className="elective-fields">
      <label>Alternativets namn<input value={option.name} maxLength={200} onChange={event => changeOption({ ...option, name: event.target.value })}/></label>
      <label>Ämne och nivå<select disabled={lockedOptions.includes(option.id)} value={option.levelCode} onChange={event => { const found = levels.find(level => level.code === event.target.value); changeOption({ ...option, levelCode: event.target.value, subjectCode: found?.subjectCode ?? event.target.value, points: found?.points ?? null, language: languageRule(event.target.value).fixed ?? (languageRule(event.target.value).required ? option.language : null) }); }}><option value="">Välj ämne och nivå</option>{option.levelCode && !allowed.includes(option.levelCode) && <option value={option.levelCode}>{levels.find(level => level.code === option.levelCode)?.name ?? GR_NAMES[option.levelCode] ?? option.levelCode} · tidigare underlag</option>}{allowed.map(code => <option key={code} value={code}>{levels.find(level => level.code === code)?.name ?? GR_NAMES[code] ?? code}</option>)}</select></label>
      {languageRule(option.levelCode).required && <label>Språk<select disabled={lockedOptions.includes(option.id)} value={option.language ?? ''} onChange={event => changeOption({ ...option, language: event.target.value || null })}><option value="">Välj språk</option>{PROGRAMPLAN_LANGUAGES.filter(language => !languageRule(option.levelCode).fixed || language.code === languageRule(option.levelCode).fixed).map(language => <option value={language.code} key={language.code}>{language.name}</option>)}</select></label>}
    </div>
      {lockedOptions.includes(option.id) && <small>Ämne, nivå och språk hör till det sparade alternativet. Lägg till ett nytt alternativ för annat innehåll.</small>}
      {draft.groups.filter(group => group.optionId === option.id).map(group => <div key={group.id} className="elective-card"><div className="elective-fields"><label>Gruppens namn<input value={group.name} onChange={event => onChange({ ...draft, groups: draft.groups.map(value => value.id === group.id ? { ...value, name: event.target.value } : value) })}/></label>
        <label>Uppskattat elevantal<input type="number" min={0} max={1000} value={group.estimatedPupils ?? ''} onChange={event => onChange({ ...draft, groups: draft.groups.map(value => value.id === group.id ? { ...value, estimatedPupils: event.target.value === '' ? null : Number(event.target.value) } : value) })}/></label></div><fieldset><legend>Gruppens klasser</legend>{draft.sourceRefs.map(source => <label className="elective-check" key={source.sourceKey}><input type="checkbox" checked={group.sourceKeys.includes(source.sourceKey)} onChange={event => { const chosen = event.target.checked ? [...group.sourceKeys, source.sourceKey] : group.sourceKeys.filter(key => key !== source.sourceKey); onChange({ ...draft, groups: draft.groups.map(value => value.id === group.id ? { ...value, sourceKeys: chosen, classIds: draft.sourceRefs.filter(ref => chosen.includes(ref.sourceKey)).map(ref => ref.classId) } : value) }); }}/>{source.className} · {source.label}</label>)}</fieldset>{!group.classIds.length && <p>Välj minst en klass för gruppen.</p>}<Button type="button" variant="ghost" onClick={() => onChange({ ...draft, groups: draft.groups.filter(value => value.id !== group.id) })}>Ta bort grupp</Button></div>)}
      <div className="elective-actions"><Button type="button" variant="outline" disabled={draft.sourceRefs.length === 0} onClick={() => onChange({ ...draft, groups: [...draft.groups, { id: newId(), optionId: option.id, name: `${option.name || `Alternativ ${index + 1}`} ${draft.groups.filter(group => group.optionId === option.id).length + 1}`,
        startsOn: draft.startsOn, endsOn: draft.endsOn, classIds: [...new Set(draft.sourceRefs.map(source => source.classId))], sourceKeys: draft.sourceRefs.map(source => source.sourceKey), estimatedPupils: null }] })}>Lägg till grupp för alternativet</Button>
        <Button type="button" variant="ghost" onClick={() => onChange({ ...draft, options: draft.options.filter(value => value.id !== option.id), groups: draft.groups.filter(value => value.optionId !== option.id) })}>Ta bort alternativet</Button></div>
    </div>)}
    <Button type="button" variant="outline" disabled={!draft.sourceRefs.length} onClick={() => onChange({ ...draft, options: [...draft.options, { id: newId(), name: '', subjectCode: '', levelCode: '', language: null, points: null }] })}>Lägg till alternativ</Button>
  </fieldset>
    {review && <p>{draft.options.length} alternativ och {draft.groups.length} grupper sparas med timplanens undervisningstid. Elevval och befintlig bemanning ändras inte av att spara blocket.</p>}
    <div className="elective-actions"><Button variant="outline" disabled={disabled} onClick={onCancel}>Avbryt</Button>{review ? <><Button variant="outline" disabled={disabled} onClick={() => onChange(draft)}>Fortsätt redigera</Button><Button disabled={disabled} onClick={onSave}>Bekräfta och spara block</Button></>
      : <Button disabled={disabled || !draft.name.trim() || !draft.options.length || !draft.groups.length || !draft.sourceRefs.length} onClick={onReview}>Granska block</Button>}</div>
  </div>;
}

type Send = (action: ElectiveCommand['action'], payload: ElectiveCommand['payload'], current?: ElectiveRead | null) => Promise<ElectiveRead | null>;
function BlockDetail({ data, block, disabled, onEdit, onSend }: { data: ElectiveRead; block: ElectiveBlock; disabled: boolean; onEdit: () => void; onSend: Send }) {
  const [closeDate, setCloseDate] = useState(`${data.schoolYear + 1}-06-01`), [pupilIds, setPupilIds] = useState<string[]>([]);
  const minChoices = 1, maxChoices = 1;
  const rounds = data.rounds.filter(round => round.blockId === block.id);
  const classIds = new Set(block.sourceRefs.map(source => source.classId));
  const pupils = data.pupils?.filter(pupil => pupil.classIds.some(classId => classIds.has(classId))) ?? [];
  const choices = data.choices?.filter(choice => rounds.some(round => round.id === choice.roundId)) ?? [];
  return <article className="elective-card"><div className="elective-heading"><div><span className="elective-muted">{KIND[block.kind]}</span><h2>{block.name}</h2>{data.releasedBlockIds?.includes(block.id) && <p>Grupperna är avvecklade. Tidigare historik behålls; tidsutrymmet är ledigt för ny planering.</p>}</div><Button variant="outline" disabled={disabled} onClick={onEdit}>Ändra block</Button></div>
    <p className="elective-muted">{block.startsOn} – {block.endsOn} · {block.sourceRefs.map(source => source.className).join(', ')}</p>
    {block.options.map(option => <section key={option.id} className="elective-card"><h3>{option.name}</h3><p className="elective-muted">{option.language && `${programplanLanguageName(option.language)} · `}{option.levelCode}</p>
      {block.groups.filter(group => group.optionId === option.id).map(group => { const source = block.sourceRefs.find(value => group.sourceKeys.includes(value.sourceKey)); return <div className="elective-toolbar" key={group.id}><div><strong>{group.name}</strong><p className="elective-muted">{group.memberCount === null ? 'Elevantal kan inte visas' : `${group.memberCount} placerade`}{group.estimatedPupils === null ? '' : ` · uppskattat ${group.estimatedPupils}`}</p></div>
        <span>HT {time(source?.needHt ?? null)} · VT {time(source?.needVt ?? null)}</span><ElectiveRetireGroup data={data} block={block} group={group} disabled={disabled} onSend={onSend}/></div>; })}
    </section>)}
    <div className="elective-toolbar"><span className="elective-status" data-pending={!block.applied}>{block.applied ? 'Grupprader finns i tjänsteunderlaget' : 'Grupprader behöver tillämpas'}</span>
      <Button disabled={disabled || block.applied} onClick={() => void onSend('apply_groups', { blockId: block.id, expectedBlockRevision: block.revision })}>Använd i tjänstefördelningen</Button></div>
    <details><summary>Öppna elevval</summary><div className="elective-form">
      {data.policy.guardianConfirmation === null && <p>Välj skolans inställning för VH-bekräftelse innan elevvalet öppnas.</p>}
      {!data.canReadPupils ? <p>Ditt uppdrag saknar åtkomst till elevurvalet.</p> : <>
        <div className="elective-fields"><label>Sista valdag<input type="date" value={closeDate} onChange={event => setCloseDate(event.target.value)}/></label>
          <p>Eleven väljer ett alternativ inom detta valområde. Flera delutrymmen kan erbjudas som egna valbara block.</p></div>
        <fieldset disabled={disabled}><legend>Elever som får välja</legend>{pupils.map(pupil => <label key={pupil.id} className="elective-check"><input type="checkbox" checked={pupilIds.includes(pupil.id)} onChange={event => setPupilIds(event.target.checked ? [...pupilIds, pupil.id] : pupilIds.filter(id => id !== pupil.id))}/>{pupil.name}</label>)}{pupils.length === 0 && <p>Inga elever finns i det aktuella klassurvalet.</p>}</fieldset>
        <Button disabled={disabled || data.policy.guardianConfirmation === null || !pupilIds.length || !closeDate} onClick={() => void onSend('open_round', { roundId: newId(), blockId: block.id, expectedBlockRevision: block.revision,
          opensAt: new Date().toISOString(), closesAt: lastValInstant(closeDate), minChoices, maxChoices, pupilIds })}>Öppna valomgång</Button>
      </>}
    </div></details>
    {rounds.map(round => <div className="elective-toolbar" key={round.id}><span>Valomgång · {round.status === 'open' ? 'Öppen' : 'Stängd'} · sista dag {round.closesAt.slice(0, 10)}</span>
      {round.status === 'open' && <Button variant="outline" disabled={disabled} onClick={() => void onSend('close_round', { roundId: round.id, expectedRoundRevision: round.revision })}>Stäng valomgång</Button>}</div>)}
    <ElectiveStaffChoice data={data} block={block} disabled={disabled} onSend={onSend}/>
    {choices.length > 0 && <section className="elective-card"><h3>Inlämnade elevval</h3>{choices.map(choice => <div className="elective-toolbar" key={choice.id}><div><strong>{data.pupils?.find(pupil => pupil.id === choice.pupilId)?.name ?? 'Elev'}</strong><p>{choice.selectedOptionIds.map(id => block.options.find(option => option.id === id)?.name ?? 'Ändrat alternativ').join(', ')}</p><small>{CHOICE_STATE[choice.state] ?? 'Ej bekräftat'}</small></div>
      {!choice.confirmedAt && <Button variant="outline" disabled={disabled || choice.state !== 'ready_for_confirmation'} onClick={() => void onSend('confirm_choice', { choiceId: choice.id, expectedChoiceRevision: choice.revision })}>Bekräfta elevens val</Button>}
      {choice.state === 'confirmed' && <ElectivePlacementForm key={`${choice.id}:${choice.revision}:${data.revision}`} data={data} block={block} choice={choice} disabled={disabled} onSend={onSend}/>}
    </div>)}</section>}
    <ElectivePlacementList data={data} block={block} disabled={disabled} onSend={onSend}/>
  </article>;
}
