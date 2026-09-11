import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  easterSunday,
  publicHolidays,
  isoWeek,
  mondayOfWeek,
  weekday,
  proposeSchoolYear,
  summarize,
  dayInfo,
  weekRows,
  createLasarState,
  setDay,
  setDays,
  setNotes,
  editableRange,
  setRange,
  setTerm,
  setNote,
  submit,
  approve,
  requestChanges,
  withdraw,
  reopen,
  addSchoolYear,
  requiredWeeklyMinutes,
  plannedHours,
  minSchoolDays,
  maxStudyDays,
  studentGroups,
  groupSummary,
  setGroupDays,
  clearGroupDays,
  setShortWeek,
  clearShortWeek,
  allIssues,
  hoursPerSchoolDay,
} from './lasar-model.ts';
import { createTimplanState } from './timplan-model.ts';
import { createAdminState, deriveClasses } from './admin-model.ts';

const errors = (sy, types = ['GR', 'GY']) => summarize(sy, types).issues.filter((i) => i.level === 'error');

test('påskdagen och de rörliga helgdagarna räknas rätt', () => {
  assert.equal(easterSunday(2024), '2024-03-31');
  assert.equal(easterSunday(2025), '2025-04-20');
  assert.equal(easterSunday(2026), '2026-04-05');
  assert.equal(easterSunday(2027), '2027-03-28');
  const h = Object.fromEntries(publicHolidays(2027).map((x) => [x.name, x.date]));
  assert.equal(h['Långfredagen'], '2027-03-26');
  assert.equal(h['Annandag påsk'], '2027-03-29');
  assert.equal(h['Kristi himmelsfärdsdag'], '2027-05-06');
  assert.equal(h['Midsommardagen'], '2027-06-26');
  assert.equal(h['Alla helgons dag'], '2027-11-06');
  assert.equal(weekday(h['Midsommardagen']), 5);
  assert.equal(weekday(h['Kristi himmelsfärdsdag']), 3);
});

test('ISO-veckor', () => {
  assert.deepEqual(isoWeek('2026-08-17'), { week: 34, year: 2026 });
  assert.deepEqual(isoWeek('2027-01-01'), { week: 53, year: 2026 });
  assert.deepEqual(isoWeek('2027-01-04'), { week: 1, year: 2027 });
  assert.equal(mondayOfWeek(2026, 34), '2026-08-17');
  assert.equal(mondayOfWeek(2027, 2), '2027-01-11');
  assert.equal(mondayOfWeek(2027, 9), '2027-03-01');
});

test('förslaget för 2026/27 håller författningarnas ramar', () => {
  const sy = proposeSchoolYear(2026, 'u', ['GR', 'GY']);
  assert.equal(sy.ht.start, '2026-08-17');
  assert.equal(sy.ht.end, '2026-12-18');
  assert.equal(sy.vt.start, '2027-01-11');
  assert.equal(sy.vt.end, '2027-06-11');
  const s = summarize(sy, ['GR', 'GY']);
  assert.equal(s.weeks.total, 40);
  assert.ok(s.skoldagar >= minSchoolDays, `${s.skoldagar} skoldagar`);
  assert.ok(s.lovdagar >= 12);
  assert.equal(s.studiedagar, 0);
  assert.equal(s.studiedagarKvar, maxStudyDays);
  // Helgdagar på vardagar inom läsåret 2026/27: juldagen (fre), nyårsdagen (fre),
  // trettondedagen (ons), långfredag, annandag påsk, Kristi himmelsfärdsdag.
  assert.deepEqual(
    s.helgdagar.map((h) => h.name),
    ['Juldagen', 'Nyårsdagen', 'Trettondedag jul', 'Långfredagen', 'Annandag påsk', 'Kristi himmelsfärdsdag'],
  );
  assert.deepEqual(errors(sy), []);
  assert.equal(dayInfo(sy, '2026-10-26').status, 'lovdag');
  assert.equal(dayInfo(sy, '2026-10-26').note, 'Höstlov');
  assert.equal(dayInfo(sy, '2027-05-07').note, 'Klämdag efter Kristi himmelsfärdsdag');
  assert.equal(dayInfo(sy, '2026-12-28').part, 'jullov');
  assert.equal(dayInfo(sy, '2026-12-28').status, 'lovdag');
  assert.equal(dayInfo(sy, '2026-12-28').editable, false);
  assert.equal(dayInfo(sy, '2026-07-01').status, 'utanför');
  assert.equal(dayInfo(sy, '2026-08-22').status, 'helg');
  assert.equal(s.perWeekday.reduce((a, b) => a + b, 0), s.skoldagar);
});

