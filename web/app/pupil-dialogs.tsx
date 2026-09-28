'use client';

import { useEffect, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import {
  csvDataRowCount, DEFAULT_EXPORT_FIELDS, EXPORT_FIELDS, exportPost, groupPlacements, protectedExportChoice, isValidDate, luhnOk, maskedPersonalNumber, resolvedBasics,
  type BasicsChange, type ChangeRequest, type ConflictChoice, type ConflictChoiceField, type ConflictDetails, type ExportDraft,
  type ExportField, type ExportPreview, type FieldOrigin, type NamedOption, type Placement, type PupilCard, type RegisterOptions, type Selection,
} from '@/lib/pupil-register-model.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { useUnsavedChanges } from '@/lib/unsaved-changes.tsx';
import MfaStepUpNotice from './mfa-step-up';

/* ---------- Gemensamma texter och format ---------- */

const stockholmTime = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
});
const stockholmDate = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm', year: 'numeric', month: '2-digit', day: '2-digit' });

/** ÅÅÅÅ-MM-DD tt:mm i svensk tid. */
export function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isFinite(date.getTime()) ? stockholmTime.format(date).replace(',', '') : '';
}
/** Dagens datum i svensk tid ur serverns tidsstämpel. */
export function stockholmToday(iso: string): string {
  const date = new Date(iso);
  return stockholmDate.format(Number.isFinite(date.getTime()) ? date : new Date());
}
export function periodText(startsOn: string, endsOn: string | null): string {
  return `${startsOn} – ${endsOn ?? 'tills vidare'}`;
}
function addDays(date: string, days: number): string {
  const value = new Date(`${date}T12:00:00Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}
const sourceNames: Record<FieldOrigin['source'], string> = {
  manual: 'manuell i appen', simulated: 'simulerad källa (syntetisk)', ss12000: 'SS12000-källa', spar: 'SPAR',
};
export function sourceName(origin: FieldOrigin): string {
  return sourceNames[origin.source];
}
/** Ursprungsrad. Aktörens namn ingår inte i serverns svar och visas därför inte. */
export function originText(origin: FieldOrigin): string {
  const when = formatTime(origin.changedAt);
  const base = origin.source === 'manual' ? `Källa: manuell i appen · ${when}` : `Källa: ${sourceName(origin)} · levererad ${when}`;
  return origin.localCorrection ? `${base} · lokal rättelse` : base;
}
/** Registerägd uppgift: källan äger fältet och det finns ingen lokal rättelse. */
export function sourceOwned(origin: FieldOrigin | undefined): boolean {
  return origin !== undefined && origin.source !== 'manual' && !origin.localCorrection;
}
export const fieldLabels: Record<string, string> = {
  displayName: 'Namn', personalNumber: 'Personnummer', protectedIdentity: 'Skyddade personuppgifter', municipality: 'Hemkommun',
  municipalityCode: 'Hemkommun', placement: 'Skolplacering', education: 'Utbildning', class: 'Klass', classId: 'Klass',
  unitId: 'Skola', educationId: 'Utbildning', startsOn: 'Startdatum', endsOn: 'Slutdatum',
};
export function valueText(value: string | boolean | null): string {
  if (value === null) return 'Uppgift saknas';
  if (typeof value === 'boolean') return value ? 'Ja' : 'Nej';
  return value;
}
const withReference = (text: string, caught: ApiError) => caught.correlationId ? `${text} Referens: ${caught.correlationId}` : text;

export type Failure = { kind: 'session' } | { kind: 'mfa' } | { kind: 'conflict'; details: ConflictDetails | null } | { kind: 'message'; text: string; status: number | null };
/** Gemensam tolkning av serverfel. Tekniska koder och SQL-fel visas aldrig. */
export function failure(caught: unknown, action: 'change' | 'export' | 'read', keepInput = false): Failure | null {
  if (caught instanceof DOMException && caught.name === 'AbortError') return null;
  const kept = keepInput ? ' Dina uppgifter finns kvar i formuläret.' : '';
  if (!(caught instanceof ApiError)) return { kind: 'message', text: `Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen.${kept}`, status: null };
  if (caught.status === 401) return { kind: 'session' };
  if (caught.code === 'mfa_required') return { kind: 'mfa' };
  if (caught.code === 'conflict' && caught.status === 409) return { kind: 'conflict', details: caught.details };
  const text = caught.code === 'audit_unavailable' ? `Åtgärden kunde inte slutföras eftersom säkerhetsloggen inte är tillgänglig.${kept}`
    : caught.code === 'context_changed' ? 'Uppdraget har ändrats. Ladda om arbetsytan.'
    : caught.status === 404 ? 'Eleven finns inte eller ingår inte i ditt uppdrag.'
    : caught.status === 403 ? action === 'export' ? 'Ditt aktuella uppdrag tillåter inte export av elevuppgifter.' : action === 'change' ? 'Ditt aktuella uppdrag tillåter inte ändringen.' : 'Ditt aktuella uppdrag tillåter inte att läsa elever. Uppdraget kan ha upphört.'
    : caught.status === 400 ? action === 'export' ? 'Exporten godtogs inte. Kontrollera urvalet och försök igen.' : `Ändringen godtogs inte. Kontrollera uppgifterna och försök igen.${kept}`
    : `Åtgärden kunde inte slutföras. Försök igen.${kept}`;
  return { kind: 'message', text: withReference(text, caught), status: caught.status };
}

export function Warning({ children, id, focusRef }: { children: ReactNode; id?: string; focusRef?: React.Ref<HTMLDivElement> }) {
  return <div role="alert" id={id} ref={focusRef} tabIndex={focusRef ? -1 : undefined} className="validation-warning pupil-warning"><AlertTriangle size={16} aria-hidden="true" /><div>{children}</div></div>;
}

/* ---------- Ändringsdialoger ---------- */

export type ChangeKind = 'basics' | 'municipality' | 'transfer' | 'education' | 'end-placement' | 'class';
type Field = 'displayName' | 'personalNumber' | 'municipalityCode' | 'unitId' | 'educationId' | 'classId' | 'startsOn' | 'endsOn';
type Values = Record<Field, string>;
type ChoiceItem = { field: ConflictChoiceField; label: string; mine: string; saved: string };
type ConflictState = { details: ConflictDetails; submitted: BasicsChange; items: ChoiceItem[]; again: boolean };

export type ChangeDialogProps = {
  kind: ChangeKind | null;
  card: PupilCard;
  schoolYear: number;
  caseId: string | null;
  today: string;
  options: RegisterOptions | null;
  schools: NamedOption[];
  returnTo: string;
  epoch: number;
  /** Läser om elevkortet utan att skriva. Null betyder att läsningen misslyckades. */
  refresh: () => Promise<PupilCard | null>;
  loadUnitOptions: (unitId: string) => Promise<RegisterOptions>;
  onClose: (reload: boolean) => void;
  onSaved: (message: string) => void;
  onSessionLost: () => void;
};

const titles: Record<ChangeKind, string> = {
  basics: 'Ändra basuppgifter', municipality: 'Registrera ny hemkommun', transfer: 'Registrera skolbyte',
  education: 'Byt utbildning', 'end-placement': 'Avsluta placeringen?', class: 'Byt klass',
};
const submitLabels: Record<ChangeKind, string> = {
  basics: 'Spara ändringarna', municipality: 'Spara hemkommunen', transfer: 'Spara skolbytet',
  education: 'Spara utbildningsbytet', 'end-placement': 'Avsluta placeringen', class: 'Spara klassbytet',
};
const periodWords = { placement: 'placeringar', class: 'klasstillhörighet', municipality: 'hemkommun' } as const;

/** Placeringen som ändringen gäller: aktuell, annars närmast framtida. */
export function targetPlacement(card: PupilCard, today: string): Placement | null {
  const groups = groupPlacements(card.placements, today);
  return groups.aktuell[0] ?? groups.framtida[0] ?? null;
}
function currentClassOf(card: PupilCard, placement: Placement | null, today: string) {
  if (!placement) return null;
  return card.classes.filter(item => item.placementId === placement.id && item.startsOn <= today && (item.endsOn === null || item.endsOn >= today))[0] ?? null;
}
/** Tar emot ÅÅÅÅMMDD-NNNN eller TEST-ÅÅÅÅMMDD-NNNN och ger provmiljöns form. */
function normalizePersonalNumber(input: string): string | null {
  const match = /^(?:TEST-)?(\d{4})(\d{2})(\d{2})-(\d{4})$/u.exec(input.trim());
  if (!match) return null;
  if (!isValidDate(`${match[1]}-${match[2]}-${match[3]}`) || !luhnOk(`${match[1].slice(2)}${match[2]}${match[3]}${match[4]}`)) return null;
  return `TEST-${match[1]}${match[2]}${match[3]}-${match[4]}`;
}
const maskedInput = (value: string) => `${value.slice(5, 13)}-••••`;

function initialValues(kind: ChangeKind | null, card: PupilCard, today: string): Values {
  return {
    displayName: kind === 'basics' ? card.displayName : '', personalNumber: '', municipalityCode: '', unitId: '',
    educationId: '', classId: '', startsOn: kind === 'end-placement' ? '' : today, endsOn: '',
  };
}

export function PupilChangeDialog(props: ChangeDialogProps) {
  const { kind } = props;
  // Kortet när dialogen öppnades. Omläsningar under dialogen ändrar inte utgångsläget
  // för inmatningen; de jämförs mot det för att upptäcka andras ändringar.
  const [original] = useState(props.card);
  const [base, setBase] = useState(props.card);
  const [values, setValues] = useState<Values>(() => initialValues(kind, props.card, props.today));
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [summary, setSummary] = useState<string | null>(null);
  const [mfa, setMfa] = useState(false);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [conflict, setConflict] = useState<ConflictState | null>(null);
  const [choices, setChoices] = useState<Partial<Record<ConflictChoiceField, ConflictChoice>>>({});
  const [period, setPeriod] = useState<Extract<ConflictDetails, { kind: 'period' }> | null>(null);
  const [unitOptions, setUnitOptions] = useState<RegisterOptions | null>(null);
  const popup = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const conflictHeading = useRef<HTMLHeadingElement>(null);
  const keep = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });

  const initial = initialValues(kind, original, props.today);
  const dirty = kind !== null && (Object.keys(values) as Field[]).some(key => values[key] !== initial[key]);
  useUnsavedChanges(`pupil-change-${props.epoch}`, kind !== null && (dirty || conflict !== null));

  const placement = targetPlacement(base, props.today);
  const currentClass = currentClassOf(base, placement, props.today);
  const educations = (props.options?.educations ?? []).filter(item => item.unitId === base.unitId);
  const classes = (props.options?.classes ?? []).filter(item => item.unitId === base.unitId);
  const educationName = (id: string | null | undefined) => educations.find(item => item.id === id)?.name ?? (id === base.educationId ? base.educationName : 'Utbildningens namn saknas');
  const className = (id: string | null | undefined) => classes.find(item => item.id === id)?.name ?? (id === base.classId ? base.className ?? 'Ingen klass' : 'Klassens namn saknas');
  const otherSchools = props.schools.filter(school => school.id !== base.unitId);
  const origins = 'origins' in base && base.origins ? base.origins : {};
  const nameEditable = !sourceOwned(origins.displayName);
  const numberEditable = !sourceOwned(origins.personalNumber) && 'protectedIdentity' in base && base.protectedIdentity !== undefined;

  // Utbud på vald ny skola hämtas från serverns referensurval för den skolan.
  useEffect(() => {
    if (kind !== 'transfer' || !values.unitId) return;
    let active = true;
    queueMicrotask(() => { if (active) setUnitOptions(null); });
    callbacks.current.loadUnitOptions(values.unitId).then(loaded => { if (active) setUnitOptions(loaded); }).catch(caught => {
      if (!active) return;
      const result = failure(caught, 'read');
      if (result?.kind === 'session') callbacks.current.onSessionLost();
      else if (result?.kind === 'message') setSummary(result.text);
    });
    return () => { active = false; };
  }, [kind, values.unitId]);

  // Fokus flyttas efter commit, så att WebKit inte hinner köra fokus före renderingen.
  useEffect(() => { if (conflict || period) conflictHeading.current?.focus(); }, [conflict, period]);
  useEffect(() => { if (summary) summaryRef.current?.focus(); }, [summary]);

  const update = (field: Field, value: string) => {
    setValues(previous => ({ ...previous, [field]: value }));
    setErrors(previous => ({ ...previous, [field]: undefined }));
    setMfa(false);
  };

  function validate(): Partial<Record<Field, string>> {
    const found: Partial<Record<Field, string>> = {};
    const needDate = (field: 'startsOn' | 'endsOn') => { if (!isValidDate(values[field])) found[field] = 'Ange datum.'; };
    if (kind === 'basics') {
      if (nameEditable && !values.displayName.trim()) found.displayName = 'Ange namn.';
      if (values.personalNumber.trim()) {
        if (!normalizePersonalNumber(values.personalNumber)) found.personalNumber = 'Ange personnummer som ÅÅÅÅMMDD-NNNN.';
      }
    } else if (kind === 'municipality') {
      if (!/^\d{4}$/u.test(values.municipalityCode.trim())) found.municipalityCode = 'Ange kommunkod med fyra siffror.';
      needDate('startsOn');
    } else if (kind === 'transfer') {
      if (!values.unitId) found.unitId = 'Välj skola.';
      if (!values.educationId) found.educationId = 'Välj utbildning.';
      needDate('startsOn');
      if (!found.startsOn && placement && (values.startsOn <= placement.startsOn || (placement.endsOn !== null && values.startsOn > placement.endsOn))) found.startsOn = `Datumet ligger utanför elevens placering (${periodText(placement.startsOn, placement.endsOn)}).`;
    } else if (kind === 'education') {
      if (!values.educationId) found.educationId = 'Välj utbildning.';
      needDate('startsOn');
      if (!found.startsOn && placement && (values.startsOn <= placement.startsOn || (placement.endsOn !== null && values.startsOn > placement.endsOn))) found.startsOn = `Datumet ligger utanför elevens placering (${periodText(placement.startsOn, placement.endsOn)}).`;
    } else if (kind === 'end-placement') {
      needDate('endsOn');
      if (!found.endsOn && placement && values.endsOn < placement.startsOn) found.endsOn = `Slutdatum kan inte vara före startdatum (${placement.startsOn}).`;
      else if (!found.endsOn && placement?.endsOn && values.endsOn > placement.endsOn) found.endsOn = `Datumet ligger utanför elevens placering (${periodText(placement.startsOn, placement.endsOn)}).`;
    } else if (kind === 'class') {
      if (!values.classId) found.classId = 'Välj klass.';
      needDate('startsOn');
      if (!found.startsOn && placement && (values.startsOn < placement.startsOn || (placement.endsOn !== null && values.startsOn > placement.endsOn))) found.startsOn = `Datumet ligger utanför elevens placering (${periodText(placement.startsOn, placement.endsOn)}).`;
      else if (!found.startsOn && currentClass && values.startsOn <= currentClass.startsOn) found.startsOn = `Klassbytet kan gälla tidigast ${addDays(currentClass.startsOn, 1)}.`;
    }
    return found;
  }

  function buildRequest(): ChangeRequest | 'unchanged' | null {
    const common = { pupilId: base.id, schoolYear: props.schoolYear, caseId: props.caseId, expectedVersion: base.version };
    if (kind === 'basics') {
      const payload: BasicsChange = {};
      if (nameEditable && values.displayName.trim() !== base.displayName) payload.displayName = values.displayName.trim();
      const number = values.personalNumber.trim() ? normalizePersonalNumber(values.personalNumber) : null;
      if (number && numberEditable) payload.personalNumber = number;
      return Object.keys(payload).length === 0 ? 'unchanged' : { ...common, kind: 'basics', payload };
    }
    if (kind === 'municipality') return { ...common, kind, payload: { municipalityCode: values.municipalityCode.trim(), startsOn: values.startsOn, endsOn: null } };
    if (!placement) return null;
    if (kind === 'transfer') return { ...common, kind, payload: { placementId: placement.id, unitId: values.unitId, educationId: values.educationId, startsOn: values.startsOn, endsOn: null } };
    if (kind === 'education') return { ...common, kind, payload: { placementId: placement.id, educationId: values.educationId, startsOn: values.startsOn } };
    if (kind === 'end-placement') return { ...common, kind, payload: { placementId: placement.id, endsOn: values.endsOn } };
    if (kind === 'class') return { ...common, kind, payload: { placementId: placement.id, classId: values.classId, startsOn: values.startsOn, endsOn: placement.endsOn } };
    return null;
  }

  function confirmation(request: ChangeRequest, warnings: string[]): string {
    const schoolName = (id: string) => props.schools.find(school => school.id === id)?.name ?? base.unitName;
    switch (request.kind) {
      case 'basics': return 'Elevens uppgifter är sparade.';
      case 'municipality': return `Hemkommunen ${request.payload.municipalityCode} gäller från ${request.payload.startsOn}.`;
      case 'transfer': return `${base.displayName} är placerad på ${schoolName(request.payload.unitId)} från ${request.payload.startsOn}.`;
      case 'education': {
        const name = educations.find(item => item.id === request.payload.educationId)?.name ?? 'den valda utbildningen';
        const warning = warnings.includes('class-education-mismatch') ? ' Klassen hör till en annan utbildning; byt klass separat om det är beslutat.' : '';
        return `Utbildningen är ${name} från ${request.payload.startsOn}. Klassen är oförändrad.${warning}`;
      }
      case 'end-placement': return `Placeringen på ${base.unitName} gäller till och med ${request.payload.endsOn}. Den finns kvar i historiken.`;
      case 'class': return `${base.displayName} tillhör ${className(request.payload.classId)} från ${request.payload.startsOn}. Den tidigare klasstillhörigheten finns kvar i historiken.`;
      default: return 'Ändringen är sparad.';
    }
  }

  async function conflictItems(details: ConflictDetails, submitted: BasicsChange): Promise<ChoiceItem[] | null> {
    if (details.kind === 'fields') {
      return details.fields.filter(item => item.field === 'displayName' || item.field === 'protectedIdentity').map(item => ({
        field: item.field as ConflictChoiceField, label: fieldLabels[item.field], mine: valueText(item.submitted), saved: valueText(item.current),
      }));
    }
    if (details.kind !== 'identity') return null;
    // Servern anger bara att personnumret ändrats. Övriga inskickade uppgifter
    // jämförs mot ett nyläst kort så att inget annat värde skrivs över tyst.
    const fresh = await callbacks.current.refresh();
    if (!fresh) return null;
    const items: ChoiceItem[] = [];
    if (submitted.personalNumber) items.push({ field: 'personalNumber', label: 'Personnummer', mine: maskedInput(submitted.personalNumber), saved: 'birthDate' in fresh && fresh.birthDate ? `${maskedPersonalNumber(fresh.birthDate)} (det sparade numret)` : 'Det sparade numret' });
    if (submitted.displayName !== undefined && fresh.displayName !== original.displayName) items.push({ field: 'displayName', label: 'Namn', mine: submitted.displayName, saved: fresh.displayName });
    setBase(fresh);
    return items;
  }

  async function send(request: ChangeRequest, submittedBasics: BasicsChange | null, again: boolean) {
    const current = ++generation.current;
    setSaving(true); setSummary(null); setMfa(false);
    try {
      const saved = await api.post<{ pupilId: string; version: number; warnings: string[] }>('/api/elever/andra', request);
      if (current !== generation.current) return;
      setConflict(null); setPeriod(null);
      callbacks.current.onSaved(confirmation(request, saved.warnings ?? []));
    } catch (caught) {
      if (current !== generation.current) return;
      const result = failure(caught, 'change', true);
      if (!result) return;
      if (result.kind === 'session') { callbacks.current.onSessionLost(); return; }
      if (result.kind === 'mfa') { setMfa(true); return; }
      if (result.kind === 'conflict') {
        const details = result.details;
        if (!details) { setSummary('Eleven har ändrats av någon annan. Hämta aktuellt läge och gör om ändringen.'); return; }
        if (details.kind === 'period') {
          if (details.currentVersion === request.expectedVersion) {
            // Ingen samtidig ändring: det inskickade datumet krockar med befintliga perioder.
            setPeriod(null);
            const date = 'startsOn' in request.payload ? String(request.payload.startsOn) : 'endsOn' in request.payload ? String(request.payload.endsOn) : '';
            setSummary(details.reason === 'outside-placement' && placement ? `Datumet ligger utanför elevens placering (${periodText(placement.startsOn, placement.endsOn)}).`
              : details.period === 'placement' ? `Eleven har redan en placering ${date}. En elev kan bara ha en aktiv placering per dag.`
              : `Eleven har redan en ${details.period === 'class' ? 'klasstillhörighet' : 'hemkommun'} ${date} som krockar med ändringen.`);
          } else setPeriod(details);
          return;
        }
        const submitted = submittedBasics ?? {};
        setSaving(false); setRefreshing(true);
        const items = await conflictItems(details, submitted);
        setRefreshing(false);
        if (current !== generation.current) return;
        if (!items) { setSummary('Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen. Dina uppgifter finns kvar i formuläret.'); return; }
        setChoices({});
        setConflict({ details, submitted, items, again });
        return;
      }
      setSummary(result.text);
     
    } finally {
      if (current === generation.current) setSaving(false);
    }
  }

  async function submit(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !kind) return;
    const found = validate();
    setErrors(found);
    if (Object.keys(found).length > 0) {
      setSummary('Formuläret innehåller fel. Rätta de markerade fälten.');
     
      return;
    }
    const request = buildRequest();
    if (request === 'unchanged') { setSummary('Du har inte ändrat någon uppgift.'); return; }
    if (!request) { setSummary('Eleven har ingen aktuell eller framtida placering att ändra.'); return; }
    await send(request, request.kind === 'basics' ? request.payload : null, false);
  }

  async function saveChoices() {
    if (!conflict || saving) return;
    const payload = resolvedBasics(conflict.submitted, conflict.items.map(item => item.field), choices);
    if (Object.keys(payload).length === 0) {
      // Det sparade värdet gäller för alla uppgifter: inget ska skrivas.
      callbacks.current.onClose(true);
      return;
    }
    const request: ChangeRequest = { pupilId: base.id, schoolYear: props.schoolYear, caseId: props.caseId, expectedVersion: conflict.details.currentVersion, kind: 'basics', payload };
    await send(request, conflict.submitted, true);
  }

  async function reloadAfterPeriod() {
    setRefreshing(true); setSummary(null);
    const fresh = await callbacks.current.refresh();
    setRefreshing(false);
    if (!fresh) { setSummary('Tjänsten kunde inte nås. Kontrollera anslutningen och försök igen. Dina uppgifter finns kvar i formuläret.'); return; }
    setBase(fresh); setPeriod(null);
    // Inmatningen behålls där den fortfarande är giltig mot det nya läget.
    setValues(previous => ({
      ...previous,
      classId: classes.some(item => item.id === previous.classId) ? previous.classId : '',
      educationId: previous.educationId,
    }));
    popup.current?.focus();
  }

  const close = (reload: boolean) => { if (!saving) { generation.current += 1; callbacks.current.onClose(reload); } };
  // Etikett, hjälptext och fältfel ligger utanför kontrollen; fältfel och hjälptext
  // kopplas med aria-describedby så att det tillgängliga namnet bara är etiketten.
  const control = (field: Field, help = false) => {
    const described = [help ? `pupil-${field}-help` : '', errors[field] ? `pupil-${field}-error` : ''].filter(Boolean).join(' ');
    return { id: `pupil-${field}`, ...(errors[field] ? { 'aria-invalid': true as const } : {}), ...(described ? { 'aria-describedby': described } : {}) };
  };
  const box = (field: Field, label: string, input: ReactNode, help?: string) => <div className="pupil-field">
    <label htmlFor={`pupil-${field}`}>{label}</label>{input}
    {help && <small id={`pupil-${field}-help`}>{help}</small>}
    {errors[field] && <small id={`pupil-${field}-error`} className="field-error">{errors[field]}</small>}
  </div>;
  const busy = saving || refreshing;
  const selectedClass = classes.find(item => item.id === values.classId);
  const classWarning = kind === 'class' && selectedClass && placement && selectedClass.educationId !== null && selectedClass.educationId !== placement.educationId
    ? `Klassen ${selectedClass.name} hör till utbildningen ${educationName(selectedClass.educationId)}. Elevens utbildning är ${educationName(placement.educationId)} och ändras inte av klassbytet. Byt utbildning separat om det är beslutat.` : null;
  const transferEducations = (unitOptions?.educations ?? []).filter(item => item.unitId === values.unitId);
  const otherFields = conflict ? Object.keys(conflict.submitted).filter(key => !conflict.items.some(item => item.field === key)).map(key => fieldLabels[key]) : [];

  if (!kind) return null;
  const description = kind === 'basics' ? 'Nytt personnummer fylls bara i när numret ska ändras. Tomt fält lämnar personnumret oförändrat. Status följer skolplaceringen.'
    : kind === 'municipality' ? 'Den tidigare hemkommunen avslutas dagen före det nya datumet.'
    : kind === 'transfer' ? 'Nuvarande placering avslutas dagen före startdatumet. Avslut och ny placering sparas tillsammans eller inte alls.'
    : kind === 'education' ? 'Utbildningen byts från datumet. Klasstillhörigheten ändras inte.'
    : kind === 'end-placement' ? `${base.displayName} är placerad på ${base.unitName} till och med det datum du anger. Placeringen finns kvar i historiken. Efter slutdatumet visas eleven inte i listan för den skolan.`
    : 'Den nuvarande klasstillhörigheten avslutas dagen före det nya datumet och finns kvar i historiken. Utbildningen ändras inte.';

  return (
    <Dialog open onOpenChange={open => { if (!open) close(conflict !== null); }}>
      <DialogContent ref={popup} initialFocus={kind === 'end-placement' ? keep : popup} className="mandate-dialog pupil-register-dialog sm:max-w-xl" showCloseButton={!saving}>
        <DialogTitle>{conflict ? 'Eleven har ändrats av någon annan' : titles[kind]}</DialogTitle>
        <DialogDescription>{conflict ? `${conflict.details.changedBy} sparade en ändring ${formatTime(conflict.details.changedAt)}. Inget av det du fyllt i har sparats. Välj för varje uppgift vilket värde som ska gälla.` : description}</DialogDescription>
        {summary && <Warning focusRef={summaryRef}>{summary}</Warning>}
        {mfa && <MfaStepUpNotice className="pupil-warning" returnTo={props.returnTo} message="Att ändra elevuppgifter kräver verifiering med engångskod." detail="Efter verifieringen kommer du tillbaka till elevlistan och gör ändringen igen. Det du fyllt i här sparas inte." />}
        {refreshing && <output>Hämtar aktuellt läge…</output>}
        {conflict ? <form className="protected-form pupil-dialog-form" noValidate onSubmit={event => { event.preventDefault(); void saveChoices(); }}>
          <h3 ref={conflictHeading} tabIndex={-1}>{conflict.again ? `Eleven har ändrats igen, av ${conflict.details.changedBy} ${formatTime(conflict.details.changedAt)}. Välj på nytt.` : 'Välj värde per uppgift'}</h3>
          {conflict.items.map(item => <fieldset key={item.field} className="mandate-choice">
            <legend>{item.label}</legend>
            <label className="mandate-check"><input type="radio" name={`conflict-${item.field}`} checked={choices[item.field] === 'mine'} disabled={busy} onChange={() => setChoices(previous => ({ ...previous, [item.field]: 'mine' }))} />Ditt värde: {item.mine}</label>
            <label className="mandate-check"><input type="radio" name={`conflict-${item.field}`} checked={choices[item.field] !== 'mine'} disabled={busy} onChange={() => setChoices(previous => ({ ...previous, [item.field]: 'saved' }))} />Sparat värde: {item.saved}</label>
          </fieldset>)}
          {otherFields.length > 0 && <p>Dina övriga ändringar sparas som du fyllde i dem: {otherFields.join(', ')}.</p>}
          <div className="mandate-actions">
            <Button type="submit" disabled={busy}>{saving ? 'Sparar…' : 'Spara valda värden'}</Button>
            <Button type="button" variant="outline" disabled={saving} onClick={() => close(true)}>Stäng utan att spara</Button>
          </div>
        </form> : <form className="protected-form pupil-dialog-form" noValidate onSubmit={event => void submit(event)} aria-busy={busy}>
          {period && <Warning><h3 ref={conflictHeading} tabIndex={-1}>{period.changedBy} ändrade elevens {periodWords[period.period]} {formatTime(period.changedAt)}. Din ändring har inte sparats. Hämta aktuellt läge och gör om ändringen.</h3>
            <Button type="button" variant="outline" disabled={busy} onClick={() => void reloadAfterPeriod()}>{refreshing ? 'Hämtar…' : 'Hämta aktuellt läge'}</Button></Warning>}
          {kind === 'basics' && <>
            {nameEditable ? box('displayName', 'Namn', <input type="text" autoComplete="off" spellCheck={false} maxLength={240} value={values.displayName} disabled={busy} {...control('displayName')} onChange={event => update('displayName', event.target.value)} />)
              : <p>Uppgiften ägs av {sourceName(origins.displayName!)}. Rätta den där; ändringen syns här efter nästa leverans.</p>}
            {numberEditable && box('personalNumber', 'Nytt personnummer (tomt = oförändrat)', <input type="text" inputMode="numeric" autoComplete="off" spellCheck={false} maxLength={18} value={values.personalNumber} disabled={busy} {...control('personalNumber', true)} onChange={event => update('personalNumber', event.target.value)} />, 'ÅÅÅÅMMDD-NNNN. I provmiljön används bara syntetiska testpersonnummer.')}
          </>}
          {kind === 'municipality' && <>
            {box('municipalityCode', 'Kommunkod', <input type="text" inputMode="numeric" autoComplete="off" maxLength={4} value={values.municipalityCode} disabled={busy} {...control('municipalityCode', true)} onChange={event => update('municipalityCode', event.target.value)} />, 'Fyra siffror, till exempel 0180.')}
            {box('startsOn', 'Gäller från', <input type="date" value={values.startsOn} disabled={busy} {...control('startsOn')} onChange={event => update('startsOn', event.target.value)} />)}
          </>}
          {kind === 'transfer' && <>
            {box('unitId', 'Ny skola', <select value={values.unitId} disabled={busy} {...control('unitId')} onChange={event => { update('unitId', event.target.value); update('educationId', ''); }}><option value="">Välj skola</option>{otherSchools.map(school => <option key={school.id} value={school.id}>{school.name}</option>)}</select>)}
            {box('educationId', 'Utbildning', <select value={values.educationId} disabled={busy || !values.unitId || !unitOptions} {...control('educationId')} onChange={event => update('educationId', event.target.value)}><option value="">{values.unitId && !unitOptions ? 'Hämtar utbud…' : 'Välj utbildning'}</option>{transferEducations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>)}
            {box('startsOn', 'Startdatum', <input type="date" value={values.startsOn} disabled={busy} {...control('startsOn')} onChange={event => update('startsOn', event.target.value)} />)}
            <p>Klass på den nya skolan väljs efter skolbytet med Byt klass.</p>
          </>}
          {kind === 'education' && <>
            {box('educationId', 'Ny utbildning', <select value={values.educationId} disabled={busy} {...control('educationId')} onChange={event => update('educationId', event.target.value)}><option value="">Välj utbildning</option>{educations.filter(item => item.id !== placement?.educationId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>)}
            {box('startsOn', 'Gäller från', <input type="date" value={values.startsOn} disabled={busy} {...control('startsOn')} onChange={event => update('startsOn', event.target.value)} />)}
          </>}
          {kind === 'end-placement' && box('endsOn', 'Slutdatum (sista dag)', <input type="date" value={values.endsOn} disabled={busy} {...control('endsOn')} onChange={event => update('endsOn', event.target.value)} />)}
          {kind === 'class' && <>
            {box('classId', 'Ny klass', <select value={values.classId} disabled={busy} {...control('classId')} onChange={event => update('classId', event.target.value)}><option value="">Välj klass</option>{classes.filter(item => item.id !== currentClass?.classId).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>)}
            {box('startsOn', 'Gäller från', <input type="date" value={values.startsOn} disabled={busy} {...control('startsOn')} onChange={event => update('startsOn', event.target.value)} />)}
            {classWarning && <Warning>{classWarning}</Warning>}
          </>}
          <div className="mandate-actions">
            {kind === 'end-placement' && <Button ref={keep} type="button" variant="outline" disabled={saving} onClick={() => close(false)}>Behåll placeringen</Button>}
            <Button type="submit" disabled={busy || period !== null}>{saving ? 'Sparar…' : submitLabels[kind]}</Button>
            {kind !== 'end-placement' && <DialogClose render={<Button type="button" variant="outline" disabled={saving} />}>Stäng utan att spara</DialogClose>}
          </div>
        </form>}
      </DialogContent>
    </Dialog>
  );
}

/* ---------- Export ---------- */

const exportLabels: Record<ExportField, string> = {
  id: 'Elev-ID', displayName: 'Namn', birthDate: 'Födelsedatum', unitName: 'Skola', educationName: 'Utbildning',
  className: 'Klass', grade: 'Årskurs', municipalityCode: 'Hemkommun (kommunkod)', status: 'Status',
};
const pupils = (n: number) => n === 1 ? '1 elev' : `${n} elever`;

export type ExportDialogProps = {
  schoolYear: number;
  caseId: string | null;
  selection: Selection;
  search: string;
  marked: string[];
  total: number;
  canReadProtected: boolean;
  /** Skyddade elev-ID ur serverns lista; tom för den som inte får se skyddade elever. */
  protectedIds: readonly string[];
  returnTo: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onSessionLost: () => void;
};

/** Uttryckligt exporturval. Antalet kommer från serverns förhandsprövning; filen
 * begärs först därefter och servern prövar och loggar urvalet igen. */
const notInMandate = 'En elev i urvalet ingår inte längre i ditt uppdrag. Stäng dialogen, hämta aktuellt läge och välj igen.';

export function PupilExportDialog(props: ExportDialogProps) {
  const [target, setTarget] = useState<'marked' | 'selection'>(props.marked.length > 0 ? 'marked' : 'selection');
  const [fields, setFields] = useState<ExportField[]>([...DEFAULT_EXPORT_FIELDS]);
  const [includePersonalNumber, setIncludePersonalNumber] = useState(false);
  // Skyddade elever tas bara med efter uttryckligt val; valet återställs vid byte av elevurval.
  const [includeProtected, setIncludeProtected] = useState(false);
  const [preview, setPreview] = useState<number | null>(null);
  const [previewing, setPreviewing] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [mfa, setMfa] = useState(false);
  const popup = useRef<HTMLDivElement>(null);
  const errorRef = useRef<HTMLDivElement>(null);
  const firstField = useRef<HTMLInputElement>(null);
  const callbacks = useRef(props);
  useEffect(() => { callbacks.current = props; });

  const choice = protectedExportChoice({ capabilities: { canReadProtected: props.canReadProtected }, protectedIds: props.protectedIds },
    target === 'marked' ? { kind: 'marked', ids: props.marked } : { kind: 'selection' });
  const choiceKey = choice.ids.join(',');
  const draft = (chosen: ExportField[]): ExportDraft => ({
    schoolYear: props.schoolYear, caseId: props.caseId, fields: chosen, includePersonalNumber,
    includeProtected: includeProtected && choice.count > 0, protectedIds: choice.ids,
    target: target === 'marked' ? { kind: 'marked', ids: props.marked } : { kind: 'selection', selection: props.selection, search: props.search },
  });

  // Förhandsprövningen gäller elevurvalet och skyddsvalet; antalet beror inte på fältvalet.
  // När skyddsvalet ändras görs prövningen om med de uttryckliga ID:na.
  useEffect(() => {
    let active = true;
    const built = exportPost('preview', {
      schoolYear: callbacks.current.schoolYear, caseId: callbacks.current.caseId, fields: ['id'], includePersonalNumber: false,
      includeProtected: includeProtected && choiceKey !== '', protectedIds: choiceKey === '' ? [] : choiceKey.split(','),
      target: target === 'marked' ? { kind: 'marked', ids: callbacks.current.marked } : { kind: 'selection', selection: callbacks.current.selection, search: callbacks.current.search },
    });
    queueMicrotask(() => { if (active) { setPreview(null); setPreviewing(true); setError(null); } });
    if (!built.ok) {
      queueMicrotask(() => { if (active) { setPreviewing(false); setError('Urvalet innehåller inga elever att exportera.'); } });
      return () => { active = false; };
    }
    api.post<ExportPreview>('/api/elever/export', built.post).then(result => {
      if (!active) return;
      setPreview(result.count);
      if (result.count === 0) setError('Urvalet innehåller inga elever att exportera.');
    }).catch(caught => {
      if (!active) return;
      const result = failure(caught, 'export');
      if (!result) return;
      if (result.kind === 'session') callbacks.current.onSessionLost();
      else if (result.kind === 'mfa') setMfa(true);
      else if (result.kind === 'message') setError(result.status === 400 ? 'Urvalet innehåller inga elever att exportera.' : result.status === 404 ? notInMandate : result.text);
    }).finally(() => { if (active) setPreviewing(false); });
    return () => { active = false; };
  }, [target, includeProtected, choiceKey]);

  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);
  useEffect(() => { if (fieldError) firstField.current?.focus(); }, [fieldError]);
  const toggle = (field: ExportField) => {
    setFields(previous => previous.includes(field) ? previous.filter(item => item !== field) : [...previous, field]);
    setFieldError(null);
  };

  async function download(event: SyntheticEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy || previewing) return;
    const built = exportPost('download', draft(fields));
    if (!built.ok) {
      if (built.reason === 'fields') setFieldError('Välj minst en uppgift att exportera.');
      else setError('Urvalet innehåller inga elever att exportera.');
      return;
    }
    if (!preview) { setError('Urvalet innehåller inga elever att exportera.'); return; }
    setBusy(true); setError(null); setMfa(false);
    try {
      const file = await api.downloadPost('/api/elever/export', built.post);
      const rows = csvDataRowCount(await file.blob.text());
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.filename ?? 'syntetiskt-elevurval.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      // Blob-URL:en återkallas så att filinnehållet inte ligger kvar i sidan.
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      const count = built.post.export.fields.length + (built.post.export.includePersonalNumber ? 1 : 0);
      callbacks.current.onDone(`Exporten är klar: ${pupils(rows)} och ${count} fält. Exporten är registrerad i säkerhetsloggen.`);
    } catch (caught) {
      const result = failure(caught, 'export');
      if (!result) return;
      if (result.kind === 'session') { callbacks.current.onSessionLost(); return; }
      if (result.kind === 'mfa') { setMfa(true); return; }
      setError(result.kind === 'message' ? result.status === 404 ? notInMandate : result.text : 'Exporten kunde inte slutföras. Försök igen.');
    } finally { setBusy(false); }
  }

  const label = previewing ? 'Hämtar antal…' : busy ? 'Exporterar…' : preview ? `Exportera ${pupils(preview)} (CSV)` : 'Exportera (CSV)';
  return (
    <Dialog open onOpenChange={open => { if (!open && !busy) props.onClose(); }}>
      <DialogContent ref={popup} initialFocus={popup} className="mandate-dialog pupil-register-dialog sm:max-w-xl" showCloseButton={!busy}>
        <DialogTitle>Exportera elevurval</DialogTitle>
        <DialogDescription>Välj elever och uppgifter. Du kan bara välja uppgifter som ditt uppdrag tillåter. Servern prövar exporten igen och registrerar den i säkerhetsloggen.</DialogDescription>
        {error && <Warning focusRef={errorRef}>{error}</Warning>}
        {mfa && <MfaStepUpNotice className="pupil-warning" returnTo={props.returnTo} message="Export kräver verifiering med engångskod." detail="Efter verifieringen kommer du tillbaka till elevlistan och väljer exporten igen." />}
        <form className="protected-form pupil-dialog-form" noValidate onSubmit={event => void download(event)} aria-busy={busy || previewing}>
          <fieldset className="mandate-choice">
            <legend>Elever</legend>
            <label className="mandate-check"><input type="radio" name="export-target" checked={target === 'marked'} disabled={busy || props.marked.length === 0} onChange={() => { setTarget('marked'); setIncludeProtected(false); }} />Markerade elever ({props.marked.length})</label>
            <label className="mandate-check"><input type="radio" name="export-target" checked={target === 'selection'} disabled={busy} onChange={() => { setTarget('selection'); setIncludeProtected(false); }} />Alla elever i urvalet ({props.total})</label>
            {choice.count > 0 && <>
              <label className="mandate-check"><input type="checkbox" checked={includeProtected} disabled={busy} aria-describedby="export-protected-help" onChange={event => setIncludeProtected(event.target.checked)} />Ta med elever med skyddade personuppgifter ({choice.count})</label>
              <small id="export-protected-help">Utan detta val utelämnas de ur exporten.</small>
            </>}
          </fieldset>
          <fieldset className="mandate-choice" aria-describedby={fieldError ? 'export-fields-error' : undefined}>
            <legend>Uppgifter</legend>
            {EXPORT_FIELDS.map((field, index) => <label key={field} className="mandate-check"><input ref={index === 0 ? firstField : undefined} type="checkbox" aria-describedby={fieldError ? 'export-fields-error' : undefined} checked={fields.includes(field)} disabled={busy} onChange={() => toggle(field)} />{exportLabels[field]}</label>)}
            {fieldError && <small id="export-fields-error" className="field-error">{fieldError}</small>}
          </fieldset>
          <fieldset className="mandate-choice">
            <legend>Personnummer</legend>
            <label className="mandate-check"><input type="checkbox" checked={includePersonalNumber} disabled={busy} aria-describedby="export-number-help" onChange={event => setIncludePersonalNumber(event.target.checked)} />Ta med personnummer</label>
            <small id="export-number-help">Personnummer exporteras bara om du väljer det. Exporten registreras som personnummerexport.</small>
          </fieldset>
          {preview !== null && !previewing && <output>Servern har prövat urvalet: {pupils(preview)}.</output>}
          <div className="mandate-actions">
            <Button type="submit" disabled={busy || previewing || !preview}>{label}</Button>
            <DialogClose render={<Button type="button" variant="outline" disabled={busy} />}>Avbryt exporten</DialogClose>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
