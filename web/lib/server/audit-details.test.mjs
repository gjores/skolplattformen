import test from 'node:test';
import assert from 'node:assert/strict';
import { auditRoute, sanitizeAuditDetails, requiresAudit } from './audit-details.ts';
const unitId = '51a90000-0000-4000-8000-000000000004';
test('tjanst audit retains only exact operation mode, route, school/year and count', () => {
  for (const mode of ['catalog', 'row', 'batch']) {
    assert.deepEqual(sanitizeAuditDetails({ mode, unitId, schoolYear: 2026, count: 100, path: '/api/tjanst', personId: unitId,
      displayName: 'Syntetiskt namn', payload: { secret: 'text' }, suggestions: [], evidenceHash: 'sha256:private', choice: 'manual' }),
    { mode, unitId, schoolYear: 2026, count: 100, path: '/api/tjanst' });
  }
  assert.equal(auditRoute('http://localhost/api/tjanst/plan/forhandsvisa?person=private'), '/api/tjanst');
  assert.equal(auditRoute('http://localhost/api/private/person'), '/api/other');
  assert.equal(requiresAudit(false, 'required'), true);
});
test('mode/route whitelist cannot carry names, arrays, objects or arbitrary nested paths', () => {
  for (const mode of ['Syntetiskt namn', 'manual', 'catalog/person', ['catalog'], { mode: 'catalog' }, null, 1]) assert.deepEqual(sanitizeAuditDetails({ mode }), {});
  for (const path of ['/api/tjanst/plan/forhandsvisa', '/api/tjanst?person=private', '/api/private']) assert.deepEqual(sanitizeAuditDetails({ path }), {});
  for (const count of [-1, 1.5, Infinity, NaN, '100']) assert.deepEqual(sanitizeAuditDetails({ count }), {});
});
