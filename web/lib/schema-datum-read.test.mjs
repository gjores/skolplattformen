// Riktig daterad läsadapter, avsiktligt syntetisk SQL och säkerhetsklasser. HTTP-/SQL-kedjan prövas separat.
import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import { SCHEMA_CONTRACT_VERSION } from './schema-contract.ts';
import { parseSchemaDatumRequest } from './schema-datum.ts';
import { parseSchemaSalRequest } from './schema-salar.ts';
import { datumFixture } from './schema-datum-fixture.mjs';
const server = new URL('./server/', import.meta.url);
registerHooks({ load(url, context, next) {
  if (url === new URL('db.ts', server).href) return { format: 'module', shortCircuit: true, source: 'export class Deny extends Error { constructor(code,status){super(code);this.code=code;this.status=status;} }' };
  if (url === new URL('authz.ts', server).href) return { format: 'module', shortCircuit: true, source: 'export class AuditUnavailable extends Error {}' };
  return next(url, context);
} });
const { readSchemaDatedBasis } = await import('./server/schema-datum-read.ts');
test('datum- och salsökningsbegäran projiceras till exakt skolurval före den strikta SQL-ingången', async () => {
  const x = datumFixture(), ctx = { identityId: x.id(100), assignmentId: x.id(101), accessFunction: 'rektor' }, sent = [];
  const tx = async (_strings, input) => { sent.push(input); return [{ result: { contractVersion: 'schema_dated_basis_sql_v1', actor: { identityId: ctx.identityId, assignmentId: ctx.assignmentId }, result: x.datedBasis } }]; };
  tx.json = value => value;
  const base = { ...x.request, contractVersion: SCHEMA_CONTRACT_VERSION, grundFingerprint: x.f.grundFingerprint, placements: x.placements };
  const date = parseSchemaDatumRequest({ ...base, datedOverrides: [x.change()], dates: ['2026-11-03'] });
  const room = parseSchemaSalRequest({ ...base, lesson: x.of('Franska').id, target: { day: 2, startMin: 480 }, datedTarget: { originalDate: '2026-11-03', date: '2026-11-04' }, datedOverrides: [] });
  for (const input of [date, room]) assert.equal((await readSchemaDatedBasis(tx, ctx, input)).body.unitId, x.request.unitId);
  assert.deepEqual(sent, Array(2).fill({ unitId: x.request.unitId, schoolYear: x.request.schoolYear }));
});
