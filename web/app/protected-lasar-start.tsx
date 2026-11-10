'use client';
// Nytt läsår i skyddad drift (fas 05.1.1, plan 05): startval i tomläget,
// granskning efter kopiering och huvudmannens arbetssätt (UI-SPEC avsnitt 10
// och 11, A-04, A-12; D-01–D-04, D-14, D-15). Knappar visas bara för förmågor
// som servern har skickat (`capabilities.canCreate`, `canSetMode`, `canEdit`);
// sessionens roll används bara för texten i tomläget (A-01). Inget skrivs utan
// uttryckligt val, och bytet av arbetssätt kräver bekräftelse med listan över
// påverkade skolor ur serverns förhandsvisning.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, CalendarCheck, CheckCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { api, ApiError } from '@/lib/server-client.ts';
import {
  isLasarReason,
  lasarDecisionRequest,
  lasarErrorText,
  lasarModelStatus,
  LASAR_GENERIC_TEXT,
  parseLasarDecisionReply,
  parseLasarModePreviewReply,
  parseLasarReadReply,
  type LasarActorRole,
  type LasarCreateSource,
  type LasarMode,
  type LasarModePreview,
  type LasarReadReply,
  type LasarReviewItem,
} from '@/lib/lasar-contract.ts';
import { addDays, isoWeek, statusLabel, weekday, weekdayNames, type ISODate } from '@/lib/lasar-model.ts';
import MfaStepUpNotice from './mfa-step-up.tsx';

export const yearLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;

// ---------------------------------------------------------------- startval

type StartButton = { source: LasarCreateSource; label: string; primary: boolean; disabled: boolean; help?: string };
export type StartVariant = { heading: string; body: string; buttons: StartButton[] };

/**
 * Tomlägets sex varianter (avsnitt 10). Knappar bara för källor i `canCreate`;
 * i arbetssättet ram utan utgiven ram visas inga knappar alls (D-14).
 */
export function startVariant(read: LasarReadReply, actorRole: LasarActorRole | null, schoolName: string): StartVariant {
  const year = yearLabel(read.schoolYear);
  const previous = yearLabel(read.schoolYear - 1);
  const can = (source: LasarCreateSource) => read.capabilities.canCreate.includes(source);
  const copyButton = (label: string): StartButton[] => (can('copy')
    ? [{ source: 'copy', label, primary: false, disabled: !read.previousYearAvailable, help: read.previousYearAvailable ? undefined : `Det finns ingen kalender för ${previous} att kopiera.` }]
    : []);

  if (read.target.kind === 'frame') {
    return {
      heading: `Ingen ram för ${year}`,
      body: 'Lägg terminer och gemensamma lov- och studiedagar för alla skolor.',
      buttons: [...(can('proposal') ? [{ source: 'proposal' as const, label: 'Skapa ram', primary: true, disabled: false }] : []), ...copyButton('Kopiera förra årets ram')],
    };
  }
  const frameMissing = read.mode === 'ram' && !read.frame?.latest;
  if (frameMissing && actorRole !== 'huvudman') {
    if (actorRole === 'rektor' || actorRole === 'skoladministrator')
      return { heading: 'Ramen saknas', body: `Huvudmannen har inte gett ut ramen för ${year}. Du kan börja när ramen finns.`, buttons: [] };
    return { heading: 'Inget läsår ännu', body: `Ingen kalender är skapad för ${schoolName} ${year}.`, buttons: [] };
  }
  if (!frameMissing && read.mode === 'ram' && can('frame'))
    return {
      heading: 'Inget läsår ännu',
      body: 'Utgå från huvudmannens ram och justera för skolan, eller kopiera förra läsåret. Skillnader mot ramen visas i kalendern.',
      buttons: [{ source: 'frame', label: 'Utgå från huvudmannens ram', primary: true, disabled: false }, ...copyButton('Kopiera förra läsåret')],
    };
  if (read.mode === 'eget' && (can('proposal') || can('copy')))
    return {
      heading: 'Inget läsår ännu',
      body: 'Skapa ett förslag utifrån helgdagarna och vanliga lov, eller utgå från förra läsåret.',
      buttons: [...(can('proposal') ? [{ source: 'proposal' as const, label: 'Skapa förslag', primary: true, disabled: false }] : []), ...copyButton('Kopiera förra läsåret')],
    };
  if (actorRole === 'huvudman')
    return { heading: 'Rektorn har inte påbörjat läsåret', body: 'Kalendern visas här när rektorn har skapat ett förslag.', buttons: [] };
  return { heading: 'Inget läsår ännu', body: `Ingen kalender är skapad för ${schoolName} ${year}.`, buttons: [] };
}

