/**
 * Egna samtidighetsblock (05.2-SM-UXF-51). Utvalda veckopass från olika undervisningar ska börja samtidigt. Varje pass behåller sina deltagare,
 * lärare, sal och minuter; blocket ger ingen rätt till dubbelbokning. Motorns koppling `simultaneous` kräver samma dag och start och samma perioder,
 * och ett pass får bara ingå i en koppling. Pass med olika längd börjar samtidigt och slutar olika (prövat i motorns own_blocks.rs).
 * "Samma slut" finns inte i motorn och erbjuds därför inte.
 * Medlemmarna anges som undervisningens referens, termin och passets nummer inom undervisningen, samma numrering som villkor för enskilda pass.
 * SS 12000: internt planeringsbegrepp utanför standarden; inga grupper eller aktiviteter skapas.
 */
import type { SchemaProblem } from './schema-contract.ts';

export const SCHEMA_BLOCK_LIMITS = { block: 50, namn: 60, medlemmar: [2, 20], ref: 2000, pass: 20 } as const;
export type SchemaBlockMedlem = { ref: string; term: 'ht' | 'vt' | null; pass: number };
export type SchemaEgetBlock = { id: string; namn: string; medlemmar: SchemaBlockMedlem[] };
/** `aktivt`: skickas till motorn. `hinder`: används inte förrän hindret är löst. `inaktuellt`: något pass finns inte längre i underlaget. */
export type SchemaBlockStatus = { id: string; namn: string; status: 'aktivt' | 'hinder' | 'inaktuellt'; text: string; lessons: string[];
  /** Andra block som delar pass med detta och därför läggs som en samtidighetsgrupp. */ grupp: string[] };

export class SchemaBlockError extends Error {}
function bad(): never { throw new SchemaBlockError(); }
const BLOCK_ID = /^block-[1-9]\d{0,3}$/u;
function text(value: unknown, max: number): string {
  if (typeof value !== 'string' || !value.trim() || value !== value.trim() || value.length > max || /\p{Cc}/u.test(value)) bad();
  return value;
}
export function parseSchemaBlock(value: unknown): SchemaEgetBlock[] {
  if (!Array.isArray(value) || value.length > SCHEMA_BLOCK_LIMITS.block) bad();
  const ids = new Set<string>();
  return value.map(raw => {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) bad();
    const r = raw as Record<string, unknown>;
    if (Object.keys(r).length !== 3 || !BLOCK_ID.test(String(r.id)) || ids.has(r.id as string) || !Array.isArray(r.medlemmar)) bad();
    ids.add(r.id as string);
    const medlemmar = r.medlemmar.map(m => {
      if (!m || typeof m !== 'object' || Array.isArray(m) || Object.keys(m).length !== 3) bad();
      const x = m as Record<string, unknown>;
      if (x.term !== null && x.term !== 'ht' && x.term !== 'vt' || typeof x.pass !== 'number' || !Number.isSafeInteger(x.pass) || x.pass < 1 || x.pass > SCHEMA_BLOCK_LIMITS.pass) bad();
      return { ref: text(x.ref, SCHEMA_BLOCK_LIMITS.ref), term: x.term as SchemaBlockMedlem['term'], pass: x.pass as number };
    });
    return { id: r.id as string, namn: text(r.namn, SCHEMA_BLOCK_LIMITS.namn), medlemmar };
  });
}
const nyckel = (m: SchemaBlockMedlem) => `${m.ref}|${m.term ?? ''}|${m.pass}`;
/** Fel som användaren kan rätta i formuläret. Tom lista: inga fel. */
export function checkSchemaBlock(block: SchemaEgetBlock[] | undefined): string[] {
  const namn = new Set<string>();
  for (const b of block ?? []) {
    if (namn.has(b.namn.toLocaleLowerCase('sv'))) return [`Två samtidighetsblock heter ${b.namn}. Ge dem olika namn.`];
    namn.add(b.namn.toLocaleLowerCase('sv'));
    if (b.medlemmar.length < SCHEMA_BLOCK_LIMITS.medlemmar[0] || b.medlemmar.length > SCHEMA_BLOCK_LIMITS.medlemmar[1]) return [`Samtidighetsblocket ${b.namn} ska ha 2–20 pass.`];
    if (new Set(b.medlemmar.map(nyckel)).size !== b.medlemmar.length) return [`Samtidighetsblocket ${b.namn} nämner samma pass två gånger.`];
    if (new Set(b.medlemmar.map(m => m.ref)).size !== b.medlemmar.length) return [`Samtidighetsblocket ${b.namn} har två pass ur samma undervisning. De kan inte gå samtidigt.`];
  }
  return [];
}
export const nastaBlockId = (block: SchemaEgetBlock[] | undefined) => `block-${Math.max(0, ...(block ?? []).map(b => Number(b.id.slice(6)))) + 1}`;

type Etiketter = { activities: { id: string; ref: string; title: string }[]; lessons: { id: string; activity: string; title: string; term: 'ht' | 'vt' | null; classIds: string[]; teacherIds: string[] }[];
  teachers: { id: string; name: string }[]; classes: { id: string; name: string }[]; names: Record<string, string> };
