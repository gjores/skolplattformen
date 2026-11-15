'use client';
// Samlingsvyn (05.2-SM-SAMLINGSVY, design/Samlingsvy.dc.html; research I51, I54–I59): schemaläggaren väljer fritt vilka klasser, grupper, lärare, salar
// och (för behörig) elever som visas tillsammans, sparar urvalet som arbetsvy i webbläsaren, ser gemensam ledig tid och hittar lediga lärare och salar.
// Följ passet är ett läge av samma vy: där kommer raderna från passet, och samma "Lägg till" och "Spara som arbetsvy" finns där (`SamlingFolj`).
// Allt ritas ur förslaget med utkastets placeringar. Elevlistan och en elevs pass läses med Följ passets rutt och finns bara i minnet. Inget sparas på servern.
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CheckIcon, PlusIcon, Rows3Icon, SaveIcon, SearchIcon, TableIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError } from '@/lib/server-client.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaPlacement, type SchemaTerm, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { elevKrockar, parseSchemaFolj, type FoljRad, type SchemaFoljElev } from '@/lib/schema-folj.ts';
import { SCHEMA_LAGER, lagerPa, schemaLager } from '@/lib/schema-lager.ts';
import { ARBETSVY_GRANS, SAMLING_FARG, arbetsvyAv, arbetsvyNyckel, arbetsvyResurser, dopOmArbetsvy, filtreraSamling, gemensamLedigTid, haltider, lunchtryck, medArbetsvy,
  parseArbetsvyer, passFarg, samlingKandidater, samlingNyckel, samlingRader, tomtFilter, type Arbetsvy, type SamlingFarg, type SamlingFilter, type SamlingKandidat,
  type SamlingResurs, type SamlingTid } from '@/lib/schema-samling.ts';
import { TERM, clock, dayName } from './delat.ts';
import { storedLager } from './lager.tsx';
import { MATRIS_SLAG, Matris, SamlingRad, type MatrisSlag, type RadFalt, type RadFarg } from './samling-matris.tsx';
import { LaggTill, LedigSok } from './samling-sok.tsx';
import { veckansSpann } from './vecka.tsx';

/** Det Följ passet får av samlingsvyn: tillagda rader, knappen som tar bort en tillagd rad och knapparna "Lägg till" och "Spara som arbetsvy". */
export type SamlingFolj = {
  rader: (visas: (l: SchemaForslag['lessons'][number]) => boolean) => FoljRad[];
  taBort: (key: string, name: string) => ReactNode;
  verktyg: (passetsRader: FoljRad[]) => ReactNode;
};
type Val = {
  forslag: SchemaForslag | null; unitId: string;
  /** Villkoren i formuläret (lagren följer dem direkt) och villkoren som prövas (begäran till Följ passets rutt). */
  villkor: SchemaVillkor; provade: SchemaVillkor;
  placements: SchemaPlacement[];
  /** Terminen veckan visar; filtrets termin går före. */
  term: SchemaTerm;
  /** Pass med regelavvikelse enligt kontrollen. */
  flagged: ReadonlySet<string>;
  /** Visar samlingsvyn i vyväljaren. */
  oppna: () => void; onSessionLost: () => void;
};
type Elev = { id: string; name: string; via: string };
const EXTRA_LAGER = [{ id: 'haltid', namn: 'Håltid' }, { id: 'lunchtryck', namn: 'Lunchtryck' }] as const;
const LAGER = [...SCHEMA_LAGER, ...EXTRA_LAGER];
const lagerVisas = (lager: Record<string, boolean>, id: string) => SCHEMA_LAGER.some(x => x.id === id) ? lagerPa(lager, id as typeof SCHEMA_LAGER[number]['id']) : lager[id] === true;
const lasVyer = (unitId: string): Arbetsvy[] => { try { return parseArbetsvyer(window.localStorage.getItem(arbetsvyNyckel(unitId))); } catch { return []; } };

