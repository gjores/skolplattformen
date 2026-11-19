/** Skolans daterade provbokningar. Undervisningsreferensen pekar på ämnet och nivån i skolans planering. */
export const NATIONELLA_PROV_VERSION = 'nationella_prov_v1' as const;
export const NATIONELLA_PROV_KALLA = 'https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-gymnasieskolan';

export function skapaProvId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();

  // Den lokala mobilingången använder HTTP, där getRandomValues finns kvar.
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

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
  kallprov?: { id: string; revision: number };
};

export type NationellaProvDocument = { granskad: boolean; bokningar: NationellProvbokning[] };
export type NationellaProvRegister = { revision: number; document: NationellaProvDocument; savedAt: string };
export type Provniva = { amne: string; niva: string; namn: string };
export type Provtermin = 'ht' | 'vt';
export type Provterminer = Record<Provtermin, { start: string; end: string }>;
export type Provtidsplan =
  | { typ: 'gemensam'; minuter: number; planeradRastMin?: number }
  | { typ: 'muntlig'; minuterPerTillfalle: number; deltagarePerTillfalle: 1 | 2; forberedelseMin?: number };
export type Provval = {
  id: string;
  namn: string;
  nivaer: Provniva[];
  tid: { typ: 'fast'; datum: string } | { typ: 'period'; fran: string; till?: string; tidigasteStartMin?: number; senasteSlutMin?: number };
  tidsatgang?: string;
  tidsplan?: Provtidsplan;
};
export type NationellaProvKatalog = { revision: number; kontrolleradDatum: string; prov: Provval[] };
type Provundervisning = {
  ref: string;
  title: string;
  nivaer?: Provniva[];
  /** Saknad uppgift för en termin betyder att undervisningstiden är okänd. */
  terminer?: Partial<Record<Provtermin, boolean>>;
};
export type NationellaProvDeltagare = {
  slag: NationellProvbokning['mal']['slag'];
  ref: string;
  name: string;
  undervisningar: Provundervisning[];
  /** Klasskopplingar i undervisningsorganisationen, inga uppgifter om enskilda elever. */
  klassRefs?: string[];
};
export type NationellaProvUnderlag = {
  gallerGymnasiet: boolean;
  deltagare: NationellaProvDeltagare[];
  salar: { id: string; name: string }[];
  vakter: { ref: string; name: string }[];
  skoldagar: string[] | null;
  /** Samma kalenderversion som skoldagarna. */
  terminer?: Provterminer;
  provkatalog?: NationellaProvKatalog | null;
};

export class NationellaProvError extends Error {}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/u;
const SAL = /^sal-[1-9]\d{0,8}$/u;
const UNDERVISNING = /^(?:undervisning|samlasning):[^\p{Cc}]+$/u;
const PROVKOD = /^\p{L}[\p{L}\p{N}_-]{0,79}$/u;
const CONTROL = /\p{Cc}/u;
const bad = (): never => { throw new NationellaProvError(); };

function exact(value: unknown, keys: string[], optional: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return bad();
  const r = value as Record<string, unknown>;
  if (keys.some(key => !Object.hasOwn(r, key)) || Object.keys(r).some(key => !keys.includes(key) && !optional.includes(key))) return bad();
  return r;
}

function provkod(value: unknown): string {
  return typeof value === 'string' && PROVKOD.test(value) ? value : bad();
}

function parseProvnivaer(value: unknown): Provniva[] {
  if (!Array.isArray(value) || value.length < 1 || value.length > 32) return bad();
  const nivaer = value.map(item => {
    const n = exact(item, ['amne', 'niva', 'namn']);
    return { amne: provkod(n.amne), niva: provkod(n.niva), namn: text(n.namn, 500) };
  });
  if (new Set(nivaer.map(n => `${n.amne}:${n.niva}`)).size !== nivaer.length) return bad();
  return nivaer;
}

