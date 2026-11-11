'use client';
// Kalenderstatus per skola (fas 05.1.1, plan 12; D-09, UI-SPEC avsnitt 13 och 14).
// Läser POST /api/lasar/oversikt i en egen väg med kontraktets tolk. Läsårsöverblickens
// läsning (/api/planering/oversikt) och dess tolk ändras inte (Pitfall 7). Samma lista
// visas i Läsårsöverblick och i Läsår & skoldagar när Alla behöriga skolor är valt.
// Servern väljer skolorna ur aktörens aktuella uppdrag; klienten filtrerar bara på vald
// skola och sorterar det som väntar på aktuell roll först. Status bärs av text.
import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { api } from '@/lib/server-client.ts';
import {
  parseLasarOverviewReply,
  type LasarActorRole,
  type LasarDbStatus,
  type LasarOverviewReply,
  type LasarOverviewSchool,
  type LasarVersionRef,
} from '@/lib/lasar-contract.ts';
import { formatDate } from '@/lib/lasar-model.ts';
import './protected-lasar.css';

/** Vad *Öppna kalendern* öppnar: en skola eller huvudmannens ram, för ett läsår. */
export type LasarOpenTarget = { unitId: string | null; frame: boolean; schoolYear: number };
export type LasarOverviewLinks = {
  /** Sessionens uppdrag. Utan roll visas inget, eftersom läsvägen bara gäller huvudman, rektor och skoladministratör. */
  actorRole: LasarActorRole | null;
  onOpen: (target: LasarOpenTarget) => void;
  /** Sant om skalet har hanterat felet (förlorad session eller förlorat mandat). */
  onSecurityFailure: (error: unknown) => boolean;
};
/** Skalet (protected-home) ger rollen och navigeringen till Läsårsöverblick utan nya props genom överblicken. */
export const LasarOverviewContext = createContext<LasarOverviewLinks | null>(null);

type Props = Partial<LasarOverviewLinks> & {
  schoolYear: number;
  /** Vald skola i planeringsvalet; null betyder Alla behöriga skolor. */
  unitId?: string | null;
  /** Ökas av den som vet att statusen har ändrats, till exempel efter byte av arbetssätt. */
  reload?: number;
};
type State = { key: string; data: LasarOverviewReply | null; error: boolean };

const yearLabel = (startYear: number) => `${startYear}/${String(startYear + 1).slice(2)}`;
const STATUS: Record<LasarDbStatus, { label: string; className: string }> = {
  utkast: { label: 'Utkast', className: 'utkast' },
  forslag: { label: 'Förslag', className: 'förslag' },
  atersand: { label: 'Återsänd', className: 'återsänd' },
  faststalld: { label: 'Fastställd', className: 'fastställd' },
};
const NOT_STARTED = { label: 'Inte påbörjad', className: 'none' };
const FRAME_NAME = 'Huvudmannens ram';

/** Versionstexten: ”Version {n} · fastställd {datum}” eller ”Version {n+1} pågår · version {n} gäller”. */
export function lasarVersionText(versions: LasarVersionRef[]): string | null {
  const current = versions.find((v) => v.current);
  const latest = versions.at(-1);
  if (!latest) return null;
  if (current && latest.versionId !== current.versionId) return `Version ${latest.version} pågår · version ${current.version} gäller`;
  if (current?.decidedOn) return `Version ${current.version} · fastställd ${formatDate(current.decidedOn, true)}`;
  return `Version ${latest.version}`;
}

/** Sortering (avsnitt 14): först det som väntar på aktuell roll, sedan skolans namn. */
export function sortLasarOverview(schools: LasarOverviewSchool[], role: LasarActorRole | null): LasarOverviewSchool[] {
  const mine = role === 'huvudman' ? 'huvudman' : role ? 'rektor' : null;
  return [...schools].sort((a, b) =>
    Number(b.waitingFor !== null && b.waitingFor === mine) - Number(a.waitingFor !== null && a.waitingFor === mine)
    || a.schoolName.localeCompare(b.schoolName, 'sv'));
}

function Row({ name, status, version, markers, openLabel, onOpen }: {
  name: string;
  status: { label: string; className: string };
  version: string | null;
  markers: string[];
  openLabel: string | null;
  onOpen: () => void;
}) {
  return (
    <li className="ly-overview-row">
      <div className="ly-overview-main">
        <h3 className="ly-overview-name">{name}</h3>
        <div className="ly-overview-facts">
          <span className={`tp-status tp-status-${status.className}`}>{status.label}</span>
          {version && <span className="ly-overview-version">{version}</span>}
          {markers.map((m) => <span key={m} className="a-status amber"><span aria-hidden="true" />{m}</span>)}
        </div>
      </div>
      {openLabel && <Button variant="outline" className="ly-overview-open" aria-label={openLabel} onClick={onOpen}>Öppna kalendern</Button>}
    </li>
  );
}

