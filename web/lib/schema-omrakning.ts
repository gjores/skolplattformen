import type { SchemaForslag, SchemaForslagLesson, SchemaPlacement } from './schema-contract.ts';
import { kontrolleraSchemaDatum, parseSchemaDatumAndringar, SchemaDatumError, schemaDatumOriginal, type SchemaDatumAndring, type SchemaDatumReason } from './schema-datum.ts';

export type SchemaOmrakningsdatum = {
  fore: SchemaDatumAndring;
  efter: SchemaDatumAndring | null;
  titel: string;
  foreSal?: string;
  status: 'bevarad' | 'sal-saknas' | 'kan-inte-overforas';
  orsak?: string;
};
export type SchemaOmrakningspass = {
  fore: SchemaForslagLesson | null;
  efter: SchemaForslagLesson | null;
  foreSal: string | null;
  efterSal: string | null;
  tidAndrad: boolean;
  salAndrad: boolean;
  ansvarigAndrad?: true;
};
export type SchemaOmrakningslas = { fore: SchemaPlacement; efter: SchemaForslagLesson | null; titel: string; orsak: string };
export type SchemaOmrakning = {
  datedOverrides: SchemaDatumAndring[];
  datum: SchemaOmrakningsdatum[];
  pass: SchemaOmrakningspass[];
  locks: SchemaPlacement[];
  las: SchemaOmrakningslas[];
};

const salnamn = (f: SchemaForslag | null, id: string | null) => f?.rooms.find(r => r.id === id)?.name ?? null;
const passkalla = (l: SchemaForslagLesson) => l.egenAktivitet ? `aktivitet:${l.egenAktivitet.id}` : l.undervisning;
const passPerId = (f: SchemaForslag | null) => new Map(f?.lessons.map(l => [l.id, l]));

function grupper<T>(rader: T[], nyckel: (rad: T) => string | null): Map<string, T[]> {
  const result = new Map<string, T[]>();
  for (const rad of rader) {
    const key = nyckel(rad);
    if (key === null) continue;
    const lista = result.get(key);
    if (lista) lista.push(rad); else result.set(key, [rad]);
  }
  return result;
}

/** Samma pass-ID kan peka på olika undervisningar när underlaget har byggts om. */
function kopplaPass(fore: SchemaForslag | null, efter: SchemaForslag): Map<string, SchemaForslagLesson> {
  const koppling = new Map<string, SchemaForslagLesson>();
  if (!fore || fore.unitId !== efter.unitId || fore.schoolYear !== efter.schoolYear) return koppling;
  if (fore.period === efter.period && fore.grundFingerprint === efter.grundFingerprint) {
    const index = passPerId(efter);
    for (const l of fore.lessons) {
      const nasta = index.get(l.id);
      if (nasta) koppling.set(l.id, nasta);
    }
    return koppling;
  }

  const kallnyckel = (l: SchemaForslagLesson) => {
    const kalla = passkalla(l);
    return kalla ? JSON.stringify([kalla, l.term]) : null;
  };
  const grupperEfter = grupper(efter.lessons, kallnyckel);
  const langder = (pass: SchemaForslagLesson[]) => pass.map(l => l.durationMin).sort((a, b) => a - b).join(',');
  const vidSammaTid = (l: SchemaForslagLesson) => l.day === null || l.startMin === null ? null : `${l.day}@${l.startMin}/${l.durationMin}`;
  const sammaVeckodag = (l: SchemaForslagLesson) => l.day === null ? null : `${l.day}/${l.durationMin}`;
  const likaLanga = (l: SchemaForslagLesson) => String(l.durationMin);
  for (const [nyckel, gamla] of grupper(fore.lessons, kallnyckel)) {
    const nya = grupperEfter.get(nyckel);
    // En annan uppdelning kan ha nya pass med samma längd. De är inte gamla pass.
    if (!nya || gamla.length !== nya.length || langder(gamla) !== langder(nya)) continue;
    const anvanda = new Set<string>();
    const kopplaEntydiga = (match: (l: SchemaForslagLesson) => string | null) => {
      const kandidater = grupper(nya.filter(l => !anvanda.has(l.id)), match);
      for (const [key, lista] of grupper(gamla.filter(l => !koppling.has(l.id)), match)) {
        const nasta = kandidater.get(key);
        if (lista.length !== 1 || nasta?.length !== 1) continue;
        koppling.set(lista[0].id, nasta[0]);
        anvanda.add(nasta[0].id);
      }
    };
    kopplaEntydiga(vidSammaTid);
    kopplaEntydiga(sammaVeckodag);
    kopplaEntydiga(likaLanga);
  }
  return koppling;
}

