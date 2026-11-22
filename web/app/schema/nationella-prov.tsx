'use client';

import { ExternalLinkIcon, PlusIcon } from 'lucide-react';
import { useEffect, useId, useRef, useState, type SubmitEvent } from 'react';
import { AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Field, FieldDescription, FieldLabel, FieldLegend } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { NativeSelect } from '@/components/ui/native-select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { NATIONELLA_PROV_KALLA, nationellaProvBokningsfel, skapaProvId, type NationellaProvDeltagare, type NationellaProvDocument, type NationellaProvUnderlag, type NationellProvbokning } from '@/lib/nationella-prov.ts';
import type { SchemaForslag, SchemaResurs } from '@/lib/schema-contract.ts';
import { Provresursfalt, Provresursstatus } from './provresurser';

const EMPTY: NationellaProvDocument = { granskad: false, bokningar: [] };
const CONTROL = 'min-h-11';
type Mal = NationellProvbokning['mal'];
type Redigering = 'ny' | NationellProvbokning;

const malNyckel = ({ slag, ref }: Mal) => `${slag}:${ref}`;
const klocka = (min: number) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
const minuter = (tid: string) => {
  const [timme, minut] = tid.split(':').map(Number);
  return timme * 60 + minut;
};
const svenskDag = new Intl.DateTimeFormat('sv-SE', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const lasarsDatum = (year: number) => `${year}/${String(year + 1).slice(-2)}`;
const visaDatum = (datum: string) => svenskDag.format(new Date(`${datum}T12:00:00Z`));
const faltText = (data: FormData, namn: string) => {
  const value = data.get(namn);
  return typeof value === 'string' ? value : '';
};
function bokningskonflikt(original: NationellProvbokning | null, sparade: NationellProvbokning[]) {
  if (!original) return '';
  const aktuell = sparade.find(b => b.id === original.id);
  if (!aktuell) return 'Bokningen finns inte längre i provplanen.';
  return JSON.stringify(aktuell) === JSON.stringify(original) ? '' : 'Bokningen har ändrats. Stäng dialogen och öppna den nya versionen.';
}

function ProvdatumLank() {
  return <a className="inline-flex min-h-11 items-center gap-1.5 font-medium text-primary underline-offset-4 hover:underline"
    href={NATIONELLA_PROV_KALLA} target="_blank" rel="noreferrer">
    Provdatum hos Skolverket <ExternalLinkIcon className="size-4" aria-hidden="true"/><span className="sr-only"> (öppnas i en ny flik)</span>
  </a>;
}

type Props = {
  schoolYear: number;
  baraSparade?: boolean;
  forslag?: SchemaForslag | null;
  deltagare?: NationellaProvDeltagare[];
  salar?: NationellaProvUnderlag['salar'];
  vakter?: SchemaResurs[];
  skoldagar?: string[] | null;
  bokningsfel?: ReadonlyMap<string, string>;
  mal?: { ref: string; nr: number; resurs?: 'sal' | 'provvakt' } | null;
  document: NationellaProvDocument | null;
  reading: boolean;
  saving: boolean;
  error: string | null;
  disabled?: boolean;
  onSave: (document: NationellaProvDocument) => Promise<boolean>;
  onReload: () => void;
};

/** Läsårets provplan och granskning från Förbered. */
export function NationellaProv({ schoolYear, baraSparade = false, forslag, deltagare = [], salar = [], vakter = [], skoldagar = null, bokningsfel,
  mal, document: saved, reading, saving, error, disabled, onSave, onReload }: Props) {
  const [oppetFormular, setOppetFormular] = useState<{ val: Redigering; mal?: NonNullable<Props['mal']> } | null>(null);
  const [hanteratMal, setHanteratMal] = useState<Props['mal']>(null);
  const redigering = oppetFormular?.val, redigeringsmal = oppetFormular?.mal;
  const [bort, setBort] = useState<NationellProvbokning | null>(null);
  const laggTill = useRef<HTMLButtonElement>(null);
  const redigeringsknappar = useRef(new Map<string, HTMLButtonElement>());
  const lasarPlan = saved ?? EMPTY;
  const skrivskydd = disabled || reading || saving || (saved === null && Boolean(error));
  const underlag = { gallerGymnasiet: true, deltagare, salar, vakter, skoldagar };
  const deltagarMal = new Map(deltagare.map(d => [malNyckel(d), d]));
  const undervisningar = new Map([...(forslag?.fordelning ?? []), ...deltagare.flatMap(d => d.undervisningar)].map(t => [t.ref, t.title]));
  const namnFor = (bokning: NationellProvbokning) => deltagarMal.get(malNyckel(bokning.mal))?.name
    ?? (bokning.mal.slag === 'klass' ? 'Klass saknas i underlaget' : 'Undervisningsgrupp saknas i underlaget');
  if (mal && (hanteratMal?.nr !== mal.nr || hanteratMal.ref !== mal.ref)
      && !baraSparade && !skrivskydd && !redigering && !bort && deltagare.length > 0) {
    const bokning = saved?.bokningar.find(b => b.id === mal.ref);
    if (bokning) {
      setHanteratMal(mal);
      setOppetFormular({ val: bokning, mal });
    }
  }
  const bokningar = lasarPlan.bokningar.toSorted((a, b) => a.datum.localeCompare(b.datum) || a.startMin - b.startMin
    || a.namn.localeCompare(b.namn, 'sv') || namnFor(a).localeCompare(namnFor(b), 'sv'));
  const lasfel = Boolean(disabled && error);
  const statusTillganglig = !lasfel && !reading && !saving;
  const avvikelser = (bokningsfel?.size ?? 0) > 0;
  const status = reading ? 'Läser provplanen…' : lasfel ? 'Provplanen kunde inte läsas' : saving ? 'Sparar…' : avvikelser ? 'Behöver ses över'
    : lasarPlan.granskad ? (bokningar.length ? 'Genomgånget' : 'Inga prov bekräftade') : 'Återstår att gå igenom';
  const ton = statusTillganglig && avvikelser ? 'warning' : statusTillganglig && lasarPlan.granskad ? 'success' : '';
  const uppdatera = (bokningar: NationellProvbokning[]) => onSave({ granskad: false, bokningar });
  const visaFel = error && !redigering && !bort && !baraSparade;
  const bortKonflikt = bokningskonflikt(bort, bokningar);

  return <div className="space-y-4 rounded-lg border border-border bg-card p-4" aria-busy={reading || saving} data-nationella-prov>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold">{baraSparade ? 'Sparade provbokningar' : `Provplan ${lasarsDatum(schoolYear)}`}</h3>
          <output className={`status-badge ${ton}`}>{status}</output>
        </div>
        {!baraSparade && <>
          <p className="text-sm text-muted-foreground">Kontrollera provdatumen och boka en tid för varje klass eller undervisningsgrupp som ska skriva.</p>
          <ProvdatumLank/>
        </>}
      </div>
      {!baraSparade && <Button ref={laggTill} type="button" className={CONTROL} disabled={skrivskydd || deltagare.length === 0 || bokningar.length >= 200} onClick={() => setOppetFormular({ val: 'ny' })}>
        <PlusIcon aria-hidden="true"/> Planera prov
      </Button>}
    </div>
    {visaFel && <div className="flex flex-wrap items-center gap-2">
      <p className="text-sm text-destructive" role="alert">{error}</p>
      <Button type="button" variant="outline" className={CONTROL} disabled={reading || saving} onClick={onReload}>Läs om provplanen</Button>
    </div>}
    {!baraSparade && !reading && !lasfel && deltagare.length === 0 && <p className="schema-note">Det behövs en klass eller undervisningsgrupp med undervisning i schemaunderlaget för att planera prov.</p>}
    {!baraSparade && !reading && !lasfel && deltagare.length > 0 && skoldagar === null && <p className="schema-note">Läsårskalendern saknas i underlaget. Kontrollera själv att provdatumet är en skoldag.</p>}
    {bokningar.length >= 200 && <p className="schema-note">Provplanen innehåller maximalt 200 bokningar. Ändra eller ta bort en bokning för att göra plats för fler.</p>}
    {bokningar.length > 0 ? (
      <Table aria-label="Planerade nationella prov">
        <TableHeader><TableRow>
          <TableHead>Prov och deltagare</TableHead><TableHead>Tid</TableHead><TableHead>Sal och provvakter</TableHead>
          <TableHead>Underlag kontrollerat</TableHead><TableHead><span className="sr-only">Åtgärder</span></TableHead>
        </TableRow></TableHeader>
        <TableBody>{bokningar.map(b => (
          <TableRow key={b.id}>
            <TableCell className="whitespace-normal">
              <p className="font-medium">{b.namn}</p>
              <p className="text-muted-foreground">{namnFor(b)} · {undervisningar.get(b.undervisning) ?? 'Undervisning saknas i underlaget'}</p>
              {b.kallprov && <p className="text-xs text-muted-foreground">Skolverkets provkatalog</p>}
              {bokningsfel?.has(b.id) && <p className="status-badge warning mt-1 whitespace-normal">{bokningsfel.get(b.id)}</p>}
            </TableCell>
            <TableCell>
              <p>{visaDatum(b.datum)}</p><p className="text-muted-foreground">{klocka(b.startMin)}–{klocka(b.slutMin)} · {b.slutMin - b.startMin} min</p>
              <p className="text-muted-foreground">{b.tidsval === 'fast' ? 'Fast provtid' : 'Inom provperiod'}</p>
            </TableCell>
            <TableCell className="whitespace-normal [overflow-wrap:anywhere]"><Provresursstatus val={b} salar={salar} vakter={vakter}/></TableCell>
            <TableCell>{visaDatum(b.kontrolleradDatum)}</TableCell>
            <TableCell>
              <div className="flex flex-wrap gap-1">
                <Button type="button" variant="outline" className={CONTROL} disabled={skrivskydd || deltagare.length === 0} aria-label={`Ändra ${b.namn} för ${namnFor(b)}`}
                  ref={knapp => { if (knapp) redigeringsknappar.current.set(b.id, knapp); else redigeringsknappar.current.delete(b.id); }}
                  onClick={() => setOppetFormular({ val: b })}>Ändra</Button>
                <Button type="button" variant="ghost" className={CONTROL} disabled={skrivskydd} aria-label={`Ta bort ${b.namn} för ${namnFor(b)}`} onClick={() => setBort(b)}>Ta bort</Button>
              </div>
            </TableCell>
          </TableRow>
        ))}</TableBody>
      </Table>
    ) : !reading && !lasfel && <p className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
      {lasarPlan.granskad ? 'Det är bekräftat att inga nationella prov ska planeras för läsåret.' : 'Inga prov är planerade för läsåret.'}</p>}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
      <div className="space-y-1 text-sm text-muted-foreground">
        <p>{baraSparade ? 'Bokningarna visas också i Förbered.' : 'Provbokningarna visas också i läsårskalendern.'}</p>
        <p>Provtid redovisas separat från den garanterade undervisningstiden.</p>
      </div>
      <Button type="button" variant="outline" className={CONTROL} disabled={skrivskydd || (avvikelser && !lasarPlan.granskad)}
        onClick={() => void onSave({ ...lasarPlan, granskad: !lasarPlan.granskad })}>
        {lasarPlan.granskad ? 'Öppna för ny genomgång' : bokningar.length ? 'Markera som genomgånget' : 'Bekräfta att inga prov ska planeras'}
      </Button>
    </div>
    {redigering && <Provform schoolYear={schoolYear} redigering={redigering} underlag={underlag} bokningar={bokningar}
      resursfokus={redigeringsmal?.resurs} aterfokus={redigeringsmal ? () => redigeringsknappar.current.get(redigeringsmal.ref) ?? true : undefined}
      disabled={disabled} saving={saving} reading={reading} error={error} onReload={onReload} onClose={() => setOppetFormular(null)} onSave={async nya => {
        const plan = redigering === 'ny' ? [...lasarPlan.bokningar, ...nya] : lasarPlan.bokningar.map(b => b.id === redigering.id ? nya[0] : b);
        if (await uppdatera(plan)) setOppetFormular(null);
      }}/>}
    <AlertDialog open={bort !== null} onOpenChange={open => { if (!open && !saving) setBort(null); }}>
      <AlertDialogContent finalFocus={() => laggTill.current?.disabled ? true : laggTill.current}>
        <AlertDialogHeader>
          <AlertDialogTitle>Ta bort provbokningen?</AlertDialogTitle>
          <AlertDialogDescription>{bort ? `${bort.namn} för ${namnFor(bort)} den ${visaDatum(bort.datum)} tas bort ur provplanen.` : ''}</AlertDialogDescription>
        </AlertDialogHeader>
        {error && bort && <div className="space-y-2">
          <p role="alert" className="text-sm text-destructive">{error}</p>
          <Button type="button" variant="outline" className={CONTROL} disabled={reading || saving} onClick={onReload}>Läs om provplanen</Button>
        </div>}
        {bortKonflikt && <p role="alert" className="text-sm text-destructive">{bortKonflikt}</p>}
        <AlertDialogFooter>
          <Button type="button" variant="outline" className={CONTROL} disabled={saving} onClick={() => setBort(null)}>{bortKonflikt ? 'Stäng' : 'Behåll bokningen'}</Button>
          <Button type="button" variant="destructive" className={CONTROL} disabled={skrivskydd || Boolean(bortKonflikt)} onClick={async () => {
            if (bort && await uppdatera(lasarPlan.bokningar.filter(b => b.id !== bort.id))) setBort(null);
          }}>Ta bort bokningen</Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>;
}

type FormProps = {
  schoolYear: number;
  redigering: Redigering;
  underlag: NationellaProvUnderlag;
  bokningar: NationellProvbokning[];
  resursfokus?: 'sal' | 'provvakt';
  aterfokus?: () => HTMLElement | true;
  disabled?: boolean;
  saving: boolean;
  reading: boolean;
  error: string | null;
  onReload: () => void;
  onClose: () => void;
  onSave: (bokningar: NationellProvbokning[]) => Promise<void>;
};

function Provform({ schoolYear, redigering, underlag, bokningar, resursfokus, aterfokus, disabled, saving, reading, error, onReload, onClose, onSave }: FormProps) {
  const bokning = redigering === 'ny' ? null : redigering;
  const { deltagare, vakter, salar } = underlag;
  const [tidsval, setTidsval] = useState<NationellProvbokning['tidsval']>(bokning?.tidsval ?? 'fast');
  const [start, setStart] = useState(bokning ? klocka(bokning.startMin) : '09:00');
  const [slut, setSlut] = useState(bokning ? klocka(bokning.slutMin % 1440) : '');
  const [valda, setValda] = useState<Record<string, string>>(() => bokning ? { [malNyckel(bokning.mal)]: bokning.undervisning } : {});
  const [provvakter, setProvvakter] = useState(bokning?.vakter ?? []);
  const [sokning, setSokning] = useState('');
  const [fel, setFel] = useState('');
  const [forsokt, setForsokt] = useState(false);
  const id = useId();
  const sparaFel = useRef<HTMLParagraphElement>(null);
  const formular = useRef<HTMLFormElement>(null);
  const ids = useRef(new Map<string, string>());
  useEffect(() => {
    if (forsokt && error && !saving && !reading) sparaFel.current?.focus();
  }, [forsokt, error, saving, reading]);
  const selected = deltagare.filter(d => Object.hasOwn(valda, malNyckel(d)));
  const antal = selected.length;
  const redigeringskonflikt = bokningskonflikt(bokning, bokningar);
  const kanValjas = deltagare.filter(d => d.name.toLocaleLowerCase('sv').includes(sokning.trim().toLocaleLowerCase('sv')));
  const idag = new Date().toLocaleDateString('sv-SE');

  function valj(d: NationellaProvDeltagare) {
    setFel('');
    const key = malNyckel(d);
    setValda(old => {
      if (bokning) return { [key]: d.undervisningar.length === 1 ? d.undervisningar[0].ref : '' };
      const next = { ...old };
      if (Object.hasOwn(old, key)) delete next[key];
      else next[key] = d.undervisningar.length === 1 ? d.undervisningar[0].ref : '';
      return next;
    });
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving || reading || redigeringskonflikt) return;
    const form = event.currentTarget, fields = new FormData(form);
    const startMin = minuter(start), slutMin = slut === '00:00' ? 1440 : minuter(slut), datum = faltText(fields, 'datum');
    const saknadRelation = selected.find(d => !d.undervisningar.some(u => u.ref === valda[malNyckel(d)]));
    const lokalFel = antal === 0 ? 'Välj en klass eller undervisningsgrupp.' : saknadRelation ? `Välj undervisning för ${saknadRelation.name}.`
      : !start || !slut || slutMin - startMin < 5 ? 'Sluttiden måste vara minst fem minuter efter starttiden.' : '';
    if (lokalFel) {
      setFel(lokalFel);
      const fokus = antal === 0 ? form.querySelector('input[type=search]') : saknadRelation
        ? form.elements.namedItem(`undervisning-${selected.indexOf(saknadRelation)}`) : form.elements.namedItem('slut');
      if (fokus instanceof HTMLElement) fokus.focus();
      return;
    }
    const namn = faltText(fields, 'namn').trim();
    if (!namn) {
      setFel('Ange ett namn för provet.');
      const falt = form.elements.namedItem('namn');
      if (falt instanceof HTMLElement) falt.focus();
      return;
    }
    const salId = faltText(fields, 'sal') || null, kontrolleradDatum = faltText(fields, 'kontrollerad');
    const nya = selected.map(({ slag, ref }): NationellProvbokning => {
      const key = malNyckel({ slag, ref });
      const bookingId = bokning?.id ?? ids.current.get(key) ?? skapaProvId();
      ids.current.set(key, bookingId);
      return { id: bookingId, namn, undervisning: valda[key], mal: { slag, ref }, datum, startMin, slutMin, tidsval, salId, vakter: provvakter, kontrolleradDatum,
        ...(bokning?.kallprov && { kallprov: bokning.kallprov }) };
    });
    const tidigare = bokningar.filter(b => b.id !== bokning?.id), veckodag = new Date(datum).getUTCDay();
    const dubblett = nya.some(ny => tidigare.some(b => b.namn === ny.namn && b.datum === datum && b.startMin === startMin
      && b.slutMin === slutMin && malNyckel(b.mal) === malNyckel(ny.mal)));
    const bokningsfel = nya.map(b => {
      const kontroll = bokning?.datum === b.datum ? { ...b, vakter: b.vakter.filter(ref => !bokning.vakter.includes(ref)) } : b;
      return nationellaProvBokningsfel(kontroll, underlag);
    }).find(Boolean);
    const fel = veckodag === 0 || veckodag === 6 ? 'Välj ett provdatum på en vardag.'
      : tidigare.length + nya.length > 200 ? 'Provplanen får innehålla högst 200 bokningar.'
      : provvakter.length > 20 ? 'Välj högst 20 provvakter per bokning.'
      : dubblett ? 'En bokning med samma prov, deltagare och tid finns redan.' : bokningsfel ?? '';
    setFel(fel);
    if (fel) return;
    setForsokt(true);
    await onSave(nya);
  }

  return <Dialog open onOpenChange={open => { if (!open && !saving) onClose(); }}>
    <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-3xl" showCloseButton={!saving}
      initialFocus={resursfokus ? () => formular.current?.querySelector<HTMLElement>(`[data-prov-resurs="${resursfokus}"]`) ?? true : undefined}
      finalFocus={aterfokus}>
      <DialogHeader>
        <DialogTitle>{bokning ? 'Ändra provbokning' : 'Planera nationellt prov'}</DialogTitle>
        <DialogDescription>Kontrollera provdatum och tider för läsår {lasarsDatum(schoolYear)} innan du sparar.</DialogDescription>
      </DialogHeader>
      <form ref={formular} className="grid min-w-0 gap-4" onSubmit={submit}>
        <fieldset className="grid min-w-0 gap-3" disabled={saving || reading}>
          <legend className="sr-only">Provuppgifter</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field><FieldLabel htmlFor={`${id}-namn`}>Provets namn</FieldLabel>
              <Input id={`${id}-namn`} className={CONTROL} name="namn" placeholder="Till exempel Engelska nivå 1, delprov B" defaultValue={bokning?.namn} maxLength={160} required/></Field>
            <Field><FieldLabel htmlFor={`${id}-kontrollerad`}>Underlag kontrollerat</FieldLabel>
              <Input id={`${id}-kontrollerad`} className={CONTROL} name="kontrollerad" type="date" min="2000-01-01" max={idag} defaultValue={bokning?.kontrolleradDatum} required/>
              <FieldDescription>Ange dagen då du kontrollerade uppgifterna. <ProvdatumLank/></FieldDescription></Field>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Field><FieldLabel htmlFor={`${id}-tidstyp`}>Typ av provtid</FieldLabel>
              <NativeSelect id={`${id}-tidstyp`} className="w-full [&_select]:min-h-11" value={tidsval} onChange={e => {
                const typ = e.target.value as NationellProvbokning['tidsval'];
                setTidsval(typ);
                if (typ === 'fast') setStart('09:00');
              }}><option value="fast">Fast provtid</option><option value="period">Inom en provperiod</option></NativeSelect></Field>
            <Field><FieldLabel htmlFor={`${id}-datum`}>Provdatum</FieldLabel>
              <Input id={`${id}-datum`} className={CONTROL} name="datum" type="date" min={`${schoolYear}-07-01`} max={`${schoolYear + 1}-06-30`} defaultValue={bokning?.datum} required/></Field>
            <Field><FieldLabel htmlFor={`${id}-start`}>Start</FieldLabel>
              <Input id={`${id}-start`} className={CONTROL} type="time" value={start} step={300} readOnly={tidsval === 'fast'} onChange={e => setStart(e.target.value)} required/></Field>
            <Field><FieldLabel htmlFor={`${id}-slut`}>Slut</FieldLabel>
              <Input id={`${id}-slut`} className={CONTROL} name="slut" type="time" value={slut} step={300} onChange={e => setSlut(e.target.value)} required/>
              {slut === '00:00' && <FieldDescription>Slutar vid midnatt efter provdagen.</FieldDescription>}</Field>
          </div>
          <fieldset className="min-w-0 space-y-2 rounded-md border border-border p-3">
            <FieldLegend variant="label" className="px-1">Klasser och undervisningsgrupper</FieldLegend>
            {!bokning && <p className="text-sm text-muted-foreground">Varje vald klass eller grupp får en egen bokning.</p>}
            <Input type="search" className={CONTROL} value={sokning} onChange={e => setSokning(e.target.value)} aria-label="Sök klass eller undervisningsgrupp" placeholder="Sök klass eller undervisningsgrupp"/>
            <div className="grid max-h-36 grid-cols-1 content-start gap-x-4 overflow-y-auto sm:grid-cols-2">
              {kanValjas.length === 0 && <p className="py-2 text-sm text-muted-foreground">Inga deltagare matchar sökningen.</p>}
              {kanValjas.map(d => {
                const key = malNyckel(d);
                return <label key={key} className="flex min-h-11 items-center gap-2">
                  {bokning
                    ? <input type="radio" className="size-4 accent-primary" name={`${id}-deltagare`} checked={Object.hasOwn(valda, key)} onChange={() => valj(d)}/>
                    : <Checkbox disabled={saving || reading} checked={Object.hasOwn(valda, key)} onCheckedChange={() => valj(d)}/>}
                  <span className="min-w-0 py-1">{d.name}<span className="ml-1 text-xs text-muted-foreground">{d.slag === 'klass' ? 'Klass' : 'Undervisningsgrupp'}</span></span>
                </label>;
              })}
            </div>
            {selected.map((d, i) => {
              const key = malNyckel(d), relId = `${id}-undervisning-${i}`;
              return <Field key={key}>
                <FieldLabel htmlFor={relId}>Undervisning för {d.name}</FieldLabel>
                <NativeSelect className="w-full [&_select]:min-h-11" id={relId} name={`undervisning-${i}`} value={valda[key]}
                  required onChange={e => setValda({ ...valda, [key]: e.target.value })}>
                  <option value="">Välj undervisning</option>
                  {d.undervisningar.map(u => <option value={u.ref} key={u.ref}>{u.title}</option>)}
                </NativeSelect>
              </Field>;
            })}
          </fieldset>
          <Provresursfalt sparat={bokning} salar={salar} vakter={vakter} valdaVakter={provvakter} disabled={saving || reading}
            fokus={resursfokus} onVakt={(ref, checked) => {
            setProvvakter(old => checked ? [...old, ref] : old.filter(val => val !== ref));
          }}/>
          {antal > 1 && <p className="text-sm text-muted-foreground">Tid och låsta resurser gäller alla {antal} bokningar. Du kan ändra varje bokning för sig.</p>}
        </fieldset>
        {redigeringskonflikt && <p className="text-sm text-destructive" role="alert">{redigeringskonflikt}</p>}
        {fel && <p className="text-sm text-destructive" role="alert">{fel}</p>}
        {forsokt && error && <div className="space-y-2">
          <p className="text-sm text-destructive" role="alert" ref={sparaFel} tabIndex={-1}>{error}</p>
          <Button type="button" variant="outline" className={CONTROL} disabled={reading || saving} onClick={onReload}>Läs om provplanen</Button>
        </div>}
        <DialogFooter>
          <Button type="button" variant="outline" className={CONTROL} disabled={saving} onClick={onClose}>Avbryt</Button>
          <Button type="submit" className={CONTROL} disabled={disabled || saving || reading || Boolean(redigeringskonflikt)}>{saving ? 'Sparar…' : antal > 1 ? `Spara ${antal} provbokningar` : 'Spara provbokning'}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
