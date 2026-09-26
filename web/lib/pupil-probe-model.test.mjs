import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProbeQuery, probeCsv, toProbePupil, PROBE_FIELDS } from './pupil-probe-model.ts';
import { sanitizeAuditDetails, auditRoute } from './server/audit-details.ts';

const id = '33000000-0000-4000-8000-000000000211';
const caseId = '33000000-0000-4000-8000-000000000411';
const base = 'http://127.0.0.1/api/prov/elev';

test('elevprovet tar endast elev- och ärende-ID som UUID', () => {
  assert.deepEqual(parseProbeQuery(base), { form: 'list' });
  assert.deepEqual(parseProbeQuery(`${base}?elev=${id}`), { form: 'pupil', pupilId: id });
  assert.deepEqual(parseProbeQuery(`${base}?arende=${caseId}`), { form: 'case', caseId, pupilId: null });
  for (const query of [`?elev=x`, `?unitId=${id}`, `?elev=${id}&elev=${id}`, `?arende=${id}&falt=namn`, '?customerId=1']) {
    assert.equal(parseProbeQuery(`${base}${query}`), null);
  }
});

test('endast explicit fältlista följer med från SQL-raden', () => {
  const pupil = toProbePupil({ id, display_name: 'Syntetisk elev', unit_id: caseId, group_ids: null, personnummer: 'x', notes: 'y' });
  assert.deepEqual(Object.keys(pupil), [...PROBE_FIELDS]);
  assert.deepEqual(pupil.groupIds, []);
});

test('export neutraliserar formler och har fast rubrik', () => {
  const csv = probeCsv([{ id, displayName: '=HYPERLINK("x")', unitId: caseId, groupIds: [] }]);
  assert.ok(csv.startsWith('﻿elev_id;namn;skolenhet_id;grupp_id\r\n'));
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`));
});

test('elevprovets audit har sluten form och egen routeklass', () => {
  assert.deepEqual(sanitizeAuditDetails({ count: 1, readForm: 'case', name: 'Syntetisk elev', format: 'csv' }), { count: 1, readForm: 'case', format: 'csv' });
  assert.deepEqual(sanitizeAuditDetails({ readForm: 'annat' }), {});
  assert.equal(auditRoute(`${base}?elev=${id}`), '/api/prov');
  assert.deepEqual(sanitizeAuditDetails({ code: 'audit_unavailable' }), { code: 'audit_unavailable' });
});
