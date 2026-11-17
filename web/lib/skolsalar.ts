/**
 * Skolans salregister (05.2-SM-UXF-23). Salarna är en konstant per skolenhet och lagras i en egen tabell. Ett schemautkast som använder registret
 * har `villkor.salregister.kalla === 'skola'`: utkastets `nasta` och `salar` speglar då tabellen, och servern ersätter alltid spegeln med tabellens innehåll.
 * Salens ID (`sal-N`) är stabilt inom skolenheten. Ett nytt namn eller en borttagen sal följer med i utkastets regler, aktiviteter och salbehov via ID:t.
 * Grundens fingeravtryck bygger på `arv` och ändras inte.
 * SS 12000 `Room`: namn → displayName, platser → seatingCapacity, skolenheten → ägande organisation. Saltyp och utrustning är interna.
 */
import { SCHEMA_SAL_LIMITS, SchemaSalregisterError, medRegister, overforSalnamn, parseSalregister, type MedSalar, type SchemaSal, type SchemaSalbehov } from './schema-salregister.ts';

export const SKOLSALAR_VERSION = 1 as const;
export type SchemaSkolsalar = { nasta: number; salar: SchemaSal[] };
export type SkolsalarRegister = { revision: number; contentHash: string; savedAt: string; document: SchemaSkolsalar };
export type SkolsalarScope = { contractVersion: typeof SKOLSALAR_VERSION; unitId: string };
export type SkolsalarLasning = SkolsalarScope & { register: SkolsalarRegister | null };
export type SkolsalarSpara = SkolsalarScope & { commandId: string; expectedRevision: number; document: SchemaSkolsalar };
export type SkolsalarSvar = SkolsalarScope & { register: SkolsalarRegister; replayed: boolean };

export class SkolsalarError extends Error {}
function bad(): never { throw new SkolsalarError(); }
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u, HASH = /^sha256:[0-9a-f]{64}$/u;
function exact(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad();
  return r;
}
const uuid = (value: unknown) => { if (typeof value !== 'string' || !UUID.test(value)) bad(); return value; };
const heltal = (value: unknown, min: number, max: number) => { if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min || value > max) bad(); return value; };

/** Samma regler som tabellens kontroll: högst 100 salar, `sal-N` under `nasta`, unika namn utan hänsyn till skiftläge. */
export function parseSkolsalarDokument(value: unknown): SchemaSkolsalar {
  const r = exact(value, ['nasta', 'salar']);
  try { const p = parseSalregister({ nasta: r.nasta, arv: [], salar: r.salar }); return { nasta: p.nasta, salar: p.salar }; }
  catch (error) { if (error instanceof SchemaSalregisterError) bad(); throw error; }
}
export function parseSkolsalarScope(value: unknown): SkolsalarScope {
  const r = exact(value, ['contractVersion', 'unitId']);
  if (r.contractVersion !== SKOLSALAR_VERSION) bad();
  return { contractVersion: SKOLSALAR_VERSION, unitId: uuid(r.unitId) };
}
export function parseSkolsalarSpara(value: unknown): SkolsalarSpara {
  const r = exact(value, ['contractVersion', 'unitId', 'commandId', 'expectedRevision', 'document']);
  if (r.contractVersion !== SKOLSALAR_VERSION) bad();
  return { contractVersion: SKOLSALAR_VERSION, unitId: uuid(r.unitId), commandId: uuid(r.commandId), expectedRevision: heltal(r.expectedRevision, 0, 2147483646), document: parseSkolsalarDokument(r.document) };
}
export function parseSkolsalarRegister(value: unknown): SkolsalarRegister | null {
  if (value === null) return null;
  const r = exact(value, ['revision', 'contentHash', 'savedAt', 'document']);
  if (typeof r.contentHash !== 'string' || !HASH.test(r.contentHash) || typeof r.savedAt !== 'string' || !Number.isFinite(Date.parse(r.savedAt))) bad();
  return { revision: heltal(r.revision, 1, 2147483647), contentHash: r.contentHash, savedAt: r.savedAt, document: parseSkolsalarDokument(r.document) };
}
export function parseSkolsalarLasning(value: unknown): SkolsalarLasning {
  const r = exact(value, ['contractVersion', 'unitId', 'register']);
  return { ...parseSkolsalarScope({ contractVersion: r.contractVersion, unitId: r.unitId }), register: parseSkolsalarRegister(r.register) };
}
export function parseSkolsalarSvar(value: unknown): SkolsalarSvar {
  const r = exact(value, ['contractVersion', 'unitId', 'register', 'replayed']);
  const register = parseSkolsalarRegister(r.register);
  if (!register || typeof r.replayed !== 'boolean') bad();
  return { ...parseSkolsalarScope({ contractVersion: r.contractVersion, unitId: r.unitId }), register, replayed: r.replayed };
}

