// Additive fixture for the existing synthetic Nystartsgymnasiet in the protected local pilot.
// Run while signed in as the school's test principal. --check rolls back, --apply installs.
// The school year, individual identifiers and other schools are never inferred from this process's environment.
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { assertTarget } from './verify-target.mjs';

const postgres = createRequire(new URL('../../web/package.json', import.meta.url))('postgres');
const customer = '33000000-0000-4000-8000-000000000001';
const organizer = '33000000-0000-4000-8000-000000000011';
const unit = 'efe5d3b6-40f6-46b9-ac1b-91f3b42944db';
const year = 2026;
const startsOn = '2026-08-17';
const endsOn = '2027-06-30';
const cohort = '2026–2029';
const programs = [
  { key: 'bf', code: 'BF25', name: 'Barn- och fritidsprogrammet 2026', template: '01a50f6b-c807-4268-84b4-d7e0e44f120a',
    classes: [{ name: 'BF26', pupils: 30 }] },
  { key: 'sa', code: 'SA25', name: 'Samhällsvetenskapsprogrammet 2026', template: '17578fd5-f854-4fa7-881f-18a2d81df9a5',
    classes: [{ name: 'SA26A', pupils: 29 }, { name: 'SA26B', pupils: 31 }] },
  { key: 'te', code: 'TE25', name: 'Teknikprogrammet 2026', template: '9b610bb9-d805-4db8-95e1-5ecfc1d4336e',
    classes: [{ name: 'TE26', pupils: 30 }] },
];
const classes = programs.flatMap(program => program.classes);
const teachers = [
  'Berg', 'Dahl', 'Ek', 'Fors', 'Gran', 'Hed', 'Lind', 'Lund',
  'Malm', 'Norén', 'Nyström', 'Palm', 'Sjö', 'Sten', 'Strand', 'Ås',
];
const languages = [{ code: 'fr', name: 'Franska' }, { code: 'es', name: 'Spanska' }];
const newRooms = [
  { name: 'Sal 4', typ: 'Allmän sal', platser: 34, utrustning: [] },
  { name: 'Sal 5', typ: 'Allmän sal', platser: 34, utrustning: [] },
  { name: 'Tekniklabbet', typ: 'Laborationssal', platser: 34, utrustning: ['Datorer'] },
];

// Stable UUIDs identify these fixtures independently of run date and database-assigned IDs.
function id(key) {
  const hex = createHash('sha256').update('skolplattform:nystartsgymnasiet:2026:' + key).digest('hex');
  return [hex.slice(0, 8), hex.slice(8, 12), '4' + hex.slice(13, 16), '8' + hex.slice(17, 20), hex.slice(20, 32)].join('-');
}

async function setActor(tx) {
  const [session] = await tx`
    select s.id, s.identity_id, s.membership_id, s.assignment_id
    from public.app_sessions s
    join public.access_assignments a on a.id = s.assignment_id and a.membership_id = s.membership_id
    join public.mandate_units m on m.assignment_id = a.id
    where m.unit_id = ${unit} and a.customer_id = ${customer} and a.organizer_id = ${organizer}
      and a.function = 'rektor' and public.assignment_is_valid(a)
      and s.revoked_at is null and least(s.expires_at, s.absolute_expires_at) > now()
    order by s.last_seen_at desc limit 1`;
  assert.ok(session, 'Logga in i 3012 som rektor för Nystartsgymnasiet före körning.');
  for (const [key, value] of Object.entries({
    session_id: session.id, identity_id: session.identity_id, membership_id: session.membership_id,
    assignment_id: session.assignment_id, customer_id: customer, correlation_id: randomUUID(),
  })) {
    await tx`select set_config(${'app.' + key}, ${value}, true)`;
  }
  await tx`select public.phase5_programplan_session_check()`;
  await tx`select public.tjanst_plan_scope(a, ${unit}) from public.access_assignments a where a.id = ${session.assignment_id}`;
  return session;
}

