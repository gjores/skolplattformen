import type { NationellProvbokning } from './nationella-prov.ts';
import type { SchemaCheck, SchemaDatedDay, SchemaForslag, SchemaPlacement, SchemaProblem, SchemaRegel } from './schema-contract.ts';
import { SchemaDatumError, schemaDatumNyckel, schemaDatumTermTillaten, type SchemaDatumAndring, type SchemaDatumTillfalle } from './schema-datum.ts';
import { schemaDatumTillganglighet, schemaDatumUnderlag, type SchemaDatedBasis, type SchemaDatumDagUnderlag } from './schema-datum-underlag.ts';
import type { SchemaSal } from './schema-salregister.ts';
import type { SchemaUnderlag } from './schema-underlag.ts';
import { salLedig } from './schema-utan-sal.ts';
import { schemaDagStatus, schemaWeekday } from './schema-vecka.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

export type SchemaProvResursproblem = 'deltagare_saknas' | 'datum_utan_undervisning' | 'provkrock' | 'sal_saknas' | 'last_sal_olamplig'
  | 'vakt_saknas' | 'last_vakt_upptagen' | 'aktivitet_krock' | 'last_pass_krock' | 'provtid_utanfor_skoltid';
export type SchemaLastVaktHinder = 'last_vakt_skoluppdrag_saknas' | 'last_vakt_tid_sparrad' | 'last_vakt_upptagen';
type Vakt = { ref: string; name: string };
export type SchemaProvBerakningIndata = {
  plan: TjanstPlanRead;
  underlag: SchemaUnderlag;
  forslag: SchemaForslag;
  datedBasis: SchemaDatedBasis;
  datedOverrides: SchemaDatumAndring[];
  bokningar: NationellProvbokning[];
  salar: SchemaSal[];
  vakter: (Vakt & { startsOn?: string; endsOn?: string | null })[];
  lastaPass?: string[];
  tidigasteErsattning?: string;
  validate: (problem: SchemaProblem, placements: SchemaPlacement[]) => Promise<SchemaCheck>;
  onLastVaktHinder?: (bokningId: string, hinder: SchemaLastVaktHinder) => void;
};
type Bokning = Pick<NationellProvbokning, 'id' | 'namn' | 'datum' | 'startMin' | 'slutMin'> & {
  deltagare: number; deltagarnamn: string; sal: Pick<SchemaSal, 'id' | 'name'> | null; vakter: Vakt[]; problem: SchemaProvResursproblem[];
};
export type SchemaProvBerakningResultat = {
  bokningar: Bokning[];
  bortfall: { ref: string; title: string; bortfallMin: number; ersattMin: number; kvarMin: number }[];
  ersattningar: SchemaDatumAndring[];
};

type MotorPass = SchemaProblem['lessons'][number];
type DatumPass = { pass: MotorPass; tillfalle: SchemaDatumTillfalle; elever: ReadonlySet<string> };
type Prov = { bokning: NationellProvbokning; status: Bokning; elever: ReadonlySet<string>; dag?: SchemaDatumDagUnderlag };
type Bortfall = DatumPass & { ref: string; flyttbar: boolean };
type Provsal = SchemaSal & { platser: number };
type Salalternativ = { sal: Provsal; prioritet: number };
type Salurval = { status: Bokning; alternativ: Salalternativ[] };
type Ersattningssokning = { pass: Bortfall; dagar: SchemaDatedDay[]; salar: (string | null)[]; datumIndex: number; provadeStarter: Set<number>; klar: boolean };
type Ersattningskandidat = { flytt: SchemaDatumAndring; problem: SchemaProblem; placeringar: SchemaPlacement[] };
type Part = keyof NonNullable<MotorPass['margin']>;
type Tid = Pick<Bokning, 'startMin' | 'slutMin'>;

