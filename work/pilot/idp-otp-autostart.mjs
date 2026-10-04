// Startar provkodshjälpen automatiskt via launchd (macOS) så att kodknappen på den
// lokala test-IdP:n fungerar utan en terminal. Hjälpen själv kontrollerar mål,
// IdP-container, loopbackbindning och temats aktiveringsfil; den stängs av med --disable.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const LABEL = 'se.skolplattform.idp-otp-helper';
const root = path.resolve(fileURLToPath(import.meta.url), '../../..');
const plist = path.join(os.homedir(), 'Library/LaunchAgents', `${LABEL}.plist`);
const log = path.join(root, 'work/pilot/targets/protected/idp/otp-helper.log');
const domain = `gui/${process.getuid()}`;
const mode = process.argv[2];
const xml = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const launchctl = (...args) => execFileSync('launchctl', args, {stdio: 'pipe', encoding: 'utf8'});
const loaded = () => {try {launchctl('print', `${domain}/${LABEL}`); return true;} catch {return false;}};

if (process.platform !== 'darwin') throw Error('Automatisk start finns bara för macOS');
if (mode === '--enable') {
  if (Number(process.versions.node.split('.')[0]) < 25) throw Error('Kör med node 25 (se web/)');
  // Docker och node ligger utanför launchd:s standard-PATH.
  const envPath = [path.dirname(process.execPath), '/usr/local/bin', '/opt/homebrew/bin', '/usr/bin', '/bin'].join(':');
  fs.writeFileSync(plist, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${xml(process.execPath)}</string><string>work/pilot/idp-otp-helper.mjs</string></array>
  <key>WorkingDirectory</key><string>${xml(root)}</string>
  <key>EnvironmentVariables</key><dict><key>PATH</key><string>${xml(envPath)}</string></dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>${xml(log)}</string>
  <key>StandardErrorPath</key><string>${xml(log)}</string>
</dict></plist>
`, {mode: 0o600});
  if (loaded()) launchctl('bootout', `${domain}/${LABEL}`);
  launchctl('bootstrap', domain, plist);
  console.log('Provkodshjälpen startar nu automatiskt vid inloggning och startas om om den stannar.');
} else if (mode === '--disable') {
  if (loaded()) launchctl('bootout', `${domain}/${LABEL}`);
  fs.rmSync(plist, {force: true});
  console.log('Automatisk start av provkodshjälpen avstängd.');
} else if (mode === '--status') {
  console.log(loaded() ? 'Automatisk start: på' : 'Automatisk start: av');
} else {
  throw Error('Ange --enable, --disable eller --status');
}
