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
