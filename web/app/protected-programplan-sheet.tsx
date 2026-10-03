'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronRight, Plus, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { CatalogProgram, ProgramplanLevelRef } from '@/lib/programplan-catalog.ts';
import { programplanLevelName, sameProgramplanLevels, type ProgramplanOption } from '@/lib/protected-programplan.ts';
import { DIPLOMA_WORK_POINTS, INDIVIDUAL_CHOICE_POINTS, frameStatus } from '@/lib/programplan-table.ts';
import { categoryDescription, categoryLabel, categoryOrder, partLabel, type Analysis, type IssueCategory, type PlanIssue, type PlanPart } from '@/lib/programplan-analysis.ts';

const fmt = (n: number) => n.toLocaleString('sv-SE');
const partColor: Record<PlanPart, string> = { foundation: '#2d4cc1', programmeSpecific: '#6f8cf0', orientation: '#a9bcff', specialization: '#0e8f83', other: '#c8d1df', meta: '#8a96a8' };
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Felrad överst: tydlig, men blockerar inte sparande. */
export function AnalysisBanner({ analysis, onOpen, disabled = false }: { analysis: Analysis; onOpen: () => void; disabled?: boolean }) {
  const { fel, risk } = analysis.counts;
  if (fel) return <output className="pps-banner pps-banner-fel"><AlertCircle aria-hidden="true"/>
    <p><strong>{plural(fel, 'fel', 'fel')} mot regelverket{risk ? ` och ${plural(risk, 'risk', 'risker')}` : ''}.</strong> Du kan spara utkastet, men planen kan inte fastställas förrän felen är åtgärdade.</p>
    <button type="button" disabled={disabled} onClick={onOpen}>Visa analys →</button></output>;
  return <output className="pps-banner pps-banner-ok"><CheckCircle2 aria-hidden="true"/>
    <p><strong>Inga fel mot regelverket.</strong> {risk ? `${plural(risk, 'risk', 'risker')} att se över innan fastställande.` : 'Inga risker hittades.'}</p>
    <button type="button" disabled={disabled} onClick={onOpen}>Visa analys →</button></output>;
}

/** Poängstapel för hela utbildningen, uppdelad per del av programmet. */
export function PointsBar({ analysis, chosen }: { analysis: Analysis; chosen: number }) {
  const { frame } = analysis;
  const room = frame.specializationRoom;
  const within = room === null ? chosen : Math.min(chosen, room), over = room === null ? 0 : Math.max(chosen - room, 0);
  const parts: { key: string; label: string; points: number; color: string }[] = [
    ...frame.sections.map(s => ({ key: s.id, label: s.id === 'orientation' ? 'Inriktning' : partLabel[s.id], points: s.points, color: partColor[s.id] })),
    { key: 'specialization', label: 'Programfördjupning', points: within, color: partColor.specialization },
    { key: 'over', label: 'Över ramen', points: over, color: 'repeating-linear-gradient(45deg,#b83737 0 4px,#d65c5c 4px 8px)' },
    { key: 'other', label: 'Individuellt val + gymnasiearbete', points: INDIVIDUAL_CHOICE_POINTS + DIPLOMA_WORK_POINTS, color: partColor.other },
  ];
  const total = parts.reduce((a, p) => a + p.points, 0), scale = Math.max(frame.total ?? total, total);
  return <section className="pps-card pps-points" aria-label="Poäng">
    <div className="pps-points-head"><h2>Poäng</h2><p><strong>{fmt(total)}</strong> <span>{frame.total ? `av ${fmt(frame.total)} poäng` : 'poäng · programmets totalsumma kan inte kontrolleras'}</span></p></div>
    <div className="pps-bar" aria-hidden="true">{parts.filter(p => p.points > 0).map(p => <div key={p.key} style={{ width: `calc(${(p.points / scale * 100).toFixed(2)}% - 2px)`, background: p.color }}/>)}</div>
    <ul className="pps-legend">{parts.filter(p => p.key !== 'over' || p.points > 0).map(p => <li key={p.key}><span style={{ background: p.color }}/>{p.label}<strong>{fmt(p.key === 'specialization' ? chosen : p.points)}</strong></li>)}</ul>
  </section>;
}

