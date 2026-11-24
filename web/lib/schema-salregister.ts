/**
 * Salregister och salbehov (05.2-SM-UXF-21). Registret ligger i utkastets villkor. Varje sal har ett stabilt ID (`sal-N`) som aldrig
 * återanvänds i utkastet: `nasta` är nästa lediga nummer. Namn, ordning, platser och utrustning kan ändras utan att lagda pass byter sal.
 * `arv` är de äldre salnamnen vid överföringen, oföränderliga. Grundens fingeravtryck räknas på dem, så att varken överföringen eller senare
 * ändringar i registret gör ett lagt schema ogiltigt: salarna avgör inte vilka pass som finns.
 * Salbehovet har tre lägen; en undervisning utan post är obesvarad. Flera krav ger snittet av salarna, aldrig unionen.
 * SS 12000 `Room`: namn → `displayName`, platser → `seats`. Saltyp, utrustning och salbehov finns inte i standarden.
 */
export const SCHEMA_SAL_LIMITS = { salar: 100, namn: 60, typ: 40, utrustning: 12, tagg: 40, platser: [1, 2000], behov: 2000, ref: 2000 } as const;
/** Saltypen som "Lämplig allmän sal" söker. Jämförs utan hänsyn till skiftläge. */
export const ALLMAN_SALTYP = 'Allmän sal';
export const SALTYP_FORSLAG = [ALLMAN_SALTYP, 'Laborationssal', 'Idrottshall', 'Specialsal'] as const;
export const SCHEMA_UNDERVISNINGSFORMER = ['utomhus', 'annan_plats', 'arbetsplats', 'distans', 'annat'] as const;
export type SchemaUndervisningsform = typeof SCHEMA_UNDERVISNINGSFORMER[number];
export const UNDERVISNINGSFORM_NAMN: Record<SchemaUndervisningsform, string> = { utomhus: 'utomhus', annan_plats: 'på annan plats', arbetsplats: 'på arbetsplats', distans: 'på distans', annat: 'annan form' };

/** `typ` tom: saltypen är inte angiven och salen räknas aldrig som allmän sal. `platser` null: okänt, kapaciteten kan inte kontrolleras. */
export type SchemaSal = { id: string; name: string; typ: string; platser: number | null; utrustning: string[] };
/** `kalla` `skola` (05.2-SM-UXF-23): `nasta` och `salar` speglar skolans salregister och ersätts alltid av servern med tabellens innehåll. Utan `kalla` är registret utkastets eget. */
export type SchemaSalregister = { nasta: number; arv: string[]; salar: SchemaSal[]; kalla?: 'skola' };
export type SchemaSalbehovLage = 'allman' | 'sarskild' | 'ingen';
/**
 * `slag` `amne`: gäller ämnets alla undervisningar (ärvs). `undervisning`: eget undantag för en undervisning och går före ämnets.
 * `salar`: bestämda salar, någon av dem. `onskad`: önskemål, vägs inte av motorn. `form` krävs när sal inte behövs.
 */
export type SchemaSalbehov = { slag: 'amne' | 'undervisning'; ref: string; lage: SchemaSalbehovLage; typ: string | null; utrustning: string[]; salar: string[]; onskad: string[]; form: SchemaUndervisningsform | null };
export type SchemaSalKapacitet = 'racker' | 'for_liten' | 'okand';
export type SchemaSalBedomning = { sal: SchemaSal; lamplig: boolean; skal: string[]; kapacitet: SchemaSalKapacitet };
export type SchemaSalUrval = { rader: SchemaSalBedomning[]; tillatna: string[]; kapacitet: Record<string, SchemaSalKapacitet>; hinder: string | null };

