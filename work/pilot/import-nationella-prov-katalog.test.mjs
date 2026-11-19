import assert from 'node:assert/strict';
import test from 'node:test';
import { parseSkolverketsProvdatum, provkatalogDigest } from './import-nationella-prov-katalog.mjs';

const headers = ['Ämne och nivå/kurs', 'Delprov', 'Vecka', 'Datum', 'Tidsåtgång'];
const row = (tag, cells) => '<tr>' + cells.map(cell => `<${tag}>${cell}</${tag}>`).join('') + '</tr>';
const table = (year, rows, titles = headers) => `<h2>Datum för läsåret ${year}</h2>
  <table><caption>Läsåret ${year}</caption><thead>${row('th', titles)}</thead>
  <tbody>${rows.map(cells => row('td', cells)).join('')}</tbody></table>`;
const engelska = ['Engelska nivå 1', 'C', '48', '<p>tis 24 nov 2026</p><p>kl 9.00</p>', '80&nbsp;min'];
const svenska1 = 'Svenska nivå 1 / svenska som andraspråk nivå 1';
const svenska3 = 'Svenska 3/svenska som andraspråk 3';

test('läser provtabeller per läsår och behåller delprovsidentiteten när datumet flyttas', () => {
  const later = ['Engelska nivå 1', 'C', '47', 'tis 23 nov 2027 kl 09:00', '80 min'];
  const unrelated = '<table><tr><th>Program</th><th>Prov</th></tr><tr><td>Gymnasieskola</td><td>Engelska</td></tr></table>';
  const input = table('2027/28', [later]) + unrelated + table('2026/27', [engelska]);
  const parsed = parseSkolverketsProvdatum(input);
  assert.deepEqual(parsed.map(c => c.schoolYear), [2026, 2027]);
  assert.equal(parsed[0].prov[0].id, 'engelska1-c-ht');
  assert.deepEqual(parsed[0].prov[0].tid, { typ: 'fast', datum: '2026-11-24' });
  assert.equal(parsed[0].prov[0].nivaer[0].niva, 'ENGE1000X');
  assert.equal(parsed[0].prov[0].tidsatgang, '80 min');
  const moved = parseSkolverketsProvdatum(input.replace('tis 24 nov 2026', 'ons 25 nov 2026'));
  assert.equal(moved[0].prov[0].id, parsed[0].prov[0].id);
  assert.notEqual(provkatalogDigest(moved), provkatalogDigest(parsed));
  assert.equal(provkatalogDigest(parseSkolverketsProvdatum(input.replace('80&nbsp;min', '<p>80 min</p>'))), provkatalogDigest(parsed));
});

test('tolkar terminsveckor och härleder gränser från de relaterade delprovens tider', () => {
  const html = table('2026/27', [
    [svenska1, 'A', '-', 'från vecka 45, genomförs före delprov B och C', '10 min'],
    [svenska1, 'B', '49', 'mån 30 nov 2026 kl 9.00', '120 min'],
    [svenska1, 'C', '49', 'fre 4 dec 2026 kl 9.00', '180 min'],
    [svenska3, 'A', '46', 'tis 10 nov 2026 kl 9.00', '240 min'],
    [svenska3, 'B', '-', 'genomförs efter delprov A', '10 min per elev'],
    ['Engelska nivå 1', 'A', '-', 'från vecka 11', '15 min per elevpar'],
  ]);
  const [{ prov }] = parseSkolverketsProvdatum(html);
  const byId = Object.fromEntries(prov.map(entry => [entry.id, entry]));
  assert.deepEqual(byId['engelska1-a-vt'].tid, { typ: 'period', fran: '2027-03-15' });
  assert.deepEqual(byId['svenska1-a-ht'].tid, { typ: 'period', fran: '2026-11-02', till: '2026-11-30', senasteSlutMin: 540 });
  assert.deepEqual(byId['svenska3-b-ht'].tid, { typ: 'period', fran: '2026-11-10', tidigasteStartMin: 780 });
});

test('avbryter hela hämtningen vid okänd tabell, tvetydig tid eller ofullständiga provuppgifter', () => {
  for (const [html, message] of [
    [table('2026/27', [engelska], headers.slice(1)), /Okänd eller upprepad provtabell/u],
    [table('2026/28', [engelska]), /Ogiltigt årtal/u],
    ['<h2>Datum för läsåret 2025/26</h2>' + table('2026/27', [engelska]), /saknar en läsbar provtabell/u],
    [table('2026/27', [['Engelska nivå 99', ...engelska.slice(1)]]), /Okänt ämne/u],
    [table('2026/27', [engelska, engelska]), /samma identitet/u],
    [table('2026/27', [engelska]).replace('kl 9.00', 'kl 8.60'), /fast provstart/u],
    [table('2026/27', [engelska]).replace('tis 24 nov', 'ons 24 nov'), /veckodag skiljer sig/u],
    [table('2026/27', [engelska]).replace('>48<', '>47<'), /veckonummer skiljer sig/u],
    [table('2026/27', [[svenska1, 'A', '-', 'från vecka 45, genomförs före delprov B och C', '10 min']]), /saknar fasta delprov/u],
    [table('2026/27', [[svenska3, 'B', '-', 'genomförs efter delprov A', '10 min']]), /saknar entydigt föregående delprov/u],
  ]) assert.throws(() => parseSkolverketsProvdatum(html), message);
});