async function copyPlans(tx) {
  const [settings] = await tx`select current_setting('session_replication_role') role`;
  assert.equal(settings.role, 'origin');
  for (const program of programs) {
    const offering = id(program.key + ':offering');
    const points = id(program.key + ':points');
    const plan = id(program.key + ':plan');
    const series = id(program.key + ':series');
    const [source] = await tx`
      select o.orientation_code, o.id offering_id, t.name_at_creation, t.basis, t.gym_basis,
             p.catalog_id, p.catalog_fetched, p.specialization, p.term_distribution, p.basis_reference, p.revision,
             public.phase5_plan_decision_profile(t.gym_basis) profile,
             exists(select 1 from public.timplan_time_models m where m.plan_id = t.id) minutes_model
      from public.timplans t join public.point_plans p on p.id = t.source_programplan_id
      join public.offerings o on o.id = t.offering_id and o.id = p.offering_id
      where t.id = ${program.template} and t.unit_id = ${unit} and o.unit_id = ${unit} and t.organizer_id = ${organizer}
        and t.status = 'faststalld' and p.status = 'faststalld' and o.archived_at is null
        and p.basis_reference #>> '{programRef,code}' = ${program.code}`;
    assert.ok(source?.profile, 'Fastställd Gy25-mall för ' + program.code + ' saknas.');
    const reference = { ...source.basis_reference, startedOn: startsOn };
    const schoolPlanName = program.classes.map(c => c.name).join(' och ');
    const frozen = {
      ...source.gym_basis, planId: points, offeringId: offering, version: 1, revision: source.revision,
      educationRevision: 0, basisReference: reference, distribution: source.term_distribution,
      education: { ...source.gym_basis.education, name: program.name, cohort },
    };
    await tx`
      insert into public.offerings(id, organizer_id, unit_id, kind, name, local_code, program_code, orientation_code, cohort, status, catalog_fetched, start_year)
      select ${offering}, organizer_id, unit_id, kind, ${program.name}, ${schoolPlanName}, program_code,
             orientation_code, ${cohort}, status, catalog_fetched, ${year}
      from public.offerings where id = ${source.offering_id}`;
    await tx`insert into public.offering_units(offering_id, unit_id, organizer_id) values(${offering}, ${unit}, ${organizer}) on conflict do nothing`;
    await tx`
      insert into public.timplan_series(id, organizer_id, offering_id, unit_id, name, normalized_name, revision, legacy_default)
      values(${series}, ${organizer}, ${offering}, ${unit}, ${schoolPlanName}, lower(${schoolPlanName}), 1, false)`;
    await tx`
      select public.phase5_programplan_validate_basis(${tx.json(reference)}, o, null)
      from public.offerings o where o.id = ${offering}`;
    await tx`select public.phase5_gym_timplan_require_source(${tx.json(frozen)})`;

    // Restore targeted, already finalized synthetic snapshots. The regular decision flow
    // advances today's draft and cannot import a historic decision or a deliberately bounded test cohort.
    // The fixture has checked canonical source, catalog, date and unit. All remaining writes use normal triggers.
    await tx`set local session_replication_role = replica`;
    await tx`
      insert into public.point_plans(id, organizer_id, offering_id, version, status, specialization, catalog_fetched, decided_on, revision, catalog_id, basis_reference, term_distribution)
      select ${points}, organizer_id, ${offering}, 1, status, specialization, catalog_fetched, decided_on, revision,
             catalog_id, ${tx.json(reference)}, term_distribution
      from public.point_plans where id = ${source.gym_basis.planId}`;
    await tx`
      insert into public.timplans(id, organizer_id, offering_id, unit_id, version, status, basis, catalog_fetched, decided_on, revision,
                                 gym_basis, source_programplan_id, series_id, name_at_creation)
      select ${plan}, organizer_id, ${offering}, unit_id, 1, status, basis, catalog_fetched, decided_on, revision,
             ${tx.json(frozen)}, ${points}, ${series}, ${schoolPlanName}
      from public.timplans where id = ${program.template}`;
    await tx`
      insert into public.timplan_cells(timplan_id, row_id, hours, allocated)
      select ${plan}, row_id, hours, allocated from public.timplan_cells where timplan_id = ${program.template}`;
    if (source.minutes_model) {
      await tx`insert into public.timplan_time_models(plan_id, model, origin) values(${plan}, 'school_terms_annual_apl_v2', 'new')`;
      await tx`
        insert into public.timplan_time_cells_v2(plan_id, row_key, school_minutes, annual_apl_minutes)
        select ${plan}, row_key, school_minutes, annual_apl_minutes from public.timplan_time_cells_v2 where plan_id = ${program.template}`;
    }
    for (const schoolClass of program.classes) {
      await tx`
        insert into public.school_classes(id, customer_id, organizer_id, unit_id, offering_id, name, start_year, starts_on, ends_on, validity_source)
        values(${id(schoolClass.name)}, ${customer}, ${organizer}, ${unit}, ${offering}, ${schoolClass.name}, ${year},
               ${startsOn}, ${endsOn}, 'education_start')`;
    }
    await tx`set local session_replication_role = origin`;

    const [ready] = await tx`
      select public.phase5_class_blockers(t, o) blockers
      from public.timplans t join public.offerings o on o.id = t.offering_id
      join public.point_plans p on p.id = t.source_programplan_id and p.offering_id = o.id
      join public.timplan_series s on s.id = t.series_id and s.offering_id = o.id and s.unit_id = t.unit_id
      where t.id = ${plan} and t.unit_id = ${unit} and t.status = 'faststalld' and p.status = 'faststalld'`;
    assert.deepEqual(ready?.blockers, [], 'Klasskopplingen behöver fastställda referenser för ' + program.code);
    for (const schoolClass of program.classes) {
      await tx`
        insert into public.class_timplans(unit_id, class_name, start_year, timplan_id, column_id, class_id)
        values(${unit}, ${schoolClass.name}, ${year}, ${plan}, 'ar1', ${id(schoolClass.name)})`;
      await tx`select public.phase5_class_audit(${id(schoolClass.name)}, 'class_created')`;
      await tx`select public.phase5_class_audit(${id(schoolClass.name)}, 'class_plan_linked')`;
    }
  }
}