export class SchemaSalregisterError extends Error {}
const SAL_ID = /^sal-([1-9]\d{0,2})$/u;
function bad(): never { throw new SchemaSalregisterError(); }
function record(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) bad();
  const r = value as Record<string, unknown>;
  if (Object.keys(r).length !== keys.length || keys.some(k => !Object.hasOwn(r, k))) bad();
  return r;
}
function list(value: unknown, max: number): unknown[] { if (!Array.isArray(value) || value.length > max) bad(); return value; }
function text(value: unknown, max: number, empty = false): string {
  if (typeof value !== 'string' || value !== value.trim() || value.length > max || !empty && !value || /\p{Cc}/u.test(value)) bad();
  return value;
}
const same = (a: string, b: string) => a.toLocaleLowerCase('sv') === b.toLocaleLowerCase('sv');
const distinct = (values: string[]) => new Set(values.map(x => x.toLocaleLowerCase('sv'))).size === values.length;
function tags(value: unknown): string[] { const t = list(value, SCHEMA_SAL_LIMITS.utrustning).map(x => text(x, SCHEMA_SAL_LIMITS.tagg)); if (!distinct(t)) bad(); return t; }
function ids(value: unknown): string[] { const t = list(value, SCHEMA_SAL_LIMITS.salar).map(x => { const id = text(x, 10); if (!SAL_ID.test(id)) bad(); return id; }); if (new Set(t).size !== t.length) bad(); return t; }
export const salNummer = (id: string): number => Number(SAL_ID.exec(id)?.[1] ?? 0);

export function parseSalregister(value: unknown): SchemaSalregister {
  const r = record(value, value && typeof value === 'object' && Object.hasOwn(value, 'kalla') ? ['nasta', 'arv', 'salar', 'kalla'] : ['nasta', 'arv', 'salar']);
  if (Object.hasOwn(r, 'kalla') && r.kalla !== 'skola') bad();
  const arv = list(r.arv, SCHEMA_SAL_LIMITS.salar).map(x => text(x, SCHEMA_SAL_LIMITS.namn));
  const salar = list(r.salar, SCHEMA_SAL_LIMITS.salar).map((raw): SchemaSal => {
    const s = record(raw, ['id', 'name', 'typ', 'platser', 'utrustning']), id = text(s.id, 10);
    if (!SAL_ID.test(id)) bad();
    if (s.platser !== null && (typeof s.platser !== 'number' || !Number.isSafeInteger(s.platser) || s.platser < SCHEMA_SAL_LIMITS.platser[0] || s.platser > SCHEMA_SAL_LIMITS.platser[1])) bad();
    return { id, name: text(s.name, SCHEMA_SAL_LIMITS.namn), typ: text(s.typ, SCHEMA_SAL_LIMITS.typ, true), platser: s.platser as number | null, utrustning: tags(s.utrustning) };
  });
  if (typeof r.nasta !== 'number' || !Number.isSafeInteger(r.nasta) || r.nasta < 1 || r.nasta > 1000) bad();
  if (new Set(salar.map(s => s.id)).size !== salar.length || !distinct(salar.map(s => s.name)) || salar.some(s => salNummer(s.id) >= (r.nasta as number))) bad();
  if (!distinct(arv) || arv.length >= (r.nasta as number)) bad();
  return { nasta: r.nasta as number, arv, salar, ...(r.kalla === 'skola' ? { kalla: 'skola' as const } : {}) };
}
export function parseSalbehov(value: unknown): SchemaSalbehov[] {
  const seen = new Set<string>();
  return list(value, SCHEMA_SAL_LIMITS.behov).map((raw): SchemaSalbehov => {
    const b = record(raw, ['slag', 'ref', 'lage', 'typ', 'utrustning', 'salar', 'onskad', 'form']);
    if (b.slag !== 'amne' && b.slag !== 'undervisning' || b.lage !== 'allman' && b.lage !== 'sarskild' && b.lage !== 'ingen') bad();
    const behov: SchemaSalbehov = { slag: b.slag as SchemaSalbehov['slag'], ref: text(b.ref, SCHEMA_SAL_LIMITS.ref), lage: b.lage as SchemaSalbehovLage, typ: b.typ === null ? null : text(b.typ, SCHEMA_SAL_LIMITS.typ),
      utrustning: tags(b.utrustning), salar: ids(b.salar), onskad: ids(b.onskad),
      form: b.form === null ? null : SCHEMA_UNDERVISNINGSFORMER.includes(b.form as SchemaUndervisningsform) ? b.form as SchemaUndervisningsform : bad() };
    const key = `${behov.slag}:${behov.ref}`; if (seen.has(key)) bad(); seen.add(key);
    return behov;
  });
}
/** Felet i ett salbehov i klartext, eller `null`. `known`: registrets sal-ID. */
export function salbehovFel(b: Omit<SchemaSalbehov, 'slag' | 'ref'>, known: Set<string>): string | null {
  if (b.lage === 'ingen' ? b.form === null || b.typ !== null || b.utrustning.length || b.salar.length || b.onskad.length : b.form !== null) return 'Ange undervisningsform när sal inte behövs, och bara då.';
  if (b.lage === 'allman' && (b.typ !== null || b.utrustning.length || b.salar.length)) return 'En lämplig allmän sal har inga särskilda krav. Välj Särskilda salskrav för typ, utrustning eller bestämd sal.';
  if (b.lage === 'sarskild' && b.typ === null && !b.utrustning.length && !b.salar.length) return 'Ange minst ett krav: saltyp, utrustning eller bestämd sal.';
  if ([...b.salar, ...b.onskad].some(id => !known.has(id))) return 'En vald sal finns inte längre i salregistret.';
  return null;
}
/** Rimlighet som användaren kan rätta. Tom lista: inga fel. `salar` är villkorens namnlista, som ska följa registret när det finns. */
export function checkSalregister(register: SchemaSalregister | undefined, behov: SchemaSalbehov[] | undefined, salar: string[]): string[] {
  if (!register) return behov?.length ? ['Salbehov kräver ett salregister. För över salnamnen eller lägg till en sal i registret.'] : [];
  if (register.salar.length !== salar.length || register.salar.some((s, i) => s.name !== salar[i])) return ['Salregistret och salarnas namn stämmer inte överens. Läs om utkastet.'];
  const known = new Set(register.salar.map(s => s.id));
  for (const b of behov ?? []) {
    const fel = salbehovFel(b, known);
    // Undervisningens referens är en teknisk nyckel och visas inte; ämnets referens är dess namn.
    if (fel) return [`${b.slag === 'amne' ? `Salbehovet för ${b.ref}` : 'Salbehovet för en undervisning'}: ${fel}`];
  }
  return [];
}

