/** Skolans daterade provbokningar. Undervisningsreferensen pekar på ämnet och nivån i skolans planering. */
export const NATIONELLA_PROV_VERSION = 'nationella_prov_v1' as const;
export const NATIONELLA_PROV_KALLA = 'https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-gymnasieskolan';

export type NationellProvbokning = {
  id: string;
  namn: string;
  undervisning: string;
  mal: { slag: 'klass' | 'grupp'; ref: string };
  datum: string;
  startMin: number;
  slutMin: number;
  tidsval: 'fast' | 'period';
  salId: string | null;
  vakter: string[];
  kontrolleradDatum: string;
};

export type NationellaProvDocument = { granskad: boolean; bokningar: NationellProvbokning[] };
export type NationellaProvRegister = { revision: number; document: NationellaProvDocument; savedAt: string };
export type NationellaProvDeltagare = { slag: NationellProvbokning['mal']['slag']; ref: string; name: string; undervisningar: { ref: string; title: string }[] };
export type NationellaProvUnderlag = {
  gallerGymnasiet: boolean;
  deltagare: NationellaProvDeltagare[];
  salar: { id: string; name: string }[];
  vakter: { ref: string; name: string }[];
  skoldagar: string[] | null;
};

export class NationellaProvError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SAL = /^sal-[1-9]\d{0,8}$/u;
const UNDERVISNING = /^(?:undervisning|samlasning):[^\p{Cc}]+$/u;
const CONTROL = /\p{Cc}/u;
const bad = (): never => { throw new NationellaProvError(); };

function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(key => !Object.hasOwn(r, key))) return bad();
  return r;
}

function uuid(value: unknown): string {
  return typeof value === 'string' && UUID.test(value) ? value : bad();
}

function int(value: unknown, min: number, max: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max ? value : bad();
}

function text(value: unknown, max: number): string {
  return typeof value === 'string' && value.trim() === value && value.length > 0 && Array.from(value).length <= max && !CONTROL.test(value) ? value : bad();
}

function date(value: unknown, first: string, last: string): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/u.test(value) || value < first || value > last) return bad();
  const day = new Date(value);
  return Number.isFinite(day.getTime()) && day.toISOString().slice(0, 10) === value ? value : bad();
}

export function parseNationellaProvScope(raw: unknown) {
  const r = exact(raw, ['contractVersion', 'unitId', 'schoolYear']);
  if (r.contractVersion !== NATIONELLA_PROV_VERSION) return bad();
  return { contractVersion: NATIONELLA_PROV_VERSION, unitId: uuid(r.unitId), schoolYear: int(r.schoolYear, 2000, 2100) };
}

export function parseNationellaProvDocument(raw: unknown, schoolYear: number): NationellaProvDocument {
  const r = exact(raw, ['granskad', 'bokningar']);
  if (typeof r.granskad !== 'boolean' || !Array.isArray(r.bokningar) || r.bokningar.length > 200) return bad();
  const ids = new Set<string>(), keys = new Set<string>();
  const bokningar = r.bokningar.map((value): NationellProvbokning => {
    const b = exact(value, ['id', 'namn', 'undervisning', 'mal', 'datum', 'startMin', 'slutMin', 'tidsval', 'salId', 'vakter', 'kontrolleradDatum']);
    const id = uuid(b.id), namn = text(b.namn, 160);
    const undervisning = text(b.undervisning, 500);
    if (!UNDERVISNING.test(undervisning)) return bad();
    const target = exact(b.mal, ['slag', 'ref']);
    if (target.slag !== 'klass' && target.slag !== 'grupp') return bad();
    const mal = { slag: target.slag, ref: uuid(target.ref) } as const;
    const datum = date(b.datum, `${schoolYear}-07-01`, `${schoolYear + 1}-06-30`);
    const day = new Date(datum).getUTCDay();
    const startMin = int(b.startMin, 0, 1440), slutMin = int(b.slutMin, 0, 1440);
    if (!day || day === 6 || startMin % 5 || slutMin % 5 || slutMin - startMin < 5
      || b.tidsval !== 'fast' && b.tidsval !== 'period' || b.tidsval === 'fast' && startMin !== 540) return bad();
    const salId = b.salId === null ? null : typeof b.salId === 'string' && SAL.test(b.salId) ? b.salId : bad();
    if (!Array.isArray(b.vakter) || b.vakter.length > 20) return bad();
    const vakter = b.vakter.map(uuid);
    const key = JSON.stringify([namn, datum, startMin, slutMin, mal]);
    if (ids.has(id) || keys.has(key) || new Set(vakter).size !== vakter.length) return bad();
    ids.add(id);
    keys.add(key);
    return { id, namn, undervisning, mal, datum, startMin, slutMin, tidsval: b.tidsval, salId, vakter,
      kontrolleradDatum: date(b.kontrolleradDatum, '2000-01-01', '2101-12-31') };
  });
  return { granskad: r.granskad, bokningar };
}

