#!/usr/bin/env node
// En tillfällig PostgreSQL med repots migrationer och enbart syntetiska elever.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createEphemeralMigratedDb } from './ephemeral-migrated-db.mjs';
import { createTjanstFixture, seedGy25Class } from './tjanst-fixtures.mjs';

const environment = await createEphemeralMigratedDb();
const { db } = environment;
const checks = [];

try {
  const setup = await db.begin(async tx => {
    const fixture = await createTjanstFixture(tx);
    const linked = await seedGy25Class(tx, fixture, 'BF-SYN-A');
    const classB = randomUUID();
    const anchor = (await tx`select starts_on::text from public.school_classes where id=${linked.classId}`)[0].starts_on;
    const first = (await tx`select (${anchor}::date+1)::text as value`)[0].value;
    const late = (await tx`select (${anchor}::date+15)::text as value`)[0].value;
    const unitId = fixture.schools.A;
    const schoolYear = linked.year;
    const offeringId = linked.offeringId;
    await tx`insert into public.school_classes(id,customer_id,organizer_id,unit_id,offering_id,name,start_year)
      values(${classB},${fixture.id(1)},${fixture.id(2)},${unitId},${offeringId},'BF-SYN-B',${schoolYear})`;
    await tx`delete from public.class_timplans where class_id=${linked.classId} and start_year=${schoolYear}`;
    const extra = Array.from({ length: 46 }, (_, index) => 'extra' + index);
    const keys = ['ready', 'raced', 'booked', 'old', 'source', 'protected', 'unselected', ...extra];
    const numbers = (await tx`select n from (
      select 'TEST-20110101-'||lpad(i::text,4,'0') n from generate_series(1,900) i
      ) candidates where public.phase4_synthetic_birth_date(n) is not null order by n limit ${keys.length}`).map(row => row.n);
    const pupils = {};
    for (const [index, kind] of keys.entries()) {
      const pupilId = randomUUID();
      const placementId = randomUUID();
      pupils[kind] = { pupilId, placementId };
      const startsOn = kind === 'ready' ? late : anchor;
      await tx`insert into public.synthetic_pupil_numbers(personal_number) values(${numbers[index]})`;
      await tx`insert into public.pupils(id,customer_id,organizer_id,display_name,personal_number,anonymous_name,protected_identity)
        values(${pupilId},${fixture.id(1)},${fixture.id(2)},${'Syntetiskt mottagande ' + index},${numbers[index]},${'Syntetiskt alias ' + index},${kind === 'protected'})`;
      await tx`insert into public.pupil_placements(id,customer_id,organizer_id,pupil_id,unit_id,offering_id,starts_on)
        values(${placementId},${fixture.id(1)},${fixture.id(2)},${pupilId},${unitId},${offeringId},${startsOn})`;
      if (kind === 'booked' || kind === 'old') {
        await tx`insert into public.pupil_class_memberships(customer_id,organizer_id,pupil_id,unit_id,class_id,placement_id,starts_on,ends_on)
          values(${fixture.id(1)},${fixture.id(2)},${pupilId},${unitId},${linked.classId},${placementId},${kind === 'booked' ? late : anchor},${kind === 'old' ? anchor : null})`;
      }
      if (kind === 'source') {
        await tx`insert into public.pupil_field_state(customer_id,organizer_id,pupil_id,field,source,actor_id,revision)
          values(${fixture.id(1)},${fixture.id(2)},${pupilId},'class','ss12000',${fixture.membership('admin')},1)`;
      }
    }
    return { fixture, linked, classB, anchor, first, late, pupils, extra, scope: { unitId, schoolYear, offeringId } };
  });

  const { fixture, linked, classB, anchor, first, late, pupils, extra, scope } = setup;
  const read = (request, actor = 'admin', connection = db) => connection.begin(async tx => {
    await fixture.actor(tx, actor);
    await tx`set local role skolplattform_worker`;
    return (await tx`select public.elevmottagande_read(${tx.json(request)}) value`)[0].value;
  });
  const allocate = (request, actor = 'admin', connection = db) => connection.begin(async tx => {
    await fixture.actor(tx, actor);
    await tx`set local role skolplattform_worker`;
    return (await tx`select public.elevmottagande_allocate(${tx.json(request)}) value`)[0].value;
  });
  const row = (key, startsOn = late) => ({ placementId: pupils[key].placementId, classId: classB, startsOn });

  const future = await read({ ...scope, on: anchor });
  assert.equal(future.body.rows.length, 52, 'skyddad elev utan särskild behörighet uteblir');
  assert.equal(future.body.rows.find(x => x.placementId === pupils.booked.placementId).classification, 'booked');
  assert.equal(future.body.classes.find(x => x.id === linked.classId).timetable, null);
  assert.ok(future.body.timetableChoices.some(x => x.id === linked.planId));
  const nextYear = await read({ ...scope, schoolYear: scope.schoolYear + 1, on: anchor });
  assert.equal(nextYear.body.classes.find(x => x.id === linked.classId).timetable.columnId, 'ar2');
  const after = await read({ ...scope, on: first });
  assert.equal(after.body.rows.find(x => x.placementId === pupils.old.placementId).classification, 'historical');
  assert.equal(after.body.rows.find(x => x.placementId === pupils.source.placementId).canAllocate, false);
  checks.push('daterade klasser, källägarskap och exakt timplansår');

  assert.equal((await read({ ...scope, on: anchor }, 'principalA')).body.canAllocate, false);
  await assert.rejects(read({ ...scope, on: anchor }, 'principalB'), { code: '42501' });
  await assert.rejects(allocate({ ...scope, action: 'preview', on: anchor, rows: [row('ready')] }, 'principalA'), { code: '42501' });
  await assert.rejects(allocate({ ...scope, action: 'preview', on: anchor, rows: [row('protected')] }), { code: '42501' });
  await db.begin(async tx => {
    await fixture.actor(tx, 'hm');
    await tx`select public.phase4_grant_protected_permission(${fixture.roles.admin},${scope.unitId})`;
  });
  assert.ok(!(await read({ ...scope, on: anchor })).body.rows.some(x => x.pupilId === pupils.protected.pupilId));
  await assert.rejects(allocate({ ...scope, action: 'preview', on: anchor, rows: [row('protected')] }), { code: '42501' });
  await db.begin(async tx => {
    await fixture.actor(tx, 'admin');
    await tx`select set_config('app.fake_today',${anchor},true)`;
    await tx`set local role skolplattform_worker`;
    const active = (await tx`select public.elevmottagande_read(${tx.json({ ...scope, on: anchor })}) as value`)[0].value;
    assert.ok(active.body.rows.some(x => x.pupilId === pupils.protected.pupilId));
    assert.deepEqual(active.protectedIds, [pupils.protected.pupilId]);
  });
  checks.push('skolmandat, skrivrätt och aktiv placering för särskild skyddsbehörighet');

  const proposal = { ...scope, action: 'preview', on: first, rows: [row('ready'), row('raced'), row('old'), row('source'), row('booked')] };
  const preview = (await allocate(proposal)).body;
  assert.equal(preview.rows.filter(x => x.status === 'ready').length, 2);
  assert.equal(preview.rows.find(x => x.placementId === pupils.booked.placementId).reason, 'existing_membership');
  assert.equal(preview.rows.find(x => x.placementId === pupils.old.placementId).reason, 'existing_membership');
  assert.equal(preview.rows.find(x => x.placementId === pupils.source.placementId).reason, 'source_owned');
  assert.deepEqual(preview.classes.map(({ before, after }) => [before, after]), [[0, 2]]);
  const invalid = (await allocate({ ...proposal, rows: [row('ready', anchor)] })).body;
  assert.equal(invalid.rows[0].reason, 'placement_period');
  checks.push('fryst urval, tidigare klass och eget placeringsdatum');

  const bulkPreview = (await allocate({ ...proposal, rows: [row('ready'), row('raced'), ...extra.map(key => row(key))] })).body;
  assert.equal(bulkPreview.rows.length, 48);
  assert.equal(bulkPreview.rows.filter(x => x.status === 'ready').length, 48);
  assert.ok(!bulkPreview.rows.some(x => x.placementId === pupils.unselected.placementId));

  await db.begin(async tx => {
    await fixture.actor(tx, 'admin');
    await tx`set local role skolplattform_worker`;
    const placement = pupils.raced;
    const q = { pupilId: placement.pupilId, schoolYear: scope.schoolYear, caseId: null,
      expectedVersion: future.body.rows.find(x => x.placementId === placement.placementId).version,
      kind: 'class', payload: { placementId: placement.placementId, classId: linked.classId, startsOn: late, endsOn: null } };
    assert.equal((await tx`select public.phase4_change_pupil(${tx.json(q)}) value`)[0].value.kind, 'success');
  });
  const save = { ...scope, action: 'save', on: first, commandId: randomUUID(), previewToken: bulkPreview.previewToken };
  const [receipt, replay] = await Promise.all([allocate(save), allocate(save, 'admin', environment.connect())]);
  assert.deepEqual(receipt, replay);
  assert.equal(receipt.body.rows.filter(x => x.status === 'saved').length, 47);
  const raced = receipt.body.rows.find(x => x.placementId === pupils.raced.placementId);
  assert.equal(raced.status, 'changed');
  assert.equal(raced.membership.classId, linked.classId);
  assert.equal(receipt.body.rows.find(x => x.placementId === pupils.ready.placementId).membership.startsOn, late);
  const ids = ['ready', 'raced', 'unselected', ...extra].map(key => pupils[key].pupilId);
  const memberships = await db`select pupil_id from public.pupil_class_memberships where pupil_id=any(${ids}::uuid[])`;
  assert.equal(memberships.length, 48);
  assert.ok(!memberships.some(x => x.pupil_id === pupils.unselected.pupilId));
  checks.push('samtidigt omförsök och omgranskning utan dubbla medlemskap');

  await assert.rejects(allocate({ ...save, commandId: randomUUID() }), { code: '40001' });
  const status = (await allocate({ ...scope, action: 'status' }, 'principalA')).body;
  assert.deepEqual(status, receipt.body);
  assert.equal((await read({ ...scope, on: first })).body.latestCommandId, save.commandId);
  await assert.rejects(allocate({ ...scope, action: 'status' }, 'principalB'), { code: '42501' });
  checks.push('återläst kvitto på samma skola och förbud över skolgränsen');

  console.log(JSON.stringify({ status: 'PASS', checks, migrations: environment.provenance.applied }));
} finally {
  await environment.end();
}
