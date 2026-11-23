'use client';

import { useState, type SubmitEvent } from 'react';
import { Button } from '@/components/ui/button';
import type { SchemaResurs } from '@/lib/schema-contract.ts';

export type DatumAktivitetVal = {
  name: string;
  date: string;
  startMin: number;
  endMin: number;
  classRefs: string[];
  credit: { ref: string; minutes: number } | null;
};

export type DatumAktivitetUnderlag = {
  minDatum: string;
  maxDatum: string;
  undervisningar: { ref: string; namn: string; klassRefs: string[] }[];
  onSave: (value: DatumAktivitetVal) => Promise<boolean>;
};

const UTAN_TID = 'ingen-undervisningstid';
const namnlista = new Intl.ListFormat('sv');
const minuter = (value: string) => value ? Number(value.slice(0, 2)) * 60 + Number(value.slice(3, 5)) : NaN;

export function DatumAktivitetForm({ klasser, forval, datum, busy, saveError, onClose }: {
  klasser: SchemaResurs[];
  forval: string[];
  datum: DatumAktivitetUnderlag;
  busy: boolean;
  saveError?: string | null;
  onClose: () => void;
}) {
  const [namn, setNamn] = useState('Friluftsdag'), [date, setDate] = useState('');
  const [start, setStart] = useState(''), [slut, setSlut] = useState('');
  const [urval, setUrval] = useState(forval);
  const [amne, setAmne] = useState(''), [amnestid, setAmnestid] = useState('');
  const [fel, setFel] = useState(''), [sparfel, setSparfel] = useState(false);
  const valda = klasser.filter(klass => urval.includes(klass.ref));
  const allaValda = valda.length === klasser.length;
  const undervisningar = datum.undervisningar.filter(rad => valda.some(klass => rad.klassRefs.includes(klass.ref)));
  const undervisning = undervisningar.find(rad => rad.ref === amne);
  const medTid = undervisning ? valda.filter(klass => undervisning.klassRefs.includes(klass.ref)) : [];
  const utanTid = valda.filter(klass => !medTid.includes(klass));
  const startMin = minuter(start), endMin = minuter(slut), langd = endMin - startMin;

  async function spara(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const name = namn.trim(), minutes = Number(amnestid);
    const ogiltigt = !name ? 'Skriv ett namn på aktiviteten.'
      : valda.length === 0 ? 'Välj minst en klass.'
      : !date || date < datum.minDatum || date > datum.maxDatum ? 'Välj ett datum inom perioden för utkastet.'
      : !(langd >= 5) || startMin % 5 !== 0 || endMin % 5 !== 0 ? 'Ange starttid och sluttid i femminuterssteg. Sluttiden ska komma efter starttiden.'
      : amne !== UTAN_TID && !undervisning ? 'Välj ett ämne och en nivå eller välj Ingen undervisningstid.'
      : undervisning && (!Number.isInteger(minutes) || minutes < 5 || minutes % 5 !== 0 || minutes > langd)
        ? `Ange undervisningstid i femminuterssteg, från 5 till ${langd} minuter.` : '';
    setFel(ogiltigt);
    if (ogiltigt) return;
    setSparfel(false);
    try {
      const klart = await datum.onSave({ name, date, startMin, endMin, classRefs: valda.map(klass => klass.ref),
        credit: undervisning ? { ref: undervisning.ref, minutes } : null });
      if (klart) onClose();
      else setSparfel(true);
    } catch (error) {
      if (error instanceof Error && error.message) setFel(error.message);
      else setSparfel(true);
    }
  }

  return <form className="akt-form" noValidate onSubmit={spara} onChange={() => { setFel(''); setSparfel(false); }}>
    <fieldset disabled={busy} className="akt-form min-w-0">
      <label className="akt-field">Namn<input maxLength={120} value={namn} onChange={event => setNamn(event.target.value)}/></label>
      <fieldset className="akt-val">
        <legend>Klasser</legend>
        {klasser.length > 0 && <Button type="button" variant="outline" className="mb-2" onClick={() => {
          setUrval(allaValda ? [] : klasser.map(klass => klass.ref));
          setFel('');
          setSparfel(false);
        }}>{allaValda ? 'Rensa klassval' : 'Välj alla klasser'}</Button>}
        <div>{klasser.map(klass => <label className="akt-check" key={klass.ref}>
          <input type="checkbox" checked={urval.includes(klass.ref)} onChange={() => setUrval(tidigare => tidigare.includes(klass.ref)
            ? tidigare.filter(ref => ref !== klass.ref) : [...tidigare, klass.ref])}/>{klass.name}
        </label>)}</div>
        {klasser.length === 0 && <p className="text-muted-foreground">Utkastet har inga klasser att välja.</p>}
        {klasser.length > 0 && <p className="text-muted-foreground">{valda.length === 0 ? 'Välj vilka klasser som deltar tillsammans.' : `${valda.length} av ${klasser.length} klasser deltar.`}</p>}
      </fieldset>
      <div className="akt-tidfalt">
        <label className="akt-field">Datum<input type="date" min={datum.minDatum} max={datum.maxDatum} value={date} onChange={event => setDate(event.target.value)}/></label>
        <label className="akt-field">Starttid<input type="time" step={300} value={start} onChange={event => setStart(event.target.value)}/></label>
        <label className="akt-field">Sluttid<input type="time" step={300} value={slut} onChange={event => setSlut(event.target.value)}/></label>
      </div>
      <fieldset className="akt-nar akt-form">
        <legend>Undervisningstid</legend>
        <div className="akt-tidfalt">
          <label className="akt-field">Ämne och nivå från timplanen
            <select value={undervisning || amne === UTAN_TID ? amne : ''} onChange={event => setAmne(event.target.value)}>
              <option value="">Välj ämne eller ingen undervisningstid</option>
              <option value={UTAN_TID}>Ingen undervisningstid</option>
              {undervisningar.map(rad => <option key={rad.ref} value={rad.ref}>{rad.namn}</option>)}
            </select>
          </label>
          {undervisning && <label className="akt-field">Minuter undervisningstid
            <input type="number" min={5} max={langd >= 5 ? langd : undefined} step={5} value={amnestid} onChange={event => setAmnestid(event.target.value)}/>
          </label>}
        </div>
        {valda.length === 0 && <p className="text-muted-foreground">Välj klasser för att se deras ämnen och nivåer.</p>}
        {valda.length > 0 && undervisningar.length === 0 && <p className="text-muted-foreground">De valda klasserna har inga valbara ämnen och nivåer i utkastet.</p>}
        {undervisning && <p className="text-muted-foreground">Undervisningstiden räknas för {namnlista.format(medTid.map(klass => klass.name))}.
          {utanTid.length > 0 && ` ${namnlista.format(utanTid.map(klass => klass.name))} deltar utan undervisningstid.`}</p>}
      </fieldset>
    </fieldset>
    {(fel || sparfel) && <p role="alert" className="text-destructive">{fel || saveError || 'Ett schemaförslag kunde inte tas fram. Dina val finns kvar. Försök igen.'}</p>}
    <div className="akt-segment">
      <Button type="submit" disabled={busy}>{busy ? 'Räknar om schemat…' : 'Räkna om schemat'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onClose}>Avbryt</Button>
    </div>
  </form>;
}
