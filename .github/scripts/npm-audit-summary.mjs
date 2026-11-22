// Sammanställer npm audit för en paketkatalog som Markdown till jobbsammanfattningen.
// Användning: node .github/scripts/npm-audit-summary.mjs <katalog> <rubrik>
import { execFileSync } from 'node:child_process';

const [dir, title = dir] = process.argv.slice(2);
const levels = [
  ['critical', 'Kritiska'],
  ['high', 'Höga'],
  ['moderate', 'Måttliga'],
  ['low', 'Låga'],
];
const severity = { critical: 'kritisk', high: 'hög' };

function audit(args) {
  let out;
  try {
    out = execFileSync('npm', ['audit', '--json', ...args], { cwd: dir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (error) {
    out = error.stdout; // npm audit avslutar med 1 när sårbarheter finns
  }
  const report = JSON.parse(out);
  if (report.error) throw new Error(`npm audit misslyckades i ${dir}: ${report.error.summary}`);
  return report;
}

const app = audit(['--omit=dev']);
const all = audit([]);
const row = (label, report) =>
  `| ${label} | ${levels.map(([key]) => report.metadata.vulnerabilities[key]).join(' | ')} |`;

const serious = Object.entries(app.vulnerabilities)
  .filter(([, v]) => v.severity in severity)
  .map(([name, v]) => `\`${name}\` (${severity[v.severity]}${v.isDirect ? ', direkt' : ''})`);

console.log(`### ${title} (\`${dir}\`)

| Omfattning | ${levels.map(([, label]) => label).join(' | ')} |
|---|${levels.map(() => '---:').join('|')}|
${row('Utan utvecklarberoenden', app)}
${row('Alla beroenden', all)}

${serious.length ? `Kritiska och höga utan utvecklarberoenden: ${serious.join(', ')}` : 'Inga kritiska eller höga utan utvecklarberoenden.'}
`);
