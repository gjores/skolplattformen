import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createOrganisationState,
  applyRegistryUnit,
  registryComparison,
  addOffering,
  removeOffering,
  addPermit,
  permitStatus,
  createPointPlan,
  togglePick,
  approvePointPlan,
  pointPlanBlocks,
  pointPlanIssues,
  specializationOptions,
  studyPlanTemplate,
  currentPointPlan,
  openPointPlan,
  studyPathCode,
  addUnitFromRegistry,
  suggestOfferings,
  selectUnit,
  removeUnit,
  activeUnit,
  unitOfferings,
  assignUnit,
  unitsForRole,
  unitStaff,
} from './organisation-model.ts';

const errors = (o, plan) => pointPlanIssues(o, plan).filter((i) => i.level === 'error');
const find = (state, id) => state.offerings.find((o) => o.id === id);

test('poängplanens nationella block kommer ur katalogen och fördjupningen räknas fram', () => {
  const state = createOrganisationState();
  const es = find(state, 'es-foto');
  const blocks = pointPlanBlocks(es, openPointPlan(es));
  const required = Object.fromEntries(blocks.map((b) => [b.id, b.required]));
  assert.deepEqual(required, { gemensamma: 1150, programgemensamma: 150, inriktning: 400, fordjupning: 500, individuellt: 200, gymnasiearbete: 100 });
  assert.equal(blocks.find((b) => b.id === 'inriktning').levels.length, 4);
  assert.equal(blocks.find((b) => b.id === 'gymnasiearbete').levels[0].code, 'GYARES25');
  const sa = find(state, 'sa25');
  assert.equal(pointPlanBlocks(sa, currentPointPlan(sa)).find((b) => b.id === 'fordjupning').required, 300);
});

test('två utbildningar på samma studieväg kan ha olika programfördjupning', () => {
  const state = createOrganisationState();
  const foto = find(state, 'es-foto');
  const design = find(state, 'es-design');
  assert.equal(studyPathCode(foto), 'ESBIF');
  assert.equal(studyPathCode(design), 'ESBIF');
  assert.notEqual(foto.id, design.id);
  const plan = openPointPlan(foto);
  assert.equal(plan.specialization.length, 4);
  assert(errors(foto, plan).some((i) => i.text.includes('400 poäng')));
});

test('fördjupningen väljs bara ur Skolverkets lista och kan inte dubblera studievägen', () => {
  let state = createOrganisationState();
  const foto = find(state, 'es-foto');
  const plan = openPointPlan(foto);
  const options = specializationOptions(foto);
  // Bild nivå 1b ligger redan i inriktningen och är därför inte valbar.
  assert(!options.some((l) => l.code === 'BILD1B00X'));
  assert.throws(() => togglePick(state, 'rektor', foto.id, plan.id, 'BILD1B00X'), /får inte erbjudas/);
  assert.throws(() => togglePick(state, 'rektor', foto.id, plan.id, 'MATMAT02b'));
  state = togglePick(state, 'rektor', foto.id, plan.id, 'FILO2000X');
  assert.deepEqual(errors(find(state, 'es-foto'), openPointPlan(find(state, 'es-foto'))), []);
  // Nivå 2 utan nivå 1 i samma ämne varnar men stoppar inte.
  const warn = togglePick(togglePick(state, 'rektor', foto.id, plan.id, 'FILO1000X'), 'rektor', foto.id, plan.id, 'GRAF2000X');
  const issues = pointPlanIssues(find(warn, 'es-foto'), openPointPlan(find(warn, 'es-foto')));
  assert(issues.some((i) => i.level === 'warning' && i.text.includes('Grafisk illustration')));
});

