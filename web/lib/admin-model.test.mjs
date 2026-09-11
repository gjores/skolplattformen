import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createAdminState,
  groupPreview,
  applyGroup,
  savePlanDraft,
  discardPlanDraft,
  slotPreview,
  applySlot,
  scheduleConflicts,
  slotLanes,
  planSyllabusIssues,
  pupilIssues,
} from './admin-model.ts';

test('gruppbyte uppdaterar medlemskap och planreferens utan att ändra klass eller program', () => {
  const original = createAdminState();
  const next = applyGroup(original, ['E-1001'], 'ma-b');
  assert(!next.groups.find((g) => g.id === 'ma-a').members.includes('E-1001'));
  assert(next.groups.find((g) => g.id === 'ma-b').members.includes('E-1001'));
  assert.equal(
    next.pupils[0].plan.find((i) => i.id === 'MATE1B00X').groupId,
    'ma-b',
  );
  assert.equal(next.pupils[0].className, original.pupils[0].className);
  assert.equal(next.pupils[0].program, original.pupils[0].program);
  assert(
    original.groups.find((g) => g.id === 'ma-a').members.includes('E-1001'),
  );
  assert.equal(next.changes.length, 1);
});
test('fyller en saknad gruppkoppling och markerar inte en dublett som nytt byte', () => {
  const state = createAdminState();
  const p = groupPreview(state, ['E-1005', 'E-1005'], 'ma-a');
  assert.equal(p.changes.length, 1);
  assert.equal(p.errors.length, 0);
  assert.equal(groupPreview(state, ['E-1001'], 'ma-a').changes.length, 0);
  assert(groupPreview(state, ['E-1001'], 'ma-a').errors.length > 0);
});
test('kapacitet och fel regelverk stoppar hela batchen utan delvis ändring', () => {
  const state = createAdminState();
  assert(
    groupPreview(
      state,
      ['E-1001', 'E-1002', 'E-1003', 'E-1004'],
      'ma-b',
    ).errors.some((e) => e.includes('Kapaciteten')),
  );
  assert.throws(() => applyGroup(state, ['E-1001', 'E-1013'], 'ma-b'));
  assert.equal(state.revision, 1);
});
test('ny elevkrock efter gruppbyte upptäcks trots olika lärare och lokaler', () => {
  const state = createAdminState();
  state.groups.push({
    id: 'extra',
    name: 'Extra',
    moduleId: 'extra',
    subject: 'Extra',
    regime: 'Gy25',
    teacher: 'Sam Nilsson',
    capacity: 5,
    members: ['E-1001'],
  });
  state.slots.push({
    id: 'extra-slot',
    groupId: 'extra',
    day: 1,
    start: 550,
    duration: 30,
    room: 'B304',
    teacher: 'Sam Nilsson',
  });
  assert(
    groupPreview(state, ['E-1001'], 'ma-b').errors.some((e) =>
      e.includes('gemensamma elever'),
    ),
  );
});
test('grundskola och gymnasial studieplan blandas inte ihop', () => {
  const state = createAdminState();
  assert.throws(() => savePlanDraft(state, 'E-1017', [], 'Ändring'));
  assert(groupPreview(state, ['E-1017'], 'ma-a').errors.length > 0);
});
test('planutkast sparar orsak och kopia men ändrar inte gällande plan', () => {
  const state = createAdminState();
  const items = structuredClone(state.pupils[0].plan);
  items[0].period = 'VT 2027';
  const next = savePlanDraft(
    state,
    'E-1001',
    items,
    'Planerad förläggning behöver granskas.',
  );
  assert.equal(next.pupils[0].plan[0].period, 'Läsår 1 (2026/27)');
  assert.equal(next.pupils[0].draft.items[0].period, 'VT 2027');
  const discarded = discardPlanDraft(next, 'E-1001');
  assert.equal(discarded.pupils[0].draft, undefined);
  assert.deepEqual(discarded.pupils[0].plan, state.pupils[0].plan);
  assert.equal(discarded.changes.length, 2);
  items[0].period = 'Muterat';
  assert.equal(next.pupils[0].draft.items[0].period, 'VT 2027');
  assert.throws(() => savePlanDraft(state, 'E-1001', items, ' '));
  assert.throws(() =>
    savePlanDraft(state, 'E-1001', state.pupils[0].plan, 'Ingen ändring'),
  );
});
test('schema hittar lokalens konflikt och kan lösa den med en annan lokal', () => {
  const state = createAdminState();
  assert.equal(scheduleConflicts(state).length, 1);
  const old = state.slots.find((s) => s.id === 's5');
  const next = applySlot(state, { ...old, room: 'A201' });
  assert.equal(scheduleConflicts(next).length, 0);
  assert.equal(old.room, 'B304');
  assert.equal(next.changes.length, 1);
});
test('lärare, elever och lokalstorlek kontrolleras för schemaförslag', () => {
  const state = createAdminState();
  const sv = state.slots.find((s) => s.id === 's2');
  assert(
    slotPreview(state, { ...sv, day: 0, start: 550, room: 'B301' }).errors.some(
      (e) => e.includes('gemensamma elever'),
    ),
  );
  assert(
    slotPreview(state, { ...sv, room: 'B304' }).errors.some((e) =>
      e.includes('platser'),
    ),
  );
  const im = state.slots.find((s) => s.id === 's6');
  assert(
    slotPreview(state, {
      ...im,
      room: 'A201',
      teacher: 'Alex Lind',
    }).errors.some((e) => e.includes('samtidiga')),
  );
});
test('angränsande pass ger ingen falsk tidskrock och ogiltiga tider stoppas', () => {
  const state = createAdminState();
  const s = state.slots.find((s) => s.id === 's2');
  assert.equal(
    slotPreview(state, { ...s, day: 0, start: 600, room: 'B301' }).errors
      .length,
    0,
  );
  assert(slotPreview(state, { ...s, start: NaN }).errors.length > 0);
  assert(
    slotPreview(state, { ...s, start: 1000, duration: 60 }).errors.length > 0,
  );
  assert(slotPreview(state, { ...s, duration: NaN }).errors.length > 0);
});
test('överlappande pass med olika start får separata visuella kolumner', () => {
  const base = createAdminState().slots[0];
  const slots = [
    { ...base, id: 'a', start: 540 },
    { ...base, id: 'b', start: 570 },
    { ...base, id: 'c', start: 630 },
  ];
  const lanes = slotLanes(slots);
  assert.notEqual(lanes.a.lane, lanes.b.lane);
  assert.equal(lanes.a.count, 2);
  assert.equal(lanes.c.count, 1);
});

