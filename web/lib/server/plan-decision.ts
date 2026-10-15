import { gymArray, gymShape, gymRowKey, parseGymTimplanHours } from '../gym-timplan.ts';
import { parsePlanDecisionDetail, parsePlanDecisionInbox, parsePlanDecisionPage, type PlanDecisionQuery, type PlanDecisionCommand, type PlanDecisionRead } from '../plan-decision.ts';
import { projectSource } from './gym-timplan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';
import { programplanProfile } from '../programplan-profile.ts';

const DETAIL_KEYS = ['series','kind','planId','offeringId','unitId','educationName','schoolName','version','stage','nextActor','revision','decisionRevision','basisHash','actions','blockers','checks','history','sourceInfo'];
const formatCount = (value: number) => value.toLocaleString('sv-SE').replaceAll('\u00a0', ' ');
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await mandateOperation(async () => {
    try { return await fn(); } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && error.code === '40001' && 'hint' in error
        && (error.hint === 'plan_decision_conflict' || error.hint === 'plan_decision_blocked')) throw new Deny(error.hint,409);
      throw error;
    }
  }); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === '55000') throw new AuditUnavailable();
    throw error;
  }
}
function one(rows: {result: unknown}[]): unknown { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }

/** Independently validate the frozen catalog, rows and allocations before the protected transaction commits. */
export async function projectPlanDecision(value: unknown, expected: PlanDecisionRead) {
  const raw = gymShape(value, [...DETAIL_KEYS, 'source','catalog','hours']);
  const { source: sourceValue, catalog: catalogValue, hours: hoursValue, ...detail } = raw;
  const body = parsePlanDecisionDetail(detail, expected);
  const {source,rows,readiness} = await projectSource(sourceValue,catalogValue);
  if (source.projected.offeringId !== body.offeringId || (expected.kind === 'programplan' && source.projected.planId !== expected.planId)) throw new TypeError('Invalid decision source');
  const blockers = [...body.blockers,...readiness.missing];
  const catalog = catalogValue as {programs?: {code:string;category:string;startDate:string|null;endDate:string|null;canceledDate:string|null}[]} | null;
  const program = catalog?.programs?.find(p => p.code === source.basis?.programRef.code);
  const profile = program ? programplanProfile(program) : null;
  const started = source.basis?.startedOn;
  if (!program || !profile
    || !started || started < '2025-07-01' || !program.startDate || started < program.startDate
    || program.endDate && started > program.endDate || program.canceledDate && started >= program.canceledDate) {
    blockers.push('Beslutsreglerna är inte verifierade för den här programtypen och elevkullen.');
  }
  if (profile && rows.reduce((sum,row) => sum+row.points,0) !== profile.points) blockers.push(`Programplanen behöver omfatta exakt ${formatCount(profile.points)} poäng.`);
  if (profile?.vocational && started && started >= '2028-07-02') blockers.push('Beslutsregler för yrkesprov från höstterminen 2028 saknas. Den här elevkullen kan inte fastställas med gymnasiearbete som enda modell.');
  const hours = gymArray(hoursValue,2000).map(value => {
    const r = gymShape(value,['rowKey','hours']); return {rowKey:gymRowKey(r.rowKey),hours:parseGymTimplanHours(r.hours)};
  });
  if (expected.kind === 'programplan' && hours.length) throw new TypeError('Invalid program hours');
  if (expected.kind === 'timplan') {
    const allocations = new Map(hours.map(row => [row.rowKey,row.hours]));
    if (allocations.size !== hours.length || hours.some(row => !rows.some(r => r.key === row.rowKey))) throw new TypeError('Invalid time rows');
    let incomplete = false, total = 0;
    for (const row of rows) {
      const values = allocations.get(row.key);
      if (!values) { incomplete = true; continue; }
      if (values.some((hours,index) => row.pointTerms[index] === 0 && hours !== null && hours !== 0)) throw new TypeError('Inactive term hours');
      if (values.some((hours,index) => row.pointTerms[index] > 0 && hours === null) || values.reduce<number>((sum,hours)=>sum+(hours??0),0) === 0) incomplete = true;
      total += values.reduce<number>((sum,hours)=>sum+(hours??0),0);
    }
    if (incomplete) blockers.push('Fördela undervisningstid på varje rad och i alla aktiva terminsfält.');
    if (profile && total < profile.hours) blockers.push(`Timplanen innehåller färre än ${formatCount(profile.hours)} planerade undervisningstimmar.`);
  }
  const expectedChecks = expected.kind === 'programplan' ? ['structure','choices'] : ['teacher-led','choice-paths'];
  if (profile?.vocational) expectedChecks.push('eligibility','apl');
  if (body.checks.length !== expectedChecks.length || expectedChecks.some(id=>!body.checks.some(check=>check.id===id))) throw new TypeError('Invalid decision checks');
  return {...body,blockers:[...new Set(blockers)]};
}
export async function readPlanDecision(tx: Tx, input: PlanDecisionRead) {
  const raw = one(await operation(()=>tx<{result:unknown}[]>`select public.phase5_plan_decision_basis(${input.kind},${input.planId}) as result`));
  try { return {body:await projectPlanDecision(raw,input),event:{action:'plan_decision_basis_read',objectType:input.kind,objectId:input.planId}}; }
  catch { throw new AuditUnavailable(); }
}
export async function readPlanDecisionInbox(tx: Tx) {
  const raw = one(await operation(()=>tx<{result:unknown}[]>`select public.phase5_plan_decision_inbox() as result`));
  try { const body=parsePlanDecisionInbox(raw); if(body.items.some(item=>!Object.hasOwn(item,'series'))) throw new TypeError(); return {body,event:{action:'plan_decision_inbox_read',objectType:'plan_decision_collection',objectId:null}}; }
  catch { throw new AuditUnavailable(); }
}
export async function commandPlanDecision(tx: Tx, input: PlanDecisionCommand) {
  // SQL replays the stored reply only after rechecking the current mandate and exact request identity.
  const raw = one(await operation(()=>tx<{result:unknown}[]>`select public.phase5_plan_decision_command(${tx.json(input)}::jsonb) as result`));
  let body;
  try { body = await projectPlanDecision(raw,input); } catch { throw new AuditUnavailable(); }
  const stage = {submit:'submitted',return:'returned',approve:'approved',withdraw:'draft'}[input.action];
  if (body.stage !== stage || body.decisionRevision !== input.expectedDecisionRevision+1
    || body.revision !== input.expectedRevision + (input.kind === 'timplan' || input.action === 'approve' ? 1 : 0)) throw new AuditUnavailable();
  if (input.action === 'submit' || input.action === 'approve') {
    if (body.blockers.length || input.confirmedChecks.length !== body.checks.length || body.checks.some(check=>!input.confirmedChecks.includes(check.id))) throw new Deny('plan_decision_blocked',409);
  }
  return {body,event:{action:'plan_decision_command',objectType:input.kind,objectId:input.planId}};
}
export function decisionRequest<T>(parse:(value:unknown)=>T,value:unknown):T { try {return parse(value);} catch {throw new Deny('bad_request',400);} }

export async function readPlanDecisionPage(tx: Tx, input: PlanDecisionQuery) {
  const raw = one(await operation(() => tx<{result:unknown}[]>`select public.phase5_plan_decision_page(${tx.json(input)}::jsonb) as result`));
  try { const body=parsePlanDecisionPage(raw,input); if(body.items.some(item=>!Object.hasOwn(item,'series'))) throw new TypeError(); return {body,event:{action:'plan_decision_inbox_read',objectType:'plan_decision_collection',objectId:null}}; }
  catch { throw new AuditUnavailable(); }
}
