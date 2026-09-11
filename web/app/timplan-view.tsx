'use client';
import { useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  CircleCheck,
  ExternalLink,
  History,
  Info,
  MessageSquareText,
  Plus,
  Send,
  Undo2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  currentPlan,
  openPlan,
  canEdit,
  cellEditable,
  columnTotals,
  planTotal,
  stageHours,
  rowTotal,
  timplanIssues,
  diffPlans,
  setCell,
  submit,
  withdraw,
  requestChanges,
  approve,
  addComment,
  startRevision,
  staffingSummary,
  weeklyMinutes,
  schoolYearWeeks,
  completeStages,
  stages,
  statusLabel,
  roleLabel,
  nationalStageTotal,
  skolansValMax,
  type Education,
  type Row,
  type Timplan,
  type TimplanState,
} from '@/lib/timplan-model.ts';

const num = (n: number) => n.toLocaleString('sv-SE');
type Action = 'submit' | 'approve' | 'return';
const actionCopy: Record<
  Action,
  { title: string; description: string; button: string; placeholder: string }
> = {
  submit: {
    title: 'Skicka förslag till huvudmannen',
    description:
      'Förslaget låses för redigering tills huvudmannen fastställer det eller återsänder det med skäl.',
    button: 'Skicka förslag',
    placeholder: 'Beskriv fördelningen och vad huvudmannen särskilt bör se.',
  },
  approve: {
    title: 'Fastställ timplanen',
    description:
      'Beslutet dokumenteras med datum och ersätter den tidigare fastställda versionen. Ändringar därefter kräver en ny version.',
    button: 'Fastställ',
    placeholder: 'Dokumentera beslutet, till exempel styrelse eller nämnd, datum och diarienummer.',
  },
  return: {
    title: 'Återsänd för ändring',
    description:
      'Rektorn kan därefter ändra förslaget och skicka det på nytt. Skälet blir en del av historiken.',
    button: 'Återsänd',
    placeholder: 'Ange vad som behöver ändras och varför.',
  },
};

const statusShort: Record<Timplan['status'], string> = {
  utkast: 'Utkast',
  förslag: 'Förslag',
  återsänd: 'Återsänd',
  fastställd: 'Fastställd',
  ersatt: 'Ersatt',
};
export function StatusPill({ status, short }: { status: Timplan['status']; short?: boolean }) {
  return (
    <span className={`tp-status tp-status-${status}`}>
      {short ? statusShort[status] : statusLabel[status]}
    </span>
  );
}

export function needsAttention(state: TimplanState, educationId: string) {
  const open = openPlan(state, educationId);
  if (!open) return false;
  return state.role === 'rektor'
    ? open.status === 'utkast' || open.status === 'återsänd'
    : open.status === 'förslag';
}

/** Utbildningar som saknar grund för en timplan, till exempel ofastställd poängplan. */
export type Blocked = { id: string; name: string; reason: string };

