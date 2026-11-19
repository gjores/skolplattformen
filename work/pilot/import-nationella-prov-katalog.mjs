import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { NATIONELLA_PROV_KALLA, parseNationellaProvKatalog } from '../../web/lib/nationella-prov.ts';
import { findSubject } from '../../web/lib/syllabus.ts';

const HEADERS = ['Ämne och nivå/kurs', 'Delprov', 'Vecka', 'Datum', 'Tidsåtgång'];
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const PROVSTART = 9 * 60;
const extractor = fileURLToPath(new URL('./extract-nationella-prov-tabeller.py', import.meta.url));
const text = value => value.normalize('NFKC').replace(/\s+/gu, ' ').trim();
const subjectKey = value => text(value).toLocaleLowerCase('sv-SE')
  .replace(/ *[-–—] */gu, '–').replace(/ *([/,]) */gu, '$1');

// Kopplingen till styrdokumenten granskas för varje källbeteckning. Ett okänt ämne
// avbryter importen så att provet aldrig föreslås för fel nivå.
const groups = new Map([
  ['Engelska nivå 1', ['engelska1', 'Engelska nivå 1', [['ENGE', 'ENGE1000X', 'Engelska nivå 1']]]],
  ['Engelska nivå 2', ['engelska2', 'Engelska nivå 2', [['ENGE', 'ENGE2000X', 'Engelska nivå 2']]]],
  ['Matematik nivå 1a, 1b, 1c', ['matematik1', 'Matematik nivå 1a, 1b, 1c', [
    ['MATE', 'MATE1A00X', 'Matematik nivå 1a'], ['MATE', 'MATE1B00X', 'Matematik nivå 1b'], ['MATE', 'MATE1C00X', 'Matematik nivå 1c'],
  ]]],
  ['Matematik nivå 2a, 2b, 2c', ['matematik2', 'Matematik nivå 2a, 2b, 2c', [
    ['MATE', 'MATE2A00X', 'Matematik nivå 2a'], ['MATE', 'MATE2B00X', 'Matematik nivå 2b'], ['MATE', 'MATE2C00X', 'Matematik nivå 2c'],
  ]]],
  ['Matematik – fortsättning nivå 1b, 1c', ['matematik-forts1', 'Matematik – fortsättning nivå 1b, 1c', [
    ['MATO', 'MATO1B00X', 'Matematik – fortsättning nivå 1b'], ['MATO', 'MATO1C00X', 'Matematik – fortsättning nivå 1c'],
  ]]],
  ['Matematik – fortsättning nivå 2', ['matematik-forts2', 'Matematik – fortsättning nivå 2', [
    ['MATO', 'MATO2000X', 'Matematik – fortsättning nivå 2'],
  ]]],
  ['Svenska nivå 1/svenska som andraspråk nivå 1', ['svenska1', 'Svenska / svenska som andraspråk nivå 1', [
    ['SVEN', 'SVEN1000X', 'Svenska nivå 1'], ['SVEA', 'SVEA1000X', 'Svenska som andraspråk nivå 1'],
  ]]],
  ['Svenska 3/svenska som andraspråk 3', ['svenska3', 'Svenska 3 / svenska som andraspråk 3', [
    ['SVE', 'SVESVE03', 'Svenska 3'], ['SVA', 'SVASVA03', 'Svenska som andraspråk 3'],
  ]]],
].map(([label, [id, namn, codes]]) => [subjectKey(label), { id, namn,
  nivaer: codes.map(([amne, niva, namn]) => {
    assert.ok(findSubject(amne)?.items.some(item => item.code === niva), 'Källans ämnesnivå saknas i styrdokumentskatalogen.');
    return { amne, niva, namn };
  }),
}]));

