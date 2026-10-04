'use client';

import { useState } from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { categoryDescription, categoryLabel, categoryOrder, partLabel, type Analysis, type IssueCategory, type PlanIssue, type PlanPart } from '@/lib/programplan-analysis.ts';

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

/** Klar för beslut räknas fram: allt fördelat, inga fel och startdatum. Visar vad som saknas. */
export function ReadinessCard({ analysis, onOpen }: { analysis: Analysis; onOpen: () => void }) {
  if (analysis.ready) return <section className="pps-card pps-ready-card" aria-label="Klar för beslut"><CheckCircle2 size={20} aria-hidden="true"/>
    <div><h3>Klar för beslut</h3><p>Alla nivåer är fördelade och analysen har inga fel. Huvudmannen fastställer planen; fastställande finns ännu inte i appen.</p></div></section>;
  return <section className="pps-card pps-missing-card" aria-label="Innan planen är klar">
    <h3>Innan planen är klar</h3>
    <ul>{analysis.missing.map(m => <li key={m}>{m}</li>)}</ul>
    <button type="button" className="pps-link" onClick={onOpen}>Visa analys →</button>
  </section>;
}
