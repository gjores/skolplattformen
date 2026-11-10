'use client';
// Delade presentationsdelar för Läsår & skoldagar (plan 05.1.1-03). Markup,
// klassnamn och texter är demovyns (UI-SPEC avsnitt 1) och flyttades hit
// oförändrade; demoregressionen (e2e/lasar-demo.spec.ts) blir röd vid minsta
// avvikelse. Texter som ändras i skyddad drift (A-08 och A-10) är props med
// demons texter som standard. Ingen del läser roll eller lokalt demotillstånd.
import { DatePicker } from '@/components/ui/date-picker';
import { Fragment, useState, type KeyboardEvent, type ReactNode } from 'react';
import { AlertTriangle, BookOpen, CircleCheck, ExternalLink, History, Info, MessageSquareText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import {
  causeLabel,
  definitions,
  formatDate,
  formatLong,
  gymnasiumWeeks,
  hoursPerSchoolDay,
  maxStudyDays,
  minHolidays,
  minSchoolDays,
  requiredWeeklyMinutes,
  schoolWeeks,
  statusLabel,
  weekdayNames,
  weekdayShort,
  type Cause,
  type DayInfo,
  type Entry,
  type GroupSummary,
  type Issue,
  type Planned,
  type SchoolYear,
  type StudentGroup,
  type Summary,
} from '@/lib/lasar-model.ts';
import { num, statusPlural, statusText, toolCopy } from './lasar-calendar.tsx';

export type LasarAction = 'submit' | 'approve' | 'return' | 'reopen' | 'request' | 'decline';
export const actionCopy: Record<LasarAction, { title: string; description: string; button: string; placeholder: string; label: string }> = {
  submit: { title: 'Skicka förslag till huvudmannen', description: 'Terminernas början och slut beslutas av huvudmannen. Förslaget låses tills huvudmannen fastställer det eller återsänder det med skäl.', button: 'Skicka förslag', placeholder: 'Beskriv lov, studiedagar och vad huvudmannen särskilt bör se.', label: 'Meddelande till huvudmannen' },
  approve: { title: 'Fastställ läsårstiderna', description: 'Beslutet dokumenteras med datum. Skoldagarna blir grund för timplanens riktvärden och schemat.', button: 'Fastställ', placeholder: 'Dokumentera beslutet, till exempel styrelse eller nämnd, datum och diarienummer.', label: 'Beslut' },
  return: { title: 'Återsänd för ändring', description: 'Rektorn kan därefter ändra förslaget och skicka det på nytt. Skälet blir en del av historiken.', button: 'Återsänd', placeholder: 'Ange vad som behöver ändras och varför.', label: 'Skäl' },
  reopen: { title: 'Öppna läsåret för ändring', description: 'Det fastställda beslutet ligger kvar i historiken. Rektorn kan ändra och skicka ett nytt förslag.', button: 'Öppna', placeholder: 'Ange skälet, till exempel ändrade lovdagar i kommunen.', label: 'Skäl' },
  // Skyddad drift (UI-SPEC avsnitt 9, D-10 och D-16); demon använder dem inte.
  request: { title: 'Begär ändring av läsårskalendern', description: 'Huvudmannen får begäran och kan öppna kalendern för en ny version. Den fastställda versionen gäller tills en ny är fastställd.', button: 'Skicka begäran', placeholder: 'Beskriv vad som behöver ändras och varför, till exempel en ny studiedag i mars.', label: 'Orsak' },
  decline: { title: 'Avslå begäran om ändring', description: 'Den fastställda versionen gäller fortsatt. Rektorn ser motiveringen i Samtal och beslut och kan skicka en ny begäran.', button: 'Avslå begäran', placeholder: 'Ange skälet till avslaget.', label: 'Motivering' },
};

/** Demons texter för kontrollkortet; skyddad drift skickar A-08:s texter. */
export const DEMO_CONTROL = { heading: 'Kontroll mot ramen', ok: 'Inom ramen' } as const;
export const DEMO_BOUNDARY = 'Kontrollerna prövar antalet skoldagar, lovdagar, studiedagar och veckor mot förordningarna samt att läsåret börjar i augusti och slutar i juni. Andra lärotider för enskilda elever (Skolförordningen 3 kap. 4 a–5 §§, Gymnasieförordningen 3 kap. 3 a §), arbetsplatsförlagt lärande och kommunens gemensamma lovdagar hanteras inte här. Ett fastställt beslut i exemplet är ingen handling i verklig mening.';

export function StatusPill({ status }: { status: SchoolYear['status'] }) {
  return <span className={`tp-status tp-status-${status}`}>{statusLabel[status]}</span>;
}

/** Omslaget `tp-cover`. Kickern är demons span eller den skyddade vyns h1 (A-02). */
export function LasarCover({ kicker, title, side }: { kicker: ReactNode; title: string; side?: ReactNode }) {
  return (
    <div className="tp-cover">
      <div>
        {kicker}
        <h2>{title}</h2>
        <p>Rektorn föreslår skoldagar, lov och studiedagar. Huvudmannen fastställer terminernas början och slut.</p>
      </div>
      {side}
    </div>
  );
}

/** `tp-cover-side`: status, beslutsdatum, egna rader (läsvy, sparstatus) och antal skoldagar. */
export function LasarCoverSide({ sy, summary, children }: { sy: SchoolYear; summary: Summary; children?: ReactNode }) {
  return (
    <div className="tp-cover-side">
      <StatusPill status={sy.status} />
      {sy.decidedOn && <span>Fastställt {sy.decidedOn}</span>}
      {children}
      <span>{num(summary.skoldagar)} skoldagar · {num(summary.weeks.total)} veckor</span>
    </div>
  );
}

/** Regelraden `tp-frame-line` med plats för `tp-versions`. */
export function LasarFrameLine({ gy, legend = 'Läsår', children }: { gy: boolean; legend?: string; children?: ReactNode }) {
  return (
    <div className="tp-frame-line">
      <span><Info size={14} /> Skolförordningen 3 kap. 2–4 §§{gy ? ' · Gymnasieförordningen 3 kap. 1–3 §§' : ''} · Lagen om allmänna helgdagar</span>
      <a href="https://lagen.nu/2011:185#K3" target="_blank" rel="noreferrer">Källa <ExternalLink size={13} /></a>
      <fieldset className="tp-versions">
        <legend className="sr-only">{legend}</legend>
        {children}
      </fieldset>
    </div>
  );
}

/** Felraden för fel från modell och server. */
export function LasarInlineError({ message }: { message: string }) {
  return (
    <div className="validation-warning tp-inline-error">
      <p><AlertTriangle size={16} /><span>{message}</span></p>
    </div>
  );
}

/** Arbetsflödesbandet `tp-workflow` med statustext och knappar. */
export function LasarWorkflow({ text, children }: { text: ReactNode; children?: ReactNode }) {
  return (
    <div className="tp-workflow">
      <div className="tp-workflow-text">
        {text}
      </div>
      <div className="tp-workflow-actions">
        {children}
      </div>
    </div>
  );
}

/** Terminerna `ly-terms`, med DatePicker när kalendern kan ändras. */
export function LasarTerms({ sy, summary, editable, onTermChange, isEdgeLocked, min }: {
  sy: SchoolYear;
  summary: Summary;
  editable: boolean;
  onTermChange?: (part: 'ht' | 'vt', edge: 'start' | 'end', value: string) => void;
  /** Skyddad drift (D-12): en passerad terminskant visas skrivskyddad. */
  isEdgeLocked?: (part: 'ht' | 'vt', edge: 'start' | 'end') => boolean;
  /** Tidigaste datum för en kant som går att ändra (editableFrom). */
  min?: string;
}) {
  return (
    <div className="ly-terms">
      {(['ht', 'vt'] as const).map((part) => (
        <fieldset key={part} className="ly-term">
          <legend>{part === 'ht' ? 'Hösttermin' : 'Vårtermin'}</legend>
          {(['start', 'end'] as const).map((edge) => (
            <div key={edge} className="ly-term-field">
              <label className="ly-field-label" htmlFor={`ly-${part}-${edge}`}>
                {edge === 'start' ? 'Börjar' : 'Slutar'}
              </label>
              {editable && !isEdgeLocked?.(part, edge) ? (
                <DatePicker id={`ly-${part}-${edge}`} value={sy[part][edge]} min={min} onValueChange={value => { if (value) onTermChange?.(part, edge, value); }} />
              ) : (
                <strong id={`ly-${part}-${edge}`}>{formatLong(sy[part][edge])}</strong>
              )}
            </div>
          ))}
          <span className="ly-term-facts">{num(summary.weeks[part])} veckor · {num(summary.terms[part].skoldagar)} skoldagar · {num(summary.terms[part].lovdagar)} lov · {num(summary.terms[part].studiedagar)} studiedagar · {num(summary.terms[part].helgdagar)} helgdagar</span>
        </fieldset>
      ))}
      <div className="ly-term ly-term-note">
        <span className="cell-secondary">Terminernas början och slut beslutas av huvudmannen. Läsåret börjar i augusti och slutar i juni. Vardagarna mellan terminerna är jullov.</span>
      </div>
    </div>
  );
}

/** Valet `ly-scope`: hela skolan eller en elevgrupp. */
export function LasarScope({ groups, groupId, group, gSummary, onGroupChange }: {
  groups: StudentGroup[];
  groupId: string;
  group?: StudentGroup;
  gSummary?: GroupSummary;
  onGroupChange: (id: string) => void;
}) {
  return (
    <div className="ly-scope">
      <label className="ly-field-label" htmlFor="ly-group">Visar</label>
      <select
        id="ly-group"
        className="og-select"
        value={groupId}
        onChange={(e) => onGroupChange(e.target.value)}
      >
        <option value="">Hela skolan · skoldagar, lov och studiedagar</option>
        {[...new Map(groups.map((g) => [g.educationId, g.educationName])).entries()].map(([id, name]) => (
          <optgroup key={id} label={name}>
            {groups
              .filter((g) => g.educationId === id)
              .map((g) => (
                <option key={g.id} value={g.id}>
                  {g.scope === 'klass' ? `Klass ${g.name}` : g.name}
                  {g.pupils ? ` · ${num(g.pupils)} elever` : ''}
                </option>
              ))}
          </optgroup>
        ))}
      </select>
      {group && gSummary && (
        <span className="ly-scope-facts">
          {num(gSummary.days)} undervisningsdagar
          {gSummary.fewer ? `, ${num(gSummary.fewer)} färre än skolan` : ', samma som skolan'}
          {group.parentId ? ` · ärver ${groups.find((g) => g.id === group.parentId)?.name ?? ''}` : ''}
        </span>
      )}
    </div>
  );
}

/** Verktygen för hela skolan (`ly-tools`, ”Markera som”). */
export function LasarSchoolTools({ tool, onTool, note, onNote, editable, readOnlyHint, selectMode }: {
  tool: Planned;
  onTool: (tool: Planned) => void;
  note: string;
  onNote: (note: string) => void;
  editable: boolean;
  readOnlyHint: string;
  /** Telefon (A-13): ”Markera flera” lägger till dagar i markeringen utan att ändra dem. Demon skickar ingen. */
  selectMode?: { on: boolean; onToggle: () => void };
}) {
  return (
    <fieldset className="ly-tools">
      <legend className="ly-tools-label">Markera som</legend>
      {(['skoldag', 'lovdag', 'studiedag'] as Planned[]).map((t) => (
        <button key={t} type="button" className={`ly-tool ly-tool-${t}`} aria-pressed={tool === t} disabled={!editable} onClick={() => onTool(t)}>
          <i aria-hidden="true" /> {toolCopy[t].label}
        </button>
      ))}
      {selectMode && (
        <button type="button" className="ly-tool ly-select-mode" aria-pressed={selectMode.on} onClick={selectMode.onToggle}>
          <i aria-hidden="true" /> Markera flera
        </button>
      )}
      <div className="ly-note-field">
        <label className="ly-field-label" htmlFor="ly-note">Anteckning</label>
        <Input id="ly-note" value={note} disabled={!editable || tool === 'skoldag'} placeholder={tool === 'studiedag' ? 'Vad personalen gör, t.ex. Fortbildning' : tool === 'lovdag' ? 't.ex. Höstlov' : ''} onChange={(e) => onNote(e.target.value)} />
      </div>
      <span className="ly-tools-hint">
        {editable
          ? `${toolCopy[tool].hint} Skift-klicka för att markera ett intervall, kommando- eller ctrl-klicka för att markera flera. Högerklicka på markeringen för att ändra den.`
          : readOnlyHint}
      </span>
    </fieldset>
  );
}

/** Verktygen för en vald grupp (`ly-tools` och `ly-shortweek`). */
export function LasarGroupTools({
  group, gSummary, editable, cause, onCause, note, onNote, canShortWeek,
  shortDay, onShortDay, shortReason, onShortReason, onSetShortWeek, onClearShortWeek,
}: {
  group: StudentGroup;
  gSummary?: GroupSummary;
  editable: boolean;
  cause: Cause;
  onCause: (cause: Cause) => void;
  note: string;
  onNote: (note: string) => void;
  canShortWeek: boolean;
  shortDay: number;
  onShortDay: (day: number) => void;
  shortReason: string;
  onShortReason: (reason: string) => void;
  onSetShortWeek: () => void;
  onClearShortWeek: () => void;
}) {
  return (
    <fieldset className="ly-tools">
      <legend className="ly-tools-label">{group.name} saknar undervisning</legend>
      <div className="ly-note-field">
        <label className="ly-field-label" htmlFor="ly-cause">Orsak</label>
        <select id="ly-cause" className="og-select" value={cause} disabled={!editable} onChange={(e) => onCause(e.target.value as Cause)}>
          {(Object.keys(causeLabel) as Cause[]).map((c) => (
            <option key={c} value={c}>{causeLabel[c]}</option>
          ))}
        </select>
      </div>
      <div className="ly-note-field">
        <label className="ly-field-label" htmlFor="ly-note">Anteckning</label>
        <Input id="ly-note" value={note} disabled={!editable} placeholder={cause === 'annat' ? 'Krävs när orsaken är annat' : 't.ex. Lärarna är provvakter'} onChange={(e) => onNote(e.target.value)} />
      </div>
      <span className="ly-tools-hint">
        {editable
          ? `Klicka på en skoldag så saknar ${group.name} undervisning den dagen. Skift- eller kommando-klicka för att markera flera och högerklicka för att ändra dem. Skolans lov och studiedagar gäller redan alla.`
          : 'Läsåret kan inte ändras nu. Klicka för att läsa en dag.'}
      </span>
      {canShortWeek && (
        <div className="ly-shortweek">
          <span className="ly-field-label">Fyra skoldagar i veckan</span>
          {gSummary?.shortWeek ? (
            <>
              <strong>Ledig {weekdayNames[gSummary.shortWeek.weekday]} · {gSummary.shortWeek.from}</strong>
              <span className="ly-marking-text">{gSummary.shortWeek.reason}</span>
              {editable && (
                <Button variant="outline" size="sm" onClick={onClearShortWeek}>
                  Ta bort
                </Button>
              )}
            </>
          ) : (
            editable && (
              <>
                <select className="og-select" aria-label="Ledig veckodag" value={shortDay} onChange={(e) => onShortDay(Number(e.target.value))}>
                  {[0, 1, 2, 3, 4].map((d) => (
                    <option key={d} value={d}>{weekdayNames[d]}</option>
                  ))}
                </select>
                <Input aria-label="Särskilda skäl" value={shortReason} placeholder="Särskilda skäl" onChange={(e) => onShortReason(e.target.value)} />
                <Button variant="outline" size="sm" onClick={onSetShortWeek}>
                  Lägg in
                </Button>
              </>
            )
          )}
          <span className="cell-secondary">Skolförordningen 3 kap. 4 § andra stycket tillåter fyra skoldagar i veckan för en grupp elever i årskurs 1 eller 2, om det finns särskilda skäl.</span>
        </div>
      )}
    </fieldset>
  );
}

/** Teckenförklaringen `ly-legend` och begreppen `ly-definitions`. */
export function LasarLegend({ summary, extra }: { summary: Summary; extra?: ReactNode }) {
  const [showDefinitions, setShowDefinitions] = useState(false);
  return (
    <>
      <div className="ly-legend">
        {(['skoldag', 'lovdag', 'studiedag', 'helgdag', 'helg'] as DayInfo['status'][]).map((s) => (
          <span key={s} className={`ly-legend-item ly-${s}`}>
            <i aria-hidden="true" />
            {statusText[s]}
            {s === 'skoldag' && <small>{num(summary.skoldagar)}</small>}
            {s === 'lovdag' && <small>{num(summary.lovdagar)}</small>}
            {s === 'studiedag' && <small>{num(summary.studiedagar)}</small>}
            {s === 'helgdag' && <small>{num(summary.helgdagar.length)}</small>}
          </span>
        ))}
        <span className="ly-legend-item"><i className="ly-note-dot ly-legend-dot" aria-hidden="true" /> Har anteckning</span>
        {extra}
        <button type="button" className="text-link" aria-expanded={showDefinitions} onClick={() => setShowDefinitions((v) => !v)}>
          <BookOpen size={14} /> {showDefinitions ? 'Dölj definitionerna' : 'Vad räknas som skoldag, lovdag och studiedag?'}
        </button>
      </div>
      {showDefinitions && (
        <dl className="ly-definitions">
          {definitions.map((d) => (
            <div key={d.id}>
              <dt>{d.term}</dt>
              <dd>
                {d.text}
                <small>{d.source}</small>
              </dd>
            </div>
          ))}
        </dl>
      )}
    </>
  );
}

/** Markeringen `ly-marking`: vad som är markerat, anteckning och åtgärder. */
export function LasarMarking({
  selection, selectedDays, changeable, groupChangeable, groupMarked, group, editable,
  onNote, onApplyToGroup, onFollowSchool, onApplyToSelection, onClear, isLocked, noteDraft,
}: {
  selection: string[];
  selectedDays: DayInfo[];
  changeable: DayInfo[];
  groupChangeable: DayInfo[];
  groupMarked: DayInfo[];
  group?: StudentGroup;
  editable: boolean;
  onNote: (note: string) => void;
  onApplyToGroup: () => void;
  onFollowSchool: () => void;
  onApplyToSelection: (kind: Planned) => void;
  onClear: () => void;
  /** Skyddad drift (D-12): passerade dagar förklaras som låsta. */
  isLocked?: (date: string) => boolean;
  /** Skyddad drift (A-11): anteckningen sparas vid blur eller Enter, inte vid varje tangenttryckning. */
  noteDraft?: { value: string; dirty: boolean; onChange: (text: string) => void; onCommit: () => void };
}) {
  const selectedInfo = selectedDays.length === 1 ? selectedDays[0] : undefined;
  const selectedLocked = selectedInfo ? Boolean(isLocked?.(selectedInfo.date)) && selectedInfo.status !== 'utanför' : false;
  return (
    <div className="ly-marking">
      <div className="ly-marking-what">
        <strong>
          {selectedInfo
            ? formatLong(selectedInfo.date)
            : `${num(selection.length)} dagar markerade`}
        </strong>
        <span>
          {selectedInfo ? (
            <>
              {selectedInfo.holiday ?? statusText[selectedInfo.status]}
              {selectedInfo.part === 'jullov' ? ' · mellan terminerna' : selectedInfo.part ? ` · ${selectedInfo.part === 'ht' ? 'höstterminen' : 'vårterminen'}` : ''}
              {selectedInfo.status === 'helgdag' && ' · allmän helgdag, kan inte vara skoldag'}
              {selectedInfo.status === 'helg' && ' · skolarbetet förläggs måndag–fredag'}
              {selectedLocked && ' · passerad dag, låst'}
            </>
          ) : (
            <>
              {(['skoldag', 'lovdag', 'studiedag', 'helgdag', 'helg'] as DayInfo['status'][])
                .map((k) => ({ k, n: selectedDays.filter((d) => d.status === k).length }))
                .filter((x) => x.n > 0)
                .map((x) => `${num(x.n)} ${x.n > 1 ? statusPlural[x.k] : statusText[x.k].toLocaleLowerCase('sv')}`)
                .join(' · ')}
              {changeable.length < selection.length ? ` · ${num(selection.length - changeable.length)} låsta` : ''}
              {group && groupMarked.length ? ` · ${num(groupMarked.length)} utan undervisning för ${group.name}` : ''}
            </>
          )}
        </span>
      </div>
      {editable && !group && changeable.some((d) => d.status !== 'skoldag') && (
        <div className="ly-marking-note">
          <label className="ly-field-label" htmlFor="ly-day-note">Anteckning</label>
          <Input
            id="ly-day-note"
            value={noteDraft ? noteDraft.value : selectedInfo ? selectedInfo.note ?? '' : ''}
            placeholder={selectedInfo ? (selectedInfo.status === 'studiedag' ? 'Vad personalen gör' : 'Lovets namn') : 'Samma anteckning på alla markerade lov- och studiedagar'}
            onChange={(e) => (noteDraft ? noteDraft.onChange(e.target.value) : onNote(e.target.value))}
            {...(noteDraft ? { onBlur: noteDraft.onCommit, onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => { if (e.key === 'Enter') { e.preventDefault(); noteDraft.onCommit(); } } } : {})}
          />
          {noteDraft?.dirty && <output className="ly-note-status">Osparad anteckning</output>}
        </div>
      )}
      {!editable && selectedInfo?.note && <span className="ly-marking-text">{selectedInfo.note}</span>}
      <div className="ly-marking-actions">
        {editable && group && groupChangeable.length > 0 && (
          <>
            <Button variant="outline" size="sm" onClick={onApplyToGroup}>
              Ingen undervisning för {group.name}
              {groupChangeable.length > 1 ? ` (${num(groupChangeable.length)})` : ''}
            </Button>
            {groupMarked.length > 0 && (
              <Button variant="outline" size="sm" onClick={onFollowSchool}>
                Följ skolans dag
                {groupMarked.length > 1 ? ` (${num(groupMarked.length)})` : ''}
              </Button>
            )}
          </>
        )}
        {editable &&
          !group &&
          changeable.length > 0 &&
          (['skoldag', 'lovdag', 'studiedag'] as Planned[])
            .filter((t) => !selectedInfo || t !== selectedInfo.status)
            .map((t) => (
              <Button key={t} variant="outline" size="sm" onClick={() => onApplyToSelection(t)}>
                Gör till{' '}
                {changeable.length > 1
                  ? `${statusPlural[t]} (${num(changeable.length)})`
                  : toolCopy[t].label.toLocaleLowerCase('sv')}
              </Button>
            ))}
        <button type="button" className="text-link ly-clear" onClick={onClear}>
          Avmarkera
        </button>
      </div>
    </div>
  );
}

export type TeachingRow = { id: string; education: string; column: string; hours: number; days: number; fewer: number };
export type ClassRow = { group: StudentGroup; own: GroupSummary; hours?: number };
export type ScheduleRow = { id: string; name: string; subject: string; teacher: string; slots: number; weekly: number; planned: { hours: number; occasions: number; perDay: number[] } };

/** Panelen `ly-teaching`: undervisning som läsåret rymmer. */
export function LasarTeaching({ summary, teachingRows, intro, classRows, scheduleRows, groupId, onShowClass }: {
  summary: Summary;
  teachingRows: TeachingRow[];
  /** Introduktionsprogrammets namn och veckotimmar, när det har en fastställd timplan. */
  intro?: { name: string; weekly: number };
  classRows: ClassRow[];
  scheduleRows: ScheduleRow[];
  groupId: string;
  onShowClass: (id: string) => void;
}) {
  return (
    <section className="ly-teaching">
      <div className="section-heading">
        <h3>Undervisning som läsåret rymmer</h3>
        <span className="cell-secondary">
          {num(summary.skoldagar)} skoldagar = {num(schoolWeeks(summary.skoldagar), 1)} skolveckor om fem dagar
        </span>
      </div>
      <div className="ly-teaching-grid">
        <div>
          <h4>Skoldagar per veckodag</h4>
          <ol className="ly-weekdays">
            {summary.perWeekday.map((n, i) => {
              const max = Math.max(...summary.perWeekday);
              const min = Math.min(...summary.perWeekday);
              return (
                <li key={weekdayNames[i]} className={n === min && max - min >= 4 ? 'ly-weekday-low' : ''}>
                  <span>{weekdayNames[i]}</span>
                  <i aria-hidden="true" style={{ width: `${(n / Math.max(1, max)) * 100}%` }} />
                  <strong>{num(n)}</strong>
                </li>
              );
            })}
          </ol>
          <p className="cell-secondary">
            En lektion om 60 minuter som ligger varje {weekdayNames[summary.perWeekday.indexOf(Math.min(...summary.perWeekday))]} ger {num(Math.min(...summary.perWeekday))} timmar under läsåret; varje {weekdayNames[summary.perWeekday.indexOf(Math.max(...summary.perWeekday))]} ger {num(Math.max(...summary.perWeekday))}. Skoldagarna ska vara så jämnt fördelade som möjligt.
          </p>
        </div>
        <div>
          <h4>Timplanens timmar med läsårets skoldagar</h4>
          {teachingRows.length === 0 && !intro ? (
            <p className="cell-secondary">Ingen fastställd timplan att räkna på. Fastställ en timplan under Timplaner.</p>
          ) : (
            <div className="tp-grid-scroll">
              <table className="tp-grid ly-teaching-table">
                <thead>
                  <tr>
                    <th scope="col">Utbildning</th>
                    <th scope="col">Timmar per läsår</th>
                    <th scope="col">Undervisningsdagar</th>
                    <th scope="col">Kräver per vecka</th>
                    <th scope="col">Per skoldag</th>
                  </tr>
                </thead>
                <tbody>
                  {teachingRows.map((r, i) => {
                    const minutes = requiredWeeklyMinutes(r.hours, r.days);
                    const first = i === 0 || teachingRows[i - 1].education !== r.education;
                    return (
                      <Fragment key={r.id}>
                        {first && (
                          <tr className="tp-block-row">
                            <th scope="rowgroup" colSpan={5}>{r.education}</th>
                          </tr>
                        )}
                        <tr>
                          <th scope="row" className="tp-row-head">
                            <span className="tp-row-name">{r.column}</span>
                          </th>
                          <td>{num(r.hours)}</td>
                          <td className={r.fewer ? 'ly-fewer' : ''}>
                            {num(r.days)}
                            {r.fewer ? <small className="tp-minutes">{num(r.fewer)} färre än skolan</small> : null}
                          </td>
                          <td>{num(minutes)} min<small className="tp-minutes">{num(minutes / 60, 1)} timmar</small></td>
                          <td>{num(hoursPerSchoolDay(r.hours, r.days), 1)} timmar</td>
                        </tr>
                      </Fragment>
                    );
                  })}
                  {intro && (
                    <>
                      <tr className="tp-block-row">
                        <th scope="rowgroup" colSpan={5}>{intro.name}</th>
                      </tr>
                    <tr>
                      <th scope="row" className="tp-row-head">
                        <span className="tp-row-name">Per läsår</span>
                        <span className="tp-row-meta"><em>utbildningsplan, {num(intro.weekly)} timmar per vecka</em></span>
                      </th>
                      <td>{num(Math.round(intro.weekly * schoolWeeks(summary.skoldagar)))}</td>
                      <td>{num(summary.skoldagar)}</td>
                      <td>{num(intro.weekly * 60)} min<small className="tp-minutes">minst 23 timmar</small></td>
                      <td>{num(intro.weekly / 5, 1)} timmar</td>
                    </tr>
                    </>
                  )}
                </tbody>
              </table>
            </div>
          )}
          <p className="cell-secondary">
            Timplanen anger timmar om 60 minuter per läsår. Här fördelas de på läsårets skolveckor; raster ingår inte. Undervisning som ställs in måste läggas ut igen för att timmarna ska nås.
          </p>
        </div>
      </div>
      {classRows.length > 0 && (
        <div className="ly-schedule">
          <h4>Lärotider per klass</h4>
          <div className="tp-grid-scroll">
            <table className="tp-grid ly-teaching-table">
              <thead>
                <tr>
                  <th scope="col">Klass</th>
                  <th scope="col">Elever</th>
                  <th scope="col">Undervisningsdagar</th>
                  <th scope="col">Skäl till avvikelse</th>
                  <th scope="col">Per skoldag</th>
                </tr>
              </thead>
              <tbody>
                {classRows.map(({ group: g, own, hours }) => (
                  <tr key={g.id} data-state={groupId === g.id ? 'selected' : undefined}>
                    <th scope="row" className="tp-row-head">
                      <button
                        type="button"
                        className="pupil-link"
                        aria-label={`Visa lärotider för klass ${g.name}`}
                        onClick={() => onShowClass(g.id)}
                      >
                        <span>
                          <strong>{g.name}</strong>
                          <small>{g.educationName}{g.columnId ? '' : ' · utanför timplanens årskurser'}</small>
                        </span>
                      </button>
                    </th>
                    <td>{g.pupils ? num(g.pupils) : <span className="tp-zero">–</span>}</td>
                    <td className={own.fewer ? 'ly-fewer' : ''}>
                      {num(own.days)}
                      {own.fewer ? <small className="tp-minutes">{num(own.fewer)} färre än skolan</small> : null}
                    </td>
                    <td className="ly-causes">
                      {own.shortWeek && (
                        <span>Fyra dagar i veckan, ledig {weekdayNames[own.shortWeek.weekday]}</span>
                      )}
                      {own.byCause.filter((c) => !c.recurring).map((c) => (
                        <span key={c.cause}>{causeLabel[c.cause]} · {num(c.days)} dagar</span>
                      ))}
                      {!own.shortWeek && own.byCause.length === 0 && <span className="tp-zero">följer skolans dagar</span>}
                    </td>
                    <td>{hours ? `${num(hoursPerSchoolDay(hours, own.days), 1)} timmar` : <span className="tp-zero">–</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cell-secondary">
            Klasserna kommer ur elevregistret och ärver sin årskurs avvikelser. Timmarna per skoldag är
            timplanens timmar för klassens årskurs fördelade på klassens egna undervisningsdagar. En klass
            med färre dagar behöver längre dagar för samma garanterade undervisningstid.
          </p>
        </div>
      )}
      {scheduleRows.length > 0 && (
        <div className="ly-schedule">
          <h4>Schemats pass under läsåret</h4>
          <div className="tp-grid-scroll">
            <table className="tp-grid ly-teaching-table">
              <thead>
                <tr>
                  <th scope="col">Grupp</th>
                  <th scope="col">Per vecka</th>
                  {weekdayShort.slice(0, 5).map((w) => (
                    <th scope="col" key={w}>{w}</th>
                  ))}
                  <th scope="col">Tillfällen</th>
                  <th scope="col" className="tp-total-head">Timmar</th>
                </tr>
              </thead>
              <tbody>
                {scheduleRows.map((g) => (
                  <tr key={g.id}>
                    <th scope="row" className="tp-row-head">
                      <span className="tp-row-name">{g.name}</span>
                      <span className="tp-row-meta"><em>{g.subject} · {g.teacher}</em></span>
                    </th>
                    <td>{num(g.weekly)} min<small className="tp-minutes">{g.slots} pass</small></td>
                    {g.planned.perDay.map((h, i) => (
                      <td key={weekdayShort[i]}>{h ? num(h, 1) : <span className="tp-zero">–</span>}</td>
                    ))}
                    <td>{num(g.planned.occasions)}</td>
                    <td className="tp-total">{num(g.planned.hours, 1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cell-secondary">
            Exempelveckan under Schema &amp; resurser, upprepad över skolans skoldagar. Undervisningsgrupperna är
            inte knutna till klass eller årskurs i exemplet, så en grupps egna lärotider kan inte räknas in här;
            den jämförelsen finns per klass i tabellen ovan. Jämförelsen mot timplanens timmar per ämne kräver
            dessutom att varje grupp knyts till en rad i timplanen.
          </p>
        </div>
      )}
    </section>
  );
}

/** Avgränsningen `plan-boundary`; skyddad drift skickar A-10:s text. */
export function PlanBoundary({ text = DEMO_BOUNDARY }: { text?: string }) {
  return (
    <div className="plan-boundary">
      <BookOpen size={17} />
      <p>
        {text}
      </p>
    </div>
  );
}

/** Sidokortet med kontroll mot förordningarna. Rubrik och statusetikett är props (A-08). */
export function LasarControlCard({ summary, gy, errors, warnings, group, groupIssues, heading = DEMO_CONTROL.heading, okLabel = DEMO_CONTROL.ok }: {
  summary: Summary;
  gy: boolean;
  errors: Issue[];
  warnings: Issue[];
  group?: StudentGroup;
  groupIssues: Issue[];
  heading?: string;
  okLabel?: string;
}) {
  return (
    <div className="og-card">
      <div className="section-heading">
        <h3>{heading}</h3>
        <span className={errors.length ? 'a-status amber' : 'a-status'}>
          <span />
          {errors.length ? `${errors.length} avvikelse${errors.length > 1 ? 'r' : ''}` : okLabel}
        </span>
      </div>
      <dl className="ly-counters">
        <div className={summary.skoldagar < minSchoolDays ? 'ly-bad' : ''}>
          <dt>Skoldagar</dt>
          <dd><strong>{num(summary.skoldagar)}</strong><small>minst {minSchoolDays}</small></dd>
        </div>
        <div className={summary.lovdagar < minHolidays ? 'ly-bad' : ''}>
          <dt>Lovdagar</dt>
          <dd><strong>{num(summary.lovdagar)}</strong><small>minst {minHolidays} · {num(summary.lovdagarJullov)} i jullovet</small></dd>
        </div>
        <div className={summary.studiedagar > maxStudyDays ? 'ly-bad' : ''}>
          <dt>Studiedagar</dt>
          <dd><strong>{num(summary.studiedagar)}</strong><small>högst {maxStudyDays}</small></dd>
        </div>
        <div className={gy && summary.weeks.total !== gymnasiumWeeks ? 'ly-bad' : ''}>
          <dt>Veckor</dt>
          <dd><strong>{num(summary.weeks.total)}</strong><small>{gy ? `gymnasieskolan ${gymnasiumWeeks}` : 'inget krav i grundskolan'}</small></dd>
        </div>
        <div>
          <dt>Helgdagar på vardag</dt>
          <dd><strong>{num(summary.helgdagar.length)}</strong><small>räknas inte som lov</small></dd>
        </div>
      </dl>
      <p className={`ly-margin ${summary.margin < 0 ? 'ly-bad' : ''}`}>
        {summary.margin >= 0
          ? `${num(summary.margin)} skoldag${summary.margin === 1 ? '' : 'ar'} över minsta antal. ${summary.studiedagarKvar ? `${num(Math.min(summary.studiedagarKvar, summary.margin))} studiedag${Math.min(summary.studiedagarKvar, summary.margin) === 1 ? '' : 'ar'} kan läggas ut utan att gå under ${minSchoolDays}.` : 'Alla fem studiedagar är utlagda.'}`
          : `${num(-summary.margin)} skoldag${summary.margin === -1 ? '' : 'ar'} saknas.`}
      </p>
      {errors.length > 0 && (
        <div className="validation-warning">
          {errors.map((i) => (
            <p key={i.text}><AlertTriangle size={16} /><span>{i.text}</span></p>
          ))}
        </div>
      )}
      {errors.length === 0 && (
        <div className="validation-success"><CircleCheck size={17} /> Läsåret uppfyller förordningens antal skoldagar, lovdagar och studiedagar.</div>
      )}
      {warnings.length > 0 && (
        <ul className="tp-warnings">
          {warnings.map((i) => (
            <li key={i.text}><Info size={14} /> {i.text}</li>
          ))}
        </ul>
      )}
      {groupIssues.length > 0 && group && (
        <div className="ly-group-issues">
          <h4>{group.name}</h4>
          {groupIssues.filter((i) => i.level === 'error').length > 0 && (
            <div className="validation-warning">
              {groupIssues.filter((i) => i.level === 'error').map((i) => (
                <p key={i.text}><AlertTriangle size={16} /><span>{i.text}</span></p>
              ))}
            </div>
          )}
          <ul className="tp-warnings">
            {groupIssues.filter((i) => i.level === 'warning').map((i) => (
              <li key={i.text}><Info size={14} /> {i.text}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** Sidokortet med helgdagar inom läsåret. */
export function LasarHolidaysCard({ summary }: { summary: Summary }) {
  return (
    <div className="og-card">
      <div className="section-heading">
        <h3>Helgdagar inom läsåret</h3>
      </div>
      <ul className="ly-holidays">
        {summary.helgdagar.map((h) => (
          <li key={h.date}><span>{h.name}</span><small>{formatLong(h.date)}</small></li>
        ))}
      </ul>
      <p className="cell-secondary">Lagen (1989:253) om allmänna helgdagar. Söndagar och lördagshelgdagar visas inte.</p>
    </div>
  );
}

/** Sidokortet Samtal och beslut. `onComment` svarar sant när kommentaren är sparad. */
export function LasarTalkCard({ placeholder, history, historyLabel, onComment, canComment = true, onTextChange }: {
  placeholder: string;
  history: Entry[];
  historyLabel: (entry: Entry) => string;
  /** Sant när kommentaren är sparad; skyddad drift svarar asynkront. */
  onComment: (text: string) => boolean | Promise<boolean>;
  /** Skyddad drift: utan förmågan att kommentera visas inte fältet (A-01). */
  canComment?: boolean;
  /** Skyddad drift: osparad text registreras av vyn (A-11). */
  onTextChange?: (text: string) => void;
}) {
  const [talk, setTalkText] = useState('');
  const setTalk = (text: string) => { setTalkText(text); onTextChange?.(text); };
  function comment() {
    const done = onComment(talk);
    if (done === true) setTalk('');
    else if (done) void done.then((ok) => { if (ok) setTalk(''); });
  }
  return (
    <div className="og-card">
      <div className="section-heading">
        <h3><History size={16} /> Samtal och beslut</h3>
      </div>
      {canComment && (
        <div className="tp-comment-box">
          <Textarea aria-label="Ny kommentar" rows={2} value={talk} placeholder={placeholder} onChange={(e) => setTalk(e.target.value)} />
          <Button variant="outline" onClick={comment}>
            <MessageSquareText size={15} /> Kommentera
          </Button>
        </div>
      )}
      <div className="admin-history tp-entries">
        {history.map((h) => (
          <div key={h.id}>
            <span>{historyLabel(h)}</span>
            <strong>{h.action}</strong>
            <p>{h.comment}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Åtgärdsdialogen `admin-dialog` för skicka, fastställ, återsänd och öppna. */
export function LasarActionDialog({
  action, sy, summary, unitName, errors, comment, onComment, error, onClose, onRun,
  reviewHeading = DEMO_CONTROL.heading, okLabel = DEMO_CONTROL.ok,
  description, reviewExtra, errorList, notice, className, cancelVariant = 'ghost', busy = false,
}: {
  action: LasarAction | null;
  sy?: SchoolYear;
  summary?: Summary;
  unitName: string;
  errors: Issue[];
  comment: string;
  onComment: (text: string) => void;
  error: string;
  onClose: () => void;
  onRun: () => void;
  reviewHeading?: string;
  okLabel?: string;
  /** Skyddad drift: egen beskrivning (öppna för ändring, fastställ version 2 och senare). */
  description?: string;
  /** Skyddad drift: extra rad i granskningsrutan. */
  reviewExtra?: ReactNode;
  /** Skyddad drift: serverns regeltexter under felet (UI-SPEC avsnitt 13). */
  errorList?: string[];
  /** Skyddad drift: till exempel verifiering med engångskod. */
  notice?: ReactNode;
  className?: string;
  cancelVariant?: 'ghost' | 'outline';
  busy?: boolean;
}) {
  return (
    <Dialog open={action !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent className={className ? `admin-dialog ${className}` : 'admin-dialog'} showCloseButton={false}>
        {action && sy && summary && (
          <>
            <div className="dialog-eyebrow">
              <span>{sy.label.toLocaleUpperCase('sv')}</span>
              <span>{unitName.toLocaleUpperCase('sv')}</span>
            </div>
            <DialogTitle>{actionCopy[action].title}</DialogTitle>
            <DialogDescription>{description ?? actionCopy[action].description}</DialogDescription>
            {(action === 'submit' || action === 'approve') && (
              <div className="review-summary">
                <span>{reviewHeading}</span>
                <strong>{errors.length ? `${errors.length} avvikelser` : okLabel}</strong>
                <p>
                  Hösttermin {formatDate(sy.ht.start)} – {formatDate(sy.ht.end)}, vårtermin {formatDate(sy.vt.start)} – {formatDate(sy.vt.end)}. {num(summary.skoldagar)} skoldagar, {num(summary.lovdagar)} lovdagar, {num(summary.studiedagar)} studiedagar, {num(summary.weeks.total)} veckor.
                </p>
                {reviewExtra}
              </div>
            )}
            <label className="field-label" htmlFor="ly-action-comment">{actionCopy[action].label}</label>
            <Textarea id="ly-action-comment" rows={4} placeholder={actionCopy[action].placeholder} value={comment} onChange={(e) => onComment(e.target.value)} />
            {error && (
              <div className="validation-warning"><p><AlertTriangle size={16} /><span>{error}</span></p>{errorList?.map((t) => <p key={t}>{t}</p>)}</div>
            )}
            {notice}
            <div className="dialog-actions">
              <Button variant={cancelVariant} onClick={onClose}>Avbryt</Button>
              <Button onClick={onRun} disabled={busy}>{actionCopy[action].button}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
