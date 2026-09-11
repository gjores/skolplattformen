// Datalager för timplaner och läsår.
//
// Samma uppdelning som organisation-store: modellen (timplan-model.ts,
// lasar-model.ts) äger reglerna, det här lagret översätter mellan modellens
// typer och tabellraderna. Skrivningarna är skillnadsbaserade: vyn räknar fram
// ett nytt tillstånd med modellen, och här jämförs det med det förra så att
// bara det som faktiskt ändrats skrivs. Radnivåskyddet i databasen avgör vad
// som går igenom.

import { supabase, type Client } from './supabase.ts';
import type { Database } from './database.types.ts';
import {
  defaultCells,
  type Education,
  type Entry as TimplanEntry,
  type Timplan,
  type TimplanStatus,
} from './timplan-model.ts';
import {
  createLasarState,
  type Cause,
  type Entry as LasarEntry,
  type Exception,
  type GroupException,
  type SchoolYear,
  type SchoolYearStatus,
  type ShortWeek,
} from './lasar-model.ts';

type Row<T extends keyof Database['public']['Tables']> = Database['public']['Tables'][T]['Row'];
type DbTimplanStatus = Database['public']['Enums']['timplan_status'];
type DbYearStatus = Database['public']['Enums']['school_year_status'];

// Enum-värdena i databasen saknar diakriter; modellen har dem.
const timplanStatusIn = (s: DbTimplanStatus): TimplanStatus =>
  s === 'faststalld' ? 'fastställd' : s === 'forslag' ? 'förslag' : s === 'atersand' ? 'återsänd' : s;
const timplanStatusOut = (s: TimplanStatus): DbTimplanStatus =>
  s === 'fastställd' ? 'faststalld' : s === 'förslag' ? 'forslag' : s === 'återsänd' ? 'atersand' : s;
const yearStatusIn = (s: DbYearStatus): SchoolYearStatus =>
  s === 'faststalld' ? 'fastställd' : s === 'forslag' ? 'förslag' : s === 'atersand' ? 'återsänd' : s;
const yearStatusOut = (s: SchoolYearStatus): DbYearStatus =>
  s === 'fastställd' ? 'faststalld' : s === 'förslag' ? 'forslag' : s === 'återsänd' ? 'atersand' : s;

function client(): Client {
  const db = supabase();
  if (!db) throw new Error('Ingen backend konfigurerad.');
  return db;
}
async function actor(db: Client) {
  const { data } = await db.auth.getUser();
  return data.user?.id ?? null;
}
const fail = (what: string, message: string): never => {
  throw new Error(`Kunde inte ${what}: ${message}`);
};
/** Tid utan datum för händelser som läses tillbaka, som i modellen. */
const clockOf = (iso: string) =>
  new Date(iso).toLocaleTimeString('sv-SE', { hour: '2-digit', minute: '2-digit' });

// ---------------------------------------------------------------- timplaner

function toTimplan(row: Row<'timplans'>, cells: Row<'timplan_cells'>[], events: Row<'timplan_events'>[]): Timplan {
  return {
    id: row.id,
    educationId: row.offering_id,
    version: row.version,
    status: timplanStatusIn(row.status),
    cells: Object.fromEntries(
      cells.filter((c) => c.timplan_id === row.id).map((c) => [c.row_id, c.hours.map(Number)]),
    ),
    history: events
      .filter((e) => e.timplan_id === row.id)
      .map(
        (e): TimplanEntry => ({
          id: e.id,
          time: clockOf(e.created_at),
          role: e.actor_role === 'huvudman' ? 'huvudman' : 'rektor',
          action: e.action,
          comment: e.comment,
        }),
      ),
    catalog: row.catalog_fetched ?? '',
    basis: row.basis,
    decidedOn: row.decided_on ?? undefined,
  };
}