/** Tomläget `admin-empty` med startvalen. Högst en primärknapp. */
export function ProtectedLasarStart({ read, actorRole, schoolName, busy, onCreate }: {
  read: LasarReadReply;
  actorRole: LasarActorRole | null;
  schoolName: string;
  busy: boolean;
  onCreate: (source: LasarCreateSource) => void;
}) {
  const variant = startVariant(read, actorRole, schoolName);
  return (
    <div className="admin-empty ly-start">
      <CalendarCheck size={28} aria-hidden="true" />
      <h2>{variant.heading}</h2>
      <p>{variant.body}</p>
      {variant.buttons.length > 0 && (
        <div className="ly-start-actions">
          {variant.buttons.map((b) => (
            <Button
              key={b.source}
              variant={b.primary ? 'default' : 'outline'}
              disabled={b.disabled || busy}
              aria-describedby={b.help ? `ly-start-help-${b.source}` : undefined}
              onClick={() => onCreate(b.source)}
            >
              {b.label}
            </Button>
          ))}
        </div>
      )}
      {variant.buttons.filter((b) => b.help).map((b) => (
        <p key={b.source} id={`ly-start-help-${b.source}`} className="ly-start-help">{b.help}</p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- granskning efter kopiering

const kindLabel: Record<LasarReviewItem['kind'], string> = { lovdag: 'Lovdag', studiedag: 'Studiedag', termin: 'Terminsgräns', gruppdag: 'Gruppdag', 'kort vecka': 'Kort vecka' };
const edgeLabel = { 'ht:start': 'höstterminen börjar', 'ht:end': 'höstterminen slutar', 'vt:start': 'vårterminen börjar', 'vt:end': 'vårterminen slutar' } as const;

/** Målårets kalenderår för posten: källans ISO-år plus ett läsår. */
function targetYear(item: LasarReviewItem): number | null {
  return item.sourceDate ? isoWeek(item.sourceDate).year + 1 : null;
}

/** ”{Lovdag/Studiedag} · {anteckning} · {veckodag} v.{vecka} {år}” (avsnitt 10). */
export function reviewRowText(item: LasarReviewItem): string {
  const parts = [kindLabel[item.kind]];
  if (item.edge) parts.push(edgeLabel[item.edge]);
  if (item.note) parts.push(item.note);
  if (item.sourceDate) {
    const { week, year } = isoWeek(item.sourceDate);
    parts.push(`${weekdayNames[weekday(item.sourceDate)]} v.${week} ${year}`);
  }
  return parts.join(' · ');
}

/** Skälet med målårets år (avsnitt 10). */
export function reviewReasonText(item: LasarReviewItem, schoolYear: number): string {
  const year = targetYear(item) ?? schoolYear;
  const label = yearLabel(schoolYear);
  switch (item.reason) {
    case 'easter': return `Påsken infaller en annan vecka ${year}.`;
    case 'missing_week': return `Vecka ${item.sourceDate ? isoWeek(item.sourceDate).week : ''} finns inte ${year}.`;
    case 'holiday': return `Dagen blir en allmän helgdag ${year}.`;
    case 'weekend': return `Dagen blir en lördag eller söndag ${year}.`;
    case 'outside_terms': return `Dagen ligger utanför terminerna ${label}.`;
    case 'jullov': return `Dagen hamnar i jullovet ${label}.`;
    case 'term_edge': return `Terminsgränsen hamnar på en helg eller helgdag ${year}.`;
    case 'group_offering_missing': return `Utbildningen eller årskursen finns inte ${label}.`;
    case 'group_class': return `Klassen byter årskurs till ${label}.`;
    case 'short_week': return 'Korta veckor kräver särskilda skäl som prövas för det nya läsåret.';
  }
}

/**
 * Möjliga måldagar för en post: förslaget (påskens avstånd), dagen som ISO-veckan
 * ger, eller samma veckodag 52 veckor senare när veckan saknas i målåret.
 */
export function reviewCandidates(item: LasarReviewItem): ISODate[] {
  const dates = [item.suggestedDate, item.targetDate].filter((d): d is ISODate => Boolean(d));
  if (!dates.length && item.sourceDate) dates.push(addDays(item.sourceDate, 364));
  return [...new Set(dates)];
}

/** Kortet `ly-review-card` (D-04) mellan arbetsflödet och terminerna. */
export function LasarReviewCard({ items, schoolYear, canResolve, busy, onShowWeek, onResolve }: {
  items: LasarReviewItem[];
  schoolYear: number;
  canResolve: boolean;
  busy: boolean;
  onShowWeek: (item: LasarReviewItem) => void;
  onResolve: (item: LasarReviewItem) => void;
}) {
  const open = items.filter((i) => !i.resolved);
  if (!open.length) return null;
  return (
    <section className="ly-review-card" aria-labelledby="ly-review-heading">
      <h3 id="ly-review-heading">Att granska efter kopieringen</h3>
      <p>
        {open.length} {open.length === 1 ? 'dag' : 'dagar'} kunde inte flyttas entydigt från {yearLabel(schoolYear - 1)} och är inte inlagda. Helgdagarna är beräknade för {yearLabel(schoolYear)}.
      </p>
      <ul>
        {open.map((item) => (
          <li key={item.id} className="ly-review-row">
            <span className="ly-review-text">
              <strong>{reviewRowText(item)}</strong>
              <span>{reviewReasonText(item, schoolYear)}</span>
            </span>
            <span className="ly-review-actions">
              {reviewCandidates(item).length > 0 && (
                <Button variant="outline" size="sm" onClick={() => onShowWeek(item)}>Visa veckan</Button>
              )}
              {canResolve && (
                <Button variant="outline" size="sm" disabled={busy} aria-label={`Klar: ${reviewRowText(item)}`} onClick={() => onResolve(item)}>Klar</Button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ---------------------------------------------------------------- arbetssätt (D-01, D-15)

const MODE_TEXT: Record<LasarMode, { label: string; text: string }> = {
  ram: { label: 'Huvudmannens ram', text: 'Du lägger terminer och gemensamma lov- och studiedagar för alla skolor. Rektorerna justerar för sin skola.' },
  eget: { label: 'Eget förslag per skola', text: 'Varje rektor får ett förslag ur helgdagar och vanliga lov.' },
};
const isAbort = (caught: unknown) => caught instanceof DOMException && caught.name === 'AbortError';

/**
 * Kortet ”Arbetssätt för läsåret {läsår}” när huvudmannen har valt Alla behöriga
 * skolor (avsnitt 11). Läser ramens mål för `mode`, `modeLocked` och `canSetMode`.
 * Plan 12 monterar kortet i vyn; här provas det i fixturen.
 */
export function ProtectedLasarModeCard({ schoolYear, onSessionLost }: { schoolYear: number; onSessionLost: () => void }) {
  const [phase, setPhase] = useState<'loading' | 'error' | 'ready'>('loading');
  const [read, setRead] = useState<LasarReadReply | null>(null);
  const [chosen, setChosen] = useState<LasarMode | null>(null);
  const [preview, setPreview] = useState<LasarModePreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [mfa, setMfa] = useState(false);
  const [notice, setNotice] = useState('');
  const keep = useRef<HTMLButtonElement>(null);
  const lost = useRef(onSessionLost);
  useEffect(() => { lost.current = onSessionLost; });
  const label = yearLabel(schoolYear);

  const load = useCallback(async () => {
    const request = { target: { kind: 'frame' as const }, schoolYear, versionId: null };
    try {
      const reply = parseLasarReadReply(await api.post<unknown>('/api/lasar/lasa', request), request);
      setRead(reply);
      setChosen(reply.mode);
      setPhase('ready');
    } catch (caught) {
      if (isAbort(caught)) return;
      if (caught instanceof ApiError && caught.status === 401) { lost.current(); return; }
      setPhase('error');
    }
  }, [schoolYear]);
  useEffect(() => {
    let active = true;
    queueMicrotask(() => { if (active) void load(); });
    return () => { active = false; };
  }, [load]);

  function fail(caught: unknown, action: 'preview_mode_change' | 'set_mode') {
    if (isAbort(caught)) return;
    if (caught instanceof ApiError) {
      if (caught.status === 401) { lost.current(); return; }
      if (caught.code === 'mfa_required') { setMfa(true); setError(''); return; }
      if (isLasarReason(caught.reason)) { setError(lasarErrorText(caught.reason, { schoolYear, action })); return; }
    }
    setError(LASAR_GENERIC_TEXT.replace('Kalendern har lästs om.', 'Arbetssättet är oförändrat.'));
  }

  /** Steg 1: serverns förhandsvisning listar skolor med påbörjade kalendrar. Inget sparas. */
  async function ask() {
    if (!read || !chosen || chosen === read.mode || busy) return;
    setBusy(true); setError(''); setMfa(false); setNotice('');
    try {
      const request = lasarDecisionRequest({ target: { kind: 'frame' }, schoolYear, versionId: null, expectedRevision: null, action: 'preview_mode_change', text: '', mode: chosen });
      const reply = parseLasarModePreviewReply(await api.post<unknown>('/api/lasar/beslut', request));
      if (reply.schoolYear !== schoolYear || reply.mode !== chosen) { setError(LASAR_GENERIC_TEXT); return; }
      setPreview(reply);
    } catch (caught) {
      fail(caught, 'preview_mode_change');
    } finally {
      setBusy(false);
    }
  }

  /** Steg 2: bara efter bekräftelse, med exakt de skolor som förhandsvisningen gav. */
  async function confirm() {
    if (!preview || busy) return;
    setBusy(true);
    try {
      const request = lasarDecisionRequest({
        target: { kind: 'frame' }, schoolYear, versionId: null, expectedRevision: null, action: 'set_mode', text: '',
        mode: preview.mode, confirmAffected: preview.affected.map((a) => a.unitId),
      });
      const reply = parseLasarDecisionReply(await api.post<unknown>('/api/lasar/beslut', request), request);
      setRead(reply.detail);
      setChosen(reply.detail.mode);
      setPreview(null);
      setNotice(`Arbetssättet för ${label} är sparat: ${MODE_TEXT[reply.detail.mode].label.toLocaleLowerCase('sv')}.`);
    } catch (caught) {
      setPreview(null);
      fail(caught, 'set_mode');
    } finally {
      setBusy(false);
    }
  }

  const locked = Boolean(read?.modeLocked);
  const canSet = Boolean(read?.capabilities.canSetMode) && !locked;
  return (
    <section className="og-card ly-mode-card" aria-labelledby="ly-mode-heading" aria-busy={phase === 'loading'}>
      <div className="section-heading">
        <h3 id="ly-mode-heading">Arbetssätt för läsåret {label}</h3>
      </div>
      {phase === 'loading' && <p className="cell-secondary"><Spinner className="size-4" aria-hidden="true" /> Läser arbetssättet…</p>}
      {phase === 'error' && (
        <div className="validation-warning tp-inline-error">
          <p><AlertTriangle size={16} /><span>Arbetssättet kunde inte läsas. Kontrollera anslutningen och försök igen.</span></p>
          <Button variant="outline" onClick={() => { setPhase('loading'); void load(); }}>Försök igen</Button>
        </div>
      )}
      {phase === 'ready' && read && chosen && (
        <>
          {notice && (
            <output className="admin-notice">
              <CheckCheck size={17} aria-hidden="true" />
              <span>{notice}</span>
              <button type="button" aria-label="Stäng meddelandet" onClick={() => setNotice('')}><X size={16} aria-hidden="true" /></button>
            </output>
          )}
          <RadioGroup value={chosen} onValueChange={(value) => setChosen(value as LasarMode)} disabled={!canSet} aria-labelledby="ly-mode-heading">
            {(['ram', 'eget'] as const).map((mode) => (
              <label key={mode} className="ly-mode-option" htmlFor={`ly-mode-${mode}`}>
                <RadioGroupItem id={`ly-mode-${mode}`} value={mode} aria-describedby={`ly-mode-${mode}-text`} />
                <span>
                  <strong>{MODE_TEXT[mode].label}</strong>
                  <span id={`ly-mode-${mode}-text`} className="cell-secondary">{MODE_TEXT[mode].text}</span>
                </span>
              </label>
            ))}
          </RadioGroup>
          {locked && <p className="ly-mode-locked">Läsåret {label} har börjat. Arbetssättet kan inte ändras.</p>}
          {error && <div className="validation-warning tp-inline-error"><p><AlertTriangle size={16} /><span>{error}</span></p></div>}
          {mfa && <MfaStepUpNotice className="tp-inline-error" message="Verifiering med engångskod krävs." detail="Arbetssättet är oförändrat. Om du väljer verifiering lämnar du sidan." returnTo="/?vy=lasar" />}
          {canSet && (
            <div className="ly-mode-actions">
              <Button disabled={busy || chosen === read.mode} onClick={() => void ask()}>Spara arbetssätt</Button>
            </div>
          )}
        </>
      )}
      <AlertDialog open={preview !== null} onOpenChange={(open) => { if (!open) setPreview(null); }}>
        <AlertDialogContent className="admin-dialog protected-lasar-dialog ly-list-dialog" initialFocus={keep}>
          {preview && (
            <>
              <AlertDialogTitle>Byt arbetssätt för {label}?</AlertDialogTitle>
              <AlertDialogDescription>
                Kalendrar som skolorna redan har påbörjat ligger kvar som de är. Nya kalendrar skapas enligt det nya arbetssättet.
              </AlertDialogDescription>
              {preview.affected.length ? (
                <>
                  <p className="field-label">Skolor med påbörjade kalendrar ({preview.affected.length})</p>
                  <ul className="ly-dialog-list" aria-label="Skolor som påverkas">
                    {preview.affected.map((a) => (
                      <li key={a.unitId}><span>{a.schoolName}</span><small>{statusLabel[lasarModelStatus(a.status)]}</small></li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="cell-secondary">Ingen skola har påbörjat en kalender för {label}.</p>
              )}
              <div className="dialog-actions">
                <AlertDialogCancel ref={keep} variant="outline">Behåll arbetssättet</AlertDialogCancel>
                <Button disabled={busy} onClick={() => void confirm()}>Byt arbetssätt</Button>
              </div>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
