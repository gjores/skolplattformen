// Kontroll av huvudmannadelen mot molnprojektet.
//
//   node --env-file=web/.env.local work/supabase/verify.mjs
//
// Går samma väg som appen: anonym exempelinloggning, laddning av
// huvudmannens grund (seedar exempeldata om databasen är tom) och därefter
// prövning av att radnivåskyddet och databasens invarianter stoppar det som
// ska stoppas. Egna skrivningar städas bort; seedad exempeldata blir kvar.

import { loadOrganisation, saveUnitFromRegistry, deleteUnit } from '../../web/lib/organisation-store.ts';
import { loadTimplans, persistTimplans, loadSchoolYears, persistSchoolYears } from '../../web/lib/planning-store.ts';
import { supabase } from '../../web/lib/supabase.ts';
import { currentPointPlan, unitOfferings } from '../../web/lib/organisation-model.ts';
import { deriveEducations, currentPlan as currentTimplan, openPlan as openTimplan, startRevision, setCell, submit as submitTimplan, approve as approveTimplan } from '../../web/lib/timplan-model.ts';
import { summarize, yearDays, addSchoolYear, setDays, setGroupDays, setShortWeek, submit as submitYear, approve as approveYear } from '../../web/lib/lasar-model.ts';

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error('Saknar NEXT_PUBLIC_SUPABASE_URL och NEXT_PUBLIC_SUPABASE_ANON_KEY. Kör med --env-file=web/.env.local');
  process.exit(1);
}

let failures = 0;
const check = (ok, label, detail = '') => {
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK ' : 'FEL'}  ${label.padEnd(50)} ${detail ?? ''}`);
};

console.log('Huvudmannadelen i Supabase — kontroll via anon-nyckeln\n');

const state = await loadOrganisation(20);
check(Boolean(state.organizer.name), 'huvudman läses efter exempelinloggning', `${state.organizer.name} (${state.organizer.type})`);
check(state.units.length > 0, 'skolenheter finns eller seedas', `${state.units.length} st: ${state.units.map((u) => `${u.name} (${u.code})`).join(', ')}`);
check(state.offerings.length > 0, 'utbildningar hör till rätt skolenhet', `${state.offerings.length} totalt, ${unitOfferings(state, state.units[0]?.id).length} vid ${state.units[0]?.name}`);
check(state.assignments.length > 0, 'uppdrag för rektor och lärare', state.assignments.map((a) => `${a.name}:${a.unitIds.length}`).join(' '));

const sa = state.offerings.find((o) => o.programCode === 'SA25');
check(Boolean(sa?.permits.length), 'tillstånd läses tillbaka', sa?.permits[0] && `${sa.permits[0].issuer} ${sa.permits[0].reference}`);
const decided = sa && currentPointPlan(sa);
check(decided?.specialization.length === 3, 'fastställd poängplan med programfördjupning', decided?.specialization.join(', '));
check(Boolean(decided?.history.length), 'poängplanens historik följer med', decided?.history[0]?.action);

const db = supabase();
const organizerId = (await db.from('organizers').select('id').single()).data.id;

// Databasens egna invarianter, oberoende av klientens kontroller.
const bad = await db.from('school_units').insert({ organizer_id: organizerId, code: '123', name: 'Fel kod', municipality_code: '0000' });
check(Boolean(bad.error), 'skolenhetskod måste vara åtta siffror', bad.error?.message.slice(0, 56));

const duplicate = await db.from('school_units').insert({ organizer_id: organizerId, code: state.units[0].code, name: 'Dubblett', municipality_code: '0000' });
check(duplicate.error?.code === '23505', 'samma skolenhetskod kan inte läggas upp två gånger', duplicate.error?.code);

const foreign = await db.from('school_units').insert({ organizer_id: '00000000-0000-4000-8000-000000000999', code: '11111111', name: 'Annan', municipality_code: '0000' });
check(Boolean(foreign.error), 'skrivning till annan huvudman stoppas av RLS', foreign.error?.message.slice(0, 56));

if (decided) {
  const change = await db.from('point_plans').update({ specialization: ['ANIM1000X'] }).eq('id', decided.id);
  const after = (await db.from('point_plans').select('specialization').eq('id', decided.id).single()).data;
  check(Boolean(change.error) && after.specialization.join(',') === decided.specialization.join(','), 'fastställd poängplan kan inte ändras', change.error?.message.slice(0, 56));
}

