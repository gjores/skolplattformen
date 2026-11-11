// Syntetisk förhandsvisning av Läsår & skoldagar i skyddad drift (05.1.1-03–05).
// Ingen databas, ingen server och ingen inloggning: /api/lasar/lasa,
// /api/lasar/kommando och /api/lasar/beslut besvaras av en mock i webbläsaren
// som använder kontraktets tolkar. Förmågorna räknas här som en grov
// efterbildning av serverns regler; de bevisar inte behörighet (det gör SQL-
// och Worker/OIDC-proven i plan 06–11). Syntetisk skola och syntetiska namn,
// inga personuppgifter och inga elevantal. Simulerat komponentprov, inte faktiskt prov.
//
// URL-parametrar:
//   roll=rektor|huvudman|lasare|admin   (lasare och admin saknar förmågor)
//   status=utkast|forslag|atersand|faststalld   status för senaste versionen
//   version=2   version 1 är fastställd och gäller, version 2 har `status`
//   begaran=open|declined   ändringsbegäran på den fastställda versionen
//   passerade=1   läsåret har börjat: editableFrom = 2026-11-09 (D-12)
//   fel=konflikt|osaker|403|mfa|regler|passerad   nästa skrivning nekas så
//   vy=demo   demovyn LasarView med samma syntetiska läsår för jämförelse
//   vy=arbetssatt   kortet Arbetssätt för läsåret (D-01, D-15)
//   ar=2027   läsårets startår (standard 2026); 2027 ger vecka 53 i kopian
//   tom=1   ingen kalender ännu (startval, avsnitt 10)
//   forra=0   ingen kalender förra läsåret att kopiera
//   arbetssatt=ram|eget   huvudmannens arbetssätt (standard eget)
//   ram=saknas|utgiven|andrad|utanbas   ramens läge för skolan i arbetssättet ram; utanbas: skolan började
//                 utan ramversion (D-15) och har en egen studiedag, ramen version 1 är utgiven men inte kvitterad
//   mal=ram   huvudmannens ram i stället för skolan (D-08)
//   last=1   arbetssättet är låst (läsåret har börjat)
//   klasser=1   klasser, årskurser och timplaner för panelen Undervisning (A-09)
//   vy=oversikt   kalenderstatus per skola (D-09, avsnitt 14) ur /api/lasar/oversikt;
//                 Öppna kalendern visar Läsår & skoldagar för vald skola
//   vy=alla   Läsår & skoldagar med Alla behöriga skolor: arbetssättskortet (huvudman) och listan;
//             Öppna kalendern byter skola som planeringsvalet gör
//   skolor=30   antal syntetiska skolor i överblicken (standard fyra med olika lägen)
//   oversikt=tom|fel|vanta   inga skolor / första läsningen ger 500 / svaret väntar på window.__lasar.release()
//   vy=im   IM-raden i Timplaner (05.1.1-14) ur /api/lasar/sammanfattning
//   sammanfattning=faststalld|ny|tom|fel   version 1 gäller / version 2 gäller efter version 1 / ingen fastställd
//                 version / läsningen ger 500 (standard faststalld)
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import ProtectedLasarWorkspace from '../../app/protected-lasar-workspace';
import ProtectedLasarOverview, { type LasarOpenTarget } from '../../app/protected-lasar-overview';
import { ProtectedLasarModeCard } from '../../app/protected-lasar-start';
import LasarImWeeklyNote from '../../app/lasar-im-weekly-note';
import LasarView from '../../app/lasar-view';
import {
  parseLasarCommandReply,
  parseLasarDecisionReply,
  parseLasarDecisionRequest,
  parseLasarModePreviewReply,
  parseLasarOverviewReply,
  parseLasarOverviewRequest,
  parseLasarReadReply,
  parseLasarReadRequest,
  parseLasarSummaryReply,
  parseLasarSummaryRequest,
  verifyLasarCommandHash,
  LasarContractError,
  type LasarActorRole,
  type LasarChangeRequest,
  type LasarDbStatus,
  type LasarMode,
  type LasarOverviewSchool,
  type LasarReadReply,
  type LasarReviewItem,
  type LasarTarget,
} from '../../lib/lasar-contract';
import { copySchoolYear } from '../../lib/lasar-copy';
import { applyFrameChanges, frameChanges, type FrameYear } from '../../lib/lasar-frame';
import { groupsFromRefs, type LasarGroupRef } from '../../lib/lasar-groups';
import { frameChangesWithoutBase } from '../../app/protected-lasar-frame';
import { proposeSchoolYear, type Exception, type GroupException, type LasarState, type SchoolYear, type ShortWeek } from '../../lib/lasar-model';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import '../../app/globals.css';
import '../../app/protected-timplan.css';

