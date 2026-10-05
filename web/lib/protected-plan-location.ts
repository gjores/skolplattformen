export type ProgramplanLocation = { offeringId: string; planId: string };
export type GymTimplanLocation = { kind: 'source' | 'plan'; id: string };
export type PlanLocation = { view: 'programplaner'; programplan: ProgramplanLocation | null }
  | { view: 'timplaner'; gym: GymTimplanLocation | null };
const validId = (value: string | null): value is string => value !== null && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(value);
export function readPlanLocation(search: string): PlanLocation | null {
  const params = new URLSearchParams(search), view = params.get('vy');
  if (view === 'programplaner') {
    const offeringId = params.get('utbildning'), planId = params.get('programplan');
    return { view, programplan: validId(offeringId) && validId(planId) ? { offeringId, planId } : null };
  }
  if (view === 'timplaner') {
    const planId = params.get('timplan'), sourceId = params.get('programunderlag');
    return { view, gym: validId(planId) ? { kind: 'plan', id: planId } : validId(sourceId) ? { kind: 'source', id: sourceId } : null };
  }
  return null;
}
export function planLocationQuery(location: PlanLocation): string {
  const params = new URLSearchParams({ vy: location.view });
  if (location.view === 'programplaner' && location.programplan) {
    params.set('utbildning', location.programplan.offeringId); params.set('programplan', location.programplan.planId);
  } else if (location.view === 'timplaner' && location.gym) {
    params.set(location.gym.kind === 'plan' ? 'timplan' : 'programunderlag', location.gym.id);
  }
  return `?${params}`;
}