/** Undervisningens eget salbehov går före ämnets. `null`: obesvarat. */
export function gallandeSalbehov(behov: SchemaSalbehov[] | undefined, undervisningRef: string, amneRef: string): { behov: SchemaSalbehov; kalla: 'eget' | 'amne' } | null {
  const eget = behov?.find(b => b.slag === 'undervisning' && b.ref === undervisningRef);
  if (eget) return { behov: eget, kalla: 'eget' };
  const amne = behov?.find(b => b.slag === 'amne' && b.ref === amneRef);
  return amne ? { behov: amne, kalla: 'amne' } : null;
}

export function allmantSalbehov(ref: string): SchemaSalbehov {
  return { slag: 'undervisning', ref, ...tomtSalbehov('allman') };
}

type Krav = Omit<SchemaSalbehov, 'slag' | 'ref'>;
const kravText = (b: Krav, register: SchemaSalregister, elever: number | null): string[] => [
  ...(b.lage === 'allman' ? ['allmän sal'] : []), ...(b.typ ? [`saltyp ${b.typ.toLocaleLowerCase('sv')}`] : []), ...b.utrustning.map(u => u.toLocaleLowerCase('sv')),
  ...(b.salar.length ? [`någon av ${b.salar.map(id => register.salar.find(s => s.id === id)?.name ?? id).join(', ')}`] : []), ...(elever !== null ? [`minst ${elever} platser`] : [])];

