// Stateful preview responses live in the Playwright process and survive a browser reload.
import { expect, type Page } from '@playwright/test';
import {
  parseStudyPlanCommand, parseStudyPlanReadRequest, parseStudyPlanStatusRequest,
  STUDY_PLAN_CONTRACT_VERSION, type StudyPlanCommand, type StudyPlanCurrentReply, type StudyPlanReceipt,
  type StudyPlanScope,
} from '../../lib/study-plan-contract.ts';
import { studyPlanAt, studyPlanContentIssues, type StudyPlanContent, type StudyPlanSnapshot } from '../../lib/study-plan-model.ts';
import type { PupilCard, PupilListItem } from '../../lib/pupil-register-model.ts';

const id = (n: number) => `77101200-0000-4000-8000-${String(n).padStart(12, '0')}`;
const token = `sha256:${'f'.repeat(64)}`;
const on = '2026-10-12';
type Role = 'administrator' | 'rektor';
type FixturePupil = PupilListItem & { placementId: string; programCode: string; orientationCode: string };
const capabilities = { canEdit: false, canExport: false, canRevealPersonalNumber: false, canReadHistory: false };
export const studyPreviewPupils: Record<'sa' | 'bf', FixturePupil> = {
  sa: { id: id(50), displayName: 'Exempelelev Alfa', unitId: id(2), unitName: 'Exempelskolan Nord', classId: id(60), className: 'SA26',
    educationId: id(10), educationName: 'Samhällsvetenskap', grade: 1, status: 'aktuell', capabilities,
    placementId: id(450), programCode: 'SA25', orientationCode: 'SABEP' },
  bf: { id: id(51), displayName: 'Exempelelev Beta', unitId: id(3), unitName: 'Exempelskolan Syd', classId: id(61), className: 'BF26',
    educationId: id(11), educationName: 'Barn och fritid', grade: 1, status: 'aktuell', capabilities,
    placementId: id(451), programCode: 'BF25', orientationCode: 'BFPES' },
};

export function studyPreviewListPupils(): PupilListItem[] {
  return Object.values(studyPreviewPupils).map(({ placementId: _placement, programCode: _program, orientationCode: _orientation, ...pupil }) => pupil);
}

function scopeOf(pupil: FixturePupil): StudyPlanScope {
  return { contractVersion: STUDY_PLAN_CONTRACT_VERSION, pupilId: pupil.id, unitId: pupil.unitId, placementId: pupil.placementId };
}

const levelName = 'Engelska · Nivå 1';
function contentFor(pupil: FixturePupil): StudyPlanContent {
  return {
    path: { regime: 'national_gy25', programCode: pupil.programCode, orientationCode: pupil.orientationCode,
      apprenticeship: false, specialVariantCode: null },
    source: { offeringId: pupil.educationId, placementStartsOn: '2026-08-17', placementEndsOn: null,
      catalogId: token, programVersion: 1, choices: [] },
    levels: [
      { id: id(401), kind: 'gy25_level', subjectCode: 'ENGE', subjectVersion: 1, itemCode: 'ENGE1000X', points: 100, label: levelName,
        languageCode: null, attempts: [{ id: id(402), plannedStart: null, plannedEnd: null, actual: { certainty: 'recorded', start: null, end: null } }] },
      { id: id(403), kind: 'diploma_work', subjectCode: null, subjectVersion: null, itemCode: `GYAR${pupil.programCode}`, points: 100,
        label: 'Gymnasiearbete', languageCode: null,
        attempts: [{ id: id(404), plannedStart: null, plannedEnd: null, actual: { certainty: 'recorded', start: null, end: null } }] },
    ],
    choices: [], decisions: [], dialogue: null, compulsorySchoolSubjects: [],
    distanceTeaching: { kind: 'none', minutes: null }, sourceIssues: [],
  };
}