async function addPupils(tx) {
  const pupilCodes = await tx`
    select n.personal_number from public.synthetic_pupil_numbers n
    where n.birth_date between date '2010-01-01' and date '2010-12-31'
      and not exists(select 1 from public.pupils p where p.personal_number = n.personal_number)
    order by n.personal_number limit 120 for update of n`;
  assert.equal(pupilCodes.length, 120, '120 lediga syntetiska elevnummer krävs.');
  const pupils = [];
  for (const program of programs) {
    for (const schoolClass of program.classes) {
      for (let number = 1; number <= schoolClass.pupils; number++) {
        const shortName = schoolClass.name + ' ' + String(number).padStart(2, '0');
        const pupil = { id: id('pupil:' + shortName), classId: id(schoolClass.name), number, program: program.key };
        const placement = id('placement:' + shortName);
        await tx`
          insert into public.pupils(id, customer_id, organizer_id, display_name, personal_number, anonymous_name)
          values(${pupil.id}, ${customer}, ${organizer}, ${'Syntetisk elev ' + shortName}, ${pupilCodes[pupils.length].personal_number},
                 ${'Elev ' + shortName})`;
        await tx`
          insert into public.pupil_placements(id, customer_id, organizer_id, pupil_id, unit_id, offering_id, starts_on, ends_on)
          values(${placement}, ${customer}, ${organizer}, ${pupil.id}, ${unit}, ${id(program.key + ':offering')}, ${startsOn}, ${endsOn})`;
        await tx`
          insert into public.pupil_class_memberships(id, customer_id, organizer_id, pupil_id, unit_id, class_id, placement_id, starts_on, ends_on)
          values(${id('class-member:' + shortName)}, ${customer}, ${organizer}, ${pupil.id}, ${unit}, ${pupil.classId},
                 ${placement}, ${startsOn}, ${endsOn})`;
        pupils.push(pupil);
      }
    }
  }
  return pupils;
}

