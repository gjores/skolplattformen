// Syntetisk förhandsvisning av Läsår & skoldagar i skyddad drift (05.1.1-03).
// Ingen databas, ingen server och ingen inloggning: /api/lasar/lasa och
// /api/lasar/kommando besvaras av en mock i webbläsaren som använder
// kontraktets tolkar. Syntetisk skola utan personuppgifter. Simulerat
// komponentprov, inte faktiskt prov mot en installerad miljö.
//
// URL-parametrar: ?roll=lasare ger läsläge (canEdit false); ?vy=demo
// renderar demovyn LasarView med samma syntetiska läsår för jämförelse.
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedLasarWorkspace from '../../app/protected-lasar-workspace';
import LasarView from '../../app/lasar-view';
import {
  lasarDbStatus,
  parseLasarCommandReply,
  parseLasarReadReply,
  parseLasarReadRequest,
  verifyLasarCommandHash,
  LasarContractError,
  type LasarReadReply,
} from '../../lib/lasar-contract';
import { proposeSchoolYear, type LasarState } from '../../lib/lasar-model';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import '../../app/globals.css';

const tid = (n: number) => `51a50000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const params = new URLSearchParams(location.search);
const UNIT = tid(3), YEAR = 2026, VERSION = tid(101), SCHOOL = 'Syntetiska grundskolan', TYPES = ['GR'];
const canEdit = params.get('roll') !== 'lasare';

const proposal = proposeSchoolYear(YEAR, UNIT, TYPES);
const calendar = {
  versionId: VERSION,
  version: 1,
  status: lasarDbStatus(proposal.status),
  revision: 3,
  terms: { ht: { ...proposal.ht }, vt: { ...proposal.vt } },
  exceptions: structuredClone(proposal.exceptions),
  history: [{ id: tid(201), role: 'rektor' as const, at: '2026-09-04T08:00:00.000Z', action: 'Förslag skapat', comment: 'Terminer, helgdagar och vanliga lov föreslagna.' }],
};
const readReply = (): LasarReadReply => parseLasarReadReply(structuredClone({
  contractVersion: 'lasar_sql_v1', unitId: UNIT, schoolYear: YEAR, calendar, capabilities: { canEdit },
}));

type Logged = { path: string; body: unknown };
const control = { commands: [] as Logged[], reads: [] as Logged[], revision: () => calendar.revision };
declare global { interface Window { __lasar: typeof control } }
window.__lasar = control;

type Reply = { status: number; json: unknown };
const error = (status: number, code: string): Reply => ({ status, json: { code } });

async function route(path: string, body: unknown): Promise<Reply> {
  try {
    if (path === '/api/lasar/lasa') {
      const q = parseLasarReadRequest(body);
      control.reads.push({ path, body: structuredClone(body) });
      if (q.unitId !== UNIT || q.schoolYear !== YEAR) return error(403, 'forbidden');
      return { status: 200, json: readReply() };
    }
    if (path === '/api/lasar/kommando') {
      control.commands.push({ path, body: structuredClone(body) });
      const q = await verifyLasarCommandHash(body);
      if (!canEdit || q.unitId !== UNIT || q.schoolYear !== YEAR || q.versionId !== VERSION) return error(403, 'forbidden');
      if (q.expectedRevision !== calendar.revision) return error(409, 'conflict');
      for (const op of q.ops) {
        for (const date of op.dates) {
          if (op.kind === 'skoldag') delete calendar.exceptions[date];
          else calendar.exceptions[date] = op.note === undefined ? { kind: op.kind } : { kind: op.kind, note: op.note };
        }
      }
      calendar.revision += 1;
      return { status: 200, json: parseLasarCommandReply({ receipt: { commandId: q.commandId, revision: calendar.revision, replayed: false }, detail: readReply() }, q) };
    }
    return error(404, 'not_found');
  } catch (caught) {
    if (caught instanceof LasarContractError) return error(400, 'bad_request');
    throw caught;
  }
}

const realFetch = window.fetch.bind(window);
window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url, location.href);
  if (!url.pathname.startsWith('/api/lasar/')) return realFetch(input, init);
  const reply = await route(url.pathname, JSON.parse(typeof init?.body === 'string' ? init.body : '{}'));
  return new Response(JSON.stringify(reply.json), { status: reply.status, headers: { 'Content-Type': 'application/json' } });
};

/** Demovyn med samma syntetiska läsår, för jämförelse av kalender och teckenförklaring. */
function Demo() {
  const [state, setState] = useState<LasarState>({ role: 'rektor', years: [structuredClone(proposal)] });
  const [message, setMessage] = useState('');
  return (
    <LasarView
      state={state}
      apply={(fn) => { try { setState(fn(state)); return true; } catch (e) { setMessage(e instanceof Error ? e.message : ''); return false; } }}
      unitId={UNIT}
      unitName={SCHOOL}
      schoolTypes={TYPES}
      timplans={{ role: 'rektor', educations: [], plans: [] }}
      classes={[]}
      error={message}
      clearError={() => setMessage('')}
    />
  );
}

function Harness() {
  return (
    <main id="workspace" lang="sv" className="workspace is-admin">
      {params.get('vy') === 'demo'
        ? <Demo />
        : <ProtectedLasarWorkspace unitId={UNIT} schoolName={SCHOOL} schoolYear={YEAR} schoolTypes={TYPES} onSessionLost={() => undefined} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness /></UnsavedChangesProvider>);