/**
 * Vilka salar som uppfyller alla krav (snittet), med skäl för varje sal som faller bort. Okänt elevantal eller okända platser sorterar
 * aldrig bort en sal; kapaciteten är då inte kontrollerad. Tom mängd ger ett hinder i klartext. Sal behövs inte ger ingen sal och inget hinder.
 */
export function lampligaSalar(register: SchemaSalregister, behov: Krav, elever: number | null): SchemaSalUrval {
  if (behov.lage === 'ingen') return { rader: [], tillatna: [], kapacitet: {}, hinder: null };
  const rader = register.salar.map((sal): SchemaSalBedomning => {
    const skal: string[] = [];
    if (behov.lage === 'allman' && !same(sal.typ, ALLMAN_SALTYP)) skal.push(sal.typ ? `Är ${sal.typ.toLocaleLowerCase('sv')}, inte allmän sal.` : 'Saltypen är inte angiven.');
    if (behov.typ && !same(sal.typ, behov.typ)) skal.push(sal.typ ? `Är ${sal.typ.toLocaleLowerCase('sv')}, inte ${behov.typ.toLocaleLowerCase('sv')}.` : 'Saltypen är inte angiven.');
    for (const u of behov.utrustning) if (!sal.utrustning.some(x => same(x, u))) skal.push(`Saknar ${u.toLocaleLowerCase('sv')}.`);
    if (behov.salar.length && !behov.salar.includes(sal.id)) skal.push('Är inte en av de bestämda salarna.');
    const kapacitet: SchemaSalKapacitet = elever === null || sal.platser === null ? 'okand' : sal.platser < elever ? 'for_liten' : 'racker';
    if (kapacitet === 'for_liten') skal.push(`${sal.platser} platser, gruppen har ${elever} elever.`);
    return { sal, lamplig: skal.length === 0, skal, kapacitet };
  });
  const lampliga = rader.filter(r => r.lamplig), krav = kravText(behov, register, elever);
  return { rader, tillatna: lampliga.map(r => r.sal.id), kapacitet: Object.fromEntries(lampliga.map(r => [r.sal.id, r.kapacitet])),
    hinder: lampliga.length ? null : register.salar.length === 0 ? 'Salregistret är tomt.' : `Ingen sal uppfyller ${krav.length > 1 ? 'alla krav' : 'kravet'}: ${krav.join(', ')}.` };
}

export type MedSalar = { salar: string[]; salregister?: SchemaSalregister; salbehov?: SchemaSalbehov[]; egna: unknown[]; aktiviteter?: unknown[] };
type Regel = { slag: string; ref: string; typ: string; rooms?: string[] };
/** Byter eller tar bort ett salnamn i villkor för salen, salvillkor och aktiviteter. `till` null tar bort. */
export function namnIVillkor<V extends MedSalar>(v: V, fran: string, till: string | null): Pick<V, 'egna' | 'aktiviteter'> {
  const egna = (v.egna as Regel[]).flatMap((r): Regel[] => {
    if (r.slag === 'sal' && r.ref === fran) return till === null ? [] : [{ ...r, ref: till }];
    if (!r.rooms?.includes(fran)) return [r];
    const rooms = r.rooms.flatMap(x => x !== fran ? [x] : till === null ? [] : [till]);
    return rooms.length ? [{ ...r, rooms }] : [];
  });
  const aktiviteter = (v.aktiviteter as { rooms: string[] }[] | undefined)?.map(a => a.rooms.includes(fran) ? { ...a, rooms: a.rooms.flatMap(x => x !== fran ? [x] : till === null ? [] : [till]) } : a);
  return { egna, ...(aktiviteter ? { aktiviteter } : {}) } as Pick<V, 'egna' | 'aktiviteter'>;
}
export const medRegister = <V extends MedSalar>(v: V, register: SchemaSalregister, extra: Partial<V> = {}): V => ({ ...v, ...extra, salregister: register, salar: register.salar.map(s => s.name) });

/**
 * Uttrycklig överföring av äldre salnamn (antagande A6): namn nummer n blir `sal-n`, så att lagda pass och lås behåller sin sal.
 * Saltyp och platser är okända efteråt; inget gissas.
 */
