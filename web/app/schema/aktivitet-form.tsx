'use client';
import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SchemaForslag } from '@/lib/schema-contract.ts';
import { aktivitetsTyper, aktiviteternasFel, nyAktivitetId, type SchemaAktivitet, type SchemaAktivitetsTyp } from '@/lib/schema-aktiviteter.ts';

export type NyAktivitetsTid = { day: number; startMin: number; nr: number; resurs?: { slag: 'klass' | 'grupp' | 'larare' | 'sal'; ref: string } };
const DAGAR = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
const time = (m: number) => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
const minutes = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
type Props = { forslag: SchemaForslag; typer: SchemaAktivitetsTyp[]; activities: SchemaAktivitet[]; tid?: NyAktivitetsTid | null; aktivitet?: SchemaAktivitet | null;
  busy: boolean; saveError?: string | null; recoveryAction?: ReactNode; onSave: (a: SchemaAktivitet) => Promise<boolean>; onClose: () => void; onTypes: () => void };
export function AktivitetForm({ forslag: f, typer, activities, tid, aktivitet, busy, saveError, recoveryAction, onSave, onClose, onTypes }: Props) {
  const first = typer.find(t => t.name === 'Mentorstid') ?? typer[0] ?? aktivitetsTyper()[0];
  const [draft, setDraft] = useState<SchemaAktivitet>(() => aktivitet ?? {
    id: nyAktivitetId(activities), typId: first.id, typ: first.name, name: first.name, classRefs: tid?.resurs?.slag === 'klass' ? [tid.resurs.ref] : [],
    groupRefs: tid?.resurs?.slag === 'grupp' ? [tid.resurs.ref] : [], teacherRefs: tid?.resurs?.slag === 'larare' ? [tid.resurs.ref] : [], rooms: tid?.resurs?.slag === 'sal' ? [tid.resurs.ref] : [],
    durationMin: 20, veckor: { typ: 'alla' }, visibleFor: first.visibleFor, margin: first.margin, tid: { typ: 'fast', day: tid?.day ?? 0, startMin: tid?.startMin ?? 480 },
  });
  const [error, setError] = useState(''), [attempted, setAttempted] = useState(false), [weeks, setWeeks] = useState(draft.veckor.typ === 'valda' ? draft.veckor.veckor.join(', ') : '35, 36, 37');
  const shownError = error || (attempted && !busy ? saveError ?? 'Aktiviteten kunde inte kontrolleras. Dina val står kvar. Försök igen.' : '');
  const patch = (value: Partial<SchemaAktivitet>) => { setDraft(d => ({ ...d, ...value })); setError(''); setAttempted(false); };
  const chooseType = (id: string) => {
    if (id === '__ny__') { onTypes(); return; }
    const t = typer.find(t => t.id === id); if (!t) return;
    patch({ typId: t.id, typ: t.name, name: draft.name === draft.typ ? t.name : draft.name, visibleFor: t.visibleFor, margin: t.margin });
  };
  const toggle = (key: 'classRefs' | 'groupRefs' | 'teacherRefs', id: string) => patch({ [key]: draft[key].includes(id) ? draft[key].filter(x => x !== id) : [...draft[key], id] });
  const groups = [...new Set(typer.map(t => t.group))];
  const values = (key: 'classRefs' | 'groupRefs' | 'teacherRefs', label: string, items: { ref: string; name: string }[]) => <fieldset className="akt-val"><legend>{label}</legend>
    <div>{items.map(i => <label className="akt-check" key={i.ref}><input type="checkbox" checked={draft[key].includes(i.ref)} onChange={() => toggle(key, i.ref)}/>{i.name}</label>)}
      {!items.length && <p className="text-muted-foreground">Inga {label.toLowerCase()} i underlaget.</p>}</div></fieldset>;
  const save = async () => {
    const a = { ...draft, name: draft.name.trim(), ...(draft.veckor.typ === 'valda' ? { veckor: { typ: 'valda' as const, veckor: weeks.split(/[\s,;]+/u).filter(Boolean).map(Number) } } : {}) };
    const errors = aktiviteternasFel([a]).map(message => {
      if (message === 'Aktiviteten ska ha typ och namn.' && !a.name) return 'Skriv ett namn på aktiviteten.';
      if (message.endsWith('välj minst en deltagare eller sal.')) return 'Välj minst en klass, grupp, ansvarig eller sal som aktiviteten ska uppta.';
      if (message.endsWith('tidsfönstret ska rymma aktiviteten.')) return a.tid.typ === 'motor' && !a.tid.days.length
        ? 'Markera minst en tillåten veckodag för aktiviteten.'
        : `Tiden mellan Tidigast och Senast slut ska vara minst ${a.durationMin} minuter, så att hela aktiviteten ryms.`;
      if (message.endsWith('välj giltiga veckor (1–53).')) return 'Skriv veckonummer mellan 1 och 53, separerade med komma. Varje vecka får bara anges en gång.';
      return message;
    });
    if (errors.length) { setError(errors.join(' ')); return; }
    setError(''); setAttempted(true);
    if (await onSave(a)) onClose();
  };
  return <Dialog open onOpenChange={open => { if (!open && !busy) onClose(); }}><DialogContent className="akt-dialog" aria-describedby="akt-beskrivning">
    <DialogHeader><DialogTitle>{aktivitet ? 'Ändra aktivitet' : 'Ny aktivitet'}</DialogTitle><DialogDescription id="akt-beskrivning">Aktiviteten upptar deltagarna i grundschemat. Undervisning ställs inte in och ingen timplanetid räknas.</DialogDescription></DialogHeader>
    <div className="akt-form"><div className="akt-typval"><label className="akt-field">Typ av aktivitet<select value={draft.typId} onChange={e => chooseType(e.target.value)}>
      {groups.map(g => <optgroup key={g} label={g}>{typer.filter(t => t.group === g).map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</optgroup>)}
      {!typer.some(t => t.id === draft.typId) && <option value={draft.typId}>{draft.typ} (tidigare typ)</option>}<option value="__ny__">Ny typ…</option></select></label>
      <Button variant="outline" onClick={onTypes}>Hantera typer</Button></div>
      <p className="text-muted-foreground">Typerna är skolans egen lista, med förval för deltagare, marginal och vem som ser aktiviteten.</p>
      <label className="akt-field">Namn<input value={draft.name} maxLength={120} onChange={e => patch({ name: e.target.value })}/></label>
      <div className="akt-deltagare">{values('classRefs', 'Klasser', f.resurser.klass)}{values('groupRefs', 'Grupper', f.resurser.grupp)}{values('teacherRefs', 'Ansvariga', f.resurser.larare)}
        <fieldset className="akt-val"><legend>Salar</legend><label className="akt-field">Sal<select value={draft.rooms[0] ?? ''} onChange={e => patch({ rooms: e.target.value ? [e.target.value] : [] })}><option value="">Ingen sal</option>{f.rooms.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}</select></label>
          <p className="text-muted-foreground">En sal per aktivitet. Lägg till salens namn i Villkor för schemat först.</p></fieldset></div>
      <fieldset className="akt-nar"><legend>När</legend><div className="akt-segment">
        <Button variant={draft.tid.typ === 'fast' ? 'secondary' : 'outline'} aria-pressed={draft.tid.typ === 'fast'} onClick={() => patch({ tid: { typ: 'fast', day: 0, startMin: draft.tid.startMin } })}>Återkommande</Button>
        <Button variant="outline" disabled aria-describedby="akt-datum-grans">Datum</Button>
        <Button variant={draft.tid.typ === 'motor' ? 'secondary' : 'outline'} aria-pressed={draft.tid.typ === 'motor'} onClick={() => patch({ tid: { typ: 'motor', days: [1, 2, 3], startMin: 840, endMin: 990 } })}>Låt motorn placera</Button></div>
        <p id="akt-datum-grans" className="text-muted-foreground">Daterade aktiviteter och inställd undervisning kommer med schema i tid.</p></fieldset>
      <div className="akt-tidfalt"><label className="akt-field">Längd i minuter<input type="number" min={5} max={600} step={5} value={draft.durationMin} onChange={e => patch({ durationMin: Number(e.target.value) })}/></label>
        {draft.tid.typ === 'fast' ? <><label className="akt-field">Veckodag<select value={draft.tid.day} onChange={e => patch({ tid: { typ: 'fast', day: Number(e.target.value), startMin: draft.tid.startMin } })}>{DAGAR.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
          <label className="akt-field">Start<input type="time" step={300} value={time(draft.tid.startMin)} onChange={e => patch({ tid: { typ: 'fast', day: draft.tid.typ === 'fast' ? draft.tid.day : 0, startMin: minutes(e.target.value) } })}/></label></>
          : <><label className="akt-field">Tidigast<input type="time" step={300} value={time(draft.tid.startMin)} onChange={e => { if (draft.tid.typ === 'motor') patch({ tid: { ...draft.tid, startMin: minutes(e.target.value) } }); }}/></label>
            <label className="akt-field">Senast slut<input type="time" step={300} value={time(draft.tid.endMin)} onChange={e => { if (draft.tid.typ === 'motor') patch({ tid: { ...draft.tid, endMin: minutes(e.target.value) } }); }}/></label></>}</div>
      {draft.tid.typ === 'motor' && <fieldset className="akt-nar"><legend>Tillåtna veckodagar</legend><div className="akt-segment">{DAGAR.map((d, i) => <label className="akt-check" key={d}><input type="checkbox" checked={draft.tid.typ === 'motor' && draft.tid.days.includes(i)} onChange={() => { if (draft.tid.typ === 'motor') patch({ tid: { ...draft.tid, days: draft.tid.days.includes(i) ? draft.tid.days.filter(n => n !== i) : [...draft.tid.days, i] } }); }}/>{d}</label>)}</div></fieldset>}
      <div className="akt-tidfalt"><label className="akt-field">Veckor<select value={draft.veckor.typ} onChange={e => patch({ veckor: e.target.value === 'valda' ? { typ: 'valda', veckor: [35] } : { typ: e.target.value as 'alla' | 'udda' | 'jamna' } })}>
        <option value="alla">Varje vecka</option><option value="udda">Udda veckor (A)</option><option value="jamna">Jämna veckor (B)</option><option value="valda">Vissa veckor</option></select></label>
        {draft.veckor.typ === 'valda' && <label className="akt-field">Veckonummer, separerade med komma<input value={weeks} onChange={e => { setWeeks(e.target.value); setError(''); setAttempted(false); }}/></label>}
        <label className="akt-field">Visas för<select value={draft.visibleFor} onChange={e => patch({ visibleFor: e.target.value as 'personal' | 'alla' })}><option value="personal">Personal</option><option value="alla">Elever, vårdnadshavare och personal</option></select></label></div>
      {draft.veckor.typ !== 'alla' && <p className="akt-info">Aktiviteten upptar alla veckor i grundschemat. Veckovalet är en märkning tills schema i tid finns.</p>}
      {draft.margin && <p className="text-muted-foreground">{draft.margin.label}: {draft.margin.beforeMin} min före och {draft.margin.afterMin} min efter, från aktivitetstypen.</p>}
      <p className="text-muted-foreground">Synligheten är ett förval för ett framtida publicerat schema. Aktiviteten publiceras inte när du lägger till den.</p>
      {shownError && <div className="akt-fel"><p role="alert" className="text-destructive">{shownError}</p>{recoveryAction}<p className="text-muted-foreground">{aktivitet ? 'Ändringen har inte sparats.' : 'Aktiviteten har inte lagts till.'} Dina val finns kvar i formuläret.</p></div>}
      <div className="akt-segment"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Prövar aktiviteten…' : aktivitet ? 'Ändra aktiviteten' : 'Lägg till aktivitet'}</Button><Button disabled={busy} variant="outline" onClick={onClose}>Avbryt</Button></div>
    </div>
  </DialogContent></Dialog>;
}
