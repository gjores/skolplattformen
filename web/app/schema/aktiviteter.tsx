'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { SchemaForslag, SchemaForslagLesson, SchemaVillkor } from '@/lib/schema-contract.ts';
import { aktivitetPass, aktivitetsTidText, aktivitetsTyper, aktivitetTypAndra, readAktivitetsTyper, writeAktivitetsTyper, type SchemaAktivitet, type SchemaAktivitetsTyp } from '@/lib/schema-aktiviteter.ts';
import { AktivitetForm, type NyAktivitetsTid } from './aktivitet-form.tsx';
import type { DatumAktivitetUnderlag } from './datum-aktivitet-form.tsx';
import './aktiviteter.css';

export type { DatumAktivitetVal } from './datum-aktivitet-form.tsx';

export type AktiviteterProps = { forslag: SchemaForslag; villkor: SchemaVillkor; lessons: SchemaForslagLesson[]; busy: boolean; saveError?: string | null;
  recoveryAction?: ReactNode; recoveryPreview?: ReactNode; activityTypes?: SchemaAktivitetsTyp[]; onTypesChange?: (types: SchemaAktivitetsTyp[]) => void;
  datum?: DatumAktivitetUnderlag; personalLookup?: boolean; onSessionLost?: () => void;
  onChange: (next: SchemaAktivitet[], text: string) => Promise<boolean>; start?: NyAktivitetsTid | null; onStartHandled?: () => void };
