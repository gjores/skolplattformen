#!/usr/bin/env node
// Test the real commands in a new PostgreSQL instance, using only synthetic data.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { seedElectiveTimeFrame } from './elective-time-fixtures.mjs';
import { createTjanstFixture, planRead, staffWithDuties } from './tjanst-fixtures.mjs';
import { yearManual, yearPreview, yearRowPayload, yearSend } from './tjanst-year-fixtures.mjs';
import { parseStudyGroupRead, parseStudyGroupReply } from '../../web/lib/study-group-contract.ts';
import { parseYearPlanReadReply } from '../../web/lib/tjanst-contract.ts';

const instance = await createEphemeralMigratedDb();
try {
  await instance.db.begin(async tx => {
    const fixture = await createTjanstFixture(tx);
    const first = await seedElectiveTimeFrame(tx, fixture);
    const second = await seedElectiveTimeFrame(tx, fixture);
    const { unitId, schoolYear } = first;
    const [classA, classB] = [first, second].map(s => s.frameSourceKey.split(':')[1]);
    const scope = { unitId, schoolYear };
    const teacher = await staffWithDuties(tx, fixture, { familyName: 'Svensklärare', startsOn: '2025-07-01',
      duties: [{ unitId, percent: 100, startsOn: `${schoolYear}-07-01` }] });
    await fixture.actor(tx, 'principalA');
    const read = async () => parseStudyGroupRead((await tx`select public.study_group_read(${tx.json(scope)}) response`)[0].response.result, scope);
    const readPlan = async () => parseYearPlanReadReply(await planRead(tx, scope), scope);
    const write = async (t, action, payload, commandId = randomUUID()) => {
      const command = { contractVersion: 'study_group_v1', commandId, ...scope, action, payload };
      const [response] = await t`select public.study_group_command(${t.json(command)}) result`;
      return parseStudyGroupReply(response.result.result, command);
    };
    const denied = (action, payload, code, hint) => assert.rejects(
      tx.savepoint(t => write(t, action, payload)), { code, hint });

    const original = await read();
    const sources = [classA, classB].map(classId => {
      const found = original.svenskaSources.find(s => s.classId === classId && s.level === 1);
      assert.ok(found, 'link an alternative row for both synthetic empty classes');
      return { classId, sourceKey: found.sourceKey };
    });
    assert.equal(original.pupils.some(p => p.classIds.some(id => id === classA || id === classB)), false);
    const swedishA = { groupId: randomUUID(), name: 'Svenska A', subjectCode: 'SVEN', classIds: [classA], forecast: 20, expectedRevision: 0 };
    const swedishB = { ...swedishA, groupId: randomUUID(), name: 'Svenska B', classIds: [classB] };
    const sva = { ...swedishA, groupId: randomUUID(), name: 'SvA A och B', subjectCode: 'SVEA', classIds: [classA, classB], forecast: 8 };
    const payload = { sources, groups: [swedishA, swedishB, sva] };
    const commandId = randomUUID();
    await fixture.actor(tx, 'principalB');
    await assert.rejects(tx.savepoint(t => write(t, 'organize_swedish', payload)), { code: '42501' });
    await fixture.actor(tx, 'principalA');
    const created = await write(tx, 'organize_swedish', payload, commandId);
    assert.deepEqual(created.read.svenskaSources.find(s => s.sourceKey === sources[0].sourceKey).groupIds,
      [sva.groupId, swedishA.groupId].sort());
    assert.equal((await write(tx, 'organize_swedish', payload, commandId)).receipt.replayed, true);
    const plan = await readPlan();
    assert.ok(sources.every(s => !plan.classes.find(c => c.classId === s.classId).needs.some(n => n.sourceKey === s.sourceKey)));
    const groups = plan.groups.filter(g => g.svenska);
    assert.equal(groups.length, 3);
    const expected = original.svenskaSources.find(s => s.sourceKey === sources[0].sourceKey);
    assert.ok(groups.every(g => g.needHt === expected.needHt && g.needVt === expected.needVt));
    const need = groups.find(g => g.groupId === sva.groupId);
    assert.equal(need.svenska.forecast, 8);
    console.log('PASS Prognosgrupper kan organiseras atomiskt och ersätter de tillhörande klassraderna.');

    const preview = await yearPreview(tx, { ...scope, mode: 'row', sourceKey: need.sourceKey, rowId: null });
    const candidate = preview.candidates.find(c => c.personId === teacher.personId);
    assert.ok(candidate);
    await yearSend(tx, unitId, schoolYear, 'save_row', yearRowPayload(preview, yearManual(candidate),
      { sourceKind: 'study_group', teacherHt: need.needHt, teacherVt: need.needVt }));
    const frozen = (await tx`select snapshot from public.study_group_snapshots where group_id=${sva.groupId}`)[0].snapshot;
    assert.equal(frozen.svenska.forecast, 8);
    const assigned = (await readPlan()).rows.find(r => r.groupId === sva.groupId);
    assert.ok(assigned);
    console.log('PASS SvA-gruppen går att bemanna innan elevplacering, med prognos i källans version.');

    const pupil = fixture.pupils.inGroup;
    const startsOn = `${schoolYear}-09-01`, endsOn = `${schoolYear + 1}-06-30`;
    const member = { pupilId: pupil, startsOn, endsOn, source: 'manual', sourceRef: null };
    await denied('add_members', { groupId: sva.groupId, members: [member] }, '22023', 'study_group_swedish_class_period');
    await tx`update public.pupil_class_memberships set class_id=${classA},starts_on=${startsOn},ends_on=${endsOn} where pupil_id=${pupil} and unit_id=${unitId}`;
    const added = await write(tx, 'add_members', { groupId: sva.groupId, members: [member] });
    assert.equal(added.read.memberships.find(m => m.pupilId === pupil && m.groupId === sva.groupId).groupId, sva.groupId);
    assert.equal(added.read.groups.find(g => g.id === sva.groupId).revision, 1);
    await denied('add_members', { groupId: swedishA.groupId, members: [member] }, '40001', 'study_group_member_overlap');
    assert.deepEqual((await readPlan()).rows.find(r => r.groupId === sva.groupId), assigned);
    console.log('PASS Elevplacering behåller grupp och lärartilldelning samt förhindrar dubbel placering.');

    const review = { ...payload, groups: payload.groups.map(g => ({ ...g, expectedRevision: 1 })) };
    const noChange = await write(tx, 'organize_swedish', review);
    assert.ok(noChange.read.groups.every(g => g.revision === 1));
    await denied('organize_swedish', { sources, groups: review.groups.filter(g => g.groupId !== sva.groupId) },
      '22023', 'study_group_swedish_complete');
    await denied('organize_swedish', { ...review, groups: payload.groups }, '40001', 'study_group_revision_conflict');
    console.log('PASS Förnyad avstämning behåller identiteter och en fjärrändring kan inte skrivas över.');

    const retired = await write(tx, 'retire_group', { groupId: swedishB.groupId, expectedRevision: 1 });
    assert.equal(retired.read.groups.find(g => g.id === swedishB.groupId).active, false);
    assert.deepEqual(retired.read.svenskaSources.find(s => s.classId === classB && s.level === 1).groupIds, [sva.groupId]);
    assert.ok(!(await readPlan()).groups.some(g => g.groupId === swedishB.groupId));
    console.log('PASS En grupp utan deltagare kan avvecklas och kvarvarande grupp bär klassens undervisningsbehov.');

    const knownGroupId = randomUUID();
    const knownDraft = { id: knownGroupId, expectedRevision: 0, name: 'Svenska med kända deltagare', startsOn, endsOn,
      course: { subjectCode: 'SVEN', subjectVersion: Number(/:SVEN:(\d+):SVEN1000X/u.exec(sources[1].sourceKey)[1]), itemCode: 'SVEN1000X', points: 100, languageCode: null },
      minutesHt: expected.needHt, minutesVt: expected.needVt, parallelSetId: knownGroupId, classIds: [classB], origin: { kind: 'classes' } };
    await write(tx, 'save_group', knownDraft);
    const adopt = { ...swedishB, groupId: knownGroupId, name: knownDraft.name, forecast: null, expectedRevision: 1 };
    const otherGroups = review.groups.filter(g => g.groupId !== swedishB.groupId);
    await denied('organize_swedish', { sources, groups: [...otherGroups, adopt] }, '22023', 'study_group_swedish_period');
    await write(tx, 'save_group', { ...knownDraft, startsOn: `${schoolYear}-07-01`, expectedRevision: 1 });
    const knownPupil = fixture.pupils.inGroup2;
    await tx`update public.pupil_class_memberships set class_id=${classB},starts_on=${startsOn},ends_on=${endsOn} where pupil_id=${knownPupil} and unit_id=${unitId}`;
    await write(tx, 'add_members', { groupId: knownGroupId, members: [{ ...member, pupilId: knownPupil }] });
    const adopted = await write(tx, 'organize_swedish', { sources, groups: [...otherGroups, { ...adopt, expectedRevision: 2 }] });
    assert.equal(adopted.read.groups.find(g => g.id === knownGroupId).svenska.forecast, null);
    assert.ok(adopted.read.memberships.some(m => m.groupId === knownGroupId && m.pupilId === knownPupil));
    console.log('PASS En befintlig grupp med kända deltagare behåller ID och deltagare, och kursperioden måste täckas.');
  });
} finally {
  await instance.end();
}
