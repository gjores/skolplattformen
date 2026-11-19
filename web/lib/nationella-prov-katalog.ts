import type { NationellaProvDeltagare, Provniva, Provtermin } from './nationella-prov.ts';

export type Provval = {
  id: string;
  namn: string;
  nivaer: Provniva[];
  tid: { typ: 'fast'; datum: string } | { typ: 'period'; fran: string; till?: string; tidigasteStartMin?: number; senasteSlutMin?: number };
  tidsatgang?: string;
};

/** Avstämt mot gymnasiets tabell på Skolverkets provdatumssida. Ett underlag per publicerat läsår. */
export const PROVDATUM_KONTROLLERADE = '2026-11-19';

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

type Provgrupp = { id: string; namn: string; nivaer: Provniva[] };
const niva = (amne: string, nivakod: string, namn: string): Provniva => ({ amne, niva: nivakod, namn });
const engelska1: Provgrupp = { id: 'engelska1', namn: 'Engelska nivå 1', nivaer: [niva('ENGE', 'ENGE1000X', 'Engelska nivå 1')] };
const engelska2: Provgrupp = { id: 'engelska2', namn: 'Engelska nivå 2', nivaer: [niva('ENGE', 'ENGE2000X', 'Engelska nivå 2')] };
const svenska1: Provgrupp = { id: 'svenska1', namn: 'Svenska / svenska som andraspråk nivå 1', nivaer: [
  niva('SVEN', 'SVEN1000X', 'Svenska nivå 1'), niva('SVEA', 'SVEA1000X', 'Svenska som andraspråk nivå 1'),
] };
const svenska3: Provgrupp = { id: 'svenska3', namn: 'Svenska 3 / svenska som andraspråk 3', nivaer: [
  niva('SVE', 'SVESVE03', 'Svenska 3'), niva('SVA', 'SVASVA03', 'Svenska som andraspråk 3'),
] };
const varianter = (amne: string, namn: string, nivatal: string, bokstaver: string[]): Provniva[] =>
  bokstaver.map(b => niva(amne, `${amne}${nivatal}${b.toUpperCase()}00X`, `${namn} nivå ${nivatal}${b}`));
const matematik1: Provgrupp = { id: 'matematik1', namn: 'Matematik nivå 1a, 1b, 1c', nivaer: varianter('MATE', 'Matematik', '1', ['a', 'b', 'c']) };
const matematik2: Provgrupp = { id: 'matematik2', namn: 'Matematik nivå 2a, 2b, 2c', nivaer: varianter('MATE', 'Matematik', '2', ['a', 'b', 'c']) };
const matteForts1: Provgrupp = { id: 'matematik-forts1', namn: 'Matematik – fortsättning nivå 1b, 1c', nivaer: varianter('MATO', 'Matematik – fortsättning', '1', ['b', 'c']) };
const matteForts2: Provgrupp = { id: 'matematik-forts2', namn: 'Matematik – fortsättning nivå 2', nivaer: [niva('MATO', 'MATO2000X', 'Matematik – fortsättning nivå 2')] };

function prov(grupp: Provgrupp, del: 'a' | 'b' | 'c' | 'abc', tid: Provval['tid'], tidsatgang: string): Provval {
  const datum = tid.typ === 'fast' ? tid.datum : tid.fran;
  const delprov = del === 'abc' ? 'Delprov A, B och C' : `Delprov ${del.toUpperCase()}`;
  return { id: `${grupp.id}-${del}-${datum}`, namn: `${grupp.namn} · ${delprov}`, nivaer: grupp.nivaer, tid, tidsatgang };
}

const fast = (datum: string): Provval['tid'] => ({ typ: 'fast', datum });
const fran = (datum: string, granser?: { till?: string; tidigasteStartMin?: number; senasteSlutMin?: number }): Provval['tid'] =>
  ({ typ: 'period', fran: datum, ...granser });
const engBcTid = '90 min, cirka 20 min rast och 50 min. Lägg till 5–10 min för instruktioner.';
const eng2CTid = '30 min förberedelse, cirka 10 min rast och 100 min skrivtid. Lägg till 5–10 min för instruktioner.';
const sv1BTid = '120 min för svenska. 180 min för svenska som andraspråk.';
const m1Tid = '60 + 60 + 120 min. Avsätt tid för två raster och 5–10 min för instruktioner.';
const m2Tid = '80 + 40 + 120 min. Avsätt tid för två raster och totalt 5–10 min för instruktioner.';
const mf2Tid = '80 + 40 + 150 min. Avsätt tid för två raster och totalt 5–10 min för instruktioner.';