/** Passets id för en medlem, med samma numrering som villkor för enskilda pass: ordningen bland undervisningens pass i samma termin. */
export function blockPass(labels: Pick<Etiketter, 'activities' | 'lessons'>, m: SchemaBlockMedlem): string | null {
  const aktivitet = labels.activities.find(a => a.ref === m.ref);
  if (!aktivitet) return null;
  return labels.lessons.filter(l => l.activity === aktivitet.id && l.term === m.term)[m.pass - 1]?.id ?? null;
}

/**
 * Slår upp blocken i underlaget och ger motorns kopplingar för de block som kan användas. Block som delar pass slås ihop till en grupp och prövas
 * tillsammans. Hinder och inaktuella block skickas inte; de redovisas med namn.
 */
export function schemaBlock(block: SchemaEgetBlock[] | undefined, problem: Pick<SchemaProblem, 'lessons' | 'groups'>, labels: Etiketter): { links: NonNullable<SchemaProblem['links']>; status: SchemaBlockStatus[] } {
  const status: SchemaBlockStatus[] = [], losta: { b: SchemaEgetBlock; lessons: string[] }[] = [];
  for (const b of block ?? []) {
    const lessons = b.medlemmar.map(m => blockPass(labels, m));
    if (lessons.some(id => id === null)) {
      const saknas = b.medlemmar.filter((_, i) => lessons[i] === null).map(m => `${labels.activities.find(a => a.ref === m.ref)?.title ?? 'en undervisning som inte finns i underlaget'}, pass ${m.pass}${m.term ? ` (${m.term.toUpperCase()})` : ''}`);
      status.push({ id: b.id, namn: b.namn, status: 'inaktuellt', lessons: lessons.filter((x): x is string => x !== null), grupp: [],
        text: `Passen finns inte längre: ${saknas.join('; ')}. Antalet lektioner kan ha ändrats. Välj passen på nytt.` });
      continue;
    }
    losta.push({ b, lessons: lessons as string[] });
  }
  // Block som delar pass bildar en samtidighetsgrupp (motorn tillåter ett pass i en koppling).
  const grupper: { block: typeof losta; lessons: Set<string> }[] = [];
  for (const x of losta) {
    const traffar = grupper.filter(g => x.lessons.some(id => g.lessons.has(id)));
    const ny = { block: [x, ...traffar.flatMap(g => g.block)], lessons: new Set([...x.lessons, ...traffar.flatMap(g => [...g.lessons])]) };
    for (const g of traffar) grupper.splice(grupper.indexOf(g), 1);
    grupper.push(ny);
  }
  const lesson = new Map(problem.lessons.map(l => [l.id, l])), etikett = new Map(labels.lessons.map(l => [l.id, l]));
  const kluster = new Map(problem.groups.map(g => [g.id, g.clusters]));
  const larare = new Map(labels.teachers.map(t => [t.id, t.name]));
  const passNamn = (id: string) => { const l = etikett.get(id); return l ? `${l.title} (${l.classIds.map(c => labels.classes.find(x => x.id === c)?.name ?? labels.names[c] ?? c).join(', ')})` : id; };
  const links: NonNullable<SchemaProblem['links']> = [];
  for (const g of grupper) {
    const ids = [...g.lessons], hinder: string[] = [];
    const langder = new Set(ids.map(id => lesson.get(id)?.duration_min)), perioder = new Set(ids.map(id => JSON.stringify([...(lesson.get(id)?.periods ?? [])].sort())));
    if (perioder.size > 1) hinder.push('Passen går olika terminer och kan inte ligga samtidigt.');
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const a = lesson.get(ids[i]), b = lesson.get(ids[j]);
      if (!a || !b) continue;
      for (const t of a.teachers.filter(t => b.teachers.includes(t))) hinder.push(`${larare.get(t) ?? 'En lärare'} undervisar både ${passNamn(ids[i])} och ${passNamn(ids[j])}.`);
      const ka = new Set(a.groups.flatMap(x => kluster.get(x) ?? [])), gemensamma = b.groups.flatMap(x => kluster.get(x) ?? []).filter(c => ka.has(c));
      if (gemensamma.length) hinder.push(`Samma elever går i ${passNamn(ids[i])} och ${passNamn(ids[j])}${labels.names[gemensamma[0]] ? ` (${labels.names[gemensamma[0]]})` : ''}.`);
    }
    const namn = g.block.map(x => x.b.id), unika = [...new Set(hinder)];
    for (const x of g.block) status.push({ id: x.b.id, namn: x.b.namn, status: unika.length ? 'hinder' : 'aktivt', lessons: x.lessons, grupp: namn.filter(id => id !== x.b.id),
      text: unika.length ? `${unika.join(' ')} Blocket ger ingen rätt till dubbelbokning och används inte förrän hindret är löst.`
        : `${x.lessons.length} pass börjar samtidigt.${langder.size > 1 ? ` Passen har olika längd (${[...langder].sort((a, b) => a! - b!).join(', ')} min) och slutar olika.` : ''}${g.block.length > 1 ? ` Blocket delar pass med ${g.block.filter(y => y !== x).map(y => y.b.namn).join(', ')} och läggs som en samtidighetsgrupp.` : ''}` });
    if (!unika.length) links.push({ kind: 'simultaneous', lessons: ids });
  }
  const ordning = new Map((block ?? []).map((b, i) => [b.id, i]));
  status.sort((a, b) => ordning.get(a.id)! - ordning.get(b.id)!);
  return { links, status };
}