const EMPTY = new Set<string>();
const MAX_SALSTEG_PER_DAG = 5000;
const MIN_MOTORBUDGET = 48;
const MAX_MOTORBUDGET = 192;
const MOTORANROP_PER_BORTFALL = 8;
const MAX_MOTORANROP_PER_DATUM = 3;
const MAX_DATUM_PER_PASS = 25;
const SOKTID_MS = 10_000;

function overlap(a: Tid, b: Tid, gap = 0) {
  return a.startMin < b.slutMin + gap && b.startMin < a.slutMin + gap;
}

function shares(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  for (const item of a) if (b.has(item)) return true;
  return false;
}

function elever(dag: SchemaDatumDagUnderlag, grupper: string[]) {
  const val = new Set<string>();
  for (const grupp of grupper) for (const elev of dag.pupilsByGroup.get(grupp) ?? EMPTY) val.add(elev);
  return val;
}

function passTid(startMin: number, pass: MotorPass, part?: Part): Tid {
  const margin = part ? pass.margin?.[part] : undefined;
  return { startMin: startMin - (margin?.before_min ?? 0), slutMin: startMin + pass.duration_min + (margin?.after_min ?? 0) };
}

function passKrock(startMin: number, pass: MotorPass, part: Part, provtid: Tid, gap: number) {
  return overlap(passTid(startMin, pass), provtid, gap) || overlap(passTid(startMin, pass, part), provtid);
}

function dagpass(dag: SchemaDatumDagUnderlag): DatumPass[] {
  return dag.problem.lessons.map(pass => ({ pass, tillfalle: dag.occurrences.get(pass.id)!, elever: elever(dag, pass.groups) }));
}

function oppet(villkor: SchemaUnderlag['villkor'], slag: 'larare' | 'sal', ref: string, vecka: number, tid: Tid) {
  const regler = villkor.egna.filter((r): r is Extract<SchemaRegel, { typ: 'sparrad' | 'tillaten' }> =>
    r.slag === slag && r.ref === ref && (r.typ === 'sparrad' || r.typ === 'tillaten'));
  return schemaDatumTillganglighet(regler, vecka).some(fonster => fonster.start_min <= tid.startMin && fonster.end_min >= tid.slutMin);
}

function valjbaraVakter(vakter: SchemaProvBerakningIndata['vakter'], datum: string) {
  const aktiva = new Map<string, Vakt>();
  for (const { ref, name, startsOn, endsOn } of vakter) {
    if ((startsOn === undefined || startsOn <= datum) && (endsOn == null || datum <= endsOn)) aktiva.set(ref, { ref, name });
  }
  return aktiva;
}

function fordelaProvsalar(urval: Salurval[]) {
  const antal = urval.length, vikt = antal + 1;
  // En bokning med sal väger tyngre än återanvändningen, och en egen frigjord sal väger mest bland återanvända salar.
  const salpoang = (prioritet: number) => vikt ** 2 + (prioritet === 2 ? vikt : 0) + (prioritet > 0 ? 1 : 0);
  const ordnade = [...urval].sort((a, b) => a.alternativ.length - b.alternativ.length || b.status.deltagare - a.status.deltagare);
  const maxKvar = Array<number>(antal + 1).fill(0);
  for (let i = antal - 1; i >= 0; i--) {
    const [basta] = ordnade[i].alternativ;
    maxKvar[i] = maxKvar[i + 1] + (basta ? salpoang(basta.prioritet) : 0);
  }
  const upptagna = new Map<string, Bokning[]>();
  const valda = Array<Provsal | null>(antal).fill(null);
  let basta = [...valda], bastaPoang = 0, steg = 0;
  function sok(index: number, poang: number) {
    if (poang > bastaPoang) {
      basta = [...valda];
      bastaPoang = poang;
    }
    if (poang + maxKvar[index] <= bastaPoang || steg >= MAX_SALSTEG_PER_DAG) return;
    steg++;
    const { status, alternativ } = ordnade[index];
    for (const { sal, prioritet } of alternativ) {
      const bokningar = upptagna.get(sal.id) ?? [];
      if (bokningar.some(b => overlap(b, status))) continue;
      bokningar.push(status);
      upptagna.set(sal.id, bokningar);
      valda[index] = sal;
      sok(index + 1, poang + salpoang(prioritet));
      valda[index] = null;
      bokningar.pop();
      if (steg >= MAX_SALSTEG_PER_DAG) return;
    }
    sok(index + 1, poang);
  }
  sok(0, 0);
  ordnade.forEach(({ status }, index) => {
    const sal = basta[index];
    if (sal) status.sal = { id: sal.id, name: sal.name };
    else status.problem.push('sal_saknas');
  });
}