// https://www.skolverket.se/prov-och-bedomning/nationella-prov/provdatum/provdatum-for-gymnasieskolan
// HT och VT har egna provtillfällen. Källan anger start kl. 09 för fasta datum.
// Muntliga delprov får inte en påhittad sluttid. Angivna minuttal är vägledning.
// Där källan anger ordning mellan delprov erbjuder datumväljaren separata dagar på rätt sida om det fasta datumet.
const prov2026: Provval[] = [
  prov(engelska1, 'a', fran('2026-11-02'), '15 min per elevpar och 10 min enskild förberedelse.'),
  prov(engelska1, 'c', fast('2026-11-24'), '80 min skrivtid. Lägg till 5–10 min för instruktioner.'),
  prov(engelska1, 'b', fast('2026-11-26'), engBcTid),
  prov(engelska1, 'a', fran('2027-03-15'), '15 min per elevpar och 10 min enskild förberedelse.'),
  prov(engelska1, 'c', fast('2027-05-03'), '80 min skrivtid. Lägg till 5–10 min för instruktioner.'),
  prov(engelska1, 'b', fast('2027-05-05'), engBcTid),
  prov(engelska2, 'a', fran('2026-11-02'), '15 min per elevpar och 15 min enskild förberedelse.'),
  prov(engelska2, 'c', fast('2026-11-17'), eng2CTid),
  prov(engelska2, 'b', fast('2026-11-19'), engBcTid),
  prov(engelska2, 'a', fran('2027-03-15'), '15 min per elevpar och 15 min enskild förberedelse.'),
  prov(engelska2, 'c', fast('2027-04-07'), eng2CTid),
  prov(engelska2, 'b', fast('2027-04-09'), engBcTid),
  prov(matematik1, 'abc', fast('2026-12-15'), m1Tid),
  prov(matematik1, 'abc', fast('2027-05-20'), m1Tid),
  prov(matematik2, 'abc', fast('2026-12-11'), m2Tid),
  prov(matematik2, 'abc', fast('2027-05-19'), m2Tid),
  prov(matteForts1, 'abc', fast('2026-12-10'), m2Tid),
  prov(matteForts1, 'abc', fast('2027-05-18'), m2Tid),
  prov(matteForts2, 'abc', fast('2026-12-16'), mf2Tid),
  prov(matteForts2, 'abc', fast('2027-05-21'), mf2Tid),
  prov(svenska1, 'a', fran('2026-11-02', { till: '2026-11-30', senasteSlutMin: 540 }), 'Cirka 10 min per elev. Genomförs före delprov B och C.'),
  prov(svenska1, 'b', fast('2026-11-30'), sv1BTid),
  prov(svenska1, 'c', fast('2026-12-04'), '180 min.'),
  prov(svenska1, 'a', fran('2027-03-15', { till: '2027-04-12', senasteSlutMin: 540 }), 'Cirka 10 min per elev. Genomförs före delprov B och C.'),
  prov(svenska1, 'b', fast('2027-04-12'), sv1BTid),
  prov(svenska1, 'c', fast('2027-04-16'), '180 min.'),
  prov(svenska3, 'a', fast('2026-11-10'), '240 min sammanhängande skrivtid.'),
  prov(svenska3, 'b', fran('2026-11-10', { tidigasteStartMin: 780 }), 'Cirka 10 min per elev. Genomförs efter delprov A.'),
  prov(svenska3, 'a', fast('2027-03-18'), '240 min sammanhängande skrivtid.'),
  prov(svenska3, 'b', fran('2027-03-18', { tidigasteStartMin: 780 }), 'Cirka 10 min per elev. Genomförs efter delprov A.'),
];

function provStart(p: Provval): string {
  return p.tid.typ === 'fast' ? p.tid.datum : p.tid.fran;
}

export function provvalForLasar(schoolYear: number): Provval[] {
  return schoolYear === 2026 ? prov2026.toSorted((a, b) => provStart(a).localeCompare(provStart(b)) || a.namn.localeCompare(b.namn, 'sv')) : [];
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
