'use client';
// Fönsterlisten följer design/Fonster: ett utkast, flera vyer och en tydlig avbruten kontakt.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ExternalLinkIcon, PanelsTopLeftIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { lasArbetsvyer, sakerArbetsvy, skrivArbetsvyer, tomtSamlingFilter, type SamlingArbetsvy } from '@/lib/schema-samling.ts';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { fonsterUrl, fonsterVyNamn, sakerFonsteruppsattning, schemaDraftId, skapaSchemaSynk, type SchemaFonsterTarget, type SchemaFonsterVal, type SchemaSynkStatus } from '@/lib/schema-synk.ts';

export type SchemaFonsterSynk<A> = SchemaSynkStatus & {
  role: 'host' | 'child'; unitId: string; draftId: string; popupBlocked: boolean; opened: SchemaFonsterVal[];
  send: (action: A) => boolean; refresh: () => void; open: (value: SchemaFonsterVal) => void; openSet: (values: SchemaFonsterVal[]) => void;
};
export function useSchemaSynk<T, A>(options: {
  unitId: string; schoolYear: number; scopeKey: string; fonster?: SchemaFonsterTarget;
  state: T; onState: (state: T) => void; onAction: (action: A) => void; blocked: boolean;
}): SchemaFonsterSynk<A> {
  const latest = useRef(options); useEffect(() => { latest.current = options; });
  const [draftId] = useState(() => {
    if (options.fonster) return options.fonster.draftId;
    let storage: Storage | null = null;
    try { storage = window.sessionStorage; } catch { /* minnet räcker */ }
    return schemaDraftId(storage, options.scopeKey, options.unitId, options.schoolYear, () => crypto.randomUUID());
  });
  const [status, setStatus] = useState<SchemaSynkStatus>({ live: !options.fonster && typeof BroadcastChannel !== 'undefined', version: 0, lastUpdated: null, windows: 1 });
  const [opened, setOpened] = useState<SchemaFonsterVal[]>([]);
  const controller = useRef<ReturnType<typeof skapaSchemaSynk<T, A>> | null>(null), pending = useRef<A[]>([]), scheduled = useRef(false);
  const role = options.fonster ? 'child' as const : 'host' as const;
  const stateKey = JSON.stringify(options.state), published = useRef<string | null>(null);
  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    let port: BroadcastChannel;
    try { port = new BroadcastChannel(`skolplattform-schema:${options.scopeKey}:${options.unitId}:${options.schoolYear}:${draftId}`); }
    catch { queueMicrotask(() => setStatus(s => ({ ...s, live: false }))); return; }
    const current = skapaSchemaSynk<T, A>({ role, id: crypto.randomUUID(), port,
      getState: () => latest.current.state, applyState: state => latest.current.onState(state), onAction: action => latest.current.onAction(action),
      onStatus: next => setStatus(previous => JSON.stringify(previous) === JSON.stringify(next) ? previous : next),
      view: latest.current.fonster, onWindows: values => setOpened(previous => JSON.stringify(previous) === JSON.stringify(values) ? previous : values), blocked: () => latest.current.blocked });
    controller.current = current;
    const beat = window.setInterval(() => current.tick(), 500), leave = () => current.disconnect();
    window.addEventListener('pagehide', leave);
    return () => { clearInterval(beat); window.removeEventListener('pagehide', leave); current.disconnect(); controller.current = null; pending.current = []; scheduled.current = false; };
  }, [role, options.scopeKey, options.unitId, options.schoolYear, draftId]);
  useEffect(() => { if (role === 'host' && published.current !== stateKey) { published.current = stateKey; controller.current?.publish(); } }, [stateKey, role]);
  const open = (value: SchemaFonsterVal) => {
    // Provharnessen använder samma komponent och transport, men en Vite-ingång för routen.
    const path = window.location.pathname.startsWith('/e2e/fixtures/') ? '/e2e/fixtures/schema-fonster-preview.html' : '/schema/fonster';
    const child = window.open(fonsterUrl(options.unitId, options.schoolYear, draftId, value, path), '_blank', 'popup,width=1280,height=1000');
    if (!child) { setPopupBlocked(true); return; }
    setOpened(values => [...values, value].slice(-12)); setPopupBlocked(false);
  };
  const [popupBlocked, setPopupBlocked] = useState(false);
  // Popupbeskedet läses av menyn utan att lägga namn eller elevval i någon lagring.
  const send = (action: A): boolean => {
    if (!status.live || latest.current.blocked || !controller.current) return false;
    pending.current.push(action);
    if (!scheduled.current) { scheduled.current = true; queueMicrotask(() => { const actions = pending.current; pending.current = []; scheduled.current = false; controller.current?.actions(actions); }); }
    return true;
  };
  return { ...status, role, unitId: options.unitId, draftId, opened, send, refresh: () => controller.current?.refresh(), open,
    openSet: values => { for (const value of sakerFonsteruppsattning(values)) open(value); },
    popupBlocked };
}