const openDraft = state.offerings.find((o) => o.pointPlans.some((p) => p.status === 'utkast'));
if (openDraft) {
  const second = await db.from('point_plans').insert({ organizer_id: organizerId, offering_id: openDraft.id, version: 99, status: 'utkast', specialization: [] });
  check(second.error?.code === '23505', 'högst ett utkast per utbildning', second.error?.code);
}

// Hela vägen som appen använder när huvudmannen lägger till en skola.
const registryUnit = {
  id: '',
  code: '90000001',
  name: 'Kontrollskolan',
  organizer: state.organizer,
  municipality: { code: '1480', name: 'Göteborg' },
  schoolTypes: [{ code: 'GY', name: 'Gymnasieskola', programmes: ['NA', 'SA'] }],
  headMaster: 'Kontroll',
  locality: 'Göteborg',
  status: 'Aktiv',
  source: { name: 'Skolenhetsregistret', fetched: '2026-09-05', url: 'https://api.skolverket.se/skolenhetsregistret/v2/school-units/90000001' },
  pupilRegister: { source: 'Inget register kopplat', count: 0, note: '' },
};
const newId = await saveUnitFromRegistry(registryUnit, { data: { schoolUnitCode: '90000001' } }, registryUnit.source.url);
const reloaded = await loadOrganisation(20);
const saved = reloaded.units.find((u) => u.code === '90000001');
check(Boolean(saved), 'skolenhet ur registret sparas och läses tillbaka', saved && `${saved.name}, ${saved.municipality.name}, program ${saved.schoolTypes[0].programmes?.join(', ')}`);
check(reloaded.log[0]?.action === 'Skolenhet tillagd', 'händelsen loggas för huvudmannen', reloaded.log[0]?.comment);

const snapshots = await db.from('registry_snapshots').select('unit_code, source_url').eq('unit_code', '90000001');
check(snapshots.data?.length > 0, 'registrets svar sparas som proveniens', snapshots.data?.[0]?.source_url?.slice(0, 56));

await deleteUnit(newId, 'Kontrollskolan');
await db.from('registry_snapshots').delete().eq('unit_code', '90000001');
await db.from('organisation_events').delete().like('comment', 'Kontrollskolan%');
const after = await loadOrganisation(20);
check(!after.units.some((u) => u.code === '90000001'), 'skolenhet kan tas bort igen', `${after.units.length} kvar`);

// ---------------------------------------------------------------------------
// Timplaner
// ---------------------------------------------------------------------------
const educations = deriveEducations(after);
const timplans = await loadTimplans(educations);
check(timplans.length > 0, 'timplaner läses eller seedas per utbildning', `${timplans.length} för ${educations.length} utbildningar`);
const gr = educations.find((e) => e.kind === 'grundskola');
const grPlan = timplans.find((p) => p.educationId === gr?.id);
check(Boolean(grPlan) && Object.keys(grPlan.cells).length > 0, 'timplanens timmar följer med raderna', grPlan && `${Object.keys(grPlan.cells).length} rader, svenska ${grPlan.cells.svenska?.join('/')}`);

// En ändring i ett öppet utkast skrivs och läses tillbaka. Kontrollen körs om
// och om igen, så den utgår från det som redan finns i databasen.
const openGr = gr ? openTimplan({ role: 'rektor', educations, plans: timplans }, gr.id) : null;
if (gr) {
  let plans = timplans;
  if (!openGr) {
    const started = startRevision({ role: 'rektor', educations, plans: timplans }, gr.id);
    await persistTimplans(started.plans, timplans);
    plans = await loadTimplans(educations);
  }
  const draftPlan = openTimplan({ role: 'rektor', educations, plans }, gr.id);
  const index = gr.columns.findIndex((c) => c.id === 'ak5');
  const original = draftPlan.cells.bild?.[index] ?? 0;
  const changed = setCell({ role: 'rektor', educations, plans }, draftPlan.id, 'bild', index, original === 33 ? 34 : 33);
  await persistTimplans(changed.plans, plans);
  const back = await loadTimplans(educations);
  const readBack = back.find((p) => p.id === draftPlan.id)?.cells.bild?.[index];
  check(readBack === (original === 33 ? 34 : 33), 'ändrad cell sparas och läses tillbaka', `bild åk 5 = ${readBack}`);
  const restored = setCell({ role: 'rektor', educations, plans: back }, draftPlan.id, 'bild', index, original);
  await persistTimplans(restored.plans, back);

  // Flödet förslag → fastställd. Finns redan en fastställd version från en
  // tidigare körning prövas bara låsningen, så att versionerna inte växer.
  const existing = currentTimplan({ role: 'huvudman', educations, plans: await loadTimplans(educations) }, gr.id);
  let decidedPlan = existing;
  if (!existing) {
    const now = await loadTimplans(educations);
    const sent = submitTimplan({ role: 'rektor', educations, plans: now }, draftPlan.id, 'Kontroll av flödet.');
    await persistTimplans(sent.plans, now);
    const decided = approveTimplan({ role: 'huvudman', educations, plans: sent.plans }, draftPlan.id, 'Kontroll av beslutet.');
    await persistTimplans(decided.plans, sent.plans);
    decidedPlan = currentTimplan({ role: 'huvudman', educations, plans: await loadTimplans(educations) }, gr.id);
  }
  check(Boolean(decidedPlan?.decidedOn), 'timplanen fastställs och får beslutsdatum', decidedPlan?.decidedOn);
  check(decidedPlan?.history.length >= 2, 'timplanens historik följer med', decidedPlan?.history.map((h) => h.action).join(' → '));

  const locked = await db.from('timplan_cells').update({ hours: [1, 1, 1, 1, 1, 1, 1, 1, 1] }).eq('timplan_id', decidedPlan.id).eq('row_id', 'bild');
  check(Boolean(locked.error), 'en fastställd timplans timmar kan inte ändras', locked.error?.message.slice(0, 60));

  const third = await db.from('timplans').insert({ organizer_id: organizerId, offering_id: gr.id, version: 97, status: 'utkast', basis: 'Kontroll' });
  check(third.error?.code === '23505', 'högst en öppen timplan per utbildning', third.error?.code);
  if (!third.error) await db.from('timplans').delete().eq('offering_id', gr.id).eq('version', 97);
}

