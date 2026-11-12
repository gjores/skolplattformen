// Kedjeprov för 05.2-SM-KOPPLING med syntetiska uppgifter: tjänstefördelning → underlag → schemamotor-tjanst över HTTP
// → appens strikta tolkning → motorns fristående kontrollant. Ingen databas och inga verkliga uppgifter.
// Kör från web/: node ../work/schema/verify-koppling.mjs   (kräver `cargo build --release` i schemamotor/)
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import assert from 'node:assert/strict';
import { buildSchemaUnderlag, schemaForslag } from '../../web/lib/schema-underlag.ts';
import { parseSchemaForslag, parseSchemaSolution } from '../../web/lib/schema-contract.ts';

const bin = new URL('../../schemamotor/target/release/', import.meta.url).pathname;
const uid = n => `52a10000-0000-4000-8000-${String(n).padStart(12, '0')}`, h = n => n * 60;
const SUBJECTS = [['sv', 'Svenska', 54], ['ma', 'Matematik', 54], ['en', 'Engelska', 45], ['idh', 'Idrott och hälsa', 36], ['hi', 'Historia', 36], ['sh', 'Samhällskunskap', 36],
  ['nk', 'Naturkunskap', 36], ['re', 'Religionskunskap', 27], ['pr', 'Programämne', 108]];
const CLASSES = 12, TEACHERS = 24;
const classKey = (c, row) => `class_timplan:${uid(100 + c)}:2026:${row}`;
const classes = [], rows = [];
for (let c = 0; c < CLASSES; c++) {
  classes.push({ classId: uid(100 + c), name: `Klass ${c + 1}`, link: null, aplMinutes: null,
    needs: SUBJECTS.map(([row, label, hours]) => ({ sourceKind: 'class_timplan', sourceKey: classKey(c, row), rowKey: row, label, needHt: h(hours), needVt: h(hours), needBasis: 'terms' })) });
  SUBJECTS.forEach(([row, , hours], s) => rows.push({ id: uid(1000 + rows.length), lineageId: uid(5000 + rows.length), sourceKind: 'class_timplan', sourceKey: classKey(c, row), classId: uid(100 + c), rowKey: row,
    personId: s === 3 && c === 0 ? null : uid(200 + (s * 3 + c) % TEACHERS), teacherHt: h(hours), teacherVt: h(hours), needHt: h(hours), needVt: h(hours), needBasis: 'terms', stale: false, jointGroupId: null, comment: '' }));
}
const plan = { contractVersion: 1, unitId: uid(1), schoolName: 'Provskolan', schoolYear: 2026, revision: 1,
  version: { id: uid(2), versionNo: 1, status: 'draft', contentHash: 'x', basedOnVersionId: null, publishedByName: null, publishedAt: null }, versions: [],
  teachers: Array.from({ length: TEACHERS }, (_, i) => ({ personId: uid(200 + i), displayName: `Provlärare ${i + 1}`, draft: false, shareHere: 100 })),
  classes, rows, groups: [], specials: [], joints: [], actions: [], blockers: [], capabilities: { canEdit: true, canPublish: false, canReadHistory: true }, sharing: [] };
const request = { unitId: uid(1), schoolYear: 2026, term: 'ht', weeks: 18 };

const token = randomBytes(24).toString('hex'), port = 20000 + Math.floor(Math.random() * 20000), url = `http://127.0.0.1:${port}`;
const service = spawn(join(bin, 'schemamotor-tjanst'), [], { env: { SCHEMAMOTOR_TOKEN: token, SCHEMAMOTOR_ADDR: `127.0.0.1:${port}` }, stdio: 'ignore' });
try {
  for (let i = 0; ; i++) {
    try { if ((await fetch(`${url}/v1/health`)).ok) break; } catch { /* startar */ }
    assert.ok(i < 50, 'tjänsten startade inte');
    await new Promise(r => setTimeout(r, 100));
  }
  const underlag = buildSchemaUnderlag(plan, request), body = JSON.stringify(underlag.problem);
  assert.equal((await fetch(`${url}/v1/solve`, { method: 'POST', body })).status, 401);
  const response = await fetch(`${url}/v1/solve?time_ms=10000`, { method: 'POST', headers: { Authorization: `Bearer ${token}` }, body });
  assert.equal(response.status, 200);
  const raw = await response.json(), solution = parseSchemaSolution(raw, underlag.problem);
  const forslag = parseSchemaForslag(JSON.parse(JSON.stringify(schemaForslag(plan, request, underlag, solution))), request);
  const dir = mkdtempSync(join(tmpdir(), 'schema-koppling-'));
  writeFileSync(join(dir, 'underlag.json'), body); writeFileSync(join(dir, 'resultat.json'), JSON.stringify(raw));
  const check = spawnSync(join(bin, 'schemamotor'), ['validate', join(dir, 'underlag.json'), join(dir, 'resultat.json')], { encoding: 'utf8' });
  console.log(JSON.stringify({ status: forslag.status, ...forslag.metrics, elapsedMs: forslag.elapsedMs, classes: forslag.classes.length, teachers: forslag.teachers.length,
    validatorExit: check.status, validator: (check.stdout + check.stderr).trim().split('\n').slice(-3) }, null, 1));
  assert.equal(check.status, 0, 'kontrollanten godkände inte resultatet');
  // Valfritt: spara det namnsatta förslaget som syntetiskt underlag för vyns prov.
  if (process.env.SCHEMA_FORSLAG_OUT) writeFileSync(process.env.SCHEMA_FORSLAG_OUT, JSON.stringify(forslag));
  assert.equal(forslag.status, 'complete');
} finally { service.kill(); }