const PARTS = new Map([['A', 'a'], ['B', 'b'], ['C', 'c'], ['A+B+C', 'abc']]);
const MONTHS = [
  ['jan', 'januari'], ['feb', 'februari'], ['mar', 'mars'], ['apr', 'april'], ['maj'], ['jun', 'juni'],
  ['jul', 'juli'], ['aug', 'augusti'], ['sep', 'sept', 'september'], ['okt', 'oktober'], ['nov', 'november'], ['dec', 'december'],
];
const WEEKDAYS = [[], ['mån', 'måndag'], ['tis', 'tisdag'], ['ons', 'onsdag'], ['tor', 'tors', 'torsdag'], ['fre', 'fredag']];
const iso = day => day.toISOString().slice(0, 10);
const term = day => day.slice(5, 7) < '07' ? 'vt' : 'ht';
const start = entry => entry.tid.typ === 'fast' ? entry.tid.datum : entry.tid.fran;
const TIME_ERROR = 'Tidsåtgången i källtabellen kunde inte tolkas.';
// Skolverket anger ibland en rast utan längd. Lägg ett lokalt förslag i
// bokningsblocket och redovisa de minuterna separat.
const planeradeRaster = new Map([['rast', 10], ['kort rast', 10], ['längre rast', 20]]);

function parseYear(value) {
  const match = /^(\d{4})\s*\/\s*(\d{2}|\d{4})$/u.exec(value);
  if (!match) return null;
  const schoolYear = Number(match[1]);
  assert.ok(schoolYear >= 2000 && schoolYear <= 2100, 'Läsåret ligger utanför katalogens årtal.');
  assert.equal(match[2], String(schoolYear + 1).slice(-match[2].length), 'Ogiltigt årtal i tabellrubriken.');
  return schoolYear;
}

function monday(year, week) {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const firstMonday = 4 - (jan4.getUTCDay() + 6) % 7;
  const day = new Date(Date.UTC(year, 0, firstMonday + (week - 1) * 7));
  const thursday = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate() + 3));
  return thursday.getUTCFullYear() === year ? iso(day) : null;
}

function weekNumber(value) {
  assert.match(value, /^(?:0?[1-9]|[1-4]\d|5[0-3])$/u, 'Ogiltigt veckonummer i källtabellen.');
  return Number(value);
}

function inSchoolYear(day, schoolYear) {
  return day >= `${schoolYear}-07-01` && day <= `${schoolYear + 1}-06-30`;
}

function weekStart(schoolYear, value) {
  const week = weekNumber(value);
  const days = [monday(schoolYear, week), monday(schoolYear + 1, week)]
    .filter(day => day && inSchoolYear(day, schoolYear));
  assert.equal(days.length, 1, 'Provveckan kan inte entydigt kopplas till läsåret.');
  return days[0];
}

function fixedDate(schoolYear, value, publishedWeek) {
  const match = /^(\p{L}+)[.]? (\d{1,2}) (\p{L}+)[.]? (\d{4}) kl[.]? (\d{1,2})[.:](\d{2})$/iu.exec(value);
  assert.ok(match, 'Okänt format på provdatumet.');
  const [, weekday, dd, monthName, yyyy, hh, mm] = match;
  assert.ok(Number(hh) === 9 && mm === '00', 'Publicerad fast provstart måste stödjas innan import.');
  const month = MONTHS.findIndex(names => names.includes(monthName.toLocaleLowerCase('sv-SE')));
  assert.ok(month >= 0, 'Okänd månad i källtabellen.');
  const day = new Date(Date.UTC(Number(yyyy), month, Number(dd)));
  const result = iso(day);
  assert.ok(inSchoolYear(result, schoolYear) && day.getUTCMonth() === month && day.getUTCDate() === Number(dd), 'Ogiltigt provdatum.');
  assert.ok(WEEKDAYS[day.getUTCDay()]?.includes(weekday.toLocaleLowerCase('sv-SE')), 'Provdatum och veckodag skiljer sig.');
  const from = new Date(weekStart(schoolYear, publishedWeek));
  const to = new Date(from);
  to.setUTCDate(to.getUTCDate() + 6);
  assert.ok(result >= iso(from) && result <= iso(to), 'Provdatum och veckonummer skiljer sig.');
  return { typ: 'fast', datum: result };
}

function entryKey(entry) {
  return `${entry.group.id}-${entry.part}-${term(start(entry))}`;
}

function positiveMinutes(value) {
  const minutes = Number(value);
  assert.ok(Number.isInteger(minutes) && minutes > 0, TIME_ERROR);
  return minutes;
}

function commonTime(minutes, planeradRastMin = 0) {
  const minuter = Math.ceil(minutes / 5) * 5;
  assert.ok(minuter <= 1440 - PROVSTART, TIME_ERROR);
  return { typ: 'gemensam', minuter, ...(planeradRastMin > 0 && { planeradRastMin }) };
}