// ---------------------------------------------------------------------------
// Läsår
// ---------------------------------------------------------------------------
const unit = after.units[0];
const types = unit.schoolTypes.map((t) => t.code);
const years = await loadSchoolYears(unit.id, types);
check(years.length > 0, 'läsår läses eller seedas per skolenhet', years.map((y) => `${y.startYear}/${String(y.startYear + 1).slice(2)} ${y.status}`).join(', '));
const fixedYear = years.find((y) => y.status === 'fastställd');
check(Boolean(fixedYear), 'det fastställda exempelläsåret finns kvar', fixedYear && `${fixedYear.ht.start} – ${fixedYear.vt.end}, fastställt ${fixedYear.decidedOn}`);
if (fixedYear) {
  const s = summarize(fixedYear, types);
  check(s.skoldagar >= 178 && s.lovdagar >= 12, 'läsåret håller ramen efter att ha lästs tillbaka', `${s.skoldagar} skoldagar, ${s.lovdagar} lovdagar, ${s.studiedagar} studiedagar`);
  check(Object.keys(fixedYear.groupExceptions).length > 0, 'gruppens avvikande lärotider följer med', Object.entries(fixedYear.groupExceptions).map(([k, v]) => `${k}: ${Object.keys(v).length} dagar`).join(', '));
}

// Skrivningarna prövas i ett eget kontrolläsår, så att kontrollen varken
// beror på eller stör demodatan och kan köras om.
await db.from('school_years').delete().eq('unit_id', unit.id).eq('start_year', 2035);
const base = await loadSchoolYears(unit.id, types);
const created = addSchoolYear({ role: 'rektor', years: base }, unit.id, 2035, types);
await persistSchoolYears(created.years, base, unit.id);
const withControl = await loadSchoolYears(unit.id, types);
const control = withControl.find((y) => y.startYear === 2035);
check(Boolean(control), 'ett nytt läsår kan läggas upp och läsas tillbaka', control && `${control.ht.start} – ${control.vt.end}, ${summarize(control, types).skoldagar} skoldagar`);

