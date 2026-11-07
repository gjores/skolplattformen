export const id = (n: number) => `58200000-0000-4000-8000-${String(n).padStart(12, '0')}`;
export const scope = { unitId: id(1), schoolYear: 2027, valplanId: id(2) };
export const courses = [{ id: id(30), name: 'Psykologi – nivå 1', points: 50 }, { id: id(31), name: 'Filosofi – nivå 1', points: 50 }, { id: id(32), name: 'Retorik – nivå 1', points: 100 }];
export const classes = [{ id: id(20), name: 'SA26A' }, { id: id(21), name: 'SA26B' }];
export const pupil = (n: number, name: string, classId: string) => ({ id: id(n), name, classIds: [classId], targetPoints: 200, offeredCourseIds: courses.map(c => c.id), blockedCourses: [] as { courseId: string; reason: 'timplan' | 'val' }[], choice: null as unknown });
export function read() {
  return { contractVersion: 'valplan_choice_v1', ...scope, valplanName: 'Individuellt val 2027/28', valplanRevision: 1, guardianConfirmation: null as boolean | null, round: null as unknown, courses, classes, groupCourseIds: [] as string[],
    pupils: [pupil(60, 'Syntetisk Elev A', id(20)), pupil(61, 'Syntetisk Elev B', id(20)), { ...pupil(62, 'Syntetisk Elev C', id(21)), targetPoints: null, offeredCourseIds: [] }] };
}
export const person = { bindingId: id(70), unitId: id(1), schoolName: 'Provskolan', pupilId: id(60), pupilName: 'Syntetisk Elev A', bindingRevision: 1 };