export function parseNationellaProvSave(raw: unknown) {
  const r = exact(raw, ['contractVersion', 'unitId', 'schoolYear', 'commandId', 'expectedRevision', 'document']);
  const scope = parseNationellaProvScope({ contractVersion: r.contractVersion, unitId: r.unitId, schoolYear: r.schoolYear });
  const document = parseNationellaProvDocument(r.document, scope.schoolYear);
  const idag = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  if (document.bokningar.some(b => b.kontrolleradDatum > idag)) return bad();
  return { ...scope, commandId: uuid(r.commandId), expectedRevision: int(r.expectedRevision, 0, 2147483646),
    document };
}

export function parseNationellaProvRegister(raw: unknown, schoolYear: number): NationellaProvRegister | null {
  if (raw === null) return null;
  const r = exact(raw, ['revision', 'document', 'savedAt']);
  if (typeof r.savedAt !== 'string' || !Number.isFinite(Date.parse(r.savedAt))) return bad();
  return { revision: int(r.revision, 1, 2147483647), document: parseNationellaProvDocument(r.document, schoolYear), savedAt: r.savedAt };
}

export function parseNationellaProvUnderlag(raw: unknown): NationellaProvUnderlag {
  const r = exact(raw, ['gallerGymnasiet', 'deltagare', 'salar', 'vakter', 'skoldagar']);
  if (typeof r.gallerGymnasiet !== 'boolean' || !Array.isArray(r.deltagare) || !Array.isArray(r.salar) || !Array.isArray(r.vakter)
    || r.skoldagar !== null && !Array.isArray(r.skoldagar)) return bad();
  const deltagare = r.deltagare.map((value): NationellaProvDeltagare => {
    const d = exact(value, ['slag', 'ref', 'name', 'undervisningar']);
    if (d.slag !== 'klass' && d.slag !== 'grupp' || !Array.isArray(d.undervisningar)) return bad();
    return { slag: d.slag, ref: uuid(d.ref), name: text(d.name, 500), undervisningar: d.undervisningar.map(value => {
      const u = exact(value, ['ref', 'title']), ref = text(u.ref, 500);
      return UNDERVISNING.test(ref) ? { ref, title: text(u.title, 500) } : bad();
    }) };
  });
  const salar = r.salar.map(value => {
    const room = exact(value, ['id', 'name']);
    return typeof room.id === 'string' && SAL.test(room.id) ? { id: room.id, name: text(room.name, 500) } : bad();
  });
  const vakter = r.vakter.map(value => {
    const person = exact(value, ['ref', 'name']);
    return { ref: uuid(person.ref), name: text(person.name, 500) };
  });
  return { gallerGymnasiet: r.gallerGymnasiet, deltagare, salar, vakter,
    skoldagar: r.skoldagar?.map(value => date(value, '2000-01-01', '2101-12-31')) ?? null };
}

export function nationellaProvBokningsfel(b: NationellProvbokning, underlag: NationellaProvUnderlag): string | null {
  const target = underlag.deltagare.find(d => d.ref === b.mal.ref && d.slag === b.mal.slag);
  if (!target?.undervisningar.some(u => u.ref === b.undervisning)) return 'Välj en aktuell undervisning för deltagarna.';
  if (underlag.skoldagar && !underlag.skoldagar.includes(b.datum)) return 'Datumet är ingen skoldag i läsårskalendern.';
  if (b.salId !== null && !underlag.salar.some(s => s.id === b.salId)) return 'Välj en sal från skolans salregister.';
  if (b.vakter.some(ref => !underlag.vakter.some(v => v.ref === ref))) return 'Välj provvakter med uppdrag på skolan.';
  return null;
}
