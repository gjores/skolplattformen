import { AuditUnavailable, protectedRoute, requireSameOrigin, type Context } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { tjanstRequest } from './tjanst.ts';
import {
  NATIONELLA_PROV_VERSION,
  NationellaProvError,
  nationellaProvBokningsfel,
  parseNationellaProvKatalog,
  parseNationellaProvRegister,
  parseNationellaProvSave,
  parseNationellaProvScope,
} from '../nationella-prov.ts';
import { katalogbokningGiltig } from '../nationella-prov-katalog.ts';
import { readNationellaProvUnderlag } from './nationella-prov-underlag.ts';

const FUNCTIONS = ['rektor', 'administrator'] as const;
const INVALID = 'nationella_prov_invalid';

function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

async function query(read: () => Promise<{ result: unknown }[]>, ctx: Context) {
  let rows: { result: unknown }[];
  try { rows = await read(); }
  catch (error) {
    if (error instanceof Deny || error instanceof AuditUnavailable) throw error;
    const e = error as { code?: string; hint?: string };
    if (e.code === '42501') throw new Deny('forbidden', 403);
    if (e.code === '55000') throw new AuditUnavailable();
    if (e.code === '40001') throw new Deny('conflict', 409, {
      reason: e.hint === 'nationella_prov_command_conflict' ? e.hint : 'nationella_prov_conflict',
    });
    if (e.code === '22023') throw new Deny('bad_request', 400, { reason: INVALID });
    if (['42P01', '42883', '08001', '08003', '08006', '57P01', 'ECONNREFUSED', 'CONNECTION_CLOSED', 'CONNECT_TIMEOUT'].includes(e.code ?? '')) {
      throw new Deny('db_unreachable', 503);
    }
    throw error;
  }
  const response = rows[0]?.result;
  if (rows.length !== 1 || !object(response) || Object.keys(response).sort().join() !== 'actor,contractVersion,result'
    || response.contractVersion !== NATIONELLA_PROV_VERSION || !object(response.actor)
    || Object.keys(response.actor).sort().join() !== 'assignmentId,identityId'
    || response.actor.identityId !== ctx.identityId || response.actor.assignmentId !== ctx.assignmentId || !object(response.result)) {
    throw new AuditUnavailable();
  }
  return response.result;
}

function register(value: unknown, schoolYear: number) {
  try { return parseNationellaProvRegister(value, schoolYear); }
  catch (error) { if (error instanceof NationellaProvError) throw new AuditUnavailable(); throw error; }
}

/** Det senaste sparade provunderlaget för skolan och läsåret. */
export async function readNationellaProv(tx: Tx, ctx: Context, unitId: string, schoolYear: number) {
  const input = { contractVersion: NATIONELLA_PROV_VERSION, unitId, schoolYear };
  const result = await query(() => tx<{ result: unknown }[]>`select public.nationella_prov_read(${tx.json(input)}) as result`, ctx);
  if (Object.keys(result).join() !== 'register') throw new AuditUnavailable();
  return register(result.register, schoolYear);
}

async function readProvkatalog(tx: Tx, schoolYear: number, revision: number | null = null) {
  const rows = await tx<{ revision: number; kontrolleradDatum: string; prov: unknown }[]>`
    select revision, checked_date::text as "kontrolleradDatum", document as prov
    from public.nationella_prov_kataloger where school_year = ${schoolYear}
    and (${revision}::integer is null or revision = ${revision}::integer)
    order by revision desc limit 1`;
  return parseNationellaProvKatalog(rows[0] ?? null, schoolYear);
}

async function requestInput<T>(request: Request, parse: (value: unknown) => T): Promise<T> {
  const raw = await tjanstRequest(request, value => value, 262144);
  try { return parse(raw); }
  catch (error) { if (error instanceof NationellaProvError) throw new Deny('bad_request', 400, { reason: INVALID }); throw error; }
}

function event(action: string, unitId: string, schoolYear: number) {
  return { action, objectType: 'nationella_prov', objectId: unitId, details: { unitId, schoolYear } };
}

