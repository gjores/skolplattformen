import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeAuditDetails, auditRoute, requiresAudit } from './audit-details.ts';

test('tillåtna nycklar släpper inte igenom elevnamn eller fritext', () => {
  const secret='Syntetisk Elev Hemlig anteckning';
  const source=Object.fromEntries(['reason','path','code','status','action','from','to','key','proof','issuer','method','format','grants','assignmentId','organizerId','accessFunction'].map(k=>[k,secret]));
  assert.deepEqual(sanitizeAuditDetails(source),{});
  assert.deepEqual(sanitizeAuditDetails({grants:['larare',secret],count:Infinity,revokedSessions:-1,principalNamed:secret}),{});
});
test('minimerade verksamhetsvärden och referenser bevaras', () => {
  const input={code:'forbidden',path:'/api/kund',grants:['rektor','larare'],count:0,revokedSessions:2,emailMismatch:true,assignmentId:'33000000-0000-4000-8000-000000000041',from:null,to:'2026-09-24T08:00:00.000Z',format:'csv'};
  assert.deepEqual(sanitizeAuditDetails(input),input);
});
test('nästlade hemligheter och försök att injicera proof tas bort', () => {
  assert.deepEqual(sanitizeAuditDetails({reason:{code:'name'},count:{token:'secret'},proof:{result:'accepted'},cookie:'secret',grants:[{function:'larare'}]}),{});
});
test('routeklass innehåller aldrig användarens pathsegment eller query', () => {
  assert.equal(auditRoute('http://localhost/api/kund/elev/Hemlig?token=secret'),'/api/kund');
  assert.equal(auditRoute('http://localhost/api/Hemlig/namn'),'/api/other');
  assert.equal(auditRoute('http://localhost/api/logg?search=namn'),'/api/logg');
});
test('läsning kan kräva audit oberoende av mutation', () => {
  assert.equal(requiresAudit(false,'required'),true);
  assert.equal(requiresAudit(true),true);
  assert.equal(requiresAudit(false),false);
});

test('registerrutter och slutna metadata bevarar varje definierad åtgärd', async () => {
  const { PUPIL_REGISTER_ACTIONS, PUPIL_REGISTER_FIELDS } = await import('./audit-details.ts');
  assert.equal(auditRoute('https://example.test/api/elever/namn?search=Hemlig'), '/api/elever');
  for (const action of PUPIL_REGISTER_ACTIONS) {
    const input = { action, path: '/api/elever', schoolYear: 2026, count: 2, fields: [...PUPIL_REGISTER_FIELDS] };
    assert.deepEqual(sanitizeAuditDetails(input), input, action);
  }
  for (const field of PUPIL_REGISTER_FIELDS) assert.deepEqual(sanitizeAuditDetails({ field }), { field });
  for (const readForm of ['list', 'pupil', 'history', 'conflict', 'personal-number', 'export-preview', 'export'])
    assert.deepEqual(sanitizeAuditDetails({ readForm }), { readForm });
});

test('registermetadata tillåter varken värden, skyddsmarkörer eller felaktiga antal/läsår', () => {
  for (const secret of ['Syntetisk Hemlig', 'TEST-20100101-1234', '/api/elever/id?search=namn', true, { displayName: 'Hemlig' }]) {
    assert.deepEqual(sanitizeAuditDetails({ action: secret, field: secret, fields: ['displayName', secret], protectedIdentity: secret, value: secret, search: secret, source: secret }), {});
  }
  for (const schoolYear of [2026.5, -1, 0, 9999, 10000, '2026', Infinity]) assert.deepEqual(sanitizeAuditDetails({ schoolYear }), {});
  for (const count of [-1, 1.2, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.deepEqual(sanitizeAuditDetails({ count }), {});
  assert.deepEqual(sanitizeAuditDetails({ fields: Array(100).fill('displayName') }), {});
});