/** I äldre utkast var sal-N ett löpnummer i salnamnens lista. Registrets ID lever genom namnbyten. */
function overfordSal(fore: SchemaForslag | null, efter: SchemaForslag, id: string): string | null {
  const namn = salnamn(fore, id);
  if (namn === null || !fore) return null;
  const gammaltRegister = fore.villkor.salregister, nyttRegister = efter.villkor.salregister;
  if (gammaltRegister && nyttRegister && gammaltRegister.kalla === nyttRegister.kalla) return efter.rooms.some(s => s.id === id) ? id : null;
  const match = efter.rooms.filter(s => s.name === namn);
  return match.length === 1 ? match[0].id : null;
}

function datumfel(orsak: SchemaDatumReason): string {
  switch (orsak) {
    case 'schema_datum_calendar_missing': return 'Förslaget saknar en läsårskalender.';
    case 'schema_datum_original_missing': return 'Det nya veckoschemat har inget motsvarande pass på ursprungsdatumet.';
    case 'schema_datum_date_invalid': return 'Det flyttade datumet är inte längre en skoldag för passets deltagare i den aktuella perioden.';
    case 'schema_datum_duration_changed': return 'Passets längd på ursprungsdatumet har ändrats.';
    default: return 'Datumändringen går inte att använda med det nya underlaget.';
  }
}

