import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { syllabusSnapshot } from '../lib/syllabus-snapshot.ts';
import { canonicalCatalogJson, projectProgramplanCatalog } from '../lib/programplan-catalog.ts';

const defaultOutput = new URL('../lib/programplan-catalog.generated.json', import.meta.url);

/** Offline projection: the source snapshot is never modified or refreshed. */
export function createCatalogArtifact(snapshot) {
  const payload = projectProgramplanCatalog(snapshot);
  const digest = createHash('sha256').update(canonicalCatalogJson(payload), 'utf8').digest('hex');
  return { ...payload, catalogId: `sha256:${digest}` };
}

export function serializeCatalogArtifact(artifact) {
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

/** --check compares exact bytes and never writes, including on failure. */
export async function runCatalogGenerator({ check = false, outputFile = defaultOutput, snapshot = syllabusSnapshot } = {}) {
  const artifact = createCatalogArtifact(snapshot);
  const expected = serializeCatalogArtifact(artifact);
  if (check) {
    let actual;
    try { actual = await readFile(outputFile, 'utf8'); }
    catch (error) {
      if (error?.code === 'ENOENT') throw new Error('catalog_artifact_missing');
      throw error;
    }
    if (actual !== expected) throw new Error('catalog_artifact_out_of_date');
  } else {
    await writeFile(outputFile, expected, 'utf8');
  }
  return {
    status: check ? 'checked' : 'generated', catalogId: artifact.catalogId,
    subjects: artifact.subjects.length,
    items: artifact.subjects.reduce((count, subject) => count + subject.items.length, 0),
    programs: artifact.programs.length,
  };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  if (args.length > 1 || (args.length === 1 && args[0] !== '--check')) {
    process.stderr.write('usage: node scripts/build-programplan-catalog.mjs [--check]\n');
    process.exitCode = 1;
  } else {
    try {
      const result = await runCatalogGenerator({ check: args[0] === '--check' });
      process.stdout.write(`${JSON.stringify(result)}\n`);
    } catch (error) {
      // Paths, source values and private environment data are never logged.
      const safeCode = error?.code ?? error?.message;
      process.stderr.write(`${['invalid_catalog', 'duplicate_catalog_code', 'catalog_reference_missing', 'catalog_reference_mismatch',
        'catalog_artifact_missing', 'catalog_artifact_out_of_date'].includes(safeCode) ? safeCode : 'catalog_generation_failed'}\n`);
      process.exitCode = 1;
    }
  }
}