function parseTidsplan(value, tid, group, part) {
  if (tid.typ === 'period') {
    const oral = /^(?:cirka )?(\d{1,3}) min(?:uter)? per (elevpar|elev)(?: \+ (\d{1,3}) min(?:uter)? för enskild förberedelse under uppsikt)?$/iu.exec(value);
    assert.ok(oral, TIME_ERROR);
    return {
      typ: 'muntlig', minuterPerTillfalle: positiveMinutes(oral[1]),
      deltagarePerTillfalle: oral[2].toLowerCase() === 'elevpar' ? 2 : 1,
      ...(oral[3] && { forberedelseMin: positiveMinutes(oral[3]) }),
    };
  }

  const svenska = /^(\d{1,3}) min för elever som följer svenska 1 (\d{1,3}) min för elever som följer svenska som andraspråk 1$/iu.exec(value);
  if (svenska && group.id === 'svenska1' && part === 'b') {
    return commonTime(Math.max(positiveMinutes(svenska[1]), positiveMinutes(svenska[2])));
  }

  const englishB = part === 'b' && (group.id === 'engelska1' || group.id === 'engelska2');
  // Vårens engelska B har samma tidsblock som hösten, men en tabellrad
  // utelämnar ordet "min" efter det publicerade intervallet 5–10.
  const instructions = / \(exkl\. (?:totalt )?(\d{1,3})(?:[-–](\d{1,3}))? min(?: för)? instruktioner\)$/iu.exec(value)
    ?? (englishB ? / \(exkl\. (5)[-–](10) instruktioner\)$/iu.exec(value) : null);
  let minutes = instructions ? positiveMinutes(instructions[2] ?? instructions[1]) : 0;
  if (instructions) assert.ok(minutes >= positiveMinutes(instructions[1]), TIME_ERROR);
  const segments = (instructions ? value.slice(0, instructions.index) : value).split(' + ');
  let plannedBreakMinutes = 0;
  let timedBlock = false;
  for (const segment of segments) {
    const assumedBreak = planeradeRaster.get(segment.toLowerCase());
    if (assumedBreak !== undefined) {
      plannedBreakMinutes += assumedBreak;
      continue;
    }
    const measuredBreak = /^rast (?:ca )?(\d{1,3}) min$/iu.exec(segment);
    if (measuredBreak) {
      minutes += positiveMinutes(measuredBreak[1]);
      continue;
    }
    const block = /^(\d{1,3})(?: min(?: (?:genomgång av förberedelsematerial|skrivtid|utan räknare|med digitala verktyg|med enkel räknare))?)?$/iu.exec(segment);
    assert.ok(block && (segment.includes(' ') || segments.length > 1), TIME_ERROR);
    minutes += positiveMinutes(block[1]);
    timedBlock = true;
  }
  assert.ok(timedBlock, TIME_ERROR);
  return commonTime(minutes + plannedBreakMinutes, plannedBreakMinutes);
}