async function addLanguageGroups(tx, session, pupils) {
  const valplan = id('modern-languages');
  const classIds = programs.find(p => p.key === 'sa').classes.map(c => id(c.name));
  const [schoolPlan] = await tx`select gym_basis from public.timplans where id = ${id('sa:plan')}`;
  const [schoolNeeds] = await tx`select public.tjanst_class_source_basis(${unit}, ${year}) basis`;
  const block = schoolNeeds.basis.find(c => classIds.includes(c.classId))?.needs.find(n => n.rowKey === 'block:mosp');
  assert.ok(block && block.needHt > 0 && block.needVt > 0, 'Språkblocket saknar planerad tid.');
  const [course] = await tx`
    select (s.value->>'version')::integer version, (l.value->>'points')::integer points
    from public.programplan_catalogs c
    cross join lateral jsonb_array_elements(c.payload->'subjects') s
    cross join lateral jsonb_array_elements(s.value->'items') l
    where c.catalog_id = ${schoolPlan.gym_basis.catalogId} and s.value->>'code' = 'MODO' and l.value->>'code' = 'MODO1000X'
    order by version desc limit 1`;
  assert.equal(course?.points, 100, 'Moderna språk – fortsättning, nivå 1 saknas i katalogversionen.');
  await tx`
    insert into public.valplans(id, unit_id, organizer_id, school_year, kind, name, catalog_id, revision)
    values(${valplan}, ${unit}, ${organizer}, ${year}, 'modernLanguage', 'Moderna språk SA26', ${schoolPlan.gym_basis.catalogId}, 1)`;
  await tx`
    insert into public.valplan_rows(valplan_id, unit_id, school_year, timplan_id, row_key, year)
    values(${valplan}, ${unit}, ${year}, ${id('sa:plan')}, 'block:mosp', 1)`;
  const saPupils = pupils.filter(pupil => pupil.program === 'sa');
  const perClass = classIds.map(classId => saPupils.filter(pupil => pupil.classId === classId));
  const parallelSet = id('modern-languages:parallel-set');
  for (const [position, language] of languages.entries()) {
    const languageCourse = id('course:' + language.code);
    const group = id('language-group:' + language.code);
    const name = language.name + ' · Moderna språk, fortsättning nivå 1';
    await tx`
      insert into public.valplan_courses(id, valplan_id, position, subject_code, subject_version, item_code, points, language_code, name, minutes_ht, minutes_vt)
      values(${languageCourse}, ${valplan}, ${position}, 'MODO', ${course.version}, 'MODO1000X', ${course.points},
             ${language.code}, ${name}, ${block.needHt}, ${block.needVt})`;
    await tx`
      insert into public.study_groups(id, unit_id, organizer_id, school_year, name, starts_on, ends_on,
        subject_code, subject_version, item_code, points, language_code, minutes_ht, minutes_vt, parallel_set_id,
        origin_kind, valplan_id, valplan_course_id, revision)
      values(${group}, ${unit}, ${organizer}, ${year}, ${language.name + ' SA26'}, ${startsOn}, ${endsOn},
             'MODO', ${course.version}, 'MODO1000X', ${course.points}, ${language.code}, ${block.needHt}, ${block.needVt},
             ${parallelSet}, 'valplan', ${valplan}, ${languageCourse}, 1)`;
    for (const classId of classIds) {
      await tx`insert into public.valplan_course_classes(course_id, class_id) values(${languageCourse}, ${classId})`;
      await tx`insert into public.study_group_classes(group_id, class_id) values(${group}, ${classId})`;
    }
    // Offset the second class by one so both teaching groups have 30 pupils.
    const members = perClass.flatMap((classPupils, index) =>
      classPupils.filter(pupil => (pupil.number + index) % 2 === position));
    assert.equal(members.length, 30);
    for (const pupil of members) {
      await tx`
        insert into public.study_group_memberships(id, group_id, parallel_set_id, unit_id, pupil_id, starts_on, ends_on, source, recorded_by_assignment_id)
        values(${id('study-member:' + pupil.id)}, ${group}, ${parallelSet}, ${unit}, ${pupil.id},
               ${startsOn}, ${endsOn}, 'manual', ${session.assignment_id})`;
    }
    await tx`
      insert into public.study_group_history(group_id, command_id, action, detail, actor_identity_id, assignment_id)
      select g.id, ${id('study-history:' + language.code)}, 'seed_synthetic', public.study_group_document(g),
             ${session.identity_id}, ${session.assignment_id} from public.study_groups g where g.id = ${group}`;
  }
  await tx`
    insert into public.valplan_versions(valplan_id, revision, document, actor_identity_id, assignment_id)
    select v.id, v.revision, public.valplan_document(v), ${session.identity_id}, ${session.assignment_id}
    from public.valplans v where v.id = ${valplan}`;
}

