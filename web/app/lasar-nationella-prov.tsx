'use client';

import { ArrowLeft, ArrowRight, ChevronRight, ExternalLink } from 'lucide-react';
import { useId, useRef, useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Field, FieldDescription, FieldLabel, FieldLegend } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatDate, formatLong } from '@/lib/lasar-model.ts';
import {
  NATIONELLA_PROV_KALLA, nationellaProvBokningsfel, parseNationellaProvDocument, skapaProvId,
  type NationellaProvDeltagare, type NationellaProvDocument, type NationellaProvUnderlag, type NationellProvbokning, type Provniva, type Provtermin, type Provval,
} from '@/lib/nationella-prov.ts';
import {
  provDatumTillatet, provDeltagarforslag, provNivaNyckel, provtermin, provTidTillaten,
} from '@/lib/nationella-prov-katalog.ts';
import { provDeltagareForPlanering, provRekommendationer, provTidsforslag } from '@/lib/nationella-prov-forslag.ts';

type Props = {
  schoolYear: number;
  underlag: NationellaProvUnderlag | null;
  document: NationellaProvDocument | null;
  reading: boolean;
  saving: boolean;
  readFailed: boolean;
  needsReload?: boolean;
  error: string | null;
  onSave: (document: NationellaProvDocument) => Promise<boolean>;
  onReload: () => void;
};

type Forslag = ReturnType<typeof provDeltagarforslag>[number];
type Forhandsrad = {
  bokning: NationellProvbokning;
  deltagare: NationellaProvDeltagare;
  undervisning: string;
};
type Forhandsvisning = {
  basis: NationellaProvUnderlag;
  previous: NationellaProvDocument | null;
  document: NationellaProvDocument;
  rows: Forhandsrad[];
};

const SELECT = 'min-w-0 [&_select]:min-h-11';
const ACTION = 'min-h-11 h-auto whitespace-normal';
const EGET = 'eget-prov';
const targetKey = (target: NationellProvbokning['mal']) => `${target.slag}:${target.ref}`;
const targetLabel = (slag: NationellProvbokning['mal']['slag']) => slag === 'klass' ? 'Klass' : 'Undervisningsgrupp';
const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3));
const clock = (value: number) => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
const stockholmsdatum = () => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });

function faltText(fields: FormData, name: string) {
  const value = fields.get(name);
  return typeof value === 'string' ? value : '';
}

function provdag(prov: Provval) {
  return prov.tid.typ === 'fast' ? `${formatLong(prov.tid.datum)} kl. 09.00`
    : prov.tid.till ? `${formatDate(prov.tid.fran)}–${formatDate(prov.tid.till, true)}` : `från ${formatDate(prov.tid.fran, true)}`;
}

const provstart = (prov: Provval) => prov.tid.typ === 'fast' ? prov.tid.datum : prov.tid.fran;

function nivaerFranSkolan(underlag: NationellaProvUnderlag) {
  const nivaer = new Map<string, Provniva>();
  for (const d of underlag.deltagare) {
    for (const u of d.undervisningar) {
      for (const niva of u.nivaer ?? []) nivaer.set(provNivaNyckel(niva), niva);
    }
  }
  return [...nivaer].sort((a, b) => a[1].namn.localeCompare(b[1].namn, 'sv'));
}

