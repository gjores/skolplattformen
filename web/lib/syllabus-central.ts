// Centralt innehåll per ämnesnivå ur Skolverkets Syllabus-API (CC0).
// Katalogen genereras av scripts/fetch-syllabus-central.mjs och versioneras i
// projektet. Den är referensdata: punkternas text och nyckel binds till exakt
// ämneskod, ämnesversion och nivåkod, så att ett sparat val går att återfinna.

export type CentralItem = { key: string; text: string };
export type CentralSection = { heading: string | null; items: CentralItem[] };
export type CentralLevel = { code: string; name: string; sections: CentralSection[] };
export type CentralSubject = { code: string; version: number; name: string; levels: CentralLevel[] };
export type CentralSource = { url: string; apiVersion: string; fetched: string };
export type CentralCatalogIndex = { schemaVersion: 1; source: CentralSource; catalogId: string; subjects: [string, number][] };

export class CentralContentError extends Error {
  readonly code: string;
  constructor(code: string) { super(code); this.code = code; }
}
const fail = (code: string): never => { throw new CentralContentError(code); };

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', ndash: '–', mdash: '—', shy: '' };
function plain(html: string): string {
  const text = html.replace(/<[^>]*>/g, '').replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (_, e: string) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : ENTITIES[e.toLowerCase()] ?? fail('unknown_entity'));
  return text.replace(/\s+/g, ' ').trim();
}
const INTRO = /^Undervisningen\b.*\bcentrala innehåll:?$/u;

/**
 * Tolkar Skolverkets HTML till rubriker och punkter. All synlig text måste
 * hamna i en rubrik, en punkt eller den inledande meningen; annars avbryts
 * tolkningen så att inget innehåll tyst försvinner.
 */
export function parseCentralContentHtml(html: string): CentralSection[] {
  const sections: CentralSection[] = [];
  const block = /<(p|h[1-6])\b[^>]*>([\s\S]*?)<\/\1>|<ul\b[^>]*>([\s\S]*?)<\/ul>/g;
  for (const m of html.matchAll(block)) {
    if (m[3] !== undefined) {
      const items = [...m[3].matchAll(/<li\b[^>]*>([\s\S]*?)<\/li>/g)].map(li => plain(li[1])).filter(Boolean);
      if (/<ul\b/.test(m[3])) fail('nested_list');
      if (!sections.length || sections.at(-1)!.items.length) sections.push({ heading: null, items: [] });
      sections.at(-1)!.items.push(...items.map(text => ({ key: '', text })));
      continue;
    }
    const text = plain(m[2]);
    if (!text || INTRO.test(text)) continue;
    sections.push({ heading: text, items: [] });
  }
  if (plain(html.replace(block, ' ')) !== '') fail('unparsed_text');
  return sections.filter(s => s.items.length > 0 || s.heading !== null);
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stabil punktnyckel: bunden till ämne, version, nivå, rubrik och normaliserad
 * text. Skolverket upprepar ibland samma punkt; förekomsten skiljer då exakta
 * dubbletter under samma rubrik åt.
 */
export async function centralItemKey(subject: string, version: number, level: string, heading: string | null, text: string, occurrence = 0): Promise<string> {
  return (await sha256Hex(JSON.stringify([subject, version, level, heading?.normalize('NFC') ?? null, text.normalize('NFC'), occurrence]))).slice(0, 32);
}

/** Bygger en ämnesversion ur API-svaret och sätter nycklar. Tomma rubriker utan punkter behålls inte. */
export async function centralSubjectFromApi(subject: { code: string; version: number; name: string;
  courses?: { code: string; name: string; centralContent?: { text?: string } }[] }): Promise<CentralSubject> {
  const levels: CentralLevel[] = [];
  for (const course of subject.courses ?? []) {
    const sections = parseCentralContentHtml(course.centralContent?.text ?? '');
    const seen = new Set<string>(), occurrences = new Map<string, number>();
    for (const section of sections) for (const item of section.items) {
      const same = JSON.stringify([section.heading, item.text]), occurrence = occurrences.get(same) ?? 0;
      occurrences.set(same, occurrence + 1);
      item.key = await centralItemKey(subject.code, subject.version, course.code, section.heading, item.text, occurrence);
      if (seen.has(item.key)) fail('duplicate_item');
      seen.add(item.key);
    }
    levels.push({ code: course.code, name: course.name, sections: sections.filter(s => s.items.length > 0) });
  }
  if (new Set(levels.map(l => l.code)).size !== levels.length) fail('duplicate_level');
  return { code: subject.code, version: subject.version, name: subject.name, levels };
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number' && Number.isSafeInteger(value)) return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)
    .map(([key, v]) => `${JSON.stringify(key)}:${canonicalJson(v)}`).join(',')}}`;
  return fail('invalid_value');
}

/** Katalog-ID över källa och alla ämnesversioner i kodordning. */
export async function centralCatalogId(source: CentralSource, subjects: CentralSubject[]): Promise<string> {
  const ordered = [...subjects].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.version - b.version);
  return `sha256:${await sha256Hex(canonicalJson({ schemaVersion: 1, source, subjects: ordered }))}`;
}

/** Ämneskod, version och nivå ur en fast radnyckel `part:SUBJECT:VERSION:LEVEL`. */
export function syllabusRefFromRowKey(rowKey: string): { subject: string; version: number; level: string } | null {
  const m = /^(?:foundation|programmeSpecific|orientation|specialization):([A-Z0-9]+):([1-9]\d{0,3}):([A-Z0-9]+)$/.exec(rowKey);
  return m ? { subject: m[1], version: Number(m[2]), level: m[3] } : null;
}
