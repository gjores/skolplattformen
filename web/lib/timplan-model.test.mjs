import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createTimplanState,
  nationalTimplan,
  nationalStageTotal,
  nationalTotal,
  stages,
  stageHours,
  planTotal,
  timplanIssues,
  defaultCells,
  setRole,
  setCell,
  submit,
  withdraw,
  requestChanges,
  approve,
  addComment,
  startRevision,
  currentPlan,
  openPlan,
  educationOf,
  diffPlans,
  weeklyMinutes,
  staffingSummary,
} from './timplan-model.ts';
import { createOrganisationState } from './organisation-model.ts';

const errors = (education, plan) =>
  timplanIssues(education, plan).filter((i) => i.level === 'error');
const find = (state, educationId, status) =>
  state.plans.find((p) => p.educationId === educationId && p.status === status);

test('den nationella timplanen summerar till bilaga 1', () => {
  for (const stage of stages) {
    const sum = nationalTimplan
      .filter((s) => s.hours)
      .reduce((n, s) => n + s.hours[stage.id], 0);
    assert.equal(sum, nationalStageTotal[stage.id], stage.name);
  }
  assert.equal(
    Object.values(nationalStageTotal).reduce((a, b) => a + b, 0),
    nationalTotal,
  );
});

test('den nationella fördelningen ger en plan utan avvikelser per stadium', () => {
  const state = createTimplanState();
  const gr = state.educations.find((e) => e.id === 'gr');
  const plan = currentPlan(state, 'gr');
  assert.equal(plan.version, 1);
  assert.deepEqual(errors(gr, plan), []);
  assert.equal(planTotal(gr, plan), nationalTotal);
  for (const stage of stages) {
    const sum = gr.rows.reduce(
      (n, r) => n + stageHours(gr, plan, r.id, stage.id),
      0,
    );
    assert.equal(sum, nationalStageTotal[stage.id]);
  }
  // NO och SO läses som block i lågstadiet och som egna ämnen därefter.
  assert.equal(stageHours(gr, plan, 'no', 'låg'), 145);
  assert.equal(stageHours(gr, plan, 'biologi', 'låg'), 0);
  assert.equal(
    ['biologi', 'fysik', 'kemi'].reduce(
      (n, id) => n + stageHours(gr, plan, id, 'hög'),
      0,
    ),
    289,
  );
});

test('rektorns utkast med skolans val håller sig inom ramen och visar diffen', () => {
  const state = createTimplanState();
  const gr = state.educations.find((e) => e.id === 'gr');
  const draft = openPlan(state, 'gr');
  assert.equal(draft.status, 'utkast');
  assert.deepEqual(errors(gr, draft), []);
  assert.equal(planTotal(gr, draft), nationalTotal);
  assert.equal(stageHours(gr, draft, 'skolansval', 'hög'), 60);
  const changes = diffPlans(gr, currentPlan(state, 'gr'), draft);
  assert(changes.some((c) => c.rowId === 'slojd' && c.to < c.from));
  assert(changes.every((c) => ['ak7', 'ak8', 'ak9'].includes(c.columnId)));
});

test('svenska, engelska, matematik och språkval får inte minskas', () => {
  const state = createTimplanState();
  const gr = state.educations.find((e) => e.id === 'gr');
  const draft = openPlan(state, 'gr');
  const next = setCell(state, draft.id, 'matematik', 0, 100);
  const issues = errors(gr, openPlan(next, 'gr'));
  assert(issues.some((i) => i.text.includes('Matematik får inte minskas')));
  assert(issues.some((i) => i.text.includes('Lågstadiet har')));
});

test('skolans val stoppas vid mer än 20 procent, över 600 timmar och utan täckning', () => {
  const state = createTimplanState();
  const gr = state.educations.find((e) => e.id === 'gr');
  const draft = openPlan(state, 'gr');
  // Bild i högstadiet är 100 timmar; 79 är under 20-procentsgränsen.
  let next = setCell(state, draft.id, 'bild', 6, 27);
  next = setCell(next, draft.id, 'bild', 7, 26);
  next = setCell(next, draft.id, 'bild', 8, 26);
  assert(
    errors(gr, openPlan(next, 'gr')).some((i) =>
      i.text.includes('mer än 20 procent'),
    ),
  );
  // Minskning utan att skolans val ger tiden tillbaka.
  const uncovered = setCell(state, draft.id, 'skolansval', 6, 0);
  assert(
    errors(gr, openPlan(uncovered, 'gr')).some((i) =>
      i.text.includes('skolans val ger bara'),
    ),
  );
  const tooMuch = setCell(state, draft.id, 'skolansval', 3, 601);
  assert(
    errors(gr, openPlan(tooMuch, 'gr')).some((i) =>
      i.text.includes('högst 600'),
    ),
  );
});