async function addStaffing(tx, session) {
  const distribution = id('distribution');
  const version = id('distribution:published');
  await tx`
    insert into public.tjanst_distributions(id, customer_id, organizer_id, unit_id, school_year, revision)
    values(${distribution}, ${customer}, ${organizer}, ${unit}, ${year}, 1)`;
  await tx`
    insert into public.tjanst_versions(id, distribution_id, version_no, status, created_by_identity_id, created_by_assignment_id)
    values(${version}, ${distribution}, 1, 'draft', ${session.identity_id}, ${session.assignment_id})`;
  const staff = teachers.map(name => ({ name, id: id('teacher:' + name), minutes: 0 }));
  for (const person of staff) {
    const employment = id('employment:' + person.name);
    await tx`
      insert into public.staff_people(id, customer_id, organizer_id, given_name, family_name, status, revision)
      values(${person.id}, ${customer}, ${organizer}, 'Testlärare', ${person.name}, 'active', 1)`;
    await tx`
      insert into public.staff_employments(id, customer_id, organizer_id, staff_person_id, percent, starts_on, ends_on)
      values(${employment}, ${customer}, ${organizer}, ${person.id}, 100, '2026-07-01', ${endsOn})`;
    await tx`
      insert into public.staff_school_duties(id, customer_id, organizer_id, staff_person_id, employment_id, unit_id, percent, starts_on, ends_on)
      values(${id('school-duty:' + person.name)}, ${customer}, ${organizer}, ${person.id}, ${employment}, ${unit}, 60,
             '2026-07-01', ${endsOn})`;
    await tx`insert into public.tjanst_version_teachers(version_id, staff_person_id) values(${version}, ${person.id})`;
  }
  const [{ basis, groups }] = await tx`
    select public.tjanst_class_source_basis(${unit}, ${year}) basis, public.tjanst_group_needs(${unit}, ${year}) groups`;
  assert.equal(basis.length, classes.length);
  assert.equal(groups.length, languages.length);
  const needs = basis.flatMap(c => c.needs.map(need => ({ need, schoolClass: c })));
  needs.push(...groups.map(need => ({ need, schoolClass: null })));
  const subjectTeacher = new Map();
  for (const { need, schoolClass } of needs) {
    assert.ok(!need.organizationPending && !need.stale && need.needHt !== null && need.needVt !== null, 'Ofullständigt behov ' + need.label);
    const minutes = need.needHt + need.needVt;
    if (minutes === 0) continue;
    // Reuse the teacher when parallel classes teach the same subject. For a new subject
    // start with the teacher whose allocated minutes are currently lowest.
    const subject = schoolClass ? need.rowKey.split(':').at(-1).replace(/\d.*$/, '') : need.groupId;
    const person = subjectTeacher.get(subject) ?? staff.reduce((a, b) => a.minutes <= b.minutes ? a : b);
    subjectTeacher.set(subject, person);
    person.minutes += minutes;
    const line = id('allocation:' + need.sourceKey);
    const link = schoolClass?.link;
    if (need.sourceKind === 'study_group') await tx`select public.study_group_freeze(${tx.json(need)})`;
    await tx`
      insert into public.tjanst_rows(id, version_id, lineage_id, staff_person_id, source_kind, source_key,
        class_id, school_year, link_revision, timplan_id, series_id, timplan_version, timplan_row_key, link_column,
        need_label, need_ht_minutes, need_vt_minutes, need_basis, teacher_ht_minutes, teacher_vt_minutes, group_id, group_revision, group_snapshot)
      values(${line}, ${version}, ${line}, ${person.id}, ${need.sourceKind}, ${need.sourceKey},
        ${schoolClass?.classId ?? null}, ${year}, ${link?.linkRevision ?? null}, ${link?.timplanId ?? null},
        ${link?.seriesId ?? null}, ${link?.timplanVersion ?? null}, ${need.rowKey}, ${link?.column ?? null},
        ${need.label}, ${need.needHt}, ${need.needVt}, ${need.needBasis}, ${need.needHt}, ${need.needVt},
        ${need.groupId ?? null}, ${need.groupRevision ?? null}, ${schoolClass ? null : tx.json(need)})`;
  }
  const [{ blockers }] = await tx`
    select public.tjanst_plan_blockers(a, v, ${unit}, ${year}, ${tx.json(basis)}) blockers
    from public.access_assignments a cross join public.tjanst_versions v where a.id = ${session.assignment_id} and v.id = ${version}`;
  assert.deepEqual(blockers, []);
  const [published] = await tx`
    select public.tjanst_plan_publish(a, s, d, jsonb_build_object('expectedContentHash', public.tjanst_version_hash(${version}))) id
    from public.access_assignments a cross join public.app_sessions s cross join public.tjanst_distributions d
    where a.id = ${session.assignment_id} and s.id = ${session.id} and d.id = ${distribution}`;
  assert.equal(published?.id, version);
}

