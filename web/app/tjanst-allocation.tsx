'use client';

import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { TjanstPlanRead } from '@/lib/tjanst-contract.ts';
import type { TjanstYearCandidate, TjanstYearReply, TjanstYearRowReply } from '@/lib/tjanst-year-contract.ts';
import { createYearRowEditor, selectYearTeacher, sortYearSuggestions, yearCandidatePeriod, yearEvidenceLabel, yearRecommendationMessage, yearRowSavePayload,
  YEAR_QUALIFICATION_LABEL } from '@/lib/tjanst-year-model.ts';
import { allocationQueue, candidateTotals, nextAfter, type TjanstQueueGroupBy, type TjanstQueueItem } from '@/lib/tjanst-queue.ts';
import type { TjanstLensId } from '@/lib/tjanst-lens.ts';
import { courseCode, rowTime, type TjanstClassGroup } from './tjanst-matrix';
import { hoursInput, parseHours, type TjanstFailure, type TjanstOutcome, type TjanstPreparedChange } from './tjanst-dialogs';
import { formatTime, yearLabel, type TjanstTermView } from './tjanst-service-summary';

/**
 * 05.1-30: fördelningsläge. En kö med ofördelade behov och en panel med förklarade förslag, sökning bland alla lärare och
 * kandidatens undervisning före och efter valet. Ett klick på Välj eller en siffra för en namngiven kandidat är ett aktivt
 * val (D-29) och sparar raden direkt; inget är förvalt. Summorna är fördelad tid, inte ledig kapacitet (D-10).
 */
type Props = { data: TjanstPlanRead; groups: TjanstClassGroup[]; term: TjanstTermView; editable: boolean; phone: boolean;
  drafts: Record<string, TjanstAllocationDraft>; onDraft: (sourceKey: string, draft: TjanstAllocationDraft | null) => void;
  initialSourceKey?: string | null;
  /** 05.1-34: kön följer linsen. Ofördelat ger bara ofördelade behov; Alla behov ger också fördelade (till exempel för en andra lärare). */
  lens?: TjanstLensId;
  loadSupport: (sourceKey: string, rowId: string | null) => Promise<TjanstYearReply | TjanstFailure>;
  onSave: (change: TjanstPreparedChange, message: string) => Promise<TjanstOutcome>; onOpenCourse: (code: string) => void };
type Pick = { key: string; person: TjanstYearCandidate; selection: { kind: 'suggestion'; suggestionId: string } | { kind: 'manual'; personId: string }; reasons: string[] };
type Existing = { person: TjanstYearCandidate; time: { ht: number; vt: number } };
export type TjanstAllocationDraft = { ht: string; vt: string };

const termText = (v: { ht: number; vt: number; year: number }) => `HT ${formatTime(v.ht)} · VT ${formatTime(v.vt)} · Läsår ${formatTime(v.year)}`;
const typing = (el: EventTarget | null) => el instanceof HTMLElement && (el.closest('input,textarea,select,[contenteditable="true"]') !== null);

