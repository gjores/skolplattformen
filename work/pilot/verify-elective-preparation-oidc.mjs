#!/usr/bin/env node
// Release-bound preparation variant; delegates owned snapshot, real OIDC, workerd3015 and cleanup.
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyElectiveOidc } from './verify-elective-oidc.mjs';
export const verifyElectivePreparationOidc = options => verifyElectiveOidc({ ...options, preflight: false, variant: 'preparation' });
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  assert.deepEqual([args[0],args[2]], ['--build','--out']); assert.equal(args.length, 4);
  const result = await verifyElectivePreparationOidc({ build: args[1], out: args[3] });
  if (result.status !== 'PASS') process.exitCode = 1;
}
