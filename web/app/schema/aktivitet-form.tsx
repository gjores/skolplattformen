'use client';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { SchemaForslag } from '@/lib/schema-contract.ts';
import { aktivitetsTyper, aktiviteternasFel, nyAktivitetId, type SchemaAktivitet, type SchemaAktivitetsTyp } from '@/lib/schema-aktiviteter.ts';
import { api, ApiError } from '@/lib/server-client.ts';
import { parsePersonalReadReply } from '@/lib/tjanst-contract.ts';
import { AKTIVITET_LIMIT } from '@/lib/schema-aktiviteter.ts';
import { serieAktiviteter, serieKontroll, type SerieRad } from '@/lib/schema-serie.ts';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

export type NyAktivitetsTid = { day: number; startMin: number; nr: number; resurs?: { slag: 'klass' | 'grupp' | 'larare' | 'sal'; ref: string } };
const DAGAR = ['Måndag', 'Tisdag', 'Onsdag', 'Torsdag', 'Fredag'];
const time = (m: number) => `${Math.floor(m / 60).toString().padStart(2, '0')}:${(m % 60).toString().padStart(2, '0')}`;
const minutes = (s: string) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
type Props = { forslag: SchemaForslag; typer: SchemaAktivitetsTyp[]; activities: SchemaAktivitet[]; tid?: NyAktivitetsTid | null; aktivitet?: SchemaAktivitet | null;
  personalLookup?: boolean; onSessionLost?: () => void;
  busy: boolean; saveError?: string | null; recoveryAction?: ReactNode; onSave: (a: SchemaAktivitet | SchemaAktivitet[]) => Promise<boolean>; onClose: () => void; onTypes: () => void };