export async function mockStudyPlan(page: Page, options: { pupil: FixturePupil; readRole: () => Role; initial?: 'published' }) {
  const { pupil, readRole } = options;
  const scope = scopeOf(pupil), planId = id(pupil.programCode === 'SA25' ? 420 : 421);
  const headers = { 'X-Context-Epoch': '1', 'Cache-Control': 'no-store' };
  const snapshots: StudyPlanSnapshot[] = [];
  const commands: StudyPlanCommand[] = [];
  const receipts = new Map<string, { command: StudyPlanCommand; receipt: StudyPlanReceipt }>();
  let calendar: StudyPlanCurrentReply['calendar'] = [];
  let allowed = true, forceConflict = false, holdNext: Promise<void> | null = null;
  const history = () => [...snapshots].reverse().map(({ content: _content, ...revision }) => revision);
  const save = (content: StudyPlanContent, effectiveOn: string | null = null): StudyPlanSnapshot => {
    const version: StudyPlanSnapshot = { planId, revision: snapshots.length + 1, state: effectiveOn === null ? 'draft' : 'current',
      effectiveOn, recordedAt: on + 'T10:00:00.000Z', content };
    snapshots.push(version);
    return version;
  };
  if (options.initial === 'published') {
    const content = contentFor(pupil);
    const attempt = content.levels[0].attempts[0];
    attempt.plannedStart = { kind: 'day', date: '2026-08-17' };
    attempt.plannedEnd = { kind: 'day', date: '2026-10-01' };
    attempt.actual.start = { on: '2026-08-19', source: { kind: 'school_record', id: id(480) } };
    save(content, '2026-09-01');
  }

  await page.route('**/api/elever/elev?*', async route => {
    const request = new URL(route.request().url());
    expect(request.searchParams.get('pupilId')).toBe(pupil.id);
    const { placementId, programCode: _program, orientationCode: _orientation, ...row } = pupil;
    const card: PupilCard = { ...row, version: 1,
      placements: [{ id: placementId, unitId: pupil.unitId, educationId: pupil.educationId, startsOn: '2026-08-17', endsOn: null }],
      classes: [{ id: id(405), classId: pupil.classId!, placementId, startsOn: '2026-08-17', endsOn: null }],
    };
    await route.fulfill({ json: card, headers });
  });

  await page.route('**/api/studieplaner/**', async route => {
    const request = route.request(), path = new URL(request.url()).pathname, body = request.postDataJSON();
    expect(request.method()).toBe('POST');
    expect({ unitId: body.unitId, pupilId: body.pupilId, placementId: body.placementId }).toEqual({ unitId: pupil.unitId, pupilId: pupil.id, placementId: pupil.placementId });
    if (!allowed) return route.fulfill({ status: 403, json: { code: 'forbidden', correlationId: 'synthetic-study-plan' }, headers });

    if (path === '/api/studieplaner/lasa') {
      const read = parseStudyPlanReadRequest(body);
      const latest = snapshots.at(-1) ?? null, current = studyPlanAt(snapshots, read.on);
      if (read.view === 'history') return route.fulfill({ json: { ...scope, view: read.view, on: read.on,
        version: read.revision === undefined ? current : snapshots.find(r => r.revision === read.revision) ?? null, history: history() }, headers });
      if (read.view === 'options') return route.fulfill({ json: { ...scope, view: read.view, on: read.on, status: 'unavailable', options: [] }, headers });
      expect(read.view).toBe('current');
      const result: StudyPlanCurrentReply = { ...scope, on: read.on, view: 'current',
        current, draft: latest?.state === 'draft' ? latest : null, history: history(), latestRevision: latest?.revision ?? 0,
        canMakeCurrent: readRole() === 'rektor', sourceToken: token, basisStatus: 'ready', basisIssues: [], availableLevels: [], calendar,
      };
      return route.fulfill({ json: result, headers });
    }

    if (path === '/api/studieplaner/status') {
      const request = parseStudyPlanStatusRequest(body);
      return route.fulfill({ json: { ...request, receipt: receipts.get(request.commandId)?.receipt ?? null }, headers });
    }
    expect(path).toBe('/api/studieplaner/kommando');
    const command = parseStudyPlanCommand(body);
    commands.push(command);
    const reply = { ...scope, commandId: command.commandId };
    const prior = receipts.get(command.commandId);
    if (prior) {
      expect(prior.command).toEqual(command);
      return route.fulfill({ json: { ...reply, status: 'saved', receipt: prior.receipt }, headers });
    }
    if (holdNext) {
      const pending = holdNext;
      holdNext = null;
      await pending;
    }
    if (forceConflict || command.expectedRevision !== snapshots.length) {
      forceConflict = false;
      return route.fulfill({ json: { ...reply, status: 'conflict', reason: 'revision', latestRevision: snapshots.length }, headers });
    }
    expect(command.expectedSourceToken).toBe(token);
    const content = structuredClone(snapshots.at(-1)?.content ?? contentFor(pupil));
    let effectiveOn = null;
    switch (command.action) {
      case 'prepare_draft':
        if (command.payload.apprenticeship !== undefined) content.path.apprenticeship = command.payload.apprenticeship;
        if (command.payload.distanceTeaching) content.distanceTeaching = command.payload.distanceTeaching;
        if (command.payload.compulsorySchoolSubjects !== undefined) content.compulsorySchoolSubjects = command.payload.compulsorySchoolSubjects;
        for (const dates of command.payload.dates) {
          const attempt = content.levels.find(level => level.id === dates.levelId)?.attempts.find(row => row.id === dates.attemptId);
          expect(attempt).toBeDefined();
          Object.assign(attempt!, { plannedStart: dates.plannedStart, plannedEnd: dates.plannedEnd });
        }
        content.dialogue = null;
        break;
      case 'record_dialogue':
        content.dialogue = { on: command.payload.on, reviewedRevision: command.expectedRevision };
        break;
      case 'make_current': {
        expect(readRole()).toBe('rektor');
        const issues = studyPlanContentIssues(content);
        if (!content.dialogue) issues.push({ code: 'dialogue_required', field: 'dialogue' });
        if (issues.length) return route.fulfill({ json: { ...reply, status: 'incomplete', issues }, headers });
        effectiveOn = command.payload.effectiveOn;
        break;
      }
      case 'record_actual': {
        const payload = command.payload;
        const row = content.levels.find(level => level.id === payload.levelId)?.attempts.find(attempt => attempt.id === payload.attemptId);
        expect(row).toBeDefined();
        const { kind, ...fact } = payload.event;
        if (kind === 'started') row!.actual.start = fact;
        else row!.actual.end = { kind, ...fact };
        content.dialogue = null;
        break;
      }
      case 'record_decision':
        expect(readRole()).toBe('rektor');
        content.decisions.push(command.payload.decision);
        content.dialogue = null;
    }
    const snapshot = save(content, effectiveOn);
    const receipt = { commandId: command.commandId, action: command.action, snapshot };
    receipts.set(command.commandId, { command, receipt });
    return route.fulfill({ json: { ...reply, status: 'saved', receipt }, headers });
  });

  return {
    planId, levelName, snapshots, commands,
    addCalendar() {
      calendar = [{ schoolYear: 2028, htStart: '2028-08-21', htEnd: '2028-12-22', vtStart: '2029-01-10', vtEnd: '2029-06-13' }];
    },
    deny() { allowed = false; },
    conflict() {
      const previous = snapshots.at(-1);
      if (previous) save(structuredClone(previous.content));
      forceConflict = true;
    },
    holdCommand() {
      let release!: () => void;
      holdNext = new Promise(resolve => { release = resolve; });
      return release;
    },
  };
}
