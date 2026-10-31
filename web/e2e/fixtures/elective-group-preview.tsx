// Syntetisk komponentmiljö. Inga databaser, riktiga konton eller serverbehörigheter prövas här.
import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import TjanstMatrix, { EMPTY_FILTER } from '../../app/tjanst-matrix';
import TjanstGroupMatrix, { teachingGroupEntries } from '../../app/tjanst-group-matrix';
import type { TjanstPreparedChange } from '../../app/tjanst-dialogs';
import type { TjanstPlanRead, TjanstRow, TjanstTeachingGroup, TjanstVersion } from '../../lib/tjanst-contract';
import { assertYearRowContext, type TjanstYearReply, type TjanstYearRequest, type TjanstYearRowReply } from '../../lib/tjanst-year-contract';
import { UnsavedChangesProvider } from '../../lib/unsaved-changes';
import { eid, source } from './elective-data';
import '../../app/globals.css';
import '../../app/tjanst.css';
import '../../app/elective-blocks.css';

const HASH = `sha256:${'4a'.repeat(32)}`, year = 2026;
const group: TjanstTeachingGroup = { sourceKind: 'teaching_group', sourceKey: `teaching_group:${eid(13)}:${year}`, rowKey: `group:${eid(13)}`, label: 'Moderna språk – Nivå 1',
  name: 'Spanska gemensam', groupId: eid(13), blockId: eid(10), optionId: eid(11), subjectCode: 'MODO', levelCode: 'MODO1000X', language: 'es', groupRevision: 1,
  classIds: [eid(2), eid(5)], sourceRefs: [source(), { ...source(), classId: eid(5), className: 'NA26', sourceKey: `class_timplan:${eid(5)}:${year}:block:mosp`, frameSourceKey: `class_timplan:${eid(5)}:${year}:block:mosp` }], needHt: 2700, needVt: 2700, needBasis: 'terms', stale: false };
const version: TjanstVersion = { id: eid(70), versionNo: 1, status: 'draft', contentHash: HASH, basedOnVersionId: null, publishedAt: null, publishedByName: null };
const teachers = [{ personId: eid(80), displayName: 'Anna Prov', draft: false, shareHere: null }, { personId: eid(81), displayName: 'Bertil Prov', draft: false, shareHere: null }];
const initial: TjanstPlanRead = { contractVersion: 'tjanst_v1', unitId: eid(1), schoolName: 'Provskolan', schoolYear: year, revision: 1, version, versions: [version], teachers,
  classes: [], groups: [group], rows: [], joints: [], sharing: [], specials: [], actions: ['save_row', 'delete_row', 'save_sharing', 'clear_sharing'], blockers: [], capabilities: { canEdit: true, canPublish: true, canReadHistory: true } };