test('rektor och huvudman utformar; bara huvudmannen fastställer poängplanen', () => {
  let state = createOrganisationState();
  const foto = find(state, 'es-foto');
  const plan = openPointPlan(foto);
  state = togglePick(state, 'huvudman', foto.id, plan.id, 'FILO2000X');
  assert.throws(() => approvePointPlan(state, 'rektor', foto.id, plan.id, 'Beslut'), /Huvudmannen beslutar/);
  assert.throws(() => approvePointPlan(state, 'huvudman', foto.id, plan.id, ' '), /Dokumentera/);
  state = approvePointPlan(state, 'huvudman', foto.id, plan.id, 'Fastställd i styrelsen.');
  assert.equal(currentPointPlan(find(state, 'es-foto')).version, 1);
  assert.equal(openPointPlan(find(state, 'es-foto')), undefined);
  // Ny version utgår från den fastställda och ersätter den vid beslut.
  state = createPointPlan(state, 'rektor', 'sa25');
  const v2 = openPointPlan(find(state, 'sa25'));
  assert.equal(v2.version, 2);
  assert.deepEqual(v2.specialization, ['ENGE3000X', 'HIST3000X', 'RETO1000X']);
  assert.throws(() => createPointPlan(state, 'rektor', 'sa25'), /redan ett utkast/);
  state = approvePointPlan(state, 'huvudman', 'sa25', v2.id, 'Oförändrad fördjupning bekräftad.');
  assert.equal(find(state, 'sa25').pointPlans.find((p) => p.version === 1).status, 'ersatt');
  assert.throws(() => createPointPlan(state, 'administrator', 'sa25'));
});

test('studieplanens mall följer den fastställda poängplanen', () => {
  const state = createOrganisationState();
  const sa = find(state, 'sa25');
  const template = studyPlanTemplate(sa);
  assert.equal(template.reduce((n, l) => n + l.points, 0), 2500);
  assert(template.some((l) => l.code === 'MATE1B00X' && l.block === 'gemensamma'));
  assert(template.some((l) => l.code === 'RETO1000X' && l.block === 'fordjupning' && !l.fixed));
  assert.deepEqual(studyPlanTemplate(find(state, 'gr')), []);
});

test('huvudmannen definierar utbildningar inom skolenhetens skolformer', () => {
  let state = createOrganisationState();
  assert.throws(() => addOffering(state, 'rektor', { unitId: '99999901', kind: 'gymnasium', name: 'X', programCode: 'NA25', orientationCode: 'NANAP', cohort: 'HT 2027' }), /huvudmannen/);
  assert.throws(() => addOffering(state, 'huvudman', { unitId: '99999901', kind: 'gymnasium', name: 'X', programCode: 'XX25', cohort: 'HT 2027' }), /katalogen/);
  assert.throws(() => addOffering(state, 'huvudman', { unitId: '99999901', kind: 'gymnasium', name: 'X', programCode: 'NA25', cohort: 'HT 2027' }), /inriktning/);
  state = addOffering(state, 'huvudman', { unitId: '99999901', kind: 'gymnasium', name: 'Naturvetenskap', programCode: 'NA25', orientationCode: 'NANAP', cohort: 'Elever som börjar HT 2027' });
  const na = state.offerings.find((o) => o.programCode === 'NA25');
  const fresh = () => state.offerings.find((o) => o.id === na.id);
  assert.equal(na.status, 'planerad');
  assert.equal(permitStatus(state, na).level, 'error');
  state = addPermit(state, 'huvudman', na.id, { issuer: 'Skolinspektionen', reference: 'SI 2026:1001', decided: '2026-09-01', validFrom: '2027-07-01', scope: 'NA vid Testskolan.' });
  // Tillståndet börjar gälla nästa år; i dag är det inte giltigt.
  assert.equal(permitStatus(state, fresh()).level, 'error');
  state = addPermit(state, 'huvudman', na.id, { issuer: 'Huvudmannens beslut', reference: 'Styrelsen 2026-08-20 § 4', decided: '2026-08-20', validFrom: '2026-08-20', scope: 'Beslut att starta.' });
  assert.equal(permitStatus(state, fresh()).level, 'ok');
  assert.throws(() => addPermit(state, 'huvudman', na.id, { issuer: 'Skolinspektionen', reference: '', decided: '2026-09-01', validFrom: '2026-09-01', scope: '' }), /diarienummer/);
  assert.throws(() => removeOffering(state, 'huvudman', 'sa25'), /avveckla/i);
  state = removeOffering(state, 'huvudman', na.id);
  assert(!state.offerings.some((o) => o.id === na.id));
});

