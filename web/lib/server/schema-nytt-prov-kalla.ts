import { schemaDraftHash, type SchemaDraft } from '../schema-draft-contract.ts';
import type { SchemaVillkor } from '../schema-contract.ts';
import type { NationellaProvRegister } from '../nationella-prov.ts';
import { schemaDraftSourceHash, type readDraftBasis } from './schema-draft.ts';

/** Fångar även salregister och provvakternas giltighet, som kan ändras oberoende av utkastets underlag. */
export async function schemaNyttProvKallHash(source: Awaited<ReturnType<typeof readDraftBasis>>, draft: SchemaDraft | null,
  register: NationellaProvRegister, villkor: SchemaVillkor) {
  return schemaDraftHash({
    draft: draft ? { id: draft.id, revision: draft.revision, content: draft.contentHash, source: draft.sourceHash, name: draft.name } : null,
    source: await schemaDraftSourceHash(source, [villkor]),
    rooms: source.basis.skolsalar ?? null,
    schoolDuties: [...source.schoolDuties].sort((a, b) => a.ref.localeCompare(b.ref) || a.startsOn.localeCompare(b.startsOn) || (a.endsOn ?? '').localeCompare(b.endsOn ?? '')),
    register,
  });
}
