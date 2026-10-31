// Real HTTP/OIDC preparation proof. Every mutation is guarded to the owned schema-only copy on3015.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chmodSync } from 'node:fs';
import {
  parseElectivePreparationRead, parseElectivePreparationCommand, createElectivePreparationRef,
  parseElectivePreparationReply, parseElectivePreparationStatus, assertElectivePreparationReplyCommand,
  assertElectivePreparationReplyHash, hashElectivePreparationSource, proposePreparationSlots,
} from '../../web/lib/elective-preparation.ts';
import { captureTjanstPlanHttp } from './tjanst-oidc-fixtures.mjs';
import { createYearPlanCommand } from '../../web/lib/tjanst-year-contract.ts';
import { planLocationQuery } from '../../web/lib/protected-plan-location.ts';

const endpoint = '/api/valbara-block/forberedelse/';
const childTables = ['elective_time_details','elective_time_versions','elective_time_commands','elective_blocks','elective_block_sources','elective_options','teaching_groups','teaching_group_sources','elective_applied_groups','elective_group_snapshots'];
const businessTables = ['elective_preparations','elective_preparation_versions','elective_preparation_commands','elective_school_state',...childTables];
export async function runElectivePreparationOidcScenarios({ snapshot, runtime, staff, participants, browser, seed, checks, evidenceDir, preflight = false }) {
  assert.equal(preflight, false, 'Preparation proof requires all current migrations and a release-bound artifact');
  assert.equal(runtime.baseURL, 'http://127.0.0.1:3015');
  assert.match(snapshot.provenance.database, /^named_timplan_[0-9a-f]{32}$/u);
  const db = snapshot.db;
  assert.equal((await db`select current_database() name`)[0].name, snapshot.provenance.database);
  assert.ok(seed.gy?.frameSourceKey, 'Owned approved gym timetable fixture required');
  const base = runtime.baseURL, contexts = [], pages = {};
  const pass = name => { checks.push({ name, ok: true }); console.log('PASS ' + name); };
  const good = (response, name = 'Preparation HTTP') => { assert.equal(response.status, 200, name + ': ' + JSON.stringify(response.body)); return response.body; };
  const bad = (response, status) => { assert.equal(response.status, status, JSON.stringify(response.body)); return response.body; };
  const request = (route, body, role = 'principalA', headers = {}) => staff.request(pages[role], role, route, body, headers);
  const state = async tables => {
    const result = {};
    for (const table of tables) {
      assert.ok(businessTables.includes(table));
      result[table] = (await db.unsafe(`select coalesce(jsonb_agg(to_jsonb(x) order by to_jsonb(x)::text),'[]'::jsonb) value from public.${table} x`))[0].value;
    }
    return result;
  };
  const classId = seed.gy.frameSourceKey.split(':')[1], year = seed.gy.schoolYear;
  const linkRow = (await db`select to_jsonb(x) value from public.class_timplans x where class_id=${classId} and start_year=${year}`)[0]?.value;
  assert.ok(linkRow); assert.equal(linkRow.unit_id, seed.gy.unitId);
  const scope = { unitId: seed.gy.unitId, planId: linkRow.timplan_id, schoolYear: year, columnId: linkRow.column_id };
  assert.equal(scope.columnId, 'ar1');
  const parent = async () => (await db`select jsonb_build_object('plan',(select to_jsonb(x) from public.timplans x where id=${scope.planId}), 'time',(select jsonb_agg(to_jsonb(x) order by row_key) from public.timplan_time_cells_v2 x where plan_id=${scope.planId})) value`)[0].value;
  const originalParent = await parent(), originalLinks = (await db`select coalesce(jsonb_agg(to_jsonb(x) order by class_id,start_year),'[]') value from public.class_timplans x`)[0].value;
  assert.equal(originalParent.plan.status, 'faststalld');
  let removedLink = false;
  const restoreLink = async () => {
    if (!removedLink) return;
    assert.equal((await db`select count(*)::integer n from public.class_timplans where class_id=${classId} and start_year=${year}`)[0].n, 0, 'Only our removed link may be restored');
    await db.begin(async tx => { await seed.f.actor(tx, 'principalA'); await tx`insert into public.class_timplans select (jsonb_populate_record(null::public.class_timplans,${tx.json(linkRow)})).*`; });
    removedLink = false;
    assert.deepEqual((await db`select to_jsonb(x) value from public.class_timplans x where class_id=${classId} and start_year=${year}`)[0].value, linkRow);
  };
  try {
    for (const role of ['principalA','principalB','principalAB','admin','teacherGroup','pupil']) {
      const context = await browser.newContext({ baseURL: base, viewport: { width: 1440, height: 1000 } });
      contexts.push(context); pages[role] = await context.newPage();
      if (staff.actors[role]) await staff.login(pages[role], role); else await participants.login(pages[role], role);
      pass('real OIDC callback and protected session for preparation: ' + role);
    }
    const read = async () => parseElectivePreparationRead(good(await request(endpoint + 'lasa', scope)), scope);
    const beforeRead = await state(businessTables), initial = await read();
    assert.equal(initial.catalogId, originalParent.plan.gym_basis.catalogId);
    assert.equal(await hashElectivePreparationSource(initial), initial.sourceHash);
    assert.deepEqual(await state(businessTables), beforeRead);
    pass('actual HTTP read uses frozen catalogue and creates no planning rows');
    for (const role of ['principalB','teacherGroup']) bad(await request(endpoint + 'lasa', scope, role), 403);
    bad(await request(endpoint + 'lasa', { ...scope, unitId: seed.f.schools.B }), 403);
    bad(await participants.request(pages.pupil, 'pupil', endpoint + 'lasa', scope), 403);
    pass('actual staff school boundary, teacher role and pupil session cannot read preparation');

    // This is the only temporary register mutation; it is confined to the owned synthetic fixture and restored exactly.
    assert.equal(initial.classes.length, 1);
    await db`delete from public.class_timplans where class_id=${classId} and start_year=${year}`;
    removedLink = true;
    const classless = await read();
    assert.equal(classless.classes.length, 0); assert.equal(classless.preparation, null);
    const frame = classless.frames.find(value => value.rowKey === 'block:iv1');
    assert.ok(frame); assert.deepEqual([frame.pointsHt,frame.pointsVt,frame.needHt,frame.needVt], [100,100,5400,5400]);
    const draft = { id: randomUUID(), classIds: [], frames: [{ rowKey: frame.rowKey, detailId: randomUUID(), expectedDetailRevision: 0, profile: 'terms', slots: proposePreparationSlots(frame, 'terms', [1,2].map(n => ({ positionId: randomUUID(), blockId: randomUUID(), name: `HTTP IV-kursval ${n}` }))) }] };
    const make = (action, current, value = draft) => parseElectivePreparationCommand({ ...scope, contractVersion: 'elective_preparation_v1', action, commandId: randomUUID(), expectedRevision: current.preparation?.revision ?? 0, expectedSourceHash: current.sourceHash, draft: value });
    const send = async command => {
      const ref = await createElectivePreparationRef(command), reply = parseElectivePreparationReply(good(await request(endpoint + 'kommando', command)), ref);
      assertElectivePreparationReplyCommand(reply, command); await assertElectivePreparationReplyHash(reply); return { ref, reply };
    };
    const firstSave = make('save', classless), firstRef = await createElectivePreparationRef(firstSave), beforeGuards = await state(businessTables);
    assert.equal(bad(await request(endpoint + 'kommando', firstSave, 'principalA', { Origin: 'https://untrusted.invalid', 'Sec-Fetch-Site': 'cross-site' }), 403).code, 'csrf');
    assert.deepEqual(await state(businessTables), beforeGuards);
    pass('new preparation command route rejects cross-origin HTTP before any business write');
    await staff.expireMfa(pages.principalA, 'principalA');
    for (const [route, payload] of [['lasa', scope], ['kommando', firstSave], ['status', firstRef]]) {
      assert.equal(bad(await request(endpoint + route, payload), 403).code, 'mfa_required');
    }
    assert.deepEqual(await state(businessTables), beforeGuards);
    const refreshedProof = await staff.login(pages.principalA, 'principalA', { stepUp: true });
    assert.equal(refreshedProof.mfa, true);
    assert.ok(staff.proof().auth.some(attempt => attempt.role === 'principalA' && attempt.stepUp && attempt.status === 'verified'));
    assert.equal((await read()).sourceHash, classless.sourceHash);
    assert.deepEqual(await state(businessTables), beforeGuards);
    pass('all three new preparation routes demand fresh MFA and recover through real OIDC step-up without writing');
    const beforeChildren = await state(childTables), saved = await send(firstSave);
    assert.equal(saved.reply.read.preparation.revision, 1); assert.equal(saved.reply.read.classes.length, 0);
    assert.deepEqual(await state(childTables), beforeChildren);
    pass('actual HTTP saves a classless preparation without creating groups, blocks or synthetic classes');
    const replay = parseElectivePreparationReply(good(await request(endpoint + 'kommando', firstSave)), saved.ref);
    assert.equal(replay.receipt.replayed, true); assert.equal(replay.receipt.revision, 1);
    const status = parseElectivePreparationStatus(good(await request(endpoint + 'status', saved.ref)), saved.ref);
    assert.equal(status.state, 'found'); await assertElectivePreparationReplyHash(status.result);
    bad(await request(endpoint + 'status', saved.ref, 'admin'), 409);
    bad(await request(endpoint + 'status', saved.ref, 'principalB'), 403);
    bad(await participants.request(pages.pupil, 'pupil', endpoint + 'status', saved.ref), 403);
    bad(await request(endpoint + 'status', { ...saved.ref, payloadHash: 'f'.repeat(64) }), 409);
    pass('actual status and replay recover exact own draft and deny another actor or hash');
    const noClass = make('apply', saved.reply.read), beforeDenied = await state(businessTables);
    bad(await request(endpoint + 'kommando', noClass), 400);
    assert.deepEqual(await state(businessTables), beforeDenied);
    bad(await participants.request(pages.pupil, 'pupil', endpoint + 'kommando', firstSave), 403);
    bad(await request(endpoint + 'kommando', firstSave, 'teacherGroup'), 403);
    pass('classless apply and unpermitted write leave all business tables unchanged');

    await restoreLink();
    const linked = await read(); assert.notEqual(linked.sourceHash, classless.sourceHash);
    assert.ok(linked.classes.some(value => value.classId === classId));
    draft.classIds = [classId];
    const preferred = ['GEOG1000X','HIST2A00X'];
    for (const [index, slot] of draft.frames[0].slots.entries()) {
      assert.ok(frame.allowedCodesByPoints['100'].includes(preferred[index]), 'Frozen frame must allow the selected actual100-point course');
      const item = (await db`select sub.value->>'code' subject,it.value->>'code' code,(it.value->>'points')::integer points from public.programplan_catalogs pc cross join lateral jsonb_array_elements(pc.payload->'subjects') sub cross join lateral jsonb_array_elements(sub.value->'items') it where pc.catalog_id=${linked.catalogId} and it.value->>'code'=${preferred[index]} order by sub.value->>'version' limit 1`)[0];
      assert.ok(item); assert.equal(item.points, 100);
      const option = { id: randomUUID(), name: index === 0 ? 'Geografi nivå1' : 'Historia nivå2a', subjectCode: item.subject, levelCode: item.code, language: null, points: item.points };
      slot.options = [option]; slot.groups = [{ id: randomUUID(), optionId: option.id, name: option.name + ' HTTP-grupp', classIds: [classId], estimatedPupils: 10 }];
    }
    const stale = make('apply', { ...linked, sourceHash: classless.sourceHash }), beforeStale = await state(businessTables);
    bad(await request(endpoint + 'kommando', stale), 409); assert.deepEqual(await state(businessTables), beforeStale);
    pass('actual old classless source hash cannot silently absorb a newly restored class link');
    const completeSave = await send(make('save', linked)), ready = completeSave.reply.read;
    const invalidDraft = structuredClone(draft); invalidDraft.frames[0].slots[0].needHt++;
    const wrongSum = make('apply', ready, invalidDraft), beforeFault = await state(businessTables);
    bad(await request(endpoint + 'kommando', wrongSum), 400); assert.deepEqual(await state(businessTables), beforeFault);
    const missingStatus = parseElectivePreparationStatus(good(await request(endpoint + 'status', await createElectivePreparationRef(wrongSum))), await createElectivePreparationRef(wrongSum));
    assert.equal(missingStatus.state, 'not_found');
    pass('actual invalid term total rolls back whole package and leaves no command receipt');

    // Fail the second group's insertion after the first block has been built. Only the owned test DB receives this temporary trigger.
    const secondGroup = draft.frames[0].slots[1].groups[0].id;
    assert.match(secondGroup, /^[0-9a-f-]{36}$/u);
    assert.equal((await db`select to_regprocedure('public.elective_preparation_http_fault()') is null absent`)[0].absent, true);
    const midPackage = make('apply', ready), beforeMidPackage = await state(businessTables);
    await db.unsafe(`create function public.elective_preparation_http_fault() returns trigger language plpgsql as $$begin if new.id::text=TG_ARGV[0] then raise exception 'Owned synthetic mid-package fault';end if;return new;end$$;revoke all on function public.elective_preparation_http_fault() from public,anon,authenticated,service_role,skolplattform_worker;create trigger elective_preparation_http_fault before insert on public.teaching_groups for each row execute function public.elective_preparation_http_fault('${secondGroup}')`);
    try { bad(await request(endpoint + 'kommando', midPackage), 500); }
    finally { await db.unsafe('drop trigger elective_preparation_http_fault on public.teaching_groups;drop function public.elective_preparation_http_fault()'); }
    assert.deepEqual(await state(businessTables), beforeMidPackage);
    const midRef = await createElectivePreparationRef(midPackage);
    assert.equal(parseElectivePreparationStatus(good(await request(endpoint + 'status', midRef)), midRef).state, 'not_found');
    pass('actual second-group failure rolls back first block, both time positions and whole command journal');

    const applyCommand = make('apply', ready), applied = await send(applyCommand);
    assert.equal(applied.reply.receipt.blockIds.length, 2);
    const blocks = good(await request('/api/valbara-block/lasa', { unitId: scope.unitId, schoolYear: scope.schoolYear })).blocks.filter(block => applied.reply.receipt.blockIds.includes(block.id));
    assert.equal(blocks.length, 2);
    for (const [index, slot] of draft.frames[0].slots.entries()) {
      const block = blocks.find(value => value.id === slot.blockId); assert.ok(block?.applied);
      assert.equal(block.groups.length, 1); assert.equal(block.groups[0].id, slot.groups[0].id);
      assert.deepEqual(block.sourceRefs.map(source => [source.classId,source.timeDetailRef.positionId,source.needHt,source.needVt]), [[classId,slot.positionId,index === 0 ? 5400 : 0,index === 0 ? 0 : 5400]]);
    }
    const times = (await db`select positions from public.elective_time_versions where detail_id=${draft.frames[0].detailId} order by revision desc limit 1`)[0].positions;
    assert.deepEqual(times.map(value => [value.pointsHt,value.pointsVt,value.needHt,value.needVt]), [[100,0,5400,0],[0,100,0,5400]]);
    assert.equal((await db`select count(*)::integer n from public.elective_applied_groups where group_id=any(${draft.frames[0].slots.flatMap(slot => slot.groups.map(group => group.id))}::uuid[])`)[0].n, 2);
    pass('one actual HTTP apply atomically creates both100-point blocks, exact term positions and applied groups');
    const appliedReplay = parseElectivePreparationReply(good(await request(endpoint + 'kommando', applyCommand)), applied.ref);
    assert.equal(appliedReplay.receipt.replayed, true); assert.deepEqual(appliedReplay.receipt.blockIds, applied.reply.receipt.blockIds);
    const recovery = parseElectivePreparationStatus(good(await request(endpoint + 'status', applied.ref)), applied.ref);
    assert.equal(recovery.state, 'found'); await assertElectivePreparationReplyHash(recovery.result);
    pass('actual applied receipt survives status recovery and exact same-command retry');

    const current = await read(), sameDraft = structuredClone(current.preparation.draft);
    for (const fd of sameDraft.frames) fd.expectedDetailRevision = current.frames.find(value => value.rowKey === fd.rowKey).detailRevision;
    const childrenBeforeNoop = await state(childTables), noop = await send(make('apply', current, sameDraft));
    assert.deepEqual(noop.reply.receipt.blockIds, applied.reply.receipt.blockIds);
    assert.equal(noop.reply.receipt.revision, current.preparation.revision + 1);
    assert.deepEqual(await state(childTables), childrenBeforeNoop);
    pass('actual new-command reapply reuses every child ID and revision without duplicate groups');

    const tjanst = async (action, payload, choice) => {
      const captured = await captureTjanstPlanHttp(staff, pages.principalA, 'principalA', { unitId: scope.unitId, schoolYear: scope.schoolYear, action, payload, ...(choice ? { choice } : {}) });
      return good(await request('/api/tjanst/plan/kommando', await createYearPlanCommand({ commandId: randomUUID(), ...captured })), 'Actual Tjanst command');
    };
    await tjanst('add_teacher', { personId: seed.teacher.personId });
    for (const slot of draft.frames[0].slots) await tjanst('save_row', { rowId: null, sourceKind: 'teaching_group', sourceKey: `teaching_group:${slot.groups[0].id}:${year}`, personId: seed.teacher.personId, teacherHt: slot.needHt, teacherVt: slot.needVt, comment: '' }, 'manual');
    const staffed = good(await request('/api/tjanst/plan/lasa', { unitId: scope.unitId, schoolYear: year }));
    for (const slot of draft.frames[0].slots) {
      const row = staffed.rows.find(value => value.sourceKey === `teaching_group:${slot.groups[0].id}:${year}`);
      assert.ok(row); assert.equal(row.personId, seed.teacher.personId); assert.equal(row.teacherHt, slot.needHt); assert.equal(row.teacherVt, slot.needVt);
    }
    assert.ok(!staffed.rows.some(row => row.sourceKind === 'class_timplan' && row.sourceKey === seed.gy.frameSourceKey));
    pass('both actual generated groups are staffed through real Tjanst preview/CAS without a duplicate raw class row');
    // Exercise the real root shell from a complete timetable address, deliberately keeping its original all-school selection.
    assert.ok(evidenceDir?.startsWith('/private/tmp/'));
    const uiPage = pages.principalAB, rootReads = [];
    const observeRootRead = response => {
      const request = response.request(), pathname = new URL(response.url()).pathname;
      if (request.method() === 'POST' && [endpoint + 'lasa', '/api/tjanst/plan/lasa'].includes(pathname)) {
        rootReads.push({ pathname, status: response.status(), input: request.postDataJSON() });
      }
    };
    uiPage.on('response', observeRootRead);
    try {
      const address = planLocationQuery({ view: 'timplaner', gym: { kind: 'plan', id: scope.planId, unitId: scope.unitId, offeringId: originalParent.plan.offering_id, version: originalParent.plan.version }, planning: { unitId: null, schoolYear: year, schoolform: 'gymnasium', cohortRelation: 'all', archive: 'active', status: 'all' } });
      await uiPage.goto(base + '/' + address);
      await uiPage.getByTestId('protected-gym-timplan-workspace').waitFor({ state: 'visible', timeout: 30000 });
      await uiPage.getByRole('button', { name: 'Förbered valbara block', exact: true }).click();
      await uiPage.getByRole('heading', { name: 'Block och gruppunderlag finns', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      assert.equal(await uiPage.getByRole('combobox', { name: 'Planeringsskola', exact: true }).inputValue(), 'all');
      assert.equal(await uiPage.getByRole('combobox', { name: 'Planeringsläsår', exact: true }).inputValue(), String(year));
      assert.equal(await uiPage.locator('.preparation-workspace input:not([readonly])').count(), 0);
      assert.ok(rootReads.some(value => value.pathname === endpoint + 'lasa' && value.status === 200 && Object.entries(scope).every(([key, expected]) => value.input[key] === expected)));
      await uiPage.screenshot({ path: evidenceDir + '/preparation-root-applied-desktop.png', fullPage: true });
      chmodSync(evidenceDir + '/preparation-root-applied-desktop.png', 0o600);
      await uiPage.getByRole('button', { name: 'Bemanna grupper', exact: true }).click();
      await uiPage.getByRole('heading', { name: 'Tjänstefördelning', exact: true }).waitFor({ state: 'visible', timeout: 30000 });
      for (const groupId of applied.reply.read.preparation.draft.frames.flatMap(frame => frame.slots.flatMap(slot => slot.groups.map(group => group.id)))) {
        await uiPage.locator(`[data-group-source="teaching_group:${groupId}:${year}"]`).first().waitFor({ state: 'visible', timeout: 30000 });
      }
      assert.equal(new URL(uiPage.url()).searchParams.get('vy'), 'tjanst');
      assert.equal(await uiPage.getByRole('combobox', { name: 'Planeringsskola', exact: true }).inputValue(), scope.unitId);
      assert.equal(await uiPage.getByRole('combobox', { name: 'Planeringsläsår', exact: true }).inputValue(), String(year));
      assert.ok(rootReads.some(value => value.pathname === '/api/tjanst/plan/lasa' && value.status === 200 && value.input.unitId === scope.unitId && value.input.schoolYear === year));
      await uiPage.screenshot({ path: evidenceDir + '/preparation-root-staffing-desktop.png', fullPage: true });
      chmodSync(evidenceDir + '/preparation-root-staffing-desktop.png', 0o600);
      assert.deepEqual(await state(childTables), childrenBeforeNoop);
      pass('real root UI opens complete approved timetable, reuses readonly preparation and reaches exact school/year groups with one staffing click');
    } finally { uiPage.off('response', observeRootRead); }

    // Revoke only our administrator's synthetic mandate via its real parent, then restore its exact original row.
    const assignmentId = seed.f.roles.admin;
    const originalAssignment = (await db`select to_jsonb(x) value from public.access_assignments x where id=${assignmentId}`)[0].value;
    assert.equal(originalAssignment.membership_id, seed.f.membership('admin'));
    assert.equal(originalAssignment.parent_assignment_id, seed.f.roles.principalA);
    const adminRead = parseElectivePreparationRead(good(await request(endpoint + 'lasa', scope, 'admin')), scope);
    const adminDraft = structuredClone(adminRead.preparation.draft);
    for (const frame of adminDraft.frames) frame.expectedDetailRevision = adminRead.frames.find(source => source.rowKey === frame.rowKey).detailRevision;
    const adminCommand = make('save', adminRead, adminDraft), beforeRevoked = await state(businessTables);
    await db.begin(async tx => { await seed.f.actor(tx, 'principalA'); assert.equal((await tx`select public.phase3_revoke_mandate(${assignmentId}) id`)[0].id, assignmentId); });
    try {
      assert.equal((await db`select public.assignment_is_valid(x) valid from public.access_assignments x where id=${assignmentId}`)[0].valid, false);
      for (const [route, payload] of [['lasa', scope], ['kommando', adminCommand], ['status', await createElectivePreparationRef(adminCommand)]]) {
        assert.equal(bad(await request(endpoint + route, payload, 'admin'), 403).code, 'assignment_ended');
      }
      assert.deepEqual(await state(businessTables), beforeRevoked);
    } finally {
      await db`update public.access_assignments set ended_at=${originalAssignment.ended_at},ended_by=${originalAssignment.ended_by} where id=${assignmentId}`;
      assert.deepEqual((await db`select to_jsonb(x) value from public.access_assignments x where id=${assignmentId}`)[0].value, originalAssignment);
    }
    pass('all three new routes immediately reject a truly revoked owned mandate and restore its exact original assignment');

    assert.deepEqual(await parent(), originalParent);
    assert.deepEqual((await db`select coalesce(jsonb_agg(to_jsonb(x) order by class_id,start_year),'[]') value from public.class_timplans x`)[0].value, originalLinks);
    pass('actual preparation, apply and staffing preserve approved timetable, time cells and all annual class links');
    return { scope, preparationId: draft.id, blockIds: applied.reply.receipt.blockIds, groupIds: draft.frames[0].slots.flatMap(slot => slot.groups.map(group => group.id)), rootUi: { entry: 'complete-approved-timetable', initialAllSchools: true, actor: 'principalAB', staffingUnitId: scope.unitId, staffingSchoolYear: year, screenshots: ['preparation-root-applied-desktop.png', 'preparation-root-staffing-desktop.png'] }, checks: checks.length };
  } finally {
    try { await restoreLink(); } finally { for (const context of contexts) await context.close(); }
  }
}