/** Följ passets rutt: grupper och elevlista för ett pass, eller en elevs pass. Samma begäran som Följ passet gör. */
async function lasFolj(f: SchemaForslag, s: { provade: SchemaVillkor; placements: SchemaPlacement[] }, lesson: string, pupilId: string | null, signal: AbortSignal) {
  return parseSchemaFolj(await api.post<unknown>('/api/schema/folj', { contractVersion: SCHEMA_CONTRACT_VERSION, unitId: f.unitId, schoolYear: f.schoolYear, period: f.period,
    villkor: s.provade, grundFingerprint: f.grundFingerprint, placements: s.placements, lesson, pupilId }, signal), f.grundFingerprint, lesson);
}

export function useSamling({ forslag, unitId, villkor, provade, placements, term, flagged, oppna, onSessionLost }: Val) {
  const id = useId();
  const [resurser, setResurser] = useState<SamlingResurs[]>([]), [markerade, setMarkerade] = useState<string[]>([]), [extra, setExtra] = useState<SamlingResurs[]>([]);
  const [lage, setLage] = useState<'rader' | 'matris'>('rader'), [matris, setMatris] = useState<MatrisSlag>('larare'), [dag, setDag] = useState<number | null>(null);
  const [lager, setLager] = useState<Record<string, boolean>>(() => storedLager()), [farg, setFarg] = useState<SamlingFarg>('amne'), [filter, setFilter] = useState<SamlingFilter>(tomtFilter);
  const [vyer, setVyer] = useState<Arbetsvy[]>(() => lasVyer(unitId)), [aktiv, setAktiv] = useState<string | null>(null);
  const [form, setForm] = useState<{ typ: 'spara' | 'dopom'; namn: string; resurser: SamlingResurs[]; kalla: 'samling' | 'folj';
    /** Rader i Följ passet som inte går att spara: grupper som bara delar elever med passet har ingen egen rad i förslaget. */
    utan?: number } | null>(null);
  const [sok, setSok] = useState<'samling' | 'folj' | null>(null), [ledig, setLedig] = useState<SamlingTid | null>(null), [ledigAmne, setLedigAmne] = useState<string | null>(null);
  // Elever per klass eller grupp som visas (null: servern gav ingen lista) och valda elevers pass. Bara i minnet, och bara för förslaget de lästes för.
  const [elevlistor, setElevlistor] = useState<Record<string, Elev[] | null>>({}), [elevData, setElevData] = useState<Record<string, SchemaFoljElev>>({});
  const [status, setStatus] = useState(''), [foljStatus, setFoljStatus] = useState('');
  const rubrik = useRef<HTMLHeadingElement | null>(null), fokus = useRef(false), namnFalt = useRef<HTMLInputElement | null>(null);
  const senaste = useRef({ provade, placements, onSessionLost });
  useEffect(() => { senaste.current = { provade, placements, onSessionLost }; });
  useEffect(() => { if (fokus.current && rubrik.current) { fokus.current = false; rubrik.current.focus(); } });
  // Namnformuläret får fokus när det öppnas.
  const formOppet = form ? `${form.typ}|${form.kalla}` : '';
  useEffect(() => { if (formOppet) namnFalt.current?.focus(); }, [formOppet]);
  // Ett nytt förslag: elevlistor och elevrader gäller inte längre. Övriga rader står kvar om de finns i det nya förslaget.
  const grund = forslag?.fingerprint ?? '', [last, setLast] = useState(grund);
  if (last !== grund) { setLast(grund); setElevlistor({}); setElevData({}); setResurser(r => r.filter(x => x.slag !== 'elev')); setExtra([]); setLedig(null); }

  // Elevlistan för nästa klass eller grupp som visas, när sökningen är öppen. Servern ger listan bara till den som får se elever.
  useEffect(() => {
    if (!forslag || sok !== 'samling') return;
    const r = resurser.find(x => (x.slag === 'klass' || x.slag === 'grupp') && !(x.id in elevlistor));
    if (!r) return;
    const controller = new AbortController(), f = forslag;
    void (async () => {
      let lista: Elev[] | null = null;
      try {
        // Ett pass för hela klassen ger klassens elever; högst tre pass prövas.
        for (const l of f.lessons.filter(x => x.classIds.length === 1 && x.classIds[0] === r.id).slice(0, 3)) {
          const svar = await lasFolj(f, senaste.current, l.id, null, controller.signal);
          if (!svar.elever) break;
          lista = svar.elever.map(e => ({ ...e, via: l.id }));
          if (svar.grupper.some(g => g.delar === null && g.id === r.id)) break;
        }
      } catch (caught) {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) { senaste.current.onSessionLost(); return; }
        lista = null;
      }
      if (!controller.signal.aborted) setElevlistor(x => ({ ...x, [r.id]: lista }));
    })();
    return () => controller.abort();
  }, [forslag, sok, resurser, elevlistor]);
  // En vald elevs pass. Går det inte att läsa tas raden bort med besked.
  useEffect(() => {
    const r = forslag ? resurser.find(x => x.slag === 'elev' && x.via && !(x.id in elevData)) : undefined;
    if (!forslag || !r) return;
    const controller = new AbortController();
    lasFolj(forslag, senaste.current, r.via!, r.id, controller.signal)
      .then(svar => { if (svar.elev) setElevData(x => ({ ...x, [r.id]: svar.elev! })); else throw new TypeError('elev'); })
      .catch((caught: unknown) => {
        if (controller.signal.aborted) return;
        if (caught instanceof ApiError && caught.status === 401) { senaste.current.onSessionLost(); return; }
        setResurser(x => x.filter(y => y !== r)); setStatus('Elevens schema kunde inte hämtas. Raden är borttagen.');
      });
    return () => controller.abort();
  }, [forslag, resurser, elevData]);

  // Passen i terminen som visas, och av dem passen i de valda ämnena. Ledig tid, håltid och lunchtryck räknas på alla ämnen.
  const iTermin = useMemo(() => forslag ? filtreraSamling(forslag.lessons, { amnen: [], termin: filter.termin }, term) : [], [forslag, filter.termin, term]);
  const visade = useMemo(() => forslag ? filtreraSamling(forslag.lessons, filter, term) : [], [forslag, filter, term]);
  const fargFor: RadFarg = useMemo(() => { const f = forslag; return l => passFarg(f ?? { lessons: [], teachers: [], rooms: [] }, farg, l, flagged); }, [forslag, farg, flagged]);

  function sparaVyer(next: Arbetsvy[]) {
    setVyer(next);
    try { window.localStorage.setItem(arbetsvyNyckel(unitId), JSON.stringify(next)); } catch { /* utan lagring finns arbetsvyerna tills sidan lämnas */ }
  }
  function laggTill(r: SamlingResurs, name: string) {
    setResurser(x => x.some(y => samlingNyckel(y) === samlingNyckel(r)) ? x : [...x, r]);
    setStatus(`${name} visas i samlingsvyn.`);
  }
  function taBort(key: string, name: string) {
    setResurser(x => x.filter(y => samlingNyckel(y) !== key)); setMarkerade(x => x.filter(y => y !== key));
    setStatus(`${name} är borttagen ur samlingsvyn.`);
  }
  function valjVy(namn: string) {
    const vy = vyer.find(x => x.namn === namn);
    if (!forslag || !vy) { setAktiv(null); return; }
    const { resurser: valda, saknas } = arbetsvyResurser(forslag, vy);
    setResurser(valda); setMarkerade([]); setLager(vy.lager); setFilter(vy.filter); setFarg(vy.farg); setAktiv(vy.namn); setLage('rader');
    setStatus(`Arbetsvyn ${vy.namn} visas med ${valda.length} ${valda.length === 1 ? 'rad' : 'rader'}.${saknas ? ` ${saknas} ${saknas === 1 ? 'sparad rad finns' : 'sparade rader finns'} inte i det här förslaget.` : ''}`);
  }
  function sparaForm() {
    if (!forslag || !form || !form.namn.trim()) return;
    if (form.typ === 'dopom') {
      const next = dopOmArbetsvy(vyer, aktiv ?? '', form.namn), nytt = form.namn.trim().slice(0, ARBETSVY_GRANS.namn);
      if (next === vyer) { setStatus(`Det finns redan en arbetsvy som heter ${nytt}. Välj ett annat namn.`); return; }
      sparaVyer(next); setAktiv(nytt); setStatus(`Arbetsvyn heter nu ${nytt}.`);
    } else {
      const sparad = arbetsvyAv(forslag, form.namn, form.resurser, lager, filter, farg), vy = sparad.vy, utan = sparad.utan + (form.utan ?? 0);
      sparaVyer(medArbetsvy(vyer, vy));
      if (form.kalla === 'samling') setAktiv(vy.namn);
      (form.kalla === 'folj' ? setFoljStatus : setStatus)(`Arbetsvyn ${vy.namn} är sparad i den här webbläsaren med ${vy.resurser.length} ${vy.resurser.length === 1 ? 'rad' : 'rader'}.${utan ? ` ${utan} ${utan === 1 ? 'rad sparas' : 'rader sparas'} inte: elever och grupper utan egen rad i förslaget.` : ''}${form.kalla === 'folj' ? ' Öppna den i Samlingsvy.' : ''}`);
    }
    setForm(null);
  }
  const namnForm = form && <form className="samling-namnform" onSubmit={e => { e.preventDefault(); sparaForm(); }}>
    <label>Namn på arbetsvyn<input ref={namnFalt} type="text" required onKeyDown={e => { if (e.key === 'Escape') setForm(null); }} maxLength={ARBETSVY_GRANS.namn} value={form.namn} onChange={e => setForm({ ...form, namn: e.target.value })}/></label>
    <Button type="submit">{form.typ === 'dopom' ? 'Byt namn' : 'Spara arbetsvyn'}</Button>
    <Button type="button" variant="outline" onClick={() => setForm(null)}>Avbryt</Button>
    {form.typ === 'spara' && vyer.some(x => x.namn === form.namn.trim()) && <p className="schema-note">En arbetsvy med det namnet finns redan och ersätts.</p>}
  </form>;
  const meddelande = <output aria-live="polite" className="schema-note samling-status">{status}</output>;

  let vy: ReactNode | undefined;
  if (forslag) {
    const f = forslag, kandidater = samlingKandidater(f), { start, end } = veckansSpann(f.days);
    const finns = resurser.filter(r => r.slag === 'elev' ? r.id in elevData : kandidater.some(k => samlingNyckel(k) === samlingNyckel(r)));
    const rader = samlingRader(f, finns, visade, elevData), allaAmnen = samlingRader(f, finns, iTermin, elevData);
    const valda = new Set(resurser.map(samlingNyckel)), krock = elevKrockar(allaAmnen);
    const dagar = dag === null ? undefined : [dag], visadeDagar = dagar ?? f.days.map((_, d) => d);
    const mark = allaAmnen.filter(r => markerade.includes(r.key)), gemensam = gemensamLedigTid(f.days, mark, villkor.minLessonMin);
    const tryck = lagerVisas(lager, 'lunchtryck') ? lunchtryck(f, iTermin, villkor.lunch, kandidater.filter(k => k.slag === 'klass').map(k => k.id)) : [];
    const hogst = Math.max(1, ...tryck.map(t => t.klasser));
    const amnen = [...new Set(f.lessons.map(l => l.title))].sort((a, b) => a.localeCompare(b, 'sv')), terminer = f.time.terms.map(t => t.term), perTermin = f.lessons.some(l => l.term !== null);
    // Lagren för en rad: samma fält som veckan ritar för klassen eller läraren, och håltid.
    const faltFor = (r: SamlingResurs, i: number): RadFalt[] => {
      const out: RadFalt[] = [];
      if (r.slag === 'klass' || r.slag === 'grupp' || r.slag === 'larare') {
        const l = schemaLager(villkor, f, { slag: r.slag === 'larare' ? 'larare' : 'klass', ref: r.id }, { lessons: allaAmnen[i].lessons, alla: iTermin, layers: lager });
        out.push(...l.overlays.map(o => ({ day: o.day, startMin: o.startMin, endMin: o.endMin, klass: `falt-${o.kind}`, label: o.label })));
        for (const b of l.bands) {
          const p = allaAmnen[i].lessons.find(x => x.id === b.lesson);
          if (p) out.push({ day: p.day!, startMin: b.side === 'fore' ? p.startMin! - b.minutes : p.startMin! + p.durationMin, endMin: b.side === 'fore' ? p.startMin! : p.startMin! + p.durationMin + b.minutes, klass: 'falt-marginal', label: b.label });
        }
      }
      if (lagerVisas(lager, 'haltid')) out.push(...haltider(allaAmnen[i].lessons, villkor.breakMin).map(h => ({ ...h, klass: 'samling-haltid', label: `Håltid ${h.endMin - h.startMin} min`, text: `${h.endMin - h.startMin}` })));
      return out;
    };
    const valjTid = (day: number, minute: number) => {
      const d = f.days[day], startMin = Math.min(Math.max(d.startMin, Math.floor(minute / 10) * 10), d.endMin - 10);
      setLedig({ day, startMin, endMin: Math.min(d.endMin, startMin + 60) });
    };
    const elever: SamlingKandidat[] | null = (() => {
      const listor = resurser.flatMap(r => elevlistor[r.id] ?? []);
      return listor.length === 0 ? null : [...new Map(listor.map(e => [e.id, { slag: 'elev' as const, id: e.id, via: e.via, name: e.name }])).values()];
    })();
    const nycklar = [...new Map(rader.flatMap(r => r.lessons).map(l => { const x = fargFor(l); return [x.namn, x] as const; })).values()].sort((a, b) => a.namn.localeCompare(b.namn, 'sv', { numeric: true })).slice(0, 14);
    const pseudo = (key: string, name: string, detail: string): FoljRad => ({ key, slag: 'delar', name, detail, chip: name, lessons: [] });
    // Text i ett fält bara när den ryms: en dag i taget ger fem gånger så breda fält.
    const ryms = (t: SamlingTid, minuter: number) => (t.endMin - t.startMin) * (dag === null ? 1 : 5) >= minuter;
    const ledigText = (t: SamlingTid) => `${dayName(t.day).toLowerCase()} ${clock(t.startMin)}–${clock(t.endMin)}`;

    vy = <section className="folj samling" aria-labelledby={`${id}-rubrik`}>
      <div className="folj-huvud">
        <div>
          <p className="folj-overrad">Flera scheman samtidigt</p>
          <h2 id={`${id}-rubrik`} ref={rubrik} tabIndex={-1}>Samlingsvy{aktiv ? `: ${aktiv}` : ''}</h2>
          <p className="schema-note">Välj fritt vilka klasser, grupper, lärare och salar som visas tillsammans. Raderna har samma tidsaxel och följer utkastet. Urvalet kan sparas som arbetsvy i den här webbläsaren; inget sparas på servern.</p>
        </div>
        <div className="samling-arbetsvy">
          <label>Arbetsvy<select value={aktiv ?? ''} onChange={e => valjVy(e.target.value)}>
            <option value="">{vyer.length ? 'Ingen arbetsvy vald' : 'Inga sparade arbetsvyer'}</option>{vyer.map(x => <option key={x.namn} value={x.namn}>{x.namn}</option>)}</select></label>
          <Button type="button" variant="outline" disabled={!aktiv} onClick={() => setForm({ typ: 'dopom', namn: aktiv ?? '', resurser: [], kalla: 'samling' })}>Döp om</Button>
          <Button type="button" variant="outline" disabled={!aktiv} onClick={() => { sparaVyer(vyer.filter(x => x.namn !== aktiv)); setStatus(`Arbetsvyn ${aktiv} är borttagen. Raderna står kvar.`); setAktiv(null); }}>Ta bort arbetsvyn</Button>
        </div>
      </div>
      <div className="folj-chips"><span className="schema-note" id={`${id}-visas`}>Visas:</span>
        <ul aria-labelledby={`${id}-visas`}>{rader.map(r => <li key={r.key} className="folj-chip samling-chip">{r.chip}
          <button type="button" aria-label={`Ta bort ${r.name} ur samlingsvyn`} onClick={() => taBort(r.key, r.name)}><XIcon aria-hidden="true"/></button></li>)}</ul>
        <button type="button" className="schema-chip" onClick={() => setSok('samling')}><PlusIcon aria-hidden="true"/>Lägg till klass, grupp, lärare, sal eller elev</button>
        <button type="button" className="schema-chip" disabled={rader.length === 0} onClick={() => setForm({ typ: 'spara', namn: aktiv ?? '', resurser: finns, kalla: 'samling' })}><SaveIcon aria-hidden="true"/>Spara som arbetsvy</button>
      </div>
      {form?.kalla === 'samling' && namnForm}
      {sok === 'samling' && <LaggTill open onOpenChange={open => { if (!open) setSok(null); }} forslag={f} valda={valda} elever={elever} onValj={laggTill}/>}

      <div className="schema-filter samling-val">
        <ToggleGroup aria-label="Visa som" variant="outline" spacing={0} className="schema-verktyg-grupp" value={[lage]} onValueChange={next => { const valt = next.find(x => x !== lage); if (valt) setLage(valt as typeof lage); }}>
          <ToggleGroupItem value="rader" className="schema-verktyg-knapp"><Rows3Icon aria-hidden="true"/>Valda rader</ToggleGroupItem>
          <ToggleGroupItem value="matris" className="schema-verktyg-knapp"><TableIcon aria-hidden="true"/>Resursmatris</ToggleGroupItem>
        </ToggleGroup>
        {lage === 'matris' && <label>Matrisen visar<select value={matris} onChange={e => setMatris(e.target.value as MatrisSlag)}>{MATRIS_SLAG.map(x => <option key={x.id} value={x.id}>{x.namn}</option>)}</select></label>}
        <label>Dag<select value={dag ?? ''} onChange={e => setDag(e.target.value === '' ? null : Number(e.target.value))}>
          <option value="">Hela veckan</option>{f.days.map((_, d) => <option key={d} value={d}>{dayName(d)}</option>)}</select></label>
        <label>Färg efter<select value={farg} onChange={e => setFarg(e.target.value as SamlingFarg)}>{SAMLING_FARG.map(x => <option key={x.id} value={x.id}>{x.namn}</option>)}</select></label>
        <label>Filter: ämne<select value="" onChange={e => { if (e.target.value) setFilter({ ...filter, amnen: [...filter.amnen, e.target.value] }); }}>
          <option value="">Lägg till ämne</option>{amnen.filter(a => !filter.amnen.includes(a)).map(a => <option key={a} value={a}>{a}</option>)}</select></label>
        {perTermin && terminer.length > 1 && <label>Filter: termin<select value={filter.termin ?? ''} onChange={e => setFilter({ ...filter, termin: (e.target.value || null) as SchemaTerm | null })}>
          <option value="">Som veckan ({TERM[term]})</option>{terminer.map(t => <option key={t} value={t}>{TERM[t]}</option>)}</select></label>}
        <Button type="button" variant="outline" onClick={() => setLedig(ledig ?? { day: dag ?? 0, startMin: f.days[dag ?? 0].startMin, endMin: Math.min(f.days[dag ?? 0].endMin, f.days[dag ?? 0].startMin + 60) })}>
          <SearchIcon aria-hidden="true"/>Sök ledig lärare eller sal</Button>
      </div>
      {filter.amnen.length > 0 && <fieldset className="samling-filter"><legend className="schema-note">Visar bara ämnena:</legend>
        {filter.amnen.map(a => <span key={a} className="folj-chip samling-chip">{a}<button type="button" aria-label={`Ta bort filtret ${a}`} onClick={() => setFilter({ ...filter, amnen: filter.amnen.filter(x => x !== a) })}><XIcon aria-hidden="true"/></button></span>)}
        <Button type="button" variant="link" size="sm" onClick={() => setFilter({ ...filter, amnen: [] })}>Rensa filter</Button></fieldset>}
      <div className="schema-lagerval"><span id={`${id}-lager`} className="schema-note">Visa i raderna:</span>
        <ToggleGroup multiple aria-labelledby={`${id}-lager`} variant="outline" className="flex-wrap" value={LAGER.filter(x => lagerVisas(lager, x.id)).map(x => x.id)}
          onValueChange={next => setLager(Object.fromEntries(LAGER.map(x => [x.id, next.includes(x.id)])))}>
          {LAGER.map(x => <ToggleGroupItem key={x.id} value={x.id} className="schema-chip">{lagerVisas(lager, x.id) && <CheckIcon aria-hidden="true"/>}{x.namn}</ToggleGroupItem>)}
        </ToggleGroup></div>
      {meddelande}

      {lage === 'rader' && rader.length === 0
        ? <p className="empty-state">Inga rader ännu. Lägg till en klass, grupp, lärare eller sal, välj en arbetsvy eller hämta rader ur resursmatrisen.</p>
        : <div className="folj-rutnat samling-rutnat" data-lage={lage} style={{ '--span': end - start, '--first-hour': Math.ceil(start / 60) * 60 - start, '--days': visadeDagar.length } as CSSProperties}>
          <div className="folj-rad folj-dagar" aria-hidden="true"><div/>{visadeDagar.map(d => <div key={d}>{dayName(d)}</div>)}</div>
          {lage === 'rader' && mark.length >= 2 && <SamlingRad rad={pseudo('ledig', 'Gemensam ledig tid', `${mark.length} markerade rader`)} days={f.days} start={start} classes={f.classes} dagar={dagar}
            falt={gemensam.map(t => ({ ...t, klass: 'falt-fri', label: 'Alla markerade är lediga', text: ryms(t, 150) ? `${clock(t.startMin)}–${clock(t.endMin)}` : ryms(t, 75) ? clock(t.startMin) : undefined }))}/>}
          {tryck.length > 0 && <SamlingRad rad={pseudo('lunchtryck', 'Lunchtryck', 'klasser med lunchlucka per tid')} days={f.days} start={start} classes={f.classes} dagar={dagar}
            falt={[...tryck.map(t => ({ ...t, klass: `samling-tryck samling-tryck-${Math.ceil(3 * t.klasser / hogst)}`, label: `${t.klasser} ${t.klasser === 1 ? 'klass har' : 'klasser har'} lunchlucka`, text: ryms(t, 30) ? String(t.klasser) : undefined })),
              ...f.days.flatMap((d, day) => { const egna = tryck.filter(t => t.day === day), slut = egna.at(-1)?.endMin; return slut === undefined || d.endMin - slut < 60 ? []
                : [{ day, startMin: slut + 5, endMin: Math.min(d.endMin, slut + 150), klass: 'samling-tryck-hogst', label: 'Flest klasser med lunchlucka samtidigt', text: `högst ${Math.max(...egna.map(t => t.klasser))}` }]; })]}/>}
          {lage === 'matris'
            ? <Matris forslag={f} lessons={visade} slag={matris} dag={dag} start={start} valda={valda} farg={fargFor} onLaggTill={laggTill}/>
            : rader.map((r, i) => <SamlingRad key={r.key} rad={r} days={f.days} start={start} classes={f.classes} dagar={dagar} krock={krock.lessons} farg={fargFor} falt={faltFor(finns[i], i)} onTid={valjTid}
              namn={<label className="samling-radval"><input type="checkbox" checked={markerade.includes(r.key)} aria-label={`Markera ${r.name} för gemensam ledig tid`}
                onChange={e => setMarkerade(e.target.checked ? [...markerade, r.key] : markerade.filter(x => x !== r.key))}/><span><b>{r.name}</b><small>{r.detail}</small></span></label>}/>)}
        </div>}
      {lage === 'rader' && rader.length > 0 && <p className="schema-note" data-ledig={mark.length >= 2 ? gemensam.length : undefined}>{mark.length < 2
        ? 'Markera två eller fler rader för att se när alla är lediga samtidigt.'
        : gemensam.length === 0 ? `${mark.map(r => r.name).join(', ')} har ingen gemensam ledig tid på minst ${villkor.minLessonMin} min${filter.termin || perTermin ? ` under ${TERM[filter.termin ?? term].toLowerCase()}` : ''}.`
        : `Gemensam ledig tid för ${mark.map(r => r.name).join(', ')}: ${gemensam.slice(0, 8).map(ledigText).join(', ')}${gemensam.length > 8 ? ` och ${gemensam.length - 8} tider till` : ''}. Tider kortare än kortaste pass (${villkor.minLessonMin} min) visas inte.`}</p>}
      {lage === 'matris' && <p className="schema-note">Varje ruta är ett pass. Välj en rads namn för att lägga den i samlingsvyn.</p>}
      {krock.texter.length > 0 && <div className="folj-krock">{krock.texter.map(t => <p key={t}>{t}</p>)}</div>}
      {ledig && <LedigSok forslag={f} lessons={iTermin} tid={ledig} amne={ledigAmne} valda={valda} onTid={setLedig} onAmne={setLedigAmne} onLaggTill={laggTill} onStang={() => { setLedig(null); fokus.current = true; }}/>}

      {(lage === 'rader' && rader.length > 0 || tryck.length > 0) && <ul className="schema-legend" aria-label="Teckenförklaring för samlingsvyn">
        {lage === 'rader' && nycklar.map(x => <li key={x.namn}><span className={`schema-sw schema-sw-pass${x.avvikelse ? ' falt-brott' : x.ton !== null ? ` samling-ton-${x.ton}` : ''}`} aria-hidden="true"/>{x.namn}</li>)}
        {mark.length >= 2 && <li><span className="schema-sw falt-fri" aria-hidden="true"/>Gemensam ledig tid</li>}
        {lagerVisas(lager, 'haltid') && <li><span className="schema-sw samling-haltid" aria-hidden="true"/>Håltid (minuter)</li>}
        {tryck.length > 0 && <li><span className="schema-sw samling-tryck samling-tryck-3" aria-hidden="true"/>Lunchtryck (antal klasser)</li>}
        {rader.some(r => r.slag === 'elev') && <li><span className="schema-sw folj-sw-grupp" aria-hidden="true"/>Gruppens pass i elevens schema</li>}
      </ul>}
    </section>;
  }

  // Följ passet som läge av samlingsvyn: tillagda rader utöver passets, och urvalet som arbetsvy.
  const folj: SamlingFolj | undefined = forslag ? {
    rader: visas => samlingRader(forslag, extra, forslag.lessons.filter(l => l.day !== null && l.startMin !== null && visas(l))),
    taBort: (key, name) => extra.some(r => samlingNyckel(r) === key)
      ? <button type="button" aria-label={`Ta bort ${name} ur Följ passet`} onClick={() => setExtra(x => x.filter(r => samlingNyckel(r) !== key))}><XIcon aria-hidden="true"/></button> : null,
    verktyg: passets => {
      const kandidater = samlingKandidater(forslag), avPasset = passets.flatMap((r): SamlingResurs[] => { const k = kandidater.find(x => x.id === r.key.split(':')[1]); return k ? [{ slag: k.slag, id: k.id }] : []; });
      return <>
        <button type="button" className="schema-chip" onClick={() => setSok('folj')}><PlusIcon aria-hidden="true"/>Lägg till klass, grupp, lärare eller sal</button>
        <button type="button" className="schema-chip" onClick={() => setForm({ typ: 'spara', namn: '', resurser: [...avPasset, ...extra], kalla: 'folj', utan: passets.length - avPasset.length })}><SaveIcon aria-hidden="true"/>Spara som arbetsvy</button>
        {sok === 'folj' && <LaggTill open onOpenChange={open => { if (!open) setSok(null); }} forslag={forslag} valda={new Set([...avPasset, ...extra].map(samlingNyckel))} elever={null}
          onValj={r => setExtra(x => [...x, r])}/>}
        {form?.kalla === 'folj' && namnForm}
        <output aria-live="polite" className="schema-note samling-status">{foljStatus}</output>
      </>;
    },
  } : undefined;

  return {
    vy, folj,
    /** Visa gemensam ledig tid (menyn på tom tid i veckan): den som visas i veckan läggs i samlingsvyn och alla rader markeras. */
    visaLedigTid: (visad: SamlingResurs) => {
      const nya = resurser.some(r => samlingNyckel(r) === samlingNyckel(visad)) ? resurser : [...resurser, visad];
      setResurser(nya); setMarkerade(nya.map(samlingNyckel)); setLage('rader'); fokus.current = true; oppna();
      setStatus(nya.length < 2 ? 'Lägg till fler rader för att se när alla är lediga samtidigt.' : `Gemensam ledig tid visas för ${nya.length} rader.`);
    },
  };
}