export function nationellaProvLasRoute(request: Request): Promise<Response> {
  const action = 'nationella_prov_read';
  return protectedRoute(request, action, { mutating: false, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    requireSameOrigin(request);
    const input = await requestInput(request, parseNationellaProvScope);
    const { unitId, schoolYear } = input;
    const register = await readNationellaProv(tx, ctx, unitId, schoolYear);
    const underlag = await readNationellaProvUnderlag(tx, ctx, unitId, schoolYear);
    const body = { ...input, register, underlag: underlag.gallerGymnasiet
      ? { ...underlag, provkatalog: await readProvkatalog(tx, schoolYear) } : underlag };
    return { body, event: event(action, unitId, schoolYear) };
  });
}

export function nationellaProvSparaRoute(request: Request): Promise<Response> {
  const action = 'nationella_prov_saved';
  return protectedRoute(request, action, { mutating: true, mfa: true, audit: 'required', functions: [...FUNCTIONS] }, async (ctx, tx) => {
    const input = await requestInput(request, parseNationellaProvSave);
    const { unitId, schoolYear, contractVersion } = input;
    const previous = await readNationellaProv(tx, ctx, unitId, schoolYear);
    const result = await query(() => tx<{ result: unknown }[]>`select public.nationella_prov_save(${tx.json(input)}) as result`, ctx);
    const saved = register(result.register, schoolYear);
    if (Object.keys(result).sort().join() !== 'register,replayed' || !saved || typeof result.replayed !== 'boolean'
      || saved.revision !== input.expectedRevision + 1 || JSON.stringify(saved.document) !== JSON.stringify(input.document)) {
      throw new AuditUnavailable();
    }
    if (!result.replayed) {
      const previousBookings = new Map(previous?.document.bokningar.map(b => [b.id, b]));
      const bookings = input.document.granskad ? input.document.bokningar : input.document.bokningar.filter(b =>
        JSON.stringify(previousBookings.get(b.id)) !== JSON.stringify(b));
      // Borttagning och öppning för ny genomgång ska fungera även om källunderlaget har ändrats.
      if (input.document.granskad || bookings.length) {
        const underlag = await readNationellaProvUnderlag(tx, ctx, unitId, schoolYear);
        if (underlag.gallerGymnasiet === false) throw new Deny('forbidden', 403);
        const katalogfel = () => new Deny('conflict', 409, { reason: 'nationella_prov_katalog_changed' });
        const kataloger = new Map<number | null, Awaited<ReturnType<typeof readProvkatalog>>>();
        for (const booking of bookings) {
          const original = previousBookings.get(booking.id);
          // Administratörens personalunderlag kan sakna tidigare val som rektor kunde se.
          const valid = ctx.accessFunction === 'administrator' && original?.datum === booking.datum
            ? { ...booking, vakter: booking.vakter.filter(ref => !original.vakter.includes(ref)) }
            : booking;
          if (nationellaProvBokningsfel(valid, underlag)) {
            throw new Deny('conflict', 409, { reason: 'nationella_prov_underlag_changed' });
          }
          const kallprov = booking.kallprov;
          if (!kallprov) {
            if (original?.kallprov) throw katalogfel();
            continue;
          }
          const bevaradKoppling = kallprov.id === original?.kallprov?.id && kallprov.revision === original.kallprov.revision
            && booking.mal.slag === original.mal.slag && booking.mal.ref === original.mal.ref
            && booking.undervisning === original.undervisning && booking.datum === original.datum
            && booking.startMin === original.startMin && booking.tidsval === original.tidsval;
          const revision = bevaradKoppling ? kallprov.revision : null;
          if (!kataloger.has(revision)) {
            if (revision === null) await tx`select pg_advisory_xact_lock_shared(2026111903, ${schoolYear}::integer)`;
            kataloger.set(revision, await readProvkatalog(tx, schoolYear, revision));
          }
          const katalog = kataloger.get(revision);
          const source = katalog?.revision === kallprov.revision && katalog.prov.find(p => p.id === kallprov.id);
          if (!source) throw katalogfel();
          if (!katalogbokningGiltig(source, booking, underlag, schoolYear)) {
            throw new Deny('conflict', 409, { reason: 'nationella_prov_katalog_mapping_invalid' });
          }
        }
      }
    }
    return { body: { unitId, schoolYear, contractVersion, register: saved, replayed: result.replayed }, event: event(action, unitId, schoolYear) };
  });
}
