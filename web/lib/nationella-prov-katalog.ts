import type { NationellaProvDeltagare, NationellaProvUnderlag, NationellProvbokning, Provniva, Provtermin, Provterminer, Provval } from './nationella-prov.ts';

// SKOLFS 2024:628, senaste lydelse. Används bara för förslag om motsvarande kurs/nivå.
// Provbokningen sparar fortfarande undervisningens ursprungliga referens.
const motsvarigheter = new Map([
  ['ENG:ENGENG05', 'ENGE:ENGE1000X'], ['ENG:ENGENG06', 'ENGE:ENGE2000X'],
  ['MAT:MATMAT01a', 'MATE:MATE1A00X'], ['MAT:MATMAT01b', 'MATE:MATE1B00X'], ['MAT:MATMAT01c', 'MATE:MATE1C00X'],
  ['MAT:MATMAT02a', 'MATE:MATE2A00X'], ['MAT:MATMAT02b', 'MATE:MATE2B00X'], ['MAT:MATMAT02c', 'MATE:MATE2C00X'],
  ['MAT:MATMAT03b', 'MATO:MATO1B00X'], ['MAT:MATMAT03c', 'MATO:MATO1C00X'], ['MAT:MATMAT04', 'MATO:MATO2000X'],
  ['SVE:SVESVE01', 'SVEN:SVEN1000X'], ['SVE:SVESVE03', 'SVEN:SVEN3000X'],
  ['SVA:SVASVA01', 'SVEA:SVEA1000X'], ['SVA:SVASVA03', 'SVEA:SVEA3000X'],
]);

export function provNivaNyckel({ amne, niva }: Pick<Provniva, 'amne' | 'niva'>): string {
  const key = `${amne}:${niva}`;
  return motsvarigheter.get(key) ?? key;
}

export function provtermin(datum: string, schoolYear: number, terminer?: Provterminer): Provtermin | undefined {
  if (!datum) return undefined;
  if (!terminer) return datum < `${schoolYear + 1}-01-01` ? 'ht' : 'vt';
  return (['ht', 'vt'] as const).find(termin => terminer[termin].start <= datum && datum <= terminer[termin].end);
}

export function katalogbokningGiltig(prov: Provval, bokning: NationellProvbokning, underlag: NationellaProvUnderlag, schoolYear: number): boolean {
  const fran = prov.tid.typ === 'fast' ? prov.tid.datum : prov.tid.fran;
  const kalltermin = provtermin(fran, schoolYear, underlag.terminer);
  const terminsSlut = kalltermin && underlag.terminer?.[kalltermin].end;
  if (bokning.tidsval !== prov.tid.typ || !provDatumTillatet(prov, bokning.datum, terminsSlut)
    || !provTidTillaten(prov, bokning.datum, bokning.startMin, bokning.slutMin)) return false;
  const target = underlag.deltagare.find(d => d.slag === bokning.mal.slag && d.ref === bokning.mal.ref);
  const termin = provtermin(bokning.datum, schoolYear, underlag.terminer);
  return !!target && provDeltagarforslag(prov.nivaer, [target], termin)[0]?.alternativ.some(a => a.ref === bokning.undervisning) === true;
}

export function provDatumTillatet(prov: Provval, datum: string, terminSlut?: string): boolean {
  if (prov.tid.typ === 'fast') return datum === prov.tid.datum;
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(datum)) return false;
  const date = new Date(datum);
  if (!Number.isFinite(date.valueOf()) || date.toISOString().slice(0, 10) !== datum) return false;
  if (date.getUTCDay() === 0 || date.getUTCDay() === 6) return false;
  // Från-datum utan publicerat slut gäller provtillfällets termin.
  const year = prov.tid.fran.slice(0, 4);
  const termEnd = prov.tid.fran.slice(5, 7) < '07' ? `${year}-06-30` : `${year}-12-31`;
  return datum >= prov.tid.fran && datum <= (prov.tid.till ?? terminSlut ?? termEnd);
}

export function provTidTillaten(prov: Provval, datum: string, startMin: number, slutMin: number): boolean {
  const tid = prov.tid;
  if (tid.typ === 'fast') return startMin === 540;
  return (datum !== tid.fran || tid.tidigasteStartMin === undefined || startMin >= tid.tidigasteStartMin)
    && (datum !== tid.till || tid.senasteSlutMin === undefined || slutMin <= tid.senasteSlutMin);
}

export type Provdeltagarforslag = {
  deltagare: NationellaProvDeltagare;
  alternativ: NationellaProvDeltagare['undervisningar'];
  valt: string | null;
  osaker: string | null;
};

export function provDeltagarforslag(nivaer: readonly Provniva[], deltagare: readonly NationellaProvDeltagare[], term?: Provtermin): Provdeltagarforslag[] {
  const krav = new Set(nivaer.map(provNivaNyckel));
  const rader = deltagare.flatMap(d => {
    const alternativ = d.undervisningar.filter(u => (term === undefined || u.terminer?.[term] !== false)
      && u.nivaer?.some(n => krav.has(provNivaNyckel(n))));
    return alternativ.length ? [{ deltagare: d, alternativ }] : [];
  });
  const klasser = new Set(rader.filter(r => r.deltagare.slag === 'klass').map(r => r.deltagare.ref));
  const gruppklasser = new Set(rader.flatMap(r => r.deltagare.klassRefs ?? []));
  return rader.map(({ deltagare: d, alternativ }) => {
    const forsta = alternativ[0];
    const flera = alternativ.length !== 1 || (forsta.nivaer?.length ?? 0) !== 1;
    const overlapp = d.slag === 'klass' ? gruppklasser.has(d.ref) : d.klassRefs?.some(ref => klasser.has(ref));
    const okandTermin = term !== undefined && forsta.terminer?.[term] === undefined;
    const osaker = overlapp ? 'Både en klass och en undervisningsgrupp kan matcha. Kontrollera vilka som ska delta.'
      : flera ? 'Flera ämnesnivåer kan matcha. Kontrollera vilken undervisning som ska kopplas till provet.'
        : okandTermin ? 'Undervisningstiden för den valda terminen saknas. Kontrollera att nivån avslutas vid provet.' : null;
    return { deltagare: d, alternativ, valt: osaker ? null : forsta.ref, osaker };
  });
}
