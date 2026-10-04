'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Copy, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { api, ApiError } from '@/lib/server-client.ts';
import { parseProgramplanOfferingList, type ProgramplanEducationSummary, type ProgramplanOfferingRow } from '@/lib/programplan-workspace-contract.ts';
import { LifecycleBadge } from './protected-programplan-lifecycle';
import { parseProgramplanSelection, type ProgramplanSelection } from '@/lib/programplan-education-contract.ts';

type Props = {
  disabled: boolean; onSecurityFailure: (error: unknown) => boolean;
  onOpen: (id: string) => void; onCopy: (id: string) => void; onNew: () => void;
  onLoaded: (canCreateEducation: boolean) => void;
};
type Names = Record<string, { name: string; orientations: Record<string, string> }>;

const status = (o: ProgramplanEducationSummary) => o.draftId ? { text: o.latestVersion ? `Utkast · Version ${o.latestVersion}` : 'Utkast', tone: 'draft' }
  : o.latestVersion ? { text: `Version ${o.latestVersion}`, tone: 'saved' } : { text: 'Ingen programplan', tone: 'none' };

/** Startsidan: alla utbildningar med programplaner, med öppna, kopiera och skapa ny. */
export default function ProgramplanList({ disabled, onSecurityFailure, onOpen, onCopy, onNew, onLoaded }: Props) {
  const [offerings, setOfferings] = useState<ProgramplanOfferingRow[] | null>(null);
  const [selection, setSelection] = useState<ProgramplanSelection | null>(null);
  const [error, setError] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const [query, setQuery] = useState(''), [unit, setUnit] = useState('');
  const mounted = useRef(true), generation = useRef(0);
  const load = useCallback(async () => {
    const token = ++generation.current, controller = new AbortController();
    setBusy(true); setError(null);
    try {
      const first = parseProgramplanOfferingList(await api.post('/api/programplaner/lista', { page: 1 }, controller.signal), 1), all = [...first.offerings];
      for (let page = 2; page <= Math.ceil(first.count / 50); page++) {
        const extra = parseProgramplanOfferingList(await api.post('/api/programplaner/lista', { page }, controller.signal), page);
        if (extra.count !== first.count) throw new Error('Utbildningslistan ändrades. Läs om listan.');
        all.push(...extra.offerings);
      }
      const empty = { unitId: null, catalogId: null, programRef: null };
      let chosen = parseProgramplanSelection(await api.post('/api/programplaner/val', empty, controller.signal), empty);
      // Programnamnen är desamma för alla skolor i underlaget; första skolan räcker för att läsa dem.
      if (chosen.units.length >= 1) { const next = { ...empty, unitId: chosen.units[0].id }; chosen = parseProgramplanSelection(await api.post('/api/programplaner/val', next, controller.signal), next); }
      if (chosen.selection.unitId && !chosen.selection.catalogId && chosen.catalogs.length === 1) {
        const next = { ...chosen.selection, catalogId: chosen.catalogs[0].catalogId }; chosen = parseProgramplanSelection(await api.post('/api/programplaner/val', next, controller.signal), next);
      }
      if (!mounted.current || token !== generation.current) return;
      setOfferings(all.sort((a, b) => a.name.localeCompare(b.name, 'sv'))); setSelection(chosen); onLoaded(chosen.canCreateEducation);
    } catch (e) {
      if (mounted.current && token === generation.current && !onSecurityFailure(e)) setError(e instanceof ApiError || e instanceof Error ? e.message : 'Utbildningarna kunde inte hämtas.');
    } finally { if (mounted.current && token === generation.current) setBusy(false); }
  }, [onLoaded, onSecurityFailure]);
  useEffect(() => { mounted.current = true; const counter = generation; queueMicrotask(() => { if (mounted.current) void load(); }); return () => { mounted.current = false; counter.current++; }; }, [load]);

  const names: Names = Object.fromEntries((selection?.programs ?? []).map(p => [p.programRef.code, { name: p.name, orientations: Object.fromEntries(p.orientations.map(o => [o.code, o.name])) }]));
  const units = [...new Map((offerings ?? []).map(o => [o.unitId, o.schoolName])).entries()];
  const q = query.trim().toLocaleLowerCase('sv');
  const shown = (offerings ?? []).filter(o => (!unit || o.unitId === unit) && (!q || `${o.name} ${o.localCode ?? ''} ${o.cohort} ${o.schoolName} ${names[o.programCode]?.name ?? o.programCode}`.toLocaleLowerCase('sv').includes(q)));
  const programLabel = (o: ProgramplanEducationSummary) => {
    const program = names[o.programCode];
    const orientation = o.orientationCode ? program?.orientations[o.orientationCode] ?? o.orientationCode : null;
    return [program?.name ?? o.programCode, orientation].filter(Boolean).join(' · ');
  };
  const locked = disabled || busy;
  return <section className="ppl" aria-label="Alla programplaner" aria-busy={busy}>
    <div className="pps-head">
      <div className="pps-head-text"><h1 className="ppl-title">Programplaner</h1><p>Öppna en utbildnings programplan för att ändra den, kopiera den till en ny elevkull eller börja från början.</p></div>
      <div className="pps-actions"><Button disabled={locked} onClick={onNew}><Plus size={16} aria-hidden="true"/>Ny programplan</Button></div>
    </div>
    {error && <div className="pp-alert" role="alert"><p>{error}</p><Button variant="outline" disabled={locked} onClick={() => void load()}>Läs om listan</Button></div>}
    {!offerings && !error && <output>Hämtar utbildningar…</output>}
    {offerings && <div className="pps-card ppl-card">
      <div className="ppl-tools">
        <label className="pps-search"><Search size={15} aria-hidden="true"/><span className="pp-sr">Sök utbildning</span><input type="search" value={query} placeholder="Sök utbildning, program eller elevkull" onChange={e => setQuery(e.target.value)}/></label>
        {units.length > 1 && <div className="pp-field ppl-unit"><label htmlFor="ppl-unit" className="pp-sr">Skola</label><select id="ppl-unit" value={unit} onChange={e => setUnit(e.target.value)}><option value="">Alla skolor</option>{units.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></div>}
        <small>{shown.length === offerings.length ? `${offerings.length} utbildningar` : `${shown.length} av ${offerings.length} utbildningar`}</small>
      </div>
      {offerings.length === 0 ? <div className="ppl-empty"><p><strong>Inga utbildningar ännu.</strong> Skapa den första programplanen med Ny programplan.</p></div>
        : shown.length === 0 ? <div className="ppl-empty"><p>Ingen utbildning matchar sökningen.</p></div>
        : <table className="ppl-table"><thead><tr><th scope="col">Utbildning</th><th scope="col">Program och inriktning</th><th scope="col">Elevkull</th><th scope="col">Programplan</th><th scope="col">Status</th><th scope="col"><span className="pp-sr">Åtgärder</span></th></tr></thead>
          <tbody>{shown.map(o => { const s = status(o); return <tr key={o.id}>
            <th scope="row"><button type="button" className="ppl-name" disabled={locked} aria-label={`Öppna utbildning ${o.name}, ${o.cohort}, ${o.schoolName}`} onClick={() => onOpen(o.id)}>{o.name}</button><small>{[o.localCode, units.length > 1 ? o.schoolName : null].filter(Boolean).join(' · ')}</small></th>
            <td>{programLabel(o)}</td><td>{o.cohort}</td>
            <td><span className={`ppl-status ppl-${s.tone}`}>{s.text}</span></td>
            <td><LifecycleBadge lifecycle={o.lifecycle}/></td>
            <td className="ppl-actions"><Button variant="outline" disabled={locked} onClick={() => onOpen(o.id)}>Öppna</Button>
              {selection?.canCreateEducation && o.latestVersion > 0 && <Button variant="outline" disabled={locked} aria-label={`Kopiera ${o.name}`} onClick={() => onCopy(o.id)}><Copy size={15} aria-hidden="true"/>Kopiera</Button>}</td>
          </tr>; })}</tbody></table>}
    </div>}
  </section>;
}
