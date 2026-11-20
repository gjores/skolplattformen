import type { NationellaProvRegister, NationellProvbokning } from '../nationella-prov.ts';
import type { SchemaDatedDay, SchemaKontrollRequest, SchemaPeriod } from '../schema-contract.ts';
import { SchemaDatumError, schemaDatumTermTillaten } from '../schema-datum.ts';
import { schemaProvBerakning, type SchemaProvBerakningIndata, type SchemaProvBerakningResultat } from '../schema-provberakning.ts';
import { schemaDatumGrund, valideraSchemaDatum } from './schema-datum.ts';
import type { readDraftBasis } from './schema-draft.ts';
import { validateSchema } from './schemamotor.ts';

type Planeringsval = { validate?: SchemaProvBerakningIndata['validate']; tidigasteErsattning?: string };
type Provplanering = { result: SchemaProvBerakningResultat; bokningar: NationellProvbokning[]; dateIssues: number };
const idag = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Stockholm' }).format(new Date());

/** Ett okänt datum behålls så att beräkningen kan visa hindret. */
export function provForPeriod(bokningar: readonly NationellProvbokning[], dates: readonly Pick<SchemaDatedDay, 'date' | 'term'>[] | undefined,
  period: SchemaPeriod): NationellProvbokning[] {
  const terminer = new Map(dates?.map(dag => [dag.date, dag.term]));
  return bokningar.filter(bokning => {
    const termin = terminer.get(bokning.datum);
    return termin == null || schemaDatumTermTillaten(period, termin);
  });
}

function provresultatKomplett(resultat: SchemaProvBerakningResultat): boolean {
  return resultat.bokningar.length > 0 && resultat.bokningar.every(bokning => bokning.sal !== null && bokning.vakter.length > 0 && bokning.problem.length === 0)
    && resultat.bortfall.every(rad => rad.kvarMin === 0);
}

export function nyttSchemaProvKomplett({ result, dateIssues }: Pick<Provplanering, 'result' | 'dateIssues'>): boolean {
  return dateIssues === 0 && provresultatKomplett(result);
}

/** Bygger och kontrollerar ett daterat provschema för det nya veckomönstret. Skrivningen görs av anroparen. */
export async function planeraNyttSchemaProv(source: Awaited<ReturnType<typeof readDraftBasis>>, input: SchemaKontrollRequest, register: NationellaProvRegister,
  { validate = validateSchema, tidigasteErsattning = idag() }: Planeringsval = {}): Promise<Provplanering> {
  if (source.plan.unitId !== input.unitId || source.plan.schoolYear !== input.schoolYear
    || source.datedBasis.unitId !== input.unitId || source.datedBasis.schoolYear !== input.schoolYear) {
    throw new SchemaDatumError('schema_datum_participants_unavailable');
  }
  const { bokningar } = register.document;
  const { underlag, forslag } = schemaDatumGrund(source, input);
  const kalender = forslag.time.calendar;
  if (!forslag.time.current || !kalender) throw new SchemaDatumError('schema_datum_calendar_missing');
  const valdaProv = provForPeriod(bokningar, kalender.days, input.period);
  const berakning: SchemaProvBerakningIndata = { plan: source.plan, underlag, forslag, datedBasis: source.datedBasis, datedOverrides: [],
    bokningar: valdaProv, salar: source.basis.skolsalar?.salar ?? [], vakter: source.schoolDuties,
    lastaPass: input.locks?.placements.map(placering => placering.lesson), tidigasteErsattning, validate };
  const result = await schemaProvBerakning(berakning);
  if (!provresultatKomplett(result)) return { result, bokningar, dateIssues: 0 };

  const resursval = new Map(result.bokningar.map(prov => [prov.id, prov]));
  const medResurser = bokningar.map(bokning => {
    const val = resursval.get(bokning.id);
    return val ? { ...bokning, salId: val.sal!.id, vakter: val.vakter.map(vakt => vakt.ref) } : bokning;
  });
  const provkontroll = await schemaProvBerakning({ ...berakning, bokningar: provForPeriod(medResurser, kalender.days, input.period),
    datedOverrides: result.ersattningar, tidigasteErsattning: `${input.schoolYear + 1}-07-01` });
  const datumkontroll = await valideraSchemaDatum(source, underlag, forslag, result.ersattningar, valdaProv.map(prov => prov.datum), validate);
  const dateIssues = provkontroll.bortfall.length + provkontroll.bokningar.reduce((sum, prov) => sum + prov.problem.length, 0) + datumkontroll.total;
  return { result, bokningar: dateIssues === 0 ? medResurser : bokningar, dateIssues };
}
