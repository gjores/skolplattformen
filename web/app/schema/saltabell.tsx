'use client';
// Salbehov som tabell med massändring (05.2-SM-UXF-22, designvyn Saltabell). Vanlig tabellsemantik; raderna väljs med kryssrutor.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaVillkor } from '@/lib/schema-contract.ts';
import { SCHEMA_UNDERVISNINGSFORMER, UNDERVISNINGSFORM_NAMN, tomtSalbehov, type SchemaSalbehov, type SchemaUndervisningsform } from '@/lib/schema-salregister.ts';
import { forhandsgranskaSalandring, lampligaText, salbehovLageNamn, salbehovText, saltabellFiltrera, saltabellVarden, tillampaSalandring, type SalAndring, type SalForhandsvisning, type SaltabellFilter,
  type SaltabellRad } from '@/lib/schema-saltabell.ts';

const FALT = 'rounded-md border border-input bg-background p-2 min-h-(--control-height) w-full';
const KRYSS = 'schema-val';
const lika = (a: string, b: string) => a.toLocaleLowerCase('sv') === b.toLocaleLowerCase('sv');
type Typ = SalAndring['typ'];
const ANDRING: Record<Typ, string> = { satt: 'Sätt salbehov', lagg_till: 'Lägg till salalternativ', ersatt: 'Ersätt salalternativ', ta_bort: 'Ta bort salalternativ', rensa: 'Ta bort eget undantag' };
const und = (n: number) => `${n} ${n === 1 ? 'undervisning' : 'undervisningar'}`;

