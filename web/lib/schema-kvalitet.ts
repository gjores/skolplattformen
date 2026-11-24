import type { SchemaKvalitetsrad, SchemaKvalitetsval, SchemaLektionsdagar, SchemaPlacement, SchemaProblem, SchemaTerm, SchemaTrim } from './schema-contract.ts';

export type SchemaElevresurs = Pick<SchemaKvalitetsval, 'slag' | 'ref'> & { kluster: string[] };
type Intervall = { pass: string; start: number; slut: number; upptagenFran: number; upptagenTill: number };
type Dag = Pick<SchemaKvalitetsrad, 'hal' | 'sluttid'> & { langd: number };
type Lektionsdag = { antal: number; pass?: string };
type Lektionsvecka = { totalt: number; dagar: Map<number, Lektionsdag> };

function matDag(pass: Intervall[], dag: number, { break_min: rast, lunch }: SchemaProblem['rules']): Dag {
  const iTid = [...pass].sort((a, b) => a.start - b.start);
  const sista = iTid.reduce((senast, p) => p.slut > senast.slut ? p : senast);
  const upptaget = [...pass].sort((a, b) => a.upptagenFran - b.upptagenFran);
  let fore = upptaget[0];
  const mellanrum: NonNullable<SchemaKvalitetsrad['hal']>[] = [];
  for (const efter of upptaget.slice(1)) {
    const fran = fore.upptagenTill, till = efter.upptagenFran;
    if (till - fran > rast) mellanrum.push({ dag, fran, till, min: till - fran - rast, pass: efter.pass });
    if (efter.upptagenTill > fore.upptagenTill) fore = efter;
  }
  mellanrum.sort((a, b) => b.min - a.min);
  // En eventuell lunch ryms i ett mellanrum. Använd det största lämpliga utrymmet, en gång per dag.
  if (lunch) {
    const lunchhal = mellanrum.find(h => Math.min(h.till, lunch.window_end_min) - Math.max(h.fran, lunch.window_start_min) >= lunch.length_min);
    if (lunchhal) lunchhal.min = Math.max(0, lunchhal.min - Math.max(0, lunch.length_min - rast));
  }
  const hal = mellanrum.reduce<SchemaKvalitetsrad['hal']>((max, h) => h.min > (max?.min ?? 0) ? h : max, null);
  return { hal, sluttid: { dag, min: sista.slut, pass: sista.pass }, langd: sista.slut - iTid[0].start };
}

function matLektionsdagar(kluster: string[], profiler: Map<string, Lektionsvecka>, storlek: Map<string, number>): SchemaLektionsdagar | undefined {
  const perDag = new Map<number, SchemaLektionsdagar['dagar'][number]>();
  let elever = 0, ensammaElevdagar = 0, understigerMalElevdagar = 0;
  for (const id of kluster) {
    const vecka = profiler.get(id), antalElever = storlek.get(id) ?? 0;
    if (!vecka?.totalt || !antalElever) continue;
    elever += antalElever;
    const mal = Math.min(2, Math.floor(vecka.totalt / vecka.dagar.size));
    for (const [dag, { antal, pass }] of vecka.dagar) {
      const rad = perDag.get(dag) ?? { dag, min: antal, max: antal, ensammaElever: 0 };
      rad.min = Math.min(rad.min, antal);
      rad.max = Math.max(rad.max, antal);
      if (antal < mal) understigerMalElevdagar += antalElever;
      if (antal === 1) {
        ensammaElevdagar += antalElever;
        rad.ensammaElever += antalElever;
        rad.pass ??= pass;
      }
      perDag.set(dag, rad);
    }
  }
  return elever ? { elever, dagar: [...perDag.values()].sort((a, b) => a.dag - b.dag), ensammaElevdagar, understigerMalElevdagar } : undefined;
}