export default function TjanstAllocation({ data, groups, term, editable, phone, lens = 'ofordelat', drafts, onDraft, initialSourceKey = null, loadSupport, onSave, onOpenCourse }: Props) {
  const id = useId();
  const [groupBy, setGroupBy] = useState<TjanstQueueGroupBy>('klass'), [search, setSearch] = useState('');
  const queue = useMemo(() => allocationQueue(groups, term, { groupBy, search, lens }), [groups, term, groupBy, search, lens]);
  const [selectedKey, setSelectedKey] = useState<string | null>(initialSourceKey);
  const [saved, setSaved] = useState<string[]>([]);
  const previousQueue = useRef<TjanstQueueItem[]>(queue), pendingNext = useRef<{ key: string; revision: number } | null>(null);
  // Ett behov som just blev fördelat försvinner ur kön; panelen visar då första behovet tills nästa val är satt, så rubriken behåller fokus.
  const selected = queue.find(i => i.sourceKey === selectedKey) ?? queue.find(i => i.status === 'open') ?? queue[0] ?? null;
  const entry = selected ? groups.flatMap(g => g.entries).find(e => e.need.sourceKey === selected.sourceKey) ?? null : null;
  const vacantRow = entry?.rows.find(r => r.personId === null && r.jointGroupId === null) ?? null;

  // Efter en sparning och omläsning: gå vidare till nästa ofördelade behov. Ett delvis fördelat behov ligger kvar i kön men hoppas över.
  useEffect(() => {
    const pending = pendingNext.current;
    if (pending && pending.revision !== data.revision) {
      const next = nextAfter(previousQueue.current, queue, pending.key); pendingNext.current = null;
      queueMicrotask(() => { setSelectedKey(next?.sourceKey ?? null); requestAnimationFrame(() => document.getElementById(`${id}-need`)?.focus()); });
    }
    if (!pendingNext.current) previousQueue.current = queue;
  }, [queue, data.revision, id]);

  const [support, setSupport] = useState<{ key: string; reply: TjanstYearRowReply } | null>(null), [supportError, setSupportError] = useState<string | null>(null), [reload, setReload] = useState(0);
  const target = selected ? `${selected.sourceKey}|${vacantRow?.id ?? ''}` : null;
  useEffect(() => {
    if (phone || !editable || !selected || !target) return;
    let current = true; const token = `${target}|${data.revision}|${reload}`;
    void loadSupport(selected.sourceKey, vacantRow?.id ?? null).then(reply => {
      if (!current) return;
      if ('ok' in reply || reply.mode !== 'row' || reply.sourceKey !== selected.sourceKey) { setSupportError('ok' in reply ? reply.error : 'Planeringsstödet kunde inte kontrolleras.'); return; }
      setSupportError(null); setSupport({ key: token, reply });
    });
    return () => { current = false; };
  // data.revision: ett nytt underlag hämtas efter varje ändring; inmatade tider ligger kvar.
  }, [target, data.revision, reload, phone, editable]); // eslint-disable-line react-hooks/exhaustive-deps
  // Bara stöd som hör till aktuellt behov, aktuell revision och senaste omhämtning går att välja ur; annat är inaktuellt.
  const reply = support && support.key === `${target}|${data.revision}|${reload}` ? support.reply : null;

  const others = useMemo(() => {
    if (!entry) return { ht: 0, vt: 0 };
    return { ht: entry.cov.covered.ht, vt: entry.cov.covered.vt };
  }, [entry]);
  const base = useMemo(() => { try { return reply ? createYearRowEditor(reply, others) : null; } catch { return null; } }, [reply, others]);
  // Behåll bara inmatning här; val och revisionsunderlag hämtas alltid på nytt.
  const draft = selected ? drafts[selected.sourceKey] : undefined;
  const ht = draft?.ht ?? hoursInput(base?.teacherHt ?? null), vt = draft?.vt ?? hoursInput(base?.teacherVt ?? null);
  const setTime = (field: 'ht' | 'vt', value: string) => selected && onDraft(selected.sourceKey, { ht, vt, [field]: value });
  const [query, setQuery] = useState(''), [failure, setFailure] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // En lärare som redan har en rad på behovet ändras i matrisen; ett nytt val skulle bli en dubblettrad (faktiskt prov 05.1-30).
  const onNeed = useMemo(() => new Set(entry?.rows.flatMap(r => r.personId ? [r.personId] : []) ?? []), [entry]);
  const existing: Existing[] = useMemo(() => reply && entry ? reply.candidates.filter(p => onNeed.has(p.personId)).map(p => ({ person: p,
    time: entry.rows.filter(r => r.personId === p.personId).reduce((s, r) => { const t = rowTime(r, data.joints); return { ht: s.ht + t.ht, vt: s.vt + t.vt }; }, { ht: 0, vt: 0 }) })) : [], [reply, entry, onNeed, data.joints]);
  const picks: Pick[] = useMemo(() => {
    if (!reply) return [];
    const q = query.trim().toLocaleLowerCase('sv');
    const matches = (person: TjanstYearCandidate) => !q || person.displayName.toLocaleLowerCase('sv').includes(q);
    const byId = new Map(reply.candidates.map(p => [p.personId, p])), list: Pick[] = [], seen = new Set<string>(onNeed);
    if (reply.recommendationStatus === 'ready') for (const s of sortYearSuggestions(reply)) { const p = byId.get(s.personId); if (!p || seen.has(p.personId) || !matches(p)) continue; seen.add(p.personId);
      list.push({ key: s.suggestionId, person: p, selection: { kind: 'suggestion', suggestionId: s.suggestionId }, reasons: [...new Set(s.references.map(yearEvidenceLabel))] }); }
    for (const p of [...reply.candidates].sort((a, b) => a.displayName.localeCompare(b.displayName, 'sv'))) {
      if (seen.has(p.personId) || !matches(p)) continue;
      list.push({ key: p.personId, person: p, selection: { kind: 'manual', personId: p.personId }, reasons: [] });
    }
    return list;
  }, [reply, query, onNeed]);
  const parsed = { ht: parseHours(ht), vt: parseHours(vt) };
  const added = { ht: 'minutes' in parsed.ht ? parsed.ht.minutes : 0, vt: 'minutes' in parsed.vt ? parsed.vt.minutes : 0 };

  async function choose(selection: Pick['selection'] | { kind: 'unassigned' }, who: string) {
    if (!reply || !base || !selected || !entry || busy || !editable) return;
    const h = parseHours(ht), v = parseHours(vt);
    if ('error' in h || 'error' in v) { setFailure('error' in h ? h.error : 'error' in v ? v.error : ''); return; }
    if (h.minutes === 0 && v.minutes === 0) { setFailure('Ange tid för minst en termin.'); return; }
    let change: TjanstPreparedChange;
    try {
      const editor = selectYearTeacher(base, reply, selection);
      const payload = yearRowSavePayload({ ...editor, teacherHt: h.minutes, teacherVt: v.minutes }, reply);
      change = { action: 'save_row', unitId: editor.unitId, schoolYear: editor.schoolYear, expectedRevision: editor.expectedRevision, payload };
    } catch { setFailure('Underlaget har ändrats. Dina tider finns kvar. Välj lärare på nytt.'); setReload(n => n + 1); return; }
    // Fokus på behovets rubrik: den finns kvar efter omläsningen, så arbetsytan återställer inte fokus till sidrubriken.
    document.getElementById(`${id}-need`)?.focus();
    setBusy(true); setFailure(null);
    const key = selected.sourceKey;
    previousQueue.current = queue; pendingNext.current = { key, revision: data.revision };
    const outcome = await onSave(change, `Tjänsteraden är sparad: ${who}, ${selected.label}, ${selected.className}, HT ${formatTime(h.minutes)} · VT ${formatTime(v.minutes)}.`);
    setBusy(false);
    if (outcome.ok) { onDraft(key, null); setSaved(s => [...s, key]); setQuery(''); }
    else { pendingNext.current = null; setFailure(outcome.code === 'tjanst_duplicate_row' ? `${who} har redan en rad för ${selected.label} i ${selected.className}. Ändra den befintliga raden i matrisen.`
      : outcome.error || 'Tjänsteraden kunde inte sparas. Dina uppgifter finns kvar.'); setReload(n => n + 1); }
  }
  function move(step: number) {
    if (!queue.length) return;
    const index = selected ? queue.findIndex(i => i.sourceKey === selected.sourceKey) : -1;
    const next = queue[Math.max(0, Math.min(queue.length - 1, index + step))]; setSelectedKey(next.sourceKey); setFailure(null);
    requestAnimationFrame(() => document.getElementById(`${id}-q-${next.sourceKey}`)?.focus());
  }
  function onKey(event: globalThis.KeyboardEvent) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (typing(event.target)) { if (event.key === 'Escape' && event.target === searchRef.current) { setQuery(''); } return; }
    const k = event.key;
    if (k === 'ArrowDown' || k === 'ArrowUp') { event.preventDefault(); move(k === 'ArrowDown' ? 1 : -1); }
    else if (/^[1-9]$/u.test(k) && picks[Number(k) - 1]) { event.preventDefault(); const p = picks[Number(k) - 1]; void choose(p.selection, p.person.displayName); }
    else if (k === 'v' || k === 'V') { event.preventDefault(); void choose({ kind: 'unassigned' }, 'Vakant'); }
    else if (k === 'n' || k === 'N') { event.preventDefault(); move(1); }
    else if (k === '/') { event.preventDefault(); searchRef.current?.focus(); }
  }

  // Tangentbordet gäller hela vyn; lyssnaren läser alltid senaste tillstånd.
  const keyRef = useRef(onKey), sectionRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => { keyRef.current = onKey; });
  useEffect(() => { const el = sectionRef.current; if (!el) return; const listener = (e: globalThis.KeyboardEvent) => keyRef.current(e); el.addEventListener('keydown', listener); return () => el.removeEventListener('keydown', listener); }, [phone]);
  const sameCourse = selected ? data.classes.flatMap(c => c.needs.filter(n => n.sourceKey !== selected.sourceKey && courseCode(n) === courseCode({ rowKey: data.classes.flatMap(x => x.needs).find(n2 => n2.sourceKey === selected.sourceKey)?.rowKey ?? '' })).map(n => ({ cls: c.name, need: n }))) : [];
  const ownTime = entry ? entry.rows.filter(r => r.personId !== null).reduce((s, r) => { const t = rowTime(r, data.joints); return { ht: s.ht + t.ht, vt: s.vt + t.vt }; }, { ht: 0, vt: 0 }) : { ht: 0, vt: 0 };

  const onlyOpen = lens === 'ofordelat', openCount = queue.filter(i => i.status === 'open').length;
  const status = (item: TjanstQueueItem) => item.status === 'allocated' ? <span className="tjanst-queue-status"> · Fördelat{item.surplusVacant ? ' · överflödig vakant rad' : ''}</span>
    : item.status === 'unknown' ? <span className="tjanst-queue-status"> · Behov okänt</span> : null;
  const queueList = <div className="tjanst-queue">
    <div className="tjanst-queue-tools">
      <div className="tjanst-field"><label htmlFor={`${id}-qsok`}>Sök behov</label><input id={`${id}-qsok`} type="search" value={search} onChange={e => setSearch(e.target.value)}/></div>
      <div className="tjanst-field"><label htmlFor={`${id}-grupp`}>Gruppera</label><select id={`${id}-grupp`} value={groupBy} onChange={e => setGroupBy(e.target.value as TjanstQueueGroupBy)}><option value="klass">Per klass</option><option value="amne">Per ämne</option></select></div>
    </div>
    <p className="tjanst-queue-count">{onlyOpen ? queue.length === 0 ? 'Inga ofördelade behov' : `${queue.length} ofördelade behov`
      : `${queue.length} behov · ${openCount} ofördelade`}{saved.length ? ` · ${saved.length} fördelade nu` : ''}</p>
    {queue.length > 0 && <ul aria-label={onlyOpen ? 'Ofördelade behov' : 'Behov'}>{queue.map((item, i) => <li key={item.sourceKey}>
      {(i === 0 || queue[i - 1].group !== item.group) && <span className="tjanst-queue-group">{item.group}</span>}
      {phone ? <span className="tjanst-queue-item">{item.label} · {item.className}{status(item)}</span>
        : <button type="button" id={`${id}-q-${item.sourceKey}`} className="tjanst-queue-item" aria-current={selected?.sourceKey === item.sourceKey ? 'true' : undefined}
          onClick={() => { setSelectedKey(item.sourceKey); setFailure(null); }}>{item.label} · {item.className}{status(item)}</button>}
    </li>)}</ul>}
  </div>;

  if (phone) return <section className="tjanst-allocation tjanst-allocation-phone" aria-label="Fördela"><p>Här ser du {lens === 'ofordelat' ? 'ofördelade behov' : 'behoven'}. Lärare väljs på dator.</p>{queueList}</section>;
  return <section className="tjanst-allocation" aria-label="Fördela" ref={sectionRef}>
    <p className="tjanst-allocation-help">Välj ett behov i kön och välj lärare. Ett klick på <strong>Välj</strong> eller en siffra (1–9) sparar raden direkt, och kön går vidare. Inget är förvalt. <kbd>↑</kbd> <kbd>↓</kbd> byter behov, <kbd>V</kbd> väljer Vakant, <kbd>N</kbd> hoppar över och <kbd>/</kbd> söker lärare.</p>
    <div className="tjanst-allocation-grid">
      {queueList}
      <div className="tjanst-allocation-panel">
        {!selected ? <p>{queue.length ? 'Välj ett behov i kön.' : 'Alla behov som syns är fördelade. Ändra filter eller lins för att se fler.'}</p> : <>
          <h3 id={`${id}-need`} tabIndex={-1}>{selected.label} · {selected.className}</h3>
          {entry && <dl className="mandate-facts tjanst-facts">
            <div><dt>Behov enligt timplanen</dt><dd>HT {entry.need.needHt === null ? 'okänt' : formatTime(entry.need.needHt)} · VT {entry.need.needVt === null ? 'okänt' : formatTime(entry.need.needVt)}</dd></div>
            <div><dt>Redan fördelat</dt><dd>HT {formatTime(ownTime.ht)} · VT {formatTime(ownTime.vt)}{vacantRow ? ' · en vakant rad ersätts av valet' : ''}</dd></div>
          </dl>}
          {sameCourse.length > 0 && <p className="tjanst-same-course">Samma kurs finns i {sameCourse.length === 1 ? 'en annan klass' : `${sameCourse.length} andra klasser`}: {sameCourse.map(s => s.cls).join(', ')}.{' '}
            <Button type="button" variant="outline" onClick={() => onOpenCourse(courseCode({ rowKey: data.classes.flatMap(x => x.needs).find(n => n.sourceKey === selected.sourceKey)?.rowKey ?? '' }))}>Visa alla klasser med kursen</Button></p>}
          {failure && <p role="alert" className="validation-warning">{failure}</p>}
          {!editable ? <p>Fördelningen kan inte ändras just nu.</p> : supportError ? <div role="alert"><p>{supportError}</p><Button type="button" variant="outline" onClick={() => setReload(n => n + 1)}>Hämta planeringsstöd igen</Button></div>
          : !reply || !base ? <output aria-busy="true">Hämtar planeringsstöd…</output> : <>
            <div className="tjanst-allocation-times">
              <div className="tjanst-field"><label htmlFor={`${id}-ht`}>Lärartid HT (timmar)</label><input id={`${id}-ht`} inputMode="decimal" value={ht} onChange={e => setTime('ht', e.target.value)}/></div>
              <div className="tjanst-field"><label htmlFor={`${id}-vt`}>Lärartid VT (timmar)</label><input id={`${id}-vt`} inputMode="decimal" value={vt} onChange={e => setTime('vt', e.target.value)}/></div>
            </div>
            {draft && <Button type="button" variant="outline" disabled={busy} onClick={() => { onDraft(selected.sourceKey, null); setFailure(null); }}>Återställ tider för behovet</Button>}
            {busy && <output aria-busy="true">Sparar…</output>}
            <h4>{yearRecommendationMessage(reply.recommendationStatus)}</h4>
            {reply.recommendationStatus === 'unavailable' && <p>Du kan fortfarande söka och välja en lärare.</p>}
            <div className="tjanst-field"><label htmlFor={`${id}-lsok`}>Sök lärare</label><input id={`${id}-lsok`} ref={searchRef} type="search" autoComplete="off" value={query} onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); const p = picks[0]; if (p && query.trim()) void choose(p.selection, p.person.displayName); } }}/></div>
            {existing.length > 0 && <section className="tjanst-existing" aria-label="Har redan tid på behovet"><h4>Har redan tid på behovet</h4>
              {existing.map(x => <p key={x.person.personId}>{x.person.displayName}: HT {formatTime(x.time.ht)} · VT {formatTime(x.time.vt)}. Ändra raden i matrisen.</p>)}</section>}
            <ol className="tjanst-candidates" aria-label="Lärare att välja">{picks.slice(0, 60).map((p, i) => { const t = candidateTotals(p.person.personId, data.rows, data.specials, data.joints, added);
              return <li key={p.key} className="tjanst-teacher-choice"><strong>{i < 9 ? <kbd aria-hidden="true">{i + 1}</kbd> : null}{p.person.displayName}</strong>
                {p.reasons.length > 0 && <p>Förslag: {p.reasons.join(' · ')}</p>}
                <p>{p.person.draft ? 'Ny lärare – uppgifter kompletteras' : `Egen andel på skolan: ${p.person.shareHere ?? 'okänd'} %`}{yearCandidatePeriod(p.person, data.schoolYear) === 'part_year' ? ' · Gäller en del av läsåret' : ''}</p>
                <small>Undervisning nu: {termText(t.before)}</small><small>Efter valet: {termText(t.after)}</small><small>{YEAR_QUALIFICATION_LABEL}</small>
                <Button type="button" variant="outline" disabled={busy} aria-keyshortcuts={i < 9 ? String(i + 1) : undefined} onClick={() => void choose(p.selection, p.person.displayName)}>Välj {p.person.displayName}</Button>
              </li>; })}</ol>
            {picks.length > 60 && <p>Visar 60 av {picks.length} lärare. Sök för att hitta fler.</p>}
            {picks.length === 0 && <p>Inga lärare matchar sökningen.</p>}
            <div className="mandate-actions"><Button type="button" variant="outline" disabled={busy} aria-keyshortcuts="V" onClick={() => void choose({ kind: 'unassigned' }, 'Vakant')}>Välj Vakant</Button>
              <Button type="button" variant="outline" disabled={busy} aria-keyshortcuts="N" onClick={() => move(1)}>Hoppa över</Button></div>
          </>}
          <p className="tjanst-allocation-note">Summorna visar fördelad undervisning, inte ledig tid. Läsåret {yearLabel(data.schoolYear)}.{saved.length ? <> <CheckCheck size={16} aria-hidden="true"/> {saved.length} behov fördelade i den här vyn.</> : null}</p>
        </>}
      </div>
    </div>
  </section>;
}