type Regel = { slag: string; ref: string; typ: string; rooms?: string[] };
const same = (a: string, b: string) => a.toLocaleLowerCase('sv') === b.toLocaleLowerCase('sv');
/** Nämner utkastets villkor, aktiviteter eller salbehov salar? Då används inte skolans register utan uttryckligt val. */
function harSalar(v: MedSalar): boolean {
  return v.salar.length > 0 || !!v.salbehov?.length || (v.egna as Regel[]).some(r => r.slag === 'sal' || r.typ === 'sal' || !!r.rooms?.length)
    || !!(v.aktiviteter as { rooms: string[] }[] | undefined)?.some(a => a.rooms.length > 0);
}
/** Byter alla salnamn samtidigt (`null` tar bort), så att två salar kan byta namn med varandra. */
function bytNamn<V extends MedSalar>(v: V, byt: Map<string, string | null>): Pick<V, 'egna' | 'aktiviteter'> {
  const ny = (name: string) => byt.has(name) ? byt.get(name)! : name;
  const egna = (v.egna as Regel[]).flatMap((r): Regel[] => {
    if (r.slag === 'sal' && byt.has(r.ref)) { const ref = ny(r.ref); return ref === null ? [] : [{ ...r, ref }]; }
    if (!r.rooms?.some(x => byt.has(x))) return [r];
    const rooms = r.rooms.flatMap(x => { const n = ny(x); return n === null ? [] : [n]; });
    return rooms.length ? [{ ...r, rooms }] : [];
  });
  const aktiviteter = (v.aktiviteter as { rooms: string[] }[] | undefined)?.map(a => a.rooms.some(x => byt.has(x)) ? { ...a, rooms: a.rooms.flatMap(x => { const n = ny(x); return n === null ? [] : [n]; }) } : a);
  return { egna, ...(aktiviteter ? { aktiviteter } : {}) } as Pick<V, 'egna' | 'aktiviteter'>;
}
/** Salbehov utan de borttagna salarna. Ett särskilt krav som bara var en borttagen sal blir obesvarat. */
function utanSalar(behov: SchemaSalbehov[] | undefined, borta: Set<string>): SchemaSalbehov[] | undefined {
  return behov?.flatMap((b): SchemaSalbehov[] => {
    if (!b.salar.some(id => borta.has(id)) && !b.onskad.some(id => borta.has(id))) return [b];
    const next = { ...b, salar: b.salar.filter(id => !borta.has(id)), onskad: b.onskad.filter(id => !borta.has(id)) };
    return next.lage === 'sarskild' && next.typ === null && !next.utrustning.length && !next.salar.length ? [] : [next];
  });
}

/**
 * Utkastets villkor med skolans salregister. `skola` null: skolan har inget register ännu.
 * - `kalla` `skola`: spegeln ersätts med skolans salar. Nya namn och borttagna salar följer med via ID:t.
 * - Inget register och inga salar nämnda i utkastet: utkastet börjar använda skolans register. Grunden ändras inte, eftersom inga salnamn fanns.
 * - Annars (äldre salnamn eller utkastets eget register): oförändrat tills någon för över salarna uttryckligen (`overforingTillSkolan`).
 * Funktionen är idempotent, så att server och webbläsare får samma villkor.
 */
export function medSkolsalar<V extends MedSalar>(v: V, skola: SchemaSkolsalar | null): V {
  let x: V = v;
  if (!x.salregister) {
    if (harSalar(x)) return v;
    x = medRegister(x, { nasta: 1, arv: [], salar: [], kalla: 'skola' });
  }
  const reg = x.salregister!;
  if (reg.kalla !== 'skola') return v;
  const ny = skola ?? { nasta: 1, salar: [] }, nya = new Map(ny.salar.map(s => [s.id, s]));
  const byt = new Map<string, string | null>(), borta = new Set<string>();
  for (const s of reg.salar) {
    const m = nya.get(s.id);
    if (!m) { borta.add(s.id); byt.set(s.name, null); } else if (m.name !== s.name) byt.set(s.name, m.name);
  }
  const salbehov = borta.size ? utanSalar(x.salbehov, borta) : x.salbehov;
  const register = { nasta: Math.max(ny.nasta, reg.arv.length + 1), arv: reg.arv, salar: ny.salar, kalla: 'skola' as const };
  const next = medRegister(x, register, { ...(byt.size ? bytNamn(x, byt) : {}), ...(salbehov ? { salbehov } : {}) } as Partial<V>);
  return JSON.stringify(next) === JSON.stringify(v) ? v : next;
}

export type SkolsalarOverforing<V> = { rader: { id: string; name: string; finns: boolean }[]; konflikter: string[]; dokument: SchemaSkolsalar; villkor: V };
/**
 * Förhandsgranskning av en uttrycklig överföring av utkastets salar till skolans register. Äldre salnamn blir först `sal-n` i listans ordning
 * (antagande A6), så att lagda pass behåller sin sal. En sal som finns med samma nummer och namn i skolans register är densamma. Samma nummer
 * med annat namn, eller samma namn med annat nummer, är en konflikt: då förs inget över. `null`: det finns inget att föra över.
 */
export function overforingTillSkolan<V extends MedSalar>(v: V, skola: SchemaSkolsalar | null): SkolsalarOverforing<V> | null {
  if (v.salregister?.kalla === 'skola' || !v.salregister && !v.salar.length) return null;
  const egen = v.salregister ? v : overforSalnamn(v), reg = egen.salregister!, s = skola ?? { nasta: 1, salar: [] };
  const konflikter: string[] = [], rader: SkolsalarOverforing<V>['rader'] = [];
  for (const d of reg.salar) {
    const m = s.salar.find(x => x.id === d.id), n = s.salar.find(x => same(x.name, d.name));
    if (m && !same(m.name, d.name)) konflikter.push(`${d.name}: numret ${d.id.slice(4)} är redan ${m.name} i skolans salregister.`);
    else if (!m && n) konflikter.push(`${d.name}: salen har ett annat nummer i skolans salregister.`);
    rader.push({ id: d.id, name: m?.name ?? d.name, finns: !!m });
  }
  const salar = [...s.salar, ...reg.salar.filter(d => !s.salar.some(m => m.id === d.id))];
  if (salar.length > SCHEMA_SAL_LIMITS.salar) konflikter.push(`Skolans salregister får ha högst ${SCHEMA_SAL_LIMITS.salar} salar.`);
  const dokument = { nasta: Math.max(s.nasta, reg.nasta), salar };
  return { rader, konflikter, dokument, villkor: medSkolsalar({ ...egen, salregister: { ...reg, kalla: 'skola' } }, dokument) };
}
