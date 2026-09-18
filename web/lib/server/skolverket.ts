import { registryAddress, type SchoolAddress } from '../registry-address.ts';

export const BASE = 'https://api.skolverket.se/skolenhetsregistret/v2';
export const headers = { Accept: 'application/json' };
export type Raw = Record<string, unknown>;
export const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
export const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

export type RegistryUnit = {
  code: string;
  name: string;
  status: string;
  municipalityCode: string;
  municipalityName?: string;
  schoolTypes: string[];
  programmes: Record<string, string[]>;
  headMaster?: string;
  locality?: string;
  address?: SchoolAddress;
  organizer: { name: string; organizationNumber?: string; type: string };
  modified?: string;
  extractDate?: string;
};

export function reduceUnit(payload: Raw): RegistryUnit {
  const data = obj(payload.data);
  const a = obj(data.attributes);
  const included = Array.isArray(payload.included)
    ? payload.included
    : payload.included ? [payload.included] : [];
  const organizer = obj(included.find((i) => obj(i).type === 'organizer'));
  const organizerAttributes = obj(organizer.attributes);
  const props = obj(a.schoolTypeProperties);
  const programmes: Record<string, string[]> = {};
  for (const [type, value] of Object.entries(props)) {
    const list = obj(value).programmes;
    if (Array.isArray(list)) programmes[type] = list.map(String);
  }
  const address = registryAddress(a.addresses);
  const municipalities = Array.isArray(organizerAttributes.municipalities)
    ? organizerAttributes.municipalities.map(obj) : [];
  const municipalityCode = str(a.municipalityCode) ?? '';
  return {
    code: str(data.schoolUnitCode) ?? '',
    name: str(a.displayName) ?? str(a.schoolName) ?? '',
    status: str(a.status) ?? 'OKAND',
    municipalityCode,
    municipalityName: str(municipalities.find((m) => m.municipalityCode === municipalityCode)?.displayName),
    schoolTypes: Array.isArray(a.schoolTypes) ? a.schoolTypes.map(String) : [],
    programmes,
    headMaster: str(a.headMaster),
    locality: address?.locality,
    address,
    organizer: {
      name: str(organizerAttributes.displayName) ?? '',
      organizationNumber: str(organizer.organizationNumber),
      type: str(organizerAttributes.organizerType) ?? '',
    },
    modified: str(obj(payload.meta).modified),
    extractDate: str(obj(payload.meta).extractDate),
  };
}

export async function fetchRegistryUnit(
  code: string,
  transport: typeof fetch = fetch,
): Promise<{ unit: RegistryUnit; payload: Raw } | null> {
  if (!/^\d{8}$/u.test(code)) throw new Error('registry_unavailable');
  try {
    const upstream = await transport(`${BASE}/school-units/${code}`, {
      headers, signal: AbortSignal.timeout(10_000), redirect: 'error',
    });
    if (upstream.status === 404) return null;
    if (!upstream.ok) throw new Error('registry_unavailable');
    const payload = obj(await upstream.json());
    const unit = reduceUnit(payload);
    if (unit.code !== code || !unit.name.trim() || !/^\d{4}$/u.test(unit.municipalityCode)) {
      throw new Error('registry_unavailable');
    }
    if (unit.modified && !Number.isFinite(Date.parse(unit.modified))) throw new Error('registry_unavailable');
    if (unit.organizer.organizationNumber && !unit.municipalityName) {
      if (!/^\d{10}$/u.test(unit.organizer.organizationNumber)) throw new Error('registry_unavailable');
      const organizer = await transport(`${BASE}/organizers/${unit.organizer.organizationNumber}`, {
        headers, signal: AbortSignal.timeout(10_000), redirect: 'error',
      });
      if (organizer.ok) {
        const attributes = obj(obj(obj(await organizer.json()).data).attributes);
        const municipalities = Array.isArray(attributes.municipalities) ? attributes.municipalities.map(obj) : [];
        unit.municipalityName = str(municipalities.find((m) => m.municipalityCode === unit.municipalityCode)?.displayName);
      }
    }
    return { unit, payload };
  } catch {
    throw new Error('registry_unavailable');
  }
}

export function toImportUnitData(unit: RegistryUnit, fetchedAt: Date): Record<string, unknown> {
  return {
    code: unit.code,
    name: unit.name,
    municipality: { code: unit.municipalityCode, name: unit.municipalityName },
    status: unit.status,
    headMaster: unit.headMaster,
    locality: unit.locality,
    address: unit.address,
    source: {
      name: 'Skolenhetsregistret (Skolverket)',
      url: `${BASE}/school-units/${unit.code}`,
      fetched: fetchedAt.toISOString().slice(0, 10),
      modified: unit.modified,
    },
    pupilRegister: { source: 'Inget register kopplat' },
    schoolTypes: unit.schoolTypes.map((code) => ({ code, programmes: unit.programmes[code] ?? [] })),
  };
}