/** Läser huvudmannens timplaner. Ren läsning: tom tabell ger tom lista. */
export async function loadTimplans(_educations: Education[]): Promise<Timplan[]> {
  const db = client();
  const plans = await db.from('timplans').select('*').order('version');
  if (plans.error) fail('läsa timplaner', plans.error.message);
  const [cells, events] = await Promise.all([
    db.from('timplan_cells').select('*'),
    db.from('timplan_events').select('*').order('created_at', { ascending: false }),
  ]);
  if (cells.error) fail('läsa timplanens timmar', cells.error.message);
  if (events.error) fail('läsa timplanens historik', events.error.message);
  return (plans.data ?? []).map((p) => toTimplan(p, cells.data ?? [], events.data ?? []));
}

/**
 * Uttrycklig etablering av exempeldata i en disponibel lokal provmiljö. Anropas aldrig av laddare.
 * Ett första utkast per utbildning med den nationella fördelningen som utgångsvärde.
 */
export async function seedExampleTimplans(db: Client, educations: Education[]) {
  const organizerId = await currentOrganizer(db);
  for (const education of educations) {
    const row = await insertTimplan(db, organizerId, education.id, 1, education.basis, null);
    if (!row) continue;
    await writeCells(db, row.id, defaultCells(education), {});
    await writeTimplanEvent(db, row.id, 'rektor', 'Utkast påbörjat', `Utgår från nationell fördelning. Grund: ${education.basis}.`);
  }
}

async function insertTimplan(db: Client, organizerId: string, offeringId: string, version: number, basis: string, catalog: string | null) {
  const { data, error } = await db
    .from('timplans')
    .insert({ organizer_id: organizerId, offering_id: offeringId, version, basis, catalog_fetched: catalog, created_by: await actor(db) })
    .select('*')
    .single();
  if (error) fail('lägga upp timplan', error.message);
  return data;
}

async function writeCells(db: Client, timplanId: string, next: Record<string, number[]>, previous: Record<string, number[]>) {
  const changed = Object.entries(next).filter(
    ([rowId, hours]) => JSON.stringify(previous[rowId]) !== JSON.stringify(hours),
  );
  if (changed.length) {
    const { error } = await db
      .from('timplan_cells')
      .upsert(changed.map(([rowId, hours]) => ({ timplan_id: timplanId, row_id: rowId, hours })));
    if (error) fail('spara timplanens timmar', error.message);
  }
  const removed = Object.keys(previous).filter((rowId) => !(rowId in next));
  if (removed.length) {
    const { error } = await db.from('timplan_cells').delete().eq('timplan_id', timplanId).in('row_id', removed);
    if (error) fail('rensa timplanens timmar', error.message);
  }
}

async function writeTimplanEvent(db: Client, timplanId: string, role: 'rektor' | 'huvudman', action: string, comment: string) {
  const { error } = await db
    .from('timplan_events')
    .insert({ timplan_id: timplanId, actor: await actor(db), actor_role: role, action, comment });
  if (error) fail('spara timplanens historik', error.message);
}

/** Skriver skillnaden mellan två tillstånd och lämnar databasen som modellen. */
export async function persistTimplans(next: Timplan[], previous: Timplan[]) {
  const db = client();
  const organizerId = await currentOrganizer(db);
  const before = new Map(previous.map((p) => [p.id, p]));
  for (const plan of next) {
    const old = before.get(plan.id);
    if (!old) {
      const row = await insertTimplan(db, organizerId, plan.educationId, plan.version, plan.basis, plan.catalog || null);
      if (!row) continue;
      await writeCells(db, row.id, plan.cells, {});
      for (const h of [...plan.history].reverse()) await writeTimplanEvent(db, row.id, h.role, h.action, h.comment);
      continue;
    }
    if (old.status !== plan.status || old.decidedOn !== plan.decidedOn || old.basis !== plan.basis) {
      const { error } = await db
        .from('timplans')
        .update({ status: timplanStatusOut(plan.status), decided_on: plan.decidedOn ?? null, basis: plan.basis })
        .eq('id', plan.id);
      if (error) fail('spara timplanens status', error.message);
    }
    await writeCells(db, plan.id, plan.cells, old.cells);
    const seen = new Set(old.history.map((h) => h.id));
    for (const h of [...plan.history].reverse())
      if (!seen.has(h.id)) await writeTimplanEvent(db, plan.id, h.role, h.action, h.comment);
  }
  const after = new Set(next.map((p) => p.id));
  for (const plan of previous)
    if (!after.has(plan.id)) {
      const { error } = await db.from('timplans').delete().eq('id', plan.id);
      if (error) fail('ta bort timplan', error.message);
    }
}

