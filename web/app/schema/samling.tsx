'use client';
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from 'react';
import { CheckIcon, SaveIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { api, ApiError } from '@/lib/server-client.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaPlacement, type SchemaTerm, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { lagerPa, SCHEMA_LAGER, schemaLager, type SchemaLagerTyp } from '@/lib/schema-lager.ts';
import { filtreraSamling, gemensamLedigTid, lasArbetsvyer, ledigaResurser, lunchTryck, parseSamlingData, sakerArbetsvy, samlingForslag, samlingHal, samlingPass, samlingResurser, samlingTidsvillkor, skrivArbetsvyer, tomtSamlingFilter,
  SAMLING_NAMN, type SamlingArbetsvy, type SamlingFarg, type SamlingFilter, type SamlingSlag, type SamlingSpann, type SchemaSamlingData } from '@/lib/schema-samling.ts';
import type { SchemaFonsterVal } from '@/lib/schema-synk.ts';
import { clock, dayName } from './delat.ts';
import { OppnaFonster } from './fonster';
import { SamlingMatris } from './samling-matris.tsx';
import { SamlingRad } from './samling-rad.tsx';
import { SamlingSok } from './samling-sok.tsx';
import './samling.css';

export type SamlingStart = { nr: number; resources?: string[]; time?: SamlingSpann; common?: boolean };
type Props = {
  forslag: SchemaForslag; villkor: SchemaVillkor; placements: SchemaPlacement[]; layers: Record<string, boolean>; term: SchemaTerm;
  onLayer: (layer: SchemaLagerTyp, on: boolean) => void; onPick: (lesson: string) => void; onSessionLost: () => void;
  picked?: string | null; violations?: string[]; locked?: string[]; start?: SamlingStart | null;
  onOpen?: () => void; windows?: SchemaFonsterVal[]; onOpenWindows?: (windows: SchemaFonsterVal[]) => void;
};
const EXTRA = [{ id: 'haltid', namn: 'Håltid' }, { id: 'lunchtryck', namn: 'Lunchtryck' }] as const;
const FARG: { id: SamlingFarg; label: string }[] = [{ id: 'amne', label: 'Ämne' }, { id: 'larare', label: 'Lärare' }, { id: 'sal', label: 'Sal' }, { id: 'avvikelse', label: 'Regelavvikelse' }, { id: 'last', label: 'Låst' }];

export function Samling(props: Props) {
  return <SamlingInnehall key={`${props.forslag.unitId}:${props.forslag.grundFingerprint}:${props.start?.nr ?? ''}`} {...props}/>;
}
function SamlingInnehall({ forslag, villkor, placements, layers, term, onLayer, onPick, onSessionLost, picked = null, violations = [], locked = [], start: initial, windows = [], onOpenWindows, onOpen }: Props) {
  const heading = useId(), label = useId(), [readForslag] = useState(forslag), current = useRef({ villkor, placements, onSessionLost });
  useEffect(() => { current.current = { villkor, placements, onSessionLost }; }, [villkor, placements, onSessionLost]);
  const [data, setData] = useState<SchemaSamlingData | null>(null), [error, setError] = useState<string | null>(null), [retry, setRetry] = useState(0);
  const startingKeys = () => { const resources = samlingResurser(forslag), keys = resources.filter(r => initial?.resources?.includes(r.key) || initial?.resources?.includes(r.id)).map(r => r.key); return keys.length ? keys : resources.length ? [resources[0].key] : []; };
  const [selected, setSelected] = useState<string[]>(startingKeys), [checked, setChecked] = useState<string[]>(() => initial?.common ? startingKeys() : []), [common, setCommon] = useState(initial?.common ?? false);
  const [filter, setFilter] = useState<SamlingFilter>(tomtSamlingFilter), [color, setColor] = useState<SamlingFarg>('amne'), [compact, setCompact] = useState(false);
  const [extra, setExtra] = useState<Record<string, boolean>>({}), [matrix, setMatrix] = useState(false), [kind, setKind] = useState<SamlingSlag>('larare'), [day, setDay] = useState<number | null>(initial?.time?.day ?? 0);
  const [when, setWhen] = useState<SamlingSpann | null>(initial?.time ?? null), [subject, setSubject] = useState('');
  const [views, setViews] = useState<SamlingArbetsvy[]>(() => { try { return lasArbetsvyer(window.localStorage, forslag.unitId); } catch { return []; } });
  const [viewId, setViewId] = useState(''), [viewName, setViewName] = useState(''), [note, setNote] = useState('');
  const fingerprint = forslag.grundFingerprint;
  useEffect(() => {
    const abort = new AbortController(), now = current.current;
    api.post<unknown>('/api/schema/samling', { contractVersion: SCHEMA_CONTRACT_VERSION, unitId: readForslag.unitId, schoolYear: readForslag.schoolYear, period: readForslag.period,
      villkor: now.villkor, grundFingerprint: readForslag.grundFingerprint, placements: now.placements }, abort.signal)
      .then(raw => { if (!abort.signal.aborted) { setData(parseSamlingData(raw, readForslag)); setError(null); } })
      .catch((e: unknown) => { if (abort.signal.aborted) return; setData(null);
        if (e instanceof ApiError && e.status === 401) { current.current.onSessionLost(); return; }
        setError(e instanceof ApiError && e.status === 403 ? 'Ditt uppdrag tillåter inte att läsa samlingsvyn.' : e instanceof ApiError && e.status === 409 ? 'Underlaget har ändrats. Ta fram ett nytt schemaförslag.' : 'Grupper, elever och elevantal kunde inte läsas. Försök igen.'); });
    return () => abort.abort();
  // Resursmedlemskap följer grunden, inte en flytt eller en spärr.
  }, [readForslag, retry]);
  const f = useMemo(() => samlingForslag(forslag, placements), [forslag, placements]);
  const resources = data?.grundFingerprint === fingerprint ? data.resources : samlingResurser(f);
  const subjects = [...new Set(f.lessons.map(l => l.title))].sort((a, b) => a.localeCompare(b, 'sv')), years = [...new Set(resources.flatMap(r => r.year ? [r.year] : []))].sort();
  const selectedResources = selected.flatMap(k => { const r = resources.find(r => r.key === k); return r ? [r] : []; });
  const checkedResources = selectedResources.filter(r => checked.includes(r.key));
  const effectiveTerm = filter.term || term, filtered = filtreraSamling(f.lessons, filter, resources);
  const allowedIds = new Set(filtered.map(l => l.id)), days = day === null ? f.days.map((_, i) => i) : [day];
  const from = Math.min(...f.days.map(d => d.startMin)), to = Math.max(...f.days.map(d => d.endMin)), style = { '--span': to - from, '--first-hour': Math.ceil(from / 60) * 60 - from, '--days': days.length } as CSSProperties;
  const commonSlots = common ? gemensamLedigTid(checkedResources, f, villkor, effectiveTerm) : [];
  const lunch = extra.lunchtryck && data ? lunchTryck(data.clusters, f, villkor, effectiveTerm) : null;
  const available = when ? ledigaResurser(resources, f, villkor, effectiveTerm, when, subject) : [];
  const add = (key: string) => { setSelected(xs => xs.includes(key) ? xs : [...xs, key]); setNote(''); };
  const saveViews = (next: SamlingArbetsvy[]): boolean => {
    setViews(next); try { if (skrivArbetsvyer(window.localStorage, forslag.unitId, next)) return true; } catch { /* Även åtkomst till localStorage kan nekas. */ }
    setNote('Arbetsvyn gäller här men kunde inte sparas i webbläsaren.'); return false;
  };
  const chooseView = (id: string) => {
    setViewId(id); const v = views.find(x => x.id === id); if (!v) { setViewName(''); return; }
    if (v.windows?.length) onOpenWindows?.(v.windows);
    setViewName(v.name); setSelected(v.resources.filter(k => resources.some(r => r.key === k))); setChecked([]); setFilter(v.filter); setColor(v.color); setCompact(v.compact); setDay(v.day);
    for (const l of SCHEMA_LAGER) onLayer(l.id, v.layers[l.id] ?? l.forval); setExtra({ haltid: v.layers.haltid ?? false, lunchtryck: v.layers.lunchtryck ?? false });
    const missing = v.resources.filter(k => !resources.some(r => r.key === k)).length; setNote(missing ? `${missing} resurser i arbetsvyn finns inte i det här underlaget.` : `Arbetsvyn ${v.name} är öppnad.`);
  };
  const save = () => {
    if (!viewName.trim()) { setNote('Ge arbetsvyn ett namn.'); return; }
    const id = `vy-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, v = sakerArbetsvy({ id, name: viewName, resources: selected, layers: { ...layers, ...extra }, filter, color, compact, day, windows });
    const saved = saveViews([...views, v]); setViewId(id); if (saved) setNote(`Arbetsvyn ${v.name} är sparad i den här webbläsaren. Elevval följer inte med.`);
  };
  const labelOf = (l: SchemaForslag['lessons'][number]) => color === 'larare' ? l.teacherIds.map(id => f.teachers.find(t => t.id === id)?.name ?? '').filter(Boolean).join(', ') || 'Ingen lärare'
    : color === 'sal' ? f.rooms.find(r => r.id === l.roomId)?.name ?? 'Ingen sal' : color === 'avvikelse' ? violations.includes(l.id) ? 'Regelavvikelse' : 'Ingen regelavvikelse' : color === 'last' ? locked.includes(l.id) ? 'Låst' : 'Olåst' : '';
  const passClass = (l: SchemaForslag['lessons'][number]) => {
    if (color === 'avvikelse') return violations.includes(l.id) ? 'falt-brott' : 'samling-farg-neutral';
    if (color === 'last') return locked.includes(l.id) ? 'samling-last' : 'samling-farg-neutral';
    const key = color === 'larare' ? l.teacherIds.join('|') : color === 'sal' ? l.roomId ?? '' : l.title;
    let hash = 0; for (let i = 0; i < key.length; i++) hash += key.charCodeAt(i);
    return `samling-farg-${hash % 4}`;
  };
  return <section className="folj samling" aria-labelledby={heading}>
    <div className="folj-huvud"><div><p className="folj-overrad">Flera scheman samtidigt</p><h2 id={heading}>Samlingsvy</h2><p className="schema-note">Välj resurser som ska visas tillsammans. Markera minst två rader för att se gemensam ledig tid. Beläggning räknas alltid på hela förslaget.</p></div><OppnaFonster onOpen={onOpen} label="Samlingsvy"/></div>
    {error && <div className="valplan-alert" role="alert"><p>{error}</p><Button type="button" variant="outline" onClick={() => setRetry(n => n + 1)}>Läs om resurserna</Button></div>}
    <div className="folj-chips"><span className="schema-note">Visas:</span>{selectedResources.map(r => <Button key={r.key} type="button" variant="outline" className="schema-chip" aria-label={`Ta bort ${r.name} från samlingsvyn`} onClick={() => { setSelected(xs => xs.filter(k => k !== r.key)); setChecked(xs => xs.filter(k => k !== r.key)); }}>{r.name}<XIcon aria-hidden="true"/></Button>)}<SamlingSok resources={resources} selected={selected} onAdd={add}/></div>
    <div className="samling-arbetsvy schema-filter"><label htmlFor={`${label}-vy`}>Arbetsvy<select id={`${label}-vy`} value={viewId} onChange={e => chooseView(e.target.value)}><option value="">Eget urval</option>{views.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}</select></label>
      <label htmlFor={`${label}-namn`}>Namn på arbetsvyn<Input id={`${label}-namn`} value={viewName} maxLength={80} onChange={e => setViewName(e.target.value)}/></label>
      <Button type="button" variant="outline" onClick={save}><SaveIcon aria-hidden="true"/>Spara som arbetsvy</Button>
      {viewId && <><Button type="button" variant="outline" onClick={() => { if (!viewName.trim()) { setNote('Ge arbetsvyn ett namn.'); return; } if (saveViews(views.map(v => v.id === viewId ? { ...v, name: viewName.trim().slice(0, 80) } : v))) setNote('Arbetsvyn har bytt namn.'); }}>Byt namn</Button>
        <Button type="button" variant="outline" onClick={() => { const saved = saveViews(views.filter(v => v.id !== viewId)); setViewId(''); setViewName(''); if (saved) setNote('Arbetsvyn är borttagen.'); }}>Ta bort arbetsvyn</Button></>}
      <p className="schema-note">Urval, lager och filter sparas för skolenheten i den här webbläsaren. Elevval sparas inte.</p>
    </div>
    <output className="schema-note" aria-live="polite">{note}</output>
    <div className="schema-filter samling-filter"><label>Dag i samlingsvyn<select value={day ?? ''} onChange={e => setDay(e.target.value === '' ? null : Number(e.target.value))}><option value="">Hela veckan</option>{f.days.map((_, d) => <option key={d} value={d}>{dayName(d)}</option>)}</select></label>
      <label>Ämne<select value={filter.subject} onChange={e => setFilter(x => ({ ...x, subject: e.target.value }))}><option value="">Alla ämnen</option>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
      {years.length > 0 && <label>Årskurs<select value={filter.year} onChange={e => setFilter(x => ({ ...x, year: e.target.value }))}><option value="">Alla årskurser</option>{years.map(s => <option key={s}>{s}</option>)}</select></label>}
      <label>Termin<select value={filter.term} onChange={e => setFilter(x => ({ ...x, term: e.target.value as '' | SchemaTerm }))}><option value="">Visad termin</option><option value="ht">Höstterminen</option><option value="vt">Vårterminen</option></select></label>
      <label>Färgsätt efter<select value={color} onChange={e => setColor(e.target.value as SamlingFarg)}>{FARG.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="schema-check"><input type="checkbox" checked={compact} onChange={e => setCompact(e.target.checked)}/>Kompakta rader</label>
      <Button type="button" variant="outline" aria-pressed={matrix} onClick={() => setMatrix(!matrix)}>Resursmatris</Button>
      <Button type="button" variant="outline" onClick={() => setFilter(tomtSamlingFilter())}>Rensa filter</Button>
    </div>
    <p className="schema-note">Program och lärarlag visas som filter när underlaget innehåller dessa uppgifter. De finns inte i detta underlag. Färgen kompletteras alltid med text i passet.</p>
    <div className="schema-lagerval"><span className="schema-note">Visa lager:</span><ToggleGroup multiple aria-label="Lager i samlingsvyn" variant="outline" className="flex-wrap" value={[...SCHEMA_LAGER.filter(l => lagerPa(layers, l.id)).map(l => l.id), ...EXTRA.filter(l => extra[l.id]).map(l => l.id)]}
      onValueChange={next => { for (const l of SCHEMA_LAGER) if (next.includes(l.id) !== lagerPa(layers, l.id)) onLayer(l.id, next.includes(l.id)); setExtra(Object.fromEntries(EXTRA.map(l => [l.id, next.includes(l.id)]))); }}>
      {[...SCHEMA_LAGER, ...EXTRA].map(l => <ToggleGroupItem key={l.id} value={l.id} className="schema-chip">{(EXTRA.some(x => x.id === l.id) ? extra[l.id] : lagerPa(layers, l.id as SchemaLagerTyp)) && <CheckIcon aria-hidden="true"/>}{l.namn}</ToggleGroupItem>)}
    </ToggleGroup></div>
    <div className="folj-knappar"><Button type="button" variant="outline" aria-pressed={common} disabled={checkedResources.length < 2} onClick={() => setCommon(!common)}>Visa gemensam ledig tid</Button><span className="schema-note">{checkedResources.length} rader markerade. {checkedResources.length < 2 ? 'Markera minst två.' : ''}</span></div>
    <div className="samling-ram"><div className="folj-rutnat" style={style}>
      <div className="folj-rad folj-dagar"><div/>{days.map(d => <div key={d}>{dayName(d)}<small>{clock(from)}–{clock(to)}</small></div>)}</div>
      {common && checkedResources.length >= 2 && <div className="folj-rad samling-gemensam"><div className="folj-namn"><b>Gemensam ledig tid</b><small>{checkedResources.map(r => r.name).join(', ')}</small></div>{days.map(d => <div key={d} className="folj-dag">{commonSlots.filter(s => s.day === d).map((s, i) => <span key={i} className="folj-lage falt-fri" style={{ '--at': s.startMin - from, '--length': s.endMin - s.startMin } as CSSProperties} title={`Alla lediga ${clock(s.startMin)}–${clock(s.endMin)}`}><span className="sr-only">Alla lediga {dayName(d)} {clock(s.startMin)}–{clock(s.endMin)}</span></span>)}</div>)}</div>}
      {lunch && <div className="folj-rad samling-lunchtryck"><div className="folj-namn"><b>Lunchtryck</b><small>Första fria lunch per elevkluster</small></div>{days.map(d => <div key={d} className="folj-dag">{lunch.slots.filter(s => s.day === d).map((s, i) => <span key={i} className="folj-lage falt-lunch" style={{ '--at': s.startMin - from, '--length': 5 } as CSSProperties} title={`${clock(s.startMin)}: ${s.pupils} elever${s.antagna ? ` (${s.antagna} antagna)` : ''}`}><span className="sr-only">{clock(s.startMin)}: {s.pupils} elever{ s.antagna ? `, ${s.antagna} antagna` : ''}</span></span>)}</div>)}</div>}
      {selectedResources.map(r => {
        const allLessons = samlingPass(r, f.lessons, effectiveTerm), lessons = allLessons.filter(l => allowedIds.has(l.id));
        const layer = r.slag === 'klass' || r.slag === 'grupp' || r.slag === 'larare' ? schemaLager(villkor, f, { slag: r.slag === 'larare' ? 'larare' : 'klass', ref: r.id }, { lessons: allLessons, alla: f.lessons, layers }) : null;
        const holes = extra.haltid ? samlingHal(r, f, villkor, effectiveTerm).map(s => ({ ...s, kind: 'onskemal' as const, label: 'Håltid' })) : [];
        return <SamlingRad key={r.key} rad={{ key: r.key, slag: r.slag, name: r.name, detail: SAMLING_NAMN[r.slag], chip: r.name, lessons }} days={f.days} start={from} classes={f.classes} visibleDays={days} compact={compact} shortTitles={compact || day === null} followed={picked ?? ''} onPick={onPick} passClass={passClass} passLabel={labelOf}
          overlays={[...layer?.overlays ?? [], ...(r.slag === 'sal' || r.slag === 'grupp' && !f.classes.some(c => c.id === r.id) ? samlingTidsvillkor(r, villkor).filter(o => lagerPa(layers, o.kind === 'sparrad' ? 'sparrad' : 'tillaten')) : []), ...holes]} bands={layer?.bands} onTime={(d, m) => setWhen({ day: d, startMin: m, endMin: Math.min(m + 60, villkor.days[d].endMin) })}
          head={<><label className="schema-check"><input type="checkbox" aria-label={`Markera raden ${r.name}`} checked={checked.includes(r.key)} onChange={e => setChecked(xs => e.target.checked ? [...xs, r.key] : xs.filter(k => k !== r.key))}/><b>{r.name}</b></label><small>{SAMLING_NAMN[r.slag]}{r.size !== null ? ` · ${r.antagen ? 'antagna ' : ''}${r.size} elever` : ''}{r.year ? ` · ${r.year}` : ''}</small></>}/>;
      })}
      {!selectedResources.length && <div className="empty-state">Inga resurser valda. Lägg till en klass, grupp, lärare eller sal för att se schemat.</div>}
    </div></div>
    {lunch && <p className="schema-note">Lunchtrycket är en beräkning ur förslaget, ingen bokad lunch. Varje elev räknas en gång per tid. {lunch.utanLunch ? `${lunch.utanLunch} elevdagar saknar en sammanhängande lunch i fönstret.` : ''}</p>}
    {extra.lunchtryck && !data && <p className="schema-note">Lunchtryck kan visas när elevantalen har lästs.</p>}
    <details className="samling-ledigsok" open={when !== null}><summary>Sök ledig lärare eller sal</summary>
      <div className="schema-filter"><label>Dag<select value={when?.day ?? 0} onChange={e => { const d = Number(e.target.value); setWhen(x => ({ day: d, startMin: x?.startMin ?? 840, endMin: x?.endMin ?? 900 })); }}>{f.days.map((_, d) => <option key={d} value={d}>{dayName(d)}</option>)}</select></label>
        <label htmlFor={`${label}-from`}>Från<Input id={`${label}-from`} type="time" step={300} value={clock(when?.startMin ?? 840)} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); if (Number.isInteger(h) && Number.isInteger(m)) setWhen(x => ({ day: x?.day ?? 0, startMin: h * 60 + m, endMin: x?.endMin ?? 900 })); }}/></label>
        <label htmlFor={`${label}-to`}>Till<Input id={`${label}-to`} type="time" step={300} value={clock(when?.endMin ?? 900)} onChange={e => { const [h, m] = e.target.value.split(':').map(Number); if (Number.isInteger(h) && Number.isInteger(m)) setWhen(x => ({ day: x?.day ?? 0, startMin: x?.startMin ?? 840, endMin: h * 60 + m })); }}/></label>
        <label>Ämne för lärarurval<select value={subject} onChange={e => setSubject(e.target.value)}><option value="">Alla ämnen</option>{subjects.map(s => <option key={s}>{s}</option>)}</select></label>
        <Button type="button" variant="outline" onClick={() => setWhen(x => x ?? { day: 0, startMin: 840, endMin: 900 })}>Sök lediga resurser</Button>
      </div>
      <p className="schema-note">Lärare som undervisar i ämnet i tjänstefördelningen visas först. Detta är ingen kontroll av lärarlegitimation eller undervisningsbehörighet. Salstyp och kapacitet finns ännu inte i underlaget.</p>
      {when && when.endMin <= when.startMin ? <p role="alert">Sluttiden ska vara efter starttiden.</p> : when && <ul className="samling-lediga">{available.map(r => <li key={r.key}><Button type="button" variant="outline" onClick={() => add(r.key)}>{r.name} · {SAMLING_NAMN[r.slag]}{r.undervisar ? ' · Undervisar i ämnet' : ''}</Button></li>)}{!available.length && <li>Inga lediga lärare eller salar under den tiden.</li>}</ul>}
    </details>
    {matrix && <SamlingMatris resources={resources} forslag={f} villkor={villkor} term={effectiveTerm} kind={kind} day={day} selected={selected} onKind={setKind} onDay={setDay} onAdd={add}/>}
  </section>;
}