test('förslaget når 40 veckor för gymnasieskolan även andra år', () => {
  for (const year of [2024, 2025, 2027, 2028, 2029, 2030]) {
    const sy = proposeSchoolYear(year, 'u', ['GY']);
    const s = summarize(sy, ['GY']);
    assert.equal(s.weeks.total, 40, `${year}: ${s.weeks.total} veckor`);
    assert.equal(sy.ht.start.slice(5, 7), '08');
    assert.equal(sy.vt.end.slice(5, 7), '06');
    assert.ok(s.skoldagar >= minSchoolDays, `${year}: ${s.skoldagar} skoldagar`);
  }
});

test('förslaget är rent: inga avvikelser och inga varningar att åtgärda', () => {
  for (const year of [2026, 2027, 2028, 2029, 2030]) {
    const s = summarize(proposeSchoolYear(year, 'u', ['GR', 'GY']), ['GR', 'GY']);
    assert.deepEqual(s.issues, [], `${year}: ${s.issues.map((i) => i.text).join(' ')}`);
  }
});

test('en termin utan lov varnar för ojämn fördelning över läsåret', () => {
  const sy = proposeSchoolYear(2027, 'u', ['GR']);
  const bare = { ...sy, exceptions: {} };
  const texts = summarize(bare, ['GR']).issues.map((i) => i.text).join(' ');
  assert.match(texts, /skoldagar i följd utan lov/);
  assert.match(texts, /mer än 12 veckor/);
  // Med bara höstlovet kvar är hösten under gränsen och ingen varning ges.
  const autumn = { ...sy, exceptions: Object.fromEntries(Object.entries(sy.exceptions).filter(([d]) => d < '2027-12-01')) };
  assert.equal(summarize(autumn, ['GR']).issues.some((i) => /i följd utan lov/.test(i.text)), true);
});

test('veckoraderna täcker augusti–december och januari–juni', () => {
  const sy = proposeSchoolYear(2026, 'u');
  const ht = weekRows(sy, 'ht');
  const vt = weekRows(sy, 'vt');
  assert.equal(ht[0].days[0].date, '2026-07-27');
  assert.equal(ht.at(-1).days[6].date >= '2026-12-31', true);
  assert.equal(vt[0].days[0].date, '2026-12-28');
  assert.equal(ht.find((r) => r.week === 34).schoolDays, 5);
  assert.equal(ht.find((r) => r.week === 44).schoolDays, 0);
  assert.equal(ht.filter((r) => r.monthLabel).length, 6);
  for (const row of [...ht, ...vt]) assert.equal(row.days.length, 7);
});

test('rektorn lägger ut studiedagar; helgdagar, helger och jullov kan inte ändras', () => {
  let state = createLasarState();
  const next = state.years.find((y) => y.startYear === 2027);
  state = setDay(state, next.id, '2027-09-29', 'studiedag', 'Planering');
  assert.equal(dayInfo(state.years[1], '2027-09-29').status, 'studiedag');
  assert.throws(() => setDay(state, next.id, '2028-03-25', 'skoldag'), /Skolarbetet förläggs måndag–fredag|helg/);
  assert.throws(() => setDay(state, next.id, '2028-04-14', 'skoldag'), /Långfredagen|helg/i);
  assert.throws(() => setDay(state, next.id, '2027-12-27', 'studiedag'), /mellan terminerna/);
  assert.throws(() => setDay(state, next.id, '2027-07-01', 'studiedag'), /utanför läsåret/);
  // Ett fastställt läsår kan inte ändras av rektorn.
  assert.throws(() => setDay(state, '2026/27', '2026-10-05', 'lovdag'), /utkast eller en återsänd/);
  // Sex studiedagar är för många.
  for (const d of ['2027-10-04', '2027-10-05', '2027-10-06', '2027-10-07', '2027-10-08'])
    state = setDay(state, next.id, d, 'studiedag', 'x');
  assert.match(errors(state.years[1]).map((i) => i.text).join(' '), /högst 5/);
  state = setNote(state, next.id, '2027-10-08', 'Fortbildning');
  assert.equal(state.years[1].exceptions['2027-10-08'].note, 'Fortbildning');
});

