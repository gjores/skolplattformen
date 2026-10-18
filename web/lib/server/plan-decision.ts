import { parseTimplanTimeCells, TIMPLAN_TIME_MODEL_V2, timplanTimeTotals } from '../timplan-time.ts';
import { gymArray, gymShape, gymObject, gymRowKey, parseGymTimplanHours, parseTimplanTimeCopyReview } from '../gym-timplan.ts';
import { parseLegacyPlanDecisionDetail, parsePlanDecisionDetail, parsePlanDecisionInbox, parsePlanDecisionPage, type PlanDecisionDetail, type PlanDecisionQuery, type PlanDecisionCommand, type PlanDecisionRead } from '../plan-decision.ts';
import { projectSource } from './gym-timplan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';
import { projectAplPlan } from '../apl-plan.ts';
import { projectAplFrozenRead, type AplProjectionAuthority } from './apl-plan.ts';
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

function sameJson(left: unknown,right: unknown): boolean {
  function ordered(value: unknown): unknown {
    if (Array.isArray(value)) return value.map(ordered);
    if (value !== null && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(key=>[key,ordered((value as Record<string,unknown>)[key])]));
    return value;
  }
  return JSON.stringify(ordered(left)) === JSON.stringify(ordered(right));
}

/** Independently validate the frozen catalog, rows and allocations before the protected transaction commits. */
export async function projectPlanDecision(value: unknown, expected: PlanDecisionRead, authority: AplProjectionAuthority,
  command: PlanDecisionCommand | null = null): Promise<PlanDecisionDetail> {
  const envelope = gymShape(value,['contractVersion','resultContract','replayed','result','aplBasis']);
  if (envelope.contractVersion !== 'apl_decision_sql_v1' || typeof envelope.replayed !== 'boolean'
    || !['legacy','apl_decision_v1','timetable_decision_v2'].includes(String(envelope.resultContract)) || !command && envelope.replayed) throw new TypeError('Invalid decision envelope');
  const separated = envelope.resultContract === 'timetable_decision_v2';
  const legacy = envelope.resultContract === 'legacy', result = gymObject(envelope.result);
  if (legacy && (!command || !envelope.replayed || envelope.aplBasis !== null || Object.hasOwn(result,'contractVersion') || Object.hasOwn(result,'apl'))) throw new TypeError('Invalid legacy dispatch');
  const keys = legacy ? DETAIL_KEYS.filter(key => key !== 'series' || Object.hasOwn(result,'series')) : [...DETAIL_KEYS,'contractVersion','apl'];
  const v2 = Object.hasOwn(result, 'timeModel');
  if (v2 && (legacy || expected.kind !== 'timplan' || result.timeModel !== TIMPLAN_TIME_MODEL_V2)) throw new TypeError('Invalid decision time model');
  const raw = gymShape(result, [...keys, 'source','catalog', ...(v2 ? ['timeModel', 'timeRows', ...(separated ? ['timeCopyReview'] : [])] : ['hours'])]);
  const { source: sourceValue, catalog: catalogValue, hours: hoursValue, timeModel: _timeModel, timeRows: timeRowsValue, timeCopyReview: timeCopyReviewValue, ...detail } = raw;
  const body = legacy ? parseLegacyPlanDecisionDetail(detail,expected) : parsePlanDecisionDetail(detail, expected);
  if (body.contractVersion !== envelope.resultContract || separated && envelope.aplBasis !== null) throw new TypeError('Invalid decision dispatch');
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
  const timeRows = v2 ? parseTimplanTimeCells(timeRowsValue, rows, profile?.vocational === true) : null;
  const hours = gymArray(v2 ? [] : hoursValue,2000).map(value => {
    const r = gymShape(value,['rowKey','hours']); return {rowKey:gymRowKey(r.rowKey),hours:parseGymTimplanHours(r.hours)};
  });
  if (expected.kind === 'programplan' && hours.length) throw new TypeError('Invalid program hours');
  if (timeRows) {
    if (separated && parseTimplanTimeCopyReview(timeCopyReviewValue).some(item => item.resolution === null)) blockers.push('Kopieringen har tidsrader som behöver granskas innan timplanen godkänns.');
    const totals = timplanTimeTotals({ rows, timeRows }, profile?.vocational === true);
    if (!totals.complete || rows.some(row => [...timeRows[row.key].schoolMinutes, ...timeRows[row.key].annualAplMinutes].reduce<number>((sum, n) => sum + (n ?? 0), 0) === 0)) blockers.push('Fördela undervisningstid på varje rad och i alla aktiva terminsfält.');
    if (profile && totals.totalMinutes < profile.hours * 60) blockers.push(`Timplanen innehåller färre än ${formatCount(profile.hours)} planerade undervisningstimmar.`);
  } else if (expected.kind === 'timplan') {
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
  if (profile?.vocational) expectedChecks.push('eligibility', separated ? 'apl-budget' : 'apl');
  if (body.checks.length !== expectedChecks.length || expectedChecks.some(id=>!body.checks.some(check=>check.id===id))) throw new TypeError('Invalid decision checks');
  if (!legacy) {
    const requiresApl = !separated && expected.kind === 'timplan' && profile?.vocational === true;
    if (requiresApl !== (body.apl != null) || requiresApl !== (envelope.aplBasis !== null)) throw new TypeError('Invalid APL decision profile');
    if (body.apl) {
      const {context,basis} = await projectAplFrozenRead(body.apl.detail,envelope.aplBasis,expected.planId,authority);
      const gym = basis.gymTimplan, plan = context.plan;
      if (!sameJson(raw.source,gym.source) || !sameJson(raw.catalog,gym.catalog) || !(v2 ? gym.timeModel === TIMPLAN_TIME_MODEL_V2 && sameJson(timeRows, gym.timeRows) : !Object.hasOwn(gym, 'timeModel') && sameJson(Object.fromEntries(hours.map(row=>[row.rowKey,row.hours])),gym.hours))
        || body.offeringId !== plan.offeringId || body.unitId !== plan.unitId || body.version !== plan.version
        || body.revision !== plan.revision || body.schoolName !== plan.schoolName || !sameJson(body.series,plan.series)
        || body.stage !== ({utkast:'draft',forslag:'submitted',atersand:'returned',faststalld:'approved',ersatt:'replaced'} as const)[plan.status]) {
        throw new TypeError('Mismatched frozen decision snapshots');
      }
      const projected = projectAplPlan(context,body.apl.detail.plan), expectedBlockers = projected.issues.filter(issue=>issue.level==='blocker').map(issue=>issue.message);
      const latest = body.apl.detail.confirmations.at(-1), current = latest?.contentHash === body.apl.detail.contentHash ? latest.id : null;
      if (!current) expectedBlockers.push(latest
        ? 'APL-underlaget eller timplanens innehåll har ändrats. Rektor behöver granska och bekräfta förläggningen igen.'
        : 'Rektor behöver bekräfta APL-förläggningen för det aktuella innehållet.');
      if (!sameJson(body.apl.blockers,expectedBlockers) || body.apl.currentConfirmationId !== current || body.apl.ready !== (expectedBlockers.length === 0)) throw new TypeError('Invalid APL decision readiness');
      if (!['approved','replaced'].includes(body.stage) && expectedBlockers.length
        && !sameJson(body.blockers.slice(-expectedBlockers.length),expectedBlockers)) throw new TypeError('Missing APL decision blockers');
    }
  }
  // Historical replay returns its stored presentation. It is not reclassified by new APL requirements.
  const projected: PlanDecisionDetail = legacy ? body : {...body,blockers:[...new Set(blockers)]};
  if (command) {
    const stage = {submit:'submitted',return:'returned',approve:'approved',withdraw:'draft'}[command.action];
    if (projected.stage !== stage || projected.decisionRevision !== command.expectedDecisionRevision+1
      || projected.revision !== command.expectedRevision + (command.kind === 'timplan' || command.action === 'approve' ? 1 : 0)) throw new TypeError('Invalid decision command result');
    if ((command.action === 'submit' || command.action === 'approve') && !envelope.replayed
      && (projected.blockers.length || command.confirmedChecks.length !== projected.checks.length || projected.checks.some(check=>!command.confirmedChecks.includes(check.id))
        || projected.apl && !projected.apl.ready)) throw new Deny('plan_decision_blocked',409);
  }
  return projected;
}
export async function readPlanDecision(tx: Tx, input: PlanDecisionRead, authority: AplProjectionAuthority) {
  const raw = one(await operation(()=>tx<{result:unknown}[]>`select public.phase5_plan_decision_basis(${input.kind},${input.planId}) as result`));
  try { return {body:await projectPlanDecision(raw,input,authority),event:{action:'plan_decision_basis_read',objectType:input.kind,objectId:input.planId}}; }
  catch { throw new AuditUnavailable(); }
}
export async function readPlanDecisionInbox(tx: Tx) {
  const raw = one(await operation(()=>tx<{result:unknown}[]>`select public.phase5_plan_decision_inbox() as result`));
  try { const body=parsePlanDecisionInbox(raw); if(body.items.some(item=>!Object.hasOwn(item,'series'))) throw new TypeError(); return {body,event:{action:'plan_decision_inbox_read',objectType:'plan_decision_collection',objectId:null}}; }
  catch { throw new AuditUnavailable(); }
}
export async function commandPlanDecision(tx: Tx, input: PlanDecisionCommand, authority: AplProjectionAuthority) {
  // SQL replays the stored reply only after rechecking the current mandate and exact request identity.
  const raw = one(await operation(()=>tx<{result:unknown}[]>`select public.phase5_plan_decision_command(${tx.json(input)}::jsonb) as result`));
  let body;
  try { body = await projectPlanDecision(raw,input,authority,input); }
  catch (error) { if (error instanceof Deny) throw error; throw new AuditUnavailable(); }
  return {body,event:{action:'plan_decision_command',objectType:input.kind,objectId:input.planId}};
}
export function decisionRequest<T>(parse:(value:unknown)=>T,value:unknown):T { try {return parse(value);} catch {throw new Deny('bad_request',400);} }

export async function readPlanDecisionPage(tx: Tx, input: PlanDecisionQuery) {
  const raw = one(await operation(() => tx<{result:unknown}[]>`select public.phase5_plan_decision_page(${tx.json(input)}::jsonb) as result`));
  try { const body=parsePlanDecisionPage(raw,input); if(body.items.some(item=>!Object.hasOwn(item,'series'))) throw new TypeError(); return {body,event:{action:'plan_decision_inbox_read',objectType:'plan_decision_collection',objectId:null}}; }
  catch { throw new AuditUnavailable(); }
}
