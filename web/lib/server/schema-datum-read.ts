/** Datumgiltiga skol-/klass-/gruppmedlemskap. Resultatet stannar på servern. */
import { AuditUnavailable } from './authz.ts';
import { Deny, type SessionContext, type Tx } from './db.ts';
import { parseSchemaDatedBasis } from '../schema-datum-underlag.ts';

type Authority = Pick<SessionContext, 'identityId' | 'assignmentId' | 'accessFunction'>;
export async function readSchemaDatedBasis(tx: Tx, ctx: Authority, scope: { unitId: string; schoolYear: number }) {
  if (!ctx.identityId || !ctx.assignmentId || !['rektor', 'administrator'].includes(ctx.accessFunction ?? '')) throw new Deny('forbidden', 403);
  let rows: { result: unknown }[];
  try { rows = await tx<{ result: unknown }[]>`select public.schema_dated_basis(${tx.json(scope)}) as result`; }
  catch (error) {
    const e = error as { code?: string };
    if (e.code === '42501') throw new Deny('forbidden', 403);
    if (e.code === '22023') throw new Deny('bad_request', 400);
    if (['42883', '42P01', '08001', '08003', '08006', '57P01', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(e.code ?? '')) throw new Deny('db_unreachable', 503);
    throw new AuditUnavailable();
  }
  try {
    const r = rows.length === 1 ? rows[0].result as { contractVersion: string; actor: { identityId: string; assignmentId: string }; result: unknown } : null;
    if (!r || Object.keys(r).sort().join() !== 'actor,contractVersion,result' || r.contractVersion !== 'schema_dated_basis_sql_v1'
      || !r.actor || Object.keys(r.actor).sort().join() !== 'assignmentId,identityId' || r.actor.identityId !== ctx.identityId || r.actor.assignmentId !== ctx.assignmentId) throw new AuditUnavailable();
    return { body: parseSchemaDatedBasis(r.result, scope), event: { action: 'schema_dated_basis_read', objectType: 'school', objectId: scope.unitId, details: { unitId: scope.unitId, schoolYear: scope.schoolYear } } };
  } catch { throw new AuditUnavailable(); }
}