test('intervall sätts på vardagar inom terminen och räknas om', () => {
  let state = createLasarState();
  const id = '2027/28';
  const before = summarize(state.years[1]).skoldagar;
  state = setRange(state, id, '2027-11-15', '2027-11-21', 'lovdag', 'Extra lov');
  const after = summarize(state.years[1]);
  assert.equal(before - after.skoldagar, 5);
  assert.equal(dayInfo(state.years[1], '2027-11-20').status, 'helg');
  assert.throws(() => setRange(state, id, '2027-12-25', '2027-12-26', 'lovdag'), /Inga vardagar/);
  state = setRange(state, id, '2027-11-15', '2027-11-19', 'skoldag');
  assert.equal(summarize(state.years[1]).skoldagar, before);
});

test('flera markerade dagar ändras tillsammans och låsta hoppas över', () => {
  let state = createLasarState();
  const id = '2027/28';
  const före = summarize(state.years[1]).skoldagar;
  // En blandad markering: två skoldagar, en helg, en helgdag och en dag mellan terminerna.
  const markerade = ['2027-11-15', '2027-11-17', '2027-11-20', '2028-01-06', '2027-12-27'];
  state = setDays(state, id, markerade, 'lovdag', 'Extra lov');
  const efter = summarize(state.years[1]);
  assert.equal(före - efter.skoldagar, 2);
  assert.equal(dayInfo(state.years[1], '2027-11-15').note, 'Extra lov');
  assert.equal(dayInfo(state.years[1], '2027-11-20').status, 'helg');
  assert.equal(dayInfo(state.years[1], '2028-01-06').status, 'helgdag');
  assert.equal(state.years[1].exceptions['2027-12-27'], undefined);
  // En helgdag som infaller på en lördag läses som helg, inte som helgdag.
  assert.equal(dayInfo(state.years[1], '2027-12-25').status, 'helg');
  // En markering med bara låsta dagar går inte att ändra.
  assert.throws(() => setDays(state, id, ['2027-11-20', '2028-01-06'], 'lovdag'), /markerade dagarna kan ändras/);
  // Tillbaka till skoldagar.
  state = setDays(state, id, markerade, 'skoldag');
  assert.equal(summarize(state.years[1]).skoldagar, före);
});

test('gemensam anteckning sätts på markerade lov- och studiedagar', () => {
  let state = createLasarState();
  const id = '2027/28';
  const vecka = editableRange(state.years[1], '2027-11-15', '2027-11-21');
  assert.deepEqual(vecka, ['2027-11-15', '2027-11-16', '2027-11-17', '2027-11-18', '2027-11-19']);
  state = setDays(state, id, vecka, 'lovdag');
  state = setNotes(state, id, vecka, 'Höstlov vecka 46');
  for (const d of vecka) assert.equal(dayInfo(state.years[1], d).note, 'Höstlov vecka 46');
  // Tom text tar bort anteckningen, och skoldagar har ingen att sätta.
  state = setNotes(state, id, vecka, '   ');
  assert.equal(dayInfo(state.years[1], vecka[0]).note, undefined);
  assert.throws(() => setNotes(state, id, ['2027-09-07'], 'x'), /lov- och studiedagar/);
});

test('markering över helger och terminsgränser ger bara ändringsbara dagar', () => {
  const state = createLasarState();
  const sy = state.years[1];
  // Från fredag före jullovet till måndag efter: bara vardagar inom terminerna.
  const över = editableRange(sy, '2027-12-15', '2028-01-12');
  assert.ok(över.every((d) => dayInfo(sy, d).editable));
  assert.ok(över.includes('2027-12-17'));
  assert.ok(!över.includes('2027-12-27'));
  assert.ok(!över.includes('2028-01-06'));
  assert.ok(över.includes('2028-01-12'));
  assert.deepEqual(editableRange(sy, '2027-12-25', '2027-12-26'), []);
});