type SheetProps = {
  program: CatalogProgram; analysis: Analysis; refs: ProgramplanLevelRef[]; options: ProgramplanOption[];
  /** Saknas när planen bara läses. */
  onChange?: (refs: ProgramplanLevelRef[]) => void; disabled?: boolean; idPrefix?: string;
};

/** Planen är tabellen: fasta delar som hopfällbara grupper och skolans programfördjupning som rader. */
export function ProgramplanSheet({ program, analysis, refs, options, onChange, disabled = false, idPrefix = 'pps' }: SheetProps) {
  const { frame } = analysis;
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [query, setQuery] = useState('');
  const editable = !!onChange;
  const status = frameStatus(frame, refs);
  const flagged = (part: PlanPart) => analysis.issues.filter(i => i.part === part && (i.category === 'fel' || i.category === 'risk'));
  const groupStatus = (part: PlanPart) => { const list = flagged(part); const fel = list.filter(i => i.category === 'fel').length;
    return list.length ? { text: fel ? plural(fel, 'fel', 'fel') : plural(list.length, 'risk', 'risker'), tone: fel ? 'fel' : 'risk' } : { text: 'Komplett', tone: 'ok' }; };
  const available = options.filter(o => !refs.some(r => sameProgramplanLevels([r], [o])));
  const q = query.trim().toLocaleLowerCase('sv');
  const matches = q ? available.filter(o => `${o.subjectName} ${o.name} ${o.itemCode}`.toLocaleLowerCase('sv').includes(q)).slice(0, 12) : available.slice(0, 3);
  const room = frame.specializationRoom;
  const pfStatus = frame.unresolved === 'orientation' ? { text: 'Välj inriktning', tone: 'fel' } : room === null ? { text: 'Ram kan inte kontrolleras', tone: 'info' }
    : status.over ? { text: `${fmt(status.chosen - room)} p över ramen`, tone: 'fel' } : status.remaining === 0 ? { text: 'Inom ramen', tone: 'ok' } : { text: `${fmt(status.remaining!)} p kvar`, tone: 'risk' };
  const add = (option: ProgramplanOption) => { if (refs.length < 200) onChange?.([...refs, { subjectCode: option.subjectCode, subjectVersion: option.subjectVersion, itemCode: option.itemCode, points: option.points }]); };
  return <section className="pps-card pps-table" aria-label="Ingår enligt underlaget">
    {program.orientations.length === 0 && <p className="pps-empty pps-top">Programmet har ingen inriktning.</p>}
    <div className="pps-row pps-thead" aria-hidden="true"><span>Ämne och nivå</span><span className="pps-code">Kod</span><span className="pps-num">Poäng</span><span/></div>
    {frame.sections.map(section => { const s = groupStatus(section.id), isOpen = !!open[section.id];
      return <div className="pps-group" key={section.id}>
        <button type="button" className="pps-row pps-group-head" aria-expanded={isOpen} aria-controls={`${idPrefix}-${section.id}`} onClick={() => setOpen(o => ({ ...o, [section.id]: !o[section.id] }))}>
          <span className="pps-title"><i style={{ background: partColor[section.id] }}/>{section.title}<small>{plural(section.rows.length, 'nivå', 'nivåer')}</small></span>
          <span className={`pps-status pps-${s.tone}`}>{s.text}</span><span className="pps-num pps-strong">{fmt(section.points)}</span>
          <span className="pps-chevron" data-open={isOpen}><ChevronRight size={16} aria-hidden="true"/></span>
        </button>
        <div id={`${idPrefix}-${section.id}`} hidden={!isOpen}>
          {section.rows.map(row => <div className="pps-row pps-level" key={row.key}>
            <span>{row.subjectName}{row.levelName && ` · ${row.levelName}`}{row.note && <small className={row.code ? 'pps-note' : 'pps-note pps-note-risk'}>{row.note === 'Alternativ — en av dem läses' ? 'Alternativ i underlaget — inget ämnesval är gjort här.' : 'Nivåuppgifter saknas i underlaget.'}</small>}</span>
            <span className="pps-code">{row.code ?? '—'}</span><span className="pps-num">{row.points}</span><span/>
          </div>)}
        </div>
      </div>; })}
    <fieldset className={status.over ? 'pps-group pps-pf pps-pf-over' : 'pps-group pps-pf'} aria-label="Programfördjupning">
      <div className="pps-row pps-group-head pps-static">
        <span className="pps-title"><i style={{ background: partColor.specialization }}/>Programfördjupning<small>skolans val</small></span>
        <span className={`pps-status pps-${pfStatus.tone}`}>{pfStatus.text}</span>
        <span className={`pps-num pps-strong pps-${pfStatus.tone}`}>{room === null ? fmt(status.chosen) : `${fmt(status.chosen)} / ${fmt(room)}`}</span><span/>
      </div>
      {refs.length === 0 && <p className="pps-empty">{editable ? 'Inga nivåer valda. Sök eller välj ett förslag nedan. Du kan också spara ett tomt utkast.' : 'Inga fördjupningsnivåer sparade.'}</p>}
      {refs.map((ref, index) => <div className="pps-row pps-level" key={`${index}-${ref.itemCode}`}>
        <span>{programplanLevelName(ref, options)}</span><span className="pps-code">{ref.itemCode}</span><span className="pps-num">{ref.points}</span>
        {editable ? <button type="button" className="pps-remove" disabled={disabled} aria-label={`Ta bort ${ref.itemCode}`} onClick={() => onChange?.(refs.filter((_, i) => i !== index))}><X size={16} aria-hidden="true"/></button> : <span/>}
      </div>)}
      {editable && frame.unresolved !== 'orientation' && <div className="pps-add">
        <label className="pps-search"><Search size={15} aria-hidden="true"/><span className="pp-sr">Lägg till ämne eller nivå</span>
          <input id={`${idPrefix}-search`} type="search" value={query} disabled={disabled} placeholder="Lägg till ämne eller nivå" onChange={e => setQuery(e.target.value)}/></label>
        <fieldset className="pps-suggestions" aria-label={q ? 'Sökträffar' : 'Förslag'}>
          {matches.map(option => <button type="button" key={option.itemCode} data-level-code={option.itemCode} disabled={disabled || refs.length >= 200}
            aria-label={`Lägg till ${option.subjectName} · ${option.name} · ${option.points} poäng`} onClick={() => add(option)}><Plus size={14} aria-hidden="true"/>{option.subjectName} · {option.name} · {option.points}</button>)}
          {q && matches.length === 0 && <p>Ingen tillgänglig nivå matchar sökningen. Bara ämnen Skolverket anger som programfördjupning för programmet kan väljas.</p>}
        </fieldset>
      </div>}
    </fieldset>
    <div className="pps-row pps-other"><span className="pps-title"><i style={{ background: partColor.other }}/>Individuellt val och gymnasiearbete<small>fast enligt programstrukturen</small></span><span/><span className="pps-num">{INDIVIDUAL_CHOICE_POINTS + DIPLOMA_WORK_POINTS}</span><span/></div>
  </section>;
}

