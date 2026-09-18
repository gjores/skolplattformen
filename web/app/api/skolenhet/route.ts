import { BASE, headers, obj, str, reduceUnit, type Raw } from '../../../lib/server/skolverket.ts';
export type { RegistryUnit } from '../../../lib/server/skolverket.ts';

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
