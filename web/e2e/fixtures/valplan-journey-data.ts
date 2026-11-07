// Syntetiskt API för hela vägen. Alla vyer läser samma tillstånd, så det en vy sparar syns i nästa. Ingen databas, Worker,
// inloggning eller verklig skola: provet visar att vyerna hänger ihop, inte att servern svarar så.
import { expect, type Page } from '@playwright/test';
import catalog from '../../lib/programplan-catalog.generated.json' with { type: 'json' };
import { parseGymTimplan } from '../../lib/gym-timplan';
import { TJANST_PLAN_ACTIONS } from '../../lib/tjanst-contract';
import { parseValplanCommand, type ValplanCommand } from '../../lib/valplan-contract';
import { parseValplanChoiceCommand, parseValplanSelfCommand, type ValplanChoiceCommand, type ValplanSelfCommand } from '../../lib/valplan-choice-contract';
import { parseStudyGroupCommand } from '../../lib/study-group-contract';
import type { Valplan } from '../../lib/valplan-model';

export const id = (n: number) => `5a150000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const unitId = id(3), schoolYear = 2027, classA = { id: id(20), name: 'SA27A' }, classB = { id: id(21), name: 'SA27B' };
const rowKey = 'block:iv1', fixedKey = 'programmeSpecific:PEDG:1:PEDG1000X', at = '2027-03-01T10:00:00.000Z', headers = { 'X-Context-Epoch': '1' };
export const shellUrl = `/e2e/fixtures/tjanst-staff-preview.html?vy=timplaner&timplan=${id(1)}&timplansskola=${unitId}&timplansutbildning=${id(2)}&timplansversion=1&planeringslasar=${schoolYear}&planeringsskola=${unitId}&planeringsform=gymnasium&planeringsallaar=1`;
export const pupilUrl = '/e2e/fixtures/valplan-choice-preview.html?self';

const gym = () => { const common = { id: id(1), offeringId: id(2), unitId, schoolName: 'Syntetiska gymnasiet', version: 1, revision: 7, status: 'faststalld', series: { id: id(4), name: 'SA27 – samhälle', revision: 0 }, nameAtCreation: 'SA27 – samhälle',
  source: { planId: id(5), offeringId: id(2), version: 1, revision: 0, status: 'faststalld', catalogId: catalog.catalogId, startedOn: '2027-08-01', educationRevision: 0, education: { name: 'Samhällsvetenskapsprogrammet', cohort: '2027–2030', programCode: 'SA25', orientationCode: null } },
  currentSource: { planId: id(5), version: 1, revision: 0, status: 'faststalld' }, sourceChanged: false, archived: false, canPlan: false,
  rows: [{ key: fixedKey, name: 'Pedagogik', levelName: 'Nivå 1', points: 100, part: 'programmeSpecific', pointTerms: [50, 50, 0, 0, 0, 0], rowKind: 'fixed' }, { key: rowKey, name: 'Individuellt val', levelName: 'Valbart block', points: 200, part: 'individualChoice', pointTerms: [100, 100, 0, 0, 0, 0], rowKind: 'block' }],
  hours: { [fixedKey]: [50, 50, null, null, null, null], [rowKey]: [90, 90, null, null, null, null] } }; return parseGymTimplan(common, common.id); };
function session(role: 'rektor') {
  const context = { assignmentId: id(6), membershipId: id(7), customerId: id(8), customerName: 'Syntetisk huvudman', organizerId: id(9), organizerName: 'Syntetisk huvudman', unitId: null, unitName: null, function: role, label: 'Rektor', blocked: false, valid: true };
  const assignment = { ...context, id: id(6), validFrom: '2026-01-01', validTo: null, endedAt: null, membershipStatus: 'active', state: 'giltigt' };
  return { identity: { issuer: 'synthetic-journey', subject: 'synthetic-rektor', displayName: 'Rektor Syntetisk', email: null }, assignments: [assignment], assignmentGroups: { valid: [assignment], upcoming: [], ended: [] }, context, today: '2027-03-01', mfa: { acr: null, amr: [], authTime: null, proof: false }, epoch: 1, expiresAt: '2099-01-01T00:00:00Z', correlationId: 'synthetic-journey' };
}
type Round = { id: string; status: 'open' | 'closed'; closesOn: string; guardianConfirmation: boolean; revision: number; accepting: boolean };
type Choice = { id: string; roundId: string; pupilId: string; revision: number; courseIds: string[]; state: string; submittedBy: string; submittedAt: string; confirmedAt: string | null };
type Pupil = { id: string; name: string; classId: string };
const person = { bindingId: id(70), unitId, schoolName: 'Syntetiska gymnasiet', pupilId: id(60), pupilName: 'Syntetisk Elev A', bindingRevision: 1 };

/** alreadyChosen: kursen Elev A redan har valt i ett annat block. Kurser klasserna läser fast ligger i classCourses. */
export async function journey(page: Page, { alreadyChosen = 'FILS1000X' } = {}) {
  const pupils: Pupil[] = [{ id: id(60), name: 'Syntetisk Elev A', classId: classA.id }, { id: id(61), name: 'Syntetisk Elev B', classId: classB.id }];
  const s = { valplans: [] as { catalogId: string; valplan: Valplan }[], guardian: null as boolean | null, round: null as Round | null, choices: new Map<string, Choice>(), groups: [] as Record<string, unknown>[], memberships: [] as Record<string, unknown>[], writes: [] as string[], errors: [] as string[], unexpected: [] as string[] };
  const block = () => s.valplans[0]?.valplan as Valplan | undefined;
  const row = (excluded: readonly string[] = []) => ({ timplanId: id(1), timplanVersion: 1, rowKey, year: 1 as const, rowKind: 'block' as const, blockKind: 'individualChoice' as const, points: 200, minutesHt: 5400, minutesVt: 5400, classIds: [classA.id, classB.id], allowedLevelKeys: null,
    blocks: s.valplans.flatMap(v => v.valplan.rows.filter(l => l.rowKey === rowKey).map(l => ({ valplanId: v.valplan.id, classIds: [classA.id, classB.id].filter(c => !l.excludedClassIds.includes(c) && !excluded.includes(c)) }))), planName: 'SA27 – samhälle', rowLabel: 'Individuellt val', classes: [classA, classB] });
  const count = (courseId?: string) => [...s.choices.values()].filter(c => !courseId || c.courseIds.includes(courseId));
  const classCount = (list: Choice[]) => [classA, classB].flatMap(k => { const n = list.filter(c => pupils.find(p => p.id === c.pupilId)?.classId === k.id).length; return n ? [{ classId: k.id, pupils: n }] : []; });
  const valplanRead = () => ({ contractVersion: 'valplan_v1', unitId, schoolYear, rows: [row()],
    classCourses: [{ classId: classA.id, courses: [{ subjectCode: 'ENGE', itemCode: 'ENGE1000X' }] }, { classId: classB.id, courses: [{ subjectCode: 'ENGE', itemCode: 'ENGE1000X' }, { subjectCode: 'ADMI', itemCode: 'ADMI1000X' }] }],
    valplans: s.valplans.map(v => ({ ...v, choiceCounts: classCount(count()), courseChoices: v.valplan.courses.map(c => ({ courseId: c.id, pupils: count(c.id).length, classes: classCount(count(c.id)) })).filter(c => c.pupils) })) });
  const offered = (pupil: Pupil) => block()!.courses.filter(c => !c.classIds || c.classIds.includes(pupil.classId));
  const blockedOf = (pupil: Pupil) => pupil.id === id(60) ? offered(pupil).filter(c => c.itemCode === alreadyChosen).map(c => ({ courseId: c.id, reason: 'val' as const })) : [];
  const choiceRead = () => ({ contractVersion: 'valplan_choice_v1', unitId, schoolYear, valplanId: block()!.id, valplanName: block()!.name, valplanRevision: block()!.revision, guardianConfirmation: s.guardian, round: s.round,
    courses: block()!.courses.map(c => ({ id: c.id, name: c.name, points: c.points })), classes: [classA, classB], groupCourseIds: s.groups.map(g => g.courseId as string),
    pupils: pupils.map(p => ({ id: p.id, name: p.name, classIds: [p.classId], targetPoints: 200, offeredCourseIds: offered(p).filter(c => !blockedOf(p).some(b => b.courseId === c.id)).map(c => c.id), blockedCourses: blockedOf(p), choice: s.choices.get(p.id) ?? null })) });
  const selfRead = () => ({ contractVersion: 'valplan_self_v1', epoch: 1, offers: s.round?.status !== 'open' ? [] : [{ round: s.round, valplanId: block()!.id, valplanName: block()!.name, kind: block()!.kind, schoolYear, targetPoints: 200, courses: offered(pupils[0]).map(c => ({ id: c.id, name: c.name, points: c.points })), blockedCourses: blockedOf(pupils[0]), choice: s.choices.get(pupils[0].id) ?? null, decision: null }] });
  const groupRead = () => ({ contractVersion: 'study_group_v1', unitId, schoolYear, groups: s.groups.map(({ courseId: _courseId, ...g }) => g), memberships: s.memberships, pupils: pupils.map(p => ({ id: p.id, name: p.name, classIds: [p.classId] })), classes: [classA, classB] });
  const version = { id: id(90), versionNo: 1, status: 'draft', contentHash: `sha256:${'4a'.repeat(32)}`, basedOnVersionId: null, publishedAt: null, publishedByName: null };
  const teachers = [{ personId: id(91), displayName: 'Anna Syntetisk', draft: false, shareHere: null }];
  const needs = (classId: string) => s.groups.length ? [] : [{ sourceKind: 'class_timplan', sourceKey: `class_timplan:${classId}:${schoolYear}:${rowKey}`, rowKey, label: 'Individuellt val', needHt: 5400, needVt: 5400, needBasis: 'terms', organizationPending: true }];
  const tjanstRead = () => ({ contractVersion: 'tjanst_v1', unitId, schoolName: 'Syntetiska gymnasiet', schoolYear, revision: 1, version, versions: [version], teachers, joints: [], sharing: [], specials: [], rows: [], blockers: [], actions: [...TJANST_PLAN_ACTIONS], capabilities: { canEdit: true, canPublish: true, canReadHistory: true },
    classes: [classA, classB].map(k => ({ classId: k.id, name: k.name, aplMinutes: null, link: { linkRevision: 0, timplanId: id(1), seriesId: id(4), seriesName: 'SA27 – samhälle', timplanVersion: 1, column: 'ar1', schoolform: 'gymnasium' }, needs: needs(k.id) })),
    groups: s.groups.map(g => ({ sourceKind: 'study_group', sourceKey: `study_group:${g.id}:${schoolYear}`, rowKey: `group:${g.id}`, label: g.name, name: g.name, groupId: g.id, blockId: null, optionId: null, subjectCode: (g.course as { subjectCode: string }).subjectCode, levelCode: (g.course as { itemCode: string }).itemCode, language: null, groupRevision: 1, classIds: g.classIds, sourceRefs: [], needHt: g.minutesHt, needVt: g.minutesVt, needBasis: 'terms', stale: false })) });

  function saveBlock(command: ValplanCommand) {
    const stored = { ...command.valplan, revision: command.expectedRevision + 1 };
    s.valplans = [...s.valplans.filter(v => v.valplan.id !== stored.id), { catalogId: command.catalogId, valplan: stored }];
    return { receipt: { commandId: command.commandId, valplanId: stored.id, revision: stored.revision, replayed: false }, read: valplanRead() };
  }
  function runChoice(c: ValplanChoiceCommand) {
    const extra: Record<string, number> = {};
    if (c.action === 'set_policy') s.guardian = c.payload.guardianConfirmation;
    if (c.action === 'open_round') s.round = { id: id(40), status: 'open', closesOn: c.payload.closesOn, guardianConfirmation: !!s.guardian, revision: (s.round?.revision ?? 0) + 1, accepting: true };
    if (c.action === 'close_round') s.round = { ...s.round!, status: 'closed', accepting: false, revision: s.round!.revision + 1 };
    if (c.action === 'record_choice') s.choices.set(c.payload.pupilId, { id: id(50), roundId: id(40), pupilId: c.payload.pupilId, revision: 1, courseIds: c.payload.courseIds, state: 'ready_for_confirmation', submittedBy: 'school', submittedAt: at, confirmedAt: null });
    if (c.action === 'confirm_choice') { const choice = s.choices.get(c.payload.pupilId)!; s.choices.set(c.payload.pupilId, { ...choice, state: 'confirmed', confirmedAt: at }); }
    if (c.action === 'create_groups') {
      const confirmed = [...s.choices.values()].filter(x => x.state === 'confirmed');
      for (const courseId of new Set(confirmed.flatMap(x => x.courseIds))) { const course = block()!.courses.find(x => x.id === courseId)!, groupId = crypto.randomUUID();
        s.groups.push({ id: groupId, courseId, unitId, schoolYear, name: course.name, startsOn: `${schoolYear}-07-01`, endsOn: `${schoolYear + 1}-06-30`, course: { subjectCode: course.subjectCode, subjectVersion: course.subjectVersion, itemCode: course.itemCode, points: course.points, languageCode: null }, minutesHt: course.minutesHt, minutesVt: course.minutesVt, parallelSetId: crypto.randomUUID(), classIds: [...new Set(confirmed.filter(x => x.courseIds.includes(courseId)).map(x => pupils.find(p => p.id === x.pupilId)!.classId))], origin: { kind: 'valplan', valplanId: block()!.id, courseId }, revision: 1, active: true });
        for (const x of confirmed.filter(y => y.courseIds.includes(courseId))) s.memberships.push({ id: crypto.randomUUID(), groupId, pupilId: x.pupilId, startsOn: `${schoolYear}-07-01`, endsOn: `${schoolYear + 1}-06-30`, source: 'choice', sourceRef: x.id }); }
      Object.assign(extra, { created: s.groups.length, added: s.memberships.length, notConfirmed: s.choices.size - confirmed.length });
    }
    return { receipt: { commandId: c.commandId, action: c.action, replayed: false, ...extra }, read: choiceRead() };
  }
  function runSelf(c: ValplanSelfCommand) {
    if (c.action === 'submit_choice') s.choices.set(person.pupilId, { id: id(50), roundId: id(40), pupilId: person.pupilId, revision: (s.choices.get(person.pupilId)?.revision ?? 0) + 1, courseIds: c.payload.courseIds, state: 'ready_for_confirmation', submittedBy: 'participant', submittedAt: at, confirmedAt: null });
    return { commandId: c.commandId, action: c.action, bindingId: person.bindingId, choiceId: id(50), choiceRevision: s.choices.get(person.pupilId)?.revision ?? 1, replayed: false };
  }
  page.on('pageerror', error => s.errors.push(error.message));
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname, body = route.request().method() === 'POST' ? route.request().postDataJSON() : {};
    let json: unknown;
    if (path === '/api/session') json = session('rektor');
    else if (path === '/api/planering/urval') json = { customerId: id(8), serverDate: '2027-03-01', currentYear: 2026, minimumYear: 2000, maximumYear: 2100, units: [{ unitId, schoolName: 'Syntetiska gymnasiet', canRead: { programplan: true, gymnasium: true, grundskola: false, introduktionsprogram: false } }] };
    else if (path === '/api/elever/urval') json = { scope: { schools: [{ id: unitId, name: 'Syntetiska gymnasiet' }], groups: [], cases: [] }, schoolYears: [schoolYear], currentSchoolYear: schoolYear, endsAt: null, approverName: null, purposeCode: null, serverNow: at };
    else if (path === '/api/planering/lista') json = { selection: body, selectionRevision: `sha256:${'b'.repeat(64)}`, count: 0, pageSize: 50, rows: [] };
    else if (path === '/api/planbeslut/inkorg') json = { items: [], total: 0, actionCount: 0, decisionCount: 0, truncated: false };
    else if (path === '/api/planbeslut/underlag') return route.fulfill({ status: 409, json: { code: 'conflict', message: 'Syntetiskt separat beslutsprov' } });
    else if (path === '/api/timplaner/gym/lasa') json = gym();
    else if (path === '/api/valplaner/lasa') json = valplanRead();
    else if (path === '/api/valplaner/kommando') { const c = parseValplanCommand(body); s.writes.push('save'); json = saveBlock(c); }
    else if (path === '/api/valplaner/val/lasa') json = choiceRead();
    else if (path === '/api/valplaner/val/kommando') { const c = parseValplanChoiceCommand(body); s.writes.push(c.action); json = runChoice(c); }
    else if (path === '/api/valplaner/egen/lasa') json = selfRead();
    else if (path === '/api/valplaner/egen/kommando') { const c = parseValplanSelfCommand(body); s.writes.push(c.action); json = runSelf(c); }
    else if (path === '/api/valbara-block/egen/urval') json = { contractVersion: 'elective_self_v1', epoch: 1, identityReference: id(71), participants: [{ ...person, participant: 'pupil', confirmationRequired: false }] };
    else if (path === '/api/valbara-block/egen/lasa') json = { contractVersion: 'elective_self_v1', epoch: 1, participant: { ...person, participant: 'pupil', confirmationRequired: false }, policy: { unitId, revision: 1, guardianConfirmation: !!s.guardian }, offers: [], choices: [], confirmations: [], placements: [] };
    else if (path === '/api/valbara-block/lasa') json = { contractVersion: 'elective_block_v1', unitId, schoolYear, schoolName: 'Syntetiska gymnasiet', revision: 1, canManage: true, canReadPupils: true, policy: { unitId, revision: 1, guardianConfirmation: false }, sources: [], blocks: [], pupils: [], rounds: [], choices: [], placements: [] };
    else if (path === '/api/undervisningsgrupper/lasa') json = groupRead();
    else if (path === '/api/undervisningsgrupper/kommando') { parseStudyGroupCommand(body); s.unexpected.push(path); return route.fulfill({ status: 500, json: { code: 'unexpected' } }); }
    else if (path === '/api/tjanst/plan/lasa') json = tjanstRead();
    else { s.unexpected.push(path); return route.fulfill({ status: 500, json: { code: 'unexpected', message: path } }); }
    await route.fulfill({ json, headers });
  });
  return { state: s, block, verify() { expect(s.errors).toEqual([]); expect(s.unexpected).toEqual([]); } };
}
