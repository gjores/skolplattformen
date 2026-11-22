'use client';
// Salar (05.2-SM-UXF-22): salregister och salbehov enligt designvyn Salar. Formuläret och tabellen läser och skriver samma `villkor.salbehov`.
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaVillkor } from '@/lib/schema-contract.ts';
import { ALLMAN_SALTYP, SALTYP_FORSLAG, SCHEMA_SAL_LIMITS, SCHEMA_UNDERVISNINGSFORMER, UNDERVISNINGSFORM_NAMN, andraSal, laggTillSal, lampligaSalar, overforSalnamn, salbehovFel, salnamnLedigt, sattSalbehov,
  taBortSal, tomtSalbehov, type SchemaSal, type SchemaSalbehov, type SchemaSalbehovLage, type SchemaSalregister, type SchemaUndervisningsform } from '@/lib/schema-salregister.ts';
import { salbehovLageNamn, salbehovText, saltabellRader, type SaltabellRad } from '@/lib/schema-saltabell.ts';
import { Saltabell } from './saltabell.tsx';
import { overforingTillSkolan } from '@/lib/skolsalar.ts';
import type { Skolsalar } from './use-skolsalar.ts';

export type SalarProps = { villkor: SchemaVillkor; /** Förslaget eller underlaget före första förslaget; `null` medan underlaget läses. */ kalla: SchemaForslag | null;
  disabled: boolean; besked?: string; mal?: { ref: string; nr: number } | null; onChange: (next: SchemaVillkor, text: string) => void;
  /** Skolans salregister (05.2-SM-UXF-23). Saknas i anslutna fönster; där gäller utkastets villkor som förut. */ skola?: Skolsalar };
const FALT = 'rounded-md border border-input bg-background p-2 min-h-(--control-height) w-full';
const KRYSS = 'schema-val';
const lika = (a: string, b: string) => a.toLocaleLowerCase('sv') === b.toLocaleLowerCase('sv');