/** Granska ett fristående förslag. Inget i det gamla schemat eller dess datumändringar skrivs om. */
export function schemaOmrakning(fore: SchemaForslag | null, efter: SchemaForslag, gamlaDatum: SchemaDatumAndring[], foreLas: SchemaPlacement[] = fore?.locks ?? []): SchemaOmrakning {
  const gamlaPass = passPerId(fore), koppling = kopplaPass(fore, efter);
  const kvarvarande = new Set([...koppling.values()].map(l => l.id));
  const pass: SchemaOmrakningspass[] = [];
  const jamforPass = (gammalt: SchemaForslagLesson | null, nytt: SchemaForslagLesson | null) => {
    const a = gammalt?.roomId ?? null, b = nytt?.roomId ?? null;
    const foreSal = salnamn(fore, a), efterSal = salnamn(efter, b);
    const tidAndrad = gammalt?.day !== nytt?.day || gammalt?.startMin !== nytt?.startMin || gammalt?.durationMin !== nytt?.durationMin;
    const salAndrad = a === null ? b !== null : b === null || overfordSal(fore, efter, a) !== b;
    const ansvarigAndrad = gammalt?.ansvarig !== nytt?.ansvarig;
    if (tidAndrad || salAndrad || ansvarigAndrad) pass.push({ fore: gammalt, efter: nytt, foreSal, efterSal, tidAndrad, salAndrad, ...(ansvarigAndrad && { ansvarigAndrad: true }) });
  };
  for (const l of gamlaPass.values()) jamforPass(l, koppling.get(l.id) ?? null);
  for (const l of efter.lessons) if (!kvarvarande.has(l.id)) jamforPass(null, l);

  const datum: SchemaOmrakningsdatum[] = [], locks: SchemaPlacement[] = [], las: SchemaOmrakningslas[] = [];
  const gamlaKlipp = grupper(fore?.trims ?? [], t => t.lesson), nyaKlipp = grupper(efter.trims, t => t.lesson);
  const undervisningar = new Map(efter.teachings.map(t => [t.ref, t]));
  for (const a of gamlaDatum) {
    const gammalt = gamlaPass.get(a.lesson), nytt = koppling.get(a.lesson);
    const rad = { fore: a, titel: gammalt?.title ?? 'Pass', foreSal: salnamn(fore, a.room) ?? undefined };
    const stoppa = (orsak: string) => datum.push({ ...rad, efter: null, status: 'kan-inte-overforas', orsak });
    if (!gammalt || !fore || !nytt) { stoppa('Det gick inte att hitta ett entydigt motsvarande veckopass.'); continue; }
    const original = schemaDatumOriginal({ ...fore, lessons: [gammalt], trims: gamlaKlipp.get(gammalt.id) ?? [] }, a);
    if (!original) { stoppa('Det tidigare passets ursprungliga datum gick inte att identifiera.'); continue; }
    const sal = a.room === null ? null : overfordSal(fore, efter, a.room);
    const giltigSal = sal !== null && nytt.roomIds.includes(sal) ? sal : null;
    const kandidat = { ...a, lesson: nytt.id, room: giltigSal };
    const underlag = { ...efter, lessons: [nytt], trims: nyaKlipp.get(nytt.id) ?? [] };
    try {
      const [andring] = kontrolleraSchemaDatum(underlag, [kandidat]);
      const nyttOriginal = schemaDatumOriginal(underlag, andring);
      if (original.term !== nyttOriginal?.term) { stoppa('Ursprungsdatumet hör till en annan termin i det nya underlaget.'); continue; }
      const gammalTermin = fore.time.calendar?.days.find(d => d.date === a.date)?.term;
      const nyTermin = efter.time.calendar?.days.find(d => d.date === a.date)?.term;
      if (gammalTermin && gammalTermin !== nyTermin) { stoppa('Det flyttade datumet hör till en annan termin i det nya underlaget.'); continue; }
      const undervisning = nytt.undervisning ? undervisningar.get(nytt.undervisning) : undefined;
      if (undervisning?.timeBasis === 'lasar' && !undervisning.terms.some(t => t.term === nyTermin)) {
        stoppa('Undervisningen saknar undervisningstid i terminen för det flyttade datumet.'); continue;
      }
      if (giltigSal === null && (a.room !== null || nytt.roomIds.length > 0)) {
        const orsak = a.room === null ? 'Det flyttade passet saknar sal.'
          : sal === null ? 'Den tidigare salen finns inte i det nya underlaget.' : 'Den tidigare salen är inte tillåten för passet med de nya salvillkoren.';
        datum.push({ ...rad, efter: andring, status: 'sal-saknas', orsak });
      } else datum.push({ ...rad, efter: andring, status: 'bevarad' });
    } catch (fel) {
      if (!(fel instanceof SchemaDatumError)) throw fel;
      stoppa(datumfel(fel.reason));
    }
  }
  for (const p of foreLas) {
    const nytt = koppling.get(p.lesson), sal = p.room === null ? null : overfordSal(fore, efter, p.room);
    const rad = { fore: p, efter: nytt ?? null, titel: gamlaPass.get(p.lesson)?.title ?? 'Pass' };
    const orsak = !nytt ? 'Det gick inte att hitta ett entydigt motsvarande veckopass.'
      : p.room !== null && (sal === null || !nytt.roomIds.includes(sal)) ? 'Den låsta salen är inte tillgänglig för passet i det nya underlaget.'
        : nytt.day !== p.day || nytt.startMin !== p.startMin ? 'Passet ligger inte på den låsta dagen och tiden.'
          : nytt.roomId !== sal ? 'Passets sal skiljer sig från den låsta placeringen.'
            : p.ansvarig !== nytt.ansvarig ? 'Aktivitetens ansvariga skiljer sig från den låsta placeringen.' : null;
    if (orsak) las.push({ ...rad, orsak });
    else if (nytt) locks.push({ ...p, lesson: nytt.id, room: sal });
  }
  const datedOverrides = parseSchemaDatumAndringar(datum.flatMap(rad => rad.efter ? [rad.efter] : []));
  return { datedOverrides, datum, pass, locks, las };
}