function lokalaTyper(unitId: string): SchemaAktivitetsTyp[] {
  try { return readAktivitetsTyper(window.localStorage, unitId); } catch { return aktivitetsTyper(); }
}
export function Aktiviteter({ forslag: f, villkor, lessons, busy, saveError, recoveryAction, recoveryPreview, activityTypes, onTypesChange, datum, personalLookup, onSessionLost, onChange, start, onStartHandled }: AktiviteterProps) {
  const [typeState, setTypeState] = useState(() => ({ unitId: f.unitId, types: lokalaTyper(f.unitId) }));
  if (typeState.unitId !== f.unitId) setTypeState({ unitId: f.unitId, types: lokalaTyper(f.unitId) });
  const types = activityTypes ?? typeState.types, setTypes = (next: SchemaAktivitetsTyp[]) => { if (onTypesChange) onTypesChange(next); else setTypeState({ unitId: f.unitId, types: next }); };
  const [form, setForm] = useState<{ aktivitet?: SchemaAktivitet; tid?: NyAktivitetsTid } | null>(null), [manage, setManage] = useState(false);
  const activities = villkor.aktiviteter ?? [];
  useEffect(() => { if (activityTypes || typeState.unitId !== f.unitId) return; try { writeAktivitetsTyper(window.localStorage, f.unitId, types); } catch { /* även lagringens getter kan nekas */ } }, [types, typeState.unitId, f.unitId, activityTypes]);
  const [handledStart, setHandledStart] = useState<NyAktivitetsTid | null>(null);
  if (start && start !== handledStart) { setHandledStart(start); setForm({ tid: start }); }
  useEffect(() => { if (start) onStartHandled?.(); }, [start, onStartHandled]);
  const save = (a: SchemaAktivitet | SchemaAktivitet[]) => Array.isArray(a) ? onChange([...activities, ...a], `${a.length} aktiviteter är tillagda, en per klass`)
    : onChange(activities.some(x => x.id === a.id) ? activities.map(x => x.id === a.id ? a : x) : [...activities, a], form?.aktivitet ? `Aktiviteten ${a.name} är ändrad` : `Aktiviteten ${a.name} är tillagd`);
  const name = (ref: string) => [...f.resurser.klass, ...f.resurser.grupp, ...f.resurser.larare].find(r => r.ref === ref)?.name ?? 'Resursen finns inte i underlaget';
  return <section className="aktiviteter" aria-labelledby="aktiviteter-rubrik">
    <div className="akt-rubrik"><div><p className="eyebrow">Schema · Egna aktiviteter</p><h3 id="aktiviteter-rubrik" className="section-heading">Aktiviteter utanför tjänstefördelningen</h3>
      <p className="text-muted-foreground">Återkommande aktiviteter som möten, mentorstid och tillsyn upptar deltagarna i grundschemat.{datum && ' Daterade aktiviteter kan påverka lektionstillfällen den dagen.'}</p></div>
      <div className="akt-segment"><Button disabled={busy} variant="outline" onClick={() => setForm({})}>Ny aktivitet</Button><Button variant="outline" disabled={busy} onClick={() => setManage(true)}>Hantera typer</Button></div></div>
    <h4>Aktiviteter läsåret {f.schoolYear}/{String(f.schoolYear + 1).slice(2)} ({activities.length})</h4>
    {!activities.length ? <div className="empty-state"><p>Inga egna aktiviteter ännu. Lägg till en aktivitet eller högerklicka på en tid i veckan.</p></div>
      : <Table><TableHeader><TableRow><TableHead>Aktivitet</TableHead><TableHead>Typ</TableHead><TableHead>Deltagare</TableHead><TableHead>När</TableHead><TableHead>Påverkan</TableHead><TableHead>Åtgärder</TableHead></TableRow></TableHeader><TableBody>
        {activities.map(a => { const pass = aktivitetPass(lessons, a.id), at = pass?.day !== null && pass?.startMin !== null && pass?.day !== undefined && pass?.startMin !== undefined
          ? `${['måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag'][pass.day]} ${Math.floor(pass.startMin / 60).toString().padStart(2, '0')}:${(pass.startMin % 60).toString().padStart(2, '0')}` : null;
          const status = at ? 'Lagd' : f.metrics.placed === 0 ? 'Klar att lägga' : 'Utan tid';
          const tilldeladSal = at && pass?.roomId ? f.rooms.find(r => r.id === pass.roomId)?.name : undefined;
          const tilldeladAnsvarig = at && pass?.ansvarig ? name(pass.ansvarig) : undefined;
          const deltagare = [...a.classRefs, ...a.groupRefs].map(name).join(', ');
          return <TableRow key={a.id} data-aktivitet={a.id}><TableCell><strong>{a.name}</strong><br/><span className={`status-badge${at ? ' success' : ''}`}>{status}</span></TableCell><TableCell>{a.typ}</TableCell>
            <TableCell>
              {deltagare && <p>{deltagare}</p>}
              {a.teacherRefs.length > 0 && <p>{a.teacherRefs.map(name).join(', ')} · {a.teacherRefs.length > 1 ? 'Låsta' : 'Låst'}</p>}
              {a.ansvarigval === 'motor' && <p>{tilldeladAnsvarig ? `${tilldeladAnsvarig} · Vald av motorn` : 'Motorn väljer ansvarig'}</p>}
              {a.rooms.length > 0 && <p>{a.rooms.join(', ')} · Låst</p>}
              {a.salval === 'motor' && <p>{tilldeladSal ? `${tilldeladSal} · Vald av motorn` : 'Motorn väljer sal'}</p>}
            </TableCell>
            <TableCell>{aktivitetsTidText(a)}{a.tid.typ === 'motor' && at && <p>Nu {at}</p>}{a.veckor.typ !== 'alla' && <p className="text-muted-foreground">Upptar alla veckor i grundschemat.</p>}</TableCell>
            <TableCell>Upptar deltagarna{a.rooms.length || tilldeladSal ? ' och salen' : ''}. Ingen timplanetid.</TableCell><TableCell><div className="akt-segment"><Button variant="outline" disabled={busy} onClick={() => setForm({ aktivitet: a })} aria-label={`Ändra aktiviteten ${a.name}`}>Ändra</Button>
              <Button variant="outline" disabled={busy} onClick={() => void onChange(activities.filter(x => x.id !== a.id), `Aktiviteten ${a.name} är borttagen`)} aria-label={`Ta bort aktiviteten ${a.name}`}>Ta bort</Button>
              {a.serie && activities.filter(x => x.serie === a.serie).length > 1 && <Button variant="outline" disabled={busy} aria-label={`Ta bort hela serien som ${a.name} hör till`}
                onClick={() => void onChange(activities.filter(x => x.serie !== a.serie), `Serien med ${activities.filter(x => x.serie === a.serie).length} aktiviteter är borttagen`)}>Ta bort serien</Button>}</div></TableCell></TableRow>;
        })}</TableBody></Table>}
    {form && <AktivitetForm key={form.aktivitet?.id ?? form.tid?.nr ?? 'ny'} forslag={f} villkor={villkor} typer={types} activities={activities} aktivitet={form.aktivitet} tid={form.tid} busy={busy} saveError={saveError} recoveryAction={recoveryAction} recoveryPreview={recoveryPreview} personalLookup={personalLookup} onSessionLost={onSessionLost}
      datum={datum && (!datum.initial || form.tid?.daterad) ? datum : undefined} datumHinder={datum?.initial ? 'Ändra den väntande bokningen för att välja ett nytt datum.' : undefined}
      onSave={save} onClose={() => setForm(null)} onTypes={() => setManage(true)}/>}
    {manage && <AktivitetsTyper serverSaved={!!activityTypes} typer={types} onChange={setTypes} onClose={() => setManage(false)}/>}
  </section>;
}

