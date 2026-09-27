'use client';

import { useCallback, useEffect, useRef, useState, type SyntheticEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { FUNCTION_LABEL, type AccessFunction } from '@/lib/access-rules.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from './mfa-step-up';

type Item = { id: string; unitId: string; label: string };
type Options = {
  functions: AccessFunction[];
  recipients: { membershipId: string; displayName: string }[];
  schools: { id: string; name: string }[];
  groups: Item[];
  pupils: Item[];
  cases: Item[];
  validFrom: string;
  validTo: string | null;
};
type Scope = 'school' | 'group' | 'pupil' | 'case';
type Draft = {
  fn: AccessFunction | '';
  recipient: string;
  scope: Scope;
  schoolIds: string[];
  groupIds: string[];
  groupKind: 'teaching' | 'mentor';
  pupilIds: string[];
  caseIds: string[];
  validFrom: string;
  validTo: string;
  supportMinutes: '15' | '30' | '60';
};
type Field = 'fn' | 'recipient' | 'scope' | 'selection' | 'validFrom' | 'validTo';
type Props = {
  open: boolean;
  epoch: number;
  onOpenChange: (open: boolean) => void;
  onGranted: (recipientName: string) => void;
  onMfaRequired: () => void;
  onSessionLost: () => void;
};

const scopeText: Record<Scope, string> = {
  school: 'Hela skolan',
  group: 'Tilldelade grupper',
  pupil: 'Tilldelade elever',
  case: 'Tilldelade ärenden',
};
const emptyDraft = (validFrom = ''): Draft => ({
  fn: '', recipient: '', scope: 'school', schoolIds: [], groupIds: [], groupKind: 'teaching',
  pupilIds: [], caseIds: [], validFrom, validTo: '', supportMinutes: '30',
});

function scopesFor(fn: AccessFunction | '', options: Options | null): Scope[] {
  if (fn === 'larare') return ['group'];
  if (fn === 'support') return ['pupil'];
  if (fn === 'elevhalsa') {
    return ['school', ...(options?.pupils.length ? ['pupil' as const] : []), ...(options?.cases.length ? ['case' as const] : [])];
  }
  return ['school'];
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

export default function MandateGrantDialog(props: Props) {
  const [options, setOptions] = useState<Options | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [mfaNeeded, setMfaNeeded] = useState(false);
  const [busy, setBusy] = useState(false);
  // Stängning spärras bara medan tilldelningen sparas; en pågående hämtning av
  // urvalet avbryts i stället när dialogen stängs.
  const [saving, setSaving] = useState(false);
  const generation = useRef(0);
  // Fokus flyttas till dialogen när den öppnas. Standardvalet (första fokuserbara
  // elementet) blev stängknappen, som döljs medan urvalet hämtas; då föll fokus
  // tillbaka till sidan bakom dialogen.
  const popup = useRef<HTMLDivElement>(null);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });
  const dirty = draft.fn !== '' || draft.recipient !== '' || draft.schoolIds.length > 0 || draft.groupIds.length > 0
    || draft.pupilIds.length > 0 || draft.caseIds.length > 0 || draft.validTo !== '';
  useUnsavedChanges(`mandate-grant-${props.epoch}`, props.open && dirty);

  const fail = useCallback((caught: unknown) => {
    if (caught instanceof DOMException && caught.name === 'AbortError') return;
    if (!(caught instanceof ApiError)) { setServerError('Tjänsten kunde inte nås. Dina uppgifter finns kvar; försök igen.'); return; }
    if (caught.status === 401) { callbacks.current.onSessionLost(); return; }
    if (caught.code === 'mfa_required') {
      // Verifieringen erbjuds i dialogen: sidan bakom är oåtkomlig så länge dialogen är öppen.
      callbacks.current.onMfaRequired();
      setServerError(null);
      setMfaNeeded(true);
      return;
    }
    const message = caught.code === 'audit_unavailable' ? 'Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.'
      : caught.code === 'context_changed' ? 'Uppdraget har ändrats. Ladda om arbetsytan.'
      : caught.status === 400 ? 'Tilldelningen godtogs inte. Kontrollera mottagare, omfattning och giltighet mot ditt eget uppdrag.'
      : caught.status === 403 ? 'Ditt aktuella uppdrag tillåter inte den här tilldelningen.'
      : caught.status === 404 ? 'Mottagaren eller urvalet finns inte längre i ditt uppdrag. Hämta urvalet igen.'
      : caught.status === 409 ? 'Uppgifterna har ändrats. Hämta urvalet igen innan du fortsätter.'
      : 'Tilldelningen kunde inte sparas. Försök igen.';
    setServerError(`${message}${caught.correlationId ? ` Referens: ${caught.correlationId}` : ''}`);
  }, []);

  const loadOptions = useCallback(async () => {
    const current = ++generation.current;
    setBusy(true); setServerError(null); setMfaNeeded(false);
    try {
      const loaded = await api.get<Options>('/api/kund/mandat/urval');
      if (current !== generation.current) return;
      setOptions(loaded);
      setDraft((previous) => ({
        ...previous,
        fn: previous.fn || (loaded.functions.length === 1 ? loaded.functions[0] : ''),
        validFrom: previous.validFrom || loaded.validFrom,
        schoolIds: previous.schoolIds.length === 0 && loaded.schools.length === 1 ? [loaded.schools[0].id] : previous.schoolIds,
      }));
    } catch (caught) { if (current === generation.current) fail(caught); }
    finally { if (current === generation.current) setBusy(false); }
  }, [fail]);

  useEffect(() => {
    if (!props.open) return undefined;
    queueMicrotask(() => void loadOptions());
    return () => { generation.current += 1; };
  }, [props.open, loadOptions]);

  const scopes = scopesFor(draft.fn, options);
  const scope = scopes.includes(draft.scope) ? draft.scope : scopes[0];
  const update = (patch: Partial<Draft>) => { setDraft((previous) => ({ ...previous, ...patch })); setServerError(null); setMfaNeeded(false); };
  const toggle = (key: 'schoolIds' | 'groupIds' | 'pupilIds' | 'caseIds', id: string, single = false) => {
    setDraft((previous) => ({
      ...previous,
      [key]: single ? [id] : previous[key].includes(id) ? previous[key].filter((value) => value !== id) : [...previous[key], id],
    }));
    setErrors((previous) => ({ ...previous, selection: undefined }));
  };

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    if (!draft.fn) found.fn = 'Välj vilket uppdrag som ska tilldelas.';
    if (!draft.recipient) found.recipient = 'Välj mottagare.';
    const selected = scope === 'school' ? draft.schoolIds : scope === 'group' ? draft.groupIds : scope === 'pupil' ? draft.pupilIds : draft.caseIds;
    if (selected.length === 0) found.selection = scope === 'school' ? 'Välj minst en skola.' : scope === 'group' ? 'Välj minst en grupp.' : scope === 'pupil' ? 'Välj elev.' : 'Välj minst ett ärende.';
    if (draft.fn === 'support' && draft.pupilIds.length !== 1) found.selection = 'Supportuppdrag gäller exakt en elev.';
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(draft.validFrom)) found.validFrom = 'Ange startdatum.';
    else if (options && draft.validFrom < options.validFrom) found.validFrom = `Uppdraget kan börja tidigast ${options.validFrom}.`;
    if (draft.fn !== 'support' && draft.validTo) {
      if (draft.validTo < draft.validFrom) found.validTo = 'Slutdatum kan inte vara före startdatum.';
      else if (options?.validTo && draft.validTo > options.validTo) found.validTo = `Uppdraget kan inte gälla längre än ditt eget (${options.validTo}).`;
    } else if (draft.fn !== 'support' && options?.validTo) found.validTo = `Ange slutdatum, senast ${options.validTo}.`;
    return found;
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || !options) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) { setServerError('Formuläret innehåller fel. Rätta de markerade fälten.'); return; }
    const unitsOf = (items: Item[], ids: string[]) => unique(items.filter((item) => ids.includes(item.id)).map((item) => item.unitId));
    const now = Date.now();
    const payload = {
      membershipId: draft.recipient,
      function: draft.fn,
      scopeKind: scope,
      unitIds: scope === 'school' ? draft.schoolIds
        : scope === 'group' ? unitsOf(options.groups, draft.groupIds)
        : scope === 'pupil' ? unitsOf(options.pupils, draft.pupilIds)
        : unitsOf(options.cases, draft.caseIds),
      groups: scope === 'group' ? draft.groupIds.map((id) => ({ id, kind: draft.groupKind })) : [],
      pupilIds: scope === 'pupil' ? draft.pupilIds : [],
      caseIds: scope === 'case' ? draft.caseIds : [],
      validFrom: draft.validFrom,
      validTo: draft.fn === 'support' ? null : draft.validTo || null,
      ...(draft.fn === 'support' ? {
        purposeCode: 'synthetic-troubleshooting',
        startsAt: new Date(now).toISOString(),
        endsAt: new Date(now + Number(draft.supportMinutes) * 60_000).toISOString(),
      } : {}),
    };
    const current = ++generation.current;
    setBusy(true); setSaving(true); setServerError(null); setMfaNeeded(false);
    try {
      await api.post<{ assignmentId: string }>(draft.fn === 'rektor' ? '/api/kund/rektor' : '/api/kund/mandat', payload);
      if (current !== generation.current) return;
      const name = options.recipients.find((recipient) => recipient.membershipId === draft.recipient)?.displayName ?? 'Mottagaren';
      setDraft(emptyDraft(options.validFrom)); setErrors({});
      callbacks.current.onGranted(name);
    } catch (caught) { if (current === generation.current) fail(caught); }
    finally { setSaving(false); if (current === generation.current) setBusy(false); }
  }

  const fieldError = (field: Field) => errors[field] ? <small id={`grant-${field}-error`} className="field-error">{errors[field]}</small> : null;
  const invalid = (field: Field) => errors[field] ? { 'aria-invalid': true, 'aria-describedby': `grant-${field}-error` } as const : {};
  const items = scope === 'group' ? options?.groups ?? [] : scope === 'pupil' ? options?.pupils ?? [] : scope === 'case' ? options?.cases ?? [] : [];
  const itemKey = scope === 'group' ? 'groupIds' : scope === 'pupil' ? 'pupilIds' : 'caseIds';
  const schoolName = (unitId: string) => options?.schools.find((school) => school.id === unitId)?.name ?? '';

  return (
    <Dialog open={props.open} onOpenChange={(open) => { if (!saving) props.onOpenChange(open); }}>
      <DialogContent ref={popup} initialFocus={popup} className="mandate-dialog mandate-grant-dialog" showCloseButton={!saving}>
        <DialogTitle>Tilldela uppdrag</DialogTitle>
        <DialogDescription>Mottagare, skolor och urval kommer från ditt aktuella uppdrag. Servern prövar tilldelningen igen när du sparar.</DialogDescription>
        {serverError && <output role="alert" className="validation-warning">{serverError}</output>}
        {mfaNeeded && <MfaStepUpNotice message="Tilldelning kräver verifiering med engångskod." detail="Efter verifieringen kommer du tillbaka till arbetsytan och gör tilldelningen igen; det du fyllt i här sparas inte." />}
        {!options && busy && <output>Hämtar tillåtet urval…</output>}
        {options && <form className="protected-form mandate-grant-form" noValidate onSubmit={(event) => void submit(event)}>
          <label>Uppdrag
            <select value={draft.fn} disabled={busy} {...invalid('fn')} onChange={(event) => { update({ fn: event.target.value as AccessFunction, scope: scopesFor(event.target.value as AccessFunction, options)[0], groupIds: [], pupilIds: [], caseIds: [] }); setErrors((previous) => ({ ...previous, fn: undefined })); }}>
              <option value="">Välj uppdrag</option>
              {options.functions.map((fn) => <option key={fn} value={fn}>{FUNCTION_LABEL[fn]}</option>)}
            </select>{fieldError('fn')}
          </label>
          <label>Mottagare
            <select value={draft.recipient} disabled={busy} {...invalid('recipient')} onChange={(event) => { update({ recipient: event.target.value }); setErrors((previous) => ({ ...previous, recipient: undefined })); }}>
              <option value="">Välj mottagare</option>
              {options.recipients.map((recipient) => <option key={recipient.membershipId} value={recipient.membershipId}>{recipient.displayName}</option>)}
            </select>{fieldError('recipient')}
            {options.recipients.length === 0 && <small>Det finns ingen annan aktiv personal hos kunden att tilldela.</small>}
          </label>
          <label>Omfattning
            <select value={scope} disabled={busy || scopes.length < 2} onChange={(event) => update({ scope: event.target.value as Scope })}>
              {scopes.map((value) => <option key={value} value={value}>{scopeText[value]}</option>)}
            </select>
          </label>
          <fieldset className="mandate-choice" aria-describedby={errors.selection ? 'grant-selection-error' : undefined}>
            <legend>{scope === 'school' ? 'Skolor' : scope === 'group' ? 'Grupper' : scope === 'pupil' ? 'Elever (syntetiska)' : 'Ärenden (syntetiska)'}</legend>
            {scope === 'school' && options.schools.map((school) => <label key={school.id} className="mandate-check"><input type="checkbox" checked={draft.schoolIds.includes(school.id)} disabled={busy} onChange={() => toggle('schoolIds', school.id)} />{school.name}</label>)}
            {scope !== 'school' && items.map((item) => <label key={item.id} className="mandate-check"><input type={draft.fn === 'support' ? 'radio' : 'checkbox'} name={`grant-${scope}`} checked={draft[itemKey].includes(item.id)} disabled={busy} onChange={() => toggle(itemKey, item.id, draft.fn === 'support')} />{item.label}{scope === 'pupil' && <small> · {schoolName(item.unitId)}</small>}</label>)}
            {scope !== 'school' && items.length === 0 && <p>Det finns inget sådant urval i ditt uppdrag.</p>}
            {fieldError('selection')}
          </fieldset>
          {scope === 'group' && <label>Grupproll
            <select value={draft.groupKind} disabled={busy} onChange={(event) => update({ groupKind: event.target.value as Draft['groupKind'] })}>
              <option value="teaching">Undervisning</option><option value="mentor">Mentor</option>
            </select>
          </label>}
          {draft.fn === 'support' ? <>
            <label>Varaktighet från nu
              <select value={draft.supportMinutes} disabled={busy} onChange={(event) => update({ supportMinutes: event.target.value as Draft['supportMinutes'] })}>
                <option value="15">15 minuter</option><option value="30">30 minuter</option><option value="60">60 minuter</option>
              </select>
              <small>Syfte: syntetisk felsökning. Du godkänner uppdraget; det upphör automatiskt.</small>
            </label>
          </> : <>
            <label>Gäller från
              <input type="date" value={draft.validFrom} min={options.validFrom} max={options.validTo ?? undefined} disabled={busy} {...invalid('validFrom')} onChange={(event) => { update({ validFrom: event.target.value }); setErrors((previous) => ({ ...previous, validFrom: undefined })); }} />{fieldError('validFrom')}
            </label>
            <label>Gäller till{options.validTo ? '' : ' (valfritt)'}
              <input type="date" value={draft.validTo} min={draft.validFrom || options.validFrom} max={options.validTo ?? undefined} disabled={busy} {...invalid('validTo')} onChange={(event) => { update({ validTo: event.target.value }); setErrors((previous) => ({ ...previous, validTo: undefined })); }} />{fieldError('validTo')}
            </label>
          </>}
          <div className="mandate-actions">
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Avbryt</DialogClose>
            <Button type="submit" disabled={busy}>Tilldela uppdraget</Button>
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  );
}
