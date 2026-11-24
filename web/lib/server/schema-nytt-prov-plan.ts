import { provRensaMotorval, type NationellaProvRegister, type NationellProvbokning } from '../nationella-prov.ts';
import type { SchemaDatedDay, SchemaKontrollRequest, SchemaPeriod } from '../schema-contract.ts';
import { parseSchemaDatumAndringar, SchemaDatumError, schemaDatumTermTillaten, type SchemaDatumAndring } from '../schema-datum.ts';
import { schemaDateradAktivitetsdefinition, type SchemaAktivitetsForslag } from '../schema-daterad-aktivitet.ts';
import { schemaDraftHash, type SchemaDraft } from '../schema-draft-contract.ts';
import type { SchemaNyttProvBokningshinder, SchemaNyttProvProblem } from '../schema-nytt-prov.ts';
import { schemaOmrakning } from '../schema-omrakning.ts';
import { schemaProvBerakning, type SchemaLastVaktHinder, type SchemaProvBerakningIndata, type SchemaProvBerakningResultat } from '../schema-provberakning.ts';
import { schemaProvdagProjektion } from '../schema-provdag-projektion.ts';
import { schemaProvResultHash } from '../schema-provforslag.ts';
import { schemaDatumGrund, valideraSchemaDatum } from './schema-datum.ts';
import { kontrolleraAktivitetensProv, planeraDateradAktivitet } from './schema-daterad-aktivitet.ts';
import type { readDraftBasis } from './schema-draft.ts';
import { validateSchema } from './schemamotor.ts';

type TidigareUtkast = Pick<SchemaDraft, 'id' | 'base' | 'datedOverrides' | 'datedActivities' | 'datedActivityDefinitions'>;
type Planeringsval = { validate?: SchemaProvBerakningIndata['validate']; tidigasteErsattning?: string; draft?: TidigareUtkast | null };
type Provplanering = { result: SchemaProvBerakningResultat; bokningar: NationellProvbokning[]; dateIssues: number;
  bokningarMedHinder: SchemaNyttProvBokningshinder[]; datedOverrides: SchemaDatumAndring[]; bevaradeDatum: SchemaDatumAndring[];
  dateradAktivitet?: SchemaAktivitetsForslag };
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

export async function nyttSchemaProvResultHash(plan: Provplanering) {
  const prov = await schemaProvResultHash(plan.result);
  return schemaDraftHash({ prov, datedOverrides: plan.datedOverrides, aktivitet: plan.dateradAktivitet ?? null });
}

/** Motorval för andra utkast och för andra terminer ska finnas kvar som de är. */
export function provUtanEgnaMotorval(register: NationellaProvRegister, draftId: string | null,
  dates: readonly Pick<SchemaDatedDay, 'date' | 'term'>[] | undefined, period: SchemaPeriod): NationellProvbokning[] {
  if (!draftId) return register.document.bokningar;
  const urval = new Set(provForPeriod(register.document.bokningar, dates, period).map(b => b.id));
  const rena = provRensaMotorval(register.document, draftId).bokningar;
  return register.document.bokningar.map((b, index) => urval.has(b.id) ? rena[index] : b);
}

async function raknaMedBokningshinder(indata: SchemaProvBerakningIndata) {
  const vakthinder = new Map<string, SchemaLastVaktHinder[]>();
  const result = await schemaProvBerakning({ ...indata,
    onLastVaktHinder: (id, hinder) => vakthinder.set(id, [...(vakthinder.get(id) ?? []), hinder]) });
  const bokningarMedHinder = result.bokningar.flatMap(({ id, namn, datum, deltagarnamn, problem }) => {
    if (!problem.length) return [];
    const specificerade = problem.flatMap<SchemaNyttProvProblem>(kod => kod === 'last_vakt_upptagen' ? vakthinder.get(id) ?? [kod] : [kod]);
    return [{ id, namn, datum, deltagarnamn, problem: specificerade }];
  });
  return { result, bokningarMedHinder };
}