export default function ProtectedLasarOverview(props: Props) {
  const links = useContext(LasarOverviewContext);
  const actorRole = props.actorRole !== undefined ? props.actorRole : links?.actorRole ?? null;
  const onOpen = props.onOpen ?? links?.onOpen;
  const { schoolYear, unitId = null, reload = 0 } = props;
  const [retry, setRetry] = useState(0);
  const key = `${schoolYear}|${reload}|${retry}`;
  const [state, setState] = useState<State>({ key: '', data: null, error: false });
  const security = useRef(props.onSecurityFailure ?? links?.onSecurityFailure);
  useLayoutEffect(() => { security.current = props.onSecurityFailure ?? links?.onSecurityFailure; });

  useEffect(() => {
    if (!actorRole) return;
    const controller = new AbortController();
    const request = { schoolYear };
    void api.post<unknown>('/api/lasar/oversikt', request, controller.signal).then((raw) => {
      const data = parseLasarOverviewReply(raw, request);
      if (!controller.signal.aborted) setState({ key, data, error: false });
    }).catch((caught) => {
      if (controller.signal.aborted || (caught instanceof DOMException && caught.name === 'AbortError')) return;
      if (security.current?.(caught)) return;
      setState({ key, data: null, error: true });
    });
    return () => controller.abort();
  }, [actorRole, schoolYear, key]);

  if (!actorRole) return null;
  const label = yearLabel(schoolYear);
  const visible = state.key === key ? state : null;
  const data = visible?.data ?? null;
  const loading = !visible;
  const schools = data ? sortLasarOverview(data.schools.filter((s) => unitId === null || s.unitId === unitId), actorRole) : [];
  const waiting = schools.filter((s) => s.waitingFor === 'huvudman').length;
  const showFrame = Boolean(data && unitId === null && data.mode === 'ram' && (data.frame || actorRole === 'huvudman'));
  const open = (target: Omit<LasarOpenTarget, 'schoolYear'>) => onOpen?.({ ...target, schoolYear });

  return (
    <section className="planning-overview-calendar ly-overview" aria-label={`Läsårskalender ${label}`} aria-busy={loading}>
      <div className="ly-overview-heading">
        <h2>Läsårskalender {label}</h2>
        <p>Status för varje skolas kalender. Öppna en skola för att arbeta med dagarna.</p>
        {data && actorRole === 'huvudman' && (
          <p className="ly-overview-summary">{waiting ? `${waiting} väntar på ditt beslut` : 'Inga kalendrar väntar på beslut.'}</p>
        )}
      </div>
      {loading && <output className="ly-overview-state"><Spinner className="size-4" aria-hidden="true" /> Läser kalenderstatus…</output>}
      {visible?.error && (
        <div className="ly-overview-error" role="alert">
          <p>Kalenderstatus kunde inte läsas. Försök igen.</p>
          <Button variant="outline" className="ly-overview-open" onClick={() => setRetry((n) => n + 1)}>Läs om</Button>
        </div>
      )}
      {data && (showFrame || schools.length > 0) && (
        <ul className="ly-overview-list">
          {showFrame && (
            <Row
              name={FRAME_NAME}
              status={data.frame ? (data.frame.status === 'utgiven' ? { label: 'Utgiven', className: 'fastställd' } : { label: 'Utkast', className: 'utkast' }) : NOT_STARTED}
              version={data.frame ? `Version ${data.frame.version}` : null}
              markers={[]}
              openLabel={actorRole === 'huvudman' && onOpen ? `Öppna läsårskalendern för ${FRAME_NAME}` : null}
              onOpen={() => open({ unitId: null, frame: true })}
            />
          )}
          {schools.map((s) => (
            <Row
              key={s.unitId}
              name={s.schoolName}
              status={s.status ? STATUS[s.status] : NOT_STARTED}
              version={lasarVersionText(s.versions)}
              markers={[...(s.frameChanged ? ['Ramen har ändrats'] : []), ...(s.changeRequested ? ['Ändring begärd'] : [])]}
              openLabel={onOpen ? `Öppna läsårskalendern för ${s.schoolName}` : null}
              onOpen={() => open({ unitId: s.unitId, frame: false })}
            />
          ))}
        </ul>
      )}
      {data && schools.length === 0 && <p className="ly-overview-empty">Ingen skola i urvalet har en läsårskalender för {label}.</p>}
    </section>
  );
}
