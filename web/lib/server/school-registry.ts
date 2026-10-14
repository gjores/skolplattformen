import { parseSchoolRegistryList, parseSchoolRegistryLookupResult, parseSchoolRegistryStatus,
  type SchoolRegistryCommand, type SchoolRegistryLookup, type SchoolRegistryList } from '../school-registry.ts';
import { AuditUnavailable } from './authz.ts';
import { Deny, type Tx } from './db.ts';
import { fetchSchoolRegistryUnit, fetchSchoolRegistryOrganization } from './school-registry-upstream.ts';

async function operation<T>(fn: () => Promise<T>): Promise<T> {
  try { return await fn(); } catch (error) {
    if (error && typeof error === 'object' && 'code' in error) {
      if (error.code === '42501') throw new Deny('forbidden',403);
      if (error.code === '22023') throw new Deny('bad_request',400);
      if (error.code === 'P0002') throw new Deny('not_found',404);
      if (['40001','23505'].includes(String(error.code))) throw new Deny('conflict',409);
      if (error.code === '55000') throw new AuditUnavailable();
    }
    throw error;
  }
}
export function schoolRegistryRequest<T>(parser: (v: unknown) => T, value: unknown): T {
  try { return parser(value); } catch { throw new Deny('bad_request',400); }
}
async function list(tx: Tx): Promise<SchoolRegistryList> {
  const rows = await operation(() => tx<{result:unknown}[]>`select public.phase5_school_registry_list() as result`);
  try { if (rows.length !== 1) throw new Error(); return parseSchoolRegistryList(rows[0].result); }
  catch { throw new AuditUnavailable(); }
}
function organization(listed: SchoolRegistryList): string {
  if (!listed.organizer.organizationNumber) throw new Deny('forbidden',403,{reason:'organizer_number_missing'});
  return listed.organizer.organizationNumber;
}
export async function readSchoolRegistry(tx: Tx) {
  const body = await list(tx);
  return { body, event:{action:'school_registry_list_read',objectType:'organizer',objectId:body.organizer.id} };
}
export async function lookupSchoolRegistry(tx: Tx, request: SchoolRegistryLookup) {
  const listed = await list(tx); const expectedNumber = organization(listed);
  if (request.kind === 'organizationNumber') {
    if (request.value !== expectedNumber) throw new Deny('forbidden',403);
    const body = await fetchSchoolRegistryOrganization(request.value).catch(() => { throw new Deny('registry_unavailable',503); });
    if (!body) throw new Deny('not_found',404,{reason:'registry_not_found'});
    return { body, event:{action:'school_registry_lookup_read',objectType:'organizer',objectId:listed.organizer.id} };
  }
  const fetched = await fetchSchoolRegistryUnit(request.value).catch(() => { throw new Deny('registry_unavailable',503); });
  if (!fetched) throw new Deny('not_found',404,{reason:'registry_not_found'});
  if (fetched.unit.organizationNumber !== expectedNumber) throw new Deny('forbidden',403,{reason:'registry_organizer_mismatch'});
  const body = parseSchoolRegistryLookupResult({kind:'code',unit:fetched.unit,local:listed.units.find(u => u.code === request.value) ?? null},request);
  return { body, event:{action:'school_registry_lookup_read',objectType:'organizer',objectId:listed.organizer.id} };
}
export async function saveSchoolRegistry(tx: Tx, input: SchoolRegistryCommand, statusOnly = false) {
  // Recover the immutable full-command receipt first. A lost response can be
  // resolved during an upstream outage, without reapplying old registry facts.
  const checked = await operation(() => tx<{result:unknown}[]>`select public.phase5_school_registry_save(
    ${tx.json(input)}, null, null, true) as result`);
  let existing;
  try { if (checked.length !== 1) throw new Error(); existing = parseSchoolRegistryStatus(checked[0].result,input); }
  catch { throw new AuditUnavailable(); }
  if (statusOnly || existing.status === 'saved') return { body:existing,
    event:{action:'school_registry_status_read',objectType:'school_registry_command',objectId:input.commandId} };
  const listed = await list(tx); const expectedNumber = organization(listed);
  const fetched = await fetchSchoolRegistryUnit(input.code).catch(() => { throw new Deny('registry_unavailable',503); });
  if (!fetched) throw new Deny('not_found',404,{reason:'registry_not_found'});
  if (fetched.unit.organizationNumber !== expectedNumber) throw new Deny('forbidden',403,{reason:'registry_organizer_mismatch'});
  if (fetched.unit.registryFingerprint !== input.registryFingerprint) throw new Deny('conflict',409,{reason:'registry_changed'});
  type Json = Parameters<Tx['json']>[0];
  const rows = await operation(() => tx<{result:unknown}[]>`select public.phase5_school_registry_save(
    ${tx.json(input)}, ${tx.json(fetched.unit as unknown as Json)}, ${tx.json(fetched.payload as Json)}, false) as result`);
  try {
    if (rows.length !== 1) throw new Error(); const body = parseSchoolRegistryStatus(rows[0].result,input);
    if (body.status !== 'saved') throw new Error();
    return { body, event:{action:input.operation === 'import' ? 'school_registry_imported' : 'school_registry_updated',objectType:'school_unit',objectId:body.unitId} };
  } catch { throw new AuditUnavailable(); }
}
