import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { canonicalCatalogJson, verifyProgramplanCatalog } from '../lib/programplan-catalog.ts';

const artifactFile = new URL('../lib/programplan-catalog.generated.json', import.meta.url);
const defaultOutput = new URL('../../supabase/migrations/20260930161000_phase5_programplan_catalog_seed.sql', import.meta.url);
const delimiter = '$programplan_catalog_payload$';

/** Generates public reference data only, without any database connection. */
export async function createProgramplanCatalogSql(artifact) {
  const { catalogId, ...payload } = await verifyProgramplanCatalog(artifact);
  const canonical = canonicalCatalogJson(payload);
  if (canonical.includes(delimiter)) throw new Error('catalog_sql_delimiter_collision');
  return [
    '-- Generated offline from web/lib/programplan-catalog.generated.json; do not edit.',
    '-- Regenerate: node web/scripts/build-programplan-catalog-sql.mjs',
    `-- Catalog: ${catalogId}; snapshot fetched ${payload.source.fetched}.`,
    '-- INSERT is validated by the closed catalog schema/hash trigger; no overwrite or grants.',
    'insert into public.programplan_catalogs(catalog_id,payload)',
    `values ('${catalogId}',${delimiter}${canonical}${delimiter}::jsonb);`,
    '',
  ].join('\n');
}

export async function runCatalogSqlGenerator({ check = false, outputFile = defaultOutput, artifact } = {}) {
  const input = artifact ?? JSON.parse(await readFile(artifactFile, 'utf8'));
  const expected = await createProgramplanCatalogSql(input);
  if (check) {
    let actual;
    try { actual = await readFile(outputFile, 'utf8'); }
    catch (error) {
      if (error?.code === 'ENOENT') throw new Error('catalog_sql_missing');
      throw error;
    }
    if (actual !== expected) throw new Error('catalog_sql_out_of_date');
  } else {
    await writeFile(outputFile, expected, 'utf8');
  }
  return { status: check ? 'checked' : 'generated', catalogId: input.catalogId };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    process.stderr.write('usage: node scripts/build-programplan-catalog-sql.mjs [--check]\n');
    process.exitCode = 1;
  } else {
    try {
      process.stdout.write(`${JSON.stringify(await runCatalogSqlGenerator({ check: args[0] === '--check' }))}\n`);
    } catch (error) {
      const code = error?.code ?? error?.message;
      process.stderr.write(`${['invalid_catalog', 'catalog_integrity_failed', 'duplicate_catalog_code', 'catalog_reference_missing',
        'catalog_reference_mismatch', 'catalog_sql_delimiter_collision', 'catalog_sql_missing', 'catalog_sql_out_of_date'].includes(code)
        ? code : 'catalog_sql_generation_failed'}\n`);
      process.exitCode = 1;
    }
  }
}
