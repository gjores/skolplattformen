import type { SchemaKvalitetsrad, SchemaKvalitetsval, SchemaPlacement, SchemaProblem, SchemaTerm, SchemaTrim } from './schema-contract.ts';

export type SchemaElevresurs = Pick<SchemaKvalitetsval, 'slag' | 'ref'> & { kluster: string[] };
type Intervall = { pass: string; start: number; slut: number; upptagenFran: number; upptagenTill: number };
type Dag = Omit<SchemaKvalitetsrad, keyof SchemaKvalitetsval | 'kortasteDag' | 'langstaDag'> & { langd: number };

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

/** Sammanställ extrema värden över de faktiska deltagandemönstren. Ett gruppbyte i en klass får egna intervall. */
export function schemaElevkvalitet(problem: SchemaProblem, terms: SchemaTerm[], resurser: SchemaElevresurs[], placements: Map<string, SchemaPlacement>, utelamnat: Set<string>, trims: SchemaTrim[] = []): SchemaKvalitetsrad[] {
  const kanda = new Set(resurser.flatMap(r => r.kluster));
  const grupper = new Map(problem.groups.map(g => [g.id, g.clusters.filter(id => kanda.has(id))]));
  const elevpass = problem.lessons.flatMap(l => {
    const placement = placements.get(l.id);
    if (!placement || utelamnat.has(l.id)) return [];
    const { day, startMin } = placement, slut = startMin + l.duration_min;
    const kluster = new Set(l.groups.flatMap(g => grupper.get(g) ?? []));
    const intervall: Intervall = { pass: l.id, start: startMin, slut, upptagenFran: Math.max(0, startMin - (l.margin?.students.before_min ?? 0)),
      upptagenTill: Math.min(1440, slut + (l.margin?.students.after_min ?? 0)) };
    return [{ day, intervall, kluster, periods: l.periods }];
  });
  return terms.flatMap(term => {
    const termensKortningar = new Map(trims.filter(t => t.term === term).map(t => [t.lesson, t.fixedMin]));
    const veckor = new Map<string, Map<number, Intervall[]>>();
    for (const l of elevpass) {
      if (l.periods?.length && !l.periods.includes(term)) continue;
      const kortning = termensKortningar.get(l.intervall.pass) ?? 0;
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
      return matt ? [matt] : [];
    });
  });
}