/** Sammanställ extrema värden över de faktiska deltagandemönstren. Ett gruppbyte i en klass får egna intervall. */
export function schemaElevkvalitet(problem: SchemaProblem, terms: SchemaTerm[], resurser: SchemaElevresurs[], placements: Map<string, SchemaPlacement>, utelamnat: Set<string>, trims: SchemaTrim[] = []): SchemaKvalitetsrad[] {
  const kanda = new Set(resurser.flatMap(r => r.kluster));
  const grupper = new Map(problem.groups.map(g => [g.id, g.clusters.filter(id => kanda.has(id))]));
  const storlek = new Map(problem.clusters?.map(k => [k.id, k.size]));
  const elevpass = problem.lessons.flatMap(l => {
    if (utelamnat.has(l.id)) return [];
    const placement = placements.get(l.id);
    const kluster = new Set(l.groups.flatMap(g => grupper.get(g) ?? []));
    const start = placement?.startMin, slut = (start ?? 0) + l.duration_min;
    const intervall: Intervall | null = start === undefined ? null : { pass: l.id, start, slut, upptagenFran: Math.max(0, start - (l.margin?.students.before_min ?? 0)),
      upptagenTill: Math.min(1440, slut + (l.margin?.students.after_min ?? 0)) };
    return [{ id: l.id, day: placement?.day, intervall, kluster, periods: l.periods, undervisning: l.instructional !== false }];
  });
  return terms.flatMap(term => {
    const termensKortningar = new Map(trims.filter(t => t.term === term).map(t => [t.lesson, t.fixedMin]));
    const lektionsperiod = problem.periods?.length ? term : '';
    const profiler = new Map((problem.student_day_balance ?? []).filter(r => r.period === lektionsperiod && kanda.has(r.cluster)).map(r =>
      [r.cluster, { totalt: 0, dagar: new Map(r.days.map(dag => [dag, { antal: 0 }])) }] as [string, Lektionsvecka]));
    const veckor = new Map<string, Map<number, Intervall[]>>();
    for (const l of elevpass) {
      if (l.periods?.length && !l.periods.includes(term)) continue;
      if (l.undervisning) for (const id of l.kluster) {
        const profil = profiler.get(id);
        if (!profil) continue;
        profil.totalt++;
        const dag = l.day === undefined ? undefined : profil.dagar.get(l.day);
        if (dag) { dag.antal++; dag.pass = l.id; }
      }
      if (l.day === undefined || !l.intervall) continue;
      const kortning = termensKortningar.get(l.id) ?? 0;
      const fore = l.intervall;
      const intervall = kortning > 0 ? { ...fore, slut: fore.slut - kortning, upptagenTill: fore.upptagenTill - kortning } : fore;
      for (const id of l.kluster) {
        const vecka = veckor.get(id) ?? new Map<number, Intervall[]>(), dagen = vecka.get(l.day) ?? [];
        dagen.push(intervall); vecka.set(l.day, dagen); veckor.set(id, vecka);
      }
    }
    const dagar = new Map([...veckor].map(([id, vecka]) => [id, [...vecka].map(([dag, pass]) => matDag(pass, dag, problem.rules))]));
    return resurser.flatMap(({ slag, ref, kluster }) => {
      let matt: SchemaKvalitetsrad | undefined;
      for (const id of kluster) for (const d of dagar.get(id) ?? []) {
        if (!matt) { matt = { slag, ref, term, hal: d.hal, sluttid: d.sluttid, kortasteDag: d.langd, langstaDag: d.langd }; continue; }
        if (d.hal && d.hal.min > (matt.hal?.min ?? 0)) matt.hal = d.hal;
        if (d.sluttid.min > matt.sluttid.min) matt.sluttid = d.sluttid;
        matt.kortasteDag = Math.min(matt.kortasteDag, d.langd);
        matt.langstaDag = Math.max(matt.langstaDag, d.langd);
      }
      if (!matt) return [];
      const lektionsdagar = matLektionsdagar(kluster, profiler, storlek);
      return [{ ...matt, ...(lektionsdagar && { lektionsdagar }) }];
    });
  });
}
