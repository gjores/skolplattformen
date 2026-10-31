'use client';

import { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import type { TjanstNeedSharing, TjanstPlanRead, TjanstSharingMode } from '@/lib/tjanst-contract.ts';
import { defaultGraders, needTeachers } from '@/lib/tjanst-model.ts';
import { Problems, Shell, useSubmit, useDraftField, type TjanstFormCache, type TjanstOutcome } from './tjanst-dialogs';
import { formatTime } from './tjanst-service-summary';

/**
 * 05.1-33 / D-31: hur flera lärare delar ett behov (en i taget eller samtidigt) och vem som sätter betyg
 * (skollagen 3 kap. 16 §). Formen styr täckningen: samtidigt räknas behovet en gång. Inget väljs automatiskt.
 * Behörigheten är okänd till fas 05.4 och visas bara som upplysning.
 */
type Props = { open: boolean; checking: boolean; disabled?: boolean; supportNotice?: React.ReactNode; data: TjanstPlanRead; sourceKey: string; title: string;
  form?: TjanstFormCache; onField?: (key: string, value: unknown, dirty?: boolean) => void; onClose: () => void; onDiscard?: () => void; onSave: (mode: TjanstSharingMode, graderPersonIds: string[]) => Promise<TjanstOutcome>; onClear: () => Promise<TjanstOutcome> };
export const SHARING_LABEL: Record<TjanstSharingMode, string> = { sequential: 'En i taget', concurrent: 'Samtidigt i samma grupp' };

export default function TjanstSharingDialog({ open, checking, disabled = false, supportNotice, data, sourceKey, title, form, onField, onClose, onDiscard, onSave, onClear }: Props) {
  const id = useId();
  const current: TjanstNeedSharing | undefined = data.sharing.find(x => x.sourceKey === sourceKey);
  const teachers = needTeachers(sourceKey, data.rows);
  const name = (personId: string) => data.teachers.find(t => t.personId === personId)?.displayName ?? 'Okänd lärare';
  const time = (personId: string) => data.rows.filter(r => r.sourceKey === sourceKey && r.personId === personId).reduce((s, r) => ({ ht: s.ht + r.teacherHt, vt: s.vt + r.teacherVt }), { ht: 0, vt: 0 });
  const need = data.classes.flatMap(c => c.needs).find(n => n.sourceKey === sourceKey) ?? data.groups?.find(group => group.sourceKey === sourceKey);
  const [mode, setMode] = useDraftField<TjanstSharingMode | null>({ form, onField }, 'sharingMode', current?.mode ?? null);
  const [graders, setGraders] = useDraftField<string[]>({ form, onField }, 'sharingGraders', current?.graderPersonIds.filter(g => teachers.includes(g)) ?? []);
  const [touched, setTouched] = useState(!!current), [error, setError] = useState<string | null>(null);
  const { busy, failure, run } = useSubmit(onClose);
  function choose(next: TjanstSharingMode) { setMode(next); if (!touched) setGraders(defaultGraders(next, sourceKey, data.rows)); setError(null); }
  function toggle(personId: string, on: boolean) { setTouched(true); setGraders(g => on ? [...new Set([...g, personId])] : g.filter(x => x !== personId)); setError(null); }
  function save() {
    if (!mode) { setError('Välj hur lärarna delar kursen.'); return; }
    if (!graders.length) { setError('Välj minst en lärare som sätter betyg.'); return; }
    void run(() => onSave(mode, graders));
  }
  const sum = teachers.reduce((s, p) => { const t = time(p); return { ht: s.ht + t.ht, vt: s.vt + t.vt }; }, { ht: 0, vt: 0 });
  const max = teachers.reduce((s, p) => { const t = time(p); return { ht: Math.max(s.ht, t.ht), vt: Math.max(s.vt, t.vt) }; }, { ht: 0, vt: 0 });
  const needText = need ? `HT ${need.needHt === null ? 'okänt' : formatTime(need.needHt)} · VT ${need.needVt === null ? 'okänt' : formatTime(need.needVt)}` : 'okänt';
  return <Shell open={open} busy={busy} onClose={onClose} title="Hur delar lärarna kursen?" description={`${title}. Flera lärare har tid på ${need?.sourceKind === 'teaching_group' ? 'samma undervisning i gruppen' : 'samma kurs i klassen'}.`}>
    {supportNotice}
    <Problems failure={failure} checking={checking} summary={false}/>
    <dl className="mandate-facts tjanst-facts">
      <div><dt>Behov enligt timplanen</dt><dd>{needText}</dd></div>
      <div><dt>Lärare</dt><dd>{teachers.map(p => { const t = time(p); return <span key={p} className="tjanst-sharing-teacher">{name(p)}: HT {formatTime(t.ht)} · VT {formatTime(t.vt)}</span>; })}</dd></div>
    </dl>
    <fieldset className="tjanst-sharing-modes" disabled={busy || disabled}><legend>Delning</legend>
      <label className="tjanst-sharing-mode"><input type="radio" name={`${id}-mode`} checked={mode === 'sequential'} onChange={() => choose('sequential')}/>
        <span><strong>En i taget</strong> (till exempel HT och VT, eller olika moment). Lärarnas tid räknas ihop mot behovet: nu HT {formatTime(sum.ht)} · VT {formatTime(sum.vt)}.</span></label>
      <label className="tjanst-sharing-mode"><input type="radio" name={`${id}-mode`} checked={mode === 'concurrent'} onChange={() => choose('concurrent')}/>
        <span><strong>Samtidigt i samma grupp</strong> (tvålärarskap). Behovet räknas en gång (HT {formatTime(max.ht)} · VT {formatTime(max.vt)}), och båda lärarna har hela sin tid i tjänsten.</span></label>
    </fieldset>
    <fieldset className="tjanst-sharing-graders" disabled={busy || disabled || !mode}><legend>Sätter betyg</legend>
      <p>Betyget beslutas av den eller de lärare som undervisar när betyget sätts (skollagen 3 kap. 16 §). Behörighetsunderlag saknas, så behörigheten kontrolleras inte här.</p>
      {teachers.map(p => <label key={p} className="mandate-check"><input type="checkbox" checked={graders.includes(p)} onChange={e => toggle(p, e.target.checked)}/>{name(p)}</label>)}
    </fieldset>
    {error && <p role="alert" className="validation-warning">{error}</p>}
    <div className="mandate-actions">
      <Button type="button" disabled={busy || disabled} onClick={save}>{busy ? 'Sparar…' : 'Spara delningen'}</Button>
      <Button type="button" variant="outline" disabled={busy} onClick={onDiscard ?? onClose}>Bestäm senare</Button>
      {current && <Button type="button" variant="outline" disabled={busy || disabled} onClick={() => void run(onClear)}>Ta bort delningen</Button>}
    </div>
    {!current && <p className="tjanst-direct-hint">Bestäm senare: raden markeras som Två lärare utan angiven delning, och fördelningen kan inte publiceras förrän delningen är angiven.</p>}
  </Shell>;
}