test('läsårets kontroller: start i augusti, slut i juni, 178 dagar, 40 veckor', () => {
  let state = createLasarState();
  const id = '2027/28';
  state = setTerm(state, id, 'ht', 'start', '2027-09-06');
  assert.match(errors(state.years[1]).map((i) => i.text).join(' '), /börja i augusti/);
  state = setTerm(state, id, 'ht', 'start', '2027-08-23');
  state = setTerm(state, id, 'vt', 'end', '2028-05-26');
  const texts = errors(state.years[1]).map((i) => i.text).join(' ');
  assert.match(texts, /sluta i juni/);
  assert.match(texts, /skoldagar; minst 178/);
  assert.throws(() => setTerm(state, id, 'vt', 'start', '2027-12-01'), /ordning/);
  assert.throws(() => setTerm(state, id, 'ht', 'start', '2026-08-23'), /ligger 2027–2028/);
  // Förlängd hösttermin gör att höstlovet ligger kvar men ett lov efter terminens slut faller bort.
  state = setTerm(state, id, 'vt', 'end', '2028-06-09');
  state = setDay(state, id, '2028-06-09', 'lovdag', 'Sista dagen');
  state = setTerm(state, id, 'vt', 'end', '2028-06-08');
  assert.equal(state.years[1].exceptions['2028-06-09'], undefined);
});

test('jämn fördelning över veckodagarna varnas', () => {
  let state = createLasarState();
  const id = '2027/28';
  for (const d of ['2027-09-06', '2027-09-13', '2027-09-20', '2027-09-27'])
    state = setDay(state, id, d, 'studiedag', 'Måndag');
  const s = summarize(state.years[1]);
  assert.ok(s.perWeekday[0] < s.perWeekday[2]);
  assert.match(s.issues.map((i) => i.text).join(' '), /ojämnt fördelade över veckan/);
});

test('flödet rektor → huvudman → fastställd, återsänd och återöppnad', () => {
  let state = createLasarState();
  const id = '2027/28';
  const types = ['GR', 'GY'];
  assert.throws(() => submit(state, id, '', types), /Beskriv/);
  state = submit(state, id, 'Förslag för 2027/28.', types);
  assert.equal(state.years[1].status, 'förslag');
  assert.throws(() => setDay(state, id, '2027-09-29', 'studiedag'), /utkast eller en återsänd/);
  state = withdraw(state, id);
  assert.equal(state.years[1].status, 'utkast');
  state = submit(state, id, 'Förslag igen.', types);
  assert.throws(() => approve(state, id, 'Beslut', types), /huvudmannen/);
  state = { ...state, role: 'huvudman' };
  state = requestChanges(state, id, 'Lägg sportlovet vecka 8.');
  assert.equal(state.years[1].status, 'återsänd');
  state = { ...state, role: 'rektor' };
  state = setRange(state, id, '2028-02-28', '2028-03-03', 'skoldag');
  state = setRange(state, id, '2028-02-21', '2028-02-25', 'lovdag', 'Sportlov');
  state = submit(state, id, 'Sportlov vecka 8.', types);
  state = { ...state, role: 'huvudman' };
  state = approve(state, id, 'Styrelsen 2026-09-05.', types);
  assert.equal(state.years[1].status, 'fastställd');
  assert.equal(state.years[1].decidedOn, '2026-09-05');
  state = reopen(state, id, 'Kommunens sportlov flyttas.');
  assert.equal(state.years[1].status, 'utkast');
  assert.equal(state.years[1].history[0].action, 'Öppnat för ändring');
});

test('ett förslag med avvikelser kan inte skickas eller fastställas', () => {
  let state = createLasarState();
  const id = '2027/28';
  state = setTerm(state, id, 'vt', 'end', '2028-05-05');
  assert.throws(() => submit(state, id, 'x', ['GR']), /avvikelse/);
});