/** Bygger och kontrollerar ett daterat provschema för det nya veckomönstret. Skrivningen görs av anroparen. */
export async function planeraNyttSchemaProv(source: Awaited<ReturnType<typeof readDraftBasis>>, input: SchemaKontrollRequest, register: NationellaProvRegister,
  { validate = validateSchema, tidigasteErsattning = idag(), draft }: Planeringsval = {}): Promise<Provplanering> {
  if (source.plan.unitId !== input.unitId || source.plan.schoolYear !== input.schoolYear
    || source.datedBasis.unitId !== input.unitId || source.datedBasis.schoolYear !== input.schoolYear) {
    throw new SchemaDatumError('schema_datum_participants_unavailable');
  }
  const { bokningar } = register.document;
  const { underlag, forslag } = schemaDatumGrund(source, input);
  const kalender = forslag.time.calendar;
  if (!forslag.time.current || !kalender) throw new SchemaDatumError('schema_datum_calendar_missing');
  const tilldelningsgrund = provUtanEgnaMotorval(register, draft?.id ?? null, kalender.days, input.period);
  const valdaProv = provForPeriod(tilldelningsgrund, kalender.days, input.period);
  const bevaradeDatum = draft?.base && draft.datedOverrides.length
    ? schemaOmrakning(draft.base, forslag, draft.datedOverrides).datedOverrides : [];
  const berakning: SchemaProvBerakningIndata = { plan: source.plan, underlag, forslag, datedBasis: source.datedBasis, datedOverrides: bevaradeDatum,
    bokningar: valdaProv, salar: source.basis.skolsalar?.salar ?? [], vakter: source.schoolDuties,
    lastaPass: input.locks?.placements.map(placering => placering.lesson), tidigasteErsattning, validate };
  const { result, bokningarMedHinder } = await raknaMedBokningshinder(berakning);
  if (!provresultatKomplett(result)) return { result, bokningar, bokningarMedHinder, dateIssues: 0, datedOverrides: bevaradeDatum, bevaradeDatum };

  const datedOverrides = parseSchemaDatumAndringar([...bevaradeDatum, ...result.ersattningar]);
  const resursval = new Map(result.bokningar.map(prov => [prov.id, prov]));
  const medResurser = tilldelningsgrund.map(bokning => {
    const val = resursval.get(bokning.id);
    return val ? { ...bokning, salId: val.sal!.id, vakter: val.vakter.map(vakt => vakt.ref) } : bokning;
  });
  const dagar = valdaProv.map(prov => prov.datum);
  const slutligPlan = { ...berakning, bokningar: provForPeriod(medResurser, kalender.days, input.period), datedOverrides };
  const slutkontroll = await raknaMedBokningshinder({ ...slutligPlan, tidigasteErsattning: `${input.schoolYear + 1}-07-01` });
  const datumkontroll = await valideraSchemaDatum(source, underlag, forslag, datedOverrides, dagar, validate);
  // Det sparade resultatet ska också vara konfliktfritt enligt kalenderns visuella datumprojektion.
  const kvarvarande = schemaProvdagProjektion(slutligPlan, dagar).installda.length;
  const dateIssues = Math.max(slutkontroll.result.bortfall.length, kvarvarande)
    + slutkontroll.result.bokningar.reduce((sum, prov) => sum + prov.problem.length, 0) + datumkontroll.total;
  const definition = draft?.datedActivityDefinitions?.[0] ?? (draft?.datedActivities?.[0] && schemaDateradAktivitetsdefinition(draft.datedActivities[0]));
  const dateradAktivitet = definition && dateIssues === 0
    ? await planeraDateradAktivitet(source, underlag, forslag, datedOverrides, definition, input.locks?.placements ?? [], medResurser, validate)
    : undefined;
  if (dateradAktivitet && !dateradAktivitet.blockers.length) kontrolleraAktivitetensProv([dateradAktivitet.activity], medResurser, source.plan);
  return { result, bokningar: dateIssues === 0 ? medResurser : bokningar, bokningarMedHinder: slutkontroll.bokningarMedHinder, dateIssues, datedOverrides, bevaradeDatum,
    ...(dateradAktivitet && { dateradAktivitet }) };
}