/** Bokningens tid ligger fast. Förhandsgranskningen räknar provtiden separat och sparar inga ändringar. */
export async function schemaProvBerakning({ plan, underlag, forslag, datedBasis, datedOverrides, bokningar, salar, vakter, lastaPass = [], tidigasteErsattning, validate, onLastVaktHinder }: SchemaProvBerakningIndata): Promise<SchemaProvBerakningResultat> {
  if (!bokningar.length) return { bokningar: [], bortfall: [], ersattningar: [] };
  const kalender = forslag.time.calendar;
  if (!kalender) throw new SchemaDatumError('schema_datum_calendar_missing');
  const datum = new Map(kalender.days.map(dag => [dag.date, dag]));
  const forPeriod = bokningar.filter(b => {
    const term = datum.get(b.datum)?.term;
    return term == null || schemaDatumTermTillaten(forslag.period, term);
  }).sort((a, b) => a.datum.localeCompare(b.datum) || a.startMin - b.startMin || a.id.localeCompare(b.id));
  const skoldagar = kalender.days.filter(dag => dag.schoolDay && schemaDatumTermTillaten(forslag.period, dag.term) && schemaWeekday(dag.date) < 5);
  const skoldagsdatum = new Set(skoldagar.map(dag => dag.date));
  const prep = schemaDatumUnderlag(plan, underlag, forslag, datedBasis, datedOverrides,
    forPeriod.filter(b => skoldagsdatum.has(b.datum)).map(b => b.datum), true, 'valdaDatum');
  const dagar = new Map(prep.days.map(dag => [dag.date, dag]));
  const refs = new Map(prep.sources.map(kalla => [kalla.lesson, kalla.ref]));
  const undervisningar = new Map(forslag.teachings.map(undervisning => [undervisning.ref, undervisning]));
  const gruppnamn = new Map([...plan.classes.map(klass => [klass.classId, klass.name] as const),
    ...(plan.groups ?? []).map(grupp => [grupp.groupId, grupp.name] as const)]);
  // Skolregistret har stabila ID:n. Äldre utkast hade bara namn och egna löpnummer.
  const salnummer = new Map(salar.map(sal => [sal.id, underlag.labels.rooms.find(r =>
    underlag.villkor.salregister?.kalla === 'skola' ? r.id === sal.id : r.name === sal.name)?.id]));
  const allPersonal = new Map(vakter.map(({ ref, name }) => [ref, { ref, name }]));
  const salregister = new Map(salar.map(({ id, name }) => [id, { id, name }]));
  const byggaProv = (bokning: NationellProvbokning): Prov => {
    const { id, namn, datum: date, startMin, slutMin } = bokning;
    const dag = dagar.get(date), kal = datum.get(date);
    const sal = bokning.salId === null ? null : salregister.get(bokning.salId) ?? null;
    const status: Bokning = { id, namn, datum: date, startMin, slutMin, deltagare: 0, deltagarnamn: gruppnamn.get(bokning.mal.ref) ?? 'Tidigare deltagargrupp', sal,
      vakter: bokning.vakter.flatMap(ref => allPersonal.get(ref) ?? []), problem: [] };
    if (!dag || !kal || bokning.mal.slag === 'klass' && !schemaDagStatus(kal, bokning.mal.ref).schoolDay) {
      status.problem.push('datum_utan_undervisning');
      return { bokning, status, elever: EMPTY };
    }
    const grupp = dag.groupIdsByRef.get(bokning.mal.ref);
    const aktuella = dag.pupilsByGroup.get(grupp ?? '') ?? EMPTY;
    status.deltagare = aktuella.size;
    if (!aktuella.size) status.problem.push('deltagare_saknas');
    const ramar = dag.problem.time.days[schemaWeekday(date)];
    if (!ramar || startMin < ramar.start_min || slutMin > ramar.end_min) status.problem.push('provtid_utanfor_skoltid');
    return { bokning, status, elever: aktuella, dag };
  };
  const prov = forPeriod.map(byggaProv);
  const partKrock = (p: DatumPass, part: Part, tentamen: Prov) => passKrock(p.tillfalle.lesson.startMin!, p.pass, part, tentamen.status,
    part === 'rooms' ? 0 : tentamen.dag!.problem.rules.break_min);
  const passPerDag = new Map(prep.days.map(dag => [dag.date, dagpass(dag)]));
  const overrideNycklar = new Set(prep.datedOverrides.map(schemaDatumNyckel));
  const fastPass = new Set([...lastaPass, ...(underlag.problem.links ?? []).filter(l => l.kind === 'simultaneous').flatMap(l => l.lessons)]);
  const bortfall = new Map<string, Bortfall>();
  const salurval = new Map<string, Salurval[]>();
  for (const tentamen of prov) {
    if (!tentamen.dag || !tentamen.elever.size) continue;
    const { bokning, status } = tentamen;
    if (prov.some(annat => annat !== tentamen && annat.status.datum === status.datum && overlap(annat.status, status) && shares(annat.elever, tentamen.elever))) {
      status.problem.push('provkrock');
    }
    for (const pass of passPerDag.get(status.datum) ?? []) {
      const { tillfalle } = pass;
      if (!(shares(pass.elever, tentamen.elever) && partKrock(pass, 'students', tentamen)
        || bokning.salId !== null && tillfalle.lesson.roomId !== null && tillfalle.lesson.roomId === salnummer.get(bokning.salId) && partKrock(pass, 'rooms', tentamen)
        || pass.pass.teachers.some(id => bokning.vakter.includes(underlag.teacherRefs[id])) && partKrock(pass, 'teachers', tentamen))) continue;
      if (tillfalle.lesson.egenAktivitet) {
        if (!status.problem.includes('aktivitet_krock')) status.problem.push('aktivitet_krock');
        continue;
      }
      const flyttbar = !overrideNycklar.has(tillfalle.key) && !fastPass.has(tillfalle.lesson.id);
      if (!flyttbar && !status.problem.includes('last_pass_krock')) status.problem.push('last_pass_krock');
      const ref = refs.get(tillfalle.lesson.id);
      if (!ref) throw new SchemaDatumError('schema_datum_source_unknown');
      bortfall.set(tillfalle.key, { ...pass, ref, flyttbar });
    }
  }

  for (const tentamen of prov) {
    const { bokning, status } = tentamen;
    if (!tentamen.dag || !tentamen.elever.size) continue;
    const vecka = schemaWeekday(status.datum), gap = tentamen.dag.problem.rules.break_min;
    const pass = passPerDag.get(status.datum) ?? [];
    const frigorda = pass.filter(p => bortfall.get(p.tillfalle.key)?.flyttbar);
    const upptagna = pass.filter(p => !bortfall.get(p.tillfalle.key)?.flyttbar);
    const andraProv = prov.filter(annat => annat !== tentamen && annat.status.datum === status.datum);
    const salLedig = (sal: SchemaSal) => oppet(underlag.villkor, 'sal', sal.name, vecka, status)
      && !upptagna.some(p => p.tillfalle.lesson.roomId !== null && p.tillfalle.lesson.roomId === salnummer.get(sal.id) && partKrock(p, 'rooms', tentamen))
      && !andraProv.some(p => p.bokning.salId === sal.id && overlap(p.status, status));
    const vaktUtanKrock = (ref: string) => !upptagna.some(p => p.pass.teachers.some(id => underlag.teacherRefs[id] === ref) && partKrock(p, 'teachers', tentamen))
      && !andraProv.some(p => (p.bokning.vakter.includes(ref) || p.status.vakter.some(v => v.ref === ref)) && overlap(p.status, status, gap));
    const vaktTillatenTid = (ref: string) => oppet(underlag.villkor, 'larare', ref, vecka, status);
    const aktiva = valjbaraVakter(vakter, status.datum);
    const salLamplig = (sal: SchemaSal): sal is Provsal => sal.platser !== null && sal.platser >= status.deltagare && salLedig(sal);
    const kanForesla = !status.problem.includes('provkrock') && !status.problem.includes('provtid_utanfor_skoltid');
    if (bokning.salId !== null) {
      const sal = salar.find(s => s.id === bokning.salId);
      if (!sal || !salLamplig(sal)) status.problem.push('last_sal_olamplig');
    } else if (kanForesla) {
      const alternativ = salar.filter(salLamplig).map(sal => {
        const frigjordaPass = frigorda.filter(p => p.tillfalle.lesson.roomId === salnummer.get(sal.id) && partKrock(p, 'rooms', tentamen));
        const egenFrigjordSal = frigjordaPass.some(p => shares(tentamen.elever, p.elever) && partKrock(p, 'students', tentamen));
        return { sal, prioritet: egenFrigjordSal ? 2 : frigjordaPass.length ? 1 : 0 };
      }).sort((a, b) => b.prioritet - a.prioritet || a.sal.platser - b.sal.platser || a.sal.id.localeCompare(b.sal.id));
      const urval = salurval.get(status.datum) ?? [];
      urval.push({ status, alternativ });
      salurval.set(status.datum, urval);
    }
    if (bokning.vakter.length) {
      const hinder = new Set<SchemaLastVaktHinder>();
      for (const ref of bokning.vakter) {
        if (!aktiva.has(ref)) hinder.add('last_vakt_skoluppdrag_saknas');
        else if (!vaktTillatenTid(ref)) hinder.add('last_vakt_tid_sparrad');
        else if (!vaktUtanKrock(ref)) hinder.add('last_vakt_upptagen');
      }
      if (hinder.size) {
        status.problem.push('last_vakt_upptagen');
        for (const orsak of hinder) onLastVaktHinder?.(bokning.id, orsak);
      }
    } else if (kanForesla) {
      const lediga = [...aktiva.values()].filter(v => vaktTillatenTid(v.ref) && vaktUtanKrock(v.ref)).map(vakt => ({ vakt, frigjord: frigorda.some(p =>
        p.pass.teachers.some(id => underlag.teacherRefs[id] === vakt.ref) && partKrock(p, 'teachers', tentamen)) }));
      lediga.sort((a, b) => Number(b.frigjord) - Number(a.frigjord) || a.vakt.ref.localeCompare(b.vakt.ref));
      if (lediga.length) status.vakter = [lediga[0].vakt];
      else status.problem.push('vakt_saknas');
    }
  }
  for (const urval of salurval.values()) fordelaProvsalar(urval);

  const ersattningar: SchemaDatumAndring[] = [], ersatt = new Set<string>();
  const sokningar: Ersattningssokning[] = [];
  for (const pass of bortfall.values()) {
    if (!pass.flyttbar || !pass.elever.size) continue;
    const tillfalle = pass.tillfalle;
    const ursprung = tillfalle.lesson;
    const dagar = skoldagar.filter(dag => dag.date >= tillfalle.date && (!tidigasteErsattning || dag.date >= tidigasteErsattning)
      && (dag.term === tillfalle.term || underlag.villkor.timeBasis === 'lasar' && ursprung.term === null)
      && ursprung.classIds.every(id => schemaDagStatus(dag, id).schoolDay)).slice(0, MAX_DATUM_PER_PASS);
    const salar = [...new Set([ursprung.roomId, ...ursprung.roomIds])].filter(id => id !== null || ursprung.roomIds.length === 0);
    sokningar.push({ pass, dagar, salar, datumIndex: 0, provadeStarter: new Set(), klar: false });
  }
  const sluttid = performance.now() + SOKTID_MS;
  function nastaKandidat(sokning: Ersattningssokning): Ersattningskandidat | null {
    const { pass, tillfalle, elever: tidigareElever } = sokning.pass;
    const ursprung = tillfalle.lesson;
    const historik = [...prep.datedOverrides, ...ersattningar];
    for (let i = sokning.datumIndex; i < sokning.dagar.length && performance.now() <= sluttid; i++) {
      if (i !== sokning.datumIndex) {
        sokning.datumIndex = i;
        sokning.provadeStarter.clear();
      }
      const provade = sokning.provadeStarter;
      if (provade.size >= MAX_MOTORANROP_PER_DATUM) continue;
      const dag = sokning.dagar[i];
      const vecka = schemaWeekday(dag.date), ramar = underlag.problem.time.days[vecka];
      if (!ramar) continue;
      const preliminar = { lesson: ursprung.id, originalDate: tillfalle.originalDate, date: dag.date, startMin: ramar.start_min, room: sokning.salar[0] ?? null, durationMin: tillfalle.length };
      let datumbild: SchemaDatumDagUnderlag | undefined;
      try {
        const kandidat = schemaDatumUnderlag(plan, underlag, forslag, datedBasis, [...historik, preliminar], [dag.date], true, 'valdaDatum');
        if (kandidat.violations.length) continue;
        [datumbild] = kandidat.days;
      } catch (error) {
        if (error instanceof SchemaDatumError && error.reason === 'schema_datum_date_invalid') continue;
        throw error;
      }
      const eget = datumbild && dagpass(datumbild).find(p => p.tillfalle.key === tillfalle.key);
      if (!datumbild || !eget || eget.elever.size !== tidigareElever.size || [...tidigareElever].some(id => !eget.elever.has(id))) continue;
      const aktiva = valjbaraVakter(vakter, dag.date);
      if (eget.pass.teachers.some(id => allPersonal.has(underlag.teacherRefs[id]) && !aktiva.has(underlag.teacherRefs[id]))) continue;
      const andra = dagpass(datumbild).filter(p => p.tillfalle.key !== tillfalle.key);
      if (datumbild.problem.rules.same_day === 'forbid' && andra.some(p => p.pass.activity === eget.pass.activity)) continue;
      const provPaDagen = prov.filter(p => p.status.datum === dag.date && p.dag);
      const gap = datumbild.problem.rules.break_min, steg = datumbild.problem.time.start_grid_min;
      const tidslucka = (start: number, room: string | null) => {
        const tid = passTid(start, eget.pass);
        const delar: Part[] = ['students', 'teachers', ...(room === null ? [] : ['rooms'] as const)];
        if (delar.some(part => {
          const medMarginal = passTid(start, eget.pass, part);
          return medMarginal.startMin < ramar.start_min || medMarginal.slutMin > ramar.end_min;
        })) return false;
        if (eget.pass.allowed && !eget.pass.allowed.some(f => f.day === vecka && f.start_min <= tid.startMin && f.end_min >= tid.slutMin)) return false;
        if (room !== null && eget.pass.rooms && !salLedig(datumbild.problem, datumbild.placements, eget.pass.id, room, vecka, start)) return false;
        return !andra.some(p => {
          const andraStart = p.tillfalle.lesson.startMin!;
          return shares(p.elever, eget.elever) && (passKrock(andraStart, p.pass, 'students', tid, gap) || overlap(passTid(start, eget.pass, 'students'), passTid(andraStart, p.pass)))
            || eget.pass.teachers.some(t => p.pass.teachers.includes(t)) && (passKrock(andraStart, p.pass, 'teachers', tid, gap) || overlap(passTid(start, eget.pass, 'teachers'), passTid(andraStart, p.pass)))
            || room !== null && room === p.tillfalle.lesson.roomId && (passKrock(andraStart, p.pass, 'rooms', tid, 0) || overlap(passTid(start, eget.pass, 'rooms'), passTid(andraStart, p.pass)));
        }) && !provPaDagen.some(tentamen =>
          shares(tentamen.elever, eget.elever) && passKrock(start, eget.pass, 'students', tentamen.status, gap)
          || eget.pass.teachers.some(id => tentamen.bokning.vakter.includes(underlag.teacherRefs[id]) || tentamen.status.vakter.some(v => v.ref === underlag.teacherRefs[id]))
            && passKrock(start, eget.pass, 'teachers', tentamen.status, gap)
          || room !== null && [tentamen.bokning.salId, tentamen.status.sal?.id ?? null].some(id => id !== null && salnummer.get(id) === room)
            && passKrock(start, eget.pass, 'rooms', tentamen.status, 0));
      };
      const starter: number[] = [];
      for (let start = ramar.start_min; start + pass.duration_min <= ramar.end_min; start += steg) starter.push(start);
      // Pröva olika delar av dagen. Näraliggande starttider leder ofta till samma regelutfall.
      if (provade.size === 1) starter.reverse();
      if (provade.size === 2) starter.sort((a, b) => Math.abs(a - ursprung.startMin!) - Math.abs(b - ursprung.startMin!));
      for (const startMin of starter) {
        if (performance.now() > sluttid) return null;
        if (provade.has(startMin)) continue;
        const room = sokning.salar.find(sal => tidslucka(startMin, sal));
        if (room === undefined) continue;
        provade.add(startMin);
        const placeringar = datumbild.placements.map(p => p.lesson === eget.pass.id ? { ...p, startMin, room } : p);
        return { flytt: { ...preliminar, startMin, room }, problem: datumbild.problem, placeringar };
      }
    }
    return null;
  }

  // Varje öppet tillfälle får en kandidat per omgång. Ett svårplacerat pass använder därför inte de andras första chans.
  const motorbudget = Math.min(MAX_MOTORBUDGET, Math.max(MIN_MOTORBUDGET, sokningar.length * MOTORANROP_PER_BORTFALL));
  let motoranrop = 0, provadeNagon = true;
  while (provadeNagon && motoranrop < motorbudget && performance.now() <= sluttid) {
    provadeNagon = false;
    for (const sokning of sokningar) {
      if (motoranrop >= motorbudget || performance.now() > sluttid) break;
      if (sokning.klar) continue;
      const kandidat = nastaKandidat(sokning);
      if (!kandidat) { sokning.klar = true; continue; }
      provadeNagon = true;
      motoranrop++;
      if ((await validate(kandidat.problem, kandidat.placeringar)).violations.length) continue;
      ersattningar.push(kandidat.flytt);
      ersatt.add(sokning.pass.tillfalle.key);
      sokning.klar = true;
    }
  }
  const undervisning = new Map<string, SchemaProvBerakningResultat['bortfall'][number]>();
  for (const { ref, tillfalle } of bortfall.values()) {
    const kalla = undervisningar.get(ref);
    const title = [kalla?.title ?? tillfalle.lesson.title, kalla?.classes.join(', ')].filter(Boolean).join(' · ').slice(0, 2000);
    const rad = undervisning.get(ref) ?? { ref, title, bortfallMin: 0, ersattMin: 0, kvarMin: 0 };
    rad.bortfallMin += tillfalle.length;
    if (ersatt.has(tillfalle.key)) rad.ersattMin += tillfalle.length;
    else rad.kvarMin += tillfalle.length;
    undervisning.set(ref, rad);
  }
  return { bokningar: prov.map(p => p.status), bortfall: [...undervisning.values()], ersattningar };
}
