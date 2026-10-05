import { analyseProgramplan } from '../programplan-analysis.ts';
import { parseProgramplanBasisReference, ProgramplanContractError, resolveProgramplanBasis, verifyProgramplanCatalog,
  type ProgramplanBasisReference } from '../programplan-catalog.ts';
import { programTotal } from '../programplan-table.ts';
import { parseProgramplanTermDistribution } from '../programplan-terms-contract.ts';
import { programplanLevelRanks, programplanTermRows, validateProgramplanTermDistribution } from '../programplan-terms.ts';
import {
  gymArray, gymBoolean, gymInteger, gymRowKey, gymShape, gymSourceStatus, gymUuid,
  parseGymTimplan, parseGymTimplanCreateReply, parseGymTimplanCurrentSource, parseGymTimplanEducation,
  parseGymTimplanRowReply, parseGymTimplanUnderlag, type GymTimplanCreateRequest, type GymTimplanReadRequest,
  type GymTimplanRow, type GymTimplanRowRequest, type GymTimplanSource, type GymTimplanUnderlagRequest,
} from '../gym-timplan.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { mandateOperation } from './mandate-route.ts';

type RawSource = {
  projected: GymTimplanSource; basis: ProgramplanBasisReference | null;
  distribution: ReturnType<typeof parseProgramplanTermDistribution>; rows: {key: string; points: number}[]; archived: boolean;
};
function bad(): never { throw new ProgramplanContractError('invalid_gym_timplan'); }
function rawSource(value: unknown): RawSource {
  const r = gymShape(value, ['planId', 'offeringId', 'version', 'revision', 'status', 'catalogId', 'basisReference', 'distribution', 'rows', 'educationRevision', 'education', 'archived']);
  const basis = r.basisReference === null ? null : parseProgramplanBasisReference(r.basisReference), education = parseGymTimplanEducation(r.education);
  if ((r.catalogId === null) !== (basis === null) || basis && (basis.catalogId !== r.catalogId
    || basis.programRef.code !== education.programCode || basis.orientationCode !== education.orientationCode)) bad();
  const rows = gymArray(r.rows, 2000).map(value => {
    const row = gymShape(value, ['key', 'points']); return { key: gymRowKey(row.key), points: gymInteger(row.points, 10000) };
  });
  if (new Set(rows.map(row => row.key)).size !== rows.length) bad();
  const distribution = parseProgramplanTermDistribution(r.distribution);
  if (!basis && (rows.length || distribution.length)) bad();
  return { projected: { planId: gymUuid(r.planId), offeringId: gymUuid(r.offeringId), version: gymInteger(r.version, 2147483647, 1), revision: gymInteger(r.revision),
    status: gymSourceStatus(r.status), catalogId: basis?.catalogId ?? null, startedOn: basis?.startedOn ?? null,
    educationRevision: gymInteger(r.educationRevision), education }, basis, distribution, rows, archived: gymBoolean(r.archived) };
}
async function projectSource(sourceValue: unknown, catalogValue: unknown) {
  const source = rawSource(sourceValue), missing: string[] = [];
  if (source.archived) missing.push('Utbildningen är arkiverad.');
  if (source.projected.status === 'ersatt') missing.push('Programplansversionen är ersatt. Välj den aktuella versionen.');
  if (!source.basis) {
    if (catalogValue !== null) bad();
    return { source, rows: [] as GymTimplanRow[], readiness: { ready: false, missing: [...missing, 'Den äldre programplanen saknar ett versionsbundet underlag. Skapa en komplett programplansversion.'] } };
  }
  const payload = gymShape(catalogValue, ['schemaVersion', 'source', 'subjects', 'programs']);
  // Verify the whole exact frozen artifact, never a browser projection or current repo catalog.
  const catalog = await verifyProgramplanCatalog({ ...payload, catalogId: source.projected.catalogId });
  const resolution = resolveProgramplanBasis(catalog, source.basis), program = catalog.programs.find(p => p.code === source.basis!.programRef.code);
  if (resolution.status !== 'resolved' || !program || program.version !== source.basis.programRef.version) {
    return { source, rows: [] as GymTimplanRow[], readiness: { ready: false, missing: [...missing, 'Programplanens versionsbundna underlag kan inte användas för tidsplanering.'] } };
  }
  const derived = programplanTermRows(program, source.basis);
  if (JSON.stringify(derived.map(row => ({ key: row.key, points: row.points }))) !== JSON.stringify(source.rows)) bad();
  validateProgramplanTermDistribution(derived, source.distribution);
  const byKey = new Map(source.distribution.map(row => [row.rowKey, row.points]));
  const rows: GymTimplanRow[] = derived.map(row => ({ ...row, pointTerms: byKey.get(row.key) ?? [0, 0, 0, 0, 0, 0],
    rowKind: row.key.startsWith('block:') ? 'block' : row.key.startsWith('alternative:') ? 'alternative' : row.key === 'meta:diplomaWork' ? 'diplomaWork' : 'fixed' }));
  if (programTotal(program) === null) missing.push('Yrkesprogrammets poängram är ännu inte verifierad för den här övergången.');
  if (source.basis.choiceBlocks === undefined) missing.push('Programplanen saknar den aktuella ramen för alternativa ämnen och valbara block.');
  const analysis = analyseProgramplan({ program, orientationCode: source.basis.orientationCode, refs: source.basis.specializationRefs,
    basisReference: source.basis, startedOn: source.basis.startedOn, sourceFetched: catalog.source.fetched,
    terms: { rows: derived, distribution: source.distribution, ranks: programplanLevelRanks(program) } });
  missing.push(...analysis.missing);
  const structuralUnresolved = resolution.unresolvedChoices.filter(choice => choice.kind !== 'program_rules_unverified' && choice.blockId !== 'specialization');
  if (structuralUnresolved.length) missing.push('Programplanens fasta ämnen och block är inte fullständiga.');
  const uniqueMissing = [...new Set(missing)];
  return { source, rows, readiness: { ready: uniqueMissing.length === 0 && analysis.ready, missing: uniqueMissing } };
}
async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await mandateOperation(async () => {
    try { return await fn(); }
    catch (error) {
      if (error && typeof error === 'object' && 'code' in error && 'hint' in error) {
        if (error.code === '40001' && error.hint === 'gym_timplan_source_not_ready') throw new Deny('gym_timplan_source_not_ready', 409);
        if (error.code === '42501' && error.hint === 'gym_timplan_archived') throw new Deny('gym_timplan_archived', 409);
      }
      throw error;
    }
  }); }
  catch (error) { if (error && typeof error === 'object' && 'code' in error && error.code === '55000') throw new AuditUnavailable(); throw error; }
}
function one(rows: {result: unknown}[]): unknown { if (rows.length !== 1) throw new AuditUnavailable(); return rows[0].result; }
async function projectPlan(value: unknown, expectedId: string) {
  const r = gymShape(value, ['id', 'offeringId', 'unitId', 'schoolName', 'version', 'revision', 'status', 'source', 'catalog', 'currentSource', 'hours', 'canPlan', 'archived']);
  const { source, rows, readiness } = await projectSource(r.source, r.catalog);
  const currentSource = parseGymTimplanCurrentSource(r.currentSource);
  const sourceChanged = currentSource === null || currentSource.planId !== source.projected.planId
    || currentSource.version !== source.projected.version || currentSource.revision !== source.projected.revision;
  const { catalog: _catalog, source: _source, ...rest } = r;
  const body = parseGymTimplan({ ...rest, source: source.projected, currentSource, rows, sourceChanged }, expectedId);
  return { body, readiness, frozenSource: source };
}
export async function readGymTimplanUnderlag(tx: Tx, input: GymTimplanUnderlagRequest) {
  const raw = one(await operation(() => tx<{result: unknown}[]>`select public.phase5_gym_timplan_underlag(${input.sourcePlanId}) as result`));
  try {
    const r = gymShape(raw, ['source', 'catalog', 'units']), projected = await projectSource(r.source, r.catalog);
    const body = parseGymTimplanUnderlag({ source: projected.source.projected, rows: projected.rows, readiness: projected.readiness, units: r.units }, input.sourcePlanId);
    return { body, event: { action: 'gym_timplan_basis_read', objectType: 'programplan', objectId: input.sourcePlanId } };
  } catch { throw new AuditUnavailable(); }
}
export async function readGymTimplan(tx: Tx, input: GymTimplanReadRequest) {
  const raw = one(await operation(() => tx<{result: unknown}[]>`select public.phase5_read_gym_timplan(${input.planId}) as result`));
  try {
    const { body } = await projectPlan(raw, input.planId);
    return { body, event: { action: 'gym_timplan_read', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}
export async function createGymTimplan(tx: Tx, input: GymTimplanCreateRequest) {
  const raw = one(await operation(() => tx<{result: unknown}[]>`select public.phase5_create_gym_timplan(
    ${input.commandId},${input.sourcePlanId},${input.expectedSourceRevision},${input.expectedEducationRevision},${input.unitId},${input.predecessorPlanId},${input.expectedPredecessorRevision}) as result`));
  let reply, projected;
  try {
    const r = gymShape(raw, ['reply', 'plan']); reply = parseGymTimplanCreateReply(r.reply, input); projected = await projectPlan(r.plan, reply.id);
    const plan = projected.body;
    if (plan.offeringId !== reply.offeringId || plan.unitId !== reply.unitId || plan.version !== reply.version || plan.revision !== reply.revision
      || plan.source.planId !== input.sourcePlanId || plan.source.revision !== input.expectedSourceRevision
      || plan.source.educationRevision !== input.expectedEducationRevision || reply.carriedRows + reply.resetRows !== plan.rows.length) bad();
  } catch { throw new AuditUnavailable(); }
  // The frozen snapshot is checked before the outer protected transaction commits.
  // Identical replay uses that same snapshot even if the live source has since changed.
  if (!projected.readiness.ready) throw new Deny('gym_timplan_source_not_ready', 409);
  return { body: reply, event: { action: 'gym_timplan_created', objectType: 'timplan', objectId: reply.id } };
}
export async function writeGymTimplanRow(tx: Tx, input: GymTimplanRowRequest) {
  const raw = one(await operation(() => tx<{result: unknown}[]>`select public.phase5_write_gym_timplan_row(
    ${input.planId},${input.expectedRevision},${input.rowKey},${tx.json(input.hours)}::jsonb) as result`));
  try {
    const body = parseGymTimplanRowReply(raw, input);
    return { body, event: { action: 'gym_timplan_row_changed', objectType: 'timplan', objectId: input.planId } };
  } catch { throw new AuditUnavailable(); }
}
export function gymTimplanRequest<T>(parse: (value: unknown) => T, value: unknown): T {
  try { return parse(value); } catch (error) { if (error instanceof ProgramplanContractError) throw new Deny('bad_request', 400); throw error; }
}
