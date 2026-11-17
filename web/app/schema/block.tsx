'use client';
// Egna samtidighetsblock (05.2-SM-UXF-51) i Förbered › Lektioner och block. Blocken är villkor: en ändring sparas i utkastet och kräver nytt förslag.
import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SchemaForslag, SchemaVillkor } from '@/lib/schema-contract.ts';
import { SCHEMA_BLOCK_LIMITS, checkSchemaBlock, nastaBlockId, type SchemaBlockMedlem } from '@/lib/schema-block.ts';

const FALT = 'rounded-md border border-input bg-background p-2 min-h-(--control-height) w-full';
const STATUS = { aktivt: { text: 'Används', ton: 'success' }, hinder: { text: 'Hinder', ton: 'warning' }, inaktuellt: { text: 'Inaktuellt', ton: 'warning' } } as const;
const kl = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const DAGAR = ['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'];

/** Passen per undervisning med samma numrering som servern: ordningen bland undervisningens pass i samma termin. */
export function blockVal(kalla: SchemaForslag): { ref: string; title: string; grupp: string; pass: (SchemaBlockMedlem & { lesson: string; text: string })[] }[] {
  const klass = new Map(kalla.classes.map(c => [c.id, c.name]));
  return kalla.fordelning.map(row => {
    const lessons = kalla.lessons.filter(l => l.undervisning === row.ref), raknare = new Map<string, number>();
    return { ref: row.ref, title: row.title, grupp: row.classes.join(', ') || [...new Set(lessons.flatMap(l => l.classIds.map(c => klass.get(c) ?? c)))].join(', '),
      pass: lessons.map(l => { const t = l.term ?? '', n = (raknare.get(t) ?? 0) + 1; raknare.set(t, n);
        return { ref: row.ref, term: l.term, pass: n, lesson: l.id,
          text: `Pass ${n}${l.term ? ` (${l.term.toUpperCase()})` : ''}, ${l.durationMin} min${l.day !== null && l.startMin !== null ? `, ligger ${DAGAR[l.day]} ${kl(l.startMin)}` : ''}` }; }) };
  }).filter(u => u.pass.length > 0);
}