function Preview() {
  const [data, setData] = useState(initial), [body, setBody] = useState<HTMLTableSectionElement | null>(null), [busy, setBusy] = useState(false), [writes, setWrites] = useState<TjanstPreparedChange[]>([]);
  const latest = useRef(initial), previews = useRef(0);
  const [lens, setLens] = useState<'alla' | 'ofordelat'>('alla'), [keep, setKeep] = useState('');
  useEffect(() => { const refresh = () => { const next = { ...latest.current, revision: latest.current.revision + 1 }; latest.current = next; setData(next); }; window.addEventListener('elective-fixture-refresh', refresh); return () => window.removeEventListener('elective-fixture-refresh', refresh); }, []);
  const phone = matchMedia('(max-width:767px)').matches, filter = { ...EMPTY_FILTER, lens };
  function support(request: TjanstYearRequest): TjanstYearReply {
    previews.current++;
    const d = latest.current, base = { contractVersion: 'tjanst_year_v1' as const, unitId: d.unitId, schoolYear: d.schoolYear, currentRevision: d.revision, baseVersionId: d.version!.id, basisHash: HASH };
    const candidates = teachers.map((teacher, index) => ({ ...teacher, duties: [{ dutyId: eid(90 + index), startsOn: '2026-07-01', endsOn: '2027-06-30', percent: 100 }], qualificationStatus: 'unknown' as const, personBasisHash: HASH }));
    if (request.mode !== 'row') return { ...base, mode: 'catalog', candidates, totalCandidates: candidates.length };
    return { ...base, mode: 'row', sourceKey: request.sourceKey, rowId: request.rowId,
      need: { sourceKind: 'teaching_group', sourceKey: group.sourceKey, rowKey: group.rowKey, label: group.label, classId: null, className: group.name, groupId: group.groupId, classIds: group.classIds, needHt: group.needHt, needVt: group.needVt, needBasis: group.needBasis },
      currentRow: d.rows.find(row => row.id === request.rowId) ?? null, candidates, totalCandidates: candidates.length, recommendationStatus: 'empty', suggestions: [] };
  }
  async function save(change: TjanstPreparedChange, accepted?: (next: TjanstPlanRead) => void) {
    const d = latest.current;
    if (change.expectedRevision !== d.revision) return { ok: false as const, error: 'Ändrat underlag' };
    const next = structuredClone(d); next.revision++;
    if (change.action === 'save_row') {
      const p = change.payload, request: TjanstYearRequest = { unitId: d.unitId, schoolYear: d.schoolYear, mode: 'row', sourceKey: p.sourceKey, rowId: p.rowId };
      assertYearRowContext(p, support(request) as TjanstYearRowReply);
      const row: TjanstRow = { id: p.rowId ?? crypto.randomUUID(), lineageId: eid(95), sourceKind: 'teaching_group', sourceKey: p.sourceKey, rowKey: group.rowKey, classId: null,
        groupId: group.groupId, classIds: group.classIds, sourceRefs: group.sourceRefs, groupRevision: group.groupRevision, personId: p.personId, teacherHt: p.teacherHt, teacherVt: p.teacherVt,
        needHt: group.needHt, needVt: group.needVt, needBasis: group.needBasis, stale: false, jointGroupId: null, comment: p.comment };
      next.rows = [...next.rows.filter(item => item.id !== row.id), row];
    } else if (change.action === 'delete_row') next.rows = next.rows.filter(row => row.id !== change.payload.rowId);
    else if (change.action === 'save_sharing') next.sharing = [{ sourceKey: change.payload.sourceKey, mode: change.payload.mode, graderPersonIds: change.payload.graderPersonIds }];
    else if (change.action === 'clear_sharing') next.sharing = [];
    latest.current = next; setData(next); setWrites(old => [...old, change]); accepted?.(next); return { ok: true as const };
  }
  return <main className="tjanst protected-admin" style={{ padding: 16 }}><h1>Gruppbemanning – syntetiskt komponentprov</h1>
    <label>Lins<select value={lens} onChange={event => { setKeep(''); setLens(event.target.value as 'alla' | 'ofordelat'); }}><option value="alla">Alla behov</option><option value="ofordelat">Ofördelat</option></select></label>
    {!phone && <TjanstMatrix data={data} groups={[]} teachers={teachers} term="ar" editable={!busy} onCell={() => {}} onJoint={() => {}} onGroupBody={setBody} additionalCoverage={teachingGroupEntries(data, filter, 'ar', keep)}/>}
    <TjanstGroupMatrix data={data} teachers={teachers} term="ar" filter={filter} phone={phone} editable={!busy && !phone} inMatrix={!phone} matrixBody={body} onBusy={setBusy} onFeedback={key => setKeep(key)}
      loadPreview={async request => { const reply = support(request); if (new URLSearchParams(location.search).has('changed')) reply.currentRevision++; return reply; }} onSave={save}/>
    <output data-testid="writes" style={{ display: 'block', overflowWrap: 'anywhere', maxWidth: '100%' }}>{JSON.stringify(writes)}</output>
    <output data-testid="data" style={{ display: 'block', overflowWrap: 'anywhere', maxWidth: '100%' }}>{JSON.stringify(data.rows)}</output>
  </main>;
}
createRoot(document.getElementById('root')!).render(<UnsavedChangesProvider><Preview/></UnsavedChangesProvider>);
