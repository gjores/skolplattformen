#!/usr/bin/env node
// Skriver endast aktuell sexsiffrig provkod. TOTP-hemligheten stannar i det
// privata manifestet och visas aldrig i terminalen.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertTarget } from './verify-target.mjs';

const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const requireFromWeb = createRequire(path.join(root, 'web', 'package.json'));
const { TOTP, Secret } = requireFromWeb('otpauth');

const argv = process.argv.slice(2);
let username = null;
for (let i = 0; i < argv.length; i++) {
  if (argv[i] === '--user') username = argv[++i];
  else if (argv[i].startsWith('--user=')) username = argv[i].slice('--user='.length);
  else {
    console.error('Användning: node work/pilot/idp-otp.mjs --user <användarnamn>');
    process.exit(1);
  }
}

try {
  const manifest = await assertTarget('protected', { requireRunning: false });
  const user = manifest.idp?.users?.find(candidate => candidate.username === username);
  if (!user?.totp || typeof manifest.idp?.totpSecret !== 'string') throw new Error('Användaren har ingen TOTP i provmiljön.');
  const enrolledPath = path.join(root, 'work', 'pilot', 'targets', 'protected', 'idp', 'totp-users.json');
  let base32 = manifest.idp.totpSecret;
  try {
    const enrolled = JSON.parse(fs.readFileSync(enrolledPath, 'utf8'));
    if (typeof enrolled[username] === 'string') base32 = enrolled[username];
  } catch {
    // Äldre importerad fixtur använder manifestets privata reservvärde.
  }
  const totp = new TOTP({ algorithm: 'SHA1', digits: 6, period: 30, secret: Secret.fromBase32(base32) });
  console.log(totp.generate());
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
