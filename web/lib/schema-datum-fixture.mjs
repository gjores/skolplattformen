// Endast syntetiskt domänunderlag för datumprov; ingen databas eller autentisering.
import { defaultSchemaVillkor } from './schema-contract.ts';
import { buildSchemaUnderlag, schemaForslag } from './schema-underlag.ts';
import { schemaTime } from './schema-kalender.ts';
import { schemaDatumOriginal } from './schema-datum.ts';
export const datumId = n => `73111600-0000-4000-8000-${String(n).padStart(12, '0')}`;
export function datumFixture({ block = false, year = false, onlyTerm = null } = {}) {
  const id = datumId, unitId = id(1), schoolYear = 2026;
  const classes = [10, 11].map((n, i) => ({ classId: id(n), name: `Provklass ${i + 1}`, link: null, aplMinutes: null,
    needs: [{ sourceKind: 'class_timplan', sourceKey: `class_timplan:${id(n)}:2026:prov`, rowKey: 'prov', label: i === 0 ? 'Matematik' : 'Historia', needHt: 900, needVt: 900, needBasis: 'terms' }] }));
  const group = { sourceKind: 'teaching_group', sourceKey: `teaching_group:${id(40)}`, rowKey: `group:${id(40)}`, label: 'Franska', needHt: 900, needVt: 900, needBasis: 'terms',
    groupId: id(40), name: 'Franska', language: null, groupRevision: 1, classIds: [id(10), id(11)], sourceRefs: [], stale: false, blockId: block ? id(45) : null, optionId: block ? id(46) : null, subjectCode: 'X', levelCode: '1' };
  const teachers = [20, 21, 22].map((n, i) => ({ personId: id(n), displayName: `Provlärare ${i + 1}`, draft: false, shareHere: 100 }));
  const rows = [...classes.map((c, i) => ({ id: id(50 + i), lineageId: id(60 + i), sourceKind: 'class_timplan', sourceKey: c.needs[0].sourceKey, classId: c.classId, rowKey: 'prov', personId: teachers[i].personId,
    teacherHt: 900, teacherVt: 900, needHt: 900, needVt: 900, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' })),
    { id: id(52), lineageId: id(62), sourceKind: 'teaching_group', sourceKey: group.sourceKey, classId: null, rowKey: group.rowKey, groupId: group.groupId,
      personId: teachers[2].personId, teacherHt: 900, teacherVt: 900, needHt: 900, needVt: 900, needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }];
  const plan = { contractVersion: 1, unitId, schoolYear, schoolName: 'Syntetisk datumskola', revision: 1, version: null, versions: [], teachers, classes, groups: [group], rows,
    specials: [], joints: [], sharing: [], actions: [], blockers: [], capabilities: { canEdit: true } };
  if (onlyTerm) {
    const absent = onlyTerm === 'ht' ? 'Vt' : 'Ht';
    group[`need${absent}`] = 0;
    rows.at(-1)[`need${absent}`] = 0; rows.at(-1)[`teacher${absent}`] = 0;
  }
  const calendar = { versionId: id(70), version: 1, status: 'faststalld', revision: 1, terms: { ht: { start: '2026-08-17', end: '2026-12-18' }, vt: { start: '2027-01-11', end: '2027-06-11' } },
    exceptions: { '2026-11-09': { kind: 'lovdag' } }, groupDays: {}, shortWeeks: {}, frameVersionId: null, contentHash: 'synthetic', decidedOn: '2026-03-18', history: [] };
  const time = schemaTime({ target: { kind: 'school', unitId }, schoolYear, calendar, versions: [{ versionId: id(70), current: true }],
    groups: classes.map(c => ({ scope: 'klass', classId: c.classId, offeringId: id(99), columnId: null, label: c.name, educationName: 'Provutbildning', kind: 'gy' })) }, classes.map(c => c.classId));
  const basis = { time, members: { pupils: [{ id: id(80), classIds: [id(10), id(11)] }], memberships: [{ groupId: group.groupId, pupilId: id(80), startsOn: '2026-08-17', endsOn: '2027-06-11' }] } };
  const villkor = { ...defaultSchemaVillkor(), lunch: null, breakMin: 0, sameDay: 'allow', lateAfterMin: null, salar: ['Provsal A', 'Provsal B'],
    egna: ['Matematik', 'Historia', 'Franska'].map(ref => ({ slag: 'amne', ref, typ: 'sal', rooms: ['Provsal A', 'Provsal B'] })) };
  // De ursprungliga datumfallen verifierar sparade terminsmönster; årsmodellen väljs uttryckligen.
  if (year) villkor.timeBasis = 'lasar'; else delete villkor.timeBasis;
  const request = { unitId, schoolYear, period: 'lasar', villkor }, underlag = buildSchemaUnderlag(plan, request, basis);
  const placements = underlag.labels.lessons.map(l => ({ lesson: l.id, day: l.title === 'Franska' ? 1 : 0, startMin: 480, room: l.title === 'Matematik' ? 'sal-1' : 'sal-2' }));
  const f = schemaForslag(plan, request, underlag, { status: 'complete', placements, unplaced: [], diagnoses: [], elapsedMs: 0, metrics: { studentGapMin: 0, teacherGapMin: 0 } });
  const of = (title, term = 'ht') => f.lessons.find(l => l.title === title && (l.term === null || l.term === term));
  const datedBasis = { unitId, schoolYear, complete: true,
    placements: [{ id: id(90), pupilId: id(80), startsOn: '2026-07-01', endsOn: '2027-06-30' }],
    classMemberships: [{ placementId: id(90), pupilId: id(80), classId: id(10), startsOn: '2026-07-01', endsOn: '2026-11-02' },
      { placementId: id(90), pupilId: id(80), classId: id(11), startsOn: '2026-11-03', endsOn: '2027-06-30' }],
    groups: [{ id: group.groupId, active: true, startsOn: '2026-08-17', endsOn: '2027-06-11' }],
    memberships: [{ groupId: group.groupId, pupilId: id(80), startsOn: '2026-08-17', endsOn: '2027-06-11' }] };
  const change = (date = '2026-11-02', extra = {}) => {
    const lesson = of('Franska'), original = schemaDatumOriginal(f, { lesson: lesson.id, originalDate: '2026-11-03' });
    return { lesson: lesson.id, originalDate: '2026-11-03', date, startMin: 480, room: 'sal-2', durationMin: original.length, ...extra };
  };
  return { id, plan, basis, datedBasis, request, underlag, f, of, placements, change };
}