if (control) {
  const school = yearDays(control).filter((d) => d.status === 'skoldag' && d.part === 'ht').map((d) => d.date);
  const [lovA, lovB] = [school.at(-3), school.at(-2)];
  const groupDay = school[10];
  const state = { role: 'rektor', years: withControl };
  const withLov = setDays(state, control.id, [lovA, lovB], 'lovdag', 'Kontrollov');
  const withGroup = setGroupDays(withLov, control.id, { id: 'klass:KONTROLL', name: 'KONTROLL', scope: 'klass', kind: 'grundskola', educationId: gr?.id ?? '', educationName: '', columnId: 'ak8' }, [groupDay], 'nationellt prov', 'Kontroll');
  const withShort = setShortWeek(withGroup, control.id, { id: 'kontroll:ak1', name: 'Åk 1', scope: 'årskurs', kind: 'grundskola', educationId: gr?.id ?? '', educationName: '', columnId: 'ak1' }, 4, 'Kontroll av särskilda skäl');
  await persistSchoolYears(withShort.years, withControl, unit.id);
  const back = await loadSchoolYears(unit.id, types);
  const saved = back.find((y) => y.id === control.id);
  check(saved?.exceptions[lovA]?.note === 'Kontrollov', 'lovdagar sparas och läses tillbaka', `${lovA} ${saved?.exceptions[lovA]?.kind}`);
  check(saved?.groupExceptions['klass:KONTROLL']?.[groupDay]?.cause === 'nationellt prov', 'gruppens avvikelse sparas', `${groupDay} ${saved?.groupExceptions['klass:KONTROLL']?.[groupDay]?.note}`);
  check(saved?.shortWeeks['kontroll:ak1']?.weekday === 4, 'förkortad vecka sparas med årskurs', saved?.shortWeeks['kontroll:ak1']?.columnId);

  // Databasens egna invarianter för läsåret.
  const yearId = control.id;
  const noNote = await db.from('school_year_group_days').insert({ school_year_id: yearId, group_key: 'klass:X', day: school[12], cause: 'annat' });
  check(Boolean(noNote.error), 'orsaken annat kräver en anteckning', noNote.error?.message.slice(0, 60));
  const wrongGrade = await db.from('school_year_short_weeks').insert({ school_year_id: yearId, group_key: 'kontroll:ak5', column_id: 'ak5', weekday: 4, reason: 'Fel årskurs' });
  check(Boolean(wrongGrade.error), 'fyra dagar i veckan bara i årskurs 1 eller 2', wrongGrade.error?.message.slice(0, 60));
  const badTerms = await db.from('school_years').update({ vt_end: control.ht.start }).eq('id', yearId);
  check(Boolean(badTerms.error), 'terminerna måste ligga i ordning', badTerms.error?.message.slice(0, 60));

  // Kontrollens avvikelser tas bort, så att beslutet gäller ett läsår i ram.
  await db.from('school_year_days').delete().eq('school_year_id', yearId).in('day', [lovA, lovB]);
  await db.from('school_year_group_days').delete().eq('school_year_id', yearId).eq('group_key', 'klass:KONTROLL');
  await db.from('school_year_short_weeks').delete().eq('school_year_id', yearId);

  // Rektorn skickar, huvudmannen fastställer, och dagarna låses.
  const clean = await loadSchoolYears(unit.id, types);
  const target = clean.find((y) => y.id === yearId);
  const remaining = summarize(target, types).issues.filter((i) => i.level === 'error');
  check(remaining.length === 0, 'utkastet håller ramen inför beslutet', remaining.map((i) => i.text).join(' ') || `${summarize(target, types).skoldagar} skoldagar`);
  const sent = submitYear({ role: 'rektor', years: clean }, yearId, 'Kontroll av flödet.', types);
  await persistSchoolYears(sent.years, clean, unit.id);
  const decided = approveYear({ role: 'huvudman', years: sent.years }, yearId, 'Kontroll av beslutet.', types);
  await persistSchoolYears(decided.years, sent.years, unit.id);
  const afterDecision = await loadSchoolYears(unit.id, types);
  const decidedYear = afterDecision.find((y) => y.id === yearId);
  check(decidedYear?.status === 'fastställd' && Boolean(decidedYear.decidedOn), 'läsåret fastställs och får beslutsdatum', decidedYear?.decidedOn);
  check(decidedYear?.history.length >= 3, 'läsårets historik följer med', decidedYear?.history.map((h) => h.action).join(' → '));
  const locked = await db.from('school_year_days').insert({ school_year_id: yearId, day: school[14], kind: 'lovdag' });
  check(Boolean(locked.error), 'dagarna i ett fastställt läsår kan inte ändras', locked.error?.message.slice(0, 60));

  // Städa bort kontrolläsåret; dagar, avvikelser och händelser följer med.
  await db.from('school_years').update({ status: 'utkast', decided_on: null }).eq('id', yearId);
  await db.from('school_years').delete().eq('id', yearId);
  const gone = await loadSchoolYears(unit.id, types);
  check(!gone.some((y) => y.startYear === 2035), 'kontrolläsåret kan tas bort igen', `${gone.length} läsår kvar`);
}

await db.auth.signOut();
console.log(`\n${failures ? `${failures} kontroller misslyckades.` : 'Alla kontroller passerade.'}`);
console.log('Kontrollen använder anon-nyckeln och radnivåskyddet, aldrig servicerollen.');
process.exit(failures ? 1 : 0);