// ---------------------------------------------------------------- läsår

function toSchoolYear(
  row: Row<'school_years'>,
  days: Row<'school_year_days'>[],
  groupDays: Row<'school_year_group_days'>[],
  shortWeeks: Row<'school_year_short_weeks'>[],
  events: Row<'school_year_events'>[],
): SchoolYear {
  const groupExceptions: Record<string, Record<string, GroupException>> = {};
  for (const g of groupDays.filter((g) => g.school_year_id === row.id)) {
    groupExceptions[g.group_key] ??= {};
    groupExceptions[g.group_key][g.day] = g.note
      ? { cause: g.cause as Cause, note: g.note }
      : { cause: g.cause as Cause };
  }
  return {
    id: row.id,
    unitId: row.unit_id,
    startYear: row.start_year,
    label: `Läsåret ${row.start_year}/${String(row.start_year + 1).slice(2)}`,
    ht: { start: row.ht_start, end: row.ht_end },
    vt: { start: row.vt_start, end: row.vt_end },
    exceptions: Object.fromEntries(
      days
        .filter((d) => d.school_year_id === row.id)
        .map((d): [string, Exception] => [d.day, d.note ? { kind: d.kind, note: d.note } : { kind: d.kind }]),
    ),
    groupExceptions,
    shortWeeks: Object.fromEntries(
      shortWeeks
        .filter((w) => w.school_year_id === row.id)
        .map((w): [string, ShortWeek] => [w.group_key, { weekday: w.weekday, reason: w.reason, columnId: w.column_id }]),
    ),
    status: yearStatusIn(row.status),
    history: events
      .filter((e) => e.school_year_id === row.id)
      .map(
        (e): LasarEntry => ({
          id: e.id,
          time: clockOf(e.created_at),
          role: e.actor_role === 'huvudman' ? 'huvudman' : 'rektor',
          action: e.action,
          comment: e.comment,
        }),
      ),
    decidedOn: row.decided_on ?? undefined,
  };
}

/** Läser läsåren för en skolenhet. Ren läsning: saknas läsår ges tom lista. */
export async function loadSchoolYears(unitId: string, _schoolTypes: string[]): Promise<SchoolYear[]> {
  const db = client();
  const years = await db.from('school_years').select('*').eq('unit_id', unitId).order('start_year');
  if (years.error) fail('läsa läsår', years.error.message);
  const ids = (years.data ?? []).map((y) => y.id);
  if (!ids.length) return [];
  const [days, groupDays, shortWeeks, events] = await Promise.all([
    db.from('school_year_days').select('*').in('school_year_id', ids),
    db.from('school_year_group_days').select('*').in('school_year_id', ids),
    db.from('school_year_short_weeks').select('*').in('school_year_id', ids),
    db.from('school_year_events').select('*').in('school_year_id', ids).order('created_at', { ascending: false }),
  ]);
  if (days.error) fail('läsa läsårets dagar', days.error.message);
  if (groupDays.error) fail('läsa gruppernas lärotider', groupDays.error.message);
  if (shortWeeks.error) fail('läsa förkortade veckor', shortWeeks.error.message);
  if (events.error) fail('läsa läsårets historik', events.error.message);
  return (years.data ?? []).map((y) =>
    toSchoolYear(y, days.data ?? [], groupDays.data ?? [], shortWeeks.data ?? [], events.data ?? []),
  );
}