export function LasarNationellaProv(props: Props) {
  const { schoolYear, underlag, reading, saving, readFailed, needsReload, error, onReload } = props;
  const id = useId();
  const [provId, setProvId] = useState('');
  const [notice, setNotice] = useState('');
  const [preview, setPreview] = useState<Forhandsvisning | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const formHeading = useRef<HTMLHeadingElement>(null);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const senasteVal = useRef<HTMLButtonElement>(null);
  const katalog = underlag?.provkatalog;
  const prov = katalog?.prov.find(p => p.id === provId);
  const planerarProv = Boolean(prov || provId === EGET);
  const blockerad = reading || saving || readFailed || Boolean(needsReload);
  const idag = stockholmsdatum();
  const bokningar = props.document?.bokningar ?? [];
  const rekommendationer = underlag ? provRekommendationer(underlag, schoolYear, bokningar, idag) : [];
  const tidforslag = prov && underlag ? provTidsforslag(prov, underlag, schoolYear, bokningar, idag) : null;
  const formKey = prov ? `${provId}:${katalog?.revision}:${tidforslag?.datum}:${tidforslag?.startMin}:${tidforslag?.slutMin}` : EGET;
  const rekommenderadeId = new Set(rekommendationer.map(({ prov }) => prov.id));
  const ovrigaProv = katalog?.prov.filter(p => !rekommenderadeId.has(p.id))
    .sort((a, b) => provstart(a).localeCompare(provstart(b)) || a.namn.localeCompare(b.namn, 'sv')) ?? [];
  const stale = preview !== null && (preview.basis !== underlag || preview.previous !== props.document);

  function valjProv(val: string, knapp: HTMLButtonElement) {
    senasteVal.current = knapp;
    setProvId(val);
    setNotice('');
    requestAnimationFrame(() => formHeading.current?.focus());
  }

  function avbrytPlanering() {
    setProvId('');
    requestAnimationFrame(() => {
      const knapp = senasteVal.current;
      if (knapp?.isConnected && !knapp.disabled) knapp.focus();
      else listHeading.current?.focus();
    });
  }

  function closePreview() {
    setPreview(null);
    requestAnimationFrame(() => (formHeading.current ?? listHeading.current)?.focus());
  }

  function reload() {
    closePreview();
    setNotice('');
    onReload();
  }

  async function save() {
    if (!preview || stale || reading || saving || needsReload || readFailed) return;
    const saved = await props.onSave(preview.document);
    if (!saved) return;
    const antal = preview.rows.length;
    setNotice(`${antal === 1 ? 'En provbokning har' : `${antal} provbokningar har`} sparats i läsårskalendern.`);
    setPreview(null);
    setProvId('');
    requestAnimationFrame(() => heading.current?.focus());
  }

  function provrad(p: Provval, forslag?: typeof rekommendationer[number]) {
    const status = forslag && [
      `${forslag.deltagare} ${forslag.deltagare === 1 ? 'matchning' : 'matchningar'}`,
      ...(forslag.osakra > 0 ? ['Kontrollera deltagare'] : []),
      ...(forslag.saknarTidsforslag ? ['Kontrollera tiden'] : []),
    ].join(' · ');
    return <li key={p.id}>
      <Button type="button" variant="ghost" disabled={blockerad}
        className="relative grid h-auto min-h-11 w-full min-w-0 grid-cols-[minmax(0,1fr)_auto] justify-start gap-3 rounded-none px-3 py-2 text-left whitespace-normal focus-visible:z-10 focus-visible:ring-inset"
        onClick={e => valjProv(p.id, e.currentTarget)}>
        <span className="grid min-w-0 gap-x-4 gap-y-0.5 lg:grid-cols-[minmax(0,1fr)_auto]">
          <span className="[overflow-wrap:anywhere]">{p.namn}</span>
          <span className="font-normal text-muted-foreground">{provdag(p)}</span>
          {status && <span className="text-xs font-normal text-muted-foreground lg:col-span-2">{status}</span>}
        </span>
        <ChevronRight className="text-muted-foreground" aria-hidden="true" />
      </Button>
    </li>;
  }

  if (underlag && !underlag.gallerGymnasiet) return null;

  return (
    <section className="min-w-0 space-y-4 rounded-lg border border-border bg-card p-4" aria-labelledby={`${id}-rubrik`} aria-busy={reading || saving}>
      <div className="section-heading mb-0">
        <h2 id={`${id}-rubrik`} ref={heading} tabIndex={-1}>Nationella prov</h2>
      </div>
      <a href={NATIONELLA_PROV_KALLA} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline">
        Provdatum hos Skolverket <ExternalLink className="size-4" aria-hidden="true"/><span className="sr-only"> (öppnas i ny flik)</span>
      </a>
      {notice && <output className="status-badge success">{notice}</output>}
      {reading && <output className="block text-sm text-muted-foreground">Läser skolans provplan…</output>}
      {(error || stale) && <div className="flex flex-wrap items-center gap-2">
        <p role="alert" className="text-sm text-destructive">{error ?? 'Underlaget har ändrats. Gör en ny förhandsgranskning.'}</p>
        {error && <Button type="button" variant="outline" className={ACTION} disabled={reading || saving} onClick={reload}>Läs om provplanen</Button>}
      </div>}
      {underlag && <>
        <div hidden={preview !== null} className="space-y-4">
          <div hidden={planerarProv} className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${id}-provlista`} ref={listHeading} tabIndex={-1} className="font-semibold">Provlista</h3>
              <Button type="button" variant="outline" className={ACTION} disabled={blockerad}
                onClick={e => valjProv(EGET, e.currentTarget)}>Eget provunderlag</Button>
            </div>
            <p className="text-sm text-muted-foreground">
              {katalog ? <>
                {rekommendationer.length > 0 ? 'Förslagen utgår från skolans ämnen, nivåer och terminer. Kontrollera deltagarnas studieväg och när nivån avslutas.'
                  : 'Skolans undervisning ger inga nya provförslag för återstoden av läsåret.'}{' '}
                Provdatum hämtade {formatDate(katalog.kontrolleradDatum, true)}.
              </>
                : 'Publicerade provdatum för det här läsåret saknas i katalogen. Lägg in uppgifter från ditt eget provunderlag.'}
            </p>
            {katalog && <section aria-labelledby={`${id}-provlista`}
              className="max-h-[min(26rem,55dvh)] overflow-y-auto rounded-md border border-border divide-y divide-border">
              {rekommendationer.length > 0 && <div>
                <h4 id={`${id}-rekommenderade`} className="bg-muted px-3 py-2 text-sm font-semibold">Rekommenderade prov</h4>
                <ul aria-labelledby={`${id}-rekommenderade`} className="divide-y divide-border">
                  {rekommendationer.map(forslag => provrad(forslag.prov, forslag))}
                </ul>
              </div>}
              {ovrigaProv.length > 0 && <div>
                {rekommendationer.length > 0 && <h4 className="bg-muted px-3 py-2 text-sm font-semibold">Övriga prov i katalogen</h4>}
                <ul aria-label="Prov i katalogen" className="divide-y divide-border">
                  {ovrigaProv.map(p => provrad(p))}
                </ul>
              </div>}
            </section>}
          </div>
          {planerarProv && <div className="space-y-4">
            <Button type="button" variant="ghost" className={ACTION} disabled={saving} onClick={avbrytPlanering}>
              <ArrowLeft aria-hidden="true" /> Till provlistan
            </Button>
            <h3 ref={formHeading} tabIndex={-1} className="font-semibold">{prov?.namn ?? 'Eget provunderlag'}</h3>
            <Provform key={formKey} schoolYear={schoolYear} underlag={underlag} document={props.document} prov={prov} idag={idag} tidforslag={tidforslag}
              disabled={blockerad} onCancel={avbrytPlanering} onPreview={next => {
                setPreview(next);
                requestAnimationFrame(() => previewHeading.current?.focus());
              }}/>
          </div>}
        </div>
        {preview && <section className="min-w-0 space-y-3 rounded-md border border-border p-3" aria-labelledby={`${id}-forhandsgranskning`}>
          <div className="flex flex-wrap items-center gap-2">
            <h3 ref={previewHeading} tabIndex={-1} id={`${id}-forhandsgranskning`} className="font-semibold">Förhandsgranska bokningar</h3>
            <span className="status-badge">Ej sparat</span>
          </div>
          <Forhandsrader preview={preview}/>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" className={ACTION} disabled={saving} onClick={closePreview}><ArrowLeft aria-hidden="true"/> Ändra uppgifter</Button>
            <Button type="button" className={ACTION} disabled={stale || saving || reading || readFailed || needsReload} onClick={() => void save()}>
              {saving ? 'Sparar…' : preview.rows.length === 1 ? 'Spara provbokning' : `Spara ${preview.rows.length} provbokningar`}
            </Button>
          </div>
        </section>}
      </>}
    </section>
  );
}

type FormProps = Pick<Props, 'schoolYear' | 'document'> & {
  underlag: NationellaProvUnderlag;
  prov: Provval | undefined;
  idag: string;
  tidforslag: ReturnType<typeof provTidsforslag>;
  disabled: boolean;
  onPreview: (preview: Forhandsvisning) => void;
  onCancel: () => void;
};

function Provform({ schoolYear, underlag, document, prov, idag, tidforslag, disabled, onPreview, onCancel }: FormProps) {
  const id = useId();
  const bokningar = document?.bokningar ?? [];
  const [nivaKey, setNivaKey] = useState('');
  const [datum, setDatum] = useState(tidforslag?.datum ?? (prov?.tid.typ === 'fast' ? prov.tid.datum : ''));
  const [tidsval, setTidsval] = useState<NationellProvbokning['tidsval']>(prov?.tid.typ ?? 'fast');
  const [valdTermin, setValdTermin] = useState<{ termin: Provtermin | undefined; val: Record<string, string | null> }>({ termin: undefined, val: {} });
  const [vakter, setVakter] = useState<string[]>([]);
  const [error, setError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  const nivaer = prov ? [] : nivaerFranSkolan(underlag);
  const egenNiva = nivaer.find(([key]) => key === nivaKey)?.[1];
  const nivaUrval = prov?.nivaer ?? (egenNiva ? [egenNiva] : []);
  const kallDatum = prov ? provstart(prov) : '';
  const kallTermin = provtermin(kallDatum, schoolYear, underlag.terminer);
  const termin = provtermin(datum || kallDatum, schoolYear, underlag.terminer);
  const forslag = prov ? provDeltagareForPlanering(prov, underlag, schoolYear, bokningar, datum || kallDatum)
    : nivaUrval.length ? provDeltagarforslag(nivaUrval, underlag.deltagare, termin) : [];
  const val = valdTermin.termin === termin ? valdTermin.val : {};
  const valtAlternativ = (rad: Forslag) => {
    const override = val[targetKey(rad.deltagare)];
    if (override === undefined) return rad.valt;
    return override === '' || rad.alternativ.some(alternativ => alternativ.ref === override) ? override : null;
  };
  const valda = forslag.filter(row => valtAlternativ(row) !== null);
  const tid = prov?.tid.typ === 'period' ? prov.tid : undefined;
  const terminsSlut = kallTermin ? underlag.terminer?.[kallTermin].end : undefined;
  const lasaretsSlut = `${schoolYear + 1}-06-30`;
  const minDatum = tid?.fran ?? `${schoolYear}-07-01`;
  const maxDatum = tid ? tid.till ?? terminsSlut ?? (tid.fran.slice(5, 7) < '07' ? lasaretsSlut : `${schoolYear}-12-31`) : lasaretsSlut;

  function changeVal(rad: Forslag, ref: string | null) {
    setValdTermin({ termin, val: { ...val, [targetKey(rad.deltagare)]: ref } });
    setError('');
  }

  function preview(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const fields = new FormData(event.currentTarget);
    const namn = prov?.namn ?? faltText(fields, 'namn').trim();
    const start = tidsval === 'fast' ? '09:00' : faltText(fields, 'start');
    const end = faltText(fields, 'slut');
    const startMin = minutes(start), slutMin = end === '00:00' ? 1440 : minutes(end);
    const taken = bokningar;
    const base = { namn, datum, startMin, slutMin, tidsval, salId: faltText(fields, 'sal') || null,
      vakter: vakter.slice(), kontrolleradDatum: prov ? underlag.provkatalog?.kontrolleradDatum ?? '' : faltText(fields, 'kontrollerad') };

    function fail(message: string) {
      setError(message);
      requestAnimationFrame(() => errorRef.current?.focus());
    }

    if (!valda.length) return fail('Välj minst en klass eller undervisningsgrupp.');
    if (prov && !provDatumTillatet(prov, datum, terminsSlut)) return fail('Välj ett datum inom provets angivna provperiod.');
    const day = new Date(datum).getUTCDay();
    if (day === 0 || day === 6) return fail('Välj ett provdatum på en vardag.');
    if (!start || !end || slutMin - startMin < 5 || startMin % 5 || slutMin % 5) {
      return fail('Ange start och slut i femminuterssteg. Sluttiden ska vara minst fem minuter efter starttiden.');
    }
    if (prov && !provTidTillaten(prov, datum, startMin, slutMin)) return fail('Ange tider som följer ordningen mellan delproven.');
    if (taken.length + valda.length > 200) return fail('Provplanen får innehålla högst 200 bokningar.');
    if (vakter.length > 20) return fail('Välj högst 20 provvakter per bokning.');
    const rows: Forhandsrad[] = [];
    for (const rad of valda) {
      const deltagare = rad.deltagare, vald = rad.alternativ.find(option => option.ref === valtAlternativ(rad));
      if (!vald) return fail(`Välj undervisning för ${deltagare.name}.`);
      const mal = { slag: deltagare.slag, ref: deltagare.ref };
      const bokning = { ...base, id: skapaProvId(), mal, undervisning: vald.ref,
        ...(prov && underlag.provkatalog && { kallprov: { id: prov.id, revision: underlag.provkatalog.revision } }) };
      const fel = nationellaProvBokningsfel(bokning, underlag);
      if (fel) return fail(fel);
      const duplicate = taken.some(b => b.namn === namn && b.datum === datum && b.startMin === startMin
        && b.slutMin === slutMin && targetKey(b.mal) === targetKey(mal));
      if (duplicate) return fail(`${deltagare.name} har redan en bokning för samma prov och tid. Ta bort deltagaren från urvalet för att fortsätta.`);
      rows.push({ bokning, deltagare, undervisning: vald.title });
    }
    try {
      const plan = parseNationellaProvDocument({ granskad: false, bokningar: [...taken, ...rows.map(row => row.bokning)] }, schoolYear);
      setError('');
      onPreview({ basis: underlag, previous: document, document: plan, rows });
    } catch {
      fail('Kontrollera provets namn, datum och tider innan du förhandsgranskar.');
    }
  }

  return <form className="min-w-0 space-y-4" onSubmit={preview}>
    <fieldset disabled={disabled} className="grid min-w-0 gap-4">
      <legend className="sr-only">Provuppgifter</legend>
      {prov ? <div className="text-sm">
        <p className="font-medium">{provdag(prov)}</p>
        {prov.tidsatgang && <p className="text-muted-foreground">{prov.tidsatgang}</p>}
        {prov.tid.typ === 'period' && <p className="text-muted-foreground">{tidforslag
          ? 'Tiden är ett förslag på ett block för muntliga prov. Anpassa blocket efter antal elever och sittningar.'
          : 'Ingen skoldag med plats för ett föreslaget tidsblock kunde hittas inom provperioden.'}</p>}
        {prov.tid.typ === 'fast' && underlag.skoldagar && !underlag.skoldagar.includes(prov.tid.datum)
          && <p className="text-muted-foreground">Kalendern saknar skoldag på provdatumet.</p>}
        {prov.tidsplan?.typ === 'gemensam' && prov.tidsplan.planeradRastMin && <p className="text-muted-foreground">
          Förslaget till sluttid räknar med {prov.tidsplan.planeradRastMin} min rast. Anpassa rasttiden till skolans upplägg.
        </p>}
      </div> : <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <Field>
          <FieldLabel htmlFor={`${id}-namn`}>Provets namn</FieldLabel>
          <Input className="min-h-11" id={`${id}-namn`} name="namn" maxLength={160} required/>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-amnesniva`}>Ämne och nivå</FieldLabel>
          <NativeSelect id={`${id}-amnesniva`} className={SELECT} value={nivaKey} required onChange={e => {
            setNivaKey(e.target.value);
            setValdTermin({ termin, val: {} });
            setError('');
          }}>
            <option value="">Välj ämne och nivå</option>
            {nivaer.map(([key, niva]) => <option key={key} value={key}>{niva.namn}</option>)}
          </NativeSelect>
          {!nivaer.length && <FieldDescription>Inga ämnesnivåer kunde läsas för skolans undervisning.</FieldDescription>}
        </Field>
      </div>}
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        {!prov && <Field>
          <FieldLabel htmlFor={`${id}-tidsval`}>Typ av provtid</FieldLabel>
          <NativeSelect id={`${id}-tidsval`} className={SELECT} value={tidsval} onChange={e => setTidsval(e.target.value === 'period' ? 'period' : 'fast')}>
            <option value="fast">Fast provtid</option><option value="period">Inom en provperiod</option>
          </NativeSelect>
        </Field>}
        <Field>
          <FieldLabel htmlFor={`${id}-datum`}>Provdatum</FieldLabel>
          <Input className="min-h-11" id={`${id}-datum`} type="date" name="datum" min={minDatum} max={maxDatum} value={datum} readOnly={prov?.tid.typ === 'fast'}
            required onChange={e => { setDatum(e.target.value); setError(''); }}/>
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-start`}>Start</FieldLabel>
          <Input className="min-h-11" key={tidsval} id={`${id}-start`} name="start" type="time" step={300} defaultValue={tidsval === 'fast' ? '09:00' : tidforslag ? clock(tidforslag.startMin) : ''}
            readOnly={tidsval === 'fast'} required/>
          {tid && datum === tid.fran && tid.tidigasteStartMin !== undefined && <FieldDescription>Tidigast {clock(tid.tidigasteStartMin)} den här dagen.</FieldDescription>}
        </Field>
        <Field>
          <FieldLabel htmlFor={`${id}-slut`}>Slut</FieldLabel>
          <Input className="min-h-11" id={`${id}-slut`} name="slut" type="time" step={300} defaultValue={tidforslag ? clock(tidforslag.slutMin % 1440) : ''} required/>
          <FieldDescription>{tid && datum === tid.till && tid.senasteSlutMin !== undefined
            ? `Senast ${clock(tid.senasteSlutMin)} den här dagen.` : tidforslag ? 'Föreslagen sluttid kan ändras.' : 'Ange sluttiden för de deltagare du bokar tillsammans.'}</FieldDescription>
        </Field>
        {!prov && <Field>
          <FieldLabel htmlFor={`${id}-kontrollerad`}>Underlag kontrollerat</FieldLabel>
          <Input className="min-h-11" id={`${id}-kontrollerad`} name="kontrollerad" type="date" min="2000-01-01" max={idag} required/>
          <FieldDescription>Ange när du kontrollerade skolans eget provunderlag.</FieldDescription>
        </Field>}
      </div>
      {nivaUrval.length > 0 && <fieldset className="min-w-0 space-y-2">
        <FieldLegend>Föreslagna deltagare</FieldLegend>
        {forslag.length === 0 ? <p className="text-sm text-muted-foreground">Inga klasser eller undervisningsgrupper matchar provets ämne och nivå.</p>
          : <ul className="divide-y divide-border rounded-md border border-border">
            {forslag.map((rad, index) => {
              const deltagare = rad.deltagare, varde = valtAlternativ(rad);
              const kontrollId = `${id}-undervisning-${index}`, hintId = `${kontrollId}-besked`, deltagarId = `${kontrollId}-val`;
              return <li key={targetKey(deltagare)} className="min-w-0 space-y-2 px-3 py-2">
                <label className="flex min-h-11 min-w-0 items-center gap-2" htmlFor={deltagarId}>
                  <Checkbox id={deltagarId} aria-describedby={rad.osaker ? hintId : undefined} disabled={disabled} checked={varde !== null}
                    onCheckedChange={checked => changeVal(rad, checked ? rad.alternativ.length === 1 ? rad.alternativ[0].ref : '' : null)}/>
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{deltagare.name}</span>
                    <span className="ml-2 text-sm text-muted-foreground">{targetLabel(deltagare.slag)}</span>
                  </span>
                </label>
                {rad.osaker && <p id={hintId} className="text-sm text-muted-foreground"><span className="font-medium text-foreground">Kontrollera deltagandet. </span>{rad.osaker}</p>}
                {varde !== null && rad.alternativ.length > 1 && <Field>
                  <FieldLabel htmlFor={kontrollId}>Undervisning för {deltagare.name}</FieldLabel>
                  <NativeSelect id={kontrollId} className={SELECT} value={varde} required onChange={e => changeVal(rad, e.target.value)}>
                    <option value="">Välj undervisning</option>
                    {rad.alternativ.map(alternativ => <option value={alternativ.ref} key={alternativ.ref}>{alternativ.title}</option>)}
                  </NativeSelect>
                </Field>}
                {rad.alternativ.length === 1 && <p className="text-sm text-muted-foreground">{rad.alternativ[0].title}</p>}
              </li>;
            })}
          </ul>}
      </fieldset>}
      <Field>
        <FieldLabel htmlFor={`${id}-sal`}>Sal (valfri)</FieldLabel>
        <NativeSelect id={`${id}-sal`} name="sal" className={SELECT}>
          <option value="">Ingen sal vald</option>
          {underlag.salar.map(sal => <option key={sal.id} value={sal.id}>{sal.name}</option>)}
        </NativeSelect>
      </Field>
      {underlag.vakter.length > 0 && <fieldset className="min-w-0 rounded-md border border-border px-3 pb-2">
        <FieldLegend variant="label" className="px-1">Provvakter (valfria)</FieldLegend>
        <div className="flex max-h-32 flex-wrap items-center gap-x-4 overflow-y-auto">
          {underlag.vakter.map(vakt => <label key={vakt.ref} className="inline-flex min-h-11 items-center gap-2">
            <Checkbox disabled={disabled} checked={vakter.includes(vakt.ref)} onCheckedChange={checked => {
              setVakter(previous => checked ? [...previous, vakt.ref] : previous.filter(ref => ref !== vakt.ref));
              setError('');
            }}/>{vakt.name}
          </label>)}
        </div>
      </fieldset>}
    </fieldset>
    {error && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" variant="outline" className={ACTION} onClick={onCancel}>Avbryt</Button>
      <Button type="submit" className={ACTION} disabled={disabled || !forslag.length}>Förhandsgranska bokningar <ArrowRight aria-hidden="true"/></Button>
    </div>
  </form>;
}

function Forhandsrader({ preview }: { preview: Forhandsvisning }) {
  const first = preview.rows[0].bokning;
  const sal = preview.basis.salar.find(s => s.id === first.salId)?.name ?? 'Ingen sal vald';
  const vakter = first.vakter.map(ref => preview.basis.vakter.find(v => v.ref === ref)?.name).filter(Boolean).join(', ') || 'Inga provvakter valda';
  return <>
    <p className="font-medium">{first.namn}</p>
    <p className="text-sm text-muted-foreground">{first.kallprov ? 'Provuppgifter hämtade' : 'Underlag kontrollerat'} {formatDate(first.kontrolleradDatum, true)}</p>
    <Table aria-label="Bokningar som kommer att sparas">
      <TableHeader>
        <TableRow>
          <TableHead scope="col" className="whitespace-normal">Deltagare</TableHead>
          <TableHead scope="col" className="whitespace-normal">Datum och tid</TableHead>
          <TableHead scope="col" className="whitespace-normal">Sal och provvakter</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {preview.rows.map(({ bokning, deltagare, undervisning }) => <TableRow key={bokning.id}>
          <TableCell className="whitespace-normal [overflow-wrap:anywhere]"><strong className="font-medium">{deltagare.name}</strong>
            <div className="text-muted-foreground">{targetLabel(deltagare.slag)} · {undervisning}</div>
          </TableCell>
          <TableCell className="whitespace-normal">{formatLong(bokning.datum)}
            <div>{clock(bokning.startMin)}–{clock(bokning.slutMin)} · {bokning.slutMin - bokning.startMin} min</div>
          </TableCell>
          <TableCell className="whitespace-normal [overflow-wrap:anywhere]">{sal}<div className="text-muted-foreground">{vakter}</div></TableCell>
        </TableRow>)}
      </TableBody>
    </Table>
  </>;
}