export function Salar({ villkor: v, kalla, disabled, besked, mal, onChange, skola }: SalarProps) {
  const rubrik = useId(), [vy, setVy] = useState<'formular' | 'tabell'>('formular'), [vald, setVald] = useState('');
  const [fokus, setFokus] = useState(0), [hanteratMal, setHanteratMal] = useState<SalarProps['mal']>(null);
  const register = v.salregister ?? null, iSkolan = register?.kalla === 'skola';
  const rader = useMemo(() => kalla ? saltabellRader(kalla, v) : [], [kalla, v]);
  function oppnaSalbehov(ref: string) {
    setVald(ref);
    setVy('formular');
    setFokus(n => n + 1);
  }
  if (mal && (hanteratMal?.nr !== mal.nr || hanteratMal.ref !== mal.ref)
      && !disabled && register?.salar.length && rader.some(rad => rad.ref === mal.ref)) {
    setHanteratMal(mal);
    oppnaSalbehov(mal.ref);
  }
  const obesvarade = rader.filter(r => r.behov === null).length, hinder = rader.filter(r => r.hinder);
  const okandaPlatser = register?.salar.filter(s => s.platser === null).length ?? 0;
  return <section className="rounded-lg border border-border bg-card p-4 space-y-4 min-w-0" aria-labelledby={rubrik} data-salar>
    <div className="space-y-2">
      <h2 id={rubrik} className="section-heading">Salar</h2>
      <p>Fysisk undervisning får en lämplig sal i schemaförslaget. Ange vilka salar som finns och vad varje undervisning behöver.</p>
      <p className="flex flex-wrap gap-2">
        <span className="status-badge">{register ? `${register.salar.length} ${register.salar.length === 1 ? 'sal' : 'salar'} i ${iSkolan ? 'skolans salregister' : 'utkastets salregister'}` : 'Inget salregister'}</span>
        {rader.length > 0 && <span className={`status-badge ${obesvarade ? 'warning' : 'success'}`}>{obesvarade ? `${obesvarade} av ${rader.length} salbehov obesvarade` : `Alla ${rader.length} salbehov besvarade`}</span>}
        {hinder.length > 0 && <span className="status-badge warning">{hinder.length} utan lämplig sal</span>}
        {okandaPlatser > 0 && <span className="status-badge">Platser saknas för {okandaPlatser} {okandaPlatser === 1 ? 'sal' : 'salar'}</span>}
      </p>
      {obesvarade > 0 && <p className="schema-note">Obesvarat betyder inte att sal inte behövs. Passen läggs utan sal och räknas inte som klara.</p>}
    </div>
    {skola && <Overforing v={v} skola={skola} disabled={disabled} onChange={onChange}/>}
    {(!skola || skola.status !== 'ok') && !register && v.salar.length > 0 && <div className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--info-surface)' }} data-overforing>
      <p><strong>{v.salar.length} {v.salar.length === 1 ? 'sal finns' : 'salar finns'} som namn från äldre villkor:</strong> {v.salar.join(', ')}.</p>
      <p className="schema-note">De gäller som förut tills du för över dem. Överföringen ger varje sal ett fast ID och behåller namnen, villkoren och vilka salar passen ligger i. Saltyp och platser är okända efteråt och anges av dig.</p>
      <Button type="button" variant="outline" disabled={disabled} onClick={() => onChange(overforSalnamn(v), `Salnamn förda över till salregistret`)}>För över salnamnen till salregistret</Button>
    </div>}
    <Register v={v} disabled={disabled} onChange={onChange} skola={skola}/>
    {register && register.salar.length > 0 && <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="font-semibold">Salbehov per undervisning</h3>
        <fieldset className="flex gap-2"><legend className="sr-only">Visa salbehov som</legend>
          <Button type="button" variant={vy === 'formular' ? 'secondary' : 'outline'} aria-pressed={vy === 'formular'} onClick={() => setVy('formular')}>Formulär</Button>
          <Button type="button" variant={vy === 'tabell' ? 'secondary' : 'outline'} aria-pressed={vy === 'tabell'} onClick={() => { setFokus(0); setVy('tabell'); }}>Tabell</Button>
        </fieldset>
      </div>
      {!kalla ? <p className="empty-state">{besked ?? 'Undervisningarna visas när underlaget är läst.'}</p>
        : rader.length === 0 ? <p className="empty-state">Underlaget har inga undervisningar att ange salbehov för.</p>
        : vy === 'formular' ? <Salbehov key={vald || rader[0].ref} v={v} register={register} rader={rader} vald={vald || rader[0].ref} fokus={fokus}
          onVald={ref => { setFokus(0); setVald(ref); }} disabled={disabled} onChange={onChange}/>
        : <Saltabell villkor={v} rader={rader} disabled={disabled} onChange={onChange} onOppna={oppnaSalbehov}/>}
      {hinder.length > 0 && <div className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--warning-surface)' }} data-salhinder>
        <h3 className="font-semibold">Hinder</h3>
        <ul className="grid gap-2">{hinder.map(r => <li key={r.ref} className="flex flex-wrap items-center justify-between gap-2">
          <span><strong>{r.title} · {r.grupp}</strong> har ingen sal som uppfyller alla krav. {r.hinder}</span>
          <Button type="button" variant="outline" onClick={() => oppnaSalbehov(r.ref)}>Öppna salbehovet</Button></li>)}</ul>
      </div>}
    </>}
  </section>;
}