function parseProvundervisning(value: unknown): Provundervisning {
  const u = exact(value, ['ref', 'title'], ['nivaer', 'terminer']);
  const ref = text(u.ref, 500);
  if (!UNDERVISNING.test(ref)) return bad();
  const result: Provundervisning = { ref, title: text(u.title, 500) };
  if (Object.hasOwn(u, 'nivaer')) result.nivaer = parseProvnivaer(u.nivaer);
  if (Object.hasOwn(u, 'terminer')) {
    const t = exact(u.terminer, [], ['ht', 'vt']);
    if (Object.values(t).some(value => typeof value !== 'boolean')) return bad();
    result.terminer = t as Partial<Record<Provtermin, boolean>>;
  }
  return result;
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

function provId(value: unknown): string {
  return typeof value === 'string' && value.length <= 80 && value !== 'eget-prov'
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(value) ? value : bad();
}

function parseProvtidsplan(value: unknown, tid: Provval['tid']): Provtidsplan {
  if (tid.typ === 'fast') {
    const f = exact(value, ['typ', 'minuter'], ['planeradRastMin']);
    if (f.typ !== 'gemensam') return bad();
    const minuter = int(f.minuter, 5, 900);
    if (minuter % 5) return bad();
    return { typ: f.typ, minuter, ...(Object.hasOwn(f, 'planeradRastMin') && { planeradRastMin: int(f.planeradRastMin, 1, minuter - 1) }) };
  }
  const m = exact(value, ['typ', 'minuterPerTillfalle', 'deltagarePerTillfalle'], ['forberedelseMin']);
  if (m.typ !== 'muntlig' || m.deltagarePerTillfalle !== 1 && m.deltagarePerTillfalle !== 2) return bad();
  return { typ: m.typ, minuterPerTillfalle: int(m.minuterPerTillfalle, 1, 240), deltagarePerTillfalle: m.deltagarePerTillfalle,
    ...(Object.hasOwn(m, 'forberedelseMin') && { forberedelseMin: int(m.forberedelseMin, 1, 240) }) };
}

export function parseNationellaProvKatalog(raw: unknown, schoolYear: number): NationellaProvKatalog | null {
  if (raw === null) return null;
  const r = exact(raw, ['revision', 'kontrolleradDatum', 'prov']);
  if (!Array.isArray(r.prov) || !r.prov.length || r.prov.length > 200) return bad();
  const yearDate = (value: unknown) => date(value, `${schoolYear}-07-01`, `${schoolYear + 1}-06-30`);
  const prov = r.prov.map((value): Provval => {
    const p = exact(value, ['id', 'namn', 'nivaer', 'tid'], ['tidsatgang', 'tidsplan']);
    const { typ } = exact(p.tid, ['typ'], ['datum', 'fran', 'till', 'tidigasteStartMin', 'senasteSlutMin']);
    let tid: Provval['tid'];
    if (typ === 'fast') {
      const t = exact(p.tid, ['typ', 'datum']);
      tid = { typ, datum: yearDate(t.datum) };
    } else if (typ === 'period') {
      const t = exact(p.tid, ['typ', 'fran'], ['till', 'tidigasteStartMin', 'senasteSlutMin']);
      tid = { typ, fran: yearDate(t.fran) };
      if (Object.hasOwn(t, 'till')) tid.till = yearDate(t.till);
      if (tid.till && tid.till < tid.fran || Object.hasOwn(t, 'senasteSlutMin') && !tid.till) return bad();
      if (Object.hasOwn(t, 'tidigasteStartMin')) tid.tidigasteStartMin = int(t.tidigasteStartMin, 0, 1439);
      if (Object.hasOwn(t, 'senasteSlutMin')) tid.senasteSlutMin = int(t.senasteSlutMin, 1, 1440);
    } else return bad();
    return { id: provId(p.id), namn: text(p.namn, 160), nivaer: parseProvnivaer(p.nivaer), tid,
      ...(Object.hasOwn(p, 'tidsatgang') && { tidsatgang: text(p.tidsatgang, 1000) }),
      ...(Object.hasOwn(p, 'tidsplan') && { tidsplan: parseProvtidsplan(p.tidsplan, tid) }) };
  });
  if (new Set(prov.map(p => p.id)).size !== prov.length) return bad();
  return { revision: int(r.revision, 1, 2147483647), kontrolleradDatum: date(r.kontrolleradDatum, '2000-01-01', '2101-12-31'), prov };
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
    const b = exact(value, ['id', 'namn', 'undervisning', 'mal', 'datum', 'startMin', 'slutMin', 'tidsval', 'salId', 'vakter', 'kontrolleradDatum'], ['kallprov']);
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
    const kallprov = Object.hasOwn(b, 'kallprov') ? exact(b.kallprov, ['id', 'revision']) : null;
    return { id, namn, undervisning, mal, datum, startMin, slutMin, tidsval: b.tidsval, salId, vakter,
      kontrolleradDatum: date(b.kontrolleradDatum, '2000-01-01', '2101-12-31'),
      ...(kallprov && { kallprov: { id: provId(kallprov.id), revision: int(kallprov.revision, 1, 2147483647) } }) };
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

export function parseNationellaProvUnderlag(raw: unknown, schoolYear?: number): NationellaProvUnderlag {
  const r = exact(raw, ['gallerGymnasiet', 'deltagare', 'salar', 'vakter', 'skoldagar'], ['terminer', 'provkatalog']);
  if (typeof r.gallerGymnasiet !== 'boolean' || !Array.isArray(r.deltagare) || !Array.isArray(r.salar) || !Array.isArray(r.vakter)
    || r.skoldagar !== null && !Array.isArray(r.skoldagar)) return bad();
  const deltagare = r.deltagare.map((value): NationellaProvDeltagare => {
    const d = exact(value, ['slag', 'ref', 'name', 'undervisningar'], ['klassRefs']);
    if (d.slag !== 'klass' && d.slag !== 'grupp' || !Array.isArray(d.undervisningar)) return bad();
    const result: NationellaProvDeltagare = { slag: d.slag, ref: uuid(d.ref), name: text(d.name, 500),
      undervisningar: d.undervisningar.map(parseProvundervisning) };
    if (Object.hasOwn(d, 'klassRefs')) {
      if (d.slag !== 'grupp' || !Array.isArray(d.klassRefs)) return bad();
      result.klassRefs = d.klassRefs.map(uuid);
      if (new Set(result.klassRefs).size !== result.klassRefs.length) return bad();
    }
    return result;
  });
  const salar = r.salar.map(value => {
    const room = exact(value, ['id', 'name']);
    return typeof room.id === 'string' && SAL.test(room.id) ? { id: room.id, name: text(room.name, 500) } : bad();
  });
  const vakter = r.vakter.map(value => {
    const person = exact(value, ['ref', 'name']);
    return { ref: uuid(person.ref), name: text(person.name, 500) };
  });
  const span = (raw: unknown) => {
    const t = exact(raw, ['start', 'end']);
    const start = date(t.start, '2000-01-01', '2101-12-31'), end = date(t.end, '2000-01-01', '2101-12-31');
    return start <= end ? { start, end } : bad();
  };
  const term = Object.hasOwn(r, 'terminer') ? exact(r.terminer, ['ht', 'vt']) : null;
  const terminer = term ? { ht: span(term.ht), vt: span(term.vt) } : undefined;
  if (terminer && terminer.ht.end >= terminer.vt.start) return bad();
  const provkatalog = Object.hasOwn(r, 'provkatalog')
    ? parseNationellaProvKatalog(r.provkatalog, schoolYear ?? bad()) : undefined;
  return { gallerGymnasiet: r.gallerGymnasiet, deltagare, salar, vakter, ...(terminer && { terminer }),
    ...(provkatalog !== undefined && { provkatalog }),
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
