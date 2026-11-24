import type { NationellProvbokning } from './nationella-prov.ts';
import { schemaDatumNyckel, schemaDatumTermTillaten, type SchemaDatumAndring } from './schema-datum.ts';
import { schemaDatumUnderlag, type SchemaDatumDagUnderlag } from './schema-datum-underlag.ts';
import { provHarGemensammaElever, provKrockarMedPass } from './schema-prov-krock.ts';
import type { SchemaProvdagPass, SchemaProvdagProjection } from './schema-provdagar.ts';
import type { SchemaProvBerakningIndata } from './schema-provberakning.ts';
import { schemaDagStatus, schemaWeekday } from './schema-vecka.ts';

type Kalla = Pick<SchemaProvBerakningIndata, 'plan' | 'underlag' | 'forslag' | 'datedBasis' | 'datedOverrides' | 'bokningar' | 'salar'>;
const eleverFor = (dag: SchemaDatumDagUnderlag, ref: string) => dag.pupilsByGroup.get(dag.groupIdsByRef.get(ref) ?? '') ?? new Set<string>();

/** Samma datumgiltiga elever och resurser som vid motorberäkning. Bara tillfälles- och gruppnycklar lämnar servern. */
export function schemaProvdagProjektion({ plan, underlag, forslag, datedBasis, datedOverrides, bokningar, salar }: Kalla,
  dates: string[]): SchemaProvdagProjection {
  const onska = new Set(dates), calendar = new Map(forslag.time.calendar?.days.map(d => [d.date, d]));
  const perDag = new Map<string, NationellProvbokning[]>();
  for (const bokning of bokningar) {
    const day = calendar.get(bokning.datum);
    if (!day || !schemaDatumTermTillaten(forslag.period, day.term) || !day.schoolDay || schemaWeekday(day.date) > 4
        || bokning.mal.slag === 'klass' && !schemaDagStatus(day, bokning.mal.ref).schoolDay) continue;
    perDag.set(day.date, [...perDag.get(day.date) ?? [], bokning]);
  }
  const salId = new Map(salar.map(sal => [sal.id, underlag.labels.rooms.find(r =>
    underlag.villkor.salregister?.kalla === 'skola' ? r.id === sal.id : r.name === sal.name)?.id ?? null]));
  const deltagare: SchemaProvdagProjection['deltagare'] = [];
  const relevantaFlyttar = datedOverrides.filter(a => (onska.has(a.originalDate) || onska.has(a.date)) && perDag.has(a.originalDate));
  const flyttnycklar = new Set(relevantaFlyttar.map(schemaDatumNyckel));
  const matcha = (overrides: SchemaDatumAndring[], dagar: Set<string>, visaDeltagare = false) => {
    const krockar = new Map<string, SchemaProvdagPass>(), elevgrupper = new Map<string, ReadonlySet<string>>();
    if (!dagar.size) return { krockar, elevgrupper };
    const datum = schemaDatumUnderlag(plan, underlag, forslag, datedBasis, overrides, [...dagar], true, 'valdaDatum');
    for (const dag of datum.days) {
      const prov = (perDag.get(dag.date) ?? []).map(b => ({ ...b, elever: eleverFor(dag, b.mal.ref), salId: b.salId === null ? null : salId.get(b.salId) ?? null }))
        .filter(p => p.elever.size > 0);
      if (visaDeltagare && onska.has(dag.date)) for (const provdag of prov) {
        deltagare.push({ provId: provdag.id, refs: [...dag.groupIdsByRef.keys()].filter(ref => provHarGemensammaElever(eleverFor(dag, ref), provdag.elever)) });
      }
      for (const pass of dag.problem.lessons) {
        const o = dag.occurrences.get(pass.id);
        if (!o || o.lesson.egenAktivitet || o.lesson.startMin === null) continue;
        const elever = new Set(pass.groups.flatMap(id => [...dag.pupilsByGroup.get(id) ?? []]));
        const data = { startMin: o.lesson.startMin, slutMin: o.lesson.startMin + o.length, elever, salId: o.lesson.roomId,
          lararRefs: pass.teachers.map(id => underlag.teacherRefs[id]) };
        if (flyttnycklar.has(o.key)) elevgrupper.set(o.key, elever);
        if (prov.some(p => provKrockarMedPass(data, p))) krockar.set(o.key, { lesson: o.lesson.id, originalDate: o.originalDate, date: o.date });
      }
    }
    return { krockar, elevgrupper };
  };
  const aktuellaDagar = new Set([...dates.filter(date => perDag.has(date)), ...relevantaFlyttar.map(a => a.date)]);
  const aktuella = matcha(datedOverrides, aktuellaDagar, true);
  const ursprung = matcha([], new Set(relevantaFlyttar.map(a => a.originalDate)));
  const ersatta = relevantaFlyttar.filter(a => {
    const key = schemaDatumNyckel(a), gamlaElever = ursprung.elevgrupper.get(key), nyaElever = aktuella.elevgrupper.get(key);
    return ursprung.krockar.has(key) && !aktuella.krockar.has(key) && gamlaElever && gamlaElever.size > 0 && gamlaElever.size === nyaElever?.size
      && [...gamlaElever].every(elev => nyaElever.has(elev));
  }).map(({ lesson, originalDate, date }) => ({ lesson, originalDate, date }));
  return { installda: [...aktuella.krockar.values()].filter(a => onska.has(a.date)), ersatta, deltagare };
}
