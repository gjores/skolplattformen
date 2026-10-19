import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { centralCatalogId } from '../lib/syllabus-central.ts';

const indexFile = new URL('../lib/syllabus-central.index.json', import.meta.url);
const subjectDir = new URL('../lib/syllabus-central/', import.meta.url);
// Tabellerna skapas i APL-CENTRAL-CONTENT våg 2. Där läggs denna seed in i en migration
// med senare tidsstämpel än tabellerna; filen här är inte själv en migration.
const defaultOutput = new URL('../../supabase/generated/syllabus_central_content_seed.sql', import.meta.url);
const CHUNK = 500;

const literal = value => value === null ? 'null' : typeof value === 'number' ? String(value)
  : `'${String(value).replace(/\0/g, () => { throw new Error('central_sql_nul'); }).replace(/'/g, "''")}'`;

/** Genererar offentlig referensdata utan databasanslutning. Katalog-ID kontrolleras mot filerna. */
export async function createSyllabusCentralSql(index, subjects) {
  if (await centralCatalogId(index.source, subjects) !== index.catalogId) throw new Error('central_catalog_integrity_failed');
  const ordered = [...subjects].sort((a, b) => a.code < b.code ? -1 : a.code > b.code ? 1 : a.version - b.version);
  const rows = ordered.flatMap(s => s.levels.flatMap(l => l.sections.flatMap((section, sectionOrdinal) => section.items.map((item, itemOrdinal) =>
    [index.catalogId, s.code, s.version, l.code, sectionOrdinal, section.heading, itemOrdinal, item.key, item.text]))));
  const levels = ordered.reduce((n, s) => n + s.levels.length, 0);
  const out = [
    '-- Generated offline from web/lib/syllabus-central/; do not edit.',
    '-- Regenerate: node web/scripts/build-syllabus-central-sql.mjs',
    `-- Catalog: ${index.catalogId}; Skolverket Syllabus API ${index.source.apiVersion}, fetched ${index.source.fetched}. CC0 reference data.`,
    'insert into public.syllabus_central_catalogs(catalog_id,source_url,api_version,fetched_on,subject_count,level_count,item_count)',
    `values (${[index.catalogId, index.source.url, index.source.apiVersion, index.source.fetched, ordered.length, levels, rows.length].map(literal).join(',')});`,
  ];
  for (let i = 0; i < rows.length; i += CHUNK) {
    out.push('insert into public.syllabus_central_items(catalog_id,subject_code,subject_version,level_code,section_ordinal,heading,item_ordinal,item_key,text) values');
    out.push(rows.slice(i, i + CHUNK).map(r => `(${r.map(literal).join(',')})`).join(',\n') + ';');
  }
  return `${out.join('\n')}\n`;
}

export async function runSyllabusCentralSql({ check = false, outputFile = defaultOutput } = {}) {
  const index = JSON.parse(await readFile(indexFile, 'utf8'));
  const subjects = await Promise.all((await readdir(subjectDir)).filter(f => f.endsWith('.json'))
    .map(async f => JSON.parse(await readFile(new URL(f, subjectDir), 'utf8'))));
  const expected = await createSyllabusCentralSql(index, subjects);
  if (check) {
    let actual;
    try { actual = await readFile(outputFile, 'utf8'); }
    catch (error) { if (error?.code === 'ENOENT') throw new Error('central_sql_missing'); throw error; }
    if (actual !== expected) throw new Error('central_sql_out_of_date');
  } else {
    await mkdir(dirname(fileURLToPath(outputFile)), { recursive: true });
    await writeFile(outputFile, expected, 'utf8');
  }
  return { status: check ? 'checked' : 'generated', catalogId: index.catalogId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    process.stderr.write('usage: node scripts/build-syllabus-central-sql.mjs [--check]\n');
    process.exitCode = 1;
  } else {
    try { process.stdout.write(`${JSON.stringify(await runSyllabusCentralSql({ check: args[0] === '--check' }))}\n`); }
    catch (error) { process.stderr.write(`${error?.message ?? 'central_sql_generation_failed'}\n`); process.exitCode = 1; }
  }
}
