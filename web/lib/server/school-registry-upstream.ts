import { BASE, headers, obj, reduceUnit, type Raw } from './skolverket.ts';
import { parseRegistrySchool, parseSchoolRegistryLookupResult, type RegistrySchool } from '../school-registry.ts';

const LIMIT = 1024 * 1024;
/** Fixed official endpoint only: no client URLs, redirect following or production fixture switch. */
async function upstream(path: string, transport: typeof fetch): Promise<Raw | null> {
  const response = await transport(`${BASE}${path}`, { headers, redirect:'error', signal:AbortSignal.timeout(10_000) });
  if (response.status === 404) { await response.body?.cancel(); return null; }
  if (!response.ok || !response.body) { await response.body?.cancel(); throw new Error('registry_unavailable'); }
  const length = response.headers.get('Content-Length');
  if (length && (!/^\d+$/u.test(length) || Number(length) > LIMIT)) { await response.body.cancel(); throw new Error('registry_unavailable'); }
  const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let count = 0;
  try {
    for (;;) { const {done,value} = await reader.read(); if (done) break; count += value.byteLength;
      if (count > LIMIT) throw new Error('registry_unavailable'); chunks.push(value); }
  } catch { await reader.cancel().catch(() => undefined); throw new Error('registry_unavailable'); }
  finally { reader.releaseLock(); }
  const buffer = new Uint8Array(count); let offset = 0; for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.byteLength; }
  const parsed: unknown = JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(buffer));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('registry_unavailable');
  return parsed as Raw;
}
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value !== null && typeof value === 'object') return `{${Object.entries(value).sort(([a],[b]) => a < b ? -1 : a > b ? 1 : 0).map(([k,v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export async function registryFingerprint(unit: Omit<RegistrySchool,'registryFingerprint'|'fetchedAt'>): Promise<string> {
  const bytes = new TextEncoder().encode(canonical(unit));
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(b => b.toString(16).padStart(2,'0')).join('');
}
export async function fetchSchoolRegistryUnit(code: string, transport: typeof fetch = fetch, now = new Date()): Promise<{ unit: RegistrySchool; payload: Raw } | null> {
  try {
    if (!/^\d{8}$/u.test(code)) throw new Error('registry_unavailable');
    const payload = await upstream(`/school-units/${code}`,transport); if (!payload) return null;
    const unit = reduceUnit(payload);
    if (unit.code !== code || !unit.organizer.organizationNumber || !/^\d{10}$/u.test(unit.organizer.organizationNumber)) throw new Error('registry_unavailable');
    // This API requires the typed list, not String(...) coercion from arbitrary objects.
    const attrs = obj(obj(payload.data).attributes);
    if (!Array.isArray(attrs.schoolTypes) || attrs.schoolTypes.length > 50 || attrs.schoolTypes.some(v => typeof v !== 'string' || !/^[A-Z][A-Z0-9_]{0,15}$/u.test(v))) throw new Error('registry_unavailable');
    const props = obj(attrs.schoolTypeProperties);
    for (const value of Object.values(props)) {
      const programmes = obj(value).programmes;
      if (programmes !== undefined && (!Array.isArray(programmes) || programmes.length > 200 || programmes.some(v => typeof v !== 'string'))) throw new Error('registry_unavailable');
    }
    if (!unit.municipalityName) {
      const organizer = await upstream(`/organizers/${unit.organizer.organizationNumber}`,transport);
      if (!organizer || obj(organizer.data).organizationNumber !== unit.organizer.organizationNumber) throw new Error('registry_unavailable');
      const municipalities = obj(obj(organizer.data).attributes).municipalities;
      if (Array.isArray(municipalities)) {
        const found = municipalities.map(obj).find(v => v.municipalityCode === unit.municipalityCode);
        if (found && typeof found.displayName === 'string') unit.municipalityName = found.displayName;
      }
    }
    const programmes = Object.fromEntries([...new Set(unit.schoolTypes)].sort().map(key => [key,[...new Set(unit.programmes[key] ?? [])].sort()]));
    const normalized = {
      code:unit.code, name:unit.name.trim(), status:unit.status, municipalityCode:unit.municipalityCode,
      municipalityName:unit.municipalityName ?? null, locality:unit.locality ?? null,
      address:unit.address ? JSON.parse(JSON.stringify(unit.address)) : null,
      organizationNumber:unit.organizer.organizationNumber, schoolTypes:[...new Set(unit.schoolTypes)].sort(), programmes, modified:unit.modified ?? null,
    };
    // Validate before hashing so no omitted/unsupported source shape can acquire a receipt.
    parseRegistrySchool({...normalized,registryFingerprint:'0'.repeat(64),fetchedAt:now.toISOString()});
    return { unit:parseRegistrySchool({...normalized,registryFingerprint:await registryFingerprint(normalized),fetchedAt:now.toISOString()}), payload };
  } catch { throw new Error('registry_unavailable'); }
}
export async function fetchSchoolRegistryOrganization(organizationNumber: string, transport: typeof fetch = fetch) {
  try {
    if (!/^\d{10}$/u.test(organizationNumber)) throw new Error('registry_unavailable');
    const payload = await upstream(`/school-units?organization_number=${organizationNumber}`,transport);
    if (!payload) return null;
    const rows = obj(payload.data).attributes;
    if (!Array.isArray(rows) || rows.length > 5000) throw new Error('registry_unavailable');
    // Do not silently expose a partial, paginated or malformed list as complete.
    const links = obj(payload.links); if (links.next) throw new Error('registry_unavailable');
    const units = rows.map(value => { const row = obj(value); return { code:row.schoolUnitCode,name:row.name,status:row.status }; });
    const result = parseSchoolRegistryLookupResult({kind:'organizationNumber',organizationNumber,units}, {kind:'organizationNumber',value:organizationNumber});
    if (result.kind === 'organizationNumber') result.units.sort((a,b) => a.name.localeCompare(b.name,'sv') || a.code.localeCompare(b.code));
    return result;
  } catch { throw new Error('registry_unavailable'); }
}