test('nytt läsår skapas ur förslaget och bara en gång', () => {
  let state = createLasarState();
  state = addSchoolYear(state, '99999901', 2028, ['GR']);
  assert.equal(state.years.length, 3);
  assert.equal(state.years[2].id, '2028/29');
  assert.throws(() => addSchoolYear(state, '99999901', 2028, ['GR']), /finns redan/);
});

test('beräkningen av utlagd undervisning följer skoldagarna per veckodag', () => {
  const state = createLasarState();
  const s = summarize(state.years[0], ['GR', 'GY']);
  // 180 skoldagar motsvarar 36 skolveckor: 1 006 timmar kräver 1 677 minuter i veckan.
  assert.equal(s.skoldagar, 180);
  assert.equal(requiredWeeklyMinutes(1006, s.skoldagar), 1677);
  // Ett 60-minuterspass varje måndag ger lika många timmar som antalet måndagar.
  const monday = plannedHours(s, [{ day: 0, duration: 60 }]);
  assert.equal(monday.hours, s.perWeekday[0]);
  assert.equal(monday.occasions, s.perWeekday[0]);
  const two = plannedHours(s, [{ day: 0, duration: 60 }, { day: 2, duration: 90 }]);
  assert.equal(two.hours, Math.round((s.perWeekday[0] + s.perWeekday[2] * 1.5) * 10) / 10);
  assert.equal(two.perDay[2], Math.round(s.perWeekday[2] * 1.5 * 10) / 10);
});

// --- Avvikande lärotider per årskurs och klass ---

const demoGroups = () =>
  studentGroups(createTimplanState().educations, deriveClasses(createAdminState()), 2027);
const groupBy = (name) => demoGroups().find((g) => g.name === name && g.scope === 'klass');
const yearGroup = (columnId) => demoGroups().find((g) => g.scope === 'årskurs' && g.columnId === columnId && g.kind === 'grundskola');

test('grupperna härleds ur timplanens kolumner och elevregistrets klasser', () => {
  const groups = demoGroups();
  const åk = groups.filter((g) => g.scope === 'årskurs' && g.kind === 'grundskola');
  assert.deepEqual(åk.map((g) => g.columnId), ['ak1', 'ak2', 'ak3', 'ak4', 'ak5', 'ak6', 'ak7', 'ak8', 'ak9']);
  // Klassen hittar sin årskurs: 8A i grundskolan, SA26A som år 2 läsåret 2027/28.
  assert.equal(groupBy('8A').columnId, 'ak8');
  assert.equal(groupBy('8A').parentId, 'gr:ak8');
  assert.equal(groupBy('SA26A').columnId, 'ar2');
  assert.equal(groupBy('SA24A').columnId, undefined, 'kullen 2024 har lämnat gymnasiet 2027/28');
  assert.equal(groupBy('SA24A').parentId, undefined);
  assert.equal(groupBy('8A').pupils, 2);
  // Klasserna hittar rätt program även när utbildningarnas id kommer från en
  // annan källa än elevregistrets, till exempel en databas.
  const educations = createTimplanState().educations.map((e) => ({ ...e, id: `db-${e.id}` }));
  const other = studentGroups(educations, deriveClasses(createAdminState()), 2027);
  const ek = other.find((g) => g.name === 'EK26A');
  const sa = other.find((g) => g.name === 'SA26A');
  assert.equal(educations.find((e) => e.id === ek.educationId).programCode, 'EK25');
  assert.equal(educations.find((e) => e.id === sa.educationId).programCode, 'SA25');
  assert.equal(ek.columnId, 'ar2');
});

test('klassen ärver årskursens avvikelser men inte tvärtom', () => {
  let state = createLasarState();
  const id = '2027/28';
  const groups = demoGroups();
  const åk8 = yearGroup('ak8');
  const klass = groupBy('8A');
  state = setGroupDays(state, id, åk8, ['2027-09-15'], 'nationellt prov');
  state = setGroupDays(state, id, klass, ['2027-09-16'], 'friluftsdag');
  const sy = state.years[1];
  assert.equal(groupSummary(sy, klass, groups).fewer, 2, 'klassen saknar båda dagarna');
  assert.equal(groupSummary(sy, åk8, groups).fewer, 1, 'årskursen saknar bara sin egen');
  assert.equal(groupSummary(sy, yearGroup('ak7'), groups).fewer, 0, 'årskurs 7 berörs inte');
  // Klassens egen avvikelse går att ta bort utan att årskursens rörs.
  state = clearGroupDays(state, id, klass, ['2027-09-16']);
  assert.equal(groupSummary(state.years[1], klass, groups).fewer, 1);
  assert.throws(() => clearGroupDays(state, id, klass, ['2027-09-15']), /egen avvikelse för 8A/);
});