export function AktivitetForm({ forslag: f, typer, activities, tid, aktivitet, busy, saveError, recoveryAction, personalLookup = false, onSessionLost, onSave, onClose, onTypes }: Props) {
  const personalKey = `${f.unitId}:${f.schoolYear}`, sessionLost = useRef(onSessionLost);
  useEffect(() => { sessionLost.current = onSessionLost; }, [onSessionLost]);
  const [personalTry, setPersonalTry] = useState(0), [personal, setPersonal] = useState<{ key: string; people: { ref: string; name: string }[]; loading: boolean; error: string | null }>({ key: personalKey, people: [], loading: personalLookup, error: null });
  useEffect(() => {
    if (!personalLookup) return;
    const controller = new AbortController(), unitId = f.unitId, schoolYear = f.schoolYear;
    queueMicrotask(() => { if (!controller.signal.aborted) setPersonal(old => ({ key: personalKey, people: old.key === personalKey ? old.people : [], loading: true, error: null })); });
    void api.post<unknown>('/api/tjanst/personal/lasa', { unitId }, controller.signal).then(raw => {
      const read = parsePersonalReadReply(raw, { unitId });
      if (controller.signal.aborted) return;
      // Samma urval som schema-read: Person/Duty för skolan och läsåret. Endast tillfälliga val, aldrig del av utkastets grund.
      const people = read.people.filter(p => p.status === 'active' && p.duties.some(d => d.unitId === unitId
        && d.startsOn <= `${schoolYear + 1}-06-30` && (d.endsOn === null || d.endsOn >= `${schoolYear}-07-01`)))
        .map(p => ({ ref: p.id, name: `${p.givenName} ${p.familyName}`.trim() })).sort((a, b) => a.name.localeCompare(b.name, 'sv') || a.ref.localeCompare(b.ref));
      setPersonal({ key: personalKey, people, loading: false, error: null });
    }).catch(caught => {
      if (controller.signal.aborted || caught instanceof DOMException && caught.name === 'AbortError') return;
      if (caught instanceof ApiError && caught.status === 401) { sessionLost.current?.(); return; }
      setPersonal(old => ({ key: personalKey, people: old.key === personalKey ? old.people : [], loading: false,
        error: 'Skolans övriga personal kunde inte hämtas. Personalen i schemat och dina val finns kvar.' }));
    });
    return () => controller.abort();
  }, [personalLookup, personalKey, f.unitId, f.schoolYear, personalTry]);
  const knownTeachers = new Set(f.resurser.larare.map(p => p.ref));
  // Behåll grundens första rader i sin ordning; dess anonyma lärar-ID:n får inte ommappas av uppslaget.
  const teachers = [...f.resurser.larare, ...(personalLookup && personal.key === personalKey ? personal.people.filter(p => !knownTeachers.has(p.ref)) : [])];
  const personalFeedback = personalLookup && personal.key === personalKey && <>
    {personal.loading && <output className="text-muted-foreground">Hämtar skolans övriga personal…</output>}
    {personal.error && <><p role="alert" className="text-destructive">{personal.error}</p><Button variant="outline" onClick={() => setPersonalTry(n => n + 1)}>Försök igen</Button></>}
  </>;
  const first = typer.find(t => t.name === 'Mentorstid') ?? typer[0] ?? aktivitetsTyper()[0];
  const [draft, setDraft] = useState<SchemaAktivitet>(() => aktivitet ?? {
    id: nyAktivitetId(activities), typId: first.id, typ: first.name, name: first.name, classRefs: tid?.resurs?.slag === 'klass' ? [tid.resurs.ref] : [],
    groupRefs: tid?.resurs?.slag === 'grupp' ? [tid.resurs.ref] : [], teacherRefs: tid?.resurs?.slag === 'larare' ? [tid.resurs.ref] : [], rooms: tid?.resurs?.slag === 'sal' ? [tid.resurs.ref] : [],
    durationMin: 20, veckor: { typ: 'alla' }, visibleFor: first.visibleFor, margin: first.margin, tid: { typ: 'fast', day: tid?.day ?? 0, startMin: tid?.startMin ?? 480 },
  });
  // En per klass (05.2-SM-UXF-52): en egen aktivitet för varje vald klass, med ansvarig per klass.
  const [perKlass, setPerKlass] = useState(false), [ansvarig, setAnsvarig] = useState<Record<string, string>>({});
  const [error, setError] = useState(''), [attempted, setAttempted] = useState<string | null>(null), [weeks, setWeeks] = useState(draft.veckor.typ === 'valda' ? draft.veckor.veckor.join(', ') : '35, 36, 37');
  const proposalKey = JSON.stringify([f.grundFingerprint, f.villkor]);
  const shownError = error || (attempted === proposalKey && !busy ? saveError ?? 'Aktiviteten kunde inte kontrolleras. Dina val står kvar. Försök igen.' : '');
  const patch = (value: Partial<SchemaAktivitet>) => { setDraft(d => ({ ...d, ...value })); setError(''); setAttempted(null); };
  const chooseType = (id: string) => {
    if (id === '__ny__') { onTypes(); return; }
    const t = typer.find(t => t.id === id); if (!t) return;
    patch({ typId: t.id, typ: t.name, name: draft.name === draft.typ ? t.name : draft.name, visibleFor: t.visibleFor, margin: t.margin });
  };
  const toggle = (key: 'classRefs' | 'groupRefs' | 'teacherRefs', id: string) => patch({ [key]: draft[key].includes(id) ? draft[key].filter(x => x !== id) : [...draft[key], id] });
  const groups = [...new Set(typer.map(t => t.group))];
  const values = (key: 'classRefs' | 'groupRefs' | 'teacherRefs', label: string, items: { ref: string; name: string }[], feedback?: ReactNode) => <fieldset className="akt-val"><legend>{label}</legend>
    <div>{items.map(i => <label className="akt-check" key={i.ref}><input type="checkbox" checked={draft[key].includes(i.ref)} onChange={() => toggle(key, i.ref)}/>{i.name}</label>)}
      {!items.length && <p className="text-muted-foreground">Inga {label.toLowerCase()} i underlaget.</p>}</div>{feedback}</fieldset>;
  const serie = !aktivitet && perKlass && draft.classRefs.length >= 2;
  const rader: SerieRad[] = serie ? f.resurser.klass.filter(k => draft.classRefs.includes(k.ref)).map(k => ({ classRef: k.ref, klass: k.name, teacherRef: ansvarig[k.ref] || null })) : [];
  const larareNamn = new Map(teachers.map(t => [t.ref, t.name]));
  const serieKoll = serie ? serieKontroll(serieAktiviteter({ ...draft, teacherRefs: [] }, rader, activities), rader, activities, larareNamn) : null;
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
    if (serie) {
      if (serieKoll?.fel) { setError(serieKoll.fel); return; }
      if (serieKoll && Object.keys(serieKoll.krockar).length) { setError('Samma ansvarig finns för flera klasser på samma tid. Välj olika ansvariga eller lämna ansvarig tom.'); return; }
      setError(''); setAttempted(proposalKey);
      if (await onSave(serieAktiviteter({ ...a, teacherRefs: [] }, rader, activities))) onClose(); return;
    }
    setError(''); setAttempted(proposalKey);
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
      <div className="akt-deltagare">{values('classRefs', 'Klasser', f.resurser.klass)}{values('groupRefs', 'Grupper', f.resurser.grupp)}{values('teacherRefs', 'Ansvariga', teachers, personalFeedback)}
        <fieldset className="akt-val"><legend>Salar</legend><label className="akt-field">Sal<select value={draft.rooms[0] ?? ''} onChange={e => patch({ rooms: e.target.value ? [e.target.value] : [] })}><option value="">Ingen sal</option>{f.rooms.map(r => <option key={r.id} value={r.name}>{r.name}</option>)}</select></label>
          <p className="text-muted-foreground">En sal per aktivitet. Lägg till salens namn i Villkor för schemat först.</p></fieldset></div>
      <fieldset className="akt-nar"><legend>När</legend><div className="akt-segment">
        <Button variant={draft.tid.typ === 'fast' ? 'secondary' : 'outline'} aria-pressed={draft.tid.typ === 'fast'} onClick={() => patch({ tid: { typ: 'fast', day: 0, startMin: draft.tid.startMin } })}>Återkommande</Button>
        <Button variant="outline" disabled aria-describedby="akt-datum-grans">Datum</Button>
        <Button variant={draft.tid.typ === 'motor' ? 'secondary' : 'outline'} aria-pressed={draft.tid.typ === 'motor'} onClick={() => patch({ tid: { typ: 'motor', days: [1, 2, 3], startMin: 840, endMin: 990 } })}>Låt motorn placera</Button></div>
        <p id="akt-datum-grans" className="text-muted-foreground">Här skapar du återkommande aktiviteter. Engångsaktiviteter och inställd undervisning kan inte läggas till här.</p></fieldset>
      <div className="akt-tidfalt"><label className="akt-field">Längd i minuter<input type="number" min={5} max={600} step={5} value={draft.durationMin} onChange={e => patch({ durationMin: Number(e.target.value) })}/></label>
        {draft.tid.typ === 'fast' ? <><label className="akt-field">Veckodag<select value={draft.tid.day} onChange={e => patch({ tid: { typ: 'fast', day: Number(e.target.value), startMin: draft.tid.startMin } })}>{DAGAR.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
          <label className="akt-field">Start<input type="time" step={300} value={time(draft.tid.startMin)} onChange={e => patch({ tid: { typ: 'fast', day: draft.tid.typ === 'fast' ? draft.tid.day : 0, startMin: minutes(e.target.value) } })}/></label></>
          : <><label className="akt-field">Tidigast<input type="time" step={300} value={time(draft.tid.startMin)} onChange={e => { if (draft.tid.typ === 'motor') patch({ tid: { ...draft.tid, startMin: minutes(e.target.value) } }); }}/></label>
            <label className="akt-field">Senast slut<input type="time" step={300} value={time(draft.tid.endMin)} onChange={e => { if (draft.tid.typ === 'motor') patch({ tid: { ...draft.tid, endMin: minutes(e.target.value) } }); }}/></label></>}</div>
      {draft.tid.typ === 'motor' && <fieldset className="akt-nar"><legend>Tillåtna veckodagar</legend><div className="akt-segment">{DAGAR.map((d, i) => <label className="akt-check" key={d}><input type="checkbox" checked={draft.tid.typ === 'motor' && draft.tid.days.includes(i)} onChange={() => { if (draft.tid.typ === 'motor') patch({ tid: { ...draft.tid, days: draft.tid.days.includes(i) ? draft.tid.days.filter(n => n !== i) : [...draft.tid.days, i] } }); }}/>{d}</label>)}</div></fieldset>}
      <div className="akt-tidfalt"><label className="akt-field">Veckor<select value={draft.veckor.typ} onChange={e => patch({ veckor: e.target.value === 'valda' ? { typ: 'valda', veckor: [35] } : { typ: e.target.value as 'alla' | 'udda' | 'jamna' } })}>
        <option value="alla">Varje vecka</option><option value="udda">Udda veckor (A)</option><option value="jamna">Jämna veckor (B)</option><option value="valda">Vissa veckor</option></select></label>
        {draft.veckor.typ === 'valda' && <label className="akt-field">Veckonummer, separerade med komma<input value={weeks} onChange={e => { setWeeks(e.target.value); setError(''); setAttempted(null); }}/></label>}
        <label className="akt-field">Visas för<select value={draft.visibleFor} onChange={e => patch({ visibleFor: e.target.value as 'personal' | 'alla' })}><option value="personal">Personal</option><option value="alla">Elever, vårdnadshavare och personal</option></select></label></div>
      {!aktivitet && draft.classRefs.length >= 2 && <fieldset className="akt-val" data-per-klass><legend>Hur många aktiviteter?</legend>
        <label className="akt-check"><input type="radio" name="akt-antal" checked={!perKlass} onChange={() => setPerKlass(false)}/>En gemensam aktivitet för alla valda klasser</label>
        <label className="akt-check"><input type="radio" name="akt-antal" checked={perKlass} onChange={() => setPerKlass(true)}/>En aktivitet per klass ({draft.classRefs.length} st, som en serie)</label>
        {serie && <><p className="text-muted-foreground">Varje klass får en egen aktivitet med samma tid, längd och veckor. Ansvariga ovan används inte; välj ansvarig per klass. Serien kan tas bort i helhet, och varje aktivitet kan ändras för sig.</p>
          <Table><TableHeader><TableRow><TableHead>Klass</TableHead><TableHead>Aktivitet</TableHead><TableHead>Ansvarig</TableHead><TableHead>Krock</TableHead></TableRow></TableHeader><TableBody>
            {rader.map(r => <TableRow key={r.classRef} data-serie-rad={r.klass}><TableCell>{r.klass}</TableCell><TableCell>{`${draft.name.trim() || draft.typ} ${r.klass}`}</TableCell>
              <TableCell><select aria-label={`Ansvarig för ${r.klass}`} value={ansvarig[r.classRef] ?? ''} onChange={e => { setAnsvarig({ ...ansvarig, [r.classRef]: e.target.value }); setError(''); }}><option value="">Saknar ansvarig</option>{teachers.map(t => <option key={t.ref} value={t.ref}>{t.name}</option>)}</select></TableCell>
              <TableCell>{serieKoll?.krockar[r.classRef] ?? '–'}</TableCell></TableRow>)}</TableBody></Table>
          <p className="text-muted-foreground">{activities.length + rader.length} av högst {AKTIVITET_LIMIT} aktiviteter efter tillägget.</p></>}
      </fieldset>}
      {draft.veckor.typ !== 'alla' && <p className="akt-info">Veckovalet sparas som en märkning. Aktiviteten reserverar fortfarande tiden varje vecka i grundschemat.</p>}
      {draft.margin && <p className="text-muted-foreground">{draft.margin.label}: {draft.margin.beforeMin} min före och {draft.margin.afterMin} min efter, från aktivitetstypen.</p>}
      <p className="text-muted-foreground">Synligheten är ett förval för ett framtida publicerat schema. Aktiviteten publiceras inte när du lägger till den.</p>
      {attempted && attempted !== proposalKey && !busy && <output>Nytt schemaförslag är klart. Dina val finns kvar. Välj {aktivitet ? 'Ändra aktiviteten' : 'Lägg till aktivitet'} för att fortsätta.</output>}
      {shownError && <div className="akt-fel"><p role="alert" className="text-destructive">{shownError}</p>{recoveryAction}<p className="text-muted-foreground">{aktivitet ? 'Ändringen har inte sparats.' : 'Aktiviteten har inte lagts till.'} Dina val finns kvar i formuläret.</p></div>}
      <div className="akt-segment"><Button disabled={busy} onClick={() => void save()}>{busy ? 'Prövar aktiviteten…' : aktivitet ? 'Ändra aktiviteten' : serie ? `Lägg till ${rader.length} aktiviteter` : 'Lägg till aktivitet'}</Button><Button disabled={busy} variant="outline" onClick={onClose}>Avbryt</Button></div>
    </div>
  </DialogContent></Dialog>;
}
