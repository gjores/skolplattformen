'use client';
// Marginaler för pass (05.2-SM-MARGINAL, designvyn Regler): formuläret "Ny marginal" med förhandsvisning, listan över marginaler och rutan
// "Marginal eller spärrad tid?". Marginalerna är egna villkor av typen `marginal` i villkoren för schemat; inget sparas i systemet.
import { useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SCHEMA_MARGINAL_DELAR, SCHEMA_VILLKOR_LIMITS, type SchemaForslag, type SchemaForslagLesson, type SchemaMarginal, type SchemaMarginalDel, type SchemaRegel, type SchemaRegelSlag,
  type SchemaVillkor } from '@/lib/schema-contract.ts';
import { marginalBand, regelNamn } from '@/lib/schema-lager.ts';
import { MARGINAL_DEL_NAMN, SCHEMA_MARGINAL_ETIKETTER, marginalEtiketter, marginalTider, upptarText } from '@/lib/schema-marginal.ts';
import type { SchemaBand } from '@/lib/schema-utkast.ts';
import { DAYS, SLAG, clock, names, type Resurser } from './delat.ts';

type Marginal = Extract<SchemaRegel, { typ: 'marginal' }>;
const GALLER: Record<SchemaRegelSlag, string> = { ...SLAG, pass: 'Ett pass' };
const ORDNING: SchemaRegelSlag[] = ['amne', 'grupp', 'klass', 'larare', 'sal', 'pass'];
const EGEN = 'egen';
type Utkast = { slag: SchemaRegelSlag; ref: string; beforeMin: number; afterMin: number; etikett: string; egen: string; occupies: SchemaMarginalDel[]; visibleFor: SchemaMarginal['visibleFor'] };
const FORVAL: Utkast = { slag: 'amne', ref: '', beforeMin: 10, afterMin: 15, etikett: SCHEMA_MARGINAL_ETIKETTER[0], egen: '', occupies: ['elever'], visibleFor: ['elever'] };