export default function TimplanView({
  state,
  apply,
  blocked,
  error,
  clearError,
  renderClasses,
}: {
  state: TimplanState;
  apply: (fn: (s: TimplanState) => TimplanState, message?: string) => boolean;
  blocked: Blocked[];
  error: string;
  clearError: () => void;
  renderClasses?: (plan:Timplan,education:Education)=>ReactNode;
}) {
  const [educationId, setEducationId] = useState(state.educations[0]?.id ?? '');
  const [planId, setPlanId] = useState<string | null>(null);
  const [action, setAction] = useState<Action | null>(null);
  const [comment, setComment] = useState('');
  const [note, setNote] = useState('');

  const education = state.educations.find((e) => e.id === educationId) ?? state.educations[0];
  const versions = education
    ? state.plans.filter((p) => p.educationId === education.id).sort((a, b) => b.version - a.version)
    : [];
  const plan = education
    ? (versions.find((p) => p.id === planId) ??
      openPlan(state, education.id) ??
      currentPlan(state, education.id) ??
      versions[0])
    : undefined;
  const issues = education && plan ? timplanIssues(education, plan) : [];
  const errors = issues.filter((i) => i.level === 'error');
  const warnings = issues.filter((i) => i.level === 'warning');
  const editable = plan ? canEdit(state, plan) : false;
  const baseline =
    education && plan && plan.status !== 'fastställd' && plan.status !== 'ersatt'
      ? currentPlan(state, education.id)
      : undefined;
  const changes = education && plan && baseline ? diffPlans(education, baseline, plan) : [];
  const totals = education && plan ? columnTotals(education, plan) : [];
  const flagged = (() => {
    const cells = new Map<string, 'error' | 'warning'>();
    const rows = new Map<string, 'error' | 'warning'>();
    for (const issue of issues) {
      if (issue.rowId && issue.columnIds)
        for (const c of issue.columnIds) {
          const key = `${issue.rowId}:${c}`;
          if (cells.get(key) !== 'error') cells.set(key, issue.level);
        }
      else if (issue.rowId && rows.get(issue.rowId) !== 'error')
        rows.set(issue.rowId, issue.level);
    }
    return { cells, rows };
  })();

  function choose(id: string) {
    setEducationId(id);
    setPlanId(null);
    clearError();
  }
  function runAction() {
    if (!plan || !education || !action) return;
    const done =
      action === 'submit'
        ? apply((s) => submit(s, plan.id, comment), 'Förslaget är skickat till huvudmannen.')
        : action === 'approve'
          ? apply((s) => approve(s, plan.id, comment), `Timplanen för ${education.name} är fastställd.`)
          : apply((s) => requestChanges(s, plan.id, comment), 'Förslaget är återsänt till rektorn.');
    if (done) {
      setAction(null);
      setComment('');
    }
  }

  if (!education)
    return (
      <div className="tp-canvas">
        <div className="admin-empty">
          <BookOpen size={28} />
          <h2>Ingen utbildning har en grund för timplan</h2>
          <p>Fastställ en poängplan eller lägg till grundskola eller introduktionsprogram först.</p>
        </div>
      </div>
    );

  const stageColumns = education.kind === 'grundskola';
  const active = completeStages(education.columns);
  const visibleStages = stages.filter((s) => education.columns.some((c) => c.stage === s.id));
  const yearIndex = (columnId: string) => education.columns.findIndex((c) => c.id === columnId);

  function rowLabel(row: Row) {
    return (
      <th scope="row" className={`tp-row-head tp-kind-${row.kind}`}>
        <span className="tp-row-name">{row.name}</span>
        <span className="tp-row-meta">
          {row.code && <code>{row.code}</code>}
          {row.fixed && <em>får inte minskas</em>}
          {row.kind === 'skolansval' && <em>högst {num(skolansValMax)} timmar</em>}
        </span>
      </th>
    );
  }

  function cell(row: Row, i: number) {
    if (!plan || !education) return null;
    const column = education.columns[i];
    const value = plan.cells[row.id]?.[i] ?? 0;
    const allowed = cellEditable(education, row, column);
    const flag = flagged.cells.get(`${row.id}:${column.id}`);
    const className = `tp-cell ${flag ? `tp-${flag}` : ''} ${allowed ? '' : 'tp-cell-off'}`;
    if (!allowed) return <td key={column.id} className={className} aria-label="Ingår i blocket" />;
    if (editable)
      return (
        <td key={column.id} className={className}>
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={2000}
            aria-label={`${row.name}, ${column.label}`}
            value={value}
            onChange={(e) => {
              const next = e.target.value === '' ? 0 : Number(e.target.value);
              apply((s) => setCell(s, plan.id, row.id, i, next));
            }}
          />
        </td>
      );
    return (
      <td key={column.id} className={className}>
        {value ? num(value) : <span className="tp-zero">–</span>}
      </td>
    );
  }

  function stageCell(row: Row, stageId: (typeof stages)[number]['id']) {
    if (!plan || !education) return null;
    const isGroupRow = row.kind === 'group';
    const members = education.rows.filter((r) => r.group === row.id);
    const local =
      isGroupRow && stageId !== 'låg'
        ? members.reduce((n, m) => n + stageHours(education, plan, m.id, stageId), 0)
        : stageHours(education, plan, row.id, stageId);
    const national = row.kind === 'member' ? row.minimum?.[stageId] : row.national?.[stageId];
    if (row.kind === 'member' && stageId === 'låg')
      return <td key={stageId} className="tp-stage tp-cell-off" aria-label="Ingår i blocket" />;
    const complete = active.some((s) => s.id === stageId);
    const tone =
      national === undefined || !complete
        ? ''
        : row.kind === 'member'
          ? local < national ? 'tp-error' : ''
          : local < national
            ? row.fixed || local < Math.ceil(national * 0.8) ? 'tp-error' : 'tp-reduced'
            : local > national ? 'tp-extra' : '';
    return (
      <td key={stageId} className={`tp-stage ${tone}`}>
        <strong>{num(local)}</strong>
        {national !== undefined && complete && (
          <small>{row.kind === 'member' ? `minst ${num(national)}` : `av ${num(national)}`}</small>
        )}
      </td>
    );
  }

  const blockRows = (block: string) => education.rows.filter((r) => r.block === block);
  const staffing = plan ? staffingSummary(education, plan) : [];

  return (
    <div className="tp-layout">
      <aside className="tp-directory">
        <div className="directory-heading">
          <h2>Utbildningar</h2>
          <span>{state.educations.length}</span>
        </div>
        {state.educations.map((e) => {
          const open = openPlan(state, e.id);
          const current = currentPlan(state, e.id);
          return (
            <button
              key={e.id}
              className={'tp-directory-item ' + (e.id === education.id ? 'active' : '')}
              onClick={() => choose(e.id)}
            >
              <span>
                <strong>{e.name}</strong>
                <small>{e.cohort}</small>
              </span>
              <span className="tp-directory-status">
                {open ? (
                  <StatusPill status={open.status} short />
                ) : current ? (
                  <StatusPill status="fastställd" short />
                ) : (
                  <span className="tp-status tp-status-none">Saknas</span>
                )}
                {needsAttention(state, e.id) && (
                  <span className="person-alert" aria-label="Väntar på din roll" />
                )}
              </span>
            </button>
          );
        })}
        {blocked.map((b) => (
          <div key={b.id} className="tp-directory-item tp-directory-blocked">
            <span>
              <strong>{b.name}</strong>
              <small>{b.reason}</small>
            </span>
          </div>
        ))}
        <div className="tp-directory-note">
          <BookOpen size={15} />
          <p>
            Ramarna kommer ur Skolförordningen, Skollagen, Gymnasieförordningen
            och Skolverkets katalog hämtad {plan?.catalog ?? '–'}. Lokala beslut
            skrivs aldrig tillbaka till källorna.
          </p>
        </div>
      </aside>
      <section className="tp-canvas">
        <div className="tp-cover">
          <div>
            <span className="admin-kicker">
              {education.kind === 'grundskola'
                ? 'TIMPLAN · GRUNDSKOLA'
                : education.kind === 'gymnasium'
                  ? `POÄNG- OCH TIMPLAN · ${education.programCode}`
                  : 'UTBILDNINGSPLAN · INTRODUKTIONSPROGRAM'}
            </span>
            <h2>{education.name}</h2>
            <p>{education.detail}</p>
          </div>
          {plan && (
            <div className="tp-cover-side">
              <StatusPill status={plan.status} />
              <span>Version {plan.version}</span>
              {renderClasses && <a className="text-link" href="#timplan-klasser">Klasser och läsår</a>}
              <span>Grund: {plan.basis}</span>
              {plan.decidedOn && <span>Fastställd {plan.decidedOn}</span>}
            </div>
          )}
        </div>
        <div className="tp-frame-line">
          <span>
            <Info size={14} /> {education.frame.label}
          </span>
          <span>
            Ram: {num(education.frame.total)} {education.unit}
          </span>
          <a href={education.frame.source} target="_blank" rel="noreferrer">
            Källa <ExternalLink size={13} />
          </a>
          {versions.length > 1 && (
            <fieldset className="tp-versions">
              <legend className="sr-only">Version</legend>
              {versions.map((v) => (
                <button
                  key={v.id}
                  aria-pressed={plan?.id === v.id}
                  onClick={() => {
                    setPlanId(v.id);
                    clearError();
                  }}
                >
                  v{v.version} · {statusLabel[v.status]}
                </button>
              ))}
            </fieldset>
          )}
        </div>
        {error && (
          <div className="validation-warning tp-inline-error">
            <p>
              <AlertTriangle size={16} />
              <span>{error}</span>
            </p>
          </div>
        )}
        {!plan ? (
          <div className="admin-empty">
            <BookOpen size={28} />
            <h2>Ingen timplan ännu</h2>
            <p>Rektorn påbörjar en första version utifrån den nationella ramen.</p>
            {state.role === 'rektor' && (
              <Button onClick={() => apply((s) => startRevision(s, education.id), 'Ett första utkast är påbörjat.')}>
                <Plus size={16} /> Påbörja timplan
              </Button>
            )}
          </div>
        ) : (
          <>
            <div className="tp-workflow">
              <div className="tp-workflow-text">
                {plan.status === 'utkast' && 'Utkastet är rektorns arbetsyta. Skicka det när kontrollerna är gröna.'}
                {plan.status === 'återsänd' && 'Huvudmannen har återsänt förslaget. Se skälet i historiken, ändra och skicka igen.'}
                {plan.status === 'förslag' && 'Förslaget väntar på huvudmannens beslut. Rektorn kan ta tillbaka det.'}
                {plan.status === 'fastställd' && 'Gällande version. Ändringar görs i en ny version som huvudmannen fastställer.'}
                {plan.status === 'ersatt' && 'Versionen är ersatt och visas bara som historik.'}
              </div>
              <div className="tp-workflow-actions">
                {state.role === 'rektor' && (plan.status === 'utkast' || plan.status === 'återsänd') && (
                  <Button onClick={() => { setAction('submit'); setComment(''); }} disabled={errors.length > 0}>
                    <Send size={15} /> Skicka förslag
                  </Button>
                )}
                {state.role === 'rektor' && plan.status === 'förslag' && (
                  <Button variant="outline" onClick={() => apply((s) => withdraw(s, plan.id), 'Förslaget är taget tillbaka.')}>
                    <Undo2 size={15} /> Ta tillbaka
                  </Button>
                )}
                {state.role === 'huvudman' && plan.status === 'förslag' && (
                  <>
                    <Button variant="outline" onClick={() => { setAction('return'); setComment(''); }}>
                      <Undo2 size={15} /> Återsänd
                    </Button>
                    <Button onClick={() => { setAction('approve'); setComment(''); }} disabled={errors.length > 0}>
                      <CircleCheck size={15} /> Fastställ
                    </Button>
                  </>
                )}
                {state.role === 'rektor' && !openPlan(state, education.id) && (
                  <Button variant="outline" onClick={() => apply((s) => startRevision(s, education.id), 'En ny version är påbörjad utifrån den gällande.')}>
                    <Plus size={15} /> Ny version
                  </Button>
                )}
              </div>
            </div>
            <div className="tp-grid-scroll">
              <table className={`tp-grid tp-grid-${education.kind}`}>
                <thead>
                  {stageColumns && (
                    <tr className="tp-stage-row">
                      <th>
                        <span className="sr-only">Ämne</span>
                      </th>
                      {visibleStages.map((s) => (
                        <th key={s.id} colSpan={s.years.filter((y) => yearIndex(`ak${y}`) >= 0).length + 1}>
                          {s.name}
                        </th>
                      ))}
                      <th>
                        <span className="sr-only">Totalt</span>
                      </th>
                    </tr>
                  )}
                  <tr>
                    <th scope="col">{education.kind === 'gymnasium' ? 'Ämne och nivå' : education.kind === 'grundskola' ? 'Ämne' : 'Innehåll'}</th>
                    {education.kind === 'gymnasium' && <th scope="col">Poäng</th>}
                    {stageColumns
                      ? visibleStages.map((s) => (
                          <>
                            {s.years.filter((y) => yearIndex(`ak${y}`) >= 0).map((y) => (
                              <th scope="col" key={`ak${y}`}>
                                Åk {y}
                              </th>
                            ))}
                            <th scope="col" key={`${s.id}-sum`} className="tp-stage-head">
                              Stadiet
                            </th>
                          </>
                        ))
                      : education.columns.map((c) => (
                          <th scope="col" key={c.id}>
                            {c.label}
                          </th>
                        ))}
                    <th scope="col" className="tp-total-head">
                      Totalt
                    </th>
                    {education.kind === 'gymnasium' && <th scope="col">Riktvärde</th>}
                  </tr>
                </thead>
                <tbody>
                  {education.kind === 'gymnasium'
                    ? (education.blocks ?? []).map((block) => (
                        <>
                          <tr key={block.id} className="tp-block-row">
                            <th scope="rowgroup" colSpan={education.columns.length + 4}>
                              {block.name}
                              <span>
                                {num(blockRows(block.id).reduce((n, r) => n + (r.points ?? 0), 0))} av {num(block.points)} poäng
                              </span>
                            </th>
                          </tr>
                          {blockRows(block.id).map((row) => (
                            <tr key={row.id} className={flagged.rows.get(row.id) ? `tp-row-${flagged.rows.get(row.id)}` : ''}>
                              {rowLabel(row)}
                              <td className="tp-points">{num(row.points ?? 0)}</td>
                              {education.columns.map((_, i) => cell(row, i))}
                              <td className="tp-total">{num(rowTotal(plan, row.id))}</td>
                              <td className="tp-reference">{num(Math.round(((row.points ?? 0) * education.frame.total) / 2500))}</td>
                            </tr>
                          ))}
                        </>
                      ))
                    : education.rows.map((row) => (
                        <tr key={row.id} className={`tp-kind-${row.kind} ${flagged.rows.get(row.id) ? `tp-row-${flagged.rows.get(row.id)}` : ''}`}>
                          {rowLabel(row)}
                          {stageColumns
                            ? visibleStages.map((s) => (
                                <>
                                  {s.years.filter((y) => yearIndex(`ak${y}`) >= 0).map((y) => cell(row, yearIndex(`ak${y}`)))}
                                  {row.kind === 'skolansval' ? (
                                    <td key={`${s.id}-sum`} className="tp-stage">
                                      <strong>{num(stageHours(education, plan, row.id, s.id))}</strong>
                                    </td>
                                  ) : (
                                    stageCell(row, s.id)
                                  )}
                                </>
                              ))
                            : education.columns.map((_, i) => cell(row, i))}
                          <td className="tp-total">{num(rowTotal(plan, row.id))}</td>
                        </tr>
                      ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row">
                      Summa
                      <span className="tp-row-meta">
                        <em>{education.unit}</em>
                      </span>
                    </th>
                    {education.kind === 'gymnasium' && (
                      <td className="tp-points">{num(education.rows.reduce((n, r) => n + (r.points ?? 0), 0))}</td>
                    )}
                    {stageColumns
                      ? visibleStages.map((s) => {
                          const sum = education.rows.reduce((n, r) => n + stageHours(education, plan, r.id, s.id), 0);
                          const complete = active.some((a) => a.id === s.id);
                          return (
                            <>
                              {s.years.filter((y) => yearIndex(`ak${y}`) >= 0).map((y) => (
                                <td key={`ak${y}`}>{num(totals[yearIndex(`ak${y}`)])}</td>
                              ))}
                              <td key={`${s.id}-sum`} className={`tp-stage ${complete && sum < nationalStageTotal[s.id] ? 'tp-error' : ''}`}>
                                <strong>{num(sum)}</strong>
                                {complete && <small>av {num(nationalStageTotal[s.id])}</small>}
                              </td>
                            </>
                          );
                        })
                      : totals.map((t, i) => <td key={education.columns[i].id}>{num(t)}</td>)}
                    <td className={`tp-total ${planTotal(education, plan) < education.frame.total ? 'tp-error' : ''}`}>
                      <strong>{num(planTotal(education, plan))}</strong>
                      <small>av {num(education.frame.total)}</small>
                    </td>
                    {education.kind === 'gymnasium' && <td className="tp-reference">{num(education.frame.total)}</td>}
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="tp-below">
              <section className="tp-checks">
                <div className="section-heading">
                  <h3>Kontroll mot ramen</h3>
                  <span className={errors.length ? 'a-status amber' : 'a-status'}>
                    <span />
                    {errors.length
                      ? `${errors.length} avvikelse${errors.length > 1 ? 'r' : ''}`
                      : 'Inom ramen'}
                    {warnings.length ? ` · ${warnings.length} att se över` : ''}
                  </span>
                </div>
                {issues.length === 0 && (
                  <div className="validation-success">
                    <CircleCheck size={17} />
                    {education.kind === 'grundskola'
                      ? 'Fördelningen uppfyller timplanen i varje stadium och totalt.'
                      : education.kind === 'gymnasium'
                        ? 'Poängplanen stämmer och undervisningstiden når den garanterade nivån med marginal.'
                        : 'Utbildningsplanen motsvarar heltidsstudier.'}
                  </div>
                )}
                {errors.length > 0 && (
                  <div className="validation-warning">
                    {errors.map((i) => (
                      <p key={i.text}>
                        <AlertTriangle size={16} />
                        <span>{i.text}</span>
                      </p>
                    ))}
                  </div>
                )}
                {warnings.length > 0 && (
                  <ul className="tp-warnings">
                    {warnings.map((i) => (
                      <li key={i.text}>
                        <Info size={14} /> {i.text}
                      </li>
                    ))}
                  </ul>
                )}
                {baseline && (
                  <div className="tp-diff">
                    <h4>
                      Ändringar mot gällande version {baseline.version}
                      <span>{changes.length ? `${changes.length} celler` : 'inga'}</span>
                    </h4>
                    {changes.slice(0, 24).map((c) => (
                      <div key={`${c.rowId}:${c.columnId}`}>
                        <strong>{c.name}</strong>
                        <span>{c.label}</span>
                        <span>{num(c.from)}</span>
                        <ArrowRight size={13} />
                        <span>{num(c.to)}</span>
                      </div>
                    ))}
                    {changes.length > 24 && <p>… och {changes.length - 24} till.</p>}
                  </div>
                )}
              </section>
              <section className="tp-history">
                <div className="section-heading">
                  <h3>
                    <History size={16} /> Samtal och beslut
                  </h3>
                </div>
                {plan.status !== 'ersatt' && (
                  <div className="tp-comment-box">
                    <Textarea
                      aria-label="Ny kommentar"
                      placeholder={`Kommentera som ${roleLabel[state.role].toLocaleLowerCase('sv')}…`}
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                    />
                    <Button
                      variant="outline"
                      onClick={() => {
                        if (apply((s) => addComment(s, plan.id, note))) setNote('');
                      }}
                    >
                      <MessageSquareText size={15} /> Kommentera
                    </Button>
                  </div>
                )}
                <div className="admin-history tp-entries">
                  {plan.history.map((h) => (
                    <div key={h.id}>
                      <span>
                        {roleLabel[h.role]} · {h.time}
                      </span>
                      <strong>{h.action}</strong>
                      <p>{h.comment}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
            {education.kind !== 'introduktionsprogram' && staffing.length > 0 && (
              <section className="tp-staffing">
                <div className="section-heading">
                  <h3>Underlag för schema och tjänstefördelning</h3>
                  <span className="cell-secondary">
                    Riktvärde minuter per vecka vid {schoolYearWeeks} läsårsveckor
                  </span>
                </div>
                <div className="tp-grid-scroll">
                  <table className="tp-grid tp-grid-staffing">
                    <thead>
                      <tr>
                        <th scope="col">Ämne</th>
                        {education.columns.map((c) => (
                          <th scope="col" key={c.id}>
                            {c.label}
                          </th>
                        ))}
                        <th scope="col" className="tp-total-head">
                          Timmar
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {staffing.map((row) => (
                        <tr key={row.subject}>
                          <th scope="row" className="tp-row-head">
                            <span className="tp-row-name">{row.subject}</span>
                          </th>
                          {row.perColumn.map((h, i) => (
                            <td key={education.columns[i].id}>
                              {h ? (
                                <>
                                  {num(h)}
                                  <small className="tp-minutes">{num(weeklyMinutes(h))} min/v</small>
                                </>
                              ) : (
                                <span className="tp-zero">–</span>
                              )}
                            </td>
                          ))}
                          <td className="tp-total">{num(row.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="tp-staffing-note">
                  Timmarna per ämne är utgångspunkten för tjänstefördelningen; behörighet per
                  lärare (Skollagen 2 kap. 13 §) ligger utanför timplanen. Kontrollen av
                  garanterad undervisningstid mot genomförd undervisning kräver schema och
                  närvaro, som inte finns i exemplet.
                </p>
              </section>
            )}
            {renderClasses?.(plan,education)}
            <div className="plan-boundary">
              <BookOpen size={17} />
              <p>
                Kontrollerna prövar fördelningen mot timplanens timmar, skolans val,
                garanterad minsta tid i ämnesgrupper och garanterad undervisningstid.
                Anpassad studiegång, prioriterad timplan och avvikelser för enskilda
                elever hanteras inte här. Ett fastställt beslut i exemplet är ingen
                handling i verklig mening.
              </p>
            </div>
          </>
        )}
      </section>
      <Dialog
        open={action !== null}
        onOpenChange={(open) => {
          if (!open) setAction(null);
        }}
      >
        <DialogContent className="admin-dialog" showCloseButton={false}>
          {action && plan && (
            <>
              <div className="dialog-eyebrow">
                <span>{education.name.toLocaleUpperCase('sv')}</span>
                <span>VERSION {plan.version}</span>
              </div>
              <DialogTitle>{actionCopy[action].title}</DialogTitle>
              <DialogDescription>{actionCopy[action].description}</DialogDescription>
              {action !== 'return' && (
                <div className="review-summary">
                  <span>Kontroll mot ramen</span>
                  <strong>
                    {errors.length ? `${errors.length} avvikelser` : 'Inom ramen'}
                  </strong>
                  <p>
                    {num(planTotal(education, plan))} {education.unit} av {num(education.frame.total)}.
                    {changes.length ? ` ${changes.length} celler skiljer sig från gällande version.` : ''}
                  </p>
                </div>
              )}
              <label className="field-label" htmlFor="tp-action-comment">
                {action === 'approve' ? 'Beslut' : action === 'return' ? 'Skäl' : 'Meddelande till huvudmannen'}
              </label>
              <Textarea
                id="tp-action-comment"
                rows={4}
                placeholder={actionCopy[action].placeholder}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              {error && (
                <div className="validation-warning">
                  <p>
                    <AlertTriangle size={16} />
                    <span>{error}</span>
                  </p>
                </div>
              )}
              <div className="dialog-actions">
                <Button variant="ghost" onClick={() => setAction(null)}>
                  Avbryt
                </Button>
                <Button onClick={runAction}>{actionCopy[action].button}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
