// Syntetisk daterad modell -> egen riktig Rust-tjänst -> strikt kontrolltolkning. Ingen DB/Worker/OIDC påstås.
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { datumFixture } from '../../web/lib/schema-datum-fixture.mjs';
import { schemaDatumUnderlag } from '../../web/lib/schema-datum-underlag.ts';
import { parseSchemaCheck } from '../../web/lib/schema-contract.ts';
const binary = fileURLToPath(new URL('../../schemamotor/target/release/schemamotor-tjanst', import.meta.url));
export async function verifyDatum(out) {
  assert.ok(out.startsWith('/private/tmp/') || out.startsWith('/tmp/'));
  const port = 22000 + Math.floor(Math.random() * 15000), token = randomBytes(24).toString('hex'), url = `http://127.0.0.1:${port}`;
  const report = { kind: 'dated-schema-real-rust-http', status: 'FAIL', checks: [], limits: ['Synthetic model and own Rust process', 'No database, Worker, OIDC or browser claim'],
    binarySha256: createHash('sha256').update(readFileSync(binary)).digest('hex') };
  const service = spawn(binary, [], { env: { SCHEMAMOTOR_TOKEN: token, SCHEMAMOTOR_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' });
  const record = name => report.checks.push({ name, status: 'PASS' });
  try {
    for (let tries = 0; ; tries++) { try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* egen process startar */ }
      assert.ok(tries < 50, 'own Rust service did not start'); await new Promise(r => setTimeout(r, 100)); }
    async function check(x, changes, dates = []) {
      const prepared = schemaDatumUnderlag(x.plan, x.underlag, x.f, x.datedBasis, changes, dates), results = new Map();
      for (const day of prepared.days) {
        const payload = { problem: day.problem, placements: day.placements.map(p => ({ lesson: p.lesson, day: p.day, start_min: p.startMin, rooms: p.room ? [p.room] : [] })) };
        assert.ok(!JSON.stringify(payload).includes('73111600') && !JSON.stringify(payload).includes('pupilId') && !JSON.stringify(payload).includes('Franska'));
        if (!day.problem.lessons.length) { results.set(day.date, { day, violations: [] }); continue; }
        const response = await fetch(`${url}/v1/validate`, { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        const raw = await response.json(); assert.equal(response.status, 200, `Rust rejected dated problem: ${JSON.stringify(raw).slice(0, 300)}`);
        results.set(day.date, { day, ...parseSchemaCheck(raw, day.problem) });
      }
      return results;
    }
    const base = datumFixture(), first = await check(base, [base.change('2026-11-02')]);
    assert.deepEqual([...first.keys()], ['2026-11-02', '2026-11-03']);
    const beforeSwitch = first.get('2026-11-02'), pairs = beforeSwitch.violations.filter(v => v.code === 'student_clash').map(v => v.lessons.map(id => beforeSwitch.day.occurrences.get(id).lesson.id));
    assert.ok(pairs.some(ids => ids.includes(base.of('Matematik').id) && ids.includes(base.of('Franska').id)));
    assert.ok(pairs.every(ids => !ids.includes(base.of('Historia').id))); assert.equal(first.get('2026-11-03').day.problem.lessons.length, 0);
    record('inclusive final class day collides with class A only; removed original day is fully projected empty');
    const after = (await check(base, [base.change('2026-11-16')])).get('2026-11-16');
    const afterPairs = after.violations.filter(v => v.code === 'student_clash').map(v => v.lessons.map(id => after.day.occurrences.get(id).lesson.id));
    assert.ok(afterPairs.some(ids => ids.includes(base.of('Historia').id) && ids.includes(base.of('Franska').id)));
    assert.ok(afterPairs.every(ids => !ids.includes(base.of('Matematik').id)));
    assert.ok(after.violations.some(v => v.code === 'room_clash'));
    record('class change moves actual student clash to class B and occupied room is detected only on target date');
    const zero = datumFixture(); zero.datedBasis.memberships[0].endsOn = '2026-11-16';
    const empty = (await check(zero, [], ['2026-11-17'])).get('2026-11-17');
    assert.ok([...empty.day.occurrences.values()].some(o => o.lesson.id === zero.of('Franska').id)); assert.equal(empty.violations.length, 0);
    record('group with zero dated participants retains teaching identity and is accepted by real motor without invented pupils');
    const cross = (await check(base, [base.change('2027-01-12')])).get('2027-01-12');
    assert.equal(cross.day.problem.periods, undefined); assert.ok(cross.day.problem.lessons.every(l => l.periods === undefined));
    assert.ok(cross.violations.some(v => v.code === 'teacher_clash'));
    record('autumn occurrence moved to spring collides with actual spring teaching after period isolation is removed');
    const short = datumFixture(), lesson = short.of('Franska');
    short.f.trims = [{ lesson: lesson.id, term: 'ht', fixedMin: 0, extraCount: 1, extraMin: 5, occasions: [{ date: '2026-11-03', minutes: lesson.durationMin - 5 }] }];
    short.of('Matematik').startMin = 540; short.of('Historia').startMin = 600;
    const actual = (await check(short, [short.change('2026-11-02', { startMin: 535, durationMin: 5 })])).get('2026-11-02');
    assert.ok(actual.day.problem.lessons.some(l => l.duration_min === 5)); assert.equal(actual.violations.some(v => v.code === 'student_clash'), false);
    record('real validator uses shortened five-minute duration and accepts touching teaching intervals without false overlap');
    report.status = 'PASS';
  } catch (error) { report.failure = String(error.message).slice(0, 700); }
  finally {
    const exit = new Promise(resolve => service.once('exit', resolve)); service.kill(); await Promise.race([exit, new Promise(resolve => setTimeout(resolve, 2000))]);
    if (service.exitCode === null && service.signalCode === null) { service.kill('SIGKILL'); await exit; }
    report.cleanup = service.exitCode !== null || service.signalCode !== null ? 'complete' : 'failed';
    if (report.cleanup !== 'complete') report.status = 'FAIL'; writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
  }
  console.log(JSON.stringify({ status: report.status, checks: report.checks.length, cleanup: report.cleanup, failure: report.failure, report: out }));
  if (report.status !== 'PASS') process.exitCode = 1; return report;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2); assert.ok(args.length === 2 && args[0] === '--out'); await verifyDatum(args[1]);
}
