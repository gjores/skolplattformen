// Synthetic BF draft against the already installed APL schema. No legacy approval bypass.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { classFixture } from './verify-class-timplans.mjs';
import { vocationalFixture } from './vocational-plan-fixture.mjs';

export async function aplUxFixture(tx) {
  const f = await classFixture(tx), { id, actor } = f;
  const catalog = JSON.parse(readFileSync(new URL('../../web/lib/programplan-catalog.generated.json', import.meta.url), 'utf8'));
  const [{ catalog_id: catalogId }] = await tx`select catalog_id from public.point_plans where id=${id(50)}`;
  const { reference, rows, terms } = vocationalFixture(catalog, 'BF25', catalogId);
  await tx`insert into public.offerings(id,organizer_id,unit_id,kind,name,cohort,program_code,orientation_code,start_year)
    values(${id(46)},${id(2)},${id(30)},'gymnasium','Syntetisk APL UX','Syntetisk framtida kull','BF25',${reference.orientationCode},${Number(reference.startedOn.slice(0,4))})`;
  const created = (await tx`select public.phase5_create_programplan_draft(${id(46)},0,${tx.json(reference)}) result`)[0].result;
  const programId = created.id;
  await actor('principal');
  await tx`select public.phase5_write_programplan_terms(${programId},0,${tx.json(terms)})`;
  const decision = async (kind, planId, action) => {
    const b = (await tx`select public.phase5_plan_decision_basis(${kind},${planId}) result`)[0].result, d = b.result ?? b.detail ?? b;
    return (await tx`select public.phase5_plan_decision_command(${tx.json({ kind, planId, commandId: randomUUID(), action,
      expectedRevision: d.revision, expectedDecisionRevision: d.decisionRevision, basisHash: d.basisHash, comment: '', confirmedChecks: d.checks.map(c => c.id) })}) result`)[0].result;
  };
  await decision('programplan', programId, 'submit');
  await actor('hm'); await decision('programplan', programId, 'approve');
  await actor('principal');
  const [{ revision }] = await tx`select revision from public.point_plans where id=${programId}`;
  const made = (await tx`select public.phase5_create_gym_timplan(${randomUUID()},${programId},${revision},0,${id(30)},null,null) result`)[0].result;
  const planId = made.reply.id;
  let planRevision = 0;
  for (const row of rows) {
    const hours = terms.find(t => t.rowKey === row.key).points.map(p => p > 0 ? p : null);
    planRevision = (await tx`select public.phase5_write_gym_timplan_row(${planId},${planRevision},${row.key},${tx.json(hours)}) result`)[0].result.revision;
  }
  assert.equal((await tx`select status from public.timplans where id=${planId}`)[0].status, 'utkast');
  return { ...f, programId, planId, decision, year: Number(reference.startedOn.slice(0,4)) - (reference.startedOn.slice(5,7) < '07' ? 1 : 0) };
}

export async function seedAplUxActualFixture(snapshot) {
  assert.match(snapshot.provenance.database, /^named_timplan_[0-9a-f]{32}$/u);
  assert.equal((await snapshot.db`select current_database() name`)[0].name, snapshot.provenance.database);
  return snapshot.db.begin(async tx => {
    const f = await aplUxFixture(tx);
    await tx`set constraints all immediate`;
    return { ids: Object.fromEntries([1,2,10,11,12,13,20,21,22,23,30,31,46].map(n => [n, f.id(n)])),
      roles: f.roles, programId: f.programId, planId: f.planId, year: f.year };
  });
}