test('bara skolans skoldagar kan sakna undervisning för en grupp', () => {
  const state = createLasarState();
  const id = '2027/28';
  const klass = groupBy('8A');
  assert.throws(() => setGroupDays(state, id, klass, ['2027-11-01'], 'friluftsdag'), /bara skolans skoldagar/i);
  assert.throws(() => setGroupDays(state, id, klass, ['2027-11-20'], 'friluftsdag'), /bara skolans skoldagar/i);
  assert.throws(() => setGroupDays(state, id, klass, ['2027-09-15'], 'annat'), /orsaken är annat/);
});

test('fyra skoldagar i veckan bara för årskurs 1 eller 2 och med skäl', () => {
  let state = createLasarState();
  const id = '2027/28';
  const groups = demoGroups();
  assert.throws(() => setShortWeek(state, id, yearGroup('ak3'), 4, 'Skäl'), /årskurs 1 eller 2/);
  assert.throws(() => setShortWeek(state, id, groupBy('SA26A'), 4, 'Skäl'), /årskurs 1 eller 2/);
  assert.throws(() => setShortWeek(state, id, yearGroup('ak1'), 4, '  '), /särskilda skälen/);
  state = setShortWeek(state, id, yearGroup('ak1'), 4, 'Långa skoldagar för de yngsta eleverna');
  const s = groupSummary(state.years[1], yearGroup('ak1'), groups);
  assert.equal(s.perWeekday[4], 0, 'inga fredagar');
  assert.ok(s.days < minSchoolDays, `${s.days} dagar`);
  assert.equal(s.shortWeek.from, 'Åk 1');
  assert.match(s.issues.map((i) => i.text).join(' '), /undervisningsdagar mot skolans/);
  assert.deepEqual(s.issues.filter((i) => i.level === 'error'), []);
  state = clearShortWeek(state, id, yearGroup('ak1'));
  assert.equal(groupSummary(state.years[1], yearGroup('ak1'), groups).days, summarize(state.years[1]).skoldagar);
});

test('en grupps avvikelse utan angiven orsak stoppar beslutet', () => {
  let state = createLasarState();
  const id = '2027/28';
  const groups = demoGroups();
  const klass = groupBy('8A');
  state = setGroupDays(state, id, klass, ['2027-09-15'], 'annat', 'Tillfälligt');
  // Anteckningen tas bort direkt i tillståndet för att pröva kontrollen.
  state.years[1].groupExceptions[klass.id]['2027-09-15'] = { cause: 'annat' };
  assert.match(allIssues(state.years[1], ['GR'], groups).map((i) => i.text).join(' '), /utan angiven orsak/);
  assert.throws(() => submit(state, id, 'Förslag', ['GR'], groups), /avvikelse/);
  // Utan grupperna ser kontrollen bara skolans nivå.
  assert.doesNotThrow(() => submit(state, id, 'Förslag', ['GR']));
});

test('utlagd undervisning räknas på gruppens egna dagar', () => {
  let state = createLasarState();
  const id = '2027/28';
  const groups = demoGroups();
  const åk1 = yearGroup('ak1');
  state = setShortWeek(state, id, åk1, 4, 'Särskilda skäl');
  const s = groupSummary(state.years[1], åk1, groups);
  const skolan = summarize(state.years[1]);
  // Ett fredagspass ger inga timmar alls för en grupp som är ledig på fredagar.
  assert.equal(plannedHours(s, [{ day: 4, duration: 60 }]).hours, 0);
  assert.ok(plannedHours(skolan, [{ day: 4, duration: 60 }]).hours > 0);
  // Samma timplan på färre dagar kräver längre dagar.
  assert.ok(hoursPerSchoolDay(630, s.days) > hoursPerSchoolDay(630, skolan.skoldagar));
});
