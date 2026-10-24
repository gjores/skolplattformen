// Only synthetic identities/data in an owned test database. No live connection is accepted here.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createTjanstFixture, staffWithDuties, seedGrimNeeds, planCommand, planRead, planSend, personalCommand } from './tjanst-fixtures.mjs';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';
import { parseYearRequest, parseYearReply, createYearPlanCommand, parseYearPlanReceipt } from '../../web/lib/tjanst-year-contract.ts';

export const yearPreview = async (t, q) => {
  const request = parseYearRequest(q), result = (await t`select public.tjanst_year_preview(${t.json(request)}) value`)[0].value;
  return parseYearReply(result, request);
};
export const yearRawPreview = async (t, q) => (await t`select public.tjanst_year_preview(${t.json(q)}) value`)[0].value;
export const yearManual = candidate => ({ kind: 'manual', personId: candidate.personId, expectedPersonBasisHash: candidate.personBasisHash });
export const yearVacant = () => ({ kind: 'unassigned', personId: null });
export const yearRowPayload = (support, choice, extra = {}) => ({ rowId: support.rowId, sourceKind: 'class_timplan', sourceKey: support.sourceKey,
  personId: choice.personId, teacherHt: 600, teacherVt: 600, comment: '',
  planningContext: { baseVersionId: support.baseVersionId, expectedBasisHash: support.basisHash, choice }, ...extra });
export const yearSend = async (t, unitId, schoolYear, action, payload) => {
  const current = await planRead(t, { unitId, schoolYear });
  return (await planSend(t, await planCommand(unitId, schoolYear, action, current.revision, payload,
    action === 'publish' ? { expectedContentHash: current.version.contentHash } : {}))).result.detail;
};
export async function createTjanstYearFixture(t) {
  const f = await createTjanstFixture(t), unitId = f.schools.A, schoolYear = 2026;
  const g = await seedGrimNeeds(t, f);
  const people = [];
  for (const [index, duty] of [
    { unitId, percent: 50, startsOn: '2026-07-01' },
    { unitId, percent: 30, startsOn: '2027-01-11', endsOn: '2027-03-01' },
    { unitId: f.schools.B, percent: 50, startsOn: '2026-07-01' },
    { unitId, percent: 50, startsOn: '2025-07-01', endsOn: '2026-06-30' },
    { unitId, percent: 50, startsOn: '2027-06-30', endsOn: '2027-06-30' },
    { unitId, percent: 50, startsOn: '2027-07-01' },
  ].entries()) people.push(await staffWithDuties(t, f, { familyName: index < 2 ? 'Samma namn' : 'Person ' + index, startsOn: '2025-07-01', duties: [duty] }));
  await f.actor(t, 'principalA');
  const draft = await personalCommand(t, { commandId: randomUUID(), action: 'create_draft_teacher', expectedRevision: 0,
    payload: { unitId, givenName: 'Syntetisk', familyName: 'Utkast', draftNote: 'Syntetiskt prov' } });
  // Second real current GR class/link, used to make valid joint groups via the public command path.
  await t`select public.phase51_grim_class_command(${t.json({ action: 'link', commandId: randomUUID(), classId: f.classes.other,
    planId: g.grPlan, expectedPlanRevision: 0, columnId: 'ak8', expectedLinkRevision: null, previousPlanId: null })})`;
  const key = (rowKey = 'matematik', classId = f.classes.group, year = schoolYear) => `class_timplan:${classId}:${year}:${rowKey}`;
  return { f, g, unitId, schoolYear, people, draftPersonId: draft.result.receipt.personId, key,
    request: (extra = {}) => ({ unitId, schoolYear, mode: 'row', sourceKey: key(), rowId: null, ...extra }) };
}

/** Explicit old fixture, not a simulated live import: frozen prior-year publication with real row identifiers.
 * It has a NEW GR class ID bearing the SAME display name as the current class. Only row identity may match. */