test('en profil utan eget tillstånd pekar på systerutbildningens beslut', () => {
  const state = createOrganisationState();
  const status = permitStatus(state, find(state, 'es-design'));
  assert.equal(status.level, 'error');
  assert(status.text.includes('SI 2026:0873'));
});

test('skolenheten hämtas ur registret och utbudet jämförs med registrets program', () => {
  let state = createOrganisationState();
  assert.equal(registryComparison(state).known, false);
  const unit = {
    code: '19207279',
    name: 'Sigrid Rudebecks gymnasium',
    status: 'AKTIV',
    municipalityCode: '1480',
    municipalityName: 'Göteborg',
    schoolTypes: ['GY'],
    programmes: { gy: ['NA', 'SA'] },
    headMaster: 'Maria Laasonen',
    locality: 'Göteborg',
    organizer: { name: 'AKTIEBOLAGET SIGRID RUDEBECKS SKOLA', organizationNumber: '5563571248', type: 'ENSKILD' },
    modified: '2025-03-10',
  };
  assert.throws(() => applyRegistryUnit(state, 'rektor', unit), /huvudmannen/);
  state = applyRegistryUnit(state, 'huvudman', unit, 'https://api.skolverket.se/skolenhetsregistret/v2/school-units/19207279');
  assert.equal(activeUnit(state).code, '19207279');
  assert.equal(activeUnit(state).organizer.type, 'Enskild');
  assert.equal(activeUnit(state).status, 'Aktiv');
  assert.equal(activeUnit(state).source.name, 'Skolenhetsregistret');
  assert.deepEqual(activeUnit(state).schoolTypes.map((t) => t.code), ['GY']);
  assert.equal(activeUnit(state).id, '99999901', 'uppdatering byter uppgifter, inte identitet');
  const cmp = registryComparison(state);
  assert.equal(cmp.known, true);
  assert.deepEqual(cmp.missingInRegistry.sort(), ['EK', 'ES']);
  assert.deepEqual(cmp.notOffered, ['NA']);
  // Utan grundskola som skolform kan grundskola inte läggas till.
  assert.throws(() => addOffering(state, 'huvudman', { unitId: '99999901', kind: 'grundskola', name: 'Grundskola', cohort: '2027/28' }), /skolform/);
});

test('huvudmannen lägger till en ny skolenhet ur registret och får förslag på utbildningar', () => {
  let state = createOrganisationState();
  const unit = {
    code: '19207279',
    name: 'Sigrid Rudebecks gymnasium',
    status: 'AKTIV',
    municipalityCode: '1480',
    municipalityName: 'Göteborg',
    schoolTypes: ['GY'],
    programmes: { gy: ['NA', 'SA'] },
    headMaster: 'Maria Laasonen',
    organizer: { name: 'AKTIEBOLAGET SIGRID RUDEBECKS SKOLA', organizationNumber: '5563571248', type: 'ENSKILD' },
    modified: '2025-03-10',
  };
  assert.throws(() => addUnitFromRegistry(state, 'rektor', unit), /huvudmannen/);
  state = addUnitFromRegistry(state, 'huvudman', unit, 'https://api.skolverket.se/skolenhetsregistret/v2/school-units/19207279');
  assert.equal(state.units.length, 2);
  assert.equal(state.activeUnitId, '19207279');
  assert.equal(activeUnit(state).municipality.name, 'Göteborg');
  assert.throws(() => addUnitFromRegistry(state, 'huvudman', unit), /finns redan/);
  // Testskolans utbildningar hör kvar till Testskolan.
  assert.equal(unitOfferings(state, '99999901').length, 6);
  assert.equal(unitOfferings(state, '19207279').length, 0);
  const suggestions = suggestOfferings(state, '19207279');
  assert.deepEqual(suggestions.map((s) => s.programCode ?? s.kind), ['NA25', 'SA25', 'introduktionsprogram']);
  assert(suggestions[0].orientations.some((o) => o.code === 'NANAP'));
  state = addOffering(state, 'huvudman', { unitId: '19207279', kind: 'gymnasium', name: 'Naturvetenskap', programCode: 'NA25', orientationCode: 'NANAP', cohort: 'Elever som börjar HT 2027' });
  assert.equal(unitOfferings(state, '19207279').length, 1);
  assert.deepEqual(suggestOfferings(state, '19207279').map((s) => s.programCode ?? s.kind), ['SA25', 'introduktionsprogram']);
  // Registret jämförs per skolenhet.
  assert.deepEqual(registryComparison(state, '19207279').notOffered, ['SA']);
  assert.equal(registryComparison(state, '99999901').known, false);
  // Grundskola kan inte läggas på en ren gymnasieskola.
  assert.throws(() => addOffering(state, 'huvudman', { unitId: '19207279', kind: 'grundskola', name: 'Grundskola', cohort: '2027/28' }), /skolform/);
  // Byte av aktiv skolenhet och borttagning.
  state = selectUnit(state, '99999901');
  assert.equal(activeUnit(state).name, 'Testskolan');
  assert.throws(() => removeUnit(state, 'huvudman', '99999901'), /aktiva utbildningar/);
  state = removeUnit(state, 'huvudman', '19207279');
  assert.equal(state.units.length, 1);
  assert(!state.offerings.some((o) => o.unitId === '19207279'));
});