function parseRows(schoolYear, rows) {
  assert.ok(rows.length && rows.length <= 200, 'Provtabellen måste innehålla mellan 1 och 200 delprov.');
  const entries = [];
  for (const cols of rows) {
    assert.equal(cols.length, HEADERS.length, 'Provtabellen måste ha fem celler per rad.');
    const [subject, partLabel, week, dateLabel, tidsatgang] = cols;
    const group = groups.get(subjectKey(subject));
    const part = PARTS.get(partLabel.replaceAll(' ', ''));
    assert.ok(group && part, 'Okänt ämne, nivå eller delprov i källtabellen.');
    assert.ok(tidsatgang && !/\p{Cc}/u.test(tidsatgang), 'Ogiltig tidsåtgång i källtabellen.');
    const weekMatch = /^från vecka (\d{1,2})(, genomförs före delprov B och C)?$/iu.exec(dateLabel);
    let tid;
    if (weekMatch) {
      assert.match(week, /^[-–—]$/u, 'Periodprov har oväntat ifylld veckokolumn.');
      tid = { typ: 'period', fran: weekStart(schoolYear, weekMatch[1]) };
    } else if (/^genomförs efter delprov A$/iu.test(dateLabel)) {
      assert.match(week, /^[-–—]$/u, 'Periodprov har oväntat ifylld veckokolumn.');
      const previous = entries.at(-1);
      assert.ok(part === 'b' && previous?.group === group && previous.part === 'a' && previous.tid.typ === 'fast',
        'Delprov efter A saknar entydigt föregående delprov.');
      const duration = /^(\d+) min$/u.exec(previous.tidsatgang);
      assert.ok(duration, 'Sluttid för delprov A går inte att härleda från källan.');
      const earliest = PROVSTART + Number(duration[1]);
      assert.ok(earliest > PROVSTART && earliest < 1440, 'Ogiltig varaktighet för delprov A.');
      tid = { typ: 'period', fran: previous.tid.datum, tidigasteStartMin: earliest };
    } else {
      tid = fixedDate(schoolYear, dateLabel, week);
    }
    const tidsplan = parseTidsplan(tidsatgang, tid, group, part);
    entries.push({ group, part, tid, tidsatgang, tidsplan, foreBC: Boolean(weekMatch?.[2]) });
  }

  const byId = new Map(entries.map(entry => [entryKey(entry), entry]));
  assert.equal(byId.size, entries.length, 'Flera delprov fick samma identitet i samma termin.');
  return [...byId].sort(([a], [b]) => a.localeCompare(b, 'sv')).map(([id, entry]) => {
    const { group, part, tid, tidsatgang, tidsplan, foreBC } = entry;
    if (foreBC) {
      const suffix = term(tid.fran);
      const b = byId.get(`${group.id}-b-${suffix}`);
      const c = byId.get(`${group.id}-c-${suffix}`);
      assert.ok(part === 'a' && b?.tid.typ === 'fast' && c?.tid.typ === 'fast', 'Delprov A saknar fasta delprov B och C.');
      const till = [b.tid.datum, c.tid.datum].sort()[0];
      assert.ok(till >= tid.fran, 'Delprovsordningen strider mot provperiodens datum.');
      Object.assign(tid, { till, senasteSlutMin: PROVSTART });
    }
    // Bevara källans uttryckliga ordningsvillkor även i texten som läses i provväljaren.
    const anvisning = foreBC ? '. Genomförs före delprov B och C.'
      : tid.tidigasteStartMin === undefined ? '' : '. Genomförs efter delprov A.';
    const delprov = part === 'abc' ? 'Delprov A, B och C' : `Delprov ${part.toUpperCase()}`;
    assert.ok(tidsatgang.length + anvisning.length <= 500, 'Tidsåtgången i källtabellen är för lång.');
    return { id, namn: `${group.namn} · ${delprov}`, nivaer: group.nivaer, tid, tidsatgang: tidsatgang + anvisning, tidsplan };
  });
}

export function parseSkolverketsProvdatum(html) {
  assert.ok(Buffer.byteLength(html) <= MAX_HTML_BYTES, 'Svar från Skolverket är för stort.');
  const extracted = JSON.parse(execFileSync('python3', ['-I', extractor], { input: html, encoding: 'utf8',
    timeout: 10000, maxBuffer: MAX_HTML_BYTES, stdio: ['pipe', 'pipe', 'pipe'] }));
  const years = new Set(extracted.headings.map(text).filter(title => title.startsWith('Datum för läsåret '))
    .map(title => parseYear(title.slice('Datum för läsåret '.length))));
  assert.ok(!years.has(null), 'Okänd läsårsrubrik på källsidan.');
  const catalogues = new Map();
  for (const table of extracted.tables) {
    const caption = text(table.caption.join(''));
    const rows = table.rows.map(row => row.map(text));
    const hasProvHeaders = JSON.stringify(rows[0]) === JSON.stringify(HEADERS);
    if (!hasProvHeaders && !caption.startsWith('Läsåret ')) continue;
    const schoolYear = caption.startsWith('Läsåret ') && parseYear(caption.slice('Läsåret '.length));
    assert.ok(hasProvHeaders && schoolYear && !table.spans && !catalogues.has(schoolYear), 'Okänd eller upprepad provtabell för läsåret.');
    catalogues.set(schoolYear, parseRows(schoolYear, rows.slice(1)));
  }
  assert.ok(catalogues.size, 'Hittade inga publicerade provdatumstabeller för gymnasieskolan.');
  assert.ok([...years].every(year => catalogues.has(year)), 'En publicerad läsårsrubrik saknar en läsbar provtabell.');
  return [...catalogues].sort(([a], [b]) => a - b).map(([schoolYear, prov]) => ({ schoolYear, prov }));
}

