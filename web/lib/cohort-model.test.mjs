import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createOrganisationState } from './organisation-model.ts';
import { createTimplanState, deriveEducations } from './timplan-model.ts';
import { studentGroups } from './lasar-model.ts';
import {
  copyCohort,
  normalizeClassBinding,
  classesWithBindings,
} from './cohort-model.ts';

test('ny gymnasiekull kopierar kurser och timmar till fristående utkast', () => {
  const org = createOrganisationState(),
    tp = createTimplanState(org);
  const snapshot = structuredClone({ org, tp });
  const next = copyCohort(org, tp.plans, 'huvudman', 'sa25', 2027);
  const source = org.offerings.find((o) => o.id === 'sa25');
  assert.equal(next.offering.cohort, 'Elever som börjar HT 2027');
  assert.equal(next.offering.status, 'planerad');
  assert.equal(next.offering.pointPlans[0].status, 'utkast');
  assert.equal(next.offering.pointPlans[0].decidedOn, undefined);
  assert.deepEqual(
    next.offering.pointPlans[0].specialization,
    source.pointPlans[0].specialization,
  );
  assert.deepEqual(next.offering.permits, []);
  const copied = next.plans.find((p) => p.educationId === next.offering.id);
  assert.equal(copied.status, 'utkast');
  assert.equal(copied.version, 1);
  assert.equal(copied.basis, 'Poängplan v1');
  copied.cells[Object.keys(copied.cells)[0]][0] = 999;
  next.offering.pointPlans[0].specialization.push('LOCAL');
  assert.deepEqual({ org, tp }, snapshot);
});
test('kopiering validerar roll, startår och dubbletter', () => {
  const org = createOrganisationState(),
    tp = createTimplanState(org);
  assert.throws(() => copyCohort(org, tp.plans, 'rektor', 'sa25', 2027));
  assert.throws(() => copyCohort(org, tp.plans, 'huvudman', 'sa25', 2026));
  assert.throws(() => copyCohort(org, tp.plans, 'huvudman', 'sa25', NaN));
  const next = copyCohort(org, tp.plans, 'huvudman', 'sa25', 2027);
  assert.throws(
    () => copyCohort(next.org, next.plans, 'huvudman', 'sa25', 2027),
    /redan/,
  );
});
test('grundskolekopia behåller årskurser och timplan utan poängplan', () => {
  const org = createOrganisationState(),
    tp = createTimplanState(org);
  const next = copyCohort(org, tp.plans, 'huvudman', 'gr', 2027);
  assert.equal(next.offering.cohort, 'Läsåret 2027/28');
  assert.deepEqual(next.offering.pointPlans, []);
  assert.deepEqual(
    next.offering.grades,
    org.offerings.find((o) => o.id === 'gr').grades,
  );
  assert.equal(
    next.plans.find((p) => p.educationId === next.offering.id).status,
    'utkast',
  );
});
test('klasskoppling kräver ett beslut och en giltig kolumn', () => {
  const state = createTimplanState();
  const plan = state.plans.find(
    (p) => p.educationId === 'gr' && p.status === 'fastställd',
  );
  const education = state.educations.find((e) => e.id === 'gr');
  const input = {
    unitId: 'unit',
    className: ' 8a ',
    startYear: 2026,
    timplanId: plan.id,
    columnId: 'ak8',
  };
  assert.equal(
    normalizeClassBinding(input, plan, education.columns).className,
    '8A',
  );
  assert.throws(
    () =>
      normalizeClassBinding(
        input,
        { ...plan, status: 'utkast' },
        education.columns,
      ),
    /fastställd/,
  );
  assert.throws(
    () =>
      normalizeClassBinding(
        { ...input, columnId: 'ar1' },
        plan,
        education.columns,
      ),
    /årskurs/,
  );
});
test('vald klasskoppling överstyr namngissning endast under sitt läsår', () => {
  const org = createOrganisationState(),
    state = createTimplanState(org),
    educations = deriveEducations(org);
  const plan = state.plans.find(
    (p) => p.educationId === 'gr' && p.status === 'fastställd',
  );
  const classes = [{ name: '8A', kind: 'grundskola', grade: 8, pupils: 20 }];
  const bindings = [
    {
      unitId: 'unit',
      className: '8A',
      startYear: 2027,
      timplanId: plan.id,
      columnId: 'ak9',
    },
  ];
  const mapped = classesWithBindings(
    classes,
    bindings,
    state.plans,
    educations,
    2027,
  );
  const groups = studentGroups(educations, mapped, 2027);
  assert.equal(groups.find((g) => g.id === 'klass:8A').columnId, 'ak9');
  assert.equal(mapped[0].pupils, 20);
  assert.equal(
    classesWithBindings(classes, bindings, state.plans, educations, 2026)[0]
      .columnId,
    undefined,
  );
});
