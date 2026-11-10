// Syntetisk förhandsvisning av Läsår & skoldagar i skyddad drift (05.1.1-03 och 04).
// Ingen databas, ingen server och ingen inloggning: /api/lasar/lasa,
// /api/lasar/kommando och /api/lasar/beslut besvaras av en mock i webbläsaren
// som använder kontraktets tolkar. Förmågorna räknas här som en grov
// efterbildning av serverns regler; de bevisar inte behörighet (det gör SQL-
// och Worker/OIDC-proven i plan 06–07). Syntetisk skola och syntetiska namn,
// inga personuppgifter. Simulerat komponentprov, inte faktiskt prov.
//
// URL-parametrar:
//   roll=rektor|huvudman|lasare|admin   (lasare och admin saknar förmågor)
//   status=utkast|forslag|atersand|faststalld   status för senaste versionen
//   version=2   version 1 är fastställd och gäller, version 2 har `status`
//   begaran=open|declined   ändringsbegäran på den fastställda versionen
//   passerade=1   läsåret har börjat: editableFrom = 2026-11-09 (D-12)
//   fel=konflikt|osaker|403|mfa|regler|passerad   nästa skrivning nekas så
//   vy=demo   demovyn LasarView med samma syntetiska läsår för jämförelse
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedLasarWorkspace from '../../app/protected-lasar-workspace';
import LasarView from '../../app/lasar-view';
import {
  parseLasarCommandReply,
  parseLasarDecisionReply,
  parseLasarDecisionRequest,
  parseLasarReadReply,
  parseLasarReadRequest,
  verifyLasarCommandHash,
  LasarContractError,
  type LasarActorRole,
  type LasarChangeRequest,
  type LasarDbStatus,
  type LasarReadReply,
} from '../../lib/lasar-contract';
import { proposeSchoolYear, type Exception, type GroupException, type LasarState, type ShortWeek } from '../../lib/lasar-model';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import '../../app/globals.css';

