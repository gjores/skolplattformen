import { provDatumTillatet, provDeltagarforslag, provtermin, provTidTillaten } from './nationella-prov-katalog.ts';
import type { NationellaProvUnderlag, NationellProvbokning, Provval } from './nationella-prov.ts';

type ProvTidsforslag = Pick<NationellProvbokning, 'datum' | 'startMin' | 'slutMin'>;

const FAST_START = 9 * 60;
// Ramar för själva periodförslaget. Källans villkor styr vad skolan kan välja.
const TIDIG_START = 8 * 60;
const SEN_SLUT = 17 * 60;
const MUNTLIGT_BLOCK = 90;
const targetKey = ({ slag, ref }: NationellProvbokning['mal']) => `${slag}:${ref}`;
const källstart = (prov: Provval) => prov.tid.typ === 'fast' ? prov.tid.datum : prov.tid.fran;
const bokadFör = (bokning: NationellProvbokning, prov: Provval, deltagare: NationellProvbokning['mal']) =>
  bokning.kallprov?.id === prov.id && targetKey(bokning.mal) === targetKey(deltagare);

function källtermin(prov: Provval, underlag: NationellaProvUnderlag, schoolYear: number) {
  const datum = källstart(prov);
  return provtermin(datum, schoolYear, underlag.terminer) ?? provtermin(datum, schoolYear);
}

export function provDeltagareForPlanering(prov: Provval, underlag: NationellaProvUnderlag, schoolYear: number,
  bokningar: readonly NationellProvbokning[], datum = källstart(prov)) {
  const termin = provtermin(datum, schoolYear, underlag.terminer) ?? källtermin(prov, underlag, schoolYear);
  return provDeltagarforslag(prov.nivaer, underlag.deltagare, termin).flatMap(rad => {
    const bokade = bokningar.filter(bokning => bokadFör(bokning, prov, rad.deltagare));
    if (prov.tid.typ === 'fast' && bokade.some(bokning => bokning.datum === datum)) return [];
    const osaker = bokade.length > 0
      ? prov.tid.typ === 'fast' ? 'Deltagaren har en bokning på ett tidigare publicerat datum. Kontrollera om den ska ersättas.'
        : 'Deltagaren har en bokning för provet. Välj deltagaren igen om du ska boka ytterligare ett tillfälle.'
      : rad.osaker ?? (termin === 'ht' && rad.alternativ.some(alternativ => alternativ.terminer?.vt !== false)
        ? 'Kontrollera om nivån avslutas på höstterminen eller fortsätter på våren.' : null);
    return [{ ...rad, osaker, valt: osaker ? null : rad.valt }];
  });
}

export function provRekommendationer(underlag: NationellaProvUnderlag, schoolYear: number,
  bokningar: readonly NationellProvbokning[], idag: string) {
  return (underlag.provkatalog?.prov ?? []).flatMap(prov => {
    if (prov.tid.typ === 'fast' && prov.tid.datum < idag) return [];
    const termin = källtermin(prov, underlag, schoolYear);
    if (prov.tid.typ === 'period') {
      const terminsSlut = termin && underlag.terminer?.[termin].end;
      const periodSlut = prov.tid.till ?? terminsSlut ?? (termin === 'ht' ? `${schoolYear}-12-31` : `${schoolYear + 1}-06-30`);
      if (periodSlut < idag) return [];
    }
    const rader = provDeltagareForPlanering(prov, underlag, schoolYear, bokningar).filter(rad =>
      (termin !== 'ht' || rad.alternativ.some(alternativ => alternativ.terminer?.vt !== true))
      && (prov.tid.typ !== 'period' || !bokningar.some(bokning => bokadFör(bokning, prov, rad.deltagare))));
    return rader.length ? [{ prov, deltagare: rader.length, osakra: rader.filter(rad => rad.osaker).length,
      saknarTidsforslag: provTidsforslag(prov, underlag, schoolYear, bokningar, idag) === null }] : [];
  }).sort((a, b) => källstart(a.prov).localeCompare(källstart(b.prov)) || a.prov.namn.localeCompare(b.prov.namn, 'sv'));
}

/** A periodförslag occupies an adjustable planning block. Oral sittings depend on the local number of pupils and examiners. */
export function provTidsforslag(prov: Provval, underlag: NationellaProvUnderlag, schoolYear: number,
  bokningar: readonly NationellProvbokning[], idag: string): ProvTidsforslag | null {
  const tid = prov.tid;
  const tidsplan = prov.tidsplan;
  if (!tidsplan) return null;
  const minuter = tidsplan.typ === 'gemensam' ? tidsplan.minuter
    : Math.max(MUNTLIGT_BLOCK, tidsplan.minuterPerTillfalle + (tidsplan.forberedelseMin ?? 0));
  const langd = Math.ceil(minuter / 5) * 5;
  if (tid.typ === 'fast') {
    if (underlag.skoldagar && !underlag.skoldagar.includes(tid.datum) || FAST_START + langd > 1440) return null;
    return { datum: tid.datum, startMin: FAST_START, slutMin: FAST_START + langd };
  }

  const termin = källtermin(prov, underlag, schoolYear);
  const terminsSlut = termin && underlag.terminer?.[termin].end;
  const mål = new Set(provDeltagareForPlanering(prov, underlag, schoolYear, bokningar).map(rad => targetKey(rad.deltagare)));
  const bokadeTider = bokningar.filter(bokning => mål.has(targetKey(bokning.mal)));
  for (const datum of (underlag.skoldagar ?? []).toSorted()) {
    if (datum <= idag || !provDatumTillatet(prov, datum, terminsSlut) || provtermin(datum, schoolYear, underlag.terminer) !== termin) continue;
    const tidigast = datum === tid.fran ? Math.max(TIDIG_START, tid.tidigasteStartMin ?? TIDIG_START) : TIDIG_START;
    const senast = datum === tid.till ? Math.min(SEN_SLUT, tid.senasteSlutMin ?? SEN_SLUT) : SEN_SLUT;
    const forsta = Math.ceil(tidigast / 5) * 5;
    const upptagna = bokadeTider.filter(bokning => bokning.datum === datum);
    let tidigLedig: ProvTidsforslag | null = null;
    for (let startMin = forsta; startMin + langd <= senast; startMin += 5) {
      const slutMin = startMin + langd;
      if (!provTidTillaten(prov, datum, startMin, slutMin)
        || upptagna.some(bokning => startMin < bokning.slutMin && bokning.startMin < slutMin)) continue;
      const forslag = { datum, startMin, slutMin };
      if (startMin >= FAST_START) return forslag;
      tidigLedig = forslag;
    }
    if (tidigLedig) return tidigLedig;
  }
  return null;
}