async function addRooms(tx) {
  const [register] = await tx`select document, revision from public.school_room_registers where unit_id = ${unit}`;
  const document = register?.document ?? { nasta: 1, salar: [] };
  for (const room of newRooms) {
    if (document.salar.some(old => old.name.toLowerCase() === room.name.toLowerCase())) continue;
    document.salar.push({ id: 'sal-' + document.nasta++, ...room });
  }
  await tx`select public.school_rooms_save(${tx.json({
    contractVersion: 1, unitId: unit, commandId: id('room-register'), expectedRevision: register?.revision ?? 0, document,
  })})`;
}

async function verify(tx) {
  const result = await tx`
    select
      (select count(*)::integer from public.offerings where unit_id = ${unit} and id = any(${programs.map(p => id(p.key + ':offering'))}::uuid[])) programs,
      (select jsonb_object_agg(c.name, (select count(*) from public.pupil_class_memberships m where m.class_id = c.id
        and m.starts_on = ${startsOn} and m.ends_on = ${endsOn}))
       from public.school_classes c join public.class_timplans l on l.class_id = c.id and l.start_year = ${year}
       join public.timplans t on t.id = l.timplan_id and t.status = 'faststalld'
       join public.point_plans p on p.id = t.source_programplan_id and p.status = 'faststalld'
       where c.unit_id = ${unit} and c.id = any(${classes.map(c => id(c.name))}::uuid[]) and c.ends_on = ${endsOn}) classes,
      (select jsonb_object_agg(g.name, (select count(*) from public.study_group_memberships m where m.group_id = g.id and m.cancelled_at is null))
        from public.study_groups g where g.unit_id = ${unit} and g.school_year = ${year}
          and g.id = any(${languages.map(l => id('language-group:' + l.code))}::uuid[])) groups,
      (select count(*)::integer from public.staff_school_duties where unit_id = ${unit}
        and staff_person_id = any(${teachers.map(name => id('teacher:' + name))}::uuid[])) teachers,
      (select count(*)::integer
        from public.tjanst_rows r join public.tjanst_versions v on v.id = r.version_id and v.status = 'published'
        where r.version_id = ${id('distribution:published')} and r.staff_person_id is not null
          and r.need_ht_minutes = r.teacher_ht_minutes and r.need_vt_minutes = r.teacher_vt_minutes) allocations,
      (select count(*)::integer from public.school_room_registers r cross join lateral jsonb_array_elements(r.document->'salar') s
        where unit_id = ${unit} and (s.value->>'platser')::integer >= 31) rooms`;
  const verified = result[0];
  assert.equal(verified.programs, 3);
  assert.deepEqual(verified.classes, Object.fromEntries(classes.map(c => [c.name, c.pupils])));
  assert.deepEqual(verified.groups, Object.fromEntries(languages.map(l => [l.name + ' SA26', 30])));
  assert.equal(verified.teachers, teachers.length);
  assert.ok(verified.allocations >= 30, 'För få komplett fördelade behov.');
  assert.ok(verified.rooms >= 6, 'För få salar med tillräcklig kapacitet.');
  return verified;
}

