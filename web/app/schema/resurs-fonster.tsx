'use client';
// En utlyft resursvy hämtar sin egen lista. Elevvalet finns bara i detta fönsters minne.
import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { SCHEMA_CONTRACT_VERSION, type SchemaForslag, type SchemaPlacement, type SchemaTerm, type SchemaVillkor } from '@/lib/schema-contract.ts';
import { parseSamlingData, samlingForslag, samlingPass, samlingTidsvillkor, SAMLING_NAMN, type SchemaSamlingData } from '@/lib/schema-samling.ts';
import { lagerPa, schemaLager, type SchemaLagerTyp } from '@/lib/schema-lager.ts';
import { SamlingRad } from './samling-rad';
import { Lagerval } from './lager';
import { clock, dayName } from './delat';
import './samling.css';

type Props = {
  forslag: SchemaForslag; villkor: SchemaVillkor; placements: SchemaPlacement[]; layers: Record<string, boolean>; term: SchemaTerm;
  picked: string | null; onPick: (id: string) => void; onLayer: (layer: SchemaLagerTyp, on: boolean) => void; onSessionLost: () => void;
  slag: 'larare' | 'sal' | 'elev'; initialResource?: string; onTerm?: (term: SchemaTerm) => void;
};
const TITLE = { larare: 'Lärarens schema', sal: 'Salens schema', elev: 'Elevens schema' };
export function ResursFonster(props: Props) { return <ResursInnehall key={`${props.slag}:${props.forslag.grundFingerprint}`} {...props}/>; }
function ResursInnehall({ forslag, villkor, placements, layers, term, picked, onPick, onLayer, onSessionLost, slag, initialResource, onTerm }: Props) {
  const heading = useId(), choice = useId(), [selected, setSelected] = useState(initialResource ?? ''), [data, setData] = useState<SchemaSamlingData | null>(null), [error, setError] = useState(''), [retry, setRetry] = useState(0);
  const ref = useRef({ forslag, villkor, placements, onSessionLost }); useEffect(() => { ref.current = { forslag, villkor, placements, onSessionLost }; });
  const fingerprint = forslag.grundFingerprint;
  useEffect(() => {
    const controller = new AbortController(), s = ref.current;
    api.post<unknown>('/api/schema/samling', { contractVersion: SCHEMA_CONTRACT_VERSION, unitId: s.forslag.unitId, schoolYear: s.forslag.schoolYear, period: s.forslag.period, villkor: s.villkor,
      grundFingerprint: s.forslag.grundFingerprint, placements: s.placements }, controller.signal).then(raw => { setData(parseSamlingData(raw, s.forslag)); setError(''); })
      .catch((caught: unknown) => { if (controller.signal.aborted) return; setData(null);
        if (caught instanceof ApiError && caught.status === 401) { ref.current.onSessionLost(); return; }
        setError(caught instanceof ApiError && caught.status === 403 ? 'Ditt uppdrag tillåter inte att läsa den här resursvyn.' : 'Resurslistan kunde inte läsas. Försök igen.'); });
    return () => controller.abort();
  }, [fingerprint, retry]);
  const resources = data?.resources.filter(r => r.slag === slag) ?? [], resource = selected ? resources.find(r => r.key === selected) : slag === 'elev' ? undefined : resources[0];
  const f = samlingForslag(forslag, placements), lessons = resource ? samlingPass(resource, f.lessons, term) : [];
  const start = Math.min(...f.days.map(d => d.startMin)), end = Math.max(...f.days.map(d => d.endMin));
  const layer = resource && slag === 'larare' ? schemaLager(villkor, f, { slag: 'larare', ref: resource.id }, { lessons, alla: f.lessons, layers }) : null;
  return <section className="folj samling" aria-labelledby={heading}>
    <div className="folj-huvud"><div><p className="folj-overrad">Utlyft vy</p><h2 id={heading}>{TITLE[slag]}</h2><p className="schema-note">Passens tider och markeringen följer samma utkast i alla fönster. Resursvalet gäller detta fönster.</p></div></div>
    {onTerm && f.time.terms.length > 1 && <div className="schema-filter"><fieldset><legend className="schema-note">Visa veckan under</legend>{f.time.terms.map(t => <Button key={t.term} variant={term === t.term ? 'secondary' : 'outline'} aria-pressed={term === t.term} onClick={() => onTerm(t.term)}>{t.term === 'ht' ? 'Hösttermin' : 'Vårtermin'}</Button>)}</fieldset></div>}
    {error ? <div className="valplan-alert" role="alert"><p>{error}</p><Button variant="outline" onClick={() => setRetry(n => n + 1)}>Försök igen</Button></div>
      : !data ? <output>Läser resurser med ditt uppdrag…</output> : resources.length === 0 ? <p className="empty-state">{slag === 'elev' ? 'Inga elever är tillgängliga med ditt uppdrag och detta underlag.' : slag === 'sal' ? 'Inga salar finns i förslaget. Lägg till salar i villkoren i huvudfönstret.' : 'Inga lärare finns i förslaget.'}</p> : <>
        {selected && !resource && <p className="schema-note">Resursen i arbetsvyn finns inte i detta underlag. Välj en annan resurs.</p>}
        <div className="schema-filter"><label htmlFor={choice}>Välj {SAMLING_NAMN[slag].toLowerCase()}</label><select id={choice} value={resource?.key ?? ''} onChange={e => setSelected(e.target.value)}>{!resource && <option value="">Välj resurs</option>}{resources.map(r => <option key={r.key} value={r.key}>{r.name}</option>)}</select></div>
        <Lagerval layers={layers} onChange={onLayer}/>
        <div className="samling-ram"><div className="folj-rutnat" style={{ '--span': end - start, '--first-hour': Math.ceil(start / 60) * 60 - start, '--days': f.days.length } as CSSProperties}>
          <div className="folj-rad folj-dagar"><div/>{f.days.map((_, d) => <div key={d}>{dayName(d)}<small>{clock(start)}–{clock(end)}</small></div>)}</div>
          {resource && <SamlingRad rad={{ key: resource.key, slag: resource.slag, name: resource.name, detail: SAMLING_NAMN[slag], chip: resource.name, lessons }} days={f.days} start={start} classes={f.classes} followed={picked ?? ''} onPick={onPick} shortTitles
            overlays={layer?.overlays ?? samlingTidsvillkor(resource, villkor).filter(o => lagerPa(layers, o.kind === 'sparrad' ? 'sparrad' : 'tillaten'))} bands={layer?.bands}/>}
        </div></div>
      </>}
  </section>;
}