const tid = (n: number) => `51a50000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const params = new URLSearchParams(location.search);
const UNIT = tid(3), YEAR = Number(params.get('ar') ?? 2026), SCHOOL = 'Syntetiska grundskolan', TYPES = ['GR'];
const HASH = `sha256:${'0'.repeat(64)}`;
let role = (params.get('roll') ?? 'rektor') as 'rektor' | 'huvudman' | 'lasare' | 'admin';
const startStatus = (params.get('status') ?? 'utkast') as LasarDbStatus;
const editableFrom = params.get('passerade') === '1' ? '2026-11-09' : null;
let fault = params.get('fel');
let mode = (params.get('arbetssatt') ?? 'eget') as LasarMode;
const modeLocked = editableFrom !== null || params.get('last') === '1';
const frameView = params.get('mal') === 'ram';
const frameParam = params.get('ram') ?? (mode === 'ram' ? 'utgiven' : 'saknas');
const withClasses = params.get('klasser') === '1';
const previousYearAvailable = params.get('forra') !== '0';
const empty = params.get('tom') === '1';
const label = (y: number) => `${y}/${String(y + 1).slice(2)}`;

type Version = {
  versionId: string; version: number; status: LasarDbStatus; decidedOn: string | null; revision: number;
  terms: { ht: { start: string; end: string }; vt: { start: string; end: string } };
  exceptions: Record<string, Exception>; groupDays: Record<string, Record<string, GroupException>>; shortWeeks: Record<string, ShortWeek>;
  frameVersionId: string | null;
  history: { id: string; role: LasarActorRole; actorName: string; at: string; action: string; comment: string; version: number }[];
};
type Store = { target: LasarTarget; versions: Version[]; review: LasarReviewItem[] };
const proposal = proposeSchoolYear(YEAR, UNIT, TYPES);
let ids = 900;
const names: Record<LasarActorRole, string> = { rektor: 'Syntetisk rektor', skoladministrator: 'Syntetisk administratör', huvudman: 'Syntetisk huvudman' };
function entry(v: Version, who: LasarActorRole, action: string, comment: string, at = new Date().toISOString()) {
  v.history.unshift({ id: tid(++ids), role: who, actorName: names[who], at, action, comment, version: v.version });
}
type Content = Pick<Version, 'terms' | 'exceptions'>;
function makeVersion(n: number, status: LasarDbStatus, from?: Content, history = true): Version {
  const v: Version = {
    versionId: tid((frameView ? 200 : 100) + n), version: n, status, decidedOn: status === 'faststalld' ? '2026-03-18' : null, revision: 3,
    terms: structuredClone(from?.terms ?? { ht: proposal.ht, vt: proposal.vt }),
    exceptions: structuredClone(from?.exceptions ?? proposal.exceptions), groupDays: {}, shortWeeks: {}, frameVersionId: null, history: [],
  };
  if (!history) return v;
  entry(v, frameView ? 'huvudman' : 'rektor', frameView ? 'Ram skapad' : 'Förslag skapat', 'Terminer, helgdagar och vanliga lov föreslagna.', '2026-09-04T08:00:00.000Z');
  if (status === 'faststalld') entry(v, 'huvudman', 'Fastställd', 'Fastställd av syntetisk nämnd.', '2026-03-18T09:00:00.000Z');
  return v;
}

// ---- Huvudmannens ram (D-02, D-05, D-06): version 1 är förslaget; version 2 ändrar tre punkter.
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const CONFLICT_DAY = iso(YEAR, 10, 12), OWN_DAY = iso(YEAR, 11, 13), FRAME_DAY = iso(YEAR + 1, 1, 15);
const frameV1: FrameYear & { publishedOn: string } = { versionId: tid(301), version: 1, publishedOn: iso(YEAR, 6, 1), terms: { ht: { ...proposal.ht }, vt: { ...proposal.vt } }, exceptions: structuredClone(proposal.exceptions) };
const frameV2: FrameYear & { publishedOn: string } = {
  versionId: tid(302), version: 2, publishedOn: iso(YEAR, 10, 15),
  terms: { ht: { ...proposal.ht }, vt: { ...proposal.vt, end: '2027-06-10' } },
  exceptions: { ...structuredClone(proposal.exceptions), [FRAME_DAY]: { kind: 'studiedag', note: 'Gemensam studiedag' }, [CONFLICT_DAY]: { kind: 'lovdag', note: 'Gemensam lovdag' } },
};
const frames = mode === 'ram' && frameParam !== 'saknas' ? (frameParam === 'andrad' ? [frameV1, frameV2] : [frameV1]) : [];
const withoutBase = frameParam === 'utanbas';
let frameAck: string | null = frames.length && !withoutBase ? frameV1.versionId : null;
let frameBase: typeof frameV1 | null = frames.length && !withoutBase ? frameV1 : null;

// ---- Klasser och timplaner för panelen Undervisning (A-09). Inga elevuppgifter (A-18).
const GR = tid(11), IM = tid(12), C7A = tid(21), C8B = tid(22), CIM = tid(23), T1 = tid(31), T2 = tid(32);
const groupRefs: LasarGroupRef[] = withClasses ? [
  { scope: 'arskurs', offeringId: GR, columnId: 'ak7', label: 'Åk 7', educationName: 'Grundskolan 7–9', kind: 'grundskola' },
  { scope: 'arskurs', offeringId: GR, columnId: 'ak8', label: 'Åk 8', educationName: 'Grundskolan 7–9', kind: 'grundskola' },
  { scope: 'arskurs', offeringId: GR, columnId: 'ak9', label: 'Åk 9', educationName: 'Grundskolan 7–9', kind: 'grundskola' },
  { scope: 'klass', classId: C7A, offeringId: GR, columnId: 'ak7', label: '7A', educationName: 'Grundskolan 7–9', kind: 'grundskola' },
  { scope: 'klass', classId: C8B, offeringId: GR, columnId: 'ak8', label: '8B', educationName: 'Grundskolan 7–9', kind: 'grundskola' },
  { scope: 'klass', classId: CIM, offeringId: IM, columnId: null, label: 'IMA', educationName: 'Introduktionsprogram', kind: 'introduktionsprogram' },
] : [];
const grRows = [{ columnId: 'ak7', hours: 950 }, { columnId: 'ak8', hours: 950 }, { columnId: 'ak9', hours: 990 }];
const teaching = withClasses ? {
  classes: [
    { classId: C7A, name: '7A', offeringId: GR, columnId: 'ak7', timplanId: T1, timplanVersion: 2, rows: grRows },
    { classId: C8B, name: '8B', offeringId: GR, columnId: 'ak8', timplanId: T1, timplanVersion: 2, rows: grRows },
    { classId: CIM, name: 'IMA', offeringId: IM, columnId: null, timplanId: T2, timplanVersion: 1, rows: [{ columnId: 'vecka', hours: 23 }] },
  ],
  imClassIds: [CIM],
} : { classes: [], imClassIds: [] };

/** Skolans kalender i arbetssättet ram: ramversion 1 med skolans egna justeringar (D-06). */
function schoolFromFrame(base: FrameYear): Content {
  return {
    terms: { ht: { ...base.terms.ht, start: iso(YEAR, 8, 18) }, vt: { ...base.terms.vt } },
    exceptions: { ...structuredClone(base.exceptions), [CONFLICT_DAY]: { kind: 'studiedag', note: 'Skolans studiedag' }, [OWN_DAY]: { kind: 'studiedag', note: 'Skolans fortbildning' } },
  };
}
function initialSchool(): Version[] {
  if (empty) return [];
  const from = mode === 'ram' && frameBase ? schoolFromFrame(frameBase)
    : withoutBase ? { terms: { ht: { ...proposal.ht }, vt: { ...proposal.vt } }, exceptions: { ...structuredClone(proposal.exceptions), [OWN_DAY]: { kind: 'studiedag' as const, note: 'Skolans fortbildning' } } }
      : undefined;
  const list = params.get('version') === '2' ? [makeVersion(1, 'faststalld', from), makeVersion(2, startStatus, from)] : [makeVersion(1, startStatus, from)];
  for (const v of list) {
    if (from && !withoutBase) v.frameVersionId = frameV1.versionId;
    if (withClasses) v.groupDays = { [`klass:${C8B}`]: { [iso(YEAR, 11, 5)]: { cause: 'nationellt prov' } } };
  }
  return list;
}
const schoolStore: Store = { target: { kind: 'school', unitId: UNIT }, versions: frameView ? [] : initialSchool(), review: [] };
const frameStore: Store = { target: { kind: 'frame' }, versions: frameView && !empty ? [makeVersion(1, 'utkast')] : [], review: [] };
const active = frameView ? frameStore : schoolStore;
const storeOf = (t: LasarTarget) => (t.kind === 'frame' ? frameStore : t.unitId === UNIT ? schoolStore : null);
const latestOf = (s: Store) => s.versions[s.versions.length - 1];
let changeRequest: LasarChangeRequest | null = (() => {
  const begaran = params.get('begaran');
  return begaran === 'open' || begaran === 'declined'
    ? { id: tid(701), status: begaran, reason: 'Ny studiedag i mars för syntetisk fortbildning.', answer: begaran === 'declined' ? 'Studiedagarna är redan fem.' : null,
      requestedAt: '2026-10-01T09:00:00.000Z', answeredAt: begaran === 'declined' ? '2026-10-02T09:00:00.000Z' : null }
    : null;
})();

function capabilities(s: Store, v: Version | undefined) {
  const r = role === 'rektor', h = role === 'huvudman', last = v !== undefined && v === latestOf(s);
  const frame = s.target.kind === 'frame';
  const editable = v !== undefined && last && (frame ? h && v.status === 'utkast' : r && (v.status === 'utkast' || v.status === 'atersand'));
  const fixed = !frame && last && v?.status === 'faststalld', open = changeRequest?.status === 'open';
  // En utgiven ram ändras i nästa version (create med källan frame, plan 10).
  const canCreate = v !== undefined ? (frame && h && last && v.status === 'faststalld' ? ['frame'] : [])
    : frame ? (h ? ['proposal', 'copy'] : [])
      : r ? (mode === 'ram' ? (frames.length ? ['frame', 'copy'] : []) : ['proposal', 'copy']) : [];
  return {
    canEdit: editable, canSubmit: !frame && editable, canWithdraw: !frame && r && last && v?.status === 'forslag', canRequestChange: r && fixed && !open,
    canWithdrawRequest: r && fixed && open, canReturn: !frame && h && last && v?.status === 'forslag', canApprove: !frame && h && last && v?.status === 'forslag',
    canReopen: h && fixed, canDecline: h && fixed && open, canComment: v !== undefined && (r || h), canCreate,
    canPublishFrame: frame && editable, canSetMode: frame && h,
  };
}
const frameRef = (f: typeof frameV1 | null) => (f ? structuredClone(f) : null);
function readReply(s: Store, versionId: string | null): LasarReadReply {
  const v = s.versions.find((x) => x.versionId === versionId) ?? latestOf(s);
  const current = [...s.versions].reverse().find((x) => x.status === 'faststalld');
  const frame = s.target.kind === 'school' && mode === 'ram'
    ? { current: frameRef(frameBase), latest: frameRef(frames.at(-1) ?? null), acknowledgedVersionId: frameAck }
    : null;
  return parseLasarReadReply(structuredClone({
    contractVersion: 'lasar_sql_v1', target: s.target, schoolYear: YEAR, schoolName: s.target.kind === 'frame' ? 'Huvudmannens ram' : SCHOOL, schoolTypes: TYPES,
    mode, modeLocked,
    versions: s.versions.map((x) => ({ versionId: x.versionId, version: x.version, status: x.status, decidedOn: x.decidedOn, current: s.target.kind === 'school' && x === current })),
    calendar: v ? {
      versionId: v.versionId, version: v.version, status: v.status, revision: v.revision, terms: v.terms, exceptions: v.exceptions,
      groupDays: v.groupDays, shortWeeks: v.shortWeeks, frameVersionId: v.frameVersionId, contentHash: HASH, decidedOn: v.decidedOn, history: v.history,
    } : null,
    capabilities: capabilities(s, v), editableFrom, changeRequest: s.target.kind === 'school' ? changeRequest : null, review: s.review, frame,
    groups: s.target.kind === 'school' ? groupRefs : [], teaching: s.target.kind === 'school' ? teaching : { classes: [], imClassIds: [] }, previousYearAvailable,
  }));
}
/** Modellens läsår för en version, för kopiering och ramjämförelse i mocken. */
function modelOf(v: Version): SchoolYear {
  return { id: v.versionId, unitId: UNIT, startYear: YEAR, label: `Läsåret ${label(YEAR)}`, ht: { ...v.terms.ht }, vt: { ...v.terms.vt }, exceptions: structuredClone(v.exceptions), groupExceptions: {}, shortWeeks: {}, status: 'utkast', history: [] };
}
/** Förra läsåret: förslaget plus en studiedag i november och, för 2026/27, en i vecka 53. */
function previousYear(): SchoolYear {
  const source = proposeSchoolYear(YEAR - 1, UNIT, TYPES);
  source.exceptions[iso(YEAR - 1, 11, 13)] = { kind: 'studiedag', note: 'Syntetisk fortbildning' };
  if (YEAR - 1 === 2026) source.exceptions['2026-12-28'] = { kind: 'studiedag', note: 'Syntetisk planeringsdag' };
  return source;
}
const AFFECTED = [
  { unitId: tid(4), schoolName: 'Syntetiska gymnasiet', status: 'utkast' as const },
  { unitId: tid(5), schoolName: 'Syntetiska skolan Norr', status: 'forslag' as const },
];

// ---- Kalenderstatus per skola (D-09). Syntetiska skolor; inga elevantal (A-18).
const overviewParam = params.get('oversikt');
const schoolCount = Number(params.get('skolor') ?? 0);
const ref = (n: number, status: LasarDbStatus, current = false, decidedOn: string | null = null) => ({ versionId: tid(400 + n), version: n, status, decidedOn, current });
function overviewSchools(): LasarOverviewSchool[] {
  if (overviewParam === 'tom') return [];
  if (schoolCount > 0) {
    const statuses: (LasarDbStatus | null)[] = ['forslag', 'faststalld', 'atersand', 'utkast', null];
    return Array.from({ length: schoolCount }, (_, i) => {
      const status = statuses[i % statuses.length];
      return {
        unitId: tid(1000 + i), schoolName: `Syntetiska skolan nummer ${String(i + 1).padStart(2, '0')} med ett långt namn som behöver brytas`,
        status, versions: status ? [ref(1, status, status === 'faststalld', status === 'faststalld' ? '2026-06-10' : null)] : [],
        frameChanged: i % 7 === 2, changeRequested: status === 'faststalld' && i % 2 === 1,
        waitingFor: status === 'forslag' || (status === 'faststalld' && i % 2 === 1) ? 'huvudman' : status === 'atersand' ? 'rektor' : null,
      };
    });
  }
  return [
    { unitId: tid(6), schoolName: 'Syntetiska skolan Söder', status: null, versions: [], frameChanged: false, changeRequested: false, waitingFor: null },
    { unitId: tid(5), schoolName: 'Syntetiska skolan Norr', status: 'atersand', versions: [ref(1, 'faststalld', true, '2026-06-10'), ref(2, 'atersand')], frameChanged: mode === 'ram', changeRequested: false, waitingFor: 'rektor' },
    { unitId: tid(4), schoolName: 'Syntetiska gymnasiet', status: 'faststalld', versions: [ref(1, 'faststalld', true, '2026-06-10')], frameChanged: false, changeRequested: true, waitingFor: 'huvudman' },
    { unitId: UNIT, schoolName: SCHOOL, status: 'forslag', versions: [ref(1, 'forslag')], frameChanged: false, changeRequested: false, waitingFor: 'huvudman' },
  ];
}
let overviewFault = overviewParam === 'fel';

// ---- Kalenderns sammanfattning för beroende underlag (05.1.1-13/14). Syntetiska skoldagar; serverns räkning efterliknas inte här.
const summaryParam = params.get('sammanfattning') ?? 'faststalld';
const stat = (version: number, decidedOn: string, htSchoolDays: number, vtSchoolDays: number) =>
  ({ version, decidedOn, htSchoolDays, vtSchoolDays, contentHash: `sha256:${String(version).repeat(64)}` });
function summaryOf(unitId: string, schoolYear: number) {
  const v1 = stat(1, `${schoolYear}-06-10`, 80, 98), v2 = stat(2, `${schoolYear + 1}-06-01`, 85, 98);
  const [current, previous] = summaryParam === 'tom' ? [null, null] : summaryParam === 'ny' ? [v2, v1] : [v1, null];
  return { contractVersion: 'lasar_sql_v1', unitId, schoolYear, current, previous };
}
let releaseOverview: (() => void) | null = null;

type Logged = { path: string; body: unknown };
const control = {
  commands: [] as Logged[], decisions: [] as Logged[], reads: [] as Logged[], overviews: [] as Logged[], summaries: [] as Logged[], opened: [] as LasarOpenTarget[],
  revision: () => latestOf(active)?.revision ?? 0, versions: () => active.versions.length,
  release: () => { releaseOverview?.(); releaseOverview = null; },
};
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
    if (path === '/api/lasar/oversikt') {
      const q = parseLasarOverviewRequest(body);
      control.overviews.push({ path, body: structuredClone(body) });
      if (role !== 'rektor' && role !== 'huvudman') return error(403, 'forbidden');
      if (overviewParam === 'vanta' && control.overviews.length === 1) await new Promise<void>((done) => { releaseOverview = done; });
      if (overviewFault) { overviewFault = false; return { status: 500, json: { code: 'internal_error' } }; }
      const frame = mode === 'ram' ? (role === 'huvudman' ? { status: 'utkast' as const, version: 3 } : { status: 'utgiven' as const, version: 2 }) : null;
      return { status: 200, json: parseLasarOverviewReply({ contractVersion: 'lasar_sql_v1', schoolYear: q.schoolYear, mode, frame, schools: overviewSchools() }, q) };
    }
    if (path === '/api/lasar/sammanfattning') {
      const q = parseLasarSummaryRequest(body);
      control.summaries.push({ path, body: structuredClone(body) });
      if (role === 'lasare') return error(403, 'forbidden');
      if (summaryParam === 'fel') return { status: 500, json: { code: 'internal_error' } };
      return { status: 200, json: parseLasarSummaryReply(summaryOf(q.unitId, q.schoolYear), q) };
    }
    if (path === '/api/lasar/lasa') {
      const q = parseLasarReadRequest(body);
      control.reads.push({ path, body: structuredClone(body) });
      const s = storeOf(q.target);
      if (!s || q.schoolYear !== YEAR) return error(403, 'forbidden');
      if (q.target.kind === 'frame' && role !== 'huvudman') return error(403, 'forbidden');
      return { status: 200, json: readReply(s, q.versionId) };
    }
    if (path === '/api/lasar/kommando') {
      control.commands.push({ path, body: structuredClone(body) });
      const q = await verifyLasarCommandHash(body);
      const s = storeOf(q.target);
      if (!s || q.schoolYear !== YEAR) return error(403, 'forbidden');
      if (q.ops[0].op === 'create') {
        const op = q.ops[0];
        if (!capabilities(s, latestOf(s)).canCreate.includes(op.source) || (op.source === 'copy' && !previousYearAvailable)) return error(403, 'forbidden');
        let v: Version;
        if (op.source === 'copy') {
          const { draft, review } = copySchoolYear(previousYear(), YEAR, groupsFromRefs(groupRefs));
          v = makeVersion(1, 'utkast', { terms: { ht: draft.ht, vt: draft.vt }, exceptions: draft.exceptions }, false);
          s.review = review.map((item) => ({ ...item, resolved: false }));
          entry(v, who(), `Kopierat från ${label(YEAR - 1)}`, `${review.length} dagar att granska.`);
        } else if (op.source === 'frame' && s.target.kind === 'frame') {
          const previous = latestOf(s)!;
          v = makeVersion(previous.version + 1, 'utkast', previous, false);
          entry(v, who(), 'Ny version av ramen', `Utkast ur version ${previous.version}.`);
        } else if (op.source === 'frame') {
          const base = frames.at(-1)!;
          v = makeVersion(1, 'utkast', { terms: base.terms, exceptions: base.exceptions }, false);
          v.frameVersionId = base.versionId; frameBase = base; frameAck = base.versionId;
          entry(v, who(), 'Utgår från huvudmannens ram', `Ramens version ${base.version}.`);
        } else {
          v = makeVersion(1, 'utkast', undefined, false);
          entry(v, who(), s.target.kind === 'frame' ? 'Ram skapad' : 'Förslag skapat', 'Terminer, helgdagar och vanliga lov föreslagna.');
        }
        v.revision = 1;
        s.versions.push(v);
        return { status: 200, json: parseLasarCommandReply({ receipt: { commandId: q.commandId, revision: v.revision, replayed: false }, detail: readReply(s, v.versionId) }, q) };
      }
      const v = s.versions.find((x) => x.versionId === q.versionId);
      if (!v) return error(403, 'forbidden');
      const f = takeFault(['konflikt', 'osaker', '403', 'passerad']);
      if (f === '403') { role = 'lasare'; return error(403, 'forbidden'); }
      if (f === 'passerad') return error(409, 'conflict', 'lasar_past_day');
      if (f === 'konflikt') {
        // En annan session hinner före: dagen ändras och revisionen räknas upp.
        v.exceptions['2026-11-20'] = { kind: 'lovdag', note: 'Ändrad i annan session' };
        v.revision += 1;
      }
      const caps = capabilities(s, v);
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
        else if (op.op === 'resolve_review') {
          const item = s.review.find((i) => i.id === op.itemId);
          if (!item || item.resolved) return error(400, 'bad_request');
          item.resolved = true;
          if (s.review.every((i) => i.resolved)) entry(v, who(), `Kopierat från ${label(YEAR - 1)}, ${s.review.length} dagar granskade`, '');
        }
        else if (op.op === 'take_frame_changes' || op.op === 'keep_school_calendar') {
          const latest = frames.at(-1);
          if (!latest || op.frameVersionId !== latest.versionId || frameAck === latest.versionId) return error(409, 'conflict', 'lasar_frame_stale');
          if (op.op === 'take_frame_changes') {
            // Samma prövning som servern (plan 10): bara godkända nycklar under apply eller conflicts; utan bas är allt val.
            const changes = frameBase ? frameChanges(frameBase, latest, modelOf(v)) : frameChangesWithoutBase(latest, modelOf(v));
            const next = applyFrameChanges(modelOf(v), changes, op.accepted);
            v.terms = { ht: next.ht, vt: next.vt }; v.exceptions = next.exceptions;
            entry(v, who(), 'Ramens ändringar intagna', `${op.accepted.length} ändringar från ramens version ${latest.version}.`);
            // Som servern: intaget flyttar både basen (frame_id) och kvitteringen.
            v.frameVersionId = latest.versionId; frameBase = latest;
          } else entry(v, who(), 'Skolans kalender behållen', `Ramens version ${latest.version} är kvitterad.`);
          // Som servern: kvitteringen flyttar bara frame_ack_id; vid Behåll står basen kvar.
          frameAck = latest.versionId;
        }
        else return error(400, 'bad_request');
      }
      v.revision += 1;
      if (f === 'osaker') return { status: 502, json: { code: 'internal_error' } };
      return { status: 200, json: parseLasarCommandReply({ receipt: { commandId: q.commandId, revision: v.revision, replayed: false }, detail: readReply(s, v.versionId) }, q) };
    }
    if (path === '/api/lasar/beslut') {
      control.decisions.push({ path, body: structuredClone(body) });
      const q = parseLasarDecisionRequest(body);
      const s = storeOf(q.target);
      if (!s || q.schoolYear !== YEAR) return error(403, 'forbidden');
      if (q.action === 'preview_mode_change' || q.action === 'set_mode') {
        if (!capabilities(s, latestOf(s)).canSetMode) return error(403, 'forbidden');
        if (modeLocked) return error(409, 'conflict', 'lasar_mode_locked');
        if (q.action === 'preview_mode_change')
          return { status: 200, json: parseLasarModePreviewReply({ contractVersion: 'lasar_sql_v1', schoolYear: YEAR, mode: q.mode, affected: AFFECTED }) };
        if (JSON.stringify([...q.confirmAffected].sort()) !== JSON.stringify(AFFECTED.map((a) => a.unitId).sort())) return error(409, 'conflict', 'lasar_command_conflict');
        mode = q.mode!;
        return { status: 200, json: parseLasarDecisionReply({ receipt: { commandId: q.commandId, revision: 1, replayed: false }, detail: readReply(s, null) }, q) };
      }
      const v = s.versions.find((x) => x.versionId === q.versionId);
      if (!v) return error(403, 'forbidden');
      const f = takeFault(['mfa', 'regler']);
      if (f === 'mfa') return error(403, 'mfa_required');
      if (f === 'regler' && (q.action === 'submit' || q.action === 'approve')) return error(409, 'conflict', 'lasar_rules_failed', ['school_days_min']);
      if (q.expectedRevision !== v.revision) return error(409, 'conflict', 'lasar_revision_conflict');
      const caps = capabilities(s, v);
      const now = new Date().toISOString();
      let result = v;
      switch (q.action) {
        case 'submit':
          if (!caps.canSubmit) return error(403, 'forbidden');
          if (s.review.some((i) => !i.resolved)) return error(409, 'conflict', 'lasar_review_open');
          v.status = 'forslag'; entry(v, 'rektor', 'Förslag skickat', q.text); break;
        case 'withdraw': if (!caps.canWithdraw) return error(403, 'forbidden'); v.status = 'utkast'; entry(v, 'rektor', 'Förslag återtaget', 'Förslaget togs tillbaka för fortsatt arbete.'); break;
        case 'return': if (!caps.canReturn) return error(403, 'forbidden'); v.status = 'atersand'; entry(v, 'huvudman', 'Återsänd för ändring', q.text); break;
        case 'approve': if (!caps.canApprove) return error(403, 'forbidden'); v.status = 'faststalld'; v.decidedOn = '2026-11-10'; entry(v, 'huvudman', 'Fastställd', q.text); break;
        case 'publish_frame': if (!caps.canPublishFrame) return error(403, 'forbidden'); v.status = 'faststalld'; v.decidedOn = '2026-11-10'; entry(v, 'huvudman', 'Ramen utgiven', q.text); break;
        case 'request_change': if (!caps.canRequestChange) return error(403, 'forbidden'); changeRequest = { id: tid(++ids), status: 'open', reason: q.text, answer: null, requestedAt: now, answeredAt: null }; entry(v, 'rektor', 'Ändring begärd', q.text); break;
        case 'withdraw_request': if (!caps.canWithdrawRequest || !changeRequest) return error(403, 'forbidden'); changeRequest = { ...changeRequest, status: 'withdrawn', answeredAt: now }; entry(v, 'rektor', 'Begäran återtagen', ''); break;
        case 'decline_request': if (!caps.canDecline || !changeRequest) return error(403, 'forbidden'); changeRequest = { ...changeRequest, status: 'declined', answer: q.text, answeredAt: now }; entry(v, 'huvudman', 'Begäran avslagen', q.text); break;
        case 'reopen': {
          if (!caps.canReopen) return error(403, 'forbidden');
          if (changeRequest?.status === 'open') changeRequest = { ...changeRequest, status: 'accepted', answeredAt: now };
          result = { ...makeVersion(v.version + 1, 'utkast', v), revision: 1, history: [], frameVersionId: v.frameVersionId };
          entry(result, 'huvudman', 'Öppnat för ändring', q.text);
          s.versions.push(result);
          break;
        }
        default: return error(400, 'bad_request');
      }
      if (result === v) v.revision += 1;
      return { status: 200, json: parseLasarDecisionReply({ receipt: { commandId: q.commandId, revision: result.revision, replayed: false }, detail: readReply(s, result.versionId) }, q) };
    }
    return error(404, 'not_found');
  } catch (caught) {
    if (caught instanceof LasarContractError) return error(400, 'bad_request');
    if (caught instanceof Error && caught.message.includes('jämförelsen')) return error(409, 'conflict', 'lasar_frame_stale');
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

const actorRole: LasarActorRole | null = role === 'rektor' ? 'rektor' : role === 'huvudman' ? 'huvudman' : null;
/** Läsårsöverblickens kalenderdel; Öppna kalendern visar Läsår & skoldagar för vald skola och läsår. */
function OverviewHarness() {
  const [opened, setOpened] = useState<LasarOpenTarget | null>(null);
  if (opened) {
    const name = opened.frame ? 'Huvudmannens ram' : overviewSchools().find((s) => s.unitId === opened.unitId)?.schoolName ?? SCHOOL;
    return <ProtectedLasarWorkspace key={`${opened.unitId}:${opened.schoolYear}`} unitId={opened.unitId ?? 'ram'} schoolName={name} schoolYear={opened.schoolYear} schoolTypes={TYPES}
      onSessionLost={() => undefined} target={opened.frame ? { kind: 'frame' } : undefined} actorRole={actorRole} />;
  }
  return (
    <section className="planning-overview" aria-label="Läsårsöverblick">
      <h1>Läsårsöverblick {label(YEAR)}</h1>
      <ProtectedLasarOverview schoolYear={YEAR} unitId={null} actorRole={actorRole} onSecurityFailure={() => false}
        onOpen={(target) => { control.opened.push(target); setOpened(target); }} />
    </section>
  );
}
/** Läsår & skoldagar med Alla behöriga skolor; Öppna kalendern byter valet som planeringsvalet gör. */
function AllSchoolsHarness() {
  const [selection, setSelection] = useState<LasarOpenTarget>({ unitId: null, frame: false, schoolYear: YEAR });
  const [modeReloads, setModeReloads] = useState(0);
  const name = selection.frame ? 'Huvudmannens ram' : overviewSchools().find((s) => s.unitId === selection.unitId)?.schoolName ?? 'Alla behöriga skolor';
  return (
    <>
      <output data-testid="mode-reloads" hidden>{modeReloads}</output>
      <ProtectedLasarWorkspace key={`${selection.frame ? 'ram' : selection.unitId ?? 'alla'}:${selection.schoolYear}`} unitId={selection.frame ? 'ram' : selection.unitId}
        target={selection.frame ? { kind: 'frame' } : undefined} schoolName={name} schoolYear={selection.schoolYear} schoolTypes={TYPES} actorRole={actorRole}
        onSessionLost={() => undefined} onOpenCalendar={(target) => { control.opened.push(target); setSelection(target); }} onModeChanged={() => setModeReloads((n) => n + 1)} />
    </>
  );
}
function Harness() {
  const view = params.get('vy');
  return (
    <main id="workspace" lang="sv" className="workspace is-admin">
      {view === 'demo'
        ? <Demo />
        : view === 'oversikt'
        ? <OverviewHarness />
        : view === 'im'
        ? <section className="protected-timplan" aria-label="Timplan för introduktionsprogram"><div className="pt-year-context" data-testid="other-year-binding">
            <strong>{label(YEAR)} · Version 1</strong><p>Planeringsunderlag. Ingen verifierad klassbindning för året.</p>
            <LasarImWeeklyNote unitId={UNIT} schoolYear={YEAR} /></div></section>
        : view === 'alla'
        ? <AllSchoolsHarness />
        : view === 'arbetssatt'
          ? <section className="admin-workspace timplan-workspace protected-lasar"><ProtectedLasarModeCard schoolYear={YEAR} onSessionLost={() => undefined} /></section>
          : <ProtectedLasarWorkspace unitId={UNIT} schoolName={frameView ? 'Huvudmannens ram' : params.get('skola') ?? SCHOOL} schoolYear={YEAR} schoolTypes={TYPES} onSessionLost={() => undefined}
            target={frameView ? { kind: 'frame' } : undefined} actorRole={actorRole} />}
    </main>
  );
}

createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Harness /></UnsavedChangesProvider>);