/** Uttrycklig etablering av exempeldata i en disponibel lokal provmiljö. Anropas aldrig av laddare. */
export async function seedExampleSchoolYears(db: Client, unitId: string, schoolTypes: string[]) {
  const organizerId = await currentOrganizer(db);
  for (const year of createLasarState(unitId, schoolTypes).years) {
    const row = await insertSchoolYear(db, organizerId, unitId, year);
    if (!row) continue;
    await writeYearDays(db, row.id, year.exceptions, {});
    await writeGroupDays(db, row.id, year.groupExceptions, {});
    for (const h of [...year.history].reverse()) await writeYearEvent(db, row.id, h.role, h.action, h.comment);
    if (year.status !== 'utkast') {
      const { error } = await db
        .from('school_years')
        .update({ status: yearStatusOut(year.status), decided_on: year.decidedOn ?? null })
        .eq('id', row.id);
      if (error) fail('fastställa exempelläsåret', error.message);
    }
  }
}

async function insertSchoolYear(db: Client, organizerId: string, unitId: string, year: SchoolYear) {
  const { data, error } = await db
    .from('school_years')
    .insert({
      organizer_id: organizerId,
      unit_id: unitId,
      start_year: year.startYear,
      ht_start: year.ht.start,
      ht_end: year.ht.end,
      vt_start: year.vt.start,
      vt_end: year.vt.end,
      created_by: await actor(db),
    })
    .select('*')
    .single();
  if (error) fail('lägga upp läsår', error.message);
  return data;
}

async function writeYearDays(db: Client, yearId: string, next: Record<string, Exception>, previous: Record<string, Exception>) {
  const changed = Object.entries(next).filter(([day, e]) => {
    const old = previous[day];
    return !old || old.kind !== e.kind || old.note !== e.note;
  });
  if (changed.length) {
    const { error } = await db
      .from('school_year_days')
      .upsert(changed.map(([day, e]) => ({ school_year_id: yearId, day, kind: e.kind, note: e.note ?? null })));
    if (error) fail('spara läsårets dagar', error.message);
  }
  const removed = Object.keys(previous).filter((day) => !(day in next));
  if (removed.length) {
    const { error } = await db.from('school_year_days').delete().eq('school_year_id', yearId).in('day', removed);
    if (error) fail('ta bort lov- eller studiedag', error.message);
  }
}

async function writeGroupDays(
  db: Client,
  yearId: string,
  next: SchoolYear['groupExceptions'],
  previous: SchoolYear['groupExceptions'],
) {
  const flat = (m: SchoolYear['groupExceptions']) =>
    new Map(Object.entries(m).flatMap(([key, byDate]) => Object.entries(byDate).map(([day, e]) => [`${key}|${day}`, { key, day, e }])));
  const a = flat(next);
  const b = flat(previous);
  const changed = [...a.values()].filter(({ key, day, e }) => {
    const old = b.get(`${key}|${day}`)?.e;
    return !old || old.cause !== e.cause || old.note !== e.note;
  });
  if (changed.length) {
    const { error } = await db
      .from('school_year_group_days')
      .upsert(changed.map(({ key, day, e }) => ({ school_year_id: yearId, group_key: key, day, cause: e.cause, note: e.note ?? null })));
    if (error) fail('spara gruppens lärotider', error.message);
  }
  for (const [id, { key, day }] of b) {
    if (a.has(id)) continue;
    const { error } = await db
      .from('school_year_group_days')
      .delete()
      .eq('school_year_id', yearId)
      .eq('group_key', key)
      .eq('day', day);
    if (error) fail('ta bort gruppens avvikelse', error.message);
  }
}

