import type { NationellProvbokning } from './nationella-prov.ts';
import type { SchemaCheck, SchemaForslag, SchemaPlacement, SchemaProblem, SchemaRegel } from './schema-contract.ts';
import { SchemaDatumError, schemaDatumNyckel, schemaDatumTermTillaten, type SchemaDatumAndring, type SchemaDatumTillfalle } from './schema-datum.ts';
import { schemaDatumTillganglighet, schemaDatumUnderlag, type SchemaDatedBasis, type SchemaDatumDagUnderlag } from './schema-datum-underlag.ts';
import type { SchemaSal } from './schema-salregister.ts';
import type { SchemaUnderlag } from './schema-underlag.ts';
import { salLedig } from './schema-utan-sal.ts';
import { schemaDagStatus, schemaWeekday } from './schema-vecka.ts';
import type { TjanstPlanRead } from './tjanst-contract.ts';

export type SchemaProvResursproblem = 'deltagare_saknas' | 'datum_utan_undervisning' | 'provkrock' | 'sal_saknas' | 'last_sal_olamplig'
  | 'vakt_saknas' | 'last_vakt_upptagen' | 'aktivitet_krock' | 'last_pass_krock' | 'provtid_utanfor_skoltid';
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
type Part = keyof NonNullable<MotorPass['margin']>;
type Tid = Pick<Bokning, 'startMin' | 'slutMin'>;

const EMPTY = new Set<string>();
const MAX_MOTORANROP = 24;
const MAX_MOTORANROP_PER_DATUM = 3;
const MAX_DATUM_PER_PASS = 12;
const SOKTID_MS = 3500;

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

/** Bokningens tid ligger fast. Förhandsgranskningen räknar provtiden separat och sparar inga ändringar. */
export async function schemaProvBerakning({ plan, underlag, forslag, datedBasis, datedOverrides, bokningar, salar, vakter, lastaPass = [], tidigasteErsattning, validate }: SchemaProvBerakningIndata): Promise<SchemaProvBerakningResultat> {
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
    forPeriod.filter(b => skoldagsdatum.has(b.datum)).map(b => b.datum), true);
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
      && !andraProv.some(p => (p.bokning.salId === sal.id || p.status.sal?.id === sal.id) && overlap(p.status, status));
    const vaktLedig = (ref: string) => oppet(underlag.villkor, 'larare', ref, vecka, status)
      && !upptagna.some(p => p.pass.teachers.some(id => underlag.teacherRefs[id] === ref) && partKrock(p, 'teachers', tentamen))
      && !andraProv.some(p => (p.bokning.vakter.includes(ref) || p.status.vakter.some(v => v.ref === ref)) && overlap(p.status, status, gap));
    const aktiva = valjbaraVakter(vakter, status.datum);
    const salLamplig = (sal: SchemaSal) => sal.platser !== null && sal.platser >= status.deltagare && salLedig(sal);
    const kanForesla = !status.problem.includes('provkrock') && !status.problem.includes('provtid_utanfor_skoltid');
    if (bokning.salId !== null) {
      const sal = salar.find(s => s.id === bokning.salId);
      if (!sal || !salLamplig(sal)) status.problem.push('last_sal_olamplig');
    } else if (kanForesla) {
      const lediga = salar.filter(salLamplig).map(sal => ({ sal, frigjord: frigorda.some(p => p.tillfalle.lesson.roomId !== null
        && p.tillfalle.lesson.roomId === salnummer.get(sal.id) && partKrock(p, 'rooms', tentamen)) }));
      lediga.sort((a, b) => Number(b.frigjord) - Number(a.frigjord) || a.sal.platser! - b.sal.platser! || a.sal.id.localeCompare(b.sal.id));
      status.sal = salregister.get(lediga[0]?.sal.id ?? '') ?? null;
      if (!status.sal) status.problem.push('sal_saknas');
    }
    if (bokning.vakter.length) {
      if (bokning.vakter.some(ref => !aktiva.has(ref) || !vaktLedig(ref))) status.problem.push('last_vakt_upptagen');
    } else if (kanForesla) {
      const lediga = [...aktiva.values()].filter(v => vaktLedig(v.ref)).map(vakt => ({ vakt, frigjord: frigorda.some(p =>
        p.pass.teachers.some(id => underlag.teacherRefs[id] === vakt.ref) && partKrock(p, 'teachers', tentamen)) }));
      lediga.sort((a, b) => Number(b.frigjord) - Number(a.frigjord) || a.vakt.ref.localeCompare(b.vakt.ref));
      if (lediga.length) status.vakter = [lediga[0].vakt];
      else status.problem.push('vakt_saknas');
    }
  }

  const ersattningar: SchemaDatumAndring[] = [], ersatt = new Set<string>();
  const sluttid = Date.now() + SOKTID_MS;
  let motoranrop = 0;
  for (const { pass, tillfalle, elever: tidigareElever, flyttbar } of bortfall.values()) {
    if (!flyttbar || !tidigareElever.size || motoranrop >= MAX_MOTORANROP || Date.now() > sluttid) continue;
    const ursprung = tillfalle.lesson;
    const sokdagar = skoldagar.filter(dag => dag.date >= tillfalle.date && (!tidigasteErsattning || dag.date >= tidigasteErsattning)
      && (dag.term === tillfalle.term || underlag.villkor.timeBasis === 'lasar' && ursprung.term === null)
      && ursprung.classIds.every(id => schemaDagStatus(dag, id).schoolDay)).slice(0, MAX_DATUM_PER_PASS);
    const salval = [...new Set([ursprung.roomId, ...ursprung.roomIds])].filter(id => id !== null || ursprung.roomIds.length === 0);
    const historik = [...prep.datedOverrides, ...ersattningar];
    for (const dag of sokdagar) {
      if (ersatt.has(tillfalle.key) || motoranrop >= MAX_MOTORANROP || Date.now() > sluttid) break;
      const vecka = schemaWeekday(dag.date), ramar = underlag.problem.time.days[vecka];
      if (!ramar) continue;
      const preliminar = { lesson: ursprung.id, originalDate: tillfalle.originalDate, date: dag.date, startMin: ramar.start_min, room: salval[0] ?? null, durationMin: tillfalle.length };
      let datumbild: SchemaDatumDagUnderlag | undefined;
      try {
        const kandidat = schemaDatumUnderlag(plan, underlag, forslag, datedBasis, [...historik, preliminar], [], true);
        if (kandidat.violations.length) continue;
        datumbild = kandidat.days.find(d => d.date === dag.date);
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
      const motoranropVidStart = motoranrop;
      for (let startMin = Math.ceil(ramar.start_min / steg) * steg; startMin + pass.duration_min <= ramar.end_min && !ersatt.has(tillfalle.key); startMin += steg) {
        for (const room of salval) {
          if (motoranrop >= MAX_MOTORANROP || motoranrop - motoranropVidStart >= MAX_MOTORANROP_PER_DATUM || Date.now() > sluttid) break;
          if (!tidslucka(startMin, room)) continue;
          const placeringar = datumbild.placements.map(p => p.lesson === eget.pass.id ? { ...p, startMin, room } : p);
          motoranrop++;
          if ((await validate(datumbild.problem, placeringar)).violations.length) continue;
          ersattningar.push({ ...preliminar, startMin, room });
          ersatt.add(tillfalle.key);
          break;
        }
        if (motoranrop >= MAX_MOTORANROP || motoranrop - motoranropVidStart >= MAX_MOTORANROP_PER_DATUM || Date.now() > sluttid) break;
      }
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
