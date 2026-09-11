import { registryAddress, type SchoolAddress } from '../../../lib/registry-address.ts';
// Läsväg mot Skolenhetsregistret (Skolverket, CC0). Registret saknar
// CORS-huvuden, så webbläsaren kan inte anropa det direkt. Den här vägen
// vidarebefordrar bara det produkten behöver; rektors e-post och telefon
// förs inte vidare.
//
//   GET /api/skolenhet?kod=19207279
//   GET /api/skolenhet?kommun=1480
//   GET /api/skolenhet?huvudman=5563571248   (organisationsnummer)

const BASE = 'https://api.skolverket.se/skolenhetsregistret/v2';
const headers = { Accept: 'application/json' };

type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});
const str = (v: unknown) => (typeof v === 'string' ? v : undefined);

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

function reduceUnit(payload: Raw): RegistryUnit {
  const data = obj(payload.data);
  const a = obj(data.attributes);
  // Registret lämnar huvudmannen som ett enda inkluderat objekt, inte en lista.
  const included = Array.isArray(payload.included)
    ? payload.included
    : payload.included
      ? [payload.included]
      : [];
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
    ? organizerAttributes.municipalities.map(obj)
    : [];
  const municipalityCode = str(a.municipalityCode) ?? '';
  return {
    code: str(data.schoolUnitCode) ?? '',
    name: str(a.displayName) ?? str(a.schoolName) ?? '',
    status: str(a.status) ?? 'OKAND',
    municipalityCode,
    municipalityName: str(
      municipalities.find((m) => m.municipalityCode === municipalityCode)?.displayName,
    ),
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

export async function GET(request: Request) {
  const url = new URL(request.url);
  const kod = url.searchParams.get('kod');
  const kommun = url.searchParams.get('kommun');
  const huvudman = url.searchParams.get('huvudman')?.replace('-', '');
  const reduceList = (payload: Raw) => {
    const list = obj(payload.data).attributes;
    return (Array.isArray(list) ? list : [])
      .map(obj)
      .map((u) => ({ code: str(u.schoolUnitCode) ?? '', name: str(u.name) ?? '', status: str(u.status) ?? '' }))
      .filter((u) => u.code)
      .sort((a, b) => a.name.localeCompare(b.name, 'sv'));
  };
  try {
    if (kod) {
      if (!/^\d{8}$/.test(kod))
        return Response.json({ error: 'Skolenhetskoden är åtta siffror.' }, { status: 400 });
      const upstream = await fetch(`${BASE}/school-units/${kod}`, { headers });
      if (upstream.status === 404)
        return Response.json({ error: `Ingen skolenhet med kod ${kod} i registret.` }, { status: 404 });
      if (!upstream.ok)
        return Response.json({ error: `Skolenhetsregistret svarade ${upstream.status}.` }, { status: 502 });
      const unit = reduceUnit((await upstream.json()) as Raw);
      // Kommunens namn finns hos huvudmannen, inte på skolenheten.
      if (unit.organizer.organizationNumber && !unit.municipalityName) {
        const organizer = await fetch(`${BASE}/organizers/${unit.organizer.organizationNumber}`, { headers });
        if (organizer.ok) {
          const attributes = obj(obj(obj((await organizer.json()) as Raw).data).attributes);
          const municipalities = Array.isArray(attributes.municipalities) ? attributes.municipalities.map(obj) : [];
          unit.municipalityName = str(municipalities.find((m) => m.municipalityCode === unit.municipalityCode)?.displayName);
        }
      }
      return Response.json({ unit, source: `${BASE}/school-units/${kod}` });
    }
    if (kommun) {
      if (!/^\d{4}$/.test(kommun))
        return Response.json({ error: 'Kommunkoden är fyra siffror.' }, { status: 400 });
      const upstream = await fetch(`${BASE}/school-units?municipality_code=${kommun}`, { headers });
      if (!upstream.ok)
        return Response.json({ error: `Skolenhetsregistret svarade ${upstream.status}.` }, { status: 502 });
      return Response.json({ units: reduceList((await upstream.json()) as Raw), source: `${BASE}/school-units?municipality_code=${kommun}` });
    }
    if (huvudman) {
      if (!/^\d{10}$/.test(huvudman))
        return Response.json({ error: 'Organisationsnumret är tio siffror.' }, { status: 400 });
      const [units, organizer] = await Promise.all([
        fetch(`${BASE}/school-units?organization_number=${huvudman}`, { headers }),
        fetch(`${BASE}/organizers/${huvudman}`, { headers }),
      ]);
      if (organizer.status === 404)
        return Response.json({ error: `Ingen huvudman med organisationsnummer ${huvudman} i registret.` }, { status: 404 });
      if (!units.ok)
        return Response.json({ error: `Skolenhetsregistret svarade ${units.status}.` }, { status: 502 });
      const attributes = organizer.ok ? obj(obj(obj((await organizer.json()) as Raw).data).attributes) : {};
      return Response.json({
        organizer: { name: str(attributes.displayName) ?? '', organizationNumber: huvudman, type: str(attributes.organizerType) ?? '' },
        units: reduceList((await units.json()) as Raw),
        source: `${BASE}/school-units?organization_number=${huvudman}`,
      });
    }
    return Response.json({ error: 'Ange kod, kommun eller huvudman.' }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : 'Registret kunde inte nås.' },
      { status: 502 },
    );
  }
}