export function Saltabell({ villkor: v, rader, disabled, onChange, onOppna }: { villkor: SchemaVillkor; rader: SaltabellRad[]; disabled: boolean;
  onChange: (next: SchemaVillkor, text: string) => void; onOppna: (ref: string) => void }) {
  const id = useId(), register = v.salregister!;
  const [filter, setFilter] = useState<SaltabellFilter>({ sok: '', lage: 'alla' }), [markerade, setMarkerade] = useState<string[]>([]);
  const [typ, setTyp] = useState<Typ>('satt'), [lage, setLage] = useState<SchemaSalbehov['lage']>('allman'), [saltyp, setSaltyp] = useState(''), [utr, setUtr] = useState<string[]>([]);
  const [form, setForm] = useState<SchemaUndervisningsform>('utomhus'), [salar, setSalar] = useState<string[]>([]), [visning, setVisning] = useState<{ nyckel: string; data: SalForhandsvisning } | null>(null), [klart, setKlart] = useState('');
  const visade = saltabellFiltrera(rader, filter), visadeRef = new Set(visade.map(r => r.ref));
  // Bara rader som syns i filtret kan vara valda: ingen dold rad följer med i en ändring.
  const valda = visade.filter(r => markerade.includes(r.ref)), omarkerade = visade.filter(r => !markerade.includes(r.ref));
  const varden = saltabellVarden(valda), slag = (['obesvarat', 'allman', 'sarskild', 'ingen'] as const).filter(k => varden[k] > 0);
  const andring: SalAndring | null = typ === 'rensa' ? { typ } : typ === 'satt'
    ? lage === 'sarskild' && !saltyp && !utr.length ? null : { typ, behov: { ...tomtSalbehov(lage), ...(lage === 'sarskild' ? { typ: saltyp || null, utrustning: utr } : {}), ...(lage === 'ingen' ? { form } : {}) } }
    : salar.length ? { typ, salar } : null;
  const nyckel = JSON.stringify([valda.map(r => r.ref), andring, v.salbehov ?? []]);
  const aktuell = visning?.nyckel === nyckel ? visning.data : null;
  const typer = [...new Set(register.salar.map(s => s.typ).filter(Boolean))], utrustning = [...new Set(register.salar.flatMap(s => s.utrustning).map(x => x.toLocaleLowerCase('sv')))].sort();
  const markera = (ref: string, pa: boolean) => setMarkerade(m => pa ? [...m.filter(x => visadeRef.has(x)), ref] : m.filter(x => x !== ref && visadeRef.has(x)));
  const anvand = () => {
    if (!aktuell || !aktuell.andras.length) return;
    onChange(tillampaSalandring(v, aktuell), `Salbehov för ${und(aktuell.andras.length)}`);
    setKlart(`Salbehovet är ändrat för ${und(aktuell.andras.length)}. Ändringen är ett steg i Ångra.`); setVisning(null); setMarkerade([]);
  };
  return <div className="space-y-3" data-saltabell>
    <p className="schema-note">Samma salbehov som i formuläret, i tabellform för att jämföra och ändra många samtidigt.</p>
    <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] items-end">
      <label htmlFor={`${id}-sok`} className="grid gap-1 text-sm">Sök undervisning eller grupp<Input id={`${id}-sok`} type="search" value={filter.sok} onChange={e => setFilter({ ...filter, sok: e.target.value })}/></label>
      <label className="grid gap-1 text-sm">Salbehov<select className={FALT} value={filter.lage} onChange={e => setFilter({ ...filter, lage: e.target.value as SaltabellFilter['lage'] })}>
        <option value="alla">Alla</option><option value="obesvarat">Obesvarat</option><option value="allman">{salbehovLageNamn.allman}</option><option value="sarskild">{salbehovLageNamn.sarskild}</option>
        <option value="ingen">{salbehovLageNamn.ingen}</option><option value="hinder">Utan lämplig sal</option></select></label>
    </div>
    <p className="flex flex-wrap items-center gap-3"><span>Visar {visade.length} av {und(rader.length)}.</span>
      {(filter.sok || filter.lage !== 'alla') && <Button type="button" variant="outline" size="sm" onClick={() => setFilter({ sok: '', lage: 'alla' })}>Rensa filter</Button>}</p>
    <fieldset className="rounded-md border border-border p-3 space-y-3" data-massandring><legend className="px-1 text-sm font-medium">Ändra flera undervisningar</legend>
      <p className="flex flex-wrap items-center gap-3"><strong>{valda.length} valda</strong>
        <Button type="button" variant="outline" size="sm" disabled={!visade.length || valda.length === visade.length} onClick={() => setMarkerade(visade.map(r => r.ref))}>Markera alla {visade.length} filtrerade</Button>
        <Button type="button" variant="outline" size="sm" disabled={!valda.length} onClick={() => setMarkerade([])}>Avmarkera alla</Button></p>
      {valda.length > 0 && <>
        <p className="schema-note">Nuvarande värden bland de valda: {slag.length > 1 ? 'blandade' : 'samma'} ({slag.map(k => `${varden[k]} ${k === 'obesvarat' ? (varden[k] === 1 ? 'obesvarad' : 'obesvarade') : salbehovLageNamn[k]}`).join(', ')}).
          {omarkerade.length > 0 && ` ${omarkerade.length} ${omarkerade.length === 1 ? 'filtrerad rad är omarkerad och ändras' : 'filtrerade rader är omarkerade och ändras'} inte.`}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="grid gap-1 text-sm">Ändring<select className={FALT} value={typ} onChange={e => setTyp(e.target.value as Typ)}>{(Object.keys(ANDRING) as Typ[]).map(t => <option key={t} value={t}>{ANDRING[t]}</option>)}</select></label>
          {typ === 'satt' && <label className="grid gap-1 text-sm">Nytt värde<select className={FALT} value={lage} onChange={e => setLage(e.target.value as SchemaSalbehov['lage'])}>
            <option value="allman">{salbehovLageNamn.allman}</option><option value="sarskild">{salbehovLageNamn.sarskild}…</option><option value="ingen">{salbehovLageNamn.ingen}…</option></select></label>}
        </div>
        {typ === 'satt' && lage === 'sarskild' && <div className="grid gap-3">
          <label className="grid gap-1 text-sm sm:max-w-sm">Saltyp<select className={FALT} value={saltyp} onChange={e => setSaltyp(e.target.value)}><option value="">Ingen bestämd saltyp</option>{typer.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
          {utrustning.length > 0 && <fieldset className="flex flex-wrap gap-x-4"><legend className="text-sm">Utrustning</legend>{utrustning.map(u => <label key={u} className={KRYSS}>
            <input type="checkbox" checked={utr.some(x => lika(x, u))} onChange={e => setUtr(e.target.checked ? [...utr, u] : utr.filter(x => !lika(x, u)))}/>{u}</label>)}</fieldset>}
          {!saltyp && !utr.length && <p className="schema-note">Välj saltyp eller utrustning. Bestämda salar läggs till med Lägg till salalternativ.</p>}
        </div>}
        {typ === 'satt' && lage === 'ingen' && <label className="grid gap-1 text-sm sm:max-w-sm">Undervisningsform<select className={FALT} value={form} onChange={e => setForm(e.target.value as SchemaUndervisningsform)}>
          {SCHEMA_UNDERVISNINGSFORMER.map(f => <option key={f} value={f}>{UNDERVISNINGSFORM_NAMN[f]}</option>)}</select></label>}
        {(typ === 'lagg_till' || typ === 'ersatt' || typ === 'ta_bort') && <fieldset className="flex flex-wrap gap-x-4"><legend className="text-sm">Salar</legend>{register.salar.map(s => <label key={s.id} className={KRYSS}>
          <input type="checkbox" checked={salar.includes(s.id)} onChange={e => setSalar(e.target.checked ? [...salar, s.id] : salar.filter(x => x !== s.id))}/>{s.name}</label>)}</fieldset>}
        <p className="schema-note">{typ === 'rensa' ? 'Det egna undantaget tas bort, så att ämnets värde gäller igen.' : 'Gäller de valda undervisningarna som egna undantag. Ämnets grundvärde för andra undervisningar ändras inte.'}</p>
        <div><Button type="button" variant="outline" disabled={disabled || !andring} onClick={() => { if (andring) { setVisning({ nyckel, data: forhandsgranskaSalandring(valda, andring) }); setKlart(''); } }}>Förhandsgranska ändringen</Button></div>
      </>}
      {aktuell && <section className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--info-surface)' }} aria-label="Förhandsgranskning" data-forhandsvisning>
        <h4 className="font-semibold">Förhandsgranskning: {ANDRING[typ].toLocaleLowerCase('sv')}</h4>
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1">
          <dt>Ändras</dt><dd data-antal="andras"><strong>{aktuell.andras.length}</strong>{aktuell.andras.length > 0 && ` · ${aktuell.andras.slice(0, 3).map(a => `${a.title} ${a.grupp}: ${salbehovText(a.fore, register)} → ${salbehovText(a.efter, register)}`).join('; ')}${aktuell.andras.length > 3 ? ' med flera' : ''}`}</dd>
          <dt>Har redan värdet</dt><dd data-antal="oforandrade"><strong>{aktuell.oforandrade.length}</strong> · ändras inte</dd>
          <dt>Hoppas över</dt><dd data-antal="hoppas"><strong>{aktuell.hoppasOver.length}</strong>{aktuell.hoppasOver.length > 0 && ` · ${aktuell.hoppasOver.slice(0, 3).map(h => `${h.title} ${h.grupp}: ${h.skal}`).join(' ')}`}</dd>
          <dt>Omarkerade i filtret</dt><dd data-antal="omarkerade"><strong>{omarkerade.length}</strong>{omarkerade.length > 0 && ` · ${omarkerade.slice(0, 4).map(r => `${r.title} ${r.grupp}`).join(', ')}${omarkerade.length > 4 ? ' med flera' : ''}`}</dd>
          <dt>Rader utanför filtret</dt><dd><strong>0</strong> · ingen dold rad följer med</dd>
        </dl>
        {aktuell.andras.some(a => a.arvBryts) && <p>{und(aktuell.andras.filter(a => a.arvBryts).length)} har i dag ett värde ärvt från ämnet. Det ersätts av ett eget undantag.</p>}
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={disabled || !aktuell.andras.length} onClick={anvand}>Ändra {und(aktuell.andras.length)}</Button>
          <Button type="button" variant="outline" onClick={() => setVisning(null)}>Avbryt</Button></div>
        <p className="schema-note">Ändringen blir ett steg i Ångra. Inget är ändrat förrän du väljer Ändra.</p>
      </section>}
      {klart && <output className="block">{klart}</output>}
    </fieldset>
    {!visade.length ? <p className="empty-state">Ingen undervisning matchar filtret.</p> : <div className="max-h-[32rem] overflow-auto rounded-md border border-border">
      <Table aria-labelledby={`${id}-rubrik`}><caption id={`${id}-rubrik`} className="sr-only">Salbehov per undervisning</caption>
        <TableHeader><TableRow><TableHead>Välj</TableHead><TableHead>Undervisning</TableHead><TableHead>Grupp</TableHead><TableHead>Elever</TableHead><TableHead>Salbehov</TableHead><TableHead>Varifrån</TableHead><TableHead>Lämpliga salar</TableHead></TableRow></TableHeader>
        <TableBody>{visade.map(r => <TableRow key={r.ref} data-rad={r.ref} data-state={markerade.includes(r.ref) ? 'selected' : undefined}>
          <TableCell><input type="checkbox" className="size-4" aria-label={`Välj ${r.title}, ${r.grupp}`} checked={markerade.includes(r.ref)} onChange={e => markera(r.ref, e.target.checked)}/></TableCell>
          <TableCell className="whitespace-normal min-w-40"><Button type="button" variant="link" className="h-auto p-0 text-left whitespace-normal" onClick={() => onOppna(r.ref)}>{r.title}</Button></TableCell>
          <TableCell className="whitespace-normal">{r.grupp}</TableCell><TableCell>{r.elever ?? 'Okänt'}</TableCell>
          <TableCell className="whitespace-normal min-w-48">{salbehovText(r.behov, register)}</TableCell>
          <TableCell className="whitespace-normal">{r.kalla === 'amne' ? 'Ärvt från ämnet' : r.kalla === 'eget' ? 'Eget undantag' : r.kalla === 'standard' ? 'Förvalt för Svenska/SvA' : '–'}</TableCell>
          <TableCell className="whitespace-normal">{lampligaText(r)}</TableCell>
        </TableRow>)}</TableBody></Table></div>}
  </div>;
}