export async function seedYearHistory(t, s) {
  const { f, unitId, schoolYear, g, people } = s, year = schoolYear - 1;
  await f.actor(t, 'hm');
  const offering = randomUUID(), klass = randomUUID(), dist = randomUUID(), version = randomUUID(), row = randomUUID();
  await t`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,grades,start_year)
    values(${offering},${f.id(2)},${unitId},'grundskola','Syntetiskt tidigare GR','Syntetisk tidigare kull',${[7,8,9]}::smallint[],${year})`;
  await t`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
    values(${klass},${f.id(1)},${f.id(2)},${unitId},${offering},'SYN7A',${year})`;
  await t`insert into public.tjanst_distributions(id,customer_id,organizer_id,unit_id,school_year)
    values(${dist},${f.id(1)},${f.id(2)},${unitId},${year})`;
  await t`insert into public.tjanst_versions(id,distribution_id,version_no,status,created_by_identity_id,created_by_assignment_id)
    values(${version},${dist},1,'draft',${f.identity('principalA')},${f.roles.principalA})`;
  const [{ series_id }] = await t`select series_id from public.timplans where id=${g.grPlan}`;
  await t`insert into public.tjanst_rows(id,version_id,lineage_id,staff_person_id,source_kind,source_key,class_id,school_year,link_revision,timplan_id,series_id,timplan_version,
    timplan_row_key,link_column,need_label,need_ht_minutes,need_vt_minutes,need_basis,teacher_ht_minutes,teacher_vt_minutes)
    values(${row},${version},${randomUUID()},${people[0].personId},'class_timplan',${s.key('matematik',klass,year)},${klass},${year},0,${g.grPlan},${series_id},1,
      'matematik','ak8','Matematik',2700,2700,'even_split',600,600)`;
  await t`set local session_replication_role=replica`;
  await t`update public.tjanst_versions set status='published',published_at=clock_timestamp(),published_by_identity_id=${f.identity('principalA')},
    published_by_assignment_id=${f.roles.principalA},content_hash=public.tjanst_version_hash(id) where id=${version}`;
  await t`set local session_replication_role=origin`;
  await f.actor(t, 'principalA');
  return { classId: klass, distributionId: dist, versionId: version, rowId: row };
}


const freezeTree = value => { if (value && typeof value === 'object') { for (const child of Object.values(value)) freezeTree(child); Object.freeze(value); } return value; };
/** Explicit positive-test capture. Sending, hashing, retrying and status NEVER call this helper.
 * A row choice must be stated: 'manual', 'unassigned', or a complete suggestion choice.
 * Old-schema tests keep planCommand/yearSend and never attempt a new write after parser failure. */
export async function capturePlanContext(t, request) {
  const { unitId, schoolYear, action } = request;
  const payload = structuredClone(request.payload);
  if (action === 'create_draft') throw Error('create_draft is historical only');
  let support;
  if (action === 'save_row') {
    support = await yearPreview(t, { unitId, schoolYear, mode: 'row', sourceKey: payload.sourceKey, rowId: payload.rowId });
    const choice = request.choice === 'unassigned' ? yearVacant() : request.choice === 'manual'
      ? yearManual(support.candidates.find(p => p.personId === payload.personId) ?? (() => { throw Error('Explicit manual choice is unavailable'); })())
      : request.choice;
    if (!choice || choice.personId !== payload.personId) throw Error('Explicit matching choice required');
    payload.planningContext = { baseVersionId: support.baseVersionId, expectedBasisHash: support.basisHash, choice };
  } else if (action === 'move' || action === 'bulk') {
    support = await yearPreview(t, { unitId, schoolYear, mode: 'batch', batch: payload });
    payload.expectedPreviewHash = support.previewHash;
  } else {
    support = await yearPreview(t, { unitId, schoolYear, mode: 'catalog' });
    payload.mutationContext = { baseVersionId: support.baseVersionId, expectedBasisHash: support.basisHash };
  }
  const captured = { unitId, schoolYear, action, expectedRevision: support.currentRevision, payload };
  if (action === 'publish') captured.expectedContentHash = (await planRead(t, { unitId, schoolYear })).version.contentHash;
  return freezeTree(captured);
}
export const yearCommand = captured => createYearPlanCommand({ commandId: randomUUID(), ...captured });
/** Validates the captured request and actual receipt. No recapture, replay repair or database reads. */
export async function yearCommandSend(t, command) {
  const reply = await planSend(t, command);
  assert.deepEqual(Object.keys(reply).sort(), ['actor','contractVersion','result']);
  assert.equal(reply.contractVersion,'tjanst_sql_v1');
  assert.deepEqual(Object.keys(reply.actor).sort(), ['assignmentId','identityId']);
  for(const id of Object.values(reply.actor)) assert.match(id,/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u);
  assert.deepEqual(Object.keys(reply.result).sort(), ['detail','receipt']);
  const receipt=parseYearPlanReceipt(reply.result.receipt, command);
  const detail=parseYearPlanReadReply(reply.result.detail, { unitId: command.unitId, schoolYear: command.schoolYear });
  assert.equal(detail.revision,receipt.revision);
  if(command.action!=='discard_draft') assert.equal(detail.version?.id,receipt.versionId);
  return reply;
}