const [mode, ...extra] = process.argv.slice(2);
if (!['--check', '--apply'].includes(mode) || extra.length) {
  throw new Error('Använd node work/pilot/seed-school-2026.mjs --check eller --apply.');
}
const target = await assertTarget('protected');
const db = postgres(target.dbUrl, { max: 1, prepare: false, connect_timeout: 8 });
const rollback = Symbol('roll back checked fixture');
let outcome;
try {
  await db.begin(async tx => {
    await tx`set local lock_timeout = '5s'`;
    await tx`select pg_advisory_xact_lock(hashtextextended(${unit}, 260627))`;
    const [school] = await tx`
      select u.name, u.code, c.name customer from public.school_units u
      join public.organizers o on o.id = u.organizer_id join public.customers c on c.id = o.customer_id
      where u.id = ${unit} and o.id = ${organizer} and c.id = ${customer}`;
    assert.deepEqual({ ...school }, { name: 'Nystartsgymnasiet', code: '33000013', customer: 'Syntetisk fas 3 kund 1' });
    const [calendar] = await tx`
      select ht_start::text, ht_end::text, vt_start::text, vt_end::text from public.school_years
      where unit_id = ${unit} and organizer_id = ${organizer} and start_year = ${year}
        and status = 'faststalld' and superseded_at is null
      order by version desc limit 1`;
    assert.equal(calendar?.ht_start, startsOn, 'Fastställd läsårsplan 2026/27 krävs.');
    const [distribution] = await tx`select id from public.tjanst_distributions where unit_id = ${unit} and school_year = ${year}`;
    if (distribution) {
      assert.equal(distribution.id, id('distribution'), 'Skolans befintliga tjänstefördelning får inte ersättas.');
      outcome = { mode: 'existing', ...await verify(tx) };
      return;
    }

    const session = await setActor(tx);
    await copyPlans(tx);
    const pupils = await addPupils(tx);
    await addLanguageGroups(tx, session, pupils);
    await addStaffing(tx, session);
    await addRooms(tx);
    await tx`set constraints all immediate`;
    outcome = { mode: mode === '--apply' ? 'applied' : 'rolled back', ...await verify(tx), calendar };
    if (mode === '--check') throw rollback;
  });
  console.log(JSON.stringify(outcome));
} catch (error) {
  if (error === rollback) console.log(JSON.stringify(outcome));
  else {
    // Database errors can include identifiers in both the message and the details.
    if (error.name === 'AssertionError') console.error(error.code, error.message);
    else console.error('Testorganisationen kunde inte installeras.', error.code ?? 'INVALID');
    process.exitCode = 1;
  }
} finally {
  await db.end({ timeout: 5 });
}