export function Samtidighetsblock({ villkor: v, kalla, disabled, onChange }: { villkor: SchemaVillkor; kalla: SchemaForslag | null; disabled: boolean; onChange: (next: SchemaVillkor, text: string) => void }) {
  const id = useId(), [namn, setNamn] = useState(''), [medlemmar, setMedlemmar] = useState<SchemaBlockMedlem[]>([]), [vald, setVald] = useState(''), [passVal, setPassVal] = useState('');
  const block = v.block ?? [], val = kalla ? blockVal(kalla) : [];
  const undervisning = val.find(u => u.ref === vald) ?? val[0], passet = undervisning?.pass.find(p => `${p.term ?? ''}|${p.pass}` === passVal) ?? undervisning?.pass[0];
  const nytt = { id: nastaBlockId(block), namn: namn.trim(), medlemmar };
  const fel = !nytt.namn ? 'Ge blocket ett namn.' : checkSchemaBlock([...block, nytt])[0] ?? null;
  const namnFor = (m: SchemaBlockMedlem) => { const u = val.find(x => x.ref === m.ref); return `${u?.title ?? 'Undervisning som inte finns i underlaget'}${u?.grupp ? ` · ${u.grupp}` : ''}, pass ${m.pass}${m.term ? ` (${m.term.toUpperCase()})` : ''}`; };
  const status = new Map((kalla?.block ?? []).map(s => [s.id, s]));
  return <div className="rounded-lg border border-border bg-card p-4 space-y-3" data-samtidighetsblock>
    <h3 className="font-semibold">Samtidighetsblock</h3>
    <p className="schema-note">Ett samtidighetsblock lägger utvalda pass ur olika undervisningar med samma start, även utanför valmodulerna. Varje pass behåller sina elever, lärare, sal och minuter. Passen kan sluta olika. En lärare eller elev får inte finnas i två av passen. Ett nytt eller ändrat block kräver ett nytt schemaförslag.</p>
    {block.length > 0 && <ul className="grid gap-2" aria-label="Samtidighetsblock">{block.map(b => {
      const s = status.get(b.id);
      return <li key={b.id} className="rounded-md border border-border p-3 space-y-1" data-block={b.id} data-status={s?.status ?? 'okand'}>
        <p className="flex flex-wrap items-center gap-2"><strong>{b.namn}</strong>
          <span className={`status-badge ${s ? STATUS[s.status].ton : ''}`}>{s ? STATUS[s.status].text : 'Inte prövat ännu'}</span></p>
        <ul className="list-disc pl-5 text-sm">{b.medlemmar.map(m => <li key={`${m.ref}|${m.term}|${m.pass}`}>{namnFor(m)}</li>)}</ul>
        {s && <p className={s.status === 'aktivt' ? 'schema-note' : ''}>{s.text}</p>}
        <Button type="button" variant="outline" size="sm" disabled={disabled} aria-label={`Ta bort samtidighetsblocket ${b.namn}`}
          onClick={() => onChange({ ...v, block: block.filter(x => x.id !== b.id) }, `Samtidighetsblocket ${b.namn} borttaget`)}>Ta bort</Button>
      </li>; })}</ul>}
    {!kalla ? <p className="empty-state">Passen kan väljas när underlaget är läst.</p> : block.length < SCHEMA_BLOCK_LIMITS.block && <fieldset className="rounded-md border border-border p-3 grid gap-3" disabled={disabled} data-nytt-block>
      <legend className="px-1 text-sm font-medium">Lägg till samtidighetsblock</legend>
      <label htmlFor={`${id}-namn`} className="grid gap-1 text-sm">Namn<Input id={`${id}-namn`} value={namn} maxLength={SCHEMA_BLOCK_LIMITS.namn} onChange={e => setNamn(e.target.value)}/></label>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_auto] items-end">
        <div className="grid gap-1 text-sm"><label htmlFor={`${id}-undervisning`}>Undervisning</label><select id={`${id}-undervisning`} className={FALT} value={undervisning?.ref ?? ''} onChange={e => { setVald(e.target.value); setPassVal(''); }}>
          {val.map(u => <option key={u.ref} value={u.ref}>{u.title}{u.grupp ? ` · ${u.grupp}` : ''}</option>)}</select></div>
        <div className="grid gap-1 text-sm"><label htmlFor={`${id}-pass`}>Pass</label><select id={`${id}-pass`} className={FALT} value={passet ? `${passet.term ?? ''}|${passet.pass}` : ''} onChange={e => setPassVal(e.target.value)}>
          {undervisning?.pass.map(p => <option key={p.lesson} value={`${p.term ?? ''}|${p.pass}`}>{p.text}</option>)}</select></div>
        <Button type="button" variant="outline" disabled={!passet || medlemmar.length >= SCHEMA_BLOCK_LIMITS.medlemmar[1]}
          onClick={() => { if (passet) setMedlemmar([...medlemmar, { ref: passet.ref, term: passet.term, pass: passet.pass }]); }}>Lägg till passet</Button>
      </div>
      {medlemmar.length > 0 && <ul className="grid gap-1" aria-label="Pass i det nya blocket">{medlemmar.map((m, i) => <li key={i} className="flex flex-wrap items-center justify-between gap-2">
        <span>{namnFor(m)}</span><Button type="button" variant="outline" size="sm" aria-label={`Ta bort ${namnFor(m)} ur blocket`} onClick={() => setMedlemmar(medlemmar.filter((_, k) => k !== i))}>Ta bort</Button></li>)}</ul>}
      {fel && (namn || medlemmar.length > 1) && <p className="text-destructive" role="alert">{fel}</p>}
      <div><Button type="button" disabled={fel !== null} onClick={() => { onChange({ ...v, block: [...block, nytt] }, `Samtidighetsblocket ${nytt.namn}`); setNamn(''); setMedlemmar([]); }}>Lägg till samtidighetsblock</Button></div>
    </fieldset>}
  </div>;
}
