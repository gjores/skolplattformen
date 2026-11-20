import { NATIONELLA_PROV_VERSION, NationellaProvError, parseNationellaProvSave } from '../nationella-prov.ts';
import { SCHEMA_CONTRACT_VERSION, SchemaContractError, villkorNyckel, type SchemaKontrollRequest } from '../schema-contract.ts';
import { SchemaDatumError } from '../schema-datum.ts';
import { SCHEMA_DRAFT_VERSION, SchemaDraftError, schemaDraftHash, type SchemaDraftSave, type SchemaDraftScope } from '../schema-draft-contract.ts';
import { SchemaFordelningError } from '../schema-fordelning.ts';
import { parseSchemaNyttProvSave, type SchemaNyttProvSave, type SchemaNyttProvSaveReply } from '../schema-nytt-prov.ts';
import { schemaProvResultHash } from '../schema-provforslag.ts';
import { AuditUnavailable, protectedRoute, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { logEvent } from './events.ts';
import { json } from './http.ts';
import { readNationellaProv, sparaNationellaProv } from './nationella-prov.ts';
import { readDraftBasis, readSchemaDraftSnapshot, readSchemaDraftReceipt, schemaDraftRequest, prepareSchemaDraft, commitSchemaDraft } from './schema-draft.ts';
import { schemaNyttProvKallHash } from './schema-nytt-prov-kalla.ts';
import { planeraNyttSchemaProv, nyttSchemaProvKomplett } from './schema-nytt-prov-plan.ts';
import { SchemaEngineError } from './schemamotor.ts';

const conflict = (reason = 'schema_provforslag_changed') => new Deny('conflict', 409, { reason });
const scope = ({ unitId, schoolYear, period }: SchemaDraftSave): SchemaDraftScope => ({ contractVersion: SCHEMA_DRAFT_VERSION, unitId, schoolYear, period });
const event = (save: SchemaDraftSave, action: string) => ({ action, objectType: 'school', objectId: save.unitId, details: { unitId: save.unitId, schoolYear: save.schoolYear } });

function reply(save: SchemaDraftSave, draftId: string, revision: number): SchemaNyttProvSaveReply {
  return { ...scope(save), commandId: save.commandId, draftId, revision };
}
async function replay(tx: Tx, ctx: Context, save: SchemaDraftSave, hash: string) {
  const receipt = await readSchemaDraftReceipt(tx, ctx, scope(save), save.commandId);
  if (!receipt) return null;
  if (receipt.requestHash !== hash || receipt.revision !== save.expectedRevision + 1 || (save.draftId !== null && receipt.draftId !== save.draftId)) {
    throw conflict('schema_draft_command_conflict');
  }
  return reply(save, receipt.draftId, receipt.revision);
}

function kontrollgrund(save: SchemaDraftSave): SchemaKontrollRequest {
  const { unitId, schoolYear, period, grundFingerprint, basisVillkor, workingVillkor, placements, locks } = save;
  if (!grundFingerprint || !basisVillkor || villkorNyckel(basisVillkor) !== villkorNyckel(workingVillkor)) throw new Deny('bad_request', 400);
  return { contractVersion: SCHEMA_CONTRACT_VERSION, unitId, schoolYear, period, grundFingerprint, villkor: basisVillkor, placements,
    ...(locks.length ? { locks: { grundFingerprint, placements: locks } } : {}) };
}

async function lasSparunderlag(request: Request, tx: Tx, ctx: Context, input: SchemaNyttProvSave, kontroll: SchemaKontrollRequest) {
  const { save, prov } = input;
  const draft = await readSchemaDraftSnapshot(tx, ctx, scope(save));
  if ((draft?.id ?? null) !== save.draftId || (draft?.revision ?? 0) !== save.expectedRevision) throw conflict('schema_draft_conflict');
  const source = await readDraftBasis(request, tx, ctx, kontroll);
  const register = await readNationellaProv(tx, ctx, save.unitId, save.schoolYear);
  if (!register || register.revision !== prov.provrevision || await schemaNyttProvKallHash(source, draft, register, kontroll.villkor) !== prov.sourceHash) {
    throw conflict();
  }
  return { source, register };
}

async function provaSparning(input: SchemaNyttProvSave, kontroll: SchemaKontrollRequest, { source, register }: Awaited<ReturnType<typeof lasSparunderlag>>) {
  const plan = await planeraNyttSchemaProv(source, kontroll, register);
  if (!nyttSchemaProvKomplett(plan)) throw conflict('schema_provforslag_unresolved');
  if (await schemaProvResultHash(plan.result) !== input.prov.resultHash) throw conflict();
  const save = { ...input.save, datedOverrides: plan.result.ersattningar };
  const document = await prepareSchemaDraft(source, save);
  if (document.requiresRecalculation) throw conflict('schema_draft_source_changed');
  if (!document.base || document.base.metrics.unplaced) throw conflict('schema_provforslag_unresolved');
  if (document.control?.total) throw conflict('schema_nytt_prov_weekly');
  const resurser = (bokningar: typeof plan.bokningar) => bokningar.map(({ id, salId, vakter }) => [id, salId, vakter]);
  const changed = JSON.stringify(resurser(plan.bokningar)) !== JSON.stringify(resurser(register.document.bokningar));
  const prov = changed ? parseNationellaProvSave({ contractVersion: NATIONELLA_PROV_VERSION, unitId: save.unitId, schoolYear: save.schoolYear, commandId: save.commandId,
    expectedRevision: register.revision, document: { ...register.document, bokningar: plan.bokningar } }) : null;
  return { save, document, prov };
}

/** Prövar en exakt förhandsvisad grund utanför transaktionen. Schemat och eventuellt nya provresurser sparas tillsammans. */
export async function schemaNyttProvSparaRoute(request: Request): Promise<Response> {
  const captured: { input?: SchemaNyttProvSave; kontroll?: SchemaKontrollRequest; underlag?: Awaited<ReturnType<typeof lasSparunderlag>>;
    hash?: string; receipt?: SchemaNyttProvSaveReply } = {};
  const first = await protectedRoute(request, 'schema_nytt_prov_prepare', { mutating: false, mfa: true, audit: 'required', functions: ['rektor'] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await schemaDraftRequest(request, parseSchemaNyttProvSave), hash = await schemaDraftHash({ operation: 'schema_nytt_prov_save_v1', input });
    captured.input = input;
    captured.hash = hash;
    const receipt = await replay(tx, ctx, input.save, hash);
    if (receipt) captured.receipt = receipt;
    else {
      captured.kontroll = kontrollgrund(input.save);
      captured.underlag = await lasSparunderlag(request, tx, ctx, input, captured.kontroll);
    }
    return { body: null, event: event(input.save, 'schema_nytt_prov_prepare') };
  });
  if (!first.ok || !captured.input || !captured.hash) return first;
  const epoch = first.headers.get('X-Context-Epoch');
  const init = { correlationId: first.headers.get('X-Correlation-Id') ?? '', ...(epoch !== null && { epoch: Number(epoch) }) };
  if (captured.receipt) return json(captured.receipt, init);
  if (!captured.kontroll || !captured.underlag) throw new AuditUnavailable();
  const { input, kontroll, underlag, hash } = captured;
  let prepared: Awaited<ReturnType<typeof provaSparning>>;
  try {
    prepared = await provaSparning(input, kontroll, underlag);
  } catch (error) {
    const fail = (code: string, reason: string, status: number) => json({ code, details: { reason }, correlationId: init.correlationId }, { ...init, status });
    if (error instanceof Deny) return json({ code: error.code, details: error.details, correlationId: init.correlationId }, { ...init, status: error.status });
    if (error instanceof SchemaEngineError) return fail('schema_engine_unavailable', error.reason, 503);
    if (error instanceof SchemaDatumError || error instanceof SchemaDraftError || error instanceof SchemaContractError
      || error instanceof SchemaFordelningError || error instanceof NationellaProvError) return fail('conflict', 'schema_provforslag_changed', 409);
    throw error;
  }
  const { save, document, prov } = prepared;
  return protectedRoute(request, 'schema_nytt_prov_saved', { mutating: true, mfa: true, audit: 'required', functions: ['rektor'] }, async (ctx, tx) => {
    const receipt = await replay(tx, ctx, save, hash);
    if (receipt) return { body: receipt, event: event(save, 'schema_nytt_prov_saved') };
    // Schema-status låser sitt kommandokvitto. Provlåsen tas därefter i samma ordning som kalenderns sparning.
    await tx`select pg_advisory_xact_lock(hashtextextended(${save.commandId}, 2026111901))`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${`${save.unitId}/${save.schoolYear}`}, 2026111902))`;
    const current = await lasSparunderlag(request, tx, ctx, input, kontroll);
    if (prov) {
      const result = await sparaNationellaProv(tx, ctx, prov);
      if (result.replayed) throw conflict('schema_draft_command_conflict');
      await logEvent(tx, ctx, { ...event(save, 'nationella_prov_saved'), outcome: 'ok' });
    }
    const committed = await commitSchemaDraft(tx, ctx, save, document, current.source, hash);
    await logEvent(tx, ctx, { ...event(save, 'schema_draft_saved'), outcome: 'ok' });
    return { body: reply(save, committed.receipt.draftId, committed.receipt.revision), event: event(save, 'schema_nytt_prov_saved') };
  });
}
