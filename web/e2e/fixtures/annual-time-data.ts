import { operationPlan, oid } from './operational-data';
import type { GymTimplanV2, GymTimplanLegacy } from '../../lib/gym-timplan';
import type { TimplanTimeJournalScope } from '../../lib/timplan-time-journal';
const { hours: _old, ...base } = operationPlan;
export const annualLegacy: GymTimplanLegacy = { ...operationPlan, status: 'utkast', canPlan: true, source: { ...operationPlan.source, education: { ...operationPlan.source.education, name: 'Bygg- och anläggningsprogrammet', programCode: 'BA25', orientationCode: null } }, series: { id: oid(50), name: 'BA26A', revision: 0 }, nameAtCreation: 'BA26A', hours: { [operationPlan.rows[0].key]: [80, 0, null, null, null, null] } };
export const annualPlan: GymTimplanV2 = { ...base, ...annualLegacy, timeModel: 'school_terms_annual_apl_v2', hours: undefined, timeRows: { [operationPlan.rows[0].key]: { schoolMinutes: [1200, 1200, null, null, null, null], annualAplMinutes: [3600, null, null] } }, timeCopyReview: [] } as unknown as GymTimplanV2;
delete (annualPlan as unknown as Record<string, unknown>).hours;
export const annualScope: TimplanTimeJournalScope = { identityKey: `sha256:${'1'.repeat(64)}`, customerId: oid(10), membershipId: oid(11), assignmentId: oid(12), organizerId: oid(13), unitId: annualPlan.unitId, planId: annualPlan.id, planVersion: 1, accessFunction: 'rektor' };
export const annualCopyPlan: GymTimplanV2 = { ...annualPlan, timeCopyReview: [{ id: oid(71), contractVersion: 'time_copy_review_v2', sourcePlanId: oid(72), sourceVersion: 1, rowKey: annualPlan.rows[0].key, reason: 'changed_source', row: { schoolMinutes: [4770, 0, null, null, null, null], annualAplMinutes: [30, null, null] }, resolution: null }] };