test('befintliga krockar döljer inte fler drabbade elever eller sämre lokalkapacitet', () => {
  const state = createAdminState();
  const target = state.groups.find((g) => g.id === 'ma-b');
  state.groups.push({
    id: 'extra',
    name: 'Extra',
    moduleId: 'extra',
    subject: 'Extra',
    regime: 'Gy25',
    teacher: 'Sam Nilsson',
    capacity: 10,
    members: ['E-1001', target.members[0]],
  });
  state.slots.push({
    id: 'extra-slot',
    groupId: 'extra',
    day: 1,
    start: 550,
    duration: 30,
    room: 'B304',
    teacher: 'Sam Nilsson',
  });
  assert(scheduleConflicts(state).some((c) => c.key.startsWith('students:')));
  assert(
    groupPreview(state, ['E-1001'], 'ma-b').errors.some((e) =>
      e.includes('gemensamma elever'),
    ),
  );

  const full = createAdminState();
  const group = full.groups.find((g) => g.id === 'ma-b');
  group.capacity = 20;
  group.members.push(
    ...full.groups.find((g) => g.id === 'ma-a').members.slice(0, 4),
  );
  full.slots.find((s) => s.id === 's3').room = 'B304';
  assert(scheduleConflicts(full).some((c) => c.key === 'capacity:s3'));
  assert(
    groupPreview(full, ['E-1005'], 'ma-b').errors.some((e) =>
      e.includes('platser'),
    ),
  );
});

test('även en ännu tom undervisningsgrupp kan inte dubbelbokas', () => {
  const state = createAdminState();
  state.groups.find((g) => g.id === 'ma-a').members = [];
  state.slots.push({
    ...state.slots[0],
    id: 'duplicate',
    room: 'B301',
    teacher: 'Sam Nilsson',
  });
  assert(scheduleConflicts(state).some((c) => c.key.startsWith('group:')));
});