export function Marginaler({ value: v, disabled, resurser, forslag, onChange }: { value: SchemaVillkor; disabled: boolean; resurser: Resurser | null; forslag: SchemaForslag | null;
  onChange: (next: SchemaVillkor) => void }) {
  const L = SCHEMA_VILLKOR_LIMITS, id = useId(), forsta = useRef<HTMLSelectElement | null>(null), angra = useRef<HTMLButtonElement | null>(null);
  const [draft, setDraft] = useState<Utkast>(FORVAL), [andrar, setAndrar] = useState<number | null>(null);
  const [borttagen, setBorttagen] = useState<{ rule: Marginal; index: number } | null>(null);
  const set = (patch: Partial<Utkast>) => setDraft({ ...draft, ...patch });

  // Det en marginal kan gälla: klass, grupp, ämne, lärare och pass när ett förslag finns, salar när de finns.
  const choicesOf = (slag: SchemaRegelSlag) => slag === 'sal' ? v.salar.map(x => ({ ref: x, name: x })) : resurser?.[slag] ?? [];
  const slagen = ORDNING.filter(x => choicesOf(x).length > 0);
  const slag = slagen.includes(draft.slag) ? draft.slag : slagen[0] ?? null, choices = slag ? choicesOf(slag) : [];
  const ref = choices.some(c => c.ref === draft.ref) ? draft.ref : choices[0]?.ref ?? '';
  const label = (draft.etikett === EGEN ? draft.egen : draft.etikett).trim();
  const rule: Marginal | null = slag === null || !ref || draft.beforeMin + draft.afterMin === 0 || !draft.occupies.length || !label || label.length > L.etikett ? null
    : { slag, ref, typ: 'marginal', beforeMin: draft.beforeMin, afterMin: draft.afterMin, occupies: SCHEMA_MARGINAL_DELAR.filter(d => draft.occupies.includes(d)), label,
      visibleFor: (['elever', 'larare'] as const).filter(d => draft.visibleFor.includes(d)), when: 'alltid' };
  const marginaler = v.egna.flatMap((r, index) => r.typ === 'marginal' ? [{ r, index }] : []);
  const namn = (r: SchemaRegel) => `${SLAG[r.slag]} ${resurser || r.slag === 'sal' || r.slag === 'amne' ? regelNamn(r, resurser ?? { klass: [], grupp: [], amne: [], larare: [], pass: [] }) : '(namnet visas när ett förslag finns)'}`;
  const minuter = [0, ...Array.from({ length: L.marginal[1] / 5 }, (_, i) => (i + 1) * 5)];

  const spara = () => {
    if (!rule) return;
    const egna = andrar === null ? [...v.egna, rule] : v.egna.map((r, i) => i === andrar ? rule : r);
    onChange({ ...v, egna }); setAndrar(null); setDraft({ ...FORVAL, slag: rule.slag, ref: rule.ref }); setBorttagen(null);
  };
  const andra = (r: Marginal, index: number) => {
    const preset = (SCHEMA_MARGINAL_ETIKETTER as readonly string[]).includes(r.label);
    setDraft({ slag: r.slag, ref: r.ref, beforeMin: r.beforeMin, afterMin: r.afterMin, etikett: preset ? r.label : EGEN, egen: preset ? '' : r.label, occupies: r.occupies, visibleFor: r.visibleFor });
    setAndrar(index); setBorttagen(null); forsta.current?.focus();
  };
  const taBort = (r: Marginal, index: number) => {
    onChange({ ...v, egna: v.egna.filter((_, i) => i !== index) }); setBorttagen({ rule: r, index }); if (andrar !== null) { setAndrar(null); setDraft(FORVAL); }
    requestAnimationFrame(() => angra.current?.focus());
  };
  const angraBort = () => {
    if (!borttagen) return;
    onChange({ ...v, egna: [...v.egna.slice(0, borttagen.index), borttagen.rule, ...v.egna.slice(borttagen.index)] }); setBorttagen(null);
  };
  const check = (del: string, checked: boolean, list: string[], key: 'occupies' | 'visibleFor', text: string, locked = false) => <label key={del} className="schema-check">
    <input type="checkbox" checked={checked} disabled={locked} onChange={e => set({ [key]: e.target.checked ? [...list, del] : list.filter(x => x !== del) })}/>{text}</label>;

  return <section className="schema-marginaler schema-wide" aria-labelledby={`${id}-rubrik`}>
    <h3 id={`${id}-rubrik`}>Marginaler för pass</h3>
    <p className="schema-note">En marginal är tid före eller efter ett pass som följer passet när det flyttas: omklädning, dusch, restid, städning eller en lugn övergång. Spärrad tid ligger fast i veckan. Båda syns i schemat, och ingen av dem räknas som undervisningstid.</p>
    <div className="schema-marginal-kort">
      <fieldset disabled={disabled} aria-labelledby={`${id}-ny`}>
        <h4 id={`${id}-ny`}>{andrar === null ? 'Ny marginal' : 'Ändra marginal'}</h4>
        {slag === null ? <p className="schema-note">Ta fram ett första förslag, eller lägg till en sal, för att kunna välja vad marginalen gäller.</p> : <>
          <div className="schema-marginal-falt">
            <label>Gäller<select ref={forsta} value={slag} onChange={e => set({ slag: e.target.value as SchemaRegelSlag, ref: '' })}>{slagen.map(x => <option key={x} value={x}>{GALLER[x]}</option>)}</select></label>
            <label>{SLAG[slag]}<select value={ref} onChange={e => set({ ref: e.target.value })}>{choices.map(c => <option key={c.ref} value={c.ref}>{c.name}</option>)}</select></label>
            <label>Före passet<select value={draft.beforeMin} onChange={e => set({ beforeMin: Number(e.target.value) })}>{minuter.map(n => <option key={n} value={n}>{n ? `${n} min` : 'Ingen'}</option>)}</select></label>
            <label>Efter passet<select value={draft.afterMin} onChange={e => set({ afterMin: Number(e.target.value) })}>{minuter.map(n => <option key={n} value={n}>{n ? `${n} min` : 'Ingen'}</option>)}</select></label>
            <label>Etikett i schemat<select value={draft.etikett} onChange={e => set({ etikett: e.target.value })}>
              {SCHEMA_MARGINAL_ETIKETTER.map(x => <option key={x} value={x}>{x}</option>)}<option value={EGEN}>Egen text…</option></select></label>
            {draft.etikett === EGEN && <label>Egen etikett<input type="text" maxLength={L.etikett} value={draft.egen} onChange={e => set({ egen: e.target.value })}/></label>}
            <fieldset className="schema-marginal-nar"><legend>När</legend>
              <div className="schema-marginal-val">
                <Button type="button" variant="outline" aria-pressed="true">Alltid</Button>
                <Button type="button" variant="outline" aria-pressed="false" disabled aria-describedby={`${id}-plats`}>Vid byte av plats</Button>
              </div>
              <span id={`${id}-plats`} className="schema-note">Vid byte av plats kräver salsregister.</span>
            </fieldset>
          </div>
          <fieldset className="schema-days"><legend>Upptar, så att inget annat kan ligga där</legend>
            {SCHEMA_MARGINAL_DELAR.map(d => check(d, draft.occupies.includes(d), draft.occupies, 'occupies', MARGINAL_DEL_NAMN[d]))}</fieldset>
          <fieldset className="schema-days"><legend>Visas i schemat för</legend>
            <label className="schema-check"><input type="checkbox" checked disabled/>Schemaläggaren</label>
            {check('elever', draft.visibleFor.includes('elever'), draft.visibleFor, 'visibleFor', 'Eleverna')}
            {check('larare', draft.visibleFor.includes('larare'), draft.visibleFor, 'visibleFor', 'Lärarna')}</fieldset>
          <p className="schema-note">Elevernas och lärarnas schema visar marginalen först när schemat publiceras för dem; valet följer med villkoret.</p>
          <Forhandsvisning rule={rule} villkor={{ ...v, egna: [...v.egna.filter((_, i) => i !== andrar), ...rule ? [rule] : []] }} forslag={forslag}/>
          <div className="schema-marginal-knappar">
            <Button type="button" disabled={disabled || rule === null || (andrar === null && v.egna.length >= L.egna)} onClick={spara}>{andrar === null ? 'Lägg till marginal' : 'Spara ändringen'}</Button>
            {andrar !== null && <Button type="button" variant="outline" onClick={() => { setAndrar(null); setDraft(FORVAL); }}>Avbryt</Button>}
          </div></>}
      </fieldset>

      <div className="schema-marginal-lista">
        <h4 id={`${id}-lista`}>Marginaler ({marginaler.length})</h4>
        {borttagen && <output className="schema-borttaget"><span className="schema-note">Marginalen är borttagen: {namn(borttagen.rule)}, {marginalTider(borttagen.rule)}.</span>
          <Button ref={angra} type="button" variant="outline" onClick={angraBort}>Ångra borttagningen</Button></output>}
        {marginaler.length === 0 ? <p className="schema-note">Inga marginaler än.</p>
          : <Table aria-labelledby={`${id}-lista`}>
            <TableHeader><TableRow><TableHead scope="col">Gäller</TableHead><TableHead scope="col">Före · efter</TableHead><TableHead scope="col">Upptar</TableHead><TableHead scope="col">När</TableHead>
              <TableHead scope="col"><span className="sr-only">Åtgärd</span></TableHead></TableRow></TableHeader>
            <TableBody>{marginaler.map(({ r, index }) => <TableRow key={index}>
              <TableCell>{namn(r)}<br/><small className="schema-note">{r.label}</small></TableCell><TableCell className="schema-marginal-tid">{marginalTider(r)}</TableCell>
              <TableCell>{upptarText(r.occupies)}</TableCell><TableCell>Alltid</TableCell>
              <TableCell><div className="schema-marginal-knappar">
                <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ändra marginalen ${namn(r)}`} onClick={() => andra(r, index)}>Ändra</Button>
                <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort marginalen ${namn(r)}`} onClick={() => taBort(r, index)}>Ta bort</Button></div></TableCell>
            </TableRow>)}</TableBody>
          </Table>}
        <MarginalEllerSparrad/>
      </div>
    </div>
  </section>;
}