test('ett ämne i en ämnesgrupp kan inte gå under sin garanterade minsta tid', () => {
  const state = createTimplanState();
  const gr = state.educations.find((e) => e.id === 'gr');
  const draft = openPlan(state, 'gr');
  // Biologi i högstadiet: garanterat minst 80 timmar.
  let next = setCell(state, draft.id, 'biologi', 6, 0);
  next = setCell(next, draft.id, 'biologi', 7, 0);
  next = setCell(next, draft.id, 'biologi', 8, 70);
  const issues = errors(gr, openPlan(next, 'gr'));
  assert(issues.some((i) => i.text.includes('Biologi har 70 timmar')));
  // Blocket i lågstadiet kan inte skrivas per ämne.
  assert.throws(() => setCell(state, draft.id, 'biologi', 0, 10));
  assert.throws(() => setCell(state, draft.id, 'no', 4, 10));
});

test('gymnasieprogrammets poängplan kommer ur katalogen och summerar till 2 500', () => {
  const state = createTimplanState();
  const sa = state.educations.find((e) => e.id === 'sa25');
  assert.equal(sa.programCode, 'SA25');
  const points = sa.rows.reduce((n, r) => n + (r.points ?? 0), 0);
  assert.equal(points, 2500);
  assert.equal(sa.blocks.find((b) => b.id === 'gemensamma').points, 1150);
  assert.equal(sa.basis, 'Poängplan v1');
  assert(sa.rows.some((r) => r.id === 'RETO1000X' && r.block === 'fordjupning'));
  assert.equal(sa.blocks.find((b) => b.id === 'fordjupning').points, 300);
  const ek = state.educations.find((e) => e.id === 'ek25');
  assert.equal(ek.blocks.find((b) => b.id === 'gemensamma').points, 1250);
  assert.equal(ek.rows.reduce((n, r) => n + (r.points ?? 0), 0), 2500);
  const proposal = find(state, 'sa25', 'förslag');
  assert.deepEqual(errors(sa, proposal), []);
  assert(planTotal(sa, proposal) >= 2180);
});

test('garanterad undervisningstid och oplacerade nivåer stoppar ett gymnasieförslag', () => {
  const state = createTimplanState();
  const ek = state.educations.find((e) => e.id === 'ek25');
  const draft = openPlan(state, 'ek25');
  const issues = errors(ek, draft);
  assert(issues.some((i) => i.text.includes('Gymnasiearbete')));
  // Tusentalsavgränsaren från sv-SE är ett smalt fast mellanslag.
  assert(issues.some((i) => /garanterad undervisningstid är 2.180/.test(i.text)));
  assert.throws(() => submit(state, draft.id, 'Klart'), /avvikelse/);
  let next = setCell(state, draft.id, 'GYAREK25', 2, 90);
  next = setCell(next, draft.id, 'IDRO1000X', 2, 30);
  assert.deepEqual(errors(ek, openPlan(next, 'ek25')), []);
  next = submit(next, draft.id, 'Alla nivåer placerade.');
  assert.equal(openPlan(next, 'ek25').status, 'förslag');
});

test('rektor föreslår, huvudman fastställer; den tidigare versionen blir ersatt', () => {
  let state = createTimplanState();
  const proposal = find(state, 'sa25', 'förslag');
  assert.throws(() => approve(state, proposal.id, 'Beslut'), /huvudmannen/);
  state = setRole(state, 'huvudman');
  assert.throws(() => setCell(state, openPlan(state, 'gr').id, 'bild', 0, 1));
  assert.throws(() => approve(state, proposal.id, ' '), /Dokumentera/);
  state = approve(state, proposal.id, 'Fastställd enligt förslag.');
  const decided = state.plans.find((p) => p.id === proposal.id);
  assert.equal(decided.status, 'fastställd');
  assert.equal(decided.decidedOn, '2026-09-05');
  assert.equal(decided.history[0].role, 'huvudman');

  // Grundskolan: utkast → förslag → fastställd ersätter version 1.
  state = setRole(state, 'rektor');
  const draft = openPlan(state, 'gr');
  state = submit(state, draft.id, 'Profil i högstadiet.');
  state = setRole(state, 'huvudman');
  state = approve(state, draft.id, 'Beslutad i nämnden.');
  assert.equal(currentPlan(state, 'gr').version, 2);
  assert.equal(
    state.plans.find((p) => p.educationId === 'gr' && p.version === 1).status,
    'ersatt',
  );
  assert.equal(openPlan(state, 'gr'), undefined);
});