export async function fetchSkolverketsProvdatum() {
  const response = await fetch(NATIONELLA_PROV_KALLA, { headers: { Accept: 'text/html' }, redirect: 'error',
    signal: AbortSignal.timeout(25000) });
  if (!response.ok || !response.headers.get('content-type')?.toLowerCase().includes('text/html') || !response.body) {
    await response.body?.cancel();
    throw new Error('Skolverket svarade utan den förväntade provdatumssidan.');
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of response.body) {
    size += chunk.byteLength;
    if (size > MAX_HTML_BYTES) throw new Error('Svar från Skolverket är för stort.');
    chunks.push(chunk);
  }
  return parseSkolverketsProvdatum(Buffer.concat(chunks));
}

export function provkatalogDigest(catalogues) {
  return createHash('sha256').update(JSON.stringify(catalogues)).digest('hex');
}

function validateCatalogues(catalogues, checkedDate) {
  for (const { schoolYear, prov } of catalogues) {
    parseNationellaProvKatalog({ revision: 1, kontrolleradDatum: checkedDate, prov }, schoolYear);
  }
}

export async function importeraProvkataloger(db, catalogues, checkedDate) {
  validateCatalogues(catalogues, checkedDate);
  return db.begin(async tx => {
    const results = [];
    for (const { schoolYear, prov } of catalogues) {
      const [row] = await tx`select * from public.nationella_prov_katalog_import(${schoolYear}::integer, ${tx.json(prov)}::jsonb, ${checkedDate}::date)`;
      assert.ok(Number.isInteger(row?.revision) && row.revision > 0 && typeof row.changed === 'boolean', 'Ovväntat svar från katalogimporten.');
      results.push({ schoolYear, revision: row.revision, changed: row.changed, antalProv: prov.length });
    }
    return results;
  });
}

async function main(args) {
  if (args.length === 1 && args[0] === '--help') {
    console.log('node work/pilot/import-nationella-prov-katalog.mjs [--apply --expect <sha256>]');
    return;
  }
  const apply = args.length === 3 && args[0] === '--apply' && args[1] === '--expect' && /^[0-9a-f]{64}$/u.test(args[2]);
  assert.ok(!args.length || apply, 'Använd --help eller --apply --expect med det granskade importunderlagets SHA256.');
  const catalogues = await fetchSkolverketsProvdatum();
  const digest = provkatalogDigest(catalogues);
  const checkedDate = new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Stockholm' });
  if (!apply) {
    validateCatalogues(catalogues, checkedDate);
    console.log(JSON.stringify({ mode: 'dry-run', source: NATIONELLA_PROV_KALLA, checkedDate, digest, catalogues }, null, 2));
    return;
  }
  assert.equal(digest, args[2], 'Källuppgifterna har ändrats. Gör en ny granskning före import.');
  const { assertTarget } = await import('./verify-target.mjs');
  const target = await assertTarget('protected');
  const endpoint = new URL(target.dbUrl);
  assert.equal(endpoint.hostname, '127.0.0.1', 'Import tillåts bara till det lokala skyddade provmålet.');
  const postgres = createRequire(new URL('../../web/package.json', import.meta.url))('postgres');
  const db = postgres(target.dbUrl, { max: 1, prepare: false, connect_timeout: 10 });
  try {
    const results = await importeraProvkataloger(db, catalogues, checkedDate);
    console.log(JSON.stringify({ mode: 'import', source: NATIONELLA_PROV_KALLA, checkedDate, digest, results }, null, 2));
  } finally {
    await db.end({ timeout: 5 });
  }
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main(process.argv.slice(2)).catch(error => {
    // Databas och nätfel kan innehålla intern konfiguration.
    console.error(error instanceof assert.AssertionError ? error.message : 'Importen avbröts när källan eller databasen lästes.');
    process.exitCode = 1;
  });
}