export function overforSalnamn<V extends MedSalar>(v: V): V {
  if (v.salregister) return v;
  return medRegister(v, { nasta: v.salar.length + 1, arv: [...v.salar], salar: v.salar.map((name, i) => ({ id: `sal-${i + 1}`, name, typ: '', platser: null, utrustning: [] })) });
}
export type SchemaSalUppgifter = Omit<SchemaSal, 'id'>;
export const salnamnLedigt = (v: MedSalar, name: string, utom?: string) => !(v.salregister?.salar ?? []).some(s => s.id !== utom && same(s.name, name)) && (v.salregister ? true : !v.salar.some(x => same(x, name)));
/** Ny sal med nästa lediga ID. Skapar registret om det saknas och inga äldre salnamn finns. */
export function laggTillSal<V extends MedSalar>(v: V, sal: SchemaSalUppgifter): V {
  const register = v.salregister ?? (v.salar.length ? null : { nasta: 1, arv: [], salar: [] });
  if (!register || register.salar.length >= SCHEMA_SAL_LIMITS.salar || !salnamnLedigt(v, sal.name)) return v;
  return medRegister(v, { ...register, nasta: register.nasta + 1, salar: [...register.salar, { ...sal, id: `sal-${register.nasta}` }] });
}
/** Ändrar en sals uppgifter. Ett nytt namn följer med i villkor och aktiviteter; ID:t är oförändrat. */
export function andraSal<V extends MedSalar>(v: V, id: string, sal: SchemaSalUppgifter): V {
  const register = v.salregister, old = register?.salar.find(s => s.id === id);
  if (!register || !old || !salnamnLedigt(v, sal.name, id)) return v;
  const next = { ...register, salar: register.salar.map(s => s.id === id ? { ...sal, id } : s) };
  return medRegister(v, next, old.name === sal.name ? {} : namnIVillkor(v, old.name, sal.name) as Partial<V>);
}
/** Tar bort en sal. Numret återanvänds inte. `berorda`: salbehov som pekade på salen och därför ändrades. */
export function taBortSal<V extends MedSalar>(v: V, id: string): { villkor: V; berorda: string[] } {
  const register = v.salregister, old = register?.salar.find(s => s.id === id);
  if (!register || !old) return { villkor: v, berorda: [] };
  const berorda: string[] = [];
  const salbehov = v.salbehov?.flatMap((b): SchemaSalbehov[] => {
    if (!b.salar.includes(id) && !b.onskad.includes(id)) return [b];
    berorda.push(b.ref);
    const salar = b.salar.filter(x => x !== id), next = { ...b, salar, onskad: b.onskad.filter(x => x !== id) };
    // Ett särskilt krav som bara var den borttagna salen blir obesvarat, inte ett tyst godkänt behov.
    return next.lage === 'sarskild' && next.typ === null && !next.utrustning.length && !salar.length ? [] : [next];
  });
  const villkor = medRegister(v, { ...register, salar: register.salar.filter(s => s.id !== id) }, { ...namnIVillkor(v, old.name, null), ...(salbehov ? { salbehov } : {}) } as Partial<V>);
  return { villkor, berorda };
}
/** Sätter eller tar bort (`null`) ett salbehov. */
export function sattSalbehov<V extends MedSalar>(v: V, slag: SchemaSalbehov['slag'], ref: string, behov: Omit<SchemaSalbehov, 'slag' | 'ref'> | null): V {
  const rest = (v.salbehov ?? []).filter(b => !(b.slag === slag && b.ref === ref));
  return { ...v, salbehov: behov ? [...rest, { slag, ref, ...behov }] : rest };
}
export const tomtSalbehov = (lage: SchemaSalbehovLage): Omit<SchemaSalbehov, 'slag' | 'ref'> => ({ lage, typ: null, utrustning: [], salar: [], onskad: [], form: lage === 'ingen' ? 'annat' : null });