type Utkast = { id: string | null; name: string; typ: string; platser: string; utrustning: string };
const tomSal: Utkast = { id: null, name: '', typ: ALLMAN_SALTYP, platser: '', utrustning: '' };
function Register({ v, disabled: avstangd, onChange, skola }: Pick<SalarProps, 'disabled' | 'onChange' | 'skola'> & { v: SchemaVillkor }) {
  // I skolans register sparas ändringen direkt på servern och följer sedan med till utkastet; den ingår inte i Ångra.
  const iSkolan = v.salregister?.kalla === 'skola' && !!skola, [sparar, setSparar] = useState(false), disabled = avstangd || sparar || iSkolan && skola.status !== 'ok';
  const register = v.salregister ?? null, typer = useId(), [utkast, setUtkast] = useState<Utkast | null>(null), [besked, setBesked] = useState('');
  const kanSkapa = register !== null || v.salar.length === 0;
  const platser = utkast?.platser.trim() === '' ? null : Number(utkast?.platser), name = utkast?.name.trim() ?? '';
  const utrustning = (utkast?.utrustning ?? '').split(',').map(x => x.trim()).filter(Boolean).filter((x, i, all) => all.findIndex(y => lika(x, y)) === i);
  const fel = !utkast ? null : !name ? 'Ange salens namn.' : name.length > SCHEMA_SAL_LIMITS.namn ? `Namnet får vara högst ${SCHEMA_SAL_LIMITS.namn} tecken.`
    : !salnamnLedigt(v, name, utkast.id ?? undefined) ? 'En annan sal har redan det namnet.'
    : platser !== null && (!Number.isSafeInteger(platser) || platser < SCHEMA_SAL_LIMITS.platser[0] || platser > SCHEMA_SAL_LIMITS.platser[1]) ? 'Platser ska vara ett heltal från 1, eller lämnas tomt om antalet är okänt.'
    : utkast.typ.trim().length > SCHEMA_SAL_LIMITS.typ || utrustning.length > SCHEMA_SAL_LIMITS.utrustning || utrustning.some(x => x.length > SCHEMA_SAL_LIMITS.tagg) ? 'Saltyp och utrustning får vara högst 40 tecken, och högst 12 slag av utrustning.' : null;
  /** Skolans register: hela registret sparas; utkastet följer med när det lästs in igen. `true` om det gick. */
  const iSkolansRegister = async (next: SchemaVillkor) => {
    if (!skola || !next.salregister) return false;
    setSparar(true);
    const fel = await skola.spara({ nasta: next.salregister.nasta, salar: next.salregister.salar });
    setSparar(false); if (fel) setBesked(fel);
    return fel === null;
  };
  const spara = async () => {
    if (!utkast || fel) return;
    const sal = { name, typ: utkast.typ.trim(), platser, utrustning }, next = utkast.id ? andraSal(v, utkast.id, sal) : laggTillSal(v, sal);
    if (iSkolan) { if (!await iSkolansRegister(next)) return; setBesked(`${name} är ${utkast.id ? 'ändrad' : 'tillagd'} i skolans salregister.`); }
    else { onChange(next, utkast.id ? `Sal ${name} ändrad` : `Sal ${name} tillagd`); setBesked(''); }
    setUtkast(null);
  };
  const taBort = async (sal: SchemaSal) => {
    const { villkor, berorda } = taBortSal(v, sal.id);
    const behov = berorda.length ? ` ${berorda.length} salbehov pekade på salen och har ändrats; ett krav som bara gällde den salen är nu obesvarat.` : '';
    if (iSkolan) {
      if (!await iSkolansRegister(villkor)) return;
      setBesked(`${sal.name} är borttagen ur skolans salregister och gäller inte längre i något schemautkast för skolan.${behov} Pass som låg i salen står utan sal tills de får en ny.`);
      return;
    }
    onChange(villkor, `Sal ${sal.name} borttagen`);
    setBesked(`${sal.name} är borttagen.${behov} Pass som låg i salen får en annan tillåten sal vid nästa kontroll eller står utan sal. Borttagningen går att ångra.`);
  };
  return <div className="space-y-3" data-salregister>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h3 className="font-semibold">Salregister{register ? ` (${register.salar.length})` : ''}</h3>
      {kanSkapa && !utkast && <Button type="button" variant="outline" disabled={disabled || (register?.salar.length ?? 0) >= SCHEMA_SAL_LIMITS.salar} onClick={() => setUtkast(tomSal)}>Lägg till sal</Button>}
    </div>
    {register && <p className="schema-note">Varje sal har ett fast ID. Ett nytt namn eller en ny ordning ändrar inte vilken sal schemat pekar på.{iSkolan ? ' Registret gäller hela skolan och alla schemautkast. Ändringar sparas direkt och ingår inte i Ångra.' : ''}</p>}
    {iSkolan && skola.status === 'laddar' && <p className="schema-note">Läser skolans salregister…</p>}
    {iSkolan && skola.status === 'fel' && <p className="text-destructive" role="alert">{skola.fel ?? 'Skolans salregister kunde inte läsas.'} Salarna kan inte ändras just nu.</p>}
    {register && register.salar.length > 0 && <div className="max-h-96 overflow-auto rounded-md border border-border">
      <Table><TableHeader><TableRow><TableHead>Sal</TableHead><TableHead>Typ</TableHead><TableHead>Platser</TableHead><TableHead>Utrustning</TableHead><TableHead>ID</TableHead><TableHead><span className="sr-only">Åtgärder</span></TableHead></TableRow></TableHeader>
        <TableBody>{register.salar.map(s => <TableRow key={s.id} data-sal={s.id}>
          <TableCell className="whitespace-normal font-medium">{s.name}</TableCell><TableCell className="whitespace-normal">{s.typ || 'Ej angiven'}</TableCell>
          <TableCell>{s.platser ?? 'Ej angivet'}</TableCell><TableCell className="whitespace-normal">{s.utrustning.join(', ') || '–'}</TableCell><TableCell className="text-muted-foreground">{s.id}</TableCell>
          <TableCell><div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ändra sal ${s.name}`} onClick={() => setUtkast({ id: s.id, name: s.name, typ: s.typ, platser: s.platser === null ? '' : String(s.platser), utrustning: s.utrustning.join(', ') })}>Ändra</Button>
            <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort sal ${s.name}`} onClick={() => void taBort(s)}>Ta bort</Button></div></TableCell>
        </TableRow>)}</TableBody></Table></div>}
    {register && register.salar.some(s => s.platser === null) && <p className="schema-note">Saknat antal platser betyder att kapaciteten inte är kontrollerad, inte att salen rymmer alla.</p>}
    {!register && kanSkapa && !utkast && <p className="empty-state">Inga salar är registrerade. Lägg till skolans salar för att kunna ange salbehov.</p>}
    {besked && <output className="schema-note block">{besked}</output>}
    {utkast && <fieldset className="rounded-md border border-border p-3 grid gap-3 sm:grid-cols-2" data-salform><legend className="px-1 text-sm font-medium">{utkast.id ? 'Ändra sal' : 'Ny sal'}</legend>
      <label htmlFor={`${typer}-namn`} className="grid gap-1 text-sm">Salens namn<Input id={`${typer}-namn`} value={utkast.name} maxLength={SCHEMA_SAL_LIMITS.namn} onChange={e => setUtkast({ ...utkast, name: e.target.value })}/></label>
      <label htmlFor={`${typer}-typ`} className="grid gap-1 text-sm">Saltyp<Input id={`${typer}-typ`} value={utkast.typ} maxLength={SCHEMA_SAL_LIMITS.typ} list={typer} onChange={e => setUtkast({ ...utkast, typ: e.target.value })}/>
        <datalist id={typer}>{SALTYP_FORSLAG.map(t => <option key={t} value={t}>{t}</option>)}</datalist>
        <span className="schema-note">Allmän sal kan användas av undervisning utan särskilda krav.</span></label>
      <label htmlFor={`${typer}-platser`} className="grid gap-1 text-sm">Platser<Input id={`${typer}-platser`} type="number" inputMode="numeric" min={1} max={SCHEMA_SAL_LIMITS.platser[1]} value={utkast.platser} onChange={e => setUtkast({ ...utkast, platser: e.target.value })}/>
        <span className="schema-note">Lämna tomt om antalet är okänt. Kapaciteten kontrolleras då inte.</span></label>
      <label htmlFor={`${typer}-utr`} className="grid gap-1 text-sm">Utrustning<Input id={`${typer}-utr`} value={utkast.utrustning} onChange={e => setUtkast({ ...utkast, utrustning: e.target.value })}/>
        <span className="schema-note">Skilj med kommatecken, till exempel dragskåp, projektor.</span></label>
      {fel && (utkast.name || utkast.id) && <p className="text-destructive sm:col-span-2" role="alert">{fel}</p>}
      <div className="flex flex-wrap gap-2 sm:col-span-2">
        <Button type="button" disabled={disabled || fel !== null} onClick={() => void spara()}>{sparar ? 'Sparar…' : utkast.id ? 'Spara salen' : 'Lägg till salen'}</Button>
        <Button type="button" variant="outline" onClick={() => setUtkast(null)}>Avbryt</Button></div>
    </fieldset>}
  </div>;
}

