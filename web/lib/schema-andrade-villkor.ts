import { schemaGrund, type SchemaVillkor } from './schema-contract.ts';

/** Begripliga namn på de grundinställningar som kräver en ny uppdelning av passen. */
export function andradeGrundvillkor(fore: SchemaVillkor, efter: SchemaVillkor): string[] {
  const a = schemaGrund(fore), b = schemaGrund(efter), namn = {
    minLessonMin: 'kortaste lektion', maxLessonMin: 'längsta lektion', salar: 'salar',
    egna: 'passlängd eller antal i resursvillkoren', aktiviteter: 'aktiviteter', block: 'samtidighetsblock', fordelning: 'antal lektioner per undervisning',
    timeBasis: 'gemensamt läsårsmönster och årsberäknad undervisningstid',
  };
  return (Object.keys(namn) as (keyof typeof namn)[]).filter(k => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map(k => namn[k]);
}