test('en rektor och lärare kan ha uppdrag vid flera skolenheter', () => {
  let state = createOrganisationState();
  const unit = { code: '19207279', name: 'Sigrid Rudebecks gymnasium', status: 'AKTIV', municipalityCode: '1480', schoolTypes: ['GY'], programmes: { gy: ['NA', 'SA'] }, organizer: { name: 'AB', organizationNumber: '5563571248', type: 'ENSKILD' } };
  state = addUnitFromRegistry(state, 'huvudman', unit);
  assert.deepEqual(unitsForRole(state, 'huvudman').map((u) => u.id), ['99999901', '19207279']);
  assert.deepEqual(unitsForRole(state, 'rektor').map((u) => u.id), ['99999901']);
  assert.throws(() => assignUnit(state, 'rektor', 'rektor-robin', '19207279', true), /huvudmannen/);
  state = assignUnit(state, 'huvudman', 'rektor-robin', '19207279', true);
  assert.deepEqual(unitsForRole(state, 'rektor').map((u) => u.id), ['99999901', '19207279']);
  assert.deepEqual(unitStaff(state, '19207279').map((a) => a.name), ['Robin Berg']);
  state = assignUnit(state, 'rektor', 'larare-mira', '19207279', true);
  assert.equal(unitStaff(state, '19207279').length, 2);
  // Rektorn kan inte lämna sin sista skolenhet.
  state = assignUnit(state, 'huvudman', 'rektor-robin', '99999901', false);
  assert.throws(() => assignUnit(state, 'huvudman', 'rektor-robin', '19207279', false), /minst en/);
  // Borttagen skolenhet tar med sig uppdragen.
  state = assignUnit(state, 'huvudman', 'rektor-robin', '99999901', true);
  state = removeUnit(state, 'huvudman', '19207279');
  assert.deepEqual(unitsForRole(state, 'rektor').map((u) => u.id), ['99999901']);
});


test('rektorn hanterar läraruppdrag och huvudmannen hanterar rektorsuppdrag', () => {
  const state = createOrganisationState();
  for (const role of ['huvudman', 'administrator', 'larare']) {
    assert.throws(() => assignUnit(state, role, 'larare-mira', '99999901', false), /rektorn/);
  }
  const removed = assignUnit(state, 'rektor', 'larare-mira', '99999901', false);
  assert.deepEqual(removed.assignments.find(a => a.id === 'larare-mira').unitIds, []);
  const restored = assignUnit(removed, 'rektor', 'larare-mira', '99999901', true);
  assert.deepEqual(restored.assignments.find(a => a.id === 'larare-mira').unitIds, ['99999901']);
  assert.throws(() => assignUnit(state, 'rektor', 'rektor-robin', '99999901', false), /huvudmannen/);
});