/** Analysvy: kort per kategori, filter och en tabell med regel och åtgärd. */
export function AnalysisView({ analysis, onBack, onFix }: { analysis: Analysis; onBack: () => void; onFix: () => void }) {
  const [filter, setFilter] = useState<IssueCategory | 'alla'>('alla');
  const shown = filter === 'alla' ? analysis.issues : analysis.issues.filter(i => i.category === filter);
  return <section className="pps-analysis" aria-label="Analys av programplanen">
    <div className="pps-cards">{categoryOrder.map(c => <button type="button" key={c} className={`pps-summary pps-cat-${c}`} aria-pressed={filter === c} onClick={() => setFilter(filter === c ? 'alla' : c)}>
      <span className="pps-cat-label"><i/>{categoryLabel[c]}</span><strong>{analysis.counts[c]}</strong><span>{categoryDescription[c]}</span></button>)}</div>
    <div className="pps-card pps-issues">
      <fieldset className="pps-chips" aria-label="Filtrera">{(['alla', ...categoryOrder] as const).map(c => <button type="button" key={c} aria-pressed={filter === c} className={`pps-chip pps-cat-${c}`} onClick={() => setFilter(c)}>
        {c === 'alla' ? 'Alla' : c === 'fel' ? 'Fel' : c === 'risk' ? 'Risker' : categoryLabel[c]}<span>{c === 'alla' ? analysis.issues.length : analysis.counts[c]}</span></button>)}<small>Sorterat efter allvar</small></fieldset>
      <table className="pps-issue-table"><thead><tr><th scope="col">Kategori</th><th scope="col">Vad vi hittade</th><th scope="col">Del av planen</th><th scope="col">Regel</th><th scope="col">Åtgärd</th></tr></thead>
        <tbody>{shown.map(issue => <IssueRow key={issue.id} issue={issue} onFix={onFix}/>)}</tbody></table>
      {shown.length === 0 && <p className="pps-empty">Inget att visa i den här kategorin.</p>}
    </div>
    <p className="pps-footnote">Fel mot regelverket hindrar inte att utkastet sparas, men planen kan inte fastställas förrän de är åtgärdade. Risker och kontrollpunkter är vägledning. Lagrum och regler ska verifieras innan planen används som beslutsunderlag.</p>
    <Button variant="outline" onClick={onBack}>Tillbaka till planen</Button>
  </section>;
}
function IssueRow({ issue, onFix }: { issue: PlanIssue; onFix: () => void }) {
  return <tr className={`pps-cat-${issue.category}`}>
    <td><span className="pps-pill"><i/>{categoryLabel[issue.category]}</span></td>
    <td><strong>{issue.title}</strong><span>{issue.detail}</span></td>
    <td><span className="pps-part"><i style={{ background: partColor[issue.part] }}/>{partLabel[issue.part]}</span></td>
    <td className="pps-rule">{issue.rule}</td>
    <td>{issue.action && <button type="button" className="pps-link" onClick={onFix}>{issue.action} →</button>}</td>
  </tr>;
}