type Lage = SchemaSalbehovLage | 'obesvarat';
type Varde = Omit<SchemaSalbehov, 'slag' | 'ref'>;
const LAGEN: { lage: Lage; namn: string; text: string }[] = [
  { lage: 'obesvarat', namn: 'Obesvarat', text: 'Inget salbehov är angivet. Passen läggs utan sal.' },
  { lage: 'allman', namn: salbehovLageNamn.allman, text: 'Vilken allmän sal som helst med plats för gruppen.' },
  { lage: 'sarskild', namn: salbehovLageNamn.sarskild, text: 'Saltyp, utrustning eller bestämd sal. Alla krav måste uppfyllas.' },
  { lage: 'ingen', namn: salbehovLageNamn.ingen, text: 'Ange undervisningsform, till exempel utomhus eller på arbetsplats.' }];

/** Salbehov för en undervisning eller för hela ämnet. Inget ändras förrän Spara salbehov; Avbryt återställer formuläret. */
function Salbehov({ v, register, rader, vald, fokus, onVald, disabled, onChange }: Pick<SalarProps, 'disabled' | 'onChange'> & {
  v: SchemaVillkor; register: SchemaSalregister; rader: SaltabellRad[]; vald: string; fokus: number; onVald: (ref: string) => void;
}) {
  const namn = useId(), rad = rader.find(r => r.ref === vald) ?? rader[0];
  const fokusfalt = useRef<HTMLInputElement>(null);
  useEffect(() => { if (fokus) fokusfalt.current?.focus(); }, [fokus]);
  const amnets = v.salbehov?.find(b => b.slag === 'amne' && b.ref === rad.title) ?? null, eget = v.salbehov?.find(b => b.slag === 'undervisning' && b.ref === rad.ref) ?? null;
  const [galler, setGaller] = useState<'undervisning' | 'amne'>(eget || !amnets ? 'undervisning' : 'amne');
  const sparat: Varde | null = (galler === 'amne' ? amnets : eget ?? null) && (({ slag: _s, ref: _r, ...rest }) => rest)((galler === 'amne' ? amnets : eget)!);
  const [utkast, setUtkast] = useState<{ lage: Lage; varde: Varde }>(() => sparat ? { lage: sparat.lage, varde: sparat } : { lage: 'obesvarat', varde: tomtSalbehov('allman') });
  const bytGaller = (next: 'undervisning' | 'amne') => { const b = next === 'amne' ? amnets : eget; setGaller(next); setUtkast(b ? { lage: b.lage, varde: (({ slag: _s, ref: _r, ...rest }) => rest)(b) } : { lage: 'obesvarat', varde: tomtSalbehov('allman') }); };
  const kandidat: Varde | null = utkast.lage === 'obesvarat' ? null : { ...utkast.varde, lage: utkast.lage, ...(utkast.lage === 'ingen' ? { typ: null, utrustning: [], salar: [], onskad: [], form: utkast.varde.form ?? 'annat' } : { form: null }),
    ...(utkast.lage === 'allman' ? { typ: null, utrustning: [], salar: [] } : {}) };
  const ref = galler === 'amne' ? rad.title : rad.ref;
  const fel = kandidat ? salbehovFel(kandidat, new Set(register.salar.map(s => s.id))) : null;
  const andrat = JSON.stringify(kandidat) !== JSON.stringify(sparat);
  const urval = kandidat && !fel ? lampligaSalar(register, kandidat, rad.elever) : null;
  const typer = [...new Set(register.salar.map(s => s.typ).filter(Boolean))], utrustning = [...new Set([...register.salar.flatMap(s => s.utrustning), ...utkast.varde.utrustning].map(x => x.toLocaleLowerCase('sv')))].sort();
  const medSammaAmne = rader.filter(r => r.title === rad.title).length;
  const satt = (del: Partial<Varde>) => setUtkast({ ...utkast, varde: { ...utkast.varde, ...del } });
  const vaxla = (lista: string[], x: string, pa: boolean) => pa ? [...lista, x] : lista.filter(y => y !== x);
  const spara = () => { onChange(sattSalbehov(v, galler, ref, kandidat), `Salbehov för ${rad.title}${galler === 'amne' ? '' : ` · ${rad.grupp}`}`); };
  return <div className="rounded-md border border-border p-3 space-y-3" data-salbehov>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="grid gap-1 text-sm">Undervisning<select className={FALT} value={rad.ref} onChange={e => onVald(e.target.value)}>
        {rader.map(r => <option key={r.ref} value={r.ref}>{r.title} · {r.grupp}{r.behov === null ? ' (obesvarat)' : ''}</option>)}</select></label>
      <p className="self-end schema-note">{rad.elever === null ? 'Elevantalet är okänt: kapaciteten kan inte kontrolleras.' : `${rad.elever} elever i gruppen.`} Gällande salbehov: {salbehovText(rad.behov, register)}{rad.kalla === 'amne' ? ' (ärvt från ämnet)' : rad.kalla === 'eget' ? ' (eget undantag)' : ''}.</p>
    </div>
    <fieldset className="grid gap-1"><legend className="text-sm font-medium">Salbehovet gäller</legend>
      <label className={KRYSS}><input type="radio" name={`${namn}-galler`} checked={galler === 'undervisning'} onChange={() => bytGaller('undervisning')}/>Bara {rad.title} · {rad.grupp}{amnets ? ' (eget undantag från ämnet)' : ''}</label>
      <label className={KRYSS}><input type="radio" name={`${namn}-galler`} checked={galler === 'amne'} onChange={() => bytGaller('amne')}/>Ämnet {rad.title}: {medSammaAmne} {medSammaAmne === 1 ? 'undervisning' : 'undervisningar'} utan eget undantag ärver värdet</label>
    </fieldset>
    <fieldset className="grid gap-1" disabled={disabled}><legend className="text-sm font-medium">Behöver undervisningen sal?</legend>
      {LAGEN.map(l => <div key={l.lage}><label className={`${KRYSS} font-semibold`}><input type="radio" name={`${namn}-lage`} aria-describedby={`${namn}-${l.lage}`}
        ref={utkast.lage === l.lage ? fokusfalt : undefined}
        checked={utkast.lage === l.lage} onChange={() => setUtkast({ ...utkast, lage: l.lage })}/>{l.namn}</label>
        <p id={`${namn}-${l.lage}`} className="schema-note pl-6">{l.text}</p></div>)}
    </fieldset>
    {utkast.lage === 'sarskild' && <fieldset className="grid gap-3" disabled={disabled}><legend className="text-sm font-medium">Krav som alla måste uppfyllas</legend>
      <label className="grid gap-1 text-sm">Saltyp<select className={FALT} value={utkast.varde.typ ?? ''} onChange={e => satt({ typ: e.target.value || null })}>
        <option value="">Ingen bestämd saltyp</option>{typer.map(t => <option key={t} value={t}>{t}</option>)}</select></label>
      {utrustning.length > 0 && <fieldset className="flex flex-wrap gap-x-4"><legend className="text-sm">Utrustning</legend>{utrustning.map(u => <label key={u} className={KRYSS}>
        <input type="checkbox" checked={utkast.varde.utrustning.some(x => lika(x, u))} onChange={e => satt({ utrustning: e.target.checked ? [...utkast.varde.utrustning, u] : utkast.varde.utrustning.filter(x => !lika(x, u)) })}/>{u}</label>)}</fieldset>}
      <fieldset className="flex flex-wrap gap-x-4"><legend className="text-sm">Bestämd sal (någon av de valda)</legend>{register.salar.map(s => <label key={s.id} className={KRYSS}>
        <input type="checkbox" checked={utkast.varde.salar.includes(s.id)} onChange={e => satt({ salar: vaxla(utkast.varde.salar, s.id, e.target.checked) })}/>{s.name}</label>)}</fieldset>
    </fieldset>}
    {(utkast.lage === 'allman' || utkast.lage === 'sarskild') && <fieldset className="flex flex-wrap gap-x-4" disabled={disabled}><legend className="text-sm font-medium">Önskad sal <span className="schema-note">(önskemål, inte krav; vägs inte av schemamotorn ännu)</span></legend>
      {register.salar.map(s => <label key={s.id} className={KRYSS}><input type="checkbox" checked={utkast.varde.onskad.includes(s.id)} onChange={e => satt({ onskad: vaxla(utkast.varde.onskad, s.id, e.target.checked) })}/>Helst {s.name}</label>)}</fieldset>}
    {utkast.lage === 'ingen' && <label className="grid gap-1 text-sm sm:max-w-sm">Undervisningsform<select className={FALT} disabled={disabled} value={utkast.varde.form ?? 'annat'} onChange={e => satt({ form: e.target.value as SchemaUndervisningsform })}>
      {SCHEMA_UNDERVISNINGSFORMER.map(f => <option key={f} value={f}>{UNDERVISNINGSFORM_NAMN[f]}</option>)}</select></label>}
    {fel && <p className="text-destructive" role="alert">{fel}</p>}
    {urval && <div className="space-y-2" data-lampliga>
      <h4 className="text-sm font-medium">Lämpliga och olämpliga salar</h4>
      <ul className="grid gap-1">{urval.rader.map(r => <li key={r.sal.id} className="flex flex-wrap items-baseline justify-between gap-2 rounded-md border border-border px-3 py-2">
        <span><strong>{r.sal.name}</strong>{r.sal.platser !== null ? ` · ${r.sal.platser} platser` : ' · platser ej angivna'}{r.sal.utrustning.length ? ` · ${r.sal.utrustning.join(', ').toLocaleLowerCase('sv')}` : ''}
          {!r.lamplig && <span className="schema-note block">{r.skal.join(' ')}</span>}
          {r.lamplig && r.kapacitet === 'okand' && <span className="schema-note block">Kapaciteten är inte kontrollerad.</span>}</span>
        <span className={`status-badge ${r.lamplig ? 'success' : ''}`}>{r.lamplig ? 'Lämplig' : 'Olämplig'}</span></li>)}</ul>
      {urval.hinder ? <output className="block rounded-md border border-border p-3" style={{ background: 'var(--warning-surface)' }}><strong>Hinder:</strong> {urval.hinder} Passen läggs utan sal om salbehovet sparas så här.</output>
        : <p className="schema-note">{urval.tillatna.length} {urval.tillatna.length === 1 ? 'lämplig sal' : 'lämpliga salar'}.{(() => { const delas = urval.tillatna.length === 1 ? rader.filter(r => r.ref !== rad.ref && r.lampliga !== null && r.behov?.lage !== 'ingen' && lampligaSalar(register, r.behov!, r.elever).tillatna.includes(urval.tillatna[0])).length : 0;
          return delas ? ` ${register.salar.find(s => s.id === urval.tillatna[0])?.name} behövs också av ${delas} ${delas === 1 ? 'annan undervisning' : 'andra undervisningar'}.` : ''; })()}</p>}
    </div>}
    <div className="flex flex-wrap gap-2">
      <Button type="button" disabled={disabled || !andrat || fel !== null} onClick={spara}>Spara salbehov</Button>
      <Button type="button" variant="outline" disabled={!andrat} onClick={() => bytGaller(galler)}>Avbryt</Button>
      {!andrat && <span className="schema-note self-center">Inga osparade ändringar i formuläret.</span>}
    </div>
  </div>;
}