function AktivitetsTyper({ typer, onChange, onClose, serverSaved }: { serverSaved: boolean; typer: SchemaAktivitetsTyp[]; onChange: (t: SchemaAktivitetsTyp[]) => void; onClose: () => void }) {
  const fresh = (): SchemaAktivitetsTyp => ({ id: `typ-${crypto.randomUUID()}`, name: '', group: 'Övrigt', participants: 'personal', visibleFor: 'personal', margin: null });
  const [edit, setEdit] = useState<SchemaAktivitetsTyp>(fresh), [error, setError] = useState('');
  const patch = (value: Partial<SchemaAktivitetsTyp>) => setEdit(e => ({ ...e, ...value }));
  const save = () => { try { onChange(aktivitetTypAndra(typer, edit)); setEdit(fresh()); setError(''); } catch (e) { setError(e instanceof Error ? e.message : 'Typen kunde inte sparas.'); } };
  return <Dialog open onOpenChange={open => { if (!open) onClose(); }}><DialogContent className="akt-dialog"><DialogHeader><DialogTitle>Hantera aktivitetstyper</DialogTitle><DialogDescription>{serverSaved ? 'Skolans typlista sparas med schemautkastet.' : 'Skolans typlista sparas i den här webbläsaren.'} Redan inlagda aktiviteter behåller typnamn och förval när listan ändras.</DialogDescription></DialogHeader>
    <div className="akt-form"><div className="akt-tidfalt"><label className="akt-field">Typens namn<input maxLength={80} value={edit.name} onChange={e => patch({ name: e.target.value })}/></label>
      <label className="akt-field">Grupp<input maxLength={60} value={edit.group} onChange={e => patch({ group: e.target.value })} list="akt-typgrupper"/><datalist id="akt-typgrupper" aria-label="Grupper i typlistan">{[...new Set(typer.map(t => t.group))].map(g => <option key={g} value={g}>{g}</option>)}</datalist></label>
      <label className="akt-field">Deltagare som förval<select value={edit.participants} onChange={e => patch({ participants: e.target.value as SchemaAktivitetsTyp['participants'] })}><option value="personal">Personal</option><option value="elever">Elever och ansvariga</option><option value="sal">Sal</option></select></label>
      <label className="akt-field">Synlighet som förval<select value={edit.visibleFor} onChange={e => patch({ visibleFor: e.target.value as SchemaAktivitetsTyp['visibleFor'] })}><option value="personal">Personal</option><option value="alla">Elever, vårdnadshavare och personal</option></select></label></div>
      <label className="akt-check"><input type="checkbox" checked={edit.margin !== null} onChange={e => patch({ margin: e.target.checked ? { typ: 'marginal', beforeMin: 5, afterMin: 5, occupies: ['elever', 'larare', 'sal'], label: 'Övergång', visibleFor: ['elever', 'larare'], when: 'alltid' } : null })}/>Marginal för aktiviteter av typen</label>
      {edit.margin && <div className="akt-tidfalt"><label className="akt-field">Minuter före<input type="number" min={0} max={60} step={5} value={edit.margin.beforeMin} onChange={e => { if (edit.margin) patch({ margin: { ...edit.margin, beforeMin: Number(e.target.value) } }); }}/></label>
        <label className="akt-field">Minuter efter<input type="number" min={0} max={60} step={5} value={edit.margin.afterMin} onChange={e => { if (edit.margin) patch({ margin: { ...edit.margin, afterMin: Number(e.target.value) } }); }}/></label>
        <label className="akt-field">Marginalens etikett<input maxLength={40} value={edit.margin.label} onChange={e => { if (edit.margin) patch({ margin: { ...edit.margin, label: e.target.value } }); }}/></label></div>}
      {error && <p role="alert" className="text-destructive">{error}</p>}<div className="akt-segment"><Button onClick={save}>{typer.some(t => t.id === edit.id) ? 'Spara typen' : 'Lägg till typ'}</Button><Button variant="outline" onClick={() => setEdit(fresh())}>Ny typ</Button></div>
      <Table><TableHeader><TableRow><TableHead>Typ</TableHead><TableHead>Grupp</TableHead><TableHead>Åtgärder</TableHead></TableRow></TableHeader><TableBody>{typer.map(t => <TableRow key={t.id}><TableCell>{t.name}</TableCell><TableCell>{t.group}</TableCell><TableCell>
        <div className="akt-segment"><Button variant="outline" aria-label={`Ändra typen ${t.name}`} onClick={() => setEdit(structuredClone(t))}>Ändra</Button><Button variant="outline" disabled={typer.length <= 1} aria-label={`Ta bort typen ${t.name}`} onClick={() => onChange(typer.filter(x => x.id !== t.id))}>Ta bort</Button></div></TableCell></TableRow>)}</TableBody></Table>
      <Button variant="outline" onClick={onClose}>Stäng</Button></div>
  </DialogContent></Dialog>;
}