/** Bekräftelse före sparning: fel och risker visas, men sparandet blockeras inte. */
export function SaveDialog({ analysis, busy, onCancel, onConfirm, onAnalysis, children }: { analysis: Analysis; busy: boolean; onCancel: () => void; onConfirm: () => void; onAnalysis: () => void; children?: React.ReactNode }) {
  const blocking = analysis.issues.filter(i => i.category === 'fel' || i.category === 'risk'), fel = analysis.counts.fel;
  return <section className="pps-dialog" aria-label="Kontrollera före sparning" tabIndex={-1}>
    <div className="pps-dialog-head"><span className={fel ? 'pps-dialog-icon pps-fel' : 'pps-dialog-icon pps-risk'}><AlertTriangle size={20} aria-hidden="true"/></span>
      <div><h3>{fel ? `Spara utkast med ${plural(fel, 'fel', 'fel')}?` : 'Spara utkast?'}</h3>
        <p>{fel ? 'Utkastet sparas och markeras med fel. Planen kan inte fastställas förrän felen nedan är åtgärdade.' : blocking.length ? 'Inga fel mot regelverket. Risker nedan bör ses över innan fastställande.' : 'Inga fel eller risker hittades. Planen förblir ett utkast.'}</p></div></div>
    {blocking.length > 0 && <ul className="pps-blocking">{blocking.map(i => <li key={i.id} className={`pps-cat-${i.category}`}><i/><span><strong>{i.title}</strong><small>{categoryLabel[i.category]} · {partLabel[i.part]}</small></span></li>)}</ul>}
    {children}
    <div className="pps-dialog-actions"><Button variant="outline" disabled={busy} onClick={onCancel}>Tillbaka till uppgifterna</Button><Button variant="outline" disabled={busy} onClick={onAnalysis}>Visa analys</Button>
      <Button disabled={busy} onClick={onConfirm}>{busy ? 'Sparar…' : fel ? 'Spara ändå' : 'Spara utkast'}</Button></div>
  </section>;
}