export function FonsterList<A>({ synk, title, children }: { synk: SchemaFonsterSynk<A>; title: string; children?: ReactNode }) {
  const time = synk.lastUpdated === null ? '—' : new Intl.DateTimeFormat('sv-SE', { hour: '2-digit', minute: '2-digit' }).format(synk.lastUpdated);
  return <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-3" aria-label="Fönsterstatus">
    <strong className="min-w-0 break-words">Schema · {title}</strong>
    <output className={`status-badge${synk.live ? ' success' : ' warning'}`}>{synk.live ? 'Live' : `Inte uppdaterat sedan ${time}`}</output>
    {synk.role === 'host' && <span className="text-muted-foreground">Fönster 1 av {synk.windows}</span>}
    {!synk.live && <Button variant="outline" onClick={synk.refresh}>Läs om</Button>}
    {children}
  </div>;
}
export function FonsterMeny<A>({ synk, disabled = false, resource }: { synk: SchemaFonsterSynk<A>; disabled?: boolean; resource?: string }) {
  const nameId = useId();
  const [name, setName] = useState(''), [saved, setSaved] = useState<SamlingArbetsvy[]>(() => { try { return lasArbetsvyer(localStorage, synk.unitId); } catch { return []; } }), [message, setMessage] = useState('');
  // Fönsteruppsättningen består bara av vytyper och körningsreferenser. Elevval sparas aldrig.
  const save = () => {
    if (!name.trim()) return;
    try {
    const current = lasArbetsvyer(localStorage, synk.unitId), windows = sakerFonsteruppsattning(synk.opened);
    const view = sakerArbetsvy({ id: crypto.randomUUID(), name: name.trim(), resources: [], layers: {}, filter: tomtSamlingFilter(), color: 'amne', compact: false, day: 0, windows });
    const next = [...current, view].slice(-40);
    if (skrivArbetsvyer(localStorage, synk.unitId, next)) { setSaved(next); setMessage('Fönstren är sparade som arbetsvy i den här webbläsaren. Elevval följer inte med.'); }
    else setMessage('Arbetsvyn kunde inte sparas i webbläsaren.');
    } catch { setMessage('Arbetsvyn kunde inte sparas i webbläsaren.'); }
  };
  return <div className="flex flex-wrap items-center gap-2">
    <DropdownMenu><DropdownMenuTrigger render={<Button type="button" variant="outline" disabled={disabled}/> }><PanelsTopLeftIcon aria-hidden="true"/>Fönster</DropdownMenuTrigger>
      <DropdownMenuContent className="schema-meny"><DropdownMenuGroup><DropdownMenuLabel>Öppna i nytt fönster</DropdownMenuLabel>
        {(Object.keys(fonsterVyNamn) as SchemaFonsterVal['view'][]).map(view => <DropdownMenuItem key={view} onClick={() => synk.open({ view, ...(resource && (view === 'vecka' && /^(klass|grupp):/u.test(resource) || view === 'larare' && resource.startsWith('larare:') || view === 'sal' && resource.startsWith('sal:')) ? { resource } : {}) })}><ExternalLinkIcon aria-hidden="true"/>{fonsterVyNamn[view]}</DropdownMenuItem>)}
        </DropdownMenuGroup><DropdownMenuSeparator/><DropdownMenuGroup><DropdownMenuLabel>Fönstren visar samma utkast</DropdownMenuLabel></DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
    {synk.role === 'host' && <details className="min-w-0"><summary className="cursor-pointer">Fönstren som arbetsvy</summary><div className="flex flex-wrap items-end gap-2 py-2">
      <label htmlFor={nameId} className="flex flex-col gap-1">Namn på fönsterarbetsvyn<Input id={nameId} value={name} maxLength={80} onChange={e => setName(e.target.value)}/></label>
      <Button variant="outline" disabled={!name.trim() || synk.opened.length === 0} onClick={save}>Spara fönstren som arbetsvy</Button>
      <label className="flex flex-col gap-1">Öppna fönsterarbetsvy<select className="rounded-md border border-border bg-background p-2" value="" onChange={e => { const v = saved.find(s => s.id === e.target.value); if (v?.windows) synk.openSet(v.windows); }}><option value="">Välj arbetsvy</option>{saved.filter(s => s.windows?.length).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
    </div></details>}
    <p className="schema-note basis-full">Webbläsaren kan behöva tillåta popup-fönster. Fönstren delar samma utkast och ångra. Lämna huvudfönstret öppet. Sparade fönster visar samma klass eller resurs när den finns i underlaget. Elevval följer inte med.</p>
    {synk.popupBlocked && <p role="alert">Fönstret kunde inte öppnas. Tillåt popup-fönster och försök igen.</p>}
    {message && <output>{message}</output>}
  </div>;
}

/** Gemensam rubrikåtgärd: samma fönstermeny finns också för tangentbordet. */
export function OppnaFonster({ onOpen, label }: { onOpen?: () => void; label: string }) {
  return onOpen ? <Button type="button" variant="outline" aria-label={`Öppna ${label} i nytt fönster`} onClick={event => { event.preventDefault(); event.stopPropagation(); onOpen(); }}><ExternalLinkIcon aria-hidden="true"/>Öppna i nytt fönster</Button> : null;
}