test('exemplets grupper och planrader stämmer med den hämtade katalogen', () => {
  const state = createAdminState();
  for (const group of state.groups) {
    assert(group.syllabus, `${group.id} saknar hänvisning`);
    assert(group.subject.length > 0);
  }
  assert.equal(state.groups.find((g) => g.id === 'ma-a').regime, 'Gy25');
  assert.equal(state.groups.find((g) => g.id === 'sv3').regime, 'Gy11');
  assert.equal(state.groups.find((g) => g.id === 'gr-sv').regime, 'Grundskola');
  assert.equal(
    state.groups.find((g) => g.id === 'ma-a').syllabus.item,
    'MATE1B00X',
  );
  assert.equal(state.groups.find((g) => g.id === 'ma-a').subject, 'Matematik, Nivå 1b');
  for (const pupil of state.pupils) {
    assert.deepEqual(planSyllabusIssues(pupil), []);
    assert(!pupilIssues(pupil).includes('Styrdokument att kontrollera'));
  }
});

test('en gymnasieelev på introduktionsprogram får läsa ett grundskoleämne', () => {
  const state = createAdminState();
  const im = state.groups.find((g) => g.id === 'im');
  assert.equal(im.regime, 'Grundskola');
  const pupil = state.pupils.find((p) => p.program === 'Introduktionsprogram');
  assert.equal(pupil.regime, 'Gy25');
  // Eleven placeras i exemplet redan vid start; töm gruppen för att pröva bytet.
  im.members = im.members.filter((id) => id !== pupil.id);
  const moved = applyGroup(state, [pupil.id], 'im');
  assert(moved.groups.find((g) => g.id === 'im').members.includes(pupil.id));
  // Undantaget gäller introduktionsprogram, inte gymnasieelever i allmänhet.
  const other = state.pupils.find(
    (p) => p.regime === 'Gy25' && p.program !== 'Introduktionsprogram',
  );
  assert(groupPreview(state, [other.id], 'im').errors.length > 0);
});

test('en planrad som pekar på fel styrdokument för elevens kull märks', () => {
  const state = createAdminState();
  const pupil = state.pupils.find((p) => p.regime === 'Gy25' && !p.goal);
  assert.equal(pupil.start, '2026-08-17');
  pupil.plan[0].syllabus = { subject: 'SVE', item: 'SVESVE03', version: 8 };
  const issues = planSyllabusIssues(pupil);
  assert.equal(issues.length, 1);
  assert(issues[0].issues.some((i) => i.includes('var upphävt')));
  assert(pupilIssues(pupil).includes('Styrdokument att kontrollera'));
});

test('Gy25-elevens studieplan skapas ur huvudmannens poängplan och timplan', () => {
  const state = createAdminState();
  const alma = state.pupils.find((p) => p.id === 'E-1001');
  assert.equal(alma.offering.id, 'sa25');
  assert(alma.offering.basis.startsWith('Poängplan v1'));
  assert.equal(alma.plan.reduce((n, i) => n + i.points, 0), 2500);
  const year1 = alma.plan.filter((i) => i.period.startsWith('Läsår 1'));
  assert(year1.some((i) => i.id === 'MATE1B00X' && i.groupId === 'ma-a'));
  assert(year1.some((i) => i.id === 'HIST1B00X' && i.groupId === null && !i.groupRequired));
  assert(alma.plan.some((i) => i.id === 'RETO1000X' && i.block === 'fordjupning' && i.period === 'Läsår 3'));
  assert(alma.plan.every((i) => !i.syllabus || i.syllabus.item === i.id));
  const freja = state.pupils.find((p) => p.id === 'E-1007');
  assert.equal(freja.offering.id, 'ek25');
  assert(freja.plan.some((i) => i.id === 'FOET1000X'));
  // Gy11-elever har ingen poängplan i exemplet och behåller sitt terminsutdrag.
  const maja = state.pupils.find((p) => p.id === 'E-1013');
  assert.equal(maja.offering, undefined);
  assert.equal(maja.plan.length, 2);
});

test('varje elev är inskriven vid exakt en skolenhet', () => {
  const state = createAdminState();
  assert(state.pupils.every((p) => typeof p.unitId === 'string' && p.unitId.length > 0));
  assert.equal(new Set(state.pupils.map((p) => p.unitId)).size, 1);
});