async function writeShortWeeks(
  db: Client,
  yearId: string,
  next: Record<string, ShortWeek>,
  previous: Record<string, ShortWeek>,
) {
  for (const [key, week] of Object.entries(next)) {
    const old = previous[key];
    if (old && old.weekday === week.weekday && old.reason === week.reason) continue;
    const { error } = await db
      .from('school_year_short_weeks')
      .upsert({ school_year_id: yearId, group_key: key, column_id: week.columnId, weekday: week.weekday, reason: week.reason });
    if (error) fail('spara förkortad vecka', error.message);
  }
  for (const key of Object.keys(previous)) {
    if (key in next) continue;
    const { error } = await db.from('school_year_short_weeks').delete().eq('school_year_id', yearId).eq('group_key', key);
    if (error) fail('ta bort förkortad vecka', error.message);
  }
}

async function writeYearEvent(db: Client, yearId: string, role: 'rektor' | 'huvudman', action: string, comment: string) {
  const { error } = await db
    .from('school_year_events')
    .insert({ school_year_id: yearId, actor: await actor(db), actor_role: role, action, comment });
  if (error) fail('spara läsårets historik', error.message);
}

/** Skriver skillnaden mellan två tillstånd och lämnar databasen som modellen. */
export async function persistSchoolYears(
  next: SchoolYear[],
  previous: SchoolYear[],
  unitId: string,
) {
  const db = client();
  const organizerId = await currentOrganizer(db);
  const before = new Map(previous.map((y) => [y.id, y]));
  for (const year of next) {
    const old = before.get(year.id);
    if (!old) {
      const row = await insertSchoolYear(db, organizerId, unitId, year);
      if (!row) continue;
      await writeYearDays(db, row.id, year.exceptions, {});
      await writeGroupDays(db, row.id, year.groupExceptions, {});
      await writeShortWeeks(db, row.id, year.shortWeeks, {});
      for (const h of [...year.history].reverse()) await writeYearEvent(db, row.id, h.role, h.action, h.comment);
      continue;
    }
    // Ett fastställt läsår öppnas först, sedan ändras dagarna. Statusen skrivs
    // därför före innehållet, och tillbaka i motsatt ordning vid fastställande.
    const opening = old.status === 'fastställd' && year.status !== 'fastställd';
    const writeStatus = async () => {
      if (old.status === year.status && old.decidedOn === year.decidedOn) return;
      const { error } = await db
        .from('school_years')
        .update({ status: yearStatusOut(year.status), decided_on: year.decidedOn ?? null })
        .eq('id', year.id);
      if (error) fail('spara läsårets status', error.message);
    };
    if (opening) await writeStatus();
    const terms =
      old.ht.start !== year.ht.start ||
      old.ht.end !== year.ht.end ||
      old.vt.start !== year.vt.start ||
      old.vt.end !== year.vt.end;
    if (terms) {
      const { error } = await db
        .from('school_years')
        .update({ ht_start: year.ht.start, ht_end: year.ht.end, vt_start: year.vt.start, vt_end: year.vt.end })
        .eq('id', year.id);
      if (error) fail('spara terminernas datum', error.message);
    }
    await writeYearDays(db, year.id, year.exceptions, old.exceptions);
    await writeGroupDays(db, year.id, year.groupExceptions, old.groupExceptions);
    await writeShortWeeks(db, year.id, year.shortWeeks, old.shortWeeks);
    if (!opening) await writeStatus();
    const seen = new Set(old.history.map((h) => h.id));
    for (const h of [...year.history].reverse())
      if (!seen.has(h.id)) await writeYearEvent(db, year.id, h.role, h.action, h.comment);
  }
  const after = new Set(next.map((y) => y.id));
  for (const year of previous)
    if (!after.has(year.id)) {
      const { error } = await db.from('school_years').delete().eq('id', year.id);
      if (error) fail('ta bort läsår', error.message);
    }
}

// ---------------------------------------------------------------- gemensamt

async function currentOrganizer(db: Client): Promise<string> {
  const { data, error } = await db.rpc('current_organizer_id');
  if (error) fail('läsa huvudmannen', error.message);
  if (!data) throw new Error('Användaren är inte knuten till någon huvudman.');
  return data;
}