/** En rad med pass, marginaler och annat i förhandsvisningen: läget anges i minuter mellan `from` och `to`. */
function Bana({ namn, from, to, items }: { namn: string; from: number; to: number; items: { start: number; end: number; text: string; typ: 'pass' | 'annat' | 'marginal' | 'sparrad'; sr?: string }[] }) {
  const at = (a: number, b: number) => ({ '--from': (Math.max(from, a) - from) / (to - from), '--to': (Math.min(to, b) - from) / (to - from) }) as CSSProperties;
  return <><span>{namn}</span>
    <ol className="schema-bana">{items.filter(x => x.end > from && x.start < to).map((x, i) => <li key={i} className={`schema-bana-del bana-${x.typ}${x.typ === 'marginal' ? ' falt-marginal' : x.typ === 'sparrad' ? ' falt-sparrad' : ''}`} style={at(x.start, x.end)}
      title={x.text}>{x.sr && <span className="sr-only">{x.sr}</span>}{x.text}</li>)}</ol></>;
}

/** "Så blir det": ett pass som marginalen gäller, med samma band som veckan för klassen, läraren och salen, och vad som ligger intill. */
function Forhandsvisning({ rule, villkor, forslag }: { rule: Marginal | null; villkor: SchemaVillkor; forslag: SchemaForslag | null }) {
  if (!forslag) return <p className="schema-note">Förhandsvisningen visas när ett förslag finns.</p>;
  if (!rule) return <p className="schema-note">Välj tid före eller efter passet, vad marginalen upptar och en etikett.</p>;
  const placed = forslag.lessons.filter(l => l.day !== null && l.startMin !== null);
  const bara = { ...villkor, egna: [rule] };
  const l = placed.find(x => SCHEMA_MARGINAL_DELAR.some(d => marginalBand(bara, forslag, x, d).length > 0));
  if (!l) return <p className="schema-note">Inget lagt pass i förslaget gäller marginalen.</p>;
  const band = (del: SchemaMarginalDel) => marginalBand(villkor, forslag, l, del);
  const start = l.startMin!, end = start + l.durationMin, all = SCHEMA_MARGINAL_DELAR.flatMap(band);
  const fore = Math.max(0, ...all.filter(b => b.side === 'fore').map(b => b.minutes)), efter = Math.max(0, ...all.filter(b => b.side === 'efter').map(b => b.minutes));
  const from = start - fore - 20, to = end + efter + 20;
  const dagens = (ids: (x: SchemaForslagLesson) => string[], id: string) => placed.filter(x => x.id !== l.id && x.day === l.day && ids(x).includes(id));
  const marg = (bs: SchemaBand[]) => bs.map(b => ({ start: b.side === 'fore' ? start - b.minutes : end, end: b.side === 'fore' ? start : end + b.minutes, text: b.label.replace(/ \d+ min$/u, ''), typ: 'marginal' as const,
    sr: `${b.side === 'fore' ? 'Före' : 'Efter'} passet, ${b.minutes} min: ` }));
  const andra = (list: SchemaForslagLesson[], text: (x: SchemaForslagLesson) => string) => list.map(x => ({ start: x.startMin!, end: x.startMin! + x.durationMin, text: text(x), typ: 'annat' as const }));
  const klass = l.classIds[0], larare = l.teacherIds[0], sal = l.roomId;
  const salNamn = sal ? forslag.rooms.find(r => r.id === sal)?.name ?? sal : null;
  const delar = rule.occupies.map(d => MARGINAL_DEL_NAMN[d]), fria = (['elever', 'larare', 'sal'] as const).filter(d => !rule.occupies.includes(d) && (d !== 'larare' || larare) && (d !== 'sal' || sal));
  const text = marginalEtiketter(rule.label), under = (text.fore === text.efter ? text.fore : `${text.fore} och ${text.efter}`).toLocaleLowerCase('sv-SE');
  const och = (xs: string[]) => { const low = xs.map((x, i) => i ? x.toLocaleLowerCase('sv-SE') : x); return low.length > 1 ? `${low.slice(0, -1).join(', ')} och ${low.at(-1)}` : low[0] ?? ''; };
  return <div className="schema-marginal-forhand">
    <h5>Så blir det, {DAYS[l.day!].toLowerCase()} {clock(start - fore)}–{clock(end + efter)}</h5>
    <div className="schema-banor">
      {klass && <Bana namn={names([klass], forslag.classes) || 'Klassen'} from={from} to={to} items={[...andra(dagens(x => x.classIds, klass), x => x.title), ...marg(band('elever')),
        { start, end, text: l.title, typ: 'pass' }]}/>}
      {larare && <Bana namn={names([larare], forslag.teachers) || 'Läraren'} from={from} to={to} items={[...andra(dagens(x => x.teacherIds, larare), x => x.title), ...marg(band('larare')),
        { start, end, text: l.title, typ: 'pass' }]}/>}
      {sal && <Bana namn={salNamn!} from={from} to={to} items={[...andra(dagens(x => x.roomId ? [x.roomId] : [], sal), x => names(x.classIds, forslag.classes) || x.title), ...marg(band('sal')),
        { start, end, text: names(l.classIds, forslag.classes) || l.title, typ: 'pass' }]}/>}
    </div>
    {(start - fore < forslag.days[l.day!].startMin || end + efter > forslag.days[l.day!].endMin)
      && <p className="schema-note">Med marginalen ryms passet inte där det ligger nu, i skoldagen {clock(forslag.days[l.day!].startMin)}–{clock(forslag.days[l.day!].endMin)}. Nästa förslag lägger det där marginalen ryms.</p>}
    <p className="schema-note">{och(delar)} är upptagna under {under}.{fria.length > 0 && ` ${och(fria.map(d => MARGINAL_DEL_NAMN[d]))} ${fria.length > 1 ? 'är lediga' : 'är ledig'} under marginalen.`}</p>
  </div>;
}

/** Rutan "Marginal eller spärrad tid?" i designvyn: marginalen flyttar med passet, spärrad tid står kvar. */
function MarginalEllerSparrad() {
  return <div className="schema-marginal-jamfor">
    <h4>Marginal eller spärrad tid?</h4>
    <div className="schema-banor">
      <Bana namn="Marginal" from={0} to={100} items={[{ start: 18, end: 28, text: 'Restid', typ: 'marginal' }, { start: 28, end: 72, text: 'Pass', typ: 'pass' }, { start: 72, end: 82, text: 'Restid', typ: 'marginal' }]}/>
      <Bana namn="Spärrad tid" from={0} to={100} items={[{ start: 40, end: 80, text: 'Spärrad 12:00–14:00', typ: 'sparrad' }]}/>
    </div>
    <p className="schema-note">Marginalen flyttar med passet. Spärrad tid står kvar oavsett var passen hamnar. ”Vid byte av plats” betyder att marginalen bara tas när eleverna eller läraren kommer från eller går till en annan plats; två idrottspass i rad behöver ingen restid. Platser kräver salsregister, som inte finns än; därför gäller marginaler alltid.</p>
  </div>;
}