const tid = (n: number) => `51a50000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const params = new URLSearchParams(location.search);
const UNIT = tid(3), YEAR = 2026, SCHOOL = 'Syntetiska grundskolan', TYPES = ['GR'];
const HASH = `sha256:${'0'.repeat(64)}`;
let role = (params.get('roll') ?? 'rektor') as 'rektor' | 'huvudman' | 'lasare' | 'admin';
const startStatus = (params.get('status') ?? 'utkast') as LasarDbStatus;
const editableFrom = params.get('passerade') === '1' ? '2026-11-09' : null;
let fault = params.get('fel');

type Version = {
  versionId: string; version: number; status: LasarDbStatus; decidedOn: string | null; revision: number;
  terms: { ht: { start: string; end: string }; vt: { start: string; end: string } };
  exceptions: Record<string, Exception>; groupDays: Record<string, Record<string, GroupException>>; shortWeeks: Record<string, ShortWeek>;
  history: { id: string; role: LasarActorRole; actorName: string; at: string; action: string; comment: string; version: number }[];
};
const proposal = proposeSchoolYear(YEAR, UNIT, TYPES);
let ids = 900;
const names: Record<LasarActorRole, string> = { rektor: 'Syntetisk rektor', skoladministrator: 'Syntetisk administratör', huvudman: 'Syntetisk huvudman' };
function entry(v: Version, who: LasarActorRole, action: string, comment: string, at = new Date().toISOString()) {
  v.history.unshift({ id: tid(++ids), role: who, actorName: names[who], at, action, comment, version: v.version });
}
function makeVersion(n: number, status: LasarDbStatus, from?: Version): Version {
  const v: Version = {
    versionId: tid(100 + n), version: n, status, decidedOn: status === 'faststalld' ? '2026-03-18' : null, revision: 3,
    terms: structuredClone(from?.terms ?? { ht: proposal.ht, vt: proposal.vt }),
    exceptions: structuredClone(from?.exceptions ?? proposal.exceptions), groupDays: {}, shortWeeks: {}, history: [],
  };
  entry(v, 'rektor', 'Förslag skapat', 'Terminer, helgdagar och vanliga lov föreslagna.', '2026-09-04T08:00:00.000Z');
  if (status === 'faststalld') entry(v, 'huvudman', 'Fastställd', 'Fastställd av syntetisk nämnd.', '2026-03-18T09:00:00.000Z');
  return v;
}
const versions: Version[] = params.get('version') === '2'
  ? [makeVersion(1, 'faststalld'), makeVersion(2, startStatus)]
  : [makeVersion(1, startStatus)];
const begaran = params.get('begaran');
let changeRequest: LasarChangeRequest | null = begaran === 'open' || begaran === 'declined'
  ? { id: tid(701), status: begaran, reason: 'Ny studiedag i mars för syntetisk fortbildning.', answer: begaran === 'declined' ? 'Studiedagarna är redan fem.' : null,
    requestedAt: '2026-10-01T09:00:00.000Z', answeredAt: begaran === 'declined' ? '2026-10-02T09:00:00.000Z' : null }
  : null;
const latest = () => versions[versions.length - 1];

function capabilities(v: Version) {
  const r = role === 'rektor', h = role === 'huvudman', last = v === latest();
  const editable = r && last && (v.status === 'utkast' || v.status === 'atersand');
  const fixed = last && v.status === 'faststalld', open = changeRequest?.status === 'open';
  return {
    canEdit: editable, canSubmit: editable, canWithdraw: r && last && v.status === 'forslag', canRequestChange: r && fixed && !open,
    canWithdrawRequest: r && fixed && open, canReturn: h && last && v.status === 'forslag', canApprove: h && last && v.status === 'forslag',
    canReopen: h && fixed, canDecline: h && fixed && open, canComment: r || h, canCreate: [], canPublishFrame: false, canSetMode: false,
  };
}
function readReply(versionId: string | null): LasarReadReply {
  const v = versions.find((x) => x.versionId === versionId) ?? latest();
  const current = [...versions].reverse().find((x) => x.status === 'faststalld');
  return parseLasarReadReply(structuredClone({
    contractVersion: 'lasar_sql_v1', target: { kind: 'school', unitId: UNIT }, schoolYear: YEAR, schoolName: SCHOOL, schoolTypes: TYPES,
    mode: 'eget', modeLocked: editableFrom !== null,
    versions: versions.map((x) => ({ versionId: x.versionId, version: x.version, status: x.status, decidedOn: x.decidedOn, current: x === current })),
    calendar: {
      versionId: v.versionId, version: v.version, status: v.status, revision: v.revision, terms: v.terms, exceptions: v.exceptions,
      groupDays: v.groupDays, shortWeeks: v.shortWeeks, frameVersionId: null, contentHash: HASH, decidedOn: v.decidedOn, history: v.history,
    },
    capabilities: capabilities(v), editableFrom, changeRequest, review: [], frame: null, groups: [],
    teaching: { classes: [], imClassIds: [] }, previousYearAvailable: false,
  }));
}

type Logged = { path: string; body: unknown };
const control = { commands: [] as Logged[], decisions: [] as Logged[], reads: [] as Logged[], revision: () => latest().revision, versions: () => versions.length };
declare global { interface Window { __lasar: typeof control } }
window.__lasar = control;

type Reply = { status: number; json: unknown };
const error = (status: number, code: string, reason?: string, rules?: string[]): Reply =>
  ({ status, json: reason ? { code, details: rules ? { reason, rules } : { reason } } : { code } });
const who = (): LasarActorRole => (role === 'huvudman' ? 'huvudman' : 'rektor');
function takeFault(kinds: string[]): string | null {
  if (!fault || !kinds.includes(fault)) return null;
  const f = fault; fault = null; return f;
}

async function route(path: string, body: unknown): Promise<Reply> {
  try {
    if (path === '/api/lasar/lasa') {
      const q = parseLasarReadRequest(body);
      control.reads.push({ path, body: structuredClone(body) });
      if (q.target.kind !== 'school' || q.target.unitId !== UNIT || q.schoolYear !== YEAR) return error(403, 'forbidden');
      return { status: 200, json: readReply(q.versionId) };
    }
    if (path === '/api/lasar/kommando') {
      control.commands.push({ path, body: structuredClone(body) });
      const q = await verifyLasarCommandHash(body);
      const v = versions.find((x) => x.versionId === q.versionId);
      if (q.target.kind !== 'school' || q.target.unitId !== UNIT || q.schoolYear !== YEAR || !v) return error(403, 'forbidden');
      const f = takeFault(['konflikt', 'osaker', '403', 'passerad']);
      if (f === '403') { role = 'lasare'; return error(403, 'forbidden'); }
      if (f === 'passerad') return error(409, 'conflict', 'lasar_past_day');
      if (f === 'konflikt') {
        // En annan session hinner före: dagen ändras och revisionen räknas upp.
        v.exceptions['2026-11-20'] = { kind: 'lovdag', note: 'Ändrad i annan session' };
        v.revision += 1;
      }
      const caps = capabilities(v);
      const comment = q.ops[0].op === 'comment';
      if (comment ? !caps.canComment : !caps.canEdit) return error(403, 'forbidden');
      if (q.expectedRevision !== v.revision) return error(409, 'conflict', 'lasar_revision_conflict');
      for (const op of q.ops) {
        if ('dates' in op && editableFrom && op.dates.some((d) => d < editableFrom)) return error(409, 'conflict', 'lasar_past_day');
        if (op.op === 'set_days') for (const d of op.dates) {
          if (op.kind === 'skoldag') delete v.exceptions[d];
          else v.exceptions[d] = op.note === undefined ? { kind: op.kind } : { kind: op.kind, note: op.note };
        }
        else if (op.op === 'set_notes') for (const d of op.dates) {
          const e = v.exceptions[d];
          if (!e) return error(400, 'bad_request');
          v.exceptions[d] = op.note === undefined ? { kind: e.kind } : { kind: e.kind, note: op.note };
        }
        else if (op.op === 'set_term') {
          if (editableFrom && (op.date < editableFrom || v.terms[op.term][op.edge] < editableFrom)) return error(409, 'conflict', 'lasar_past_day');
          v.terms[op.term][op.edge] = op.date;
          for (const d of Object.keys(v.exceptions)) if (d < v.terms.ht.start || d > v.terms.vt.end || (d > v.terms.ht.end && d < v.terms.vt.start)) delete v.exceptions[d];
        }
        else if (op.op === 'reset_to_proposal') { v.terms = structuredClone({ ht: proposal.ht, vt: proposal.vt }); v.exceptions = structuredClone(proposal.exceptions); entry(v, who(), 'Förslag återställt', 'Terminer och lov enligt förslaget utifrån helgdagarna.'); }
        else if (op.op === 'comment') entry(v, who(), 'Kommentar', op.text);
        else return error(400, 'bad_request');
      }
      v.revision += 1;
      if (f === 'osaker') return { status: 502, json: { code: 'internal_error' } };
      return { status: 200, json: parseLasarCommandReply({ receipt: { commandId: q.commandId, revision: v.revision, replayed: false }, detail: readReply(v.versionId) }, q) };
    }
    if (path === '/api/lasar/beslut') {
      control.decisions.push({ path, body: structuredClone(body) });
      const q = parseLasarDecisionRequest(body);
      const v = versions.find((x) => x.versionId === q.versionId);
      if (!v || q.target.kind !== 'school' || q.target.unitId !== UNIT) return error(403, 'forbidden');
      const f = takeFault(['mfa', 'regler']);
      if (f === 'mfa') return error(403, 'mfa_required');
      if (f === 'regler' && (q.action === 'submit' || q.action === 'approve')) return error(409, 'conflict', 'lasar_rules_failed', ['school_days_min']);
      if (q.expectedRevision !== v.revision) return error(409, 'conflict', 'lasar_revision_conflict');
      const caps = capabilities(v);
      const now = new Date().toISOString();
      let result = v;
      switch (q.action) {
        case 'submit': if (!caps.canSubmit) return error(403, 'forbidden'); v.status = 'forslag'; entry(v, 'rektor', 'Förslag skickat', q.text); break;
        case 'withdraw': if (!caps.canWithdraw) return error(403, 'forbidden'); v.status = 'utkast'; entry(v, 'rektor', 'Förslag återtaget', 'Förslaget togs tillbaka för fortsatt arbete.'); break;
        case 'return': if (!caps.canReturn) return error(403, 'forbidden'); v.status = 'atersand'; entry(v, 'huvudman', 'Återsänd för ändring', q.text); break;
        case 'approve': if (!caps.canApprove) return error(403, 'forbidden'); v.status = 'faststalld'; v.decidedOn = '2026-11-10'; entry(v, 'huvudman', 'Fastställd', q.text); break;
        case 'request_change': if (!caps.canRequestChange) return error(403, 'forbidden'); changeRequest = { id: tid(++ids), status: 'open', reason: q.text, answer: null, requestedAt: now, answeredAt: null }; entry(v, 'rektor', 'Ändring begärd', q.text); break;
        case 'withdraw_request': if (!caps.canWithdrawRequest || !changeRequest) return error(403, 'forbidden'); changeRequest = { ...changeRequest, status: 'withdrawn', answeredAt: now }; entry(v, 'rektor', 'Begäran återtagen', ''); break;
        case 'decline_request': if (!caps.canDecline || !changeRequest) return error(403, 'forbidden'); changeRequest = { ...changeRequest, status: 'declined', answer: q.text, answeredAt: now }; entry(v, 'huvudman', 'Begäran avslagen', q.text); break;
        case 'reopen': {
          if (!caps.canReopen) return error(403, 'forbidden');
          if (changeRequest?.status === 'open') changeRequest = { ...changeRequest, status: 'accepted', answeredAt: now };
          result = { ...makeVersion(v.version + 1, 'utkast', v), revision: 1, history: [] };
          entry(result, 'huvudman', 'Öppnat för ändring', q.text);
          versions.push(result);
          break;
        }
        default: return error(400, 'bad_request');
      }
      if (result === v) v.revision += 1;
      return { status: 200, json: parseLasarDecisionReply({ receipt: { commandId: q.commandId, revision: result.revision, replayed: false }, detail: readReply(result.versionId) }, q) };
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
        : <ProtectedLasarWorkspace unitId={UNIT} schoolName={params.get('skola') ?? SCHOOL} schoolYear={YEAR} schoolTypes={TYPES} onSessionLost={() => undefined} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness /></UnsavedChangesProvider>);