test('huvudmannen kan återsända med skäl och rektorn kan ta tillbaka ett förslag', () => {
  let state = createTimplanState();
  const proposal = find(state, 'sa25', 'förslag');
  state = setRole(state, 'huvudman');
  assert.throws(() => requestChanges(state, proposal.id, ''), /vad rektorn/);
  state = requestChanges(state, proposal.id, 'Lägg mer tid i år 1.');
  assert.equal(openPlan(state, 'sa25').status, 'återsänd');
  state = setRole(state, 'rektor');
  state = setCell(state, proposal.id, 'SVEN1000X', 0, 95);
  state = submit(state, proposal.id, 'Justerat år 1.');
  state = withdraw(state, proposal.id);
  assert.equal(openPlan(state, 'sa25').status, 'utkast');
  state = addComment(state, proposal.id, 'Stämmer av med schemaläggaren.');
  assert.equal(openPlan(state, 'sa25').history[0].action, 'Kommentar');
  assert.throws(() => approve(setRole(state, 'huvudman'), proposal.id, 'x'));
});

test('en ny version utgår från den gällande och bara en kan vara öppen', () => {
  let state = createTimplanState();
  assert.throws(() => startRevision(state, 'gr'), /redan en öppen/);
  state = startRevision(state, 'im');
  const revision = openPlan(state, 'im');
  assert.equal(revision.version, 2);
  assert.deepEqual(revision.cells, currentPlan(state, 'im').cells);
  const im = educationOf(state, revision);
  assert.deepEqual(errors(im, revision), []);
  const thin = setCell(state, revision.id, 'im-praktik', 0, 0);
  assert(
    errors(im, openPlan(thin, 'im')).some((i) => i.text.includes('minst 23')),
  );
  assert.throws(() => startRevision(setRole(state, 'huvudman'), 'ek25'));
});

test('standardfördelningen respekterar minsta tid inom ämnesgrupper', () => {
  const state = createTimplanState();
  const gr = state.educations.find((e) => e.id === 'gr');
  const cells = defaultCells(gr);
  const plan = { cells };
  for (const id of ['geografi', 'historia', 'religion', 'samhallskunskap']) {
    const row = gr.rows.find((r) => r.id === id);
    for (const stage of ['mellan', 'hög'])
      assert(stageHours(gr, plan, id, stage) >= row.minimum[stage], id);
  }
});

test('utbildningar utan fastställd poängplan får ingen timplan, och ny grund märks', () => {
  const organisation = createOrganisationState();
  const state = createTimplanState(organisation);
  // ES-profilerna har bara utkast eller ingen poängplan alls.
  assert(!state.educations.some((e) => e.id === 'es-foto'));
  assert(!state.educations.some((e) => e.id === 'es-design'));
  assert.deepEqual(state.educations.map((e) => e.id), ['gr', 'sa25', 'ek25', 'im']);
  // Om poängplanen får en ny version pekar en gammal timplan på fel grund.
  const sa = state.educations.find((e) => e.id === 'sa25');
  const plan = openPlan(state, 'sa25');
  const changed = { ...sa, basis: 'Poängplan v2' };
  assert(timplanIssues(changed, plan).some((i) => i.level === 'warning' && i.text.includes('poängplan v2')));
  assert.deepEqual(timplanIssues(sa, plan).filter((i) => i.text.includes('bygger på')), []);
});

test('timplanen ger riktvärden för schema och underlag för tjänstefördelning', () => {
  const state = createTimplanState();
  const sa = state.educations.find((e) => e.id === 'sa25');
  const plan = openPlan(state, 'sa25');
  assert.equal(weeklyMinutes(90), 150);
  const staffing = staffingSummary(sa, plan);
  const svenska = staffing.find((r) => r.subject === 'Svenska');
  assert.deepEqual(svenska.perColumn, [90, 90, 90]);
  assert.equal(staffing.reduce((n, r) => n + r.total, 0), planTotal(sa, plan));
  // En skolenhet med bara högstadiet prövas bara mot högstadiets summa.
  {
    const organisation = createOrganisationState();
    organisation.offerings.find((o) => o.id === 'gr').grades = [7, 8, 9];
    const partial = createTimplanState(organisation);
    const gr = partial.educations.find((e) => e.id === 'gr');
    assert.equal(gr.columns.length, 3);
    assert.equal(gr.frame.total, 2634);
    assert.deepEqual(timplanIssues(gr, currentPlan(partial, 'gr')).filter((i) => i.level === 'error'), []);
  }
});
