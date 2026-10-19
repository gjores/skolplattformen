// Hämtar centralt innehåll för exakt de ämnesversioner som programplanskatalogen
// refererar till (Gy25-ämnen, GRADE_SUBJECT_SYLLABUS) och skriver en fil per
// ämnesversion till lib/syllabus-central/ samt ett index med katalog-ID.
//
//   node scripts/fetch-syllabus-central.mjs [--cache <katalog>]
//
// --cache sparar och återanvänder råsvaren, så att en avbruten hämtning kan
// fortsätta och tolkningen kan köras om utan nätverk.

import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { centralCatalogId, centralSubjectFromApi } from '../lib/syllabus-central.ts';

const BASE = 'https://api.skolverket.se/syllabus/v1';
const catalogFile = new URL('../lib/programplan-catalog.generated.json', import.meta.url);
const outDir = new URL('../lib/syllabus-central/', import.meta.url);
const indexFile = new URL('../lib/syllabus-central.index.json', import.meta.url);

async function fetchVersion(code, version, cache) {
  const cached = cache && `${cache}/${code}-${version}.json`;
  if (cached) try { return JSON.parse(await readFile(cached, 'utf8')); } catch { /* hämta */ }
  for (let attempt = 1; ; attempt++) {
    try {
      // Skolverkets nätfilter bryter sökvägar som liknar /proc/ (ämnet PROC). Då läses
      // aktuell version i stället, och svaret godtas bara om versionen är exakt rätt.
      const path = attempt > 2 ? `subjects/${code}` : `subjects/${code}/versions/${version}`;
      const response = await fetch(`${BASE}/${path}`, { headers: { Accept: 'application/json' } });
      if (!response.ok) throw new Error(`${code} v${version} svarade ${response.status}`);
      const text = await response.text();
      const reply = JSON.parse(text);
      if (reply.subject?.version !== version) throw new Error(`${code}: version ${version} saknas i svaret`);
      if (cached) await writeFile(cached, text);
      return reply;
    } catch (error) {
      if (attempt >= 5) throw error;
      await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
    }
  }
}

const args = process.argv.slice(2);
const cache = args[0] === '--cache' ? args[1] : null;
if (args.length && !cache) { process.stderr.write('usage: node scripts/fetch-syllabus-central.mjs [--cache <katalog>]\n'); process.exit(1); }
if (cache) await mkdir(cache, { recursive: true });

const catalog = JSON.parse(await readFile(catalogFile, 'utf8'));
const pairs = catalog.subjects.filter(s => s.typeOfSyllabus === 'GRADE_SUBJECT_SYLLABUS' && s.schoolTypes.includes('GY'))
  .map(s => [s.code, s.version]).sort(([a, x], [b, y]) => a < b ? -1 : a > b ? 1 : x - y);

const subjects = [], versions = new Set();
let next = 0;
async function worker() {
  while (next < pairs.length) {
    const [code, version] = pairs[next++];
    const reply = await fetchVersion(code, version, cache);
    if (reply.subject?.code !== code || reply.subject?.version !== version) throw new Error(`${code} v${version}: fel ämnesversion i svaret`);
    versions.add(reply.apiVersion);
    subjects.push(await centralSubjectFromApi(reply.subject));
  }
}
await Promise.all([1, 2, 3, 4].map(worker));
if (versions.size !== 1) throw new Error(`blandade API-versioner: ${[...versions].join(', ')}`);

const source = { url: BASE, apiVersion: [...versions][0], fetched: new Date().toISOString().slice(0, 10) };
const catalogId = await centralCatalogId(source, subjects);
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
for (const s of subjects) await writeFile(new URL(`${s.code}-${s.version}.json`, outDir), `${JSON.stringify(s)}\n`);
await writeFile(indexFile, `${JSON.stringify({ schemaVersion: 1, source, catalogId, subjects: pairs }, null, 1)}\n`);

const levels = subjects.flatMap(s => s.levels), items = levels.flatMap(l => l.sections.flatMap(x => x.items));
process.stdout.write(`${JSON.stringify({ catalogId, subjects: subjects.length, levels: levels.length, items: items.length,
  levelsWithoutItems: levels.filter(l => !l.sections.length).map(l => l.code), files: (await readdir(outDir)).length })}\n`);