/**
 * Uttrycklig överföring till skolans salregister (05.2-SM-UXF-23). Visar vilka salar som redan finns och vilka som läggs till innan något sparas.
 * Äldre salnamn blir sal-n i listans ordning; utkastets eget register behåller sina ID. Konflikter stoppar överföringen.
 */
function Overforing({ v, skola, disabled, onChange }: Pick<SalarProps, 'disabled' | 'onChange'> & { v: SchemaVillkor; skola: Skolsalar }) {
  const [sparar, setSparar] = useState(false), [fel, setFel] = useState('');
  if (skola.status !== 'ok') return null;
  const o = overforingTillSkolan(v, skola.register?.document ?? null);
  if (!o) return null;
  const nya = o.rader.filter(r => !r.finns).length;
  const forOver = async () => {
    setSparar(true); const svar = await skola.spara(o.dokument); setSparar(false);
    if (svar) { setFel(svar); return; }
    onChange(o.villkor, 'Salarna förda till skolans salregister');
  };
  return <div className="rounded-md border border-border p-3 space-y-2" style={{ background: 'var(--info-surface)' }} data-overforing>
    <p><strong>{v.salregister ? 'Utkastet har ett eget salregister.' : `${v.salar.length} ${v.salar.length === 1 ? 'sal finns' : 'salar finns'} som namn från äldre villkor.`}</strong> Salar hör nu till skolan och gäller i alla schemautkast. Utkastets salar gäller som förut tills du för över dem.</p>
    <ul className="list-disc pl-5" aria-label="Salar som förs över">{o.rader.map(r => <li key={r.id}>{r.name}: {r.finns ? 'finns redan i skolans salregister' : 'läggs till i skolans salregister'}</li>)}</ul>
    {o.konflikter.length > 0 ? <div role="alert" className="space-y-1"><p className="font-medium">Salarna kan inte föras över:</p><ul className="list-disc pl-5">{o.konflikter.map(k => <li key={k}>{k}</li>)}</ul>
      <p className="schema-note">Byt namn på salen i skolans salregister eller i utkastet så att nummer och namn stämmer, och försök igen.</p></div>
      : <p className="schema-note">Salarna behåller sina nummer, så lagda pass ligger kvar i samma sal. Villkor och salbehov följer med.{nya ? ` ${nya} ${nya === 1 ? 'sal läggs' : 'salar läggs'} till i skolans register.` : ''}</p>}
    {fel && <p className="text-destructive" role="alert">{fel}</p>}
    <Button type="button" variant="outline" disabled={disabled || sparar || o.konflikter.length > 0} onClick={() => void forOver()}>{sparar ? 'För över…' : 'För över till skolans salregister'}</Button>
  </div>;
}
