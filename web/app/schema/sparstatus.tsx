'use client';
import { useId } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { SchemaSparstatus } from '@/lib/schema-spara.ts';

const TEXT = { loading: 'Läser sparat utkast…', idle: 'Osparade ändringar', saving: 'Sparar utkast…', saved: 'Sparat på servern', error: 'Utkastet behöver kontrolleras', unknown: 'Sparandet behöver kontrolleras', conflict: 'En nyare version finns', stale: 'Underlaget har ändrats' };
export function Sparstatus({ state, name, disabled, child, onName, onSave, onRead, onNew }: {
  state: SchemaSparstatus; name: string; disabled: boolean; child: boolean; onName: (value: string) => void; onSave: () => void; onRead: () => void; onNew: () => void;
}) {
  const nameId = useId();
  const failed = ['error', 'unknown', 'conflict', 'stale'].includes(state.phase);
  return <section className="schema-sparstatus min-w-0 space-y-2" aria-label="Sparat schemautkast">
    <div className="flex flex-wrap items-end gap-3">
      <label htmlFor={nameId} className="min-w-0 w-56 max-w-full text-muted-foreground">Namn på utkastet<Input id={nameId} maxLength={120} value={name} disabled={disabled || child} onChange={e => onName(e.target.value)}/></label>
      <output aria-live="polite" className="flex min-h-11 flex-wrap items-center gap-x-2 gap-y-1"><span className={`status-badge${state.phase === 'saved' && !state.dirty ? ' success' : failed ? ' warning' : ''}`}>{TEXT[state.phase]}</span>{state.savedAt && <span className="text-sm text-muted-foreground">{new Date(state.savedAt).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' })} · version {state.revision}</span>}</output>
      {!child && <Button type="button" variant="ghost" disabled={disabled || !state.dirty || ['loading', 'saving', 'conflict', 'stale'].includes(state.phase)} onClick={onSave}>{state.phase === 'unknown' ? 'Kontrollera sparandet' : 'Spara nu'}</Button>}
    </div>
    {state.message && <p role={failed ? 'alert' : undefined} className={failed ? 'text-destructive' : 'text-muted-foreground'}>{state.message}</p>}
    {!child && state.phase === 'error' && !state.revision && <Button type="button" variant="outline" onClick={onRead}>Försök läsa utkastet igen</Button>}
    {!child && state.phase === 'conflict' && <Button type="button" variant="outline" onClick={onRead}>Läs serverns version…</Button>}
    {!child && state.phase === 'stale' && <Button type="button" variant="outline" disabled={disabled} onClick={onNew}>Ta fram nytt förslag från aktuellt underlag</Button>}
  </section>;
}
